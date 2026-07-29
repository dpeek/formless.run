import { describe, expect, it } from "vite-plus/test";

import {
  DOCUMENT_ASSET_POLICY_MAX_BYTES,
  fieldEditorControl,
  fieldSupportsEditor,
  inputValueToFieldValue,
  isValidStoredFieldValue,
  parseAppSchema,
  stringifySchema,
  validateAuthorityFieldValue,
} from "./index.ts";
import { taskEntity, taskSchema } from "./schema-test-fixtures.ts";

describe("schema fields", () => {
  it("parses enum, number, and field presentation metadata", () => {
    const source = taskSchema();
    const schema = parseAppSchema({
      ...source,
      entities: [
        {
          key: "task",
          ...taskEntity({
            fields: replaceDefinition(
              replaceDefinition(taskEntity().fields, "estimate", {
                key: "estimate",
                type: "number",
                required: true,
                label: "Estimate",
                default: 1,
                min: 0,
                max: 10,
                integer: true,
              }),
              "priority",
              {
                key: "priority",
                type: "enum",
                required: true,
                label: "Priority",
                default: "normal",
                values: [
                  {
                    key: "normal",
                    label: "Normal",
                    presentation: { icon: "priority", color: "priority.normal" },
                  },
                  {
                    key: "high",
                    label: "High",
                    presentation: { icon: "priority", color: "priority.high" },
                  },
                ],
              },
            ),
          }),
        },
      ],
      itemViews: [
        {
          key: "taskItem",
          entity: "task",
          fields: [
            {
              field: "priority",
              editor: "enum",
              commit: "immediate",
              presentation: { list: "both", mode: "iconOnly", trigger: "icon" },
            },
          ],
        },
      ],
    });
    expect(
      schema.entities
        .find((definition) => definition.key === "task")!
        .fields.find((definition) => definition.key === "estimate")!,
    ).toEqual({
      key: "estimate",
      type: "number",
      required: true,
      label: "Estimate",
      default: 1,
      min: 0,
      max: 10,
      integer: true,
    });
    const priority = schema.entities
      .find((definition) => definition.key === "task")!
      .fields.find((definition) => definition.key === "priority")!;
    expect(priority).toMatchObject({ type: "enum", default: "normal" });
    expect(
      priority.type === "enum" && priority.values.find(({ key }) => key === "high"),
    ).toMatchObject({
      presentation: { icon: "priority", color: "priority.high" },
    });
    expect(
      schema.itemViews
        .find((definition) => definition.key === "taskItem")!
        .fields.find((definition) => definition.field === "priority"),
    ).toMatchObject({
      presentation: { list: "both", mode: "iconOnly", trigger: "icon" },
    });
    expect(parseAppSchema(JSON.parse(stringifySchema(schema)))).toEqual(schema);
  });

  it("rejects invalid scalar defaults and presentation metadata", () => {
    expect(() =>
      parseAppSchema({
        ...taskSchema(),
        entities: [
          {
            key: "task",
            ...taskEntity({
              fields: replaceDefinition(taskEntity().fields, "priority", {
                key: "priority",
                type: "enum",
                required: true,
                default: "missing",
                values: [{ key: "normal", label: "Normal" }],
              }),
            }),
          },
        ],
      }),
    ).toThrow("enum default must match one of its values");
    expect(() =>
      parseAppSchema({
        ...taskSchema(),
        entities: [
          {
            key: "task",
            ...taskEntity({
              fields: replaceDefinition(taskEntity().fields, "estimate", {
                key: "estimate",
                type: "number",
                required: false,
                min: 10,
                max: 1,
              }),
            }),
          },
        ],
      }),
    ).toThrow("number min must be less than or equal to max");
    expect(() =>
      parseAppSchema({
        ...taskSchema(),
        itemViews: [
          {
            key: "taskItem",
            entity: "task",
            fields: [
              {
                field: "title",
                editor: "text",
                commit: "field-commit",
                presentation: { mode: "iconOnly" },
              },
            ],
          },
        ],
      }),
    ).toThrow("iconOnly presentation requires an enum field");
  });

  it("accepts contact text formats and open text suggestions on entity fields", () => {
    const source = identityReferenceSourceSchema();
    const schema = parseAppSchema({
      ...source,
      entities: replaceDefinition(source.entities, "account", {
        fields: [
          ...source.entities.find((definition) => definition.key === "account")!.fields,
          {
            key: "email",
            type: "text",
            required: false,
            format: "email",
            suggestions: ["hello@example.com"],
          },
          {
            key: "phone",
            type: "text",
            required: false,
            format: "phone",
          },
          {
            key: "inquiryType",
            type: "text",
            required: false,
            suggestions: ["Support", "Sales"],
          },
        ],
      }),
    });
    expect(
      schema.entities
        .find((definition) => definition.key === "account")!
        .fields.find((definition) => definition.key === "email")!,
    ).toEqual({
      key: "email",
      type: "text",
      required: false,
      format: "email",
      suggestions: ["hello@example.com"],
    });
    expect(
      schema.entities
        .find((definition) => definition.key === "account")!
        .fields.find((definition) => definition.key === "phone")!,
    ).toEqual({
      key: "phone",
      type: "text",
      required: false,
      format: "phone",
    });
    expect(
      schema.entities
        .find((definition) => definition.key === "account")!
        .fields.find((definition) => definition.key === "inquiryType")!,
    ).toEqual({
      key: "inquiryType",
      type: "text",
      required: false,
      suggestions: ["Support", "Sales"],
    });
    expect(parseAppSchema(JSON.parse(stringifySchema(schema)))).toEqual(schema);
  });

  it("parses document asset policy while preserving flat text asset ids", () => {
    const source = taskSchema();
    const schema = parseAppSchema({
      ...source,
      entities: [
        {
          key: "task",
          ...taskEntity({
            fields: [
              ...taskEntity().fields,
              {
                key: "report",
                type: "text",
                required: false,
                label: "Report",
                asset: {
                  kind: "document",
                  acceptedMimeTypes: ["application/pdf"],
                  maxBytes: DOCUMENT_ASSET_POLICY_MAX_BYTES,
                  access: "private",
                },
              },
            ],
          }),
        },
      ],
    });
    const report = schema.entities
      .find((definition) => definition.key === "task")!
      .fields.find((definition) => definition.key === "report")!;
    expect(report).toEqual({
      key: "report",
      type: "text",
      required: false,
      label: "Report",
      asset: {
        kind: "document",
        acceptedMimeTypes: ["application/pdf"],
        maxBytes: DOCUMENT_ASSET_POLICY_MAX_BYTES,
        access: "private",
      },
    });
    expect(report && fieldSupportsEditor(report, "media")).toBe(true);
    expect(report && fieldEditorControl(report, "media")).toEqual({ kind: "mediaUpload" });
    expect(report && inputValueToFieldValue(report, "document-asset.pdf")).toBe(
      "document-asset.pdf",
    );
    expect(report && isValidStoredFieldValue("document-asset.pdf", report)).toBe(true);
    expect(
      report && validateAuthorityFieldValue("report", report, "document-asset.pdf", true),
    ).toEqual({
      kind: "set",
      value: "document-asset.pdf",
    });
    expect(parseAppSchema(JSON.parse(stringifySchema(schema)))).toEqual(schema);
  });

  it("rejects invalid document asset policies", () => {
    const parseReportPolicy = (asset: unknown, type = "text") => {
      const source = taskSchema();
      return parseAppSchema({
        ...source,
        entities: [
          {
            key: "task",
            ...taskEntity({
              fields: [
                ...taskEntity().fields,
                {
                  key: "report",
                  type,
                  required: false,
                  asset,
                },
              ],
            }),
          },
        ],
      });
    };
    expect(() =>
      parseReportPolicy({
        kind: "document",
        acceptedMimeTypes: [],
        maxBytes: 1,
        access: "private",
      }),
    ).toThrow("acceptedMimeTypes must be a non-empty array");
    expect(() =>
      parseReportPolicy({
        kind: "document",
        acceptedMimeTypes: ["APPLICATION/PDF"],
        maxBytes: 1,
        access: "private",
      }),
    ).toThrow("must be a normalized MIME type");
    expect(() =>
      parseReportPolicy({
        kind: "document",
        acceptedMimeTypes: ["text/plain"],
        maxBytes: 1,
        access: "private",
      }),
    ).toThrow("must be a supported document MIME type (application/pdf)");
    expect(() =>
      parseReportPolicy({
        kind: "document",
        acceptedMimeTypes: ["application/pdf"],
        maxBytes: 0,
        access: "private",
      }),
    ).toThrow("maxBytes must be a positive integer");
    expect(() =>
      parseReportPolicy({
        kind: "document",
        acceptedMimeTypes: ["application/pdf"],
        maxBytes: DOCUMENT_ASSET_POLICY_MAX_BYTES + 1,
        access: "private",
      }),
    ).toThrow(`maxBytes must be at most ${DOCUMENT_ASSET_POLICY_MAX_BYTES}`);
    expect(() =>
      parseReportPolicy({
        kind: "document",
        acceptedMimeTypes: ["application/pdf"],
        maxBytes: 1,
      }),
    ).toThrow('asset policy must include "access"');
    expect(() =>
      parseReportPolicy({
        kind: "document",
        acceptedMimeTypes: ["application/pdf"],
        maxBytes: 1,
        access: "authenticated",
      }),
    ).toThrow('access must be "public" or "private"');
    expect(() =>
      parseReportPolicy(
        {
          kind: "document",
          acceptedMimeTypes: ["application/pdf"],
          maxBytes: 1,
          access: "public",
        },
        "number",
      ),
    ).toThrow("asset policy is only supported on text fields");
  });

  it("rejects invalid text format and suggestion declarations", () => {
    const source = identityReferenceSourceSchema();

    expect(() =>
      parseAppSchema({
        ...source,
        entities: replaceDefinition(source.entities, "account", {
          fields: [
            ...source.entities.find((definition) => definition.key === "account")!.fields,
            { key: "email", type: "text", required: false, format: "unsupported" },
          ],
        }),
      }),
    ).toThrow(
      'Field "account.email" text format must be "plain", "longText", "markdown", "href", "slug", "color", "icon", "email", or "phone".',
    );

    expect(() =>
      parseAppSchema({
        ...source,
        entities: replaceDefinition(source.entities, "account", {
          fields: [
            ...source.entities.find((definition) => definition.key === "account")!.fields,
            { key: "inquiryType", type: "text", required: false, suggestions: [] },
          ],
        }),
      }),
    ).toThrow('Field "account.inquiryType" text suggestions must be a non-empty array.');
    expect(() =>
      parseAppSchema({
        ...source,
        entities: replaceDefinition(source.entities, "account", {
          fields: [
            ...source.entities.find((definition) => definition.key === "account")!.fields,
            { key: "inquiryType", type: "text", required: false, suggestions: ["Support", ""] },
          ],
        }),
      }),
    ).toThrow('Field "account.inquiryType" text suggestions[1] must be a non-empty string.');
  });
  it("accepts supported identity reference targets and local unqualified references", () => {
    const schema = parseAppSchema(identityReferenceSourceSchema());
    expect(
      schema.entities
        .find((definition) => definition.key === "account")!
        .fields.find((definition) => definition.key === "ownerPrincipal")!,
    ).toEqual({
      key: "ownerPrincipal",
      type: "reference",
      required: false,
      to: "auth:principal",
    });
    expect(
      schema.entities
        .find((definition) => definition.key === "account")!
        .fields.find((definition) => definition.key === "organization")!,
    ).toMatchObject({
      type: "reference",
      to: "auth:organization",
    });
    expect(
      schema.entities
        .find((definition) => definition.key === "account")!
        .fields.find((definition) => definition.key === "group")!,
    ).toMatchObject({
      type: "reference",
      to: "auth:group",
    });
    expect(
      schema.entities
        .find((definition) => definition.key === "account")!
        .fields.find((definition) => definition.key === "profile")!,
    ).toEqual({
      key: "profile",
      type: "reference",
      required: false,
      to: "profile",
      displayField: "name",
    });
    expect(parseAppSchema(JSON.parse(stringifySchema(schema)))).toEqual(schema);
  });

  it("rejects qualified aliases of local entities before accepting identity targets", () => {
    expect(() =>
      parseAppSchema({
        ...identityReferenceSourceSchema(),
        entities: [
          ...identityReferenceSourceSchema().entities,
          {
            key: "principal",
            ...textEntity("entity_f5319c54-5549-4236-8ea5-cdd534a106bf", "Principal"),
          },
        ],
      }),
    ).toThrow('Use local entity key "principal"');
  });

  it("does not treat identity reference targets as local relationship endpoints", () => {
    expect(() =>
      parseAppSchema({
        ...identityReferenceSourceSchema(),
        relationships: [
          {
            key: "accountPrincipal",
            kind: "toOne",
            from: { entity: "account", field: "ownerPrincipal" },
            to: { entity: "auth:principal" },
          },
        ],
      }),
    ).toThrow('Relationship "accountPrincipal" to references unknown entity "auth:principal"');
  });

  it("does not treat identity reference targets as reference-field table traversal targets", () => {
    expect(() =>
      parseAppSchema({
        ...identityReferenceSourceSchema(),
        tableViews: [
          {
            key: "accountTable",
            entity: "account",
            columns: [
              { type: "field", field: "name" },
              { type: "referenceField", referenceField: "ownerPrincipal", field: "displayName" },
            ],
          },
        ],
      }),
    ).toThrow(
      'Table view "accountTable" column 1 referenceField "account.ownerPrincipal" targets unknown entity "auth:principal"',
    );
  });
});

function identityReferenceSourceSchema() {
  return {
    version: 1,
    entities: [
      {
        id: "entity_a2e9f43a-b856-4a20-b433-48882fe818f9",
        key: "account",
        label: "Account",
        fields: [
          { key: "name", type: "text", required: true },
          { key: "ownerPrincipal", type: "reference", required: false, to: "auth:principal" },
          { key: "organization", type: "reference", required: false, to: "auth:organization" },
          { key: "group", type: "reference", required: false, to: "auth:group" },
          {
            key: "profile",
            type: "reference",
            required: false,
            to: "profile",
            displayField: "name",
          },
        ],
      },
      {
        key: "profile",
        ...textEntity("entity_ef259cf1-0c69-4190-8914-63788264f4ae", "Profile"),
      },
    ],
    queries: [
      {
        key: "accounts",
        label: "Accounts",
        entity: "account",
        expression: { kind: "all" },
      },
    ],
    itemViews: [],
    tableViews: [
      {
        key: "accountTable",
        entity: "account",
        columns: [
          { type: "field", field: "name" },
          { type: "field", field: "ownerPrincipal" },
          { type: "field", field: "organization" },
          { type: "field", field: "group" },
          { type: "field", field: "profile" },
        ],
      },
    ],
    views: [
      {
        key: "accountHome",
        type: "collection",
        label: "Accounts",
        entity: "account",
        queries: [{ query: "accounts" }],
        defaultQuery: "accounts",
        result: { type: "table", tableView: "accountTable" },
      },
    ],
    screens: [
      {
        key: "home",
        type: "workspace",
        label: "Home",
        layout: {
          type: "stack",
          sections: [{ id: "accounts", type: "collection", view: "accountHome" }],
        },
      },
    ],
  };
}
function textEntity(id: `entity_${string}`, label: string) {
  return {
    id,
    label,
    fields: [{ key: "name", type: "text", required: true }],
  };
}
function replaceDefinition<T extends { key: string }>(
  definitions: readonly T[],
  key: string,
  patch: Record<string, unknown>,
): T[] {
  return definitions.map((definition) =>
    definition.key === key ? { ...definition, ...patch } : definition,
  );
}
