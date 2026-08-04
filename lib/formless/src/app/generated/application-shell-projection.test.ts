import { describe, expect, it } from "vite-plus/test";
import type { AppSchema } from "@dpeek/formless-schema";
import { createMemoryPresentationHost } from "@dpeek/formless-presentation/host";
import { selectGeneratedRootNavigationFacts } from "../../client/generated-authoring.ts";
import type { SyncStatus } from "../../client/sync-status.ts";
import { selectPrimaryScreenModels } from "../../client/views.ts";
import { FORMLESS_PROGRAM_SCREEN_PATHS, formlessProgramSchema } from "../../program/runtime.ts";
import { testSiteRecords } from "../../test/site-records.ts";
import { siteSourceSchema } from "../../test/schema-apps.ts";
import {
  createDevRuntimeProfile,
  createInstanceRuntimeProfile,
  createPublishedSiteRuntimeProfile,
} from "../runtime-profile.ts";
import { projectInitialGeneratedCreateRuntimeSurface } from "./generated-create-runtime.ts";
import {
  projectGeneratedApplicationShell,
  selectGeneratedShellActiveHref,
  shouldRenderGeneratedShell,
  type GeneratedApplicationShellProjection,
} from "./application-shell-projection.ts";
import {
  projectGeneratedApplicationShellContractHostPublication,
  resolveGeneratedApplicationShellIntent,
} from "./generated-application-shell-contract-host.ts";

describe("generated application shell projection", () => {
  it("selects the Program shell from profile and current route", () => {
    const dev = createDevRuntimeProfile();
    const instance = createInstanceRuntimeProfile();

    expect(
      shouldRenderGeneratedShell({ currentPath: "/settings/routes", runtimeProfile: dev }),
    ).toBe(true);
    expect(shouldRenderGeneratedShell({ currentPath: "/unknown", runtimeProfile: dev })).toBe(true);
    expect(
      shouldRenderGeneratedShell({ currentPath: "/principals", runtimeProfile: instance }),
    ).toBe(false);
    expect(
      shouldRenderGeneratedShell({ currentPath: "/settings/access", runtimeProfile: instance }),
    ).toBe(true);
    expect(shouldRenderGeneratedShell({ currentPath: "/routes", runtimeProfile: instance })).toBe(
      false,
    );
    expect(shouldRenderGeneratedShell({ currentPath: "/access", runtimeProfile: instance })).toBe(
      false,
    );
    expect(shouldRenderGeneratedShell({ currentPath: "/unknown", runtimeProfile: instance })).toBe(
      false,
    );
    expect(
      shouldRenderGeneratedShell({
        currentPath: "/formless/auth/sign-in",
        runtimeProfile: dev,
      }),
    ).toBe(false);
    expect(shouldRenderGeneratedShell({ currentPath: "/local-session", runtimeProfile: dev })).toBe(
      false,
    );
    expect(
      shouldRenderGeneratedShell({
        currentPath: "/blog/launch",
        runtimeProfile: createPublishedSiteRuntimeProfile(),
      }),
    ).toBe(false);
  });

  it("selects the longest segment-matched Program href", () => {
    expect(
      selectGeneratedShellActiveHref("/site/settings?tab=sync", ["/", "/site", "/site/settings"]),
    ).toBe("/site/settings");
    expect(selectGeneratedShellActiveHref("/unknown", ["/", "/tasks"])).toBeNull();
    expect(selectGeneratedShellActiveHref("/tasks-extra", ["/tasks"])).toBeNull();
  });

  it("selects and projects relocated product screens from the materialized Program", () => {
    const programSchema = relocatedProductScreenSchema();
    const runtimeProfile = createInstanceRuntimeProfile();

    expect(
      shouldRenderGeneratedShell({
        currentPath: "/people/access",
        programSchema,
        runtimeProfile,
      }),
    ).toBe(true);
    expect(
      shouldRenderGeneratedShell({ currentPath: "/access", programSchema, runtimeProfile }),
    ).toBe(false);

    const projection = required(
      projectGeneratedApplicationShell({
        authorizedProgramScreenPaths: ["/infrastructure/routes", "/people/access"],
        currentPath: "/people/access",
        programSchema,
        runtimeProfile,
      }),
    );
    const destinations = required(
      projection.sections.find((section) => section.role === "program"),
    ).destinations;

    expect(destinations).toEqual([
      expect.objectContaining({
        href: "/infrastructure/routes",
        id: "program:routes",
        selected: false,
      }),
      expect.objectContaining({ href: "/people/access", id: "program:access", selected: true }),
    ]);
    expect(
      selectPrimaryScreenModels(programSchema).some((screen) => screen.screenName === "access"),
    ).toBe(false);
  });

  it("projects Program destinations, roots, create, status, and display-safe session state", () => {
    const projection = completeProjection();
    const roles = projection.sections.map((section) => section.role);
    const programSection = required(
      projection.sections.find((section) => section.role === "program"),
    );
    const rootSections = projection.sections.filter((section) => section.role === "rootRecords");
    const statusSection = required(
      projection.sections.find((section) => section.role === "status"),
    );
    const sessionSection = required(
      projection.sections.find((section) => section.role === "session"),
    );

    expect(projection.manifest).toMatchObject({
      activeDestination: { destinationId: expect.stringMatching(/^root:/) },
      accessibilityLabel: "Formless Program application shell",
      id: "application-shell",
      kind: "shellManifest",
      title: "Site",
    });
    expect(roles).toEqual([
      "workspaceSwitcher",
      "program",
      "rootRecords",
      "rootRecords",
      "rootRecords",
      "rootRecords",
      "status",
      "session",
    ]);
    expect(programSection.destinations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ href: "/site", label: "Blocks", selected: true }),
      ]),
    );
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
    expect(statusSection).toMatchObject({
      accessibilityLabel: "Formless Program status",
      destinations: [],
    });
    expect(statusSection.label).toBeUndefined();
    expect(statusSection.status).toMatchObject({
      sync: {
        label: "Sync issue",
        message: "Sync failed. Check the Program and try again.",
        state: "error",
      },
      workspaceSave: {
        id: "application-shell:workspace-save:formless-program",
        label: "Saved",
        message: "Workspace source is saved.",
        state: "saved",
      },
    });
    expect(statusSection.status?.sync?.details).toEqual([
      { label: "Schema", presentation: "text", value: `v${siteSourceSchema.version}` },
      { label: "Cursor", presentation: "text", value: "27" },
      {
        label: "Last sync",
        presentation: "timestamp",
        value: "2026-07-16T01:00:00.000Z",
      },
    ]);
    expect(sessionSection.session).toMatchObject({
      identity: { displayName: "Ada Lovelace", secondaryLabel: "ada@example.com" },
      state: "authenticated",
    });
    expect(JSON.stringify(projection)).not.toContain("alchemy-secret-value");
    expect(JSON.stringify(projection)).not.toContain("session-token");
  });

  it("keeps synced, syncing, and error status separate from Program Settings navigation", () => {
    const cases = [
      {
        expectedLabel: "Synced",
        expectedMessage: "Synced.",
        status: { code: "program-synced", state: "idle" as const },
      },
      {
        expectedLabel: "Syncing",
        expectedMessage: "Syncing Formless Program...",
        status: { code: "program-syncing", state: "syncing" as const },
      },
      {
        expectedLabel: "Sync issue",
        expectedMessage: "Sync failed. Check the Program and try again.",
        status: { code: "program-sync-failed", state: "error" as const },
      },
    ] satisfies readonly {
      expectedLabel: string;
      expectedMessage: string;
      status: SyncStatus;
    }[];

    for (const { expectedLabel, expectedMessage, status } of cases) {
      const projection = required(
        projectGeneratedApplicationShell({
          authorizedProgramScreenPaths: ["/settings/routes"],
          currentPath: "/settings/routes",
          runtimeProfile: createDevRuntimeProfile(),
          sync: {
            cursor: 27,
            lastSyncedAt: "2026-07-16T01:00:00.000Z",
            schemaVersion: 8,
            status,
          },
        }),
      );
      const program = required(projection.sections.find((section) => section.role === "program"));
      const shellStatus = required(
        projection.sections.find((section) => section.role === "status"),
      );

      expect(program.destinations).toEqual([
        expect.objectContaining({ href: "/settings/routes", label: "Routes", selected: true }),
      ]);
      expect(shellStatus).toMatchObject({ destinations: [], role: "status" });
      expect(shellStatus.status?.sync).toMatchObject({ label: expectedLabel, state: status.state });
      expect(shellStatus.status?.sync?.message).toBe(expectedMessage);
    }
  });

  it("presents the default Program workspaces and active Instance screens", () => {
    const runtimeProfile = createDevRuntimeProfile();
    const routesProjection = required(
      projectGeneratedApplicationShell({
        authorizedProgramScreenPaths: FORMLESS_PROGRAM_SCREEN_PATHS,
        currentPath: "/settings/routes",
        runtimeProfile,
      }),
    );
    const accessProjection = required(
      projectGeneratedApplicationShell({
        authorizedProgramScreenPaths: FORMLESS_PROGRAM_SCREEN_PATHS,
        currentPath: "/settings/access",
        runtimeProfile,
      }),
    );

    expect(routesProjection.manifest).toMatchObject({
      activeDestination: {
        destinationId: "program:routes",
        sectionId: "application-shell:program",
      },
      title: "Instance",
      workspaceSwitcher: {
        sectionId: "application-shell:workspaces",
        shellId: "application-shell",
      },
    });
    expect(routesProjection.sections.map((section) => section.role)).toEqual([
      "workspaceSwitcher",
      "program",
      "session",
    ]);
    expect(
      required(routesProjection.sections.find((section) => section.role === "workspaceSwitcher"))
        .destinations,
    ).toEqual([
      expect.objectContaining({ href: "/tasks", label: "Tasks", selected: false }),
      expect.objectContaining({ href: "/site", label: "Site", selected: false }),
      expect.objectContaining({
        href: "/settings/routes",
        label: "Instance",
        selected: true,
      }),
    ]);
    expect(
      required(accessProjection.sections.find((section) => section.role === "program"))
        .destinations,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ href: "/settings/access", label: "Access", selected: true }),
      ]),
    );
    const programSection = required(
      routesProjection.sections.find((section) => section.role === "program"),
    );
    expect(
      programSection.destinations.map((destination) => {
        if (destination.kind !== "shellLinkDestination") {
          throw new Error("Expected Program navigation to contain only links.");
        }
        return {
          href: destination.href,
          label: destination.label,
          selected: destination.selected,
        };
      }),
    ).toEqual([
      { href: "/settings/routes", label: "Routes", selected: true },
      { href: "/settings/access", label: "Access", selected: false },
    ]);
  });

  it("projects only server-authorized Program destinations in artifact order", () => {
    const runtimeProfile = createDevRuntimeProfile();
    const filtered = required(
      projectGeneratedApplicationShell({
        authorizedProgramScreenPaths: ["/settings/access"],
        currentPath: "/settings/access",
        runtimeProfile,
      }),
    );
    const programSection = required(
      filtered.sections.find((section) => section.role === "program"),
    );

    expect(
      programSection.destinations.map((destination) => ({
        href: destination.kind === "shellLinkDestination" ? destination.href : undefined,
        label: destination.label,
        selected: destination.selected,
      })),
    ).toEqual([{ href: "/settings/access", label: "Access", selected: true }]);
  });

  it("projects ordered authorized workspaces from the resolved stable screen key", () => {
    const programSchema = groupedProgramScreenSchema();
    const runtimeProfile = createDevRuntimeProfile();
    const authorizedProgramScreenPaths = [
      "/tasks",
      "/site",
      "/settings/routes",
      "/tasks/settings",
      "/site/settings",
    ];
    const grouped = required(
      projectGeneratedApplicationShell({
        authorizedProgramScreenPaths,
        currentPath: "/tasks/settings",
        programSchema,
        runtimeProfile,
      }),
    );
    const workspaceSwitcher = required(
      grouped.sections.find((section) => section.role === "workspaceSwitcher"),
    );
    const programSection = required(grouped.sections.find((section) => section.role === "program"));

    expect(grouped.manifest).toMatchObject({
      activeDestination: {
        destinationId: "program:access",
        sectionId: "application-shell:program",
      },
      title: "Instance",
      workspaceSwitcher: {
        sectionId: "application-shell:workspaces",
        shellId: "application-shell",
      },
    });
    expect(workspaceSwitcher.destinations).toEqual([
      expect.objectContaining({ href: "/tasks", label: "Work", selected: false }),
      expect.objectContaining({
        href: "/settings/routes",
        label: "Instance",
        selected: true,
      }),
    ]);
    expect(programSection.destinations).toEqual([
      expect.objectContaining({ href: "/settings/routes", label: "Routes", selected: false }),
      expect.objectContaining({ href: "/tasks/settings", label: "Access", selected: true }),
    ]);

    const ungrouped = required(
      projectGeneratedApplicationShell({
        authorizedProgramScreenPaths,
        currentPath: "/site/settings",
        programSchema,
        runtimeProfile,
      }),
    );
    const ungroupedSwitcher = required(
      ungrouped.sections.find((section) => section.role === "workspaceSwitcher"),
    );

    expect(ungrouped.manifest).toMatchObject({
      activeDestination: {
        destinationId: "program:siteSettings",
        sectionId: "application-shell:program",
      },
      title: "Formless Program",
    });
    expect(ungroupedSwitcher.destinations.every((destination) => !destination.selected)).toBe(true);
    expect(
      required(ungrouped.sections.find((section) => section.role === "program")).destinations,
    ).toEqual([
      expect.objectContaining({ href: "/site/settings", label: "Settings", selected: true }),
    ]);
  });

  it("projects anonymous session state", () => {
    const projection = required(
      projectGeneratedApplicationShell({
        currentPath: "/unknown",
        accountSession: { authenticated: false, setupComplete: true },
        runtimeProfile: createDevRuntimeProfile(),
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
  });
});

describe("generated application shell host and intents", () => {
  it("publishes one complete node graph and resolves current intents", () => {
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
  const screenModels = selectPrimaryScreenModels(siteSourceSchema);
  const activeScreen = required(
    screenModels.find((screen) => selectGeneratedRootNavigationFacts(screen) !== undefined),
  );
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
      authorizedProgramScreenPaths: FORMLESS_PROGRAM_SCREEN_PATHS,
      currentPath: "/site",
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
      runtimeProfile: createInstanceRuntimeProfile(),
      sync: {
        cursor: 27,
        lastSyncedAt: "2026-07-16T01:00:00.000Z",
        schemaVersion: siteSourceSchema.version,
        status: { code: "program-sync-failed", state: "error" },
      },
      workspaceSave: {
        id: "application-shell:workspace-save:formless-program",
        kind: "shellWorkspaceSaveStatus",
        label: "Saved",
        message: "Workspace source is saved.",
        state: "saved",
      },
    }),
  );
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

function relocatedProductScreenSchema(): AppSchema {
  return {
    ...formlessProgramSchema,
    screens: formlessProgramSchema.screens.map((screen) =>
      screen.key === "routes"
        ? { ...screen, path: "/infrastructure/routes" }
        : screen.key === "access"
          ? {
              key: screen.key,
              type: "runtime",
              label: screen.label,
              path: "/people/access",
              access: screen.access,
            }
          : screen,
    ),
  };
}

function groupedProgramScreenSchema(): AppSchema {
  return {
    ...formlessProgramSchema,
    navigation: {
      groups: [
        { key: "work", label: "Work", screens: ["taskHome", "siteEditor"] },
        {
          key: "instance",
          label: "Instance",
          screens: ["routes", "access"],
        },
        { key: "custom", label: "Custom", screens: ["siteContacts"] },
      ],
    },
    screens: formlessProgramSchema.screens.map((screen) =>
      screen.key === "access" ? { ...screen, path: "/tasks/settings" } : screen,
    ),
  };
}

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new Error("Expected value.");
  }

  return value;
}
