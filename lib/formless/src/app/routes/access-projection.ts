import type {
  AccessActionContract,
  AccessConfirmationContract,
  AccessControlledFieldContract,
  AccessDisplayFactContract,
  AccessFeedbackContract,
  AccessIntent,
  AccessInvitationAuthoringContract,
  AccessInvitationAuthoringOpenChangeIntent,
  AccessInvitationContract,
  AccessInvitationDeleteIntent,
  AccessInvitationDeletionConfirmationOpenChangeIntent,
  AccessInvitationFieldPurpose,
  AccessInvitationSubmitIntent,
  AccessManifestContract,
  AccessMembershipOptionGroupContract,
  AccessMembershipSelectionContract,
  AccessPersonContract,
  AccessPersonRemoveIntent,
  AccessPersonRemovalConfirmationOpenChangeIntent,
  AccessPersonRoleAuthoringContract,
  AccessPersonRoleAuthoringOpenChangeIntent,
  AccessPersonRoleSubmitIntent,
  AccessReadyContract,
  AccessRoleOptionContract,
  AccessRoleSelectionContract,
  ButtonContract,
  CompactStatusIntent,
} from "@dpeek/formless-presentation/contract";
import type {
  IdentityAccessInvitationGrantOptions,
  IdentityAccessInvitationMembershipGrantOption,
  IdentityAccessInvitationRoleGrantOption,
  IdentityAccessInvitationSummary,
  IdentityAccessManagementSummary,
  IdentityAccessPersonRoleReplacementRequest,
  IdentityAccessPersonRoleSelection,
  IdentityAccessProgramRoleSummary,
  IdentityAccessRoleSummary,
} from "@dpeek/formless-identity-control-plane";
import type { AppInstall } from "@dpeek/formless-installed-apps";
import type {
  CreateIdentityAccessManagementInvitationInput,
  RevokeIdentityAccessManagementInvitationInput,
} from "../../client/identity-access-management.ts";
import { displaySafeText, fieldKeyLabel } from "./instance-management-display-safety.ts";
import {
  INSTANCE_ACCESS_ID,
  instanceAccessInvitationAuthoringReference,
  instanceAccessLoadingManifest,
  instanceAccessPersonRoleAuthoringReference,
} from "./access-contract.ts";

const ACCESS_INVITE_ACTION_ID = `${INSTANCE_ACCESS_ID}:invite`;
const ACCESS_INVITE_CONTROL_ID = `${INSTANCE_ACCESS_ID}:invite-control`;
const ACCESS_AUTHORING_CANCEL_ACTION_ID = `${INSTANCE_ACCESS_ID}:authoring-cancel`;
const ACCESS_AUTHORING_CANCEL_CONTROL_ID = `${INSTANCE_ACCESS_ID}:authoring-cancel-control`;
const ACCESS_AUTHORING_SUBMIT_ACTION_ID = `${INSTANCE_ACCESS_ID}:authoring-submit`;
const ACCESS_AUTHORING_SUBMIT_CONTROL_ID = `${INSTANCE_ACCESS_ID}:authoring-submit-control`;
const ACCESS_ROLE_SELECTION_ID = `${INSTANCE_ACCESS_ID}:role-grants`;
const ACCESS_MEMBERSHIP_SELECTION_ID = `${INSTANCE_ACCESS_ID}:membership-grants`;
const ACCESS_CONFIRMATION_ID = `${INSTANCE_ACCESS_ID}:destructive-confirmation`;

export type AccessManagementPresentationState =
  | { message: string; status: "failed" }
  | { status: "loading" }
  | { status: "ready"; summary: IdentityAccessManagementSummary }
  | { message: string; status: "unauthorized" };

export type AccessInvitationDraft = {
  acceptanceTargetId: string;
  displayName: string;
  membershipOptionIds: readonly string[];
  roleOptionIds: readonly string[];
  targetEmail: string;
};

export type AccessPersonRoleDraft = {
  personId: string;
  roleOptionIds: readonly string[];
};

export type AccessInvitationSubmissionState =
  | { message: string; status: "failed" }
  | { status: "idle" }
  | { message: string; status: "succeeded" }
  | { status: "submitting" };

export type AccessInvitationDeletionState =
  | { invitationId: string; message: string; status: "failed" }
  | { status: "idle" }
  | { invitationId: string; message: string; status: "succeeded" }
  | { invitationId: string; status: "submitting" };

export type AccessPersonRoleSubmissionState =
  | { message: string; personId: string; status: "failed" }
  | { status: "idle" }
  | { message: string; personId: string; status: "succeeded" }
  | { personId: string; status: "submitting" };

export type AccessPersonRemovalState =
  | { message: string; personId: string; status: "failed" }
  | { status: "idle" }
  | { message: string; personId: string; status: "succeeded" }
  | { personId: string; status: "submitting" };

export type AccessConfirmationTarget =
  | { invitationId: string; kind: "invitation-deletion" }
  | { kind: "person-removal"; personId: string };

export type ProjectAccessOptions = {
  authoringOpen: boolean;
  confirmation?: AccessConfirmationTarget | undefined;
  draft: AccessInvitationDraft;
  installs: readonly AppInstall[];
  invitationDeletion: AccessInvitationDeletionState;
  invitationSubmitAttempted: boolean;
  personAuthoringDraft?: AccessPersonRoleDraft | undefined;
  personRemoval: AccessPersonRemovalState;
  personRoleSubmission: AccessPersonRoleSubmissionState;
  state: AccessManagementPresentationState;
  submission: AccessInvitationSubmissionState;
};

export type AccessProjection = {
  authoring?: AccessInvitationAuthoringContract | undefined;
  invitationValidationErrors?: readonly string[] | undefined;
  manifest: AccessManifestContract;
  personAuthoring?: AccessPersonRoleAuthoringContract | undefined;
};

export type ResolvedAccessIntent =
  | { draft: AccessInvitationDraft; kind: "invitationDraftChange" }
  | { draft: AccessPersonRoleDraft; kind: "personRoleDraftChange" }
  | { kind: "authoringOpenChange"; open: boolean }
  | { kind: "confirmationChange"; target: AccessConfirmationTarget | undefined }
  | { kind: "deleteInvitation"; invitationId: string }
  | { kind: "ignored" }
  | { kind: "invitationValidationReveal" }
  | {
      kind: "invitationSubmit";
      request: Omit<CreateIdentityAccessManagementInvitationInput, "idempotencyKey">;
    }
  | {
      draft: AccessPersonRoleDraft | undefined;
      kind: "personAuthoringChange";
    }
  | {
      kind: "personRoleSubmit";
      request: Omit<IdentityAccessPersonRoleReplacementRequest, "idempotencyKey">;
    }
  | { kind: "removePerson"; personId: string };

export type AccessIntentActions = {
  changeAuthoringOpen(open: boolean): void;
  changeConfirmation(target: AccessConfirmationTarget | undefined): void;
  changeDraft(draft: AccessInvitationDraft): void;
  changePersonAuthoring(draft: AccessPersonRoleDraft | undefined): void;
  changePersonRoleDraft(draft: AccessPersonRoleDraft): void;
  createIdempotencyKey(purpose: "invitation" | "person-removal" | "person-role"): string;
  deleteInvitation(input: RevokeIdentityAccessManagementInvitationInput): Promise<void> | void;
  removePerson(input: { idempotencyKey: string; principalId: string }): Promise<void> | void;
  revealInvitationValidation(): void;
  replacePersonRoles(input: IdentityAccessPersonRoleReplacementRequest): Promise<void> | void;
  submitInvitation(input: CreateIdentityAccessManagementInvitationInput): Promise<void> | void;
};

type AccessLabels = {
  groups: ReadonlyMap<string, string>;
  installs: ReadonlyMap<string, string>;
  organizations: ReadonlyMap<string, string>;
  people: ReadonlyMap<string, string>;
};

type ProjectedRoleChoice = AccessRoleOptionContract & {
  role: IdentityAccessInvitationRoleGrantOption;
  surfaceLabel: string;
};

export function createInitialAccessInvitationDraft({
  installs: _installs,
  summary: _summary,
}: {
  installs: readonly AppInstall[];
  summary?: IdentityAccessManagementSummary | undefined;
}): AccessInvitationDraft {
  return {
    acceptanceTargetId: "",
    displayName: "",
    membershipOptionIds: [],
    roleOptionIds: [],
    targetEmail: "",
  };
}

export function createInitialAccessPersonRoleDraft(
  summary: IdentityAccessManagementSummary,
  personId: string,
): AccessPersonRoleDraft {
  const choices = projectRoleChoices(summary.invitationGrantOptions, accessLabels(summary, []));
  const choiceIds = new Set(choices.map(({ id }) => id));

  return {
    personId,
    roleOptionIds: [...summary.programRoles, ...summary.roles]
      .filter(
        (role) =>
          role.status === "active" &&
          (role.scopeKind === "program" || role.targetKind === "principal") &&
          role.targetPrincipalId === personId,
      )
      .map(accessRoleSummaryOptionId)
      .filter((id) => choiceIds.has(id)),
  };
}

export function projectAccess(options: ProjectAccessOptions): AccessProjection {
  const base = {
    accessibilityLabel: "Access",
    id: INSTANCE_ACCESS_ID,
    kind: "accessManifest" as const,
    title: "Access",
  };

  if (options.state.status === "loading") {
    return { manifest: instanceAccessLoadingManifest };
  }
  if (options.state.status === "unauthorized") {
    return {
      manifest: {
        ...base,
        feedback: accessFeedback("unauthorized", "Access denied", options.state.message, "danger"),
        state: "unauthorized",
      },
    };
  }
  if (options.state.status === "failed") {
    return {
      manifest: {
        ...base,
        feedback: accessFeedback(
          "load-failed",
          "Access unavailable",
          options.state.message,
          "danger",
        ),
        state: "failed",
      },
    };
  }

  const summary = options.state.summary;
  const labels = accessLabels(summary, options.installs);
  const roleChoices = projectRoleChoices(summary.invitationGrantOptions, labels);
  const authoringProjection = projectAccessInvitationAuthoring(
    options,
    summary,
    roleChoices,
    labels,
  );
  const authoring = authoringProjection.authoring;
  const people = projectAccessPeople(options, summary, roleChoices, labels);
  const invitations = projectAccessInvitations(options, summary, labels);
  const personAuthoring = projectAccessPersonRoleAuthoring(options, summary, roleChoices);
  const confirmation = projectAccessConfirmation(options, people, invitations);
  const manifest: AccessReadyContract = {
    ...base,
    authoring: instanceAccessInvitationAuthoringReference,
    ...(confirmation ? { confirmation } : {}),
    ...(invitations.length === 0
      ? {
          invitationsEmptyState: {
            description: "Invite a collaborator to add access.",
            id: `${INSTANCE_ACCESS_ID}:invitations:empty`,
            kind: "accessEmptyState" as const,
            title: "No invitations",
          },
        }
      : {}),
    ...(readyFeedback(options) ? { feedback: readyFeedback(options) } : {}),
    invitations,
    invite: accessInviteAction(summary, options.submission),
    kind: "accessManifest",
    people,
    ...(people.length === 0
      ? {
          peopleEmptyState: {
            description: "Invite a collaborator to add access.",
            id: `${INSTANCE_ACCESS_ID}:people:empty`,
            kind: "accessEmptyState" as const,
            title: "No people",
          },
        }
      : {}),
    ...(personAuthoring
      ? { personAuthoring: instanceAccessPersonRoleAuthoringReference(personAuthoring.personId) }
      : {}),
    state: "ready",
  };

  return {
    authoring,
    invitationValidationErrors: authoringProjection.validationErrors,
    manifest,
    ...(personAuthoring ? { personAuthoring } : {}),
  };
}

export function resolveAccessIntent(
  options: ProjectAccessOptions,
  projection: AccessProjection,
  intent: AccessIntent,
): ResolvedAccessIntent {
  if (projection.manifest.state !== "ready" || intent.accessId !== projection.manifest.id) {
    return { kind: "ignored" };
  }

  switch (intent.type) {
    case "accessInvitationAuthoringOpenChange": {
      const authoring = projection.authoring;
      if (!authoring) {
        return { kind: "ignored" };
      }
      const expected = intent.open ? projection.manifest.invite : authoring.cancel;
      return sameAccessActionIntent(intent, expected.intent) && expected.control.disabled !== true
        ? { kind: "authoringOpenChange", open: intent.open }
        : { kind: "ignored" };
    }
    case "accessInvitationFieldChange": {
      const authoring = projection.authoring;
      if (!authoring || authoring.pending?.isPending) {
        return { kind: "ignored" };
      }
      const field = Object.values(authoring.fields).find(
        (candidate) =>
          candidate?.id === intent.fieldId &&
          candidate.changeIntent.authoringId === intent.authoringId,
      );
      if (!field || field.disabledReason) {
        return { kind: "ignored" };
      }
      if (
        field.inputKind === "select" &&
        !field.options?.some(
          (option) => option.value === intent.value && option.disabledReason === undefined,
        )
      ) {
        return { kind: "ignored" };
      }
      return {
        draft: accessDraftWithFieldValue(options.draft, field.purpose, intent.value),
        kind: "invitationDraftChange",
      };
    }
    case "accessInvitationRoleSelectionChange": {
      const authoring = projection.authoring;
      if (
        !authoring ||
        authoring.pending?.isPending ||
        !sameSelectionIntent(intent, authoring.roleSelection.changeIntent) ||
        !validSelectedRoleOptionIds(authoring.roleSelection, intent.selectedOptionIds)
      ) {
        return { kind: "ignored" };
      }
      return {
        draft: accessInvitationDraftWithRoles(
          options.draft,
          authoring.roleSelection,
          intent.selectedOptionIds,
        ),
        kind: "invitationDraftChange",
      };
    }
    case "accessInvitationMembershipSelectionChange": {
      const authoring = projection.authoring;
      const membership = authoring?.membershipSelection;
      const availableIds = new Set(
        membership?.groups.flatMap((group) =>
          group.options.filter((option) => !option.disabledReason).map(({ id }) => id),
        ) ?? [],
      );
      if (
        !authoring ||
        !membership ||
        authoring.pending?.isPending ||
        !sameSelectionIntent(intent, membership.changeIntent) ||
        !distinctStrings(intent.selectedOptionIds).every((id) => availableIds.has(id))
      ) {
        return { kind: "ignored" };
      }
      return {
        draft: { ...options.draft, membershipOptionIds: [...intent.selectedOptionIds] },
        kind: "invitationDraftChange",
      };
    }
    case "accessInvitationSubmit": {
      const authoring = projection.authoring;
      if (
        !authoring ||
        !sameAccessActionIntent(intent, authoring.submit.intent) ||
        authoring.submit.control.disabled === true
      ) {
        return { kind: "ignored" };
      }
      return projection.invitationValidationErrors?.length
        ? { kind: "invitationValidationReveal" }
        : { kind: "invitationSubmit", request: accessInvitationRequest(options, authoring) };
    }
    case "accessPersonRoleAuthoringOpenChange": {
      if (!intent.open) {
        const authoring = projection.personAuthoring;
        return authoring &&
          sameAccessActionIntent(intent, authoring.cancel.intent) &&
          authoring.cancel.control.disabled !== true
          ? { draft: undefined, kind: "personAuthoringChange" }
          : { kind: "ignored" };
      }
      const person = projection.manifest.people.find(({ id }) => id === intent.personId);
      const action =
        person?.roleAuthoring.availability === "available"
          ? person.roleAuthoring.action
          : undefined;
      return action &&
        action.control.disabled !== true &&
        sameAccessActionIntent(intent, action.intent) &&
        options.state.status === "ready"
        ? {
            draft: createInitialAccessPersonRoleDraft(options.state.summary, intent.personId),
            kind: "personAuthoringChange",
          }
        : { kind: "ignored" };
    }
    case "accessPersonRoleSelectionChange": {
      const authoring = projection.personAuthoring;
      if (
        !authoring ||
        authoring.pending?.isPending ||
        !sameSelectionIntent(intent, authoring.roleSelection.changeIntent) ||
        !validSelectedRoleOptionIds(authoring.roleSelection, intent.selectedOptionIds)
      ) {
        return { kind: "ignored" };
      }
      return {
        draft: { personId: authoring.personId, roleOptionIds: [...intent.selectedOptionIds] },
        kind: "personRoleDraftChange",
      };
    }
    case "accessPersonRoleSubmit": {
      const authoring = projection.personAuthoring;
      return authoring &&
        sameAccessActionIntent(intent, authoring.save.intent) &&
        authoring.save.control.disabled !== true
        ? {
            kind: "personRoleSubmit",
            request: accessPersonRoleRequest(options, authoring),
          }
        : { kind: "ignored" };
    }
    case "accessInvitationDeletionConfirmationOpenChange": {
      if (!intent.open) {
        const confirmation = projection.manifest.confirmation;
        return confirmation?.purpose === "invitation-deletion" &&
          sameAccessActionIntent(intent, confirmation.cancel.intent)
          ? { kind: "confirmationChange", target: undefined }
          : { kind: "ignored" };
      }
      const invitation = projection.manifest.invitations.find(
        ({ id }) => id === intent.invitationId,
      );
      const action =
        invitation?.deletion.availability === "available" ? invitation.deletion.action : undefined;
      return action &&
        action.control.disabled !== true &&
        sameAccessActionIntent(intent, action.intent)
        ? {
            kind: "confirmationChange",
            target: { invitationId: intent.invitationId, kind: "invitation-deletion" },
          }
        : { kind: "ignored" };
    }
    case "accessInvitationDelete": {
      const confirmation = projection.manifest.confirmation;
      return confirmation?.purpose === "invitation-deletion" &&
        confirmation.open &&
        confirmation.action.control.disabled !== true &&
        sameAccessActionIntent(intent, confirmation.action.intent)
        ? { invitationId: confirmation.invitationId, kind: "deleteInvitation" }
        : { kind: "ignored" };
    }
    case "accessPersonRemovalConfirmationOpenChange": {
      if (!intent.open) {
        const confirmation = projection.manifest.confirmation;
        return confirmation?.purpose === "person-removal" &&
          sameAccessActionIntent(intent, confirmation.cancel.intent)
          ? { kind: "confirmationChange", target: undefined }
          : { kind: "ignored" };
      }
      const person = projection.manifest.people.find(({ id }) => id === intent.personId);
      const action =
        person?.removal.availability === "available" ? person.removal.action : undefined;
      return action &&
        action.control.disabled !== true &&
        sameAccessActionIntent(intent, action.intent)
        ? {
            kind: "confirmationChange",
            target: { kind: "person-removal", personId: intent.personId },
          }
        : { kind: "ignored" };
    }
    case "accessPersonRemove": {
      const confirmation = projection.manifest.confirmation;
      return confirmation?.purpose === "person-removal" &&
        confirmation.open &&
        confirmation.action.control.disabled !== true &&
        sameAccessActionIntent(intent, confirmation.action.intent)
        ? { kind: "removePerson", personId: confirmation.personId }
        : { kind: "ignored" };
    }
  }
}

export async function dispatchAccessIntent(
  options: ProjectAccessOptions,
  projection: AccessProjection,
  intent: AccessIntent,
  actions: AccessIntentActions,
): Promise<void> {
  const resolved = resolveAccessIntent(options, projection, intent);

  switch (resolved.kind) {
    case "ignored":
      return;
    case "authoringOpenChange":
      actions.changeAuthoringOpen(resolved.open);
      return;
    case "confirmationChange":
      actions.changeConfirmation(resolved.target);
      return;
    case "invitationDraftChange":
      actions.changeDraft(resolved.draft);
      return;
    case "invitationValidationReveal":
      actions.revealInvitationValidation();
      return;
    case "personAuthoringChange":
      actions.changePersonAuthoring(resolved.draft);
      return;
    case "personRoleDraftChange":
      actions.changePersonRoleDraft(resolved.draft);
      return;
    case "invitationSubmit":
      await actions.submitInvitation({
        ...resolved.request,
        idempotencyKey: actions.createIdempotencyKey("invitation"),
      });
      return;
    case "personRoleSubmit":
      await actions.replacePersonRoles({
        ...resolved.request,
        idempotencyKey: actions.createIdempotencyKey("person-role"),
      });
      return;
    case "deleteInvitation":
      await actions.deleteInvitation({ invitationId: resolved.invitationId });
      return;
    case "removePerson":
      await actions.removePerson({
        idempotencyKey: actions.createIdempotencyKey("person-removal"),
        principalId: resolved.personId,
      });
  }
}

function projectAccessInvitationAuthoring(
  options: ProjectAccessOptions,
  summary: IdentityAccessManagementSummary,
  choices: readonly ProjectedRoleChoice[],
  labels: AccessLabels,
): {
  authoring: AccessInvitationAuthoringContract;
  validationErrors: readonly string[];
} {
  const pending = options.submission.status === "submitting";
  const validatedRoleSelection = projectRoleSelection({
    authoringId: instanceAccessInvitationAuthoringReference.authoringId,
    choices,
    pendingReason: pending ? "Invitation creation is in progress." : undefined,
    selectedOptionIds: options.draft.roleOptionIds,
    type: "invitation",
  });
  const validatedFields = projectAccessAuthoringFields(options, validatedRoleSelection, choices);
  const validatedMembershipSelection = projectMembershipSelection(
    options,
    summary.invitationGrantOptions,
    labels,
  );
  const validationErrors = [
    ...Object.values(validatedFields).flatMap((field) => field?.errors ?? []),
    ...validatedRoleSelection.errors,
    ...validatedMembershipSelection.errors,
  ];
  const fields = options.invitationSubmitAttempted
    ? validatedFields
    : {
        ...(validatedFields.acceptanceTarget
          ? {
              acceptanceTarget: {
                ...validatedFields.acceptanceTarget,
                errors: [],
              },
            }
          : {}),
        displayName: { ...validatedFields.displayName, errors: [] },
        targetEmail: { ...validatedFields.targetEmail, errors: [] },
      };
  const roleSelection = options.invitationSubmitAttempted
    ? validatedRoleSelection
    : { ...validatedRoleSelection, errors: [] };
  const membershipSelection = options.invitationSubmitAttempted
    ? validatedMembershipSelection
    : { ...validatedMembershipSelection, errors: [] };
  const errors = options.invitationSubmitAttempted ? validationErrors : [];
  const cancelControl = accessButton(
    ACCESS_AUTHORING_CANCEL_CONTROL_ID,
    "Cancel",
    "secondary",
    "button",
    pending ? "Invitation creation is in progress." : undefined,
  );
  const submitControl = accessButton(
    ACCESS_AUTHORING_SUBMIT_CONTROL_ID,
    pending ? "Sending..." : "Send invite",
    "primary",
    "submit",
    pending
      ? "Invitation creation is in progress."
      : invitationAuthorityDisabledReason(summary.invitationGrantOptions),
  );

  return {
    authoring: {
      accessId: INSTANCE_ACCESS_ID,
      cancel: {
        control: cancelControl,
        id: ACCESS_AUTHORING_CANCEL_ACTION_ID,
        intent: {
          accessId: INSTANCE_ACCESS_ID,
          actionId: ACCESS_AUTHORING_CANCEL_ACTION_ID,
          authoringId: instanceAccessInvitationAuthoringReference.authoringId,
          controlId: cancelControl.id,
          open: false,
          type: "accessInvitationAuthoringOpenChange",
        },
        kind: "accessAction",
        purpose: "authoring-cancel",
      },
      description: "Invite a collaborator and choose their access.",
      errors,
      ...(options.submission.status === "failed"
        ? {
            feedback: accessFeedback(
              "invitation-failed",
              "Invitation could not be created",
              options.submission.message,
              "danger",
            ),
          }
        : {}),
      fields,
      id: instanceAccessInvitationAuthoringReference.authoringId,
      kind: "accessInvitationAuthoring",
      membershipSelection,
      open: options.authoringOpen,
      ...(pending ? { pending: { isPending: true, label: "Sending invitation" } } : {}),
      roleSelection,
      submit: {
        control: submitControl,
        id: ACCESS_AUTHORING_SUBMIT_ACTION_ID,
        intent: {
          accessId: INSTANCE_ACCESS_ID,
          actionId: ACCESS_AUTHORING_SUBMIT_ACTION_ID,
          authoringId: instanceAccessInvitationAuthoringReference.authoringId,
          controlId: submitControl.id,
          type: "accessInvitationSubmit",
        },
        kind: "accessAction",
        purpose: "invitation-submit",
      },
      title: "Invite collaborator",
    },
    validationErrors,
  };
}

function projectAccessAuthoringFields(
  options: ProjectAccessOptions,
  roleSelection: AccessRoleSelectionContract,
  choices: readonly ProjectedRoleChoice[],
): AccessInvitationAuthoringContract["fields"] {
  const pendingReason =
    options.submission.status === "submitting" ? "Invitation creation is in progress." : undefined;
  const selectedSurfaceIds = selectedRoleSurfaceIds(roleSelection, choices);
  const acceptanceOptions = selectedSurfaceIds.map((surfaceId) => {
    const choice = choices.find((candidate) => candidate.surfaceId === surfaceId);
    return fieldOption(
      "acceptance-target",
      surfaceId,
      choice?.surfaceLabel ?? "Unavailable surface",
      surfaceId === options.draft.acceptanceTargetId,
    );
  });
  const acceptanceTarget =
    acceptanceOptions.length > 1
      ? accessField({
          disabledReason: pendingReason,
          errors: acceptanceOptions.some(
            (option) => option.value === options.draft.acceptanceTargetId,
          )
            ? []
            : ["Choose where the invitation continues after acceptance."],
          inputKind: "select",
          label: "Continue to",
          options: acceptanceOptions,
          purpose: "acceptance-target",
          required: true,
          value: options.draft.acceptanceTargetId,
        })
      : undefined;

  return {
    ...(acceptanceTarget ? { acceptanceTarget } : {}),
    displayName: accessField({
      disabledReason: pendingReason,
      errors: requiredTextErrors("Name", options.draft.displayName),
      inputKind: "text",
      label: "Name",
      purpose: "display-name",
      required: true,
      value: options.draft.displayName,
    }),
    targetEmail: accessField({
      disabledReason: pendingReason,
      errors: emailErrors(options.draft.targetEmail),
      inputKind: "email",
      label: "Email",
      purpose: "target-email",
      required: true,
      value: options.draft.targetEmail,
    }),
  };
}

function projectRoleSelection({
  authoringId,
  choices,
  pendingReason,
  personId,
  selectedOptionIds,
  type,
}: {
  authoringId: string;
  choices: readonly ProjectedRoleChoice[];
  pendingReason?: string;
  personId?: string;
  selectedOptionIds: readonly string[];
  type: "invitation" | "person";
}): AccessRoleSelectionContract {
  const knownIds = new Set(choices.map(({ id }) => id));
  const selectedIds = selectedOptionIds.filter((id) => knownIds.has(id));
  const selectedSet = new Set(selectedIds);
  const selectedSurfaces = new Set(
    choices.filter(({ id }) => selectedSet.has(id)).map(({ surfaceId }) => surfaceId),
  );
  const visibleChoices = choices.filter(
    ({ id, surfaceId }) => !selectedSurfaces.has(surfaceId) || selectedSet.has(id),
  );
  const errors = [
    ...(type === "invitation" && selectedIds.length === 0 ? ["Choose at least one role."] : []),
    ...(selectedIds.length !== selectedOptionIds.length
      ? ["Choose only available role levels."]
      : []),
  ];
  const id =
    type === "invitation"
      ? ACCESS_ROLE_SELECTION_ID
      : `${INSTANCE_ACCESS_ID}:person-role-grants:${correlationSegment(personId ?? "")}`;

  return {
    changeIntent:
      type === "invitation"
        ? {
            accessId: INSTANCE_ACCESS_ID,
            authoringId,
            controlId: id,
            type: "accessInvitationRoleSelectionChange",
          }
        : {
            accessId: INSTANCE_ACCESS_ID,
            authoringId,
            controlId: id,
            personId: personId ?? "",
            type: "accessPersonRoleSelectionChange",
          },
    ...(pendingReason ? { disabledReason: pendingReason } : {}),
    errors,
    id,
    kind: "accessRoleSelection",
    label: "Roles",
    options: visibleChoices.map(({ role: _role, surfaceLabel: _surfaceLabel, ...choice }) => ({
      ...choice,
      ...(pendingReason ? { disabledReason: pendingReason } : {}),
      selected: selectedSet.has(choice.id),
    })),
    selectedOptionIds: visibleChoices.filter(({ id }) => selectedSet.has(id)).map(({ id }) => id),
  };
}

function projectMembershipSelection(
  options: ProjectAccessOptions,
  grantOptions: IdentityAccessInvitationGrantOptions,
  labels: AccessLabels,
): AccessMembershipSelectionContract {
  const pendingReason =
    options.submission.status === "submitting" ? "Invitation creation is in progress." : undefined;
  const groups: AccessMembershipOptionGroupContract[] = [
    {
      id: `${INSTANCE_ACCESS_ID}:membership-group:organizations`,
      kind: "accessMembershipOptionGroup",
      label: "Organizations",
      options: grantOptions.memberships
        .filter(({ targetKind }) => targetKind === "organization")
        .map((option) => projectMembershipOption(options, option, labels, pendingReason)),
    },
    {
      id: `${INSTANCE_ACCESS_ID}:membership-group:groups`,
      kind: "accessMembershipOptionGroup",
      label: "Groups",
      options: grantOptions.memberships
        .filter(({ targetKind }) => targetKind === "group")
        .map((option) => projectMembershipOption(options, option, labels, pendingReason)),
    },
  ];
  const selectedOptionIds = groups.flatMap(({ options: groupOptions }) =>
    groupOptions.filter(({ selected }) => selected).map(({ id }) => id),
  );
  const errors = distinctStrings(
    groups.flatMap(({ options: groupOptions }) =>
      groupOptions.flatMap((option) =>
        option.selected && option.disabledReason ? [option.disabledReason] : [],
      ),
    ),
  );

  return {
    changeIntent: {
      accessId: INSTANCE_ACCESS_ID,
      authoringId: instanceAccessInvitationAuthoringReference.authoringId,
      controlId: ACCESS_MEMBERSHIP_SELECTION_ID,
      type: "accessInvitationMembershipSelectionChange",
    },
    ...(pendingReason ? { disabledReason: pendingReason } : {}),
    errors,
    groups,
    id: ACCESS_MEMBERSHIP_SELECTION_ID,
    kind: "accessMembershipSelection",
    label: "Memberships",
    selectedOptionIds,
  };
}

function projectMembershipOption(
  options: ProjectAccessOptions,
  option: IdentityAccessInvitationMembershipGrantOption,
  labels: AccessLabels,
  pendingReason: string | undefined,
) {
  const id = accessMembershipOptionId(option);
  const targetId =
    option.targetKind === "group" ? option.targetGroupId : option.targetOrganizationId;
  const targetLabels = option.targetKind === "group" ? labels.groups : labels.organizations;
  const unavailableLabel =
    option.targetKind === "group" ? "Unavailable group" : "Unavailable organization";
  const available = targetId !== undefined && targetLabels.has(targetId);

  return {
    ...((pendingReason ?? (available ? undefined : `${unavailableLabel}.`))
      ? { disabledReason: pendingReason ?? `${unavailableLabel}.` }
      : {}),
    id,
    label: targetId ? (targetLabels.get(targetId) ?? unavailableLabel) : unavailableLabel,
    selected: options.draft.membershipOptionIds.includes(id),
  };
}

function projectAccessPeople(
  options: ProjectAccessOptions,
  summary: IdentityAccessManagementSummary,
  choices: readonly ProjectedRoleChoice[],
  labels: AccessLabels,
): readonly AccessPersonContract[] {
  const rolesByPrincipalId = rolesByPrincipal(summary);
  const canManage = canManageInvitations(summary.invitationGrantOptions);
  const activeOwnerIds = new Set(
    summary.roles
      .filter(
        (role) =>
          role.status === "active" &&
          role.roleKey === "instance.owner" &&
          role.targetKind === "principal" &&
          role.targetPrincipalId,
      )
      .map(({ targetPrincipalId }) => targetPrincipalId as string),
  );

  return summary.people.map((person) => {
    const personRoles = rolesByPrincipalId.get(person.principalId) ?? [];
    const hasOwner = personRoles.some(({ roleKey }) => roleKey === "instance.owner");
    const reference = instanceAccessPersonRoleAuthoringReference(person.principalId);
    const editPending =
      options.personRoleSubmission.status === "submitting" &&
      options.personRoleSubmission.personId === person.principalId;
    const removalReason = !canManage
      ? "Owner or administrator access is required."
      : !summary.invitationGrantOptions.authority.instanceOwner && hasOwner
        ? "Program administrators cannot remove an owner."
        : hasOwner && activeOwnerIds.size <= 1
          ? "The last active owner cannot be removed."
          : undefined;
    const editControl = accessButton(
      `${reference.authoringId}:open-control`,
      "Edit roles",
      "secondary",
      "button",
      editPending ? "Role replacement is in progress." : undefined,
    );
    const removalPendingPersonId =
      options.personRemoval.status === "submitting" ? options.personRemoval.personId : undefined;
    const removalControl = accessButton(
      `${INSTANCE_ACCESS_ID}:person-removal-open-control:${correlationSegment(person.principalId)}`,
      "Remove person",
      "secondary",
      "button",
      removalReason ??
        (removalPendingPersonId
          ? removalPendingPersonId === person.principalId
            ? "Person removal is in progress."
            : "Another person removal is in progress."
          : undefined),
    );
    const canEdit = canManage && choices.length > 0;

    return {
      displayName: safeLabel(person.displayName, "Unnamed person"),
      id: person.principalId,
      kind: "accessPerson",
      ...(person.primaryEmail
        ? { primaryEmail: displaySafeText(person.primaryEmail.displayEmail) }
        : {}),
      removal: removalReason
        ? {
            availability: "unavailable",
            control: removalControl,
            disabledReason: removalReason,
          }
        : {
            action: {
              control: removalControl,
              id: `${INSTANCE_ACCESS_ID}:person-removal-open:${correlationSegment(person.principalId)}`,
              intent: {
                accessId: INSTANCE_ACCESS_ID,
                actionId: `${INSTANCE_ACCESS_ID}:person-removal-open:${correlationSegment(person.principalId)}`,
                confirmationId: ACCESS_CONFIRMATION_ID,
                controlId: removalControl.id,
                open: true,
                personId: person.principalId,
                type: "accessPersonRemovalConfirmationOpenChange",
              },
              kind: "accessAction",
              purpose: "person-removal-open",
            },
            availability: "available",
          },
      roleAuthoring: canEdit
        ? {
            action: {
              control: editControl,
              id: `${reference.authoringId}:open`,
              intent: {
                accessId: INSTANCE_ACCESS_ID,
                actionId: `${reference.authoringId}:open`,
                authoringId: reference.authoringId,
                controlId: editControl.id,
                open: true,
                personId: person.principalId,
                type: "accessPersonRoleAuthoringOpenChange",
              },
              kind: "accessAction",
              purpose: "person-role-authoring-open",
            },
            availability: "available",
            reference,
          }
        : {
            availability: "unavailable",
            disabledReason: "No role levels are available to manage.",
          },
      roles: personRoles.map((role) => ({
        id: role.roleAssignmentId,
        kind: "accessRole",
        label: accessRoleLabel(role.roleKey),
        scope: accessFact(
          `${role.roleAssignmentId}:scope`,
          "Scope",
          accessRoleScopeLabel(role, labels),
        ),
      })),
      status: accessStatusFact(`${person.principalId}:status`, person.status),
    };
  });
}

function projectAccessPersonRoleAuthoring(
  options: ProjectAccessOptions,
  summary: IdentityAccessManagementSummary,
  choices: readonly ProjectedRoleChoice[],
): AccessPersonRoleAuthoringContract | undefined {
  const draft = options.personAuthoringDraft;
  if (!draft) {
    return undefined;
  }
  const person = summary.people.find(({ principalId }) => principalId === draft.personId);
  if (!person) {
    return undefined;
  }
  const reference = instanceAccessPersonRoleAuthoringReference(person.principalId);
  const pending =
    options.personRoleSubmission.status === "submitting" &&
    options.personRoleSubmission.personId === person.principalId;
  const activeOwnerIds = new Set(
    summary.roles
      .filter(
        (role) =>
          role.status === "active" &&
          role.roleKey === "instance.owner" &&
          role.targetKind === "principal" &&
          role.targetPrincipalId,
      )
      .map(({ targetPrincipalId }) => targetPrincipalId as string),
  );
  const protectsLastOwner =
    activeOwnerIds.size === 1 &&
    activeOwnerIds.has(person.principalId) &&
    summary.invitationGrantOptions.authority.instanceOwner;
  const authoringChoices = choices.map((choice) =>
    protectsLastOwner && choice.role.roleKey === "instance.owner"
      ? { ...choice, disabledReason: "The last active owner role cannot be removed." }
      : choice,
  );
  const roleSelection = projectRoleSelection({
    authoringId: reference.authoringId,
    choices: authoringChoices,
    pendingReason: pending ? "Role replacement is in progress." : undefined,
    personId: person.principalId,
    selectedOptionIds: draft.roleOptionIds,
    type: "person",
  });
  const cancelControl = accessButton(
    `${reference.authoringId}:cancel-control`,
    "Cancel",
    "secondary",
    "button",
    pending ? "Role replacement is in progress." : undefined,
  );
  const saveControl = accessButton(
    `${reference.authoringId}:save-control`,
    pending ? "Saving..." : "Save roles",
    "primary",
    "submit",
    pending ? "Role replacement is in progress." : roleSelection.errors[0],
  );

  return {
    accessId: INSTANCE_ACCESS_ID,
    cancel: {
      control: cancelControl,
      id: `${reference.authoringId}:cancel`,
      intent: {
        accessId: INSTANCE_ACCESS_ID,
        actionId: `${reference.authoringId}:cancel`,
        authoringId: reference.authoringId,
        controlId: cancelControl.id,
        open: false,
        personId: person.principalId,
        type: "accessPersonRoleAuthoringOpenChange",
      },
      kind: "accessAction",
      purpose: "person-role-authoring-cancel",
    },
    description: `Choose the exact role levels managed for ${safeLabel(person.displayName, "this person")}.`,
    displayName: safeLabel(person.displayName, "Unnamed person"),
    errors: roleSelection.errors,
    ...(options.personRoleSubmission.status === "failed" &&
    options.personRoleSubmission.personId === person.principalId
      ? {
          feedback: accessFeedback(
            "person-role-failed",
            "Roles could not be saved",
            options.personRoleSubmission.message,
            "danger",
          ),
        }
      : {}),
    id: reference.authoringId,
    kind: "accessPersonRoleAuthoring",
    open: true,
    ...(pending ? { pending: { isPending: true, label: "Saving roles" } } : {}),
    personId: person.principalId,
    roleSelection,
    save: {
      control: saveControl,
      id: `${reference.authoringId}:save`,
      intent: {
        accessId: INSTANCE_ACCESS_ID,
        actionId: `${reference.authoringId}:save`,
        authoringId: reference.authoringId,
        controlId: saveControl.id,
        personId: person.principalId,
        type: "accessPersonRoleSubmit",
      },
      kind: "accessAction",
      purpose: "person-role-save",
    },
    title: `Edit roles for ${safeLabel(person.displayName, "person")}`,
  };
}

function projectAccessInvitations(
  options: ProjectAccessOptions,
  summary: IdentityAccessManagementSummary,
  labels: AccessLabels,
): readonly AccessInvitationContract[] {
  const canManage = canManageInvitations(summary.invitationGrantOptions);

  return summary.invitations.map((invitation) => {
    const pending =
      options.invitationDeletion.status === "submitting" &&
      options.invitationDeletion.invitationId === invitation.invitationId;
    const disabledReason =
      options.invitationDeletion.status === "submitting"
        ? pending
          ? "Invitation deletion is in progress."
          : "Another invitation deletion is in progress."
        : undefined;
    const control = accessButton(
      `${INSTANCE_ACCESS_ID}:invitation-delete-open-control:${correlationSegment(invitation.invitationId)}`,
      pending ? "Deleting..." : "Delete invitation",
      "secondary",
      "button",
      disabledReason,
    );
    const deletion =
      invitation.status !== "pending"
        ? { availability: "unavailable" as const }
        : !canManage
          ? {
              availability: "unavailable" as const,
              disabledReason: "Owner or administrator access is required.",
            }
          : {
              action: {
                control,
                id: `${INSTANCE_ACCESS_ID}:invitation-delete-open:${correlationSegment(invitation.invitationId)}`,
                intent: {
                  accessId: INSTANCE_ACCESS_ID,
                  actionId: `${INSTANCE_ACCESS_ID}:invitation-delete-open:${correlationSegment(invitation.invitationId)}`,
                  confirmationId: ACCESS_CONFIRMATION_ID,
                  controlId: control.id,
                  invitationId: invitation.invitationId,
                  open: true,
                  type: "accessInvitationDeletionConfirmationOpenChange" as const,
                },
                kind: "accessAction" as const,
                purpose: "invitation-deletion-open" as const,
              },
              availability: "available" as const,
            };

    return {
      deletion,
      expiresAt: accessFact(
        `${invitation.invitationId}:expires-at`,
        "Expires",
        invitation.expiresAt,
        "timestamp",
      ),
      id: invitation.invitationId,
      ...(invitation.inviterPrincipalId
        ? {
            inviter: accessFact(
              `${invitation.invitationId}:inviter`,
              "Invited by",
              labels.people.get(invitation.inviterPrincipalId) ?? "Unavailable person",
            ),
          }
        : {}),
      kind: "accessInvitation",
      scope: accessFact(
        `${invitation.invitationId}:scope`,
        "Scope",
        accessInvitationScopeLabel(invitation, labels),
      ),
      status: accessStatusFact(`${invitation.invitationId}:status`, invitation.status),
      target: accessFact(
        `${invitation.invitationId}:target`,
        "Target",
        fieldKeyLabel(invitation.targetSurface),
      ),
      targetEmail: displaySafeText(invitation.targetEmail),
    };
  });
}

function projectAccessConfirmation(
  options: ProjectAccessOptions,
  people: readonly AccessPersonContract[],
  invitations: readonly AccessInvitationContract[],
): AccessConfirmationContract | undefined {
  const target = options.confirmation;
  if (!target) {
    return undefined;
  }

  if (target.kind === "invitation-deletion") {
    const invitation = invitations.find(({ id }) => id === target.invitationId);
    if (!invitation || invitation.deletion.availability !== "available") {
      return undefined;
    }
    const pending =
      options.invitationDeletion.status === "submitting" &&
      options.invitationDeletion.invitationId === invitation.id;
    const cancelControl = accessButton(
      `${ACCESS_CONFIRMATION_ID}:cancel-control`,
      "Cancel",
      "secondary",
      "button",
      pending ? "Invitation deletion is in progress." : undefined,
    );
    const actionControl = accessButton(
      `${ACCESS_CONFIRMATION_ID}:action-control`,
      pending ? "Deleting..." : "Delete invitation",
      "primary",
      "button",
      pending ? "Invitation deletion is in progress." : undefined,
    );

    return {
      action: accessAction(
        `${ACCESS_CONFIRMATION_ID}:action`,
        actionControl,
        {
          accessId: INSTANCE_ACCESS_ID,
          actionId: `${ACCESS_CONFIRMATION_ID}:action`,
          confirmationId: ACCESS_CONFIRMATION_ID,
          controlId: actionControl.id,
          invitationId: invitation.id,
          type: "accessInvitationDelete",
        },
        "invitation-delete",
      ),
      cancel: accessAction(
        `${ACCESS_CONFIRMATION_ID}:cancel`,
        cancelControl,
        {
          accessId: INSTANCE_ACCESS_ID,
          actionId: `${ACCESS_CONFIRMATION_ID}:cancel`,
          confirmationId: ACCESS_CONFIRMATION_ID,
          controlId: cancelControl.id,
          invitationId: invitation.id,
          open: false,
          type: "accessInvitationDeletionConfirmationOpenChange",
        },
        "invitation-deletion-cancel",
      ),
      description: `The pending invitation for ${invitation.targetEmail} will no longer be usable.`,
      id: ACCESS_CONFIRMATION_ID,
      invitationId: invitation.id,
      kind: "accessConfirmation",
      open: true,
      purpose: "invitation-deletion",
      title: "Delete invitation?",
    };
  }

  const person = people.find(({ id }) => id === target.personId);
  if (!person || person.removal.availability !== "available") {
    return undefined;
  }
  const pending =
    options.personRemoval.status === "submitting" && options.personRemoval.personId === person.id;
  const cancelControl = accessButton(
    `${ACCESS_CONFIRMATION_ID}:cancel-control`,
    "Cancel",
    "secondary",
    "button",
    pending ? "Person removal is in progress." : undefined,
  );
  const actionControl = accessButton(
    `${ACCESS_CONFIRMATION_ID}:action-control`,
    pending ? "Removing..." : "Remove person",
    "primary",
    "button",
    pending ? "Person removal is in progress." : undefined,
  );

  return {
    action: accessAction(
      `${ACCESS_CONFIRMATION_ID}:action`,
      actionControl,
      {
        accessId: INSTANCE_ACCESS_ID,
        actionId: `${ACCESS_CONFIRMATION_ID}:action`,
        confirmationId: ACCESS_CONFIRMATION_ID,
        controlId: actionControl.id,
        personId: person.id,
        type: "accessPersonRemove",
      },
      "person-remove",
    ),
    cancel: accessAction(
      `${ACCESS_CONFIRMATION_ID}:cancel`,
      cancelControl,
      {
        accessId: INSTANCE_ACCESS_ID,
        actionId: `${ACCESS_CONFIRMATION_ID}:cancel`,
        confirmationId: ACCESS_CONFIRMATION_ID,
        controlId: cancelControl.id,
        open: false,
        personId: person.id,
        type: "accessPersonRemovalConfirmationOpenChange",
      },
      "person-removal-cancel",
    ),
    description: `${person.displayName} will lose access immediately. Reviewable identity records are retained.`,
    id: ACCESS_CONFIRMATION_ID,
    kind: "accessConfirmation",
    open: true,
    personId: person.id,
    purpose: "person-removal",
    title: "Remove person?",
  };
}

function accessInviteAction(
  summary: IdentityAccessManagementSummary,
  submission: AccessInvitationSubmissionState,
): AccessActionContract<AccessInvitationAuthoringOpenChangeIntent> {
  const control = accessButton(
    ACCESS_INVITE_CONTROL_ID,
    "Invite collaborator",
    "primary",
    "button",
    submission.status === "submitting"
      ? "Invitation creation is in progress."
      : invitationAuthorityDisabledReason(summary.invitationGrantOptions),
  );

  return {
    control,
    id: ACCESS_INVITE_ACTION_ID,
    intent: {
      accessId: INSTANCE_ACCESS_ID,
      actionId: ACCESS_INVITE_ACTION_ID,
      authoringId: instanceAccessInvitationAuthoringReference.authoringId,
      controlId: control.id,
      open: true,
      type: "accessInvitationAuthoringOpenChange",
    },
    kind: "accessAction",
    purpose: "authoring-open",
  };
}

function accessInvitationRequest(
  options: ProjectAccessOptions,
  authoring: AccessInvitationAuthoringContract,
): Omit<CreateIdentityAccessManagementInvitationInput, "idempotencyKey"> {
  if (options.state.status !== "ready") {
    throw new Error("Access invitation request requires a ready summary.");
  }
  const choices = projectRoleChoices(
    options.state.summary.invitationGrantOptions,
    accessLabels(options.state.summary, options.installs),
  );
  const selected = choices.filter(({ id }) =>
    authoring.roleSelection.selectedOptionIds.includes(id),
  );
  const selectedMembershipIds = new Set(authoring.membershipSelection.selectedOptionIds);
  const memberships: NonNullable<CreateIdentityAccessManagementInvitationInput["memberships"]> = [];
  for (const option of options.state.summary.invitationGrantOptions.memberships) {
    if (!selectedMembershipIds.has(accessMembershipOptionId(option))) {
      continue;
    }
    if (option.targetKind === "group" && option.targetGroupId) {
      memberships.push({ targetGroup: option.targetGroupId, targetKind: "group" });
    } else if (option.targetKind === "organization" && option.targetOrganizationId) {
      memberships.push({
        targetKind: "organization",
        targetOrganization: option.targetOrganizationId,
      });
    }
  }
  const surfaceIds = distinctStrings(selected.map(({ surfaceId }) => surfaceId));
  const acceptanceTargetId =
    surfaceIds.length === 1 ? surfaceIds[0] : options.draft.acceptanceTargetId;
  const acceptanceChoice = selected.find(({ surfaceId }) => surfaceId === acceptanceTargetId);
  if (!acceptanceChoice) {
    throw new Error("Access invitation requires a selected acceptance target.");
  }
  const target = invitationTargetFromRole(acceptanceChoice.role);
  const appRegistrations = distinctStrings(
    selected.flatMap(({ role }) => (role.scopeKind === "app-install" ? [role.appInstallId] : [])),
  ).map((appInstallId) => ({ appInstallId }));

  return {
    ...target,
    appRegistrations,
    invitedPrincipal: { displayName: options.draft.displayName.trim() },
    memberships,
    principalEmail: { primary: true, recovery: false },
    roleAssignments: selected.map(({ role }) => invitationRoleAssignment(role)),
    targetEmail: options.draft.targetEmail.trim(),
  };
}

function accessPersonRoleRequest(
  options: ProjectAccessOptions,
  authoring: AccessPersonRoleAuthoringContract,
): Omit<IdentityAccessPersonRoleReplacementRequest, "idempotencyKey"> {
  if (options.state.status !== "ready") {
    throw new Error("Access person role request requires a ready summary.");
  }
  const choices = projectRoleChoices(
    options.state.summary.invitationGrantOptions,
    accessLabels(options.state.summary, options.installs),
  );
  const byId = new Map(choices.map((choice) => [choice.id, choice.role]));

  return {
    principalId: authoring.personId,
    roles: authoring.roleSelection.selectedOptionIds.map((id) =>
      identityPersonRoleSelection(required(byId.get(id))),
    ),
  };
}

function projectRoleChoices(
  grantOptions: IdentityAccessInvitationGrantOptions,
  labels: AccessLabels,
): readonly ProjectedRoleChoice[] {
  return grantOptions.roles.map((role) => {
    const surface = accessRoleSurface(role, labels);
    return {
      id: accessRoleOptionId(role),
      label: safeLabel(role.displayLabel, `${surface.label} — Unnamed role`),
      role,
      selected: false,
      surfaceId: surface.id,
      surfaceKind: role.scopeKind,
      surfaceLabel: surface.label,
    };
  });
}

function accessRoleSurface(
  role: IdentityAccessInvitationRoleGrantOption,
  labels: AccessLabels,
): { id: string; label: string } {
  if (role.scopeKind === "app-install") {
    return {
      id: `app-install:${role.appInstallId}`,
      label: labels.installs.get(role.appInstallId) ?? "Unavailable app install",
    };
  }
  if (role.scopeKind === "organization") {
    return {
      id: `organization:${role.scopeOrganizationId}`,
      label: labels.organizations.get(role.scopeOrganizationId) ?? "Unavailable organization",
    };
  }
  if (role.scopeKind === "program") {
    return { id: "program", label: "Program" };
  }
  return { id: "instance", label: "Instance" };
}

function invitationTargetFromRole(
  role: IdentityAccessInvitationRoleGrantOption,
):
  | { targetAppInstallId: string; targetSurface: "app-install" }
  | { targetOrganization: string; targetSurface: "organization" }
  | { targetSurface: "instance" } {
  if (role.scopeKind === "app-install") {
    return { targetAppInstallId: role.appInstallId, targetSurface: "app-install" };
  }
  if (role.scopeKind === "organization") {
    return {
      targetOrganization: role.scopeOrganizationId,
      targetSurface: "organization",
    };
  }
  return { targetSurface: "instance" };
}

function invitationRoleAssignment(
  role: IdentityAccessInvitationRoleGrantOption,
): NonNullable<CreateIdentityAccessManagementInvitationInput["roleAssignments"]>[number] {
  if (role.scopeKind === "app-install") {
    return {
      appInstallId: role.appInstallId,
      roleKey: role.roleKey,
      scopeKind: "app-install",
    };
  }
  if (role.scopeKind === "organization") {
    return {
      roleKey: role.roleKey,
      scopeKind: "organization",
      scopeOrganization: role.scopeOrganizationId,
    };
  }
  if (role.scopeKind === "program") {
    return { roleId: role.roleId, scopeKind: "program" };
  }
  return { roleKey: role.roleKey, scopeKind: "instance" };
}

function identityPersonRoleSelection(
  role: IdentityAccessInvitationRoleGrantOption,
): IdentityAccessPersonRoleSelection {
  if (role.scopeKind === "app-install") {
    return {
      appInstallId: role.appInstallId,
      roleKey: role.roleKey,
      scopeKind: "app-install",
    };
  }
  if (role.scopeKind === "organization") {
    return {
      roleKey: role.roleKey,
      scopeKind: "organization",
      scopeOrganizationId: role.scopeOrganizationId,
    };
  }
  if (role.scopeKind === "program") {
    return { roleId: role.roleId, scopeKind: "program" };
  }
  return { roleKey: role.roleKey, scopeKind: "instance" };
}

function rolesByPrincipal(summary: IdentityAccessManagementSummary) {
  const roles = new Map<
    string,
    Array<IdentityAccessProgramRoleSummary | IdentityAccessRoleSummary>
  >();
  for (const role of summary.programRoles) {
    if (role.status !== "active") {
      continue;
    }
    roles.set(role.targetPrincipalId, [...(roles.get(role.targetPrincipalId) ?? []), role]);
  }
  for (const role of summary.roles) {
    if (
      role.status !== "active" ||
      role.targetKind !== "principal" ||
      role.targetPrincipalId === undefined
    ) {
      continue;
    }
    roles.set(role.targetPrincipalId, [...(roles.get(role.targetPrincipalId) ?? []), role]);
  }
  return roles;
}

function accessLabels(
  summary: IdentityAccessManagementSummary,
  installs: readonly AppInstall[],
): AccessLabels {
  return {
    groups: new Map(
      summary.groups.map((group) => [group.groupId, safeLabel(group.displayName, "Unnamed group")]),
    ),
    installs: new Map(
      installs.map((install) => [install.installId, safeLabel(install.label, "Unnamed app")]),
    ),
    organizations: new Map(
      summary.organizations.map((organization) => [
        organization.organizationId,
        safeLabel(organization.displayName, "Unnamed organization"),
      ]),
    ),
    people: new Map(
      summary.people.map((person) => [
        person.principalId,
        safeLabel(person.displayName, "Unnamed person"),
      ]),
    ),
  };
}

function accessRoleScopeLabel(
  role: IdentityAccessProgramRoleSummary | IdentityAccessRoleSummary,
  labels: AccessLabels,
): string {
  if (role.scopeKind === "program") {
    return "Program";
  }
  if (role.scopeKind === "app-install") {
    return role.appInstallId
      ? (labels.installs.get(role.appInstallId) ?? "Unavailable app install")
      : "Unavailable app install";
  }
  if (role.scopeKind === "organization") {
    return role.scopeOrganizationId
      ? (labels.organizations.get(role.scopeOrganizationId) ?? "Unavailable organization")
      : "Unavailable organization";
  }
  return "Instance";
}

function accessRoleLabel(roleKey: string): string {
  switch (roleKey) {
    case "instance.owner":
      return "Owner";
    case "app.admin":
      return "Administrator";
    case "app.editor":
      return "Editor";
    case "app.viewer":
      return "Viewer";
    case "app.user":
      return "User";
    default:
      return fieldKeyLabel(roleKey);
  }
}

function accessInvitationScopeLabel(
  invitation: IdentityAccessInvitationSummary,
  labels: AccessLabels,
): string {
  if (invitation.targetSurface === "app-install") {
    return invitation.targetAppInstallId
      ? (labels.installs.get(invitation.targetAppInstallId) ?? "Unavailable app install")
      : "Unavailable app install";
  }
  if (invitation.targetSurface === "organization") {
    return invitation.targetOrganizationId
      ? (labels.organizations.get(invitation.targetOrganizationId) ?? "Unavailable organization")
      : "Unavailable organization";
  }
  return "Instance";
}

function accessRoleSummaryOptionId(
  role: IdentityAccessProgramRoleSummary | IdentityAccessRoleSummary,
): string {
  const surface =
    role.scopeKind === "app-install"
      ? (role.appInstallId ?? "unavailable")
      : role.scopeKind === "organization"
        ? (role.scopeOrganizationId ?? "unavailable")
        : role.scopeKind === "program"
          ? "program"
          : "instance";
  return `${INSTANCE_ACCESS_ID}:role-option:${correlationSegment(role.scopeKind)}:${correlationSegment(surface)}:${correlationSegment(role.roleKey)}`;
}

function accessRoleOptionId(option: IdentityAccessInvitationRoleGrantOption): string {
  const surface =
    option.scopeKind === "app-install"
      ? option.appInstallId
      : option.scopeKind === "organization"
        ? option.scopeOrganizationId
        : option.scopeKind === "program"
          ? "program"
          : "instance";
  return `${INSTANCE_ACCESS_ID}:role-option:${correlationSegment(option.scopeKind)}:${correlationSegment(surface)}:${correlationSegment(option.roleKey)}`;
}

function accessMembershipOptionId(option: IdentityAccessInvitationMembershipGrantOption): string {
  const targetId =
    option.targetKind === "group" ? option.targetGroupId : option.targetOrganizationId;
  return `${INSTANCE_ACCESS_ID}:membership-option:${correlationSegment(option.targetKind)}:${correlationSegment(targetId ?? "unavailable")}`;
}

function selectedRoleSurfaceIds(
  selection: AccessRoleSelectionContract,
  choices: readonly ProjectedRoleChoice[],
): readonly string[] {
  const byId = new Map(choices.map((choice) => [choice.id, choice.surfaceId]));
  return distinctStrings(
    selection.selectedOptionIds.flatMap((id) => {
      const surfaceId = byId.get(id);
      return surfaceId ? [surfaceId] : [];
    }),
  );
}

function accessInvitationDraftWithRoles(
  draft: AccessInvitationDraft,
  selection: AccessRoleSelectionContract,
  selectedOptionIds: readonly string[],
): AccessInvitationDraft {
  const byId = new Map(selection.options.map((option) => [option.id, option.surfaceId]));
  const surfaceIds = distinctStrings(
    selectedOptionIds.flatMap((id) => {
      const surfaceId = byId.get(id);
      return surfaceId ? [surfaceId] : [];
    }),
  );
  return {
    ...draft,
    acceptanceTargetId:
      surfaceIds.length === 1
        ? (surfaceIds[0] ?? "")
        : surfaceIds.includes(draft.acceptanceTargetId)
          ? draft.acceptanceTargetId
          : "",
    roleOptionIds: [...selectedOptionIds],
  };
}

function validSelectedRoleOptionIds(
  selection: AccessRoleSelectionContract,
  selectedOptionIds: readonly string[],
): boolean {
  if (distinctStrings(selectedOptionIds).length !== selectedOptionIds.length) {
    return false;
  }
  const optionsById = new Map(selection.options.map((option) => [option.id, option]));
  const currentSelected = new Set(selection.selectedOptionIds);
  const selectedSurfaces = new Set<string>();
  for (const id of selectedOptionIds) {
    const option = optionsById.get(id);
    if (!option || (option.disabledReason && !currentSelected.has(id))) {
      return false;
    }
    if (selectedSurfaces.has(option.surfaceId)) {
      return false;
    }
    selectedSurfaces.add(option.surfaceId);
  }
  return selection.options
    .filter((option) => option.disabledReason && option.selected)
    .every((option) => selectedOptionIds.includes(option.id));
}

function readyFeedback(options: ProjectAccessOptions): AccessFeedbackContract | undefined {
  if (options.personRemoval.status === "failed") {
    return accessFeedback(
      "person-removal-failed",
      "Person could not be removed",
      options.personRemoval.message,
      "danger",
    );
  }
  if (options.personRemoval.status === "succeeded") {
    return accessFeedback(
      "person-removal-succeeded",
      "Person removed",
      options.personRemoval.message,
      "success",
    );
  }
  if (options.personRoleSubmission.status === "succeeded") {
    return accessFeedback(
      "person-role-succeeded",
      "Roles saved",
      options.personRoleSubmission.message,
      "success",
    );
  }
  if (options.invitationDeletion.status === "failed") {
    return accessFeedback(
      "invitation-deletion-failed",
      "Invitation could not be deleted",
      options.invitationDeletion.message,
      "danger",
    );
  }
  if (options.invitationDeletion.status === "succeeded") {
    return accessFeedback(
      "invitation-deletion-succeeded",
      "Invitation deleted",
      options.invitationDeletion.message,
      "success",
    );
  }
  if (options.submission.status === "succeeded") {
    return accessFeedback(
      "invitation-succeeded",
      "Invitation created",
      options.submission.message,
      "success",
    );
  }
  return undefined;
}

function accessFeedback(
  id: string,
  title: string,
  detail: string,
  intent: CompactStatusIntent,
): AccessFeedbackContract {
  return {
    detail: displaySafeText(detail),
    id: `${INSTANCE_ACCESS_ID}:feedback:${id}`,
    intent,
    kind: "accessFeedback",
    title,
  };
}

function accessField({
  disabledReason,
  errors,
  inputKind,
  label,
  options,
  purpose,
  required,
  value,
}: {
  disabledReason?: string;
  errors: readonly string[];
  inputKind: AccessControlledFieldContract["inputKind"];
  label: string;
  options?: AccessControlledFieldContract["options"];
  purpose: AccessInvitationFieldPurpose;
  required: boolean;
  value: string;
}): AccessControlledFieldContract {
  const id = `${INSTANCE_ACCESS_ID}:field:${purpose}`;
  return {
    changeIntent: {
      accessId: INSTANCE_ACCESS_ID,
      authoringId: instanceAccessInvitationAuthoringReference.authoringId,
      fieldId: id,
      type: "accessInvitationFieldChange",
    },
    ...(disabledReason ? { disabledReason } : {}),
    errors,
    id,
    inputKind,
    kind: "accessControlledField",
    label,
    ...(options ? { options } : {}),
    purpose,
    required,
    value,
  };
}

function fieldOption(kind: string, value: string, label: string, selected: boolean) {
  return {
    id: `${INSTANCE_ACCESS_ID}:${kind}-option:${correlationSegment(value)}`,
    label,
    selected,
    value,
  };
}

function accessFact(
  id: string,
  label: string,
  value: string,
  presentation: AccessDisplayFactContract["presentation"] = "text",
  intent?: CompactStatusIntent,
): AccessDisplayFactContract {
  return {
    id,
    ...(intent ? { intent } : {}),
    kind: "accessDisplayFact",
    label,
    presentation,
    value: displaySafeText(value),
  };
}

function accessStatusFact(id: string, value: string): AccessDisplayFactContract {
  return accessFact(id, "Status", fieldKeyLabel(value), "status", statusIntent(value));
}

function statusIntent(value: string): CompactStatusIntent {
  if (["accepted", "active", "verified"].includes(value)) {
    return "success";
  }
  if (["invited", "pending", "unverified"].includes(value)) {
    return "warning";
  }
  if (["disabled", "expired", "revoked"].includes(value)) {
    return "danger";
  }
  return "neutral";
}

function accessButton(
  id: string,
  label: string,
  prominence: ButtonContract["prominence"],
  type: ButtonContract["type"],
  disabledReason?: string,
): ButtonContract {
  return {
    accessibilityLabel: label,
    content: { kind: "label", label },
    density: "default",
    ...(disabledReason ? { disabled: true, disabledReason, errors: [disabledReason] } : {}),
    id,
    kind: "button",
    prominence,
    type,
  };
}

function accessAction<
  Intent extends
    | AccessInvitationDeleteIntent
    | AccessInvitationDeletionConfirmationOpenChangeIntent
    | AccessPersonRemoveIntent
    | AccessPersonRemovalConfirmationOpenChangeIntent,
>(
  id: string,
  control: ButtonContract,
  intent: Intent,
  purpose: AccessActionContract<Intent>["purpose"],
): AccessActionContract<Intent> {
  return { control, id, intent, kind: "accessAction", purpose };
}

function invitationAuthorityDisabledReason(
  grantOptions: IdentityAccessInvitationGrantOptions,
): string | undefined {
  return canManageInvitations(grantOptions)
    ? undefined
    : "Owner or administrator access is required.";
}

function canManageInvitations(grantOptions: IdentityAccessInvitationGrantOptions): boolean {
  return grantOptions.authority.instanceOwner || grantOptions.authority.programAdministrator;
}

function accessDraftWithFieldValue(
  draft: AccessInvitationDraft,
  purpose: AccessInvitationFieldPurpose,
  value: string,
): AccessInvitationDraft {
  switch (purpose) {
    case "acceptance-target":
      return { ...draft, acceptanceTargetId: value };
    case "display-name":
      return { ...draft, displayName: value };
    case "target-email":
      return { ...draft, targetEmail: value };
  }
}

function sameAccessActionIntent(
  actual: AccessIntent,
  expected:
    | AccessInvitationAuthoringOpenChangeIntent
    | AccessInvitationDeleteIntent
    | AccessInvitationDeletionConfirmationOpenChangeIntent
    | AccessInvitationSubmitIntent
    | AccessPersonRemoveIntent
    | AccessPersonRemovalConfirmationOpenChangeIntent
    | AccessPersonRoleAuthoringOpenChangeIntent
    | AccessPersonRoleSubmitIntent,
): boolean {
  if (actual.type !== expected.type) {
    return false;
  }
  return Object.entries(expected).every(
    ([key, value]) => (actual as unknown as Record<string, unknown>)[key] === value,
  );
}

function sameSelectionIntent(
  actual: AccessIntent,
  expected: { accessId: string; authoringId: string; controlId: string; type: string },
): boolean {
  return (
    actual.type === expected.type &&
    "authoringId" in actual &&
    "controlId" in actual &&
    actual.accessId === expected.accessId &&
    actual.authoringId === expected.authoringId &&
    actual.controlId === expected.controlId &&
    (!("personId" in expected) || ("personId" in actual && actual.personId === expected.personId))
  );
}

function requiredTextErrors(label: string, value: string): readonly string[] {
  return value.trim() === "" ? [`${label} is required.`] : [];
}

function emailErrors(value: string): readonly string[] {
  const requiredErrors = requiredTextErrors("Email", value);
  if (requiredErrors.length > 0) {
    return requiredErrors;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? [] : ["Email must be valid."];
}

function safeLabel(value: string, fallback: string): string {
  const safe = displaySafeText(value).trim();
  return safe === "" ? fallback : safe;
}

function correlationSegment(value: string): string {
  return encodeURIComponent(value).replaceAll("%", "_");
}

function distinctStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}

function required<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("Expected value.");
  }
  return value;
}
