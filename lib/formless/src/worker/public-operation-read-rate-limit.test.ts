import { describe, expect, it } from "vite-plus/test";

import {
  installedAppStorageIdentity,
  schemaKeyStorageIdentity,
} from "../shared/app-storage-identity.ts";
import {
  consumePublicOperationReadRateLimit,
  type PublicOperationReadRateLimitState,
  type PublicOperationReadRateLimitStateStore,
} from "./public-operation-read-rate-limit.ts";

describe("public operation read rate limit", () => {
  it("isolates attempts by target, operation, and trusted client network", async () => {
    const store = memoryRateLimitStore();
    const schemaIdentity = schemaKeyStorageIdentity("tasks");
    const installedIdentity = installedAppStorageIdentity({
      packageAppKey: "crm",
      installId: "verification",
    });

    if (!installedIdentity) {
      throw new Error("Expected installed CRM identity.");
    }

    const base = {
      identity: schemaIdentity,
      nowMs: Date.parse("2026-07-27T03:00:00.000Z"),
      operationKey: "certificate.lookup",
      policy: { maxRequests: 1, windowSeconds: 60 },
      request: requestFromNetwork("203.0.113.10"),
      store,
    };

    expect(await consumePublicOperationReadRateLimit(base)).toEqual({ allowed: true });
    expect(
      await consumePublicOperationReadRateLimit({
        ...base,
        identity: installedIdentity,
      }),
    ).toEqual({ allowed: true });
    expect(
      await consumePublicOperationReadRateLimit({
        ...base,
        operationKey: "certificate.lookupByReport",
      }),
    ).toEqual({ allowed: true });
    expect(
      await consumePublicOperationReadRateLimit({
        ...base,
        request: requestFromNetwork("203.0.113.11"),
      }),
    ).toEqual({ allowed: true });
    expect(await consumePublicOperationReadRateLimit(base)).toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    });
    expect(store.state.size).toBe(4);
  });

  it("uses only the trusted client-network header and stores hashed scope keys", async () => {
    const store = memoryRateLimitStore();
    const input = {
      identity: schemaKeyStorageIdentity("tasks"),
      nowMs: Date.parse("2026-07-27T03:01:00.000Z"),
      operationKey: "certificate.lookup",
      policy: { maxRequests: 1, windowSeconds: 60 },
      request: requestFromNetwork("198.51.100.42", {
        "X-Forwarded-For": "192.0.2.1",
      }),
      store,
    };

    expect(await consumePublicOperationReadRateLimit(input)).toEqual({ allowed: true });
    expect(
      await consumePublicOperationReadRateLimit({
        ...input,
        request: requestFromNetwork("198.51.100.42", {
          "X-Forwarded-For": "192.0.2.99",
        }),
      }),
    ).toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    });

    const stored = JSON.stringify([...store.state.entries()]);
    expect(stored).not.toContain("198.51.100.42");
    expect(stored).not.toContain("192.0.2.1");
    expect(stored).not.toContain("certificate.lookup");
    expect(stored).not.toContain("SECRET-LOOKUP-VALUE");
    expect([...store.state.keys()]).toEqual([expect.stringMatching(/^sha256:[a-f0-9]{64}$/)]);
  });

  it("reports retry timing and resets the counter after the declared window", async () => {
    const store = memoryRateLimitStore();
    const startedAt = Date.parse("2026-07-27T03:02:00.000Z");
    const input = {
      identity: schemaKeyStorageIdentity("tasks"),
      nowMs: startedAt,
      operationKey: "certificate.lookup",
      policy: { maxRequests: 2, windowSeconds: 30 },
      request: requestFromNetwork("203.0.113.20"),
      store,
    };

    expect(await consumePublicOperationReadRateLimit(input)).toEqual({ allowed: true });
    expect(await consumePublicOperationReadRateLimit(input)).toEqual({ allowed: true });
    expect(
      await consumePublicOperationReadRateLimit({
        ...input,
        nowMs: startedAt + 12500,
      }),
    ).toEqual({
      allowed: false,
      retryAfterSeconds: 18,
    });
    expect(
      await consumePublicOperationReadRateLimit({
        ...input,
        nowMs: startedAt + 30000,
      }),
    ).toEqual({ allowed: true });
  });
});

function requestFromNetwork(network: string, headers: Record<string, string> = {}): Request {
  return new Request("https://example.com/public", {
    headers: {
      ...headers,
      "CF-Connecting-IP": network,
    },
  });
}

function memoryRateLimitStore(): PublicOperationReadRateLimitStateStore & {
  state: Map<string, PublicOperationReadRateLimitState>;
} {
  const state = new Map<string, PublicOperationReadRateLimitState>();

  return {
    state,
    deleteExpired(nowMs) {
      for (const [key, value] of state) {
        if (value.expiresAtMs <= nowMs) {
          state.delete(key);
        }
      }
    },
    read(scopeKey) {
      return state.get(scopeKey);
    },
    write(scopeKey, value) {
      state.set(scopeKey, value);
    },
  };
}
