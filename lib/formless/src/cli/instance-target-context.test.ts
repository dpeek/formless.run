import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  FORMLESS_CONFIG_FILE,
  resolveFormlessConfig,
  type ResolvedFormlessConfig,
} from "@dpeek/formless-workspace";
import { formatTestFormlessConfigModule } from "./instance-workspace-config-test.ts";
import {
  writeInstanceWorkspaceControlPlaneStorageSnapshot,
  writeInstanceWorkspaceSecretState,
} from "../program/workspace.ts";
import { describe, expect, it } from "vite-plus/test";
import { formlessProgramSchema } from "../program/runtime.ts";
import {
  FORMLESS_PROGRAM_SCHEMA_KEY,
  FORMLESS_PROGRAM_STORAGE_IDENTITY,
} from "../program/target.ts";
import { STORAGE_SNAPSHOT_KIND, STORAGE_SNAPSHOT_VERSION } from "@dpeek/formless-storage";
import type { StorageSnapshot, StoredRecord } from "@dpeek/formless-storage";
import {
  resolveFormlessCliTargetContext,
  formlessCliTargetAcceptHeaders,
} from "./instance-target-context.ts";

describe("Formless CLI target context", () => {
  it("prefers explicit admin tokens and redacts display labels", async () => {
    const workspaceRoot = await writeTargetWorkspace({ storedAdminToken: "stored-secret" });
    const context = await resolveFormlessCliTargetContext(
      {
        commandName: "status",
        cwd: workspaceRoot,
        explicitAdminToken: " explicit-secret ",
      },
      { env: { FORMLESS_ADMIN_TOKEN: "env-secret" } },
    );

    expect(context.workspaceRoot).toBe(workspaceRoot);
    expect(context.selectedTarget).toEqual({
      alias: "instance.primary",
      url: "https://personal.example",
    });
    expect(context.adminToken).toBe("explicit-secret");
    expect(context.adminTokenSource).toBe("explicit");
    expect(context.adminTokenDisplayLabel).toBe("[redacted]");
    expect(formlessCliTargetAcceptHeaders({ adminToken: context.adminToken }).authorization).toBe(
      "Bearer explicit-secret",
    );
    expect(JSON.stringify(context.display)).not.toContain("explicit-secret");
    expect(JSON.stringify(context.display)).not.toContain("env-secret");
    expect(JSON.stringify(context.display)).not.toContain("stored-secret");
  });

  it("uses environment admin tokens before stored secret state", async () => {
    const workspaceRoot = await writeTargetWorkspace({ storedAdminToken: "stored-secret" });
    const context = await resolveFormlessCliTargetContext(
      {
        commandName: "status",
        cwd: workspaceRoot,
      },
      { env: { FORMLESS_ADMIN_TOKEN: "env-secret" } },
    );

    expect(context.adminToken).toBe("env-secret");
    expect(context.adminTokenSource).toBe("env");
    expect(context.adminTokenDisplayLabel).toBe("[redacted]");
    expect(JSON.stringify(context.display)).not.toContain("env-secret");
    expect(JSON.stringify(context.display)).not.toContain("stored-secret");
  });

  it("uses stored admin tokens when explicit and environment tokens are missing", async () => {
    const workspaceRoot = await writeTargetWorkspace({ storedAdminToken: "stored-secret" });
    const context = await resolveFormlessCliTargetContext(
      {
        commandName: "status",
        cwd: workspaceRoot,
      },
      { env: {} },
    );

    expect(context.adminToken).toBe("stored-secret");
    expect(context.adminTokenSource).toBe("stored");
    expect(context.adminTokenDisplayLabel).toBe("[redacted]");
    expect(JSON.stringify(context.display)).not.toContain("stored-secret");
  });

  it("reports missing admin tokens without adding authorization headers", async () => {
    const workspaceRoot = await writeTargetWorkspace();
    const context = await resolveFormlessCliTargetContext(
      {
        commandName: "status",
        cwd: workspaceRoot,
      },
      { env: {} },
    );

    expect(context.adminToken).toBeNull();
    expect(context.adminTokenSource).toBe("missing");
    expect(context.adminTokenDisplayLabel).toBe("missing");
    expect(formlessCliTargetAcceptHeaders({ adminToken: context.adminToken })).toEqual({
      accept: "application/json",
    });
  });
});
async function writeTargetWorkspace(
  input: {
    storedAdminToken?: string;
  } = {},
) {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), "formless-target-context-"));
  const manifest = targetWorkspaceConfig();
  await mkdir(workspaceRoot, { recursive: true });
  await writeFile(
    path.join(workspaceRoot, FORMLESS_CONFIG_FILE),
    formatTestFormlessConfigModule(manifest),
  );
  await writeInstanceWorkspaceControlPlaneStorageSnapshot({
    manifest,
    snapshot: controlPlaneSnapshot([deploymentConfigRecord()]),
    workspaceRoot,
  });

  if (input.storedAdminToken) {
    await writeInstanceWorkspaceSecretState(workspaceRoot, {
      adminToken: input.storedAdminToken,
    });
  }

  return workspaceRoot;
}

function controlPlaneSnapshot(records: StoredRecord[]): StorageSnapshot {
  return {
    kind: STORAGE_SNAPSHOT_KIND,
    version: STORAGE_SNAPSHOT_VERSION,
    storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
    schemaKey: FORMLESS_PROGRAM_SCHEMA_KEY,
    exportedAt: "2026-06-11T00:00:00.000Z",
    schemaUpdatedAt: "2026-06-11T00:00:00.000Z",
    sourceCursor: records.length,
    schema: formlessProgramSchema,
    records,
  };
}

function targetWorkspaceConfig(): ResolvedFormlessConfig {
  return resolveFormlessConfig({ name: "personal-sites" });
}

function deploymentConfigRecord(): StoredRecord {
  const now = "2026-06-11T00:00:00.000Z";

  return {
    id: "instance.primary",
    entity: "deployment-config",
    values: {
      enabled: true,
      label: "Primary instance",
      providerFamily: "cloudflare",
      targetId: "instance.primary",
      targetKind: "instance",
      targetUrl: "https://personal.example",
    },
    createdAt: now,
    updatedAt: now,
  };
}
