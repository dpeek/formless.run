import type {
  EntityOperationKind,
  EntityOperationScope,
  FieldVisibilityValue,
} from "@dpeek/formless-schema";
import type { CommandOperationUiConfig, HomeOperationConfig } from "./collection-shell-model.ts";
import type { OperationInvocationResponse } from "../shared/operation-invocation.ts";
import type { EntityOperationPresentationConfig } from "./operation-presentation-model.ts";
import type { ResultOrderingConfig } from "./result-ordering-model.ts";
import type {
  TransitionStateOperationAvailability,
  TransitionStateOperationConfig,
} from "./state-machine-model.ts";
import type { TreeCompositionOperationConfig } from "./tree-result-model.ts";
import type {
  EditViewConfig,
  OperationControlTableColumnConfig,
  TableEditRecordTargetConfig,
  TableOperationControlConfig,
} from "./views.ts";

export type GeneratedOperationControlScope = EntityOperationScope | "form" | "public" | "workspace";

export type GeneratedOperationControlKind =
  | EntityOperationKind
  | "ordering"
  | "publicForm"
  | "stateTransition"
  | "treeComposition"
  | "workspace";

export type GeneratedOperationControlVisualIntent = "default" | "primary" | "destructive";

export type GeneratedOperationControlAvailability =
  | {
      state: "enabled";
    }
  | {
      state: "disabled";
      reason: string;
    };

export type GeneratedOperationControlConfirmation = {
  title: string;
  description: string;
  actionLabel: string;
};

export type GeneratedOperationControlFeedback = {
  progressLabel?: string;
  successLabel?: string;
  replayLabel?: string;
  failureLabel?: string;
};

export type GeneratedOperationInputAdapter =
  | {
      kind: "collectionCommand";
      ui: CommandOperationUiConfig;
    }
  | {
      kind: "createForm";
      create: Extract<HomeOperationConfig, { type: "create" }>;
    }
  | {
      kind: "recordDelete";
      entityLabel: string;
      recordLabel?: string;
    }
  | {
      kind: "recordStatic";
    }
  | {
      kind: "tableStatic";
    }
  | {
      kind: "tableEditRecord";
      editView: EditViewConfig;
      target: TableEditRecordTargetConfig;
    }
  | {
      kind: "stateTransition";
      fieldName: string;
      machineName: string;
      targetState: string;
      transitionName: string;
    }
  | {
      action: "create" | "remove";
      kind: "treeComposition";
      placementValues?: Record<string, FieldVisibilityValue>;
    }
  | {
      direction: string;
      fieldName: string;
      kind: "orderingMove";
      scopeFieldNames: readonly string[];
    }
  | {
      fields: readonly GeneratedPublicOperationInputField[];
      kind: "publicForm";
      route: string;
      sourceBlockId?: string;
    }
  | {
      bootstrapAllowed: boolean;
      inputFields: readonly string[];
      kind: "workspace";
      mode: "read" | "write";
      operationKind: string;
      requiredCapability?: string;
    };

export type GeneratedPublicOperationInputField = {
  name: string;
  label: string;
  required: boolean;
  control: "boolean" | "date" | "enum" | "longText" | "number" | "text";
};

export type GeneratedOperationControlBinding = {
  id: string;
  executionKey: string;
  canonicalOperationKey: string;
  entityName?: string;
  operationName?: string;
  scope: GeneratedOperationControlScope;
  kind: GeneratedOperationControlKind;
  operationKind?: EntityOperationKind;
  label: string;
  visualIntent: GeneratedOperationControlVisualIntent;
  availability: GeneratedOperationControlAvailability;
  disabledReason?: string;
  destructive?: boolean;
  confirmation?: GeneratedOperationControlConfirmation;
  feedback?: GeneratedOperationControlFeedback;
  input: GeneratedOperationInputAdapter;
};

export type GeneratedOperationInvocationSource =
  | "button"
  | "confirmationDialog"
  | "menuItem"
  | "submitButton";

export type GeneratedOperationCallerInput = {
  bindingId: string;
  source: GeneratedOperationInvocationSource;
  idempotencyKey?: string;
  input?: unknown;
  recordId?: string;
};

export type GeneratedOperationExecutionResult =
  | {
      type: "committed";
      affectedCount?: number;
      createdRecordIds?: readonly string[];
      displayMessage?: string;
      output?: OperationInvocationResponse["output"];
    }
  | {
      type: "replayed";
      affectedCount?: number;
      createdRecordIds?: readonly string[];
      displayMessage?: string;
      output?: OperationInvocationResponse["output"];
    }
  | {
      type: "failed";
      displayError: string;
    };

export type GeneratedOperationExecutionStatus =
  | "committed"
  | "failed"
  | "idle"
  | "pending"
  | "replayed";

export type GeneratedOperationProgressStepStatus =
  | "failed"
  | "pending"
  | "running"
  | "skipped"
  | "succeeded";

export type GeneratedOperationProgressStep = {
  id: string;
  label: string;
  detail?: string;
  status: GeneratedOperationProgressStepStatus;
};

export type GeneratedOperationProgress = {
  title: string;
  detail?: string;
  updatedAt: number;
  steps: readonly GeneratedOperationProgressStep[];
};

export type GeneratedOperationExecutionState = {
  executionKey: string;
  status: GeneratedOperationExecutionStatus;
  completedAt?: number;
  progress?: GeneratedOperationProgress;
  result?: GeneratedOperationExecutionResult;
  startedAt?: number;
};

export type GeneratedOperationProjectionOptions = {
  executionKey?: string;
  executionTargetKey?: string;
  id?: string;
  idPrefix?: string;
};

export type GeneratedOrderingMoveOperationFacts = {
  direction: string;
  label: string;
  ordering: ResultOrderingConfig;
  updateOperation?: EntityOperationPresentationConfig;
  disabledReason?: string;
};

export type GeneratedPublicOperationControlFacts = {
  canonicalKey: string;
  entityName: string;
  operationName: string;
  route: string;
  buttonLabel?: string;
  fields?: readonly GeneratedPublicOperationInputField[];
  sourceBlockId?: string;
  successLabel?: string;
};

export type GeneratedWorkspaceOperationControlFacts = {
  key: string;
  kind: string;
  label: string;
  bootstrapAllowed: boolean;
  inputFields: readonly string[];
  mode: "read" | "write";
  canonicalOperationKey?: string;
  disabledReason?: string;
  hidden?: boolean;
  requiredCapability?: string;
};

export function createIdleGeneratedOperationExecutionState(
  executionKey: string,
): GeneratedOperationExecutionState {
  return {
    executionKey,
    status: "idle",
  };
}

export function generatedOperationExecutionKey(input: {
  canonicalOperationKey: string;
  targetKey?: string;
}): string {
  return input.targetKey === undefined
    ? input.canonicalOperationKey
    : `${input.canonicalOperationKey}:${input.targetKey}`;
}

export function projectCollectionOperationControlBindings(
  operations: readonly HomeOperationConfig[],
  options: GeneratedOperationProjectionOptions = {},
): GeneratedOperationControlBinding[] {
  return operations.map((operation) =>
    projectCollectionOperationControlBinding(operation, options),
  );
}

export function projectCollectionOperationControlBinding(
  operation: HomeOperationConfig,
  options: GeneratedOperationProjectionOptions = {},
): GeneratedOperationControlBinding {
  if (operation.type === "create") {
    const disabledReason = operation.enabled ? undefined : "Create is unavailable.";

    return baseGeneratedOperationControlBinding({
      operation: operation.operation,
      id: bindingId(options, "collection", operation.operation.canonicalKey),
      executionKey: executionKey(options, operation.operation.canonicalKey),
      label: operation.label,
      kind: "create",
      visualIntent: "primary",
      disabledReason,
      feedback: {
        progressLabel: `${operation.label}...`,
        successLabel: `${operation.label} synced.`,
        replayLabel: `${operation.label} replayed.`,
        failureLabel: `${operation.label} failed.`,
      },
      input: {
        kind: "createForm",
        create: operation,
      },
    });
  }

  return baseGeneratedOperationControlBinding({
    operation: operation.operation,
    id: bindingId(options, "collection", operation.operation.canonicalKey),
    executionKey: executionKey(options, operation.operation.canonicalKey),
    label: operation.label,
    kind: "command",
    visualIntent: "default",
    feedback: {
      progressLabel: `${operation.label}...`,
      successLabel: `${operation.label} synced.`,
      replayLabel: `${operation.label} replayed.`,
      failureLabel: `${operation.label} failed.`,
    },
    input: {
      kind: "collectionCommand",
      ui: operation.ui,
    },
  });
}

export function projectRecordDeleteOperationControlBinding(input: {
  entityLabel: string;
  operation: EntityOperationPresentationConfig;
  label?: string;
  recordLabel?: string;
  options?: GeneratedOperationProjectionOptions;
}): GeneratedOperationControlBinding | undefined {
  if (input.operation.operation.kind !== "delete") {
    return undefined;
  }

  const label = input.label ?? input.operation.label;
  const options = input.options ?? {};

  return baseGeneratedOperationControlBinding({
    operation: input.operation,
    id: bindingId(options, "record-delete", input.operation.canonicalKey),
    executionKey: executionKey(options, input.operation.canonicalKey),
    label,
    kind: "delete",
    visualIntent: "destructive",
    destructive: true,
    confirmation: destructiveConfirmation({
      actionLabel: label,
      description:
        "The record will be hidden from active views. Active references can block deletion.",
      label,
      subject: input.recordLabel ?? input.entityLabel,
    }),
    feedback: {
      progressLabel: `${label}...`,
      successLabel: `${label} synced.`,
      replayLabel: `${label} replayed.`,
      failureLabel: `${label} failed.`,
    },
    input: {
      kind: "recordDelete",
      entityLabel: input.entityLabel,
      ...(input.recordLabel === undefined ? {} : { recordLabel: input.recordLabel }),
    },
  });
}

export function projectRecordOperationControlBinding(input: {
  entityLabel: string;
  operation: EntityOperationPresentationConfig;
  label?: string;
  recordLabel?: string;
  options?: GeneratedOperationProjectionOptions;
}): GeneratedOperationControlBinding {
  const label = input.label ?? input.operation.label;
  const options = input.options ?? {};

  if (input.operation.operation.kind === "delete") {
    return projectRecordDeleteOperationControlBinding({
      entityLabel: input.entityLabel,
      label,
      operation: input.operation,
      ...(input.recordLabel === undefined ? {} : { recordLabel: input.recordLabel }),
      options,
    })!;
  }

  return baseGeneratedOperationControlBinding({
    operation: input.operation,
    id: bindingId(options, "record", input.operation.canonicalKey),
    executionKey: executionKey(options, input.operation.canonicalKey),
    label,
    kind: input.operation.operation.kind,
    visualIntent: "default",
    feedback: {
      progressLabel: `${label}...`,
      successLabel: `${label} synced.`,
      replayLabel: `${label} replayed.`,
      failureLabel: `${label} failed.`,
    },
    input: { kind: "recordStatic" },
  });
}

export function projectTableOperationControlBindings(
  column: OperationControlTableColumnConfig,
  options: GeneratedOperationProjectionOptions = {},
): GeneratedOperationControlBinding[] {
  return column.controls.flatMap((control) => {
    const binding = projectTableOperationControlBinding(control, options);
    return binding === undefined ? [] : [binding];
  });
}

export function projectTableOperationControlBinding(
  control: TableOperationControlConfig,
  options: GeneratedOperationProjectionOptions = {},
): GeneratedOperationControlBinding | undefined {
  if (control.operation === undefined) {
    return undefined;
  }

  const destructive =
    control.variant === "destructive" || control.operation.operation.kind === "delete";

  return baseGeneratedOperationControlBinding({
    operation: control.operation,
    id: bindingId(options, "table", control.bindingName),
    executionKey: executionKey(options, control.operation.canonicalKey),
    label: control.label,
    kind: control.type === "editRecord" ? "update" : control.operation.operation.kind,
    visualIntent: destructive ? "destructive" : "default",
    disabledReason: control.disabled ? (control.disabledReason ?? "Unavailable") : undefined,
    destructive,
    ...(destructive
      ? {
          confirmation: destructiveConfirmation({
            actionLabel: control.label,
            description: "This operation can hide or remove records.",
            label: control.label,
          }),
        }
      : {}),
    feedback: {
      progressLabel: `${control.label}...`,
      successLabel: `${control.label} synced.`,
      replayLabel: `${control.label} replayed.`,
      failureLabel: `${control.label} failed.`,
    },
    input:
      control.type === "editRecord"
        ? {
            kind: "tableEditRecord",
            editView: control.editView,
            target: control.target,
          }
        : { kind: "tableStatic" },
  });
}

export function projectStateTransitionOperationControlBinding(input: {
  operation: TransitionStateOperationConfig;
  availability?: TransitionStateOperationAvailability;
  options?: GeneratedOperationProjectionOptions;
}): GeneratedOperationControlBinding {
  const options = input.options ?? {};
  const disabledReason =
    input.availability?.valid === false
      ? (input.availability.disabledReason ?? "Transition unavailable.")
      : undefined;

  return baseGeneratedOperationControlBinding({
    operation: input.operation.operation,
    id: bindingId(options, "state-transition", input.operation.operation.canonicalKey),
    executionKey: executionKey(options, input.operation.operation.canonicalKey),
    label: input.operation.label,
    kind: "stateTransition",
    visualIntent: "default",
    disabledReason,
    feedback: {
      progressLabel: `${input.operation.label}...`,
      successLabel: `${input.operation.label} synced.`,
      replayLabel: `${input.operation.label} replayed.`,
      failureLabel: `${input.operation.label} failed.`,
    },
    input: {
      kind: "stateTransition",
      fieldName: input.operation.fieldName,
      machineName: input.operation.machineName,
      targetState: input.operation.transition.to,
      transitionName: input.operation.transitionName,
    },
  });
}

export function projectTreeCompositionOperationControlBindings(
  composition: TreeCompositionOperationConfig | undefined,
  options: GeneratedOperationProjectionOptions = {},
): GeneratedOperationControlBinding[] {
  if (composition === undefined) {
    return [];
  }

  return [
    composition.create === undefined
      ? undefined
      : projectTreeCompositionOperationControlBinding({
          action: "create",
          operation: composition.create.operation,
          options,
        }),
    composition.remove === undefined
      ? undefined
      : projectTreeCompositionOperationControlBinding({
          action: "remove",
          operation: composition.remove.operation,
          options,
        }),
  ].filter((binding): binding is GeneratedOperationControlBinding => binding !== undefined);
}

export function projectOrderingMoveOperationControlBinding(
  input: GeneratedOrderingMoveOperationFacts,
  options: GeneratedOperationProjectionOptions = {},
): GeneratedOperationControlBinding | undefined {
  if (input.updateOperation === undefined) {
    return undefined;
  }

  return baseGeneratedOperationControlBinding({
    operation: input.updateOperation,
    id: bindingId(options, "ordering", `${input.updateOperation.canonicalKey}:${input.direction}`),
    executionKey: executionKey(options, input.updateOperation.canonicalKey),
    label: input.label,
    kind: "ordering",
    visualIntent: "default",
    disabledReason: input.disabledReason,
    feedback: {
      progressLabel: `${input.label}...`,
      successLabel: "Order synced.",
      replayLabel: "Order replayed.",
      failureLabel: "Move failed.",
    },
    input: {
      direction: input.direction,
      fieldName: input.ordering.fieldName,
      kind: "orderingMove",
      scopeFieldNames: input.ordering.scope.map((scope) => scope.fieldName),
    },
  });
}

export function projectPublicOperationFormControlBinding(
  input: GeneratedPublicOperationControlFacts,
  options: GeneratedOperationProjectionOptions = {},
): GeneratedOperationControlBinding {
  const label = input.buttonLabel ?? "Submit";

  return {
    id: bindingId(options, "public-form", input.canonicalKey),
    executionKey: executionKey(options, input.canonicalKey),
    canonicalOperationKey: input.canonicalKey,
    entityName: input.entityName,
    operationName: input.operationName,
    scope: "public",
    kind: "publicForm",
    label,
    visualIntent: "primary",
    availability: { state: "enabled" },
    feedback: {
      progressLabel: `${label}...`,
      successLabel: input.successLabel ?? "Submitted.",
      replayLabel: input.successLabel ?? "Already submitted.",
      failureLabel: "Submission failed.",
    },
    input: {
      fields: input.fields ?? [],
      kind: "publicForm",
      route: input.route,
      ...(input.sourceBlockId === undefined ? {} : { sourceBlockId: input.sourceBlockId }),
    },
  };
}

export function projectWorkspaceOperationControlBinding(
  input: GeneratedWorkspaceOperationControlFacts,
  options: GeneratedOperationProjectionOptions = {},
): GeneratedOperationControlBinding | undefined {
  if (input.hidden) {
    return undefined;
  }

  const canonicalOperationKey = input.canonicalOperationKey ?? input.key;

  return {
    id: bindingId(options, "workspace", input.key),
    executionKey: executionKey(options, canonicalOperationKey),
    canonicalOperationKey,
    operationName: input.key,
    scope: "workspace",
    kind: "workspace",
    label: input.label,
    visualIntent: "default",
    availability: availability(input.disabledReason),
    ...(input.disabledReason === undefined ? {} : { disabledReason: input.disabledReason }),
    feedback: {
      progressLabel: `${input.label}...`,
      successLabel: `${input.label} completed.`,
      replayLabel: `${input.label} replayed.`,
      failureLabel: `${input.label} failed.`,
    },
    input: {
      bootstrapAllowed: input.bootstrapAllowed,
      inputFields: input.inputFields,
      kind: "workspace",
      mode: input.mode,
      operationKind: input.kind,
      ...(input.requiredCapability === undefined
        ? {}
        : { requiredCapability: input.requiredCapability }),
    },
  };
}

function projectTreeCompositionOperationControlBinding(input: {
  action: "create" | "remove";
  operation: EntityOperationPresentationConfig;
  options: GeneratedOperationProjectionOptions;
}): GeneratedOperationControlBinding {
  const destructive = input.action === "remove";
  const label = input.operation.label;

  return baseGeneratedOperationControlBinding({
    operation: input.operation,
    id: bindingId(
      input.options,
      "tree-composition",
      `${input.operation.canonicalKey}:${input.action}`,
    ),
    executionKey: executionKey(input.options, input.operation.canonicalKey),
    label,
    kind: "treeComposition",
    visualIntent: destructive ? "destructive" : "default",
    destructive,
    ...(destructive
      ? {
          confirmation: destructiveConfirmation({
            actionLabel: label,
            description: "The placement will be removed without deleting the child record.",
            label,
          }),
        }
      : {}),
    feedback: {
      progressLabel: `${label}...`,
      successLabel: `${label} synced.`,
      replayLabel: `${label} replayed.`,
      failureLabel: `${label} failed.`,
    },
    input: {
      action: input.action,
      kind: "treeComposition",
    },
  });
}

function baseGeneratedOperationControlBinding(input: {
  executionKey: string;
  id: string;
  input: GeneratedOperationInputAdapter;
  kind: GeneratedOperationControlKind;
  label: string;
  operation: EntityOperationPresentationConfig;
  visualIntent: GeneratedOperationControlVisualIntent;
  confirmation?: GeneratedOperationControlConfirmation;
  destructive?: boolean;
  disabledReason?: string;
  feedback?: GeneratedOperationControlFeedback;
}): GeneratedOperationControlBinding {
  return {
    id: input.id,
    executionKey: input.executionKey,
    canonicalOperationKey: input.operation.canonicalKey,
    entityName: input.operation.entityName,
    operationName: input.operation.operationName,
    scope: input.operation.operation.scope,
    kind: input.kind,
    operationKind: input.operation.operation.kind,
    label: input.label,
    visualIntent: input.visualIntent,
    availability: availability(input.disabledReason),
    ...(input.disabledReason === undefined ? {} : { disabledReason: input.disabledReason }),
    ...(input.destructive ? { destructive: true } : {}),
    ...(input.confirmation === undefined ? {} : { confirmation: input.confirmation }),
    ...(input.feedback === undefined ? {} : { feedback: input.feedback }),
    input: input.input,
  };
}

function availability(disabledReason: string | undefined): GeneratedOperationControlAvailability {
  return disabledReason === undefined
    ? { state: "enabled" }
    : { state: "disabled", reason: disabledReason };
}

function bindingId(
  options: GeneratedOperationProjectionOptions,
  defaultPrefix: string,
  key: string,
) {
  return options.id ?? `${options.idPrefix ?? defaultPrefix}:${key}`;
}

function executionKey(options: GeneratedOperationProjectionOptions, canonicalOperationKey: string) {
  return (
    options.executionKey ??
    generatedOperationExecutionKey({
      canonicalOperationKey,
      targetKey: options.executionTargetKey,
    })
  );
}

function destructiveConfirmation(input: {
  actionLabel: string;
  description: string;
  label: string;
  subject?: string;
}): GeneratedOperationControlConfirmation {
  return {
    title: input.subject === undefined ? `${input.label}?` : `${input.label} ${input.subject}?`,
    description: input.description,
    actionLabel: input.actionLabel,
  };
}
