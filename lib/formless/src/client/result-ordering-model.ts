import type { EntitySchema, FieldSchema, ResultOrderingSchema } from "@dpeek/formless-schema";

export type ResultOrderingPresentation = "moveMenu" | "dragHandle";
export type ResultOrderingScopeConfig = {
  kind: "field";
  fieldName: string;
  field: FieldSchema;
};
export type ResultOrderingConfig = {
  fieldName: string;
  field: Extract<
    FieldSchema,
    {
      type: "number";
    }
  >;
  scope: ResultOrderingScopeConfig[];
  presentations: ResultOrderingPresentation[];
};

export function selectResultOrderingConfig(
  ordering: ResultOrderingSchema | undefined,
  entity: EntitySchema,
  presentations: ResultOrderingPresentation[] = ["moveMenu"],
): ResultOrderingConfig | undefined {
  if (!ordering) {
    return undefined;
  }
  const field = entity.fields.find((definition) => definition.key === ordering.field)!;
  if (!field || field.type !== "number") {
    throw new Error(`Missing ordering field "${ordering.field}".`);
  }

  return {
    fieldName: ordering.field,
    field,
    scope: (ordering.scope ?? []).map((scopeField) => {
      const field = entity.fields.find((definition) => definition.key === scopeField.field)!;
      if (!field) {
        throw new Error(`Missing ordering scope field "${scopeField.field}".`);
      }

      return {
        kind: "field",
        fieldName: scopeField.field,
        field,
      };
    }),
    presentations,
  };
}
