import {
  FORMLESS_PROGRAM_API_ROUTE_PREFIX,
  FORMLESS_PROGRAM_STORAGE_IDENTITY,
} from "../program/target.ts";
import type { DeploymentTarget } from "../shared/deployment-runtime.ts";
import type { InstanceDomainProviderRedirectIntent } from "../shared/domain-provider-api.ts";
import type { InstanceDomainMapping } from "../shared/instance-domain-mappings.ts";
import type { StoredRecord } from "@dpeek/formless-storage";
import {
  INTERNAL_READ_RECORDS_PATH,
  INTERNAL_SYNC_DOMAIN_INTENT_PATH,
  INTERNAL_SYNC_DEPLOYMENT_PROJECTION_PATH,
} from "./instance-control-plane.ts";

export type DeploymentControlPlaneClientEnv = {
  FORMLESS_AUTHORITY?: DurableObjectNamespace;
};

export async function syncDeploymentConfigToControlPlane(input: {
  env: DeploymentControlPlaneClientEnv;
  now: string;
  requestUrl: string;
  target: DeploymentTarget;
  targetUrl: string;
}): Promise<StoredRecord[] | undefined> {
  return postInternalControlPlaneRecords(input.env, input.requestUrl, {
    body: {
      now: input.now,
      target: input.target,
      targetUrl: input.targetUrl,
    },
    path: INTERNAL_SYNC_DEPLOYMENT_PROJECTION_PATH,
  });
}

export async function syncDomainIntentToControlPlane(input: {
  env: DeploymentControlPlaneClientEnv;
  mappings?: InstanceDomainMapping[];
  now: string;
  redirectIntents?: InstanceDomainProviderRedirectIntent[];
  requestUrl: string;
}): Promise<StoredRecord[] | undefined> {
  return postInternalControlPlaneRecords(input.env, input.requestUrl, {
    body: {
      ...(input.mappings === undefined ? {} : { mappings: input.mappings }),
      now: input.now,
      ...(input.redirectIntents === undefined ? {} : { redirectIntents: input.redirectIntents }),
    },
    path: INTERNAL_SYNC_DOMAIN_INTENT_PATH,
  });
}

export async function readControlPlaneRecords(input: {
  env: DeploymentControlPlaneClientEnv;
  requestUrl: string;
}): Promise<StoredRecord[] | undefined> {
  if (!input.env.FORMLESS_AUTHORITY) {
    return undefined;
  }

  const id = input.env.FORMLESS_AUTHORITY.idFromName(FORMLESS_PROGRAM_STORAGE_IDENTITY);
  const response = await input.env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(
      new URL(
        `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}${INTERNAL_READ_RECORDS_PATH}`,
        input.requestUrl,
      ),
      {
        headers: { Accept: "application/json" },
        method: "GET",
      },
    ),
  );
  const body = (await response.json()) as { error?: string; records?: StoredRecord[] };

  if (!response.ok || !Array.isArray(body.records)) {
    throw new Error(body.error ?? "Control-plane record read failed.");
  }

  return body.records;
}

async function postInternalControlPlaneRecords(
  env: DeploymentControlPlaneClientEnv,
  requestUrl: string,
  input: {
    body: unknown;
    path: string;
  },
): Promise<StoredRecord[] | undefined> {
  if (!env.FORMLESS_AUTHORITY) {
    return undefined;
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_PROGRAM_STORAGE_IDENTITY);
  const response = await env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(new URL(`${FORMLESS_PROGRAM_API_ROUTE_PREFIX}${input.path}`, requestUrl), {
      body: JSON.stringify(input.body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
  const body = (await response.json()) as { error?: string; records?: StoredRecord[] };

  if (!response.ok || !Array.isArray(body.records)) {
    throw new Error(body.error ?? "Control-plane deployment record write failed.");
  }

  return body.records;
}
