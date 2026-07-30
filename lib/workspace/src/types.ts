/**
 * Versioned public workspace contract declarations.
 *
 * This file is intentionally import-free. Workspace manifest, workspace state,
 * local state, and operation declarations move here as their surfaces are
 * extracted into this package.
 */
export const FORMLESS_CONFIG_FILE = "formless.ts";
export const FORMLESS_CONFIG_VERSION = 1;
export const FORMLESS_CONFIG_KIND = "formless-instance-workspace";
export const DEFAULT_INSTANCE_WORKSPACE_TARGET_ALIAS = "remote";
export const DEFAULT_INSTANCE_WORKSPACE_ARCHIVE_ROOT = "archives";
export const DEFAULT_INSTANCE_WORKSPACE_STATE_ROOT = "state";
export const DEFAULT_INSTANCE_WORKSPACE_INSTANCE_STATE_PATH = "state/instance.json";
export const DEFAULT_INSTANCE_WORKSPACE_APP_STATE_ROOT = "state/apps";
export const DEFAULT_INSTANCE_WORKSPACE_MEDIA_ROOT = "state/media";
export const DEFAULT_INSTANCE_WORKSPACE_LOCAL_STATE_ROOT = ".formless/local";
export const DEFAULT_INSTANCE_WORKSPACE_SECRET_STATE_ROOT = ".formless";
export const INSTANCE_WORKSPACE_SITE_PUBLIC_RENDERER_EXTENSION = "site.publicRenderer";

export const WORKSPACE_RECORD_STATE_FILE_KIND = "formless.workspaceRecordState";
export const WORKSPACE_RECORD_STATE_FILE_VERSION = 1;
export const WORKSPACE_MEDIA_MANIFEST_FILE = "manifest.json";
export const WORKSPACE_MEDIA_MANIFEST_KIND = "formless.workspaceMedia";
export const WORKSPACE_MEDIA_MANIFEST_VERSION = 1;

export const INSTANCE_WORKSPACE_CONTROL_PLANE_SCHEMA_KEY = "instance-control-plane";
export const INSTANCE_WORKSPACE_PROGRAM_SCHEMA_KEY = "formless-program";
export const INSTANCE_WORKSPACE_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY = "instance";
export const INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_FILE_KIND =
  "formless.instanceControlPlaneRecordSource";
export const INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_FILE_VERSION = 1;
export const INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_ENTITIES = [
  "app-install",
  "route",
  "deployment-config",
] as const;
export const INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_EXCLUDED_ENTITIES = [
  "deploy-desired-resource",
  "deploy-target",
  "deploy-attempt",
  "deploy-evidence-summary",
  "deploy-drift-report",
  "provider-config-ref",
] as const;
export const INSTANCE_WORKSPACE_CONTROL_PLANE_DEPLOYMENT_CONFIG_OBSERVED_FIELDS = [
  "observedStatus",
  "observedAt",
  "observedDesiredStateHash",
  "observedSummary",
  "observedError",
  "observedRunnerId",
] as const;

export const WORKSPACE_OPERATION_STATE_FILE_KIND = "formless.workspaceOperation";
export const WORKSPACE_OPERATION_STATE_FILE_VERSION = 1;
export const WORKSPACE_OPERATION_STATE_ROOT = ".formless/operations";
export const WORKSPACE_AUTO_SAVE_STATE_FILE = "auto-save.json";
export const WORKSPACE_AUTO_SAVE_STATE_FILE_KIND = "formless.workspaceAutoSaveState";
export const WORKSPACE_AUTO_SAVE_STATE_FILE_VERSION = 1;

export type WorkspaceOperationActor = "automation" | "browser" | "cli" | "system";

export type WorkspacePackageLink = {
  manifest: string;
};

export type InstanceWorkspacePackages = {
  links: WorkspacePackageLink[];
};

export type WorkspaceOperationActorPolicy = {
  allowedActors: readonly WorkspaceOperationActor[];
};

export type WorkspaceOperationMode = "read" | "write";

export type WorkspaceOperationRequiredCapability =
  | "credential-setup"
  | "deployment-apply"
  | "deployment-observe"
  | "deployment-plan"
  | "workspace-read"
  | "workspace-source-sync"
  | "workspace-source-write";

export type WorkspaceOperationExecutionRequirement =
  | "admin-token"
  | "local-authority"
  | "local-filesystem"
  | "provider-credentials"
  | "remote-target"
  | "workspace-source-read"
  | "workspace-source-write";

export const WORKSPACE_OPERATION_CAPABILITIES = [
  "workspace-read",
  "workspace-source-write",
  "workspace-source-sync",
  "credential-setup",
  "deployment-plan",
  "deployment-apply",
  "deployment-observe",
] as const satisfies readonly WorkspaceOperationRequiredCapability[];

export const WORKSPACE_OPERATION_EXECUTION_REQUIREMENTS = [
  "workspace-source-read",
  "workspace-source-write",
  "local-filesystem",
  "local-authority",
  "admin-token",
  "remote-target",
  "provider-credentials",
] as const satisfies readonly WorkspaceOperationExecutionRequirement[];

export type WorkspaceOperationInputFieldValueType = "boolean" | "enum" | "string";

export type WorkspaceOperationInputDisplayPolicy = "always" | "never" | "when-present";

export type WorkspaceOperationInputFieldDefinition = {
  allowedValues?: readonly string[];
  defaultValue?: boolean | null | string;
  display: WorkspaceOperationInputDisplayPolicy;
  key: string;
  required?: boolean;
  valueType: WorkspaceOperationInputFieldValueType;
};

export type WorkspaceOperationGatewayBindingDefinition = {
  bootstrap: boolean;
  inputFields: readonly string[];
  requestKind: string;
};

export type WorkspaceOperationDefinitionContract = {
  actorPolicy: WorkspaceOperationActorPolicy;
  bindings: {
    gateway?: WorkspaceOperationGatewayBindingDefinition;
  };
  executionRequirements: readonly WorkspaceOperationExecutionRequirement[];
  handlerKey: string;
  input: {
    fields: readonly WorkspaceOperationInputFieldDefinition[];
  };
  key: string;
  kind: string;
  label: string;
  mode: WorkspaceOperationMode;
  requiredCapability: WorkspaceOperationRequiredCapability;
};

export type WorkspaceOperationExecutionDecision =
  | { ok: true }
  | {
      error: string;
      ok: false;
      requiredCapability?: WorkspaceOperationRequiredCapability;
    };

const allWorkspaceOperationActors = ["automation", "browser", "cli", "system"] as const;

const targetAliasInputField = {
  display: "when-present",
  key: "targetAlias",
  valueType: "string",
} as const;

const workspacePathInputField = {
  display: "never",
  key: "workspacePath",
  valueType: "string",
} as const;

const dryRunInputField = {
  defaultValue: false,
  display: "always",
  key: "dryRun",
  valueType: "boolean",
} as const;

const forceInputField = {
  display: "when-present",
  key: "force",
  valueType: "boolean",
} as const;

export const WORKSPACE_OPERATION_DEFINITIONS = [
  {
    actorPolicy: { allowedActors: allWorkspaceOperationActors },
    bindings: {
      gateway: { bootstrap: false, inputFields: ["targetAlias"], requestKind: "check" },
    },
    executionRequirements: ["local-filesystem", "workspace-source-read"],
    handlerKey: "workspace.source.check",
    input: { fields: [targetAliasInputField, workspacePathInputField] },
    key: "workspace.source.check",
    kind: "check",
    label: "Workspace source check",
    mode: "write",
    requiredCapability: "workspace-read",
  },
  {
    actorPolicy: { allowedActors: allWorkspaceOperationActors },
    bindings: {
      gateway: {
        bootstrap: false,
        inputFields: ["provider", "accountId", "profileLabel"],
        requestKind: "credentialSetup",
      },
    },
    handlerKey: "workspace.credentials.setup",
    input: {
      fields: [
        {
          allowedValues: ["cloudflare"],
          display: "always",
          key: "provider",
          required: true,
          valueType: "enum",
        },
        { display: "when-present", key: "accountId", valueType: "string" },
        { display: "when-present", key: "profileLabel", valueType: "string" },
        workspacePathInputField,
      ],
    },
    executionRequirements: [
      "local-filesystem",
      "workspace-source-read",
      "workspace-source-write",
      "provider-credentials",
    ],
    key: "workspace.credentials.setup",
    kind: "credentialSetup",
    label: "Credential setup",
    mode: "write",
    requiredCapability: "credential-setup",
  },
  {
    actorPolicy: { allowedActors: allWorkspaceOperationActors },
    bindings: {},
    executionRequirements: [
      "local-filesystem",
      "workspace-source-read",
      "remote-target",
      "admin-token",
    ],
    handlerKey: "deployment.refresh",
    input: { fields: [targetAliasInputField, workspacePathInputField] },
    key: "deployment.refresh",
    kind: "deploymentRefresh",
    label: "Deployment refresh",
    mode: "write",
    requiredCapability: "deployment-observe",
  },
  {
    actorPolicy: { allowedActors: allWorkspaceOperationActors },
    bindings: {},
    executionRequirements: ["local-filesystem", "workspace-source-write"],
    handlerKey: "workspace.init",
    input: {
      fields: [
        { display: "when-present", key: "name", valueType: "string" },
        workspacePathInputField,
      ],
    },
    key: "workspace.init",
    kind: "init",
    label: "Workspace init",
    mode: "write",
    requiredCapability: "workspace-source-write",
  },
  {
    actorPolicy: { allowedActors: allWorkspaceOperationActors },
    bindings: {
      gateway: { bootstrap: false, inputFields: ["dryRun", "targetAlias"], requestKind: "pull" },
    },
    executionRequirements: [
      "local-filesystem",
      "workspace-source-read",
      "workspace-source-write",
      "remote-target",
      "admin-token",
    ],
    handlerKey: "workspace.source.pull",
    input: { fields: [dryRunInputField, targetAliasInputField, workspacePathInputField] },
    key: "workspace.source.pull",
    kind: "pull",
    label: "Workspace source pull",
    mode: "write",
    requiredCapability: "workspace-source-sync",
  },
  {
    actorPolicy: { allowedActors: allWorkspaceOperationActors },
    bindings: {
      gateway: {
        bootstrap: false,
        inputFields: ["dryRun", "targetAlias"],
        requestKind: "push",
      },
    },
    executionRequirements: ["local-filesystem", "workspace-source-read", "remote-target"],
    handlerKey: "workspace.source.push",
    input: {
      fields: [dryRunInputField, forceInputField, targetAliasInputField, workspacePathInputField],
    },
    key: "workspace.source.push",
    kind: "push",
    label: "Workspace source push",
    mode: "write",
    requiredCapability: "workspace-source-sync",
  },
  {
    actorPolicy: { allowedActors: allWorkspaceOperationActors },
    bindings: {
      gateway: { bootstrap: false, inputFields: ["check"], requestKind: "save" },
    },
    executionRequirements: [
      "local-filesystem",
      "workspace-source-read",
      "workspace-source-write",
      "local-authority",
    ],
    handlerKey: "workspace.source.save",
    input: {
      fields: [
        { defaultValue: false, display: "always", key: "check", valueType: "boolean" },
        { display: "when-present", key: "source", valueType: "string" },
        workspacePathInputField,
      ],
    },
    key: "workspace.source.save",
    kind: "save",
    label: "Workspace source save",
    mode: "write",
    requiredCapability: "workspace-source-write",
  },
  {
    actorPolicy: { allowedActors: allWorkspaceOperationActors },
    bindings: {
      gateway: {
        bootstrap: true,
        inputFields: ["includeDeploymentStatus", "targetAlias"],
        requestKind: "status",
      },
    },
    handlerKey: "workspace.status",
    input: {
      fields: [
        {
          defaultValue: false,
          display: "always",
          key: "includeDeploymentStatus",
          valueType: "boolean",
        },
        targetAliasInputField,
        workspacePathInputField,
      ],
    },
    executionRequirements: ["local-filesystem", "workspace-source-read"],
    key: "workspace.status",
    kind: "status",
    label: "Workspace status",
    mode: "read",
    requiredCapability: "workspace-read",
  },
] as const satisfies readonly WorkspaceOperationDefinitionContract[];

export type WorkspaceOperationDefinition = (typeof WORKSPACE_OPERATION_DEFINITIONS)[number];

export type WorkspaceOperationDefinitionKey = WorkspaceOperationDefinition["key"];

export type WorkspaceOperationHandlerKey = WorkspaceOperationDefinition["handlerKey"];

export type WorkspaceOperationKind = WorkspaceOperationDefinition["kind"];

export type WorkspaceGatewayOperationDefinition = Extract<
  WorkspaceOperationDefinition,
  { readonly bindings: { readonly gateway: unknown } }
>;

export type WorkspaceGatewayOperationKind = WorkspaceGatewayOperationDefinition["kind"];

export type WorkspaceBrowserOperationDefinition = WorkspaceGatewayOperationDefinition;

export type WorkspaceBrowserOperationKind = WorkspaceGatewayOperationKind;

export type WorkspaceBrowserOperationControlMetadata = {
  bootstrapAllowed: boolean;
  executionRequirements: readonly WorkspaceOperationExecutionRequirement[];
  inputFields: readonly string[];
  kind: WorkspaceBrowserOperationKind;
  label: string;
  mode: WorkspaceOperationMode;
  requiredCapability: WorkspaceOperationRequiredCapability;
};

export const WORKSPACE_OPERATION_KEYS = WORKSPACE_OPERATION_DEFINITIONS.map(
  (definition) => definition.key,
) as WorkspaceOperationDefinitionKey[];

export const WORKSPACE_OPERATION_KINDS = WORKSPACE_OPERATION_DEFINITIONS.map(
  (definition) => definition.kind,
) as WorkspaceOperationKind[];

export const WORKSPACE_GATEWAY_OPERATION_DEFINITIONS = WORKSPACE_OPERATION_DEFINITIONS.filter(
  hasWorkspaceGatewayBinding,
) as readonly WorkspaceGatewayOperationDefinition[];

export const WORKSPACE_GATEWAY_OPERATION_KINDS = WORKSPACE_GATEWAY_OPERATION_DEFINITIONS.map(
  (definition) => definition.kind,
) as WorkspaceGatewayOperationKind[];

export const WORKSPACE_BROWSER_OPERATION_DEFINITIONS = WORKSPACE_GATEWAY_OPERATION_DEFINITIONS;

export const WORKSPACE_BROWSER_OPERATION_KINDS = WORKSPACE_GATEWAY_OPERATION_KINDS;

export const WORKSPACE_BOOTSTRAP_OPERATION_KINDS = WORKSPACE_GATEWAY_OPERATION_DEFINITIONS.filter(
  (definition) => hasWorkspaceGatewayBinding(definition) && definition.bindings.gateway.bootstrap,
).map((definition) => definition.kind) as WorkspaceGatewayOperationKind[];

function hasWorkspaceGatewayBinding(
  definition: WorkspaceOperationDefinition,
): definition is WorkspaceBrowserOperationDefinition {
  return "gateway" in definition.bindings;
}

export type InstanceWorkspaceControlPlaneRecordSourceEntity =
  (typeof INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_ENTITIES)[number];

export type InstanceWorkspaceControlPlaneRecordSourceExcludedEntity =
  (typeof INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_EXCLUDED_ENTITIES)[number];

export type InstanceWorkspaceRecordValue = string | boolean | number;

export type InstanceWorkspaceRecordValues = Record<string, InstanceWorkspaceRecordValue>;

export type InstanceWorkspaceStoredRecord = {
  createdAt: string;
  deletedAt?: string;
  entity: string;
  id: string;
  updatedAt: string;
  values: InstanceWorkspaceRecordValues;
};

export type WorkspaceSourceSchemaHash = `sha256:${string}`;

export type WorkspacePackageAppSchemaProvenance = {
  kind: "package-app";
  packageAppKey: string;
  packageRevision: number;
  sourceSchemaHash: WorkspaceSourceSchemaHash;
};

export type WorkspaceControlPlaneSchemaProvenance = {
  kind: "instance-control-plane";
  sourceSchemaHash: WorkspaceSourceSchemaHash;
};

export type WorkspaceProgramSchemaProvenance = {
  kind: "program";
  sourceSchemaHash: WorkspaceSourceSchemaHash;
};

export type WorkspaceSchemaProvenance =
  | WorkspacePackageAppSchemaProvenance
  | WorkspaceControlPlaneSchemaProvenance
  | WorkspaceProgramSchemaProvenance;

export type WorkspaceRecordStateFileBase<
  Provenance extends WorkspaceSchemaProvenance = WorkspaceSchemaProvenance,
> = {
  kind: typeof WORKSPACE_RECORD_STATE_FILE_KIND;
  version: typeof WORKSPACE_RECORD_STATE_FILE_VERSION;
  storageIdentity: string;
  schemaKey: string;
  exportedAt: string;
  schemaUpdatedAt: string;
  sourceCursor: number;
  schemaProvenance: Provenance;
  records: InstanceWorkspaceStoredRecord[];
};

export type WorkspacePackageAppRecordStateFile =
  WorkspaceRecordStateFileBase<WorkspacePackageAppSchemaProvenance> & {
    storageIdentity: `app:${string}`;
  };

export type WorkspaceControlPlaneRecordStateFile =
  WorkspaceRecordStateFileBase<WorkspaceControlPlaneSchemaProvenance> & {
    storageIdentity: "instance:control-plane";
    schemaKey: typeof INSTANCE_WORKSPACE_CONTROL_PLANE_SCHEMA_KEY;
  };

export type WorkspaceProgramRecordStateFile =
  WorkspaceRecordStateFileBase<WorkspaceProgramSchemaProvenance> & {
    storageIdentity: "instance:control-plane";
    schemaKey: typeof INSTANCE_WORKSPACE_PROGRAM_SCHEMA_KEY;
  };

export type WorkspaceRecordStateFile =
  | WorkspacePackageAppRecordStateFile
  | WorkspaceControlPlaneRecordStateFile
  | WorkspaceProgramRecordStateFile;

export type InstanceWorkspaceControlPlaneRecordSourceControlPlane = {
  schemaKey: typeof INSTANCE_WORKSPACE_CONTROL_PLANE_SCHEMA_KEY;
  schemaUpdatedAt: string;
  records: InstanceWorkspaceStoredRecord[];
};

export type InstanceWorkspaceControlPlaneRecordSourceFile = {
  kind: typeof INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_FILE_KIND;
  version: typeof INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_FILE_VERSION;
  schemaKey: typeof INSTANCE_WORKSPACE_CONTROL_PLANE_SCHEMA_KEY;
  schemaUpdatedAt: string;
  entity: string;
  records: InstanceWorkspaceStoredRecord[];
};

export type WorkspaceOperationStatus = "failed" | "queued" | "running" | "succeeded";

export type WorkspaceOperationDisplayValue =
  | boolean
  | null
  | number
  | string
  | WorkspaceOperationDisplayValue[]
  | { [key: string]: WorkspaceOperationDisplayValue };

export type WorkspaceOperationDisplayObject = {
  [key: string]: WorkspaceOperationDisplayValue;
};

export type WorkspaceOperationSummary = {
  fields: WorkspaceOperationDisplayObject;
  title: string;
};

export type WorkspaceOperationLog = {
  at: string;
  id: string;
  level: "error" | "info" | "warning";
  message: string;
};

export type WorkspaceOperationError = {
  at: string;
  message: string;
};

export type WorkspaceOperationStepStatus =
  | "failed"
  | "pending"
  | "running"
  | "skipped"
  | "succeeded";

export type WorkspaceOperationStep = {
  detail?: string;
  error?: string;
  fields?: WorkspaceOperationDisplayObject;
  id: string;
  label: string;
  status: WorkspaceOperationStepStatus;
};

export type WorkspaceOperationExternalAuthorizationEvent = {
  at: string;
  id: string;
  profileLabel: string;
  provider: "alchemy" | "cloudflare";
  status: "waiting";
  type: "externalAuthorizationUrl";
  url: string;
};

export type WorkspaceOperationEvent = WorkspaceOperationExternalAuthorizationEvent;

export type WorkspaceOperationResult = {
  deployment?: WorkspaceOperationDisplayObject;
  details?: WorkspaceOperationDisplayObject;
  steps?: WorkspaceOperationStep[];
  summary: WorkspaceOperationSummary;
};

export type WorkspaceOperationState = {
  actor: WorkspaceOperationActor;
  completedAt?: string;
  createdAt: string;
  errors: WorkspaceOperationError[];
  events: WorkspaceOperationEvent[];
  id: string;
  input: WorkspaceOperationDisplayObject;
  kind: typeof WORKSPACE_OPERATION_STATE_FILE_KIND;
  logs: WorkspaceOperationLog[];
  operation: WorkspaceOperationKind;
  result?: WorkspaceOperationResult;
  startedAt?: string;
  status: WorkspaceOperationStatus;
  steps?: WorkspaceOperationStep[];
  summary: WorkspaceOperationSummary;
  updatedAt: string;
  version: typeof WORKSPACE_OPERATION_STATE_FILE_VERSION;
  workspace: {
    label: string;
  };
};

export const WORKSPACE_AUTO_SAVE_WRITE_SOURCES = [
  "app-operation",
  "app-install",
  "control-plane-write",
  "deployment-intent",
  "media-reference",
  "reset-schema",
  "schema-save",
  "snapshot-restore",
] as const;

export type WorkspaceAutoSaveWriteSource = (typeof WORKSPACE_AUTO_SAVE_WRITE_SOURCES)[number];

export const WORKSPACE_AUTO_SAVE_SUPPRESSION_REASONS = [
  "auto-save",
  "browser-bootstrap",
  "broadcast-indexeddb-merge",
  "gateway-operation-state",
  "http-sync",
  "local-bootstrap",
  "manual-save",
  "push-deploy-remote-apply",
  "push-sync",
  "workspace-check-status",
  "workspace-pull",
  "workspace-restore-import",
] as const;

export type WorkspaceAutoSaveSuppressionReason =
  (typeof WORKSPACE_AUTO_SAVE_SUPPRESSION_REASONS)[number];

export type WorkspaceAutoSaveDisplayState =
  | "clean"
  | "dirty"
  | "failed"
  | "queued"
  | "saved"
  | "saving";

export type WorkspaceAutoSaveDisplayError = {
  at: string;
  message: string;
};

export type WorkspaceAutoSaveSuppression = {
  at: string;
  reason: WorkspaceAutoSaveSuppressionReason;
};

export type WorkspaceAutoSaveState = {
  dirtyGeneration: number;
  displayState: WorkspaceAutoSaveDisplayState;
  error?: WorkspaceAutoSaveDisplayError;
  inFlightGeneration?: number;
  kind: typeof WORKSPACE_AUTO_SAVE_STATE_FILE_KIND;
  lastAttemptAt?: string;
  lastEnqueueAt?: string;
  lastSavedAt?: string;
  retryCount: number;
  savedGeneration: number;
  storageIdentities: string[];
  suppressed?: WorkspaceAutoSaveSuppression;
  updatedAt: string;
  version: typeof WORKSPACE_AUTO_SAVE_STATE_FILE_VERSION;
  writeSources: WorkspaceAutoSaveWriteSource[];
};

export type WorkspaceAutoSaveEnqueueInput = {
  source: WorkspaceAutoSaveWriteSource;
  storageIdentity?: string;
};

export type InitWorkspaceOperationInput = {
  kind: "init";
  name?: string | null;
  workspacePath?: string | null;
};

export type StatusWorkspaceOperationInput = {
  includeDeploymentStatus?: boolean;
  kind: "status";
  targetAlias?: string | null;
  workspacePath?: string | null;
};

export type SaveWorkspaceOperationInput = {
  check?: boolean;
  kind: "save";
  source?: string | null;
  workspacePath?: string | null;
};

export type CheckWorkspaceOperationInput = {
  kind: "check";
  targetAlias?: string | null;
  workspacePath?: string | null;
};

export type PullWorkspaceOperationInput = {
  dryRun?: boolean;
  kind: "pull";
  targetAlias?: string | null;
  workspacePath?: string | null;
};

export type PushWorkspaceOperationInput = {
  dryRun?: boolean;
  force?: boolean;
  kind: "push";
  targetAlias?: string | null;
  workspacePath?: string | null;
};

export type DeploymentRefreshWorkspaceOperationInput = {
  kind: "deploymentRefresh";
  targetAlias?: string | null;
  workspacePath?: string | null;
};

export type CredentialSetupWorkspaceOperationInput = {
  accountId?: string | null;
  kind: "credentialSetup";
  profileLabel?: string | null;
  provider: "cloudflare";
  workspacePath?: string | null;
};

export type WorkspaceOperationInput =
  | CheckWorkspaceOperationInput
  | CredentialSetupWorkspaceOperationInput
  | DeploymentRefreshWorkspaceOperationInput
  | InitWorkspaceOperationInput
  | PullWorkspaceOperationInput
  | PushWorkspaceOperationInput
  | SaveWorkspaceOperationInput
  | StatusWorkspaceOperationInput;

export type RunnableWorkspaceOperationInput = Exclude<
  WorkspaceOperationInput,
  CredentialSetupWorkspaceOperationInput
>;

export type WorkspaceOperationSaveStartInput = {
  check?: boolean;
  kind: "save";
};

export type WorkspaceOperationStatusStartInput = {
  includeDeploymentStatus?: boolean;
  kind: "status";
  targetAlias?: string | null;
};

export type WorkspaceOperationCheckOrPullStartInput = {
  dryRun?: boolean;
  kind: "check" | "pull";
  targetAlias?: string | null;
};

export type WorkspaceOperationPushStartInput = {
  dryRun?: boolean;
  force?: boolean;
  kind: "push";
  targetAlias?: string | null;
};

export type WorkspaceOperationCredentialSetupStartInput = {
  accountId?: string | null;
  kind: "credentialSetup";
  profileLabel?: string | null;
  provider: "cloudflare";
};

export type WorkspaceOperationStartInput =
  | WorkspaceOperationCheckOrPullStartInput
  | WorkspaceOperationCredentialSetupStartInput
  | WorkspaceOperationPushStartInput
  | WorkspaceOperationSaveStartInput
  | WorkspaceOperationStatusStartInput;

export type WorkspaceOperationIdParseResult =
  | { ok: true; operationId: string }
  | { error: string; ok: false };

export type InitialWorkspaceOperationStateInput = {
  actor?: WorkspaceOperationActor;
  id: string;
  input: WorkspaceOperationDisplayObject;
  operation: WorkspaceOperationKind;
  now: () => string;
  workspaceLabel: string;
  workspaceRoot: string;
};

export type UpdateWorkspaceOperationStateInput = {
  errors?: readonly { message: string }[];
  events?: readonly Omit<WorkspaceOperationEvent, "id">[];
  logs?: readonly Omit<WorkspaceOperationLog, "id">[];
  result?: WorkspaceOperationResult;
  status?: WorkspaceOperationStatus;
  steps?: readonly WorkspaceOperationStep[];
  summary?: WorkspaceOperationSummary;
  workspaceRoot: string;
};

export type InstanceWorkspaceDomainProfile = "app" | "instance" | "publicSite";

export type InstanceWorkspaceTarget = {
  alias: string;
  url: string;
};

export type InstanceWorkspaceState = {
  root: string;
};

export type InstanceWorkspaceMedia = {
  root: string;
};

export type InstanceWorkspaceLocalState = {
  stateRoot: string;
  secretStateRoot: string;
};

export type InstanceWorkspaceRuntime = {
  extensions?: InstanceWorkspaceRuntimeExtensions;
};

export type InstanceWorkspaceRuntimeExtensions = {
  [INSTANCE_WORKSPACE_SITE_PUBLIC_RENDERER_EXTENSION]?: InstanceWorkspaceSitePublicRendererExtension;
};

export type InstanceWorkspaceSitePublicRendererExtension = {
  browser: string;
  worker: string;
};

export type FormlessConfig = {
  name: string;
  state?: FormlessConfigState;
  media?: FormlessConfigMedia;
  local?: FormlessConfigLocalState;
  packages?: FormlessConfigPackages;
  runtime?: FormlessConfigRuntime;
};

export type FormlessConfigState = {
  root?: string;
};

export type FormlessConfigMedia = {
  root?: string;
};

export type FormlessConfigLocalState = {
  stateRoot?: string;
  secretStateRoot?: string;
};

export type FormlessConfigPackages = {
  links?: readonly WorkspacePackageLink[];
};

export type FormlessConfigRuntime = {
  extensions?: InstanceWorkspaceRuntimeExtensions;
};

export type ResolvedFormlessConfig = {
  version: typeof FORMLESS_CONFIG_VERSION;
  kind: typeof FORMLESS_CONFIG_KIND;
  name: string;
  state: InstanceWorkspaceState;
  media: InstanceWorkspaceMedia;
  local: InstanceWorkspaceLocalState;
  packages: InstanceWorkspacePackages;
  runtime: ResolvedFormlessConfigRuntime;
};

export type ResolvedFormlessConfigRuntime = {
  extensions: InstanceWorkspaceRuntimeExtensions;
};

export type InstanceWorkspaceApp = {
  installId: string;
  packageAppKey: string;
  label: string;
  statePath: string;
  routes?: InstanceWorkspaceAppRoutes;
};

export type InstanceWorkspaceAppRoutes = {
  admin?: `/apps/${string}`;
  public?: `/sites/${string}`;
};

export type InstanceWorkspaceDomainIntent = {
  enabled: boolean;
  host: string;
  profile: InstanceWorkspaceDomainProfile;
  targetInstallId?: string;
};
