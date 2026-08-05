import { composeAppSchema, defineAppSchemaModule, parseAppSchema } from "@dpeek/formless-schema";
import {
  STANDARD_AUDIENCE_ENTITY_ID,
  STANDARD_CONTACT_MESSAGE_ENTITY_ID,
  STANDARD_EMAIL_ADDRESS_ENTITY_ID,
  STANDARD_SUBSCRIPTION_ENTITY_ID,
} from "@dpeek/formless-standard";
import {
  standardContactSubscriptionRecordSchemaModule,
  standardInquiryRecordSchemaModule,
  standardSchemaSource,
} from "@dpeek/formless-standard/schema";
import { describe, expect, it } from "vite-plus/test";

describe("standard schema authoring", () => {
  it("composes inquiry and contact subscriptions independently", () => {
    const inquirySource = composeAppSchema({
      version: 1,
      modules: [
        standardInquiryRecordSchemaModule,
        independentPresentationModule({
          entity: "contact-message",
          field: "name",
          module: standardInquiryRecordSchemaModule.key,
          query: "contactMessageAll",
        }),
      ],
    });
    const contactSubscriptionSource = composeAppSchema({
      version: 1,
      modules: [
        standardContactSubscriptionRecordSchemaModule,
        independentPresentationModule({
          entity: "audience",
          field: "label",
          module: standardContactSubscriptionRecordSchemaModule.key,
          query: "audienceAll",
        }),
      ],
    });

    expect(parseAppSchema(inquirySource).entities.map(({ key }) => key)).toEqual([
      "contact-message",
    ]);
    expect(parseAppSchema(contactSubscriptionSource).entities.map(({ key }) => key)).toEqual([
      "email-address",
      "audience",
      "subscription",
    ]);
  });

  it("preserves the current standard declaration contracts", () => {
    expect(standardInquiryRecordSchemaModule).toMatchObject({
      key: "standard-inquiry-records",
      entities: [
        {
          id: STANDARD_CONTACT_MESSAGE_ENTITY_ID,
          key: "contact-message",
          fields: [{ key: "name" }, { key: "email" }, { key: "message" }],
          operations: [{ key: "submit", kind: "create" }],
        },
      ],
      queries: [{ key: "contactMessageAll", entity: "contact-message" }],
    });
    expect(
      standardContactSubscriptionRecordSchemaModule.entities?.map((entity) => ({
        id: entity.id,
        key: entity.key,
        fields: entity.fields.map((field) => field.key),
        constraints:
          "constraints" in entity ? entity.constraints.map((constraint) => constraint.key) : [],
        operations: entity.operations.map((operation) => operation.key),
      })),
    ).toEqual([
      {
        id: STANDARD_EMAIL_ADDRESS_ENTITY_ID,
        key: "email-address",
        fields: ["address", "normalizedAddress"],
        constraints: ["uniqueNormalizedAddress"],
        operations: ["update"],
      },
      {
        id: STANDARD_AUDIENCE_ENTITY_ID,
        key: "audience",
        fields: ["key", "label"],
        constraints: ["uniqueAudienceKey"],
        operations: ["update"],
      },
      {
        id: STANDARD_SUBSCRIPTION_ENTITY_ID,
        key: "subscription",
        fields: [
          "emailAddress",
          "audience",
          "status",
          "consentedAt",
          "sourceKind",
          "sourceTargetKind",
          "sourceSchemaKey",
          "sourceApiRoutePrefix",
          "sourceOperationKey",
          "sourceHost",
          "sourcePath",
          "sourceSiteBlockId",
        ],
        constraints: ["uniqueEmailAudience"],
        operations: ["update", "subscribe"],
      },
    ]);
    expect(
      standardContactSubscriptionRecordSchemaModule.relationships?.map(({ key }) => key),
    ).toEqual([
      "subscriptionEmailAddress",
      "emailAddressSubscriptions",
      "subscriptionAudience",
      "audienceSubscriptions",
    ]);
    expect(standardContactSubscriptionRecordSchemaModule.queries?.map(({ key }) => key)).toEqual([
      "emailAddressAll",
      "audienceAll",
      "subscriptionAll",
    ]);
  });

  it("declares anonymous public intake policy and subscription execution requirements", () => {
    const inquirySubmit = standardInquiryRecordSchemaModule.entities?.[0]?.operations[0];
    const subscriptionSubscribe = standardContactSubscriptionRecordSchemaModule.entities
      ?.find(({ key }) => key === "subscription")
      ?.operations.find(({ key }) => key === "subscribe");

    expect(inquirySubmit?.policy).toEqual({
      actors: ["anonymous"],
      access: {
        actor: "anonymous",
        challenge: { kind: "turnstile" },
        origin: { kind: "same-origin" },
      },
    });
    expect(subscriptionSubscribe).toMatchObject({
      kind: "command",
      effect: {
        type: "operationHandler",
        handler: "contact-subscription.subscribe",
      },
      policy: {
        actors: ["anonymous"],
        access: {
          actor: "anonymous",
          challenge: { kind: "turnstile" },
          origin: { kind: "same-origin" },
        },
      },
    });
    expect(standardContactSubscriptionRecordSchemaModule.runtimeRequirements).toEqual({
      shared: { operationAdapters: ["contact-subscription.subscribe"] },
    });
    expect(standardInquiryRecordSchemaModule).not.toHaveProperty("runtimeRequirements");
  });

  it("exposes a valid named complete schema source", () => {
    const schema = parseAppSchema(standardSchemaSource);

    expect(schema.entities.map(({ key }) => key)).toEqual([
      "contact-message",
      "email-address",
      "audience",
      "subscription",
    ]);
    expect(schema.screens.map(({ key }) => key)).toEqual(["standardContactIntake"]);
  });
});

function independentPresentationModule(input: {
  entity: "audience" | "contact-message";
  field: "label" | "name";
  module: string;
  query: "audienceAll" | "contactMessageAll";
}) {
  return defineAppSchemaModule({
    key: `test-${input.entity}-presentation`,
    requires: [input.module],
    tableViews: [
      {
        key: `test-${input.entity}-table`,
        entity: input.entity,
        columns: [{ type: "field", field: input.field }],
      },
    ],
    views: [
      {
        key: `test-${input.entity}-view`,
        type: "collection",
        label: "Test",
        entity: input.entity,
        queries: [{ query: input.query }],
        defaultQuery: input.query,
        result: { type: "table", tableView: `test-${input.entity}-table` },
      },
    ],
    screens: [
      {
        key: `test-${input.entity}-screen`,
        type: "workspace",
        label: "Test",
        layout: {
          type: "stack",
          sections: [
            {
              id: "test",
              type: "collection",
              view: `test-${input.entity}-view`,
            },
          ],
        },
      },
    ],
  });
}
