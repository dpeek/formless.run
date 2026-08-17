import { describe, expect, it } from "vite-plus/test";
import {
  createGeneratedOperationController,
  projectOrderingMoveOperationControlBinding,
  projectCollectionOperationControlBinding,
  projectTableOperationControlBinding,
  projectTreeCompositionOperationControlBindings,
  selectCollectionModels,
  type GeneratedOperationAuthoritySubmitter,
  type GeneratedCommandDraftSessionState,
  type HomeOperationConfig,
  type ResultOrderingConfig,
  type TableOperationControlConfig,
} from "../../client/views.ts";
import {
  selectEntityOperationByKind,
  type EntityOperationPresentationConfig,
} from "../../client/operation-presentation-model.ts";
import { selectTreeResultModel } from "../../client/tree-result-model.ts";
import type { SubmitOperationOptions } from "../../client/sync.ts";
import type { SyncStatus } from "../../client/sync-status.ts";
import type {
  OperationInvocationRequest,
  OperationInvocationResponse,
} from "../../shared/operation-invocation.ts";
import type { ChangeRow } from "../../shared/protocol.ts";
import { siteSourceSchema, taskSourceSchema } from "../../test/schema-apps.ts";
import type { StoredRecord } from "@dpeek/formless-storage";
import {
  executeGeneratedOperationControl,
  executeGeneratedOrderingMoveOperation,
  handleGeneratedOperationIntent,
  selectGeneratedOperationControlTriggerDecision,
} from "./operation-control-runtime.ts";
import { projectGeneratedOperationControl } from "./operation-projection.ts";
import {
  executeHomeCommandOperation,
  homeCommandOperationCommittedMessage,
} from "./home-operation-runtime.ts";
import {
  executeRecordDeleteOperation,
  projectDeleteRecordButtonBinding,
} from "./record-delete-runtime.ts";

describe("generated operation controls", () => {
  it("submits a generated date default evaluated when the command dialog opens", async () => {
    const projected = projectCollectionOperationControlBinding(requiredClearCompletedOperation());
    const binding = {
      ...projected,
      input: {
        ...projected.input,
        form: {
          fields: [
            {
              default: { kind: "generatedDate" as const, timeZone: "Australia/Sydney" },
              editor: "date" as const,
              field: { label: "Received at", required: true, type: "date" as const },
              fieldName: "receivedAt",
              inputName: "receivedAt",
              label: "Received at",
            },
          ],
        },
      },
    };
    const controller = createGeneratedOperationController({ bindings: [binding] });
    let commandDialogOpen = false;
    let state: GeneratedCommandDraftSessionState | undefined;
    const invocations: unknown[] = [];
    const dispatch = (intent: Parameters<typeof handleGeneratedOperationIntent>[0]["intent"]) =>
      handleGeneratedOperationIntent({
        binding,
        commandDialogOpen,
        commandState: state,
        controller,
        currentInstant: () => new Date("2026-08-16T14:30:00.000Z"),
        intent,
        invoke: async (_invokeIntent, input) => {
          invocations.push(input);
          return { type: "committed" };
        },
        onCommandDialogOpenChange: (open) => {
          commandDialogOpen = open;
        },
        onCommandStateChange: (next) => {
          state = next;
        },
      });
    const closedControl = projectGeneratedOperationControl({
      binding,
      presentation: {
        accessibilityLabel: binding.label,
        content: { kind: "label", label: binding.label },
        density: "default",
        prominence: "secondary",
      },
      state: controller.getStateByExecutionKey(binding.executionKey),
    });

    await dispatch(closedControl.trigger.intent);
    expect(commandDialogOpen).toBe(true);
    expect(state?.draft.values).toEqual({
      receivedAt: { kind: "input", value: "2026-08-17" },
    });

    const openDialog = projectGeneratedOperationControl({
      binding,
      commandDialogOpen,
      commandState: state,
      presentation: {
        accessibilityLabel: binding.label,
        content: { kind: "label", label: binding.label },
        density: "default",
        prominence: "secondary",
      },
      state: controller.getStateByExecutionKey(binding.executionKey),
    }).commandDialog!;
    expect(openDialog.fieldSet.fields[0]).toMatchObject({
      draftInput: { kind: "input", value: "2026-08-17" },
      value: "2026-08-17",
    });

    await dispatch(openDialog.submit.intent);
    expect(invocations).toEqual([{ receivedAt: "2026-08-17" }]);
    expect(commandDialogOpen).toBe(false);
  });

  it("collects, validates, cancels, and submits declared command input exactly once", async () => {
    const projected = projectCollectionOperationControlBinding(requiredClearCompletedOperation());
    const binding = {
      ...projected,
      input: {
        ...projected.input,
        form: {
          fields: [
            {
              editor: "enum" as const,
              field: {
                type: "enum" as const,
                required: true,
                label: "Assay",
                values: [
                  { key: "analytical", label: "Analytical" },
                  { key: "sterility", label: "Sterility" },
                ],
              },
              fieldName: "assayRole",
              inputName: "assayRole",
              label: "Assay",
            },
          ],
        },
      },
    };
    const controller = createGeneratedOperationController({ bindings: [binding] });
    let state: GeneratedCommandDraftSessionState | undefined;
    const openChanges: boolean[] = [];
    const invocations: Array<{ input: unknown; source: string }> = [];
    const dispatch = (intent: Parameters<typeof handleGeneratedOperationIntent>[0]["intent"]) =>
      handleGeneratedOperationIntent({
        binding,
        commandDialogOpen: true,
        commandState: state,
        controller,
        intent,
        invoke: async (invokeIntent, input) => {
          invocations.push({ input, source: invokeIntent.invocationSource });
          return { type: "committed" };
        },
        onCommandDialogOpenChange: (open) => openChanges.push(open),
        onCommandStateChange: (next) => {
          state = next;
        },
      });
    const initialControl = projectGeneratedOperationControl({
      binding,
      presentation: {
        accessibilityLabel: binding.label,
        content: { kind: "label", label: binding.label },
        density: "default",
        prominence: "secondary",
      },
      state: controller.getStateByExecutionKey(binding.executionKey),
    });
    const initialDialog = initialControl.commandDialog!;

    await handleGeneratedOperationIntent({
      binding,
      controller,
      intent: initialControl.trigger.intent,
      invoke: async () => {
        throw new Error("Initial trigger must not invoke.");
      },
      onCommandDialogOpenChange: (open) => openChanges.push(open),
    });
    expect(openChanges).toEqual([true]);
    expect(initialDialog.submit.disabled).toBe(false);
    expect(initialDialog.fieldSet.fields[0]?.errors).toBeUndefined();
    await dispatch(initialDialog.submit.intent);
    expect(invocations).toEqual([]);
    expect(state?.submitAttempted).toBe(true);

    const invalidDialog = projectGeneratedOperationControl({
      binding,
      commandDialogOpen: true,
      commandState: state,
      presentation: {
        accessibilityLabel: binding.label,
        content: { kind: "label", label: binding.label },
        density: "default",
        prominence: "secondary",
      },
      state: controller.getStateByExecutionKey(binding.executionKey),
    }).commandDialog!;
    expect(invalidDialog.submit.disabled).toBe(true);
    expect(invalidDialog.fieldSet.fields[0]?.errors?.map((error) => error.message)).toEqual([
      'Field "assayRole" cannot be empty.',
    ]);

    await dispatch({
      controlId: binding.id,
      fieldId: invalidDialog.fieldSet.fields[0]!.fieldId,
      intent: {
        inputName: "assayRole",
        inputValue: { kind: "input", value: "sterility" },
        type: "operationDraftChange",
      },
      type: "operationCommandFieldIntent",
    });
    const readyDialog = projectGeneratedOperationControl({
      binding,
      commandDialogOpen: true,
      commandState: state,
      presentation: {
        accessibilityLabel: binding.label,
        content: { kind: "label", label: binding.label },
        density: "default",
        prominence: "secondary",
      },
      state: controller.getStateByExecutionKey(binding.executionKey),
    }).commandDialog!;
    expect(readyDialog.submit.disabled).toBe(false);
    expect(readyDialog.fieldSet.fields[0]?.errors).toBeUndefined();

    await dispatch(readyDialog.cancel.intent);
    expect(openChanges).toEqual([true, false]);
    expect(invocations).toEqual([]);
    await dispatch(readyDialog.submit.intent);
    expect(invocations).toEqual([{ input: { assayRole: "sterility" }, source: "formSubmit" }]);
    expect(openChanges).toEqual([true, false, false]);
  });

  it("retains a completed command draft after failed execution", async () => {
    const projected = projectCollectionOperationControlBinding(requiredClearCompletedOperation());
    const binding = {
      ...projected,
      input: {
        ...projected.input,
        form: {
          fields: [
            {
              editor: "text" as const,
              field: { label: "Message", required: true, type: "text" as const },
              fieldName: "message",
              inputName: "message",
              label: "Message",
            },
          ],
        },
      },
    };
    const controller = createGeneratedOperationController({ bindings: [binding] });
    let state: GeneratedCommandDraftSessionState | undefined = {
      draft: { values: { message: { kind: "input", value: "Keep this" } } },
      submitAttempted: true,
    };
    const openChanges: boolean[] = [];

    await expect(
      handleGeneratedOperationIntent({
        binding,
        commandDialogOpen: true,
        commandState: state,
        controller,
        intent: { controlId: binding.id, type: "operationCommandSubmit" },
        invoke: async () => ({ displayError: "Operation failed.", type: "failed" }),
        onCommandDialogOpenChange: (open) => openChanges.push(open),
        onCommandStateChange: (next) => {
          state = next;
        },
      }),
    ).resolves.toEqual({ displayError: "Operation failed.", type: "failed" });

    expect(state).toMatchObject({
      draft: { values: { message: { value: "Keep this" } } },
      submitAttempted: true,
    });
    expect(openChanges).toEqual([]);
  });

  it("keeps input-free collection commands on their immediate invocation path", async () => {
    const binding = projectCollectionOperationControlBinding(requiredClearCompletedOperation());
    const controller = createGeneratedOperationController({ bindings: [binding] });
    const control = projectGeneratedOperationControl({
      binding,
      presentation: {
        accessibilityLabel: binding.label,
        content: { kind: "label", label: binding.label },
        density: "default",
        prominence: "secondary",
      },
      state: controller.getStateByExecutionKey(binding.executionKey),
    });
    let invocationCount = 0;

    expect(selectGeneratedOperationControlTriggerDecision({ binding })).toEqual({
      type: "execute",
    });
    expect(control.commandDialog).toBeUndefined();
    await expect(
      handleGeneratedOperationIntent({
        binding,
        controller,
        intent: control.trigger.intent,
        invoke: async () => {
          invocationCount += 1;
          return { type: "committed" };
        },
      }),
    ).resolves.toEqual({ type: "committed" });
    expect(invocationCount).toBe(1);
  });

  it("reports collection command committed feedback with affected counts", async () => {
    const operation = requiredClearCompletedOperation();
    const binding = projectCollectionOperationControlBinding(operation);
    const output = commandOutput(["write-1", "write-2"]);
    const submit = captureAuthoritySubmitter(operationResponse(output));
    const controller = createGeneratedOperationController({
      bindings: [binding],
      submitAuthorityOperation: submit.submit,
    });
    const statuses: SyncStatus[] = [];

    const result = await executeHomeCommandOperation({
      binding,
      controller,
      operation,
      setStatus: (status) => statuses.push(status),
    });

    expect(submit.calls).toMatchObject([
      {
        entityName: "task",
        operationName: "clearCompletedTasks",
        request: {
          source: { protocol: "generated-ui", surface: "button" },
        },
      },
    ]);
    expect(result).toMatchObject({ type: "committed", affectedCount: 2 });
    expect(homeCommandOperationCommittedMessage(operation, result)).toBe(
      "Clear completed synced. 2 affected.",
    );
    expect(statuses).toEqual([
      { code: "operation-running", label: "Clear completed", state: "syncing" },
      { code: "operation-committed", label: "Clear completed", state: "idle" },
    ]);
    expect(
      projectGeneratedOperationControl({
        binding,
        presentation: {
          accessibilityLabel: operation.label,
          content: { kind: "label", label: operation.label },
          density: "default",
          prominence: "secondary",
        },
        state: controller.getStateByExecutionKey(binding.executionKey),
      }).feedback,
    ).toMatchObject({
      detail: "2 affected.",
      status: "committed",
      title: "Clear completed synced.",
    });
  });

  it("reports collection command replay and failure feedback from normalized results", async () => {
    const operation = requiredClearCompletedOperation();
    const binding = projectCollectionOperationControlBinding(operation);
    const replayStatuses: SyncStatus[] = [];
    const replayController = createGeneratedOperationController({
      bindings: [binding],
      submitAuthorityOperation: captureAuthoritySubmitter(
        operationResponse(commandOutput(["write-1"]), "replayed"),
      ).submit,
    });

    await expect(
      executeHomeCommandOperation({
        binding,
        controller: replayController,
        operation,
        setStatus: (status) => replayStatuses.push(status),
      }),
    ).resolves.toMatchObject({ type: "replayed", affectedCount: 1 });
    expect(replayStatuses).toEqual([
      { code: "operation-running", label: "Clear completed", state: "syncing" },
      { code: "operation-replayed", label: "Clear completed", state: "idle" },
    ]);

    const failureStatuses: SyncStatus[] = [];
    const failureController = createGeneratedOperationController({
      bindings: [binding],
      submitAuthorityOperation: async () => {
        throw new Error("Operation endpoint unavailable.");
      },
    });

    await expect(
      executeHomeCommandOperation({
        binding,
        controller: failureController,
        operation,
        setStatus: (status) => failureStatuses.push(status),
      }),
    ).resolves.toEqual({
      type: "failed",
      displayError: "Operation failed.",
    });
    expect(failureStatuses).toEqual([
      { code: "operation-running", label: "Clear completed", state: "syncing" },
      { code: "operation-failed", label: "Clear completed", state: "error" },
    ]);
    expect(
      projectGeneratedOperationControl({
        binding,
        presentation: {
          accessibilityLabel: operation.label,
          content: { kind: "label", label: operation.label },
          density: "default",
          prominence: "secondary",
        },
        state: failureController.getStateByExecutionKey(binding.executionKey),
      }).feedback,
    ).toMatchObject({
      detail: "Operation failed.",
      status: "failed",
      title: "Clear completed failed.",
    });
  });

  it("deduplicates pending invocation intents before runtime feedback repeats", async () => {
    const operation = requiredClearCompletedOperation();
    const binding = projectCollectionOperationControlBinding(operation);
    let resolveSubmission: ((response: OperationInvocationResponse) => void) | undefined;
    const submission = new Promise<OperationInvocationResponse>((resolve) => {
      resolveSubmission = resolve;
    });
    const controller = createGeneratedOperationController({
      bindings: [binding],
      submitAuthorityOperation: async () => submission,
    });
    const pendingExecution = controller.execute({ bindingId: binding.id, source: "button" });
    let invokeCount = 0;

    expect(controller.isPending(binding.id)).toBe(true);
    await expect(
      handleGeneratedOperationIntent({
        binding,
        controller,
        intent: {
          controlId: binding.id,
          invocationSource: "button",
          type: "operationInvoke",
        },
        invoke: async () => {
          invokeCount += 1;
          return { type: "committed" };
        },
      }),
    ).resolves.toBeUndefined();
    expect(invokeCount).toBe(0);

    resolveSubmission?.(operationResponse(commandOutput(["write-pending"])));
    await expect(pendingExecution).resolves.toMatchObject({ type: "committed" });
  });

  it("keeps destructive delete confirmation labels while executing through controller state", async () => {
    const deleteOperation = selectEntityOperationByKind(
      "block",
      siteSourceSchema.entities.find((definition) => definition.key === "block")!,
      "delete",
      "record",
    );

    if (deleteOperation === undefined) {
      throw new Error("Missing block delete operation.");
    }

    const binding = projectDeleteRecordButtonBinding({
      deleteOperation,
      entityLabel: "Block",
      recordId: "block-1",
      recordLabel: "Hero block",
    });

    if (binding === undefined) {
      throw new Error("Missing delete binding.");
    }

    expect(binding).toMatchObject({
      canonicalOperationKey: "block.delete",
      confirmation: {
        actionLabel: "Delete",
        description:
          "The record will be hidden from active views. Active references can block deletion.",
        title: "Delete Hero block?",
      },
      destructive: true,
      executionKey: "block.delete:block-1",
      visualIntent: "destructive",
    });

    const submit = captureAuthoritySubmitter(
      operationResponse({
        type: "delete",
        affectedChangeIds: ["write-3"],
        changes: [change(3, { ...record("block-1", "Hero block", "block"), deletedAt })],
        cursor: 3,
        recordId: "block-1",
      }),
    );
    const controller = createGeneratedOperationController({
      bindings: [binding],
      submitAuthorityOperation: submit.submit,
    });
    const statuses: SyncStatus[] = [];

    await expect(
      executeRecordDeleteOperation({
        binding,
        controller,
        recordId: "block-1",
        recordLabel: "Hero block",
        setStatus: (status) => statuses.push(status),
      }),
    ).resolves.toMatchObject({ type: "committed", affectedCount: 1 });

    expect(submit.calls).toMatchObject([
      {
        entityName: "block",
        operationName: "delete",
        request: {
          recordId: "block-1",
          source: { protocol: "generated-ui", surface: "confirmationDialog" },
        },
      },
    ]);
    expect(statuses).toEqual([
      { code: "operation-running", label: "Delete Hero block", state: "syncing" },
      { code: "operation-committed", label: "Delete Hero block", state: "idle" },
    ]);
  });

  it("retains failed confirmations and closes with callbacks only after committed or replayed results", async () => {
    const deleteOperation = selectEntityOperationByKind(
      "block",
      siteSourceSchema.entities.find((definition) => definition.key === "block")!,
      "delete",
      "record",
    );

    if (deleteOperation === undefined) {
      throw new Error("Missing block delete operation.");
    }

    const binding = projectDeleteRecordButtonBinding({
      deleteOperation,
      entityLabel: "Block",
      recordId: "block-1",
      recordLabel: "Hero block",
    });

    if (binding === undefined) {
      throw new Error("Missing delete binding.");
    }

    const controller = createGeneratedOperationController({ bindings: [binding] });
    const control = projectGeneratedOperationControl({
      binding,
      confirmationOpen: true,
      presentation: {
        accessibilityLabel: "Delete Hero block",
        content: { kind: "label", label: "Delete" },
        density: "compact",
        prominence: "destructive",
      },
      state: controller.getStateByExecutionKey(binding.executionKey),
    });
    const confirmation = control.confirmation;

    if (confirmation === undefined) {
      throw new Error("Missing projected delete confirmation.");
    }

    const openChanges: boolean[] = [];
    const successes: string[] = [];
    const dispatch = (
      result:
        | {
            type: "committed" | "replayed";
          }
        | {
            type: "failed";
            displayError: string;
          },
    ) =>
      handleGeneratedOperationIntent({
        binding,
        confirmationOpen: true,
        controller,
        intent: confirmation.action.intent,
        invoke: async () => result,
        onConfirmationOpenChange: (open) => openChanges.push(open),
        onSuccess: (success) => successes.push(success.type),
      });

    await expect(
      handleGeneratedOperationIntent({
        binding,
        controller,
        intent: control.trigger.intent,
        invoke: async () => ({ type: "committed" }),
        onConfirmationOpenChange: (open) => openChanges.push(open),
      }),
    ).resolves.toBeUndefined();
    expect(openChanges).toEqual([true]);

    const pendingCloseChanges: boolean[] = [];
    await expect(
      handleGeneratedOperationIntent({
        binding,
        controller: {
          ...controller,
          isPending: () => true,
        },
        intent: confirmation.closeIntent,
        invoke: async () => ({ type: "committed" }),
        onConfirmationOpenChange: (open) => pendingCloseChanges.push(open),
      }),
    ).resolves.toBeUndefined();
    expect(pendingCloseChanges).toEqual([false]);

    let rejectedInvokeCount = 0;
    await expect(
      handleGeneratedOperationIntent({
        binding,
        confirmationOpen: true,
        controller,
        intent: {
          controlId: binding.id,
          invocationSource: "button",
          type: "operationInvoke",
        },
        invoke: async () => {
          rejectedInvokeCount += 1;
          return { type: "committed" };
        },
      }),
    ).resolves.toBeUndefined();
    await expect(
      handleGeneratedOperationIntent({
        binding,
        confirmationOpen: false,
        controller,
        intent: confirmation.action.intent,
        invoke: async () => {
          rejectedInvokeCount += 1;
          return { type: "committed" };
        },
      }),
    ).resolves.toBeUndefined();
    expect(rejectedInvokeCount).toBe(0);

    await expect(
      dispatch({ type: "failed", displayError: "Active references block deletion." }),
    ).resolves.toMatchObject({ type: "failed" });
    expect(openChanges).toEqual([true]);
    expect(successes).toEqual([]);

    await expect(dispatch({ type: "committed" })).resolves.toEqual({ type: "committed" });
    expect(openChanges).toEqual([true, false]);
    expect(successes).toEqual(["committed"]);

    await handleGeneratedOperationIntent({
      binding,
      controller,
      intent: control.trigger.intent,
      invoke: async () => ({ type: "replayed" }),
      onConfirmationOpenChange: (open) => openChanges.push(open),
    });
    await expect(dispatch({ type: "replayed" })).resolves.toEqual({ type: "replayed" });
    expect(openChanges).toEqual([true, false, true, false]);
    expect(successes).toEqual(["committed", "replayed"]);
  });

  it("executes table static row controls through projected bindings", async () => {
    const control: TableOperationControlConfig = {
      bindingName: "archive",
      type: "static",
      label: "Archive",
      variant: "default",
      disabled: false,
      operation: recordCommandOperation("task.archive", "archive"),
    };
    const binding = projectTableOperationControlBinding(control, {
      executionTargetKey: "task-1",
    });

    if (binding === undefined) {
      throw new Error("Missing table operation binding.");
    }

    const submit = captureAuthoritySubmitter(operationResponse(commandOutput(["write-6"])));
    const controller = createGeneratedOperationController({
      bindings: [binding],
      submitAuthorityOperation: submit.submit,
    });
    const statuses: SyncStatus[] = [];

    await expect(
      executeGeneratedOperationControl({
        binding,
        callerInput: {
          bindingId: binding.id,
          recordId: "task-1",
          source: "menuItem",
        },
        controller,
        setStatus: (status) => statuses.push(status),
      }),
    ).resolves.toMatchObject({ type: "committed", affectedCount: 1 });

    expect(submit.calls).toMatchObject([
      {
        entityName: "task",
        operationName: "archive",
        request: {
          recordId: "task-1",
          source: { protocol: "generated-ui", surface: "menuItem" },
        },
      },
    ]);
    expect(statuses).toEqual([
      { code: "operation-running", label: "Archive", state: "syncing" },
      { code: "operation-committed", label: "Archive", state: "idle" },
    ]);
  });

  it("requires confirmation before executing destructive table and tree controls", async () => {
    const tableControl: TableOperationControlConfig = {
      bindingName: "delete",
      type: "static",
      label: "Delete row",
      variant: "destructive",
      disabled: false,
      operation: recordCommandOperation("task.deleteRow", "deleteRow", "Delete row"),
    };
    const tableBinding = projectTableOperationControlBinding(tableControl, {
      executionTargetKey: "task-1",
    });

    if (tableBinding === undefined) {
      throw new Error("Missing table operation binding.");
    }

    expect(tableBinding.confirmation).toMatchObject({
      actionLabel: "Delete row",
      title: "Delete row?",
    });
    expect(selectGeneratedOperationControlTriggerDecision({ binding: tableBinding })).toEqual({
      type: "confirm",
    });

    const tableSubmit = captureAuthoritySubmitter(operationResponse(commandOutput(["write-8"])));
    const tableController = createGeneratedOperationController({
      bindings: [tableBinding],
      submitAuthorityOperation: tableSubmit.submit,
    });

    await expect(
      executeGeneratedOperationControl({
        binding: tableBinding,
        callerInput: {
          bindingId: tableBinding.id,
          recordId: "task-1",
          source: "confirmationDialog",
        },
        controller: tableController,
      }),
    ).resolves.toMatchObject({ type: "committed", affectedCount: 1 });
    expect(tableSubmit.calls).toMatchObject([
      {
        entityName: "task",
        operationName: "deleteRow",
        request: {
          recordId: "task-1",
          source: { protocol: "generated-ui", surface: "confirmationDialog" },
        },
      },
    ]);

    const treeBinding = requiredTreeRemoveBinding();

    expect(treeBinding.confirmation).toMatchObject({
      actionLabel: "Remove child",
      description: "The placement will be removed without deleting the child record.",
    });
    expect(selectGeneratedOperationControlTriggerDecision({ binding: treeBinding })).toEqual({
      type: "confirm",
    });

    const treeSubmit = captureAuthoritySubmitter(operationResponse(commandOutput(["write-9"])));
    const treeController = createGeneratedOperationController({
      bindings: [treeBinding],
      submitAuthorityOperation: treeSubmit.submit,
    });

    await expect(
      executeGeneratedOperationControl({
        binding: treeBinding,
        callerInput: {
          bindingId: treeBinding.id,
          recordId: "placement-1",
          source: "confirmationDialog",
        },
        controller: treeController,
      }),
    ).resolves.toMatchObject({ type: "committed", affectedCount: 1 });
    expect(treeSubmit.calls).toMatchObject([
      {
        entityName: "block-placement",
        operationName: "removeTreePlacement",
        request: {
          input: { placementId: "placement-1" },
          source: { protocol: "generated-ui", surface: "confirmationDialog" },
        },
      },
    ]);
  });

  it("sends ordering moves as direct sparse rank operation input", async () => {
    const binding = projectOrderingMoveOperationControlBinding({
      direction: "up",
      label: "Move up",
      ordering: placementOrdering,
      updateOperation: placementUpdateOperation,
    });

    if (binding === undefined) {
      throw new Error("Missing ordering operation binding.");
    }

    const submit = captureAuthoritySubmitter(
      operationResponse({
        type: "update",
        affectedChangeIds: ["write-7"],
        changes: [change(7, placementRecord("placement-1", 500))],
        cursor: 7,
        record: placementRecord("placement-1", 500),
      }),
    );
    const controller = createGeneratedOperationController({
      bindings: [binding],
      submitAuthorityOperation: submit.submit,
    });
    const statuses: SyncStatus[] = [];

    await expect(
      executeGeneratedOrderingMoveOperation({
        binding,
        controller,
        orderingContext: {
          entityName: "block-placement",
          orderedRecordIds: ["placement-1", "placement-2"],
          ordering: placementOrdering,
          recordsById: {
            "placement-1": placementRecord("placement-1", 1000),
            "placement-2": placementRecord("placement-2", 2000),
          },
          updateOperation: placementUpdateOperation,
        },
        plan: { kind: "patch", recordId: "placement-1", rank: 500 },
        source: "button",
        setStatus: (status) => statuses.push(status),
      }),
    ).resolves.toMatchObject({ type: "committed", affectedCount: 1 });

    expect(submit.calls).toEqual([
      {
        entityName: "block-placement",
        operationName: "update",
        options: {},
        request: {
          input: { order: 500 },
          recordId: "placement-1",
          source: { protocol: "generated-ui", surface: "button" },
        },
      },
    ]);
    expect(statuses).toEqual([
      { code: "operation-running", label: "Move up", state: "syncing" },
      { code: "operation-committed", label: "Move up", state: "idle" },
    ]);
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
      calls.push({
        entityName,
        operationName,
        request,
        options,
      });

      return response;
    },
  };
}
function requiredClearCompletedOperation(): Extract<
  HomeOperationConfig,
  {
    type: "command";
  }
> {
  const model = selectCollectionModels(taskSourceSchema).find(
    (candidate) => candidate.viewName === "taskHome",
  );
  const operation = model?.operations!.find(
    (candidate) =>
      candidate.type === "command" && candidate.operationName === "clearCompletedTasks",
  );

  if (operation?.type !== "command") {
    throw new Error("Missing clear completed operation.");
  }
  return operation;
}
function requiredTreeRemoveBinding() {
  const treeView = siteSourceSchema.views.find(
    (definition) => definition.key === "siteCompositionHome",
  )!;
  if (treeView === undefined || treeView.type !== "collection" || treeView.result.type !== "tree") {
    throw new Error("Missing Site composition tree view.");
  }

  const treeResult = selectTreeResultModel(
    siteSourceSchema,
    treeView.result,
    "block-placement",
    siteSourceSchema.entities.find((definition) => definition.key === "block-placement")!,
  );
  const binding = projectTreeCompositionOperationControlBindings(treeResult.composition, {
    executionTargetKey: "placement-1",
  }).find(
    (candidate) =>
      candidate.input.kind === "treeComposition" && candidate.input.action === "remove",
  );

  if (binding === undefined) {
    throw new Error("Missing tree remove binding.");
  }

  return binding;
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
function commandOutput(affectedChangeIds: string[]): Extract<
  OperationInvocationResponse["output"],
  {
    type: "command";
  }
> {
  return {
    type: "command",
    affectedChangeIds,
    changes: affectedChangeIds.map((writeId, index) =>
      change(index + 1, { ...record(`task-${index + 1}`, "Done"), deletedAt }, "delete", writeId),
    ),
    cursor: affectedChangeIds.length,
  };
}

function record(id: string, title: string, entity = "task"): StoredRecord {
  return {
    id,
    entity,
    values: { title },
    createdAt: "2026-07-06T00:00:00.000Z",
    updatedAt: "2026-07-06T00:00:00.000Z",
  };
}

function change(
  seq: number,
  storedRecord: StoredRecord,
  operationKind: ChangeRow["operationKind"] = "create",
  writeId = `write-${seq}`,
): ChangeRow {
  return {
    seq,
    writeId,
    operationKind,
    entity: storedRecord.entity,
    recordId: storedRecord.id,
    payload: storedRecord,
    createdAt: "2026-07-06T00:00:00.000Z",
  };
}

const deletedAt = "2026-07-06T00:00:00.000Z";

const placementOrdering: ResultOrderingConfig = {
  fieldName: "order",
  field: { type: "number", required: true, min: 0 },
  scope: [
    {
      kind: "field",
      fieldName: "parent",
      field: { type: "reference", required: false, to: "block" },
    },
  ],
  presentations: ["dragHandle", "moveMenu"],
};

const placementUpdateOperation = recordUpdateOperation(
  "block-placement.update",
  "update",
  "Update",
);

function recordCommandOperation(
  canonicalKey: string,
  operationName: string,
  label = "Archive",
): EntityOperationPresentationConfig {
  const entityName = canonicalKey.split(".")[0] ?? "task";

  return {
    entityName,
    operationName,
    canonicalKey,
    label,
    operation: {
      kind: "command",
      scope: "record",
      input: { fields: [] },
      effect: {
        type: "operationHandler",
        handler: "tombstone-query-results",
        config: { query: "completed" },
      },
      output: { type: "command" },
      idempotency: { required: true },
      audit: { input: "summary" },
    },
  };
}

function recordUpdateOperation(
  canonicalKey: string,
  operationName: string,
  label: string,
): EntityOperationPresentationConfig {
  const entityName = canonicalKey.split(".")[0] ?? "task";

  return {
    entityName,
    operationName,
    canonicalKey,
    label,
    operation: {
      kind: "update",
      scope: "record",
      input: { fields: [] },
      effect: { type: "patchRecord" },
      output: { type: "update" },
      idempotency: { required: true },
      audit: { input: "summary" },
    },
  };
}

function placementRecord(id: string, order: number): StoredRecord {
  return {
    id,
    entity: "block-placement",
    values: { parent: "page-1", order },
    createdAt: "2026-07-06T00:00:00.000Z",
    updatedAt: "2026-07-06T00:00:00.000Z",
  };
}
