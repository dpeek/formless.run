import { parseSourceSvg } from "@dpeek/formless-source-svg";

import {
  assertExactKeys,
  parseKeyedDefinitionArray,
  parseOptionalNonEmptyString,
  parseRequiredNonEmptyString,
} from "./schema-parse-helpers.ts";
import type { IconDefinitionSchema, KeyedDefinition } from "./types.ts";

export function parseIconDefinitions(
  value: unknown,
): KeyedDefinition<IconDefinitionSchema>[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  return parseKeyedDefinitionArray("Schema icons", value, (key, definition) => {
    assertExactKeys(`Schema icon "${key}"`, definition, ["key", "label", "source"], ["group"]);
    const label = parseRequiredNonEmptyString(`Schema icon "${key}" label`, definition.label);
    const group = parseOptionalNonEmptyString(`Schema icon "${key}" group`, definition.group);
    const source = parseRequiredNonEmptyString(`Schema icon "${key}" source`, definition.source);

    if (parseSourceSvg(source) === null) {
      throw new Error(`Schema icon "${key}" source must be display-safe SVG.`);
    }

    return {
      label,
      ...(group === undefined ? {} : { group }),
      source,
    };
  });
}

export function mergeSchemaIconDefinitionsWithDefaults<
  Definition extends {
    key: string;
  },
>(
  schemaDefinitions: readonly Definition[] | undefined,
  defaultDefinitions: readonly Definition[],
): Definition[] {
  const schemaKeys = new Set((schemaDefinitions ?? []).map(({ key }) => key));
  return [
    ...(schemaDefinitions ?? []),
    ...defaultDefinitions.filter(({ key }) => !schemaKeys.has(key)),
  ];
}
