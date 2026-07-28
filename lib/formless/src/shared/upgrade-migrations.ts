import {
  isPackageAppRevision,
  type PackageAppKey,
  type PackageAppRevision,
  type SourceSchemaHash,
} from "@dpeek/formless-installed-apps";
import type { SchemaKey } from "./schema-apps.ts";

export {
  computeSourceSchemaHash,
  isSourceSchemaHash,
  sourceSchemaCanonicalJson,
  type PackageAppRevision,
  type SourceSchemaHash,
} from "@dpeek/formless-installed-apps";

export type UpgradeMigrationId = string;
export type UpgradeMigrationOwner = string;
export type UpgradeMigrationChecksum = `sha256:${string}`;

export const upgradeMigrationSafetyClasses = [
  "auto-safe",
  "auto-with-backup",
  "manual-approval",
] as const;

export type UpgradeMigrationSafetyClass = (typeof upgradeMigrationSafetyClasses)[number];

export type StorageUpgradeMigrationFamily = {
  kind: "storage";
  storageFamily: string;
};

export type PackageAppUpgradeMigrationFamily = {
  kind: "package-app";
  packageAppKey: PackageAppKey;
};

export type RuntimeUpgradeMigrationFamily = {
  kind: "runtime";
  runtimeFamily: string;
};

export type BrowserReplicaUpgradeMigrationFamily = {
  kind: "browser-replica";
  replicaFamily: string;
};

export type ArchiveUpgradeMigrationFamily = {
  archiveFamily: string;
  kind: "archive";
};

export type UpgradeMigrationFamily =
  | StorageUpgradeMigrationFamily
  | PackageAppUpgradeMigrationFamily
  | RuntimeUpgradeMigrationFamily
  | BrowserReplicaUpgradeMigrationFamily
  | ArchiveUpgradeMigrationFamily;

export type UpgradeMigrationApplyEvidence = {
  migrationId: UpgradeMigrationId;
  family: UpgradeMigrationFamily;
  checksum: UpgradeMigrationChecksum;
  owner: UpgradeMigrationOwner;
  safety: UpgradeMigrationSafetyClass;
  summary: string;
  appliedAt: string;
  packageVersion?: string;
  fromPackageRevision?: PackageAppRevision;
  toPackageRevision?: PackageAppRevision;
};

export type UpgradeMigrationApplyContext = {
  dryRun: boolean;
  now: string;
};

export type UpgradeMigrationApplyResult = {
  evidence: UpgradeMigrationApplyEvidence[];
};

export type UpgradeMigrationApply = (
  context: UpgradeMigrationApplyContext,
) => Promise<UpgradeMigrationApplyResult> | UpgradeMigrationApplyResult;

export type UpgradeMigrationBase = {
  id: UpgradeMigrationId;
  owner: UpgradeMigrationOwner;
  family: UpgradeMigrationFamily;
  checksum: UpgradeMigrationChecksum;
  safety: UpgradeMigrationSafetyClass;
  summary: string;
  apply: UpgradeMigrationApply;
};

export type PackageAppUpgradeMigration = Omit<UpgradeMigrationBase, "family"> & {
  family: PackageAppUpgradeMigrationFamily;
  fromPackageRevision: PackageAppRevision;
  toPackageRevision: PackageAppRevision;
};

export type NonPackageAppUpgradeMigration = Omit<UpgradeMigrationBase, "family"> & {
  family:
    | StorageUpgradeMigrationFamily
    | RuntimeUpgradeMigrationFamily
    | BrowserReplicaUpgradeMigrationFamily
    | ArchiveUpgradeMigrationFamily;
  fromPackageRevision?: never;
  toPackageRevision?: never;
};

export type UpgradeMigrationDefinition = NonPackageAppUpgradeMigration | PackageAppUpgradeMigration;

export type UpgradeMigrationRegistry = {
  migrations: readonly UpgradeMigrationDefinition[];
};

export type UpgradeMigrationRegistryErrorCode =
  | "duplicate-migration-id"
  | "invalid-checksum"
  | "invalid-package-revision-range"
  | "invalid-safety-class";

export type UpgradeMigrationRegistryError = {
  code: UpgradeMigrationRegistryErrorCode;
  migrationId: UpgradeMigrationId;
  familyKey: string;
  field?: "checksum" | "fromPackageRevision" | "safety" | "toPackageRevision";
  message: string;
};

export type UpgradeMigrationRegistryValidationResult =
  | {
      ok: true;
      registry: UpgradeMigrationRegistry;
    }
  | {
      ok: false;
      errors: UpgradeMigrationRegistryError[];
    };

const sha256DigestPattern = /^sha256:[a-f0-9]{64}$/;

export const bundledSourceSchemaHashFixtures = {
  tasks: "sha256:2fe579351d0f296f4daefc351f5ea79a0121bfecd591dc7a904832ee2bcfb704",
  site: "sha256:947e27daf748f06aace5e11e69cd81cdc5ded75d7f4a5264416b8c48064cb228",
  crm: "sha256:bc0b0a0ebbb9eecb4bddcd42aa321ccae5680ae3dedcea753bf646607d7f0dac",
} as const satisfies Record<SchemaKey, SourceSchemaHash>;

export function isUpgradeMigrationChecksum(value: unknown): value is UpgradeMigrationChecksum {
  return typeof value === "string" && sha256DigestPattern.test(value);
}

export function isUpgradeMigrationSafetyClass(
  value: unknown,
): value is UpgradeMigrationSafetyClass {
  return (
    typeof value === "string" &&
    upgradeMigrationSafetyClasses.includes(value as UpgradeMigrationSafetyClass)
  );
}

export function createUpgradeMigrationRegistry(
  migrations: readonly UpgradeMigrationDefinition[],
): UpgradeMigrationRegistry {
  const result = validateUpgradeMigrationRegistry(migrations);

  if (!result.ok) {
    throw new Error(
      `Upgrade migration registry is invalid: ${result.errors
        .map((error) => error.message)
        .join(" ")}`,
    );
  }

  return result.registry;
}

export function validateUpgradeMigrationRegistry(
  migrations: readonly UpgradeMigrationDefinition[],
): UpgradeMigrationRegistryValidationResult {
  const errors: UpgradeMigrationRegistryError[] = [];
  const seenMigrationKeys = new Set<string>();

  for (const migration of migrations) {
    const familyKey = upgradeMigrationFamilyKey(migration.family);
    const registryKey = `${familyKey}:${migration.id}`;

    if (seenMigrationKeys.has(registryKey)) {
      errors.push({
        code: "duplicate-migration-id",
        migrationId: migration.id,
        familyKey,
        message: `Migration "${migration.id}" is already registered for family "${familyKey}".`,
      });
    } else {
      seenMigrationKeys.add(registryKey);
    }

    if (!isUpgradeMigrationChecksum(migration.checksum)) {
      errors.push({
        code: "invalid-checksum",
        field: "checksum",
        migrationId: migration.id,
        familyKey,
        message: `Migration "${migration.id}" checksum must use "sha256:" followed by 64 lowercase hex characters.`,
      });
    }

    if (!isUpgradeMigrationSafetyClass(migration.safety)) {
      errors.push({
        code: "invalid-safety-class",
        field: "safety",
        migrationId: migration.id,
        familyKey,
        message: `Migration "${migration.id}" safety class is invalid.`,
      });
    }

    if (isPackageAppUpgradeMigration(migration)) {
      addPackageRevisionRangeErrors(migration, familyKey, errors);
    }
  }

  return errors.length === 0
    ? {
        ok: true,
        registry: {
          migrations: [...migrations],
        },
      }
    : {
        ok: false,
        errors,
      };
}

export function listUpgradeMigrations(
  registry: UpgradeMigrationRegistry,
  family?: UpgradeMigrationFamily,
): UpgradeMigrationDefinition[] {
  if (family === undefined) {
    return [...registry.migrations];
  }

  const familyKey = upgradeMigrationFamilyKey(family);

  return registry.migrations.filter(
    (migration) => upgradeMigrationFamilyKey(migration.family) === familyKey,
  );
}

export function upgradeMigrationFamilyKey(family: UpgradeMigrationFamily): string {
  switch (family.kind) {
    case "archive":
      return `archive:${family.archiveFamily}`;
    case "browser-replica":
      return `browser-replica:${family.replicaFamily}`;
    case "package-app":
      return `package-app:${family.packageAppKey}`;
    case "runtime":
      return `runtime:${family.runtimeFamily}`;
    case "storage":
      return `storage:${family.storageFamily}`;
  }
}

function addPackageRevisionRangeErrors(
  migration: PackageAppUpgradeMigration,
  familyKey: string,
  errors: UpgradeMigrationRegistryError[],
) {
  if (!isPackageAppRevision(migration.fromPackageRevision)) {
    errors.push({
      code: "invalid-package-revision-range",
      field: "fromPackageRevision",
      migrationId: migration.id,
      familyKey,
      message: `Migration "${migration.id}" fromPackageRevision must be a positive integer.`,
    });
  }

  if (!isPackageAppRevision(migration.toPackageRevision)) {
    errors.push({
      code: "invalid-package-revision-range",
      field: "toPackageRevision",
      migrationId: migration.id,
      familyKey,
      message: `Migration "${migration.id}" toPackageRevision must be a positive integer.`,
    });
  }

  if (
    isPackageAppRevision(migration.fromPackageRevision) &&
    isPackageAppRevision(migration.toPackageRevision) &&
    migration.fromPackageRevision >= migration.toPackageRevision
  ) {
    errors.push({
      code: "invalid-package-revision-range",
      field: "toPackageRevision",
      migrationId: migration.id,
      familyKey,
      message: `Migration "${migration.id}" toPackageRevision must be greater than fromPackageRevision.`,
    });
  }
}

function isPackageAppUpgradeMigration(
  migration: UpgradeMigrationDefinition,
): migration is PackageAppUpgradeMigration {
  return migration.family.kind === "package-app";
}
