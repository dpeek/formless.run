import {
  FORMLESS_INSTANCE_AUTH_ORIGIN_ENV_NAME,
  FORMLESS_INSTANCE_AUTH_RELYING_PARTY_ID_ENV_NAME,
  FORMLESS_INSTANCE_AUTH_RELYING_PARTY_NAME_ENV_NAME,
  parseInstanceAuthConfigInput,
  type InstanceAuthConfigInput,
} from "../shared/instance-auth.ts";
import {
  instanceControlPlaneProductionIdentityFromRecords,
  type InstanceControlPlaneProductionIdentity,
} from "@dpeek/formless-instance-control-plane";
import { resolveRuntimeProfileKind, type RuntimeProfileKind } from "../shared/runtime-topology.ts";
import { readControlPlaneRecords } from "./deployment-control-plane-client.ts";
import { requestOriginForAuth } from "./instance-auth-handoff.ts";
import {
  isLocalOwnerSessionRuntime,
  type LocalSessionBootstrapEnv,
} from "./local-session-bootstrap.ts";
import {
  readInstanceAuthConfig,
  writeInstanceAuthConfig,
  type StoredInstanceAuthConfig,
} from "./instance-auth-state.ts";
import { readIdentityOwner } from "./identity-control-plane.ts";

export type InstanceAuthRuntimeEnv = Partial<LocalSessionBootstrapEnv> & {
  [FORMLESS_INSTANCE_AUTH_ORIGIN_ENV_NAME]?: string;
  [FORMLESS_INSTANCE_AUTH_RELYING_PARTY_ID_ENV_NAME]?: string;
  [FORMLESS_INSTANCE_AUTH_RELYING_PARTY_NAME_ENV_NAME]?: string;
  FORMLESS_AUTHORITY?: DurableObjectNamespace;
  FORMLESS_RUNTIME_PROFILE?: string;
};

const defaultRelyingPartyName = "Formless";

export type RuntimeInstanceAuthConfigPlan =
  | { kind: "check-owner"; config: InstanceAuthConfigInput }
  | { kind: "keep" }
  | { kind: "write"; config: InstanceAuthConfigInput };

export type RuntimeInstanceAuthConfigFacts = {
  existing?: Pick<
    StoredInstanceAuthConfig,
    "canonicalOrigin" | "relyingPartyId" | "relyingPartyName"
  >;
  explicitCanonicalOrigin?: string;
  explicitRelyingPartyId?: string;
  explicitRelyingPartyName?: string;
  localRuntime?: boolean;
  ownerPresent?: boolean;
  productionIdentity?: InstanceControlPlaneProductionIdentity;
  requestOrigin: string;
  runtimeProfile: RuntimeProfileKind;
};

export function ensureRuntimeInstanceAuthConfig(
  storage: DurableObjectStorage,
  request: Request,
  env: InstanceAuthRuntimeEnv,
): Promise<void> {
  const existing = readInstanceAuthConfig(storage);

  return runtimeInstanceAuthConfigFactsForRequest(request, env, existing).then(async (facts) => {
    let plan = planRuntimeInstanceAuthConfig(facts);

    if (plan.kind === "check-owner") {
      if (!env.FORMLESS_AUTHORITY) {
        return;
      }

      const owner = await readIdentityOwner({ FORMLESS_AUTHORITY: env.FORMLESS_AUTHORITY });

      plan = planRuntimeInstanceAuthConfig({ ...facts, ownerPresent: owner !== null });
    }

    if (plan.kind === "write") {
      writeInstanceAuthConfig(storage, plan.config);
    }
  });
}

export function planRuntimeInstanceAuthConfig(
  facts: RuntimeInstanceAuthConfigFacts,
): RuntimeInstanceAuthConfigPlan {
  const config = runtimeInstanceAuthConfigFromFacts(facts);

  if (!config) {
    return { kind: "keep" };
  }

  if (!facts.existing) {
    return { config, kind: "write" };
  }

  if (instanceAuthConfigMatches(facts.existing, config)) {
    return { kind: "keep" };
  }

  if (facts.localRuntime) {
    return { config, kind: "write" };
  }

  if (facts.ownerPresent === undefined) {
    return { config, kind: "check-owner" };
  }

  return facts.ownerPresent ? { kind: "keep" } : { config, kind: "write" };
}

function instanceAuthConfigMatches(
  existing: {
    canonicalOrigin: string;
    relyingPartyId: string;
    relyingPartyName: string;
  },
  next: InstanceAuthConfigInput,
): boolean {
  return (
    existing.canonicalOrigin === next.canonicalOrigin &&
    existing.relyingPartyId === next.relyingPartyId &&
    existing.relyingPartyName === next.relyingPartyName
  );
}

async function runtimeInstanceAuthConfigFactsForRequest(
  request: Request,
  env: InstanceAuthRuntimeEnv,
  existing: RuntimeInstanceAuthConfigFacts["existing"],
): Promise<RuntimeInstanceAuthConfigFacts> {
  const requestUrl = new URL(request.url);
  const profileKind = resolveRuntimeProfileKind({
    hostname: requestUrl.hostname,
    profile: env.FORMLESS_RUNTIME_PROFILE,
  });
  const explicitCanonicalOrigin = stringRuntimeEnvValue(
    env[FORMLESS_INSTANCE_AUTH_ORIGIN_ENV_NAME],
  );
  const localRuntime = isLocalOwnerSessionRuntime(request, env);
  const productionIdentity =
    explicitCanonicalOrigin === undefined &&
    !localRuntime &&
    (profileKind === "instance" || profileKind === "publishedSite")
      ? instanceControlPlaneProductionIdentityFromRecords(
          (await readControlPlaneRecords({
            env,
            requestUrl: request.url,
          })) ?? [],
        )
      : undefined;

  return {
    ...(existing === undefined ? {} : { existing }),
    ...(explicitCanonicalOrigin === undefined ? {} : { explicitCanonicalOrigin }),
    ...(localRuntime ? { localRuntime: true } : {}),
    ...(stringRuntimeEnvValue(env[FORMLESS_INSTANCE_AUTH_RELYING_PARTY_ID_ENV_NAME]) === undefined
      ? {}
      : {
          explicitRelyingPartyId: stringRuntimeEnvValue(
            env[FORMLESS_INSTANCE_AUTH_RELYING_PARTY_ID_ENV_NAME],
          ),
        }),
    ...(stringRuntimeEnvValue(env[FORMLESS_INSTANCE_AUTH_RELYING_PARTY_NAME_ENV_NAME]) === undefined
      ? {}
      : {
          explicitRelyingPartyName: stringRuntimeEnvValue(
            env[FORMLESS_INSTANCE_AUTH_RELYING_PARTY_NAME_ENV_NAME],
          ),
        }),
    ...(productionIdentity === undefined ? {} : { productionIdentity }),
    requestOrigin: localRuntime ? requestOriginForAuth(request) : requestUrl.origin,
    runtimeProfile: profileKind,
  };
}

function runtimeInstanceAuthConfigFromFacts(
  facts: RuntimeInstanceAuthConfigFacts,
): InstanceAuthConfigInput | undefined {
  const relyingPartyName = facts.explicitRelyingPartyName ?? defaultRelyingPartyName;

  if (facts.explicitCanonicalOrigin !== undefined) {
    return parseRuntimeAuthConfig({
      canonicalOrigin: facts.explicitCanonicalOrigin,
      relyingPartyId: facts.explicitRelyingPartyId,
      relyingPartyName,
    });
  }

  if (facts.localRuntime) {
    return parseRuntimeAuthConfig({
      canonicalOrigin: facts.requestOrigin,
      relyingPartyId: facts.explicitRelyingPartyId,
      relyingPartyName,
    });
  }

  if (!facts.productionIdentity) {
    return undefined;
  }

  return parseRuntimeAuthConfig({
    canonicalOrigin: facts.productionIdentity.authOrigin,
    relyingPartyId: facts.explicitRelyingPartyId ?? facts.productionIdentity.relyingPartyId,
    relyingPartyName: facts.productionIdentity.relyingPartyName ?? relyingPartyName,
  });
}

function parseRuntimeAuthConfig(input: {
  canonicalOrigin: string;
  relyingPartyId?: string;
  relyingPartyName: string;
}): InstanceAuthConfigInput | undefined {
  try {
    const canonicalHost = new URL(input.canonicalOrigin).hostname.toLowerCase();

    return parseInstanceAuthConfigInput({
      canonicalOrigin: input.canonicalOrigin,
      relyingPartyId: input.relyingPartyId ?? canonicalHost,
      relyingPartyName: input.relyingPartyName,
    });
  } catch {
    return undefined;
  }
}

function stringRuntimeEnvValue(value: string | undefined): string | undefined {
  return value && value.trim().length > 0 ? value.trim() : undefined;
}
