import { describe, expect, it } from "vite-plus/test";
import type { RecordValues, StoredRecord } from "@dpeek/formless-storage";
import {
  selectCurrentFormlessProgramChanges,
  selectCurrentFormlessProgramRecords,
} from "./program-authority.ts";

describe("current Formless Program selection", () => {
  it("omits removed app identity and install facts without changing Program records", () => {
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
      record("crm", "app-install", { installId: "crm", status: "installed" }),
      record("crm-route", "route", {
        appInstall: "crm",
        enabled: true,
        kind: "mount",
        matchPath: "/apps/crm",
        requiredRole: "app.admin",
        targetProfile: "app",
      }),
      record("registration", "app-registration", { appInstall: "crm" }),
      record("app-role", "role", { key: "app.admin", status: "active" }),
      record("app-assignment", "role-assignment", {
        role: "role:app.admin",
        scopeKind: "app-install",
        scopeAppInstall: "crm",
        status: "active",
      }),
      record("app-invitation", "invitation", {
        targetEmail: "person@example.com",
        targetSurface: "app-install",
        targetAppInstall: "crm",
        status: "pending",
      }),
      record("app-policy", "account-policy", {
        policyKey: "crm-terms",
        scopeKind: "app-install",
        scopeAppInstall: "crm",
        status: "active",
      }),
    ];

    expect(selectCurrentFormlessProgramRecords(records)).toEqual([
      owner,
      programAssignment,
      programRoute,
    ]);
  });

  it("filters removed changes while preserving the source cursor boundary", () => {
    const changes = [
      { id: 20, payload: record("owner-role", "role", { key: "instance.owner" }) },
      { id: 21, payload: record("app-role", "role", { key: "app.viewer" }) },
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
