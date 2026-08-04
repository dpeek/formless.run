import type {
  CreateSurfaceContract,
  ShellDestinationIdentity,
  ShellManifestContract,
  ShellNavigationSectionContract,
  ShellSessionContract,
  ShellSyncStatusContract,
  ShellWorkspaceSaveStatusContract,
} from "@dpeek/formless-presentation/contract";
import type { AppSchema } from "@dpeek/formless-schema";
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
import {
  formlessProgramSchema,
  resolveFormlessProgramScreenRouteTarget,
} from "../../program/runtime.ts";

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
  programSchema?: AppSchema | undefined;
  root?: GeneratedShellRootProjectionInput | undefined;
  runtimeProfile: RuntimeProfile;
  sync?: GeneratedShellSyncFacts | undefined;
  workspaceSave?: ShellWorkspaceSaveStatusContract | undefined;
};

export function shouldRenderGeneratedShell({
  currentPath,
  programSchema = formlessProgramSchema,
  runtimeProfile,
}: {
  currentPath: string;
  programSchema?: AppSchema | undefined;
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
    return resolveFormlessProgramScreenRouteTarget(path, programSchema) !== undefined;
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
      {
        label: "Schema",
        presentation: "text",
        value: schemaVersion === null ? "Loading" : `v${schemaVersion}`,
      },
      { label: "Cursor", presentation: "text", value: String(cursor) },
      lastSyncedAt === null
        ? { label: "Last sync", presentation: "text", value: "None yet" }
        : { label: "Last sync", presentation: "timestamp", value: lastSyncedAt },
    ],
    id: `${GENERATED_APPLICATION_SHELL_ID}:sync`,
    kind: "shellSyncStatus",
    label:
      status.state === "error" ? "Sync issue" : status.state === "syncing" ? "Syncing" : "Synced",
    message: selectGeneratedShellSyncMessage(status),
    state: status.state,
  };
}

export function selectGeneratedShellSyncMessage(status: SyncStatus): string {
  switch (status.code) {
    case "local-cache-ready":
      return "Local cache ready.";
    case "media-uploaded":
      return "Media uploaded.";
    case "media-uploaded-and-synced":
      return "Media uploaded and synced.";
    case "program-changes-caught-up":
      return "Program changes caught up.";
    case "program-synced":
      return "Synced.";
    case "record-saved":
      return "Saved and synced.";
    case "record-updated":
      return "Updated and synced.";
    case "operation-committed":
      return `${status.label} synced.`;
    case "operation-replayed":
      return `${status.label} replayed.`;
    case "media-uploading":
      return "Uploading media...";
    case "program-catching-up":
      return "Catching up Program changes...";
    case "program-syncing":
      return "Syncing Formless Program...";
    case "push-connecting":
      return "Connecting push sync...";
    case "push-connection-issue":
      return "Push sync connection issue.";
    case "push-reconnecting":
      return "Push sync reconnecting...";
    case "push-renewing":
      return "Renewing push sync connection...";
    case "operation-running":
      return `${status.label}...`;
    case "record-saving":
      return `Saving ${status.label}...`;
    case "record-updating":
      return `Updating ${status.label}...`;
    case "media-upload-failed":
      return "Media upload failed. Try again.";
    case "program-sync-failed":
      return "Sync failed. Check the Program and try again.";
    case "push-authorization-changed":
      return "Push sync authorization changed. Sign in again.";
    case "push-connection-failed":
      return "Push sync connection failed. Try again.";
    case "push-invalid-message":
      return "Push sync received an invalid update. Try again.";
    case "record-save-failed":
      return "Save failed. Try again.";
    case "record-update-failed":
      return "Update failed. Try again.";
    case "operation-failed":
      return `${status.label} failed. Try again.`;
  }
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
  programSchema = formlessProgramSchema,
  root,
  runtimeProfile,
  sync,
  workspaceSave,
}: ProjectGeneratedApplicationShellOptions): GeneratedApplicationShellProjection | undefined {
  if (!shouldRenderGeneratedShell({ currentPath, programSchema, runtimeProfile })) {
    return undefined;
  }

  const sections: ShellNavigationSectionContract[] = [];
  let title = "Formless Program";
  const selectedProgramScreen = resolveFormlessProgramScreenRouteTarget(
    normalizeRuntimeBrowserPath(currentPath),
    programSchema,
  );

  if (selectedProgramScreen) {
    const programNavigation = programNavigationSections(
      selectedProgramScreen.key,
      authorizedProgramScreenPaths,
      programSchema,
    );
    sections.push(...programNavigation.sections);
    title = programNavigation.title;
  }

  if (root) {
    sections.push(...selectGeneratedShellRootSections(root));
  }

  if (sync) {
    sections.push({
      accessibilityLabel: "Formless Program status",
      destinations: [],
      id: `${GENERATED_APPLICATION_SHELL_ID}:status:formless-program`,
      kind: "shellNavigationSection",
      role: "status",
      status: {
        id: `${GENERATED_APPLICATION_SHELL_ID}:status:formless-program:controls`,
        kind: "shellStatus",
        sync: selectGeneratedShellSyncStatus(sync),
        ...(workspaceSave ? { workspaceSave } : {}),
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
  const workspaceSwitcher = sections.find((section) => section.role === "workspaceSwitcher");

  return {
    manifest: {
      accessibilityLabel: "Formless Program application shell",
      activeDestination: selectGeneratedShellActiveDestination(sections),
      id: GENERATED_APPLICATION_SHELL_ID,
      kind: "shellManifest",
      navigationSections: sections.map((section) =>
        shellNavigationSectionReference(GENERATED_APPLICATION_SHELL_ID, section.id),
      ),
      title,
      workspaceSwitcher: workspaceSwitcher
        ? shellNavigationSectionReference(GENERATED_APPLICATION_SHELL_ID, workspaceSwitcher.id)
        : null,
    },
    sections,
  };
}

export function generatedShellRootSectionId(
  screenName: string,
  sectionId: string,
  queryName: string,
): string {
  return `${GENERATED_APPLICATION_SHELL_ID}:roots:${screenName}:${sectionId}:${queryName}`;
}

function programNavigationSections(
  selectedScreenKey: string,
  authorizedProgramScreenPaths: readonly string[],
  programSchema: AppSchema,
): {
  sections: ShellNavigationSectionContract[];
  title: string;
} {
  const groups = programSchema.navigation?.groups;

  if (groups === undefined) {
    return {
      sections: [
        programSection(
          programSchema.navigation?.primaryScreens ??
            programSchema.screens.map((screen) => screen.key),
          selectedScreenKey,
          authorizedProgramScreenPaths,
          programSchema,
        ),
      ],
      title: "Formless Program",
    };
  }

  const activeGroup = groups.find((group) => group.screens.includes(selectedScreenKey));
  const sections = [
    workspaceSwitcherSection(
      groups.map((group) => ({
        key: group.key,
        label: group.label,
        screens: authorizedProgramScreens(
          group.screens,
          authorizedProgramScreenPaths,
          programSchema,
        ),
        selected: group.key === activeGroup?.key,
      })),
    ),
    programSection(
      activeGroup?.screens ?? [selectedScreenKey],
      selectedScreenKey,
      authorizedProgramScreenPaths,
      programSchema,
    ),
  ];

  return {
    sections,
    title: activeGroup?.label ?? "Formless Program",
  };
}

function workspaceSwitcherSection(
  groups: readonly {
    key: string;
    label: string;
    screens: readonly { path: `/${string}` }[];
    selected: boolean;
  }[],
): ShellNavigationSectionContract {
  return {
    accessibilityLabel: "Program workspaces",
    destinations: groups.flatMap((group) => {
      const landingScreen = group.screens[0];

      return landingScreen
        ? [
            {
              accessibilityLabel: group.label,
              availability: { available: true } as const,
              href: landingScreen.path,
              id: `workspace:${group.key}`,
              kind: "shellLinkDestination" as const,
              label: group.label,
              selected: group.selected,
            },
          ]
        : [];
    }),
    id: `${GENERATED_APPLICATION_SHELL_ID}:workspaces`,
    kind: "shellNavigationSection",
    label: "Workspaces",
    role: "workspaceSwitcher",
    shellId: GENERATED_APPLICATION_SHELL_ID,
  };
}

function programSection(
  screenKeys: readonly string[],
  selectedScreenKey: string,
  authorizedProgramScreenPaths: readonly string[],
  programSchema: AppSchema,
): ShellNavigationSectionContract {
  const destinations = authorizedProgramScreens(
    screenKeys,
    authorizedProgramScreenPaths,
    programSchema,
  ).map((screen) => ({
    href: screen.path,
    id: `program:${screen.key}`,
    label: screen.label,
    selected: screen.key === selectedScreenKey,
  }));

  return {
    accessibilityLabel: "Program navigation",
    destinations: destinations.map(({ href, id, label, selected }) => ({
      accessibilityLabel: label,
      availability: { available: true },
      href,
      id,
      kind: "shellLinkDestination",
      label,
      selected,
    })),
    id: `${GENERATED_APPLICATION_SHELL_ID}:program`,
    kind: "shellNavigationSection",
    role: "program",
    shellId: GENERATED_APPLICATION_SHELL_ID,
  };
}

function authorizedProgramScreens(
  screenKeys: readonly string[],
  authorizedProgramScreenPaths: readonly string[],
  programSchema: AppSchema,
) {
  const authorizedPaths = new Set(authorizedProgramScreenPaths);
  const screens = new Map(programSchema.screens.map((screen) => [screen.key, screen]));

  return screenKeys.flatMap((screenKey) => {
    const screen = screens.get(screenKey);

    return screen?.path !== undefined && authorizedPaths.has(screen.path)
      ? [{ ...screen, path: screen.path as `/${string}` }]
      : [];
  });
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
