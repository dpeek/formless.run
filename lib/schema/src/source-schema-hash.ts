import { canonicalJsonStringify } from "./canonical-json.ts";
import type { SourceSchemaHash } from "./types.ts";

const sourceSchemaHashPattern = /^sha256:[a-f0-9]{64}$/;

/** Serialize complete portable App schema data with canonical object ordering. */
export function sourceSchemaCanonicalJson(schema: unknown): string {
  return canonicalJsonStringify(schema);
}

/** Compute the canonical SHA-256 digest for complete portable App schema data. */
export async function computeSourceSchemaHash(schema: unknown): Promise<SourceSchemaHash> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(sourceSchemaCanonicalJson(schema)),
  );
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return `sha256:${hex}`;
}

/** Return whether a value is one canonical source schema hash. */
export function isSourceSchemaHash(value: unknown): value is SourceSchemaHash {
  return typeof value === "string" && sourceSchemaHashPattern.test(value);
}

/** Parse one canonical source schema hash. */
export function parseSourceSchemaHash(
  value: unknown,
  context = "source schema hash",
): SourceSchemaHash {
  if (!isSourceSchemaHash(value)) {
    throw new Error(`${context} must be a sha256 source schema hash.`);
  }

  return value;
}
