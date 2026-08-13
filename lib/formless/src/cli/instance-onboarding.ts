import type { Dirent } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Plugin as EsbuildPlugin } from "esbuild";
import type { Queue as CloudflareQueue } from "alchemy/cloudflare";
import type { DeployEvidenceSummary, DeployResourceGraph } from "@dpeek/formless-deploy";
import { parseSourceSchemaHash } from "@dpeek/formless-schema";

import {
  FORMLESS_PROGRAM_ARTIFACT_DEFINE_NAME,
  FORMLESS_PROGRAM_ARTIFACT_PATH_ENV_NAME,
} from "../program/artifact.ts";
import {
  FORMLESS_DEPLOY_METADATA_PATH,
  parseFormlessBundleDigest,
  type FormlessDeployMetadata,
} from "../shared/deploy-metadata.ts";
import type { DomainProviderPlan } from "../shared/domain-provider-protocol.ts";
import { parseOwnerSetupToken } from "../shared/protocol.ts";
import {
  FORMLESS_TURNSTILE_SECRET_KEY_ENV_NAME,
  FORMLESS_TURNSTILE_SITE_KEY_ENV_NAME,
} from "../shared/turnstile-config.ts";
import { runtimeTopologyRoutes } from "../shared/runtime-topology.ts";
import {
  FORMLESS_SITE_PROJECT_ROOT_ENV_NAME,
  FORMLESS_WORKSPACE_RUNTIME_EXTENSIONS_ENV_NAME,
} from "../shared/workspace-runtime-extensions.ts";
import { formlessStylexWorkerBundlePlugin } from "../runtime/stylex-esbuild.ts";
import { sitePublicRendererWorkerVirtualModulesPlugin } from "./runtime-extension-bundler.ts";
import {
  FORMLESS_WORKSPACE_PROGRAM_RUNTIME_ENV_NAME,
  programRuntimeVirtualModulesPlugin,
} from "./program-runtime-bundler.ts";
import {
  applyAlchemyDeployResourceGraph,
  type AlchemyDeployResourceZoneResolver,
  type AlchemyDomainProviderFactories,
  type CloudflareEmailSendingDomain,
  type CloudflareEmailSendingDomainProps,
  type CloudflareWorkerSendEmailBindingProps,
} from "../worker/domain-provider-alchemy.ts";
import { appendDotEnvValue, parseDotEnv } from "./dotenv.ts";
import {
  CloudflareTurnstileWidget,
  type TurnstileWidgetOutput,
  type TurnstileWidgetProps,
} from "./turnstile-alchemy.ts";

export const ALCHEMY_PASSWORD_ENV_NAME = "ALCHEMY_PASSWORD";
export const DEFAULT_FORMLESS_INSTANCE_NAME = "formless";
export const FORMLESS_ALCHEMY_APP_NAME = "formless-instance";
export const FORMLESS_HOME_DIRECTORY = ".formless";
export const FORMLESS_INSTANCE_DIRECTORY = "instances";
export const FORMLESS_INSTANCE_LOCAL_ENV_FILE = "deploy.env";
export const FORMLESS_INSTANCE_STATE_FILE = "formless.instance.json";
export const FORMLESS_INSTANCE_STATE_VERSION = 1;
export const FORMLESS_INSTANCE_STATE_KIND = "formless-instance";
export const FORMLESS_WORKER_COMPATIBILITY_DATE = "2026-04-28";
export const FORMLESS_OWNER_SETUP_ROUTE_PATH = runtimeTopologyRoutes.authAccountSetupRoute;

const FORMLESS_OWNER_SETUP_CAPABILITY_API_PATH = "/api/formless/setup/capability";
const FORMLESS_INSTANCE_WORKER_BUILD_COMMAND = "bun run vp build";
const CLOUDFLARE_API_TOKEN_ENV_NAME = "CLOUDFLARE_API_TOKEN";
const FORMLESS_EMAIL_DELIVERY_QUEUE_BINDING_NAME = "FORMLESS_EMAIL_DELIVERY_QUEUE";
const FORMLESS_EMAIL_DELIVERY_QUEUE_MAX_RETRIES = 3;
const CLOUDFLARE_CREDENTIAL_ENV_NAMES = [
  "CF_API_TOKEN",
  "CLOUDFLARE_API_KEY",
  CLOUDFLARE_API_TOKEN_ENV_NAME,
] as const;

export type FormlessInstanceDeploymentAccount = {
  id: string;
  name?: string;
  workersDevSubdomain: string;
};

export type FormlessInstanceDeploymentDefaults = {
  instanceName?: string | null;
};

export type ListFormlessInstanceAccountsInput = {
  credentialProfile: string | null;
};

export type SelectFormlessInstanceAccountInput = {
  accounts: FormlessInstanceDeploymentAccount[];
  credentialProfile: string | null;
};

export type FormlessInstanceAccountDiscoveryAdapter = {
  listAccounts: (
    input: ListFormlessInstanceAccountsInput,
  ) => Promise<FormlessInstanceDeploymentAccount[]>;
};

type AlchemyCloudflareApiOptions = {
  accountId?: string;
  apiToken?: unknown;
  profile?: string;
};

type AlchemyCloudflareApiClient = {
  accountId?: string;
  get: (path: string, init?: RequestInit) => Promise<Response>;
  post: (path: string, body: unknown, init?: RequestInit) => Promise<Response>;
};

export type AlchemyFormlessInstanceAccountDiscoveryDependencies = {
  createCloudflareApi: (
    options: AlchemyCloudflareApiOptions,
  ) => Promise<AlchemyCloudflareApiClient>;
};

export type PlanFormlessInstanceDeploymentInput = {
  account: FormlessInstanceDeploymentAccount;
  adoptExistingDeployment?: boolean;
  defaults?: FormlessInstanceDeploymentDefaults;
  instanceName?: string | null;
  mediaBucketName?: string | null;
  packageVersion: string;
};

export type FormlessInstanceDeploymentPlan = {
  account: FormlessInstanceDeploymentAccount;
  adoptExistingDeployment: boolean;
  deploymentTarget: "workers.dev";
  expectedUrl: {
    host: string;
    kind: "workers.dev";
    url: string;
  };
  instanceName: string;
  packageVersion: string;
  resources: {
    assets: {
      bindingName: "ASSETS";
    };
    authority: {
      bindingName: "FORMLESS_AUTHORITY";
      className: "FormlessAuthority";
      namespaceName: string;
    };
    mediaBucket: {
      bindingName: "FORMLESS_MEDIA";
      name: string;
    };
    emailDeliveryQueue: {
      bindingName: typeof FORMLESS_EMAIL_DELIVERY_QUEUE_BINDING_NAME;
      consumerMaxRetries: typeof FORMLESS_EMAIL_DELIVERY_QUEUE_MAX_RETRIES;
      deadLetterQueueName: string;
      name: string;
    };
    worker: {
      name: string;
      workersDevEnabled: true;
    };
  };
  runtimeVars: {
    FORMLESS_DEPLOY_VERSION: string;
    FORMLESS_DOMAIN_PROVIDER_CLOUDFLARE_ACCOUNT_ID: string;
    FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID: string;
    FORMLESS_DOMAIN_PROVIDER_WORKER_NAME: string;
    FORMLESS_RUNTIME_PROFILE: "instance";
    VITE_FORMLESS_RUNTIME_PROFILE: "instance";
  };
  secretRequirements: Array<{
    envName: "ALCHEMY_PASSWORD" | "CLOUDFLARE_API_TOKEN" | "FORMLESS_ADMIN_TOKEN";
    purpose:
      | "apply-cloudflare-domain-provider-resources"
      | "encrypt-domain-provider-alchemy-state"
      | "protect-authority-and-media-writes";
    storage: "cloudflare-worker-secret";
  }>;
};

export type FormlessInstanceDeploymentSecrets = {
  ALCHEMY_PASSWORD: string;
  CLOUDFLARE_API_TOKEN?: string;
  FORMLESS_ADMIN_TOKEN: string;
};

export type FormlessInstanceProviderBearerMaterial = {
  credentialRef?: string;
  envName?: "CLOUDFLARE_API_TOKEN" | "CF_API_TOKEN";
  kind: "cloudflare-api-token";
  providerFamily: "cloudflare";
  source: "formless-cloudflare-oauth" | "manual-cloudflare-api-token";
  token: string;
};

export type DeployFormlessInstanceInput = {
  credentialProfile: string | null;
  deploymentResourceGraph?: DeployResourceGraph;
  packageRoot: string;
  plan: FormlessInstanceDeploymentPlan;
  providerBearer?: FormlessInstanceProviderBearerMaterial;
  secrets: FormlessInstanceDeploymentSecrets;
  stateRoot: string;
  workspaceProgramArtifact?: string;
  workspaceProgramArtifactPath?: string;
  workspaceProgramRuntime?: string;
  workspaceRoot?: string;
  workspaceRuntimeExtensions?: string;
};

export type DeployFormlessInstanceResult = {
  resourceEvidence?: DeployEvidenceSummary[];
  url: string;
};

export type DestroyFormlessInstanceInput = {
  credentialProfile: string | null;
  domainProviderPlan: DomainProviderPlan;
  domainProviderResources?: DeployResourceGraph;
  packageRoot: string;
  plan: FormlessInstanceDeploymentPlan;
  providerBearer?: FormlessInstanceProviderBearerMaterial;
  secrets: Omit<FormlessInstanceDeploymentSecrets, "FORMLESS_ADMIN_TOKEN">;
  stateRoot: string;
};

export type DestroyFormlessInstanceResourceStatus = "already-missing" | "destroyed" | "skipped";

export type DestroyFormlessInstanceResourceSummary = {
  alchemyState: DestroyFormlessInstanceResourceStatus;
  customDomains: number;
  dnsRecords: number;
  durableObjectNamespace: DestroyFormlessInstanceResourceStatus;
  mediaBucket: DestroyFormlessInstanceResourceStatus;
  turnstileWidget: DestroyFormlessInstanceResourceStatus;
  worker: DestroyFormlessInstanceResourceStatus;
  workerAssets: DestroyFormlessInstanceResourceStatus;
  workerSecrets: DestroyFormlessInstanceResourceStatus;
};

export type DestroyFormlessInstanceResult = {
  resources: DestroyFormlessInstanceResourceSummary;
};

export type FormlessInstanceDeploymentAdapter = {
  deploy: (input: DeployFormlessInstanceInput) => Promise<DeployFormlessInstanceResult>;
  destroy?: (input: DestroyFormlessInstanceInput) => Promise<DestroyFormlessInstanceResult>;
};

export type CheckFormlessInstanceDeployMetadataInput = {
  expectedVersion: string;
  providerBearer?: FormlessInstanceProviderBearerMaterial;
  url: string;
};

export type CheckFormlessInstanceDeployMetadataResult = {
  bundleDigest?: FormlessDeployMetadata["bundleDigest"];
  cacheControl: string;
  metadataUrl: string;
  packageVersion: string | null;
  runtimeProtocolVersion: number;
  schemaProvenance: FormlessDeployMetadata["schemaProvenance"];
  storageMigrationSet: string;
  url: string;
  version: string;
};

export type CheckFormlessInstanceDeployMetadataDependencies = {
  fetch: typeof fetch;
};

export type FormlessInstanceDeploymentHealthCheckAdapter = {
  check: (
    input: CheckFormlessInstanceDeployMetadataInput,
  ) => Promise<CheckFormlessInstanceDeployMetadataResult>;
};

export type CreateFormlessInstanceOwnerSetupCapabilityInput = {
  adminToken: string;
  deploymentUrl: string;
  setupToken: string;
};

export type CreateFormlessInstanceOwnerSetupCapabilityResult = {
  capabilityCreated: true;
  endpointUrl: string;
  expiresAt?: string;
  setupComplete: false;
};

export type CreateFormlessInstanceOwnerSetupCapabilityDependencies = {
  fetch: typeof fetch;
};

export type FormlessInstanceOwnerSetupCapabilityAdapter = {
  create: (
    input: CreateFormlessInstanceOwnerSetupCapabilityInput,
  ) => Promise<CreateFormlessInstanceOwnerSetupCapabilityResult>;
};

export type WriteFormlessInstanceStateInput = {
  root: string;
  state: FormlessInstanceState;
};

export type WriteFormlessInstanceStateResult = {
  path: string;
  state: FormlessInstanceState;
};

export type FormlessInstanceStateWriter = {
  write: (input: WriteFormlessInstanceStateInput) => Promise<WriteFormlessInstanceStateResult>;
};

export type WriteFormlessInstanceStateDependencies = {
  prepareStateDirectory: (root: string) => Promise<void>;
  statePath: (root: string, fileName: typeof FORMLESS_INSTANCE_STATE_FILE) => string;
  writeFile: (filePath: string, contents: string) => Promise<void>;
};

export type AlchemyFormlessInstanceDeploymentAppOptions = {
  adopt: boolean;
  phase: "destroy" | "up";
  password: string;
  profile?: string;
  rootDir: string;
  stage: string;
};

export type AlchemyFormlessInstanceDeploymentWorkerProps = {
  adopt: boolean;
  accountId: string;
  apiToken?: unknown;
  assets: {
    directory: "dist/client";
    not_found_handling: "single-page-application";
    run_worker_first: string[];
  };
  bindings: Record<string, unknown>;
  build: {
    command: typeof FORMLESS_INSTANCE_WORKER_BUILD_COMMAND;
    env: FormlessInstanceDeploymentPlan["runtimeVars"] & {
      [FORMLESS_TURNSTILE_SITE_KEY_ENV_NAME]: string;
      [FORMLESS_SITE_PROJECT_ROOT_ENV_NAME]?: string;
      [FORMLESS_WORKSPACE_RUNTIME_EXTENSIONS_ENV_NAME]?: string;
      [FORMLESS_WORKSPACE_PROGRAM_RUNTIME_ENV_NAME]?: string;
      [FORMLESS_PROGRAM_ARTIFACT_PATH_ENV_NAME]?: string;
    };
  };
  bundle: {
    define: {
      [FORMLESS_PROGRAM_ARTIFACT_DEFINE_NAME]: string;
    };
    plugins: EsbuildPlugin[];
  };
  compatibilityDate: typeof FORMLESS_WORKER_COMPATIBILITY_DATE;
  cwd: string;
  entrypoint: "src/worker/index.ts";
  eventSources: Array<{
    queue: unknown;
    settings: {
      deadLetterQueue: unknown;
      maxRetries: typeof FORMLESS_EMAIL_DELIVERY_QUEUE_MAX_RETRIES;
    };
  }>;
  name: string;
  previewSubdomains: false;
  profile?: string;
  url: true;
};

export type AlchemyFormlessInstanceDeploymentTurnstileWidgetProps = TurnstileWidgetProps;
export type AlchemyFormlessInstanceDeploymentQueueProps = {
  adopt: boolean;
  accountId: string;
  apiToken?: unknown;
  name: string;
  profile?: string;
};

export type AlchemyFormlessInstanceDeploymentDependencies = {
  createApp: (
    name: typeof FORMLESS_ALCHEMY_APP_NAME,
    options: AlchemyFormlessInstanceDeploymentAppOptions,
  ) => Promise<{
    finalize: () => Promise<void>;
  }>;
  createCloudflareApi?: (
    options: AlchemyCloudflareApiOptions,
  ) => Promise<AlchemyCloudflareApiClient>;
  createCustomDomain?: AlchemyDomainProviderFactories["CustomDomain"];
  createDurableObjectNamespace: (
    id: "authority",
    props: {
      className: "FormlessAuthority";
      sqlite: true;
    },
  ) => unknown;
  createDnsRecords?: AlchemyDomainProviderFactories["DnsRecords"];
  createEmailSenderBinding?: AlchemyDomainProviderFactories["SendEmailBinding"];
  createEmailSendingDomain?: AlchemyDomainProviderFactories["EmailSendingDomain"];
  createQueue?: (
    id: "email-delivery" | "email-delivery-dlq",
    props: AlchemyFormlessInstanceDeploymentQueueProps,
  ) => Promise<CloudflareQueue>;
  createR2Bucket: (
    id: "media",
    props: {
      adopt: boolean;
      accountId: string;
      apiToken?: unknown;
      empty?: boolean;
      name: string;
      profile?: string;
    },
  ) => Promise<unknown>;
  createSecret: (value: string) => unknown;
  createTurnstileWidget: (
    id: "turnstile",
    props: AlchemyFormlessInstanceDeploymentTurnstileWidgetProps,
  ) => Promise<TurnstileWidgetOutput<unknown>>;
  deployViteWorker: (
    id: "worker",
    props: AlchemyFormlessInstanceDeploymentWorkerProps,
  ) => Promise<{
    url?: string | null;
  }>;
};

type DeclareFormlessInstanceAlchemyResourceTreeInput = {
  adminToken: string;
  adoptExistingDeployment: boolean;
  alchemyPassword: string;
  cloudflareApiToken?: string;
  credentialProfile: string | null;
  dependencies: AlchemyFormlessInstanceDeploymentDependencies;
  packageRoot: string;
  plan: FormlessInstanceDeploymentPlan;
  resourceGraph?: DeployResourceGraph;
  workspaceProgramArtifact?: string;
  workspaceProgramArtifactPath?: string;
  workspaceProgramRuntime?: string;
  workspaceRoot?: string;
  workspaceRuntimeExtensions?: string;
};

type DeclareFormlessInstanceAlchemyResourceTreeResult = {
  resourceEvidence?: DeployEvidenceSummary[];
  url: string;
};

export type RunFormlessInstanceOnboardingInput = {
  credentialProfile?: string | null;
  instanceName?: string | null;
  open?: boolean;
};

export type RunFormlessInstanceOnboardingDependencies = {
  accountDiscovery: FormlessInstanceAccountDiscoveryAdapter;
  deploymentAdapter: FormlessInstanceDeploymentAdapter;
  healthCheck: FormlessInstanceDeploymentHealthCheckAdapter;
  localSecretEnv: FormlessInstanceLocalSecretEnvStore;
  openBrowser: (url: string) => Promise<void>;
  packageRoot: string;
  packageVersion: string;
  randomToken: () => string;
  selectAccount?: (
    input: SelectFormlessInstanceAccountInput,
  ) => Promise<FormlessInstanceDeploymentAccount> | FormlessInstanceDeploymentAccount;
  stateRoot: string;
  stateWriter: FormlessInstanceStateWriter;
  setupCapability: FormlessInstanceOwnerSetupCapabilityAdapter;
};

export type RunFormlessInstanceOnboardingResult = {
  account: FormlessInstanceDeploymentAccount;
  browserOpened: boolean;
  credentialProfile: string | null;
  deployment: DeployFormlessInstanceResult;
  healthCheck: CheckFormlessInstanceDeployMetadataResult;
  instanceName: string;
  localSecretEnv: EnsureFormlessInstanceLocalSecretEnvResult;
  mode: "deployed";
  open: boolean;
  ownerSetup: {
    capability: CreateFormlessInstanceOwnerSetupCapabilityResult;
    url: string;
  };
  plan: FormlessInstanceDeploymentPlan;
  state: FormlessInstanceState;
  stateWrite: WriteFormlessInstanceStateResult;
};

export type FormlessInstanceState = {
  accountId: string;
  accountName?: string;
  authorityNamespaceName: string;
  credentialProfile?: string;
  deployedPackageVersion?: string;
  deploymentTarget: "workers.dev";
  instanceName: string;
  kind: typeof FORMLESS_INSTANCE_STATE_KIND;
  mediaBucketName: string;
  version: typeof FORMLESS_INSTANCE_STATE_VERSION;
  workerName: string;
  workersDevUrl: string;
};

export type CreateFormlessInstanceStateInput = {
  credentialProfile?: string | null;
  plan: FormlessInstanceDeploymentPlan;
};

export type FormlessInstanceLocalSecretEnv = {
  ALCHEMY_PASSWORD: string;
};

export type EnsureFormlessInstanceLocalSecretEnvInput = {
  createSecret: () => string;
  root: string;
};

export type EnsureFormlessInstanceLocalSecretEnvResult = {
  created: boolean;
  path: string;
  secrets: FormlessInstanceLocalSecretEnv;
};

export type FormlessInstanceLocalSecretEnvStore = {
  ensure: (
    input: EnsureFormlessInstanceLocalSecretEnvInput,
  ) => Promise<EnsureFormlessInstanceLocalSecretEnvResult>;
};

export type EnsureFormlessInstanceLocalSecretEnvDependencies = {
  prepareStateDirectory: (root: string) => Promise<void>;
  readFile: (filePath: string, encoding: BufferEncoding) => Promise<string>;
  statePath: (root: string, fileName: typeof FORMLESS_INSTANCE_LOCAL_ENV_FILE) => string;
  writeFile: (filePath: string, contents: string) => Promise<void>;
};

const maxInstanceNameLength = 53;
const workersDevDomain = "workers.dev";
const stateKeys = new Set([
  "accountId",
  "accountName",
  "authorityNamespaceName",
  "credentialProfile",
  "deployedPackageVersion",
  "deploymentTarget",
  "instanceName",
  "kind",
  "mediaBucketName",
  "version",
  "workerName",
  "workersDevUrl",
]);
const forbiddenSecretKeys = new Set([
  "admintoken",
  "apitoken",
  "bootstraptoken",
  "cloudflareapitoken",
  "cloudflaretoken",
  "cfapitoken",
  "formlessadmintoken",
  "secret",
  "secrets",
  "token",
  "writeprotectionsecret",
]);

export function planFormlessInstanceDeployment(
  input: PlanFormlessInstanceDeploymentInput,
): FormlessInstanceDeploymentPlan {
  const rawInstanceName =
    input.instanceName ?? input.defaults?.instanceName ?? DEFAULT_FORMLESS_INSTANCE_NAME;
  const instanceName = normalizeFormlessInstanceName(rawInstanceName);
  const account = parseDeploymentAccount(input.account);
  const packageVersion = parseRequiredString("Package version", input.packageVersion);
  const adoptExistingDeployment = input.adoptExistingDeployment === true;
  const workerName = instanceName;
  const emailDeliveryQueueName = `${workerName}-email-delivery`;
  const mediaBucketName =
    parseOptionalString(
      "Formless instance media bucket name",
      input.mediaBucketName ?? undefined,
    ) ?? `${instanceName}-media`;
  const authorityNamespaceName = `${instanceName}-authority`;
  const host = `${workerName}.${account.workersDevSubdomain}.${workersDevDomain}`;

  return {
    account,
    adoptExistingDeployment,
    deploymentTarget: "workers.dev",
    expectedUrl: {
      host,
      kind: "workers.dev",
      url: `https://${host}`,
    },
    instanceName,
    packageVersion,
    resources: {
      assets: {
        bindingName: "ASSETS",
      },
      authority: {
        bindingName: "FORMLESS_AUTHORITY",
        className: "FormlessAuthority",
        namespaceName: authorityNamespaceName,
      },
      mediaBucket: {
        bindingName: "FORMLESS_MEDIA",
        name: mediaBucketName,
      },
      emailDeliveryQueue: {
        bindingName: FORMLESS_EMAIL_DELIVERY_QUEUE_BINDING_NAME,
        consumerMaxRetries: FORMLESS_EMAIL_DELIVERY_QUEUE_MAX_RETRIES,
        deadLetterQueueName: `${emailDeliveryQueueName}-dlq`,
        name: emailDeliveryQueueName,
      },
      worker: {
        name: workerName,
        workersDevEnabled: true,
      },
    },
    runtimeVars: {
      FORMLESS_DEPLOY_VERSION: packageVersion,
      FORMLESS_DOMAIN_PROVIDER_CLOUDFLARE_ACCOUNT_ID: account.id,
      FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID: instanceName,
      FORMLESS_DOMAIN_PROVIDER_WORKER_NAME: workerName,
      FORMLESS_RUNTIME_PROFILE: "instance",
      VITE_FORMLESS_RUNTIME_PROFILE: "instance",
    },
    secretRequirements: [
      {
        envName: "ALCHEMY_PASSWORD",
        purpose: "encrypt-domain-provider-alchemy-state",
        storage: "cloudflare-worker-secret",
      },
      {
        envName: "CLOUDFLARE_API_TOKEN",
        purpose: "apply-cloudflare-domain-provider-resources",
        storage: "cloudflare-worker-secret",
      },
      {
        envName: "FORMLESS_ADMIN_TOKEN",
        purpose: "protect-authority-and-media-writes",
        storage: "cloudflare-worker-secret",
      },
    ],
  };
}

export async function runFormlessInstanceOnboarding(
  input: RunFormlessInstanceOnboardingInput,
  dependencies: RunFormlessInstanceOnboardingDependencies,
): Promise<RunFormlessInstanceOnboardingResult> {
  const credentialProfile = normalizeCredentialProfile(input.credentialProfile);
  const stateRoot = parseRequiredString("Formless instance home", dependencies.stateRoot);
  const accounts = await dependencies.accountDiscovery.listAccounts({ credentialProfile });

  if (!Array.isArray(accounts)) {
    throw new Error("Cloudflare account discovery adapter must return an account array.");
  }

  const account = await (dependencies.selectAccount ?? selectOnlyFormlessInstanceAccount)({
    accounts,
    credentialProfile,
  });
  const plan = planFormlessInstanceDeployment({
    account,
    instanceName: input.instanceName,
    packageVersion: dependencies.packageVersion,
  });
  const instanceStateRoot = formlessInstanceStateRoot(stateRoot, plan.instanceName);
  const adminToken = parseRequiredString(
    "Generated Formless admin token",
    dependencies.randomToken(),
  );
  const setupToken = parseOwnerSetupToken(dependencies.randomToken());
  const localSecretEnv = await dependencies.localSecretEnv.ensure({
    createSecret: dependencies.randomToken,
    root: instanceStateRoot,
  });
  const deployment = parseDeployFormlessInstanceResult(
    await dependencies.deploymentAdapter.deploy({
      credentialProfile,
      packageRoot: parseRequiredString("Formless package root", dependencies.packageRoot),
      plan,
      secrets: {
        ALCHEMY_PASSWORD: localSecretEnv.secrets.ALCHEMY_PASSWORD,
        FORMLESS_ADMIN_TOKEN: adminToken,
      },
      stateRoot: instanceStateRoot,
    }),
  );
  const healthCheck = await dependencies.healthCheck.check({
    expectedVersion: plan.packageVersion,
    url: deployment.url,
  });
  const setupCapability = await dependencies.setupCapability.create({
    adminToken,
    deploymentUrl: deployment.url,
    setupToken,
  });
  const setupUrl = formatFormlessOwnerSetupUrl({
    deploymentUrl: deployment.url,
    setupToken,
  });

  const state = createFormlessInstanceState({
    credentialProfile,
    plan,
  });
  const stateWrite = await dependencies.stateWriter.write({
    root: instanceStateRoot,
    state,
  });

  if (input.open ?? false) {
    await dependencies.openBrowser(setupUrl);
  }

  return {
    account: plan.account,
    browserOpened: input.open ?? false,
    credentialProfile,
    deployment,
    healthCheck,
    instanceName: plan.instanceName,
    localSecretEnv,
    mode: "deployed",
    open: input.open ?? false,
    ownerSetup: {
      capability: setupCapability,
      url: setupUrl,
    },
    plan,
    state,
    stateWrite,
  };
}

export async function listFormlessInstanceAccountsWithAlchemy(
  input: ListFormlessInstanceAccountsInput,
  dependencies?: AlchemyFormlessInstanceAccountDiscoveryDependencies,
): Promise<FormlessInstanceDeploymentAccount[]> {
  const resolvedDependencies =
    dependencies ?? (await nodeAlchemyFormlessInstanceAccountDiscoveryDependencies());
  const credentialProfile = normalizeCredentialProfile(input.credentialProfile);
  const api = await resolvedDependencies.createCloudflareApi(
    credentialProfile ? { profile: credentialProfile } : {},
  );
  const resolvedAccountId = parseOptionalString("Alchemy Cloudflare account id", api.accountId);

  if (resolvedAccountId !== undefined) {
    return [
      parseDeploymentAccount({
        id: resolvedAccountId,
        workersDevSubdomain: await readFormlessInstanceWorkersDevSubdomainWithAlchemy(
          api,
          resolvedAccountId,
          credentialProfile,
        ),
      }),
    ];
  }

  const accounts = await readCloudflareResult<CloudflareAccountApiResult[]>(
    "list Cloudflare accounts",
    api.get("/accounts", {
      headers: { accept: "application/json" },
    }),
  );

  return Promise.all(
    accounts.map(async (account) => {
      const accountId = parseRequiredString("Cloudflare account id", account.id);
      const accountName = parseOptionalString("Cloudflare account name", account.name);
      const workersDevSubdomain = await readFormlessInstanceWorkersDevSubdomainWithAlchemy(
        api,
        accountId,
        credentialProfile,
      );

      return parseDeploymentAccount({
        id: accountId,
        ...(accountName === undefined ? {} : { name: accountName }),
        workersDevSubdomain,
      });
    }),
  );
}

async function readFormlessInstanceWorkersDevSubdomainWithAlchemy(
  api: AlchemyCloudflareApiClient,
  accountId: string,
  credentialProfile: string | null,
): Promise<string> {
  let subdomain: { subdomain: string };

  try {
    subdomain = await readCloudflareResult<{ subdomain: string }>(
      `read workers.dev subdomain for Cloudflare account ${accountId}`,
      api.get(`/accounts/${accountId}/workers/subdomain`, {
        headers: { accept: "application/json" },
      }),
    );
  } catch (error) {
    if (isCloudflareAuthenticationFailure(error)) {
      const profileFlag = credentialProfile ? ` -p ${credentialProfile}` : "";

      throw new Error(
        [
          error instanceof Error ? error.message : String(error),
          `Cloudflare rejected the credentials resolved by Alchemy for account ${accountId}.`,
          `Re-run \`alchemy login cloudflare${profileFlag}\` and \`alchemy configure${profileFlag}\`, or use a Cloudflare API token that can manage Workers and R2 for that account.`,
          "If CLOUDFLARE_API_TOKEN or CLOUDFLARE_API_KEY is set, it overrides the Alchemy profile.",
        ].join(" "),
      );
    }

    throw error;
  }

  return subdomain.subdomain;
}

function isCloudflareAuthenticationFailure(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes("HTTP 401") ||
    error.message.includes("HTTP 403") ||
    error.message.includes("Authentication error") ||
    error.message.includes("Unauthorized to access requested resource")
  );
}

export const alchemyFormlessInstanceAccountDiscoveryAdapter: FormlessInstanceAccountDiscoveryAdapter =
  {
    listAccounts: listFormlessInstanceAccountsWithAlchemy,
  };

export async function checkFormlessInstanceDeployMetadata(
  input: CheckFormlessInstanceDeployMetadataInput,
  dependencies: CheckFormlessInstanceDeployMetadataDependencies,
): Promise<CheckFormlessInstanceDeployMetadataResult> {
  const url = parseWorkersDevUrl("Formless instance health check URL", input.url);
  const expectedVersion = parseRequiredString(
    "Expected Formless deploy metadata version",
    input.expectedVersion,
  );
  const metadataUrl = new URL(FORMLESS_DEPLOY_METADATA_PATH, `${url}/`).toString();
  const response = await dependencies.fetch(metadataUrl, {
    headers: { accept: "application/json" },
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Formless instance health check failed for ${url}: HTTP ${response.status} ${text}`,
    );
  }

  const cacheControl = response.headers.get("Cache-Control") ?? "";

  if (!cacheControlIncludesNoStore(cacheControl)) {
    throw new Error(
      `Formless instance health check failed for ${url}: deploy metadata must send Cache-Control: no-store.`,
    );
  }

  const metadata = parseFormlessDeployMetadata(text, url);
  const packageVersion = metadata.packageVersion ?? metadata.version;

  if (packageVersion !== expectedVersion) {
    throw new Error(
      `Formless instance health check failed for ${url}: expected deploy version ${expectedVersion}, got ${packageVersion ?? "<missing>"}.`,
    );
  }

  return {
    ...(metadata.bundleDigest === undefined ? {} : { bundleDigest: metadata.bundleDigest }),
    cacheControl,
    metadataUrl,
    packageVersion: metadata.packageVersion,
    runtimeProtocolVersion: metadata.runtimeProtocolVersion,
    schemaProvenance: metadata.schemaProvenance,
    storageMigrationSet: metadata.storageMigrationSet,
    url,
    version: packageVersion,
  };
}

async function declareFormlessInstanceAlchemyResourceTree(
  input: DeclareFormlessInstanceAlchemyResourceTreeInput,
): Promise<DeclareFormlessInstanceAlchemyResourceTreeResult> {
  let cloudflareApiTokenSecret: unknown;
  const secretCloudflareApiToken = (): unknown => {
    if (input.cloudflareApiToken === undefined) {
      return undefined;
    }

    if (cloudflareApiTokenSecret === undefined) {
      cloudflareApiTokenSecret = input.dependencies.createSecret(input.cloudflareApiToken);
    }

    return cloudflareApiTokenSecret;
  };
  const cloudflareResourceOptions = cloudflareAlchemyResourceOptions({
    accountId: input.plan.account.id,
    apiToken: secretCloudflareApiToken(),
    credentialProfile: input.credentialProfile,
  });
  const mediaBucket = await input.dependencies.createR2Bucket("media", {
    adopt: input.adoptExistingDeployment,
    ...cloudflareResourceOptions,
    empty: true,
    name: input.plan.resources.mediaBucket.name,
  });
  const authorityNamespace = input.dependencies.createDurableObjectNamespace("authority", {
    className: input.plan.resources.authority.className,
    sqlite: true,
  });
  const turnstileWidget = await input.dependencies.createTurnstileWidget("turnstile", {
    adopt: input.adoptExistingDeployment,
    ...turnstileCloudflareResourceOptions(cloudflareResourceOptions),
    domains: turnstileWidgetDomains({
      deploymentResourceGraph: input.resourceGraph,
      plan: input.plan,
    }),
    mode: "managed",
    name: turnstileWidgetName(input.plan),
  });
  const workerEmailBindings = await workerEmailBindingsFromDeployResourceGraph({
    dependencies: input.dependencies,
    resourceGraph: input.resourceGraph,
  });
  const emailDeliveryQueues = await createEmailDeliveryQueues({
    cloudflareResourceOptions,
    dependencies: input.dependencies,
    plan: input.plan,
  });
  const worker = await input.dependencies.deployViteWorker("worker", {
    adopt: input.adoptExistingDeployment,
    ...cloudflareResourceOptions,
    assets: formlessInstanceAlchemyAssets(),
    bindings: {
      [input.plan.resources.authority.bindingName]: authorityNamespace,
      [input.plan.resources.mediaBucket.bindingName]: mediaBucket,
      [input.plan.resources.emailDeliveryQueue.bindingName]: emailDeliveryQueues.emailDeliveryQueue,
      ALCHEMY_PASSWORD: input.dependencies.createSecret(input.alchemyPassword),
      ...(input.cloudflareApiToken === undefined
        ? {}
        : { CLOUDFLARE_API_TOKEN: secretCloudflareApiToken() }),
      FORMLESS_ADMIN_TOKEN: input.dependencies.createSecret(input.adminToken),
      FORMLESS_DEPLOY_VERSION: input.plan.runtimeVars.FORMLESS_DEPLOY_VERSION,
      FORMLESS_DOMAIN_PROVIDER_CLOUDFLARE_ACCOUNT_ID:
        input.plan.runtimeVars.FORMLESS_DOMAIN_PROVIDER_CLOUDFLARE_ACCOUNT_ID,
      FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID:
        input.plan.runtimeVars.FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID,
      FORMLESS_DOMAIN_PROVIDER_WORKER_NAME:
        input.plan.runtimeVars.FORMLESS_DOMAIN_PROVIDER_WORKER_NAME,
      FORMLESS_RUNTIME_PROFILE: input.plan.runtimeVars.FORMLESS_RUNTIME_PROFILE,
      [FORMLESS_TURNSTILE_SECRET_KEY_ENV_NAME]: turnstileWidget.verificationSecret,
      [FORMLESS_TURNSTILE_SITE_KEY_ENV_NAME]: turnstileWidget.siteKey,
      ...workerEmailBindings,
    },
    build: {
      command: FORMLESS_INSTANCE_WORKER_BUILD_COMMAND,
      env: {
        ...input.plan.runtimeVars,
        [FORMLESS_TURNSTILE_SITE_KEY_ENV_NAME]: turnstileWidget.siteKey,
        ...(input.workspaceRoot === undefined
          ? {}
          : { [FORMLESS_SITE_PROJECT_ROOT_ENV_NAME]: input.workspaceRoot }),
        ...(input.workspaceProgramArtifactPath === undefined
          ? {}
          : {
              [FORMLESS_PROGRAM_ARTIFACT_PATH_ENV_NAME]: input.workspaceProgramArtifactPath,
            }),
        ...(input.workspaceProgramRuntime === undefined
          ? {}
          : {
              [FORMLESS_WORKSPACE_PROGRAM_RUNTIME_ENV_NAME]: input.workspaceProgramRuntime,
            }),
        ...(input.workspaceRuntimeExtensions === undefined
          ? {}
          : {
              [FORMLESS_WORKSPACE_RUNTIME_EXTENSIONS_ENV_NAME]: input.workspaceRuntimeExtensions,
            }),
      },
    },
    bundle: {
      define: {
        [FORMLESS_PROGRAM_ARTIFACT_DEFINE_NAME]: JSON.stringify(
          input.workspaceProgramArtifact ?? "",
        ),
      },
      plugins: [
        formlessStylexWorkerBundlePlugin(path.resolve(input.packageRoot, "../renderer")),
        programRuntimeVirtualModulesPlugin({
          env: workerRuntimeExtensionBundlerEnv(input),
          resolveDir: input.packageRoot,
          workspaceRoot: input.workspaceRoot,
        }),
        sitePublicRendererWorkerVirtualModulesPlugin({
          env: workerRuntimeExtensionBundlerEnv(input),
        }),
      ],
    },
    compatibilityDate: FORMLESS_WORKER_COMPATIBILITY_DATE,
    cwd: input.packageRoot,
    entrypoint: "src/worker/index.ts",
    eventSources: [
      {
        queue: emailDeliveryQueues.emailDeliveryQueue,
        settings: {
          deadLetterQueue: emailDeliveryQueues.deadLetterQueue,
          maxRetries: input.plan.resources.emailDeliveryQueue.consumerMaxRetries,
        },
      },
    ],
    name: input.plan.resources.worker.name,
    previewSubdomains: false,
    url: input.plan.resources.worker.workersDevEnabled,
  });
  let resourceEvidence: DeployEvidenceSummary[] | undefined;

  if (input.resourceGraph !== undefined && input.resourceGraph.resources.length > 0) {
    resourceEvidence = (
      await applyAlchemyDeployResourceGraph({
        adopt: input.adoptExistingDeployment,
        factories: deploymentResourceFactories(input.dependencies, cloudflareResourceOptions),
        resolveZoneIdForHost: deploymentResourceZoneResolver(
          input.dependencies,
          cloudflareResourceOptions,
        ),
        resourceGraph: input.resourceGraph,
      })
    ).evidence;
  }

  return {
    ...(resourceEvidence === undefined ? {} : { resourceEvidence }),
    url: worker.url ?? input.plan.expectedUrl.url,
  };
}

export async function deployFormlessInstanceWithAlchemy(
  input: DeployFormlessInstanceInput,
  dependencies?: AlchemyFormlessInstanceDeploymentDependencies,
): Promise<DeployFormlessInstanceResult> {
  const resolvedDependencies = dependencies ?? (await nodeAlchemyFormlessInstanceDependencies());
  const plan = input.plan;
  const credentialProfile = normalizeCredentialProfile(input.credentialProfile);
  const packageRoot = parseRequiredString("Formless package root", input.packageRoot);
  const workspaceRoot = parseOptionalString("Formless workspace root", input.workspaceRoot);
  const stateRoot = parseRequiredString("Formless instance Alchemy state root", input.stateRoot);
  const adminToken = parseRequiredString(
    "Formless admin token",
    input.secrets.FORMLESS_ADMIN_TOKEN,
  );
  const alchemyPassword = parseRequiredString(
    "Alchemy encryption password",
    input.secrets.ALCHEMY_PASSWORD,
  );
  const cloudflareApiToken = parseOptionalString(
    "Cloudflare API token",
    providerBearerCloudflareApiToken(input.providerBearer) ?? input.secrets.CLOUDFLARE_API_TOKEN,
  );
  const profileOptions = credentialProfile ? { profile: credentialProfile } : {};
  const adoptExistingDeployment = plan.adoptExistingDeployment;

  if (input.workspaceRuntimeExtensions !== undefined && workspaceRoot === undefined) {
    throw new Error("Formless runtime extension deploy requires a workspace root.");
  }
  if (input.workspaceProgramRuntime !== undefined && workspaceRoot === undefined) {
    throw new Error("Formless Program runtime composition deploy requires a workspace root.");
  }

  const app = await resolvedDependencies.createApp(FORMLESS_ALCHEMY_APP_NAME, {
    adopt: adoptExistingDeployment,
    phase: "up",
    password: alchemyPassword,
    ...profileOptions,
    rootDir: stateRoot,
    stage: plan.instanceName,
  });
  const resourceTree = await declareFormlessInstanceAlchemyResourceTree({
    adminToken,
    adoptExistingDeployment,
    alchemyPassword,
    ...(cloudflareApiToken === undefined ? {} : { cloudflareApiToken }),
    credentialProfile,
    dependencies: resolvedDependencies,
    packageRoot,
    plan,
    ...(input.deploymentResourceGraph === undefined
      ? {}
      : { resourceGraph: input.deploymentResourceGraph }),
    ...(input.workspaceProgramArtifact === undefined
      ? {}
      : { workspaceProgramArtifact: input.workspaceProgramArtifact }),
    ...(input.workspaceProgramArtifactPath === undefined
      ? {}
      : { workspaceProgramArtifactPath: input.workspaceProgramArtifactPath }),
    ...(input.workspaceProgramRuntime === undefined
      ? {}
      : { workspaceProgramRuntime: input.workspaceProgramRuntime }),
    ...(workspaceRoot === undefined ? {} : { workspaceRoot }),
    ...(input.workspaceRuntimeExtensions === undefined
      ? {}
      : { workspaceRuntimeExtensions: input.workspaceRuntimeExtensions }),
  });

  await app.finalize();

  return parseDeployFormlessInstanceResult(resourceTree);
}

function providerBearerCloudflareApiToken(
  providerBearer: FormlessInstanceProviderBearerMaterial | undefined,
): string | undefined {
  return providerBearer?.kind === "cloudflare-api-token" ? providerBearer.token : undefined;
}

export async function destroyFormlessInstanceWithAlchemy(
  input: DestroyFormlessInstanceInput,
  dependencies?: AlchemyFormlessInstanceDeploymentDependencies,
): Promise<DestroyFormlessInstanceResult> {
  const resolvedDependencies = dependencies ?? (await nodeAlchemyFormlessInstanceDependencies());
  const plan = input.plan;
  const credentialProfile = normalizeCredentialProfile(input.credentialProfile);
  const packageRoot = parseRequiredString("Formless package root", input.packageRoot);
  const stateRoot = parseRequiredString("Formless instance Alchemy state root", input.stateRoot);
  const alchemyPassword = parseRequiredString(
    "Alchemy encryption password",
    input.secrets.ALCHEMY_PASSWORD,
  );
  const cloudflareApiToken = parseOptionalString(
    "Cloudflare API token",
    providerBearerCloudflareApiToken(input.providerBearer) ?? input.secrets.CLOUDFLARE_API_TOKEN,
  );
  const profileOptions = credentialProfile ? { profile: credentialProfile } : {};
  const adoptExistingDeployment = plan.adoptExistingDeployment;

  if (cloudflareApiToken !== undefined) {
    await removeStoredAlchemyCloudflareApiTokens(stateRoot);
  }

  return withExplicitCloudflareApiTokenEnv(cloudflareApiToken, async () => {
    try {
      const app = await resolvedDependencies.createApp(FORMLESS_ALCHEMY_APP_NAME, {
        adopt: adoptExistingDeployment,
        phase: "destroy",
        password: alchemyPassword,
        ...profileOptions,
        rootDir: stateRoot,
        stage: plan.instanceName,
      });
      await declareFormlessInstanceAlchemyResourceTree({
        adminToken: "destroy-placeholder",
        adoptExistingDeployment,
        alchemyPassword,
        ...(cloudflareApiToken === undefined ? {} : { cloudflareApiToken }),
        credentialProfile,
        dependencies: resolvedDependencies,
        packageRoot,
        plan,
        ...(input.domainProviderResources === undefined
          ? {}
          : { resourceGraph: input.domainProviderResources }),
      });

      await app.finalize();

      return {
        resources: destroyResourceSummary("destroyed", input),
      };
    } catch (error) {
      if (!isProviderAlreadyMissingError(error)) {
        throw error;
      }

      return {
        resources: destroyResourceSummary("already-missing", input),
      };
    }
  });
}

async function withExplicitCloudflareApiTokenEnv<T>(
  cloudflareApiToken: string | undefined,
  run: () => Promise<T>,
): Promise<T> {
  if (cloudflareApiToken === undefined) {
    return run();
  }

  const previousValues = new Map<string, string | undefined>();

  for (const name of CLOUDFLARE_CREDENTIAL_ENV_NAMES) {
    previousValues.set(name, process.env[name]);
    delete process.env[name];
  }

  process.env[CLOUDFLARE_API_TOKEN_ENV_NAME] = cloudflareApiToken;

  try {
    return await run();
  } finally {
    for (const [name, value] of previousValues) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
}

async function removeStoredAlchemyCloudflareApiTokens(stateRoot: string): Promise<void> {
  const alchemyStateRoot = path.join(stateRoot, ".alchemy");
  const files = await listAlchemyStateJsonFiles(alchemyStateRoot);

  await Promise.all(
    files.map(async (file) => {
      const raw = await readFile(file, "utf8");
      const parsed = JSON.parse(raw) as unknown;

      if (!removeApiTokenKeys(parsed)) {
        return;
      }

      await writeFile(file, `${JSON.stringify(parsed, null, 2)}\n`);
    }),
  );
}

async function listAlchemyStateJsonFiles(root: string): Promise<string[]> {
  let entries: Array<Dirent<string>>;

  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }

  const nestedFiles = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(root, entry.name);

      if (entry.isDirectory()) {
        return listAlchemyStateJsonFiles(entryPath);
      }

      if (entry.isFile() && entry.name.endsWith(".json")) {
        return [entryPath];
      }

      return [];
    }),
  );

  return nestedFiles.flat();
}

function removeApiTokenKeys(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.reduce((changed, item) => removeApiTokenKeys(item) || changed, false);
  }

  if (value === null || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  let changed = false;

  if (Object.prototype.hasOwnProperty.call(record, "apiToken")) {
    delete record.apiToken;
    changed = true;
  }

  for (const item of Object.values(record)) {
    changed = removeApiTokenKeys(item) || changed;
  }

  return changed;
}

export const alchemyFormlessInstanceDeploymentAdapter: FormlessInstanceDeploymentAdapter = {
  deploy: deployFormlessInstanceWithAlchemy,
  destroy: destroyFormlessInstanceWithAlchemy,
};

export const fetchFormlessInstanceDeploymentHealthCheckAdapter: FormlessInstanceDeploymentHealthCheckAdapter =
  {
    check: (input) => checkFormlessInstanceDeployMetadata(input, { fetch }),
  };

export async function createFormlessInstanceOwnerSetupCapability(
  input: CreateFormlessInstanceOwnerSetupCapabilityInput,
  dependencies: CreateFormlessInstanceOwnerSetupCapabilityDependencies,
): Promise<CreateFormlessInstanceOwnerSetupCapabilityResult> {
  const setupOrigin = parseOwnerSetupOrigin("Formless owner setup origin", input.deploymentUrl);
  const adminToken = parseRequiredString("Formless owner setup admin token", input.adminToken);
  const setupToken = parseOwnerSetupToken(input.setupToken);
  const endpointUrl = new URL(
    FORMLESS_OWNER_SETUP_CAPABILITY_API_PATH,
    `${setupOrigin}/`,
  ).toString();
  const response = await fetchOwnerSetupCapability(
    dependencies,
    endpointUrl,
    adminToken,
    setupToken,
  );
  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Formless owner setup capability creation failed for ${setupOrigin}: HTTP ${response.status} ${text}`,
    );
  }

  return parseOwnerSetupCapabilityResponse(text, endpointUrl);
}

export const fetchFormlessInstanceOwnerSetupCapabilityAdapter: FormlessInstanceOwnerSetupCapabilityAdapter =
  {
    create: (input) => createFormlessInstanceOwnerSetupCapability(input, { fetch }),
  };

export function formatFormlessOwnerSetupUrl(input: {
  deploymentUrl: string;
  setupToken: string;
}): string {
  const setupOrigin = parseOwnerSetupOrigin("Formless owner setup URL origin", input.deploymentUrl);
  const setupToken = parseOwnerSetupToken(input.setupToken);
  const url = new URL(FORMLESS_OWNER_SETUP_ROUTE_PATH, `${setupOrigin}/`);

  url.searchParams.set("token", setupToken);

  return url.toString();
}

async function fetchOwnerSetupCapability(
  dependencies: CreateFormlessInstanceOwnerSetupCapabilityDependencies,
  endpointUrl: string,
  adminToken: string,
  setupToken: string,
): Promise<Response> {
  try {
    return await dependencies.fetch(endpointUrl, {
      body: JSON.stringify({ setupToken }),
      headers: {
        accept: "application/json",
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      method: "POST",
    });
  } catch (error) {
    throw new Error(
      `Formless owner setup capability creation failed for ${endpointUrl}: ${errorMessage(error)}`,
    );
  }
}

function formlessInstanceAlchemyAssets(): AlchemyFormlessInstanceDeploymentWorkerProps["assets"] {
  return {
    directory: "dist/client",
    not_found_handling: "single-page-application",
    run_worker_first: ["/*", "!/assets/*", "!/src/*", "!/@vite/*", "!/@react-refresh"],
  };
}

function workerRuntimeExtensionBundlerEnv(input: {
  workspaceRoot?: string;
  workspaceProgramRuntime?: string;
  workspaceRuntimeExtensions?: string;
}): NodeJS.ProcessEnv {
  return {
    ...(input.workspaceRoot === undefined
      ? {}
      : { [FORMLESS_SITE_PROJECT_ROOT_ENV_NAME]: input.workspaceRoot }),
    ...(input.workspaceRuntimeExtensions === undefined
      ? {}
      : { [FORMLESS_WORKSPACE_RUNTIME_EXTENSIONS_ENV_NAME]: input.workspaceRuntimeExtensions }),
    ...(input.workspaceProgramRuntime === undefined
      ? {}
      : { [FORMLESS_WORKSPACE_PROGRAM_RUNTIME_ENV_NAME]: input.workspaceProgramRuntime }),
  };
}

function cloudflareAlchemyResourceOptions(input: {
  accountId: string;
  apiToken?: unknown;
  credentialProfile: string | null;
}): AlchemyCloudflareApiOptions & { accountId: string } {
  return {
    accountId: input.accountId,
    ...(input.apiToken === undefined
      ? input.credentialProfile === null
        ? {}
        : { profile: input.credentialProfile }
      : { apiToken: input.apiToken }),
  };
}

function turnstileCloudflareResourceOptions(input: {
  accountId: string;
  apiToken?: unknown;
  profile?: string;
}): Pick<TurnstileWidgetProps, "accountId" | "apiToken" | "profile"> {
  return {
    accountId: input.accountId,
    ...(input.apiToken === undefined
      ? input.profile === undefined
        ? {}
        : { profile: input.profile }
      : { apiToken: input.apiToken as NonNullable<TurnstileWidgetProps["apiToken"]> }),
  };
}

function turnstileWidgetName(plan: FormlessInstanceDeploymentPlan): string {
  return `Formless ${plan.instanceName} public actions`;
}

function turnstileWidgetDomains(input: {
  deploymentResourceGraph?: DeployResourceGraph;
  plan: FormlessInstanceDeploymentPlan;
}): string[] {
  const domains = new Set<string>([normalizeCloudflareHost(input.plan.expectedUrl.host)]);

  for (const resource of input.deploymentResourceGraph?.resources ?? []) {
    if (
      resource.kind !== "cloudflare-worker-custom-domain" ||
      resource.inputs.profile !== "publicSite"
    ) {
      continue;
    }

    const host = deployResourceInputString(resource.inputs.host);

    if (host !== undefined) {
      domains.add(normalizeCloudflareHost(host));
    }
  }

  return [...domains].filter(Boolean).sort((left, right) => left.localeCompare(right));
}

async function workerEmailBindingsFromDeployResourceGraph(input: {
  dependencies: AlchemyFormlessInstanceDeploymentDependencies;
  resourceGraph?: DeployResourceGraph;
}): Promise<Record<string, unknown>> {
  const resources =
    input.resourceGraph?.resources.filter(
      (resource) => resource.kind === "cloudflare-worker-send-email-binding",
    ) ?? [];

  if (resources.length === 0) {
    return {};
  }

  const createEmailSenderBinding = input.dependencies.createEmailSenderBinding;

  if (createEmailSenderBinding === undefined) {
    throw new Error(
      "Formless instance deploy requires a Cloudflare Email Sending binding factory for email resources.",
    );
  }

  const bindings: Record<string, unknown> = {};

  for (const resource of resources) {
    const props = workerEmailBindingPropsFromDeployResource(resource);

    if (Object.prototype.hasOwnProperty.call(bindings, props.bindingName)) {
      throw new Error(`Duplicate Worker email binding "${props.bindingName}" in deployment graph.`);
    }

    bindings[props.bindingName] = await createEmailSenderBinding(resource.logicalId, props);
  }

  return bindings;
}

async function createEmailDeliveryQueues(input: {
  cloudflareResourceOptions: AlchemyCloudflareApiOptions & { accountId: string };
  dependencies: AlchemyFormlessInstanceDeploymentDependencies;
  plan: FormlessInstanceDeploymentPlan;
}): Promise<{
  deadLetterQueue: CloudflareQueue;
  emailDeliveryQueue: CloudflareQueue;
}> {
  const createQueue = input.dependencies.createQueue;

  if (createQueue === undefined) {
    throw new Error("Formless instance deploy requires a Cloudflare Queue factory.");
  }

  const deadLetterQueue = await createQueue("email-delivery-dlq", {
    adopt: input.plan.adoptExistingDeployment,
    ...input.cloudflareResourceOptions,
    name: input.plan.resources.emailDeliveryQueue.deadLetterQueueName,
  });
  const emailDeliveryQueue = await createQueue("email-delivery", {
    adopt: input.plan.adoptExistingDeployment,
    ...input.cloudflareResourceOptions,
    name: input.plan.resources.emailDeliveryQueue.name,
  });

  return {
    deadLetterQueue,
    emailDeliveryQueue,
  };
}

function workerEmailBindingPropsFromDeployResource(
  resource: DeployResourceGraph["resources"][number],
): CloudflareWorkerSendEmailBindingProps {
  return {
    allowedSenderAddresses: deployResourceInputStringArray(resource, "allowedSenderAddresses"),
    bindingName: deployResourceRequiredString(resource, "bindingName"),
    domain: deployResourceRequiredString(resource, "domain"),
    ...(deployResourceInputString(resource.inputs.workerName) === undefined
      ? {}
      : { workerName: deployResourceInputString(resource.inputs.workerName) }),
  };
}

function deployResourceInputString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function deployResourceRequiredString(
  resource: DeployResourceGraph["resources"][number],
  key: string,
): string {
  const value = deployResourceInputString(resource.inputs[key]);

  if (value === undefined) {
    throw new Error(`Deployment resource "${resource.logicalId}" ${key} input must be a string.`);
  }

  return value;
}

function deployResourceInputStringArray(
  resource: DeployResourceGraph["resources"][number],
  key: string,
): string[] {
  const value = resource.inputs[key];

  if (!Array.isArray(value)) {
    throw new Error(`Deployment resource "${resource.logicalId}" ${key} input must be an array.`);
  }

  return value.map((entry, index) => {
    if (typeof entry === "string" && entry.trim()) {
      return entry.trim();
    }

    throw new Error(
      `Deployment resource "${resource.logicalId}" ${key}[${index}] input must be a string.`,
    );
  });
}

function deploymentResourceFactories(
  dependencies: AlchemyFormlessInstanceDeploymentDependencies,
  cloudflareOptions: AlchemyCloudflareApiOptions,
): AlchemyDomainProviderFactories {
  const createCustomDomain = dependencies.createCustomDomain;
  const createDnsRecords = dependencies.createDnsRecords;
  const createEmailSenderBinding = dependencies.createEmailSenderBinding;
  const createEmailSendingDomain = dependencies.createEmailSendingDomain;

  return {
    CustomDomain:
      createCustomDomain === undefined
        ? missingAlchemyResourceFactory<AlchemyDomainProviderFactories["CustomDomain"]>(
            "Alchemy custom-domain",
          )
        : (id, props) =>
            createCustomDomain(id, {
              ...props,
              ...cloudflareOptions,
            } as Parameters<AlchemyDomainProviderFactories["CustomDomain"]>[1]),
    DnsRecords:
      createDnsRecords === undefined
        ? missingAlchemyResourceFactory<AlchemyDomainProviderFactories["DnsRecords"]>(
            "Alchemy DNS records",
          )
        : (id, props) =>
            createDnsRecords(id, {
              ...props,
              ...cloudflareOptions,
            } as Parameters<AlchemyDomainProviderFactories["DnsRecords"]>[1]),
    ...(createEmailSenderBinding === undefined
      ? {}
      : {
          SendEmailBinding: (id, props) =>
            createEmailSenderBinding(id, {
              ...props,
              ...cloudflareOptions,
            } as CloudflareWorkerSendEmailBindingProps),
        }),
    ...(createEmailSendingDomain === undefined
      ? {}
      : {
          EmailSendingDomain: (id, props) =>
            createEmailSendingDomain(id, {
              ...props,
              ...cloudflareOptions,
            } as CloudflareEmailSendingDomainProps),
        }),
  };
}

function missingAlchemyResourceFactory<T extends (id: string, props: never) => Promise<unknown>>(
  label: string,
): T {
  return (async (id: string) => {
    throw new Error(`Deployment resource "${id}" requires ${label} factory.`);
  }) as unknown as T;
}

async function createCloudflareEmailSendingDomainResource(
  id: string,
  props: CloudflareEmailSendingDomainProps,
  createCloudflareApi: (
    options: AlchemyCloudflareApiOptions,
  ) => Promise<AlchemyCloudflareApiClient>,
): Promise<CloudflareEmailSendingDomain> {
  const domain = normalizeCloudflareHost(props.name || props.domain);
  const zoneId = parseRequiredString(
    `Cloudflare Email Sending zone id for ${domain}`,
    props.zoneId,
  );
  const api = await createCloudflareApi(props);

  try {
    return await ensureCloudflareEmailSendingDomain({
      api,
      domain,
      id,
      zoneId,
    });
  } catch (error) {
    throw cloudflareEmailDeployError(error, domain);
  }
}

async function ensureCloudflareEmailSendingDomain(input: {
  api: AlchemyCloudflareApiClient;
  domain: string;
  id: string;
  zoneId: string;
}): Promise<CloudflareEmailSendingDomain> {
  const existing = await readCloudflareResult<CloudflareEmailSendingSubdomainApiResult[]>(
    `list Cloudflare Email Sending domains for ${input.domain}`,
    input.api.get(`/zones/${input.zoneId}/email/sending/subdomains`, {
      headers: { accept: "application/json" },
    }),
  );
  const matched = existing.find((entry) => {
    if (!isRecord(entry)) {
      return false;
    }

    const name = parseOptionalString("Cloudflare Email Sending domain name", entry.name);

    return name !== undefined && normalizeCloudflareHost(name) === input.domain;
  });

  if (matched !== undefined) {
    return cloudflareEmailSendingDomainFromApiResult(matched, input.domain, input.zoneId);
  }

  const created = await readCloudflareResult<CloudflareEmailSendingSubdomainApiResult>(
    `create Cloudflare Email Sending domain ${input.domain}`,
    input.api.post(
      `/zones/${input.zoneId}/email/sending/subdomains`,
      { name: input.domain },
      { headers: { accept: "application/json" } },
    ),
  );

  return cloudflareEmailSendingDomainFromApiResult(created, input.domain, input.zoneId);
}

function cloudflareEmailSendingDomainFromApiResult(
  value: CloudflareEmailSendingSubdomainApiResult,
  fallbackName: string,
  zoneId: string,
): CloudflareEmailSendingDomain {
  if (!isRecord(value)) {
    throw new Error("Cloudflare Email Sending domain response must be an object.");
  }

  const name = normalizeCloudflareHost(
    parseOptionalString("Cloudflare Email Sending domain name", value.name) ?? fallbackName,
  );
  const tag = parseOptionalString("Cloudflare Email Sending domain tag", value.tag);
  const dkimSelector = parseOptionalString(
    "Cloudflare Email Sending DKIM selector",
    value.dkim_selector,
  );
  const returnPathDomain = parseOptionalString(
    "Cloudflare Email Sending return-path domain",
    value.return_path_domain,
  );

  return {
    ...(typeof value.enabled === "boolean" ? { enabled: value.enabled } : {}),
    ...(dkimSelector === undefined ? {} : { dkimSelector }),
    ...(tag === undefined ? {} : { id: tag, tag }),
    name,
    ...(returnPathDomain === undefined ? {} : { returnPathDomain }),
    zoneId,
  };
}

function cloudflareEmailDeployError(error: unknown, domain: string): Error {
  const message = error instanceof Error ? error.message : String(error);

  if (!isCloudflareAuthenticationFailure(error)) {
    return error instanceof Error ? error : new Error(message);
  }

  return new Error(
    [
      message,
      `Cloudflare rejected Email Sending deployment for ${domain}.`,
      "Reconnect Cloudflare or provide a token with Email Sending and DNS permissions.",
    ].join(" "),
  );
}

function deploymentResourceZoneResolver(
  dependencies: AlchemyFormlessInstanceDeploymentDependencies,
  cloudflareOptions: AlchemyCloudflareApiOptions,
): AlchemyDeployResourceZoneResolver | undefined {
  const createCloudflareApi = dependencies.createCloudflareApi;

  if (createCloudflareApi === undefined) {
    return undefined;
  }

  const cache = new Map<string, Promise<string | undefined>>();

  return ({ host }) => {
    const normalizedHost = normalizeCloudflareHost(host);
    const cached = cache.get(normalizedHost);

    if (cached !== undefined) {
      return cached;
    }

    const resolved = resolveCloudflareZoneIdForHost({
      cloudflareOptions,
      createCloudflareApi,
      host: normalizedHost,
    });

    cache.set(normalizedHost, resolved);

    return resolved;
  };
}

async function resolveCloudflareZoneIdForHost(input: {
  cloudflareOptions: AlchemyCloudflareApiOptions;
  createCloudflareApi: (
    options: AlchemyCloudflareApiOptions,
  ) => Promise<AlchemyCloudflareApiClient>;
  host: string;
}): Promise<string | undefined> {
  const api = await input.createCloudflareApi(input.cloudflareOptions);
  const accountFilter =
    input.cloudflareOptions.accountId === undefined
      ? ""
      : `&account.id=${encodeURIComponent(input.cloudflareOptions.accountId)}`;

  for (const candidate of cloudflareZoneNameCandidates(input.host)) {
    const response = await api.get(
      `/zones?name=${encodeURIComponent(candidate)}&status=active${accountFilter}`,
    );

    if (!response.ok) {
      throw new Error(`Cloudflare zone lookup for ${input.host} failed: HTTP ${response.status}.`);
    }

    const body = (await response.json()) as unknown;
    const zoneId = activeZoneIdFromCloudflareList(body, candidate);

    if (zoneId !== undefined) {
      return zoneId;
    }
  }

  return undefined;
}

function activeZoneIdFromCloudflareList(value: unknown, zoneName: string): string | undefined {
  if (!isRecord(value) || !Array.isArray(value.result)) {
    return undefined;
  }

  for (const entry of value.result) {
    if (!isRecord(entry)) {
      continue;
    }

    const id = parseOptionalString("Cloudflare zone id", entry.id);
    const name = parseOptionalString("Cloudflare zone name", entry.name);
    const status = parseOptionalString("Cloudflare zone status", entry.status);

    if (id !== undefined && name === zoneName && (status === undefined || status === "active")) {
      return id;
    }
  }

  return undefined;
}

function cloudflareZoneNameCandidates(host: string): string[] {
  const parts = normalizeCloudflareHost(host).split(".").filter(Boolean);
  const candidates: string[] = [];

  for (let index = 0; index < parts.length - 1; index += 1) {
    candidates.push(parts.slice(index).join("."));
  }

  return candidates;
}

function normalizeCloudflareHost(value: string): string {
  return value.trim().toLowerCase().replace(/^\*\./, "").replace(/\.+$/, "");
}

function destroyResourceSummary(
  status: DestroyFormlessInstanceResourceStatus,
  input: Pick<DestroyFormlessInstanceInput, "domainProviderPlan" | "domainProviderResources">,
): DestroyFormlessInstanceResourceSummary {
  const domainProviderResources =
    input.domainProviderResources?.resources ?? input.domainProviderPlan.resources;

  return {
    alchemyState: status,
    customDomains: domainProviderResources.filter(
      (resource) => resource.kind === "cloudflare-worker-custom-domain",
    ).length,
    dnsRecords: domainProviderResources.filter(
      (resource) => resource.kind === "cloudflare-dns-records",
    ).length,
    durableObjectNamespace: status,
    mediaBucket: status,
    turnstileWidget: status,
    worker: status,
    workerAssets: status,
    workerSecrets: status,
  };
}

function isProviderAlreadyMissingError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();

  return (
    /\b404\b/.test(message) ||
    message.includes("not found") ||
    message.includes("does not exist") ||
    message.includes("could not find")
  );
}

async function nodeAlchemyFormlessInstanceDependencies(): Promise<AlchemyFormlessInstanceDeploymentDependencies> {
  const [{ default: alchemy }, cloudflare] = await Promise.all([
    import("alchemy"),
    import("alchemy/cloudflare"),
  ]);

  return {
    createApp: (name, options) => alchemy(name, options),
    createCloudflareApi: (options) => cloudflare.createCloudflareApi(options as never),
    createCustomDomain: (id, props) => cloudflare.CustomDomain(id, props),
    createDurableObjectNamespace: (id, props) => cloudflare.DurableObjectNamespace(id, props),
    createDnsRecords: (id, props) => cloudflare.DnsRecords(id, props),
    createEmailSenderBinding: async (_id, props) => ({
      ...cloudflare.EmailSender({
        ...(props.allowedSenderAddresses === undefined
          ? {}
          : { allowedSenderAddresses: props.allowedSenderAddresses }),
        ...(props.allowedDestinationAddresses === undefined
          ? {}
          : { allowedDestinationAddresses: props.allowedDestinationAddresses }),
        ...(props.destinationAddress === undefined
          ? {}
          : { destinationAddress: props.destinationAddress }),
        ...(props.dev === undefined ? {} : { dev: props.dev }),
      } as Parameters<typeof cloudflare.EmailSender>[0]),
      bindingName: props.bindingName,
    }),
    createEmailSendingDomain: (id, props) =>
      createCloudflareEmailSendingDomainResource(id, props, (options) =>
        cloudflare.createCloudflareApi(options as never),
      ),
    createQueue: (id, props) => cloudflare.Queue(id, props as never),
    createR2Bucket: (id, props) => cloudflare.R2Bucket(id, props as never),
    createSecret: (value) => alchemy.secret(value),
    createTurnstileWidget: (id, props) => CloudflareTurnstileWidget(id, props),
    deployViteWorker: (id, props) => cloudflare.Vite(id, props as never),
  };
}

async function nodeAlchemyFormlessInstanceAccountDiscoveryDependencies(): Promise<AlchemyFormlessInstanceAccountDiscoveryDependencies> {
  const cloudflare = await import("alchemy/cloudflare");

  return {
    createCloudflareApi: (options) => cloudflare.createCloudflareApi(options as never),
  };
}

export function selectOnlyFormlessInstanceAccount(
  input: SelectFormlessInstanceAccountInput,
): FormlessInstanceDeploymentAccount {
  if (input.accounts.length === 0) {
    throw new Error(
      [
        "No Cloudflare accounts were found for the selected credentials.",
        "Formless uses Alchemy's resolved Cloudflare credentials first.",
        "Check --credential-profile or ALCHEMY_PROFILE, and unset CLOUDFLARE_API_TOKEN or CLOUDFLARE_API_KEY if either points at the wrong account.",
      ].join(" "),
    );
  }

  if (input.accounts.length > 1) {
    throw new Error(
      "Multiple Cloudflare accounts were found; account selection is required before deployment.",
    );
  }

  return input.accounts[0] as FormlessInstanceDeploymentAccount;
}

export function createFormlessInstanceState(
  input: CreateFormlessInstanceStateInput,
): FormlessInstanceState {
  const credentialProfile = parseOptionalString(
    `${FORMLESS_INSTANCE_STATE_FILE} credentialProfile`,
    input.credentialProfile ?? undefined,
  );
  const state = {
    version: FORMLESS_INSTANCE_STATE_VERSION,
    kind: FORMLESS_INSTANCE_STATE_KIND,
    instanceName: input.plan.instanceName,
    accountId: input.plan.account.id,
    ...(input.plan.account.name === undefined ? {} : { accountName: input.plan.account.name }),
    ...(credentialProfile === undefined ? {} : { credentialProfile }),
    workerName: input.plan.resources.worker.name,
    workersDevUrl: input.plan.expectedUrl.url,
    mediaBucketName: input.plan.resources.mediaBucket.name,
    authorityNamespaceName: input.plan.resources.authority.namespaceName,
    deploymentTarget: input.plan.deploymentTarget,
    deployedPackageVersion: input.plan.packageVersion,
  };

  return parseFormlessInstanceState(state);
}

export async function writeFormlessInstanceState(
  input: WriteFormlessInstanceStateInput,
  dependencies: WriteFormlessInstanceStateDependencies = nodeFormlessInstanceStateWriteDependencies(),
): Promise<WriteFormlessInstanceStateResult> {
  const root = parseRequiredString("Formless instance state root", input.root);
  const state = parseFormlessInstanceState(input.state);
  const contents = formatFormlessInstanceState(state);

  await dependencies.prepareStateDirectory(root);

  const statePath = dependencies.statePath(root, FORMLESS_INSTANCE_STATE_FILE);

  await dependencies.writeFile(statePath, contents);

  return {
    path: statePath,
    state,
  };
}

export async function ensureFormlessInstanceLocalSecretEnv(
  input: EnsureFormlessInstanceLocalSecretEnvInput,
  dependencies: EnsureFormlessInstanceLocalSecretEnvDependencies = nodeFormlessInstanceLocalSecretEnvDependencies(),
): Promise<EnsureFormlessInstanceLocalSecretEnvResult> {
  const root = parseRequiredString("Formless instance local secret root", input.root);

  await dependencies.prepareStateDirectory(root);

  const envPath = dependencies.statePath(root, FORMLESS_INSTANCE_LOCAL_ENV_FILE);
  const contents = await readTextFileIfExists(envPath, dependencies);
  const values = parseDotEnv(contents ?? "");
  const existingPassword = nonEmptyEnvValue(values[ALCHEMY_PASSWORD_ENV_NAME]);

  if (existingPassword) {
    return {
      created: false,
      path: envPath,
      secrets: {
        ALCHEMY_PASSWORD: existingPassword,
      },
    };
  }

  const generatedPassword = parseRequiredString(
    "Generated Alchemy encryption password",
    input.createSecret(),
  );

  await dependencies.writeFile(
    envPath,
    appendDotEnvValue(contents ?? "", ALCHEMY_PASSWORD_ENV_NAME, generatedPassword),
  );

  return {
    created: true,
    path: envPath,
    secrets: {
      ALCHEMY_PASSWORD: generatedPassword,
    },
  };
}

export function parseFormlessInstanceStateJson(contents: string): FormlessInstanceState {
  try {
    return parseFormlessInstanceState(JSON.parse(contents) as unknown);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`${FORMLESS_INSTANCE_STATE_FILE} must be valid JSON.`);
    }

    throw error;
  }
}

export function parseFormlessInstanceState(value: unknown): FormlessInstanceState {
  if (!isRecord(value)) {
    throw new Error(`${FORMLESS_INSTANCE_STATE_FILE} must be an object.`);
  }

  assertNoForbiddenSecretKeys(value, FORMLESS_INSTANCE_STATE_FILE);
  assertOnlyKeys(value, stateKeys, FORMLESS_INSTANCE_STATE_FILE);

  if (value.version !== FORMLESS_INSTANCE_STATE_VERSION) {
    throw new Error(
      `${FORMLESS_INSTANCE_STATE_FILE} version must be ${FORMLESS_INSTANCE_STATE_VERSION}.`,
    );
  }

  if (value.kind !== FORMLESS_INSTANCE_STATE_KIND) {
    throw new Error(
      `${FORMLESS_INSTANCE_STATE_FILE} kind must be "${FORMLESS_INSTANCE_STATE_KIND}".`,
    );
  }

  const accountName = parseOptionalString(
    `${FORMLESS_INSTANCE_STATE_FILE} accountName`,
    value.accountName,
  );
  const credentialProfile = parseOptionalString(
    `${FORMLESS_INSTANCE_STATE_FILE} credentialProfile`,
    value.credentialProfile,
  );
  const deployedPackageVersion = parseOptionalString(
    `${FORMLESS_INSTANCE_STATE_FILE} deployedPackageVersion`,
    value.deployedPackageVersion,
  );

  return {
    version: FORMLESS_INSTANCE_STATE_VERSION,
    kind: FORMLESS_INSTANCE_STATE_KIND,
    instanceName: parseCanonicalSlug(
      `${FORMLESS_INSTANCE_STATE_FILE} instanceName`,
      value.instanceName,
      maxInstanceNameLength,
    ),
    accountId: parseRequiredString(`${FORMLESS_INSTANCE_STATE_FILE} accountId`, value.accountId),
    ...(accountName === undefined ? {} : { accountName }),
    ...(credentialProfile === undefined ? {} : { credentialProfile }),
    workerName: parseCanonicalSlug(
      `${FORMLESS_INSTANCE_STATE_FILE} workerName`,
      value.workerName,
      maxInstanceNameLength,
    ),
    workersDevUrl: parseWorkersDevUrl(
      `${FORMLESS_INSTANCE_STATE_FILE} workersDevUrl`,
      value.workersDevUrl,
    ),
    mediaBucketName: parseCanonicalSlug(
      `${FORMLESS_INSTANCE_STATE_FILE} mediaBucketName`,
      value.mediaBucketName,
      maxInstanceNameLength + "-media".length,
    ),
    authorityNamespaceName: parseCanonicalSlug(
      `${FORMLESS_INSTANCE_STATE_FILE} authorityNamespaceName`,
      value.authorityNamespaceName,
      maxInstanceNameLength + "-authority".length,
    ),
    deploymentTarget: parseDeploymentTarget(value.deploymentTarget),
    ...(deployedPackageVersion === undefined ? {} : { deployedPackageVersion }),
  };
}

export function formatFormlessInstanceState(state: FormlessInstanceState): string {
  const parsed = parseFormlessInstanceState(state);
  const formatted: Record<string, unknown> = {
    version: parsed.version,
    kind: parsed.kind,
    instanceName: parsed.instanceName,
    accountId: parsed.accountId,
    ...(parsed.accountName === undefined ? {} : { accountName: parsed.accountName }),
    ...(parsed.credentialProfile === undefined
      ? {}
      : { credentialProfile: parsed.credentialProfile }),
    workerName: parsed.workerName,
    workersDevUrl: parsed.workersDevUrl,
    mediaBucketName: parsed.mediaBucketName,
    authorityNamespaceName: parsed.authorityNamespaceName,
    deploymentTarget: parsed.deploymentTarget,
    ...(parsed.deployedPackageVersion === undefined
      ? {}
      : { deployedPackageVersion: parsed.deployedPackageVersion }),
  };

  return `${JSON.stringify(formatted, null, 2)}\n`;
}

export function normalizeFormlessInstanceName(value: string | null | undefined): string {
  const raw = parseRequiredString("Formless instance name", value);
  const normalized = normalizeResourceSlug(raw);

  if (!normalized) {
    throw new Error("Formless instance name must include at least one letter or number.");
  }

  if (normalized.length > maxInstanceNameLength) {
    throw new Error(
      `Formless instance name must produce a resource slug no longer than ${maxInstanceNameLength} characters.`,
    );
  }

  return normalized;
}

export function formlessInstanceStateRoot(root: string, instanceName: string): string {
  return path.join(
    parseRequiredString("Formless instance home", root),
    FORMLESS_INSTANCE_DIRECTORY,
    parseCanonicalSlug("Formless instance state name", instanceName, maxInstanceNameLength),
  );
}

function parseDeploymentAccount(
  account: FormlessInstanceDeploymentAccount,
): FormlessInstanceDeploymentAccount {
  const name = parseOptionalString("Cloudflare account name", account.name);

  return {
    id: parseRequiredString("Cloudflare account id", account.id),
    ...(name === undefined ? {} : { name }),
    workersDevSubdomain: normalizeWorkersDevSubdomain(account.workersDevSubdomain),
  };
}

function parseDeployFormlessInstanceResult(result: unknown): DeployFormlessInstanceResult {
  if (!isRecord(result)) {
    throw new Error("Formless deployment adapter result must be an object.");
  }

  const resourceEvidence = Array.isArray(result.resourceEvidence)
    ? (result.resourceEvidence as DeployEvidenceSummary[])
    : undefined;

  return {
    ...(resourceEvidence === undefined ? {} : { resourceEvidence }),
    url: parseWorkersDevUrl("Formless deployment adapter URL", result.url),
  };
}

function normalizeCredentialProfile(value: string | null | undefined): string | null {
  return parseOptionalString("Cloudflare credential profile", value ?? undefined) ?? null;
}

function nodeFormlessInstanceStateWriteDependencies(): WriteFormlessInstanceStateDependencies {
  return {
    prepareStateDirectory: prepareFormlessInstanceStateDirectory,
    statePath: formlessInstanceStatePath,
    writeFile,
  };
}

function nodeFormlessInstanceLocalSecretEnvDependencies(): EnsureFormlessInstanceLocalSecretEnvDependencies {
  return {
    prepareStateDirectory: prepareFormlessInstanceStateDirectory,
    readFile,
    statePath: formlessInstanceStatePath,
    writeFile,
  };
}

async function prepareFormlessInstanceStateDirectory(root: string) {
  await mkdir(root, { recursive: true });
}

function formlessInstanceStatePath(root: string, fileName: string): string {
  return path.join(root, fileName);
}

async function readTextFileIfExists(
  filePath: string,
  dependencies: Pick<EnsureFormlessInstanceLocalSecretEnvDependencies, "readFile">,
): Promise<string | null> {
  try {
    return await dependencies.readFile(filePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function nonEmptyEnvValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

type CloudflareAccountApiResult = {
  id?: unknown;
  name?: unknown;
};

type CloudflareEmailSendingSubdomainApiResult = {
  dkim_selector?: unknown;
  enabled?: unknown;
  name?: unknown;
  return_path_domain?: unknown;
  tag?: unknown;
};

type CloudflareApiResponse<T> = {
  errors?: Array<{ message?: string }>;
  result?: T;
  success?: boolean;
};

async function readCloudflareResult<T>(
  context: string,
  responsePromise: Promise<Response>,
): Promise<T> {
  const response = await responsePromise;
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${context} failed: HTTP ${response.status} ${text}`);
  }

  let parsed: CloudflareApiResponse<T>;

  try {
    parsed = JSON.parse(text) as CloudflareApiResponse<T>;
  } catch {
    throw new Error(`${context} failed: response was not JSON.`);
  }

  if (parsed.success === false) {
    const message = parsed.errors
      ?.map((error) => error.message)
      .filter(Boolean)
      .join("; ");

    throw new Error(`${context} failed${message ? `: ${message}` : "."}`);
  }

  if (parsed.result === undefined) {
    throw new Error(`${context} failed: response did not include a result.`);
  }

  return parsed.result;
}

function parseFormlessDeployMetadata(text: string, url: string): FormlessDeployMetadata {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error(
      `Formless instance health check failed for ${url}: deploy metadata was not JSON.`,
    );
  }

  if (!isRecord(parsed)) {
    throw new Error(
      `Formless instance health check failed for ${url}: deploy metadata must be an object.`,
    );
  }

  if (parsed.version !== null && typeof parsed.version !== "string") {
    throw new Error(
      `Formless instance health check failed for ${url}: deploy metadata version must be a string or null.`,
    );
  }

  if (parsed.packageVersion !== null && typeof parsed.packageVersion !== "string") {
    throw new Error(
      `Formless instance health check failed for ${url}: deploy metadata packageVersion must be a string or null.`,
    );
  }

  if (
    !Number.isInteger(parsed.runtimeProtocolVersion) ||
    typeof parsed.runtimeProtocolVersion !== "number" ||
    parsed.runtimeProtocolVersion <= 0
  ) {
    throw new Error(
      `Formless instance health check failed for ${url}: deploy metadata runtimeProtocolVersion must be a positive integer.`,
    );
  }

  if (typeof parsed.storageMigrationSet !== "string" || parsed.storageMigrationSet.trim() === "") {
    throw new Error(
      `Formless instance health check failed for ${url}: deploy metadata storageMigrationSet must be a string.`,
    );
  }

  if (!isRecord(parsed.schemaProvenance) || parsed.schemaProvenance.kind !== "program") {
    throw new Error(
      `Formless instance health check failed for ${url}: deploy metadata schemaProvenance must identify Program.`,
    );
  }

  return {
    ...(parsed.bundleDigest === undefined
      ? {}
      : {
          bundleDigest: parseFormlessBundleDigest(
            `Formless instance health check failed for ${url}: deploy metadata bundleDigest`,
            parsed.bundleDigest,
          ),
        }),
    packageVersion: parsed.packageVersion as string | null,
    runtimeProtocolVersion: parsed.runtimeProtocolVersion as number,
    schemaProvenance: {
      kind: "program",
      sourceSchemaHash: parseSourceSchemaHash(
        parsed.schemaProvenance.sourceSchemaHash,
        `Formless instance health check failed for ${url}: deploy metadata schemaProvenance sourceSchemaHash`,
      ),
    },
    storageMigrationSet: parsed.storageMigrationSet,
    version: parsed.version as string | null,
  };
}

function parseOwnerSetupCapabilityResponse(
  text: string,
  endpointUrl: string,
): CreateFormlessInstanceOwnerSetupCapabilityResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error(
      `Formless owner setup capability creation failed for ${endpointUrl}: response was not JSON.`,
    );
  }

  if (!isRecord(parsed)) {
    throw new Error(
      `Formless owner setup capability creation failed for ${endpointUrl}: response must be an object.`,
    );
  }

  if (parsed.capabilityCreated !== true || parsed.setupComplete !== false) {
    throw new Error(
      `Formless owner setup capability creation failed for ${endpointUrl}: response did not confirm setup capability creation.`,
    );
  }

  const expiresAt = parseOptionalString(
    "Formless owner setup capability response expiresAt",
    parsed.expiresAt,
  );

  return {
    capabilityCreated: true,
    endpointUrl,
    ...(expiresAt === undefined ? {} : { expiresAt }),
    setupComplete: false,
  };
}

function cacheControlIncludesNoStore(cacheControl: string): boolean {
  return cacheControl
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .includes("no-store");
}

function normalizeWorkersDevSubdomain(value: unknown): string {
  const raw = parseRequiredString("Cloudflare workers.dev subdomain", value).toLowerCase();
  const subdomain = raw.endsWith(`.${workersDevDomain}`)
    ? raw.slice(0, -`.${workersDevDomain}`.length)
    : raw;

  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(subdomain)) {
    throw new Error("Cloudflare workers.dev subdomain must be one DNS label under workers.dev.");
  }

  return subdomain;
}

function parseCanonicalSlug(context: string, value: unknown, maxLength: number): string {
  const raw = parseRequiredString(context, value);
  const normalized = normalizeResourceSlug(raw);

  if (raw !== normalized) {
    throw new Error(`${context} must be a normalized resource slug.`);
  }

  if (raw.length > maxLength) {
    throw new Error(`${context} must be no longer than ${maxLength} characters.`);
  }

  return raw;
}

function parseWorkersDevUrl(context: string, value: unknown): string {
  const raw = parseRequiredString(context, value);

  try {
    const url = new URL(raw);

    if (
      url.protocol !== "https:" ||
      !url.hostname.endsWith(`.${workersDevDomain}`) ||
      url.pathname !== "/"
    ) {
      throw new Error();
    }

    return url.origin;
  } catch {
    throw new Error(`${context} must be a workers.dev origin URL.`);
  }
}

function parseOwnerSetupOrigin(context: string, value: unknown): string {
  const raw = parseRequiredString(context, value);

  try {
    const url = new URL(raw);

    if (
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search !== "" ||
      url.hash !== "" ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalhost(url.hostname))) ||
      url.hostname.trim() === ""
    ) {
      throw new Error();
    }

    return url.origin;
  } catch {
    throw new Error(`${context} must be an absolute URL origin.`);
  }
}

function isLocalhost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseDeploymentTarget(value: unknown): "workers.dev" {
  if (value !== "workers.dev") {
    throw new Error(`${FORMLESS_INSTANCE_STATE_FILE} deploymentTarget must be "workers.dev".`);
  }

  return "workers.dev";
}

function parseRequiredString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value.trim();
}

function normalizeResourceSlug(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("'", "")
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .replaceAll(/-+/g, "-");
}

function parseOptionalString(context: string, value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return parseRequiredString(context, value);
}

function assertOnlyKeys(value: Record<string, unknown>, allowedKeys: Set<string>, context: string) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${context} has unsupported key "${key}".`);
    }
  }
}

function assertNoForbiddenSecretKeys(value: unknown, context: string) {
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertNoForbiddenSecretKeys(child, `${context}[${index}]`));
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (forbiddenSecretKeys.has(normalizeSecretKey(key))) {
      throw new Error(
        `${FORMLESS_INSTANCE_STATE_FILE} must not store secret field "${context}.${key}".`,
      );
    }

    assertNoForbiddenSecretKeys(child, `${context}.${key}`);
  }
}

function normalizeSecretKey(key: string): string {
  return key.toLowerCase().replaceAll(/[-_]/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
