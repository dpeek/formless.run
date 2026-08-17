import { describe, expect, it } from "vite-plus/test";
import type {
  AppSchema,
  CollectionViewSchema,
  EntitySchema,
  KeyedDefinition,
  TableViewSchema,
} from "@dpeek/formless-schema";
import { sourceLikeSiteSchema, sourceLikeTaskSchema } from "../test/schema-builders.ts";
import { selectHomeCollectionShell } from "./collection-shell-model.ts";
import {
  createIdleGeneratedOperationExecutionState,
  projectCollectionOperationControlBinding,
  projectCollectionOperationControlBindings,
  projectOrderingMoveOperationControlBinding,
  projectPublicOperationFormControlBinding,
  projectRecordDeleteOperationControlBinding,
  projectRecordOperationControlBinding,
  projectStateTransitionOperationControlBinding,
  projectTableOperationControlBinding,
  projectTableOperationControlBindings,
  projectTreeCompositionOperationControlBindings,
  projectWorkspaceOperationControlBinding,
} from "./operation-control-model.ts";
import type { GeneratedOperationExecutionState } from "./operation-control-model.ts";
import {
  selectEntityOperationByKind,
  selectEntityOperationPresentation,
} from "./operation-presentation-model.ts";
import {
  selectTransitionStateOperationAvailability,
  selectTransitionStateOperations,
} from "./state-machine-model.ts";
import { selectTableResultModel } from "./table-model.ts";
import { selectTreeResultModel } from "./tree-result-model.ts";

describe("generated operation control model", () => {
  it("projects collection create and command controls with caller and execution contracts", () => {
    const schema = sourceLikeTaskSchema();
    const view = requiredCollectionView(schema, "taskHome");
    const shell = selectHomeCollectionShell(
      schema,
      schema.views.map((definition) => [definition.key, definition]),
      view,
      schema.entities.find((definition) => definition.key === "task")!,
    );
    const bindings = projectCollectionOperationControlBindings(shell.operations);
    expect(createIdleGeneratedOperationExecutionState("task.create")).toEqual({
      executionKey: "task.create",
      status: "idle",
    });
    expect(
      bindings.map((binding) => ({
        id: binding.id,
        executionKey: binding.executionKey,
        canonicalOperationKey: binding.canonicalOperationKey,
        kind: binding.kind,
        operationKind: binding.operationKind,
        scope: binding.scope,
        inputKind: binding.input.kind,
      })),
    ).toEqual([
      {
        id: "collection:task.create",
        executionKey: "task.create",
        canonicalOperationKey: "task.create",
        kind: "create",
        operationKind: "create",
        scope: "collection",
        inputKind: "createForm",
      },
      {
        id: "collection:task.clearCompletedTasks",
        executionKey: "task.clearCompletedTasks",
        canonicalOperationKey: "task.clearCompletedTasks",
        kind: "command",
        operationKind: "command",
        scope: "collection",
        inputKind: "collectionCommand",
      },
    ]);
  });

  it("projects entity-backed and inline command fields for collection, record, and table controls", () => {
    const entity = commandInputEntity();
    const collectionOperation = selectEntityOperationPresentation(
      entity.key,
      "intake",
      entity.operations![0]!,
    );
    const recordOperation = selectEntityOperationPresentation(
      entity.key,
      "addSample",
      entity.operations![1]!,
    );
    const collectionBinding = projectCollectionOperationControlBinding({
      type: "command",
      placement: "toolbar",
      label: "Create order",
      entityName: entity.key,
      entity,
      operationName: "intake",
      operation: collectionOperation,
      ui: { showAffectedCountOnSuccess: false },
    });
    const recordBinding = projectRecordOperationControlBinding({
      entity,
      entityLabel: entity.label,
      operation: recordOperation,
    });
    const tableBinding = projectTableOperationControlBinding({
      bindingName: "compound-line.addSample",
      disabled: false,
      entity,
      label: "Add sample",
      operation: recordOperation,
      type: "static",
      variant: "default",
    });

    expect(collectionBinding.input).toMatchObject({
      kind: "collectionCommand",
      form: {
        fields: [
          {
            editor: "text",
            entityFieldName: "operatorEmail",
            field: { type: "text", format: "email", required: true },
            inputName: "email",
            label: "Operator email",
          },
        ],
      },
    });
    expect(recordBinding.input).toMatchObject({
      kind: "recordCommand",
      form: {
        fields: [
          {
            editor: "enum",
            field: {
              type: "enum",
              required: true,
              values: [
                { key: "analytical", label: "Analytical" },
                { key: "sterility", label: "Sterility" },
              ],
            },
            inputName: "assayRole",
            label: "Assay",
          },
          {
            default: { kind: "generatedDate", timeZone: "Australia/Sydney" },
            editor: "date",
            entityFieldName: "receivedAt",
            inputName: "receivedAt",
            label: "Received at",
          },
        ],
      },
    });
    if (recordBinding.input.kind !== "recordCommand") {
      throw new Error("Expected record command input.");
    }
    expect(tableBinding?.input).toMatchObject({
      kind: "tableCommand",
      form: recordBinding.input.form,
    });
  });

  it("keeps input-free commands free of generated form state", () => {
    const entity = commandInputEntity();
    const operation = selectEntityOperationPresentation(
      entity.key,
      "refresh",
      entity.operations![2]!,
    );

    expect(
      projectRecordOperationControlBinding({
        entity,
        entityLabel: entity.label,
        operation,
      }).input,
    ).toEqual({ kind: "recordCommand" });
  });

  it("models optional display-safe progress on operation execution state", () => {
    const state = {
      executionKey: "workspace.source.push",
      status: "pending",
      startedAt: 1000,
      progress: {
        title: "Pushing workspace",
        detail: "Preparing source changes.",
        updatedAt: 1100,
        steps: [
          {
            id: "prepare",
            label: "Prepare source",
            status: "running",
          },
          {
            id: "submit",
            label: "Submit push",
            detail: "Waiting for gateway response.",
            status: "pending",
          },
        ],
      },
    } satisfies GeneratedOperationExecutionState;

    expect(state.progress).toEqual({
      title: "Pushing workspace",
      detail: "Preparing source changes.",
      updatedAt: 1100,
      steps: [
        {
          id: "prepare",
          label: "Prepare source",
          status: "running",
        },
        {
          id: "submit",
          label: "Submit push",
          detail: "Waiting for gateway response.",
          status: "pending",
        },
      ],
    });
  });
  it("omits hidden table controls and projects disabled destructive confirmations", () => {
    const schema = sourceLikeSiteSchema();
    const tableView = {
      entity: "block-placement",
      operations: [
        {
          operation: "block.update",
          label: "Edit block",
          availability: { state: "hidden" },
          target: { kind: "reference", field: "block" },
          editView: "blockEdit",
        },
        {
          operation: "block.delete",
          label: "Delete block",
          variant: "destructive",
          availability: { state: "disabled", reason: "Locked by publish" },
          target: { kind: "reference", field: "block" },
        },
      ],
      columns: [{ type: "operationControl" }],
    } satisfies TableViewSchema;

    const result = selectTableResultModel(
      schema,
      tableView,
      "block-placement",
      schema.entities.find((definition) => definition.key === "block-placement")!,
    );
    const column = result.columns.find((candidate) => candidate.type === "operationControl");
    if (column?.type !== "operationControl") {
      throw new Error("Missing operation-control column.");
    }

    const bindings = projectTableOperationControlBindings(column, {
      executionTargetKey: "block-1",
    });
    const deleteOperation = selectEntityOperationByKind(
      "block",
      schema.entities.find((definition) => definition.key === "block")!,
      "delete",
      "record",
    );

    if (!deleteOperation) {
      throw new Error("Missing block delete operation.");
    }

    const standaloneDelete = projectRecordDeleteOperationControlBinding({
      entityLabel: "Block",
      operation: deleteOperation,
      recordLabel: "Hero",
      options: { executionTargetKey: "block-1" },
    });

    expect(column.controls.map((control) => control.bindingName)).toEqual(["block.delete"]);
    expect(bindings).toHaveLength(1);
    expect(bindings[0]).toMatchObject({
      id: "table:block.delete",
      executionKey: "block.delete:block-1",
      canonicalOperationKey: "block.delete",
      label: "Delete block",
      availability: { state: "disabled", reason: "Locked by publish" },
      disabledReason: "Locked by publish",
      destructive: true,
      confirmation: {
        title: "Delete block?",
        actionLabel: "Delete block",
      },
      input: { kind: "tableStatic" },
    });
    expect(standaloneDelete?.executionKey).toBe(bindings[0]?.executionKey);
    expect(standaloneDelete?.canonicalOperationKey).toBe("block.delete");
  });
  it("projects transition, tree, ordering, public, and workspace operation facts", () => {
    const taskSchema = sourceLikeTaskSchema();
    const taskEntity = taskSchema.entities.find((definition) => definition.key === "task")!;
    taskEntity.fields = [
      ...taskEntity.fields,
      { key: "receivedAt", label: "Received at", required: false, type: "date" },
    ];
    taskEntity.stateMachines = [
      {
        field: "priority",
        initial: "low",
        terminal: ["high"],
        transitions: [
          {
            key: "escalate",
            label: "Escalate",
            from: ["low"],
            to: "normal",
          },
        ],
        key: "priorityFlow",
      },
    ];
    taskEntity.operations = [
      ...(taskEntity.operations ?? []),
      {
        label: "Escalate",
        kind: "command",
        scope: "record",
        input: {
          fields: [
            {
              key: "receivedAt",
              field: "receivedAt",
              required: true,
              default: { kind: "generatedDate", timeZone: "Australia/Sydney" },
            },
          ],
        },
        effect: {
          type: "operationHandler",
          handler: "transition-state",
          config: {
            machine: "priorityFlow",
            transition: "escalate",
            targetValues: {
              receivedAt: { kind: "input", field: "receivedAt" },
            },
          },
        },
        output: { type: "command" },
        idempotency: { required: true },
        audit: { input: "summary" },
        key: "escalatePriority",
      },
    ];
    const transition = selectTransitionStateOperations("task", taskEntity)[0];
    if (!transition) {
      throw new Error("Missing transition operation.");
    }

    const transitionBinding = projectStateTransitionOperationControlBinding({
      operation: transition,
      availability: selectTransitionStateOperationAvailability({
        operation: transition,
        currentValue: "high",
        field: transition.field,
      }),
      options: { executionTargetKey: "task-1" },
    });

    expect(transitionBinding).toMatchObject({
      executionKey: "task.escalatePriority:task-1",
      canonicalOperationKey: "task.escalatePriority",
      kind: "stateTransition",
      operationKind: "command",
      availability: { state: "disabled", reason: "Requires Low." },
      input: {
        form: {
          fields: [
            {
              default: { kind: "generatedDate", timeZone: "Australia/Sydney" },
              editor: "date",
              entityFieldName: "receivedAt",
              inputName: "receivedAt",
              label: "Received at",
            },
          ],
        },
        kind: "stateTransition",
        machineName: "priorityFlow",
        transitionName: "escalate",
        targetState: "normal",
      },
    });

    const siteSchema = sourceLikeSiteSchema();
    const treeView = requiredCollectionView(siteSchema, "siteCompositionHome");

    if (treeView.result.type !== "tree") {
      throw new Error("Expected tree result.");
    }

    const treeResult = selectTreeResultModel(
      siteSchema,
      treeView.result,
      "block-placement",
      siteSchema.entities.find((definition) => definition.key === "block-placement")!,
    );
    const treeBindings = projectTreeCompositionOperationControlBindings(treeResult.composition, {
      executionTargetKey: "placement-1",
    });
    const orderingBinding = projectOrderingMoveOperationControlBinding({
      direction: "up",
      label: "Move up",
      ordering: treeResult.ordering!,
      updateOperation: treeResult.placementUpdateOperation,
    });
    const publicBinding = projectPublicOperationFormControlBinding({
      canonicalKey: "contact-message.submit",
      entityName: "contact-message",
      operationName: "submit",
      route: "/api/site/public/operations/contact-message/submit",
      buttonLabel: "Send",
      successLabel: "Sent.",
      fields: [{ name: "email", label: "Email", required: true, control: "text" }],
      sourceBlockId: "block-contact",
    });
    const workspaceBinding = projectWorkspaceOperationControlBinding({
      key: "workspace.source.push",
      kind: "push",
      label: "Push",
      bootstrapAllowed: false,
      inputFields: ["dryRun", "targetAlias"],
      mode: "write",
      requiredCapability: "workspace-source-sync",
    });

    expect(treeBindings.map((binding) => binding.canonicalOperationKey)).toEqual([
      "block-placement.addTreeChild",
      "block-placement.removeTreePlacement",
    ]);
    expect(treeBindings[1]).toMatchObject({
      destructive: true,
      confirmation: {
        description: "The placement will be removed without deleting the child record.",
      },
      input: { kind: "treeComposition", action: "remove" },
    });
    expect(orderingBinding).toMatchObject({
      canonicalOperationKey: "block-placement.update",
      kind: "ordering",
      input: {
        kind: "orderingMove",
        direction: "up",
        fieldName: "order",
        scopeFieldNames: ["parent", "slot"],
      },
    });
    expect(publicBinding).toMatchObject({
      canonicalOperationKey: "contact-message.submit",
      scope: "public",
      kind: "publicForm",
      feedback: { successLabel: "Sent." },
      input: {
        kind: "publicForm",
        route: "/api/site/public/operations/contact-message/submit",
        sourceBlockId: "block-contact",
      },
    });
    expect(workspaceBinding).toMatchObject({
      canonicalOperationKey: "workspace.source.push",
      scope: "workspace",
      kind: "workspace",
      input: {
        kind: "workspace",
        inputFields: ["dryRun", "targetAlias"],
        operationKind: "push",
        requiredCapability: "workspace-source-sync",
      },
    });
  });
});
function requiredCollectionView(schema: AppSchema, viewName: string): CollectionViewSchema {
  const view = schema.views.find((definition) => definition.key === viewName)!;
  if (!view || view.type !== "collection") {
    throw new Error(`Missing collection view "${viewName}".`);
  }

  return view;
}

function commandInputEntity(): KeyedDefinition<EntitySchema> {
  return {
    key: "compound-line",
    id: "entity_compound_line",
    label: "Compound line",
    fields: [
      {
        key: "operatorEmail",
        label: "Email",
        type: "text",
        format: "email",
        required: false,
      },
      {
        key: "receivedAt",
        label: "Received at",
        type: "date",
        required: false,
      },
    ],
    operations: [
      {
        key: "intake",
        kind: "command",
        scope: "collection",
        input: {
          fields: [
            { key: "email", field: "operatorEmail", label: "Operator email", required: true },
          ],
        },
        output: { type: "command" },
        idempotency: { required: true },
        audit: { input: "summary" },
      },
      {
        key: "addSample",
        kind: "command",
        scope: "record",
        input: {
          fields: [
            {
              key: "assayRole",
              label: "Assay",
              required: true,
              type: "enum",
              values: [
                { key: "analytical", label: "Analytical" },
                { key: "sterility", label: "Sterility" },
              ],
            },
            {
              key: "receivedAt",
              field: "receivedAt",
              required: true,
              default: { kind: "generatedDate", timeZone: "Australia/Sydney" },
            },
          ],
        },
        output: { type: "command" },
        idempotency: { required: true },
        audit: { input: "summary" },
      },
      {
        key: "refresh",
        kind: "command",
        scope: "record",
        output: { type: "command" },
        idempotency: { required: true },
        audit: { input: "none" },
      },
    ],
  };
}
