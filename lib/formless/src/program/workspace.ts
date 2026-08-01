import {
  readInstanceWorkspaceControlPlaneStorageSnapshot as readWorkspaceControlPlaneSnapshot,
  writeInstanceWorkspaceControlPlaneStorageSnapshot as writeWorkspaceControlPlaneSnapshot,
} from "@dpeek/formless-workspace/node";
import type { ResolvedFormlessConfig } from "@dpeek/formless-workspace";
import { materializeFormlessProgramSourceArtifact } from "./artifact.ts";
import { formlessProgramWorkspaceSnapshotContract } from "./runtime.ts";
import { formlessProgramSourceSchema } from "./schema.ts";

export * from "@dpeek/formless-workspace/node";

type ReadWorkspaceControlPlaneSnapshotInput = Omit<
  Parameters<typeof readWorkspaceControlPlaneSnapshot>[0],
  "controlPlaneSnapshotContract"
>;

type WriteWorkspaceControlPlaneSnapshotInput = Omit<
  Parameters<typeof writeWorkspaceControlPlaneSnapshot>[0],
  "controlPlaneSnapshotContract"
>;

export async function readInstanceWorkspaceControlPlaneStorageSnapshot(
  input: ReadWorkspaceControlPlaneSnapshotInput,
) {
  const artifact = await workspaceFormlessProgramArtifact(input.manifest);

  return readWorkspaceControlPlaneSnapshot({
    ...input,
    controlPlaneSnapshotContract: formlessProgramWorkspaceSnapshotContract({
      artifact,
    }),
  });
}

export async function writeInstanceWorkspaceControlPlaneStorageSnapshot(
  input: WriteWorkspaceControlPlaneSnapshotInput,
) {
  const artifact = await workspaceFormlessProgramArtifact(input.manifest);

  return writeWorkspaceControlPlaneSnapshot({
    ...input,
    controlPlaneSnapshotContract: formlessProgramWorkspaceSnapshotContract({
      artifact,
    }),
  });
}

function workspaceFormlessProgramArtifact(manifest: Pick<ResolvedFormlessConfig, "programSource">) {
  return materializeFormlessProgramSourceArtifact(
    manifest.programSource ?? formlessProgramSourceSchema,
  );
}
