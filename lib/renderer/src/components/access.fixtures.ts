import type {
  AccessActionContract,
  AccessControlledFieldContract,
  AccessDisplayFactContract,
  AccessFeedbackContract,
  AccessInvitationAuthoringContract,
  AccessInvitationContract,
  AccessManifestContract,
  AccessMembershipSelectionContract,
  AccessPersonContract,
  AccessPersonRoleAuthoringContract,
  AccessReadyContract,
  AccessRoleSelectionContract,
  ButtonContract,
} from "@dpeek/formless-presentation/contract";
import {
  accessInvitationAuthoringReference,
  accessManifestReference,
  accessPersonRoleAuthoringReference,
} from "@dpeek/formless-presentation/host";

export type FormlessAccessFixtureId =
  | "empty"
  | "failed"
  | "loading"
  | "populated-owner"
  | "unauthorized";

export type FormlessAccessFixtureState = {
  authoring: AccessInvitationAuthoringContract | null;
  manifest: AccessManifestContract;
  personAuthoring: AccessPersonRoleAuthoringContract | null;
};

export type FormlessAccessFixture = {
  id: FormlessAccessFixtureId;
  label: string;
  state: FormlessAccessFixtureState;
};

export const accessFixtureReference = accessManifestReference("access:fixture");
export const accessFixtureAuthoringReference = accessInvitationAuthoringReference(
  accessFixtureReference.accessId,
  "access:fixture:authoring",
);
export const accessFixturePersonAuthoringReference = accessPersonRoleAuthoringReference(
  accessFixtureReference.accessId,
  "access:fixture:person-authoring:ada",
  "person:ada",
);

export function createFormlessAccessFixtures(): FormlessAccessFixture[] {
  return [
    fixture("loading", "Loading", stateManifest("loading")),
    fixture("unauthorized", "Unauthorized", stateManifest("unauthorized")),
    fixture("failed", "Failed", stateManifest("failed")),
    fixture("empty", "Empty", readyManifest(true)),
    fixture("populated-owner", "Owner grants", readyManifest(false)),
  ];
}

function fixture(
  id: FormlessAccessFixtureId,
  label: string,
  manifest: AccessManifestContract,
): FormlessAccessFixture {
  return {
    id,
    label,
    state: {
      authoring: manifest.state === "ready" ? invitationAuthoring(false) : null,
      manifest,
      personAuthoring: null,
    },
  };
}

function manifestBase() {
  return {
    accessibilityLabel: "Instance access",
    id: accessFixtureReference.accessId,
    kind: "accessManifest" as const,
    title: "Access",
  };
}

function stateManifest(state: "failed" | "loading" | "unauthorized"): AccessManifestContract {
  if (state === "loading") {
    return { ...manifestBase(), message: "Loading access summary", state };
  }
  return {
    ...manifestBase(),
    feedback:
      state === "failed"
        ? feedback(
            "load-failed",
            "Access could not be loaded",
            "The access summary is temporarily unavailable.",
            "danger",
          )
        : feedback(
            "unauthorized",
            "Access unavailable",
            "Owner or administrator access is required.",
            "warning",
          ),
    state,
  };
}

function readyManifest(empty: boolean): AccessReadyContract {
  const invite = action("authoring-open", "Invite collaborator", {
    accessId: accessFixtureReference.accessId,
    actionId: "access:fixture:invite",
    authoringId: accessFixtureAuthoringReference.authoringId,
    controlId: "access:fixture:invite-control",
    open: true,
    type: "accessInvitationAuthoringOpenChange",
  });

  return {
    ...manifestBase(),
    authoring: accessFixtureAuthoringReference,
    ...(empty
      ? {
          invitationsEmptyState: {
            description: "Invite a collaborator to add access.",
            id: "access:fixture:invitations:empty",
            kind: "accessEmptyState" as const,
            title: "No invitations",
          },
          peopleEmptyState: {
            description: "Invite a collaborator to add access.",
            id: "access:fixture:people:empty",
            kind: "accessEmptyState" as const,
            title: "No people",
          },
        }
      : {}),
    invitations: empty ? [] : [pendingInvitation()],
    invite,
    people: empty ? [] : [accessPerson()],
    state: "ready",
  };
}

function accessPerson(): AccessPersonContract {
  const edit = action("person-role-authoring-open", "Edit roles", {
    accessId: accessFixtureReference.accessId,
    actionId: "access:fixture:person-role-open",
    authoringId: accessFixturePersonAuthoringReference.authoringId,
    controlId: "access:fixture:person-role-open-control",
    open: true,
    personId: "person:ada",
    type: "accessPersonRoleAuthoringOpenChange",
  });
  const remove = action("person-removal-open", "Remove person", {
    accessId: accessFixtureReference.accessId,
    actionId: "access:fixture:person-remove-open",
    confirmationId: "access:fixture:confirmation",
    controlId: "access:fixture:person-remove-open-control",
    open: true,
    personId: "person:ada",
    type: "accessPersonRemovalConfirmationOpenChange",
  });

  return {
    displayName: "Ada Lovelace",
    id: "person:ada",
    kind: "accessPerson",
    primaryEmail: "ada@example.com",
    removal: { action: remove, availability: "available" },
    roleAuthoring: {
      action: edit,
      availability: "available",
      reference: accessFixturePersonAuthoringReference,
    },
    roles: [
      {
        id: "role:owner",
        kind: "accessRole",
        label: "Owner",
        scope: fact("role:owner:scope", "Scope", "Instance"),
      },
    ],
    status: fact("person:ada:status", "Status", "Active", "status", "success"),
  };
}

function pendingInvitation(): AccessInvitationContract {
  return {
    deletion: {
      action: action("invitation-deletion-open", "Delete invitation", {
        accessId: accessFixtureReference.accessId,
        actionId: "access:fixture:invitation-delete-open",
        confirmationId: "access:fixture:confirmation",
        controlId: "access:fixture:invitation-delete-open-control",
        invitationId: "invitation:pending",
        open: true,
        type: "accessInvitationDeletionConfirmationOpenChange",
      }),
      availability: "available",
    },
    expiresAt: fact(
      "invitation:pending:expires",
      "Expires",
      "2026-07-30T00:00:00.000Z",
      "timestamp",
    ),
    id: "invitation:pending",
    inviter: fact("invitation:pending:inviter", "Inviter", "Ada Lovelace"),
    kind: "accessInvitation",
    scope: fact("invitation:pending:scope", "Scope", "Site"),
    status: fact("invitation:pending:status", "Status", "Pending", "status", "warning"),
    target: fact("invitation:pending:target", "Target", "App install"),
    targetEmail: "pending@example.com",
  };
}

export function invitationAuthoring(open: boolean): AccessInvitationAuthoringContract {
  const roleSelection = fixtureRoleSelection({
    authoringId: accessFixtureAuthoringReference.authoringId,
    selectedOptionIds: ["role:instance-owner"],
    type: "invitation",
  });

  return {
    accessId: accessFixtureReference.accessId,
    cancel: action("authoring-cancel", "Cancel", {
      accessId: accessFixtureReference.accessId,
      actionId: "access:fixture:authoring-cancel",
      authoringId: accessFixtureAuthoringReference.authoringId,
      controlId: "access:fixture:authoring-cancel-control",
      open: false,
      type: "accessInvitationAuthoringOpenChange",
    }),
    description: "Invite a collaborator and choose their access.",
    errors: [],
    fields: {
      displayName: field("display-name", "Name", "text", "Grace Hopper"),
      targetEmail: field("target-email", "Email", "email", "invitee@example.com"),
    },
    id: accessFixtureAuthoringReference.authoringId,
    kind: "accessInvitationAuthoring",
    membershipSelection: fixtureMembershipSelection(),
    open,
    roleSelection,
    submit: action("invitation-submit", "Send invitation", {
      accessId: accessFixtureReference.accessId,
      actionId: "access:fixture:authoring-submit",
      authoringId: accessFixtureAuthoringReference.authoringId,
      controlId: "access:fixture:authoring-submit-control",
      type: "accessInvitationSubmit",
    }),
    title: "Invite collaborator",
  };
}

export function personRoleAuthoring(): AccessPersonRoleAuthoringContract {
  return {
    accessId: accessFixtureReference.accessId,
    cancel: action("person-role-authoring-cancel", "Cancel", {
      accessId: accessFixtureReference.accessId,
      actionId: "access:fixture:person-role-cancel",
      authoringId: accessFixturePersonAuthoringReference.authoringId,
      controlId: "access:fixture:person-role-cancel-control",
      open: false,
      personId: "person:ada",
      type: "accessPersonRoleAuthoringOpenChange",
    }),
    description: "Choose the exact role levels managed for Ada Lovelace.",
    displayName: "Ada Lovelace",
    errors: [],
    id: accessFixturePersonAuthoringReference.authoringId,
    kind: "accessPersonRoleAuthoring",
    open: true,
    personId: "person:ada",
    roleSelection: fixtureRoleSelection({
      authoringId: accessFixturePersonAuthoringReference.authoringId,
      personId: "person:ada",
      selectedOptionIds: ["role:instance-owner"],
      type: "person",
    }),
    save: action("person-role-save", "Save roles", {
      accessId: accessFixtureReference.accessId,
      actionId: "access:fixture:person-role-save",
      authoringId: accessFixturePersonAuthoringReference.authoringId,
      controlId: "access:fixture:person-role-save-control",
      personId: "person:ada",
      type: "accessPersonRoleSubmit",
    }),
    title: "Edit roles for Ada Lovelace",
  };
}

function fixtureRoleSelection({
  authoringId,
  personId,
  selectedOptionIds,
  type,
}: {
  authoringId: string;
  personId?: string;
  selectedOptionIds: readonly string[];
  type: "invitation" | "person";
}): AccessRoleSelectionContract {
  const id = `${authoringId}:roles`;
  const options = [
    {
      id: "role:instance-owner",
      label: "Instance — Owner",
      surfaceId: "instance",
      surfaceKind: "instance" as const,
    },
    {
      id: "role:instance-admin",
      label: "Instance — Administrator",
      surfaceId: "instance",
      surfaceKind: "instance" as const,
    },
    {
      id: "role:program-editor",
      label: "Program — Editor",
      surfaceId: "program",
      surfaceKind: "program" as const,
    },
  ]
    .filter(
      ({ id: optionId, surfaceId }) =>
        !selectedOptionIds.some(
          (selectedId) =>
            selectedId !== optionId &&
            (selectedId.startsWith("role:instance") ? "instance" : "program") === surfaceId,
        ),
    )
    .map((option) => ({ ...option, selected: selectedOptionIds.includes(option.id) }));

  return {
    changeIntent:
      type === "invitation"
        ? {
            accessId: accessFixtureReference.accessId,
            authoringId,
            controlId: id,
            type: "accessInvitationRoleSelectionChange",
          }
        : {
            accessId: accessFixtureReference.accessId,
            authoringId,
            controlId: id,
            personId: personId ?? "",
            type: "accessPersonRoleSelectionChange",
          },
    errors: [],
    id,
    kind: "accessRoleSelection",
    label: "Roles",
    options,
    selectedOptionIds,
  };
}

function fixtureMembershipSelection(): AccessMembershipSelectionContract {
  return {
    changeIntent: {
      accessId: accessFixtureReference.accessId,
      authoringId: accessFixtureAuthoringReference.authoringId,
      controlId: "access:fixture:memberships",
      type: "accessInvitationMembershipSelectionChange",
    },
    errors: [],
    groups: [
      {
        id: "access:fixture:memberships:organizations",
        kind: "accessMembershipOptionGroup",
        label: "Organizations",
        options: [
          {
            id: "membership:analytical-engine",
            label: "Analytical Engine",
            selected: false,
          },
        ],
      },
      {
        id: "access:fixture:memberships:groups",
        kind: "accessMembershipOptionGroup",
        label: "Groups",
        options: [{ id: "membership:research", label: "Research", selected: false }],
      },
    ],
    id: "access:fixture:memberships",
    kind: "accessMembershipSelection",
    label: "Memberships",
    selectedOptionIds: [],
  };
}

function field(
  purpose: AccessControlledFieldContract["purpose"],
  label: string,
  inputKind: AccessControlledFieldContract["inputKind"],
  value: string,
): AccessControlledFieldContract {
  const id = `access:fixture:field:${purpose}`;
  return {
    changeIntent: {
      accessId: accessFixtureReference.accessId,
      authoringId: accessFixtureAuthoringReference.authoringId,
      fieldId: id,
      type: "accessInvitationFieldChange",
    },
    errors: [],
    id,
    inputKind,
    kind: "accessControlledField",
    label,
    purpose,
    required: true,
    value,
  };
}

function action<Intent extends AccessActionContract["intent"]>(
  purpose: AccessActionContract<Intent>["purpose"],
  label: string,
  intent: Intent,
): AccessActionContract<Intent> {
  return {
    control: button(
      intent.controlId,
      label,
      purpose.includes("remove") || purpose.includes("delete"),
    ),
    id: intent.actionId,
    intent,
    kind: "accessAction",
    purpose,
  };
}

function button(id: string, label: string, destructive = false): ButtonContract {
  return {
    accessibilityLabel: label,
    content: { kind: "label", label },
    density: "default",
    id,
    kind: "button",
    prominence: destructive ? "secondary" : "primary",
    type: "button",
  };
}

function fact(
  id: string,
  label: string,
  value: string,
  presentation: AccessDisplayFactContract["presentation"] = "text",
  intent?: AccessDisplayFactContract["intent"],
): AccessDisplayFactContract {
  return {
    id,
    ...(intent ? { intent } : {}),
    kind: "accessDisplayFact",
    label,
    presentation,
    value,
  };
}

function feedback(
  id: string,
  title: string,
  detail: string,
  intent: AccessFeedbackContract["intent"],
): AccessFeedbackContract {
  return { detail, id: `access:fixture:feedback:${id}`, intent, kind: "accessFeedback", title };
}
