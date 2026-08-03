import { describe, expect, it } from "vite-plus/test";

import { createLocalWorkspaceAutoSaveClient } from "./workspace-auto-save.ts";

describe("local workspace auto-save client", () => {
  it("obtains CSRF from gateway status before enqueueing an empty-response auto-save", async () => {
    const calls: Array<{
      body?: unknown;
      headers: Headers;
      method?: string;
      url: string;
    }> = [];
    const client = createLocalWorkspaceAutoSaveClient(
      { apiBasePath: "/api/formless/workspace" },
      async (input, init) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

        calls.push({
          ...(typeof init?.body === "string" ? { body: JSON.parse(init.body) as unknown } : {}),
          headers: new Headers(init?.headers),
          method: init?.method,
          url,
        });

        return url.endsWith("/status")
          ? Response.json({ csrfToken: "csrf-token", operation: {} })
          : new Response(null, { status: 204 });
      },
    );

    await client.enqueue({ source: "schema-save" });

    expect(calls.map(({ url }) => url)).toEqual([
      "/api/formless/workspace/status",
      "/api/formless/workspace/auto-save",
    ]);
    expect(calls[0]?.method).toBeUndefined();
    expect(calls[1]?.method).toBe("POST");
    expect(calls[1]?.headers.get("x-formless-csrf")).toBe("csrf-token");
    expect(calls[1]?.body).toEqual({ source: "schema-save" });
  });
});
