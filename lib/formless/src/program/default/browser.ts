import { defineProgramBrowserRuntime } from "../composition.ts";
import { sitePublicBrowserSurfaceDefinition } from "@dpeek/formless-site-app/runtime/browser";
import { SITE_PREVIEW_BROWSER_MOUNT_KEY } from "@dpeek/formless-site-app/schema";

export const formlessProgramDefaultBrowserRuntime = defineProgramBrowserRuntime({
  target: "browser",
  projections: [],
  surfaces: [sitePublicBrowserSurfaceDefinition],
  mounts: [
    {
      target: "browser",
      mountKey: SITE_PREVIEW_BROWSER_MOUNT_KEY,
      surfaceKey: sitePublicBrowserSurfaceDefinition.key,
    },
  ],
});

export default formlessProgramDefaultBrowserRuntime;
