import { describe, expect, it } from "vite-plus/test";

import { installedAppStorageIdentity } from "./app-storage-identity.ts";
import {
  installedPublicSiteRuntimeTarget,
  programPublicSiteRuntimeTarget,
} from "./public-site-runtime-target.ts";

describe("public Site runtime targets", () => {
  it("keeps package behavior separate from Program and installed storage identity", () => {
    const privatePackage = {
      adminRouteBase: "/apps" as const,
      defaultInstallId: "personal",
      description: "Private public Site package.",
      label: "Private Site",
      packageAppKey: "private-site",
      packageRevision: 1,
      publicRouteBase: "/sites" as const,
      sourceOrigin: "workspace" as const,
      sourceSchemaHash: `sha256:${"a".repeat(64)}` as const,
      sourceSchemaKey: "private-site",
      sourceSchemaLocation: {
        kind: "workspace" as const,
        key: "private-site",
        path: "source/schema.json",
      },
      supportsMultipleInstalls: true,
    };
    const installedStorage = installedAppStorageIdentity(
      {
        installId: "personal",
        packageAppKey: "private-site",
      },
      {
        findPackage: (packageAppKey) =>
          packageAppKey === privatePackage.packageAppKey ? privatePackage : undefined,
        listPackages: () => [privatePackage],
      },
    );

    if (!installedStorage) {
      throw new Error("Missing installed Site storage identity.");
    }

    expect(programPublicSiteRuntimeTarget()).toEqual({
      packageAppKey: "site",
      storageIdentity: {
        apiRoutePrefix: "/api/formless/program",
        authorityName: "instance:control-plane",
        broadcastChannelName: "formless:instance:control-plane",
        browserDatabaseName: "formless:instance:control-plane",
        kind: "program",
        schemaKey: "formless-program",
      },
    });
    expect(installedPublicSiteRuntimeTarget(installedStorage)).toEqual({
      packageAppKey: "private-site",
      storageIdentity: installedStorage,
    });
  });
});
