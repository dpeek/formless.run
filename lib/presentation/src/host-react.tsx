import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import type {
  AccessIntentHandler,
  AccessInvitationAuthoringReference,
  AccessManifestReference,
  AccessPersonRoleAuthoringReference,
  ApplicationSystemStateIntentHandler,
  ApplicationSystemStateReference,
  AuthIntentHandler,
  AuthSurfaceReference,
  PresentationReference,
  DocumentThemeIntentHandler,
  DocumentThemeReference,
  ManagementIntentHandler,
  ManagementManifestReference,
  RelationshipHierarchyReference,
  ResultReference,
  ShellIntentHandler,
  ShellManifestReference,
  ShellNavigationSectionReference,
  TreeResultReference,
  WorkspaceIntentHandler,
  WorkspaceManifestReference,
  WorkspaceSectionShellReference,
} from "./contract.ts";
import type { PresentationHost, PresentationSnapshot } from "./host.ts";

const PresentationHostContext = createContext<PresentationHost | null>(null);

export function PresentationHostProvider({
  children,
  host,
}: {
  children: ReactNode;
  host: PresentationHost;
}) {
  return (
    <PresentationHostContext.Provider value={host}>{children}</PresentationHostContext.Provider>
  );
}

export function usePresentationHost() {
  const host = useContext(PresentationHostContext);

  if (!host) {
    throw new Error("Presentation hooks require PresentationHostProvider.");
  }

  return host;
}

export function useWorkspaceIntentHandler(): WorkspaceIntentHandler {
  const host = usePresentationHost();
  return useCallback((intent) => host.dispatch(intent), [host]);
}

export function useAccessIntentHandler(): AccessIntentHandler {
  const host = usePresentationHost();
  return useCallback((intent) => host.dispatch(intent), [host]);
}

export function useApplicationSystemStateIntentHandler(): ApplicationSystemStateIntentHandler {
  const host = usePresentationHost();
  return useCallback((intent) => host.dispatch(intent), [host]);
}

export function useAuthIntentHandler(): AuthIntentHandler {
  const host = usePresentationHost();
  return useCallback((intent) => host.dispatch(intent), [host]);
}

export function useShellIntentHandler(): ShellIntentHandler {
  const host = usePresentationHost();
  return useCallback((intent) => host.dispatch(intent), [host]);
}

export function useDocumentThemeIntentHandler(): DocumentThemeIntentHandler {
  const host = usePresentationHost();
  return useCallback((intent) => host.dispatch(intent), [host]);
}

export function useManagementIntentHandler(): ManagementIntentHandler {
  const host = usePresentationHost();
  return useCallback((intent) => host.dispatch(intent), [host]);
}

export function usePresentationSnapshot<Reference extends PresentationReference>(
  reference: Reference,
): PresentationSnapshot<Reference> | undefined {
  const host = usePresentationHost();
  const callbacks = useMemo(
    () => ({
      getServerSnapshot: () => host.getServerSnapshot(reference),
      getSnapshot: () => host.read(reference),
      subscribe: (listener: () => void) => host.subscribe(reference, listener),
    }),
    [host, reference],
  );

  return useSyncExternalStore(
    callbacks.subscribe,
    callbacks.getSnapshot,
    callbacks.getServerSnapshot,
  );
}

export function useWorkspaceManifest(reference: WorkspaceManifestReference) {
  return usePresentationSnapshot(reference);
}

export function useAccessManifest(reference: AccessManifestReference) {
  return usePresentationSnapshot(reference);
}

export function useApplicationSystemState(reference: ApplicationSystemStateReference) {
  return usePresentationSnapshot(reference);
}

export function useAccessInvitationAuthoring(reference: AccessInvitationAuthoringReference) {
  return usePresentationSnapshot(reference);
}

export function useAccessPersonRoleAuthoring(reference: AccessPersonRoleAuthoringReference) {
  return usePresentationSnapshot(reference);
}

export function useAuthSurface<Reference extends AuthSurfaceReference>(reference: Reference) {
  return usePresentationSnapshot(reference);
}

export function useDocumentTheme(reference: DocumentThemeReference) {
  return usePresentationSnapshot(reference);
}

export function useManagementManifest(reference: ManagementManifestReference) {
  return usePresentationSnapshot(reference);
}

export function useShellManifest(reference: ShellManifestReference) {
  return usePresentationSnapshot(reference);
}

export function useShellNavigationSection(reference: ShellNavigationSectionReference) {
  return usePresentationSnapshot(reference);
}

export function useWorkspaceSectionShell(reference: WorkspaceSectionShellReference) {
  return usePresentationSnapshot(reference);
}

export function useResult<Reference extends ResultReference>(reference: Reference) {
  return usePresentationSnapshot(reference);
}

export function useRelationshipHierarchy(reference: RelationshipHierarchyReference) {
  return usePresentationSnapshot(reference);
}

export function useTreeResult(reference: TreeResultReference) {
  return usePresentationSnapshot(reference);
}
