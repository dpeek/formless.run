export function parseOptionalNonEmptyString(context: string, value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return parseRequiredNonEmptyString(context, value);
}

export function parseRequiredNonEmptyString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value;
}

export function assertExactKeys(
  context: string,
  value: Record<string, unknown>,
  requiredKeys: string[],
  optionalKeys: string[] = [],
) {
  const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);

  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${context} has unsupported key "${key}".`);
    }
  }

  for (const key of requiredKeys) {
    if (!(key in value)) {
      throw new Error(`${context} must include "${key}".`);
    }
  }
}

export function assertSupportedKeys(
  context: string,
  value: Record<string, unknown>,
  keys: string[],
) {
  const allowedKeys = new Set(keys);

  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${context} has unsupported key "${key}".`);
    }
  }
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function parseKeyedDefinitionArray<Definition extends object>(
  context: string,
  value: unknown,
  parseDefinition: (key: string, value: Record<string, unknown>, index: number) => Definition,
): KeyedDefinition<Definition>[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array.`);
  }
  const keys = new Set<string>();
  return value.map((entry, index) => {
    const entryContext = `${context}[${index}]`;
    if (!isRecord(entry)) {
      throw new Error(`${entryContext} must be an object.`);
    }
    const key = parseRequiredNonEmptyString(`${entryContext} key`, entry.key);
    if (keys.has(key)) {
      throw new Error(`${context} contains duplicate key "${key}".`);
    }
    keys.add(key);
    return {
      key,
      ...parseDefinition(key, entry, index),
    };
  });
}
export function definitionsByKey<
  Definition extends {
    key: string;
  },
>(definitions: readonly Definition[] | undefined): ReadonlyMap<string, Definition> {
  return new Map((definitions ?? []).map((definition) => [definition.key, definition]));
}
export function definitionsToRecord<
  Definition extends {
    key: string;
  },
>(definitions: readonly Definition[] | undefined): Record<string, Definition> {
  return Object.fromEntries(
    (definitions ?? []).map((definition) => [definition.key, definition]),
  ) as Record<string, Definition>;
}
import type { KeyedDefinition } from "./types.ts";
