import { describe, expect, it } from "vite-plus/test";

import type { StoredRecord } from "@dpeek/formless-storage";
import { resolveInstanceRuntimeRouteFromRecords } from "./instance-runtime-routes.ts";

describe("instance runtime route resolution", () => {
  it("orders exact host, exact path, redirect, mount, and hostless matches deterministically", () => {
    const route = resolveInstanceRuntimeRouteFromRecords({
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
        records,
        request: { host: "docs.example.com", pathname: "/docs/api/reference" },
      }),
    ).toMatchObject({ id: "host-longer-prefix", matchPrefix: "/docs/api/" });
    expect(
      resolveInstanceRuntimeRouteFromRecords({
        records,
        request: { host: "docs.example.com", pathname: "/docs/api" },
      }),
    ).toMatchObject({ id: "host-prefix", matchHost: "docs.example.com" });
    expect(
      resolveInstanceRuntimeRouteFromRecords({
        records,
        request: { host: "other.example.com", pathname: "/docs/api" },
      }),
    ).toMatchObject({ id: "hostless-exact", matchPath: "/docs/api" });
  });

  it("builds redirect responses from schema-owned route target fields", () => {
    expect(
      resolveInstanceRuntimeRouteFromRecords({
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
        records,
        request: { host: "other.example.com", pathname: "/apps/site" },
      }),
    ).toMatchObject({
      id: "hostless-mount",
      kind: "mount",
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
