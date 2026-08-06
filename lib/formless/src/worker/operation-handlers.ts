import type { RecordValues, StoredRecord } from "@dpeek/formless-storage";
import type {
  AppSchema,
  EntityOperationKind,
  EntitySchema,
  ManyToManyRelationshipSchema,
  OperationHandlerEffectSchemaForKind,
  OperationHandlerEntityOperationEffectSchema,
  OperationHandlerKind,
  StateMachineTransitionEventFieldMappingsSchema,
  ToManyRelationshipSchema,
} from "@dpeek/formless-schema";
import { fieldCreateDefaultValue, matchesQuery } from "@dpeek/formless-schema";
import { nowIsoString } from "../shared/clock.ts";
import { createRecordId } from "../shared/ids.ts";
import type { ProgramSharedOperationAdapterDefinition } from "../program/composition.ts";
import type {
  OperationCommandOutput,
  OperationInvocationEnvelope,
} from "../shared/operation-invocation.ts";
import type { CreateRecordWriteRequest } from "./record-write-requests.ts";
import { authorityStorageRecordValidationReader } from "./authority-record-validation-reader.ts";
import { validateRecordValues } from "./authority-validation.ts";
import { assertUniqueConstraints } from "./constraints.ts";
import { BadRequestError } from "./errors.ts";
import type { IdentityReferenceTargetResolver } from "./identity-reference-targets.ts";
import {
  validateOperationHandlerInputValues,
  type OperationHandlerInputValuesByKind,
} from "./operation-handler-input-validation.ts";
import {
  getActiveRecordsByEntity,
  getStoredRecord,
  mapWriteOutcome,
  type OperationRecordWritePlan,
  type CreateRecordWriteSideEffectRecordCreator,
  type RecordConstraintValidator,
  type WriteOutcome,
  writeRecordSetForCommandOperationOutcome,
} from "./storage.ts";
import {
  materializeGeneratedDateExpression,
  materializeRecordPlanAsync,
  recordPlanCommandInput,
  recordPlanOperationOutput,
} from "./record-plan-materializer.ts";
import {
  assertActiveOperationTargetSnapshot,
  immutableOperationTargetSnapshot,
} from "./operation-target-snapshot.ts";

export type OperationHandlerExecutionContext = {
  storage: DurableObjectStorage;
  envelope: OperationInvocationEnvelope;
  schema: AppSchema;
  effect: OperationHandlerEntityOperationEffectSchema;
  input?: unknown;
  validateConstraints?: RecordConstraintValidator;
};

type OperationHandlerCreateTriggerContext = {
  storage: DurableObjectStorage;
  recordWrite: CreateRecordWriteRequest;
  schema: AppSchema;
  entityName: string;
  operationName: string;
  effect: OperationHandlerEntityOperationEffectSchema;
  createRecords: CreateRecordWriteSideEffectRecordCreator;
};

type OperationHandlerModule = {
  kind: OperationHandlerKind;
  execute: (context: OperationHandlerExecutionContext) => WriteOutcome<OperationCommandOutput>;
  executeCreateTrigger: (context: OperationHandlerCreateTriggerContext) => void;
};

const operationHandlerModules: Partial<Record<OperationHandlerKind, OperationHandlerModule>> = {
  "tombstone-query-results": {
    kind: "tombstone-query-results",
    execute: executeTombstoneQueryResultsHandler,
    executeCreateTrigger: rejectCreateTrigger,
  },
  "create-missing-join-records": {
    kind: "create-missing-join-records",
    execute: executeCreateMissingJoinRecordsHandler,
    executeCreateTrigger: executeCreateMissingJoinRecordsCreateTrigger,
  },
  "create-selected-join-record": {
    kind: "create-selected-join-record",
    execute: executeCreateSelectedJoinRecordHandler,
    executeCreateTrigger: rejectCreateTrigger,
  },
  "remove-selected-join-records": {
    kind: "remove-selected-join-records",
    execute: executeRemoveSelectedJoinRecordsHandler,
    executeCreateTrigger: rejectCreateTrigger,
  },
  "create-tree-child": {
    kind: "create-tree-child",
    execute: executeCreateTreeChildHandler,
    executeCreateTrigger: rejectCreateTrigger,
  },
  "remove-tree-placement": {
    kind: "remove-tree-placement",
    execute: executeRemoveTreePlacementHandler,
    executeCreateTrigger: rejectCreateTrigger,
  },
  "transition-state": {
    kind: "transition-state",
    execute: executeTransitionStateHandler,
    executeCreateTrigger: rejectCreateTrigger,
  },
};

export function executeOperationHandlerOutcome(
  context: OperationHandlerExecutionContext,
  operationAdapters: readonly ProgramSharedOperationAdapterDefinition[] = [],
): WriteOutcome<OperationCommandOutput> {
  const handler = operationHandlerModules[context.effect.handler];

  if (handler !== undefined) {
    return handler.execute(context);
  }

  const adapter = operationAdapters.find(({ key }) => key === context.effect.handler);

  if (adapter === undefined) {
    throw new Error(
      `Operation "${context.envelope.operation.canonicalKey}" requires selected operation adapter "${context.effect.handler}".`,
    );
  }

  if (context.envelope.actor.kind === "anonymous" && !adapter.publicEligible) {
    throw new BadRequestError(
      `Operation "${context.envelope.operation.canonicalKey}" is not available for public execution.`,
    );
  }

  return adapter.execute(context as never) as WriteOutcome<OperationCommandOutput>;
}

export async function prepareTransitionStateSideEffectHandlerOutcome(
  context: OperationHandlerExecutionContext,
  options: {
    identityReferenceResolver?: IdentityReferenceTargetResolver;
  } = {},
): Promise<() => WriteOutcome<OperationCommandOutput>> {
  const effect = requireHandlerEffect(context, "transition-state");
  const sideEffects = effect.config.sideEffects;

  if (sideEffects === undefined) {
    throw new Error(
      `Operation "${context.envelope.operation.canonicalKey}" requires transition side effects.`,
    );
  }

  const transition = selectTransitionStateWritePlans(context.storage, context, effect, {
    receivedAt: context.envelope.receivedAt,
  });
  const operationId = requiredOperationWriteIdentity(context.envelope);
  const materialization = await materializeRecordPlanAsync({
    effect: sideEffects,
    envelope: context.envelope,
    identityReferenceResolver: options.identityReferenceResolver,
    inputValues: recordPlanCommandInput({
      envelope: context.envelope,
      schema: context.schema,
      storage: context.storage,
    }),
    operationId,
    plannedRecords: transition.plannedRecords,
    schema: context.schema,
    storage: context.storage,
    targetRecord: transition.targetRecord,
  });
  const plans = [...transition.plans, ...materialization.plans];

  return () =>
    mapWriteOutcome(
      writeRecordSetForCommandOperationOutcome(
        context.storage,
        operationId,
        plans,
        operationHandlerRecordConstraintValidator(context),
        {
          allowStoredReplay: false,
          assertPreconditions: () =>
            assertActiveOperationTargetSnapshot(
              context.storage,
              context.envelope,
              transition.targetRecord,
            ),
          now: context.envelope.receivedAt,
        },
      ),
      (output) =>
        recordPlanOperationOutput(output, materialization, {
          changeOffset: transition.plans.length,
        }),
    );
}

export function executeOperationHandlerCreateTriggers(
  storage: DurableObjectStorage,
  recordWrite: CreateRecordWriteRequest,
  schema: AppSchema,
  createRecords: CreateRecordWriteSideEffectRecordCreator,
) {
  for (const trigger of createTriggersForEntity(schema, recordWrite.entity)) {
    const handler = operationHandlerModules[trigger.effect.handler];

    if (handler === undefined) {
      throw new Error(
        `Create trigger "${recordWrite.entity}.${recordWrite.writeId}" requires runtime-owned handler "${trigger.effect.handler}".`,
      );
    }

    handler.executeCreateTrigger({
      storage,
      recordWrite,
      schema,
      entityName: trigger.entityName,
      operationName: trigger.operationName,
      effect: trigger.effect,
      createRecords,
    });
  }
}

function executeTombstoneQueryResultsHandler(context: OperationHandlerExecutionContext) {
  const effect = requireHandlerEffect(context, "tombstone-query-results");
  const records = selectTombstoneQueryResultRecords(context.storage, context, effect);

  return writePlansForOperationHandler(context, tombstonePlans(records));
}

function executeCreateMissingJoinRecordsHandler(context: OperationHandlerExecutionContext) {
  const effect = requireHandlerEffect(context, "create-missing-join-records");
  const values = selectMissingJoinRecordValues(
    context.storage,
    context.schema,
    context.envelope.operation.entityName,
    context.envelope.operation.canonicalKey,
    effect,
  );

  return writePlansForOperationHandler(
    context,
    values.map((recordValues) => ({
      kind: "create",
      entity: context.envelope.operation.entityName,
      values: recordValues,
    })),
  );
}

function executeCreateSelectedJoinRecordHandler(context: OperationHandlerExecutionContext) {
  const effect = requireHandlerEffect(context, "create-selected-join-record");
  const values = selectSelectedJoinRecordValues(context.storage, context, effect);

  return writePlansForOperationHandler(context, [
    {
      kind: "create",
      entity: context.envelope.operation.entityName,
      values,
    },
  ]);
}

function executeRemoveSelectedJoinRecordsHandler(context: OperationHandlerExecutionContext) {
  const effect = requireHandlerEffect(context, "remove-selected-join-records");
  const records = selectSelectedJoinRecords(context.storage, context, effect);

  return writePlansForOperationHandler(context, tombstonePlans(records));
}

function executeCreateTreeChildHandler(context: OperationHandlerExecutionContext) {
  const effect = requireHandlerEffect(context, "create-tree-child");
  const plans = selectTreeChildCreatePlans(context.storage, context, effect);

  return writePlansForOperationHandler(context, plans);
}

function executeRemoveTreePlacementHandler(context: OperationHandlerExecutionContext) {
  const effect = requireHandlerEffect(context, "remove-tree-placement");
  const record = selectTreePlacementRecord(context.storage, context, effect);

  return writePlansForOperationHandler(context, tombstonePlans([record]));
}

function executeTransitionStateHandler(context: OperationHandlerExecutionContext) {
  const effect = requireHandlerEffect(context, "transition-state");
  const planning = selectTransitionStateWritePlans(context.storage, context, effect, {
    receivedAt: context.envelope.receivedAt,
  });

  return writePlansForOperationHandler(context, planning.plans);
}

function executeCreateMissingJoinRecordsCreateTrigger(
  context: OperationHandlerCreateTriggerContext,
) {
  const effect = requireCreateTriggerEffect(context, "create-missing-join-records");
  const values = selectMissingJoinRecordValues(
    context.storage,
    context.schema,
    context.entityName,
    operationKey(context.entityName, context.operationName),
    effect,
  );

  context.createRecords(context.entityName, values);
}

export function writePlansForOperationHandler(
  context: OperationHandlerExecutionContext,
  plans: OperationRecordWritePlan[],
): WriteOutcome<OperationCommandOutput> {
  return writeRecordSetForCommandOperationOutcome(
    context.storage,
    requiredOperationWriteIdentity(context.envelope),
    plans,
    operationHandlerRecordConstraintValidator(context),
    { allowStoredReplay: false, now: context.envelope.receivedAt },
  );
}

function operationHandlerRecordConstraintValidator(
  context: OperationHandlerExecutionContext,
): RecordConstraintValidator {
  return (entity, recordValues, options) => {
    context.validateConstraints?.(entity, recordValues, options);
    assertUniqueConstraints(context.storage, context.schema, entity, recordValues, options);
  };
}

function createTriggersForEntity(schema: AppSchema, sourceEntity: string) {
  const triggers: {
    entityName: string;
    operationName: string;
    effect: OperationHandlerEntityOperationEffectSchema;
  }[] = [];
  for (const entity of schema.entities) {
    const entityName = entity.key;
    for (const operation of entity.operations ?? []) {
      const operationName = operation.key;
      if (
        operation.kind !== "command" ||
        operation.effect?.type !== "operationHandler" ||
        operation.effect.handler !== "create-missing-join-records"
      ) {
        continue;
      }

      for (const source of [
        operation.effect.config.join.left,
        operation.effect.config.join.right,
      ]) {
        if (
          schema.queries.find((definition) => definition.key === source.query)?.entity !==
          sourceEntity
        ) {
          continue;
        }
        const trigger = { entityName, operationName, effect: operation.effect };
        if (
          !triggers.some(
            (candidate) =>
              candidate.entityName === trigger.entityName &&
              candidate.operationName === trigger.operationName,
          )
        ) {
          triggers.push(trigger);
        }
      }
    }
  }

  return triggers;
}

function rejectCreateTrigger(context: OperationHandlerCreateTriggerContext): never {
  throw new Error(
    `Create trigger "${context.recordWrite.entity}.${context.recordWrite.writeId}" references unsupported operation "${context.entityName}.${context.operationName}".`,
  );
}

function selectTombstoneQueryResultRecords(
  storage: DurableObjectStorage,
  context: OperationHandlerExecutionContext,
  effect: OperationHandlerEffectSchemaForKind<"tombstone-query-results">,
): StoredRecord[] {
  const targetQuery = context.schema.queries.find(
    (definition) => definition.key === effect.config.query,
  )!;
  if (!targetQuery) {
    throw new Error(
      `Operation "${context.envelope.operation.canonicalKey}" references unknown query "${effect.config.query}".`,
    );
  }

  return getActiveRecordsByEntity(storage, context.envelope.operation.entityName).filter((record) =>
    matchesQuery(record, targetQuery.expression),
  );
}

function selectMissingJoinRecordValues(
  storage: DurableObjectStorage,
  schema: AppSchema,
  entityName: string,
  operationName: string,
  effect: OperationHandlerEffectSchemaForKind<"create-missing-join-records">,
): RecordValues[] {
  const entity = schema.entities.find((definition) => definition.key === entityName)!;
  if (!entity) {
    throw new Error(`Missing entity "${entityName}".`);
  }
  const leftQuery = schema.queries.find(
    (definition) => definition.key === effect.config.join.left.query,
  )!;
  const rightQuery = schema.queries.find(
    (definition) => definition.key === effect.config.join.right.query,
  )!;
  if (!leftQuery || !rightQuery) {
    throw new Error(`Operation "${operationName}" references unknown join query.`);
  }

  const leftRecords = getActiveRecordsByEntity(storage, leftQuery.entity).filter((record) =>
    matchesQuery(record, leftQuery.expression),
  );
  const rightRecords = getActiveRecordsByEntity(storage, rightQuery.entity).filter((record) =>
    matchesQuery(record, rightQuery.expression),
  );
  const existingPairs = new Set(
    getActiveRecordsByEntity(storage, entityName)
      .map((record) => joinPairKey(record, effect))
      .filter((key): key is string => key !== undefined),
  );
  const values: RecordValues[] = [];

  for (const leftRecord of leftRecords) {
    for (const rightRecord of rightRecords) {
      const pairKey = createJoinPairKey(leftRecord.id, rightRecord.id);

      if (existingPairs.has(pairKey)) {
        continue;
      }

      existingPairs.add(pairKey);
      values.push(
        createJoinRecordValues(
          entity,
          effect.config.join.left.field,
          effect.config.join.right.field,
          leftRecord.id,
          rightRecord.id,
        ),
      );
    }
  }

  return values;
}

function joinPairKey(
  record: StoredRecord,
  effect: OperationHandlerEffectSchemaForKind<"create-missing-join-records">,
) {
  const leftValue = record.values[effect.config.join.left.field];
  const rightValue = record.values[effect.config.join.right.field];

  return typeof leftValue === "string" && typeof rightValue === "string"
    ? createJoinPairKey(leftValue, rightValue)
    : undefined;
}

function createJoinPairKey(leftRecordId: string, rightRecordId: string) {
  return `${leftRecordId}\u0000${rightRecordId}`;
}

function createJoinRecordValues(
  entity: EntitySchema,
  leftField: string,
  rightField: string,
  leftRecordId: string,
  rightRecordId: string,
): RecordValues {
  const values: RecordValues = {};
  for (const field of entity.fields) {
    const fieldName = field.key;
    if (fieldName === leftField) {
      values[fieldName] = leftRecordId;
      continue;
    }

    if (fieldName === rightField) {
      values[fieldName] = rightRecordId;
      continue;
    }

    const defaultValue = fieldCreateDefaultValue(field);
    if (defaultValue !== undefined) {
      values[fieldName] = defaultValue;
    }
  }

  return values;
}

function selectSelectedJoinRecordValues(
  storage: DurableObjectStorage,
  context: OperationHandlerExecutionContext,
  effect: OperationHandlerEffectSchemaForKind<"create-selected-join-record">,
): RecordValues {
  const entityName = context.envelope.operation.entityName;
  const entity = context.schema.entities.find((definition) => definition.key === entityName)!;
  if (!entity) {
    throw new Error(`Missing entity "${entityName}".`);
  }

  const relationship = getManyToManyOperationRelationship(context, effect.config.relationship);
  const input = requireCreateSelectedJoinRecordInput(context);
  const fromRecord = requireActiveEndpointRecord(
    storage,
    context,
    relationship.from.entity,
    input.fromRecordId,
  );
  const toRecord = requireActiveEndpointRecord(
    storage,
    context,
    relationship.to.entity,
    input.toRecordId,
  );

  return createJoinRecordValues(
    entity,
    relationship.through.fromField,
    relationship.through.toField,
    fromRecord.id,
    toRecord.id,
  );
}

function selectSelectedJoinRecords(
  storage: DurableObjectStorage,
  context: OperationHandlerExecutionContext,
  effect: OperationHandlerEffectSchemaForKind<"remove-selected-join-records">,
): StoredRecord[] {
  const relationship = getManyToManyOperationRelationship(context, effect.config.relationship);
  const input = requireRemoveSelectedJoinRecordsInput(context);
  const records: StoredRecord[] = [];

  for (const recordId of input.recordIds) {
    const record = getStoredRecord(storage, recordId);

    if (!record) {
      throw new BadRequestError(
        `Operation "${context.envelope.operation.canonicalKey}" references unknown join record "${recordId}".`,
      );
    }

    if (record.entity !== relationship.through.entity) {
      throw new BadRequestError(
        `Operation "${context.envelope.operation.canonicalKey}" join record "${recordId}" must belong to entity "${relationship.through.entity}".`,
      );
    }

    if (record.deletedAt) {
      throw new BadRequestError(
        `Operation "${context.envelope.operation.canonicalKey}" cannot remove tombstoned join record "${recordId}".`,
      );
    }

    records.push(record);
  }

  return records;
}

function selectTreeChildCreatePlans(
  storage: DurableObjectStorage,
  context: OperationHandlerExecutionContext,
  effect: OperationHandlerEffectSchemaForKind<"create-tree-child">,
): OperationRecordWritePlan[] {
  const placementEntityName = context.envelope.operation.entityName;
  const placementEntity = context.schema.entities.find(
    (definition) => definition.key === placementEntityName,
  )!;
  if (!placementEntity) {
    throw new Error(`Missing entity "${placementEntityName}".`);
  }

  if (!entityHasOperationKind(placementEntity, "create")) {
    throw new BadRequestError(
      `Create operations are disabled for entity "${placementEntityName}".`,
    );
  }
  const relationship = getToManyOperationRelationship(context, effect.config.relationship);
  const childField = placementEntity.fields.find(
    (definition) => definition.key === effect.config.childField,
  )!;
  if (childField?.type !== "reference") {
    throw new Error(
      `Operation "${context.envelope.operation.canonicalKey}" references invalid child field.`,
    );
  }
  const childEntityName = childField.to;
  const childEntity = context.schema.entities.find(
    (definition) => definition.key === childEntityName,
  )!;
  if (!childEntity) {
    throw new Error(
      `Operation "${context.envelope.operation.canonicalKey}" references unknown child entity.`,
    );
  }

  if (!entityHasOperationKind(childEntity, "create")) {
    throw new BadRequestError(`Create operations are disabled for entity "${childEntityName}".`);
  }

  const input = requireCreateTreeChildInput(context);
  const validationReader = authorityStorageRecordValidationReader(storage);
  const parentRecord = requireActiveEndpointRecord(
    storage,
    context,
    relationship.from.entity,
    input.parentRecordId,
  );
  const childValues = validateRecordValues(
    inheritTreeChildValues(context, effect, parentRecord, input.childValues),
    childEntity,
    validationReader,
  );

  return [
    {
      kind: "create",
      entity: childEntityName,
      values: childValues,
    },
    {
      kind: "create",
      entity: placementEntityName,
      values: (createdRecords) => {
        const childRecord = createdRecords[0];

        if (!childRecord) {
          throw new Error(
            `Operation "${context.envelope.operation.canonicalKey}" did not create a child record.`,
          );
        }

        return validateRecordValues(
          createTreePlacementValues(
            storage,
            context,
            placementEntityName,
            placementEntity,
            relationship,
            effect,
            parentRecord.id,
            childRecord.id,
            input.placementValues ?? {},
          ),
          placementEntity,
          validationReader,
        );
      },
    },
  ];
}

function inheritTreeChildValues(
  context: OperationHandlerExecutionContext,
  effect: OperationHandlerEffectSchemaForKind<"create-tree-child">,
  parentRecord: StoredRecord,
  childValues: RecordValues,
): RecordValues {
  const values = { ...childValues };

  for (const fieldName of effect.config.inheritFields ?? []) {
    const value = parentRecord.values[fieldName];

    if (value === undefined) {
      throw new BadRequestError(
        `Operation "${context.envelope.operation.canonicalKey}" parent record "${parentRecord.id}" has no inherited field "${fieldName}".`,
      );
    }
    values[fieldName] = value;
  }

  return values;
}

function createTreePlacementValues(
  storage: DurableObjectStorage,
  context: OperationHandlerExecutionContext,
  placementEntityName: string,
  placementEntity: EntitySchema,
  relationship: ToManyRelationshipSchema,
  effect: OperationHandlerEffectSchemaForKind<"create-tree-child">,
  parentRecordId: string,
  childRecordId: string,
  placementValues: RecordValues,
): RecordValues {
  const relationshipField = relationship.to.field;
  validateTreePlacementInputValues(
    context,
    placementEntity,
    relationshipField,
    effect,
    placementValues,
  );
  const values: RecordValues = { ...placementValues };
  for (const field of placementEntity.fields) {
    const fieldName = field.key;
    if (fieldName === relationshipField) {
      values[fieldName] = parentRecordId;
      continue;
    }

    if (fieldName === effect.config.childField) {
      values[fieldName] = childRecordId;
      continue;
    }

    if (effect.config.orderField !== undefined && fieldName === effect.config.orderField) {
      values[fieldName] = nextTreePlacementOrder(
        storage,
        placementEntityName,
        relationshipField,
        parentRecordId,
        effect.config.orderField,
        field,
      );
      continue;
    }

    const defaultValue = fieldCreateDefaultValue(field);
    if (defaultValue !== undefined) {
      values[fieldName] = defaultValue;
    }
  }

  return values;
}

function validateTreePlacementInputValues(
  context: OperationHandlerExecutionContext,
  placementEntity: EntitySchema,
  relationshipField: string,
  effect: OperationHandlerEffectSchemaForKind<"create-tree-child">,
  placementValues: RecordValues,
) {
  const controlledFields = new Set([
    relationshipField,
    effect.config.childField,
    ...(effect.config.orderField === undefined ? [] : [effect.config.orderField]),
  ]);
  for (const fieldName of Object.keys(placementValues)) {
    if (!placementEntity.fields.some((definition) => definition.key === fieldName)) {
      throw new BadRequestError(
        `Operation "${context.envelope.operation.canonicalKey}" placementValues field "${fieldName}" is unknown.`,
      );
    }

    if (controlledFields.has(fieldName)) {
      throw new BadRequestError(
        `Operation "${context.envelope.operation.canonicalKey}" placementValues field "${fieldName}" is controlled by tree creation.`,
      );
    }
  }
}

function nextTreePlacementOrder(
  storage: DurableObjectStorage,
  placementEntityName: string,
  parentFieldName: string,
  parentRecordId: string,
  orderFieldName: string,
  orderField: EntitySchema["fields"][number],
): number {
  const defaultOrder = fieldCreateDefaultValue(orderField);
  const step = typeof defaultOrder === "number" && defaultOrder > 0 ? defaultOrder : 1000;
  const siblingOrders = getActiveRecordsByEntity(storage, placementEntityName)
    .filter((record) => record.values[parentFieldName] === parentRecordId)
    .map((record) => record.values[orderFieldName])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const maxOrder = siblingOrders.length === 0 ? undefined : Math.max(...siblingOrders);

  return maxOrder === undefined ? step : maxOrder + step;
}

function selectTreePlacementRecord(
  storage: DurableObjectStorage,
  context: OperationHandlerExecutionContext,
  effect: OperationHandlerEffectSchemaForKind<"remove-tree-placement">,
): StoredRecord {
  getToManyOperationRelationship(context, effect.config.relationship);

  const input = requireRemoveTreePlacementInput(context);
  const record = getStoredRecord(storage, input.placementId);

  if (!record) {
    throw new BadRequestError(
      `Operation "${context.envelope.operation.canonicalKey}" references unknown placement record "${input.placementId}".`,
    );
  }

  if (record.entity !== context.envelope.operation.entityName) {
    throw new BadRequestError(
      `Operation "${context.envelope.operation.canonicalKey}" placement record "${input.placementId}" must belong to entity "${context.envelope.operation.entityName}".`,
    );
  }

  if (record.deletedAt) {
    throw new BadRequestError(
      `Operation "${context.envelope.operation.canonicalKey}" cannot remove tombstoned placement record "${input.placementId}".`,
    );
  }

  return record;
}

function selectTransitionStateWritePlans(
  storage: DurableObjectStorage,
  context: OperationHandlerExecutionContext,
  effect: OperationHandlerEffectSchemaForKind<"transition-state">,
  options: {
    receivedAt?: string;
  } = {},
): {
  plannedRecords: StoredRecord[];
  plans: OperationRecordWritePlan[];
  targetRecord: StoredRecord;
} {
  const input = requireTransitionStateInput(context);
  const entityName = context.envelope.operation.entityName;
  const entity = context.schema.entities.find((definition) => definition.key === entityName)!;
  const machine = entity?.stateMachines?.find(
    (definition) => definition.key === effect.config.machine,
  );
  const transition = machine?.transitions.find(
    (definition) => definition.key === effect.config.transition,
  );
  if (!entity || !machine || !transition) {
    throw new Error(
      `Operation "${context.envelope.operation.canonicalKey}" references an invalid state transition.`,
    );
  }

  const record = immutableOperationTargetSnapshot(
    requireActiveTransitionTargetRecord(storage, context, input.recordId),
  );
  const validationReader = authorityStorageRecordValidationReader(storage);
  const previousState = record.values[machine.field];

  if (typeof previousState !== "string") {
    throw new BadRequestError(
      `Operation "${context.envelope.operation.canonicalKey}" target record "${record.id}" field "${machine.field}" does not contain a state.`,
    );
  }

  if (!stateTransitionCanApply(entity, machine, transition, previousState)) {
    throw new BadRequestError(
      `Operation "${context.envelope.operation.canonicalKey}" cannot transition record "${record.id}" from state "${previousState}".`,
    );
  }

  const generatedTargetValues = Object.fromEntries(
    Object.entries(effect.config.targetValues ?? {}).map(([fieldName, expression]) => [
      fieldName,
      materializeGeneratedDateExpression(
        expression,
        context.envelope.receivedAt,
        `Operation "${context.envelope.operation.canonicalKey}" targetValues.${fieldName} generatedDate`,
      ),
    ]),
  );
  const nextValues = validateRecordValues(
    {
      ...record.values,
      ...generatedTargetValues,
      [machine.field]: transition.to,
    },
    entity,
    validationReader,
    {
      entityName,
      schema: context.schema,
    },
  );
  const transitionedRecord = {
    ...record,
    values: nextValues,
    updatedAt: context.envelope.receivedAt,
  } satisfies StoredRecord;
  const plannedRecords = [transitionedRecord];

  operationHandlerRecordConstraintValidator(context)(entityName, nextValues, {
    ignoreRecordId: record.id,
  });

  const plans: OperationRecordWritePlan[] = [
    {
      kind: "patch",
      record,
      values: nextValues,
    },
  ];
  const event = machine.event;
  if (event) {
    const eventEntity = context.schema.entities.find(
      (definition) => definition.key === event.entity,
    )!;
    if (!eventEntity) {
      throw new Error(
        `Operation "${context.envelope.operation.canonicalKey}" references unknown transition event entity "${event.entity}".`,
      );
    }

    const eventValues = transitionEventRecordValues(
      context,
      event.fields,
      record.id,
      effect.config.transition,
      previousState,
      transition.to,
      options.receivedAt,
    );
    const validatedEventValues = validateRecordValues(eventValues, eventEntity, validationReader, {
      entityName: event.entity,
      schema: context.schema,
    });
    const eventRecord = {
      id: createRecordId(),
      entity: event.entity,
      values: validatedEventValues,
      createdAt: context.envelope.receivedAt,
      updatedAt: context.envelope.receivedAt,
    } satisfies StoredRecord;

    operationHandlerRecordConstraintValidator(context)(event.entity, validatedEventValues, {
      additionalRecords: [...plannedRecords],
    });
    plannedRecords.push(eventRecord);

    plans.push({
      kind: "create",
      entity: event.entity,
      id: eventRecord.id,
      values: validatedEventValues,
    });
  }

  return { plannedRecords, plans, targetRecord: record };
}

function stateTransitionCanApply(
  entity: EntitySchema,
  machine: NonNullable<EntitySchema["stateMachines"]>[number],
  transition: NonNullable<EntitySchema["stateMachines"]>[number]["transitions"][number],
  previousState: string,
) {
  if (transition.from.includes(previousState)) {
    return true;
  }
  const field = entity.fields.find((definition) => definition.key === machine.field)!;
  return (
    field?.type === "enum" &&
    !field.values.some((definition) => definition.key === previousState) &&
    previousState.trim() !== "" &&
    transition.to === machine.initial
  );
}

function transitionEventRecordValues(
  context: OperationHandlerExecutionContext,
  fields: StateMachineTransitionEventFieldMappingsSchema,
  recordId: string,
  transitionKey: string,
  previousState: string,
  nextState: string,
  receivedAt: string | undefined,
): RecordValues {
  return {
    [fields.sourceEntity]: context.envelope.operation.entityName,
    [fields.sourceRecordId]: recordId,
    [fields.transitionKey]: transitionKey,
    [fields.previousState]: previousState,
    [fields.nextState]: nextState,
    [fields.actorMode]: context.envelope.actor.kind,
    [fields.occurredAt]: (receivedAt ?? nowIsoString()).slice(0, 10),
  };
}

function requireActiveTransitionTargetRecord(
  storage: DurableObjectStorage,
  context: OperationHandlerExecutionContext,
  recordId: string,
): StoredRecord {
  const record = getStoredRecord(storage, recordId);

  if (!record) {
    throw new BadRequestError(
      `Operation "${context.envelope.operation.canonicalKey}" references unknown ${context.envelope.operation.entityName} record "${recordId}".`,
    );
  }

  if (record.entity !== context.envelope.operation.entityName) {
    throw new BadRequestError(
      `Operation "${context.envelope.operation.canonicalKey}" target record "${recordId}" must reference a ${context.envelope.operation.entityName} record.`,
    );
  }

  if (record.deletedAt) {
    throw new BadRequestError(
      `Operation "${context.envelope.operation.canonicalKey}" cannot transition tombstoned ${context.envelope.operation.entityName} record "${recordId}".`,
    );
  }

  return record;
}

function getManyToManyOperationRelationship(
  schema: Pick<OperationHandlerExecutionContext, "schema" | "envelope">,
  relationshipName: string,
): ManyToManyRelationshipSchema {
  const relationship = schema.schema.relationships?.find(
    (definition) => definition.key === relationshipName,
  );
  const operationKey = schema.envelope.operation.canonicalKey;
  const entityName = schema.envelope.operation.entityName;
  if (!relationship) {
    throw new Error(
      `Operation "${operationKey}" references unknown relationship "${relationshipName}".`,
    );
  }

  if (relationship.kind !== "manyToMany") {
    throw new Error(
      `Operation "${operationKey}" relationship "${relationshipName}" must be manyToMany.`,
    );
  }

  if (relationship.through.entity !== entityName) {
    throw new Error(
      `Operation "${operationKey}" relationship "${relationshipName}" uses through entity "${relationship.through.entity}", not "${entityName}".`,
    );
  }

  return relationship;
}

function getToManyOperationRelationship(
  schema: Pick<OperationHandlerExecutionContext, "schema" | "envelope">,
  relationshipName: string,
): ToManyRelationshipSchema {
  const relationship = schema.schema.relationships?.find(
    (definition) => definition.key === relationshipName,
  );
  const operationKey = schema.envelope.operation.canonicalKey;
  const entityName = schema.envelope.operation.entityName;
  if (!relationship) {
    throw new Error(
      `Operation "${operationKey}" references unknown relationship "${relationshipName}".`,
    );
  }

  if (relationship.kind !== "toMany") {
    throw new Error(
      `Operation "${operationKey}" relationship "${relationshipName}" must be toMany.`,
    );
  }

  if (relationship.to.entity !== entityName) {
    throw new Error(
      `Operation "${operationKey}" relationship "${relationshipName}" targets entity "${relationship.to.entity}", not "${entityName}".`,
    );
  }

  return relationship;
}

function requireCreateSelectedJoinRecordInput(context: OperationHandlerExecutionContext): {
  fromRecordId: string;
  toRecordId: string;
} {
  return requireHandlerInput(context, "create-selected-join-record");
}

function requireRemoveSelectedJoinRecordsInput(context: OperationHandlerExecutionContext): {
  recordIds: string[];
} {
  return requireHandlerInput(context, "remove-selected-join-records");
}

function requireCreateTreeChildInput(context: OperationHandlerExecutionContext): {
  parentRecordId: string;
  childValues: RecordValues;
  placementValues?: RecordValues;
} {
  return requireHandlerInput(context, "create-tree-child");
}

function requireRemoveTreePlacementInput(context: OperationHandlerExecutionContext): {
  placementId: string;
} {
  return requireHandlerInput(context, "remove-tree-placement");
}

function requireTransitionStateInput(context: OperationHandlerExecutionContext): {
  recordId: string;
} {
  return requireHandlerInput(context, "transition-state");
}

function requireHandlerInput<Kind extends OperationHandlerKind>(
  context: OperationHandlerExecutionContext,
  kind: Kind,
): Exclude<OperationHandlerInputValuesByKind[Kind], undefined> {
  requireHandlerEffect(context, kind);
  const input = validateOperationHandlerInputValues({
    canonicalOperationKey: context.envelope.operation.canonicalKey,
    handler: kind,
    input: context.input,
  });

  if (input === undefined) {
    throw new Error(
      `Operation handler "${context.envelope.operation.canonicalKey}" missing validated input.`,
    );
  }

  return input as Exclude<OperationHandlerInputValuesByKind[Kind], undefined>;
}

function requireActiveEndpointRecord(
  storage: DurableObjectStorage,
  context: OperationHandlerExecutionContext,
  entityName: string,
  recordId: string,
): StoredRecord {
  const record = getStoredRecord(storage, recordId);

  if (!record) {
    throw new BadRequestError(
      `Operation "${context.envelope.operation.canonicalKey}" references unknown ${entityName} record "${recordId}".`,
    );
  }

  if (record.entity !== entityName) {
    throw new BadRequestError(
      `Operation "${context.envelope.operation.canonicalKey}" endpoint "${recordId}" must reference a ${entityName} record.`,
    );
  }

  if (record.deletedAt) {
    throw new BadRequestError(
      `Operation "${context.envelope.operation.canonicalKey}" cannot reference tombstoned ${entityName} record "${recordId}".`,
    );
  }

  return record;
}

function tombstonePlans(records: StoredRecord[]): OperationRecordWritePlan[] {
  return records.map((record) => ({ kind: "tombstone", record }));
}

function requireHandlerEffect<Kind extends OperationHandlerKind>(
  context: OperationHandlerExecutionContext,
  kind: Kind,
): OperationHandlerEffectSchemaForKind<Kind> {
  if (context.effect.handler !== kind) {
    throw new Error(
      `Operation handler "${context.envelope.operation.canonicalKey}" expected "${kind}" effect.`,
    );
  }

  return context.effect as OperationHandlerEffectSchemaForKind<Kind>;
}

function requireCreateTriggerEffect<Kind extends OperationHandlerKind>(
  context: OperationHandlerCreateTriggerContext,
  kind: Kind,
): OperationHandlerEffectSchemaForKind<Kind> {
  if (context.effect.handler !== kind) {
    throw new Error(
      `Create trigger "${context.recordWrite.entity}.${context.recordWrite.writeId}" expected "${kind}" effect.`,
    );
  }

  return context.effect as OperationHandlerEffectSchemaForKind<Kind>;
}

function requiredOperationWriteIdentity(envelope: OperationInvocationEnvelope) {
  if (!envelope.idempotency.writeIdentity) {
    throw new BadRequestError(
      `Operation "${envelope.operation.canonicalKey}" requires an idempotency key.`,
    );
  }
  return envelope.idempotency.writeIdentity;
}
function operationKey(entityName: string, operationName: string) {
  return `${entityName}.${operationName}`;
}
function entityHasOperationKind(entity: EntitySchema, kind: EntityOperationKind): boolean {
  return (entity.operations ?? []).some((operation) => operation.kind === kind);
}
