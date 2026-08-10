import { describe, expect, it } from "vite-plus/test";

import {
  composeAppSchema,
  defineAppSchemaModule,
  formatAppSchemaSource,
  getAppSchemaDefinitionIndex,
  mergeSchemaIconDefinitionsWithDefaults,
  parseAppSchema,
  type AppSchemaSource,
  type IconDefinitionSchema,
  type KeyedDefinition,
} from "./index.ts";
import { taskEntity, taskSchema } from "./schema-test-fixtures.ts";

const squareSource = '<svg viewBox="0 0 24 24"><rect width="24" height="24" /></svg>';
const circleSource = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /></svg>';

describe("App schema icons", () => {
  it("parses and indexes display-safe definitions in declaration order", () => {
    const schema = parseAppSchema(
      taskSchema({
        icons: [
          { key: "square", label: "Square", group: "Shapes", source: squareSource },
          { key: "circle", label: "Circle", source: circleSource },
        ],
      }),
    );
    const index = getAppSchemaDefinitionIndex(schema);

    expect(schema.icons).toEqual([
      { key: "square", label: "Square", group: "Shapes", source: squareSource },
      { key: "circle", label: "Circle", source: circleSource },
    ]);
    expect(index.icons.ordered.map(({ key }) => key)).toEqual(["square", "circle"]);
    expect(index.icons.byKey.get("circle")?.source).toBe(circleSource);
  });

  it("rejects duplicate keys and SVG outside the display-safe source policy", () => {
    expect(() =>
      parseAppSchema(
        taskSchema({
          icons: [
            { key: "same", label: "First", source: squareSource },
            { key: "same", label: "Second", source: circleSource },
          ],
        }),
      ),
    ).toThrow('Schema icons contains duplicate key "same".');
    expect(() =>
      parseAppSchema(
        taskSchema({
          icons: [
            {
              key: "unsafe",
              label: "Unsafe",
              source: "<svg><script>alert(1)</script></svg>",
            },
          ],
        }),
      ),
    ).toThrow('Schema icon "unsafe" source must be display-safe SVG.');
  });

  it("composes module declarations in explicit module and nested declaration order", () => {
    const shapes = defineAppSchemaModule({
      key: "shape-icons",
      icons: [
        { key: "square", label: "Square", source: squareSource },
        { key: "circle", label: "Circle", source: circleSource },
      ],
    });
    const marks = defineAppSchemaModule({
      key: "mark-icons",
      icons: [{ key: "check", label: "Check", source: squareSource }],
    });
    const base = completeTaskModule();
    const source = composeAppSchema({ version: 1, modules: [shapes, base, marks] });

    expect(source.icons?.map(({ key }) => key)).toEqual(["square", "circle", "check"]);
    expect(source).not.toHaveProperty("modules");
  });

  it("keeps source declarations canonical while parsing omitted icon behavior defaults", () => {
    const source = iconFieldSource();
    const formatted = formatAppSchemaSource(source);
    const parsedSource = JSON.parse(formatted) as AppSchemaSource;
    const parsedSchema = parseAppSchema(parsedSource);
    const iconField = parsedSchema.entities[0]!.fields.find(({ key }) => key === "icon");

    expect(parsedSource).toEqual(source);
    expect(parsedSource.entities[0]!.fields.find(({ key }) => key === "icon")).not.toHaveProperty(
      "icon",
    );
    expect(iconField).toMatchObject({
      format: "icon",
      icon: { valueMode: "svgSource" },
    });
    expect(parsedSource.icons?.map(({ key }) => key)).toEqual(["square", "circle"]);
  });

  it("places schema definitions first and replaces same-key baked defaults", () => {
    const schemaDefinitions = [
      { key: "shared", label: "Product shared", source: squareSource },
      { key: "product", label: "Product", source: circleSource },
    ];
    const bakedDefinitions = [
      { key: "add", label: "Add", source: squareSource },
      { key: "shared", label: "Baked shared", source: circleSource },
    ];

    expect(mergeSchemaIconDefinitionsWithDefaults(schemaDefinitions, bakedDefinitions)).toEqual([
      schemaDefinitions[0],
      schemaDefinitions[1],
      bakedDefinitions[0],
    ]);
  });
});

function completeTaskModule() {
  const source = taskSchema();
  return defineAppSchemaModule({
    key: "task",
    entities: source.entities as AppSchemaSource["entities"],
    queries: source.queries as AppSchemaSource["queries"],
    itemViews: source.itemViews as AppSchemaSource["itemViews"],
    tableViews: source.tableViews as AppSchemaSource["tableViews"],
    views: source.views as AppSchemaSource["views"],
    screens: source.screens as AppSchemaSource["screens"],
  });
}

function iconFieldSource(): AppSchemaSource {
  const icons = [
    { key: "square", label: "Square", source: squareSource },
    { key: "circle", label: "Circle", source: circleSource },
  ] satisfies KeyedDefinition<IconDefinitionSchema>[];
  const source = taskSchema({
    icons,
    entities: [
      {
        key: "task",
        ...taskEntity({
          fields: [
            ...taskEntity().fields,
            { key: "icon", type: "text", required: false, format: "icon" },
          ],
        }),
      },
    ],
  });

  return source as AppSchemaSource;
}
