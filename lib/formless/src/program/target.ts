import type { SourceSchemaHash } from "@dpeek/formless-installed-apps";

export const FORMLESS_PROGRAM_SCHEMA_KEY = "formless-program";
export const FORMLESS_PROGRAM_STORAGE_IDENTITY = "instance:control-plane";
export const FORMLESS_PROGRAM_API_ROUTE_PREFIX = "/api/formless/program";
export const FORMLESS_PROGRAM_BROWSER_STORAGE_NAME = "formless:instance:control-plane";
export const FORMLESS_PROGRAM_SOURCE_SCHEMA_HASH =
  "sha256:5498a3e7e90e0bb131a5bd907c085a846440c987b98692127533c608281f89d2" satisfies SourceSchemaHash;

export const formlessProgramSchemaProvenance = {
  kind: "program",
  sourceSchemaHash: FORMLESS_PROGRAM_SOURCE_SCHEMA_HASH,
} as const;

export const formlessProgramTarget = {
  kind: "program",
  schemaKey: FORMLESS_PROGRAM_SCHEMA_KEY,
  authorityName: FORMLESS_PROGRAM_STORAGE_IDENTITY,
  apiRoutePrefix: FORMLESS_PROGRAM_API_ROUTE_PREFIX,
  browserDatabaseName: FORMLESS_PROGRAM_BROWSER_STORAGE_NAME,
  broadcastChannelName: FORMLESS_PROGRAM_BROWSER_STORAGE_NAME,
} as const;

export type FormlessProgramTarget = typeof formlessProgramTarget;
