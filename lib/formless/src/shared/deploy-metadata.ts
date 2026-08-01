export const FORMLESS_DEPLOY_METADATA_PATH = "/api/formless/deploy";
export const FORMLESS_RUNTIME_PROTOCOL_VERSION = 1;
export const FORMLESS_STORAGE_MIGRATION_SET_ID = "formless-storage-migrations:v1";

export type FormlessBundleDigest = `sha256:${string}`;

export type FormlessDeployMetadata = {
  bundleDigest?: FormlessBundleDigest;
  packageVersion: string | null;
  runtimeProtocolVersion: number;
  schemaProvenance: {
    kind: "program";
    sourceSchemaHash: SourceSchemaHash;
  };
  storageMigrationSet: string;
  version: string | null;
};

export function parseFormlessBundleDigest(context: string, value: unknown): FormlessBundleDigest {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${context} must be a sha256 bundle digest.`);
  }

  return value as FormlessBundleDigest;
}
import type { SourceSchemaHash } from "@dpeek/formless-schema";
