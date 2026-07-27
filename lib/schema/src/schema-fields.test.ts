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
      entities: {
        task: taskEntity({
          fields: {
            ...taskEntity().fields,
            estimate: {
              type: "number",
              required: true,
              label: "Estimate",
              default: 1,
              min: 0,
              max: 10,
              integer: true,
            },
            priority: {
              type: "enum",
              required: true,
              label: "Priority",
              default: "normal",
              values: {
                normal: {
                  label: "Normal",
                  presentation: { icon: "priority", color: "priority.normal" },
                },
                high: {
                  label: "High",
                  presentation: { icon: "priority", color: "priority.high" },
                },
              },
            },
          },
        }),
      },
      itemViews: {
        taskItem: {
          entity: "task",
          fields: {
            priority: {
              editor: "enum",
              commit: "immediate",
              presentation: { list: "both", mode: "iconOnly", trigger: "icon" },
            },
          },
        },
      },
    });

    expect(schema.entities.task?.fields.estimate).toEqual({
      type: "number",
      required: true,
      label: "Estimate",
      default: 1,
      min: 0,
      max: 10,
      integer: true,
    });
    expect(schema.entities.task?.fields.priority).toMatchObject({
      type: "enum",
      default: "normal",
      values: {
        high: { presentation: { icon: "priority", color: "priority.high" } },
      },
    });
    expect(schema.itemViews.taskItem.fields.priority).toMatchObject({
      presentation: { list: "both", mode: "iconOnly", trigger: "icon" },
    });
    expect(parseAppSchema(JSON.parse(stringifySchema(schema)))).toEqual(schema);
  });

  it("rejects invalid scalar defaults and presentation metadata", () => {
    expect(() =>
      parseAppSchema({
        ...taskSchema(),
        entities: {
          task: taskEntity({
            fields: {
              ...taskEntity().fields,
              priority: {
                type: "enum",
                required: true,
                default: "missing",
                values: { normal: { label: "Normal" } },
              },
            },
          }),
        },
      }),
    ).toThrow("enum default must match one of its values");

    expect(() =>
      parseAppSchema({
        ...taskSchema(),
        entities: {
          task: taskEntity({
            fields: {
              ...taskEntity().fields,
              estimate: { type: "number", required: false, min: 10, max: 1 },
            },
          }),
        },
      }),
    ).toThrow("number min must be less than or equal to max");

    expect(() =>
      parseAppSchema({
        ...taskSchema(),
        itemViews: {
          taskItem: {
            entity: "task",
            fields: {
              title: {
                editor: "text",
                commit: "field-commit",
                presentation: { mode: "iconOnly" },
              },
            },
          },
        },
      }),
    ).toThrow("iconOnly presentation requires an enum field");
  });

  it("accepts contact text formats and open text suggestions on entity fields", () => {
    const source = identityReferenceSourceSchema();
    const schema = parseAppSchema({
      ...source,
      entities: {
        ...source.entities,
        account: {
          ...source.entities.account,
          fields: {
            ...source.entities.account.fields,
            email: {
              type: "text",
              required: false,
              format: "email",
              suggestions: ["hello@example.com"],
            },
            phone: {
              type: "text",
              required: false,
              format: "phone",
            },
            inquiryType: {
              type: "text",
              required: false,
              suggestions: ["Support", "Sales"],
            },
          },
        },
      },
    });

    expect(schema.entities.account?.fields.email).toEqual({
      type: "text",
      required: false,
      format: "email",
      suggestions: ["hello@example.com"],
    });
    expect(schema.entities.account?.fields.phone).toEqual({
      type: "text",
      required: false,
      format: "phone",
    });
    expect(schema.entities.account?.fields.inquiryType).toEqual({
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
      entities: {
        task: taskEntity({
          fields: {
            ...taskEntity().fields,
            report: {
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
          },
        }),
      },
    });
    const report = schema.entities.task?.fields.report;

    expect(report).toEqual({
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
        entities: {
          task: taskEntity({
            fields: {
              ...taskEntity().fields,
              report: {
                type,
                required: false,
                asset,
              },
            },
          }),
        },
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
        entities: {
          ...source.entities,
          account: {
            ...source.entities.account,
            fields: {
              ...source.entities.account.fields,
              email: { type: "text", required: false, format: "unsupported" },
            },
          },
        },
      }),
    ).toThrow(
      'Field "account.email" text format must be "plain", "longText", "markdown", "href", "slug", "color", "icon", "email", or "phone".',
    );

    expect(() =>
      parseAppSchema({
        ...source,
        entities: {
          ...source.entities,
          account: {
            ...source.entities.account,
            fields: {
              ...source.entities.account.fields,
              inquiryType: { type: "text", required: false, suggestions: [] },
            },
          },
        },
      }),
    ).toThrow('Field "account.inquiryType" text suggestions must be a non-empty array.');

    expect(() =>
      parseAppSchema({
        ...source,
        entities: {
          ...source.entities,
          account: {
            ...source.entities.account,
            fields: {
              ...source.entities.account.fields,
              inquiryType: { type: "text", required: false, suggestions: ["Support", ""] },
            },
          },
        },
      }),
    ).toThrow('Field "account.inquiryType" text suggestions[1] must be a non-empty string.');
  });

  it("accepts supported identity reference targets and local unqualified references", () => {
    const schema = parseAppSchema(identityReferenceSourceSchema());

    expect(schema.entities.account?.fields.ownerPrincipal).toEqual({
      type: "reference",
      required: false,
      to: "auth:principal",
    });
    expect(schema.entities.account?.fields.organization).toMatchObject({
      type: "reference",
      to: "auth:organization",
    });
    expect(schema.entities.account?.fields.group).toMatchObject({
      type: "reference",
      to: "auth:group",
    });
    expect(schema.entities.account?.fields.profile).toEqual({
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
        entities: {
          ...identityReferenceSourceSchema().entities,
          principal: textEntity("Principal"),
        },
      }),
    ).toThrow('Use local entity key "principal"');
  });

  it("does not treat identity reference targets as local relationship endpoints", () => {
    expect(() =>
      parseAppSchema({
        ...identityReferenceSourceSchema(),
        relationships: {
          accountPrincipal: {
            kind: "toOne",
            from: { entity: "account", field: "ownerPrincipal" },
            to: { entity: "auth:principal" },
          },
        },
      }),
    ).toThrow('Relationship "accountPrincipal" to references unknown entity "auth:principal"');
  });

  it("does not treat identity reference targets as reference-field table traversal targets", () => {
    expect(() =>
      parseAppSchema({
        ...identityReferenceSourceSchema(),
        tableViews: {
          accountTable: {
            entity: "account",
            columns: [
              { type: "field", field: "name" },
              { type: "referenceField", referenceField: "ownerPrincipal", field: "displayName" },
            ],
          },
        },
      }),
    ).toThrow(
      'Table view "accountTable" column 1 referenceField "account.ownerPrincipal" targets unknown entity "auth:principal"',
    );
  });
});

function identityReferenceSourceSchema() {
  return {
    version: 1,
    entities: {
      account: {
        label: "Account",
        fields: {
          name: { type: "text", required: true },
          ownerPrincipal: { type: "reference", required: false, to: "auth:principal" },
          organization: { type: "reference", required: false, to: "auth:organization" },
          group: { type: "reference", required: false, to: "auth:group" },
          profile: {
            type: "reference",
            required: false,
            to: "profile",
            displayField: "name",
          },
        },
      },
      profile: textEntity("Profile"),
    },
    queries: {
      accounts: {
        label: "Accounts",
        entity: "account",
        expression: { kind: "all" },
      },
    },
    itemViews: {},
    tableViews: {
      accountTable: {
        entity: "account",
        columns: [
          { type: "field", field: "name" },
          { type: "field", field: "ownerPrincipal" },
          { type: "field", field: "organization" },
          { type: "field", field: "group" },
          { type: "field", field: "profile" },
        ],
      },
    },
    views: {
      accountHome: {
        type: "collection",
        label: "Accounts",
        entity: "account",
        queries: [{ query: "accounts" }],
        defaultQuery: "accounts",
        result: { type: "table", tableView: "accountTable" },
      },
    },
    screens: {
      home: {
        type: "workspace",
        label: "Home",
        layout: {
          type: "stack",
          sections: [{ id: "accounts", type: "collection", view: "accountHome" }],
        },
      },
    },
  };
}

function textEntity(label: string) {
  return {
    label,
    fields: {
      name: { type: "text", required: true },
    },
  };
}
