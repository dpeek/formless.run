import { randomBytes } from "node:crypto";

import {
  LOCAL_SESSION_BOOTSTRAP_API_PATH,
  LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV,
  WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV,
  WORKSPACE_GATEWAY_CSRF_TOKEN_ENV,
  WORKSPACE_GATEWAY_PROXY_TOKEN_ENV,
  WORKSPACE_GATEWAY_ROOT_ENV,
  WORKSPACE_GATEWAY_SIDECAR_URL_ENV,
} from "@dpeek/formless-gateway";
import {
  startWorkspaceGatewaySidecar as startPackageWorkspaceGatewaySidecar,
  type WorkspaceGatewaySidecar,
} from "@dpeek/formless-gateway/sidecar";
import type { ResolvedFormlessConfig as FormlessResolvedConfig } from "@dpeek/formless-workspace";
import {
  INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME as FORMLESS_INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME,
  INSTANCE_WORKSPACE_OWNER_SESSION_SECRET_ENV_NAME as FORMLESS_INSTANCE_WORKSPACE_OWNER_SESSION_SECRET_ENV_NAME,
  type InstanceWorkspaceLocalDevSecretState as FormlessInstanceWorkspaceLocalDevSecretState,
} from "@dpeek/formless-workspace/node";
import { FORMLESS_PROGRAM_ARTIFACT_PATH_ENV_NAME } from "../program/artifact.ts";
import {
  FORMLESS_TURNSTILE_ALWAYS_PASS_SECRET_KEY,
  FORMLESS_TURNSTILE_ALWAYS_PASS_SITE_KEY,
  FORMLESS_TURNSTILE_SECRET_KEY_ENV_NAME,
  FORMLESS_TURNSTILE_SITE_KEY_ENV_NAME,
} from "../shared/turnstile-config.ts";
import {
  FORMLESS_SITE_PROJECT_ROOT_ENV_NAME,
  FORMLESS_WORKSPACE_RUNTIME_EXTENSIONS_ENV_NAME,
} from "../shared/workspace-runtime-extensions.ts";
import { formlessInstanceWorkspaceWranglerPersistPath } from "./instance-workspace-foundation.ts";
import { FORMLESS_WORKSPACE_PROGRAM_RUNTIME_ENV_NAME } from "./program-runtime-bundler.ts";
import {
  createWorkspaceGatewayHandlers,
  type StartWorkspaceGatewaySidecarDependencies,
} from "./workspace-gateway-runtime.ts";

export type FormlessInstanceWorkspaceGatewayLifecycleSidecarEnv = {
  endpoint: string;
  proxyToken: string;
};

export type FormlessInstanceWorkspaceGatewayLifecycleSidecarStarter = (
  input: {
    env?: NodeJS.ProcessEnv;
    workspaceRoot: string;
  },
  dependencies: StartWorkspaceGatewaySidecarDependencies,
) => Promise<WorkspaceGatewaySidecar>;

export type FormlessInstanceWorkspaceGatewayLifecycleDependencies =
  StartWorkspaceGatewaySidecarDependencies & {
    startWorkspaceGatewaySidecar?: FormlessInstanceWorkspaceGatewayLifecycleSidecarStarter;
  };

export type FormlessInstanceWorkspaceGatewayLifecycle = {
  childRuntimeEnv: (
    input: FormlessInstanceWorkspaceGatewayLifecycleChildRuntimeEnvInput,
  ) => NodeJS.ProcessEnv;
  close: () => Promise<void>;
  localSessionBootstrapToken: string;
  sessionEntry: (
    input: FormlessInstanceWorkspaceGatewayLifecycleSessionEntryInput,
  ) => FormlessInstanceWorkspaceDevSessionEntry;
  sidecar: WorkspaceGatewaySidecar;
};

export type FormlessInstanceWorkspaceDevSessionEntry = {
  localSessionBootstrapUrl: string;
};

export type FormlessInstanceWorkspaceGatewayLifecycleChildRuntimeEnvInput = {
  config: FormlessResolvedConfig;
  env?: NodeJS.ProcessEnv;
  localDevSecrets: FormlessInstanceWorkspaceLocalDevSecretState;
  workspaceProgramArtifactPath: string;
  workspaceProgramRuntime: string;
  workspaceRoot: string;
  workspaceRuntimeExtensions?: string;
};

export type FormlessInstanceWorkspaceGatewayLifecycleSessionEntryInput = {
  childOrigin: string;
  env?: NodeJS.ProcessEnv;
  reset: boolean;
};

export type FormlessInstanceWorkspaceDevEnvOptions = {
  localDevSecrets?: FormlessInstanceWorkspaceLocalDevSecretState;
  localSessionBootstrapToken?: string;
  workspaceProgramArtifactPath?: string;
  workspaceProgramRuntime?: string;
  workspaceRuntimeExtensions?: string;
};

export async function startFormlessInstanceWorkspaceGatewayLifecycle(
  input: { workspaceRoot: string },
  dependencies: FormlessInstanceWorkspaceGatewayLifecycleDependencies,
): Promise<FormlessInstanceWorkspaceGatewayLifecycle> {
  const localSessionBootstrapToken =
    createFormlessInstanceWorkspaceGatewayLifecycleSecret(dependencies);
  const proxyToken = createFormlessInstanceWorkspaceGatewayLifecycleSecret(dependencies);
  const sidecar = await startFormlessInstanceWorkspaceGatewaySidecar(
    input,
    dependencies,
    proxyToken,
  );

  return {
    childRuntimeEnv: (envInput) =>
      formlessInstanceWorkspaceDevEnv(
        envInput.env ?? {},
        envInput.workspaceRoot,
        envInput.config,
        sidecar,
        {
          localDevSecrets: envInput.localDevSecrets,
          localSessionBootstrapToken,
          workspaceProgramArtifactPath: envInput.workspaceProgramArtifactPath,
          workspaceProgramRuntime: envInput.workspaceProgramRuntime,
          workspaceRuntimeExtensions: envInput.workspaceRuntimeExtensions,
        },
      ),
    close: () => sidecar.close(),
    localSessionBootstrapToken,
    sessionEntry: (entryInput) =>
      formlessInstanceWorkspaceGatewaySessionEntry({
        childOrigin: entryInput.childOrigin,
        env: entryInput.env,
        reset: entryInput.reset,
        token: localSessionBootstrapToken,
      }),
    sidecar,
  };
}

export function formlessInstanceWorkspaceDevEnv(
  env: NodeJS.ProcessEnv,
  workspaceRoot: string,
  config: FormlessResolvedConfig,
  sidecar?: FormlessInstanceWorkspaceGatewayLifecycleSidecarEnv | null,
  options: FormlessInstanceWorkspaceDevEnvOptions = {},
): NodeJS.ProcessEnv {
  const bootstrapToken = randomWorkspaceGatewayLifecycleToken();
  const csrfToken = randomWorkspaceGatewayLifecycleToken();
  const localDevSecrets = options.localDevSecrets ?? {
    adminToken:
      env.FORMLESS_ADMIN_TOKEN && env.FORMLESS_ADMIN_TOKEN.trim() !== ""
        ? env.FORMLESS_ADMIN_TOKEN
        : randomWorkspaceGatewayLifecycleToken(),
    ownerSessionSecret:
      env.FORMLESS_OWNER_SESSION_SECRET && env.FORMLESS_OWNER_SESSION_SECRET.trim() !== ""
        ? env.FORMLESS_OWNER_SESSION_SECRET
        : randomWorkspaceGatewayLifecycleToken(),
  };
  const turnstileSecretKey = env[FORMLESS_TURNSTILE_SECRET_KEY_ENV_NAME];
  const turnstileSiteKey = env[FORMLESS_TURNSTILE_SITE_KEY_ENV_NAME];
  const nextEnv: NodeJS.ProcessEnv = {
    ...env,
    [FORMLESS_INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME]: localDevSecrets.adminToken,
    [FORMLESS_INSTANCE_WORKSPACE_OWNER_SESSION_SECRET_ENV_NAME]: localDevSecrets.ownerSessionSecret,
    [FORMLESS_TURNSTILE_SECRET_KEY_ENV_NAME]:
      turnstileSecretKey && turnstileSecretKey.trim() !== ""
        ? turnstileSecretKey
        : FORMLESS_TURNSTILE_ALWAYS_PASS_SECRET_KEY,
    [FORMLESS_TURNSTILE_SITE_KEY_ENV_NAME]:
      turnstileSiteKey && turnstileSiteKey.trim() !== ""
        ? turnstileSiteKey
        : FORMLESS_TURNSTILE_ALWAYS_PASS_SITE_KEY,
    [LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV]:
      options.localSessionBootstrapToken ?? randomWorkspaceGatewayLifecycleToken(),
    [FORMLESS_SITE_PROJECT_ROOT_ENV_NAME]: workspaceRoot,
    FORMLESS_RUNTIME_PROFILE: "instance",
    [WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV]: bootstrapToken,
    [WORKSPACE_GATEWAY_CSRF_TOKEN_ENV]: csrfToken,
    FORMLESS_WRANGLER_PERSIST: formlessInstanceWorkspaceWranglerPersistPath(workspaceRoot, config),
    VITE_FORMLESS_WORKSPACE_GATEWAY_API: "/api/formless/workspace",
    VITE_FORMLESS_WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN: bootstrapToken,
    VITE_FORMLESS_RUNTIME_PROFILE: "instance",
  };

  if (sidecar) {
    nextEnv[WORKSPACE_GATEWAY_SIDECAR_URL_ENV] = sidecar.endpoint;
    nextEnv[WORKSPACE_GATEWAY_PROXY_TOKEN_ENV] = sidecar.proxyToken;
  } else {
    delete nextEnv[WORKSPACE_GATEWAY_SIDECAR_URL_ENV];
    delete nextEnv[WORKSPACE_GATEWAY_PROXY_TOKEN_ENV];
  }

  if (options.workspaceProgramArtifactPath) {
    nextEnv[FORMLESS_PROGRAM_ARTIFACT_PATH_ENV_NAME] = options.workspaceProgramArtifactPath;
  } else {
    delete nextEnv[FORMLESS_PROGRAM_ARTIFACT_PATH_ENV_NAME];
  }

  if (options.workspaceProgramRuntime) {
    nextEnv[FORMLESS_WORKSPACE_PROGRAM_RUNTIME_ENV_NAME] = options.workspaceProgramRuntime;
  } else {
    delete nextEnv[FORMLESS_WORKSPACE_PROGRAM_RUNTIME_ENV_NAME];
  }

  if (options.workspaceRuntimeExtensions) {
    nextEnv[FORMLESS_WORKSPACE_RUNTIME_EXTENSIONS_ENV_NAME] = options.workspaceRuntimeExtensions;
  } else {
    delete nextEnv[FORMLESS_WORKSPACE_RUNTIME_EXTENSIONS_ENV_NAME];
  }

  delete nextEnv.FORMLESS_LOCAL_WORKSPACE_GATEWAY;
  delete nextEnv[WORKSPACE_GATEWAY_ROOT_ENV];
  delete nextEnv.VITE_FORMLESS_ADMIN_TOKEN;
  delete nextEnv.VITE_FORMLESS_LOCAL_PUBLISH_BROKER_TOKEN;
  delete nextEnv.VITE_FORMLESS_LOCAL_PUBLISH_BROKER_URL;
  delete nextEnv.VITE_FORMLESS_LOCAL_SESSION_BOOTSTRAP_TOKEN;
  delete nextEnv.VITE_FORMLESS_OWNER_SESSION_SECRET;
  delete nextEnv.VITE_FORMLESS_WORKSPACE_GATEWAY_ROOT;
  delete nextEnv.VITE_FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN;
  delete nextEnv.VITE_FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL;

  return nextEnv;
}

export function formlessInstanceWorkspaceGatewaySessionEntry(input: {
  childOrigin: string;
  env?: NodeJS.ProcessEnv;
  reset: boolean;
  token: string;
}): FormlessInstanceWorkspaceDevSessionEntry {
  return {
    localSessionBootstrapUrl: formlessInstanceWorkspaceLocalSessionBootstrapUrl(
      browserFacingFormlessInstanceWorkspaceLocalDevOrigin(input.childOrigin, input.env),
      input.token,
      { reset: input.reset },
    ),
  };
}

export function browserFacingFormlessInstanceWorkspaceLocalDevOrigin(
  childOrigin: string,
  env: NodeJS.ProcessEnv | undefined,
): string {
  const proxyOrigin = env?.PORTLESS_URL?.trim();

  if (!proxyOrigin) {
    return childOrigin;
  }

  try {
    const url = new URL(proxyOrigin);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("must use http or https");
    }

    return url.origin;
  } catch {
    throw new Error(`PORTLESS_URL is invalid: ${proxyOrigin}`);
  }
}

async function startFormlessInstanceWorkspaceGatewaySidecar(
  input: { workspaceRoot: string },
  dependencies: FormlessInstanceWorkspaceGatewayLifecycleDependencies,
  proxyToken: string,
): Promise<WorkspaceGatewaySidecar> {
  const runtimeDependencies = formlessInstanceWorkspaceGatewaySidecarDependencies(dependencies);
  const sidecarDependencies = {
    ...runtimeDependencies,
    createProxyToken: () => proxyToken,
  };
  const sidecarInput = {
    ...(dependencies.env === undefined ? {} : { env: dependencies.env }),
    workspaceRoot: input.workspaceRoot,
  };

  if (dependencies.startWorkspaceGatewaySidecar) {
    return dependencies.startWorkspaceGatewaySidecar(sidecarInput, sidecarDependencies);
  }

  return startPackageWorkspaceGatewaySidecar(sidecarInput, {
    createProxyToken: sidecarDependencies.createProxyToken,
    handlers: createWorkspaceGatewayHandlers(runtimeDependencies),
  });
}

function formlessInstanceWorkspaceGatewaySidecarDependencies(
  dependencies: FormlessInstanceWorkspaceGatewayLifecycleDependencies,
): StartWorkspaceGatewaySidecarDependencies {
  return {
    accountDiscovery: dependencies.accountDiscovery,
    cwd: dependencies.cwd,
    ...(dependencies.deploymentAdapter === undefined
      ? {}
      : { deploymentAdapter: dependencies.deploymentAdapter }),
    env: dependencies.env,
    fetch: dependencies.fetch,
    ...(dependencies.healthCheck === undefined ? {} : { healthCheck: dependencies.healthCheck }),
    ...(dependencies.localSecretEnv === undefined
      ? {}
      : { localSecretEnv: dependencies.localSecretEnv }),
    now: dependencies.now,
    packageRoot: dependencies.packageRoot,
    packageVersion: dependencies.packageVersion,
    ...(dependencies.randomToken === undefined ? {} : { randomToken: dependencies.randomToken }),
    ...(dependencies.setupCapability === undefined
      ? {}
      : { setupCapability: dependencies.setupCapability }),
  };
}

function formlessInstanceWorkspaceLocalSessionBootstrapUrl(
  source: string,
  token: string,
  input: { reset: boolean },
): string {
  const url = new URL(LOCAL_SESSION_BOOTSTRAP_API_PATH, `${source}/`);

  url.searchParams.set("token", token);
  if (input.reset) {
    url.searchParams.set("reset", "1");
  }

  return url.toString();
}

function createFormlessInstanceWorkspaceGatewayLifecycleSecret(
  dependencies: Pick<FormlessInstanceWorkspaceGatewayLifecycleDependencies, "randomToken">,
): string {
  return requiredGeneratedToken(
    dependencies.randomToken?.() ?? randomWorkspaceGatewayLifecycleToken(),
  );
}

function randomWorkspaceGatewayLifecycleToken(): string {
  return randomBytes(32).toString("base64url");
}

function requiredGeneratedToken(value: string): string {
  const token = value.trim();

  if (token === "") {
    throw new Error("Generated Formless admin token must be a non-empty string.");
  }

  return token;
}
