// @vitest-environment jsdom

import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { ReactNode } from "react";
import type {
  DocumentThemeContract,
  ShellNavigationSectionReference,
} from "@dpeek/formless-presentation/contract";
import type { PresentationHost } from "@dpeek/formless-presentation/host";
import { documentThemeReference, shellManifestReference } from "@dpeek/formless-presentation/host";
import { usePresentationHost } from "@dpeek/formless-presentation/host/react";
import type { StoredRecord } from "@dpeek/formless-storage";
import { applyBootstrapResponse, resetClientStore } from "../client/store.ts";
import { resetSyncStatus } from "../client/sync-status.ts";
import type { HomeScreenModel } from "../client/views.ts";
import { bootstrapResponse } from "../test/protocol-builders.ts";
import { taskSourceSchema } from "../test/schema-apps.ts";
import { programStorageIdentity } from "../shared/app-storage-identity.ts";
import { getSchemaAppDefinition } from "../shared/schema-apps.ts";
import { ApplicationShellRuntimeBoundary } from "./application-shell-runtime.tsx";
import { FORMLESS_PROGRAM_SCREEN_PATHS } from "../program/runtime.ts";
import {
  selectHomeRouteSectionContextRecordId,
  useHomeRouteSelectionStore,
} from "./routes/home-selection.tsx";
import { createInstanceRuntimeProfile } from "./runtime-profile.ts";

vi.mock("./application-presentation.tsx", () => ({
  ApplicationPresentation: ({
    presentation,
  }: {
    presentation: {
      children?: ReactNode;
      kind: string;
    };
  }) => (presentation.kind === "shell" ? presentation.children : null),
}));
beforeEach(() => {
  resetClientStore();
  resetSyncStatus();
});

describe("application shell runtime boundary", () => {
  it("publishes the selected root theme into the existing stable shell host", async () => {
    applyBootstrapResponse(bootstrapResponse(taskSourceSchema, []), programStorageIdentity());
    const runtimeProfile = createInstanceRuntimeProfile();
    const routeWorld = programSiteWorld();
    const reference = documentThemeReference("theme:application");
    const snapshot: DocumentThemeContract = {
      activeMode: "dark",
      id: reference.themeId,
      kind: "documentTheme",
      policy: { kind: "fixed", mode: "dark" },
    };
    let host: PresentationHost | undefined;

    function HostProbe() {
      host = usePresentationHost();
      return null;
    }

    const renderer = render(
      <ApplicationShellRuntimeBoundary
        applicationTheme={{
          publication: { nodes: [{ reference, snapshot }] },
          reference,
        }}
        currentPath="/site"
        accountSession={{ authenticated: false, setupComplete: true }}
        routeWorld={routeWorld}
        runtimeProfile={runtimeProfile}
        screenModels={[]}
      >
        <HostProbe />
      </ApplicationShellRuntimeBoundary>,
    );

    const initialHost = required(host);
    expect(initialHost.read(reference)).toBe(snapshot);

    renderer.unmount();
  });

  it("keeps one host while resolving root selection and controlled create against current state", async () => {
    applyBootstrapResponse(
      bootstrapResponse(taskSourceSchema, [projectRecord("project-1"), projectRecord("project-2")]),
      programStorageIdentity(),
    );
    const runtimeProfile = createInstanceRuntimeProfile();
    const routeWorld = programSiteWorld();
    const screen = rootScreenFixture();
    let host: PresentationHost | undefined;
    let selectedRecordId: string | null = null;
    let createShouldFail = false;
    const submittedValues: unknown[] = [];
    const dependencies = {
      submitCreate: async (_surfaceId: string, values: unknown) => {
        submittedValues.push(values);
        if (createShouldFail) {
          throw new Error("alchemy-secret-create-error");
        }
        return { recordId: "project-created" };
      },
    };

    function HostProbe({ children }: { children: ReactNode }) {
      host = usePresentationHost();
      return children;
    }

    function SelectionProbe() {
      const store = useHomeRouteSelectionStore();
      selectedRecordId = store
        ? selectHomeRouteSectionContextRecordId(
            store.selectionState,
            "projects-screen",
            "projects-section",
          )
        : null;
      return null;
    }

    const renderer = render(
      <ApplicationShellRuntimeBoundary
        activeScreenPath="/"
        currentPath="/site"
        dependencies={dependencies}
        accountSession={{ authenticated: false, setupComplete: true }}
        routeWorld={routeWorld}
        runtimeProfile={runtimeProfile}
        screenModels={[screen]}
      >
        <HostProbe>
          <SelectionProbe />
        </HostProbe>
      </ApplicationShellRuntimeBoundary>,
    );

    const initialHost = required(host);
    const rootSection = required(
      readSections(initialHost).find((section) => section.role === "rootRecords"),
    );
    const secondRoot = required(rootSection.destinations[1]);

    if (secondRoot.kind !== "shellRootRecordDestination") {
      throw new Error("Expected root record destination.");
    }

    await act(async () => {
      await initialHost.dispatch(secondRoot.selectionIntent);
    });
    expect(selectedRecordId).toBe("project-2");
    expect(host).toBe(initialHost);

    const createSection = required(
      readSections(initialHost).find((section) => section.createSurface !== undefined),
    );
    const createSurface = required(createSection.createSurface);
    const createField = required(createSurface.dialog.form.fieldSet.fields[0]);

    await act(async () => {
      await initialHost.dispatch({
        intent: { open: true, surfaceId: createSurface.id, type: "createOpenChange" },
        sectionId: createSection.id,
        shellId: "application-shell",
        surfaceId: createSurface.id,
        type: "shellCreate",
      });
    });
    expect(required(readSection(initialHost, createSection.id).createSurface).dialog.open).toBe(
      true,
    );

    await act(async () => {
      await initialHost.dispatch({
        fieldId: createField.fieldId,
        intent: {
          fieldName: "label",
          fieldValue: { kind: "input", value: "Created project" },
          type: "createDraftChange",
        },
        sectionId: createSection.id,
        shellId: "application-shell",
        surfaceId: createSurface.id,
        type: "shellCreate",
      });
    });
    expect(
      required(readSection(initialHost, createSection.id).createSurface).dialog.form.fieldSet
        .fields[0],
    ).toMatchObject({ fieldName: "label", value: "Created project" });

    await act(async () => {
      await initialHost.dispatch({
        intent: { surfaceId: createSurface.id, type: "createSubmit" },
        sectionId: createSection.id,
        shellId: "application-shell",
        surfaceId: createSurface.id,
        type: "shellCreate",
      });
    });
    expect(submittedValues).toEqual([{ label: "Created project" }]);
    expect(selectedRecordId).toBe("project-created");
    expect(required(readSection(initialHost, createSection.id).createSurface).dialog.open).toBe(
      false,
    );
    expect(host).toBe(initialHost);

    createShouldFail = true;
    await act(async () => {
      await initialHost.dispatch({
        intent: { open: true, surfaceId: createSurface.id, type: "createOpenChange" },
        sectionId: createSection.id,
        shellId: "application-shell",
        surfaceId: createSurface.id,
        type: "shellCreate",
      });
      await initialHost.dispatch({
        fieldId: createField.fieldId,
        intent: {
          fieldName: "label",
          fieldValue: { kind: "input", value: "Retry project" },
          type: "createDraftChange",
        },
        sectionId: createSection.id,
        shellId: "application-shell",
        surfaceId: createSurface.id,
        type: "shellCreate",
      });
    });
    await act(async () => {
      await initialHost.dispatch({
        intent: { surfaceId: createSurface.id, type: "createSubmit" },
        sectionId: createSection.id,
        shellId: "application-shell",
        surfaceId: createSurface.id,
        type: "shellCreate",
      });
    });
    const failedCreate = required(readSection(initialHost, createSection.id).createSurface);
    expect(failedCreate.dialog.open).toBe(true);
    expect(failedCreate.dialog.form.errors).toEqual(["Create failed. Try again."]);
    expect(JSON.stringify(failedCreate)).not.toContain("alchemy-secret-create-error");

    renderer.unmount();
  });

  it("executes logout effects while projecting only display-safe session status", async () => {
    applyBootstrapResponse(bootstrapResponse(taskSourceSchema, []), programStorageIdentity());
    const runtimeProfile = createInstanceRuntimeProfile();
    const routeWorld = programSiteWorld();
    let host: PresentationHost | undefined;
    let logoutCount = 0;
    const navigations: string[] = [];
    const dependencies = {
      logout: async () => {
        logoutCount += 1;
        return { authenticated: false as const, continueTo: "/formless/auth" as const };
      },
      navigate: (path: `/${string}`) => navigations.push(path),
    };

    function HostProbe({ children }: { children: ReactNode }) {
      host = usePresentationHost();
      return children;
    }

    const renderer = render(
      <ApplicationShellRuntimeBoundary
        currentPath="/site"
        dependencies={dependencies}
        accountSession={{
          authenticated: true,
          principal: {
            displayName: "Instance Admin",
            email: "owner@example.com",
            principalId: "principal:instance-admin",
          },
          session: { expiresAt: "private-session-value" },
          setupComplete: true,
        }}
        routeWorld={routeWorld}
        runtimeProfile={runtimeProfile}
      >
        <HostProbe>
          <div>Workspace</div>
        </HostProbe>
      </ApplicationShellRuntimeBoundary>,
    );

    const currentHost = required(host);
    const sessionSection = required(
      readSections(currentHost).find((section) => section.session?.state === "authenticated"),
    );
    const session = sessionSection.session;
    if (session?.state !== "authenticated") {
      throw new Error("Expected authenticated session.");
    }

    await act(async () => {
      await currentHost.dispatch({
        controlId: session.logout.id,
        sectionId: sessionSection.id,
        shellId: "application-shell",
        type: "shellLogout",
      });
    });
    expect(logoutCount).toBe(1);
    expect(navigations).toEqual(["/formless/auth"]);
    expect(
      readSections(currentHost).find((section) => section.role === "session")?.session,
    ).toMatchObject({ state: "anonymous" });
    expect(JSON.stringify(readSections(currentHost))).not.toContain("private-session-value");

    renderer.unmount();
  });

  it("projects Program navigation only from current exact route decisions", async () => {
    const runtimeProfile = createInstanceRuntimeProfile();
    let host: PresentationHost | undefined;
    let allowedPaths = new Set(["/apps", "/deployments"]);
    const routeChecks: string[] = [];
    const dependencies = {
      resolveRouteAccess: async (path: `/${string}`) => {
        routeChecks.push(path);
        return allowedPaths.has(path)
          ? ({ kind: "authorized" } as const)
          : ({ kind: "forbidden" } as const);
      },
    };
    const accountSession = {
      authenticated: true as const,
      principal: {
        displayName: "Program administrator",
        principalId: "principal:administrator",
      },
      session: { expiresAt: "2026-07-31T00:00:00.000Z" },
      setupComplete: true as const,
    };

    function HostProbe() {
      host = usePresentationHost();
      return null;
    }

    const renderer = render(
      <ApplicationShellRuntimeBoundary
        accountSession={accountSession}
        currentPath="/deployments"
        dependencies={dependencies}
        routeWorld={undefined}
        runtimeProfile={runtimeProfile}
        screenModels={[]}
      >
        <HostProbe />
      </ApplicationShellRuntimeBoundary>,
    );

    await waitFor(() => expect(routeChecks).toHaveLength(FORMLESS_PROGRAM_SCREEN_PATHS.length));
    await waitFor(() => expect(programDestinationPaths(required(host))).toEqual(["/deployments"]));

    allowedPaths = new Set(["/settings"]);
    renderer.rerender(
      <ApplicationShellRuntimeBoundary
        accountSession={accountSession}
        currentPath="/settings"
        dependencies={dependencies}
        routeWorld={undefined}
        runtimeProfile={runtimeProfile}
        screenModels={[]}
      >
        <HostProbe />
      </ApplicationShellRuntimeBoundary>,
    );

    await waitFor(() => expect(routeChecks).toHaveLength(FORMLESS_PROGRAM_SCREEN_PATHS.length * 2));
    await waitFor(() => expect(programDestinationPaths(required(host))).toEqual(["/settings"]));

    renderer.unmount();
  });
});

function readSections(host: PresentationHost) {
  const manifest = required(host.read(shellManifestReference("application-shell")));

  return manifest.navigationSections.map((reference) => required(host.read(reference)));
}

function readSection(host: PresentationHost, sectionId: string) {
  const reference: ShellNavigationSectionReference = {
    kind: "shellNavigationSectionReference",
    role: "shellNavigationSection",
    sectionId,
    shellId: "application-shell",
  };

  return required(host.read(reference));
}

function programDestinationPaths(host: PresentationHost): string[] {
  return required(
    readSections(host).find((section) => section.role === "instance"),
  ).destinations.map((destination) => {
    if (destination.kind !== "shellLinkDestination") {
      throw new Error("Expected Program navigation to contain only links.");
    }

    return destination.href;
  });
}

function rootScreenFixture(): HomeScreenModel {
  const createOperation = {
    defaults: [],
    enabled: true,
    entity: {
      fields: [{ key: "label", required: true, type: "text" }],
      label: "Project",
    },
    entityName: "project",
    fields: [
      {
        editor: "text",
        field: { required: true, type: "text" },
        fieldName: "label",
      },
    ],
    label: "Create project",
    operation: {
      canonicalKey: "project.create",
      entityName: "project",
      label: "Create project",
      operation: {},
      operationName: "create",
    },
    operationName: "create",
    type: "create",
  };

  return {
    label: "Projects",
    layout: {
      sections: [
        {
          collection: {
            context: {
              entityName: "project",
              label: "Project",
              labelField: "label",
              navigation: {
                groups: [
                  {
                    createOperation,
                    label: "Projects",
                    query: { kind: "all" },
                    queryName: "all",
                  },
                ],
                placement: "sidebar",
              },
              query: { kind: "all" },
            },
          },
          id: "projects-section",
          label: "Projects",
          type: "collection",
          viewName: "projects",
        },
      ],
      type: "stack",
    },
    navigation: { primary: true },
    path: "/",
    screenName: "projects-screen",
    type: "workspace",
  } as unknown as HomeScreenModel;
}

function projectRecord(id: string): StoredRecord {
  return {
    createdAt: "2026-07-16T00:00:00.000Z",
    entity: "project",
    id,
    updatedAt: "2026-07-16T00:00:00.000Z",
    values: { label: id === "project-1" ? "Project one" : "Project two" },
  };
}

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new Error("Expected value.");
  }

  return value;
}

function programSiteWorld() {
  return {
    app: getSchemaAppDefinition("site"),
    generatedRoutes: true,
    route: "/site" as const,
    target: programStorageIdentity(),
  };
}
