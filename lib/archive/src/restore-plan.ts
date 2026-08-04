import {
  type ArchiveMediaObject,
  type ArchiveProgramValidationOptions,
  type ArchiveRestorePolicy,
  type InstanceArchive,
  parseInstanceArchive,
} from "./types.ts";
import { archiveMediaReferences, instanceArchiveMediaPath } from "./media-references.ts";
import { getAppSchemaDefinitionIndex, isValidStoredFieldValue } from "@dpeek/formless-schema";
import type { AppSchema, FieldSchema } from "@dpeek/formless-schema";
import type { RecordValues, StoredRecord } from "@dpeek/formless-storage";
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

export type ArchiveRestoreTargetState = ArchiveProgramValidationOptions & {
  expectedSourceCursor?: number;
  mediaFiles?: readonly ArchiveRestoreMediaFile[];
};

export type ArchiveRestorePlanErrorCode =
  | "broken-reference"
  | "duplicate-media-object"
  | "duplicate-record-id"
  | "invalid-archive"
  | "invalid-media"
  | "invalid-record"
  | "missing-media-object"
  | "unique-constraint";

export type ArchiveRestorePlanError = {
  code: ArchiveRestorePlanErrorCode;
  entity?: string;
  field?: string;
  message: string;
  recordId?: string;
  storageKey?: string;
};

export type ArchiveRestoreRecordCounts = {
  active: number;
  byEntity: Record<string, number>;
  tombstoned: number;
  total: number;
};

export type ArchiveRestorePlanStep =
  | {
      archivePath: string;
      asset?: ArchiveMediaObject["asset"];
      byteSize: number;
      contentType: string;
      deliveryHref: string;
      kind: "restoreMedia";
      storageKey: string;
    }
  | {
      dataKind: InstanceArchive["program"]["snapshot"]["kind"];
      kind: "restoreProgram";
      recordCount: number;
      schemaKey: string;
      tombstoneCount: number;
    };

export type ArchiveRestorePlanSummary = {
  mediaCount: number;
  recordCounts: ArchiveRestoreRecordCounts;
};

export type ArchiveRestorePlan = {
  dryRun: boolean;
  expectedSourceCursor?: number;
  policy: ArchiveRestorePolicy;
  steps: ArchiveRestorePlanStep[];
  summary: ArchiveRestorePlanSummary;
};

export type ArchiveRestorePlanResult =
  | { ok: true; plan: ArchiveRestorePlan }
  | { errors: ArchiveRestorePlanError[]; ok: false };

export function planInstanceArchiveRestore(
  value: unknown,
  target: ArchiveRestoreTargetState = {},
): ArchiveRestorePlanResult {
  let archive: InstanceArchive;

  try {
    archive = parseInstanceArchive(value, target);
  } catch (error) {
    return invalidArchiveResult(error);
  }

  return planParsedArchiveRestore(archive, target);
}

function planParsedArchiveRestore(
  archive: InstanceArchive,
  target: ArchiveRestoreTargetState,
): ArchiveRestorePlanResult {
  const errors: ArchiveRestorePlanError[] = [];
  const snapshot = archive.program.snapshot;
  const mediaObjects = sortedMediaObjects(archive.media.objects);
  const mediaFilesByPath =
    target.mediaFiles === undefined
      ? undefined
      : new Map(target.mediaFiles.map((file) => [file.archivePath, file]));

  validateRecords(snapshot.schema, snapshot.records, errors);
  validateMedia(mediaObjects, snapshot.schema, snapshot.records, mediaFilesByPath, errors);

  if (errors.length > 0) {
    return { errors: errorsByLocation(errors), ok: false };
  }

  const counts = recordCounts(snapshot.records);
  const steps: ArchiveRestorePlanStep[] = [
    ...mediaObjects.map((object) => ({
      archivePath: object.archivePath,
      ...(object.asset === undefined ? {} : { asset: object.asset }),
      byteSize: object.byteSize,
      contentType: object.contentType,
      deliveryHref: object.deliveryHref,
      kind: "restoreMedia" as const,
      storageKey: object.storageKey,
    })),
    {
      dataKind: snapshot.kind,
      kind: "restoreProgram",
      recordCount: counts.total,
      schemaKey: snapshot.schemaKey,
      tombstoneCount: counts.tombstoned,
    },
  ];

  return {
    ok: true,
    plan: {
      dryRun: archive.restorePolicy.dryRun,
      ...(target.expectedSourceCursor === undefined
        ? {}
        : { expectedSourceCursor: target.expectedSourceCursor }),
      policy: { dryRun: archive.restorePolicy.dryRun },
      steps,
      summary: {
        mediaCount: mediaObjects.length,
        recordCounts: counts,
      },
    },
  };
}

function validateRecords(
  schema: AppSchema,
  records: StoredRecord[],
  errors: ArchiveRestorePlanError[],
) {
  const recordsById = new Map<string, StoredRecord>();

  for (const record of records) {
    if (record.id.trim() === "") {
      errors.push(
        planError("invalid-record", {
          entity: record.entity,
          message: "Program archive includes a record with an empty id.",
          recordId: record.id,
        }),
      );
      continue;
    }

    if (recordsById.has(record.id)) {
      errors.push(
        planError("duplicate-record-id", {
          entity: record.entity,
          message: `Program archive includes duplicate record id "${record.id}".`,
          recordId: record.id,
        }),
      );
      continue;
    }

    if (!isIsoTimestamp(record.createdAt)) {
      errors.push(
        planError("invalid-record", {
          entity: record.entity,
          message: `Program archive record "${record.id}" createdAt must be an ISO timestamp.`,
          recordId: record.id,
        }),
      );
    }

    if (!isIsoTimestamp(record.updatedAt)) {
      errors.push(
        planError("invalid-record", {
          entity: record.entity,
          message: `Program archive record "${record.id}" updatedAt must be an ISO timestamp.`,
          recordId: record.id,
        }),
      );
    }

    if (record.deletedAt !== undefined && !isIsoTimestamp(record.deletedAt)) {
      errors.push(
        planError("invalid-record", {
          entity: record.entity,
          message: `Program archive record "${record.id}" deletedAt must be an ISO timestamp.`,
          recordId: record.id,
        }),
      );
    }

    recordsById.set(record.id, record);
  }

  for (const record of records) {
    validateRecord(record, schema, recordsById, errors);
  }

  validateUniqueConstraints(schema, records, errors);
}

function validateRecord(
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
        entity: record.entity,
        message: `Program archive record "${record.id}" references unknown entity "${record.entity}".`,
        recordId: record.id,
      }),
    );
    return;
  }

  for (const fieldName of Object.keys(record.values)) {
    if (!schemaIndex.fieldsByEntity.get(record.entity)?.byKey.has(fieldName)) {
      errors.push(
        planError("invalid-record", {
          entity: record.entity,
          field: `${record.entity}.${fieldName}`,
          message: `Program archive record "${record.id}" includes unknown field "${record.entity}.${fieldName}".`,
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
          entity: record.entity,
          field: `${record.entity}.${field.key}`,
          message: `Program archive record "${record.id}" has invalid field "${record.entity}.${field.key}".`,
          recordId: record.id,
        }),
      );
      continue;
    }

    if (field.type === "reference" && value !== undefined) {
      validateReferenceField(record, field.key, field, value, recordsById, errors);
    }
  }
}

function validateReferenceField(
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
  const details = {
    entity: record.entity,
    field: `${record.entity}.${fieldName}`,
    recordId: record.id,
  };

  if (!target) {
    errors.push(
      planError("broken-reference", {
        ...details,
        message: `Program archive record "${record.id}" field "${record.entity}.${fieldName}" references unknown ${field.to} record "${value}".`,
      }),
    );
    return;
  }

  if (target.entity !== field.to) {
    errors.push(
      planError("broken-reference", {
        ...details,
        message: `Program archive record "${record.id}" field "${record.entity}.${fieldName}" must reference a ${field.to} record.`,
      }),
    );
    return;
  }

  if (target.deletedAt) {
    errors.push(
      planError("broken-reference", {
        ...details,
        message: `Program archive record "${record.id}" field "${record.entity}.${fieldName}" cannot reference tombstoned record "${value}".`,
      }),
    );
  }
}

function validateUniqueConstraints(
  schema: AppSchema,
  records: StoredRecord[],
  errors: ArchiveRestorePlanError[],
) {
  for (const entity of schema.entities) {
    const activeRecords = records.filter(
      (record) => record.entity === entity.key && !record.deletedAt,
    );

    for (const constraint of entity.constraints ?? []) {
      if (constraint.kind !== "unique") {
        continue;
      }

      const seen = new Map<string, StoredRecord>();

      for (const record of activeRecords) {
        const key = uniqueConstraintKey(record.values, constraint.fields);

        if (seen.has(key)) {
          errors.push(
            planError("unique-constraint", {
              entity: entity.key,
              message: `Program archive violates unique constraint "${entity.key}.${constraint.key}".`,
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
  mediaObjects: ArchiveMediaObject[],
  schema: AppSchema,
  records: StoredRecord[],
  mediaFilesByPath: Map<string, ArchiveRestoreMediaFile> | undefined,
  errors: ArchiveRestorePlanError[],
) {
  const seenStorageKeys = new Set<string>();
  const seenArchivePaths = new Set<string>();
  const coreKeyPrefix = mediaKeyPrefix(CORE_IMAGE_KEY_PREFIX);

  for (const object of mediaObjects) {
    const isImage = isRestorableImageMediaKey(object.storageKey, { keyPrefix: coreKeyPrefix });
    const documentAsset = object.asset?.kind === "document" ? object.asset : undefined;
    const isDocument =
      documentAsset !== undefined && isRestorableDocumentMediaKey(object.storageKey);
    const expectedArchivePath = isDocument
      ? instanceArchiveMediaPath({ assetId: documentAsset.id, kind: "document" })
      : isImage
        ? instanceArchiveMediaPath({
            assetId: object.storageKey.slice(coreKeyPrefix.length),
            kind: "image",
          })
        : undefined;

    if (expectedArchivePath !== undefined && object.archivePath !== expectedArchivePath) {
      errors.push(
        planError("invalid-media", {
          message: `Program archive media path "${object.archivePath}" must be "${expectedArchivePath}".`,
          storageKey: object.storageKey,
        }),
      );
    }

    if (seenStorageKeys.has(object.storageKey) || seenArchivePaths.has(object.archivePath)) {
      errors.push(
        planError("duplicate-media-object", {
          message: `Program archive includes duplicate media object "${object.storageKey}".`,
          storageKey: object.storageKey,
        }),
      );
    }

    seenStorageKeys.add(object.storageKey);
    seenArchivePaths.add(object.archivePath);

    if (!isImage && !isDocument) {
      errors.push(
        planError("invalid-media", {
          message: `Program archive media key "${object.storageKey}" is not restorable Program media.`,
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
          message: `Program archive media key "${object.storageKey}" content type must match its media kind.`,
          storageKey: object.storageKey,
        }),
      );
    }

    if (object.byteSize === 0) {
      errors.push(
        planError("invalid-media", {
          message: `Program archive media key "${object.storageKey}" must not be empty.`,
          storageKey: object.storageKey,
        }),
      );
    }

    const maxBytes = isDocument ? MEDIA_DOCUMENT_UPLOAD_MAX_BYTES : MEDIA_IMAGE_UPLOAD_MAX_BYTES;

    if (object.byteSize > maxBytes) {
      errors.push(
        planError("invalid-media", {
          message: `Program archive media key "${object.storageKey}" exceeds the media restore size limit.`,
          storageKey: object.storageKey,
        }),
      );
    }

    const expectedDeliveryHref = isImage
      ? coreMediaHrefForKey(object.storageKey)
      : object.asset?.kind === "document"
        ? documentDeliveryHref(object.asset.id)
        : undefined;

    if (expectedDeliveryHref && object.deliveryHref !== expectedDeliveryHref) {
      errors.push(
        planError("invalid-media", {
          message: `Program archive media key "${object.storageKey}" delivery href is not Program-global.`,
          storageKey: object.storageKey,
        }),
      );
    }

    validateMediaAsset(object, isDocument, errors);
    validateMediaFile(object, isDocument, mediaFilesByPath, errors);
  }

  validateMediaReferences(schema, records, mediaObjects, errors);
}

function validateMediaAsset(
  object: ArchiveMediaObject,
  isDocument: boolean,
  errors: ArchiveRestorePlanError[],
) {
  if (!object.asset) {
    if (isDocument) {
      errors.push(
        planError("invalid-media", {
          message: `Program archive document "${object.storageKey}" must include asset metadata.`,
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
        message: `Program archive media asset metadata for "${object.storageKey}" does not match the media object.`,
        storageKey: object.storageKey,
      }),
    );
  }

  if (
    asset.kind === "image" &&
    coreImageMediaDeliveryFactsForAssetId(asset.id)?.storageKey !== object.storageKey
  ) {
    errors.push(
      planError("invalid-media", {
        message: `Program archive image metadata for "${object.storageKey}" has the wrong asset id.`,
        storageKey: object.storageKey,
      }),
    );
  }

  if (
    asset.kind === "document" &&
    (!isDocumentMediaAsset(asset) || asset.deliveryHref !== documentDeliveryHref(asset.id))
  ) {
    errors.push(
      planError("invalid-media", {
        message: `Program archive document metadata for "${object.storageKey}" is not global Program media.`,
        storageKey: object.storageKey,
      }),
    );
  }

  if (isDocument && asset.kind !== "document") {
    errors.push(
      planError("invalid-media", {
        message: `Program archive document "${object.storageKey}" has the wrong asset kind.`,
        storageKey: object.storageKey,
      }),
    );
  }
}

function validateMediaFile(
  object: ArchiveMediaObject,
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
        message: `Program archive media file "${object.archivePath}" is missing.`,
        storageKey: object.storageKey,
      }),
    );
    return;
  }

  if (
    normalizeContentType(file.contentType) !== normalizeContentType(object.contentType) ||
    file.byteSize !== object.byteSize ||
    (file.bytes !== undefined && file.bytes.byteLength !== file.byteSize)
  ) {
    errors.push(
      planError("invalid-media", {
        message: `Program archive media file "${object.archivePath}" does not match the manifest.`,
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
          message: `Program archive document file "${object.archivePath}" has invalid PDF payload.`,
          storageKey: object.storageKey,
        }),
      );
    }
  }
}

function validateMediaReferences(
  schema: AppSchema,
  records: StoredRecord[],
  mediaObjects: ArchiveMediaObject[],
  errors: ArchiveRestorePlanError[],
) {
  const objectsByStorageKey = new Map(mediaObjects.map((object) => [object.storageKey, object]));

  for (const reference of archiveMediaReferences(schema, records)) {
    const facts =
      reference.kind === "document"
        ? documentMediaDeliveryFactsForAssetId(reference.assetId, {
            hrefForAssetId: documentDeliveryHref,
          })
        : coreImageMediaDeliveryFactsForAssetId(reference.assetId);
    const object = facts ? objectsByStorageKey.get(facts.storageKey) : undefined;

    if (!facts || !object) {
      errors.push(
        planError("missing-media-object", {
          entity: reference.entity,
          field: `${reference.entity}.${reference.field}`,
          message: `Program archive record "${reference.recordId}" field "${reference.entity}.${reference.field}" references media missing from the archive manifest.`,
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
          entity: reference.entity,
          field: `${reference.entity}.${reference.field}`,
          message: `Program archive document "${reference.assetId}" is incompatible with field "${reference.entity}.${reference.field}".`,
          recordId: reference.recordId,
          storageKey: object.storageKey,
        }),
      );
    }
  }
}

function documentDeliveryHref(assetId: string): string {
  return `/api/formless/program/media/documents/${assetId}`;
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
      Object.entries(byEntity).sort(([left], [right]) => compareOrdinal(left, right)),
    ),
    tombstoned,
    total: records.length,
  };
}

function sortedMediaObjects(objects: readonly ArchiveMediaObject[]): ArchiveMediaObject[] {
  return [...objects].sort((left, right) => compareOrdinal(left.storageKey, right.storageKey));
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
      compareOrdinal(left.recordId ?? "", right.recordId ?? "") ||
      compareOrdinal(left.storageKey ?? "", right.storageKey ?? "") ||
      compareOrdinal(left.code, right.code) ||
      compareOrdinal(left.message, right.message)
    );
  });
}

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
