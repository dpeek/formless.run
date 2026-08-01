import { describe, expect, it } from "vite-plus/test";
import type {
  AccessActionContract,
  AccessControlledFieldContract,
  AccessDisplayFactContract,
  AccessManifestContract,
  AccessReadyContract,
  AccessRoleSelectionContract,
  ButtonContract,
} from "./contract.ts";
import {
  accessInvitationAuthoringReference,
  accessManifestReference,
  accessPersonRoleAuthoringReference,
  createMemoryPresentationHost,
  type AccessInvitationAuthoringNode,
  type AccessManifestNode,
  type AccessPersonRoleAuthoringNode,
  type PresentationNodeSet,
} from "./host.ts";

const accessReference = accessManifestReference("access:instance");
const invitationReference = accessInvitationAuthoringReference(
  accessReference.accessId,
  "access:instance:invitation-authoring",
);
const personReference = accessPersonRoleAuthoringReference(
  accessReference.accessId,
  "access:instance:person-authoring:alex",
  "person:alex",
);

describe("access memory Presentation Host", () => {
  it("reads access states and the complete invitation and person authoring graph", () => {
    const loading: AccessManifestNode = {
      reference: accessReference,
      snapshot: {
        accessibilityLabel: "Access",
        id: accessReference.accessId,
        kind: "accessManifest",
        message: "Loading access...",
        state: "loading",
        title: "Access",
      },
    };
    const host = createMemoryPresentationHost({ nodes: [loading] });
    const snapshot: AccessManifestContract | undefined = host.read({ ...accessReference });
    expect(snapshot).toMatchObject({ state: "loading" });

    host.publish(readyNodes());
    const manifest = host.read(accessReference);
    const invitation = host.read(invitationReference);
    const person = host.read(personReference);

    expect(manifest).toMatchObject({
      invitations: [{ deletion: { availability: "available" } }],
      people: [
        {
          removal: { availability: "available" },
          roleAuthoring: { availability: "available" },
        },
      ],
      personAuthoring: personReference,
      state: "ready",
    });
    expect(invitation).toMatchObject({
      fields: { acceptanceTarget: { value: "program" } },
      membershipSelection: { selectedOptionIds: ["membership:research"] },
      roleSelection: { selectedOptionIds: ["role:program-editor"] },
    });
    expect(person).toMatchObject({
      personId: "person:alex",
      roleSelection: { selectedOptionIds: ["role:instance-admin"] },
    });
  });

  it("validates resolved references and atomic selected-set identities", () => {
    expect(() => createMemoryPresentationHost({ nodes: [readyManifestNode()] })).toThrow(
      "has no snapshot",
    );

    const invitation = invitationAuthoringNode();
    expect(() =>
      createMemoryPresentationHost({
        nodes: [
          {
            ...invitation,
            snapshot: {
              ...invitation.snapshot,
              roleSelection: {
                ...invitation.snapshot.roleSelection,
                selectedOptionIds: [],
              },
            },
          },
        ],
      }),
    ).toThrow("inconsistent role selection");

    const person = personAuthoringNode();
    const personSelectionIntent = person.snapshot.roleSelection.changeIntent;
    if (personSelectionIntent.type !== "accessPersonRoleSelectionChange") {
      throw new Error("Expected person role selection.");
    }
    expect(() =>
      createMemoryPresentationHost({
        nodes: [
          {
            ...person,
            snapshot: {
              ...person.snapshot,
              roleSelection: {
                ...person.snapshot.roleSelection,
                changeIntent: {
                  ...personSelectionIntent,
                  personId: "person:other",
                },
              },
            },
          },
        ],
      }),
    ).toThrow("invalid role-selection intent");
  });
});

function readyNodes(): PresentationNodeSet {
  return [readyManifestNode(), invitationAuthoringNode(), personAuthoringNode()];
}

function readyManifestNode(): AccessManifestNode & { snapshot: AccessReadyContract } {
  const invite = action("authoring-open", "Invite collaborator", {
    accessId: accessReference.accessId,
    actionId: "action:invite",
    authoringId: invitationReference.authoringId,
    controlId: "control:invite",
    open: true,
    type: "accessInvitationAuthoringOpenChange",
  });
  const edit = action("person-role-authoring-open", "Edit roles", {
    accessId: accessReference.accessId,
    actionId: "action:edit",
    authoringId: personReference.authoringId,
    controlId: "control:edit",
    open: true,
    personId: personReference.personId,
    type: "accessPersonRoleAuthoringOpenChange",
  });
  const remove = action("person-removal-open", "Remove person", {
    accessId: accessReference.accessId,
    actionId: "action:remove-open",
    confirmationId: "confirmation:delete",
    controlId: "control:remove-open",
    open: true,
    personId: personReference.personId,
    type: "accessPersonRemovalConfirmationOpenChange",
  });
  const deletion = action("invitation-deletion-open", "Delete invitation", {
    accessId: accessReference.accessId,
    actionId: "action:delete-open",
    confirmationId: "confirmation:delete",
    controlId: "control:delete-open",
    invitationId: "invitation:alex",
    open: true,
    type: "accessInvitationDeletionConfirmationOpenChange",
  });

  return {
    reference: accessReference,
    snapshot: {
      accessibilityLabel: "Access",
      authoring: invitationReference,
      id: accessReference.accessId,
      invitations: [
        {
          deletion: { action: deletion, availability: "available" },
          expiresAt: fact("invitation:alex:expires", "Expires", "2030-01-01", "timestamp"),
          id: "invitation:alex",
          kind: "accessInvitation",
          status: fact("invitation:alex:status", "Status", "Pending", "status"),
          target: fact("invitation:alex:target", "Target", "Instance"),
          targetEmail: "alex@example.com",
        },
      ],
      invite,
      kind: "accessManifest",
      people: [
        {
          displayName: "Alex Example",
          id: personReference.personId,
          kind: "accessPerson",
          removal: { action: remove, availability: "available" },
          roleAuthoring: {
            action: edit,
            availability: "available",
            reference: personReference,
          },
          roles: [],
          status: fact("person:alex:status", "Status", "Active", "status"),
        },
      ],
      personAuthoring: personReference,
      state: "ready",
      title: "Access",
    },
  };
}

function invitationAuthoringNode(): AccessInvitationAuthoringNode {
  const roleSelection = selection({
    authoringId: invitationReference.authoringId,
    selectedId: "role:program-editor",
    type: "invitation",
  });

  return {
    reference: invitationReference,
    snapshot: {
      accessId: accessReference.accessId,
      cancel: action("authoring-cancel", "Cancel", {
        accessId: accessReference.accessId,
        actionId: "action:invite-cancel",
        authoringId: invitationReference.authoringId,
        controlId: "control:invite-cancel",
        open: false,
        type: "accessInvitationAuthoringOpenChange",
      }),
      description: "Invite a collaborator.",
      errors: [],
      fields: {
        acceptanceTarget: field(
          "field:target",
          "Continue to",
          "acceptance-target",
          "select",
          "program",
          [
            {
              id: "target:site",
              label: "Site",
              selected: true,
              value: "program",
            },
            {
              id: "target:instance",
              label: "Instance",
              selected: false,
              value: "surface:instance",
            },
          ],
        ),
        displayName: field("field:name", "Name", "display-name", "text", "Taylor"),
        targetEmail: field("field:email", "Email", "target-email", "email", "t@example.com"),
      },
      id: invitationReference.authoringId,
      kind: "accessInvitationAuthoring",
      membershipSelection: {
        changeIntent: {
          accessId: accessReference.accessId,
          authoringId: invitationReference.authoringId,
          controlId: "membership",
          type: "accessInvitationMembershipSelectionChange",
        },
        errors: [],
        groups: [
          {
            id: "membership:group",
            kind: "accessMembershipOptionGroup",
            label: "Groups",
            options: [{ id: "membership:research", label: "Research", selected: true }],
          },
        ],
        id: "membership",
        kind: "accessMembershipSelection",
        label: "Memberships",
        selectedOptionIds: ["membership:research"],
      },
      open: true,
      roleSelection,
      submit: action("invitation-submit", "Send invite", {
        accessId: accessReference.accessId,
        actionId: "action:invite-submit",
        authoringId: invitationReference.authoringId,
        controlId: "control:invite-submit",
        type: "accessInvitationSubmit",
      }),
      title: "Invite collaborator",
    },
  };
}

function personAuthoringNode(): AccessPersonRoleAuthoringNode {
  return {
    reference: personReference,
    snapshot: {
      accessId: accessReference.accessId,
      cancel: action("person-role-authoring-cancel", "Cancel", {
        accessId: accessReference.accessId,
        actionId: "action:person-cancel",
        authoringId: personReference.authoringId,
        controlId: "control:person-cancel",
        open: false,
        personId: personReference.personId,
        type: "accessPersonRoleAuthoringOpenChange",
      }),
      description: "Choose roles.",
      displayName: "Alex Example",
      errors: [],
      id: personReference.authoringId,
      kind: "accessPersonRoleAuthoring",
      open: true,
      personId: personReference.personId,
      roleSelection: selection({
        authoringId: personReference.authoringId,
        personId: personReference.personId,
        selectedId: "role:instance-admin",
        type: "person",
      }),
      save: action("person-role-save", "Save roles", {
        accessId: accessReference.accessId,
        actionId: "action:person-save",
        authoringId: personReference.authoringId,
        controlId: "control:person-save",
        personId: personReference.personId,
        type: "accessPersonRoleSubmit",
      }),
      title: "Edit roles",
    },
  };
}

function selection({
  authoringId,
  personId,
  selectedId,
  type,
}: {
  authoringId: string;
  personId?: string;
  selectedId: string;
  type: "invitation" | "person";
}): AccessRoleSelectionContract {
  const id = `${authoringId}:roles`;
  return {
    changeIntent:
      type === "invitation"
        ? {
            accessId: accessReference.accessId,
            authoringId,
            controlId: id,
            type: "accessInvitationRoleSelectionChange",
          }
        : {
            accessId: accessReference.accessId,
            authoringId,
            controlId: id,
            personId: personId ?? "",
            type: "accessPersonRoleSelectionChange",
          },
    errors: [],
    id,
    kind: "accessRoleSelection",
    label: "Roles",
    options: [
      {
        id: selectedId,
        label: selectedId.includes("program") ? "Program — Editor" : "Instance — Administrator",
        selected: true,
        surfaceId: selectedId.includes("program") ? "program" : "surface:instance",
        surfaceKind: selectedId.includes("program") ? "program" : "instance",
      },
    ],
    selectedOptionIds: [selectedId],
  };
}

function field(
  id: string,
  label: string,
  purpose: AccessControlledFieldContract["purpose"],
  inputKind: AccessControlledFieldContract["inputKind"],
  value: string,
  options?: AccessControlledFieldContract["options"],
): AccessControlledFieldContract {
  return {
    changeIntent: {
      accessId: accessReference.accessId,
      authoringId: invitationReference.authoringId,
      fieldId: id,
      type: "accessInvitationFieldChange",
    },
    errors: [],
    id,
    inputKind,
    kind: "accessControlledField",
    label,
    ...(options ? { options } : {}),
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
    control: button(intent.controlId, label),
    id: intent.actionId,
    intent,
    kind: "accessAction",
    purpose,
  };
}

function button(id: string, label: string): ButtonContract {
  return {
    accessibilityLabel: label,
    content: { kind: "label", label },
    density: "default",
    id,
    kind: "button",
    prominence: "secondary",
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
