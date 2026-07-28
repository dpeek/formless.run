import { describe, expect, it } from "vite-plus/test";

import { PublicOperationError } from "./public-operation-executor.ts";
import {
  type PublicOperationTurnstileSiteverifyProvider,
  verifyPublicOperationTurnstileChallenge,
} from "./public-operation-turnstile-challenge.ts";

const turnstileSecret = "test-turnstile-secret";
const turnstileToken = "test-turnstile-token";

describe("public operation Turnstile challenge", () => {
  it("rejects a missing secret without calling Siteverify", async () => {
    const harness = siteverifyHarness(() => Response.json({ success: true }));

    await expectPublicOperationError(
      verifyChallenge(harness.provider, { secret: undefined }),
      "Public operation challenge is unavailable.",
      503,
    );
    expect(harness.requests).toEqual([]);
  });

  it("rejects a blank secret without calling Siteverify", async () => {
    const harness = siteverifyHarness(() => Response.json({ success: true }));

    await expectPublicOperationError(
      verifyChallenge(harness.provider, { secret: "  " }),
      "Public operation challenge is unavailable.",
      503,
    );
    expect(harness.requests).toEqual([]);
  });

  it("maps provider transport failure to a public-safe unavailable error", async () => {
    const harness = siteverifyHarness(() => {
      throw new Error("private provider failure");
    });

    await expectPublicOperationError(
      verifyChallenge(harness.provider),
      "Public operation challenge is unavailable.",
      503,
    );
    expect(harness.requests).toHaveLength(1);
  });

  it("maps malformed Siteverify JSON to a public-safe unavailable error", async () => {
    const harness = siteverifyHarness(
      () =>
        new Response("not-json", {
          headers: { "Content-Type": "application/json" },
        }),
    );

    await expectPublicOperationError(
      verifyChallenge(harness.provider),
      "Public operation challenge is unavailable.",
      503,
    );
  });

  it("sends the secret and token and returns successful Siteverify facts", async () => {
    const harness = siteverifyHarness(() =>
      Response.json({
        success: true,
        challenge_ts: "2026-05-28T00:00:00.000Z",
        hostname: "example.com",
      }),
    );

    const verification = await verifyChallenge(harness.provider);
    const request = harness.requests[0];

    expect(request?.url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(request?.method).toBe("POST");
    expect(request?.headers.get("Content-Type")).toBe("application/json");
    expect(await request?.json()).toEqual({
      secret: turnstileSecret,
      response: turnstileToken,
      idempotency_key: "0efcb132-5697-57f5-80f4-0ac5f4ea3261",
    });
    expect(verification).toMatchObject({
      kind: "turnstile",
      success: true,
      challengeTs: "2026-05-28T00:00:00.000Z",
      hostname: "example.com",
      verifiedAt: expect.any(String),
    });
  });

  it("maps rejected Siteverify responses to challenge failure even when non-OK", async () => {
    const harness = siteverifyHarness(() =>
      Response.json({ success: false, "error-codes": ["invalid-input-response"] }, { status: 400 }),
    );

    await expectPublicOperationError(
      verifyChallenge(harness.provider),
      "Public operation challenge failed.",
      403,
    );
  });

  it("maps non-OK successful Siteverify responses to unavailable", async () => {
    const harness = siteverifyHarness(() => Response.json({ success: true }, { status: 500 }));

    await expectPublicOperationError(
      verifyChallenge(harness.provider),
      "Public operation challenge is unavailable.",
      503,
    );
  });
  it("normalizes domain idempotency keys to a deterministic UUID", async () => {
    const harness = siteverifyHarness(() => Response.json({ success: true }));
    await verifyChallenge(harness.provider);
    await verifyChallenge(harness.provider);
    const requests = await Promise.all(
      harness.requests.map(
        (request) =>
          request.json() as Promise<{
            idempotency_key: string;
          }>,
      ),
    );
    expect(requests.map((request) => request.idempotency_key)).toEqual([
      "0efcb132-5697-57f5-80f4-0ac5f4ea3261",
      "0efcb132-5697-57f5-80f4-0ac5f4ea3261",
    ]);
    expect(requests[0]?.idempotency_key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("passes UUID idempotency keys through unchanged", async () => {
    const harness = siteverifyHarness(() => Response.json({ success: true }));
    const idempotencyKey = "123e4567-e89b-12d3-a456-426614174000";
    await verifyChallenge(harness.provider, { idempotencyKey });
    expect(
      (await harness.requests[0]?.json()) as {
        idempotency_key: string;
      },
    ).toMatchObject({
      idempotency_key: idempotencyKey,
    });
  });
});
function verifyChallenge(
  provider: PublicOperationTurnstileSiteverifyProvider,
  options: {
    idempotencyKey?: string;
    secret?: string;
  } = {},
) {
  return verifyPublicOperationTurnstileChallenge({
    env: {
      FORMLESS_TURNSTILE_SECRET_KEY: "secret" in options ? options.secret : turnstileSecret,
    },
    idempotencyKey: options.idempotencyKey ?? "site-contact:rec_site_block_contact_form:key-1",
    provider,
    token: turnstileToken,
  });
}

function siteverifyHarness(send: (request: Request) => Promise<Response> | Response): {
  provider: PublicOperationTurnstileSiteverifyProvider;
  requests: Request[];
} {
  const requests: Request[] = [];

  return {
    provider: {
      send(request) {
        requests.push(request);

        return send(request);
      },
    },
    requests,
  };
}

async function expectPublicOperationError(
  promise: Promise<unknown>,
  message: string,
  status: number,
) {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );

  expect(error).toBeInstanceOf(PublicOperationError);
  expect(error).toMatchObject({ message, status });
}
