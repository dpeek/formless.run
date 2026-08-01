import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";
import { formlessProgramSchema } from "../program/runtime.ts";
import {
  FORMLESS_PROGRAM_SCHEMA_KEY,
  FORMLESS_PROGRAM_STORAGE_IDENTITY,
} from "../program/target.ts";
import {
  FORMLESS_CONFIG_FILE,
  resolveFormlessConfig,
  type ResolvedFormlessConfig,
} from "@dpeek/formless-workspace";
import { formatTestFormlessConfigModule } from "./instance-workspace-config-test.ts";
import {
  STORAGE_SNAPSHOT_KIND,
  STORAGE_SNAPSHOT_VERSION,
  type StoredRecord,
} from "@dpeek/formless-storage";
import {
  readInstanceWorkspaceProgramStorageSnapshot,
  writeInstanceWorkspaceProgramStorageSnapshot,
} from "../program/workspace.ts";

import {
  FORMLESS_CLOUDFLARE_OAUTH_DEPLOY_SCOPES,
  createFormlessCloudflareOAuthCredential,
  formlessCloudflareOAuthCredentialPath,
  formatFormlessCloudflareOAuthCredentialRef,
  parseFormlessCloudflareOAuthCredentialRef,
  readFormlessCloudflareOAuthCredential,
  writeFormlessCloudflareOAuthCredential,
  type FormlessCloudflareOAuthAccount,
  type FormlessCloudflareOAuthAdapter,
  type FormlessCloudflareOAuthTokenSet,
} from "./cloudflare-oauth.ts";
import {
  setupCloudflareCredentialsWithFormlessOAuth,
  setupCloudflareCredentialsWithAlchemyProfile,
  type AlchemyCloudflareOAuthCredentials,
  type AlchemyCloudflareProfileStore,
} from "./instance-workspace-credential-setup.ts";
import type { FormlessInstanceDeploymentAccount } from "./instance-onboarding.ts";

const tempDirs: string[] = [];
const now = () => "2026-06-02T02:00:00.000Z";
const personalAccount = {
  id: "acct_personal",
  name: "Personal",
  workersDevSubdomain: "personal",
} satisfies FormlessInstanceDeploymentAccount;
const teamAccount = {
  id: "acct_team",
  name: "Team",
  workersDevSubdomain: "team",
} satisfies FormlessInstanceDeploymentAccount;
const oauthCredentials = {
  access: "oauth-access-token",
  expires: 4102444800000,
  refresh: "oauth-refresh-token",
  scopes: ["account:read", "workers:write", "offline_access"],
  type: "oauth",
} satisfies AlchemyCloudflareOAuthCredentials;
const formlessOAuthToken = {
  accessToken: "formless-access-token",
  expiresAt: "2026-06-02T03:00:00.000Z",
  grantedScopes: [...FORMLESS_CLOUDFLARE_OAUTH_DEPLOY_SCOPES],
  refreshToken: "formless-refresh-token",
} satisfies FormlessCloudflareOAuthTokenSet;
const refreshedFormlessOAuthToken = {
  accessToken: "formless-refreshed-access-token",
  expiresAt: "2026-06-02T04:00:00.000Z",
  grantedScopes: [...FORMLESS_CLOUDFLARE_OAUTH_DEPLOY_SCOPES],
  refreshToken: "formless-refreshed-refresh-token",
} satisfies FormlessCloudflareOAuthTokenSet;
const expiredFormlessOAuthToken = {
  ...formlessOAuthToken,
  expiresAt: "2026-06-02T01:59:00.000Z",
} satisfies FormlessCloudflareOAuthTokenSet;
const personalCloudflareAccount = {
  id: "acct_personal",
  name: "Personal",
  workersDevSubdomain: "personal",
} satisfies FormlessCloudflareOAuthAccount;
const teamCloudflareAccount = {
  id: "acct_team",
  name: "Team",
  workersDevSubdomain: "team",
} satisfies FormlessCloudflareOAuthAccount;

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { force: true, recursive: true })),
  );
});

describe("Formless Cloudflare OAuth credentials", () => {
  it("formats, parses, and validates display-safe credentialRef values", () => {
    expect(formatFormlessCloudflareOAuthCredentialRef(" personal ")).toBe(
      "formless-cloudflare-oauth:personal",
    );
    expect(parseFormlessCloudflareOAuthCredentialRef("formless-cloudflare-oauth:personal")).toBe(
      "personal",
    );

    expect(() => parseFormlessCloudflareOAuthCredentialRef("alchemy-profile:default")).toThrow(
      "Formless Cloudflare credentialRef must use formless-cloudflare-oauth:<credentialId>.",
    );
    expect(parseFormlessCloudflareOAuthCredentialRef("formless-cloudflare-oauth:")).toBe("default");
    expect(() => formatFormlessCloudflareOAuthCredentialRef("team/account")).toThrow(
      "Formless Cloudflare OAuth credential id must use letters, numbers, dots, dashes, or underscores.",
    );
  });

  it("stores OAuth credentials only in ignored local secret state", async () => {
    const workspaceRoot = await makeTempDir();
    const credential = createFormlessCloudflareOAuthCredential({
      id: "personal",
      selectedAccount: personalCloudflareAccount,
      token: formlessOAuthToken,
      updatedAt: now(),
    });

    const write = await writeFormlessCloudflareOAuthCredential({
      credential,
      workspaceRoot,
    });

    expect(write.path).toBe(path.join(workspaceRoot, ".formless/cloudflare-oauth/personal.json"));
    expect(formlessCloudflareOAuthCredentialPath(workspaceRoot, "personal")).toBe(write.path);
    await expect(readFile(path.join(workspaceRoot, ".gitignore"), "utf8")).resolves.toBe(
      ".formless/\n",
    );
    await expect(
      readFormlessCloudflareOAuthCredential({ id: "personal", workspaceRoot }),
    ).resolves.toEqual(credential);

    const secretState = await readFile(write.path, "utf8");

    expect(secretState).toContain("formless-access-token");
    expect(secretState).toContain("formless-refresh-token");
    expect(secretState).toContain("formless-cloudflare-oauth:personal");
    expect(secretState).toContain("223a6ddec4aad6a652bf9b5ce840912c");
  });

  it("writes display-safe deployment-config source after OAuth account discovery", async () => {
    const workspaceRoot = await makeTempDir();
    const manifest = await writeWorkspaceConfig(workspaceRoot);
    const listedTokens: string[] = [];
    const oauth = {
      createAuthorization: () => ({
        requestedScopes: FORMLESS_CLOUDFLARE_OAUTH_DEPLOY_SCOPES,
        state: "oauth-state",
        url: "https://dash.cloudflare.com/oauth2/auth?client_id=formless",
        verifier: "oauth-verifier",
      }),
      exchangeCode: async () => formlessOAuthToken,
      listAccounts: async (token) => {
        listedTokens.push(token.accessToken);
        return [personalCloudflareAccount];
      },
      refresh: async () => {
        throw new Error("New OAuth credentials should not refresh.");
      },
      waitForToken: async (authorization) => {
        expect(authorization.state).toBe("oauth-state");
        return formlessOAuthToken;
      },
    } satisfies FormlessCloudflareOAuthAdapter;

    const start = await setupCloudflareCredentialsWithFormlessOAuth(
      { provider: "cloudflare", workspaceRoot },
      { now, oauth },
    );

    expect(start).toMatchObject({
      events: [
        {
          profileLabel: "default",
          provider: "cloudflare",
          status: "waiting",
          type: "externalAuthorizationUrl",
          url: "https://dash.cloudflare.com/oauth2/auth?client_id=formless",
        },
      ],
      result: {
        details: {
          credentialRef: "formless-cloudflare-oauth:default",
          scopeSet: "formless-cloudflare-deploy-oauth",
        },
        summary: {
          fields: {
            credentialRef: "formless-cloudflare-oauth:default",
            provider: "cloudflare",
            status: "waiting-for-authorization",
          },
          title: "Cloudflare authorization required",
        },
      },
      status: "running",
    });
    expect(start.result?.details?.requestedScopes).toContain("email-sending.write");
    expect(JSON.stringify(start)).not.toContain("formless-access-token");
    expect(JSON.stringify(start)).not.toContain("formless-refresh-token");
    expect(start.continue).toBeDefined();

    const final = await start.continue!();

    expect(listedTokens).toEqual(["formless-access-token"]);
    expect(final).toMatchObject({
      result: {
        details: {
          account: personalCloudflareAccount,
          credentialRef: "formless-cloudflare-oauth:default",
          deploymentConfig: {
            accountId: "acct_personal",
            targetId: "instance.primary",
            targetUrl: "https://personal-sites.personal.workers.dev",
            workerName: "personal-sites",
          },
          source: "oauth",
        },
        summary: {
          fields: {
            credentialRef: "formless-cloudflare-oauth:default",
            provider: "cloudflare",
            selectedAccountId: "acct_personal",
            status: "validated",
            targetUrl: "https://personal-sites.personal.workers.dev",
            workerName: "personal-sites",
          },
          title: "Cloudflare credentials ready",
        },
      },
      status: "succeeded",
    });
    expect(JSON.stringify(final)).not.toContain("formless-access-token");
    expect(JSON.stringify(final)).not.toContain("formless-refresh-token");

    const credential = await readFormlessCloudflareOAuthCredential({
      id: "default",
      workspaceRoot,
    });
    const snapshot = await readInstanceWorkspaceProgramStorageSnapshot({
      manifest,
      workspaceRoot,
    });
    const deploymentConfig = snapshot?.records.find(
      (record) => record.entity === "deployment-config",
    );

    expect(credential).toMatchObject({
      credentialRef: "formless-cloudflare-oauth:default",
      selectedAccount: personalCloudflareAccount,
      token: {
        accessToken: "formless-access-token",
        refreshToken: "formless-refresh-token",
      },
    });
    expect(deploymentConfig?.values).toMatchObject({
      accountId: "acct_personal",
      credentialRef: "formless-cloudflare-oauth:default",
      enabled: true,
      providerFamily: "cloudflare",
      targetId: "instance.primary",
      targetKind: "instance",
      targetUrl: "https://personal-sites.personal.workers.dev",
      workerName: "personal-sites",
    });
    expect(JSON.stringify(snapshot)).not.toContain("formless-access-token");
    expect(JSON.stringify(snapshot)).not.toContain("formless-refresh-token");
  });

  it("refreshes stored credentials before account discovery and deployment-config writeback", async () => {
    const workspaceRoot = await makeTempDir();
    const manifest = await writeWorkspaceConfig(workspaceRoot);
    const credential = createFormlessCloudflareOAuthCredential({
      id: "personal",
      selectedAccount: teamCloudflareAccount,
      token: expiredFormlessOAuthToken,
      updatedAt: "2026-06-02T01:00:00.000Z",
    });
    const refreshTokens: string[] = [];
    const listedTokens: string[] = [];

    await writeFormlessCloudflareOAuthCredential({
      credential,
      workspaceRoot,
    });

    const oauth = {
      createAuthorization: () => {
        throw new Error("Stored credentials should not start authorization.");
      },
      exchangeCode: async () => {
        throw new Error("Stored credentials should not exchange authorization codes.");
      },
      listAccounts: async (token) => {
        listedTokens.push(token.accessToken);
        return [personalCloudflareAccount, teamCloudflareAccount];
      },
      refresh: async (input) => {
        refreshTokens.push(input.refreshToken);
        return refreshedFormlessOAuthToken;
      },
      waitForToken: async () => {
        throw new Error("Stored credentials should not wait for new tokens.");
      },
    } satisfies FormlessCloudflareOAuthAdapter;

    const result = await setupCloudflareCredentialsWithFormlessOAuth(
      { profileLabel: "personal", provider: "cloudflare", workspaceRoot },
      { now, oauth },
    );

    expect(refreshTokens).toEqual(["formless-refresh-token"]);
    expect(listedTokens).toEqual(["formless-refreshed-access-token"]);
    expect(result).toMatchObject({
      result: {
        details: {
          credentialRef: "formless-cloudflare-oauth:personal",
          source: "stored-credential",
        },
        summary: {
          fields: {
            credentialRef: "formless-cloudflare-oauth:personal",
            selectedAccountId: "acct_team",
            status: "validated",
            targetUrl: "https://personal-sites.team.workers.dev",
          },
        },
      },
      status: "succeeded",
    });
    expect(JSON.stringify(result)).not.toContain("formless-refreshed-access-token");
    expect(JSON.stringify(result)).not.toContain("formless-refreshed-refresh-token");

    await expect(
      readFormlessCloudflareOAuthCredential({ id: "personal", workspaceRoot }),
    ).resolves.toMatchObject({
      createdAt: "2026-06-02T01:00:00.000Z",
      selectedAccount: teamCloudflareAccount,
      token: {
        accessToken: "formless-refreshed-access-token",
        refreshToken: "formless-refreshed-refresh-token",
      },
      updatedAt: now(),
    });

    const snapshot = await readInstanceWorkspaceProgramStorageSnapshot({
      manifest,
      workspaceRoot,
    });
    const deploymentConfig = snapshot?.records.find(
      (record) => record.entity === "deployment-config",
    );

    expect(deploymentConfig?.values).toMatchObject({
      accountId: "acct_team",
      credentialRef: "formless-cloudflare-oauth:personal",
      providerFamily: "cloudflare",
      targetUrl: "https://personal-sites.team.workers.dev",
      workerName: "personal-sites",
    });
    expect(JSON.stringify(snapshot)).not.toContain("formless-refreshed-access-token");
    expect(JSON.stringify(snapshot)).not.toContain("formless-refreshed-refresh-token");
  });

  it("enriches the requested deployment-config target without mutating another target", async () => {
    const workspaceRoot = await makeTempDir();
    const manifest = await writeWorkspaceConfig(workspaceRoot);
    const oauth = {
      createAuthorization: () => ({
        requestedScopes: FORMLESS_CLOUDFLARE_OAUTH_DEPLOY_SCOPES,
        state: "oauth-state",
        url: "https://dash.cloudflare.com/oauth2/auth?client_id=formless",
        verifier: "oauth-verifier",
      }),
      exchangeCode: async () => formlessOAuthToken,
      listAccounts: async () => [teamCloudflareAccount],
      refresh: async () => {
        throw new Error("New OAuth credentials should not refresh.");
      },
      waitForToken: async () => formlessOAuthToken,
    } satisfies FormlessCloudflareOAuthAdapter;

    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot, manifest, [
      deploymentConfigRecord({
        accountId: "acct_personal",
        credentialRef: "alchemy-profile:default",
        id: "instance.primary",
        label: "Production",
        targetId: "instance.primary",
        targetUrl: "https://personal-sites.personal.workers.dev",
        workerName: "personal-sites",
      }),
      deploymentConfigRecord({
        accountId: "acct_old",
        credentialRef: "alchemy-profile:team",
        createdAt: "2026-01-01T00:00:00.000Z",
        id: "staging",
        label: "Staging",
        targetId: "staging",
        targetUrl: "https://staging-sites.old.workers.dev",
        workerName: "staging-sites",
      }),
    ]);

    const start = await setupCloudflareCredentialsWithFormlessOAuth(
      {
        deploymentConfigId: "staging",
        provider: "cloudflare",
        targetAlias: "staging",
        workspaceRoot,
      },
      { now, oauth },
    );
    const final = await start.continue!();

    expect(final).toMatchObject({
      result: {
        details: {
          credentialRef: "formless-cloudflare-oauth:default",
          deploymentConfig: {
            accountId: "acct_team",
            targetId: "staging",
            targetUrl: "https://staging-sites.team.workers.dev",
            workerName: "staging-sites",
          },
        },
        summary: {
          fields: {
            credentialRef: "formless-cloudflare-oauth:default",
            selectedAccountId: "acct_team",
            targetUrl: "https://staging-sites.team.workers.dev",
            workerName: "staging-sites",
          },
        },
      },
      status: "succeeded",
    });

    const snapshot = await readInstanceWorkspaceProgramStorageSnapshot({
      manifest,
      workspaceRoot,
    });
    const production = snapshot?.records.find((record) => record.id === "instance.primary");
    const staging = snapshot?.records.find((record) => record.id === "staging");

    expect(production?.values).toMatchObject({
      accountId: "acct_personal",
      credentialRef: "alchemy-profile:default",
      label: "Production",
      targetId: "instance.primary",
      targetUrl: "https://personal-sites.personal.workers.dev",
      workerName: "personal-sites",
    });
    expect(staging?.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(staging?.values).toMatchObject({
      accountId: "acct_team",
      credentialRef: "formless-cloudflare-oauth:default",
      label: "Staging",
      providerFamily: "cloudflare",
      targetId: "staging",
      targetKind: "instance",
      targetUrl: "https://staging-sites.team.workers.dev",
      workerName: "staging-sites",
    });
    expect(JSON.stringify(snapshot)).not.toContain("formless-access-token");
    expect(JSON.stringify(snapshot)).not.toContain("formless-refresh-token");
  });
});

describe("Alchemy Cloudflare credential setup", () => {
  it("validates existing default or named Alchemy profile credentials", async () => {
    const result = await setupCloudflareCredentialsWithAlchemyProfile(
      { profileLabel: "personal", provider: "cloudflare", workspaceRoot: "/workspace" },
      {
        accountDiscovery: {
          listAccounts: async (input) => {
            expect(input.credentialProfile).toBe("personal");
            return [personalAccount];
          },
        },
        now,
        profileStore: fakeProfileStore(),
      },
    );

    expect(result).toMatchObject({
      result: {
        details: {
          account: {
            id: "acct_personal",
            name: "Personal",
            workersDevSubdomain: "personal",
          },
          profileRef: "alchemy-profile:personal",
          source: "existing-profile",
        },
        summary: {
          fields: {
            profile: "personal",
            provider: "cloudflare",
            selectedAccountId: "acct_personal",
            status: "validated",
          },
          title: "Cloudflare credentials ready",
        },
      },
      status: "succeeded",
    });
    expect(result.events).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("oauth-access-token");
    expect(JSON.stringify(result)).not.toContain("oauth-refresh-token");
  });

  it("starts OAuth profile creation with an authorization URL and stores credentials on continuation", async () => {
    const profileStore = fakeProfileStore({ listedAccounts: [personalAccount] });
    const result = await setupCloudflareCredentialsWithAlchemyProfile(
      { provider: "cloudflare", workspaceRoot: "/workspace" },
      {
        accountDiscovery: {
          listAccounts: async () => {
            throw new Error("No credentials found.");
          },
        },
        now,
        oauth: {
          authorize: (scopes) => {
            expect(scopes).toContain("workers:write");
            expect(scopes).toContain("offline_access");
            return {
              state: "oauth-state",
              url: "https://dash.cloudflare.com/oauth2/authorize?client_id=formless",
              verifier: "oauth-verifier",
            };
          },
          waitForCredentials: async (authorization) => {
            expect(authorization.state).toBe("oauth-state");
            return oauthCredentials;
          },
        },
        profileStore,
      },
    );

    expect(result).toMatchObject({
      events: [
        {
          profileLabel: "default",
          provider: "cloudflare",
          status: "waiting",
          type: "externalAuthorizationUrl",
          url: "https://dash.cloudflare.com/oauth2/authorize?client_id=formless",
        },
      ],
      result: {
        summary: {
          fields: {
            profile: "default",
            provider: "cloudflare",
            status: "waiting-for-authorization",
          },
          title: "Cloudflare authorization required",
        },
      },
      status: "running",
    });
    expect(JSON.stringify(result)).not.toContain("oauth-access-token");

    const final = await result.continue?.();

    expect(profileStore.writtenCredentials).toEqual([
      { credentials: oauthCredentials, profile: "default" },
    ]);
    expect(profileStore.writtenProviders).toEqual([
      {
        account: personalAccount,
        profile: "default",
        scopes: expect.arrayContaining(["workers:write", "account:read"]),
      },
    ]);
    expect(final).toMatchObject({
      result: {
        summary: {
          fields: {
            profile: "default",
            selectedAccountId: "acct_personal",
            status: "validated",
          },
          title: "Cloudflare credentials ready",
        },
      },
      status: "succeeded",
    });
    expect(JSON.stringify(final)).not.toContain("oauth-access-token");
    expect(JSON.stringify(final)).not.toContain("oauth-refresh-token");
  });

  it("returns browser-visible account options and stores the selected account when supplied", async () => {
    const profileStore = fakeProfileStore({
      credentials: oauthCredentials,
      listedAccounts: [personalAccount, teamAccount],
    });
    const selection = await setupCloudflareCredentialsWithAlchemyProfile(
      { profileLabel: "personal", provider: "cloudflare", workspaceRoot: "/workspace" },
      {
        accountDiscovery: {
          listAccounts: async () => {
            throw new Error("Provider metadata missing.");
          },
        },
        now,
        profileStore,
      },
    );

    expect(selection).toMatchObject({
      result: {
        details: {
          accounts: [
            { id: "acct_personal", name: "Personal", workersDevSubdomain: "personal" },
            { id: "acct_team", name: "Team", workersDevSubdomain: "team" },
          ],
        },
        summary: {
          fields: {
            accountCount: 2,
            profile: "personal",
            provider: "cloudflare",
            status: "account-selection-required",
          },
          title: "Cloudflare account selection required",
        },
      },
      status: "succeeded",
    });
    expect(profileStore.writtenProviders).toEqual([]);

    const selected = await setupCloudflareCredentialsWithAlchemyProfile(
      {
        accountId: "acct_team",
        profileLabel: "personal",
        provider: "cloudflare",
        workspaceRoot: "/workspace",
      },
      {
        accountDiscovery: {
          listAccounts: async () => {
            throw new Error("Provider metadata missing.");
          },
        },
        now,
        profileStore,
      },
    );

    expect(profileStore.writtenProviders.at(-1)).toMatchObject({
      account: teamAccount,
      profile: "personal",
    });
    expect(selected.result?.summary.fields).toMatchObject({
      selectedAccountId: "acct_team",
      status: "validated",
    });
    expect(JSON.stringify(selected)).not.toContain("oauth-access-token");
  });
});

async function makeTempDir(): Promise<string> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "formless-credential-setup-test-"));

  tempDirs.push(tempDir);
  return tempDir;
}

async function writeWorkspaceConfig(workspaceRoot: string): Promise<ResolvedFormlessConfig> {
  const manifest = resolveFormlessConfig({ name: "personal-sites" });

  await mkdir(workspaceRoot, { recursive: true });
  await writeFile(
    path.join(workspaceRoot, FORMLESS_CONFIG_FILE),
    formatTestFormlessConfigModule(manifest),
  );

  return manifest;
}

async function writeWorkspaceControlPlaneStorageSnapshot(
  workspaceRoot: string,
  manifest: ResolvedFormlessConfig,
  records: StoredRecord[],
): Promise<void> {
  await writeInstanceWorkspaceProgramStorageSnapshot({
    manifest,
    snapshot: {
      kind: STORAGE_SNAPSHOT_KIND,
      version: STORAGE_SNAPSHOT_VERSION,
      storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
      schemaKey: FORMLESS_PROGRAM_SCHEMA_KEY,
      exportedAt: now(),
      schemaUpdatedAt: now(),
      sourceCursor: records.length,
      schema: formlessProgramSchema,
      records,
    },
    workspaceRoot,
  });
}

function deploymentConfigRecord(input: {
  accountId: string;
  createdAt?: string;
  credentialRef: string;
  id: string;
  label: string;
  targetId: string;
  targetUrl: string;
  workerName: string;
}): StoredRecord {
  const createdAt = input.createdAt ?? "2026-06-01T00:00:00.000Z";

  return {
    id: input.id,
    entity: "deployment-config",
    values: {
      targetId: input.targetId,
      targetKind: "instance",
      label: input.label,
      enabled: true,
      targetUrl: input.targetUrl,
      providerFamily: "cloudflare",
      accountId: input.accountId,
      workerName: input.workerName,
      credentialRef: input.credentialRef,
    },
    createdAt,
    updatedAt: createdAt,
  };
}

function fakeProfileStore(
  options: {
    credentials?: AlchemyCloudflareOAuthCredentials;
    listedAccounts?: FormlessInstanceDeploymentAccount[];
  } = {},
): AlchemyCloudflareProfileStore & {
  writtenCredentials: Array<{
    credentials: AlchemyCloudflareOAuthCredentials;
    profile: string;
  }>;
  writtenProviders: Array<{
    account: FormlessInstanceDeploymentAccount;
    profile: string;
    scopes: readonly string[];
  }>;
} {
  const writtenCredentials: Array<{
    credentials: AlchemyCloudflareOAuthCredentials;
    profile: string;
  }> = [];
  const writtenProviders: Array<{
    account: FormlessInstanceDeploymentAccount;
    profile: string;
    scopes: readonly string[];
  }> = [];

  return {
    listAccountsWithCredentials: async () => options.listedAccounts ?? [],
    readCredentials: async () => options.credentials,
    writeCredentials: async (profile, credentials) => {
      writtenCredentials.push({ credentials, profile });
    },
    writeProvider: async (input) => {
      writtenProviders.push(input);
    },
    writtenCredentials,
    writtenProviders,
  };
}
