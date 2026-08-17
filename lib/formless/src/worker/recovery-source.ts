import { recoveryExcludedScopes, type RecoveryByteSource } from "@dpeek/formless-archive/recovery";
import { identityControlPlaneEntityIds } from "@dpeek/formless-identity-control-plane";
import { instanceControlPlaneEntityIds } from "@dpeek/formless-instance-control-plane";
import { CORE_IMAGE_KEY_PREFIX, PROGRAM_DOCUMENT_MEDIA_KEY_PREFIX } from "@dpeek/formless-media";
import { canonicalJsonStringify, type AppSchema } from "@dpeek/formless-schema";
import { formatStoredRecordsForArtifact, type StoredRecord } from "@dpeek/formless-storage";
import {
  FORMLESS_PROGRAM_ARTIFACT_KIND,
  FORMLESS_PROGRAM_ARTIFACT_VERSION,
  type FormlessProgramArtifact,
} from "../program/artifact.ts";
import {
  getBootstrapRecords,
  getCurrentCursor,
  readCurrentStoredSchema,
  type ProgramSchemaProvenance,
} from "./storage.ts";

export const RECOVERY_NATIVE_PAYLOAD_FORMAT = "formless.worker.recovery";
export const RECOVERY_NATIVE_PAYLOAD_VERSION = 1;
export const RECOVERY_NATIVE_PROGRAM_KIND = "formless.recovery.native.program";
export const RECOVERY_NATIVE_MEDIA_KIND = "formless.recovery.native.media";
export const RECOVERY_PROGRAM_PAYLOAD_ID = "program";
export const RECOVERY_PROGRAM_PAYLOAD_KIND = "program";
export const RECOVERY_MEDIA_PAYLOAD_KIND = "media";
export const RECOVERY_PROGRAM_SOURCE_INTERNAL_PATH = "/_internal/recovery/program";

const RECOVERY_NATIVE_MEDIA_HEADER_PREFIX_BYTES = 4;
export const RECOVERY_PROGRAM_SOURCE_CURSOR_HEADER = "X-Formless-Recovery-Source-Cursor";
export const RECOVERY_PROGRAM_SOURCE_PROVENANCE_HEADER = "X-Formless-Recovery-Source-Provenance";
export const RECOVERY_NATIVE_PAYLOAD_FORMAT_HEADER = "X-Formless-Recovery-Native-Payload-Format";
export const RECOVERY_NATIVE_PAYLOAD_VERSION_HEADER = "X-Formless-Recovery-Native-Payload-Version";
export const RECOVERY_EXCLUDED_SCOPES_HEADER = "X-Formless-Recovery-Excluded-Scopes";

const securityEntityIds = new Set(identityControlPlaneEntityIds);
const providerEntityIds = new Set(instanceControlPlaneEntityIds);
const recoveryMediaNamespaces = [
  {
    kind: "document",
    prefix: `${PROGRAM_DOCUMENT_MEDIA_KEY_PREFIX}/`,
  },
  {
    kind: "image",
    prefix: `${CORE_IMAGE_KEY_PREFIX}/`,
  },
] as const;

export type RecoveryNativeProgramPayload = {
  artifact: FormlessProgramArtifact;
  kind: typeof RECOVERY_NATIVE_PROGRAM_KIND;
  programProvenance: ProgramSchemaProvenance;
  records: StoredRecord[];
  sourceCursor: number;
  tombstones: StoredRecord[];
  version: typeof RECOVERY_NATIVE_PAYLOAD_VERSION;
};

export type RecoveryProgramSource = {
  excludedScopes: [...typeof recoveryExcludedScopes];
  nativePayloadFormat: typeof RECOVERY_NATIVE_PAYLOAD_FORMAT;
  nativePayloadVersion: typeof RECOVERY_NATIVE_PAYLOAD_VERSION;
  payload: {
    byteLength: number;
    bytes: Uint8Array;
    id: typeof RECOVERY_PROGRAM_PAYLOAD_ID;
    kind: typeof RECOVERY_PROGRAM_PAYLOAD_KIND;
  };
  programProvenance: ProgramSchemaProvenance;
  sourceCursor: number;
};

export type RecoveryProgramSourceState = {
  programProvenance: ProgramSchemaProvenance;
  records: readonly StoredRecord[];
  schema: AppSchema;
  sourceCursor: number;
};

export type RecoveryProgramSourceIdentity = {
  programProvenance: ProgramSchemaProvenance;
  sourceCursor: number;
};

export type RecoveryMediaFidelityMetadata = {
  checksums: R2StringChecksums;
  customMetadata: Record<string, string>;
  etag: string;
  httpEtag: string;
  httpMetadata: {
    cacheControl?: string;
    cacheExpiry?: string;
    contentDisposition?: string;
    contentEncoding?: string;
    contentLanguage?: string;
    contentType?: string;
  };
  storageClass: string;
  uploadedAt: string;
};

export type RecoveryMediaInventoryEntry = {
  contentType: string | null;
  fidelityMetadata: RecoveryMediaFidelityMetadata;
  immutableObjectIdentity: string;
  key: string;
  kind: (typeof recoveryMediaNamespaces)[number]["kind"];
  size: number;
};

export type RecoveryMediaInventoryPage = {
  entries: RecoveryMediaInventoryEntry[];
  kind: RecoveryMediaInventoryEntry["kind"];
  nextCursor?: string;
};

export type RecoveryNativeMediaHeader = Omit<RecoveryMediaInventoryEntry, "kind"> & {
  kind: typeof RECOVERY_NATIVE_MEDIA_KIND;
  mediaKind: RecoveryMediaInventoryEntry["kind"];
  provider: "r2";
  version: typeof RECOVERY_NATIVE_PAYLOAD_VERSION;
};

export type RecoveryMediaPayloadSource = {
  byteLength: number;
  bytes: RecoveryByteSource;
  id: string;
  kind: typeof RECOVERY_MEDIA_PAYLOAD_KIND;
  media: RecoveryMediaInventoryEntry;
};

export function readRecoveryProgramSource(storage: DurableObjectStorage): RecoveryProgramSource {
  return storage.transactionSync(() => {
    const storedSchema = readCurrentStoredSchema(storage);

    if (storedSchema?.schemaProvenance?.kind !== "program") {
      throw new Error("Recovery requires an active Program artifact with Program provenance.");
    }

    return createRecoveryProgramSource({
      programProvenance: storedSchema.schemaProvenance,
      records: getBootstrapRecords(storage),
      schema: storedSchema.schema,
      sourceCursor: getCurrentCursor(storage),
    });
  });
}

export function readRecoveryProgramSourceIdentity(
  storage: DurableObjectStorage,
): RecoveryProgramSourceIdentity {
  return storage.transactionSync(() => {
    const storedSchema = readCurrentStoredSchema(storage);

    if (storedSchema?.schemaProvenance?.kind !== "program") {
      throw new Error("Recovery requires an active Program artifact with Program provenance.");
    }

    return {
      programProvenance: storedSchema.schemaProvenance,
      sourceCursor: getCurrentCursor(storage),
    };
  });
}

export function createRecoveryProgramSource(
  state: RecoveryProgramSourceState,
): RecoveryProgramSource {
  const classifications = recoveryEntityClassifications(state.schema);
  const applicationRecords = state.records.filter((record) => {
    const classification = classifications.get(record.entity);

    return classification === "application";
  });
  const records = formatStoredRecordsForArtifact(
    state.schema,
    applicationRecords.filter((record) => record.deletedAt === undefined),
  );
  const tombstones = formatStoredRecordsForArtifact(
    state.schema,
    applicationRecords.filter((record) => record.deletedAt !== undefined),
  );
  const artifact = {
    kind: FORMLESS_PROGRAM_ARTIFACT_KIND,
    version: FORMLESS_PROGRAM_ARTIFACT_VERSION,
    sourceSchema: state.schema,
    schemaProvenance: state.programProvenance,
  } satisfies FormlessProgramArtifact;
  const nativePayload = {
    artifact,
    kind: RECOVERY_NATIVE_PROGRAM_KIND,
    programProvenance: state.programProvenance,
    records,
    sourceCursor: state.sourceCursor,
    tombstones,
    version: RECOVERY_NATIVE_PAYLOAD_VERSION,
  } satisfies RecoveryNativeProgramPayload;
  const bytes = new TextEncoder().encode(canonicalJsonStringify(nativePayload));

  return {
    excludedScopes: [...recoveryExcludedScopes],
    nativePayloadFormat: RECOVERY_NATIVE_PAYLOAD_FORMAT,
    nativePayloadVersion: RECOVERY_NATIVE_PAYLOAD_VERSION,
    payload: {
      byteLength: bytes.byteLength,
      bytes,
      id: RECOVERY_PROGRAM_PAYLOAD_ID,
      kind: RECOVERY_PROGRAM_PAYLOAD_KIND,
    },
    programProvenance: state.programProvenance,
    sourceCursor: state.sourceCursor,
  };
}

export function handleRecoveryProgramSourceDurableObjectRequest(
  request: Request,
  storage: DurableObjectStorage,
): Response | undefined {
  const url = new URL(request.url);

  if (url.pathname !== RECOVERY_PROGRAM_SOURCE_INTERNAL_PATH) {
    return undefined;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, {
      headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" },
      status: 405,
    });
  }

  if (request.method === "HEAD") {
    const identity = readRecoveryProgramSourceIdentity(storage);

    return new Response(null, {
      headers: {
        "Cache-Control": "no-store",
        [RECOVERY_PROGRAM_SOURCE_CURSOR_HEADER]: String(identity.sourceCursor),
        [RECOVERY_PROGRAM_SOURCE_PROVENANCE_HEADER]: identity.programProvenance.sourceSchemaHash,
      },
    });
  }

  const source = readRecoveryProgramSource(storage);

  return new Response(source.payload.bytes as unknown as BodyInit, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Length": String(source.payload.byteLength),
      "Content-Type": "application/octet-stream",
      [RECOVERY_EXCLUDED_SCOPES_HEADER]: source.excludedScopes.join(","),
      [RECOVERY_NATIVE_PAYLOAD_FORMAT_HEADER]: source.nativePayloadFormat,
      [RECOVERY_NATIVE_PAYLOAD_VERSION_HEADER]: String(source.nativePayloadVersion),
      [RECOVERY_PROGRAM_SOURCE_CURSOR_HEADER]: String(source.sourceCursor),
      [RECOVERY_PROGRAM_SOURCE_PROVENANCE_HEADER]: source.programProvenance.sourceSchemaHash,
    },
  });
}

export async function* listRecoveryApplicationMediaPages(
  bucket: R2Bucket,
  options: { pageSize?: number } = {},
): AsyncGenerator<RecoveryMediaInventoryPage> {
  const limit = recoveryMediaPageSize(options.pageSize);

  for (const namespace of recoveryMediaNamespaces) {
    let cursor: string | undefined;
    const seenCursors = new Set<string>();

    do {
      const listing = await bucket.list({
        ...(cursor === undefined ? {} : { cursor }),
        include: ["customMetadata", "httpMetadata"],
        limit,
        prefix: namespace.prefix,
      } as R2ListOptions);
      const entries = listing.objects.map((object) =>
        recoveryMediaInventoryEntry(object, namespace.kind),
      );
      const nextCursor = listing.truncated ? listing.cursor : undefined;

      yield {
        entries,
        kind: namespace.kind,
        ...(nextCursor === undefined ? {} : { nextCursor }),
      };

      if (nextCursor !== undefined) {
        if (nextCursor === cursor || seenCursors.has(nextCursor)) {
          throw new Error(
            `Recovery media ${namespace.kind} listing repeated cursor "${nextCursor}".`,
          );
        }
        seenCursors.add(nextCursor);
      }

      cursor = nextCursor;
    } while (cursor !== undefined);
  }
}

export async function readRecoveryApplicationMediaInventory(
  bucket: R2Bucket,
  options: { pageSize?: number } = {},
): Promise<RecoveryMediaInventoryEntry[]> {
  const entries: RecoveryMediaInventoryEntry[] = [];
  const keys = new Set<string>();

  for await (const page of listRecoveryApplicationMediaPages(bucket, options)) {
    for (const entry of page.entries) {
      if (keys.has(entry.key)) {
        throw new Error(`Recovery media inventory includes duplicate key "${entry.key}".`);
      }
      keys.add(entry.key);
      entries.push(entry);
    }
  }

  return entries;
}

export async function readRecoveryApplicationMediaObject(
  bucket: R2Bucket,
  entry: RecoveryMediaInventoryEntry,
): Promise<RecoveryMediaPayloadSource> {
  const namespace = recoveryMediaNamespaceForKey(entry.key);

  if (namespace?.kind !== entry.kind) {
    throw new Error(`Recovery media key "${entry.key}" is outside its application namespace.`);
  }

  const object = await bucket.get(entry.key, {
    onlyIf: { etagMatches: entry.fidelityMetadata.etag },
  });

  if (object === null) {
    throw new Error(`Recovery media object "${entry.key}" disappeared after inventory.`);
  }

  if (!("body" in object)) {
    throw new Error(`Recovery media object "${entry.key}" changed after inventory.`);
  }

  const current = recoveryMediaInventoryEntry(object, namespace.kind);
  if (canonicalJsonStringify(current) !== canonicalJsonStringify(entry)) {
    object.body.cancel().catch(() => undefined);
    throw new Error(`Recovery media object "${entry.key}" changed after inventory.`);
  }

  const { kind: mediaKind, ...media } = entry;
  const header = {
    ...media,
    kind: RECOVERY_NATIVE_MEDIA_KIND,
    mediaKind,
    provider: "r2",
    version: RECOVERY_NATIVE_PAYLOAD_VERSION,
  } satisfies RecoveryNativeMediaHeader;
  const headerBytes = new TextEncoder().encode(canonicalJsonStringify(header));
  const prefix = encodeUnsignedInt32(headerBytes.byteLength);

  return {
    byteLength: prefix.byteLength + headerBytes.byteLength + entry.size,
    bytes: recoveryNativeMediaBytes(prefix, headerBytes, object.body, entry),
    id: `media:${entry.key}`,
    kind: RECOVERY_MEDIA_PAYLOAD_KIND,
    media: entry,
  };
}

function recoveryEntityClassifications(
  schema: AppSchema,
): Map<string, "application" | "provider" | "security"> {
  const classifications = new Map<string, "application" | "provider" | "security">();
  const runtimeOwnedEntities = new Set(Object.keys(schema.runtime?.controlPlane?.entities ?? {}));

  for (const entity of schema.entities) {
    if (securityEntityIds.has(entity.id)) {
      classifications.set(entity.key, "security");
      continue;
    }

    if (providerEntityIds.has(entity.id)) {
      classifications.set(entity.key, "provider");
      continue;
    }

    if (runtimeOwnedEntities.has(entity.key)) {
      throw new Error(
        `Recovery cannot classify runtime-owned entity "${entity.key}" with stable id "${entity.id}".`,
      );
    }

    classifications.set(entity.key, "application");
  }

  return classifications;
}

function recoveryMediaPageSize(value: number | undefined): number {
  if (value === undefined) {
    return 1000;
  }

  if (!Number.isSafeInteger(value) || value < 1 || value > 1000) {
    throw new Error("Recovery media page size must be an integer from 1 to 1000.");
  }

  return value;
}

function recoveryMediaNamespaceForKey(key: string) {
  return recoveryMediaNamespaces.find((namespace) => key.startsWith(namespace.prefix));
}

function recoveryMediaInventoryEntry(
  object: R2Object,
  kind: RecoveryMediaInventoryEntry["kind"],
): RecoveryMediaInventoryEntry {
  if (!Number.isSafeInteger(object.size) || object.size < 0) {
    throw new Error(`Recovery media object "${object.key}" has an invalid byte size.`);
  }

  if (object.version.trim() === "" || object.etag.trim() === "") {
    throw new Error(`Recovery media object "${object.key}" has no immutable identity.`);
  }

  return {
    contentType: object.httpMetadata?.contentType ?? null,
    fidelityMetadata: {
      checksums: sortedChecksums(object.checksums.toJSON()),
      customMetadata: sortedStringRecord(object.customMetadata ?? {}),
      etag: object.etag,
      httpEtag: object.httpEtag,
      httpMetadata: recoveryHttpMetadata(object.httpMetadata),
      storageClass: object.storageClass,
      uploadedAt: object.uploaded.toISOString(),
    },
    immutableObjectIdentity: object.version,
    key: object.key,
    kind,
    size: object.size,
  };
}

function recoveryHttpMetadata(metadata: R2HTTPMetadata | undefined) {
  if (metadata === undefined) {
    return {};
  }

  return {
    ...(metadata.cacheControl === undefined ? {} : { cacheControl: metadata.cacheControl }),
    ...(metadata.cacheExpiry === undefined
      ? {}
      : { cacheExpiry: metadata.cacheExpiry.toISOString() }),
    ...(metadata.contentDisposition === undefined
      ? {}
      : { contentDisposition: metadata.contentDisposition }),
    ...(metadata.contentEncoding === undefined
      ? {}
      : { contentEncoding: metadata.contentEncoding }),
    ...(metadata.contentLanguage === undefined
      ? {}
      : { contentLanguage: metadata.contentLanguage }),
    ...(metadata.contentType === undefined ? {} : { contentType: metadata.contentType }),
  };
}

function sortedStringRecord<Value extends string>(
  values: Record<string, Value>,
): Record<string, Value> {
  return Object.fromEntries(
    Object.entries(values).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function sortedChecksums(values: R2StringChecksums): R2StringChecksums {
  return Object.fromEntries(
    Object.entries(values)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function encodeUnsignedInt32(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new Error("Recovery native media header is too large.");
  }

  const bytes = new Uint8Array(RECOVERY_NATIVE_MEDIA_HEADER_PREFIX_BYTES);
  new DataView(bytes.buffer).setUint32(0, value, false);
  return bytes;
}

async function* recoveryNativeMediaBytes(
  prefix: Uint8Array,
  header: Uint8Array,
  body: ReadableStream<Uint8Array>,
  entry: RecoveryMediaInventoryEntry,
): AsyncGenerator<Uint8Array> {
  yield prefix;
  yield header;

  const reader = body.getReader();
  let completed = false;
  let received = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) {
        completed = true;
        break;
      }

      if (!(next.value instanceof Uint8Array)) {
        throw new Error(`Recovery media object "${entry.key}" returned non-byte data.`);
      }

      received += next.value.byteLength;
      if (received > entry.size) {
        throw new Error(`Recovery media object "${entry.key}" exceeds its inventory byte size.`);
      }
      yield next.value;
    }
  } finally {
    if (!completed) {
      await reader.cancel().catch(() => undefined);
    }
    reader.releaseLock();
  }

  if (received !== entry.size) {
    throw new Error(
      `Recovery media object "${entry.key}" ended at ${received} bytes; expected ${entry.size}.`,
    );
  }
}
