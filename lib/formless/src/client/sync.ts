import { listenForClientEvents, publishClientEvent } from "./broadcast.ts";
import { invalidateProgramAuthorityForProtectedResponse } from "./program-authority.ts";
import {
  FORMLESS_PROGRAM_API_ROUTE_PREFIX,
  FORMLESS_PROGRAM_STORAGE_IDENTITY,
} from "../program/target.ts";
import { FORMLESS_RUNTIME_PROTOCOL_VERSION } from "../shared/deploy-metadata.ts";
import {
  deleteProgramReplicaDatabase,
  mergeChanges,
  readCursor,
  readLocalSnapshot,
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
import type { ProgramSessionTargetBinding } from "../shared/instance-auth.ts";
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
  type SyncSocketServerMessage,
} from "../shared/protocol.ts";
import type { AppSchema } from "@dpeek/formless-schema";

const DEFAULT_RECONNECT_INITIAL_DELAY_MS = 500;
const DEFAULT_RECONNECT_MAX_DELAY_MS = 5000;
const PLANNED_RENEWAL_CLOSE_CODE = 4001;
const WEB_SOCKET_OPEN_READY_STATE = 1;

type SyncWebSocket = {
  readyState: number;
  close: () => void;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
};

type StartPushSyncOptions = {
  canPublish?: () => boolean;
  fetcher?: typeof fetch;
  onAuthorityInvalidated?: () => void;
  onSynced?: () => void;
  reconnectInitialDelayMs?: number;
  reconnectMaxDelayMs?: number;
  principalId?: string;
  runtimeTarget?: ProgramSessionTargetBinding;
  signal?: AbortSignal;
  socketFactory?: (url: string) => SyncWebSocket;
};

export type PushSyncHandle = (() => void) & {
  requestSync: () => void;
};

export type BrowserWriteOptions = LocalWorkspaceAutoSaveOptions;

export type SubmitOperationOptions = BrowserWriteOptions & {
  autoSaveSource?: LocalWorkspaceAutoSaveWriteSource;
};

type ClientRuntimePublicationBoundary = {
  canPublish?: (() => boolean) | undefined;
  principalId?: string | undefined;
  runtimeTarget?: ProgramSessionTargetBinding | undefined;
  signal?: AbortSignal | undefined;
};

export async function bootstrapClient(
  fetcher: typeof fetch = fetch,
  options: ClientRuntimePublicationBoundary = {},
) {
  assertClientRuntimePublicationCurrent(options);
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

export async function syncClient(
  fetcher: typeof fetch = fetch,
  options: ClientRuntimePublicationBoundary = {},
) {
  assertClientRuntimePublicationCurrent(options);
  const snapshot = await readLocalSnapshot();
  assertClientRuntimeReplicaBinding(snapshot.principalId, options);
  assertClientRuntimePublicationCurrent(options);
  const url = syncUrl(snapshot.cursor, snapshot.schemaUpdatedAt);
  const response = await fetchJson<SyncResponse>(fetcher, url, options.signal);

  assertClientRuntimePublicationCurrent(options);
  await applySyncResponse(response, { ...options, currentCursor: snapshot.cursor });

  return response;
}

export async function applySyncResponse(
  response: SyncResponse,
  options: ClientRuntimePublicationBoundary & { currentCursor?: number } = {},
) {
  assertClientRuntimePublicationCurrent(options);
  const cursor = options.currentCursor ?? (await readCursor());
  const schemaChanged = Boolean(response.schema && response.schemaUpdatedAt);

  if (response.schema && response.schemaUpdatedAt) {
    await saveSchema(response.schema, response.schemaUpdatedAt, response.schemaProvenance, {
      principalId: options.principalId,
    });
    assertClientRuntimePublicationCurrent(options);
    applySchemaSave(response.schema, response.schemaUpdatedAt);
  }

  if (response.changes.length > 0 || response.cursor !== cursor) {
    await mergeChanges(response.changes, response.cursor, { principalId: options.principalId });
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

export function startPushSync(options: StartPushSyncOptions = {}): PushSyncHandle {
  const onSynced = options.onSynced;
  const reconnectInitialDelayMs =
    options.reconnectInitialDelayMs ?? DEFAULT_RECONNECT_INITIAL_DELAY_MS;
  const reconnectMaxDelayMs = options.reconnectMaxDelayMs ?? DEFAULT_RECONNECT_MAX_DELAY_MS;
  const socketFactory = options.socketFactory ?? createWebSocket;
  const fetcher = options.fetcher ?? fetch;
  const syncController = new AbortController();
  let stopped = false;
  let socket: SyncWebSocket | undefined;
  let pullDirty = false;
  let pullInFlight: Promise<void> | undefined;
  let reconnectTimerId: ReturnType<typeof setTimeout> | undefined;
  let reconnectDelayMs = reconnectInitialDelayMs;
  let renewalAuthorityCheckPending = false;
  let stopListening = () => {};
  const onBoundaryAbort = () => stop();

  if (!options.signal?.aborted) {
    options.signal?.addEventListener("abort", onBoundaryAbort, { once: true });
  }

  function connect() {
    if (stopped) {
      return;
    }

    setSyncStatus({ code: "push-connecting", state: "syncing" });

    let nextSocket: SyncWebSocket;

    try {
      nextSocket = socketFactory(syncWebSocketUrl());
    } catch {
      handleFailedConnection();
      return;
    }

    socket = nextSocket;
    let opened = false;

    nextSocket.onopen = () => {
      if (stopped || socket !== nextSocket) {
        return;
      }

      opened = true;
      renewalAuthorityCheckPending = false;
      reconnectDelayMs = reconnectInitialDelayMs;
      requestHttpSync();
    };

    nextSocket.onmessage = (event) => {
      if (stopped || socket !== nextSocket) {
        return;
      }

      if (!parseSyncSocketServerMessage(event.data)) {
        setSyncStatus({ code: "push-invalid-message", state: "error" });
        return;
      }

      requestHttpSync();
    };

    nextSocket.onerror = () => {
      if (stopped || socket !== nextSocket) {
        return;
      }

      if (!opened) {
        setSyncStatus({ code: "push-connection-failed", state: "error" });
        return;
      }

      setSyncStatus({ code: "push-connection-issue", state: "syncing" });
    };

    nextSocket.onclose = (event) => {
      if (stopped || socket !== nextSocket) {
        return;
      }

      socket = undefined;

      if (event.code === 1008) {
        stop();
        setSyncStatus({ code: "push-authorization-changed", state: "error" });
        options.onAuthorityInvalidated?.();
        return;
      }

      if (event.code === PLANNED_RENEWAL_CLOSE_CODE) {
        renewalAuthorityCheckPending = true;
      }

      if (!opened) {
        handleFailedConnection();
        return;
      }

      setSyncStatus({
        code: event.code === PLANNED_RENEWAL_CLOSE_CODE ? "push-renewing" : "push-reconnecting",
        state: "syncing",
      });
      scheduleReconnect();
    };
  }

  function handleFailedConnection() {
    setSyncStatus({ code: "push-connection-failed", state: "error" });

    if (renewalAuthorityCheckPending) {
      renewalAuthorityCheckPending = false;
      requestHttpSync();
    }

    scheduleReconnect();
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimerId !== undefined) {
      return;
    }

    const delayMs = reconnectDelayMs;
    reconnectDelayMs = Math.min(reconnectDelayMs * 2, reconnectMaxDelayMs);
    reconnectTimerId = globalThis.setTimeout(() => {
      reconnectTimerId = undefined;
      connect();
    }, delayMs);
  }

  function requestHttpSync() {
    if (!clientRuntimePublicationIsCurrent()) {
      return;
    }

    if (pullInFlight) {
      pullDirty = true;
      return;
    }

    pullDirty = false;
    setSyncStatus({ code: "program-catching-up", state: "syncing" });

    const pull = syncClient(fetcher, {
      canPublish: clientRuntimePublicationIsCurrent,
      principalId: options.principalId,
      runtimeTarget: options.runtimeTarget,
      signal: syncController.signal,
    })
      .then(() => {
        if (clientRuntimePublicationIsCurrent()) {
          setSyncStatus({ code: "program-changes-caught-up", state: "idle" });
          onSynced?.();
        }
      })
      .catch(() => {
        pullDirty = false;
        if (clientRuntimePublicationIsCurrent()) {
          setSyncStatus({ code: "program-sync-failed", state: "error" });
        }
      })
      .finally(() => {
        if (pullInFlight !== pull) {
          return;
        }

        pullInFlight = undefined;
        if (pullDirty && clientRuntimePublicationIsCurrent()) {
          requestHttpSync();
        }
      });
    pullInFlight = pull;
  }

  function requestCurrentHttpSync() {
    const currentSocket = socket;

    if (currentSocket && currentSocket.readyState === WEB_SOCKET_OPEN_READY_STATE) {
      requestHttpSync();
    }
  }

  stopListening = listenForClientEvents((event) => {
    if (event.type === "sync-requested") {
      requestCurrentHttpSync();
    }
  });

  if (options.signal?.aborted) {
    stop();
  } else {
    connect();
  }

  const handle = Object.assign(stop, { requestSync: requestCurrentHttpSync });
  return handle;

  function stop() {
    if (stopped) {
      return;
    }

    stopped = true;
    pullDirty = false;
    syncController.abort();
    options.signal?.removeEventListener("abort", onBoundaryAbort);
    stopListening();
    clearReconnectTimer();
    socket?.close();
    socket = undefined;
  }

  function clientRuntimePublicationIsCurrent() {
    return !stopped && !syncController.signal.aborted && (options.canPublish?.() ?? true);
  }

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
  runtimeTarget?: ProgramSessionTargetBinding | undefined;
  signal?: AbortSignal | undefined;
}): void {
  if (options.signal?.aborted || options.canPublish?.() === false) {
    throw new Error("Program client runtime ended before publication.");
  }

  if (
    options.runtimeTarget !== undefined &&
    options.runtimeTarget.storageIdentity !== FORMLESS_PROGRAM_STORAGE_IDENTITY
  ) {
    throw new Error("Program client runtime target changed before publication.");
  }
}

function assertClientRuntimeReplicaBinding(
  principalId: string | null,
  options: ClientRuntimePublicationBoundary,
): void {
  if (options.principalId !== undefined && principalId !== options.principalId) {
    throw new Error("Local Program browser replica principal binding changed.");
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
