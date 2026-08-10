import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type {
  ActionTriggerContract,
  CreateSurfaceContract,
  ListIntent,
  OperationControlContract,
  OperationPresentationIntent,
  RecordResultContract,
  RecordResultIntent,
  TableIntent,
  WorkspaceCollectionActionGroupContract,
  WorkspaceCollectionContract,
  WorkspaceContextContract,
  WorkspaceContract,
  WorkspaceIntent,
  WorkspaceIntentScope,
  WorkspaceQueryNavigationContract,
  WorkspaceResultContract,
} from "@dpeek/formless-presentation/contract";
import {
  AstryxWorkspaceCollectionRenderer,
  dispatchAstryxWorkspaceContextSelection,
  dispatchAstryxWorkspaceCreateIntent,
  dispatchAstryxWorkspaceFieldIntent,
  dispatchAstryxWorkspaceListIntent,
  dispatchAstryxWorkspaceOperationIntent,
  dispatchAstryxWorkspaceQuerySelection,
  dispatchAstryxWorkspaceRecordResultIntent,
  dispatchAstryxWorkspaceTableIntent,
} from "./workspace-collection-renderer.tsx";
import {
  AstryxWorkspaceScreenRenderer,
  dispatchAstryxWorkspaceExternalAction,
} from "./workspace-screen-renderer.tsx";

describe("Astryx workspace renderer", () => {
  it("renders ordered sections, controlled navigation, actions, summaries, and an ordinary list", () => {
    const taskScope = workspaceScope("workspace:tasks", "section:tasks", "collection:tasks");
    const companyScope = workspaceScope(
      "workspace:tasks",
      "section:companies",
      "collection:companies",
    );
    const workspace: WorkspaceContract = {
      accessibilityLabel: "Task workspace",
      actions: [
        {
          accessibilityLabel: "View site (opens in a new tab)",
          href: "/sites/site",
          id: "view-site",
          kind: "workspaceLinkAction",
          label: "View site",
          prominence: "primary",
          target: "newTab",
        },
      ],
      id: taskScope.screenId,
      kind: "workspace",
      label: "Tasks",
      sections: [
        {
          accessibilityLabel: "Task section",
          actions: [externalAction(taskScope, "install", "Install app")],
          collection: readyCollection({
            actions: collectionActions(taskScope),
            context: context(taskScope, "localTabs"),
            contextDetail: recordResult("result:project", "Acme project"),
            id: taskScope.collectionId,
            label: "Tasks",
            queryNavigation: queryNavigation(taskScope),
            result: listResult("result:tasks"),
            selectedQueryId: "query:active",
            summaries: [
              {
                availability: { available: true },
                displayValue: "8",
                id: "summary:estimate",
                kind: "workspaceSummary",
                label: "Estimate",
                suffix: "hours",
              },
              {
                availability: { available: false, message: "Hidden" },
                displayValue: "99",
                id: "summary:hidden",
                kind: "workspaceSummary",
                label: "Hidden summary",
              },
            ],
          }),
          headingVisibility: "hidden",
          id: taskScope.sectionId,
          kind: "workspaceSection",
          label: "Task section",
        },
        {
          accessibilityLabel: "Company section",
          actions: [],
          collection: readyCollection({
            id: companyScope.collectionId,
            label: "Companies",
            result: tableResult("result:companies"),
          }),
          headingVisibility: "visible",
          id: companyScope.sectionId,
          kind: "workspaceSection",
          label: "Companies",
        },
      ],
      width: "standard",
    };
    const html = renderWorkspace(workspace);

    expect(html).toContain(`data-formless-astryx-workspace="${workspace.id}"`);
    expect(html).toContain('data-formless-astryx-workspace-link-action="view-site"');
    expect(html).toContain('href="/sites/site"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain(`data-formless-astryx-workspace-section="${taskScope.sectionId}"`);
    expect(html).not.toContain("<h2>Task section</h2>");
    expect(html).toMatch(/<h2[^>]*>Companies<\/h2>/);
    expect(html.indexOf("Task section")).toBeLessThan(html.indexOf("Company section"));
    expect(html).toContain("Install app");
    expect(html).toContain("Create task");
    expect(html).toContain("Refresh tasks");
    expect(html).toContain('aria-label="Task queries"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("Active");
    expect(html).toContain("Completed");
    expect(html).toContain('aria-label="Project contexts"');
    expect(html).toContain("Acme");
    expect(html).toContain("Beta");
    expect(html).toContain('aria-label="Active count"');
    expect(html).toContain('aria-label="Acme count"');
    expect(html).toContain("Acme project");
    expect(html).toContain('aria-label="Collection summary"');
    expect(html).toContain("Estimate");
    expect(html).toContain("hours");
    expect(html).not.toContain("Hidden summary");
    expect(html).toContain("No matching tasks");
    expect(html).toContain("No companies");
    expect(html.indexOf("No matching tasks")).toBeLessThan(html.indexOf("No companies"));
  });

  it("renders list-detail hierarchy with a selectable context list, record, table, and actions", () => {
    const scope = workspaceScope("workspace:site", "section:posts", "collection:comments");
    const selector = context(scope, "localListDetail");
    const workspace: WorkspaceContract = {
      accessibilityLabel: "Site workspace",
      actions: [],
      id: scope.screenId,
      kind: "workspace",
      label: "Site",
      sections: [
        {
          accessibilityLabel: "Posts and comments",
          actions: [],
          collection: {
            accessibilityLabel: "Comments",
            availability: { state: "ready" },
            id: scope.collectionId,
            kind: "workspaceCollection",
            label: "Comments",
            presentation: {
              accessibilityLabel: "Post comments",
              actions: collectionActions(scope),
              contextDetail: recordResult("result:post-detail", "Launch post"),
              id: "layout:post-comments",
              kind: "listDetail",
              queryNavigation: queryNavigation(scope),
              result: tableResult("result:comments"),
              selector,
              summaries: [
                {
                  availability: { available: true },
                  displayValue: "4",
                  id: "summary:comments",
                  kind: "workspaceSummary",
                  label: "Comments",
                },
              ],
            },
            selectedQueryId: "query:active",
          },
          headingVisibility: "hidden",
          id: scope.sectionId,
          kind: "workspaceSection",
          label: "Posts",
        },
      ],
      width: "standard",
    };
    const html = renderWorkspace(workspace);

    expect(html).toContain('aria-label="Post comments"');
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Project contexts"');
    expect(html).toContain('role="list"');
    expect(html).not.toContain('role="combobox"');
    expect(html).toContain("Projects");
    expect(html).toContain("Acme");
    expect(html).toContain("Launch post");
    expect(html).toContain("No comments");
    expect(html).toContain("Create project");
    expect(html).toContain("Create task");
    expect(html).toContain("Refresh tasks");
    expect(html.indexOf("Launch post")).toBeLessThan(html.indexOf("No comments"));
  });

  it("renders singleton and external context records plus explicit empty and unavailable states", () => {
    const scope = workspaceScope("workspace:site", "section:settings", "collection:settings");
    const singletonHtml = renderWorkspace(
      oneSectionWorkspace(
        scope,
        readyCollection({
          context: context(scope, "singletonDetail"),
          contextDetail: recordResult("result:settings-detail", "Site settings"),
          id: scope.collectionId,
          label: "Settings",
          result: recordResult("result:settings", "Settings record"),
        }),
      ),
    );
    const externalHtml = renderWorkspace(
      oneSectionWorkspace(
        scope,
        readyCollection({
          context: context(scope, "externalNavigation"),
          contextDetail: recordResult("result:external-detail", "Externally selected page"),
          id: scope.collectionId,
          label: "Settings",
          result: recordResult("result:external", "External record"),
        }),
      ),
    );
    const emptyHtml = renderCollection(emptyCollection(scope), scope);
    const unavailableHtml = renderCollection(unavailableCollection(scope), scope);
    const emptyContextHtml = renderWorkspace(
      oneSectionWorkspace(
        scope,
        readyCollection({
          context: emptyContext(),
          id: scope.collectionId,
          label: "Settings",
          result: recordResult("result:empty-context"),
        }),
      ),
    );

    expect(singletonHtml).toContain("Site settings");
    expect(singletonHtml).toContain("Settings record");
    expect(externalHtml).toContain("Externally selected page");
    expect(externalHtml).toContain("External record");
    expect(externalHtml).not.toContain('aria-label="Project contexts"');
    expect(emptyHtml).toContain('data-formless-astryx-workspace-empty-state="empty:settings"');
    expect(emptyHtml).toContain("Nothing here yet");
    expect(unavailableHtml).toContain(
      `data-formless-astryx-workspace-unavailable="${scope.collectionId}"`,
    );
    expect(unavailableHtml).toContain("Settings are unavailable");
    expect(emptyContextHtml).toContain(
      'data-formless-astryx-workspace-context-empty="empty:projects"',
    );
    expect(emptyContextHtml).toContain("No projects");
  });

  it("renders the projected primary command through workspace and every result empty state", () => {
    const scope = workspaceScope("workspace:site", "section:sites", "collection:sites");
    const action = emptyPrimaryAction("control:create-starter", "Create starter");
    const results: WorkspaceResultContract[] = [
      {
        ...listResult("result:list"),
        emptyState: { ...listResult("result:list").emptyState!, action },
      },
      {
        ...tableResult("result:table"),
        emptyState: { ...tableResult("result:table").emptyState!, action },
      },
      {
        ...recordResult("result:record"),
        emptyState: { ...recordResult("result:record").emptyState!, action },
      },
      {
        accessibilityLabel: "Site tree",
        availability: {
          emptyState: {
            action,
            id: "result:tree:empty",
            kind: "treeEmptyState",
            title: "No placements",
          },
          state: "empty",
        },
        density: "default",
        editing: { enabled: true },
        feedback: [],
        id: "result:tree",
        items: [],
        kind: "treeResult",
        root: {
          accessibilityLabel: "Site root",
          id: "result:tree:root",
          kind: "treeRoot",
          label: "Site",
        },
        warnings: [],
      },
    ];

    for (const result of results) {
      expect(
        renderCollection(
          readyCollection({ id: scope.collectionId, label: "Sites", result }),
          scope,
        ),
      ).toContain("Create starter");
    }

    const workspaceEmpty = emptyCollection(scope);
    if (workspaceEmpty.availability.state !== "empty") {
      throw new Error("Expected empty workspace collection.");
    }
    workspaceEmpty.availability.emptyState.action = action;
    expect(renderCollection(workspaceEmpty, scope)).toContain("Create starter");
  });

  it("wraps controlled and nested intents with complete workspace identity", () => {
    const scope = workspaceScope("workspace:tasks", "section:tasks", "collection:tasks");
    const calls: WorkspaceIntent[] = [];
    const handler = (intent: WorkspaceIntent) => {
      calls.push(intent);
    };
    const queries = queryNavigation(scope);
    const contexts = context(scope, "localTabs");
    const external = externalAction(scope, "install", "Install app");
    const create = createSurface("surface:create-task");
    const operationIntent = {
      controlId: "control:refresh",
      invocationSource: "button",
      type: "operationInvoke",
    } satisfies OperationPresentationIntent;
    const listIntent = {
      actionId: "move-down",
      direction: "down",
      itemId: "task:1",
      listId: "result:tasks",
      type: "listReorder",
    } satisfies ListIntent;
    const tableIntent = {
      actionId: "move-up",
      direction: "up",
      rowId: "task:1",
      tableId: "result:table",
      type: "tableReorder",
    } satisfies TableIntent;
    const recordIntent = {
      controlId: "control:archive",
      intent: operationIntent,
      recordId: "task:1",
      resultId: "result:record",
      type: "recordResultOperationIntent",
    } satisfies RecordResultIntent;

    void dispatchAstryxWorkspaceExternalAction(handler, scope, external);
    void dispatchAstryxWorkspaceQuerySelection(handler, queries.items[0]!);
    void dispatchAstryxWorkspaceQuerySelection(handler, queries.items[1]!);
    void dispatchAstryxWorkspaceContextSelection(handler, contexts.options[0]!);
    void dispatchAstryxWorkspaceContextSelection(handler, contexts.options[1]!);
    void dispatchAstryxWorkspaceCreateIntent(
      handler,
      scope,
      create.id,
      { open: true, surfaceId: create.id, type: "createOpenChange" },
      contexts.id,
    );
    void dispatchAstryxWorkspaceFieldIntent(
      handler,
      scope,
      "field:title",
      { fieldName: "title", type: "recordEditorDraftChange", value: "Ship" },
      { recordId: "task:1", resultId: "result:tasks" },
    );
    void dispatchAstryxWorkspaceOperationIntent(
      handler,
      scope,
      "control:refresh",
      operationIntent,
      { resultId: "result:tasks" },
    );
    void dispatchAstryxWorkspaceListIntent(handler, scope, "result:tasks", listIntent);
    void dispatchAstryxWorkspaceTableIntent(handler, scope, "result:table", tableIntent);
    void dispatchAstryxWorkspaceRecordResultIntent(
      handler,
      scope,
      "result:record",
      recordIntent,
      contexts.id,
    );

    expect(calls).toEqual([
      {
        ...scope,
        actionId: external.id,
        controlId: external.action.id,
        intent: external.action.invoke,
        type: "workspaceExternalAction",
      },
      queries.items[0]!.selectionIntent,
      contexts.options[0]!.selectionIntent,
      {
        ...scope,
        contextId: contexts.id,
        intent: { open: true, surfaceId: create.id, type: "createOpenChange" },
        surfaceId: create.id,
        type: "workspaceCreate",
      },
      {
        ...scope,
        fieldId: "field:title",
        intent: { fieldName: "title", type: "recordEditorDraftChange", value: "Ship" },
        recordId: "task:1",
        resultId: "result:tasks",
        type: "workspaceField",
      },
      {
        ...scope,
        controlId: "control:refresh",
        intent: operationIntent,
        resultId: "result:tasks",
        type: "workspaceOperation",
      },
      { ...scope, intent: listIntent, resultId: "result:tasks", type: "workspaceList" },
      { ...scope, intent: tableIntent, resultId: "result:table", type: "workspaceTable" },
      {
        ...scope,
        contextId: contexts.id,
        intent: recordIntent,
        resultId: "result:record",
        type: "workspaceRecordResult",
      },
    ]);
  });
});

function renderWorkspace(workspace: WorkspaceContract) {
  return renderToStaticMarkup(
    <AstryxWorkspaceScreenRenderer onIntent={() => undefined} workspace={workspace} />,
  );
}

function renderCollection(collection: WorkspaceCollectionContract, scope: WorkspaceIntentScope) {
  return renderToStaticMarkup(
    <AstryxWorkspaceCollectionRenderer
      collection={collection}
      onIntent={() => undefined}
      scope={scope}
    />,
  );
}

function workspaceScope(
  screenId: string,
  sectionId: string,
  collectionId: string,
): WorkspaceIntentScope {
  return { collectionId, screenId, sectionId };
}

function oneSectionWorkspace(
  scope: WorkspaceIntentScope,
  collection: WorkspaceCollectionContract,
): WorkspaceContract {
  return {
    accessibilityLabel: "Workspace",
    actions: [],
    id: scope.screenId,
    kind: "workspace",
    label: "Workspace",
    sections: [
      {
        accessibilityLabel: "Workspace section",
        actions: [],
        collection,
        headingVisibility: "hidden",
        id: scope.sectionId,
        kind: "workspaceSection",
        label: "Workspace section",
      },
    ],
    width: "standard",
  };
}

function readyCollection({
  actions = emptyCollectionActions(),
  context,
  contextDetail,
  id,
  label,
  queryNavigation,
  result,
  selectedQueryId = null,
  summaries = [],
}: {
  actions?: WorkspaceCollectionActionGroupContract;
  context?: WorkspaceContextContract;
  contextDetail?: RecordResultContract;
  id: string;
  label: string;
  queryNavigation?: WorkspaceQueryNavigationContract;
  result: WorkspaceResultContract;
  selectedQueryId?: string | null;
  summaries?: WorkspaceCollectionContract["presentation"]["summaries"];
}): WorkspaceCollectionContract {
  return {
    accessibilityLabel: label,
    availability: { state: "ready" },
    id,
    kind: "workspaceCollection",
    label,
    presentation: {
      actions,
      ...(context === undefined ? {} : { context }),
      ...(contextDetail === undefined ? {} : { contextDetail }),
      kind: "ordinary",
      ...(queryNavigation === undefined ? {} : { queryNavigation }),
      result,
      summaries,
    },
    selectedQueryId,
  };
}

function emptyCollection(scope: WorkspaceIntentScope): WorkspaceCollectionContract {
  return {
    ...readyCollection({
      id: scope.collectionId,
      label: "Settings",
      result: recordResult("result:settings"),
    }),
    availability: {
      emptyState: {
        description: "Create the first item.",
        id: "empty:settings",
        kind: "workspaceEmptyState",
        title: "Nothing here yet",
      },
      state: "empty",
    },
  };
}

function unavailableCollection(scope: WorkspaceIntentScope): WorkspaceCollectionContract {
  return {
    ...readyCollection({
      id: scope.collectionId,
      label: "Settings",
      result: recordResult("result:settings"),
    }),
    availability: { message: "Settings are unavailable", state: "unavailable" },
  };
}

function context<P extends WorkspaceContextContract["presentation"]>(
  scope: WorkspaceIntentScope,
  presentation: P,
): WorkspaceContextContract & {
  presentation: P;
} {
  const contextId = "context:project";
  return {
    accessibilityLabel: "Project contexts",
    availability: { state: "ready" },
    createAction: { kind: "createAction", surface: createSurface("surface:create-project") },
    id: contextId,
    kind: "workspaceContext",
    label: "Projects",
    options: [
      {
        availability: { available: true },
        countText: "3",
        id: "context-option:acme",
        kind: "workspaceContextOption",
        label: "Acme",
        selected: true,
        selectionIntent: {
          ...scope,
          contextId,
          contextOptionId: "context-option:acme",
          type: "workspaceContextSelection",
        },
      },
      {
        availability: { available: false, message: "Beta is archived" },
        id: "context-option:beta",
        kind: "workspaceContextOption",
        label: "Beta",
        selected: false,
        selectionIntent: {
          ...scope,
          contextId,
          contextOptionId: "context-option:beta",
          type: "workspaceContextSelection",
        },
      },
    ],
    presentation,
    selectedOptionId: "context-option:acme",
  };
}

function emptyContext(): WorkspaceContextContract {
  return {
    accessibilityLabel: "Project contexts",
    availability: {
      emptyState: {
        id: "empty:projects",
        kind: "workspaceEmptyState",
        title: "No projects",
      },
      state: "empty",
    },
    id: "context:project",
    kind: "workspaceContext",
    label: "Projects",
    options: [],
    presentation: "localTabs",
  };
}

function queryNavigation(scope: WorkspaceIntentScope): WorkspaceQueryNavigationContract {
  return {
    accessibilityLabel: "Task queries",
    id: "queries:tasks",
    items: [
      {
        availability: { available: true },
        countText: "3",
        id: "query:active",
        kind: "workspaceQuery",
        label: "Active",
        selected: true,
        selectionIntent: { ...scope, queryId: "query:active", type: "workspaceQuerySelection" },
      },
      {
        availability: { available: false, message: "Completed is unavailable" },
        id: "query:completed",
        kind: "workspaceQuery",
        label: "Completed",
        selected: false,
        selectionIntent: {
          ...scope,
          queryId: "query:completed",
          type: "workspaceQuerySelection",
        },
      },
    ],
    kind: "workspaceQueryNavigation",
  };
}

function collectionActions(scope: WorkspaceIntentScope): WorkspaceCollectionActionGroupContract {
  return {
    id: "actions:tasks",
    kind: "workspaceCollectionActions",
    primary: [{ kind: "createAction", surface: createSurface("surface:create-task") }],
    secondary: [
      { control: operationControl("control:refresh", "Refresh tasks"), kind: "operationAction" },
    ],
    secondaryAccessibilityLabel: `Actions for ${scope.collectionId}`,
  };
}

function emptyCollectionActions(): WorkspaceCollectionActionGroupContract {
  return {
    id: "actions:none",
    kind: "workspaceCollectionActions",
    primary: [],
    secondary: [],
    secondaryAccessibilityLabel: "Collection actions",
  };
}

function listResult(id: string): Extract<WorkspaceResultContract, { kind: "list" }> {
  return {
    accessibilityLabel: "Tasks",
    density: "compact",
    editing: { enabled: true },
    emptyState: {
      description: "Change the selected query.",
      id: `${id}:empty`,
      kind: "listEmptyState",
      title: "No matching tasks",
    },
    id,
    items: [],
    kind: "list",
  };
}

function tableResult(id: string): Extract<WorkspaceResultContract, { kind: "table" }> {
  return {
    accessibilityLabel: "Companies",
    columns: [
      {
        accessibilityLabel: "Company",
        alignment: "start",
        contentRole: "field",
        id: "company",
        isRowHeader: true,
        kind: "tableColumn",
        label: "Company",
        labelVisibility: "visible",
        width: "auto",
      },
    ],
    density: "compact",
    editing: { enabled: true },
    emptyState: {
      description: "Create the first record.",
      id: `${id}:empty`,
      kind: "tableEmptyState",
      title: id.includes("comments") ? "No comments" : "No companies",
    },
    id,
    kind: "table",
    rows: [],
  };
}

function recordResult(id: string, recordLabel?: string): RecordResultContract {
  return {
    accessibilityLabel: "Record",
    actions: {
      id: `${id}:actions`,
      kind: "actionGroup",
      primary: [],
      secondary: [],
      secondaryAccessibilityLabel: "Record actions",
    },
    availability: recordLabel ? { state: "ready" } : { state: "empty" },
    density: "compact",
    editing: { enabled: true },
    ...(recordLabel
      ? {}
      : {
          emptyState: {
            id: `${id}:empty`,
            kind: "recordResultEmptyState" as const,
            title: "No record",
          },
        }),
    fields: [],
    id,
    kind: "recordResult",
    ...(recordLabel
      ? {
          selectedRecord: {
            accessibilityLabel: recordLabel,
            id: `${id}:record`,
            kind: "recordResultRecord" as const,
          },
        }
      : {}),
    warnings: [],
  };
}

function externalAction(
  scope: WorkspaceIntentScope,
  id: string,
  label: string,
): WorkspaceContract["sections"][number]["actions"][number] {
  const controlId = `control:${id}`;
  const action: ActionTriggerContract = {
    accessibilityLabel: label,
    icon: "add",
    id: controlId,
    intent: "primary",
    invocationSource: "button",
    invoke: { controlId, invocationSource: "button" },
    kind: "actionTrigger",
    label,
  };

  void scope;
  return { action, id, kind: "workspaceExternalAction" };
}

function createSurface(id: string): CreateSurfaceContract {
  return {
    dialog: {
      form: {
        cancel: button(`${id}:cancel`, "Cancel"),
        errors: [],
        fieldSet: { disabled: false, fields: [], id: `${id}:fields`, kind: "fieldSet" },
        id: `${id}:form`,
        kind: "createForm",
        submit: button(`${id}:submit`, "Create", "submit"),
      },
      id: `${id}:dialog`,
      kind: "createDialog",
      open: false,
      title: id.includes("project") ? "Create project" : "Create task",
    },
    id,
    kind: "createSurface",
    trigger: button(`${id}:trigger`, id.includes("project") ? "Create project" : "Create task"),
  };
}

function operationControl(id: string, label: string): OperationControlContract {
  return {
    id,
    kind: "operationControl",
    status: {
      accessibilityLabel: "Ready",
      detail: "Ready",
      id: `${id}:status`,
      intent: "neutral",
      kind: "compactStatus",
      label: "Ready",
      status: "idle",
    },
    trigger: {
      ...button(`${id}:trigger`, label),
      intent: { controlId: id, invocationSource: "button", type: "operationInvoke" },
    },
  };
}

function emptyPrimaryAction(id: string, label: string) {
  return {
    control: operationControl(id, label),
    kind: "operationAction" as const,
    role: "command" as const,
  };
}

function button(id: string, label: string, type: "button" | "submit" = "button") {
  return {
    accessibilityLabel: label,
    content: { kind: "label" as const, label },
    density: "compact" as const,
    id,
    kind: "button" as const,
    prominence: "secondary" as const,
    type,
  };
}
