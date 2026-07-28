import {
  type AppSchema,
  type RecordPlanEntityOperationEffectSchema,
  type RecordPlanGeneratedCodeAlphabet,
  type RecordPlanGeneratedCodeExpressionSchema,
  type RecordPlanRecordIdExpressionSchema,
  type RecordPlanStepSchema,
  type RecordPlanValueExpressionSchema,
  type TransitionSideEffectCreateStepSchema,
  type TransitionSideEffectRecordIdExpressionSchema,
  type TransitionSideEffectRecordPlanSchema,
  type TransitionSideEffectValueExpressionSchema,
} from "@dpeek/formless-schema";
import type { FieldValue, RecordValues, StoredRecord } from "@dpeek/formless-storage";
import type { AppPackageResolver } from "../shared/app-packages.ts";
import { createRecordId } from "../shared/ids.ts";
import type {
  OperationCommandOutput,
  OperationInvocationEnvelope,
} from "../shared/operation-invocation.ts";
import { authorityStorageRecordValidationReader } from "./authority-record-validation-reader.ts";
import {
  validateRecordWriteRequest,
  validateRecordWriteRequestAsync,
} from "./authority-validation.ts";
import { assertUniqueConstraints } from "./constraints.ts";
import { BadRequestError } from "./errors.ts";
import type { IdentityReferenceTargetResolver } from "./identity-reference-targets.ts";
import { validateOperationInvocationRecordPlanInputValues } from "./operation-input-validation.ts";
import type {
  CreateRecordWriteRequest,
  DeleteRecordWriteRequest,
  PatchRecordWriteRequest,
} from "./record-write-requests.ts";
import { getStoredRecord, type OperationRecordWritePlan } from "./storage.ts";

export type RecordPlanInputValues = Partial<Record<string, FieldValue>>;

type MaterializableRecordPlanEffectSchema =
  | RecordPlanEntityOperationEffectSchema
  | TransitionSideEffectRecordPlanSchema;

type MaterializableRecordPlanStepSchema =
  | RecordPlanStepSchema
  | TransitionSideEffectCreateStepSchema;

type MaterializableRecordPlanRecordIdExpressionSchema =
  | RecordPlanRecordIdExpressionSchema
  | TransitionSideEffectRecordIdExpressionSchema;

type MaterializableRecordPlanValueExpressionSchema =
  | RecordPlanValueExpressionSchema
  | TransitionSideEffectValueExpressionSchema;
type MaterializableRecordPlanValuedStepSchema = Extract<
  MaterializableRecordPlanStepSchema,
  {
    kind: "create" | "patch";
  }
>;
export type RecordPlanStepMaterialization = {
  name: string;
  kind: MaterializableRecordPlanStepSchema["kind"];
  entity: string;
  recordId: string;
};

export type RecordPlanMaterialization = {
  plans: OperationRecordWritePlan[];
  steps: RecordPlanStepMaterialization[];
};

export type RecordPlanMaterializerInput = {
  effect: MaterializableRecordPlanEffectSchema;
  envelope: OperationInvocationEnvelope;
  identityReferenceResolver?: IdentityReferenceTargetResolver;
  inputValues: RecordPlanInputValues;
  operationId: string;
  packageResolver?: AppPackageResolver;
  plannedRecords?: Iterable<StoredRecord>;
  schema: AppSchema;
  storage: DurableObjectStorage;
  targetRecord?: StoredRecord;
};

type RecordPlanPlanningState = {
  operationId: string;
  envelope: OperationInvocationEnvelope;
  inputValues: RecordPlanInputValues;
  packageResolver?: AppPackageResolver;
  plannedRecordsById: Map<string, StoredRecord>;
  schema: AppSchema;
  stepOutputs: Map<string, StoredRecord>;
  storage: DurableObjectStorage;
  targetRecord?: StoredRecord;
};

type RecordPlanStepPlan = {
  plan: OperationRecordWritePlan;
  step: RecordPlanStepMaterialization;
};

const generatedCodeMaxAttempts = 32;

const generatedCodeAlphabets = {
  digits: "0123456789",
  upperAlpha: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  upperAlphaNumeric: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  upperAlphaNumericNoConfusables: "23456789ABCDEFGHJKLMNPQRSTUVWXYZ",
} satisfies Record<RecordPlanGeneratedCodeAlphabet, string>;

export function recordPlanCommandInput(input: {
  envelope: OperationInvocationEnvelope;
  schema: AppSchema;
  storage: DurableObjectStorage;
}): RecordPlanInputValues {
  if (input.envelope.input.type !== "command") {
    throw new BadRequestError(
      `Operation "${input.envelope.operation.canonicalKey}" requires command input.`,
    );
  }

  return validateOperationInvocationRecordPlanInputValues({
    envelope: input.envelope,
    rawInput: input.envelope.input.input ?? {},
    schema: input.schema,
    storage: input.storage,
  });
}

export function materializeRecordPlan(
  input: RecordPlanMaterializerInput,
): RecordPlanMaterialization {
  const state: RecordPlanPlanningState = {
    operationId: input.operationId,
    envelope: input.envelope,
    inputValues: input.inputValues,
    packageResolver: input.packageResolver,
    plannedRecordsById: initialRecordPlanRecords(input.plannedRecords),
    schema: input.schema,
    stepOutputs: new Map(),
    storage: input.storage,
    targetRecord: immutableStoredRecordSnapshot(input.targetRecord),
  };
  const steps: RecordPlanStepMaterialization[] = [];
  const plans: OperationRecordWritePlan[] = [];

  for (const step of input.effect.steps) {
    const materialized = recordPlanWritePlanForStep(step, state);
    plans.push(materialized.plan);
    steps.push(materialized.step);
  }

  return { plans, steps };
}

export async function materializeRecordPlanAsync(
  input: RecordPlanMaterializerInput,
): Promise<RecordPlanMaterialization> {
  const state: RecordPlanPlanningState = {
    operationId: input.operationId,
    envelope: input.envelope,
    inputValues: input.inputValues,
    packageResolver: input.packageResolver,
    plannedRecordsById: initialRecordPlanRecords(input.plannedRecords),
    schema: input.schema,
    stepOutputs: new Map(),
    storage: input.storage,
    targetRecord: immutableStoredRecordSnapshot(input.targetRecord),
  };
  const steps: RecordPlanStepMaterialization[] = [];
  const plans: OperationRecordWritePlan[] = [];

  for (const step of input.effect.steps) {
    const materialized = await recordPlanWritePlanForStepAsync(step, state, {
      identityReferenceResolver: input.identityReferenceResolver,
    });
    plans.push(materialized.plan);
    steps.push(materialized.step);
  }

  return { plans, steps };
}

export function recordPlanOperationOutput(
  output: OperationCommandOutput,
  materialization: Pick<RecordPlanMaterialization, "steps">,
  options: {
    changeOffset?: number;
  } = {},
): OperationCommandOutput {
  const changeOffset = options.changeOffset ?? 0;
  if (output.changes.length !== changeOffset + materialization.steps.length) {
    throw new Error("Record plan output change count does not match step count.");
  }

  return {
    ...output,
    recordPlan: {
      steps: materialization.steps.map((step, index) => {
        const change = output.changes[changeOffset + index];

        if (!change) {
          throw new Error(`Record plan step "${step.name}" has no committed change.`);
        }

        return {
          name: step.name,
          kind: step.kind,
          entity: step.entity,
          recordId: change.recordId,
          changeId: String(change.seq),
        };
      }),
    },
  };
}

function immutableStoredRecordSnapshot(record: StoredRecord | undefined): StoredRecord | undefined {
  if (record === undefined) {
    return undefined;
  }

  return Object.freeze({
    ...record,
    values: Object.freeze({ ...record.values }),
  }) as StoredRecord;
}

function initialRecordPlanRecords(records: Iterable<StoredRecord> | undefined) {
  const recordsById = new Map<string, StoredRecord>();

  for (const record of records ?? []) {
    recordsById.set(record.id, record);
  }

  return recordsById;
}

function recordPlanWritePlanForStep(
  step: MaterializableRecordPlanStepSchema,
  state: RecordPlanPlanningState,
): RecordPlanStepPlan {
  if (step.kind === "create") {
    const recordId =
      step.recordId === undefined
        ? createRecordId()
        : evaluateRecordPlanRecordIdExpression(step.recordId, state);

    assertRecordPlanCreateIdAvailable(step, recordId, state);

    const recordWrite = validateRecordPlanStepWriteWithGeneratedCodeRetries(
      step,
      state,
      (values) => ({
        writeId: recordPlanStepWriteId(state.operationId, step.name),
        entity: step.entity,
        kind: "create",
        values,
      }),
    );

    if (recordWrite.kind !== "create") {
      throw new Error(`Record plan create step "${step.name}" did not produce create values.`);
    }

    const values = recordWrite.values;
    const record = {
      id: recordId,
      entity: step.entity,
      values,
      createdAt: state.envelope.receivedAt,
      updatedAt: state.envelope.receivedAt,
    } satisfies StoredRecord;

    recordPlanRecordWritten(step, record, state);

    return {
      plan: {
        kind: "create",
        entity: step.entity,
        id: recordId,
        values,
      },
      step: recordPlanStepMaterialization(step, recordId),
    };
  }

  if (step.kind === "patch") {
    const recordId = evaluateRecordPlanRecordIdExpression(step.recordId, state);
    const existingRecord = requireRecordPlanTargetRecord(step, recordId, state);
    const recordWrite = validateRecordPlanStepWriteWithGeneratedCodeRetries(
      step,
      state,
      (values) => ({
        writeId: recordPlanStepWriteId(state.operationId, step.name),
        entity: step.entity,
        kind: "patch",
        recordId,
        values,
      }),
    );

    if (!("recordValues" in recordWrite)) {
      throw new Error(`Record plan patch step "${step.name}" did not produce record values.`);
    }

    const record = {
      ...existingRecord,
      values: recordWrite.recordValues,
      updatedAt: state.envelope.receivedAt,
    } satisfies StoredRecord;

    recordPlanRecordWritten(step, record, state);

    return {
      plan: {
        kind: "patch",
        record: (writtenRecords) =>
          requireRecordPlanMaterializedTargetRecord(recordId, writtenRecords, state.storage),
        values: recordWrite.recordValues,
      },
      step: recordPlanStepMaterialization(step, recordId),
    };
  }

  const recordId = evaluateRecordPlanRecordIdExpression(step.recordId, state);
  const existingRecord = requireRecordPlanTargetRecord(step, recordId, state);
  validateRecordPlanStepWrite(step, state, {
    writeId: recordPlanStepWriteId(state.operationId, step.name),
    entity: step.entity,
    kind: "delete",
    recordId,
  });

  const record = {
    ...existingRecord,
    updatedAt: state.envelope.receivedAt,
    deletedAt: state.envelope.receivedAt,
  } satisfies StoredRecord;

  recordPlanRecordWritten(step, record, state);

  return {
    plan: {
      kind: step.kind,
      record: (writtenRecords) =>
        requireRecordPlanMaterializedTargetRecord(recordId, writtenRecords, state.storage),
    },
    step: recordPlanStepMaterialization(step, recordId),
  };
}

async function recordPlanWritePlanForStepAsync(
  step: MaterializableRecordPlanStepSchema,
  state: RecordPlanPlanningState,
  options: {
    identityReferenceResolver?: IdentityReferenceTargetResolver;
  },
): Promise<RecordPlanStepPlan> {
  if (step.kind === "create") {
    const recordId =
      step.recordId === undefined
        ? createRecordId()
        : evaluateRecordPlanRecordIdExpression(step.recordId, state);

    assertRecordPlanCreateIdAvailable(step, recordId, state);

    const recordWrite = await validateRecordPlanStepWriteWithGeneratedCodeRetriesAsync(
      step,
      state,
      (values) => ({
        writeId: recordPlanStepWriteId(state.operationId, step.name),
        entity: step.entity,
        kind: "create",
        values,
      }),
      options,
    );

    if (recordWrite.kind !== "create") {
      throw new Error(`Record plan create step "${step.name}" did not produce create values.`);
    }

    const values = recordWrite.values;
    const record = {
      id: recordId,
      entity: step.entity,
      values,
      createdAt: state.envelope.receivedAt,
      updatedAt: state.envelope.receivedAt,
    } satisfies StoredRecord;

    recordPlanRecordWritten(step, record, state);

    return {
      plan: {
        kind: "create",
        entity: step.entity,
        id: recordId,
        values,
      },
      step: recordPlanStepMaterialization(step, recordId),
    };
  }

  if (step.kind === "patch") {
    const recordId = evaluateRecordPlanRecordIdExpression(step.recordId, state);
    const existingRecord = requireRecordPlanTargetRecord(step, recordId, state);
    const recordWrite = await validateRecordPlanStepWriteWithGeneratedCodeRetriesAsync(
      step,
      state,
      (values) => ({
        writeId: recordPlanStepWriteId(state.operationId, step.name),
        entity: step.entity,
        kind: "patch",
        recordId,
        values,
      }),
      options,
    );

    if (!("recordValues" in recordWrite)) {
      throw new Error(`Record plan patch step "${step.name}" did not produce record values.`);
    }

    const record = {
      ...existingRecord,
      values: recordWrite.recordValues,
      updatedAt: state.envelope.receivedAt,
    } satisfies StoredRecord;

    recordPlanRecordWritten(step, record, state);

    return {
      plan: {
        kind: "patch",
        record: (writtenRecords) =>
          requireRecordPlanMaterializedTargetRecord(recordId, writtenRecords, state.storage),
        values: recordWrite.recordValues,
      },
      step: recordPlanStepMaterialization(step, recordId),
    };
  }

  const recordId = evaluateRecordPlanRecordIdExpression(step.recordId, state);
  const existingRecord = requireRecordPlanTargetRecord(step, recordId, state);
  await validateRecordPlanStepWriteAsync(
    step,
    state,
    {
      writeId: recordPlanStepWriteId(state.operationId, step.name),
      entity: step.entity,
      kind: "delete",
      recordId,
    },
    options,
  );

  const record = {
    ...existingRecord,
    updatedAt: state.envelope.receivedAt,
    deletedAt: state.envelope.receivedAt,
  } satisfies StoredRecord;

  recordPlanRecordWritten(step, record, state);

  return {
    plan: {
      kind: step.kind,
      record: (writtenRecords) =>
        requireRecordPlanMaterializedTargetRecord(recordId, writtenRecords, state.storage),
    },
    step: recordPlanStepMaterialization(step, recordId),
  };
}

function validateRecordPlanStepWrite(
  step: MaterializableRecordPlanStepSchema,
  state: RecordPlanPlanningState,
  recordWrite: CreateRecordWriteRequest | PatchRecordWriteRequest | DeleteRecordWriteRequest,
) {
  const result = validateRecordWriteRequest(
    recordWrite,
    state.schema,
    authorityStorageRecordValidationReader(state.storage),
    {
      additionalRecords: [...state.plannedRecordsById.values()],
      enforceGenericRecordWritePolicy: false,
      packageResolver: state.packageResolver,
    },
  );

  if ("outcome" in result) {
    throw new BadRequestError(
      `Record plan step "${step.name}" conflicts with an existing write identity.`,
    );
  }

  assertRecordPlanStepUniqueConstraints(state, result.recordWrite);

  return result.recordWrite;
}

function validateRecordPlanStepWriteWithGeneratedCodeRetries(
  step: MaterializableRecordPlanValuedStepSchema,
  state: RecordPlanPlanningState,
  recordWriteForValues: (
    values: RecordValues,
  ) => CreateRecordWriteRequest | PatchRecordWriteRequest,
) {
  const generatedCodeFields = recordPlanGeneratedCodeFields(step.values);
  const maxAttempts = generatedCodeFields.size === 0 ? 1 : generatedCodeMaxAttempts;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return validateRecordPlanStepWrite(
        step,
        state,
        recordWriteForValues(evaluateRecordPlanValues(step.values, state)),
      );
    } catch (error) {
      if (!shouldRetryGeneratedCodeCollision(error, step, state, generatedCodeFields)) {
        throw error;
      }

      lastError = error;
    }
  }

  throw generatedCodeCollisionExhaustedError(step, lastError);
}

async function validateRecordPlanStepWriteAsync(
  step: MaterializableRecordPlanStepSchema,
  state: RecordPlanPlanningState,
  recordWrite: CreateRecordWriteRequest | PatchRecordWriteRequest | DeleteRecordWriteRequest,
  options: {
    identityReferenceResolver?: IdentityReferenceTargetResolver;
  },
) {
  const result = await validateRecordWriteRequestAsync(
    recordWrite,
    state.schema,
    authorityStorageRecordValidationReader(state.storage),
    {
      additionalRecords: [...state.plannedRecordsById.values()],
      enforceGenericRecordWritePolicy: false,
      identityReferenceResolver: options.identityReferenceResolver,
      packageResolver: state.packageResolver,
    },
  );

  if ("outcome" in result) {
    throw new BadRequestError(
      `Record plan step "${step.name}" conflicts with an existing write identity.`,
    );
  }

  assertRecordPlanStepUniqueConstraints(state, result.recordWrite);

  return result.recordWrite;
}

function assertRecordPlanStepUniqueConstraints(
  state: RecordPlanPlanningState,
  recordWrite: CreateRecordWriteRequest | PatchRecordWriteRequest | DeleteRecordWriteRequest,
) {
  if (recordWrite.kind === "delete") {
    return;
  }

  const additionalRecords = [...state.plannedRecordsById.values()];

  if (recordWrite.kind === "create") {
    assertUniqueConstraints(state.storage, state.schema, recordWrite.entity, recordWrite.values, {
      additionalRecords,
    });
    return;
  }

  if (!("recordValues" in recordWrite)) {
    return;
  }

  assertUniqueConstraints(
    state.storage,
    state.schema,
    recordWrite.entity,
    recordWrite.recordValues as RecordValues,
    {
      additionalRecords,
      ignoreRecordId: recordWrite.recordId,
    },
  );
}

async function validateRecordPlanStepWriteWithGeneratedCodeRetriesAsync(
  step: MaterializableRecordPlanValuedStepSchema,
  state: RecordPlanPlanningState,
  recordWriteForValues: (
    values: RecordValues,
  ) => CreateRecordWriteRequest | PatchRecordWriteRequest,
  options: {
    identityReferenceResolver?: IdentityReferenceTargetResolver;
  },
) {
  const generatedCodeFields = recordPlanGeneratedCodeFields(step.values);
  const maxAttempts = generatedCodeFields.size === 0 ? 1 : generatedCodeMaxAttempts;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await validateRecordPlanStepWriteAsync(
        step,
        state,
        recordWriteForValues(evaluateRecordPlanValues(step.values, state)),
        options,
      );
    } catch (error) {
      if (!shouldRetryGeneratedCodeCollision(error, step, state, generatedCodeFields)) {
        throw error;
      }

      lastError = error;
    }
  }

  throw generatedCodeCollisionExhaustedError(step, lastError);
}

function recordPlanGeneratedCodeFields(
  values: Record<string, MaterializableRecordPlanValueExpressionSchema>,
): Set<string> {
  return new Set(
    Object.entries(values)
      .filter(([, expression]) => expression.kind === "generatedCode")
      .map(([fieldName]) => fieldName),
  );
}

function shouldRetryGeneratedCodeCollision(
  error: unknown,
  step: Pick<MaterializableRecordPlanStepSchema, "entity">,
  state: RecordPlanPlanningState,
  generatedCodeFields: ReadonlySet<string>,
): boolean {
  if (generatedCodeFields.size === 0 || !(error instanceof BadRequestError)) {
    return false;
  }

  const constraintName = uniqueConstraintViolationName(error.message, step.entity);
  const constraint =
    constraintName === undefined
      ? undefined
      : state.schema.entities
          .find((definition) => definition.key === step.entity)
          ?.constraints?.find((definition) => definition.key === constraintName);
  return (
    constraint?.kind === "unique" &&
    constraint.fields.some((fieldName) => generatedCodeFields.has(fieldName))
  );
}

function uniqueConstraintViolationName(message: string, entityName: string): string | undefined {
  const match = /^Unique constraint "([^"]+)" would be violated\.$/.exec(message);

  if (!match) {
    return undefined;
  }

  const prefix = `${entityName}.`;
  return match[1]?.startsWith(prefix) ? match[1].slice(prefix.length) : undefined;
}

function generatedCodeCollisionExhaustedError(
  step: Pick<MaterializableRecordPlanStepSchema, "name">,
  lastError: unknown,
) {
  if (lastError instanceof Error) {
    return new BadRequestError(
      `Record plan step "${step.name}" generated code collided after ${generatedCodeMaxAttempts} attempts: ${lastError.message}`,
    );
  }

  return new BadRequestError(
    `Record plan step "${step.name}" generated code collided after ${generatedCodeMaxAttempts} attempts.`,
  );
}

function evaluateRecordPlanValues(
  values: Record<string, MaterializableRecordPlanValueExpressionSchema>,
  state: RecordPlanPlanningState,
): RecordValues {
  const evaluated: RecordValues = {};

  for (const [fieldName, expression] of Object.entries(values)) {
    const result = evaluateRecordPlanValueExpression(expression, state);

    if (result.kind === "set") {
      evaluated[fieldName] = result.value;
    }
  }

  return evaluated;
}

function evaluateRecordPlanValueExpression(
  expression: MaterializableRecordPlanValueExpressionSchema,
  state: RecordPlanPlanningState,
):
  | {
      kind: "omit";
    }
  | {
      kind: "set";
      value: FieldValue;
    } {
  if (expression.kind === "reference") {
    const id = evaluateRecordPlanOptionalRecordIdExpression(expression.id, state);
    return id === undefined ? { kind: "omit" } : { kind: "set", value: id };
  }
  if (expression.kind === "input") {
    return Object.hasOwn(state.inputValues, expression.field)
      ? { kind: "set", value: state.inputValues[expression.field] as FieldValue }
      : { kind: "omit" };
  }

  if (expression.kind === "literal") {
    return { kind: "set", value: expression.value };
  }

  if (expression.kind === "generatedId") {
    return { kind: "set", value: createRecordPlanGeneratedId(expression.prefix) };
  }

  if (expression.kind === "generatedCode") {
    return { kind: "set", value: createRecordPlanGeneratedCode(expression) };
  }

  if (expression.kind === "generatedTimestamp") {
    return { kind: "set", value: state.envelope.receivedAt };
  }

  if (expression.kind === "targetRecordId") {
    return { kind: "set", value: requireRecordPlanTargetSnapshot(state).id };
  }

  if (expression.kind === "targetField") {
    const targetRecord = requireRecordPlanTargetSnapshot(state);

    return Object.hasOwn(targetRecord.values, expression.field)
      ? { kind: "set", value: targetRecord.values[expression.field] }
      : { kind: "omit" };
  }

  if (expression.kind === "actor") {
    return evaluateRecordPlanActorExpression(expression.field, state.envelope);
  }

  if (expression.kind === "source") {
    return evaluateRecordPlanSourceExpression(expression.field, state.envelope);
  }

  const stepRecord = requireRecordPlanStepOutput(expression.step, state);

  if (expression.output === "id") {
    return { kind: "set", value: stepRecord.id };
  }

  return Object.hasOwn(stepRecord.values, expression.field)
    ? { kind: "set", value: stepRecord.values[expression.field] }
    : { kind: "omit" };
}

function evaluateRecordPlanActorExpression(
  field: "mode" | "principalId",
  envelope: OperationInvocationEnvelope,
):
  | {
      kind: "omit";
    }
  | {
      kind: "set";
      value: FieldValue;
    } {
  if (field === "mode") {
    return { kind: "set", value: envelope.actor.kind };
  }

  const principalId = envelope.actor.principalId;
  return principalId === undefined ? { kind: "omit" } : { kind: "set", value: principalId };
}

function evaluateRecordPlanSourceExpression(
  field: "protocol" | "route" | "host" | "path",
  envelope: OperationInvocationEnvelope,
):
  | {
      kind: "omit";
    }
  | {
      kind: "set";
      value: FieldValue;
    } {
  const value = envelope.source[field];
  return value === undefined ? { kind: "omit" } : { kind: "set", value };
}
function evaluateRecordPlanRecordIdExpression(
  expression: MaterializableRecordPlanRecordIdExpressionSchema,
  state: RecordPlanPlanningState,
): string {
  const value = evaluateRecordPlanOptionalRecordIdExpression(expression, state);

  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequestError("Record plan record id expression must resolve to a string.");
  }

  return value;
}

function evaluateRecordPlanOptionalRecordIdExpression(
  expression: MaterializableRecordPlanRecordIdExpressionSchema,
  state: RecordPlanPlanningState,
): string | undefined {
  if (expression.kind === "input") {
    if (!Object.hasOwn(state.inputValues, expression.field)) {
      return undefined;
    }

    const value = state.inputValues[expression.field];

    if (typeof value !== "string") {
      throw new BadRequestError(
        `Record plan input field "${expression.field}" must resolve to a record id string.`,
      );
    }

    return value;
  }

  if (expression.kind === "literal") {
    if (typeof expression.value !== "string") {
      throw new BadRequestError("Record plan literal record id must be a string.");
    }

    return expression.value;
  }

  if (expression.kind === "generatedId") {
    return createRecordPlanGeneratedId(expression.prefix);
  }

  if (expression.kind === "targetRecordId") {
    return requireRecordPlanTargetSnapshot(state).id;
  }

  return requireRecordPlanStepOutput(expression.step, state).id;
}

function requireRecordPlanTargetSnapshot(state: RecordPlanPlanningState): StoredRecord {
  if (state.targetRecord === undefined) {
    throw new BadRequestError("Record plan target expression requires a stored target snapshot.");
  }

  return state.targetRecord;
}

function createRecordPlanGeneratedId(prefix: string | undefined) {
  if (prefix === undefined) {
    return createRecordId();
  }

  return `${prefix}_${crypto.randomUUID()}`;
}

function createRecordPlanGeneratedCode(expression: RecordPlanGeneratedCodeExpressionSchema) {
  const alphabet = generatedCodeAlphabets[expression.alphabet];
  const parts = generatedCodeSegmentLengths(expression).map((length) =>
    randomGeneratedCodeSegment(length, alphabet),
  );

  return `${expression.prefix ?? ""}${parts.join(expression.separator ?? "")}`;
}

function generatedCodeSegmentLengths(expression: RecordPlanGeneratedCodeExpressionSchema) {
  if (expression.groups !== undefined) {
    return expression.groups;
  }

  if (expression.length !== undefined) {
    return [expression.length];
  }

  throw new BadRequestError("Generated code expression requires length or groups.");
}

function randomGeneratedCodeSegment(length: number, alphabet: string) {
  let result = "";
  const maxAcceptedByte = 256 - (256 % alphabet.length);

  while (result.length < length) {
    const bytes = new Uint8Array(length - result.length);
    crypto.getRandomValues(bytes);

    for (const byte of bytes) {
      if (byte >= maxAcceptedByte) {
        continue;
      }

      result += alphabet[byte % alphabet.length];

      if (result.length === length) {
        break;
      }
    }
  }

  return result;
}

function assertRecordPlanCreateIdAvailable(
  step: MaterializableRecordPlanStepSchema,
  recordId: string,
  state: RecordPlanPlanningState,
) {
  if (state.plannedRecordsById.has(recordId) || getStoredRecord(state.storage, recordId)) {
    throw new BadRequestError(
      `Record plan step "${step.name}" creates duplicate record "${recordId}".`,
    );
  }
}

function requireRecordPlanTargetRecord(
  step: MaterializableRecordPlanStepSchema,
  recordId: string,
  state: RecordPlanPlanningState,
): StoredRecord {
  const record = state.plannedRecordsById.get(recordId) ?? getStoredRecord(state.storage, recordId);

  if (!record) {
    throw new BadRequestError(`Unknown record "${recordId}".`);
  }

  if (record.entity !== step.entity) {
    throw new BadRequestError("Record plan step entity must match the stored record entity.");
  }

  if (record.deletedAt) {
    throw new BadRequestError(`Cannot write tombstoned record "${recordId}".`);
  }

  return record;
}

function requireRecordPlanMaterializedTargetRecord(
  recordId: string,
  writtenRecords: StoredRecord[],
  storage: DurableObjectStorage,
): StoredRecord {
  const record =
    [...writtenRecords].reverse().find((candidate) => candidate.id === recordId) ??
    getStoredRecord(storage, recordId);

  if (!record) {
    throw new BadRequestError(`Unknown record "${recordId}".`);
  }

  return record;
}

function requireRecordPlanStepOutput(
  stepName: string,
  state: RecordPlanPlanningState,
): StoredRecord {
  const record = state.stepOutputs.get(stepName);

  if (!record) {
    throw new BadRequestError(`Record plan references unknown step "${stepName}".`);
  }

  return record;
}

function recordPlanRecordWritten(
  step: MaterializableRecordPlanStepSchema,
  record: StoredRecord,
  state: RecordPlanPlanningState,
) {
  state.plannedRecordsById.set(record.id, record);
  state.stepOutputs.set(step.name, record);
}

function recordPlanStepMaterialization(
  step: MaterializableRecordPlanStepSchema,
  recordId: string,
): RecordPlanStepMaterialization {
  return {
    name: step.name,
    kind: step.kind,
    entity: step.entity,
    recordId,
  };
}

function recordPlanStepWriteId(operationId: string, stepName: string) {
  return `${operationId}:${stepName}`;
}
