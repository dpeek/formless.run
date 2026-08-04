import {
  fetchWorkspaceGatewayPush,
  startWorkspaceGatewayPush,
  submitWorkspaceGatewayAccountSelection,
  WorkspaceGatewayApiError,
  type WorkspaceGatewayAccountSelectionInteraction,
  type WorkspaceGatewayConfig,
  type WorkspaceGatewayPush,
  type WorkspaceGatewayPushFailureCode,
  type WorkspaceGatewayPushPhase,
  type WorkspaceGatewayPushResponse,
  type WorkspaceGatewayPushStartInput,
  type WorkspaceGatewayStatusResponse,
} from "@dpeek/formless-gateway/client";
import type {
  GeneratedOperationProgress,
  GeneratedOperationProgressStep,
} from "./operation-control-model.ts";
import type {
  GeneratedOperationRuntimeAdapter,
  GeneratedOperationRuntimeAdapterRequest,
  GeneratedOperationRuntimeAdapterResponse,
} from "./operation-control-controller.ts";

const DEFAULT_POLL_INTERVAL_MS = 1_500;

export type WorkspaceGatewayGeneratedOperationRuntimeAdapterOptions = {
  config?: WorkspaceGatewayConfig;
  csrfToken?: string;
  fetcher?: typeof fetch;
  pollIntervalMs?: number;
  selectAccount?: (interaction: WorkspaceGatewayAccountSelectionInteraction) => Promise<string>;
  signal?: AbortSignal;
  wait?: (milliseconds: number) => Promise<void>;
};

export function createWorkspaceGatewayGeneratedOperationRuntimeAdapter(
  options: WorkspaceGatewayGeneratedOperationRuntimeAdapterOptions = {},
): GeneratedOperationRuntimeAdapter {
  return (request) => executeWorkspaceGatewayGeneratedOperation(request, options);
}

export async function executeWorkspaceGatewayGeneratedOperation(
  request: GeneratedOperationRuntimeAdapterRequest,
  options: WorkspaceGatewayGeneratedOperationRuntimeAdapterOptions = {},
): Promise<GeneratedOperationRuntimeAdapterResponse> {
  const input = workspaceGatewayPushStartInputFromGeneratedOperation(request);
  if (!input) return failed("Workspace Push is unavailable.");
  try {
    const started = await startWorkspaceGatewayPush(input, options);
    if (!started) return failed("Workspace gateway is unavailable.");
    return pollPush(started, request, options);
  } catch (error) {
    return failed(gatewayAdapterErrorMessage(error));
  }
}

export function workspaceGatewayPushStartInputFromGeneratedOperation(
  request: GeneratedOperationRuntimeAdapterRequest,
): WorkspaceGatewayPushStartInput | undefined {
  const binding = request.binding.input;
  if (binding.kind !== "workspace" || binding.operationKind !== "push") return undefined;
  const input = isRecord(request.input) ? request.input : {};
  const targetAlias = input.targetAlias;
  if (targetAlias !== undefined && typeof targetAlias !== "string") return undefined;
  return {
    mode: input.dryRun === true ? "dry-run" : "apply",
    ...(targetAlias === undefined || targetAlias === "" ? {} : { targetAlias }),
  };
}

export function workspaceGatewayPushGeneratedRuntimeAdapterResponse(
  push: WorkspaceGatewayPush,
): GeneratedOperationRuntimeAdapterResponse {
  const progress = workspaceGatewayPushGeneratedProgress(push);
  if (push.lifecycle === "failed") {
    return {
      displayError: workspaceGatewayPushFailureMessage(push.failureCode),
      progress,
      status: "failed",
    };
  }
  if (push.lifecycle !== "succeeded") {
    return { displayError: "Workspace Push is still running.", progress, status: "failed" };
  }
  return {
    displayMessage: workspaceGatewayPushOutcomeMessage(push.outcome),
    progress,
    status: push.outcome === "up-to-date" ? "replayed" : "committed",
  };
}

export function workspaceGatewayPushGeneratedProgress(
  push: WorkspaceGatewayPush,
): GeneratedOperationProgress {
  const steps = push.phases.map(workspaceGatewayPushGeneratedProgressStep);
  const active =
    steps.find((step) => step.status === "running") ??
    steps.find((step) => step.status === "failed") ??
    steps.find((step) => step.status === "pending");
  return {
    ...(active === undefined ? {} : { detail: active.label }),
    steps,
    title: "Push workspace",
    updatedAt: timestamp(push.updatedAt),
  };
}

export function workspaceGatewayPushGeneratedProgressSteps(
  push: WorkspaceGatewayPush,
): readonly GeneratedOperationProgressStep[] {
  return push.phases.map(workspaceGatewayPushGeneratedProgressStep);
}

export function workspaceGatewayStatusObservedPush(
  status: WorkspaceGatewayStatusResponse,
): WorkspaceGatewayPush | undefined {
  return status.currentPush ?? status.latestPush ?? undefined;
}

export function workspaceGatewayPushFailureMessage(code: WorkspaceGatewayPushFailureCode): string {
  const copy: Record<WorkspaceGatewayPushFailureCode, string> = {
    "account-discovery-failed": "Cloudflare accounts could not be loaded.",
    "authorization-expired": "Cloudflare authorization expired.",
    "backup-failed": "The current target could not be backed up.",
    "credential-unavailable": "Cloudflare credentials are unavailable.",
    "health-check-failed": "The deployed runtime did not pass its health check.",
    "interaction-expired": "Cloudflare account selection expired.",
    "internal-failure": "Workspace Push failed.",
    "observation-write-failed": "Deployment observation could not be refreshed.",
    "owner-setup-failed": "Instance owner setup could not be completed.",
    "provider-reconciliation-failed": "Cloudflare resources could not be reconciled.",
    "restore-apply-failed": "Workspace state could not be applied.",
    "restore-validation-failed": "Workspace state did not pass restore validation.",
    "schema-incompatible": "Workspace schema is incompatible with the target.",
    "source-invalid": "Workspace source is invalid.",
    "target-conflict": "The target changed while Push was running.",
    "target-unavailable": "The workspace target is unavailable.",
  };
  return copy[code];
}

export function workspaceGatewayPushPending(push: WorkspaceGatewayPush): boolean {
  return (
    push.lifecycle === "queued" ||
    push.lifecycle === "running" ||
    push.lifecycle === "waiting-for-interaction"
  );
}

async function pollPush(
  response: WorkspaceGatewayPushResponse,
  request: GeneratedOperationRuntimeAdapterRequest,
  options: WorkspaceGatewayGeneratedOperationRuntimeAdapterOptions,
): Promise<GeneratedOperationRuntimeAdapterResponse> {
  let push = response.push;
  request.reportProgress(workspaceGatewayPushGeneratedProgress(push));
  while (workspaceGatewayPushPending(push)) {
    if (
      push.lifecycle === "waiting-for-interaction" &&
      push.interaction.kind === "account-selection"
    ) {
      if (!options.selectAccount) {
        return {
          displayError: "Select a Cloudflare account to continue Workspace Push.",
          progress: workspaceGatewayPushGeneratedProgress(push),
          status: "failed",
        };
      }
      const accountId = await options.selectAccount(push.interaction);
      const submitted = await submitWorkspaceGatewayAccountSelection(
        { accountId, interactionId: push.interaction.id, pushId: push.id },
        options,
      );
      if (!submitted) return failed("Workspace gateway is unavailable.");
      push = submitted.push;
      request.reportProgress(workspaceGatewayPushGeneratedProgress(push));
      continue;
    }
    await wait(options);
    const next = await fetchWorkspaceGatewayPush(push.id, options);
    if (!next) return failed("Workspace gateway is unavailable.");
    push = next.push;
    request.reportProgress(workspaceGatewayPushGeneratedProgress(push));
  }
  return workspaceGatewayPushGeneratedRuntimeAdapterResponse(push);
}

function workspaceGatewayPushGeneratedProgressStep(
  phase: WorkspaceGatewayPushPhase,
): GeneratedOperationProgressStep {
  return { id: phase.id, label: phaseLabel(phase.id), status: phase.status };
}

function phaseLabel(id: WorkspaceGatewayPushPhase["id"]): string {
  const labels: Record<WorkspaceGatewayPushPhase["id"], string> = {
    "account-selection": "Select Cloudflare account",
    credentials: "Connect Cloudflare",
    "desired-state-plan": "Plan desired state",
    "health-check": "Check deployed runtime",
    "observation-refresh": "Refresh deployment observation",
    "owner-setup": "Set up instance owner",
    "provider-reconciliation": "Reconcile Cloudflare resources",
    "workspace-push-writeback": "Push workspace state",
  };
  return labels[id];
}

function workspaceGatewayPushOutcomeMessage(
  outcome: Extract<WorkspaceGatewayPush, { lifecycle: "succeeded" }>["outcome"],
): string {
  return outcome === "up-to-date"
    ? "Workspace is already up to date."
    : outcome === "planned"
      ? "Workspace Push plan is ready."
      : "Workspace Push applied.";
}

function gatewayAdapterErrorMessage(error: unknown): string {
  return error instanceof WorkspaceGatewayApiError
    ? workspaceGatewayErrorMessage(error.code)
    : "Workspace Push failed.";
}

export function workspaceGatewayErrorMessage(code: WorkspaceGatewayApiError["code"]): string {
  switch (code) {
    case "push-active":
      return "A workspace push is already running.";
    case "push-not-found":
      return "Workspace push was not found.";
    case "interaction-not-found":
      return "Workspace push interaction was not found.";
    case "interaction-invalid":
      return "The selected Cloudflare account is unavailable.";
    case "interaction-expired":
      return "Workspace push interaction expired.";
    case "csrf-invalid":
      return "Workspace authorization expired. Refresh and try again.";
    case "unauthorized":
    case "bootstrap-expired":
      return "Workspace authorization is required.";
    case "forbidden":
      return "Workspace push is not allowed.";
    case "gateway-unavailable":
      return "Workspace gateway is unavailable.";
    case "invalid-sidecar-response":
      return "Workspace gateway returned an invalid response.";
    case "invalid-request":
      return "Workspace push request is invalid.";
    case "method-not-allowed":
    case "not-found":
      return "Workspace gateway route is unavailable.";
  }
}

function failed(displayError: string): GeneratedOperationRuntimeAdapterResponse {
  return { displayError, status: "failed" };
}

async function wait(
  options: WorkspaceGatewayGeneratedOperationRuntimeAdapterOptions,
): Promise<void> {
  const milliseconds = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  if (options.wait) return options.wait(milliseconds);
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
