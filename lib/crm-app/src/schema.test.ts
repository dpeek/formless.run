import { computeSourceSchemaHash, parseAppPackageManifest } from "@dpeek/formless-installed-apps";
import { parseAppSchema } from "@dpeek/formless-schema";
import type { StoredRecord } from "@dpeek/formless-storage";
import { describe, expect, it } from "vite-plus/test";
import {
  crmEntityIds,
  crmOwnedProgramEntityIds,
  reviewableCrmRecords,
  validateCrmRecords,
} from "@dpeek/formless-crm-app";
import rawAppPackageManifest from "@dpeek/formless-crm-app/formless.app.json";
import {
  crmPresentationSchemaModule,
  crmRecordSchemaModule,
  crmSchemaSource,
} from "@dpeek/formless-crm-app/schema";
import rawSourceSchema from "@dpeek/formless-crm-app/schema.json";

describe("CRM schema authoring", () => {
  it("composes record declarations before dependent presentation declarations", () => {
    expect([crmRecordSchemaModule.key, crmPresentationSchemaModule.key]).toEqual([
      "crm-records",
      "crm-presentation",
    ]);
    expect(crmPresentationSchemaModule.requires).toEqual(["crm-records"]);
    expect(crmRecordSchemaModule.entities.map(({ key }) => key)).toEqual([
      "company",
      "contact",
      "email-address",
      "audience",
      "subscription",
      "campaign",
      "campaign-message",
      "broadcast",
      "broadcast-recipient",
      "delivery-event",
    ]);
  });

  it("materializes the standalone source and matching manifest hash", async () => {
    const manifest = parseAppPackageManifest(rawAppPackageManifest, "CRM package manifest");

    expect(crmSchemaSource).toEqual(rawSourceSchema);
    expect(parseAppSchema(crmSchemaSource)).toEqual(parseAppSchema(rawSourceSchema));
    expect(await computeSourceSchemaHash(crmSchemaSource)).toBe(manifest.sourceSchemaHash);
  });

  it("owns non-overlapping Program identities and preserves reviewable CRM records", () => {
    const records = crmRecordSchemaModule.entities.map(({ key }, index) => ({
      ...storedRecord(`crm-record:${index}`, key, { z: "preserved" }),
      ...(index % 2 === 0 ? {} : { deletedAt: "2026-07-31T01:00:00.000Z" }),
    }));
    const sharedKeys = new Set(["contact", "email-address", "audience", "subscription"]);

    expect(crmEntityIds).toEqual(crmRecordSchemaModule.entities.map(({ id }) => id));
    expect(crmOwnedProgramEntityIds).toEqual(
      crmRecordSchemaModule.entities.filter(({ key }) => !sharedKeys.has(key)).map(({ id }) => id),
    );
    expect(() => validateCrmRecords("CRM records", records)).not.toThrow();
    expect(reviewableCrmRecords([...records].reverse())).toEqual(records);
    expect(() =>
      validateCrmRecords("CRM records", [storedRecord("crm-record:foreign", "app-install", {})]),
    ).toThrow('CRM records does not support entity "app-install" for record "crm-record:foreign".');
  });
});

function storedRecord(id: string, entity: string, values: StoredRecord["values"]): StoredRecord {
  return {
    id,
    entity,
    values,
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
  };
}
