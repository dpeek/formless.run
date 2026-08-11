import {
  findAddressableField,
  getEntityFieldCatalog,
  getFieldTypeBehavior,
  isSystemFieldName,
  type EntitySchema,
  type FieldCommitPolicy,
  type FieldEditor,
  type FieldRef,
  type FieldSchema,
} from "@dpeek/formless-schema";
import { fieldLabel } from "./view-labels.ts";

export type AddressableRecordFieldConfig = {
  fieldName: string;
  fieldRef: FieldRef;
  field: FieldSchema;
  writable: boolean;
  label: string;
};

const systemDisplayField = {
  type: "text",
  required: false,
} satisfies FieldSchema;

export function selectAddressableRecordFieldConfig(
  entity: EntitySchema,
  fieldName: string,
): AddressableRecordFieldConfig {
  const valueField = entity.fields.find((definition) => definition.key === fieldName)!;
  if (valueField !== undefined) {
    return {
      fieldName,
      fieldRef: { kind: "value", name: fieldName },
      field: valueField,
      writable: true,
      label: fieldLabel(fieldName, valueField),
    };
  }

  if (!isSystemFieldName(fieldName)) {
    throw new Error(`Missing field "${fieldName}".`);
  }

  const ref = { kind: "system", name: fieldName } satisfies FieldRef;
  const catalogField = findAddressableField(getEntityFieldCatalog(entity), ref);

  return {
    fieldName,
    fieldRef: ref,
    field: systemDisplayField,
    writable: false,
    label: catalogField?.label ?? fieldName,
  };
}

export function selectRecordFieldCommitPolicy(
  field: FieldSchema,
  editor: FieldEditor,
): FieldCommitPolicy {
  const behavior = getFieldTypeBehavior(field);
  if (!behavior.editors.includes(editor)) {
    throw new Error(`Editor "${editor}" is not valid for field type "${field.type}".`);
  }
  return behavior.defaultCommit;
}
