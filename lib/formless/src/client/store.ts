import { useMemo, useSyncExternalStore } from "react";
import { listenForClientEvents } from "./broadcast.ts";
import { readLocalSnapshot, type LocalSnapshot } from "./db.ts";
import {
  createAggregateValueMatchingQuerySelector,
  createEntityRecordCountMatchingQuerySelector,
  createEntityRecordCountReferencingFieldSelector,
  createEntityRecordIdsMatchingQuerySelector,
  createEntityRecordOptionsMatchingQuerySelector,
  createRecordReadinessWarningsSelector,
  createReferenceOptionsSelector,
  queryEvaluationContextCacheKey,
  type ReferenceOption,
} from "./projections.ts";
import { nowIsoString } from "../shared/clock.ts";
import type { FieldValue, StoredRecord } from "@dpeek/formless-storage";
import type { BootstrapResponse, ChangeRow } from "../shared/protocol.ts";
import type { QueryEvaluationContext, QueryExpression } from "@dpeek/formless-schema";
import { resolveRecordFieldValue, type FieldRef } from "@dpeek/formless-schema";
import type { AggregateSchema, AppSchema, ComputedValueSchema } from "@dpeek/formless-schema";

export type NormalizedClientState = {
  hydrated: boolean;
  schema: AppSchema | null;
  schemaUpdatedAt: string | null;
  recordsById: Record<string, StoredRecord>;
  recordIdsByEntity: Record<string, string[]>;
  cursor: number;
  lastSyncedAt: string | null;
};

export type { ReferenceOption };

type StoreListener = () => void;

const listeners = new Set<StoreListener>();

let state: NormalizedClientState = emptyClientState();
const EMPTY_ENTITY_RECORD_IDS: string[] = [];

export function getClientStoreSnapshot(): NormalizedClientState {
  return state;
}

export function subscribeToClientStore(listener: StoreListener) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function subscribeToClientStoreSelector<T>(
  selector: (snapshot: NormalizedClientState) => T,
  listener: (selectedValue: T) => void,
) {
  let selectedValue = selector(state);

  return subscribeToClientStore(() => {
    const nextSelectedValue = selector(state);

    if (Object.is(selectedValue, nextSelectedValue)) {
      return;
    }

    selectedValue = nextSelectedValue;
    listener(nextSelectedValue);
  });
}

export function resetClientStore() {
  setState(emptyClientState());
}

export async function hydrateClientStore() {
  applyLocalSnapshot(await readLocalSnapshot());
}

export async function refreshClientStoreFromDb() {
  applyLocalSnapshot(await readLocalSnapshot());
}

export function applyBootstrapResponse(response: BootstrapResponse) {
  setState({
    hydrated: true,
    schema: response.schema,
    schemaUpdatedAt: response.schemaUpdatedAt,
    recordsById: recordsById(sortRecords(response.records)),
    recordIdsByEntity: recordIdsByEntity(sortRecords(response.records)),
    cursor: response.cursor,
    lastSyncedAt: nowIsoString(),
  });
}

export function applySchemaSave(schema: AppSchema, schemaUpdatedAt: string) {
  updateState((current) => ({
    ...current,
    schema,
    schemaUpdatedAt,
    lastSyncedAt: nowIsoString(),
  }));
}

export function applyChanges(changes: ChangeRow[], cursor: number) {
  applyRecordMerge(
    changes.map((change) => change.payload),
    cursor,
  );
}

export function applyRecordMerge(recordsToMerge: StoredRecord[], cursor?: number) {
  updateState((current) => {
    let recordsByIdChanged = false;
    const nextRecordsById = { ...current.recordsById };

    for (const record of recordsToMerge) {
      const existing = current.recordsById[record.id];

      if (!storedRecordsEqual(existing, record)) {
        recordsByIdChanged = true;
        nextRecordsById[record.id] = record;
      }
    }

    const recordIdsByEntity = recordsByIdChanged
      ? reconcileRecordIdsByEntity(
          current.recordIdsByEntity,
          sortRecords(Object.values(nextRecordsById)),
        )
      : current.recordIdsByEntity;
    const cursorChanged = cursor !== undefined && cursor !== current.cursor;
    const hasLastSyncedAtUpdate = recordsToMerge.length > 0 || cursor !== undefined;

    if (!recordsByIdChanged && !cursorChanged && !hasLastSyncedAtUpdate) {
      return current;
    }

    return {
      ...current,
      recordsById: recordsByIdChanged ? nextRecordsById : current.recordsById,
      recordIdsByEntity,
      cursor: cursor ?? current.cursor,
      lastSyncedAt: hasLastSyncedAtUpdate ? nowIsoString() : current.lastSyncedAt,
    };
  });
}

export function useHydrated() {
  return useClientStoreSelector((snapshot) => snapshot.hydrated);
}

export function useSchema() {
  return useClientStoreSelector((snapshot) => snapshot.schema);
}

export function useEntityRecordIds(entityName: string) {
  return useClientStoreSelector((snapshot) => {
    return snapshot.recordIdsByEntity[entityName] ?? EMPTY_ENTITY_RECORD_IDS;
  });
}

export function useReferenceOptions(entityName: string, displayField?: string) {
  const selector = useMemo(
    () => createReferenceOptionsSelector(entityName, displayField),
    [entityName, displayField],
  );

  return useClientStoreSelector(selector);
}

export function useEntityRecordIdsMatchingQuery(
  entityName: string,
  query: QueryExpression,
  context?: QueryEvaluationContext,
) {
  const contextKey = queryEvaluationContextCacheKey(context);
  const selector = useMemo(
    () => createEntityRecordIdsMatchingQuerySelector(entityName, query, context),
    [entityName, query, contextKey],
  );

  return useClientStoreSelector(selector);
}

export function useEntityRecordOptionsMatchingQuery(
  entityName: string,
  query: QueryExpression,
  labelField: string,
  context?: QueryEvaluationContext,
) {
  const contextKey = queryEvaluationContextCacheKey(context);
  const selector = useMemo(
    () => createEntityRecordOptionsMatchingQuerySelector(entityName, query, labelField, context),
    [entityName, query, labelField, contextKey],
  );

  return useClientStoreSelector(selector);
}

export function useEntityRecordCountMatchingQuery(
  entityName: string,
  query: QueryExpression,
  context?: QueryEvaluationContext,
) {
  const contextKey = queryEvaluationContextCacheKey(context);
  const selector = useMemo(
    () => createEntityRecordCountMatchingQuerySelector(entityName, query, context),
    [entityName, query, contextKey],
  );

  return useClientStoreSelector(selector);
}

export function useAggregateValueMatchingQuery(
  entityName: string,
  query: QueryExpression,
  aggregate: AggregateSchema,
  computedValues: Record<string, ComputedValueSchema>,
  context?: QueryEvaluationContext,
) {
  const contextKey = queryEvaluationContextCacheKey(context);
  const selector = useMemo(
    () =>
      createAggregateValueMatchingQuerySelector(
        entityName,
        query,
        aggregate,
        computedValues,
        context,
      ),
    [entityName, query, aggregate, computedValues, contextKey],
  );

  return useClientStoreSelector(selector);
}

export function useEntityRecordCountReferencingField(
  entityName: string,
  fieldName: string,
  referencedRecordId: string,
) {
  const selector = useMemo(
    () =>
      createEntityRecordCountReferencingFieldSelector(entityName, fieldName, referencedRecordId),
    [entityName, fieldName, referencedRecordId],
  );

  return useClientStoreSelector(selector);
}

export function useRecord(recordId: string) {
  return useClientStoreSelector((snapshot) => snapshot.recordsById[recordId]);
}

export function useRecordsById() {
  return useClientStoreSelector((snapshot) => snapshot.recordsById);
}

export function useRecordCreatedAt(recordId: string) {
  return useClientStoreSelector((snapshot) => snapshot.recordsById[recordId]?.createdAt);
}

export function useRecordUpdatedAt(recordId: string) {
  return useClientStoreSelector((snapshot) => snapshot.recordsById[recordId]?.updatedAt);
}

export function useRecordField(recordId: string, fieldName: string) {
  return useClientStoreSelector((snapshot) => {
    return snapshot.recordsById[recordId]?.values[fieldName];
  });
}

export function useRecordFieldValue(recordId: string, fieldRef: FieldRef) {
  return useClientStoreSelector((snapshot) => {
    const record = snapshot.recordsById[recordId];

    return record === undefined ? undefined : resolveRecordFieldValue(record, fieldRef);
  });
}

export function useRecordReadinessWarnings(recordId: string) {
  const selector = useMemo(() => createRecordReadinessWarningsSelector(recordId), [recordId]);

  return useClientStoreSelector(selector);
}

export function useCursor() {
  return useClientStoreSelector((snapshot) => snapshot.cursor);
}

export function useLastSyncedAt() {
  return useClientStoreSelector((snapshot) => snapshot.lastSyncedAt);
}

export function connectBroadcastToClientStore() {
  return listenForClientEvents((event) => {
    if (
      event.type === "records-updated" ||
      event.type === "cursor-updated" ||
      event.type === "schema-updated"
    ) {
      void refreshClientStoreFromDb();
    }
  });
}

function useClientStoreSelector<T>(selector: (snapshot: NormalizedClientState) => T) {
  return useSyncExternalStore(
    (listener) => subscribeToClientStoreSelector(selector, listener),
    () => selector(state),
    () => selector(state),
  );
}

function applyLocalSnapshot(snapshot: LocalSnapshot) {
  updateState((current) => ({
    hydrated: true,
    schema: reuseSchema(current.schema, snapshot.schema),
    schemaUpdatedAt: snapshot.schemaUpdatedAt,
    recordsById: reconcileRecordsById(current.recordsById, snapshot.records),
    recordIdsByEntity: reconcileRecordIdsByEntity(current.recordIdsByEntity, snapshot.records),
    cursor: snapshot.cursor,
    lastSyncedAt: snapshot.lastSyncedAt,
  }));
}

function emptyClientState(): NormalizedClientState {
  return {
    hydrated: false,
    schema: null,
    schemaUpdatedAt: null,
    recordsById: {},
    recordIdsByEntity: {},
    cursor: 0,
    lastSyncedAt: null,
  };
}

function updateState(getNextState: (current: NormalizedClientState) => NormalizedClientState) {
  setState(getNextState(state));
}

function setState(nextState: NormalizedClientState) {
  if (nextState === state || normalizedStatesEqual(state, nextState)) {
    return;
  }

  state = nextState;
  emit();
}

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function recordsById(records: StoredRecord[]) {
  return Object.fromEntries(records.map((record) => [record.id, record]));
}

function reconcileRecordsById(
  existingRecordsById: Record<string, StoredRecord>,
  records: StoredRecord[],
) {
  let changed = Object.keys(existingRecordsById).length !== records.length;
  const nextRecordsById: Record<string, StoredRecord> = {};

  for (const record of records) {
    const existing = existingRecordsById[record.id];
    const nextRecord = storedRecordsEqual(existing, record) ? existing : record;

    nextRecordsById[record.id] = nextRecord;

    if (nextRecord !== existing) {
      changed = true;
    }
  }

  return changed ? nextRecordsById : existingRecordsById;
}

function recordIdsByEntity(records: StoredRecord[]) {
  const idsByEntity: Record<string, string[]> = {};

  for (const record of records) {
    if (record.deletedAt) {
      continue;
    }

    idsByEntity[record.entity] = [...(idsByEntity[record.entity] ?? []), record.id];
  }

  return idsByEntity;
}

function reconcileRecordIdsByEntity(
  existingIdsByEntity: Record<string, string[]>,
  records: StoredRecord[],
) {
  const nextIdsByEntity = recordIdsByEntity(records);
  let changed = !sameKeys(existingIdsByEntity, nextIdsByEntity);
  const reconciledIdsByEntity: Record<string, string[]> = {};

  for (const [entityName, nextIds] of Object.entries(nextIdsByEntity)) {
    const existingIds = existingIdsByEntity[entityName];
    const reconciledIds = arraysEqual(existingIds, nextIds) ? existingIds : nextIds;

    reconciledIdsByEntity[entityName] = reconciledIds;

    if (reconciledIds !== existingIds) {
      changed = true;
    }
  }

  return changed ? reconciledIdsByEntity : existingIdsByEntity;
}

function normalizedStatesEqual(left: NormalizedClientState, right: NormalizedClientState) {
  return (
    left.hydrated === right.hydrated &&
    left.schema === right.schema &&
    left.schemaUpdatedAt === right.schemaUpdatedAt &&
    left.recordsById === right.recordsById &&
    left.recordIdsByEntity === right.recordIdsByEntity &&
    left.cursor === right.cursor &&
    left.lastSyncedAt === right.lastSyncedAt
  );
}

function reuseSchema(existingSchema: AppSchema | null, nextSchema: AppSchema | null) {
  if (existingSchema === nextSchema) {
    return existingSchema;
  }

  if (!existingSchema || !nextSchema) {
    return nextSchema;
  }

  return JSON.stringify(existingSchema) === JSON.stringify(nextSchema)
    ? existingSchema
    : nextSchema;
}

function sameKeys(left: Record<string, unknown>, right: Record<string, unknown>) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  return leftKeys.length === rightKeys.length && leftKeys.every((key) => key in right);
}

function arraysEqual<T>(left: T[] | undefined, right: T[]) {
  return (
    left !== undefined &&
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function storedRecordsEqual(left: StoredRecord | undefined, right: StoredRecord) {
  if (!left) {
    return false;
  }

  return (
    left.id === right.id &&
    left.entity === right.entity &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt &&
    left.deletedAt === right.deletedAt &&
    recordValuesEqual(left.values, right.values)
  );
}

function recordValuesEqual(left: Record<string, FieldValue>, right: Record<string, FieldValue>) {
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);

  if (leftEntries.length !== rightEntries.length) {
    return false;
  }

  return leftEntries.every(([key, value]) => right[key] === value);
}

function sortRecords(records: StoredRecord[]) {
  return records.toSorted((left, right) => left.createdAt.localeCompare(right.createdAt));
}
