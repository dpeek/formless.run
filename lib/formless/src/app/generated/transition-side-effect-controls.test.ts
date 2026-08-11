import { describe, expect, it } from "vite-plus/test";
import { parseAppSchema, type AppSchema, type CollectionViewSchema } from "@dpeek/formless-schema";
import type { StoredRecord } from "@dpeek/formless-storage";
import { selectHomeResultModel } from "../../client/collection-result-model.ts";
import type { TableCollectionResultModel } from "../../client/collection-result-model.ts";
import { selectTableResultModel } from "../../client/table-model.ts";
import {
  createGeneratedOperationController,
  type GeneratedOperationAuthoritySubmitter,
} from "../../client/views.ts";
import type {
  OperationInvocationRequest,
  OperationInvocationResponse,
} from "../../shared/operation-invocation.ts";
import type { ChangeRow } from "../../shared/protocol.ts";
import { selectGeneratedWorkspaceTableFoundation } from "./generated-table-foundation.tsx";
import { selectGeneratedRecordResultFoundation } from "./generated-record-result-foundation.ts";
import { executeTransitionStateOperation } from "./state-machine-operation-runtime.ts";

describe("generated transition side-effect controls", () => {
  it("projects only explicitly bound table transitions while state cells stay read-only", () => {
    const fixture = transitionControlFixture();
    const projectionController = createGeneratedOperationController({ bindings: [] });
    const table = selectGeneratedWorkspaceTableFoundation({
      controller: projectionController,
      entity: fixture.entity,
      entityName: "intake",
      id: "intakes:table",
      query: fixture.query.expression,
      queryName: "intakeAll",
      recordIds: [fixture.pending.id, fixture.converted.id],
      recordsById: fixture.recordsById,
      result: fixture.tableResult,
      schema: fixture.schema,
    });
    const rowTransitions = table.runtimePlan.operations.filter(
      (operation) => operation.kind === "transition",
    );

    expect(rowTransitions).toEqual([]);
    const tableStatusValues = table.table.rows.map((row) =>
      row.cells
        .find((cell) => cell.columnId === "field:status")
        ?.contents.find((content) => content.kind === "cellValue"),
    );
    expect(tableStatusValues).toMatchObject([
      { kind: "cellValue", presentation: { kind: "state" } },
      { kind: "cellValue", presentation: { kind: "state" } },
    ]);
    expect(table.editFieldsById.size).toBe(0);
    expect(JSON.stringify(table.table)).not.toContain("stateMachineFacts");

    const explicitView = {
      ...fixture.schema.tableViews.find((definition) => definition.key === "intakeTable")!,
      key: "intakeActionTable",
      operations: [{ operation: "intake.convert", label: "Convert intake" }],
      columns: [
        { type: "field", field: "title" } as const,
        { type: "field", field: "status" } as const,
        { type: "operationControl" } as const,
      ],
    };
    const explicitResult = {
      ...selectTableResultModel(fixture.schema, explicitView, "intake", fixture.entity),
      tableViewName: explicitView.key,
      type: "table",
    } satisfies TableCollectionResultModel;
    const baseExplicit = selectGeneratedWorkspaceTableFoundation({
      controller: projectionController,
      entity: fixture.entity,
      entityName: "intake",
      id: "intakes:actions",
      query: fixture.query.expression,
      queryName: "intakeAll",
      recordIds: [fixture.pending.id, fixture.converted.id],
      recordsById: fixture.recordsById,
      result: explicitResult,
      schema: fixture.schema,
    });
    const explicitController = createGeneratedOperationController({
      bindings: baseExplicit.runtimePlan.operations.map((operation) => operation.binding),
    });
    const explicit = selectGeneratedWorkspaceTableFoundation({
      controller: explicitController,
      entity: fixture.entity,
      entityName: "intake",
      id: "intakes:actions",
      query: fixture.query.expression,
      queryName: "intakeAll",
      recordIds: [fixture.pending.id, fixture.converted.id],
      recordsById: fixture.recordsById,
      result: explicitResult,
      schema: fixture.schema,
    });
    const explicitTransitions = explicit.runtimePlan.operations.filter(
      (operation) => operation.kind === "transition",
    );

    expect(explicitTransitions).toMatchObject([
      {
        binding: {
          availability: { state: "enabled" },
          input: { kind: "stateTransition", transitionName: "convert" },
          label: "Convert intake",
        },
        kind: "transition",
        recordId: "intake-pending",
      },
      {
        binding: {
          availability: { state: "disabled" },
          label: "Convert intake",
        },
        kind: "transition",
        recordId: "intake-converted",
      },
    ]);
    const explicitActionGroups = explicit.table.rows.map(
      (row) =>
        row.cells.find((cell) => cell.columnId === "operationControl:intake.convert")?.contents[0],
    );
    expect(explicitActionGroups).toMatchObject([
      {
        accessibilityLabel: "More options for Intake intake-pending",
        actions: [{ kind: "operationAction", role: "transition" }],
        kind: "actionGroup",
      },
      {
        accessibilityLabel: "More options for Intake intake-converted",
        actions: [
          {
            control: { trigger: { disabled: true } },
            kind: "operationAction",
            role: "transition",
          },
        ],
        kind: "actionGroup",
      },
    ]);
    const detail = selectGeneratedRecordResultFoundation({
      entity: fixture.entity,
      entityName: "intake",
      id: "intakes:detail",
      recordIds: [fixture.pending.id],
      recordsById: fixture.recordsById,
      result: fixture.detailResult,
      schema: fixture.schema,
    });
    const detailTransition = detail.runtimePlan.operations!.find(
      (operation) => operation.kind === "transition",
    );
    expect(detailTransition).toMatchObject({
      binding: {
        availability: { state: "enabled" },
        input: {
          fieldName: "status",
          kind: "stateTransition",
          machineName: "conversion",
          targetState: "converted",
          transitionName: "convert",
        },
        kind: "stateTransition",
      },
      kind: "transition",
      recordId: "intake-pending",
    });
    expect(detailTransition?.operation.operation.operation.effect).toMatchObject({
      handler: "transition-state",
      config: {
        sideEffects: {
          type: "recordPlan",
          steps: [{ entity: "order", kind: "create", name: "createOrder" }],
        },
      },
    });
    const detailStatus = detail.recordResult.fields.find((field) => field.fieldName === "status");
    expect(detailStatus?.stateMachineFacts?.interaction).toMatchObject({
      kind: "transitions",
      transitions: [
        {
          control: { trigger: { disabled: false } },
          operationName: "convert",
        },
      ],
    });
    expect(detail.recordResult.actions.primary).toEqual([]);
  });

  it("returns side-effect create ids for replayed detail invocations", async () => {
    const fixture = transitionControlFixture();
    const detail = selectGeneratedRecordResultFoundation({
      entity: fixture.entity,
      entityName: "intake",
      id: "intakes:detail",
      recordIds: [fixture.pending.id],
      recordsById: fixture.recordsById,
      result: fixture.detailResult,
      schema: fixture.schema,
    });
    const detailTransition = detail.runtimePlan.operations!.find(
      (operation) => operation.kind === "transition",
    );
    if (detailTransition?.kind !== "transition") {
      throw new Error("Missing generated detail transition control.");
    }

    const output = transitionCommandOutput();
    const detailSubmit = captureAuthoritySubmitter(operationResponse(output, "replayed"));
    const detailController = createGeneratedOperationController({
      bindings: [detailTransition.binding],
      submitAuthorityOperation: detailSubmit.submit,
    });

    await expect(
      executeTransitionStateOperation({
        binding: detailTransition.binding,
        controller: detailController,
        operation: detailTransition.operation,
        recordId: detailTransition.recordId,
        setStatus: () => {},
        source: "button",
      }),
    ).resolves.toEqual({
      affectedCount: 2,
      createdRecordIds: ["order-1"],
      output,
      type: "replayed",
    });
    expect(detailSubmit.calls).toEqual([
      {
        entityName: "intake",
        operationName: "convert",
        request: {
          recordId: "intake-pending",
          source: { protocol: "generated-ui", surface: "button" },
        },
      },
    ]);
  });
});
function transitionControlFixture() {
  const schema = transitionSideEffectSchema();
  const entity = schema.entities.find((definition) => definition.key === "intake")!;
  const query = schema.queries.find((definition) => definition.key === "intakeAll")!;
  const tableResult = selectHomeResultModel(
    schema,
    requiredCollectionView(schema, "intakeTable"),
    entity,
  );
  const detailResult = selectHomeResultModel(
    schema,
    requiredCollectionView(schema, "intakeDetail"),
    entity,
  );

  if (tableResult.type !== "table" || detailResult.type !== "record") {
    throw new Error("Missing generated transition test results.");
  }

  const pending = intakeRecord("intake-pending", "pending");
  const converted = intakeRecord("intake-converted", "converted");

  return {
    converted,
    detailResult,
    entity,
    pending,
    query,
    recordsById: {
      [converted.id]: converted,
      [pending.id]: pending,
    },
    schema,
    tableResult,
  };
}

function transitionSideEffectSchema() {
  return parseAppSchema({
    version: 1,
    entities: [
      {
        id: "entity_331d9bb4-7166-40da-ba3f-ad9b4208af07",
        key: "intake",
        label: "Intake",
        fields: [
          { key: "title", type: "text", required: true },
          {
            key: "status",
            type: "enum",
            required: true,
            default: "pending",
            values: [
              { key: "pending", label: "Pending" },
              { key: "converted", label: "Converted" },
            ],
          },
        ],
        stateMachines: [
          {
            key: "conversion",
            field: "status",
            initial: "pending",
            terminal: ["converted"],
            transitions: [
              {
                key: "convert",
                label: "Convert",
                from: ["pending"],
                to: "converted",
              },
            ],
          },
        ],
        operations: [
          {
            key: "convert",
            label: "Convert",
            kind: "command",
            scope: "record",
            effect: {
              type: "operationHandler",
              handler: "transition-state",
              config: {
                machine: "conversion",
                transition: "convert",
                sideEffects: {
                  type: "recordPlan",
                  steps: [
                    {
                      name: "createOrder",
                      kind: "create",
                      entity: "order",
                      recordId: { kind: "generatedId", prefix: "order" },
                      values: {
                        intake: {
                          kind: "reference",
                          entity: "intake",
                          id: { kind: "targetRecordId" },
                        },
                        title: { kind: "targetField", field: "title" },
                      },
                    },
                  ],
                },
              },
            },
            output: { type: "command" },
            idempotency: { required: true },
            audit: { input: "summary" },
            policy: { actors: ["owner"] },
          },
        ],
      },
      {
        id: "entity_14ef9cab-d548-422a-9231-55571f493bb9",
        key: "order",
        label: "Order",
        fields: [
          { key: "intake", type: "reference", required: true, to: "intake" },
          { key: "title", type: "text", required: true },
        ],
      },
    ],
    queries: [
      {
        key: "intakeAll",
        label: "All intakes",
        entity: "intake",
        expression: { kind: "all" },
      },
    ],
    itemViews: [
      {
        key: "intakeItem",
        entity: "intake",
        fields: [
          { field: "title", editor: "text" },
          { field: "status", editor: "enum" },
        ],
      },
    ],
    tableViews: [
      {
        key: "intakeTable",
        entity: "intake",
        columns: [
          { type: "field", field: "title" },
          { type: "field", field: "status" },
        ],
      },
    ],
    views: [
      {
        key: "intakeTable",
        type: "collection",
        label: "Intakes",
        entity: "intake",
        queries: [{ query: "intakeAll" }],
        defaultQuery: "intakeAll",
        result: { type: "table", tableView: "intakeTable" },
      },
      {
        key: "intakeDetail",
        type: "collection",
        label: "Intake",
        entity: "intake",
        queries: [{ query: "intakeAll" }],
        defaultQuery: "intakeAll",
        result: { type: "record", itemView: "intakeItem" },
      },
    ],
    screens: [
      {
        key: "home",
        type: "workspace",
        label: "Intakes",
        layout: {
          type: "stack",
          sections: [
            { id: "intakes", type: "collection", view: "intakeTable" },
            { id: "intake", type: "collection", view: "intakeDetail" },
          ],
        },
      },
    ],
  });
}
function requiredCollectionView(schema: AppSchema, viewName: string): CollectionViewSchema {
  const view = schema.views.find((definition) => definition.key === viewName)!;
  if (view?.type !== "collection") {
    throw new Error(`Missing collection view "${viewName}".`);
  }

  return view;
}

function intakeRecord(id: string, status: "pending" | "converted"): StoredRecord {
  return {
    id,
    entity: "intake",
    values: {
      status,
      title: `Intake ${id}`,
    },
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z",
  };
}
function transitionCommandOutput(): Extract<
  OperationInvocationResponse["output"],
  {
    type: "command";
  }
> {
  const transitioned = intakeRecord("intake-pending", "converted");
  const order: StoredRecord = {
    id: "order-1",
    entity: "order",
    values: {
      intake: "intake-pending",
      title: "Intake intake-pending",
    },
    createdAt: "2026-07-27T00:00:01.000Z",
    updatedAt: "2026-07-27T00:00:01.000Z",
  };

  return {
    type: "command",
    affectedChangeIds: ["write-transition", "write-order"],
    changes: [
      change(1, transitioned, "update", "write-transition"),
      change(2, order, "create", "write-order"),
    ],
    cursor: 2,
    recordPlan: {
      steps: [
        {
          name: "createOrder",
          kind: "create",
          entity: "order",
          recordId: "order-1",
          changeId: "write-order",
        },
      ],
    },
  };
}

function change(
  seq: number,
  record: StoredRecord,
  operationKind: ChangeRow["operationKind"],
  writeId: string,
): ChangeRow {
  return {
    seq,
    writeId,
    operationKind,
    entity: record.entity,
    recordId: record.id,
    payload: record,
    createdAt: "2026-07-27T00:00:01.000Z",
  };
}

type AuthoritySubmitCall = {
  entityName: string;
  operationName: string;
  request: OperationInvocationRequest;
};

function captureAuthoritySubmitter(response: OperationInvocationResponse): {
  calls: AuthoritySubmitCall[];
  submit: GeneratedOperationAuthoritySubmitter;
} {
  const calls: AuthoritySubmitCall[] = [];

  return {
    calls,
    submit: async (entityName, operationName, request) => {
      calls.push({
        entityName,
        operationName,
        request,
      });

      return response;
    },
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
