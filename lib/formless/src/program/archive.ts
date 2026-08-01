import {
  formatInstanceArchive as formatInstanceArchiveWithContract,
  parseInstanceArchive as parseInstanceArchiveWithContract,
  planInstanceArchiveRestore as planInstanceArchiveRestoreWithContract,
  type ArchiveProgramValidationOptions,
  type ArchiveRestoreTargetState,
  type InstanceArchive,
} from "@dpeek/formless-archive";
import type { AppSchema } from "@dpeek/formless-schema";
import type { FormlessProgramArtifact } from "./artifact.ts";
import { formlessProgramArchiveSnapshotContract } from "./runtime.ts";

export * from "@dpeek/formless-archive";

type ProgramArchiveOptions = {
  programArtifact?: FormlessProgramArtifact;
  programSchema?: AppSchema;
};

export function parseInstanceArchive(
  value: unknown,
  options: ProgramArchiveOptions = {},
): InstanceArchive {
  return parseInstanceArchiveWithContract(value, archiveOptions(options));
}

export function formatInstanceArchive(
  archive: InstanceArchive,
  options: ProgramArchiveOptions = {},
): string {
  return formatInstanceArchiveWithContract(archive, archiveOptions(options));
}

export function planInstanceArchiveRestore(value: unknown, target: ArchiveRestoreTargetState = {}) {
  return planInstanceArchiveRestoreWithContract(value, restoreTarget(target));
}

function archiveOptions(options: ProgramArchiveOptions): ArchiveProgramValidationOptions {
  return {
    programSnapshotContract: formlessProgramArchiveSnapshotContract({
      artifact: options.programArtifact,
      schema: options.programSchema,
    }),
  };
}

function restoreTarget(target: ArchiveRestoreTargetState): ArchiveRestoreTargetState {
  return {
    ...target,
    programSnapshotContract:
      target.programSnapshotContract ?? formlessProgramArchiveSnapshotContract(),
  };
}
