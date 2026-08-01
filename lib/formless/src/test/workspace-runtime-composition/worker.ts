import { defineProgramWorkerRuntime } from "@dpeek/formless/program";
import { workspaceRuntimeEntityId } from "./program.ts";
import { workspaceWorkerBundleMarker } from "./worker-adapter.ts";

export const workspaceWorkerRead = {
  target: "worker",
  kind: "public-read",
  key: "workspace.worker",
  entityIds: [workspaceRuntimeEntityId],
  read: () => workspaceWorkerBundleMarker,
} as const;

export default defineProgramWorkerRuntime({
  target: "worker",
  publicReads: [workspaceWorkerRead],
  surfaces: [],
  afterCommit: [],
});
