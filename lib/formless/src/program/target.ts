import type { SourceSchemaHash } from "@dpeek/formless-schema";

export const FORMLESS_PROGRAM_SCHEMA_KEY = "formless-program";
export const FORMLESS_PROGRAM_STORAGE_IDENTITY = "instance:control-plane";
export const FORMLESS_PROGRAM_API_ROUTE_PREFIX = "/api/formless/program";
export const FORMLESS_PROGRAM_BROWSER_STORAGE_NAME = "formless:instance:control-plane";
export const FORMLESS_PROGRAM_SOURCE_SCHEMA_HASH =
  "sha256:3a3a31e391714ced139b20cd8b2c68f7ee17747d6afaacbf6a6936154d702246" satisfies SourceSchemaHash;

export const formlessProgramTarget = {
  kind: "program",
  schemaKey: FORMLESS_PROGRAM_SCHEMA_KEY,
  authorityName: FORMLESS_PROGRAM_STORAGE_IDENTITY,
  apiRoutePrefix: FORMLESS_PROGRAM_API_ROUTE_PREFIX,
  browserDatabaseName: FORMLESS_PROGRAM_BROWSER_STORAGE_NAME,
  broadcastChannelName: FORMLESS_PROGRAM_BROWSER_STORAGE_NAME,
} as const;

export type FormlessProgramTarget = typeof formlessProgramTarget;
