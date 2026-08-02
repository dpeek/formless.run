import { describe, expect, it } from "vite-plus/test";
import type {
  PresentationIntent,
  PresentationIntentHandler,
} from "@dpeek/formless-presentation/contract";
import {
  shellManifestReference,
  workspaceManifestReference,
  isShellIntent,
  isWorkspaceIntent,
} from "@dpeek/formless-presentation/host";
import {
  createApplicationRuntimePublicationCoordinator,
  type ApplicationRuntimeContractPublication,
} from "./application-runtime-contract-host.tsx";

describe("application runtime contract publication coordinator", () => {
  it("composes shell and route-child nodes on one stable host with scoped identity reuse", () => {
    const shell = shellPublication("Formless");
    const workspace = workspacePublication("Workspace");
    const coordinator = createApplicationRuntimePublicationCoordinator([["shell", shell]]);
    const host = coordinator.host;
    const shellReference = shellManifestReference("application-shell");
    const workspaceReference = workspaceManifestReference("workspace:program");
    const initialShell = required(host.read(shellReference));
    const initialServerShell = required(host.getServerSnapshot(shellReference));
    const notifications = { shell: 0, workspace: 0 };

    expect(initialServerShell).toBe(initialShell);
    expect(host.getServerSnapshot(workspaceReference)).toBeUndefined();

    host.subscribe(shellReference, () => notifications.shell++);
    host.subscribe(workspaceReference, () => notifications.workspace++);

    coordinator.publish("route-child", workspace);

    expect(coordinator.host).toBe(host);
    expect(host.read(shellReference)).toBe(initialShell);
    expect(host.read(workspaceReference)).toMatchObject({
      id: "workspace:program",
      label: "Workspace",
    });
    expect(host.getServerSnapshot(workspaceReference)).toBeUndefined();
    expect(notifications).toEqual({ shell: 0, workspace: 1 });

    const initialWorkspace = required(host.read(workspaceReference));
    coordinator.publish("route-child", workspacePublication("Current workspace"));

    expect(host.read(shellReference)).toBe(initialShell);
    expect(host.read(workspaceReference)).not.toBe(initialWorkspace);
    expect(host.read(workspaceReference)).toMatchObject({ label: "Current workspace" });
    expect(notifications).toEqual({ shell: 0, workspace: 2 });

    coordinator.remove("route-child");

    expect(host.read(shellReference)).toBe(initialShell);
    expect(host.read(workspaceReference)).toBeUndefined();
    expect(notifications).toEqual({ shell: 0, workspace: 3 });
  });

  it("keeps initial route-child server snapshots stable for hydration", () => {
    const coordinator = createApplicationRuntimePublicationCoordinator([
      ["shell", shellPublication("Formless")],
      ["route-child", workspacePublication("Server workspace")],
    ]);
    const host = coordinator.host;
    const shellReference = shellManifestReference("application-shell");
    const workspaceReference = workspaceManifestReference("workspace:program");
    const serverShell = required(host.getServerSnapshot(shellReference));
    const serverWorkspace = required(host.getServerSnapshot(workspaceReference));
    let shellSeenFromWorkspaceNotification: unknown;

    host.subscribe(workspaceReference, () => {
      shellSeenFromWorkspaceNotification = host.read(shellReference);
    });

    coordinator.publish("route-child", workspacePublication("Client workspace"));

    expect(coordinator.host).toBe(host);
    expect(host.read(shellReference)).toBe(serverShell);
    expect(host.read(workspaceReference)?.label).toBe("Client workspace");
    expect(host.getServerSnapshot(shellReference)).toBe(serverShell);
    expect(host.getServerSnapshot(workspaceReference)).toBe(serverWorkspace);
    expect(shellSeenFromWorkspaceNotification).toBe(serverShell);
  });

  it("dispatches through the latest matching handler and removes it with its contributor", async () => {
    const calls: string[] = [];
    const coordinator = createApplicationRuntimePublicationCoordinator([
      [
        "shell",
        shellPublication("Formless", () => {
          calls.push("shell");
        }),
      ],
      [
        "workspace",
        workspacePublication("Workspace", () => {
          calls.push("workspace:initial");
        }),
      ],
    ]);
    const workspaceIntent = {
      collectionId: "workspace:program:section:records:collection:records",
      queryId: "all",
      screenId: "workspace:program",
      sectionId: "workspace:program:section:records",
      type: "workspaceQuerySelection",
    } as const;
    const shellIntent = {
      destinationId: "apps",
      recordId: "apps",
      sectionId: "instance",
      shellId: "application-shell",
      type: "shellRootRecordSelection",
    } as const;

    await coordinator.host.dispatch(workspaceIntent);
    coordinator.publish(
      "workspace",
      workspacePublication("Workspace", () => {
        calls.push("workspace:current");
      }),
    );
    await coordinator.host.dispatch(workspaceIntent);
    await coordinator.host.dispatch(shellIntent);

    expect(calls).toEqual(["workspace:initial", "workspace:current", "shell"]);

    coordinator.remove("workspace");
    expect(() => coordinator.host.dispatch(workspaceIntent)).toThrow(
      "Application runtime has no current handler for workspaceQuerySelection.",
    );
  });

  it("rejects an invalid combined graph without changing the current publication", () => {
    const coordinator = createApplicationRuntimePublicationCoordinator([
      ["shell", shellPublication("Formless")],
      ["workspace", workspacePublication("Workspace")],
    ]);
    const workspaceReference = workspaceManifestReference("workspace:program");
    const currentWorkspace = coordinator.host.read(workspaceReference);

    expect(() =>
      coordinator.publish("duplicate", workspacePublication("Duplicate workspace")),
    ).toThrow("Duplicate Formless UI contract reference");
    expect(coordinator.host.read(workspaceReference)).toBe(currentWorkspace);
  });
});

function shellPublication(
  title: string,
  dispatch: PresentationIntentHandler = () => undefined,
): ApplicationRuntimeContractPublication {
  const reference = shellManifestReference("application-shell");

  return {
    intentHandlers: [
      {
        dispatch,
        matches: (intent: PresentationIntent) =>
          isShellIntent(intent) && intent.shellId === reference.shellId,
      },
    ],
    nodes: [
      {
        reference,
        snapshot: {
          accessibilityLabel: "Application",
          activeDestination: null,
          id: reference.shellId,
          kind: "shellManifest",
          navigationSections: [],
          title,
          workspaceSwitcher: null,
        },
      },
    ],
  };
}

function workspacePublication(
  label: string,
  dispatch: PresentationIntentHandler = () => undefined,
): ApplicationRuntimeContractPublication {
  const reference = workspaceManifestReference("workspace:program");

  return {
    intentHandlers: [
      {
        dispatch,
        matches: (intent: PresentationIntent) =>
          isWorkspaceIntent(intent) && intent.screenId === reference.workspaceId,
      },
    ],
    nodes: [
      {
        reference,
        snapshot: {
          accessibilityLabel: "Program workspace",
          actions: [],
          id: reference.workspaceId,
          kind: "workspaceManifest",
          label,
          sections: [],
          width: "standard",
        },
      },
    ],
  };
}

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new Error("Expected value.");
  }
  return value;
}
