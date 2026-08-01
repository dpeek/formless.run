import {
  FORMLESS_DEPLOY_METADATA_PATH,
  FORMLESS_RUNTIME_PROTOCOL_VERSION,
  FORMLESS_STORAGE_MIGRATION_SET_ID,
  type FormlessDeployMetadata,
} from "../shared/deploy-metadata.ts";

export type DeployMetadataEnv = {
  FORMLESS_DEPLOY_VERSION?: string;
};

export function handleDeployMetadataRequest(
  request: Request,
  env: DeployMetadataEnv,
): Response | undefined {
  const url = new URL(request.url);

  if (url.pathname !== FORMLESS_DEPLOY_METADATA_PATH) {
    return undefined;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, {
      headers: {
        Allow: "GET, HEAD",
      },
      status: 405,
    });
  }

  const metadata: FormlessDeployMetadata = {
    packageVersion: stringConfigValue(env.FORMLESS_DEPLOY_VERSION) ?? null,
    runtimeProtocolVersion: FORMLESS_RUNTIME_PROTOCOL_VERSION,
    storageMigrationSet: FORMLESS_STORAGE_MIGRATION_SET_ID,
    version: stringConfigValue(env.FORMLESS_DEPLOY_VERSION) ?? null,
  };

  return new Response(request.method === "HEAD" ? null : `${JSON.stringify(metadata)}\n`, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function stringConfigValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
