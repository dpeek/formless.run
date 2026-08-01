import { describe, expect, it } from "vite-plus/test";

import type { AccountCompletionGateTarget } from "../shared/instance-auth.ts";
import {
  authenticatedOperationActorForAccess,
  resolveInstanceAuthAccess,
  validateCentralInstanceAuthAccess,
  validateHostSessionScope,
  type HostAuthSession,
  type InstanceAuthAccessReaders,
} from "./instance-auth-access.ts";
import type { CentralAuthSession } from "./central-auth-session.ts";
import type { InstanceAuthSessionTargetBinding } from "./instance-auth-state.ts";
import type { OwnerSession } from "./owner-session.ts";

const target: InstanceAuthSessionTargetBinding = {
  access: "authenticated",
  routeId: "route:tasks",
  targetOrigin: "https://tasks.example.com",
  targetProfile: "instance",
};
const accountTarget: AccountCompletionGateTarget = {
  ...target,
  returnTo: "/schema?view=board",
};
const centralSession: CentralAuthSession = {
  expiresAt: "2030-01-02T00:00:00.000Z",
  instanceId: "auth.example.com",
  issuedAt: "2030-01-01T00:00:00.000Z",
  principalId: "principal:central",
  sessionIdHash: "central-session-hash",
};
const ownerSession: OwnerSession = {
  expiresAt: "2030-01-02T00:00:00.000Z",
  instanceId: "local.example.com",
  issuedAt: "2030-01-01T00:00:00.000Z",
  principalId: "principal:owner",
};
const hostSession: HostAuthSession = {
  ...target,
  expiresAt: "2030-01-02T00:00:00.000Z",
  instanceId: "auth.example.com",
  issuedAt: "2030-01-01T00:00:00.000Z",
  principalId: "principal:host",
  sessionVersion: 3,
};

describe("instance auth access readers and decisions", () => {
  it("keeps central, local owner, and host-local session precedence", async () => {
    const centralReads: string[] = [];
    const central = await resolveInstanceAuthAccess(
      accessInput(),
      accessReaders({
        readCentralSession: async () => {
          centralReads.push("central");
          return {
            ok: true,
            ownerSessionFallbackAllowed: true,
            session: centralSession,
          };
        },
        readHostSession: async () => {
          centralReads.push("host");
          return { ok: true, session: hostSession };
        },
        readLocalOwnerSession: async () => {
          centralReads.push("owner");
          return { ok: true, session: ownerSession };
        },
      }),
    );

    expect(central).toMatchObject({ ok: true, via: "central-session" });
    expect(centralReads).toEqual(["central"]);

    const ownerReads: string[] = [];
    const localOwner = await resolveInstanceAuthAccess(
      { ...accessInput(), localOwnerSessionFallbackAllowed: true },
      accessReaders({
        readCentralSession: async () => {
          ownerReads.push("central");
          return {
            ok: false,
            ownerSessionFallbackAllowed: false,
            reason: "missing-cookie",
          };
        },
        readHostSession: async () => {
          ownerReads.push("host");
          return { ok: true, session: hostSession };
        },
        readLocalOwnerSession: async () => {
          ownerReads.push("owner");
          return { ok: true, session: ownerSession };
        },
      }),
    );

    expect(localOwner).toMatchObject({ ok: true, via: "owner-session" });
    expect(ownerReads).toEqual(["central", "owner"]);

    const hostReads: string[] = [];
    const host = await resolveInstanceAuthAccess(
      accessInput(),
      accessReaders({
        readCentralSession: async () => {
          hostReads.push("central");
          return {
            ok: false,
            ownerSessionFallbackAllowed: false,
            reason: "wrong-host",
          };
        },
        readHostSession: async () => {
          hostReads.push("host");
          return { ok: true, session: hostSession };
        },
        readLocalOwnerSession: async () => {
          hostReads.push("owner");
          return { ok: true, session: ownerSession };
        },
      }),
    );

    expect(host).toMatchObject({ ok: true, via: "host-session" });
    expect(hostReads).toEqual(["central", "host"]);
  });

  it("rejects missing or inactive principals and removed owner or management authority", async () => {
    await expect(
      resolveInstanceAuthAccess(
        { ...accessInput(), target: undefined },
        accessReaders({
          readActivePrincipal: async () => null,
          readCentralSession: async () => ({
            ok: true,
            ownerSessionFallbackAllowed: false,
            session: centralSession,
          }),
        }),
      ),
    ).resolves.toEqual({ ok: false, reason: "missing-principal" });

    const missingOwnerAuthority = await resolveInstanceAuthAccess(
      {
        localOwnerSessionFallbackAllowed: false,
        requiredAuthority: "owner",
      },
      accessReaders({
        readCentralSession: async () => ({
          ok: true,
          ownerSessionFallbackAllowed: false,
          session: centralSession,
        }),
        readOwnerAuthority: async () => null,
      }),
    );

    expect(missingOwnerAuthority).toMatchObject({
      authenticated: {
        principalId: centralSession.principalId,
        session: centralSession,
        via: "central-session",
      },
      ok: false,
      reason: "missing-owner-authority",
    });

    for (const authority of [
      null,
      {
        callerFacts: { active: true, kind: "principal" as const, owner: false },
        id: centralSession.principalId,
      },
      {
        callerFacts: {
          active: true,
          kind: "principal" as const,
          owner: false,
          roleId: "role_04144de6-7927-49f2-826a-cdcc70c47357" as const,
        },
        id: "principal:other",
      },
    ]) {
      const missingManagementAuthority = await resolveInstanceAuthAccess(
        {
          localOwnerSessionFallbackAllowed: false,
          requiredAuthority: "management",
        },
        accessReaders({
          readCentralSession: async () => ({
            ok: true,
            ownerSessionFallbackAllowed: false,
            session: centralSession,
          }),
          readManagementAuthority: async () => authority,
        }),
      );

      expect(missingManagementAuthority).toMatchObject({
        authenticated: {
          principalId: centralSession.principalId,
          session: centralSession,
          via: "central-session",
        },
        ok: false,
        reason: "missing-management-authority",
      });
    }

    for (const authority of [
      {
        callerFacts: {
          active: true,
          kind: "principal" as const,
          owner: false,
          roleId: "role_04144de6-7927-49f2-826a-cdcc70c47357" as const,
        },
        id: centralSession.principalId,
      },
      {
        callerFacts: { active: true, kind: "principal" as const, owner: true },
        id: centralSession.principalId,
      },
    ]) {
      await expect(
        resolveInstanceAuthAccess(
          {
            localOwnerSessionFallbackAllowed: false,
            requiredAuthority: "management",
          },
          accessReaders({
            readCentralSession: async () => ({
              ok: true,
              ownerSessionFallbackAllowed: false,
              session: centralSession,
            }),
            readManagementAuthority: async () => authority,
          }),
        ),
      ).resolves.toMatchObject({ ok: true, via: "central-session" });
    }
  });

  it("preserves central wrong-host errors and rejects revoked host-session versions", async () => {
    await expect(
      validateCentralInstanceAuthAccess(
        { requiredAuthority: "authenticated" },
        accessReaders({
          readCentralSession: async () => ({
            ok: false,
            ownerSessionFallbackAllowed: false,
            reason: "wrong-host",
          }),
        }),
      ),
    ).resolves.toEqual({
      ok: false,
      ownerSessionFallbackAllowed: false,
      reason: "wrong-host",
    });

    await expect(
      resolveInstanceAuthAccess(
        accessInput(),
        accessReaders({
          readHostSessionVersion: async () => hostSession.sessionVersion + 1,
        }),
      ),
    ).resolves.toEqual({ ok: false, reason: "revoked-session" });
  });

  it("combines current Program screen authority with the route access floor", async () => {
    const roleIds = {
      administrator: "role_04144de6-7927-49f2-826a-cdcc70c47357",
      editor: "role_3e6f3057-22bf-4fb0-8bd5-7b61bb0f45c4",
      member: "role_de3ae092-31a9-49df-b7f6-9f51f9403ff9",
    } as const;
    const centralReader = {
      readCentralSession: async () => ({
        ok: true as const,
        ownerSessionFallbackAllowed: false,
        session: centralSession,
      }),
    };
    const screenInput = {
      localOwnerSessionFallbackAllowed: false,
      programScreenAccess: { role: "administrator" } as const,
      requiredAuthority: "authenticated" as const,
    };

    for (const role of ["member", "editor"] as const) {
      await expect(
        resolveInstanceAuthAccess(
          screenInput,
          accessReaders({
            ...centralReader,
            readManagementAuthority: async (session) => ({
              callerFacts: {
                active: true,
                kind: "principal",
                owner: false,
                roleId: roleIds[role],
              },
              id: session.principalId,
            }),
          }),
        ),
      ).resolves.toMatchObject({
        authenticated: { principalId: centralSession.principalId },
        ok: false,
        reason: "missing-program-screen-authority",
      });
    }

    for (const callerFacts of [
      {
        active: true,
        kind: "principal" as const,
        owner: false,
        roleId: roleIds.administrator,
      },
      { active: true, kind: "principal" as const, owner: true },
    ]) {
      await expect(
        resolveInstanceAuthAccess(
          screenInput,
          accessReaders({
            ...centralReader,
            readManagementAuthority: async (session) => ({
              callerFacts,
              id: session.principalId,
            }),
          }),
        ),
      ).resolves.toMatchObject({
        ok: true,
        ownerAuthorized: callerFacts.owner,
        via: "central-session",
      });
    }

    await expect(
      resolveInstanceAuthAccess(
        { ...screenInput, requiredAuthority: "owner" },
        accessReaders({
          ...centralReader,
          readManagementAuthority: async (session) => ({
            callerFacts: {
              active: true,
              kind: "principal",
              owner: false,
              roleId: roleIds.administrator,
            },
            id: session.principalId,
          }),
          readOwnerAuthority: async () => null,
        }),
      ),
    ).resolves.toMatchObject({
      ok: false,
      reason: "missing-owner-authority",
    });

    let currentRole: keyof typeof roleIds = "administrator";
    const currentReaders = accessReaders({
      ...centralReader,
      readManagementAuthority: async (session) => ({
        callerFacts: {
          active: true,
          kind: "principal",
          owner: false,
          roleId: roleIds[currentRole],
        },
        id: session.principalId,
      }),
    });

    await expect(resolveInstanceAuthAccess(screenInput, currentReaders)).resolves.toMatchObject({
      ok: true,
    });
    currentRole = "member";
    await expect(resolveInstanceAuthAccess(screenInput, currentReaders)).resolves.toMatchObject({
      ok: false,
      reason: "missing-program-screen-authority",
    });
  });

  it("blocks current account gates and builds authenticated operation actor facts", async () => {
    const blocked = {
      gate: { kind: "email-verification" as const },
      status: "blocked" as const,
      target: accountTarget,
    };
    const result = await resolveInstanceAuthAccess(
      accessInput(),
      accessReaders({ readAccountCompletion: async () => blocked }),
    );

    expect(result).toMatchObject({
      accountCompletion: blocked,
      authenticated: {
        principalId: hostSession.principalId,
        session: hostSession,
        target,
        via: "host-session",
      },
      ok: false,
      reason: "account-completion-required",
    });

    expect(
      authenticatedOperationActorForAccess({
        principalId: hostSession.principalId,
        session: hostSession,
        target,
      }),
    ).toEqual({
      kind: "authenticated",
      principalId: hostSession.principalId,
      sessionTarget: {
        instanceId: "auth.example.com",
        routeId: "route:tasks",
        targetOrigin: "https://tasks.example.com",
        targetProfile: "instance",
      },
    });
    expect(
      authenticatedOperationActorForAccess({
        principalId: centralSession.principalId,
        session: centralSession,
      }),
    ).toBeUndefined();
  });

  it("matches host sessions only to the current instance, host, route, and profile", () => {
    expect(
      validateHostSessionScope(hostSession, {
        instanceId: hostSession.instanceId,
        requestOrigin: target.targetOrigin,
        target,
      }),
    ).toBeUndefined();
    expect(
      validateHostSessionScope(hostSession, {
        instanceId: "other.example.com",
        requestOrigin: target.targetOrigin,
        target,
      }),
    ).toBe("wrong-instance");

    for (const facts of [
      { requestOrigin: "https://other.example.com", target },
      { requestOrigin: target.targetOrigin, target: { ...target, routeId: "route:other" } },
      { requestOrigin: target.targetOrigin, target: { ...target, targetProfile: "public-site" } },
    ] satisfies Array<{
      requestOrigin: string;
      target: InstanceAuthSessionTargetBinding;
    }>) {
      expect(
        validateHostSessionScope(hostSession, {
          ...facts,
          instanceId: hostSession.instanceId,
        }),
      ).toBe("wrong-target");
    }
  });
});

function accessInput() {
  return {
    accountCompletionTarget: accountTarget,
    localOwnerSessionFallbackAllowed: false,
    requiredAuthority: "authenticated" as const,
    target,
  };
}

function accessReaders(
  overrides: Partial<InstanceAuthAccessReaders> = {},
): InstanceAuthAccessReaders {
  return {
    readAccountCompletion: async (_session, completionTarget) => ({
      continueTo: completionTarget.returnTo,
      status: "complete",
      target: completionTarget,
    }),
    readActivePrincipal: async (session) => ({
      displayName: "Active principal",
      id: session.principalId,
    }),
    readCentralSession: async () => ({
      ok: false,
      ownerSessionFallbackAllowed: false,
      reason: "missing-cookie",
    }),
    readHostSession: async () => ({ ok: true, session: hostSession }),
    readHostSessionVersion: async (session) => session.sessionVersion,
    readLocalOwnerSession: async () => ({ ok: false, reason: "missing-cookie" }),
    readManagementAuthority: async (session) => ({
      callerFacts: {
        active: true,
        kind: "principal",
        owner: false,
        roleId: "role_04144de6-7927-49f2-826a-cdcc70c47357",
      },
      id: session.principalId,
    }),
    readOwnerAuthority: async (session) => ({
      createdAt: "2030-01-01T00:00:00.000Z",
      email: "owner@example.com",
      id: session.principalId,
      name: "Owner",
    }),
    ...overrides,
  };
}
