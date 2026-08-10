import { useState } from "react";
import { Heading } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type {
  FieldContract,
  FieldIntent,
  ListContract,
  ListIntent,
  ListItemContract,
  ListOperationActionContract,
  OperationControlContract,
  OperationPresentationIntent,
} from "@dpeek/formless-presentation/contract";
import { AstryxApplicationSurfaceFrame } from "./application-surface-frame.tsx";
import { applyScenarioFieldIntent } from "./fields/fixture-helpers.ts";
import { FormlessFixtureFrame, FormlessFixtureSelector } from "./fixture-layout.tsx";
import { AstryxListRenderer } from "./list-renderer.tsx";
import { createListFixtures, type ListFixture, type ListFixtureId } from "./lists.fixtures.ts";
import { operationControlFixtures } from "./operation-controls.fixtures.ts";

export function FormlessListsLayout() {
  const [fixtures, setFixtures] = useState(createListFixtures);
  const [selectedFixtureId, setSelectedFixtureId] = useState<ListFixtureId>("active");
  const selectedFixture =
    fixtures.find((fixture) => fixture.id === selectedFixtureId) ?? fixtures[0];

  const updateSelectedList = (update: (list: ListContract) => ListContract) => {
    setFixtures((currentFixtures) =>
      currentFixtures.map((fixture) =>
        fixture.id === selectedFixtureId ? { ...fixture, list: update(fixture.list) } : fixture,
      ),
    );
  };

  return (
    <FormlessFixtureFrame
      ariaLabel="List fixtures"
      controls={
        <FormlessFixtureSelector
          label="List state"
          onSelectionChange={setSelectedFixtureId}
          options={fixtures}
          selectedId={selectedFixtureId}
        />
      }
    >
      <main>
        <AstryxApplicationSurfaceFrame width="standard">
          <VStack gap={5} width="100%">
            <Heading level={1}>Lists</Heading>

            {selectedFixture ? (
              <AstryxListRenderer
                list={selectedFixture.list}
                onFieldIntent={(itemId, field, intent) =>
                  updateSelectedList((list) => applyListFieldIntent(list, itemId, field, intent))
                }
                onListIntent={(intent) =>
                  updateSelectedList((list) => applyListIntent(list, intent))
                }
                onOperationIntent={(action, intent) =>
                  updateSelectedList((list) => applyListOperationIntent(list, action, intent))
                }
              />
            ) : null}
          </VStack>
        </AstryxApplicationSurfaceFrame>
      </main>
    </FormlessFixtureFrame>
  );
}

export function applyListFieldIntent(
  list: ListContract,
  itemId: string,
  sourceField: FieldContract,
  intent: FieldIntent,
): ListContract {
  return {
    ...list,
    items: list.items.map((item) =>
      item.id === itemId && item.presentation === "fields"
        ? {
            ...item,
            fields: item.fields.map((field) =>
              sameFixtureField(field, sourceField)
                ? applyScenarioFieldIntent(field, intent)
                : field,
            ),
          }
        : item,
    ),
  };
}

export function applyListIntent(list: ListContract, intent: ListIntent): ListContract {
  if (intent.listId !== list.id) {
    return list;
  }

  return reorderFixtureItems(list, intent.itemId, intent.direction);
}

export function applyListOperationIntent(
  list: ListContract,
  sourceAction: ListOperationActionContract,
  intent: OperationPresentationIntent,
): ListContract {
  return mapListActions(list, (action) => {
    if (action.control.id !== sourceAction.control.id) {
      return action;
    }

    if (intent.type === "operationConfirmationOpenChange") {
      return action.control.confirmation
        ? {
            ...action,
            control: {
              ...action.control,
              confirmation: { ...action.control.confirmation, open: intent.open },
            },
          }
        : action;
    }

    return {
      ...action,
      control: fixtureOperationResult(action.control),
    };
  });
}

function fixtureOperationResult(control: OperationControlContract): OperationControlContract {
  if (control.id === operationControlFixtures.deleteTask.initial.id) {
    return operationControlFixtures.deleteTask.settled;
  }

  if (control.id === operationControlFixtures.refreshTasks.initial.id) {
    return operationControlFixtures.refreshTasks.pending;
  }

  return control;
}

function reorderFixtureItems(
  list: ListContract,
  itemId: string,
  direction: "bottom" | "down" | "top" | "up",
): ListContract {
  const currentIndex = list.items.findIndex((item) => item.id === itemId);
  if (currentIndex < 0) {
    return list;
  }

  const targetIndex =
    direction === "top"
      ? 0
      : direction === "bottom"
        ? list.items.length - 1
        : direction === "up"
          ? Math.max(0, currentIndex - 1)
          : Math.min(list.items.length - 1, currentIndex + 1);

  if (targetIndex === currentIndex) {
    return list;
  }

  const items = [...list.items];
  const [movedItem] = items.splice(currentIndex, 1);
  if (!movedItem) {
    return list;
  }

  items.splice(targetIndex, 0, movedItem);

  return {
    ...list,
    items: items.map((item, index) => withOrderingAvailability(item, index, items.length)),
  };
}

function withOrderingAvailability(
  item: ListItemContract,
  index: number,
  itemCount: number,
): ListItemContract {
  if (item.presentation === "summary" || !item.ordering) {
    return item;
  }

  return {
    ...item,
    ordering: {
      ...item.ordering,
      actions: item.ordering.actions.map((action) => {
        const atStart = index === 0 && (action.direction === "top" || action.direction === "up");
        const atEnd =
          index === itemCount - 1 && (action.direction === "bottom" || action.direction === "down");
        const atBoundary = atStart || atEnd;
        const { disabled: _disabled, disabledReason: _disabledReason, ...baseAction } = action;

        if (item.ordering?.pending) {
          return {
            ...baseAction,
            disabled: true,
            disabledReason: "Ordering in progress",
            structurallyAvailable: !atBoundary,
          };
        }

        return atBoundary
          ? {
              ...baseAction,
              disabled: true,
              disabledReason: atStart ? "Already first" : "Already last",
              structurallyAvailable: false,
            }
          : { ...baseAction, structurallyAvailable: true };
      }),
    },
  };
}

function mapListActions(
  list: ListContract,
  update: (action: ListOperationActionContract) => ListOperationActionContract,
): ListContract {
  return {
    ...list,
    ...(list.emptyState?.action
      ? {
          emptyState: {
            ...list.emptyState,
            action:
              list.emptyState.action.kind === "operationAction"
                ? { ...update(list.emptyState.action), role: "command" }
                : list.emptyState.action,
          },
        }
      : {}),
    items: list.items.map((item) =>
      item.presentation === "summary"
        ? item
        : {
            ...item,
            actions: {
              ...item.actions,
              primary: item.actions.primary.map(update),
              secondary: item.actions.secondary.map(update),
            },
          },
    ),
  };
}

function sameFixtureField(left: FieldContract, right: FieldContract) {
  return left.fieldId === right.fieldId;
}

export function selectedListFixture(fixtures: readonly ListFixture[], id: ListFixtureId) {
  return fixtures.find((fixture) => fixture.id === id);
}
