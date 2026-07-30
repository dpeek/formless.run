import {
  formatInstanceArchive as formatInstanceArchiveWithContract,
  formatPortableArchive as formatPortableArchiveWithContract,
  parseInstanceArchive as parseInstanceArchiveWithContract,
  parsePortableArchive as parsePortableArchiveWithContract,
  planInstanceArchiveRestore as planInstanceArchiveRestoreWithContract,
  planPortableArchiveRestore as planPortableArchiveRestoreWithContract,
  type ArchiveControlPlaneValidationOptions,
  type ArchiveRestoreTargetState,
  type InstanceArchive,
  type PortableArchive,
} from "@dpeek/formless-archive";
import { formlessProgramArchiveSnapshotContract } from "./runtime.ts";

export * from "@dpeek/formless-archive";

type LegacyArchiveOptions = Omit<
  ArchiveControlPlaneValidationOptions,
  "controlPlaneSnapshotContract"
>;

export function parsePortableArchive(
  value: unknown,
  options: LegacyArchiveOptions = {},
): PortableArchive {
  return parsePortableArchiveWithContract(value, archiveOptions(options));
}

export function parseInstanceArchive(
  value: unknown,
  options: LegacyArchiveOptions = {},
): InstanceArchive {
  return parseInstanceArchiveWithContract(value, archiveOptions(options));
}

export function formatPortableArchive(
  archive: PortableArchive,
  options: LegacyArchiveOptions = {},
): string {
  return formatPortableArchiveWithContract(archive, archiveOptions(options));
}

export function formatInstanceArchive(
  archive: InstanceArchive,
  options: LegacyArchiveOptions = {},
): string {
  return formatInstanceArchiveWithContract(archive, archiveOptions(options));
}

export function planPortableArchiveRestore(value: unknown, target: ArchiveRestoreTargetState = {}) {
  return planPortableArchiveRestoreWithContract(value, restoreTarget(target));
}

export function planInstanceArchiveRestore(value: unknown, target: ArchiveRestoreTargetState = {}) {
  return planInstanceArchiveRestoreWithContract(value, restoreTarget(target));
}

function archiveOptions(options: LegacyArchiveOptions): ArchiveControlPlaneValidationOptions {
  return {
    ...options,
    controlPlaneSnapshotContract: formlessProgramArchiveSnapshotContract({
      packageResolver: options.packageResolver,
    }),
  };
}

function restoreTarget(target: ArchiveRestoreTargetState): ArchiveRestoreTargetState {
  return {
    ...target,
    controlPlaneSnapshotContract:
      target.controlPlaneSnapshotContract ??
      formlessProgramArchiveSnapshotContract({
        packageResolver: target.packageResolver,
      }),
  };
}
