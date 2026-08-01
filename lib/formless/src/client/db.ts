import { parseAppSchema, type AppSchema } from "@dpeek/formless-schema";
import type { StoredRecord } from "@dpeek/formless-storage";
import type {
  BootstrapResponse,
  BrowserReplicaSchemaProvenance,
  ChangeRow,
} from "../shared/protocol.ts";
import { nowIsoString } from "../shared/clock.ts";

const DB_VERSION = 2;

const META_STORE = "meta";
const RECORDS_STORE = "records";

const SCHEMA_KEY = "schema";
const SCHEMA_PROVENANCE_KEY = "schemaProvenance";
const SCHEMA_UPDATED_AT_KEY = "schemaUpdatedAt";
const CURSOR_KEY = "cursor";
const LAST_SYNCED_AT_KEY = "lastSyncedAt";
const REPLICA_VERSION_KEY = "replicaVersion";
export const FORMLESS_PROGRAM_REPLICA_DATABASE_NAME = "formless:instance:control-plane";

export type LocalSnapshot = {
  schema: AppSchema | null;
  schemaProvenance: BrowserReplicaSchemaProvenance | null;
  schemaUpdatedAt: string | null;
  records: StoredRecord[];
  cursor: number;
  lastSyncedAt: string | null;
};

export class FormlessProgramReplicaDeleteBlockedError extends Error {
  constructor() {
    super(
      "Local Program browser replica reset was blocked. Close other tabs using this local runtime and try again.",
    );
    this.name = "FormlessProgramReplicaDeleteBlockedError";
  }
}

export async function readLocalSnapshot(): Promise<LocalSnapshot> {
  const db = await openClientDb();

  try {
    const transaction = db.transaction([META_STORE, RECORDS_STORE], "readonly");
    const meta = transaction.objectStore(META_STORE);
    const records = transaction.objectStore(RECORDS_STORE);

    const [storedSchema, schemaProvenance, schemaUpdatedAt, cursor, lastSyncedAt, storedRecords] =
      await Promise.all([
        requestToPromise<unknown>(meta.get(SCHEMA_KEY)),
        requestToPromise<BrowserReplicaSchemaProvenance | undefined>(
          meta.get(SCHEMA_PROVENANCE_KEY),
        ),
        requestToPromise<string | undefined>(meta.get(SCHEMA_UPDATED_AT_KEY)),
        requestToPromise<number | undefined>(meta.get(CURSOR_KEY)),
        requestToPromise<string | undefined>(meta.get(LAST_SYNCED_AT_KEY)),
        requestToPromise<StoredRecord[]>(records.getAll()),
        transactionDone(transaction),
      ]);

    let schema: AppSchema | null = null;
    if (storedSchema !== undefined) {
      try {
        schema = parseAppSchema(storedSchema);
      } catch {
        db.close();
        await deleteClientDb();
        return emptyLocalSnapshot();
      }
    }

    return {
      schema,
      schemaProvenance: schemaProvenance ?? null,
      schemaUpdatedAt: schemaUpdatedAt ?? null,
      records: sortRecords(storedRecords),
      cursor: cursor ?? 0,
      lastSyncedAt: lastSyncedAt ?? null,
    };
  } finally {
    db.close();
  }
}

function emptyLocalSnapshot(): LocalSnapshot {
  return {
    schema: null,
    schemaProvenance: null,
    schemaUpdatedAt: null,
    records: [],
    cursor: 0,
    lastSyncedAt: null,
  };
}

export async function saveBootstrapResponse(response: BootstrapResponse) {
  const db = await openClientDb();

  try {
    const transaction = db.transaction([META_STORE, RECORDS_STORE], "readwrite");
    const meta = transaction.objectStore(META_STORE);
    const records = transaction.objectStore(RECORDS_STORE);

    records.clear();
    for (const record of response.records) {
      records.put(record);
    }

    meta.put(response.schema, SCHEMA_KEY);
    putOrDeleteMeta(meta, response.schemaProvenance, SCHEMA_PROVENANCE_KEY);
    meta.put(response.schemaUpdatedAt, SCHEMA_UPDATED_AT_KEY);
    meta.put(response.cursor, CURSOR_KEY);
    meta.put(nowIsoString(), LAST_SYNCED_AT_KEY);

    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function saveSchema(
  schema: AppSchema,
  updatedAt: string,
  schemaProvenance?: BrowserReplicaSchemaProvenance,
) {
  const db = await openClientDb();

  try {
    const transaction = db.transaction(META_STORE, "readwrite");
    const meta = transaction.objectStore(META_STORE);

    meta.put(schema, SCHEMA_KEY);
    putOrDeleteMeta(meta, schemaProvenance, SCHEMA_PROVENANCE_KEY);
    meta.put(updatedAt, SCHEMA_UPDATED_AT_KEY);
    meta.put(nowIsoString(), LAST_SYNCED_AT_KEY);

    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function mergeChanges(changes: ChangeRow[], cursor: number) {
  await mergeRecords(
    changes.map((change) => change.payload),
    cursor,
  );
}

export async function mergeRecords(recordsToMerge: StoredRecord[], cursor?: number) {
  const db = await openClientDb();

  try {
    const transaction = db.transaction([META_STORE, RECORDS_STORE], "readwrite");
    const meta = transaction.objectStore(META_STORE);
    const records = transaction.objectStore(RECORDS_STORE);

    for (const record of recordsToMerge) {
      records.put(record);
    }

    if (cursor !== undefined) {
      meta.put(cursor, CURSOR_KEY);
    }
    meta.put(nowIsoString(), LAST_SYNCED_AT_KEY);

    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function readSchemaProvenance(): Promise<BrowserReplicaSchemaProvenance | null> {
  const db = await openClientDb();

  try {
    const transaction = db.transaction(META_STORE, "readonly");
    const schemaProvenance = await requestToPromise<BrowserReplicaSchemaProvenance | undefined>(
      transaction.objectStore(META_STORE).get(SCHEMA_PROVENANCE_KEY),
    );
    await transactionDone(transaction);

    return schemaProvenance ?? null;
  } finally {
    db.close();
  }
}

export async function readSchemaUpdatedAt() {
  const db = await openClientDb();

  try {
    const transaction = db.transaction(META_STORE, "readonly");
    const schemaUpdatedAt = await requestToPromise<string | undefined>(
      transaction.objectStore(META_STORE).get(SCHEMA_UPDATED_AT_KEY),
    );
    await transactionDone(transaction);

    return schemaUpdatedAt ?? null;
  } finally {
    db.close();
  }
}

export async function readCursor() {
  const db = await openClientDb();

  try {
    const transaction = db.transaction(META_STORE, "readonly");
    const cursor = await requestToPromise<number | undefined>(
      transaction.objectStore(META_STORE).get(CURSOR_KEY),
    );
    await transactionDone(transaction);

    return cursor ?? 0;
  } finally {
    db.close();
  }
}

export function deleteClientDb() {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(clientDbName());

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Could not delete IndexedDB."));
    request.onblocked = () => reject(new Error("IndexedDB delete was blocked."));
  });
}

export async function deleteProgramReplicaDatabase(): Promise<void> {
  const result = await deleteIndexedDbDatabase(FORMLESS_PROGRAM_REPLICA_DATABASE_NAME);

  if (result === "blocked") {
    throw new FormlessProgramReplicaDeleteBlockedError();
  }
}

export function clientDbName() {
  return FORMLESS_PROGRAM_REPLICA_DATABASE_NAME;
}

async function openClientDb() {
  try {
    return await openClientDbOnce();
  } catch {
    await deleteClientDb();
    return openClientDbOnce();
  }
}

function openClientDbOnce() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(clientDbName(), DB_VERSION);

    request.onupgradeneeded = () => {
      try {
        migrateClientDb(request.result, request.transaction);
      } catch {
        request.transaction?.abort();
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open IndexedDB."));
  });
}

function migrateClientDb(db: IDBDatabase, transaction: IDBTransaction | null) {
  if (!transaction) {
    throw new Error("IndexedDB upgrade transaction is unavailable.");
  }

  if (!db.objectStoreNames.contains(META_STORE)) {
    db.createObjectStore(META_STORE);
  }

  if (!db.objectStoreNames.contains(RECORDS_STORE)) {
    db.createObjectStore(RECORDS_STORE, { keyPath: "id" });
  }

  const records = transaction.objectStore(RECORDS_STORE);
  if (records.keyPath !== "id") {
    throw new Error("IndexedDB records store cannot be migrated safely.");
  }

  transaction.objectStore(META_STORE).put(DB_VERSION, REPLICA_VERSION_KEY);
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function putOrDeleteMeta(store: IDBObjectStore, value: unknown, key: string) {
  if (value === undefined) {
    store.delete(key);
    return;
  }

  store.put(value, key);
}

function deleteIndexedDbDatabase(name: string) {
  return new Promise<"blocked" | "deleted">((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);

    request.onsuccess = () => resolve("deleted");
    request.onerror = () => reject(request.error ?? new Error(`Could not delete ${name}.`));
    request.onblocked = () => resolve("blocked");
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
  });
}

function sortRecords(records: StoredRecord[]) {
  return records.toSorted((left, right) => left.createdAt.localeCompare(right.createdAt));
}
