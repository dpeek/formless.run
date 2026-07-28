import { describe, expect, it } from "vite-plus/test";
import rawCrmAppPackageManifest from "@dpeek/formless-crm-app/formless.app.json";
import rawCrmSeedRecords from "@dpeek/formless-crm-app/seed-records.json";
import rawCrmSourceSchema from "@dpeek/formless-crm-app/schema.json";
import rawSiteAppPackageManifest from "@dpeek/formless-site-app/formless.app.json";
import rawSiteSeedRecords from "@dpeek/formless-site-app/seed-records.json";
import rawSiteSourceSchema from "@dpeek/formless-site-app/schema.json";
import { parseAppPackageManifest } from "../shared/app-packages.ts";
import { computeSourceSchemaHash } from "../shared/upgrade-migrations.ts";
import {
  findWorkerSchemaAppDefinition,
  getWorkerSchemaAppDefinition,
  workerSchemaApps,
} from "./schema-apps.ts";

describe("worker schema app definitions", () => {
  it("loads bundled Site source from package-local manifest files", async () => {
    const manifest = parseAppPackageManifest(rawSiteAppPackageManifest, "Site package manifest");
    const site = getWorkerSchemaAppDefinition("site");

    await expect(computeSourceSchemaHash(rawSiteSourceSchema)).resolves.toBe(
      manifest.sourceSchemaHash,
    );
    expect(manifest).toMatchObject({
      packageAppKey: "site",
      seedRecords: {
        kind: "bundled",
        key: "site",
        path: "seed-records.json",
      },
      sourceSchema: {
        kind: "bundled",
        key: "site",
        path: "schema.json",
      },
    });
    expect(Array.isArray(rawSiteSeedRecords)).toBe(true);
    expect(site.sourceSchema.entities.find((definition) => definition.key === "site")?.label).toBe(
      "Site",
    );
    expect(site.seedRecords.length).toBeGreaterThan(0);
    expect(
      site.seedRecords.every((record) =>
        site.sourceSchema.entities.some((entity) => entity.key === record.entity),
      ),
    ).toBe(true);
  });
  it("loads bundled CRM source from package-local manifest files", async () => {
    const manifest = parseAppPackageManifest(rawCrmAppPackageManifest, "CRM package manifest");
    const crm = getWorkerSchemaAppDefinition("crm");

    await expect(computeSourceSchemaHash(rawCrmSourceSchema)).resolves.toBe(
      manifest.sourceSchemaHash,
    );
    expect(manifest).toMatchObject({
      packageAppKey: "crm",
      seedRecords: {
        kind: "bundled",
        key: "crm",
        path: "seed-records.json",
      },
      sourceSchema: {
        kind: "bundled",
        key: "crm",
        path: "schema.json",
      },
    });
    expect(Array.isArray(rawCrmSeedRecords)).toBe(true);
    expect(
      crm.sourceSchema.entities.find((definition) => definition.key === "contact")?.label,
    ).toBe("Contact");
    expect(crm.seedRecords).toHaveLength(rawCrmSeedRecords.length);
    expect(
      crm.seedRecords.every((record) =>
        crm.sourceSchema.entities.some((entity) => entity.key === record.entity),
      ),
    ).toBe(true);
  });
  it("loads parsed source schemas for each app", () => {
    const tasks = getWorkerSchemaAppDefinition("tasks");
    const site = getWorkerSchemaAppDefinition("site");
    const crm = getWorkerSchemaAppDefinition("crm");
    expect(workerSchemaApps.map((app) => app.key)).toEqual(["tasks", "site", "crm"]);
    expect(tasks.sourceSchema.entities.find((definition) => definition.key === "task")?.label).toBe(
      "Task",
    );
    expect(site.sourceSchema.entities.find((definition) => definition.key === "site")?.label).toBe(
      "Site",
    );
    expect(
      crm.sourceSchema.entities.find((definition) => definition.key === "contact")?.label,
    ).toBe("Contact");
    expect(
      crm.sourceSchema.entities.find((definition) => definition.key === "subscription")?.label,
    ).toBe("Subscription");
    expect(site.sourceSchema.entities.find((definition) => definition.key === "block")?.label).toBe(
      "Block",
    );
    expect(
      site.sourceSchema.entities.find((definition) => definition.key === "block-placement")?.label,
    ).toBe("Placement");
    expect(
      site.sourceSchema.entities.find((definition) => definition.key === "site")!,
    ).not.toHaveProperty("mutations");
    expect(
      site.sourceSchema.entities
        .find((definition) => definition.key === "site")
        ?.operations!.find((definition) => definition.key === "update")!,
    ).toMatchObject({ kind: "update" });
    expect(
      site.sourceSchema.entities
        .find((definition) => definition.key === "block")
        ?.operations!.find((definition) => definition.key === "delete")!,
    ).toMatchObject({ kind: "delete" });
    expect(
      site.sourceSchema.entities
        .find((definition) => definition.key === "block-placement")
        ?.operations!.find((definition) => definition.key === "delete")!,
    ).toBeUndefined();
  });
  it("loads parsed seed records for each app", () => {
    const tasks = getWorkerSchemaAppDefinition("tasks");
    const site = getWorkerSchemaAppDefinition("site");
    const crm = getWorkerSchemaAppDefinition("crm");

    expect(tasks.seedRecords).toHaveLength(5);
    expect(tasks.seedRecords.every((record) => record.entity === "task")).toBe(true);
    expect(site.seedRecords.filter((record) => record.entity === "site")).toEqual([
      expect.objectContaining({
        values: expect.objectContaining({
          key: "primary",
        }),
      }),
    ]);
    expect(site.seedRecords.length).toBeGreaterThan(0);
    expect(
      site.seedRecords.every((record) =>
        site.sourceSchema.entities.some((entity) => entity.key === record.entity),
      ),
    ).toBe(true);
    expect(crm.seedRecords).toHaveLength(21);
    expect(new Set(crm.seedRecords.map((record) => record.entity))).toEqual(
      new Set([
        "audience",
        "broadcast",
        "broadcast-recipient",
        "campaign",
        "campaign-message",
        "company",
        "contact",
        "delivery-event",
        "email-address",
        "subscription",
      ]),
    );
    expect(
      crm.seedRecords.every((record) =>
        crm.sourceSchema.entities.some((entity) => entity.key === record.entity),
      ),
    ).toBe(true);
  });
  it("returns undefined for unknown worker schema keys", () => {
    expect(findWorkerSchemaAppDefinition("missing")).toBeUndefined();
  });
});
