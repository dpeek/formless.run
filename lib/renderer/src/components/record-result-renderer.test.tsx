import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type { FieldSchema } from "@dpeek/formless-schema";
import type {
  FieldContract,
  FieldIntent,
  RecordResultActionContract,
  RecordResultContract,
} from "@dpeek/formless-presentation/contract";
import { fieldScenarioGroups } from "./fields/fixtures.ts";
import {
  recordDrafts,
  recordField,
  textControl,
  withFixtureFieldOccurrence,
} from "./fields/fixture-helpers.ts";
import {
  AstryxRecordResultRenderer,
  astryxRecordResultSecondaryItems,
  astryxRecordResultSpacing,
  dispatchAstryxRecordResultFieldIntent,
  dispatchAstryxRecordResultOperationIntent,
} from "./record-result-renderer.tsx";
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
  labelVisibility: "visible",
  occurrence: { ownerId: "tasks:detail:task-1", placementId: "title" },
  recordId: "task-1",
  rendererKind: "text",
});

describe("Astryx record-result renderer", () => {
  it("maps density and renders labelled ordinary and specialized fields through Astryx", () => {
    expect(astryxRecordResultSpacing("compact")).toEqual({ fieldGap: 2, gap: 2, padding: 3 });
    expect(astryxRecordResultSpacing("default")).toEqual({ fieldGap: 4, gap: 4, padding: 4 });

    const recordResult = readyRecordResult({ editingEnabled: false, pending: true });
    const html = renderRecordResult(recordResult);

    expect(html).toContain('aria-label="Task record"');
    expect(html).toContain('data-formless-record-result-density="compact"');
    expect(html).toContain('aria-label="Prepare launch"');
    expect(html).toContain('value="Prepare launch"');
    expect(html).toContain("Task updates are unavailable.");

    for (const field of recordResult.fields) {
      expect(html).toContain(field.label);
    }

    expect(html).toContain("Edit Page Icon");
    expect(html).toContain("Pushing workspace");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("data-operation-progress");
    expect(html).toContain('aria-label="More actions for Prepare launch"');
    expect(html).toContain("Delete task?");
    expect(html).toContain("Prepare launch checklist will be removed from this workspace.");
    expect(html).toContain("Assign an owner.");
    expect(html.indexOf("Push workspace")).toBeLessThan(
      html.indexOf('aria-label="More actions for Prepare launch"'),
    );
  });

  it("dispatches ordinary, specialized, transition, overflow, and confirmation intents with canonical identities", async () => {
    const recordResult = readyRecordResult({ pending: false });
    const calls: unknown[] = [];
    const onIntent = (intent: unknown) => {
      calls.push(intent);
    };
    const title = requiredField(recordResult, "title");
    const icon = requiredField(recordResult, "pageIcon");
    const titleIntent = {
      fieldName: "title",
      type: "recordEditorDraftChange",
      value: "Prepare release",
    } satisfies FieldIntent;
    const iconIntent = {
      fieldName: "pageIcon",
      open: true,
      type: "iconDialogOpenChange",
    } satisfies FieldIntent;
    const transition = recordResult.actions.primary[0]!;
    const deletion = recordResult.actions.secondary.find((action) => action.role === "delete")!;

    await dispatchAstryxRecordResultFieldIntent(
      onIntent,
      recordResult,
      "task-1",
      title,
      titleIntent,
    );
    await dispatchAstryxRecordResultFieldIntent(onIntent, recordResult, "task-1", icon, iconIntent);
    await dispatchAstryxRecordResultOperationIntent(
      onIntent,
      recordResult,
      "task-1",
      transition,
      transition.control.trigger.intent,
    );

    const secondaryItems = astryxRecordResultSecondaryItems(recordResult, "task-1", onIntent);
    expect(secondaryItems.map(menuItemLabel)).toEqual(["Delete task", "Archive overdue"]);
    menuItem(secondaryItems, "Delete task").onClick?.();

    await dispatchAstryxRecordResultOperationIntent(
      onIntent,
      recordResult,
      "task-1",
      deletion,
      deletion.control.confirmation!.action.intent,
    );

    expect(calls).toEqual([
      {
        fieldId: title.fieldId,
        intent: titleIntent,
        recordId: "task-1",
        resultId: "tasks:detail",
        type: "recordResultFieldIntent",
      },
      {
        fieldId: icon.fieldId,
        intent: iconIntent,
        recordId: "task-1",
        resultId: "tasks:detail",
        type: "recordResultFieldIntent",
      },
      {
        controlId: transition.control.id,
        intent: transition.control.trigger.intent,
        recordId: "task-1",
        resultId: "tasks:detail",
        type: "recordResultOperationIntent",
      },
      {
        controlId: deletion.control.id,
        intent: deletion.control.trigger.intent,
        recordId: "task-1",
        resultId: "tasks:detail",
        type: "recordResultOperationIntent",
      },
      {
        controlId: deletion.control.id,
        intent: deletion.control.confirmation!.action.intent,
        recordId: "task-1",
        resultId: "tasks:detail",
        type: "recordResultOperationIntent",
      },
    ]);
  });

  it("renders only projected empty and unavailable presentation", () => {
    const emptyHtml = renderRecordResult(stateRecordResult("empty"));
    const unavailableHtml = renderRecordResult(stateRecordResult("unavailable"));

    expect(emptyHtml).toContain("No task record found.");
    expect(emptyHtml).toContain("Change the current query.");
    expect(emptyHtml).not.toContain("<article");
    expect(emptyHtml).not.toContain("<input");
    expect(emptyHtml).not.toContain("Prepare launch");
    expect(unavailableHtml).toContain("Task record is unavailable.");
    expect(unavailableHtml).not.toContain("<article");
    expect(unavailableHtml).not.toContain("<input");
    expect(unavailableHtml).not.toContain("Prepare launch");
  });
});

function renderRecordResult(recordResult: RecordResultContract) {
  return renderToStaticMarkup(
    <AstryxRecordResultRenderer onIntent={() => undefined} recordResult={recordResult} />,
  );
}

function readyRecordResult({
  editingEnabled = true,
  pending,
}: {
  editingEnabled?: boolean;
  pending: boolean;
}): RecordResultContract {
  const specialized = specializedRecordFields();
  const primary = operationAction(
    pending
      ? operationControlFixtures.workspacePushSuccess.pending
      : operationControlFixtures.workspacePushSuccess.initial,
    "transition",
  );
  const deletion = operationAction(
    pending
      ? operationControlFixtures.deleteTask.pending
      : operationControlFixtures.deleteTask.initial,
    "delete",
  );
  const failed = operationAction(operationControlFixtures.archiveOverdue.initial, "command");

  return {
    accessibilityLabel: "Task record",
    actions: {
      id: "tasks:detail:actions",
      kind: "actionGroup",
      primary: [primary],
      secondary: [deletion, failed],
      secondaryAccessibilityLabel: "More actions for Prepare launch",
    },
    availability: { state: "ready" },
    density: "compact",
    editing: editingEnabled
      ? { enabled: true }
      : { disabledReason: "Task updates are unavailable.", enabled: false },
    fields: [editableTitle, ...specialized].map((field) =>
      withFixtureFieldOccurrence(field, {
        ownerId: "tasks:detail:task-1",
        placementId: field.fieldName,
      }),
    ),
    id: "tasks:detail",
    kind: "recordResult",
    selectedRecord: {
      accessibilityLabel: "Prepare launch",
      id: "task-1",
      kind: "recordResultRecord",
    },
    warnings: [
      {
        id: "tasks:detail:task-1:warning",
        items: [{ code: "owner", message: "Assign an owner." }],
        kind: "recordResultWarning",
        title: "Readiness warnings",
      },
    ],
  };
}

function stateRecordResult(state: "empty" | "unavailable"): RecordResultContract {
  return {
    accessibilityLabel: "Task record",
    actions: {
      id: `tasks:${state}:actions`,
      kind: "actionGroup",
      primary: [],
      secondary: [],
      secondaryAccessibilityLabel: "More actions for Task record",
    },
    availability: state === "empty" ? { state } : { message: "Task record is unavailable.", state },
    density: "default",
    editing: { enabled: true },
    ...(state === "empty"
      ? {
          emptyState: {
            description: "Change the current query.",
            id: "tasks:empty",
            kind: "recordResultEmptyState" as const,
            title: "No task record found.",
          },
        }
      : {}),
    fields: [],
    id: `tasks:${state}`,
    kind: "recordResult",
    warnings: [],
  };
}

function specializedRecordFields(): FieldContract[] {
  return [
    scenarioRecordField("source-icon", "icon"),
    scenarioRecordField("media", "media"),
    scenarioRecordField("color", "color"),
    scenarioRecordField("number", "value-unit"),
    scenarioRecordField("date", "quiet-date"),
    scenarioRecordField("markdown", "markdown"),
    scenarioRecordField("enum", "enum-icon"),
    scenarioRecordField("state-machine-enum", "state-machine"),
  ].map((field) => ({ ...field, labelVisibility: "visible", recordId: "task-1" }));
}

function scenarioRecordField(
  kind: (typeof fieldScenarioGroups)[number]["kind"],
  rendererKind:
    | "color"
    | "enum-icon"
    | "icon"
    | "markdown"
    | "media"
    | "quiet-date"
    | "state-machine"
    | "value-unit",
) {
  const group = fieldScenarioGroups.find((candidate) => candidate.kind === kind);
  const variant = group?.variants.find(({ field }) => {
    if (field.surface !== "record") {
      return false;
    }

    if (rendererKind === "state-machine") {
      return field.stateMachineFacts !== undefined;
    }

    return (
      field.mode === "editor" && "rendererKind" in field && field.rendererKind === rendererKind
    );
  });

  if (!variant) {
    throw new Error(`Missing ${kind} ${rendererKind} record field scenario.`);
  }

  return variant.field;
}

function operationAction(
  control: RecordResultActionContract["control"],
  role: RecordResultActionContract["role"],
): RecordResultActionContract {
  return { control, kind: "operationAction", role };
}

function requiredField(recordResult: RecordResultContract, fieldName: string) {
  const field = recordResult.fields.find((candidate) => candidate.fieldName === fieldName);

  if (!field) {
    throw new Error(`Missing field ${fieldName}.`);
  }

  return field;
}

function menuItemLabel(item: ReturnType<typeof astryxRecordResultSecondaryItems>[number]) {
  return "label" in item ? item.label : undefined;
}

function menuItem(items: ReturnType<typeof astryxRecordResultSecondaryItems>, label: string) {
  const item = items.find((candidate) => "label" in candidate && candidate.label === label);

  if (!item || !("label" in item)) {
    throw new Error(`Missing menu item "${label}".`);
  }

  return item;
}
