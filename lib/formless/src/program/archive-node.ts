import {
  readPortableArchiveDirectory as readArchiveDirectory,
  writePortableArchiveDirectory as writeArchiveDirectory,
} from "@dpeek/formless-archive/node";
import { formlessProgramArchiveSnapshotContract } from "./runtime.ts";

export * from "@dpeek/formless-archive/node";

type ReadArchiveDirectoryDependencies = Omit<
  Parameters<typeof readArchiveDirectory>[1],
  "controlPlaneSnapshotContract"
>;
type WriteArchiveDirectoryInput = Omit<
  Parameters<typeof writeArchiveDirectory>[0],
  "controlPlaneSnapshotContract"
>;

export function readPortableArchiveDirectory(
  archiveDirInput: string,
  dependencies: ReadArchiveDirectoryDependencies,
) {
  return readArchiveDirectory(archiveDirInput, {
    ...dependencies,
    controlPlaneSnapshotContract: formlessProgramArchiveSnapshotContract({
      packageResolver: dependencies.packageResolver,
    }),
  });
}

export function writePortableArchiveDirectory(
  input: WriteArchiveDirectoryInput,
  dependencies: Parameters<typeof writeArchiveDirectory>[1],
) {
  return writeArchiveDirectory(
    {
      ...input,
      controlPlaneSnapshotContract: formlessProgramArchiveSnapshotContract({
        packageResolver: input.packageResolver,
      }),
    },
    dependencies,
  );
}
