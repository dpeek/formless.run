import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import type {
  PublicSiteThemeMode,
  SitePublicRendererDocumentTheme,
} from "@dpeek/formless-site-app";
import type { ReactNode } from "react";

export type FormlessSiteRendererProviderProps = {
  children: ReactNode;
  mode: PublicSiteThemeMode;
};

export const FORMLESS_SITE_RENDERER_DOCUMENT_THEME = {
  attribute: "data-astryx-theme",
  value: neutralTheme.name,
} as const satisfies SitePublicRendererDocumentTheme;

export function FormlessSiteRendererProvider({
  children,
  mode,
}: FormlessSiteRendererProviderProps) {
  return (
    <Theme theme={neutralTheme} mode={mode}>
      <div data-astryx-public-site-provider data-formless-native-navigation data-site-theme={mode}>
        {children}
      </div>
    </Theme>
  );
}
