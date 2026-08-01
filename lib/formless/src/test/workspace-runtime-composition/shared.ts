import {
  defineProgramSharedRuntime,
  type ProgramSharedRecordAdapterInput,
} from "@dpeek/formless/program";
import { workspaceRuntimeEntityId } from "./program.ts";
import { workspaceSharedBundleMarker } from "./shared-adapter.ts";

export const workspaceRecordAdapter = {
  target: "shared",
  kind: "record-adapter",
  key: "workspace.record",
  entityIds: [workspaceRuntimeEntityId],
  adapter: {
    canonicalize: ({ records }: ProgramSharedRecordAdapterInput) => records,
    validate: (_context: string, { records }: ProgramSharedRecordAdapterInput) => {
      if (records.some((record) => record.values.label === "rejected-by-workspace-adapter")) {
        throw new Error("Workspace record adapter rejected snapshot records.");
      }
    },
    validateCandidate: () => undefined,
  },
  bundleMarker: workspaceSharedBundleMarker,
} as const;

export default defineProgramSharedRuntime({
  target: "shared",
  recordAdapters: [workspaceRecordAdapter],
  operationAdapters: [],
  bootstrapContributions: [],
  createIdContributions: [],
});
