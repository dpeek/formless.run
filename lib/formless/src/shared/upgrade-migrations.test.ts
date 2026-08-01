import { describe, expect, it } from "vite-plus/test";
import {
  createUpgradeMigrationRegistry,
  isUpgradeMigrationSafetyClass,
  listUpgradeMigrations,
  upgradeMigrationFamilyKey,
  validateUpgradeMigrationRegistry,
  type UpgradeMigrationApply,
  type UpgradeMigrationDefinition,
} from "./upgrade-migrations.ts";

const checksumOne = "sha256:1111111111111111111111111111111111111111111111111111111111111111";
const checksumTwo = "sha256:2222222222222222222222222222222222222222222222222222222222222222";
const checksumThree = "sha256:3333333333333333333333333333333333333333333333333333333333333333";

const noopApply: UpgradeMigrationApply = () => ({ evidence: [] });

describe("upgrade migration contracts", () => {
  it("keeps registry order and filters by migration family", () => {
    const authorityOne = storageMigration({
      checksum: checksumOne,
      id: "2026-05-01-authority-records",
    });
    const runtime = runtimeMigration({
      checksum: checksumTwo,
      id: "2026-05-02-runtime-protocol",
    });
    const authorityTwo = storageMigration({
      checksum: checksumThree,
      id: "2026-05-03-authority-indexes",
    });
    const registry = createUpgradeMigrationRegistry([authorityOne, runtime, authorityTwo]);

    expect(listUpgradeMigrations(registry).map((migration) => migration.id)).toEqual([
      "2026-05-01-authority-records",
      "2026-05-02-runtime-protocol",
      "2026-05-03-authority-indexes",
    ]);
    expect(
      listUpgradeMigrations(registry, { kind: "storage", storageFamily: "authority" }).map(
        (migration) => migration.id,
      ),
    ).toEqual(["2026-05-01-authority-records", "2026-05-03-authority-indexes"]);
    expect(upgradeMigrationFamilyKey(runtime.family)).toBe("runtime:worker");
  });

  it("rejects duplicate ids within the same family only", () => {
    const duplicate = validateUpgradeMigrationRegistry([
      storageMigration({ id: "2026-05-01-add-columns" }),
      storageMigration({ id: "2026-05-01-add-columns" }),
    ]);
    const sameIdDifferentFamily = validateUpgradeMigrationRegistry([
      storageMigration({ id: "2026-05-01-add-columns" }),
      runtimeMigration({ id: "2026-05-01-add-columns" }),
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
function runtimeMigration(
  overrides: Partial<UpgradeMigrationDefinition> & {
    id: string;
  },
): UpgradeMigrationDefinition {
  const { id, ...rest } = overrides;
  return {
    id,
    owner: "runtime",
    family: { kind: "runtime", runtimeFamily: "worker" },
    checksum: checksumTwo,
    safety: "auto-with-backup",
    summary: "Migrate Worker protocol state.",
    apply: noopApply,
    ...rest,
  };
}
