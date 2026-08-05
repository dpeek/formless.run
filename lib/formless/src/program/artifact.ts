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
import {
  validateProgramRuntimeComposition,
  type ProgramRuntimeComposition,
} from "./composition.ts";

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
  options: { runtime?: ProgramRuntimeComposition } = {},
): Promise<FormlessProgramArtifact> {
  const sourceSchema = composeAppSchema(composition);
  validateProgramRuntimeComposition({
    composition,
    runtime: options.runtime,
    sourceSchema,
  });
  return materializeFormlessProgramSourceArtifact(sourceSchema);
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

  for (const mount of schema.surfaceMounts ?? []) {
    const reservedRoute = reservedProgramRouteForPath(mount.path);
    if (reservedRoute !== undefined) {
      throw new Error(
        `Formless Program schema surface mount "${mount.key}" path "${mount.path}" overlaps reserved ${reservedRoute.family} route "${reservedRoute.path}".`,
      );
    }
  }

  return schema;
}

const reservedProgramRouteFamilies = [
  { family: "API", path: "/api" },
  { family: "auth and callback", path: "/formless/auth" },
  { family: "local-session", path: "/local-session" },
  { family: "asset", path: "/assets" },
  { family: "asset", path: "/index.html" },
  { family: "development-module", path: "/@fs" },
  { family: "development-module", path: "/@id" },
  { family: "development-module", path: "/@vite" },
  { family: "development-module", path: "/@react-refresh" },
  { family: "development-module", path: "/src" },
  { family: "icon", path: "/favicon.svg" },
  { family: "icon", path: "/favicon.ico" },
  { family: "icon", path: "/apple-touch-icon.png" },
  { family: "indexing", path: "/robots.txt" },
  { family: "indexing", path: "/sitemap.xml" },
] as const;

function reservedProgramRouteForPath(
  pathname: string,
): { family: string; path: string } | undefined {
  const reservedRoute = reservedProgramRouteFamilies.find(({ path }) =>
    pathsOverlap(pathname, path),
  );
  if (reservedRoute !== undefined) {
    return reservedRoute;
  }

  const lastSegment = pathname.split("/").at(-1) ?? "";
  return /\.[a-zA-Z0-9]+$/.test(lastSegment)
    ? { family: "asset", path: "extension-bearing path" }
    : undefined;
}

function pathsOverlap(left: string, right: string): boolean {
  return pathContains(left, right) || pathContains(right, left);
}

function pathContains(base: string, candidate: string): boolean {
  return candidate === base || candidate.startsWith(`${base}/`);
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
