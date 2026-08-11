import { describe, expect, it } from "vite-plus/test";

import {
  hasAnonymousTurnstileSameOriginAccess,
  isAnonymousPublicOperationExecutable,
  parseAppSchema,
  projectPublicSafeOperationInputFields,
  selectAnonymousPublicOperation,
  selectAnonymousPublicOperationByKey,
  type AppSchema,
  type EntityOperationSchema,
} from "./index.ts";

describe("schema public operation facts", () => {
  it("parses anonymous public handler policy and rejects invalid public declarations", () => {
    const schema = parseAppSchema(
      publicOperationSchema({
        subscribe: publicHandlerOperation(),
      }),
    );
    expect(
      schema.entities
        .find((definition) => definition.key === "request")!
        .operations?.find((definition) => definition.key === "subscribe"),
    ).toMatchObject({
      kind: "command",
      input: {
        fields: [{ key: "email", type: "text", required: true, label: "Email" }],
      },
      effect: {
        type: "operationHandler",
        handler: "contact-subscription.subscribe",
      },
      policy: anonymousTurnstileSameOriginPolicy(),
    });

    const invalidCases = [
      {
        operation: publicHandlerOperation({
          policy: {
            actors: ["anonymous"],
            access: {
              actor: "authenticated",
              challenge: { kind: "turnstile" },
              origin: { kind: "same-origin" },
            },
          },
        }),
        message: 'access actor must be "anonymous"',
      },
      {
        operation: publicHandlerOperation({
          policy: {
            actors: ["anonymous"],
            access: {
              actor: "anonymous",
              challenge: { kind: "none" },
              origin: { kind: "same-origin" },
            },
          },
        }),
        message: 'challenge kind must be "turnstile"',
      },
      {
        operation: publicHandlerOperation({
          policy: {
            actors: ["anonymous"],
            access: {
              actor: "anonymous",
              origin: { kind: "same-origin" },
            },
          },
        }),
        message: "anonymous command access requires a Turnstile challenge",
      },
      {
        operation: publicHandlerOperation({
          policy: {
            actors: ["anonymous"],
            access: {
              actor: "anonymous",
              challenge: { kind: "turnstile" },
              origin: { kind: "any" },
            },
          },
        }),
        message: 'origin kind must be "same-origin"',
      },
      {
        operation: publicHandlerOperation({ input: undefined }),
        message: "anonymous actor policy requires explicit input",
      },
      {
        operation: publicHandlerOperation({
          target: { query: "requestCompleted" },
          effect: {
            type: "operationHandler",
            handler: "tombstone-query-results",
            config: { query: "requestCompleted" },
          },
        }),
        message: "command effect is not eligible for public execution",
      },
      {
        operation: publicHandlerOperation({
          input: {
            fields: [{ key: "owner", type: "reference", required: true, to: "owner" }],
          },
        }),
        message: 'has unsupported type "reference"',
      },
    ];

    for (const invalidCase of invalidCases) {
      expect(() =>
        parseAppSchema(
          publicOperationSchema({
            subscribe: invalidCase.operation,
          }),
        ),
      ).toThrow(invalidCase.message);
    }
  });

  it("selects anonymous public create, record-plan command, and public handler command operations", () => {
    const schema = publicOperationSchema({
      createRequest: publicCreateOperation(),
      submitPlan: publicRecordPlanOperation(),
      subscribe: publicHandlerOperation(),
      privateCreate: {
        ...publicCreateOperation(),
        policy: { actors: ["owner"] },
      },
      unsupportedCommand: {
        ...publicRecordPlanOperation(),
        effect: {
          type: "operationHandler",
          handler: "tombstone-query-results",
          config: { query: "requests" },
        },
      },
    });

    expect(selectAnonymousPublicOperationByKey(schema, "request.createRequest")).toMatchObject({
      kind: "available",
      canonicalKey: "request.createRequest",
      entityName: "request",
      executionKind: "create",
      operationName: "createRequest",
    });
    expect(
      selectAnonymousPublicOperation(schema, {
        entityName: "request",
        operationName: "submitPlan",
      }),
    ).toMatchObject({
      kind: "available",
      canonicalKey: "request.submitPlan",
      executionKind: "recordPlanCommand",
    });
    expect(selectAnonymousPublicOperationByKey(schema, "request.subscribe")).toMatchObject({
      kind: "available",
      canonicalKey: "request.subscribe",
      executionKind: "handlerCommand",
    });
    expect(selectAnonymousPublicOperationByKey(schema, "request.privateCreate")).toMatchObject({
      kind: "unavailable",
      reason: "unsupported-policy",
    });
    expect(selectAnonymousPublicOperationByKey(schema, "request.unsupportedCommand")).toMatchObject(
      {
        kind: "unavailable",
        reason: "unsupported-effect",
      },
    );
    expect(selectAnonymousPublicOperationByKey(schema, "bad key")).toMatchObject({
      kind: "unavailable",
      reason: "invalid-key",
    });
    expect(selectAnonymousPublicOperationByKey(schema, "request.missing")).toMatchObject({
      kind: "unavailable",
      reason: "missing-operation",
    });
  });

  it("derives anonymous Turnstile same-origin policy facts from operation policy", () => {
    const operation = publicCreateOperation();
    const noAnonymousActor = {
      ...operation,
      policy: { actors: ["owner"] },
    } satisfies EntityOperationSchema;
    const noAccess = {
      ...operation,
      policy: { actors: ["anonymous"] },
    } satisfies EntityOperationSchema;
    const differentOrigin = {
      ...operation,
      policy: {
        actors: ["anonymous"],
        access: {
          actor: "anonymous",
          challenge: { kind: "turnstile" },
          origin: { kind: "cross-origin" },
        },
      },
    } as unknown as EntityOperationSchema;

    expect(hasAnonymousTurnstileSameOriginAccess(operation)).toBe(true);
    expect(hasAnonymousTurnstileSameOriginAccess(noAnonymousActor)).toBe(false);
    expect(hasAnonymousTurnstileSameOriginAccess(noAccess)).toBe(false);
    expect(hasAnonymousTurnstileSameOriginAccess(differentOrigin)).toBe(false);
    expect(isAnonymousPublicOperationExecutable(operation)).toBe(true);
  });

  it("projects public-safe scalar input controls, enum labels, and label precedence", () => {
    const schema = publicOperationSchema({
      createRequest: {
        ...publicCreateOperation(),
        input: {
          fields: [
            {
              key: "operationLabel",
              field: "name",
              required: true,
              label: "Operation label wins",
            },
            {
              key: "entityLabel",
              field: "details",
              required: true,
            },
            {
              key: "fallbackLabel",
              field: "fallback",
              required: false,
            },
            {
              key: "replyEmail",
              field: "email",
              required: true,
              label: "Reply email",
            },
            {
              key: "inquiryType",
              field: "inquiryType",
              required: false,
            },
            {
              key: "tier",
              field: "tier",
              required: true,
            },
            {
              key: "acceptedTerms",
              field: "acceptedTerms",
              required: false,
            },
            {
              key: "consent",
              field: "done",
              required: true,
              mustBeTrue: true,
            },
            {
              key: "neededBy",
              field: "neededBy",
              required: false,
            },
            {
              key: "quantity",
              field: "quantity",
              required: false,
            },
            {
              key: "inlineNote",
              type: "text",
              required: false,
              label: "Inline note",
            },
            {
              key: "inlinePhone",
              type: "text",
              required: false,
              format: "phone",
              suggestions: ["+1 555 123 4567"],
              label: "Inline phone",
            },
            {
              key: "inlineTier",
              type: "enum",
              required: false,
              label: "Inline tier",
              values: [
                { key: "standard", label: "Standard inline" },
                { key: "priority", label: "Priority inline" },
              ],
            },
          ],
        },
      },
    });
    const entity = schema.entities.find((definition) => definition.key === "request")!;
    const operation = entity.operations?.find((definition) => definition.key === "createRequest");
    if (!operation) {
      throw new Error("Expected createRequest operation.");
    }

    expect(projectPublicSafeOperationInputFields({ entity, operation })).toEqual({
      unsupportedRequiredFields: [],
      fields: [
        {
          name: "operationLabel",
          label: "Operation label wins",
          required: true,
          control: "text",
        },
        {
          name: "entityLabel",
          label: "Request details",
          required: true,
          control: "longText",
        },
        {
          name: "fallbackLabel",
          label: "fallbackLabel",
          required: false,
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
          name: "inquiryType",
          label: "Inquiry type",
          required: false,
          control: "text",
          suggestions: ["Support", "Sales"],
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
          required: false,
          control: "boolean",
        },
        {
          name: "consent",
          label: "Done",
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
        {
          name: "inlineNote",
          label: "Inline note",
          required: false,
          control: "text",
        },
        {
          name: "inlinePhone",
          label: "Inline phone",
          required: false,
          control: "text",
          format: "phone",
          suggestions: ["+1 555 123 4567"],
        },
        {
          name: "inlineTier",
          label: "Inline tier",
          required: false,
          control: "enum",
          options: [
            { value: "standard", label: "Standard inline" },
            { value: "priority", label: "Priority inline" },
          ],
        },
      ],
    });
  });

  it("projects affirmative constraints from inline boolean input", () => {
    const schema = publicOperationSchema({
      submitRequest: {
        ...publicRecordPlanOperation(),
        input: {
          fields: [
            {
              key: "ordinaryBoolean",
              type: "boolean",
              required: true,
              label: "Ordinary boolean",
            },
            {
              key: "consent",
              type: "boolean",
              required: true,
              label: "Consent",
              mustBeTrue: true,
            },
          ],
        },
      },
    });
    const entity = schema.entities.find((definition) => definition.key === "request")!;
    const operation = entity.operations?.find((definition) => definition.key === "submitRequest");
    if (!operation) {
      throw new Error("Expected submitRequest operation.");
    }

    expect(projectPublicSafeOperationInputFields({ entity, operation })).toEqual({
      unsupportedRequiredFields: [],
      fields: [
        {
          name: "ordinaryBoolean",
          label: "Ordinary boolean",
          required: true,
          control: "boolean",
        },
        {
          name: "consent",
          label: "Consent",
          required: true,
          mustBeTrue: true,
          control: "boolean",
        },
      ],
    });
  });

  it("reports unsupported required inputs and omits optional unsupported inputs", () => {
    const schema = publicOperationSchema({
      createRequest: {
        ...publicCreateOperation(),
        input: {
          fields: [
            {
              key: "title",
              field: "name",
              required: true,
            },
            {
              key: "optionalOwner",
              field: "owner",
              required: false,
            },
            {
              key: "requiredOwner",
              field: "owner",
              required: true,
            },
            {
              key: "requiredQueryChoice",
              type: "queryChoice",
              required: true,
              label: "Catalog item",
              query: "catalogItems",
            } as never,
            {
              key: "optionalQueryChoice",
              type: "queryChoice",
              required: false,
              label: "Optional catalog item",
              query: "catalogItems",
            } as never,
          ],
        },
      },
    });
    const entity = schema.entities.find((definition) => definition.key === "request")!;
    const operation = entity.operations?.find((definition) => definition.key === "createRequest");
    if (!operation) {
      throw new Error("Expected createRequest operation.");
    }

    expect(projectPublicSafeOperationInputFields({ entity, operation })).toEqual({
      fields: [
        {
          name: "title",
          label: "Name",
          required: true,
          control: "text",
        },
      ],
      unsupportedRequiredFields: ["requiredOwner", "requiredQueryChoice"],
    });
  });
});

function publicOperationSchema(operations: Record<string, EntityOperationSchema>): AppSchema {
  return {
    version: 1,
    entities: [
      {
        key: "owner",
        id: "entity_6342e89f-52dc-4498-8bdf-07798e6420da",
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
        key: "request",
        id: "entity_7ce2a154-ea02-485d-9442-c3661e87e48a",
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
            key: "fallback",
            type: "text",
            required: false,
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
            required: false,
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
            key: "done",
            type: "boolean",
            required: true,
            label: "Done",
            default: false,
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
        operations: Object.entries(operations).map(([key, operation]) => ({ key, ...operation })),
      },
    ],
    queries: [
      {
        key: "requests",
        label: "Requests",
        entity: "request",
        expression: { kind: "all" },
      },
      {
        key: "requestCompleted",
        label: "Completed requests",
        entity: "request",
        expression: {
          kind: "where",
          ref: { kind: "value", name: "done" },
          op: "eq",
          value: true,
        },
      },
    ],
    itemViews: [
      {
        key: "requestItem",
        entity: "request",
        fields: [{ field: "name", editor: "text", commit: "field-commit" }],
      },
    ],
    tableViews: [],
    views: [
      {
        key: "requestHome",
        type: "collection",
        label: "Requests",
        entity: "request",
        queries: [{ query: "requests" }],
        defaultQuery: "requests",
        result: { type: "list", itemView: "requestItem" },
      },
    ],
    screens: [
      {
        key: "home",
        type: "workspace",
        label: "Requests",
        layout: {
          type: "stack",
          surface: "constrained",
          width: "standard",
          sections: [{ id: "requests", type: "collection", view: "requestHome" }],
        },
      },
    ],
  };
}
function publicCreateOperation(): EntityOperationSchema {
  return {
    label: "Create request",
    kind: "create",
    scope: "collection",
    input: {
      fields: [
        {
          key: "name",
          field: "name",
          required: true,
        },
      ],
    },
    effect: { type: "createRecord" },
    output: { type: "create" },
    idempotency: { required: true },
    audit: { input: "summary" },
    policy: anonymousTurnstileSameOriginPolicy(),
  };
}

function publicRecordPlanOperation(): EntityOperationSchema {
  return {
    label: "Submit request plan",
    kind: "command",
    scope: "collection",
    input: {
      fields: [
        {
          key: "title",
          type: "text",
          required: true,
          label: "Title",
        },
      ],
    },
    effect: {
      type: "recordPlan",
      steps: [
        {
          name: "createRequest",
          kind: "create",
          entity: "request",
          values: {
            name: { kind: "input", field: "title" },
          },
        },
      ],
    },
    output: { type: "command" },
    idempotency: { required: true },
    audit: { input: "summary" },
    policy: anonymousTurnstileSameOriginPolicy(),
  };
}

function publicHandlerOperation(overrides: Record<string, unknown> = {}): EntityOperationSchema {
  return {
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
      handler: "contact-subscription.subscribe",
      config: {},
    },
    output: { type: "command" },
    idempotency: { required: true },
    audit: { input: "summary" },
    policy: anonymousTurnstileSameOriginPolicy(),
    ...overrides,
  } as EntityOperationSchema;
}

function anonymousTurnstileSameOriginPolicy(): EntityOperationSchema["policy"] {
  return {
    actors: ["anonymous"],
    access: {
      actor: "anonymous",
      challenge: { kind: "turnstile" },
      origin: { kind: "same-origin" },
    },
  };
}
