import { describe, expect, it } from "vite-plus/test";

import {
  FORMLESS_DEPLOY_METADATA_PATH,
  FORMLESS_RUNTIME_PROTOCOL_VERSION,
  FORMLESS_STORAGE_MIGRATION_SET_ID,
} from "../shared/deploy-metadata.ts";
import { handleDeployMetadataRequest } from "./deploy-metadata.ts";

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
      packageVersion: "0.1.7",
      runtimeProtocolVersion: FORMLESS_RUNTIME_PROTOCOL_VERSION,
      storageMigrationSet: FORMLESS_STORAGE_MIGRATION_SET_ID,
      version: "0.1.7",
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
