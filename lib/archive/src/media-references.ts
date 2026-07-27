import type { AppSchema, TextFieldDocumentAssetPolicySchema } from "@dpeek/formless-schema";
import type { StoredRecord } from "@dpeek/formless-storage";

export type AppArchiveImageMediaReference = {
  assetId: string;
  entity: string;
  field: string;
  kind: "image";
  recordId: string;
};

export type AppArchiveDocumentMediaReference = {
  assetId: string;
  entity: string;
  field: string;
  kind: "document";
  policy: TextFieldDocumentAssetPolicySchema;
  recordId: string;
};

export type AppArchiveMediaReference =
  | AppArchiveImageMediaReference
  | AppArchiveDocumentMediaReference;

type MediaField =
  | {
      kind: "image";
    }
  | {
      kind: "document";
      policy: TextFieldDocumentAssetPolicySchema;
    };

export function appArchiveMediaReferences(
  schema: AppSchema,
  records: readonly StoredRecord[],
): AppArchiveMediaReference[] {
  const fields = schemaMediaFields(schema);
  const references: AppArchiveMediaReference[] = [];

  for (const record of records) {
    if (record.deletedAt !== undefined) {
      continue;
    }

    for (const [fieldName, value] of Object.entries(record.values)) {
      if (typeof value !== "string" || value === "") {
        continue;
      }

      const field = fields.get(mediaFieldKey(record.entity, fieldName));

      if (!field) {
        continue;
      }

      references.push(
        field.kind === "document"
          ? {
              assetId: value,
              entity: record.entity,
              field: fieldName,
              kind: "document",
              policy: field.policy,
              recordId: record.id,
            }
          : {
              assetId: value,
              entity: record.entity,
              field: fieldName,
              kind: "image",
              recordId: record.id,
            },
      );
    }
  }

  return references.sort(compareMediaReferences);
}

function schemaMediaFields(schema: AppSchema): Map<string, MediaField> {
  const fields = new Map<string, MediaField>();

  for (const [entityName, entity] of Object.entries(schema.entities)) {
    for (const [fieldName, field] of Object.entries(entity.fields)) {
      if (field.type === "text" && field.asset?.kind === "document") {
        fields.set(mediaFieldKey(entityName, fieldName), {
          kind: "document",
          policy: field.asset,
        });
      }
    }
  }

  for (const itemView of Object.values(schema.itemViews)) {
    addMediaEditorFields(fields, schema, itemView.entity, itemView.fields);

    for (const variant of Object.values(itemView.variants ?? {})) {
      if (variant.presentation === "fields") {
        addMediaEditorFields(fields, schema, itemView.entity, variant.fields);
      }
    }

    if (itemView.fallback?.presentation === "fields") {
      addMediaEditorFields(fields, schema, itemView.entity, itemView.fallback.fields);
    }
  }

  for (const tableView of Object.values(schema.tableViews)) {
    for (const column of tableView.columns) {
      if (column.type === "field" && column.editor === "media") {
        addMediaEditorField(fields, schema, tableView.entity, column.field);
      }
    }
  }

  for (const view of Object.values(schema.views)) {
    if (view.type === "collection") {
      continue;
    }

    addMediaEditorFields(fields, schema, view.entity, view.fields);

    for (const variant of Object.values(view.variants ?? {})) {
      addMediaEditorFields(fields, schema, view.entity, variant.fields);
    }

    if (view.fallback) {
      addMediaEditorFields(fields, schema, view.entity, view.fallback.fields);
    }
  }

  return fields;
}

function addMediaEditorFields(
  fields: Map<string, MediaField>,
  schema: AppSchema,
  entityName: string,
  viewFields: Record<string, { editor: string }>,
) {
  for (const [fieldName, field] of Object.entries(viewFields)) {
    if (field.editor === "media") {
      addMediaEditorField(fields, schema, entityName, fieldName);
    }
  }
}

function addMediaEditorField(
  fields: Map<string, MediaField>,
  schema: AppSchema,
  entityName: string,
  fieldName: string,
) {
  const schemaField = schema.entities[entityName]?.fields[fieldName];

  if (schemaField?.type !== "text") {
    return;
  }

  const key = mediaFieldKey(entityName, fieldName);

  if (schemaField.asset?.kind === "document") {
    fields.set(key, { kind: "document", policy: schemaField.asset });
    return;
  }

  if (!fields.has(key)) {
    fields.set(key, { kind: "image" });
  }
}

function mediaFieldKey(entity: string, field: string): string {
  return `${entity}\u0000${field}`;
}

function compareMediaReferences(
  left: AppArchiveMediaReference,
  right: AppArchiveMediaReference,
): number {
  return (
    left.entity.localeCompare(right.entity) ||
    left.field.localeCompare(right.field) ||
    left.recordId.localeCompare(right.recordId) ||
    left.assetId.localeCompare(right.assetId)
  );
}
