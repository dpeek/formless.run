import type {
  CreateSurfaceContract,
  ShellDestinationIdentity,
  ShellManifestContract,
  ShellNavigationSectionContract,
  ShellSessionContract,
  ShellSyncStatusContract,
} from "@dpeek/formless-presentation/contract";
import { shellNavigationSectionReference } from "@dpeek/formless-presentation/host";
import {
  createEntityRecordCountReferencingFieldSelector,
  createEntityRecordOptionsMatchingQuerySelector,
  type BrowserReplicaProjectionSnapshot,
} from "../../client/projections.ts";
import type { SyncStatus } from "../../client/sync-status.ts";
import {
  selectGeneratedRootNavigationGroupFacts,
  selectGeneratedRootNavigationStateFacts,
  type GeneratedRootNavigationFacts,
} from "../../client/generated-authoring.ts";
import type { AccountSessionStatusResponse } from "../../shared/instance-auth.ts";
import { COLLABORATOR_INVITATION_ACCEPT_PATH } from "../../shared/instance-auth.ts";
import { isRuntimeAuthAccountRoutePath } from "../../shared/runtime-topology.ts";
import { formatGeneratedWorkspaceCount } from "./workspace-projection.ts";
import {
  isRuntimePublicSiteRoute,
  normalizeRuntimeBrowserPath,
  runtimeBrowserRoutePatterns,
  type RuntimeProfile,
} from "../runtime-profile.ts";
import { FORMLESS_PROGRAM_SCREEN_PATHS, formlessProgramSchema } from "../../program/runtime.ts";

export const GENERATED_APPLICATION_SHELL_ID = "application-shell";

export type GeneratedShellLogoutState = "error" | "idle" | "pending";

export type GeneratedShellSyncFacts = {
  cursor: number;
  lastSyncedAt: string | null;
  schemaVersion: number | null;
  status: SyncStatus;
};

export type GeneratedShellRootProjectionInput = {
  createSurfacesByQueryName?: Readonly<Record<string, CreateSurfaceContract | undefined>>;
  facts: GeneratedRootNavigationFacts;
  selectedRecordId: string | null;
  snapshot: BrowserReplicaProjectionSnapshot;
  today: string;
};

export type GeneratedApplicationShellProjection = {
  manifest: ShellManifestContract;
  sections: readonly ShellNavigationSectionContract[];
};

export type ProjectGeneratedApplicationShellOptions = {
  authorizedProgramScreenPaths?: readonly string[] | undefined;
  currentPath: string;
  logoutState?: GeneratedShellLogoutState | undefined;
  accountSession?: AccountSessionStatusResponse | undefined;
  root?: GeneratedShellRootProjectionInput | undefined;
  runtimeProfile: RuntimeProfile;
  sync?: GeneratedShellSyncFacts | undefined;
};

export function shouldRenderGeneratedShell({
  currentPath,
  runtimeProfile,
}: {
  currentPath: string;
  runtimeProfile: RuntimeProfile;
}): boolean {
  const path = normalizeRuntimeBrowserPath(currentPath);
  const routes = runtimeBrowserRoutePatterns(runtimeProfile);

  if (
    isRuntimeAuthAccountRoutePath(path) ||
    path === COLLABORATOR_INVITATION_ACCEPT_PATH ||
    path === routes.localSessionRoute ||
    runtimeProfile.shell === "publishedSite" ||
    isRuntimePublicSiteRoute(runtimeProfile, path)
  ) {
    return false;
  }

  if (runtimeProfile.shell === "dev") {
    return true;
  }

  if (runtimeProfile.shell === "instance") {
    return FORMLESS_PROGRAM_SCREEN_PATHS.includes(path);
  }

  return false;
}

export function selectGeneratedShellActiveHref(
  currentPath: string,
  hrefs: readonly string[],
): string | null {
  const path = normalizeRuntimeBrowserPath(currentPath);
  const matches = hrefs.filter(
    (href) => path === href || (href !== "/" && path.startsWith(`${href}/`)),
  );

  return matches.sort((left, right) => right.length - left.length)[0] ?? null;
}

export function selectGeneratedShellRootSections({
  createSurfacesByQueryName = {},
  facts,
  selectedRecordId,
  snapshot,
  today,
}: GeneratedShellRootProjectionInput): ShellNavigationSectionContract[] {
  const { context, groups, screen, section } = facts;
  const allOptions = createEntityRecordOptionsMatchingQuerySelector(
    context.entityName,
    context.query,
    context.labelField,
    { today },
  )(snapshot);
  const { activeRecordId } = selectGeneratedRootNavigationStateFacts({
    options: allOptions,
    selectedRecordId,
  });

  return groups.flatMap((group) => {
    const options = createEntityRecordOptionsMatchingQuerySelector(
      context.entityName,
      group.query,
      context.labelField,
      { today },
    )(snapshot);
    const groupFacts = selectGeneratedRootNavigationGroupFacts({ activeRecordId, options });
    const createSurface = createSurfacesByQueryName[group.queryName];

    if (groupFacts.isEmpty && createSurface === undefined) {
      return [];
    }

    const sectionId = generatedShellRootSectionId(screen.screenName, section.id, group.queryName);
    const destinations = groupFacts.items.map(({ isActive, option }) => ({
      accessibilityLabel: option.label,
      availability: { available: true } as const,
      ...(context.relatedCollection
        ? {
            countText: formatGeneratedWorkspaceCount(
              createEntityRecordCountReferencingFieldSelector(
                context.relatedCollection.entityName,
                context.relatedCollection.referenceFieldName,
                option.id,
              )(snapshot),
            ),
          }
        : {}),
      id: `root:${option.id}`,
      kind: "shellRootRecordDestination" as const,
      label: option.label,
      recordId: option.id,
      selected: isActive,
      selectionIntent: {
        destinationId: `root:${option.id}`,
        recordId: option.id,
        sectionId,
        shellId: GENERATED_APPLICATION_SHELL_ID,
        type: "shellRootRecordSelection" as const,
      },
    }));

    return [
      {
        accessibilityLabel: `${group.label} roots`,
        ...(createSurface === undefined ? {} : { createSurface }),
        destinations,
        id: sectionId,
        kind: "shellNavigationSection" as const,
        label: group.label,
        role: "rootRecords" as const,
        shellId: GENERATED_APPLICATION_SHELL_ID,
      },
    ];
  });
}

export function selectGeneratedShellSyncStatus({
  cursor,
  lastSyncedAt,
  schemaVersion,
  status,
}: GeneratedShellSyncFacts): ShellSyncStatusContract {
  return {
    details: [
      { label: "Program", value: "Formless Program" },
      { label: "Schema", value: schemaVersion === null ? "Loading" : `v${schemaVersion}` },
      { label: "Cursor", value: String(cursor) },
      { label: "Last sync", value: lastSyncedAt ?? "None yet" },
    ],
    id: `${GENERATED_APPLICATION_SHELL_ID}:sync`,
    kind: "shellSyncStatus",
    label:
      status.state === "error" ? "Sync issue" : status.state === "syncing" ? "Syncing" : "Synced",
    message:
      status.state === "error" ? "Sync failed. Check the Program and try again." : status.message,
    state: status.state,
  };
}

export function selectGeneratedShellSession(
  accountSession: AccountSessionStatusResponse | undefined,
  logoutState: GeneratedShellLogoutState = "idle",
): ShellSessionContract {
  const id = `${GENERATED_APPLICATION_SHELL_ID}:session`;

  if (!accountSession?.authenticated) {
    return { id, kind: "shellSession", state: "anonymous" };
  }

  return {
    id,
    identity: {
      displayName: accountSession.principal.displayName,
      ...(accountSession.principal.email ? { secondaryLabel: accountSession.principal.email } : {}),
    },
    kind: "shellSession",
    logout: {
      ...shellButton(
        `${id}:logout`,
        logoutState === "pending" ? "Logging out..." : "Log out",
        "quiet",
      ),
      ...(logoutState === "error" ? { errors: ["Logout failed. Try again."] } : {}),
      disabled: logoutState === "pending",
      ...(logoutState === "pending" ? { pending: { isPending: true, label: "Logging out" } } : {}),
    },
    state: "authenticated",
  };
}

export function selectGeneratedShellActiveDestination(
  sections: readonly ShellNavigationSectionContract[],
): ShellDestinationIdentity | null {
  for (const section of [...sections].reverse()) {
    const destination = section.destinations.find((candidate) => candidate.selected);

    if (destination) {
      return { destinationId: destination.id, sectionId: section.id };
    }
  }

  return null;
}

export function projectGeneratedApplicationShell({
  authorizedProgramScreenPaths = [],
  currentPath,
  logoutState = "idle",
  accountSession,
  root,
  runtimeProfile,
  sync,
}: ProjectGeneratedApplicationShellOptions): GeneratedApplicationShellProjection | undefined {
  if (!shouldRenderGeneratedShell({ currentPath, runtimeProfile })) {
    return undefined;
  }

  const sections: ShellNavigationSectionContract[] = [];

  if (isGeneratedShellProgramPath(currentPath)) {
    sections.push(programSection(currentPath, authorizedProgramScreenPaths));
  }

  if (root) {
    sections.push(...selectGeneratedShellRootSections(root));
  }

  if (sync) {
    sections.push({
      accessibilityLabel: "Formless Program settings",
      destinations: [],
      id: `${GENERATED_APPLICATION_SHELL_ID}:settings:formless-program`,
      kind: "shellNavigationSection",
      label: "Settings",
      role: "settings",
      settings: {
        id: `${GENERATED_APPLICATION_SHELL_ID}:settings:formless-program:controls`,
        kind: "shellSettings",
        sync: selectGeneratedShellSyncStatus(sync),
      },
      shellId: GENERATED_APPLICATION_SHELL_ID,
    });
  }

  sections.push({
    accessibilityLabel: "Account session",
    destinations: [],
    id: `${GENERATED_APPLICATION_SHELL_ID}:account-session`,
    kind: "shellNavigationSection",
    role: "session",
    session: selectGeneratedShellSession(accountSession, logoutState),
    shellId: GENERATED_APPLICATION_SHELL_ID,
  });

  return {
    manifest: {
      accessibilityLabel: "Formless Program application shell",
      activeDestination: selectGeneratedShellActiveDestination(sections),
      id: GENERATED_APPLICATION_SHELL_ID,
      kind: "shellManifest",
      navigationSections: sections.map((section) =>
        shellNavigationSectionReference(GENERATED_APPLICATION_SHELL_ID, section.id),
      ),
      title: "Formless Program",
    },
    sections,
  };
}

function isGeneratedShellProgramPath(currentPath: string): boolean {
  const path = normalizeRuntimeBrowserPath(currentPath);

  return FORMLESS_PROGRAM_SCREEN_PATHS.includes(path);
}

export function generatedShellRootSectionId(
  screenName: string,
  sectionId: string,
  queryName: string,
): string {
  return `${GENERATED_APPLICATION_SHELL_ID}:roots:${screenName}:${sectionId}:${queryName}`;
}

function programSection(
  currentPath: string,
  authorizedProgramScreenPaths: readonly string[],
): ShellNavigationSectionContract {
  const path = normalizeRuntimeBrowserPath(currentPath);
  const authorizedPaths = new Set(authorizedProgramScreenPaths);
  const screens = new Map(formlessProgramSchema.screens.map((screen) => [screen.key, screen]));
  const destinations = (formlessProgramSchema.navigation?.primaryScreens ?? [])
    .map((screenKey) => screens.get(screenKey))
    .filter(
      (screen): screen is NonNullable<typeof screen> & { path: `/${string}` } =>
        screen?.path !== undefined && authorizedPaths.has(screen.path),
    )
    .map((screen) => ({
      href: screen.path,
      id: `program:${screen.key}`,
      label: screen.label,
    }));
  const activeHref = selectGeneratedShellActiveHref(
    path,
    destinations.map(({ href }) => href),
  );

  return {
    accessibilityLabel: "Program navigation",
    destinations: destinations.map(({ href, id, label }) => ({
      accessibilityLabel: label,
      availability: { available: true },
      href,
      id,
      kind: "shellLinkDestination",
      label,
      selected: href === activeHref,
    })),
    id: `${GENERATED_APPLICATION_SHELL_ID}:program`,
    kind: "shellNavigationSection",
    role: "program",
    shellId: GENERATED_APPLICATION_SHELL_ID,
  };
}

function shellButton(id: string, label: string, prominence: "primary" | "secondary" | "quiet") {
  return {
    accessibilityLabel: label,
    content: { kind: "label" as const, label },
    density: "default" as const,
    id,
    kind: "button" as const,
    prominence,
    type: "button" as const,
  };
}
