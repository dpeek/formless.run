import { describe, expect, it } from "vite-plus/test";

import {
  appInstallInitializationPlan,
  appInstallRegistryError,
  appPackageManifestKind,
  appPackageManifestVersion,
  computeSourceSchemaHash,
  createAppInstall,
  createAppPackageResolver,
  findAppInstall,
  findResolvedAppPackage,
  isPackageAppRevision,
  isSourceSchemaHash,
  listAppInstalls,
  listInstallableAppPackages,
  listResolvedAppPackages,
  packageAppFactsForKey,
  parseAppInstallRegistrationOperation,
  parseAppInstallRegistrationPolicy,
  parseAppPackageManifest,
  sourceSchemaCanonicalJson,
  validateAppInstallId,
  type AppInstall,
  type CreateAppInstallResult,
  type SourceSchemaHash,
} from "./index.ts";

const now = "2026-05-22T08:00:00.000Z";
const siteSourceSchemaHash =
  "sha256:1111111111111111111111111111111111111111111111111111111111111111";
const tasksSourceSchemaHash =
  "sha256:2222222222222222222222222222222222222222222222222222222222222222";
const crmSourceSchemaHash =
  "sha256:3333333333333333333333333333333333333333333333333333333333333333";
const privateSourceSchemaHash =
  "sha256:4444444444444444444444444444444444444444444444444444444444444444";
type SourceSchemaHashFixture = ReturnType<typeof sourceSchemaHashFixture>;
type CreateAppInstallSuccess = Extract<
  CreateAppInstallResult,
  {
    ok: true;
  }
>;
type CreateAppInstallFailure = Extract<
  CreateAppInstallResult,
  {
    ok: false;
  }
>;
describe("app package manifests", () => {
  it("parses runtime-neutral package source facts", () => {
    expect(parseAppPackageManifest(privatePackageManifest())).toEqual({
      kind: appPackageManifestKind,
      version: appPackageManifestVersion,
      packageAppKey: "private-labs",
      label: "Private Labs",
      description: "Private lab package fixture.",
      defaultInstallId: "labs",
      supportsMultipleInstalls: false,
      packageRevision: 7,
      sourceSchema: {
        kind: "workspace",
        key: "private-labs",
        path: "packages/private-labs/schema.json",
      },
      sourceSchemaHash: privateSourceSchemaHash,
      capabilities: [
        {
          kind: "generatedAdmin",
          routeBase: "/apps",
        },
      ],
    });
  });

  it("validates package keys, install ids, revisions, locations, and capabilities", () => {
    const invalidCases: [string, unknown, RegExp][] = [
      ["package key", privatePackageManifest({ packageAppKey: "PrivateLabs" }), /packageAppKey/],
      [
        "default install id",
        privatePackageManifest({ defaultInstallId: "api" }),
        /defaultInstallId/,
      ],
      ["package revision", privatePackageManifest({ packageRevision: 0 }), /packageRevision/],
      [
        "source schema location",
        privatePackageManifest({
          sourceSchema: {
            kind: "workspace",
            key: "private-labs",
            path: "../schema.json",
          },
        }),
        /sourceSchema path/,
      ],
      [
        "capability",
        privatePackageManifest({
          capabilities: [
            {
              kind: "generatedAdmin",
              routeBase: "/admin",
            },
          ],
        }),
        /capabilities/,
      ],
      [
        "source-only boundary",
        {
          ...privatePackageManifest(),
          appInstalls: [],
        },
        /unsupported field "appInstalls"/,
      ],
    ];

    for (const [label, manifest, message] of invalidCases) {
      expect(() => parseAppPackageManifest(manifest), label).toThrow(message);
    }
  });

  it("resolves caller-supplied package manifests without global package facts", () => {
    const resolver = bundledFixtureResolver();

    expect(listResolvedAppPackages(resolver)).toEqual([
      expect.objectContaining({
        adminRouteBase: "/apps",
        defaultInstallId: "site",
        label: "Site",
        packageAppKey: "site",
        packageRevision: 1,
        sourceOrigin: "bundled",
        sourceSchemaKey: "site",
        sourceSchemaHash: siteSourceSchemaHash,
      }),
      expect.objectContaining({
        adminRouteBase: "/apps",
        defaultInstallId: "tasks",
        label: "Tasks",
        packageAppKey: "tasks",
        packageRevision: 1,
        sourceOrigin: "bundled",
        sourceSchemaKey: "tasks",
        sourceSchemaHash: tasksSourceSchemaHash,
      }),
      expect.objectContaining({
        adminRouteBase: "/apps",
        defaultInstallId: "crm",
        label: "CRM",
        packageAppKey: "crm",
        packageRevision: 1,
        sourceOrigin: "bundled",
        sourceSchemaKey: "crm",
        sourceSchemaHash: crmSourceSchemaHash,
      }),
    ]);
    expect(findResolvedAppPackage("missing", resolver)).toBeUndefined();
    expect(packageAppFactsForKey("tasks", resolver)).toEqual({
      packageRevision: 1,
      sourceSchemaHash: tasksSourceSchemaHash,
    });
  });

  it("keeps private package fixtures scoped to the active resolver", () => {
    const defaultResolver = bundledFixtureResolver();
    const activeResolver = createAppPackageResolver([
      ...bundledPackageManifests(),
      privatePackageManifest(),
    ]);

    expect(findResolvedAppPackage("private-labs", defaultResolver)).toBeUndefined();
    expect(activeResolver.findPackage("private-labs")).toEqual(
      expect.objectContaining({
        defaultInstallId: "labs",
        label: "Private Labs",
        packageAppKey: "private-labs",
        packageRevision: 7,
        sourceOrigin: "workspace",
        sourceSchemaHash: privateSourceSchemaHash,
        sourceSchemaKey: "private-labs",
      }),
    );
    expect(activeResolver.listPackages().map((appPackage) => appPackage.packageAppKey)).toEqual([
      "site",
      "tasks",
      "crm",
      "private-labs",
    ]);
  });
});

describe("app install registry", () => {
  it("lists caller-supplied installable app packages", () => {
    expect(
      listInstallableAppPackages(bundledFixtureResolver()).map((appPackage) => ({
        label: appPackage.label,
        packageAppKey: appPackage.packageAppKey,
      })),
    ).toEqual([
      { label: "Site", packageAppKey: "site" },
      { label: "Tasks", packageAppKey: "tasks" },
      { label: "CRM", packageAppKey: "crm" },
    ]);
  });

  it("parses supported app install registration policies", () => {
    expect(parseAppInstallRegistrationPolicy("closed", "App install registration policy")).toBe(
      "closed",
    );
    expect(
      parseAppInstallRegistrationPolicy("email-verified", "App install registration policy"),
    ).toBe("email-verified");
    expect(
      parseAppInstallRegistrationPolicy("custom-operation", "App install registration policy"),
    ).toBe("custom-operation");
    expect(() =>
      parseAppInstallRegistrationPolicy("domain-allowlist", "App install registration policy"),
    ).toThrow(
      'App install registration policy must be "closed", "email-verified", or "custom-operation".',
    );
  });

  it("parses canonical app install registration operation keys", () => {
    expect(parseAppInstallRegistrationOperation("member-profile.completeRegistration")).toBe(
      "member-profile.completeRegistration",
    );

    const invalidCases: [string, unknown, RegExp][] = [
      ["missing entity", ".completeRegistration", /entity/],
      ["missing operation", "member-profile.", /operation/],
      ["missing dot", "completeRegistration", /format/],
      ["too many parts", "member.profile.completeRegistration", /format/],
      ["qualified entity", "auth:principal.completeRegistration", /entity/],
      ["unsafe operation", "member-profile.complete/registration", /operation/],
      ["spaced operation", "member-profile.complete registration", /operation/],
    ];

    for (const [label, value, message] of invalidCases) {
      expect(
        () => parseAppInstallRegistrationOperation(value, "App install registration operation"),
        label,
      ).toThrow(message);
    }
  });

  it("validates route-safe install ids", () => {
    expect(validateAppInstallId(" docs-site ")).toEqual({
      ok: true,
      installId: "docs-site",
    });
    expect(validateAppInstallId("d1")).toEqual({
      ok: true,
      installId: "d1",
    });
    expect(validateAppInstallId("project-site-2026")).toEqual({
      ok: true,
      installId: "project-site-2026",
    });
    expect(validateAppInstallId("site")).toEqual({
      ok: true,
      installId: "site",
    });

    for (const value of [
      "",
      "a",
      "Docs",
      "-docs",
      "docs-",
      "docs--site",
      "docs/site",
      "api",
      "apps",
      "setup",
      "sites",
      "x".repeat(49),
    ]) {
      expect(validateAppInstallId(value).ok).toBe(false);
    }
  });

  it("creates flat installs with route metadata and source initialization", () => {
    const resolver = bundledFixtureResolver();
    const site = expectSuccess(
      createAppInstall({
        existingInstalls: [],
        installId: "personal",
        label: " Personal Site ",
        now,
        packageAppKey: "site",
        packageResolver: resolver,
      }),
    );
    const tasks = expectSuccess(
      createAppInstall({
        existingInstalls: [],
        installId: "tasks",
        label: " Tasks ",
        now,
        packageAppKey: "tasks",
        packageResolver: resolver,
      }),
    );
    const members = expectSuccess(
      createAppInstall({
        existingInstalls: [],
        installId: "members",
        label: " Members ",
        now,
        packageAppKey: "site",
        packageResolver: resolver,
        registrationPolicy: "email-verified",
      }),
    );

    expect(site.install).toEqual({
      adminRoute: "/apps/personal",
      createdAt: now,
      installId: "personal",
      label: "Personal Site",
      packageAppKey: "site",
      packageRevision: 1,
      registrationPolicy: "closed",
      sourceSchemaHash: siteSourceSchemaHash,
      status: "installed",
      updatedAt: now,
    });
    expect(site.initialization).toEqual({
      installId: "personal",
      packageAppKey: "site",
      sourceSchemaKey: "site",
    });
    expect(tasks.install).toEqual({
      adminRoute: "/apps/tasks",
      createdAt: now,
      installId: "tasks",
      label: "Tasks",
      packageAppKey: "tasks",
      packageRevision: 1,
      registrationPolicy: "closed",
      sourceSchemaHash: tasksSourceSchemaHash,
      status: "installed",
      updatedAt: now,
    });
    expect(members.install).toMatchObject({
      installId: "members",
      label: "Members",
      registrationPolicy: "email-verified",
    });
    expect(appInstallInitializationPlan(site.install, resolver)).toEqual(site.initialization);
  });

  it("creates custom-operation installs with a declared registration operation", () => {
    const result = expectSuccess(
      createAppInstall({
        existingInstalls: [],
        installId: "members",
        label: " Members ",
        now,
        packageAppKey: "site",
        packageResolver: bundledFixtureResolver(),
        registrationOperation: "member-profile.completeRegistration",
        registrationPolicy: "custom-operation",
      }),
    );

    expect(result.install).toMatchObject({
      installId: "members",
      label: "Members",
      registrationOperation: "member-profile.completeRegistration",
      registrationPolicy: "custom-operation",
    });
  });

  it("creates a private package install only through the active resolver", () => {
    const defaultResolver = bundledFixtureResolver();
    const activeResolver = createAppPackageResolver([
      ...bundledPackageManifests(),
      privatePackageManifest(),
    ]);
    const unavailable = expectFailure(
      createAppInstall({
        existingInstalls: [],
        installId: "labs",
        label: "Private Labs",
        now,
        packageAppKey: "private-labs",
        packageResolver: defaultResolver,
      }),
    );
    const result = expectSuccess(
      createAppInstall({
        existingInstalls: [],
        installId: "labs",
        label: " Private Labs ",
        now,
        packageAppKey: "private-labs",
        packageResolver: activeResolver,
        validateInitialSource: (context) => {
          expect(context.packageApp.sourceSchemaLocation).toEqual({
            kind: "workspace",
            key: "private-labs",
            path: "packages/private-labs/schema.json",
          });
          expect(context.initialization).toEqual({
            installId: "labs",
            packageAppKey: "private-labs",
            sourceSchemaKey: "private-labs",
          });

          return undefined;
        },
      }),
    );

    expect(unavailable.error.code).toBe("unsupported-package");
    expect(result.install).toEqual({
      adminRoute: "/apps/labs",
      createdAt: now,
      installId: "labs",
      label: "Private Labs",
      packageAppKey: "private-labs",
      packageRevision: 7,
      registrationPolicy: "closed",
      sourceSchemaHash: privateSourceSchemaHash,
      status: "installed",
      updatedAt: now,
    });
    expect(JSON.stringify(result.install)).not.toContain("packages/private-labs");
    expect(JSON.stringify(result.install)).not.toContain("workspace");
  });

  it("lists and finds installed apps without mutating registry state", () => {
    const docs = siteInstallFixture({
      createdAt: "2026-05-22T08:02:00.000Z",
      installId: "docs",
      label: "Docs",
    });
    const personal = siteInstallFixture({
      createdAt: "2026-05-22T08:01:00.000Z",
      installId: "personal",
      label: "Personal",
    });
    const installs = [docs, personal] as const;

    expect(listAppInstalls(installs).map((install) => install.installId)).toEqual([
      "personal",
      "docs",
    ]);
    expect(findAppInstall(installs, "docs")).toBe(docs);
    expect(findAppInstall(installs, "missing")).toBeUndefined();
  });

  it("rejects unsupported packages, invalid labels, and duplicate install ids", () => {
    const resolver = bundledFixtureResolver();
    const existing = [siteInstallFixture({ installId: "personal", label: "Personal" })] as const;

    const unsupportedPackage = expectFailure(
      createAppInstall({
        existingInstalls: existing,
        installId: "tasks",
        label: "Tasks",
        now,
        packageAppKey: "missing",
        packageResolver: resolver,
      }),
    );
    const invalidLabel = expectFailure(
      createAppInstall({
        existingInstalls: existing,
        installId: "docs",
        label: " ",
        now,
        packageAppKey: "site",
        packageResolver: resolver,
      }),
    );
    const duplicateInstallId = expectFailure(
      createAppInstall({
        existingInstalls: existing,
        installId: "personal",
        label: "Personal Tasks",
        now,
        packageAppKey: "tasks",
        packageResolver: resolver,
      }),
    );
    const unsupportedPolicy = expectFailure(
      createAppInstall({
        existingInstalls: existing,
        installId: "members",
        label: "Members",
        now,
        packageAppKey: "site",
        packageResolver: resolver,
        registrationPolicy: "domain-allowlist" as never,
      }),
    );
    const missingRegistrationOperation = expectFailure(
      createAppInstall({
        existingInstalls: existing,
        installId: "members",
        label: "Members",
        now,
        packageAppKey: "site",
        packageResolver: resolver,
        registrationPolicy: "custom-operation",
      }),
    );
    const extraRegistrationOperation = expectFailure(
      createAppInstall({
        existingInstalls: existing,
        installId: "subscribers",
        label: "Subscribers",
        now,
        packageAppKey: "site",
        packageResolver: resolver,
        registrationOperation: "member-profile.completeRegistration",
        registrationPolicy: "email-verified",
      }),
    );

    expect(unsupportedPackage.error.code).toBe("unsupported-package");
    expect(invalidLabel.error.code).toBe("invalid-label");
    expect(duplicateInstallId.error.code).toBe("duplicate-install-id");
    expect(unsupportedPolicy.error.code).toBe("invalid-registration-policy");
    expect(unsupportedPolicy.error.field).toBe("registrationPolicy");
    expect(missingRegistrationOperation.error).toEqual({
      code: "invalid-registration-operation",
      field: "registrationOperation",
      message:
        'Install registration operation is required when registration policy is "custom-operation".',
    });
    expect(extraRegistrationOperation.error).toEqual({
      code: "invalid-registration-operation",
      field: "registrationOperation",
      message:
        'Install registration operation must be omitted unless registration policy is "custom-operation".',
    });
    expect(unsupportedPackage.installs).toBe(existing);
    expect(invalidLabel.installs).toBe(existing);
    expect(duplicateInstallId.installs).toBe(existing);
    expect(unsupportedPolicy.installs).toBe(existing);
    expect(missingRegistrationOperation.installs).toBe(existing);
    expect(extraRegistrationOperation.installs).toBe(existing);
  });

  it("keeps existing installs unchanged when initial source validation fails", () => {
    const resolver = bundledFixtureResolver();
    const existing = Object.freeze([
      siteInstallFixture({
        installId: "personal",
        label: "Personal",
      }),
    ]);
    const sourceError = appInstallRegistryError(
      "source-validation-failed",
      "source",
      "Bundled Site source schema is invalid.",
    );
    const result = expectFailure(
      createAppInstall({
        existingInstalls: existing,
        installId: "docs",
        label: "Docs",
        now,
        packageAppKey: "site",
        packageResolver: resolver,
        validateInitialSource: (context) => {
          expect(context.initialization).toEqual({
            installId: "docs",
            packageAppKey: "site",
            sourceSchemaKey: "site",
          });

          return sourceError;
        },
      }),
    );

    expect(result.error).toEqual(sourceError);
    expect(result.installs).toBe(existing);
    expect(existing).toHaveLength(1);
  });
});

describe("source schema hash contracts", () => {
  it("hashes source schemas from stable canonical JSON", async () => {
    expect(sourceSchemaCanonicalJson({ b: { d: 4, c: 3 }, a: 1 })).toBe(
      '{"a":1,"b":{"c":3,"d":4}}',
    );
    expect(sourceSchemaCanonicalJson({ a: 1, b: [2, { d: 4, c: 3 }] })).toBe(
      sourceSchemaCanonicalJson({ b: [2, { c: 3, d: 4 }], a: 1 }),
    );
    expect(sourceSchemaCanonicalJson({ ä: 3, a: 2, Z: 1 })).toBe('{"Z":1,"a":2,"ä":3}');

    const declared = { registry: [{ key: "first" }, { key: "second" }] };
    const reordered = { registry: [...declared.registry].reverse() };
    expect(sourceSchemaCanonicalJson(reordered)).not.toBe(sourceSchemaCanonicalJson(declared));
    await expect(computeSourceSchemaHash(reordered)).resolves.not.toBe(
      await computeSourceSchemaHash(declared),
    );

    await expect(computeSourceSchemaHash({ b: { d: 4, c: 3 }, a: 1 })).resolves.toBe(
      "sha256:8d463b4d44d84c3a5f01c287245d254181e5d88e0f520c14c325a33422ed9331",
    );
    expect(isSourceSchemaHash(siteSourceSchemaHash)).toBe(true);
    expect(isSourceSchemaHash("sha256:BAD")).toBe(false);
    expect(isPackageAppRevision(1)).toBe(true);
    expect(isPackageAppRevision(0)).toBe(false);
  });

  it("hashes the complete App schema object", async () => {
    const baseHash = await computeSourceSchemaHash(sourceSchemaHashFixture());
    const mutationCases: Array<[string, (schema: SourceSchemaHashFixture) => void]> = [
      [
        "view",
        (schema) => {
          definition(schema.views, "taskList").label = "Open Tasks";
        },
      ],
      [
        "table view",
        (schema) => {
          definition(schema.tableViews, "taskTable").columns[0]!.label = "Task title";
        },
      ],
      [
        "item view",
        (schema) => {
          definition(schema.itemViews, "taskItem").fields.find(
            ({ field }) => field === "done",
          )!.commit = "field-commit";
        },
      ],
      [
        "screen",
        (schema) => {
          definition(schema.screens, "home").label = "Task Home";
        },
      ],
      [
        "query",
        (schema) => {
          definition(schema.queries, "taskDone").expression = {
            kind: "where",
            ref: { kind: "value", name: "done" },
            op: "eq",
            value: false,
          };
        },
      ],
      [
        "read model",
        (schema) => {
          definition(schema.readModels.computedValues, "effortScore").expression.right.value = 3;
        },
      ],
      [
        "operation",
        (schema) => {
          definition(definition(schema.entities, "task").operations, "create").audit.input = "hash";
        },
      ],
      [
        "operation label",
        (schema) => {
          definition(definition(schema.entities, "task").operations, "create").label = "Add task";
        },
      ],
      [
        "runtime metadata",
        (schema) => {
          schema.runtime.controlPlane.entities.task.observedFields = ["done", "effort"];
        },
      ],
    ];

    for (const [label, mutate] of mutationCases) {
      const changedSchema = sourceSchemaHashFixture();
      mutate(changedSchema);

      expect(await computeSourceSchemaHash(changedSchema), label).not.toBe(baseHash);
    }
  });
});
function definition<T extends { key: string }>(definitions: T[], key: string): T {
  const value = definitions.find((candidate) => candidate.key === key);
  if (!value) {
    throw new Error(`Missing definition "${key}".`);
  }
  return value;
}
function expectSuccess(result: CreateAppInstallResult): CreateAppInstallSuccess {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result;
}

function expectFailure(result: CreateAppInstallResult): CreateAppInstallFailure {
  expect(result.ok).toBe(false);

  if (result.ok) {
    throw new Error(`Expected install creation to fail for ${result.install.installId}.`);
  }

  return result;
}

function bundledFixtureResolver() {
  return createAppPackageResolver(bundledPackageManifests());
}

function bundledPackageManifests() {
  return [
    packageManifest({
      packageAppKey: "site",
      label: "Site",
      defaultInstallId: "site",
      sourceSchemaHash: siteSourceSchemaHash,
    }),
    packageManifest({
      packageAppKey: "tasks",
      label: "Tasks",
      defaultInstallId: "tasks",
      sourceSchemaHash: tasksSourceSchemaHash,
    }),
    packageManifest({
      packageAppKey: "crm",
      label: "CRM",
      defaultInstallId: "crm",
      sourceSchemaHash: crmSourceSchemaHash,
    }),
  ];
}

function siteInstallFixture(input: {
  createdAt?: string;
  installId: string;
  label: string;
}): AppInstall {
  const createdAt = input.createdAt ?? now;

  return {
    adminRoute: `/apps/${input.installId}`,
    createdAt,
    installId: input.installId,
    label: input.label,
    packageAppKey: "site",
    packageRevision: 1,
    registrationPolicy: "closed",
    sourceSchemaHash: siteSourceSchemaHash,
    status: "installed",
    updatedAt: createdAt,
  };
}

function privatePackageManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...packageManifest({
      packageAppKey: "private-labs",
      label: "Private Labs",
      defaultInstallId: "labs",
      sourceSchemaHash: privateSourceSchemaHash,
      sourceOrigin: "workspace",
      sourcePathPrefix: "packages/private-labs",
    }),
    description: "Private lab package fixture.",
    supportsMultipleInstalls: false,
    packageRevision: 7,
    ...overrides,
  };
}

function packageManifest(input: {
  defaultInstallId: string;
  label: string;
  packageAppKey: string;
  sourceOrigin?: "bundled" | "workspace";
  sourcePathPrefix?: string;
  sourceSchemaHash: SourceSchemaHash;
}): Record<string, unknown> {
  const sourceOrigin = input.sourceOrigin ?? "bundled";
  const sourcePathPrefix = input.sourcePathPrefix;
  const sourceSchemaPath =
    sourcePathPrefix === undefined ? "schema.json" : `${sourcePathPrefix}/schema.json`;
  return {
    kind: appPackageManifestKind,
    version: appPackageManifestVersion,
    packageAppKey: input.packageAppKey,
    label: input.label,
    description: `${input.label} package fixture.`,
    defaultInstallId: input.defaultInstallId,
    supportsMultipleInstalls: true,
    packageRevision: 1,
    sourceSchema: {
      kind: sourceOrigin,
      key: input.packageAppKey,
      path: sourceSchemaPath,
    },
    sourceSchemaHash: input.sourceSchemaHash,
    capabilities: [
      {
        kind: "generatedAdmin",
        routeBase: "/apps",
      },
    ],
  };
}

function sourceSchemaHashFixture() {
  return {
    version: 1,
    entities: [
      {
        id: "entity_fae962f4-40ed-457d-935b-99861c40f676",
        key: "task",
        label: "Task",
        fields: [
          { key: "title", type: "text", required: true, label: "Title" },
          { key: "done", type: "boolean", required: true, label: "Done", default: false },
          { key: "effort", type: "number", required: true, label: "Effort", default: 1 },
        ],
        operations: [
          {
            key: "create",
            label: "Create Task",
            kind: "create",
            scope: "collection",
            input: {
              fields: [
                { key: "title", field: "title", required: true },
                { key: "done", field: "done" },
                { key: "effort", field: "effort" },
              ],
            },
            effect: { type: "createRecord" },
            output: { type: "create" },
            idempotency: { required: true },
            audit: { input: "summary" },
          },
        ],
      },
    ],
    queries: [
      { key: "taskAll", label: "Tasks", entity: "task", expression: { kind: "all" } },
      {
        key: "taskDone",
        label: "Completed",
        entity: "task",
        expression: {
          kind: "where",
          ref: { kind: "value", name: "done" },
          op: "eq",
          value: true,
        },
      },
    ],
    readModels: {
      computedValues: [
        {
          key: "effortScore",
          entity: "task",
          type: "number",
          expression: {
            kind: "binary",
            op: "multiply",
            left: { kind: "field", field: "effort" },
            right: { kind: "literal", value: 2 },
          },
        },
      ],
      aggregates: [{ key: "doneTasks", query: "taskDone", function: "count" }],
    },
    itemViews: [
      {
        key: "taskItem",
        entity: "task",
        fields: [
          { field: "title", editor: "text", commit: "field-commit" },
          { field: "done", editor: "boolean", commit: "immediate" },
        ],
      },
    ],
    tableViews: [
      {
        key: "taskTable",
        entity: "task",
        columns: [{ type: "field", field: "title", label: "Title" }],
      },
    ],
    views: [
      {
        key: "taskList",
        type: "collection",
        label: "Tasks",
        entity: "task",
        queries: [{ query: "taskAll" }, { query: "taskDone", count: { type: "count" } }],
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
          sections: [{ id: "tasks", type: "collection", view: "taskList" }],
        },
      },
    ],
    runtime: {
      owner: "runtime",
      builder: { editable: false },
      controlPlane: {
        entities: {
          task: {
            immutableFields: ["title"],
            observedFields: ["done"],
          },
        },
      },
    },
  };
}
