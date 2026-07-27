import type {
  CreateFieldContract,
  CreateSurfaceContract,
  FieldIntent,
} from "@dpeek/formless-presentation/contract";

export type GeneratedCreateFieldIndex = ReadonlyMap<string, CreateFieldContract>;

export function indexGeneratedCreateSurfaceFields(
  surface: CreateSurfaceContract,
): GeneratedCreateFieldIndex {
  const fieldsById = new Map<string, CreateFieldContract>();

  for (const field of surface.dialog.form.fieldSet.fields) {
    if (fieldsById.has(field.fieldId)) {
      throw new Error(
        `Generated create surface "${surface.id}" contains duplicate field occurrence "${field.fieldId}".`,
      );
    }
    fieldsById.set(field.fieldId, field);
  }

  return fieldsById;
}

export function resolveGeneratedCreateFieldIntent(
  fieldsById: GeneratedCreateFieldIndex,
  fieldId: string,
  intent: FieldIntent,
): CreateFieldContract | undefined {
  if (intent.type !== "createDraftChange" && intent.type !== "mediaFileSelect") {
    return undefined;
  }

  const field = fieldsById.get(fieldId);
  return field?.fieldName === intent.fieldName ? field : undefined;
}
