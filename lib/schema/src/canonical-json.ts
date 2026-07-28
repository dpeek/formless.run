/** Locale-independent ordinal comparison over JavaScript UTF-16 strings. */
export function compareOrdinalStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Recursively sort object properties while preserving array order. */
export function canonicalizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJsonValue);
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => compareOrdinalStrings(left, right))
      .map(([key, child]) => [key, canonicalizeJsonValue(child)]),
  );
}

/** Serialize JSON with shared canonical object ordering and exact array order. */
export function canonicalJsonStringify(value: unknown, space?: string | number): string {
  return JSON.stringify(canonicalizeJsonValue(value), null, space);
}
