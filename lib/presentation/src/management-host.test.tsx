import { describe, expect, it } from "vite-plus/test";
import type { ManagementManifestContract, ManagementReadyContract } from "./contract.ts";
import {
  createMemoryPresentationHost,
  managementManifestReference,
  workspaceManifestReference,
  type ManagementManifestNode,
  type PresentationNodeSet,
  type WorkspaceManifestNode,
} from "./host.ts";

const managementReference = managementManifestReference("management:instance");
const routesReference = workspaceManifestReference("workspace:routes");

describe("management memory Presentation Host", () => {
  it("reads loading, failed, and routes-only ready management snapshots", () => {
    const host = createMemoryPresentationHost({ nodes: [loadingNode()] });
    const loading: ManagementManifestContract | undefined = host.read(managementReference);

    expect(loading).toMatchObject({ message: "Loading instance settings...", state: "loading" });

    host.publish([failedNode()]);
    expect(host.read(managementReference)).toMatchObject({
      feedback: { intent: "danger" },
      state: "failed",
    });

    host.publish(readyNodes());
    expect(host.read(managementReference)).toMatchObject({
      state: "ready",
      workspaces: [{ role: "routes" }],
    });
    expect(host.read(routesReference)?.label).toBe("Routes");
  });

  it("validates the routes workspace reference", () => {
    expect(() => createMemoryPresentationHost({ nodes: [readyNode()] })).toThrow("has no snapshot");
  });
});

function readyNodes() {
  return [readyNode(), workspaceNode()] satisfies PresentationNodeSet;
}

function readyNode(): ManagementManifestNode & { snapshot: ManagementReadyContract } {
  return {
    reference: managementReference,
    snapshot: {
      accessibilityLabel: "Instance management",
      id: managementReference.managementId,
      kind: "managementManifest",
      state: "ready",
      title: "Instance Settings",
      workspaces: [{ reference: routesReference, role: "routes" }],
    },
  };
}

function loadingNode(): ManagementManifestNode {
  return {
    reference: managementReference,
    snapshot: {
      accessibilityLabel: "Instance management",
      id: managementReference.managementId,
      kind: "managementManifest",
      message: "Loading instance settings...",
      state: "loading",
      title: "Instance Settings",
    },
  };
}

function failedNode(): ManagementManifestNode {
  return {
    reference: managementReference,
    snapshot: {
      accessibilityLabel: "Instance management",
      feedback: {
        detail: "Instance settings could not be loaded.",
        id: "feedback:management-load",
        intent: "danger",
        kind: "managementFeedback",
        title: "Instance management unavailable",
      },
      id: managementReference.managementId,
      kind: "managementManifest",
      state: "failed",
      title: "Instance Settings",
    },
  };
}

function workspaceNode(): WorkspaceManifestNode {
  return {
    reference: routesReference,
    snapshot: {
      accessibilityLabel: "Routes workspace",
      actions: [],
      id: routesReference.workspaceId,
      kind: "workspaceManifest",
      label: "Routes",
      sections: [],
      width: "standard",
    },
  };
}
