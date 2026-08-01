import {
  programStorageIdentity,
  type ProgramStorageIdentity,
} from "../shared/program-storage-identity.ts";
import { FORMLESS_PROGRAM_SCHEMA_KEY } from "../program/target.ts";

export type ProgramClientSchemaKey = typeof FORMLESS_PROGRAM_SCHEMA_KEY;
export type ProgramClientTarget = ProgramStorageIdentity;

export function programStorageIdentityForClientTarget(
  target: ProgramClientTarget,
): ProgramStorageIdentity {
  return target;
}

export function clientTargetStorageName(target: ProgramClientTarget): string {
  return programStorageIdentityForClientTarget(target).browserDatabaseName;
}

export function clientTargetSourceSchemaKey(target: ProgramClientTarget): ProgramClientSchemaKey {
  return programStorageIdentityForClientTarget(target).schemaKey;
}

export function clientTargetLabel(target: ProgramClientTarget): string {
  return clientSchemaKeyLabel(clientTargetSourceSchemaKey(target));
}

export function clientSchemaKeyLabel(schemaKey: ProgramClientSchemaKey): string {
  void schemaKey;
  return "Formless Program";
}

export function programClientTarget(): ProgramStorageIdentity {
  return programStorageIdentity();
}
