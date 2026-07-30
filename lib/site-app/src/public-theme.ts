import type { SiteSettingsNode } from "./types.ts";

export const PUBLIC_SITE_THEME_STORAGE_KEY = "formless:public-site:theme";
export const PUBLIC_SITE_THEME_SYSTEM_QUERY = "(prefers-color-scheme: dark)";
export const PUBLIC_SITE_THEME_DOCUMENT_ATTRIBUTE = "data-site-theme";
export const PUBLIC_SITE_THEME_DOCUMENT_DATASET_KEY = "siteTheme";
export const PUBLIC_SITE_THEME_RENDERER_MODE_ATTRIBUTE = "data-theme";
export const PUBLIC_SITE_THEME_RENDERER_MODE_DATASET_KEY = "theme";
export const PUBLIC_SITE_THEME_BOOT_SCRIPT_ID = "formless-public-site-theme";
export const PUBLIC_SITE_THEME_SSR_MODE: PublicSiteThemeMode = "light";
export const PUBLIC_SITE_THEME_RELEASE_EVENT = "formless:public-site-theme-release";

export type PublicSiteThemeMode = "light" | "dark";
export type PublicSiteThemePreference = PublicSiteThemeMode | "system";

export type PublicSiteThemeDocumentMarker = {
  colorScheme: PublicSiteThemeMode;
  dataAttribute: typeof PUBLIC_SITE_THEME_DOCUMENT_ATTRIBUTE;
  dataValue: PublicSiteThemeMode;
  rendererModeAttribute: typeof PUBLIC_SITE_THEME_RENDERER_MODE_ATTRIBUTE;
  rendererModeValue: PublicSiteThemeMode;
  style: string;
};

export function publicSiteThemePreferenceFromStoredValue(
  value: string | null | undefined,
): PublicSiteThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

export function resolvePublicSiteThemeMode(input: {
  initialThemeMode?: PublicSiteThemePreference;
  storedValue?: string | null;
  systemPrefersDark: boolean;
  themeSwitchable?: boolean;
}): PublicSiteThemeMode {
  const configuredPreference = publicSiteThemePreferenceFromStoredValue(input.initialThemeMode);
  const storedPreference = publicSiteThemePreferenceFromStoredValue(input.storedValue);
  const preference =
    (input.themeSwitchable ?? true) && storedPreference !== "system"
      ? storedPreference
      : configuredPreference;

  if (preference !== "system") {
    return preference;
  }

  return input.systemPrefersDark ? "dark" : "light";
}

export function publicSiteInitialThemePreference(
  site: SiteSettingsNode | undefined,
): PublicSiteThemePreference {
  return publicSiteThemePreferenceFromStoredValue(site?.initialThemeMode);
}

export function publicSiteThemeSwitchable(site: SiteSettingsNode | undefined): boolean {
  return site?.themeSwitchable ?? true;
}

export function publicSiteThemeSsrMode(site: SiteSettingsNode | undefined): PublicSiteThemeMode {
  return resolvePublicSiteThemeMode({
    initialThemeMode: publicSiteInitialThemePreference(site),
    systemPrefersDark: false,
    themeSwitchable: false,
  });
}

export function nextPublicSiteThemeMode(mode: PublicSiteThemeMode): PublicSiteThemeMode {
  return mode === "dark" ? "light" : "dark";
}

export function publicSiteThemeDocumentMarker(
  mode: PublicSiteThemeMode,
): PublicSiteThemeDocumentMarker {
  return {
    colorScheme: mode,
    dataAttribute: PUBLIC_SITE_THEME_DOCUMENT_ATTRIBUTE,
    dataValue: mode,
    rendererModeAttribute: PUBLIC_SITE_THEME_RENDERER_MODE_ATTRIBUTE,
    rendererModeValue: mode,
    style: `color-scheme: ${mode};`,
  };
}

export function renderPublicSiteThemeBootScript(site: SiteSettingsNode | undefined): string {
  const initialThemeMode = publicSiteInitialThemePreference(site);
  const themeSwitchable = publicSiteThemeSwitchable(site);

  return `<script id="${PUBLIC_SITE_THEME_BOOT_SCRIPT_ID}">
(() => {
  const storageKey = ${JSON.stringify(PUBLIC_SITE_THEME_STORAGE_KEY)};
  const root = document.documentElement;
  const switchable = ${JSON.stringify(themeSwitchable)};
  let preference = ${JSON.stringify(initialThemeMode)};

  if (switchable) {
    try {
      const stored = window.localStorage.getItem(storageKey);

      if (stored === "dark" || stored === "light") {
        preference = stored;
      }
    } catch {}
  }

  let theme = preference === "system" ? "light" : preference;
  if (preference === "system") {
    try {
      if (window.matchMedia?.(${JSON.stringify(PUBLIC_SITE_THEME_SYSTEM_QUERY)}).matches) {
        theme = "dark";
      } else {
        theme = "light";
      }
    } catch {}
  }

  root.dataset.${PUBLIC_SITE_THEME_DOCUMENT_DATASET_KEY} = theme;
  root.dataset.${PUBLIC_SITE_THEME_RENDERER_MODE_DATASET_KEY} = theme;
  root.style.setProperty("color-scheme", theme);
})();
</script>`;
}

export const PUBLIC_SITE_THEME_BOOT_SCRIPT = renderPublicSiteThemeBootScript(undefined);
