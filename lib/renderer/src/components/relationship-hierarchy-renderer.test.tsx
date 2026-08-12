// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { ToastViewport } from "@astryxdesign/core/Toast";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";
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
const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
let relationshipActionListWidth = 1_000;

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get(this: HTMLElement): number {
      if (this.classList.contains("astryx-overflow-list")) {
        return relationshipActionListWidth;
      }

      if (this.parentElement?.hasAttribute("inert")) {
        const control = this.querySelector<HTMLElement>("a, button");
        return control?.getAttribute("aria-label")?.startsWith("More ") ? 40 : 120;
      }

      return originalOffsetWidth?.get?.call(this) ?? 0;
    },
  });
});

afterAll(() => {
  if (originalOffsetWidth) {
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", originalOffsetWidth);
  }
});

afterEach(() => {
  relationshipActionListWidth = 1_000;
  cleanup();
  vi.restoreAllMocks();
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

  it("renders a root-only hierarchy with its fields and working header actions but no groups", () => {
    const hierarchy = hierarchyContract();
    hierarchy.root.relationshipGroups = [];
    hierarchy.root.headerActions.items = [
      linkAction({
        availability: "available",
        href: "https://example.test/accounts/account:formless",
        id: "occurrence:account:details",
        label: "Open account details",
        target: "sameTab",
      }),
      {
        control: operationControlFixtures.workspacePushSuccess.initial,
        kind: "operationAction",
      },
    ];
    const intents: RelationshipHierarchyIntent[] = [];
    const renderer = render(
      <AstryxRelationshipHierarchyRenderer
        hierarchy={hierarchy}
        onIntent={(intent) => {
          intents.push(intent);
        }}
      />,
    );
    const root = renderer.getByRole("region", { name: "Formless account" });
    const actions = relationshipActionList(root);
    const link = within(actions).getByRole("link", { name: "Open account details" });

    expect(within(root).getByDisplayValue("Formless")).toBeTruthy();
    expect(link.getAttribute("href")).toBe("https://example.test/accounts/account:formless");
    expect(renderer.queryByRole("heading", { name: "Projects" })).toBeNull();
    expect(renderer.queryByRole("region", { name: "Archived projects" })).toBeNull();

    fireEvent.click(within(actions).getByRole("button", { name: "Push workspace" }));
    expect(intents).toEqual([
      {
        controlId: operationControlFixtures.workspacePushSuccess.initial.id,
        hierarchyId: hierarchy.id,
        intent: operationControlFixtures.workspacePushSuccess.initial.trigger.intent,
        occurrenceId: hierarchy.root.id,
        recordId: hierarchy.root.recordId,
        type: "relationshipHierarchyOperation",
      },
    ]);
  });

  it("renders wide record-header actions in stable order with labelled controls and native links", () => {
    const hierarchy = hierarchyContract();
    const renderer = render(
      <AstryxRelationshipHierarchyRenderer hierarchy={hierarchy} onIntent={() => undefined} />,
    );
    const project = renderer.getByRole("region", { name: "Runtime project" });
    const actionList = relationshipActionList(project);
    const dashboard = within(actionList).getByRole("link", {
      name: "Open project dashboard",
    });
    const documentation = within(actionList).getByRole("link", {
      name: "Open project documentation",
    });
    const unavailable = within(actionList).getByRole("button", {
      name: "Open project issue",
    });

    expect(actionNames(actionList)).toEqual([
      "Open project dashboard",
      "Open project documentation",
      "Open project issue",
      "Push workspace",
      "Delete task",
      "Add task",
    ]);
    expect(dashboard.getAttribute("href")).toBe("https://example.test/projects/project:runtime");
    expect(dashboard.hasAttribute("target")).toBe(false);
    expect(documentation.getAttribute("target")).toBe("_blank");
    expect(documentation.getAttribute("rel")).toBe("noopener noreferrer");
    expect(unavailable.hasAttribute("href")).toBe(false);
    expect(unavailable.getAttribute("aria-disabled")).toBe("true");
    expect(
      (within(actionList).getByRole("button", { name: "Push workspace" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (within(actionList).getByRole("button", { name: "Delete task" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(within(actionList).queryByRole("button", { name: "More project actions" })).toBeNull();
  });

  it("collapses every narrow record-header action by source order and preserves invocation", () => {
    relationshipActionListWidth = 40;
    const hierarchy = hierarchyContract();
    const project = required(hierarchy.root.relationshipGroups[0]?.nodes[0]);
    project.headerActions.items = project.headerActions.items.map((action) =>
      action.kind === "operationAction" &&
      action.control.id === operationControlFixtures.workspacePushSuccess.initial.id
        ? { ...action, control: operationControlFixtures.workspacePushSuccess.initial }
        : action,
    );
    const intents: RelationshipHierarchyIntent[] = [];
    const renderer = render(
      <AstryxRelationshipHierarchyRenderer
        hierarchy={hierarchy}
        onIntent={(intent) => {
          intents.push(intent);
        }}
      />,
    );
    const projectRegion = renderer.getByRole("region", { name: "Runtime project" });
    const actionList = relationshipActionList(projectRegion);
    const more = within(actionList).getByRole("button", { name: "More project actions" });

    expect(actionNames(actionList)).toEqual(["More project actions"]);
    fireEvent.click(more);

    expect(screen.getAllByRole("menuitem").map((item) => item.textContent?.trim())).toEqual([
      "Open project dashboard",
      "Open project documentation",
      "Open project issue — External issue key is unavailable.",
      "Push workspace",
      "Deleting task",
      "Add task",
    ]);
    expect(
      screen
        .getByRole("menuitem", {
          name: "Open project issue — External issue key is unavailable.",
        })
        .getAttribute("aria-disabled"),
    ).toBe("true");
    expect(
      screen.getByRole("menuitem", { name: "Deleting task" }).getAttribute("aria-disabled"),
    ).toBe("true");

    fireEvent.click(screen.getByRole("menuitem", { name: "Push workspace" }));
    expect(intents).toEqual([
      {
        controlId: operationControlFixtures.workspacePushSuccess.initial.id,
        hierarchyId: hierarchy.id,
        intent: operationControlFixtures.workspacePushSuccess.initial.trigger.intent,
        occurrenceId: project.id,
        recordId: project.recordId,
        type: "relationshipHierarchyOperation",
      },
    ]);
  });

  it("keeps destructive confirmation and committed feedback on the record action path", async () => {
    const hierarchy = hierarchyContract();
    const project = required(hierarchy.root.relationshipGroups[0]?.nodes[0]);
    const confirmation = required(operationControlFixtures.deleteTask.settled.confirmation);
    const control = {
      ...operationControlFixtures.deleteTask.settled,
      confirmation: { ...confirmation, open: true },
    };
    project.headerActions.items = [{ control, kind: "operationAction" }];
    const intents: RelationshipHierarchyIntent[] = [];
    const renderer = render(
      <ToastViewport isTopLayer={false}>
        <AstryxRelationshipHierarchyRenderer
          hierarchy={hierarchy}
          onIntent={(intent) => {
            intents.push(intent);
          }}
        />
      </ToastViewport>,
    );
    const dialog = renderer.getByRole("alertdialog", { name: "Delete task?" });

    expect(
      (
        within(
          relationshipActionList(renderer.getByRole("region", { name: "Runtime project" })),
        ).getByRole("button", { name: "Delete task" }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete task" }));
    expect(intents).toEqual([
      {
        controlId: control.id,
        hierarchyId: hierarchy.id,
        intent: confirmation.action.intent,
        occurrenceId: project.id,
        recordId: project.recordId,
        type: "relationshipHierarchyOperation",
      },
    ]);
    expect((await renderer.findAllByText("Task deleted")).length).toBeGreaterThan(0);
  });

  it("renders ordered authored controls beside group headings and retains labelled empty groups", () => {
    const hierarchy = hierarchyContract("account:formless", false);
    const projects = required(hierarchy.root.relationshipGroups[0]);
    const archivedProjects = required(hierarchy.root.relationshipGroups[1]);
    projects.headerActions = relationshipGroupActions(projects.id, [
      createAction("occurrence:account:create-project", projects.id, {
        accessibilityLabel: "Add project",
        content: { icon: "add", kind: "iconAndLabel", label: "Add project" },
      }),
      operationAction(operationControlFixtures.workspacePushSuccess.initial, {
        accessibilityLabel: "Sync projects",
        content: { kind: "label", label: "Sync projects" },
      }),
      operationAction(operationControlFixtures.deleteTask.initial, {
        accessibilityLabel: "Archive projects",
        content: { icon: "archive", kind: "iconOnly" },
      }),
    ]);
    archivedProjects.headerActions = relationshipGroupActions(archivedProjects.id, [
      createAction("occurrence:account:create-archived-project", archivedProjects.id, {
        accessibilityLabel: "Add archived project",
        content: { icon: "add", kind: "iconOnly" },
      }),
    ]);
    const intents: RelationshipHierarchyIntent[] = [];

    const renderer = render(
      <AstryxRelationshipHierarchyRenderer
        hierarchy={hierarchy}
        onIntent={(intent) => {
          intents.push(intent);
        }}
      />,
    );
    const projectsRegion = renderer.getByRole("region", { name: "Projects" });
    const projectsHeading = within(projectsRegion).getByRole("heading", { name: "Projects" });
    const projectsActions = relationshipActionList(projectsRegion);
    const iconOnlyOperation = within(projectsActions).getByRole("button", {
      name: "Archive projects",
    });

    expect(projectsHeading.parentElement).toBe(projectsActions.parentElement);
    expect(actionNames(projectsActions)).toEqual([
      "Add project",
      "Sync projects",
      "Archive projects",
    ]);
    expect(iconOnlyOperation.textContent).not.toContain("Archive projects");
    expect(
      within(document.body)
        .getAllByRole("tooltip", { hidden: true })
        .some((tooltip) => tooltip.textContent === "Archive projects"),
    ).toBe(true);
    fireEvent.click(within(projectsActions).getByRole("button", { name: "Add project" }));
    expect(intents).toEqual([
      {
        hierarchyId: hierarchy.id,
        intent: {
          open: true,
          surfaceId: "occurrence:account:create-project",
          type: "createOpenChange",
        },
        occurrenceId: hierarchy.root.id,
        relationshipGroupId: projects.id,
        surfaceId: "occurrence:account:create-project",
        type: "relationshipHierarchyCreate",
      },
    ]);

    const archivedRegion = renderer.getByRole("region", { name: "Archived projects" });
    const archivedActions = relationshipActionList(archivedRegion);
    expect(within(archivedRegion).getByRole("heading", { name: "Archived projects" })).toBeTruthy();
    expect(actionNames(archivedActions)).toEqual(["Add archived project"]);
    expect(within(archivedRegion).queryByRole("article")).toBeNull();
  });

  it("collapses nested group actions in source order and dispatches against the immediate parent", () => {
    relationshipActionListWidth = 40;
    const hierarchy = hierarchyContract("account:formless", false);
    const project = required(hierarchy.root.relationshipGroups[0]?.nodes[0]);
    project.headerActions.items = [];
    const tasks = required(project.relationshipGroups[0]);
    const createBase = createAction("occurrence:account/project:create-task", tasks.id);
    const create = {
      ...createBase,
      surface: {
        ...createBase.surface,
        dialog: { ...createBase.surface.dialog, open: false },
      },
    };
    const operation = operationAction(operationControlFixtures.workspacePushSuccess.initial, {
      accessibilityLabel: "Refresh task group",
      content: { icon: "sync", kind: "iconAndLabel", label: "Refresh task group" },
    });
    tasks.headerActions = {
      ...relationshipGroupActions(tasks.id, [create, operation]),
      accessibilityLabel: "More task group actions",
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
    const tasksRegion = renderer.getByRole("region", { name: "Tasks" });
    const actionList = relationshipActionList(tasksRegion);
    const more = within(actionList).getByRole("button", { name: "More task group actions" });

    expect(actionNames(actionList)).toEqual(["More task group actions"]);
    fireEvent.click(more);
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent?.trim())).toEqual([
      "Add task",
      "Refresh task group",
    ]);

    fireEvent.click(screen.getByRole("menuitem", { name: "Refresh task group" }));

    expect(intents).toEqual([
      {
        controlId: operation.control.id,
        hierarchyId: hierarchy.id,
        intent: operation.control.trigger.intent,
        occurrenceId: project.id,
        recordId: project.recordId,
        relationshipGroupId: tasks.id,
        type: "relationshipHierarchyOperation",
      },
    ]);
  });

  it("keeps group create dialogs and operation effects on their owning nested group", async () => {
    const hierarchy = hierarchyContract("account:formless", false);
    const project = required(hierarchy.root.relationshipGroups[0]?.nodes[0]);
    project.headerActions.items = [];
    const tasks = required(project.relationshipGroups[0]);
    const create = createAction("occurrence:account/project:create-task", tasks.id);
    const confirmation = required(operationControlFixtures.deleteTask.settled.confirmation);
    const destructive = operationAction({
      ...operationControlFixtures.deleteTask.settled,
      confirmation: { ...confirmation, open: true },
    });
    const pending = operationAction(operationControlFixtures.workspacePushSuccess.pending);
    tasks.headerActions = relationshipGroupActions(tasks.id, [create, pending, destructive]);
    const createField = required(create.surface.dialog.form.fieldSet.fields[0]);
    const intents: RelationshipHierarchyIntent[] = [];
    const renderer = render(
      <ToastViewport isTopLayer={false}>
        <AstryxRelationshipHierarchyRenderer
          hierarchy={hierarchy}
          onIntent={(intent) => {
            intents.push(intent);
          }}
        />
      </ToastViewport>,
    );
    const tasksRegion = renderer.getByRole("region", { name: "Tasks" });
    const createDialog = renderer.getByRole("dialog", { name: "Add task" });
    const destructiveDialog = renderer.getByRole("alertdialog", { name: "Delete task?" });

    expect(
      tasksRegion.querySelector(
        '[data-operation-progress="workspace-source-push-success-progress"]',
      ),
    ).not.toBeNull();
    expect(tasksRegion.querySelector('[data-operation-status="pending"]')).not.toBeNull();
    fireEvent.change(within(createDialog).getByRole("textbox", { name: /^Name/ }), {
      target: { value: "Document nested actions" },
    });
    fireEvent.click(within(destructiveDialog).getByRole("button", { name: "Delete task" }));

    expect(intents).toEqual([
      {
        fieldId: createField.fieldId,
        hierarchyId: hierarchy.id,
        intent: {
          fieldName: createField.fieldName,
          fieldValue: { kind: "input", value: "Document nested actions" },
          type: "createDraftChange",
        },
        occurrenceId: project.id,
        relationshipGroupId: tasks.id,
        surfaceId: create.surface.id,
        type: "relationshipHierarchyCreateField",
      },
      {
        controlId: destructive.control.id,
        hierarchyId: hierarchy.id,
        intent: confirmation.action.intent,
        occurrenceId: project.id,
        recordId: project.recordId,
        relationshipGroupId: tasks.id,
        type: "relationshipHierarchyOperation",
      },
    ]);
    expect((await renderer.findAllByText("Task deleted")).length).toBeGreaterThan(0);
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
    const hierarchy = hierarchyContract(presentation.selectedRecordId, false);
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

function hierarchyContract(
  rootRecordId = "account:formless",
  includeNodeCreate = true,
): RelationshipHierarchyContract {
  const task = hierarchyNode({
    entityTypeLabel: "Task",
    id: "occurrence:account/project/task",
    label: "Ship hierarchy task",
    recordId: "task:ship",
    value: "Ship hierarchy",
  });
  const tasks = {
    accessibilityLabel: "Tasks",
    headerActions: relationshipGroupActions("relationship-group:account/project/tasks"),
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
      ...(includeNodeCreate ? [create] : []),
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
          accessibilityLabel: "Projects",
          headerActions: relationshipGroupActions("relationship-group:account/projects"),
          id: "relationship-group:account/projects",
          kind: "relationshipHierarchyRelationshipGroup",
          label: "Projects",
          nodes: [project],
        },
        {
          accessibilityLabel: "Archived projects",
          headerActions: relationshipGroupActions("relationship-group:account/archived-projects"),
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

function relationshipGroupActions(
  groupId: string,
  items: RelationshipHierarchyNodeContract["relationshipGroups"][number]["headerActions"]["items"] = [],
): RelationshipHierarchyNodeContract["relationshipGroups"][number]["headerActions"] {
  return {
    accessibilityLabel: `More ${groupId} actions`,
    id: `${groupId}:header-actions`,
    items,
    kind: "relationshipHierarchyActions",
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
  trigger?: {
    accessibilityLabel: string;
    content: ButtonContract["content"];
  },
): RelationshipHierarchyCreateActionContract {
  const surface = createSurface(surfaceId);
  return {
    kind: "createAction",
    relationshipGroupId,
    surface:
      trigger === undefined
        ? surface
        : {
            ...surface,
            trigger: {
              ...surface.trigger,
              accessibilityLabel: trigger.accessibilityLabel,
              content: trigger.content,
            },
          },
  };
}

function operationAction(
  control: RelationshipHierarchyOperationActionContract["control"],
  trigger?: {
    accessibilityLabel: string;
    content: ButtonContract["content"];
  },
): RelationshipHierarchyOperationActionContract {
  return {
    control:
      trigger === undefined
        ? control
        : {
            ...control,
            trigger: {
              ...control.trigger,
              accessibilityLabel: trigger.accessibilityLabel,
              content: trigger.content,
            },
          },
    kind: "operationAction",
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

function relationshipActionList(region: HTMLElement): HTMLElement {
  const actionList = region.querySelector<HTMLElement>(".astryx-overflow-list");
  if (!actionList) {
    throw new Error("Expected a relationship-hierarchy action list.");
  }
  return actionList;
}

function actionNames(actionList: HTMLElement): string[] {
  return Array.from(actionList.querySelectorAll<HTMLElement>("a, button")).map(
    (control) => control.getAttribute("aria-label") ?? control.textContent?.trim() ?? "",
  );
}
