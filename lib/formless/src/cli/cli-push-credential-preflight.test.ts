import { describe, expect, it } from "vite-plus/test";

import type { FormlessCloudflareOAuthAccount } from "./cloudflare-oauth.ts";
import {
  runFormlessCliWorkspacePushCredentialPreflight,
  type FormlessCliCloudflareOAuthAccountSelectionInput,
  type FormlessCliWorkspacePushCredentialPreflightCommand,
  type FormlessCliWorkspacePushCredentialPreflightDependencies,
} from "./cli-push-credential-preflight.ts";
import type {
  AlchemyCloudflareCredentialSetupInput,
  FormlessCloudflareCredentialSetupDependencies,
  FormlessCloudflareCredentialSetupCompletedResult,
  FormlessCloudflareCredentialSetupResult,
} from "./instance-workspace-credential-setup.ts";
import type { PushFormlessInstanceWorkspaceCloudflareOAuthPreflightResult } from "./instance-workspace-deployment.ts";

describe("CLI push credential preflight", () => {
  it("skips credential onboarding for push dry-runs", async () => {
    const calls: string[] = [];
    const { dependencies, logs, openedUrls } = preflightDependencies({
      preflightPushCloudflareOAuthCredential: async () => {
        calls.push("preflight");

        return credentialPreflight();
      },
      setupCloudflareCredentialsWithFormlessOAuth: async () => {
        calls.push("setup");

        return readySetup();
      },
    });

    await runFormlessCliWorkspacePushCredentialPreflight(
      parsedPushCommand({ dryRun: true }),
      dependencies,
    );

    expect(calls).toEqual([]);
    expect(logs).toEqual([]);
    expect(openedUrls).toEqual([]);
  });

  it("opens Cloudflare authorization when missing credentials need setup", async () => {
    const authorizationUrl = "https://dash.cloudflare.com/oauth2/auth?client_id=formless";
    const preflightInputs: Array<{
      cwd: string;
      targetAlias?: string | null;
      workspacePath?: string;
    }> = [];
    const setupInputs: AlchemyCloudflareCredentialSetupInput[] = [];
    const setupDependencies: FormlessCloudflareCredentialSetupDependencies[] = [];
    const { dependencies, logs, openedUrls } = preflightDependencies({
      preflightPushCloudflareOAuthCredential: async (input, dependencyInput) => {
        preflightInputs.push({ ...input, cwd: dependencyInput.cwd });

        return credentialPreflight({
          credentialId: "staging",
          deploymentConfigId: "staging",
          selectedTarget: { alias: "staging", url: "https://staging.example.test" },
          workspaceRoot: "/workspace/site",
        });
      },
      selectCloudflareAccount: async () => {
        throw new Error("Single account credential preflight should not prompt.");
      },
      setupCloudflareCredentialsWithFormlessOAuth: async (input, dependencyInput) => {
        setupInputs.push(input);
        setupDependencies.push(dependencyInput);

        return authorizationSetup(authorizationUrl, readySetup());
      },
    });

    await runFormlessCliWorkspacePushCredentialPreflight(
      parsedPushCommand({ targetAlias: "staging", workspacePath: "/workspace/site" }),
      dependencies,
    );

    expect(preflightInputs).toEqual([
      {
        cwd: "/repo",
        targetAlias: "staging",
        workspacePath: "/workspace/site",
      },
    ]);
    expect(setupInputs).toEqual([
      {
        deploymentConfigId: "staging",
        profileLabel: "staging",
        provider: "cloudflare",
        targetAlias: "staging",
        workspaceRoot: "/workspace/site",
      },
    ]);
    expect(setupDependencies).toHaveLength(1);
    expect(setupDependencies[0]?.now()).toBe("2026-06-25T00:00:00.000Z");
    expect(logs).toEqual([`Cloudflare authorization URL: ${authorizationUrl}`]);
    expect(openedUrls).toEqual([authorizationUrl]);
  });

  it("bypasses setup when a usable local Formless OAuth credential already exists", async () => {
    const setupInputs: AlchemyCloudflareCredentialSetupInput[] = [];
    const { dependencies, logs, openedUrls } = preflightDependencies({
      preflightPushCloudflareOAuthCredential: async () =>
        credentialPreflight({
          credentialId: "default",
          credentialRef: "formless-cloudflare-oauth:default",
          needsSetup: false,
        }),
      setupCloudflareCredentialsWithFormlessOAuth: async (input) => {
        setupInputs.push(input);

        throw new Error("Existing credential preflight should not start setup.");
      },
    });

    await runFormlessCliWorkspacePushCredentialPreflight(parsedPushCommand(), dependencies);

    expect(setupInputs).toEqual([]);
    expect(logs).toEqual([]);
    expect(openedUrls).toEqual([]);
  });

  it("prompts for display-safe account selection when OAuth sees multiple accounts", async () => {
    const authorizationUrl = "https://dash.cloudflare.com/oauth2/auth?client_id=formless";
    const accounts = cloudflareAccounts();
    const setupInputs: AlchemyCloudflareCredentialSetupInput[] = [];
    const selectionInputs: FormlessCliCloudflareOAuthAccountSelectionInput[] = [];
    const { dependencies, logs, openedUrls } = preflightDependencies({
      preflightPushCloudflareOAuthCredential: async () => credentialPreflight(),
      selectCloudflareAccount: async (input) => {
        selectionInputs.push(input);

        return "acct_team";
      },
      setupCloudflareCredentialsWithFormlessOAuth: async (input) => {
        setupInputs.push(input);

        return input.accountId === undefined || input.accountId === null
          ? authorizationSetup(
              authorizationUrl,
              accountSelectionSetup(accounts, "formless-cloudflare-oauth:default"),
            )
          : readySetup({ selectedAccountId: input.accountId });
      },
    });

    await runFormlessCliWorkspacePushCredentialPreflight(parsedPushCommand(), dependencies);

    expect(openedUrls).toEqual([authorizationUrl]);
    expect(selectionInputs).toEqual([
      {
        accounts,
        credentialRef: "formless-cloudflare-oauth:default",
        targetAlias: "instance.primary",
      },
    ]);
    expect(setupInputs.map((input) => input.accountId ?? null)).toEqual([null, "acct_team"]);
    expect(logs).toEqual([
      `Cloudflare authorization URL: ${authorizationUrl}`,
      "Cloudflare account selection required:",
      "  1. id=acct_personal name=Personal workers.dev=personal.workers.dev",
      "  2. id=acct_team name=Team workers.dev=team.workers.dev",
    ]);
  });

  it("throws display-safe guidance for non-interactive multiple-account selection", async () => {
    const authorizationUrl = "https://dash.cloudflare.com/oauth2/auth?client_id=formless";
    const accounts = cloudflareAccounts();
    const setupInputs: AlchemyCloudflareCredentialSetupInput[] = [];
    const { dependencies, logs, openedUrls } = preflightDependencies({
      preflightPushCloudflareOAuthCredential: async () => credentialPreflight(),
      selectCloudflareAccount: async () => null,
      setupCloudflareCredentialsWithFormlessOAuth: async (input) => {
        setupInputs.push(input);

        return authorizationSetup(
          authorizationUrl,
          accountSelectionSetup(accounts, "formless-cloudflare-oauth:default"),
        );
      },
    });

    let caught: unknown;
    try {
      await runFormlessCliWorkspacePushCredentialPreflight(parsedPushCommand(), dependencies);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe(
      [
        "Multiple Cloudflare accounts were found for the Formless OAuth credential.",
        "Run `formless push` from an interactive terminal and select one account before provider mutation.",
        "Target: instance.primary.",
        "Credential: formless-cloudflare-oauth:default.",
        "Available accounts:",
        "  1. id=acct_personal name=Personal workers.dev=personal.workers.dev",
        "  2. id=acct_team name=Team workers.dev=team.workers.dev",
      ].join("\n"),
    );
    expect(setupInputs).toHaveLength(1);
    expect(logs).toEqual([
      `Cloudflare authorization URL: ${authorizationUrl}`,
      "Cloudflare account selection required:",
      "  1. id=acct_personal name=Personal workers.dev=personal.workers.dev",
      "  2. id=acct_team name=Team workers.dev=team.workers.dev",
    ]);
    expect(openedUrls).toEqual([authorizationUrl]);
  });
});

function parsedPushCommand(
  overrides: Partial<FormlessCliWorkspacePushCredentialPreflightCommand> = {},
): FormlessCliWorkspacePushCredentialPreflightCommand {
  return {
    dryRun: false,
    force: false,
    kind: "workspacePush",
    targetAlias: "instance.primary",
    workspacePath: "/workspace/site",
    ...overrides,
  };
}

function preflightDependencies(
  overrides: Partial<FormlessCliWorkspacePushCredentialPreflightDependencies> = {},
): {
  dependencies: FormlessCliWorkspacePushCredentialPreflightDependencies;
  logs: string[];
  openedUrls: string[];
} {
  const logs: string[] = [];
  const openedUrls: string[] = [];
  const dependencies: FormlessCliWorkspacePushCredentialPreflightDependencies = {
    cwd: "/repo",
    log: (message) => {
      logs.push(message);
    },
    now: () => "2026-06-25T00:00:00.000Z",
    openBrowser: async (url) => {
      openedUrls.push(url);
    },
    ...overrides,
  };

  return { dependencies, logs, openedUrls };
}

function credentialPreflight(
  overrides: Partial<PushFormlessInstanceWorkspaceCloudflareOAuthPreflightResult> = {},
): PushFormlessInstanceWorkspaceCloudflareOAuthPreflightResult {
  return {
    credentialId: "default",
    deploymentConfigId: "instance.primary",
    needsSetup: true,
    selectedTarget: {
      alias: "instance.primary",
      url: "https://personal.example.test",
    },
    workspaceRoot: "/workspace/site",
    ...overrides,
  };
}

function authorizationSetup(
  authorizationUrl: string,
  continued: FormlessCloudflareCredentialSetupCompletedResult,
): FormlessCloudflareCredentialSetupResult {
  return {
    at: "2026-06-25T00:00:00.000Z",
    authorizationUrl,
    clientId: "formless-client-id",
    continue: async () => continued,
    credentialRef: "formless-cloudflare-oauth:default",
    kind: "authorization-waiting",
    profileLabel: "default",
    provider: "cloudflare",
    requestedScopes: ["account.read"],
    scopeSet: "formless-cloudflare-deploy-oauth",
  };
}
function readySetup(
  input: {
    selectedAccountId?: string;
  } = {},
): FormlessCloudflareCredentialSetupCompletedResult {
  return {
    account: {
      id: input.selectedAccountId ?? "acct_personal",
      workersDevSubdomain: "personal",
    },
    accountCount: 1,
    credentialRef: "formless-cloudflare-oauth:default",
    deploymentConfig: {
      accountId: input.selectedAccountId ?? "acct_personal",
      targetId: "instance.primary",
      targetUrl: "https://personal.example.test",
      workerName: "personal",
    },
    kind: "ready",
    provider: "cloudflare",
    source: "stored-credential",
  };
}

function accountSelectionSetup(
  accounts: readonly FormlessCloudflareOAuthAccount[],
  credentialRef: string,
): FormlessCloudflareCredentialSetupCompletedResult {
  return {
    accounts: accounts.map((account) => ({ ...account })),
    credentialRef,
    kind: "account-selection-required",
    provider: "cloudflare",
  };
}

function cloudflareAccounts(): FormlessCloudflareOAuthAccount[] {
  return [
    {
      id: "acct_personal",
      name: "Personal",
      workersDevSubdomain: "personal",
    },
    {
      id: "acct_team",
      name: "Team",
      workersDevSubdomain: "team",
    },
  ];
}
