import {
  readInstanceWorkspaceProgramStorageSnapshot as readWorkspaceProgramSnapshot,
  writeInstanceWorkspaceProgramStorageSnapshot as writeWorkspaceProgramSnapshot,
} from "@dpeek/formless-workspace/node";
import type { ResolvedFormlessConfig } from "@dpeek/formless-workspace";
import { materializeFormlessProgramSourceArtifact } from "./artifact.ts";
import { formlessProgramWorkspaceSnapshotContract } from "./runtime.ts";
import { formlessProgramDefaultComposition, formlessProgramSourceSchema } from "./schema.ts";
import { loadWorkspaceProgramSharedRuntime } from "../cli/program-runtime-bundler.ts";

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
  const { artifact, sharedRuntime } = await workspaceFormlessProgramValidation(
    input.manifest,
    input.workspaceRoot,
  );

  return readWorkspaceProgramSnapshot({
    ...input,
    programSnapshotContract: formlessProgramWorkspaceSnapshotContract({
      artifact,
      sharedRuntime,
    }),
  });
}

export async function writeInstanceWorkspaceProgramStorageSnapshot(
  input: WriteWorkspaceProgramSnapshotInput,
) {
  const { artifact, sharedRuntime } = await workspaceFormlessProgramValidation(
    input.manifest,
    input.workspaceRoot,
  );

  return writeWorkspaceProgramSnapshot({
    ...input,
    programSnapshotContract: formlessProgramWorkspaceSnapshotContract({
      artifact,
      sharedRuntime,
    }),
  });
}

async function workspaceFormlessProgramValidation(
  manifest: Pick<ResolvedFormlessConfig, "programComposition" | "programSource" | "runtime">,
  workspaceRoot: string,
) {
  const composition = manifest.programComposition ?? formlessProgramDefaultComposition;
  const sourceSchema = manifest.programSource ?? formlessProgramSourceSchema;
  const [artifact, sharedRuntime] = await Promise.all([
    materializeFormlessProgramSourceArtifact(sourceSchema),
    loadWorkspaceProgramSharedRuntime({
      composition,
      config: manifest,
      sourceSchema,
      workspaceRoot,
    }),
  ]);

  return { artifact, sharedRuntime };
}
