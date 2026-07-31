import { expect } from "vite-plus/test";
import { identityControlPlaneRoleKeys } from "@dpeek/formless-identity-control-plane";
import type { AppSchema } from "@dpeek/formless-schema";
import type { StorageSnapshot, StoredRecord } from "@dpeek/formless-storage";
import { formlessProgramSchema } from "../program/runtime.ts";
import {
  FORMLESS_PROGRAM_API_ROUTE_PREFIX,
  FORMLESS_PROGRAM_SCHEMA_KEY,
  FORMLESS_PROGRAM_STORAGE_IDENTITY,
} from "../program/target.ts";
import type { OwnerIdentity } from "../shared/protocol.ts";
import type { createWorkerHarness } from "../worker/miniflare-test.ts";
import { createOwnerSessionCookie } from "../worker/owner-session.ts";
import { restoreTestStorageSnapshot, testStorageSnapshot } from "./authority-write.ts";

type IdentityOwnerHarness = Pick<
  Awaited<ReturnType<typeof createWorkerHarness>>,
  "durableObjectFetch" | "fetch"
>;

export async function resetTestIdentityStorage(
  harness: IdentityOwnerHarness,
  adminToken: string,
  schema: AppSchema = formlessProgramSchema,
): Promise<void> {
  await restoreTestStorageSnapshot(
    harness,
    `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/snapshot/restore`,
    testStorageSnapshot({
      records: builtInRoleRecords(),
      schema,
      schemaKey: FORMLESS_PROGRAM_SCHEMA_KEY,
      storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
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

  const snapshotResponse = await harness.fetch(`${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/snapshot`, {
    headers: adminHeaders(adminToken),
  });
  expect(snapshotResponse.status).toBe(200);
  const snapshot = (await snapshotResponse.json()) as StorageSnapshot;
  const principalId = "principal:test-owner";
  const createdAt = "2026-06-26T00:00:00.000Z";
  const ownerRecords: StoredRecord[] = [
    {
      id: principalId,
      entity: "principal",
      values: {
        displayName: input.name,
        kind: "human",
        status: "active",
      },
      createdAt,
      updatedAt: createdAt,
    },
    ...(input.email === undefined
      ? []
      : [
          {
            id: "principal-email:test-owner",
            entity: "principal-email",
            values: {
              principal: principalId,
              displayEmail: input.email,
              normalizedEmail: input.email.toLowerCase(),
              verificationStatus: "unverified",
              primary: true,
              recovery: true,
            },
            createdAt,
            updatedAt: createdAt,
          },
        ]),
    {
      id: "role-assignment:test-owner",
      entity: "role-assignment",
      values: {
        role: "role:instance.owner",
        targetKind: "principal",
        targetPrincipal: principalId,
        scopeKind: "instance",
        status: "active",
      },
      createdAt,
      updatedAt: createdAt,
    },
  ];

  await restoreTestStorageSnapshot(
    harness,
    `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/snapshot/restore`,
    testStorageSnapshot({
      records: [...snapshot.records, ...ownerRecords],
      schema: snapshot.schema,
      schemaKey: FORMLESS_PROGRAM_SCHEMA_KEY,
      storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
    }),
    adminHeaders(adminToken),
  );

  const owner = await readTestIdentityOwner(harness, adminToken);

  if (!owner) {
    throw new Error("Test identity owner setup did not create active owner authority.");
  }

  return owner;
}

export async function testIdentityOwnerSessionHeaders(
  harness: IdentityOwnerHarness,
  adminToken: string,
  input: {
    email?: string;
    name?: string;
    sessionSecret?: string;
  } = {},
): Promise<Record<string, string>> {
  const owner = await ensureTestIdentityOwner(harness, adminToken, {
    ...(input.email === undefined ? {} : { email: input.email }),
    name: input.name ?? "Test Owner",
  });
  const created = await createOwnerSessionCookie({
    env:
      input.sessionSecret === undefined
        ? { FORMLESS_ADMIN_TOKEN: adminToken }
        : { FORMLESS_OWNER_SESSION_SECRET: input.sessionSecret },
    maxAgeSeconds: 60,
    now: "2999-01-01T00:00:00.000Z",
    owner,
    request: new Request("http://example.com/"),
  });

  return {
    Cookie: created.cookie.split(";")[0] ?? created.cookie,
  };
}

async function readTestIdentityOwner(
  harness: IdentityOwnerHarness,
  adminToken: string,
): Promise<OwnerIdentity | null> {
  const response = await harness.fetch(`${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/bootstrap`, {
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
