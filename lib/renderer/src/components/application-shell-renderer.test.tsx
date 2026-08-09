// @vitest-environment jsdom

import { act, fireEvent, render, waitFor, type RenderResult } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type {
  ButtonContract,
  CreateSurfaceContract,
  DocumentThemeContract,
  DocumentThemeIntent,
  ShellIntent,
  ShellManifestContract,
  ShellNavigationSectionContract,
} from "@dpeek/formless-presentation/contract";
import {
  createMemoryPresentationHost,
  documentThemeReference,
  shellManifestReference,
  shellNavigationSectionReference,
  type PresentationNodeSet,
} from "@dpeek/formless-presentation/host";
import { PresentationHostProvider } from "@dpeek/formless-presentation/host/react";
import {
  AstryxApplicationShellRenderer,
  AstryxSubscribedApplicationShellRenderer,
} from "./shell.tsx";
(
  globalThis as {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;
const shellReference = shellManifestReference("shell:application");
const themeReference = documentThemeReference("theme:application");
const sectionReferences = {
  workspaces: shellNavigationSectionReference(shellReference.shellId, "section:workspaces"),
  program: shellNavigationSectionReference(shellReference.shellId, "section:program"),
  roots: shellNavigationSectionReference(shellReference.shellId, "section:roots"),
  status: shellNavigationSectionReference(shellReference.shellId, "section:status"),
  session: shellNavigationSectionReference(shellReference.shellId, "section:session"),
} as const;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Astryx application shell renderer", () => {
  it("renders contract hierarchy and keeps responsive presentation state local", async () => {
    const viewport = mockMatchMedia(true);
    const intents: ShellIntent[] = [];
    const mountedRenderer = render(
      <AstryxApplicationShellRenderer
        manifest={shellManifest()}
        onIntent={(intent) => {
          intents.push(intent);
        }}
        onThemeIntent={() => undefined}
        sections={[...shellSections()].reverse()}
        theme={fixedTheme("dark")}
      >
        <article data-route-child="settings">Route workspace</article>
      </AstryxApplicationShellRenderer>,
    );
    const { container } = mountedRenderer;
    expect(new Set(sideNavSectionLabels(container))).toEqual(new Set(["Tasks screens", "Pages"]));
    const pages = required(
      container.querySelector<HTMLButtonElement>('button[aria-current="page"]'),
    );
    expect(pages.getAttribute("aria-current")).toBe("page");
    expect((pages as HTMLButtonElement).disabled).toBe(false);
    expect(container.querySelector('a[href="/tasks"]')).not.toBeNull();
    const settingsLinks = container.querySelectorAll('a[href="/settings"]');
    expect(settingsLinks).toHaveLength(1);
    expect(settingsLinks[0]?.textContent).toContain("Settings");
    const footer = required(
      container.querySelector<HTMLElement>("[data-formless-astryx-side-nav-footer]"),
    );
    const statusTrigger = interactiveByLabel(footer, "Sync status: Sync issue");
    expect(footer.contains(statusTrigger)).toBe(true);
    expect(statusTrigger.getAttribute("title")).toBeNull();
    const statusDetails = required(
      Array.from(footer.querySelectorAll<HTMLElement>('[role="dialog"][popover]')).find((dialog) =>
        dialog.textContent?.includes("Sync failed. Try again."),
      ),
    );
    statusTrigger.focus();
    expect(document.activeElement).toBe(statusTrigger);
    expect(statusDetails.textContent).toContain("Sync issue");
    expect(statusDetails.textContent).toContain("Sync failed. Try again.");
    expect(statusDetails.textContent).toContain("Schemav8");
    expect(statusDetails.textContent).toContain("Cursor27");
    expect(statusDetails.querySelector('time[datetime="2026-07-16T01:00:00.000Z"]')).not.toBeNull();
    expect(statusDetails.textContent).toContain("Queued");
    expect(statusDetails.textContent).toContain("Workspace changes are queued.");
    expect(interactiveByLabel(container, "Ada Lovelace")).toBeDefined();
    expect(rendererText(mountedRenderer)).toContain("Route workspace");

    fireEvent.click(requiredByProps(container, { "aria-label": "Open menu" }));
    const workspaceLinks = await waitFor(() => {
      const links = Array.from(
        document.body.querySelectorAll<HTMLAnchorElement>('a[role="menuitem"]'),
      );
      expect(links).toHaveLength(6);
      return links;
    });
    expect(workspaceLinks.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Tasks", "/tasks"],
      ["Site", "/site"],
      ["Instance", "/settings/routes"],
      ["Tasks", "/tasks"],
      ["Site", "/site"],
      ["Instance", "/settings/routes"],
    ]);
    expect(
      required(document.body.querySelector('[role="menuitem"] [aria-current="page"]')).textContent,
    ).toBe("Tasks");

    const mobileNav = required(
      container.querySelector<HTMLDialogElement>('dialog[aria-label="Navigation"]'),
    );
    expect(mobileNav.open).toBe(false);

    fireEvent.click(requiredByProps(container, { "aria-label": "Open navigation" }));

    expect(mobileNav.open).toBe(true);
    const createDialog = await waitFor(() =>
      required(
        Array.from(
          container.querySelectorAll<HTMLDialogElement>('dialog[aria-label="Create page"]'),
        ).find((dialog) => dialog.open),
      ),
    );
    expect(createDialog.textContent).toContain("Page name is required.");
    expect(createDialog.textContent).toContain("Creating...");
    fireEvent.click(pages);
    fireEvent.click(requiredByProps(container, { "aria-label": "Open navigation" }));
    fireEvent.click(interactiveByLabel(container, "Create page"));
    fireEvent.click(interactiveByLabel(container, "Ada Lovelace"));
    fireEvent.click(await waitFor(() => interactiveByLabel(document.body, "Log out Local Owner")));

    expect(intents).toEqual([
      {
        destinationId: "root:pages",
        recordId: "pages",
        sectionId: sectionReferences.roots.sectionId,
        shellId: shellReference.shellId,
        type: "shellRootRecordSelection",
      },
      {
        intent: { open: true, surfaceId: "create:page", type: "createOpenChange" },
        sectionId: sectionReferences.roots.sectionId,
        shellId: shellReference.shellId,
        surfaceId: "create:page",
        type: "shellCreate",
      },
      {
        controlId: "logout:owner",
        sectionId: sectionReferences.session.sectionId,
        shellId: shellReference.shellId,
        type: "shellLogout",
      },
    ]);

    mountedRenderer.unmount();
    viewport.mockRestore();
  });

  it("subscribes through shell references and dispatches through the host", async () => {
    const intents: ShellIntent[] = [];
    const host = createMemoryPresentationHost({
      dispatch: (intent) => {
        if (intent.type.startsWith("shell")) {
          intents.push(intent as ShellIntent);
        }
      },
      nodes: shellNodes(),
    });
    const mountedRenderer = render(
      <PresentationHostProvider host={host}>
        <AstryxSubscribedApplicationShellRenderer shellReference={shellReference}>
          <article data-route-child="subscribed">Subscribed workspace</article>
        </AstryxSubscribedApplicationShellRenderer>
      </PresentationHostProvider>,
    );
    expect(rendererText(mountedRenderer)).toContain("Subscribed workspace");
    expect(rendererText(mountedRenderer)).toContain("Tasks");

    fireEvent.click(
      required(
        mountedRenderer.container.querySelector<HTMLButtonElement>('button[aria-current="page"]'),
      ),
    );

    expect(intents).toEqual([
      {
        destinationId: "root:pages",
        recordId: "pages",
        sectionId: sectionReferences.roots.sectionId,
        shellId: shellReference.shellId,
        type: "shellRootRecordSelection",
      },
    ]);

    const updatedSections = shellSections().map((section) =>
      section.id === sectionReferences.workspaces.sectionId
        ? {
            ...section,
            destinations: section.destinations.map((destination) =>
              destination.id === "workspace:instance"
                ? { ...destination, label: "Infrastructure" }
                : destination,
            ),
          }
        : section,
    );
    await act(async () => {
      host.publish(shellNodes(updatedSections));
    });

    fireEvent.click(requiredByProps(mountedRenderer.container, { "aria-label": "Open menu" }));
    await waitFor(() => expect(document.body.textContent).toContain("Infrastructure"));

    mountedRenderer.unmount();
  });

  it("renders synced, syncing, and error status through accessible footer triggers", () => {
    const cases = [
      { label: "Synced", message: "All changes are synced.", state: "idle" as const },
      { label: "Syncing", message: "Syncing local changes.", state: "syncing" as const },
      { label: "Sync issue", message: "Sync failed. Try again.", state: "error" as const },
    ];

    for (const sync of cases) {
      const mountedRenderer = render(
        <AstryxApplicationShellRenderer
          manifest={shellManifest()}
          onIntent={() => undefined}
          sections={shellSections(sync)}
        >
          <article>Status workspace</article>
        </AstryxApplicationShellRenderer>,
      );
      const trigger = interactiveByLabel(mountedRenderer.container, `Sync status: ${sync.label}`);

      expect(
        requiredByProps(mountedRenderer.container, { "aria-label": sync.label, role: "img" }),
      ).toBeDefined();
      expect(trigger.getAttribute("title")).toBeNull();
      expect(rendererText(mountedRenderer)).toContain(sync.message);

      mountedRenderer.unmount();
    }
  });

  it("composes the separate subscribed theme node without changing shell sections", async () => {
    const intents: DocumentThemeIntent[] = [];
    const sections = shellSections();
    const host = createMemoryPresentationHost({
      dispatch: (intent) => {
        if (intent.type === "documentThemeModeSelection") {
          intents.push(intent);
        }
      },
      nodes: [...shellNodes(sections), { reference: themeReference, snapshot: userTheme() }],
    });
    const mountedRenderer = render(
      <PresentationHostProvider host={host}>
        <AstryxSubscribedApplicationShellRenderer
          shellReference={shellReference}
          themeReference={themeReference}
        >
          <article>Theme workspace</article>
        </AstryxSubscribedApplicationShellRenderer>
      </PresentationHostProvider>,
    );
    expect(
      requiredByProps(mountedRenderer.container, { "aria-label": "Switch to light mode" }),
    ).toBeDefined();
    expect(rendererText(mountedRenderer)).toContain("Theme workspace");
    expect(rendererText(mountedRenderer)).toContain("Tasks");

    fireEvent.click(
      requiredByProps(mountedRenderer.container, { "aria-label": "Switch to light mode" }),
    );

    expect(intents).toEqual([
      {
        controlId: "control:theme-mode",
        mode: "light",
        themeId: themeReference.themeId,
        type: "documentThemeModeSelection",
      },
    ]);

    mountedRenderer.unmount();
  });
});

function shellManifest(): ShellManifestContract {
  return {
    accessibilityLabel: "Formless Program application shell",
    activeDestination: {
      destinationId: "root:pages",
      sectionId: sectionReferences.roots.sectionId,
    },
    id: shellReference.shellId,
    kind: "shellManifest",
    navigationSections: [
      sectionReferences.workspaces,
      sectionReferences.program,
      sectionReferences.roots,
      sectionReferences.status,
      sectionReferences.session,
    ],
    title: "Tasks",
    workspaceSwitcher: sectionReferences.workspaces,
  };
}

function shellSections(
  sync: {
    label: string;
    message: string;
    state: "error" | "idle" | "syncing";
  } = { label: "Sync issue", message: "Sync failed. Try again.", state: "error" },
): ShellNavigationSectionContract[] {
  const rootSelectionIntent = {
    destinationId: "root:pages",
    recordId: "pages",
    sectionId: sectionReferences.roots.sectionId,
    shellId: shellReference.shellId,
    type: "shellRootRecordSelection" as const,
  };

  return [
    shellSection(sectionReferences.workspaces.sectionId, "workspaceSwitcher", {
      accessibilityLabel: "Program workspaces",
      destinations: [
        { ...shellLink("workspace:tasks", "Tasks", "/tasks"), selected: true },
        shellLink("workspace:site", "Site", "/site"),
        shellLink("workspace:instance", "Instance", "/settings/routes"),
      ],
      label: "Workspaces",
    }),
    shellSection(sectionReferences.program.sectionId, "program", {
      accessibilityLabel: "Program navigation",
      destinations: [
        { ...shellLink("program:tasks", "Tasks", "/tasks"), selected: true },
        shellLink("program:overdue", "Overdue", "/tasks/overdue"),
        shellLink("program:settings", "Settings", "/settings"),
      ],
      label: "Tasks screens",
    }),
    shellSection(sectionReferences.roots.sectionId, "rootRecords", {
      createSurface: createSurface(),
      destinations: [
        {
          accessibilityLabel: "Pages",
          availability: { available: true },
          countText: "3",
          id: "root:pages",
          kind: "shellRootRecordDestination",
          label: "Pages",
          recordId: "pages",
          selected: true,
          selectionIntent: rootSelectionIntent,
        },
      ],
      label: "Pages",
    }),
    shellSection(sectionReferences.status.sectionId, "status", {
      status: {
        id: "status:tasks",
        kind: "shellStatus",
        sync: {
          details: [
            { label: "Schema", presentation: "text", value: "v8" },
            { label: "Cursor", presentation: "text", value: "27" },
            {
              label: "Last sync",
              presentation: "timestamp",
              value: "2026-07-16T01:00:00.000Z",
            },
          ],
          id: "sync:tasks",
          kind: "shellSyncStatus",
          ...sync,
        },
        workspaceSave: {
          id: "workspace:save",
          kind: "shellWorkspaceSaveStatus",
          label: "Queued",
          message: "Workspace changes are queued.",
          state: "queued",
        },
      },
    }),
    shellSection(sectionReferences.session.sectionId, "session", {
      session: {
        id: "session:owner",
        identity: { displayName: "Ada Lovelace", secondaryLabel: "ada@example.com" },
        kind: "shellSession",
        logout: shellButton("logout:owner", "Log out", "quiet"),
        state: "authenticated",
      },
    }),
  ];
}

function shellSection(
  id: string,
  role: ShellNavigationSectionContract["role"],
  options: Partial<
    Pick<
      ShellNavigationSectionContract,
      "accessibilityLabel" | "createSurface" | "destinations" | "label" | "session" | "status"
    >
  > = {},
): ShellNavigationSectionContract {
  return {
    accessibilityLabel: options.accessibilityLabel ?? `${id} navigation`,
    destinations: options.destinations ?? [],
    id,
    kind: "shellNavigationSection",
    role,
    shellId: shellReference.shellId,
    ...(options.createSurface ? { createSurface: options.createSurface } : {}),
    ...(options.label ? { label: options.label } : {}),
    ...(options.session ? { session: options.session } : {}),
    ...(options.status ? { status: options.status } : {}),
  };
}

function shellLink(id: string, label: string, href: string) {
  return {
    accessibilityLabel: label,
    availability: { available: true as const },
    href,
    id,
    kind: "shellLinkDestination" as const,
    label,
    selected: false,
  };
}

function createSurface(): CreateSurfaceContract {
  return {
    dialog: {
      form: {
        cancel: shellButton("create:cancel", "Cancel"),
        errors: ["Page name is required."],
        fieldSet: {
          disabled: false,
          fields: [],
          id: "create:fields",
          kind: "fieldSet",
        },
        id: "create:form",
        kind: "createForm",
        submit: {
          ...shellButton("create:submit", "Creating...", "primary", "submit"),
          disabled: true,
          pending: { isPending: true, label: "Creating" },
        },
      },
      id: "create:dialog",
      kind: "createDialog",
      open: true,
      title: "Create page",
    },
    id: "create:page",
    kind: "createSurface",
    trigger: {
      ...shellButton("create:trigger", "Create page", "quiet"),
      content: { icon: "add", kind: "iconOnly" },
      density: "compact",
    },
  };
}

function shellButton(
  id: string,
  label: string,
  prominence: ButtonContract["prominence"] = "secondary",
  type: ButtonContract["type"] = "button",
): ButtonContract {
  return {
    accessibilityLabel: label,
    content: { kind: "label", label },
    density: "default",
    id,
    kind: "button",
    prominence,
    type,
  };
}

function shellNodes(
  sections: readonly ShellNavigationSectionContract[] = shellSections(),
): PresentationNodeSet {
  return [
    { reference: shellReference, snapshot: shellManifest() },
    ...sections.map((section) => ({
      reference: shellNavigationSectionReference(shellReference.shellId, section.id),
      snapshot: section,
    })),
  ];
}

function userTheme(): DocumentThemeContract {
  const controlId = "control:theme-mode";
  const option = (mode: "system" | "light" | "dark", label: string) => ({
    label,
    mode,
    selectionIntent: {
      controlId,
      mode,
      themeId: themeReference.themeId,
      type: "documentThemeModeSelection" as const,
    },
  });

  return {
    activeMode: "dark",
    id: themeReference.themeId,
    kind: "documentTheme",
    policy: { kind: "userControlled" },
    selectionControl: {
      accessibilityLabel: "Theme mode",
      id: controlId,
      kind: "documentThemeSelectionControl",
      options: [option("system", "System"), option("light", "Light"), option("dark", "Dark")],
      selectedMode: "system",
    },
  };
}

function fixedTheme(mode: "light" | "dark"): DocumentThemeContract {
  return {
    activeMode: mode,
    id: themeReference.themeId,
    kind: "documentTheme",
    policy: { kind: "fixed", mode },
  };
}

function sideNavSectionLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[role="group"][aria-labelledby]')).map(
    (section) => {
      const labelId = section.getAttribute("aria-labelledby");
      return labelId ? (section.ownerDocument.getElementById(labelId)?.textContent ?? "") : "";
    },
  );
}

function mockMatchMedia(matches: boolean) {
  return vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    addEventListener: () => undefined,
    addListener: () => undefined,
    dispatchEvent: () => true,
    matches,
    media: query,
    onchange: null,
    removeEventListener: () => undefined,
    removeListener: () => undefined,
  }));
}

function requiredByProps(container: HTMLElement, props: Record<string, unknown>): HTMLElement {
  const match = Array.from(container.querySelectorAll<HTMLElement>("*")).find((element) =>
    Object.entries(props).every(([name, value]) => element.getAttribute(name) === String(value)),
  );
  if (!match) {
    throw new Error(`Expected DOM node matching ${JSON.stringify(props)}.`);
  }
  return match;
}

function interactiveByLabel(container: HTMLElement, label: string): HTMLElement {
  return required(
    Array.from(container.querySelectorAll<HTMLElement>('a,button,[role="menuitem"]')).find(
      (node) =>
        (node.getAttribute("aria-label") ?? node.textContent?.replace(/\s+/g, " ").trim()) ===
        label,
    ),
  );
}

function required<T>(value: T): NonNullable<T> {
  if (value === null || value === undefined) {
    throw new Error("Expected rendered value.");
  }
  return value as NonNullable<T>;
}

function rendererText(renderer: RenderResult) {
  return renderer.container.textContent ?? "";
}
