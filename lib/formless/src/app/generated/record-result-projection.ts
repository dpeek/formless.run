import type {
  CollectionEmptyStatePrimaryActionContract,
  FieldContract,
  OperationControlContract,
  RecordResultActionContract,
  RecordResultActionGroupContract,
  RecordResultContract,
  RecordResultOperationActionContract,
} from "@dpeek/formless-presentation/contract";
import type { RecordReadinessWarning } from "../../client/readiness.ts";

export type GeneratedRecordResultPlacedAction = {
  action: RecordResultActionContract;
  placement: "primary" | "secondary";
};

export type GeneratedRecordResultProjectionState =
  | {
      action?: CollectionEmptyStatePrimaryActionContract;
      description?: string;
      state: "empty";
      title?: string;
    }
  | {
      message: string;
      recordId: string;
      recordLabel?: string;
      state: "unavailable";
    }
  | {
      actions?: readonly GeneratedRecordResultPlacedAction[];
      fields: readonly FieldContract[];
      readinessWarnings?: readonly RecordReadinessWarning[];
      recordId: string;
      recordLabel: string;
      state: "ready";
    };

export type ProjectGeneratedRecordResultContractOptions = {
  accessibilityLabel: string;
  density?: RecordResultContract["density"];
  editingDisabledReason?: string;
  editingEnabled: boolean;
  id: string;
  result: GeneratedRecordResultProjectionState;
};

export function projectGeneratedRecordResultContract({
  accessibilityLabel,
  density = "default",
  editingDisabledReason = "Editing is disabled.",
  editingEnabled,
  id,
  result,
}: ProjectGeneratedRecordResultContractOptions): RecordResultContract {
  const ready = result.state === "ready" ? result : undefined;
  const selected = result.state === "empty" ? undefined : result;
  const recordLabel = selected?.recordLabel ?? selected?.recordId;

  return {
    accessibilityLabel,
    actions: projectGeneratedRecordResultActionGroup({
      actions: ready?.actions ?? [],
      id: `${id}:actions`,
      secondaryAccessibilityLabel: `More actions for ${recordLabel ?? accessibilityLabel}`,
    }),
    availability:
      result.state === "unavailable"
        ? { message: result.message, state: "unavailable" }
        : { state: result.state },
    density,
    editing: editingEnabled
      ? { enabled: true }
      : { disabledReason: editingDisabledReason, enabled: false },
    ...(result.state === "empty"
      ? {
          emptyState: {
            ...(result.action === undefined ? {} : { action: result.action }),
            ...(result.description === undefined ? {} : { description: result.description }),
            id: `${id}:empty`,
            kind: "recordResultEmptyState" as const,
            title: result.title ?? "No record found.",
          },
        }
      : {}),
    fields: ready?.fields ?? [],
    id,
    kind: "recordResult",
    ...(selected === undefined
      ? {}
      : {
          selectedRecord: {
            accessibilityLabel: recordLabel ?? selected.recordId,
            id: selected.recordId,
            kind: "recordResultRecord" as const,
          },
        }),
    warnings:
      ready === undefined || (ready.readinessWarnings?.length ?? 0) === 0
        ? []
        : [
            {
              id: `${id}:${ready.recordId}:readiness-warning`,
              items: (ready.readinessWarnings ?? []).map(({ code, message }) => ({
                code,
                message,
              })),
              kind: "recordResultWarning" as const,
              title: "Readiness warnings",
            },
          ],
  };
}

export function projectGeneratedRecordResultActionGroup({
  actions,
  id,
  secondaryAccessibilityLabel,
}: {
  actions: readonly GeneratedRecordResultPlacedAction[];
  id: string;
  secondaryAccessibilityLabel: string;
}): RecordResultActionGroupContract {
  return {
    id,
    kind: "actionGroup",
    primary: actions.filter(({ placement }) => placement === "primary").map(({ action }) => action),
    secondary: actions
      .filter(({ placement }) => placement === "secondary")
      .map(({ action }) => action),
    secondaryAccessibilityLabel,
  };
}

export function projectGeneratedRecordResultOperationAction(
  control: OperationControlContract,
  role: RecordResultOperationActionContract["role"],
): RecordResultOperationActionContract {
  return {
    control,
    kind: "operationAction",
    role,
  };
}
