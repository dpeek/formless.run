import { listenForClientEvents, publishClientEvent } from "./broadcast.ts";
import { appStorageIdentityForClientTarget, type ClientAppTarget } from "./app-target.ts";
import { packageAppFactsForKey, type AppPackageResolver } from "@dpeek/formless-installed-apps";
import { bundledAppPackageResolver } from "../shared/app-packages.ts";
import { FORMLESS_RUNTIME_PROTOCOL_VERSION } from "../shared/deploy-metadata.ts";
import {
  deleteFormlessReplicaDatabases,
  deleteLegacyIdentityReplicaDatabase,
  mergeChanges,
  readCursor,
  readSchemaProvenance,
  readSchemaUpdatedAt,
  saveBootstrapResponse,
  saveSchema,
  type FormlessReplicaDatabaseResetResult,
} from "./db.ts";
import {
  applyBootstrapResponse,
  applyChanges,
  applySchemaSave,
  resetClientStore,
} from "./store.ts";
import { setSyncStatus } from "./sync-status.ts";
import {
  enqueueLocalWorkspaceAutoSave,
  type LocalWorkspaceAutoSaveOptions,
  type LocalWorkspaceAutoSaveWriteSource,
} from "./workspace-auto-save.ts";
import { createOperationId } from "../shared/ids.ts";
import type {
  OperationInvocationRequest,
  OperationInvocationResponse,
} from "../shared/operation-invocation.ts";
import type { StorageSnapshot } from "@dpeek/formless-storage";
import {
  FORMLESS_CLIENT_PACKAGE_REVISION_HEADER,
  FORMLESS_CLIENT_RUNTIME_PROTOCOL_HEADER,
  FORMLESS_CLIENT_SCHEMA_UPDATED_AT_HEADER,
  FORMLESS_CLIENT_SOURCE_SCHEMA_HASH_HEADER,
  isSyncSocketServerMessage,
  type BootstrapResponse,
  type EntityName,
  type SchemaResponse,
  type SchemaUpdateResponse,
  type SyncResponse,
  type SyncSocketClientMessage,
  type SyncSocketServerMessage,
} from "../shared/protocol.ts";
import type { AppSchema } from "@dpeek/formless-schema";

const DEFAULT_RECONNECT_INITIAL_DELAY_MS = 500;
const DEFAULT_RECONNECT_MAX_DELAY_MS = 5000;
const WEB_SOCKET_OPEN_READY_STATE = 1;

type SyncWebSocket = {
  readyState: number;
  send: (data: string) => void;
  close: () => void;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
};

type StartPushSyncOptions = {
  onSynced?: () => void;
  reconnectInitialDelayMs?: number;
  reconnectMaxDelayMs?: number;
  socketFactory?: (url: string) => SyncWebSocket;
};

export type BrowserWriteOptions = LocalWorkspaceAutoSaveOptions & {
  activePackageResolver?: AppPackageResolver | undefined;
};

export type SubmitOperationOptions = BrowserWriteOptions & {
  autoSaveSource?: LocalWorkspaceAutoSaveWriteSource;
};

export async function bootstrapClient(target: ClientAppTarget, fetcher: typeof fetch = fetch) {
  const identity = appStorageIdentityForClientTarget(target);
  const response = await fetchJson<BootstrapResponse>(fetcher, apiPath(identity, "bootstrap"));

  if (identity.kind === "program") {
    await deleteLegacyIdentityReplicaDatabase();
  }

  await saveBootstrapResponse(identity, response);
  applyBootstrapResponse(response, identity);
  notifyLocalDataChanged(identity, { schemaChanged: true });

  return response;
}

export async function resetLocalBrowserReplicaState(): Promise<FormlessReplicaDatabaseResetResult> {
  const result = await deleteFormlessReplicaDatabases();

  resetClientStore();

  return result;
}

export async function syncClient(target: ClientAppTarget, fetcher: typeof fetch = fetch) {
  const identity = appStorageIdentityForClientTarget(target);
  const cursor = await readCursor(identity);
  const schemaUpdatedAt = await readSchemaUpdatedAt(identity);
  const url = syncUrl(identity, cursor, schemaUpdatedAt);
  const response = await fetchJson<SyncResponse>(fetcher, url);

  await applySyncResponse(identity, response, { currentCursor: cursor });

  return response;
}

export async function applySyncResponse(
  target: ClientAppTarget,
  response: SyncResponse,
  options: { currentCursor?: number } = {},
) {
  const identity = appStorageIdentityForClientTarget(target);
  const cursor = options.currentCursor ?? (await readCursor(identity));
  const schemaChanged = Boolean(response.schema && response.schemaUpdatedAt);

  if (response.schema && response.schemaUpdatedAt) {
    await saveSchema(
      identity,
      response.schema,
      response.schemaUpdatedAt,
      response.schemaProvenance,
    );
    applySchemaSave(response.schema, response.schemaUpdatedAt, identity);
  }

  if (response.changes.length > 0 || response.cursor !== cursor) {
    await mergeChanges(identity, response.changes, response.cursor);
    applyChanges(response.changes, response.cursor, identity);
  }

  if (response.changes.length > 0 || response.cursor !== cursor || schemaChanged) {
    notifyLocalDataChanged(identity, { schemaChanged });
  }

  return response;
}

export async function fetchActiveSchema(target: ClientAppTarget, fetcher: typeof fetch = fetch) {
  const identity = appStorageIdentityForClientTarget(target);
  const response = await fetchJson<SchemaResponse>(fetcher, apiPath(identity, "schema"));

  await saveSchema(identity, response.schema, response.updatedAt, response.schemaProvenance);
  applySchemaSave(response.schema, response.updatedAt, identity);
  notifySchemaChanged(identity);

  return response;
}

export async function saveActiveSchema(
  target: ClientAppTarget,
  schema: AppSchema,
  fetcher: typeof fetch = fetch,
  options: BrowserWriteOptions = {},
) {
  const identity = appStorageIdentityForClientTarget(target);
  const response = await postJson<SchemaUpdateResponse>(
    fetcher,
    apiPath(identity, "schema"),
    {
      schema,
    },
    {
      activePackageResolver: options.activePackageResolver,
      writeCompatibilityTarget: identity,
    },
  );

  await saveSchema(identity, response.schema, response.updatedAt, response.schemaProvenance);
  applySchemaSave(response.schema, response.updatedAt, identity);
  notifySchemaChanged(identity);
  await enqueueLocalWorkspaceAutoSave(
    { source: "schema-save", storageIdentity: identity.authorityName },
    options,
  );

  return response;
}

export async function exportStorageSnapshot(
  target: ClientAppTarget,
  fetcher: typeof fetch = fetch,
) {
  const identity = appStorageIdentityForClientTarget(target);

  return fetchJson<StorageSnapshot>(fetcher, apiPath(identity, "snapshot"));
}

export async function restoreStorageSnapshot(
  target: ClientAppTarget,
  snapshot: unknown,
  fetcher: typeof fetch = fetch,
  options: BrowserWriteOptions = {},
) {
  const identity = appStorageIdentityForClientTarget(target);
  const response = await postJson<BootstrapResponse>(
    fetcher,
    apiPath(identity, "snapshot/restore"),
    snapshot,
    {
      activePackageResolver: options.activePackageResolver,
      writeCompatibilityTarget: identity,
    },
  );

  await saveBootstrapResponse(identity, response);
  applyBootstrapResponse(response, identity);
  notifyLocalDataChanged(identity, { schemaChanged: true });
  await enqueueLocalWorkspaceAutoSave(
    { source: "snapshot-restore", storageIdentity: identity.authorityName },
    options,
  );

  return response;
}

export async function submitOperation(
  target: ClientAppTarget,
  entity: EntityName,
  operationName: string,
  request: OperationInvocationRequest = {},
  fetcher: typeof fetch = fetch,
  options: SubmitOperationOptions = {},
) {
  const identity = appStorageIdentityForClientTarget(target);
  const response = await postJson<OperationInvocationResponse>(
    fetcher,
    apiPath(
      identity,
      `operations/${encodeURIComponent(entity)}/${encodeURIComponent(operationName)}`,
    ),
    {
      ...request,
      idempotencyKey: request.idempotencyKey ?? createOperationId(),
      source: {
        ...request.source,
        protocol: "generated-ui",
      },
    },
    {
      activePackageResolver: options.activePackageResolver,
      writeCompatibilityTarget: identity,
    },
  );

  const materializedOutput = operationMaterializationOutput(response.output);

  if (materializedOutput) {
    await mergeChanges(identity, materializedOutput.changes, materializedOutput.cursor);
    applyChanges(materializedOutput.changes, materializedOutput.cursor, identity);
    notifyLocalDataChanged(identity);
    if (response.status === "committed") {
      await enqueueLocalWorkspaceAutoSave(
        {
          source: options.autoSaveSource ?? autoSaveSourceForOperation(identity, entity),
          storageIdentity: identity.authorityName,
        },
        options,
      );
    }
  }

  return response;
}

export async function resetSourceSchema(
  target: ClientAppTarget,
  fetcher: typeof fetch = fetch,
  options: BrowserWriteOptions = {},
) {
  const identity = appStorageIdentityForClientTarget(target);
  const response = await postJson<BootstrapResponse>(
    fetcher,
    apiPath(identity, "reset/schema"),
    {},
    {
      activePackageResolver: options.activePackageResolver,
      writeCompatibilityTarget: identity,
    },
  );

  await saveBootstrapResponse(identity, response);
  applyBootstrapResponse(response, identity);
  notifyLocalDataChanged(identity, { schemaChanged: true });
  await enqueueLocalWorkspaceAutoSave(
    { source: "reset-schema", storageIdentity: identity.authorityName },
    options,
  );

  return response;
}

export function startPushSync(target: ClientAppTarget, options: StartPushSyncOptions = {}) {
  const identity = appStorageIdentityForClientTarget(target);
  const onSynced = options.onSynced;
  const reconnectInitialDelayMs =
    options.reconnectInitialDelayMs ?? DEFAULT_RECONNECT_INITIAL_DELAY_MS;
  const reconnectMaxDelayMs = options.reconnectMaxDelayMs ?? DEFAULT_RECONNECT_MAX_DELAY_MS;
  const socketFactory = options.socketFactory ?? createWebSocket;
  let stopped = false;
  let socket: SyncWebSocket | undefined;
  let reconnectTimerId: ReturnType<typeof setTimeout> | undefined;
  let reconnectDelayMs = reconnectInitialDelayMs;
  let stopListening = () => {};

  function connect() {
    if (stopped) {
      return;
    }

    setSyncStatus({ state: "syncing", message: "Connecting push sync..." });

    let nextSocket: SyncWebSocket;

    try {
      nextSocket = socketFactory(syncWebSocketUrl(identity));
    } catch {
      setSyncStatus({ state: "error", message: "Push sync unavailable." });
      return;
    }

    socket = nextSocket;
    let opened = false;

    nextSocket.onopen = () => {
      if (stopped || socket !== nextSocket) {
        return;
      }

      opened = true;
      reconnectDelayMs = reconnectInitialDelayMs;
      setSyncStatus({ state: "idle", message: "Push sync connected." });
      void sendSyncSocketClientMessage(identity, nextSocket, "hello").catch(() => {
        if (!stopped && socket === nextSocket) {
          nextSocket.close();
        }
      });
    };

    nextSocket.onmessage = (event) => {
      if (stopped || socket !== nextSocket) {
        return;
      }

      void handleSyncSocketMessage(identity, event)
        .then((didApplySync) => {
          if (didApplySync && !stopped && socket === nextSocket) {
            onSynced?.();
          }
        })
        .catch((error: unknown) => {
          setSyncStatus({
            state: "error",
            message: error instanceof Error ? error.message : "Push sync failed.",
          });
        });
    };

    nextSocket.onerror = () => {
      if (stopped || socket !== nextSocket) {
        return;
      }

      if (!opened) {
        socket = undefined;
        setSyncStatus({ state: "error", message: "Push sync connection failed." });
        return;
      }

      setSyncStatus({ state: "syncing", message: "Push sync connection issue." });
    };

    nextSocket.onclose = () => {
      if (stopped || socket !== nextSocket) {
        return;
      }

      socket = undefined;

      if (!opened) {
        setSyncStatus({ state: "error", message: "Push sync connection failed." });
        return;
      }

      setSyncStatus({ state: "syncing", message: "Push sync reconnecting..." });
      scheduleReconnect();
    };
  }

  function scheduleReconnect() {
    if (stopped) {
      return;
    }

    const delayMs = reconnectDelayMs;
    reconnectDelayMs = Math.min(reconnectDelayMs * 2, reconnectMaxDelayMs);
    reconnectTimerId = globalThis.setTimeout(() => {
      reconnectTimerId = undefined;
      connect();
    }, delayMs);
  }

  function requestSocketSync() {
    const currentSocket = socket;

    if (currentSocket && currentSocket.readyState === WEB_SOCKET_OPEN_READY_STATE) {
      void sendSyncSocketClientMessage(identity, currentSocket, "sync-requested").catch(() => {
        if (!stopped && socket === currentSocket) {
          currentSocket.close();
        }
      });
    }
  }

  stopListening = listenForClientEvents(identity, (event) => {
    if (event.type === "sync-requested") {
      requestSocketSync();
    }
  });

  connect();

  return () => {
    stopped = true;
    stopListening();
    clearReconnectTimer();
    socket?.close();
    socket = undefined;
  };

  function clearReconnectTimer() {
    if (reconnectTimerId !== undefined) {
      globalThis.clearTimeout(reconnectTimerId);
      reconnectTimerId = undefined;
    }
  }
}

export function requestSync(target: ClientAppTarget) {
  const identity = appStorageIdentityForClientTarget(target);

  publishClientEvent(identity, "sync-requested");
}

function createWebSocket(url: string): SyncWebSocket {
  return new WebSocket(url);
}

async function sendSyncSocketClientMessage(
  target: ClientAppTarget,
  socket: SyncWebSocket,
  type: SyncSocketClientMessage["type"],
) {
  const identity = appStorageIdentityForClientTarget(target);
  const message = {
    type,
    cursor: await readCursor(identity),
    schemaUpdatedAt: await readSchemaUpdatedAt(identity),
  } satisfies SyncSocketClientMessage;

  socket.send(JSON.stringify(message));
}

async function handleSyncSocketMessage(target: ClientAppTarget, event: MessageEvent) {
  const message = parseSyncSocketServerMessage(event.data);

  if (!message) {
    throw new Error("Malformed sync socket message.");
  }

  if (message.type === "error") {
    setSyncStatus({ state: "error", message: message.message });
    return false;
  }

  await applySyncResponse(target, message.payload);
  setSyncStatus({ state: "idle", message: "Pushed sync received." });
  return true;
}

function parseSyncSocketServerMessage(data: unknown): SyncSocketServerMessage | undefined {
  if (typeof data !== "string") {
    return undefined;
  }

  try {
    const parsed = JSON.parse(data) as unknown;

    return isSyncSocketServerMessage(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

async function fetchJson<T>(fetcher: typeof fetch, url: string): Promise<T> {
  const response = await fetcher(url, {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
    },
  });

  return parseJsonResponse<T>(response);
}

async function postJson<T>(
  fetcher: typeof fetch,
  url: string,
  body: unknown,
  options: {
    activePackageResolver?: AppPackageResolver | undefined;
    writeCompatibilityTarget?: ClientAppTarget;
  } = {},
): Promise<T> {
  const headers = new Headers({
    Accept: "application/json",
    "Content-Type": "application/json",
  });

  if (options.writeCompatibilityTarget) {
    await addBrowserReplicaWriteHeaders(headers, options.writeCompatibilityTarget, {
      activePackageResolver: options.activePackageResolver,
    });
  }

  const response = await fetcher(url, {
    credentials: "same-origin",
    headers,
    body: JSON.stringify(body),
    method: "POST",
  });

  return parseJsonResponse<T>(response);
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as unknown;

  if (!response.ok) {
    const message = isErrorResponse(body)
      ? body.error
      : `Request failed with status ${response.status}.`;
    throw new Error(message);
  }

  return body as T;
}

async function addBrowserReplicaWriteHeaders(
  headers: Headers,
  target: ClientAppTarget,
  options: { activePackageResolver?: AppPackageResolver | undefined } = {},
) {
  const identity = appStorageIdentityForClientTarget(target);
  const [schemaUpdatedAt, schemaProvenance] = await Promise.all([
    readSchemaUpdatedAt(identity),
    readSchemaProvenance(identity),
  ]);
  const packageFacts =
    schemaProvenance || identity.kind === "program"
      ? undefined
      : packageAppFactsForKey(
          identity.packageAppKey,
          identity.kind === "appInstall"
            ? (options.activePackageResolver ?? bundledAppPackageResolver)
            : bundledAppPackageResolver,
        );

  headers.set(FORMLESS_CLIENT_RUNTIME_PROTOCOL_HEADER, String(FORMLESS_RUNTIME_PROTOCOL_VERSION));

  if (schemaUpdatedAt) {
    headers.set(FORMLESS_CLIENT_SCHEMA_UPDATED_AT_HEADER, schemaUpdatedAt);
  }

  if (schemaProvenance?.kind === "package-app") {
    headers.set(FORMLESS_CLIENT_PACKAGE_REVISION_HEADER, String(schemaProvenance.packageRevision));
    headers.set(FORMLESS_CLIENT_SOURCE_SCHEMA_HASH_HEADER, schemaProvenance.sourceSchemaHash);
    return;
  }

  if (schemaProvenance?.kind === "program") {
    headers.set(FORMLESS_CLIENT_SOURCE_SCHEMA_HASH_HEADER, schemaProvenance.sourceSchemaHash);
    return;
  }

  if (packageFacts) {
    headers.set(FORMLESS_CLIENT_PACKAGE_REVISION_HEADER, String(packageFacts.packageRevision));
    headers.set(FORMLESS_CLIENT_SOURCE_SCHEMA_HASH_HEADER, packageFacts.sourceSchemaHash);
  }
}

function notifyLocalDataChanged(
  target: ClientAppTarget,
  options: { schemaChanged?: boolean } = {},
) {
  publishClientEvent(target, "records-updated");
  publishClientEvent(target, "cursor-updated");
  if (options.schemaChanged) {
    publishClientEvent(target, "schema-updated");
  }
}

function notifySchemaChanged(target: ClientAppTarget) {
  publishClientEvent(target, "schema-updated");
}

function autoSaveSourceForOperation(
  identity: ReturnType<typeof appStorageIdentityForClientTarget>,
  entity: EntityName,
): LocalWorkspaceAutoSaveWriteSource {
  if (identity.kind !== "program") {
    return "app-operation";
  }

  return entity === "deployment-config" ? "deployment-intent" : "control-plane-write";
}

type OperationMaterializationOutput = Extract<
  OperationInvocationResponse["output"],
  { changes: unknown[]; cursor: number }
>;

function operationMaterializationOutput(
  output: OperationInvocationResponse["output"],
): OperationMaterializationOutput | undefined {
  switch (output.type) {
    case "create":
    case "update":
    case "delete":
    case "command":
      return output;
    case "get":
    case "list":
      return undefined;
  }
}

function isErrorResponse(value: unknown): value is { error: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "error" in value &&
    typeof value.error === "string"
  );
}

function apiPath(target: ClientAppTarget, path: string) {
  const identity = appStorageIdentityForClientTarget(target);

  return `${identity.apiRoutePrefix}/${path}`;
}

function syncUrl(target: ClientAppTarget, cursor: number, schemaUpdatedAt: string | null) {
  const params = new URLSearchParams({ after: String(cursor) });

  if (schemaUpdatedAt) {
    params.set("schemaUpdatedAt", schemaUpdatedAt);
  }

  return `${apiPath(target, "sync")}?${params.toString()}`;
}

function syncWebSocketUrl(target: ClientAppTarget) {
  const baseUrl =
    typeof globalThis.location === "undefined" ? "http://localhost/" : globalThis.location.href;
  const url = new URL(apiPath(target, "sync/ws"), baseUrl);

  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";

  return url.toString();
}
