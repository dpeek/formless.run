import { describe, expect, it } from "vite-plus/test";

import {
  parseAppSchema,
  resolveRecordLink,
  stringifySchema,
  type RecordLinkSchema,
  type StoredRecord,
} from "./index.ts";

describe("schema record links", () => {
  it("round-trips parsed reference-field sources through stored schema serialization", () => {
    const source = recordLinkSource();
    source.tableViews[0]!.links[0]!.destination.query.push(
      {
        name: "directImage",
        source: { kind: "mediaHref", value: { kind: "field", field: "note" } },
      },
      {
        name: "referencedImage",
        source: {
          kind: "mediaHref",
          value: {
            kind: "referenceField",
            referenceField: "organization",
            field: "externalCode",
          },
        },
      },
    );
    const schema = parseAppSchema(source);

    expect(parseAppSchema(JSON.parse(stringifySchema(schema)))).toEqual(schema);
    expect(schema.tableViews[0]!.links![0]!.destination.query.slice(-2)).toEqual([
      {
        name: "directImage",
        source: { kind: "mediaHref", value: { kind: "field", field: "note" } },
        missing: "disable",
      },
      {
        name: "referencedImage",
        source: {
          kind: "mediaHref",
          value: {
            kind: "referenceField",
            referenceField: "organization",
            targetEntity: "organization",
            field: "externalCode",
          },
        },
        missing: "disable",
      },
    ]);
  });

  it("parses ordered links, structured destinations, source fields, defaults, and placement", () => {
    const schema = parseAppSchema(recordLinkSource());

    expect(schema.tableViews[0]).toEqual({
      key: "taskTable",
      entity: "task",
      links: [
        {
          key: "openExternal",
          label: "Open external",
          target: "newTab",
          destination: {
            type: "url",
            base: "https://example.test/open?existing=first#details",
            query: [
              {
                name: "literal",
                source: { kind: "literal", value: "fixed" },
                missing: "disable",
              },
              {
                name: "title",
                source: { kind: "field", field: "title" },
                missing: "disable",
              },
              {
                name: "organization",
                source: {
                  kind: "referenceField",
                  referenceField: "organization",
                  targetEntity: "organization",
                  field: "externalCode",
                },
                missing: "omit",
              },
            ],
          },
        },
      ],
      columns: [{ type: "linkControl", link: "openExternal", label: "External" }],
    });
  });

  it.each([
    ["relative", "/open"],
    ["protocol-relative", "//example.test/open"],
    ["unsafe scheme", "javascript:alert(1)"],
    ["undeclared scheme", "ftp://example.test/open"],
    ["malformed", "https://"],
    ["credentials", "https://person:secret@example.test/open"],
  ])("rejects %s URL bases", (_case, base) => {
    const source = recordLinkSource();
    source.tableViews[0]!.links[0]!.destination.base = base;

    expect(() => parseAppSchema(source)).toThrow(
      base.includes("@") ? "must not include credentials" : "must be an absolute HTTP(S) URL",
    );
  });

  it("rejects duplicate authored and existing-base query parameters", () => {
    const duplicateAuthored = recordLinkSource();
    duplicateAuthored.tableViews[0]!.links[0]!.destination.query.push({
      name: "title",
      source: { kind: "literal", value: "duplicate" },
    });
    expect(() => parseAppSchema(duplicateAuthored)).toThrow('contains duplicate parameter "title"');

    const duplicateBase = recordLinkSource();
    duplicateBase.tableViews[0]!.links[0]!.destination.query.push({
      name: "existing",
      source: { kind: "literal", value: "duplicate" },
    });
    expect(() => parseAppSchema(duplicateBase)).toThrow(
      'query parameter "existing" duplicates a parameter in the base URL',
    );
  });

  it.each([
    ["unknown direct field", { kind: "field", field: "missing" }, "unknown value field"],
    ["system field", { kind: "field", field: "id" }, "unknown value field"],
    ["direct reference", { kind: "field", field: "organization" }, "must be a scalar value field"],
    [
      "non-reference hop",
      { kind: "referenceField", referenceField: "title", field: "externalCode" },
      "must be a reference field",
    ],
    [
      "unknown terminal field",
      { kind: "referenceField", referenceField: "organization", field: "missing" },
      "unknown value field",
    ],
    [
      "second reference hop",
      { kind: "referenceField", referenceField: "organization", field: "parent" },
      "must be a scalar value field",
    ],
    [
      "cross-schema reference",
      { kind: "referenceField", referenceField: "principal", field: "name" },
      "must target a local entity",
    ],
    [
      "mismatched parsed reference target",
      {
        kind: "referenceField",
        referenceField: "organization",
        targetEntity: "task",
        field: "externalCode",
      },
      'targetEntity must match reference target "organization"',
    ],
  ])("rejects $0 sources", (_case, sourceValue, message) => {
    const source = recordLinkSource();
    source.tableViews[0]!.links[0]!.destination.query = [{ name: "value", source: sourceValue }];

    expect(() => parseAppSchema(source)).toThrow(message);
  });

  it.each([
    [
      "literal asset ids",
      { kind: "mediaHref", value: { kind: "literal", value: "hero.webp" } },
      'kind must be "field" or "referenceField"',
    ],
    [
      "non-text direct fields",
      { kind: "mediaHref", value: { kind: "field", field: "count" } },
      "must be a text field containing a core image asset id",
    ],
    [
      "non-text referenced fields",
      {
        kind: "mediaHref",
        value: {
          kind: "referenceField",
          referenceField: "organization",
          field: "count",
        },
      },
      "must be a text field containing a core image asset id",
    ],
    [
      "unknown direct fields",
      { kind: "mediaHref", value: { kind: "field", field: "missing" } },
      "unknown value field",
    ],
    [
      "second reference hops",
      {
        kind: "mediaHref",
        value: {
          kind: "referenceField",
          referenceField: "organization",
          field: "parent",
        },
      },
      "must be a scalar value field",
    ],
  ])("rejects media-href sources with $0", (_case, sourceValue, message) => {
    const source = recordLinkSource();
    source.tableViews[0]!.links[0]!.destination.query = [
      { name: "sampleImageUrl", source: sourceValue },
    ];

    expect(() => parseAppSchema(source)).toThrow(message);
  });

  it("rejects invalid literals, missing behavior, targets, keys, and placements", () => {
    const invalidLiteral = recordLinkSource();
    invalidLiteral.tableViews[0]!.links[0]!.destination.query = [
      { name: "value", source: { kind: "literal", value: Number.POSITIVE_INFINITY } },
    ];
    expect(() => parseAppSchema(invalidLiteral)).toThrow(
      "literal must be a string, finite number, or boolean",
    );

    const invalidMissing = recordLinkSource();
    invalidMissing.tableViews[0]!.links[0]!.destination.query[0]!.missing = "ignore";
    expect(() => parseAppSchema(invalidMissing)).toThrow('must be "disable" or "omit"');

    const invalidTarget = recordLinkSource();
    invalidTarget.tableViews[0]!.links[0]!.target = "window";
    expect(() => parseAppSchema(invalidTarget)).toThrow('must be "sameTab" or "newTab"');

    const invalidLabel = recordLinkSource();
    invalidLabel.tableViews[0]!.links[0]!.label = " ";
    expect(() => parseAppSchema(invalidLabel)).toThrow("label must be a non-empty string");

    const invalidParameterName = recordLinkSource();
    invalidParameterName.tableViews[0]!.links[0]!.destination.query[0]!.name = " ";
    expect(() => parseAppSchema(invalidParameterName)).toThrow("name must be a non-empty string");

    const duplicateKey = recordLinkSource();
    duplicateKey.tableViews[0]!.links.push({ ...duplicateKey.tableViews[0]!.links[0]! });
    expect(() => parseAppSchema(duplicateKey)).toThrow(
      'Table view "taskTable" links contains duplicate key "openExternal"',
    );

    const unknownPlacement = recordLinkSource();
    unknownPlacement.tableViews[0]!.columns = [{ type: "linkControl", link: "missing" }];
    expect(() => parseAppSchema(unknownPlacement)).toThrow(
      'references unknown table link "missing"',
    );
  });

  it("resolves encoded scalar values in deterministic base-then-authored order", () => {
    const link = parsedLink({
      base: "https://example.test/open?existing=first%20value#details",
      query: [
        { name: "literal", source: { kind: "literal", value: "a& b" } },
        { name: "count", source: { kind: "field", field: "count" } },
        { name: "active", source: { kind: "field", field: "active" } },
        { name: "empty", source: { kind: "field", field: "note" } },
        {
          name: "org name",
          source: { kind: "referenceField", referenceField: "organization", field: "name" },
        },
      ],
    });
    const row = storedRecord("task-1", "task", {
      organization: "organization-1",
      title: "Task",
      count: 0,
      active: false,
      note: "",
    });
    const organization = storedRecord("organization-1", "organization", {
      name: "R&D / Sydney",
      externalCode: "org-1",
    });
    const recordsById = { [organization.id]: organization };

    expect(resolveRecordLink(link, row, recordsById)).toEqual({
      kind: "available",
      href: "https://example.test/open?existing=first+value&literal=a%26+b&count=0&active=false&empty=&org+name=R%26D+%2F+Sydney#details",
    });
    expect(resolveRecordLink(link, row, recordsById)).toEqual(
      resolveRecordLink(link, row, recordsById),
    );
  });

  it("applies omit and default disable behavior to missing direct values", () => {
    const row = storedRecord("task-1", "task", {});
    const omit = parsedLink({
      query: [{ name: "title", source: { kind: "field", field: "title" }, missing: "omit" }],
    });
    const disable = parsedLink({
      query: [{ name: "title", source: { kind: "field", field: "title" } }],
    });

    expect(resolveRecordLink(omit, row, {})).toEqual({
      kind: "available",
      href: "https://example.test/open?existing=first#details",
    });
    expect(resolveRecordLink(disable, row, {})).toEqual({
      kind: "unavailable",
      reason: "Link destination is unavailable.",
    });
  });

  it("applies missing behavior to absent reference ids and terminal values", () => {
    const omit = parsedLink({
      query: [
        {
          name: "organization",
          source: { kind: "referenceField", referenceField: "organization", field: "name" },
          missing: "omit",
        },
      ],
    });
    const disable = parsedLink({
      query: [
        {
          name: "organization",
          source: { kind: "referenceField", referenceField: "organization", field: "name" },
        },
      ],
    });
    const rowWithoutReference = storedRecord("task-1", "task", {});
    const rowWithReference = storedRecord("task-1", "task", {
      organization: "organization-1",
    });
    const recordWithoutTerminalValue = storedRecord("organization-1", "organization", {});

    expect(resolveRecordLink(omit, rowWithoutReference, {})).toEqual({
      kind: "available",
      href: "https://example.test/open?existing=first#details",
    });
    expect(
      resolveRecordLink(disable, rowWithReference, {
        [recordWithoutTerminalValue.id]: recordWithoutTerminalValue,
      }),
    ).toEqual({
      kind: "unavailable",
      reason: "Link destination is unavailable.",
    });
  });

  it("projects direct and one-hop core image asset ids as encoded absolute query values", () => {
    const link = parsedLink({
      base: "https://builder.example/generate?mode=coa",
      query: [
        {
          name: "directImageUrl",
          source: { kind: "mediaHref", value: { kind: "field", field: "note" } },
        },
        {
          name: "sampleImageUrl",
          source: {
            kind: "mediaHref",
            value: {
              kind: "referenceField",
              referenceField: "organization",
              field: "externalCode",
            },
          },
        },
      ],
    });
    const row = storedRecord("task-1", "task", {
      note: "direct.webp",
      organization: "organization-1",
    });
    const organization = storedRecord("organization-1", "organization", {
      externalCode: "vial-image.png",
    });

    expect(
      resolveRecordLink(link, row, { [organization.id]: organization }, { mediaHrefForAssetId }),
    ).toEqual({
      kind: "available",
      href: "https://builder.example/generate?mode=coa&directImageUrl=https%3A%2F%2Finstance.example%2Fapi%2Fformless%2Fmedia%2Fmedia%2Fimages%2Fdirect.webp&sampleImageUrl=https%3A%2F%2Finstance.example%2Fapi%2Fformless%2Fmedia%2Fmedia%2Fimages%2Fvial-image.png",
    });
  });

  it.each([
    ["missing direct value", {}, {}, "omit", "available"],
    ["missing reference", { organization: "organization-1" }, {}, "omit", "available"],
    ["malformed asset id omitted", { note: "../hero.webp" }, {}, "omit", "available"],
    ["malformed asset id disables", { note: "../hero.webp" }, {}, "disable", "unavailable"],
  ])(
    "applies $3 media-href behavior for $0",
    (_case, values, recordsById, missing, expectedKind) => {
      const source =
        "organization" in values
          ? {
              kind: "mediaHref",
              value: {
                kind: "referenceField",
                referenceField: "organization",
                field: "externalCode",
              },
            }
          : { kind: "mediaHref", value: { kind: "field", field: "note" } };
      const link = parsedLink({
        query: [{ name: "sampleImageUrl", source, missing }],
      });
      const resolution = resolveRecordLink(
        link,
        storedRecord("task-1", "task", values),
        recordsById,
        { mediaHrefForAssetId },
      );

      expect(resolution.kind).toBe(expectedKind);
      if (resolution.kind === "available") {
        expect(resolution.href).toBe("https://example.test/open?existing=first#details");
      }
    },
  );

  it.each([
    ["absent", {}],
    [
      "wrong entity",
      {
        "organization-1": storedRecord("organization-1", "task", { name: "Wrong" }),
      },
    ],
    [
      "tombstoned",
      {
        "organization-1": {
          ...storedRecord("organization-1", "organization", { name: "Deleted" }),
          deletedAt: "2026-08-03T01:00:00.000Z",
        },
      },
    ],
  ])("makes a link unavailable for a %s referenced record", (_case, recordsById) => {
    const link = parsedLink({
      query: [
        {
          name: "organization",
          source: { kind: "referenceField", referenceField: "organization", field: "name" },
        },
      ],
    });
    const row = storedRecord("task-1", "task", { organization: "organization-1" });

    expect(resolveRecordLink(link, row, recordsById)).toEqual({
      kind: "unavailable",
      reason: "Link destination is unavailable.",
    });
  });

  it("does not stringify unexpected runtime values even when missing values may be omitted", () => {
    const link = parsedLink({
      query: [{ name: "title", source: { kind: "field", field: "title" }, missing: "omit" }],
    });
    const row = storedRecord("task-1", "task", {});
    (row.values as Record<string, unknown>).title = { unsafe: true };

    expect(resolveRecordLink(link, row as StoredRecord, {})).toEqual({
      kind: "unavailable",
      reason: "Link destination is unavailable.",
    });
  });
});

function parsedLink(
  overrides: Partial<{
    base: string;
    query: TestRecordLinkQueryParameter[];
  }> = {},
): RecordLinkSchema {
  const source = recordLinkSource();
  source.tableViews[0]!.links[0]!.destination = {
    ...source.tableViews[0]!.links[0]!.destination,
    ...overrides,
  };
  return parseAppSchema(source).tableViews[0]!.links![0]!;
}

type TestRecordLinkQueryParameter = {
  name: string;
  source: unknown;
  missing?: unknown;
};

type TestRecordLinkSource = {
  version: number;
  entities: Array<Record<string, unknown>>;
  queries: unknown[];
  itemViews: unknown[];
  tableViews: Array<{
    key: string;
    entity: string;
    links: Array<{
      key: string;
      label: string;
      target: unknown;
      destination: {
        type: string;
        base: string;
        query: TestRecordLinkQueryParameter[];
      };
    }>;
    columns: Array<Record<string, unknown>>;
  }>;
  views: unknown[];
  screens: unknown[];
};

function recordLinkSource(): TestRecordLinkSource {
  return {
    version: 1,
    entities: [
      {
        key: "organization",
        id: "entity_68051a1e-d2fa-4a61-9df5-1cd22bf5b847",
        label: "Organization",
        fields: [
          { key: "name", type: "text", required: true },
          { key: "externalCode", type: "text", required: false },
          { key: "count", type: "number", required: false },
          { key: "parent", type: "reference", required: false, to: "organization" },
        ],
      },
      {
        key: "task",
        id: "entity_99a7b8fc-b272-45b5-ba27-7c520563a255",
        label: "Task",
        fields: [
          { key: "organization", type: "reference", required: false, to: "organization" },
          { key: "principal", type: "reference", required: false, to: "auth:principal" },
          { key: "title", type: "text", required: false },
          { key: "count", type: "number", required: false },
          { key: "active", type: "boolean", required: false },
          { key: "note", type: "text", required: false },
        ],
      },
    ],
    queries: [
      {
        key: "taskAll",
        label: "All tasks",
        entity: "task",
        expression: { kind: "all" },
      },
    ],
    itemViews: [],
    tableViews: [
      {
        key: "taskTable",
        entity: "task",
        links: [
          {
            key: "openExternal",
            label: "Open external",
            target: "newTab",
            destination: {
              type: "url",
              base: "https://example.test/open?existing=first#details",
              query: [
                { name: "literal", source: { kind: "literal", value: "fixed" } },
                { name: "title", source: { kind: "field", field: "title" } },
                {
                  name: "organization",
                  source: {
                    kind: "referenceField",
                    referenceField: "organization",
                    field: "externalCode",
                  },
                  missing: "omit",
                },
              ],
            },
          },
        ],
        columns: [{ type: "linkControl", link: "openExternal", label: "External" }],
      },
    ],
    views: [
      {
        key: "tasks",
        type: "collection",
        label: "Tasks",
        entity: "task",
        queries: [{ query: "taskAll" }],
        defaultQuery: "taskAll",
        result: { type: "table", tableView: "taskTable" },
      },
    ],
    screens: [
      {
        key: "home",
        type: "workspace",
        label: "Home",
        layout: {
          type: "stack",
          sections: [{ id: "tasks", type: "collection", view: "tasks" }],
        },
      },
    ],
  };
}

function storedRecord(id: string, entity: string, values: StoredRecord["values"]): StoredRecord {
  return {
    id,
    entity,
    values,
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z",
  };
}

function mediaHrefForAssetId(assetId: string): string | undefined {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:gif|jpe?g|png|webp)$/i.test(assetId)
    ? `https://instance.example/api/formless/media/media/images/${assetId}`
    : undefined;
}
