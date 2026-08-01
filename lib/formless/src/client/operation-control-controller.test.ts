import { describe, expect, it } from "vite-plus/test";
import {
  buildGeneratedOperationInvocationRequest,
  createGeneratedOperationController,
  type GeneratedOperationAuthoritySubmitter,
  type GeneratedOperationRuntimeAdapterRequest,
  type GeneratedOperationRuntimeAdapterResponse,
} from "./operation-control-controller.ts";
import type {
  GeneratedOperationControlBinding,
  GeneratedOperationInputAdapter,
  GeneratedOperationProgress,
} from "./operation-control-model.ts";
import type { SubmitOperationOptions } from "./sync.ts";
import type {
  OperationInvocationRequest,
  OperationInvocationResponse,
} from "../shared/operation-invocation.ts";
import type { ChangeRow } from "../shared/protocol.ts";
import type { StoredRecord } from "@dpeek/formless-storage";

describe("generated operation control controller", () => {
  it("builds Authority invocation requests and normalizes committed create output", async () => {
    const created = record("task-1", "Ship controller");
    const output = {
      type: "create",
      affectedChangeIds: ["write-1"],
      changes: [change(1, created)],
      cursor: 1,
      record: created,
    } satisfies OperationInvocationResponse["output"];
    const autoSave = { enqueue: async () => {} };
    const submit = captureAuthoritySubmitter(operationResponse(output));
    const controller = createGeneratedOperationController({
      bindings: [
        binding({
          id: "create-task",
          input: { kind: "createForm", create: {} } as GeneratedOperationInputAdapter,
          kind: "create",
          label: "Create task",
        }),
      ],
      submitAuthorityOperation: submit.submit,
      writeOptions: { autoSave },
    });

    const result = await controller.execute({
      bindingId: "create-task",
      idempotencyKey: "create-task-1",
      input: { title: "Ship controller" },
      source: "submitButton",
    });

    expect(submit.calls).toEqual([
      {
        entityName: "task",
        operationName: "create",
        request: {
          idempotencyKey: "create-task-1",
          input: { title: "Ship controller" },
          source: { protocol: "generated-ui", surface: "submitButton" },
        },
        options: { autoSave },
      },
    ]);
    expect(result).toEqual({
      type: "committed",
      affectedCount: 1,
      createdRecordIds: ["task-1"],
      output,
    });
    expect(controller.getState("create-task")).toMatchObject({
      executionKey: "task.create",
      status: "committed",
      result,
    });
  });

  it("normalizes replayed Authority output", async () => {
    const deleted = record("task-1", "Done");
    const output = {
      type: "delete",
      affectedChangeIds: ["write-2"],
      changes: [change(2, { ...deleted, deletedAt: "2026-07-06T00:00:00.000Z" }, "delete")],
      cursor: 2,
      recordId: "task-1",
    } satisfies OperationInvocationResponse["output"];
    const controller = createGeneratedOperationController({
      bindings: [
        binding({
          id: "delete-task",
          executionKey: "task.delete:task-1",
          input: { kind: "recordDelete", entityLabel: "Task" },
          kind: "delete",
          label: "Delete",
          operationName: "delete",
        }),
      ],
      submitAuthorityOperation: captureAuthoritySubmitter(operationResponse(output, "replayed"))
        .submit,
    });

    const result = await controller.execute({
      bindingId: "delete-task",
      recordId: "task-1",
      source: "confirmationDialog",
    });

    expect(result).toEqual({
      type: "replayed",
      affectedCount: 1,
      output,
    });
  });

  it("normalizes affected counts and created record ids from command output", async () => {
    const created = record("task-2", "Created by command");
    const output = {
      type: "command",
      affectedChangeIds: ["write-3", "write-4"],
      changes: [change(3, created), change(4, record("task-3", "Other created"))],
      cursor: 4,
      recordPlan: {
        steps: [
          {
            name: "create-task",
            kind: "create",
            entity: "task",
            recordId: "task-2",
            changeId: "write-3",
          },
          {
            name: "patch-task",
            kind: "patch",
            entity: "task",
            recordId: "task-1",
            changeId: "write-4",
          },
        ],
      },
    } satisfies OperationInvocationResponse["output"];
    const controller = createGeneratedOperationController({
      bindings: [
        binding({
          id: "run-command",
          canonicalOperationKey: "task.backfill",
          input: { kind: "collectionCommand", ui: {} } as GeneratedOperationInputAdapter,
          kind: "command",
          label: "Backfill",
          operationName: "backfill",
        }),
      ],
      submitAuthorityOperation: captureAuthoritySubmitter(operationResponse(output)).submit,
    });

    await expect(
      controller.execute({ bindingId: "run-command", source: "button" }),
    ).resolves.toMatchObject({
      type: "committed",
      affectedCount: 2,
      createdRecordIds: ["task-2", "task-3"],
      output,
    });
  });

  it("returns display-safe failed results when execution throws", async () => {
    const controller = createGeneratedOperationController({
      bindings: [
        binding({
          id: "create-task",
          input: { kind: "createForm", create: {} } as GeneratedOperationInputAdapter,
        }),
      ],
      submitAuthorityOperation: async () => {
        throw { internal: "do not render" };
      },
    });

    const result = await controller.execute({
      bindingId: "create-task",
      input: { title: "Hidden error" },
      source: "submitButton",
    });

    expect(result).toEqual({
      type: "failed",
      displayError: "Operation failed.",
    });
    expect(controller.getState("create-task")).toMatchObject({
      status: "failed",
      result,
    });
  });

  it("delegates runtime bindings to runtime adapters", async () => {
    let captured: GeneratedOperationRuntimeAdapterRequest | undefined;
    const controller = createGeneratedOperationController({
      bindings: [
        binding({
          id: "push-workspace",
          canonicalOperationKey: "workspace.source.push",
          entityName: undefined,
          executionKey: "workspace.source.push",
          input: {
            bootstrapAllowed: false,
            inputFields: ["dryRun"],
            kind: "workspace",
            mode: "write",
            operationKind: "push",
          },
          kind: "workspace",
          label: "Push",
          operationName: "workspace.source.push",
          scope: "workspace",
        }),
      ],
      runtimeAdapters: {
        workspace: async (request) => {
          captured = request;
          return {
            status: "committed",
            displayMessage: "Push started.",
            output: { operationId: "workspace-op-1" },
          };
        },
      },
    });

    const result = await controller.execute({
      bindingId: "push-workspace",
      input: { dryRun: true },
      source: "button",
    });

    expect(captured).toMatchObject({
      binding: { id: "push-workspace" },
      input: { dryRun: true },
      source: { surface: "button" },
    });
    expect(result).toEqual({
      type: "committed",
      displayMessage: "Push started.",
      output: { operationId: "workspace-op-1" },
    });
  });

  it("passes resolved public form input to runtime adapters", async () => {
    let captured: GeneratedOperationRuntimeAdapterRequest | undefined;
    const controller = createGeneratedOperationController({
      bindings: [
        binding({
          id: "submit-contact",
          canonicalOperationKey: "contact-message.submit",
          entityName: "contact-message",
          input: {
            fields: [{ name: "email", label: "Email", required: true, control: "text" }],
            kind: "publicForm",
            route: "/api/site/public/operations/contact-message/submit",
            sourceBlockId: "block-contact",
          },
          kind: "publicForm",
          label: "Send",
          operationName: "submit",
          scope: "public",
        }),
      ],
      runtimeAdapters: {
        publicForm: async (request) => {
          captured = request;
          return {
            status: "committed",
            affectedCount: 1,
          };
        },
      },
    });

    const result = await controller.execute({
      bindingId: "submit-contact",
      idempotencyKey: "public-form-1",
      input: { email: "reader@example.com" },
      source: "submitButton",
    });

    expect(captured).toMatchObject({
      binding: { id: "submit-contact" },
      idempotencyKey: "public-form-1",
      input: { email: "reader@example.com" },
      route: "/api/site/public/operations/contact-message/submit",
      source: { surface: "submitButton" },
      sourceBlockId: "block-contact",
    });
    expect(captured).not.toHaveProperty("values");
    expect(result).toEqual({
      type: "committed",
      affectedCount: 1,
    });
  });

  it("shares pending state across controls with the same execution key", async () => {
    const deferred = deferredResponse();
    const submit = captureAuthoritySubmitter(deferred.promise);
    const controller = createGeneratedOperationController({
      bindings: [
        binding({
          id: "delete-button",
          executionKey: "task.delete:task-1",
          input: { kind: "recordDelete", entityLabel: "Task" },
          kind: "delete",
          label: "Delete",
          operationName: "delete",
        }),
        binding({
          id: "delete-menu",
          executionKey: "task.delete:task-1",
          input: { kind: "recordDelete", entityLabel: "Task" },
          kind: "delete",
          label: "Delete",
          operationName: "delete",
        }),
      ],
      submitAuthorityOperation: submit.submit,
    });

    const first = controller.execute({
      bindingId: "delete-button",
      recordId: "task-1",
      source: "confirmationDialog",
    });

    expect(controller.getState("delete-button")?.status).toBe("pending");
    expect(controller.getState("delete-menu")?.status).toBe("pending");
    expect(controller.isPending("delete-menu")).toBe(true);

    await expect(
      controller.execute({
        bindingId: "delete-menu",
        recordId: "task-1",
        source: "menuItem",
      }),
    ).resolves.toEqual({
      type: "replayed",
      displayMessage: "Another control is already running this operation.",
    });
    expect(submit.calls).toHaveLength(1);

    const output = {
      type: "delete",
      affectedChangeIds: ["write-5"],
      changes: [
        change(5, { ...record("task-1", "Done"), deletedAt: "2026-07-06T00:00:00.000Z" }, "delete"),
      ],
      cursor: 5,
      recordId: "task-1",
    } satisfies OperationInvocationResponse["output"];
    deferred.resolve(operationResponse(output));

    await expect(first).resolves.toMatchObject({
      type: "committed",
      affectedCount: 1,
    });
    expect(controller.getState("delete-menu")?.status).toBe("committed");
  });

  it("shares runtime adapter progress across controls with the same execution key", async () => {
    let resolveAdapter: (response: GeneratedOperationRuntimeAdapterResponse) => void = () => {};
    const adapterResponse = new Promise<GeneratedOperationRuntimeAdapterResponse>((resolve) => {
      resolveAdapter = resolve;
    });
    const pendingProgress = operationProgress({
      title: "Pushing workspace",
      detail: "Preparing source changes.",
      updatedAt: 2000,
      steps: [
        {
          id: "prepare",
          label: "Prepare source",
          status: "running",
        },
        {
          id: "submit",
          label: "Submit push",
          status: "pending",
        },
      ],
    });
    const controller = createGeneratedOperationController({
      bindings: [
        workspaceBinding("push-button", "workspace.source.push"),
        workspaceBinding("push-menu", "workspace.source.push"),
      ],
      runtimeAdapters: {
        workspace: (request) => {
          request.reportProgress(pendingProgress);
          return adapterResponse;
        },
      },
    });

    const first = controller.execute({
      bindingId: "push-button",
      input: { dryRun: false },
      source: "button",
    });

    expect(controller.getState("push-button")).toMatchObject({
      executionKey: "workspace.source.push",
      status: "pending",
      progress: pendingProgress,
    });
    expect(controller.getState("push-menu")).toMatchObject({
      executionKey: "workspace.source.push",
      status: "pending",
      progress: pendingProgress,
    });

    resolveAdapter({
      status: "committed",
      displayMessage: "Push committed.",
      output: { operationId: "workspace-op-1" },
    });

    await expect(first).resolves.toEqual({
      type: "committed",
      displayMessage: "Push committed.",
      output: { operationId: "workspace-op-1" },
    });
    expect(controller.getState("push-menu")).toMatchObject({
      status: "committed",
      progress: pendingProgress,
    });
  });

  it("normalizes runtime adapter replayed and failed results with display-safe progress", async () => {
    const replayProgress = operationProgress({
      title: "Pushing workspace",
      updatedAt: 3000,
      steps: [
        {
          id: "submit",
          label: "Submit push",
          status: "succeeded",
        },
      ],
    });
    const replayController = createGeneratedOperationController({
      bindings: [workspaceBinding("push-workspace", "workspace.source.push")],
      runtimeAdapters: {
        workspace: async () => ({
          status: "replayed",
          displayMessage: "Push already applied.",
          progress: replayProgress,
        }),
      },
    });

    await expect(
      replayController.execute({
        bindingId: "push-workspace",
        source: "button",
      }),
    ).resolves.toEqual({
      type: "replayed",
      displayMessage: "Push already applied.",
    });
    expect(replayController.getState("push-workspace")).toMatchObject({
      status: "replayed",
      progress: replayProgress,
    });

    const failedProgress = operationProgress({
      title: "Pushing workspace",
      detail: "Provider details are hidden.",
      updatedAt: 4000,
      steps: [
        {
          id: "submit",
          label: "Submit push",
          detail: "Push failed.",
          status: "failed",
        },
      ],
    });
    const failedController = createGeneratedOperationController({
      bindings: [workspaceBinding("push-workspace", "workspace.source.push")],
      runtimeAdapters: {
        workspace: async () => ({
          status: "failed",
          displayError: "Push failed.",
          progress: failedProgress,
        }),
      },
    });

    await expect(
      failedController.execute({
        bindingId: "push-workspace",
        source: "button",
      }),
    ).resolves.toEqual({
      type: "failed",
      displayError: "Push failed.",
    });
    expect(failedController.getState("push-workspace")).toMatchObject({
      status: "failed",
      progress: failedProgress,
      result: {
        type: "failed",
        displayError: "Push failed.",
      },
    });
  });

  it("builds specialized Authority request shapes", () => {
    expect(
      buildGeneratedOperationInvocationRequest(
        binding({
          id: "move-up",
          input: {
            direction: "up",
            fieldName: "order",
            kind: "orderingMove",
            scopeFieldNames: ["parent"],
          },
          kind: "ordering",
          label: "Move up",
          operationName: "update",
        }),
        {
          bindingId: "move-up",
          input: { order: 20 },
          recordId: "placement-1",
          source: "menuItem",
        },
      ),
    ).toMatchObject({
      recordId: "placement-1",
      input: { order: 20 },
      source: { protocol: "generated-ui", surface: "menuItem" },
    });

    expect(
      buildGeneratedOperationInvocationRequest(
        binding({
          id: "add-child",
          input: {
            action: "create",
            kind: "treeComposition",
            placementValues: { slot: "body" },
          },
          kind: "treeComposition",
          label: "Add Post",
          operationName: "createChild",
        }),
        {
          bindingId: "add-child",
          input: { childValues: { title: "Draft" } },
          recordId: "parent-1",
          source: "submitButton",
        },
      ),
    ).toMatchObject({
      input: {
        childValues: { title: "Draft" },
        parentRecordId: "parent-1",
        placementValues: { slot: "body" },
      },
      source: { protocol: "generated-ui", surface: "submitButton" },
    });
  });
});

type AuthoritySubmitCall = {
  entityName: string;
  operationName: string;
  options: SubmitOperationOptions;
  request: OperationInvocationRequest;
};
function captureAuthoritySubmitter(
  response: OperationInvocationResponse | Promise<OperationInvocationResponse>,
): {
  calls: AuthoritySubmitCall[];
  submit: GeneratedOperationAuthoritySubmitter;
} {
  const calls: AuthoritySubmitCall[] = [];
  return {
    calls,
    submit: async (entityName, operationName, request, _fetcher, options) => {
      calls.push({ entityName, operationName, request, options });

      return response;
    },
  };
}

function binding(
  overrides: Partial<GeneratedOperationControlBinding> & {
    id: string;
    input: GeneratedOperationInputAdapter;
  },
): GeneratedOperationControlBinding {
  const canonicalOperationKey = overrides.canonicalOperationKey ?? "task.create";

  return {
    id: overrides.id,
    executionKey: overrides.executionKey ?? canonicalOperationKey,
    canonicalOperationKey,
    entityName: overrides.entityName === undefined ? "task" : overrides.entityName,
    operationName: overrides.operationName ?? "create",
    scope: overrides.scope ?? "collection",
    kind: overrides.kind ?? "create",
    operationKind: overrides.operationKind,
    label: overrides.label ?? "Create",
    visualIntent: overrides.visualIntent ?? "default",
    availability: overrides.availability ?? { state: "enabled" },
    ...(overrides.disabledReason === undefined ? {} : { disabledReason: overrides.disabledReason }),
    ...(overrides.destructive === undefined ? {} : { destructive: overrides.destructive }),
    ...(overrides.confirmation === undefined ? {} : { confirmation: overrides.confirmation }),
    ...(overrides.feedback === undefined ? {} : { feedback: overrides.feedback }),
    input: overrides.input,
  };
}

function workspaceBinding(id: string, executionKey: string): GeneratedOperationControlBinding {
  return binding({
    id,
    canonicalOperationKey: executionKey,
    entityName: undefined,
    executionKey,
    input: {
      bootstrapAllowed: false,
      inputFields: ["dryRun"],
      kind: "workspace",
      mode: "write",
      operationKind: "push",
    },
    kind: "workspace",
    label: "Push",
    operationName: executionKey,
    scope: "workspace",
  });
}

function operationProgress(progress: GeneratedOperationProgress): GeneratedOperationProgress {
  return progress;
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

function record(id: string, title: string): StoredRecord {
  return {
    id,
    entity: "task",
    values: { title },
    createdAt: "2026-07-06T00:00:00.000Z",
    updatedAt: "2026-07-06T00:00:00.000Z",
  };
}

function change(
  seq: number,
  storedRecord: StoredRecord,
  operationKind: ChangeRow["operationKind"] = "create",
): ChangeRow {
  return {
    seq,
    writeId: `write-${seq}`,
    operationKind,
    entity: storedRecord.entity,
    recordId: storedRecord.id,
    payload: storedRecord,
    createdAt: "2026-07-06T00:00:00.000Z",
  };
}

function deferredResponse() {
  let resolve: (response: OperationInvocationResponse) => void = () => {};
  const promise = new Promise<OperationInvocationResponse>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
}
