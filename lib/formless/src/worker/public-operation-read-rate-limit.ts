import type { OperationRateLimitPolicySchema } from "@dpeek/formless-schema";

export type PublicOperationReadRateLimitDecision =
  | { allowed: true }
  | {
      allowed: false;
      retryAfterSeconds: number;
    };

export type PublicOperationReadRateLimitAdapterInput = {
  nowMs: number;
  operationKey: string;
  policy: OperationRateLimitPolicySchema;
  request: Request;
};

export type PublicOperationReadRateLimitAdapter = {
  consume(
    input: PublicOperationReadRateLimitAdapterInput,
  ): Promise<PublicOperationReadRateLimitDecision> | PublicOperationReadRateLimitDecision;
};

export type PublicOperationReadRateLimitState = {
  attempts: number;
  expiresAtMs: number;
};

export type PublicOperationReadRateLimitStateStore = {
  deleteExpired(nowMs: number): void;
  read(scopeKey: string): PublicOperationReadRateLimitState | undefined;
  write(scopeKey: string, state: PublicOperationReadRateLimitState): void;
};

const trustedClientNetworkHeader = "CF-Connecting-IP";
const rateLimitTableName = "public_read_rate_limits";

export function createPublicOperationReadRateLimitAdapter(
  storage: DurableObjectStorage,
): PublicOperationReadRateLimitAdapter {
  return {
    consume: (input) =>
      consumePublicOperationReadRateLimit({
        ...input,
        store: durableObjectPublicOperationReadRateLimitStateStore(storage),
      }),
  };
}

export async function consumePublicOperationReadRateLimit(
  input: PublicOperationReadRateLimitAdapterInput & {
    store: PublicOperationReadRateLimitStateStore;
  },
): Promise<PublicOperationReadRateLimitDecision> {
  const scopeKey = await publicOperationReadRateLimitScopeKey(input);
  const windowMs = input.policy.windowSeconds * 1_000;

  input.store.deleteExpired(input.nowMs);

  const current = input.store.read(scopeKey);
  if (!current || current.expiresAtMs <= input.nowMs) {
    input.store.write(scopeKey, {
      attempts: 1,
      expiresAtMs: input.nowMs + windowMs,
    });
    return { allowed: true };
  }

  if (current.attempts >= input.policy.maxRequests) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.expiresAtMs - input.nowMs) / 1_000)),
    };
  }

  input.store.write(scopeKey, {
    ...current,
    attempts: current.attempts + 1,
  });
  return { allowed: true };
}

async function publicOperationReadRateLimitScopeKey(
  input: PublicOperationReadRateLimitAdapterInput,
): Promise<string> {
  const trustedClientNetwork =
    input.request.headers.get(trustedClientNetworkHeader)?.trim().toLowerCase() || "unavailable";
  const digest = await sha256Hex(
    ["formless-public-read-rate-limit-v1", input.operationKey, trustedClientNetwork].join("\n"),
  );

  return `sha256:${digest}`;
}

function durableObjectPublicOperationReadRateLimitStateStore(
  storage: DurableObjectStorage,
): PublicOperationReadRateLimitStateStore {
  ensurePublicOperationReadRateLimitTable(storage);

  return {
    deleteExpired(nowMs) {
      storage.sql.exec(`DELETE FROM ${rateLimitTableName} WHERE expires_at_ms <= ?`, nowMs);
    },
    read(scopeKey) {
      const row = storage.sql
        .exec<{ attempts: number; expires_at_ms: number }>(
          `
            SELECT attempts, expires_at_ms
            FROM ${rateLimitTableName}
            WHERE scope_key = ?
          `,
          scopeKey,
        )
        .next();

      return row.done
        ? undefined
        : {
            attempts: row.value.attempts,
            expiresAtMs: row.value.expires_at_ms,
          };
    },
    write(scopeKey, state) {
      storage.sql.exec(
        `
          INSERT INTO ${rateLimitTableName} (scope_key, attempts, expires_at_ms)
          VALUES (?, ?, ?)
          ON CONFLICT(scope_key) DO UPDATE SET
            attempts = excluded.attempts,
            expires_at_ms = excluded.expires_at_ms
        `,
        scopeKey,
        state.attempts,
        state.expiresAtMs,
      );
    },
  };
}

function ensurePublicOperationReadRateLimitTable(storage: DurableObjectStorage) {
  storage.sql.exec(`
    CREATE TABLE IF NOT EXISTS ${rateLimitTableName} (
      scope_key TEXT PRIMARY KEY CHECK (
        length(scope_key) = 71 AND scope_key LIKE 'sha256:%'
      ),
      attempts INTEGER NOT NULL CHECK (attempts > 0),
      expires_at_ms INTEGER NOT NULL
    )
  `);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
