import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { publishClientEvent } from "./broadcast.ts";
import { deleteClientDb, mergeRecords, readLocalSnapshot, saveBootstrapResponse } from "./db.ts";
import {
  applyBootstrapResponse,
  applyRecordMerge,
  connectBroadcastToClientStore,
  getClientStoreSnapshot,
  refreshClientStoreFromDb,
  resetClientStore,
  subscribeToClientStore,
  subscribeToClientStoreSelector,
  subscribeToProgramAuthorityChanges,
} from "./store.ts";
import { listenForProgramAuthorityInvalidation } from "./program-authority.ts";
import {
  applySyncResponse,
  bootstrapClient,
  exportStorageSnapshot,
  fetchActiveSchema,
  resetLocalBrowserReplicaState,
  resetSourceSchema,
  requestSync,
  restoreStorageSnapshot,
  saveActiveSchema,
  startPushSync,
  submitOperation,
  syncClient,
} from "./sync.ts";
import { FORMLESS_RUNTIME_PROTOCOL_VERSION } from "../shared/deploy-metadata.ts";
import { STORAGE_SNAPSHOT_KIND, STORAGE_SNAPSHOT_VERSION } from "@dpeek/formless-storage";
import type { StorageSnapshot, StoredRecord } from "@dpeek/formless-storage";
import {
  FORMLESS_CLIENT_RUNTIME_PROTOCOL_HEADER,
  FORMLESS_CLIENT_SCHEMA_UPDATED_AT_HEADER,
  FORMLESS_CLIENT_SOURCE_SCHEMA_HASH_HEADER,
} from "../shared/protocol.ts";
import type {
  BootstrapResponse,
  ChangeRow,
  SchemaResponse,
  SchemaUpdateResponse,
  SyncSocketClientMessage,
  SyncSocketServerMessage,
  SyncResponse,
} from "../shared/protocol.ts";
import type { OperationInvocationResponse } from "../shared/operation-invocation.ts";
import { parseAppSchema, type AppSchema } from "@dpeek/formless-schema";
import {
  rateSourceSchema as rateCardSchema,
  taskSourceSchema as appSchema,
} from "../test/schema-apps.ts";
import type { LocalWorkspaceAutoSaveClient } from "./workspace-auto-save.ts";

beforeEach(async () => {
  await deleteClientDb();
  resetClientStore();
});

describe("client sync", () => {
  it("bootstraps local state from the authority", async () => {
    await bootstrapClient(
      jsonFetcher("/api/formless/program/bootstrap", {
        schema: appSchema,
        schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
        records: [record("record-1", "First")],
        cursor: 1,
      } satisfies BootstrapResponse),
    );

    const snapshot = await readLocalSnapshot();

    expect(snapshot.schema).toEqual(appSchema);
    expect(snapshot.schemaUpdatedAt).toBe("2026-04-28T00:00:00.000Z");
    expect(snapshot.records).toEqual([record("record-1", "First")]);
    expect(snapshot.cursor).toBe(1);
  });

  it("bootstraps the Program replica through its runtime API", async () => {
    await bootstrapClient(
      jsonFetcher("/api/formless/program/bootstrap", {
        schema: appSchema,
        schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
        records: [record("record-1", "Program record")],
        cursor: 1,
      } satisfies BootstrapResponse),
    );

    expect((await readLocalSnapshot()).records).toEqual([record("record-1", "Program record")]);
    expect(getClientStoreSnapshot()).toMatchObject({
      hydrated: true,
      schema: appSchema,
    });
  });

  it("re-bootstraps opened surfaces from Authority after local browser replica reset", async () => {
    await bootstrapClient(
      jsonFetcher("/api/formless/program/bootstrap", {
        schema: appSchema,
        schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
        records: [record("record-1", "Stale browser cache")],
        cursor: 1,
      } satisfies BootstrapResponse),
    );

    await resetLocalBrowserReplicaState();

    expect(getClientStoreSnapshot()).toMatchObject({
      hydrated: false,
      schema: null,
      recordsById: {},
    });

    await bootstrapClient(
      jsonFetcher("/api/formless/program/bootstrap", {
        schema: appSchema,
        schemaUpdatedAt: "2026-04-28T00:01:00.000Z",
        records: [record("record-2", "Authority state")],
        cursor: 2,
      } satisfies BootstrapResponse),
    );

    expect((await readLocalSnapshot()).records).toEqual([record("record-2", "Authority state")]);
    expect(getClientStoreSnapshot()).toMatchObject({
      hydrated: true,
      schemaUpdatedAt: "2026-04-28T00:01:00.000Z",
    });
  });

  it("merges incremental sync records and advances the cursor", async () => {
    await saveBootstrapResponse({
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "First")],
      cursor: 1,
    });

    await syncClient(
      jsonFetcher(
        "/api/formless/program/sync?after=1&schemaUpdatedAt=2026-04-28T00%3A00%3A00.000Z",
        {
          changes: [writeLogChange(2, "record-2", "Second")],
          cursor: 2,
        } satisfies SyncResponse,
      ),
    );

    const snapshot = await readLocalSnapshot();

    expect(snapshot.records.map((storedRecord) => storedRecord.id)).toEqual([
      "record-1",
      "record-2",
    ]);
    expect(snapshot.cursor).toBe(2);
  });

  it("requests sync without schema metadata when no schema is cached", async () => {
    await syncClient(
      jsonFetcher("/api/formless/program/sync?after=0", {
        changes: [],
        cursor: 0,
        schema: appSchema,
        schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      } satisfies SyncResponse),
    );

    const snapshot = await readLocalSnapshot();

    expect(snapshot.schema).toEqual(appSchema);
    expect(snapshot.schemaUpdatedAt).toBe("2026-04-28T00:00:00.000Z");
  });

  it("ignores a dormant source-app replica while syncing Program", async () => {
    await createUnsafeLegacyReplica("formless:tasks");

    await syncClient(
      jsonFetcher("/api/formless/program/sync?after=0", {
        changes: [writeLogChange(1, "record-1", "Authority")],
        cursor: 1,
        schema: appSchema,
        schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      } satisfies SyncResponse),
    );

    const snapshot = await readLocalSnapshot();

    expect(snapshot.schema).toEqual(appSchema);
    expect(snapshot.records).toEqual([record("record-1", "Authority")]);
    expect(snapshot.cursor).toBe(1);
  });

  it("sends browser replica schema provenance facts with operation writes", async () => {
    const storedSourceSchemaHash =
      "sha256:9999999999999999999999999999999999999999999999999999999999999999" as const;

    await saveBootstrapResponse({
      schema: appSchema,
      schemaProvenance: {
        kind: "program",
        sourceSchemaHash: storedSourceSchemaHash,
      },
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [],
      cursor: 0,
    });

    await submitOperation(
      "task",
      "create",
      { input: { title: "Headers", done: false } },
      async (input, init) => {
        const headers = new Headers(init?.headers);

        expect(input).toBe("/api/formless/program/operations/task/create");
        expect(headers.get(FORMLESS_CLIENT_RUNTIME_PROTOCOL_HEADER)).toBe(
          String(FORMLESS_RUNTIME_PROTOCOL_VERSION),
        );
        expect(headers.get(FORMLESS_CLIENT_SCHEMA_UPDATED_AT_HEADER)).toBe(
          "2026-04-28T00:00:00.000Z",
        );
        expect(headers.get(FORMLESS_CLIENT_SOURCE_SCHEMA_HASH_HEADER)).toBe(storedSourceSchemaHash);

        const changes = [writeLogChange(1, "record-1", "Headers")];

        return Response.json(
          operationResponse({
            type: "create",
            affectedChangeIds: changes.map((change) => String(change.seq)),
            changes,
            cursor: 1,
            record: record("record-1", "Headers"),
          }),
        );
      },
    );
  });

  it("sends stored control-plane source provenance with operation writes", async () => {
    const controlPlaneSourceSchemaHash =
      "sha256:8888888888888888888888888888888888888888888888888888888888888888" as const;

    await saveBootstrapResponse({
      schema: appSchema,
      schemaProvenance: {
        kind: "program",
        sourceSchemaHash: controlPlaneSourceSchemaHash,
      },
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [],
      cursor: 0,
    });

    await submitOperation("task", "noop", {}, async (input, init) => {
      const headers = new Headers(init?.headers);

      expect(input).toBe("/api/formless/program/operations/task/noop");
      expect(headers.get(FORMLESS_CLIENT_RUNTIME_PROTOCOL_HEADER)).toBe(
        String(FORMLESS_RUNTIME_PROTOCOL_VERSION),
      );
      expect(headers.get(FORMLESS_CLIENT_SCHEMA_UPDATED_AT_HEADER)).toBe(
        "2026-04-28T00:00:00.000Z",
      );
      expect(headers.get(FORMLESS_CLIENT_SOURCE_SCHEMA_HASH_HEADER)).toBe(
        controlPlaneSourceSchemaHash,
      );

      return Response.json(
        operationResponse({
          type: "command",
          affectedChangeIds: [],
          changes: [],
          cursor: 0,
        }),
      );
    });
  });

  it("merges schema returned by HTTP sync", async () => {
    const nextSchema = schemaWithSummary();

    await saveBootstrapResponse({
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [],
      cursor: 0,
    });

    await syncClient(
      jsonFetcher(
        "/api/formless/program/sync?after=0&schemaUpdatedAt=2026-04-28T00%3A00%3A00.000Z",
        {
          changes: [],
          cursor: 0,
          schema: nextSchema,
          schemaUpdatedAt: "2026-04-28T00:01:00.000Z",
        } satisfies SyncResponse,
      ),
    );

    const snapshot = await readLocalSnapshot();

    expect(snapshot.schema).toEqual(nextSchema);
    expect(snapshot.schemaUpdatedAt).toBe("2026-04-28T00:01:00.000Z");
  });

  it("applies pushed sync responses and advances the cursor", async () => {
    await saveBootstrapResponse({
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "First")],
      cursor: 1,
    });
    await refreshClientStoreFromDb();

    await applySyncResponse({
      changes: [writeLogChange(2, "record-2", "Second")],
      cursor: 2,
    } satisfies SyncResponse);

    const snapshot = await readLocalSnapshot();
    const storeSnapshot = getClientStoreSnapshot();

    expect(snapshot.records.map((storedRecord) => storedRecord.id)).toEqual([
      "record-1",
      "record-2",
    ]);
    expect(snapshot.cursor).toBe(2);
    expect(storeSnapshot.recordsById["record-2"]).toEqual(record("record-2", "Second"));
    expect(storeSnapshot.cursor).toBe(2);
  });

  it("applies schema-only pushed sync responses", async () => {
    const nextSchema = schemaWithSummary();

    await saveBootstrapResponse({
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [],
      cursor: 1,
    });
    await refreshClientStoreFromDb();

    await applySyncResponse({
      changes: [],
      cursor: 1,
      schema: nextSchema,
      schemaUpdatedAt: "2026-04-28T00:01:00.000Z",
    } satisfies SyncResponse);

    const snapshot = await readLocalSnapshot();
    const storeSnapshot = getClientStoreSnapshot();

    expect(snapshot.schema).toEqual(nextSchema);
    expect(snapshot.schemaUpdatedAt).toBe("2026-04-28T00:01:00.000Z");
    expect(snapshot.cursor).toBe(1);
    expect(storeSnapshot.schema).toEqual(nextSchema);
    expect(storeSnapshot.schemaUpdatedAt).toBe("2026-04-28T00:01:00.000Z");
  });

  it("opens a keyed push sync socket and sends hello with local sync state", async () => {
    const sockets = fakeSocketFactory();

    await saveBootstrapResponse({
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "First")],
      cursor: 1,
    });

    const stop = startPushSync({ socketFactory: sockets.create });

    try {
      expect(new URL(sockets.instances[0]?.url ?? "").pathname).toBe(
        "/api/formless/program/sync/ws",
      );

      sockets.instances[0]?.open();

      await waitFor(() => sockets.instances[0]?.sentMessages.length === 1);
      expect(parseSocketClientMessage(sockets.instances[0]?.sentMessages[0])).toEqual({
        type: "hello",
        cursor: 1,
        schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      });
    } finally {
      stop();
    }
  });

  it("opens rate-card push sync on the CRM schema key", () => {
    const sockets = fakeSocketFactory();
    const stop = startPushSync({ socketFactory: sockets.create });

    try {
      expect(new URL(sockets.instances[0]?.url ?? "").pathname).toBe(
        "/api/formless/program/sync/ws",
      );
    } finally {
      stop();
    }
  });

  it("opens Tasks push sync on the Program API path", () => {
    const sockets = fakeSocketFactory();
    const stop = startPushSync({
      socketFactory: sockets.create,
    });

    try {
      expect(new URL(sockets.instances[0]?.url ?? "").pathname).toBe(
        "/api/formless/program/sync/ws",
      );
    } finally {
      stop();
    }
  });

  it("merges pushed sync messages into the selected local database", async () => {
    const sockets = fakeSocketFactory();

    await saveBootstrapResponse({
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "First")],
      cursor: 1,
    });
    await refreshClientStoreFromDb();

    const stop = startPushSync({ socketFactory: sockets.create });

    try {
      sockets.instances[0]?.open();

      sockets.instances[0]?.receive({
        type: "sync",
        payload: {
          changes: [writeLogChange(2, "record-2", "Second")],
          cursor: 2,
        },
      });

      await waitFor(() => getClientStoreSnapshot().cursor === 2);

      const taskSnapshot = await readLocalSnapshot();

      expect(taskSnapshot.records.map((storedRecord) => storedRecord.id)).toEqual([
        "record-1",
        "record-2",
      ]);
      expect(getClientStoreSnapshot().recordsById["record-2"]).toEqual(
        record("record-2", "Second"),
      );
    } finally {
      stop();
    }
  });

  it("applies WebSocket hello catch-up payloads with schema timestamps", async () => {
    const sockets = fakeSocketFactory();
    const nextSchema = schemaWithSummary();

    await saveBootstrapResponse({
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "First")],
      cursor: 1,
    });
    await refreshClientStoreFromDb();

    const stop = startPushSync({ socketFactory: sockets.create });

    try {
      sockets.instances[0]?.open();

      await waitFor(() => sockets.instances[0]?.sentMessages.length === 1);
      expect(parseSocketClientMessage(sockets.instances[0]?.sentMessages[0])).toEqual({
        type: "hello",
        cursor: 1,
        schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      });

      sockets.instances[0]?.receive({
        type: "sync",
        payload: {
          changes: [writeLogChange(2, "record-2", "Second")],
          cursor: 2,
          schema: nextSchema,
          schemaUpdatedAt: "2026-04-28T00:01:00.000Z",
        },
      });

      await waitFor(() => getClientStoreSnapshot().cursor === 2);

      const snapshot = await readLocalSnapshot();
      const storeSnapshot = getClientStoreSnapshot();

      expect(snapshot.schema).toEqual(nextSchema);
      expect(snapshot.schemaUpdatedAt).toBe("2026-04-28T00:01:00.000Z");
      expect(snapshot.records.map((storedRecord) => storedRecord.id)).toEqual([
        "record-1",
        "record-2",
      ]);
      expect(snapshot.cursor).toBe(2);
      expect(storeSnapshot.schema).toEqual(nextSchema);
      expect(storeSnapshot.recordsById["record-2"]).toEqual(record("record-2", "Second"));
      expect(storeSnapshot.cursor).toBe(2);
    } finally {
      stop();
    }
  });

  it("notifies callers after pushed sync messages are applied", async () => {
    const sockets = fakeSocketFactory();
    let syncedCount = 0;

    await saveBootstrapResponse({
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "First")],
      cursor: 1,
    });
    await refreshClientStoreFromDb();

    const stop = startPushSync({
      onSynced: () => {
        syncedCount += 1;
      },
      socketFactory: sockets.create,
    });

    try {
      sockets.instances[0]?.open();

      sockets.instances[0]?.receive({
        type: "sync",
        payload: {
          changes: [writeLogChange(2, "record-2", "Second")],
          cursor: 2,
        },
      });

      await waitFor(() => syncedCount === 1);

      expect(getClientStoreSnapshot().cursor).toBe(2);
      expect(getClientStoreSnapshot().recordsById["record-2"]).toEqual(
        record("record-2", "Second"),
      );
    } finally {
      stop();
    }
  });

  it("sends sync-requested over an open push sync socket", async () => {
    const sockets = fakeSocketFactory();

    await saveBootstrapResponse({
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "First")],
      cursor: 1,
    });

    const stop = startPushSync({ socketFactory: sockets.create });

    try {
      sockets.instances[0]?.open();
      await waitFor(() => sockets.instances[0]?.sentMessages.length === 1);

      requestSync();

      await waitFor(() => sockets.instances[0]?.sentMessages.length === 2);
      expect(parseSocketClientMessage(sockets.instances[0]?.sentMessages[1])).toEqual({
        type: "sync-requested",
        cursor: 1,
        schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      });
    } finally {
      stop();
    }
  });

  it("uses operation output cursors for later push sync requests", async () => {
    const sockets = fakeSocketFactory();
    const acceptedRecord = record("record-2", "Second");

    await saveBootstrapResponse({
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "First")],
      cursor: 1,
    });

    const stop = startPushSync({ socketFactory: sockets.create });

    try {
      sockets.instances[0]?.open();
      await waitFor(() => sockets.instances[0]?.sentMessages.length === 1);

      await submitOperation(
        "task",
        "create",
        { input: { title: "Second", done: false } },
        async (_input, init) => {
          const operation = parseOperationRequestBody(init?.body);
          const changes = [
            materializedRecordChange(2, operation.idempotencyKey, acceptedRecord, "create"),
          ];

          return Response.json(
            operationResponse({
              type: "create",
              affectedChangeIds: changes.map((change) => String(change.seq)),
              changes,
              cursor: 2,
              record: acceptedRecord,
            }),
          );
        },
      );

      requestSync();

      await waitFor(() => sockets.instances[0]?.sentMessages.length === 2);
      expect(parseSocketClientMessage(sockets.instances[0]?.sentMessages[1])).toEqual({
        type: "sync-requested",
        cursor: 2,
        schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      });
    } finally {
      stop();
    }
  });

  it("reconnects push sync after an opened socket closes", async () => {
    const sockets = fakeSocketFactory();
    const stop = startPushSync({
      reconnectInitialDelayMs: 1,
      reconnectMaxDelayMs: 2,
      socketFactory: sockets.create,
    });

    try {
      sockets.instances[0]?.open();
      await waitFor(() => sockets.instances[0]?.sentMessages.length === 1);
      sockets.instances[0]?.closeFromServer();

      await waitFor(() => sockets.instances.length === 2);
      expect(new URL(sockets.instances[1]?.url ?? "").pathname).toBe(
        "/api/formless/program/sync/ws",
      );
    } finally {
      stop();
    }
  });

  it("invalidates authority and suppresses reconnect after push policy violation", async () => {
    const sockets = fakeSocketFactory();
    let invalidations = 0;
    const stop = startPushSync({
      onAuthorityInvalidated: () => {
        invalidations += 1;
      },
      reconnectInitialDelayMs: 1,
      reconnectMaxDelayMs: 2,
      socketFactory: sockets.create,
    });

    try {
      sockets.instances[0]?.open();
      await waitFor(() => sockets.instances[0]?.sentMessages.length === 1);
      sockets.instances[0]?.closeFromServer(1008);

      await waitFor(() => invalidations === 1);
      await new Promise((resolve) => globalThis.setTimeout(resolve, 10));
      expect(sockets.instances).toHaveLength(1);
    } finally {
      stop();
    }
  });

  it("closes the push sync socket when stopped", async () => {
    const sockets = fakeSocketFactory();
    const stop = startPushSync({ socketFactory: sockets.create });

    sockets.instances[0]?.open();
    await waitFor(() => sockets.instances[0]?.sentMessages.length === 1);
    stop();

    expect(sockets.instances[0]?.readyState).toBe(3);
  });

  it("merges accepted create operations into local state", async () => {
    const acceptedRecord = record("record-1", "First");

    const response = await submitOperation(
      "task",
      "create",
      { input: { title: "First", done: false } },
      async (input, init) => {
        const operation = parseOperationRequestBody(init?.body);
        const changes = [
          materializedRecordChange(1, operation.idempotencyKey, acceptedRecord, "create"),
        ];

        expect(input).toBe("/api/formless/program/operations/task/create");
        expect(init?.method).toBe("POST");
        expect(operation).toMatchObject({
          input: { title: "First", done: false },
          source: { protocol: "generated-ui" },
        });

        return Response.json(
          operationResponse({
            type: "create",
            affectedChangeIds: changes.map((change) => String(change.seq)),
            changes,
            cursor: 1,
            record: acceptedRecord,
          }),
        );
      },
    );

    const snapshot = await readLocalSnapshot();

    expect(response.output.type).toBe("create");
    expect(response.output.type === "create" ? response.output.record : undefined).toEqual(
      acceptedRecord,
    );
    expect(snapshot.records).toEqual([acceptedRecord]);
    expect(snapshot.cursor).toBe(1);
  });

  it("merges replayed operation outputs without marking workspace source dirty", async () => {
    const autoSave = captureAutoSave();
    const replayedRecord = record("record-1", "Replayed");

    const response = await submitOperation(
      "task",
      "create",
      { idempotencyKey: "operation-replay-key", input: { title: "Ignored", done: false } },
      async (_input, init) => {
        const operation = parseOperationRequestBody(init?.body);
        const changes = [
          materializedRecordChange(1, operation.idempotencyKey, replayedRecord, "create"),
        ];

        return Response.json(
          operationResponse(
            {
              type: "create",
              affectedChangeIds: changes.map((change) => String(change.seq)),
              changes,
              cursor: 1,
              record: replayedRecord,
            },
            "replayed",
          ),
        );
      },
      { autoSave },
    );

    const snapshot = await readLocalSnapshot();

    expect(response.status).toBe("replayed");
    expect(response.output.type === "create" ? response.output.record : undefined).toEqual(
      replayedRecord,
    );
    expect(snapshot.records).toEqual([replayedRecord]);
    expect(snapshot.cursor).toBe(1);
    expect(autoSave.inputs).toEqual([]);
  });

  it("posts update operations and merges accepted records", async () => {
    const acceptedRecord = record("record-1", "First", true);

    const response = await submitOperation(
      "task",
      "update",
      { input: { done: true }, recordId: "record-1" },
      async (input, init) => {
        const operation = parseOperationRequestBody(init?.body);
        const changes = [
          materializedRecordChange(2, operation.idempotencyKey, acceptedRecord, "update"),
        ];

        expect(input).toBe("/api/formless/program/operations/task/update");
        expect(init?.method).toBe("POST");
        expect(operation).toMatchObject({
          input: { done: true },
          recordId: "record-1",
          source: { protocol: "generated-ui" },
        });

        return Response.json(
          operationResponse({
            type: "update",
            affectedChangeIds: changes.map((change) => String(change.seq)),
            changes,
            cursor: 2,
            record: acceptedRecord,
          }),
        );
      },
    );

    const snapshot = await readLocalSnapshot();

    expect(response.output.type).toBe("update");
    expect(response.output.type === "update" ? response.output.record : undefined).toEqual(
      acceptedRecord,
    );
    expect(snapshot.records).toEqual([acceptedRecord]);
    expect(snapshot.cursor).toBe(2);
  });

  it("posts delete operations and merges accepted tombstones", async () => {
    const activeRecord = record("record-1", "First", false);
    const tombstone = {
      ...activeRecord,
      deletedAt: "2026-04-28T00:01:00.000Z",
    };

    await saveBootstrapResponse({
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [activeRecord],
      cursor: 1,
    });
    await refreshClientStoreFromDb();

    const response = await submitOperation(
      "task",
      "delete",
      { recordId: "record-1" },
      async (input, init) => {
        const operation = parseOperationRequestBody(init?.body);
        const changes = [
          materializedRecordChange(2, operation.idempotencyKey, tombstone, "delete"),
        ];

        expect(input).toBe("/api/formless/program/operations/task/delete");
        expect(init?.method).toBe("POST");
        expect(operation).toMatchObject({
          recordId: "record-1",
          source: { protocol: "generated-ui" },
        });
        expect(operation).not.toHaveProperty("input");

        return Response.json(
          operationResponse({
            type: "delete",
            affectedChangeIds: changes.map((change) => String(change.seq)),
            changes,
            cursor: 2,
            recordId: tombstone.id,
          }),
        );
      },
    );

    const snapshot = await readLocalSnapshot();
    const storeSnapshot = getClientStoreSnapshot();

    expect(response.output.type).toBe("delete");
    expect(response.output.type === "delete" ? response.output.recordId : undefined).toBe(
      tombstone.id,
    );
    expect(snapshot.records).toEqual([tombstone]);
    expect(storeSnapshot.recordsById["record-1"]).toEqual(tombstone);
    expect(storeSnapshot.recordIdsByEntity.task ?? []).toEqual([]);
    expect(snapshot.cursor).toBe(2);
  });

  it("merges all records returned by an accepted create operation before advancing cursor", async () => {
    const primaryRecord = record("record-1", "First");
    const lifecycleRecord = record("record-2", "Lifecycle");

    await submitOperation(
      "task",
      "create",
      { input: { title: "First", done: false } },
      async (_input, init) => {
        const operation = parseOperationRequestBody(init?.body);
        const changes = [
          materializedRecordChange(1, operation.idempotencyKey, primaryRecord, "create"),
          materializedRecordChange(2, operation.idempotencyKey, lifecycleRecord, "command"),
        ];

        return Response.json(
          operationResponse({
            type: "create",
            affectedChangeIds: changes.map((change) => String(change.seq)),
            changes,
            cursor: 2,
            record: primaryRecord,
          }),
        );
      },
    );

    const snapshot = await readLocalSnapshot();
    const storeSnapshot = getClientStoreSnapshot();

    expect(snapshot.records).toEqual([primaryRecord, lifecycleRecord]);
    expect(storeSnapshot.recordsById[lifecycleRecord.id]).toEqual(lifecycleRecord);
    expect(snapshot.cursor).toBe(2);
  });

  it("merges remote patched records", async () => {
    await saveBootstrapResponse({
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "First", false)],
      cursor: 1,
    });

    await syncClient(
      jsonFetcher(
        "/api/formless/program/sync?after=1&schemaUpdatedAt=2026-04-28T00%3A00%3A00.000Z",
        {
          changes: [writeLogChange(2, "record-1", "First", true, "update")],
          cursor: 2,
        } satisfies SyncResponse,
      ),
    );

    const snapshot = await readLocalSnapshot();

    expect(snapshot.records).toEqual([record("record-1", "First", true)]);
    expect(snapshot.cursor).toBe(2);
  });

  it("merges HTTP catch-up tombstones without replacing current schema metadata", async () => {
    const activeRecord = record("record-1", "Done", true);
    const openRecord = record("record-2", "Open", false);
    const tombstone = {
      ...activeRecord,
      deletedAt: "2026-04-28T00:01:00.000Z",
    };

    await saveBootstrapResponse({
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [activeRecord, openRecord],
      cursor: 3,
    });
    await refreshClientStoreFromDb();

    await syncClient(
      jsonFetcher(
        "/api/formless/program/sync?after=3&schemaUpdatedAt=2026-04-28T00%3A00%3A00.000Z",
        {
          changes: [materializedRecordChange(4, "write-http-delete-catchup", tombstone, "delete")],
          cursor: 4,
        } satisfies SyncResponse,
      ),
    );

    const snapshot = await readLocalSnapshot();
    const storeSnapshot = getClientStoreSnapshot();

    expect(snapshot.schema).toEqual(appSchema);
    expect(snapshot.schemaUpdatedAt).toBe("2026-04-28T00:00:00.000Z");
    expect(snapshot.records).toContainEqual(tombstone);
    expect(storeSnapshot.recordsById[activeRecord.id]).toEqual(tombstone);
    expect(storeSnapshot.recordIdsByEntity.task).toEqual([openRecord.id]);
    expect(snapshot.cursor).toBe(4);
    expect(storeSnapshot.cursor).toBe(4);
  });

  it("submits command operations and merges tombstones into local state", async () => {
    const tombstone = {
      ...record("record-1", "Done", true),
      deletedAt: "2026-04-28T00:01:00.000Z",
    };

    await saveBootstrapResponse({
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "Done", true)],
      cursor: 1,
    });
    await refreshClientStoreFromDb();

    const response = await submitOperation(
      "task",
      "clearCompletedTasks",
      {},
      async (input, init) => {
        const operation = parseOperationRequestBody(init?.body);
        const changes = [commandMaterializationChange(2, tombstone, operation.idempotencyKey)];

        expect(input).toBe("/api/formless/program/operations/task/clearCompletedTasks");
        expect(init?.method).toBe("POST");
        expect(operation).toMatchObject({
          source: { protocol: "generated-ui" },
        });

        return Response.json(
          operationResponse({
            type: "command",
            affectedChangeIds: changes.map((change) => String(change.seq)),
            changes,
            cursor: 2,
          }),
        );
      },
    );

    const snapshot = await readLocalSnapshot();
    const storeSnapshot = getClientStoreSnapshot();

    expect(response.status).toBe("committed");
    expect(
      response.output.type === "command" ? response.output.affectedChangeIds : undefined,
    ).toEqual(["2"]);
    expect(
      response.output.type === "command" ? response.output.changes[0]?.payload : undefined,
    ).toEqual(tombstone);
    expect(snapshot.records).toEqual([tombstone]);
    expect(storeSnapshot.recordsById["record-1"]).toEqual(tombstone);
    expect(storeSnapshot.recordIdsByEntity.task ?? []).toEqual([]);
    expect(storeSnapshot.cursor).toBe(2);
  });

  it("enqueues local workspace auto-save after committed browser writes", async () => {
    const autoSave = captureAutoSave();
    const acceptedRecord = record("record-1", "First");
    const nextSchema = schemaWithSummary();
    const restoredRecord = record("record-2", "Restored");
    const resetSchemaRecord = record("record-3", "Reset schema");

    await submitOperation(
      "task",
      "create",
      { input: { title: "First", done: false } },
      async (_input, init) => {
        const operation = parseOperationRequestBody(init?.body);
        const changes = [
          materializedRecordChange(1, operation.idempotencyKey, acceptedRecord, "create"),
        ];

        return Response.json(
          operationResponse({
            type: "create",
            affectedChangeIds: changes.map((change) => String(change.seq)),
            changes,
            cursor: 1,
            record: acceptedRecord,
          }),
        );
      },
      { autoSave },
    );

    await saveActiveSchema(
      nextSchema,
      jsonFetcher("/api/formless/program/schema", {
        schema: nextSchema,
        updatedAt: "2026-04-28T00:01:00.000Z",
      } satisfies SchemaUpdateResponse),
      { autoSave },
    );

    await restoreStorageSnapshot(
      storageSnapshot({ records: [restoredRecord] }),
      jsonFetcher("/api/formless/program/snapshot/restore", {
        schema: appSchema,
        schemaUpdatedAt: "2026-04-28T00:02:00.000Z",
        records: [restoredRecord],
        cursor: 2,
      } satisfies BootstrapResponse),
      { autoSave },
    );

    await resetSourceSchema(
      jsonFetcher("/api/formless/program/reset/schema", {
        schema: appSchema,
        schemaUpdatedAt: "2026-04-28T00:03:00.000Z",
        records: [resetSchemaRecord],
        cursor: 3,
      } satisfies BootstrapResponse),
      { autoSave },
    );

    expect(autoSave.inputs).toEqual([
      { source: "control-plane-write" },
      { source: "schema-save" },
      { source: "snapshot-restore" },
      { source: "reset-schema" },
    ]);
  });

  it("classifies control-plane, deployment intent, and media reference writes", async () => {
    const autoSave = captureAutoSave();
    const routeRecord: StoredRecord = {
      createdAt: "2026-04-28T00:00:01.000Z",
      updatedAt: "2026-04-28T00:00:01.000Z",
      entity: "route",
      id: "route-1",
      values: { enabled: true, kind: "mount" },
    };
    const deploymentRecord: StoredRecord = {
      createdAt: "2026-04-28T00:00:02.000Z",
      updatedAt: "2026-04-28T00:00:02.000Z",
      entity: "deployment-config",
      id: "deployment-1",
      values: { enabled: true, label: "Primary" },
    };
    const mediaRecord: StoredRecord = {
      createdAt: "2026-04-28T00:00:03.000Z",
      updatedAt: "2026-04-28T00:00:03.000Z",
      entity: "block",
      id: "block-1",
      values: { mediaAsset: "hero.webp" },
    };

    await submitOperation(
      "route",
      "update",
      { input: { enabled: true }, recordId: routeRecord.id },
      async (_input, init) => {
        const operation = parseOperationRequestBody(init?.body);
        const changes = [
          materializedRecordChange(1, operation.idempotencyKey, routeRecord, "update"),
        ];

        return Response.json(
          operationResponse({
            type: "update",
            affectedChangeIds: changes.map((change) => String(change.seq)),
            changes,
            cursor: 1,
            record: routeRecord,
          }),
        );
      },
      { autoSave },
    );

    await submitOperation(
      "deployment-config",
      "update",
      { input: { enabled: true }, recordId: deploymentRecord.id },
      async (_input, init) => {
        const operation = parseOperationRequestBody(init?.body);
        const changes = [
          materializedRecordChange(2, operation.idempotencyKey, deploymentRecord, "update"),
        ];

        return Response.json(
          operationResponse({
            type: "update",
            affectedChangeIds: changes.map((change) => String(change.seq)),
            changes,
            cursor: 2,
            record: deploymentRecord,
          }),
        );
      },
      { autoSave },
    );

    await submitOperation(
      "block",
      "update",
      { input: { mediaAsset: "hero.webp" }, recordId: mediaRecord.id },
      async (_input, init) => {
        const operation = parseOperationRequestBody(init?.body);
        const changes = [
          materializedRecordChange(3, operation.idempotencyKey, mediaRecord, "update"),
        ];

        return Response.json(
          operationResponse({
            type: "update",
            affectedChangeIds: changes.map((change) => String(change.seq)),
            changes,
            cursor: 3,
            record: mediaRecord,
          }),
        );
      },
      { autoSave, autoSaveSource: "media-reference" },
    );

    expect(autoSave.inputs).toEqual([
      { source: "control-plane-write" },
      { source: "deployment-intent" },
      { source: "media-reference" },
    ]);
  });

  it("does not enqueue local workspace auto-save for failed writes", async () => {
    const autoSave = captureAutoSave();

    await expect(
      submitOperation(
        "task",
        "create",
        { input: { title: "Rejected", done: false } },
        async () => Response.json({ error: "Rejected." }, { status: 400 }),
        { autoSave },
      ),
    ).rejects.toThrow("Rejected.");

    await expect(
      saveActiveSchema(
        schemaWithSummary(),
        async () => Response.json({ error: "Invalid schema." }, { status: 400 }),
        { autoSave },
      ),
    ).rejects.toThrow("Invalid schema.");

    expect(autoSave.inputs).toEqual([]);
  });

  it("uses Program API paths for Task sync, writes, snapshots, and schema reset", async () => {
    const createdRecord = record("record-2", "Created in work");
    const tombstone = {
      ...createdRecord,
      deletedAt: "2026-04-28T00:03:00.000Z",
    };
    const restoredRecord = record("record-4", "Restored work");

    await saveBootstrapResponse({
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "Existing work")],
      cursor: 1,
    });
    await refreshClientStoreFromDb();

    await syncClient(
      jsonFetcher(
        "/api/formless/program/sync?after=1&schemaUpdatedAt=2026-04-28T00%3A00%3A00.000Z",
        {
          changes: [writeLogChange(2, "record-2", "Created in work")],
          cursor: 2,
        } satisfies SyncResponse,
      ),
    );

    await submitOperation(
      "task",
      "create",
      { input: { title: "Created in work", done: false } },
      async (input, init) => {
        const operation = parseOperationRequestBody(init?.body);
        const changes = [
          materializedRecordChange(3, operation.idempotencyKey, createdRecord, "create"),
        ];

        expect(input).toBe("/api/formless/program/operations/task/create");
        expect(init?.method).toBe("POST");

        return Response.json(
          operationResponse({
            type: "create",
            affectedChangeIds: changes.map((change) => String(change.seq)),
            changes,
            cursor: 3,
            record: createdRecord,
          }),
        );
      },
    );

    await submitOperation("task", "clearCompletedTasks", {}, async (input, init) => {
      const operation = parseOperationRequestBody(init?.body);
      const changes = [commandMaterializationChange(4, tombstone, operation.idempotencyKey)];

      expect(input).toBe("/api/formless/program/operations/task/clearCompletedTasks");
      expect(init?.method).toBe("POST");

      return Response.json(
        operationResponse({
          type: "command",
          affectedChangeIds: changes.map((change) => String(change.seq)),
          changes,
          cursor: 4,
        }),
      );
    });

    const exported = await exportStorageSnapshot(
      jsonFetcher(
        "/api/formless/program/snapshot",
        storageSnapshot({
          records: [tombstone],
          schemaKey: "formless-program",
          sourceCursor: 4,
          storageIdentity: "instance:control-plane",
        }),
      ),
    );
    const restored = await restoreStorageSnapshot(
      storageSnapshot({
        records: [restoredRecord],
        schemaKey: "formless-program",
        sourceCursor: 4,
        storageIdentity: "instance:control-plane",
      }),
      async (input, init) => {
        expect(input).toBe("/api/formless/program/snapshot/restore");
        expect(init?.method).toBe("POST");

        return Response.json({
          schema: appSchema,
          schemaUpdatedAt: "2026-04-28T00:04:00.000Z",
          records: [restoredRecord],
          cursor: 5,
        } satisfies BootstrapResponse);
      },
    );

    await resetSourceSchema(
      jsonFetcher("/api/formless/program/reset/schema", {
        schema: appSchema,
        schemaUpdatedAt: "2026-04-28T00:05:00.000Z",
        records: [restoredRecord],
        cursor: 6,
      } satisfies BootstrapResponse),
    );

    expect(exported.records).toEqual([tombstone]);
    expect(restored.records).toEqual([restoredRecord]);
    expect((await readLocalSnapshot()).records).toEqual([restoredRecord]);
    expect(getClientStoreSnapshot()).toMatchObject({
      hydrated: true,
      cursor: 6,
    });
  });

  it("submits CRM command operations to the Program API and merges created rates", async () => {
    const createdRate = rateRecord("rate-1", "resource-1", "card-1");

    await saveBootstrapResponse({
      schema: rateCardSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [],
      cursor: 0,
    });
    await refreshClientStoreFromDb();

    const response = await submitOperation(
      "rate",
      "regenerateMissingRates",
      {},
      async (input, init) => {
        const operation = parseOperationRequestBody(init?.body);
        const changes = [commandMaterializationChange(1, createdRate, operation.idempotencyKey)];

        expect(input).toBe("/api/formless/program/operations/rate/regenerateMissingRates");
        expect(init?.method).toBe("POST");
        expect(operation).toMatchObject({
          source: { protocol: "generated-ui" },
        });

        return Response.json(
          operationResponse({
            type: "command",
            affectedChangeIds: changes.map((change) => String(change.seq)),
            changes,
            cursor: 1,
          }),
        );
      },
    );

    const rateSnapshot = await readLocalSnapshot();
    const storeSnapshot = getClientStoreSnapshot();

    expect(
      response.output.type === "command" ? response.output.changes[0]?.payload : undefined,
    ).toEqual(createdRate);
    expect(rateSnapshot.records).toEqual([createdRate]);
    expect(storeSnapshot.recordsById[createdRate.id]).toEqual(createdRate);
    expect(storeSnapshot.recordIdsByEntity.rate).toEqual([createdRate.id]);
    expect(storeSnapshot.cursor).toBe(1);
  });

  it("keeps tombstoned records in IndexedDB while hiding them from active selectors", async () => {
    const tombstone = {
      ...record("record-1", "Done", true),
      deletedAt: "2026-04-28T00:01:00.000Z",
    };

    await saveBootstrapResponse({
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "Done", true), record("record-2", "Open")],
      cursor: 1,
    });
    await refreshClientStoreFromDb();

    await syncClient(
      jsonFetcher(
        "/api/formless/program/sync?after=1&schemaUpdatedAt=2026-04-28T00%3A00%3A00.000Z",
        {
          changes: [commandMaterializationChange(2, tombstone, "command-1")],
          cursor: 2,
        } satisfies SyncResponse,
      ),
    );

    const snapshot = await readLocalSnapshot();
    const storeSnapshot = getClientStoreSnapshot();

    expect(snapshot.records).toContainEqual(tombstone);
    expect(storeSnapshot.recordsById["record-1"]).toEqual(tombstone);
    expect(storeSnapshot.recordIdsByEntity.task).toEqual(["record-2"]);
  });

  it("fetches and caches the active schema", async () => {
    const nextSchema = schemaWithSummary();

    await fetchActiveSchema(
      jsonFetcher("/api/formless/program/schema", {
        schema: nextSchema,
        updatedAt: "2026-04-28T00:00:00.000Z",
      } satisfies SchemaResponse),
    );

    const snapshot = await readLocalSnapshot();

    expect(snapshot.schema).toEqual(nextSchema);
    expect(snapshot.schemaUpdatedAt).toBe("2026-04-28T00:00:00.000Z");
  });

  it("saves accepted schema updates into local state", async () => {
    const nextSchema = schemaWithSummary();

    const response = await saveActiveSchema(nextSchema, async (input, init) => {
      expect(input).toBe("/api/formless/program/schema");
      expect(init?.method).toBe("POST");
      expect(parsePlainRequestBody(init?.body)).toEqual({ schema: nextSchema });

      return Response.json({
        schema: nextSchema,
        updatedAt: "2026-04-28T00:00:00.000Z",
      } satisfies SchemaUpdateResponse);
    });

    const snapshot = await readLocalSnapshot();

    expect(response.schema).toEqual(nextSchema);
    expect(snapshot.schema).toEqual(nextSchema);
    expect(snapshot.schemaUpdatedAt).toBe("2026-04-28T00:00:00.000Z");
  });

  it("exports the Program storage snapshot", async () => {
    const snapshot = storageSnapshot({
      records: [record("record-1", "First")],
      sourceCursor: 3,
    });

    const response = await exportStorageSnapshot(
      jsonFetcher("/api/formless/program/snapshot", snapshot),
    );

    expect(response).toEqual(snapshot);
  });

  it("restores storage snapshots and replaces the selected local replica", async () => {
    const restoredRecord = record("record-2", "Restored");
    const restoredSchema = schemaWithSummary();
    const requestSnapshot = storageSnapshot({
      records: [restoredRecord],
      schema: restoredSchema,
    });

    await saveBootstrapResponse({
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "Old")],
      cursor: 1,
    });
    await refreshClientStoreFromDb();

    const response = await restoreStorageSnapshot(requestSnapshot, async (input, init) => {
      expect(input).toBe("/api/formless/program/snapshot/restore");
      expect(init?.method).toBe("POST");
      expect(parsePlainRequestBody(init?.body)).toEqual(requestSnapshot);

      return Response.json({
        schema: restoredSchema,
        schemaUpdatedAt: "2026-04-28T00:02:00.000Z",
        records: [restoredRecord],
        cursor: 4,
      } satisfies BootstrapResponse);
    });
    const snapshot = await readLocalSnapshot();
    const clientSnapshot = getClientStoreSnapshot();

    expect(response.records).toEqual([restoredRecord]);
    expect(snapshot.schema).toEqual(restoredSchema);
    expect(snapshot.schemaUpdatedAt).toBe("2026-04-28T00:02:00.000Z");
    expect(snapshot.records).toEqual([restoredRecord]);
    expect(snapshot.cursor).toBe(4);
    expect(clientSnapshot.recordsById["record-1"]).toBeUndefined();
    expect(clientSnapshot.recordsById["record-2"]).toEqual(restoredRecord);
    expect(clientSnapshot.cursor).toBe(4);
  });

  it("keeps the selected local replica unchanged when snapshot restore fails", async () => {
    const existingRecord = record("record-1", "Old");

    await saveBootstrapResponse({
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [existingRecord],
      cursor: 1,
    });
    await refreshClientStoreFromDb();

    try {
      await restoreStorageSnapshot(storageSnapshot(), async () =>
        Response.json({ error: 'Storage snapshot schemaKey must be "tasks".' }, { status: 400 }),
      );
      throw new Error("Expected restore to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('Storage snapshot schemaKey must be "tasks".');
    }

    const snapshot = await readLocalSnapshot();
    const clientSnapshot = getClientStoreSnapshot();

    expect(snapshot.records).toEqual([existingRecord]);
    expect(snapshot.cursor).toBe(1);
    expect(clientSnapshot.recordsById["record-1"]).toEqual(existingRecord);
    expect(clientSnapshot.cursor).toBe(1);
  });

  it("resets source schema without deleting the selected local database", async () => {
    const acceptedRecord = record("record-2", "Second");

    await saveBootstrapResponse({
      schema: appSchema,
      schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      records: [record("record-1", "First")],
      cursor: 1,
    });

    const response = await resetSourceSchema(
      jsonFetcher("/api/formless/program/reset/schema", {
        schema: appSchema,
        schemaUpdatedAt: "2026-04-28T00:01:00.000Z",
        records: [acceptedRecord],
        cursor: 2,
      } satisfies BootstrapResponse),
    );
    const snapshot = await readLocalSnapshot();
    const storeSnapshot = getClientStoreSnapshot();

    expect(response.records).toEqual([acceptedRecord]);
    expect(snapshot.records).toEqual([acceptedRecord]);
    expect(snapshot.cursor).toBe(2);
    expect(storeSnapshot.recordsById["record-1"]).toBeUndefined();
    expect(storeSnapshot.recordsById["record-2"]).toEqual(acceptedRecord);
    expect(storeSnapshot.cursor).toBe(2);
  });

  it("can request the rate-card source schema reset", async () => {
    await resetSourceSchema(async (input, init) => {
      expect(input).toBe("/api/formless/program/reset/schema");
      expect(init?.method).toBe("POST");
      expect(parsePlainRequestBody(init?.body)).toEqual({});

      return Response.json({
        schema: appSchema,
        schemaUpdatedAt: "2026-04-28T00:01:00.000Z",
        records: [],
        cursor: 0,
      } satisfies BootstrapResponse);
    });
  });

  it("refreshes schema state from broadcast events", async () => {
    const states = [getClientStoreSnapshot()];
    const unsubscribe = subscribeToClientStore(() => states.push(getClientStoreSnapshot()));
    const stopBroadcast = connectBroadcastToClientStore();
    const nextSchema = schemaWithSummary();

    try {
      await saveActiveSchema(
        nextSchema,
        jsonFetcher("/api/formless/program/schema", {
          schema: nextSchema,
          updatedAt: "2026-04-28T00:00:00.000Z",
        } satisfies SchemaUpdateResponse),
      );
      await waitFor(() =>
        states.some(
          (state) =>
            state.schema?.entities.find((definition) => definition.key === "task")!.label ===
            "Planner task",
        ),
      );
      expect(states.at(-1)?.schema).toEqual(nextSchema);
    } finally {
      stopBroadcast();
      unsubscribe();
    }
  });

  it("refreshes state from broadcast events without remounting routes", async () => {
    const states = [getClientStoreSnapshot()];
    const unsubscribe = subscribeToClientStore(() => states.push(getClientStoreSnapshot()));
    const stopBroadcast = connectBroadcastToClientStore();

    try {
      await mergeRecords([record("record-1", "First")], 1);
      publishClientEvent("records-updated");

      await waitFor(() => states.some((state) => state.recordIdsByEntity.task?.length === 1));
      expect(states.at(-1)?.recordsById["record-1"]).toEqual(record("record-1", "First"));
    } finally {
      stopBroadcast();
      unsubscribe();
    }
  });

  it("detects current-principal role upgrade, downgrade, and owner removal only", () => {
    const principalId = "principal:one";
    const ownerRole = authorityRecord("role:owner", "role", {
      key: "instance.owner",
      status: "active",
    });
    const ownerAssignment = authorityRecord("role-assignment:owner", "role-assignment", {
      role: ownerRole.id,
      scopeKind: "instance",
      status: "active",
      targetKind: "principal",
      targetPrincipal: principalId,
    });
    const programAssignment = authorityRecord(
      "program-role-assignment:one",
      "program-role-assignment",
      {
        principal: principalId,
        roleId: "role:member",
        status: "active",
      },
    );
    applyBootstrapResponse({
      cursor: 1,
      records: [
        authorityRecord(principalId, "principal", { status: "active" }),
        ownerRole,
        ownerAssignment,
        programAssignment,
      ],
      schema: appSchema,
      schemaUpdatedAt: "2026-08-02T00:00:00.000Z",
    });
    let invalidations = 0;
    const stop = subscribeToProgramAuthorityChanges(principalId, () => {
      invalidations += 1;
    });

    try {
      applyRecordMerge([
        {
          ...programAssignment,
          updatedAt: "2026-08-02T00:01:00.000Z",
          values: { ...programAssignment.values, roleId: "role:administrator" },
        },
      ]);
      applyRecordMerge([
        {
          ...programAssignment,
          updatedAt: "2026-08-02T00:02:00.000Z",
          values: { ...programAssignment.values, status: "inactive" },
        },
      ]);
      applyRecordMerge([
        {
          ...ownerAssignment,
          deletedAt: "2026-08-02T00:03:00.000Z",
          updatedAt: "2026-08-02T00:03:00.000Z",
        },
      ]);
      applyRecordMerge([record("record:unrelated", "Unrelated")]);

      expect(invalidations).toBe(3);
    } finally {
      stop();
    }
  });

  it.each([401, 403])(
    "invalidates a rejected protected write with status %s without replay",
    async (status) => {
      const reasons: string[] = [];
      let attempts = 0;
      const stop = listenForProgramAuthorityInvalidation((reason) => reasons.push(reason));

      try {
        await expect(
          submitOperation("task", "create", { input: { title: "Denied" } }, async () => {
            attempts += 1;
            return Response.json({ error: "Current authority changed." }, { status });
          }),
        ).rejects.toThrow("Current authority changed.");

        expect(attempts).toBe(1);
        expect(reasons).toEqual(["protected-rejection"]);
      } finally {
        stop();
      }
    },
  );

  it("preserves selector identities when refreshing unchanged data from IndexedDB", async () => {
    const notifications: unknown[] = [];

    await bootstrapClient(
      jsonFetcher("/api/formless/program/bootstrap", {
        schema: appSchema,
        schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
        records: [record("record-1", "First")],
        cursor: 1,
      } satisfies BootstrapResponse),
    );
    const before = getClientStoreSnapshot();
    const unsubscribeSchema = subscribeToClientStoreSelector(
      (snapshot) => snapshot.schema,
      (value) => notifications.push(value),
    );
    const unsubscribeRecord = subscribeToClientStoreSelector(
      (snapshot) => snapshot.recordsById["record-1"],
      (value) => notifications.push(value),
    );
    const unsubscribeIds = subscribeToClientStoreSelector(
      (snapshot) => snapshot.recordIdsByEntity.task,
      (value) => notifications.push(value),
    );

    try {
      await refreshClientStoreFromDb();

      const after = getClientStoreSnapshot();

      expect(notifications).toEqual([]);
      expect(after.schema).toBe(before.schema);
      expect(after.recordsById["record-1"]).toBe(before.recordsById["record-1"]);
      expect(after.recordIdsByEntity.task).toBe(before.recordIdsByEntity.task);
    } finally {
      unsubscribeSchema();
      unsubscribeRecord();
      unsubscribeIds();
    }
  });
});

function fakeSocketFactory() {
  const instances: FakeSyncSocket[] = [];

  return {
    instances,
    create: (url: string) => {
      const socket = new FakeSyncSocket(url);

      instances.push(socket);

      return socket;
    },
  };
}

class FakeSyncSocket {
  readonly url: string;
  readyState = 0;
  sentMessages: string[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(url: string) {
    this.url = url;
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close(code = 1000) {
    if (this.readyState === 3) {
      return;
    }

    this.readyState = 3;
    this.onclose?.({ code } as CloseEvent);
  }

  open() {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }

  receive(message: SyncSocketServerMessage) {
    this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent);
  }

  closeFromServer(code = 1000) {
    this.close(code);
  }
}

function parseSocketClientMessage(data: string | undefined): SyncSocketClientMessage {
  if (!data) {
    throw new Error("Expected a socket client message.");
  }
  return JSON.parse(data) as SyncSocketClientMessage;
}
type AutoSaveInput = Parameters<LocalWorkspaceAutoSaveClient["enqueue"]>[0];
function captureAutoSave(): LocalWorkspaceAutoSaveClient & {
  inputs: AutoSaveInput[];
} {
  const inputs: AutoSaveInput[] = [];
  return {
    inputs,
    enqueue: async (input) => {
      inputs.push(input);
    },
  };
}

function jsonFetcher(expectedPath: string, body: unknown): typeof fetch {
  return async (input) => {
    expect(input).toBe(expectedPath);

    return Response.json(body);
  };
}

function createUnsafeLegacyReplica(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("meta");
      db.createObjectStore("records");
    };

    request.onerror = () => reject(request.error ?? new Error(`Could not create ${name}.`));
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(["meta", "records"], "readwrite");
      const meta = transaction.objectStore("meta");
      const records = transaction.objectStore("records");
      const legacyRecord = record("record-1", "Stale cache");

      meta.put(appSchema, "schema");
      meta.put("2026-04-28T00:00:00.000Z", "schemaUpdatedAt");
      meta.put(9, "cursor");
      records.put(legacyRecord, legacyRecord.id);
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onabort = () =>
        reject(transaction.error ?? new Error(`Could not write ${name}.`));
      transaction.onerror = () =>
        reject(transaction.error ?? new Error(`Could not write ${name}.`));
    };
  });
}

function parseOperationRequestBody(body: BodyInit | null | undefined) {
  if (typeof body !== "string") {
    throw new Error("Expected a string request body.");
  }

  const parsed = JSON.parse(body) as unknown;

  expect(parsed).toEqual(
    expect.objectContaining({
      idempotencyKey: expect.any(String),
      source: expect.objectContaining({ protocol: "generated-ui" }),
    }),
  );

  return parsed as {
    idempotencyKey: string;
    input?: unknown;
    recordId?: string;
    source?: {
      protocol?: string;
    };
  };
}
function operationResponse(
  output: OperationInvocationResponse["output"],
  status: OperationInvocationResponse["status"] = "committed",
): OperationInvocationResponse {
  return {
    invocation: {} as OperationInvocationResponse["invocation"],
    output,
    status,
  };
}

function parsePlainRequestBody(body: BodyInit | null | undefined) {
  if (typeof body !== "string") {
    throw new Error("Expected a string request body.");
  }
  return JSON.parse(body) as unknown;
}
function schemaWithSummary() {
  const fields = [
    ...appSchema.entities.find((definition) => definition.key === "task")!.fields,
    { type: "text", required: false, key: "notes" },
  ] satisfies AppSchema["entities"][number]["fields"];
  return parseAppSchema({
    version: 1,
    entities: [
      {
        id: "entity_4e6fedfc-6dba-4114-9d1b-6f0527f3cabb",
        key: "task",
        label: "Planner task",
        fields,
        operations: taskOperations("Planner task", fields),
      },
    ],
    queries: appSchema.queries,
    itemViews: appSchema.itemViews,
    tableViews: appSchema.tableViews,
    views: appSchema.views,
    screens: appSchema.screens,
  });
}
function taskOperations(
  label: string,
  fields: AppSchema["entities"][number]["fields"],
): NonNullable<AppSchema["entities"][number]["operations"]> {
  const input = {
    fields: fields.map(({ key }) => ({ key, field: key })),
  };
  const clearCompletedTasks = appSchema.entities
    .find((definition) => definition.key === "task")!
    .operations!.find((definition) => definition.key === "clearCompletedTasks")!;
  return [
    {
      label: `Create ${label}`,
      kind: "create",
      scope: "collection",
      input,
      effect: { type: "createRecord" },
      output: { type: "create" },
      idempotency: { required: true },
      audit: { input: "summary" },
      key: "create",
    },
    {
      label: `Update ${label}`,
      kind: "update",
      scope: "record",
      input,
      effect: { type: "patchRecord" },
      output: { type: "update" },
      idempotency: { required: true },
      audit: { input: "summary" },
      key: "update",
    },
    ...(clearCompletedTasks === undefined ? [] : [clearCompletedTasks]),
  ];
}
function storageSnapshot(overrides: Partial<StorageSnapshot> = {}): StorageSnapshot {
  return {
    kind: STORAGE_SNAPSHOT_KIND,
    version: STORAGE_SNAPSHOT_VERSION,
    storageIdentity: "tasks",
    schemaKey: "tasks",
    exportedAt: "2026-04-28T00:01:00.000Z",
    schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
    sourceCursor: 1,
    schema: appSchema,
    records: [],
    ...overrides,
  };
}

function record(id: string, title: string, done = false): StoredRecord {
  const timestamp = `2026-04-28T00:00:0${id.at(-1)}.000Z`;

  return {
    id,
    entity: "task",
    values: { title, done },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function authorityRecord(id: string, entity: string, values: StoredRecord["values"]): StoredRecord {
  return {
    createdAt: "2026-08-02T00:00:00.000Z",
    entity,
    id,
    updatedAt: "2026-08-02T00:00:00.000Z",
    values,
  };
}

function rateRecord(id: string, resourceId: string, cardId: string): StoredRecord {
  const timestamp = `2026-04-28T00:00:0${id.at(-1)}.000Z`;

  return {
    id,
    entity: "rate",
    values: {
      resource: resourceId,
      card: cardId,
      cost: 0,
      costUnit: "day",
      price: 0,
      priceSet: true,
      currency: "usd",
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function writeLogChange(
  seq: number,
  recordId: string,
  title: string,
  done = false,
  operationKind: "create" | "update" = "create",
): ChangeRow {
  return {
    seq,
    writeId: `write-${seq}`,
    operationKind,
    entity: "task",
    recordId,
    payload: record(recordId, title, done),
    createdAt: `2026-04-28T00:00:0${seq}.000Z`,
  };
}

function materializedRecordChange(
  seq: number,
  writeIdentity: string,
  payload: StoredRecord,
  operationKind: ChangeRow["operationKind"],
): ChangeRow {
  return {
    seq,
    writeId: writeIdentity,
    operationKind,
    entity: payload.entity,
    recordId: payload.id,
    payload,
    createdAt: `2026-04-28T00:00:0${seq}.000Z`,
  };
}

function commandMaterializationChange(
  seq: number,
  payload: StoredRecord,
  writeIdentity: string,
): ChangeRow {
  return {
    seq,
    writeId: writeIdentity,
    operationKind: "command",
    entity: payload.entity,
    recordId: payload.id,
    payload,
    createdAt: `2026-04-28T00:00:0${seq}.000Z`,
  };
}

async function waitFor(predicate: () => boolean) {
  const startedAt = Date.now();

  while (!predicate()) {
    if (Date.now() - startedAt > 1000) {
      throw new Error("Timed out waiting for condition.");
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
