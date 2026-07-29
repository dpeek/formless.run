import { describe, expect, it } from "vite-plus/test";
import rawCrmAppPackageManifest from "@dpeek/formless-crm-app/formless.app.json";
import rawCrmSourceSchema from "@dpeek/formless-crm-app/schema.json";
import rawSiteAppPackageManifest from "@dpeek/formless-site-app/formless.app.json";
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
      sourceSchema: {
        kind: "bundled",
        key: "site",
        path: "schema.json",
      },
    });
    expect(site.sourceSchema.entities.find((definition) => definition.key === "site")?.label).toBe(
      "Site",
    );
  });
  it("loads bundled CRM source from package-local manifest files", async () => {
    const manifest = parseAppPackageManifest(rawCrmAppPackageManifest, "CRM package manifest");
    const crm = getWorkerSchemaAppDefinition("crm");

    await expect(computeSourceSchemaHash(rawCrmSourceSchema)).resolves.toBe(
      manifest.sourceSchemaHash,
    );
    expect(manifest).toMatchObject({
      packageAppKey: "crm",
      sourceSchema: {
        kind: "bundled",
        key: "crm",
        path: "schema.json",
      },
    });
    expect(
      crm.sourceSchema.entities.find((definition) => definition.key === "contact")?.label,
    ).toBe("Contact");
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
  it("returns undefined for unknown worker schema keys", () => {
    expect(findWorkerSchemaAppDefinition("missing")).toBeUndefined();
  });
});
