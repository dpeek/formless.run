import {
  formatInstanceArchive as formatInstanceArchiveWithContract,
  formatPortableArchive as formatPortableArchiveWithContract,
  parseInstanceArchive as parseInstanceArchiveWithContract,
  parsePortableArchive as parsePortableArchiveWithContract,
  planInstanceArchiveRestore as planInstanceArchiveRestoreWithContract,
  planPortableArchiveRestore as planPortableArchiveRestoreWithContract,
  type ArchiveProgramValidationOptions,
  type ArchiveRestoreTargetState,
  type InstanceArchive,
  type PortableArchive,
} from "@dpeek/formless-archive";
import type { AppSchema } from "@dpeek/formless-schema";
import type { FormlessProgramArtifact } from "./artifact.ts";
import { formlessProgramArchiveSnapshotContract } from "./runtime.ts";

export * from "@dpeek/formless-archive";

type ProgramArchiveOptions = {
  programArtifact?: FormlessProgramArtifact;
  programSchema?: AppSchema;
};

export function parsePortableArchive(
  value: unknown,
  options: ProgramArchiveOptions = {},
): PortableArchive {
  return parsePortableArchiveWithContract(value, archiveOptions(options));
}

export function parseInstanceArchive(
  value: unknown,
  options: ProgramArchiveOptions = {},
): InstanceArchive {
  return parseInstanceArchiveWithContract(value, archiveOptions(options));
}

export function formatPortableArchive(
  archive: PortableArchive,
  options: ProgramArchiveOptions = {},
): string {
  return formatPortableArchiveWithContract(archive, archiveOptions(options));
}

export function formatInstanceArchive(
  archive: InstanceArchive,
  options: ProgramArchiveOptions = {},
): string {
  return formatInstanceArchiveWithContract(archive, archiveOptions(options));
}

export function planPortableArchiveRestore(value: unknown, target: ArchiveRestoreTargetState = {}) {
  return planPortableArchiveRestoreWithContract(value, restoreTarget(target));
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
