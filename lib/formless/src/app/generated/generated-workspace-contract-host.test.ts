import { describe, expect, it } from "vite-plus/test";
import type {
  ListContract,
  RecordResultContract,
  TableContract,
  TreeResultContract,
  WorkspaceContract,
} from "@dpeek/formless-presentation/contract";
import {
  createMemoryPresentationHost,
  type PresentationNodeSet,
} from "@dpeek/formless-presentation/host";
import type { GeneratedOperationControlBinding } from "../../client/views.ts";
import { projectGeneratedListOperationAction } from "./list-projection.ts";
import { projectGeneratedOperationControl } from "./operation-projection.ts";
import { projectGeneratedRecordField } from "./field-projection.ts";
import { createApplicationRuntimePublicationCoordinator } from "./application-runtime-contract-host.tsx";
import {
  prepareGeneratedWorkspaceRuntimePublication,
  projectGeneratedWorkspaceContractHostPublication,
} from "./generated-workspace-contract-host.ts";

describe("generated workspace contract host adapter", () => {
  it("publishes full workspace extent without synthesizing a width", () => {
    const constrained = workspaceFixture();
    const { surface: sourceSurface, width: sourceWidth, ...workspaceBase } = constrained;
    void sourceSurface;
    void sourceWidth;
    const publication = projectGeneratedWorkspaceContractHostPublication({
      ...workspaceBase,
      surface: "full",
    });
    const host = createMemoryPresentationHost({ nodes: publication.nodes });
    const workspace = required(host.read(publication.workspaceReference));

    expect(workspace.surface).toBe("full");
    expect("width" in workspace).toBe(false);
  });

  it("flattens complete list, table, and context projections into scoped host nodes", () => {
    const publication = projectGeneratedWorkspaceContractHostPublication(workspaceFixture());
    const host = createMemoryPresentationHost({ nodes: publication.nodes });
    const workspace = required(host.read(publication.workspaceReference));
    const [listSectionReference, tableSectionReference] = workspace.sections;
    const listSection = required(host.read(required(listSectionReference)));
    const tableSection = required(host.read(required(tableSectionReference)));
    const list = host.read(listSection.collection.presentation.result);
    const contextReference = listSection.collection.presentation.contextDetail;
    const context = contextReference ? host.read(contextReference) : undefined;
    const table = host.read(tableSection.collection.presentation.result);

    expect(workspace).toMatchObject({
      actions: [
        {
          href: "/sites/site",
          kind: "workspaceLinkAction",
          target: "newTab",
        },
      ],
      id: "workspace:tasks",
      kind: "workspaceManifest",
      sections: [
        { role: "section", sectionId: "section:tasks" },
        { role: "section", sectionId: "section:archive" },
      ],
    });
    expect(listSection).toMatchObject({
      collection: {
        presentation: {
          contextDetail: { role: "contextResult" },
          result: { kind: "listResultReference", role: "mainResult" },
        },
      },
      kind: "workspaceSectionShell",
    });
    expect(tableSection.collection.presentation.result).toMatchObject({
      kind: "tableResultReference",
      role: "mainResult",
    });
    expect(list).toMatchObject({ id: "list:tasks", kind: "list" });
    expect(context).toMatchObject({ id: "record:task-context", kind: "recordResult" });
    expect(table).toMatchObject({ id: "table:archive", kind: "table" });
  });

  it("isolates unrelated complete reprojections and changes at result, section, and workspace boundaries", () => {
    const initial = projectGeneratedWorkspaceContractHostPublication(workspaceFixture());
    const host = createMemoryPresentationHost({ nodes: initial.nodes });
    const manifest = required(host.read(initial.workspaceReference));
    const [listSectionReference, tableSectionReference] = manifest.sections;
    const listSection = required(host.read(required(listSectionReference)));
    const contextReference = required(listSection.collection.presentation.contextDetail);
    const mainReference = listSection.collection.presentation.result;
    const tableSection = required(host.read(required(tableSectionReference)));
    const tableReference = tableSection.collection.presentation.result;
    const initialList = required(host.read(mainReference));
    if (initialList.kind !== "list") {
      throw new Error("Expected list result.");
    }
    const initialFieldIds = Object.fromEntries(
      initialList.items.map((item) => [
        item.id,
        item.presentation === "fields" ? item.fields.map((field) => field.fieldId) : [],
      ]),
    );
    const notifications = {
      context: 0,
      main: 0,
      section: 0,
      table: 0,
      workspace: 0,
    };

    host.subscribe(initial.workspaceReference, () => notifications.workspace++);
    host.subscribe(required(listSectionReference), () => notifications.section++);
    host.subscribe(mainReference, () => notifications.main++);
    host.subscribe(contextReference, () => notifications.context++);
    host.subscribe(tableReference, () => notifications.table++);

    host.publish(projectGeneratedWorkspaceContractHostPublication(workspaceFixture()).nodes);
    expect(notifications).toEqual({ context: 0, main: 0, section: 0, table: 0, workspace: 0 });

    const resultOptions: WorkspaceFixtureOptions = {
      fieldDraft: "Draft title",
      fieldPending: true,
      itemIds: ["task-2", "task-1"],
      operationPending: true,
      orderingPending: true,
      warning: "Owner email is missing.",
    };
    host.publish(
      projectGeneratedWorkspaceContractHostPublication(workspaceFixture(resultOptions)).nodes,
    );
    expect(notifications).toEqual({ context: 0, main: 1, section: 0, table: 0, workspace: 0 });
    expect(host.read(mainReference)).toMatchObject({
      items: [
        { id: "task-2" },
        {
          actions: { primary: [{ control: { status: { status: "pending" } } }] },
          fields: [{ drafts: { draft: "Draft title" }, pending: { isPending: true } }],
          id: "task-1",
          ordering: { pending: true },
          warnings: [{ items: [{ message: "Owner email is missing." }] }],
        },
      ],
    });
    const republishedList = required(host.read(mainReference));
    if (republishedList.kind !== "list") {
      throw new Error("Expected republished list result.");
    }
    expect(
      Object.fromEntries(
        republishedList.items.map((item) => [
          item.id,
          item.presentation === "fields" ? item.fields.map((field) => field.fieldId) : [],
        ]),
      ),
    ).toEqual(initialFieldIds);

    const sectionOptions: WorkspaceFixtureOptions = {
      ...resultOptions,
      activeCount: "3",
      contextCount: "2",
      selectedContextId: "context:project-2",
      selectedQueryId: "query:all",
      summaryValue: "3 open",
    };
    host.publish(
      projectGeneratedWorkspaceContractHostPublication(workspaceFixture(sectionOptions)).nodes,
    );
    expect(notifications).toEqual({ context: 0, main: 1, section: 1, table: 0, workspace: 0 });
    expect(host.read(required(listSectionReference))).toMatchObject({
      collection: {
        presentation: {
          context: {
            options: [
              { countText: "2", selected: false },
              { countText: "2", selected: true },
            ],
            selectedOptionId: "context:project-2",
          },
          queryNavigation: {
            items: [{ countText: "3", selected: false }, { selected: true }],
          },
          summaries: [{ displayValue: "3 open" }],
        },
        selectedQueryId: "query:all",
      },
    });

    host.publish(
      projectGeneratedWorkspaceContractHostPublication(
        workspaceFixture({ ...sectionOptions, sectionOrder: ["archive", "tasks"] }),
      ).nodes,
    );
    expect(notifications).toEqual({ context: 0, main: 1, section: 1, table: 0, workspace: 1 });
    expect(
      host.read(initial.workspaceReference)?.sections.map(({ sectionId }) => sectionId),
    ).toEqual(["section:archive", "section:tasks"]);
  });

  it("prepares reusable workspace nodes and current scoped intent handling", async () => {
    const calls: string[] = [];
    const workspace = workspaceFixture();
    const initial = prepareGeneratedWorkspaceRuntimePublication(workspace, () => {
      calls.push("initial");
    });
    const coordinator = createApplicationRuntimePublicationCoordinator([
      ["workspace:tasks", initial],
    ]);
    const manifest = required(coordinator.host.read(initial.workspaceReference));
    const section = required(coordinator.host.read(required(manifest.sections[0])));
    const queryNavigation = section.collection.presentation.queryNavigation;
    const intent = required(queryNavigation?.items[0]).selectionIntent;

    expect(initial.workspaceReference).toEqual({
      kind: "workspaceManifestReference",
      role: "workspace",
      workspaceId: workspace.id,
    });

    await coordinator.host.dispatch(intent);
    coordinator.publish(
      "workspace:tasks",
      prepareGeneratedWorkspaceRuntimePublication(workspace, () => {
        calls.push("current");
      }),
    );
    await coordinator.host.dispatch(intent);

    expect(calls).toEqual(["initial", "current"]);
  });

  it("publishes a mixed tree result atomically with stable shells and scoped notification", () => {
    const initial = projectGeneratedWorkspaceContractHostPublication(mixedWorkspaceFixture());
    const host = createMemoryPresentationHost({ nodes: initial.nodes });
    const manifest = required(host.read(initial.workspaceReference));
    const treeSectionReference = required(manifest.sections[2]);
    const treeSection = required(host.read(treeSectionReference));
    const treeReference = treeSection.collection.presentation.result;
    const initialManifest = manifest;
    const initialSection = treeSection;
    const initialTree = required(host.read(treeReference));
    const notifications = { section: 0, tree: 0, workspace: 0 };
    let removalWasAtomic = false;

    host.subscribe(initial.workspaceReference, () => {
      notifications.workspace++;
      removalWasAtomic =
        host.read(treeSectionReference) === undefined && host.read(treeReference) === undefined;
    });
    host.subscribe(treeSectionReference, () => notifications.section++);
    host.subscribe(treeReference, () => notifications.tree++);

    host.publish(projectGeneratedWorkspaceContractHostPublication(mixedWorkspaceFixture()).nodes);
    expect(notifications).toEqual({ section: 0, tree: 0, workspace: 0 });
    expect(host.read(initial.workspaceReference)).toBe(initialManifest);
    expect(host.read(treeSectionReference)).toBe(initialSection);
    expect(host.read(treeReference)).toBe(initialTree);

    host.publish(
      projectGeneratedWorkspaceContractHostPublication(mixedWorkspaceFixture("Updated hero")).nodes,
    );
    expect(notifications).toEqual({ section: 0, tree: 1, workspace: 0 });
    expect(host.read(initial.workspaceReference)).toBe(initialManifest);
    expect(host.read(treeSectionReference)).toBe(initialSection);
    expect(host.read(treeReference)).toMatchObject({
      items: [{ label: "Updated hero" }],
      kind: "treeResult",
    });

    host.publish(projectGeneratedWorkspaceContractHostPublication(workspaceFixture()).nodes);
    expect(notifications).toEqual({ section: 1, tree: 2, workspace: 1 });
    expect(removalWasAtomic).toBe(true);
    expect(host.read(treeSectionReference)).toBeUndefined();
    expect(host.read(treeReference)).toBeUndefined();
  });

  it("publishes ordered selected-detail nodes with scoped updates and validated intents", () => {
    const initial = projectGeneratedWorkspaceContractHostPublication(
      selectedRecordWorkspaceFixture(),
    );
    const host = createMemoryPresentationHost({ nodes: initial.nodes });
    const manifest = required(host.read(initial.workspaceReference));
    const sectionReference = required(manifest.sections[0]);
    const section = required(host.read(sectionReference));
    const presentation = section.collection.presentation;
    if (presentation.kind !== "selectedRecord") {
      throw new Error("Missing selected-record shell fixture.");
    }
    const [recordSection, relationshipSection] = presentation.sections;
    const recordReference = required(recordSection).result;
    const relationshipReference = required(relationshipSection).result;

    expect(presentation).toMatchObject({
      activePresentation: "detail",
      backIntent: { recordId: "task-1", type: "workspaceSelectedRecordBack" },
      compactPresentation: "drillIn",
      result: { kind: "listResultReference", role: "mainResult" },
      sections: [
        {
          kind: "selectedRecordRecordSection",
          result: { kind: "recordResultReference", role: "selectedDetailResult" },
        },
        {
          kind: "selectedRecordRelationshipSection",
          result: { kind: "tableResultReference", role: "selectedDetailResult" },
        },
      ],
      selectedRecordId: "task-1",
    });
    expect(host.read(recordReference)).toMatchObject({
      kind: "recordResult",
      selectedRecord: { id: "task-1" },
    });
    expect(host.read(relationshipReference)).toMatchObject({
      accessibilityLabel: "Task compounds",
      kind: "table",
    });

    const notifications = { record: 0, relationship: 0, section: 0 };
    host.subscribe(sectionReference, () => notifications.section++);
    host.subscribe(recordReference, () => notifications.record++);
    host.subscribe(relationshipReference, () => notifications.relationship++);
    host.publish(
      projectGeneratedWorkspaceContractHostPublication(
        selectedRecordWorkspaceFixture("Updated task compounds"),
      ).nodes,
    );
    expect(notifications).toEqual({ record: 0, relationship: 1, section: 0 });

    const invalidNodes = initial.nodes.map((node) => {
      if (
        node.reference.kind !== "workspaceSectionShellReference" ||
        node.snapshot.kind !== "workspaceSectionShell"
      ) {
        return node;
      }
      const selectedPresentation = node.snapshot.collection.presentation;
      if (selectedPresentation.kind !== "selectedRecord") {
        return node;
      }
      return {
        ...node,
        snapshot: {
          ...node.snapshot,
          collection: {
            ...node.snapshot.collection,
            presentation: {
              ...selectedPresentation,
              selectionIntents: selectedPresentation.selectionIntents.map((intent, index) =>
                index === 0 ? { ...intent, sectionId: "section:other" } : intent,
              ),
            },
          },
        },
      };
    }) as PresentationNodeSet;
    expect(() => host.publish(invalidNodes)).toThrow("invalid selection intent");
    expect(host.read(sectionReference)).toBe(section);
  });
});

type WorkspaceFixtureOptions = {
  activeCount?: string;
  contextCount?: string;
  fieldDraft?: string;
  fieldPending?: boolean;
  itemIds?: readonly string[];
  operationPending?: boolean;
  orderingPending?: boolean;
  sectionOrder?: readonly ("archive" | "tasks")[];
  selectedContextId?: string;
  selectedQueryId?: string;
  summaryValue?: string;
  warning?: string;
};

function workspaceFixture(options: WorkspaceFixtureOptions = {}): WorkspaceContract {
  const sections = {
    archive: archiveSection(),
    tasks: tasksSection(options),
  };

  return {
    accessibilityLabel: "Tasks workspace",
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
    id: "workspace:tasks",
    kind: "workspace",
    label: "Tasks",
    sections: (options.sectionOrder ?? ["tasks", "archive"]).map((key) => sections[key]),
    surface: "constrained",
    width: "standard",
  };
}

function mixedWorkspaceFixture(itemLabel = "Hero"): WorkspaceContract {
  const workspace = workspaceFixture();
  return { ...workspace, sections: [...workspace.sections, treeSection(itemLabel)] };
}

function selectedRecordWorkspaceFixture(relationshipLabel = "Task compounds"): WorkspaceContract {
  const screenId = "workspace:selected-tasks";
  const sectionId = "section:selected-tasks";
  const collectionId = "collection:selected-tasks";
  const sourceResult = listResult({});
  const selectionIntents = sourceResult.items.map(({ id: recordId }) => ({
    collectionId,
    recordId,
    screenId,
    sectionId,
    type: "workspaceSelectedRecordSelection" as const,
  }));
  const mainResult: ListContract = {
    ...sourceResult,
    editing: { disabledReason: "Summary items are read-only.", enabled: false },
    items: sourceResult.items.map((item) => ({
      accessibilityLabel: item.accessibilityLabel,
      id: item.id,
      kind: "listItem",
      presentation: "summary",
      selected: item.id === "task-1",
      selectionIntent: required(selectionIntents.find(({ recordId }) => recordId === item.id)),
      title: item.id === "task-1" ? "Initial title" : "Second task",
    })),
  };

  return {
    accessibilityLabel: "Selected tasks workspace",
    actions: [],
    id: screenId,
    kind: "workspace",
    label: "Selected tasks",
    sections: [
      {
        accessibilityLabel: "Selected tasks section",
        actions: [],
        collection: {
          accessibilityLabel: "Selected tasks collection",
          availability: { state: "ready" },
          id: collectionId,
          kind: "workspaceCollection",
          label: "Tasks",
          presentation: {
            accessibilityLabel: "Tasks selected record",
            actions: workspaceActions(collectionId),
            activePresentation: "detail",
            backIntent: {
              collectionId,
              recordId: "task-1",
              screenId,
              sectionId,
              type: "workspaceSelectedRecordBack",
            },
            compactPresentation: "drillIn",
            id: "selected-record:tasks",
            kind: "selectedRecord",
            result: mainResult,
            sections: [
              {
                id: "selected-record-section:details",
                kind: "selectedRecordRecordSection",
                label: "Details",
                result: selectedRecordResult(),
              },
              {
                headingOperations: [],
                id: "selected-record-section:compounds",
                kind: "selectedRecordRelationshipSection",
                label: "Compounds",
                result: selectedRecordTable(relationshipLabel),
              },
            ],
            selectedRecordId: "task-1",
            selectionIntents,
            summaries: [],
          },
          selectedQueryId: null,
        },
        headingVisibility: "hidden",
        id: sectionId,
        kind: "workspaceSection",
        label: "Tasks",
      },
    ],
    surface: "constrained",
    width: "wide",
  };
}

function selectedRecordResult(): RecordResultContract {
  return {
    ...contextResult(),
    accessibilityLabel: "Selected task detail",
    id: "record:selected-task",
    selectedRecord: {
      accessibilityLabel: "Task one",
      id: "task-1",
      kind: "recordResultRecord",
    },
  };
}

function selectedRecordTable(accessibilityLabel: string): TableContract {
  return {
    ...tableResult(),
    accessibilityLabel,
    id: "table:selected-task-compounds",
  };
}

function treeSection(itemLabel: string) {
  return {
    accessibilityLabel: "Site tree section",
    actions: [],
    collection: {
      accessibilityLabel: "Site tree collection",
      availability: { state: "ready" as const },
      id: "collection:site-tree",
      kind: "workspaceCollection" as const,
      label: "Site tree",
      presentation: {
        actions: workspaceActions("collection:site-tree"),
        kind: "ordinary" as const,
        result: treeResult(itemLabel),
        summaries: [],
      },
      selectedQueryId: null,
    },
    headingVisibility: "visible" as const,
    id: "section:site-tree",
    kind: "workspaceSection" as const,
    label: "Site tree",
  };
}

function treeResult(itemLabel: string): TreeResultContract {
  const id = "tree:site";
  const itemId = `${id}:item:hero`;

  return {
    accessibilityLabel: "Homepage tree",
    availability: { state: "ready" },
    density: "default",
    editing: { enabled: true },
    feedback: [],
    id,
    items: [
      {
        accessibilityLabel: itemLabel,
        availability: { available: true },
        childRecordId: "block:hero",
        children: [],
        contextActions: [],
        id: itemId,
        kind: "treeItem",
        label: itemLabel,
        placementId: "placement:hero",
        selected: false,
        selectionIntent: { itemId, resultId: id, type: "treeItemSelection" },
        structure: { state: "branch" },
        warnings: [],
      },
    ],
    kind: "treeResult",
    root: {
      accessibilityLabel: "Homepage tree root",
      id: `${id}:root:homepage`,
      kind: "treeRoot",
      label: "Homepage",
    },
    warnings: [],
  };
}

function tasksSection(options: WorkspaceFixtureOptions) {
  const screenId = "workspace:tasks";
  const sectionId = "section:tasks";
  const collectionId = "collection:tasks";
  const selectedQueryId = options.selectedQueryId ?? "query:active";
  const selectedContextId = options.selectedContextId ?? "context:project-1";

  return {
    accessibilityLabel: "Tasks section",
    actions: [],
    collection: {
      accessibilityLabel: "Tasks collection",
      availability: { state: "ready" as const },
      id: collectionId,
      kind: "workspaceCollection" as const,
      label: "Tasks",
      presentation: {
        actions: workspaceActions(collectionId),
        context: {
          accessibilityLabel: "Project context",
          availability: { state: "ready" as const },
          id: "context:project",
          kind: "workspaceContext" as const,
          label: "Project",
          options: ["context:project-1", "context:project-2"].map((id) => ({
            availability: { available: true as const },
            countText: options.contextCount ?? "1",
            id,
            kind: "workspaceContextOption" as const,
            label: id.endsWith("1") ? "Project one" : "Project two",
            selected: id === selectedContextId,
            selectionIntent: {
              collectionId,
              contextId: "context:project",
              contextOptionId: id,
              screenId,
              sectionId,
              type: "workspaceContextSelection" as const,
            },
          })),
          presentation: "singletonDetail" as const,
          selectedOptionId: selectedContextId,
        },
        contextDetail: contextResult(),
        kind: "ordinary" as const,
        queryNavigation: {
          accessibilityLabel: "Task queries",
          id: "query:navigation",
          items: ["query:active", "query:all"].map((id) => ({
            availability: { available: true as const },
            ...(id === "query:active" ? { countText: options.activeCount ?? "1" } : {}),
            id,
            kind: "workspaceQuery" as const,
            label: id === "query:active" ? "Active" : "All",
            selected: id === selectedQueryId,
            selectionIntent: {
              collectionId,
              queryId: id,
              screenId,
              sectionId,
              type: "workspaceQuerySelection" as const,
            },
          })),
          kind: "workspaceQueryNavigation" as const,
        },
        result: listResult(options),
        summaries: [
          {
            availability: { available: true as const },
            displayValue: options.summaryValue ?? "1 open",
            id: "summary:open",
            kind: "workspaceSummary" as const,
            label: "Open",
          },
        ],
      },
      selectedQueryId,
    },
    headingVisibility: "visible" as const,
    id: sectionId,
    kind: "workspaceSection" as const,
    label: "Tasks section",
  };
}

function archiveSection() {
  return {
    accessibilityLabel: "Archive section",
    actions: [],
    collection: {
      accessibilityLabel: "Archive collection",
      availability: { state: "ready" as const },
      id: "collection:archive",
      kind: "workspaceCollection" as const,
      label: "Archive",
      presentation: {
        actions: workspaceActions("collection:archive"),
        kind: "ordinary" as const,
        result: tableResult(),
        summaries: [],
      },
      selectedQueryId: null,
    },
    headingVisibility: "visible" as const,
    id: "section:archive",
    kind: "workspaceSection" as const,
    label: "Archive section",
  };
}

function listResult(options: WorkspaceFixtureOptions): ListContract {
  const ids = options.itemIds ?? ["task-1", "task-2"];

  return {
    accessibilityLabel: "Task records",
    density: "compact",
    editing: { enabled: true },
    id: "list:tasks",
    items: ids.map((id) => {
      const field = projectGeneratedRecordField({
        canPatch: true,
        editorDraft: id === "task-1" ? options.fieldDraft : undefined,
        fieldConfig: {
          commit: "field-commit",
          editor: "text",
          field: { label: "Title", required: true, type: "text" },
          fieldName: "title",
        },
        isPending: id === "task-1" && options.fieldPending,
        occurrence: {
          owner: { kind: "listItem", listId: "list:tasks", recordId: id },
          placementId: "title",
        },
        recordId: id,
        recordValue: id === "task-1" ? "Initial title" : "Second task",
      });
      const operation = projectGeneratedListOperationAction(
        projectGeneratedOperationControl({
          binding: operationBinding(id),
          presentation: {
            accessibilityLabel: `Run ${id}`,
            content: { kind: "label", label: "Run" },
            density: "compact",
            prominence: "secondary",
          },
          state: {
            executionKey: `task.run:${id}`,
            status: id === "task-1" && options.operationPending ? "pending" : "idle",
          },
        }),
        "command",
      );

      return {
        accessibilityLabel: id,
        actions: {
          id: `${id}:actions`,
          kind: "actionGroup",
          primary: [operation],
          secondary: [],
          secondaryAccessibilityLabel: `More actions for ${id}`,
        },
        availability: { available: true },
        fields: [field],
        id,
        kind: "listItem",
        ordering: {
          accessibilityLabel: `Reorder ${id}`,
          actions: [],
          affordance: "reorder",
          kind: "ordering",
          pending: id === "task-1" && (options.orderingPending ?? false),
        },
        presentation: "fields",
        warnings:
          id === "task-1" && options.warning
            ? [
                {
                  id: `${id}:warnings`,
                  items: [{ code: "owner-email", message: options.warning }],
                  kind: "listWarning" as const,
                  title: "Readiness warnings",
                },
              ]
            : [],
      };
    }),
    kind: "list",
  };
}

function contextResult(): RecordResultContract {
  return {
    accessibilityLabel: "Selected task context",
    actions: {
      id: "record:task-context:actions",
      kind: "actionGroup",
      primary: [],
      secondary: [],
      secondaryAccessibilityLabel: "More context actions",
    },
    availability: { state: "ready" },
    density: "compact",
    editing: { enabled: true },
    fields: [],
    id: "record:task-context",
    kind: "recordResult",
    warnings: [],
  };
}

function tableResult(): TableContract {
  return {
    accessibilityLabel: "Archived tasks",
    columns: [],
    density: "compact",
    editing: { enabled: true },
    id: "table:archive",
    kind: "table",
    rows: [],
  };
}

function workspaceActions(id: string) {
  return {
    id: `${id}:actions`,
    kind: "workspaceCollectionActions" as const,
    primary: [],
    secondary: [],
    secondaryAccessibilityLabel: `More actions for ${id}`,
  };
}

function operationBinding(recordId: string): GeneratedOperationControlBinding {
  return {
    availability: { state: "enabled" },
    canonicalOperationKey: "task.run",
    entityName: "task",
    executionKey: `task.run:${recordId}`,
    id: `task.run:${recordId}`,
    input: { kind: "collectionCommand", ui: { showAffectedCountOnSuccess: false } },
    kind: "command",
    label: "Run",
    operationKind: "command",
    operationName: "run",
    scope: "collection",
    visualIntent: "default",
  };
}

function required<T>(value: T | null | undefined): T {
  if (value === undefined || value === null) {
    throw new Error("Missing required fixture value.");
  }
  return value;
}
