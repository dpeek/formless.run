import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type {
  ButtonContract,
  ManagementIntent,
  ManagementManifestContract,
  ManagementReadyContract,
  ManagementWorkspaceOperationContract,
  WorkspaceContract,
} from "@dpeek/formless-presentation/contract";
import {
  createMemoryPresentationHost,
  managementManifestReference,
  workspaceManifestReference,
} from "@dpeek/formless-presentation/host";
import { PresentationHostProvider } from "@dpeek/formless-presentation/host/react";
import {
  AstryxManagementRenderer,
  AstryxSubscribedManagementRenderer,
  dispatchAstryxManagementWorkspaceOperationIntent,
} from "./management-renderer.tsx";

const managementReference = managementManifestReference("instance-management");
const routesReference = workspaceManifestReference("instance-management:routes");

describe("Astryx management renderer", () => {
  it("renders accessible loading and display-safe failure snapshots", () => {
    const loadingHtml = renderToStaticMarkup(
      <AstryxManagementRenderer
        manifest={managementManifest("loading")}
        onIntent={() => undefined}
        onWorkspaceIntent={() => undefined}
      />,
    );
    const failedHtml = renderToStaticMarkup(
      <AstryxManagementRenderer
        manifest={managementManifest("failed")}
        onIntent={() => undefined}
        onWorkspaceIntent={() => undefined}
      />,
    );

    expect(loadingHtml).toContain('data-formless-astryx-management-state="loading"');
    expect(loadingHtml).toContain("Loading Instance control plane...");
    expect(failedHtml).toContain('data-formless-astryx-management-state="failed"');
    expect(failedHtml).toContain("Could not read &lt;path&gt; with TOKEN=[redacted].");
    expect(failedHtml).not.toContain("owner-secret");
  });

  it("composes the routes workspace, Push progress, and authorization", () => {
    const html = renderToStaticMarkup(
      <AstryxManagementRenderer
        manifest={readyManifest()}
        onIntent={() => undefined}
        onWorkspaceIntent={() => undefined}
        workspaces={[routesWorkspace()]}
      />,
    );

    expect(html).toContain('data-formless-astryx-management-state="ready"');
    expect(html).toContain('aria-label="Routes"');
    expect(html).toContain(`data-formless-astryx-workspace="${routesReference.workspaceId}"`);
    expect(html).toContain('aria-label="Workspace Push"');
    expect(html).toContain('data-operation-progress="instance-management:push:progress"');
    expect(html).toContain("Cloudflare authorization");
  });

  it("subscribes to management and routes through one host", () => {
    const manifest = readyManifest({ workspaceOperation: undefined });
    const workspace = routesWorkspace();
    const host = createMemoryPresentationHost({
      nodes: [
        { reference: managementReference, snapshot: manifest },
        {
          reference: routesReference,
          snapshot: { ...workspace, kind: "workspaceManifest", sections: [] },
        },
      ],
    });
    const html = renderToStaticMarkup(
      <PresentationHostProvider host={host}>
        <AstryxSubscribedManagementRenderer managementReference={managementReference} />
      </PresentationHostProvider>,
    );

    expect(html).toContain(`data-formless-astryx-workspace="${routesReference.workspaceId}"`);
    expect(html).toContain("Routes workspace action");
  });

  it("dispatches the canonical workspace operation intent", async () => {
    const manifest = readyManifest();
    const operation = manifest.workspaceOperation!;
    const intents: ManagementIntent[] = [];

    await dispatchAstryxManagementWorkspaceOperationIntent(
      (intent) => {
        intents.push(intent);
      },
      manifest,
      operation,
      operation.control.trigger.intent,
    );

    expect(intents).toEqual([
      {
        controlId: operation.control.id,
        intent: operation.control.trigger.intent,
        managementId: manifest.id,
        operationId: operation.id,
        type: "managementWorkspaceOperation",
      },
    ]);
  });
});

function managementManifest(state: "failed" | "loading"): ManagementManifestContract {
  const base = {
    accessibilityLabel: "Instance settings overview",
    id: managementReference.managementId,
    kind: "managementManifest" as const,
    title: "Instance Settings",
  };

  return state === "loading"
    ? { ...base, message: "Loading Instance control plane...", state }
    : {
        ...base,
        feedback: {
          detail: "Could not read <path> with TOKEN=[redacted].",
          id: "instance-management:feedback:load",
          intent: "danger",
          kind: "managementFeedback",
          title: "Instance management unavailable",
        },
        state,
      };
}

function readyManifest(overrides: Partial<ManagementReadyContract> = {}): ManagementReadyContract {
  return {
    accessibilityLabel: "Instance settings overview",
    id: managementReference.managementId,
    kind: "managementManifest",
    state: "ready",
    title: "Instance Settings",
    workspaceOperation: workspaceOperation(),
    workspaces: [{ reference: routesReference, role: "routes" }],
    ...overrides,
  };
}

function workspaceOperation(): ManagementWorkspaceOperationContract {
  const controlId = "instance-management:workspace:push:control";
  const operationId = "instance-management:workspace:push";
  const promptId = "instance-management:workspace:push:authorization:event-1";

  return {
    authorizationPrompt: {
      action: button(`${promptId}:open`, "Open authorization"),
      id: promptId,
      intent: {
        controlId: `${promptId}:open`,
        managementId: managementReference.managementId,
        operationId,
        promptId,
        type: "managementAuthorizationOpen",
      },
      kind: "managementAuthorizationPrompt",
      title: "Cloudflare authorization",
    },
    control: {
      id: controlId,
      kind: "operationControl",
      progress: {
        id: "instance-management:push:progress",
        kind: "operationProgress",
        steps: [{ id: "push", label: "Push source", status: "running" }],
        title: "Pushing workspace",
        updatedAt: 1,
      },
      status: {
        accessibilityLabel: "Push pending",
        detail: "Push source",
        id: `${controlId}:status`,
        intent: "info",
        kind: "compactStatus",
        label: "Pushing workspace",
        status: "pending",
      },
      trigger: {
        ...button(controlId, "Push workspace"),
        disabled: true,
        intent: { controlId, invocationSource: "button", type: "operationInvoke" },
        prominence: "primary",
      },
    },
    id: operationId,
    kind: "managementWorkspaceOperation",
  };
}

function routesWorkspace(): WorkspaceContract {
  return {
    accessibilityLabel: "Routes workspace",
    actions: [
      {
        accessibilityLabel: "Routes workspace action",
        href: "/routes",
        id: "routes:link",
        kind: "workspaceLinkAction",
        label: "Routes workspace action",
        prominence: "secondary",
        target: "sameTab",
      },
    ],
    id: routesReference.workspaceId,
    kind: "workspace",
    label: "Routes",
    sections: [],
    width: "standard",
  };
}

function button(id: string, label: string): ButtonContract {
  return {
    accessibilityLabel: label,
    content: { kind: "label", label },
    density: "default",
    id,
    kind: "button",
    prominence: "secondary",
    type: "button",
  };
}
