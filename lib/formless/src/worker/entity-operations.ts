import {
  defaultQueryEvaluationContext,
  isEntityOperationWriteKind,
  matchesQuery,
  type AppSchema,
  type OperationHandlerEntityOperationEffectSchema,
  type RecordPlanEntityOperationEffectSchema,
} from "@dpeek/formless-schema";
import type { AppPackageResolver } from "../shared/app-packages.ts";
import type { RecordValues, StoredRecord } from "@dpeek/formless-storage";
import type { PublicOperationProof } from "../shared/protocol.ts";
import type {
  OperationCommandOutput,
  OperationInvocationEnvelope,
  OperationInvocationOutput,
  OperationInvocationResponse,
} from "../shared/operation-invocation.ts";
import { assertUniqueConstraints } from "./constraints.ts";
import { BadRequestError } from "./errors.ts";
import {
  executeOperationHandlerCreateTriggers,
  executeOperationHandlerOutcome,
  prepareTransitionStateSideEffectHandlerOutcome,
} from "./operation-handlers.ts";
import { authorityStorageRecordValidationReader } from "./authority-record-validation-reader.ts";
import { validateRecordWriteRequestAsync } from "./authority-validation.ts";
import type { IdentityReferenceTargetResolver } from "./identity-reference-targets.ts";
import {
  validateOperationInvocationCommandHandlerInputValues,
  validateOperationInvocationListInputValues,
  validateOperationInvocationRecordWriteValues,
} from "./operation-input-validation.ts";
import {
  createStoredRecordOutcome,
  deleteStoredRecordOutcome,
  getActiveRecordsByEntity,
  getStoredRecord,
  mapWriteOutcome,
  patchStoredRecordOutcome,
  recordOperationInvocationAccepted,
  recordOperationInvocationFailed,
  recordOperationInvocationOutcome,
  type RecordConstraintValidator,
  type WriteOutcome,
  writeRecordSetForCommandOperationOutcome,
} from "./storage.ts";
import {
  executeWriteOperationInvocationLifecycle,
  type OperationInvocationLifecycleWriteNotifier,
} from "./operation-invocation-lifecycle.ts";
import type {
  CreateRecordWriteRequest,
  DeleteRecordWriteRequest,
  PatchRecordWriteRequest,
} from "./record-write-requests.ts";
import {
  materializeRecordPlanAsync,
  recordPlanCommandInput,
  recordPlanOperationOutput,
} from "./record-plan-materializer.ts";

type EntityOperationRoute = {
  entityName: string;
  operationName: string;
  recordId?: string;
};

const operationRoutePrefix = "/operations/";

export function parseEntityOperationRoute(input: {
  method: string;
  path: string;
  searchParams: URLSearchParams;
}): EntityOperationRoute | undefined {
  if (input.method !== "GET" && input.method !== "POST") {
    return undefined;
  }

  if (!input.path.startsWith(operationRoutePrefix)) {
    return undefined;
  }

  const segments = input.path.slice(operationRoutePrefix.length).split("/");

  if (segments.length !== 2 || !segments[0] || !segments[1]) {
    throw new BadRequestError("Operation route must use /operations/:entity/:operation.");
  }

  let entityName: string;
  let operationName: string;

  try {
    entityName = decodeURIComponent(segments[0]);
    operationName = decodeURIComponent(segments[1]);
  } catch {
    throw new BadRequestError("Operation route segments must be valid URL path text.");
  }

  if (entityName.trim() === "" || operationName.trim() === "") {
    throw new BadRequestError("Operation route entity and operation must be non-empty.");
  }

  const recordId = input.searchParams.get("recordId") ?? undefined;

  return {
    entityName,
    operationName,
    ...(recordId === undefined ? {} : { recordId: parseNonEmptyString("recordId", recordId) }),
  };
}

export function assertOperationInvocationAuthorized(envelope: OperationInvocationEnvelope) {
  const policy = envelope.operation.policy;
  const actorKind = envelope.actor.kind;
  const allowedActors = policy?.actors;
  const allowed =
    allowedActors === undefined ? actorKind !== "anonymous" : allowedActors.includes(actorKind);

  if (!allowed) {
    throw new BadRequestError(authorizationErrorMessage(envelope));
  }

  if (actorKind === "anonymous" && policy?.access === undefined) {
    throw new BadRequestError(authorizationErrorMessage(envelope));
  }

  if (actorKind === "authenticated") {
    assertAuthenticatedOperationActor(envelope);
  }
}

function assertAuthenticatedOperationActor(envelope: OperationInvocationEnvelope) {
  const actor = envelope.actor;
  const target = actor.sessionTarget;

  if (
    typeof actor.principalId !== "string" ||
    actor.principalId.trim() === "" ||
    target === undefined ||
    typeof target.instanceId !== "string" ||
    target.instanceId.trim() === "" ||
    typeof target.routeId !== "string" ||
    target.routeId.trim() === "" ||
    typeof target.targetOrigin !== "string" ||
    target.targetOrigin.trim() === "" ||
    typeof target.targetProfile !== "string" ||
    target.targetProfile.trim() === "" ||
    (target.appInstallId === undefined && target.storageIdentity === undefined) ||
    (target.appInstallId !== undefined &&
      (typeof target.appInstallId !== "string" || target.appInstallId.trim() === "")) ||
    (target.storageIdentity !== undefined &&
      (typeof target.storageIdentity !== "string" || target.storageIdentity.trim() === ""))
  ) {
    throw new BadRequestError(
      `Operation "${envelope.operation.canonicalKey}" requires authenticated actor facts.`,
    );
  }
}

export function executeReadOperationInvocation(input: {
  envelope: OperationInvocationEnvelope;
  schema: AppSchema;
  storage: DurableObjectStorage;
}): OperationInvocationResponse {
  const { envelope } = input;

  recordOperationInvocationAccepted(input.storage, envelope);

  try {
    const response = executeReadOperationInvocationResponse(input);

    recordOperationInvocationOutcome(input.storage, {
      envelope,
      output: response.output,
      status: response.status,
    });

    return response;
  } catch (error) {
    recordOperationInvocationFailed(input.storage, envelope, error);
    throw error;
  }
}

function executeReadOperationInvocationResponse(input: {
  envelope: OperationInvocationEnvelope;
  schema: AppSchema;
  storage: DurableObjectStorage;
}): OperationInvocationResponse {
  if (input.envelope.operation.kind === "list") {
    return executeListOperationInvocation(input);
  }

  if (input.envelope.operation.kind === "get") {
    return executeGetOperationInvocation(input);
  }

  throw new BadRequestError(
    `Operation "${input.envelope.operation.canonicalKey}" is not a read operation.`,
  );
}

function executeListOperationInvocation(input: {
  envelope: OperationInvocationEnvelope;
  schema: AppSchema;
  storage: DurableObjectStorage;
}): OperationInvocationResponse {
  const { envelope } = input;
  const output = envelope.operation.output;
  const queryName = output.type === "list" ? output.query : undefined;
  const query = queryName === undefined ? undefined : input.schema.queries[queryName];

  if (!query) {
    throw new BadRequestError(
      `Operation "${envelope.operation.canonicalKey}" references unknown query.`,
    );
  }

  if (envelope.input.type !== "list") {
    throw new BadRequestError(
      `Operation "${envelope.operation.canonicalKey}" requires list input.`,
    );
  }

  const queryContext = {
    ...defaultQueryEvaluationContext(),
    values: validateOperationInvocationListInputValues({
      envelope,
      rawInput: envelope.input.input,
      schema: input.schema,
      storage: input.storage,
    }),
  };
  const matchingRecords = getActiveRecordsByEntity(input.storage, query.entity).filter((record) =>
    matchesQuery(record, query.expression, queryContext),
  );
  const records =
    output.type === "list" && output.maxResults !== undefined
      ? matchingRecords.slice(0, output.maxResults)
      : matchingRecords;

  return {
    invocation: envelope,
    output: { type: "list", records },
    status: "accepted",
  };
}

function executeGetOperationInvocation(input: {
  envelope: OperationInvocationEnvelope;
  storage: DurableObjectStorage;
}): OperationInvocationResponse {
  const { envelope } = input;

  if (envelope.input.type !== "get") {
    throw new BadRequestError(
      `Operation "${envelope.operation.canonicalKey}" requires a record id.`,
    );
  }

  const record = getStoredRecord(input.storage, envelope.input.recordId);

  if (!record || record.deletedAt || record.entity !== envelope.operation.entityName) {
    throw new BadRequestError(`Unknown active record "${envelope.input.recordId}".`);
  }

  return {
    invocation: envelope,
    output: { type: "get", record },
    status: "accepted",
  };
}

export async function executeWriteOperationInvocation(input: {
  envelope: OperationInvocationEnvelope;
  identityReferenceResolver?: IdentityReferenceTargetResolver;
  packageResolver?: AppPackageResolver;
  schema: AppSchema;
  storage: DurableObjectStorage;
  validateConstraints?: RecordConstraintValidator;
  writes: OperationInvocationLifecycleWriteNotifier;
}): Promise<OperationInvocationResponse> {
  return executeWriteOperationInvocationLifecycle({
    envelope: input.envelope,
    prepareExecute: () =>
      prepareWriteOperationInvocationOutcome(
        input.storage,
        input.envelope,
        input.schema,
        input.identityReferenceResolver,
        input.packageResolver,
        input.validateConstraints,
      ),
    storage: input.storage,
    writes: input.writes,
  });
}

async function prepareWriteOperationInvocationOutcome(
  storage: DurableObjectStorage,
  envelope: OperationInvocationEnvelope,
  schema: AppSchema,
  identityReferenceResolver?: IdentityReferenceTargetResolver,
  packageResolver?: AppPackageResolver,
  validateConstraints?: RecordConstraintValidator,
): Promise<() => WriteOutcome<OperationInvocationOutput>> {
  if (!isEntityOperationWriteKind(envelope.operation.kind)) {
    throw new BadRequestError(
      `Operation "${envelope.operation.canonicalKey}" is not a write operation.`,
    );
  }

  if (envelope.operation.kind === "command") {
    return prepareCommandOperationInvocationOutcome(
      storage,
      envelope,
      schema,
      identityReferenceResolver,
      packageResolver,
      validateConstraints,
    );
  }

  if (envelope.operation.kind === "create") {
    return prepareCreateOperationInvocationOutcome(
      storage,
      envelope,
      schema,
      identityReferenceResolver,
      packageResolver,
      validateConstraints,
    );
  }

  if (envelope.operation.kind === "update") {
    return prepareUpdateOperationInvocationOutcome(
      storage,
      envelope,
      schema,
      identityReferenceResolver,
      packageResolver,
      validateConstraints,
    );
  }

  return prepareDeleteOperationInvocationOutcome(storage, envelope, schema, packageResolver);
}

async function prepareCreateOperationInvocationOutcome(
  storage: DurableObjectStorage,
  envelope: OperationInvocationEnvelope,
  schema: AppSchema,
  identityReferenceResolver?: IdentityReferenceTargetResolver,
  packageResolver?: AppPackageResolver,
  validateConstraints?: RecordConstraintValidator,
): Promise<() => WriteOutcome<OperationInvocationOutput>> {
  const validateRecordConstraints = operationRecordConstraintValidator(
    storage,
    schema,
    validateConstraints,
  );
  const validatedRecordWrite = await validateOperationRecordWriteRequest(
    operationCreateRecordWriteRequest(envelope, schema, storage),
    schema,
    storage,
    { identityReferenceResolver, packageResolver },
  );

  if ("outcome" in validatedRecordWrite) {
    return () =>
      mapWriteOutcome(validatedRecordWrite.outcome, (response) =>
        recordWriteOperationOutput(envelope, response),
      );
  }

  const recordWrite = validatedRecordWrite.recordWrite;

  if (recordWrite.kind !== "create") {
    throw new Error(`Operation "${envelope.operation.canonicalKey}" did not produce a create.`);
  }

  return () =>
    mapWriteOutcome(
      createStoredRecordOutcome(
        storage,
        recordWrite,
        (context) => {
          executeOperationHandlerCreateTriggers(
            context.storage,
            context.request,
            schema,
            context.createRecords,
          );
        },
        validateRecordConstraints,
        { allowStoredReplay: false, now: envelope.receivedAt },
      ),
      (response) => recordWriteOperationOutput(envelope, response),
    );
}

async function prepareUpdateOperationInvocationOutcome(
  storage: DurableObjectStorage,
  envelope: OperationInvocationEnvelope,
  schema: AppSchema,
  identityReferenceResolver?: IdentityReferenceTargetResolver,
  packageResolver?: AppPackageResolver,
  validateConstraints?: RecordConstraintValidator,
): Promise<() => WriteOutcome<OperationInvocationOutput>> {
  const validateRecordConstraints = operationRecordConstraintValidator(
    storage,
    schema,
    validateConstraints,
  );
  const validatedRecordWrite = await validateOperationRecordWriteRequest(
    operationPatchRecordWriteRequest(envelope, schema, storage),
    schema,
    storage,
    { identityReferenceResolver, packageResolver },
  );

  if ("outcome" in validatedRecordWrite) {
    return () =>
      mapWriteOutcome(validatedRecordWrite.outcome, (response) =>
        recordWriteOperationOutput(envelope, response),
      );
  }

  const recordWrite = validatedRecordWrite.recordWrite;

  if (!("recordValues" in recordWrite)) {
    throw new Error(`Operation "${envelope.operation.canonicalKey}" did not produce an update.`);
  }

  return () =>
    mapWriteOutcome(
      patchStoredRecordOutcome(
        storage,
        recordWrite,
        recordWrite.recordValues,
        validateRecordConstraints,
        {
          allowStoredReplay: false,
          now: envelope.receivedAt,
        },
      ),
      (response) => recordWriteOperationOutput(envelope, response),
    );
}

async function prepareDeleteOperationInvocationOutcome(
  storage: DurableObjectStorage,
  envelope: OperationInvocationEnvelope,
  schema: AppSchema,
  packageResolver?: AppPackageResolver,
): Promise<() => WriteOutcome<OperationInvocationOutput>> {
  const validatedRecordWrite = await validateOperationRecordWriteRequest(
    operationDeleteRecordWriteRequest(envelope),
    schema,
    storage,
    { packageResolver },
  );

  if ("outcome" in validatedRecordWrite) {
    return () =>
      mapWriteOutcome(validatedRecordWrite.outcome, (response) =>
        recordWriteOperationOutput(envelope, response),
      );
  }

  const recordWrite = validatedRecordWrite.recordWrite;

  if (recordWrite.kind !== "delete") {
    throw new Error(`Operation "${envelope.operation.canonicalKey}" did not produce a delete.`);
  }

  return () =>
    mapWriteOutcome(
      deleteStoredRecordOutcome(storage, recordWrite, {
        allowStoredReplay: false,
        now: envelope.receivedAt,
      }),
      (response) => recordWriteOperationOutput(envelope, response),
    );
}

function validateOperationRecordWriteRequest(
  recordWrite: unknown,
  schema: AppSchema,
  storage: DurableObjectStorage,
  options: {
    identityReferenceResolver?: IdentityReferenceTargetResolver;
    packageResolver?: AppPackageResolver;
  } = {},
) {
  return validateRecordWriteRequestAsync(
    recordWrite,
    schema,
    authorityStorageRecordValidationReader(storage),
    {
      allowStoredReplay: false,
      enforceGenericRecordWritePolicy: false,
      identityReferenceResolver: options.identityReferenceResolver,
      packageResolver: options.packageResolver,
    },
  );
}

async function prepareCommandOperationInvocationOutcome(
  storage: DurableObjectStorage,
  envelope: OperationInvocationEnvelope,
  schema: AppSchema,
  identityReferenceResolver?: IdentityReferenceTargetResolver,
  packageResolver?: AppPackageResolver,
  validateConstraints?: RecordConstraintValidator,
): Promise<() => WriteOutcome<OperationInvocationOutput>> {
  if (envelope.operation.effect?.type === "recordPlan") {
    return prepareRecordPlanOperationInvocationOutcome(
      storage,
      envelope,
      schema,
      envelope.operation.effect,
      identityReferenceResolver,
      packageResolver,
      validateConstraints,
    );
  }

  const commandEffect = operationHandlerEffect(envelope);

  if (commandEffect === undefined) {
    throw new BadRequestError(
      `Operation "${envelope.operation.canonicalKey}" requires an operation handler effect.`,
    );
  }

  const commandInput =
    envelope.actor.kind === "anonymous"
      ? publicCommandOperationPayload(envelope).input
      : privateCommandOperationInput(envelope, schema, storage);

  if (
    commandEffect.handler === "transition-state" &&
    commandEffect.config.sideEffects !== undefined
  ) {
    const execute = await prepareTransitionStateSideEffectHandlerOutcome(
      {
        storage,
        envelope,
        schema,
        effect: commandEffect,
        ...(commandInput === undefined ? {} : { input: commandInput }),
        ...(validateConstraints === undefined ? {} : { validateConstraints }),
      },
      {
        ...(identityReferenceResolver === undefined ? {} : { identityReferenceResolver }),
        ...(packageResolver === undefined ? {} : { packageResolver }),
      },
    );

    return () =>
      mapWriteOutcome(execute(), (response) =>
        filterCommandOperationOutputForActor(response, envelope),
      );
  }

  return () =>
    mapWriteOutcome(
      executeOperationHandlerOutcome({
        storage,
        envelope,
        schema,
        effect: commandEffect,
        ...(commandInput === undefined ? {} : { input: commandInput }),
        ...(validateConstraints === undefined ? {} : { validateConstraints }),
      }),
      (response) => filterCommandOperationOutputForActor(response, envelope),
    );
}

function operationHandlerEffect(
  envelope: OperationInvocationEnvelope,
): OperationHandlerEntityOperationEffectSchema | undefined {
  const effect = envelope.operation.effect;

  return effect?.type === "operationHandler" ? effect : undefined;
}

async function prepareRecordPlanOperationInvocationOutcome(
  storage: DurableObjectStorage,
  envelope: OperationInvocationEnvelope,
  schema: AppSchema,
  effect: RecordPlanEntityOperationEffectSchema,
  identityReferenceResolver?: IdentityReferenceTargetResolver,
  packageResolver?: AppPackageResolver,
  validateConstraints?: RecordConstraintValidator,
): Promise<() => WriteOutcome<OperationInvocationOutput>> {
  const operationId = requiredWriteIdentity(envelope);
  const inputValues = recordPlanCommandInput({ envelope, schema, storage });
  const materialization = await materializeRecordPlanAsync({
    storage,
    envelope,
    schema,
    effect,
    identityReferenceResolver,
    inputValues,
    operationId,
    packageResolver,
    plannedRecords: [],
  });

  return () =>
    mapWriteOutcome(
      writeRecordSetForCommandOperationOutcome(
        storage,
        operationId,
        materialization.plans,
        operationRecordConstraintValidator(storage, schema, validateConstraints),
        { allowStoredReplay: false, now: envelope.receivedAt },
      ),
      (response) =>
        filterCommandOperationOutputForActor(
          recordPlanOperationOutput(response, materialization),
          envelope,
        ),
    );
}

function operationRecordConstraintValidator(
  storage: DurableObjectStorage,
  schema: AppSchema,
  validateConstraints: RecordConstraintValidator | undefined,
): RecordConstraintValidator {
  return (entity, values, options) => {
    validateConstraints?.(entity, values, options);
    assertUniqueConstraints(storage, schema, entity, values, options);
  };
}

function privateCommandOperationInput(
  envelope: OperationInvocationEnvelope,
  schema: AppSchema,
  storage: DurableObjectStorage,
): unknown {
  if (envelope.input.type !== "command") {
    throw new BadRequestError(
      `Operation "${envelope.operation.canonicalKey}" requires command input.`,
    );
  }

  const commandInput = validateOperationInvocationCommandHandlerInputValues({
    envelope,
    rawInput: envelope.input.input ?? {},
    schema,
    storage,
  });

  return commandInputWithRecordId(envelope, commandInput);
}

function commandInputWithRecordId(envelope: OperationInvocationEnvelope, input: unknown): unknown {
  if (envelope.input.type !== "command" || envelope.input.recordId === undefined) {
    return input;
  }

  if (input === undefined) {
    return { recordId: envelope.input.recordId };
  }

  const values = parseRecord("Operation command input", input);

  if (Object.hasOwn(values, "recordId")) {
    return values;
  }

  return { ...values, recordId: envelope.input.recordId };
}

function publicCommandOperationPayload(envelope: OperationInvocationEnvelope): {
  input: RecordValues;
  proof: PublicOperationProof;
} {
  if (envelope.input.type !== "command") {
    throw new BadRequestError(
      `Operation "${envelope.operation.canonicalKey}" requires command input.`,
    );
  }

  const value = parseRecord("Public operation command input", envelope.input.input);
  const input = parseRecord("Public operation input", value.input) as RecordValues;
  const proof = parsePublicOperationProof(value.proof);

  return { input, proof };
}

function parsePublicOperationProof(value: unknown): PublicOperationProof {
  const proof = parseRecord("Public operation proof", value);

  if (proof.kind !== "turnstile" || typeof proof.token !== "string") {
    throw new BadRequestError("Public operation proof must include a Turnstile token.");
  }

  return {
    kind: "turnstile",
    token: proof.token,
    ...(isRecord(proof.verification)
      ? { verification: proof.verification as PublicOperationProof["verification"] }
      : {}),
  };
}

type RecordWriteMaterializerOutput = {
  record: StoredRecord;
  changes: OperationCommandOutput["changes"];
  cursor: number;
};

function filterCommandOperationOutputForActor(
  output: OperationCommandOutput,
  envelope: OperationInvocationEnvelope,
): OperationCommandOutput {
  const allowedFields = envelope.operation.policy?.responseFields?.[envelope.actor.kind];

  if (allowedFields === undefined) {
    if (envelope.actor.kind === "anonymous" && envelope.source.protocol === "public") {
      return { ...output, changes: [] };
    }

    return output;
  }

  const allowedFieldSet = new Set(allowedFields);

  return {
    ...output,
    changes: output.changes.map((change) => ({
      ...change,
      payload: {
        ...change.payload,
        values: Object.fromEntries(
          Object.entries(change.payload.values).filter(([fieldName]) =>
            allowedFieldSet.has(fieldName),
          ),
        ),
      },
    })),
  };
}

function recordWriteOperationOutput(
  envelope: OperationInvocationEnvelope,
  output: RecordWriteMaterializerOutput,
): OperationInvocationOutput {
  if (envelope.operation.kind === "create") {
    return {
      affectedChangeIds: affectedChangeIds(output.changes),
      changes: output.changes,
      cursor: output.cursor,
      record: output.record,
      type: "create",
    };
  }

  if (envelope.operation.kind === "update") {
    return {
      affectedChangeIds: affectedChangeIds(output.changes),
      changes: output.changes,
      cursor: output.cursor,
      record: output.record,
      type: "update",
    };
  }

  if (envelope.operation.kind === "delete") {
    return {
      affectedChangeIds: affectedChangeIds(output.changes),
      changes: output.changes,
      cursor: output.cursor,
      recordId: output.record.id,
      type: "delete",
    };
  }

  throw new Error(
    `Operation "${envelope.operation.canonicalKey}" is not a record write operation.`,
  );
}

function affectedChangeIds(changes: OperationCommandOutput["changes"]) {
  return changes.map((change) => String(change.seq));
}

function operationCreateRecordWriteRequest(
  envelope: OperationInvocationEnvelope,
  schema: AppSchema,
  storage: DurableObjectStorage,
) {
  const writeId = requiredWriteIdentity(envelope);

  if (envelope.operation.kind === "create" && envelope.input.type === "create") {
    return {
      writeId,
      entity: envelope.operation.entityName,
      kind: "create",
      values: validateOperationInvocationRecordWriteValues({
        envelope,
        rawInput: envelope.input.values,
        schema,
        storage,
      }),
    } satisfies Omit<CreateRecordWriteRequest, "values"> & { values: unknown };
  }

  throw new BadRequestError(
    `Operation "${envelope.operation.canonicalKey}" cannot materialize a create.`,
  );
}

function operationPatchRecordWriteRequest(
  envelope: OperationInvocationEnvelope,
  schema: AppSchema,
  storage: DurableObjectStorage,
) {
  const writeId = requiredWriteIdentity(envelope);

  if (envelope.operation.kind === "update" && envelope.input.type === "update") {
    return {
      writeId,
      entity: envelope.operation.entityName,
      kind: "patch",
      recordId: envelope.input.recordId,
      values: validateOperationInvocationRecordWriteValues({
        envelope,
        rawInput: envelope.input.values,
        schema,
        storage,
      }),
    } satisfies Omit<PatchRecordWriteRequest, "values"> & { values: unknown };
  }

  throw new BadRequestError(
    `Operation "${envelope.operation.canonicalKey}" cannot materialize an update.`,
  );
}

function operationDeleteRecordWriteRequest(envelope: OperationInvocationEnvelope) {
  const writeId = requiredWriteIdentity(envelope);

  if (envelope.operation.kind === "delete" && envelope.input.type === "delete") {
    return {
      writeId,
      entity: envelope.operation.entityName,
      kind: "delete",
      recordId: envelope.input.recordId,
    } satisfies DeleteRecordWriteRequest;
  }

  throw new BadRequestError(
    `Operation "${envelope.operation.canonicalKey}" cannot materialize a delete.`,
  );
}

function requiredWriteIdentity(envelope: OperationInvocationEnvelope) {
  if (!envelope.idempotency.writeIdentity) {
    throw new BadRequestError(
      `Operation "${envelope.operation.canonicalKey}" requires an idempotency key.`,
    );
  }

  return envelope.idempotency.writeIdentity;
}

function authorizationErrorMessage(envelope: OperationInvocationEnvelope) {
  return `Operation "${envelope.operation.canonicalKey}" is not exposed to actor "${envelope.actor.kind}".`;
}

function parseRecord(context: string, value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BadRequestError(`${context} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseNonEmptyString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequestError(`${context} must be a non-empty string.`);
  }

  return value;
}
