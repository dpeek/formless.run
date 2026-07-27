import {
  createContext,
  createElement,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  nextPublicSiteThemeMode,
  publicSiteInitialThemePreference,
  publicSiteThemeDocumentMarker,
  publicSiteThemeSsrMode,
  publicSiteThemeSwitchable,
  PUBLIC_SITE_THEME_DOCUMENT_DATASET_KEY,
  PUBLIC_SITE_THEME_RELEASE_EVENT,
  PUBLIC_SITE_THEME_STORAGE_KEY,
  PUBLIC_SITE_THEME_SYSTEM_QUERY,
  resolvePublicSiteThemeMode,
  type PublicSiteThemeMode,
} from "../public-theme.ts";
import type { SiteSettingsNode } from "../types.ts";

export type PublicSiteThemeController = {
  mode: PublicSiteThemeMode;
  switchable: boolean;
  toggleMode: () => void;
};

const PublicSiteThemeContext = createContext<PublicSiteThemeController | undefined>(undefined);

export function PublicSiteThemeProvider({
  children,
  site,
}: {
  children: ReactNode;
  site?: SiteSettingsNode;
}) {
  const initialThemeMode = publicSiteInitialThemePreference(site);
  const switchable = publicSiteThemeSwitchable(site);
  const [mode, setMode] = useState<PublicSiteThemeMode>(() => publicSiteThemeSsrMode(site));

  useLayoutEffect(() => {
    const documentSnapshot = captureBrowserDocumentTheme();
    const resolvedMode = resolveBrowserSiteThemeMode(site);
    applyBrowserSiteThemeMode(resolvedMode);
    setMode(resolvedMode);

    return () => {
      restoreBrowserDocumentTheme(documentSnapshot);
      dispatchPublicSiteThemeRelease();
    };
  }, [initialThemeMode, switchable]);

  const controller = useMemo<PublicSiteThemeController>(
    () => ({
      mode,
      switchable,
      toggleMode: () => {
        if (!switchable) {
          return;
        }

        setMode((current) => {
          const next = nextPublicSiteThemeMode(current);
          persistBrowserSiteThemeMode(next);
          applyBrowserSiteThemeMode(next);
          return next;
        });
      },
    }),
    [mode, switchable],
  );

  return createElement(PublicSiteThemeContext.Provider, { value: controller }, children);
}

export function usePublicSiteTheme(): PublicSiteThemeController {
  const theme = useContext(PublicSiteThemeContext);

  if (!theme) {
    throw new Error("Public Site theme requires a PublicSiteThemeProvider.");
  }

  return theme;
}

export function resolveBrowserSiteThemeMode(site?: SiteSettingsNode): PublicSiteThemeMode {
  if (typeof window === "undefined") {
    return publicSiteThemeSsrMode(site);
  }

  return resolvePublicSiteThemeMode({
    initialThemeMode: publicSiteInitialThemePreference(site),
    storedValue: publicSiteThemeSwitchable(site) ? readStoredSiteThemeValue() : null,
    systemPrefersDark: browserSystemPrefersDark(),
    themeSwitchable: publicSiteThemeSwitchable(site),
  });
}

function readStoredSiteThemeValue(): string | null {
  try {
    return window.localStorage.getItem(PUBLIC_SITE_THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

function browserSystemPrefersDark(): boolean {
  try {
    return window.matchMedia?.(PUBLIC_SITE_THEME_SYSTEM_QUERY).matches ?? false;
  } catch {
    return false;
  }
}

export function applyBrowserSiteThemeMode(mode: PublicSiteThemeMode) {
  if (typeof document === "undefined") {
    return;
  }

  const marker = publicSiteThemeDocumentMarker(mode);
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
  root.classList.toggle("light", mode === "light");
  root.dataset[PUBLIC_SITE_THEME_DOCUMENT_DATASET_KEY] = marker.dataValue;
  root.style.setProperty("color-scheme", marker.colorScheme);
}

export function persistBrowserSiteThemeMode(mode: PublicSiteThemeMode) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(PUBLIC_SITE_THEME_STORAGE_KEY, mode);
  } catch {
    // Storage can be unavailable in locked-down browsers; the in-memory theme still works.
  }
}

type BrowserDocumentThemeSnapshot = {
  colorScheme: string;
  darkClass: boolean;
  lightClass: boolean;
  siteTheme: string | undefined;
};

function captureBrowserDocumentTheme(): BrowserDocumentThemeSnapshot | undefined {
  if (typeof document === "undefined") {
    return undefined;
  }

  const root = document.documentElement;
  return {
    colorScheme: root.style.getPropertyValue("color-scheme"),
    darkClass: root.classList.contains("dark"),
    lightClass: root.classList.contains("light"),
    siteTheme: root.dataset[PUBLIC_SITE_THEME_DOCUMENT_DATASET_KEY],
  };
}

function restoreBrowserDocumentTheme(snapshot: BrowserDocumentThemeSnapshot | undefined) {
  if (typeof document === "undefined" || !snapshot) {
    return;
  }

  const root = document.documentElement;
  root.classList.toggle("dark", snapshot.darkClass);
  root.classList.toggle("light", snapshot.lightClass);

  if (snapshot.siteTheme === undefined) {
    delete root.dataset[PUBLIC_SITE_THEME_DOCUMENT_DATASET_KEY];
  } else {
    root.dataset[PUBLIC_SITE_THEME_DOCUMENT_DATASET_KEY] = snapshot.siteTheme;
  }

  if (snapshot.colorScheme) {
    root.style.setProperty("color-scheme", snapshot.colorScheme);
  } else {
    root.style.removeProperty("color-scheme");
  }
}

function dispatchPublicSiteThemeRelease() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PUBLIC_SITE_THEME_RELEASE_EVENT));
  }
}
