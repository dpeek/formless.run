// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { FieldSchema } from "@dpeek/formless-schema";
import type {
  ButtonContract,
  CreateFieldContract,
  CreateSurfaceContract,
  RecordResultContract,
  RelationshipHierarchyContract,
  RelationshipHierarchyCreateActionContract,
  RelationshipHierarchyIntent,
  RelationshipHierarchyLinkActionContract,
  RelationshipHierarchyNodeContract,
  RelationshipHierarchyOperationActionContract,
  WorkspaceIntent,
  WorkspaceIntentScope,
} from "@dpeek/formless-presentation/contract";
import { PresentationHostProvider } from "@dpeek/formless-presentation/host/react";
import { createField, recordDrafts, recordField, textControl } from "./fields/fixture-helpers.ts";
import { createFormlessGeneratedWorkspaceFixtures } from "./generated-workspace.fixtures.ts";
import {
  createFormlessGeneratedWorkspaceFixtureHost,
  selectedGeneratedWorkspaceFixture,
} from "./generated-workspace.tsx";
import { operationControlFixtures } from "./operation-controls.fixtures.ts";
import {
  AstryxRelationshipHierarchyRenderer,
  astryxRelationshipHierarchyActionMenuItems,
  dispatchAstryxRelationshipHierarchyCreateFieldIntent,
  dispatchAstryxRelationshipHierarchyOperationIntent,
  dispatchAstryxRelationshipHierarchyRecordResultIntent,
  dispatchAstryxWorkspaceRelationshipHierarchyIntent,
} from "./relationship-hierarchy-renderer.tsx";
import { AstryxSubscribedWorkspaceScreenRenderer } from "./workspace-screen-renderer.tsx";

const titleSchema = {
  label: "Name",
  required: true,
  type: "text",
} satisfies Extract<FieldSchema, { type: "text" }>;
const titleControl = textControl(titleSchema);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("Astryx relationship-hierarchy renderer", () => {
  it("does not reserve body spacing for idle operation effects", () => {
    const hierarchy = hierarchyContract();
    hierarchy.root.headerActions.items = [
      {
        control: operationControlFixtures.workspacePushSuccess.initial,
        kind: "operationAction",
      },
    ];
    const renderer = render(
      <AstryxRelationshipHierarchyRenderer hierarchy={hierarchy} onIntent={() => undefined} />,
    );
    const root = renderer.getByRole("region", { name: "Formless account" });
    const editor = within(root).getByRole("region", { name: "Formless account editor" });

    expect(editor.parentElement?.firstElementChild).toBe(editor);
  });

  it("renders every heterogeneous editable node, one populated header menu, action state, a child dialog, and labelled empty groups", () => {
    const hierarchy = hierarchyContract();
    const html = renderToStaticMarkup(
      <AstryxRelationshipHierarchyRenderer hierarchy={hierarchy} onIntent={() => undefined} />,
    );

    expect(html).toContain('aria-label="Account relationship hierarchy"');
    expect(html).toContain('aria-label="Formless account"');
    expect(html).toContain('aria-label="Runtime project"');
    expect(html).toContain('aria-label="Ship hierarchy task"');
    expect(html).toContain(">Account<");
    expect(html).toContain(">Project<");
    expect(html).toContain(">Task<");
    expect(html).toContain('value="Formless"');
    expect(html).toContain('value="Runtime"');
    expect(html).toContain('value="Ship hierarchy"');
    expect(html).toContain('aria-label="More project actions"');
    expect(html).toContain("Open project dashboard");
    expect(html).toContain("Open project documentation");
    expect(html).toContain("Open project issue — External issue key is unavailable.");
    expect(html).not.toContain('aria-label="More account actions"');
    expect(html).toContain('data-operation-progress="');
    expect(html).toContain('data-operation-status="pending"');
    expect(html).toContain("Delete task?");
    expect(html).toContain("Prepare launch checklist will be removed from this workspace.");
    expect(html).toContain('aria-label="Add task"');
    expect(html).toContain("Archived projects");
    expect(html).not.toContain("Complete task");
    expect(html).not.toContain("More actions for Formless account");
    expect(html).not.toMatch(/aria-label="(?:Select|Expand|Collapse|Move) /);
    expect(html.indexOf(">Projects<")).toBeLessThan(html.indexOf(">Tasks<"));
    expect(html.indexOf(">Tasks<")).toBeLessThan(html.indexOf(">Archived projects<"));
  });

  it("renders available and unavailable link menu items and navigates without intents", () => {
    const hierarchy = hierarchyContract();
    const project = required(hierarchy.root.relationshipGroups[0]?.nodes[0]);
    const intents: RelationshipHierarchyIntent[] = [];
    const menuItems = astryxRelationshipHierarchyActionMenuItems(hierarchy, project, (intent) => {
      intents.push(intent);
    });
    const assign = vi.fn();
    const open = vi.fn();
    vi.stubGlobal("window", { location: { assign }, open });

    expect(
      menuItems.slice(0, 3).map(({ isDisabled, label, onClick }) => ({
        hasActivation: onClick !== undefined,
        isDisabled,
        label,
      })),
    ).toEqual([
      {
        hasActivation: true,
        isDisabled: false,
        label: "Open project dashboard",
      },
      {
        hasActivation: true,
        isDisabled: false,
        label: "Open project documentation",
      },
      {
        hasActivation: false,
        isDisabled: true,
        label: "Open project issue — External issue key is unavailable.",
      },
    ]);

    clickMenuItem(required(menuItems[0]));
    clickMenuItem(required(menuItems[1]));
    clickMenuItem(required(menuItems[2]));

    expect(assign).toHaveBeenCalledWith("https://example.test/projects/project:runtime");
    expect(open).toHaveBeenCalledWith(
      "https://docs.example.test/projects/project:runtime",
      "_blank",
      "noopener,noreferrer",
    );
    expect(intents).toEqual([]);
  });

  it("dispatches path-scoped record, operation, create, create-field, and workspace intents", () => {
    const hierarchy = hierarchyContract();
    const project = required(hierarchy.root.relationshipGroups[0]?.nodes[0]);
    const field = required(project.editor.fields[0]);
    const operation = required(
      project.headerActions.items.find(
        (action): action is RelationshipHierarchyOperationActionContract =>
          action.kind === "operationAction" && action.control.confirmation !== undefined,
      ),
    );
    const create = required(
      project.headerActions.items.find(
        (action): action is RelationshipHierarchyCreateActionContract =>
          action.kind === "createAction",
      ),
    );
    const createField = required(create.surface.dialog.form.fieldSet.fields[0]);
    const hierarchyIntents: RelationshipHierarchyIntent[] = [];
    const handleIntent = (intent: RelationshipHierarchyIntent) => {
      hierarchyIntents.push(intent);
    };
    const fieldIntent = {
      fieldName: field.fieldName,
      type: "recordEditorDraftChange" as const,
      value: "Runtime 2",
    };
    const recordIntent = {
      fieldId: field.fieldId,
      intent: fieldIntent,
      recordId: project.recordId,
      resultId: project.editor.id,
      type: "recordResultFieldIntent" as const,
    };
    const confirmationIntent = required(operation.control.confirmation).action.intent;
    const createFieldIntent = {
      fieldName: createField.fieldName,
      fieldValue: { kind: "input" as const, value: "Document hierarchy" },
      type: "createDraftChange" as const,
    };

    void dispatchAstryxRelationshipHierarchyRecordResultIntent(
      handleIntent,
      hierarchy,
      project,
      recordIntent,
    );
    void dispatchAstryxRelationshipHierarchyOperationIntent(
      handleIntent,
      hierarchy,
      project,
      operation,
      confirmationIntent,
    );
    void dispatchAstryxRelationshipHierarchyCreateFieldIntent(
      handleIntent,
      hierarchy,
      project,
      create,
      createField.fieldId,
      createFieldIntent,
    );

    const menuItems = astryxRelationshipHierarchyActionMenuItems(hierarchy, project, handleIntent);
    expect(menuItems.map((item) => item.label)).toEqual([
      "Open project dashboard",
      "Open project documentation",
      "Open project issue — External issue key is unavailable.",
      "Pushing workspace",
      "Deleting task",
      "Add task",
    ]);
    clickMenuItem(required(menuItems[3]));
    clickMenuItem(required(menuItems[4]));
    clickMenuItem(required(menuItems[5]));

    expect(hierarchyIntents).toEqual([
      {
        hierarchyId: hierarchy.id,
        intent: recordIntent,
        occurrenceId: project.id,
        recordId: project.recordId,
        resultId: project.editor.id,
        type: "relationshipHierarchyRecordResult",
      },
      {
        controlId: operation.control.id,
        hierarchyId: hierarchy.id,
        intent: confirmationIntent,
        occurrenceId: project.id,
        recordId: project.recordId,
        type: "relationshipHierarchyOperation",
      },
      {
        fieldId: createField.fieldId,
        hierarchyId: hierarchy.id,
        intent: createFieldIntent,
        occurrenceId: project.id,
        relationshipGroupId: create.relationshipGroupId,
        surfaceId: create.surface.id,
        type: "relationshipHierarchyCreateField",
      },
      {
        hierarchyId: hierarchy.id,
        intent: {
          open: true,
          surfaceId: create.surface.id,
          type: "createOpenChange",
        },
        occurrenceId: project.id,
        relationshipGroupId: create.relationshipGroupId,
        surfaceId: create.surface.id,
        type: "relationshipHierarchyCreate",
      },
    ]);

    const workspaceIntents: WorkspaceIntent[] = [];
    const scope = {
      collectionId: "collection:accounts",
      screenId: "workspace:accounts",
      sectionId: "section:accounts",
    } satisfies WorkspaceIntentScope;
    void dispatchAstryxWorkspaceRelationshipHierarchyIntent(
      (intent) => {
        workspaceIntents.push(intent);
      },
      scope,
      hierarchy.id,
      required(hierarchyIntents[0]),
    );
    expect(workspaceIntents).toEqual([
      {
        ...scope,
        hierarchyId: hierarchy.id,
        intent: hierarchyIntents[0],
        type: "workspaceRelationshipHierarchy",
      },
    ]);
  });

  it("keeps suggested item editing on the selected relationship occurrence path", () => {
    const hierarchy = hierarchyContract();
    const project = required(hierarchy.root.relationshipGroups[0]?.nodes[0]);
    const field = required(project.editor.fields[0]);
    project.editor = {
      ...project.editor,
      fields: [
        {
          ...field,
          options: { textSuggestions: ["Research", "Delivery"] },
        },
      ],
    };
    const intents: RelationshipHierarchyIntent[] = [];
    const renderer = render(
      <AstryxRelationshipHierarchyRenderer
        hierarchy={hierarchy}
        onIntent={(intent) => {
          intents.push(intent);
        }}
      />,
    );
    const projectEditor = renderer.getByRole("article", { name: "Runtime project" });
    const combobox = within(projectEditor).getByRole("combobox", { name: /^Name/ });

    fireEvent.change(combobox, { target: { value: "Delivery" } });

    expect(intents).toEqual([
      {
        hierarchyId: hierarchy.id,
        intent: {
          fieldId: field.fieldId,
          intent: {
            fieldName: "name",
            type: "recordEditorDraftChange",
            value: "Delivery",
          },
          recordId: project.recordId,
          resultId: project.editor.id,
          type: "recordResultFieldIntent",
        },
        occurrenceId: project.id,
        recordId: project.recordId,
        resultId: project.editor.id,
        type: "relationshipHierarchyRecordResult",
      },
    ]);
  });

  it("renders a host-published hierarchy through the subscribed selected-record workspace", () => {
    const fixture = required(
      selectedGeneratedWorkspaceFixture(
        createFormlessGeneratedWorkspaceFixtures(),
        "selected-record",
      ),
    );
    const section = required(fixture.workspace.sections[0]);
    const presentation = section.collection.presentation;
    if (presentation.kind !== "selectedRecord" || presentation.selectedRecordId === null) {
      throw new Error("Expected a selected-record fixture.");
    }
    const hierarchy = hierarchyContract(presentation.selectedRecordId);
    const workspace = {
      ...fixture.workspace,
      sections: [
        {
          ...section,
          collection: {
            ...section.collection,
            presentation: {
              ...presentation,
              sections: [
                ...presentation.sections,
                {
                  hierarchy,
                  id: "selected-record-section:hierarchy",
                  kind: "selectedRecordRelationshipHierarchySection" as const,
                  label: "Account hierarchy",
                },
              ],
            },
          },
        },
      ],
    };
    const fixtureHost = createFormlessGeneratedWorkspaceFixtureHost(workspace);
    const html = renderToStaticMarkup(
      <PresentationHostProvider host={fixtureHost.host}>
        <AstryxSubscribedWorkspaceScreenRenderer reference={fixtureHost.workspaceReference} />
      </PresentationHostProvider>,
    );

    expect(html).toContain(">Account hierarchy<");
    expect(html).toContain('aria-label="Account relationship hierarchy"');
    expect(html).toContain('aria-label="Runtime project"');
    expect(html).toContain("Archived projects");
  });
});

function hierarchyContract(rootRecordId = "account:formless"): RelationshipHierarchyContract {
  const task = hierarchyNode({
    entityTypeLabel: "Task",
    id: "occurrence:account/project/task",
    label: "Ship hierarchy task",
    recordId: "task:ship",
    value: "Ship hierarchy",
  });
  const tasks = {
    id: "relationship-group:account/project/tasks",
    kind: "relationshipHierarchyRelationshipGroup" as const,
    label: "Tasks",
    nodes: [task],
  };
  const create = createAction("occurrence:account/project:create-task", tasks.id);
  const project = hierarchyNode({
    actions: [
      linkAction({
        availability: "available",
        href: "https://example.test/projects/project:runtime",
        id: "occurrence:account/project:dashboard",
        label: "Open project dashboard",
        target: "sameTab",
      }),
      linkAction({
        availability: "available",
        href: "https://docs.example.test/projects/project:runtime",
        id: "occurrence:account/project:documentation",
        label: "Open project documentation",
        target: "newTab",
      }),
      linkAction({
        availability: "unavailable",
        id: "occurrence:account/project:issue",
        label: "Open project issue",
        target: "newTab",
      }),
      {
        control: operationControlFixtures.workspacePushSuccess.pending,
        kind: "operationAction",
      },
      {
        control: operationControlFixtures.deleteTask.pending,
        kind: "operationAction",
      },
      create,
    ],
    entityTypeLabel: "Project",
    id: "occurrence:account/project",
    label: "Runtime project",
    recordId: "project:runtime",
    relationshipGroups: [tasks],
    value: "Runtime",
  });

  return {
    accessibilityLabel: "Account relationship hierarchy",
    id: "hierarchy:account-projects",
    kind: "relationshipHierarchy",
    root: hierarchyNode({
      entityTypeLabel: "Account",
      id: "occurrence:account",
      label: "Formless account",
      recordId: rootRecordId,
      relationshipGroups: [
        {
          id: "relationship-group:account/projects",
          kind: "relationshipHierarchyRelationshipGroup",
          label: "Projects",
          nodes: [project],
        },
        {
          id: "relationship-group:account/archived-projects",
          kind: "relationshipHierarchyRelationshipGroup",
          label: "Archived projects",
          nodes: [],
        },
      ],
      value: "Formless",
    }),
  };
}

function hierarchyNode({
  actions = [],
  entityTypeLabel,
  id,
  label,
  recordId,
  relationshipGroups = [],
  value,
}: {
  actions?: RelationshipHierarchyNodeContract["headerActions"]["items"];
  entityTypeLabel: string;
  id: string;
  label: string;
  recordId: string;
  relationshipGroups?: RelationshipHierarchyNodeContract["relationshipGroups"];
  value: string;
}): RelationshipHierarchyNodeContract {
  return {
    accessibilityLabel: label,
    editor: recordResult(`${id}:editor`, recordId, label, value),
    entityTypeLabel,
    headerActions: {
      accessibilityLabel: `More ${entityTypeLabel.toLowerCase()} actions`,
      id: `${id}:header-actions`,
      items: actions,
      kind: "relationshipHierarchyActions",
    },
    id,
    kind: "relationshipHierarchyNode",
    recordId,
    relationshipGroups,
  };
}

function recordResult(
  id: string,
  recordId: string,
  accessibilityLabel: string,
  value: string,
): RecordResultContract {
  const field = recordField({
    commit: "field-commit",
    control: titleControl,
    drafts: recordDrafts({ recordValue: value }),
    editor: titleControl.editor,
    field: titleSchema,
    fieldName: "name",
    labelVisibility: "visible",
    occurrence: { ownerId: id, placementId: "name" },
    recordId,
    rendererKind: "text",
  });

  return {
    accessibilityLabel: `${accessibilityLabel} editor`,
    actions: {
      id: `${id}:actions`,
      kind: "actionGroup",
      primary: [
        {
          control: operationControlFixtures.workspacePushSuccess.initial,
          kind: "operationAction",
          role: "transition",
        },
      ],
      secondary: [],
      secondaryAccessibilityLabel: `More actions for ${accessibilityLabel}`,
    },
    availability: { state: "ready" },
    density: "compact",
    editing: { enabled: true },
    fields: [field],
    id,
    kind: "recordResult",
    selectedRecord: {
      accessibilityLabel,
      id: recordId,
      kind: "recordResultRecord",
    },
    warnings: [],
  };
}

function createAction(
  surfaceId: string,
  relationshipGroupId: string,
): RelationshipHierarchyCreateActionContract {
  return {
    kind: "createAction",
    relationshipGroupId,
    surface: createSurface(surfaceId),
  };
}

function linkAction(
  options:
    | {
        availability: "available";
        href: string;
        id: string;
        label: string;
        target: "newTab" | "sameTab";
      }
    | {
        availability: "unavailable";
        id: string;
        label: string;
        target: "newTab" | "sameTab";
      },
): RelationshipHierarchyLinkActionContract {
  const link = {
    accessibilityLabel: options.label,
    id: options.id,
    kind: "nativeLinkAction" as const,
    label: options.label,
    prominence: "secondary" as const,
    target: options.target,
  };
  return {
    kind: "linkAction",
    link:
      options.availability === "available"
        ? { ...link, availability: "available", href: options.href }
        : {
            ...link,
            availability: "unavailable",
            unavailableReason: "External issue key is unavailable.",
          },
  };
}

function createSurface(id: string): CreateSurfaceContract {
  const field = createField({
    control: titleControl,
    draftInput: { kind: "input", value: "Document hierarchy" },
    editor: titleControl.editor,
    field: titleSchema,
    fieldName: "name",
    labelVisibility: "visible",
    occurrence: { ownerId: id, placementId: "name" },
    recordId: id,
    value: "Document hierarchy",
  }) satisfies CreateFieldContract;

  return {
    dialog: {
      form: {
        cancel: button(`${id}:cancel`, "Cancel"),
        errors: [],
        fieldSet: {
          disabled: false,
          fields: [field],
          id: `${id}:fields`,
          kind: "fieldSet",
        },
        id: `${id}:form`,
        kind: "createForm",
        submit: button(`${id}:submit`, "Add task", "submit"),
      },
      id: `${id}:dialog`,
      kind: "createDialog",
      open: true,
      title: "Add task",
    },
    id,
    kind: "createSurface",
    trigger: button(`${id}:trigger`, "Add task"),
  };
}

function button(id: string, label: string, type: ButtonContract["type"] = "button") {
  return {
    accessibilityLabel: label,
    content: { kind: "label", label },
    density: "compact",
    id,
    kind: "button",
    prominence: "secondary",
    type,
  } satisfies ButtonContract;
}

function clickMenuItem(item: { onClick?: () => Promise<void> | void }) {
  void item.onClick?.();
}

function required<Value>(value: Value): NonNullable<Value> {
  if (value === undefined || value === null) {
    throw new Error("Expected value.");
  }
  return value as NonNullable<Value>;
}
