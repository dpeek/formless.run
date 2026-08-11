import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type { FieldSchema } from "@dpeek/formless-schema";
import type {
  ButtonContract,
  NativeLinkActionContract,
  TableActionGroupContract,
  TableColumnContract,
  TableContract,
  TableEditActionContract,
  TableIntent,
  TableOperationActionContract,
} from "@dpeek/formless-presentation/contract";
import { recordDrafts, recordField, textControl } from "./fields/fixture-helpers.ts";
import {
  AstryxTableRenderer,
  astryxTableActionItems,
  astryxTableColumns,
  astryxTableDensity,
  astryxTableEditDialogOpenChangeHandler,
  astryxTableMoreOptionsMenuButton,
  astryxTableOrderingItems,
} from "./table-renderer.tsx";
import { operationControlFixtures } from "./operation-controls.fixtures.ts";

const titleSchema = {
  label: "Task",
  required: true,
  type: "text",
} satisfies Extract<FieldSchema, { type: "text" }>;
const titleControl = textControl(titleSchema);
const editDialogTitle = recordField({
  commit: "field-commit",
  control: titleControl,
  drafts: recordDrafts({ recordValue: "Prepare launch" }),
  editor: titleControl.editor,
  field: titleSchema,
  fieldName: "title",
  labelVisibility: "visible",
  occurrence: { ownerId: "table:task-1:edit", placementId: "title" },
  recordId: "task-1",
  rendererKind: "text",
  surface: "record",
});

describe("Astryx table renderer", () => {
  it("maps semantic columns to explicit Astryx sizing, alignment, and density", () => {
    const columns = astryxTableColumns(tableColumns);

    expect(columns.map(({ align, key, width }) => ({ align, key, width }))).toEqual([
      { align: "center", key: "order", width: { type: "pixel", value: 48 } },
      {
        align: "start",
        key: "title",
        width: { minWidth: 160, type: "proportional", value: 1 },
      },
      { align: "start", key: "owner", width: { type: "pixel", value: 112 } },
      { align: "end", key: "score", width: { type: "pixel", value: 112 } },
      { align: "end", key: "actions", width: { type: "pixel", value: 160 } },
    ]);
    expect(astryxTableDensity("compact")).toBe("compact");
    expect(astryxTableDensity("default")).toBe("spacious");
  });

  it("renders read-only values, actions, invalid-value warning, and footer", () => {
    const html = renderTable(tableFixture());

    expect(html).toMatch(/<table[^>]*aria-label="Tasks"/);
    expect(html).toContain('scope="row"');
    expect(html).toContain("Prepare launch");
    expect(html).toContain("Sam Rivera");
    expect(html).toContain('aria-label="Score value is invalid or unavailable."');
    expect(html).toContain('role="status"');
    expect(html).not.toContain("Score is temporarily unavailable.");
    expect(html).toContain('aria-label="More options for Prepare launch"');
    expect(html).toContain("Edit task");
    expect(html).toContain("Delete task");
    expect(html).toContain("Aggregate footer");
    expect(html).toContain("42");
    expect(html).toContain("points");
    expect(html).toContain("<tfoot");
  });

  it("renders compact typed presentations without exposing invalid detail or a tooltip", () => {
    const html = renderTable(typedValueTable());

    expect(html).toContain("Launch notes");
    expect(html).toContain("Ready");
    expect(html).toContain("12");
    expect(html).toContain("hours");
    expect(html).toContain("2026");
    expect(html).toContain('aria-label="Brand colour: #ff8800 color swatch"');
    expect(html).toContain('aria-label="Task icon"');
    expect(html).toContain('aria-label="Task image"');
    expect(html).toContain('aria-label="Stored value is invalid or unavailable."');
    expect(html).not.toContain("unsafe-cell-value");
    expect(html).not.toContain("Correction required");
    expect(html).not.toContain("astryx-tooltip");
    expect(html).not.toContain("<input");
  });

  it("renders an unavailable action cell as a disabled overflow menu", () => {
    const html = renderTable(withTableActionsUnavailable(tableFixture(), "Editing is unavailable"));
    const trigger = html.match(/<button[^>]*aria-label="Editing is unavailable"[^>]*>/)?.[0];

    expect(trigger).toBeDefined();
    expect(trigger).toMatch(/disabled|aria-disabled/);
  });

  it("renders available and unavailable native record links without link intents", () => {
    const newTabLink = nativeLinkAction({
      availability: "available",
      href: "https://example.test/open?task=task-1",
      target: "newTab",
    });
    const newTabHtml = renderTable(withTableLinkAction(tableFixture(), newTabLink));
    const newTabAnchor = newTabHtml.match(
      /<a[^>]*aria-label="Open external details for Prepare launch"[^>]*>/,
    )?.[0];

    expect(newTabAnchor).toContain('href="https://example.test/open?task=task-1"');
    expect(newTabAnchor).toContain('target="_blank"');
    expect(newTabAnchor).toContain('rel="noopener noreferrer"');

    const unavailableLink = nativeLinkAction({ availability: "unavailable", target: "newTab" });
    const unavailableHtml = renderTable(withTableLinkAction(tableFixture(), unavailableLink));
    const unavailableControl = unavailableHtml.match(
      /<button[^>]*aria-label="Open external details for Prepare launch"[^>]*>/,
    )?.[0];

    expect(unavailableControl).toMatch(/disabled|aria-disabled/);
    expect(unavailableHtml).toContain("Link destination is unavailable.");
  });

  it("renders a focused controlled edit dialog from projected record fields and errors", () => {
    const table = tableFixture();
    const editAction = tableActionGroup(table).actions.find(
      (action): action is TableEditActionContract => action.kind === "editAction",
    );

    expect(editAction).toBeDefined();
    const html = renderTable(table);
    expect(html).toContain("Update the selected task.");
    expect(html).toContain("Updating this shared record may affect other records.");
    expect(html).toContain("Task changes could not be saved.");
    expect(html).toMatch(/<label[^>]*>.*Task.*<\/label>/);

    const intents: TableIntent[] = [];
    const onOpenChange = astryxTableEditDialogOpenChangeHandler(editAction!.dialog, (intent) => {
      intents.push(intent);
    });
    onOpenChange(true);
    onOpenChange(false);
    expect(intents).toEqual([{ ...editAction!.dialog.openChangeIntent, open: false }]);
  });

  it("maps pending operations and dispatches action and ordering intents", () => {
    const table = tableFixture();
    const actionGroup = tableActionGroup(table);
    const pendingAction = {
      control: operationControlFixtures.workspacePushSuccess.pending,
      kind: "operationAction",
      role: "command",
    } satisfies TableOperationActionContract;
    const pendingHtml = renderTable(
      withTableActionGroup(table, { ...actionGroup, actions: [pendingAction] }),
    );
    expect(pendingHtml).toContain('aria-busy="true"');
    expect(pendingHtml).toContain("data-operation-progress");

    const tableIntents: TableIntent[] = [];
    const operationIntents: unknown[] = [];
    const onTableIntent = (intent: TableIntent) => {
      tableIntents.push(intent);
    };
    const onOperationIntent = (action: TableOperationActionContract, intent: unknown) => {
      operationIntents.push({ action, intent });
    };

    const actionItems = astryxTableActionItems(
      actionGroup.actions,
      onOperationIntent,
      onTableIntent,
    );
    expect(astryxTableMoreOptionsMenuButton(actionGroup.accessibilityLabel)).toMatchObject({
      label: "More options for Prepare launch",
      tooltip: "More options",
    });
    const editItem = actionItems[0];
    const operationItem = actionItems[1];
    if (editItem && "onClick" in editItem) editItem.onClick?.();
    if (operationItem && "onClick" in operationItem) operationItem.onClick?.();

    const ordering = table.rows[0]!.cells[0]!.contents[0];
    if (ordering?.kind !== "ordering") throw new Error("Missing ordering fixture.");
    const orderingItems = astryxTableOrderingItems(ordering, onTableIntent);
    expect(orderingItems.map((item) => ("label" in item ? item.label : undefined))).toEqual([
      "Move down",
    ]);
    const moveDown = orderingItems[0];
    if (moveDown && "onClick" in moveDown) moveDown.onClick?.();

    expect(tableIntents).toEqual([
      actionGroup.actions[0]!.kind === "editAction"
        ? actionGroup.actions[0]!.openIntent
        : undefined,
      ordering.actions[1]!.intent,
    ]);
    expect(operationIntents).toEqual([
      {
        action: actionGroup.actions[1],
        intent:
          actionGroup.actions[1]!.kind === "operationAction"
            ? actionGroup.actions[1]!.control.trigger.intent
            : undefined,
      },
    ]);
  });

  it("uses only projected empty guidance", () => {
    const html = renderTable({
      ...tableFixture(),
      emptyState: {
        description: "Adjust the current filters.",
        id: "tasks:empty",
        kind: "tableEmptyState",
        title: "No matching tasks",
      },
      footer: undefined,
      rows: [],
    });

    expect(html).toContain("No matching tasks");
    expect(html).toContain("Adjust the current filters.");
    expect(html).not.toContain("Create");
    expect(html).not.toContain("<tfoot");
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
  const actionGroup = {
    accessibilityLabel: "More options for Prepare launch",
    actions: [
      tableEditAction(),
      {
        control: operationControlFixtures.deleteTask.initial,
        kind: "operationAction",
        role: "delete",
      } satisfies TableOperationActionContract,
    ],
    id: "task-1:actions",
    kind: "actionGroup",
  } satisfies TableActionGroupContract;

  return {
    accessibilityLabel: "Tasks",
    columns: tableColumns,
    density: "default",
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
                    kind: "orderingAction",
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
                    kind: "orderingAction",
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
            contents: [cellValue("Task: Prepare launch", "Prepare launch", "text")],
            id: "task-1:title",
            kind: "tableCell",
          },
          {
            columnId: "owner",
            contents: [cellValue("Owner: Sam Rivera", "Sam Rivera", "reference")],
            id: "task-1:owner",
            kind: "tableCell",
          },
          {
            columnId: "score",
            contents: [
              {
                accessibilityLabel: "Score value is invalid or unavailable.",
                kind: "invalidValue",
              },
            ],
            id: "task-1:score",
            kind: "tableCell",
          },
          { columnId: "actions", contents: [actionGroup], id: "task-1:actions", kind: "tableCell" },
        ],
        id: "task-1",
        kind: "tableRow",
      },
    ],
  };
}

function typedValueTable(): TableContract {
  return {
    accessibilityLabel: "Typed values",
    columns: [
      {
        accessibilityLabel: "Values",
        alignment: "start",
        contentRole: "field",
        id: "values",
        isRowHeader: true,
        kind: "tableColumn",
        label: "Values",
        labelVisibility: "visible",
        width: "auto",
      },
    ],
    density: "compact",
    id: "typed-values",
    kind: "table",
    rows: [
      {
        accessibilityLabel: "Typed values",
        cells: [
          {
            columnId: "values",
            contents: [
              cellValue("Notes: Launch notes", "Launch notes", "markdown"),
              {
                accessibilityLabel: "Brand colour: #ff8800",
                displayValue: "#ff8800",
                kind: "cellValue",
                presentation: { kind: "color", swatch: "#ff8800" },
              },
              {
                accessibilityLabel: "Status: Ready",
                displayValue: "ready",
                kind: "cellValue",
                presentation: {
                  content: "label",
                  kind: "state",
                  value: {
                    color: { intent: "success", known: true },
                    iconKnown: false,
                    label: "Ready",
                  },
                },
              },
              {
                accessibilityLabel: "Task icon",
                displayValue: "Task icon",
                kind: "cellValue",
                presentation: {
                  kind: "icon",
                  source: '<svg viewBox="0 0 24 24"><path d="M12 2v20" /></svg>',
                },
              },
              {
                accessibilityLabel: "Task image",
                displayValue: "Task image",
                kind: "cellValue",
                presentation: { kind: "media", previewHref: "https://example.test/task.png" },
              },
              {
                accessibilityLabel: "Due: 11 August 2026",
                displayValue: "11 August 2026",
                kind: "cellValue",
                presentation: { kind: "temporal", temporal: { kind: "date", value: "2026-08-11" } },
              },
              {
                accessibilityLabel: "Estimate: 12 hours",
                displayValue: "12",
                kind: "cellValue",
                presentation: { kind: "number" },
                suffix: "hours",
              },
              {
                accessibilityLabel: "Stored value is invalid or unavailable.",
                kind: "invalidValue",
              },
            ],
            id: "typed-values:values",
            kind: "tableCell",
          },
        ],
        id: "typed-values-row",
        kind: "tableRow",
      },
    ],
  };
}

function cellValue(
  accessibilityLabel: string,
  displayValue: string,
  kind: "markdown" | "reference" | "text",
) {
  return { accessibilityLabel, displayValue, kind: "cellValue" as const, presentation: { kind } };
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
          fields: [editDialogTitle],
          id: "task-1:edit:fields",
          kind: "fieldSet",
          label: "Task fields",
        },
        kind: "available",
      },
      targetKind: "reference",
      title: "Edit task",
      warning: "Updating this shared record may affect other records.",
    },
    kind: "editAction",
    openIntent,
    trigger: tableButton({ id: "task-1:edit:open", label: "Edit task" }),
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
  if (content?.kind !== "actionGroup") throw new Error("Expected table action group fixture.");
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
      { ...row, cells: [...row.cells.slice(0, 4), { ...actionCell, contents: [actionGroup] }] },
    ],
  };
}

function withTableLinkAction(
  table: TableContract,
  action: NativeLinkActionContract,
): TableContract {
  const linkColumn = {
    accessibilityLabel: "External destination",
    alignment: "end",
    contentRole: "actions",
    id: "record-link",
    isRowHeader: false,
    kind: "tableColumn",
    label: "External",
    labelVisibility: "visible",
    width: "sm",
  } as const;
  return {
    ...table,
    columns: [...table.columns.slice(0, -1), linkColumn, table.columns.at(-1)!],
    footer: table.footer
      ? {
          ...table.footer,
          cells: [
            ...table.footer.cells.slice(0, -1),
            { columnId: linkColumn.id, id: "footer:record-link", kind: "emptyFooterCell" },
            table.footer.cells.at(-1)!,
          ],
        }
      : undefined,
    rows: table.rows.map((row) => ({
      ...row,
      cells: [
        ...row.cells.slice(0, -1),
        {
          columnId: linkColumn.id,
          contents: [action],
          id: `${row.id}:record-link`,
          kind: "tableCell",
        },
        row.cells.at(-1)!,
      ],
    })),
  };
}

function nativeLinkAction(
  options:
    | { availability: "available"; href: string; target: NativeLinkActionContract["target"] }
    | { availability: "unavailable"; target: NativeLinkActionContract["target"] },
): NativeLinkActionContract {
  const base = {
    accessibilityLabel: "Open external details for Prepare launch",
    id: "task-1:record-link",
    kind: "nativeLinkAction" as const,
    label: "Open external",
    prominence: "primary" as const,
    target: options.target,
  };
  return options.availability === "available"
    ? { ...base, availability: "available", href: options.href }
    : {
        ...base,
        availability: "unavailable",
        unavailableReason: "Link destination is unavailable.",
      };
}

function withTableActionsUnavailable(table: TableContract, message: string): TableContract {
  return {
    ...table,
    rows: table.rows.map((row) => ({
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
    })),
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
