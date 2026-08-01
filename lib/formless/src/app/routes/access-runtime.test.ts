import { describe, expect, it } from "vite-plus/test";
import type { AccessReadyContract } from "@dpeek/formless-presentation/contract";
import type { IdentityAccessManagementSummary } from "@dpeek/formless-identity-control-plane";
import { createApplicationRuntimePublicationCoordinator } from "../generated/application-runtime-contract-host.tsx";
import {
  createInitialAccessPersonRoleDraft,
  dispatchAccessIntent,
  projectAccess,
  resolveAccessIntent,
  type AccessIntentActions,
  type AccessInvitationDraft,
  type ProjectAccessOptions,
} from "./access-projection.ts";
import {
  createAccessRuntimePublicationController,
  prepareAccessRuntimePublication,
} from "./access-runtime.ts";
import {
  initialInstanceAccessRuntimeContribution,
  instanceAccessInvitationAuthoringReference,
  instanceAccessPersonRoleAuthoringReference,
  instanceAccessReference,
} from "./access-contract.ts";

describe("access projection", () => {
  it("projects display-safe states and exact flat role choices", () => {
    expect(projectAccess(input({ state: { status: "loading" } })).manifest).toMatchObject({
      state: "loading",
      title: "Access",
    });
    expect(
      projectAccess(
        input({
          state: {
            message: "Denied with owner-setup-token raw-owner-secret",
            status: "unauthorized",
          },
        }),
      ).manifest,
    ).toMatchObject({
      feedback: { detail: "Denied with owner-setup-token [redacted]" },
      state: "unauthorized",
    });

    const authoring = required(projectAccess(input()).authoring);
    expect(authoring.roleSelection.options.map(({ label }) => label)).toEqual([
      "Instance — Owner",
      "Program — Administrator",
    ]);
    expect(authoring.roleSelection.options.map(({ surfaceId }) => surfaceId)).toEqual([
      "instance",
      "program",
    ]);

    const selected = required(
      projectAccess(
        input({
          draft: {
            ...validDraft(),
            acceptanceTargetId: "instance",
            roleOptionIds: [roleOptionId("instance", "instance", "instance.owner")],
          },
        }),
      ).authoring,
    );
    expect(selected.roleSelection.options.map(({ label }) => label)).toEqual([
      "Instance — Owner",
      "Program — Administrator",
    ]);
    expect(selected.fields.acceptanceTarget).toBeUndefined();
  });

  it("projects multi-surface acceptance target, people controls, and pending feedback", () => {
    const projection = projectAccess(
      input({
        authoringOpen: true,
        draft: selectedDraft(),
        invitationDeletion: { invitationId: "invitation:lin", status: "submitting" },
        submission: { status: "submitting" },
      }),
    );
    const authoring = required(projection.authoring);
    const manifest = readyManifest(projection);
    const ada = required(manifest.people[0]);

    expect(authoring.fields.acceptanceTarget).toMatchObject({
      options: [
        { label: "Instance", value: "instance" },
        { label: "Program", value: "program" },
      ],
      value: "instance",
    });
    expect(authoring.pending).toEqual({ isPending: true, label: "Sending invitation" });
    expect(authoring.roleSelection.disabledReason).toBe("Invitation creation is in progress.");
    expect(ada).toMatchObject({
      removal: {
        availability: "unavailable",
        control: {
          content: { kind: "label", label: "Remove person" },
          disabled: true,
          disabledReason: "The last active owner cannot be removed.",
        },
        disabledReason: "The last active owner cannot be removed.",
      },
      roleAuthoring: { availability: "available" },
    });
    expect(manifest.invitations[0]?.deletion).toMatchObject({
      action: { control: { disabled: true } },
      availability: "available",
    });
    expect(JSON.stringify(projection)).not.toContain("raw-owner-secret");
  });

  it("projects person role authoring from currently editable exact selections", () => {
    const summary = populatedSummary();
    const draft = createInitialAccessPersonRoleDraft(summary, "principal:ada");
    const projection = projectAccess(input({ personAuthoringDraft: draft, summary }));
    const authoring = required(projection.personAuthoring);
    const manifest = readyManifest(projection);

    expect(authoring).toMatchObject({
      displayName: "Ada Owner",
      personId: "principal:ada",
      roleSelection: {
        selectedOptionIds: [roleOptionId("instance", "instance", "instance.owner")],
      },
    });
    expect(authoring.roleSelection.options.map(({ label }) => label)).toEqual([
      "Instance — Owner",
      "Program — Administrator",
    ]);
    expect(manifest.personAuthoring).toEqual(
      instanceAccessPersonRoleAuthoringReference("principal:ada"),
    );

    const adminProjection = projectAccess(input({ summary: populatedSummary({ owner: false }) }));
    const adminOwner = required(readyManifest(adminProjection).people[0]);
    expect(adminOwner.removal).toMatchObject({
      availability: "unavailable",
      control: {
        content: { kind: "label", label: "Remove person" },
        disabled: true,
        disabledReason: "Program administrators cannot remove an owner.",
      },
      disabledReason: "Program administrators cannot remove an owner.",
    });
  });
});

describe("access intent resolution", () => {
  it("replaces role selections atomically and constructs an exact multi-surface invitation", async () => {
    const options = input({ authoringOpen: true, draft: validDraft() });
    const projection = projectAccess(options);
    const authoring = required(projection.authoring);
    const selectedIds = [
      roleOptionId("program", "program", "administrator"),
      roleOptionId("instance", "instance", "instance.owner"),
    ];
    const intent = {
      ...authoring.roleSelection.changeIntent,
      selectedOptionIds: selectedIds,
    } as const;

    expect(resolveAccessIntent(options, projection, intent)).toEqual({
      draft: {
        ...options.draft,
        acceptanceTargetId: "",
        roleOptionIds: selectedIds,
      },
      kind: "invitationDraftChange",
    });

    const selectedOptions = input({ authoringOpen: true, draft: selectedDraft() });
    const selectedProjection = projectAccess(selectedOptions);
    const submit = required(selectedProjection.authoring).submit.intent;
    expect(resolveAccessIntent(selectedOptions, selectedProjection, submit)).toMatchObject({
      kind: "invitationSubmit",
      request: {
        roleAssignments: [
          { roleKey: "instance.owner", scopeKind: "instance" },
          { roleId: "role_04144de6-7927-49f2-826a-cdcc70c47357", scopeKind: "program" },
        ],
        targetSurface: "instance",
      },
    });

    const calls: unknown[] = [];
    await dispatchAccessIntent(
      selectedOptions,
      selectedProjection,
      submit,
      recordingActions(calls),
    );
    expect(calls).toEqual([
      {
        kind: "submitInvitation",
        value: expect.objectContaining({ idempotencyKey: "access:invitation:test" }),
      },
    ]);
  });

  it("resolves person role save and both exact destructive confirmations", async () => {
    const summary = populatedSummary({ secondOwner: true });
    const options = input({
      personAuthoringDraft: createInitialAccessPersonRoleDraft(summary, "principal:ada"),
      summary,
    });
    const projection = projectAccess(options);
    const personAuthoring = required(projection.personAuthoring);
    const saveResolved = resolveAccessIntent(options, projection, personAuthoring.save.intent);
    expect(saveResolved).toMatchObject({
      kind: "personRoleSubmit",
      request: {
        principalId: "principal:ada",
        roles: [{ roleKey: "instance.owner", scopeKind: "instance" }],
      },
    });

    const manifest = readyManifest(projection);
    const invitationDeletion = required(manifest.invitations[0]).deletion;
    if (invitationDeletion.availability !== "available") {
      throw new Error("Expected invitation deletion.");
    }
    expect(resolveAccessIntent(options, projection, invitationDeletion.action.intent)).toEqual({
      kind: "confirmationChange",
      target: { invitationId: "invitation:lin", kind: "invitation-deletion" },
    });

    const person = required(manifest.people[0]);
    if (person.removal.availability !== "available") {
      throw new Error("Expected person removal.");
    }
    expect(resolveAccessIntent(options, projection, person.removal.action.intent)).toEqual({
      kind: "confirmationChange",
      target: { kind: "person-removal", personId: "principal:ada" },
    });

    const confirmed = input({
      confirmation: { kind: "person-removal", personId: "principal:ada" },
      summary,
    });
    const confirmedProjection = projectAccess(confirmed);
    const confirmation = required(readyManifest(confirmedProjection).confirmation);
    await dispatchAccessIntent(
      confirmed,
      confirmedProjection,
      confirmation.action.intent,
      recordingActions([]),
    );
  });
});

describe("access runtime publication", () => {
  it("publishes and removes manifest plus both authoring nodes atomically", () => {
    const application = createApplicationRuntimePublicationCoordinator([
      initialInstanceAccessRuntimeContribution,
    ]);
    const controller = createAccessRuntimePublicationController(application);
    const summary = populatedSummary();
    const options = input({
      authoringOpen: true,
      personAuthoringDraft: createInitialAccessPersonRoleDraft(summary, "principal:ada"),
      summary,
    });

    controller.updateRuntime(options, recordingActions([]));
    expect(application.host.read(instanceAccessReference)?.state).toBe("ready");
    expect(application.host.read(instanceAccessInvitationAuthoringReference)?.open).toBe(true);
    expect(
      application.host.read(instanceAccessPersonRoleAuthoringReference("principal:ada"))?.personId,
    ).toBe("principal:ada");

    const projection = projectAccess(options);
    const serialized = JSON.stringify(
      prepareAccessRuntimePublication({ dispatch: () => undefined, projection }).nodes,
    );
    expect(serialized).not.toContain("request");
    expect(serialized).not.toContain("callback");

    controller.dispose();
    expect(application.host.read(instanceAccessReference)).toBeUndefined();
    expect(application.host.read(instanceAccessInvitationAuthoringReference)).toBeUndefined();
    expect(
      application.host.read(instanceAccessPersonRoleAuthoringReference("principal:ada")),
    ).toBeUndefined();
  });
});

function input({
  authoringOpen = false,
  confirmation,
  draft = validDraft(),
  invitationDeletion = { status: "idle" },
  invitationSubmitAttempted = false,
  personAuthoringDraft,
  personRemoval = { status: "idle" },
  personRoleSubmission = { status: "idle" },
  state,
  submission = { status: "idle" },
  summary = populatedSummary(),
}: Partial<ProjectAccessOptions> & {
  summary?: IdentityAccessManagementSummary;
} = {}): ProjectAccessOptions {
  return {
    authoringOpen,
    ...(confirmation ? { confirmation } : {}),
    draft,
    invitationDeletion,
    invitationSubmitAttempted,
    ...(personAuthoringDraft ? { personAuthoringDraft } : {}),
    personRemoval,
    personRoleSubmission,
    state: state ?? { status: "ready", summary },
    submission,
  };
}

function validDraft(): AccessInvitationDraft {
  return {
    acceptanceTargetId: "",
    displayName: "Lin Example",
    membershipOptionIds: [],
    roleOptionIds: [],
    targetEmail: "lin@example.com",
  };
}

function selectedDraft(): AccessInvitationDraft {
  return {
    ...validDraft(),
    acceptanceTargetId: "instance",
    roleOptionIds: [
      roleOptionId("program", "program", "administrator"),
      roleOptionId("instance", "instance", "instance.owner"),
    ],
  };
}

function populatedSummary({
  owner = true,
  secondOwner = false,
}: {
  owner?: boolean;
  secondOwner?: boolean;
} = {}): IdentityAccessManagementSummary {
  return {
    groups: [
      {
        createdAt: "2026-01-01T00:00:00.000Z",
        displayName: "Research",
        groupId: "group:research",
        status: "active",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    invitationGrantOptions: {
      authority: { instanceOwner: owner, programAdministrator: !owner },
      memberships: [
        {
          displayLabel: "Research",
          targetGroupId: "group:research",
          targetKind: "group",
        },
      ],
      roles: [
        ...(owner
          ? [
              {
                displayLabel: "Instance — Owner",
                roleKey: "instance.owner" as const,
                scopeKind: "instance" as const,
              },
            ]
          : []),
        {
          displayLabel: "Program — Administrator",
          roleId: "role_04144de6-7927-49f2-826a-cdcc70c47357" as const,
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
        inviterPrincipalId: "principal:ada",
        status: "pending",
        targetEmail: "lin@example.com",
        targetSurface: "instance",
        updatedAt: "2026-07-16T00:00:00.000Z",
      },
    ],
    memberships: [],
    organizations: [
      {
        createdAt: "2026-01-01T00:00:00.000Z",
        displayName: "Formless",
        organizationId: "organization:formless",
        status: "active",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    people: [
      person("principal:ada", "Ada Owner"),
      ...(secondOwner ? [person("principal:bo", "Bo Owner")] : []),
    ],
    programRoles: owner
      ? []
      : [
          {
            createdAt: "2026-01-01T00:00:00.000Z",
            displayLabel: "Administrator",
            roleAssignmentId: "program-role-assignment:ada",
            roleId: "role_04144de6-7927-49f2-826a-cdcc70c47357",
            roleKey: "administrator",
            scopeKind: "program",
            status: "active",
            targetPrincipalId: "principal:ada",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
    roles: [
      role("role-assignment:ada-owner", "principal:ada", "instance.owner", "instance"),
      ...(secondOwner
        ? [role("role-assignment:bo-owner", "principal:bo", "instance.owner", "instance")]
        : []),
    ],
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

function role(
  roleAssignmentId: string,
  targetPrincipalId: string,
  roleKey: "instance.owner",
  scopeKind: "instance",
) {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    displayLabel: roleKey,
    roleAssignmentId,
    roleId: `role:${roleKey}`,
    roleKey,
    scopeKind,
    status: "active" as const,
    targetKind: "principal" as const,
    targetPrincipalId,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function roleOptionId(scopeKind: string, surface: string, roleKey: string) {
  return `instance-access:role-option:${segment(scopeKind)}:${segment(surface)}:${segment(roleKey)}`;
}

function segment(value: string) {
  return encodeURIComponent(value).replaceAll("%", "_");
}

function recordingActions(calls: unknown[]): AccessIntentActions {
  return {
    changeAuthoringOpen: (value) => calls.push({ kind: "authoring", value }),
    changeConfirmation: (value) => calls.push({ kind: "confirmation", value }),
    changeDraft: (value) => calls.push({ kind: "draft", value }),
    changePersonAuthoring: (value) => calls.push({ kind: "personAuthoring", value }),
    changePersonRoleDraft: (value) => calls.push({ kind: "personDraft", value }),
    createIdempotencyKey: (purpose) => `access:${purpose}:test`,
    deleteInvitation: (value) => {
      calls.push({ kind: "deleteInvitation", value });
    },
    removePerson: (value) => {
      calls.push({ kind: "removePerson", value });
    },
    revealInvitationValidation: () => {
      calls.push({ kind: "revealInvitationValidation" });
    },
    replacePersonRoles: (value) => {
      calls.push({ kind: "replacePersonRoles", value });
    },
    submitInvitation: (value) => {
      calls.push({ kind: "submitInvitation", value });
    },
  };
}

function readyManifest(projection: ReturnType<typeof projectAccess>): AccessReadyContract {
  if (projection.manifest.state !== "ready") {
    throw new Error("Expected ready access manifest.");
  }
  return projection.manifest;
}

function required<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("Expected value.");
  }
  return value;
}
