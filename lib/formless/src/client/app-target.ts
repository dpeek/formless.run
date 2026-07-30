import {
  programStorageIdentity,
  schemaKeyStorageIdentity,
  type AppStorageIdentity,
  type ProgramStorageIdentity,
} from "../shared/app-storage-identity.ts";
import { findSchemaAppDefinition, type SchemaKey } from "../shared/schema-apps.ts";
import { FORMLESS_PROGRAM_SCHEMA_KEY } from "../program/target.ts";

export type ClientAppSchemaKey = string;
export type ClientAppStorageIdentity = AppStorageIdentity | ProgramStorageIdentity;
export type ClientAppTarget = SchemaKey | ClientAppStorageIdentity;

export function appStorageIdentityForClientTarget(
  target: ClientAppTarget,
): ClientAppStorageIdentity {
  return typeof target === "string" ? schemaKeyStorageIdentity(target) : target;
}

export function clientTargetStorageName(target: ClientAppTarget): string {
  return appStorageIdentityForClientTarget(target).browserDatabaseName;
}

export function clientTargetSourceSchemaKey(target: ClientAppTarget): ClientAppSchemaKey {
  const identity = appStorageIdentityForClientTarget(target);

  return identity.kind === "program" ? identity.schemaKey : identity.sourceSchemaKey;
}

export function clientTargetLabel(target: ClientAppTarget): string {
  return clientSchemaKeyLabel(clientTargetSourceSchemaKey(target));
}

export function clientSchemaKeyLabel(schemaKey: ClientAppSchemaKey): string {
  if (schemaKey === FORMLESS_PROGRAM_SCHEMA_KEY) {
    return "Formless Program";
  }

  return findSchemaAppDefinition(schemaKey)?.label ?? schemaKey;
}

export function programClientTarget(): ProgramStorageIdentity {
  return programStorageIdentity();
}

export function clientTargetForSchemaKey(schemaKey: ClientAppSchemaKey): ClientAppTarget {
  if (schemaKey === FORMLESS_PROGRAM_SCHEMA_KEY) {
    return programClientTarget();
  }

  if (findSchemaAppDefinition(schemaKey)) {
    return schemaKey as SchemaKey;
  }

  throw new Error(`No bundled client target for schema key "${schemaKey}".`);
}
