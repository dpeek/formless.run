export const FORMLESS_DEPLOY_METADATA_PATH = "/api/formless/deploy";
export const FORMLESS_RUNTIME_PROTOCOL_VERSION = 1;
export const FORMLESS_STORAGE_MIGRATION_SET_ID = "formless-storage-migrations:v1";

export type FormlessDeployMetadata = {
  packageVersion: string | null;
  runtimeProtocolVersion: number;
  schemaProvenance: {
    kind: "program";
    sourceSchemaHash: SourceSchemaHash;
  };
  storageMigrationSet: string;
  version: string | null;
};
import type { SourceSchemaHash } from "@dpeek/formless-schema";
