import { describe, expect, it } from "vite-plus/test";

import {
  evaluateAccessRequirement,
  flattenAppNavigationScreenKeys,
  parseAppSchema,
  stringifySchema,
  type AccessCallerFacts,
  type AppNavigationSchema,
  type AppNavigationSchemaSource,
  type AppAuthorizationSchemaSource,
  type AppSchemaSource,
  type KeyedDefinition,
  type ScreenAccessRequirementSource,
  type ScreenSchemaSource,
  type WorkspaceScreenSchema,
} from "./index.ts";
import { taskCollectionView, taskSchema, taskScreen } from "./schema-test-fixtures.ts";

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
  it("parses ordered grouped navigation and preserves omitted direct screens", () => {
    const navigation = {
      groups: [
        {
          key: "operations",
          label: "Operations",
          screens: [
            "reports",
            { key: "daily", label: "Daily", icon: "calendar", screens: ["home"] },
          ],
        },
        { key: "settings", label: "Settings", screens: ["settings"] },
      ],
    } satisfies AppNavigationSchemaSource;
    const schema = parseAppSchema({
      ...taskSchema(),
      navigation,
      screens: [
        { key: "home", ...taskScreen() },
        { key: "reports", ...taskScreen({ label: "Reports" }) },
        { key: "settings", ...taskScreen({ label: "Settings", path: "/settings" }) },
        { key: "direct", ...taskScreen({ label: "Direct", path: "/direct" }) },
      ],
    });
    const parsedNavigation: AppNavigationSchema = schema.navigation!;

    expect(parsedNavigation).toEqual(navigation);
    expect(
      parsedNavigation.groups?.flatMap((group) => flattenAppNavigationScreenKeys(group.screens)),
    ).toEqual(["reports", "home", "settings"]);
    expect(schema.screens.find((screen) => screen.key === "direct")?.path).toBe("/direct");
    expect(JSON.parse(stringifySchema(schema)).navigation).toEqual(navigation);
  });

  it("parses interleaved flat navigation sections and object screen references", () => {
    const navigation = {
      primaryScreens: [
        "reports",
        {
          key: "workflow",
          label: "Workflow",
          icon: "archive",
          screens: [
            "home",
            {
              screen: "settings",
              badge: { type: "queryCount", section: "tasks" },
            },
          ],
        },
        "direct",
      ],
    } satisfies AppNavigationSchemaSource;
    const schema = parseAppSchema({
      ...taskSchema(),
      navigation,
      screens: [
        { key: "home", ...taskScreen() },
        { key: "reports", ...taskScreen({ label: "Reports", path: "/reports" }) },
        {
          key: "settings",
          ...taskScreen({
            label: "Settings",
            path: "/settings",
            layout: {
              type: "stack",
              sections: [{ id: "tasks", type: "collection", view: "taskHome", query: "taskAll" }],
            },
          }),
        },
        { key: "direct", ...taskScreen({ label: "Direct", path: "/direct" }) },
      ],
    });

    expect(schema.navigation).toEqual(navigation);
    expect(flattenAppNavigationScreenKeys(schema.navigation!.primaryScreens!)).toEqual([
      "reports",
      "home",
      "settings",
      "direct",
    ]);
    expect(JSON.parse(stringifySchema(schema)).navigation).toEqual(navigation);
  });

  it("keeps flat primary screen navigation valid", () => {
    const navigation = { primaryScreens: ["settings", "home"] } satisfies AppNavigationSchemaSource;
    const schema = parseAppSchema({
      ...taskSchema(),
      navigation,
      screens: [
        { key: "home", ...taskScreen() },
        { key: "settings", ...taskScreen({ label: "Settings" }) },
      ],
    });

    expect(schema.navigation).toEqual(navigation);
  });

  it("rejects invalid grouped navigation", () => {
    const validGroup = { key: "work", label: "Work", screens: ["home"] };
    const invalidNavigations: { navigation: unknown; message: string }[] = [
      {
        navigation: { groups: "work" },
        message: "Schema navigation groups must be an array.",
      },
      {
        navigation: { groups: [{ ...validGroup, key: "" }] },
        message: "Schema navigation groups[0] key must be a non-empty string.",
      },
      {
        navigation: {
          groups: [validGroup, { key: "work", label: "Other", screens: ["settings"] }],
        },
        message: 'Schema navigation groups contains duplicate key "work".',
      },
      {
        navigation: { groups: [{ ...validGroup, label: " " }] },
        message: 'Schema navigation group "work" label must be a non-empty string.',
      },
      {
        navigation: { groups: [{ ...validGroup, screens: [] }] },
        message: 'Schema navigation group "work" screens must be a non-empty array.',
      },
      {
        navigation: { groups: [{ ...validGroup, screens: [""] }] },
        message: 'Schema navigation group "work" screens[0] must be a non-empty string.',
      },
      {
        navigation: { groups: [{ ...validGroup, screens: ["missing"] }] },
        message: 'Schema navigation group "work" references unknown screen "missing".',
      },
      {
        navigation: { groups: [{ ...validGroup, screens: ["home", "home"] }] },
        message: 'Schema navigation groups must not reference screen "home" more than once.',
      },
      {
        navigation: {
          groups: [validGroup, { key: "settings", label: "Settings", screens: ["home"] }],
        },
        message: 'Schema navigation groups must not reference screen "home" more than once.',
      },
      {
        navigation: { groups: [validGroup], primaryScreens: ["home"] },
        message: "Schema navigation must declare at most one of groups or primaryScreens.",
      },
      {
        navigation: {
          groups: [
            {
              ...validGroup,
              screens: [{ key: "empty", label: "Empty", screens: [] }],
            },
          ],
        },
        message: 'Schema navigation group "work" screens[0] screens must be a non-empty array.',
      },
      {
        navigation: {
          groups: [
            {
              ...validGroup,
              screens: [
                { key: "daily", label: "Daily", screens: ["home"] },
                { key: "daily", label: "Again", screens: ["settings"] },
              ],
            },
          ],
        },
        message:
          'Schema navigation group "work" screens contains duplicate navigation section key "daily".',
      },
      {
        navigation: {
          groups: [
            {
              ...validGroup,
              screens: [
                {
                  key: "daily",
                  label: "Daily",
                  screens: [{ key: "nested", label: "Nested", screens: ["home"] }],
                },
              ],
            },
          ],
        },
        message: 'Schema navigation group "work" screens[0] screens[0] has unsupported key "key".',
      },
      {
        navigation: {
          groups: [
            {
              ...validGroup,
              screens: [{ key: "daily", label: "Daily", icon: "unknown", screens: ["home"] }],
            },
          ],
        },
        message:
          'Schema navigation group "work" screens[0] icon must be a supported semantic icon id.',
      },
      {
        navigation: {
          groups: [
            {
              ...validGroup,
              screens: ["home", { key: "daily", label: "Daily", screens: ["home"] }],
            },
          ],
        },
        message: 'Schema navigation groups must not reference screen "home" more than once.',
      },
    ];

    for (const { navigation, message } of invalidNavigations) {
      expect(() =>
        parseAppSchema({
          ...taskSchema(),
          navigation,
          screens: [
            { key: "home", ...taskScreen() },
            { key: "settings", ...taskScreen({ label: "Settings" }) },
          ],
        }),
      ).toThrow(message);
    }
  });

  it("uses flattened group order when validating an implicit root path", () => {
    expect(() =>
      parseAppSchema({
        ...taskSchema(),
        navigation: {
          groups: [
            {
              key: "work",
              label: "Work",
              screens: [{ key: "daily", label: "Daily", screens: ["grouped"] }],
            },
          ],
        },
        screens: [
          { key: "directRoot", ...taskScreen({ label: "Direct root", path: "/" }) },
          { key: "grouped", ...taskScreen({ label: "Grouped" }) },
        ],
      }),
    ).toThrow(
      'Screen path "/" must be unique. It is implied by "grouped" and declared by "directRoot".',
    );
  });

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

  it("binds collection screen sections to declared view queries", () => {
    const source = taskSchema();
    const schema = parseAppSchema({
      ...source,
      queries: [
        ...source.queries,
        {
          key: "taskDone",
          label: "Done tasks",
          entity: "task",
          expression: {
            kind: "where",
            ref: { kind: "value", name: "done" },
            op: "eq",
            value: true,
          },
        },
      ],
      views: source.views.map((view) =>
        view.key === "taskHome"
          ? {
              key: "taskHome",
              ...taskCollectionView({
                queries: [{ query: "taskAll" }, { query: "taskDone" }],
              }),
            }
          : view,
      ),
      screens: [
        {
          key: "home",
          ...taskScreen({
            layout: {
              type: "stack",
              sections: [{ id: "tasks", type: "collection", view: "taskHome", query: "taskDone" }],
            },
          }),
        },
      ],
    });

    expect(schema.screens[0]).toMatchObject({
      layout: {
        sections: [{ id: "tasks", type: "collection", view: "taskHome", query: "taskDone" }],
      },
    });
    expect(parseAppSchema(JSON.parse(stringifySchema(schema)))).toEqual(schema);
  });

  it("rejects screen-section queries outside their collection view", () => {
    const source = taskSchema();
    const screenWithQuery = (query: string) => ({
      key: "home",
      ...taskScreen({
        layout: {
          type: "stack",
          sections: [{ id: "tasks", type: "collection", view: "taskHome", query }],
        },
      }),
    });
    const taskDone = {
      key: "taskDone",
      label: "Done tasks",
      entity: "task",
      expression: {
        kind: "where",
        ref: { kind: "value", name: "done" },
        op: "eq",
        value: true,
      },
    };

    expect(() => parseAppSchema({ ...source, screens: [screenWithQuery("missing")] })).toThrow(
      'Screen "home" layout section 0 references unknown query "missing".',
    );
    expect(() =>
      parseAppSchema({
        ...source,
        queries: [...source.queries, taskDone],
        screens: [screenWithQuery("taskDone")],
      }),
    ).toThrow(
      'Screen "home" layout section 0 query "taskDone" must reference one of collection view "taskHome" query slots.',
    );
  });

  it("rejects invalid query-count badge targets", () => {
    const source = taskSchema();
    const navigation = (screen: string, section: string) => ({
      primaryScreens: [{ screen, badge: { type: "queryCount", section } }],
    });
    const boundHome = {
      key: "home",
      ...taskScreen({
        layout: {
          type: "stack",
          sections: [{ id: "tasks", type: "collection", view: "taskHome", query: "taskAll" }],
        },
      }),
    };

    expect(() =>
      parseAppSchema({
        ...source,
        navigation: navigation("access", "tasks"),
        screens: [boundHome, { key: "access", type: "runtime", label: "Access", path: "/access" }],
      }),
    ).toThrow(
      'Schema navigation primaryScreens[0] badge cannot reference runtime screen "access".',
    );
    expect(() =>
      parseAppSchema({
        ...source,
        navigation: navigation("home", "missing"),
        screens: [boundHome],
      }),
    ).toThrow(
      'Schema navigation primaryScreens[0] badge references unknown screen section "missing".',
    );
    expect(() =>
      parseAppSchema({
        ...source,
        navigation: navigation("home", "tasks"),
      }),
    ).toThrow(
      'Schema navigation primaryScreens[0] badge screen section "tasks" must bind a query.',
    );
    expect(() =>
      parseAppSchema({
        ...source,
        navigation: { primaryScreens: [{ screen: "home" }] },
        screens: [boundHome],
      }),
    ).toThrow('Schema navigation primaryScreens[0] must include "badge".');
    expect(() =>
      parseAppSchema({
        ...source,
        navigation: {
          primaryScreens: [{ screen: "home", badge: { type: "storedCount", section: "tasks" } }],
        },
        screens: [boundHome],
      }),
    ).toThrow('Schema navigation primaryScreens[0] badge type must be "queryCount".');
  });

  it("rejects query-count badges whose bound query requires context", () => {
    const source = taskSchema();
    const taskEntity = source.entities[0];
    const schema = {
      ...source,
      entities: [
        {
          ...taskEntity,
          fields: [
            ...taskEntity.fields,
            {
              key: "project",
              type: "reference",
              required: false,
              label: "Project",
              to: "project",
              displayField: "name",
            },
          ],
        },
        {
          key: "project",
          id: "entity_b81e058e-ae5e-42a2-8aaf-504a90a6133e",
          label: "Project",
          fields: [{ key: "name", type: "text", required: true, label: "Name" }],
        },
      ],
      queries: [
        ...source.queries,
        { key: "projectAll", label: "Projects", entity: "project", expression: { kind: "all" } },
        {
          key: "tasksForProject",
          label: "Tasks for project",
          entity: "task",
          expression: {
            kind: "where",
            ref: { kind: "value", name: "project" },
            op: "eq",
            value: { kind: "context", name: "project" },
          },
        },
      ],
      views: source.views.map((view) =>
        view.key === "taskHome"
          ? {
              key: "taskHome",
              ...taskCollectionView({
                scope: {
                  name: "project",
                  entity: "project",
                  query: "projectAll",
                  selection: "singleton",
                },
                queries: [{ query: "tasksForProject" }],
                defaultQuery: "tasksForProject",
              }),
            }
          : view,
      ),
      screens: [
        {
          key: "home",
          ...taskScreen({
            layout: {
              type: "stack",
              sections: [
                {
                  id: "tasks",
                  type: "collection",
                  view: "taskHome",
                  query: "tasksForProject",
                },
              ],
            },
          }),
        },
      ],
      navigation: {
        primaryScreens: [{ screen: "home", badge: { type: "queryCount", section: "tasks" } }],
      },
    };

    expect(() => parseAppSchema(schema)).toThrow(
      'Schema navigation primaryScreens[0] badge query "tasksForProject" must not require context.',
    );
  });

  it("parses runtime-owned screens without projecting workspace data", () => {
    const runtimeScreen = {
      key: "access",
      type: "runtime",
      label: "Access",
      path: "/settings/access",
      access: { actor: "owner" },
    } satisfies AppSchemaSource["screens"][number];
    const schema = parseAppSchema({
      ...taskSchema(),
      navigation: { primaryScreens: ["home", "access"] },
      screens: [{ key: "home", ...taskScreen() }, runtimeScreen],
    });

    expect(schema.screens.find((screen) => screen.key === "access")).toEqual(runtimeScreen);
    expect(JSON.parse(stringifySchema(schema)).screens[1]).toEqual(runtimeScreen);
  });

  it("parses a runtime-only presentation without generated views", () => {
    const schema = parseAppSchema({
      ...taskSchema(),
      itemViews: [],
      tableViews: [],
      views: [],
      screens: [
        {
          key: "access",
          type: "runtime",
          label: "Access",
          path: "/settings/access",
          access: { actor: "owner" },
        },
      ],
    });

    expect(schema.itemViews).toEqual([]);
    expect(schema.tableViews).toEqual([]);
    expect(schema.views).toEqual([]);
    expect(schema.screens).toEqual([
      {
        key: "access",
        type: "runtime",
        label: "Access",
        path: "/settings/access",
        access: { actor: "owner" },
      },
    ]);
  });

  it.each([
    ["layout", { type: "stack", sections: [] }],
    ["view", "taskHome"],
    ["views", ["taskHome"]],
  ])("rejects runtime-owned screen %s data", (key, value) => {
    expect(() =>
      parseAppSchema({
        ...taskSchema(),
        screens: [
          {
            key: "access",
            type: "runtime",
            label: "Access",
            [key]: value,
          },
        ],
      }),
    ).toThrow(`Screen "access" has unsupported key "${key}".`);
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
      expect(
        schema.screens.find(
          (definition): definition is KeyedDefinition<WorkspaceScreenSchema> =>
            definition.key === "home" && definition.type === "workspace",
        )?.layout.width,
      ).toBe(width);
    }
    expect(
      parseAppSchema(taskSchema()).screens.find(
        (definition): definition is KeyedDefinition<WorkspaceScreenSchema> =>
          definition.key === "home" && definition.type === "workspace",
      )?.layout.width,
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
