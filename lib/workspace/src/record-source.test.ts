import { describe, expect, it } from "vite-plus/test";

import {
  appPackageManifestKind,
  appPackageManifestVersion,
  createAppPackageResolver,
} from "@dpeek/formless-installed-apps";
import type { StoredRecord } from "@dpeek/formless-storage";
import {
  formatInstanceWorkspaceControlPlaneRecordSourceFile,
  parseInstanceWorkspaceControlPlaneRecordSourceControlPlane,
} from "./record-source.ts";

describe("workspace control-plane record source validation", () => {
  it("formats records by id and values by control-plane field declaration", () => {
    const records = [
      appInstallRecord("zeta", "2026-06-18T00:00:01.000Z"),
      appInstallRecord("alpha", "2026-06-18T00:00:02.000Z"),
    ];
    const formatted = JSON.parse(
      formatInstanceWorkspaceControlPlaneRecordSourceFile({
        entity: "app-install",
        records,
        schemaUpdatedAt: "2026-06-18T00:00:03.000Z",
      }),
    ) as { records: StoredRecord[] };

    expect(formatted.records.map((record) => record.id)).toEqual(["alpha", "zeta"]);
    expect(formatted.records[0]!.entity).toBe("instance:app-install");
    expect(Object.keys(formatted.records[0]!.values)).toEqual([
      "installId",
      "packageAppKey",
      "label",
      "registrationPolicy",
      "status",
      "storageIdentity",
    ]);
  });

  it("validates public Site routes through the active package resolver", () => {
    const packageResolver = createAppPackageResolver([
      packageManifest({
        label: "Private Labs",
        packageAppKey: "private-labs",
        publicSite: true,
      }),
    ]);
    const records: StoredRecord[] = [
      {
        id: "labs",
        entity: "app-install",
        values: {
          installId: "labs",
          packageAppKey: "private-labs",
          label: "Private Labs",
          registrationOperation: "profile.register",
          registrationPolicy: "custom-operation",
          status: "installed",
          storageIdentity: "app:labs",
        },
        createdAt: "2026-06-18T00:00:00.000Z",
        updatedAt: "2026-06-18T00:00:00.000Z",
      },
      {
        id: "route:labs:public-site",
        entity: "route",
        values: {
          enabled: true,
          matchPath: "/sites/labs",
          matchPrefix: "/sites/labs/",
          kind: "mount",
          targetProfile: "public-site",
          appInstall: "labs",
          surface: "public-site",
        },
        createdAt: "2026-06-18T00:00:00.000Z",
        updatedAt: "2026-06-18T00:00:00.000Z",
      },
    ];

    expect(
      parseInstanceWorkspaceControlPlaneRecordSourceControlPlane(
        "Workspace source",
        "2026-06-18T00:00:01.000Z",
        records,
        { packageResolver },
      ).records.find((record) => record.id === "labs")?.values.packageAppKey,
    ).toBe("private-labs");
    expect(
      parseInstanceWorkspaceControlPlaneRecordSourceControlPlane(
        "Workspace source",
        "2026-06-18T00:00:01.000Z",
        records,
        { packageResolver },
      ).records.find((record) => record.id === "labs")?.values.registrationPolicy,
    ).toBe("custom-operation");
    expect(
      parseInstanceWorkspaceControlPlaneRecordSourceControlPlane(
        "Workspace source",
        "2026-06-18T00:00:01.000Z",
        records,
        { packageResolver },
      ).records.find((record) => record.id === "labs")?.values.registrationOperation,
    ).toBe("profile.register");
    expect(() =>
      parseInstanceWorkspaceControlPlaneRecordSourceControlPlane(
        "Workspace source",
        "2026-06-18T00:00:01.000Z",
        records,
      ),
    ).toThrow(
      'Workspace control-plane record source records route "route:labs:public-site" requires an active package resolver',
    );
  });
});

function appInstallRecord(id: string, createdAt: string): StoredRecord {
  return {
    id,
    entity: "app-install",
    values: {
      storageIdentity: `app:${id}`,
      status: "installed",
      registrationPolicy: "closed",
      label: id,
      packageAppKey: id,
      installId: id,
    },
    createdAt,
    updatedAt: createdAt,
  };
}

function packageManifest(input: {
  label: string;
  packageAppKey: string;
  publicSite?: boolean;
}): Record<string, unknown> {
  return {
    kind: appPackageManifestKind,
    version: appPackageManifestVersion,
    packageAppKey: input.packageAppKey,
    label: input.label,
    description: `${input.label} package fixture.`,
    defaultInstallId: input.packageAppKey,
    supportsMultipleInstalls: true,
    packageRevision: 1,
    sourceSchema: {
      kind: "workspace",
      key: input.packageAppKey,
      path: "schema.json",
    },
    seedRecords: {
      kind: "workspace",
      key: input.packageAppKey,
      path: "seed-records.json",
    },
    sourceSchemaHash: "sha256:4444444444444444444444444444444444444444444444444444444444444444",
    capabilities: [
      {
        kind: "generatedAdmin",
        routeBase: "/apps",
      },
      ...(input.publicSite
        ? [
            {
              kind: "publicSite",
              routeBase: "/sites",
            },
          ]
        : []),
    ],
  };
}
