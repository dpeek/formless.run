import type {
  CreateSurfaceContract,
  ShellDestinationContract,
  ShellDestinationIdentity,
  ShellManifestContract,
  ShellNavigationSectionContract,
  ShellScope,
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
import type { HomeScreenModel } from "../../client/views.ts";
import type { AccountSessionStatusResponse } from "../../shared/instance-auth.ts";
import { COLLABORATOR_INVITATION_ACCEPT_PATH } from "../../shared/instance-auth.ts";
import {
  isRuntimeAuthAccountRoutePath,
  runtimeTopologyRoutes,
} from "../../shared/runtime-topology.ts";
import { formatGeneratedWorkspaceCount } from "./workspace-projection.ts";
import {
  isRuntimePublicSiteRoute,
  normalizeRuntimeBrowserPath,
  runtimeBrowserRoutePatterns,
  runtimeScreenRoute,
  type RuntimeProfile,
  type RuntimeWorldMount,
} from "../runtime-profile.ts";
import { FORMLESS_PROGRAM_SCREEN_PATHS, formlessProgramSchema } from "../../program/runtime.ts";

export const GENERATED_APPLICATION_SHELL_ID = "application-shell";

const GENERATED_APPLICATION_SHELL_INSTANCE_DESTINATION_ID = "instance:home";

export type GeneratedShellLogoutState = "error" | "idle" | "pending";

export type GeneratedShellSyncFacts = {
  cursor: number;
  lastSyncedAt: string | null;
  schemaVersion: number | null;
  status: SyncStatus;
  worldLabel: string;
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
  activeScreenPath?: string | undefined;
  authorizedProgramScreenPaths?: readonly string[] | undefined;
  currentPath: string;
  logoutState?: GeneratedShellLogoutState | undefined;
  accountSession?: AccountSessionStatusResponse | undefined;
  root?: GeneratedShellRootProjectionInput | undefined;
  routeWorld: RuntimeWorldMount | undefined;
  runtimeProfile: RuntimeProfile;
  screenModels?: readonly HomeScreenModel[] | undefined;
  sync?: GeneratedShellSyncFacts | undefined;
};

export function selectGeneratedShellScope({
  currentPath,
  routeWorld,
  runtimeProfile,
}: {
  currentPath: string;
  routeWorld: RuntimeWorldMount | undefined;
  runtimeProfile: RuntimeProfile;
}): ShellScope | undefined {
  const path = normalizeRuntimeBrowserPath(currentPath);
  const routes = runtimeBrowserRoutePatterns(runtimeProfile);

  if (
    isRuntimeAuthAccountRoutePath(path) ||
    path === COLLABORATOR_INVITATION_ACCEPT_PATH ||
    path === routes.localSessionRoute ||
    runtimeProfile.shell === "publishedSite" ||
    isRuntimePublicSiteRoute(runtimeProfile, path)
  ) {
    return undefined;
  }

  if (runtimeProfile.shell === "dev") {
    return "multiApp";
  }

  if (runtimeProfile.shell === "instance") {
    return FORMLESS_PROGRAM_SCREEN_PATHS.includes(path) || routeWorld ? "multiApp" : undefined;
  }

  return routeWorld ? "appOnly" : undefined;
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

export function selectGeneratedShellAppDestinations({
  currentPath,
  runtimeProfile,
}: {
  currentPath: string;
  runtimeProfile: RuntimeProfile;
}): ShellDestinationContract[] {
  const sourceWorlds = runtimeProfile.worlds.filter((world) => world.generatedRoutes);
  const adminDestinations = sourceWorlds.map((world) => ({
    href: world.route,
    id: `app:${world.app.key}`,
    label: world.app.label,
  }));
  const destinations = dedupeShellLinks([
    ...adminDestinations,
    {
      href: runtimeTopologyRoutes.instanceRootRoute,
      id: GENERATED_APPLICATION_SHELL_INSTANCE_DESTINATION_ID,
      label: "Instance",
    },
  ]);
  const activeHref = selectGeneratedShellActiveHref(
    currentPath,
    destinations.map(({ href }) => href),
  );
  const instanceSelected = isGeneratedShellInstancePath(currentPath);

  return destinations.map(({ href, id, label }) => ({
    accessibilityLabel: label,
    availability: { available: true },
    href,
    id,
    kind: "shellLinkDestination",
    label,
    selected:
      id === GENERATED_APPLICATION_SHELL_INSTANCE_DESTINATION_ID
        ? instanceSelected
        : !instanceSelected && href === activeHref,
  }));
}

export function selectGeneratedShellScreenDestinations({
  activeScreenPath,
  currentPath,
  screenModels,
  world,
}: {
  activeScreenPath: string | undefined;
  currentPath: string;
  screenModels: readonly HomeScreenModel[];
  world: RuntimeWorldMount;
}): ShellDestinationContract[] {
  const screens = screenModels.filter(
    (screen): screen is HomeScreenModel & { path: string } => screen.path !== undefined,
  );
  const activeHref = selectGeneratedShellActiveHref(
    currentPath,
    screens.map((screen) => runtimeScreenRoute(world, screen.path)),
  );

  return screens.map((screen) => {
    const href = runtimeScreenRoute(world, screen.path);

    return {
      accessibilityLabel: screen.label,
      availability: { available: true },
      href,
      id: `screen:${screen.screenName}`,
      kind: "shellLinkDestination",
      label: screen.label,
      selected: screen.path === activeScreenPath || href === activeHref,
    };
  });
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
  worldLabel,
}: GeneratedShellSyncFacts): ShellSyncStatusContract {
  return {
    details: [
      { label: "World", value: worldLabel },
      { label: "Schema", value: schemaVersion === null ? "Loading" : `v${schemaVersion}` },
      { label: "Cursor", value: String(cursor) },
      { label: "Last sync", value: lastSyncedAt ?? "None yet" },
    ],
    id: `${GENERATED_APPLICATION_SHELL_ID}:sync`,
    kind: "shellSyncStatus",
    label:
      status.state === "error" ? "Sync issue" : status.state === "syncing" ? "Syncing" : "Synced",
    message:
      status.state === "error"
        ? "Sync failed. Check the current app and try again."
        : status.message,
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
  activeScreenPath,
  authorizedProgramScreenPaths = [],
  currentPath,
  logoutState = "idle",
  accountSession,
  root,
  routeWorld,
  runtimeProfile,
  screenModels = [],
  sync,
}: ProjectGeneratedApplicationShellOptions): GeneratedApplicationShellProjection | undefined {
  const scope = selectGeneratedShellScope({
    currentPath,
    routeWorld,
    runtimeProfile,
  });

  if (!scope) {
    return undefined;
  }

  const sections: ShellNavigationSectionContract[] = [];
  const instanceSelected = isGeneratedShellInstancePath(currentPath);

  if (scope === "multiApp") {
    sections.push({
      accessibilityLabel: "Applications",
      destinations: selectGeneratedShellAppDestinations({
        currentPath,
        runtimeProfile,
      }),
      id: `${GENERATED_APPLICATION_SHELL_ID}:apps`,
      kind: "shellNavigationSection",
      label: "Apps",
      role: "appSwitcher",
      shellId: GENERATED_APPLICATION_SHELL_ID,
    });

    if (instanceSelected) {
      sections.push(instanceSection(currentPath, authorizedProgramScreenPaths));
    }
  }

  if (routeWorld) {
    sections.push({
      accessibilityLabel: `${routeWorld.app.label} screens`,
      destinations: selectGeneratedShellScreenDestinations({
        activeScreenPath,
        currentPath,
        screenModels,
        world: routeWorld,
      }),
      id: `${GENERATED_APPLICATION_SHELL_ID}:screens:${routeWorld.app.key}`,
      kind: "shellNavigationSection",
      role: "screens",
      shellId: GENERATED_APPLICATION_SHELL_ID,
    });
  }

  if (root) {
    sections.push(...selectGeneratedShellRootSections(root));
  }

  if (sync) {
    const settingsKey = routeWorld?.app.key ?? "formless-program";
    sections.push({
      accessibilityLabel: `${routeWorld?.app.label ?? "Formless Program"} settings`,
      destinations: [],
      id: `${GENERATED_APPLICATION_SHELL_ID}:settings:${settingsKey}`,
      kind: "shellNavigationSection",
      label: "Settings",
      role: "appSettings",
      settings: {
        id: `${GENERATED_APPLICATION_SHELL_ID}:settings:${settingsKey}:controls`,
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
      accessibilityLabel: `${
        routeWorld?.app.label ?? (instanceSelected ? "Instance" : "Formless")
      } application shell`,
      activeDestination: selectGeneratedShellActiveDestination(sections),
      id: GENERATED_APPLICATION_SHELL_ID,
      kind: "shellManifest",
      navigationSections: sections.map((section) =>
        shellNavigationSectionReference(GENERATED_APPLICATION_SHELL_ID, section.id),
      ),
      scope,
      title: routeWorld?.app.label ?? (instanceSelected ? "Instance" : "Formless"),
    },
    sections,
  };
}

function isGeneratedShellInstancePath(currentPath: string): boolean {
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

function instanceSection(
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
      id: `instance:${screen.key}`,
      label: screen.label,
    }));
  const activeHref = selectGeneratedShellActiveHref(
    path,
    destinations.map(({ href }) => href),
  );

  return {
    accessibilityLabel: "Instance navigation",
    destinations: destinations.map(({ href, id, label }) => ({
      accessibilityLabel: label,
      availability: { available: true },
      href,
      id,
      kind: "shellLinkDestination",
      label,
      selected: href === activeHref,
    })),
    id: `${GENERATED_APPLICATION_SHELL_ID}:instance`,
    kind: "shellNavigationSection",
    role: "instance",
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

function dedupeShellLinks<T extends { href: string; id: string }>(links: readonly T[]): T[] {
  const seen = new Set<string>();

  return links.filter((link) => {
    const key = `${link.id}:${link.href}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
