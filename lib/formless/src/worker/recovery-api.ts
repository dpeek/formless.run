import {
  RECOVERY_CAPTURE_KIND,
  RECOVERY_CAPTURE_PATH,
  RECOVERY_DISCOVERY_PATH,
  RECOVERY_MEDIA_TYPE,
  RECOVERY_PROTOCOL_VERSION,
  encodeRecoverySnapshot,
  formatRecoveryDiscovery,
  recoveryDiscoveryV1,
  recoveryExcludedScopes,
  recoveryIncludedScopes,
  type RecoveryByteSource,
  type RecoveryCaptureHeader,
  type RecoveryPayloadInput,
} from "@dpeek/formless-archive/recovery";
import { canonicalJsonStringify, isSourceSchemaHash } from "@dpeek/formless-schema";
import packageJson from "../../package.json";
import { FORMLESS_PROGRAM_STORAGE_IDENTITY } from "../program/target.ts";
import { authorizeAdminBearer, type AuthorityAdminGuardEnv } from "./authority-admin-guard.ts";
import {
  RECOVERY_EXCLUDED_SCOPES_HEADER,
  RECOVERY_NATIVE_PAYLOAD_FORMAT,
  RECOVERY_NATIVE_PAYLOAD_FORMAT_HEADER,
  RECOVERY_NATIVE_PAYLOAD_VERSION,
  RECOVERY_NATIVE_PAYLOAD_VERSION_HEADER,
  RECOVERY_PROGRAM_PAYLOAD_ID,
  RECOVERY_PROGRAM_PAYLOAD_KIND,
  RECOVERY_PROGRAM_SOURCE_CURSOR_HEADER,
  RECOVERY_PROGRAM_SOURCE_INTERNAL_PATH,
  RECOVERY_PROGRAM_SOURCE_PROVENANCE_HEADER,
  readRecoveryApplicationMediaInventory,
  readRecoveryApplicationMediaObject,
  type RecoveryMediaInventoryEntry,
  type RecoveryMediaPayloadSource,
  type RecoveryProgramSourceIdentity,
} from "./recovery-source.ts";

type RecoveryApiEnv = AuthorityAdminGuardEnv & {
  FORMLESS_AUTHORITY: DurableObjectNamespace;
  FORMLESS_DEPLOY_VERSION?: string;
  FORMLESS_MEDIA: R2Bucket;
};

export type RecoveryProgramPayloadSource = RecoveryProgramSourceIdentity & {
  byteLength: number;
  bytes: RecoveryByteSource;
};

export type RecoveryPayloadSourceDependencies = {
  readMediaInventory: () => Promise<RecoveryMediaInventoryEntry[]>;
  readMediaObject: (entry: RecoveryMediaInventoryEntry) => Promise<RecoveryMediaPayloadSource>;
  readProgramIdentity: () => Promise<RecoveryProgramSourceIdentity>;
};

export async function handleRecoveryApiRequest(
  request: Request,
  env: RecoveryApiEnv,
): Promise<Response | undefined> {
  const pathname = new URL(request.url).pathname;

  if (pathname !== RECOVERY_DISCOVERY_PATH && pathname !== RECOVERY_CAPTURE_PATH) {
    return undefined;
  }

  const allowedMethod = pathname === RECOVERY_DISCOVERY_PATH ? "GET" : "POST";
  if (request.method !== allowedMethod) {
    return jsonResponse({ error: "Method not allowed." }, 405, { Allow: allowedMethod });
  }

  const authorization = authorizeAdminBearer(
    request,
    env,
    "Admin bearer authorization is required for recovery snapshots.",
  );

  if (!authorization.authorized) {
    return jsonResponse(
      { error: authorization.error },
      authorization.status,
      authorization.headers,
    );
  }

  if (pathname === RECOVERY_DISCOVERY_PATH) {
    return new Response(formatRecoveryDiscovery(recoveryDiscoveryV1), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  }

  try {
    return await createRecoverySnapshotResponse(request, env);
  } catch {
    return jsonResponse({ error: "Recovery snapshot source is unavailable." }, 409);
  }
}

async function createRecoverySnapshotResponse(
  request: Request,
  env: RecoveryApiEnv,
): Promise<Response> {
  const media = await readRecoveryApplicationMediaInventory(env.FORMLESS_MEDIA);
  const program = await readRecoveryProgramPayloadSource(request, env);
  const header = recoveryCaptureHeader(request, env, program);
  const encoded = encodeRecoverySnapshot({
    header,
    payloads: createRecoveryPayloads(program, media, {
      readMediaInventory: () => readRecoveryApplicationMediaInventory(env.FORMLESS_MEDIA),
      readMediaObject: (entry) => readRecoveryApplicationMediaObject(env.FORMLESS_MEDIA, entry),
      readProgramIdentity: () => readRecoveryProgramSourceIdentity(request, env),
    }),
  });

  return new Response(readableStreamFromAsyncIterator(encoded), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": RECOVERY_MEDIA_TYPE,
    },
  });
}

function recoveryCaptureHeader(
  request: Request,
  env: RecoveryApiEnv,
  program: RecoveryProgramPayloadSource,
): RecoveryCaptureHeader {
  return {
    captureId: `recovery:${crypto.randomUUID()}`,
    capturedAt: new Date().toISOString(),
    excludedScopes: [...recoveryExcludedScopes],
    formlessVersion: packageJson.version,
    includedScopes: [...recoveryIncludedScopes],
    kind: RECOVERY_CAPTURE_KIND,
    nativePayloadFormat: RECOVERY_NATIVE_PAYLOAD_FORMAT,
    nativePayloadVersion: RECOVERY_NATIVE_PAYLOAD_VERSION,
    sourceCursor: String(program.sourceCursor),
    sourceOrigin: new URL(request.url).origin,
    version: RECOVERY_PROTOCOL_VERSION,
    workerVersion: configuredWorkerVersion(env),
  };
}

export async function* createRecoveryPayloads(
  program: RecoveryProgramPayloadSource,
  media: readonly RecoveryMediaInventoryEntry[],
  dependencies: RecoveryPayloadSourceDependencies,
): AsyncGenerator<RecoveryPayloadInput> {
  yield {
    byteLength: program.byteLength,
    bytes: program.bytes,
    id: RECOVERY_PROGRAM_PAYLOAD_ID,
    kind: RECOVERY_PROGRAM_PAYLOAD_KIND,
  };

  for (const entry of media) {
    yield await dependencies.readMediaObject(entry);
  }

  const [currentProgram, currentMedia] = await Promise.all([
    dependencies.readProgramIdentity(),
    dependencies.readMediaInventory(),
  ]);

  if (!recoveryProgramSourceIdentitiesEqual(program, currentProgram)) {
    throw new Error("Recovery Program source changed during capture.");
  }

  if (canonicalJsonStringify(media) !== canonicalJsonStringify(currentMedia)) {
    throw new Error("Recovery media source changed during capture.");
  }
}

async function readRecoveryProgramPayloadSource(
  request: Request,
  env: RecoveryApiEnv,
): Promise<RecoveryProgramPayloadSource> {
  const response = await recoveryProgramAuthorityFetch(request, env, "GET");

  if (!response.ok || response.body === null) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`Recovery Program source failed with HTTP ${response.status}.`);
  }

  try {
    const identity = parseRecoveryProgramSourceIdentity(response.headers);
    const byteLength = parseNonNegativeIntegerHeader(
      response.headers,
      "Content-Length",
      "Recovery Program payload byte length",
    );
    const excludedScopes = response.headers.get(RECOVERY_EXCLUDED_SCOPES_HEADER);
    const nativePayloadFormat = response.headers.get(RECOVERY_NATIVE_PAYLOAD_FORMAT_HEADER);
    const nativePayloadVersion = response.headers.get(RECOVERY_NATIVE_PAYLOAD_VERSION_HEADER);

    if (excludedScopes !== recoveryExcludedScopes.join(",")) {
      throw new Error("Recovery Program source excluded scopes do not match the stable contract.");
    }
    if (nativePayloadFormat !== RECOVERY_NATIVE_PAYLOAD_FORMAT) {
      throw new Error("Recovery Program source native payload format does not match.");
    }
    if (nativePayloadVersion !== String(RECOVERY_NATIVE_PAYLOAD_VERSION)) {
      throw new Error("Recovery Program source native payload version does not match.");
    }

    return { ...identity, byteLength, bytes: response.body };
  } catch (error) {
    await response.body.cancel().catch(() => undefined);
    throw error;
  }
}

async function readRecoveryProgramSourceIdentity(
  request: Request,
  env: RecoveryApiEnv,
): Promise<RecoveryProgramSourceIdentity> {
  const response = await recoveryProgramAuthorityFetch(request, env, "HEAD");

  if (!response.ok) {
    throw new Error(`Recovery Program source recheck failed with HTTP ${response.status}.`);
  }

  return parseRecoveryProgramSourceIdentity(response.headers);
}

function recoveryProgramAuthorityFetch(
  request: Request,
  env: RecoveryApiEnv,
  method: "GET" | "HEAD",
): Promise<Response> {
  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_PROGRAM_STORAGE_IDENTITY);
  const url = new URL(RECOVERY_PROGRAM_SOURCE_INTERNAL_PATH, request.url);

  return env.FORMLESS_AUTHORITY.get(id).fetch(new Request(url, { method }));
}

function parseRecoveryProgramSourceIdentity(headers: Headers): RecoveryProgramSourceIdentity {
  const sourceCursor = parseNonNegativeIntegerHeader(
    headers,
    RECOVERY_PROGRAM_SOURCE_CURSOR_HEADER,
    "Recovery Program source cursor",
  );
  const sourceSchemaHash = headers.get(RECOVERY_PROGRAM_SOURCE_PROVENANCE_HEADER);

  if (!isSourceSchemaHash(sourceSchemaHash)) {
    throw new Error("Recovery Program source provenance is invalid.");
  }

  return {
    programProvenance: { kind: "program", sourceSchemaHash },
    sourceCursor,
  };
}

function recoveryProgramSourceIdentitiesEqual(
  left: RecoveryProgramSourceIdentity,
  right: RecoveryProgramSourceIdentity,
): boolean {
  return (
    left.sourceCursor === right.sourceCursor &&
    left.programProvenance.sourceSchemaHash === right.programProvenance.sourceSchemaHash
  );
}

function parseNonNegativeIntegerHeader(headers: Headers, name: string, context: string): number {
  const raw = headers.get(name);
  const value = raw === null || raw.trim() === "" ? Number.NaN : Number(raw);

  if (!Number.isSafeInteger(value) || value < 0 || String(value) !== raw) {
    throw new Error(`${context} is invalid.`);
  }

  return value;
}

function configuredWorkerVersion(env: RecoveryApiEnv): string {
  const configured = env.FORMLESS_DEPLOY_VERSION?.trim();

  return configured === undefined || configured === "" ? packageJson.version : configured;
}

function readableStreamFromAsyncIterator(
  iterator: AsyncIterator<Uint8Array>,
): ReadableStream<Uint8Array> {
  const stream = new IdentityTransformStream();
  void pumpRecoveryIterator(iterator, stream.writable);

  return stream.readable;
}

async function pumpRecoveryIterator(
  iterator: AsyncIterator<Uint8Array>,
  writable: WritableStream<Uint8Array>,
): Promise<void> {
  const writer = writable.getWriter();

  try {
    while (true) {
      const next = await iterator.next();

      if (next.done) {
        await writer.close();
        return;
      }

      await writer.write(next.value);
    }
  } catch (error) {
    await iterator.return?.().catch(() => undefined);
    await writer.abort(error).catch(() => undefined);
  } finally {
    writer.releaseLock();
  }
}

function jsonResponse(body: unknown, status: number, headers: HeadersInit = {}): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Cache-Control", "no-store");

  return Response.json(body, { headers: responseHeaders, status });
}
