import { describe, expect, it } from "vite-plus/test";
import {
  evaluateAggregate,
  evaluateNumericExpression,
  formatReadModelNumber,
  parseAppSchema,
  stringifySchema,
} from "./index.ts";
import { taskSchema } from "./schema-test-fixtures.ts";
import type { StoredRecord } from "./index.ts";
import type { NumericExpression } from "./index.ts";

describe("read model numeric expressions", () => {
  it("evaluates field references and number literals", () => {
    expect(evaluateNumericExpression({ kind: "field", field: "price" }, rateRecord)).toBe(250);
    expect(evaluateNumericExpression({ kind: "literal", value: 12.5 }, rateRecord)).toBe(12.5);
  });

  it("evaluates add, subtract, multiply, and divide expressions", () => {
    expect(
      evaluateNumericExpression(
        {
          kind: "binary",
          op: "add",
          left: { kind: "field", field: "price" },
          right: { kind: "literal", value: 50 },
        },
        rateRecord,
      ),
    ).toBe(300);

    expect(
      evaluateNumericExpression(
        {
          kind: "binary",
          op: "subtract",
          left: { kind: "field", field: "price" },
          right: { kind: "field", field: "cost" },
        },
        rateRecord,
      ),
    ).toBe(100);

    expect(
      evaluateNumericExpression(
        {
          kind: "binary",
          op: "multiply",
          left: { kind: "field", field: "cost" },
          right: { kind: "literal", value: 2 },
        },
        rateRecord,
      ),
    ).toBe(300);

    expect(
      evaluateNumericExpression(
        {
          kind: "binary",
          op: "divide",
          left: { kind: "field", field: "price" },
          right: { kind: "field", field: "cost" },
        },
        rateRecord,
      ),
    ).toBe(250 / 150);
  });

  it("evaluates nested expressions", () => {
    const marginExpression: NumericExpression = {
      kind: "binary",
      op: "divide",
      left: {
        kind: "binary",
        op: "subtract",
        left: { kind: "field", field: "price" },
        right: { kind: "field", field: "cost" },
      },
      right: { kind: "field", field: "price" },
    };

    expect(evaluateNumericExpression(marginExpression, rateRecord)).toBe(0.4);
  });

  it("returns no value for divide-by-zero and non-finite arithmetic", () => {
    expect(
      evaluateNumericExpression(
        {
          kind: "binary",
          op: "divide",
          left: { kind: "field", field: "price" },
          right: { kind: "literal", value: 0 },
        },
        rateRecord,
      ),
    ).toBeUndefined();

    expect(
      evaluateNumericExpression(
        {
          kind: "binary",
          op: "multiply",
          left: { kind: "literal", value: Number.MAX_VALUE },
          right: { kind: "literal", value: Number.MAX_VALUE },
        },
        rateRecord,
      ),
    ).toBeUndefined();
  });

  it("returns no value for missing, non-number, and non-finite runtime values", () => {
    expect(
      evaluateNumericExpression({ kind: "field", field: "missing" }, rateRecord),
    ).toBeUndefined();
    expect(
      evaluateNumericExpression({ kind: "field", field: "currency" }, rateRecord),
    ).toBeUndefined();
    expect(
      evaluateNumericExpression({ kind: "field", field: "active" }, rateRecord),
    ).toBeUndefined();

    expect(
      evaluateNumericExpression(
        { kind: "field", field: "price" },
        {
          ...rateRecord,
          values: { ...rateRecord.values, price: Infinity },
        },
      ),
    ).toBeUndefined();
  });

  it("is deterministic and side-effect free", () => {
    const expression: NumericExpression = {
      kind: "binary",
      op: "subtract",
      left: { kind: "field", field: "price" },
      right: { kind: "field", field: "cost" },
    };
    const originalExpression = structuredClone(expression);
    const originalRecord = structuredClone(rateRecord);

    expect(evaluateNumericExpression(expression, rateRecord)).toBe(100);
    expect(evaluateNumericExpression(expression, rateRecord)).toBe(100);
    expect(expression).toEqual(originalExpression);
    expect(rateRecord).toEqual(originalRecord);
  });
});

describe("read model number formatting", () => {
  it("formats no value as empty text", () => {
    expect(formatReadModelNumber(undefined)).toBe("");
    expect(formatReadModelNumber(Infinity)).toBe("");
  });

  it("formats finite numbers deterministically", () => {
    expect(formatReadModelNumber(10)).toBe("10");
    expect(formatReadModelNumber(1.5)).toBe("1.5");
    expect(formatReadModelNumber(1 / 3)).toBe("0.33");
    expect(formatReadModelNumber(1.2)).toBe("1.2");
  });
});

describe("read model aggregates", () => {
  const records = [
    rateRecord,
    {
      ...rateRecord,
      id: "rate-2",
      values: { ...rateRecord.values, cost: 300, price: 600 },
    },
  ];

  it("evaluates count, sum, average, min, and max aggregates", () => {
    expect(evaluateAggregate({ query: "rates", function: "count" }, records)).toBe(2);
    expect(
      evaluateAggregate(
        { query: "rates", function: "sum", value: { kind: "field", field: "cost" } },
        records,
      ),
    ).toBe(450);
    expect(
      evaluateAggregate(
        { query: "rates", function: "average", value: { kind: "field", field: "price" } },
        records,
      ),
    ).toBe(425);
    expect(
      evaluateAggregate(
        { query: "rates", function: "min", value: { kind: "field", field: "cost" } },
        records,
      ),
    ).toBe(150);
    expect(
      evaluateAggregate(
        { query: "rates", function: "max", value: { kind: "field", field: "price" } },
        records,
      ),
    ).toBe(600);
  });

  it("evaluates aggregate values from computed values", () => {
    expect(
      evaluateAggregate(
        {
          query: "rates",
          function: "average",
          value: { kind: "computed", computedValue: "rateMargin" },
        },
        records,
        {
          rateMargin: {
            entity: "rate",
            type: "number",
            expression: {
              kind: "binary",
              op: "divide",
              left: {
                kind: "binary",
                op: "subtract",
                left: { kind: "field", field: "price" },
                right: { kind: "field", field: "cost" },
              },
              right: { kind: "field", field: "price" },
            },
          },
        },
      ),
    ).toBe(0.45);
  });

  it("skips bad runtime aggregate values without crashing", () => {
    expect(
      evaluateAggregate(
        { query: "rates", function: "sum", value: { kind: "field", field: "cost" } },
        [
          rateRecord,
          {
            ...rateRecord,
            id: "rate-2",
            values: { ...rateRecord.values, cost: "unknown" },
          },
        ],
      ),
    ).toBe(150);
  });

  it("renders empty aggregate inputs predictably", () => {
    expect(evaluateAggregate({ query: "rates", function: "count" }, [])).toBe(0);
    expect(
      evaluateAggregate(
        { query: "rates", function: "sum", value: { kind: "field", field: "cost" } },
        [],
      ),
    ).toBe(0);
    expect(
      evaluateAggregate(
        { query: "rates", function: "average", value: { kind: "field", field: "cost" } },
        [],
      ),
    ).toBeUndefined();
    expect(
      evaluateAggregate(
        { query: "rates", function: "min", value: { kind: "field", field: "cost" } },
        [],
      ),
    ).toBeUndefined();
    expect(
      evaluateAggregate(
        { query: "rates", function: "max", value: { kind: "field", field: "cost" } },
        [],
      ),
    ).toBeUndefined();
  });
});

describe("schema read models", () => {
  it("parses computed values and aggregates through the app schema boundary", () => {
    const schema = parseAppSchema(readModelSchema());
    expect(schema.readModels).toEqual({
      computedValues: [
        {
          key: "doubledEstimate",
          entity: "task",
          type: "number",
          expression: {
            kind: "binary",
            op: "multiply",
            left: { kind: "field", field: "estimate" },
            right: { kind: "literal", value: 2 },
          },
        },
      ],
      aggregates: [
        { key: "taskCount", query: "taskAll", function: "count" },
        {
          key: "totalEstimate",
          query: "taskAll",
          function: "sum",
          value: { kind: "field", field: "estimate" },
        },
        {
          key: "averageDoubledEstimate",
          query: "taskAll",
          function: "average",
          value: { kind: "computed", computedValue: "doubledEstimate" },
        },
      ],
    });
    expect(parseAppSchema(JSON.parse(stringifySchema(schema)))).toEqual(schema);
  });

  it("rejects invalid computed and aggregate references", () => {
    expect(() =>
      parseAppSchema({
        ...readModelSchema(),
        readModels: {
          computedValues: [
            {
              key: "invalid",
              entity: "task",
              type: "number",
              expression: { kind: "field", field: "title" },
            },
          ],
        },
      }),
    ).toThrow('field "task.title" must be a number field');

    expect(() =>
      parseAppSchema({
        ...readModelSchema(),
        readModels: {
          aggregates: [
            {
              key: "invalid",
              query: "missing",
              function: "sum",
              value: { kind: "field", field: "estimate" },
            },
          ],
        },
      }),
    ).toThrow('references unknown query "missing"');
  });
});

function readModelSchema() {
  return taskSchema({
    readModels: {
      computedValues: [
        {
          key: "doubledEstimate",
          entity: "task",
          type: "number",
          expression: {
            kind: "binary",
            op: "multiply",
            left: { kind: "field", field: "estimate" },
            right: { kind: "literal", value: 2 },
          },
        },
      ],
      aggregates: [
        { key: "taskCount", query: "taskAll", function: "count" },
        {
          key: "totalEstimate",
          query: "taskAll",
          function: "sum",
          value: { kind: "field", field: "estimate" },
        },
        {
          key: "averageDoubledEstimate",
          query: "taskAll",
          function: "average",
          value: { kind: "computed", computedValue: "doubledEstimate" },
        },
      ],
    },
  });
}

const rateRecord: StoredRecord = {
  id: "rate-1",
  entity: "rate",
  values: {
    resource: "resource-1",
    card: "card-1",
    cost: 150,
    price: 250,
    currency: "USD",
    active: true,
  },
  createdAt: "2026-05-06T00:00:00.000Z",
  updatedAt: "2026-05-06T00:00:00.000Z",
};
