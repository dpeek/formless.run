import {
  getAppSchemaDefinitionIndex,
  isFieldItemViewSchema,
  type AppSchema,
  type TextFieldDocumentAssetPolicySchema,
} from "@dpeek/formless-schema";
import type { StoredRecord } from "@dpeek/formless-storage";
import {
  coreImageMediaDeliveryFactsForAssetId,
  documentMediaStorageKeyForAssetId,
} from "@dpeek/formless-media";

export const INSTANCE_ARCHIVE_IMAGE_PATH_PREFIX = "media/images";
export const INSTANCE_ARCHIVE_DOCUMENT_PATH_PREFIX = "media/documents";

export type InstanceArchiveMediaIdentity = {
  assetId: string;
  kind: "document" | "image";
};

export function instanceArchiveMediaPath(
  identity: InstanceArchiveMediaIdentity,
): string | undefined {
  if (identity.kind === "image") {
    return coreImageMediaDeliveryFactsForAssetId(identity.assetId)
      ? `${INSTANCE_ARCHIVE_IMAGE_PATH_PREFIX}/${identity.assetId}`
      : undefined;
  }

  return documentMediaStorageKeyForAssetId(identity.assetId)
    ? `${INSTANCE_ARCHIVE_DOCUMENT_PATH_PREFIX}/${identity.assetId}`
    : undefined;
}

export type ArchiveImageMediaReference = {
  assetId: string;
  entity: string;
  field: string;
  kind: "image";
  recordId: string;
};

export type ArchiveDocumentMediaReference = {
  assetId: string;
  entity: string;
  field: string;
  kind: "document";
  policy: TextFieldDocumentAssetPolicySchema;
  recordId: string;
};

export type ArchiveMediaReference = ArchiveImageMediaReference | ArchiveDocumentMediaReference;

type MediaField =
  | { kind: "image" }
  | { kind: "document"; policy: TextFieldDocumentAssetPolicySchema };

export function archiveMediaReferences(
  schema: AppSchema,
  records: readonly StoredRecord[],
): ArchiveMediaReference[] {
  const fields = schemaMediaFields(schema);
  const references: ArchiveMediaReference[] = [];

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

  for (const entity of schema.entities) {
    for (const field of entity.fields) {
      if (field.type === "text" && field.asset?.kind === "document") {
        fields.set(mediaFieldKey(entity.key, field.key), {
          kind: "document",
          policy: field.asset,
        });
      }
    }
  }

  for (const itemView of schema.itemViews) {
    if (!isFieldItemViewSchema(itemView)) {
      continue;
    }
    addMediaEditorFields(fields, schema, itemView.entity, itemView.fields);

    for (const variant of itemView.variants ?? []) {
      if (variant.presentation === "fields") {
        addMediaEditorFields(fields, schema, itemView.entity, variant.fields);
      }
    }

    if (itemView.fallback?.presentation === "fields") {
      addMediaEditorFields(fields, schema, itemView.entity, itemView.fallback.fields);
    }
  }

  for (const view of schema.views) {
    if (view.type === "collection") {
      continue;
    }

    addMediaEditorFields(fields, schema, view.entity, view.fields);

    for (const variant of view.variants ?? []) {
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
  viewFields: readonly { editor: string; field: string }[],
) {
  for (const field of viewFields) {
    if (field.editor === "media") {
      addMediaEditorField(fields, schema, entityName, field.field);
    }
  }
}

function addMediaEditorField(
  fields: Map<string, MediaField>,
  schema: AppSchema,
  entityName: string,
  fieldName: string,
) {
  const schemaField = getAppSchemaDefinitionIndex(schema)
    .fieldsByEntity.get(entityName)
    ?.byKey.get(fieldName);

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

function compareMediaReferences(left: ArchiveMediaReference, right: ArchiveMediaReference): number {
  return (
    compareOrdinal(left.entity, right.entity) ||
    compareOrdinal(left.field, right.field) ||
    compareOrdinal(left.recordId, right.recordId) ||
    compareOrdinal(left.assetId, right.assetId)
  );
}

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
