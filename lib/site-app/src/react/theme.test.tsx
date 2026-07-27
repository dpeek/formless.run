// @vitest-environment jsdom

import { fireEvent, render } from "@testing-library/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { PUBLIC_SITE_THEME_STORAGE_KEY, PUBLIC_SITE_THEME_SYSTEM_QUERY } from "../public-theme.ts";
import type { SiteSettingsNode } from "../types.ts";
import { PublicSiteThemeProvider, usePublicSiteTheme } from "./theme.ts";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.classList.remove("dark", "light");
  delete document.documentElement.dataset.siteTheme;
  delete document.documentElement.dataset.formlessApplicationTheme;
  document.documentElement.style.removeProperty("color-scheme");
});

describe("public Site browser theme controller", () => {
  it("keeps server and initial hydration output on the deterministic light mode", () => {
    installBrowserThemeEnvironment({ storedValue: "dark", systemPrefersDark: true });

    expect(renderToStaticMarkup(<ThemeHarness />)).toBe(
      '<button data-theme-mode="light" data-theme-switchable="true" type="button">light</button>',
    );
  });

  it("applies a stored visitor mode ahead of the configured initial mode", async () => {
    const environment = installBrowserThemeEnvironment({
      storedValue: "light",
      systemPrefersDark: false,
    });
    const { container, unmount } = render(
      <ThemeHarness site={siteSettings({ initialThemeMode: "dark" })} />,
    );

    const button = required(container.querySelector("button"));
    expect(button.dataset.themeMode).toBe("light");
    expect(environment.documentTheme()).toEqual({
      classes: ["light"],
      colorScheme: "light",
      dataTheme: "light",
    });

    fireEvent.click(button);

    expect(button.dataset.themeMode).toBe("dark");
    expect(environment.writes).toEqual([[PUBLIC_SITE_THEME_STORAGE_KEY, "dark"]]);
    expect(environment.documentTheme()).toEqual({
      classes: ["dark"],
      colorScheme: "dark",
      dataTheme: "dark",
    });

    unmount();
  });

  it("uses system mode and keeps toggles in memory when storage is unavailable", async () => {
    const environment = installBrowserThemeEnvironment({
      storageUnavailable: true,
      systemPrefersDark: true,
    });
    const { container, unmount } = render(<ThemeHarness />);
    const button = required(container.querySelector("button"));

    expect(button.dataset.themeMode).toBe("dark");

    fireEvent.click(button);

    expect(button.dataset.themeMode).toBe("light");
    expect(environment.writes).toEqual([]);
    expect(environment.documentTheme().dataTheme).toBe("light");

    unmount();
  });

  it("ignores visitor storage and disables persistence when switching is disabled", () => {
    const environment = installBrowserThemeEnvironment({
      storedValue: "dark",
      systemPrefersDark: true,
    });
    const { container, unmount } = render(
      <ThemeHarness site={siteSettings({ initialThemeMode: "light", themeSwitchable: false })} />,
    );
    const button = required(container.querySelector("button"));

    expect(button.dataset.themeMode).toBe("light");
    expect(button.dataset.themeSwitchable).toBe("false");
    fireEvent.click(button);
    expect(button.dataset.themeMode).toBe("light");
    expect(environment.reads).toEqual([]);
    expect(environment.writes).toEqual([]);

    unmount();
  });

  it("restores the previous document theme after the public Site boundary unmounts", () => {
    installBrowserThemeEnvironment({ storedValue: null, systemPrefersDark: false });
    document.documentElement.style.setProperty("color-scheme", "dark");
    document.documentElement.dataset.formlessApplicationTheme = "dark";
    const { unmount } = render(
      <ThemeHarness site={siteSettings({ initialThemeMode: "light", themeSwitchable: false })} />,
    );

    expect(document.documentElement.style.getPropertyValue("color-scheme")).toBe("light");
    unmount();
    expect(document.documentElement.style.getPropertyValue("color-scheme")).toBe("dark");
    expect(document.documentElement.dataset.siteTheme).toBeUndefined();
  });
});

function ThemeHarness({ site }: { site?: SiteSettingsNode }) {
  return (
    <PublicSiteThemeProvider site={site}>
      <ThemeControl />
    </PublicSiteThemeProvider>
  );
}

function ThemeControl() {
  const theme = usePublicSiteTheme();

  return createElement(
    "button",
    {
      "data-theme-mode": theme.mode,
      "data-theme-switchable": theme.switchable,
      onClick: theme.toggleMode,
      type: "button",
    },
    theme.mode,
  );
}

function siteSettings(
  values: Pick<SiteSettingsNode, "initialThemeMode" | "themeSwitchable">,
): SiteSettingsNode {
  return {
    id: "site",
    label: "Site",
    ...values,
  };
}

function installBrowserThemeEnvironment(input: {
  storageUnavailable?: boolean;
  storedValue?: string | null;
  systemPrefersDark: boolean;
}) {
  const reads: string[] = [];
  const writes: [string, string][] = [];
  vi.spyOn(Storage.prototype, "getItem").mockImplementation((key) => {
    reads.push(key);
    expect(key).toBe(PUBLIC_SITE_THEME_STORAGE_KEY);
    if (input.storageUnavailable) {
      throw new Error("Storage unavailable.");
    }
    return input.storedValue ?? null;
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation((key, value) => {
    if (input.storageUnavailable) {
      throw new Error("Storage unavailable.");
    }
    writes.push([key, value]);
  });

  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => {
      expect(query).toBe(PUBLIC_SITE_THEME_SYSTEM_QUERY);
      return { matches: input.systemPrefersDark } as MediaQueryList;
    }),
  );

  return {
    documentTheme: () => ({
      classes: [...document.documentElement.classList].sort(),
      colorScheme: document.documentElement.style.getPropertyValue("color-scheme"),
      dataTheme: document.documentElement.dataset.siteTheme,
    }),
    reads,
    writes,
  };
}

function required<Value>(value: Value | null | undefined): Value {
  if (value === null || value === undefined) {
    throw new Error("Expected value.");
  }
  return value;
}
