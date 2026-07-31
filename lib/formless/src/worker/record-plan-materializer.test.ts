import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import {
  parseAppSchema,
  type AppSchema,
  type EntityOperationSchema,
  type RecordPlanEntityOperationEffectSchema,
} from "@dpeek/formless-schema";
import type { StoredRecord } from "@dpeek/formless-storage";
import { programStorageIdentity } from "../shared/app-storage-identity.ts";
import type {
  OperationCommandOutput,
  OperationInvocationEnvelope,
} from "../shared/operation-invocation.ts";
import { createWorkerHarness } from "./miniflare-test.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

type PlanSummary =
  | {
      kind: "create";
      entity: string;
      id: string;
      values: Record<string, unknown>;
    }
  | {
      kind: "patch";
      entity: string;
      recordId: string;
      values: Record<string, unknown>;
    }
  | {
      kind: "delete" | "tombstone";
      entity: string;
      recordId: string;
    };

type MaterializeResponse = {
  output: OperationCommandOutput;
  planSummaries: PlanSummary[];
  records: StoredRecord[];
};

type MaterializeRequest = {
  effect: RecordPlanEntityOperationEffectSchema;
  envelope: OperationInvocationEnvelope;
  inputValues: Record<string, unknown>;
  operationId: string;
  records?: StoredRecord[];
  schema: AppSchema;
  targetRecord?: StoredRecord;
};

let harness: Harness;
let materializerHarnessDir: string | undefined;
let materializerHarnessName: string;

beforeAll(async () => {
  harness = await createWorkerHarness(await writeRecordPlanMaterializerHarness(), {
    RECORD_PLAN_MATERIALIZER_HARNESS: {
      className: "RecordPlanMaterializerHarness",
      useSQLite: true,
    },
  });
});

beforeEach(() => {
  materializerHarnessName = randomUUID();
});

afterAll(async () => {
  await harness.dispose();

  if (materializerHarnessDir) {
    await rm(materializerHarnessDir, { recursive: true, force: true });
    materializerHarnessDir = undefined;
  }
});

describe("record plan materializer", () => {
  it("builds ordered write plans from input, generated, actor, source, and step expressions", async () => {
    const schema = materializerSchema();
    const operation = submitPlanOperation(schema);
    const receivedAt = "2026-06-25T12:34:56.000Z";
    const operationId = "operation:task.submitPlan:materializer-success";
    const inputValues = {
      existingTaskId: "task-existing",
      note: "Created by materializer test",
      title: "Planned task",
    };
    const response = await postMaterialize({
      effect: requireRecordPlanEffect(operation),
      envelope: operationEnvelope(operation, {
        input: inputValues,
        operationId,
        receivedAt,
      }),
      inputValues,
      operationId,
      records: [existingTaskRecord()],
      schema,
    });

    const createdTask = response.planSummaries[1];
    if (createdTask?.kind !== "create") {
      throw new Error("Expected createTask plan summary.");
    }

    const createLog = response.planSummaries[2];
    if (createLog?.kind !== "create") {
      throw new Error("Expected createLog plan summary.");
    }

    const touchTask = response.planSummaries[3];
    if (touchTask?.kind !== "patch") {
      throw new Error("Expected touchTask plan summary.");
    }

    expect(response.planSummaries.map((plan) => plan.kind)).toEqual([
      "patch",
      "create",
      "create",
      "patch",
      "tombstone",
    ]);
    expect(response.planSummaries.map((plan) => plan.entity)).toEqual([
      "task",
      "task",
      "task-log",
      "task",
      "task",
    ]);
    expect(response.planSummaries[0]).toMatchObject({
      kind: "patch",
      entity: "task",
      recordId: "task-existing",
      values: {
        done: false,
        sourcePath: "/intake",
        title: "Planned task",
      },
    });
    expect(createdTask.id).toMatch(/^task_/);
    expect(createdTask.values).toMatchObject({
      actorMode: "owner",
      done: false,
      humanCode: expect.stringMatching(
        /^ORD-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/,
      ),
      marker: "created",
      sourceHost: "example.com",
      sourcePath: "/intake",
      sourceProtocol: "generated-ui",
      submittedAt: receivedAt,
      title: "Planned task",
    });
    expect(createdTask.values.generatedCode).toEqual(expect.stringMatching(/^code_/));
    expect(createLog).toMatchObject({
      id: "log-created",
      values: {
        actorMode: "owner",
        label: "Planned task",
        occurredAt: receivedAt,
        sourcePath: "/intake",
        task: createdTask.id,
      },
    });
    expect(touchTask).toMatchObject({
      recordId: createdTask.id,
      values: {
        marker: "touched",
        title: "Planned task",
      },
    });
    expect(response.planSummaries[4]).toMatchObject({
      kind: "tombstone",
      entity: "task",
      recordId: "task-existing",
    });
    expect(response.output.affectedChangeIds).toHaveLength(5);
    expect(response.output.recordPlan?.steps.map((step) => step.changeId)).toEqual(
      response.output.affectedChangeIds,
    );
    expect(response.output.recordPlan?.steps.map((step) => step.recordId)).toEqual([
      "task-existing",
      createdTask.id,
      "log-created",
      createdTask.id,
      "task-existing",
    ]);
    expect(response.output.changes.map((change) => change.recordId)).toEqual([
      "task-existing",
      createdTask.id,
      "log-created",
      createdTask.id,
      "task-existing",
    ]);
    expect(response.output.changes.map((change) => change.operationKind)).toEqual([
      "command",
      "command",
      "command",
      "command",
      "command",
    ]);
    expect(response.records.find((record) => record.id === "task-existing")).toMatchObject({
      deletedAt: receivedAt,
      values: {
        done: false,
        sourcePath: "/intake",
        title: "Planned task",
      },
    });
  });

  it("fails generated code materialization after unique collision retries are exhausted", async () => {
    const schema = materializerSchema(
      [
        {
          name: "createTask",
          kind: "create",
          entity: "task",
          values: {
            title: { kind: "input", field: "title" },
            done: { kind: "literal", value: false },
            humanCode: { kind: "generatedCode", alphabet: "digits", length: 1 },
          },
        },
      ],
      {
        constraints: [{ key: "uniqueHumanCode", kind: "unique", fields: ["humanCode"] }],
      },
    );
    const operation = submitPlanOperation(schema);
    const operationId = "operation:task.submitPlan:materializer-code-collision";
    const response = await postMaterializeFailure({
      effect: requireRecordPlanEffect(operation),
      envelope: operationEnvelope(operation, {
        input: {
          existingTaskId: "task-existing",
          note: "Collision",
          title: "Collision task",
        },
        operationId,
        receivedAt: "2026-06-25T12:41:56.000Z",
      }),
      inputValues: {
        existingTaskId: "task-existing",
        note: "Collision",
        title: "Collision task",
      },
      operationId,
      records: digitCodeRecords(),
      schema,
    });
    expect(response.status).toBe(400);
    expect(
      (await response.json()) as {
        error: string;
      },
    ).toEqual({
      error:
        'Record plan step "createTask" generated code collided after 32 attempts: Unique constraint "task.uniqueHumanCode" would be violated.',
    });
  });

  it("materializes authenticated principal id from actor context", async () => {
    const schema = materializerSchema([
      {
        name: "createTask",
        kind: "create",
        entity: "task",
        values: {
          title: { kind: "input", field: "title" },
          done: { kind: "literal", value: false },
          actorMode: { kind: "actor", field: "mode" },
          actorPrincipalId: { kind: "actor", field: "principalId" },
        },
      },
    ]);
    const operation = submitPlanOperation(schema);
    const operationId = "operation:task.submitPlan:materializer-authenticated";
    const inputValues = {
      existingTaskId: "task-existing",
      note: "Authenticated",
      title: "Authenticated task",
    };
    const response = await postMaterialize({
      effect: requireRecordPlanEffect(operation),
      envelope: operationEnvelope(operation, {
        actor: {
          kind: "authenticated",
          principalId: "principal-ada",
          sessionTarget: authenticatedSessionTarget(),
        },
        input: inputValues,
        operationId,
        receivedAt: "2026-06-25T12:40:56.000Z",
      }),
      inputValues,
      operationId,
      schema,
    });

    expect(response.planSummaries[0]).toMatchObject({
      kind: "create",
      entity: "task",
      values: {
        actorMode: "authenticated",
        actorPrincipalId: "principal-ada",
        title: "Authenticated task",
      },
    });
  });

  it("materializes deterministic calendar dates across UTC and daylight-saving boundaries", async () => {
    const cases = [
      {
        expected: "2025-12-31",
        receivedAt: "2026-01-01T00:30:00.000Z",
        timeZone: "America/Los_Angeles",
      },
      {
        expected: "2026-07-01",
        receivedAt: "2026-06-30T14:00:00.000Z",
        timeZone: "Australia/Sydney",
      },
      {
        expected: "2026-03-08",
        receivedAt: "2026-03-08T07:00:00.000Z",
        timeZone: "America/New_York",
      },
      {
        expected: "2026-11-01",
        receivedAt: "2026-11-01T06:00:00.000Z",
        timeZone: "America/New_York",
      },
    ];

    for (const [index, input] of cases.entries()) {
      const schema = materializerSchema([
        {
          name: "createTask",
          kind: "create",
          entity: "task",
          values: {
            title: { kind: "literal", value: `Generated date ${index}` },
            done: { kind: "literal", value: false },
            businessDate: { kind: "generatedDate", timeZone: input.timeZone },
            repeatedBusinessDate: { kind: "generatedDate", timeZone: input.timeZone },
          },
        },
      ]);
      const operation = submitPlanOperation(schema);
      const materializedDates: string[] = [];

      for (const repetition of [1, 2]) {
        materializerHarnessName = randomUUID();
        const operationId = `operation:task.submitPlan:generated-date-${index}-${repetition}`;
        const response = await postMaterialize({
          effect: requireRecordPlanEffect(operation),
          envelope: operationEnvelope(operation, {
            input: {},
            operationId,
            receivedAt: input.receivedAt,
          }),
          inputValues: {},
          operationId,
          schema,
        });
        const summary = response.planSummaries[0];
        if (summary?.kind !== "create") {
          throw new Error("Expected generated-date create plan summary.");
        }

        expect(summary.values).toMatchObject({
          businessDate: input.expected,
          repeatedBusinessDate: input.expected,
        });
        materializedDates.push(summary.values.businessDate as string);
      }

      expect(materializedDates).toEqual([input.expected, input.expected]);
    }
  });

  it("rejects generated dates when the received instant is invalid", async () => {
    const schema = materializerSchema([
      {
        name: "createTask",
        kind: "create",
        entity: "task",
        values: {
          title: { kind: "literal", value: "Invalid instant" },
          done: { kind: "literal", value: false },
          businessDate: { kind: "generatedDate", timeZone: "UTC" },
        },
      },
    ]);
    const operation = submitPlanOperation(schema);
    const operationId = "operation:task.submitPlan:generated-date-invalid-instant";
    const response = await postMaterializeFailure({
      effect: requireRecordPlanEffect(operation),
      envelope: operationEnvelope(operation, {
        input: {},
        operationId,
        receivedAt: "not-an-instant",
      }),
      inputValues: {},
      operationId,
      schema,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Record plan generatedDate requires a valid receivedAt instant.",
    });
  });

  it("materializes related-record values from one target snapshot", async () => {
    const schema = materializerSchema(
      [
        {
          name: "createLog",
          kind: "create",
          entity: "task-log",
          recordId: { kind: "literal", value: "target-log" },
          values: {
            task: {
              kind: "reference",
              entity: "task",
              id: { kind: "targetRecordId" },
            },
            label: { kind: "targetField", field: "title" },
            actorMode: { kind: "literal", value: "owner" },
            sourcePath: { kind: "targetField", field: "marker" },
            occurredAt: { kind: "generatedTimestamp" },
          },
        },
      ],
      {},
      "record",
    );
    const operation = submitPlanOperation(schema);
    const operationId = "operation:task.submitPlan:materializer-target";
    const targetRecord = existingTaskRecord();
    const inputValues = {
      existingTaskId: "task-existing",
      note: "Target snapshot",
      title: "Ignored input",
    };
    const response = await postMaterialize({
      effect: requireRecordPlanEffect(operation),
      envelope: operationEnvelope(operation, {
        input: inputValues,
        operationId,
        receivedAt: "2026-06-25T12:42:56.000Z",
      }),
      inputValues,
      operationId,
      records: [targetRecord],
      schema,
      targetRecord,
    });

    expect(response.planSummaries[0]).toEqual({
      kind: "create",
      entity: "task-log",
      id: "target-log",
      values: {
        task: "task-existing",
        label: "Existing task",
        actorMode: "owner",
        occurredAt: "2026-06-25T12:42:56.000Z",
      },
    });
  });

  it("rejects missing target records before committing materialized plans", async () => {
    const schema = materializerSchema([
      {
        name: "patchMissing",
        kind: "patch",
        entity: "task",
        recordId: { kind: "literal", value: "missing-task" },
        values: {
          title: { kind: "literal", value: "Missing target" },
        },
      },
    ]);
    const operation = submitPlanOperation(schema);
    const response = await postMaterializeFailure({
      effect: requireRecordPlanEffect(operation),
      envelope: operationEnvelope(operation, {
        input: { existingTaskId: "task-existing", note: "No target", title: "No target" },
        operationId: "operation:task.submitPlan:materializer-missing-target",
        receivedAt: "2026-06-25T12:35:56.000Z",
      }),
      inputValues: {
        existingTaskId: "task-existing",
        note: "No target",
        title: "No target",
      },
      operationId: "operation:task.submitPlan:materializer-missing-target",
      schema,
    });
    expect(response.status).toBe(400);
    expect(
      (await response.json()) as {
        error: string;
      },
    ).toEqual({
      error: 'Unknown record "missing-task".',
    });
  });
});

async function postMaterialize(body: MaterializeRequest) {
  const response = await postMaterializeFailure(body);

  expect(response.status).toBe(200);

  return (await response.json()) as MaterializeResponse;
}

function postMaterializeFailure(body: MaterializeRequest) {
  return harness.fetch("/materialize", {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      "x-record-plan-materializer-harness-name": materializerHarnessName,
    },
    method: "POST",
  });
}

function materializerSchema(
  steps: RecordPlanEntityOperationEffectSchema["steps"] = materializerRecordPlanSteps(),
  taskOverrides: Record<string, unknown> = {},
  scope: EntityOperationSchema["scope"] = "collection",
): AppSchema {
  return parseAppSchema({
    version: 1,
    entities: [
      {
        id: "entity_0c0728f9-fb06-44a6-b15d-a47dbf03e681",
        key: "task",
        label: "Task",
        fields: [
          { key: "title", type: "text", required: true, label: "Title" },
          { key: "done", type: "boolean", required: true, label: "Done", default: false },
          { key: "marker", type: "text", required: false, label: "Marker" },
          { key: "generatedCode", type: "text", required: false, label: "Generated code" },
          { key: "humanCode", type: "text", required: false, label: "Human code" },
          { key: "submittedAt", type: "text", required: false, label: "Submitted at" },
          { key: "actorMode", type: "text", required: false, label: "Actor mode" },
          { key: "actorPrincipalId", type: "text", required: false, label: "Actor principal" },
          { key: "sourceProtocol", type: "text", required: false, label: "Source protocol" },
          { key: "sourceHost", type: "text", required: false, label: "Source host" },
          { key: "sourcePath", type: "text", required: false, label: "Source path" },
          { key: "businessDate", type: "date", required: false, label: "Business date" },
          {
            key: "repeatedBusinessDate",
            type: "date",
            required: false,
            label: "Repeated business date",
          },
        ],
        operations: [
          {
            key: "submitPlan",
            ...recordPlanOperation(steps, scope),
          },
        ],
        ...taskOverrides,
      },
      {
        id: "entity_99cbe436-fdee-4d8e-993a-0d735995877d",
        key: "task-log",
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
      },
    ],
    queries: [
      {
        key: "taskAll",
        label: "All tasks",
        entity: "task",
        expression: { kind: "all" },
      },
    ],
    itemViews: [
      {
        key: "taskListItem",
        entity: "task",
        fields: [{ field: "title", editor: "text", commit: "field-commit" }],
      },
    ],
    tableViews: [],
    views: [
      {
        key: "taskHome",
        type: "collection",
        label: "Tasks",
        entity: "task",
        queries: [{ query: "taskAll" }],
        defaultQuery: "taskAll",
        result: { type: "list", itemView: "taskListItem" },
      },
    ],
    screens: [
      {
        key: "taskHome",
        type: "workspace",
        label: "Tasks",
        path: "/",
        layout: {
          type: "stack",
          sections: [{ id: "tasks", type: "collection", view: "taskHome" }],
        },
      },
    ],
  });
}
function recordPlanOperation(
  steps: RecordPlanEntityOperationEffectSchema["steps"],
  scope: EntityOperationSchema["scope"],
): EntityOperationSchema {
  return {
    label: "Submit plan",
    kind: "command",
    scope,
    input: {
      fields: [
        { key: "existingTaskId", type: "text", required: true, label: "Existing task" },
        { key: "title", type: "text", required: true, label: "Title" },
        { key: "note", type: "text", required: true, label: "Note" },
      ],
    },
    effect: {
      type: "recordPlan",
      steps,
    },
    output: { type: "command" },
    idempotency: { required: true },
    audit: { input: "summary" },
  };
}

function materializerRecordPlanSteps(): RecordPlanEntityOperationEffectSchema["steps"] {
  return [
    {
      name: "patchExisting",
      kind: "patch",
      entity: "task",
      recordId: { kind: "input", field: "existingTaskId" },
      values: {
        title: { kind: "input", field: "title" },
        sourcePath: { kind: "source", field: "path" },
      },
    },
    {
      name: "createTask",
      kind: "create",
      entity: "task",
      recordId: { kind: "generatedId", prefix: "task" },
      values: {
        title: { kind: "input", field: "title" },
        done: { kind: "literal", value: false },
        marker: { kind: "literal", value: "created" },
        generatedCode: { kind: "generatedId", prefix: "code" },
        humanCode: {
          kind: "generatedCode",
          alphabet: "upperAlphaNumericNoConfusables",
          groups: [4, 4],
          separator: "-",
          prefix: "ORD-",
        },
        submittedAt: { kind: "generatedTimestamp" },
        actorMode: { kind: "actor", field: "mode" },
        sourceProtocol: { kind: "source", field: "protocol" },
        sourceHost: { kind: "source", field: "host" },
        sourcePath: { kind: "source", field: "path" },
      },
    },
    {
      name: "createLog",
      kind: "create",
      entity: "task-log",
      recordId: { kind: "literal", value: "log-created" },
      values: {
        task: {
          kind: "reference",
          entity: "task",
          id: { kind: "stepOutput", step: "createTask", output: "id" },
        },
        label: { kind: "stepOutput", step: "createTask", output: "field", field: "title" },
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
        title: { kind: "stepOutput", step: "createLog", output: "field", field: "label" },
        marker: { kind: "literal", value: "touched" },
      },
    },
    {
      name: "tombstoneExisting",
      kind: "tombstone",
      entity: "task",
      recordId: { kind: "input", field: "existingTaskId" },
    },
  ];
}
function submitPlanOperation(schema: AppSchema): EntityOperationSchema {
  const operation = schema.entities
    .find((definition) => definition.key === "task")
    ?.operations!.find((definition) => definition.key === "submitPlan")!;
  if (!operation) {
    throw new Error("Expected task.submitPlan operation.");
  }

  return operation;
}

function requireRecordPlanEffect(
  operation: EntityOperationSchema,
): RecordPlanEntityOperationEffectSchema {
  if (operation.effect?.type !== "recordPlan") {
    throw new Error("Expected record-plan operation effect.");
  }

  return operation.effect;
}

function operationEnvelope(
  operation: EntityOperationSchema,
  input: {
    actor?: OperationInvocationEnvelope["actor"];
    input: Record<string, unknown>;
    operationId: string;
    receivedAt: string;
  },
): OperationInvocationEnvelope {
  return {
    invocationId: input.operationId,
    appStorageIdentity: programStorageIdentity(),
    actor: input.actor ?? { kind: "owner" },
    source: {
      protocol: "generated-ui",
      route: "/api/tasks/operations/task/submitPlan",
      host: "example.com",
      path: "/intake",
    },
    input: {
      type: "command",
      input: input.input,
    },
    idempotency: {
      required: true,
      key: "materializer-test",
      source: "caller",
      writeIdentity: input.operationId,
    },
    operation: {
      entityName: "task",
      operationName: "submitPlan",
      canonicalKey: "task.submitPlan",
      kind: "command",
      scope: operation.scope,
      effect: operation.effect,
      output: operation.output,
      policy: operation.policy,
    },
    receivedAt: input.receivedAt,
    schemaOperation: operation,
  };
}

function authenticatedSessionTarget() {
  return {
    appInstallId: "tasks",
    instanceId: "instance-1",
    routeId: "route-tasks",
    storageIdentity: "app:tasks",
    targetOrigin: "https://tasks.example.com",
    targetProfile: "app" as const,
  };
}

function existingTaskRecord(): StoredRecord {
  return {
    id: "task-existing",
    entity: "task",
    values: {
      title: "Existing task",
      done: false,
    },
    createdAt: "2026-06-25T00:00:00.000Z",
    updatedAt: "2026-06-25T00:00:00.000Z",
  };
}

function digitCodeRecords(): StoredRecord[] {
  return Array.from({ length: 10 }, (_, index) => ({
    id: `task-code-${index}`,
    entity: "task",
    values: {
      title: `Code ${index}`,
      done: false,
      humanCode: String(index),
    },
    createdAt: "2026-06-25T00:00:00.000Z",
    updatedAt: "2026-06-25T00:00:00.000Z",
  }));
}

async function writeRecordPlanMaterializerHarness() {
  materializerHarnessDir = await mkdtemp(join(tmpdir(), "formless-record-plan-materializer-"));
  const harnessPath = join(materializerHarnessDir, "record-plan-materializer-harness.ts");

  await writeFile(
    harnessPath,
    `
      import { DurableObject } from "cloudflare:workers";
      import {
        ensureStorageTables,
        getBootstrapRecords,
        initializeStorageFromSource,
        restoreStorageSnapshot,
        writeRecordSetForCommandOperationOutcome,
      } from "${process.cwd()}/src/worker/storage.ts";
      import {
        materializeRecordPlan,
        recordPlanOperationOutput,
      } from "${process.cwd()}/src/worker/record-plan-materializer.ts";

      export class RecordPlanMaterializerHarness extends DurableObject {
        constructor(ctx, env) {
          super(ctx, env);
          ensureStorageTables(ctx.storage);
        }

        async fetch(request) {
          const url = new URL(request.url);

          if (request.method === "POST" && url.pathname === "/materialize") {
            const body = await request.json();

            try {
              initializeStorageFromSource(
                this.ctx.storage,
                {
                  schema: body.schema,
                },
                { refreshActiveSchema: false },
              );
              if ((body.records ?? []).length > 0 && getBootstrapRecords(this.ctx.storage).length === 0) {
                restoreStorageSnapshot(this.ctx.storage, {
                  kind: "formless.storage-snapshot",
                  version: 1,
                  storageIdentity: "record-plan-materializer",
                  schemaKey: "test",
                  exportedAt: "2026-07-29T00:00:00.000Z",
                  schemaUpdatedAt: "2026-07-29T00:00:00.000Z",
                  sourceCursor: body.records.length,
                  schema: body.schema,
                  records: body.records,
                });
              }

              const materialization = materializeRecordPlan({
                effect: body.effect,
                envelope: body.envelope,
                inputValues: body.inputValues,
                operationId: body.operationId,
                schema: body.schema,
                storage: this.ctx.storage,
                targetRecord: body.targetRecord,
              });
              const planSummaries = summarizePlans(
                materialization.plans,
                body.envelope.receivedAt,
              );
              const output = writeRecordSetForCommandOperationOutcome(
                this.ctx.storage,
                body.operationId,
                materialization.plans,
                undefined,
                { now: body.envelope.receivedAt },
              ).response;

              return Response.json({
                output: recordPlanOperationOutput(output, materialization),
                planSummaries,
                records: getBootstrapRecords(this.ctx.storage),
              });
            } catch (error) {
              return Response.json(
                { error: error instanceof Error ? error.message : "Unknown error." },
                { status: 400 },
              );
            }
          }

          return Response.json({ error: "Not found." }, { status: 404 });
        }
      }

      function summarizePlans(plans, changedAt) {
        const writtenRecords = [];
        const summaries = [];

        for (const plan of plans) {
          if (plan.kind === "create") {
            if (typeof plan.id !== "string") {
              throw new Error("Focused materializer harness expects create plans with ids.");
            }

            const values = valuesForPlan(plan.values, writtenRecords);
            writtenRecords.push({
              id: plan.id,
              entity: plan.entity,
              values,
              createdAt: changedAt,
              updatedAt: changedAt,
            });
            summaries.push({
              kind: "create",
              entity: plan.entity,
              id: plan.id,
              values,
            });
            continue;
          }

          const record =
            typeof plan.record === "function" ? plan.record([...writtenRecords]) : plan.record;

          if (plan.kind === "patch") {
            const values = valuesForPlan(plan.values, writtenRecords);
            writtenRecords.push({
              ...record,
              values,
              updatedAt: changedAt,
            });
            summaries.push({
              kind: "patch",
              entity: record.entity,
              recordId: record.id,
              values,
            });
            continue;
          }

          writtenRecords.push({
            ...record,
            updatedAt: changedAt,
            deletedAt: changedAt,
          });
          summaries.push({
            kind: plan.kind,
            entity: record.entity,
            recordId: record.id,
          });
        }

        return summaries;
      }

      function valuesForPlan(values, writtenRecords) {
        return typeof values === "function" ? values([...writtenRecords]) : values;
      }

      export default {
        fetch(request, env) {
          const id = env.RECORD_PLAN_MATERIALIZER_HARNESS.idFromName(
            request.headers.get("x-record-plan-materializer-harness-name") ?? "default",
          );

          return env.RECORD_PLAN_MATERIALIZER_HARNESS.get(id).fetch(request);
        },
      };
    `,
  );

  return harnessPath;
}
