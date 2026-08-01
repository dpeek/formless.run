import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { InstanceWorkspaceTarget as FormlessInstanceWorkspaceTarget } from "@dpeek/formless-workspace";
import {
  INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME as FORMLESS_INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME,
  INSTANCE_WORKSPACE_SECRET_STATE_FILE as FORMLESS_INSTANCE_WORKSPACE_SECRET_STATE_FILE,
  ensureInstanceWorkspaceSecretStateIgnored as ensureFormlessInstanceWorkspaceSecretStateIgnored,
  formatInstanceWorkspaceSecretState as formatFormlessInstanceWorkspaceSecretState,
  instanceWorkspaceSecretStatePath as formlessInstanceWorkspaceSecretStatePath,
  readInstanceWorkspaceProgramStorageSnapshot,
  readInstanceWorkspaceSecretState as readFormlessInstanceWorkspaceSecretState,
  resolveInstanceWorkspaceAdminToken as resolveFormlessInstanceWorkspaceAdminToken,
  writeInstanceWorkspaceSecretState as writeFormlessInstanceWorkspaceSecretState,
} from "../program/workspace.ts";
import { packageExecCommand } from "./package-commands.ts";
import { readWorkspaceConfig, workspaceRootForInput } from "./instance-workspace-foundation.ts";
import {
  rotateCommandEnv,
  selectLocalWorkspaceDeploymentSource,
} from "./instance-provider-credentials.ts";
import {
  formlessCliSelectWorkspaceWorkerName,
  formlessCliTargetFromDeploymentConfig,
  resolveFormlessCliWorkspaceTarget,
} from "./instance-target-context.ts";

export type AdoptFormlessInstanceWorkspaceAdminTokenInput = {
  adminToken?: string | null;
  targetAlias?: string | null;
  workspacePath?: string;
};

export type AdoptFormlessInstanceWorkspaceAdminTokenDependencies = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
};

export type AdoptFormlessInstanceWorkspaceAdminTokenResult = {
  secretPath: string;
  selectedTarget?: FormlessInstanceWorkspaceTarget;
  workspaceRoot: string;
};

export type RotateFormlessInstanceWorkspaceAdminTokenInput =
  AdoptFormlessInstanceWorkspaceAdminTokenInput;

export type RotateFormlessInstanceWorkspaceAdminTokenDependencies =
  AdoptFormlessInstanceWorkspaceAdminTokenDependencies & {
    packageRoot: string;
    randomToken: () => string;
    runCommand: (
      command: string,
      args: string[],
      options: { cwd: string; env?: NodeJS.ProcessEnv },
    ) => Promise<void>;
  };

export type RotateFormlessInstanceWorkspaceAdminTokenResult =
  AdoptFormlessInstanceWorkspaceAdminTokenResult & {
    workerName: string;
  };

export async function adoptFormlessInstanceWorkspaceAdminToken(
  input: AdoptFormlessInstanceWorkspaceAdminTokenInput,
  dependencies: AdoptFormlessInstanceWorkspaceAdminTokenDependencies,
): Promise<AdoptFormlessInstanceWorkspaceAdminTokenResult> {
  const workspaceRoot = workspaceRootForInput(dependencies.cwd, input.workspacePath);
  const { config } = await readWorkspaceConfig(workspaceRoot);
  const selectedTarget = await resolveFormlessCliWorkspaceTarget({
    commandName: "token adopt",
    config,
    required: false,
    targetAlias: input.targetAlias,
    workspaceRoot,
  });
  const existingSecretState = await readFormlessInstanceWorkspaceSecretState(workspaceRoot);
  const adminToken = resolveFormlessInstanceWorkspaceAdminToken({
    env: dependencies.env,
    explicitAdminToken: input.adminToken,
    secretState: existingSecretState,
  });

  if (!adminToken) {
    throw new Error(missingAdminTokenMessage("adopt"));
  }

  const write = await writeFormlessInstanceWorkspaceSecretState(workspaceRoot, { adminToken });

  await ensureFormlessInstanceWorkspaceSecretStateIgnored(workspaceRoot);

  return {
    secretPath: write.path,
    ...(selectedTarget === undefined ? {} : { selectedTarget }),
    workspaceRoot,
  };
}

export async function rotateFormlessInstanceWorkspaceAdminToken(
  input: RotateFormlessInstanceWorkspaceAdminTokenInput,
  dependencies: RotateFormlessInstanceWorkspaceAdminTokenDependencies,
): Promise<RotateFormlessInstanceWorkspaceAdminTokenResult> {
  const workspaceRoot = workspaceRootForInput(dependencies.cwd, input.workspacePath);
  const { config } = await readWorkspaceConfig(workspaceRoot);
  const controlPlane = await readInstanceWorkspaceProgramStorageSnapshot({
    manifest: config,
    workspaceRoot,
  });
  const deploymentSource = selectLocalWorkspaceDeploymentSource(controlPlane, input.targetAlias, {
    commandName: "token rotate",
  });
  const selectedTarget =
    deploymentSource.deploymentConfig === undefined
      ? undefined
      : formlessCliTargetFromDeploymentConfig(deploymentSource.deploymentConfig, "token rotate");
  const workerName = formlessCliSelectWorkspaceWorkerName(
    deploymentSource.deploymentConfig,
    selectedTarget,
  );
  const adminToken =
    resolveFormlessInstanceWorkspaceAdminToken({
      env: dependencies.env,
      explicitAdminToken: input.adminToken,
      secretState: {},
    }) ?? requiredGeneratedToken(dependencies.randomToken());
  const secretPath = formlessInstanceWorkspaceSecretStatePath(workspaceRoot);
  const temporarySecretPath = path.join(
    path.dirname(secretPath),
    `${FORMLESS_INSTANCE_WORKSPACE_SECRET_STATE_FILE}.next`,
  );
  const secretContents = formatFormlessInstanceWorkspaceSecretState({ adminToken });

  await mkdir(path.dirname(secretPath), { recursive: true });
  await writeFile(temporarySecretPath, secretContents);

  try {
    const command = packageExecCommand(
      "wrangler",
      ["secret", "bulk", temporarySecretPath, "--name", workerName],
      dependencies.env ?? {},
    );

    await dependencies.runCommand(command.command, command.args, {
      cwd: dependencies.packageRoot,
      env: rotateCommandEnv(dependencies.env, deploymentSource.deploymentConfig),
    });
    await writeFormlessInstanceWorkspaceSecretState(workspaceRoot, { adminToken });
    await ensureFormlessInstanceWorkspaceSecretStateIgnored(workspaceRoot);
  } finally {
    await rm(temporarySecretPath, { force: true });
  }

  return {
    secretPath,
    ...(selectedTarget === undefined ? {} : { selectedTarget }),
    workerName,
    workspaceRoot,
  };
}

function requiredGeneratedToken(value: string): string {
  const token = value.trim();

  if (token === "") {
    throw new Error("Generated Formless admin token must be a non-empty string.");
  }

  return token;
}

function missingAdminTokenMessage(action: "adopt" | "deploy" | "push"): string {
  return [
    action === "adopt"
      ? "Formless instance token adopt requires an admin token."
      : action === "push"
        ? "Formless push requires an admin token."
        : "Formless instance deploy requires an admin token.",
    action === "adopt"
      ? `Cloudflare Worker secrets cannot be read back; pass --admin-token or set ${FORMLESS_INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME}.`
      : `Cloudflare Worker secrets cannot be read back; run \`formless token adopt\`, run \`formless token rotate\`, or set ${FORMLESS_INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME}.`,
  ].join(" ");
}
