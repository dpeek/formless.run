import { describe, expect, it } from "vite-plus/test";
import rawCrmAppPackageManifest from "@dpeek/formless-crm-app/formless.app.json";
import rawCrmSourceSchema from "@dpeek/formless-crm-app/schema.json";
import { parseAppPackageManifest } from "../shared/app-packages.ts";
import { computeSourceSchemaHash } from "../shared/upgrade-migrations.ts";
import {
  findWorkerSchemaAppDefinition,
  getWorkerSchemaAppDefinition,
  workerSchemaApps,
} from "./schema-apps.ts";

describe("worker schema app definitions", () => {
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
  it("loads parsed source schemas for each routable source app", () => {
    const crm = getWorkerSchemaAppDefinition("crm");
    expect(workerSchemaApps.map((app) => app.key)).toEqual(["crm"]);
    expect(
      crm.sourceSchema.entities.find((definition) => definition.key === "contact")?.label,
    ).toBe("Contact");
    expect(
      crm.sourceSchema.entities.find((definition) => definition.key === "subscription")?.label,
    ).toBe("Subscription");
    expect(findWorkerSchemaAppDefinition("site")).toBeUndefined();
  });
  it("returns undefined for unknown worker schema keys", () => {
    expect(findWorkerSchemaAppDefinition("missing")).toBeUndefined();
  });
});
