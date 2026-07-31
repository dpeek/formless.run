import {
  INSTANCE_ARCHIVE_KIND,
  type AppArchive,
  type AppArchiveData,
  type AppArchiveMediaObject,
  type ArchiveControlPlaneValidationOptions,
  type ArchiveRestorePolicy,
  type ArchivedAppInstall,
  type InstanceArchive,
  type PortableArchive,
} from "./types.ts";
import { parseAppArchive, parseInstanceArchive, parsePortableArchive } from "./types.ts";
import { appArchiveMediaReferences } from "./media-references.ts";
import {
  type AppInstall,
  type AppPackageResolver,
  type InstallableAppPackage,
} from "@dpeek/formless-installed-apps";
import { getAppSchemaDefinitionIndex, isValidStoredFieldValue } from "@dpeek/formless-schema";
import type { RecordValues, StoredRecord } from "@dpeek/formless-storage";
import type { AppSchema, FieldSchema } from "@dpeek/formless-schema";
import {
  CORE_IMAGE_KEY_PREFIX,
  MEDIA_DOCUMENT_UPLOAD_MAX_BYTES,
  MEDIA_IMAGE_UPLOAD_MAX_BYTES,
  MEDIA_PDF_CONTENT_TYPE,
  coreImageMediaDeliveryFactsForAssetId,
  coreMediaHrefForKey,
  documentMediaDeliveryFactsForAssetId,
  imageMediaContentTypeForKey,
  isDocumentMediaAsset,
  isRestorableDocumentMediaKey,
  isRestorableImageMediaKey,
  validatePdfDocumentMediaFile,
} from "@dpeek/formless-media";

export type ArchiveRestoreMediaFile = {
  archivePath: string;
  byteSize: number;
  bytes?: Uint8Array;
  contentType: string;
};

export type ArchiveRestoreTargetState = {
  controlPlaneSnapshotContract?: ArchiveControlPlaneValidationOptions["controlPlaneSnapshotContract"];
  installedApps?: readonly AppInstall[];
  mediaFiles?: readonly ArchiveRestoreMediaFile[];
  packageResolver?: AppPackageResolver;
  packages?: readonly InstallableAppPackage[];
  sourceSchemas?: Partial<Record<string, AppSchema>>;
};

export type ArchiveRestorePlanErrorCode =
  | "broken-reference"
  | "duplicate-archive-install-id"
  | "duplicate-media-object"
  | "duplicate-record-id"
  | "invalid-archive"
  | "invalid-media"
  | "invalid-record"
  | "install-collision"
  | "missing-media-object"
  | "missing-source-schema"
  | "schema-mismatch"
  | "unique-constraint"
  | "unsupported-package";

export type ArchiveRestorePlanError = {
  appInstallId?: string;
  code: ArchiveRestorePlanErrorCode;
  entity?: string;
  field?: string;
  message: string;
  recordId?: string;
  storageKey?: string;
};

export type ArchiveRestoreAppAction = "create" | "replace";

export type ArchiveRestoreRecordCounts = {
  active: number;
  byEntity: Record<string, number>;
  tombstoned: number;
  total: number;
};

export type ArchiveRestoreAppPlan = {
  action: ArchiveRestoreAppAction;
  app: AppInstall;
  dataKind: AppArchiveData["kind"];
  mediaCount: number;
  recordCounts: ArchiveRestoreRecordCounts;
  schemaKey: string;
  schemaUpdatedAt: string;
};

export type ArchiveRestorePlanStep =
  | {
      install: AppInstall;
      kind: "createInstall";
    }
  | {
      install: AppInstall;
      kind: "replaceInstall";
    }
  | {
      appInstallId: string;
      archivePath: string;
      asset?: AppArchiveMediaObject["asset"];
      byteSize: number;
      contentType: string;
      deliveryHref: string;
      kind: "restoreMedia";
      storageKey: string;
    }
  | {
      archivePath: string;
      asset?: AppArchiveMediaObject["asset"];
      byteSize: number;
      contentType: string;
      deliveryHref: string;
      kind: "restoreMedia";
      program: true;
      storageKey: string;
    }
  | {
      appInstallId: string;
      dataKind: AppArchiveData["kind"];
      kind: "restoreAppData";
      packageAppKey: string;
      recordCount: number;
      schemaKey: string;
      tombstoneCount: number;
    };

export type ArchiveRestorePlanSummary = {
  appCount: number;
  createdInstalls: string[];
  mediaCountsByApp: Record<string, number>;
  programMediaCount: number;
  recordCountsByApp: Record<string, ArchiveRestoreRecordCounts>;
  replacedInstalls: string[];
};

export type ArchiveRestorePlan = {
  dryRun: boolean;
  policy: ArchiveRestorePolicy;
  apps: ArchiveRestoreAppPlan[];
  steps: ArchiveRestorePlanStep[];
  summary: ArchiveRestorePlanSummary;
};

export type ArchiveRestorePlanResult =
  | {
      ok: true;
      plan: ArchiveRestorePlan;
    }
  | {
      errors: ArchiveRestorePlanError[];
      ok: false;
    };

type PlannerContext = {
  existingInstallsById: Map<string, AppInstall>;
  mediaFilesByPath: Map<string, ArchiveRestoreMediaFile> | undefined;
  packagesByKey: Map<string, InstallableAppPackage>;
  sourceSchemas: Partial<Record<string, AppSchema>> | undefined;
};

export function planPortableArchiveRestore(
  value: unknown,
  target: ArchiveRestoreTargetState = {},
): ArchiveRestorePlanResult {
  let archive: PortableArchive;

  try {
    archive = parsePortableArchive(value, archiveControlPlaneValidationOptions(target));
  } catch (error) {
    return invalidArchiveResult(error);
  }

  return planParsedPortableArchiveRestore(archive, target);
}

export function planInstanceArchiveRestore(
  value: unknown,
  target: ArchiveRestoreTargetState = {},
): ArchiveRestorePlanResult {
  let archive: InstanceArchive;

  try {
    archive = parseInstanceArchive(value, archiveControlPlaneValidationOptions(target));
  } catch (error) {
    return invalidArchiveResult(error);
  }

  return planParsedInstanceArchiveRestore(archive, target);
}

export function planAppArchiveRestore(
  value: unknown,
  target: ArchiveRestoreTargetState = {},
): ArchiveRestorePlanResult {
  let archive: AppArchive;

  try {
    archive = parseAppArchive(value);
  } catch (error) {
    return invalidArchiveResult(error);
  }

  return planParsedAppArchiveRestore(archive, target);
}

function archiveControlPlaneValidationOptions(
  target: ArchiveRestoreTargetState,
): ArchiveControlPlaneValidationOptions {
  return {
    controlPlaneSnapshotContract: target.controlPlaneSnapshotContract,
    packageResolver: target.packageResolver,
  };
}

function planParsedPortableArchiveRestore(
  archive: PortableArchive,
  target: ArchiveRestoreTargetState,
): ArchiveRestorePlanResult {
  if (archive.kind === INSTANCE_ARCHIVE_KIND) {
    return planParsedInstanceArchiveRestore(archive, target);
  }

  return planParsedAppArchiveRestore(archive, target);
}

function planParsedInstanceArchiveRestore(
  archive: InstanceArchive,
  target: ArchiveRestoreTargetState,
): ArchiveRestorePlanResult {
  return planArchives(archive.apps, archive.restorePolicy, target, {
    controlPlane: archive.controlPlane,
    media: archive.media.objects,
  });
}

function planParsedAppArchiveRestore(
  archive: AppArchive,
  target: ArchiveRestoreTargetState,
): ArchiveRestorePlanResult {
  return planArchives([archive], archive.restorePolicy, target);
}

function planArchives(
  apps: readonly AppArchive[],
  policy: ArchiveRestorePolicy,
  target: ArchiveRestoreTargetState,
  program?: {
    controlPlane: InstanceArchive["controlPlane"];
    media: readonly AppArchiveMediaObject[];
  },
): ArchiveRestorePlanResult {
  const context = plannerContext(target);
  const errors: ArchiveRestorePlanError[] = [];
  const appPlans: ArchiveRestoreAppPlan[] = [];
  const mediaByApp = new Map<string, AppArchiveMediaObject[]>();
  const seenInstallIds = new Set<string>();
  const programMedia = sortedMediaObjects(program?.media ?? []);

  validateProgramMedia(program, programMedia, context, errors);

  for (const app of appsByInstallId(apps)) {
    if (seenInstallIds.has(app.app.installId)) {
      errors.push(
        planError("duplicate-archive-install-id", {
          appInstallId: app.app.installId,
          message: `Archive includes duplicate app install "${app.app.installId}".`,
        }),
      );
      continue;
    }

    seenInstallIds.add(app.app.installId);
    const result = planAppArchive(app, policy, context);

    errors.push(...result.errors);

    if (result.plan) {
      appPlans.push(result.plan);
      mediaByApp.set(app.app.installId, result.media);
    }
  }

  if (errors.length > 0) {
    return { errors: errorsByLocation(errors), ok: false };
  }

  const sortedPlans = appPlans.sort((left, right) =>
    left.app.installId.localeCompare(right.app.installId),
  );

  return {
    ok: true,
    plan: {
      dryRun: policy.dryRun,
      policy: { ...policy },
      apps: sortedPlans,
      steps: planSteps(sortedPlans, mediaByApp, programMedia),
      summary: planSummary(sortedPlans, programMedia.length),
    },
  };
}

function validateProgramMedia(
  program:
    | {
        controlPlane: InstanceArchive["controlPlane"];
        media: readonly AppArchiveMediaObject[];
      }
    | undefined,
  mediaObjects: AppArchiveMediaObject[],
  context: PlannerContext,
  errors: ArchiveRestorePlanError[],
) {
  if (program === undefined) {
    return;
  }

  if (program.controlPlane === undefined) {
    if (mediaObjects.length > 0) {
      errors.push(
        planError("invalid-media", {
          message: "Instance archive Program media requires Program data.",
        }),
      );
    }
    return;
  }

  for (const object of mediaObjects) {
    if (!object.archivePath.startsWith("media/program/")) {
      errors.push(
        planError("invalid-media", {
          message: `Instance archive Program media path "${object.archivePath}" must live under "media/program/".`,
          storageKey: object.storageKey,
        }),
      );
    }
  }

  validateMedia(
    {
      installId: "program",
      packageAppKey: "program",
      packageRevision: 1,
      sourceSchemaKey: program.controlPlane.schemaKey,
      sourceSchemaHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      label: "Program",
      registrationPolicy: "closed",
      status: "installed",
      createdAt: program.controlPlane.exportedAt,
      updatedAt: program.controlPlane.exportedAt,
    },
    mediaObjects,
    program.controlPlane.schema,
    program.controlPlane.records,
    context,
    errors,
    { program: true },
  );
}

function plannerContext(target: ArchiveRestoreTargetState): PlannerContext {
  return {
    existingInstallsById: new Map(
      (target.installedApps ?? []).map((install) => [install.installId, install]),
    ),
    mediaFilesByPath:
      target.mediaFiles === undefined
        ? undefined
        : new Map(target.mediaFiles.map((file) => [file.archivePath, file])),
    packagesByKey: new Map(
      (target.packages ?? []).map((appPackage) => [appPackage.packageAppKey, appPackage]),
    ),
    sourceSchemas: target.sourceSchemas,
  };
}

function planAppArchive(
  archive: AppArchive,
  policy: ArchiveRestorePolicy,
  context: PlannerContext,
): {
  errors: ArchiveRestorePlanError[];
  media: AppArchiveMediaObject[];
  plan?: ArchiveRestoreAppPlan;
} {
  const errors: ArchiveRestorePlanError[] = [];
  const app = archive.app;
  const appPackage = context.packagesByKey.get(app.packageAppKey);
  const existingInstall = context.existingInstallsById.get(app.installId);
  let action: ArchiveRestoreAppAction = "create";

  if (!appPackage) {
    errors.push(
      planError("unsupported-package", {
        appInstallId: app.installId,
        message: `Archive app "${app.installId}" uses unsupported package "${app.packageAppKey}".`,
      }),
    );
  } else {
    validatePackageCompatibility(app, appPackage, context, archive.data, errors);
  }

  if (existingInstall) {
    if (policy.installCollisions === "reject") {
      errors.push(
        planError("install-collision", {
          appInstallId: app.installId,
          message: `Archive app "${app.installId}" collides with an installed app.`,
        }),
      );
    } else {
      action = "replace";

      if (existingInstall.packageAppKey !== app.packageAppKey) {
        errors.push(
          planError("schema-mismatch", {
            appInstallId: app.installId,
            message: `Archive app "${app.installId}" package "${app.packageAppKey}" does not match installed package "${existingInstall.packageAppKey}".`,
          }),
        );
      }
    }
  }

  const records = recordsForAppData(archive.data);
  const schema = schemaForAppData(archive.data);

  validateRecords(app.installId, schema, records, errors);
  validateMedia(app, archive.media.objects, schema, records, context, errors);

  if (!appPackage || errors.length > 0) {
    return { errors, media: [] };
  }

  return {
    errors,
    media: sortedMediaObjects(archive.media.objects),
    plan: {
      action,
      app: appInstallForArchive(app, appPackage),
      dataKind: archive.data.kind,
      mediaCount: archive.media.objects.length,
      recordCounts: recordCounts(records),
      schemaKey: schemaKeyForAppData(archive.data),
      schemaUpdatedAt: schemaUpdatedAtForAppData(archive.data),
    },
  };
}

function validatePackageCompatibility(
  app: ArchivedAppInstall,
  appPackage: InstallableAppPackage,
  context: PlannerContext,
  data: AppArchiveData,
  errors: ArchiveRestorePlanError[],
) {
  if (appPackage.sourceSchemaKey !== app.sourceSchemaKey) {
    errors.push(
      planError("schema-mismatch", {
        appInstallId: app.installId,
        message: `Archive app "${app.installId}" source schema "${app.sourceSchemaKey}" does not match package source "${appPackage.sourceSchemaKey}".`,
      }),
    );
  }

  if (!context.sourceSchemas) {
    return;
  }

  const sourceSchema = context.sourceSchemas[appPackage.sourceSchemaKey];

  if (!sourceSchema) {
    errors.push(
      planError("missing-source-schema", {
        appInstallId: app.installId,
        message: `Archive app "${app.installId}" package source "${appPackage.sourceSchemaKey}" is unavailable.`,
      }),
    );
    return;
  }

  if (stableStringify(data.schema) !== stableStringify(sourceSchema)) {
    errors.push(
      planError("schema-mismatch", {
        appInstallId: app.installId,
        message: `Archive app "${app.installId}" storage snapshot schema does not match bundled source "${appPackage.sourceSchemaKey}".`,
      }),
    );
  }
}

function validateRecords(
  appInstallId: string,
  schema: AppSchema,
  records: StoredRecord[],
  errors: ArchiveRestorePlanError[],
) {
  const recordsById = new Map<string, StoredRecord>();

  for (const record of records) {
    if (record.id.trim() === "") {
      errors.push(
        planError("invalid-record", {
          appInstallId,
          entity: record.entity,
          message: `Archive app "${appInstallId}" includes a record with an empty id.`,
          recordId: record.id,
        }),
      );
      continue;
    }

    if (recordsById.has(record.id)) {
      errors.push(
        planError("duplicate-record-id", {
          appInstallId,
          entity: record.entity,
          message: `Archive app "${appInstallId}" includes duplicate record id "${record.id}".`,
          recordId: record.id,
        }),
      );
      continue;
    }

    if (!isIsoTimestamp(record.createdAt)) {
      errors.push(
        planError("invalid-record", {
          appInstallId,
          entity: record.entity,
          message: `Archive app "${appInstallId}" record "${record.id}" createdAt must be an ISO timestamp.`,
          recordId: record.id,
        }),
      );
    }

    if (record.deletedAt !== undefined && !isIsoTimestamp(record.deletedAt)) {
      errors.push(
        planError("invalid-record", {
          appInstallId,
          entity: record.entity,
          message: `Archive app "${appInstallId}" record "${record.id}" deletedAt must be an ISO timestamp.`,
          recordId: record.id,
        }),
      );
    }

    recordsById.set(record.id, record);
  }

  for (const record of records) {
    validateRecord(appInstallId, record, schema, recordsById, errors);
  }

  validateUniqueConstraints(appInstallId, schema, records, errors);
}

function validateRecord(
  appInstallId: string,
  record: StoredRecord,
  schema: AppSchema,
  recordsById: Map<string, StoredRecord>,
  errors: ArchiveRestorePlanError[],
) {
  const schemaIndex = getAppSchemaDefinitionIndex(schema);
  const entity = schemaIndex.entities.byKey.get(record.entity);

  if (!entity) {
    errors.push(
      planError("invalid-record", {
        appInstallId,
        entity: record.entity,
        message: `Archive app "${appInstallId}" record "${record.id}" references unknown entity "${record.entity}".`,
        recordId: record.id,
      }),
    );
    return;
  }

  for (const fieldName of Object.keys(record.values)) {
    if (!schemaIndex.fieldsByEntity.get(record.entity)?.byKey.has(fieldName)) {
      errors.push(
        planError("invalid-record", {
          appInstallId,
          entity: record.entity,
          field: `${record.entity}.${fieldName}`,
          message: `Archive app "${appInstallId}" record "${record.id}" includes unknown field "${record.entity}.${fieldName}".`,
          recordId: record.id,
        }),
      );
    }
  }

  for (const field of entity.fields) {
    const value = record.values[field.key];

    if (!isValidStoredFieldValue(value, field)) {
      errors.push(
        planError("invalid-record", {
          appInstallId,
          entity: record.entity,
          field: `${record.entity}.${field.key}`,
          message: `Archive app "${appInstallId}" record "${record.id}" has invalid field "${record.entity}.${field.key}".`,
          recordId: record.id,
        }),
      );
      continue;
    }

    if (field.type === "reference" && value !== undefined) {
      validateReferenceField(appInstallId, record, field.key, field, value, recordsById, errors);
    }
  }
}

function validateReferenceField(
  appInstallId: string,
  record: StoredRecord,
  fieldName: string,
  field: Extract<FieldSchema, { type: "reference" }>,
  value: RecordValues[string],
  recordsById: Map<string, StoredRecord>,
  errors: ArchiveRestorePlanError[],
) {
  if (typeof value !== "string") {
    return;
  }

  const target = recordsById.get(value);

  if (!target) {
    errors.push(
      planError("broken-reference", {
        appInstallId,
        entity: record.entity,
        field: `${record.entity}.${fieldName}`,
        message: `Archive app "${appInstallId}" record "${record.id}" field "${record.entity}.${fieldName}" references unknown ${field.to} record "${value}".`,
        recordId: record.id,
      }),
    );
    return;
  }

  if (target.entity !== field.to) {
    errors.push(
      planError("broken-reference", {
        appInstallId,
        entity: record.entity,
        field: `${record.entity}.${fieldName}`,
        message: `Archive app "${appInstallId}" record "${record.id}" field "${record.entity}.${fieldName}" must reference a ${field.to} record.`,
        recordId: record.id,
      }),
    );
    return;
  }

  if (target.deletedAt) {
    errors.push(
      planError("broken-reference", {
        appInstallId,
        entity: record.entity,
        field: `${record.entity}.${fieldName}`,
        message: `Archive app "${appInstallId}" record "${record.id}" field "${record.entity}.${fieldName}" cannot reference tombstoned record "${value}".`,
        recordId: record.id,
      }),
    );
  }
}

function validateUniqueConstraints(
  appInstallId: string,
  schema: AppSchema,
  records: StoredRecord[],
  errors: ArchiveRestorePlanError[],
) {
  for (const entity of schema.entities) {
    const entityName = entity.key;
    const activeRecords = records.filter(
      (record) => record.entity === entityName && !record.deletedAt,
    );

    for (const constraint of entity.constraints ?? []) {
      if (constraint.kind !== "unique") {
        continue;
      }

      const seen = new Map<string, StoredRecord>();

      for (const record of activeRecords) {
        const key = uniqueConstraintKey(record.values, constraint.fields);
        const duplicate = seen.get(key);

        if (duplicate) {
          errors.push(
            planError("unique-constraint", {
              appInstallId,
              entity: entityName,
              message: `Archive app "${appInstallId}" violates unique constraint "${entityName}.${constraint.key}".`,
              recordId: record.id,
            }),
          );
          break;
        }

        seen.set(key, record);
      }
    }
  }
}

function validateMedia(
  app: ArchivedAppInstall,
  mediaObjects: AppArchiveMediaObject[],
  schema: AppSchema,
  records: StoredRecord[],
  context: PlannerContext,
  errors: ArchiveRestorePlanError[],
  options: { program?: boolean } = {},
) {
  const seenStorageKeys = new Set<string>();
  const seenArchivePaths = new Set<string>();
  const coreKeyPrefix = mediaKeyPrefix(CORE_IMAGE_KEY_PREFIX);

  for (const object of sortedMediaObjects(mediaObjects)) {
    const isImage = isRestorableImageMediaKey(object.storageKey, {
      keyPrefix: coreKeyPrefix,
    });
    const isDocument =
      object.asset?.kind === "document" &&
      isRestorableDocumentMediaKey(
        object.storageKey,
        options.program ? {} : { ownerAppInstallId: app.installId },
      );

    if (seenStorageKeys.has(object.storageKey)) {
      errors.push(
        planError("duplicate-media-object", {
          appInstallId: app.installId,
          message: `Archive app "${app.installId}" includes duplicate media storage key "${object.storageKey}".`,
          storageKey: object.storageKey,
        }),
      );
    }

    if (seenArchivePaths.has(object.archivePath)) {
      errors.push(
        planError("duplicate-media-object", {
          appInstallId: app.installId,
          message: `Archive app "${app.installId}" includes duplicate media archive path "${object.archivePath}".`,
          storageKey: object.storageKey,
        }),
      );
    }

    seenStorageKeys.add(object.storageKey);
    seenArchivePaths.add(object.archivePath);

    if (!isImage && !isDocument) {
      errors.push(
        planError("invalid-media", {
          appInstallId: app.installId,
          message: `Archive app "${app.installId}" media key "${object.storageKey}" is not restorable media for this app.`,
          storageKey: object.storageKey,
        }),
      );
    }

    const expectedContentType = isDocument
      ? MEDIA_PDF_CONTENT_TYPE
      : imageMediaContentTypeForKey(object.storageKey);

    if (expectedContentType && normalizeContentType(object.contentType) !== expectedContentType) {
      errors.push(
        planError("invalid-media", {
          appInstallId: app.installId,
          message: `Archive app "${app.installId}" media key "${object.storageKey}" content type must match its media kind.`,
          storageKey: object.storageKey,
        }),
      );
    }

    if (object.byteSize === 0) {
      errors.push(
        planError("invalid-media", {
          appInstallId: app.installId,
          message: `Archive app "${app.installId}" media key "${object.storageKey}" must not be empty.`,
          storageKey: object.storageKey,
        }),
      );
    }

    const maxBytes = isDocument ? MEDIA_DOCUMENT_UPLOAD_MAX_BYTES : MEDIA_IMAGE_UPLOAD_MAX_BYTES;

    if (object.byteSize > maxBytes) {
      errors.push(
        planError("invalid-media", {
          appInstallId: app.installId,
          message: `Archive app "${app.installId}" media key "${object.storageKey}" exceeds the media restore size limit.`,
          storageKey: object.storageKey,
        }),
      );
    }

    const expectedDeliveryHref = isImage
      ? coreMediaHrefForKey(object.storageKey)
      : object.asset?.kind === "document"
        ? documentDeliveryHref(app, object.asset.id, options)
        : undefined;

    if (expectedDeliveryHref && object.deliveryHref !== expectedDeliveryHref) {
      errors.push(
        planError("invalid-media", {
          appInstallId: app.installId,
          message: `Archive app "${app.installId}" media key "${object.storageKey}" delivery href is not scoped to its storage key.`,
          storageKey: object.storageKey,
        }),
      );
    }

    validateMediaAsset(app, object, isDocument, errors, options);
    validateMediaFile(app.installId, object, isDocument, context.mediaFilesByPath, errors);
  }

  validateMediaReferences(app, schema, records, mediaObjects, errors, options);
}

function validateMediaAsset(
  app: ArchivedAppInstall,
  object: AppArchiveMediaObject,
  isDocument: boolean,
  errors: ArchiveRestorePlanError[],
  options: { program?: boolean },
) {
  if (!object.asset) {
    if (isDocument) {
      errors.push(
        planError("invalid-media", {
          appInstallId: app.installId,
          message: `Archive app "${app.installId}" document "${object.storageKey}" must include asset metadata.`,
          storageKey: object.storageKey,
        }),
      );
    }

    return;
  }

  const asset = object.asset;

  if (
    asset.storageKey !== object.storageKey ||
    normalizeContentType(asset.contentType) !== normalizeContentType(object.contentType) ||
    asset.byteSize !== object.byteSize ||
    asset.deliveryHref !== object.deliveryHref
  ) {
    errors.push(
      planError("invalid-media", {
        appInstallId: app.installId,
        message: `Archive app "${app.installId}" media asset metadata for "${object.storageKey}" does not match the media object.`,
        storageKey: object.storageKey,
      }),
    );
  }

  if (
    asset.kind === "document" &&
    (!isDocumentMediaAsset(asset) ||
      (options.program
        ? asset.ownerAppInstallId !== undefined
        : asset.ownerAppInstallId !== app.installId) ||
      asset.deliveryHref !== documentDeliveryHref(app, asset.id, options))
  ) {
    errors.push(
      planError("invalid-media", {
        appInstallId: app.installId,
        message: options.program
          ? `Instance archive Program document metadata for "${object.storageKey}" is not global Program media.`
          : `Archive app "${app.installId}" document metadata for "${object.storageKey}" is not scoped to its owning app.`,
        storageKey: object.storageKey,
      }),
    );
  }

  if (isDocument && asset.kind !== "document") {
    errors.push(
      planError("invalid-media", {
        appInstallId: app.installId,
        message: `Archive app "${app.installId}" document "${object.storageKey}" has the wrong asset kind.`,
        storageKey: object.storageKey,
      }),
    );
  }
}

function validateMediaFile(
  appInstallId: string,
  object: AppArchiveMediaObject,
  isDocument: boolean,
  mediaFilesByPath: Map<string, ArchiveRestoreMediaFile> | undefined,
  errors: ArchiveRestorePlanError[],
) {
  if (!mediaFilesByPath) {
    return;
  }

  const file = mediaFilesByPath.get(object.archivePath);

  if (!file) {
    errors.push(
      planError("missing-media-object", {
        appInstallId,
        message: `Archive app "${appInstallId}" media file "${object.archivePath}" is missing.`,
        storageKey: object.storageKey,
      }),
    );
    return;
  }

  if (normalizeContentType(file.contentType) !== normalizeContentType(object.contentType)) {
    errors.push(
      planError("invalid-media", {
        appInstallId,
        message: `Archive app "${appInstallId}" media file "${object.archivePath}" content type does not match the manifest.`,
        storageKey: object.storageKey,
      }),
    );
  }

  if (file.byteSize !== object.byteSize) {
    errors.push(
      planError("invalid-media", {
        appInstallId,
        message: `Archive app "${appInstallId}" media file "${object.archivePath}" byte size does not match the manifest.`,
        storageKey: object.storageKey,
      }),
    );
  }

  if (file.bytes !== undefined && file.bytes.byteLength !== file.byteSize) {
    errors.push(
      planError("invalid-media", {
        appInstallId,
        message: `Archive app "${appInstallId}" media file "${object.archivePath}" payload size does not match its file metadata.`,
        storageKey: object.storageKey,
      }),
    );
  }

  if (isDocument && object.asset?.kind === "document" && file.bytes !== undefined) {
    const validation = validatePdfDocumentMediaFile(
      {
        bytes: file.bytes,
        contentType: file.contentType,
        filename: object.asset.filename,
        size: file.byteSize,
      },
      {
        acceptedMimeTypes: [MEDIA_PDF_CONTENT_TYPE],
        maxBytes: MEDIA_DOCUMENT_UPLOAD_MAX_BYTES,
      },
    );

    if (!validation.ok) {
      errors.push(
        planError("invalid-media", {
          appInstallId,
          message: `Archive app "${appInstallId}" document file "${object.archivePath}" has invalid PDF payload.`,
          storageKey: object.storageKey,
        }),
      );
    }
  }
}

function validateMediaReferences(
  app: ArchivedAppInstall,
  schema: AppSchema,
  records: StoredRecord[],
  mediaObjects: AppArchiveMediaObject[],
  errors: ArchiveRestorePlanError[],
  options: { program?: boolean },
) {
  const objectsByStorageKey = new Map(mediaObjects.map((object) => [object.storageKey, object]));

  for (const reference of appArchiveMediaReferences(schema, records)) {
    const facts =
      reference.kind === "document"
        ? documentMediaDeliveryFactsForAssetId(reference.assetId, {
            hrefForAssetId: (assetId) => documentDeliveryHref(app, assetId, options),
            ...(options.program ? {} : { ownerAppInstallId: app.installId }),
          })
        : coreImageMediaDeliveryFactsForAssetId(reference.assetId);
    const object = facts ? objectsByStorageKey.get(facts.storageKey) : undefined;

    if (!facts || !object) {
      errors.push(
        planError("missing-media-object", {
          appInstallId: app.installId,
          entity: reference.entity,
          field: `${reference.entity}.${reference.field}`,
          message: `Archive app "${app.installId}" record "${reference.recordId}" field "${reference.entity}.${reference.field}" references media missing from the archive manifest.`,
          recordId: reference.recordId,
          ...(facts === undefined ? {} : { storageKey: facts.storageKey }),
        }),
      );
      continue;
    }

    if (
      reference.kind === "document" &&
      (object.asset?.kind !== "document" ||
        object.asset.id !== reference.assetId ||
        object.asset.access !== reference.policy.access ||
        !reference.policy.acceptedMimeTypes.includes(object.asset.contentType) ||
        object.byteSize > reference.policy.maxBytes)
    ) {
      errors.push(
        planError("invalid-media", {
          appInstallId: app.installId,
          entity: reference.entity,
          field: `${reference.entity}.${reference.field}`,
          message: `Archive app "${app.installId}" document "${reference.assetId}" is incompatible with field "${reference.entity}.${reference.field}".`,
          recordId: reference.recordId,
          storageKey: object.storageKey,
        }),
      );
    }
  }
}

function documentDeliveryHref(
  app: ArchivedAppInstall,
  assetId: string,
  options: { program?: boolean } = {},
): string {
  return options.program
    ? `/api/formless/program/media/documents/${assetId}`
    : `/api/app-installs/${app.packageAppKey}/${app.installId}/media/documents/${assetId}`;
}

function planSteps(
  appPlans: ArchiveRestoreAppPlan[],
  mediaByApp: Map<string, AppArchiveMediaObject[]>,
  programMedia: readonly AppArchiveMediaObject[] = [],
): ArchiveRestorePlanStep[] {
  const steps: ArchiveRestorePlanStep[] = programMedia.map((object) => ({
    archivePath: object.archivePath,
    ...(object.asset === undefined ? {} : { asset: object.asset }),
    byteSize: object.byteSize,
    contentType: object.contentType,
    deliveryHref: object.deliveryHref,
    kind: "restoreMedia" as const,
    program: true as const,
    storageKey: object.storageKey,
  }));

  for (const appPlan of appPlans) {
    const installStep: ArchiveRestorePlanStep = {
      install: appPlan.app,
      kind: appPlan.action === "create" ? "createInstall" : "replaceInstall",
    };

    if (appPlan.action === "replace") {
      steps.push(installStep);
    }

    for (const object of mediaByApp.get(appPlan.app.installId) ?? []) {
      steps.push({
        appInstallId: appPlan.app.installId,
        archivePath: object.archivePath,
        ...(object.asset === undefined ? {} : { asset: object.asset }),
        byteSize: object.byteSize,
        contentType: object.contentType,
        deliveryHref: object.deliveryHref,
        kind: "restoreMedia",
        storageKey: object.storageKey,
      });
    }

    steps.push({
      appInstallId: appPlan.app.installId,
      dataKind: appPlan.dataKind,
      kind: "restoreAppData",
      packageAppKey: appPlan.app.packageAppKey,
      recordCount: appPlan.recordCounts.total,
      schemaKey: appPlan.schemaKey,
      tombstoneCount: appPlan.recordCounts.tombstoned,
    });

    if (appPlan.action === "create") {
      steps.push(installStep);
    }
  }

  return steps;
}

function planSummary(
  appPlans: ArchiveRestoreAppPlan[],
  programMediaCount = 0,
): ArchiveRestorePlanSummary {
  return {
    appCount: appPlans.length,
    createdInstalls: appPlans
      .filter((app) => app.action === "create")
      .map((app) => app.app.installId),
    mediaCountsByApp: Object.fromEntries(
      appPlans.map((app) => [app.app.installId, app.mediaCount]),
    ),
    programMediaCount,
    recordCountsByApp: Object.fromEntries(
      appPlans.map((app) => [app.app.installId, app.recordCounts]),
    ),
    replacedInstalls: appPlans
      .filter((app) => app.action === "replace")
      .map((app) => app.app.installId),
  };
}

function appInstallForArchive(
  app: ArchivedAppInstall,
  appPackage: InstallableAppPackage,
): AppInstall {
  return {
    installId: app.installId,
    packageAppKey: appPackage.packageAppKey,
    packageRevision: app.packageRevision,
    sourceSchemaHash: app.sourceSchemaHash,
    label: app.label,
    registrationPolicy: app.registrationPolicy,
    ...(app.registrationOperation === undefined
      ? {}
      : { registrationOperation: app.registrationOperation }),
    status: "installed",
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
    adminRoute: `${appPackage.adminRouteBase}/${app.installId}`,
    ...(appPackage.publicRouteBase === undefined
      ? {}
      : {
          publicRoute: `${appPackage.publicRouteBase}/${app.installId}`,
          publicRoutePrefix: `${appPackage.publicRouteBase}/${app.installId}/`,
        }),
  };
}

function recordsForAppData(data: AppArchiveData): StoredRecord[] {
  return data.records;
}

function schemaForAppData(data: AppArchiveData): AppSchema {
  return data.schema;
}

function schemaKeyForAppData(data: AppArchiveData): string {
  return data.schemaKey;
}

function schemaUpdatedAtForAppData(data: AppArchiveData): string {
  return data.schemaUpdatedAt;
}

function recordCounts(records: StoredRecord[]): ArchiveRestoreRecordCounts {
  const byEntity: Record<string, number> = {};
  let tombstoned = 0;

  for (const record of records) {
    byEntity[record.entity] = (byEntity[record.entity] ?? 0) + 1;

    if (record.deletedAt) {
      tombstoned += 1;
    }
  }

  return {
    active: records.length - tombstoned,
    byEntity: Object.fromEntries(
      Object.entries(byEntity).sort(([left], [right]) => left.localeCompare(right)),
    ),
    tombstoned,
    total: records.length,
  };
}

function appsByInstallId(apps: readonly AppArchive[]): AppArchive[] {
  return [...apps].sort((left, right) => {
    const installOrder = left.app.installId.localeCompare(right.app.installId);

    return installOrder === 0 ? left.exportedAt.localeCompare(right.exportedAt) : installOrder;
  });
}

function sortedMediaObjects(objects: readonly AppArchiveMediaObject[]): AppArchiveMediaObject[] {
  return [...objects].sort((left, right) => left.storageKey.localeCompare(right.storageKey));
}

function uniqueConstraintKey(values: RecordValues, fields: readonly string[]) {
  return JSON.stringify(fields.map((fieldName) => values[fieldName] ?? null));
}

function mediaKeyPrefix(prefix: string) {
  return prefix.endsWith("/") ? prefix : `${prefix}/`;
}

function normalizeContentType(value: string) {
  return value.split(";")[0]?.trim().toLowerCase() ?? "";
}

function isIsoTimestamp(value: string) {
  const date = new Date(value);

  return !Number.isNaN(date.valueOf()) && date.toISOString() === value;
}

function invalidArchiveResult(error: unknown): ArchiveRestorePlanResult {
  return {
    errors: [
      planError("invalid-archive", {
        message: error instanceof Error ? error.message : "Archive is invalid.",
      }),
    ],
    ok: false,
  };
}

function planError(
  code: ArchiveRestorePlanErrorCode,
  details: Omit<ArchiveRestorePlanError, "code">,
): ArchiveRestorePlanError {
  return { code, ...details };
}

function errorsByLocation(errors: ArchiveRestorePlanError[]): ArchiveRestorePlanError[] {
  return [...errors].sort((left, right) => {
    return (
      (left.appInstallId ?? "").localeCompare(right.appInstallId ?? "") ||
      (left.recordId ?? "").localeCompare(right.recordId ?? "") ||
      (left.storageKey ?? "").localeCompare(right.storageKey ?? "") ||
      left.code.localeCompare(right.code) ||
      left.message.localeCompare(right.message)
    );
  });
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }

  return value;
}
