import { describe, expect, it } from "vite-plus/test";
import type {
  ButtonContract,
  CreateFieldContract,
  ManagementInstallDialogContract,
  ManagementManifestContract,
  ManagementReadyContract,
} from "./contract.ts";
import {
  createMemoryPresentationHost,
  managementInstallDialogReference,
  managementManifestReference,
  shellManifestReference,
  workspaceManifestReference,
  type PresentationNodeSet,
  type ManagementInstallDialogNode,
  type ManagementManifestNode,
  type ShellManifestNode,
  type WorkspaceManifestNode,
} from "./host.ts";

const managementReference = managementManifestReference("management:instance");
const installDialogReference = managementInstallDialogReference(
  managementReference.managementId,
  "dialog:install-app",
);
const appsWorkspaceReference = workspaceManifestReference("workspace:apps");
const routesWorkspaceReference = workspaceManifestReference("workspace:routes");
const shellReference = shellManifestReference("shell:instance");

describe("management memory Presentation Host", () => {
  it("reads loading, failed, and ready management snapshots as one typed manifest", () => {
    const host = createMemoryPresentationHost({ nodes: [loadingManagementNode()] });
    const loading: ManagementManifestContract | undefined = host.read({
      ...managementReference,
    });

    expect(loading).toMatchObject({
      message: "Loading installed apps...",
      state: "loading",
    });

    host.publish([failedManagementNode()]);

    expect(host.read(managementReference)).toMatchObject({
      feedback: { intent: "danger" },
      state: "failed",
    });

    host.publish(readyManagementNodes());

    expect(host.read(managementReference)).toMatchObject({
      state: "ready",
      workspaces: [{ role: "apps" }, { role: "routes" }],
    });

    const manifest = readyManagementManifestNode();
    host.publish([
      {
        ...manifest,
        snapshot: {
          ...manifest.snapshot,
          workspaces: [manifest.snapshot.workspaces[0]],
        },
      },
      installDialogNode(),
      workspaceNode(appsWorkspaceReference, "Apps"),
    ]);

    expect(host.read(managementReference)).toMatchObject({
      state: "ready",
      workspaces: [{ role: "apps" }],
    });
  });

  it("provides typed management and install-dialog reads beside shell and workspace nodes", () => {
    const host = createMemoryPresentationHost({
      nodes: [...readyManagementNodes(), shellNode()],
    });
    const management: ManagementManifestContract | undefined = host.read({
      ...managementReference,
    });
    const dialog: ManagementInstallDialogContract | undefined = host.read({
      ...installDialogReference,
    });

    expect(management).toMatchObject({
      id: managementReference.managementId,
      state: "ready",
      title: "Instance Settings",
    });
    expect(dialog?.fields.installId.fieldName).toBe("installId");
    expect(dialog?.packageOptions.map(({ packageAppKey }) => packageAppKey)).toEqual([
      "site",
      "tasks",
    ]);
    expect(host.read(appsWorkspaceReference)?.label).toBe("Apps");
    expect(host.read(routesWorkspaceReference)?.label).toBe("Routes");
    expect(host.read(shellReference)?.title).toBe("Formless");
  });

  it("validates management identities, child references, workspace order, and embedded intents", () => {
    expect(() =>
      createMemoryPresentationHost({
        nodes: readyManagementNodes().filter(
          ({ reference }) => reference.kind !== "managementInstallDialogReference",
        ),
      }),
    ).toThrow("has no snapshot");

    expect(() =>
      createMemoryPresentationHost({
        nodes: readyManagementNodes().filter(
          ({ reference }) =>
            reference.kind !== "workspaceManifestReference" ||
            reference.workspaceId !== routesWorkspaceReference.workspaceId,
        ),
      }),
    ).toThrow("has no snapshot");

    const manifestNode = readyManagementManifestNode();
    expect(() =>
      createMemoryPresentationHost({
        nodes: [
          {
            ...manifestNode,
            snapshot: {
              ...manifestNode.snapshot,
              workspaces: [
                manifestNode.snapshot.workspaces[1],
                manifestNode.snapshot.workspaces[0],
              ],
            },
          } as unknown as ManagementManifestNode,
          installDialogNode(),
          workspaceNode(appsWorkspaceReference, "Apps"),
          workspaceNode(routesWorkspaceReference, "Routes"),
        ],
      }),
    ).toThrow("invalid workspace order");

    const dialogNode = installDialogNode();
    expect(() =>
      createMemoryPresentationHost({
        nodes: [
          {
            ...dialogNode,
            snapshot: {
              ...dialogNode.snapshot,
              packageOptions: dialogNode.snapshot.packageOptions.map((option) => ({
                ...option,
                selectionIntent: {
                  ...option.selectionIntent,
                  managementId: "management:other",
                },
              })),
            },
          },
        ],
      }),
    ).toThrow("invalid package-selection intent");
  });
});

function readyManagementNodes({ dialogOpen = false }: { dialogOpen?: boolean } = {}) {
  return [
    readyManagementManifestNode(),
    installDialogNode({ open: dialogOpen }),
    workspaceNode(appsWorkspaceReference, "Apps"),
    workspaceNode(routesWorkspaceReference, "Routes"),
  ] satisfies PresentationNodeSet;
}

function readyManagementManifestNode(): ManagementManifestNode & {
  snapshot: ManagementReadyContract;
} {
  const operationId = "operation:push";
  const operationControlId = "control:push";
  const promptId = "prompt:cloudflare-authorization";
  const authorizationControl = button("control:open-authorization", "Open authorization");

  return {
    reference: managementReference,
    snapshot: {
      accessibilityLabel: "Instance management",
      id: managementReference.managementId,
      installDialog: installDialogReference,
      kind: "managementManifest",
      state: "ready",
      title: "Instance Settings",
      workspaceOperation: {
        authorizationPrompt: {
          action: authorizationControl,
          detail: "Authorize Local Cloudflare to continue.",
          id: promptId,
          intent: {
            controlId: authorizationControl.id,
            managementId: managementReference.managementId,
            operationId,
            promptId,
            type: "managementAuthorizationOpen",
          },
          kind: "managementAuthorizationPrompt",
          title: "Cloudflare authorization",
        },
        control: {
          id: operationControlId,
          kind: "operationControl",
          status: {
            accessibilityLabel: "Push pending",
            detail: "Waiting for authorization.",
            id: "status:push",
            intent: "info",
            kind: "compactStatus",
            label: "Push pending",
            status: "pending",
          },
          trigger: {
            ...button(operationControlId, "Push", "primary"),
            intent: {
              controlId: operationControlId,
              invocationSource: "button",
              type: "operationInvoke",
            },
            prominence: "primary",
          },
        },
        id: operationId,
        kind: "managementWorkspaceOperation",
      },
      workspaces: [
        { reference: appsWorkspaceReference, role: "apps" },
        { reference: routesWorkspaceReference, role: "routes" },
      ],
    },
  };
}

function loadingManagementNode(): ManagementManifestNode {
  return {
    reference: managementReference,
    snapshot: {
      accessibilityLabel: "Instance management",
      id: managementReference.managementId,
      kind: "managementManifest",
      message: "Loading installed apps...",
      state: "loading",
      title: "Instance Settings",
    },
  };
}

function failedManagementNode(): ManagementManifestNode {
  return {
    reference: managementReference,
    snapshot: {
      accessibilityLabel: "Instance management",
      feedback: {
        detail: "Installed apps could not be loaded.",
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

function installDialogNode({ open = false }: { open?: boolean } = {}): ManagementInstallDialogNode {
  const packageField = createField("packageAppKey", "App type", "site");
  const submit = button("control:install-submit", "Install Site", "primary", "submit");
  const option = (id: string, label: string, selected: boolean) => ({
    description: `${label} app package.`,
    id,
    kind: "managementPackageOption" as const,
    label,
    packageAppKey: id.replace("package:", ""),
    selected,
    selectionIntent: {
      dialogId: installDialogReference.dialogId,
      fieldId: packageField.fieldId,
      managementId: managementReference.managementId,
      optionId: id,
      type: "managementInstallPackageSelection" as const,
    },
  });

  return {
    reference: installDialogReference,
    snapshot: {
      cancel: button("control:install-cancel", "Cancel"),
      closeIntent: {
        dialogId: installDialogReference.dialogId,
        managementId: managementReference.managementId,
        open: false,
        type: "managementInstallDialogOpenChange",
      },
      description: "Choose an app type, then set its instance label and install id.",
      errors: [],
      fields: {
        installId: createField("installId", "Install id", "site"),
        label: createField("label", "Label", "Site"),
        package: packageField,
      },
      id: installDialogReference.dialogId,
      kind: "managementInstallDialog",
      managementId: managementReference.managementId,
      open,
      packageOptions: [
        option("package:site", "Site", true),
        option("package:tasks", "Tasks", false),
      ],
      selectedPackageOptionId: "package:site",
      submit,
      submitIntent: {
        controlId: submit.id,
        dialogId: installDialogReference.dialogId,
        managementId: managementReference.managementId,
        type: "managementInstallSubmit",
      },
      title: "Install app",
    },
  };
}

function createField(fieldName: string, label: string, value: string): CreateFieldContract {
  const field = {
    label,
    required: true,
    type: "text" as const,
  } satisfies CreateFieldContract["field"];
  const control = {
    control: { inputType: "text" as const, kind: "input" as const },
    controlKind: "text" as const,
    createDefaultChecked: false,
    createDefaultValue: undefined,
    editor: "text" as const,
    field,
    inputAttributes: {},
    kind: "text" as const,
    label,
    required: true,
  } satisfies Extract<CreateFieldContract["control"], { kind: "text" }>;

  return {
    access: { canPatch: true, kind: "editable", writable: true },
    commit: "submit",
    control,
    density: "default",
    draftInput: { kind: "input", value },
    editor: "text",
    field,
    fieldId: `field:install:${fieldName}`,
    fieldName,
    label,
    labelVisibility: "visible",
    mode: "editor",
    required: true,
    surface: "create",
    value,
  };
}

function button(
  id: string,
  label: string,
  prominence: ButtonContract["prominence"] = "secondary",
  type: ButtonContract["type"] = "button",
): ButtonContract {
  return {
    accessibilityLabel: label,
    content: { kind: "label", label },
    density: "default",
    id,
    kind: "button",
    prominence,
    type,
  };
}

function workspaceNode(
  reference: typeof appsWorkspaceReference,
  label: string,
): WorkspaceManifestNode {
  return {
    reference,
    snapshot: {
      accessibilityLabel: `${label} workspace`,
      actions: [],
      id: reference.workspaceId,
      kind: "workspaceManifest",
      label,
      sections: [],
      width: "standard",
    },
  };
}

function shellNode(): ShellManifestNode {
  return {
    reference: shellReference,
    snapshot: {
      accessibilityLabel: "Formless application shell",
      activeDestination: null,
      id: shellReference.shellId,
      kind: "shellManifest",
      navigationSections: [],
      scope: "multiApp",
      title: "Formless",
    },
  };
}
