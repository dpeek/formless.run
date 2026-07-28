import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { createWorkerHarness } from "./miniflare-test.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

let harness: Harness | undefined;
let harnessDir: string | undefined;

afterEach(async () => {
  await harness?.dispose();
  harness = undefined;

  if (harnessDir) {
    await rm(harnessDir, { recursive: true, force: true });
    harnessDir = undefined;
  }
});

describe("SQL migration runner", () => {
  it("applies pending migrations in registry order and skips applied reruns", async () => {
    harness = await createWorkerHarness(await writeSqlMigrationHarness(), {
      SQL_MIGRATION_STATE: { className: "SqlMigrationHarness", useSQLite: true },
    });

    const first = await harness.fetch("/apply");
    const second = await harness.fetch("/apply");

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const firstBody = (await first.json()) as ApplyBody;
    const secondBody = (await second.json()) as ApplyBody;

    expect(firstBody.result.applied.map((migration) => migration.migrationId)).toEqual([
      "2026-05-28-first-test-sql-migration",
      "2026-05-28-second-test-sql-migration",
    ]);
    expect(firstBody.result.skipped).toEqual([]);
    expect(firstBody.sideEffects).toEqual(["first", "second"]);
    expect(firstBody.applied).toEqual([
      expect.objectContaining({
        checksum: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        migrationId: "2026-05-28-first-test-sql-migration",
        packageVersion: "0.1.8",
        storageFamily: "migration-harness",
      }),
      expect.objectContaining({
        checksum: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
        migrationId: "2026-05-28-second-test-sql-migration",
        packageVersion: "0.1.8",
        storageFamily: "migration-harness",
      }),
    ]);

    expect(secondBody.result.applied).toEqual([]);
    expect(secondBody.result.skipped.map((migration) => migration.migrationId)).toEqual([
      "2026-05-28-first-test-sql-migration",
      "2026-05-28-second-test-sql-migration",
    ]);
    expect(secondBody.sideEffects).toEqual(["first", "second"]);
  });

  it("rejects applied migration checksum mismatches before mutation", async () => {
    harness = await createWorkerHarness(await writeSqlMigrationHarness(), {
      SQL_MIGRATION_STATE: { className: "SqlMigrationHarness", useSQLite: true },
    });

    const seeded = await harness.fetch("/seed-checksum-mismatch");
    const apply = await harness.fetch("/apply-catch");

    expect(seeded.status).toBe(200);
    expect(apply.status).toBe(409);

    const body = (await apply.json()) as {
      error: string;
      sideEffectsTableExists: boolean;
    };

    expect(body.error).toContain("has checksum");
    expect(body.sideEffectsTableExists).toBe(false);
  });

  it("rewrites legacy table shape once and leaves reruns as no-ops", async () => {
    harness = await createWorkerHarness(await writeSqlMigrationHarness(), {
      SQL_MIGRATION_STATE: { className: "SqlMigrationHarness", useSQLite: true },
    });

    const seeded = await harness.fetch("/seed-legacy-rewrite");
    const migrated = await harness.fetch("/rewrite");
    const rerun = await harness.fetch("/rewrite");

    expect(seeded.status).toBe(200);
    expect(migrated.status).toBe(200);
    expect(rerun.status).toBe(200);

    const migratedBody = (await migrated.json()) as RewriteBody;
    const rerunBody = (await rerun.json()) as RewriteBody;

    expect(migratedBody.columns).toEqual(["id", "name", "display_name"]);
    expect(migratedBody.rows).toEqual([
      {
        display_name: "Legacy",
        id: "rec_1",
        name: "Legacy",
      },
    ]);
    expect(migratedBody.result.applied).toHaveLength(1);
    expect(migratedBody.result.skipped).toHaveLength(0);
    expect(rerunBody.result.applied).toHaveLength(0);
    expect(rerunBody.result.skipped).toHaveLength(1);
    expect(rerunBody.rows).toEqual(migratedBody.rows);
  });
});

type ApplyBody = {
  applied: Array<{
    checksum: string;
    migrationId: string;
    packageVersion: string | null;
    storageFamily: string;
  }>;
  result: {
    applied: Array<{
      migrationId: string;
    }>;
    skipped: Array<{
      migrationId: string;
    }>;
  };
  sideEffects: string[];
};

type RewriteBody = {
  columns: string[];
  result: {
    applied: unknown[];
    skipped: unknown[];
  };
  rows: Array<{
    display_name: string;
    id: string;
    name: string;
  }>;
};

async function writeSqlMigrationHarness() {
  harnessDir = await mkdtemp(join(tmpdir(), "formless-sql-migration-harness-"));
  const harnessPath = join(harnessDir, "sql-migration-harness.ts");

  await writeFile(
    harnessPath,
    `
      import { DurableObject } from "cloudflare:workers";
      import {
        createSqlStorageMigrationRegistry,
        readAppliedSqlMigrations,
        recordAppliedSqlMigration,
        runSqlStorageMigrations,
        storageSqlMigrationFamily,
      } from "${process.cwd()}/src/worker/sql-migrations.ts";

      const migrationFamily = storageSqlMigrationFamily("migration-harness");
      const rewriteFamily = storageSqlMigrationFamily("rewrite-harness");
      const migrationRegistry = createSqlStorageMigrationRegistry([
        {
          id: "2026-05-28-first-test-sql-migration",
          owner: "test",
          family: migrationFamily,
          checksum: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
          safety: "auto-safe",
          summary: "Create migration side effect table.",
          apply(storage) {
            storage.sql.exec(\`
              CREATE TABLE IF NOT EXISTS migration_side_effects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                label TEXT NOT NULL
              )
            \`);
            storage.sql.exec("INSERT INTO migration_side_effects (label) VALUES ('first')");
          },
        },
        {
          id: "2026-05-28-second-test-sql-migration",
          owner: "test",
          family: migrationFamily,
          checksum: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
          safety: "auto-safe",
          summary: "Append a second ordered side effect.",
          apply(storage) {
            storage.sql.exec("INSERT INTO migration_side_effects (label) VALUES ('second')");
          },
        },
      ]);
      const rewriteRegistry = createSqlStorageMigrationRegistry([
        {
          id: "2026-05-28-rewrite-legacy-records",
          owner: "test",
          family: rewriteFamily,
          checksum: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
          safety: "auto-safe",
          summary: "Rewrite legacy records to add display names.",
          apply(storage) {
            if (!tableHasColumn(storage, "legacy_records", "display_name")) {
              storage.sql.exec("DROP TABLE IF EXISTS legacy_records_old");
              storage.sql.exec("ALTER TABLE legacy_records RENAME TO legacy_records_old");
              storage.sql.exec(\`
                CREATE TABLE legacy_records (
                  id TEXT PRIMARY KEY,
                  name TEXT NOT NULL,
                  display_name TEXT NOT NULL
                )
              \`);
              storage.sql.exec(\`
                INSERT INTO legacy_records (id, name, display_name)
                SELECT id, name, name FROM legacy_records_old
              \`);
              storage.sql.exec("DROP TABLE legacy_records_old");
            }
          },
        },
      ]);

      export default {
        fetch(request, env) {
          const id = env.SQL_MIGRATION_STATE.idFromName("state");
          return env.SQL_MIGRATION_STATE.get(id).fetch(request);
        },
      };

      export class SqlMigrationHarness extends DurableObject {
        async fetch(request) {
          const url = new URL(request.url);

          if (url.pathname === "/apply") {
            const result = runSqlStorageMigrations(this.ctx.storage, {
              family: migrationFamily,
              migrations: migrationRegistry,
              now: "2026-05-28T00:00:00.000Z",
              packageVersion: "0.1.8",
            });
            return Response.json({
              applied: readAppliedSqlMigrations(this.ctx.storage, migrationFamily),
              result,
              sideEffects: sideEffects(this.ctx.storage),
            });
          }

          if (url.pathname === "/apply-catch") {
            try {
              const result = runSqlStorageMigrations(this.ctx.storage, {
                family: migrationFamily,
                migrations: migrationRegistry,
                now: "2026-05-28T00:00:00.000Z",
                packageVersion: "0.1.8",
              });
              return Response.json({ result, sideEffects: sideEffects(this.ctx.storage) });
            } catch (error) {
              return Response.json(
                {
                  error: error instanceof Error ? error.message : String(error),
                  sideEffectsTableExists: tableExists(this.ctx.storage, "migration_side_effects"),
                },
                { status: 409 },
              );
            }
          }

          if (url.pathname === "/seed-checksum-mismatch") {
            recordAppliedSqlMigration(this.ctx.storage, {
              appliedAt: "2026-05-28T00:00:00.000Z",
              checksum: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              migrationId: "2026-05-28-first-test-sql-migration",
              packageVersion: "0.1.7",
              storageFamily: migrationFamily.storageFamily,
            });
            return Response.json({ seeded: true });
          }

          if (url.pathname === "/seed-legacy-rewrite") {
            this.ctx.storage.sql.exec(\`
              CREATE TABLE legacy_records (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL
              );
              INSERT INTO legacy_records (id, name) VALUES ('rec_1', 'Legacy');
            \`);
            return Response.json({ seeded: true });
          }

          if (url.pathname === "/rewrite") {
            const result = runSqlStorageMigrations(this.ctx.storage, {
              family: rewriteFamily,
              migrations: rewriteRegistry,
              now: "2026-05-28T00:00:00.000Z",
              packageVersion: "0.1.8",
            });
            return Response.json({
              columns: tableColumns(this.ctx.storage, "legacy_records"),
              result,
              rows: this.ctx.storage
                .sql
                .exec("SELECT id, name, display_name FROM legacy_records ORDER BY id ASC")
                .toArray(),
            });
          }

          return Response.json({ error: "Not found." }, { status: 404 });
        }
      }

      function sideEffects(storage) {
        if (!tableExists(storage, "migration_side_effects")) {
          return [];
        }

        return storage.sql
          .exec("SELECT label FROM migration_side_effects ORDER BY id ASC")
          .toArray()
          .map((row) => row.label);
      }

      function tableColumns(storage, table) {
        return storage.sql
          .exec(\`PRAGMA table_info(\${table})\`)
          .toArray()
          .map((row) => row.name);
      }

      function tableExists(storage, table) {
        return storage.sql
          .exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", table)
          .toArray().length > 0;
      }

      function tableHasColumn(storage, table, column) {
        return tableColumns(storage, table).includes(column);
      }
    `,
  );

  return harnessPath;
}
