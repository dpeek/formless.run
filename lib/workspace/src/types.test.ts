import { describe, expect, it } from "vite-plus/test";
import type { AppSchema } from "@dpeek/formless-schema";

import {
  WORKSPACE_RECORD_STATE_FILE_KIND,
  WORKSPACE_RECORD_STATE_FILE_VERSION,
  WORKSPACE_BROWSER_OPERATION_DEFINITIONS,
  WORKSPACE_BOOTSTRAP_OPERATION_KINDS,
  WORKSPACE_BROWSER_OPERATION_KINDS,
  WORKSPACE_GATEWAY_OPERATION_DEFINITIONS,
  WORKSPACE_GATEWAY_OPERATION_KINDS,
  WORKSPACE_OPERATION_CAPABILITIES,
  WORKSPACE_OPERATION_DEFINITIONS,
  WORKSPACE_OPERATION_EXECUTION_REQUIREMENTS,
  WORKSPACE_OPERATION_KINDS,
  WORKSPACE_OPERATION_KEYS,
  WORKSPACE_OPERATION_STATE_FILE_KIND,
  WORKSPACE_OPERATION_STATE_FILE_VERSION,
  WORKSPACE_AUTO_SAVE_WRITE_SOURCES,
  formatWorkspaceRecordStateFile,
  formatWorkspaceOperationState,
  assertWorkspaceOperationExecutionRequirements,
  initialWorkspaceOperationState,
  isWorkspaceAutoSaveWriteSource,
  workspaceOperationActorAllowed,
  workspaceOperationActorPolicy,
  workspaceBrowserOperationControlMetadata,
  workspaceBrowserOperationDefinitions,
  workspaceOperationBaseExecutionRequirements,
  workspaceOperationCapabilityAllowed,
  workspaceOperationEffectiveExecutionRequirements,
  workspaceOperationExecutionDecision,
  workspaceOperationExecutionRequirementsMatch,
  workspaceOperationDefinitionForGatewayRequestKind,
  workspaceGatewayOperationDefinitionForKind,
  workspaceGatewayOperationDefinitions,
  workspaceOperationGatewayAllowedRequestFields,
  workspaceOperationGatewayInputFields,
  workspaceOperationGatewayRequestKind,
  isWorkspaceBrowserOperationKind,
  isWorkspaceGatewayOperationKind,
  isWorkspaceOperationExecutionRequirement,
  isWorkspaceOperationKind,
  nextWorkspaceOperationState,
  parseWorkspaceRecordStateFile,
  parseWorkspaceRecordStateFileJson,
  parseWorkspaceOperationId,
  parseWorkspaceOperationStateJson,
  workspaceOperationBootstrapAllowed,
  workspaceOperationDefinitionForKey,
  workspaceOperationDefinitionForKind,
  workspaceOperationInputDefaults,
  workspaceOperationInputFieldDefaultValue,
  workspaceOperationInputDisplay,
  workspaceOperationLabel,
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

describe("workspace operation contracts", () => {
  it("defines workspace operation definitions and derived kind sets", () => {
    expect(WORKSPACE_OPERATION_CAPABILITIES).toEqual([
      "workspace-read",
      "workspace-source-write",
      "workspace-source-sync",
      "credential-setup",
      "deployment-plan",
      "deployment-apply",
      "deployment-observe",
    ]);
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
    expect(WORKSPACE_OPERATION_KINDS).toEqual(
      WORKSPACE_OPERATION_DEFINITIONS.map((definition) => definition.kind),
    );
    expect(WORKSPACE_BROWSER_OPERATION_KINDS).toEqual([
      "check",
      "credentialSetup",
      "pull",
      "push",
      "save",
      "status",
    ]);
    expect(WORKSPACE_BROWSER_OPERATION_KINDS).toEqual(
      WORKSPACE_OPERATION_DEFINITIONS.filter((definition) => "gateway" in definition.bindings).map(
        (definition) => definition.kind,
      ),
    );
    expect(WORKSPACE_GATEWAY_OPERATION_KINDS).toEqual(WORKSPACE_BROWSER_OPERATION_KINDS);
    expect(WORKSPACE_BROWSER_OPERATION_DEFINITIONS).toEqual(
      WORKSPACE_GATEWAY_OPERATION_DEFINITIONS,
    );
    expect(workspaceBrowserOperationDefinitions()).toEqual(WORKSPACE_BROWSER_OPERATION_DEFINITIONS);
    expect(WORKSPACE_GATEWAY_OPERATION_DEFINITIONS.map((definition) => definition.kind)).toEqual([
      "check",
      "credentialSetup",
      "pull",
      "push",
      "save",
      "status",
    ]);
    expect(workspaceGatewayOperationDefinitions().map((definition) => definition.kind)).toEqual([
      "check",
      "credentialSetup",
      "pull",
      "push",
      "save",
      "status",
    ]);
    expect(workspaceBrowserOperationControlMetadata()).toEqual(
      WORKSPACE_BROWSER_OPERATION_DEFINITIONS.map((definition) => ({
        bootstrapAllowed: definition.bindings.gateway.bootstrap,
        executionRequirements: definition.executionRequirements,
        inputFields: definition.bindings.gateway.inputFields,
        kind: definition.kind,
        label: definition.label,
        mode: definition.mode,
        requiredCapability: definition.requiredCapability,
      })),
    );
    expect(
      Object.fromEntries(
        workspaceBrowserOperationControlMetadata().map((metadata) => [metadata.kind, metadata]),
      ),
    ).toMatchObject({
      save: {
        bootstrapAllowed: false,
        executionRequirements: [
          "local-filesystem",
          "workspace-source-read",
          "workspace-source-write",
          "local-authority",
        ],
        inputFields: ["check"],
        label: "Workspace source save",
        mode: "write",
        requiredCapability: "workspace-source-write",
      },
      status: {
        bootstrapAllowed: true,
        executionRequirements: ["local-filesystem", "workspace-source-read"],
        inputFields: ["includeDeploymentStatus", "targetAlias"],
        label: "Workspace status",
        mode: "read",
        requiredCapability: "workspace-read",
      },
    });
    expect(WORKSPACE_BOOTSTRAP_OPERATION_KINDS).toEqual(["status"]);
    expect(isWorkspaceOperationKind("init")).toBe(true);
    expect(isWorkspaceBrowserOperationKind("init")).toBe(false);
    expect(isWorkspaceBrowserOperationKind("deploymentRefresh")).toBe(false);
    expect(isWorkspaceBrowserOperationKind("credentialSetup")).toBe(true);
    expect(isWorkspaceGatewayOperationKind("credentialSetup")).toBe(true);
    expect(isWorkspaceGatewayOperationKind("deploymentRefresh")).toBe(false);
    expect(
      WORKSPACE_OPERATION_DEFINITIONS.map((definition) => [
        definition.kind,
        Object.keys(definition.bindings),
      ]),
    ).toEqual([
      ["check", ["gateway"]],
      ["credentialSetup", ["gateway"]],
      ["deploymentRefresh", []],
      ["init", []],
      ["pull", ["gateway"]],
      ["push", ["gateway"]],
      ["save", ["gateway"]],
      ["status", ["gateway"]],
    ]);
    expect(
      WORKSPACE_OPERATION_DEFINITIONS.every((definition) => !("cli" in definition.bindings)),
    ).toBe(true);
    expect(JSON.stringify(WORKSPACE_OPERATION_DEFINITIONS)).not.toContain("formless pull");
    expect(JSON.stringify(WORKSPACE_OPERATION_DEFINITIONS)).not.toContain("formless push");

    expect(workspaceOperationDefinitionForKey("workspace.status")).toMatchObject({
      handlerKey: "workspace.status",
      kind: "status",
      mode: "read",
      requiredCapability: "workspace-read",
    });
    expect("gateway" in workspaceOperationDefinitionForKind("init").bindings).toBe(false);
    expect("gateway" in workspaceOperationDefinitionForKind("deploymentRefresh").bindings).toBe(
      false,
    );
    expect(workspaceOperationDefinitionForKind("status").bindings.gateway).toEqual({
      bootstrap: true,
      inputFields: ["includeDeploymentStatus", "targetAlias"],
      requestKind: "status",
    });
    expect("cli" in workspaceOperationDefinitionForKind("save").bindings).toBe(false);
    expect(workspaceOperationDefinitionForKey("workspace.source.save")).toMatchObject({
      handlerKey: "workspace.source.save",
      input: {
        fields: [
          { defaultValue: false, display: "always", key: "check", valueType: "boolean" },
          { display: "when-present", key: "source", valueType: "string" },
          { display: "never", key: "workspacePath", valueType: "string" },
        ],
      },
      kind: "save",
      label: "Workspace source save",
      mode: "write",
      requiredCapability: "workspace-source-write",
    });
    expect(workspaceOperationDefinitionForKind("save").bindings.gateway?.inputFields).toEqual([
      "check",
    ]);
    expect(workspaceGatewayOperationDefinitionForKind("save").key).toBe("workspace.source.save");
    expect(workspaceOperationDefinitionForGatewayRequestKind("save").kind).toBe("save");
    expect(workspaceOperationGatewayRequestKind("save")).toBe("save");
    expect(workspaceOperationGatewayInputFields("save")).toEqual(["check"]);
    expect(workspaceOperationGatewayAllowedRequestFields("save")).toEqual([
      "kind",
      "operation",
      "check",
    ]);
    expect(workspaceOperationDefinitionForKind("pull").bindings.gateway?.inputFields).toEqual([
      "dryRun",
      "targetAlias",
    ]);
    expect(workspaceOperationDefinitionForKind("push").bindings.gateway?.inputFields).toEqual([
      "dryRun",
      "targetAlias",
    ]);
    expect(workspaceOperationInputDefaults("pull")).toEqual({ dryRun: false });
    expect(workspaceOperationInputDefaults("push")).toEqual({ dryRun: false });
    expect(workspaceOperationInputFieldDefaultValue("push", "force")).toBeUndefined();
    expect(workspaceOperationInputFieldDefaultValue("save", "check")).toBe(false);
    expect(workspaceOperationLabel("save")).toBe("Workspace source save");
    expect(workspaceOperationActorPolicy("save").allowedActors).toEqual([
      "automation",
      "browser",
      "cli",
      "system",
    ]);
    expect(
      workspaceOperationExecutionDecision({
        actor: "system",
        capabilities: ["workspace-source-write"],
        kind: "save",
      }),
    ).toEqual({ ok: true });
  });

  it("declares base and effective operation execution requirements", () => {
    const baseExecutionRequirementsByKind = {
      check: ["local-filesystem", "workspace-source-read"],
      credentialSetup: [
        "local-filesystem",
        "workspace-source-read",
        "workspace-source-write",
        "provider-credentials",
      ],
      deploymentRefresh: [
        "local-filesystem",
        "workspace-source-read",
        "remote-target",
        "admin-token",
      ],
      init: ["local-filesystem", "workspace-source-write"],
      pull: [
        "local-filesystem",
        "workspace-source-read",
        "workspace-source-write",
        "remote-target",
        "admin-token",
      ],
      push: ["local-filesystem", "workspace-source-read", "remote-target"],
      save: [
        "local-filesystem",
        "workspace-source-read",
        "workspace-source-write",
        "local-authority",
      ],
      status: ["local-filesystem", "workspace-source-read"],
    } as const;

    expect(WORKSPACE_OPERATION_EXECUTION_REQUIREMENTS).toEqual([
      "workspace-source-read",
      "workspace-source-write",
      "local-filesystem",
      "local-authority",
      "admin-token",
      "remote-target",
      "provider-credentials",
    ]);
    expect(isWorkspaceOperationExecutionRequirement("provider-credentials")).toBe(true);
    expect(isWorkspaceOperationExecutionRequirement("owner-session")).toBe(false);
    expect(isWorkspaceOperationExecutionRequirement("csrf-proof")).toBe(false);
    expect(isWorkspaceOperationExecutionRequirement("formless push")).toBe(false);
    expect(WORKSPACE_OPERATION_CAPABILITIES).toContain("deployment-observe");
    expect(WORKSPACE_OPERATION_EXECUTION_REQUIREMENTS).not.toContain("deployment-observe");
    expect(WORKSPACE_OPERATION_EXECUTION_REQUIREMENTS).toContain("provider-credentials");
    expect(WORKSPACE_OPERATION_CAPABILITIES).not.toContain("provider-credentials");

    expect(
      Object.fromEntries(
        WORKSPACE_OPERATION_DEFINITIONS.map((definition) => [
          definition.kind,
          definition.executionRequirements,
        ]),
      ),
    ).toEqual(baseExecutionRequirementsByKind);
    expect(
      Object.fromEntries(
        WORKSPACE_OPERATION_KINDS.map((kind) => [
          kind,
          workspaceOperationBaseExecutionRequirements(kind),
        ]),
      ),
    ).toEqual(baseExecutionRequirementsByKind);

    for (const definition of WORKSPACE_OPERATION_DEFINITIONS) {
      expect(new Set(definition.executionRequirements).size).toBe(
        definition.executionRequirements.length,
      );
      expect(definition.executionRequirements.every(isWorkspaceOperationExecutionRequirement)).toBe(
        true,
      );
    }

    expect(workspaceOperationEffectiveExecutionRequirements({ kind: "check" })).toEqual(
      baseExecutionRequirementsByKind.check,
    );
    expect(
      workspaceOperationEffectiveExecutionRequirements({
        kind: "check",
        targetAlias: "remote",
      }),
    ).toEqual(["local-filesystem", "workspace-source-read", "remote-target", "admin-token"]);
    expect(
      workspaceOperationEffectiveExecutionRequirements({
        includeDeploymentStatus: false,
        kind: "status",
        targetAlias: "  ",
      }),
    ).toEqual(baseExecutionRequirementsByKind.status);
    expect(
      workspaceOperationEffectiveExecutionRequirements({
        includeDeploymentStatus: true,
        kind: "status",
      }),
    ).toEqual(["local-filesystem", "workspace-source-read", "remote-target", "admin-token"]);
    expect(
      workspaceOperationEffectiveExecutionRequirements({ kind: "push", dryRun: true }),
    ).toEqual(baseExecutionRequirementsByKind.push);
    expect(workspaceOperationEffectiveExecutionRequirements({ kind: "push" })).toEqual([
      "local-filesystem",
      "workspace-source-read",
      "remote-target",
      "admin-token",
      "provider-credentials",
      "workspace-source-write",
    ]);
    expect(
      workspaceOperationExecutionRequirementsMatch({ kind: "push", dryRun: true }, [
        "local-filesystem",
        "workspace-source-read",
        "remote-target",
      ]),
    ).toBe(true);
    expect(
      workspaceOperationExecutionRequirementsMatch({ kind: "push", dryRun: true }, [
        "local-filesystem",
        "workspace-source-read",
        "remote-target",
        "provider-credentials",
      ]),
    ).toBe(false);
    expect(() =>
      assertWorkspaceOperationExecutionRequirements({ kind: "push", dryRun: true }, [
        "local-filesystem",
        "workspace-source-read",
        "remote-target",
        "provider-credentials",
      ]),
    ).toThrow('Workspace operation "push" execution requirements are invalid.');
  });

  it("matches operations against actor policy and required execution capability", () => {
    expect(
      Object.fromEntries(
        ["check", "credentialSetup", "deploymentRefresh", "status"].map((kind) => [
          kind,
          workspaceOperationRequiredCapability(kind as (typeof WORKSPACE_OPERATION_KINDS)[number]),
        ]),
      ),
    ).toEqual({
      check: "workspace-read",
      credentialSetup: "credential-setup",
      deploymentRefresh: "deployment-observe",
      status: "workspace-read",
    });

    expect(workspaceOperationActorAllowed("deploymentRefresh", "browser")).toBe(true);
    expect(workspaceOperationCapabilityAllowed("deploymentRefresh", ["deployment-observe"])).toBe(
      true,
    );
    expect(
      workspaceOperationExecutionDecision({
        actor: "browser",
        capabilities: ["deployment-observe"],
        kind: "deploymentRefresh",
      }),
    ).toEqual({ ok: true });
    expect(
      workspaceOperationExecutionDecision({
        actor: "browser",
        capabilities: ["deployment-apply"],
        kind: "deploymentRefresh",
      }),
    ).toEqual({
      error:
        'Workspace operation "deploymentRefresh" requires execution capability "deployment-observe".',
      ok: false,
      requiredCapability: "deployment-observe",
    });
  });

  it("derives operation mode, bootstrap availability, and display inputs", () => {
    expect(workspaceOperationMode("status")).toBe("read");
    for (const operation of WORKSPACE_OPERATION_KINDS.filter((kind) => kind !== "status")) {
      expect(workspaceOperationMode(operation)).toBe("write");
    }
    expect(workspaceOperationBootstrapAllowed("status")).toBe(true);
    expect(workspaceOperationBootstrapAllowed("save")).toBe(false);

    expect(workspaceOperationInputDisplay({ kind: "init", name: "personal-sites" })).toEqual({
      name: "personal-sites",
    });
    expect(workspaceOperationInputDisplay({ kind: "status" })).toEqual({
      includeDeploymentStatus: false,
    });
    expect(workspaceOperationInputDisplay({ check: true, kind: "save", source: "cli" })).toEqual({
      check: true,
      source: "cli",
    });
    expect(workspaceOperationInputDisplay({ kind: "check", targetAlias: "remote" })).toEqual({
      targetAlias: "remote",
    });
    expect(workspaceOperationInputDisplay({ kind: "pull" })).toEqual({ dryRun: false });
    expect(
      workspaceOperationInputDisplay({
        dryRun: true,
        force: true,
        kind: "push",
        targetAlias: "remote",
      }),
    ).toEqual({
      dryRun: true,
      force: true,
      targetAlias: "remote",
    });
    expect(workspaceOperationInputDisplay({ kind: "deploymentRefresh" })).toEqual({});
    expect(
      workspaceOperationInputDisplay({
        accountId: "account-123",
        kind: "credentialSetup",
        provider: "cloudflare",
      }),
    ).toEqual({ accountId: "account-123", provider: "cloudflare" });
  });

  it("validates ids and parses formatted operation state", () => {
    const state = initialWorkspaceOperationState({
      actor: "browser",
      id: "op_deploy_00000001",
      input: { targetAlias: "remote" },
      now: () => "2026-06-02T00:00:00.000Z",
      operation: "push",
      workspaceLabel: "personal-sites",
      workspaceRoot: "/tmp/personal-sites",
    });

    expect(parseWorkspaceOperationId("op_deploy_00000001")).toEqual({
      ok: true,
      operationId: "op_deploy_00000001",
    });
    expect(parseWorkspaceOperationId("../secret")).toEqual({
      error: "Workspace operation id is invalid.",
      ok: false,
    });
    expect(parseWorkspaceOperationStateJson(formatWorkspaceOperationState(state))).toEqual({
      ...state,
      kind: WORKSPACE_OPERATION_STATE_FILE_KIND,
      version: WORKSPACE_OPERATION_STATE_FILE_VERSION,
    });
    expect(() =>
      parseWorkspaceOperationStateJson(
        JSON.stringify({ ...state, operation: "unsupported-operation" }),
      ),
    ).toThrow("Workspace operation state file is invalid.");
  });

  it("redacts display state before format or update", () => {
    const workspaceRoot = "/tmp/personal-sites";
    const ownerSetupUrl = "https://personal.dpeek.workers.dev/setup?token=owner-setup-secret";
    const state = initialWorkspaceOperationState({
      id: "op_redact_00000001",
      input: {
        rawAdapterOutput: "TOKEN=secret",
        targetAlias: "remote",
        workspaceFile: `${workspaceRoot}/logs/output.txt`,
      },
      now: () => "2026-06-02T00:00:00.000Z",
      operation: "push",
      workspaceLabel: "personal-sites",
      workspaceRoot,
    });
    const updated = nextWorkspaceOperationState(state, {
      events: [
        {
          at: "2026-06-02T00:00:01.000Z",
          profileLabel: "default",
          provider: "cloudflare",
          status: "waiting",
          type: "externalAuthorizationUrl",
          url: "https://dash.cloudflare.com/oauth2/authorize?account=123",
        },
      ],
      logs: [
        {
          at: "2026-06-02T00:00:01.000Z",
          level: "info",
          message: `Bearer secret-token CF_API_TOKEN=secret ${workspaceRoot}/logs/output.txt`,
        },
      ],
      result: {
        deployment: {
          leaseToken: "lease:local-gateway",
          ownerSetupUrl,
          rawAdapterOutput: "TOKEN=secret",
        },
        summary: {
          fields: {
            attemptId: "attempt.deploy.1",
            ownerSetupUrl,
            providerStatePayload: "raw",
          },
          title: "Workspace push applied",
        },
      },
      status: "running",
      steps: [
        {
          detail: `${workspaceRoot}/deploy output`,
          error: "Health check failed with TOKEN=secret",
          fields: {
            expectedUrl: "https://personal.dpeek.workers.dev",
            rawAdapterOutput: "TOKEN=secret",
          },
          id: "health-check",
          label: "Health check",
          status: "failed",
        },
      ],
      summary: {
        fields: {
          credentialRef: "formless-cloudflare-oauth:default",
          credentialToken: "oauth-access-token",
          ownerSetupUrl,
          providerStatePayload: "raw",
          setupUrl: ownerSetupUrl,
        },
        title: "Workspace push applied",
      },
      workspaceRoot,
    });
    const text = formatWorkspaceOperationState(updated);

    expect(updated.input).toMatchObject({
      rawAdapterOutput: "[redacted]",
      targetAlias: "remote",
      workspaceFile: "<workspace>/logs/output.txt",
    });
    expect(updated.logs[0]?.message).toContain("Bearer [redacted]");
    expect(updated.logs[0]?.message).toContain("[redacted]");
    expect(updated.result?.deployment?.leaseToken).toBe("[redacted]");
    expect(updated.result?.deployment?.ownerSetupUrl).toBe(
      "https://personal.dpeek.workers.dev/setup?token=[redacted]",
    );
    expect(updated.result?.deployment?.rawAdapterOutput).toBe("[redacted]");
    expect(updated.result?.summary.fields.ownerSetupUrl).toBe(ownerSetupUrl);
    expect(updated.summary.fields.credentialRef).toBe("formless-cloudflare-oauth:default");
    expect(updated.summary.fields.credentialToken).toBe("[redacted]");
    expect(updated.summary.fields.ownerSetupUrl).toBe(ownerSetupUrl);
    expect(updated.summary.fields.providerStatePayload).toBe("[redacted]");
    expect(updated.summary.fields.setupUrl).toBe(
      "https://personal.dpeek.workers.dev/setup?token=[redacted]",
    );
    expect(updated.steps?.[0]).toMatchObject({
      detail: "<workspace>/deploy output",
      error: "Health check failed with TOKEN=[redacted]",
      fields: {
        expectedUrl: "https://personal.dpeek.workers.dev",
        rawAdapterOutput: "[redacted]",
      },
    });
    expect(updated.events[0]?.url).toBe("https://dash.cloudflare.com/oauth2/authorize?account=123");
    expect(text).not.toContain(workspaceRoot);
    expect(text).not.toContain("oauth-access-token");
    expect(text).not.toContain("secret-token");
    expect(text).toContain(ownerSetupUrl);
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
