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
import type { AppSchema } from "@dpeek/formless-schema";
import {
  formlessProgramArchiveSnapshotContract,
  parseFormlessProgramSchemaArtifact,
} from "./runtime.ts";

export * from "@dpeek/formless-archive";

type LegacyArchiveOptions = Omit<
  ArchiveControlPlaneValidationOptions,
  "controlPlaneSnapshotContract"
> & {
  programSchema?: AppSchema;
};

export function parsePortableArchive(
  value: unknown,
  options: LegacyArchiveOptions = {},
): PortableArchive {
  return parsePortableArchiveWithContract(
    value,
    archiveOptions(options, programSchemaFromArchive(value)),
  );
}

export function parseInstanceArchive(
  value: unknown,
  options: LegacyArchiveOptions = {},
): InstanceArchive {
  return parseInstanceArchiveWithContract(
    value,
    archiveOptions(options, programSchemaFromArchive(value)),
  );
}

export function formatPortableArchive(
  archive: PortableArchive,
  options: LegacyArchiveOptions = {},
): string {
  return formatPortableArchiveWithContract(
    archive,
    archiveOptions(options, programSchemaFromArchive(archive)),
  );
}

export function formatInstanceArchive(
  archive: InstanceArchive,
  options: LegacyArchiveOptions = {},
): string {
  return formatInstanceArchiveWithContract(
    archive,
    archiveOptions(options, programSchemaFromArchive(archive)),
  );
}

export function planPortableArchiveRestore(value: unknown, target: ArchiveRestoreTargetState = {}) {
  return planPortableArchiveRestoreWithContract(
    value,
    restoreTarget(target, programSchemaFromArchive(value)),
  );
}

export function planInstanceArchiveRestore(value: unknown, target: ArchiveRestoreTargetState = {}) {
  return planInstanceArchiveRestoreWithContract(
    value,
    restoreTarget(target, programSchemaFromArchive(value)),
  );
}

function archiveOptions(
  options: LegacyArchiveOptions,
  archiveSchema: AppSchema | undefined,
): ArchiveControlPlaneValidationOptions {
  const { programSchema, ...archiveValidationOptions } = options;

  return {
    ...archiveValidationOptions,
    controlPlaneSnapshotContract: formlessProgramArchiveSnapshotContract({
      schema: programSchema ?? archiveSchema,
    }),
  };
}

function restoreTarget(
  target: ArchiveRestoreTargetState,
  archiveSchema: AppSchema | undefined,
): ArchiveRestoreTargetState {
  return {
    ...target,
    controlPlaneSnapshotContract:
      target.controlPlaneSnapshotContract ??
      formlessProgramArchiveSnapshotContract({
        schema: archiveSchema,
      }),
  };
}

function programSchemaFromArchive(value: unknown): AppSchema | undefined {
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
