import {
  canonicalJsonStringify,
  computeSourceSchemaHash,
  isSourceSchemaHash,
  type SourceSchemaHash,
} from "@dpeek/formless-schema";
import {
  composeAppSchema,
  formatAppSchemaSource,
  parseAppSchema,
  type AppSchema,
  type AppSchemaSource,
} from "@dpeek/formless-schema";
import type { FormlessProgramComposition } from "@dpeek/formless-workspace";

export const FORMLESS_PROGRAM_ARTIFACT_KIND = "formless-program";
export const FORMLESS_PROGRAM_ARTIFACT_VERSION = 1;
export const FORMLESS_PROGRAM_ARTIFACT_FILE = "formless-program.json";
export const FORMLESS_PROGRAM_ARTIFACT_PATH_ENV_NAME = "FORMLESS_WORKSPACE_PROGRAM_ARTIFACT_PATH";
export const FORMLESS_PROGRAM_ARTIFACT_DEFINE_NAME = "__FORMLESS_PROGRAM_ARTIFACT_JSON__";

export type FormlessProgramArtifact = {
  kind: typeof FORMLESS_PROGRAM_ARTIFACT_KIND;
  version: typeof FORMLESS_PROGRAM_ARTIFACT_VERSION;
  sourceSchema: AppSchemaSource;
  schemaProvenance: {
    kind: "program";
    sourceSchemaHash: SourceSchemaHash;
  };
};

export async function materializeFormlessProgramArtifact(
  composition: FormlessProgramComposition,
): Promise<FormlessProgramArtifact> {
  return materializeFormlessProgramSourceArtifact(composeAppSchema(composition));
}

export async function materializeFormlessProgramSourceArtifact(
  value: unknown,
): Promise<FormlessProgramArtifact> {
  const sourceSchema = canonicalFormlessProgramSourceSchema(value);
  const sourceSchemaHash = await computeSourceSchemaHash(sourceSchema);

  return {
    kind: FORMLESS_PROGRAM_ARTIFACT_KIND,
    version: FORMLESS_PROGRAM_ARTIFACT_VERSION,
    sourceSchema,
    schemaProvenance: {
      kind: "program",
      sourceSchemaHash,
    },
  };
}

export async function parseFormlessProgramArtifact(
  value: unknown,
): Promise<FormlessProgramArtifact> {
  const artifact = parseFormlessProgramArtifactData(value);
  const sourceSchemaHash = await computeSourceSchemaHash(artifact.sourceSchema);

  if (artifact.schemaProvenance.sourceSchemaHash !== sourceSchemaHash) {
    throw new Error(
      `Formless Program artifact source schema hash "${artifact.schemaProvenance.sourceSchemaHash}" does not match "${sourceSchemaHash}".`,
    );
  }

  return artifact;
}

export function parseFormlessProgramArtifactData(value: unknown): FormlessProgramArtifact {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["kind", "schemaProvenance", "sourceSchema", "version"])
  ) {
    throw new Error("Formless Program artifact must contain exact artifact fields.");
  }
  if (value.kind !== FORMLESS_PROGRAM_ARTIFACT_KIND) {
    throw new Error(`Formless Program artifact kind must be "${FORMLESS_PROGRAM_ARTIFACT_KIND}".`);
  }
  if (value.version !== FORMLESS_PROGRAM_ARTIFACT_VERSION) {
    throw new Error(
      `Formless Program artifact version must be ${FORMLESS_PROGRAM_ARTIFACT_VERSION}.`,
    );
  }
  if (
    !isRecord(value.schemaProvenance) ||
    !hasExactKeys(value.schemaProvenance, ["kind", "sourceSchemaHash"]) ||
    value.schemaProvenance.kind !== "program" ||
    !isSourceSchemaHash(value.schemaProvenance.sourceSchemaHash)
  ) {
    throw new Error("Formless Program artifact schemaProvenance is invalid.");
  }

  const sourceSchema = canonicalFormlessProgramSourceSchema(value.sourceSchema);

  return {
    kind: FORMLESS_PROGRAM_ARTIFACT_KIND,
    version: FORMLESS_PROGRAM_ARTIFACT_VERSION,
    sourceSchema,
    schemaProvenance: {
      kind: "program",
      sourceSchemaHash: value.schemaProvenance.sourceSchemaHash,
    },
  };
}

export function formatFormlessProgramArtifact(artifact: FormlessProgramArtifact): string {
  return `${canonicalJsonStringify(artifact, 2)}\n`;
}

export function parseFormlessProgramSourceSchema(value: unknown): AppSchema {
  const schema = parseAppSchema(value);

  for (const screen of schema.screens) {
    if (screen.access === undefined) {
      throw new Error(
        `Formless Program schema screen "${screen.key}" must declare explicit access.`,
      );
    }
  }

  return schema;
}

function canonicalFormlessProgramSourceSchema(value: unknown): AppSchemaSource {
  parseFormlessProgramSourceSchema(value);
  return JSON.parse(formatAppSchemaSource(value as AppSchemaSource)) as AppSchemaSource;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actualKeys = Object.keys(value);
  return actualKeys.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
