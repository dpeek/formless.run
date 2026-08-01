import {
  normalizeInstanceWorkspaceTargetUrl,
  type ResolvedFormlessConfig,
  type InstanceWorkspaceTarget,
} from "@dpeek/formless-workspace";
import {
  INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME,
  readInstanceWorkspaceProgramStorageSnapshot,
  readInstanceWorkspaceSecretState,
  type InstanceWorkspaceSecretState,
} from "../program/workspace.ts";
import type { StoredRecord } from "@dpeek/formless-storage";
import {
  readWorkspaceConfig,
  resolveFormlessInstanceWorkspaceRoot,
} from "./instance-workspace-foundation.ts";
import { stringRecordValue } from "./instance-workspace-control-plane.ts";

export type FormlessCliAdminTokenSource = "env" | "explicit" | "missing" | "stored";

export type FormlessCliResolvedAdminToken = {
  displayLabel: "[redacted]" | "missing";
  source: FormlessCliAdminTokenSource;
  token: string | null;
};

export type FormlessCliTargetContext = {
  adminToken: string | null;
  adminTokenDisplayLabel: "[redacted]" | "missing";
  adminTokenSource: FormlessCliAdminTokenSource;
  display: {
    adminToken: "[redacted]" | "missing";
    selectedTarget: string;
    targetUrl: string | null;
    workspaceRoot: string;
  };
  config: ResolvedFormlessConfig;
  configPath: string;
  secretState: InstanceWorkspaceSecretState;
  selectedTarget?: InstanceWorkspaceTarget;
  targetUrl?: string;
  workspaceRoot: string;
};

export type RequiredFormlessCliTargetContext = FormlessCliTargetContext & {
  selectedTarget: InstanceWorkspaceTarget;
  targetUrl: string;
};

export type FormlessCliWorkspaceTargetCommandName =
  | "check"
  | "deployment refresh"
  | "deploy"
  | "destroy"
  | "domains plan"
  | "domains run"
  | "pull"
  | "push"
  | "status"
  | "token adopt"
  | "token rotate";

export type FormlessCliDeploymentConfigSource = {
  deploymentConfig?: StoredRecord;
};

export type FormlessCliWorkersDevTargetFacts = {
  workerName: string;
  workersDevSubdomain: string;
};

export type ResolveFormlessCliTargetContextInput = {
  commandName: string;
  cwd: string;
  explicitAdminToken?: string | null;
  requireTarget?: boolean;
  targetAlias?: string | null;
  workspacePath?: string | null;
};

export type ResolveFormlessCliTargetContextDependencies = {
  env?: NodeJS.ProcessEnv;
};

export async function resolveFormlessCliTargetContext(
  input: ResolveFormlessCliTargetContextInput,
  dependencies: ResolveFormlessCliTargetContextDependencies,
): Promise<FormlessCliTargetContext> {
  const workspaceRoot = await resolveFormlessInstanceWorkspaceRoot({
    cwd: input.cwd,
    workspacePath: input.workspacePath,
  });
  const { config, configPath } = await readWorkspaceConfig(workspaceRoot);
  const selectedTarget = await resolveFormlessCliWorkspaceTarget({
    commandName: input.commandName,
    config,
    required: input.requireTarget === true,
    targetAlias: input.targetAlias,
    workspaceRoot,
  });
  const secretState = await readInstanceWorkspaceSecretState(workspaceRoot);
  const adminToken = resolveFormlessCliAdminToken({
    env: dependencies.env,
    explicitAdminToken: input.explicitAdminToken,
    secretState,
  });

  return {
    adminToken: adminToken.token,
    adminTokenDisplayLabel: adminToken.displayLabel,
    adminTokenSource: adminToken.source,
    display: {
      adminToken: adminToken.displayLabel,
      selectedTarget: formatFormlessCliSelectedTargetDisplay(selectedTarget),
      targetUrl: selectedTarget?.url ?? null,
      workspaceRoot,
    },
    config,
    configPath,
    secretState,
    ...(selectedTarget === undefined ? {} : { selectedTarget, targetUrl: selectedTarget.url }),
    workspaceRoot,
  };
}

export async function requireFormlessCliTargetContext(
  input: ResolveFormlessCliTargetContextInput,
  dependencies: ResolveFormlessCliTargetContextDependencies,
): Promise<RequiredFormlessCliTargetContext> {
  const context = await resolveFormlessCliTargetContext(
    { ...input, requireTarget: true },
    dependencies,
  );

  if (!context.selectedTarget || !context.targetUrl) {
    throw new Error(`Formless instance ${input.commandName} requires a workspace target.`);
  }

  return context as RequiredFormlessCliTargetContext;
}

export async function requireFormlessCliWorkspaceTarget(input: {
  commandName: FormlessCliWorkspaceTargetCommandName;
  config: ResolvedFormlessConfig;
  targetAlias: string | null | undefined;
  workspaceRoot: string;
}): Promise<InstanceWorkspaceTarget> {
  const target = await resolveFormlessCliWorkspaceTarget({
    ...input,
    required: true,
  });

  if (!target) {
    throw new Error(`Formless instance ${input.commandName} requires a workspace target.`);
  }

  return target;
}

export function resolveFormlessCliAdminToken(input: {
  env?: NodeJS.ProcessEnv;
  explicitAdminToken?: string | null;
  secretState?: InstanceWorkspaceSecretState;
}): FormlessCliResolvedAdminToken {
  const explicit = normalizedFormlessCliAdminToken(input.explicitAdminToken);

  if (explicit) {
    return redactedResolvedAdminToken(explicit, "explicit");
  }

  const envToken = normalizedFormlessCliAdminToken(
    input.env?.[INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME],
  );

  if (envToken) {
    return redactedResolvedAdminToken(envToken, "env");
  }

  const stored = normalizedFormlessCliAdminToken(input.secretState?.adminToken);

  if (stored) {
    return redactedResolvedAdminToken(stored, "stored");
  }

  return {
    displayLabel: "missing",
    source: "missing",
    token: null,
  };
}

export function formlessCliTargetAcceptHeaders(input: {
  adminToken?: string | null;
  headers?: Record<string, string>;
}): Record<string, string> {
  return formlessCliTargetHeaders({
    accept: "application/json",
    adminToken: input.adminToken,
    headers: input.headers,
  });
}

export function formlessCliTargetJsonHeaders(input: {
  adminToken?: string | null;
  headers?: Record<string, string>;
}): Record<string, string> {
  return formlessCliTargetHeaders({
    accept: "application/json",
    adminToken: input.adminToken,
    contentType: "application/json",
    headers: input.headers,
  });
}

export function formlessCliTargetFetchHeaders(input: {
  accept: string;
  adminToken?: string | null;
  contentType?: string;
  headers?: HeadersInit;
}): Headers {
  const headers = new Headers(input.headers);

  headers.set("accept", input.accept);

  if (input.contentType) {
    headers.set("content-type", input.contentType);
  }

  const authorization = formlessCliAdminAuthorizationHeader(input.adminToken);

  if (authorization) {
    headers.set("authorization", authorization);
  }

  return headers;
}

export function formlessCliTargetHeaders(input: {
  accept?: string;
  adminToken?: string | null;
  contentType?: string;
  headers?: Record<string, string>;
}): Record<string, string> {
  const headers: Record<string, string> = {
    ...(input.accept === undefined ? {} : { accept: input.accept }),
    ...(input.contentType === undefined ? {} : { "content-type": input.contentType }),
    ...input.headers,
  };
  const authorization = formlessCliAdminAuthorizationHeader(input.adminToken);

  if (authorization) {
    headers.authorization = authorization;
  }

  return headers;
}

export function formlessCliAdminAuthorizationHeader(adminToken: string | null | undefined) {
  const token = normalizedFormlessCliAdminToken(adminToken);

  return token ? `Bearer ${token}` : undefined;
}

export function formlessCliWorkspaceStatusSecretStateLabel(
  context: Pick<FormlessCliTargetContext, "adminTokenSource" | "secretState">,
): "env" | "missing" | "stored" {
  if (context.adminTokenSource === "env" || context.adminTokenSource === "explicit") {
    return "env";
  }

  return context.secretState.adminToken ? "stored" : "missing";
}

export async function resolveFormlessCliWorkspaceTarget(input: {
  commandName: string;
  config: ResolvedFormlessConfig;
  required: boolean;
  targetAlias: string | null | undefined;
  workspaceRoot: string;
}): Promise<InstanceWorkspaceTarget | undefined> {
  const controlPlane = await readInstanceWorkspaceProgramStorageSnapshot({
    manifest: input.config,
    workspaceRoot: input.workspaceRoot,
  });
  const deploymentConfig = selectFormlessCliDeploymentConfig(
    controlPlane?.records.filter((record) => !record.deletedAt) ?? [],
    input.targetAlias,
    {
      commandName: input.commandName,
      required: input.required,
    },
  );

  return deploymentConfig === undefined
    ? undefined
    : formlessCliTargetFromDeploymentConfig(deploymentConfig, input.commandName);
}

export function selectFormlessCliDeploymentConfig(
  records: readonly StoredRecord[],
  targetAlias: string | null | undefined,
  options: {
    commandName: string;
    required: boolean;
  },
): StoredRecord | undefined {
  const targets = records.filter(
    (record) =>
      record.entity === "deployment-config" &&
      record.values.targetKind === "instance" &&
      record.values.enabled !== false,
  );
  const requestedTargetId = targetAlias?.trim();

  if (requestedTargetId) {
    const target = targets.find(
      (record) =>
        record.id === requestedTargetId ||
        stringRecordValue(record, "targetId") === requestedTargetId,
    );

    if (!target) {
      throw new Error(
        `Formless instance ${options.commandName} target "${requestedTargetId}" was not found.`,
      );
    }

    return target;
  }

  const primary = targets.find(
    (record) => stringRecordValue(record, "targetId") === formlessCliPrimaryTargetId(),
  );

  if (primary) {
    return primary;
  }

  if (targets.length === 1 && targets[0]) {
    return targets[0];
  }

  if (targets.length === 0) {
    if (options.required) {
      throw new Error(
        `Formless instance ${options.commandName} requires an enabled instance deployment-config record.`,
      );
    }

    return undefined;
  }

  throw new Error(
    `Formless instance ${options.commandName} targetAlias is required when multiple deployment configs exist.`,
  );
}

export function selectFormlessCliCredentialSetupDeploymentConfig(
  records: readonly StoredRecord[],
  input: {
    deploymentConfigId?: string | null;
    targetAlias?: string | null;
  } = {},
): StoredRecord | undefined {
  const targets = records.filter(
    (record) =>
      record.entity === "deployment-config" &&
      record.values.targetKind === "instance" &&
      record.values.enabled !== false &&
      record.deletedAt === undefined,
  );
  const requestedDeploymentConfigId = input.deploymentConfigId?.trim();
  const requestedTargetId = normalizeOptionalFormlessCliTargetAlias(input.targetAlias);

  if (requestedDeploymentConfigId) {
    const target = targets.find((record) => record.id === requestedDeploymentConfigId);

    if (!target) {
      throw new Error(
        `Formless Cloudflare OAuth credential setup target "${requestedDeploymentConfigId}" was not found.`,
      );
    }

    return target;
  }

  if (requestedTargetId) {
    const target = targets.find(
      (record) =>
        record.id === requestedTargetId ||
        stringRecordValue(record, "targetId") === requestedTargetId,
    );

    if (!target) {
      throw new Error(
        `Formless Cloudflare OAuth credential setup target "${requestedTargetId}" was not found.`,
      );
    }

    return target;
  }

  const primary = targets.find(
    (record) => stringRecordValue(record, "targetId") === formlessCliPrimaryTargetId(),
  );

  return primary ?? (targets.length === 1 ? targets[0] : undefined);
}

export function formlessCliTargetFromDeploymentConfig(
  record: StoredRecord,
  commandName: string,
): InstanceWorkspaceTarget {
  const targetId = stringRecordValue(record, "targetId") ?? record.id;
  const targetUrl = stringRecordValue(record, "targetUrl");

  if (targetUrl === undefined) {
    throw new Error(
      `Formless instance ${commandName} deployment-config "${targetId}" requires targetUrl.`,
    );
  }

  return {
    alias: targetId,
    url: normalizeInstanceWorkspaceTargetUrl(targetUrl),
  };
}

export function formlessCliDeploymentConfigRecordFromTarget(input: {
  targetAlias: string;
  targetUrl: string;
}): StoredRecord {
  const now = "1970-01-01T00:00:00.000Z";
  const workerName = formlessCliWorkerNameFromWorkersDevUrl(input.targetUrl);

  return {
    id: input.targetAlias,
    entity: "deployment-config",
    values: {
      targetId: input.targetAlias,
      targetKind: "instance",
      label: input.targetAlias,
      enabled: true,
      targetUrl: normalizeInstanceWorkspaceTargetUrl(input.targetUrl),
      providerFamily: "cloudflare",
      ...(workerName === undefined ? {} : { workerName }),
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function formatFormlessCliSelectedTargetDisplay(
  target: InstanceWorkspaceTarget | undefined,
): string {
  return target ? `${target.alias} (${target.url})` : "<none>";
}

export function formlessCliDeploymentWorkerNameFromConfig(input: {
  deploymentConfig?: StoredRecord;
  config: ResolvedFormlessConfig;
}): string {
  const workerName = stringRecordValue(input.deploymentConfig, "workerName")?.trim();

  return workerName === undefined || workerName === "" ? input.config.name : workerName;
}

export function formlessCliWorkersDevTargetUrl(input: {
  workerName: string;
  workersDevSubdomain: string;
}): string {
  return `https://${input.workerName}.${input.workersDevSubdomain}.${formlessCliWorkersDevDomain()}`;
}

export function formlessCliWorkersDevTargetFacts(
  targetUrl: string,
  expectedWorkerName: string | undefined,
): FormlessCliWorkersDevTargetFacts {
  const url = new URL(normalizeInstanceWorkspaceTargetUrl(targetUrl));
  const suffix = `.${formlessCliWorkersDevDomain()}`;

  if (url.protocol !== "https:" || !url.hostname.endsWith(suffix)) {
    throw new Error("Formless push provider reconciliation supports workers.dev target URLs only.");
  }

  const labels = url.hostname.slice(0, -suffix.length).split(".");

  if (labels.length !== 2) {
    throw new Error("Formless push provider reconciliation requires a workers.dev target host.");
  }

  const [workerName, workersDevSubdomain] = labels;

  if (!workerName || !workersDevSubdomain) {
    throw new Error("Formless push provider reconciliation requires a workers.dev target host.");
  }

  if (expectedWorkerName !== undefined && expectedWorkerName !== workerName) {
    throw new Error(
      `Formless push provider target worker "${workerName}" does not match deployment-config.workerName or workspace configuration name "${expectedWorkerName}".`,
    );
  }

  return { workerName, workersDevSubdomain };
}

export function formlessCliSelectWorkspaceWorkerName(
  deploymentConfig: StoredRecord | undefined,
  target: InstanceWorkspaceTarget | undefined,
): string {
  const workerName =
    stringRecordValue(deploymentConfig, "workerName") ??
    formlessCliWorkerNameFromWorkersDevUrl(target?.url);

  if (!workerName) {
    throw new Error(
      "Formless instance command requires deployment-config.workerName or a workers.dev target URL.",
    );
  }

  return workerName;
}

export function formlessCliWorkerNameFromWorkersDevUrl(
  targetUrl: string | undefined,
): string | undefined {
  if (!targetUrl) {
    return undefined;
  }

  const host = new URL(normalizeInstanceWorkspaceTargetUrl(targetUrl)).hostname;
  const suffix = `.${formlessCliWorkersDevDomain()}`;

  if (!host.endsWith(suffix)) {
    return undefined;
  }

  const withoutSuffix = host.slice(0, -suffix.length);
  const [workerName] = withoutSuffix.split(".");

  return workerName || undefined;
}

export function formlessCliPrimaryTargetId() {
  return "instance.primary";
}

function normalizeOptionalFormlessCliTargetAlias(value: string | null | undefined) {
  const normalized = value?.trim();

  return normalized ? normalized : undefined;
}

function redactedResolvedAdminToken(
  token: string,
  source: Exclude<FormlessCliAdminTokenSource, "missing">,
): FormlessCliResolvedAdminToken {
  return {
    displayLabel: "[redacted]",
    source,
    token,
  };
}

function normalizedFormlessCliAdminToken(value: string | null | undefined): string | null {
  const token = value?.trim();

  return token ? token : null;
}

function formlessCliWorkersDevDomain() {
  return "workers.dev";
}
