import { describe, expect, it } from "vite-plus/test";

import type { StoredRecord } from "@dpeek/formless-storage";
import {
  formatInstanceWorkspaceControlPlaneRecordSourceFile,
  parseInstanceWorkspaceControlPlaneRecordSourceControlPlane,
} from "./record-source.ts";

describe("workspace control-plane record source validation", () => {
  it("formats records by id and values by control-plane field declaration", () => {
    const records = [
      routeRecord("zeta", "2026-06-18T00:00:01.000Z"),
      routeRecord("alpha", "2026-06-18T00:00:02.000Z"),
    ];
    const formatted = JSON.parse(
      formatInstanceWorkspaceControlPlaneRecordSourceFile({
        entity: "route",
        records,
        schemaUpdatedAt: "2026-06-18T00:00:03.000Z",
      }),
    ) as { records: StoredRecord[] };

    expect(formatted.records.map((record) => record.id)).toEqual(["alpha", "zeta"]);
    expect(formatted.records[0]!.entity).toBe("instance:route");
    expect(Object.keys(formatted.records[0]!.values)).toEqual([
      "enabled",
      "matchPath",
      "kind",
      "targetProfile",
      "surface",
    ]);
  });

  it("omits dormant app installs while retaining Program-native public Site routes", () => {
    const records: StoredRecord[] = [
      {
        id: "labs",
        entity: "instance:app-install",
        values: {
          installId: "labs",
          packageAppKey: "private-labs",
          label: "Private Labs",
          status: "installed",
          storageIdentity: "app:labs",
        },
        createdAt: "2026-06-18T00:00:00.000Z",
        updatedAt: "2026-06-18T00:00:00.000Z",
      },
      {
        id: "route:labs:public-site",
        entity: "instance:route",
        values: {
          enabled: true,
          matchPath: "/pages",
          matchPrefix: "/pages/",
          kind: "mount",
          targetProfile: "public-site",
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
      ).records.map((record) => record.id),
    ).toEqual(["route:labs:public-site"]);
  });
});

function routeRecord(id: string, createdAt: string): StoredRecord {
  return {
    id,
    entity: "route",
    values: {
      enabled: true,
      matchPath: `/${id}`,
      kind: "mount",
      targetProfile: "public-site",
      surface: "public-site",
    },
    createdAt,
    updatedAt: createdAt,
  };
}
