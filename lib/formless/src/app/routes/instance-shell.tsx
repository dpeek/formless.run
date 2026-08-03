import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  WorkspaceGatewayApiError,
  fetchWorkspaceGatewayOperation,
  fetchWorkspaceGatewayStatus,
  workspaceGatewayBrowserConfig,
  startWorkspaceGatewayOperation,
  type WorkspaceGatewayConfig,
  type WorkspaceGatewayOperation,
  type WorkspaceGatewayOperationKind,
  type WorkspaceGatewayResponse,
  type WorkspaceGatewayStartInput,
} from "@dpeek/formless-gateway/client";
import {
  workspaceBrowserOperationControlMetadata,
  workspaceOperationActorAllowed,
  workspaceOperationInputFieldDefinition,
  type WorkspaceBrowserOperationControlMetadata,
  type WorkspaceOperationActor,
  type WorkspaceOperationExecutionRequirement,
  type WorkspaceOperationMode,
  type WorkspaceOperationRequiredCapability,
} from "@dpeek/formless-workspace";
import { InstanceManagementRuntime } from "./instance-management-runtime.tsx";
import { displaySafeText } from "./instance-management-display-safety.ts";

export type WorkspaceGatewayRouteState =
  | { status: "unavailable" }
  | { status: "loading" }
  | { status: "failed"; message: string }
  | {
      activeOperationId?: string;
      csrfToken?: string;
      currentOperation?: WorkspaceGatewayOperation;
      error?: string;
      status: "ready";
      statusOperation?: WorkspaceGatewayOperation;
    };

export type WorkspaceGatewayOperationControlGroup = "all" | "workspace";

export type WorkspaceGatewayRuntimeCapabilityFacts = {
  actor: WorkspaceOperationActor;
  capabilities: readonly WorkspaceOperationRequiredCapability[];
};

export type WorkspaceGatewayOperationControl = {
  bootstrapAllowed: boolean;
  executionRequirements: readonly WorkspaceOperationExecutionRequirement[];
  group: Exclude<WorkspaceGatewayOperationControlGroup, "all">;
  input: WorkspaceGatewayStartInput;
  inputFields: readonly string[];
  kind: WorkspaceGatewayOperationKind;
  label: string;
  mode: WorkspaceOperationMode;
  requiredCapability: WorkspaceOperationRequiredCapability;
  style: "primary" | "secondary";
};

const localBrowserWorkspaceGatewayRuntimeFacts = {
  actor: "browser",
  capabilities: [
    "credential-setup",
    "workspace-read",
    "workspace-source-sync",
    "workspace-source-write",
  ],
} as const satisfies WorkspaceGatewayRuntimeCapabilityFacts;

export function selectWorkspaceGatewayOperationControls({
  operationGroup = "all",
  runtime = localBrowserWorkspaceGatewayRuntimeFacts,
}: {
  operationGroup?: WorkspaceGatewayOperationControlGroup;
  runtime?: WorkspaceGatewayRuntimeCapabilityFacts;
} = {}): WorkspaceGatewayOperationControl[] {
  const capabilities = new Set(runtime.capabilities);

  return workspaceBrowserOperationControlMetadata()
    .filter((metadata) => operationGroup !== "workspace" || metadata.kind === "push")
    .filter((metadata) => workspaceOperationActorAllowed(metadata.kind, runtime.actor))
    .filter((metadata) => capabilities.has(metadata.requiredCapability))
    .map(workspaceGatewayOperationControlFromMetadata)
    .filter((control) => operationGroup === "all" || control.group === operationGroup);
}

function workspaceGatewayOperationControlFromMetadata(
  metadata: WorkspaceBrowserOperationControlMetadata,
): WorkspaceGatewayOperationControl {
  return {
    bootstrapAllowed: metadata.bootstrapAllowed,
    executionRequirements: metadata.executionRequirements,
    group: workspaceGatewayOperationControlGroup(),
    input: workspaceGatewayStartInputFromControlMetadata(metadata),
    inputFields: metadata.inputFields,
    kind: metadata.kind,
    label: metadata.label,
    mode: metadata.mode,
    requiredCapability: metadata.requiredCapability,
    style: metadata.kind === "push" ? "primary" : "secondary",
  };
}

function workspaceGatewayOperationControlGroup(): WorkspaceGatewayOperationControl["group"] {
  return "workspace";
}

export function workspaceGatewayStartInputFromControlMetadata(
  metadata: WorkspaceBrowserOperationControlMetadata,
): WorkspaceGatewayStartInput {
  const input: Record<string, boolean | null | string | undefined> = { kind: metadata.kind };

  for (const fieldKey of metadata.inputFields) {
    const field = workspaceOperationInputFieldDefinition(metadata.kind, fieldKey);
    const value = workspaceGatewayControlDefaultValue(field);

    if (value !== undefined) {
      input[field.key] = value;
    }
  }

  return input as WorkspaceGatewayStartInput;
}

function workspaceGatewayControlDefaultValue(
  field: ReturnType<typeof workspaceOperationInputFieldDefinition>,
): boolean | null | string | undefined {
  if ("defaultValue" in field) {
    return field.defaultValue;
  }

  if (field.required && field.valueType === "enum" && field.allowedValues?.length === 1) {
    return field.allowedValues[0];
  }

  return undefined;
}

export function InstanceShellRoute({
  localWorkspaceGatewayAvailable: localWorkspaceGatewayAvailableProp,
  routesScreenPath,
  screenKey,
  screenPath,
}: {
  localWorkspaceGatewayAvailable?: boolean | undefined;
  routesScreenPath?: `/${string}` | undefined;
  screenKey: string;
  screenPath: `/${string}`;
}) {
  const workspaceOperationStartPending = useRef(false);
  const workspaceGatewayConfig = useMemo(() => workspaceGatewayBrowserConfig(), []);
  const localWorkspaceGatewayAvailable =
    localWorkspaceGatewayAvailableProp ?? workspaceGatewayConfig !== undefined;
  const [workspaceGatewayState, setWorkspaceGatewayState] = useState<WorkspaceGatewayRouteState>(
    () => (localWorkspaceGatewayAvailable ? { status: "loading" } : { status: "unavailable" }),
  );

  useEffect(() => {
    const controller = new AbortController();
    let stopped = false;

    async function loadWorkspaceGateway() {
      let workspaceGatewayFailed = false;
      let workspaceGatewayResponse: WorkspaceGatewayResponse | undefined;

      try {
        workspaceGatewayResponse = await loadInitialWorkspaceGatewayStatus({
          config: workspaceGatewayConfig,
          signal: controller.signal,
        });
      } catch (error) {
        if (stopped || controller.signal.aborted) {
          return;
        }

        workspaceGatewayFailed = true;
        setWorkspaceGatewayState({
          message: displaySafeText(
            error instanceof Error ? error.message : "Workspace gateway status could not load.",
          ),
          status: "failed",
        });
      }

      if (stopped || controller.signal.aborted) {
        return;
      }

      if (workspaceGatewayResponse) {
        setWorkspaceGatewayState((current) =>
          workspaceGatewayReadyStateFromResponse(workspaceGatewayResponse, current),
        );
      } else if (!workspaceGatewayFailed) {
        setWorkspaceGatewayState({ status: "unavailable" });
      }
    }

    void loadWorkspaceGateway();

    return () => {
      stopped = true;
      controller.abort();
    };
  }, [workspaceGatewayConfig]);

  useEffect(() => {
    if (
      workspaceGatewayState.status !== "ready" ||
      !workspaceGatewayState.activeOperationId ||
      !workspaceGatewayState.currentOperation ||
      !operationPollsAutomatically(workspaceGatewayState.currentOperation)
    ) {
      return;
    }

    const operation = workspaceGatewayState.currentOperation;

    const operationId = workspaceGatewayState.activeOperationId;
    const operationKind = operation.operation;
    const intervalId = window.setInterval(() => {
      void refreshWorkspaceGatewayOperation({
        config: workspaceGatewayConfig,
        operationId,
        operationKind,
        setWorkspaceGatewayState,
      });
    }, 1500);

    return () => window.clearInterval(intervalId);
  }, [workspaceGatewayConfig, workspaceGatewayState]);

  async function startWorkspaceOperation(input: WorkspaceGatewayStartInput) {
    if (
      workspaceGatewayState.status !== "ready" ||
      !workspaceGatewayConfig ||
      workspaceOperationStartPending.current
    ) {
      return;
    }

    workspaceOperationStartPending.current = true;
    setWorkspaceGatewayState({
      ...workspaceGatewayState,
      error: undefined,
    });

    try {
      const response = await startWorkspaceGatewayOperation(input, {
        config: workspaceGatewayConfig,
        csrfToken: workspaceGatewayState.csrfToken,
      });

      if (!response) {
        setWorkspaceGatewayState({ status: "unavailable" });
        return;
      }

      setWorkspaceGatewayState((current) =>
        workspaceGatewayReadyStateFromResponse(response, current, {
          activeOperationId: response.operation.id,
          currentOperation: response.operation,
        }),
      );
    } catch (error) {
      const message =
        error instanceof WorkspaceGatewayApiError || error instanceof Error
          ? error.message
          : "Workspace operation failed.";

      setWorkspaceGatewayState({
        ...workspaceGatewayState,
        error: displaySafeText(message),
      });
    } finally {
      workspaceOperationStartPending.current = false;
    }
  }

  async function pollWorkspaceOperation(
    operationId: string,
    operationKind?: WorkspaceGatewayOperationKind,
  ) {
    await refreshWorkspaceGatewayOperation({
      config: workspaceGatewayConfig,
      operationId,
      operationKind,
      setWorkspaceGatewayState,
    });
  }

  async function startWorkspacePush() {
    const push = selectWorkspaceGatewayOperationControls({ operationGroup: "workspace" }).find(
      ({ kind }) => kind === "push",
    );
    if (push) {
      await startWorkspaceOperation(push.input);
    }
  }

  return (
    <InstanceManagementRuntime
      onOpenWorkspaceAuthorization={(url) => window.open(url, "_blank", "noopener,noreferrer")}
      onPollWorkspaceOperation={pollWorkspaceOperation}
      onStartWorkspacePush={startWorkspacePush}
      routesScreenPath={routesScreenPath}
      screenKey={screenKey}
      screenPath={screenPath}
      workspaceGatewayState={workspaceGatewayState}
    />
  );
}

async function loadInitialWorkspaceGatewayStatus({
  config,
  signal,
}: {
  config?: WorkspaceGatewayConfig;
  signal: AbortSignal;
}): Promise<WorkspaceGatewayResponse | undefined> {
  if (!config) {
    return undefined;
  }

  try {
    return await fetchWorkspaceGatewayStatus({ config, signal });
  } catch (error) {
    if (error instanceof WorkspaceGatewayApiError && error.status === 404) {
      return undefined;
    }

    throw error;
  }
}

async function refreshWorkspaceGatewayOperation({
  config,
  operationId,
  operationKind,
  setWorkspaceGatewayState,
}: {
  config?: WorkspaceGatewayConfig;
  operationId: string;
  operationKind?: WorkspaceGatewayOperationKind;
  setWorkspaceGatewayState: Dispatch<SetStateAction<WorkspaceGatewayRouteState>>;
}) {
  if (!config) {
    return;
  }

  try {
    const response = await fetchWorkspaceGatewayOperation(
      { operationId, operationKind },
      { config },
    );

    if (!response) {
      return;
    }

    setWorkspaceGatewayState((current) =>
      workspaceGatewayReadyStateFromResponse(response, current, {
        activeOperationId: response.operation.id,
        currentOperation: response.operation,
      }),
    );
  } catch (error) {
    const message =
      error instanceof WorkspaceGatewayApiError || error instanceof Error
        ? error.message
        : "Workspace operation refresh failed.";

    setWorkspaceGatewayState((current) =>
      current.status === "ready"
        ? {
            ...current,
            error: displaySafeText(message),
          }
        : current,
    );
  }
}

function workspaceGatewayReadyStateFromResponse(
  response: WorkspaceGatewayResponse,
  current: WorkspaceGatewayRouteState,
  overrides: Partial<Extract<WorkspaceGatewayRouteState, { status: "ready" }>> = {},
): Extract<WorkspaceGatewayRouteState, { status: "ready" }> {
  const currentReady = current.status === "ready" ? current : undefined;

  return {
    activeOperationId: currentReady?.activeOperationId,
    csrfToken: response.csrfToken ?? currentReady?.csrfToken,
    currentOperation: currentReady?.currentOperation ?? response.operation,
    status: "ready",
    statusOperation:
      response.operation.operation === "status"
        ? response.operation
        : currentReady?.statusOperation,
    ...overrides,
  };
}

export function operationPollsAutomatically(operation: WorkspaceGatewayOperation): boolean {
  return operation.status === "queued" || operation.status === "running";
}
