import { defineProgramBrowserRuntime } from "@dpeek/formless/program";
import { workspaceRuntimeEntityId } from "./program.ts";
import { workspaceBrowserBundleMarker } from "./browser-adapter.ts";

export const workspaceBrowserProjection = {
  target: "browser",
  kind: "projection",
  key: "workspace.browser",
  entityIds: [workspaceRuntimeEntityId],
  project: () => workspaceBrowserBundleMarker,
} as const;

export default defineProgramBrowserRuntime({
  target: "browser",
  projections: [workspaceBrowserProjection],
  surfaces: [],
  mounts: [],
});
