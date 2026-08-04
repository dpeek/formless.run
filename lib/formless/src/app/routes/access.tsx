import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  IdentityAccessManagementSummary,
  IdentityAccessPersonRemovalRequest,
  IdentityAccessPersonRoleReplacementRequest,
} from "@dpeek/formless-identity-control-plane";
import {
  createIdentityAccessManagementInvitation,
  fetchIdentityAccessManagementSummary,
  IdentityAccessManagementApiError,
  removeIdentityAccessManagementPerson,
  replaceIdentityAccessManagementPersonRoles,
  revokeIdentityAccessManagementInvitation,
  type CreateIdentityAccessManagementInvitationInput,
  type RevokeIdentityAccessManagementInvitationInput,
} from "../../client/identity-access-management.ts";
import { ApplicationPresentation } from "../application-presentation.tsx";
import { useApplicationRuntimePublicationCoordinatorContext } from "../generated/application-runtime-contract-host.tsx";
import { instanceAccessReference } from "./access-contract.ts";
import {
  createInitialAccessInvitationDraft,
  type AccessConfirmationTarget,
  type AccessIntentActions,
  type AccessInvitationDeletionState,
  type AccessInvitationDraft,
  type AccessInvitationSubmissionState,
  type AccessManagementPresentationState,
  type AccessPersonRemovalState,
  type AccessPersonRoleDraft,
  type AccessPersonRoleSubmissionState,
  type ProjectAccessOptions,
  type AccessRequestFailure,
} from "./access-projection.ts";
import { createAccessRuntimePublicationController } from "./access-runtime.ts";

export type AccessRouteDependencies = {
  createIdempotencyKey?: (purpose: "invitation" | "person-removal" | "person-role") => string;
  createInvitation?: (input: CreateIdentityAccessManagementInvitationInput) => Promise<unknown>;
  deleteInvitation?: (input: RevokeIdentityAccessManagementInvitationInput) => Promise<unknown>;
  fetchSummary?: (options?: { signal?: AbortSignal }) => Promise<IdentityAccessManagementSummary>;
  removePerson?: (input: IdentityAccessPersonRemovalRequest) => Promise<unknown>;
  replacePersonRoles?: (input: IdentityAccessPersonRoleReplacementRequest) => Promise<unknown>;
};

export function AccessRoute({ dependencies = {} }: { dependencies?: AccessRouteDependencies }) {
  const application = useApplicationRuntimePublicationCoordinatorContext();
  const [publicationController] = useState(() =>
    createAccessRuntimePublicationController(application),
  );
  const fetchSummary = dependencies.fetchSummary ?? fetchIdentityAccessManagementSummary;
  const createInvitation =
    dependencies.createInvitation ?? createIdentityAccessManagementInvitation;
  const deleteInvitation =
    dependencies.deleteInvitation ?? revokeIdentityAccessManagementInvitation;
  const replacePersonRoles =
    dependencies.replacePersonRoles ?? replaceIdentityAccessManagementPersonRoles;
  const removePerson = dependencies.removePerson ?? removeIdentityAccessManagementPerson;
  const createIdempotencyKey = dependencies.createIdempotencyKey ?? createAccessIdempotencyKey;
  const [state, setState] = useState<AccessManagementPresentationState>({ status: "loading" });
  const [authoringOpen, setAuthoringOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<AccessConfirmationTarget>();
  const [draft, setDraft] = useState<AccessInvitationDraft>(createInitialAccessInvitationDraft);
  const [personAuthoringDraft, setPersonAuthoringDraft] = useState<AccessPersonRoleDraft>();
  const [submission, setSubmission] = useState<AccessInvitationSubmissionState>({
    status: "idle",
  });
  const [invitationDeletion, setInvitationDeletion] = useState<AccessInvitationDeletionState>({
    status: "idle",
  });
  const [invitationSubmitAttempted, setInvitationSubmitAttempted] = useState(false);
  const [personRoleSubmission, setPersonRoleSubmission] = useState<AccessPersonRoleSubmissionState>(
    { status: "idle" },
  );
  const [personRemoval, setPersonRemoval] = useState<AccessPersonRemovalState>({
    status: "idle",
  });
  const createPending = useRef(false);
  const deletePending = useRef(false);
  const rolePending = useRef(false);
  const removalPending = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    let stopped = false;
    setState({ status: "loading" });

    void fetchSummary({ signal: controller.signal })
      .then((summary) => {
        if (stopped) {
          return;
        }
        setDraft(createInitialAccessInvitationDraft());
        setState({ status: "ready", summary });
      })
      .catch((error: unknown) => {
        if (stopped || controller.signal.aborted) {
          return;
        }
        const failure = accessRequestFailure(error);
        if (
          failure.kind === "transport" &&
          (failure.code === "unauthorized" || failure.code === "forbidden")
        ) {
          setState({ failure, status: "unauthorized" });
          return;
        }
        setState({ failure, status: "failed" });
      });

    return () => {
      stopped = true;
      mounted.current = false;
      controller.abort();
    };
  }, [fetchSummary]);

  const refreshSummary = useCallback(async () => {
    const summary = await fetchSummary();
    if (mounted.current) {
      setState({ status: "ready", summary });
    }
    return summary;
  }, [fetchSummary]);

  const changeAuthoringOpen = useCallback((open: boolean) => {
    setAuthoringOpen(open);
    if (open) {
      setInvitationSubmitAttempted(false);
      setSubmission({ status: "idle" });
    }
  }, []);
  const changeDraft = useCallback((nextDraft: AccessInvitationDraft) => {
    setDraft(nextDraft);
    setSubmission((current) => (current.status === "failed" ? { status: "idle" } : current));
  }, []);
  const changePersonAuthoring = useCallback((nextDraft: AccessPersonRoleDraft | undefined) => {
    setPersonAuthoringDraft(nextDraft);
    setPersonRoleSubmission({ status: "idle" });
  }, []);
  const changePersonRoleDraft = useCallback((nextDraft: AccessPersonRoleDraft) => {
    setPersonAuthoringDraft(nextDraft);
    setPersonRoleSubmission((current) =>
      current.status === "failed" ? { status: "idle" } : current,
    );
  }, []);
  const revealInvitationValidation = useCallback(() => {
    setInvitationSubmitAttempted(true);
  }, []);
  const changeConfirmation = useCallback((target: AccessConfirmationTarget | undefined) => {
    setConfirmation(target);
    setPersonRoleSubmission({ status: "idle" });
    if (target?.kind === "invitation-deletion") {
      setInvitationDeletion({ status: "idle" });
      setPersonRemoval({ status: "idle" });
    } else if (target?.kind === "person-removal") {
      setInvitationDeletion({ status: "idle" });
      setPersonRemoval({ status: "idle" });
    }
  }, []);

  const submitInvitation = useCallback(
    async (input: CreateIdentityAccessManagementInvitationInput) => {
      if (createPending.current) {
        return;
      }
      createPending.current = true;
      setSubmission({ status: "submitting" });
      try {
        await createInvitation(input);
        await refreshSummary();
        if (!mounted.current) {
          return;
        }
        setDraft(createInitialAccessInvitationDraft());
        setAuthoringOpen(false);
        setSubmission({ status: "succeeded" });
      } catch (error) {
        if (mounted.current) {
          setSubmission({ failure: accessRequestFailure(error), status: "failed" });
        }
      } finally {
        createPending.current = false;
      }
    },
    [createInvitation, refreshSummary],
  );

  const submitInvitationDeletion = useCallback(
    async (input: RevokeIdentityAccessManagementInvitationInput) => {
      if (deletePending.current) {
        return;
      }
      deletePending.current = true;
      setInvitationDeletion({ invitationId: input.invitationId, status: "submitting" });
      try {
        await deleteInvitation(input);
        await refreshSummary();
        if (!mounted.current) {
          return;
        }
        setConfirmation(undefined);
        setInvitationDeletion({
          invitationId: input.invitationId,
          status: "succeeded",
        });
      } catch (error) {
        if (mounted.current) {
          setInvitationDeletion({
            failure: accessRequestFailure(error),
            invitationId: input.invitationId,
            status: "failed",
          });
        }
      } finally {
        deletePending.current = false;
      }
    },
    [deleteInvitation, refreshSummary],
  );

  const submitPersonRoles = useCallback(
    async (input: IdentityAccessPersonRoleReplacementRequest) => {
      if (rolePending.current) {
        return;
      }
      rolePending.current = true;
      setPersonRoleSubmission({ personId: input.principalId, status: "submitting" });
      try {
        await replacePersonRoles(input);
        await refreshSummary();
        if (!mounted.current) {
          return;
        }
        setPersonAuthoringDraft(undefined);
        setPersonRoleSubmission({
          personId: input.principalId,
          status: "succeeded",
        });
      } catch (error) {
        if (mounted.current) {
          setPersonRoleSubmission({
            failure: accessRequestFailure(error),
            personId: input.principalId,
            status: "failed",
          });
        }
      } finally {
        rolePending.current = false;
      }
    },
    [refreshSummary, replacePersonRoles],
  );

  const submitPersonRemoval = useCallback(
    async (input: IdentityAccessPersonRemovalRequest) => {
      if (removalPending.current) {
        return;
      }
      removalPending.current = true;
      setPersonRemoval({ personId: input.principalId, status: "submitting" });
      try {
        await removePerson(input);
        await refreshSummary();
        if (!mounted.current) {
          return;
        }
        setConfirmation(undefined);
        setPersonAuthoringDraft((current) =>
          current?.personId === input.principalId ? undefined : current,
        );
        setPersonRemoval({
          personId: input.principalId,
          status: "succeeded",
        });
      } catch (error) {
        if (mounted.current) {
          setPersonRemoval({
            failure: accessRequestFailure(error),
            personId: input.principalId,
            status: "failed",
          });
        }
      } finally {
        removalPending.current = false;
      }
    },
    [refreshSummary, removePerson],
  );

  const actions = useMemo<AccessIntentActions>(
    () => ({
      changeAuthoringOpen,
      changeConfirmation,
      changeDraft,
      changePersonAuthoring,
      changePersonRoleDraft,
      createIdempotencyKey,
      deleteInvitation: submitInvitationDeletion,
      removePerson: submitPersonRemoval,
      revealInvitationValidation,
      replacePersonRoles: submitPersonRoles,
      submitInvitation,
    }),
    [
      changeAuthoringOpen,
      changeConfirmation,
      changeDraft,
      changePersonAuthoring,
      changePersonRoleDraft,
      createIdempotencyKey,
      revealInvitationValidation,
      submitInvitation,
      submitInvitationDeletion,
      submitPersonRemoval,
      submitPersonRoles,
    ],
  );
  const input = useMemo<ProjectAccessOptions>(
    () => ({
      authoringOpen,
      ...(confirmation ? { confirmation } : {}),
      draft,
      invitationDeletion,
      invitationSubmitAttempted,
      ...(personAuthoringDraft ? { personAuthoringDraft } : {}),
      personRemoval,
      personRoleSubmission,
      state,
      submission,
    }),
    [
      authoringOpen,
      confirmation,
      draft,
      invitationDeletion,
      invitationSubmitAttempted,
      personAuthoringDraft,
      personRemoval,
      personRoleSubmission,
      state,
      submission,
    ],
  );

  useLayoutEffect(() => {
    publicationController.updateRuntime(input, actions);
  }, [actions, input, publicationController]);

  useLayoutEffect(() => {
    publicationController.activate();
    return () => publicationController.dispose();
  }, [publicationController]);

  return (
    <ApplicationPresentation
      presentation={{ accessReference: instanceAccessReference, kind: "access" }}
    />
  );
}

function accessRequestFailure(error: unknown): AccessRequestFailure {
  return error instanceof IdentityAccessManagementApiError
    ? error.failure
    : { code: "network-failure", kind: "transport" };
}

function createAccessIdempotencyKey(
  purpose: "invitation" | "person-removal" | "person-role",
): string {
  const randomId = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `access-${purpose}:${Date.now()}:${randomId}`;
}
