import type {
  GeneratedOperationCallerInput,
  GeneratedOperationControlBinding,
  GeneratedOperationExecutionResult,
  GeneratedOperationExecutionState,
  GeneratedOperationProgress,
  GeneratedOperationInputAdapter,
} from "./operation-control-model.ts";
import { createIdleGeneratedOperationExecutionState } from "./operation-control-model.ts";
import { submitOperation, type SubmitOperationOptions } from "./sync.ts";
import type {
  OperationCommandOutput,
  OperationInvocationRequest,
  OperationInvocationResponse,
} from "../shared/operation-invocation.ts";

export type GeneratedOperationAuthoritySubmitter = (
  entityName: string,
  operationName: string,
  request: OperationInvocationRequest,
  fetcher: typeof fetch | undefined,
  options: SubmitOperationOptions,
) => Promise<OperationInvocationResponse>;

export type GeneratedOperationRuntimeAdapterKind = Extract<
  GeneratedOperationInputAdapter["kind"],
  "publicForm" | "workspace"
>;

export type GeneratedOperationRuntimeAdapterRequest = {
  binding: GeneratedOperationControlBinding;
  callerInput: GeneratedOperationCallerInput;
  idempotencyKey?: string;
  input?: unknown;
  recordId?: string;
  route?: string;
  source: {
    surface: GeneratedOperationCallerInput["source"];
  };
  reportProgress: GeneratedOperationProgressReporter;
  sourceBlockId?: string;
};

export type GeneratedOperationProgressReporter = (progress: GeneratedOperationProgress) => void;

export type GeneratedOperationRuntimeAdapterResponse =
  | {
      status: "committed" | "replayed";
      affectedCount?: number;
      createdRecordIds?: readonly string[];
      displayMessage?: string;
      progress?: GeneratedOperationProgress;
    }
  | {
      status: "failed";
      displayError: string;
      progress?: GeneratedOperationProgress;
    };

export type GeneratedOperationRuntimeAdapter = (
  request: GeneratedOperationRuntimeAdapterRequest,
) => Promise<GeneratedOperationRuntimeAdapterResponse>;

export type GeneratedOperationControllerOptions = {
  bindings: readonly GeneratedOperationControlBinding[];
  fetcher?: typeof fetch;
  now?: () => number;
  runtimeAdapters?: Partial<
    Record<GeneratedOperationRuntimeAdapterKind, GeneratedOperationRuntimeAdapter>
  >;
  submitAuthorityOperation?: GeneratedOperationAuthoritySubmitter;
  writeOptions?: SubmitOperationOptions;
};

export type GeneratedOperationController = {
  execute(input: GeneratedOperationCallerInput): Promise<GeneratedOperationExecutionResult>;
  getResult(bindingId: string): GeneratedOperationExecutionResult | undefined;
  getState(bindingId: string): GeneratedOperationExecutionState | undefined;
  getStateByExecutionKey(executionKey: string): GeneratedOperationExecutionState;
  isPending(bindingId: string): boolean;
  subscribe(listener: GeneratedOperationControllerListener): () => void;
};

export type GeneratedOperationControllerListener = (
  state: GeneratedOperationExecutionState,
) => void;

export function createGeneratedOperationController(
  options: GeneratedOperationControllerOptions,
): GeneratedOperationController {
  const bindingsById = new Map(options.bindings.map((binding) => [binding.id, binding]));
  const states = new Map<string, GeneratedOperationExecutionState>();
  const listeners = new Set<GeneratedOperationControllerListener>();
  const submitAuthorityOperation = options.submitAuthorityOperation ?? submitOperation;
  const now = options.now ?? Date.now;

  function setState(executionKey: string, state: GeneratedOperationExecutionState) {
    states.set(executionKey, state);
    for (const listener of listeners) {
      listener(state);
    }
  }

  function complete(
    binding: GeneratedOperationControlBinding,
    startedAt: number,
    result: GeneratedOperationExecutionResult,
  ) {
    const currentState = states.get(binding.executionKey);
    const pendingProgress = currentState?.status === "pending" ? currentState.progress : undefined;

    setState(binding.executionKey, {
      executionKey: binding.executionKey,
      status: result.type,
      result,
      startedAt,
      completedAt: now(),
      ...(pendingProgress === undefined ? {} : { progress: pendingProgress }),
    });

    return result;
  }

  async function execute(
    callerInput: GeneratedOperationCallerInput,
  ): Promise<GeneratedOperationExecutionResult> {
    const binding = bindingsById.get(callerInput.bindingId);

    if (binding === undefined) {
      return failedResult(`Operation binding "${callerInput.bindingId}" is unavailable.`);
    }

    if (binding.availability.state === "disabled") {
      const startedAt = now();
      return complete(binding, startedAt, failedResult(binding.availability.reason));
    }

    const currentState = states.get(binding.executionKey);
    if (currentState?.status === "pending") {
      return {
        type: "replayed",
        displayMessage: "Another control is already running this operation.",
      };
    }

    const startedAt = now();
    setState(binding.executionKey, {
      executionKey: binding.executionKey,
      status: "pending",
      startedAt,
    });

    try {
      const result = await executeBinding(binding, callerInput);
      return complete(binding, startedAt, result);
    } catch {
      return complete(binding, startedAt, failedResult("Operation failed."));
    }
  }

  function getStateByExecutionKey(executionKey: string): GeneratedOperationExecutionState {
    return states.get(executionKey) ?? createIdleGeneratedOperationExecutionState(executionKey);
  }

  function getState(bindingId: string): GeneratedOperationExecutionState | undefined {
    const binding = bindingsById.get(bindingId);

    return binding === undefined ? undefined : getStateByExecutionKey(binding.executionKey);
  }

  async function executeBinding(
    binding: GeneratedOperationControlBinding,
    callerInput: GeneratedOperationCallerInput,
  ): Promise<GeneratedOperationExecutionResult> {
    if (binding.input.kind === "publicForm" || binding.input.kind === "workspace") {
      return executeRuntimeOperation(binding, callerInput, binding.input.kind);
    }

    if (binding.entityName === undefined || binding.operationName === undefined) {
      return failedResult("Operation endpoint is unavailable.");
    }

    const request = buildGeneratedOperationInvocationRequest(binding, callerInput);
    const response = await submitAuthorityOperation(
      binding.entityName,
      binding.operationName,
      request,
      options.fetcher,
      options.writeOptions ?? {},
    );

    return normalizeGeneratedOperationInvocationResponse(response);
  }

  async function executeRuntimeOperation(
    binding: GeneratedOperationControlBinding,
    callerInput: GeneratedOperationCallerInput,
    kind: GeneratedOperationRuntimeAdapterKind,
  ): Promise<GeneratedOperationExecutionResult> {
    const adapter = options.runtimeAdapters?.[kind];

    if (adapter === undefined) {
      return failedResult("Runtime operation adapter is unavailable.");
    }

    const reportProgress: GeneratedOperationProgressReporter = (progress) => {
      const currentState = states.get(binding.executionKey);

      if (currentState?.status !== "pending") {
        return;
      }

      setState(binding.executionKey, {
        ...currentState,
        progress,
      });
    };
    const response = await adapter(
      buildGeneratedOperationRuntimeAdapterRequest(binding, callerInput, reportProgress),
    );

    if (response.progress !== undefined) {
      reportProgress(response.progress);
    }

    return normalizeGeneratedOperationRuntimeAdapterResponse(response);
  }

  return {
    execute,
    getResult(bindingId) {
      return getState(bindingId)?.result;
    },
    getState,
    getStateByExecutionKey,
    isPending(bindingId) {
      return getState(bindingId)?.status === "pending";
    },
    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function buildGeneratedOperationInvocationRequest(
  binding: GeneratedOperationControlBinding,
  callerInput: GeneratedOperationCallerInput,
): OperationInvocationRequest {
  const base = baseInvocationRequest(callerInput);

  switch (binding.input.kind) {
    case "collectionCommand":
    case "tableStatic":
    case "tableCommand":
      return withOptionalOperationInput(base, callerInput);
    case "createForm":
      return withInput(base, callerInput.input);
    case "recordDelete":
      return {
        ...base,
        recordId: requiredRecordId(binding, callerInput),
      };
    case "recordCommand":
      return {
        ...withOptionalOperationInput(base, callerInput),
        recordId: requiredRecordId(binding, callerInput),
      };
    case "tableEditRecord":
      return {
        ...withOptionalOperationInput(base, callerInput),
        recordId: requiredRecordId(binding, callerInput),
      };
    case "stateTransition":
      return {
        ...withOptionalOperationInput(base, callerInput),
        recordId: requiredRecordId(binding, callerInput),
      };
    case "treeComposition":
      return withInput(base, treeCompositionOperationInput(binding.input, callerInput));
    case "orderingMove":
      return {
        ...withInput(base, orderingMoveOperationInput(callerInput)),
        recordId: requiredRecordId(binding, callerInput),
      };
    case "publicForm":
    case "workspace":
      throw new Error("Runtime operation adapters do not use Authority invocation requests.");
  }
}

export function buildGeneratedOperationRuntimeAdapterRequest(
  binding: GeneratedOperationControlBinding,
  callerInput: GeneratedOperationCallerInput,
  reportProgress: GeneratedOperationProgressReporter = noopProgressReporter,
): GeneratedOperationRuntimeAdapterRequest {
  const request: GeneratedOperationRuntimeAdapterRequest = {
    binding,
    callerInput,
    source: {
      surface: callerInput.source,
    },
    reportProgress,
    ...(callerInput.idempotencyKey === undefined
      ? {}
      : { idempotencyKey: callerInput.idempotencyKey }),
    ...(callerInput.input === undefined ? {} : { input: callerInput.input }),
    ...(callerInput.recordId === undefined ? {} : { recordId: callerInput.recordId }),
  };

  if (binding.input.kind === "publicForm") {
    return {
      ...request,
      route: binding.input.route,
      ...(binding.input.sourceBlockId === undefined
        ? {}
        : { sourceBlockId: binding.input.sourceBlockId }),
      ...(callerInput.input === undefined ? {} : { input: callerInput.input }),
    };
  }

  return request;
}

export function normalizeGeneratedOperationInvocationResponse(
  response: OperationInvocationResponse,
): GeneratedOperationExecutionResult {
  if (response.status === "failed" || response.status === "rejected") {
    return failedResult(`Operation ${response.status}.`);
  }

  if (response.status !== "committed" && response.status !== "replayed") {
    return failedResult(`Operation ${response.status}.`);
  }

  return {
    type: response.status,
    ...(affectedCountForOutput(response.output) === undefined
      ? {}
      : { affectedCount: affectedCountForOutput(response.output) }),
    ...(createdRecordIdsForOutput(response.output) === undefined
      ? {}
      : { createdRecordIds: createdRecordIdsForOutput(response.output) }),
    output: response.output,
  };
}

export function normalizeGeneratedOperationRuntimeAdapterResponse(
  response: GeneratedOperationRuntimeAdapterResponse,
): GeneratedOperationExecutionResult {
  if (response.status === "failed") {
    return failedResult(response.displayError);
  }

  return {
    type: response.status,
    ...(response.affectedCount === undefined ? {} : { affectedCount: response.affectedCount }),
    ...(response.createdRecordIds === undefined
      ? {}
      : { createdRecordIds: response.createdRecordIds }),
    ...(response.displayMessage === undefined ? {} : { displayMessage: response.displayMessage }),
  };
}

function baseInvocationRequest(
  callerInput: GeneratedOperationCallerInput,
): OperationInvocationRequest {
  return {
    ...(callerInput.idempotencyKey === undefined
      ? {}
      : { idempotencyKey: callerInput.idempotencyKey }),
    source: {
      protocol: "generated-ui",
      surface: callerInput.source,
    },
  };
}

function withOptionalOperationInput(
  request: OperationInvocationRequest,
  callerInput: GeneratedOperationCallerInput,
): OperationInvocationRequest {
  const input = callerInput.input;

  return input === undefined
    ? {
        ...request,
        ...(callerInput.recordId === undefined ? {} : { recordId: callerInput.recordId }),
      }
    : {
        ...request,
        input,
        ...(callerInput.recordId === undefined ? {} : { recordId: callerInput.recordId }),
      };
}

function withInput(
  request: OperationInvocationRequest,
  input: unknown,
): OperationInvocationRequest {
  return input === undefined ? request : { ...request, input };
}

function treeCompositionOperationInput(
  adapter: Extract<GeneratedOperationInputAdapter, { kind: "treeComposition" }>,
  callerInput: GeneratedOperationCallerInput,
): unknown {
  const input = callerInput.input;
  const recordIdInput =
    callerInput.recordId === undefined
      ? undefined
      : adapter.action === "remove"
        ? { placementId: callerInput.recordId }
        : { parentRecordId: callerInput.recordId };

  if (input !== undefined) {
    return mergePlacementValues(
      recordIdInput === undefined || !isPlainRecord(input) ? input : { ...input, ...recordIdInput },
      adapter.placementValues,
    );
  }

  if (recordIdInput === undefined) {
    return adapter.placementValues === undefined
      ? undefined
      : { placementValues: adapter.placementValues };
  }

  return mergePlacementValues(recordIdInput, adapter.placementValues);
}

function orderingMoveOperationInput(callerInput: GeneratedOperationCallerInput): unknown {
  return callerInput.input;
}

function mergePlacementValues(
  input: unknown,
  placementValues: Record<string, unknown> | undefined,
): unknown {
  if (placementValues === undefined || !isPlainRecord(input)) {
    return input;
  }

  return {
    ...input,
    placementValues,
  };
}

function requiredRecordId(
  binding: GeneratedOperationControlBinding,
  callerInput: GeneratedOperationCallerInput,
): string {
  if (callerInput.recordId !== undefined) {
    return callerInput.recordId;
  }

  throw new Error(`${binding.label} requires a record id.`);
}

function affectedCountForOutput(output: OperationInvocationResponse["output"]): number | undefined {
  switch (output.type) {
    case "command":
    case "create":
    case "delete":
    case "update":
      return output.affectedChangeIds.length;
    case "get":
    case "list":
      return undefined;
  }
}

function createdRecordIdsForOutput(
  output: OperationInvocationResponse["output"],
): readonly string[] | undefined {
  switch (output.type) {
    case "create":
      return [output.record.id];
    case "command":
      return createdRecordIdsForCommandOutput(output);
    case "delete":
    case "get":
    case "list":
    case "update":
      return undefined;
  }
}

function createdRecordIdsForCommandOutput(
  output: OperationCommandOutput,
): readonly string[] | undefined {
  const plannedIds =
    output.recordPlan?.steps
      .filter((step) => step.kind === "create")
      .map((step) => step.recordId) ?? [];
  const changedIds = output.changes
    .filter((change) => change.operationKind === "create" && !change.payload.deletedAt)
    .map((change) => change.recordId);
  const ids = [...new Set([...plannedIds, ...changedIds])];

  return ids.length === 0 ? undefined : ids;
}

function failedResult(displayError: string): GeneratedOperationExecutionResult {
  return {
    type: "failed",
    displayError,
  };
}

function noopProgressReporter(_progress: GeneratedOperationProgress) {}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
