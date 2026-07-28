import type { FieldValue, StoredRecord } from "./types.ts";
import type {
  AddressableField,
  EntitySchema,
  FieldRef,
  FieldSchema,
  SystemFieldName,
} from "./types.ts";
import { getFieldTypeBehavior } from "./field-types.ts";

const SYSTEM_FIELDS: AddressableField[] = [
  {
    ref: { kind: "system", name: "id" },
    type: "id",
    label: "ID",
    writable: false,
    filterOps: ["eq"],
  },
  {
    ref: { kind: "system", name: "createdAt" },
    type: "datetime",
    label: "Created at",
    writable: false,
    filterOps: ["eq"],
  },
  {
    ref: { kind: "system", name: "updatedAt" },
    type: "datetime",
    label: "Updated at",
    writable: false,
    filterOps: ["eq"],
  },
  {
    ref: { kind: "system", name: "deletedAt" },
    type: "datetime",
    label: "Deleted at",
    writable: false,
    filterOps: ["eq"],
  },
];
export function getEntityFieldCatalog(entity: EntitySchema): AddressableField[] {
  return [
    ...entity.fields.map((field) => valueFieldCatalogEntry(field.key, field)),
    ...SYSTEM_FIELDS,
  ];
}

export function fieldRefsEqual(left: FieldRef, right: FieldRef) {
  return left.kind === right.kind && left.name === right.name;
}

export function findAddressableField(
  catalog: AddressableField[],
  ref: FieldRef,
): AddressableField | undefined {
  return catalog.find((field) => fieldRefsEqual(field.ref, ref));
}

export function resolveRecordFieldValue(
  record: StoredRecord,
  ref: FieldRef,
): FieldValue | undefined {
  if (ref.kind === "value") {
    return record.values[ref.name];
  }

  if (ref.name === "id") {
    return record.id;
  }

  if (ref.name === "createdAt") {
    return record.createdAt;
  }

  if (ref.name === "updatedAt") {
    return record.updatedAt;
  }

  return record.deletedAt;
}

export function isSystemFieldName(value: string): value is SystemFieldName {
  return value === "id" || value === "createdAt" || value === "updatedAt" || value === "deletedAt";
}

export function formatFieldRef(ref: FieldRef) {
  return `${ref.kind}.${ref.name}`;
}

function valueFieldCatalogEntry(fieldName: string, field: FieldSchema): AddressableField {
  return {
    ref: { kind: "value", name: fieldName },
    type: field.type,
    label: field.label ?? humanizeFieldName(fieldName),
    writable: true,
    filterOps: [...getFieldTypeBehavior(field).filterOps],
    ...(field.type === "enum" ? { values: field.values } : {}),
    ...(field.type === "reference"
      ? {
          to: field.to,
          ...(field.displayField === undefined ? {} : { displayField: field.displayField }),
        }
      : {}),
  };
}

function humanizeFieldName(fieldName: string) {
  const withSpaces = fieldName
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();

  if (withSpaces === "") {
    return fieldName;
  }

  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1).toLowerCase();
}
