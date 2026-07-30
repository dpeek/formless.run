import { describe, expect, it } from "vite-plus/test";

import {
  parseAppSchema,
  PUBLIC_LIST_OPERATION_MAX_RESULTS,
  selectAnonymousPublicOperationByKey,
} from "./index.ts";

describe("schema public read bindings", () => {
  it("parses compatible scalar list bindings with bounded anonymous output", () => {
    const scalarCases = [
      {
        name: "code",
        field: { type: "text", required: true, label: "Code" },
        input: { type: "text", required: true, label: "Code" },
      },
      {
        name: "published",
        field: { type: "boolean", required: true, label: "Published" },
        input: { type: "boolean", required: true, label: "Published" },
      },
      {
        name: "issuedOn",
        field: { type: "date", required: true, label: "Issued on" },
        input: { type: "date", required: true, label: "Issued on" },
      },
      {
        name: "reportNumber",
        field: { type: "number", required: true, label: "Report number" },
        input: { type: "number", required: true, label: "Report number" },
      },
      {
        name: "status",
        field: {
          type: "enum",
          required: true,
          label: "Status",
          values: [{ key: "published", label: "Published" }],
        },
        input: {
          type: "enum",
          required: true,
          label: "Status",
          values: [{ key: "published", label: "Published" }],
        },
      },
    ] as const;

    for (const scalarCase of scalarCases) {
      const schema = parseAppSchema(
        publicLookupSchema({
          fieldName: scalarCase.name,
          field: scalarCase.field,
          input: scalarCase.input,
        }),
      );
      expect(
        schema.entities
          .find((definition) => definition.key === "certificate")!
          .operations?.find((definition) => definition.key === "lookup"),
      ).toMatchObject({
        input: { fields: [{ key: "lookup", ...scalarCase.input }] },
        output: { type: "list", query: "publicLookup", maxResults: 5 },
        policy: {
          actors: ["anonymous"],
          access: {
            actor: "anonymous",
            origin: { kind: "same-origin" },
            rateLimit: { maxRequests: 10, windowSeconds: 60 },
          },
          responseFields: { anonymous: [scalarCase.name] },
        },
      });
      expect(selectAnonymousPublicOperationByKey(schema, "certificate.lookup")).toMatchObject({
        kind: "available",
        canonicalKey: "certificate.lookup",
        executionKind: "list",
      });
    }
  });

  it("keeps explicit anonymous public safeguards separate from operation admission", () => {
    const schema = parseAppSchema(
      publicLookupSchema({
        access: { actor: "anonymous" },
        policy: {
          access: publicReadAccess(),
          responseFields: { anonymous: ["code"] },
        },
      }),
    );
    const operation = schema.entities[0].operations?.[0];

    expect(operation?.access).toEqual({ actor: "anonymous" });
    expect(operation?.policy).toEqual({
      access: publicReadAccess(),
      responseFields: { anonymous: ["code"] },
    });
    expect(selectAnonymousPublicOperationByKey(schema, "certificate.lookup")).toMatchObject({
      kind: "available",
      canonicalKey: "certificate.lookup",
      executionKind: "list",
    });
  });

  it("accepts disjunctive lookups only when every matching branch requires exact input", () => {
    const expression = {
      kind: "or",
      expressions: [
        {
          kind: "and",
          expressions: [
            {
              kind: "where",
              ref: { kind: "value", name: "status" },
              op: "eq",
              value: "published",
            },
            inputEquality("code"),
          ],
        },
        inputEquality("alternateCode"),
      ],
    };
    const schema = parseAppSchema(
      publicLookupSchema({
        expression,
        extraFields: [
          { key: "alternateCode", type: "text", required: true, label: "Alternate code" },
          {
            key: "status",
            type: "enum",
            required: true,
            label: "Status",
            values: [{ key: "published", label: "Published" }],
          },
        ],
      }),
    );
    expect(
      schema.queries.find((definition) => definition.key === "publicLookup")!.expression,
    ).toEqual(expression);
  });
  it("rejects unbounded, over-ceiling, or input-independent public list output", () => {
    const invalidCases = [
      {
        schema: publicLookupSchema({ output: { type: "list", query: "publicLookup" } }),
        message: "anonymous list output maxResults",
      },
      {
        schema: publicLookupSchema({
          output: {
            type: "list",
            query: "publicLookup",
            maxResults: PUBLIC_LIST_OPERATION_MAX_RESULTS + 1,
          },
        }),
        message: `maxResults must be at most ${PUBLIC_LIST_OPERATION_MAX_RESULTS}`,
      },
      {
        schema: publicLookupSchema({
          output: { type: "list", query: "publicLookup", maxResults: 0 },
        }),
        message: "maxResults must be a positive integer",
      },
      {
        schema: publicLookupSchema({ expression: { kind: "all" } }),
        message: "exact equality against declared input on every matching branch",
      },
      {
        schema: publicLookupSchema({
          expression: {
            kind: "or",
            expressions: [
              inputEquality("code"),
              {
                kind: "where",
                ref: { kind: "value", name: "published" },
                op: "eq",
                value: true,
              },
            ],
          },
        }),
        message: "exact equality against declared input on every matching branch",
      },
    ];

    for (const invalidCase of invalidCases) {
      expect(() => parseAppSchema(invalidCase.schema)).toThrow(invalidCase.message);
    }
  });

  it("rejects undeclared, optional, or incompatible public list query context", () => {
    const invalidCases = [
      {
        schema: publicLookupSchema({
          expression: {
            kind: "where",
            ref: { kind: "value", name: "code" },
            op: "eq",
            value: { kind: "context", name: "missing" },
          },
        }),
        message: 'context "missing" references undeclared input',
      },
      {
        schema: publicLookupSchema({
          input: { type: "text", required: false, label: "Code" },
        }),
        message: 'context "lookup" requires required input',
      },
      {
        schema: publicLookupSchema({
          input: { type: "number", required: true, label: "Code" },
        }),
        message: 'context "lookup" is incompatible with value field "code"',
      },
      {
        schema: publicLookupSchema({
          fieldName: "status",
          field: {
            type: "enum",
            required: true,
            label: "Status",
            values: [{ key: "published", label: "Published" }],
          },
          input: {
            type: "enum",
            required: true,
            label: "Status",
            values: [{ key: "draft", label: "Draft" }],
          },
        }),
        message: 'context "lookup" is incompatible with value field "status"',
      },
    ];

    for (const invalidCase of invalidCases) {
      expect(() => parseAppSchema(invalidCase.schema)).toThrow(invalidCase.message);
    }
  });

  it("requires explicit anonymous value fields and positive rate-limit policy", () => {
    const invalidCases = [
      {
        schema: publicLookupSchema({
          policy: {
            actors: ["anonymous"],
            access: publicReadAccess(),
          },
        }),
        message: "requires anonymous response fields",
      },
      {
        schema: publicLookupSchema({
          policy: publicReadPolicy({ responseFields: { anonymous: ["id"] } }),
        }),
        message: 'references unknown value field "id"',
      },
      {
        schema: publicLookupSchema({
          policy: publicReadPolicy({ responseFields: { anonymous: [] } }),
        }),
        message: "responseFields.anonymous must be a non-empty array",
      },
      {
        schema: publicLookupSchema({
          policy: publicReadPolicy({
            access: {
              actor: "anonymous",
              origin: { kind: "same-origin" },
            },
          }),
        }),
        message: "requires an explicit rate limit",
      },
      {
        schema: publicLookupSchema({
          policy: publicReadPolicy({
            access: publicReadAccess({
              rateLimit: { maxRequests: 0, windowSeconds: 60 },
            }),
          }),
        }),
        message: "rateLimit maxRequests must be a positive integer",
      },
      {
        schema: publicLookupSchema({
          policy: publicReadPolicy({
            access: publicReadAccess({
              rateLimit: { maxRequests: 10, windowSeconds: -1 },
            }),
          }),
        }),
        message: "rateLimit windowSeconds must be a positive integer",
      },
    ];

    for (const invalidCase of invalidCases) {
      expect(() => parseAppSchema(invalidCase.schema)).toThrow(invalidCase.message);
    }
  });
});

function publicLookupSchema(
  overrides: {
    access?: unknown;
    expression?: unknown;
    extraFields?: Array<Record<string, unknown>>;
    field?: unknown;
    fieldName?: string;
    input?: unknown;
    output?: unknown;
    policy?: unknown;
  } = {},
) {
  const fieldName = overrides.fieldName ?? "code";
  const field = overrides.field ?? { type: "text", required: true, label: "Code" };
  return {
    version: 1,
    entities: [
      {
        id: "entity_74c0ceed-5cfe-440c-8d5d-28f62dac60c8",
        key: "certificate",
        label: "Certificate",
        fields: [
          {
            key: fieldName,
            ...field,
          },
          ...(fieldName === "published"
            ? []
            : [{ key: "published", type: "boolean", required: true, label: "Published" }]),
          ...(overrides.extraFields ?? []),
        ],
        operations: [
          {
            key: "lookup",
            ...(overrides.access === undefined ? {} : { access: overrides.access }),
            kind: "list",
            scope: "collection",
            input: {
              fields: [
                {
                  key: "lookup",
                  ...(overrides.input ?? { type: "text", required: true, label: "Lookup value" }),
                },
              ],
            },
            output: overrides.output ?? { type: "list", query: "publicLookup", maxResults: 5 },
            policy:
              overrides.policy ?? publicReadPolicy({ responseFields: { anonymous: [fieldName] } }),
          },
        ],
      },
    ],
    queries: [
      {
        key: "certificates",
        label: "Certificates",
        entity: "certificate",
        expression: { kind: "all" },
      },
      {
        key: "publicLookup",
        label: "Public lookup",
        entity: "certificate",
        expression: overrides.expression ?? inputEquality(fieldName),
      },
    ],
    itemViews: [
      {
        key: "certificateItem",
        entity: "certificate",
        fields: [{ field: "published", editor: "boolean", commit: "immediate" }],
      },
    ],
    tableViews: [],
    views: [
      {
        key: "certificateHome",
        type: "collection",
        label: "Certificates",
        entity: "certificate",
        queries: [{ query: "certificates" }],
        defaultQuery: "certificates",
        result: { type: "list", itemView: "certificateItem" },
      },
    ],
    screens: [
      {
        key: "home",
        type: "workspace",
        label: "Certificates",
        layout: {
          type: "stack",
          sections: [{ id: "certificates", type: "collection", view: "certificateHome" }],
        },
      },
    ],
  };
}
function inputEquality(fieldName: string) {
  return {
    kind: "where",
    ref: { kind: "value", name: fieldName },
    op: "eq",
    value: { kind: "context", name: "lookup" },
  };
}

function publicReadPolicy(overrides: Record<string, unknown> = {}) {
  return {
    actors: ["anonymous"],
    access: publicReadAccess(),
    responseFields: { anonymous: ["code"] },
    ...overrides,
  };
}

function publicReadAccess(overrides: Record<string, unknown> = {}) {
  return {
    actor: "anonymous",
    origin: { kind: "same-origin" },
    rateLimit: { maxRequests: 10, windowSeconds: 60 },
    ...overrides,
  };
}
