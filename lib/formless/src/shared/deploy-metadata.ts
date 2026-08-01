export const FORMLESS_DEPLOY_METADATA_PATH = "/api/formless/deploy";
export const FORMLESS_RUNTIME_PROTOCOL_VERSION = 1;
export const FORMLESS_STORAGE_MIGRATION_SET_ID = "formless-storage-migrations:v1";

export type FormlessDeployMetadata = {
  packageVersion: string | null;
  runtimeProtocolVersion: number;
  storageMigrationSet: string;
  version: string | null;
};
