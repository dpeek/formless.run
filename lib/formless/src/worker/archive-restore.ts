import {
  parseInstanceArchive,
  planInstanceArchiveRestore,
  type ArchiveMediaObject,
  type ArchiveRestoreMediaFile,
  type ArchiveRestorePlan,
  type ArchiveRestorePlanError,
  type ArchiveRestorePlanStep,
  type InstanceArchive,
} from "../program/archive.ts";
import type { FormlessProgramArtifact } from "../program/artifact.ts";
import type { ProgramSharedRuntimeDefinition } from "../program/composition.ts";
import { formlessProgramArchiveSnapshotContract } from "../program/runtime.ts";
import { FORMLESS_PROGRAM_API_ROUTE_PREFIX } from "../program/target.ts";
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
import type { AppSchema } from "@dpeek/formless-schema";
import type { StorageSnapshot } from "@dpeek/formless-storage";

export type ArchiveRestoreMediaRead = ArchiveRestoreMediaFile & {
  bytes: Uint8Array;
};

export type ArchiveRestoreMediaAdapter = {
  listFiles: () => Promise<ArchiveRestoreMediaFile[]>;
  readFile: (archivePath: string) => Promise<ArchiveRestoreMediaRead | undefined>;
  restoreObject: (input: {
    bytes: Uint8Array;
    object: ArchiveMediaObject;
  }) => Promise<MediaWriteResponse>;
  validateObject?: (input: { bytes: Uint8Array; object: ArchiveMediaObject }) => Promise<void>;
};

export type ArchiveRestoreTransaction = {
  rollback: () => Promise<void>;
};

export type ArchiveRestoreApplyTarget = {
  beginRestore: () => Promise<ArchiveRestoreTransaction>;
  media?: ArchiveRestoreMediaAdapter;
  programArtifact?: FormlessProgramArtifact;
  programSchema?: AppSchema;
  programSharedRuntime?: ProgramSharedRuntimeDefinition;
  replaceMedia?: (desiredStorageKeys: ReadonlySet<string>) => Promise<void>;
  restoreProgram: (snapshot: StorageSnapshot) => void | Promise<void>;
};

export type ArchiveRestoreExecutionErrorCode =
  | ArchiveRestorePlanError["code"]
  | "atomic-restore-failed"
  | "dry-run-policy"
  | "invalid-archive"
  | "media-read-failed"
  | "media-restore-failed"
  | "missing-media-adapter"
  | "program-restore-failed";

export type ArchiveRestoreExecutionError = {
  archivePath?: string;
  code: ArchiveRestoreExecutionErrorCode;
  message: string;
  storageKey?: string;
};

export type ArchiveRestoreStepReport =
  | {
      archivePath: string;
      byteSize: number;
      kind: "media";
      storageKey: string;
    }
  | {
      dataKind: StorageSnapshot["kind"];
      kind: "program";
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

export async function dryRunInstanceArchiveRestore(
  value: unknown,
  target: ArchiveRestoreApplyTarget,
): Promise<ArchiveRestoreExecutionResult> {
  const prepared = await prepareArchiveRestore(value, target);

  if (!prepared.ok) {
    return prepared;
  }

  return {
    ok: true,
    plan: prepared.plan,
    report: {
      applied: false,
      steps: stepReports(prepared.plan.steps),
      summary: prepared.plan.summary,
    },
  };
}

export async function applyInstanceArchiveRestore(
  value: unknown,
  target: ArchiveRestoreApplyTarget,
): Promise<ArchiveRestoreExecutionResult> {
  const prepared = await prepareArchiveRestore(value, target);

  if (!prepared.ok) {
    return prepared;
  }

  if (prepared.plan.dryRun) {
    return {
      errors: [
        {
          code: "dry-run-policy",
          message: "Archive restore policy is dry-run; apply requires dryRun false.",
        },
      ],
      ok: false,
      plan: prepared.plan,
    };
  }

  let transaction: ArchiveRestoreTransaction;

  try {
    transaction = await target.beginRestore();
  } catch (error) {
    return restoreFailure("atomic-restore-failed", error, prepared.plan);
  }

  const reports: ArchiveRestoreStepReport[] = [];

  try {
    for (const step of prepared.plan.steps) {
      if (step.kind === "restoreMedia") {
        const mediaRead = prepared.mediaFiles.get(step.archivePath);

        if (!mediaRead || !target.media) {
          throw executionFailure(
            "media-read-failed",
            `Archive media file "${step.archivePath}" was not prepared for restore.`,
            { archivePath: step.archivePath, storageKey: step.storageKey },
          );
        }

        try {
          await target.media.restoreObject({
            bytes: mediaRead.bytes,
            object: mediaObjectFromStep(step),
          });
        } catch (error) {
          throw executionFailure(
            "media-restore-failed",
            error instanceof Error ? error.message : "Program media restore failed.",
            { archivePath: step.archivePath, storageKey: step.storageKey },
          );
        }

        reports.push({
          archivePath: step.archivePath,
          byteSize: step.byteSize,
          kind: "media",
          storageKey: step.storageKey,
        });
        continue;
      }

      try {
        await target.restoreProgram(prepared.archive.program.snapshot);
      } catch (error) {
        throw executionFailure(
          "program-restore-failed",
          error instanceof Error ? error.message : "Program records could not be restored.",
        );
      }

      reports.push({
        dataKind: step.dataKind,
        kind: "program",
        recordCount: step.recordCount,
        schemaKey: step.schemaKey,
        tombstoneCount: step.tombstoneCount,
      });
    }

    await target.replaceMedia?.(
      new Set(prepared.archive.media.objects.map((object) => object.storageKey)),
    );
  } catch (error) {
    const executionError = asExecutionFailure(error);

    try {
      await transaction.rollback();
    } catch (rollbackError) {
      return {
        errors: [
          executionError,
          {
            code: "atomic-restore-failed",
            message: `Archive rollback failed: ${errorMessage(rollbackError)}`,
          },
        ],
        ok: false,
        plan: prepared.plan,
      };
    }

    return { errors: [executionError], ok: false, plan: prepared.plan };
  }

  return {
    ok: true,
    plan: prepared.plan,
    report: {
      applied: true,
      steps: reports,
      summary: prepared.plan.summary,
    },
  };
}

export async function restoreArchiveMediaObjectToStore(
  store: MediaObjectStore,
  object: ArchiveMediaObject,
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
    const expectedHref = documentArchiveDeliveryHref(asset.id);
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
      },
      contentType: object.contentType,
      hrefForAssetId: documentArchiveDeliveryHref,
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

  throw new Error(`Archive media key "${object.storageKey}" is not restorable Program media.`);
}

export async function validateArchiveMediaObjectRestoreToStore(
  store: MediaObjectStore,
  object: ArchiveMediaObject,
  bytes: Uint8Array,
): Promise<void> {
  if (object.asset?.kind === "document") {
    await compatibleExistingArchiveDocument(store, object, bytes);
  }
}

async function prepareArchiveRestore(
  value: unknown,
  target: ArchiveRestoreApplyTarget,
): Promise<
  | {
      archive: InstanceArchive;
      mediaFiles: Map<string, ArchiveRestoreMediaRead>;
      ok: true;
      plan: ArchiveRestorePlan;
    }
  | {
      errors: ArchiveRestoreExecutionError[];
      ok: false;
      plan?: ArchiveRestorePlan;
    }
> {
  let archive: InstanceArchive;

  try {
    archive = parseInstanceArchive(value, {
      programArtifact: target.programArtifact,
      programSchema: target.programSchema,
      programSharedRuntime: target.programSharedRuntime,
    });
  } catch (error) {
    return {
      errors: [{ code: "invalid-archive", message: errorMessage(error) }],
      ok: false,
    };
  }

  const mediaFiles = target.media ? await target.media.listFiles() : undefined;
  const planResult = planInstanceArchiveRestore(archive, {
    mediaFiles,
    programSnapshotContract: formlessProgramArchiveSnapshotContract({
      artifact: target.programArtifact,
      schema: target.programSchema,
      sharedRuntime: target.programSharedRuntime,
    }),
  });

  if (!planResult.ok) {
    return {
      errors: planResult.errors.map((error) => ({ ...error })),
      ok: false,
    };
  }

  const mediaReads = await prepareMediaReads(planResult.plan.steps, target.media);

  if (!mediaReads.ok) {
    return { errors: mediaReads.errors, ok: false, plan: planResult.plan };
  }

  const mediaValidation = await validatePreparedMediaRestores(
    planResult.plan.steps,
    mediaReads.files,
    target,
  );

  if (!mediaValidation.ok) {
    return { errors: mediaValidation.errors, ok: false, plan: planResult.plan };
  }

  return {
    archive,
    mediaFiles: mediaReads.files,
    ok: true,
    plan: planResult.plan,
  };
}

async function prepareMediaReads(
  steps: readonly ArchiveRestorePlanStep[],
  media: ArchiveRestoreMediaAdapter | undefined,
): Promise<
  | { files: Map<string, ArchiveRestoreMediaRead>; ok: true }
  | { errors: ArchiveRestoreExecutionError[]; ok: false }
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
          message: "Archive restore requires a media adapter for Program media.",
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

      if (
        !file ||
        file.byteSize !== step.byteSize ||
        normalizeContentType(file.contentType) !== normalizeContentType(step.contentType) ||
        file.bytes.byteLength !== step.byteSize
      ) {
        errors.push({
          archivePath: step.archivePath,
          code: "media-read-failed",
          message: `Archive media file "${step.archivePath}" is missing or does not match the restore plan.`,
          storageKey: step.storageKey,
        });
        continue;
      }

      files.set(step.archivePath, file);
    } catch (error) {
      errors.push({
        archivePath: step.archivePath,
        code: "media-read-failed",
        message: errorMessage(error),
        storageKey: step.storageKey,
      });
    }
  }

  return errors.length > 0 ? { errors, ok: false } : { files, ok: true };
}

async function validatePreparedMediaRestores(
  steps: readonly ArchiveRestorePlanStep[],
  files: Map<string, ArchiveRestoreMediaRead>,
  target: ArchiveRestoreApplyTarget,
): Promise<{ ok: true } | { errors: ArchiveRestoreExecutionError[]; ok: false }> {
  if (!target.media?.validateObject) {
    return { ok: true };
  }

  const errors: ArchiveRestoreExecutionError[] = [];

  for (const step of steps) {
    if (step.kind !== "restoreMedia") {
      continue;
    }

    const file = files.get(step.archivePath);

    if (!file) {
      errors.push({
        archivePath: step.archivePath,
        code: "media-read-failed",
        message: `Archive media file "${step.archivePath}" was not prepared for restore.`,
        storageKey: step.storageKey,
      });
      continue;
    }

    try {
      await target.media.validateObject({
        bytes: file.bytes,
        object: mediaObjectFromStep(step),
      });
    } catch (error) {
      errors.push({
        archivePath: step.archivePath,
        code: "media-restore-failed",
        message: errorMessage(error),
        storageKey: step.storageKey,
      });
    }
  }

  return errors.length === 0 ? { ok: true } : { errors, ok: false };
}

function mediaObjectFromStep(
  step: Extract<ArchiveRestorePlanStep, { kind: "restoreMedia" }>,
): ArchiveMediaObject {
  return {
    archivePath: step.archivePath,
    ...(step.asset === undefined ? {} : { asset: step.asset }),
    byteSize: step.byteSize,
    contentType: step.contentType,
    deliveryHref: step.deliveryHref,
    storageKey: step.storageKey,
  };
}

async function compatibleExistingArchiveDocument(
  store: MediaObjectStore,
  object: ArchiveMediaObject,
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

function documentArchiveDeliveryHref(assetId: string): string {
  return `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/media/documents/${assetId}`;
}

function sameDocumentMediaAsset(
  left: NonNullable<ArchiveMediaObject["asset"]>,
  right: NonNullable<ArchiveMediaObject["asset"]>,
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
    left.provider === right.provider &&
    left.status === right.status &&
    left.storageKey === right.storageKey
  );
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

function coreMediaAssetForObject(object: ArchiveMediaObject) {
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

function stepReports(steps: readonly ArchiveRestorePlanStep[]): ArchiveRestoreStepReport[] {
  return steps.map((step) =>
    step.kind === "restoreMedia"
      ? {
          archivePath: step.archivePath,
          byteSize: step.byteSize,
          kind: "media",
          storageKey: step.storageKey,
        }
      : {
          dataKind: step.dataKind,
          kind: "program",
          recordCount: step.recordCount,
          schemaKey: step.schemaKey,
          tombstoneCount: step.tombstoneCount,
        },
  );
}

type ExecutionFailure = Error & {
  archiveError: ArchiveRestoreExecutionError;
};

function executionFailure(
  code: ArchiveRestoreExecutionErrorCode,
  message: string,
  details: Pick<ArchiveRestoreExecutionError, "archivePath" | "storageKey"> = {},
): ExecutionFailure {
  const error = new Error(message) as ExecutionFailure;
  error.archiveError = { code, message, ...details };
  return error;
}

function asExecutionFailure(error: unknown): ArchiveRestoreExecutionError {
  if (error instanceof Error && "archiveError" in error) {
    return (error as ExecutionFailure).archiveError;
  }

  return { code: "atomic-restore-failed", message: errorMessage(error) };
}

function restoreFailure(
  code: ArchiveRestoreExecutionErrorCode,
  error: unknown,
  plan: ArchiveRestorePlan,
): ArchiveRestoreExecutionResult {
  return {
    errors: [{ code, message: errorMessage(error) }],
    ok: false,
    plan,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Archive restore failed.";
}

function normalizeContentType(value: string) {
  return value.split(";")[0]?.trim().toLowerCase() ?? "";
}

function mediaKeyPrefix(prefix: string) {
  return prefix.endsWith("/") ? prefix : `${prefix}/`;
}
