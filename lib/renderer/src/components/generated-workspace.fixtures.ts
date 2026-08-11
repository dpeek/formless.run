import type { FieldSchema } from "@dpeek/formless-schema";
import type {
  ActionTriggerContract,
  ButtonContract,
  CreateSurfaceContract,
  OperationControlContract,
  RecordResultContract,
  TreeChildCreationContract,
  TreeItemContract,
  TreeResultContract,
  WorkspaceCollectionActionGroupContract,
  WorkspaceCollectionContract,
  WorkspaceContextContract,
  WorkspaceContract,
  WorkspaceIntentScope,
  WorkspaceLinkActionContract,
  WorkspaceQueryNavigationContract,
  WorkspaceResultContract,
  WorkspaceSectionContract,
  WorkspaceSelectedRecordSectionContract,
  WorkspaceWidth,
} from "@dpeek/formless-presentation/contract";
import { createField, textControl, withFixtureFieldOccurrence } from "./fields/fixture-helpers.ts";
import { createListFixtures } from "./lists.fixtures.ts";
import { operationControlFixtures } from "./operation-controls.fixtures.ts";
import { createRecordResultFixtures, taskStatusField } from "./record-results.fixtures.ts";
import { createTableFixtures } from "./tables.fixtures.ts";
import { createTreeResultFixtures, type TreeResultFixtureId } from "./tree-results.fixtures.ts";

export type FormlessGeneratedWorkspaceFixtureId =
  | "empty-collection"
  | "empty-context"
  | "list-detail"
  | "multi-section"
  | "selected-record"
  | "selected-record-unselected"
  | "singleton-context"
  | "site-tree"
  | "site-tree-list-detail"
  | "tasks"
  | "unavailable";

export type FormlessGeneratedWorkspaceFixture = {
  id: FormlessGeneratedWorkspaceFixtureId;
  label: string;
  workspace: WorkspaceContract;
};

type WorkspaceFixtureScope = WorkspaceIntentScope;

const createTitleSchema = {
  label: "Task",
  required: true,
  type: "text",
} satisfies Extract<
  FieldSchema,
  {
    type: "text";
  }
>;
export function createFormlessGeneratedWorkspaceFixtures(): FormlessGeneratedWorkspaceFixture[] {
  return [
    { id: "tasks", label: "Tasks", workspace: tasksWorkspace() },
    { id: "multi-section", label: "Directory", workspace: multiSectionWorkspace() },
    { id: "list-detail", label: "List detail", workspace: listDetailWorkspace() },
    {
      id: "selected-record-unselected",
      label: "Selected record — list",
      workspace: selectedRecordWorkspace(null),
    },
    {
      id: "selected-record",
      label: "Selected record — detail",
      workspace: selectedRecordWorkspace("task-1"),
    },
    { id: "site-tree", label: "Site tree", workspace: siteTreeWorkspace("ordinary") },
    {
      id: "site-tree-list-detail",
      label: "Site tree list detail",
      workspace: siteTreeWorkspace("listDetail"),
    },
    {
      id: "singleton-context",
      label: "Singleton",
      workspace: singletonContextWorkspace(),
    },
    { id: "empty-context", label: "No context", workspace: emptyContextWorkspace() },
    {
      id: "empty-collection",
      label: "Empty",
      workspace: unavailableWorkspace("empty"),
    },
    {
      id: "unavailable",
      label: "Unavailable",
      workspace: unavailableWorkspace("unavailable"),
    },
  ];
}

function tasksWorkspace(): WorkspaceContract {
  const scope = workspaceScope("tasks", "tasks", "tasks");

  return workspace("tasks", "Tasks", [
    section(scope, {
      actions: [externalAction(scope, "install", "Install app")],
      collection: readyOrdinaryCollection(scope, {
        actions: collectionActions(scope),
        label: "Tasks",
        queryNavigation: queryNavigation(scope),
        result: listResult(scope),
        selectedQueryId: scopedId(scope, "query", "active"),
        summaries: [
          {
            availability: { available: true },
            displayValue: "18",
            id: scopedId(scope, "summary", "estimate"),
            kind: "workspaceSummary",
            label: "Estimate",
            suffix: "hours",
          },
          {
            availability: { available: false, message: "Hidden for this query." },
            displayValue: "0",
            id: scopedId(scope, "summary", "hidden"),
            kind: "workspaceSummary",
            label: "Hidden summary",
          },
        ],
      }),
      headingVisibility: "hidden",
      label: "Tasks",
    }),
  ]);
}

function multiSectionWorkspace(): WorkspaceContract {
  const companyScope = workspaceScope("directory", "companies", "companies");
  const contactScope = workspaceScope("directory", "contacts", "contacts");

  return workspace(
    "directory",
    "Directory",
    [
      section(companyScope, {
        collection: readyOrdinaryCollection(companyScope, {
          actions: collectionActions(companyScope),
          context: populatedContext(companyScope, "localTabs"),
          contextDetail: recordResult(companyScope, "company-detail", "Acme Company"),
          label: "Companies",
          result: tableResult(companyScope, "companies"),
          summaries: [
            {
              availability: { available: true },
              displayValue: "2",
              id: scopedId(companyScope, "summary", "companies"),
              kind: "workspaceSummary",
              label: "Companies",
            },
          ],
        }),
        headingVisibility: "visible",
        label: "Companies",
      }),
      section(contactScope, {
        collection: readyOrdinaryCollection(contactScope, {
          label: "Contact",
          result: recordResult(contactScope, "contact", "Sam Rivera"),
        }),
        headingVisibility: "visible",
        label: "Contact",
      }),
    ],
    [],
    "wide",
  );
}

function listDetailWorkspace(): WorkspaceContract {
  const scope = workspaceScope("projects", "work", "project-tasks");
  const selector = populatedContext(scope, "localListDetail");

  return workspace("projects", "Projects", [
    section(scope, {
      collection: {
        accessibilityLabel: "Project tasks",
        availability: { state: "ready" },
        id: scope.collectionId,
        kind: "workspaceCollection",
        label: "Project tasks",
        presentation: {
          accessibilityLabel: "Projects and tasks",
          actions: collectionActions(scope),
          contextDetail: recordResult(scope, "project-detail", "Launch project"),
          id: scopedId(scope, "listDetail", "projects"),
          kind: "listDetail",
          queryNavigation: queryNavigation(scope),
          result: tableResult(scope, "project-tasks"),
          selector,
          summaries: [
            {
              availability: { available: true },
              displayValue: "3",
              id: scopedId(scope, "summary", "tasks"),
              kind: "workspaceSummary",
              label: "Tasks",
            },
          ],
        },
        selectedQueryId: scopedId(scope, "query", "active"),
      },
      headingVisibility: "hidden",
      label: "Project work",
    }),
  ]);
}

function selectedRecordWorkspace(selectedRecordId: string | null): WorkspaceContract {
  const scope = workspaceScope("orders", "orders", "orders");
  const sourceResult = listResult(scope);
  if (sourceResult.kind !== "list") {
    throw new Error("Selected-record fixtures require a list result.");
  }
  const selectionIntents = sourceResult.items.map((item) => ({
    ...scope,
    recordId: item.id,
    type: "workspaceSelectedRecordSelection" as const,
  }));
  const selected = selectionIntents.some((intent) => intent.recordId === selectedRecordId)
    ? selectedRecordId
    : null;
  const result = {
    ...sourceResult,
    accessibilityLabel: "Orders",
    editing: { applicability: "notApplicable" as const },
    items: sourceResult.items.map((item, index) => {
      const summary = orderSummaryFacts[index];
      const selectionIntent = selectionIntents[index];
      if (!summary || !selectionIntent) {
        throw new Error(`Missing selected-record summary facts for ${item.id}.`);
      }

      return {
        accessibilityLabel: summary.title,
        id: item.id,
        kind: "listItem" as const,
        presentation: "summary" as const,
        selectionIntent,
        subtitle: summary.subtitle,
        title: summary.title,
      };
    }),
    selection: { selectedItemId: selected },
  };

  return workspace(
    "orders",
    "Orders",
    [
      section(scope, {
        collection: {
          accessibilityLabel: "Orders",
          availability: { state: "ready" },
          id: scope.collectionId,
          kind: "workspaceCollection",
          label: "Orders",
          presentation: {
            accessibilityLabel: "Orders selected record",
            actions: emptyCollectionActions(scope),
            activePresentation: selected === null ? "list" : "detail",
            ...(selected === null
              ? {}
              : {
                  backIntent: {
                    ...scope,
                    recordId: selected,
                    type: "workspaceSelectedRecordBack" as const,
                  },
                }),
            compactPresentation: "drillIn",
            id: scopedId(scope, "selectedRecord", "detail"),
            kind: "selectedRecord",
            result,
            sections:
              selected === null ? [] : selectedRecordDetailSections(scope, result, selected),
            selectedRecordId: selected,
            selectionIntents,
            summaries: [],
          },
          selectedQueryId: null,
        },
        headingVisibility: "hidden",
        label: "Orders",
      }),
    ],
    [],
    "wide",
    "full",
  );
}

const orderSummaryFacts = [
  { subtitle: "LH3BJMV5", title: "Patrick Lee" },
  { subtitle: "YK4NQ83S", title: "Aster Biologics" },
  { subtitle: "ZC7HP2KT", title: "Carla Nguyen" },
] as const;

export function selectFormlessGeneratedWorkspaceRecord(
  collection: WorkspaceCollectionContract,
  recordId: string | null,
): WorkspaceCollectionContract {
  const presentation = collection.presentation;
  if (presentation.kind !== "selectedRecord") {
    return collection;
  }

  if (recordId === null) {
    const { backIntent: _backIntent, ...unselectedPresentation } = presentation;
    return {
      ...collection,
      presentation: {
        ...unselectedPresentation,
        activePresentation: "list",
        result: selectSummaryResultItem(unselectedPresentation.result, null),
        sections: [],
        selectedRecordId: null,
      },
    };
  }

  const selectionIntent = presentation.selectionIntents.find(
    (candidate) => candidate.recordId === recordId,
  );
  if (!selectionIntent) {
    return collection;
  }

  const scope = {
    collectionId: selectionIntent.collectionId,
    screenId: selectionIntent.screenId,
    sectionId: selectionIntent.sectionId,
  };

  return {
    ...collection,
    presentation: {
      ...presentation,
      activePresentation: "detail",
      backIntent: {
        ...scope,
        recordId,
        type: "workspaceSelectedRecordBack",
      },
      result: selectSummaryResultItem(presentation.result, recordId),
      sections: selectedRecordDetailSections(scope, presentation.result, recordId),
      selectedRecordId: recordId,
    },
  };
}

function selectSummaryResultItem(
  result: Extract<WorkspaceResultContract, { kind: "list" }>,
  selectedRecordId: string | null,
): Extract<WorkspaceResultContract, { kind: "list" }> {
  return {
    ...result,
    selection: { selectedItemId: selectedRecordId },
  };
}

function selectedRecordDetailSections(
  scope: WorkspaceFixtureScope,
  result: Extract<WorkspaceResultContract, { kind: "list" }>,
  recordId: string,
): WorkspaceSelectedRecordSectionContract[] {
  const recordLabel =
    result.items.find((item) => item.id === recordId)?.accessibilityLabel ?? "Selected order";
  const detail = selectedRecordResult(scope, recordId, recordLabel);
  const compounds = tableResult(scope, "compounds");
  if (compounds.kind !== "table") {
    throw new Error("Selected-record relationship fixtures require a table result.");
  }

  return [
    {
      id: scopedId(scope, "selectedRecordSection", "details"),
      kind: "selectedRecordRecordSection",
      label: "Order details",
      result: detail,
    },
    {
      headingOperations: [
        headingOperationControl(scopedId(scope, "operation", "add-compound"), "Add compound"),
      ],
      id: scopedId(scope, "selectedRecordSection", "compounds"),
      kind: "selectedRecordRelationshipSection",
      label: "Compounds",
      result: {
        ...compounds,
        accessibilityLabel: "Related compounds",
        columns: compounds.columns.map((column) =>
          column.id === "title"
            ? { ...column, accessibilityLabel: "Compound", label: "Compound" }
            : column,
        ),
        rows: compounds.rows.slice(0, 1),
      },
    },
  ];
}

function selectedRecordResult(
  scope: WorkspaceFixtureScope,
  recordId: string,
  recordLabel: string,
): RecordResultContract {
  const source = recordResult(scope, "order-detail", recordLabel);
  const statusValue = recordId === "task-3" ? "done" : "open";

  return {
    ...source,
    actions: {
      ...source.actions,
      primary: source.actions.primary.filter((action) => action.role !== "transition"),
    },
    fields: source.fields.map((field) => {
      const selectedField =
        field.fieldName === "status" ? taskStatusField(statusValue, "transitions") : field;
      return withFixtureFieldOccurrence(
        { ...selectedField, labelVisibility: "visible", recordId },
        { ownerId: `${source.id}:${recordId}`, placementId: selectedField.fieldName },
      );
    }),
    selectedRecord: {
      accessibilityLabel: recordLabel,
      id: recordId,
      kind: "recordResultRecord",
    },
  };
}

function headingOperationControl(id: string, label: string): OperationControlContract {
  return {
    id,
    kind: "operationControl",
    status: {
      accessibilityLabel: `${label} available`,
      detail: "Ready",
      id: `${id}:status`,
      intent: "neutral",
      kind: "compactStatus",
      label: `${label} available`,
      status: "idle",
    },
    trigger: {
      ...button(`${id}:trigger`, label, "button", "primary"),
      intent: { controlId: id, invocationSource: "button", type: "operationInvoke" },
    },
  };
}

function siteTreeWorkspace(presentation: "listDetail" | "ordinary"): WorkspaceContract {
  const workspaceId = presentation === "ordinary" ? "site-tree" : "site-tree-list-detail";
  const scope = workspaceScope(workspaceId, "composition", "blocks");
  const result = treeResult(scope, "shallow");
  const contextDetail = recordResult(scope, "root-detail", "Homepage");

  return workspace(
    workspaceId,
    "Site composition",
    [
      section(scope, {
        collection:
          presentation === "ordinary"
            ? readyOrdinaryCollection(scope, {
                context: siteRootContext(scope, "localTabs"),
                contextDetail,
                label: "Page composition",
                result,
              })
            : {
                accessibilityLabel: "Site roots and composition",
                availability: { state: "ready" },
                id: scope.collectionId,
                kind: "workspaceCollection",
                label: "Page composition",
                presentation: {
                  accessibilityLabel: "Site roots and composition",
                  actions: emptyCollectionActions(scope),
                  contextDetail,
                  id: scopedId(scope, "listDetail", "site-roots"),
                  kind: "listDetail",
                  result,
                  selector: siteRootContext(scope, "localListDetail"),
                  summaries: [],
                },
                selectedQueryId: null,
              },
        headingVisibility: "hidden",
        label: "Composition",
      }),
    ],
    [],
    "wide",
  );
}

function singletonContextWorkspace(): WorkspaceContract {
  const scope = workspaceScope("site-settings", "settings", "settings");

  return workspace(
    "site-settings",
    "Site settings",
    [
      section(scope, {
        collection: readyOrdinaryCollection(scope, {
          context: populatedContext(scope, "singletonDetail"),
          contextDetail: recordResult(scope, "site-detail", "Public site"),
          label: "Settings",
          result: recordResult(scope, "settings", "Site settings"),
        }),
        headingVisibility: "hidden",
        label: "Settings",
      }),
    ],
    [
      {
        accessibilityLabel: "View site (opens in a new tab)",
        href: "/site-preview/home",
        id: "view-site",
        kind: "workspaceLinkAction",
        label: "View site",
        prominence: "primary",
        target: "newTab",
      },
    ],
    "narrow",
  );
}

function emptyContextWorkspace(): WorkspaceContract {
  const scope = workspaceScope("empty-projects", "tasks", "tasks");

  return workspace("empty-projects", "Projects", [
    section(scope, {
      collection: readyOrdinaryCollection(scope, {
        context: emptyContext(scope),
        label: "Tasks",
        result: listResult(scope, "empty"),
      }),
      headingVisibility: "hidden",
      label: "Tasks",
    }),
  ]);
}

function unavailableWorkspace(state: "empty" | "unavailable"): WorkspaceContract {
  const scope = workspaceScope(`${state}-workspace`, "records", "records");
  const ready = readyOrdinaryCollection(scope, {
    label: "Records",
    result: tableResult(scope, "records", "empty"),
  });

  return workspace(`${state}-workspace`, state === "empty" ? "Empty workspace" : "Unavailable", [
    section(scope, {
      collection: {
        ...ready,
        availability:
          state === "empty"
            ? {
                emptyState: {
                  description: "Create the first record to begin.",
                  id: scopedId(scope, "result", "records:empty"),
                  kind: "workspaceEmptyState",
                  title: "No records yet",
                },
                state: "empty",
              }
            : { message: "Records are temporarily unavailable.", state: "unavailable" },
      },
      headingVisibility: "hidden",
      label: "Records",
    }),
  ]);
}

function workspace(
  id: string,
  label: string,
  sections: readonly WorkspaceSectionContract[],
  actions: readonly WorkspaceLinkActionContract[] = [],
  width: WorkspaceWidth = "standard",
  surface: WorkspaceContract["surface"] = "constrained",
): WorkspaceContract {
  const contract = {
    accessibilityLabel: `${label} workspace`,
    actions,
    id: `workspace:${id}`,
    kind: "workspace",
    label,
    sections,
  } as const;

  return surface === "full" ? { ...contract, surface } : { ...contract, surface, width };
}

function section(
  scope: WorkspaceFixtureScope,
  input: {
    actions?: WorkspaceSectionContract["actions"];
    collection: WorkspaceCollectionContract;
    headingVisibility: WorkspaceSectionContract["headingVisibility"];
    label: string;
  },
): WorkspaceSectionContract {
  return {
    accessibilityLabel: `${input.label} section`,
    actions: input.actions ?? [],
    collection: input.collection,
    headingVisibility: input.headingVisibility,
    id: scope.sectionId,
    kind: "workspaceSection",
    label: input.label,
  };
}

function readyOrdinaryCollection(
  scope: WorkspaceFixtureScope,
  input: {
    actions?: WorkspaceCollectionActionGroupContract;
    context?: WorkspaceContextContract;
    contextDetail?: RecordResultContract;
    label: string;
    queryNavigation?: WorkspaceQueryNavigationContract;
    result: WorkspaceResultContract;
    selectedQueryId?: string | null;
    summaries?: WorkspaceCollectionContract["presentation"]["summaries"];
  },
): WorkspaceCollectionContract {
  return {
    accessibilityLabel: input.label,
    availability: { state: "ready" },
    id: scope.collectionId,
    kind: "workspaceCollection",
    label: input.label,
    presentation: {
      actions: input.actions ?? emptyCollectionActions(scope),
      ...(input.context === undefined ? {} : { context: input.context }),
      ...(input.contextDetail === undefined ? {} : { contextDetail: input.contextDetail }),
      kind: "ordinary",
      ...(input.queryNavigation === undefined ? {} : { queryNavigation: input.queryNavigation }),
      result: input.result,
      summaries: input.summaries ?? [],
    },
    selectedQueryId: input.selectedQueryId ?? null,
  };
}

function queryNavigation(scope: WorkspaceFixtureScope): WorkspaceQueryNavigationContract {
  const activeId = scopedId(scope, "query", "active");
  const completedId = scopedId(scope, "query", "completed");

  return {
    accessibilityLabel: "Task queries",
    id: scopedId(scope, "queryNavigation", "navigation"),
    items: [
      {
        availability: { available: true },
        countText: "3",
        id: activeId,
        kind: "workspaceQuery",
        label: "Active",
        selected: true,
        selectionIntent: { ...scope, queryId: activeId, type: "workspaceQuerySelection" },
      },
      {
        availability: { available: true },
        countText: "1",
        id: completedId,
        kind: "workspaceQuery",
        label: "Completed",
        selected: false,
        selectionIntent: { ...scope, queryId: completedId, type: "workspaceQuerySelection" },
      },
    ],
    kind: "workspaceQueryNavigation",
  };
}

function populatedContext<P extends WorkspaceContextContract["presentation"]>(
  scope: WorkspaceFixtureScope,
  presentation: P,
): WorkspaceContextContract & {
  presentation: P;
} {
  const contextId = scopedId(scope, "context", "projects");
  const launchId = scopedId(scope, "contextOption", "projects:project-launch");
  const docsId = scopedId(scope, "contextOption", "projects:project-docs");

  return {
    accessibilityLabel: "Project records",
    availability: { state: "ready" },
    createAction: {
      kind: "createAction",
      surface: createSurface(scopedId(scope, "create", "project"), "Create project"),
    },
    id: contextId,
    kind: "workspaceContext",
    label: "Projects",
    options: [
      {
        availability: { available: true },
        countText: "3",
        id: launchId,
        kind: "workspaceContextOption",
        label: "Launch",
        selected: true,
        selectionIntent: {
          ...scope,
          contextId,
          contextOptionId: launchId,
          type: "workspaceContextSelection",
        },
      },
      {
        availability: { available: true },
        countText: "1",
        id: docsId,
        kind: "workspaceContextOption",
        label: "Documentation",
        selected: false,
        selectionIntent: {
          ...scope,
          contextId,
          contextOptionId: docsId,
          type: "workspaceContextSelection",
        },
      },
    ],
    presentation,
    selectedOptionId: launchId,
  };
}

function siteRootContext<P extends "localListDetail" | "localTabs">(
  scope: WorkspaceFixtureScope,
  presentation: P,
): WorkspaceContextContract & {
  presentation: P;
} {
  const contextId = scopedId(scope, "context", "site-roots");
  const homepageId = scopedId(scope, "contextOption", "homepage");
  const headerId = scopedId(scope, "contextOption", "header");
  const option = (id: string, label: string, selected: boolean) => ({
    availability: { available: true } as const,
    id,
    kind: "workspaceContextOption" as const,
    label,
    selected,
    selectionIntent: {
      ...scope,
      contextId,
      contextOptionId: id,
      type: "workspaceContextSelection" as const,
    },
  });

  return {
    accessibilityLabel: "Site roots",
    availability: { state: "ready" },
    id: contextId,
    kind: "workspaceContext",
    label: "Roots",
    options: [option(homepageId, "Homepage", true), option(headerId, "Header", false)],
    presentation,
    selectedOptionId: homepageId,
  };
}

function emptyContext(scope: WorkspaceFixtureScope): WorkspaceContextContract {
  return {
    accessibilityLabel: "Project records",
    availability: {
      emptyState: {
        description: "Create a project before adding tasks.",
        id: scopedId(scope, "result", "projects:empty"),
        kind: "workspaceEmptyState",
        title: "No projects yet",
      },
      state: "empty",
    },
    createAction: {
      kind: "createAction",
      surface: createSurface(scopedId(scope, "create", "project"), "Create project"),
    },
    id: scopedId(scope, "context", "projects"),
    kind: "workspaceContext",
    label: "Projects",
    options: [],
    presentation: "localTabs",
  };
}

function collectionActions(scope: WorkspaceFixtureScope): WorkspaceCollectionActionGroupContract {
  return {
    id: scopedId(scope, "collectionActions", "actions"),
    kind: "workspaceCollectionActions",
    primary: [
      {
        kind: "createAction",
        surface: createSurface(scopedId(scope, "create", "task"), "Create task"),
      },
    ],
    secondary: [
      {
        control: scopedOperationControl(
          operationControlFixtures.refreshTasks.initial,
          scopedId(scope, "operation", "refresh"),
        ),
        kind: "operationAction",
      },
    ],
    secondaryAccessibilityLabel: `More actions for ${scope.collectionId}`,
  };
}

function emptyCollectionActions(
  scope: WorkspaceFixtureScope,
): WorkspaceCollectionActionGroupContract {
  return {
    id: scopedId(scope, "collectionActions", "actions"),
    kind: "workspaceCollectionActions",
    primary: [],
    secondary: [],
    secondaryAccessibilityLabel: `More actions for ${scope.collectionId}`,
  };
}

function externalAction(
  scope: WorkspaceFixtureScope,
  id: string,
  label: string,
): WorkspaceSectionContract["actions"][number] {
  const actionId = scopedId(scope, "externalActionControl", id);
  const action: ActionTriggerContract = {
    accessibilityLabel: label,
    icon: "add",
    id: actionId,
    intent: "primary",
    invocationSource: "button",
    invoke: { controlId: actionId, invocationSource: "button" },
    kind: "actionTrigger",
    label,
  };

  return {
    action,
    id: scopedId(scope, "externalAction", id),
    kind: "workspaceExternalAction",
  };
}

function createSurface(id: string, title: string): CreateSurfaceContract {
  const control = textControl(createTitleSchema);

  return {
    dialog: {
      form: {
        cancel: button(`${id}:cancel`, "Cancel"),
        errors: [],
        fieldSet: {
          disabled: false,
          fields: [
            createField({
              control,
              draftInput: { kind: "input", value: "" },
              editor: control.editor,
              field: createTitleSchema,
              fieldName: "title",
              labelVisibility: "visible",
              occurrence: { ownerId: id, placementId: "title" },
              recordId: id,
              value: "",
            }),
          ],
          id: `${id}:fields`,
          kind: "fieldSet",
        },
        id: `${id}:form`,
        kind: "createForm",
        submit: button(`${id}:submit`, title, "submit", "primary"),
      },
      id: `${id}:dialog`,
      kind: "createDialog",
      open: false,
      title,
    },
    id,
    kind: "createSurface",
    trigger: button(`${id}:trigger`, title, "button", "primary"),
  };
}

function listResult(
  scope: WorkspaceFixtureScope,
  state: "active" | "empty" = "active",
): WorkspaceResultContract {
  const list = requiredListFixture(state);
  const id = scopedId(scope, "result", "tasks");

  return {
    ...list,
    id,
    items: list.items.map((item) =>
      item.presentation === "summary"
        ? item
        : {
            ...item,
            ordering:
              item.ordering === undefined
                ? undefined
                : {
                    ...item.ordering,
                    actions: item.ordering.actions.map((action) => ({
                      ...action,
                      intent: { ...action.intent, listId: id },
                    })),
                  },
          },
    ),
  };
}

function tableResult(
  scope: WorkspaceFixtureScope,
  localId: string,
  state: "active" | "empty" = "active",
): WorkspaceResultContract {
  const table = requiredTableFixture(state);
  const id = scopedId(scope, "result", localId);

  return {
    ...table,
    id,
    rows: table.rows.map((row) => ({
      ...row,
      cells: row.cells.map((cell) => ({
        ...cell,
        contents: cell.contents.map((content) =>
          content.kind === "ordering"
            ? {
                ...content,
                actions: content.actions.map((action) => ({
                  ...action,
                  intent: { ...action.intent, tableId: id },
                })),
              }
            : content,
        ),
      })),
    })),
  };
}

function treeResult(
  scope: WorkspaceFixtureScope,
  fixtureId: TreeResultFixtureId,
): TreeResultContract {
  const source = requiredTreeResultFixture(fixtureId);
  const id = scopedId(scope, "result", fixtureId);

  return {
    ...source,
    id,
    items: scopeTreeItems(source.items, id),
    root: { ...source.root, id: `${id}:root` },
    ...(source.rootChildCreation === undefined
      ? {}
      : { rootChildCreation: scopeTreeChildCreation(source.rootChildCreation, id) }),
    ...(source.selectedEditor === undefined
      ? {}
      : {
          selectedEditor: {
            ...source.selectedEditor,
            ...(source.selectedEditor.childCreation === undefined
              ? {}
              : {
                  childCreation: scopeTreeChildCreation(source.selectedEditor.childCreation, id),
                }),
          },
        }),
  };
}

function scopeTreeItems(
  items: readonly TreeItemContract[],
  resultId: string,
): readonly TreeItemContract[] {
  return items.map((item) => ({
    ...item,
    children: scopeTreeItems(item.children, resultId),
    contextActions: item.contextActions.map((action) => ({
      ...action,
      intent: { ...action.intent, resultId },
    })),
    ...(item.disclosure === undefined
      ? {}
      : {
          disclosure: {
            ...item.disclosure,
            intent: { ...item.disclosure.intent, resultId },
          },
        }),
    ...(item.ordering === undefined
      ? {}
      : {
          ordering: {
            ...item.ordering,
            actions: item.ordering.actions.map((action) => ({
              ...action,
              intent: { ...action.intent, resultId },
            })),
          },
        }),
    selectionIntent: { ...item.selectionIntent, resultId },
  }));
}

function scopeTreeChildCreation(
  creation: TreeChildCreationContract,
  resultId: string,
): TreeChildCreationContract {
  return {
    ...creation,
    variants: creation.variants.map((variant) => ({
      ...variant,
      selectionIntent: { ...variant.selectionIntent, resultId },
    })),
  };
}

function recordResult(
  scope: WorkspaceFixtureScope,
  localId: string,
  recordLabel: string,
): RecordResultContract {
  const result = requiredRecordResultFixture();
  const id = scopedId(scope, "result", localId);

  return {
    ...result,
    accessibilityLabel: `${recordLabel} record`,
    actions: {
      ...result.actions,
      id: `${id}:actions`,
      primary: result.actions.primary.map((action) => ({
        ...action,
        control: scopedOperationControl(action.control, `${id}:control:${action.role}`),
      })),
      secondary: result.actions.secondary.map((action) => ({
        ...action,
        control: scopedOperationControl(action.control, `${id}:control:${action.role}`),
      })),
      secondaryAccessibilityLabel: `More actions for ${recordLabel}`,
    },
    density: "compact",
    fields: result.fields.map((field) =>
      withFixtureFieldOccurrence(field, {
        ownerId: `${id}:${result.selectedRecord?.id ?? "record"}`,
        placementId: field.fieldName,
      }),
    ),
    id,
    ...(result.selectedRecord === undefined
      ? {}
      : {
          selectedRecord: { ...result.selectedRecord, accessibilityLabel: recordLabel },
        }),
  };
}

function scopedOperationControl(
  control: OperationControlContract,
  id: string,
): OperationControlContract {
  const withControlId = <
    T extends {
      controlId: string;
    },
  >(
    intent: T,
  ): T => ({
    ...intent,
    controlId: id,
  });

  return {
    ...structuredClone(control),
    ...(control.confirmation === undefined
      ? {}
      : {
          confirmation: {
            ...control.confirmation,
            action: {
              ...control.confirmation.action,
              id: `${id}:confirmation:action`,
              intent: withControlId(control.confirmation.action.intent),
            },
            cancel: { ...control.confirmation.cancel, id: `${id}:confirmation:cancel` },
            closeIntent: withControlId(control.confirmation.closeIntent),
            id: `${id}:confirmation`,
          },
        }),
    id,
    status: { ...control.status, id: `${id}:status` },
    trigger: {
      ...control.trigger,
      id: `${id}:trigger`,
      intent: withControlId(control.trigger.intent),
    },
  };
}

function button(
  id: string,
  label: string,
  type: ButtonContract["type"] = "button",
  prominence: ButtonContract["prominence"] = "secondary",
): ButtonContract {
  return {
    accessibilityLabel: label,
    content: { kind: "label", label },
    density: "compact",
    id,
    kind: "button",
    prominence,
    type,
  };
}

function workspaceScope(
  screen: string,
  sectionId: string,
  collectionId: string,
): WorkspaceFixtureScope {
  const screenId = `workspace:${screen}`;
  const scopedSectionId = `${screenId}:section:${sectionId}`;

  return {
    collectionId: `${scopedSectionId}:collection:${collectionId}`,
    screenId,
    sectionId: scopedSectionId,
  };
}

function scopedId(scope: WorkspaceFixtureScope, kind: string, localId: string) {
  return `${scope.collectionId}:${kind}:${localId}`;
}

function requiredListFixture(id: "active" | "empty") {
  const fixture = createListFixtures().find((candidate) => candidate.id === id);
  if (!fixture) {
    throw new Error(`Missing ${id} list fixture.`);
  }
  return fixture.list;
}

function requiredTableFixture(id: "active" | "empty") {
  const fixture = createTableFixtures().find((candidate) => candidate.id === id);
  if (!fixture) {
    throw new Error(`Missing ${id} table fixture.`);
  }
  return fixture.table;
}

function requiredRecordResultFixture() {
  const fixture = createRecordResultFixtures().find((candidate) => candidate.id === "editable");
  if (!fixture) {
    throw new Error("Missing editable record-result fixture.");
  }
  return fixture.recordResult;
}

function requiredTreeResultFixture(id: TreeResultFixtureId) {
  const fixture = createTreeResultFixtures().find((candidate) => candidate.id === id);
  if (!fixture) {
    throw new Error(`Missing ${id} tree-result fixture.`);
  }
  return fixture.tree;
}
