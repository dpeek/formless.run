import {
  readInstanceWorkspaceProgramStorageSnapshot as readWorkspaceProgramSnapshot,
  writeInstanceWorkspaceProgramStorageSnapshot as writeWorkspaceProgramSnapshot,
} from "@dpeek/formless-workspace/node";
import type { ResolvedFormlessConfig } from "@dpeek/formless-workspace";
import { materializeFormlessProgramSourceArtifact } from "./artifact.ts";
import { formlessProgramWorkspaceSnapshotContract } from "./runtime.ts";
import { formlessProgramSourceSchema } from "./schema.ts";

export * from "@dpeek/formless-workspace/node";

type ReadWorkspaceProgramSnapshotInput = Omit<
  Parameters<typeof readWorkspaceProgramSnapshot>[0],
  "programSnapshotContract"
>;

type WriteWorkspaceProgramSnapshotInput = Omit<
  Parameters<typeof writeWorkspaceProgramSnapshot>[0],
  "programSnapshotContract"
>;

export async function readInstanceWorkspaceProgramStorageSnapshot(
  input: ReadWorkspaceProgramSnapshotInput,
) {
  const artifact = await workspaceFormlessProgramArtifact(input.manifest);

  return readWorkspaceProgramSnapshot({
    ...input,
    programSnapshotContract: formlessProgramWorkspaceSnapshotContract({
      artifact,
    }),
  });
}

export async function writeInstanceWorkspaceProgramStorageSnapshot(
  input: WriteWorkspaceProgramSnapshotInput,
) {
  const artifact = await workspaceFormlessProgramArtifact(input.manifest);

  return writeWorkspaceProgramSnapshot({
    ...input,
    programSnapshotContract: formlessProgramWorkspaceSnapshotContract({
      artifact,
    }),
  });
}

function workspaceFormlessProgramArtifact(manifest: Pick<ResolvedFormlessConfig, "programSource">) {
  return materializeFormlessProgramSourceArtifact(
    manifest.programSource ?? formlessProgramSourceSchema,
  );
}
