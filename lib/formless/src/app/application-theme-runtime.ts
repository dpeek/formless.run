import type {
  DocumentThemeActiveMode,
  DocumentThemeContract,
  DocumentThemeMode,
  DocumentThemeSelectionControlContract,
} from "@dpeek/formless-presentation/contract";
import { documentThemeReference, isDocumentThemeIntent } from "@dpeek/formless-presentation/host";
import { PUBLIC_SITE_THEME_DOCUMENT_ATTRIBUTE } from "@dpeek/formless-site-app";
import type { ApplicationRuntimeContractPublication } from "./generated/application-runtime-contract-host.tsx";

export const APPLICATION_THEME_STORAGE_KEY = "formless:application:theme";
export const APPLICATION_THEME_SYSTEM_QUERY = "(prefers-color-scheme: dark)";
export const APPLICATION_THEME_DOCUMENT_ATTRIBUTE = "data-formless-application-theme";
export const APPLICATION_THEME_DOCUMENT_DATASET_KEY = "formlessApplicationTheme";
export const APPLICATION_THEME_CONTRIBUTOR_ID = "application-theme";
export const applicationThemeReference = documentThemeReference("theme:application");

export type ApplicationThemeBrowser = {
  applyResolvedMode(mode: DocumentThemeActiveMode): void;
  persistPreference(preference: DocumentThemeMode): void;
  readPreference(): string | null;
  subscribePreference(listener: (storedValue: string | null) => void): () => void;
  subscribeSystemPreference(listener: (prefersDark: boolean) => void): () => void;
  systemPrefersDark(): boolean;
};

export type ApplicationThemeController = {
  destroy(): void;
  getSnapshot(): ApplicationThemeContract;
  reapply(): void;
  selectPreference(preference: DocumentThemeMode): void;
  subscribe(listener: () => void): () => void;
};

export type ApplicationThemeContract = DocumentThemeContract & {
  policy: { kind: "userControlled" };
  selectionControl: DocumentThemeSelectionControlContract;
};

export function applicationThemePreferenceFromStoredValue(
  value: string | null | undefined,
): DocumentThemeMode {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export function resolveApplicationThemeMode(
  preference: DocumentThemeMode,
  systemPrefersDark: boolean,
): DocumentThemeActiveMode {
  return preference === "system" ? (systemPrefersDark ? "dark" : "light") : preference;
}

export function projectApplicationTheme(
  preference: DocumentThemeMode,
  activeMode: DocumentThemeActiveMode,
): ApplicationThemeContract {
  const controlId = "control:application-theme";
  const option = (mode: DocumentThemeMode, label: string) => ({
    label,
    mode,
    selectionIntent: {
      controlId,
      mode,
      themeId: applicationThemeReference.themeId,
      type: "documentThemeModeSelection" as const,
    },
  });

  return {
    activeMode,
    id: applicationThemeReference.themeId,
    kind: "documentTheme",
    policy: { kind: "userControlled" },
    selectionControl: {
      accessibilityLabel: "Theme mode",
      id: controlId,
      kind: "documentThemeSelectionControl",
      options: [option("system", "System"), option("light", "Light"), option("dark", "Dark")],
      selectedMode: preference,
    },
  };
}

export function createApplicationThemeController(
  browser: ApplicationThemeBrowser,
): ApplicationThemeController {
  let preference = applicationThemePreferenceFromStoredValue(browser.readPreference());
  let systemPrefersDark = browser.systemPrefersDark();
  let snapshot = projectApplicationTheme(
    preference,
    resolveApplicationThemeMode(preference, systemPrefersDark),
  );
  const listeners = new Set<() => void>();

  browser.applyResolvedMode(snapshot.activeMode);

  const unsubscribePreference = browser.subscribePreference((storedValue) => {
    update(applicationThemePreferenceFromStoredValue(storedValue), systemPrefersDark);
  });
  const unsubscribeSystemPreference = browser.subscribeSystemPreference((prefersDark) => {
    systemPrefersDark = prefersDark;
    if (preference === "system") {
      update(preference, systemPrefersDark);
    }
  });

  return {
    destroy: () => {
      unsubscribePreference();
      unsubscribeSystemPreference();
      listeners.clear();
    },
    getSnapshot: () => snapshot,
    reapply: () => browser.applyResolvedMode(snapshot.activeMode),
    selectPreference: (nextPreference) => {
      browser.persistPreference(nextPreference);
      update(nextPreference, systemPrefersDark);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  function update(nextPreference: DocumentThemeMode, nextSystemPrefersDark: boolean) {
    const activeMode = resolveApplicationThemeMode(nextPreference, nextSystemPrefersDark);
    if (nextPreference === preference && activeMode === snapshot.activeMode) {
      return;
    }

    preference = nextPreference;
    snapshot = projectApplicationTheme(preference, activeMode);
    browser.applyResolvedMode(activeMode);
    for (const listener of listeners) {
      listener();
    }
  }
}

export function applicationThemeRuntimePublication(
  controller: ApplicationThemeController,
): ApplicationRuntimeContractPublication {
  const snapshot = controller.getSnapshot();
  const controlId = snapshot.selectionControl.id;

  return {
    intentHandlers: [
      {
        dispatch: (intent) => {
          if (
            isDocumentThemeIntent(intent) &&
            intent.themeId === applicationThemeReference.themeId &&
            intent.controlId === controlId
          ) {
            controller.selectPreference(intent.mode);
          }
        },
        matches: (intent) =>
          isDocumentThemeIntent(intent) && intent.themeId === applicationThemeReference.themeId,
      },
    ],
    nodes: [{ reference: applicationThemeReference, snapshot }],
  };
}

export function bootstrapBrowserApplicationTheme(
  browser: ApplicationThemeBrowser = browserApplicationTheme(),
): DocumentThemeActiveMode {
  const preference = applicationThemePreferenceFromStoredValue(browser.readPreference());
  const activeMode = resolveApplicationThemeMode(preference, browser.systemPrefersDark());
  browser.applyResolvedMode(activeMode);
  return activeMode;
}

export function browserApplicationTheme(): ApplicationThemeBrowser {
  const mediaQuery = window.matchMedia(APPLICATION_THEME_SYSTEM_QUERY);

  return {
    applyResolvedMode: (mode) => {
      const root = document.documentElement;
      root.dataset[APPLICATION_THEME_DOCUMENT_DATASET_KEY] = mode;
      if (!root.hasAttribute(PUBLIC_SITE_THEME_DOCUMENT_ATTRIBUTE)) {
        root.style.setProperty("color-scheme", mode);
      }
    },
    persistPreference: (preference) => {
      try {
        window.localStorage.setItem(APPLICATION_THEME_STORAGE_KEY, preference);
      } catch {
        // The in-memory preference remains usable when browser storage is unavailable.
      }
    },
    readPreference: () => {
      try {
        return window.localStorage.getItem(APPLICATION_THEME_STORAGE_KEY);
      } catch {
        return null;
      }
    },
    subscribePreference: (listener) => {
      const onStorage = (event: StorageEvent) => {
        if (event.key === APPLICATION_THEME_STORAGE_KEY) {
          listener(event.newValue);
        }
      };
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    },
    subscribeSystemPreference: (listener) => {
      const onChange = (event: MediaQueryListEvent) => listener(event.matches);
      mediaQuery.addEventListener("change", onChange);
      return () => mediaQuery.removeEventListener("change", onChange);
    },
    systemPrefersDark: () => mediaQuery.matches,
  };
}
