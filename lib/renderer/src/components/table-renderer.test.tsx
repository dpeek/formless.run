import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type { FieldSchema } from "@dpeek/formless-schema";
import type {
  ButtonContract,
  TableActionContract,
  TableActionGroupContract,
  TableColumnContract,
  TableContract,
  TableEditActionContract,
  TableIntent,
  TableOperationActionContract,
} from "@dpeek/formless-presentation/contract";
import {
  displayField,
  fieldError,
  recordDrafts,
  recordField,
  textControl,
} from "./fields/fixture-helpers.ts";
import {
  AstryxTableRenderer,
  astryxTableColumns,
  astryxTableDensity,
  astryxTableEditDialogOpenChangeHandler,
  astryxTableOrderingItems,
  astryxTableSecondaryActionItems,
  astryxTableSecondaryMenuButton,
  dispatchAstryxTableAction,
} from "./table-renderer.tsx";
import { operationControlFixtures } from "./operation-controls.fixtures.ts";

const titleSchema = {
  label: "Task",
  required: true,
  type: "text",
} satisfies Extract<
  FieldSchema,
  {
    type: "text";
  }
>;
const titleControl = textControl(titleSchema);
const editableTitle = recordField({
  commit: "field-commit",
  control: titleControl,
  drafts: recordDrafts({ recordValue: "Prepare launch" }),
  editor: titleControl.editor,
  field: titleSchema,
  fieldName: "title",
  labelVisibility: "hidden",
  occurrence: { ownerId: "table:task-1", placementId: "title" },
  recordId: "task-1",
  rendererKind: "text",
  surface: "table-cell",
});

const displayTitle = displayField({
  control: titleControl,
  editor: titleControl.editor,
  field: titleSchema,
  fieldName: "title",
  formatting: { displayValue: "Prepare launch" },
  labelVisibility: "hidden",
  occurrence: { ownerId: "table:task-1", placementId: "title" },
  recordId: "task-1",
  surface: "table-cell",
  value: "Prepare launch",
});

describe("Astryx table renderer", () => {
  it("maps semantic columns to explicit Astryx sizing, alignment, and density", () => {
    const columns = astryxTableColumns(tableColumns);

    expect(columns.map(({ align, key, width }) => ({ align, key, width }))).toEqual([
      {
        align: "center",
        key: "order",
        width: { type: "pixel", value: 48 },
      },
      {
        align: "start",
        key: "title",
        width: { minWidth: 160, type: "proportional", value: 1 },
      },
      {
        align: "start",
        key: "owner",
        width: { type: "pixel", value: 112 },
      },
      {
        align: "end",
        key: "score",
        width: { type: "pixel", value: 112 },
      },
      {
        align: "end",
        key: "actions",
        width: { type: "pixel", value: 160 },
      },
    ]);
    expect(astryxTableDensity("compact")).toBe("compact");
    expect(astryxTableDensity("default")).toBe("spacious");
  });

  it("renders semantic headers, mixed cells, action hierarchy, async state, warnings, and footer", () => {
    const html = renderTable(tableFixture());

    expect(html).toContain('<table aria-label="Tasks"');
    expect(html).toContain('aria-label="Ordering"');
    expect(html).toContain('scope="col"');
    expect(html).toContain('scope="row"');
    expect(html).toContain('value="Prepare launch"');
    expect(html).toContain("Sam Rivera");
    expect(html).toContain("Calculating score");
    expect(html).toContain("Score is temporarily unavailable.");
    expect(html).toContain("Open task");
    expect(html).toContain('aria-label="More task actions"');
    expect(html).toContain("Edit task");
    expect(html).toContain("Delete task");
    expect(html).toContain("Owner email is missing.");
    expect(html).toContain('aria-label="Row warning: Owner email is missing."');
    expect(html).toMatch(/<button[^>]*aria-label="Row warning: Owner email is missing\."[^>]*>/);
    expect(html).toContain('aria-label="Score is temporarily unavailable."');
    expect(html).not.toContain("Readiness warnings:");
    expect(html).not.toContain("astryx-banner");
    expect(html.match(/<tr/g)).toHaveLength(3);
    expect(html.indexOf('aria-label="Row warning: Owner email is missing."')).toBeGreaterThan(
      html.indexOf('aria-label="More task actions"'),
    );
    expect(html).toContain("Aggregate footer");
    expect(html).toContain("42");
    expect(html).toContain("points");
    expect(
      html.match(/(?:—|42)\u00a0<span[^>]*data-type="body"[^>]*>points<\/span>/g),
    ).toHaveLength(2);
    expect(html.match(/data-type="body"[^>]*>points/g)).toHaveLength(2);
    expect(html).not.toMatch(/data-type="supporting"[^>]*>points/);
    expect(html).toContain("<tfoot");
  });

  it("renders an unavailable action cell as a disabled overflow menu", () => {
    const html = renderTable(withTableActionsUnavailable(tableFixture(), "Editing is unavailable"));
    const trigger = html.match(/<button[^>]*aria-label="Editing is unavailable"[^>]*>/)?.[0];

    expect(trigger).toBeDefined();
    expect(trigger).toMatch(/disabled|aria-disabled/);
    expect(html).toContain("Editing is unavailable");
  });

  it("keeps table-cell field validation compact and exposes the message through a tooltip", () => {
    const table = tableFixture();
    const actionGroup = tableActionGroup(table);
    const invalidTitle = {
      ...editableTitle,
      errors: [fieldError("title", "Task is required.")],
    };
    const compactTable = withTableTitleField(
      withTableActionGroup(table, { ...actionGroup, primary: [], secondary: [] }),
      invalidTitle,
    );
    const html = renderTable(compactTable);

    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('data-status="error"');
    expect(html).toContain('class="astryx-tooltip');
    expect(html).toContain("Task is required.");
    expect(html).not.toContain("astryx-field-status");
  });

  it("renders a focused controlled edit dialog from projected fields and errors", () => {
    const table = tableFixture();
    const editAction = tableActionGroup(table).secondary.find(
      (action): action is TableEditActionContract => action.kind === "editAction",
    );

    expect(editAction).toBeDefined();
    const html = renderTable(table);

    expect(html).toContain("Edit task");
    expect(html).toContain("Update the selected task.");
    expect(html).toContain("Task changes could not be saved.");
    expect(html).toContain(">Done</span>");
    expect(html).toMatch(/<label[^>]*>.*Task.*<\/label>/);

    const intents: TableIntent[] = [];
    const onOpenChange = astryxTableEditDialogOpenChangeHandler(editAction!.dialog, (intent) => {
      intents.push(intent);
    });

    onOpenChange(true);
    onOpenChange(false);
    expect(intents).toEqual([{ ...editAction!.dialog.openChangeIntent, open: false }]);
  });

  it("maps a pending operation action to Astryx loading and progress feedback", () => {
    const table = tableFixture();
    const pendingAction = {
      control: operationControlFixtures.workspacePushSuccess.pending,
      kind: "operationAction",
      role: "command",
    } satisfies TableOperationActionContract;
    const html = renderTable(
      withTableActionGroup(table, {
        ...tableActionGroup(table),
        primary: [pendingAction],
        secondary: [],
      }),
    );

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Push workspace");
    expect(html).toContain("data-operation-progress");
  });

  it("dispatches visible, overflow, operation, and ordering actions through projected intents", () => {
    const table = tableFixture();
    const actionGroup = tableActionGroup(table);
    const tableIntents: TableIntent[] = [];
    const operationIntents: unknown[] = [];
    const onTableIntent = (intent: TableIntent) => {
      tableIntents.push(intent);
    };
    const onOperationIntent = (action: TableOperationActionContract, intent: unknown) => {
      operationIntents.push({ action, intent });
    };

    dispatchAstryxTableAction(actionGroup.primary[0]!, onOperationIntent, onTableIntent);

    const secondaryItems = astryxTableSecondaryActionItems(
      actionGroup.secondary,
      onOperationIntent,
      onTableIntent,
    );
    expect(astryxTableSecondaryMenuButton(actionGroup.secondaryAccessibilityLabel)).toMatchObject({
      label: "More task actions",
      tooltip: "More options",
    });
    const editItem = secondaryItems[0];
    const operationItem = secondaryItems[1];
    if (editItem && "onClick" in editItem) {
      editItem.onClick?.();
    }
    if (operationItem && "onClick" in operationItem) {
      operationItem.onClick?.();
    }

    const ordering = table.rows[0]!.cells[0]!.contents[0];
    expect(ordering?.kind).toBe("ordering");
    if (ordering?.kind === "ordering") {
      const orderingItems = astryxTableOrderingItems(ordering, onTableIntent);
      expect(orderingItems.map((item) => ("label" in item ? item.label : undefined))).toEqual([
        "Move down",
      ]);
      expect(
        astryxTableOrderingItems(
          {
            ...ordering,
            actions: [
              ordering.actions[0]!,
              {
                ...ordering.actions[1]!,
                pending: { isPending: true, label: "Moving down" },
              },
            ],
          },
          onTableIntent,
        ),
      ).toMatchObject([{ isDisabled: true, label: "Moving down" }]);
      const moveDown = orderingItems[0];
      if (moveDown && "onClick" in moveDown) {
        moveDown.onClick?.();
      }
    }

    expect(tableIntents).toEqual([
      actionGroup.primary[0]!.kind === "invokeAction" ? actionGroup.primary[0]!.intent : undefined,
      actionGroup.secondary[0]!.kind === "editAction"
        ? actionGroup.secondary[0]!.openIntent
        : undefined,
      table.rows[0]!.cells[0]!.contents[0]?.kind === "ordering"
        ? table.rows[0]!.cells[0]!.contents[0].actions[1]!.intent
        : undefined,
    ]);
    expect(operationIntents).toEqual([
      {
        action: actionGroup.secondary[1],
        intent:
          actionGroup.secondary[1]!.kind === "operationAction"
            ? actionGroup.secondary[1]!.control.trigger.intent
            : undefined,
      },
    ]);
  });

  it("uses only projected empty guidance and editing-disabled reason", () => {
    const html = renderTable({
      ...tableFixture(),
      editing: { disabledReason: "Editing requires an owner session.", enabled: false },
      emptyState: {
        description: "Adjust the current filters.",
        id: "tasks:empty",
        kind: "tableEmptyState",
        title: "No matching tasks",
      },
      footer: undefined,
      rows: [],
    });

    expect(html).toContain("Editing requires an owner session.");
    expect(html).toContain("No matching tasks");
    expect(html).toContain("Adjust the current filters.");
    expect(html).not.toContain("Create");
    expect(html).not.toContain("<tfoot");
  });

  it("renders read-only canonical fields without requiring field or operation handlers", () => {
    const table = tableFixture();
    const titleCell = table.rows[0]!.cells[1]!;
    const readOnlyTable = {
      ...table,
      rows: [
        {
          ...table.rows[0]!,
          cells: [
            table.rows[0]!.cells[0]!,
            {
              ...titleCell,
              contents: [{ field: displayTitle, kind: "field", source: "record" }],
            },
            ...table.rows[0]!.cells.slice(2),
          ],
        },
      ],
    } satisfies TableContract;

    expect(renderTable(readOnlyTable)).toContain("Prepare launch");
  });
});

function renderTable(table: TableContract) {
  return renderToStaticMarkup(
    <AstryxTableRenderer
      onFieldIntent={() => undefined}
      onOperationIntent={() => undefined}
      onTableIntent={() => undefined}
      table={table}
    />,
  );
}

function tableFixture(): TableContract {
  const primaryAction = invokeAction({
    actionId: "open-task",
    label: "Open task",
    prominence: "primary",
  });
  const editAction = tableEditAction();
  const deleteAction = {
    control: operationControlFixtures.deleteTask.initial,
    kind: "operationAction",
    role: "delete",
  } satisfies TableOperationActionContract;
  const actionGroup = {
    id: "task-1:actions",
    kind: "actionGroup",
    primary: [primaryAction],
    secondary: [editAction, deleteAction],
    secondaryAccessibilityLabel: "More task actions",
  } satisfies TableActionGroupContract;

  return {
    accessibilityLabel: "Tasks",
    columns: tableColumns,
    density: "default",
    editing: { enabled: true },
    footer: {
      accessibilityLabel: "Aggregate footer",
      cells: [
        { columnId: "order", id: "footer:order", kind: "emptyFooterCell" },
        { columnId: "title", id: "footer:title", kind: "emptyFooterCell" },
        { columnId: "owner", id: "footer:owner", kind: "emptyFooterCell" },
        {
          accessibilityLabel: "Total score: 42 points",
          columnId: "score",
          displayValue: "42",
          id: "footer:score",
          kind: "aggregateFooterCell",
          status: { kind: "ready" },
          suffix: "points",
        },
        { columnId: "actions", id: "footer:actions", kind: "emptyFooterCell" },
      ],
      id: "tasks:footer",
      kind: "tableFooter",
    },
    id: "tasks",
    kind: "table",
    rows: [
      {
        accessibilityLabel: "Prepare launch",
        cells: [
          {
            columnId: "order",
            contents: [
              {
                accessibilityLabel: "Reorder Prepare launch",
                actions: [
                  {
                    direction: "up",
                    disabled: true,
                    disabledReason: "Already first",
                    id: "task-1:up",
                    intent: {
                      actionId: "task-1:up",
                      direction: "up",
                      rowId: "task-1",
                      tableId: "tasks",
                      type: "tableReorder",
                    },
                    label: "Move up",
                  },
                  {
                    direction: "down",
                    id: "task-1:down",
                    intent: {
                      actionId: "task-1:down",
                      direction: "down",
                      rowId: "task-1",
                      tableId: "tasks",
                      type: "tableReorder",
                    },
                    label: "Move down",
                  },
                ],
                affordance: "reorder",
                kind: "ordering",
                pending: false,
              },
            ],
            id: "task-1:order",
            kind: "tableCell",
          },
          {
            columnId: "title",
            contents: [{ field: editableTitle, kind: "field", source: "record" }],
            id: "task-1:title",
            kind: "tableCell",
          },
          {
            columnId: "owner",
            contents: [
              {
                accessibilityLabel: "Owner: Sam Rivera",
                displayValue: "Sam Rivera",
                kind: "displayValue",
                status: { kind: "ready" },
                valueKind: "reference",
              },
            ],
            id: "task-1:owner",
            kind: "tableCell",
          },
          {
            columnId: "score",
            contents: [
              {
                accessibilityLabel: "Task score",
                displayValue: "—",
                kind: "displayValue",
                status: {
                  kind: "unavailable",
                  message: "Score is temporarily unavailable.",
                },
                suffix: "points",
                valueKind: "computed",
              },
              {
                accessibilityLabel: "Calculating score",
                displayValue: "—",
                kind: "displayValue",
                status: { kind: "pending", label: "Calculating score" },
                valueKind: "computed",
              },
            ],
            id: "task-1:score",
            kind: "tableCell",
          },
          {
            columnId: "actions",
            contents: [actionGroup],
            id: "task-1:actions",
            kind: "tableCell",
          },
        ],
        id: "task-1",
        kind: "tableRow",
        warnings: [
          {
            id: "task-1:warnings",
            items: [{ code: "owner-email", message: "Owner email is missing." }],
            kind: "tableWarning",
            title: "Readiness warnings",
          },
        ],
      },
    ],
  };
}

function tableEditAction(): TableEditActionContract {
  const openIntent = {
    dialogId: "task-1:edit",
    open: true,
    rowId: "task-1",
    tableId: "tasks",
    type: "tableEditDialogOpenChange",
  } as const;

  return {
    dialog: {
      close: tableButton({ id: "task-1:edit:close", label: "Done" }),
      description: "Update the selected task.",
      id: "task-1:edit",
      kind: "tableEditDialog",
      open: true,
      openChangeIntent: { ...openIntent, open: false },
      target: {
        fieldSet: {
          disabled: false,
          errors: ["Task changes could not be saved."],
          fields: [
            {
              ...editableTitle,
              labelVisibility: "visible",
              surface: "record",
            },
          ],
          id: "task-1:edit:fields",
          kind: "fieldSet",
          label: "Task fields",
        },
        kind: "available",
      },
      targetKind: "row",
      title: "Edit task",
    },
    kind: "editAction",
    openIntent,
    trigger: tableButton({ id: "task-1:edit:open", label: "Edit task" }),
  };
}

function invokeAction({
  actionId,
  label,
  prominence = "secondary",
}: {
  actionId: string;
  label: string;
  prominence?: ButtonContract["prominence"];
}): TableActionContract {
  return {
    intent: {
      actionId,
      invocationSource: "button",
      rowId: "task-1",
      tableId: "tasks",
      type: "tableActionInvoke",
    },
    kind: "invokeAction",
    role: "command",
    trigger: tableButton({ id: actionId, label, prominence }),
  };
}

function tableButton({
  id,
  label,
  prominence = "secondary",
}: {
  id: string;
  label: string;
  prominence?: ButtonContract["prominence"];
}): ButtonContract {
  return {
    accessibilityLabel: label,
    content: { kind: "label", label },
    density: "compact",
    id,
    kind: "button",
    prominence,
    type: "button",
  };
}

function tableActionGroup(table: TableContract) {
  const content = table.rows[0]!.cells[4]!.contents[0];

  if (content?.kind !== "actionGroup") {
    throw new Error("Expected table action group fixture.");
  }

  return content;
}

function withTableActionGroup(
  table: TableContract,
  actionGroup: TableActionGroupContract,
): TableContract {
  const row = table.rows[0]!;
  const actionCell = row.cells[4]!;

  return {
    ...table,
    rows: [
      {
        ...row,
        cells: [...row.cells.slice(0, 4), { ...actionCell, contents: [actionGroup] }],
      },
    ],
  };
}

function withTableTitleField(table: TableContract, field: typeof editableTitle): TableContract {
  const row = table.rows[0]!;
  const titleCell = row.cells[1]!;

  return {
    ...table,
    rows: [
      {
        ...row,
        cells: [
          row.cells[0]!,
          { ...titleCell, contents: [{ field, kind: "field", source: "record" }] },
          ...row.cells.slice(2),
        ],
      },
    ],
  };
}

function withTableActionsUnavailable(table: TableContract, message: string): TableContract {
  const row = table.rows[0]!;

  return {
    ...table,
    rows: [
      {
        ...row,
        cells: row.cells.map((cell) =>
          cell.columnId === "actions"
            ? {
                ...cell,
                contents: [
                  {
                    accessibilityLabel: `Actions unavailable for ${row.accessibilityLabel}`,
                    kind: "unavailable",
                    message,
                  },
                ],
              }
            : cell,
        ),
      },
    ],
  };
}

const tableColumns = [
  {
    accessibilityLabel: "Ordering",
    alignment: "center",
    contentRole: "ordering",
    id: "order",
    isRowHeader: false,
    kind: "tableColumn",
    label: "Order",
    labelVisibility: "hidden",
    width: "xs",
  },
  {
    accessibilityLabel: "Task",
    alignment: "start",
    contentRole: "field",
    id: "title",
    isRowHeader: true,
    kind: "tableColumn",
    label: "Task",
    labelVisibility: "visible",
    width: "auto",
  },
  {
    accessibilityLabel: "Owner",
    alignment: "start",
    contentRole: "reference",
    id: "owner",
    isRowHeader: false,
    kind: "tableColumn",
    label: "Owner",
    labelVisibility: "visible",
    width: "sm",
  },
  {
    accessibilityLabel: "Score",
    alignment: "end",
    contentRole: "computed",
    id: "score",
    isRowHeader: false,
    kind: "tableColumn",
    label: "Score",
    labelVisibility: "visible",
    width: "sm",
  },
  {
    accessibilityLabel: "Actions",
    alignment: "end",
    contentRole: "actions",
    id: "actions",
    isRowHeader: false,
    kind: "tableColumn",
    label: "Actions",
    labelVisibility: "hidden",
    width: "md",
  },
] satisfies readonly TableColumnContract[];
