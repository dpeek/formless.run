import { listenForClientEvents, publishClientEvent } from "./broadcast.ts";
import { invalidateProgramAuthorityForProtectedResponse } from "./program-authority.ts";
import { FORMLESS_PROGRAM_API_ROUTE_PREFIX } from "../program/target.ts";
import { FORMLESS_RUNTIME_PROTOCOL_VERSION } from "../shared/deploy-metadata.ts";
import {
  deleteProgramReplicaDatabase,
  mergeChanges,
  readCursor,
  readSchemaProvenance,
  readSchemaUpdatedAt,
  saveBootstrapResponse,
  saveSchema,
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
  canPublish?: () => boolean;
  onAuthorityInvalidated?: () => void;
  onSynced?: () => void;
  reconnectInitialDelayMs?: number;
  reconnectMaxDelayMs?: number;
  socketFactory?: (url: string) => SyncWebSocket;
};

export type BrowserWriteOptions = LocalWorkspaceAutoSaveOptions;

export type SubmitOperationOptions = BrowserWriteOptions & {
  autoSaveSource?: LocalWorkspaceAutoSaveWriteSource;
};

type ClientRuntimePublicationBoundary = {
  canPublish?: (() => boolean) | undefined;
  principalId?: string | undefined;
  signal?: AbortSignal | undefined;
};

export async function bootstrapClient(
  fetcher: typeof fetch = fetch,
  options: ClientRuntimePublicationBoundary = {},
) {
  const response = await fetchJson<BootstrapResponse>(
    fetcher,
    apiPath("bootstrap"),
    options.signal,
  );

  assertClientRuntimePublicationCurrent(options);
  await saveBootstrapResponse(response, { principalId: options.principalId });
  assertClientRuntimePublicationCurrent(options);
  applyBootstrapResponse(response);
  notifyLocalDataChanged({ schemaChanged: true });

  return response;
}

export async function resetLocalBrowserReplicaState(): Promise<void> {
  await deleteProgramReplicaDatabase();

  resetClientStore();
}

export async function syncClient(fetcher: typeof fetch = fetch) {
  const cursor = await readCursor();
  const schemaUpdatedAt = await readSchemaUpdatedAt();
  const url = syncUrl(cursor, schemaUpdatedAt);
  const response = await fetchJson<SyncResponse>(fetcher, url);

  await applySyncResponse(response, { currentCursor: cursor });

  return response;
}

export async function applySyncResponse(
  response: SyncResponse,
  options: { canPublish?: () => boolean; currentCursor?: number } = {},
) {
  assertClientRuntimePublicationCurrent(options);
  const cursor = options.currentCursor ?? (await readCursor());
  const schemaChanged = Boolean(response.schema && response.schemaUpdatedAt);

  if (response.schema && response.schemaUpdatedAt) {
    await saveSchema(response.schema, response.schemaUpdatedAt, response.schemaProvenance);
    assertClientRuntimePublicationCurrent(options);
    applySchemaSave(response.schema, response.schemaUpdatedAt);
  }

  if (response.changes.length > 0 || response.cursor !== cursor) {
    await mergeChanges(response.changes, response.cursor);
    assertClientRuntimePublicationCurrent(options);
    applyChanges(response.changes, response.cursor);
  }

  if (response.changes.length > 0 || response.cursor !== cursor || schemaChanged) {
    assertClientRuntimePublicationCurrent(options);
    notifyLocalDataChanged({ schemaChanged });
  }

  return response;
}

export async function fetchActiveSchema(fetcher: typeof fetch = fetch) {
  const response = await fetchJson<SchemaResponse>(fetcher, apiPath("schema"));

  await saveSchema(response.schema, response.updatedAt, response.schemaProvenance);
  applySchemaSave(response.schema, response.updatedAt);
  notifySchemaChanged();

  return response;
}

export async function saveActiveSchema(
  schema: AppSchema,
  fetcher: typeof fetch = fetch,
  options: BrowserWriteOptions = {},
) {
  const response = await postJson<SchemaUpdateResponse>(
    fetcher,
    apiPath("schema"),
    {
      schema,
    },
    { includeBrowserReplicaWriteHeaders: true },
  );

  await saveSchema(response.schema, response.updatedAt, response.schemaProvenance);
  applySchemaSave(response.schema, response.updatedAt);
  notifySchemaChanged();
  await enqueueLocalWorkspaceAutoSave({ source: "schema-save" }, options);

  return response;
}

export async function exportStorageSnapshot(fetcher: typeof fetch = fetch) {
  return fetchJson<StorageSnapshot>(fetcher, apiPath("snapshot"));
}

export async function restoreStorageSnapshot(
  snapshot: unknown,
  fetcher: typeof fetch = fetch,
  options: BrowserWriteOptions = {},
) {
  const response = await postJson<BootstrapResponse>(
    fetcher,
    apiPath("snapshot/restore"),
    snapshot,
    { includeBrowserReplicaWriteHeaders: true },
  );

  await saveBootstrapResponse(response);
  applyBootstrapResponse(response);
  notifyLocalDataChanged({ schemaChanged: true });
  await enqueueLocalWorkspaceAutoSave({ source: "snapshot-restore" }, options);

  return response;
}

export async function submitOperation(
  entity: EntityName,
  operationName: string,
  request: OperationInvocationRequest = {},
  fetcher: typeof fetch = fetch,
  options: SubmitOperationOptions = {},
) {
  const response = await postJson<OperationInvocationResponse>(
    fetcher,
    apiPath(`operations/${encodeURIComponent(entity)}/${encodeURIComponent(operationName)}`),
    {
      ...request,
      idempotencyKey: request.idempotencyKey ?? createOperationId(),
      source: {
        ...request.source,
        protocol: "generated-ui",
      },
    },
    { includeBrowserReplicaWriteHeaders: true },
  );

  const materializedOutput = operationMaterializationOutput(response.output);

  if (materializedOutput) {
    await mergeChanges(materializedOutput.changes, materializedOutput.cursor);
    applyChanges(materializedOutput.changes, materializedOutput.cursor);
    notifyLocalDataChanged();
    if (response.status === "committed") {
      await enqueueLocalWorkspaceAutoSave(
        {
          source: options.autoSaveSource ?? autoSaveSourceForOperation(entity),
        },
        options,
      );
    }
  }

  return response;
}

export async function resetSourceSchema(
  fetcher: typeof fetch = fetch,
  options: BrowserWriteOptions = {},
) {
  const response = await postJson<BootstrapResponse>(
    fetcher,
    apiPath("reset/schema"),
    {},
    { includeBrowserReplicaWriteHeaders: true },
  );

  await saveBootstrapResponse(response);
  applyBootstrapResponse(response);
  notifyLocalDataChanged({ schemaChanged: true });
  await enqueueLocalWorkspaceAutoSave({ source: "reset-schema" }, options);

  return response;
}

export function startPushSync(options: StartPushSyncOptions = {}) {
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
      nextSocket = socketFactory(syncWebSocketUrl());
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
      void sendSyncSocketClientMessage(nextSocket, "hello").catch(() => {
        if (!stopped && socket === nextSocket) {
          nextSocket.close();
        }
      });
    };

    nextSocket.onmessage = (event) => {
      if (stopped || socket !== nextSocket) {
        return;
      }

      void handleSyncSocketMessage(event, {
        canPublish: () => !stopped && socket === nextSocket && (options.canPublish?.() ?? true),
      })
        .then((didApplySync) => {
          if (didApplySync && !stopped && socket === nextSocket) {
            onSynced?.();
          }
        })
        .catch((error: unknown) => {
          if (!stopped && socket === nextSocket && (options.canPublish?.() ?? true)) {
            setSyncStatus({
              state: "error",
              message: error instanceof Error ? error.message : "Push sync failed.",
            });
          }
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

    nextSocket.onclose = (event) => {
      if (stopped || socket !== nextSocket) {
        return;
      }

      socket = undefined;

      if (event.code === 1008) {
        stopped = true;
        stopListening();
        clearReconnectTimer();
        setSyncStatus({ state: "error", message: "Push sync authorization changed." });
        options.onAuthorityInvalidated?.();
        return;
      }

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
      void sendSyncSocketClientMessage(currentSocket, "sync-requested").catch(() => {
        if (!stopped && socket === currentSocket) {
          currentSocket.close();
        }
      });
    }
  }

  stopListening = listenForClientEvents((event) => {
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

export function requestSync() {
  publishClientEvent("sync-requested");
}

function createWebSocket(url: string): SyncWebSocket {
  return new WebSocket(url);
}

async function sendSyncSocketClientMessage(
  socket: SyncWebSocket,
  type: SyncSocketClientMessage["type"],
) {
  const message = {
    type,
    cursor: await readCursor(),
    schemaUpdatedAt: await readSchemaUpdatedAt(),
  } satisfies SyncSocketClientMessage;

  socket.send(JSON.stringify(message));
}

async function handleSyncSocketMessage(
  event: MessageEvent,
  options: { canPublish?: () => boolean } = {},
) {
  const message = parseSyncSocketServerMessage(event.data);

  if (!message) {
    throw new Error("Malformed sync socket message.");
  }

  if (message.type === "error") {
    setSyncStatus({ state: "error", message: message.message });
    return false;
  }

  await applySyncResponse(message.payload, options);
  assertClientRuntimePublicationCurrent(options);
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

async function fetchJson<T>(fetcher: typeof fetch, url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetcher(url, {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
    },
    signal,
  });

  return parseJsonResponse<T>(response);
}

async function postJson<T>(
  fetcher: typeof fetch,
  url: string,
  body: unknown,
  options: {
    includeBrowserReplicaWriteHeaders?: boolean;
  } = {},
): Promise<T> {
  const headers = new Headers({
    Accept: "application/json",
    "Content-Type": "application/json",
  });

  if (options.includeBrowserReplicaWriteHeaders) {
    await addBrowserReplicaWriteHeaders(headers);
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
  invalidateProgramAuthorityForProtectedResponse(response);
  const body = (await response.json()) as unknown;

  if (!response.ok) {
    const message = isErrorResponse(body)
      ? body.error
      : `Request failed with status ${response.status}.`;
    throw new Error(message);
  }

  return body as T;
}

async function addBrowserReplicaWriteHeaders(headers: Headers) {
  const [schemaUpdatedAt, schemaProvenance] = await Promise.all([
    readSchemaUpdatedAt(),
    readSchemaProvenance(),
  ]);
  headers.set(FORMLESS_CLIENT_RUNTIME_PROTOCOL_HEADER, String(FORMLESS_RUNTIME_PROTOCOL_VERSION));

  if (schemaUpdatedAt) {
    headers.set(FORMLESS_CLIENT_SCHEMA_UPDATED_AT_HEADER, schemaUpdatedAt);
  }

  if (schemaProvenance?.kind === "program") {
    headers.set(FORMLESS_CLIENT_SOURCE_SCHEMA_HASH_HEADER, schemaProvenance.sourceSchemaHash);
  }
}

function notifyLocalDataChanged(options: { schemaChanged?: boolean } = {}) {
  publishClientEvent("records-updated");
  publishClientEvent("cursor-updated");
  if (options.schemaChanged) {
    publishClientEvent("schema-updated");
  }
}

function notifySchemaChanged() {
  publishClientEvent("schema-updated");
}

function autoSaveSourceForOperation(entity: EntityName): LocalWorkspaceAutoSaveWriteSource {
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

function assertClientRuntimePublicationCurrent(options: {
  canPublish?: (() => boolean) | undefined;
  signal?: AbortSignal | undefined;
}): void {
  if (options.signal?.aborted || options.canPublish?.() === false) {
    throw new Error("Program client runtime ended before publication.");
  }
}

function apiPath(path: string) {
  return `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/${path}`;
}

function syncUrl(cursor: number, schemaUpdatedAt: string | null) {
  const params = new URLSearchParams({ after: String(cursor) });

  if (schemaUpdatedAt) {
    params.set("schemaUpdatedAt", schemaUpdatedAt);
  }

  return `${apiPath("sync")}?${params.toString()}`;
}

function syncWebSocketUrl() {
  const baseUrl =
    typeof globalThis.location === "undefined" ? "http://localhost/" : globalThis.location.href;
  const url = new URL(apiPath("sync/ws"), baseUrl);

  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";

  return url.toString();
}
