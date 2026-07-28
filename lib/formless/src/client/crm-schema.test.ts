import { describe, expect, it } from "vite-plus/test";
import rawCrmSeedRecords from "@dpeek/formless-crm-app/seed-records.json";
import rawCrmSchema from "@dpeek/formless-crm-app/schema.json";
import type { StoredRecord } from "@dpeek/formless-storage";
import {
  isValidStoredFieldValue,
  parseAppSchema,
  selectAnonymousPublicOperationByKey,
  type AppSchema,
} from "@dpeek/formless-schema";
import { selectCollectionModels, selectPrimaryScreenModels } from "./views.ts";

const crmSchema = parseAppSchema(rawCrmSchema);
const crmSeedRecords = rawCrmSeedRecords as unknown as StoredRecord[];
const crmCollectionOperationCoverage = [
  {
    viewName: "companyHome",
    entityName: "company",
    operationKeys: ["company.create"],
    updateOperationKey: "company.update",
  },
  {
    viewName: "contactHome",
    entityName: "contact",
    operationKeys: ["contact.create"],
    updateOperationKey: "contact.update",
  },
  {
    viewName: "emailAddressHome",
    entityName: "email-address",
    operationKeys: ["email-address.create"],
    updateOperationKey: "email-address.update",
  },
  {
    viewName: "audienceHome",
    entityName: "audience",
    operationKeys: ["audience.create"],
    updateOperationKey: "audience.update",
  },
  {
    viewName: "subscriptionHome",
    entityName: "subscription",
    operationKeys: ["subscription.create"],
    updateOperationKey: "subscription.update",
  },
  {
    viewName: "campaignHome",
    entityName: "campaign",
    operationKeys: ["campaign.create"],
    updateOperationKey: "campaign.update",
  },
  {
    viewName: "campaignMessageHome",
    entityName: "campaign-message",
    operationKeys: ["campaign-message.create"],
    updateOperationKey: "campaign-message.update",
  },
  {
    viewName: "broadcastHome",
    entityName: "broadcast",
    operationKeys: ["broadcast.create"],
    updateOperationKey: "broadcast.update",
  },
  {
    viewName: "broadcastRecipientHome",
    entityName: "broadcast-recipient",
    operationKeys: ["broadcast-recipient.create"],
    updateOperationKey: "broadcast-recipient.update",
  },
  {
    viewName: "deliveryEventHome",
    entityName: "delivery-event",
    operationKeys: [],
    updateOperationKey: null,
  },
];
describe("crm source schema", () => {
  it("parses the checked-in flat CRM entities", () => {
    expect(crmSchema.entities.map(({ key }) => key)).toEqual([
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
    expect(
      crmSchema.entities
        .find((definition) => definition.key === "contact")
        ?.fields.find((definition) => definition.key === "company")!,
    ).toMatchObject({
      type: "reference",
      to: "company",
      displayField: "name",
    });
    expect(
      crmSchema.entities
        .find((definition) => definition.key === "broadcast-recipient")
        ?.fields.find((definition) => definition.key === "subscription")!,
    ).toMatchObject({
      type: "reference",
      to: "subscription",
    });
  });
  it("defines CRM relationship metadata and membership constraints", () => {
    expect(
      crmSchema.entities
        .find((definition) => definition.key === "email-address")
        ?.constraints!.find((definition) => definition.key === "uniqueNormalizedAddress")!,
    ).toMatchObject({
      kind: "unique",
      fields: ["normalizedAddress"],
    });
    expect(
      crmSchema.entities
        .find((definition) => definition.key === "subscription")
        ?.constraints!.find((definition) => definition.key === "uniqueEmailAudience")!,
    ).toMatchObject({
      kind: "unique",
      fields: ["emailAddress", "audience"],
    });
    expect(
      crmSchema.entities
        .find((definition) => definition.key === "contact")
        ?.fields.find((definition) => definition.key === "source")!,
    ).toMatchObject({
      type: "enum",
      default: "owner",
      values: expect.arrayContaining([
        expect.objectContaining({ key: "owner", label: "Owner" }),
        expect.objectContaining({ key: "import", label: "Import" }),
        expect.objectContaining({ key: "publicOperation", label: "Public operation" }),
      ]),
    });
    expect(
      crmSchema.entities
        .find((definition) => definition.key === "subscription")
        ?.fields.find((definition) => definition.key === "sourceKind")!,
    ).toMatchObject({
      type: "enum",
      default: "owner",
      values: expect.arrayContaining([
        expect.objectContaining({ key: "owner", label: "Owner" }),
        expect.objectContaining({ key: "import", label: "Import" }),
        expect.objectContaining({ key: "publicOperation", label: "Public operation" }),
      ]),
    });
    expect(
      crmSchema.entities
        .find((definition) => definition.key === "subscription")
        ?.fields.find((definition) => definition.key === "sourceTargetKind")!,
    ).toMatchObject({
      type: "enum",
      required: false,
      values: [
        { key: "schemaKey", label: "Schema key" },
        { key: "appInstall", label: "App install" },
      ],
    });
    for (const fieldName of [
      "sourcePackageAppKey",
      "sourceSchemaKey",
      "sourceInstallId",
      "sourceApiRoutePrefix",
      "sourceOperationKey",
      "sourceHost",
      "sourcePath",
      "sourceSiteBlockId",
    ]) {
      expect(
        crmSchema.entities
          .find((definition) => definition.key === "subscription")
          ?.fields.find((definition) => definition.key === fieldName)!,
      ).toMatchObject({
        type: "text",
        required: false,
      });
    }
    expect(
      crmSchema.relationships!.find((definition) => definition.key === "contactEmailAddresses")!,
    ).toMatchObject({
      kind: "toMany",
      from: { entity: "contact" },
      to: { entity: "email-address", field: "contact" },
      inverse: "emailAddressContact",
    });
    expect(
      crmSchema.relationships!.find((definition) => definition.key === "audienceEmailAddresses")!,
    ).toMatchObject({
      kind: "manyToMany",
      through: {
        entity: "subscription",
        fromField: "audience",
        toField: "emailAddress",
        uniqueConstraint: "uniqueEmailAudience",
      },
    });
    expect(
      crmSchema.relationships!.find(
        (definition) => definition.key === "broadcastRecipientDeliveryEvents",
      )!,
    ).toMatchObject({
      kind: "toMany",
      from: { entity: "broadcast-recipient" },
      to: { entity: "delivery-event", field: "broadcastRecipient" },
    });
  });
  it("declares CRM source operations and collection bindings for generated controls", () => {
    const entityOperationNames = Object.fromEntries(
      crmSchema.entities.map((entity) => [
        entity.key,
        (entity.operations ?? []).map(({ key }) => key),
      ]),
    );
    const collectionOperationBindings = Object.fromEntries(
      crmSchema.views.flatMap((view) => {
        if (view.type !== "collection") {
          return [];
        }
        return [[view.key, (view.operations ?? []).map((operation) => operation.operation)]];
      }),
    );
    expect(entityOperationNames).toEqual({
      company: ["create", "update"],
      contact: ["create", "update"],
      "email-address": ["create", "update"],
      audience: ["create", "update"],
      subscription: ["create", "update", "subscribe"],
      campaign: ["create", "update"],
      "campaign-message": ["create", "update"],
      broadcast: ["create", "update"],
      "broadcast-recipient": ["create", "update"],
      "delivery-event": [],
    });
    expect(collectionOperationBindings).toEqual(
      Object.fromEntries(
        crmCollectionOperationCoverage.map((coverage) => [
          coverage.viewName,
          coverage.operationKeys,
        ]),
      ),
    );
  });

  it("selects CRM generated controls from operation bindings", () => {
    expect(
      selectCollectionModels(crmSchema).map((model) => ({
        viewName: model.viewName,
        entityName: model.entityName,
        operationKeys: model.operations.map((operation) => operation.operation.canonicalKey),
        updateOperationKey: model.collection.updateOperation?.canonicalKey ?? null,
        resultUpdateOperationKey:
          model.result.type === "table"
            ? (model.result.updateOperation?.canonicalKey ?? null)
            : null,
      })),
    ).toEqual(
      crmCollectionOperationCoverage.map((coverage) => ({
        ...coverage,
        resultUpdateOperationKey: coverage.updateOperationKey,
      })),
    );
  });
  it("defines generated admin queries, views, and primary workspace screens", () => {
    expect(crmSchema.queries.map(({ key }) => key)).toEqual([
      "companyAll",
      "companyCustomers",
      "contactAll",
      "contactLeads",
      "contactCustomers",
      "emailAddressAll",
      "emailAddressActive",
      "audienceAll",
      "audienceActive",
      "subscriptionAll",
      "subscriptionSubscribed",
      "subscriptionUnsubscribed",
      "campaignAll",
      "campaignDraft",
      "campaignActive",
      "campaignMessageAll",
      "campaignMessageReady",
      "broadcastAll",
      "broadcastDraft",
      "broadcastScheduled",
      "broadcastSent",
      "broadcastRecipientAll",
      "broadcastRecipientQueued",
      "broadcastRecipientSent",
      "broadcastRecipientNeedsReview",
      "deliveryEventAll",
      "deliveryEventBounces",
    ]);
    expect(
      crmSchema.itemViews.find((definition) => definition.key === "contactListItem")?.fields,
    ).toEqual([
      { field: "label", editor: "text", commit: "field-commit" },
      { field: "company", editor: "reference", commit: "immediate" },
      { field: "lifecycle", editor: "enum", commit: "immediate" },
    ]);
    expect(
      crmSchema.tableViews.find((definition) => definition.key === "subscriptionTable")?.columns,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "referenceField", referenceField: "emailAddress" }),
        expect.objectContaining({ type: "referenceField", referenceField: "audience" }),
        expect.objectContaining({ type: "field", field: "status" }),
      ]),
    );
    expect(crmSchema.views.find((definition) => definition.key === "contactCreate")!).toMatchObject(
      {
        type: "create",
        entity: "contact",
      },
    );
    const deliveryEventHome = crmSchema.views.find(
      (definition) => definition.key === "deliveryEventHome",
    )!;
    expect(deliveryEventHome).toMatchObject({
      type: "collection",
      entity: "delivery-event",
    });
    expect(
      deliveryEventHome?.type === "collection" ? deliveryEventHome.operations : "missing",
    ).toBe(undefined);

    expect(
      selectPrimaryScreenModels(crmSchema).map((screen) => ({
        label: screen.label,
        path: screen.path,
        sections: screen.layout.sections.map((section) => section.viewName),
      })),
    ).toEqual([
      {
        label: "Contacts",
        path: "/",
        sections: ["contactHome", "emailAddressHome", "companyHome"],
      },
      {
        label: "Audiences",
        path: "/audiences",
        sections: ["audienceHome", "subscriptionHome"],
      },
      {
        label: "Campaigns",
        path: "/campaigns",
        sections: ["campaignHome", "campaignMessageHome"],
      },
      {
        label: "Broadcasts",
        path: "/broadcasts",
        sections: ["broadcastHome", "broadcastRecipientHome", "deliveryEventHome"],
      },
    ]);
  });

  it("exposes CRM subscribe as an anonymous public handler operation", () => {
    expect(selectAnonymousPublicOperationByKey(crmSchema, "subscription.subscribe")).toMatchObject({
      kind: "available",
      canonicalKey: "subscription.subscribe",
      entityName: "subscription",
      executionKind: "handlerCommand",
      operationName: "subscribe",
      operation: {
        kind: "command",
        scope: "collection",
        input: {
          fields: [
            {
              key: "email",
              type: "text",
              required: true,
              label: "Email",
            },
          ],
        },
        effect: {
          type: "operationHandler",
          handler: "subscribe",
          config: {},
        },
        output: { type: "command" },
        policy: {
          actors: ["anonymous"],
          access: {
            actor: "anonymous",
            challenge: { kind: "turnstile" },
            origin: { kind: "same-origin" },
          },
        },
      },
    });
  });

  it("keeps demo seed records stored-record shaped and schema-valid", () => {
    expect(crmSeedRecords.map((record) => record.entity)).toEqual([
      "company",
      "company",
      "contact",
      "contact",
      "contact",
      "email-address",
      "email-address",
      "email-address",
      "audience",
      "audience",
      "subscription",
      "subscription",
      "subscription",
      "campaign",
      "campaign-message",
      "broadcast",
      "broadcast-recipient",
      "broadcast-recipient",
      "delivery-event",
      "delivery-event",
      "delivery-event",
    ]);

    expect(validateStoredRecords(crmSchema, crmSeedRecords)).toEqual([]);
  });
});

function validateStoredRecords(schema: AppSchema, records: StoredRecord[]): string[] {
  const errors: string[] = [];
  const recordsById = new Map<string, StoredRecord>();

  for (const record of records) {
    if (record.id.trim() === "") {
      errors.push("empty record id");
      continue;
    }

    if (recordsById.has(record.id)) {
      errors.push(`duplicate record id ${record.id}`);
      continue;
    }

    if (!isIsoTimestamp(record.createdAt)) {
      errors.push(`${record.id} createdAt is not an ISO timestamp`);
    }
    recordsById.set(record.id, record);
  }
  for (const record of records) {
    const entity = schema.entities.find((definition) => definition.key === record.entity)!;
    if (!entity) {
      errors.push(`${record.id} references unknown entity ${record.entity}`);
      continue;
    }
    for (const [fieldName, value] of Object.entries(record.values)) {
      if (!entity.fields.find((definition) => definition.key === fieldName)!) {
        errors.push(`${record.id} includes unknown field ${record.entity}.${fieldName}`);
      }
      if (!isFlatStoredValue(value)) {
        errors.push(`${record.id} field ${record.entity}.${fieldName} is not flat`);
      }
    }
    for (const field of entity.fields) {
      const fieldName = field.key;
      const value = record.values[fieldName];
      if (!isValidStoredFieldValue(value, field)) {
        errors.push(`${record.id} has invalid field ${record.entity}.${fieldName}`);
        continue;
      }

      if (field.type !== "reference" || value === undefined) {
        continue;
      }

      const target = typeof value === "string" ? recordsById.get(value) : undefined;

      if (!target) {
        errors.push(
          `${record.id} ${record.entity}.${fieldName} references missing record ${value}`,
        );
        continue;
      }

      if (target.entity !== field.to) {
        errors.push(`${record.id} ${record.entity}.${fieldName} must reference ${field.to}`);
      }
    }
  }
  for (const entity of schema.entities) {
    const entityName = entity.key;
    const entityRecords = records.filter((record) => record.entity === entityName);
    for (const constraint of entity.constraints ?? []) {
      if (constraint.kind !== "unique") {
        continue;
      }
      const constraintName = constraint.key;
      const seen = new Set<string>();
      for (const record of entityRecords) {
        const key = JSON.stringify(constraint.fields.map((fieldName) => record.values[fieldName]));
        if (seen.has(key)) {
          errors.push(`${entityName}.${constraintName} is duplicated by ${record.id}`);
        }

        seen.add(key);
      }
    }
  }

  return errors;
}

function isFlatStoredValue(value: unknown) {
  return ["string", "boolean", "number"].includes(typeof value);
}

function isIsoTimestamp(value: string) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value);
}
