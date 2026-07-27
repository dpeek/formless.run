import type { SiteSettingsNode } from "./types.ts";

export const PUBLIC_SITE_THEME_STORAGE_KEY = "formless:public-site:theme";
export const PUBLIC_SITE_THEME_SYSTEM_QUERY = "(prefers-color-scheme: dark)";
export const PUBLIC_SITE_THEME_DOCUMENT_ATTRIBUTE = "data-site-theme";
export const PUBLIC_SITE_THEME_DOCUMENT_DATASET_KEY = "siteTheme";
export const PUBLIC_SITE_THEME_BOOT_SCRIPT_ID = "formless-public-site-theme";
export const PUBLIC_SITE_THEME_BOOT_STYLE_ID = "formless-public-site-theme-style";
export const PUBLIC_SITE_THEME_SSR_MODE: PublicSiteThemeMode = "light";
export const PUBLIC_SITE_THEME_RELEASE_EVENT = "formless:public-site-theme-release";

export type PublicSiteThemeMode = "light" | "dark";
export type PublicSiteThemePreference = PublicSiteThemeMode | "system";

export type PublicSiteThemeDocumentMarker = {
  className: PublicSiteThemeMode;
  colorScheme: PublicSiteThemeMode;
  dataAttribute: typeof PUBLIC_SITE_THEME_DOCUMENT_ATTRIBUTE;
  dataValue: PublicSiteThemeMode;
  style: string;
};

export type PublicSiteThemePalette = {
  accent: string;
  background: string;
  focus: string;
  link: string;
  linkDecoration: string;
  onAccent: string;
};

type Rgb = {
  r: number;
  g: number;
  b: number;
};

const DEFAULT_ACCENT_COLOR = "#C98A2E";
const DEFAULT_BACKGROUND_COLOR = "#09090B";
const BLACK: Rgb = { r: 0, g: 0, b: 0 };
const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const MINIMUM_LINK_CONTRAST = 4.5;
const hexColorPattern = /^#?(?:[a-f\d]{3}|[a-f\d]{4}|[a-f\d]{6}|[a-f\d]{8})$/i;

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
    className: mode,
    colorScheme: mode,
    dataAttribute: PUBLIC_SITE_THEME_DOCUMENT_ATTRIBUTE,
    dataValue: mode,
    style: `color-scheme: ${mode};`,
  };
}

export function publicSiteThemePalette(
  site: SiteSettingsNode | undefined,
  mode: PublicSiteThemeMode,
): PublicSiteThemePalette {
  const accent = parseHexColor(site?.accentColor) ?? parseHexColor(DEFAULT_ACCENT_COLOR)!;
  const authoredBackground =
    parseHexColor(site?.backgroundColor) ?? parseHexColor(DEFAULT_BACKGROUND_COLOR)!;
  const background =
    mode === "dark" ? darkCanvas(authoredBackground) : lightCanvas(authoredBackground);
  const link = readableAccent(accent, background);

  return {
    accent: rgbCss(link),
    background: rgbCss(background),
    focus: rgbaCss(link, 0.45),
    link: rgbCss(link),
    linkDecoration: rgbaCss(link, 0.35),
    onAccent: rgbCss(readableForeground(link)),
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

  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme === "light");
  root.dataset.${PUBLIC_SITE_THEME_DOCUMENT_DATASET_KEY} = theme;
  root.style.setProperty("color-scheme", theme);
})();
</script>`;
}

export function renderPublicSiteThemeBootStyle(site: SiteSettingsNode | undefined): string {
  const lightPalette = publicSiteThemePalette(site, "light");
  const darkPalette = publicSiteThemePalette(site, "dark");

  return `<style id="${PUBLIC_SITE_THEME_BOOT_STYLE_ID}">
html.light,
html.light body {
  background: ${lightPalette.background};
  color: #09090b;
  color-scheme: light;
}

html.dark,
html.dark body,
html.dark #app,
html.dark [data-site-theme] {
  background: ${darkPalette.background};
  color: #f4f4f5;
  color-scheme: dark;
}
</style>`;
}

export const PUBLIC_SITE_THEME_BOOT_SCRIPT = renderPublicSiteThemeBootScript(undefined);
export const PUBLIC_SITE_THEME_BOOT_STYLE = renderPublicSiteThemeBootStyle(undefined);

function parseHexColor(value: string | undefined): Rgb | undefined {
  if (!value || !hexColorPattern.test(value.trim())) {
    return undefined;
  }

  const clean = expandHexColor(value).replace("#", "");

  return {
    r: Number.parseInt(clean.slice(0, 2), 16),
    g: Number.parseInt(clean.slice(2, 4), 16),
    b: Number.parseInt(clean.slice(4, 6), 16),
  };
}

function expandHexColor(value: string): string {
  const clean = value.trim().replace(/^#/, "");

  if (clean.length === 3 || clean.length === 4) {
    return `#${clean
      .slice(0, 3)
      .split("")
      .map((part) => `${part}${part}`)
      .join("")
      .toUpperCase()}`;
  }

  return `#${clean.slice(0, 6).toUpperCase()}`;
}

function lightCanvas(background: Rgb): Rgb {
  return relativeLuminance(background) > 0.82 ? background : mix(background, WHITE, 0.97);
}

function darkCanvas(background: Rgb): Rgb {
  return relativeLuminance(background) < 0.08 ? background : mix(background, BLACK, 0.58);
}

function readableAccent(accent: Rgb, canvas: Rgb): Rgb {
  if (contrastRatio(accent, canvas) >= MINIMUM_LINK_CONTRAST) {
    return accent;
  }

  const target = relativeLuminance(canvas) > relativeLuminance(accent) ? BLACK : WHITE;

  for (let amount = 0.08; amount <= 1; amount += 0.08) {
    const candidate = mix(accent, target, amount);

    if (contrastRatio(candidate, canvas) >= MINIMUM_LINK_CONTRAST) {
      return candidate;
    }
  }

  return contrastRatio(BLACK, canvas) > contrastRatio(WHITE, canvas) ? BLACK : WHITE;
}

function readableForeground(background: Rgb): Rgb {
  return contrastRatio(BLACK, background) >= contrastRatio(WHITE, background) ? BLACK : WHITE;
}

function mix(from: Rgb, to: Rgb, amount: number): Rgb {
  return {
    r: Math.round(from.r + (to.r - from.r) * amount),
    g: Math.round(from.g + (to.g - from.g) * amount),
    b: Math.round(from.b + (to.b - from.b) * amount),
  };
}

function contrastRatio(a: Rgb, b: Rgb): number {
  const light = Math.max(relativeLuminance(a), relativeLuminance(b));
  const dark = Math.min(relativeLuminance(a), relativeLuminance(b));

  return (light + 0.05) / (dark + 0.05);
}

function relativeLuminance(color: Rgb): number {
  const [r, g, b] = [color.r, color.g, color.b].map((channel) => {
    const value = channel / 255;

    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function rgbCss(color: Rgb): string {
  return `rgb(${color.r} ${color.g} ${color.b})`;
}

function rgbaCss(color: Rgb, alpha: number): string {
  return `rgb(${color.r} ${color.g} ${color.b} / ${alpha})`;
}
