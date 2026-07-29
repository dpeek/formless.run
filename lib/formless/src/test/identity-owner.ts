import { expect } from "vite-plus/test";
import {
  IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX,
  IDENTITY_CONTROL_PLANE_SCHEMA_KEY,
  IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY,
  identityControlPlaneRoleKeys,
  identityControlPlaneSchema,
} from "@dpeek/formless-identity-control-plane";
import type { StoredRecord } from "@dpeek/formless-storage";
import type { OwnerIdentity } from "../shared/protocol.ts";
import type { createWorkerHarness } from "../worker/miniflare-test.ts";
import {
  recordOperationRequest,
  restoreTestStorageSnapshot,
  testStorageSnapshot,
} from "./authority-write.ts";

type IdentityOwnerHarness = Pick<
  Awaited<ReturnType<typeof createWorkerHarness>>,
  "durableObjectFetch" | "fetch"
>;

export async function resetTestIdentityStorage(
  harness: IdentityOwnerHarness,
  adminToken: string,
): Promise<void> {
  await restoreTestStorageSnapshot(
    harness,
    `${IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX}/snapshot/restore`,
    testStorageSnapshot({
      records: builtInRoleRecords(),
      schema: identityControlPlaneSchema,
      schemaKey: IDENTITY_CONTROL_PLANE_SCHEMA_KEY,
      storageIdentity: IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY,
    }),
    adminHeaders(adminToken),
  );
}

function builtInRoleRecords(): StoredRecord[] {
  return identityControlPlaneRoleKeys.map((roleKey) => ({
    id: `role:${roleKey}`,
    entity: "role",
    values: {
      key: roleKey,
      displayLabel: roleKey,
      status: "active",
    },
    createdAt: "2026-06-26T00:00:00.000Z",
    updatedAt: "2026-06-26T00:00:00.000Z",
  }));
}

export async function ensureTestIdentityOwner(
  harness: IdentityOwnerHarness,
  adminToken: string,
  input: {
    email?: string;
    name: string;
  },
): Promise<OwnerIdentity> {
  const existing = await readTestIdentityOwner(harness, adminToken);

  if (existing) {
    return existing;
  }

  const principal = await postIdentityRecordOperation(harness, adminToken, {
    entity: "principal",
    idempotencyKey: "test-owner-principal",
    operationName: "create",
    input: {
      displayName: input.name,
      kind: "human",
      status: "active",
    },
  });

  if (input.email !== undefined) {
    await postIdentityRecordOperation(harness, adminToken, {
      entity: "principal-email",
      idempotencyKey: "test-owner-principal-email",
      operationName: "create",
      input: {
        principal: principal.id,
        displayEmail: input.email,
        normalizedEmail: input.email.toLowerCase(),
        verificationStatus: "unverified",
        primary: true,
        recovery: true,
      },
    });
  }

  await postIdentityRecordOperation(harness, adminToken, {
    entity: "role-assignment",
    idempotencyKey: "test-owner-role-assignment",
    operationName: "create",
    input: {
      role: "role:instance.owner",
      targetKind: "principal",
      targetPrincipal: principal.id,
      scopeKind: "instance",
      status: "active",
    },
  });

  const owner = await readTestIdentityOwner(harness, adminToken);

  if (!owner) {
    throw new Error("Test identity owner setup did not create active owner authority.");
  }

  return owner;
}

async function readTestIdentityOwner(
  harness: IdentityOwnerHarness,
  adminToken: string,
): Promise<OwnerIdentity | null> {
  const response = await harness.fetch(`${IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX}/bootstrap`, {
    headers: adminHeaders(adminToken),
  });

  expect(response.status).toBe(200);

  const body = (await response.json()) as { records?: StoredRecord[] };
  const records = body.records ?? [];
  const assignment = records
    .filter(
      (record) =>
        record.entity === "role-assignment" &&
        !record.deletedAt &&
        record.values.status === "active" &&
        record.values.role === "role:instance.owner" &&
        record.values.targetKind === "principal" &&
        record.values.scopeKind === "instance" &&
        typeof record.values.targetPrincipal === "string",
    )
    .sort(compareStoredRecords)[0];

  if (!assignment || typeof assignment.values.targetPrincipal !== "string") {
    return null;
  }

  const principal = records.find(
    (record) =>
      record.id === assignment.values.targetPrincipal &&
      record.entity === "principal" &&
      !record.deletedAt &&
      record.values.status === "active",
  );

  if (!principal) {
    return null;
  }

  const email = records.find(
    (record) =>
      record.entity === "principal-email" &&
      !record.deletedAt &&
      record.values.principal === principal.id &&
      record.values.primary === true,
  );

  return {
    id: principal.id,
    name: String(principal.values.displayName),
    ...(typeof email?.values.displayEmail === "string" ? { email: email.values.displayEmail } : {}),
    createdAt: principal.createdAt,
  };
}

async function postIdentityRecordOperation(
  harness: IdentityOwnerHarness,
  adminToken: string,
  input: Parameters<typeof recordOperationRequest>[0],
): Promise<StoredRecord> {
  const request = recordOperationRequest(input);
  const response = await harness.fetch(
    `${IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX}${request.path.slice("/api".length)}`,
    {
      body: JSON.stringify(request.body),
      headers: adminHeaders(adminToken, { "Content-Type": "application/json" }),
      method: "POST",
    },
  );

  expect(response.status).toBe(200);

  return request.response(await response.json()).record;
}

function adminHeaders(adminToken: string, headers: Record<string, string> = {}) {
  return {
    ...headers,
    Authorization: `Bearer ${adminToken}`,
  };
}

function compareStoredRecords(left: StoredRecord, right: StoredRecord) {
  const created = left.createdAt.localeCompare(right.createdAt);

  return created === 0 ? left.id.localeCompare(right.id) : created;
}
