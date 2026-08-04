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
export const DEFAULT_INSTANCE_WORKSPACE_MEDIA_ROOT = "state/media";
export const DEFAULT_INSTANCE_WORKSPACE_LOCAL_STATE_ROOT = ".formless/local";
export const DEFAULT_INSTANCE_WORKSPACE_SECRET_STATE_ROOT = ".formless";
export const INSTANCE_WORKSPACE_SITE_PUBLIC_RENDERER_EXTENSION = "site.publicRenderer";
export const DEFAULT_FORMLESS_PROGRAM_SHARED_RUNTIME_MODULE =
  "@dpeek/formless/program/default/shared";
export const DEFAULT_FORMLESS_PROGRAM_BROWSER_RUNTIME_MODULE =
  "@dpeek/formless/program/default/browser";
export const DEFAULT_FORMLESS_PROGRAM_WORKER_RUNTIME_MODULE =
  "@dpeek/formless/program/default/worker";

export const WORKSPACE_RECORD_STATE_FILE_KIND = "formless.workspaceRecordState";
export const WORKSPACE_RECORD_STATE_FILE_VERSION = 1;
export const WORKSPACE_MEDIA_MANIFEST_FILE = "manifest.json";
export const WORKSPACE_MEDIA_MANIFEST_KIND = "formless.workspaceMedia";
export const WORKSPACE_MEDIA_LEGACY_MANIFEST_VERSION = 1;
export const WORKSPACE_MEDIA_MANIFEST_VERSION = 2;

export type WorkspaceMediaManifestVersion =
  | typeof WORKSPACE_MEDIA_LEGACY_MANIFEST_VERSION
  | typeof WORKSPACE_MEDIA_MANIFEST_VERSION;

export const INSTANCE_WORKSPACE_PROGRAM_SCHEMA_KEY = "formless-program";

export type WorkspaceOperationActor = "automation" | "browser" | "cli" | "system";

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

export type WorkspaceOperationDefinitionContract = {
  actorPolicy: WorkspaceOperationActorPolicy;
  executionRequirements: readonly WorkspaceOperationExecutionRequirement[];
  handlerKey: string;
  key: string;
  kind: string;
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

export const WORKSPACE_OPERATION_DEFINITIONS = [
  {
    actorPolicy: { allowedActors: allWorkspaceOperationActors },
    executionRequirements: ["local-filesystem", "workspace-source-read"],
    handlerKey: "workspace.source.check",
    key: "workspace.source.check",
    kind: "check",
    mode: "write",
    requiredCapability: "workspace-read",
  },
  {
    actorPolicy: { allowedActors: allWorkspaceOperationActors },
    handlerKey: "workspace.credentials.setup",
    executionRequirements: [
      "local-filesystem",
      "workspace-source-read",
      "workspace-source-write",
      "provider-credentials",
    ],
    key: "workspace.credentials.setup",
    kind: "credentialSetup",
    mode: "write",
    requiredCapability: "credential-setup",
  },
  {
    actorPolicy: { allowedActors: allWorkspaceOperationActors },
    executionRequirements: [
      "local-filesystem",
      "workspace-source-read",
      "remote-target",
      "admin-token",
    ],
    handlerKey: "deployment.refresh",
    key: "deployment.refresh",
    kind: "deploymentRefresh",
    mode: "write",
    requiredCapability: "deployment-observe",
  },
  {
    actorPolicy: { allowedActors: allWorkspaceOperationActors },
    executionRequirements: ["local-filesystem", "workspace-source-write"],
    handlerKey: "workspace.init",
    key: "workspace.init",
    kind: "init",
    mode: "write",
    requiredCapability: "workspace-source-write",
  },
  {
    actorPolicy: { allowedActors: allWorkspaceOperationActors },
    executionRequirements: [
      "local-filesystem",
      "workspace-source-read",
      "workspace-source-write",
      "remote-target",
      "admin-token",
    ],
    handlerKey: "workspace.source.pull",
    key: "workspace.source.pull",
    kind: "pull",
    mode: "write",
    requiredCapability: "workspace-source-sync",
  },
  {
    actorPolicy: { allowedActors: allWorkspaceOperationActors },
    executionRequirements: ["local-filesystem", "workspace-source-read", "remote-target"],
    handlerKey: "workspace.source.push",
    key: "workspace.source.push",
    kind: "push",
    mode: "write",
    requiredCapability: "workspace-source-sync",
  },
  {
    actorPolicy: { allowedActors: allWorkspaceOperationActors },
    executionRequirements: [
      "local-filesystem",
      "workspace-source-read",
      "workspace-source-write",
      "local-authority",
    ],
    handlerKey: "workspace.source.save",
    key: "workspace.source.save",
    kind: "save",
    mode: "write",
    requiredCapability: "workspace-source-write",
  },
  {
    actorPolicy: { allowedActors: allWorkspaceOperationActors },
    handlerKey: "workspace.status",
    executionRequirements: ["local-filesystem", "workspace-source-read"],
    key: "workspace.status",
    kind: "status",
    mode: "read",
    requiredCapability: "workspace-read",
  },
] as const satisfies readonly WorkspaceOperationDefinitionContract[];

export type WorkspaceOperationDefinition = (typeof WORKSPACE_OPERATION_DEFINITIONS)[number];

export type WorkspaceOperationDefinitionKey = WorkspaceOperationDefinition["key"];

export type WorkspaceOperationHandlerKey = WorkspaceOperationDefinition["handlerKey"];

export type WorkspaceOperationKind = WorkspaceOperationDefinition["kind"];

export const WORKSPACE_OPERATION_KEYS = WORKSPACE_OPERATION_DEFINITIONS.map(
  (definition) => definition.key,
) as WorkspaceOperationDefinitionKey[];

export const WORKSPACE_OPERATION_KINDS = WORKSPACE_OPERATION_DEFINITIONS.map(
  (definition) => definition.kind,
) as WorkspaceOperationKind[];

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

export type WorkspaceProgramSchemaProvenance = {
  kind: "program";
  sourceSchemaHash: WorkspaceSourceSchemaHash;
};

export type WorkspaceSchemaProvenance = WorkspaceProgramSchemaProvenance;

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

export type WorkspaceProgramRecordStateFile =
  WorkspaceRecordStateFileBase<WorkspaceProgramSchemaProvenance> & {
    storageIdentity: "instance:control-plane";
    schemaKey: typeof INSTANCE_WORKSPACE_PROGRAM_SCHEMA_KEY;
  };

export type WorkspaceRecordStateFile = WorkspaceProgramRecordStateFile;

export const WORKSPACE_AUTO_SAVE_WRITE_SOURCES = [
  "control-plane-write",
  "deployment-intent",
  "media-reference",
  "reset-schema",
  "schema-save",
  "snapshot-restore",
] as const;

export type WorkspaceAutoSaveWriteSource = (typeof WORKSPACE_AUTO_SAVE_WRITE_SOURCES)[number];

export type WorkspaceAutoSaveEnqueueInput = {
  source: WorkspaceAutoSaveWriteSource;
};

export type InstanceWorkspaceDomainProfile = "instance" | "publicSite";

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
  composition: InstanceWorkspaceRuntimeComposition;
  extensions?: InstanceWorkspaceRuntimeExtensions;
};

export type InstanceWorkspaceRuntimeComposition = {
  shared: string;
  browser: string;
  worker: string;
};

export type InstanceWorkspaceRuntimeExtensions = {
  [INSTANCE_WORKSPACE_SITE_PUBLIC_RENDERER_EXTENSION]?: InstanceWorkspaceSitePublicRendererExtension;
};

export type InstanceWorkspaceSitePublicRendererExtension = {
  browser: string;
  worker: string;
};

export type FormlessConfigBase = {
  name: string;
  state?: FormlessConfigState;
  media?: FormlessConfigMedia;
  local?: FormlessConfigLocalState;
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

export type FormlessConfigRuntime = {
  composition?: InstanceWorkspaceRuntimeComposition;
  extensions?: InstanceWorkspaceRuntimeExtensions;
};

export type ResolvedFormlessConfigBase = {
  version: typeof FORMLESS_CONFIG_VERSION;
  kind: typeof FORMLESS_CONFIG_KIND;
  name: string;
  state: InstanceWorkspaceState;
  media: InstanceWorkspaceMedia;
  local: InstanceWorkspaceLocalState;
  runtime: ResolvedFormlessConfigRuntime;
};

export type ResolvedFormlessConfigRuntime = {
  composition: InstanceWorkspaceRuntimeComposition;
  extensions: InstanceWorkspaceRuntimeExtensions;
};

export type InstanceWorkspaceDomainIntent = {
  enabled: boolean;
  host: string;
  profile: InstanceWorkspaceDomainProfile;
};
