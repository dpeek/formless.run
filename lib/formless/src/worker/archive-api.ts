import {
  INSTANCE_ARCHIVE_KIND,
  parsePortableArchive,
  type AppArchiveData,
  type InstanceArchiveControlPlane,
  type PortableArchive,
} from "../program/archive.ts";
import {
  installedAppStorageIdentity,
  type InstalledAppStorageIdentity,
} from "../shared/app-storage-identity.ts";
import type { AppInstall } from "@dpeek/formless-installed-apps";
import { STORAGE_SNAPSHOT_KIND, STORAGE_SNAPSHOT_VERSION } from "@dpeek/formless-storage";
import type { StorageSnapshot } from "@dpeek/formless-storage";
import { type BootstrapResponse } from "../shared/protocol.ts";
import {
  instanceControlPlaneAppInstallsFromRecords,
  instanceControlPlaneRecordsForAppInstall,
} from "@dpeek/formless-instance-control-plane";
import { formlessProgramSchema } from "../program/runtime.ts";
import {
  FORMLESS_PROGRAM_API_ROUTE_PREFIX,
  FORMLESS_PROGRAM_SCHEMA_KEY,
  FORMLESS_PROGRAM_STORAGE_IDENTITY,
} from "../program/target.ts";
import {
  applyPortableArchiveRestore,
  dryRunPortableArchiveRestore,
  restoreArchiveMediaObjectToStore,
  validateArchiveMediaObjectRestoreToStore,
  type ArchiveRestoreApplyTarget,
  type ArchiveRestoreMediaRead,
} from "./archive-restore.ts";
import { authorizeInstanceWrite, type AuthorityAdminGuardEnv } from "./authority-admin-guard.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import { readControlPlaneAppInstallsForRequest } from "./instance-app-installs.ts";
import { readControlPlaneRecords } from "./deployment-control-plane-client.ts";
import {
  activeAppPackageResolver,
  activeWorkerSourceSchemas,
  listActiveAppPackages,
  type ActiveRuntimeAppPackageEnv,
} from "./runtime-app-packages.ts";
import { mediaObjectStoreFromR2Bucket } from "@dpeek/formless-media/worker";
import { APP_DOCUMENT_MEDIA_KEY_PREFIX, CORE_IMAGE_KEY_PREFIX } from "@dpeek/formless-media";

export const INSTANCE_ARCHIVE_RESTORE_API_PATH = "/api/formless/archive/restore";

type InstanceArchiveApiEnv = AuthorityAdminGuardEnv &
  ActiveRuntimeAppPackageEnv & {
    FORMLESS_AUTHORITY: DurableObjectNamespace;
    FORMLESS_MEDIA: R2Bucket;
  };

type ArchiveRestoreRequest = {
  archive: unknown;
  exactInstanceReplacement: boolean;
  mediaFiles: ArchiveRestoreMediaRead[];
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

    const packageResolver = activeAppPackageResolver(env);
    const body = parseArchiveRestoreRequest(await readJson(request));
    const archive = parsePortableArchive(body.archive, { packageResolver });
    const mediaFilesByPath = new Map(body.mediaFiles.map((file) => [file.archivePath, file]));
    const existingInstalls = await readControlPlaneAppInstallsForRequest(env, request.url);
    const target = archiveRestoreApiTarget(request, env, mediaFilesByPath);

    if (body.exactInstanceReplacement && archive.kind !== INSTANCE_ARCHIVE_KIND) {
      throw new Error("Exact instance replacement requires an instance archive.");
    }

    if (
      body.exactInstanceReplacement &&
      archive.kind === INSTANCE_ARCHIVE_KIND &&
      !archive.controlPlane
    ) {
      throw new Error("Exact instance replacement requires schema-owned control-plane data.");
    }

    const result = archive.restorePolicy.dryRun
      ? await dryRunPortableArchiveRestore(archive, target)
      : await applyPortableArchiveRestore(archive, target);

    if (result.ok && body.exactInstanceReplacement && !archive.restorePolicy.dryRun) {
      await applyExactInstanceReplacement(request, env, {
        archive,
        existingInstalls,
      });
    }

    return jsonResponse(result, result.ok ? 200 : 400);
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, 400);
  }
}

function archiveRestoreApiTarget(
  request: Request,
  env: InstanceArchiveApiEnv,
  mediaFilesByPath: Map<string, ArchiveRestoreMediaRead>,
): ArchiveRestoreApplyTarget {
  const packageResolver = activeAppPackageResolver(env);

  return {
    listInstalledApps: () => readControlPlaneAppInstallsForRequest(env, request.url),
    media: {
      listFiles: async () => [...mediaFilesByPath.values()],
      readFile: async (archivePath) => mediaFilesByPath.get(archivePath),
      validateObject: async ({ bytes, object }) =>
        validateArchiveMediaObjectRestoreToStore(
          mediaObjectStoreFromR2Bucket(env.FORMLESS_MEDIA),
          object,
          bytes,
        ),
      restoreObject: async ({ bytes, identity, object }) =>
        restoreArchiveMediaObjectToStore(
          mediaObjectStoreFromR2Bucket(env.FORMLESS_MEDIA),
          identity,
          object,
          bytes,
        ),
    },
    restoreAppData: async ({ data, identity }) =>
      restoreAppDataViaAuthority(request, env, data, identity),
    restoreControlPlane: async (controlPlane) => {
      await restoreControlPlaneViaAuthority(request, env, controlPlane);
    },
    restoreInstall: ({ action, install }) =>
      restoreInstallViaControlPlane(request, env, { action, install }),
    packageResolver,
    packages: listActiveAppPackages(env),
    sourceSchemas: activeWorkerSourceSchemas(env),
  };
}

async function applyExactInstanceReplacement(
  request: Request,
  env: InstanceArchiveApiEnv,
  input: {
    archive: PortableArchive;
    existingInstalls: AppInstall[];
  },
): Promise<void> {
  if (input.archive.kind !== INSTANCE_ARCHIVE_KIND) {
    return;
  }

  const archiveInstallIds = new Set(input.archive.apps.map((app) => app.app.installId));
  const sourceSchemas = activeWorkerSourceSchemas(env);
  const packageResolver = activeAppPackageResolver(env);
  const removedInstallSnapshots = input.existingInstalls
    .filter((install) => !archiveInstallIds.has(install.installId))
    .map((install) =>
      emptySnapshotForRemovedInstall({
        install,
        packageResolver,
        sourceSchemas,
        timestamp: input.archive.exportedAt,
      }),
    );

  for (const snapshot of removedInstallSnapshots) {
    await restoreAppDataViaAuthority(request, env, snapshot.data, snapshot.identity);
  }

  await pruneCoreMediaObjects(env.FORMLESS_MEDIA, archiveCoreMediaKeys(input.archive));
}

function emptySnapshotForRemovedInstall(input: {
  install: AppInstall;
  packageResolver: ReturnType<typeof activeAppPackageResolver>;
  sourceSchemas: Partial<Record<string, StorageSnapshot["schema"]>>;
  timestamp: string;
}): { data: AppArchiveData; identity: InstalledAppStorageIdentity } {
  const identity = installedAppStorageIdentity(
    {
      installId: input.install.installId,
      packageAppKey: input.install.packageAppKey,
    },
    input.packageResolver,
  );

  if (!identity) {
    throw new Error(
      `Removed install "${input.install.installId}" does not resolve to installed app storage.`,
    );
  }

  const schema = input.sourceSchemas[identity.sourceSchemaKey];

  if (!schema) {
    throw new Error(
      `Removed install "${input.install.installId}" source schema "${identity.sourceSchemaKey}" is unavailable.`,
    );
  }

  return {
    data: {
      kind: STORAGE_SNAPSHOT_KIND,
      version: STORAGE_SNAPSHOT_VERSION,
      storageIdentity: identity.authorityName,
      schemaKey: identity.sourceSchemaKey,
      exportedAt: input.timestamp,
      schemaUpdatedAt: input.timestamp,
      sourceCursor: 0,
      schema,
      records: [],
    },
    identity,
  };
}

async function pruneCoreMediaObjects(
  bucket: R2Bucket,
  desiredStorageKeys: ReadonlySet<string>,
): Promise<void> {
  const prefixes = [
    mediaKeyPrefix(CORE_IMAGE_KEY_PREFIX),
    mediaKeyPrefix(APP_DOCUMENT_MEDIA_KEY_PREFIX),
  ];
  const keysToDelete: string[] = [];
  for (const prefix of prefixes) {
    let cursor: string | undefined;

    do {
      const listing = await bucket.list({
        prefix,
        ...(cursor === undefined ? {} : { cursor }),
      });

      for (const object of listing.objects) {
        if (!desiredStorageKeys.has(object.key)) {
          keysToDelete.push(object.key);
        }
      }

      cursor = listing.truncated ? listing.cursor : undefined;
    } while (cursor !== undefined);
  }

  for (let index = 0; index < keysToDelete.length; index += 1000) {
    const chunk = keysToDelete.slice(index, index + 1000);

    if (chunk.length > 0) {
      await bucket.delete(chunk);
    }
  }
}

function archiveCoreMediaKeys(archive: PortableArchive): ReadonlySet<string> {
  const keys = new Set<string>();
  const apps = archive.kind === INSTANCE_ARCHIVE_KIND ? archive.apps : [archive];
  const prefixes = [
    mediaKeyPrefix(CORE_IMAGE_KEY_PREFIX),
    mediaKeyPrefix(APP_DOCUMENT_MEDIA_KEY_PREFIX),
  ];

  for (const app of apps) {
    for (const object of app.media.objects) {
      if (prefixes.some((prefix) => object.storageKey.startsWith(prefix))) {
        keys.add(object.storageKey);
      }
    }
  }

  return keys;
}

function mediaKeyPrefix(prefix: string): string {
  return prefix.endsWith("/") ? prefix : `${prefix}/`;
}

async function restoreInstallViaControlPlane(
  request: Request,
  env: InstanceArchiveApiEnv,
  input: { action: "create" | "replace"; install: AppInstall },
): Promise<void> {
  const packageResolver = activeAppPackageResolver(env);
  const records = (await readControlPlaneRecords({ env, requestUrl: request.url })) ?? [];
  const existing = instanceControlPlaneAppInstallsFromRecords(records, packageResolver).find(
    (install) => install.installId === input.install.installId,
  );

  if (input.action === "create" && existing) {
    throw new Error(`Install id "${input.install.installId}" is already installed.`);
  }

  if (input.action === "replace" && !existing) {
    throw new Error(`Install id "${input.install.installId}" is not installed.`);
  }

  if (existing && existing.packageAppKey !== input.install.packageAppKey) {
    throw new Error(
      `Install id "${input.install.installId}" uses package "${existing.packageAppKey}", not "${input.install.packageAppKey}".`,
    );
  }

  const nextRecords = records
    .filter((record) => record.deletedAt === undefined)
    .filter(
      (record) =>
        record.id !== input.install.installId &&
        !(
          record.entity === "route" &&
          record.values.appInstall === input.install.installId &&
          record.values.matchHost === undefined
        ),
    );
  const now = input.install.updatedAt || input.install.createdAt;

  await restoreControlPlaneViaAuthority(request, env, {
    kind: STORAGE_SNAPSHOT_KIND,
    version: STORAGE_SNAPSHOT_VERSION,
    storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
    schemaKey: FORMLESS_PROGRAM_SCHEMA_KEY,
    exportedAt: now,
    schemaUpdatedAt: now,
    sourceCursor: 0,
    schema: formlessProgramSchema,
    records: [
      ...nextRecords,
      ...instanceControlPlaneRecordsForAppInstall({ install: input.install, now }),
    ],
  });
}

async function restoreControlPlaneViaAuthority(
  request: Request,
  env: InstanceArchiveApiEnv,
  controlPlane: InstanceArchiveControlPlane,
): Promise<BootstrapResponse> {
  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_PROGRAM_STORAGE_IDENTITY);
  const response = await env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(new URL(`${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/snapshot/restore`, request.url), {
      body: JSON.stringify(controlPlane),
      headers: archiveRestoreForwardHeaders(request.headers),
      method: "POST",
    }),
  );
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Failed control-plane restore: HTTP ${response.status} ${text}`);
  }

  try {
    return JSON.parse(text) as BootstrapResponse;
  } catch {
    throw new Error("Failed control-plane restore: response was not JSON.");
  }
}

async function restoreAppDataViaAuthority(
  request: Request,
  env: InstanceArchiveApiEnv,
  data: AppArchiveData,
  identity: InstalledAppStorageIdentity,
): Promise<BootstrapResponse> {
  const id = env.FORMLESS_AUTHORITY.idFromName(identity.authorityName);
  const url = new URL(`${identity.apiRoutePrefix}/snapshot/restore`, request.url);
  const response = await env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(url, {
      body: JSON.stringify(data),
      headers: archiveRestoreForwardHeaders(request.headers),
      method: "POST",
    }),
  );
  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Failed app data restore for "${identity.installId}": HTTP ${response.status} ${text}`,
    );
  }

  try {
    return JSON.parse(text) as BootstrapResponse;
  } catch {
    throw new Error(`Failed app data restore for "${identity.installId}": response was not JSON.`);
  }
}

function archiveRestoreForwardHeaders(headers: Headers): Headers {
  const forwarded = new Headers();
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

  if (!("archive" in object)) {
    throw new Error('Archive restore request must include "archive".');
  }

  return {
    archive: object.archive,
    exactInstanceReplacement: parseOptionalBoolean(
      "Archive restore request exactInstanceReplacement",
      object.exactInstanceReplacement,
    ),
    mediaFiles: parseArchiveRestoreMediaFiles(object.mediaFiles),
  };
}

function parseArchiveRestoreMediaFiles(value: unknown): ArchiveRestoreMediaRead[] {
  if (value === undefined) {
    return [];
  }

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
  const archivePath = parseRelativePath(`${context} archivePath`, object.archivePath);
  const contentType = parseNonEmptyString(`${context} contentType`, object.contentType);
  const byteSize = parseNonNegativeInteger(`${context} byteSize`, object.byteSize);
  const bytes = bytesFromBase64(`${context} bytesBase64`, object.bytesBase64);

  if (bytes.byteLength !== byteSize) {
    throw new Error(`${context} bytesBase64 does not match byteSize.`);
  }

  return {
    archivePath,
    byteSize,
    bytes,
    contentType,
  };
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

  return Response.json(body, {
    status,
    headers: responseHeaders,
  });
}

function parseObject(context: string, value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context} must be an object.`);
  }

  return value as Record<string, unknown>;
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

function parseOptionalBoolean(context: string, value: unknown): boolean {
  if (value === undefined) {
    return false;
  }

  if (typeof value !== "boolean") {
    throw new Error(`${context} must be a boolean.`);
  }

  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Bad request.";
}
