import { describe, expect, it } from "vite-plus/test";
import type { WorkspaceGatewayPush } from "@dpeek/formless-gateway/client";
import { workspaceGatewayPushPolls, workspaceGatewayRouteFailureCode } from "./instance-shell.tsx";

describe("instance shell Push hydration", () => {
  it("reduces caught diagnostics to a route-owned failure code", () => {
    const code = workspaceGatewayRouteFailureCode(
      new Error("provider diagnostic alchemy-secret-value"),
    );

    expect(code).toBe("network-failure");
    expect(JSON.stringify(code)).not.toContain("alchemy-secret-value");
  });

  it("polls queued, running, and interaction-waiting Pushes only", () => {
    expect(workspaceGatewayPushPolls(push({ lifecycle: "queued" }))).toBe(true);
    expect(workspaceGatewayPushPolls(push({ lifecycle: "running" }))).toBe(true);
    expect(
      workspaceGatewayPushPolls({
        ...push({ lifecycle: "running" }),
        interaction: {
          choices: [{ id: "account-a", name: "Account A" }],
          expiresAt: "2026-08-04T00:05:00.000Z",
          id: "interaction_1234567890abcdef",
          kind: "account-selection",
          provider: "cloudflare",
        },
        lifecycle: "waiting-for-interaction",
      }),
    ).toBe(true);
    expect(
      workspaceGatewayPushPolls({
        ...push({ lifecycle: "running" }),
        lifecycle: "succeeded",
        outcome: "applied",
      }),
    ).toBe(false);
    expect(
      workspaceGatewayPushPolls({
        ...push({ lifecycle: "running" }),
        failureCode: "internal-failure",
        lifecycle: "failed",
      } as WorkspaceGatewayPush),
    ).toBe(false);
  });
});

function push(
  overrides: Partial<WorkspaceGatewayPush> & Pick<WorkspaceGatewayPush, "lifecycle">,
): WorkspaceGatewayPush {
  return {
    createdAt: "2026-08-04T00:00:00.000Z",
    id: "push_1234567890abcdef",
    mode: "apply",
    phases: [
      { id: "credentials", status: "pending" },
      { id: "account-selection", status: "pending" },
      { id: "desired-state-plan", status: "pending" },
      { id: "provider-reconciliation", status: "pending" },
      { id: "health-check", status: "pending" },
      { id: "owner-setup", status: "pending" },
      { id: "workspace-push-writeback", status: "pending" },
      { id: "observation-refresh", status: "pending" },
    ],
    updatedAt: "2026-08-04T00:00:00.000Z",
    ...overrides,
  } as WorkspaceGatewayPush;
}
