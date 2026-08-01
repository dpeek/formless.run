// @vitest-environment jsdom

import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import type {
  AccessManifestContract,
  AccessReadyContract,
} from "@dpeek/formless-presentation/contract";
import type { IdentityAccessManagementSummary } from "@dpeek/formless-identity-control-plane";
import {
  createApplicationRuntimePublicationCoordinator,
  ApplicationRuntimeContractHostProvider,
} from "../generated/application-runtime-contract-host.tsx";
import { IdentityAccessManagementApiError } from "../../client/identity-access-management.ts";
import {
  instanceAccessInvitationAuthoringReference,
  instanceAccessPersonRoleAuthoringReference,
  instanceAccessReference,
} from "./access-contract.ts";
import { AccessRoute, type AccessRouteDependencies } from "./access.tsx";
vi.mock("../application-presentation.tsx", () => ({ ApplicationPresentation: () => null }));
(
  globalThis as {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;
describe("access route runtime", () => {
  it("loads purpose-built summary state and publishes authorization failures", async () => {
    const ready = await mountAccessRoute({
      fetchSummary: async () => summary(),
    });
    expect(ready.manifest().state).toBe("ready");
    expect(ready.readyManifest().invitations[0]?.scope?.value).toBe("Instance");
    expect(JSON.stringify(ready.readyManifest())).not.toContain("Instance Settings");
    await ready.unmount();

    const unauthorized = await mountAccessRoute({
      fetchSummary: async () => {
        throw new IdentityAccessManagementApiError("Administrator authority is required.", {
          body: { error: "Administrator authority is required." },
          status: 403,
        });
      },
    });
    expect(unauthorized.manifest()).toMatchObject({
      feedback: { detail: "Administrator authority is required." },
      state: "unauthorized",
    });
    await unauthorized.unmount();
  });

  it("keeps invitation role selection atomic, refreshes, and deduplicates pending submit", async () => {
    const calls: unknown[] = [];
    let fetchCount = 0;
    const pending = deferred<void>();
    const runtime = await mountAccessRoute({
      createIdempotencyKey: (purpose) => `access:${purpose}:test`,
      createInvitation: async (input) => {
        calls.push(input);
        await pending.promise;
      },
      fetchSummary: async () => {
        fetchCount += 1;
        return summary();
      },
    });

    await runtime.dispatch(runtime.readyManifest().invite.intent);
    await runtime.dispatch({
      ...runtime.invitationAuthoring().fields.targetEmail.changeIntent,
      value: "new@example.com",
    });
    await runtime.dispatch({
      ...runtime.invitationAuthoring().fields.displayName.changeIntent,
      value: "New Person",
    });
    await runtime.dispatch({
      ...runtime.invitationAuthoring().roleSelection.changeIntent,
      selectedOptionIds: [
        "instance-access:role-option:program:program:administrator",
        "instance-access:role-option:instance:instance:instance.owner",
      ],
    });
    await runtime.dispatch({
      ...required(runtime.invitationAuthoring().fields.acceptanceTarget).changeIntent,
      value: "instance",
    });

    let submit: Promise<void> | undefined;
    await act(async () => {
      submit = Promise.resolve(runtime.host.dispatch(runtime.invitationAuthoring().submit.intent));
      await Promise.resolve();
    });
    expect(runtime.invitationAuthoring().pending).toEqual({
      isPending: true,
      label: "Sending invitation",
    });
    await runtime.dispatch(runtime.invitationAuthoring().submit.intent);
    expect(calls).toHaveLength(1);

    pending.resolve();
    await act(async () => {
      await submit;
    });
    expect(fetchCount).toBe(2);
    expect(calls[0]).toMatchObject({
      idempotencyKey: "access:invitation:test",
      invitedPrincipal: { displayName: "New Person" },
      roleAssignments: [
        { roleKey: "instance.owner", scopeKind: "instance" },
        { roleId: "role_04144de6-7927-49f2-826a-cdcc70c47357", scopeKind: "program" },
      ],
      targetEmail: "new@example.com",
      targetSurface: "instance",
    });
    expect(runtime.readyManifest().feedback).toMatchObject({ title: "Invitation created" });
    expect(runtime.invitationAuthoring().open).toBe(false);
    await runtime.unmount();
  });

  it("reveals invitation validation only after submit and blocks the invalid effect", async () => {
    const invitations: unknown[] = [];
    const runtime = await mountAccessRoute({
      createInvitation: async (input) => {
        invitations.push(input);
      },
      fetchSummary: async () => summary(),
    });

    await runtime.dispatch(runtime.readyManifest().invite.intent);
    const pristine = runtime.invitationAuthoring();
    expect(pristine.errors).toEqual([]);
    expect(pristine.fields.targetEmail.errors).toEqual([]);
    expect(pristine.fields.displayName.errors).toEqual([]);
    expect(pristine.roleSelection.errors).toEqual([]);
    expect(pristine.submit.control.disabled).not.toBe(true);

    await runtime.dispatch(pristine.submit.intent);

    const attempted = runtime.invitationAuthoring();
    expect(attempted.fields.targetEmail.errors).toEqual(["Email is required."]);
    expect(attempted.fields.displayName.errors).toEqual(["Name is required."]);
    expect(attempted.roleSelection.errors).toEqual(["Choose at least one role."]);
    expect(invitations).toEqual([]);
    await runtime.unmount();
  });

  it("runs person role replacement, person removal, and invitation deletion through exact confirmation", async () => {
    const replacements: unknown[] = [];
    const removals: unknown[] = [];
    const deletions: unknown[] = [];
    const runtime = await mountAccessRoute({
      createIdempotencyKey: (purpose) => `access:${purpose}:test`,
      deleteInvitation: async (input) => {
        deletions.push(input);
      },
      fetchSummary: async () => summary(),
      removePerson: async (input) => {
        removals.push(input);
      },
      replacePersonRoles: async (input) => {
        replacements.push(input);
      },
    });

    const boForRoles = required(runtime.readyManifest().people[1]);
    if (boForRoles.roleAuthoring.availability !== "available") {
      throw new Error("Expected role authoring.");
    }
    await runtime.dispatch(boForRoles.roleAuthoring.action.intent);
    const personAuthoring = runtime.personAuthoring("principal:bo");
    await runtime.dispatch({
      ...personAuthoring.roleSelection.changeIntent,
      selectedOptionIds: [],
    });
    await runtime.dispatch({
      ...runtime.personAuthoring("principal:bo").roleSelection.changeIntent,
      selectedOptionIds: ["instance-access:role-option:instance:instance:instance.owner"],
    });
    await runtime.dispatch(runtime.personAuthoring("principal:bo").save.intent);
    expect(replacements).toEqual([
      {
        idempotencyKey: "access:person-role:test",
        principalId: "principal:bo",
        roles: [{ roleKey: "instance.owner", scopeKind: "instance" }],
      },
    ]);
    expect(runtime.readyManifest().feedback).toMatchObject({ title: "Roles saved" });

    const bo = required(runtime.readyManifest().people[1]);
    if (bo.removal.availability !== "available") {
      throw new Error("Expected person removal.");
    }
    await runtime.dispatch(bo.removal.action.intent);
    expect(removals).toHaveLength(0);
    await runtime.dispatch(required(runtime.readyManifest().confirmation).action.intent);
    expect(removals).toEqual([
      {
        idempotencyKey: "access:person-removal:test",
        principalId: "principal:bo",
      },
    ]);

    const invitation = required(runtime.readyManifest().invitations[0]);
    if (invitation.deletion.availability !== "available") {
      throw new Error("Expected invitation deletion.");
    }
    await runtime.dispatch(invitation.deletion.action.intent);
    expect(deletions).toHaveLength(0);
    expect(runtime.readyManifest().confirmation).toMatchObject({
      invitationId: "invitation:lin",
      purpose: "invitation-deletion",
    });
    await runtime.dispatch(required(runtime.readyManifest().confirmation).action.intent);
    expect(deletions).toEqual([{ invitationId: "invitation:lin" }]);
    expect(runtime.readyManifest().feedback).toMatchObject({ title: "Invitation deleted" });
    await runtime.unmount();
  });
});

async function mountAccessRoute(dependencies: AccessRouteDependencies) {
  const coordinator = createApplicationRuntimePublicationCoordinator();
  let renderer!: ReturnType<typeof render>;
  await act(async () => {
    renderer = render(
      <ApplicationRuntimeContractHostProvider coordinator={coordinator}>
        <AccessRoute dependencies={dependencies} />
      </ApplicationRuntimeContractHostProvider>,
    );
  });

  return {
    dispatch: async (intent: Parameters<typeof coordinator.host.dispatch>[0]) => {
      await act(async () => {
        await coordinator.host.dispatch(intent);
      });
    },
    host: coordinator.host,
    invitationAuthoring: () =>
      required(coordinator.host.read(instanceAccessInvitationAuthoringReference)),
    manifest: () => required(coordinator.host.read(instanceAccessReference)),
    personAuthoring: (personId: string) =>
      required(coordinator.host.read(instanceAccessPersonRoleAuthoringReference(personId))),
    readyManifest: () => readyManifest(required(coordinator.host.read(instanceAccessReference))),
    unmount: async () => {
      renderer.unmount();
    },
  };
}

function summary(): IdentityAccessManagementSummary {
  return {
    groups: [],
    invitationGrantOptions: {
      authority: { instanceOwner: true, programAdministrator: false },
      memberships: [],
      roles: [
        {
          displayLabel: "Instance — Owner",
          roleKey: "instance.owner",
          scopeKind: "instance",
        },
        {
          displayLabel: "Program — Administrator",
          roleId: "role_04144de6-7927-49f2-826a-cdcc70c47357",
          roleKey: "administrator",
          scopeKind: "program",
        },
      ],
    },
    invitations: [
      {
        createdAt: "2026-07-16T00:00:00.000Z",
        expiresAt: "2026-07-30T00:00:00.000Z",
        invitationId: "invitation:lin",
        status: "pending",
        targetEmail: "lin@example.com",
        targetSurface: "instance",
        updatedAt: "2026-07-16T00:00:00.000Z",
      },
    ],
    memberships: [],
    organizations: [],
    people: [person("principal:ada", "Ada Owner"), person("principal:bo", "Bo Admin")],
    programRoles: [
      {
        createdAt: "2026-01-01T00:00:00.000Z",
        displayLabel: "Administrator",
        roleAssignmentId: "program-role-assignment:bo",
        roleId: "role_04144de6-7927-49f2-826a-cdcc70c47357",
        roleKey: "administrator",
        scopeKind: "program",
        status: "active",
        targetPrincipalId: "principal:bo",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    roles: [role("assignment:ada-owner", "principal:ada")],
  };
}

function person(principalId: string, displayName: string) {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    displayName,
    kind: "human" as const,
    principalId,
    status: "active" as const,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function role(roleAssignmentId: string, targetPrincipalId: string) {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    displayLabel: "instance.owner",
    roleAssignmentId,
    roleId: "role:instance.owner",
    roleKey: "instance.owner" as const,
    scopeKind: "instance" as const,
    status: "active" as const,
    targetKind: "principal" as const,
    targetPrincipalId,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function readyManifest(manifest: AccessManifestContract): AccessReadyContract {
  if (manifest.state !== "ready") {
    throw new Error("Expected ready access manifest.");
  }
  return manifest;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function required<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("Expected value.");
  }
  return value;
}
