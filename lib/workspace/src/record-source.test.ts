import { describe, expect, it } from "vite-plus/test";

import type { StoredRecord } from "@dpeek/formless-storage";
import { formatInstanceWorkspaceControlPlaneRecordSourceFile } from "./record-source.ts";

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
