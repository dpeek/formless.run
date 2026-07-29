import { describe, expect, it } from "vite-plus/test";
import rawSiteSourceSchema from "../schema.json";
import { parseAppSchema, type AppSchema, type EntityOperationSchema } from "@dpeek/formless-schema";
import {
  buildPublicOperationRequestBody,
  isPublicOperationListResponse,
  submitPublicOperationJson,
} from "@dpeek/formless-public-operations";
import {
  projectSitePublicOperationBlock,
  type SitePublicOperationTargetRequest,
  type SitePublicOperationTargetResolver,
} from "./public-operation-block-projection.ts";
import type { SiteTreeWarning, StoredRecord } from "./types.ts";

const siteSourceSchema = parseAppSchema(rawSiteSourceSchema);

describe("site public operation block projection", () => {
  it("projects fixed Site-local subscribe and contact form operation facts", () => {
    const subscribe = projectRecord(
      blockRecord("rec_site_block_subscribe", {
        type: "subscribeForm",
        label: "Join the list",
        operationName: "subscribe",
      }),
      {
        publicOperationApiRoutePrefix: "/api/app-installs/site/site",
        turnstileSiteKey: "public-site-key",
      },
    );
    const contact = projectRecord(
      blockRecord("rec_site_block_contact", {
        type: "contactForm",
        label: "Contact us",
        operationName: "submit",
      }),
      {
        publicOperationApiRoutePrefix: "/api/app-installs/site/site",
        turnstileSiteKey: "public-site-key",
      },
    );

    expect(subscribe.publicOperation).toEqual({
      entityName: "subscription",
      operationName: "subscribe",
      canonicalKey: "subscription.subscribe",
      kind: "command",
      route: "/api/app-installs/site/site/public/operations/subscription/subscribe",
      challenge: {
        kind: "turnstile",
        siteKey: "public-site-key",
      },
    });
    expect(contact.publicOperation).toEqual({
      entityName: "contact-message",
      operationName: "submit",
      canonicalKey: "contact-message.submit",
      kind: "create",
      route: "/api/app-installs/site/site/public/operations/contact-message/submit",
      challenge: {
        kind: "turnstile",
        siteKey: "public-site-key",
      },
    });
    expect(subscribe.publicOperation).not.toHaveProperty("fields");
    expect(contact.publicOperation).not.toHaveProperty("fields");
    expect(subscribe.warnings).toEqual([]);
    expect(contact.warnings).toEqual([]);
  });

  it("projects installed CRM subscribe targets without generic field facts", () => {
    const requests: SitePublicOperationTargetRequest[] = [];
    const result = projectRecord(
      blockRecord("rec_site_block_crm_subscribe", {
        type: "subscribeForm",
        label: "Join the CRM list",
        operationName: "subscribe",
        operationTargetKind: "appInstall",
        operationTargetPackageAppKey: "crm",
        operationTargetInstallId: "crm",
      }),
      {
        publicOperationTargetResolver: publicOperationTargetResolver(
          { crm: crmPublicSubscribeSchema },
          requests,
        ),
        turnstileSiteKey: "public-site-key",
      },
    );

    expect(requests).toEqual([
      {
        kind: "appInstall",
        packageAppKey: "crm",
        installId: "crm",
      },
    ]);
    expect(result.publicOperation).toEqual({
      entityName: "subscription",
      operationName: "subscribe",
      canonicalKey: "subscription.subscribe",
      kind: "command",
      target: {
        kind: "appInstall",
        packageAppKey: "crm",
        installId: "crm",
        apiRoutePrefix: "/api/app-installs/crm/crm",
      },
      route: "/api/app-installs/crm/crm/public/operations/subscription/subscribe",
      challenge: {
        kind: "turnstile",
        siteKey: "public-site-key",
      },
    });
    expect(result.publicOperation).not.toHaveProperty("fields");
    expect(result.warnings).toEqual([]);
  });

  it("projects generic schema-key public operation targets with public-safe field facts", () => {
    const requests: SitePublicOperationTargetRequest[] = [];
    const result = projectRecord(
      blockRecord("rec_site_block_public_intake", {
        type: "publicOperationForm",
        label: "Request a test",
        operationTargetKind: "schemaKey",
        operationTargetSchemaKey: "tasks",
        operationKey: "request.submit",
      }),
      {
        publicOperationTargetResolver: publicOperationTargetResolver(
          { tasks: publicIntakeSchema },
          requests,
        ),
        turnstileSiteKey: "public-site-key",
      },
    );

    expect(requests).toEqual([{ kind: "schemaKey", schemaKey: "tasks" }]);
    expect(result.publicOperation).toEqual({
      entityName: "request",
      operationName: "submit",
      canonicalKey: "request.submit",
      kind: "create",
      target: {
        kind: "schemaKey",
        schemaKey: "tasks",
        apiRoutePrefix: "/api/tasks",
      },
      route: "/api/tasks/public/operations/request/submit",
      challenge: {
        kind: "turnstile",
        siteKey: "public-site-key",
      },
      fields: [
        {
          name: "fullName",
          label: "Your name",
          required: true,
          control: "text",
        },
        {
          name: "replyEmail",
          label: "Reply email",
          required: true,
          control: "text",
          format: "email",
          suggestions: ["hello@example.com"],
        },
        {
          name: "phone",
          label: "Phone",
          required: false,
          control: "text",
          format: "phone",
          suggestions: ["+1 555 123 4567"],
        },
        {
          name: "inquiryType",
          label: "Inquiry type",
          required: false,
          control: "text",
          suggestions: ["Support", "Sales"],
        },
        {
          name: "details",
          label: "Request details",
          required: true,
          control: "longText",
        },
        {
          name: "tier",
          label: "Tier",
          required: true,
          control: "enum",
          options: [
            { value: "standard", label: "Standard" },
            { value: "priority", label: "Priority" },
          ],
        },
        {
          name: "acceptedTerms",
          label: "Accepted terms",
          required: true,
          mustBeTrue: true,
          control: "boolean",
        },
        {
          name: "neededBy",
          label: "Needed by",
          required: false,
          control: "date",
        },
        {
          name: "quantity",
          label: "Quantity",
          required: false,
          control: "number",
        },
      ],
    });
    expect(result.warnings).toEqual([]);
  });

  it("projects challenge-free public list bindings for product-specific lookup clients", async () => {
    const result = projectRecord(
      blockRecord("rec_site_block_certificate_lookup", {
        type: "publicOperationForm",
        label: "Verify certificate",
        operationTargetKind: "schemaKey",
        operationTargetSchemaKey: "verifi",
        operationKey: "certificate.lookup",
      }),
      {
        publicOperationTargetResolver: publicOperationTargetResolver({
          verifi: publicCertificateLookupSchema,
        }),
      },
    );

    expect(result.publicOperation).toEqual({
      entityName: "certificate",
      operationName: "lookup",
      canonicalKey: "certificate.lookup",
      kind: "list",
      target: {
        kind: "schemaKey",
        schemaKey: "verifi",
        apiRoutePrefix: "/api/verifi",
      },
      route: "/api/verifi/public/operations/certificate/lookup",
      fields: [
        {
          name: "lookup",
          label: "Verification code",
          required: true,
          control: "text",
        },
      ],
    });
    expect(result.warnings).toEqual([]);

    const binding = result.publicOperation;

    if (!binding) {
      throw new Error("Expected projected public certificate lookup binding.");
    }

    const body = buildPublicOperationRequestBody({
      input: { lookup: "CODE-ALPHA" },
      siteBlockId: "rec_site_block_certificate_lookup",
    });
    const response = await submitPublicOperationJson({
      body,
      fetcher: async () =>
        Response.json({
          invocationId: "operation:certificate.lookup:read-1",
          operation: {
            entityName: "certificate",
            operationName: "lookup",
            canonicalKey: "certificate.lookup",
            kind: "list",
          },
          output: {
            type: "list",
            records: [
              {
                verificationCode: "CODE-ALPHA",
                reportNumber: "REPORT-1",
                publicDeliveryReference: "delivery-alpha",
              },
            ],
          },
          status: "accepted",
        }),
      responseGuard: isPublicOperationListResponse,
      route: binding.route,
    });

    expect(body).toEqual({
      input: { lookup: "CODE-ALPHA" },
      source: { siteBlockId: "rec_site_block_certificate_lookup" },
    });
    expect(response.output.records).toEqual([
      {
        verificationCode: "CODE-ALPHA",
        reportNumber: "REPORT-1",
        publicDeliveryReference: "delivery-alpha",
      },
    ]);
    expect(JSON.stringify(response)).not.toContain("customerName");
    expect(JSON.stringify(response)).not.toContain("providerStorageKey");
  });

  it("projects generic installed app public operation targets", () => {
    const requests: SitePublicOperationTargetRequest[] = [];
    const result = projectRecord(
      blockRecord("rec_site_block_installed_intake", {
        type: "publicOperationForm",
        label: "Installed request",
        operationTargetKind: "appInstall",
        operationTargetPackageAppKey: "tasks",
        operationTargetInstallId: "intake",
        operationKey: "request.submit",
      }),
      {
        publicOperationTargetResolver: publicOperationTargetResolver(
          { tasks: publicIntakeSchema },
          requests,
        ),
        turnstileSiteKey: "public-site-key",
      },
    );

    expect(requests).toEqual([
      {
        kind: "appInstall",
        packageAppKey: "tasks",
        installId: "intake",
      },
    ]);
    expect(result.publicOperation).toMatchObject({
      canonicalKey: "request.submit",
      target: {
        kind: "appInstall",
        packageAppKey: "tasks",
        installId: "intake",
        apiRoutePrefix: "/api/app-installs/tasks/intake",
      },
      route: "/api/app-installs/tasks/intake/public/operations/request/submit",
    });
    expect(result.warnings).toEqual([]);
  });

  it("warns when public operation challenge config is missing", () => {
    const subscribe = projectRecord(
      blockRecord("rec_site_block_subscribe", {
        type: "subscribeForm",
        label: "Join the list",
        operationName: "subscribe",
      }),
    );
    const contact = projectRecord(
      blockRecord("rec_site_block_contact", {
        type: "contactForm",
        label: "Contact us",
        operationName: "submit",
      }),
    );
    const generic = projectRecord(
      blockRecord("rec_site_block_public_intake", {
        type: "publicOperationForm",
        label: "Request a test",
        operationTargetKind: "schemaKey",
        operationTargetSchemaKey: "tasks",
        operationKey: "request.submit",
      }),
      {
        publicOperationTargetResolver: publicOperationTargetResolver({
          tasks: publicIntakeSchema,
        }),
      },
    );

    expect(subscribe.publicOperation).toBeUndefined();
    expect(contact.publicOperation).toBeUndefined();
    expect(generic.publicOperation).toBeUndefined();
    expect([...subscribe.warnings, ...contact.warnings, ...generic.warnings]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "missing-public-operation-challenge-config",
          recordId: "rec_site_block_subscribe",
        }),
        expect.objectContaining({
          code: "missing-public-operation-challenge-config",
          recordId: "rec_site_block_contact",
        }),
        expect.objectContaining({
          code: "missing-public-operation-challenge-config",
          recordId: "rec_site_block_public_intake",
        }),
      ]),
    );
  });

  it("warns when fixed and generic targets are missing or unavailable", () => {
    const missingCrmTarget = projectRecord(
      blockRecord("rec_site_block_missing_crm_target", {
        type: "subscribeForm",
        label: "Missing CRM target",
        operationName: "subscribe",
        operationTargetKind: "appInstall",
        operationTargetPackageAppKey: "crm",
      }),
      {
        publicOperationTargetResolver: publicOperationTargetResolver({}),
        turnstileSiteKey: "public-site-key",
      },
    );
    const unavailableCrmTarget = projectRecord(
      blockRecord("rec_site_block_unavailable_crm_target", {
        type: "subscribeForm",
        label: "Unavailable CRM target",
        operationName: "subscribe",
        operationTargetKind: "appInstall",
        operationTargetPackageAppKey: "crm",
        operationTargetInstallId: "missing",
      }),
      {
        publicOperationTargetResolver: publicOperationTargetResolver({}),
        turnstileSiteKey: "public-site-key",
      },
    );
    const missingGenericTarget = projectRecord(
      blockRecord("rec_site_block_missing_target_intake", {
        type: "publicOperationForm",
        label: "Missing target",
        operationTargetKind: "schemaKey",
        operationKey: "request.submit",
      }),
      {
        publicOperationTargetResolver: publicOperationTargetResolver({}),
        turnstileSiteKey: "public-site-key",
      },
    );
    const unavailableGenericTarget = projectRecord(
      blockRecord("rec_site_block_unavailable_target_intake", {
        type: "publicOperationForm",
        label: "Unavailable target",
        operationTargetKind: "schemaKey",
        operationTargetSchemaKey: "missing",
        operationKey: "request.submit",
      }),
      {
        publicOperationTargetResolver: publicOperationTargetResolver({}),
        turnstileSiteKey: "public-site-key",
      },
    );

    expect(missingCrmTarget.publicOperation).toBeUndefined();
    expect(unavailableCrmTarget.publicOperation).toBeUndefined();
    expect(missingGenericTarget.publicOperation).toBeUndefined();
    expect(unavailableGenericTarget.publicOperation).toBeUndefined();
    expect([
      ...missingCrmTarget.warnings,
      ...unavailableCrmTarget.warnings,
      ...missingGenericTarget.warnings,
      ...unavailableGenericTarget.warnings,
    ]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "missing-public-operation-target",
          recordId: "rec_site_block_missing_crm_target",
        }),
        expect.objectContaining({
          code: "invalid-public-operation-target",
          recordId: "rec_site_block_unavailable_crm_target",
        }),
        expect.objectContaining({
          code: "missing-public-operation-target",
          recordId: "rec_site_block_missing_target_intake",
        }),
        expect.objectContaining({
          code: "invalid-public-operation-target",
          recordId: "rec_site_block_unavailable_target_intake",
        }),
      ]),
    );
  });

  it("warns when fixed or generic operations are missing or not public", () => {
    const missingSubscribe = projectRecord(
      blockRecord("rec_site_block_missing_subscribe", {
        type: "subscribeForm",
        label: "Missing subscribe operation",
        operationName: "missingSubscribeAction",
      }),
      { turnstileSiteKey: "public-site-key" },
    );
    const privateSubscribe = projectRecord(
      blockRecord("rec_site_block_private_subscribe", {
        type: "subscribeForm",
        label: "Private subscribe operation",
        operationName: "addTreeChild",
      }),
      { turnstileSiteKey: "public-site-key" },
    );
    const missingContact = projectRecord(
      blockRecord("rec_site_block_missing_contact", {
        type: "contactForm",
        label: "Missing contact operation",
        operationName: "missingContactSubmit",
      }),
      { turnstileSiteKey: "public-site-key" },
    );
    const privateContact = projectRecord(
      blockRecord("rec_site_block_private_contact", {
        type: "contactForm",
        label: "Private contact operation",
        operationName: "addTreeChild",
      }),
      { turnstileSiteKey: "public-site-key" },
    );
    const missingGeneric = projectRecord(
      blockRecord("rec_site_block_missing_public_intake", {
        type: "publicOperationForm",
        label: "Missing public intake",
        operationTargetKind: "schemaKey",
        operationTargetSchemaKey: "tasks",
        operationKey: "request.missing",
      }),
      {
        publicOperationTargetResolver: publicOperationTargetResolver({
          tasks: publicIntakeSchema,
        }),
        turnstileSiteKey: "public-site-key",
      },
    );
    const privateGeneric = projectRecord(
      blockRecord("rec_site_block_private_public_intake", {
        type: "publicOperationForm",
        label: "Private public intake",
        operationTargetKind: "schemaKey",
        operationTargetSchemaKey: "tasks",
        operationKey: "request.privateSubmit",
      }),
      {
        publicOperationTargetResolver: publicOperationTargetResolver({
          tasks: privateIntakeSchema,
        }),
        turnstileSiteKey: "public-site-key",
      },
    );

    expect(missingSubscribe.publicOperation).toBeUndefined();
    expect(privateSubscribe.publicOperation).toBeUndefined();
    expect(missingContact.publicOperation).toBeUndefined();
    expect(privateContact.publicOperation).toBeUndefined();
    expect(missingGeneric.publicOperation).toBeUndefined();
    expect(privateGeneric.publicOperation).toBeUndefined();
    expect([
      ...missingSubscribe.warnings,
      ...privateSubscribe.warnings,
      ...missingContact.warnings,
      ...privateContact.warnings,
      ...missingGeneric.warnings,
      ...privateGeneric.warnings,
    ]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "missing-public-operation",
          recordId: "rec_site_block_missing_subscribe",
        }),
        expect.objectContaining({
          code: "invalid-public-operation",
          recordId: "rec_site_block_private_subscribe",
        }),
        expect.objectContaining({
          code: "missing-public-operation",
          recordId: "rec_site_block_missing_contact",
        }),
        expect.objectContaining({
          code: "invalid-public-operation",
          recordId: "rec_site_block_private_contact",
        }),
        expect.objectContaining({
          code: "missing-public-operation",
          recordId: "rec_site_block_missing_public_intake",
        }),
        expect.objectContaining({
          code: "invalid-public-operation",
          recordId: "rec_site_block_private_public_intake",
        }),
      ]),
    );
  });

  it("warns and omits generic forms with unsupported required input fields", () => {
    const result = projectRecord(
      blockRecord("rec_site_block_required_reference_intake", {
        type: "publicOperationForm",
        label: "Required reference",
        operationTargetKind: "schemaKey",
        operationTargetSchemaKey: "crm",
        operationKey: "request.submit",
      }),
      {
        publicOperationTargetResolver: publicOperationTargetResolver({
          crm: requiredReferenceIntakeSchema,
        }),
        turnstileSiteKey: "public-site-key",
      },
    );

    expect(result.publicOperation).toBeUndefined();
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: "unsupported-public-operation-input",
        recordId: "rec_site_block_required_reference_intake",
        message: expect.stringContaining('"owner"'),
      }),
    ]);
  });
});

function projectRecord(
  record: StoredRecord,
  options: {
    schema?: AppSchema;
    publicOperationTargetResolver?: SitePublicOperationTargetResolver;
    publicOperationApiRoutePrefix?: `/${string}`;
    turnstileSiteKey?: string;
  } = {},
): {
  publicOperation: ReturnType<typeof projectSitePublicOperationBlock>;
  warnings: SiteTreeWarning[];
} {
  const warnings: SiteTreeWarning[] = [];

  return {
    publicOperation: projectSitePublicOperationBlock({
      record,
      type: typeof record.values.type === "string" ? record.values.type : "",
      schema: options.schema ?? siteSourceSchema,
      ...(options.publicOperationTargetResolver === undefined
        ? {}
        : { publicOperationTargetResolver: options.publicOperationTargetResolver }),
      publicOperationApiRoutePrefix: options.publicOperationApiRoutePrefix ?? "/api/site",
      ...(options.turnstileSiteKey === undefined
        ? {}
        : { turnstileSiteKey: options.turnstileSiteKey }),
      warnings,
    }),
    warnings,
  };
}

function publicOperationTargetResolver(
  schemas: Partial<Record<string, AppSchema>>,
  requests: SitePublicOperationTargetRequest[] = [],
): SitePublicOperationTargetResolver {
  return (request) => {
    requests.push(request);

    if (request.kind === "schemaKey") {
      const schema = schemas[request.schemaKey];

      return schema
        ? {
            schema,
            route: {
              kind: "schemaKey",
              schemaKey: request.schemaKey,
              apiRoutePrefix: `/api/${request.schemaKey}`,
            },
          }
        : undefined;
    }

    const schema = schemas[request.packageAppKey];

    return schema
      ? {
          schema,
          route: {
            kind: "appInstall",
            packageAppKey: request.packageAppKey,
            installId: request.installId,
            apiRoutePrefix: `/api/app-installs/${request.packageAppKey}/${request.installId}`,
          },
        }
      : undefined;
  };
}

function blockRecord(id: string, values: StoredRecord["values"]): StoredRecord {
  return {
    id,
    entity: "block",
    values,
    createdAt: "2026-05-06T00:00:00.000Z",
  };
}

const anonymousTurnstilePolicy = {
  actors: ["anonymous"],
  access: {
    actor: "anonymous",
    challenge: {
      kind: "turnstile",
    },
    origin: {
      kind: "same-origin",
    },
  },
} satisfies NonNullable<EntityOperationSchema["policy"]>;

const ownerPolicy = {
  actors: ["owner"],
} satisfies NonNullable<EntityOperationSchema["policy"]>;
const crmPublicSubscribeSchema = {
  version: 1,
  entities: [
    {
      id: "entity_94d526cd-1d4f-4238-b2a7-703877446e49",
      key: "subscription",
      label: "Subscription",
      fields: [
        {
          key: "email",
          type: "text",
          required: true,
          label: "Email",
        },
      ],
      operations: [
        {
          key: "subscribe",
          label: "Subscribe",
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
          output: {
            type: "command",
          },
          idempotency: {
            required: true,
          },
          audit: {
            input: "summary",
          },
          policy: anonymousTurnstilePolicy,
        },
      ],
    },
  ],
  queries: [],
  itemViews: [],
  tableViews: [],
  views: [],
  screens: fixtureScreens(),
} satisfies AppSchema;
const publicIntakeSchema = {
  version: 1,
  entities: [
    {
      id: "entity_3f45d5bf-f70c-4f01-9d7b-941346befc4e",
      key: "owner",
      label: "Owner",
      fields: [
        {
          key: "label",
          type: "text",
          required: true,
          label: "Label",
        },
      ],
    },
    {
      id: "entity_677c6f04-69c5-4559-9c53-a171a04330b7",
      key: "request",
      label: "Request",
      fields: [
        {
          key: "name",
          type: "text",
          required: true,
          label: "Name",
        },
        {
          key: "details",
          type: "text",
          required: true,
          label: "Request details",
          format: "longText",
        },
        {
          key: "email",
          type: "text",
          required: true,
          label: "Email",
          format: "email",
          suggestions: ["hello@example.com"],
        },
        {
          key: "phone",
          type: "text",
          required: false,
          label: "Phone",
          format: "phone",
          suggestions: ["+1 555 123 4567"],
        },
        {
          key: "inquiryType",
          type: "text",
          required: false,
          label: "Inquiry type",
          suggestions: ["Support", "Sales"],
        },
        {
          key: "tier",
          type: "enum",
          required: true,
          label: "Tier",
          values: [
            { key: "standard", label: "Standard" },
            { key: "priority", label: "Priority" },
          ],
        },
        {
          key: "acceptedTerms",
          type: "boolean",
          required: true,
          label: "Accepted terms",
        },
        {
          key: "neededBy",
          type: "date",
          required: false,
          label: "Needed by",
        },
        {
          key: "quantity",
          type: "number",
          required: false,
          label: "Quantity",
        },
        {
          key: "owner",
          type: "reference",
          required: false,
          label: "Owner",
          to: "owner",
          displayField: "label",
        },
      ],
      operations: [
        {
          key: "submit",
          label: "Submit request",
          kind: "create",
          scope: "collection",
          input: {
            fields: [
              {
                key: "fullName",
                field: "name",
                required: true,
                label: "Your name",
              },
              {
                key: "replyEmail",
                field: "email",
                required: true,
                label: "Reply email",
              },
              {
                key: "phone",
                field: "phone",
              },
              {
                key: "inquiryType",
                field: "inquiryType",
              },
              {
                key: "details",
                field: "details",
                required: true,
              },
              {
                key: "tier",
                field: "tier",
                required: true,
              },
              {
                key: "acceptedTerms",
                field: "acceptedTerms",
                required: true,
                mustBeTrue: true,
              },
              {
                key: "neededBy",
                field: "neededBy",
              },
              {
                key: "quantity",
                field: "quantity",
              },
              {
                key: "owner",
                field: "owner",
              },
            ],
          },
          effect: {
            type: "createRecord",
          },
          output: {
            type: "create",
          },
          idempotency: {
            required: true,
          },
          audit: {
            input: "summary",
          },
          policy: anonymousTurnstilePolicy,
        },
      ],
    },
  ],
  queries: [],
  itemViews: [],
  tableViews: [],
  views: [],
  screens: fixtureScreens(),
} satisfies AppSchema;
const publicCertificateLookupSchema = {
  version: 1,
  entities: [
    {
      id: "entity_8645511e-109d-437c-8bbb-6b9e907484c0",
      key: "certificate",
      label: "Certificate",
      fields: [
        {
          key: "verificationCode",
          type: "text",
          required: true,
          label: "Verification code",
        },
        {
          key: "reportNumber",
          type: "text",
          required: true,
          label: "Report number",
        },
        {
          key: "publicDeliveryReference",
          type: "text",
          required: true,
          label: "Public delivery reference",
        },
        {
          key: "customerName",
          type: "text",
          required: true,
          label: "Customer",
        },
        {
          key: "providerStorageKey",
          type: "text",
          required: true,
          label: "Provider storage key",
        },
      ],
      operations: [
        {
          key: "lookup",
          kind: "list",
          scope: "collection",
          input: {
            fields: [
              {
                key: "lookup",
                type: "text",
                required: true,
                label: "Verification code",
              },
            ],
          },
          output: {
            type: "list",
            query: "certificateLookup",
            maxResults: 2,
          },
          idempotency: { required: false },
          audit: { input: "summary" },
          policy: {
            actors: ["anonymous"],
            access: {
              actor: "anonymous",
              origin: { kind: "same-origin" },
              rateLimit: { maxRequests: 10, windowSeconds: 60 },
            },
            responseFields: {
              anonymous: ["verificationCode", "reportNumber", "publicDeliveryReference"],
            },
          },
        },
      ],
    },
  ],
  queries: [
    {
      key: "certificateLookup",
      label: "Certificate lookup",
      entity: "certificate",
      expression: {
        kind: "where",
        ref: { kind: "value", name: "verificationCode" },
        op: "eq",
        value: { kind: "context", name: "lookup" },
      },
    },
  ],
  itemViews: [],
  tableViews: [],
  views: [],
  screens: fixtureScreens(),
} satisfies AppSchema;
const privateIntakeSchema = {
  version: 1,
  entities: [
    {
      ...publicIntakeSchema.entities.find(({ key }) => key === "request")!,
      operations: [
        {
          ...publicIntakeSchema.entities
            .find(({ key }) => key === "request")!
            .operations!.find(({ key }) => key === "submit")!,
          key: "privateSubmit",
          policy: ownerPolicy,
        },
      ],
    },
  ],
  queries: [],
  itemViews: [],
  tableViews: [],
  views: [],
  screens: fixtureScreens(),
} satisfies AppSchema;
const requiredReferenceIntakeSchema = {
  version: 1,
  entities: [
    {
      id: "entity_2a206596-3c78-40e5-a79a-6cafd4a82ec2",
      key: "owner",
      label: "Owner",
      fields: [
        {
          key: "label",
          type: "text",
          required: true,
          label: "Label",
        },
      ],
    },
    {
      id: "entity_daef89ae-3be8-475d-b612-e1b5158ff515",
      key: "request",
      label: "Request",
      fields: [
        {
          key: "owner",
          type: "reference",
          required: true,
          label: "Owner",
          to: "owner",
          displayField: "label",
        },
      ],
      operations: [
        {
          key: "submit",
          label: "Submit request",
          kind: "create",
          scope: "collection",
          input: {
            fields: [
              {
                key: "owner",
                field: "owner",
                required: true,
              },
            ],
          },
          effect: {
            type: "createRecord",
          },
          output: {
            type: "create",
          },
          idempotency: {
            required: true,
          },
          audit: {
            input: "summary",
          },
          policy: anonymousTurnstilePolicy,
        },
      ],
    },
  ],
  queries: [],
  itemViews: [],
  tableViews: [],
  views: [],
  screens: fixtureScreens(),
} satisfies AppSchema;
function fixtureScreens(): AppSchema["screens"] {
  return [
    {
      key: "fixture",
      type: "workspace",
      label: "Fixture",
      layout: {
        type: "stack",
        sections: [{ id: "fixture", type: "collection", view: "fixture" }],
      },
    },
  ];
}
