import { describe, expect, it } from "vite-plus/test";
import { createMemoryPresentationHost } from "@dpeek/formless-presentation/host";
import type { AppInstall } from "@dpeek/formless-installed-apps";
import { selectGeneratedRootNavigationFacts } from "../../client/generated-authoring.ts";
import { selectPrimaryScreenModels } from "../../client/views.ts";
import { testSiteRecords } from "../../test/site-records.ts";
import { siteSourceSchema } from "../../test/schema-apps.ts";
import {
  createAppRuntimeProfile,
  createDevRuntimeProfile,
  createInstanceRuntimeProfile,
  createPublishedSiteRuntimeProfile,
  createSiteAuthoringRuntimeProfile,
  findRuntimeWorldMountByRoute,
} from "../runtime-profile.ts";
import { projectInitialGeneratedCreateRuntimeSurface } from "./generated-create-runtime.ts";
import {
  projectGeneratedApplicationShell,
  selectGeneratedShellActiveHref,
  selectGeneratedShellScope,
  type GeneratedApplicationShellProjection,
} from "./application-shell-projection.ts";
import {
  projectGeneratedApplicationShellContractHostPublication,
  resolveGeneratedApplicationShellIntent,
} from "./generated-application-shell-contract-host.ts";
import { FORMLESS_PROGRAM_SCREEN_PATHS } from "../../program/runtime.ts";

describe("generated application shell projection", () => {
  it("selects multi-app, app-only, and no-shell presentation from profile and route state", () => {
    const dev = createDevRuntimeProfile();
    const devWorld = required(findRuntimeWorldMountByRoute(dev, "/site"));
    const instance = createInstanceRuntimeProfile();
    const app = createAppRuntimeProfile("crm");
    const appWorld = required(findRuntimeWorldMountByRoute(app, "/audiences"));
    const siteAuthoring = createSiteAuthoringRuntimeProfile();
    const siteAdminWorld = required(findRuntimeWorldMountByRoute(siteAuthoring, "/admin"));

    expect(shellScope(dev, "/site", devWorld)).toBe("multiApp");
    expect(shellScope(dev, "/unknown", undefined)).toBe("multiApp");
    expect(shellScope(instance, "/", undefined)).toBe("multiApp");
    expect(shellScope(instance, "/access", undefined)).toBe("multiApp");
    expect(shellScope(instance, "/apps/personal", devWorld)).toBe("multiApp");
    expect(shellScope(app, "/audiences", appWorld)).toBe("appOnly");
    expect(shellScope(siteAuthoring, "/admin", siteAdminWorld)).toBe("appOnly");

    expect(shellScope(instance, "/unknown", undefined)).toBeUndefined();
    expect(shellScope(dev, "/formless/auth/sign-in", undefined)).toBeUndefined();
    expect(shellScope(dev, "/formless/auth/invitations/accept", undefined)).toBeUndefined();
    expect(shellScope(dev, "/local-session", undefined)).toBeUndefined();
    expect(shellScope(dev, "/sites/personal", undefined)).toBeUndefined();
    expect(shellScope(siteAuthoring, "/", undefined)).toBeUndefined();
    expect(
      shellScope(createPublishedSiteRuntimeProfile(), "/blog/launch", undefined),
    ).toBeUndefined();
  });

  it("selects the longest segment-matched href without treating root as a wildcard", () => {
    expect(
      selectGeneratedShellActiveHref("/apps/personal/settings?tab=sync", [
        "/",
        "/apps/personal",
        "/apps/personal/settings",
      ]),
    ).toBe("/apps/personal/settings");
    expect(selectGeneratedShellActiveHref("/unknown", ["/", "/apps"])).toBeNull();
    expect(selectGeneratedShellActiveHref("/tasks-extra", ["/tasks"])).toBeNull();
  });

  it("projects destinations, roots, controlled create, settings, and display-safe session state", () => {
    const projection = completeProjection();
    const roles = projection.sections.map((section) => section.role);
    const appSection = required(
      projection.sections.find((section) => section.role === "appSwitcher"),
    );
    const screenSection = required(
      projection.sections.find((section) => section.role === "screens"),
    );
    const rootSections = projection.sections.filter((section) => section.role === "rootRecords");
    const settingsSection = required(
      projection.sections.find((section) => section.role === "appSettings"),
    );
    const sessionSection = required(
      projection.sections.find((section) => section.role === "session"),
    );

    expect(projection.manifest).toMatchObject({
      activeDestination: { destinationId: expect.stringMatching(/^root:/) },
      id: "application-shell",
      kind: "shellManifest",
      scope: "multiApp",
      title: "Site",
    });
    expect(roles).toEqual([
      "appSwitcher",
      "screens",
      "rootRecords",
      "rootRecords",
      "rootRecords",
      "rootRecords",
      "appSettings",
      "session",
    ]);
    expect(appSection.destinations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ href: "/", label: "Instance", selected: false }),
        expect.objectContaining({ href: "/site", label: "Site", selected: true }),
      ]),
    );
    expect(appSection.destinations).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ href: "/sites/personal" }),
        expect.objectContaining({ href: "/sites/disabled" }),
      ]),
    );
    expect(screenSection.destinations.length).toBeGreaterThan(0);
    expect(rootSections).toHaveLength(4);
    expect(rootSections.some((section) => section.createSurface !== undefined)).toBe(true);
    expect(
      rootSections.find((section) => section.createSurface)?.createSurface?.trigger,
    ).toMatchObject({
      content: { icon: "add", kind: "iconOnly" },
      density: "compact",
      prominence: "quiet",
    });
    expect(rootSections.flatMap((section) => section.destinations).length).toBeGreaterThan(0);
    expect(
      rootSections
        .flatMap((section) => section.destinations)
        .every((destination) =>
          destination.kind === "shellRootRecordDestination"
            ? destination.selectionIntent.shellId === projection.manifest.id
            : false,
        ),
    ).toBe(true);
    expect(
      rootSections
        .flatMap((section) => section.destinations)
        .some((destination) => destination.countText !== undefined),
    ).toBe(true);
    expect(settingsSection.settings).toMatchObject({
      sync: {
        label: "Sync issue",
        message: "Sync failed. Check the current app and try again.",
        state: "error",
      },
    });
    expect(sessionSection.session).toMatchObject({
      identity: { displayName: "Ada Lovelace", secondaryLabel: "ada@example.com" },
      state: "authenticated",
    });
    expect(JSON.stringify(projection)).not.toContain("alchemy-secret-value");
    expect(JSON.stringify(projection)).not.toContain("session-token");
  });

  it("presents Instance in the top-level switcher with route-local management navigation", () => {
    const runtimeProfile = createDevRuntimeProfile();
    const settingsProjection = required(
      projectGeneratedApplicationShell({
        authorizedProgramScreenPaths: FORMLESS_PROGRAM_SCREEN_PATHS,
        currentPath: "/",
        routeWorld: undefined,
        runtimeProfile,
      }),
    );
    const accessProjection = required(
      projectGeneratedApplicationShell({
        authorizedProgramScreenPaths: FORMLESS_PROGRAM_SCREEN_PATHS,
        currentPath: "/access",
        routeWorld: undefined,
        runtimeProfile,
      }),
    );

    expect(settingsProjection.manifest).toMatchObject({
      activeDestination: {
        destinationId: "instance:principals",
        sectionId: "application-shell:instance",
      },
      title: "Instance",
    });
    expect(settingsProjection.sections.map((section) => section.role)).toEqual([
      "appSwitcher",
      "instance",
      "session",
    ]);
    expect(
      required(settingsProjection.sections.find((section) => section.role === "appSwitcher"))
        .destinations,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          href: "/",
          id: "instance:home",
          label: "Instance",
          selected: true,
        }),
      ]),
    );
    expect(
      required(accessProjection.sections.find((section) => section.role === "instance"))
        .destinations,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ href: "/access", label: "Access", selected: true }),
      ]),
    );
    const settingsSection = required(
      settingsProjection.sections.find((section) => section.role === "instance"),
    );
    expect(settingsSection.label).toBeUndefined();
    expect(
      settingsSection.destinations.map((destination) => {
        if (destination.kind !== "shellLinkDestination") {
          throw new Error("Expected instance navigation to contain only links.");
        }
        return {
          href: destination.href,
          label: destination.label,
          selected: destination.selected,
        };
      }),
    ).toEqual([
      { href: "/apps", label: "Apps", selected: false },
      { href: "/routes", label: "Routes", selected: false },
      { href: "/deployments", label: "Deployments", selected: false },
      { href: "/", label: "Principals", selected: true },
      { href: "/organizations", label: "Organizations", selected: false },
      { href: "/access", label: "Access", selected: false },
      { href: "/invitations", label: "Invitations", selected: false },
      { href: "/policies", label: "Policies", selected: false },
      { href: "/settings", label: "Settings", selected: false },
    ]);
  });

  it("projects only server-authorized Program destinations in artifact order", () => {
    const runtimeProfile = createDevRuntimeProfile();
    const filtered = required(
      projectGeneratedApplicationShell({
        authorizedProgramScreenPaths: ["/settings", "/apps", "/deployments"],
        currentPath: "/deployments",
        routeWorld: undefined,
        runtimeProfile,
      }),
    );
    const hidden = required(
      projectGeneratedApplicationShell({
        currentPath: "/deployments",
        routeWorld: undefined,
        runtimeProfile,
      }),
    );

    expect(
      required(filtered.sections.find((section) => section.role === "instance")).destinations.map(
        (destination) => ({
          href: destination.kind === "shellLinkDestination" ? destination.href : undefined,
          label: destination.label,
          selected: destination.selected,
        }),
      ),
    ).toEqual([
      { href: "/apps", label: "Apps", selected: false },
      { href: "/deployments", label: "Deployments", selected: true },
      { href: "/settings", label: "Settings", selected: false },
    ]);
    expect(
      required(hidden.sections.find((section) => section.role === "instance")).destinations,
    ).toEqual([]);
  });

  it("projects anonymous session state without synthesizing a sign-in destination", () => {
    const dev = createDevRuntimeProfile();
    const projection = required(
      projectGeneratedApplicationShell({
        currentPath: "/unknown",
        accountSession: { authenticated: false, setupComplete: true },
        routeWorld: undefined,
        runtimeProfile: dev,
      }),
    );
    const session = required(
      projection.sections.find((section) => section.role === "session")?.session,
    );

    expect(session).toEqual({
      id: "application-shell:session",
      kind: "shellSession",
      state: "anonymous",
    });
    expect(projection.sections.flatMap((section) => section.destinations)).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: expect.stringMatching(/sign in/i) }),
      ]),
    );
  });
});

describe("generated application shell host and intents", () => {
  it("publishes one complete node graph and resolves only current scoped intents", () => {
    const projection = completeProjection();
    const publication = projectGeneratedApplicationShellContractHostPublication(projection);
    const host = createMemoryPresentationHost({ nodes: publication.nodes });
    const manifest = required(host.read(publication.shellReference));
    const rootSection = required(
      projection.sections.find(
        (section) => section.role === "rootRecords" && section.destinations.length > 0,
      ),
    );
    const rootDestination = required(rootSection.destinations[0]);
    const createSection = required(
      projection.sections.find((section) => section.createSurface !== undefined),
    );
    const createField = required(createSection.createSurface?.dialog.form.fieldSet.fields[0]);
    const sessionSection = required(
      projection.sections.find((section) => section.session?.state === "authenticated"),
    );

    expect(publication.nodes).toHaveLength(projection.sections.length + 1);
    expect(manifest.navigationSections).toHaveLength(projection.sections.length);
    expect(manifest.navigationSections.map((reference) => host.read(reference)?.id)).toEqual(
      projection.sections.map((section) => section.id),
    );

    if (rootDestination.kind !== "shellRootRecordDestination") {
      throw new Error("Expected root record destination.");
    }

    expect(
      resolveGeneratedApplicationShellIntent(projection, rootDestination.selectionIntent),
    ).toMatchObject({ kind: "rootSelection" });
    expect(
      resolveGeneratedApplicationShellIntent(projection, {
        fieldId: createField.fieldId,
        intent: {
          fieldName: "label",
          fieldValue: { kind: "input", value: "New page" },
          type: "createDraftChange",
        },
        sectionId: createSection.id,
        shellId: projection.manifest.id,
        surfaceId: required(createSection.createSurface).id,
        type: "shellCreate",
      }),
    ).toMatchObject({ kind: "create" });
    expect(
      resolveGeneratedApplicationShellIntent(projection, {
        fieldId: `${createField.fieldId}:stale`,
        intent: {
          fieldName: createField.fieldName,
          fieldValue: { kind: "input", value: "Stale page" },
          type: "createDraftChange",
        },
        sectionId: createSection.id,
        shellId: projection.manifest.id,
        surfaceId: required(createSection.createSurface).id,
        type: "shellCreate",
      }),
    ).toEqual({ kind: "ignored" });
    expect(
      resolveGeneratedApplicationShellIntent(projection, {
        fieldId: createField.fieldId,
        intent: {
          fieldName: `${createField.fieldName}-other`,
          fieldValue: { kind: "input", value: "Wrong field" },
          type: "createDraftChange",
        },
        sectionId: createSection.id,
        shellId: projection.manifest.id,
        surfaceId: required(createSection.createSurface).id,
        type: "shellCreate",
      }),
    ).toEqual({ kind: "ignored" });
    const authenticatedSession = sessionSection.session;
    if (authenticatedSession?.state !== "authenticated") {
      throw new Error("Expected authenticated shell session.");
    }

    expect(
      resolveGeneratedApplicationShellIntent(projection, {
        controlId: authenticatedSession.logout.id,
        sectionId: sessionSection.id,
        shellId: projection.manifest.id,
        type: "shellLogout",
      }),
    ).toMatchObject({ kind: "logout" });
    expect(
      resolveGeneratedApplicationShellIntent(projection, {
        ...rootDestination.selectionIntent,
        destinationId: "root:stale",
      }),
    ).toEqual({ kind: "ignored" });
    expect(
      resolveGeneratedApplicationShellIntent(undefined, rootDestination.selectionIntent),
    ).toEqual({ kind: "ignored" });
  });
});

function completeProjection(): GeneratedApplicationShellProjection {
  const runtimeProfile = createDevRuntimeProfile();
  const routeWorld = required(findRuntimeWorldMountByRoute(runtimeProfile, "/site"));
  const screenModels = selectPrimaryScreenModels(siteSourceSchema);
  const activeScreen = required(
    screenModels.find((screen) => selectGeneratedRootNavigationFacts(screen) !== undefined),
  );
  const activeScreenPath = required(activeScreen.path);
  const rootFacts = required(selectGeneratedRootNavigationFacts(activeScreen));
  const snapshot = siteSnapshot();
  const createSurfacesByQueryName = Object.fromEntries(
    rootFacts.groups.flatMap((group) =>
      group.createOperation
        ? [
            [
              group.queryName,
              projectInitialGeneratedCreateRuntimeSurface({
                operation: group.createOperation,
                snapshot,
                surfaceId: `root-navigation:${group.createOperation.operation.canonicalKey}`,
                trigger: {
                  content: { icon: "add", kind: "iconOnly" },
                  density: "compact",
                  prominence: "quiet",
                },
              }),
            ],
          ]
        : [],
    ),
  );

  return required(
    projectGeneratedApplicationShell({
      activeScreenPath,
      currentPath: `/site${activeScreenPath === "/" ? "" : activeScreenPath}`,
      installs: [installedSiteFixture()],
      logoutState: "idle",
      accountSession: {
        authenticated: true,
        principal: {
          displayName: "Ada Lovelace",
          email: "ada@example.com",
          principalId: "principal:ada",
        },
        session: { expiresAt: "session-token-must-not-project" },
        setupComplete: true,
      },
      root: {
        createSurfacesByQueryName,
        facts: rootFacts,
        selectedRecordId: null,
        snapshot,
        today: "2026-07-16",
      },
      routeWorld,
      runtimeProfile,
      screenModels,
      sync: {
        cursor: 27,
        lastSyncedAt: "2026-07-16T01:00:00.000Z",
        schemaVersion: siteSourceSchema.version,
        status: { state: "error", message: "alchemy-secret-value" },
        worldLabel: "site",
      },
    }),
  );
}

function shellScope(
  runtimeProfile: ReturnType<typeof createDevRuntimeProfile>,
  currentPath: string,
  routeWorld: ReturnType<typeof findRuntimeWorldMountByRoute>,
) {
  return selectGeneratedShellScope({ currentPath, routeWorld, runtimeProfile });
}

function siteSnapshot() {
  const entityNames = new Set(testSiteRecords.map((record) => record.entity));

  return {
    recordIdsByEntity: Object.fromEntries(
      [...entityNames].map((entityName) => [
        entityName,
        testSiteRecords.filter((record) => record.entity === entityName).map((record) => record.id),
      ]),
    ),
    recordsById: Object.fromEntries(testSiteRecords.map((record) => [record.id, record])),
  };
}

function installedSiteFixture(): AppInstall {
  return {
    adminRoute: "/apps/personal",
    createdAt: "2026-07-16T00:00:00.000Z",
    installId: "personal",
    label: "Personal Site",
    packageAppKey: "site",
    packageRevision: 1,
    publicRoute: "/sites/personal",
    registrationPolicy: "closed",
    routes: [
      {
        access: "anonymous",
        enabled: true,
        id: "public",
        path: "/sites/personal",
        routeKind: "publicSite",
      },
      {
        access: "anonymous",
        enabled: false,
        id: "disabled",
        path: "/sites/disabled",
        routeKind: "publicSite",
      },
    ],
    sourceSchemaHash: `sha256:${"a".repeat(64)}`,
    status: "installed",
    updatedAt: "2026-07-16T00:00:00.000Z",
  };
}

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new Error("Expected value.");
  }

  return value;
}
