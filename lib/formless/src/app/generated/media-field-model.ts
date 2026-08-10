import type { MediaAssetOption, ProgramDocumentMediaTarget } from "@dpeek/formless-media/client";
import type { TextFieldSchema } from "@dpeek/formless-schema";
import type {
  CreateFieldConfig,
  HomeScreenModel,
  RecordFieldConfig,
  RecordUnionPresentationConfig,
} from "../../client/views.ts";
import { FORMLESS_PROGRAM_API_ROUTE_PREFIX } from "../../program/target.ts";

export type GeneratedMediaField = {
  entityName: string;
  field: TextFieldSchema;
  fieldName: string;
};

export type GeneratedMediaAssetOptionsByFieldKey = Readonly<
  Record<string, readonly MediaAssetOption[] | undefined>
>;

export function generatedMediaFieldKey(entityName: string, fieldName: string): string {
  return `${entityName}.${fieldName}`;
}

export function generatedMediaAssetOptionsForField(
  optionsByFieldKey: GeneratedMediaAssetOptionsByFieldKey,
  entityName: string,
  fieldName: string,
): readonly MediaAssetOption[] {
  return optionsByFieldKey[generatedMediaFieldKey(entityName, fieldName)] ?? [];
}

export function generatedDocumentMediaTarget(
  entityName: string,
  fieldName: string,
): ProgramDocumentMediaTarget {
  return {
    documentsPath: `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/media/documents`,
    field: { entityName, fieldName },
  };
}

export function collectGeneratedWorkspaceMediaFields(
  screen: HomeScreenModel,
): GeneratedMediaField[] {
  const fieldsByKey = new Map<string, GeneratedMediaField>();

  function addFields(
    entityName: string,
    fields: readonly (CreateFieldConfig | RecordFieldConfig)[],
  ) {
    for (const fieldConfig of fields) {
      if (fieldConfig.editor !== "media" || fieldConfig.field.type !== "text") {
        continue;
      }
      const field = {
        entityName,
        field: fieldConfig.field,
        fieldName: fieldConfig.fieldName,
      };
      fieldsByKey.set(generatedMediaFieldKey(entityName, fieldConfig.fieldName), field);
    }
  }

  function addCreateOperation(
    operation:
      | Extract<
          HomeScreenModel["layout"]["sections"][number]["collection"]["operations"][number],
          { type: "create" }
        >
      | undefined,
  ) {
    if (!operation) {
      return;
    }
    addFields(
      operation.entityName,
      collectCreatePresentationFields(operation.fields, operation.union),
    );
  }

  for (const { collection } of screen.layout.sections) {
    for (const operation of collection.operations) {
      if (operation.type === "create") {
        addCreateOperation(operation);
      }
    }

    const context = collection.context;
    addCreateOperation(context?.createOperation);
    if (context?.recordFields) {
      addFields(
        context.entityName,
        collectRecordPresentationFields(context.recordFields, context.recordUnion),
      );
    }
    const selectedRecordDetail = collection.detail;
    if (selectedRecordDetail !== undefined) {
      for (const section of selectedRecordDetail.sections) {
        if (section.type === "record") {
          addFields(
            selectedRecordDetail.entityName,
            collectRecordPresentationFields(
              section.result.recordFields,
              section.result.recordUnion,
            ),
          );
        }
      }
    }

    const result = collection.result;
    if (result.type === "list" || result.type === "record") {
      addFields(
        collection.entityName,
        collectRecordPresentationFields(result.recordFields, result.recordUnion),
      );
    } else if (result.type === "table") {
      for (const column of result.columns) {
        if (column.type === "field") {
          addFields(collection.entityName, [column]);
        }
        if (column.type === "referenceField") {
          addFields(column.referencedEntityName, [column]);
        }
        if (column.type === "field" && column.referenceItem) {
          addFields(
            column.referenceItem.entityName,
            collectRecordPresentationFields(
              column.referenceItem.recordFields,
              column.referenceItem.recordUnion,
            ),
          );
        }
        if (column.type === "operationControl") {
          for (const control of column.controls) {
            if (control.type === "editRecord") {
              addFields(
                control.editView.entityName,
                collectRecordPresentationFields(control.editView.fields, control.editView.union),
              );
            }
          }
        }
      }
    } else {
      addFields(
        result.childEntityName,
        collectRecordPresentationFields(result.childRecordFields, result.childRecordUnion),
      );
      addFields(
        result.placementEntityName,
        collectRecordPresentationFields(
          result.placementRecordFields ?? [],
          result.placementRecordUnion,
        ),
      );
    }
  }

  return [...fieldsByKey.values()].sort(
    (left, right) =>
      left.entityName.localeCompare(right.entityName) ||
      left.fieldName.localeCompare(right.fieldName),
  );
}

export function collectRecordPresentationFields(
  fields: readonly RecordFieldConfig[],
  union: RecordUnionPresentationConfig | undefined,
): RecordFieldConfig[] {
  const byName = new Map(fields.map((field) => [field.fieldName, field]));
  for (const presentation of [
    ...(union?.variants ?? []),
    ...(union?.fallback ? [union.fallback] : []),
  ]) {
    if (presentation.presentation.type !== "fields") {
      continue;
    }
    for (const field of presentation.presentation.fields) {
      byName.set(field.fieldName, field);
    }
  }
  return [...byName.values()];
}

export function collectCreatePresentationFields(
  fields: readonly CreateFieldConfig[],
  union:
    | Extract<
        HomeScreenModel["layout"]["sections"][number]["collection"]["operations"][number],
        { type: "create" }
      >["union"]
    | undefined,
): CreateFieldConfig[] {
  const byName = new Map(fields.map((field) => [field.fieldName, field]));
  for (const presentation of [
    ...(union?.variants ?? []),
    ...(union?.fallback ? [union.fallback] : []),
  ]) {
    for (const field of presentation.presentation.fields) {
      byName.set(field.fieldName, field);
    }
  }
  return [...byName.values()];
}
