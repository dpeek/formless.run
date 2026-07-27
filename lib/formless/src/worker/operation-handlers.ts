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
import type { AppPackageResolver } from "../shared/app-packages.ts";
import { nowIsoString } from "../shared/clock.ts";
import { createRecordId } from "../shared/ids.ts";
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
  materializeRecordPlanAsync,
  recordPlanCommandInput,
  recordPlanOperationOutput,
} from "./record-plan-materializer.ts";

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

const operationHandlerModules = {
  "clear-completed": {
    kind: "clear-completed",
    execute: executeClearCompletedHandler,
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
  subscribe: {
    kind: "subscribe",
    execute: executeSubscribeHandler,
    executeCreateTrigger: rejectCreateTrigger,
  },
  "transition-state": {
    kind: "transition-state",
    execute: executeTransitionStateHandler,
    executeCreateTrigger: rejectCreateTrigger,
  },
} satisfies Record<OperationHandlerKind, OperationHandlerModule>;

export function executeOperationHandlerOutcome(
  context: OperationHandlerExecutionContext,
): WriteOutcome<OperationCommandOutput> {
  return operationHandlerModules[context.effect.handler].execute(context);
}

export async function prepareTransitionStateSideEffectHandlerOutcome(
  context: OperationHandlerExecutionContext,
  options: {
    identityReferenceResolver?: IdentityReferenceTargetResolver;
    packageResolver?: AppPackageResolver;
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
    packageResolver: options.packageResolver,
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
        { allowStoredReplay: false, now: context.envelope.receivedAt },
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
    operationHandlerModules[trigger.effect.handler].executeCreateTrigger({
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

function executeClearCompletedHandler(context: OperationHandlerExecutionContext) {
  const effect = requireHandlerEffect(context, "clear-completed");
  const records = selectClearCompletedTargetRecords(context.storage, context, effect);

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

function executeSubscribeHandler(context: OperationHandlerExecutionContext) {
  requireHandlerEffect(context, "subscribe");

  if (context.envelope.actor.kind !== "anonymous") {
    throw new BadRequestError(
      `Operation "${context.envelope.operation.canonicalKey}" is not available for private execution.`,
    );
  }

  const input = requireHandlerInput(context, "subscribe");
  const contactEntity = requireSubscribeEntity(context.schema, "contact");
  const emailAddressEntity = requireSubscribeEntity(context.schema, "email-address");
  const audienceEntity = requireSubscribeEntity(context.schema, "audience");
  const subscriptionEntity = requireSubscribeEntity(context.schema, "subscription");
  const validationReader = authorityStorageRecordValidationReader(context.storage);
  const email = parseSubscribeEmail(input.email);
  const existingEmailAddress = findActiveRecordByField(
    context.storage,
    "email-address",
    "normalizedAddress",
    email.normalizedAddress,
  );
  const existingContact = findExistingEmailContact(context.storage, existingEmailAddress);
  const existingAudience = findActiveRecordByField(
    context.storage,
    "audience",
    "key",
    defaultAudienceKey,
  );
  const existingSubscription =
    existingEmailAddress && existingAudience
      ? findActiveSubscription(context.storage, existingEmailAddress.id, existingAudience.id)
      : undefined;
  const sourceValues = subscribeSourceValues(context.envelope);
  const plans: OperationRecordWritePlan[] = [];
  const contactRecordIndex = existingContact
    ? undefined
    : pushPlan(plans, {
        kind: "create",
        entity: "contact",
        values: () =>
          validateRecordValues({ label: email.normalizedAddress }, contactEntity, validationReader),
      });
  const emailAddressRecordIndex = existingEmailAddress
    ? undefined
    : pushPlan(plans, {
        kind: "create",
        entity: "email-address",
        values: (writtenRecords) =>
          validateRecordValues(
            {
              contact:
                existingContact?.id ?? requireWrittenRecord(writtenRecords, contactRecordIndex).id,
              address: email.address,
              normalizedAddress: email.normalizedAddress,
            },
            emailAddressEntity,
            validationReader,
          ),
      });

  if (existingEmailAddress && !existingContact) {
    plans.push({
      kind: "patch",
      record: existingEmailAddress,
      values: (writtenRecords) =>
        validateRecordValues(
          {
            ...existingEmailAddress.values,
            contact: requireWrittenRecord(writtenRecords, contactRecordIndex).id,
          },
          emailAddressEntity,
          validationReader,
        ),
    });
  }

  const audienceRecordIndex = existingAudience
    ? undefined
    : pushPlan(plans, {
        kind: "create",
        entity: "audience",
        values: () =>
          validateRecordValues(
            { key: defaultAudienceKey, label: "Default audience" },
            audienceEntity,
            validationReader,
          ),
      });
  const subscriptionValues = (writtenRecords: StoredRecord[]) =>
    validateRecordValues(
      {
        ...existingSubscription?.values,
        emailAddress:
          existingEmailAddress?.id ??
          requireWrittenRecord(writtenRecords, emailAddressRecordIndex).id,
        audience:
          existingAudience?.id ?? requireWrittenRecord(writtenRecords, audienceRecordIndex).id,
        status: "subscribed",
        consentedAt: context.envelope.receivedAt,
        ...sourceValues,
      },
      subscriptionEntity,
      validationReader,
    );

  if (existingSubscription) {
    plans.push({
      kind: "patch",
      record: existingSubscription,
      values: subscriptionValues,
    });
  } else {
    plans.push({
      kind: "create",
      entity: "subscription",
      values: subscriptionValues,
    });
  }

  return writePlansForOperationHandler(context, plans);
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

function writePlansForOperationHandler(
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

  for (const [entityName, entity] of Object.entries(schema.entities)) {
    for (const [operationName, operation] of Object.entries(entity.operations ?? {})) {
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
        if (schema.queries[source.query]?.entity !== sourceEntity) {
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

function selectClearCompletedTargetRecords(
  storage: DurableObjectStorage,
  context: OperationHandlerExecutionContext,
  effect: OperationHandlerEffectSchemaForKind<"clear-completed">,
): StoredRecord[] {
  const targetQuery = context.schema.queries[effect.config.query];

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
  const entity = schema.entities[entityName];

  if (!entity) {
    throw new Error(`Missing entity "${entityName}".`);
  }

  const leftQuery = schema.queries[effect.config.join.left.query];
  const rightQuery = schema.queries[effect.config.join.right.query];

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

  for (const [fieldName, field] of Object.entries(entity.fields)) {
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
  const entity = context.schema.entities[entityName];

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
  const placementEntity = context.schema.entities[placementEntityName];

  if (!placementEntity) {
    throw new Error(`Missing entity "${placementEntityName}".`);
  }

  if (!entityHasOperationKind(placementEntity, "create")) {
    throw new BadRequestError(
      `Create operations are disabled for entity "${placementEntityName}".`,
    );
  }

  const relationship = getToManyOperationRelationship(context, effect.config.relationship);
  const childField = placementEntity.fields[effect.config.childField];

  if (childField?.type !== "reference") {
    throw new Error(
      `Operation "${context.envelope.operation.canonicalKey}" references invalid child field.`,
    );
  }

  const childEntityName = childField.to;
  const childEntity = context.schema.entities[childEntityName];

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
  const childValues = validateRecordValues(input.childValues, childEntity, validationReader);

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

  for (const [fieldName, field] of Object.entries(placementEntity.fields)) {
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
    if (!placementEntity.fields[fieldName]) {
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
  orderField: EntitySchema["fields"][string],
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
  options: { receivedAt?: string } = {},
): {
  plannedRecords: StoredRecord[];
  plans: OperationRecordWritePlan[];
  targetRecord: StoredRecord;
} {
  const input = requireTransitionStateInput(context);
  const entityName = context.envelope.operation.entityName;
  const entity = context.schema.entities[entityName];
  const machine = entity?.stateMachines?.[effect.config.machine];
  const transition = machine?.transitions[effect.config.transition];

  if (!entity || !machine || !transition) {
    throw new Error(
      `Operation "${context.envelope.operation.canonicalKey}" references an invalid state transition.`,
    );
  }

  const record = requireActiveTransitionTargetRecord(storage, context, input.recordId);
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

  const nextValues = validateRecordValues(
    {
      ...record.values,
      [machine.field]: transition.to,
    },
    entity,
    validationReader,
    {
      entityName,
      existingRecordId: record.id,
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
      record: () =>
        requireTransitionTargetAtCommit(storage, context, record, machine.field, previousState),
      values: nextValues,
    },
  ];

  const event = machine.event;
  if (event) {
    const eventEntity = context.schema.entities[event.entity];

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

function requireTransitionTargetAtCommit(
  storage: DurableObjectStorage,
  context: OperationHandlerExecutionContext,
  snapshot: StoredRecord,
  machineField: string,
  expectedSourceState: string,
): StoredRecord {
  const record = requireActiveTransitionTargetRecord(storage, context, snapshot.id);
  const sourceState = record.values[machineField];

  if (record.entity !== snapshot.entity || sourceState !== expectedSourceState) {
    throw new BadRequestError(
      `Operation "${context.envelope.operation.canonicalKey}" target record "${record.id}" changed before commit.`,
    );
  }

  return record;
}

function stateTransitionCanApply(
  entity: EntitySchema,
  machine: NonNullable<EntitySchema["stateMachines"]>[string],
  transition: NonNullable<EntitySchema["stateMachines"]>[string]["transitions"][string],
  previousState: string,
) {
  if (transition.from.includes(previousState)) {
    return true;
  }

  const field = entity.fields[machine.field];

  return (
    field?.type === "enum" &&
    field.values[previousState] === undefined &&
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
  const relationship = schema.schema.relationships?.[relationshipName];
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
  const relationship = schema.schema.relationships?.[relationshipName];
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

const defaultAudienceKey = "default";

function requireSubscribeEntity(schema: AppSchema, entityName: string): EntitySchema {
  const entity = schema.entities[entityName];

  if (!entity) {
    throw new Error(`Subscribe operation requires entity "${entityName}".`);
  }

  return entity;
}

function parseSubscribeEmail(value: unknown) {
  if (typeof value !== "string") {
    throw new BadRequestError('Subscribe operation public input "email" must be text.');
  }

  const address = value.trim();
  const normalizedAddress = address.toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedAddress)) {
    throw new BadRequestError('Subscribe operation public input "email" must be an email address.');
  }

  return { address, normalizedAddress };
}

function findExistingEmailContact(
  storage: DurableObjectStorage,
  emailAddress: StoredRecord | undefined,
) {
  const contactId = emailAddress?.values.contact;

  if (typeof contactId !== "string") {
    return undefined;
  }

  const contact = getStoredRecord(storage, contactId);

  return contact?.entity === "contact" && !contact.deletedAt ? contact : undefined;
}

function findActiveSubscription(
  storage: DurableObjectStorage,
  emailAddressId: string,
  audienceId: string,
) {
  return getActiveRecordsByEntity(storage, "subscription").find(
    (record) =>
      record.values.emailAddress === emailAddressId && record.values.audience === audienceId,
  );
}

function findActiveRecordByField(
  storage: DurableObjectStorage,
  entity: string,
  field: string,
  value: RecordValues[string],
) {
  return getActiveRecordsByEntity(storage, entity).find((record) => record.values[field] === value);
}

function subscribeSourceValues(envelope: OperationInvocationEnvelope): RecordValues {
  if (
    envelope.appStorageIdentity.kind === "identityControlPlane" ||
    envelope.appStorageIdentity.kind === "instanceControlPlane"
  ) {
    throw new BadRequestError("Public operations are only available for app storage.");
  }

  const host = parseNonEmptyString("Public operation source host", envelope.source.host);
  const path = parseNonEmptyString("Public operation source path", envelope.source.path);
  const values: RecordValues = {
    sourceKind: "publicOperation",
    sourceTargetKind: envelope.appStorageIdentity.kind,
    sourcePackageAppKey: envelope.appStorageIdentity.packageAppKey,
    sourceSchemaKey: envelope.appStorageIdentity.sourceSchemaKey,
    sourceApiRoutePrefix: envelope.appStorageIdentity.apiRoutePrefix,
    sourceOperationKey: envelope.operation.canonicalKey,
    sourceHost: host,
    sourcePath: path,
  };

  if (envelope.appStorageIdentity.kind === "appInstall") {
    values.sourceInstallId = envelope.appStorageIdentity.installId;
  }

  if (envelope.source.siteBlockId !== undefined) {
    values.sourceSiteBlockId = envelope.source.siteBlockId;
  }

  return values;
}

function pushPlan(plans: OperationRecordWritePlan[], plan: OperationRecordWritePlan) {
  plans.push(plan);

  return plans.length - 1;
}

function requireWrittenRecord(records: StoredRecord[], index: number | undefined) {
  const record = index === undefined ? undefined : records[index];

  if (!record) {
    throw new Error("Subscribe operation could not resolve a planned record.");
  }

  return record;
}

function parseNonEmptyString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequestError(`${context} must be non-empty.`);
  }

  return value;
}

function operationKey(entityName: string, operationName: string) {
  return `${entityName}.${operationName}`;
}

function entityHasOperationKind(entity: EntitySchema, kind: EntityOperationKind): boolean {
  return Object.values(entity.operations ?? {}).some((operation) => operation.kind === kind);
}
