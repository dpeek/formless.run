import { describe, expect, it } from "vite-plus/test";

import {
  evaluateAccessRequirement,
  parseAppSchema,
  stringifySchema,
  type AccessCallerFacts,
  type AppAuthorizationSchemaSource,
  type AppSchemaSource,
  type ScreenAccessRequirementSource,
  type ScreenSchemaSource,
} from "./index.ts";
import { taskSchema, taskScreen } from "./schema-test-fixtures.ts";

const roleDefinitions = [
  {
    key: "member",
    id: "role_8b9815ca-0993-41d3-a5cb-6724f1d5a467",
    label: "Member",
  },
  {
    key: "editor",
    id: "role_ae95e833-4338-42aa-bd31-ccd58f9163db",
    label: "Editor",
  },
  {
    key: "administrator",
    id: "role_93261a44-1e58-4e16-ac7a-5f217f78c6ef",
    label: "Administrator",
  },
] satisfies AppAuthorizationSchemaSource["roles"];

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
  it("parses browser actors, roles, and flat alternatives from typed source", () => {
    const authoredAlternative = {
      anyOf: [{ actor: "owner" }, { role: "editor" }],
    } satisfies ScreenAccessRequirementSource;
    const authoredRole = {
      role: "editor",
    } satisfies NonNullable<ScreenSchemaSource["access"]>;
    const schema = parseAppSchema(screenAccessSchema());

    expect(schema.screens.find((definition) => definition.key === "home")!.access).toEqual({
      actor: "owner",
    });
    expect(schema.screens.find((definition) => definition.key === "members")!.access).toEqual({
      actor: "authenticated",
    });
    expect(schema.screens.find((definition) => definition.key === "public")!.access).toEqual({
      actor: "anonymous",
    });
    expect(schema.screens.find((definition) => definition.key === "editors")!.access).toEqual(
      authoredRole,
    );
    expect(schema.screens.find((definition) => definition.key === "ownerOrEditor")!.access).toEqual(
      authoredAlternative,
    );
    expect(
      schema.screens.find((definition) => definition.key === "inherited")!.access,
    ).toBeUndefined();
  });

  it("evaluates screen role thresholds and alternatives with shared access semantics", () => {
    const schema = parseAppSchema(screenAccessSchema());
    const editorAccess = schema.screens.find((definition) => definition.key === "editors")!.access!;
    const alternativeAccess = schema.screens.find(
      (definition) => definition.key === "ownerOrEditor",
    )!.access!;
    const member = principal(roleDefinitions[0].id);
    const editor = principal(roleDefinitions[1].id);
    const administrator = principal(roleDefinitions[2].id);
    const owner = {
      kind: "principal",
      active: true,
      owner: true,
    } satisfies AccessCallerFacts;

    expect(evaluateAccessRequirement(editorAccess, member, schema)).toBe(false);
    expect(evaluateAccessRequirement(editorAccess, editor, schema)).toBe(true);
    expect(evaluateAccessRequirement(editorAccess, administrator, schema)).toBe(true);
    expect(evaluateAccessRequirement(editorAccess, owner, schema)).toBe(true);
    expect(evaluateAccessRequirement(alternativeAccess, { kind: "anonymous" }, schema)).toBe(false);
    expect(evaluateAccessRequirement(alternativeAccess, member, schema)).toBe(false);
    expect(evaluateAccessRequirement(alternativeAccess, editor, schema)).toBe(true);
    expect(evaluateAccessRequirement(alternativeAccess, owner, schema)).toBe(true);
  });

  it("rejects unresolved, trusted, legacy, mixed, empty, and nested screen access", () => {
    const invalidCases = [
      {
        access: "owner",
        message: 'Screen "home" access must be an object.',
      },
      {
        access: { role: "missing" },
        message: 'references unknown authorization role "missing"',
      },
      {
        access: { actor: "unknown" },
        message: "actor must be anonymous, authenticated, owner, runner, deployer, or adminBearer",
      },
      {
        access: { actor: "owner", role: "administrator" },
        message: 'must declare exactly one of "actor", "role", or "anyOf"',
      },
      {
        access: { anyOf: [] },
        message: "anyOf must be a non-empty array",
      },
      {
        access: { anyOf: [{ anyOf: [{ actor: "owner" }] }] },
        message: "nested anyOf is unsupported",
      },
      {
        access: { anyOf: [{ actor: "owner", role: "administrator" }] },
        message: 'must declare exactly one of "actor" or "role"',
      },
    ];

    for (const invalidCase of invalidCases) {
      expect(() => schemaWithHomeAccess(invalidCase.access)).toThrow(invalidCase.message);
    }

    for (const actor of ["runner", "deployer", "adminBearer"]) {
      expect(() => schemaWithHomeAccess({ actor })).toThrow(
        `actor "${actor}" is not available to browser presentation`,
      );
      expect(() => schemaWithHomeAccess({ anyOf: [{ actor: "owner" }, { actor }] })).toThrow(
        `actor "${actor}" is not available to browser presentation`,
      );
    }
  });

  it("round-trips deterministic parsed requirements without adding omitted access", () => {
    const schema = parseAppSchema(screenAccessSchema());
    const artifact = stringifySchema(schema);

    expect(stringifySchema(schema)).toBe(artifact);
    expect(parseAppSchema(JSON.parse(artifact))).toEqual(schema);
    expect(
      parseAppSchema(JSON.parse(artifact)).screens.find(
        (definition) => definition.key === "inherited",
      )!.access,
    ).toBeUndefined();
  });
});

function screenAccessSchema(): AppSchemaSource {
  return {
    version: 1,
    authorization: { roles: roleDefinitions },
    entities: [
      {
        id: "entity_10007871-53b5-4fba-a2c5-4d59cd44a6e0",
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
        access: { actor: "owner" },
        layout: {
          type: "stack",
          sections: [{ id: "tasks", type: "collection", view: "taskList" }],
        },
      },
      {
        key: "public",
        type: "workspace",
        label: "Public",
        access: { actor: "anonymous" },
        layout: {
          type: "stack",
          sections: [{ id: "public-tasks", type: "collection", view: "taskList" }],
        },
      },
      {
        key: "members",
        type: "workspace",
        label: "Members",
        access: { actor: "authenticated" },
        layout: {
          type: "stack",
          sections: [{ id: "member-tasks", type: "collection", view: "taskList" }],
        },
      },
      {
        key: "editors",
        type: "workspace",
        label: "Editors",
        access: { role: "editor" },
        layout: {
          type: "stack",
          sections: [{ id: "editor-tasks", type: "collection", view: "taskList" }],
        },
      },
      {
        key: "ownerOrEditor",
        type: "workspace",
        label: "Owner or editor",
        access: { anyOf: [{ actor: "owner" }, { role: "editor" }] },
        layout: {
          type: "stack",
          sections: [{ id: "public-or-editor-tasks", type: "collection", view: "taskList" }],
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

function principal(roleId: (typeof roleDefinitions)[number]["id"]): AccessCallerFacts {
  return {
    kind: "principal",
    active: true,
    owner: false,
    roleId,
  };
}

function schemaWithHomeAccess(access: unknown) {
  const source = screenAccessSchema();
  return parseAppSchema({
    ...source,
    screens: [
      {
        ...source.screens.find((definition) => definition.key === "home")!,
        access,
      },
    ],
  });
}
