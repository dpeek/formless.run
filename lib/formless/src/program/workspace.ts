import {
  readInstanceWorkspaceControlPlaneStorageSnapshot as readWorkspaceControlPlaneSnapshot,
  writeInstanceWorkspaceControlPlaneStorageSnapshot as writeWorkspaceControlPlaneSnapshot,
} from "@dpeek/formless-workspace/node";
import { formlessProgramWorkspaceSnapshotContract } from "./runtime.ts";

export * from "@dpeek/formless-workspace/node";

type ReadWorkspaceControlPlaneSnapshotInput = Omit<
  Parameters<typeof readWorkspaceControlPlaneSnapshot>[0],
  "controlPlaneSnapshotContract"
>;

type WriteWorkspaceControlPlaneSnapshotInput = Omit<
  Parameters<typeof writeWorkspaceControlPlaneSnapshot>[0],
  "controlPlaneSnapshotContract"
>;

export function readInstanceWorkspaceControlPlaneStorageSnapshot(
  input: ReadWorkspaceControlPlaneSnapshotInput,
) {
  return readWorkspaceControlPlaneSnapshot({
    ...input,
    controlPlaneSnapshotContract: formlessProgramWorkspaceSnapshotContract({
      packageResolver: input.packageResolver,
    }),
  });
}

export function writeInstanceWorkspaceControlPlaneStorageSnapshot(
  input: WriteWorkspaceControlPlaneSnapshotInput,
) {
  return writeWorkspaceControlPlaneSnapshot({
    ...input,
    controlPlaneSnapshotContract: formlessProgramWorkspaceSnapshotContract({
      packageResolver: input.packageResolver,
    }),
  });
}
