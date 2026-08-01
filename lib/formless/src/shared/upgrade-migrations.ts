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

export type UpgradeMigrationDefinition = UpgradeMigrationBase;

export type UpgradeMigrationRegistry = {
  migrations: readonly UpgradeMigrationDefinition[];
};

export type UpgradeMigrationRegistryErrorCode =
  | "duplicate-migration-id"
  | "invalid-checksum"
  | "invalid-safety-class";

export type UpgradeMigrationRegistryError = {
  code: UpgradeMigrationRegistryErrorCode;
  migrationId: UpgradeMigrationId;
  familyKey: string;
  field?: "checksum" | "safety";
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
    case "runtime":
      return `runtime:${family.runtimeFamily}`;
    case "storage":
      return `storage:${family.storageFamily}`;
  }
}
