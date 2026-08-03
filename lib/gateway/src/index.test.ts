import { describe, expect, it } from "vite-plus/test";

import {
  WORKSPACE_OPERATION_CAPABILITIES,
  workspaceOperationDefinitionForGatewayRequestKind,
  workspaceOperationDefinitionForKind,
  workspaceOperationGatewayAllowedRequestFields,
} from "@dpeek/formless-workspace";
import {
  WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH,
  WORKSPACE_GATEWAY_BOOTSTRAP_OPERATION_KINDS,
  WORKSPACE_GATEWAY_OPERATION_KINDS,
  WORKSPACE_GATEWAY_OPERATIONS_API_PATH,
  isWorkspaceGatewayBootstrapOperationKind,
  isWorkspaceGatewayMutatingStartOperationKind,
  isWorkspaceGatewayOperationKind,
  parseWorkspaceGatewayOperationId,
  parseWorkspaceGatewayAutoSaveEnqueueInput,
  workspaceGatewayAutoSaveApiPath,
  workspaceGatewayAutoSaveEnqueueIntent,
  parseWorkspaceGatewayStartInput,
  workspaceGatewayOperationPath,
  workspaceGatewayReadOperationIntent,
  workspaceGatewayOperationExecutionDecision,
  workspaceGatewayStartOperationIntent,
} from "./index.ts";

describe("Gateway runtime-neutral contracts", () => {
  it("uses the Workspace semantic operation allowlist", () => {
    expect(WORKSPACE_GATEWAY_OPERATION_KINDS).toEqual([
      "check",
      "credentialSetup",
      "pull",
      "push",
      "save",
      "status",
    ]);
    expect(WORKSPACE_GATEWAY_BOOTSTRAP_OPERATION_KINDS).toEqual(["status"]);
    expect(isWorkspaceGatewayOperationKind("deployApply")).toBe(false);
    expect(isWorkspaceGatewayOperationKind("deployPlan")).toBe(false);
    expect(isWorkspaceGatewayOperationKind("deploymentRefresh")).toBe(false);
    expect(isWorkspaceGatewayOperationKind("init")).toBe(false);
    expect(isWorkspaceGatewayOperationKind("cleanup")).toBe(false);
    expect(workspaceOperationDefinitionForGatewayRequestKind("save").handlerKey).toBe(
      "workspace.source.save",
    );
    expect(workspaceOperationGatewayAllowedRequestFields("save")).toEqual([
      "kind",
      "operation",
      "check",
    ]);
  });

  it("parses operation start input without accepting filesystem, shell, or secret fields", () => {
    expect(parseWorkspaceGatewayStartInput({ kind: "save" })).toEqual({
      input: { check: false, kind: "save" },
      ok: true,
    });
    expect(parseWorkspaceGatewayStartInput({ check: true, operation: "save" })).toEqual({
      input: { check: true, kind: "save" },
      ok: true,
    });
    expect(parseWorkspaceGatewayStartInput({ kind: "push" })).toEqual({
      input: {
        dryRun: false,
        kind: "push",
        targetAlias: undefined,
      },
      ok: true,
    });
    expect(parseWorkspaceGatewayStartInput({ dryRun: true, kind: "pull" })).toEqual({
      input: { dryRun: true, kind: "pull", targetAlias: undefined },
      ok: true,
    });
    expect(
      parseWorkspaceGatewayStartInput({ kind: "credentialSetup", provider: "cloudflare" }),
    ).toEqual({
      input: {
        accountId: undefined,
        kind: "credentialSetup",
        profileLabel: undefined,
        provider: "cloudflare",
      },
      ok: true,
    });
    expect(parseWorkspaceGatewayStartInput({ kind: "status" })).toEqual({
      input: { includeDeploymentStatus: false, kind: "status", targetAlias: undefined },
      ok: true,
    });
    expect(parseWorkspaceGatewayStartInput({ kind: "deployPlan" })).toEqual({
      error: 'Workspace gateway operation "deployPlan" is not supported.',
      ok: false,
    });
    expect(parseWorkspaceGatewayStartInput({ kind: "deployApply" })).toEqual({
      error: 'Workspace gateway operation "deployApply" is not supported.',
      ok: false,
    });
    expect(parseWorkspaceGatewayStartInput({ kind: "deploymentRefresh" })).toEqual({
      error: 'Workspace gateway operation "deploymentRefresh" is not supported.',
      ok: false,
    });
    expect(parseWorkspaceGatewayStartInput({ allowStale: true, kind: "push" })).toEqual({
      error: 'Workspace gateway operation "push" does not allow field "allowStale".',
      ok: false,
    });
    expect(parseWorkspaceGatewayStartInput({ kind: "push", replaceInstallSet: true })).toEqual({
      error: 'Workspace gateway operation "push" does not allow field "replaceInstallSet".',
      ok: false,
    });
    expect(
      parseWorkspaceGatewayStartInput({ kind: "status", workspacePath: "../outside" }),
    ).toEqual({
      error: 'Workspace gateway request includes forbidden key "workspacePath".',
      ok: false,
    });
    expect(
      parseWorkspaceGatewayStartInput({ command: "rm -rf /tmp/workspace", kind: "status" }),
    ).toEqual({
      error: 'Workspace gateway request includes forbidden key "command".',
      ok: false,
    });
    expect(parseWorkspaceGatewayStartInput({ kind: "status", rawProviderState: "hidden" })).toEqual(
      {
        error: 'Workspace gateway request includes forbidden key "rawProviderState".',
        ok: false,
      },
    );
    expect(parseWorkspaceGatewayStartInput({ kind: "status", name: "TOKEN=secret" })).toEqual({
      error: "Workspace gateway request.name includes secret-looking text.",
      ok: false,
    });
    expect(parseWorkspaceGatewayStartInput({ kind: "save", source: "browser" })).toEqual({
      error: 'Workspace gateway operation "save" does not allow field "source".',
      ok: false,
    });
    expect("gateway" in workspaceOperationDefinitionForKind("init").bindings).toBe(false);
    expect(parseWorkspaceGatewayStartInput({ kind: "init", name: "workspace" })).toEqual({
      error: 'Workspace gateway operation "init" is not supported.',
      ok: false,
    });
    expect(parseWorkspaceGatewayStartInput({ kind: "cleanup" })).toEqual({
      error: 'Workspace gateway operation "cleanup" is not supported.',
      ok: false,
    });
  });

  it("parses operation ids and operation read paths", () => {
    expect(parseWorkspaceGatewayOperationId("op_status_00000001")).toEqual({
      ok: true,
      operationId: "op_status_00000001",
    });
    expect(parseWorkspaceGatewayOperationId("op.a-b_123")).toEqual({
      ok: true,
      operationId: "op.a-b_123",
    });
    expect(parseWorkspaceGatewayOperationId("ab")).toEqual({
      error: "Workspace operation id is invalid.",
      ok: false,
    });
    expect(parseWorkspaceGatewayOperationId("..%2Fsecret")).toEqual({
      error: "Workspace operation id is invalid.",
      ok: false,
    });
    expect(
      workspaceGatewayOperationPath(`${WORKSPACE_GATEWAY_OPERATIONS_API_PATH}/op_status_00000001`),
    ).toEqual({
      operationId: "op_status_00000001",
      progress: false,
    });
    expect(
      workspaceGatewayOperationPath(
        `${WORKSPACE_GATEWAY_OPERATIONS_API_PATH}/op_status_00000001/progress`,
      ),
    ).toEqual({ operationId: "op_status_00000001", progress: true });
    expect(
      workspaceGatewayOperationPath(
        `${WORKSPACE_GATEWAY_OPERATIONS_API_PATH}/op_status_00000001/events`,
      ),
    ).toBeUndefined();
  });

  it("parses auto-save enqueue input without filesystem, shell, or secret fields", () => {
    expect(workspaceGatewayAutoSaveApiPath()).toBe(WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH);
    expect(workspaceGatewayAutoSaveApiPath("/local/workspace/")).toBe("/local/workspace/auto-save");
    expect(
      parseWorkspaceGatewayAutoSaveEnqueueInput({
        source: "control-plane-write",
      }),
    ).toEqual({
      input: { source: "control-plane-write" },
      ok: true,
    });
    expect(parseWorkspaceGatewayAutoSaveEnqueueInput({ source: "raw-upload" })).toEqual({
      error: "Workspace auto-save write source is invalid.",
      ok: false,
    });
    expect(
      parseWorkspaceGatewayAutoSaveEnqueueInput({
        path: "/Users/dpeek/workspace",
        source: "schema-save",
      }),
    ).toEqual({
      error: 'Workspace gateway request includes forbidden key "path".',
      ok: false,
    });
    expect(
      parseWorkspaceGatewayAutoSaveEnqueueInput({
        source: "schema-save",
        token: "secret",
      }),
    ).toEqual({
      error: 'Workspace gateway request includes forbidden key "token".',
      ok: false,
    });
    expect(
      parseWorkspaceGatewayAutoSaveEnqueueInput({
        extra: true,
        source: "schema-save",
      }),
    ).toEqual({
      error: 'Workspace auto-save enqueue does not allow field "extra".',
      ok: false,
    });
  });

  it("classifies bootstrap-limited and mutating operation intent", () => {
    expect(isWorkspaceGatewayBootstrapOperationKind("status")).toBe(true);
    expect(isWorkspaceGatewayBootstrapOperationKind("save")).toBe(false);

    expect(isWorkspaceGatewayMutatingStartOperationKind("status")).toBe(false);
    for (const operation of WORKSPACE_GATEWAY_OPERATION_KINDS.filter((kind) => kind !== "status")) {
      expect(isWorkspaceGatewayMutatingStartOperationKind(operation)).toBe(true);
    }

    expect(workspaceGatewayStartOperationIntent({ kind: "status" })).toEqual({
      bootstrapAllowed: true,
      executionRequirements: ["local-filesystem", "workspace-source-read"],
      mutating: false,
      operation: "status",
      requiredCapability: "workspace-read",
    });
    expect(workspaceGatewayStartOperationIntent({ check: true, kind: "save" })).toEqual({
      bootstrapAllowed: false,
      executionRequirements: [
        "local-filesystem",
        "workspace-source-read",
        "workspace-source-write",
        "local-authority",
      ],
      mutating: true,
      operation: "save",
      requiredCapability: "workspace-source-write",
    });
    expect(workspaceGatewayStartOperationIntent({ dryRun: true, kind: "push" })).toMatchObject({
      executionRequirements: ["local-filesystem", "workspace-source-read", "remote-target"],
    });
    expect(workspaceGatewayStartOperationIntent({ kind: "push" })).toMatchObject({
      executionRequirements: [
        "local-filesystem",
        "workspace-source-read",
        "remote-target",
        "admin-token",
        "provider-credentials",
        "workspace-source-write",
      ],
    });
    expect(workspaceGatewayReadOperationIntent("status")).toEqual({
      bootstrapAllowed: true,
      executionRequirements: ["local-filesystem", "workspace-source-read"],
      mutating: false,
      operation: "status",
      requiredCapability: "workspace-read",
    });
    expect(workspaceGatewayAutoSaveEnqueueIntent()).toEqual({
      bootstrapAllowed: false,
      executionRequirements: [
        "local-filesystem",
        "workspace-source-read",
        "workspace-source-write",
        "local-authority",
      ],
      mutating: true,
      operation: "save",
      requiredCapability: "workspace-source-write",
    });
    expect(
      workspaceGatewayOperationExecutionDecision({
        actor: "browser",
        capabilities: WORKSPACE_OPERATION_CAPABILITIES,
        intent: {
          ...workspaceGatewayStartOperationIntent({ kind: "push" }),
          executionRequirements: ["local-filesystem", "workspace-source-read", "remote-target"],
        },
        operationInput: { kind: "push" },
      }),
    ).toEqual({ error: "Workspace gateway operation intent is invalid.", ok: false });
  });
});
