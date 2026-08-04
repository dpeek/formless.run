import { describe, expect, it } from "vite-plus/test";

import {
  WORKSPACE_GATEWAY_PUSH_PHASE_IDS,
  isWorkspaceGatewayPush,
  parseWorkspaceGatewayAccountSelectionInput,
  parseWorkspaceGatewayPushPath,
  parseWorkspaceGatewayPushStartInput,
  workspaceGatewayPushInteractionApiPath,
  workspaceGatewayPushStartIntent,
  type WorkspaceGatewayPush,
} from "./index.ts";

describe("Gateway Push contracts", () => {
  it("builds and parses only exact Push and interaction paths", () => {
    const pushId = "push_1234567890abcdef";
    const interactionId = "interaction_1234567890abcdef";
    const path = workspaceGatewayPushInteractionApiPath(pushId, interactionId);
    expect(path).toBe(`/api/formless/workspace/pushes/${pushId}/interactions/${interactionId}`);
    expect(parseWorkspaceGatewayPushPath(path)).toEqual({
      interactionId,
      kind: "interaction",
      pushId,
    });
    expect(parseWorkspaceGatewayPushPath("/api/formless/workspace/operations/x")).toBeUndefined();
  });

  it("accepts only mode and an optional normalized target alias", () => {
    expect(
      parseWorkspaceGatewayPushStartInput({ mode: "dry-run", targetAlias: "primary" }),
    ).toEqual({ input: { mode: "dry-run", targetAlias: "primary" }, ok: true });
    for (const body of [
      { dryRun: true, mode: "dry-run" },
      { force: true, mode: "apply" },
      { mode: "apply", workspacePath: "/tmp/workspace" },
      { accountId: "account", mode: "apply" },
      { mode: "plan" },
      { mode: "apply", targetAlias: "Not Normalized" },
    ]) {
      expect(parseWorkspaceGatewayPushStartInput(body)).toEqual({
        code: "invalid-request",
        ok: false,
      });
    }
  });

  it("accepts only exact account-selection input", () => {
    expect(
      parseWorkspaceGatewayAccountSelectionInput({
        accountId: "account_1",
        kind: "account-selection",
      }),
    ).toEqual({
      input: { accountId: "account_1", kind: "account-selection" },
      ok: true,
    });
    expect(
      parseWorkspaceGatewayAccountSelectionInput({
        accountId: "account_1",
        kind: "account-selection",
        token: "secret",
      }),
    ).toEqual({ code: "invalid-request", ok: false });
  });

  it("derives semantic Push requirements without exposing generic operation input", () => {
    expect(workspaceGatewayPushStartIntent({ mode: "dry-run" })).toMatchObject({
      executionRequirements: ["local-filesystem", "workspace-source-read", "remote-target"],
      kind: "push-start",
      requiredCapability: "workspace-source-sync",
    });
    expect(workspaceGatewayPushStartIntent({ mode: "apply" }).executionRequirements).toContain(
      "provider-credentials",
    );
  });

  it("validates closed ordered terminal Push state", () => {
    expect(isWorkspaceGatewayPush(push())).toBe(true);
    expect(isWorkspaceGatewayPush({ ...push(), outcome: "planned" })).toBe(false);
    expect(
      isWorkspaceGatewayPush({
        ...push(),
        phases: WORKSPACE_GATEWAY_PUSH_PHASE_IDS.map((id, index) => ({
          id,
          status: index === 0 ? "pending" : "succeeded",
        })),
      }),
    ).toBe(false);
    expect(isWorkspaceGatewayPush({ ...push(), diagnostics: { path: "/tmp/secret" } })).toBe(false);
  });
});

function push(): WorkspaceGatewayPush {
  return {
    createdAt: "2026-08-04T00:00:00.000Z",
    id: "push_1234567890abcdef",
    lifecycle: "succeeded",
    mode: "apply",
    outcome: "applied",
    phases: WORKSPACE_GATEWAY_PUSH_PHASE_IDS.map((id) => ({ id, status: "succeeded" })),
    updatedAt: "2026-08-04T00:00:01.000Z",
  };
}
