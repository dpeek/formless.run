import { setKeyedDefinition } from "../test/schema-definition-test-helpers.ts";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import type { StorageSnapshot, StoredRecord } from "@dpeek/formless-storage";
import {
  FORMLESS_CLIENT_SCHEMA_UPDATED_AT_HEADER,
  FORMLESS_RELOAD_REQUIRED_ERROR_CODE,
  type BootstrapResponse,
  type SyncResponse,
} from "../shared/protocol.ts";
import type {
  OperationInvocationEnvelope,
  OperationInvocationResponse,
} from "../shared/operation-invocation.ts";
import { programStorageIdentity } from "../shared/program-storage-identity.ts";
import { formlessProgramTarget } from "../program/target.ts";
import type {
  AppSchema,
  EntitySchema,
  EntityOperationSchema,
  RecordPlanStepSchema,
  TransitionSideEffectCreateStepSchema,
} from "@dpeek/formless-schema";
import type { StoredOperationInvocation } from "./storage.ts";
import { createWorkerHarness } from "./miniflare-test.ts";
type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

type ExecuteOperationInput = {
  actor?: OperationInvocationEnvelope["actor"];
  actorKind?: "admin" | "cliDeployer" | "owner" | "runner";
  schemaFixture?: "program" | "standard" | "tasks";
  body?: unknown;
  beforeWriteRecordValues?: {
    recordId: string;
    values: Record<string, unknown>;
  };
  headers?: Record<string, string>;
  identity?: ReturnType<typeof programStorageIdentity>;
  method: string;
  path: string;
  preserveMissingOperationAccess?: boolean;
  programOperationAuthorized?: boolean;
  rejectSnapshotRecords?: boolean;
  publicOperation?: {
    beforeReplayError?: string;
    idempotencyKey: string;
    input: unknown;
    source: {
      host: string;
      path: string;
      siteBlockId?: string;
    };
    turnstileToken?: string;
  };
  search?: string;
};

type ExecuteOperationSuccess<TBody> = {
  result: {
    body: TBody;
    headers?: Record<string, string>;
    status?: number;
  };
  writes: Array<{
    kind: "committed" | "replay";
    response: unknown;
  }>;
};

type ExecuteOperationFailure = {
  code?: string;
  error: string;
  reloadRequired?: boolean;
  upgrade?: unknown;
  writes: Array<{
    kind: "committed" | "replay";
    response: unknown;
  }>;
};

let harness: Harness;
let operationHarnessDir: string | undefined;
let operationHarnessName: string;

beforeAll(async () => {
  harness = await createWorkerHarness(await writeAuthorityOperationHarness(), {
    AUTHORITY_OPERATION_HARNESS: { className: "AuthorityOperationHarness", useSQLite: true },
  });
});

beforeEach(() => {
  operationHarnessName = randomUUID();
});

afterAll(async () => {
  await harness.dispose();

  if (operationHarnessDir) {
    await rm(operationHarnessDir, { recursive: true, force: true });
    operationHarnessDir = undefined;
  }
});

describe("authority operation execution", () => {
  it("runs the selected shared record adapter before snapshot mutation", async () => {
    const exported = await executeOperation<StorageSnapshot>({
      method: "GET",
      path: "/snapshot",
    });
    const rejected = await executeOperationFailure({
      body: exported.body.result.body,
      method: "POST",
      path: "/snapshot/restore",
      rejectSnapshotRecords: true,
    });

    expect(rejected.response.status).toBe(400);
    expect(rejected.body).toEqual({
      error: "Selected task snapshot adapter rejected records.",
      writes: [],
    });
  });

  it("fails closed on a Program operation without access before parsing input or writing", async () => {
    const rejected = await executeOperationFailure({
      body: "invalid-operation-input",
      identity: formlessProgramTarget,
      method: "POST",
      path: "/operations/task/create",
      preserveMissingOperationAccess: true,
    });

    expect(rejected.response.status).toBe(400);
    expect(rejected.body).toEqual({
      error: 'Program operation "task.create" is missing access.',
      writes: [],
    });
  });

  it("builds operation envelopes and returns operation-shaped committed and replayed output", async () => {
    const body = {
      idempotencyKey: "operation-create-task",
      input: {
        title: "Operation-created task",
        done: false,
      },
      source: {
        protocol: "generated-ui",
        surface: "taskHome",
      },
    };
    const first = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/create",
      body,
    });
    const replay = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/create",
      body,
    });
    const firstOutput = first.body.result.body.output;

    if (firstOutput.type !== "create") {
      throw new Error("Expected create operation output.");
    }

    expect(first.response.status).toBe(200);
    expect(first.body.writes.map((write) => write.kind)).toEqual(["committed"]);
    expect(first.body.result.body).toMatchObject({
      invocation: {
        actor: { kind: "owner" },
        idempotency: {
          key: "operation-create-task",
          required: true,
          source: "caller",
          writeIdentity: "operation:task.create:operation-create-task",
        },
        input: {
          type: "create",
          values: {
            title: "Operation-created task",
            done: false,
          },
        },
        operation: {
          canonicalKey: "task.create",
          entityName: "task",
          kind: "create",
          operationName: "create",
        },
        source: {
          protocol: "generated-ui",
          route: "/operations/task/create",
          surface: "taskHome",
        },
      },
      output: {
        affectedChangeIds: [String(firstOutput.changes[0]?.seq)],
        record: {
          entity: "task",
          values: {
            title: "Operation-created task",
            done: false,
            priority: "normal",
          },
        },
        type: "create",
      },
      status: "committed",
    });
    expect(replay.response.status).toBe(200);
    expect(replay.body.writes.map((write) => write.kind)).toEqual(["replay"]);
    expect(replay.body.result.body.status).toBe("replayed");
    expect(replay.body.result.body.output).toEqual(first.body.result.body.output);
  });

  it("commits operation-only CRUD writes without source write policy", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const schema = schemaWithOperationOnlyTaskCrud(bootstrap.body.result.body.schema);

    await executeOperation({
      method: "POST",
      path: "/schema",
      body: { schema },
    });

    const created = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/create",
      body: {
        idempotencyKey: "operation-only-crud-create",
        input: {
          title: "Operation-only CRUD",
          done: false,
        },
      },
    });
    const createOutput = created.body.result.body.output;

    if (createOutput.type !== "create") {
      throw new Error("Expected create operation output.");
    }

    const listed = await executeOperation<OperationInvocationResponse>({
      method: "GET",
      path: "/operations/task/activeList",
    });
    const listOutput = listed.body.result.body.output;

    if (listOutput.type !== "list") {
      throw new Error("Expected list operation output.");
    }

    const updated = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/update",
      body: {
        idempotencyKey: "operation-only-crud-update",
        recordId: createOutput.record.id,
        input: {
          title: "Operation-only CRUD updated",
          done: true,
        },
      },
    });
    const updateOutput = updated.body.result.body.output;

    if (updateOutput.type !== "update") {
      throw new Error("Expected update operation output.");
    }

    const read = await executeOperation<OperationInvocationResponse>({
      method: "GET",
      path: "/operations/task/read",
      search: `recordId=${encodeURIComponent(createOutput.record.id)}`,
    });
    const readOutput = read.body.result.body.output;

    if (readOutput.type !== "get") {
      throw new Error("Expected get operation output.");
    }

    const deleted = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/delete",
      body: {
        idempotencyKey: "operation-only-crud-delete",
        recordId: createOutput.record.id,
      },
    });
    const deleteReplay = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/delete",
      body: {
        idempotencyKey: "operation-only-crud-delete",
        recordId: createOutput.record.id,
      },
    });
    const deleteOutput = deleted.body.result.body.output;

    if (deleteOutput.type !== "delete") {
      throw new Error("Expected delete operation output.");
    }

    expect(created.body.writes.map((write) => write.kind)).toEqual(["committed"]);
    expect(createOutput.record.createdAt).toBe(created.body.result.body.invocation.receivedAt);
    expect(createOutput.record.updatedAt).toBe(created.body.result.body.invocation.receivedAt);
    expect(createOutput.changes).toEqual([
      expect.objectContaining({
        createdAt: created.body.result.body.invocation.receivedAt,
        entity: "task",
        writeId: "operation:task.create:operation-only-crud-create",
        operationKind: "create",
        payload: createOutput.record,
        recordId: createOutput.record.id,
      }),
    ]);
    expect(createOutput.affectedChangeIds).toEqual(
      createOutput.changes.map((change) => String(change.seq)),
    );
    expect(listOutput.records).toContainEqual(createOutput.record);
    expect(updateOutput.record).toMatchObject({
      id: createOutput.record.id,
      createdAt: createOutput.record.createdAt,
      updatedAt: updated.body.result.body.invocation.receivedAt,
      values: {
        title: "Operation-only CRUD updated",
        done: true,
      },
    });
    expect(updateOutput.changes).toEqual([
      expect.objectContaining({
        createdAt: updated.body.result.body.invocation.receivedAt,
        entity: "task",
        writeId: "operation:task.update:operation-only-crud-update",
        operationKind: "update",
        payload: updateOutput.record,
        recordId: createOutput.record.id,
      }),
    ]);
    expect(readOutput.record).toEqual(updateOutput.record);
    expect(deleteOutput).toMatchObject({
      affectedChangeIds: deleteOutput.changes.map((change) => String(change.seq)),
      recordId: createOutput.record.id,
      type: "delete",
    });
    expect(deleteOutput.changes).toEqual([
      expect.objectContaining({
        createdAt: deleted.body.result.body.invocation.receivedAt,
        entity: "task",
        writeId: "operation:task.delete:operation-only-crud-delete",
        operationKind: "delete",
        payload: {
          ...updateOutput.record,
          deletedAt: deleted.body.result.body.invocation.receivedAt,
          updatedAt: deleted.body.result.body.invocation.receivedAt,
        },
        recordId: createOutput.record.id,
      }),
    ]);
    expect(deleteReplay.body.writes.map((write) => write.kind)).toEqual(["replay"]);
    expect(deleteReplay.body.result.body).toMatchObject({
      output: deleteOutput,
      status: "replayed",
    });
  });

  it("enforces operation unique constraints before CRUD write-log append", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const schema = schemaWithOperationOnlyTaskCrud(bootstrap.body.result.body.schema);
    setKeyedDefinition(schema.entities, "task", {
      ...schema.entities.find((definition) => definition.key === "task")!,
      constraints: [
        {
          key: "uniqueTitle",
          kind: "unique",
          fields: ["title"],
        },
      ],
    });
    await executeOperation({
      method: "POST",
      path: "/schema",
      body: { schema },
    });

    const baseline = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const first = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/create",
      body: {
        idempotencyKey: "operation-unique-first",
        input: {
          title: "Unique operation title",
          done: false,
        },
      },
    });
    const second = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/create",
      body: {
        idempotencyKey: "operation-unique-second",
        input: {
          title: "Other operation title",
          done: false,
        },
      },
    });
    const duplicateCreate = await executeOperationFailure({
      method: "POST",
      path: "/operations/task/create",
      body: {
        idempotencyKey: "operation-unique-duplicate-create",
        input: {
          title: "Unique operation title",
          done: false,
        },
      },
    });
    const secondOutput = second.body.result.body.output;

    if (secondOutput.type !== "create") {
      throw new Error("Expected create operation output.");
    }

    const duplicateUpdate = await executeOperationFailure({
      method: "POST",
      path: "/operations/task/update",
      body: {
        idempotencyKey: "operation-unique-duplicate-update",
        recordId: secondOutput.record.id,
        input: {
          title: "Unique operation title",
        },
      },
    });
    const sync = await executeOperation<SyncResponse>({
      method: "GET",
      path: "/sync",
      search: `after=${baseline.body.result.body.cursor}&schemaUpdatedAt=${encodeURIComponent(baseline.body.result.body.schemaUpdatedAt)}`,
    });
    const rows = await readOperationInvocations();
    expect(first.response.status).toBe(200);
    expect(duplicateCreate.response.status).toBe(400);
    expect(duplicateCreate.body).toEqual({
      error: 'Unique constraint "task.uniqueTitle" would be violated.',
      writes: [],
    });
    expect(duplicateUpdate.response.status).toBe(400);
    expect(duplicateUpdate.body).toEqual({
      error: 'Unique constraint "task.uniqueTitle" would be violated.',
      writes: [],
    });
    expect(sync.body.result.body.changes.map((change) => change.writeId)).toEqual([
      "operation:task.create:operation-unique-first",
      "operation:task.create:operation-unique-second",
    ]);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          affectedChangeIds: [],
          errorMessage: 'Unique constraint "task.uniqueTitle" would be violated.',
          operationKey: "task.create",
          status: "failed",
        }),
        expect.objectContaining({
          affectedChangeIds: [],
          errorMessage: 'Unique constraint "task.uniqueTitle" would be violated.',
          operationKey: "task.update",
          status: "failed",
        }),
      ]),
    );
  });

  it("enforces operation reference validation and delete blockers before CRUD write-log append", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const schema = schemaWithOperationOnlyTaskProjectReference(bootstrap.body.result.body.schema);

    await executeOperation({
      method: "POST",
      path: "/schema",
      body: { schema },
    });

    const baseline = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const project = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/project/create",
      body: {
        idempotencyKey: "operation-reference-project",
        input: {
          name: "Operation project",
        },
      },
    });
    const projectOutput = project.body.result.body.output;

    if (projectOutput.type !== "create") {
      throw new Error("Expected project create output.");
    }

    const missingReference = await executeOperationFailure({
      method: "POST",
      path: "/operations/task/create",
      body: {
        idempotencyKey: "operation-reference-missing",
        input: {
          title: "Missing reference task",
          done: false,
          project: "missing-project",
        },
      },
    });
    const task = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/create",
      body: {
        idempotencyKey: "operation-reference-task",
        input: {
          title: "Referenced task",
          done: false,
          project: projectOutput.record.id,
        },
      },
    });
    const blockedDelete = await executeOperationFailure({
      method: "POST",
      path: "/operations/project/delete",
      body: {
        idempotencyKey: "operation-reference-delete-blocked",
        recordId: projectOutput.record.id,
      },
    });
    const projectRead = await executeOperation<OperationInvocationResponse>({
      method: "GET",
      path: "/operations/project/read",
      search: `recordId=${encodeURIComponent(projectOutput.record.id)}`,
    });
    const projectReadOutput = projectRead.body.result.body.output;

    if (projectReadOutput.type !== "get") {
      throw new Error("Expected project get output.");
    }

    const sync = await executeOperation<SyncResponse>({
      method: "GET",
      path: "/sync",
      search: `after=${baseline.body.result.body.cursor}&schemaUpdatedAt=${encodeURIComponent(baseline.body.result.body.schemaUpdatedAt)}`,
    });
    expect(missingReference.response.status).toBe(400);
    expect(missingReference.body).toEqual({
      error: 'Field "project" references unknown project record "missing-project".',
      writes: [],
    });
    expect(task.response.status).toBe(200);
    expect(blockedDelete.response.status).toBe(400);
    expect(blockedDelete.body.error).toContain(
      `Cannot delete record "${projectOutput.record.id}" because active task record`,
    );
    expect(blockedDelete.body.writes).toEqual([]);
    expect(projectReadOutput.record).toMatchObject({
      id: projectOutput.record.id,
      values: {
        name: "Operation project",
      },
    });
    expect(projectReadOutput.record.deletedAt).toBeUndefined();
    expect(projectOutput.changes.map((change) => change.writeId)).toEqual([
      "operation:project.create:operation-reference-project",
    ]);
    expect(sync.body.result.body.changes.map((change) => change.writeId)).toEqual([
      "operation:task.create:operation-reference-task",
    ]);
  });

  it("enforces Site ownership for block operations and inherits it for tree children", async () => {
    const exported = await executeOperation<StorageSnapshot>({
      schemaFixture: "program",
      method: "GET",
      path: "/snapshot",
    });
    const snapshot = exported.body.result.body;
    const siteA = operationSiteRecord("site:a", "a");
    const siteB = operationSiteRecord("site:b", "b");
    const parent = operationBlockRecord("block:parent", siteA.id, "page");
    const other = operationBlockRecord("block:other", siteB.id, "page");

    await executeOperation({
      schemaFixture: "program",
      method: "POST",
      path: "/snapshot/restore",
      body: {
        ...snapshot,
        records: [...snapshot.records, siteA, siteB, parent, other],
      },
    });

    const missingSite = await executeOperationFailure({
      schemaFixture: "program",
      method: "POST",
      path: "/operations/block/create",
      body: {
        idempotencyKey: "site-block-missing-site",
        input: { type: "markdown", label: "Missing Site" },
      },
    });
    const created = await executeOperation<OperationInvocationResponse>({
      schemaFixture: "program",
      method: "POST",
      path: "/operations/block/create",
      body: {
        idempotencyKey: "site-block-create",
        input: { site: siteA.id, type: "markdown", label: "Owned block" },
      },
    });
    const createdOutput = created.body.result.body.output;

    if (createdOutput.type !== "create") {
      throw new Error("Expected block create output.");
    }

    const moved = await executeOperationFailure({
      schemaFixture: "program",
      method: "POST",
      path: "/operations/block/update",
      body: {
        idempotencyKey: "site-block-move",
        recordId: createdOutput.record.id,
        input: { site: siteB.id },
      },
    });
    const child = await executeOperation<OperationInvocationResponse>({
      schemaFixture: "program",
      method: "POST",
      path: "/operations/block-placement/addTreeChild",
      body: {
        idempotencyKey: "site-tree-child",
        input: {
          parentRecordId: parent.id,
          childValues: {
            site: siteB.id,
            type: "markdown",
            label: "Inherited child",
          },
        },
      },
    });
    const childOutput = child.body.result.body.output;

    if (childOutput.type !== "command") {
      throw new Error("Expected tree child command output.");
    }

    expect(missingSite.response.status).toBe(400);
    expect(missingSite.body.error).toBe('Field "site" is required.');
    expect(createdOutput.record.values.site).toBe(siteA.id);
    expect(moved.response.status).toBe(400);
    expect(moved.body.error).toBe('Operation input includes undeclared field "site".');
    expect(childOutput.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity: "block",
          payload: expect.objectContaining({
            values: expect.objectContaining({ site: siteA.id, label: "Inherited child" }),
          }),
        }),
        expect.objectContaining({
          entity: "block-placement",
          payload: expect.objectContaining({
            values: expect.objectContaining({ parent: parent.id, order: 1000 }),
          }),
        }),
      ]),
    );
  });

  it("stores committed and replayed operation invocation rows outside sync and snapshots", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const schemaUpdatedAt = bootstrap.body.result.body.schemaUpdatedAt;
    const beforeCursor = bootstrap.body.result.body.cursor;
    const body = {
      idempotencyKey: "operation-row-create-task",
      input: {
        title: "Operation row task",
        done: false,
      },
      source: {
        protocol: "generated-ui",
        surface: "taskHome",
      },
    };
    const first = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/create",
      body,
    });
    const firstRows = await readOperationInvocations();
    const replay = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/create",
      body,
    });
    const replayRows = await readOperationInvocations();
    const sync = await executeOperation<SyncResponse>({
      method: "GET",
      path: "/sync",
      search: `after=${beforeCursor}&schemaUpdatedAt=${encodeURIComponent(schemaUpdatedAt)}`,
    });
    const snapshot = await executeOperation<StorageSnapshot>({
      method: "GET",
      path: "/snapshot",
    });
    const firstOutput = first.body.result.body.output;

    if (firstOutput.type !== "create") {
      throw new Error("Expected create operation output.");
    }

    expect(first.body.writes.map((write) => write.kind)).toEqual(["committed"]);
    expect(firstRows).toHaveLength(1);
    expect(firstRows[0]).toMatchObject({
      affectedChangeIds: [String(firstOutput.changes[0]?.seq)],
      auditInput: {
        kind: "summary",
        summary: {
          fieldNames: ["done", "title"],
          type: "create",
          valuesType: "object",
        },
      },
      authDecision: "allowed",
      idempotency: {
        key: "operation-row-create-task",
        required: true,
        source: "caller",
        writeIdentity: "operation:task.create:operation-row-create-task",
      },
      operationKey: "task.create",
      operationKind: "create",
      output: firstOutput,
      status: "committed",
      statusHistory: [
        expect.objectContaining({ status: "accepted" }),
        expect.objectContaining({ status: "committed" }),
      ],
    });
    expect(firstRows[0]?.statusHistory.map((entry) => entry.status)).toEqual([
      "accepted",
      "committed",
    ]);
    expect(firstRows[0]?.inputHash).toMatch(/^fnv1a64:[a-f0-9]{16}$/);
    expect(replay.response.status).toBe(200);
    expect(replay.body.writes.map((write) => write.kind)).toEqual(["replay"]);
    expect(replay.body.result.body.status).toBe("replayed");
    expect(replay.body.result.body.output).toEqual(first.body.result.body.output);
    expect(replayRows).toHaveLength(1);
    expect(replayRows[0]).toMatchObject({
      output: firstOutput,
      status: "replayed",
      statusHistory: [
        expect.objectContaining({ status: "accepted" }),
        expect.objectContaining({ status: "committed" }),
        expect.objectContaining({ status: "replayed" }),
      ],
    });
    expect(replayRows[0]?.statusHistory.map((entry) => entry.status)).toEqual([
      "accepted",
      "committed",
      "replayed",
    ]);
    expect(sync.body.result.body.changes).toEqual(firstOutput.changes);
    expect(snapshot.body.result.body.records).toContainEqual(firstOutput.record);
    expect(sync.body.result.body).not.toHaveProperty("operationInvocations");
    expect(snapshot.body.result.body).not.toHaveProperty("operationInvocations");
    expect(JSON.stringify(snapshot.body.result.body)).not.toContain("operation-row-create-task");
  });

  it("rejects unauthorized Program operations without materializing records", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const schema = cloneSchema(bootstrap.body.result.body.schema);
    const taskEntity = schema.entities.find((definition) => definition.key === "task")!;
    if (!taskEntity) {
      throw new Error("Expected task entity.");
    }
    setKeyedDefinition(schema.entities, "task", {
      ...taskEntity,
      operations: (taskEntity.operations ?? []).map((operation) =>
        operation.key === "create"
          ? {
              ...operation,
              kind: "create",
              scope: "collection",
              input: { fields: [{ key: "title", field: "title" }] },
              effect: { type: "createRecord" },
              output: { type: "create" },
              idempotency: { required: true },
              audit: { input: "summary" },
              access: { actor: "owner" },
              key: "create",
            }
          : operation,
      ),
    });
    await executeOperation({
      method: "POST",
      path: "/schema",
      body: { schema },
    });

    const rejected = await executeOperationFailure({
      method: "POST",
      path: "/operations/task/create",
      body: {
        idempotencyKey: "operation-row-policy-reject",
        input: "invalid-values",
      },
      programOperationAuthorized: false,
    });
    const rows = await readOperationInvocations();

    expect(rejected.response.status).toBe(400);
    expect(rejected.body.writes).toEqual([]);
    expect(rejected.body).toEqual({
      error: 'Program operation "task.create" is not authorized.',
      writes: [],
    });
    expect(rows).toEqual([]);
  });

  it("stores failed operation invocations when validation rejects after acceptance", async () => {
    const failed = await executeOperationFailure({
      method: "POST",
      path: "/operations/task/create",
      body: {
        idempotencyKey: "operation-row-validation-failed",
        input: {
          done: false,
        },
      },
    });
    const rows = await readOperationInvocations();

    expect(failed.response.status).toBe(400);
    expect(failed.body).toEqual({
      error: 'Field "title" is required.',
      writes: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      affectedChangeIds: [],
      authDecision: "allowed",
      errorMessage: 'Field "title" is required.',
      operationKey: "task.create",
      status: "failed",
      statusHistory: [
        expect.objectContaining({ status: "accepted" }),
        expect.objectContaining({ status: "failed" }),
      ],
    });
    expect(rows[0]?.statusHistory.map((entry) => entry.status)).toEqual(["accepted", "failed"]);
  });

  it("stores failed operation invocations when command handler execution fails after acceptance", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const schema = schemaWithPrivateSubscribeCommandOperation(bootstrap.body.result.body.schema);

    await executeOperation({
      method: "POST",
      path: "/schema",
      body: { schema },
    });

    const failed = await executeOperationFailure({
      method: "POST",
      path: "/operations/task/privateSubscribe",
      body: {
        idempotencyKey: "operation-row-handler-failed",
      },
    });
    const rows = await readOperationInvocations();

    expect(failed.response.status).toBe(400);
    expect(failed.body).toEqual({
      error: 'Operation "task.privateSubscribe" is not available for private execution.',
      writes: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      affectedChangeIds: [],
      authDecision: "allowed",
      errorMessage: 'Operation "task.privateSubscribe" is not available for private execution.',
      operationKey: "task.privateSubscribe",
      operationKind: "command",
      status: "failed",
    });
    expect(rows[0]?.statusHistory.map((entry) => entry.status)).toEqual(["accepted", "failed"]);
    expect(rows[0]?.output).toBeUndefined();
  });

  it("executes Standard public subscribe handlers without Site and with normalized membership uniqueness", async () => {
    const identity = programStorageIdentity();

    const route = `${identity.apiRoutePrefix}/public/operations/subscription/subscribe`;
    const invalid = await executeOperationFailure({
      schemaFixture: "standard",
      identity,
      method: "POST",
      path: "/operations/subscription/subscribe",
      publicOperation: {
        idempotencyKey: "public-subscribe-invalid-email",
        input: { email: "not an email address" },
        source: {
          host: "subscribe.example.com",
          path: route,
          siteBlockId: "rec_site_subscribe_invalid",
        },
        turnstileToken: "invalid-email-proof-token",
      },
    });
    const first = await executeOperation<OperationInvocationResponse>({
      schemaFixture: "standard",
      identity,
      method: "POST",
      path: "/operations/subscription/subscribe",
      publicOperation: {
        idempotencyKey: "public-subscribe-first",
        input: { email: "Ada@Example.com" },
        source: {
          host: "subscribe.example.com",
          path: route,
          siteBlockId: "rec_site_subscribe_first",
        },
        turnstileToken: "first-subscribe-proof-token",
      },
    });
    const afterFirst = await executeOperation<BootstrapResponse>({
      schemaFixture: "standard",
      identity,
      method: "GET",
      path: "/bootstrap",
    });
    const firstSubscriptionRecords = afterFirst.body.result.body.records;

    expect(firstSubscriptionRecords.map(({ entity }) => entity).sort()).toEqual([
      "audience",
      "email-address",
      "subscription",
    ]);

    const duplicate = await executeOperation<OperationInvocationResponse>({
      schemaFixture: "standard",
      identity,
      method: "POST",
      path: "/operations/subscription/subscribe",
      publicOperation: {
        idempotencyKey: "public-subscribe-duplicate",
        input: { email: "ada@example.com" },
        source: {
          host: "subscribe.example.com",
          path: route,
          siteBlockId: "rec_site_subscribe_duplicate",
        },
        turnstileToken: "duplicate-subscribe-proof-token",
      },
    });
    const afterDuplicate = await executeOperation<BootstrapResponse>({
      schemaFixture: "standard",
      identity,
      method: "GET",
      path: "/bootstrap",
    });
    const duplicateEmailAddresses = afterDuplicate.body.result.body.records.filter(
      (record) =>
        record.entity === "email-address" && record.values.normalizedAddress === "ada@example.com",
    );
    const duplicateSubscriptions = afterDuplicate.body.result.body.records.filter(
      (record) =>
        record.entity === "subscription" &&
        record.values.emailAddress === duplicateEmailAddresses[0]?.id,
    );
    const subscription = duplicateSubscriptions[0];

    if (!subscription) {
      throw new Error("Expected standard subscription.");
    }

    await executeOperation<OperationInvocationResponse>({
      schemaFixture: "standard",
      body: {
        idempotencyKey: "public-subscribe-unsubscribe",
        recordId: subscription.id,
        input: { status: "unsubscribed" },
      },
      identity,
      method: "POST",
      path: "/operations/subscription/update",
    });

    const resubscribed = await executeOperation<OperationInvocationResponse>({
      schemaFixture: "standard",
      identity,
      method: "POST",
      path: "/operations/subscription/subscribe",
      publicOperation: {
        idempotencyKey: "public-subscribe-resubscribe",
        input: { email: "ada@example.com" },
        source: {
          host: "subscribe.example.com",
          path: route,
          siteBlockId: "rec_site_subscribe_resubscribe",
        },
        turnstileToken: "resubscribe-proof-token",
      },
    });
    const afterResubscribe = await executeOperation<BootstrapResponse>({
      schemaFixture: "standard",
      identity,
      method: "GET",
      path: "/bootstrap",
    });
    const rows = (await readOperationInvocations()).filter(
      (row) => row.source.protocol === "public",
    );
    const emailAddresses = afterResubscribe.body.result.body.records.filter(
      (record) =>
        record.entity === "email-address" && record.values.normalizedAddress === "ada@example.com",
    );
    const subscriptions = afterResubscribe.body.result.body.records.filter(
      (record) =>
        record.entity === "subscription" && record.values.emailAddress === emailAddresses[0]?.id,
    );
    const invalidRow = rows.find(
      (row) =>
        row.invocationId === "operation:subscription.subscribe:public-subscribe-invalid-email",
    );
    const resubscribedRow = rows.find(
      (row) => row.invocationId === "operation:subscription.subscribe:public-subscribe-resubscribe",
    );

    expect(invalid.response.status).toBe(400);
    expect(invalid.body).toEqual({
      error: 'Subscribe operation public input "email" must be an email address.',
      writes: [],
    });
    expect(invalidRow).toMatchObject({
      actorKind: "anonymous",
      affectedChangeIds: [],
      auditInput: {
        kind: "summary",
        summary: {
          inputFields: ["email"],
          inputType: "object",
          type: "command",
        },
      },
      authDecision: "allowed",
      operationKey: "subscription.subscribe",
      operationKind: "command",
      source: {
        host: "subscribe.example.com",
        path: route,
        protocol: "public",
        siteBlockId: "rec_site_subscribe_invalid",
      },
      status: "failed",
    });
    expect(invalidRow?.statusHistory.map((entry) => entry.status)).toEqual(["accepted", "failed"]);
    expect(first.body.writes.map((write) => write.kind)).toEqual(["committed"]);
    expect(duplicate.body.writes.map((write) => write.kind)).toEqual(["committed"]);
    expect(resubscribed.body.writes.map((write) => write.kind)).toEqual(["committed"]);
    expect(emailAddresses).toHaveLength(1);
    expect(emailAddresses[0]?.values).toMatchObject({
      address: "Ada@Example.com",
      normalizedAddress: "ada@example.com",
    });
    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0]?.id).toBe(subscription.id);
    expect(subscriptions[0]?.values).toMatchObject({
      status: "subscribed",
      sourceKind: "publicOperation",
      sourceTargetKind: "program",
      sourceSchemaKey: "formless-program",
      sourceApiRoutePrefix: "/api/formless/program",
      sourceOperationKey: "subscription.subscribe",
      sourceHost: "subscribe.example.com",
      sourcePath: route,
      sourceSiteBlockId: "rec_site_subscribe_resubscribe",
    });
    expect(resubscribedRow).toMatchObject({
      auditInput: {
        kind: "summary",
        summary: {
          inputFields: ["email"],
          inputType: "object",
          type: "command",
        },
      },
      source: {
        host: "subscribe.example.com",
        path: route,
        protocol: "public",
        siteBlockId: "rec_site_subscribe_resubscribe",
      },
      status: "committed",
    });
    expect(rows).toHaveLength(4);
    expect(JSON.stringify(rows)).not.toContain("Ada@Example.com");
    expect(JSON.stringify(rows)).not.toContain("ada@example.com");
    expect(JSON.stringify(rows)).not.toContain("proof-token");
    expect(JSON.stringify(rows)).not.toContain("turnstileToken");
  });

  it("redacts explicitly snapshotted audit input for command operations", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const schema = cloneSchema(bootstrap.body.result.body.schema);
    const taskEntity = schema.entities.find((definition) => definition.key === "task")!;
    if (!taskEntity?.operations!.find((definition) => definition.key === "clearCompletedTasks")!) {
      throw new Error("Expected clearCompletedTasks operation.");
    }
    setKeyedDefinition(schema.entities, "task", {
      ...taskEntity,
      operations: (taskEntity.operations ?? []).map((operation) =>
        operation.key === "clearCompletedTasks"
          ? {
              ...operation,
              audit: { input: "snapshot" },
              key: "clearCompletedTasks",
            }
          : operation,
      ),
    });
    await executeOperation({
      method: "POST",
      path: "/schema",
      body: { schema },
    });
    await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/create",
      body: {
        idempotencyKey: "operation-row-redaction-completed-task",
        input: {
          title: "Completed for audit redaction",
          done: true,
        },
      },
    });

    const command = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/clearCompletedTasks",
      body: {
        idempotencyKey: "operation-row-redaction-command",
        input: {
          safeNote: "visible",
          turnstileToken: "secret-turnstile-token",
          nested: {
            password: "secret-password",
          },
          proof: {
            challenge: "secret-challenge",
          },
        },
      },
    });
    const rows = await readOperationInvocations();
    const commandRow = rows.find((row) => row.operationKey === "task.clearCompletedTasks");

    expect(command.response.status).toBe(200);
    expect(command.body.result.body.output).toMatchObject({
      type: "command",
    });
    expect(commandRow).toMatchObject({
      auditInput: {
        kind: "snapshot",
        snapshot: {
          type: "command",
          input: {
            safeNote: "visible",
            turnstileToken: "[redacted]",
            nested: {
              password: "[redacted]",
            },
            proof: "[redacted]",
          },
        },
      },
      operationKey: "task.clearCompletedTasks",
      operationKind: "command",
      status: "committed",
    });
    expect(JSON.stringify(commandRow?.auditInput)).not.toContain("secret-turnstile-token");
    expect(JSON.stringify(commandRow?.auditInput)).not.toContain("secret-password");
    expect(JSON.stringify(commandRow?.auditInput)).not.toContain("secret-challenge");
  });

  it("executes declared command operation effects through operation policy and replays command outcomes", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const schema = schemaWithScopedClearCompletedCommand(bootstrap.body.result.body.schema);

    await executeOperation({
      method: "POST",
      path: "/schema",
      body: { schema },
    });

    const created = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/create",
      body: {
        idempotencyKey: "command-effect-completed-task",
        input: {
          title: "Operation command completed",
          done: true,
        },
      },
    });
    const createdOutput = created.body.result.body.output;

    if (createdOutput.type !== "create") {
      throw new Error("Expected create operation output.");
    }

    const body = { idempotencyKey: "command-effect-clear-completed" };
    const committed = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/clearCompletedTasks",
      body,
    });
    const replay = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/clearCompletedTasks",
      body,
    });
    const output = committed.body.result.body.output;
    const rows = await readOperationInvocations();
    const commandRow = rows.find((row) => row.operationKey === "task.clearCompletedTasks");

    if (output.type !== "command") {
      throw new Error("Expected command operation output.");
    }

    expect(committed.response.status).toBe(200);
    expect(committed.body.writes.map((write) => write.kind)).toEqual(["committed"]);
    expect(replay.body.writes.map((write) => write.kind)).toEqual(["replay"]);
    expect(replay.body.result.body.status).toBe("replayed");
    expect(replay.body.result.body.output).toEqual(output);
    expect(output.affectedChangeIds).toEqual(output.changes.map((change) => String(change.seq)));
    expect(output).not.toHaveProperty("actionId");
    expect(output).not.toHaveProperty("response");
    const committedWriteResponse = committed.body.writes[0]
      ?.response as OperationInvocationResponse;

    expect(committedWriteResponse.output).toEqual(output);
    expect(committedWriteResponse.output).not.toHaveProperty("response");
    const createdRecordChange = output.changes.find(
      (change) => change.recordId === createdOutput.record.id,
    );

    expect(createdRecordChange).toMatchObject({
      entity: "task",
      writeId: "operation:task.clearCompletedTasks:command-effect-clear-completed",
      operationKind: "command",
      payload: {
        id: createdOutput.record.id,
        deletedAt: committed.body.result.body.invocation.receivedAt,
        updatedAt: committed.body.result.body.invocation.receivedAt,
        values: {
          title: "Operation command completed",
        },
      },
      recordId: createdOutput.record.id,
    });
    expect(createdRecordChange?.payload.values).not.toHaveProperty("done");
    expect(commandRow).toMatchObject({
      affectedChangeIds: output.affectedChangeIds,
      operationKey: "task.clearCompletedTasks",
      operationKind: "command",
      output,
      status: "replayed",
    });
    expect(commandRow?.output).not.toHaveProperty("actionId");
    expect(commandRow?.output).not.toHaveProperty("response");
    expect(commandRow?.statusHistory.map((entry) => entry.status)).toEqual([
      "accepted",
      "committed",
      "replayed",
    ]);
  });

  it("uses preauthorized authenticated operation actors and filters command output", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const created = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/create",
      body: {
        idempotencyKey: "authenticated-command-completed-task",
        input: {
          title: "Authenticated command completed",
          done: true,
        },
      },
    });
    const createdOutput = created.body.result.body.output;

    if (createdOutput.type !== "create") {
      throw new Error("Expected create operation output.");
    }

    const schema = schemaWithAuthenticatedScopedClearCompletedCommand(
      bootstrap.body.result.body.schema,
    );

    await executeOperation({
      method: "POST",
      path: "/schema",
      body: { schema },
    });

    const committed = await executeOperation<OperationInvocationResponse>({
      actor: authenticatedOperationActor(),
      method: "POST",
      path: "/operations/task/clearCompletedTasks",
      body: { idempotencyKey: "authenticated-command-clear-completed" },
    });
    const output = committed.body.result.body.output;

    if (output.type !== "command") {
      throw new Error("Expected command operation output.");
    }

    const change = output.changes.find(
      (candidate) => candidate.recordId === createdOutput.record.id,
    );

    expect(committed.response.status).toBe(200);
    expect(committed.body.result.body.invocation.actor).toEqual(authenticatedOperationActor());
    expect(change).toMatchObject({
      payload: {
        values: {
          title: "Authenticated command completed",
        },
      },
    });
    expect(change?.payload.values).not.toHaveProperty("done");
  });

  it("commits transition-state command operations through operation invocation", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const schema = schemaWithTransitionCommandOperation(bootstrap.body.result.body.schema);

    await executeOperation({
      method: "POST",
      path: "/schema",
      body: { schema },
    });

    const created = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/create",
      body: {
        idempotencyKey: "transition-command-task",
        input: {
          title: "Transition command task",
          done: false,
        },
      },
    });
    const createdOutput = created.body.result.body.output;

    if (createdOutput.type !== "create") {
      throw new Error("Expected create operation output.");
    }

    const committed = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/startTask",
      body: {
        idempotencyKey: "transition-command-start",
        recordId: createdOutput.record.id,
      },
    });
    const output = committed.body.result.body.output;
    const receivedAt = committed.body.result.body.invocation.receivedAt;
    const rows = await readOperationInvocations();
    const transitionRow = rows.find((row) => row.operationKey === "task.startTask");

    if (output.type !== "command") {
      throw new Error("Expected command operation output.");
    }

    expect(committed.response.status).toBe(200);
    expect(committed.body.writes.map((write) => write.kind)).toEqual(["committed"]);
    expect(output.affectedChangeIds).toEqual(output.changes.map((change) => String(change.seq)));
    expect(output.changes.map((change) => change.entity)).toEqual(["task", "task-event"]);
    expect(output.changes[0]).toMatchObject({
      entity: "task",
      operationKind: "command",
      payload: {
        id: createdOutput.record.id,
        updatedAt: receivedAt,
        values: {
          status: "doing",
        },
      },
    });
    expect(output.changes[1]).toMatchObject({
      entity: "task-event",
      operationKind: "command",
      payload: {
        createdAt: receivedAt,
        updatedAt: receivedAt,
        values: {
          actorMode: "owner",
          nextState: "doing",
          occurredAt: receivedAt.slice(0, 10),
          previousState: "todo",
          sourceEntity: "task",
          sourceRecordId: createdOutput.record.id,
          transitionKey: "start",
        },
      },
    });
    expect(transitionRow).toMatchObject({
      affectedChangeIds: output.affectedChangeIds,
      operationKey: "task.startTask",
      operationKind: "command",
      output,
      status: "committed",
    });
  });

  it("commits generated transition dates from receivedAt and replays stored values", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const schema = schemaWithTransitionTargetValues(bootstrap.body.result.body.schema);

    await executeOperation({
      method: "POST",
      path: "/schema",
      body: { schema },
    });
    const created = await createTaskForTransition("transition-date-task", {
      title: "Issue ready for work",
      done: false,
    });
    const createdOutput = created.body.result.body.output;

    if (createdOutput.type !== "create") {
      throw new Error("Expected create operation output.");
    }

    const body = {
      idempotencyKey: "transition-date-start",
      recordId: createdOutput.record.id,
    };
    const committed = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/startTask",
      body,
    });
    const replayed = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/startTask",
      body,
    });
    const output = committed.body.result.body.output;
    const receivedAt = committed.body.result.body.invocation.receivedAt;

    if (output.type !== "command") {
      throw new Error("Expected command operation output.");
    }

    expect(committed.body.writes.map((write) => write.kind)).toEqual(["committed"]);
    expect(output.changes.filter((change) => change.entity === "task")).toHaveLength(1);
    expect(output.changes[0]).toMatchObject({
      entity: "task",
      recordId: createdOutput.record.id,
      payload: {
        values: {
          status: "doing",
          startedOn: calendarDateInTimeZone(receivedAt, "Australia/Sydney"),
          reportingDate: calendarDateInTimeZone(receivedAt, "America/Los_Angeles"),
        },
      },
    });
    expect(replayed.body.writes.map((write) => write.kind)).toEqual(["replay"]);
    expect(replayed.body.result.body.status).toBe("replayed");
    expect(replayed.body.result.body.output).toEqual(output);
  });

  it("atomically commits transition side-effect creates and replays their record metadata", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const schema = schemaWithTransitionSideEffects(bootstrap.body.result.body.schema);

    await executeOperation({
      method: "POST",
      path: "/schema",
      body: { schema },
    });
    const created = await createTaskForTransition("side-effect-success", {
      title: "Accepted intake",
      done: false,
    });
    const createdOutput = created.body.result.body.output;

    if (createdOutput.type !== "create") {
      throw new Error("Expected create operation output.");
    }

    const baseline = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const body = {
      idempotencyKey: "transition-side-effect-success",
      recordId: createdOutput.record.id,
      input: { note: "Reviewed by staff" },
      source: {
        protocol: "generated-ui",
        surface: "taskDetail",
      },
    };
    const committed = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/startTask",
      body,
    });
    const replayed = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/startTask",
      body,
    });
    const output = committed.body.result.body.output;
    const sync = await executeOperation<SyncResponse>({
      method: "GET",
      path: "/sync",
      search: `after=${baseline.body.result.body.cursor}&schemaUpdatedAt=${encodeURIComponent(baseline.body.result.body.schemaUpdatedAt)}`,
    });

    if (output.type !== "command") {
      throw new Error("Expected command operation output.");
    }

    const orderChange = output.changes[2];
    const receiptChange = output.changes[3];

    expect(committed.body.writes.map((write) => write.kind)).toEqual(["committed"]);
    expect(output.changes.map((change) => change.entity)).toEqual([
      "task",
      "task-event",
      "order",
      "order-receipt",
    ]);
    expect(sync.body.result.body.changes).toEqual(
      output.changes.filter((change) => change.entity === "task"),
    );
    expect(orderChange?.payload).toMatchObject({
      entity: "order",
      values: {
        task: createdOutput.record.id,
        sourceTaskId: createdOutput.record.id,
        title: "Accepted intake",
        note: "Reviewed by staff",
        actorMode: "owner",
        sourcePath: "/operations/task/startTask",
        code: expect.stringMatching(/^ORD-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/),
        occurredAt: committed.body.result.body.invocation.receivedAt,
      },
    });
    expect(orderChange?.payload.values).not.toHaveProperty("details");
    expect(orderChange?.payload.values).not.toHaveProperty("actorPrincipalId");
    expect(receiptChange?.payload).toMatchObject({
      entity: "order-receipt",
      values: {
        order: orderChange?.recordId,
        label: "Accepted intake",
      },
    });
    expect(output.recordPlan?.steps).toEqual([
      {
        name: "createOrder",
        kind: "create",
        entity: "order",
        recordId: orderChange?.recordId,
        changeId: String(orderChange?.seq),
      },
      {
        name: "createReceipt",
        kind: "create",
        entity: "order-receipt",
        recordId: receiptChange?.recordId,
        changeId: String(receiptChange?.seq),
      },
    ]);
    expect(replayed.body.writes.map((write) => write.kind)).toEqual(["replay"]);
    expect(replayed.body.result.body.status).toBe("replayed");
    expect(replayed.body.result.body.output).toEqual(output);

    const transitionRow = (await readOperationInvocations()).find(
      (row) => row.operationKey === "task.startTask",
    );
    expect(transitionRow).toMatchObject({
      affectedChangeIds: output.affectedChangeIds,
      output,
      status: "replayed",
    });
    expect(transitionRow?.statusHistory.map((entry) => entry.status)).toEqual([
      "accepted",
      "committed",
      "replayed",
    ]);
  });

  it("rolls back transition, event, and side effects when side-effect validation fails", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const schema = schemaWithTransitionTargetValues(bootstrap.body.result.body.schema, {
      sideEffects: invalidReferenceTransitionSideEffects(),
    });

    await executeOperation({
      method: "POST",
      path: "/schema",
      body: { schema },
    });
    const created = await createTaskForTransition("side-effect-reference-failure", {
      title: "Rejected intake",
      done: false,
    });
    const createdOutput = created.body.result.body.output;

    if (createdOutput.type !== "create") {
      throw new Error("Expected create operation output.");
    }

    const baseline = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const failed = await executeOperationFailure({
      method: "POST",
      path: "/operations/task/startTask",
      body: {
        idempotencyKey: "transition-side-effect-reference-failure",
        recordId: createdOutput.record.id,
      },
    });
    const after = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const sync = await executeOperation<SyncResponse>({
      method: "GET",
      path: "/sync",
      search: `after=${baseline.body.result.body.cursor}&schemaUpdatedAt=${encodeURIComponent(baseline.body.result.body.schemaUpdatedAt)}`,
    });

    expect(failed.response.status).toBe(400);
    expect(failed.body.error).toBe('Field "task" references unknown task record "missing-task".');
    expect(failed.body.writes).toEqual([]);
    expect(sync.body.result.body.changes).toEqual([]);
    const targetRecord = after.body.result.body.records.find(
      (record) => record.id === createdOutput.record.id,
    );
    expect(targetRecord?.values).toMatchObject({ status: "todo" });
    expect(targetRecord?.values).not.toHaveProperty("startedOn");
    expect(targetRecord?.values).not.toHaveProperty("reportingDate");
    expect(
      after.body.result.body.records.filter((record) =>
        ["task-event", "order", "order-receipt"].includes(record.entity),
      ),
    ).toEqual([]);
  });

  it("rejects missing, tombstoned, invalid-state, and stale transition targets without side effects", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const schema = schemaWithTransitionTargetValues(bootstrap.body.result.body.schema, {
      sideEffects: successfulTransitionSideEffects(),
    });

    await executeOperation({
      method: "POST",
      path: "/schema",
      body: { schema },
    });

    const missing = await executeOperationFailure({
      method: "POST",
      path: "/operations/task/startTask",
      body: {
        idempotencyKey: "transition-side-effect-missing",
        recordId: "missing-task",
      },
    });
    const tombstoned = await createTaskForTransition("side-effect-tombstoned", {
      title: "Tombstoned intake",
      done: false,
    });
    const tombstonedOutput = tombstoned.body.result.body.output;

    if (tombstonedOutput.type !== "create") {
      throw new Error("Expected create operation output.");
    }

    await executeOperation({
      method: "POST",
      path: "/operations/task/delete",
      body: {
        idempotencyKey: "delete-side-effect-tombstoned",
        recordId: tombstonedOutput.record.id,
      },
    });
    const tombstoneFailure = await executeOperationFailure({
      method: "POST",
      path: "/operations/task/startTask",
      body: {
        idempotencyKey: "transition-side-effect-tombstoned",
        recordId: tombstonedOutput.record.id,
      },
    });
    const transitioned = await createTaskForTransition("side-effect-invalid-state", {
      title: "Already transitioned",
      done: false,
    });
    const transitionedOutput = transitioned.body.result.body.output;

    if (transitionedOutput.type !== "create") {
      throw new Error("Expected create operation output.");
    }

    await executeOperation({
      method: "POST",
      path: "/operations/task/startTask",
      body: {
        idempotencyKey: "transition-side-effect-first-transition",
        recordId: transitionedOutput.record.id,
      },
    });
    const invalidBaseline = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const invalidState = await executeOperationFailure({
      method: "POST",
      path: "/operations/task/startTask",
      body: {
        idempotencyKey: "transition-side-effect-invalid-state",
        recordId: transitionedOutput.record.id,
      },
    });
    const invalidSync = await executeOperation<SyncResponse>({
      method: "GET",
      path: "/sync",
      search: `after=${invalidBaseline.body.result.body.cursor}&schemaUpdatedAt=${encodeURIComponent(invalidBaseline.body.result.body.schemaUpdatedAt)}`,
    });
    const stale = await createTaskForTransition("side-effect-stale", {
      title: "Stale intake",
      done: false,
    });
    const staleOutput = stale.body.result.body.output;

    if (staleOutput.type !== "create") {
      throw new Error("Expected create operation output.");
    }

    const staleBaseline = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const staleFailure = await executeOperationFailure({
      method: "POST",
      path: "/operations/task/startTask",
      beforeWriteRecordValues: {
        recordId: staleOutput.record.id,
        values: {
          ...staleOutput.record.values,
          title: "Changed before commit",
        },
      },
      body: {
        idempotencyKey: "transition-side-effect-stale",
        recordId: staleOutput.record.id,
      },
    });
    const staleSync = await executeOperation<SyncResponse>({
      method: "GET",
      path: "/sync",
      search: `after=${staleBaseline.body.result.body.cursor}&schemaUpdatedAt=${encodeURIComponent(staleBaseline.body.result.body.schemaUpdatedAt)}`,
    });
    const staleAfter = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const staleRecord = staleAfter.body.result.body.records.find(
      (record) => record.id === staleOutput.record.id,
    );

    expect(missing.body.error).toContain('references unknown task record "missing-task"');
    expect(tombstoneFailure.body.error).toContain("cannot transition tombstoned task record");
    expect(invalidState.body.error).toContain("cannot transition record");
    expect(invalidSync.body.result.body.changes).toEqual([]);
    expect(staleFailure.body.error).toContain("changed before commit");
    expect(staleFailure.body.writes).toEqual([]);
    expect(staleSync.body.result.body.changes).toEqual([]);
    expect(staleRecord?.values).not.toHaveProperty("startedOn");
    expect(staleRecord?.values).not.toHaveProperty("reportingDate");
  });

  it("keeps a unique target reference as an independent transition duplicate guard", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const schema = schemaWithTransitionSideEffects(bootstrap.body.result.body.schema);

    await executeOperation({
      method: "POST",
      path: "/schema",
      body: { schema },
    });
    const created = await createTaskForTransition("side-effect-duplicate-target", {
      title: "Duplicate intake",
      done: false,
    });
    const createdOutput = created.body.result.body.output;

    if (createdOutput.type !== "create") {
      throw new Error("Expected create operation output.");
    }

    await createOrderForTransition("existing-order", {
      task: createdOutput.record.id,
      sourceTaskId: createdOutput.record.id,
      title: "Existing order",
      code: "EXISTING",
      actorMode: "owner",
      occurredAt: "2026-07-27T00:00:00.000Z",
    });
    const baseline = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const failed = await executeOperationFailure({
      method: "POST",
      path: "/operations/task/startTask",
      body: {
        idempotencyKey: "transition-side-effect-duplicate-target",
        recordId: createdOutput.record.id,
      },
    });
    const sync = await executeOperation<SyncResponse>({
      method: "GET",
      path: "/sync",
      search: `after=${baseline.body.result.body.cursor}&schemaUpdatedAt=${encodeURIComponent(baseline.body.result.body.schemaUpdatedAt)}`,
    });

    expect(failed.body.error).toBe('Unique constraint "order.uniqueTask" would be violated.');
    expect(failed.body.writes).toEqual([]);
    expect(sync.body.result.body.changes).toEqual([]);
  });

  it("exhausts bounded generated-code retries before committing the transition", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const schema = schemaWithTransitionSideEffects(
      bootstrap.body.result.body.schema,
      generatedDigitCodeTransitionSideEffects(),
      {
        orderConstraints: [{ kind: "unique", fields: ["code"], key: "uniqueCode" }],
      },
    );
    await executeOperation({
      method: "POST",
      path: "/schema",
      body: { schema },
    });
    const target = await createTaskForTransition("side-effect-code-target", {
      title: "Code collision intake",
      done: false,
    });
    const targetOutput = target.body.result.body.output;

    if (targetOutput.type !== "create") {
      throw new Error("Expected create operation output.");
    }

    for (let code = 0; code < 10; code += 1) {
      await createOrderForTransition(`code-${code}`, {
        task: targetOutput.record.id,
        sourceTaskId: targetOutput.record.id,
        title: `Existing code ${code}`,
        code: String(code),
        actorMode: "owner",
        occurredAt: "2026-07-27T00:00:00.000Z",
      });
    }

    const baseline = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const failed = await executeOperationFailure({
      method: "POST",
      path: "/operations/task/startTask",
      body: {
        idempotencyKey: "transition-side-effect-code-exhaustion",
        recordId: targetOutput.record.id,
      },
    });
    const sync = await executeOperation<SyncResponse>({
      method: "GET",
      path: "/sync",
      search: `after=${baseline.body.result.body.cursor}&schemaUpdatedAt=${encodeURIComponent(baseline.body.result.body.schemaUpdatedAt)}`,
    });

    expect(failed.body.error).toBe(
      'Record plan step "createOrder" generated code collided after 32 attempts: Unique constraint "order.uniqueCode" would be violated.',
    );
    expect(failed.body.writes).toEqual([]);
    expect(sync.body.result.body.changes).toEqual([]);
  });

  it("rejects invalid operation handler input shape before command materialization", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const schema = schemaWithTransitionCommandOperation(bootstrap.body.result.body.schema);
    const beforeCursor = bootstrap.body.result.body.cursor;
    const schemaUpdatedAt = bootstrap.body.result.body.schemaUpdatedAt;

    await executeOperation({
      method: "POST",
      path: "/schema",
      body: { schema },
    });

    const rejected = await executeOperationFailure({
      method: "POST",
      path: "/operations/task/startTask",
      body: {
        idempotencyKey: "transition-command-invalid-shape",
        input: { recordId: "" },
      },
    });
    const sync = await executeOperation<SyncResponse>({
      method: "GET",
      path: "/sync",
      search: `after=${beforeCursor}&schemaUpdatedAt=${encodeURIComponent(schemaUpdatedAt)}`,
    });
    const rows = await readOperationInvocations();

    expect(rejected.response.status).toBe(400);
    expect(rejected.body).toEqual({
      error: 'Operation "task.startTask" input recordId must be non-empty.',
      writes: [],
    });
    expect(sync.body.result.body.changes).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      affectedChangeIds: [],
      errorMessage: 'Operation "task.startTask" input recordId must be non-empty.',
      operationKey: "task.startTask",
      status: "failed",
    });
  });

  it("creates, replays, and intentionally repeats the declared Site starter graph", async () => {
    const firstBody = {
      idempotencyKey: "site-starter-first",
      source: {
        protocol: "generated-ui",
        surface: "siteEditor",
      },
    };
    const first = await executeOperation<OperationInvocationResponse>({
      schemaFixture: "program",
      method: "POST",
      path: "/operations/site/createStarter",
      body: firstBody,
    });
    const replay = await executeOperation<OperationInvocationResponse>({
      schemaFixture: "program",
      method: "POST",
      path: "/operations/site/createStarter",
      body: firstBody,
    });
    const second = await executeOperation<OperationInvocationResponse>({
      schemaFixture: "program",
      method: "POST",
      path: "/operations/site/createStarter",
      body: {
        ...firstBody,
        idempotencyKey: "site-starter-second",
      },
    });
    const snapshot = await executeOperation<StorageSnapshot>({
      schemaFixture: "program",
      method: "GET",
      path: "/snapshot",
    });
    const firstOutput = first.body.result.body.output;
    const secondOutput = second.body.result.body.output;

    if (firstOutput.type !== "command" || secondOutput.type !== "command") {
      throw new Error("Expected Site starter command output.");
    }

    const firstSteps = new Map(
      firstOutput.recordPlan?.steps.map((step) => [step.name, step] as const),
    );
    const secondSteps = new Map(
      secondOutput.recordPlan?.steps.map((step) => [step.name, step] as const),
    );
    const firstSiteId = firstSteps.get("createSite")?.recordId;
    const secondSiteId = secondSteps.get("createSite")?.recordId;

    if (firstSiteId === undefined || secondSiteId === undefined) {
      throw new Error("Expected created Site step output.");
    }

    const records = snapshot.body.result.body.records.filter(({ entity }) =>
      ["site", "block", "block-placement"].includes(entity),
    );
    const recordsById = new Map(records.map((record) => [record.id, record] as const));
    const firstSite = recordsById.get(firstSiteId);
    const firstRecord = (stepName: string) => {
      const recordId = firstSteps.get(stepName)?.recordId;
      const record = recordId === undefined ? undefined : recordsById.get(recordId);

      if (record === undefined) {
        throw new Error(`Expected Site starter record for step ${stepName}.`);
      }

      return record;
    };

    expect(first.body.writes.map((write) => write.kind)).toEqual(["committed"]);
    expect(replay.body.writes.map((write) => write.kind)).toEqual(["replay"]);
    expect(replay.body.result.body.status).toBe("replayed");
    expect(replay.body.result.body.output).toEqual(firstOutput);
    expect(second.body.writes.map((write) => write.kind)).toEqual(["committed"]);
    expect(firstOutput.recordPlan?.steps.map(({ name }) => name)).toEqual([
      "createSite",
      "createHomePage",
      "createHeader",
      "createHeaderPrimary",
      "createFooter",
      "createFooterSection",
      "createHeaderHomeLink",
      "createFooterHomeLink",
      "createWelcomeHero",
      "createAboutMarkdown",
      "placeHeaderPrimary",
      "placeHeaderHomeLink",
      "placeFooterSection",
      "placeFooterHomeLink",
      "placeWelcomeHero",
      "placeAboutMarkdown",
      "assignSiteRoots",
    ]);
    expect(firstOutput.recordPlan?.steps.map(({ changeId }) => changeId)).toEqual(
      firstOutput.affectedChangeIds,
    );
    expect(firstOutput.changes).toContainEqual(
      expect.objectContaining({
        entity: "site",
        recordId: firstSiteId,
        payload: expect.objectContaining({
          id: firstSiteId,
          entity: "site",
          values: expect.objectContaining({ label: "Untitled site" }),
        }),
      }),
    );
    expect(firstSite).toMatchObject({
      id: firstSiteId,
      entity: "site",
      values: {
        key: expect.stringMatching(/^site-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$/),
        label: "Untitled site",
        initialThemeMode: "system",
        themeSwitchable: true,
        home: firstSteps.get("createHomePage")?.recordId,
        header: firstSteps.get("createHeader")?.recordId,
        footer: firstSteps.get("createFooter")?.recordId,
      },
    });
    expect(firstSite?.values).not.toHaveProperty("starterVersion");
    expect(firstSite?.values).not.toHaveProperty("starterProvenance");

    expect(firstRecord("createHomePage").values).toMatchObject({
      site: firstSiteId,
      type: "page",
      label: "Home",
      href: "/",
    });
    expect(firstRecord("createHeader").values).toMatchObject({
      site: firstSiteId,
      type: "header",
      label: "Header",
    });
    expect(firstRecord("createHeaderPrimary").values).toMatchObject({
      site: firstSiteId,
      type: "headerPrimary",
      label: "Header primary",
    });
    expect(firstRecord("createFooter").values).toMatchObject({
      site: firstSiteId,
      type: "footer",
      label: "Footer",
    });
    expect(firstRecord("createFooterSection").values).toMatchObject({
      site: firstSiteId,
      type: "footerSection",
      label: "Footer section",
    });
    expect(firstRecord("createHeaderHomeLink").values).toMatchObject({
      site: firstSiteId,
      type: "link",
      label: "Home",
      linkTargetMode: "internal",
      linkTargetBlock: firstSteps.get("createHomePage")?.recordId,
    });
    expect(firstRecord("createFooterHomeLink").values).toMatchObject({
      site: firstSiteId,
      type: "link",
      label: "Home",
      linkTargetMode: "internal",
      linkTargetBlock: firstSteps.get("createHomePage")?.recordId,
    });
    expect(firstRecord("createWelcomeHero").values).toMatchObject({
      site: firstSiteId,
      type: "hero",
      label: "Welcome",
      body: "Welcome to your new site.",
    });
    expect(firstRecord("createAboutMarkdown").values).toMatchObject({
      site: firstSiteId,
      type: "markdown",
      label: "About",
      body: "Add a short introduction to your site.",
    });
    expect(firstRecord("placeHeaderPrimary").values).toEqual({
      parent: firstSteps.get("createHeader")?.recordId,
      block: firstSteps.get("createHeaderPrimary")?.recordId,
      order: 1000,
    });
    expect(firstRecord("placeHeaderHomeLink").values).toEqual({
      parent: firstSteps.get("createHeaderPrimary")?.recordId,
      block: firstSteps.get("createHeaderHomeLink")?.recordId,
      order: 1000,
    });
    expect(firstRecord("placeFooterSection").values).toEqual({
      parent: firstSteps.get("createFooter")?.recordId,
      block: firstSteps.get("createFooterSection")?.recordId,
      order: 1000,
    });
    expect(firstRecord("placeFooterHomeLink").values).toEqual({
      parent: firstSteps.get("createFooterSection")?.recordId,
      block: firstSteps.get("createFooterHomeLink")?.recordId,
      order: 1000,
    });
    expect(firstRecord("placeWelcomeHero").values).toEqual({
      parent: firstSteps.get("createHomePage")?.recordId,
      block: firstSteps.get("createWelcomeHero")?.recordId,
      order: 1000,
    });
    expect(firstRecord("placeAboutMarkdown").values).toEqual({
      parent: firstSteps.get("createHomePage")?.recordId,
      block: firstSteps.get("createAboutMarkdown")?.recordId,
      order: 2000,
    });
    expect(firstSiteId).not.toBe(secondSiteId);
    expect(firstSteps.get("createHomePage")?.recordId).not.toBe(
      secondSteps.get("createHomePage")?.recordId,
    );
    expect(records.filter(({ entity }) => entity === "site")).toHaveLength(2);
    expect(records.filter(({ entity }) => entity === "block")).toHaveLength(18);
    expect(records.filter(({ entity }) => entity === "block-placement")).toHaveLength(12);
  });

  it("rolls back the complete Site starter when the final roots violate an invariant", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      schemaFixture: "program",
      method: "GET",
      path: "/bootstrap",
    });
    const schema = cloneSchema(bootstrap.body.result.body.schema);
    const site = requireEntity(schema, "site");
    const createStarter = site.operations?.find(({ key }) => key === "createStarter");
    const createStarterEffect = createStarter?.effect;

    if (createStarterEffect?.type !== "recordPlan") {
      throw new Error("Expected Site starter record plan.");
    }

    setKeyedDefinition(schema.entities, "site", {
      ...site,
      operations: site.operations?.map((operation) =>
        operation.key !== "createStarter"
          ? operation
          : {
              ...operation,
              effect: {
                type: "recordPlan",
                steps: createStarterEffect.steps.map((step) =>
                  step.name !== "assignSiteRoots" || step.kind !== "patch"
                    ? step
                    : {
                        ...step,
                        values: {
                          ...step.values,
                          home: {
                            kind: "reference",
                            entity: "block",
                            id: {
                              kind: "stepOutput",
                              step: "createHeader",
                              output: "id",
                            },
                          },
                        },
                      },
                ),
              },
            },
      ),
    });
    await executeOperation({
      schemaFixture: "program",
      method: "POST",
      path: "/schema",
      body: { schema },
    });
    const baseline = await executeOperation<BootstrapResponse>({
      schemaFixture: "program",
      method: "GET",
      path: "/bootstrap",
    });
    const failed = await executeOperationFailure({
      schemaFixture: "program",
      method: "POST",
      path: "/operations/site/createStarter",
      body: {
        idempotencyKey: "site-starter-invalid-root",
        source: {
          protocol: "generated-ui",
          surface: "siteEditor",
        },
      },
    });
    const sync = await executeOperation<SyncResponse>({
      schemaFixture: "program",
      method: "GET",
      path: "/sync",
      search: `after=${baseline.body.result.body.cursor}&schemaUpdatedAt=${encodeURIComponent(baseline.body.result.body.schemaUpdatedAt)}`,
    });
    const snapshot = await executeOperation<StorageSnapshot>({
      schemaFixture: "program",
      method: "GET",
      path: "/snapshot",
    });
    const rows = await readOperationInvocations();

    expect(failed.response.status).toBe(500);
    expect(failed.body.error).toContain("home must reference an owned page block");
    expect(failed.body.writes).toEqual([]);
    expect(sync.body.result.body.changes).toEqual([]);
    expect(
      snapshot.body.result.body.records.filter(({ entity }) =>
        ["site", "block", "block-placement"].includes(entity),
      ),
    ).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      affectedChangeIds: [],
      operationKey: "site.createStarter",
      status: "failed",
    });
  });

  it("materializes record-plan command operations through operation writes", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const schema = schemaWithRecordPlanOperation(
      bootstrap.body.result.body.schema,
      "submitPlan",
      successfulRecordPlanSteps(),
    );

    await executeOperation({
      method: "POST",
      path: "/schema",
      body: { schema },
    });
    const baseline = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });

    const committed = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/submitPlan",
      publicOperation: {
        idempotencyKey: "record-plan-success",
        input: {
          title: "Record-plan task",
          note: "Created by plan",
        },
        source: {
          host: "tasks.example.com",
          path: "/api/tasks/public/operations/task/submitPlan",
          siteBlockId: "rec_site_public_plan",
        },
        turnstileToken: "record-plan-proof-token",
      },
    });
    const output = committed.body.result.body.output;
    const rows = await readOperationInvocations();
    const sync = await executeOperation<SyncResponse>({
      method: "GET",
      path: "/sync",
      search: `after=${baseline.body.result.body.cursor}&schemaUpdatedAt=${encodeURIComponent(baseline.body.result.body.schemaUpdatedAt)}`,
    });

    if (output.type !== "command") {
      throw new Error("Expected command operation output.");
    }

    const logStep = output.recordPlan?.steps.find((step) => step.entity === "task-log");

    expect(committed.response.status).toBe(200);
    expect(committed.body.writes.map((write) => write.kind)).toEqual(["committed"]);
    expect(sync.body.result.body.changes.map((change) => String(change.seq))).toEqual(
      output.affectedChangeIds.filter((changeId) => changeId !== logStep?.changeId),
    );
    expect(output.changes).toEqual([]);
    expect(sync.body.result.body.changes.map((change) => change.entity)).toEqual(["task", "task"]);
    expect(output).not.toHaveProperty("actionId");
    expect(output).not.toHaveProperty("response");
    expect(output).toMatchObject({
      recordPlan: {
        steps: [
          { name: "createTask", kind: "create", entity: "task" },
          { name: "createLog", kind: "create", entity: "task-log" },
          { name: "touchTask", kind: "patch", entity: "task" },
        ],
      },
    });

    const taskId = output.recordPlan?.steps[0]?.recordId;
    const receivedAt = committed.body.result.body.invocation.receivedAt;

    expect(taskId).toMatch(/^task_/);
    expect(logStep).toMatchObject({
      name: "createLog",
      kind: "create",
      entity: "task-log",
      changeId: expect.any(String),
      recordId: expect.any(String),
    });
    expect(sync.body.result.body.changes.map((change) => change.createdAt)).toEqual([
      receivedAt,
      receivedAt,
    ]);
    expect(output.recordPlan?.steps.map((step) => step.changeId)).toEqual(output.affectedChangeIds);
    expect(sync.body.result.body.changes[0]?.payload).toMatchObject({
      id: taskId,
      entity: "task",
      createdAt: receivedAt,
      updatedAt: receivedAt,
      values: {
        title: "Record-plan task",
        done: false,
        priority: "normal",
      },
    });
    expect(sync.body.result.body.changes[1]?.payload).toMatchObject({
      id: taskId,
      entity: "task",
      updatedAt: receivedAt,
      values: {
        title: "Record-plan task",
      },
    });
    expect(rows).toContainEqual(
      expect.objectContaining({
        affectedChangeIds: output.affectedChangeIds,
        operationKey: "task.submitPlan",
        operationKind: "command",
        output,
        source: {
          host: "tasks.example.com",
          path: "/api/tasks/public/operations/task/submitPlan",
          protocol: "public",
          siteBlockId: "rec_site_public_plan",
        },
        status: "committed",
      }),
    );
    expect(JSON.stringify(rows)).not.toContain("record-plan-proof-token");
  });

  it("rejects record-plan validation failures without partial writes", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const schema = schemaWithRecordPlanOperation(
      bootstrap.body.result.body.schema,
      "submitBrokenPlan",
      brokenRecordPlanSteps(),
    );
    const beforeCursor = bootstrap.body.result.body.cursor;
    const schemaUpdatedAt = bootstrap.body.result.body.schemaUpdatedAt;

    await executeOperation({
      method: "POST",
      path: "/schema",
      body: { schema },
    });

    const failed = await executeOperationFailure({
      method: "POST",
      path: "/operations/task/submitBrokenPlan",
      publicOperation: {
        idempotencyKey: "record-plan-broken",
        input: {
          title: "Should roll back",
          note: "Invalid reference",
        },
        source: {
          host: "tasks.example.com",
          path: "/api/tasks/public/operations/task/submitBrokenPlan",
        },
        turnstileToken: "broken-record-plan-proof-token",
      },
    });
    const sync = await executeOperation<SyncResponse>({
      method: "GET",
      path: "/sync",
      search: `after=${beforeCursor}&schemaUpdatedAt=${encodeURIComponent(schemaUpdatedAt)}`,
    });
    const snapshot = await executeOperation<StorageSnapshot>({
      method: "GET",
      path: "/snapshot",
    });
    const rows = await readOperationInvocations();

    expect(failed.response.status).toBe(400);
    expect(failed.body).toEqual({
      error: 'Field "task" references unknown task record "missing-task".',
      writes: [],
    });
    expect(sync.body.result.body.changes).toEqual([]);
    expect(snapshot.body.result.body.records).not.toContainEqual(
      expect.objectContaining({
        values: expect.objectContaining({ title: "Should roll back" }),
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      affectedChangeIds: [],
      errorMessage: 'Field "task" references unknown task record "missing-task".',
      operationKey: "task.submitBrokenPlan",
      source: {
        host: "tasks.example.com",
        path: "/api/tasks/public/operations/task/submitBrokenPlan",
        protocol: "public",
      },
      status: "failed",
    });
    expect(JSON.stringify(rows)).not.toContain("broken-record-plan-proof-token");
  });

  it("rejects identity reference writes when target lookup is unavailable", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const schema = schemaWithOperationOnlyTaskIdentityReference(bootstrap.body.result.body.schema);

    await executeOperation({
      method: "POST",
      path: "/schema",
      body: { schema },
    });

    const failed = await executeOperationFailure({
      method: "POST",
      path: "/operations/task/create",
      body: {
        idempotencyKey: "identity-reference-unavailable",
        input: {
          title: "Needs principal",
          ownerPrincipal: "principal:missing",
        },
      },
    });

    expect(failed.response.status).toBe(400);
    expect(failed.body).toEqual({
      error: 'Identity reference validation is unavailable for field "ownerPrincipal".',
      writes: [],
    });
  });

  it("replays record-plan command operations without duplicate writes", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const schema = schemaWithRecordPlanOperation(
      bootstrap.body.result.body.schema,
      "submitReplayPlan",
      successfulRecordPlanSteps(),
    );
    const beforeCursor = bootstrap.body.result.body.cursor;
    const schemaUpdatedAt = bootstrap.body.result.body.schemaUpdatedAt;
    const publicOperation = {
      idempotencyKey: "record-plan-replay",
      input: {
        title: "Replay record-plan task",
        note: "Replay note",
      },
      source: {
        host: "tasks.example.com",
        path: "/api/tasks/public/operations/task/submitReplayPlan",
      },
      turnstileToken: "record-plan-replay-proof-token",
    };

    await executeOperation({
      method: "POST",
      path: "/schema",
      body: { schema },
    });

    const first = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/submitReplayPlan",
      publicOperation,
    });
    const replay = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/submitReplayPlan",
      publicOperation: {
        ...publicOperation,
        turnstileToken: "record-plan-replay-second-proof-token",
      },
    });
    const rows = await readOperationInvocations();
    const sync = await executeOperation<SyncResponse>({
      method: "GET",
      path: "/sync",
      search: `after=${beforeCursor}&schemaUpdatedAt=${encodeURIComponent(schemaUpdatedAt)}`,
    });

    expect(first.body.writes.map((write) => write.kind)).toEqual(["committed"]);
    expect(replay.body.writes).toEqual([]);
    expect(replay.body.result.body.status).toBe("replayed");
    expect(replay.body.result.body.output).toEqual(first.body.result.body.output);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.statusHistory.map((entry) => entry.status)).toEqual([
      "accepted",
      "committed",
      "replayed",
    ]);

    if (first.body.result.body.output.type !== "command") {
      throw new Error("Expected command operation output.");
    }

    const replayLogStep = first.body.result.body.output.recordPlan?.steps.find(
      (step) => step.entity === "task-log",
    );

    expect(first.body.result.body.output.changes).toEqual([]);
    expect(sync.body.result.body.changes.map((change) => String(change.seq))).toEqual(
      first.body.result.body.output.affectedChangeIds.filter(
        (changeId) => changeId !== replayLogStep?.changeId,
      ),
    );
    expect(JSON.stringify(rows)).not.toContain("record-plan-replay-proof-token");
    expect(JSON.stringify(rows)).not.toContain("record-plan-replay-second-proof-token");
  });

  it("materializes record-scoped related records, replays success, and treats a new key as a new invocation", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const schema = schemaWithTargetAwareRecordPlanOperation(bootstrap.body.result.body.schema);

    await executeOperation({
      method: "POST",
      path: "/schema",
      body: { schema },
    });
    const target = await createTaskForTransition("target-plan-source", {
      title: "Original target title",
      done: false,
    });
    const targetOutput = target.body.result.body.output;

    if (targetOutput.type !== "create") {
      throw new Error("Expected create operation output.");
    }

    const firstBody = {
      idempotencyKey: "target-plan-first",
      recordId: targetOutput.record.id,
    };
    const first = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/createTargetLog",
      body: firstBody,
    });
    await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/update",
      body: {
        idempotencyKey: "target-plan-update-source",
        recordId: targetOutput.record.id,
        input: {
          ...targetOutput.record.values,
          title: "Updated target title",
        },
      },
    });
    const replayed = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/createTargetLog",
      body: firstBody,
    });
    const second = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/task/createTargetLog",
      body: {
        idempotencyKey: "target-plan-second",
        recordId: targetOutput.record.id,
      },
    });
    const firstOutput = first.body.result.body.output;
    const secondOutput = second.body.result.body.output;

    if (firstOutput.type !== "command" || secondOutput.type !== "command") {
      throw new Error("Expected command operation output.");
    }

    const firstLog = firstOutput.changes[0]?.payload;
    const secondLog = secondOutput.changes[0]?.payload;

    expect(first.body.writes.map((write) => write.kind)).toEqual(["committed"]);
    expect(firstLog).toMatchObject({
      entity: "target-log",
      values: {
        task: targetOutput.record.id,
        sourceTaskId: targetOutput.record.id,
        title: "Original target title",
        code: expect.stringMatching(/^LOG-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/),
      },
    });
    expect(replayed.body.writes.map((write) => write.kind)).toEqual(["replay"]);
    expect(replayed.body.result.body.status).toBe("replayed");
    expect(replayed.body.result.body.output).toEqual(firstOutput);
    expect(second.body.writes.map((write) => write.kind)).toEqual(["committed"]);
    expect(secondLog).toMatchObject({
      entity: "target-log",
      values: {
        task: targetOutput.record.id,
        sourceTaskId: targetOutput.record.id,
        title: "Updated target title",
        code: expect.stringMatching(/^LOG-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/),
      },
    });
    expect(secondLog?.values.code).not.toBe(firstLog?.values.code);
  });

  it("rejects invalid record-scoped record-plan targets before materialization", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const schema = schemaWithTargetAwareRecordPlanOperation(bootstrap.body.result.body.schema);

    await executeOperation({
      method: "POST",
      path: "/schema",
      body: { schema },
    });
    const omitted = await executeOperationFailure({
      method: "POST",
      path: "/operations/task/createTargetLog",
      body: { idempotencyKey: "target-plan-omitted" },
    });
    const missing = await executeOperationFailure({
      method: "POST",
      path: "/operations/task/createTargetLog",
      body: {
        idempotencyKey: "target-plan-missing",
        recordId: "missing-task",
      },
    });
    const project = await executeOperation<OperationInvocationResponse>({
      method: "POST",
      path: "/operations/project/create",
      body: {
        idempotencyKey: "target-plan-project",
        input: { name: "Wrong entity" },
      },
    });
    const projectOutput = project.body.result.body.output;

    if (projectOutput.type !== "create") {
      throw new Error("Expected project create operation output.");
    }

    const wrongEntity = await executeOperationFailure({
      method: "POST",
      path: "/operations/task/createTargetLog",
      body: {
        idempotencyKey: "target-plan-wrong-entity",
        recordId: projectOutput.record.id,
      },
    });
    const tombstoned = await createTaskForTransition("target-plan-tombstoned-source", {
      title: "Tombstoned target",
      done: false,
    });
    const tombstonedOutput = tombstoned.body.result.body.output;

    if (tombstonedOutput.type !== "create") {
      throw new Error("Expected task create operation output.");
    }

    await executeOperation({
      method: "POST",
      path: "/operations/task/delete",
      body: {
        idempotencyKey: "target-plan-delete-target",
        recordId: tombstonedOutput.record.id,
      },
    });
    const deleted = await executeOperationFailure({
      method: "POST",
      path: "/operations/task/createTargetLog",
      body: {
        idempotencyKey: "target-plan-tombstoned",
        recordId: tombstonedOutput.record.id,
      },
    });
    const snapshot = await executeOperation<StorageSnapshot>({
      method: "GET",
      path: "/snapshot",
    });

    expect(omitted.body.error).toBe(
      'Operation "task.createTargetLog" requires a target record id.',
    );
    expect(missing.body.error).toBe(
      'Operation "task.createTargetLog" references unknown task record "missing-task".',
    );
    expect(wrongEntity.body.error).toBe(
      `Operation "task.createTargetLog" target record "${projectOutput.record.id}" must belong to entity "task".`,
    );
    expect(deleted.body.error).toBe(
      `Operation "task.createTargetLog" cannot use tombstoned task record "${tombstonedOutput.record.id}".`,
    );
    expect([omitted, missing, wrongEntity, deleted].flatMap(({ body }) => body.writes)).toEqual([]);
    expect(
      snapshot.body.result.body.records.filter((record) => record.entity === "target-log"),
    ).toEqual([]);
  });

  it("rolls back a record-scoped record plan when its target changes before commit", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const schema = schemaWithTargetAwareRecordPlanOperation(bootstrap.body.result.body.schema);

    await executeOperation({
      method: "POST",
      path: "/schema",
      body: { schema },
    });
    const target = await createTaskForTransition("target-plan-stale-source", {
      title: "Snapshot title",
      done: false,
    });
    const targetOutput = target.body.result.body.output;

    if (targetOutput.type !== "create") {
      throw new Error("Expected task create operation output.");
    }

    const baseline = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const failed = await executeOperationFailure({
      method: "POST",
      path: "/operations/task/createTargetLog",
      beforeWriteRecordValues: {
        recordId: targetOutput.record.id,
        values: {
          ...targetOutput.record.values,
          title: "Changed before commit",
        },
      },
      body: {
        idempotencyKey: "target-plan-stale",
        recordId: targetOutput.record.id,
      },
    });
    const sync = await executeOperation<SyncResponse>({
      method: "GET",
      path: "/sync",
      search: `after=${baseline.body.result.body.cursor}&schemaUpdatedAt=${encodeURIComponent(baseline.body.result.body.schemaUpdatedAt)}`,
    });
    const snapshot = await executeOperation<StorageSnapshot>({
      method: "GET",
      path: "/snapshot",
    });

    expect(failed.body.error).toBe(
      `Operation "task.createTargetLog" target record "${targetOutput.record.id}" changed before commit.`,
    );
    expect(failed.body.writes).toEqual([]);
    expect(sync.body.result.body.changes).toEqual([]);
    expect(
      snapshot.body.result.body.records.filter((record) => record.entity === "target-log"),
    ).toEqual([]);
  });

  it("preserves list and get operation reads without idempotency", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const schema = cloneSchema(bootstrap.body.result.body.schema);
    const taskEntity = schema.entities.find((definition) => definition.key === "task")!;
    const firstTask = bootstrap.body.result.body.records.find((record) => record.entity === "task");
    if (!taskEntity || !firstTask) {
      throw new Error("Expected task test records.");
    }
    setKeyedDefinition(schema.entities, "task", {
      ...taskEntity,
      operations: [
        ...(taskEntity.operations ?? []),
        {
          key: "activeList",
          kind: "list",
          scope: "collection",
          target: { query: "taskActive" },
          output: { type: "list", query: "taskActive" },
          idempotency: { required: false },
          audit: { input: "summary" },
        },
        {
          key: "read",
          kind: "get",
          scope: "record",
          output: { type: "get" },
          idempotency: { required: false },
          audit: { input: "summary" },
        },
      ],
    });
    await executeOperation({
      method: "POST",
      path: "/schema",
      body: { schema },
    });

    const list = await executeOperation<OperationInvocationResponse>({
      method: "GET",
      path: "/operations/task/activeList",
    });
    const get = await executeOperation<OperationInvocationResponse>({
      method: "GET",
      path: "/operations/task/read",
      search: `recordId=${encodeURIComponent(firstTask.id)}`,
    });
    const listOutput = list.body.result.body.output;

    if (listOutput.type !== "list") {
      throw new Error("Expected list operation output.");
    }

    expect(list.body.writes).toEqual([]);
    expect(list.body.result.body).toMatchObject({
      invocation: {
        idempotency: { required: false },
        operation: {
          canonicalKey: "task.activeList",
          kind: "list",
        },
      },
      output: {
        type: "list",
      },
      status: "accepted",
    });
    expect(listOutput.records.every((record) => record.values.done === false)).toBe(true);
    expect(get.body.writes).toEqual([]);
    expect(get.body.result.body).toMatchObject({
      invocation: {
        input: {
          recordId: firstTask.id,
          type: "get",
        },
        operation: {
          canonicalKey: "task.read",
          kind: "get",
        },
      },
      output: {
        record: firstTask,
        type: "get",
      },
      status: "accepted",
    });
  });

  it("executes validated parameterized list queries with fixed filters, caps, and audit rows", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const schema = schemaWithParameterizedTaskLookup(bootstrap.body.result.body.schema);

    await executeOperation({
      method: "POST",
      path: "/schema",
      body: { schema },
    });

    const lookupTasks = [
      {
        idempotencyKey: "lookup-task-code",
        input: {
          title: "Verification code match",
          done: false,
          verificationCode: "CODE-ALPHA",
          reportNumber: "COMMON",
        },
      },
      {
        idempotencyKey: "lookup-task-report",
        input: {
          title: "Report number match",
          done: false,
          verificationCode: "COMMON",
          reportNumber: "REPORT-BETA",
        },
      },
      {
        idempotencyKey: "lookup-task-completed",
        input: {
          title: "Completed lookup match",
          done: true,
          verificationCode: "COMPLETED-ONLY",
          reportNumber: "COMMON",
        },
      },
      {
        idempotencyKey: "lookup-task-cap",
        input: {
          title: "Third active common match",
          done: false,
          verificationCode: "COMMON",
          reportNumber: "REPORT-DELTA",
        },
      },
    ];

    for (const task of lookupTasks) {
      const created = await executeOperation<OperationInvocationResponse>({
        method: "POST",
        path: "/operations/task/create",
        body: task,
      });

      expect(created.response.status).toBe(200);
    }

    const lookup = (value: string, invocationId: string) =>
      executeOperation<OperationInvocationResponse>({
        method: "POST",
        path: "/operations/task/lookup",
        body: {
          input: { lookup: value },
          invocationId,
        },
      });
    const records = (response: Awaited<ReturnType<typeof lookup>>) => {
      const output = response.body.result.body.output;

      if (output.type !== "list") {
        throw new Error("Expected parameterized list operation output.");
      }

      return output.records;
    };
    const byCode = await lookup("CODE-ALPHA", "operation:task.lookup:by-code");
    const byReport = await lookup("REPORT-BETA", "operation:task.lookup:by-report");
    const common = await lookup("COMMON", "operation:task.lookup:common");
    const completedOnly = await lookup("COMPLETED-ONLY", "operation:task.lookup:completed-only");
    const missing = await lookup("MISSING", "operation:task.lookup:missing");
    const invalid = await executeOperationFailure({
      method: "POST",
      path: "/operations/task/lookup",
      body: {
        input: { lookup: 42 },
        invocationId: "operation:task.lookup:invalid",
      },
    });
    const lookupRows = (await readOperationInvocations()).filter(
      (row) => row.operationKey === "task.lookup",
    );
    const byCodeRow = lookupRows.find(
      (row) => row.invocationId === "operation:task.lookup:by-code",
    );
    const invalidRow = lookupRows.find(
      (row) => row.invocationId === "operation:task.lookup:invalid",
    );

    expect(byCode.body.writes).toEqual([]);
    expect(byCode.body.result.body.invocation.input).toEqual({
      type: "list",
      input: { lookup: "CODE-ALPHA" },
    });
    expect(records(byCode)).toHaveLength(1);
    expect(records(byCode)[0]?.values).toMatchObject({
      done: false,
      verificationCode: "CODE-ALPHA",
    });
    expect(records(byReport)).toHaveLength(1);
    expect(records(byReport)[0]?.values).toMatchObject({
      done: false,
      reportNumber: "REPORT-BETA",
    });
    expect(records(common)).toHaveLength(2);
    expect(
      records(common).every(
        (record) =>
          record.values.done === false &&
          (record.values.verificationCode === "COMMON" || record.values.reportNumber === "COMMON"),
      ),
    ).toBe(true);
    expect(records(completedOnly)).toEqual([]);
    expect(records(missing)).toEqual([]);
    expect(invalid.response.status).toBe(400);
    expect(invalid.body).toEqual({
      error: 'Operation input field "lookup" must be text.',
      writes: [],
    });
    expect(lookupRows).toHaveLength(6);
    expect(byCodeRow).toMatchObject({
      affectedChangeIds: [],
      auditInput: {
        kind: "summary",
        summary: {
          inputFields: ["lookup"],
          inputType: "object",
          type: "list",
        },
      },
      authDecision: "allowed",
      operationKind: "list",
      status: "accepted",
    });
    expect(byCodeRow?.statusHistory.map((entry) => entry.status)).toEqual(["accepted"]);
    expect(byCodeRow?.inputHash).toMatch(/^fnv1a64:[a-f0-9]{16}$/);
    expect(JSON.stringify(byCodeRow?.auditInput)).not.toContain("CODE-ALPHA");
    expect(invalidRow).toMatchObject({
      affectedChangeIds: [],
      auditInput: {
        kind: "summary",
        summary: {
          inputFields: ["lookup"],
          inputType: "object",
          type: "list",
        },
      },
      authDecision: "allowed",
      errorMessage: 'Operation input field "lookup" must be text.',
      operationKind: "list",
      status: "failed",
    });
    expect(invalidRow?.statusHistory.map((entry) => entry.status)).toEqual(["accepted", "failed"]);
  });

  it("rejects Program authorization before field validation or write notification", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const schema = cloneSchema(bootstrap.body.result.body.schema);
    const taskEntity = schema.entities.find((definition) => definition.key === "task")!;
    if (!taskEntity) {
      throw new Error("Expected task entity.");
    }
    setKeyedDefinition(schema.entities, "task", {
      ...taskEntity,
      operations: (taskEntity.operations ?? []).map((operation) =>
        operation.key === "create"
          ? {
              ...operation,
              kind: "create",
              scope: "collection",
              input: { fields: [{ key: "title", field: "title" }] },
              effect: { type: "createRecord" },
              output: { type: "create" },
              idempotency: { required: true },
              audit: { input: "summary" },
              access: { actor: "owner" },
              key: "create",
            }
          : operation,
      ),
    });
    await executeOperation({
      method: "POST",
      path: "/schema",
      body: { schema },
    });

    const rejected = await executeOperationFailure({
      method: "POST",
      path: "/operations/task/create",
      body: {
        idempotencyKey: "policy-reject-before-validation",
        input: "invalid-values",
      },
      programOperationAuthorized: false,
    });

    expect(rejected.response.status).toBe(400);
    expect(rejected.body).toEqual({
      error: 'Program operation "task.create" is not authorized.',
      writes: [],
    });
  });

  it("requires idempotency keys for write operations before materialization", async () => {
    const rejected = await executeOperationFailure({
      method: "POST",
      path: "/operations/task/create",
      body: {
        input: {
          title: "Missing operation idempotency",
          done: false,
        },
      },
    });

    expect(rejected.response.status).toBe(400);
    expect(rejected.body).toEqual({
      error: 'Operation "create" requires an idempotency key for write execution.',
      writes: [],
    });
  });

  it("rejects undeclared generated operation input fields before materialization", async () => {
    const rejected = await executeOperationFailure({
      method: "POST",
      path: "/operations/task/create",
      body: {
        idempotencyKey: "operation-input-undeclared",
        input: {
          title: "Declared title",
          done: false,
          admin: true,
        },
      },
    });
    const rows = await readOperationInvocations();

    expect(rejected.response.status).toBe(400);
    expect(rejected.body).toEqual({
      error: 'Operation input includes undeclared field "admin".',
      writes: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      errorMessage: 'Operation input includes undeclared field "admin".',
      operationKey: "task.create",
      status: "failed",
    });
  });

  it("rejects stale browser operation writes before write notification", async () => {
    const bootstrap = await executeOperation<BootstrapResponse>({
      method: "GET",
      path: "/bootstrap",
    });
    const staleHeaders = {
      [FORMLESS_CLIENT_SCHEMA_UPDATED_AT_HEADER]: "2026-01-01T00:00:00.000Z",
    };
    const staleMutation = await executeOperationFailure({
      method: "POST",
      path: "/operations/task/create",
      headers: staleHeaders,
      body: {
        idempotencyKey: "operation-stale-client-create",
        input: { title: "Stale client", done: false },
      },
    });
    const staleAction = await executeOperationFailure({
      method: "POST",
      path: "/operations/task/clearCompletedTasks",
      headers: staleHeaders,
      body: {
        idempotencyKey: "operation-stale-client-command",
      },
    });

    expect(bootstrap.body.result.body.schemaUpdatedAt).toEqual(expect.any(String));
    expect(staleMutation.response.status).toBe(409);
    expect(staleMutation.body).toMatchObject({
      code: FORMLESS_RELOAD_REQUIRED_ERROR_CODE,
      reloadRequired: true,
      writes: [],
    });
    expect(staleAction.response.status).toBe(409);
    expect(staleAction.body).toMatchObject({
      code: FORMLESS_RELOAD_REQUIRED_ERROR_CODE,
      reloadRequired: true,
      writes: [],
    });
  });
});

function cloneSchema(schema: AppSchema): AppSchema {
  return JSON.parse(JSON.stringify(schema)) as AppSchema;
}

function operationSiteRecord(id: string, key: string): StoredRecord {
  return operationStoredRecord(id, "site", { key, label: `Site ${key}` });
}

function operationBlockRecord(id: string, site: string, type: string): StoredRecord {
  return operationStoredRecord(id, "block", { site, type, label: id });
}

function operationStoredRecord(
  id: string,
  entity: string,
  values: StoredRecord["values"],
): StoredRecord {
  return {
    id,
    entity,
    values,
    createdAt: "2026-08-06T00:00:00.000Z",
    updatedAt: "2026-08-06T00:00:00.000Z",
  };
}

function schemaWithScopedClearCompletedCommand(sourceSchema: AppSchema): AppSchema {
  const schema = cloneSchema(sourceSchema);
  const taskEntity = requireEntity(schema, "task");
  const operation = taskEntity.operations!.find(
    (definition) => definition.key === "clearCompletedTasks",
  )!;
  if (!operation || operation.effect?.type !== "operationHandler") {
    throw new Error("Expected clearCompletedTasks operation.");
  }
  setKeyedDefinition(schema.entities, "task", {
    ...taskEntity,
    operations: (taskEntity.operations ?? []).map((candidate) =>
      candidate.key === "clearCompletedTasks"
        ? {
            ...operation,
            policy: {
              actors: ["owner"],
              responseFields: {
                owner: ["title"],
              },
            },
            key: "clearCompletedTasks",
          }
        : candidate,
    ),
  });
  return schema;
}
function schemaWithAuthenticatedScopedClearCompletedCommand(sourceSchema: AppSchema): AppSchema {
  const schema = cloneSchema(sourceSchema);
  const taskEntity = requireEntity(schema, "task");
  const operation = taskEntity.operations!.find(
    (definition) => definition.key === "clearCompletedTasks",
  )!;
  if (!operation || operation.effect?.type !== "operationHandler") {
    throw new Error("Expected clearCompletedTasks operation.");
  }
  setKeyedDefinition(schema.entities, "task", {
    ...taskEntity,
    operations: (taskEntity.operations ?? []).map((candidate) =>
      candidate.key === "clearCompletedTasks"
        ? {
            ...operation,
            policy: {
              actors: ["authenticated"],
              responseFields: {
                authenticated: ["title"],
              },
            },
            key: "clearCompletedTasks",
          }
        : candidate,
    ),
  });
  return schema;
}
function authenticatedOperationActor(): OperationInvocationEnvelope["actor"] {
  return {
    kind: "authenticated",
    principalId: "principal-ada",
    sessionTarget: {
      instanceId: "instance-1",
      routeId: "route-program",
      targetOrigin: "https://program.example.com",
      targetProfile: "instance",
    },
  };
}

function schemaWithTransitionCommandOperation(sourceSchema: AppSchema): AppSchema {
  const schema = cloneSchema(sourceSchema);
  const taskEntity = requireEntity(schema, "task");
  const taskFields = [
    ...taskEntity.fields,
    {
      type: "enum",
      required: true,
      label: "Status",
      default: "todo",
      values: [
        { key: "todo", label: "Todo" },
        { key: "doing", label: "Doing" },
        { key: "done", label: "Done" },
      ],
      key: "status",
    },
  ] satisfies EntitySchema["fields"];
  setKeyedDefinition(schema.entities, "task", {
    ...taskEntity,
    fields: taskFields,
    stateMachines: [
      {
        key: "statusFlow",
        field: "status",
        initial: "todo",
        terminal: ["done"],
        transitions: [
          { key: "start", label: "Start", from: ["todo"], to: "doing" },
          { key: "finish", label: "Finish", from: ["doing"], to: "done" },
        ],
        event: {
          entity: "task-event",
          fields: transitionEventFieldMappings(),
        },
      },
    ],
    operations: mergeOperations(taskEntity.operations, [
      ...recordCrudOperations("Task", taskFields),
      {
        key: "startTask",
        label: "Start",
        kind: "command",
        scope: "record",
        effect: {
          type: "operationHandler",
          handler: "transition-state",
          config: {
            machine: "statusFlow",
            transition: "start",
          },
        },
        output: { type: "command" },
        idempotency: { required: true },
        audit: { input: "summary" },
        policy: { actors: ["owner"] },
      },
    ]),
  });
  setKeyedDefinition(schema.entities, "task-event", transitionEventEntity());
  return schema;
}

function schemaWithTransitionTargetValues(
  sourceSchema: AppSchema,
  options: {
    sideEffects?: TransitionSideEffectCreateStepSchema[];
  } = {},
): AppSchema {
  const schema =
    options.sideEffects === undefined
      ? schemaWithTransitionCommandOperation(sourceSchema)
      : schemaWithTransitionSideEffects(sourceSchema, options.sideEffects);
  const taskEntity = requireEntity(schema, "task");
  const startTask = taskEntity.operations?.find((definition) => definition.key === "startTask");
  if (
    !startTask ||
    startTask.effect?.type !== "operationHandler" ||
    startTask.effect.handler !== "transition-state"
  ) {
    throw new Error("Expected transition-state task.startTask operation.");
  }

  const fields = [
    ...taskEntity.fields,
    {
      key: "startedOn",
      type: "date",
      required: false,
      label: "Started on",
    },
    {
      key: "reportingDate",
      type: "date",
      required: false,
      label: "Reporting date",
    },
  ] satisfies EntitySchema["fields"];
  setKeyedDefinition(schema.entities, "task", {
    ...taskEntity,
    fields,
    operations: mergeOperations(taskEntity.operations, [
      {
        ...startTask,
        effect: {
          ...startTask.effect,
          config: {
            ...startTask.effect.config,
            targetValues: {
              startedOn: {
                kind: "generatedDate",
                timeZone: "Australia/Sydney",
              },
              reportingDate: {
                kind: "generatedDate",
                timeZone: "America/Los_Angeles",
              },
            },
          },
        },
      },
    ]),
  });

  return schema;
}

function schemaWithTransitionSideEffects(
  sourceSchema: AppSchema,
  sideEffects: TransitionSideEffectCreateStepSchema[] = successfulTransitionSideEffects(),
  options: {
    orderConstraints?: NonNullable<EntitySchema["constraints"]>;
  } = {},
): AppSchema {
  const schema = schemaWithTransitionCommandOperation(sourceSchema);
  const taskEntity = requireEntity(schema, "task");
  const startTask = taskEntity.operations!.find((definition) => definition.key === "startTask")!;
  if (
    !startTask ||
    startTask.effect?.type !== "operationHandler" ||
    startTask.effect.handler !== "transition-state"
  ) {
    throw new Error("Expected transition-state task.startTask operation.");
  }
  const taskFields = [
    ...taskEntity.fields,
    {
      type: "text",
      required: false,
      label: "Details",
      key: "details",
    },
  ] satisfies EntitySchema["fields"];
  const orderFields = [
    {
      type: "reference",
      required: true,
      label: "Task",
      to: "task",
      displayField: "title",
      key: "task",
    },
    {
      type: "text",
      required: true,
      label: "Source task id",
      key: "sourceTaskId",
    },
    {
      type: "text",
      required: true,
      label: "Title",
      key: "title",
    },
    {
      type: "text",
      required: false,
      label: "Details",
      key: "details",
    },
    {
      type: "text",
      required: false,
      label: "Note",
      key: "note",
    },
    {
      type: "text",
      required: true,
      label: "Code",
      key: "code",
    },
    {
      type: "text",
      required: true,
      label: "Actor mode",
      key: "actorMode",
    },
    {
      type: "text",
      required: false,
      label: "Actor principal id",
      key: "actorPrincipalId",
    },
    {
      type: "text",
      required: false,
      label: "Source path",
      key: "sourcePath",
    },
    {
      type: "text",
      required: true,
      label: "Occurred at",
      key: "occurredAt",
    },
  ] satisfies EntitySchema["fields"];
  setKeyedDefinition(schema.entities, "task", {
    ...taskEntity,
    fields: taskFields,
    operations: mergeOperations(taskEntity.operations, [
      ...recordCrudOperations("Task", taskFields),
      {
        ...startTask,
        input: {
          fields: [
            {
              key: "note",
              type: "text",
              required: false,
              label: "Note",
            },
          ],
        },
        effect: {
          ...startTask.effect,
          config: {
            ...startTask.effect.config,
            sideEffects: {
              type: "recordPlan",
              steps: sideEffects,
            },
          },
        },
        key: "startTask",
      },
    ]),
  });
  setKeyedDefinition(schema.entities, "order", {
    id: "entity_7ef4f4da-b4c9-4ea6-a224-b7057d280076",
    label: "Order",
    fields: orderFields,
    constraints: options.orderConstraints ?? [
      { key: "uniqueTask", kind: "unique", fields: ["task"] },
      { key: "uniqueCode", kind: "unique", fields: ["code"] },
    ],
    operations: recordCrudOperations("Order", orderFields),
  } as EntitySchema);
  setKeyedDefinition(schema.entities, "order-receipt", {
    id: "entity_4ea5458f-cca1-4bac-aa68-9a205add7847",
    label: "Order receipt",
    fields: [
      {
        key: "order",
        type: "reference",
        required: true,
        label: "Order",
        to: "order",
        displayField: "title",
      },
      {
        key: "label",
        type: "text",
        required: true,
        label: "Label",
      },
    ],
  } as EntitySchema);
  return schema;
}
function successfulTransitionSideEffects(): TransitionSideEffectCreateStepSchema[] {
  return [
    {
      name: "createOrder",
      kind: "create",
      entity: "order",
      recordId: { kind: "generatedId", prefix: "order" },
      values: {
        task: {
          kind: "reference",
          entity: "task",
          id: { kind: "targetRecordId" },
        },
        sourceTaskId: { kind: "targetRecordId" },
        title: { kind: "targetField", field: "title" },
        details: { kind: "targetField", field: "details" },
        note: { kind: "input", field: "note" },
        code: {
          kind: "generatedCode",
          alphabet: "upperAlphaNumericNoConfusables",
          length: 6,
          prefix: "ORD-",
        },
        actorMode: { kind: "actor", field: "mode" },
        actorPrincipalId: { kind: "actor", field: "principalId" },
        sourcePath: { kind: "source", field: "route" },
        occurredAt: { kind: "generatedTimestamp" },
      },
    },
    {
      name: "createReceipt",
      kind: "create",
      entity: "order-receipt",
      values: {
        order: {
          kind: "reference",
          entity: "order",
          id: { kind: "stepOutput", step: "createOrder", output: "id" },
        },
        label: {
          kind: "stepOutput",
          step: "createOrder",
          output: "field",
          field: "title",
        },
      },
    },
  ];
}

function invalidReferenceTransitionSideEffects(): TransitionSideEffectCreateStepSchema[] {
  const [createOrder] = successfulTransitionSideEffects();

  if (!createOrder) {
    throw new Error("Expected createOrder transition side effect.");
  }

  return [
    {
      ...createOrder,
      values: {
        ...createOrder.values,
        task: {
          kind: "reference",
          entity: "task",
          id: { kind: "literal", value: "missing-task" },
        },
      },
    },
  ];
}

function generatedDigitCodeTransitionSideEffects(): TransitionSideEffectCreateStepSchema[] {
  const [createOrder] = successfulTransitionSideEffects();

  if (!createOrder) {
    throw new Error("Expected createOrder transition side effect.");
  }

  return [
    {
      ...createOrder,
      values: {
        ...createOrder.values,
        code: {
          kind: "generatedCode",
          alphabet: "digits",
          length: 1,
        },
      },
    },
  ];
}

function schemaWithRecordPlanOperation(
  sourceSchema: AppSchema,
  operationName: string,
  steps: RecordPlanStepSchema[],
): AppSchema {
  const schema = cloneSchema(sourceSchema);
  const taskEntity = schema.entities.find((definition) => definition.key === "task")!;
  if (!taskEntity) {
    throw new Error("Expected task entity.");
  }
  setKeyedDefinition(schema.entities, "task-log", taskLogEntity());
  setKeyedDefinition(schema.entities, "task", {
    ...taskEntity,
    operations: [
      ...(taskEntity.operations ?? []),
      {
        ...recordPlanOperation(steps),
        key: operationName,
      },
    ],
  });
  return schema;
}
function schemaWithTargetAwareRecordPlanOperation(sourceSchema: AppSchema): AppSchema {
  const schema = schemaWithOperationOnlyTaskProjectReference(sourceSchema);
  const taskEntity = requireEntity(schema, "task");
  const targetLogFields = [
    {
      type: "reference",
      required: true,
      label: "Task",
      to: "task",
      displayField: "title",
      key: "task",
    },
    {
      type: "text",
      required: true,
      label: "Source task id",
      key: "sourceTaskId",
    },
    {
      type: "text",
      required: true,
      label: "Title",
      key: "title",
    },
    {
      type: "text",
      required: true,
      label: "Code",
      key: "code",
    },
  ] satisfies EntitySchema["fields"];

  setKeyedDefinition(schema.entities, "target-log", {
    id: "entity_6577f628-d9a7-4775-b76b-a27e72087082",
    label: "Target log",
    fields: targetLogFields,
    constraints: [{ key: "uniqueCode", kind: "unique", fields: ["code"] }],
  } as EntitySchema);
  setKeyedDefinition(schema.entities, "task", {
    ...taskEntity,
    operations: mergeOperations(taskEntity.operations, [
      {
        key: "createTargetLog",
        label: "Create target log",
        kind: "command",
        scope: "record",
        effect: {
          type: "recordPlan",
          steps: [
            {
              name: "createTargetLog",
              kind: "create",
              entity: "target-log",
              recordId: { kind: "generatedId", prefix: "target-log" },
              values: {
                task: {
                  kind: "reference",
                  entity: "task",
                  id: { kind: "targetRecordId" },
                },
                sourceTaskId: { kind: "targetRecordId" },
                title: { kind: "targetField", field: "title" },
                code: {
                  kind: "generatedCode",
                  alphabet: "upperAlphaNumericNoConfusables",
                  length: 6,
                  prefix: "LOG-",
                },
              },
            },
          ],
        },
        output: { type: "command" },
        idempotency: { required: true },
        audit: { input: "summary" },
        policy: { actors: ["owner"] },
      },
    ]),
  });
  return schema;
}
function schemaWithPrivateSubscribeCommandOperation(sourceSchema: AppSchema): AppSchema {
  const schema = cloneSchema(sourceSchema);
  const taskEntity = requireEntity(schema, "task");
  setKeyedDefinition(schema.entities, "task", {
    ...taskEntity,
    operations: [
      ...(taskEntity.operations ?? []),
      {
        key: "privateSubscribe",
        label: "Private subscribe",
        kind: "command",
        scope: "collection",
        effect: {
          type: "operationHandler",
          handler: "contact-subscription.subscribe",
          config: {},
        },
        output: { type: "command" },
        idempotency: { required: true },
        audit: { input: "summary" },
        policy: { actors: ["owner"] },
      },
    ],
  });
  return schema;
}
function taskLogEntity(): AppSchema["entities"][number] {
  return {
    id: "entity_6af9953e-5e82-4eb1-a57f-91a9ceeca119",
    label: "Task log",
    fields: [
      {
        key: "task",
        type: "reference",
        required: true,
        label: "Task",
        to: "task",
        displayField: "title",
      },
      { key: "label", type: "text", required: true, label: "Label" },
      { key: "actorMode", type: "text", required: true, label: "Actor mode" },
      { key: "sourcePath", type: "text", required: false, label: "Source path" },
      { key: "occurredAt", type: "text", required: true, label: "Occurred at" },
    ],
  } as unknown as AppSchema["entities"][number];
}
function transitionEventEntity(): AppSchema["entities"][number] {
  return {
    id: "entity_77de980f-9acb-4e15-a7ee-09c89a2e949d",
    label: "Task event",
    fields: [
      { key: "sourceEntity", type: "text", required: true, label: "Source entity" },
      { key: "sourceRecordId", type: "text", required: true, label: "Source record id" },
      { key: "transitionKey", type: "text", required: true, label: "Transition" },
      { key: "previousState", type: "text", required: true, label: "Previous state" },
      { key: "nextState", type: "text", required: true, label: "Next state" },
      { key: "actorMode", type: "text", required: true, label: "Actor mode" },
      { key: "occurredAt", type: "date", required: true, label: "Occurred at" },
    ],
  } as unknown as AppSchema["entities"][number];
}
function transitionEventFieldMappings() {
  return {
    sourceEntity: "sourceEntity",
    sourceRecordId: "sourceRecordId",
    transitionKey: "transitionKey",
    previousState: "previousState",
    nextState: "nextState",
    actorMode: "actorMode",
    occurredAt: "occurredAt",
  } as const;
}

function recordPlanOperation(steps: RecordPlanStepSchema[]): EntityOperationSchema {
  return {
    label: "Submit plan",
    kind: "command",
    scope: "collection",
    input: {
      fields: [
        { key: "title", type: "text", required: true, label: "Title" },
        { key: "note", type: "text", required: true, label: "Note" },
      ],
    },
    effect: {
      type: "recordPlan",
      steps,
    },
    output: { type: "command" },
    policy: {
      actors: ["anonymous"],
      access: {
        actor: "anonymous",
        challenge: { kind: "turnstile" },
        origin: { kind: "same-origin" },
      },
    },
    idempotency: { required: true },
    audit: { input: "summary" },
  };
}

function successfulRecordPlanSteps(): RecordPlanStepSchema[] {
  return [
    createTaskRecordPlanStep(),
    {
      name: "createLog",
      kind: "create",
      entity: "task-log",
      values: {
        task: {
          kind: "reference",
          entity: "task",
          id: { kind: "stepOutput", step: "createTask", output: "id" },
        },
        label: { kind: "input", field: "note" },
        actorMode: { kind: "actor", field: "mode" },
        sourcePath: { kind: "source", field: "path" },
        occurredAt: { kind: "generatedTimestamp" },
      },
    },
    {
      name: "touchTask",
      kind: "patch",
      entity: "task",
      recordId: { kind: "stepOutput", step: "createTask", output: "id" },
      values: {
        title: { kind: "stepOutput", step: "createTask", output: "field", field: "title" },
      },
    },
  ];
}

function createTaskRecordPlanStep(): RecordPlanStepSchema {
  return {
    name: "createTask",
    kind: "create",
    entity: "task",
    recordId: { kind: "generatedId", prefix: "task" },
    values: {
      title: { kind: "input", field: "title" },
      done: { kind: "literal", value: false },
    },
  };
}

function brokenRecordPlanSteps(): RecordPlanStepSchema[] {
  return [
    createTaskRecordPlanStep(),
    {
      name: "createBrokenLog",
      kind: "create",
      entity: "task-log",
      values: {
        task: {
          kind: "reference",
          entity: "task",
          id: { kind: "literal", value: "missing-task" },
        },
        label: { kind: "input", field: "note" },
        actorMode: { kind: "actor", field: "mode" },
        occurredAt: { kind: "generatedTimestamp" },
      },
    },
  ];
}

function schemaWithOperationOnlyTaskCrud(sourceSchema: AppSchema): AppSchema {
  const schema = cloneSchema(sourceSchema);
  const taskEntity = requireEntity(schema, "task");
  setKeyedDefinition(schema.entities, "task", {
    ...taskEntity,
    operations: mergeOperations(taskEntity.operations, [
      ...recordCrudOperations("Task", taskEntity.fields),
      {
        ...listOperation("taskActive"),
        key: "activeList",
      },
    ]),
  });
  return schema;
}
function schemaWithParameterizedTaskLookup(sourceSchema: AppSchema): AppSchema {
  const schema = cloneSchema(sourceSchema);
  const taskEntity = requireEntity(schema, "task");
  const taskFields = [
    ...taskEntity.fields,
    {
      type: "text",
      required: false,
      label: "Verification code",
      key: "verificationCode",
    },
    {
      type: "text",
      required: false,
      label: "Report number",
      key: "reportNumber",
    },
  ] satisfies EntitySchema["fields"];
  setKeyedDefinition(schema.queries, "taskLookup", {
    label: "Task lookup",
    entity: "task",
    expression: {
      kind: "and",
      expressions: [
        {
          kind: "where",
          ref: { kind: "value", name: "done" },
          op: "eq",
          value: false,
        },
        {
          kind: "or",
          expressions: [
            {
              kind: "where",
              ref: { kind: "value", name: "verificationCode" },
              op: "eq",
              value: { kind: "context", name: "lookup" },
            },
            {
              kind: "where",
              ref: { kind: "value", name: "reportNumber" },
              op: "eq",
              value: { kind: "context", name: "lookup" },
            },
          ],
        },
      ],
    },
  });
  setKeyedDefinition(schema.entities, "task", {
    ...taskEntity,
    fields: taskFields,
    operations: mergeOperations(taskEntity.operations, [
      ...recordCrudOperations("Task", taskFields),
      {
        key: "lookup",
        label: "Lookup tasks",
        kind: "list",
        scope: "collection",
        target: { query: "taskLookup" },
        input: {
          fields: [
            {
              key: "lookup",
              type: "text",
              required: true,
              label: "Lookup",
            },
          ],
        },
        output: {
          type: "list",
          query: "taskLookup",
          maxResults: 2,
        },
        idempotency: { required: false },
        audit: { input: "summary" },
      },
    ]),
  });
  return schema;
}
function schemaWithOperationOnlyTaskProjectReference(sourceSchema: AppSchema): AppSchema {
  const schema = schemaWithOperationOnlyTaskCrud(sourceSchema);
  const taskEntity = requireEntity(schema, "task");
  const taskFields = [
    ...taskEntity.fields,
    {
      type: "reference",
      required: false,
      label: "Project",
      to: "project",
      displayField: "name",
      key: "project",
    },
  ] satisfies EntitySchema["fields"];
  const projectFields = [
    {
      type: "text",
      required: true,
      label: "Name",
      key: "name",
    },
  ] satisfies EntitySchema["fields"];
  setKeyedDefinition(schema.entities, "task", {
    ...taskEntity,
    fields: taskFields,
    operations: mergeOperations(taskEntity.operations, [
      ...recordCrudOperations("Task", taskFields),
      {
        ...listOperation("taskActive"),
        key: "activeList",
      },
    ]),
  });
  setKeyedDefinition(schema.entities, "project", {
    id: "entity_1dec5dbd-c83b-491d-a0ca-a138f48d13ed",
    label: "Project",
    fields: projectFields,
    operations: recordCrudOperations("Project", projectFields),
  } as unknown as EntitySchema);
  return schema;
}
function schemaWithOperationOnlyTaskIdentityReference(sourceSchema: AppSchema): AppSchema {
  const schema = schemaWithOperationOnlyTaskCrud(sourceSchema);
  const taskEntity = requireEntity(schema, "task");
  const taskFields = [
    ...taskEntity.fields,
    {
      type: "reference",
      required: false,
      label: "Owner principal",
      to: "auth:principal",
      key: "ownerPrincipal",
    },
  ] satisfies EntitySchema["fields"];
  setKeyedDefinition(schema.entities, "task", {
    ...taskEntity,
    fields: taskFields,
    operations: mergeOperations(taskEntity.operations, [
      ...recordCrudOperations("Task", taskFields),
      {
        ...listOperation("taskActive"),
        key: "activeList",
      },
    ]),
  });
  return schema;
}
function requireEntity(schema: AppSchema, entityName: string): EntitySchema {
  const entity = schema.entities.find((definition) => definition.key === entityName)!;
  if (!entity) {
    throw new Error(`Expected ${entityName} entity.`);
  }
  return entity;
}
function mergeOperations(
  existing: EntitySchema["operations"],
  replacements: NonNullable<EntitySchema["operations"]>,
): NonNullable<EntitySchema["operations"]> {
  const replacementsByKey = new Map(
    replacements.map((operation) => [operation.key, operation] as const),
  );
  const merged = (existing ?? []).map(
    (operation) => replacementsByKey.get(operation.key) ?? operation,
  );
  const existingKeys = new Set((existing ?? []).map((operation) => operation.key));
  return [...merged, ...replacements.filter((operation) => !existingKeys.has(operation.key))];
}
function recordCrudOperations(
  label: string,
  fields: EntitySchema["fields"],
): NonNullable<EntitySchema["operations"]> {
  const input = {
    fields: fields.map(({ key }) => ({ key, field: key })),
  };
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
    {
      label: `Delete ${label}`,
      kind: "delete",
      scope: "record",
      effect: { type: "tombstoneRecord" },
      output: { type: "delete" },
      idempotency: { required: true },
      audit: { input: "summary" },
      key: "delete",
    },
    {
      label: `Read ${label}`,
      kind: "get",
      scope: "record",
      output: { type: "get" },
      idempotency: { required: false },
      audit: { input: "summary" },
      key: "read",
    },
  ];
}
function listOperation(query: string): EntityOperationSchema {
  return {
    kind: "list",
    scope: "collection",
    target: { query },
    output: { type: "list", query },
    idempotency: { required: false },
    audit: { input: "summary" },
  };
}

function createTaskForTransition(idempotencyKey: string, values: Record<string, unknown>) {
  return executeOperation<OperationInvocationResponse>({
    method: "POST",
    path: "/operations/task/create",
    body: { idempotencyKey, input: values },
  });
}

function calendarDateInTimeZone(receivedAt: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US-u-ca-iso8601-nu-latn", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(new Date(receivedAt));
  const calendarParts = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${calendarParts.year}-${calendarParts.month}-${calendarParts.day}`;
}

function createOrderForTransition(idempotencyKey: string, values: Record<string, unknown>) {
  return executeOperation<OperationInvocationResponse>({
    method: "POST",
    path: "/operations/order/create",
    body: { idempotencyKey, input: values },
  });
}

async function executeOperation<TBody>(input: ExecuteOperationInput) {
  const response = await fetchOperationHarness(input);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Authority operation harness failed: ${response.status} ${text}`);
  }

  const body = JSON.parse(text) as ExecuteOperationSuccess<TBody>;

  return { response, body };
}

async function executeOperationFailure(input: ExecuteOperationInput) {
  const response = await fetchOperationHarness(input);
  const body = (await response.json()) as ExecuteOperationFailure;

  return { response, body };
}

async function fetchOperationHarness(input: ExecuteOperationInput) {
  return harness.fetch("/execute", {
    body: JSON.stringify(input),
    headers: {
      "Content-Type": "application/json",
      "x-operation-harness-name": operationHarnessName,
    },
    method: "POST",
  });
}

async function readOperationInvocations() {
  const response = await harness.fetch("/operation-invocations", {
    headers: {
      "x-operation-harness-name": operationHarnessName,
    },
  });

  expect(response.status).toBe(200);

  return (await response.json()) as StoredOperationInvocation[];
}

async function writeAuthorityOperationHarness() {
  operationHarnessDir = await mkdtemp(join(tmpdir(), "formless-authority-operation-harness-"));
  const harnessPath = join(operationHarnessDir, "authority-operation-harness.ts");

  await writeFile(
    harnessPath,
    `
      import { DurableObject } from "cloudflare:workers";
      import { programStorageIdentity } from "${process.cwd()}/src/shared/program-storage-identity.ts";
      import {
        executeAuthorityOperation,
        selectAuthorityOperation,
      } from "${process.cwd()}/src/worker/authority-operations.ts";
      import {
        assertOperationInvocationAuthorized,
        executeWriteOperationInvocation,
      } from "${process.cwd()}/src/worker/entity-operations.ts";
      import {
        BadRequestError,
        ReloadRequiredError,
      } from "${process.cwd()}/src/worker/errors.ts";
      import {
        buildUnverifiedPublicOperationInvocationEnvelope,
        buildVerifiedPublicOperationInvocationEnvelope,
      } from "${process.cwd()}/src/worker/operation-invocation-envelopes.ts";
      import { executePublicOperationInvocationLifecycle } from "${process.cwd()}/src/worker/operation-invocation-lifecycle.ts";
      import { taskStorageSnapshotRecords } from "${process.cwd()}/src/test/schema-app-records.ts";
      import { taskSourceSchema } from "${process.cwd()}/src/test/schema-apps.ts";
      import { formlessProgramSchema } from "${process.cwd()}/src/program/runtime.ts";
      import { standardSchemaSource } from "${process.cwd()}/../standard/src/schema.ts";
      import { formlessProgramDefaultSharedRuntime } from "${process.cwd()}/src/program/default/shared.ts";
      import { validateFormlessProgramRecordConstraint } from "${process.cwd()}/src/worker/program-authority.ts";
      import { defineProgramSharedRuntime } from "${process.cwd()}/src/program/composition.ts";
      import {
        FORMLESS_PROGRAM_SCHEMA_KEY,
        FORMLESS_PROGRAM_STORAGE_IDENTITY,
      } from "${process.cwd()}/src/program/target.ts";
      import {
        ensureStorageTables,
        initializeStorageFromSource,
        readCurrentStoredSchema,
        readOperationInvocations,
        restoreStorageSnapshot,
      } from "${process.cwd()}/src/worker/storage.ts";

      export class AuthorityOperationHarness extends DurableObject {
        constructor(ctx, env) {
          super(ctx, env);
          ensureStorageTables(ctx.storage);
        }

        async fetch(request) {
          const url = new URL(request.url);

          if (request.method === "GET" && url.pathname === "/operation-invocations") {
            return Response.json(readOperationInvocations(this.ctx.storage));
          }

          const input = await request.json();
          const schemaFixture = input.schemaFixture ?? "tasks";
          const sourceSchema = schemaFixture === "tasks"
            ? taskSourceSchema
            : schemaFixture === "program"
              ? formlessProgramSchema
              : schemaFixture === "standard"
                ? standardSchemaSource
                : undefined;
          const operation = selectAuthorityOperation({
            method: input.method,
            path: input.path,
            searchParams: new URLSearchParams(input.search ?? ""),
          });

          if (!sourceSchema || !operation) {
            return Response.json({ error: "Unsupported operation.", writes: [] }, { status: 404 });
          }

          const identity = input.identity ?? programStorageIdentity();
          const records = schemaFixture === "tasks" ? taskStorageSnapshotRecords : [];
          const source = { schema: sourceSchema };
          if (!readCurrentStoredSchema(this.ctx.storage)) {
            initializeStorageFromSource(this.ctx.storage, source);
            if (records.length > 0) {
              restoreStorageSnapshot(
                this.ctx.storage,
                {
                  kind: "formless.storage-snapshot",
                  version: 1,
                  storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
                  schemaKey: FORMLESS_PROGRAM_SCHEMA_KEY,
                  exportedAt: "2026-07-29T00:00:00.000Z",
                  schemaUpdatedAt: "2026-07-29T00:00:00.000Z",
                  sourceCursor: records.length,
                  schema: sourceSchema,
                  records,
                },
                source,
              );
            }
          }
	          const writes = [];
	          const storage = this.ctx.storage;
	          let beforeWriteApplied = false;
	          const writeNotifier = {
	            apply(write) {
	              if (!beforeWriteApplied && input.beforeWriteRecordValues) {
	                beforeWriteApplied = true;
	                storage.sql.exec(
	                  "UPDATE records SET values_json = ? WHERE id = ?",
	                  JSON.stringify(input.beforeWriteRecordValues.values),
	                  input.beforeWriteRecordValues.recordId,
	                );
	              }

	              const outcome = write();
              writes.push({ kind: outcome.kind, response: outcome.response });
              return outcome;
            },
          };

          try {
            if (input.publicOperation) {
              if (operation.kind !== "entityOperation") {
                return Response.json(
                  { error: "Unsupported public operation.", writes: [] },
                  { status: 404 },
                );
              }

              const stored = initializeStorageFromSource(this.ctx.storage, source);
              const envelopeInput = {
                identity,
                idempotencyKey: input.publicOperation.idempotencyKey,
                publicInput: input.publicOperation.input,
                route: {
                  entityName: operation.entityName,
                  operationName: operation.operationName,
                },
                schema: stored.schema,
                source: input.publicOperation.source,
              };
              const unverifiedEnvelope = buildUnverifiedPublicOperationInvocationEnvelope(
                envelopeInput,
              );
              const body = await executePublicOperationInvocationLifecycle({
                assertAllowed: () => assertOperationInvocationAuthorized(unverifiedEnvelope),
                beforeReplay: () => {
                  if (input.publicOperation.beforeReplayError) {
                    throw new BadRequestError(input.publicOperation.beforeReplayError);
                  }
                },
                envelope: unverifiedEnvelope,
                execute: (envelope) =>
                  executeWriteOperationInvocation({
                    envelope,
                    operationAdapters: formlessProgramDefaultSharedRuntime.operationAdapters,
                    schema: stored.schema,
                    storage: this.ctx.storage,
                    writes: writeNotifier,
                  }),
                prepareExecutionEnvelope: () =>
                  buildVerifiedPublicOperationInvocationEnvelope({
                    ...envelopeInput,
                    proof: {
                      turnstileToken:
                        input.publicOperation.turnstileToken ?? "authority-proof-token",
                      verification: {
                        kind: "turnstile",
                        success: true,
                        verifiedAt: "2026-07-15T00:00:00.000Z",
                        hostname: input.publicOperation.source.host,
                      },
                    },
                  }),
                storage: this.ctx.storage,
              });

              return Response.json({ result: { body }, writes });
            }

            const result = await executeAuthorityOperation({
              actor: input.actor ?? { kind: "owner" },
              actorKind: input.actorKind,
              body: input.body,
              identity,
              operation,
              operationAdapters: formlessProgramDefaultSharedRuntime.operationAdapters,
              programOperationAuthorized: input.preserveMissingOperationAccess
                ? undefined
                : input.programOperationAuthorized ?? true,
              requestHeaders: new Headers(input.headers ?? {}),
              sharedRuntime: input.rejectSnapshotRecords
                ? defineProgramSharedRuntime({
                    target: "shared",
                    recordAdapters: [{
                      target: "shared",
                      kind: "record-adapter",
                      key: "test.reject-snapshot",
                      entityIds: [taskSourceSchema.entities[0].id],
                      adapter: {
                        canonicalize: ({ records }) => records,
                        validate: () => {
                          throw new Error("Selected task snapshot adapter rejected records.");
                        },
                        validateCandidate: () => undefined,
                      },
                    }],
                    operationAdapters: [],
                    bootstrapContributions: [],
                    createIdContributions: [],
                  })
                : schemaFixture === "program"
                  ? formlessProgramDefaultSharedRuntime
                  : undefined,
              validateConstraints: schemaFixture === "program"
                ? validateFormlessProgramRecordConstraint(this.ctx.storage)
                : undefined,
              source,
              storage: this.ctx.storage,
              writes: writeNotifier,
            });

            return Response.json({ result, writes });
          } catch (error) {
            const status =
              error instanceof ReloadRequiredError ? error.status :
              error instanceof BadRequestError ? 400 : 500;
            const message = error instanceof Error ? error.message : "Unknown error.";
            const body =
              error instanceof ReloadRequiredError
                ? { ...error.body, writes }
                : { error: message, writes };

            return Response.json(body, { status });
          }
        }
      }

      export default {
        fetch(request, env) {
          const id = env.AUTHORITY_OPERATION_HARNESS.idFromName(
            request.headers.get("x-operation-harness-name") ?? "default",
          );

          return env.AUTHORITY_OPERATION_HARNESS.get(id).fetch(request);
        },
      };
    `,
  );

  return harnessPath;
}
