import { describe, expect, it } from "vite-plus/test";

import {
  applyTurnstileWidgetLifecycle,
  CloudflareTurnstileWidget,
  type TurnstileWidgetCloudflareApi,
  type TurnstileWidgetOutput,
  type TurnstileWidgetProps,
} from "./turnstile-alchemy.ts";

describe("Cloudflare Turnstile Alchemy resource", () => {
  it("creates a widget with a stable logical id, public site key, and wrapped verification secret", async () => {
    const api = fakeTurnstileApi([
      response(
        "GET",
        "/accounts/account-123/challenges/widgets?filter=name%3AFormless%20public%20actions&per_page=1000",
        {
          result: [],
          success: true,
        },
      ),
      response("POST", "/accounts/account-123/challenges/widgets", {
        result: turnstileWidget({
          domains: ["example.com", "formless.dpeek.workers.dev"],
          secret: "raw-turnstile-secret",
          sitekey: "0xsitekey",
        }),
        success: true,
      }),
    ]);
    const wrappedSecrets: string[] = [];

    const output = await applyTurnstileWidgetLifecycle({
      api,
      context: fakeContext("create"),
      createSecret: (value) => {
        wrappedSecrets.push(value);

        return fakeSecret("turnstile-secret");
      },
      logicalId: "turnstile",
      props: widgetProps(),
    });

    expect(output).toMatchObject({
      domains: ["example.com", "formless.dpeek.workers.dev"],
      id: "0xsitekey",
      mode: "managed",
      name: "Formless public actions",
      siteKey: "0xsitekey",
      verificationSecret: { name: "turnstile-secret", type: "secret" },
    });
    expect(wrappedSecrets).toEqual(["raw-turnstile-secret"]);
    expect(JSON.stringify(output)).not.toContain("raw-turnstile-secret");
    expect(api.calls).toEqual([
      {
        method: "GET",
        path: "/accounts/account-123/challenges/widgets?filter=name%3AFormless%20public%20actions&per_page=1000",
      },
      {
        body: {
          domains: ["example.com", "formless.dpeek.workers.dev"],
          mode: "managed",
          name: "Formless public actions",
        },
        method: "POST",
        path: "/accounts/account-123/challenges/widgets",
      },
    ]);
    expect(
      (
        CloudflareTurnstileWidget as unknown as {
          type: string;
        }
      ).type,
    ).toBe("formless::CloudflareTurnstileWidget");
  });
  it("reads the existing widget during update and skips the update call when provider state matches", async () => {
    const api = fakeTurnstileApi([
      response("GET", "/accounts/account-123/challenges/widgets/0xsitekey", {
        result: turnstileWidget({
          domains: ["example.com", "formless.dpeek.workers.dev"],
          secret: "fresh-secret-from-read",
          sitekey: "0xsitekey",
        }),
        success: true,
      }),
    ]);

    const output = await applyTurnstileWidgetLifecycle({
      api,
      context: fakeContext("update", {
        ...existingOutput(),
        verificationSecret: fakeSecret("old-secret"),
      }),
      createSecret: (value) => fakeSecret(value),
      logicalId: "turnstile",
      props: widgetProps(),
    });

    expect(output.verificationSecret).toEqual({
      name: "fresh-secret-from-read",
      type: "secret",
    });
    expect(api.calls).toEqual([
      {
        method: "GET",
        path: "/accounts/account-123/challenges/widgets/0xsitekey",
      },
    ]);
  });

  it("updates the provider widget when desired inputs change", async () => {
    const api = fakeTurnstileApi([
      response("GET", "/accounts/account-123/challenges/widgets/0xsitekey", {
        result: turnstileWidget({
          domains: ["old.example.com"],
          mode: "invisible",
          secret: "old-secret",
          sitekey: "0xsitekey",
        }),
        success: true,
      }),
      response("PUT", "/accounts/account-123/challenges/widgets/0xsitekey", {
        result: turnstileWidget({
          domains: ["example.com", "formless.dpeek.workers.dev"],
          secret: "updated-secret",
          sitekey: "0xsitekey",
        }),
        success: true,
      }),
    ]);

    const output = await applyTurnstileWidgetLifecycle({
      api,
      context: fakeContext("update", existingOutput()),
      createSecret: (value) => fakeSecret(value),
      logicalId: "turnstile",
      props: widgetProps(),
    });

    expect(output.verificationSecret).toEqual({ name: "updated-secret", type: "secret" });
    expect(api.calls).toEqual([
      {
        method: "GET",
        path: "/accounts/account-123/challenges/widgets/0xsitekey",
      },
      {
        body: {
          domains: ["example.com", "formless.dpeek.workers.dev"],
          mode: "managed",
          name: "Formless public actions",
        },
        method: "PUT",
        path: "/accounts/account-123/challenges/widgets/0xsitekey",
      },
    ]);
  });

  it("adopts an existing widget by deterministic name and reconciles it in place", async () => {
    const api = fakeTurnstileApi([
      response(
        "GET",
        "/accounts/account-123/challenges/widgets?filter=name%3AFormless%20public%20actions&per_page=1000",
        {
          result: [
            turnstileWidget({
              domains: ["old.example.com"],
              mode: "invisible",
              secret: undefined,
              sitekey: "0xadopted",
            }),
          ],
          success: true,
        },
      ),
      response("GET", "/accounts/account-123/challenges/widgets/0xadopted", {
        result: turnstileWidget({
          domains: ["old.example.com"],
          mode: "invisible",
          secret: "existing-secret",
          sitekey: "0xadopted",
        }),
        success: true,
      }),
      response("PUT", "/accounts/account-123/challenges/widgets/0xadopted", {
        result: turnstileWidget({
          domains: ["example.com", "formless.dpeek.workers.dev"],
          secret: "adopted-secret",
          sitekey: "0xadopted",
        }),
        success: true,
      }),
    ]);

    const output = await applyTurnstileWidgetLifecycle({
      api,
      context: fakeContext("create"),
      createSecret: (value) => fakeSecret(value),
      logicalId: "turnstile",
      props: {
        ...widgetProps(),
        adopt: true,
      },
    });

    expect(output.siteKey).toBe("0xadopted");
    expect(output.verificationSecret).toEqual({ name: "adopted-secret", type: "secret" });
    expect(api.calls.map((call) => [call.method, call.path])).toEqual([
      [
        "GET",
        "/accounts/account-123/challenges/widgets?filter=name%3AFormless%20public%20actions&per_page=1000",
      ],
      ["GET", "/accounts/account-123/challenges/widgets/0xadopted"],
      ["PUT", "/accounts/account-123/challenges/widgets/0xadopted"],
    ]);
  });

  it("explains Cloudflare Turnstile credential failures", async () => {
    const api = fakeTurnstileApi([
      response(
        "GET",
        "/accounts/account-123/challenges/widgets?filter=name%3AFormless%20public%20actions&per_page=1000",
        {
          errors: [{ code: 10000, message: "Authentication error" }],
          success: false,
        },
        403,
      ),
    ]);

    await expect(
      applyTurnstileWidgetLifecycle({
        api,
        context: fakeContext("create"),
        createSecret: (value) => fakeSecret(value),
        logicalId: "turnstile",
        props: widgetProps(),
      }),
    ).rejects.toThrow(
      'Cloudflare Turnstile widget list for "Formless public actions" failed: HTTP 403. Cloudflare credential requires Turnstile widget read/write access for this account; set CLOUDFLARE_API_TOKEN to an account token with Turnstile access, then retry deployment.',
    );
  });

  it("deletes the provider widget by site key and treats missing widgets as already deleted", async () => {
    const deleted = fakeTurnstileApi([
      response("DELETE", "/accounts/account-123/challenges/widgets/0xsitekey", {
        result: turnstileWidget({ sitekey: "0xsitekey" }),
        success: true,
      }),
    ]);
    const missing = fakeTurnstileApi([
      response("DELETE", "/accounts/account-123/challenges/widgets/0xsitekey", {}, 404),
    ]);

    await applyTurnstileWidgetLifecycle({
      api: deleted,
      context: fakeContext("delete", existingOutput()),
      createSecret: (value) => fakeSecret(value),
      logicalId: "turnstile",
      props: widgetProps(),
    });
    await applyTurnstileWidgetLifecycle({
      api: missing,
      context: fakeContext("delete", existingOutput()),
      createSecret: (value) => fakeSecret(value),
      logicalId: "turnstile",
      props: widgetProps(),
    });

    expect(deleted.calls).toEqual([
      {
        method: "DELETE",
        path: "/accounts/account-123/challenges/widgets/0xsitekey",
      },
    ]);
    expect(missing.calls).toEqual([
      {
        method: "DELETE",
        path: "/accounts/account-123/challenges/widgets/0xsitekey",
      },
    ]);
  });
});

function widgetProps(): TurnstileWidgetProps {
  return {
    accountId: "account-123",
    domains: ["Formless.dpeek.workers.dev", "example.com", "example.com"],
    name: "Formless public actions",
  };
}

type FakeSecret = {
  name: string;
  type: "secret";
};

function existingOutput(): TurnstileWidgetOutput<FakeSecret> {
  return {
    botFightMode: false,
    domains: ["example.com", "formless.dpeek.workers.dev"],
    ephemeralId: false,
    id: "0xsitekey",
    mode: "managed",
    name: "Formless public actions",
    offlabel: false,
    siteKey: "0xsitekey",
    verificationSecret: fakeSecret("existing-secret"),
  };
}

function fakeSecret(name: string): FakeSecret {
  return { name, type: "secret" };
}

function turnstileWidget(
  overrides: Partial<{
    bot_fight_mode: boolean;
    clearance_level: string;
    created_on: string;
    domains: string[];
    ephemeral_id: boolean;
    mode: string;
    modified_on: string;
    name: string;
    offlabel: boolean;
    region: string;
    secret: string | undefined;
    sitekey: string;
  }> = {},
): Record<string, unknown> {
  return {
    bot_fight_mode: false,
    clearance_level: "no_clearance",
    created_on: "2026-06-09T00:00:00.000Z",
    domains: ["example.com"],
    ephemeral_id: false,
    mode: "managed",
    modified_on: "2026-06-09T00:00:00.000Z",
    name: "Formless public actions",
    offlabel: false,
    region: "world",
    secret: "raw-secret",
    sitekey: "0xsitekey",
    ...overrides,
  };
}

function fakeContext<SecretValue>(
  phase: "create" | "delete" | "update",
  output?: TurnstileWidgetOutput<SecretValue>,
) {
  return Object.assign((next: TurnstileWidgetOutput<SecretValue>) => next, {
    destroy: () => undefined as never,
    output,
    phase,
    scope: {},
  });
}

function fakeTurnstileApi(
  responses: Array<{
    body: unknown;
    method: string;
    path: string;
    status: number;
  }>,
): TurnstileWidgetCloudflareApi & {
  calls: Array<{
    body?: unknown;
    method: string;
    path: string;
  }>;
} {
  const calls: Array<{
    body?: unknown;
    method: string;
    path: string;
  }> = [];
  const nextResponse = (method: string, path: string, body?: unknown): Response => {
    calls.push(body === undefined ? { method, path } : { body, method, path });
    const next = responses.shift();

    if (next === undefined) {
      throw new Error(`Unexpected Cloudflare API call ${method} ${path}.`);
    }

    expect({ method, path }).toEqual({ method: next.method, path: next.path });

    return Response.json(next.body, { status: next.status });
  };

  return {
    accountId: "account-123",
    calls,
    delete: async (path) => nextResponse("DELETE", path),
    get: async (path) => nextResponse("GET", path),
    post: async (path, body) => nextResponse("POST", path, body),
    put: async (path, body) => nextResponse("PUT", path, body),
  };
}

function response(
  method: string,
  path: string,
  body: unknown,
  status = 200,
): {
  body: unknown;
  method: string;
  path: string;
  status: number;
} {
  return { body, method, path, status };
}
