import { computeSourceSchemaHash, parseAppSchema } from "@dpeek/formless-schema";
import { describe, expect, it } from "vite-plus/test";
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
    expect(crmRecordSchemaModule.runtimeRequirements).toEqual({
      shared: { operationAdapters: ["contact-subscription.subscribe"] },
    });
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

  it("materializes the deterministic standalone source", async () => {
    expect(crmSchemaSource).toEqual(rawSourceSchema);
    expect(parseAppSchema(crmSchemaSource)).toEqual(parseAppSchema(rawSourceSchema));
    expect(await computeSourceSchemaHash(crmSchemaSource)).toBe(
      await computeSourceSchemaHash(rawSourceSchema),
    );
  });
});
