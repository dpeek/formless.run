import { useState } from "react";
import { Heading } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type {
  FieldContract,
  FieldIntent,
  OperationPresentationIntent,
  TableActionContract,
  TableActionGroupContract,
  TableContract,
  TableIntent,
  TableOperationActionContract,
  TableRowContract,
} from "@dpeek/formless-presentation/contract";
import { AstryxApplicationSurfaceFrame } from "./application-surface-frame.tsx";
import { applyScenarioFieldIntent } from "./fields/fixture-helpers.ts";
import { FormlessFixtureFrame, FormlessFixtureSelector } from "./fixture-layout.tsx";
import { AstryxTableRenderer } from "./table-renderer.tsx";
import { operationControlFixtures } from "./operation-controls.fixtures.ts";
import { createTableFixtures, type TableFixture, type TableFixtureId } from "./tables.fixtures.ts";

export function FormlessTablesLayout() {
  const [fixtures, setFixtures] = useState(createTableFixtures);
  const [selectedFixtureId, setSelectedFixtureId] = useState<TableFixtureId>("active");
  const selectedFixture =
    fixtures.find((fixture) => fixture.id === selectedFixtureId) ?? fixtures[0];

  const updateSelectedTable = (update: (table: TableContract) => TableContract) => {
    setFixtures((currentFixtures) =>
      currentFixtures.map((fixture) =>
        fixture.id === selectedFixtureId ? { ...fixture, table: update(fixture.table) } : fixture,
      ),
    );
  };

  return (
    <FormlessFixtureFrame
      ariaLabel="Table fixtures"
      controls={
        <FormlessFixtureSelector
          label="Table state"
          onSelectionChange={setSelectedFixtureId}
          options={fixtures}
          selectedId={selectedFixtureId}
        />
      }
    >
      <main>
        <AstryxApplicationSurfaceFrame width="wide">
          <VStack gap={5} width="100%">
            <Heading level={1}>Tables</Heading>

            {selectedFixture ? (
              <AstryxTableRenderer
                onFieldIntent={(_contextId, fieldId, _recordId, intent) =>
                  updateSelectedTable((table) => applyTableFieldIntent(table, fieldId, intent))
                }
                onOperationIntent={(action, intent) =>
                  updateSelectedTable((table) => applyTableOperationIntent(table, action, intent))
                }
                onTableIntent={(intent) =>
                  updateSelectedTable((table) => applyTableIntent(table, intent))
                }
                table={selectedFixture.table}
              />
            ) : null}
          </VStack>
        </AstryxApplicationSurfaceFrame>
      </main>
    </FormlessFixtureFrame>
  );
}

export function applyTableFieldIntent(
  table: TableContract,
  fieldId: string,
  intent: FieldIntent,
): TableContract {
  return {
    ...table,
    rows: table.rows.map((row) =>
      mapRowFields(row, (field) =>
        field.fieldId === fieldId ? applyScenarioFieldIntent(field, intent) : field,
      ),
    ),
  };
}

export function applyTableIntent(table: TableContract, intent: TableIntent): TableContract {
  if (intent.tableId !== table.id) {
    return table;
  }

  if (intent.type === "tableEditDialogOpenChange") {
    return mapTableActions(table, (action) =>
      action.kind === "editAction" && action.dialog.id === intent.dialogId
        ? { ...action, dialog: { ...action.dialog, open: intent.open } }
        : action,
    );
  }

  if (intent.type === "tableReorder") {
    return reorderFixtureRows(table, intent.rowId, intent.direction);
  }

  return table;
}

export function applyTableOperationIntent(
  table: TableContract,
  sourceAction: TableOperationActionContract,
  intent: OperationPresentationIntent,
): TableContract {
  return mapTableActions(table, (action) => {
    if (action.kind !== "operationAction" || action.control.id !== sourceAction.control.id) {
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

    return action.control.id === operationControlFixtures.deleteTask.initial.id
      ? { ...action, control: operationControlFixtures.deleteTask.settled }
      : action;
  });
}

function reorderFixtureRows(
  table: TableContract,
  rowId: string,
  direction: "bottom" | "down" | "top" | "up",
): TableContract {
  const currentIndex = table.rows.findIndex((row) => row.id === rowId);
  if (currentIndex < 0) {
    return table;
  }

  const targetIndex =
    direction === "top"
      ? 0
      : direction === "bottom"
        ? table.rows.length - 1
        : direction === "up"
          ? Math.max(0, currentIndex - 1)
          : Math.min(table.rows.length - 1, currentIndex + 1);

  if (targetIndex === currentIndex) {
    return table;
  }

  const rows = [...table.rows];
  const [movedRow] = rows.splice(currentIndex, 1);
  if (!movedRow) {
    return table;
  }

  rows.splice(targetIndex, 0, movedRow);

  return {
    ...table,
    rows: rows.map((row, index) => withOrderingAvailability(row, index, rows.length)),
  };
}

function withOrderingAvailability(
  row: TableRowContract,
  index: number,
  rowCount: number,
): TableRowContract {
  return {
    ...row,
    cells: row.cells.map((cell) => ({
      ...cell,
      contents: cell.contents.map((content) => {
        if (content.kind === "ordering") {
          return {
            ...content,
            actions: content.actions.map((action) =>
              withOrderingActionAvailability(action, index, rowCount),
            ),
          };
        }

        return content.kind === "actionGroup"
          ? {
              ...content,
              actions: content.actions.map((action) =>
                action.kind === "orderingAction"
                  ? withOrderingActionAvailability(action, index, rowCount)
                  : action,
              ),
            }
          : content;
      }),
    })),
  };
}

function withOrderingActionAvailability(
  action: Extract<TableActionContract, { kind: "orderingAction" }>,
  index: number,
  rowCount: number,
) {
  const disabled =
    (index === 0 && (action.direction === "top" || action.direction === "up")) ||
    (index === rowCount - 1 && (action.direction === "bottom" || action.direction === "down"));
  const { disabled: _disabled, disabledReason: _disabledReason, ...baseAction } = action;

  return disabled
    ? {
        ...baseAction,
        disabled: true,
        disabledReason: index === 0 ? "Already first" : "Already last",
      }
    : baseAction;
}

function mapRowFields(
  row: TableRowContract,
  update: (field: FieldContract) => FieldContract,
): TableRowContract {
  return {
    ...row,
    cells: row.cells.map((cell) => ({
      ...cell,
      contents: cell.contents.map((content) => {
        return content.kind === "actionGroup" ? mapActionGroupFields(content, update) : content;
      }),
    })),
  };
}

function mapActionGroupFields(
  group: TableActionGroupContract,
  update: (field: FieldContract) => FieldContract,
): TableActionGroupContract {
  return {
    ...group,
    actions: group.actions.map((action) => mapActionFields(action, update)),
  };
}

function mapActionFields(
  action: TableActionContract,
  update: (field: FieldContract) => FieldContract,
): TableActionContract {
  if (action.kind !== "editAction" || action.dialog.target.kind !== "available") {
    return action;
  }

  const { target } = action.dialog;

  return {
    ...action,
    dialog: {
      ...action.dialog,
      target: {
        ...target,
        fieldSet: {
          ...target.fieldSet,
          fields: target.fieldSet.fields.map(update),
        },
      },
    },
  };
}

function mapTableActions(
  table: TableContract,
  update: (action: TableActionContract) => TableActionContract,
): TableContract {
  return {
    ...table,
    rows: table.rows.map((row) => mapRowActions(row, update)),
  };
}

function mapRowActions(
  row: TableRowContract,
  update: (action: TableActionContract) => TableActionContract,
): TableRowContract {
  return {
    ...row,
    cells: row.cells.map((cell) => ({
      ...cell,
      contents: cell.contents.map((content) =>
        content.kind === "actionGroup" ? mapActionGroupActions(content, update) : content,
      ),
    })),
  };
}

function mapActionGroupActions(
  group: TableActionGroupContract,
  update: (action: TableActionContract) => TableActionContract,
): TableActionGroupContract {
  return {
    ...group,
    actions: group.actions.map((action) => mapActionTree(action, update)),
  };
}

function mapActionTree(
  action: TableActionContract,
  update: (action: TableActionContract) => TableActionContract,
): TableActionContract {
  return update(action);
}

export function selectedTableFixture(fixtures: readonly TableFixture[], id: TableFixtureId) {
  return fixtures.find((fixture) => fixture.id === id);
}
