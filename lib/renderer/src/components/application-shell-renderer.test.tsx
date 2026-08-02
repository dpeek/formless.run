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
  settings: shellNavigationSectionReference(shellReference.shellId, "section:settings"),
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
    expect(rendererText(mountedRenderer)).toContain("Settings");
    expect(rendererText(mountedRenderer)).toContain("Sync failed. Try again.");
    expect(rendererText(mountedRenderer)).toContain("Workspace changes are queued.");
    expect(requiredByProps(container, { "aria-label": "Ada Lovelace", role: "img" })).toBeDefined();
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
      ["CRM", "/crm"],
      ["Tasks", "/tasks"],
      ["Site", "/site"],
      ["CRM", "/crm"],
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
              destination.id === "workspace:crm"
                ? { ...destination, label: "Customers" }
                : destination,
            ),
          }
        : section,
    );
    await act(async () => {
      host.publish(shellNodes(updatedSections));
    });

    fireEvent.click(requiredByProps(mountedRenderer.container, { "aria-label": "Open menu" }));
    await waitFor(() => expect(document.body.textContent).toContain("Customers"));

    mountedRenderer.unmount();
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
      sectionReferences.settings,
      sectionReferences.session,
    ],
    title: "Tasks",
    workspaceSwitcher: sectionReferences.workspaces,
  };
}

function shellSections(): ShellNavigationSectionContract[] {
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
        shellLink("workspace:crm", "CRM", "/crm"),
      ],
      label: "Workspaces",
    }),
    shellSection(sectionReferences.program.sectionId, "program", {
      accessibilityLabel: "Program navigation",
      destinations: [
        { ...shellLink("program:tasks", "Tasks", "/tasks"), selected: true },
        shellLink("program:overdue", "Overdue", "/tasks/overdue"),
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
    shellSection(sectionReferences.settings.sectionId, "settings", {
      label: "Settings",
      settings: {
        id: "settings:tasks",
        kind: "shellSettings",
        sync: {
          details: [
            { label: "Program", value: "Formless Program" },
            { label: "Cursor", value: "27" },
          ],
          id: "sync:tasks",
          kind: "shellSyncStatus",
          label: "Sync issue",
          message: "Sync failed. Try again.",
          state: "error",
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
      "accessibilityLabel" | "createSurface" | "destinations" | "label" | "session" | "settings"
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
    ...(options.settings ? { settings: options.settings } : {}),
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
