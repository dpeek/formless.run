import { describe, expect, it } from "vite-plus/test";
import rawCrmSourceSchema from "@dpeek/formless-crm-app/schema.json";
import rawSiteSourceSchema from "@dpeek/formless-site-app/schema.json";
import rawTaskSourceSchema from "@dpeek/formless-tasks-app/schema.json";
import {
  bundledSourceSchemaHashFixtures,
  computeSourceSchemaHash,
  createUpgradeMigrationRegistry,
  isSourceSchemaHash,
  isUpgradeMigrationSafetyClass,
  listUpgradeMigrations,
  sourceSchemaCanonicalJson,
  upgradeMigrationFamilyKey,
  validateUpgradeMigrationRegistry,
  type PackageAppUpgradeMigration,
  type UpgradeMigrationApply,
  type UpgradeMigrationDefinition,
} from "./upgrade-migrations.ts";

const checksumOne = "sha256:1111111111111111111111111111111111111111111111111111111111111111";
const checksumTwo = "sha256:2222222222222222222222222222222222222222222222222222222222222222";
const checksumThree = "sha256:3333333333333333333333333333333333333333333333333333333333333333";

const noopApply: UpgradeMigrationApply = () => ({ evidence: [] });

describe("upgrade migration contracts", () => {
  it("hashes source schemas from stable canonical JSON", async () => {
    expect(sourceSchemaCanonicalJson({ b: 2, a: { d: 4, c: 3 } })).toBe(
      '{"a":{"c":3,"d":4},"b":2}',
    );
    expect(sourceSchemaCanonicalJson({ a: 1, b: [2, { d: 4, c: 3 }] })).toBe(
      sourceSchemaCanonicalJson({ b: [2, { c: 3, d: 4 }], a: 1 }),
    );

    await expect(computeSourceSchemaHash(rawTaskSourceSchema)).resolves.toBe(
      bundledSourceSchemaHashFixtures.tasks,
    );
    expect(bundledSourceSchemaHashFixtures.tasks).toBe(
      "sha256:2fe579351d0f296f4daefc351f5ea79a0121bfecd591dc7a904832ee2bcfb704",
    );
    await expect(computeSourceSchemaHash(rawSiteSourceSchema)).resolves.toBe(
      bundledSourceSchemaHashFixtures.site,
    );
    await expect(computeSourceSchemaHash(rawCrmSourceSchema)).resolves.toBe(
      bundledSourceSchemaHashFixtures.crm,
    );
    expect(isSourceSchemaHash(bundledSourceSchemaHashFixtures.tasks)).toBe(true);
    expect(isSourceSchemaHash(bundledSourceSchemaHashFixtures.site)).toBe(true);
    expect(isSourceSchemaHash(bundledSourceSchemaHashFixtures.crm)).toBe(true);
  });

  it("keeps registry order and filters by migration family", () => {
    const authorityOne = storageMigration({
      checksum: checksumOne,
      id: "2026-05-01-authority-records",
    });
    const sitePackage = packageAppMigration({
      checksum: checksumTwo,
      id: "2026-05-02-site-schema",
    });
    const authorityTwo = storageMigration({
      checksum: checksumThree,
      id: "2026-05-03-authority-indexes",
    });
    const registry = createUpgradeMigrationRegistry([authorityOne, sitePackage, authorityTwo]);

    expect(listUpgradeMigrations(registry).map((migration) => migration.id)).toEqual([
      "2026-05-01-authority-records",
      "2026-05-02-site-schema",
      "2026-05-03-authority-indexes",
    ]);
    expect(
      listUpgradeMigrations(registry, { kind: "storage", storageFamily: "authority" }).map(
        (migration) => migration.id,
      ),
    ).toEqual(["2026-05-01-authority-records", "2026-05-03-authority-indexes"]);
    expect(upgradeMigrationFamilyKey(sitePackage.family)).toBe("package-app:site");
  });

  it("rejects duplicate ids within the same family only", () => {
    const duplicate = validateUpgradeMigrationRegistry([
      storageMigration({ id: "2026-05-01-add-columns" }),
      storageMigration({ id: "2026-05-01-add-columns" }),
    ]);
    const sameIdDifferentFamily = validateUpgradeMigrationRegistry([
      storageMigration({ id: "2026-05-01-add-columns" }),
      packageAppMigration({ id: "2026-05-01-add-columns" }),
    ]);

    expect(duplicate.ok).toBe(false);
    expect(duplicate.ok ? [] : duplicate.errors.map((error) => error.code)).toContain(
      "duplicate-migration-id",
    );
    expect(sameIdDifferentFamily.ok).toBe(true);
  });

  it("preserves checksums and rejects bad checksum shapes", () => {
    const registry = createUpgradeMigrationRegistry([
      storageMigration({ checksum: checksumOne, id: "2026-05-01-add-state" }),
    ]);
    const invalid = validateUpgradeMigrationRegistry([
      storageMigration({
        checksum: "sha256:BAD" as never,
        id: "2026-05-02-bad-checksum",
      }),
    ]);

    expect(registry.migrations[0]?.checksum).toBe(checksumOne);
    expect(invalid.ok).toBe(false);
    expect(invalid.ok ? [] : invalid.errors).toEqual([
      expect.objectContaining({
        code: "invalid-checksum",
        field: "checksum",
        migrationId: "2026-05-02-bad-checksum",
      }),
    ]);
  });

  it("classifies migration safety and rejects unknown safety classes", () => {
    expect(isUpgradeMigrationSafetyClass("auto-safe")).toBe(true);
    expect(isUpgradeMigrationSafetyClass("auto-with-backup")).toBe(true);
    expect(isUpgradeMigrationSafetyClass("manual-approval")).toBe(true);
    expect(isUpgradeMigrationSafetyClass("unsafe")).toBe(false);

    const invalid = validateUpgradeMigrationRegistry([
      storageMigration({
        id: "2026-05-01-unknown-safety",
        safety: "unsafe" as never,
      }),
    ]);

    expect(invalid.ok).toBe(false);
    expect(invalid.ok ? [] : invalid.errors).toEqual([
      expect.objectContaining({
        code: "invalid-safety-class",
        field: "safety",
        migrationId: "2026-05-01-unknown-safety",
      }),
    ]);
  });

  it("validates package app revision ranges", () => {
    const valid = validateUpgradeMigrationRegistry([
      packageAppMigration({
        fromPackageRevision: 1,
        id: "2026-05-01-site-v2",
        toPackageRevision: 2,
      }),
    ]);
    const invalid = validateUpgradeMigrationRegistry([
      packageAppMigration({
        fromPackageRevision: 2,
        id: "2026-05-02-site-no-advance",
        toPackageRevision: 2,
      }),
      packageAppMigration({
        fromPackageRevision: 0,
        id: "2026-05-03-site-zero",
        toPackageRevision: 1,
      }),
    ]);

    expect(valid.ok).toBe(true);
    expect(invalid.ok).toBe(false);
    expect(invalid.ok ? [] : invalid.errors).toEqual([
      expect.objectContaining({
        code: "invalid-package-revision-range",
        field: "toPackageRevision",
        migrationId: "2026-05-02-site-no-advance",
      }),
      expect.objectContaining({
        code: "invalid-package-revision-range",
        field: "fromPackageRevision",
        migrationId: "2026-05-03-site-zero",
      }),
    ]);
  });
});
function storageMigration(
  overrides: Partial<UpgradeMigrationDefinition> & {
    id: string;
  },
): UpgradeMigrationDefinition {
  const { id, ...rest } = overrides;
  return {
    id,
    owner: "authority-storage",
    family: { kind: "storage", storageFamily: "authority" },
    checksum: checksumOne,
    safety: "auto-safe",
    summary: "Prepare Authority storage.",
    apply: noopApply,
    ...rest,
  } as UpgradeMigrationDefinition;
}
function packageAppMigration(
  overrides: Partial<PackageAppUpgradeMigration> & {
    id: string;
  },
): PackageAppUpgradeMigration {
  const { id, ...rest } = overrides;
  return {
    id,
    owner: "app-schema",
    family: { kind: "package-app", packageAppKey: "site" },
    checksum: checksumTwo,
    safety: "auto-with-backup",
    summary: "Migrate Site package app records.",
    apply: noopApply,
    fromPackageRevision: 1,
    toPackageRevision: 2,
    ...rest,
  };
}
