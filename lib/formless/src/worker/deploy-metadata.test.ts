import { describe, expect, it } from "vite-plus/test";

import {
  FORMLESS_DEPLOY_METADATA_PATH,
  FORMLESS_RUNTIME_PROTOCOL_VERSION,
  FORMLESS_STORAGE_MIGRATION_SET_ID,
} from "../shared/deploy-metadata.ts";
import {
  appPackageManifestKind,
  appPackageManifestVersion,
  bundledAppPackageManifests,
  createAppPackageResolver,
} from "../shared/app-packages.ts";
import { handleDeployMetadataRequest } from "./deploy-metadata.ts";

const privateSourceSchemaHash =
  "sha256:2222222222222222222222222222222222222222222222222222222222222222";

describe("Worker deploy metadata", () => {
  it("exposes the configured deploy version as no-store JSON", async () => {
    const env = {
      FORMLESS_DEPLOY_VERSION: "0.1.7",
      FORMLESS_ADMIN_TOKEN: "secret-admin-token",
      ALCHEMY_PASSWORD: "secret-alchemy-password",
    };
    const response = handleDeployMetadataRequest(
      new Request(`https://live.example${FORMLESS_DEPLOY_METADATA_PATH}`),
      env,
    );

    expect(response?.status).toBe(200);
    expect(response?.headers.get("Cache-Control")).toBe("no-store");
    expect(response?.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    await expect(response?.json()).resolves.toEqual({
      packageApps: [],
      packageVersion: "0.1.7",
      runtimeProtocolVersion: FORMLESS_RUNTIME_PROTOCOL_VERSION,
      storageMigrationSet: FORMLESS_STORAGE_MIGRATION_SET_ID,
      version: "0.1.7",
    });
  });

  it("emits package app facts from the active package resolver", async () => {
    const resolver = createAppPackageResolver([
      ...bundledAppPackageManifests,
      privatePackageManifest(),
    ]);
    const response = handleDeployMetadataRequest(
      new Request(`https://live.example${FORMLESS_DEPLOY_METADATA_PATH}`),
      { FORMLESS_DEPLOY_VERSION: "0.1.7" },
      { packageResolver: resolver },
    );
    const metadata = (await response?.json()) as {
      packageApps: {
        packageAppKey: string;
        packageRevision: number;
        sourceSchemaHash: string;
      }[];
    };
    expect(metadata.packageApps.at(-1)).toEqual({
      packageAppKey: "private-labs",
      packageRevision: 7,
      sourceSchemaHash: privateSourceSchemaHash,
    });
  });

  it("supports HEAD checks without a body and rejects write methods", async () => {
    const headResponse = handleDeployMetadataRequest(
      new Request(`https://live.example${FORMLESS_DEPLOY_METADATA_PATH}`, { method: "HEAD" }),
      {},
    );
    const postResponse = handleDeployMetadataRequest(
      new Request(`https://live.example${FORMLESS_DEPLOY_METADATA_PATH}`, { method: "POST" }),
      {},
    );

    expect(headResponse?.status).toBe(200);
    await expect(headResponse?.text()).resolves.toBe("");
    expect(postResponse?.status).toBe(405);
    expect(postResponse?.headers.get("Allow")).toBe("GET, HEAD");
  });
});

function privatePackageManifest(): Record<string, unknown> {
  return {
    kind: appPackageManifestKind,
    version: appPackageManifestVersion,
    packageAppKey: "private-labs",
    label: "Private Labs",
    description: "Private lab package fixture.",
    defaultInstallId: "labs",
    supportsMultipleInstalls: false,
    packageRevision: 7,
    sourceSchema: {
      kind: "workspace",
      key: "private-labs",
      path: "packages/private-labs/schema.json",
    },
    sourceSchemaHash: privateSourceSchemaHash,
    capabilities: [
      {
        kind: "generatedAdmin",
        routeBase: "/apps",
      },
      {
        kind: "publicSite",
        routeBase: "/sites",
      },
    ],
  };
}
