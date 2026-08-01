import { describe, expect, it } from "vite-plus/test";
import {
  operationPollsAutomatically,
  selectWorkspaceGatewayOperationControls,
} from "./instance-shell.tsx";
import type { WorkspaceGatewayOperation } from "@dpeek/formless-gateway/client";
import {
  workspaceBrowserOperationControlMetadata,
  workspaceOperationDefinitionForKind,
} from "@dpeek/formless-workspace";

describe("instance shell route view", () => {
  it("selects browser operation controls from gateway bindings and runtime capabilities", () => {
    expect(selectWorkspaceGatewayOperationControls().map((control) => control.kind)).toEqual([
      "check",
      "credentialSetup",
      "pull",
      "push",
      "save",
      "status",
    ]);
    expect(
      selectWorkspaceGatewayOperationControls().map(
        ({
          bootstrapAllowed,
          executionRequirements,
          inputFields,
          kind,
          label,
          mode,
          requiredCapability,
        }) => ({
          bootstrapAllowed,
          executionRequirements,
          inputFields,
          kind,
          label,
          mode,
          requiredCapability,
        }),
      ),
    ).toEqual(workspaceBrowserOperationControlMetadata());
    expect(
      selectWorkspaceGatewayOperationControls({ operationGroup: "workspace" }).map(
        (control) => control.kind,
      ),
    ).toEqual(["push"]);
    expect(
      selectWorkspaceGatewayOperationControls({
        runtime: { actor: "browser", capabilities: ["deployment-plan"] },
      }).map((control) => control.kind),
    ).toEqual([]);
  });

  it("builds browser operation requests from definition-declared gateway fields", () => {
    const controls = selectWorkspaceGatewayOperationControls();

    expect(Object.fromEntries(controls.map((control) => [control.kind, control.input]))).toEqual({
      check: { kind: "check" },
      credentialSetup: { kind: "credentialSetup", provider: "cloudflare" },
      pull: { dryRun: false, kind: "pull" },
      push: {
        dryRun: false,
        kind: "push",
      },
      save: { check: false, kind: "save" },
      status: { includeDeploymentStatus: false, kind: "status" },
    });

    for (const control of controls) {
      const definition = workspaceOperationDefinitionForKind(control.kind);

      if (!("gateway" in definition.bindings)) {
        throw new Error(`Expected gateway binding for ${control.kind}.`);
      }

      const allowedFields = new Set(["kind", ...definition.bindings.gateway.inputFields]);

      expect(control.bootstrapAllowed).toBe(definition.bindings.gateway.bootstrap);
      expect(Object.keys(control.input).every((key) => allowedFields.has(key))).toBe(true);
      expect(control.inputFields).toEqual(definition.bindings.gateway.inputFields);
      expect(control.label).toBe(definition.label);
      expect(control.mode).toBe(definition.mode);
      expect(control.requiredCapability).toBe(definition.requiredCapability);
      expect(Object.keys(control.input)).not.toContain("workspacePath");
      expect(Object.keys(control.input)).not.toContain("source");
    }

    expect(controls.map((control) => control.kind)).not.toContain("deploymentRefresh");
  });

  it("polls only queued or running workspace operations automatically", () => {
    expect(operationPollsAutomatically(workspaceOperation({ status: "queued" }))).toBe(true);
    expect(operationPollsAutomatically(workspaceOperation({ status: "running" }))).toBe(true);
    expect(operationPollsAutomatically(workspaceOperation({ status: "succeeded" }))).toBe(false);
    expect(operationPollsAutomatically(workspaceOperation({ status: "failed" }))).toBe(false);
  });
});

function workspaceOperation(
  overrides: Partial<WorkspaceGatewayOperation> = {},
): WorkspaceGatewayOperation {
  return {
    actor: "browser",
    createdAt: "2026-06-02T00:00:00.000Z",
    errors: [],
    events: [],
    id: "op_status_00000001",
    input: {},
    kind: "formless.workspaceOperation",
    logs: [],
    operation: "status",
    result: {
      summary: {
        fields: { initialized: true },
        title: "Workspace status",
      },
    },
    status: "succeeded",
    summary: {
      fields: { initialized: true },
      title: "Workspace status",
    },
    updatedAt: "2026-06-02T00:00:01.000Z",
    version: 1,
    workspace: { label: "personal-sites" },
    ...overrides,
  };
}
