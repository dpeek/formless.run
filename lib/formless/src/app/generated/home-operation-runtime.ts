import type { SyncStatus } from "../../client/sync-status.ts";
import type {
  GeneratedOperationControlBinding,
  GeneratedOperationController,
  GeneratedOperationExecutionResult,
  HomeOperationConfig,
} from "../../client/views.ts";
import { executeGeneratedOperationControl } from "./operation-control-runtime.ts";

type CommandHomeOperationConfig = Extract<HomeOperationConfig, { type: "command" }>;

export async function executeHomeCommandOperation({
  binding,
  controller,
  operation,
  setStatus,
  source = "button",
}: {
  binding: GeneratedOperationControlBinding;
  controller: GeneratedOperationController;
  operation: CommandHomeOperationConfig;
  setStatus?: (status: SyncStatus) => void;
  source?: "button" | "confirmationDialog";
}): Promise<GeneratedOperationExecutionResult> {
  return executeGeneratedOperationControl({
    binding,
    callerInput: {
      bindingId: binding.id,
      source,
    },
    controller,
    setStatus,
    statusLabel: operation.label,
  });
}

export function homeCommandOperationCommittedMessage(
  operation: CommandHomeOperationConfig,
  result: GeneratedOperationExecutionResult,
): string {
  const affectedCount = result.type === "failed" ? 0 : (result.affectedCount ?? 0);

  return operation.ui.showAffectedCountOnSuccess
    ? `${operation.label} synced. ${affectedCount} affected.`
    : `${operation.label} synced.`;
}
