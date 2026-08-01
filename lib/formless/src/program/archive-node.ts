import {
  readPortableArchiveDirectory as readArchiveDirectory,
  writePortableArchiveDirectory as writeArchiveDirectory,
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
};
type WriteArchiveDirectoryInput = Omit<
  Parameters<typeof writeArchiveDirectory>[0],
  "programSnapshotContract"
> & {
  programArtifact?: FormlessProgramArtifact;
  programSchema?: AppSchema;
};

export async function readPortableArchiveDirectory(
  archiveDirInput: string,
  dependencies: ReadArchiveDirectoryDependencies,
) {
  const artifact = dependencies.programArtifact ?? formlessProgramArtifact;

  return readArchiveDirectory(archiveDirInput, {
    cwd: dependencies.cwd,
    programSnapshotContract: formlessProgramArchiveSnapshotContract({
      artifact,
      schema: dependencies.programSchema,
    }),
  });
}

export async function writePortableArchiveDirectory(
  input: WriteArchiveDirectoryInput,
  dependencies: Parameters<typeof writeArchiveDirectory>[1],
) {
  const artifact = input.programArtifact ?? formlessProgramArtifact;

  return writeArchiveDirectory(
    {
      archive: input.archive,
      mediaFiles: input.mediaFiles,
      outDir: input.outDir,
      programSnapshotContract: formlessProgramArchiveSnapshotContract({
        artifact,
        schema: input.programSchema,
      }),
    },
    dependencies,
  );
}
