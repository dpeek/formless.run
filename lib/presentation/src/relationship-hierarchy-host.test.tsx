import { describe, expect, it } from "vite-plus/test";
import type {
  ButtonContract,
  CreateSurfaceContract,
  ListContract,
  RecordResultContract,
  RelationshipHierarchyContract,
  RelationshipHierarchyNodeContract,
  WorkspaceSectionShellContract,
} from "./contract.ts";
import {
  createMemoryPresentationHost,
  listResultReference,
  presentationReferenceKey,
  relationshipHierarchyReference,
  workspaceManifestReference,
  workspaceSectionShellReference,
  type PresentationNodeSet,
  type RelationshipHierarchyNode,
} from "./host.ts";

const workspaceId = "workspace:accounts";
const sectionId = "section:accounts";
const collectionId = "collection:accounts";
const selectedRecordId = "account:formless";
const workspaceReference = workspaceManifestReference(workspaceId);
const sectionReference = workspaceSectionShellReference(workspaceId, sectionId);
const listReference = listResultReference({
  resultId: "list:accounts",
  role: "mainResult",
  sectionId,
  workspaceId,
});
const hierarchyReference = relationshipHierarchyReference({
  hierarchyId: "hierarchy:account-team",
  sectionId,
  workspaceId,
});

describe("relationship-hierarchy memory Presentation Host", () => {
  it("hosts one recursively composed heterogeneous selected-record hierarchy", () => {
    const host = createMemoryPresentationHost({ nodes: hierarchyNodes() });
    const hierarchy: RelationshipHierarchyContract | undefined = host.read({
      ...hierarchyReference,
    });

    expect(presentationReferenceKey(hierarchyReference)).toBe(
      '["selectedDetail","workspace:accounts","section:accounts","relationshipHierarchyReference","hierarchy:account-team"]',
    );
    expect(hierarchy?.root.entityTypeLabel).toBe("Account");
    expect(hierarchy?.root.relationshipGroups.map(({ label }) => label)).toEqual([
      "Projects",
      "Archived projects",
    ]);
    expect(
      hierarchy?.root.relationshipGroups[0]?.nodes[0]?.relationshipGroups[0]?.nodes[0]
        ?.entityTypeLabel,
    ).toBe("Task");
    expect(
      hierarchy?.root.relationshipGroups[0]?.nodes[0]?.relationshipGroups[0]?.nodes[0]
        ?.headerActions.items,
    ).toEqual([
      {
        kind: "linkAction",
        link: {
          accessibilityLabel: "Open Ship task documentation",
          availability: "available",
          href: "https://example.test/tasks/task:ship",
          id: "occurrence:account/project/task:documentation",
          kind: "nativeLinkAction",
          label: "Open documentation",
          prominence: "secondary",
          target: "newTab",
        },
      },
    ]);
    expect(hierarchy?.root.relationshipGroups[1]).toMatchObject({
      label: "Archived projects",
      nodes: [],
    });
  });

  it("rejects cross-section and missing hierarchy references", () => {
    const crossSectionReference = relationshipHierarchyReference({
      hierarchyId: hierarchyReference.hierarchyId,
      sectionId: "section:other",
      workspaceId,
    });
    const crossSectionNodes = hierarchyNodes().map((node) => {
      if (node.reference.kind === "workspaceSectionShellReference") {
        return {
          ...node,
          snapshot: selectedRecordSection(crossSectionReference),
        };
      }
      if (node.reference.kind === "relationshipHierarchyReference") {
        return { ...node, reference: crossSectionReference };
      }
      return node;
    }) as PresentationNodeSet;

    expect(() => createMemoryPresentationHost({ nodes: crossSectionNodes })).toThrow(
      "invalid parent scope",
    );
    expect(() =>
      createMemoryPresentationHost({
        nodes: hierarchyNodes().filter(
          ({ reference }) => reference.kind !== "relationshipHierarchyReference",
        ),
      }),
    ).toThrow("has no snapshot");
  });

  it("rejects hierarchy snapshots whose identity does not match the reference", () => {
    const nodes = hierarchyNodes().map((node) =>
      node.reference.kind === "relationshipHierarchyReference"
        ? {
            ...node,
            snapshot: { ...node.snapshot, id: "hierarchy:other" },
          }
        : node,
    ) as PresentationNodeSet;

    expect(() => createMemoryPresentationHost({ nodes })).toThrow("does not match reference");
  });

  it("requires the hierarchy root and its editor to agree with selected record identity", () => {
    const mismatchedRoot = hierarchyContract();
    mismatchedRoot.root = {
      ...mismatchedRoot.root,
      editor: recordResult("editor:other-account", "account:other", "Other account"),
      recordId: "account:other",
    };

    expect(() => createMemoryPresentationHost({ nodes: hierarchyNodes(mismatchedRoot) })).toThrow(
      "invalid relationship hierarchy",
    );

    const mismatchedEditor = hierarchyContract();
    mismatchedEditor.root = {
      ...mismatchedEditor.root,
      editor: recordResult("editor:wrong-root", "account:other", "Other account"),
    };

    expect(() => createMemoryPresentationHost({ nodes: hierarchyNodes(mismatchedEditor) })).toThrow(
      "invalid occurrence record editor",
    );
  });

  it("requires recursive occurrence and relationship-group identities to be unique", () => {
    const duplicateOccurrence = hierarchyContract();
    const projects = duplicateOccurrence.root.relationshipGroups[0]!;
    const project = projects.nodes[0]!;
    duplicateOccurrence.root = {
      ...duplicateOccurrence.root,
      relationshipGroups: [
        {
          ...projects,
          nodes: [{ ...project, id: duplicateOccurrence.root.id }],
        },
        duplicateOccurrence.root.relationshipGroups[1]!,
      ],
    };

    expect(() =>
      createMemoryPresentationHost({ nodes: hierarchyNodes(duplicateOccurrence) }),
    ).toThrow("duplicate occurrence identities");

    const duplicateGroup = hierarchyContract();
    const rootProjects = duplicateGroup.root.relationshipGroups[0]!;
    const projectWithTasks = rootProjects.nodes[0]!;
    duplicateGroup.root = {
      ...duplicateGroup.root,
      relationshipGroups: [
        {
          ...rootProjects,
          nodes: [
            {
              ...projectWithTasks,
              relationshipGroups: [
                {
                  ...projectWithTasks.relationshipGroups[0]!,
                  id: rootProjects.id,
                },
              ],
            },
          ],
        },
        duplicateGroup.root.relationshipGroups[1]!,
      ],
    };

    expect(() => createMemoryPresentationHost({ nodes: hierarchyNodes(duplicateGroup) })).toThrow(
      "duplicate relationship group identities",
    );
  });
});

function hierarchyNodes(hierarchy = hierarchyContract()): PresentationNodeSet {
  return [
    {
      reference: workspaceReference,
      snapshot: {
        accessibilityLabel: "Accounts workspace",
        actions: [],
        id: workspaceId,
        kind: "workspaceManifest",
        label: "Accounts",
        sections: [sectionReference],
        surface: "constrained",
        width: "standard",
      },
    },
    {
      reference: sectionReference,
      snapshot: selectedRecordSection(hierarchyReference),
    },
    { reference: listReference, snapshot: selectedRecordList() },
    { reference: hierarchyReference, snapshot: hierarchy } satisfies RelationshipHierarchyNode,
  ];
}

function selectedRecordSection(
  selectedHierarchyReference: typeof hierarchyReference,
): WorkspaceSectionShellContract {
  const selectionIntent = {
    collectionId,
    recordId: selectedRecordId,
    screenId: workspaceId,
    sectionId,
    type: "workspaceSelectedRecordSelection" as const,
  };

  return {
    accessibilityLabel: "Accounts section",
    actions: [],
    collection: {
      accessibilityLabel: "Accounts collection",
      availability: { state: "ready" },
      id: collectionId,
      kind: "workspaceCollection",
      label: "Accounts",
      presentation: {
        accessibilityLabel: "Accounts selected-record workspace",
        actions: {
          id: "accounts:actions",
          kind: "workspaceCollectionActions",
          primary: [],
          secondary: [],
          secondaryAccessibilityLabel: "More account actions",
        },
        activePresentation: "detail",
        backIntent: {
          collectionId,
          recordId: selectedRecordId,
          screenId: workspaceId,
          sectionId,
          type: "workspaceSelectedRecordBack",
        },
        compactPresentation: "drillIn",
        id: "selected-record:accounts",
        kind: "selectedRecord",
        result: listReference,
        sections: [
          {
            hierarchy: selectedHierarchyReference,
            id: "detail-section:team",
            kind: "selectedRecordRelationshipHierarchySection",
            label: "Team",
          },
        ],
        selectedRecordId,
        selectionIntents: [selectionIntent],
        summaries: [],
      },
      selectedQueryId: "query:accounts",
    },
    headingVisibility: "visible",
    id: sectionId,
    kind: "workspaceSectionShell",
    label: "Accounts",
  };
}

function selectedRecordList(): ListContract {
  const selectionIntent = {
    collectionId,
    recordId: selectedRecordId,
    screenId: workspaceId,
    sectionId,
    type: "workspaceSelectedRecordSelection" as const,
  };

  return {
    accessibilityLabel: "Accounts",
    density: "default",
    editing: { applicability: "notApplicable" },
    id: listReference.resultId,
    items: [
      {
        accessibilityLabel: "Formless account",
        id: selectedRecordId,
        kind: "listItem",
        presentation: "summary",
        selectionIntent,
        title: "Formless",
      },
    ],
    kind: "list",
    selection: { selectedItemId: selectedRecordId },
  };
}

function hierarchyContract(): RelationshipHierarchyContract {
  const task = hierarchyNode({
    actions: [
      {
        kind: "linkAction",
        link: {
          accessibilityLabel: "Open Ship task documentation",
          availability: "available",
          href: "https://example.test/tasks/task:ship",
          id: "occurrence:account/project/task:documentation",
          kind: "nativeLinkAction",
          label: "Open documentation",
          prominence: "secondary",
          target: "newTab",
        },
      },
    ],
    entityTypeLabel: "Task",
    id: "occurrence:account/project/task",
    recordId: "task:ship",
  });
  const project = hierarchyNode({
    entityTypeLabel: "Project",
    id: "occurrence:account/project",
    recordId: "project:runtime",
    relationshipGroups: [
      {
        id: "relationship-group:account/project/tasks",
        kind: "relationshipHierarchyRelationshipGroup",
        label: "Tasks",
        nodes: [task],
      },
    ],
  });

  return {
    accessibilityLabel: "Formless relationship hierarchy",
    id: hierarchyReference.hierarchyId,
    kind: "relationshipHierarchy",
    root: hierarchyNode({
      entityTypeLabel: "Account",
      headerCreateGroupId: "relationship-group:account/projects",
      id: "occurrence:account",
      recordId: selectedRecordId,
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
    }),
  };
}

function hierarchyNode({
  actions = [],
  entityTypeLabel,
  headerCreateGroupId,
  id,
  recordId,
  relationshipGroups = [],
}: {
  actions?: RelationshipHierarchyNodeContract["headerActions"]["items"];
  entityTypeLabel: string;
  headerCreateGroupId?: string;
  id: string;
  recordId: string;
  relationshipGroups?: RelationshipHierarchyNodeContract["relationshipGroups"];
}): RelationshipHierarchyNodeContract {
  return {
    accessibilityLabel: `${entityTypeLabel} record`,
    editor: recordResult(`${id}:editor`, recordId, `${entityTypeLabel} editor`),
    entityTypeLabel,
    headerActions: {
      accessibilityLabel: `More ${entityTypeLabel.toLowerCase()} actions`,
      id: `${id}:header-actions`,
      items: [
        ...actions,
        ...(headerCreateGroupId === undefined
          ? []
          : [
              {
                kind: "createAction" as const,
                relationshipGroupId: headerCreateGroupId,
                surface: createSurface(`${id}:create`),
              },
            ]),
      ],
      kind: "relationshipHierarchyActions",
    },
    id,
    kind: "relationshipHierarchyNode",
    recordId,
    relationshipGroups,
  };
}

function recordResult(id: string, recordId: string, label: string): RecordResultContract {
  return {
    accessibilityLabel: label,
    actions: {
      id: `${id}:actions`,
      kind: "actionGroup",
      primary: [],
      secondary: [],
      secondaryAccessibilityLabel: `More ${label.toLowerCase()} actions`,
    },
    availability: { state: "ready" },
    density: "default",
    editing: { enabled: true },
    fields: [],
    id,
    kind: "recordResult",
    selectedRecord: {
      accessibilityLabel: label,
      id: recordId,
      kind: "recordResultRecord",
    },
    warnings: [],
  };
}

function createSurface(id: string): CreateSurfaceContract {
  return {
    dialog: {
      form: {
        cancel: button(`${id}:cancel`, "Cancel"),
        errors: [],
        fieldSet: {
          disabled: false,
          fields: [],
          id: `${id}:fields`,
          kind: "fieldSet",
        },
        id: `${id}:form`,
        kind: "createForm",
        submit: button(`${id}:submit`, "Create", "submit"),
      },
      id: `${id}:dialog`,
      kind: "createDialog",
      open: false,
      title: "Create project",
    },
    id,
    kind: "createSurface",
    trigger: button(`${id}:trigger`, "Create project"),
  };
}

function button(
  id: string,
  label: string,
  type: ButtonContract["type"] = "button",
): ButtonContract {
  return {
    accessibilityLabel: label,
    content: { kind: "label", label },
    density: "default",
    id,
    kind: "button",
    prominence: "secondary",
    type,
  };
}
