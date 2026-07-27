import { describe, expect, it } from "vite-plus/test";
import { fieldRefsEqual, getEntityFieldCatalog, resolveRecordFieldValue } from "./index.ts";
import {
  assertQuerySupported,
  collectQueryContextNames,
  matchesQuery,
  parseQueryExpression,
  queryRequiresContextEqualityOnEveryBranch,
} from "./index.ts";
import type { StoredRecord } from "./index.ts";
import type { QueryCapabilities, QueryExpression } from "./index.ts";
import type { EntitySchema } from "./index.ts";

describe("field catalog", () => {
  it("includes value fields and readable system fields", () => {
    const catalog = getEntityFieldCatalog(taskEntity);

    expect(catalog).toEqual([
      {
        ref: { kind: "value", name: "title" },
        type: "text",
        label: "Title",
        writable: true,
        filterOps: ["eq"],
      },
      {
        ref: { kind: "value", name: "done" },
        type: "boolean",
        label: "Done",
        writable: true,
        filterOps: ["eq"],
      },
      {
        ref: { kind: "value", name: "dueDate" },
        type: "date",
        label: "Due date",
        writable: true,
        filterOps: ["eq", "before"],
      },
      {
        ref: { kind: "value", name: "estimate" },
        type: "number",
        label: "Estimate",
        writable: true,
        filterOps: ["eq"],
      },
      {
        ref: { kind: "value", name: "kind" },
        type: "enum",
        label: "Kind",
        writable: true,
        filterOps: ["eq"],
        values: {
          role: { label: "Role" },
          stream: { label: "Stream" },
        },
      },
      {
        ref: { kind: "value", name: "resource" },
        type: "reference",
        label: "Resource",
        writable: true,
        filterOps: ["eq"],
        to: "resource",
        displayField: "name",
      },
      {
        ref: { kind: "system", name: "id" },
        type: "id",
        label: "ID",
        writable: false,
        filterOps: ["eq"],
      },
      {
        ref: { kind: "system", name: "createdAt" },
        type: "datetime",
        label: "Created at",
        writable: false,
        filterOps: ["eq"],
      },
      {
        ref: { kind: "system", name: "updatedAt" },
        type: "datetime",
        label: "Updated at",
        writable: false,
        filterOps: ["eq"],
      },
      {
        ref: { kind: "system", name: "deletedAt" },
        type: "datetime",
        label: "Deleted at",
        writable: false,
        filterOps: ["eq"],
      },
    ]);
  });

  it("compares refs by kind and name", () => {
    expect(fieldRefsEqual({ kind: "value", name: "done" }, { kind: "value", name: "done" })).toBe(
      true,
    );
    expect(fieldRefsEqual({ kind: "value", name: "done" }, { kind: "system", name: "id" })).toBe(
      false,
    );
  });

  it("resolves system refs from StoredRecord instead of record values", () => {
    expect(resolveRecordFieldValue(record, { kind: "system", name: "id" })).toBe("record-1");
    expect(resolveRecordFieldValue(record, { kind: "system", name: "createdAt" })).toBe(
      "2026-04-28T00:00:00.000Z",
    );
    expect(resolveRecordFieldValue(record, { kind: "system", name: "updatedAt" })).toBe(
      "2026-04-28T00:00:01.000Z",
    );
    expect(resolveRecordFieldValue(record, { kind: "system", name: "deletedAt" })).toBeUndefined();
  });
});

describe("query parsing", () => {
  it("parses valid all queries", () => {
    expect(parseQueryExpression({ kind: "all" }, catalog, "taskList")).toEqual({ kind: "all" });
  });

  it("parses valid where queries", () => {
    expect(
      parseQueryExpression(
        {
          kind: "where",
          ref: { kind: "value", name: "done" },
          op: "eq",
          value: true,
        },
        catalog,
        "completed tasks",
      ),
    ).toEqual({
      kind: "where",
      ref: { kind: "value", name: "done" },
      op: "eq",
      value: true,
    });

    expect(
      parseQueryExpression(
        {
          kind: "where",
          ref: { kind: "value", name: "kind" },
          op: "eq",
          value: "role",
        },
        catalog,
        "role tasks",
      ),
    ).toEqual({
      kind: "where",
      ref: { kind: "value", name: "kind" },
      op: "eq",
      value: "role",
    });

    expect(
      parseQueryExpression(
        {
          kind: "where",
          ref: { kind: "value", name: "estimate" },
          op: "eq",
          value: 2,
        },
        catalog,
        "estimated tasks",
      ),
    ).toEqual({
      kind: "where",
      ref: { kind: "value", name: "estimate" },
      op: "eq",
      value: 2,
    });

    expect(
      parseQueryExpression(
        {
          kind: "where",
          ref: { kind: "value", name: "resource" },
          op: "eq",
          value: "record-resource-1",
        },
        catalog,
        "resource tasks",
      ),
    ).toEqual({
      kind: "where",
      ref: { kind: "value", name: "resource" },
      op: "eq",
      value: "record-resource-1",
    });

    expect(
      parseQueryExpression(
        {
          kind: "where",
          ref: { kind: "value", name: "resource" },
          op: "eq",
          value: { kind: "context", name: "resource" },
        },
        catalog,
        "resource tasks",
      ),
    ).toEqual({
      kind: "where",
      ref: { kind: "value", name: "resource" },
      op: "eq",
      value: { kind: "context", name: "resource" },
    });
  });

  it("parses valid and queries", () => {
    expect(
      parseQueryExpression(
        {
          kind: "and",
          expressions: [
            {
              kind: "where",
              ref: { kind: "value", name: "done" },
              op: "eq",
              value: false,
            },
            {
              kind: "where",
              ref: { kind: "value", name: "dueDate" },
              op: "before",
              value: "2026-05-02",
            },
          ],
        },
        catalog,
        "overdue tasks",
      ),
    ).toEqual({
      kind: "and",
      expressions: [
        {
          kind: "where",
          ref: { kind: "value", name: "done" },
          op: "eq",
          value: false,
        },
        {
          kind: "where",
          ref: { kind: "value", name: "dueDate" },
          op: "before",
          value: "2026-05-02",
        },
      ],
    });
  });

  it("parses valid or queries", () => {
    expect(
      parseQueryExpression(
        {
          kind: "or",
          expressions: [
            {
              kind: "where",
              ref: { kind: "value", name: "kind" },
              op: "eq",
              value: "role",
            },
            {
              kind: "where",
              ref: { kind: "value", name: "kind" },
              op: "eq",
              value: "stream",
            },
          ],
        },
        catalog,
        "task kinds",
      ),
    ).toEqual({
      kind: "or",
      expressions: [
        {
          kind: "where",
          ref: { kind: "value", name: "kind" },
          op: "eq",
          value: "role",
        },
        {
          kind: "where",
          ref: { kind: "value", name: "kind" },
          op: "eq",
          value: "stream",
        },
      ],
    });
  });

  it("rejects empty and queries", () => {
    expect(() =>
      parseQueryExpression(
        {
          kind: "and",
          expressions: [],
        },
        catalog,
        "bad query",
      ),
    ).toThrow("expressions must be a non-empty array");
  });

  it("rejects empty or queries", () => {
    expect(() =>
      parseQueryExpression(
        {
          kind: "or",
          expressions: [],
        },
        catalog,
        "bad query",
      ),
    ).toThrow("expressions must be a non-empty array");
  });

  it("rejects extra keys inside and queries", () => {
    expect(() =>
      parseQueryExpression(
        {
          kind: "and",
          expressions: [{ kind: "all" }],
          extra: true,
        },
        catalog,
        "bad query",
      ),
    ).toThrow('unsupported key "extra"');
  });

  it("parses date before queries with literal dates", () => {
    expect(
      parseQueryExpression(
        {
          kind: "where",
          ref: { kind: "value", name: "dueDate" },
          op: "before",
          value: "2026-05-02",
        },
        catalog,
        "overdue tasks",
      ),
    ).toEqual({
      kind: "where",
      ref: { kind: "value", name: "dueDate" },
      op: "before",
      value: "2026-05-02",
    });
  });

  it("parses date before queries with today", () => {
    expect(
      parseQueryExpression(
        {
          kind: "where",
          ref: { kind: "value", name: "dueDate" },
          op: "before",
          value: { kind: "today" },
        },
        catalog,
        "overdue tasks",
      ),
    ).toEqual({
      kind: "where",
      ref: { kind: "value", name: "dueDate" },
      op: "before",
      value: { kind: "today" },
    });
  });

  it("rejects unknown refs", () => {
    expect(() =>
      parseQueryExpression(
        {
          kind: "where",
          ref: { kind: "value", name: "missing" },
          op: "eq",
          value: "x",
        },
        catalog,
        "bad query",
      ),
    ).toThrow('references unknown field "value.missing"');
  });

  it("rejects unsupported operators", () => {
    expect(() =>
      parseQueryExpression(
        {
          kind: "where",
          ref: { kind: "value", name: "done" },
          op: "ne",
          value: true,
        },
        catalog,
        "bad query",
      ),
    ).toThrow('does not support operator "ne"');
  });

  it("rejects before on non-date fields", () => {
    for (const ref of [
      { kind: "value" as const, name: "title" },
      { kind: "value" as const, name: "done" },
      { kind: "value" as const, name: "estimate" },
      { kind: "value" as const, name: "kind" },
      { kind: "value" as const, name: "resource" },
      { kind: "system" as const, name: "id" as const },
      { kind: "system" as const, name: "createdAt" as const },
    ]) {
      expect(() =>
        parseQueryExpression(
          {
            kind: "where",
            ref,
            op: "before",
            value: "2026-05-02",
          },
          catalog,
          "bad query",
        ),
      ).toThrow('does not support operator "before"');
    }
  });

  it("rejects type mismatches", () => {
    expect(() =>
      parseQueryExpression(
        {
          kind: "where",
          ref: { kind: "value", name: "done" },
          op: "eq",
          value: "true",
        },
        catalog,
        "bad query",
      ),
    ).toThrow("requires a boolean value");

    expect(() =>
      parseQueryExpression(
        {
          kind: "where",
          ref: { kind: "value", name: "kind" },
          op: "eq",
          value: "missing",
        },
        catalog,
        "bad query",
      ),
    ).toThrow("must be a known enum value");

    expect(() =>
      parseQueryExpression(
        {
          kind: "where",
          ref: { kind: "value", name: "estimate" },
          op: "eq",
          value: "2",
        },
        catalog,
        "bad query",
      ),
    ).toThrow("requires a finite number value");

    expect(() =>
      parseQueryExpression(
        {
          kind: "where",
          ref: { kind: "value", name: "estimate" },
          op: "eq",
          value: Infinity,
        },
        catalog,
        "bad query",
      ),
    ).toThrow("requires a finite number value");

    expect(() =>
      parseQueryExpression(
        {
          kind: "where",
          ref: { kind: "value", name: "resource" },
          op: "eq",
          value: 2,
        },
        catalog,
        "bad query",
      ),
    ).toThrow("requires a string value");

    expect(() =>
      parseQueryExpression(
        {
          kind: "where",
          ref: { kind: "value", name: "resource" },
          op: "eq",
          value: "",
        },
        catalog,
        "bad query",
      ),
    ).toThrow("requires a non-empty string value");
  });

  it("rejects malformed date values", () => {
    expect(() =>
      parseQueryExpression(
        {
          kind: "where",
          ref: { kind: "value", name: "dueDate" },
          op: "eq",
          value: "05/01/2026",
        },
        catalog,
        "bad query",
      ),
    ).toThrow("must be a YYYY-MM-DD date");
  });

  it("rejects malformed date before values", () => {
    expect(() =>
      parseQueryExpression(
        {
          kind: "where",
          ref: { kind: "value", name: "dueDate" },
          op: "before",
          value: "05/01/2026",
        },
        catalog,
        "bad query",
      ),
    ).toThrow("must be a YYYY-MM-DD date");
  });

  it("rejects today for non-date predicates", () => {
    for (const ref of [
      { kind: "value" as const, name: "title" },
      { kind: "value" as const, name: "done" },
      { kind: "value" as const, name: "estimate" },
      { kind: "value" as const, name: "kind" },
      { kind: "value" as const, name: "resource" },
      { kind: "system" as const, name: "id" as const },
      { kind: "system" as const, name: "createdAt" as const },
    ]) {
      expect(() =>
        parseQueryExpression(
          {
            kind: "where",
            ref,
            op: "eq",
            value: { kind: "today" },
          },
          catalog,
          "bad query",
        ),
      ).toThrow();
    }
  });

  it("parses context values for scalar and reference equality predicates", () => {
    for (const ref of [
      { kind: "value" as const, name: "title" },
      { kind: "value" as const, name: "done" },
      { kind: "value" as const, name: "dueDate" },
      { kind: "value" as const, name: "estimate" },
      { kind: "value" as const, name: "kind" },
      { kind: "value" as const, name: "resource" },
    ]) {
      expect(
        parseQueryExpression(
          {
            kind: "where",
            ref,
            op: "eq",
            value: { kind: "context", name: "lookup" },
          },
          catalog,
          "bound query",
        ),
      ).toEqual({
        kind: "where",
        ref,
        op: "eq",
        value: { kind: "context", name: "lookup" },
      });
    }
  });

  it("rejects context values for system fields and non-equality predicates", () => {
    for (const ref of [
      { kind: "system" as const, name: "id" as const },
      { kind: "system" as const, name: "createdAt" as const },
    ]) {
      expect(() =>
        parseQueryExpression(
          {
            kind: "where",
            ref,
            op: "eq",
            value: { kind: "context", name: "lookup" },
          },
          catalog,
          "bad query",
        ),
      ).toThrow("context values require a scalar value or reference field");
    }

    expect(() =>
      parseQueryExpression(
        {
          kind: "where",
          ref: { kind: "value", name: "dueDate" },
          op: "before",
          value: { kind: "context", name: "resource" },
        },
        catalog,
        "bad query",
      ),
    ).toThrow();
  });

  it("rejects malformed context values", () => {
    expect(() =>
      parseQueryExpression(
        {
          kind: "where",
          ref: { kind: "value", name: "resource" },
          op: "eq",
          value: { kind: "context", name: "" },
        },
        catalog,
        "bad query",
      ),
    ).toThrow("context name must be a non-empty string");

    expect(() =>
      parseQueryExpression(
        {
          kind: "where",
          ref: { kind: "value", name: "resource" },
          op: "eq",
          value: { kind: "context" },
        },
        catalog,
        "bad query",
      ),
    ).toThrow('dynamic value must include "name"');
  });

  it("collects required context names", () => {
    expect(
      collectQueryContextNames({
        kind: "or",
        expressions: [
          {
            kind: "and",
            expressions: [
              {
                kind: "where",
                ref: { kind: "value", name: "resource" },
                op: "eq",
                value: { kind: "context", name: "resource" },
              },
              {
                kind: "where",
                ref: { kind: "value", name: "resource" },
                op: "eq",
                value: { kind: "context", name: "resource" },
              },
            ],
          },
          {
            kind: "where",
            ref: { kind: "value", name: "resource" },
            op: "eq",
            value: { kind: "context", name: "resource" },
          },
        ],
      }),
    ).toEqual(["resource"]);
  });

  it("detects exact context equality on every matching branch", () => {
    const lookupByTitleOrEstimate: QueryExpression = {
      kind: "or",
      expressions: [
        {
          kind: "where",
          ref: { kind: "value", name: "title" },
          op: "eq",
          value: { kind: "context", name: "lookup" },
        },
        {
          kind: "and",
          expressions: [
            {
              kind: "where",
              ref: { kind: "value", name: "done" },
              op: "eq",
              value: false,
            },
            {
              kind: "where",
              ref: { kind: "value", name: "estimate" },
              op: "eq",
              value: { kind: "context", name: "lookup" },
            },
          ],
        },
      ],
    };

    expect(queryRequiresContextEqualityOnEveryBranch(lookupByTitleOrEstimate, ["lookup"])).toBe(
      true,
    );
    expect(
      queryRequiresContextEqualityOnEveryBranch(
        {
          ...lookupByTitleOrEstimate,
          expressions: [...lookupByTitleOrEstimate.expressions, { kind: "all" }],
        },
        ["lookup"],
      ),
    ).toBe(false);
  });
});

describe("query evaluation", () => {
  it("matches all active records", () => {
    expect(matchesQuery(record, { kind: "all" })).toBe(true);
  });

  it("matches where queries against value refs", () => {
    expect(
      matchesQuery(record, {
        kind: "where",
        ref: { kind: "value", name: "done" },
        op: "eq",
        value: false,
      }),
    ).toBe(true);

    expect(
      matchesQuery(record, {
        kind: "where",
        ref: { kind: "value", name: "estimate" },
        op: "eq",
        value: 2,
      }),
    ).toBe(true);

    expect(
      matchesQuery(record, {
        kind: "where",
        ref: { kind: "value", name: "resource" },
        op: "eq",
        value: "record-resource-1",
      }),
    ).toBe(true);
  });

  it("matches where queries against system refs", () => {
    expect(
      matchesQuery(record, {
        kind: "where",
        ref: { kind: "system", name: "id" },
        op: "eq",
        value: "record-1",
      }),
    ).toBe(true);
  });

  it("matches scalar and reference equality against context values", () => {
    for (const [name, value] of [
      ["title", "Plan week"],
      ["done", false],
      ["dueDate", "2026-05-01"],
      ["estimate", 2],
      ["kind", "role"],
      ["resource", "record-resource-1"],
    ] as const) {
      const query = {
        kind: "where",
        ref: { kind: "value", name },
        op: "eq",
        value: { kind: "context", name: "lookup" },
      } as const;

      expect(
        matchesQuery(record, query, {
          today: "2026-05-01",
          values: { lookup: value },
        }),
      ).toBe(true);
    }
  });

  it("throws when context equality is evaluated without the required value", () => {
    expect(() =>
      matchesQuery(
        record,
        {
          kind: "where",
          ref: { kind: "value", name: "resource" },
          op: "eq",
          value: { kind: "context", name: "resource" },
        },
        { today: "2026-05-01" },
      ),
    ).toThrow('missing value "resource"');
  });

  it("matches date values before a literal date", () => {
    expect(
      matchesQuery(record, {
        kind: "where",
        ref: { kind: "value", name: "dueDate" },
        op: "before",
        value: "2026-05-02",
      }),
    ).toBe(true);

    expect(
      matchesQuery(record, {
        kind: "where",
        ref: { kind: "value", name: "dueDate" },
        op: "before",
        value: "2026-05-01",
      }),
    ).toBe(false);
  });

  it("matches date values before an injected today", () => {
    expect(
      matchesQuery(
        record,
        {
          kind: "where",
          ref: { kind: "value", name: "dueDate" },
          op: "before",
          value: { kind: "today" },
        },
        { today: "2026-05-02" },
      ),
    ).toBe(true);
  });

  it("does not match records with missing optional dates", () => {
    expect(
      matchesQuery(
        {
          ...record,
          values: {
            title: "Plan week",
            done: false,
          },
        },
        {
          kind: "where",
          ref: { kind: "value", name: "dueDate" },
          op: "before",
          value: "2026-05-02",
        },
      ),
    ).toBe(false);
  });

  it("matches and queries", () => {
    expect(
      matchesQuery(record, {
        kind: "and",
        expressions: [
          {
            kind: "where",
            ref: { kind: "value", name: "done" },
            op: "eq",
            value: false,
          },
          {
            kind: "where",
            ref: { kind: "value", name: "dueDate" },
            op: "before",
            value: "2026-05-02",
          },
        ],
      }),
    ).toBe(true);
  });

  it("matches or queries", () => {
    expect(
      matchesQuery(record, {
        kind: "or",
        expressions: [
          {
            kind: "where",
            ref: { kind: "value", name: "kind" },
            op: "eq",
            value: "stream",
          },
          {
            kind: "where",
            ref: { kind: "value", name: "kind" },
            op: "eq",
            value: "role",
          },
        ],
      }),
    ).toBe(true);

    expect(
      matchesQuery(record, {
        kind: "or",
        expressions: [
          {
            kind: "where",
            ref: { kind: "value", name: "kind" },
            op: "eq",
            value: "stream",
          },
          {
            kind: "where",
            ref: { kind: "value", name: "done" },
            op: "eq",
            value: true,
          },
        ],
      }),
    ).toBe(false);
  });

  it("does not match tombstoned records", () => {
    expect(
      matchesQuery(
        {
          ...record,
          deletedAt: "2026-04-29T00:00:00.000Z",
        },
        { kind: "all" },
      ),
    ).toBe(false);
  });

  it("does not match tombstoned records through and queries", () => {
    expect(
      matchesQuery(
        {
          ...record,
          deletedAt: "2026-04-29T00:00:00.000Z",
        },
        {
          kind: "and",
          expressions: [
            { kind: "all" },
            {
              kind: "where",
              ref: { kind: "value", name: "done" },
              op: "eq",
              value: false,
            },
          ],
        },
      ),
    ).toBe(false);
  });
});

describe("query capabilities", () => {
  it("accepts the portable query core", () => {
    expect(() => assertQuerySupported({ kind: "all" }, portableCapabilities)).not.toThrow();
    expect(() =>
      assertQuerySupported(
        {
          kind: "where",
          ref: { kind: "value", name: "done" },
          op: "eq",
          value: true,
        },
        portableCapabilities,
      ),
    ).not.toThrow();
    expect(() =>
      assertQuerySupported(
        {
          kind: "where",
          ref: { kind: "system", name: "id" },
          op: "eq",
          value: "record-1",
        },
        portableCapabilities,
      ),
    ).not.toThrow();
    expect(() =>
      assertQuerySupported(
        {
          kind: "and",
          expressions: [
            {
              kind: "where",
              ref: { kind: "value", name: "done" },
              op: "eq",
              value: true,
            },
            {
              kind: "where",
              ref: { kind: "value", name: "dueDate" },
              op: "before",
              value: { kind: "today" },
            },
          ],
        },
        portableCapabilities,
      ),
    ).not.toThrow();
    expect(() =>
      assertQuerySupported(
        {
          kind: "or",
          expressions: [
            {
              kind: "where",
              ref: { kind: "value", name: "kind" },
              op: "eq",
              value: "role",
            },
            {
              kind: "where",
              ref: { kind: "value", name: "kind" },
              op: "eq",
              value: "stream",
            },
          ],
        },
        portableCapabilities,
      ),
    ).not.toThrow();
  });

  it("rejects operators not listed in capabilities", () => {
    expect(() =>
      assertQuerySupported(
        {
          kind: "where",
          ref: { kind: "value", name: "done" },
          op: "eq",
          value: true,
        },
        {
          operators: [],
          fieldKinds: ["value"],
          expressionKinds: ["where"],
          dynamicValues: ["today"],
        },
        "limited backend",
      ),
    ).toThrow('unsupported operator "eq"');
  });

  it("rejects field kinds not listed in capabilities", () => {
    expect(() =>
      assertQuerySupported(
        {
          kind: "where",
          ref: { kind: "value", name: "done" },
          op: "eq",
          value: true,
        },
        {
          operators: ["eq"],
          fieldKinds: ["system"],
          expressionKinds: ["where"],
          dynamicValues: ["today"],
        },
        "limited backend",
      ),
    ).toThrow('unsupported field kind "value"');
  });

  it("rejects expression kinds not listed in capabilities", () => {
    expect(() =>
      assertQuerySupported(
        {
          kind: "and",
          expressions: [{ kind: "all" }],
        },
        {
          operators: ["eq"],
          fieldKinds: ["value"],
          expressionKinds: ["all", "where"],
          dynamicValues: ["today"],
        },
        "limited backend",
      ),
    ).toThrow('unsupported expression kind "and"');
  });

  it("rejects dynamic values not listed in capabilities", () => {
    expect(() =>
      assertQuerySupported(
        {
          kind: "where",
          ref: { kind: "value", name: "dueDate" },
          op: "before",
          value: { kind: "today" },
        },
        {
          operators: ["before"],
          fieldKinds: ["value"],
          expressionKinds: ["where"],
          dynamicValues: [],
        },
        "limited backend",
      ),
    ).toThrow('unsupported dynamic value "today"');
  });

  it("checks nested expressions against capabilities", () => {
    expect(() =>
      assertQuerySupported(
        {
          kind: "and",
          expressions: [
            {
              kind: "where",
              ref: { kind: "value", name: "done" },
              op: "eq",
              value: true,
            },
          ],
        },
        {
          operators: ["eq"],
          fieldKinds: ["system"],
          expressionKinds: ["and", "where"],
          dynamicValues: ["today"],
        },
        "limited backend",
      ),
    ).toThrow('unsupported field kind "value"');
  });
});

const taskEntity = {
  label: "Task",
  fields: {
    title: { type: "text", required: true, label: "Title" },
    done: { type: "boolean", required: true, label: "Done", default: false },
    dueDate: { type: "date", required: false, label: "Due date" },
    estimate: { type: "number", required: false, label: "Estimate", min: 0, integer: true },
    kind: {
      type: "enum",
      required: true,
      label: "Kind",
      default: "role",
      values: {
        role: { label: "Role" },
        stream: { label: "Stream" },
      },
    },
    resource: {
      type: "reference",
      required: true,
      label: "Resource",
      to: "resource",
      displayField: "name",
    },
  },
} satisfies EntitySchema;

const catalog = getEntityFieldCatalog(taskEntity);

const portableCapabilities = {
  operators: ["eq", "before"],
  fieldKinds: ["value", "system"],
  expressionKinds: ["all", "where", "and", "or"],
  dynamicValues: ["today", "context"],
} satisfies QueryCapabilities;

const record: StoredRecord = {
  id: "record-1",
  entity: "task",
  values: {
    id: "value-id",
    title: "Plan week",
    done: false,
    dueDate: "2026-05-01",
    estimate: 2,
    kind: "role",
    resource: "record-resource-1",
  },
  createdAt: "2026-04-28T00:00:00.000Z",
  updatedAt: "2026-04-28T00:00:01.000Z",
};
