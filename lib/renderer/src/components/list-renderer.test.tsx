import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type { FieldSchema } from "@dpeek/formless-schema";
import type {
  FieldIntent,
  ListContract,
  ListIntent,
  ListOperationActionContract,
  ListOrderingActionContract,
} from "@dpeek/formless-presentation/contract";
import { displayField, recordDrafts, recordField, textControl } from "./fields/fixture-helpers.ts";
import {
  AstryxListRenderer,
  astryxListDensity,
  astryxListOrderingItems,
  astryxListOverflowItems,
  dispatchAstryxListFieldIntent,
  dispatchAstryxListOperationAction,
} from "./list-renderer.tsx";
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
  occurrence: { ownerId: "list:task-1", placementId: "title" },
  recordId: "task-1",
  rendererKind: "text",
});

const displayTitle = displayField({
  control: titleControl,
  editor: titleControl.editor,
  field: titleSchema,
  fieldName: "title",
  formatting: { displayValue: "Prepare launch" },
  labelVisibility: "hidden",
  occurrence: { ownerId: "list:task-1", placementId: "title" },
  recordId: "task-1",
  surface: "record",
  value: "Prepare launch",
});

describe("Astryx list renderer", () => {
  it("maps projected density and labels a static Astryx list and its items", () => {
    expect(astryxListDensity("compact")).toBe("compact");
    expect(astryxListDensity("default")).toBe("balanced");

    const html = renderList(readOnlyList());

    expect(html).toContain('aria-label="Tasks"');
    expect(html).toContain("<ul");
    expect(html).toContain("aria-labelledby=");
    expect(html).toContain(">Tasks</span>");
    expect(html).toContain('<li aria-label="Prepare launch"');
    expect(html).toContain("Prepare launch");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<a");
  });

  it("renders controlled fields, visible primary actions, overflow hierarchy, async state, warnings, and confirmation", () => {
    const html = renderList(listContract({ pending: true }));

    expect(html).toContain('value="Prepare launch"');
    expect(html).toContain("Push workspace");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("data-operation-progress");
    expect(html).toContain('aria-label="More actions for Prepare launch"');
    expect(html).toContain("Deleting task");
    expect(html).toContain("Delete task?");
    expect(html).toContain("Prepare launch checklist will be removed from this workspace.");
    expect(html).toContain("Ordering in progress");
    expect(html).not.toContain("Move to top");
    expect(html).toContain("Owner email is missing.");
    expect(html).toMatch(/<button[^>]*aria-label="Owner email is missing\."[^>]*>/);
    expect(html).toContain("Record unavailable.");
    expect(html.indexOf("Push workspace")).toBeLessThan(
      html.indexOf('aria-label="More actions for Prepare launch"'),
    );
  });

  it("dispatches field, primary, overflow, and ordering intents without exposing unavailable moves", () => {
    const list = listContract({ pending: false });
    const item = list.items[0]!;
    const fieldIntents: unknown[] = [];
    const operationIntents: unknown[] = [];
    const listIntents: ListIntent[] = [];
    const fieldIntent = {
      fieldName: "title",
      type: "recordEditorDraftChange",
      value: "Prepare release",
    } satisfies FieldIntent;

    void dispatchAstryxListFieldIntent(
      (...args) => {
        fieldIntents.push(args);
      },
      item.id,
      editableTitle,
      fieldIntent,
    );
    void dispatchAstryxListOperationAction((action, intent) => {
      operationIntents.push({ action, intent });
    }, item.actions.primary[0]!);

    const overflowItems = astryxListOverflowItems(
      item,
      (action, intent) => {
        operationIntents.push({ action, intent });
      },
      (intent) => {
        listIntents.push(intent);
      },
    );
    expect(overflowItems.map(menuItemLabel)).toEqual(["Delete task", undefined, "Move down"]);
    menuItem(overflowItems, "Delete task").onClick?.();
    menuItem(overflowItems, "Move down").onClick?.();

    expect(fieldIntents).toEqual([[item.id, editableTitle, fieldIntent]]);
    expect(operationIntents).toEqual([
      {
        action: item.actions.primary[0],
        intent: item.actions.primary[0]!.control.trigger.intent,
      },
      {
        action: item.actions.secondary[0],
        intent: item.actions.secondary[0]!.control.trigger.intent,
      },
    ]);
    expect(listIntents).toEqual([item.ordering!.actions[1]!.intent]);
  });

  it("retains pending ordering status in overflow while suppressing duplicate dispatch", () => {
    const intents: ListIntent[] = [];
    const ordering = listContract({ pending: true }).items[0]!.ordering!;
    const items = astryxListOrderingItems(ordering, (intent) => {
      intents.push(intent);
    });

    expect(items.map(menuItemLabel)).toEqual(["Ordering in progress"]);
    expect(menuItem(items, "Ordering in progress").isDisabled).toBe(true);
    menuItem(items, "Ordering in progress").onClick?.();
    expect(intents).toEqual([]);
  });

  it("uses only projected editing-disabled and empty-state guidance and action", () => {
    const action = operationAction(operationControlFixtures.refreshTasks.initial, "command");
    const html = renderList({
      accessibilityLabel: "Tasks",
      density: "default",
      editing: { disabledReason: "Editing requires an owner session.", enabled: false },
      emptyState: {
        action,
        description: "Adjust the current filters.",
        id: "tasks:empty",
        kind: "listEmptyState",
        title: "No matching tasks",
      },
      id: "tasks",
      items: [],
      kind: "list",
    });

    expect(html).toContain("Editing requires an owner session.");
    expect(html).toContain("No matching tasks");
    expect(html).toContain("Adjust the current filters.");
    expect(html).toContain("Refresh tasks");
    expect(html).not.toContain("Create");
    expect(html).not.toContain("<ul");
  });
});

function renderList(list: ListContract) {
  return renderToStaticMarkup(
    <AstryxListRenderer
      list={list}
      onFieldIntent={() => undefined}
      onListIntent={() => undefined}
      onOperationIntent={() => undefined}
    />,
  );
}

function readOnlyList(): ListContract {
  const list = listContract({ pending: false });
  const item = list.items[0]!;

  return {
    ...list,
    items: [
      {
        ...item,
        actions: { ...item.actions, primary: [], secondary: [] },
        fields: [displayTitle],
        ordering: undefined,
        warnings: [],
      },
    ],
  };
}

function listContract({ pending }: { pending: boolean }): ListContract {
  const primaryAction = operationAction(
    pending
      ? operationControlFixtures.workspacePushSuccess.pending
      : operationControlFixtures.workspacePushSuccess.initial,
    "command",
  );
  const deleteAction = operationAction(
    pending
      ? operationControlFixtures.deleteTask.pending
      : operationControlFixtures.deleteTask.initial,
    "delete",
  );

  return {
    accessibilityLabel: "Tasks",
    density: "compact",
    editing: { enabled: true },
    id: "tasks",
    items: [
      {
        accessibilityLabel: "Prepare launch",
        actions: {
          id: "task-1:actions",
          kind: "actionGroup",
          primary: [primaryAction],
          secondary: [deleteAction],
          secondaryAccessibilityLabel: "More actions for Prepare launch",
        },
        availability: { available: true },
        fields: [editableTitle],
        id: "task-1",
        kind: "listItem",
        ordering: {
          accessibilityLabel: "Reorder Prepare launch",
          actions: orderingActions({ pending }),
          affordance: "reorder",
          kind: "ordering",
          pending,
        },
        warnings: [
          {
            id: "task-1:warnings",
            items: [{ code: "owner-email", message: "Owner email is missing." }],
            kind: "listWarning",
            title: "Readiness warnings",
          },
        ],
      },
      {
        accessibilityLabel: "Unavailable task",
        actions: {
          id: "task-2:actions",
          kind: "actionGroup",
          primary: [],
          secondary: [],
          secondaryAccessibilityLabel: "More actions for Unavailable task",
        },
        availability: { available: false, message: "Record unavailable." },
        fields: [],
        id: "task-2",
        kind: "listItem",
        warnings: [],
      },
    ],
    kind: "list",
  };
}

function operationAction(
  control: ListOperationActionContract["control"],
  role: ListOperationActionContract["role"],
): ListOperationActionContract {
  return { control, kind: "operationAction", role };
}

function orderingActions({ pending }: { pending: boolean }): ListOrderingActionContract[] {
  return [
    {
      direction: "top",
      disabled: true,
      disabledReason: "Already first",
      id: "task-1:order:top",
      intent: {
        actionId: "task-1:order:top",
        direction: "top",
        itemId: "task-1",
        listId: "tasks",
        type: "listReorder",
      },
      label: "Move to top",
      structurallyAvailable: false,
    },
    {
      direction: "down",
      ...(pending
        ? {
            disabled: true,
            disabledReason: "Ordering in progress",
            pending: { isPending: true, label: "Ordering in progress" },
          }
        : {}),
      id: "task-1:order:down",
      intent: {
        actionId: "task-1:order:down",
        direction: "down",
        itemId: "task-1",
        listId: "tasks",
        type: "listReorder",
      },
      label: "Move down",
      structurallyAvailable: true,
    },
  ];
}

function menuItemLabel(item: ReturnType<typeof astryxListOverflowItems>[number]) {
  return "label" in item ? item.label : undefined;
}

function menuItem(items: ReturnType<typeof astryxListOverflowItems>, label: string) {
  const item = items.find((candidate) => "label" in candidate && candidate.label === label);

  if (!item || !("label" in item)) {
    throw new Error(`Missing menu item "${label}".`);
  }

  return item;
}
