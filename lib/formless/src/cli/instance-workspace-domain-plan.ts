import type { StoredRecord } from "@dpeek/formless-storage";
import type { InstanceWorkspaceTarget as FormlessInstanceWorkspaceTarget } from "@dpeek/formless-workspace";
import { readInstanceWorkspaceProgramStorageSnapshot } from "../program/workspace.ts";
import {
  planCloudflareWorkerDomainPreflight,
  type CloudflareDomainClient,
  type CloudflareDomainPreflightPlan,
  type CloudflareDomainPreflightPolicy,
} from "./cloudflare-domain-client.ts";
import { selectLocalWorkspaceDeploymentSource } from "./instance-provider-credentials.ts";
import {
  formlessCliSelectWorkspaceWorkerName,
  requireFormlessCliTargetContext,
} from "./instance-target-context.ts";
import { stringRecordValue } from "./instance-workspace-control-plane.ts";
import {
  compareWorkspaceDomainIntentToLive,
  readLiveWorkspaceDomainIntents,
  selectDomainIntentsForHost,
  workspaceDomainIntentsFromSource,
  type FormlessInstanceWorkspaceDomainDesiredDrift,
} from "./instance-workspace-source-sync.ts";

export type PlanFormlessInstanceWorkspaceDomainsInput = {
  host?: string | null;
  policy?: CloudflareDomainPreflightPolicy;
  targetAlias?: string | null;
  workspacePath?: string;
};

export type PlanFormlessInstanceWorkspaceDomainsDependencies = {
  cloudflareDomainClient: CloudflareDomainClient;
  cwd: string;
  env?: NodeJS.ProcessEnv;
  fetch: typeof fetch;
};

export type PlanFormlessInstanceWorkspaceDomainsResult = {
  accountId: string;
  desired: {
    drift: FormlessInstanceWorkspaceDomainDesiredDrift[];
    liveEnabledCount: number;
    source: "live" | "workspace";
    workspaceCount: number;
  };
  preflight: CloudflareDomainPreflightPlan;
  selectedTarget: FormlessInstanceWorkspaceTarget;
  workerName: string;
  workspaceRoot: string;
};

export async function planFormlessInstanceWorkspaceDomains(
  input: PlanFormlessInstanceWorkspaceDomainsInput,
  dependencies: PlanFormlessInstanceWorkspaceDomainsDependencies,
): Promise<PlanFormlessInstanceWorkspaceDomainsResult> {
  const context = await requireFormlessCliTargetContext(
    {
      commandName: "domains plan",
      cwd: dependencies.cwd,
      targetAlias: input.targetAlias,
      workspacePath: input.workspacePath,
    },
    { env: dependencies.env },
  );
  const { adminToken, config, selectedTarget, workspaceRoot } = context;
  const controlPlane = await readInstanceWorkspaceProgramStorageSnapshot({
    manifest: config,
    workspaceRoot,
  });
  const deploymentSource = selectLocalWorkspaceDeploymentSource(controlPlane, input.targetAlias, {
    commandName: "domains plan",
  });

  if (deploymentSource.deploymentConfig === undefined) {
    throw new Error(
      "Formless instance domains plan requires an enabled instance deployment-config record.",
    );
  }

  const accountId = requireWorkspaceDeployAccountId(deploymentSource.deploymentConfig);
  const workerName = formlessCliSelectWorkspaceWorkerName(
    deploymentSource.deploymentConfig,
    selectedTarget,
  );
  const workspaceDomains = workspaceDomainIntentsFromSource(controlPlane);
  const liveDomains = await readLiveWorkspaceDomainIntents(
    { adminToken, target: selectedTarget },
    dependencies,
  );
  const source = workspaceDomains.length > 0 ? "workspace" : "live";
  const enabledSourceDomains = (source === "workspace" ? workspaceDomains : liveDomains).filter(
    (domain) => domain.enabled,
  );
  const intents = selectDomainIntentsForHost({
    host: input.host,
    intents: enabledSourceDomains,
  });
  const preflight = await planCloudflareWorkerDomainPreflight({
    accountId,
    client: dependencies.cloudflareDomainClient,
    intents,
    policy: input.policy ?? "create-only",
    workerName,
  });

  return {
    accountId,
    desired: {
      drift:
        workspaceDomains.length === 0
          ? []
          : compareWorkspaceDomainIntentToLive(workspaceDomains, liveDomains),
      liveEnabledCount: liveDomains.filter((domain) => domain.enabled).length,
      source,
      workspaceCount: workspaceDomains.length,
    },
    preflight,
    selectedTarget,
    workerName,
    workspaceRoot,
  };
}

function requireWorkspaceDeployAccountId(deploymentConfig: StoredRecord | undefined): string {
  const accountId = stringRecordValue(deploymentConfig, "accountId")?.trim();

  if (!accountId) {
    throw new Error("Formless instance domains plan requires deployment-config.accountId.");
  }

  return accountId;
}
