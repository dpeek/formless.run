import { describe, expect, it } from "vite-plus/test";
import type { AppSchema } from "@dpeek/formless-schema";

import {
  WORKSPACE_AUTO_SAVE_WRITE_SOURCES,
  WORKSPACE_OPERATION_CAPABILITIES,
  WORKSPACE_OPERATION_DEFINITIONS,
  WORKSPACE_OPERATION_EXECUTION_REQUIREMENTS,
  WORKSPACE_OPERATION_KINDS,
  WORKSPACE_OPERATION_KEYS,
  WORKSPACE_RECORD_STATE_FILE_KIND,
  WORKSPACE_RECORD_STATE_FILE_VERSION,
  assertWorkspaceOperationExecutionRequirements,
  formatWorkspaceRecordStateFile,
  isWorkspaceAutoSaveWriteSource,
  isWorkspaceOperationExecutionRequirement,
  isWorkspaceOperationKind,
  parseWorkspaceRecordStateFile,
  parseWorkspaceRecordStateFileJson,
  workspaceOperationActorPolicy,
  workspaceOperationBaseExecutionRequirements,
  workspaceOperationEffectiveExecutionRequirements,
  workspaceOperationExecutionDecision,
  workspaceOperationMode,
  workspaceOperationRequiredCapability,
  type WorkspaceProgramRecordStateFile,
} from "./index.ts";

const workspaceRecordStateSchema = {
  version: 1,
  entities: [
    {
      id: "entity_ba20159d-45ba-46a1-a75f-acae3340b296",
      key: "task",
      label: "Task",
      fields: [
        { key: "title", type: "text", required: true, label: "Title" },
        { key: "done", type: "boolean", required: true, label: "Done" },
      ],
    },
  ],
  queries: [],
  itemViews: [],
  tableViews: [],
  views: [],
  screens: [],
} as AppSchema;

describe("workspace record state contracts", () => {
  it("declares canonical Program schema provenance", () => {
    const state = {
      kind: WORKSPACE_RECORD_STATE_FILE_KIND,
      version: WORKSPACE_RECORD_STATE_FILE_VERSION,
      storageIdentity: "instance:control-plane",
      schemaKey: "formless-program",
      exportedAt: "2026-06-18T00:00:00.000Z",
      schemaUpdatedAt: "2026-06-18T00:00:01.000Z",
      sourceCursor: 7,
      schemaProvenance: {
        kind: "program",
        sourceSchemaHash: `sha256:${"2".repeat(64)}`,
      },
      records: [],
    } satisfies WorkspaceProgramRecordStateFile;

    expect(state.schemaProvenance).toEqual({
      kind: "program",
      sourceSchemaHash: `sha256:${"2".repeat(64)}`,
    });
  });

  it("parses and formats Program record state without full App schema bodies", () => {
    const state = workspaceProgramRecordState();
    const formatted = formatWorkspaceRecordStateFile(
      {
        ...state,
        records: [
          workspaceRecord("task-2", "task", "2026-06-18T00:00:01.000Z", {
            done: true,
            title: "Second",
          }),
          workspaceRecord("task-1", "task", "2026-06-18T00:00:02.000Z", {
            done: false,
            title: "First",
          }),
        ],
      },
      workspaceRecordStateSchema,
    );

    expect(formatted).toBe(`${JSON.stringify(JSON.parse(formatted), null, 2)}\n`);
    expect(JSON.parse(formatted)).not.toHaveProperty("schema");
    expect(JSON.parse(formatted)).toMatchObject({
      kind: WORKSPACE_RECORD_STATE_FILE_KIND,
      version: WORKSPACE_RECORD_STATE_FILE_VERSION,
      storageIdentity: "instance:control-plane",
      schemaKey: "formless-program",
      schemaProvenance: {
        kind: "program",
        sourceSchemaHash: `sha256:${"a".repeat(64)}`,
      },
      records: [
        {
          id: "task-1",
          values: { title: "First", done: false },
        },
        {
          id: "task-2",
          values: { title: "Second", done: true },
        },
      ],
    });
    expect(
      parseWorkspaceRecordStateFileJson(formatted, {
        context: "state/instance.json",
        expected: {
          schemaKey: "formless-program",
          schemaProvenanceKind: "program",
          storageIdentity: "instance:control-plane",
        },
      }),
    ).toEqual(JSON.parse(formatted));
  });

  it("parses Program record state with deterministic provenance", () => {
    const state = workspaceProgramRecordState();

    expect(
      parseWorkspaceRecordStateFile(state, {
        context: "state/instance.json",
        expected: {
          schemaKey: "formless-program",
          schemaProvenanceKind: "program",
          storageIdentity: "instance:control-plane",
        },
      }),
    ).toEqual(state);
  });

  it("rejects embedded schemas and invalid record state provenance", () => {
    expect(() =>
      parseWorkspaceRecordStateFile({
        ...workspaceProgramRecordState(),
        schema: { entities: {} },
      }),
    ).toThrow('Workspace record state file has unsupported key "schema".');

    expect(() =>
      parseWorkspaceRecordStateFile({
        ...workspaceProgramRecordState(),
        schemaProvenance: {
          kind: "instance-control-plane",
          sourceSchemaHash: `sha256:${"a".repeat(64)}`,
        },
      }),
    ).toThrow('Workspace record state file schemaProvenance kind must be "program".');

    expect(() =>
      parseWorkspaceRecordStateFile({
        ...workspaceProgramRecordState(),
        storageIdentity: "app:instance",
      }),
    ).toThrow('Workspace record state file storageIdentity must be "instance:control-plane".');

    expect(() =>
      parseWorkspaceRecordStateFile({
        ...workspaceProgramRecordState(),
        records: [
          {
            id: "task-1",
            entity: "task",
            values: { nested: { unsupported: true } },
            createdAt: "2026-06-18T00:00:01.000Z",
            updatedAt: "2026-06-18T00:00:01.000Z",
          },
        ],
      }),
    ).toThrow(
      'Workspace record state file records[0] values field "nested" must be a scalar value.',
    );
  });

  it("rejects mismatched expected record state fields", () => {
    expect(() =>
      parseWorkspaceRecordStateFile(workspaceProgramRecordState(), {
        expected: { storageIdentity: "instance:other" },
      }),
    ).toThrow('Workspace record state file storageIdentity must be "instance:other".');

    expect(() =>
      parseWorkspaceRecordStateFile(workspaceProgramRecordState(), {
        expected: { schemaKey: "other-program" },
      }),
    ).toThrow('Workspace record state file schemaKey must be "other-program".');
  });
});

describe("workspace operation metadata", () => {
  it("declares semantic identities, policy, capabilities, and requirements", () => {
    expect(WORKSPACE_OPERATION_KEYS).toEqual([
      "workspace.source.check",
      "workspace.credentials.setup",
      "deployment.refresh",
      "workspace.init",
      "workspace.source.pull",
      "workspace.source.push",
      "workspace.source.save",
      "workspace.status",
    ]);
    expect(WORKSPACE_OPERATION_KINDS).toEqual([
      "check",
      "credentialSetup",
      "deploymentRefresh",
      "init",
      "pull",
      "push",
      "save",
      "status",
    ]);
    expect(WORKSPACE_OPERATION_CAPABILITIES).toEqual([
      "workspace-read",
      "workspace-source-write",
      "workspace-source-sync",
      "credential-setup",
      "deployment-plan",
      "deployment-apply",
      "deployment-observe",
    ]);
    expect(WORKSPACE_OPERATION_EXECUTION_REQUIREMENTS).toEqual([
      "workspace-source-read",
      "workspace-source-write",
      "local-filesystem",
      "local-authority",
      "admin-token",
      "remote-target",
      "provider-credentials",
    ]);
    expect(isWorkspaceOperationKind("push")).toBe(true);
    expect(isWorkspaceOperationKind("deployApply")).toBe(false);
    expect(isWorkspaceOperationExecutionRequirement("provider-credentials")).toBe(true);
    expect(isWorkspaceOperationExecutionRequirement("owner-session")).toBe(false);
    expect(
      WORKSPACE_OPERATION_DEFINITIONS.map((definition) => ({
        handlerKey: definition.handlerKey,
        key: definition.key,
        kind: definition.kind,
      })),
    ).toEqual([
      { handlerKey: "workspace.source.check", key: "workspace.source.check", kind: "check" },
      {
        handlerKey: "workspace.credentials.setup",
        key: "workspace.credentials.setup",
        kind: "credentialSetup",
      },
      { handlerKey: "deployment.refresh", key: "deployment.refresh", kind: "deploymentRefresh" },
      { handlerKey: "workspace.init", key: "workspace.init", kind: "init" },
      { handlerKey: "workspace.source.pull", key: "workspace.source.pull", kind: "pull" },
      { handlerKey: "workspace.source.push", key: "workspace.source.push", kind: "push" },
      { handlerKey: "workspace.source.save", key: "workspace.source.save", kind: "save" },
      { handlerKey: "workspace.status", key: "workspace.status", kind: "status" },
    ]);
  });

  it("derives semantic execution policy", () => {
    expect(workspaceOperationActorPolicy("push").allowedActors).toEqual([
      "automation",
      "browser",
      "cli",
      "system",
    ]);
    expect(workspaceOperationMode("status")).toBe("read");
    expect(workspaceOperationRequiredCapability("push")).toBe("workspace-source-sync");
    expect(workspaceOperationBaseExecutionRequirements("push")).toEqual([
      "local-filesystem",
      "workspace-source-read",
      "remote-target",
    ]);
    expect(
      workspaceOperationEffectiveExecutionRequirements({ dryRun: true, kind: "push" }),
    ).toEqual(["local-filesystem", "workspace-source-read", "remote-target"]);
    expect(workspaceOperationEffectiveExecutionRequirements({ kind: "push" })).toEqual([
      "local-filesystem",
      "workspace-source-read",
      "remote-target",
      "admin-token",
      "provider-credentials",
      "workspace-source-write",
    ]);
    expect(
      workspaceOperationEffectiveExecutionRequirements({ kind: "status", targetAlias: "remote" }),
    ).toEqual(["local-filesystem", "workspace-source-read", "remote-target", "admin-token"]);
    expect(
      workspaceOperationExecutionDecision({
        actor: "browser",
        capabilities: ["workspace-source-sync"],
        kind: "push",
      }),
    ).toEqual({ ok: true });
    expect(() =>
      assertWorkspaceOperationExecutionRequirements({ dryRun: true, kind: "push" }, [
        "local-filesystem",
        "workspace-source-read",
        "remote-target",
        "provider-credentials",
      ]),
    ).toThrow('Workspace operation "push" execution requirements are invalid.');
  });
});

describe("workspace auto-save enqueue contracts", () => {
  it("recognizes only declared write sources", () => {
    expect(WORKSPACE_AUTO_SAVE_WRITE_SOURCES).toContain("deployment-intent");
    expect(isWorkspaceAutoSaveWriteSource("media-reference")).toBe(true);
    expect(isWorkspaceAutoSaveWriteSource("raw-upload")).toBe(false);
  });
});

function workspaceProgramRecordState(): WorkspaceProgramRecordStateFile {
  return {
    kind: WORKSPACE_RECORD_STATE_FILE_KIND,
    version: WORKSPACE_RECORD_STATE_FILE_VERSION,
    storageIdentity: "instance:control-plane",
    schemaKey: "formless-program",
    exportedAt: "2026-06-18T00:00:00.000Z",
    schemaUpdatedAt: "2026-06-18T00:00:01.000Z",
    sourceCursor: 7,
    schemaProvenance: {
      kind: "program",
      sourceSchemaHash: `sha256:${"a".repeat(64)}`,
    },
    records: [],
  };
}

function workspaceRecord(
  id: string,
  entity: string,
  createdAt: string,
  values: Record<string, string | boolean | number>,
) {
  return {
    id,
    entity,
    values,
    createdAt,
    updatedAt: createdAt,
  };
}
