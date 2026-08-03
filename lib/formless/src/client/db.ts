import { parseAppSchema, type AppSchema } from "@dpeek/formless-schema";
import type { StoredRecord } from "@dpeek/formless-storage";
import type {
  BootstrapResponse,
  BrowserReplicaSchemaProvenance,
  ChangeRow,
} from "../shared/protocol.ts";
import { nowIsoString } from "../shared/clock.ts";
import { FORMLESS_PROGRAM_STORAGE_IDENTITY } from "../program/target.ts";

const DB_VERSION = 2;

const META_STORE = "meta";
const RECORDS_STORE = "records";

const SCHEMA_KEY = "schema";
const SCHEMA_PROVENANCE_KEY = "schemaProvenance";
const SCHEMA_UPDATED_AT_KEY = "schemaUpdatedAt";
const CURSOR_KEY = "cursor";
const LAST_SYNCED_AT_KEY = "lastSyncedAt";
const REPLICA_VERSION_KEY = "replicaVersion";
const PRINCIPAL_ID_KEY = "principalId";
export const FORMLESS_PROGRAM_REPLICA_DATABASE_NAME = "formless:instance:control-plane";

type FormlessProgramStorageIdentity = typeof FORMLESS_PROGRAM_STORAGE_IDENTITY;

export type LocalSnapshot = {
  principalId: string | null;
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

export class FormlessProgramReplicaPrincipalBindingError extends Error {
  constructor() {
    super("Local Program browser replica principal binding changed.");
    this.name = "FormlessProgramReplicaPrincipalBindingError";
  }
}

let replicaBoundaryQueue: Promise<void> = Promise.resolve();

export async function readLocalSnapshot(): Promise<LocalSnapshot> {
  const db = await openClientDb();

  try {
    const transaction = db.transaction([META_STORE, RECORDS_STORE], "readonly");
    const meta = transaction.objectStore(META_STORE);
    const records = transaction.objectStore(RECORDS_STORE);

    const [
      principalId,
      storedSchema,
      schemaProvenance,
      schemaUpdatedAt,
      cursor,
      lastSyncedAt,
      storedRecords,
    ] = await Promise.all([
      requestToPromise<string | undefined>(meta.get(PRINCIPAL_ID_KEY)),
      requestToPromise<unknown>(meta.get(SCHEMA_KEY)),
      requestToPromise<BrowserReplicaSchemaProvenance | undefined>(meta.get(SCHEMA_PROVENANCE_KEY)),
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
      principalId: principalId ?? null,
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
    principalId: null,
    schema: null,
    schemaProvenance: null,
    schemaUpdatedAt: null,
    records: [],
    cursor: 0,
    lastSyncedAt: null,
  };
}

export async function saveBootstrapResponse(
  response: BootstrapResponse,
  options: { principalId?: string } = {},
) {
  const db = await openClientDb();

  try {
    const transaction = db.transaction([META_STORE, RECORDS_STORE], "readwrite");
    const meta = transaction.objectStore(META_STORE);
    const records = transaction.objectStore(RECORDS_STORE);

    if (options.principalId !== undefined) {
      const principalId = await requestToPromise<string | undefined>(meta.get(PRINCIPAL_ID_KEY));

      if (principalId !== options.principalId) {
        await transactionDone(transaction);
        throw new FormlessProgramReplicaPrincipalBindingError();
      }
    }

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
  options: { principalId?: string } = {},
) {
  const db = await openClientDb();

  try {
    const transaction = db.transaction(META_STORE, "readwrite");
    const meta = transaction.objectStore(META_STORE);

    if (options.principalId !== undefined) {
      const principalId = await requestToPromise<string | undefined>(meta.get(PRINCIPAL_ID_KEY));

      if (principalId !== options.principalId) {
        await transactionDone(transaction);
        throw new FormlessProgramReplicaPrincipalBindingError();
      }
    }

    meta.put(schema, SCHEMA_KEY);
    putOrDeleteMeta(meta, schemaProvenance, SCHEMA_PROVENANCE_KEY);
    meta.put(updatedAt, SCHEMA_UPDATED_AT_KEY);
    meta.put(nowIsoString(), LAST_SYNCED_AT_KEY);

    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function mergeChanges(
  changes: ChangeRow[],
  cursor: number,
  options: { principalId?: string } = {},
) {
  await mergeRecords(
    changes.map((change) => change.payload),
    cursor,
    options,
  );
}

export async function mergeRecords(
  recordsToMerge: StoredRecord[],
  cursor?: number,
  options: { principalId?: string } = {},
) {
  const db = await openClientDb();

  try {
    const transaction = db.transaction([META_STORE, RECORDS_STORE], "readwrite");
    const meta = transaction.objectStore(META_STORE);
    const records = transaction.objectStore(RECORDS_STORE);

    if (options.principalId !== undefined) {
      const principalId = await requestToPromise<string | undefined>(meta.get(PRINCIPAL_ID_KEY));

      if (principalId !== options.principalId) {
        await transactionDone(transaction);
        throw new FormlessProgramReplicaPrincipalBindingError();
      }
    }

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

export function deleteClientDb(
  storageIdentity: FormlessProgramStorageIdentity = FORMLESS_PROGRAM_STORAGE_IDENTITY,
) {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(clientDbName(storageIdentity));

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Could not delete IndexedDB."));
    request.onblocked = () => reject(new Error("IndexedDB delete was blocked."));
  });
}

export async function deleteProgramReplicaDatabase(
  storageIdentity: FormlessProgramStorageIdentity = FORMLESS_PROGRAM_STORAGE_IDENTITY,
): Promise<void> {
  const result = await deleteIndexedDbDatabase(clientDbName(storageIdentity));

  if (result === "blocked") {
    throw new FormlessProgramReplicaDeleteBlockedError();
  }
}

export function clearProgramReplicaPrincipalBoundary(
  storageIdentity: FormlessProgramStorageIdentity,
): Promise<void> {
  return queueReplicaBoundary(async () => {
    await deleteProgramReplicaDatabase(storageIdentity);
  });
}

export function prepareProgramReplicaPrincipalBoundary(
  principalId: string,
  storageIdentity: FormlessProgramStorageIdentity,
): Promise<"reset" | "reused"> {
  return queueReplicaBoundary(async () => {
    const currentPrincipalId = await readProgramReplicaPrincipalId(storageIdentity);

    if (currentPrincipalId === principalId) {
      return "reused" as const;
    }

    await deleteProgramReplicaDatabase(storageIdentity);
    await writeProgramReplicaPrincipalId(principalId, storageIdentity);
    return "reset" as const;
  });
}

export function clientDbName(
  storageIdentity: FormlessProgramStorageIdentity = FORMLESS_PROGRAM_STORAGE_IDENTITY,
) {
  return `formless:${storageIdentity}`;
}

async function openClientDb(
  storageIdentity: FormlessProgramStorageIdentity = FORMLESS_PROGRAM_STORAGE_IDENTITY,
) {
  try {
    return await openClientDbOnce(storageIdentity);
  } catch {
    await deleteClientDb(storageIdentity);
    return openClientDbOnce(storageIdentity);
  }
}

function openClientDbOnce(storageIdentity: FormlessProgramStorageIdentity) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(clientDbName(storageIdentity), DB_VERSION);

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

async function readProgramReplicaPrincipalId(
  storageIdentity: FormlessProgramStorageIdentity,
): Promise<string | undefined> {
  const db = await openClientDb(storageIdentity);

  try {
    const transaction = db.transaction(META_STORE, "readonly");
    const principalId = await requestToPromise<string | undefined>(
      transaction.objectStore(META_STORE).get(PRINCIPAL_ID_KEY),
    );
    await transactionDone(transaction);
    return principalId;
  } finally {
    db.close();
  }
}

async function writeProgramReplicaPrincipalId(
  principalId: string,
  storageIdentity: FormlessProgramStorageIdentity,
): Promise<void> {
  const db = await openClientDb(storageIdentity);

  try {
    const transaction = db.transaction(META_STORE, "readwrite");
    transaction.objectStore(META_STORE).put(principalId, PRINCIPAL_ID_KEY);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

function queueReplicaBoundary<T>(operation: () => Promise<T>): Promise<T> {
  const result = replicaBoundaryQueue.then(operation, operation);
  replicaBoundaryQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
