import { expect } from "vite-plus/test";
import {
  STORAGE_SNAPSHOT_KIND,
  STORAGE_SNAPSHOT_VERSION,
  type StorageSnapshot,
  type StoredRecord,
} from "@dpeek/formless-storage";
import type { ChangeRow } from "../shared/protocol.ts";
import type { OperationInvocationResponse } from "../shared/operation-invocation.ts";
import type { createWorkerHarness } from "../worker/miniflare-test.ts";
import { testSiteRecords } from "./site-records.ts";
import { formlessProgramSchema } from "../program/runtime.ts";
import {
  FORMLESS_PROGRAM_SCHEMA_KEY,
  FORMLESS_PROGRAM_STORAGE_IDENTITY,
} from "../program/target.ts";

type AuthorityHarness = Pick<
  Awaited<ReturnType<typeof createWorkerHarness>>,
  "durableObjectFetch" | "fetch"
>;

export type AuthorityWriteHelpers = ReturnType<typeof createAuthorityWriteHelpers>;
export type AuthorityTestRecordOperationResult = {
  changes: ChangeRow[];
  cursor: number;
  record: StoredRecord;
  writeIdentity: string;
};
export type AuthorityTestCommandOperationResult = {
  changes: ChangeRow[];
  cursor: number;
  writeIdentity: string;
};
export type AuthorityTestRecordOperationRequest = {
  entity: string;
  idempotencyKey: string;
  input?: unknown;
  operationName: string;
  recordId?: string;
};
export type AuthorityTestCommandOperationRequest = {
  entity: string;
  idempotencyKey: string;
  input?: unknown;
  operationName: string;
};

export function createAuthorityWriteHelpers(
  harness: AuthorityHarness,
  authHeaders: Record<string, string> = {},
  snapshotRestoreHeaders: Record<string, string> = authHeaders,
) {
  function apiPath(path: string) {
    if (!path.startsWith("/api/")) {
      throw new Error(`Expected API path, received "${path}".`);
    }

    return `/api/formless/program${path.slice("/api".length)}`;
  }

  function fetchAuthority(path: string, init?: Parameters<AuthorityHarness["fetch"]>[1]) {
    if (Object.keys(authHeaders).length > 0) {
      return harness.fetch(apiPath(path), {
        ...init,
        headers: {
          ...(init?.headers as Record<string, string> | undefined),
          ...authHeaders,
        },
      });
    }

    return harness.fetch(apiPath(path), init);
  }

  async function resetProgram() {
    const snapshot = testStorageSnapshot({
      records: testSiteRecords,
      schema: formlessProgramSchema,
      schemaKey: FORMLESS_PROGRAM_SCHEMA_KEY,
      storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
    });

    await restoreTestStorageSnapshot(
      harness,
      apiPath("/api/snapshot/restore"),
      snapshot,
      snapshotRestoreHeaders,
    );
  }

  async function getJson<T>(path: string) {
    const response = await fetchAuthority(path);

    expect(response.status).toBe(200);

    return (await response.json()) as T;
  }

  async function postJson<T>(path: string, body: unknown) {
    const response = await fetchAuthority(path, {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);

    return (await response.json()) as T;
  }

  async function postCreateOperation(idempotencyKey: string, values: Record<string, unknown>) {
    return postCreateOperationForEntity(idempotencyKey, "task", values);
  }

  async function postCreateOperationForEntity(
    idempotencyKey: string,
    entity: string,
    values: Record<string, unknown>,
  ) {
    const response = await fetchAuthority(`/api/operations/${entity}/create`, {
      body: JSON.stringify({
        idempotencyKey,
        input: values,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);

    return recordOperationResultFromOperation(await response.json(), idempotencyKey);
  }

  async function postCommandOperation(idempotencyKey: string, operationName: string) {
    return postCommandOperationForEntity(idempotencyKey, "task", operationName);
  }

  async function postCommandOperationForEntity(
    idempotencyKey: string,
    entity: string,
    operationName: string,
    extra: Record<string, unknown> = {},
  ) {
    const operation = await postJson<OperationInvocationResponse>(
      `/api/operations/${entity}/${operationName}`,
      {
        idempotencyKey,
        ...extra,
      },
    );

    if (operation.output.type !== "command") {
      throw new Error(`Expected command output for operation "${entity}.${operationName}".`);
    }

    return commandOperationResultFromResponse(operation);
  }

  async function postRecordOperationRequest(requestBody: AuthorityTestRecordOperationRequest) {
    const request = recordOperationRequest(requestBody);
    const response = await fetchAuthority(request.path, {
      body: JSON.stringify(request.body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);

    return request.response(await response.json());
  }

  async function expectRecordOperationError(
    requestBody: AuthorityTestRecordOperationRequest,
    message: string,
  ) {
    const request = recordOperationRequest(requestBody);
    const response = await fetchAuthority(request.path, {
      body: JSON.stringify(request.body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as { error: string }).toEqual({
      error: expect.stringContaining(message),
    });
  }

  async function expectCommandOperationError(
    requestBody: AuthorityTestCommandOperationRequest,
    message: string,
  ) {
    const request = commandOperationRequest(requestBody);
    const response = await fetchAuthority(request.path, {
      body: JSON.stringify(request.body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as { error: string }).toEqual({
      error: expect.stringContaining(message),
    });
  }

  async function expectError(path: string, body: unknown, message: string) {
    const response = await fetchAuthority(path, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      method: body === undefined ? "GET" : "POST",
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as { error: string }).toEqual({
      error: expect.stringContaining(message),
    });
  }

  async function expectNotFound(path: string) {
    const response = await harness.fetch(path);

    expect(response.status).toBe(404);
  }

  return {
    apiPath,
    expectCommandOperationError,
    expectError,
    expectRecordOperationError,
    expectNotFound,
    fetch: fetchAuthority,
    getJson,
    postCommandOperation,
    postCommandOperationForEntity,
    postCreateOperation,
    postCreateOperationForEntity,
    postJson,
    postRecordOperationRequest,
    resetProgram,
  };
}

export function testStorageSnapshot(input: {
  records?: StoredRecord[];
  schema: StorageSnapshot["schema"];
  schemaKey: string;
  storageIdentity: string;
}): StorageSnapshot {
  const records = input.records ?? [];

  return {
    kind: STORAGE_SNAPSHOT_KIND,
    version: STORAGE_SNAPSHOT_VERSION,
    storageIdentity: input.storageIdentity,
    schemaKey: input.schemaKey,
    exportedAt: "2026-07-29T00:00:00.000Z",
    schemaUpdatedAt: "2026-07-29T00:00:00.000Z",
    sourceCursor: records.length,
    schema: input.schema,
    records,
  };
}

export function instanceControlPlaneTestStorageSnapshot(
  records: StoredRecord[] = [],
): StorageSnapshot {
  return testStorageSnapshot({
    records,
    schema: formlessProgramSchema,
    schemaKey: FORMLESS_PROGRAM_SCHEMA_KEY,
    storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
  });
}

export async function restoreTestStorageSnapshot(
  harness: AuthorityHarness,
  path: string,
  snapshot: StorageSnapshot,
  headers: Record<string, string> = {},
): Promise<void> {
  const resetResponse = await harness.durableObjectFetch(
    "FORMLESS_AUTHORITY",
    FORMLESS_PROGRAM_STORAGE_IDENTITY,
    "/_internal/reset-program-storage",
    { method: "POST" },
  );

  expect(resetResponse.status).toBe(200);

  const response = await harness.fetch(path, {
    body: JSON.stringify(snapshot),
    headers: { ...headers, "Content-Type": "application/json" },
    method: "POST",
  });

  expect(response.status).toBe(200);
}

export function operationWriteRequest(
  path: string,
  body: unknown,
): {
  body: unknown;
  path: string;
  response: (value: unknown) => unknown;
} {
  return { body, path, response: (value) => value };
}

export function recordOperationRequest(requestBody: AuthorityTestRecordOperationRequest): {
  body: unknown;
  path: string;
  response: (value: unknown) => AuthorityTestRecordOperationResult;
} {
  const idempotencyKey = parseNonEmptyString("idempotencyKey", requestBody.idempotencyKey);
  const entity = parseNonEmptyString("entity", requestBody.entity);
  const operationName = parseNonEmptyString("operationName", requestBody.operationName);

  if (operationName === "create") {
    return {
      body: {
        idempotencyKey,
        input: requestBody.input,
      },
      path: `/api/operations/${entity}/create`,
      response: (value) => recordOperationResultFromOperation(value, idempotencyKey),
    };
  }

  if (operationName === "update") {
    return {
      body: {
        idempotencyKey,
        input: requestBody.input,
        recordId: requestBody.recordId,
      },
      path: `/api/operations/${entity}/update`,
      response: (value) => recordOperationResultFromOperation(value, idempotencyKey),
    };
  }

  if (operationName === "delete") {
    return {
      body: {
        idempotencyKey,
        ...(requestBody.input === undefined ? {} : { input: requestBody.input }),
        recordId: requestBody.recordId,
      },
      path: `/api/operations/${entity}/delete`,
      response: (value) => recordOperationResultFromOperation(value, idempotencyKey),
    };
  }

  throw new Error(`Unsupported record operation "${operationName}".`);
}

export function commandOperationRequest(requestBody: AuthorityTestCommandOperationRequest): {
  body: unknown;
  path: string;
  response: (value: unknown) => AuthorityTestCommandOperationResult;
} {
  const idempotencyKey = parseNonEmptyString("idempotencyKey", requestBody.idempotencyKey);
  const entity = parseNonEmptyString("entity", requestBody.entity);
  const operationName = parseNonEmptyString("operationName", requestBody.operationName);

  return {
    body: {
      idempotencyKey,
      ...(requestBody.input === undefined ? {} : { input: requestBody.input }),
    },
    path: `/api/operations/${entity}/${operationName}`,
    response: commandOperationResultFromOperation,
  };
}

function recordOperationResultFromOperation(
  value: unknown,
  fallbackWriteIdentity: string,
): AuthorityTestRecordOperationResult {
  const operation = value as OperationInvocationResponse;

  if (
    operation.output.type !== "create" &&
    operation.output.type !== "update" &&
    operation.output.type !== "delete"
  ) {
    throw new Error("Expected write operation output.");
  }

  return {
    changes: operation.output.changes,
    cursor: operation.output.cursor,
    record:
      operation.output.type === "delete"
        ? operation.output.changes[0]?.payload
        : operation.output.record,
    writeIdentity:
      operation.invocation.idempotency.writeIdentity ??
      operation.output.changes[0]?.writeId ??
      fallbackWriteIdentity,
  };
}

function commandOperationResultFromOperation(value: unknown): AuthorityTestCommandOperationResult {
  const operation = value as OperationInvocationResponse;

  if (operation.output.type !== "command") {
    throw new Error("Expected command operation output.");
  }

  return commandOperationResultFromResponse(operation);
}

function commandOperationResultFromResponse(
  operation: OperationInvocationResponse,
): AuthorityTestCommandOperationResult {
  if (operation.output.type !== "command") {
    throw new Error("Expected command operation output.");
  }

  return {
    changes: operation.output.changes,
    cursor: operation.output.cursor,
    writeIdentity:
      operation.invocation.idempotency.writeIdentity ?? operation.invocation.invocationId,
  };
}

function parseNonEmptyString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value;
}
