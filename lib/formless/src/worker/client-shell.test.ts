import { describe, expect, it } from "vite-plus/test";
import type { AppSchema } from "@dpeek/formless-schema";

import { formlessProgramSchema } from "../program/runtime.ts";
import { resolveWorkerRuntimeRequestTopology } from "./routing.ts";
import { handleClientAssetRequest } from "./client-shell.ts";

describe("client shell asset handling", () => {
  it("serves instance profile shell routes from the index document", async () => {
    const assetRequests: string[] = [];
    const request = new Request("https://example.com/settings/access", {
      headers: { Accept: "text/html" },
    });
    const response = await handleClientAssetRequest(request, assetEnv(assetRequests), {
      runtimeTopology: resolveWorkerRuntimeRequestTopology(request, { profile: "instance" }),
    });

    expect(response?.status).toBe(200);
    expect(response?.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(response?.headers.get("Cache-Control")).toBe("no-store");
    expect(await response?.text()).toContain('<div id="app"></div>');
    expect(assetRequests).toEqual(["/index.html"]);
  });

  it("does not seed access loading for the unclaimed top-level path", async () => {
    const assetRequests: string[] = [];
    const request = new Request("https://example.com/access", {
      headers: { Accept: "text/html" },
    });
    const response = await handleClientAssetRequest(request, assetEnv(assetRequests), {
      runtimeTopology: resolveWorkerRuntimeRequestTopology(request, { profile: "instance" }),
    });

    expect(await response?.text()).toBe("asset:/access");
    expect(assetRequests).toEqual(["/access"]);
  });

  it("preserves asset path requests", async () => {
    const assetRequests: string[] = [];
    const request = new Request("https://example.com/assets/index.js", {
      headers: { Accept: "*/*" },
    });
    const response = await handleClientAssetRequest(request, assetEnv(assetRequests), {
      runtimeTopology: resolveWorkerRuntimeRequestTopology(request, { profile: "instance" }),
    });

    expect(response?.status).toBe(200);
    expect(await response?.text()).toBe("asset:/assets/index.js");
    expect(assetRequests).toEqual(["/assets/index.js"]);
  });

  it("serves a relocated access screen from the index document by screen key", async () => {
    const assetRequests: string[] = [];
    const request = new Request("https://example.com/people/access", {
      headers: { Accept: "text/html" },
    });
    const response = await handleClientAssetRequest(request, assetEnv(assetRequests), {
      runtimeTopology: resolveWorkerRuntimeRequestTopology(request, {
        profile: "instance",
        programSchema: relocatedAccessScreenSchema(),
      }),
    });

    expect(await response?.text()).toContain('<div id="app"></div>');
    expect(assetRequests).toEqual(["/index.html"]);
  });
});

function relocatedAccessScreenSchema(): AppSchema {
  return {
    ...formlessProgramSchema,
    screens: formlessProgramSchema.screens.map((screen) =>
      screen.key === "access" ? { ...screen, path: "/people/access" } : screen,
    ),
  };
}

function assetEnv(assetRequests: string[]): Parameters<typeof handleClientAssetRequest>[1] {
  return {
    ASSETS: {
      async fetch(input: RequestInfo | URL, init?: RequestInit) {
        const request = input instanceof Request ? input : new Request(input, init);
        const pathname = new URL(request.url).pathname;
        assetRequests.push(pathname);

        return new Response(
          pathname === "/index.html" ? '<!doctype html><div id="app"></div>' : `asset:${pathname}`,
          {
            headers: {
              "Content-Type": pathname === "/index.html" ? "text/html" : "text/plain",
            },
          },
        );
      },
    } as Fetcher,
  };
}
