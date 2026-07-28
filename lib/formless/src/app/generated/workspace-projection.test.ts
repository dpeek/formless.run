import { describe, expect, it } from "vite-plus/test";
import type {
  ActionTriggerContract,
  CreateSurfaceContract,
  OperationControlContract,
  RecordResultContract,
  WorkspaceCollectionActionContract,
  WorkspaceResultContract,
} from "@dpeek/formless-presentation/contract";
import {
  generatedWorkspaceCollectionId,
  generatedWorkspaceScopedId,
  generatedWorkspaceScreenId,
  generatedWorkspaceSectionId,
  projectGeneratedWorkspaceContext,
  projectGeneratedWorkspaceCreateIntent,
  projectGeneratedWorkspaceExternalActionIntent,
  projectGeneratedWorkspaceFieldIntent,
  projectGeneratedWorkspaceContract,
  projectGeneratedWorkspaceListIntent,
  projectGeneratedWorkspaceOperationIntent,
  projectGeneratedWorkspaceRecordResultIntent,
  projectGeneratedWorkspaceTableIntent,
  type GeneratedWorkspaceCollectionProjectionFacts,
  type GeneratedWorkspaceIdentityScope,
} from "./workspace-projection.ts";

describe("generated Formless UI workspace projection", () => {
  it("projects a single-section unscoped collection without repeating its heading", () => {
    const scope = workspaceScope("tasks", "tasks", "taskHome");
    const workspace = projectGeneratedWorkspaceContract({
      id: "tasks",
      label: "Tasks",
      width: "standard",
      sections: [
        {
          actions: [{ action: externalAction(scope, "import"), id: "import" }],
          collection: {
            actions: [
              { action: createAction(scope, "task"), placement: "primary" },
              { action: operationAction(scope, "clear-completed"), placement: "secondary" },
            ],
            id: "taskHome",
            label: "Tasks",
            queries: [{ count: 3, id: "active", label: "Active" }],
            result: listResult(scope, "tasks"),
            selectedQueryId: "active",
            summaries: [{ displayValue: "8", id: "estimate", label: "Estimate", suffix: "hours" }],
          },
          id: "tasks",
          label: "Tasks",
        },
      ],
    });
    const section = requiredSection(workspace.sections[0]);
    const presentation = section.collection.presentation;

    expect(workspace).toMatchObject({
      accessibilityLabel: "Tasks",
      actions: [],
      id: "workspace:tasks",
      kind: "workspace",
      sections: [
        {
          actions: [{ action: { kind: "actionTrigger" }, kind: "workspaceExternalAction" }],
          headingVisibility: "hidden",
          kind: "workspaceSection",
        },
      ],
    });
    expect(section.collection).toMatchObject({
      accessibilityLabel: "Tasks",
      availability: { state: "ready" },
      id: scope.collectionId,
      kind: "workspaceCollection",
      selectedQueryId: generatedWorkspaceScopedId(scope, "query", "active"),
    });
    expect(presentation).toMatchObject({
      actions: {
        primary: [{ kind: "createAction" }],
        secondary: [{ kind: "operationAction" }],
      },
      kind: "ordinary",
      result: { kind: "list" },
      summaries: [
        {
          availability: { available: true },
          displayValue: "8",
          kind: "workspaceSummary",
          suffix: "hours",
        },
      ],
    });
    expect("queryNavigation" in presentation).toBe(false);
    expect("context" in presentation).toBe(false);
  });

  it("preserves multi-section order and scopes repeated view and result identities", () => {
    const peopleScope = workspaceScope("crm", "people", "sharedView");
    const companyScope = workspaceScope("crm", "companies", "sharedView");
    const workspace = projectGeneratedWorkspaceContract({
      id: "crm",
      label: "CRM",
      width: "wide",
      sections: [
        {
          collection: collectionFacts({
            id: "sharedView",
            label: "People",
            result: tableResult(peopleScope, "sharedResult"),
          }),
          id: "people",
          label: "People",
        },
        {
          collection: collectionFacts({
            id: "sharedView",
            label: "Companies",
            result: recordResult(companyScope, "sharedResult"),
          }),
          id: "companies",
          label: "Companies",
        },
      ],
    });
    const [people, companies] = workspace.sections;

    expect(workspace.sections.map((section) => section.label)).toEqual(["People", "Companies"]);
    expect(workspace.sections.map((section) => section.headingVisibility)).toEqual([
      "visible",
      "visible",
    ]);
    expect(people?.collection.id).toBe(peopleScope.collectionId);
    expect(companies?.collection.id).toBe(companyScope.collectionId);
    expect(people?.collection.id).not.toBe(companies?.collection.id);
    expect(people?.collection.presentation.result.id).toBe(
      generatedWorkspaceScopedId(peopleScope, "result", "sharedResult"),
    );
    expect(companies?.collection.presentation.result.id).toBe(
      generatedWorkspaceScopedId(companyScope, "result", "sharedResult"),
    );
    expect(people?.collection.presentation.result.kind).toBe("table");
    expect(companies?.collection.presentation.result.kind).toBe("recordResult");
  });

  it("projects query navigation, local, singleton, external, and empty context facts", () => {
    const scope = workspaceScope("site", "pages", "pageBlocks");
    const contextDetail = recordResult(scope, "page-detail", "page-2");
    const workspace = projectGeneratedWorkspaceContract({
      id: "site",
      label: "Site",
      width: "wide",
      sections: [
        {
          collection: {
            context: {
              detail: contextDetail,
              id: "page",
              label: "Pages",
              options: [
                { count: 2, id: "page-1", label: "Home" },
                {
                  availability: { available: false, message: "Page is archived." },
                  count: 5,
                  id: "page-2",
                  label: "About",
                },
              ],
              presentation: "localTabs",
              selectedOptionId: "page-2",
            },
            id: "pageBlocks",
            label: "Blocks",
            queries: [
              { count: 7, id: "all", label: "All" },
              { count: 2, id: "published", label: "Published" },
            ],
            result: listResult(scope, "blocks"),
            selectedQueryId: "published",
          },
          id: "pages",
          label: "Pages",
        },
      ],
    });
    const presentation = requiredSection(workspace.sections[0]).collection.presentation;

    expect(presentation).toMatchObject({
      context: {
        availability: { state: "ready" },
        options: [
          { countText: "2", label: "Home", selected: false },
          {
            availability: { available: false, message: "Page is archived." },
            countText: "5",
            label: "About",
            selected: true,
          },
        ],
        presentation: "localTabs",
      },
      contextDetail: { id: contextDetail.id, kind: "recordResult" },
      queryNavigation: {
        items: [
          { countText: "7", label: "All", selected: false },
          { countText: "2", label: "Published", selected: true },
        ],
        kind: "workspaceQueryNavigation",
      },
    });
    const localContext = presentation.kind === "ordinary" ? presentation.context : undefined;
    const selectedOption = localContext?.options[1];
    expect(selectedOption?.selectionIntent).toEqual({
      ...scope,
      contextId: localContext?.id,
      contextOptionId: selectedOption?.id,
      type: "workspaceContextSelection",
    });
    const selectedQuery = presentation.queryNavigation?.items[1];
    expect(selectedQuery?.selectionIntent).toEqual({
      ...scope,
      queryId: selectedQuery?.id,
      type: "workspaceQuerySelection",
    });

    const singleton = projectGeneratedWorkspaceContext({
      context: {
        id: "settings",
        label: "Settings",
        options: [{ id: "site", label: "Site settings" }],
        presentation: "singletonDetail",
        selectedOptionId: "site",
      },
      scope,
    });
    const external = projectGeneratedWorkspaceContext({
      context: {
        id: "page",
        label: "Pages",
        options: [{ id: "page-1", label: "Home" }],
        presentation: "externalNavigation",
        selectedOptionId: "page-1",
      },
      scope,
    });
    const empty = projectGeneratedWorkspaceContext({
      context: {
        id: "audience",
        label: "Audiences",
        options: [],
        presentation: "localTabs",
      },
      scope,
    });

    expect(singleton).toMatchObject({ presentation: "singletonDetail" });
    expect(singleton.selectedOptionId).toContain(":contextOption:settings:site");
    expect(external).toMatchObject({ presentation: "externalNavigation" });
    expect(empty).toMatchObject({
      availability: {
        emptyState: { title: "No audiences records yet." },
        state: "empty",
      },
      options: [],
      presentation: "localTabs",
    });
    expect(empty.selectedOptionId).toBeUndefined();
  });

  it("projects list-detail composition and explicit unavailable collection presentation", () => {
    const scope = workspaceScope("site", "posts", "postComments");
    const listDetail = projectGeneratedWorkspaceContract({
      id: "site",
      label: "Site",
      width: "narrow",
      sections: [
        {
          collection: {
            actions: [{ action: createAction(scope, "comment"), placement: "primary" }],
            context: {
              createAction: createAction(scope, "post"),
              detail: recordResult(scope, "post-detail", "post-1"),
              id: "post",
              label: "Posts",
              options: [{ count: 4, id: "post-1", label: "Launch" }],
              presentation: "localListDetail",
              selectedOptionId: "post-1",
            },
            id: "postComments",
            label: "Comments",
            layout: "listDetail",
            queries: [
              { id: "all", label: "All" },
              { id: "unread", label: "Unread" },
            ],
            result: tableResult(scope, "comments"),
            selectedQueryId: "all",
            summaries: [{ displayValue: "4", id: "total", label: "Comments" }],
          },
          id: "posts",
          label: "Posts",
        },
      ],
    });
    const presentation = requiredSection(listDetail.sections[0]).collection.presentation;

    expect(presentation).toMatchObject({
      actions: { primary: [{ kind: "createAction" }] },
      contextDetail: { kind: "recordResult" },
      kind: "listDetail",
      queryNavigation: { kind: "workspaceQueryNavigation" },
      result: { kind: "table" },
      selector: {
        createAction: { kind: "createAction" },
        presentation: "localListDetail",
      },
      summaries: [{ displayValue: "4", label: "Comments" }],
    });

    const unavailableScope = workspaceScope("site", "broken", "missingQueries");
    const unavailable = projectGeneratedWorkspaceContract({
      id: "site",
      label: "Site",
      width: "standard",
      sections: [
        {
          collection: {
            availability: { message: "No queries are defined for Blocks.", state: "unavailable" },
            id: "missingQueries",
            label: "Blocks",
            queries: [],
            result: recordResult(unavailableScope, "unavailable"),
          },
          id: "broken",
          label: "Broken",
        },
      ],
    });
    const unavailableCollection = requiredSection(unavailable.sections[0]).collection;

    expect(unavailableCollection).toMatchObject({
      availability: { message: "No queries are defined for Blocks.", state: "unavailable" },
      selectedQueryId: null,
    });
    expect(unavailableCollection.presentation.result.kind).toBe("recordResult");
  });

  it("wraps canonical nested intents with complete workspace routing identity", () => {
    const scope = workspaceScope("tasks", "tasks", "taskHome");
    const resultId = generatedWorkspaceScopedId(scope, "result", "active");
    const contextId = generatedWorkspaceScopedId(scope, "context", "project");
    const surfaceId = generatedWorkspaceScopedId(scope, "surface", "create-task");
    const controlId = generatedWorkspaceScopedId(scope, "control", "clear-completed");
    const fieldId = generatedWorkspaceScopedId(scope, "field", "task-1:title");

    expect(
      projectGeneratedWorkspaceExternalActionIntent(scope, "install", {
        controlId,
        invocationSource: "button",
      }),
    ).toEqual({
      ...scope,
      actionId: "install",
      controlId,
      intent: { controlId, invocationSource: "button" },
      type: "workspaceExternalAction",
    });
    expect(
      projectGeneratedWorkspaceCreateIntent(
        scope,
        surfaceId,
        { surfaceId, type: "createSubmit" },
        contextId,
      ),
    ).toMatchObject({ contextId, surfaceId, type: "workspaceCreate" });
    expect(
      projectGeneratedWorkspaceOperationIntent(
        scope,
        controlId,
        { controlId, invocationSource: "button", type: "operationInvoke" },
        { recordId: "task-1", resultId },
      ),
    ).toMatchObject({ controlId, recordId: "task-1", resultId, type: "workspaceOperation" });
    expect(
      projectGeneratedWorkspaceFieldIntent(
        scope,
        fieldId,
        {
          fieldName: "title",
          fieldValue: { kind: "input", value: "Review" },
          type: "recordDraftChange",
        },
        { recordId: "task-1", resultId },
      ),
    ).toMatchObject({ fieldId, recordId: "task-1", resultId, type: "workspaceField" });
    expect(
      projectGeneratedWorkspaceListIntent(scope, resultId, {
        actionId: "down",
        direction: "down",
        itemId: "task-1",
        listId: resultId,
        type: "listReorder",
      }),
    ).toMatchObject({ resultId, type: "workspaceList" });
    expect(
      projectGeneratedWorkspaceTableIntent(scope, resultId, {
        actionId: "down",
        direction: "down",
        rowId: "task-1",
        tableId: resultId,
        type: "tableReorder",
      }),
    ).toMatchObject({ resultId, type: "workspaceTable" });
    expect(
      projectGeneratedWorkspaceRecordResultIntent(
        scope,
        resultId,
        {
          fieldId,
          intent: { fieldName: "title", type: "recordDraftRevert" },
          recordId: "task-1",
          resultId,
          type: "recordResultFieldIntent",
        },
        contextId,
      ),
    ).toMatchObject({ contextId, resultId, type: "workspaceRecordResult" });
  });

  it("rejects unreachable ready selections and incoherent list-detail facts", () => {
    const scope = workspaceScope("site", "pages", "blocks");

    expect(() =>
      projectGeneratedWorkspaceContext({
        context: {
          id: "page",
          label: "Pages",
          options: [{ id: "home", label: "Home" }],
          presentation: "localTabs",
          selectedOptionId: "missing",
        },
        scope,
      }),
    ).toThrow("Ready workspace contexts require a selected available option.");
    expect(() =>
      projectGeneratedWorkspaceContract({
        id: "site",
        label: "Site",
        width: "wide",
        sections: [
          {
            collection: {
              context: {
                id: "page",
                label: "Pages",
                options: [{ id: "home", label: "Home" }],
                presentation: "localTabs",
                selectedOptionId: "home",
              },
              id: "blocks",
              label: "Blocks",
              layout: "listDetail",
              queries: [{ id: "all", label: "All" }],
              result: listResult(scope, "blocks"),
              selectedQueryId: "all",
            },
            id: "pages",
            label: "Pages",
          },
        ],
      }),
    ).toThrow("List-detail workspace collections require a local list-detail context.");
  });
});

function workspaceScope(
  screenId: string,
  sectionId: string,
  collectionId: string,
): GeneratedWorkspaceIdentityScope {
  const scopedScreenId = generatedWorkspaceScreenId(screenId);
  const scopedSectionId = generatedWorkspaceSectionId(scopedScreenId, sectionId);

  return {
    collectionId: generatedWorkspaceCollectionId(scopedSectionId, collectionId),
    screenId: scopedScreenId,
    sectionId: scopedSectionId,
  };
}

function collectionFacts({
  id,
  label,
  result,
}: {
  id: string;
  label: string;
  result: WorkspaceResultContract;
}): GeneratedWorkspaceCollectionProjectionFacts {
  return {
    id,
    label,
    queries: [{ id: "all", label: "All" }],
    result,
    selectedQueryId: "all",
  };
}

function listResult(scope: GeneratedWorkspaceIdentityScope, id: string): WorkspaceResultContract {
  return {
    accessibilityLabel: "Records",
    density: "compact",
    editing: { enabled: true },
    id: generatedWorkspaceScopedId(scope, "result", id),
    items: [],
    kind: "list",
  };
}

function tableResult(scope: GeneratedWorkspaceIdentityScope, id: string): WorkspaceResultContract {
  return {
    accessibilityLabel: "Records",
    columns: [],
    density: "compact",
    editing: { enabled: true },
    id: generatedWorkspaceScopedId(scope, "result", id),
    kind: "table",
    rows: [],
  };
}

function recordResult(
  scope: GeneratedWorkspaceIdentityScope,
  id: string,
  recordId?: string,
): RecordResultContract {
  const resultId = generatedWorkspaceScopedId(scope, "result", id);

  return {
    accessibilityLabel: "Record",
    actions: {
      id: `${resultId}:actions`,
      kind: "actionGroup",
      primary: [],
      secondary: [],
      secondaryAccessibilityLabel: "More actions",
    },
    availability: recordId === undefined ? { state: "empty" } : { state: "ready" },
    density: "default",
    editing: { enabled: true },
    fields: [],
    id: resultId,
    kind: "recordResult",
    ...(recordId === undefined
      ? {}
      : {
          selectedRecord: {
            accessibilityLabel: recordId,
            id: recordId,
            kind: "recordResultRecord" as const,
          },
        }),
    warnings: [],
  };
}

function createAction(
  scope: GeneratedWorkspaceIdentityScope,
  id: string,
): Extract<
  WorkspaceCollectionActionContract,
  {
    kind: "createAction";
  }
> {
  return {
    kind: "createAction",
    surface: createSurface(generatedWorkspaceScopedId(scope, "surface", id)),
  };
}

function operationAction(
  scope: GeneratedWorkspaceIdentityScope,
  id: string,
): Extract<
  WorkspaceCollectionActionContract,
  {
    kind: "operationAction";
  }
> {
  return {
    control: operationControl(generatedWorkspaceScopedId(scope, "control", id)),
    kind: "operationAction",
  };
}

function externalAction(scope: GeneratedWorkspaceIdentityScope, id: string): ActionTriggerContract {
  const controlId = generatedWorkspaceScopedId(scope, "control", id);

  return {
    id: controlId,
    invocationSource: "button",
    invoke: { controlId, invocationSource: "button" },
    kind: "actionTrigger",
    label: "Import",
  };
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
      title: "Create",
    },
    id,
    kind: "createSurface",
    trigger: button(`${id}:trigger`, "Create"),
  };
}

function operationControl(id: string): OperationControlContract {
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
      ...button(`${id}:trigger`, "Run"),
      intent: { controlId: id, invocationSource: "button", type: "operationInvoke" },
      prominence: "secondary",
    },
  };
}

function button(id: string, label: string, type: "button" | "submit" = "button") {
  return {
    accessibilityLabel: label,
    content: { kind: "label" as const, label },
    density: "default" as const,
    id,
    kind: "button" as const,
    prominence: "secondary" as const,
    type,
  };
}

function requiredSection<T>(section: T | undefined): T {
  if (section === undefined) {
    throw new Error("Expected workspace section.");
  }
  return section;
}
