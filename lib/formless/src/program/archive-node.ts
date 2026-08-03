import {
  readInstanceArchiveDirectory as readArchiveDirectory,
  writeInstanceArchiveDirectory as writeArchiveDirectory,
} from "@dpeek/formless-archive/node";
import type { AppSchema } from "@dpeek/formless-schema";
import type { FormlessProgramArtifact } from "./artifact.ts";
import { formlessProgramArchiveSnapshotContract, formlessProgramArtifact } from "./runtime.ts";

export * from "@dpeek/formless-archive/node";

type ReadArchiveDirectoryDependencies = Omit<
  Parameters<typeof readArchiveDirectory>[1],
  "programSnapshotContract"
> & {
  programArtifact?: FormlessProgramArtifact;
  programSchema?: AppSchema;
  programSchemaProvenance?: FormlessProgramArtifact["schemaProvenance"];
};
type WriteArchiveDirectoryInput = Omit<
  Parameters<typeof writeArchiveDirectory>[0],
  "programSnapshotContract"
> & {
  programArtifact?: FormlessProgramArtifact;
  programSchema?: AppSchema;
  programSchemaProvenance?: FormlessProgramArtifact["schemaProvenance"];
};

export async function readInstanceArchiveDirectory(
  archiveDirInput: string,
  dependencies: ReadArchiveDirectoryDependencies,
) {
  const artifact =
    dependencies.programArtifact ??
    (dependencies.programSchema === undefined ? formlessProgramArtifact : undefined);

  return readArchiveDirectory(archiveDirInput, {
    cwd: dependencies.cwd,
    programSnapshotContract: formlessProgramArchiveSnapshotContract({
      artifact,
      schema: dependencies.programSchema,
      schemaProvenance: dependencies.programSchemaProvenance,
    }),
  });
}

export async function writeInstanceArchiveDirectory(
  input: WriteArchiveDirectoryInput,
  dependencies: Parameters<typeof writeArchiveDirectory>[1],
) {
  const artifact =
    input.programArtifact ??
    (input.programSchema === undefined ? formlessProgramArtifact : undefined);

  return writeArchiveDirectory(
    {
      archive: input.archive,
      mediaFiles: input.mediaFiles,
      outDir: input.outDir,
      programSnapshotContract: formlessProgramArchiveSnapshotContract({
        artifact,
        schema: input.programSchema,
        schemaProvenance: input.programSchemaProvenance,
      }),
    },
    dependencies,
  );
}
