import {
  ARCHIVE_VERSION,
  INSTANCE_ARCHIVE_KIND,
  archiveMediaReferences,
  formatInstanceArchive,
  instanceArchiveMediaPath,
  type ArchiveMediaObject,
  type ArchiveMediaReference,
  type ArchiveRestorePolicy,
  type InstanceArchive,
} from "../program/archive.ts";
import {
  readInstanceArchiveDirectory,
  writeInstanceArchiveDirectory,
  type ArchiveDiskMediaFile,
  type ArchiveDiskWriteResult,
} from "../program/archive-node.ts";
import {
  canonicalizeFormlessProgramStorageSnapshot,
  formlessProgramArtifact,
  parseFormlessProgramStorageSnapshot,
} from "../program/runtime.ts";
import type { FormlessProgramArtifact } from "../program/artifact.ts";
import { isSourceSchemaHash, type AppSchema } from "@dpeek/formless-schema";
import { FORMLESS_PROGRAM_API_ROUTE_PREFIX } from "../program/target.ts";
import {
  CORE_IMAGE_KEY_PREFIX,
  MEDIA_DOCUMENT_UPLOAD_MAX_BYTES,
  MEDIA_PDF_CONTENT_TYPE,
  coreImageMediaDeliveryFactsForAssetId,
  imageMediaContentTypeForKey,
  isDocumentMediaAsset,
  validatePdfDocumentMediaFile,
  type DocumentMediaAsset,
  type MediaAsset,
} from "@dpeek/formless-media";
import { parseStorageSnapshot, type StorageSnapshot } from "@dpeek/formless-storage";
import { FORMLESS_CLIENT_SOURCE_SCHEMA_HASH_HEADER } from "../shared/protocol.ts";
import {
  resolveFormlessCliAdminToken,
  formlessCliTargetFetchHeaders,
} from "./instance-target-context.ts";

export { INSTANCE_ARCHIVE_MANIFEST_FILE } from "../program/archive.ts";
export type { ArchiveDiskMediaFile, ArchiveDiskWriteResult } from "../program/archive-node.ts";

const INSTANCE_ARCHIVE_RESTORE_API_PATH = "/api/formless/archive/restore";
const ARCHIVE_EXPORT_MEDIA_READ_HEADER = "X-Formless-Archive-Export";

export type ArchiveWorkflowDependencies = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  fetch: typeof fetch;
  now: () => string;
};

export type ArchiveRestoreSummary = {
  mediaCount: number;
  recordCounts: { total: number };
};

export type ArchiveRestoreRemoteResult = {
  ok: boolean;
  plan?: { summary: ArchiveRestoreSummary };
  report?: { applied: boolean; summary: ArchiveRestoreSummary };
  errors?: {
    code?: string;
    currentSourceCursor?: number;
    expectedSourceCursor?: number;
    message: string;
  }[];
};

export type RestoreInstanceArchiveResult = {
  archivePath: string;
  remote: ArchiveRestoreRemoteResult;
};

export class CurrentTargetArchiveSourceValidationError extends Error {
  readonly failureType: "parse" | "validation";

  constructor(failureType: "parse" | "validation", message: string) {
    super(message);
    this.name = "CurrentTargetArchiveSourceValidationError";
    this.failureType = failureType;
  }
}

export type ExportCurrentTargetInstanceArchiveResult = {
  programSchema: AppSchema;
  programSchemaProvenance: FormlessProgramArtifact["schemaProvenance"];
  write: ArchiveDiskWriteResult;
};

export async function exportInstanceArchive(
  input: {
    adminToken?: string | null;
    outDir: string;
    target: string;
  },
  dependencies: ArchiveWorkflowDependencies,
): Promise<ArchiveDiskWriteResult> {
  return (await exportCurrentTargetInstanceArchive(input, dependencies)).write;
}

export async function exportCurrentTargetInstanceArchive(
  input: {
    adminToken?: string | null;
    outDir: string;
    target: string;
  },
  dependencies: ArchiveWorkflowDependencies,
): Promise<ExportCurrentTargetInstanceArchiveResult> {
  const target = normalizeTargetUrl(input.target);
  const exportedAt = dependencies.now();
  const auth = { adminToken: input.adminToken, env: dependencies.env };
  const source = await fetchRemoteProgramArchiveSource({
    auth,
    fetcher: dependencies.fetch,
    target,
  });
  let program: StorageSnapshot;

  try {
    program = parseFormlessProgramStorageSnapshot(
      "Instance archive program snapshot",
      canonicalizeFormlessProgramStorageSnapshot(source.snapshot, {
        schema: source.programSchema,
      }),
      { schema: source.programSchema },
    );
  } catch (error) {
    throw new CurrentTargetArchiveSourceValidationError(
      "validation",
      error instanceof Error ? error.message : "Current target Program snapshot is invalid.",
    );
  }
  const media = await exportRemoteProgramMedia({
    auth,
    fetcher: dependencies.fetch,
    snapshot: program,
    target,
  });
  const archive: InstanceArchive = {
    kind: INSTANCE_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt,
    capabilities: ["core-media-assets"],
    restorePolicy: { dryRun: true },
    program: {
      schemaProvenance: source.programSchemaProvenance,
      snapshot: program,
    },
    media: { objects: media.objects },
  };

  return {
    programSchema: source.programSchema,
    programSchemaProvenance: source.programSchemaProvenance,
    write: await writeInstanceArchiveDirectory(
      {
        archive,
        mediaFiles: media.files,
        outDir: input.outDir,
        programSchema: source.programSchema,
        programSchemaProvenance: source.programSchemaProvenance,
      },
      dependencies,
    ),
  };
}

async function exportRemoteProgramMedia(input: {
  auth?: ArchiveExportAuth;
  fetcher: typeof fetch;
  snapshot: StorageSnapshot;
  target: string;
}): Promise<{ files: ArchiveDiskMediaFile[]; objects: ArchiveMediaObject[] }> {
  const referencesByKey = new Map<string, ArchiveMediaObject>();
  const references = archiveMediaReferences(input.snapshot.schema, input.snapshot.records);
  const documentAssetsByField = await fetchReferencedProgramDocumentAssets(input, references);

  for (const reference of references) {
    if (reference.kind === "image") {
      const facts = coreImageMediaDeliveryFactsForAssetId(reference.assetId);

      if (!facts) {
        throw new Error(
          `Program media field "${reference.entity}.${reference.field}" references invalid image asset "${reference.assetId}".`,
        );
      }

      referencesByKey.set(facts.storageKey, coreMediaReference(facts.storageKey, facts.href));
      continue;
    }

    const asset = documentAssetsByField
      .get(documentReferenceFieldKey(reference))
      ?.get(reference.assetId);

    if (
      !asset ||
      asset.access !== reference.policy.access ||
      !reference.policy.acceptedMimeTypes.includes(asset.contentType) ||
      asset.byteSize > reference.policy.maxBytes ||
      asset.deliveryHref !== `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/media/documents/${asset.id}`
    ) {
      throw new Error(
        `Program document field "${reference.entity}.${reference.field}" references unavailable or incompatible asset "${reference.assetId}".`,
      );
    }

    referencesByKey.set(asset.storageKey, documentMediaReference(asset));
  }

  const files: ArchiveDiskMediaFile[] = [];
  const objects: ArchiveMediaObject[] = [];

  for (const reference of [...referencesByKey.values()].sort((left, right) =>
    compareOrdinal(left.storageKey, right.storageKey),
  )) {
    const response = await input.fetcher(apiUrl(input.target, reference.deliveryHref), {
      headers: archiveExportRequestHeaders(input.auth, reference.contentType, {
        mediaRead: true,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Failed GET ${apiUrl(input.target, reference.deliveryHref)}: HTTP ${
          response.status
        } ${await response.text()}`,
      );
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    const archivePath = instanceArchiveMediaPath({
      assetId:
        reference.asset?.id ?? reference.storageKey.slice(`${CORE_IMAGE_KEY_PREFIX}/`.length),
      kind: reference.asset?.kind ?? "image",
    });

    if (!archivePath) {
      throw new Error(`Media key "${reference.storageKey}" has no canonical archive path.`);
    }
    const object = {
      ...reference,
      archivePath,
      ...(reference.asset === undefined
        ? {}
        : { asset: mediaAssetForArchiveObject(reference.asset, bytes.byteLength) }),
      byteSize: bytes.byteLength,
    };

    validateExportedDocumentPayload(object, response, bytes);
    objects.push(object);
    files.push({
      archivePath,
      byteSize: bytes.byteLength,
      bytes,
      contentType: reference.contentType,
    });
  }

  return { files, objects };
}

async function fetchReferencedProgramDocumentAssets(
  input: {
    auth?: ArchiveExportAuth;
    fetcher: typeof fetch;
    target: string;
  },
  references: readonly ArchiveMediaReference[],
): Promise<Map<string, Map<string, DocumentMediaAsset>>> {
  const documentReferences = references.filter(
    (reference): reference is Extract<ArchiveMediaReference, { kind: "document" }> =>
      reference.kind === "document",
  );
  const referencesByField = new Map<string, Extract<ArchiveMediaReference, { kind: "document" }>>();

  for (const reference of documentReferences) {
    referencesByField.set(documentReferenceFieldKey(reference), reference);
  }

  const assetsByField = new Map<string, Map<string, DocumentMediaAsset>>();

  for (const [fieldKey, reference] of [...referencesByField.entries()].sort(([left], [right]) =>
    compareOrdinal(left, right),
  )) {
    const search = new URLSearchParams({ entity: reference.entity, field: reference.field });
    const response = await fetchJson<unknown>(
      input.fetcher,
      apiUrl(
        input.target,
        `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/media/documents?${search.toString()}`,
      ),
      {
        headers: archiveExportRequestHeaders(input.auth, "application/json", {
          mediaRead: true,
        }),
      },
    );
    const assets = parseDocumentMediaList("Program document list", response);

    assetsByField.set(fieldKey, new Map(assets.map((asset) => [asset.id, asset])));
  }

  return assetsByField;
}

async function fetchRemoteProgramArchiveSource(input: {
  auth?: ArchiveExportAuth;
  fetcher: typeof fetch;
  target: string;
}): Promise<{
  programSchema: AppSchema;
  programSchemaProvenance: FormlessProgramArtifact["schemaProvenance"];
  snapshot: StorageSnapshot;
}> {
  const url = apiUrl(
    input.target,
    `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/snapshot?actorKind=cliDeployer`,
  );
  const response = await input.fetcher(url, {
    headers: archiveExportRequestHeaders(input.auth, "application/json"),
  });

  if (!response.ok) {
    throw new Error(`Failed GET ${url}: HTTP ${response.status} ${await response.text()}`);
  }

  let value: unknown;

  try {
    value = JSON.parse(await response.text()) as unknown;
  } catch (error) {
    throw new CurrentTargetArchiveSourceValidationError(
      "parse",
      error instanceof Error ? error.message : "Current target snapshot JSON is invalid.",
    );
  }

  try {
    const snapshot = parseStorageSnapshot(value);
    const sourceSchemaHash = response.headers.get(FORMLESS_CLIENT_SOURCE_SCHEMA_HASH_HEADER);
    if (!isSourceSchemaHash(sourceSchemaHash)) {
      throw new Error("Current target snapshot source schema provenance is invalid.");
    }

    return {
      programSchema: snapshot.schema,
      programSchemaProvenance: { kind: "program", sourceSchemaHash },
      snapshot,
    };
  } catch (error) {
    throw new CurrentTargetArchiveSourceValidationError(
      "validation",
      error instanceof Error ? error.message : "Current target snapshot source is invalid.",
    );
  }
}

export async function restoreInstanceArchive(
  input: {
    adminToken?: string | null;
    apply: boolean;
    archiveDir: string;
    expectedSourceCursor?: number;
    programArtifact?: FormlessProgramArtifact;
    target: string;
  },
  dependencies: ArchiveWorkflowDependencies,
): Promise<RestoreInstanceArchiveResult> {
  return restoreArchive(input, dependencies);
}

export async function restoreWorkspacePushArchive(
  input: {
    adminToken?: string | null;
    apply: boolean;
    archiveDir: string;
    expectedSourceCursor?: number;
    programArtifact?: FormlessProgramArtifact;
    target: string;
  },
  dependencies: ArchiveWorkflowDependencies,
): Promise<RestoreInstanceArchiveResult> {
  return restoreArchive(input, dependencies);
}

async function restoreArchive(
  input: {
    adminToken?: string | null;
    apply: boolean;
    archiveDir: string;
    expectedSourceCursor?: number;
    programArtifact?: FormlessProgramArtifact;
    target: string;
  },
  dependencies: ArchiveWorkflowDependencies,
): Promise<RestoreInstanceArchiveResult> {
  const programArtifact = input.programArtifact ?? formlessProgramArtifact;
  const diskArchive = await readInstanceArchiveDirectory(input.archiveDir, {
    ...dependencies,
    programArtifact,
  });
  const archive: InstanceArchive = {
    ...diskArchive.archive,
    restorePolicy: restorePolicy(input),
  };
  const remote = await postRemoteArchiveRestore(
    {
      adminToken: input.adminToken,
      archive,
      ...(input.expectedSourceCursor === undefined
        ? {}
        : { expectedSourceCursor: input.expectedSourceCursor }),
      mediaFiles: diskArchive.mediaFiles,
      programArtifact,
      target: input.target,
    },
    dependencies,
  );

  return { archivePath: diskArchive.archivePath, remote };
}

function restorePolicy(input: { apply: boolean }): ArchiveRestorePolicy {
  return { dryRun: !input.apply };
}

function parseDocumentMediaList(context: string, value: unknown): DocumentMediaAsset[] {
  if (typeof value !== "object" || value === null || !("assets" in value)) {
    throw new Error(`${context} must include assets.`);
  }

  const assets = (value as { assets?: unknown }).assets;

  if (!Array.isArray(assets) || !assets.every(isDocumentMediaAsset)) {
    throw new Error(`${context} assets must contain valid document media.`);
  }

  return assets;
}

function documentReferenceFieldKey(
  reference: Pick<ArchiveMediaReference, "entity" | "field">,
): string {
  return `${reference.entity}\u0000${reference.field}`;
}

function coreMediaReference(storageKey: string, deliveryHref: string): ArchiveMediaObject {
  const contentType = imageMediaContentTypeForKey(storageKey);
  const keyPrefix = `${CORE_IMAGE_KEY_PREFIX}/`;
  const assetId = storageKey.startsWith(keyPrefix)
    ? storageKey.slice(keyPrefix.length)
    : storageKey;

  if (!contentType) {
    throw new Error(`Media key "${storageKey}" has unsupported content type.`);
  }

  return {
    archivePath: "",
    asset: {
      byteSize: 0,
      contentType,
      deliveryHref,
      id: assetId,
      kind: "image",
      label: assetId,
      provider: "r2",
      status: "ready",
      storageKey,
    },
    byteSize: 0,
    contentType,
    deliveryHref,
    storageKey,
  };
}

function documentMediaReference(asset: DocumentMediaAsset): ArchiveMediaObject {
  return {
    archivePath: "",
    asset,
    byteSize: asset.byteSize,
    contentType: asset.contentType,
    deliveryHref: asset.deliveryHref,
    storageKey: asset.storageKey,
  };
}

function mediaAssetForArchiveObject(asset: MediaAsset, byteSize: number): MediaAsset {
  return asset.kind === "document" ? asset : { ...asset, byteSize };
}

function validateExportedDocumentPayload(
  reference: ArchiveMediaObject,
  response: Response,
  bytes: Uint8Array,
) {
  if (reference.asset?.kind !== "document") {
    return;
  }

  const validation = validatePdfDocumentMediaFile(
    {
      bytes,
      contentType: response.headers.get("Content-Type") ?? "",
      filename: reference.asset.filename,
      size: bytes.byteLength,
    },
    {
      acceptedMimeTypes: [MEDIA_PDF_CONTENT_TYPE],
      maxBytes: MEDIA_DOCUMENT_UPLOAD_MAX_BYTES,
    },
  );

  if (!validation.ok || bytes.byteLength !== reference.asset.byteSize) {
    throw new Error(
      `Document asset "${reference.asset.id}" payload does not match its immutable metadata.`,
    );
  }
}

type ArchiveExportAuth = {
  adminToken?: string | null;
  env?: NodeJS.ProcessEnv;
};

function archiveExportRequestHeaders(
  auth: ArchiveExportAuth | undefined,
  accept: string,
  options: { mediaRead?: boolean } = {},
): Headers {
  const headers = formlessCliTargetFetchHeaders({
    accept,
    adminToken: archiveExportAdminToken(auth),
  });

  if (options.mediaRead) {
    headers.set(ARCHIVE_EXPORT_MEDIA_READ_HEADER, "1");
  }

  return headers;
}

function archiveExportAdminToken(auth: ArchiveExportAuth | undefined): string | undefined {
  return (
    resolveFormlessCliAdminToken({
      env: auth?.env,
      explicitAdminToken: auth?.adminToken,
    }).token ?? undefined
  );
}

async function postRemoteArchiveRestore(
  input: {
    adminToken?: string | null;
    archive: InstanceArchive;
    expectedSourceCursor?: number;
    mediaFiles: readonly ArchiveDiskMediaFile[];
    programArtifact: FormlessProgramArtifact;
    target: string;
  },
  dependencies: ArchiveWorkflowDependencies,
): Promise<ArchiveRestoreRemoteResult> {
  const target = normalizeTargetUrl(input.target);

  const url = apiUrl(target, INSTANCE_ARCHIVE_RESTORE_API_PATH);
  const response = await dependencies.fetch(url, {
    body: JSON.stringify({
      archive: JSON.parse(
        formatInstanceArchive(input.archive, { programArtifact: input.programArtifact }),
      ) as unknown,
      ...(input.expectedSourceCursor === undefined
        ? {}
        : { expectedSourceCursor: input.expectedSourceCursor }),
      mediaFiles: input.mediaFiles.map(archiveRestoreRequestMediaFile),
    }),
    headers: archiveRestoreRequestHeaders(input.adminToken, dependencies.env),
    method: "POST",
  });
  const text = await response.text();
  const remote = parseArchiveRestoreRemoteResult(text);

  if (remote !== undefined) {
    return remote;
  }

  if (response.ok) {
    try {
      return JSON.parse(text) as ArchiveRestoreRemoteResult;
    } catch {
      throw new Error(`Failed POST ${url}: response was not JSON.`);
    }
  }

  throw new Error(`Failed POST ${url}: HTTP ${response.status} ${text}`);
}

function parseArchiveRestoreRemoteResult(value: string): ArchiveRestoreRemoteResult | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("ok" in parsed) ||
      typeof (parsed as { ok?: unknown }).ok !== "boolean"
    ) {
      return undefined;
    }

    return parsed as ArchiveRestoreRemoteResult;
  } catch {
    return undefined;
  }
}

function archiveRestoreRequestHeaders(
  adminToken: string | null | undefined,
  env: NodeJS.ProcessEnv | undefined,
): Headers {
  return formlessCliTargetFetchHeaders({
    accept: "application/json",
    adminToken: resolveFormlessCliAdminToken({ env, explicitAdminToken: adminToken }).token,
    contentType: "application/json",
  });
}

function archiveRestoreRequestMediaFile(file: ArchiveDiskMediaFile) {
  return {
    archivePath: file.archivePath,
    byteSize: file.byteSize,
    bytesBase64: Buffer.from(file.bytes).toString("base64"),
    contentType: file.contentType,
  };
}

function apiUrl(target: string, pathInput: string): string {
  const pathname = pathInput.startsWith("/") ? pathInput.slice(1) : pathInput;
  return new URL(pathname, `${target}/`).toString();
}

function normalizeTargetUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new Error(`Target URL is invalid: ${value}`);
  }
}

async function fetchJson<T>(fetcher: typeof fetch, url: string, init?: RequestInit): Promise<T> {
  const response = await fetcher(url, init);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Failed ${init?.method ?? "GET"} ${url}: HTTP ${response.status} ${text}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Failed ${init?.method ?? "GET"} ${url}: response was not JSON.`);
  }
}

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
