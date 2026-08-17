import type { SyncStatus } from "../../client/sync-status.ts";
import type {
  GeneratedOperationCallerInput,
  GeneratedOperationControlBinding,
  GeneratedOperationController,
  GeneratedOperationExecutionResult,
  TransitionStateOperationConfig,
} from "../../client/views.ts";
import { executeGeneratedOperationControl } from "./operation-control-runtime.ts";

export async function executeTransitionStateOperation({
  binding,
  controller,
  input,
  operation,
  recordId,
  setStatus,
  source,
}: {
  binding: GeneratedOperationControlBinding;
  controller: GeneratedOperationController;
  input?: unknown;
  operation: TransitionStateOperationConfig;
  recordId: string;
  setStatus?: (status: SyncStatus) => void;
  source: GeneratedOperationCallerInput["source"];
}): Promise<GeneratedOperationExecutionResult> {
  return executeGeneratedOperationControl({
    binding,
    callerInput: {
      bindingId: binding.id,
      ...(input === undefined ? {} : { input }),
      recordId,
      source,
    },
    controller,
    setStatus,
    statusLabel: operation.label,
  });
}
