import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vite-plus/test";

import type { SiteSettingsNode } from "./types.ts";
import {
  nextPublicSiteThemeMode,
  publicSiteThemeDocumentMarker,
  publicSiteThemePalette,
  publicSiteThemePreferenceFromStoredValue,
  PUBLIC_SITE_THEME_BOOT_SCRIPT,
  PUBLIC_SITE_THEME_BOOT_SCRIPT_ID,
  PUBLIC_SITE_THEME_BOOT_STYLE,
  PUBLIC_SITE_THEME_BOOT_STYLE_ID,
  PUBLIC_SITE_THEME_DOCUMENT_ATTRIBUTE,
  PUBLIC_SITE_THEME_SSR_MODE,
  PUBLIC_SITE_THEME_STORAGE_KEY,
  PUBLIC_SITE_THEME_SYSTEM_QUERY,
  renderPublicSiteThemeBootScript,
  renderPublicSiteThemeBootStyle,
  resolvePublicSiteThemeMode,
} from "./public-theme.ts";

describe("public Site theme facts", () => {
  it("defines deterministic SSR and document marker facts", () => {
    expect(PUBLIC_SITE_THEME_SSR_MODE).toBe("light");
    expect(PUBLIC_SITE_THEME_STORAGE_KEY).toBe("formless:public-site:theme");
    expect(PUBLIC_SITE_THEME_SYSTEM_QUERY).toBe("(prefers-color-scheme: dark)");
    expect(publicSiteThemeDocumentMarker("light")).toEqual({
      className: "light",
      colorScheme: "light",
      dataAttribute: PUBLIC_SITE_THEME_DOCUMENT_ATTRIBUTE,
      dataValue: "light",
      style: "color-scheme: light;",
    });
    expect(publicSiteThemeDocumentMarker("dark")).toEqual({
      className: "dark",
      colorScheme: "dark",
      dataAttribute: "data-site-theme",
      dataValue: "dark",
      style: "color-scheme: dark;",
    });
  });

  it("resolves stored light and dark modes ahead of system mode", () => {
    expect(publicSiteThemePreferenceFromStoredValue("light")).toBe("light");
    expect(publicSiteThemePreferenceFromStoredValue("dark")).toBe("dark");
    expect(resolvePublicSiteThemeMode({ storedValue: "light", systemPrefersDark: true })).toBe(
      "light",
    );
    expect(resolvePublicSiteThemeMode({ storedValue: "dark", systemPrefersDark: false })).toBe(
      "dark",
    );
  });

  it("treats missing and invalid storage as system mode", () => {
    expect(publicSiteThemePreferenceFromStoredValue(null)).toBe("system");
    expect(publicSiteThemePreferenceFromStoredValue("sepia")).toBe("system");
    expect(resolvePublicSiteThemeMode({ storedValue: null, systemPrefersDark: true })).toBe("dark");
    expect(resolvePublicSiteThemeMode({ storedValue: "sepia", systemPrefersDark: false })).toBe(
      "light",
    );
    expect(nextPublicSiteThemeMode("light")).toBe("dark");
    expect(nextPublicSiteThemeMode("dark")).toBe("light");
  });

  it("uses configured initial mode and only gives storage precedence when switchable", () => {
    expect(
      resolvePublicSiteThemeMode({
        initialThemeMode: "dark",
        storedValue: null,
        systemPrefersDark: false,
      }),
    ).toBe("dark");
    expect(
      resolvePublicSiteThemeMode({
        initialThemeMode: "light",
        storedValue: "dark",
        systemPrefersDark: true,
        themeSwitchable: false,
      }),
    ).toBe("light");
    expect(
      resolvePublicSiteThemeMode({
        initialThemeMode: "dark",
        storedValue: "light",
        systemPrefersDark: false,
        themeSwitchable: true,
      }),
    ).toBe("light");
  });

  it("shares stored and system behavior with the browser boot script", () => {
    expect(PUBLIC_SITE_THEME_BOOT_SCRIPT).toContain(
      `<script id="${PUBLIC_SITE_THEME_BOOT_SCRIPT_ID}">`,
    );
    expect(PUBLIC_SITE_THEME_BOOT_STYLE).toContain(
      `<style id="${PUBLIC_SITE_THEME_BOOT_STYLE_ID}">`,
    );
    expect(runBootstrap({ storedValue: "light", systemPrefersDark: true })).toEqual({
      classes: ["light"],
      colorScheme: "light",
      dataTheme: "light",
    });
    expect(runBootstrap({ storedValue: null, systemPrefersDark: true })).toEqual({
      classes: ["dark"],
      colorScheme: "dark",
      dataTheme: "dark",
    });
  });

  it("falls back to system mode when storage is unavailable", () => {
    expect(runBootstrap({ storageUnavailable: true, systemPrefersDark: true })).toEqual({
      classes: ["dark"],
      colorScheme: "dark",
      dataTheme: "dark",
    });
    expect(runBootstrap({ storageUnavailable: true, systemPrefersDark: false })).toEqual({
      classes: ["light"],
      colorScheme: "light",
      dataTheme: "light",
    });
  });

  it("generates fixed light and dark bootstraps that ignore visitor storage", () => {
    expect(
      runBootstrap({
        site: siteSettings("#000000", "#FFFFFF", {
          initialThemeMode: "light",
          themeSwitchable: false,
        }),
        storedValue: "dark",
        systemPrefersDark: true,
      }),
    ).toMatchObject({ colorScheme: "light", dataTheme: "light" });
    expect(
      runBootstrap({
        site: siteSettings("#FFFFFF", "#000000", {
          initialThemeMode: "dark",
          themeSwitchable: false,
        }),
        storedValue: "light",
        systemPrefersDark: false,
      }),
    ).toMatchObject({ colorScheme: "dark", dataTheme: "dark" });
  });

  it("maps authored colors to contrast-safe light and dark palettes", () => {
    const light = publicSiteThemePalette(siteSettings("#000000", "#FFFFFF"), "light");
    const dark = publicSiteThemePalette(siteSettings("#FFFFFF", "#000000"), "dark");

    expect(light).toMatchObject({
      accent: "rgb(0 0 0)",
      background: "rgb(255 255 255)",
      link: "rgb(0 0 0)",
      onAccent: "rgb(255 255 255)",
    });
    expect(dark).toMatchObject({
      accent: "rgb(255 255 255)",
      background: "rgb(0 0 0)",
      link: "rgb(255 255 255)",
      onAccent: "rgb(0 0 0)",
    });
  });

  it("uses canonical defaults for invalid authored colors", () => {
    expect(publicSiteThemePalette(siteSettings("not-a-color", "#12"), "light")).toEqual(
      publicSiteThemePalette(undefined, "light"),
    );
    expect(publicSiteThemePalette(siteSettings("javascript:red", "transparent"), "dark")).toEqual(
      publicSiteThemePalette(undefined, "dark"),
    );
  });

  it("uses the authored Site background in the document fallback style", () => {
    const style = renderPublicSiteThemeBootStyle(siteSettings("#000000", "#FFFFFF"));

    expect(style).toContain("background: rgb(255 255 255)");
    expect(style).toContain("background: rgb(107 107 107)");
  });
});

function siteSettings(
  accentColor: string,
  backgroundColor: string,
  theme: Pick<SiteSettingsNode, "initialThemeMode" | "themeSwitchable"> = {},
): SiteSettingsNode {
  return {
    accentColor,
    backgroundColor,
    id: "site:theme-test",
    label: "Theme test",
    ...theme,
  };
}

function runBootstrap(input: {
  site?: SiteSettingsNode;
  storageUnavailable?: boolean;
  storedValue?: string | null;
  systemPrefersDark: boolean;
}) {
  const classes = new Set<string>();
  const dataset: Record<string, string> = {};
  const styles = new Map<string, string>();
  const windowValue = {
    get localStorage() {
      if (input.storageUnavailable) {
        throw new Error("Storage unavailable.");
      }

      return {
        getItem: (key: string) => {
          expect(key).toBe(PUBLIC_SITE_THEME_STORAGE_KEY);
          return input.storedValue ?? null;
        },
      };
    },
    matchMedia: (query: string) => {
      expect(query).toBe(PUBLIC_SITE_THEME_SYSTEM_QUERY);
      return { matches: input.systemPrefersDark };
    },
  };
  const documentValue = {
    documentElement: {
      classList: {
        toggle: (name: string, force: boolean) => {
          if (force) {
            classes.add(name);
          } else {
            classes.delete(name);
          }
        },
      },
      dataset,
      style: {
        setProperty: (name: string, value: string) => styles.set(name, value),
      },
    },
  };
  const source = renderPublicSiteThemeBootScript(input.site)
    .replace(/^<script[^>]*>\n?/, "")
    .replace(/\n?<\/script>$/, "");

  runInNewContext(source, { document: documentValue, window: windowValue });

  return {
    classes: [...classes].sort(),
    colorScheme: styles.get("color-scheme"),
    dataTheme: dataset.siteTheme,
  };
}
