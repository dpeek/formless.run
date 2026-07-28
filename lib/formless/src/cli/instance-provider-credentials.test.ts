import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { StoredRecord } from "@dpeek/formless-storage";
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  FORMLESS_CLOUDFLARE_OAUTH_DEPLOY_SCOPES,
  createFormlessCloudflareOAuthCredential,
  formatFormlessCloudflareOAuthCredentialRef,
  readFormlessCloudflareOAuthCredential,
  writeFormlessCloudflareOAuthCredential,
  type FormlessCloudflareOAuthAdapter,
  type FormlessCloudflareOAuthTokenSet,
} from "./cloudflare-oauth.ts";
import type {
  FormlessInstanceAccountDiscoveryAdapter,
  FormlessInstanceDeploymentAccount,
} from "./instance-onboarding.ts";
import {
  alchemyProfileDeploymentCredential,
  resolveLocalWorkspaceDeploymentCredentialContext,
  type LocalWorkspaceDeploymentCredential,
} from "./instance-provider-credentials.ts";

const tempDirs: string[] = [];
const now = () => "2026-06-02T02:00:00.000Z";
const formlessOAuthToken = {
  accessToken: "formless-access-token",
  expiresAt: "2026-06-02T03:00:00.000Z",
  grantedScopes: [...FORMLESS_CLOUDFLARE_OAUTH_DEPLOY_SCOPES],
  refreshToken: "formless-refresh-token",
} satisfies FormlessCloudflareOAuthTokenSet;
const expiredFormlessOAuthToken = {
  ...formlessOAuthToken,
  expiresAt: "2026-06-02T01:59:00.000Z",
} satisfies FormlessCloudflareOAuthTokenSet;
const refreshedFormlessOAuthToken = {
  accessToken: "formless-refreshed-access-token",
  expiresAt: "2026-06-02T04:00:00.000Z",
  grantedScopes: [...FORMLESS_CLOUDFLARE_OAUTH_DEPLOY_SCOPES],
  refreshToken: "formless-refreshed-refresh-token",
} satisfies FormlessCloudflareOAuthTokenSet;
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

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { force: true, recursive: true })),
  );
});

describe("CLI provider credential context", () => {
  it("resolves configured OAuth account facts and bearer material from listed accounts", async () => {
    const workspaceRoot = await makeTempDir();
    const credential = oauthDeploymentCredential("default");
    const listedTokens: string[] = [];

    await writeFormlessCloudflareOAuthCredential({
      credential: createFormlessCloudflareOAuthCredential({
        id: "default",
        token: formlessOAuthToken,
        updatedAt: now(),
      }),
      workspaceRoot,
    });

    const oauth = {
      listAccounts: async (token) => {
        listedTokens.push(token.accessToken);
        return [personalAccount, teamAccount];
      },
      refresh: async () => {
        throw new Error("Fresh OAuth credential should not refresh.");
      },
    } satisfies Pick<FormlessCloudflareOAuthAdapter, "listAccounts" | "refresh">;

    const context = await resolveLocalWorkspaceDeploymentCredentialContext({
      accountDiscovery: unusedAlchemyAccountDiscovery,
      credential,
      credentialAccess: "mutable",
      deploymentConfig: deploymentConfigRecord({
        accountId: "acct_team",
        credentialRef: credential.credentialRef,
      }),
      now,
      oauth,
      workspaceRoot,
    });

    expect(listedTokens).toEqual(["formless-access-token"]);
    expect(context).toMatchObject({
      access: "mutable",
      account: teamAccount,
      credential,
      credentialProfile: null,
      credentialReference: {
        credentialId: "default",
        credentialRef: "formless-cloudflare-oauth:default",
        kind: "formless-cloudflare-oauth",
      },
      providerBearer: {
        credentialRef: "formless-cloudflare-oauth:default",
        kind: "cloudflare-api-token",
        providerFamily: "cloudflare",
        source: "formless-cloudflare-oauth",
        token: "formless-access-token",
      },
      providerFamily: "cloudflare",
    });
  });

  it("reports missing ignored OAuth credential state", async () => {
    const workspaceRoot = await makeTempDir();
    const credential = oauthDeploymentCredential("personal");

    await expect(
      resolveLocalWorkspaceDeploymentCredentialContext({
        accountDiscovery: unusedAlchemyAccountDiscovery,
        credential,
        credentialAccess: "mutable",
        deploymentConfig: deploymentConfigRecord({
          accountId: "acct_personal",
          credentialRef: credential.credentialRef,
        }),
        now,
        oauth: unusedOAuth,
        workspaceRoot,
      }),
    ).rejects.toThrow(
      'Formless Cloudflare OAuth credential "personal" was not found in ignored local secret state.',
    );
  });

  it("refreshes expired OAuth credentials before exposing bearer material", async () => {
    const workspaceRoot = await makeTempDir();
    const credential = oauthDeploymentCredential("personal");
    const refreshTokens: string[] = [];

    await writeFormlessCloudflareOAuthCredential({
      credential: createFormlessCloudflareOAuthCredential({
        id: "personal",
        selectedAccount: personalAccount,
        token: expiredFormlessOAuthToken,
        updatedAt: "2026-06-02T01:00:00.000Z",
      }),
      workspaceRoot,
    });

    const oauth = {
      listAccounts: async () => {
        throw new Error("Stored selected account should avoid account listing.");
      },
      refresh: async (input) => {
        refreshTokens.push(input.refreshToken);
        return refreshedFormlessOAuthToken;
      },
    } satisfies Pick<FormlessCloudflareOAuthAdapter, "listAccounts" | "refresh">;

    const context = await resolveLocalWorkspaceDeploymentCredentialContext({
      accountDiscovery: unusedAlchemyAccountDiscovery,
      credential,
      credentialAccess: "mutable",
      deploymentConfig: deploymentConfigRecord({
        accountId: "acct_personal",
        credentialRef: credential.credentialRef,
      }),
      now,
      oauth,
      workspaceRoot,
    });

    expect(refreshTokens).toEqual(["formless-refresh-token"]);
    expect(context.account).toEqual(personalAccount);
    expect(context.providerBearer).toMatchObject({
      source: "formless-cloudflare-oauth",
      token: "formless-refreshed-access-token",
    });
    await expect(
      readFormlessCloudflareOAuthCredential({ id: "personal", workspaceRoot }),
    ).resolves.toMatchObject({
      token: {
        accessToken: "formless-refreshed-access-token",
        refreshToken: "formless-refreshed-refresh-token",
      },
      updatedAt: now(),
    });
  });
  it("preserves Alchemy profile facts and manual token fallback", async () => {
    const discoveryInputs: Array<{
      credentialProfile: string | null;
    }> = [];
    const context = await resolveLocalWorkspaceDeploymentCredentialContext({
      accountDiscovery: {
        listAccounts: async (input) => {
          discoveryInputs.push(input);
          return [teamAccount];
        },
      },
      credential: alchemyProfileDeploymentCredential("team"),
      credentialAccess: "mutable",
      env: {
        CF_API_TOKEN: " cf-manual-token ",
        CLOUDFLARE_API_TOKEN: " ",
      },
      workspaceRoot: await makeTempDir(),
    });

    expect(discoveryInputs).toEqual([{ credentialProfile: "team" }]);
    expect(context).toMatchObject({
      access: "mutable",
      account: teamAccount,
      credentialProfile: "team",
      credentialReference: {
        credentialProfile: "team",
        kind: "alchemy-profile",
        profile: "team",
        profileRef: "alchemy-profile:team",
      },
      providerBearer: {
        envName: "CF_API_TOKEN",
        kind: "cloudflare-api-token",
        providerFamily: "cloudflare",
        source: "manual-cloudflare-api-token",
        token: "cf-manual-token",
      },
      providerFamily: "cloudflare",
    });
  });

  it("keeps read-only OAuth context display-safe without refreshing or exposing bearer material", async () => {
    const workspaceRoot = await makeTempDir();
    const credential = oauthDeploymentCredential("personal");

    await writeFormlessCloudflareOAuthCredential({
      credential: createFormlessCloudflareOAuthCredential({
        id: "personal",
        selectedAccount: personalAccount,
        token: expiredFormlessOAuthToken,
        updatedAt: "2026-06-02T01:00:00.000Z",
      }),
      workspaceRoot,
    });

    const context = await resolveLocalWorkspaceDeploymentCredentialContext({
      accountDiscovery: unusedAlchemyAccountDiscovery,
      credential,
      credentialAccess: "read-only",
      deploymentConfig: deploymentConfigRecord({
        accountId: "acct_personal",
        credentialRef: credential.credentialRef,
      }),
      env: { CLOUDFLARE_API_TOKEN: "manual-token" },
      now,
      oauth: unusedOAuth,
      workspaceRoot,
    });

    expect(context.account).toEqual(personalAccount);
    expect(context.providerBearer).toBeUndefined();
    await expect(
      readFormlessCloudflareOAuthCredential({ id: "personal", workspaceRoot }),
    ).resolves.toMatchObject({
      token: {
        accessToken: "formless-access-token",
        expiresAt: "2026-06-02T01:59:00.000Z",
        refreshToken: "formless-refresh-token",
      },
      updatedAt: "2026-06-02T01:00:00.000Z",
    });
  });
});

async function makeTempDir(): Promise<string> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "formless-provider-credentials-test-"));

  tempDirs.push(tempDir);
  return tempDir;
}
function oauthDeploymentCredential(id: string): Extract<
  LocalWorkspaceDeploymentCredential,
  {
    kind: "formless-cloudflare-oauth";
  }
> {
  return {
    credentialId: id,
    credentialRef: formatFormlessCloudflareOAuthCredentialRef(id),
    kind: "formless-cloudflare-oauth",
  };
}

function deploymentConfigRecord(input: { accountId: string; credentialRef: string }): StoredRecord {
  return {
    createdAt: now(),
    entity: "deployment-config",
    id: "instance.primary",
    updatedAt: now(),
    values: {
      accountId: input.accountId,
      credentialRef: input.credentialRef,
      enabled: true,
      providerFamily: "cloudflare",
      targetId: "instance.primary",
      targetKind: "instance",
      targetUrl: "https://personal-sites.personal.workers.dev",
      workerName: "personal-sites",
    },
  };
}

const unusedAlchemyAccountDiscovery = {
  listAccounts: async () => {
    throw new Error("Alchemy account discovery should not run.");
  },
} satisfies FormlessInstanceAccountDiscoveryAdapter;

const unusedOAuth = {
  listAccounts: async () => {
    throw new Error("Cloudflare OAuth account listing should not run.");
  },
  refresh: async () => {
    throw new Error("Cloudflare OAuth refresh should not run.");
  },
} satisfies Pick<FormlessCloudflareOAuthAdapter, "listAccounts" | "refresh">;
