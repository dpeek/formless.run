import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";

import { instanceControlPlaneSchema } from "@dpeek/formless-instance-control-plane";
import type { AppSchema } from "@dpeek/formless-schema";
import { siteSourceSchema, taskSourceSchema } from "../test/schema-apps.ts";
import { bundledSourceSchemaHashFixtures } from "../shared/upgrade-migrations.ts";
import {
  createAuthorityWriteHelpers,
  type AuthorityWriteHelpers,
} from "../test/authority-write.ts";
import { createWorkerHarness } from "./miniflare-test.ts";
import {
  FORMLESS_WORKSPACE_APP_PACKAGES_ENV_NAME,
  formatRuntimeWorkspaceAppPackages,
} from "../shared/workspace-runtime-packages.ts";
import { runtimeWorkspaceTaskAppPackageFixture } from "../test/workspace-app-package.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

let harness: Harness;
let authority: AuthorityWriteHelpers;
let privateSitePackage: Awaited<ReturnType<typeof runtimeWorkspaceTaskAppPackageFixture>>;

beforeAll(async () => {
  const taskPackage = await runtimeWorkspaceTaskAppPackageFixture();
  privateSitePackage = await runtimeWorkspaceTaskAppPackageFixture({
    capabilities: [{ kind: "generatedAdmin", routeBase: "/apps" }],
    defaultInstallId: "personal",
    label: "Private Site",
    packageAppKey: "private-site",
    sourceSchema: siteSourceSchema,
  });
  harness = await createWorkerHarness(
    "src/worker/index.ts",
    {
      FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
    },
    {
      bindings: {
        [FORMLESS_WORKSPACE_APP_PACKAGES_ENV_NAME]: formatRuntimeWorkspaceAppPackages([
          taskPackage,
          privateSitePackage,
        ]),
      },
    },
  );
  authority = createAuthorityWriteHelpers(harness);
});

beforeEach(async () => {
  authority.useSchemaApp("tasks");
  await authority.resetSchemaApp("tasks");
});

afterAll(async () => {
  await harness.dispose();
});

describe("control-plane schema runtime validation", () => {
  it("enforces immutable fields, route validation, enabled uniqueness, and operation-created history", async () => {
    await authority.postJson("/api/schema", { schema: controlPlaneRuntimeSchema() });

    const task = await authority.postCreateOperation("write-control-plane-task", {
      title: "Immutable title",
    });

    await authority.expectRecordOperationError(
      {
        idempotencyKey: "write-control-plane-task-patch-immutable",
        entity: "task",
        operationName: "update",
        recordId: task.record.id,
        input: { title: "Renamed" },
      },
      'Field "task.title" is immutable.',
    );

    await authority.expectRecordOperationError(
      {
        idempotencyKey: "write-control-plane-history-create",
        entity: "deploy-attempt",
        operationName: "create",
        input: {
          label: "Attempt",
        },
      },
      'Unknown operation "create" for entity "deploy-attempt".',
    );

    const install = await authority.postRecordOperationRequest({
      idempotencyKey: "write-control-plane-install",
      entity: "app-install",
      operationName: "create",
      input: {
        label: "Site",
      },
    });

    await authority.expectRecordOperationError(
      {
        idempotencyKey: "write-control-plane-route-missing-target",
        entity: "app-route",
        operationName: "create",
        input: routeValues("missing-install", {
          path: "/apps/missing",
        }),
      },
      'Field "appInstall" references unknown app-install record "missing-install".',
    );

    await authority.expectRecordOperationError(
      {
        idempotencyKey: "write-control-plane-route-reserved",
        entity: "app-route",
        operationName: "create",
        input: routeValues(install.record.id, {
          path: "/api/jobs",
        }),
      },
      'Field "path" must be a route-safe path.',
    );

    await authority.expectRecordOperationError(
      {
        idempotencyKey: "write-control-plane-route-capability",
        entity: "app-route",
        operationName: "create",
        input: routeValues(install.record.id, {
          packageCapability: "publicSite",
          path: "/apps/site",
          routeKind: "admin",
        }),
      },
      'Field "packageCapability" is incompatible with route kind "admin".',
    );

    await authority.postRecordOperationRequest({
      idempotencyKey: "write-control-plane-route",
      entity: "app-route",
      operationName: "create",
      input: routeValues(install.record.id, {
        path: "/apps/site",
      }),
    });

    await authority.expectRecordOperationError(
      {
        idempotencyKey: "write-control-plane-route-duplicate",
        entity: "app-route",
        operationName: "create",
        input: routeValues(install.record.id, {
          path: "/apps/site",
        }),
      },
      'Enabled route path "/apps/site" is already in use.',
    );
  });

  it("validates unified instance route records before they become active", async () => {
    await authority.postJson("/api/schema", { schema: instanceRouteRuntimeSchema() });

    const siteInstall = await createControlPlaneAppInstall("private-site", "Personal Site");
    const deploymentConfig = await authority.postRecordOperationRequest({
      idempotencyKey: "write-control-plane-deployment-config",
      entity: "deployment-config",
      operationName: "create",
      input: {
        targetId: "instance.primary",
        targetKind: "instance",
        label: "Primary Cloudflare",
        enabled: true,
        targetUrl: "https://personal.example.workers.dev",
        providerFamily: "cloudflare",
      },
    });

    const hostedMount = await authority.postRecordOperationRequest({
      idempotencyKey: "write-route-exact-host-provider-config",
      entity: "route",
      operationName: "create",
      input: mountRouteValues(siteInstall.record.id, {
        matchHost: "app.example.com",
        deploymentConfig: deploymentConfig.record.id,
      }),
    });

    expect(hostedMount.record.values).toMatchObject({
      kind: "mount",
      matchHost: "app.example.com",
      matchPath: "/apps/personal",
      deploymentConfig: deploymentConfig.record.id,
      targetProfile: "app",
    });

    const authenticatedMount = await authority.postRecordOperationRequest({
      idempotencyKey: "write-route-authenticated-access",
      entity: "route",
      operationName: "create",
      input: mountRouteValues(siteInstall.record.id, {
        access: "authenticated",
        matchPath: "/apps/personal-members",
      }),
    });

    expect(authenticatedMount.record.values).toMatchObject({
      access: "authenticated",
      kind: "mount",
      matchPath: "/apps/personal-members",
    });

    const redirect = await authority.postRecordOperationRequest({
      idempotencyKey: "write-route-redirect-to-url",
      entity: "route",
      operationName: "create",
      input: redirectRouteValues({
        matchHost: "docs.example.com",
        toHost: undefined,
        toUrl: "https://example.com/docs",
        statusCode: "301",
        preservePath: false,
        preserveQueryString: false,
      }),
    });

    expect(redirect.record.values).toMatchObject({
      kind: "redirect",
      matchHost: "docs.example.com",
      matchPath: "/",
      matchPrefix: "/",
      toUrl: "https://example.com/docs",
      statusCode: "301",
      preservePath: false,
      preserveQueryString: false,
    });

    await authority.expectRecordOperationError(
      {
        idempotencyKey: "write-route-host-normalized",
        entity: "route",
        operationName: "create",
        input: mountRouteValues(siteInstall.record.id, {
          matchHost: "WWW.Example.COM.",
        }),
      },
      'Field "matchHost" must be a normalized exact host.',
    );

    await authority.expectRecordOperationError(
      {
        idempotencyKey: "write-route-path-normalized",
        entity: "route",
        operationName: "create",
        input: mountRouteValues(siteInstall.record.id, {
          matchPath: "/api/site",
        }),
      },
      'Field "matchPath" must be a normalized absolute path.',
    );

    await authority.expectRecordOperationError(
      {
        idempotencyKey: "write-route-path-case-normalized",
        entity: "route",
        operationName: "create",
        input: mountRouteValues(siteInstall.record.id, {
          matchPath: "/Apps/personal",
        }),
      },
      'Field "matchPath" must be a normalized absolute path.',
    );

    await authority.expectRecordOperationError(
      {
        idempotencyKey: "write-route-prefix-normalized",
        entity: "route",
        operationName: "create",
        input: mountRouteValues(siteInstall.record.id, {
          appInstall: undefined,
          matchPath: "/sites/personal",
          matchPrefix: "/sites/personal",
          targetProfile: "public-site",
          surface: "public-site",
        }),
      },
      'Field "matchPrefix" must be a normalized absolute path prefix.',
    );

    await authority.expectRecordOperationError(
      {
        idempotencyKey: "write-route-prefix-below-path",
        entity: "route",
        operationName: "create",
        input: mountRouteValues(siteInstall.record.id, {
          appInstall: undefined,
          matchPath: "/sites/personal",
          matchPrefix: "/sites/",
          targetProfile: "public-site",
          surface: "public-site",
        }),
      },
      'Field "matchPrefix" must begin at or below field "matchPath".',
    );

    await authority.expectRecordOperationError(
      {
        idempotencyKey: "write-route-hostless-deployment-config",
        entity: "route",
        operationName: "create",
        input: mountRouteValues(siteInstall.record.id, {
          deploymentConfig: deploymentConfig.record.id,
        }),
      },
      'Field "deploymentConfig" can only be set on exact-host route records.',
    );

    await authority.expectRecordOperationError(
      {
        idempotencyKey: "write-route-deployment-config-reference",
        entity: "route",
        operationName: "create",
        input: mountRouteValues(siteInstall.record.id, {
          matchHost: "missing-provider.example.com",
          deploymentConfig: "missing-provider",
        }),
      },
      'Field "deploymentConfig" references unknown deployment-config record "missing-provider".',
    );

    await authority.expectRecordOperationError(
      {
        idempotencyKey: "write-route-access",
        entity: "route",
        operationName: "create",
        input: mountRouteValues(siteInstall.record.id, {
          access: "admin",
        }),
      },
      'Field "access" must be a known enum value.',
    );

    await authority.expectRecordOperationError(
      {
        idempotencyKey: "write-route-redirect-host-required",
        entity: "route",
        operationName: "create",
        input: redirectRouteValues({
          matchHost: undefined,
        }),
      },
      'Field "matchHost" is required for redirect routes.',
    );

    await authority.expectRecordOperationError(
      {
        idempotencyKey: "write-route-redirect-target",
        entity: "route",
        operationName: "create",
        input: redirectRouteValues({
          toHost: undefined,
        }),
      },
      'Redirect routes must set exactly one of field "toHost" or field "toUrl".',
    );

    await authority.expectRecordOperationError(
      {
        idempotencyKey: "write-route-redirect-app-target",
        entity: "route",
        operationName: "create",
        input: redirectRouteValues({
          appInstall: siteInstall.record.id,
        }),
      },
      'Field "appInstall" is incompatible with redirect routes.',
    );

    await authority.expectRecordOperationError(
      {
        idempotencyKey: "write-route-redirect-host-normalized",
        entity: "route",
        operationName: "create",
        input: redirectRouteValues({
          toHost: "WWW.Example.COM.",
        }),
      },
      'Field "toHost" must be a normalized exact host.',
    );

    await authority.expectRecordOperationError(
      {
        idempotencyKey: "write-route-redirect-url-normalized",
        entity: "route",
        operationName: "create",
        input: redirectRouteValues({
          toHost: undefined,
          toUrl: "http://example.com",
        }),
      },
      'Field "toUrl" must be a normalized absolute HTTPS URL without credentials or fragment.',
    );

    await authority.expectRecordOperationError(
      {
        idempotencyKey: "write-route-redirect-status-required",
        entity: "route",
        operationName: "create",
        input: redirectRouteValues({
          statusCode: undefined,
        }),
      },
      'Field "statusCode" is required for redirect routes.',
    );

    await authority.expectRecordOperationError(
      {
        idempotencyKey: "write-route-redirect-preserve-path-boolean",
        entity: "route",
        operationName: "create",
        input: redirectRouteValues({
          preservePath: "yes",
        }),
      },
      'Field "preservePath" must be a boolean.',
    );

    await authority.expectRecordOperationError(
      {
        idempotencyKey: "write-route-host-public-site-root",
        entity: "route",
        operationName: "create",
        input: mountRouteValues(siteInstall.record.id, {
          appInstall: undefined,
          matchHost: "www.example.com",
          matchPath: "/sites/personal",
          matchPrefix: "/sites/personal/",
          targetProfile: "public-site",
          surface: "public-site",
        }),
      },
      'Host-mounted public Site routes must set field "matchPath" to "/" and field "matchPrefix" to "/".',
    );

    await authority.postRecordOperationRequest({
      idempotencyKey: "write-route-host-public-site",
      entity: "route",
      operationName: "create",
      input: mountRouteValues(siteInstall.record.id, {
        appInstall: undefined,
        matchHost: "www.example.com",
        matchPath: "/",
        matchPrefix: "/",
        targetProfile: "public-site",
        surface: "public-site",
      }),
    });

    await authority.expectRecordOperationError(
      {
        idempotencyKey: "write-route-host-public-site-conflict",
        entity: "route",
        operationName: "create",
        input: mountRouteValues(siteInstall.record.id, {
          matchHost: "www.example.com",
          matchPath: "/apps/personal",
        }),
      },
      'Enabled route match "www.example.com/apps/personal" conflicts with enabled route',
    );

    await authority.postRecordOperationRequest({
      idempotencyKey: "write-route-hostless-admin",
      entity: "route",
      operationName: "create",
      input: mountRouteValues(siteInstall.record.id, {
        matchPath: "/apps/personal",
      }),
    });

    await authority.expectRecordOperationError(
      {
        idempotencyKey: "write-route-hostless-admin-conflict",
        entity: "route",
        operationName: "create",
        input: mountRouteValues(siteInstall.record.id, {
          matchPath: "/apps/personal",
        }),
      },
      'Enabled route match "<hostless>/apps/personal" conflicts with enabled route',
    );

    await authority.postRecordOperationRequest({
      idempotencyKey: "write-route-hostless-public-site",
      entity: "route",
      operationName: "create",
      input: mountRouteValues(siteInstall.record.id, {
        appInstall: undefined,
        matchPath: "/sites/personal",
        matchPrefix: "/sites/personal/",
        targetProfile: "public-site",
        surface: "public-site",
      }),
    });

    await authority.expectRecordOperationError(
      {
        idempotencyKey: "write-route-hostless-public-site-prefix-conflict",
        entity: "route",
        operationName: "create",
        input: mountRouteValues(siteInstall.record.id, {
          appInstall: undefined,
          matchPath: "/sites/personal/blog",
          targetProfile: "public-site",
          surface: "public-site",
        }),
      },
      'Enabled route match "<hostless>/sites/personal/blog" conflicts with enabled route',
    );
  });
});

async function createControlPlaneAppInstall(
  packageAppKey: "private-site" | "test-tasks",
  label: string,
) {
  const installId = packageAppKey === "private-site" ? "personal" : "tasks";

  return authority.postRecordOperationRequest({
    idempotencyKey: `write-control-plane-install-${installId}`,
    entity: "app-install",
    operationName: "create",
    input: {
      installId,
      packageAppKey,
      packageRevision:
        packageAppKey === "private-site" ? privateSitePackage.manifest.packageRevision : 7,
      sourceSchemaHash:
        packageAppKey === "private-site"
          ? privateSitePackage.manifest.sourceSchemaHash
          : bundledSourceSchemaHashFixtures.tasks,
      label,
      registrationPolicy: "closed",
      status: "installed",
      storageIdentity: `app:${installId}`,
    },
  });
}
function instanceRouteRuntimeSchema(): AppSchema {
  const controlPlaneSchema: AppSchema = instanceControlPlaneSchema;
  const sourceSchema = {
    ...taskSourceSchema,
    authorization: controlPlaneSchema.authorization,
    entities: [
      ...taskSourceSchema.entities,
      {
        ...controlPlaneSchema.entities.find((definition) => definition.key === "app-install")!,
        key: "app-install",
      },
      {
        ...controlPlaneSchema.entities.find((definition) => definition.key === "route")!,
        key: "route",
      },
      {
        ...controlPlaneSchema.entities.find(
          (definition) => definition.key === "deployment-config",
        )!,
        key: "deployment-config",
      },
    ],
    runtime: {
      owner: "runtime",
      controlPlane: {
        entities: {
          "app-install": {
            ...controlPlaneSchema.runtime!.controlPlane!.entities["app-install"]!,
          },
          route: {
            ...controlPlaneSchema.runtime!.controlPlane!.entities.route!,
          },
          "deployment-config": {
            ...controlPlaneSchema.runtime!.controlPlane!.entities["deployment-config"]!,
          },
        },
      },
    },
  } as unknown as AppSchema;

  return sourceSchema;
}

function mountRouteValues(appInstall: string, overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    matchPath: "/apps/personal",
    kind: "mount",
    targetProfile: "app",
    appInstall,
    surface: "admin",
    ...overrides,
  };
}

function redirectRouteValues(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    matchHost: "old.example.com",
    matchPath: "/",
    matchPrefix: "/",
    kind: "redirect",
    toHost: "example.com",
    statusCode: "308",
    preservePath: true,
    preserveQueryString: true,
    ...overrides,
  };
}
function writeOperations(
  label: string,
  fields: AppSchema["entities"][number]["fields"],
): NonNullable<AppSchema["entities"][number]["operations"]> {
  const input = {
    fields: fields.map(({ key }) => ({ key, field: key })),
  };
  return [
    {
      label: `Create ${label}`,
      kind: "create",
      scope: "collection",
      input,
      effect: { type: "createRecord" },
      output: { type: "create" },
      idempotency: { required: true },
      audit: { input: "summary" },
      key: "create",
    },
    {
      label: `Update ${label}`,
      kind: "update",
      scope: "record",
      input,
      effect: { type: "patchRecord" },
      output: { type: "update" },
      idempotency: { required: true },
      audit: { input: "summary" },
      key: "update",
    },
    {
      label: `Delete ${label}`,
      kind: "delete",
      scope: "record",
      effect: { type: "tombstoneRecord" },
      output: { type: "delete" },
      idempotency: { required: true },
      audit: { input: "summary" },
      key: "delete",
    },
  ];
}
function controlPlaneRuntimeSchema(): AppSchema {
  const task = taskSourceSchema.entities.find((definition) => definition.key === "task")!;
  const appInstallFields = [
    { type: "text", required: true, label: "Label", key: "label" },
  ] satisfies AppSchema["entities"][number]["fields"];
  const appRouteFields = [
    {
      type: "reference",
      required: true,
      label: "App install",
      to: "app-install",
      displayField: "label",
      key: "appInstall",
    },
    {
      type: "enum",
      required: true,
      values: [
        { key: "admin", label: "Admin" },
        { key: "publicSite", label: "Public Site" },
      ],
      key: "routeKind",
    },
    { type: "text", required: true, label: "Path", key: "path" },
    { type: "text", required: false, label: "Prefix", key: "prefix" },
    {
      type: "enum",
      required: true,
      values: [
        { key: "generatedApp", label: "Generated app" },
        { key: "publicSite", label: "Public Site" },
      ],
      key: "packageCapability",
    },
    { type: "boolean", required: true, default: true, key: "enabled" },
  ] satisfies AppSchema["entities"][number]["fields"];
  const sourceSchema = {
    ...taskSourceSchema,
    entities: [
      ...taskSourceSchema.entities.map((entity) =>
        entity.key === "task"
          ? {
              ...task,
              operations: [
                ...(task.operations ?? []),
                {
                  key: "runnerClear",
                  label: "Runner clear",
                  kind: "command" as const,
                  scope: "collection" as const,
                  target: { query: "taskCompleted" },
                  effect: {
                    type: "operationHandler" as const,
                    handler: "clear-completed",
                    config: { query: "taskCompleted" },
                  },
                  output: { type: "command" as const },
                  idempotency: { required: true },
                  audit: { input: "summary" as const },
                  policy: {
                    actors: ["runner" as const],
                    responseFields: { runner: ["done"] },
                  },
                },
              ],
              key: "task",
            }
          : entity,
      ),
      {
        id: "entity_45a76455-7e21-4d04-8165-cc68e141a4a9",
        key: "app-install",
        label: "App install",
        fields: appInstallFields,
        operations: writeOperations("App install", appInstallFields),
      },
      {
        id: "entity_8d6d40dd-08a9-4fb4-9c2a-331d2607a294",
        key: "app-route",
        label: "App route",
        fields: appRouteFields,
        operations: writeOperations("App route", appRouteFields),
      },
      {
        id: "entity_c73ed4d8-0b9a-498f-9198-88d21dcd3692",
        key: "deploy-attempt",
        label: "Deploy attempt",
        fields: [{ key: "label", type: "text", required: true, label: "Label" }],
      },
    ],
    runtime: {
      owner: "runtime",
      controlPlane: {
        entities: {
          task: {
            immutableFields: ["title"],
          },
          "app-route": {
            routeValidation: {
              pathField: "path",
              prefixField: "prefix",
              enabledField: "enabled",
              routeKindField: "routeKind",
              packageCapabilityField: "packageCapability",
              appInstallField: "appInstall",
              reservedPaths: ["/api", "/setup"],
              routeKindCapabilities: {
                admin: "generatedApp",
                publicSite: "publicSite",
              },
            },
          },
          "deploy-attempt": {
            history: { kind: "operationCreated" },
          },
        },
      },
    },
  };

  return sourceSchema as unknown as AppSchema;
}

function routeValues(
  appInstall: string,
  overrides: Partial<{
    enabled: boolean;
    packageCapability: "generatedApp" | "publicSite";
    path: string;
    prefix: string;
    routeKind: "admin" | "publicSite";
  }>,
) {
  return {
    appInstall,
    routeKind: overrides.routeKind ?? "admin",
    path: overrides.path ?? "/apps/site",
    ...(overrides.prefix === undefined ? {} : { prefix: overrides.prefix }),
    packageCapability: overrides.packageCapability ?? "generatedApp",
    enabled: overrides.enabled ?? true,
  };
}
