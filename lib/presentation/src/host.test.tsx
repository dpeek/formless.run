// @vitest-environment jsdom

import { act, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type {
  PresentationIntent,
  DocumentThemeContract,
  ListContract,
  RecordResultContract,
  ShellManifestContract,
  ShellNavigationSectionContract,
  TableContract,
  WorkspaceManifestContract,
  WorkspaceSectionShellContract,
} from "./contract.ts";
import {
  createMemoryPresentationHost,
  documentThemeReference,
  listResultReference,
  recordResultReference,
  shellManifestReference,
  shellNavigationSectionReference,
  tableResultReference,
  workspaceManifestReference,
  workspaceSectionShellReference,
  type DocumentThemeNode,
  type PresentationNodeSet,
  type WorkspaceManifestNode,
} from "./host.ts";
import { PresentationHostProvider, useWorkspaceManifest } from "./host-react.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const workspaceReference = workspaceManifestReference("workspace:tasks");
const taskSectionReference = workspaceSectionShellReference("workspace:tasks", "section:tasks");
const companySectionReference = workspaceSectionShellReference(
  "workspace:tasks",
  "section:companies",
);
const taskResultReference = listResultReference({
  resultId: "list:tasks",
  role: "mainResult",
  sectionId: "section:tasks",
  workspaceId: "workspace:tasks",
});
const companyResultReference = listResultReference({
  resultId: "list:companies",
  role: "mainResult",
  sectionId: "section:companies",
  workspaceId: "workspace:tasks",
});
const taskTableResultReference = tableResultReference({
  resultId: "table:tasks",
  role: "mainResult",
  sectionId: "section:table",
  workspaceId: "workspace:tasks",
});
const contextResultReference = recordResultReference({
  resultId: "record:task",
  role: "contextResult",
  sectionId: "section:tasks",
  workspaceId: "workspace:tasks",
});
const shellReference = shellManifestReference("shell:program");
const themeReference = documentThemeReference("theme:application");
const programSectionReference = shellNavigationSectionReference(
  "shell:program",
  "shell-section:program",
);
const workspaceSwitcherSectionReference = shellNavigationSectionReference(
  "shell:program",
  "shell-section:workspaces",
);
const statusSectionReference = shellNavigationSectionReference(
  "shell:program",
  "shell-section:status",
);
const sessionSectionReference = shellNavigationSectionReference(
  "shell:program",
  "shell-section:session",
);

describe("memory Presentation Host", () => {
  it("preserves coherent workspace surfaces and rejects full surfaces with widths", () => {
    const [manifestNode, ...childNodes] = workspaceNodes({ includeCompanies: false });
    if (
      !manifestNode ||
      manifestNode.reference.kind !== "workspaceManifestReference" ||
      manifestNode.snapshot.kind !== "workspaceManifest"
    ) {
      throw new Error("Missing workspace manifest fixture.");
    }
    const { surface: sourceSurface, width: sourceWidth, ...manifestBase } = manifestNode.snapshot;
    void sourceSurface;
    void sourceWidth;
    const fullNode = {
      reference: manifestNode.reference,
      snapshot: { ...manifestBase, surface: "full" as const },
    };
    const host = createMemoryPresentationHost({ nodes: [fullNode, ...childNodes] });
    const fullWorkspace = host.read(workspaceReference);

    expect(fullWorkspace?.surface).toBe("full");
    expect(fullWorkspace && "width" in fullWorkspace).toBe(false);
    expect(() =>
      createMemoryPresentationHost({
        nodes: [
          {
            ...fullNode,
            snapshot: { ...fullNode.snapshot, width: "wide" },
          } as unknown as WorkspaceManifestNode,
          ...childNodes,
        ],
      }),
    ).toThrow("full surface must not declare a width");
  });

  it("provides typed reads through stable scoped references", () => {
    const host = createMemoryPresentationHost({
      nodes: [
        ...workspaceNodes(),
        ...shellNodes(),
        { reference: taskTableResultReference, snapshot: tableResult("table:tasks") },
        { reference: contextResultReference, snapshot: recordResult("record:task") },
      ],
    });

    const workspace: WorkspaceManifestContract | undefined = host.read({
      ...workspaceReference,
    });
    const list: ListContract | undefined = host.read({ ...taskResultReference });
    const table: TableContract | undefined = host.read({ ...taskTableResultReference });
    const record: RecordResultContract | undefined = host.read({
      ...contextResultReference,
    });
    const shell: ShellManifestContract | undefined = host.read({
      ...shellReference,
    });
    const shellSection: ShellNavigationSectionContract | undefined = host.read({
      ...programSectionReference,
    });
    const statusSection: ShellNavigationSectionContract | undefined = host.read({
      ...statusSectionReference,
    });

    expect(workspace?.label).toBe("Work");
    expect(list?.accessibilityLabel).toBe("Tasks");
    expect(table?.kind).toBe("table");
    expect(record?.kind).toBe("recordResult");
    expect(shell?.title).toBe("Formless Program");
    expect(shellSection?.destinations[0]?.label).toBe("Tasks");
    expect(shellSection).toMatchObject({ icon: "archive", label: "Workflow" });
    expect(shellSection?.destinations[0]?.countText).toBe("0");
    expect(statusSection?.status?.workspaceSave?.id).toBe("workspace-save:tasks");
  });

  it("preserves discriminated summary list items at the host boundary", () => {
    const summaryList: ListContract = {
      ...listResult("list:tasks", "Tasks"),
      editing: { applicability: "notApplicable" },
      items: [
        {
          accessibilityLabel: "Release notes",
          id: "task-1",
          kind: "listItem",
          presentation: "summary",
          subtitle: "Article",
          title: "Release notes",
        },
      ],
    };
    const host = createMemoryPresentationHost({
      nodes: workspaceNodes({ includeCompanies: false, taskResult: summaryList }),
    });

    expect(host.read(taskResultReference)?.items[0]).toEqual(summaryList.items[0]);
  });

  it("hosts fixed and user-controlled theme snapshots beside shell nodes", () => {
    const host = createMemoryPresentationHost({
      nodes: [...shellNodes(), fixedThemeNodes("dark")],
    });
    const fixedTheme: DocumentThemeContract | undefined = host.read({
      ...themeReference,
    });

    expect(fixedTheme).toEqual({
      activeMode: "dark",
      id: themeReference.themeId,
      kind: "documentTheme",
      policy: { kind: "fixed", mode: "dark" },
    });
    expect(host.read(shellReference)?.title).toBe("Formless Program");

    host.publish([...shellNodes(), userThemeNodes("system", "light")]);

    expect(host.read(themeReference)).toMatchObject({
      activeMode: "light",
      policy: { kind: "userControlled" },
      selectionControl: {
        selectedMode: "system",
      },
    });
  });

  it("validates document-theme identity, fixed policy, and selection intents", () => {
    expect(() =>
      createMemoryPresentationHost({
        nodes: [
          {
            reference: themeReference,
            snapshot: {
              ...fixedThemeNodes("light").snapshot,
              id: "theme:other",
            },
          } as DocumentThemeNode,
        ],
      }),
    ).toThrow("does not match reference");

    expect(() =>
      createMemoryPresentationHost({
        nodes: [
          {
            reference: themeReference,
            snapshot: {
              ...fixedThemeNodes("light").snapshot,
              activeMode: "dark",
            },
          },
        ],
      }),
    ).toThrow("must use its policy mode");

    const userTheme = userThemeNodes("system", "light");
    const userSnapshot = userTheme.snapshot;
    const selectionControl = userSnapshot.selectionControl;
    if (userSnapshot.policy.kind !== "userControlled" || !selectionControl) {
      throw new Error("Expected user-controlled document-theme selection control.");
    }
    expect(() =>
      createMemoryPresentationHost({
        nodes: [
          {
            ...userTheme,
            snapshot: {
              ...userSnapshot,
              selectionControl: {
                ...selectionControl,
                options: selectionControl.options.map((option) => ({
                  ...option,
                  selectionIntent: { ...option.selectionIntent, themeId: "theme:other" },
                })),
              },
            },
          },
        ],
      }),
    ).toThrow("invalid mode-selection intent");
  });

  it("validates parent scopes, shell references, and active destinations", () => {
    const crossShellSectionReference = shellNavigationSectionReference(
      "shell:other",
      "shell-section:program",
    );
    const invalidScopeNodes: PresentationNodeSet = [
      {
        reference: shellReference,
        snapshot: {
          accessibilityLabel: "Formless Program application shell",
          activeDestination: null,
          id: shellReference.shellId,
          kind: "shellManifest",
          navigationSections: [crossShellSectionReference],
          title: "Formless Program",
          workspaceSwitcher: null,
        },
      },
      {
        reference: crossShellSectionReference,
        snapshot: shellSection({
          id: crossShellSectionReference.sectionId,
          shellId: crossShellSectionReference.shellId,
        }),
      },
    ];

    expect(() => createMemoryPresentationHost({ nodes: invalidScopeNodes })).toThrow(
      "invalid parent scope",
    );

    const invalidDestinationNodes = shellNodes().map((node) =>
      node.reference.kind === "shellManifestReference"
        ? {
            ...node,
            snapshot: {
              ...node.snapshot,
              activeDestination: {
                destinationId: "destination:missing",
                sectionId: programSectionReference.sectionId,
              },
            },
          }
        : node,
    ) as PresentationNodeSet;

    expect(() => createMemoryPresentationHost({ nodes: invalidDestinationNodes })).toThrow(
      "active destination",
    );
    expect(() =>
      createMemoryPresentationHost({
        nodes: shellNodes().filter(
          ({ reference }) => reference.kind !== "shellNavigationSectionReference",
        ),
      }),
    ).toThrow("has no snapshot");
  });

  it("validates the manifest workspace-switcher reference and section role", () => {
    const manifest: ShellManifestContract = {
      accessibilityLabel: "Formless Program application shell",
      activeDestination: null,
      id: shellReference.shellId,
      kind: "shellManifest",
      navigationSections: [workspaceSwitcherSectionReference],
      title: "Tasks",
      workspaceSwitcher: workspaceSwitcherSectionReference,
    };
    const section = shellSection({
      id: workspaceSwitcherSectionReference.sectionId,
      role: "workspaceSwitcher",
      shellId: shellReference.shellId,
    });
    const host = createMemoryPresentationHost({
      nodes: [
        { reference: shellReference, snapshot: manifest },
        { reference: workspaceSwitcherSectionReference, snapshot: section },
      ],
    });

    expect(host.read(workspaceSwitcherSectionReference)?.role).toBe("workspaceSwitcher");
    expect(() =>
      createMemoryPresentationHost({
        nodes: [
          { reference: shellReference, snapshot: { ...manifest, workspaceSwitcher: null } },
          { reference: workspaceSwitcherSectionReference, snapshot: section },
        ],
      }),
    ).toThrow("invalid workspace switcher");
  });

  it("publishes complete node sets transactionally and notifies only changed scopes", () => {
    const host = createMemoryPresentationHost({ nodes: workspaceNodes() });
    const initialWorkspace = host.read(workspaceReference);
    const initialTaskSection = host.read(taskSectionReference);
    const initialCompanyResult = host.read(companyResultReference);
    const calls: string[] = [];
    let companyLabelSeenFromTaskNotification: string | undefined;

    host.subscribe(workspaceReference, () => calls.push("workspace"));
    host.subscribe(taskSectionReference, () => calls.push("task-section"));
    host.subscribe(taskResultReference, () => {
      calls.push("task-result");
      companyLabelSeenFromTaskNotification = host.read(companyResultReference)?.accessibilityLabel;
    });
    host.subscribe(companyResultReference, () => calls.push("company-result"));

    host.publish(workspaceNodes());

    expect(calls).toEqual([]);
    expect(host.read(workspaceReference)).toBe(initialWorkspace);
    expect(host.read(taskSectionReference)).toBe(initialTaskSection);
    expect(host.read(companyResultReference)).toBe(initialCompanyResult);

    host.publish(
      workspaceNodes({
        companyResultLabel: "Companies updated",
        taskResultLabel: "Tasks updated",
      }),
    );

    expect(calls).toEqual(["task-result", "company-result"]);
    expect(companyLabelSeenFromTaskNotification).toBe("Companies updated");
    expect(host.read(workspaceReference)).toBe(initialWorkspace);
    expect(host.read(taskSectionReference)).toBe(initialTaskSection);
  });

  it("removes references atomically with their parent references", () => {
    const host = createMemoryPresentationHost({ nodes: workspaceNodes() });
    const calls: string[] = [];
    let removedResultVisibleFromWorkspaceNotification = true;

    host.subscribe(workspaceReference, () => {
      calls.push("workspace");
      removedResultVisibleFromWorkspaceNotification =
        host.read(companyResultReference) !== undefined;
    });
    host.subscribe(companySectionReference, () => calls.push("company-section"));
    host.subscribe(companyResultReference, () => calls.push("company-result"));

    host.publish(workspaceNodes({ includeCompanies: false }));

    expect(calls).toEqual(["workspace", "company-section", "company-result"]);
    expect(removedResultVisibleFromWorkspaceNotification).toBe(false);
    expect(host.read(companySectionReference)).toBeUndefined();
    expect(host.read(companyResultReference)).toBeUndefined();
  });

  it("rejects an incomplete next node set before replacing current reads", () => {
    const initialNodes = workspaceNodes();
    const host = createMemoryPresentationHost({ nodes: initialNodes });
    const initialWorkspace = host.read(workspaceReference);

    expect(() => host.publish(initialNodes.slice(0, -1))).toThrow("has no snapshot");
    expect(host.read(workspaceReference)).toBe(initialWorkspace);
    expect(host.read(companyResultReference)).toBeDefined();
  });

  it("keeps server snapshots stable through hydration and React subscriptions", async () => {
    const serverNodes = workspaceNodes();
    const host = createMemoryPresentationHost({
      nodes: workspaceNodes(),
      serverNodes,
    });
    const serverSnapshot = host.getServerSnapshot(workspaceReference);

    expect(host.read(workspaceReference)).toBe(serverSnapshot);
    expect(host.getServerSnapshot(workspaceReference)).toBe(serverSnapshot);

    const element = (
      <PresentationHostProvider host={host}>
        <WorkspaceLabel />
      </PresentationHostProvider>
    );
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(element);
    document.body.appendChild(container);
    const rendered = render(element, { container, hydrate: true });

    expect(container.textContent).toBe("Work");

    await act(async () => {
      host.publish(workspaceNodes({ workspaceLabel: "Client work" }));
    });

    expect(container.textContent).toBe("Client work");
    expect(host.getServerSnapshot(workspaceReference)).toBe(serverSnapshot);

    rendered.unmount();
    container.remove();
  });

  it("forwards generic presentation intents without reshaping them", async () => {
    const calls: PresentationIntent[] = [];
    const host = createMemoryPresentationHost({
      dispatch: (intent) => {
        calls.push(intent);
      },
      nodes: workspaceNodes(),
    });
    const intent = {
      collectionId: "collection:tasks",
      queryId: "query:active",
      screenId: "workspace:tasks",
      sectionId: "section:tasks",
      type: "workspaceQuerySelection",
    } satisfies PresentationIntent;

    await host.dispatch(intent);

    expect(calls).toEqual([intent]);
    expect(calls[0]).toBe(intent);
  });
});

function WorkspaceLabel() {
  const workspace = useWorkspaceManifest(workspaceReference);
  return <span>{workspace?.label}</span>;
}

function fixedThemeNodes(mode: "light" | "dark"): DocumentThemeNode {
  return {
    reference: themeReference,
    snapshot: {
      activeMode: mode,
      id: themeReference.themeId,
      kind: "documentTheme",
      policy: { kind: "fixed", mode },
    },
  };
}

function userThemeNodes(
  selectedMode: "system" | "light" | "dark",
  activeMode: "light" | "dark",
): DocumentThemeNode {
  const controlId = "control:theme-mode";
  const option = (mode: "system" | "light" | "dark", label: string) => ({
    label,
    mode,
    selectionIntent: {
      controlId,
      mode,
      themeId: themeReference.themeId,
      type: "documentThemeModeSelection" as const,
    },
  });

  return {
    reference: themeReference,
    snapshot: {
      activeMode,
      id: themeReference.themeId,
      kind: "documentTheme",
      policy: { kind: "userControlled" },
      selectionControl: {
        accessibilityLabel: "Theme mode",
        id: controlId,
        kind: "documentThemeSelectionControl",
        options: [option("system", "System"), option("light", "Light"), option("dark", "Dark")],
        selectedMode,
      },
    },
  };
}

function shellNodes({
  destinationLabel = "Tasks",
  includeStatus = true,
  syncMessage = "Local cache ready.",
  title = "Formless Program",
}: {
  destinationLabel?: string;
  includeStatus?: boolean;
  syncMessage?: string;
  title?: string;
} = {}): PresentationNodeSet {
  const navigationSections = includeStatus
    ? [programSectionReference, statusSectionReference, sessionSectionReference]
    : [programSectionReference, sessionSectionReference];
  const nodes: PresentationNodeSet = [
    {
      reference: shellReference,
      snapshot: {
        accessibilityLabel: "Formless Program application shell",
        activeDestination: {
          destinationId: "destination:tasks",
          sectionId: programSectionReference.sectionId,
        },
        id: shellReference.shellId,
        kind: "shellManifest",
        navigationSections,
        title,
        workspaceSwitcher: null,
      },
    },
    {
      reference: programSectionReference,
      snapshot: shellSection({
        destinations: [
          {
            accessibilityLabel: `${destinationLabel} screen`,
            availability: { available: true },
            countText: "0",
            href: "/tasks",
            id: "destination:tasks",
            kind: "shellLinkDestination",
            label: destinationLabel,
            selected: true,
          },
        ],
        icon: "archive",
        id: programSectionReference.sectionId,
        label: "Workflow",
        shellId: shellReference.shellId,
      }),
    },
    {
      reference: sessionSectionReference,
      snapshot: shellSection({
        id: sessionSectionReference.sectionId,
        role: "session",
        session: {
          id: "session:owner",
          identity: { displayName: "Ada Owner", secondaryLabel: "Owner" },
          kind: "shellSession",
          logout: shellButton("control:logout", "Log out"),
          state: "authenticated",
        },
        shellId: shellReference.shellId,
      }),
    },
  ];

  return includeStatus
    ? [
        ...nodes.slice(0, 2),
        {
          reference: statusSectionReference,
          snapshot: shellSection({
            id: statusSectionReference.sectionId,
            role: "status",
            status: {
              id: "status:tasks",
              kind: "shellStatus",
              sync: {
                id: "sync:tasks",
                kind: "shellSyncStatus",
                label: "Synced",
                message: syncMessage,
                state: "idle",
              },
              workspaceSave: {
                id: "workspace-save:tasks",
                kind: "shellWorkspaceSaveStatus",
                label: "Saved",
                message: "Workspace source is saved.",
                state: "saved",
              },
            },
            shellId: shellReference.shellId,
          }),
        },
        nodes[2]!,
      ]
    : nodes;
}

function shellSection({
  destinations = [],
  icon,
  id,
  label,
  role = "program",
  session,
  status,
  shellId,
}: {
  destinations?: ShellNavigationSectionContract["destinations"];
  icon?: ShellNavigationSectionContract["icon"];
  id: string;
  label?: string;
  role?: ShellNavigationSectionContract["role"];
  session?: ShellNavigationSectionContract["session"];
  status?: ShellNavigationSectionContract["status"];
  shellId: string;
}): ShellNavigationSectionContract {
  return {
    accessibilityLabel: `${id} navigation`,
    destinations,
    ...(icon === undefined ? {} : { icon }),
    id,
    kind: "shellNavigationSection",
    ...(label === undefined ? {} : { label }),
    role,
    ...(session === undefined ? {} : { session }),
    ...(status === undefined ? {} : { status }),
    shellId,
  };
}

function shellButton(
  id: string,
  label: string,
  prominence: "primary" | "secondary" | "quiet" = "secondary",
) {
  return {
    accessibilityLabel: label,
    content: { kind: "label" as const, label },
    density: "default" as const,
    id,
    kind: "button" as const,
    prominence,
    type: "button" as const,
  };
}

function workspaceNodes({
  companyResultLabel = "Companies",
  includeCompanies = true,
  taskResultLabel = "Tasks",
  taskResult,
  workspaceLabel = "Work",
}: {
  companyResultLabel?: string;
  includeCompanies?: boolean;
  taskResultLabel?: string;
  taskResult?: ListContract;
  workspaceLabel?: string;
} = {}): PresentationNodeSet {
  const sections = includeCompanies
    ? [taskSectionReference, companySectionReference]
    : [taskSectionReference];
  const nodes: PresentationNodeSet = [
    {
      reference: workspaceReference,
      snapshot: {
        accessibilityLabel: "Work workspace",
        actions: [],
        id: "workspace:tasks",
        kind: "workspaceManifest",
        label: workspaceLabel,
        sections,
        surface: "constrained",
        width: "standard",
      },
    },
    {
      reference: taskSectionReference,
      snapshot: sectionShell("section:tasks", "Tasks", "collection:tasks", taskResultReference),
    },
    {
      reference: taskResultReference,
      snapshot: taskResult ?? listResult("list:tasks", taskResultLabel),
    },
  ];

  return includeCompanies
    ? [
        ...nodes,
        {
          reference: companySectionReference,
          snapshot: sectionShell(
            "section:companies",
            "Companies",
            "collection:companies",
            companyResultReference,
          ),
        },
        {
          reference: companyResultReference,
          snapshot: listResult("list:companies", companyResultLabel),
        },
      ]
    : nodes;
}

function sectionShell(
  id: string,
  label: string,
  collectionId: string,
  result: typeof taskResultReference,
): WorkspaceSectionShellContract {
  return {
    accessibilityLabel: `${label} section`,
    actions: [],
    collection: {
      accessibilityLabel: `${label} collection`,
      availability: { state: "ready" },
      id: collectionId,
      kind: "workspaceCollection",
      label,
      presentation: {
        actions: {
          id: `${collectionId}:actions`,
          kind: "workspaceCollectionActions",
          primary: [],
          secondary: [],
          secondaryAccessibilityLabel: `${label} secondary actions`,
        },
        kind: "ordinary",
        result,
        summaries: [],
      },
      selectedQueryId: null,
    },
    headingVisibility: "visible",
    id,
    kind: "workspaceSectionShell",
    label,
  };
}

function listResult(id: string, accessibilityLabel: string): ListContract {
  return {
    accessibilityLabel,
    density: "default",
    editing: { applicability: "applicable", enabled: true },
    id,
    items: [],
    kind: "list",
  };
}

function tableResult(id: string): TableContract {
  return {
    accessibilityLabel: "Tasks table",
    columns: [],
    density: "default",
    editing: { enabled: true },
    id,
    kind: "table",
    rows: [],
  };
}

function recordResult(id: string): RecordResultContract {
  return {
    accessibilityLabel: "Task detail",
    actions: {
      id: `${id}:actions`,
      kind: "actionGroup",
      primary: [],
      secondary: [],
      secondaryAccessibilityLabel: "More task actions",
    },
    availability: { state: "ready" },
    density: "default",
    editing: { enabled: true },
    fields: [],
    id,
    kind: "recordResult",
    warnings: [],
  };
}
