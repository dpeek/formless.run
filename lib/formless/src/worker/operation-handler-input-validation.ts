import {
  getOperationHandlerCapabilities,
  type OperationHandlerInputExpectation,
  type OperationHandlerInputFieldExpectation,
  type OperationHandlerInputStringRecordIdArrayExpectation,
  type OperationHandlerKind,
} from "@dpeek/formless-schema";
import type { RecordValues } from "@dpeek/formless-storage";
import { BadRequestError } from "./errors.ts";

export type CreateSelectedJoinRecordHandlerInput = {
  fromRecordId: string;
  toRecordId: string;
};

export type RemoveSelectedJoinRecordsHandlerInput = {
  recordIds: string[];
};

export type CreateTreeChildHandlerInput = {
  parentRecordId: string;
  childValues: RecordValues;
  placementValues?: RecordValues;
};

export type RemoveTreePlacementHandlerInput = {
  placementId: string;
};

export type SubscribeHandlerInput = {
  email: string;
};

export type TransitionStateHandlerInput = {
  recordId: string;
};

export type OperationHandlerInputValuesByKind = {
  "tombstone-query-results": undefined;
  "create-missing-join-records": undefined;
  "create-selected-join-record": CreateSelectedJoinRecordHandlerInput;
  "remove-selected-join-records": RemoveSelectedJoinRecordsHandlerInput;
  "create-tree-child": CreateTreeChildHandlerInput;
  "remove-tree-placement": RemoveTreePlacementHandlerInput;
  "contact-subscription.subscribe": SubscribeHandlerInput;
  "transition-state": TransitionStateHandlerInput;
};

type OperationHandlerInputValidationRequest<Kind extends OperationHandlerKind> = {
  canonicalOperationKey: string;
  handler: Kind;
  input: unknown;
};

type FieldValidationRequest = {
  canonicalOperationKey: string;
  expectation: OperationHandlerInputExpectation;
  fieldName: string;
  field: OperationHandlerInputFieldExpectation;
  handler: OperationHandlerKind;
  input: Record<string, unknown>;
};

export function validateOperationHandlerInputValues<Kind extends OperationHandlerKind>(
  request: OperationHandlerInputValidationRequest<Kind>,
): OperationHandlerInputValuesByKind[Kind] {
  const expectation = getOperationHandlerCapabilities(request.handler).input;

  if (!expectation) {
    return undefined as OperationHandlerInputValuesByKind[Kind];
  }

  return validateObjectInputExpectation({
    ...request,
    expectation,
  }) as OperationHandlerInputValuesByKind[Kind];
}

function validateObjectInputExpectation(
  request: OperationHandlerInputValidationRequest<OperationHandlerKind> & {
    expectation: OperationHandlerInputExpectation;
  },
): Record<string, unknown> {
  if (!isRecord(request.input)) {
    throw new BadRequestError(requiredInputMessage(request));
  }

  const values: Record<string, unknown> = {};

  for (const [fieldName, field] of Object.entries(request.expectation.fields)) {
    const value = validateInputField({
      ...request,
      fieldName,
      field,
      input: request.input,
    });

    if (value !== undefined) {
      values[fieldName] = value;
    }
  }

  return values;
}

function validateInputField(request: FieldValidationRequest): unknown {
  const hasValue = Object.hasOwn(request.input, request.fieldName);
  const value = request.input[request.fieldName];

  if (!hasValue || value === undefined) {
    if (request.field.required) {
      throw new BadRequestError(requiredInputMessage(request));
    }

    return undefined;
  }

  if (request.field.type === "stringRecordId") {
    return validateStringRecordId(request, value);
  }

  if (request.field.type === "stringRecordIdArray") {
    return validateStringRecordIdArray(request, value);
  }

  if (request.field.type === "scalarRecordValueMap") {
    return validateScalarRecordValueMap(request, value);
  }

  return validateText(request, value);
}

function validateStringRecordId(request: FieldValidationRequest, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequestError(
      `Operation "${request.canonicalOperationKey}" input ${request.fieldName} must be non-empty.`,
    );
  }

  return value;
}

function validateStringRecordIdArray(request: FieldValidationRequest, value: unknown): string[] {
  const field = request.field as OperationHandlerInputStringRecordIdArrayExpectation;

  if (!Array.isArray(value)) {
    throw new BadRequestError(requiredInputMessage(request));
  }

  if (field.nonEmpty && value.length === 0) {
    throw new BadRequestError(
      `Operation "${request.canonicalOperationKey}" input ${request.fieldName} must not be empty.`,
    );
  }

  const seen = new Set<string>();

  return value.map((recordId, index) => {
    if (typeof recordId !== "string" || recordId.trim() === "") {
      throw new BadRequestError(
        `Operation "${request.canonicalOperationKey}" input ${request.fieldName}[${index}] must be non-empty.`,
      );
    }

    if (field.rejectDuplicates && seen.has(recordId)) {
      throw new BadRequestError(
        `Operation "${request.canonicalOperationKey}" input ${request.fieldName} must not contain duplicates.`,
      );
    }

    seen.add(recordId);

    return recordId;
  });
}

function validateScalarRecordValueMap(
  request: FieldValidationRequest,
  value: unknown,
): RecordValues {
  if (!isRecord(value)) {
    if (request.field.required) {
      throw new BadRequestError(requiredInputMessage(request));
    }

    throw new BadRequestError(scalarRecordValueMapMessage(request));
  }

  if (!Object.values(value).every(isFieldValue)) {
    throw new BadRequestError(scalarRecordValueMapMessage(request));
  }

  return value as RecordValues;
}

function validateText(request: FieldValidationRequest, value: unknown): string {
  if (typeof value !== "string") {
    throw new BadRequestError(
      `Operation "${request.canonicalOperationKey}" input ${request.fieldName} must be text.`,
    );
  }

  return value;
}

function requiredInputMessage(request: {
  canonicalOperationKey: string;
  expectation: OperationHandlerInputExpectation;
}) {
  return `Operation "${request.canonicalOperationKey}" requires input with ${requiredFieldList(
    request.expectation,
  )}.`;
}

function requiredFieldList(expectation: OperationHandlerInputExpectation) {
  const fieldNames = Object.entries(expectation.fields)
    .filter(([, field]) => field.required)
    .map(([fieldName]) => fieldName);

  if (fieldNames.length < 2) {
    return fieldNames[0] ?? "declared fields";
  }

  return `${fieldNames.slice(0, -1).join(", ")} and ${fieldNames[fieldNames.length - 1]}`;
}

function scalarRecordValueMapMessage(request: FieldValidationRequest) {
  return `Operation "${request.canonicalOperationKey}" input ${request.fieldName} must contain scalar field values.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFieldValue(value: unknown): value is RecordValues[string] {
  return typeof value === "string" || typeof value === "boolean" || isFiniteNumber(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
