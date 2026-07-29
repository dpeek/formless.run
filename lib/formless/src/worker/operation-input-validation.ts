import {
  formatEntityOperationKey,
  isSupportedIdentityReferenceTarget,
  projectOperationInputValues,
  type AppSchema,
  type EntityOperationSchema,
  type EntitySchema,
  type OperationInputValueProjection,
} from "@dpeek/formless-schema";
import type { RecordValues } from "@dpeek/formless-storage";
import type { OperationInvocationEnvelope } from "../shared/operation-invocation.ts";
import { authorityStorageRecordValidationReader } from "./authority-record-validation-reader.ts";
import { validateRecordValues } from "./authority-validation.ts";
import { BadRequestError } from "./errors.ts";

type OperationInputValidationBaseRequest = {
  context?: string;
  rawInput: unknown;
  schema: AppSchema;
  storage: DurableObjectStorage;
};

export type PublicOperationInputValidationRequest = OperationInputValidationBaseRequest & {
  entityName: string;
  operation: EntityOperationSchema;
  operationName: string;
};

export type OperationEnvelopeInputValidationRequest = OperationInputValidationBaseRequest & {
  envelope: OperationInvocationEnvelope;
};

type OperationInputValidationRequest =
  | PublicOperationInputValidationRequest
  | OperationEnvelopeInputValidationRequest;

type NormalizedOperationInputValidationRequest = OperationInputValidationBaseRequest & {
  canonicalKey: string;
  context: string;
  entityName: string;
  operation: EntityOperationSchema;
  operationName: string;
};

export function validateOperationInvocationRecordWriteValues(
  input: OperationEnvelopeInputValidationRequest,
): Record<string, unknown> {
  const { projection, request } = validateWorkerOperationInputValues(input);

  if (request.operation.kind !== "update") {
    return projection.recordWriteValues;
  }

  return projection.recordWritePatchValues;
}

export function validateOperationInvocationListInputValues(
  input: OperationEnvelopeInputValidationRequest,
): RecordValues {
  const { projection } = validateWorkerOperationInputValues(input);

  return projection.operationInputValues;
}

export function validateOperationInvocationRecordPlanInputValues(
  input: OperationEnvelopeInputValidationRequest,
): RecordValues {
  const { projection } = validateWorkerOperationInputValues(input);

  return projection.operationInputValues;
}

export function validateOperationInvocationCommandHandlerInputValues(
  input: OperationEnvelopeInputValidationRequest,
): unknown {
  const request = normalizeOperationInputValidationRequest(input);

  if (!request.operation.input) {
    return request.rawInput;
  }

  const { projection } = validateNormalizedWorkerOperationInputValues(request);

  return projection.operationInputValues;
}

export function validatePublicOperationInputValues(
  input: PublicOperationInputValidationRequest,
): RecordValues {
  const { projection } = validateWorkerOperationInputValues(input);

  return projection.operationInputValues;
}

function normalizeOperationInputValidationRequest(
  input: OperationInputValidationRequest,
): NormalizedOperationInputValidationRequest {
  if ("envelope" in input) {
    return {
      context: input.context ?? "Operation input",
      entityName: input.envelope.operation.entityName,
      operation: input.envelope.schemaOperation,
      operationName: input.envelope.operation.operationName,
      rawInput: input.rawInput,
      schema: input.schema,
      storage: input.storage,
      canonicalKey: input.envelope.operation.canonicalKey,
    };
  }

  return {
    ...input,
    context: input.context ?? "Operation input",
    canonicalKey: operationCanonicalKey({
      entityName: input.entityName,
      operationName: input.operationName,
    }),
  };
}

function operationCanonicalKey(route: { entityName: string; operationName: string }) {
  return formatEntityOperationKey({
    entityKey: route.entityName,
    operationKey: route.operationName,
  });
}

function validateWorkerOperationInputValues(input: OperationInputValidationRequest): {
  projection: OperationInputValueProjection;
  request: NormalizedOperationInputValidationRequest;
} {
  const request = normalizeOperationInputValidationRequest(input);

  return {
    ...validateNormalizedWorkerOperationInputValues(request),
    request,
  };
}

function validateNormalizedWorkerOperationInputValues(
  request: NormalizedOperationInputValidationRequest,
): {
  projection: OperationInputValueProjection;
} {
  const projection = projectWorkerOperationInputValues(request);
  assertStorageBackedOperationInputValues(request, projection.recordWriteValues);

  return { projection };
}

function projectWorkerOperationInputValues(
  request: NormalizedOperationInputValidationRequest,
): OperationInputValueProjection {
  try {
    return projectOperationInputValues({
      canonicalOperationKey: request.canonicalKey,
      context: request.context,
      entity: operationInputValidationEntity(request),
      operation: request.operation,
      rawInput: request.rawInput,
    });
  } catch (error) {
    if (error instanceof BadRequestError) {
      throw error;
    }

    throw new BadRequestError(
      error instanceof Error ? error.message : "Operation input is invalid.",
    );
  }
}

function operationInputValidationEntity(
  request: NormalizedOperationInputValidationRequest,
): Pick<EntitySchema, "fields"> {
  const entity = request.schema.entities.find(
    (definition) => definition.key === request.entityName,
  )!;
  if (entity) {
    return entity;
  }
  if (!request.operation.input) {
    return { fields: [] };
  }
  throw new BadRequestError(`Unknown entity "${request.entityName}".`);
}
function assertStorageBackedOperationInputValues(
  request: NormalizedOperationInputValidationRequest,
  recordWriteValues: RecordValues,
) {
  const inputContract = request.operation.input;

  if (!inputContract) {
    return;
  }
  const entity = request.schema.entities.find(
    (definition) => definition.key === request.entityName,
  )!;
  if (!entity) {
    throw new BadRequestError(`Unknown entity "${request.entityName}".`);
  }
  for (const field of inputContract.fields) {
    if (!("field" in field) || !Object.hasOwn(recordWriteValues, field.field)) {
      continue;
    }
    const entityField = entity.fields.find((definition) => definition.key === field.field)!;
    if (!entityField) {
      continue;
    }

    if (entityField.type === "reference" && isSupportedIdentityReferenceTarget(entityField.to)) {
      continue;
    }

    validateRecordValues(
      { [field.field]: recordWriteValues[field.field] },
      {
        ...entity,
        fields: [
          {
            ...entityField,
            required: field.required ?? false,
          },
        ],
      },
      authorityStorageRecordValidationReader(request.storage),
    );
  }
}
