import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  PORTABLE_ARCHIVE_MANIFEST_FILE,
  readPortableArchiveDirectory as readArchiveDirectory,
  writePortableArchiveDirectory as writeArchiveDirectory,
} from "@dpeek/formless-archive/node";
import type { AppSchema } from "@dpeek/formless-schema";
import {
  formlessProgramArchiveSnapshotContract,
  parseFormlessProgramSchemaArtifact,
} from "./runtime.ts";

export * from "@dpeek/formless-archive/node";

type ReadArchiveDirectoryDependencies = Omit<
  Parameters<typeof readArchiveDirectory>[1],
  "controlPlaneSnapshotContract"
> & {
  programSchema?: AppSchema;
};
type WriteArchiveDirectoryInput = Omit<
  Parameters<typeof writeArchiveDirectory>[0],
  "controlPlaneSnapshotContract"
> & {
  programSchema?: AppSchema;
};

export async function readPortableArchiveDirectory(
  archiveDirInput: string,
  dependencies: ReadArchiveDirectoryDependencies,
) {
  const { programSchema, ...archiveDependencies } = dependencies;
  const activeSchema = programSchema ?? (await programSchemaFromArchiveDirectory(archiveDirInput));

  return readArchiveDirectory(archiveDirInput, {
    ...archiveDependencies,
    controlPlaneSnapshotContract: formlessProgramArchiveSnapshotContract({
      packageResolver: dependencies.packageResolver,
      schema: activeSchema,
    }),
  });
}

export function writePortableArchiveDirectory(
  input: WriteArchiveDirectoryInput,
  dependencies: Parameters<typeof writeArchiveDirectory>[1],
) {
  const { programSchema, ...archiveInput } = input;

  return writeArchiveDirectory(
    {
      ...archiveInput,
      controlPlaneSnapshotContract: formlessProgramArchiveSnapshotContract({
        packageResolver: input.packageResolver,
        schema:
          programSchema ??
          ("controlPlane" in input.archive
            ? parseFormlessProgramSchemaArtifact(input.archive.controlPlane?.schema)
            : undefined),
      }),
    },
    dependencies,
  );
}

async function programSchemaFromArchiveDirectory(
  archiveDirInput: string,
): Promise<AppSchema | undefined> {
  const value = JSON.parse(
    await readFile(path.join(archiveDirInput, PORTABLE_ARCHIVE_MANIFEST_FILE), "utf8"),
  ) as unknown;

  if (
    typeof value !== "object" ||
    value === null ||
    !("controlPlane" in value) ||
    typeof value.controlPlane !== "object" ||
    value.controlPlane === null ||
    !("schema" in value.controlPlane)
  ) {
    return undefined;
  }

  return parseFormlessProgramSchemaArtifact(value.controlPlane.schema);
}
