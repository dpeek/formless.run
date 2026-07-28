import type { RecordValues, StoredRecord } from "@dpeek/formless-storage";
import type { AppSchema, EntitySchema, UniqueConstraintSchema } from "@dpeek/formless-schema";
import { BadRequestError } from "./errors.ts";
import { getActiveRecordsByEntity } from "./storage.ts";

type ConstraintCheckOptions = {
  additionalRecords?: readonly StoredRecord[];
  ignoreRecordId?: string;
};

export function assertUniqueConstraints(
  storage: DurableObjectStorage,
  schema: AppSchema,
  entityName: string,
  values: RecordValues,
  options: ConstraintCheckOptions = {},
) {
  assertUniqueConstraintsForActiveRecords(
    schema,
    entityName,
    values,
    activeConstraintCandidateRecords(storage, entityName, options.additionalRecords),
    options,
  );
}

export function assertUniqueConstraintsForActiveRecords(
  schema: AppSchema,
  entityName: string,
  values: RecordValues,
  activeRecords: readonly StoredRecord[],
  options: Pick<ConstraintCheckOptions, "ignoreRecordId"> = {},
) {
  const entity = schema.entities.find((definition) => definition.key === entityName)!;
  if (!entity) {
    throw new Error(`Missing entity "${entityName}".`);
  }
  for (const constraint of entity.constraints ?? []) {
    if (constraint.kind !== "unique") {
      continue;
    }
    const constraintName = constraint.key;
    const duplicate = activeRecords.find((record) => {
      return (
        record.entity === entityName &&
        !record.deletedAt &&
        record.id !== options.ignoreRecordId &&
        uniqueConstraintValuesEqual(record.values, values, constraint)
      );
    });

    if (duplicate) {
      throw uniqueConstraintViolation(entityName, constraintName);
    }
  }
}

export function assertExistingRecordsSatisfyUniqueConstraints(
  schema: AppSchema,
  records: StoredRecord[],
) {
  for (const entity of schema.entities) {
    const entityName = entity.key;
    const activeRecords = records.filter(
      (record) => record.entity === entityName && !record.deletedAt,
    );
    for (const constraint of entity.constraints ?? []) {
      if (constraint.kind !== "unique") {
        continue;
      }
      const constraintName = constraint.key;
      assertExistingRecordsSatisfyUniqueConstraint(
        entityName,
        entity,
        constraintName,
        constraint,
        activeRecords,
      );
    }
  }
}

function activeConstraintCandidateRecords(
  storage: DurableObjectStorage,
  entityName: string,
  additionalRecords: readonly StoredRecord[] | undefined,
) {
  const additionalIds = new Set(additionalRecords?.map((record) => record.id) ?? []);
  const activeAdditionalRecords =
    additionalRecords?.filter((record) => record.entity === entityName && !record.deletedAt) ?? [];
  const storedRecords = getActiveRecordsByEntity(storage, entityName).filter(
    (record) => !additionalIds.has(record.id),
  );

  return [...storedRecords, ...activeAdditionalRecords];
}

function assertExistingRecordsSatisfyUniqueConstraint(
  entityName: string,
  entity: EntitySchema,
  constraintName: string,
  constraint: UniqueConstraintSchema,
  records: StoredRecord[],
) {
  const seen = new Set<string>();

  for (const record of records) {
    const key = uniqueConstraintKey(record.values, constraint);

    if (seen.has(key)) {
      throw new BadRequestError(
        `Cannot add unique constraint "${entityName}.${constraintName}" because existing records violate it.`,
      );
    }
    seen.add(key);
  }
  for (const fieldName of constraint.fields) {
    if (!entity.fields.find((definition) => definition.key === fieldName)!) {
      throw new Error(
        `Unique constraint "${entityName}.${constraintName}" references unknown field "${fieldName}".`,
      );
    }
  }
}

function uniqueConstraintValuesEqual(
  left: RecordValues,
  right: RecordValues,
  constraint: UniqueConstraintSchema,
) {
  return constraint.fields.every((fieldName) => left[fieldName] === right[fieldName]);
}

function uniqueConstraintKey(values: RecordValues, constraint: UniqueConstraintSchema) {
  return JSON.stringify(constraint.fields.map((fieldName) => values[fieldName] ?? null));
}

function uniqueConstraintViolation(entityName: string, constraintName: string) {
  return new BadRequestError(
    `Unique constraint "${entityName}.${constraintName}" would be violated.`,
  );
}
