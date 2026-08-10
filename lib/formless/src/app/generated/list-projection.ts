import type {
  CollectionEmptyStatePrimaryActionContract,
  ListActionContract,
  ListActionGroupContract,
  ListContract,
  ListFieldItemContract,
  ListOperationActionContract,
  ListOrderingContract,
  OperationControlContract,
} from "@dpeek/formless-presentation/contract";
import type { RecordReadinessWarning } from "../../client/readiness.ts";
import type { OrderingMoveMenuItem } from "./ordering-ui.ts";

export type GeneratedListPlacedAction = {
  action: ListActionContract;
  placement: "primary" | "secondary";
};

export type GeneratedListFieldItemProjectionFacts = {
  accessibilityLabel?: string;
  actions?: readonly GeneratedListPlacedAction[];
  fields?: ListFieldItemContract["fields"];
  ordering?: {
    accessibilityLabel?: string;
    items: readonly OrderingMoveMenuItem[];
    pending: boolean;
  };
  readinessWarnings?: readonly RecordReadinessWarning[];
  unavailableMessage?: string;
  presentation?: "fields";
};

export type GeneratedListSummaryItemProjectionFacts = {
  accessibilityLabel: string;
  presentation: "summary";
  subtitle?: string;
  title: string;
};

export type GeneratedListItemProjectionFacts =
  | GeneratedListFieldItemProjectionFacts
  | GeneratedListSummaryItemProjectionFacts;

export type ProjectGeneratedListContractOptions = {
  accessibilityLabel: string;
  density?: ListContract["density"];
  editingDisabledReason?: string;
  editingEnabled: boolean;
  emptyStateAction?: CollectionEmptyStatePrimaryActionContract;
  emptyStateDescription?: string;
  emptyStateTitle?: string;
  id: string;
  itemsByRecordId: Readonly<Record<string, GeneratedListItemProjectionFacts | undefined>>;
  orderedRecordIds: readonly string[];
};

export function projectGeneratedListContract({
  accessibilityLabel,
  density = "compact",
  editingDisabledReason = "Editing is disabled.",
  editingEnabled,
  emptyStateAction,
  emptyStateDescription,
  emptyStateTitle = "No records yet.",
  id,
  itemsByRecordId,
  orderedRecordIds,
}: ProjectGeneratedListContractOptions): ListContract {
  return {
    accessibilityLabel,
    density,
    editing: editingEnabled
      ? { enabled: true }
      : { disabledReason: editingDisabledReason, enabled: false },
    ...(orderedRecordIds.length === 0
      ? {
          emptyState: {
            ...(emptyStateAction === undefined ? {} : { action: emptyStateAction }),
            ...(emptyStateDescription === undefined ? {} : { description: emptyStateDescription }),
            id: `${id}:empty`,
            kind: "listEmptyState" as const,
            title: emptyStateTitle,
          },
        }
      : {}),
    id,
    items: orderedRecordIds.map((recordId) => {
      const facts = itemsByRecordId[recordId];

      if (facts?.presentation === "summary") {
        return {
          accessibilityLabel: facts.accessibilityLabel,
          id: recordId,
          kind: "listItem" as const,
          presentation: "summary" as const,
          ...(facts.subtitle === undefined ? {} : { subtitle: facts.subtitle }),
          title: facts.title,
        };
      }

      const warnings = facts?.readinessWarnings ?? [];

      return {
        accessibilityLabel: facts?.accessibilityLabel ?? recordId,
        actions: projectGeneratedListActionGroup({
          actions: facts?.actions ?? [],
          id: `${id}:${recordId}:actions`,
          secondaryAccessibilityLabel: `More actions for ${facts?.accessibilityLabel ?? recordId}`,
        }),
        availability:
          facts?.unavailableMessage === undefined
            ? { available: true as const }
            : { available: false as const, message: facts.unavailableMessage },
        fields: facts?.fields ?? [],
        id: recordId,
        kind: "listItem" as const,
        ...(facts?.ordering === undefined
          ? {}
          : {
              ordering: projectGeneratedListOrdering({
                accessibilityLabel:
                  facts.ordering.accessibilityLabel ??
                  `Reorder ${facts.accessibilityLabel ?? recordId}`,
                itemId: recordId,
                items: facts.ordering.items,
                listId: id,
                pending: facts.ordering.pending,
              }),
            }),
        presentation: "fields" as const,
        warnings:
          warnings.length === 0
            ? []
            : [
                {
                  id: `${id}:${recordId}:readiness-warning`,
                  items: warnings.map(({ code, message }) => ({ code, message })),
                  kind: "listWarning" as const,
                  title: "Readiness warnings",
                },
              ],
      };
    }),
    kind: "list",
  };
}

export function projectGeneratedListActionGroup({
  actions,
  id,
  secondaryAccessibilityLabel,
}: {
  actions: readonly GeneratedListPlacedAction[];
  id: string;
  secondaryAccessibilityLabel: string;
}): ListActionGroupContract {
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

export function projectGeneratedListOperationAction(
  control: OperationControlContract,
  role: ListOperationActionContract["role"],
): ListOperationActionContract {
  return {
    control,
    kind: "operationAction",
    role,
  };
}

export function projectGeneratedListOrdering({
  accessibilityLabel,
  itemId,
  items,
  listId,
  pending,
}: {
  accessibilityLabel: string;
  itemId: string;
  items: readonly OrderingMoveMenuItem[];
  listId: string;
  pending: boolean;
}): ListOrderingContract {
  return {
    accessibilityLabel,
    actions: items.map((item) => {
      const id = `${listId}:${itemId}:order:${item.direction}`;
      const disabledReason = pending ? "Ordering in progress" : item.disabledReason;

      return {
        direction: item.direction,
        disabled: item.disabled || pending,
        ...(disabledReason === undefined ? {} : { disabledReason }),
        id,
        intent: {
          actionId: id,
          direction: item.direction,
          itemId,
          listId,
          type: "listReorder",
        },
        label: item.label,
        ...(pending ? { pending: { isPending: true, label: "Ordering in progress" } } : {}),
        structurallyAvailable: !(
          item.plan.kind === "unavailable" && item.plan.reason === "already-at-boundary"
        ),
      };
    }),
    affordance: "reorder",
    kind: "ordering",
    pending,
  };
}
