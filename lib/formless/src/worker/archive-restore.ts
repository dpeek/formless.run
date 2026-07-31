import {
  INSTANCE_ARCHIVE_KIND,
  parsePortableArchive,
  planPortableArchiveRestore,
  type AppArchive,
  type AppArchiveData,
  type AppArchiveMediaObject,
  type ArchiveRestoreMediaFile,
  type ArchiveRestorePlan,
  type ArchiveRestorePlanError,
  type ArchiveRestorePlanStep,
  type InstanceArchiveControlPlane,
  type PortableArchive,
} from "../program/archive.ts";
import type { AppInstall, InstallableAppPackage } from "@dpeek/formless-installed-apps";
import {
  installedAppStorageIdentity,
  programStorageIdentity,
  type AuthorityStorageIdentity,
  type InstalledAppStorageIdentity,
} from "../shared/app-storage-identity.ts";
import { listResolvedAppPackages, type AppPackageResolver } from "../shared/app-packages.ts";
import {
  CORE_IMAGE_KEY_PREFIX,
  MEDIA_DOCUMENT_UPLOAD_MAX_BYTES,
  MEDIA_PDF_CONTENT_TYPE,
  coreMediaHrefForKey,
  isDocumentMediaAsset,
  mediaAssetFromObjectMetadata,
} from "@dpeek/formless-media";
import {
  restoreDocumentMedia,
  restoreImageMedia,
  type MediaObjectStore,
  type MediaWriteResponse,
} from "@dpeek/formless-media/worker";
import { type BootstrapResponse } from "../shared/protocol.ts";
import type { AppSchema } from "@dpeek/formless-schema";
import {
  ensureStorageTables,
  restoreStorageSnapshotOutcome,
  type WriteOutcome,
} from "./storage.ts";

export type ArchiveRestoreMediaRead = ArchiveRestoreMediaFile & {
  bytes: Uint8Array;
};

export type ArchiveRestoreMediaAdapter = {
  listFiles: () => Promise<ArchiveRestoreMediaFile[]>;
  readFile: (archivePath: string) => Promise<ArchiveRestoreMediaRead | undefined>;
  restoreObject: (input: {
    bytes: Uint8Array;
    identity: AuthorityStorageIdentity;
    object: AppArchiveMediaObject;
  }) => Promise<MediaWriteResponse>;
  validateObject?: (input: {
    bytes: Uint8Array;
    identity: AuthorityStorageIdentity;
    object: AppArchiveMediaObject;
  }) => Promise<void>;
};

export type ArchiveRestoreApplyTarget = {
  listInstalledApps: () => AppInstall[] | Promise<AppInstall[]>;
  packageResolver?: AppPackageResolver;
  packages?: readonly InstallableAppPackage[];
  restoreControlPlane?: (controlPlane: InstanceArchiveControlPlane) => void | Promise<void>;
  restoreAppData: (input: {
    app: AppInstall;
    data: AppArchiveData;
    identity: InstalledAppStorageIdentity;
  }) => BootstrapResponse | Promise<BootstrapResponse>;
  restoreInstall: (input: {
    action: "create" | "replace";
    install: AppInstall;
  }) => void | Promise<void>;
  media?: ArchiveRestoreMediaAdapter;
  sourceSchemas?: Partial<Record<string, AppSchema>>;
};

export type ArchiveRestoreExecutionErrorCode =
  | ArchiveRestorePlanError["code"]
  | "app-data-restore-failed"
  | "control-plane-restore-failed"
  | "dry-run-policy"
  | "install-restore-failed"
  | "invalid-archive"
  | "media-read-failed"
  | "media-restore-failed"
  | "missing-app-storage-identity"
  | "missing-media-adapter";

export type ArchiveRestoreExecutionError = {
  appInstallId?: string;
  archivePath?: string;
  code: ArchiveRestoreExecutionErrorCode;
  message: string;
  storageKey?: string;
};

export type ArchiveRestoreStepReport =
  | {
      action: "create" | "replace";
      appInstallId: string;
      kind: "install";
    }
  | {
      appInstallId: string;
      archivePath: string;
      byteSize: number;
      kind: "media";
      storageKey: string;
    }
  | {
      archivePath: string;
      byteSize: number;
      kind: "programMedia";
      storageKey: string;
    }
  | {
      appInstallId: string;
      dataKind: AppArchiveData["kind"];
      kind: "appData";
      recordCount: number;
      schemaKey: string;
      tombstoneCount: number;
    };

export type ArchiveRestoreExecutionReport = {
  applied: boolean;
  steps: ArchiveRestoreStepReport[];
  summary: ArchiveRestorePlan["summary"];
};

export type ArchiveRestoreExecutionResult =
  | {
      ok: true;
      plan: ArchiveRestorePlan;
      report: ArchiveRestoreExecutionReport;
    }
  | {
      errors: ArchiveRestoreExecutionError[];
      ok: false;
      plan?: ArchiveRestorePlan;
    };

export type ArchiveAppDataRestoreInput = {
  data: AppArchiveData;
  identity: InstalledAppStorageIdentity;
};

export async function dryRunPortableArchiveRestore(
  value: unknown,
  target: ArchiveRestoreApplyTarget,
): Promise<ArchiveRestoreExecutionResult> {
  const planned = await parseAndPlanArchiveRestore(value, target);

  if (!planned.ok) {
    return planned;
  }

  const mediaReads = await prepareMediaReads(planned.plan.steps, target.media);

  if (!mediaReads.ok) {
    return {
      errors: mediaReads.errors,
      ok: false,
      plan: planned.plan,
    };
  }

  const mediaValidation = await validatePreparedMediaRestores(
    planned.archive,
    planned.plan.steps,
    mediaReads.files,
    target,
  );

  if (!mediaValidation.ok) {
    return {
      errors: mediaValidation.errors,
      ok: false,
      plan: planned.plan,
    };
  }

  return {
    ok: true,
    plan: planned.plan,
    report: {
      applied: false,
      steps: stepReports(planned.plan.steps),
      summary: planned.plan.summary,
    },
  };
}

export async function applyPortableArchiveRestore(
  value: unknown,
  target: ArchiveRestoreApplyTarget,
): Promise<ArchiveRestoreExecutionResult> {
  const planned = await parseAndPlanArchiveRestore(value, target);

  if (!planned.ok) {
    return planned;
  }

  if (planned.plan.dryRun) {
    return {
      errors: [
        {
          code: "dry-run-policy",
          message: "Archive restore policy is dry-run; apply requires dryRun false.",
        },
      ],
      ok: false,
      plan: planned.plan,
    };
  }

  const mediaReads = await prepareMediaReads(planned.plan.steps, target.media);

  if (!mediaReads.ok) {
    return {
      errors: mediaReads.errors,
      ok: false,
      plan: planned.plan,
    };
  }

  const mediaValidation = await validatePreparedMediaRestores(
    planned.archive,
    planned.plan.steps,
    mediaReads.files,
    target,
  );

  if (!mediaValidation.ok) {
    return {
      errors: mediaValidation.errors,
      ok: false,
      plan: planned.plan,
    };
  }

  const archiveApps = archiveAppsByInstallId(planned.archive);
  const reports: ArchiveRestoreStepReport[] = [];

  for (const step of planned.plan.steps) {
    if (step.kind === "createInstall" || step.kind === "replaceInstall") {
      try {
        await target.restoreInstall({
          action: step.kind === "createInstall" ? "create" : "replace",
          install: step.install,
        });
      } catch (error) {
        return restoreFailure(
          "install-restore-failed",
          step.install.installId,
          error,
          planned.plan,
        );
      }

      reports.push({
        action: step.kind === "createInstall" ? "create" : "replace",
        appInstallId: step.install.installId,
        kind: "install",
      });
      continue;
    }

    if (step.kind === "restoreMedia") {
      const programMedia = "program" in step;
      const archiveApp = programMedia ? undefined : archiveApps.get(step.appInstallId);
      const identity = programMedia
        ? programStorageIdentity()
        : archiveApp &&
          installedAppStorageIdentity(
            {
              installId: archiveApp.app.installId,
              packageAppKey: archiveApp.app.packageAppKey,
            },
            target.packageResolver,
          );
      const mediaRead = mediaReads.files.get(step.archivePath);

      if (!identity || (!programMedia && !archiveApp) || !mediaRead || !target.media) {
        return {
          errors: [
            {
              ...(programMedia ? {} : { appInstallId: step.appInstallId }),
              archivePath: step.archivePath,
              code:
                !identity || (!programMedia && !archiveApp)
                  ? "missing-app-storage-identity"
                  : "media-read-failed",
              message:
                !identity || (!programMedia && !archiveApp)
                  ? programMedia
                    ? "Program media does not resolve to Program storage."
                    : `Archive app "${step.appInstallId}" does not resolve to installed app storage.`
                  : `Archive media file "${step.archivePath}" was not prepared for restore.`,
              storageKey: step.storageKey,
            },
          ],
          ok: false,
          plan: planned.plan,
        };
      }

      try {
        await target.media.restoreObject({
          bytes: mediaRead.bytes,
          identity,
          object: {
            archivePath: step.archivePath,
            ...(step.asset === undefined ? {} : { asset: step.asset }),
            byteSize: step.byteSize,
            contentType: step.contentType,
            deliveryHref: step.deliveryHref,
            storageKey: step.storageKey,
          },
        });
      } catch (error) {
        return restoreFailure(
          "media-restore-failed",
          programMedia ? undefined : step.appInstallId,
          error,
          planned.plan,
          {
            archivePath: step.archivePath,
            storageKey: step.storageKey,
          },
        );
      }

      reports.push(
        programMedia
          ? {
              archivePath: step.archivePath,
              byteSize: step.byteSize,
              kind: "programMedia",
              storageKey: step.storageKey,
            }
          : {
              appInstallId: step.appInstallId,
              archivePath: step.archivePath,
              byteSize: step.byteSize,
              kind: "media",
              storageKey: step.storageKey,
            },
      );
      continue;
    }

    const archiveApp = archiveApps.get(step.appInstallId);
    const identity =
      archiveApp &&
      installedAppStorageIdentity(
        {
          installId: archiveApp.app.installId,
          packageAppKey: archiveApp.app.packageAppKey,
        },
        target.packageResolver,
      );

    if (!archiveApp || !identity) {
      return {
        errors: [
          {
            appInstallId: step.appInstallId,
            code: "missing-app-storage-identity",
            message: `Archive app "${step.appInstallId}" does not resolve to installed app storage.`,
          },
        ],
        ok: false,
        plan: planned.plan,
      };
    }

    try {
      await target.restoreAppData({
        app: planned.plan.apps.find((appPlan) => appPlan.app.installId === step.appInstallId)!.app,
        data: archiveApp.data,
        identity,
      });
    } catch (error) {
      return restoreFailure("app-data-restore-failed", step.appInstallId, error, planned.plan);
    }

    reports.push({
      appInstallId: step.appInstallId,
      dataKind: step.dataKind,
      kind: "appData",
      recordCount: step.recordCount,
      schemaKey: step.schemaKey,
      tombstoneCount: step.tombstoneCount,
    });
  }

  if (planned.archive.kind === INSTANCE_ARCHIVE_KIND && planned.archive.controlPlane) {
    if (!target.restoreControlPlane) {
      return {
        errors: [
          {
            code: "invalid-archive",
            message: "Instance archive restore requires a control-plane restore adapter.",
          },
        ],
        ok: false,
        plan: planned.plan,
      };
    }

    try {
      await target.restoreControlPlane(planned.archive.controlPlane);
    } catch (error) {
      return {
        errors: [
          {
            code: "control-plane-restore-failed",
            message:
              error instanceof Error
                ? error.message
                : "Control-plane records could not be restored.",
          },
        ],
        ok: false,
        plan: planned.plan,
      };
    }
  }

  return {
    ok: true,
    plan: planned.plan,
    report: {
      applied: true,
      steps: reports,
      summary: planned.plan.summary,
    },
  };
}

export function restoreArchiveAppDataToStorage(
  storage: DurableObjectStorage,
  input: ArchiveAppDataRestoreInput,
): BootstrapResponse {
  return restoreArchiveAppDataToStorageOutcome(storage, input).response;
}

export function restoreArchiveAppDataToStorageOutcome(
  storage: DurableObjectStorage,
  input: ArchiveAppDataRestoreInput,
): WriteOutcome<BootstrapResponse> {
  ensureStorageTables(storage);
  assertArchiveAppDataMatchesIdentity(input.data, input.identity);
  return restoreStorageSnapshotOutcome(storage, input.data);
}

export async function restoreArchiveMediaObjectToStore(
  store: MediaObjectStore,
  identity: AuthorityStorageIdentity,
  object: AppArchiveMediaObject,
  bytes: Uint8Array,
): Promise<MediaWriteResponse> {
  const coreKeyPrefix = mediaKeyPrefix(CORE_IMAGE_KEY_PREFIX);

  if (object.storageKey.startsWith(coreKeyPrefix)) {
    if (object.asset?.kind === "document") {
      throw new Error(
        `Archive media key "${object.storageKey}" cannot use document metadata for a core image.`,
      );
    }

    const result = await restoreImageMedia({
      asset: object.asset ?? coreMediaAssetForObject(object),
      bytes,
      contentType: object.contentType,
      hrefForKey: coreMediaHrefForKey,
      key: object.storageKey,
      keyPrefix: coreKeyPrefix,
      store,
    });

    if (!result.ok) {
      throw new Error(result.error);
    }

    if (result.upload.href !== object.deliveryHref) {
      throw new Error(`Restored media href for "${object.storageKey}" did not match the archive.`);
    }

    return result.upload;
  }

  if (object.asset?.kind === "document") {
    const asset = object.asset;
    const expectedHref = documentArchiveDeliveryHref(identity, asset.id);
    const expectedOwnerAppInstallId =
      identity.kind === "appInstall" ? identity.installId : undefined;

    if (asset.ownerAppInstallId !== expectedOwnerAppInstallId) {
      throw new Error(
        identity.kind === "program"
          ? "Program document media cannot contain app-install owner metadata."
          : "Installed-app document media must match its target install.",
      );
    }

    const existing = await compatibleExistingArchiveDocument(store, object, bytes);

    if (existing) {
      return {
        asset,
        assetId: asset.id,
        contentType: asset.contentType,
        href: asset.deliveryHref,
        key: asset.storageKey,
        size: asset.byteSize,
      };
    }

    const result = await restoreDocumentMedia({
      asset,
      bytes,
      compatibility: {
        acceptedMimeTypes: [MEDIA_PDF_CONTENT_TYPE],
        access: asset.access,
        maxBytes: MEDIA_DOCUMENT_UPLOAD_MAX_BYTES,
        ...(identity.kind === "appInstall" ? { ownerAppInstallId: identity.installId } : {}),
      },
      contentType: object.contentType,
      hrefForAssetId: (assetId) => documentArchiveDeliveryHref(identity, assetId),
      store,
    });

    if (!result.ok) {
      throw new Error(result.error);
    }

    if (
      result.upload.href !== expectedHref ||
      result.upload.key !== object.storageKey ||
      result.upload.size !== object.byteSize
    ) {
      throw new Error(`Restored document for "${object.storageKey}" did not match the archive.`);
    }

    return result.upload;
  }

  throw new Error(
    `Archive media key "${object.storageKey}" is not restorable media for "${
      identity.kind === "appInstall" ? identity.installId : identity.authorityName
    }".`,
  );
}

export async function validateArchiveMediaObjectRestoreToStore(
  store: MediaObjectStore,
  object: AppArchiveMediaObject,
  bytes: Uint8Array,
): Promise<void> {
  if (object.asset?.kind === "document") {
    await compatibleExistingArchiveDocument(store, object, bytes);
  }
}

async function compatibleExistingArchiveDocument(
  store: MediaObjectStore,
  object: AppArchiveMediaObject,
  bytes: Uint8Array,
): Promise<boolean> {
  if (object.asset?.kind !== "document") {
    return false;
  }

  const existing = await store.getObject(object.storageKey);

  if (!existing) {
    return false;
  }

  const existingAsset = mediaAssetFromObjectMetadata(existing.customMetadata);
  const existingBytes =
    existing.body === null
      ? undefined
      : new Uint8Array(await new Response(existing.body).arrayBuffer());

  if (
    !existingBytes ||
    !existingAsset ||
    existingAsset.kind !== "document" ||
    !sameDocumentMediaAsset(existingAsset, object.asset) ||
    !sameBytes(existingBytes, bytes)
  ) {
    throw new Error(
      `Archive document "${object.storageKey}" collides with incompatible immutable media.`,
    );
  }

  return true;
}

function documentArchiveDeliveryHref(identity: AuthorityStorageIdentity, assetId: string): string {
  return `${identity.apiRoutePrefix}/media/documents/${assetId}`;
}

function sameDocumentMediaAsset(
  left: NonNullable<AppArchiveMediaObject["asset"]>,
  right: NonNullable<AppArchiveMediaObject["asset"]>,
): boolean {
  return (
    isDocumentMediaAsset(left) &&
    isDocumentMediaAsset(right) &&
    left.access === right.access &&
    left.byteSize === right.byteSize &&
    left.contentType === right.contentType &&
    left.deliveryHref === right.deliveryHref &&
    left.filename === right.filename &&
    left.id === right.id &&
    left.label === right.label &&
    left.ownerAppInstallId === right.ownerAppInstallId &&
    left.provider === right.provider &&
    left.status === right.status &&
    left.storageKey === right.storageKey
  );
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

function coreMediaAssetForObject(object: AppArchiveMediaObject) {
  const keyPrefix = mediaKeyPrefix(CORE_IMAGE_KEY_PREFIX);
  const id = object.storageKey.startsWith(keyPrefix)
    ? object.storageKey.slice(keyPrefix.length)
    : object.storageKey;

  return {
    byteSize: object.byteSize,
    contentType: object.contentType,
    deliveryHref: object.deliveryHref,
    id,
    kind: "image" as const,
    label: id,
    provider: "r2",
    status: "ready" as const,
    storageKey: object.storageKey,
  };
}

async function parseAndPlanArchiveRestore(
  value: unknown,
  target: ArchiveRestoreApplyTarget,
): Promise<
  | {
      archive: PortableArchive;
      ok: true;
      plan: ArchiveRestorePlan;
    }
  | {
      errors: ArchiveRestoreExecutionError[];
      ok: false;
    }
> {
  let archive: PortableArchive;

  try {
    archive = parsePortableArchive(value, { packageResolver: target.packageResolver });
  } catch (error) {
    return {
      errors: [
        {
          code: "invalid-archive",
          message: error instanceof Error ? error.message : "Archive is invalid.",
        },
      ],
      ok: false,
    };
  }

  const planResult = planPortableArchiveRestore(archive, {
    installedApps: await target.listInstalledApps(),
    mediaFiles: target.media ? await target.media.listFiles() : undefined,
    packageResolver: target.packageResolver,
    packages: target.packages ?? listResolvedAppPackages(target.packageResolver),
    sourceSchemas: target.sourceSchemas ?? workerSourceSchemas(),
  });

  if (!planResult.ok) {
    return {
      errors: planResult.errors.map((error) => ({ ...error })),
      ok: false,
    };
  }

  return { archive, ok: true, plan: planResult.plan };
}

async function prepareMediaReads(
  steps: readonly ArchiveRestorePlanStep[],
  media: ArchiveRestoreMediaAdapter | undefined,
): Promise<
  | {
      files: Map<string, ArchiveRestoreMediaRead>;
      ok: true;
    }
  | {
      errors: ArchiveRestoreExecutionError[];
      ok: false;
    }
> {
  const mediaSteps = steps.filter((step) => step.kind === "restoreMedia");

  if (mediaSteps.length === 0) {
    return { files: new Map(), ok: true };
  }

  if (!media) {
    return {
      errors: [
        {
          code: "missing-media-adapter",
          message: "Archive restore requires a media adapter for archived media objects.",
        },
      ],
      ok: false,
    };
  }

  const files = new Map<string, ArchiveRestoreMediaRead>();
  const errors: ArchiveRestoreExecutionError[] = [];

  for (const step of mediaSteps) {
    try {
      const file = await media.readFile(step.archivePath);

      if (!file) {
        errors.push({
          ...("program" in step ? {} : { appInstallId: step.appInstallId }),
          archivePath: step.archivePath,
          code: "media-read-failed",
          message: `Archive media file "${step.archivePath}" is missing.`,
          storageKey: step.storageKey,
        });
        continue;
      }

      if (
        file.byteSize !== step.byteSize ||
        normalizeContentType(file.contentType) !== normalizeContentType(step.contentType) ||
        file.bytes.byteLength !== step.byteSize
      ) {
        errors.push({
          ...("program" in step ? {} : { appInstallId: step.appInstallId }),
          archivePath: step.archivePath,
          code: "media-read-failed",
          message: `Archive media file "${step.archivePath}" does not match the restore plan.`,
          storageKey: step.storageKey,
        });
        continue;
      }

      files.set(step.archivePath, file);
    } catch (error) {
      errors.push({
        ...("program" in step ? {} : { appInstallId: step.appInstallId }),
        archivePath: step.archivePath,
        code: "media-read-failed",
        message: error instanceof Error ? error.message : "Archive media file could not be read.",
        storageKey: step.storageKey,
      });
    }
  }

  return errors.length > 0 ? { errors, ok: false } : { files, ok: true };
}

async function validatePreparedMediaRestores(
  archive: PortableArchive,
  steps: readonly ArchiveRestorePlanStep[],
  files: Map<string, ArchiveRestoreMediaRead>,
  target: ArchiveRestoreApplyTarget,
): Promise<
  | {
      ok: true;
    }
  | {
      errors: ArchiveRestoreExecutionError[];
      ok: false;
    }
> {
  if (!target.media?.validateObject) {
    return { ok: true };
  }

  const apps = archiveAppsByInstallId(archive);
  const errors: ArchiveRestoreExecutionError[] = [];

  for (const step of steps) {
    if (step.kind !== "restoreMedia") {
      continue;
    }

    const programMedia = "program" in step;
    const app = programMedia ? undefined : apps.get(step.appInstallId);
    const identity = programMedia
      ? programStorageIdentity()
      : app &&
        installedAppStorageIdentity(
          {
            installId: app.app.installId,
            packageAppKey: app.app.packageAppKey,
          },
          target.packageResolver,
        );
    const file = files.get(step.archivePath);

    if (!identity || !file) {
      errors.push({
        ...(programMedia ? {} : { appInstallId: step.appInstallId }),
        archivePath: step.archivePath,
        code: !identity ? "missing-app-storage-identity" : "media-read-failed",
        message: !identity
          ? programMedia
            ? "Program media does not resolve to Program storage."
            : `Archive app "${step.appInstallId}" does not resolve to installed app storage.`
          : `Archive media file "${step.archivePath}" was not prepared for restore.`,
        storageKey: step.storageKey,
      });
      continue;
    }

    try {
      await target.media.validateObject({
        bytes: file.bytes,
        identity,
        object: {
          archivePath: step.archivePath,
          ...(step.asset === undefined ? {} : { asset: step.asset }),
          byteSize: step.byteSize,
          contentType: step.contentType,
          deliveryHref: step.deliveryHref,
          storageKey: step.storageKey,
        },
      });
    } catch (error) {
      errors.push({
        ...(programMedia ? {} : { appInstallId: step.appInstallId }),
        archivePath: step.archivePath,
        code: "media-restore-failed",
        message: error instanceof Error ? error.message : "Archive media restore is incompatible.",
        storageKey: step.storageKey,
      });
    }
  }

  return errors.length === 0 ? { ok: true } : { errors, ok: false };
}

function archiveAppsByInstallId(archive: PortableArchive): Map<string, AppArchive> {
  const apps = archive.kind === "formless.instanceArchive" ? archive.apps : [archive];

  return new Map(apps.map((app) => [app.app.installId, app]));
}

function assertArchiveAppDataMatchesIdentity(
  data: AppArchiveData,
  identity: InstalledAppStorageIdentity,
) {
  const schemaKey = data.schemaKey;

  if (schemaKey !== identity.sourceSchemaKey) {
    throw new Error(
      `Archive app data schemaKey must be "${identity.sourceSchemaKey}" for installed app "${identity.installId}".`,
    );
  }

  if (data.storageIdentity !== identity.authorityName) {
    throw new Error(
      `Archive app data storageIdentity must be "${identity.authorityName}" for installed app "${identity.installId}".`,
    );
  }
}

function stepReports(steps: readonly ArchiveRestorePlanStep[]): ArchiveRestoreStepReport[] {
  return steps.map((step) => {
    if (step.kind === "createInstall" || step.kind === "replaceInstall") {
      return {
        action: step.kind === "createInstall" ? "create" : "replace",
        appInstallId: step.install.installId,
        kind: "install",
      };
    }

    if (step.kind === "restoreMedia") {
      return "program" in step
        ? {
            archivePath: step.archivePath,
            byteSize: step.byteSize,
            kind: "programMedia",
            storageKey: step.storageKey,
          }
        : {
            appInstallId: step.appInstallId,
            archivePath: step.archivePath,
            byteSize: step.byteSize,
            kind: "media",
            storageKey: step.storageKey,
          };
    }

    return {
      appInstallId: step.appInstallId,
      dataKind: step.dataKind,
      kind: "appData",
      recordCount: step.recordCount,
      schemaKey: step.schemaKey,
      tombstoneCount: step.tombstoneCount,
    };
  });
}

function workerSourceSchemas(): Partial<Record<string, AppSchema>> {
  return {};
}

function restoreFailure(
  code: ArchiveRestoreExecutionErrorCode,
  appInstallId: string | undefined,
  error: unknown,
  plan: ArchiveRestorePlan,
  details: { archivePath?: string; storageKey?: string } = {},
): ArchiveRestoreExecutionResult {
  return {
    errors: [
      {
        ...(appInstallId === undefined ? {} : { appInstallId }),
        code,
        message: error instanceof Error ? error.message : "Archive restore failed.",
        ...details,
      },
    ],
    ok: false,
    plan,
  };
}

function normalizeContentType(value: string) {
  return value.split(";")[0]?.trim().toLowerCase() ?? "";
}

function mediaKeyPrefix(prefix: string) {
  return prefix.endsWith("/") ? prefix : `${prefix}/`;
}
