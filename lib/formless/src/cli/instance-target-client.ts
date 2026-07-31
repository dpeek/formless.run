import {
  DEPLOYMENT_DESIRED_STATE_API_PATH,
  DEPLOYMENT_STATUS_API_PATH,
  deployDeploymentObservationPatchIdempotencyKey,
  deployDeploymentObservationPatchValues,
  deployControlPlaneActorHeaders,
  deployControlPlaneBootstrapPath,
  deployControlPlaneRecordsByEntity,
  deployDesiredStateVersionRef,
  parseDeployDesiredStateResponse,
  parseDeployLatestStatusResponse,
  type DeployDeploymentObservationPatch,
  type DeployControlPlaneProtocolActorKind,
  type DeployControlPlaneRecord,
  type DeployDesiredStateResponse,
  type DeployDesiredStateVersionRef,
  type DeployControlPlaneBootstrapResponse,
  type DeployLatestStatusResponse,
} from "@dpeek/formless-deploy/client";
import {
  FORMLESS_DEPLOY_METADATA_PATH,
  FORMLESS_RUNTIME_PROTOCOL_VERSION,
  FORMLESS_STORAGE_MIGRATION_SET_ID,
  deployPackageAppMetadataFromResolver,
  type FormlessDeployMetadata,
  type FormlessDeployPackageAppMetadata,
} from "../shared/deploy-metadata.ts";
import {
  INSTANCE_DEPLOYMENT_ATTEMPT_FAILURE_API_PATH,
  INSTANCE_DEPLOYMENT_ATTEMPT_HEARTBEAT_API_PATH,
  INSTANCE_DEPLOYMENT_ATTEMPT_PLAN_API_PATH,
  INSTANCE_DEPLOYMENT_ATTEMPT_START_API_PATH,
  INSTANCE_DEPLOYMENT_ATTEMPT_SUCCESS_API_PATH,
  INSTANCE_DEPLOYMENT_DRIFT_API_PATH,
  type InstanceDeploymentAttemptFailureWritebackRequest,
  type InstanceDeploymentAttemptFailureWritebackResponse,
  type InstanceDeploymentAttemptHeartbeatRequest,
  type InstanceDeploymentAttemptHeartbeatResponse,
  type InstanceDeploymentAttemptPlanWritebackRequest,
  type InstanceDeploymentAttemptPlanWritebackResponse,
  type InstanceDeploymentAttemptStartRequest,
  type InstanceDeploymentAttemptStartResponse,
  type InstanceDeploymentAttemptSuccessWritebackRequest,
  type InstanceDeploymentAttemptSuccessWritebackResponse,
  type InstanceDeploymentDriftWritebackRequest,
  type InstanceDeploymentDriftWritebackResponse,
} from "../shared/deployment-runtime.ts";
import {
  INSTANCE_DOMAIN_PROVIDER_API_PATH,
  INSTANCE_DOMAIN_PROVIDER_DELETE_API_PATH,
  INSTANCE_DOMAIN_PROVIDER_DELETE_JOBS_API_PATH,
  INSTANCE_DOMAIN_PROVIDER_MANUAL_CLEANUP_API_PATH,
  type InstanceDomainProviderDeleteJobResultRequest,
  type InstanceDomainProviderDeleteJobResponse,
  type InstanceDomainProviderDeleteRequest,
  type InstanceDomainProviderDeleteResponse,
  type InstanceDomainProviderManualCleanupRequest,
  type InstanceDomainProviderManualCleanupResponse,
  type InstanceDomainProviderPlanResponse,
} from "../shared/domain-provider-api.ts";
import { type InstanceControlPlaneRouteTargetProfile } from "@dpeek/formless-instance-control-plane";
import { FORMLESS_PROGRAM_API_ROUTE_PREFIX } from "../program/target.ts";
import type { DomainProviderPlanPolicy } from "../shared/domain-provider-protocol.ts";
import {
  packageAppFactsForKey,
  parseAppInstallRegistrationOperation,
  parseAppInstallRegistrationPolicy,
  type AppInstall,
  type AppInstallRegistrationPolicy,
  type InstallableAppPackage,
  type PackageAppKey,
} from "@dpeek/formless-installed-apps";
import {
  bundledAppPackageResolver,
  findResolvedAppPackage,
  isRuntimeInstallableAppPackageKey,
  listResolvedAppPackages,
  type AppPackageResolver,
  type ResolvedAppPackage,
} from "../shared/app-packages.ts";
import type {
  InstanceDomainMappingProfile,
  RecordInstanceDomainMappingApplyEvidenceRequest,
  RecordInstanceDomainMappingApplyEvidenceResponse,
} from "../shared/instance-domain-mappings.ts";
import { normalizeInstanceDomainHost } from "../shared/instance-domain-mappings.ts";
import type { AppInstallsResponse, OwnerSetupStatusResponse } from "../shared/protocol.ts";
import type { OperationInvocationResponse } from "../shared/operation-invocation.ts";
import { createOperationId } from "../shared/ids.ts";
import {
  isSourceSchemaHash,
  isUpgradeMigrationChecksum,
  type PackageAppRevision,
  type SourceSchemaHash,
} from "../shared/upgrade-migrations.ts";
import {
  INSTANCE_UPGRADE_APPLY_API_PATH,
  INSTANCE_UPGRADE_STATUS_API_PATH,
  type InstanceUpgradeApplyResponse,
  type InstanceUpgradeStatusResponse,
  type UpgradePackageAppMigrationAppliedState,
} from "../shared/upgrade-status.ts";
import type { PortableArchiveInputStatus } from "./archive-input-status.ts";
import { normalizeInstanceWorkspaceTargetUrl } from "@dpeek/formless-workspace";
import {
  formlessCliTargetAcceptHeaders,
  formlessCliTargetJsonHeaders,
} from "./instance-target-context.ts";

const OWNER_SETUP_STATUS_API_PATH = "/api/formless/setup";
const APP_INSTALLS_API_PATH = "/api/formless/app-installs";
const PACKAGE_MIGRATIONS_APPLY_PATH_SUFFIX = "/package-migrations/apply";
const DOMAIN_MAPPINGS_API_PATH = "/api/formless/domain-mappings";
const DOMAIN_MAPPINGS_APPLY_EVIDENCE_API_PATH = `${DOMAIN_MAPPINGS_API_PATH}/apply-evidence`;

export type InstanceDeploymentDesiredStateResponse = DeployDesiredStateResponse;
export type InstanceDeploymentStatusResponse = DeployLatestStatusResponse;

export type FormlessInstanceTargetStatus = {
  appRegistry: AppInstallsResponse;
  deployMetadata: FormlessInstanceTargetDeployMetadata;
  deployment?: InstanceDeploymentStatusResponse;
  ownerSetup: OwnerSetupStatusResponse;
  targetUrl: string;
  upgradeStatus: FormlessInstanceTargetUpgradeStatus;
};

export type FormlessInstanceControlPlaneRecords = {
  actorKind: DeployControlPlaneProtocolActorKind;
  appInstalls: DeployControlPlaneRecord[];
  appRoutes: DeployControlPlaneRecord[];
  deploymentConfigs: DeployControlPlaneRecord[];
  domainMappings: DeployControlPlaneRecord[];
  records: DeployControlPlaneRecord[];
  redirectIntents: DeployControlPlaneRecord[];
};

export type FormlessInstanceDeploymentCommandContext = {
  controlPlane?: FormlessInstanceControlPlaneRecords;
  desiredState: InstanceDeploymentDesiredStateResponse;
  desiredStateRef: DeployDesiredStateVersionRef;
  status: InstanceDeploymentStatusResponse;
};

export type FormlessInstanceDeploymentObservationPatch = DeployDeploymentObservationPatch;

export type FormlessInstanceTargetDeployMetadata = {
  cacheControl: string;
  metadataUrl: string;
  packageApps: FormlessDeployPackageAppMetadata[];
  packageVersion: string | null;
  runtimeProtocolVersion: number;
  storageMigrationSet: string;
  version: string | null;
};

export type FormlessInstanceTargetUpgradeStatus = {
  archiveInput: PortableArchiveInputStatus;
  deployedMetadata: FormlessInstanceTargetDeployMetadata;
  deployment?: InstanceDeploymentStatusResponse;
  installedApps: FormlessInstanceTargetInstalledAppUpgradeFacts[];
  localPackages: FormlessInstanceTargetLocalPackageUpgradeFacts[];
  verificationFailures: FormlessInstanceTargetUpgradeVerificationFailure[];
};

export type FormlessInstanceTargetLocalPackageUpgradeFacts = {
  packageAppKey: PackageAppKey;
  packageRevision: PackageAppRevision;
  sourceSchemaHash: SourceSchemaHash;
};

export type FormlessInstanceTargetInstalledAppUpgradeFacts = {
  installId: string;
  packageAppKey: PackageAppKey;
  packageRevision: PackageAppRevision;
  sourceSchemaHash: SourceSchemaHash;
};

export type FormlessInstanceTargetUpgradeVerificationFailureCode =
  | "deploy-metadata-cacheable"
  | "deploy-metadata-package-app-facts-missing"
  | "deploy-metadata-package-app-missing"
  | "deploy-metadata-package-apps-missing"
  | "deploy-metadata-package-version-missing"
  | "deploy-metadata-runtime-protocol-version-missing"
  | "deploy-metadata-storage-migration-set-missing"
  | "deployment-status-unavailable"
  | "installed-app-package-facts-missing"
  | "local-package-facts-missing";

export type FormlessInstanceTargetUpgradeVerificationFailure = {
  code: FormlessInstanceTargetUpgradeVerificationFailureCode;
  installId?: string;
  message: string;
  packageAppKey?: PackageAppKey;
  source: "deployed-metadata" | "deployment-status" | "installed-app" | "local-package";
};

export type FormlessInstanceTargetClientDependencies = {
  fetch: typeof fetch;
};

export type DisableFormlessInstanceDomainRouteRequest = {
  host: string;
  profile?: InstanceDomainMappingProfile;
};

export type DisableFormlessInstanceDomainRedirectRequest = {
  fromHost: string;
};

export type FormlessInstancePackageMigrationApplyResponse = {
  applied: UpgradePackageAppMigrationAppliedState[];
  changes: unknown[];
  cursor: number;
  packageAppKey: PackageAppKey;
  packageRevision: PackageAppRevision;
  schemaUpdatedAt: string;
  skipped: UpgradePackageAppMigrationAppliedState[];
  sourceSchemaHash: SourceSchemaHash;
};

export class FormlessInstanceTargetRequestError extends Error {
  readonly responseBody: string;
  readonly status: number;
  constructor(
    message: string,
    input: {
      responseBody: string;
      status: number;
    },
  ) {
    super(message);
    this.name = "FormlessInstanceTargetRequestError";
    this.responseBody = input.responseBody;
    this.status = input.status;
  }
}

type FormlessInstanceDeployMetadataReadResult = {
  deployMetadata: FormlessInstanceTargetDeployMetadata;
  factPresence: FormlessInstanceDeployMetadataFactPresence;
};

type FormlessInstanceDeployMetadataFactPresence = {
  packageApps: boolean;
  packageVersion: boolean;
  runtimeProtocolVersion: boolean;
  storageMigrationSet: boolean;
  packageAppFacts: FormlessInstancePackageAppFactPresence[];
};

type FormlessInstancePackageAppFactPresence = {
  packageAppKey: PackageAppKey;
  packageRevision: boolean;
  sourceSchemaHash: boolean;
};

type FormlessInstanceAppRegistryReadResult = {
  appRegistry: AppInstallsResponse;
  factPresence: FormlessInstanceAppRegistryFactPresence;
};

type FormlessInstanceAppRegistryFactPresence = {
  installs: FormlessInstanceAppInstallFactPresence[];
};

type FormlessInstanceAppInstallFactPresence = {
  installId: string;
  packageAppKey: PackageAppKey;
  packageRevision: boolean;
  sourceSchemaHash: boolean;
};

export async function readFormlessInstanceTargetStatus(
  input: {
    adminToken?: string | null;
    archiveInput?: PortableArchiveInputStatus;
    includeDeploymentStatus?: boolean;
    packageResolver?: AppPackageResolver;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<FormlessInstanceTargetStatus> {
  const targetUrl = normalizeInstanceWorkspaceTargetUrl(input.targetUrl);
  const [deployMetadataResult, ownerSetup, appRegistryResult, deployment] = await Promise.all([
    readFormlessInstanceDeployMetadataResult(
      { packageResolver: input.packageResolver, targetUrl },
      dependencies,
    ),
    readFormlessInstanceOwnerSetupStatus({ targetUrl }, dependencies),
    readFormlessInstanceAppRegistryResult(
      { adminToken: input.adminToken, packageResolver: input.packageResolver, targetUrl },
      dependencies,
    ),
    input.includeDeploymentStatus
      ? readOptionalFormlessInstanceDeploymentStatus(
          { adminToken: input.adminToken, targetUrl },
          dependencies,
        )
      : undefined,
  ]);
  const upgradeStatus = targetUpgradeStatus({
    appRegistry: appRegistryResult.appRegistry,
    appRegistryFactPresence: appRegistryResult.factPresence,
    archiveInput: input.archiveInput ?? { present: false },
    deployMetadata: deployMetadataResult.deployMetadata,
    deployMetadataFactPresence: deployMetadataResult.factPresence,
    deploymentStatusRequested: input.includeDeploymentStatus === true,
    packageResolver: input.packageResolver,
    ...(deployment === undefined ? {} : { deployment }),
  });

  return {
    appRegistry: appRegistryResult.appRegistry,
    deployMetadata: deployMetadataResult.deployMetadata,
    ...(deployment === undefined ? {} : { deployment }),
    ownerSetup,
    targetUrl,
    upgradeStatus,
  };
}

function targetUpgradeStatus(input: {
  appRegistry: AppInstallsResponse;
  appRegistryFactPresence: FormlessInstanceAppRegistryFactPresence;
  archiveInput: PortableArchiveInputStatus;
  deployMetadata: FormlessInstanceTargetDeployMetadata;
  deployMetadataFactPresence: FormlessInstanceDeployMetadataFactPresence;
  deployment?: InstanceDeploymentStatusResponse;
  deploymentStatusRequested: boolean;
  packageResolver?: AppPackageResolver;
}): FormlessInstanceTargetUpgradeStatus {
  const localPackages = listResolvedAppPackages(input.packageResolver).map(packageUpgradeFacts);
  const installedApps = input.appRegistry.installs
    .filter(({ packageAppKey }) => input.packageResolver?.findPackage(packageAppKey) !== undefined)
    .map(installedAppUpgradeFacts);
  const verificationFailures = upgradeVerificationFailures({
    appRegistryFactPresence: input.appRegistryFactPresence,
    deployMetadata: input.deployMetadata,
    deployMetadataFactPresence: input.deployMetadataFactPresence,
    deploymentStatusRequested: input.deploymentStatusRequested,
    installedApps,
    localPackages,
    ...(input.deployment === undefined ? {} : { deployment: input.deployment }),
  });

  return {
    archiveInput: input.archiveInput,
    deployedMetadata: input.deployMetadata,
    ...(input.deployment === undefined ? {} : { deployment: input.deployment }),
    installedApps,
    localPackages,
    verificationFailures,
  };
}

function packageUpgradeFacts(
  appPackage: Pick<ResolvedAppPackage, "packageAppKey" | "packageRevision" | "sourceSchemaHash">,
): FormlessInstanceTargetLocalPackageUpgradeFacts {
  return {
    packageAppKey: appPackage.packageAppKey,
    packageRevision: appPackage.packageRevision,
    sourceSchemaHash: appPackage.sourceSchemaHash,
  };
}

function installedAppUpgradeFacts(
  install: AppInstall,
): FormlessInstanceTargetInstalledAppUpgradeFacts {
  return {
    installId: install.installId,
    packageAppKey: install.packageAppKey,
    packageRevision: install.packageRevision,
    sourceSchemaHash: install.sourceSchemaHash,
  };
}

function upgradeVerificationFailures(input: {
  appRegistryFactPresence: FormlessInstanceAppRegistryFactPresence;
  deployMetadata: FormlessInstanceTargetDeployMetadata;
  deployMetadataFactPresence: FormlessInstanceDeployMetadataFactPresence;
  deployment?: InstanceDeploymentStatusResponse;
  deploymentStatusRequested: boolean;
  installedApps: FormlessInstanceTargetInstalledAppUpgradeFacts[];
  localPackages: FormlessInstanceTargetLocalPackageUpgradeFacts[];
}): FormlessInstanceTargetUpgradeVerificationFailure[] {
  const failures: FormlessInstanceTargetUpgradeVerificationFailure[] = [];

  if (input.localPackages.length === 0 && input.installedApps.length > 0) {
    failures.push({
      code: "local-package-facts-missing",
      message: "Local package metadata is missing package facts.",
      source: "local-package",
    });
  }

  if (!cacheControlIncludesNoStore(input.deployMetadata.cacheControl)) {
    failures.push({
      code: "deploy-metadata-cacheable",
      message: "Deployed metadata must be served with Cache-Control: no-store.",
      source: "deployed-metadata",
    });
  }

  if (
    !input.deployMetadataFactPresence.packageVersion ||
    input.deployMetadata.packageVersion === null
  ) {
    failures.push({
      code: "deploy-metadata-package-version-missing",
      message: "Deployed metadata is missing packageVersion.",
      source: "deployed-metadata",
    });
  }

  if (!input.deployMetadataFactPresence.runtimeProtocolVersion) {
    failures.push({
      code: "deploy-metadata-runtime-protocol-version-missing",
      message: "Deployed metadata is missing runtimeProtocolVersion.",
      source: "deployed-metadata",
    });
  }

  if (!input.deployMetadataFactPresence.storageMigrationSet) {
    failures.push({
      code: "deploy-metadata-storage-migration-set-missing",
      message: "Deployed metadata is missing storageMigrationSet.",
      source: "deployed-metadata",
    });
  }

  if (!input.deployMetadataFactPresence.packageApps) {
    failures.push({
      code: "deploy-metadata-package-apps-missing",
      message: "Deployed metadata is missing packageApps.",
      source: "deployed-metadata",
    });
  } else {
    const deployedPackageKeys = new Set(
      input.deployMetadata.packageApps.map((appPackage) => appPackage.packageAppKey),
    );

    for (const localPackage of input.localPackages) {
      if (!deployedPackageKeys.has(localPackage.packageAppKey)) {
        failures.push({
          code: "deploy-metadata-package-app-missing",
          message: `Deployed metadata is missing package app "${localPackage.packageAppKey}".`,
          packageAppKey: localPackage.packageAppKey,
          source: "deployed-metadata",
        });
      }
    }

    for (const presence of input.deployMetadataFactPresence.packageAppFacts) {
      if (!presence.packageRevision || !presence.sourceSchemaHash) {
        failures.push({
          code: "deploy-metadata-package-app-facts-missing",
          message: `Deployed metadata package app "${presence.packageAppKey}" is missing package revision or source schema hash facts.`,
          packageAppKey: presence.packageAppKey,
          source: "deployed-metadata",
        });
      }
    }
  }

  for (const presence of input.appRegistryFactPresence.installs) {
    if (!presence.packageRevision || !presence.sourceSchemaHash) {
      failures.push({
        code: "installed-app-package-facts-missing",
        installId: presence.installId,
        message: `Installed app "${presence.installId}" is missing package revision or source schema hash facts.`,
        packageAppKey: presence.packageAppKey,
        source: "installed-app",
      });
    }
  }

  if (input.deploymentStatusRequested && input.deployment === undefined) {
    failures.push({
      code: "deployment-status-unavailable",
      message: "Deployment status is unavailable for this target.",
      source: "deployment-status",
    });
  }

  return failures;
}

function deployMetadataFactPresence(
  value: unknown,
  metadata: FormlessInstanceTargetDeployMetadata,
): FormlessInstanceDeployMetadataFactPresence {
  const object = isRecord(value) ? value : {};
  const rawPackageApps = Array.isArray(object.packageApps) ? object.packageApps : [];

  return {
    packageApps: Array.isArray(object.packageApps),
    packageVersion: "packageVersion" in object,
    runtimeProtocolVersion: "runtimeProtocolVersion" in object,
    storageMigrationSet: "storageMigrationSet" in object,
    packageAppFacts: metadata.packageApps.map((appPackage, index) => {
      const rawPackageApp = rawPackageApps[index];
      const rawPackageAppObject = isRecord(rawPackageApp) ? rawPackageApp : {};

      return {
        packageAppKey: appPackage.packageAppKey,
        packageRevision: "packageRevision" in rawPackageAppObject,
        sourceSchemaHash: "sourceSchemaHash" in rawPackageAppObject,
      };
    }),
  };
}

function appRegistryFactPresence(
  value: unknown,
  appRegistry: AppInstallsResponse,
): FormlessInstanceAppRegistryFactPresence {
  const object = isRecord(value) ? value : {};
  const rawInstalls = Array.isArray(object.installs) ? object.installs : [];

  return {
    installs: appRegistry.installs.map((install, index) => {
      const rawInstall = rawInstalls[index];
      const rawInstallObject = isRecord(rawInstall) ? rawInstall : {};

      return {
        installId: install.installId,
        packageAppKey: install.packageAppKey,
        packageRevision: "packageRevision" in rawInstallObject,
        sourceSchemaHash: "sourceSchemaHash" in rawInstallObject,
      };
    }),
  };
}

function cacheControlIncludesNoStore(value: string): boolean {
  return value
    .split(",")
    .map((directive) => directive.trim().toLowerCase())
    .includes("no-store");
}
export async function readFormlessInstanceDeployMetadata(
  input: {
    packageResolver?: AppPackageResolver;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<FormlessInstanceTargetDeployMetadata> {
  return (await readFormlessInstanceDeployMetadataResult(input, dependencies)).deployMetadata;
}
async function readFormlessInstanceDeployMetadataResult(
  input: {
    packageResolver?: AppPackageResolver;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<FormlessInstanceDeployMetadataReadResult> {
  const targetUrl = normalizeInstanceWorkspaceTargetUrl(input.targetUrl);
  const metadataUrl = apiUrl(targetUrl, FORMLESS_DEPLOY_METADATA_PATH);
  const response = await dependencies.fetch(metadataUrl, {
    headers: { accept: "application/json" },
  });
  const value = await readJsonResponse(response, `GET ${metadataUrl}`);
  const metadata = parseDeployMetadata(value, metadataUrl, input.packageResolver);
  const deployMetadata = {
    cacheControl: response.headers.get("Cache-Control") ?? "",
    metadataUrl,
    packageApps: metadata.packageApps,
    packageVersion: metadata.packageVersion,
    runtimeProtocolVersion: metadata.runtimeProtocolVersion,
    storageMigrationSet: metadata.storageMigrationSet,
    version: metadata.version,
  };

  return {
    deployMetadata,
    factPresence: deployMetadataFactPresence(value, deployMetadata),
  };
}
export async function readFormlessInstanceOwnerSetupStatus(
  input: {
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<OwnerSetupStatusResponse> {
  const targetUrl = normalizeInstanceWorkspaceTargetUrl(input.targetUrl);
  const statusUrl = apiUrl(targetUrl, OWNER_SETUP_STATUS_API_PATH);

  return parseOwnerSetupStatus(
    await fetchJson(dependencies.fetch, statusUrl, { headers: { accept: "application/json" } }),
    statusUrl,
  );
}
export async function readFormlessInstanceAppRegistry(
  input: {
    packageResolver?: AppPackageResolver;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<AppInstallsResponse> {
  return (await readFormlessInstanceAppRegistryResult(input, dependencies)).appRegistry;
}

export async function applyFormlessInstanceAutoSafeSqlMigrations(
  input: {
    adminToken?: string | null;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<InstanceUpgradeApplyResponse> {
  const targetUrl = normalizeInstanceWorkspaceTargetUrl(input.targetUrl);
  const applyUrl = apiUrl(targetUrl, INSTANCE_UPGRADE_APPLY_API_PATH);

  return parseInstanceUpgradeStatusResponse(
    await postJson(dependencies.fetch, applyUrl, {
      body: JSON.stringify({ safety: "auto-safe" }),
      headers: adminJsonHeaders(input.adminToken),
      method: "POST",
    }),
    applyUrl,
  );
}

export async function readFormlessInstanceUpgradeStatus(
  input: {
    adminToken?: string | null;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<InstanceUpgradeStatusResponse> {
  const targetUrl = normalizeInstanceWorkspaceTargetUrl(input.targetUrl);
  const statusUrl = apiUrl(targetUrl, INSTANCE_UPGRADE_STATUS_API_PATH);

  return parseInstanceUpgradeStatusResponse(
    await fetchJson(dependencies.fetch, statusUrl, {
      headers: adminJsonHeaders(input.adminToken),
    }),
    statusUrl,
  );
}

export async function applyFormlessInstalledAppAutoSafePackageMigrations(
  input: {
    adminToken?: string | null;
    installId: string;
    packageAppKey: PackageAppKey;
    packageResolver?: AppPackageResolver;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<FormlessInstancePackageMigrationApplyResponse> {
  const targetUrl = normalizeInstanceWorkspaceTargetUrl(input.targetUrl);
  const applyUrl = apiUrl(
    targetUrl,
    `${APP_INSTALLS_API_PATH}/${input.packageAppKey}/${input.installId}${PACKAGE_MIGRATIONS_APPLY_PATH_SUFFIX}`,
  );

  return parsePackageMigrationApplyResponse(
    await postJson(dependencies.fetch, applyUrl, {
      body: JSON.stringify({ safety: "auto-safe" }),
      headers: adminJsonHeaders(input.adminToken),
      method: "POST",
    }),
    applyUrl,
    input.packageResolver,
  );
}
async function readFormlessInstanceAppRegistryResult(
  input: {
    adminToken?: string | null;
    packageResolver?: AppPackageResolver;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<FormlessInstanceAppRegistryReadResult> {
  const targetUrl = normalizeInstanceWorkspaceTargetUrl(input.targetUrl);
  const registryUrl = apiUrl(targetUrl, APP_INSTALLS_API_PATH);

  const value = await fetchJson(dependencies.fetch, registryUrl, {
    headers: formlessCliTargetAcceptHeaders({ adminToken: input.adminToken }),
  });
  const appRegistry = parseAppRegistry(value, registryUrl, input.packageResolver);

  return {
    appRegistry,
    factPresence: appRegistryFactPresence(value, appRegistry),
  };
}

export async function readFormlessInstanceDomainProviderPlan(
  input: {
    adminToken?: string | null;
    host?: string | null;
    policy?: DomainProviderPlanPolicy;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<InstanceDomainProviderPlanResponse> {
  const targetUrl = normalizeInstanceWorkspaceTargetUrl(input.targetUrl);
  const providerUrl = new URL(apiUrl(targetUrl, INSTANCE_DOMAIN_PROVIDER_API_PATH));

  if (input.host && input.host.trim() !== "") {
    providerUrl.searchParams.set("host", input.host);
  }

  if (input.policy) {
    providerUrl.searchParams.set("policy", input.policy);
  }

  return parseDomainProviderPlan(
    await fetchJson(dependencies.fetch, providerUrl.toString(), {
      headers: formlessCliTargetAcceptHeaders({ adminToken: input.adminToken }),
    }),
    providerUrl.toString(),
  );
}
export async function readFormlessInstanceDeploymentDesiredState(
  input: {
    adminToken?: string | null;
    targetId?: string | null;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<InstanceDeploymentDesiredStateResponse> {
  const targetUrl = normalizeInstanceWorkspaceTargetUrl(input.targetUrl);
  const desiredStateUrl = deploymentReadUrl(
    targetUrl,
    DEPLOYMENT_DESIRED_STATE_API_PATH,
    input.targetId,
  );

  return parseDeployDesiredStateResponse(
    await fetchJson(dependencies.fetch, desiredStateUrl, {
      headers: formlessCliTargetAcceptHeaders({ adminToken: input.adminToken }),
    }),
    desiredStateUrl,
  );
}
export async function readFormlessInstanceDeploymentStatus(
  input: {
    adminToken?: string | null;
    targetId?: string | null;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<InstanceDeploymentStatusResponse> {
  const targetUrl = normalizeInstanceWorkspaceTargetUrl(input.targetUrl);
  const statusUrl = deploymentReadUrl(targetUrl, DEPLOYMENT_STATUS_API_PATH, input.targetId);

  return parseDeployLatestStatusResponse(
    await fetchJson(dependencies.fetch, statusUrl, {
      headers: formlessCliTargetAcceptHeaders({ adminToken: input.adminToken }),
    }),
    statusUrl,
  );
}

export async function readFormlessInstanceControlPlaneRecords(
  input: {
    adminToken?: string | null;
    actorKind?: DeployControlPlaneProtocolActorKind;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<FormlessInstanceControlPlaneRecords> {
  const actorKind = input.actorKind ?? "cliDeployer";
  const targetUrl = normalizeInstanceWorkspaceTargetUrl(input.targetUrl);
  const controlPlaneUrl = apiUrl(
    targetUrl,
    deployControlPlaneBootstrapPath(actorKind, FORMLESS_PROGRAM_API_ROUTE_PREFIX),
  );

  const bootstrap = parseControlPlaneBootstrapResponse(
    await fetchJson(dependencies.fetch, controlPlaneUrl, {
      headers: formlessCliTargetAcceptHeaders({
        adminToken: input.adminToken,
        headers: deployControlPlaneActorHeaders(actorKind),
      }),
    }),
    controlPlaneUrl,
  );

  return controlPlaneRecordsByEntity(actorKind, bootstrap.records);
}

export async function disableFormlessInstanceDomainRoute(
  input: {
    adminToken?: string | null;
    mutationId?: string;
    request: DisableFormlessInstanceDomainRouteRequest;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<OperationInvocationResponse> {
  const targetUrl = normalizeInstanceWorkspaceTargetUrl(input.targetUrl);
  const host = normalizeTargetDomainHost(input.request.host);
  const targetProfile = routeTargetProfileFromDomainProfile(input.request.profile ?? "publicSite");
  const controlPlane = await readFormlessInstanceControlPlaneRecords(
    {
      adminToken: input.adminToken,
      actorKind: "cliDeployer",
      targetUrl,
    },
    dependencies,
  );
  const route = controlPlane.domainMappings.find(
    (record) =>
      !record.deletedAt &&
      record.values.matchHost === host &&
      record.values.targetProfile === targetProfile,
  );

  if (!route) {
    throw new Error(`No desired domain route found for host "${host}".`);
  }

  return updateFormlessInstanceRouteRecord(
    {
      adminToken: input.adminToken,
      mutationId: input.mutationId,
      recordId: route.id,
      targetUrl,
      values: { enabled: false },
    },
    dependencies,
  );
}

export async function disableFormlessInstanceDomainRedirect(
  input: {
    adminToken?: string | null;
    mutationId?: string;
    request: DisableFormlessInstanceDomainRedirectRequest;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<OperationInvocationResponse> {
  const targetUrl = normalizeInstanceWorkspaceTargetUrl(input.targetUrl);
  const fromHost = normalizeTargetDomainHost(input.request.fromHost);
  const controlPlane = await readFormlessInstanceControlPlaneRecords(
    {
      adminToken: input.adminToken,
      actorKind: "cliDeployer",
      targetUrl,
    },
    dependencies,
  );
  const route = controlPlane.redirectIntents.find(
    (record) => !record.deletedAt && record.values.matchHost === fromHost,
  );

  if (!route) {
    throw new Error(`No desired redirect route found for host "${fromHost}".`);
  }

  return updateFormlessInstanceRouteRecord(
    {
      adminToken: input.adminToken,
      mutationId: input.mutationId,
      recordId: route.id,
      targetUrl,
      values: { enabled: false },
    },
    dependencies,
  );
}

export async function readOptionalFormlessInstanceControlPlaneRecords(
  input: {
    adminToken?: string | null;
    actorKind?: DeployControlPlaneProtocolActorKind;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<FormlessInstanceControlPlaneRecords | undefined> {
  try {
    return await readFormlessInstanceControlPlaneRecords(input, dependencies);
  } catch (error) {
    if (error instanceof FormlessInstanceTargetRequestError && error.status === 404) {
      return undefined;
    }

    throw error;
  }
}

export async function readFormlessInstanceDeploymentCommandContext(
  input: {
    adminToken?: string | null;
    actorKind?: DeployControlPlaneProtocolActorKind;
    targetId?: string | null;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<FormlessInstanceDeploymentCommandContext> {
  const [controlPlane, desiredState, status] = await Promise.all([
    readOptionalFormlessInstanceControlPlaneRecords(
      {
        adminToken: input.adminToken,
        actorKind: input.actorKind ?? "runner",
        targetUrl: input.targetUrl,
      },
      dependencies,
    ),
    readFormlessInstanceDeploymentDesiredState(input, dependencies),
    readFormlessInstanceDeploymentStatus(input, dependencies),
  ]);

  return {
    ...(controlPlane === undefined ? {} : { controlPlane }),
    desiredState,
    desiredStateRef: deployDesiredStateVersionRef(desiredState.desiredState),
    status,
  };
}

export async function patchFormlessInstanceDeploymentConfigObservation(
  input: {
    adminToken?: string | null;
    mutationId?: string;
    observation: FormlessInstanceDeploymentObservationPatch;
    targetId: string;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<OperationInvocationResponse> {
  const targetUrl = normalizeInstanceWorkspaceTargetUrl(input.targetUrl);
  const operationUrl = apiUrl(
    targetUrl,
    `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/operations/deployment-config/update`,
  );
  const values = deployDeploymentObservationPatchValues(input.observation);
  const idempotencyKey =
    input.mutationId ??
    deployDeploymentObservationPatchIdempotencyKey({
      observation: input.observation,
      targetId: input.targetId,
    });

  return parseOperationInvocationResponse(
    await postJson(dependencies.fetch, operationUrl, {
      body: JSON.stringify({
        idempotencyKey,
        input: values,
        recordId: input.targetId,
      }),
      headers: formlessCliTargetJsonHeaders({ adminToken: input.adminToken }),
      method: "POST",
    }),
    operationUrl,
  );
}

async function updateFormlessInstanceRouteRecord(
  input: {
    adminToken?: string | null;
    mutationId?: string;
    recordId: string;
    targetUrl: string;
    values: Record<string, unknown>;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<OperationInvocationResponse> {
  const targetUrl = normalizeInstanceWorkspaceTargetUrl(input.targetUrl);
  const operationUrl = apiUrl(
    targetUrl,
    `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/operations/route/update`,
  );

  return parseOperationInvocationResponse(
    await postJson(dependencies.fetch, operationUrl, {
      body: JSON.stringify({
        idempotencyKey: input.mutationId ?? createOperationId(),
        input: input.values,
        recordId: input.recordId,
        source: { protocol: "cli" },
      }),
      headers: formlessCliTargetJsonHeaders({ adminToken: input.adminToken }),
      method: "POST",
    }),
    operationUrl,
  );
}
async function readOptionalFormlessInstanceDeploymentStatus(
  input: {
    adminToken?: string | null;
    targetId?: string | null;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<InstanceDeploymentStatusResponse | undefined> {
  try {
    return await readFormlessInstanceDeploymentStatus(input, dependencies);
  } catch (error) {
    if (error instanceof FormlessInstanceTargetRequestError && error.status === 404) {
      return undefined;
    }

    throw error;
  }
}

export async function startFormlessInstanceDeploymentAttempt(
  input: {
    adminToken?: string | null;
    request: InstanceDeploymentAttemptStartRequest;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<InstanceDeploymentAttemptStartResponse> {
  return parseDeploymentAttemptStartResponse(
    await postDeploymentJson(dependencies, {
      adminToken: input.adminToken,
      body: input.request,
      path: INSTANCE_DEPLOYMENT_ATTEMPT_START_API_PATH,
      targetUrl: input.targetUrl,
    }),
    INSTANCE_DEPLOYMENT_ATTEMPT_START_API_PATH,
  );
}

export async function heartbeatFormlessInstanceDeploymentAttempt(
  input: {
    adminToken?: string | null;
    request: InstanceDeploymentAttemptHeartbeatRequest;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<InstanceDeploymentAttemptHeartbeatResponse> {
  return parseDeploymentAttemptHeartbeatResponse(
    await postDeploymentJson(dependencies, {
      adminToken: input.adminToken,
      body: input.request,
      path: INSTANCE_DEPLOYMENT_ATTEMPT_HEARTBEAT_API_PATH,
      targetUrl: input.targetUrl,
    }),
    INSTANCE_DEPLOYMENT_ATTEMPT_HEARTBEAT_API_PATH,
  );
}

export async function writeFormlessInstanceDeploymentAttemptPlan(
  input: {
    adminToken?: string | null;
    request: InstanceDeploymentAttemptPlanWritebackRequest;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<InstanceDeploymentAttemptPlanWritebackResponse> {
  return parseDeploymentAttemptPlanWritebackResponse(
    await postDeploymentJson(dependencies, {
      adminToken: input.adminToken,
      body: input.request,
      path: INSTANCE_DEPLOYMENT_ATTEMPT_PLAN_API_PATH,
      targetUrl: input.targetUrl,
    }),
    INSTANCE_DEPLOYMENT_ATTEMPT_PLAN_API_PATH,
  );
}

export async function writeFormlessInstanceDeploymentAttemptSuccess(
  input: {
    adminToken?: string | null;
    request: InstanceDeploymentAttemptSuccessWritebackRequest;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<InstanceDeploymentAttemptSuccessWritebackResponse> {
  return parseDeploymentAttemptSuccessWritebackResponse(
    await postDeploymentJson(dependencies, {
      adminToken: input.adminToken,
      body: input.request,
      path: INSTANCE_DEPLOYMENT_ATTEMPT_SUCCESS_API_PATH,
      targetUrl: input.targetUrl,
    }),
    INSTANCE_DEPLOYMENT_ATTEMPT_SUCCESS_API_PATH,
  );
}

export async function writeFormlessInstanceDeploymentAttemptFailure(
  input: {
    adminToken?: string | null;
    request: InstanceDeploymentAttemptFailureWritebackRequest;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<InstanceDeploymentAttemptFailureWritebackResponse> {
  return parseDeploymentAttemptFailureWritebackResponse(
    await postDeploymentJson(dependencies, {
      adminToken: input.adminToken,
      body: input.request,
      path: INSTANCE_DEPLOYMENT_ATTEMPT_FAILURE_API_PATH,
      targetUrl: input.targetUrl,
    }),
    INSTANCE_DEPLOYMENT_ATTEMPT_FAILURE_API_PATH,
  );
}

export async function writeFormlessInstanceDeploymentDrift(
  input: {
    adminToken?: string | null;
    request: InstanceDeploymentDriftWritebackRequest;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<InstanceDeploymentDriftWritebackResponse> {
  return parseDeploymentDriftWritebackResponse(
    await postDeploymentJson(dependencies, {
      adminToken: input.adminToken,
      body: input.request,
      path: INSTANCE_DEPLOYMENT_DRIFT_API_PATH,
      targetUrl: input.targetUrl,
    }),
    INSTANCE_DEPLOYMENT_DRIFT_API_PATH,
  );
}

export async function requestFormlessInstanceDomainProviderDelete(
  input: {
    adminToken?: string | null;
    request?: InstanceDomainProviderDeleteRequest;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<InstanceDomainProviderDeleteResponse> {
  const targetUrl = normalizeInstanceWorkspaceTargetUrl(input.targetUrl);
  const deleteUrl = apiUrl(targetUrl, INSTANCE_DOMAIN_PROVIDER_DELETE_API_PATH);

  return parseDomainProviderDeleteResponse(
    await postJson(dependencies.fetch, deleteUrl, {
      body: JSON.stringify(input.request ?? {}),
      headers: formlessCliTargetJsonHeaders({ adminToken: input.adminToken }),
      method: "POST",
    }),
    deleteUrl,
  );
}

export async function markFormlessInstanceDomainProviderResourceManuallyRemoved(
  input: {
    adminToken?: string | null;
    request: InstanceDomainProviderManualCleanupRequest;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<InstanceDomainProviderManualCleanupResponse> {
  const targetUrl = normalizeInstanceWorkspaceTargetUrl(input.targetUrl);
  const cleanupUrl = apiUrl(targetUrl, INSTANCE_DOMAIN_PROVIDER_MANUAL_CLEANUP_API_PATH);

  return parseDomainProviderManualCleanupResponse(
    await postJson(dependencies.fetch, cleanupUrl, {
      body: JSON.stringify(input.request),
      headers: formlessCliTargetJsonHeaders({ adminToken: input.adminToken }),
      method: "POST",
    }),
    cleanupUrl,
  );
}

export async function completeFormlessInstanceDomainProviderDeleteJob(
  input: {
    adminToken?: string | null;
    jobId: string;
    result: InstanceDomainProviderDeleteJobResultRequest;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<InstanceDomainProviderDeleteJobResponse> {
  const targetUrl = normalizeInstanceWorkspaceTargetUrl(input.targetUrl);
  const resultUrl = apiUrl(
    targetUrl,
    `${INSTANCE_DOMAIN_PROVIDER_DELETE_JOBS_API_PATH}/${encodeURIComponent(input.jobId)}/result`,
  );

  return parseDomainProviderDeleteJobResponse(
    await postJson(dependencies.fetch, resultUrl, {
      body: JSON.stringify(input.result),
      headers: formlessCliTargetJsonHeaders({ adminToken: input.adminToken }),
      method: "POST",
    }),
    resultUrl,
  );
}

export async function recordFormlessInstanceDomainMappingApplyEvidence(
  input: {
    adminToken?: string | null;
    evidence: RecordInstanceDomainMappingApplyEvidenceRequest;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<RecordInstanceDomainMappingApplyEvidenceResponse> {
  const targetUrl = normalizeInstanceWorkspaceTargetUrl(input.targetUrl);
  const evidenceUrl = apiUrl(targetUrl, DOMAIN_MAPPINGS_APPLY_EVIDENCE_API_PATH);

  return parseApplyEvidenceResponse(
    await postJson(dependencies.fetch, evidenceUrl, {
      body: JSON.stringify(input.evidence),
      headers: formlessCliTargetJsonHeaders({ adminToken: input.adminToken }),
      method: "POST",
    }),
    evidenceUrl,
  );
}

async function fetchJson(fetcher: typeof fetch, url: string, init: RequestInit): Promise<unknown> {
  const response = await fetcher(url, init);

  return readJsonResponse(response, `GET ${url}`);
}

async function postJson(fetcher: typeof fetch, url: string, init: RequestInit): Promise<unknown> {
  const response = await fetcher(url, init);

  return readJsonResponse(response, `POST ${url}`);
}

async function readJsonResponse(response: Response, context: string): Promise<unknown> {
  const text = await response.text();

  if (!response.ok) {
    throw new FormlessInstanceTargetRequestError(
      `${context} failed: HTTP ${response.status} ${text}`,
      {
        responseBody: text,
        status: response.status,
      },
    );
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${context} failed: response was not JSON.`);
  }
}

function parseDeployMetadata(
  value: unknown,
  context: string,
  packageResolver?: AppPackageResolver,
): FormlessDeployMetadata {
  if (!isRecord(value)) {
    throw new Error(`${context} failed: deploy metadata must be an object.`);
  }

  if (value.version !== null && typeof value.version !== "string") {
    throw new Error(`${context} failed: deploy metadata version must be a string or null.`);
  }

  if (
    "packageVersion" in value &&
    value.packageVersion !== null &&
    typeof value.packageVersion !== "string"
  ) {
    throw new Error(`${context} failed: deploy metadata packageVersion must be a string or null.`);
  }

  const version = value.version as string | null;

  return {
    packageApps: parseDeployPackageApps(value.packageApps, context, packageResolver),
    packageVersion:
      "packageVersion" in value && value.packageVersion !== undefined
        ? (value.packageVersion as string | null)
        : version,
    runtimeProtocolVersion: parseOptionalPositiveInteger(
      value.runtimeProtocolVersion,
      FORMLESS_RUNTIME_PROTOCOL_VERSION,
      `${context} deploy metadata runtimeProtocolVersion`,
    ),
    storageMigrationSet: parseOptionalString(
      value.storageMigrationSet,
      FORMLESS_STORAGE_MIGRATION_SET_ID,
      `${context} deploy metadata storageMigrationSet`,
    ),
    version,
  };
}

function parseOwnerSetupStatus(value: unknown, context: string): OwnerSetupStatusResponse {
  if (!isRecord(value) || typeof value.setupComplete !== "boolean") {
    throw new Error(`${context} failed: setup status must include setupComplete.`);
  }

  return {
    ...(typeof value.adminOrigin === "string" ? { adminOrigin: value.adminOrigin } : {}),
    ...(typeof value.authOrigin === "string" ? { authOrigin: value.authOrigin } : {}),
    setupComplete: value.setupComplete,
    ...(isRecord(value.owner) ? { owner: value.owner as OwnerSetupStatusResponse["owner"] } : {}),
  };
}

function parseAppRegistry(
  value: unknown,
  context: string,
  packageResolver?: AppPackageResolver,
): AppInstallsResponse {
  if (!isRecord(value) || !Array.isArray(value.packages) || !Array.isArray(value.installs)) {
    throw new Error(`${context} failed: app registry must include packages and installs arrays.`);
  }

  const packages = value.packages
    .filter(isRuntimeInstallablePackageMetadata)
    .map((appPackage, index) =>
      parseInstallablePackageApp(appPackage, `${context} packages[${index}]`, packageResolver),
    );
  const packagesByKey = new Map(
    packages.map((appPackage) => [appPackage.packageAppKey, appPackage]),
  );

  return {
    installs: value.installs
      .filter(isRuntimeInstallablePackageMetadata)
      .map((install, index) =>
        parseAppInstall(install, packagesByKey, `${context} installs[${index}]`, packageResolver),
      ),
    packages,
  };
}

function isRuntimeInstallablePackageMetadata(value: unknown): boolean {
  return (
    !isRecord(value) ||
    typeof value.packageAppKey !== "string" ||
    isRuntimeInstallableAppPackageKey(value.packageAppKey)
  );
}

function parseInstanceUpgradeStatusResponse(
  value: unknown,
  context: string,
): InstanceUpgradeStatusResponse {
  if (!isRecord(value) || !Array.isArray(value.storageIdentities)) {
    throw new Error(`${context} failed: upgrade status must include storageIdentities.`);
  }

  return value as InstanceUpgradeStatusResponse;
}

function parsePackageMigrationApplyResponse(
  value: unknown,
  context: string,
  packageResolver?: AppPackageResolver,
): FormlessInstancePackageMigrationApplyResponse {
  if (!isRecord(value)) {
    throw new Error(`${context} failed: package migration apply response must be an object.`);
  }

  const packageAppKey = parsePackageAppKey(
    value.packageAppKey,
    `${context} packageAppKey`,
    packageResolver,
  );
  const packageRevision = parseOptionalPositiveInteger(
    value.packageRevision,
    1 as PackageAppRevision,
    `${context} packageRevision`,
  );
  const sourceSchemaHash = parseOptionalSourceSchemaHash(
    value.sourceSchemaHash,
    packageAppFactsForKey(packageAppKey, packageResolver ?? bundledAppPackageResolver)
      ?.sourceSchemaHash ?? undefined,
    `${context} sourceSchemaHash`,
  );

  if (
    !Array.isArray(value.applied) ||
    !Array.isArray(value.changes) ||
    typeof value.cursor !== "number" ||
    typeof value.schemaUpdatedAt !== "string" ||
    !Array.isArray(value.skipped)
  ) {
    throw new Error(`${context} failed: package migration apply response is invalid.`);
  }

  return {
    applied: value.applied.map((migration, index) =>
      parsePackageAppMigrationAppliedState(
        migration,
        `${context} applied[${index}]`,
        packageResolver,
      ),
    ),
    changes: value.changes,
    cursor: value.cursor,
    packageAppKey,
    packageRevision,
    schemaUpdatedAt: value.schemaUpdatedAt,
    skipped: value.skipped.map((migration, index) =>
      parsePackageAppMigrationAppliedState(
        migration,
        `${context} skipped[${index}]`,
        packageResolver,
      ),
    ),
    sourceSchemaHash,
  };
}

function parsePackageAppMigrationAppliedState(
  value: unknown,
  context: string,
  packageResolver?: AppPackageResolver,
): UpgradePackageAppMigrationAppliedState {
  if (!isRecord(value)) {
    throw new Error(`${context} failed: package migration evidence must be an object.`);
  }

  const packageAppKey = parsePackageAppKey(
    value.packageAppKey,
    `${context} packageAppKey`,
    packageResolver,
  );
  const sourceSchemaHash = parseOptionalSourceSchemaHash(
    value.sourceSchemaHash,
    packageAppFactsForKey(packageAppKey, packageResolver ?? bundledAppPackageResolver)
      ?.sourceSchemaHash ?? undefined,
    `${context} sourceSchemaHash`,
  );

  if (
    typeof value.appliedAt !== "string" ||
    !isUpgradeMigrationChecksum(value.checksum) ||
    typeof value.migrationId !== "string"
  ) {
    throw new Error(`${context} failed: package migration evidence is invalid.`);
  }

  return {
    appliedAt: value.appliedAt,
    checksum: value.checksum,
    fromPackageRevision: parseOptionalPositiveInteger(
      value.fromPackageRevision,
      1 as PackageAppRevision,
      `${context} fromPackageRevision`,
    ),
    migrationId: value.migrationId,
    packageAppKey,
    sourceSchemaHash,
    toPackageRevision: parseOptionalPositiveInteger(
      value.toPackageRevision,
      1 as PackageAppRevision,
      `${context} toPackageRevision`,
    ),
  };
}

function parseDeployPackageApps(
  value: unknown,
  context: string,
  packageResolver?: AppPackageResolver,
): FormlessDeployPackageAppMetadata[] {
  const packageApps = Array.isArray(value)
    ? value
    : deployPackageAppMetadataFromResolver(packageResolver);

  return packageApps
    .filter(isRuntimeInstallablePackageMetadata)
    .map((appPackage, index) =>
      parseDeployPackageApp(appPackage, `${context} packageApps[${index}]`, packageResolver),
    );
}

function parseDeployPackageApp(
  value: unknown,
  context: string,
  packageResolver?: AppPackageResolver,
): FormlessDeployPackageAppMetadata {
  if (!isRecord(value)) {
    throw new Error(`${context} failed: deploy package app metadata must be an object.`);
  }

  const packageAppKey = parsePackageAppKey(
    value.packageAppKey,
    `${context} packageAppKey`,
    packageResolver,
  );
  const facts = packageAppFactsForKey(packageAppKey, packageResolver ?? bundledAppPackageResolver);

  if (!facts) {
    throw new Error(`${context} failed: package app "${packageAppKey}" is unsupported.`);
  }

  return {
    packageAppKey,
    packageRevision: parseOptionalPositiveInteger(
      value.packageRevision,
      facts.packageRevision,
      `${context} packageRevision`,
    ),
    sourceSchemaHash: parseOptionalSourceSchemaHash(
      value.sourceSchemaHash,
      facts.sourceSchemaHash,
      `${context} sourceSchemaHash`,
    ),
  };
}

function parseInstallablePackageApp(
  value: unknown,
  context: string,
  packageResolver?: AppPackageResolver,
): InstallableAppPackage {
  if (!isRecord(value)) {
    throw new Error(`${context} failed: package metadata must be an object.`);
  }

  const packageAppKey = parsePackageAppKey(
    value.packageAppKey,
    `${context} packageAppKey`,
    packageResolver,
  );
  const localPackage = findResolvedAppPackage(packageAppKey, packageResolver);

  if (!localPackage) {
    throw new Error(`${context} failed: package app "${packageAppKey}" is unsupported.`);
  }

  const publicRouteBase = parseOptionalRouteBase(
    value.publicRouteBase,
    localPackage.publicRouteBase,
  );
  const sourceSchemaKey = parseRequiredString(
    value.sourceSchemaKey,
    localPackage.sourceSchemaKey,
    `${context} sourceSchemaKey`,
  );

  return {
    packageAppKey: localPackage.packageAppKey,
    packageRevision: parseOptionalPositiveInteger(
      value.packageRevision,
      localPackage.packageRevision,
      `${context} packageRevision`,
    ),
    sourceSchemaHash: parseOptionalSourceSchemaHash(
      value.sourceSchemaHash,
      localPackage.sourceSchemaHash,
      `${context} sourceSchemaHash`,
    ),
    label: parseRequiredString(value.label, localPackage.label, `${context} label`),
    description: parseRequiredString(
      value.description,
      localPackage.description,
      `${context} description`,
    ),
    defaultInstallId: parseRequiredString(
      value.defaultInstallId,
      localPackage.defaultInstallId,
      `${context} defaultInstallId`,
    ),
    supportsMultipleInstalls:
      typeof value.supportsMultipleInstalls === "boolean"
        ? value.supportsMultipleInstalls
        : localPackage.supportsMultipleInstalls,
    sourceOrigin: localPackage.sourceOrigin,
    sourceSchemaKey,
    sourceSchemaLocation: {
      ...localPackage.sourceSchemaLocation,
      key: sourceSchemaKey,
    },
    adminRouteBase: parseRouteBase(value.adminRouteBase, localPackage.adminRouteBase),
    ...(publicRouteBase === undefined ? {} : { publicRouteBase }),
  };
}

function parseAppInstall(
  value: unknown,
  packagesByKey: ReadonlyMap<PackageAppKey, InstallableAppPackage>,
  context: string,
  packageResolver?: AppPackageResolver,
): AppInstall {
  if (!isRecord(value)) {
    throw new Error(`${context} failed: app install metadata must be an object.`);
  }

  const packageAppKey = parsePackageAppKey(value.packageAppKey, `${context} packageAppKey`);
  const packageApp =
    packagesByKey.get(packageAppKey) ?? findResolvedAppPackage(packageAppKey, packageResolver);

  if (!packageApp) {
    throw new Error(`${context} failed: package app "${packageAppKey}" is unsupported.`);
  }

  if (value.status !== "installed") {
    throw new Error(`${context} failed: app install status must be "installed".`);
  }

  const installId = parseRequiredString(value.installId, undefined, `${context} installId`);
  const registrationPolicy = parseTargetAppInstallRegistrationPolicy(
    value.registrationPolicy,
    `${context} registrationPolicy`,
  );
  const registrationOperation = parseTargetAppInstallRegistrationOperation(
    value.registrationOperation,
    registrationPolicy,
    `${context} registrationOperation`,
  );

  return {
    installId,
    packageAppKey,
    packageRevision: parseOptionalPositiveInteger(
      value.packageRevision,
      packageApp.packageRevision,
      `${context} packageRevision`,
    ),
    sourceSchemaHash: parseOptionalSourceSchemaHash(
      value.sourceSchemaHash,
      packageApp.sourceSchemaHash,
      `${context} sourceSchemaHash`,
    ),
    label: parseRequiredString(value.label, undefined, `${context} label`),
    registrationPolicy,
    ...(registrationOperation === undefined ? {} : { registrationOperation }),
    status: "installed",
    createdAt: parseRequiredString(value.createdAt, undefined, `${context} createdAt`),
    updatedAt: parseRequiredString(value.updatedAt, undefined, `${context} updatedAt`),
    adminRoute: parseRequiredString(
      value.adminRoute,
      `${packageApp.adminRouteBase}/${installId}`,
      `${context} adminRoute`,
    ) as `/apps/${string}`,
    ...(packageApp.publicRouteBase === undefined
      ? {}
      : {
          publicRoute: parseRequiredString(
            value.publicRoute,
            `${packageApp.publicRouteBase}/${installId}`,
            `${context} publicRoute`,
          ) as `/sites/${string}`,
          publicRoutePrefix: parseRequiredString(
            value.publicRoutePrefix,
            `${packageApp.publicRouteBase}/${installId}/`,
            `${context} publicRoutePrefix`,
          ) as `/sites/${string}/`,
        }),
  };
}

function parseTargetAppInstallRegistrationPolicy(
  value: unknown,
  context: string,
): AppInstallRegistrationPolicy {
  try {
    return parseAppInstallRegistrationPolicy(value, "value");
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim() !== ""
        ? error.message
        : "value is unsupported.";

    throw new Error(`${context} failed: ${message}`);
  }
}

function parseTargetAppInstallRegistrationOperation(
  value: unknown,
  registrationPolicy: AppInstallRegistrationPolicy,
  context: string,
) {
  if (registrationPolicy === "custom-operation") {
    if (value === undefined) {
      throw new Error(
        `${context} failed: value is required when registrationPolicy is "custom-operation".`,
      );
    }

    try {
      return parseAppInstallRegistrationOperation(value, "value");
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim() !== ""
          ? error.message
          : "value is unsupported.";

      throw new Error(`${context} failed: ${message}`);
    }
  }

  if (value !== undefined) {
    throw new Error(
      `${context} failed: value must be omitted unless registrationPolicy is "custom-operation".`,
    );
  }

  return undefined;
}

function parsePackageAppKey(
  value: unknown,
  context: string,
  packageResolver?: AppPackageResolver,
): PackageAppKey {
  if (
    typeof value !== "string" ||
    !packageAppFactsForKey(value, packageResolver ?? bundledAppPackageResolver)
  ) {
    throw new Error(`${context} failed: package app key is unsupported.`);
  }

  return value as PackageAppKey;
}

function parseOptionalPositiveInteger(
  value: unknown,
  fallback: PackageAppRevision,
  context: string,
): PackageAppRevision {
  if (value === undefined) {
    return fallback;
  }

  if (!Number.isInteger(value) || typeof value !== "number" || value <= 0) {
    throw new Error(`${context} failed: value must be a positive integer.`);
  }

  return value;
}

function parseOptionalSourceSchemaHash(
  value: unknown,
  fallback: SourceSchemaHash | undefined,
  context: string,
): SourceSchemaHash {
  if (value === undefined) {
    if (fallback === undefined) {
      throw new Error(`${context} failed: source schema hash is required.`);
    }

    return fallback;
  }

  if (!isSourceSchemaHash(value)) {
    throw new Error(`${context} failed: source schema hash must be a sha256 digest.`);
  }

  return value;
}

function parseRequiredString(
  value: unknown,
  fallback: string | undefined,
  context: string,
): string {
  if (value === undefined && fallback !== undefined) {
    return fallback;
  }

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} failed: value must be a string.`);
  }

  return value;
}

function parseOptionalString(value: unknown, fallback: string, context: string): string {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} failed: value must be a string.`);
  }

  return value;
}

function adminJsonHeaders(adminToken: string | null | undefined): Record<string, string> {
  return formlessCliTargetJsonHeaders({ adminToken });
}

function parseRouteBase(value: unknown, fallback: "/apps"): "/apps" {
  const routeBase = parseRequiredString(value, fallback, "app registry adminRouteBase");

  if (routeBase !== "/apps") {
    throw new Error('app registry adminRouteBase failed: value must be "/apps".');
  }

  return routeBase;
}

function parseOptionalRouteBase(
  value: unknown,
  fallback: "/sites" | undefined,
): "/sites" | undefined {
  if (value === undefined) {
    return fallback;
  }

  if (value !== "/sites") {
    throw new Error('app registry publicRouteBase failed: value must be "/sites".');
  }

  return value;
}

function parseDomainProviderPlan(
  value: unknown,
  context: string,
): InstanceDomainProviderPlanResponse {
  if (!isRecord(value) || !isRecord(value.config) || !isRecord(value.plan)) {
    throw new Error(`${context} failed: domain provider plan response is invalid.`);
  }

  return value as InstanceDomainProviderPlanResponse;
}

function parseControlPlaneBootstrapResponse(
  value: unknown,
  context: string,
): DeployControlPlaneBootstrapResponse {
  if (!isRecord(value) || !Array.isArray(value.records)) {
    throw new Error(`${context} failed: control-plane bootstrap response is invalid.`);
  }

  return {
    ...(typeof value.cursor === "number" ? { cursor: value.cursor } : {}),
    records: value.records.map((record, index) =>
      parseControlPlaneRecord(record, `${context} records[${index}]`),
    ),
    ...(value.schema === undefined ? {} : { schema: value.schema }),
  };
}

function parseControlPlaneRecord(value: unknown, context: string): DeployControlPlaneRecord {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.entity !== "string" ||
    !isRecord(value.values)
  ) {
    throw new Error(`${context} failed: control-plane record is invalid.`);
  }

  return {
    ...(typeof value.createdAt === "string" ? { createdAt: value.createdAt } : {}),
    ...(typeof value.deletedAt === "string" ? { deletedAt: value.deletedAt } : {}),
    entity: value.entity,
    id: value.id,
    ...(typeof value.updatedAt === "string" ? { updatedAt: value.updatedAt } : {}),
    values: value.values,
  };
}

function parseOperationInvocationResponse(
  value: unknown,
  context: string,
): OperationInvocationResponse {
  if (
    !isRecord(value) ||
    !isRecord(value.invocation) ||
    !isRecord(value.output) ||
    typeof value.status !== "string"
  ) {
    throw new Error(`${context} failed: operation response is invalid.`);
  }

  return value as OperationInvocationResponse;
}

function controlPlaneRecordsByEntity(
  actorKind: DeployControlPlaneProtocolActorKind,
  records: DeployControlPlaneRecord[],
): FormlessInstanceControlPlaneRecords {
  return {
    actorKind,
    appInstalls: deployControlPlaneRecordsByEntity(records, "app-install"),
    appRoutes: controlPlaneAppRouteRecords(records),
    deploymentConfigs: deployControlPlaneRecordsByEntity(records, "deployment-config"),
    domainMappings: controlPlaneDomainRouteRecords(records),
    records,
    redirectIntents: controlPlaneRedirectRouteRecords(records),
  };
}

function controlPlaneAppRouteRecords(
  records: DeployControlPlaneRecord[],
): DeployControlPlaneRecord[] {
  return deployControlPlaneRecordsByEntity(records, "route").filter(
    (record) =>
      record.values.kind === "mount" &&
      record.values.matchHost === undefined &&
      typeof record.values.appInstall === "string",
  );
}

function controlPlaneDomainRouteRecords(
  records: DeployControlPlaneRecord[],
): DeployControlPlaneRecord[] {
  return deployControlPlaneRecordsByEntity(records, "route").filter(
    (record) => record.values.kind === "mount" && typeof record.values.matchHost === "string",
  );
}

function controlPlaneRedirectRouteRecords(
  records: DeployControlPlaneRecord[],
): DeployControlPlaneRecord[] {
  return deployControlPlaneRecordsByEntity(records, "route").filter(
    (record) => record.values.kind === "redirect",
  );
}

function parseDeploymentAttemptStartResponse(
  value: unknown,
  context: string,
): InstanceDeploymentAttemptStartResponse {
  if (!isRecord(value) || !isRecord(value.attempt) || typeof value.replayed !== "boolean") {
    throw new Error(`${context} failed: deployment attempt start response is invalid.`);
  }

  return value as InstanceDeploymentAttemptStartResponse;
}

function parseDeploymentAttemptHeartbeatResponse(
  value: unknown,
  context: string,
): InstanceDeploymentAttemptHeartbeatResponse {
  if (!isRecord(value) || !isRecord(value.attempt) || !isRecord(value.lease)) {
    throw new Error(`${context} failed: deployment attempt heartbeat response is invalid.`);
  }

  return value as InstanceDeploymentAttemptHeartbeatResponse;
}

function parseDeploymentAttemptPlanWritebackResponse(
  value: unknown,
  context: string,
): InstanceDeploymentAttemptPlanWritebackResponse {
  if (!isRecord(value) || !isRecord(value.attempt) || !isRecord(value.plan)) {
    throw new Error(`${context} failed: deployment attempt plan writeback response is invalid.`);
  }

  return value as InstanceDeploymentAttemptPlanWritebackResponse;
}

function parseDeploymentAttemptSuccessWritebackResponse(
  value: unknown,
  context: string,
): InstanceDeploymentAttemptSuccessWritebackResponse {
  if (
    !isRecord(value) ||
    !isRecord(value.attempt) ||
    !isRecord(value.lease) ||
    !isRecord(value.result)
  ) {
    throw new Error(`${context} failed: deployment attempt success writeback response is invalid.`);
  }

  return value as InstanceDeploymentAttemptSuccessWritebackResponse;
}

function parseDeploymentAttemptFailureWritebackResponse(
  value: unknown,
  context: string,
): InstanceDeploymentAttemptFailureWritebackResponse {
  if (!isRecord(value) || !isRecord(value.attempt) || !isRecord(value.result)) {
    throw new Error(`${context} failed: deployment attempt failure writeback response is invalid.`);
  }

  return value as InstanceDeploymentAttemptFailureWritebackResponse;
}

function parseDeploymentDriftWritebackResponse(
  value: unknown,
  context: string,
): InstanceDeploymentDriftWritebackResponse {
  if (!isRecord(value) || !isRecord(value.report)) {
    throw new Error(`${context} failed: deployment drift writeback response is invalid.`);
  }

  return value as InstanceDeploymentDriftWritebackResponse;
}

function parseDomainProviderDeleteResponse(
  value: unknown,
  context: string,
): InstanceDomainProviderDeleteResponse {
  if (!isRecord(value) || typeof value.status !== "string") {
    throw new Error(`${context} failed: domain provider delete response is invalid.`);
  }

  return value as InstanceDomainProviderDeleteResponse;
}

function parseDomainProviderDeleteJobResponse(
  value: unknown,
  context: string,
): InstanceDomainProviderDeleteJobResponse {
  if (!isRecord(value) || !isRecord(value.job)) {
    throw new Error(`${context} failed: domain provider delete job response is invalid.`);
  }

  return value as InstanceDomainProviderDeleteJobResponse;
}

function parseDomainProviderManualCleanupResponse(
  value: unknown,
  context: string,
): InstanceDomainProviderManualCleanupResponse {
  if (!isRecord(value) || value.status !== "cleaned" || !isRecord(value.target)) {
    throw new Error(`${context} failed: domain provider manual cleanup response is invalid.`);
  }

  return value as InstanceDomainProviderManualCleanupResponse;
}

function parseApplyEvidenceResponse(
  value: unknown,
  context: string,
): RecordInstanceDomainMappingApplyEvidenceResponse {
  if (
    !isRecord(value) ||
    !isRecord(value.appliedState) ||
    !Array.isArray(value.appliedStates) ||
    !isRecord(value.auditEvent) ||
    !Array.isArray(value.auditEvents)
  ) {
    throw new Error(`${context} failed: apply evidence response is invalid.`);
  }

  return value as RecordInstanceDomainMappingApplyEvidenceResponse;
}

function normalizeTargetDomainHost(value: string): string {
  const host = normalizeInstanceDomainHost(value);

  if (!host.ok) {
    throw new Error(host.error.message);
  }

  return host.host;
}

function routeTargetProfileFromDomainProfile(
  profile: InstanceDomainMappingProfile,
): InstanceControlPlaneRouteTargetProfile {
  return profile === "publicSite" ? "public-site" : profile;
}

function apiUrl(targetUrl: string, apiPath: string): string {
  return new URL(apiPath, `${targetUrl}/`).toString();
}

function deploymentReadUrl(targetUrl: string, apiPath: string, targetId?: string | null): string {
  const url = new URL(apiUrl(targetUrl, apiPath));

  if (targetId && targetId.trim() !== "") {
    url.searchParams.set("targetId", targetId);
  }

  return url.toString();
}

async function postDeploymentJson(
  dependencies: FormlessInstanceTargetClientDependencies,
  input: {
    adminToken?: string | null;
    body: unknown;
    path: string;
    targetUrl: string;
  },
): Promise<unknown> {
  const targetUrl = normalizeInstanceWorkspaceTargetUrl(input.targetUrl);
  const url = apiUrl(targetUrl, input.path);

  return postJson(dependencies.fetch, url, {
    body: JSON.stringify(input.body),
    headers: formlessCliTargetJsonHeaders({ adminToken: input.adminToken }),
    method: "POST",
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
