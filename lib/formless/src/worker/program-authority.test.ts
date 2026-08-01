import { describe, expect, it } from "vite-plus/test";
import type { RecordValues, StoredRecord } from "@dpeek/formless-storage";
import {
  selectCurrentFormlessProgramChanges,
  selectCurrentFormlessProgramRecords,
} from "./program-authority.ts";

describe("current Formless Program selection", () => {
  it("selects records owned by the complete Program schema", () => {
    const owner = record("owner-role", "role", { key: "instance.owner", status: "active" });
    const programAssignment = record("program-role", "program-role-assignment", {
      principal: "principal-1",
      roleId: "role_program_member",
      status: "active",
    });
    const programRoute = record("admin-route", "route", {
      enabled: true,
      kind: "mount",
      matchPath: "/",
      targetProfile: "instance",
    });
    const records = [
      owner,
      programAssignment,
      programRoute,
      record("unknown", "unknown-entity", {}),
    ];

    expect(selectCurrentFormlessProgramRecords(records)).toEqual([
      owner,
      programAssignment,
      programRoute,
    ]);
  });

  it("filters changes by complete Program schema membership", () => {
    const changes = [
      { id: 20, payload: record("owner-role", "role", { key: "instance.owner" }) },
      { id: 21, payload: record("unknown", "unknown-entity", {}) },
    ];

    expect(selectCurrentFormlessProgramChanges(changes)).toEqual([changes[0]]);
    expect(changes.at(-1)?.id).toBe(21);
  });
});

function record(id: string, entity: string, values: RecordValues): StoredRecord {
  return {
    id,
    entity,
    values,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
}
