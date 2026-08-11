import type {
  AccessActionContract,
  AccessIntent,
  AccessInvitationAuthoringContract,
  AccessInvitationAuthoringReference,
  AccessManifestContract,
  AccessManifestReference,
  AccessPersonRoleAuthoringContract,
  AccessPersonRoleAuthoringReference,
  ApplicationSystemStateContract,
  ApplicationSystemStateIntent,
  ApplicationSystemStateReference,
  AuthIntent,
  AuthSurfaceContract,
  AuthSurfaceKind,
  AuthSurfaceReference,
  PresentationIntent,
  PresentationIntentHandler,
  PresentationReference,
  DocumentThemeContract,
  DocumentThemeIntent,
  DocumentThemeReference,
  ListContract,
  ListResultReference,
  ManagementIntent,
  ManagementManifestContract,
  ManagementManifestReference,
  RecordResultContract,
  RecordResultReference,
  RelationshipHierarchyContract,
  RelationshipHierarchyReference,
  ResultReferenceRole,
  ShellManifestContract,
  ShellIntent,
  ShellManifestReference,
  ShellNavigationSectionContract,
  ShellNavigationSectionReference,
  TableContract,
  TableResultReference,
  TreeResultContract,
  TreeResultReference,
  WorkspaceIntent,
  WorkspaceManifestContract,
  WorkspaceManifestReference,
  WorkspaceSelectedRecordShellContract,
  WorkspaceSectionShellContract,
  WorkspaceSectionShellReference,
} from "./contract.ts";

export type PresentationSnapshot<Reference extends PresentationReference> =
  Reference extends AccessManifestReference
    ? AccessManifestContract
    : Reference extends ApplicationSystemStateReference
      ? ApplicationSystemStateContract
      : Reference extends AccessInvitationAuthoringReference
        ? AccessInvitationAuthoringContract
        : Reference extends AccessPersonRoleAuthoringReference
          ? AccessPersonRoleAuthoringContract
          : Reference extends AuthSurfaceReference<infer SurfaceKind>
            ? Extract<AuthSurfaceContract, { surfaceKind: SurfaceKind }>
            : Reference extends DocumentThemeReference
              ? DocumentThemeContract
              : Reference extends ManagementManifestReference
                ? ManagementManifestContract
                : Reference extends WorkspaceManifestReference
                  ? WorkspaceManifestContract
                  : Reference extends WorkspaceSectionShellReference
                    ? WorkspaceSectionShellContract
                    : Reference extends ShellManifestReference
                      ? ShellManifestContract
                      : Reference extends ShellNavigationSectionReference
                        ? ShellNavigationSectionContract
                        : Reference extends ListResultReference
                          ? ListContract
                          : Reference extends TableResultReference
                            ? TableContract
                            : Reference extends TreeResultReference
                              ? TreeResultContract
                              : Reference extends RecordResultReference
                                ? RecordResultContract
                                : Reference extends RelationshipHierarchyReference
                                  ? RelationshipHierarchyContract
                                  : never;

export type PresentationHostListener = () => void;

export type PresentationHost = {
  dispatch(intent: PresentationIntent): ReturnType<PresentationIntentHandler>;
  getServerSnapshot<Reference extends PresentationReference>(
    reference: Reference,
  ): PresentationSnapshot<Reference> | undefined;
  read<Reference extends PresentationReference>(
    reference: Reference,
  ): PresentationSnapshot<Reference> | undefined;
  subscribe(reference: PresentationReference, listener: PresentationHostListener): () => void;
};

export type WorkspaceManifestNode = {
  reference: WorkspaceManifestReference;
  snapshot: WorkspaceManifestContract;
};

export type ApplicationSystemStateNode = {
  reference: ApplicationSystemStateReference;
  snapshot: ApplicationSystemStateContract;
};

export type AccessManifestNode = {
  reference: AccessManifestReference;
  snapshot: AccessManifestContract;
};

export type AccessInvitationAuthoringNode = {
  reference: AccessInvitationAuthoringReference;
  snapshot: AccessInvitationAuthoringContract;
};

export type AccessPersonRoleAuthoringNode = {
  reference: AccessPersonRoleAuthoringReference;
  snapshot: AccessPersonRoleAuthoringContract;
};

export type AuthSurfaceNode = {
  reference: AuthSurfaceReference;
  snapshot: AuthSurfaceContract;
};

export type DocumentThemeNode = {
  reference: DocumentThemeReference;
  snapshot: DocumentThemeContract;
};

export type WorkspaceSectionShellNode = {
  reference: WorkspaceSectionShellReference;
  snapshot: WorkspaceSectionShellContract;
};

export type ShellManifestNode = {
  reference: ShellManifestReference;
  snapshot: ShellManifestContract;
};

export type ShellNavigationSectionNode = {
  reference: ShellNavigationSectionReference;
  snapshot: ShellNavigationSectionContract;
};

export type ListResultNode = {
  reference: ListResultReference;
  snapshot: ListContract;
};

export type TableResultNode = {
  reference: TableResultReference;
  snapshot: TableContract;
};

export type TreeResultNode = {
  reference: TreeResultReference;
  snapshot: TreeResultContract;
};

export type RecordResultNode = {
  reference: RecordResultReference;
  snapshot: RecordResultContract;
};

export type RelationshipHierarchyNode = {
  reference: RelationshipHierarchyReference;
  snapshot: RelationshipHierarchyContract;
};

export type ManagementManifestNode = {
  reference: ManagementManifestReference;
  snapshot: ManagementManifestContract;
};

export type PresentationNode =
  | AccessInvitationAuthoringNode
  | AccessManifestNode
  | AccessPersonRoleAuthoringNode
  | ApplicationSystemStateNode
  | AuthSurfaceNode
  | DocumentThemeNode
  | ListResultNode
  | ManagementManifestNode
  | RecordResultNode
  | RelationshipHierarchyNode
  | ShellManifestNode
  | ShellNavigationSectionNode
  | TableResultNode
  | TreeResultNode
  | WorkspaceManifestNode
  | WorkspaceSectionShellNode;

export type PresentationNodeSet = readonly PresentationNode[];

export type MutablePresentationHost = PresentationHost & {
  publish(nodes: PresentationNodeSet): void;
};

export type MemoryPresentationHostOptions = {
  dispatch?: PresentationIntentHandler;
  nodes?: PresentationNodeSet;
  serverNodes?: PresentationNodeSet;
};

type StoredPresentationNode = {
  reference: PresentationReference;
  snapshot: PresentationSnapshot<PresentationReference>;
};

type StoredPresentationNodes = ReadonlyMap<string, StoredPresentationNode>;

export function createMemoryPresentationHost({
  dispatch = () => undefined,
  nodes = [],
  serverNodes,
}: MemoryPresentationHostOptions = {}): MutablePresentationHost {
  const listeners = new Map<string, Set<PresentationHostListener>>();
  const serverSnapshotNodes = prepareNodeSet(serverNodes ?? nodes, new Map());
  let currentNodes = prepareNodeSet(nodes, serverSnapshotNodes);

  return {
    dispatch,
    getServerSnapshot,
    publish,
    read,
    subscribe,
  };

  function read<Reference extends PresentationReference>(
    reference: Reference,
  ): PresentationSnapshot<Reference> | undefined {
    return snapshotForReference(currentNodes, reference);
  }

  function getServerSnapshot<Reference extends PresentationReference>(
    reference: Reference,
  ): PresentationSnapshot<Reference> | undefined {
    return snapshotForReference(serverSnapshotNodes, reference);
  }

  function subscribe(reference: PresentationReference, listener: PresentationHostListener) {
    const key = presentationReferenceKey(reference);
    const scopedListeners = listeners.get(key) ?? new Set<PresentationHostListener>();
    scopedListeners.add(listener);
    listeners.set(key, scopedListeners);

    return () => {
      scopedListeners.delete(listener);
      if (scopedListeners.size === 0) {
        listeners.delete(key);
      }
    };
  }

  function publish(nextNodeSet: PresentationNodeSet) {
    const nextNodes = prepareNodeSet(nextNodeSet, currentNodes);
    const changedKeys = changedReferenceKeys(currentNodes, nextNodes);

    currentNodes = nextNodes;

    for (const key of changedKeys) {
      const listenersToNotify = Array.from(listeners.get(key) ?? []);
      for (const listener of listenersToNotify) {
        listener();
      }
    }
  }
}

export function workspaceManifestReference(workspaceId: string): WorkspaceManifestReference {
  return {
    kind: "workspaceManifestReference",
    role: "workspace",
    workspaceId,
  };
}

export function applicationSystemStateReference(stateId: string): ApplicationSystemStateReference {
  return {
    kind: "applicationSystemStateReference",
    role: "applicationSystemState",
    stateId,
  };
}

export function accessManifestReference(accessId: string): AccessManifestReference {
  return {
    accessId,
    kind: "accessManifestReference",
    role: "access",
  };
}

export function accessInvitationAuthoringReference(
  accessId: string,
  authoringId: string,
): AccessInvitationAuthoringReference {
  return {
    accessId,
    authoringId,
    kind: "accessInvitationAuthoringReference",
    role: "accessInvitationAuthoring",
  };
}

export function accessPersonRoleAuthoringReference(
  accessId: string,
  authoringId: string,
  personId: string,
): AccessPersonRoleAuthoringReference {
  return {
    accessId,
    authoringId,
    kind: "accessPersonRoleAuthoringReference",
    personId,
    role: "accessPersonRoleAuthoring",
  };
}

export function authSurfaceReference<SurfaceKind extends AuthSurfaceKind>({
  surfaceId,
  surfaceKind,
}: {
  surfaceId: string;
  surfaceKind: SurfaceKind;
}): AuthSurfaceReference<SurfaceKind> {
  return {
    kind: "authSurfaceReference",
    role: "authSurface",
    surfaceId,
    surfaceKind,
  };
}

export function managementManifestReference(managementId: string): ManagementManifestReference {
  return {
    kind: "managementManifestReference",
    managementId,
    role: "management",
  };
}

export function documentThemeReference(themeId: string): DocumentThemeReference {
  return {
    kind: "documentThemeReference",
    role: "documentTheme",
    themeId,
  };
}

export function workspaceSectionShellReference(
  workspaceId: string,
  sectionId: string,
): WorkspaceSectionShellReference {
  return {
    kind: "workspaceSectionShellReference",
    role: "section",
    sectionId,
    workspaceId,
  };
}

export function shellManifestReference(shellId: string): ShellManifestReference {
  return {
    kind: "shellManifestReference",
    role: "shell",
    shellId,
  };
}

export function shellNavigationSectionReference(
  shellId: string,
  sectionId: string,
): ShellNavigationSectionReference {
  return {
    kind: "shellNavigationSectionReference",
    role: "shellNavigationSection",
    sectionId,
    shellId,
  };
}

export function listResultReference({
  resultId,
  role,
  sectionId,
  workspaceId,
}: Omit<ListResultReference, "kind">): ListResultReference {
  return {
    kind: "listResultReference",
    resultId,
    role,
    sectionId,
    workspaceId,
  };
}

export function tableResultReference<
  Role extends Extract<ResultReferenceRole, "mainResult" | "selectedDetailResult">,
>({
  resultId,
  role,
  sectionId,
  workspaceId,
}: Omit<TableResultReference<Role>, "kind">): TableResultReference<Role> {
  return {
    kind: "tableResultReference",
    resultId,
    role,
    sectionId,
    workspaceId,
  };
}

export function treeResultReference({
  resultId,
  role,
  sectionId,
  workspaceId,
}: Omit<TreeResultReference, "kind">): TreeResultReference {
  return {
    kind: "treeResultReference",
    resultId,
    role,
    sectionId,
    workspaceId,
  };
}

export function recordResultReference<Role extends ResultReferenceRole>({
  resultId,
  role,
  sectionId,
  workspaceId,
}: Omit<RecordResultReference<Role>, "kind">): RecordResultReference<Role> {
  return {
    kind: "recordResultReference",
    resultId,
    role,
    sectionId,
    workspaceId,
  };
}

export function relationshipHierarchyReference({
  hierarchyId,
  sectionId,
  workspaceId,
}: Omit<RelationshipHierarchyReference, "kind" | "role">): RelationshipHierarchyReference {
  return {
    hierarchyId,
    kind: "relationshipHierarchyReference",
    role: "selectedDetail",
    sectionId,
    workspaceId,
  };
}

export function presentationReferenceKey(reference: PresentationReference): string {
  switch (reference.kind) {
    case "accessManifestReference":
      return JSON.stringify([reference.role, reference.accessId]);
    case "applicationSystemStateReference":
      return JSON.stringify([reference.role, reference.stateId]);
    case "accessInvitationAuthoringReference":
      return JSON.stringify([reference.role, reference.accessId, reference.authoringId]);
    case "accessPersonRoleAuthoringReference":
      return JSON.stringify([
        reference.role,
        reference.accessId,
        reference.personId,
        reference.authoringId,
      ]);
    case "authSurfaceReference":
      return JSON.stringify([reference.role, reference.surfaceKind, reference.surfaceId]);
    case "documentThemeReference":
      return JSON.stringify([reference.role, reference.themeId]);
    case "managementManifestReference":
      return JSON.stringify([reference.role, reference.managementId]);
    case "shellManifestReference":
      return JSON.stringify([reference.role, reference.shellId]);
    case "shellNavigationSectionReference":
      return JSON.stringify([reference.role, reference.shellId, reference.sectionId]);
    case "workspaceManifestReference":
      return JSON.stringify([reference.role, reference.workspaceId]);
    case "workspaceSectionShellReference":
      return JSON.stringify([reference.role, reference.workspaceId, reference.sectionId]);
    case "listResultReference":
    case "recordResultReference":
    case "relationshipHierarchyReference":
    case "tableResultReference":
    case "treeResultReference":
      return JSON.stringify([
        reference.role,
        reference.workspaceId,
        reference.sectionId,
        reference.kind,
        reference.kind === "relationshipHierarchyReference"
          ? reference.hierarchyId
          : reference.resultId,
      ]);
  }
}

export function isWorkspaceIntent(intent: PresentationIntent): intent is WorkspaceIntent {
  switch (intent.type) {
    case "accessInvitationAuthoringOpenChange":
    case "accessInvitationDelete":
    case "accessInvitationDeletionConfirmationOpenChange":
    case "accessInvitationFieldChange":
    case "accessInvitationMembershipSelectionChange":
    case "accessInvitationRoleSelectionChange":
    case "accessInvitationSubmit":
    case "accessPersonRemove":
    case "accessPersonRemovalConfirmationOpenChange":
    case "accessPersonRoleAuthoringOpenChange":
    case "accessPersonRoleSelectionChange":
    case "accessPersonRoleSubmit":
    case "applicationSystemStateAction":
    case "authAction":
    case "authContinuation":
    case "authField":
    case "authPasskey":
    case "authPolicySelection":
    case "documentThemeModeSelection":
    case "managementAccountSelection":
    case "managementAuthorizationOpen":
    case "managementWorkspaceOperation":
    case "shellCreate":
    case "shellLogout":
    case "shellRootRecordSelection":
      return false;
    default:
      return true;
  }
}

export function isApplicationSystemStateIntent(
  intent: PresentationIntent,
): intent is ApplicationSystemStateIntent {
  return intent.type === "applicationSystemStateAction";
}

export function isAccessIntent(intent: PresentationIntent): intent is AccessIntent {
  switch (intent.type) {
    case "accessInvitationAuthoringOpenChange":
    case "accessInvitationDelete":
    case "accessInvitationDeletionConfirmationOpenChange":
    case "accessInvitationFieldChange":
    case "accessInvitationMembershipSelectionChange":
    case "accessInvitationRoleSelectionChange":
    case "accessInvitationSubmit":
    case "accessPersonRemove":
    case "accessPersonRemovalConfirmationOpenChange":
    case "accessPersonRoleAuthoringOpenChange":
    case "accessPersonRoleSelectionChange":
    case "accessPersonRoleSubmit":
      return true;
    default:
      return false;
  }
}

export function isAuthIntent(intent: PresentationIntent): intent is AuthIntent {
  switch (intent.type) {
    case "authAction":
    case "authContinuation":
    case "authField":
    case "authPasskey":
    case "authPolicySelection":
      return true;
    default:
      return false;
  }
}

export function isManagementIntent(intent: PresentationIntent): intent is ManagementIntent {
  switch (intent.type) {
    case "managementAccountSelection":
    case "managementAuthorizationOpen":
    case "managementWorkspaceOperation":
      return true;
    default:
      return false;
  }
}

export function isDocumentThemeIntent(intent: PresentationIntent): intent is DocumentThemeIntent {
  return intent.type === "documentThemeModeSelection";
}

export function isShellIntent(intent: PresentationIntent): intent is ShellIntent {
  switch (intent.type) {
    case "shellCreate":
    case "shellLogout":
    case "shellRootRecordSelection":
      return true;
    default:
      return false;
  }
}

function snapshotForReference<Reference extends PresentationReference>(
  nodes: StoredPresentationNodes,
  reference: Reference,
): PresentationSnapshot<Reference> | undefined {
  return nodes.get(presentationReferenceKey(reference))?.snapshot as
    | PresentationSnapshot<Reference>
    | undefined;
}

function prepareNodeSet(
  nodes: PresentationNodeSet,
  reusableNodes: StoredPresentationNodes,
): StoredPresentationNodes {
  const prepared = new Map<string, StoredPresentationNode>();

  for (const node of nodes) {
    assertNodeMatchesReference(node);
    const key = presentationReferenceKey(node.reference);

    if (prepared.has(key)) {
      throw new Error(`Duplicate Formless UI contract reference ${key}.`);
    }

    const reusableNode = reusableNodes.get(key);
    prepared.set(key, {
      reference: node.reference,
      snapshot:
        reusableNode && semanticallyEqual(reusableNode.snapshot, node.snapshot)
          ? reusableNode.snapshot
          : node.snapshot,
    });
  }

  assertReferencesResolve(prepared);
  return prepared;
}

function assertNodeMatchesReference(node: PresentationNode) {
  const { reference, snapshot } = node;

  switch (reference.kind) {
    case "accessManifestReference":
      if (snapshot.kind !== "accessManifest" || snapshot.id !== reference.accessId) {
        throw mismatchedNodeError(reference);
      }
      assertAccessManifestContract(snapshot);
      return;
    case "applicationSystemStateReference":
      if (snapshot.kind !== "applicationSystemState" || snapshot.id !== reference.stateId) {
        throw mismatchedNodeError(reference);
      }
      assertApplicationSystemStateContract(snapshot);
      return;
    case "accessInvitationAuthoringReference":
      if (
        snapshot.kind !== "accessInvitationAuthoring" ||
        snapshot.id !== reference.authoringId ||
        snapshot.accessId !== reference.accessId
      ) {
        throw mismatchedNodeError(reference);
      }
      assertAccessInvitationAuthoringContract(snapshot);
      return;
    case "accessPersonRoleAuthoringReference":
      if (
        snapshot.kind !== "accessPersonRoleAuthoring" ||
        snapshot.id !== reference.authoringId ||
        snapshot.accessId !== reference.accessId ||
        snapshot.personId !== reference.personId
      ) {
        throw mismatchedNodeError(reference);
      }
      assertAccessPersonRoleAuthoringContract(snapshot);
      return;
    case "authSurfaceReference":
      if (
        snapshot.kind !== "authSurface" ||
        snapshot.id !== reference.surfaceId ||
        snapshot.surfaceKind !== reference.surfaceKind
      ) {
        throw mismatchedNodeError(reference);
      }
      assertAuthSurfaceContract(snapshot);
      return;
    case "documentThemeReference":
      if (snapshot.kind !== "documentTheme" || snapshot.id !== reference.themeId) {
        throw mismatchedNodeError(reference);
      }
      assertDocumentThemeContract(snapshot);
      return;
    case "managementManifestReference":
      if (snapshot.kind !== "managementManifest" || snapshot.id !== reference.managementId) {
        throw mismatchedNodeError(reference);
      }
      return;
    case "shellManifestReference":
      if (snapshot.kind !== "shellManifest" || snapshot.id !== reference.shellId) {
        throw mismatchedNodeError(reference);
      }
      return;
    case "shellNavigationSectionReference":
      if (
        snapshot.kind !== "shellNavigationSection" ||
        snapshot.id !== reference.sectionId ||
        snapshot.shellId !== reference.shellId
      ) {
        throw mismatchedNodeError(reference);
      }
      return;
    case "workspaceManifestReference":
      if (snapshot.kind !== "workspaceManifest" || snapshot.id !== reference.workspaceId) {
        throw mismatchedNodeError(reference);
      }
      assertWorkspaceManifestContract(snapshot);
      return;
    case "workspaceSectionShellReference":
      if (snapshot.kind !== "workspaceSectionShell" || snapshot.id !== reference.sectionId) {
        throw mismatchedNodeError(reference);
      }
      return;
    case "listResultReference":
      if (snapshot.kind !== "list" || snapshot.id !== reference.resultId) {
        throw mismatchedNodeError(reference);
      }
      return;
    case "recordResultReference":
      if (snapshot.kind !== "recordResult" || snapshot.id !== reference.resultId) {
        throw mismatchedNodeError(reference);
      }
      return;
    case "relationshipHierarchyReference":
      if (snapshot.kind !== "relationshipHierarchy" || snapshot.id !== reference.hierarchyId) {
        throw mismatchedNodeError(reference);
      }
      assertRelationshipHierarchyContract(snapshot);
      return;
    case "tableResultReference":
      if (snapshot.kind !== "table" || snapshot.id !== reference.resultId) {
        throw mismatchedNodeError(reference);
      }
      return;
    case "treeResultReference":
      if (snapshot.kind !== "treeResult" || snapshot.id !== reference.resultId) {
        throw mismatchedNodeError(reference);
      }
      assertTreeResultContract(snapshot);
      return;
  }
}

function assertWorkspaceManifestContract(snapshot: WorkspaceManifestContract) {
  if (snapshot.surface === "full") {
    if ("width" in snapshot) {
      throw new Error(
        `Formless UI workspace ${JSON.stringify(snapshot.id)} full surface must not declare a width.`,
      );
    }
    return;
  }

  if (
    snapshot.surface !== "constrained" ||
    (snapshot.width !== "narrow" && snapshot.width !== "standard" && snapshot.width !== "wide")
  ) {
    throw new Error(
      `Formless UI workspace ${JSON.stringify(snapshot.id)} has an invalid surface extent.`,
    );
  }
}

function assertApplicationSystemStateContract(snapshot: ApplicationSystemStateContract) {
  const actionIds = new Set<string>();
  const controlIds = new Set<string>();

  for (const action of snapshot.actions) {
    if (actionIds.has(action.id) || controlIds.has(action.control.id)) {
      throw new Error(
        `Formless UI application system state ${JSON.stringify(snapshot.id)} has duplicate action identities.`,
      );
    }
    actionIds.add(action.id);
    controlIds.add(action.control.id);

    if (
      action.intent.stateId !== snapshot.id ||
      action.intent.actionId !== action.id ||
      action.intent.controlId !== action.control.id
    ) {
      throw new Error(
        `Formless UI application system state ${JSON.stringify(snapshot.id)} has an invalid action intent.`,
      );
    }
  }
}

function assertAccessManifestContract(snapshot: AccessManifestContract) {
  if (snapshot.state !== "ready") {
    return;
  }

  const { authoring, confirmation, invitations, invite, people } = snapshot;
  assertAccessActionIdentity(invite, snapshot.id);
  if (
    invite.purpose !== "authoring-open" ||
    invite.intent.type !== "accessInvitationAuthoringOpenChange" ||
    invite.intent.authoringId !== authoring.authoringId ||
    !invite.intent.open
  ) {
    throw new Error(
      `Formless UI access manifest ${JSON.stringify(snapshot.id)} has an invalid authoring action.`,
    );
  }

  assertDistinctAccessIdentities(
    snapshot.id,
    "people",
    people.map(({ id }) => id),
  );
  assertDistinctAccessIdentities(
    snapshot.id,
    "invitations",
    invitations.map(({ id }) => id),
  );

  for (const invitation of invitations) {
    if (invitation.deletion.availability !== "available") {
      continue;
    }
    const action = invitation.deletion.action;
    assertAccessActionIdentity(action, snapshot.id);
    if (
      action.purpose !== "invitation-deletion-open" ||
      action.intent.type !== "accessInvitationDeletionConfirmationOpenChange" ||
      action.intent.invitationId !== invitation.id ||
      !action.intent.open
    ) {
      throw new Error(
        `Formless UI access manifest ${JSON.stringify(snapshot.id)} has an invalid invitation deletion action.`,
      );
    }
  }

  for (const person of people) {
    if (person.roleAuthoring.availability === "available") {
      const { action, reference } = person.roleAuthoring;
      assertAccessActionIdentity(action, snapshot.id);
      if (
        action.purpose !== "person-role-authoring-open" ||
        action.intent.type !== "accessPersonRoleAuthoringOpenChange" ||
        action.intent.authoringId !== reference.authoringId ||
        action.intent.personId !== person.id ||
        reference.accessId !== snapshot.id ||
        reference.personId !== person.id ||
        !action.intent.open
      ) {
        throw new Error(
          `Formless UI access manifest ${JSON.stringify(snapshot.id)} has an invalid person role-authoring action.`,
        );
      }
    }
    if (person.removal.availability === "available") {
      const action = person.removal.action;
      assertAccessActionIdentity(action, snapshot.id);
      if (
        action.purpose !== "person-removal-open" ||
        action.intent.type !== "accessPersonRemovalConfirmationOpenChange" ||
        action.intent.personId !== person.id ||
        !action.intent.open
      ) {
        throw new Error(
          `Formless UI access manifest ${JSON.stringify(snapshot.id)} has an invalid person removal action.`,
        );
      }
    }
  }

  if (snapshot.personAuthoring) {
    const person = people.find(({ id }) => id === snapshot.personAuthoring?.personId);
    if (
      !person ||
      person.roleAuthoring.availability !== "available" ||
      !semanticallyEqual(person.roleAuthoring.reference, snapshot.personAuthoring)
    ) {
      throw new Error(
        `Formless UI access manifest ${JSON.stringify(snapshot.id)} has an invalid current person authoring reference.`,
      );
    }
  }

  if (!confirmation) {
    return;
  }
  assertAccessActionIdentity(confirmation.cancel, snapshot.id);
  assertAccessActionIdentity(confirmation.action, snapshot.id);
  if (confirmation.purpose === "invitation-deletion") {
    if (
      confirmation.cancel.purpose !== "invitation-deletion-cancel" ||
      confirmation.cancel.intent.type !== "accessInvitationDeletionConfirmationOpenChange" ||
      confirmation.cancel.intent.confirmationId !== confirmation.id ||
      confirmation.cancel.intent.invitationId !== confirmation.invitationId ||
      confirmation.cancel.intent.open ||
      confirmation.action.purpose !== "invitation-delete" ||
      confirmation.action.intent.type !== "accessInvitationDelete" ||
      confirmation.action.intent.confirmationId !== confirmation.id ||
      confirmation.action.intent.invitationId !== confirmation.invitationId
    ) {
      throw new Error(
        `Formless UI access manifest ${JSON.stringify(snapshot.id)} has an invalid invitation deletion confirmation.`,
      );
    }
    return;
  }
  if (
    confirmation.cancel.purpose !== "person-removal-cancel" ||
    confirmation.cancel.intent.type !== "accessPersonRemovalConfirmationOpenChange" ||
    confirmation.cancel.intent.confirmationId !== confirmation.id ||
    confirmation.cancel.intent.personId !== confirmation.personId ||
    confirmation.cancel.intent.open ||
    confirmation.action.purpose !== "person-remove" ||
    confirmation.action.intent.type !== "accessPersonRemove" ||
    confirmation.action.intent.confirmationId !== confirmation.id ||
    confirmation.action.intent.personId !== confirmation.personId
  ) {
    throw new Error(
      `Formless UI access manifest ${JSON.stringify(snapshot.id)} has an invalid person removal confirmation.`,
    );
  }
}

function assertAccessInvitationAuthoringContract(snapshot: AccessInvitationAuthoringContract) {
  assertAccessActionIdentity(snapshot.cancel, snapshot.accessId);
  assertAccessActionIdentity(snapshot.submit, snapshot.accessId);
  if (
    snapshot.cancel.purpose !== "authoring-cancel" ||
    snapshot.cancel.intent.type !== "accessInvitationAuthoringOpenChange" ||
    snapshot.cancel.intent.authoringId !== snapshot.id ||
    snapshot.cancel.intent.open ||
    snapshot.submit.purpose !== "invitation-submit" ||
    snapshot.submit.intent.type !== "accessInvitationSubmit" ||
    snapshot.submit.intent.authoringId !== snapshot.id
  ) {
    throw new Error(
      `Formless UI access invitation authoring ${JSON.stringify(snapshot.id)} has invalid actions.`,
    );
  }

  const expectedFieldPurposes = {
    acceptanceTarget: "acceptance-target",
    displayName: "display-name",
    targetEmail: "target-email",
  } as const;
  const fields = Object.entries(snapshot.fields).filter(
    (
      entry,
    ): entry is [
      keyof typeof expectedFieldPurposes,
      AccessInvitationAuthoringContract["fields"]["displayName"],
    ] => entry[1] !== undefined,
  );
  assertDistinctAccessIdentities(
    snapshot.id,
    "fields",
    fields.map(([, field]) => field.id),
  );
  for (const [fieldName, field] of fields) {
    if (
      field.purpose !== expectedFieldPurposes[fieldName] ||
      field.changeIntent.accessId !== snapshot.accessId ||
      field.changeIntent.authoringId !== snapshot.id ||
      field.changeIntent.fieldId !== field.id
    ) {
      throw new Error(
        `Formless UI access invitation authoring ${JSON.stringify(snapshot.id)} has an invalid field contract.`,
      );
    }
    if (field.inputKind === "select") {
      const options = field.options ?? [];
      assertDistinctAccessIdentities(
        snapshot.id,
        "field options",
        options.map(({ id }) => id),
      );
      if (options.filter(({ selected }) => selected).length > 1) {
        throw new Error(
          `Formless UI access invitation authoring ${JSON.stringify(snapshot.id)} has inconsistent field selection.`,
        );
      }
      if (options.some(({ selected, value }) => selected !== (value === field.value))) {
        throw new Error(
          `Formless UI access invitation authoring ${JSON.stringify(snapshot.id)} has inconsistent field selection.`,
        );
      }
    } else if (field.options !== undefined) {
      throw new Error(
        `Formless UI access invitation authoring ${JSON.stringify(snapshot.id)} has options on a non-select field.`,
      );
    }
  }

  assertAccessRoleSelection(snapshot.roleSelection, {
    accessId: snapshot.accessId,
    authoringId: snapshot.id,
    type: "accessInvitationRoleSelectionChange",
  });
  assertAccessMembershipSelection(snapshot);
}

function assertAccessPersonRoleAuthoringContract(snapshot: AccessPersonRoleAuthoringContract) {
  assertAccessActionIdentity(snapshot.cancel, snapshot.accessId);
  assertAccessActionIdentity(snapshot.save, snapshot.accessId);
  if (
    snapshot.cancel.purpose !== "person-role-authoring-cancel" ||
    snapshot.cancel.intent.type !== "accessPersonRoleAuthoringOpenChange" ||
    snapshot.cancel.intent.authoringId !== snapshot.id ||
    snapshot.cancel.intent.personId !== snapshot.personId ||
    snapshot.cancel.intent.open ||
    snapshot.save.purpose !== "person-role-save" ||
    snapshot.save.intent.type !== "accessPersonRoleSubmit" ||
    snapshot.save.intent.authoringId !== snapshot.id ||
    snapshot.save.intent.personId !== snapshot.personId
  ) {
    throw new Error(
      `Formless UI access person role authoring ${JSON.stringify(snapshot.id)} has invalid actions.`,
    );
  }
  assertAccessRoleSelection(snapshot.roleSelection, {
    accessId: snapshot.accessId,
    authoringId: snapshot.id,
    personId: snapshot.personId,
    type: "accessPersonRoleSelectionChange",
  });
}

function assertAccessRoleSelection(
  selection: AccessInvitationAuthoringContract["roleSelection"],
  expectedIntent: {
    accessId: string;
    authoringId: string;
    personId?: string;
    type: "accessInvitationRoleSelectionChange" | "accessPersonRoleSelectionChange";
  },
) {
  assertDistinctAccessIdentities(
    expectedIntent.authoringId,
    "role options",
    selection.options.map(({ id }) => id),
  );
  const selectedOptionIds = selection.options
    .filter(({ selected }) => selected)
    .map(({ id }) => id);
  if (!semanticallyEqual(selection.selectedOptionIds, selectedOptionIds)) {
    throw new Error(
      `Formless UI access authoring ${JSON.stringify(expectedIntent.authoringId)} has inconsistent role selection.`,
    );
  }
  const intent = selection.changeIntent;
  if (
    intent.accessId !== expectedIntent.accessId ||
    intent.authoringId !== expectedIntent.authoringId ||
    intent.controlId !== selection.id ||
    intent.type !== expectedIntent.type ||
    ("personId" in intent ? intent.personId : undefined) !== expectedIntent.personId
  ) {
    throw new Error(
      `Formless UI access authoring ${JSON.stringify(expectedIntent.authoringId)} has an invalid role-selection intent.`,
    );
  }
}

function assertAccessMembershipSelection(snapshot: AccessInvitationAuthoringContract) {
  const selection = snapshot.membershipSelection;
  assertDistinctAccessIdentities(
    snapshot.id,
    "membership groups",
    selection.groups.map(({ id }) => id),
  );
  const options = selection.groups.flatMap(({ options }) => options);
  assertDistinctAccessIdentities(
    snapshot.id,
    "membership options",
    options.map(({ id }) => id),
  );
  const selectedOptionIds = options.filter(({ selected }) => selected).map(({ id }) => id);
  if (!semanticallyEqual(selection.selectedOptionIds, selectedOptionIds)) {
    throw new Error(
      `Formless UI access invitation authoring ${JSON.stringify(snapshot.id)} has inconsistent membership selection.`,
    );
  }
  if (
    selection.changeIntent.accessId !== snapshot.accessId ||
    selection.changeIntent.authoringId !== snapshot.id ||
    selection.changeIntent.controlId !== selection.id
  ) {
    throw new Error(
      `Formless UI access invitation authoring ${JSON.stringify(snapshot.id)} has an invalid membership-selection intent.`,
    );
  }
}

function assertAccessActionIdentity(action: AccessActionContract, accessId: string) {
  if (
    action.intent.accessId !== accessId ||
    action.intent.actionId !== action.id ||
    action.intent.controlId !== action.control.id
  ) {
    throw new Error(`Formless UI access action ${JSON.stringify(action.id)} has invalid identity.`);
  }
}

function assertDistinctAccessIdentities(
  ownerId: string,
  identityKind: string,
  identities: readonly string[],
) {
  if (new Set(identities).size !== identities.length) {
    throw new Error(
      `Formless UI access contract ${JSON.stringify(ownerId)} has duplicate ${identityKind} identities.`,
    );
  }
}

function assertAuthSurfaceContract(snapshot: AuthSurfaceContract) {
  const fieldIds = new Set<string>();
  for (const authField of snapshot.fields) {
    const { field, intent, purpose } = authField;
    if (fieldIds.has(field.fieldId)) {
      throw new Error(
        `Formless UI auth surface ${JSON.stringify(snapshot.id)} has duplicate field identities.`,
      );
    }
    fieldIds.add(field.fieldId);

    if (
      intent.surfaceId !== snapshot.id ||
      intent.fieldId !== field.fieldId ||
      (purpose === "profile-input" && field.surface !== "operation") ||
      (purpose !== "profile-input" && field.surface !== "create") ||
      (purpose === "verification-token" && authField.autocomplete !== "one-time-code")
    ) {
      throw new Error(
        `Formless UI auth surface ${JSON.stringify(snapshot.id)} has an invalid field contract.`,
      );
    }
  }

  const policyIds = new Set<string>();
  for (const policy of snapshot.policies) {
    if (policyIds.has(policy.id)) {
      throw new Error(
        `Formless UI auth surface ${JSON.stringify(snapshot.id)} has duplicate policy identities.`,
      );
    }
    policyIds.add(policy.id);

    const intent = policy.selectionIntent;
    if (intent && (intent.surfaceId !== snapshot.id || intent.policyId !== policy.id)) {
      throw new Error(
        `Formless UI auth surface ${JSON.stringify(snapshot.id)} has an invalid policy-selection intent.`,
      );
    }
  }

  const actionIds = new Set<string>();
  for (const action of snapshot.actions) {
    if (actionIds.has(action.id)) {
      throw new Error(
        `Formless UI auth surface ${JSON.stringify(snapshot.id)} has duplicate action identities.`,
      );
    }
    actionIds.add(action.id);

    const { intent } = action;
    if (
      intent.surfaceId !== snapshot.id ||
      intent.actionId !== action.id ||
      intent.controlId !== action.control.id
    ) {
      throw new Error(
        `Formless UI auth surface ${JSON.stringify(snapshot.id)} has an invalid action intent.`,
      );
    }
  }

  if (snapshot.passkey?.availability === "available") {
    const { control, id, intent } = snapshot.passkey;
    if (
      intent.surfaceId !== snapshot.id ||
      intent.passkeyId !== id ||
      intent.controlId !== control.id
    ) {
      throw new Error(
        `Formless UI auth surface ${JSON.stringify(snapshot.id)} has an invalid passkey intent.`,
      );
    }
  }

  if (snapshot.continuation) {
    const { control, destination, intent } = snapshot.continuation;
    if (
      intent.surfaceId !== snapshot.id ||
      intent.destinationId !== destination.id ||
      intent.controlId !== control.id
    ) {
      throw new Error(
        `Formless UI auth surface ${JSON.stringify(snapshot.id)} has an invalid continuation intent.`,
      );
    }
  }
}

function assertDocumentThemeContract(snapshot: DocumentThemeContract) {
  if (snapshot.policy.kind === "fixed") {
    if (snapshot.activeMode !== snapshot.policy.mode || snapshot.selectionControl !== undefined) {
      throw new Error(
        `Fixed Formless UI document theme ${JSON.stringify(snapshot.id)} must use its policy mode and omit selection control.`,
      );
    }
    return;
  }

  const control = snapshot.selectionControl;
  if (!control) {
    throw new Error(
      `User-controlled Formless UI document theme ${JSON.stringify(snapshot.id)} requires a selection control.`,
    );
  }
  if (!control.options.some(({ mode }) => mode === control.selectedMode)) {
    throw new Error(
      `Formless UI document theme ${JSON.stringify(snapshot.id)} selection has no matching option.`,
    );
  }

  const modes = new Set<string>();
  for (const option of control.options) {
    if (modes.has(option.mode)) {
      throw new Error(
        `Formless UI document theme ${JSON.stringify(snapshot.id)} has duplicate mode options.`,
      );
    }
    modes.add(option.mode);

    if (
      option.selectionIntent.themeId !== snapshot.id ||
      option.selectionIntent.controlId !== control.id ||
      option.selectionIntent.mode !== option.mode
    ) {
      throw new Error(
        `Formless UI document theme ${JSON.stringify(snapshot.id)} has an invalid mode-selection intent.`,
      );
    }
  }
}

function mismatchedNodeError(reference: PresentationReference) {
  return new Error(
    `Formless UI contract snapshot does not match reference ${presentationReferenceKey(reference)}.`,
  );
}

function assertReferencesResolve(nodes: StoredPresentationNodes) {
  for (const node of nodes.values()) {
    if (node.snapshot.kind === "accessManifest") {
      if (node.snapshot.state !== "ready") {
        continue;
      }
      if (node.snapshot.authoring.accessId !== node.snapshot.id) {
        throw invalidScopedReferenceError(node.snapshot.authoring);
      }
      assertReferenceResolves(nodes, node.snapshot.authoring);
      if (node.snapshot.personAuthoring) {
        if (node.snapshot.personAuthoring.accessId !== node.snapshot.id) {
          throw invalidScopedReferenceError(node.snapshot.personAuthoring);
        }
        assertReferenceResolves(nodes, node.snapshot.personAuthoring);
      }
      continue;
    }

    if (node.snapshot.kind === "managementManifest") {
      if (node.snapshot.state !== "ready") {
        continue;
      }

      const manifest = node.snapshot;
      const roleOrder = { apps: 0, routes: 1 } as const;
      const seenRoles = new Set<string>();
      let previousRoleOrder = -1;
      manifest.workspaces.forEach((workspace) => {
        const currentRoleOrder = roleOrder[workspace.role];
        if (seenRoles.has(workspace.role) || currentRoleOrder <= previousRoleOrder) {
          throw new Error(
            `Formless UI management manifest ${JSON.stringify(manifest.id)} has invalid workspace order.`,
          );
        }
        seenRoles.add(workspace.role);
        previousRoleOrder = currentRoleOrder;
        assertReferenceResolves(nodes, workspace.reference);
      });

      const authorizationPrompt = manifest.workspaceOperation?.authorizationPrompt;
      if (authorizationPrompt) {
        const intent = authorizationPrompt.intent;
        if (
          intent.managementId !== manifest.id ||
          intent.operationId !== manifest.workspaceOperation?.id ||
          intent.promptId !== authorizationPrompt.id ||
          intent.controlId !== authorizationPrompt.action.id
        ) {
          throw new Error(
            `Formless UI management manifest ${JSON.stringify(manifest.id)} has an invalid authorization intent.`,
          );
        }
      }
      continue;
    }

    if (node.snapshot.kind === "shellManifest") {
      const manifest = node.snapshot;
      for (const sectionReference of manifest.navigationSections) {
        if (sectionReference.shellId !== manifest.id) {
          throw invalidScopedReferenceError(sectionReference);
        }
        assertReferenceResolves(nodes, sectionReference);
      }

      const workspaceSwitcher = manifest.workspaceSwitcher;
      const workspaceSwitcherSections = manifest.navigationSections.filter((reference) => {
        return snapshotForReference(nodes, reference)?.role === "workspaceSwitcher";
      });
      if (
        workspaceSwitcher === null
          ? workspaceSwitcherSections.length !== 0
          : workspaceSwitcher.shellId !== manifest.id ||
            !manifest.navigationSections.some(
              (reference) => reference.sectionId === workspaceSwitcher.sectionId,
            ) ||
            snapshotForReference(nodes, workspaceSwitcher)?.role !== "workspaceSwitcher" ||
            workspaceSwitcherSections.length !== 1
      ) {
        throw new Error(
          `Formless UI shell ${JSON.stringify(manifest.id)} has an invalid workspace switcher.`,
        );
      }

      const activeDestination = manifest.activeDestination;
      if (activeDestination) {
        const sectionReference = manifest.navigationSections.find(
          ({ sectionId }) => sectionId === activeDestination.sectionId,
        );
        const section = sectionReference
          ? snapshotForReference(nodes, sectionReference)
          : undefined;
        if (
          !section ||
          !section.destinations.some(({ id }) => id === activeDestination.destinationId)
        ) {
          throw new Error(
            `Formless UI shell active destination ${JSON.stringify(activeDestination)} has no snapshot.`,
          );
        }
      }
      continue;
    }

    if (node.snapshot.kind === "workspaceManifest") {
      for (const sectionReference of node.snapshot.sections) {
        if (sectionReference.workspaceId !== node.snapshot.id) {
          throw invalidScopedReferenceError(sectionReference);
        }
        assertReferenceResolves(nodes, sectionReference);
      }
      continue;
    }

    if (node.snapshot.kind === "workspaceSectionShell") {
      const { presentation } = node.snapshot.collection;
      const sectionNode = node as StoredPresentationNode & {
        reference: WorkspaceSectionShellReference;
      };
      assertWorkspaceResultScope(sectionNode.reference, presentation.result);
      assertReferenceResolves(nodes, presentation.result);
      if (presentation.contextDetail) {
        assertWorkspaceResultScope(sectionNode.reference, presentation.contextDetail);
        assertReferenceResolves(nodes, presentation.contextDetail);
      }
      if (presentation.kind === "selectedRecord") {
        assertWorkspaceSelectedRecordContract(nodes, sectionNode.reference, {
          collectionId: node.snapshot.collection.id,
          presentation,
        });
      }
    }
  }
}

function assertWorkspaceSelectedRecordContract(
  nodes: StoredPresentationNodes,
  sectionReference: WorkspaceSectionShellReference,
  {
    collectionId,
    presentation,
  }: {
    collectionId: string;
    presentation: WorkspaceSelectedRecordShellContract;
  },
) {
  const mainResult = snapshotForReference(nodes, presentation.result);
  if (presentation.result.role !== "mainResult" || mainResult?.kind !== "list") {
    throw new Error(
      `Formless UI selected-record workspace ${JSON.stringify(presentation.id)} requires one main list result.`,
    );
  }

  const recordIds = new Set(mainResult.items.map(({ id }) => id));
  const selectionRecordIds = new Set<string>();
  for (const intent of presentation.selectionIntents) {
    if (
      intent.type !== "workspaceSelectedRecordSelection" ||
      intent.screenId !== sectionReference.workspaceId ||
      intent.sectionId !== sectionReference.sectionId ||
      intent.collectionId !== collectionId ||
      !recordIds.has(intent.recordId) ||
      selectionRecordIds.has(intent.recordId)
    ) {
      throw new Error(
        `Formless UI selected-record workspace ${JSON.stringify(presentation.id)} has an invalid selection intent.`,
      );
    }
    selectionRecordIds.add(intent.recordId);
  }
  if (
    selectionRecordIds.size !== recordIds.size ||
    [...recordIds].some((recordId) => !selectionRecordIds.has(recordId))
  ) {
    throw new Error(
      `Formless UI selected-record workspace ${JSON.stringify(presentation.id)} must expose one selection intent per list record.`,
    );
  }

  const selectedRecordId = presentation.selectedRecordId;
  if (mainResult.selection?.selectedItemId !== selectedRecordId) {
    throw new Error(
      `Formless UI selected-record workspace ${JSON.stringify(presentation.id)} has invalid list selection.`,
    );
  }
  for (const item of mainResult.items) {
    if (item.presentation !== "summary") {
      continue;
    }
    const selectionIntent = item.selectionIntent;
    if (
      selectionIntent?.type !== "workspaceSelectedRecordSelection" ||
      selectionIntent.screenId !== sectionReference.workspaceId ||
      selectionIntent.sectionId !== sectionReference.sectionId ||
      selectionIntent.collectionId !== collectionId ||
      selectionIntent.recordId !== item.id
    ) {
      throw new Error(
        `Formless UI selected-record workspace ${JSON.stringify(presentation.id)} has invalid summary selection.`,
      );
    }
  }

  if (selectedRecordId === null) {
    if (
      presentation.activePresentation !== "list" ||
      presentation.backIntent !== undefined ||
      presentation.sections.length !== 0
    ) {
      throw new Error(
        `Formless UI selected-record workspace ${JSON.stringify(presentation.id)} has an invalid unselected state.`,
      );
    }
    return;
  }

  const backIntent = presentation.backIntent;
  if (
    presentation.activePresentation !== "detail" ||
    !recordIds.has(selectedRecordId) ||
    backIntent?.type !== "workspaceSelectedRecordBack" ||
    backIntent.screenId !== sectionReference.workspaceId ||
    backIntent.sectionId !== sectionReference.sectionId ||
    backIntent.collectionId !== collectionId ||
    backIntent.recordId !== selectedRecordId ||
    presentation.sections.length === 0
  ) {
    throw new Error(
      `Formless UI selected-record workspace ${JSON.stringify(presentation.id)} has an invalid selected state.`,
    );
  }

  const detailSectionIds = new Set<string>();
  for (const detailSection of presentation.sections) {
    if (detailSectionIds.has(detailSection.id)) {
      throw new Error(
        `Formless UI selected-record workspace ${JSON.stringify(presentation.id)} has duplicate detail section identities.`,
      );
    }
    detailSectionIds.add(detailSection.id);
    if (detailSection.kind === "selectedRecordRelationshipHierarchySection") {
      assertWorkspaceResultScope(sectionReference, detailSection.hierarchy);
      assertReferenceResolves(nodes, detailSection.hierarchy);
      const hierarchy = snapshotForReference(nodes, detailSection.hierarchy);
      if (
        detailSection.hierarchy.role !== "selectedDetail" ||
        hierarchy?.kind !== "relationshipHierarchy" ||
        hierarchy.root.recordId !== selectedRecordId
      ) {
        throw new Error(
          `Formless UI selected-record workspace ${JSON.stringify(presentation.id)} has an invalid relationship hierarchy.`,
        );
      }
      continue;
    }

    assertWorkspaceResultScope(sectionReference, detailSection.result);
    assertReferenceResolves(nodes, detailSection.result);

    const result = snapshotForReference(nodes, detailSection.result);
    const resultMatchesSection =
      detailSection.result.role === "selectedDetailResult" &&
      (detailSection.kind === "selectedRecordRecordSection"
        ? result?.kind === "recordResult" && result.selectedRecord?.id === selectedRecordId
        : result?.kind === "table");
    if (!resultMatchesSection) {
      throw new Error(
        `Formless UI selected-record workspace ${JSON.stringify(presentation.id)} has an invalid detail result.`,
      );
    }
  }
}

function assertRelationshipHierarchyContract(snapshot: RelationshipHierarchyContract) {
  const occurrenceIds = new Set<string>();
  const relationshipGroupIds = new Set<string>();

  function visit(node: RelationshipHierarchyContract["root"]) {
    if (occurrenceIds.has(node.id)) {
      throw new Error(
        `Formless UI relationship hierarchy ${JSON.stringify(snapshot.id)} has duplicate occurrence identities.`,
      );
    }
    occurrenceIds.add(node.id);

    if (node.editor.selectedRecord?.id !== node.recordId) {
      throw new Error(
        `Formless UI relationship hierarchy ${JSON.stringify(snapshot.id)} has an invalid occurrence record editor.`,
      );
    }

    const immediateRelationshipGroupIds = new Set(node.relationshipGroups.map(({ id }) => id));
    for (const action of node.headerActions.items) {
      if (
        action.kind === "createAction" &&
        !immediateRelationshipGroupIds.has(action.relationshipGroupId)
      ) {
        throw new Error(
          `Formless UI relationship hierarchy ${JSON.stringify(snapshot.id)} has an invalid create-action relationship group.`,
        );
      }
    }

    for (const relationshipGroup of node.relationshipGroups) {
      if (relationshipGroupIds.has(relationshipGroup.id)) {
        throw new Error(
          `Formless UI relationship hierarchy ${JSON.stringify(snapshot.id)} has duplicate relationship group identities.`,
        );
      }
      relationshipGroupIds.add(relationshipGroup.id);
      for (const child of relationshipGroup.nodes) {
        visit(child);
      }
    }
  }

  visit(snapshot.root);
}

function assertTreeResultContract(snapshot: TreeResultContract) {
  if (snapshot.availability.state === "ready" && snapshot.root === undefined) {
    throw new Error(
      `Formless UI tree result ${JSON.stringify(snapshot.id)} has no ready root occurrence.`,
    );
  }
  if (snapshot.availability.state !== "ready" && snapshot.root !== undefined) {
    throw new Error(
      `Formless UI tree result ${JSON.stringify(snapshot.id)} has a root outside ready state.`,
    );
  }

  const nodeIds = new Set<string>();
  const editorIds = new Set<string>();

  function visit(node: NonNullable<TreeResultContract["root"]>) {
    if (nodeIds.has(node.id)) {
      throw new Error(
        `Formless UI tree result ${JSON.stringify(snapshot.id)} has duplicate node identities.`,
      );
    }
    nodeIds.add(node.id);

    if (node.structure.state === "missingChild") {
      if (node.editor !== undefined) {
        throw new Error(
          `Formless UI tree result ${JSON.stringify(snapshot.id)} has an editor for a missing child.`,
        );
      }
    } else if (
      node.editor === undefined ||
      node.editor.id !== `${node.id}:editor` ||
      node.editor.selectedRecord === undefined
    ) {
      throw new Error(
        `Formless UI tree result ${JSON.stringify(snapshot.id)} has an invalid node editor.`,
      );
    }

    if (node.editor !== undefined) {
      if (editorIds.has(node.editor.id)) {
        throw new Error(
          `Formless UI tree result ${JSON.stringify(snapshot.id)} has duplicate editor identities.`,
        );
      }
      editorIds.add(node.editor.id);
    }

    for (const child of node.children) {
      visit(child);
    }
  }

  if (snapshot.root !== undefined) {
    visit(snapshot.root);
  }
}

function assertWorkspaceResultScope(
  sectionReference: WorkspaceSectionShellReference,
  resultReference: PresentationReference,
) {
  if (
    !("workspaceId" in resultReference) ||
    !("sectionId" in resultReference) ||
    resultReference.workspaceId !== sectionReference.workspaceId ||
    resultReference.sectionId !== sectionReference.sectionId
  ) {
    throw invalidScopedReferenceError(resultReference);
  }
}

function invalidScopedReferenceError(reference: PresentationReference) {
  return new Error(
    `Formless UI contract reference ${presentationReferenceKey(reference)} has an invalid parent scope.`,
  );
}

function assertReferenceResolves(nodes: StoredPresentationNodes, reference: PresentationReference) {
  if (!nodes.has(presentationReferenceKey(reference))) {
    throw new Error(
      `Formless UI contract reference ${presentationReferenceKey(reference)} has no snapshot.`,
    );
  }
}

function changedReferenceKeys(previous: StoredPresentationNodes, next: StoredPresentationNodes) {
  const changed = new Set<string>();

  for (const [key, previousNode] of previous) {
    if (next.get(key)?.snapshot !== previousNode.snapshot) {
      changed.add(key);
    }
  }

  for (const key of next.keys()) {
    if (!previous.has(key)) {
      changed.add(key);
    }
  }

  return changed;
}

function semanticallyEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (!isObject(left) || !isObject(right)) {
    return false;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }

    return left.every((value, index) => semanticallyEqual(value, right[index]));
  }

  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();

  if (
    leftKeys.length !== rightKeys.length ||
    leftKeys.some((key, index) => key !== rightKeys[index])
  ) {
    return false;
  }

  return leftKeys.every((key) => semanticallyEqual(left[key], right[key]));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
