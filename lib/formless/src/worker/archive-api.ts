import { parseInstanceArchive } from "../program/archive.ts";
import { programSharedRuntime } from "../program/compiled/shared.ts";
import {
  FORMLESS_PROGRAM_API_ROUTE_PREFIX,
  FORMLESS_PROGRAM_STORAGE_IDENTITY,
} from "../program/target.ts";
import {
  applyInstanceArchiveRestore,
  ArchiveRestoreSourceConflictError,
  dryRunInstanceArchiveRestore,
  restoreArchiveMediaObjectToStore,
  validateArchiveMediaObjectRestoreToStore,
  type ArchiveRestoreApplyTarget,
  type ArchiveRestoreMediaRead,
} from "./archive-restore.ts";
import {
  ARCHIVE_RESTORE_CONFLICT_CODE,
  ARCHIVE_RESTORE_GUARD_PATH,
  ARCHIVE_RESTORE_GUARD_RELEASE_PATH,
  ARCHIVE_RESTORE_PATH,
  type ArchiveRestoreConflictResponse,
  type ArchiveRestoreGuardResponse,
} from "./archive-restore-protocol.ts";
import { authorizeInstanceWrite, type AuthorityAdminGuardEnv } from "./authority-admin-guard.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import { mediaObjectStoreFromR2Bucket } from "@dpeek/formless-media/worker";
import { CORE_IMAGE_KEY_PREFIX, PROGRAM_DOCUMENT_MEDIA_KEY_PREFIX } from "@dpeek/formless-media";
import { parseStorageSnapshot, type StorageSnapshot } from "@dpeek/formless-storage";

export const INSTANCE_ARCHIVE_RESTORE_API_PATH = "/api/formless/archive/restore";

type InstanceArchiveApiEnv = AuthorityAdminGuardEnv & {
  FORMLESS_AUTHORITY: DurableObjectNamespace;
  FORMLESS_MEDIA: R2Bucket;
};

type ArchiveRestoreRequest = {
  archive: unknown;
  expectedSourceCursor?: number;
  mediaFiles: ArchiveRestoreMediaRead[];
};

type ArchiveMediaBackupObject = {
  bytes: Uint8Array;
  customMetadata?: Record<string, string>;
  httpMetadata?: R2HTTPMetadata;
  key: string;
};

export async function handleInstanceArchiveApiRequest(
  request: Request,
  env: InstanceArchiveApiEnv,
): Promise<Response | undefined> {
  if (!isInstanceArchiveRestorePath(new URL(request.url).pathname)) {
    return undefined;
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);
  return env.FORMLESS_AUTHORITY.get(id).fetch(request);
}

export async function handleInstanceArchiveDurableObjectRequest(
  request: Request,
  _storage: DurableObjectStorage,
  env: InstanceArchiveApiEnv,
): Promise<Response | undefined> {
  const pathname = new URL(request.url).pathname;

  if (!isInstanceArchiveRestorePath(pathname)) {
    return undefined;
  }

  try {
    if (pathname !== INSTANCE_ARCHIVE_RESTORE_API_PATH) {
      return jsonResponse({ error: "Not found." }, 404);
    }

    if (request.method !== "POST") {
      return methodNotAllowedResponse("POST");
    }

    const authorization = await authorizeInstanceWrite(request, env);

    if (!authorization.authorized) {
      return jsonResponse(
        { error: authorization.error },
        authorization.status,
        authorization.headers,
      );
    }

    const body = parseArchiveRestoreRequest(await readJson(request));
    const archive = parseInstanceArchive(body.archive, { programSharedRuntime });
    const mediaFilesByPath = new Map(body.mediaFiles.map((file) => [file.archivePath, file]));
    const target = archiveRestoreApiTarget(
      request,
      env,
      mediaFilesByPath,
      body.expectedSourceCursor,
    );
    const result = archive.restorePolicy.dryRun
      ? await dryRunInstanceArchiveRestore(archive, target)
      : await applyInstanceArchiveRestore(archive, target);

    return jsonResponse(
      result,
      result.ok
        ? 200
        : result.errors.some((error) => error.code === "target-source-conflict")
          ? 409
          : 400,
    );
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, 400);
  }
}

function archiveRestoreApiTarget(
  request: Request,
  env: InstanceArchiveApiEnv,
  mediaFilesByPath: Map<string, ArchiveRestoreMediaRead>,
  expectedSourceCursor: number | undefined,
): ArchiveRestoreApplyTarget {
  let activeGuardToken: string | undefined;
  let programRestored = false;

  return {
    beginRestore: async () => {
      const guardToken = crypto.randomUUID();
      const guard = await beginProgramArchiveRestoreGuard(request, env, {
        ...(expectedSourceCursor === undefined ? {} : { expectedSourceCursor }),
        guardToken,
      });
      activeGuardToken = guard.guardToken;
      let media: ArchiveMediaBackupObject[];

      try {
        media = await readProgramMediaBackup(env.FORMLESS_MEDIA);
      } catch (error) {
        await releaseProgramArchiveRestoreGuard(request, env, guard.guardToken);
        activeGuardToken = undefined;
        throw error;
      }

      return {
        commit: async () => {
          await releaseProgramArchiveRestoreGuard(request, env, guard.guardToken);
          activeGuardToken = undefined;
        },
        rollback: async () => {
          await restoreProgramMediaBackup(env.FORMLESS_MEDIA, media);

          if (programRestored) {
            await restoreProgramViaAuthority(request, env, guard.snapshot, guard.guardToken);
          }

          await releaseProgramArchiveRestoreGuard(request, env, guard.guardToken);
          activeGuardToken = undefined;
        },
      };
    },
    ...(expectedSourceCursor === undefined ? {} : { expectedSourceCursor }),
    media: {
      listFiles: async () => [...mediaFilesByPath.values()],
      readFile: async (archivePath) => mediaFilesByPath.get(archivePath),
      validateObject: async ({ bytes, object }) =>
        validateArchiveMediaObjectRestoreToStore(
          mediaObjectStoreFromR2Bucket(env.FORMLESS_MEDIA),
          object,
          bytes,
        ),
      restoreObject: async ({ bytes, object }) =>
        restoreArchiveMediaObjectToStore(
          mediaObjectStoreFromR2Bucket(env.FORMLESS_MEDIA),
          object,
          bytes,
        ),
    },
    replaceMedia: async (desiredStorageKeys) => {
      await pruneProgramMediaObjects(env.FORMLESS_MEDIA, desiredStorageKeys);
    },
    programSharedRuntime,
    restoreProgram: async (program) => {
      if (activeGuardToken === undefined) {
        throw new Error("Program archive restore guard is not active.");
      }

      await restoreProgramViaAuthority(request, env, program, activeGuardToken);
      programRestored = true;
    },
  };
}

async function beginProgramArchiveRestoreGuard(
  request: Request,
  env: InstanceArchiveApiEnv,
  input: { expectedSourceCursor?: number; guardToken: string },
): Promise<ArchiveRestoreGuardResponse> {
  const response = await programAuthorityFetch(
    request,
    env,
    `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}${ARCHIVE_RESTORE_GUARD_PATH}`,
    { body: JSON.stringify(input), method: "POST" },
  );
  const text = await response.text();

  if (!response.ok) {
    const conflict = parseArchiveRestoreConflictResponse(text);

    if (
      response.status === 409 &&
      conflict?.reason === "source-cursor-changed" &&
      conflict.expectedSourceCursor !== undefined
    ) {
      throw new ArchiveRestoreSourceConflictError(
        conflict.expectedSourceCursor,
        conflict.currentSourceCursor,
      );
    }

    throw new Error(`Failed Program archive restore guard: HTTP ${response.status} ${text}`);
  }

  try {
    const value = JSON.parse(text) as unknown;
    const object = parseObject("Program archive restore guard response", value);
    assertExactKeys("Program archive restore guard response", object, ["guardToken", "snapshot"]);

    return {
      guardToken: parseNonEmptyString(
        "Program archive restore guard response guardToken",
        object.guardToken,
      ),
      snapshot: parseStorageSnapshot(object.snapshot),
    };
  } catch {
    throw new Error("Failed Program archive restore guard: response was invalid.");
  }
}

async function restoreProgramViaAuthority(
  request: Request,
  env: InstanceArchiveApiEnv,
  program: StorageSnapshot,
  guardToken: string,
): Promise<void> {
  const response = await programAuthorityFetch(
    request,
    env,
    `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}${ARCHIVE_RESTORE_PATH}`,
    {
      body: JSON.stringify({ guardToken, snapshot: program }),
      method: "POST",
    },
  );
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Failed Program restore: HTTP ${response.status} ${text}`);
  }

  try {
    JSON.parse(text);
  } catch {
    throw new Error("Failed Program restore: response was not JSON.");
  }
}

async function releaseProgramArchiveRestoreGuard(
  request: Request,
  env: InstanceArchiveApiEnv,
  guardToken: string,
): Promise<void> {
  const response = await programAuthorityFetch(
    request,
    env,
    `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}${ARCHIVE_RESTORE_GUARD_RELEASE_PATH}`,
    { body: JSON.stringify({ guardToken }), method: "POST" },
  );
  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Failed Program archive restore guard release: HTTP ${response.status} ${text}`,
    );
  }

  try {
    const value = JSON.parse(text) as { released?: unknown };

    if (value.released !== true) {
      throw new Error();
    }
  } catch {
    throw new Error("Failed Program archive restore guard release: response was invalid.");
  }
}

function programAuthorityFetch(
  request: Request,
  env: InstanceArchiveApiEnv,
  path: string,
  init: RequestInit,
) {
  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_PROGRAM_STORAGE_IDENTITY);

  return env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(new URL(path, request.url), {
      ...init,
      headers: archiveRestoreForwardHeaders(request.headers, init.headers),
    }),
  );
}

async function readProgramMediaBackup(bucket: R2Bucket): Promise<ArchiveMediaBackupObject[]> {
  const keys = await listProgramMediaKeys(bucket);

  return Promise.all(
    keys.map(async (key) => {
      const object = await bucket.get(key);

      if (!object) {
        throw new Error(`Program media object "${key}" disappeared during restore backup.`);
      }

      return {
        bytes: new Uint8Array(await object.arrayBuffer()),
        ...(object.customMetadata === undefined ? {} : { customMetadata: object.customMetadata }),
        ...(object.httpMetadata === undefined ? {} : { httpMetadata: object.httpMetadata }),
        key,
      };
    }),
  );
}

async function restoreProgramMediaBackup(
  bucket: R2Bucket,
  backup: readonly ArchiveMediaBackupObject[],
): Promise<void> {
  await deleteR2Keys(bucket, await listProgramMediaKeys(bucket));

  for (const object of backup) {
    await bucket.put(object.key, object.bytes, {
      ...(object.customMetadata === undefined ? {} : { customMetadata: object.customMetadata }),
      ...(object.httpMetadata === undefined ? {} : { httpMetadata: object.httpMetadata }),
    });
  }
}

async function pruneProgramMediaObjects(
  bucket: R2Bucket,
  desiredStorageKeys: ReadonlySet<string>,
): Promise<void> {
  const keysToDelete = (await listProgramMediaKeys(bucket)).filter(
    (key) => !desiredStorageKeys.has(key),
  );

  await deleteR2Keys(bucket, keysToDelete);
}

async function listProgramMediaKeys(bucket: R2Bucket): Promise<string[]> {
  const keys = new Set<string>();

  for (const prefix of programMediaPrefixes()) {
    let cursor: string | undefined;

    do {
      const listing = await bucket.list({
        prefix,
        ...(cursor === undefined ? {} : { cursor }),
      });

      for (const object of listing.objects) {
        keys.add(object.key);
      }

      cursor = listing.truncated ? listing.cursor : undefined;
    } while (cursor !== undefined);
  }

  return [...keys].sort(compareOrdinal);
}

async function deleteR2Keys(bucket: R2Bucket, keys: readonly string[]): Promise<void> {
  for (let index = 0; index < keys.length; index += 1000) {
    const chunk = keys.slice(index, index + 1000);

    if (chunk.length > 0) {
      await bucket.delete(chunk);
    }
  }
}

function programMediaPrefixes(): string[] {
  return [mediaKeyPrefix(CORE_IMAGE_KEY_PREFIX), mediaKeyPrefix(PROGRAM_DOCUMENT_MEDIA_KEY_PREFIX)];
}

function mediaKeyPrefix(prefix: string): string {
  return prefix.endsWith("/") ? prefix : `${prefix}/`;
}

function archiveRestoreForwardHeaders(
  headers: Headers,
  additionalHeaders: HeadersInit | undefined,
): Headers {
  const forwarded = new Headers(additionalHeaders);
  const authorization = headers.get("Authorization");
  const cookie = headers.get("Cookie");

  forwarded.set("Content-Type", "application/json");

  if (authorization) {
    forwarded.set("Authorization", authorization);
  }

  if (cookie) {
    forwarded.set("Cookie", cookie);
  }

  return forwarded;
}

function parseArchiveRestoreRequest(value: unknown): ArchiveRestoreRequest {
  const object = parseObject("Archive restore request", value);

  assertExactKeys(
    "Archive restore request",
    object,
    ["archive", "mediaFiles"],
    ["expectedSourceCursor"],
  );
  const expectedSourceCursor = object.expectedSourceCursor;

  if (
    expectedSourceCursor !== undefined &&
    (!Number.isInteger(expectedSourceCursor) || (expectedSourceCursor as number) < 0)
  ) {
    throw new Error("Archive restore request expectedSourceCursor must be a non-negative integer.");
  }

  return {
    archive: object.archive,
    ...(expectedSourceCursor === undefined
      ? {}
      : { expectedSourceCursor: expectedSourceCursor as number }),
    mediaFiles: parseArchiveRestoreMediaFiles(object.mediaFiles),
  };
}

function parseArchiveRestoreMediaFiles(value: unknown): ArchiveRestoreMediaRead[] {
  if (!Array.isArray(value)) {
    throw new Error("Archive restore request mediaFiles must be an array.");
  }

  const seen = new Set<string>();

  return value.map((file, index) => {
    const parsed = parseArchiveRestoreMediaFile(
      `Archive restore request mediaFiles[${index}]`,
      file,
    );

    if (seen.has(parsed.archivePath)) {
      throw new Error(
        `Archive restore request includes duplicate media file "${parsed.archivePath}".`,
      );
    }

    seen.add(parsed.archivePath);
    return parsed;
  });
}

function parseArchiveRestoreMediaFile(context: string, value: unknown): ArchiveRestoreMediaRead {
  const object = parseObject(context, value);

  assertExactKeys(context, object, ["archivePath", "byteSize", "bytesBase64", "contentType"]);

  const archivePath = parseRelativePath(`${context} archivePath`, object.archivePath);
  const contentType = parseNonEmptyString(`${context} contentType`, object.contentType);
  const byteSize = parseNonNegativeInteger(`${context} byteSize`, object.byteSize);
  const bytes = bytesFromBase64(`${context} bytesBase64`, object.bytesBase64);

  if (bytes.byteLength !== byteSize) {
    throw new Error(`${context} bytesBase64 does not match byteSize.`);
  }

  return { archivePath, byteSize, bytes, contentType };
}

function bytesFromBase64(context: string, value: unknown): Uint8Array {
  const encoded = parseNonEmptyString(context, value);
  let binary: string;

  try {
    binary = atob(encoded);
  } catch {
    throw new Error(`${context} must be base64.`);
  }

  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function isInstanceArchiveRestorePath(pathname: string) {
  return (
    pathname === INSTANCE_ARCHIVE_RESTORE_API_PATH ||
    pathname.startsWith(`${INSTANCE_ARCHIVE_RESTORE_API_PATH}/`)
  );
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

function methodNotAllowedResponse(allow: string): Response {
  return jsonResponse({ error: "Method not allowed." }, 405, { Allow: allow });
}

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  const responseHeaders = new Headers(headers);

  if (!responseHeaders.has("Cache-Control")) {
    responseHeaders.set("Cache-Control", "no-store");
  }

  return Response.json(body, { status, headers: responseHeaders });
}

function parseObject(context: string, value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function assertExactKeys(
  context: string,
  value: Record<string, unknown>,
  requiredKeys: string[],
  optionalKeys: string[] = [],
) {
  const expected = new Set([...requiredKeys, ...optionalKeys]);

  for (const key of Object.keys(value)) {
    if (!expected.has(key)) {
      throw new Error(`${context} has unsupported key "${key}".`);
    }
  }

  for (const key of requiredKeys) {
    if (!(key in value)) {
      throw new Error(`${context} must include "${key}".`);
    }
  }
}

function parseArchiveRestoreConflictResponse(
  value: string,
): ArchiveRestoreConflictResponse | undefined {
  try {
    const parsed = JSON.parse(value) as Partial<ArchiveRestoreConflictResponse>;

    if (
      parsed.code !== ARCHIVE_RESTORE_CONFLICT_CODE ||
      typeof parsed.error !== "string" ||
      !Number.isInteger(parsed.currentSourceCursor) ||
      (parsed.reason !== "guard-held" &&
        parsed.reason !== "guard-token-invalid" &&
        parsed.reason !== "source-cursor-changed") ||
      (parsed.expectedSourceCursor !== undefined && !Number.isInteger(parsed.expectedSourceCursor))
    ) {
      return undefined;
    }

    return parsed as ArchiveRestoreConflictResponse;
  } catch {
    return undefined;
  }
}

function parseRelativePath(context: string, value: unknown): string {
  const key = parseNonEmptyString(context, value);
  const segments = key.split("/");

  if (
    key !== key.trim() ||
    key.startsWith("/") ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(`${context} must be a relative path without dot segments.`);
  }

  return key;
}

function parseNonEmptyString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value;
}

function parseNonNegativeInteger(context: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${context} must be a non-negative integer.`);
  }

  return value;
}

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Bad request.";
}
