import type { AppSchema, EntitySchema } from "@dpeek/formless-schema";
import type { RecordValues, StoredRecord } from "@dpeek/formless-storage";
import type { ProgramSharedOperationAdapterDefinition } from "../program/composition.ts";
import {
  FORMLESS_PROGRAM_API_ROUTE_PREFIX,
  FORMLESS_PROGRAM_SCHEMA_KEY,
} from "../program/target.ts";
import type { OperationInvocationEnvelope } from "../shared/operation-invocation.ts";
import { authorityStorageRecordValidationReader } from "./authority-record-validation-reader.ts";
import { validateRecordValues } from "./authority-validation.ts";
import { BadRequestError } from "./errors.ts";
import { validateOperationHandlerInputValues } from "./operation-handler-input-validation.ts";
import {
  type OperationHandlerExecutionContext,
  writePlansForOperationHandler,
} from "./operation-handlers.ts";
import { getActiveRecordsByEntity, type OperationRecordWritePlan } from "./storage.ts";

const contactSubscriptionOperationAdapterKey = "contact-subscription.subscribe";
const defaultAudienceKey = "default";

export const contactSubscriptionOperationAdapter = {
  key: contactSubscriptionOperationAdapterKey,
  kind: "operation-adapter",
  publicEligible: true,
  target: "shared",
  execute: executeContactSubscriptionHandler,
} satisfies ProgramSharedOperationAdapterDefinition;

function executeContactSubscriptionHandler(context: OperationHandlerExecutionContext) {
  if (context.effect.handler !== contactSubscriptionOperationAdapterKey) {
    throw new Error(
      `Operation "${context.envelope.operation.canonicalKey}" expected "${contactSubscriptionOperationAdapterKey}" effect.`,
    );
  }

  if (context.envelope.actor.kind !== "anonymous") {
    throw new BadRequestError(
      `Operation "${context.envelope.operation.canonicalKey}" is not available for private execution.`,
    );
  }

  const input = validateOperationHandlerInputValues({
    canonicalOperationKey: context.envelope.operation.canonicalKey,
    handler: contactSubscriptionOperationAdapterKey,
    input: context.input,
  });
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
  const emailAddressRecordIndex = existingEmailAddress
    ? undefined
    : pushPlan(plans, {
        kind: "create",
        entity: "email-address",
        values: () =>
          validateRecordValues(
            {
              address: email.address,
              normalizedAddress: email.normalizedAddress,
            },
            emailAddressEntity,
            validationReader,
          ),
      });

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

function requireSubscribeEntity(schema: AppSchema, entityName: string): EntitySchema {
  const entity = schema.entities.find((definition) => definition.key === entityName);
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
  const host = parseNonEmptyString("Public operation source host", envelope.source.host);
  const path = parseNonEmptyString("Public operation source path", envelope.source.path);
  const values: RecordValues = {
    sourceKind: "publicOperation",
    sourceTargetKind: "program",
    sourceSchemaKey: FORMLESS_PROGRAM_SCHEMA_KEY,
    sourceApiRoutePrefix: FORMLESS_PROGRAM_API_ROUTE_PREFIX,
    sourceOperationKey: envelope.operation.canonicalKey,
    sourceHost: host,
    sourcePath: path,
  };

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
