import { describe, expect, it } from "vite-plus/test";
import type { RecordResultContract, TreeNodeContract, TreeResultContract } from "./contract.ts";
import {
  createMemoryPresentationHost,
  presentationReferenceKey,
  treeResultReference,
  workspaceManifestReference,
  workspaceSectionShellReference,
  type PresentationNodeSet,
  type TreeResultNode,
} from "./host.ts";

const workspaceReference = workspaceManifestReference("workspace:site");
const sectionReference = workspaceSectionShellReference(
  workspaceReference.workspaceId,
  "section:pages",
);
const treeReference = treeResultReference({
  resultId: "tree:homepage",
  role: "mainResult",
  sectionId: sectionReference.sectionId,
  workspaceId: workspaceReference.workspaceId,
});

describe("Formless UI tree-result host member", () => {
  it("provides typed reads, a stable reference key, and complete-set validation", () => {
    const nodes = treeNodes();
    const host = createMemoryPresentationHost({ nodes });
    const tree: TreeResultContract | undefined = host.read({ ...treeReference });

    expect(tree?.root).toMatchObject({
      editor: { id: "tree:homepage:root:page:homepage:editor", kind: "recordResult" },
      entityTypeLabel: "Page",
      kind: "treeNode",
      children: [
        {
          editor: {
            id: "tree:homepage:root:page:homepage:placement:hero:editor",
            kind: "recordResult",
          },
          entityTypeLabel: "Hero",
          kind: "treeNode",
        },
      ],
    });
    expect(presentationReferenceKey(treeReference)).toBe(
      JSON.stringify([
        "mainResult",
        "workspace:site",
        "section:pages",
        "treeResultReference",
        "tree:homepage",
      ]),
    );
    expect(() => host.publish(nodes.slice(0, -1))).toThrow("has no snapshot");
    expect(host.read(treeReference)).toBe(tree);

    const mismatchedNode: TreeResultNode = {
      reference: treeReference,
      snapshot: treeResult({ id: "tree:other" }),
    };
    expect(() => createMemoryPresentationHost({ nodes: [mismatchedNode] })).toThrow(
      "does not match reference",
    );
  });

  it("validates recursive occurrence identity and canonical editor agreement", () => {
    const duplicate = treeResult();
    const child = required(duplicate.root?.children[0]);
    const invalidDuplicate: TreeResultNode = {
      reference: treeReference,
      snapshot: {
        ...duplicate,
        root: {
          ...required(duplicate.root),
          children: [{ ...child, id: duplicate.root?.id ?? "" }],
        },
      },
    };
    expect(() => createMemoryPresentationHost({ nodes: [invalidDuplicate] })).toThrow(
      "duplicate node identities",
    );

    const invalidEditor: TreeResultNode = {
      reference: treeReference,
      snapshot: {
        ...duplicate,
        root: {
          ...required(duplicate.root),
          editor: { ...required(duplicate.root?.editor), id: "editor:other" },
        },
      },
    };
    expect(() => createMemoryPresentationHost({ nodes: [invalidEditor] })).toThrow(
      "invalid node editor",
    );
  });
});

function treeNodes(): PresentationNodeSet {
  return [
    {
      reference: workspaceReference,
      snapshot: {
        accessibilityLabel: "Site workspace",
        actions: [],
        id: workspaceReference.workspaceId,
        kind: "workspaceManifest",
        label: "Site",
        sections: [sectionReference],
        surface: "constrained",
        width: "wide",
      },
    },
    {
      reference: sectionReference,
      snapshot: {
        accessibilityLabel: "Pages section",
        actions: [],
        collection: {
          accessibilityLabel: "Page tree",
          availability: { state: "ready" },
          id: "collection:pages",
          kind: "workspaceCollection",
          label: "Pages",
          presentation: {
            actions: {
              id: "collection:pages:actions",
              kind: "workspaceCollectionActions",
              primary: [],
              secondary: [],
              secondaryAccessibilityLabel: "More page actions",
            },
            kind: "ordinary",
            result: treeReference,
            summaries: [],
          },
          selectedQueryId: null,
        },
        headingVisibility: "visible",
        id: sectionReference.sectionId,
        kind: "workspaceSectionShell",
        label: "Pages",
      },
    },
    { reference: treeReference, snapshot: treeResult() },
  ];
}

function treeResult({ id = treeReference.resultId }: { id?: string } = {}): TreeResultContract {
  const rootId = `${id}:root:page:homepage`;
  const childId = `${rootId}:placement:hero`;

  return {
    accessibilityLabel: "Homepage block tree",
    availability: { state: "ready" },
    density: "default",
    editing: { enabled: true },
    feedback: [],
    id,
    kind: "treeResult",
    root: treeNode({
      children: [treeNode({ entityTypeLabel: "Hero", id: childId, recordId: "block:hero" })],
      entityTypeLabel: "Page",
      id: rootId,
      recordId: "page:homepage",
    }),
    warnings: [],
  };
}

function treeNode({
  children = [],
  entityTypeLabel,
  id,
  recordId,
}: {
  children?: readonly TreeNodeContract[];
  entityTypeLabel: string;
  id: string;
  recordId: string;
}): TreeNodeContract {
  return {
    accessibilityLabel: `${entityTypeLabel} block`,
    availability: { available: true },
    children,
    editor: recordResult(`${id}:editor`, recordId),
    entityTypeLabel,
    headerActions: {
      accessibilityLabel: `More ${entityTypeLabel.toLowerCase()} actions`,
      id: `${id}:header-actions`,
      items: [],
      kind: "treeNodeActions",
    },
    id,
    kind: "treeNode",
    label: entityTypeLabel,
    structure: { state: children.length === 0 ? "leaf" : "branch" },
    warnings: [],
  };
}

function recordResult(id: string, recordId: string): RecordResultContract {
  return {
    accessibilityLabel: "Block editor",
    actions: {
      id: `${id}:actions`,
      kind: "actionGroup",
      primary: [],
      secondary: [],
      secondaryAccessibilityLabel: "More block actions",
    },
    availability: { state: "ready" },
    density: "compact",
    editing: { enabled: true },
    fields: [],
    id,
    kind: "recordResult",
    selectedRecord: {
      accessibilityLabel: `${recordId} record`,
      id: recordId,
      kind: "recordResultRecord",
    },
    warnings: [],
  };
}

function required<Value>(value: Value | null | undefined): Value {
  if (value === undefined || value === null) {
    throw new Error("Expected value.");
  }
  return value;
}
