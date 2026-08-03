import type { SourceSchemaHash } from "@dpeek/formless-schema";

export const FORMLESS_PROGRAM_SCHEMA_KEY = "formless-program";
export const FORMLESS_PROGRAM_STORAGE_IDENTITY = "instance:control-plane";
export const FORMLESS_PROGRAM_API_ROUTE_PREFIX = "/api/formless/program";
export const FORMLESS_PROGRAM_BROWSER_STORAGE_NAME = "formless:instance:control-plane";
export const FORMLESS_PROGRAM_SOURCE_SCHEMA_HASH =
  "sha256:351361fd94e75cbc62cbf992b33bfde9770ab2e4a342764b4ecd024131fcb723" satisfies SourceSchemaHash;

export const formlessProgramTarget = {
  kind: "program",
  schemaKey: FORMLESS_PROGRAM_SCHEMA_KEY,
  authorityName: FORMLESS_PROGRAM_STORAGE_IDENTITY,
  apiRoutePrefix: FORMLESS_PROGRAM_API_ROUTE_PREFIX,
  browserDatabaseName: FORMLESS_PROGRAM_BROWSER_STORAGE_NAME,
  broadcastChannelName: FORMLESS_PROGRAM_BROWSER_STORAGE_NAME,
} as const;

export type FormlessProgramTarget = typeof formlessProgramTarget;
