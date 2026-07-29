import { describe, expect, it } from "vite-plus/test";
import rawCrmAppPackageManifest from "@dpeek/formless-crm-app/formless.app.json";
import rawCrmSourceSchema from "@dpeek/formless-crm-app/schema.json";
import rawSiteAppPackageManifest from "@dpeek/formless-site-app/formless.app.json";
import rawSiteSourceSchema from "@dpeek/formless-site-app/schema.json";
import rawTasksAppPackageManifest from "@dpeek/formless-tasks-app/formless.app.json";
import rawTasksSourceSchema from "@dpeek/formless-tasks-app/schema.json";
import {
  appPackageManifestKind,
  appPackageManifestVersion,
  bundledAppPackageManifests,
  createAppPackageResolver,
  findResolvedAppPackage,
  listResolvedAppPackages,
  parseAppPackageManifest,
} from "./app-packages.ts";
import { bundledSourceSchemaHashFixtures, computeSourceSchemaHash } from "./upgrade-migrations.ts";

const privateSourceSchemaHash =
  "sha256:1111111111111111111111111111111111111111111111111111111111111111";

describe("app package manifests", () => {
  it("parses the bundled Site package manifest from package source", () => {
    expect(parseAppPackageManifest(rawSiteAppPackageManifest)).toEqual({
      kind: appPackageManifestKind,
      version: appPackageManifestVersion,
      packageAppKey: "site",
      label: "Site",
      description: "Public website app backed by the bundled Site schema.",
      defaultInstallId: "site",
      supportsMultipleInstalls: true,
      packageRevision: 1,
      sourceSchema: {
        kind: "bundled",
        key: "site",
        path: "schema.json",
      },
      sourceSchemaHash: bundledSourceSchemaHashFixtures.site,
      capabilities: [
        {
          kind: "generatedAdmin",
          routeBase: "/apps",
        },
        {
          kind: "publicSite",
          routeBase: "/sites",
        },
      ],
    });
  });

  it("parses the bundled CRM package manifest from package source", () => {
    expect(parseAppPackageManifest(rawCrmAppPackageManifest)).toEqual({
      kind: appPackageManifestKind,
      version: appPackageManifestVersion,
      packageAppKey: "crm",
      label: "CRM",
      description: "CRM app backed by the bundled CRM schema.",
      defaultInstallId: "crm",
      supportsMultipleInstalls: true,
      packageRevision: 1,
      sourceSchema: {
        kind: "bundled",
        key: "crm",
        path: "schema.json",
      },
      sourceSchemaHash: bundledSourceSchemaHashFixtures.crm,
      capabilities: [
        {
          kind: "generatedAdmin",
          routeBase: "/apps",
        },
      ],
    });
  });

  it("parses the bundled Tasks package manifest from package source", () => {
    expect(parseAppPackageManifest(rawTasksAppPackageManifest)).toEqual({
      kind: appPackageManifestKind,
      version: appPackageManifestVersion,
      packageAppKey: "tasks",
      label: "Tasks",
      description: "Task tracking app backed by the bundled Tasks schema.",
      defaultInstallId: "tasks",
      supportsMultipleInstalls: true,
      packageRevision: 1,
      sourceSchema: {
        kind: "bundled",
        key: "tasks",
        path: "schema.json",
      },
      sourceSchemaHash: bundledSourceSchemaHashFixtures.tasks,
      capabilities: [
        {
          kind: "generatedAdmin",
          routeBase: "/apps",
        },
      ],
    });
  });

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
        {
          kind: "publicSite",
          routeBase: "/sites",
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

  it("resolves bundled packages from manifest facts without changing existing metadata", () => {
    expect(bundledAppPackageManifests.map((manifest) => manifest.packageAppKey)).toEqual([
      "site",
      "tasks",
      "crm",
    ]);

    expect(listResolvedAppPackages()).toEqual([
      expect.objectContaining({
        adminRouteBase: "/apps",
        defaultInstallId: "site",
        label: "Site",
        packageAppKey: "site",
        packageRevision: 1,
        publicRouteBase: "/sites",
        sourceOrigin: "bundled",
        sourceSchemaKey: "site",
        sourceSchemaHash: bundledSourceSchemaHashFixtures.site,
      }),
      expect.objectContaining({
        adminRouteBase: "/apps",
        defaultInstallId: "tasks",
        label: "Tasks",
        packageAppKey: "tasks",
        packageRevision: 1,
        sourceOrigin: "bundled",
        sourceSchemaKey: "tasks",
        sourceSchemaHash: bundledSourceSchemaHashFixtures.tasks,
      }),
      expect.objectContaining({
        adminRouteBase: "/apps",
        defaultInstallId: "crm",
        label: "CRM",
        packageAppKey: "crm",
        packageRevision: 1,
        sourceOrigin: "bundled",
        sourceSchemaKey: "crm",
        sourceSchemaHash: bundledSourceSchemaHashFixtures.crm,
      }),
    ]);
    expect(findResolvedAppPackage("site")?.sourceSchemaLocation).toEqual({
      kind: "bundled",
      key: "site",
      path: "schema.json",
    });
    expect(findResolvedAppPackage("tasks")).toEqual(
      expect.objectContaining({
        adminRouteBase: "/apps",
        defaultInstallId: "tasks",
        label: "Tasks",
        packageAppKey: "tasks",
        packageRevision: 1,
        sourceOrigin: "bundled",
        sourceSchemaKey: "tasks",
        sourceSchemaHash: bundledSourceSchemaHashFixtures.tasks,
      }),
    );
    expect(findResolvedAppPackage("tasks")?.publicRouteBase).toBeUndefined();
    expect(findResolvedAppPackage("tasks")?.sourceSchemaLocation).toEqual({
      kind: "bundled",
      key: "tasks",
      path: "schema.json",
    });
    expect(findResolvedAppPackage("crm")?.sourceSchemaLocation).toEqual({
      kind: "bundled",
      key: "crm",
      path: "schema.json",
    });
  });

  it("keeps private package fixtures scoped to the active resolver", () => {
    const resolver = createAppPackageResolver([
      ...bundledAppPackageManifests,
      privatePackageManifest(),
    ]);

    expect(findResolvedAppPackage("private-labs")).toBeUndefined();
    expect(resolver.findPackage("private-labs")).toEqual(
      expect.objectContaining({
        defaultInstallId: "labs",
        label: "Private Labs",
        packageAppKey: "private-labs",
        packageRevision: 7,
        publicRouteBase: "/sites",
        sourceOrigin: "workspace",
        sourceSchemaHash: privateSourceSchemaHash,
        sourceSchemaKey: "private-labs",
      }),
    );
    expect(resolver.listPackages().map((appPackage) => appPackage.packageAppKey)).toEqual([
      "site",
      "tasks",
      "crm",
      "private-labs",
    ]);
  });

  it("checks bundled package hashes against complete source schemas", async () => {
    const packageSchemas: Record<string, unknown> = {
      site: rawSiteSourceSchema,
      tasks: rawTasksSourceSchema,
      crm: rawCrmSourceSchema,
    };
    const expectedHashes: Record<string, string> = bundledSourceSchemaHashFixtures;

    for (const manifest of bundledAppPackageManifests) {
      const sourceSchema = packageSchemas[manifest.packageAppKey];

      expect(sourceSchema, manifest.packageAppKey).toBeDefined();
      const sourceSchemaHash = await computeSourceSchemaHash(sourceSchema);

      expect(sourceSchemaHash, manifest.packageAppKey).toBe(manifest.sourceSchemaHash);
      expect(sourceSchemaHash, manifest.packageAppKey).toBe(expectedHashes[manifest.packageAppKey]);
    }
  });
});

function privatePackageManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
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
      {
        kind: "publicSite",
        routeBase: "/sites",
      },
    ],
    ...overrides,
  };
}
