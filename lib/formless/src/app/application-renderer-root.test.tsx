// @vitest-environment jsdom

import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { StrictMode } from "react";
import {
  SitePageRouteView,
  type SitePublicRendererProps,
  type SitePublicSystemStateRendererProps,
} from "@dpeek/formless-site-app/public/react";
import type { PresentationHost } from "@dpeek/formless-presentation/host";
import { usePresentationHost, useDocumentTheme } from "@dpeek/formless-presentation/host/react";
import { ApplicationRendererRoot } from "./application-renderer-root.tsx";
import {
  applicationThemeReference,
  bootstrapBrowserApplicationTheme,
  browserApplicationTheme,
  createApplicationThemeController,
  type ApplicationThemeBrowser,
} from "./application-theme-runtime.ts";
import { useApplicationRootThemeRuntime } from "./application-root-context.tsx";
import { ApplicationShellRuntimeBoundary } from "./application-shell-runtime.tsx";
import { applyBootstrapResponse, resetClientStore } from "../client/store.ts";
import { resetSyncStatus } from "../client/sync-status.ts";
import { bootstrapResponse } from "../test/protocol-builders.ts";
import { taskSourceSchema } from "../test/schema-apps.ts";
import { createDevRuntimeProfile, findRuntimeWorldMountByRoute } from "./runtime-profile.ts";
(
  globalThis as {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-site-theme");
  document.documentElement.removeAttribute("data-formless-application-theme");
  document.documentElement.style.removeProperty("color-scheme");
  window.localStorage.clear();
  resetClientStore();
  resetSyncStatus();
});

describe("application root runtime", () => {
  it("updates the production subscribed application shell and document when theme mode changes", async () => {
    applyBootstrapResponse(bootstrapResponse(taskSourceSchema, []), "site");
    const runtimeProfile = createDevRuntimeProfile();
    const routeWorld = required(findRuntimeWorldMountByRoute(runtimeProfile, "/site"));
    const mediaQuery = matchMediaFixture(true);
    vi.stubGlobal("matchMedia", () => mediaQuery);
    window.localStorage.setItem("formless:application:theme", "dark");

    let currentNestedHost: PresentationHost | undefined;
    let selectionCount = 0;
    const firstController = createApplicationThemeController(browserApplicationTheme());
    const observedController = {
      ...firstController,
      selectPreference: (preference: "dark" | "light" | "system") => {
        selectionCount += 1;
        firstController.selectPreference(preference);
      },
    };

    function NestedHostProbe() {
      currentNestedHost = usePresentationHost();
      return <div>Workspace</div>;
    }

    function ConnectedAdminShell() {
      const applicationTheme = useApplicationRootThemeRuntime();
      return (
        <ApplicationShellRuntimeBoundary
          applicationTheme={applicationTheme}
          currentPath="/site"
          accountSession={{ authenticated: false, setupComplete: true }}
          routeWorld={routeWorld}
          runtimeProfile={runtimeProfile}
          screenModels={[]}
        >
          <NestedHostProbe />
        </ApplicationShellRuntimeBoundary>
      );
    }

    const mounted = render(
      <StrictMode>
        <ApplicationRendererRoot navigate={() => undefined} themeController={observedController}>
          <ConnectedAdminShell />
        </ApplicationRendererRoot>
      </StrictMode>,
    );

    expect(firstController.getSnapshot().activeMode).toBe("dark");
    expect(required(currentNestedHost).read(applicationThemeReference)?.activeMode).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.formlessApplicationTheme).toBe("dark");
    expect(document.documentElement.style.getPropertyValue("color-scheme")).toBe("dark");

    await act(async () => {
      required(
        mounted.container.querySelector<HTMLButtonElement>('[aria-label="Switch to light mode"]'),
      ).click();
    });

    expect(selectionCount).toBe(1);
    expect(firstController.getSnapshot().activeMode).toBe("light");
    expect(required(currentNestedHost).read(applicationThemeReference)?.activeMode).toBe("light");
    expect(mounted.container.querySelector('[aria-label="Switch to dark mode"]')).not.toBeNull();
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.dataset.formlessApplicationTheme).toBe("light");
    expect(document.documentElement.style.getPropertyValue("color-scheme")).toBe("light");

    mounted.unmount();
    firstController.destroy();

    const reloadedController = createApplicationThemeController(browserApplicationTheme());
    const remounted = render(
      <StrictMode>
        <ApplicationRendererRoot navigate={() => undefined} themeController={reloadedController}>
          <ConnectedAdminShell />
        </ApplicationRendererRoot>
      </StrictMode>,
    );

    expect(reloadedController.getSnapshot().activeMode).toBe("light");
    expect(required(currentNestedHost).read(applicationThemeReference)?.activeMode).toBe("light");
    expect(remounted.container.querySelector('[aria-label="Switch to dark mode"]')).not.toBeNull();
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.dataset.formlessApplicationTheme).toBe("light");
    expect(document.documentElement.style.getPropertyValue("color-scheme")).toBe("light");

    await act(async () => {
      required(
        remounted.container.querySelector<HTMLButtonElement>('[aria-label="Switch to dark mode"]'),
      ).click();
    });

    expect(reloadedController.getSnapshot()).toMatchObject({
      activeMode: "dark",
      selectionControl: { selectedMode: "dark" },
    });
    expect(required(currentNestedHost).read(applicationThemeReference)?.activeMode).toBe("dark");
    expect(remounted.container.querySelector('[aria-label="Switch to light mode"]')).not.toBeNull();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.formlessApplicationTheme).toBe("dark");
    expect(document.documentElement.style.getPropertyValue("color-scheme")).toBe("dark");

    const systemIntent = required(
      reloadedController
        .getSnapshot()
        .selectionControl.options.find((option) => option.mode === "system"),
    ).selectionIntent;
    await act(async () => {
      await required(currentNestedHost).dispatch(systemIntent);
    });

    expect(reloadedController.getSnapshot()).toMatchObject({
      activeMode: "dark",
      selectionControl: { selectedMode: "system" },
    });

    await act(async () => {
      mediaQuery.setMatches(false);
    });

    expect(reloadedController.getSnapshot()).toMatchObject({
      activeMode: "light",
      selectionControl: { selectedMode: "system" },
    });
    expect(required(currentNestedHost).read(applicationThemeReference)?.activeMode).toBe("light");
    expect(remounted.container.querySelector('[aria-label="Switch to dark mode"]')).not.toBeNull();
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.dataset.formlessApplicationTheme).toBe("light");
    expect(document.documentElement.style.getPropertyValue("color-scheme")).toBe("light");

    remounted.unmount();
    reloadedController.destroy();
  });

  it("keeps one host while publishing theme changes and managing navigation lifecycle", async () => {
    const fixture = themeBrowserFixture("dark");
    const controller = createApplicationThemeController(fixture.browser);
    const navigationTarget = eventTargetFixture();
    let currentHost: PresentationHost | undefined;
    let currentThemeId: string | undefined;
    let currentRootReference = "";

    function RuntimeProbe() {
      currentHost = usePresentationHost();
      currentThemeId = useDocumentTheme(applicationThemeReference)?.id;
      currentRootReference = useApplicationRootThemeRuntime()?.reference.themeId ?? "";
      return null;
    }

    const mounted = render(
      <ApplicationRendererRoot
        currentHref={() => "https://formless.test/apps/tasks"}
        navigate={() => undefined}
        navigationTarget={navigationTarget}
        themeController={controller}
      >
        <RuntimeProbe />
      </ApplicationRendererRoot>,
    );

    const initialHost = required(currentHost);
    expect(currentThemeId).toBe(applicationThemeReference.themeId);
    expect(currentRootReference).toBe(applicationThemeReference.themeId);
    expect(navigationTarget.listenerCount()).toBe(1);

    await act(async () => {
      const currentTheme = initialHost.read(applicationThemeReference);
      if (
        !currentTheme ||
        currentTheme.policy.kind !== "userControlled" ||
        !currentTheme.selectionControl
      ) {
        throw new Error("Expected user-controlled application theme.");
      }
      await initialHost.dispatch(
        required(currentTheme.selectionControl.options[1]).selectionIntent,
      );
    });

    expect(currentHost).toBe(initialHost);
    expect(currentThemeId).toBe(applicationThemeReference.themeId);
    expect(currentRootReference).toBe(applicationThemeReference.themeId);
    expect(initialHost.read(applicationThemeReference)?.activeMode).toBe("light");
    expect(fixture.persisted).toEqual(["light"]);

    mounted.unmount();
    expect(navigationTarget.listenerCount()).toBe(0);
    controller.destroy();
  });

  it("keeps a fixed light custom Site renderer above a dark application shell and restores it", () => {
    vi.spyOn(Storage.prototype, "getItem").mockReturnValue("dark");
    vi.stubGlobal("matchMedia", () => ({
      addEventListener: () => undefined,
      matches: true,
      removeEventListener: () => undefined,
    }));
    const CustomRenderer = ({ tree }: SitePublicRendererProps) => (
      <article data-custom-site-renderer={tree.site?.initialThemeMode}>Custom Site</article>
    );
    const mounted = render(
      <ApplicationRendererRoot navigate={() => undefined}>
        <SitePageRouteView
          builtInRenderer={CustomRenderer}
          builtInSystemStateRenderer={SystemStateRendererProbe}
          state={{
            status: "ready",
            tree: {
              site: {
                id: "site",
                label: "Fixed light Site",
                initialThemeMode: "light",
                themeSwitchable: false,
              },
              page: { id: "home", type: "page", label: "Home", placements: [] },
              frame: {},
              meta: {
                slug: "home",
                generatedAt: "2026-07-27T00:00:00.000Z",
                warnings: [],
              },
            },
          }}
          workspaceRenderer={CustomRenderer}
        />
      </ApplicationRendererRoot>,
    );

    expect(mounted.container.querySelector("[data-custom-site-renderer]")).not.toBeNull();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.formlessApplicationTheme).toBe("dark");
    expect(document.documentElement.dataset.siteTheme).toBe("light");
    expect(document.documentElement.style.getPropertyValue("color-scheme")).toBe("light");

    bootstrapBrowserApplicationTheme();
    expect(document.documentElement.style.getPropertyValue("color-scheme")).toBe("light");

    mounted.rerender(
      <ApplicationRendererRoot navigate={() => undefined}>
        <div data-application-route>Application route</div>
      </ApplicationRendererRoot>,
    );

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.siteTheme).toBeUndefined();
    expect(document.documentElement.style.getPropertyValue("color-scheme")).toBe("dark");

    mounted.unmount();
  });
});

function SystemStateRendererProbe(props: SitePublicSystemStateRendererProps) {
  return <output data-state={props.kind} />;
}

function themeBrowserFixture(stored: "system" | "light" | "dark") {
  const persisted: string[] = [];
  const browser: ApplicationThemeBrowser = {
    applyResolvedMode: () => undefined,
    persistPreference: (preference) => persisted.push(preference),
    readPreference: () => stored,
    subscribePreference: () => () => undefined,
    subscribeSystemPreference: () => () => undefined,
    systemPrefersDark: () => false,
  };
  return { browser, persisted };
}

function eventTargetFixture() {
  const listeners = new Set<EventListenerOrEventListenerObject>();
  return {
    addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.add(listener);
    },
    listenerCount: () => listeners.size,
    removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.delete(listener);
    },
  } as Pick<Document, "addEventListener" | "removeEventListener"> & {
    listenerCount(): number;
  };
}

function matchMediaFixture(initialMatches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  let matches = initialMatches;

  return {
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    get matches() {
      return matches;
    },
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
    setMatches(nextMatches: boolean) {
      matches = nextMatches;
      for (const listener of listeners) {
        listener({ matches } as MediaQueryListEvent);
      }
    },
  } as MediaQueryList & {
    setMatches(nextMatches: boolean): void;
  };
}
function required<Value>(value: Value | null | undefined): Value {
  if (value === null || value === undefined) {
    throw new Error("Expected value.");
  }
  return value;
}
