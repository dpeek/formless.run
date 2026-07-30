import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vite-plus/test";

import type { SiteSettingsNode } from "./types.ts";
import {
  nextPublicSiteThemeMode,
  publicSiteThemeDocumentMarker,
  publicSiteThemePreferenceFromStoredValue,
  PUBLIC_SITE_THEME_BOOT_SCRIPT,
  PUBLIC_SITE_THEME_BOOT_SCRIPT_ID,
  PUBLIC_SITE_THEME_DOCUMENT_ATTRIBUTE,
  PUBLIC_SITE_THEME_RENDERER_MODE_ATTRIBUTE,
  PUBLIC_SITE_THEME_SSR_MODE,
  PUBLIC_SITE_THEME_STORAGE_KEY,
  PUBLIC_SITE_THEME_SYSTEM_QUERY,
  renderPublicSiteThemeBootScript,
  resolvePublicSiteThemeMode,
} from "./public-theme.ts";

describe("public Site theme facts", () => {
  it("defines deterministic SSR and document marker facts", () => {
    expect(PUBLIC_SITE_THEME_SSR_MODE).toBe("light");
    expect(PUBLIC_SITE_THEME_STORAGE_KEY).toBe("formless:public-site:theme");
    expect(PUBLIC_SITE_THEME_SYSTEM_QUERY).toBe("(prefers-color-scheme: dark)");
    expect(publicSiteThemeDocumentMarker("light")).toEqual({
      colorScheme: "light",
      dataAttribute: PUBLIC_SITE_THEME_DOCUMENT_ATTRIBUTE,
      dataValue: "light",
      rendererModeAttribute: PUBLIC_SITE_THEME_RENDERER_MODE_ATTRIBUTE,
      rendererModeValue: "light",
      style: "color-scheme: light;",
    });
    expect(publicSiteThemeDocumentMarker("dark")).toEqual({
      colorScheme: "dark",
      dataAttribute: "data-site-theme",
      dataValue: "dark",
      rendererModeAttribute: "data-theme",
      rendererModeValue: "dark",
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
    expect(runBootstrap({ storedValue: "light", systemPrefersDark: true })).toEqual({
      colorScheme: "light",
      rendererMode: "light",
      dataTheme: "light",
    });
    expect(runBootstrap({ storedValue: null, systemPrefersDark: true })).toEqual({
      colorScheme: "dark",
      rendererMode: "dark",
      dataTheme: "dark",
    });
  });

  it("falls back to system mode when storage is unavailable", () => {
    expect(runBootstrap({ storageUnavailable: true, systemPrefersDark: true })).toEqual({
      colorScheme: "dark",
      rendererMode: "dark",
      dataTheme: "dark",
    });
    expect(runBootstrap({ storageUnavailable: true, systemPrefersDark: false })).toEqual({
      colorScheme: "light",
      rendererMode: "light",
      dataTheme: "light",
    });
  });

  it("generates fixed light and dark bootstraps that ignore visitor storage", () => {
    expect(
      runBootstrap({
        site: siteSettings({
          initialThemeMode: "light",
          themeSwitchable: false,
        }),
        storedValue: "dark",
        systemPrefersDark: true,
      }),
    ).toMatchObject({ colorScheme: "light", dataTheme: "light" });
    expect(
      runBootstrap({
        site: siteSettings({
          initialThemeMode: "dark",
          themeSwitchable: false,
        }),
        storedValue: "light",
        systemPrefersDark: false,
      }),
    ).toMatchObject({ colorScheme: "dark", dataTheme: "dark" });
  });
});

function siteSettings(
  theme: Pick<SiteSettingsNode, "initialThemeMode" | "themeSwitchable"> = {},
): SiteSettingsNode {
  return {
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
    colorScheme: styles.get("color-scheme"),
    dataTheme: dataset.siteTheme,
    rendererMode: dataset.theme,
  };
}
