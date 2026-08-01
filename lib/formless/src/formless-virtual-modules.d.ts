declare module "virtual:formless/site-public-renderer/browser" {
  import type { SitePublicRendererComponent } from "@dpeek/formless-site-app";

  export const sitePublicRenderer: SitePublicRendererComponent | undefined;
}

declare module "virtual:formless/site-public-renderer/worker" {
  import type { SitePublicRendererComponent } from "@dpeek/formless-site-app/worker";

  export const sitePublicRenderer: SitePublicRendererComponent | undefined;
}

declare module "virtual:formless/program-runtime/shared" {
  import type { ProgramSharedRuntimeDefinition } from "@dpeek/formless/program";

  export const programSharedRuntime: ProgramSharedRuntimeDefinition;
}

declare module "virtual:formless/program-runtime/browser" {
  import type { ProgramBrowserRuntimeDefinition } from "@dpeek/formless/program";

  export const programBrowserRuntime: ProgramBrowserRuntimeDefinition;
}

declare module "virtual:formless/program-runtime/worker" {
  import type { ProgramWorkerRuntimeDefinition } from "@dpeek/formless/program";

  export const programWorkerRuntime: ProgramWorkerRuntimeDefinition;
}

interface ImportMetaEnv extends Record<string, string | boolean | undefined> {
  readonly VITE_FORMLESS_RUNTIME_PROFILE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
