// @vitest-environment jsdom

import { act, fireEvent, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type {
  ListContract,
  RecordResultContract,
  WorkspaceContract,
  WorkspaceIntent,
  WorkspaceSectionShellContract,
} from "@dpeek/formless-presentation/contract";
import {
  createMemoryPresentationHost,
  listResultReference,
  recordResultReference,
  workspaceManifestReference,
  workspaceSectionShellReference,
  isWorkspaceIntent,
  type PresentationNodeSet,
} from "@dpeek/formless-presentation/host";
import { PresentationHostProvider } from "@dpeek/formless-presentation/host/react";
import {
  AstryxSubscribedWorkspaceScreenRenderer,
  AstryxWorkspaceScreenRenderer,
} from "./workspace-screen-renderer.tsx";
(
  globalThis as {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;
const workspaceReference = workspaceManifestReference("workspace:tasks");
const taskSectionReference = workspaceSectionShellReference(
  workspaceReference.workspaceId,
  "section:tasks",
);
const companySectionReference = workspaceSectionShellReference(
  workspaceReference.workspaceId,
  "section:companies",
);
const taskResultReference = listResultReference({
  resultId: "list:tasks",
  role: "mainResult",
  sectionId: taskSectionReference.sectionId,
  workspaceId: workspaceReference.workspaceId,
});
const companyResultReference = listResultReference({
  resultId: "list:companies",
  role: "mainResult",
  sectionId: companySectionReference.sectionId,
  workspaceId: workspaceReference.workspaceId,
});
const contextResultReference = recordResultReference({
  resultId: "record:task-context",
  role: "contextResult",
  sectionId: taskSectionReference.sectionId,
  workspaceId: workspaceReference.workspaceId,
});

describe("subscribed Astryx workspace renderer", () => {
  it("composes separate main and context results and preserves direct snapshot rendering", () => {
    const host = createMemoryPresentationHost({ nodes: workspaceNodes() });
    const subscribedHtml = renderToStaticMarkup(
      <PresentationHostProvider host={host}>
        <AstryxSubscribedWorkspaceScreenRenderer reference={workspaceReference} />
      </PresentationHostProvider>,
    );
    const directHtml = renderToStaticMarkup(
      <AstryxWorkspaceScreenRenderer onIntent={() => undefined} workspace={completeWorkspace()} />,
    );

    for (const html of [subscribedHtml, directHtml]) {
      expect(html).toContain('data-formless-astryx-workspace="workspace:tasks"');
      expect(html).toContain('data-formless-record-result="record:task-context"');
      expect(html).toContain('aria-label="Tasks result"');
      expect(html.indexOf("Tasks section")).toBeLessThan(html.indexOf("Companies section"));
    }
  });

  it("dispatches intents and reflects published result, section, and structure updates", async () => {
    const tracked = createIntentHost(workspaceNodes());
    const { container, unmount } = render(
      <PresentationHostProvider host={tracked.host}>
        <AstryxSubscribedWorkspaceScreenRenderer reference={workspaceReference} />
      </PresentationHostProvider>,
    );

    const externalAction = container.querySelector<HTMLElement>(
      '[data-formless-astryx-workspace-external-action="action:install"]',
    );
    fireEvent.click(required(externalAction));

    expect(tracked.intents).toEqual([
      {
        actionId: "action:install",
        collectionId: "collection:tasks",
        controlId: "control:install",
        intent: { controlId: "control:install", invocationSource: "button" },
        screenId: workspaceReference.workspaceId,
        sectionId: taskSectionReference.sectionId,
        type: "workspaceExternalAction",
      },
    ]);

    await act(async () => {
      tracked.host.publish(workspaceNodes({ taskResultLabel: "Updated tasks result" }));
    });
    expect(container.querySelector('[aria-label="Updated tasks result"]')).not.toBeNull();

    await act(async () => {
      tracked.host.publish(workspaceNodes({ taskSectionLabel: "Updated tasks section" }));
    });
    expect(container.textContent).toContain("Updated tasks section");

    await act(async () => {
      tracked.host.publish(
        workspaceNodes({
          reverseSections: true,
          taskSectionLabel: "Updated tasks section",
        }),
      );
    });

    const rendered = container.textContent ?? "";
    expect(rendered.indexOf("Companies section")).toBeLessThan(
      rendered.indexOf("Updated tasks section"),
    );

    unmount();
  });
});

function workspaceNodes({
  reverseSections = false,
  taskResultLabel = "Tasks result",
  taskSectionLabel = "Tasks section",
}: {
  reverseSections?: boolean;
  taskResultLabel?: string;
  taskSectionLabel?: string;
} = {}): PresentationNodeSet {
  const sectionReferences = reverseSections
    ? [companySectionReference, taskSectionReference]
    : [taskSectionReference, companySectionReference];

  return [
    {
      reference: workspaceReference,
      snapshot: {
        accessibilityLabel: "Tasks workspace",
        actions: [],
        id: workspaceReference.workspaceId,
        kind: "workspaceManifest",
        label: "Tasks",
        sections: sectionReferences,
        width: "standard",
      },
    },
    {
      reference: taskSectionReference,
      snapshot: taskSection(taskSectionLabel),
    },
    {
      reference: taskResultReference,
      snapshot: listResult(taskResultReference.resultId, taskResultLabel),
    },
    {
      reference: contextResultReference,
      snapshot: recordResult(contextResultReference.resultId),
    },
    {
      reference: companySectionReference,
      snapshot: companySection(),
    },
    {
      reference: companyResultReference,
      snapshot: listResult(companyResultReference.resultId, "Companies result"),
    },
  ];
}

function required<Value>(value: Value): NonNullable<Value> {
  if (value === null || value === undefined) {
    throw new Error("Expected value.");
  }

  return value as NonNullable<Value>;
}

function taskSection(label: string): WorkspaceSectionShellContract {
  return {
    accessibilityLabel: label,
    actions: [
      {
        action: {
          accessibilityLabel: "Install app",
          id: "control:install",
          intent: "primary",
          invocationSource: "button",
          invoke: { controlId: "control:install", invocationSource: "button" },
          kind: "actionTrigger",
          label: "Install app",
        },
        id: "action:install",
        kind: "workspaceExternalAction",
      },
    ],
    collection: {
      accessibilityLabel: "Tasks collection",
      availability: { state: "ready" },
      id: "collection:tasks",
      kind: "workspaceCollection",
      label: "Tasks",
      presentation: {
        actions: emptyActions("collection:tasks"),
        context: {
          accessibilityLabel: "Project context",
          availability: { state: "ready" },
          id: "context:projects",
          kind: "workspaceContext",
          label: "Project",
          options: [],
          presentation: "singletonDetail",
        },
        contextDetail: contextResultReference,
        kind: "ordinary",
        result: taskResultReference,
        summaries: [],
      },
      selectedQueryId: null,
    },
    headingVisibility: "visible",
    id: taskSectionReference.sectionId,
    kind: "workspaceSectionShell",
    label,
  };
}

function companySection(): WorkspaceSectionShellContract {
  return {
    accessibilityLabel: "Companies section",
    actions: [],
    collection: {
      accessibilityLabel: "Companies collection",
      availability: { state: "ready" },
      id: "collection:companies",
      kind: "workspaceCollection",
      label: "Companies",
      presentation: {
        actions: emptyActions("collection:companies"),
        kind: "ordinary",
        result: companyResultReference,
        summaries: [],
      },
      selectedQueryId: null,
    },
    headingVisibility: "visible",
    id: companySectionReference.sectionId,
    kind: "workspaceSectionShell",
    label: "Companies section",
  };
}

function emptyActions(id: string) {
  return {
    id: `${id}:actions`,
    kind: "workspaceCollectionActions" as const,
    primary: [],
    secondary: [],
    secondaryAccessibilityLabel: `${id} secondary actions`,
  };
}

function listResult(id: string, accessibilityLabel: string): ListContract {
  return {
    accessibilityLabel,
    density: "default",
    editing: { enabled: true },
    id,
    items: [],
    kind: "list",
  };
}

function recordResult(id: string): RecordResultContract {
  return {
    accessibilityLabel: "Selected task context",
    actions: {
      id: `${id}:actions`,
      kind: "actionGroup",
      primary: [],
      secondary: [],
      secondaryAccessibilityLabel: "More context actions",
    },
    availability: { state: "ready" },
    density: "compact",
    editing: { enabled: true },
    fields: [],
    id,
    kind: "recordResult",
    warnings: [],
  };
}

function completeWorkspace(): WorkspaceContract {
  const task = taskSection("Tasks section");
  const company = companySection();

  if (
    task.collection.presentation.kind !== "ordinary" ||
    company.collection.presentation.kind !== "ordinary"
  ) {
    throw new Error("Expected ordinary workspace test sections.");
  }

  return {
    accessibilityLabel: "Tasks workspace",
    actions: [],
    id: workspaceReference.workspaceId,
    kind: "workspace",
    label: "Tasks",
    sections: [
      {
        ...task,
        collection: {
          ...task.collection,
          presentation: {
            actions: task.collection.presentation.actions,
            context: task.collection.presentation.context,
            contextDetail: recordResult(contextResultReference.resultId),
            kind: "ordinary",
            queryNavigation: task.collection.presentation.queryNavigation,
            result: listResult(taskResultReference.resultId, "Tasks result"),
            summaries: task.collection.presentation.summaries,
          },
        },
        kind: "workspaceSection",
      },
      {
        ...company,
        collection: {
          ...company.collection,
          presentation: {
            actions: company.collection.presentation.actions,
            context: company.collection.presentation.context,
            kind: "ordinary",
            queryNavigation: company.collection.presentation.queryNavigation,
            result: listResult(companyResultReference.resultId, "Companies result"),
            summaries: company.collection.presentation.summaries,
          },
        },
        kind: "workspaceSection",
      },
    ],
    width: "standard",
  };
}

function createIntentHost(nodes: PresentationNodeSet) {
  const intents: WorkspaceIntent[] = [];
  const host = createMemoryPresentationHost({
    dispatch: (intent) => {
      if (!isWorkspaceIntent(intent)) {
        throw new Error("Tracked workspace host received a shell intent.");
      }
      intents.push(intent);
    },
    nodes,
  });

  return { host, intents };
}
