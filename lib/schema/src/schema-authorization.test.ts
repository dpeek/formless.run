import { describe, expect, it } from "vite-plus/test";

import {
  accessActors,
  evaluateAccessRequirement,
  getAppSchemaDefinitionIndex,
  isAuthorizationRoleId,
  isEntityOperationVisibleToBrowser,
  parseAccessRequirement,
  parseAppSchema,
  parseAuthorizationRoleId,
  stringifySchema,
  type AccessCallerFacts,
  type AccessRequirement,
  type AccessRequirementSource,
  type AppAuthorizationSchema,
  type AppSchema,
  type AppSchemaSource,
  type EntityOperationSchemaSource,
} from "./index.ts";
import { taskEntity, taskSchema } from "./schema-test-fixtures.ts";

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
] as const;

describe("schema authorization", () => {
  it("parses an optional ordered root role catalog with stable identities", () => {
    const source = taskSchema({
      authorization: { roles: roleDefinitions },
    }) as AppSchemaSource;
    const schema = parseAppSchema(source);
    const authorization: AppAuthorizationSchema | undefined = schema.authorization;

    expect(authorization?.roles).toEqual(roleDefinitions);
    expect(authorization?.roles.map(({ key }) => key)).toEqual([
      "member",
      "editor",
      "administrator",
    ]);
    expect(parseAppSchema(taskSchema())).not.toHaveProperty("authorization");

    const index = getAppSchemaDefinitionIndex(schema).authorization;
    expect(index.roles.byKey.get("editor")?.label).toBe("Editor");
    expect(index.rolesById.get(roleDefinitions[2].id)?.key).toBe("administrator");
  });

  it("validates canonical role ids, unique ids and keys, labels, and reserved actor names", () => {
    const id = roleDefinitions[0].id;
    expect(isAuthorizationRoleId(id)).toBe(true);
    expect(parseAuthorizationRoleId("Role id", id)).toBe(id);
    expect(isAuthorizationRoleId("role_8B9815CA-0993-41d3-a5cb-6724f1d5a467")).toBe(false);

    const invalidCases = [
      {
        authorization: { roles: [] },
        message: "Schema authorization roles must not be empty.",
      },
      {
        authorization: {
          roles: [{ ...roleDefinitions[0], id: "role_not-a-uuid" }],
        },
        message: 'must use "role_<lowercase-uuid>" format.',
      },
      {
        authorization: {
          roles: [roleDefinitions[0], { ...roleDefinitions[0], label: "Duplicate" }],
        },
        message: 'Schema authorization roles contains duplicate key "member".',
      },
      {
        authorization: {
          roles: [roleDefinitions[0], { ...roleDefinitions[1], id: roleDefinitions[0].id }],
        },
        message: `duplicate role id "${roleDefinitions[0].id}"`,
      },
      {
        authorization: {
          roles: [{ ...roleDefinitions[0], label: "" }],
        },
        message: "label must be a non-empty string.",
      },
    ];

    for (const invalidCase of invalidCases) {
      expect(() =>
        parseAppSchema(taskSchema({ authorization: invalidCase.authorization })),
      ).toThrow(invalidCase.message);
    }

    for (const actor of accessActors) {
      expect(() =>
        parseAppSchema(
          taskSchema({
            authorization: {
              roles: [{ ...roleDefinitions[0], key: actor }],
            },
          }),
        ),
      ).toThrow("key is reserved for an intrinsic or trusted access actor.");
    }
  });

  it("parses direct and flat alternative requirements against the complete schema", () => {
    const schema = schemaWithAuthorization();
    const source: AccessRequirementSource = {
      anyOf: [{ role: "editor" }, { actor: "runner" }],
    };

    expect(parseAccessRequirement({ actor: "authenticated" }, schema)).toEqual({
      actor: "authenticated",
    });
    expect(parseAccessRequirement({ role: "member" }, schema)).toEqual({ role: "member" });
    expect(parseAccessRequirement(source, schema)).toEqual(source);

    const invalidCases = [
      {
        requirement: { actor: "admin" },
        message: "actor must be anonymous, authenticated, owner, runner, deployer, or adminBearer",
      },
      {
        requirement: { role: "missing" },
        message: 'references unknown authorization role "missing"',
      },
      {
        requirement: { actor: "owner", role: "administrator" },
        message: 'must declare exactly one of "actor", "role", or "anyOf"',
      },
      {
        requirement: { anyOf: [] },
        message: "anyOf must be a non-empty array",
      },
      {
        requirement: { anyOf: [{ anyOf: [{ actor: "owner" }] }] },
        message: "nested anyOf is unsupported",
      },
      {
        requirement: { anyOf: [{ actor: "owner", role: "administrator" }] },
        message: 'must declare exactly one of "actor" or "role"',
      },
    ];

    for (const invalidCase of invalidCases) {
      expect(() => parseAccessRequirement(invalidCase.requirement, schema)).toThrow(
        invalidCase.message,
      );
    }
  });

  it("attaches access requirements to operations without conflating legacy actor policy", () => {
    const roleAccess = {
      role: "editor",
    } satisfies NonNullable<EntityOperationSchemaSource["access"]>;
    const existingOperations = taskEntity().operations;
    const source = taskSchema({
      authorization: { roles: roleDefinitions },
      entities: [
        {
          key: "task",
          ...taskEntity({
            operations: [
              ...existingOperations,
              {
                key: "roleRead",
                access: roleAccess,
                kind: "get",
                scope: "record",
                policy: { visible: false },
              },
              {
                key: "ownerRead",
                access: { actor: "owner" },
                kind: "get",
                scope: "record",
              },
              {
                key: "automationRead",
                access: { actor: "runner" },
                kind: "get",
                scope: "record",
                policy: { responseFields: { runner: ["id"] } },
              },
              {
                key: "editorOrRunnerRead",
                access: {
                  anyOf: [{ role: "editor" }, { actor: "runner" }],
                },
                kind: "get",
                scope: "record",
              },
              {
                key: "legacyInstalledAppRead",
                kind: "get",
                scope: "record",
                policy: {
                  actors: ["authenticated"],
                  responseFields: { authenticated: ["id"] },
                },
              },
            ],
          }),
        },
      ],
    }) as AppSchemaSource;
    const schema = parseAppSchema(source);
    const operationIndex = getAppSchemaDefinitionIndex(schema).operationsByEntity.get("task");

    expect(operationIndex?.byKey.get("roleRead")?.access).toEqual({ role: "editor" });
    expect(operationIndex?.byKey.get("roleRead")?.policy).toEqual({ visible: false });
    expect(operationIndex?.byKey.get("ownerRead")?.access).toEqual({ actor: "owner" });
    expect(operationIndex?.byKey.get("automationRead")).toMatchObject({
      access: { actor: "runner" },
      policy: { responseFields: { runner: ["id"] } },
    });
    expect(operationIndex?.byKey.get("editorOrRunnerRead")?.access).toEqual({
      anyOf: [{ role: "editor" }, { actor: "runner" }],
    });
    expect(operationIndex?.byKey.get("legacyInstalledAppRead")?.policy).toEqual({
      actors: ["authenticated"],
      responseFields: { authenticated: ["id"] },
    });
    expect(isEntityOperationVisibleToBrowser(operationIndex!.byKey.get("roleRead")!)).toBe(false);
    expect(isEntityOperationVisibleToBrowser(operationIndex!.byKey.get("ownerRead")!)).toBe(true);
    expect(isEntityOperationVisibleToBrowser(operationIndex!.byKey.get("automationRead")!)).toBe(
      false,
    );
    expect(
      isEntityOperationVisibleToBrowser(operationIndex!.byKey.get("editorOrRunnerRead")!),
    ).toBe(true);

    const artifact = stringifySchema(schema);
    expect(stringifySchema(schema)).toBe(artifact);
    expect(parseAppSchema(JSON.parse(artifact))).toEqual(schema);
  });

  it("rejects unresolved operation roles and mixed operation admission sources", () => {
    const invalidCases = [
      {
        operation: {
          key: "missingRole",
          access: { role: "missing" },
          kind: "get",
          scope: "record",
        },
        message: 'references unknown authorization role "missing"',
      },
      {
        operation: {
          key: "mixedAdmission",
          access: { actor: "owner" },
          kind: "get",
          scope: "record",
          policy: { actors: ["owner"] },
        },
        message: "must not declare both top-level access and policy.actors",
      },
    ];

    for (const invalidCase of invalidCases) {
      expect(() =>
        parseAppSchema(
          taskSchema({
            authorization: { roles: roleDefinitions },
            entities: [
              {
                key: "task",
                ...taskEntity({ operations: [invalidCase.operation] }),
              },
            ],
          }),
        ),
      ).toThrow(invalidCase.message);
    }
  });

  it("preserves role order in canonical schema data", () => {
    const schema = schemaWithAuthorization();
    const reversed = parseAppSchema(
      taskSchema({
        authorization: { roles: [...roleDefinitions].reverse() },
      }),
    );

    expect(JSON.parse(stringifySchema(schema)).authorization.roles).toEqual(roleDefinitions);
    expect(parseAppSchema(JSON.parse(stringifySchema(schema)))).toEqual(schema);
    expect(stringifySchema(reversed)).not.toBe(stringifySchema(schema));
  });
});

describe("access requirement evaluation", () => {
  const schema = schemaWithAuthorization();
  const anonymous = { kind: "anonymous" } satisfies AccessCallerFacts;
  const member = principal("member");
  const editor = principal("editor");
  const administrator = principal("administrator");
  const owner = { kind: "principal", active: true, owner: true } satisfies AccessCallerFacts;
  const inactiveOwner = {
    kind: "principal",
    active: false,
    owner: true,
  } satisfies AccessCallerFacts;
  const runner = { kind: "trusted", actor: "runner" } satisfies AccessCallerFacts;
  const deployer = { kind: "trusted", actor: "deployer" } satisfies AccessCallerFacts;

  it("admits intrinsic actors from active principal facts", () => {
    expect(evaluateAccessRequirement({ actor: "anonymous" }, anonymous, schema)).toBe(true);
    expect(evaluateAccessRequirement({ actor: "anonymous" }, member, schema)).toBe(true);
    expect(evaluateAccessRequirement({ actor: "authenticated" }, member, schema)).toBe(true);
    expect(evaluateAccessRequirement({ actor: "authenticated" }, owner, schema)).toBe(true);
    expect(evaluateAccessRequirement({ actor: "authenticated" }, anonymous, schema)).toBe(false);
    expect(evaluateAccessRequirement({ actor: "authenticated" }, inactiveOwner, schema)).toBe(
      false,
    );
    expect(evaluateAccessRequirement({ actor: "owner" }, owner, schema)).toBe(true);
    expect(evaluateAccessRequirement({ actor: "owner" }, administrator, schema)).toBe(false);
  });

  it("uses declaration order as the ordinary role threshold and admits active owners", () => {
    expect(evaluateAccessRequirement({ role: "editor" }, member, schema)).toBe(false);
    expect(evaluateAccessRequirement({ role: "editor" }, editor, schema)).toBe(true);
    expect(evaluateAccessRequirement({ role: "editor" }, administrator, schema)).toBe(true);
    expect(evaluateAccessRequirement({ role: "editor" }, owner, schema)).toBe(true);
    expect(evaluateAccessRequirement({ role: "editor" }, runner, schema)).toBe(false);
  });

  it("admits trusted runtime actors only through their exact explicit alternatives", () => {
    expect(evaluateAccessRequirement({ actor: "runner" }, runner, schema)).toBe(true);
    expect(evaluateAccessRequirement({ actor: "runner" }, deployer, schema)).toBe(false);
    expect(evaluateAccessRequirement({ actor: "runner" }, owner, schema)).toBe(false);
    expect(
      evaluateAccessRequirement(
        { anyOf: [{ role: "editor" }, { actor: "runner" }] },
        runner,
        schema,
      ),
    ).toBe(true);
  });

  it("fails closed for missing, inactive, unresolved, or malformed facts and requirements", () => {
    expect(evaluateAccessRequirement({ role: "member" }, undefined, schema)).toBe(false);
    expect(
      evaluateAccessRequirement(
        { role: "member" },
        {
          kind: "principal",
          active: false,
          owner: false,
          roleId: roleDefinitions[2].id,
        },
        schema,
      ),
    ).toBe(false);
    expect(
      evaluateAccessRequirement(
        { role: "member" },
        {
          kind: "principal",
          active: true,
          owner: false,
          roleId: "role_00000000-0000-0000-0000-000000000000",
        } as AccessCallerFacts,
        schema,
      ),
    ).toBe(false);
    expect(
      evaluateAccessRequirement(
        { actor: "unknown" } as unknown as AccessRequirement,
        anonymous,
        schema,
      ),
    ).toBe(false);
    expect(evaluateAccessRequirement({ anyOf: [] } as AccessRequirement, anonymous, schema)).toBe(
      false,
    );
  });
});

function schemaWithAuthorization(): AppSchema {
  return parseAppSchema(
    taskSchema({
      authorization: { roles: roleDefinitions },
    }),
  );
}

function principal(role: (typeof roleDefinitions)[number]["key"]): AccessCallerFacts {
  return {
    kind: "principal",
    active: true,
    owner: false,
    roleId: roleDefinitions.find((definition) => definition.key === role)!.id,
  };
}
