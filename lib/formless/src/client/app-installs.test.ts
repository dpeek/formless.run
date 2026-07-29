import { describe, expect, it } from "vite-plus/test";
import {
  AppInstallApiError,
  activeAppPackageResolverFromAppInstallsResponse,
  createInstanceAppInstall,
  fetchInstanceAppInstalls,
  INSTANCE_APP_INSTALLS_API_PATH,
} from "./app-installs.ts";
import type { LocalWorkspaceAutoSaveClient } from "./workspace-auto-save.ts";
import {
  listInstallableAppPackages,
  type InstallableAppPackage,
} from "@dpeek/formless-installed-apps";
import { INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY } from "@dpeek/formless-instance-control-plane";
import { bundledAppPackageResolver } from "../shared/app-packages.ts";
import { bundledSourceSchemaHashFixtures } from "../shared/upgrade-migrations.ts";

describe("client app install API helpers", () => {
  it("fetches installed app registry state", async () => {
    const response = await fetchInstanceAppInstalls({
      fetcher: jsonFetcher(INSTANCE_APP_INSTALLS_API_PATH, {
        packages: [],
        installs: [],
      }),
    });

    expect(response).toEqual({ packages: [], installs: [] });
  });

  it("builds an active package resolver from bundled registry packages", () => {
    const packages = listInstallableAppPackages(bundledAppPackageResolver);
    const resolver = activeAppPackageResolverFromAppInstallsResponse({ packages });
    const sitePackage = resolver.findPackage("site");

    expect(resolver.listPackages().map((appPackage) => appPackage.packageAppKey)).toEqual([
      "site",
      "tasks",
      "crm",
    ]);
    expect(sitePackage).toMatchObject({
      packageAppKey: "site",
      sourceOrigin: "bundled",
      sourceSchemaKey: "site",
    });
    expect(resolver.findPackage("missing")).toBeUndefined();

    if (!sitePackage) {
      throw new Error("Missing active Site package.");
    }

    sitePackage.sourceSchemaLocation.path = "mutated/schema.json";
    expect(resolver.findPackage("site")?.sourceSchemaLocation.path).not.toBe("mutated/schema.json");
  });

  it("builds an active package resolver from workspace registry packages", () => {
    const privateSite = privateSitePackage();
    const resolver = activeAppPackageResolverFromAppInstallsResponse({
      packages: [privateSite],
    });

    expect(resolver.listPackages()).toEqual([privateSite]);
    expect(resolver.findPackage("private-site")).toMatchObject({
      packageAppKey: "private-site",
      sourceOrigin: "workspace",
      sourceSchemaKey: "private-site",
    });
    expect(resolver.findPackage("site")).toBeUndefined();
  });

  it("creates an app install and surfaces API errors", async () => {
    const autoSave = captureAutoSave();
    const created = await createInstanceAppInstall(
      {
        packageAppKey: "site",
        installId: "personal",
        label: "Personal Site",
      },
      {
        fetcher: jsonFetcher(
          INSTANCE_APP_INSTALLS_API_PATH,
          {
            initialization: {
              installId: "personal",
              packageAppKey: "site",
              sourceSchemaKey: "site",
            },
            install: { installId: "personal" },
            installs: [{ installId: "personal" }],
          },
          { expectedMethod: "POST", status: 201 },
        ),
        autoSave,
      },
    );

    expect(created.install).toEqual({ installId: "personal" });
    expect(autoSave.inputs).toEqual([
      { source: "app-install", storageIdentity: INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY },
    ]);

    await expect(
      createInstanceAppInstall(
        {
          packageAppKey: "site",
          installId: "personal",
          label: "Other Site",
        },
        {
          fetcher: jsonFetcher(
            INSTANCE_APP_INSTALLS_API_PATH,
            {
              code: "duplicate-install-id",
              error: 'Install id "personal" is already installed.',
              field: "installId",
            },
            { expectedMethod: "POST", status: 409 },
          ),
          autoSave,
        },
      ),
    ).rejects.toMatchObject({
      body: {
        code: "duplicate-install-id",
        error: 'Install id "personal" is already installed.',
        field: "installId",
      },
      message: 'Install id "personal" is already installed.',
      name: "AppInstallApiError",
      status: 409,
    } satisfies Partial<AppInstallApiError>);
    expect(autoSave.inputs).toEqual([
      { source: "app-install", storageIdentity: INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY },
    ]);
  });

  it("uses same-origin browser credentials without admin bearer headers", async () => {
    const calls: Array<{
      authorization: string | null;
      credentials: RequestCredentials | undefined;
      input: string;
      method: string;
    }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      calls.push({
        authorization: new Headers(init?.headers).get("Authorization"),
        credentials: init?.credentials,
        input: requestUrl(input),
        method: init?.method ?? "GET",
      });

      if (init?.method === "POST") {
        return Response.json(
          {
            initialization: {
              installId: "site",
              packageAppKey: "site",
              sourceSchemaKey: "site",
            },
            install: { installId: "site" },
            installs: [{ installId: "site" }],
          },
          { status: 201 },
        );
      }

      return Response.json({ packages: [], installs: [] });
    };

    await fetchInstanceAppInstalls({ fetcher });
    await createInstanceAppInstall(
      {
        packageAppKey: "site",
        installId: "site",
        label: "Site",
      },
      { fetcher },
    );

    expect(calls).toEqual([
      {
        authorization: null,
        credentials: "same-origin",
        input: INSTANCE_APP_INSTALLS_API_PATH,
        method: "GET",
      },
      {
        authorization: null,
        credentials: "same-origin",
        input: INSTANCE_APP_INSTALLS_API_PATH,
        method: "POST",
      },
    ]);
  });
});
type AutoSaveInput = Parameters<LocalWorkspaceAutoSaveClient["enqueue"]>[0];
function captureAutoSave(): LocalWorkspaceAutoSaveClient & {
  inputs: AutoSaveInput[];
} {
  const inputs: AutoSaveInput[] = [];
  return {
    inputs,
    enqueue: async (input) => {
      inputs.push(input);
    },
  };
}

function jsonFetcher(
  expectedPath: string,
  body: unknown,
  options: {
    expectedMethod?: string;
    status?: number;
  } = {},
): typeof fetch {
  return async (input, init) => {
    expect(requestUrl(input)).toBe(expectedPath);
    expect(init?.method ?? "GET").toBe(options.expectedMethod ?? "GET");

    return Response.json(body, { status: options.status ?? 200 });
  };
}

function privateSitePackage(): InstallableAppPackage {
  return {
    adminRouteBase: "/apps",
    defaultInstallId: "private-site",
    description: "Workspace-linked public Site package.",
    label: "Private Site",
    packageAppKey: "private-site",
    packageRevision: 7,
    publicRouteBase: "/sites",
    sourceOrigin: "workspace",
    sourceSchemaHash: bundledSourceSchemaHashFixtures.site,
    sourceSchemaKey: "private-site",
    sourceSchemaLocation: {
      kind: "workspace",
      key: "private-site",
      path: "source/schema.json",
    },
    supportsMultipleInstalls: false,
  };
}

function requestUrl(input: Parameters<typeof fetch>[0]) {
  if (typeof input === "string") {
    return input;
  }

  return input instanceof URL ? input.href : input.url;
}
