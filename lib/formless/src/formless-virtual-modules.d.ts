declare module "virtual:formless/site-public-renderer/browser" {
  import type { SitePublicRendererComponent } from "@dpeek/formless-site-app";

  export const sitePublicRenderer: SitePublicRendererComponent | undefined;
}

declare module "virtual:formless/site-public-renderer/worker" {
  import type { SitePublicRendererComponent } from "@dpeek/formless-site-app/worker";

  export const sitePublicRenderer: SitePublicRendererComponent | undefined;
}

interface ImportMetaEnv extends Record<string, string | boolean | undefined> {
  readonly VITE_FORMLESS_RUNTIME_PROFILE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
