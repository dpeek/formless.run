import { describe, expect, it } from "vite-plus/test";

import { parseAppSchema } from "./index.ts";
import { taskSchema, taskScreen } from "./schema-test-fixtures.ts";

describe("schema screens", () => {
  it("parses static app-relative paths and rejects duplicate routes", () => {
    const schema = parseAppSchema({
      ...taskSchema(),
      screens: [
        {
          key: "home",
          ...taskScreen({ path: "/schema" }),
        },
      ],
    });
    expect(schema.screens.find((definition) => definition.key === "home")?.path).toBe("/schema");
    expect(() =>
      parseAppSchema({
        ...taskSchema(),
        screens: [
          {
            key: "home",
            ...taskScreen({ path: "/tasks" }),
          },
          {
            key: "duplicate",
            ...taskScreen({ label: "Duplicate", path: "/tasks" }),
          },
        ],
      }),
    ).toThrow('Screen path "/tasks" must be unique. Used by "home" and "duplicate".');
    for (const path of ["", "tasks", "/tasks/:taskId", "/*"]) {
      expect(() =>
        parseAppSchema({
          ...taskSchema(),
          screens: [
            {
              key: "home",
              ...taskScreen({ path }),
            },
          ],
        }),
      ).toThrow('Screen "home" path must be a static app-relative path.');
    }
  });

  it("validates layout section identity and collection view references", () => {
    expect(() =>
      parseAppSchema({
        ...taskSchema(),
        screens: [
          {
            key: "home",
            ...taskScreen({
              layout: {
                type: "stack",
                sections: [
                  { id: "tasks", type: "collection", view: "taskHome" },
                  { id: "tasks", type: "collection", view: "taskHome" },
                ],
              },
            }),
          },
        ],
      }),
    ).toThrow('Screen "home" layout section id "tasks" must be unique.');
    expect(() =>
      parseAppSchema({
        ...taskSchema(),
        screens: [
          {
            key: "home",
            ...taskScreen({
              layout: {
                type: "stack",
                sections: [{ id: "tasks", type: "collection", view: "taskCreate" }],
              },
            }),
          },
        ],
      }),
    ).toThrow('Screen "home" layout section 0 must reference a collection view.');
  });

  it("parses semantic layout widths with a standard default", () => {
    for (const width of ["narrow", "standard", "wide"] as const) {
      const schema = parseAppSchema({
        ...taskSchema(),
        screens: [
          {
            key: "home",
            ...taskScreen({
              layout: {
                type: "stack",
                width,
                sections: [{ id: "tasks", type: "collection", view: "taskHome" }],
              },
            }),
          },
        ],
      });
      expect(schema.screens.find((definition) => definition.key === "home")?.layout.width).toBe(
        width,
      );
    }
    expect(
      parseAppSchema(taskSchema()).screens.find((definition) => definition.key === "home")?.layout
        .width,
    ).toBe("standard");
    expect(() =>
      parseAppSchema({
        ...taskSchema(),
        screens: [
          {
            key: "home",
            ...taskScreen({
              layout: {
                type: "stack",
                width: "full",
                sections: [{ id: "tasks", type: "collection", view: "taskHome" }],
              },
            }),
          },
        ],
      }),
    ).toThrow('Screen "home" layout width must be "narrow", "standard", or "wide".');
  });
  it("parses optional owner, authenticated, and anonymous screen access", () => {
    const schema = parseAppSchema(screenAccessSchema());
    expect(schema.screens.find((definition) => definition.key === "home")!.access).toBe("owner");
    expect(schema.screens.find((definition) => definition.key === "members")!.access).toBe(
      "authenticated",
    );
    expect(schema.screens.find((definition) => definition.key === "public")!.access).toBe(
      "anonymous",
    );
    expect(
      schema.screens.find((definition) => definition.key === "inherited")!.access,
    ).toBeUndefined();
  });
  it("rejects unsupported screen access", () => {
    expect(() =>
      parseAppSchema({
        ...screenAccessSchema(),
        screens: [
          {
            ...screenAccessSchema().screens.find((definition) => definition.key === "home")!,
            access: "admin",
          },
        ],
      }),
    ).toThrow('Screen "home" access must be "anonymous", "authenticated", or "owner".');
  });
});

function screenAccessSchema() {
  return {
    version: 1,
    entities: [
      {
        key: "task",
        label: "Task",
        fields: [{ key: "title", type: "text", required: true, label: "Title" }],
        operations: [
          {
            key: "create",
            kind: "create",
            scope: "collection",
            effect: { type: "createRecord" },
          },
        ],
      },
    ],
    queries: [{ key: "taskAll", label: "Tasks", entity: "task", expression: { kind: "all" } }],
    itemViews: [
      {
        key: "taskItem",
        entity: "task",
        fields: [{ field: "title", editor: "text", commit: "field-commit" }],
      },
    ],
    tableViews: [],
    views: [
      {
        key: "taskList",
        type: "collection",
        label: "Tasks",
        entity: "task",
        queries: [{ query: "taskAll" }],
        defaultQuery: "taskAll",
        result: { type: "list", itemView: "taskItem" },
      },
    ],
    screens: [
      {
        key: "home",
        type: "workspace",
        label: "Home",
        access: "owner",
        layout: {
          type: "stack",
          sections: [{ id: "tasks", type: "collection", view: "taskList" }],
        },
      },
      {
        key: "public",
        type: "workspace",
        label: "Public",
        access: "anonymous",
        layout: {
          type: "stack",
          sections: [{ id: "public-tasks", type: "collection", view: "taskList" }],
        },
      },
      {
        key: "members",
        type: "workspace",
        label: "Members",
        access: "authenticated",
        layout: {
          type: "stack",
          sections: [{ id: "member-tasks", type: "collection", view: "taskList" }],
        },
      },
      {
        key: "inherited",
        type: "workspace",
        label: "Inherited",
        layout: {
          type: "stack",
          sections: [{ id: "inherited-tasks", type: "collection", view: "taskList" }],
        },
      },
    ],
  };
}
