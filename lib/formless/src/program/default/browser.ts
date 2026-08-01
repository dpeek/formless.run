import { defineProgramBrowserRuntime } from "../composition.ts";
import { sitePublicBrowserSurfaceDefinition } from "@dpeek/formless-site-app/runtime/browser";

export const formlessProgramDefaultBrowserRuntime = defineProgramBrowserRuntime({
  target: "browser",
  projections: [],
  surfaces: [sitePublicBrowserSurfaceDefinition],
});

export default formlessProgramDefaultBrowserRuntime;
