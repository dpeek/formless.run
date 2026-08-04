import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { homedir } from "node:os";
import path from "node:path";

import type { StoredRecord } from "@dpeek/formless-storage";
import {
  readInstanceWorkspaceProgramStorageSnapshot,
  writeInstanceWorkspaceProgramStorageSnapshot,
} from "../program/workspace.ts";
import {
  FORMLESS_CLOUDFLARE_OAUTH_CLIENT_ID,
  FORMLESS_CLOUDFLARE_OAUTH_DEPLOY_SCOPES,
  FORMLESS_CLOUDFLARE_OAUTH_REDIRECT_URI,
  assertFormlessCloudflareDeployScopesGranted,
  createFormlessCloudflareOAuthCredential,
  createNodeFormlessCloudflareOAuthAdapter,
  formatFormlessCloudflareOAuthCredentialRef,
  normalizeFormlessCloudflareOAuthCredentialId,
  readFormlessCloudflareOAuthCredential,
  refreshStoredFormlessCloudflareOAuthCredential,
  writeFormlessCloudflareOAuthCredential,
  type FormlessCloudflareOAuthAccount,
  type FormlessCloudflareOAuthAdapter,
  type FormlessCloudflareOAuthCredential,
  type FormlessCloudflareOAuthTokenSet,
} from "./cloudflare-oauth.ts";
import {
  alchemyFormlessInstanceAccountDiscoveryAdapter,
  type FormlessInstanceAccountDiscoveryAdapter,
  type FormlessInstanceDeploymentAccount,
  normalizeFormlessInstanceName,
} from "./instance-onboarding.ts";
import { readWorkspaceConfig } from "./instance-workspace-foundation.ts";
import {
  stringRecordValue,
  withoutControlPlaneLifecycleValues,
  workspaceControlPlaneSnapshotFromRecords,
} from "./instance-workspace-control-plane.ts";
import {
  FORMLESS_ALCHEMY_DEFAULT_PROFILE,
  FORMLESS_ALCHEMY_PROFILE_REF_PREFIX,
} from "./instance-provider-credentials.ts";
import {
  formlessCliPrimaryTargetId,
  formlessCliWorkersDevTargetUrl,
  selectFormlessCliCredentialSetupDeploymentConfig,
} from "./instance-target-context.ts";

export {
  FORMLESS_ALCHEMY_DEFAULT_PROFILE,
  FORMLESS_ALCHEMY_PROFILE_REF_PREFIX,
} from "./instance-provider-credentials.ts";

export const FORMLESS_ALCHEMY_CLOUDFLARE_PROVIDER = "cloudflare";

export type AlchemyCloudflareCredentialSetupInput = {
  accountId?: string | null;
  deploymentConfigId?: string | null;
  env?: NodeJS.ProcessEnv;
  profileLabel?: string | null;
  provider?: "cloudflare";
  targetAlias?: string | null;
  workspaceRoot: string;
};

export type FormlessCloudflareCredentialAuthorizationWaitingResult = {
  at: string;
  authorizationUrl: string;
  clientId: string;
  continue: () => Promise<FormlessCloudflareCredentialSetupCompletedResult>;
  credentialRef: string;
  kind: "authorization-waiting";
  profileLabel: string;
  provider: "cloudflare";
  requestedScopes: readonly string[];
  scopeSet: "formless-cloudflare-deploy-oauth";
};

export type FormlessCloudflareCredentialAccountSelectionRequiredResult = {
  accounts: readonly FormlessCloudflareOAuthAccount[];
  credentialRef: string;
  kind: "account-selection-required";
  provider: "cloudflare";
};

export type FormlessCloudflareCredentialReadyResult = {
  account: FormlessCloudflareOAuthAccount;
  accountCount: number;
  credentialRef: string;
  deploymentConfig: {
    accountId: string;
    targetId: string;
    targetUrl: string;
    workerName: string;
  };
  kind: "ready";
  provider: "cloudflare";
  source: "oauth" | "stored-credential";
};

export type FormlessCloudflareCredentialSetupCompletedResult =
  | FormlessCloudflareCredentialAccountSelectionRequiredResult
  | FormlessCloudflareCredentialReadyResult;

export type FormlessCloudflareCredentialSetupResult =
  | FormlessCloudflareCredentialAuthorizationWaitingResult
  | FormlessCloudflareCredentialSetupCompletedResult;

export type AlchemyCloudflareCredentialAuthorizationWaitingResult = {
  at: string;
  authorizationUrl: string;
  continue: () => Promise<AlchemyCloudflareCredentialSetupCompletedResult>;
  kind: "authorization-waiting";
  profile: string;
  profileRef: string;
  provider: "cloudflare";
  scopeSet: "alchemy-default-oauth";
};

export type AlchemyCloudflareCredentialAccountSelectionRequiredResult = {
  accounts: readonly FormlessInstanceDeploymentAccount[];
  kind: "account-selection-required";
  profile: string;
  profileRef: string;
  provider: "cloudflare";
};

export type AlchemyCloudflareCredentialReadyResult = {
  account: FormlessInstanceDeploymentAccount;
  accountCount: number;
  kind: "ready";
  profile: string;
  profileRef: string;
  provider: "cloudflare";
  source: "existing-profile" | "oauth-profile";
};

export type AlchemyCloudflareCredentialSetupCompletedResult =
  | AlchemyCloudflareCredentialAccountSelectionRequiredResult
  | AlchemyCloudflareCredentialReadyResult;

export type AlchemyCloudflareCredentialSetupResult =
  | AlchemyCloudflareCredentialAuthorizationWaitingResult
  | AlchemyCloudflareCredentialSetupCompletedResult;

export type AlchemyCloudflareOAuthCredentials = {
  access: string;
  expires: number;
  refresh: string;
  scopes: string[];
  type: "oauth";
};

export type AlchemyCloudflareAuthorization = {
  state: string;
  url: string;
  verifier: string;
};

export type AlchemyCloudflareOAuthAdapter = {
  authorize: (scopes: readonly string[]) => AlchemyCloudflareAuthorization;
  waitForCredentials: (
    authorization: AlchemyCloudflareAuthorization,
  ) => Promise<AlchemyCloudflareOAuthCredentials>;
};

export type AlchemyCloudflareProfileStore = {
  listAccountsWithCredentials: (
    credentials: AlchemyCloudflareOAuthCredentials,
  ) => Promise<FormlessInstanceDeploymentAccount[]>;
  readCredentials: (profile: string) => Promise<AlchemyCloudflareOAuthCredentials | undefined>;
  writeCredentials: (
    profile: string,
    credentials: AlchemyCloudflareOAuthCredentials,
  ) => Promise<void>;
  writeProvider: (input: {
    account: FormlessInstanceDeploymentAccount;
    profile: string;
    scopes: readonly string[];
  }) => Promise<void>;
};

export type AlchemyCloudflareCredentialSetupDependencies = {
  accountDiscovery?: FormlessInstanceAccountDiscoveryAdapter;
  now: () => string;
  oauth?: AlchemyCloudflareOAuthAdapter;
  profileStore?: AlchemyCloudflareProfileStore;
};

export type FormlessCloudflareCredentialSetupDependencies = {
  now: () => string;
  oauth?: FormlessCloudflareOAuthAdapter;
};

const cloudflareOAuthClientId = "6d8c2255-0773-45f6-b376-2914632e6f91";
const cloudflareOAuthRedirectUri = "http://localhost:9976/auth/callback";
const cloudflareOAuthAuthorizeUrl = "https://dash.cloudflare.com/oauth2/authorize";
const cloudflareOAuthTokenUrl = "https://dash.cloudflare.com/oauth2/token";
const cloudflareApiBaseUrl = "https://api.cloudflare.com/client/v4";
const alchemyRootDir = path.join(homedir(), ".alchemy");
const alchemyConfigPath = path.join(alchemyRootDir, "config.json");
const alchemyCredentialsDir = path.join(alchemyRootDir, "credentials");

const alchemyCloudflareDefaultScopes = [
  "account:read",
  "ai-search:write",
  "ai-search:run",
  "ai:write",
  "cloudchamber:write",
  "connectivity:admin",
  "containers:write",
  "d1:write",
  "pages:write",
  "pipelines:write",
  "queues:write",
  "secrets_store:write",
  "ssl_certs:write",
  "user:read",
  "vectorize:write",
  "workers_kv:write",
  "workers_routes:write",
  "workers_scripts:write",
  "workers_tail:read",
  "workers:write",
  "zone:read",
] as const;

export async function setupCloudflareCredentialsWithFormlessOAuth(
  input: AlchemyCloudflareCredentialSetupInput,
  dependencies: FormlessCloudflareCredentialSetupDependencies = {
    now: () => new Date().toISOString(),
  },
): Promise<FormlessCloudflareCredentialSetupResult> {
  const credentialId = normalizeFormlessCloudflareOAuthCredentialId(input.profileLabel);
  const selectedAccountId = normalizeOptionalAccountId(input.accountId);
  const oauth =
    dependencies.oauth ??
    createNodeFormlessCloudflareOAuthAdapter({
      now: dependencies.now,
    });
  const existing = await readFormlessCloudflareOAuthCredential({
    id: credentialId,
    workspaceRoot: input.workspaceRoot,
  });

  if (existing) {
    const credential = await refreshStoredFormlessCloudflareOAuthCredential({
      credential: existing,
      oauth,
      now: dependencies.now,
      workspaceRoot: input.workspaceRoot,
    });
    const accounts = await oauth.listAccounts(credential.token);

    return completeFormlessOAuthCredentialSetup({
      accounts,
      credential,
      credentialId,
      deploymentConfigId: input.deploymentConfigId,
      now: dependencies.now,
      selectedAccountId,
      source: "stored-credential",
      targetAlias: input.targetAlias,
      token: credential.token,
      workspaceRoot: input.workspaceRoot,
    });
  }

  const authorization = oauth.createAuthorization();
  const credentialRef = formatFormlessCloudflareOAuthCredentialRef(credentialId);

  return {
    at: dependencies.now(),
    authorizationUrl: authorization.url,
    clientId: FORMLESS_CLOUDFLARE_OAUTH_CLIENT_ID,
    continue: async () => {
      const token = await oauth.waitForToken(authorization);
      assertFormlessCloudflareDeployScopesGranted(token.grantedScopes);
      const accounts = await oauth.listAccounts(token);

      return completeFormlessOAuthCredentialSetup({
        accounts,
        credential: existing,
        credentialId,
        deploymentConfigId: input.deploymentConfigId,
        now: dependencies.now,
        selectedAccountId,
        source: "oauth",
        targetAlias: input.targetAlias,
        token,
        workspaceRoot: input.workspaceRoot,
      });
    },
    credentialRef,
    kind: "authorization-waiting",
    profileLabel: credentialId,
    provider: "cloudflare",
    requestedScopes: [...FORMLESS_CLOUDFLARE_OAUTH_DEPLOY_SCOPES],
    scopeSet: "formless-cloudflare-deploy-oauth",
  };
}

export function assertFormlessCloudflareCredentialAuthorization(
  result: FormlessCloudflareCredentialAuthorizationWaitingResult,
): void {
  const url = new URL(result.authorizationUrl);
  const expectedScopes = FORMLESS_CLOUDFLARE_OAUTH_DEPLOY_SCOPES.join(" ");
  const state = url.searchParams.get("state");
  const challenge = url.searchParams.get("code_challenge");

  if (
    url.origin !== "https://dash.cloudflare.com" ||
    url.pathname !== "/oauth2/auth" ||
    url.searchParams.get("client_id") !== FORMLESS_CLOUDFLARE_OAUTH_CLIENT_ID ||
    result.clientId !== FORMLESS_CLOUDFLARE_OAUTH_CLIENT_ID ||
    url.searchParams.get("redirect_uri") !== FORMLESS_CLOUDFLARE_OAUTH_REDIRECT_URI ||
    url.searchParams.get("response_type") !== "code" ||
    url.searchParams.get("scope") !== expectedScopes ||
    result.requestedScopes.join(" ") !== expectedScopes ||
    result.scopeSet !== "formless-cloudflare-deploy-oauth" ||
    !state ||
    !/^[A-Za-z0-9_-]{32,256}$/.test(state) ||
    !challenge ||
    !/^[A-Za-z0-9_-]{32,256}$/.test(challenge) ||
    url.searchParams.get("code_challenge_method") !== "S256"
  ) {
    throw new Error("Formless Cloudflare OAuth authorization facts are invalid.");
  }
}

async function completeFormlessOAuthCredentialSetup(input: {
  accounts: readonly FormlessCloudflareOAuthAccount[];
  credential: FormlessCloudflareOAuthCredential | undefined;
  credentialId: string;
  deploymentConfigId?: string | null;
  now: () => string;
  selectedAccountId: string | undefined;
  source: "oauth" | "stored-credential";
  targetAlias?: string | null;
  token: FormlessCloudflareOAuthTokenSet;
  workspaceRoot: string;
}): Promise<FormlessCloudflareCredentialSetupCompletedResult> {
  if (!Array.isArray(input.accounts) || input.accounts.length === 0) {
    throw new Error("No Cloudflare accounts were found for the Formless OAuth credential.");
  }

  const selectedAccount =
    input.selectedAccountId === undefined
      ? input.credential?.selectedAccount === undefined
        ? input.accounts.length === 1
          ? input.accounts[0]
          : undefined
        : input.accounts.find((account) => account.id === input.credential?.selectedAccount?.id)
      : input.accounts.find((account) => account.id === input.selectedAccountId);

  if (input.selectedAccountId !== undefined && !selectedAccount) {
    throw new Error(
      `Cloudflare account ${input.selectedAccountId} was not found for the Formless OAuth credential.`,
    );
  }

  const credentialRef = formatFormlessCloudflareOAuthCredentialRef(input.credentialId);
  const credential = createFormlessCloudflareOAuthCredential({
    ...(input.credential?.createdAt === undefined ? {} : { createdAt: input.credential.createdAt }),
    id: input.credentialId,
    ...(selectedAccount === undefined ? {} : { selectedAccount }),
    token: input.token,
    updatedAt: input.now(),
  });

  await writeFormlessCloudflareOAuthCredential({
    credential,
    workspaceRoot: input.workspaceRoot,
  });

  if (!selectedAccount) {
    return {
      accounts: input.accounts.map(displaySafeAccount),
      credentialRef,
      kind: "account-selection-required",
      provider: "cloudflare",
    };
  }

  const deploymentConfig = await writeFormlessOAuthDeploymentConfigSource({
    account: selectedAccount,
    credentialRef,
    deploymentConfigId: input.deploymentConfigId,
    now: input.now(),
    targetAlias: input.targetAlias,
    workspaceRoot: input.workspaceRoot,
  });

  return {
    account: displaySafeAccount(selectedAccount),
    accountCount: input.accounts.length,
    credentialRef,
    deploymentConfig,
    kind: "ready",
    provider: "cloudflare",
    source: input.source,
  };
}

async function writeFormlessOAuthDeploymentConfigSource(input: {
  account: FormlessCloudflareOAuthAccount;
  credentialRef: string;
  deploymentConfigId?: string | null;
  now: string;
  targetAlias?: string | null;
  workspaceRoot: string;
}): Promise<{
  accountId: string;
  targetId: string;
  targetUrl: string;
  workerName: string;
}> {
  const { config } = await readWorkspaceConfig(input.workspaceRoot);
  const current = await readInstanceWorkspaceProgramStorageSnapshot({
    manifest: config,
    workspaceRoot: input.workspaceRoot,
  });
  const existing = selectFormlessCliCredentialSetupDeploymentConfig(current?.records ?? [], {
    deploymentConfigId: input.deploymentConfigId,
    targetAlias: input.targetAlias,
  });
  const targetId =
    stringRecordValue(existing, "targetId") ??
    existing?.id ??
    normalizeOptionalTargetAlias(input.targetAlias) ??
    formlessCliPrimaryTargetId();
  const workerName =
    stringRecordValue(existing, "workerName") ?? normalizeFormlessInstanceName(config.name);
  const targetUrl = formlessCliWorkersDevTargetUrl({
    workerName,
    workersDevSubdomain: input.account.workersDevSubdomain,
  });
  const deploymentConfigRecord: StoredRecord = {
    id: existing?.id ?? targetId,
    entity: "deployment-config",
    values: {
      ...withoutControlPlaneLifecycleValues(existing?.values ?? {}),
      targetId,
      label: stringRecordValue(existing, "label") ?? targetId,
      enabled: true,
      targetUrl,
      providerFamily: "cloudflare",
      accountId: input.account.id,
      workerName,
      credentialRef: input.credentialRef,
    },
    createdAt: existing?.createdAt ?? input.now,
    updatedAt: input.now,
  };
  const records = [
    ...(current?.records.filter(
      (record) =>
        !(
          record.entity === "deployment-config" &&
          (record.id === deploymentConfigRecord.id ||
            stringRecordValue(record, "targetId") === targetId)
        ),
    ) ?? []),
    deploymentConfigRecord,
  ];

  await writeInstanceWorkspaceProgramStorageSnapshot({
    manifest: config,
    snapshot: workspaceControlPlaneSnapshotFromRecords({
      current,
      exportedAt: input.now,
      records,
      schemaUpdatedAt: input.now,
    }),
    workspaceRoot: input.workspaceRoot,
  });

  return {
    accountId: input.account.id,
    targetId,
    targetUrl,
    workerName,
  };
}

export async function setupCloudflareCredentialsWithAlchemyProfile(
  input: AlchemyCloudflareCredentialSetupInput,
  dependencies: AlchemyCloudflareCredentialSetupDependencies = {
    now: () => new Date().toISOString(),
  },
): Promise<AlchemyCloudflareCredentialSetupResult> {
  const profile = normalizeAlchemyProfile(input.profileLabel, input.env);
  const selectedAccountId = normalizeOptionalAccountId(input.accountId);
  const accountDiscovery =
    dependencies.accountDiscovery ?? alchemyFormlessInstanceAccountDiscoveryAdapter;
  const profileStore = dependencies.profileStore ?? nodeAlchemyCloudflareProfileStore();

  const existingAccounts = await listExistingAlchemyAccounts({
    accountDiscovery,
    profile,
    profileStore,
  });

  if (existingAccounts) {
    return completeCredentialSetupFromAccounts({
      accounts: existingAccounts,
      now: dependencies.now,
      profile,
      profileStore,
      selectedAccountId,
      source: "existing-profile",
    });
  }

  const oauth = dependencies.oauth ?? nodeAlchemyCloudflareOAuthAdapter();
  const authorization = oauth.authorize([...alchemyCloudflareDefaultScopes, "offline_access"]);
  const profileRef = alchemyProfileRef(profile);

  return {
    at: dependencies.now(),
    authorizationUrl: authorization.url,
    continue: async () => {
      const credentials = await oauth.waitForCredentials(authorization);
      await profileStore.writeCredentials(profile, credentials);
      const accounts = await profileStore.listAccountsWithCredentials(credentials);

      return completeCredentialSetupFromAccounts({
        accounts,
        now: dependencies.now,
        profile,
        profileStore,
        selectedAccountId,
        source: "oauth-profile",
      });
    },
    kind: "authorization-waiting",
    profile,
    profileRef,
    provider: "cloudflare",
    scopeSet: "alchemy-default-oauth",
  };
}

async function listExistingAlchemyAccounts(input: {
  accountDiscovery: FormlessInstanceAccountDiscoveryAdapter;
  profile: string;
  profileStore: AlchemyCloudflareProfileStore;
}): Promise<FormlessInstanceDeploymentAccount[] | undefined> {
  try {
    return await input.accountDiscovery.listAccounts({
      credentialProfile: input.profile === FORMLESS_ALCHEMY_DEFAULT_PROFILE ? null : input.profile,
    });
  } catch {
    const credentials = await input.profileStore.readCredentials(input.profile);

    if (!credentials) {
      return undefined;
    }

    return input.profileStore.listAccountsWithCredentials(credentials);
  }
}

async function completeCredentialSetupFromAccounts(input: {
  accounts: readonly FormlessInstanceDeploymentAccount[];
  now: () => string;
  profile: string;
  profileStore: AlchemyCloudflareProfileStore;
  selectedAccountId: string | undefined;
  source: "existing-profile" | "oauth-profile";
}): Promise<AlchemyCloudflareCredentialSetupCompletedResult> {
  if (!Array.isArray(input.accounts) || input.accounts.length === 0) {
    throw new Error("No Cloudflare accounts were found for the selected Alchemy profile.");
  }

  const selectedAccount =
    input.selectedAccountId === undefined
      ? input.accounts.length === 1
        ? input.accounts[0]
        : undefined
      : input.accounts.find((account) => account.id === input.selectedAccountId);

  if (input.selectedAccountId !== undefined && !selectedAccount) {
    throw new Error(
      `Cloudflare account ${input.selectedAccountId} was not found for the selected Alchemy profile.`,
    );
  }

  if (!selectedAccount) {
    return {
      accounts: input.accounts.map(displaySafeAccount),
      kind: "account-selection-required",
      profile: input.profile,
      profileRef: alchemyProfileRef(input.profile),
      provider: "cloudflare",
    };
  }

  await input.profileStore.writeProvider({
    account: selectedAccount,
    profile: input.profile,
    scopes: alchemyCloudflareDefaultScopes,
  });

  return {
    account: displaySafeAccount(selectedAccount),
    accountCount: input.accounts.length,
    kind: "ready",
    profile: input.profile,
    profileRef: alchemyProfileRef(input.profile),
    provider: "cloudflare",
    source: input.source,
  };
}

function displaySafeAccount(
  account: FormlessInstanceDeploymentAccount,
): FormlessInstanceDeploymentAccount {
  return {
    id: account.id,
    ...(account.name === undefined ? {} : { name: account.name }),
    workersDevSubdomain: account.workersDevSubdomain,
  };
}

function normalizeAlchemyProfile(
  profileLabel: string | null | undefined,
  env: NodeJS.ProcessEnv | undefined,
): string {
  const profile =
    profileLabel?.trim() ||
    env?.ALCHEMY_PROFILE?.trim() ||
    env?.CLOUDFLARE_PROFILE?.trim() ||
    FORMLESS_ALCHEMY_DEFAULT_PROFILE;

  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(profile)) {
    throw new Error(
      "Alchemy profile label must use letters, numbers, dots, dashes, or underscores.",
    );
  }

  return profile;
}

function normalizeOptionalAccountId(accountId: string | null | undefined): string | undefined {
  if (accountId === undefined || accountId === null || accountId.trim() === "") {
    return undefined;
  }

  const normalized = accountId.trim();

  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(normalized)) {
    throw new Error("Cloudflare account id is invalid.");
  }

  return normalized;
}

function normalizeOptionalTargetAlias(targetAlias: string | null | undefined): string | undefined {
  if (targetAlias === undefined || targetAlias === null || targetAlias.trim() === "") {
    return undefined;
  }

  return targetAlias.trim();
}

function alchemyProfileRef(profile: string): string {
  return `${FORMLESS_ALCHEMY_PROFILE_REF_PREFIX}${profile}`;
}

function nodeAlchemyCloudflareOAuthAdapter(): AlchemyCloudflareOAuthAdapter {
  return {
    authorize: (scopes) => {
      const state = randomBytes(32).toString("base64url");
      const verifier = randomBytes(96).toString("base64url");
      const challenge = createHash("sha256").update(verifier).digest("base64url");
      const url = new URL(cloudflareOAuthAuthorizeUrl);

      url.searchParams.set("client_id", cloudflareOAuthClientId);
      url.searchParams.set("redirect_uri", cloudflareOAuthRedirectUri);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", scopes.join(" "));
      url.searchParams.set("state", state);
      url.searchParams.set("code_challenge", challenge);
      url.searchParams.set("code_challenge_method", "S256");

      return { state, url: url.toString(), verifier };
    },
    waitForCredentials: waitForCloudflareOAuthCredentials,
  };
}

async function waitForCloudflareOAuthCredentials(
  authorization: AlchemyCloudflareAuthorization,
): Promise<AlchemyCloudflareOAuthCredentials> {
  const redirect = new URL(cloudflareOAuthRedirectUri);
  const port = Number(redirect.port);
  const pathname = redirect.pathname;

  return new Promise((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout>;
    const server = createServer(async (request, response) => {
      try {
        const url = new URL(request.url ?? "/", cloudflareOAuthRedirectUri);

        if (url.pathname !== pathname) {
          throw new Error("Cloudflare authorization callback path is invalid.");
        }

        const error = url.searchParams.get("error");

        if (error) {
          throw new Error(
            url.searchParams.get("error_description") ?? "Cloudflare authorization failed.",
          );
        }

        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");

        if (!code || state !== authorization.state) {
          throw new Error("Cloudflare authorization callback is invalid.");
        }

        const credentials = await exchangeCloudflareOAuthCode(code, authorization.verifier);

        response.statusCode = 302;
        response.setHeader("Location", "https://alchemy.run/auth/success");
        response.end();
        clearTimeout(timeout);
        resolve(credentials);
      } catch (error) {
        response.statusCode = 302;
        response.setHeader("Location", "https://alchemy.run/auth/error");
        response.end();
        clearTimeout(timeout);
        reject(error);
      } finally {
        server.close();
      }
    });
    timeout = setTimeout(
      () => {
        reject(new Error("Cloudflare authorization timed out."));
        server.close();
      },
      1000 * 60 * 5,
    );

    server.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    server.listen(port);
  });
}

async function exchangeCloudflareOAuthCode(
  code: string,
  verifier: string,
): Promise<AlchemyCloudflareOAuthCredentials> {
  const response = await fetch(cloudflareOAuthTokenUrl, {
    body: new URLSearchParams({
      client_id: cloudflareOAuthClientId,
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: cloudflareOAuthRedirectUri,
    }).toString(),
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Cloudflare authorization token exchange failed.");
  }

  const body = (await response.json()) as Partial<{
    access_token: string;
    expires_in: number;
    refresh_token: string;
    scope: string;
  }>;
  const access = parseRequiredString(body.access_token, "Cloudflare OAuth access token");
  const refresh = parseRequiredString(body.refresh_token, "Cloudflare OAuth refresh token");
  const expiresIn = typeof body.expires_in === "number" ? body.expires_in : undefined;
  const scope = parseRequiredString(body.scope, "Cloudflare OAuth scope");

  if (expiresIn === undefined) {
    throw new Error("Cloudflare OAuth token response is missing expiration.");
  }

  return {
    access,
    expires: Date.now() + expiresIn * 1000,
    refresh,
    scopes: scope.split(" ").filter((value) => value.trim() !== ""),
    type: "oauth",
  };
}

function nodeAlchemyCloudflareProfileStore(): AlchemyCloudflareProfileStore {
  return {
    listAccountsWithCredentials: async (credentials) =>
      listCloudflareAccountsWithOAuthCredentials(credentials),
    readCredentials: async (profile) => readAlchemyCloudflareCredentials(profile),
    writeCredentials: async (profile, credentials) =>
      writeAlchemyCloudflareCredentials(profile, credentials),
    writeProvider: async ({ account, profile, scopes }) =>
      writeAlchemyCloudflareProvider({ account, profile, scopes }),
  };
}

async function listCloudflareAccountsWithOAuthCredentials(
  credentials: AlchemyCloudflareOAuthCredentials,
): Promise<FormlessInstanceDeploymentAccount[]> {
  const accounts = await readCloudflareApiResult<
    Array<{
      id?: string;
      name?: string;
    }>
  >("/accounts", credentials);
  return Promise.all(
    accounts.map(async (account) => {
      const id = parseRequiredString(account.id, "Cloudflare account id");
      const subdomain = await readCloudflareApiResult<{
        subdomain?: string;
      }>(`/accounts/${id}/workers/subdomain`, credentials);
      return {
        id,
        ...(account.name === undefined ? {} : { name: account.name }),
        workersDevSubdomain: parseRequiredString(
          subdomain.subdomain,
          "Cloudflare workers.dev subdomain",
        ),
      };
    }),
  );
}

async function readCloudflareApiResult<T>(
  pathname: string,
  credentials: AlchemyCloudflareOAuthCredentials,
): Promise<T> {
  const response = await fetch(`${cloudflareApiBaseUrl}${pathname}`, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${credentials.access}`,
    },
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Cloudflare API request failed: HTTP ${response.status}.`);
  }
  let body: Partial<{
    result: T;
    success: boolean;
  }>;
  try {
    body = JSON.parse(text) as Partial<{
      result: T;
      success: boolean;
    }>;
  } catch {
    throw new Error("Cloudflare API response is invalid JSON.");
  }

  if (body.success !== true || body.result === undefined) {
    throw new Error("Cloudflare API response was unsuccessful.");
  }

  return body.result;
}

async function readAlchemyCloudflareCredentials(
  profile: string,
): Promise<AlchemyCloudflareOAuthCredentials | undefined> {
  const filePath = alchemyCredentialsPath(profile);

  try {
    const parsed = JSON.parse(
      await readFile(filePath, "utf8"),
    ) as Partial<AlchemyCloudflareOAuthCredentials>;

    if (
      parsed.type === "oauth" &&
      typeof parsed.access === "string" &&
      typeof parsed.refresh === "string" &&
      typeof parsed.expires === "number" &&
      Array.isArray(parsed.scopes) &&
      parsed.scopes.every((scope) => typeof scope === "string")
    ) {
      return parsed as AlchemyCloudflareOAuthCredentials;
    }

    return undefined;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

async function writeAlchemyCloudflareCredentials(
  profile: string,
  credentials: AlchemyCloudflareOAuthCredentials,
): Promise<void> {
  const filePath = alchemyCredentialsPath(profile);

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });
}

async function writeAlchemyCloudflareProvider(input: {
  account: FormlessInstanceDeploymentAccount;
  profile: string;
  scopes: readonly string[];
}): Promise<void> {
  const config = await readAlchemyConfig();

  config.profiles[input.profile] ??= {};
  config.profiles[input.profile][FORMLESS_ALCHEMY_CLOUDFLARE_PROVIDER] = {
    metadata: {
      id: input.account.id,
      name: input.account.name ?? input.account.id,
    },
    method: "oauth",
    scopes: [...input.scopes],
  };

  await mkdir(path.dirname(alchemyConfigPath), { recursive: true });
  await writeFile(alchemyConfigPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

type AlchemyConfig = {
  profiles: Record<
    string,
    Record<
      string,
      {
        metadata: Record<string, string>;
        method: "api-key" | "api-token" | "oauth";
        scopes?: string[];
      }
    >
  >;
  version: 1;
};

async function readAlchemyConfig(): Promise<AlchemyConfig> {
  try {
    const parsed = JSON.parse(await readFile(alchemyConfigPath, "utf8")) as Partial<AlchemyConfig>;

    if (parsed.version === 1 && parsed.profiles && typeof parsed.profiles === "object") {
      return parsed as AlchemyConfig;
    }

    return { profiles: {}, version: 1 };
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return { profiles: {}, version: 1 };
    }

    throw error;
  }
}

function alchemyCredentialsPath(profile: string): string {
  return path.join(alchemyCredentialsDir, profile, `${FORMLESS_ALCHEMY_CLOUDFLARE_PROVIDER}.json`);
}

function parseRequiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is required.`);
  }

  return value;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
