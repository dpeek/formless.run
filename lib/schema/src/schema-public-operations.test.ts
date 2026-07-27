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

    expect(schema.entities.request?.operations?.subscribe).toMatchObject({
      kind: "command",
      input: {
        fields: {
          email: { type: "text", required: true, label: "Email" },
        },
      },
      effect: {
        type: "operationHandler",
        handler: "subscribe",
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
            handler: "clear-completed",
            config: { query: "requestCompleted" },
          },
        }),
        message: "command effect is not eligible for public execution",
      },
      {
        operation: publicHandlerOperation({
          input: {
            fields: {
              owner: { type: "reference", required: true, to: "owner" },
            },
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
          handler: "clear-completed",
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
          fields: {
            operationLabel: {
              field: "name",
              required: true,
              label: "Operation label wins",
            },
            entityLabel: {
              field: "details",
              required: true,
            },
            fallbackLabel: {
              field: "fallback",
              required: false,
            },
            replyEmail: {
              field: "email",
              required: true,
              label: "Reply email",
            },
            inquiryType: {
              field: "inquiryType",
              required: false,
            },
            tier: {
              field: "tier",
              required: true,
            },
            acceptedTerms: {
              field: "acceptedTerms",
              required: false,
            },
            consent: {
              field: "done",
              required: true,
              mustBeTrue: true,
            },
            neededBy: {
              field: "neededBy",
              required: false,
            },
            quantity: {
              field: "quantity",
              required: false,
            },
            inlineNote: {
              type: "text",
              required: false,
              label: "Inline note",
            },
            inlinePhone: {
              type: "text",
              required: false,
              format: "phone",
              suggestions: ["+1 555 123 4567"],
              label: "Inline phone",
            },
            inlineTier: {
              type: "enum",
              required: false,
              label: "Inline tier",
              values: {
                standard: { label: "Standard inline" },
                priority: { label: "Priority inline" },
              },
            },
          },
        },
      },
    });
    const entity = schema.entities.request;
    const operation = entity.operations?.createRequest;

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

  it("reports unsupported required inputs and omits optional unsupported inputs", () => {
    const schema = publicOperationSchema({
      createRequest: {
        ...publicCreateOperation(),
        input: {
          fields: {
            title: {
              field: "name",
              required: true,
            },
            optionalOwner: {
              field: "owner",
              required: false,
            },
            requiredOwner: {
              field: "owner",
              required: true,
            },
            requiredQueryChoice: {
              type: "queryChoice",
              required: true,
              label: "Catalog item",
              query: "catalogItems",
            } as never,
            optionalQueryChoice: {
              type: "queryChoice",
              required: false,
              label: "Optional catalog item",
              query: "catalogItems",
            } as never,
          },
        },
      },
    });
    const entity = schema.entities.request;
    const operation = entity.operations?.createRequest;

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
    entities: {
      owner: {
        label: "Owner",
        fields: {
          label: {
            type: "text",
            required: true,
            label: "Label",
          },
        },
      },
      request: {
        label: "Request",
        fields: {
          name: {
            type: "text",
            required: true,
            label: "Name",
          },
          details: {
            type: "text",
            required: true,
            label: "Request details",
            format: "longText",
          },
          fallback: {
            type: "text",
            required: false,
          },
          email: {
            type: "text",
            required: true,
            label: "Email",
            format: "email",
            suggestions: ["hello@example.com"],
          },
          inquiryType: {
            type: "text",
            required: false,
            label: "Inquiry type",
            suggestions: ["Support", "Sales"],
          },
          tier: {
            type: "enum",
            required: true,
            label: "Tier",
            values: {
              standard: { label: "Standard" },
              priority: { label: "Priority" },
            },
          },
          acceptedTerms: {
            type: "boolean",
            required: false,
            label: "Accepted terms",
          },
          neededBy: {
            type: "date",
            required: false,
            label: "Needed by",
          },
          quantity: {
            type: "number",
            required: false,
            label: "Quantity",
          },
          done: {
            type: "boolean",
            required: true,
            label: "Done",
            default: false,
          },
          owner: {
            type: "reference",
            required: false,
            label: "Owner",
            to: "owner",
            displayField: "label",
          },
        },
        operations,
      },
    },
    queries: {
      requests: {
        label: "Requests",
        entity: "request",
        expression: { kind: "all" },
      },
      requestCompleted: {
        label: "Completed requests",
        entity: "request",
        expression: {
          kind: "where",
          ref: { kind: "value", name: "done" },
          op: "eq",
          value: true,
        },
      },
    },
    itemViews: {
      requestItem: {
        entity: "request",
        fields: {
          name: { editor: "text", commit: "field-commit" },
        },
      },
    },
    tableViews: {},
    views: {
      requestHome: {
        type: "collection",
        label: "Requests",
        entity: "request",
        queries: [{ query: "requests" }],
        defaultQuery: "requests",
        result: { type: "list", itemView: "requestItem" },
      },
    },
    screens: {
      home: {
        type: "workspace",
        label: "Requests",
        navigation: { primary: true },
        layout: {
          type: "stack",
          sections: [{ id: "requests", type: "collection", view: "requestHome" }],
        },
      },
    },
  };
}

function publicCreateOperation(): EntityOperationSchema {
  return {
    label: "Create request",
    kind: "create",
    scope: "collection",
    input: {
      fields: {
        name: {
          field: "name",
          required: true,
        },
      },
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
      fields: {
        title: {
          type: "text",
          required: true,
          label: "Title",
        },
      },
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
      fields: {
        email: {
          type: "text",
          required: true,
          label: "Email",
        },
      },
    },
    effect: {
      type: "operationHandler",
      handler: "subscribe",
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
