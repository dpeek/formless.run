import { describe, expect, it } from "vite-plus/test";

import type { AppInstall } from "@dpeek/formless-installed-apps";
import { instanceControlPlaneDefaultRoutesForInstall } from "@dpeek/formless-instance-control-plane";
import type { StoredRecord } from "@dpeek/formless-storage";
import type { SchemaKey } from "../shared/schema-apps.ts";
import { bundledSourceSchemaHashFixtures } from "../shared/upgrade-migrations.ts";
import { resolveInstanceRuntimeRouteFromRecords } from "./instance-runtime-routes.ts";

describe("instance runtime route resolution", () => {
  it("resolves a generated installed-app admin route for its nested screens", () => {
    const appInstalls = [appInstall("crm", "crm")];
    const records = instanceControlPlaneDefaultRoutesForInstall({
      installId: "crm",
      packageAppKey: "crm",
      now: "2026-06-02T00:00:00.000Z",
    });

    expect(
      resolveInstanceRuntimeRouteFromRecords({
        appInstalls,
        records,
        request: { host: "formless.local", pathname: "/apps/crm/settings" },
      }),
    ).toMatchObject({
      access: "authenticated",
      id: "route:crm:admin",
      matchPath: "/apps/crm",
      matchPrefix: "/apps/crm/",
      requiredRole: "app.admin",
      target: {
        installId: "crm",
        kind: "appInstall",
        packageAppKey: "crm",
      },
    });
  });

  it("orders exact host, exact path, redirect, mount, and hostless matches deterministically", () => {
    const route = resolveInstanceRuntimeRouteFromRecords({
      appInstalls: [],
      records: [
        routeRecord("hostless-exact-mount", {
          enabled: true,
          matchPath: "/dashboard",
          kind: "mount",
          targetProfile: "instance",
          createdAt: "2026-06-02T00:00:00.000Z",
          updatedAt: "2026-06-02T00:00:00.000Z",
        }),
        routeRecord("host-prefix-redirect", {
          enabled: true,
          matchHost: "example.com",
          matchPath: "/",
          matchPrefix: "/",
          kind: "redirect",
          toHost: "prefix.example.com",
          statusCode: "308",
          preservePath: true,
          preserveQueryString: true,
          createdAt: "2026-06-02T00:00:00.000Z",
          updatedAt: "2026-06-02T00:00:00.000Z",
        }),
        routeRecord("host-exact-mount", {
          enabled: true,
          matchHost: "example.com",
          matchPath: "/dashboard",
          kind: "mount",
          targetProfile: "instance",
          createdAt: "2026-06-02T00:00:00.000Z",
          updatedAt: "2026-06-02T00:00:00.000Z",
        }),
        routeRecord("host-exact-redirect", {
          enabled: true,
          matchHost: "example.com",
          matchPath: "/dashboard",
          kind: "redirect",
          toHost: "target.example.com",
          statusCode: "307",
          preservePath: true,
          preserveQueryString: false,
          createdAt: "2026-06-02T00:00:00.000Z",
          updatedAt: "2026-06-02T00:00:00.000Z",
        }),
      ],
      request: {
        host: "example.com",
        pathname: "/dashboard",
        search: "?ref=old",
      },
    });

    expect(route).toMatchObject({
      id: "host-exact-redirect",
      kind: "redirect",
      location: "https://target.example.com/dashboard",
      status: 307,
    });
  });

  it("keeps exact-host precedence while selecting the most specific matching path", () => {
    const records = [
      routeRecord("hostless-exact", {
        enabled: true,
        matchPath: "/docs/api",
        kind: "mount",
        targetProfile: "instance",
      }),
      routeRecord("host-prefix", {
        enabled: true,
        matchHost: "docs.example.com",
        matchPath: "/",
        matchPrefix: "/docs/",
        kind: "mount",
        targetProfile: "instance",
      }),
      routeRecord("host-longer-prefix", {
        enabled: true,
        matchHost: "docs.example.com",
        matchPath: "/",
        matchPrefix: "/docs/api/",
        kind: "mount",
        targetProfile: "instance",
      }),
    ];

    expect(
      resolveInstanceRuntimeRouteFromRecords({
        appInstalls: [],
        records,
        request: { host: "docs.example.com", pathname: "/docs/api/reference" },
      }),
    ).toMatchObject({ id: "host-longer-prefix", matchPrefix: "/docs/api/" });
    expect(
      resolveInstanceRuntimeRouteFromRecords({
        appInstalls: [],
        records,
        request: { host: "docs.example.com", pathname: "/docs/api" },
      }),
    ).toMatchObject({ id: "host-prefix", matchHost: "docs.example.com" });
    expect(
      resolveInstanceRuntimeRouteFromRecords({
        appInstalls: [],
        records,
        request: { host: "other.example.com", pathname: "/docs/api" },
      }),
    ).toMatchObject({ id: "hostless-exact", matchPath: "/docs/api" });
  });

  it("builds redirect responses from schema-owned route target fields", () => {
    expect(
      resolveInstanceRuntimeRouteFromRecords({
        appInstalls: [],
        records: [
          routeRecord("to-host", {
            enabled: true,
            matchHost: "old.example.com",
            matchPath: "/",
            matchPrefix: "/",
            kind: "redirect",
            toHost: "new.example.com",
            statusCode: "308",
            preservePath: true,
            preserveQueryString: true,
            createdAt: "2026-06-02T00:00:00.000Z",
            updatedAt: "2026-06-02T00:00:00.000Z",
          }),
        ],
        request: {
          host: "old.example.com",
          pathname: "/docs/start",
          search: "?ref=old",
        },
      }),
    ).toMatchObject({
      id: "to-host",
      kind: "redirect",
      location: "https://new.example.com/docs/start?ref=old",
      status: 308,
    });

    expect(
      resolveInstanceRuntimeRouteFromRecords({
        appInstalls: [],
        records: [
          routeRecord("to-url-drop-request-parts", {
            enabled: true,
            matchHost: "old.example.com",
            matchPath: "/",
            matchPrefix: "/",
            kind: "redirect",
            toUrl: "https://new.example.com/archive?keep=target",
            statusCode: "301",
            preservePath: false,
            preserveQueryString: false,
            createdAt: "2026-06-02T00:00:00.000Z",
            updatedAt: "2026-06-02T00:00:00.000Z",
          }),
        ],
        request: {
          host: "old.example.com",
          pathname: "/docs/start",
          search: "?ref=old",
        },
      }),
    ).toMatchObject({
      id: "to-url-drop-request-parts",
      kind: "redirect",
      location: "https://new.example.com/archive?keep=target",
      status: 301,
    });

    expect(
      resolveInstanceRuntimeRouteFromRecords({
        appInstalls: [],
        records: [
          routeRecord("to-url-preserve-request-parts", {
            enabled: true,
            matchHost: "old.example.com",
            matchPath: "/",
            matchPrefix: "/",
            kind: "redirect",
            toUrl: "https://new.example.com/archive?keep=target",
            statusCode: "302",
            preservePath: true,
            preserveQueryString: true,
            createdAt: "2026-06-02T00:00:00.000Z",
            updatedAt: "2026-06-02T00:00:00.000Z",
          }),
        ],
        request: {
          host: "old.example.com",
          pathname: "/docs/start",
          search: "?ref=old",
        },
      }),
    ).toMatchObject({
      id: "to-url-preserve-request-parts",
      kind: "redirect",
      location: "https://new.example.com/archive/docs/start?ref=old",
      status: 302,
    });
  });

  it("can restrict resolution to exact-host route records", () => {
    const route = resolveInstanceRuntimeRouteFromRecords({
      appInstalls: [],
      records: [
        routeRecord("hostless-exact-mount", {
          enabled: true,
          matchPath: "/apps/personal",
          kind: "mount",
          targetProfile: "instance",
          createdAt: "2026-06-02T00:00:00.000Z",
          updatedAt: "2026-06-02T00:00:00.000Z",
        }),
      ],
      request: {
        host: "example.com",
        pathname: "/apps/personal",
      },
      options: { includeHostless: false },
    });

    expect(route).toBeUndefined();
  });

  it("keeps redirect-captured hosts from falling through to hostless routes", () => {
    const records = [
      routeRecord("redirect-capture", {
        enabled: true,
        matchHost: "old.example.com",
        matchPath: "/old",
        kind: "redirect",
        toHost: "new.example.com",
        statusCode: "308",
        preservePath: true,
        preserveQueryString: true,
        createdAt: "2026-06-02T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z",
      }),
      routeRecord("host-exact-mount", {
        enabled: true,
        matchHost: "old.example.com",
        matchPath: "/allowed",
        kind: "mount",
        targetProfile: "instance",
        createdAt: "2026-06-02T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z",
      }),
      routeRecord("hostless-mount", {
        enabled: true,
        matchPath: "/apps/site",
        kind: "mount",
        targetProfile: "instance",
        createdAt: "2026-06-02T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z",
      }),
    ];

    expect(
      resolveInstanceRuntimeRouteFromRecords({
        appInstalls: [],
        records,
        request: { host: "old.example.com", pathname: "/apps/site" },
      }),
    ).toEqual({
      kind: "not-found",
      matchHost: "old.example.com",
      reason: "captured-redirect-host",
    });

    expect(
      resolveInstanceRuntimeRouteFromRecords({
        appInstalls: [],
        records,
        request: { host: "old.example.com", pathname: "/allowed" },
      }),
    ).toMatchObject({
      id: "host-exact-mount",
      kind: "mount",
      matchHost: "old.example.com",
    });

    expect(
      resolveInstanceRuntimeRouteFromRecords({
        appInstalls: [],
        records,
        request: { host: "other.example.com", pathname: "/apps/site" },
      }),
    ).toMatchObject({
      id: "hostless-mount",
      kind: "mount",
    });
  });

  it("resolves enabled app, Program public Site, exact-host, and disabled mount routes", () => {
    const records = [
      routeRecord("route:crm:admin", {
        access: "owner",
        enabled: true,
        matchPath: "/apps/crm",
        matchPrefix: "/apps/crm/",
        kind: "mount",
        targetProfile: "app",
        appInstall: "crm",
        surface: "admin",
        createdAt: "2026-06-02T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z",
      }),
      routeRecord("route:crm:members", {
        access: "authenticated",
        enabled: true,
        matchPath: "/apps/crm/members",
        kind: "mount",
        targetProfile: "app",
        appInstall: "crm",
        requiredRole: "app.admin",
        surface: "admin",
        createdAt: "2026-06-02T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z",
      }),
      routeRecord("route:crm:settings", {
        access: "authenticated",
        enabled: true,
        matchPath: "/apps/crm/settings",
        matchPrefix: "/apps/crm/settings/",
        kind: "mount",
        targetProfile: "app",
        appInstall: "crm",
        requiredRole: "app.admin",
        surface: "admin",
        createdAt: "2026-06-02T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z",
      }),
      routeRecord("route:host:publicSite:www.example.com", {
        enabled: true,
        matchHost: "www.example.com",
        matchPath: "/",
        matchPrefix: "/",
        kind: "mount",
        targetProfile: "public-site",
        surface: "public-site",
        createdAt: "2026-06-02T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z",
      }),
      routeRecord("route:host:instance:admin.example.com", {
        access: "management",
        enabled: true,
        matchHost: "admin.example.com",
        matchPath: "/",
        matchPrefix: "/",
        kind: "mount",
        targetProfile: "instance",
        surface: "admin",
      }),
      routeRecord("route:disabled", {
        enabled: false,
        matchPath: "/disabled",
        kind: "mount",
        targetProfile: "instance",
        createdAt: "2026-06-02T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z",
      }),
    ];
    const appInstalls = [appInstall("crm", "crm")];

    expect(
      resolveInstanceRuntimeRouteFromRecords({
        appInstalls,
        records,
        request: { host: "formless.local", pathname: "/apps/crm" },
      }),
    ).toMatchObject({
      access: "owner",
      id: "route:crm:admin",
      kind: "mount",
      surface: "admin",
      target: { installId: "crm", kind: "appInstall", packageAppKey: "crm" },
      targetProfile: "app",
    });
    expect(
      resolveInstanceRuntimeRouteFromRecords({
        appInstalls,
        records,
        request: { host: "formless.local", pathname: "/apps/crm/members" },
      }),
    ).toMatchObject({
      access: "authenticated",
      id: "route:crm:members",
      kind: "mount",
      requiredRole: "app.admin",
      surface: "admin",
      target: { installId: "crm", kind: "appInstall", packageAppKey: "crm" },
      targetProfile: "app",
    });
    expect(
      resolveInstanceRuntimeRouteFromRecords({
        appInstalls,
        records,
        request: { host: "formless.local", pathname: "/apps/crm/settings/profile" },
      }),
    ).toMatchObject({
      id: "route:crm:settings",
      matchPrefix: "/apps/crm/settings/",
    });
    expect(
      resolveInstanceRuntimeRouteFromRecords({
        appInstalls,
        records,
        request: { host: "admin.example.com", pathname: "/settings" },
      }),
    ).toMatchObject({
      access: "management",
      id: "route:host:instance:admin.example.com",
      kind: "mount",
      matchHost: "admin.example.com",
      targetProfile: "instance",
    });
    expect(
      resolveInstanceRuntimeRouteFromRecords({
        appInstalls,
        records,
        request: { host: "www.example.com", pathname: "/blog" },
      }),
    ).toMatchObject({
      access: "anonymous",
      id: "route:host:publicSite:www.example.com",
      matchHost: "www.example.com",
      surface: "public-site",
      targetProfile: "public-site",
    });
    expect(
      resolveInstanceRuntimeRouteFromRecords({
        appInstalls,
        records,
        request: { host: "www.example.com", pathname: "/blog" },
      }),
    ).not.toHaveProperty("target");
    expect(
      resolveInstanceRuntimeRouteFromRecords({
        appInstalls,
        records,
        request: { host: "formless.local", pathname: "/disabled" },
      }),
    ).toBeUndefined();
  });

  it("derives default access and rejects app routes without an installed storage target", () => {
    const appInstalls = [appInstall("crm", "crm")];
    const records = [
      routeRecord("crm-default-owner", {
        enabled: true,
        matchPath: "/apps/crm",
        kind: "mount",
        targetProfile: "app",
        appInstall: "crm",
        surface: "admin",
      }),
      routeRecord("site-default-anonymous", {
        enabled: true,
        matchPath: "/pages",
        kind: "mount",
        targetProfile: "public-site",
        surface: "public-site",
      }),
      routeRecord("instance-default-management", {
        enabled: true,
        matchPath: "/settings",
        kind: "mount",
        targetProfile: "instance",
        surface: "admin",
      }),
      routeRecord("missing-install", {
        enabled: true,
        matchPath: "/apps/missing",
        kind: "mount",
        targetProfile: "app",
        appInstall: "missing",
        surface: "admin",
      }),
    ];

    expect(
      resolveInstanceRuntimeRouteFromRecords({
        appInstalls,
        records,
        request: { host: "formless.local", pathname: "/settings" },
      }),
    ).toMatchObject({
      access: "management",
      id: "instance-default-management",
      targetProfile: "instance",
    });
    expect(
      resolveInstanceRuntimeRouteFromRecords({
        appInstalls,
        records,
        request: { host: "formless.local", pathname: "/apps/crm" },
      }),
    ).toMatchObject({
      access: "owner",
      target: {
        authorityName: "app:crm",
        installId: "crm",
        kind: "appInstall",
        packageAppKey: "crm",
      },
    });
    expect(
      resolveInstanceRuntimeRouteFromRecords({
        appInstalls,
        records,
        request: { host: "formless.local", pathname: "/pages" },
      }),
    ).toMatchObject({
      access: "anonymous",
      targetProfile: "public-site",
    });
    expect(
      resolveInstanceRuntimeRouteFromRecords({
        appInstalls,
        records,
        request: { host: "formless.local", pathname: "/apps/missing" },
      }),
    ).toBeUndefined();
  });

  it("filters dormant Program-native package mounts before route ranking", () => {
    const dormantTasks = appInstall("tasks", "tasks");
    const dormantSite = appInstall("site", "site");
    const crm = appInstall("crm", "crm");
    const records = [
      routeRecord("dormant-tasks", {
        enabled: true,
        matchHost: "app.example.com",
        matchPath: "/",
        matchPrefix: "/",
        kind: "mount",
        targetProfile: "app",
        appInstall: "tasks",
        surface: "admin",
      }),
      routeRecord("dormant-site", {
        enabled: true,
        matchHost: "app.example.com",
        matchPath: "/",
        matchPrefix: "/",
        kind: "mount",
        targetProfile: "app",
        appInstall: "site",
        surface: "admin",
      }),
      routeRecord("active-crm", {
        enabled: true,
        matchHost: "app.example.com",
        matchPath: "/",
        matchPrefix: "/",
        kind: "mount",
        targetProfile: "app",
        appInstall: "crm",
        surface: "admin",
      }),
    ];

    expect(
      resolveInstanceRuntimeRouteFromRecords({
        appInstalls: [dormantTasks, dormantSite, crm],
        records,
        request: { host: "app.example.com", pathname: "/dashboard" },
      }),
    ).toMatchObject({
      id: "active-crm",
      target: {
        installId: "crm",
        packageAppKey: "crm",
      },
    });
  });
});

function routeRecord(id: string, values: StoredRecord["values"]): StoredRecord {
  return {
    createdAt: "2026-06-02T00:00:00.000Z",
    updatedAt: "2026-06-02T00:00:00.000Z",
    entity: "route",
    id,
    values,
  };
}

function appInstall(installId: string, packageAppKey: SchemaKey): AppInstall {
  return {
    adminRoute: `/apps/${installId}`,
    createdAt: "2026-06-02T00:00:00.000Z",
    installId,
    label: installId,
    packageAppKey,
    packageRevision: 1,
    ...(packageAppKey === "site"
      ? {
          publicRoute: `/sites/${installId}` as `/${string}`,
          publicRoutePrefix: `/sites/${installId}/` as `/${string}/`,
        }
      : {}),
    registrationPolicy: "closed",
    sourceSchemaHash: bundledSourceSchemaHashFixtures[packageAppKey],
    status: "installed",
    updatedAt: "2026-06-02T00:00:00.000Z",
  };
}
