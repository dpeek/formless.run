import { fieldRefsEqual, isSystemFieldName } from "./fields.ts";
import { fieldHasCreateDefault } from "./field-types.ts";
import { collectQueryContextNames } from "./query.ts";
import {
  assertExactKeys,
  definitionsToRecord,
  isRecord,
  parseRequiredNonEmptyString,
} from "./schema-parse-helpers.ts";
import type {
  CollectionQuerySchema,
  EntityOperationCommandEffectType,
  EntityOperationScope,
  EntityOperationTargetSchema,
  EntitySchema,
  OperationHandlerCapabilities,
  OperationHandlerConfigSchemaByKind,
  OperationHandlerEffectSchemaForKind,
  OperationHandlerEntityOperationEffectSchema,
  OperationHandlerInputExpectation,
  OperationHandlerInputFieldExpectation,
  OperationHandlerInputScalarRecordValueMapExpectation,
  OperationHandlerInputStringRecordIdArrayExpectation,
  OperationHandlerInputStringRecordIdExpectation,
  OperationHandlerInputTextExpectation,
  OperationHandlerJoinSchema,
  OperationHandlerKind,
  OperationHandlerKindBySelectionCapability,
  OperationHandlerSelectionCapability,
  RecordPlanGeneratedDateExpressionSchema,
  RelationshipSchema,
  TransitionSideEffectRecordPlanSchema,
} from "./types.ts";

export type TransitionSideEffectParser = (
  context: string,
  value: unknown,
) => TransitionSideEffectRecordPlanSchema;

export const operationHandlerKinds = [
  "clear-completed",
  "create-missing-join-records",
  "create-selected-join-record",
  "remove-selected-join-records",
  "create-tree-child",
  "remove-tree-placement",
  "subscribe",
  "transition-state",
] as const satisfies readonly OperationHandlerKind[];

export const entityOperationCommandEffectTypes = [
  "operationHandler",
  "recordPlan",
] as const satisfies readonly EntityOperationCommandEffectType[];

const operationHandlerCapabilities = {
  "clear-completed": { createAfterCreateHook: false, publicExecution: false },
  "create-missing-join-records": { createAfterCreateHook: true, publicExecution: false },
  "create-selected-join-record": {
    createAfterCreateHook: false,
    publicExecution: false,
    input: requiredOperationHandlerObjectInput({
      fromRecordId: requiredOperationHandlerStringRecordIdInput(),
      toRecordId: requiredOperationHandlerStringRecordIdInput(),
    }),
  },
  "remove-selected-join-records": {
    createAfterCreateHook: false,
    publicExecution: false,
    input: requiredOperationHandlerObjectInput({
      recordIds: requiredOperationHandlerStringRecordIdArrayInput(),
    }),
  },
  "create-tree-child": {
    createAfterCreateHook: false,
    publicExecution: false,
    input: requiredOperationHandlerObjectInput({
      parentRecordId: requiredOperationHandlerStringRecordIdInput(),
      childValues: requiredOperationHandlerScalarRecordValueMapInput(),
      placementValues: optionalOperationHandlerScalarRecordValueMapInput(),
    }),
  },
  "remove-tree-placement": {
    createAfterCreateHook: false,
    publicExecution: false,
    input: requiredOperationHandlerObjectInput({
      placementId: requiredOperationHandlerStringRecordIdInput(),
    }),
  },
  subscribe: {
    createAfterCreateHook: false,
    publicExecution: true,
    input: requiredOperationHandlerObjectInput({
      email: requiredOperationHandlerTextInput(),
    }),
  },
  "transition-state": {
    createAfterCreateHook: false,
    publicExecution: false,
    input: requiredOperationHandlerObjectInput({
      recordId: requiredOperationHandlerStringRecordIdInput(),
    }),
  },
} satisfies Record<OperationHandlerKind, OperationHandlerCapabilities>;

const operationHandlerKindBySelectionCapability = {
  clearCompletedTargetCount: "clear-completed",
  createMissingJoinRecords: "create-missing-join-records",
  createSelectedJoinRecord: "create-selected-join-record",
  removeSelectedJoinRecords: "remove-selected-join-records",
  createTreeChild: "create-tree-child",
  removeTreePlacement: "remove-tree-placement",
  publicSubscribe: "subscribe",
  transitionState: "transition-state",
} satisfies {
  [Capability in OperationHandlerSelectionCapability]: OperationHandlerKindBySelectionCapability[Capability];
};

export function getOperationHandlerCapabilities(
  kind: OperationHandlerKind,
): OperationHandlerCapabilities {
  return operationHandlerCapabilities[kind];
}

export function getOperationHandlerInputExpectation(
  kind: OperationHandlerKind,
): OperationHandlerInputExpectation | undefined {
  return getOperationHandlerCapabilities(kind).input;
}

export function requiredOperationHandlerObjectInput(
  fields: Record<string, OperationHandlerInputFieldExpectation>,
): OperationHandlerInputExpectation {
  return {
    type: "object",
    required: true,
    fields,
  };
}

export function requiredOperationHandlerStringRecordIdInput(): OperationHandlerInputStringRecordIdExpectation {
  return {
    type: "stringRecordId",
    required: true,
  };
}

export function requiredOperationHandlerStringRecordIdArrayInput(): OperationHandlerInputStringRecordIdArrayExpectation {
  return {
    type: "stringRecordIdArray",
    required: true,
    nonEmpty: true,
    rejectDuplicates: true,
  };
}

export function requiredOperationHandlerScalarRecordValueMapInput(): OperationHandlerInputScalarRecordValueMapExpectation {
  return {
    type: "scalarRecordValueMap",
    required: true,
  };
}

export function optionalOperationHandlerScalarRecordValueMapInput(): OperationHandlerInputScalarRecordValueMapExpectation {
  return {
    type: "scalarRecordValueMap",
    required: false,
  };
}

export function requiredOperationHandlerTextInput(): OperationHandlerInputTextExpectation {
  return {
    type: "text",
    required: true,
  };
}

export function getOperationHandlerKindForSelectionCapability<
  Capability extends OperationHandlerSelectionCapability,
>(capability: Capability): OperationHandlerKindBySelectionCapability[Capability] {
  return operationHandlerKindBySelectionCapability[capability];
}

export function operationHandlerKindHasSelectionCapability<
  Capability extends OperationHandlerSelectionCapability,
>(
  kind: OperationHandlerKind,
  capability: Capability,
): kind is OperationHandlerKindBySelectionCapability[Capability] {
  return kind === getOperationHandlerKindForSelectionCapability(capability);
}

export function isOperationHandlerKind(value: unknown): value is OperationHandlerKind {
  return operationHandlerKinds.includes(value as OperationHandlerKind);
}

export function isEntityOperationCommandEffectType(
  value: unknown,
): value is EntityOperationCommandEffectType {
  return entityOperationCommandEffectTypes.includes(value as EntityOperationCommandEffectType);
}

export function isOperationHandlerEffect(
  effect: unknown,
): effect is OperationHandlerEntityOperationEffectSchema {
  return (
    isRecord(effect) && effect.type === "operationHandler" && isOperationHandlerKind(effect.handler)
  );
}

export function isOperationHandlerEffectForKind<Kind extends OperationHandlerKind>(
  effect: unknown,
  kind: Kind,
): effect is OperationHandlerEffectSchemaForKind<Kind> {
  return isOperationHandlerEffect(effect) && effect.handler === kind;
}

export function isOperationHandlerEffectForSelectionCapability<
  Capability extends OperationHandlerSelectionCapability,
>(
  effect: unknown,
  capability: Capability,
): effect is OperationHandlerEffectSchemaForKind<
  OperationHandlerKindBySelectionCapability[Capability]
> {
  return (
    isOperationHandlerEffect(effect) &&
    operationHandlerKindHasSelectionCapability(effect.handler, capability)
  );
}

export function isOperationHandlerPubliclyExecutable(kind: OperationHandlerKind): boolean {
  return getOperationHandlerCapabilities(kind).publicExecution;
}

export function parseOperationHandlerEffect(
  context: string,
  value: Record<string, unknown>,
  scope: EntityOperationScope,
  target: EntityOperationTargetSchema | undefined,
  entityName: string,
  entity: EntitySchema,
  queries: Record<string, CollectionQuerySchema>,
  relationships: Record<string, RelationshipSchema> | undefined,
  parseTransitionSideEffects: TransitionSideEffectParser,
): OperationHandlerEntityOperationEffectSchema {
  assertExactKeys(context, value, ["type", "handler", "config"]);

  const handler = parseOperationHandlerKind(`${context} handler`, value.handler);
  const config = parseOperationHandlerConfig(
    `${context} config`,
    handler,
    value.config,
    scope,
    target,
    entityName,
    entity,
    queries,
    relationships,
    parseTransitionSideEffects,
  );

  return {
    type: "operationHandler",
    handler,
    config,
  } as OperationHandlerEntityOperationEffectSchema;
}

function parseOperationHandlerKind(context: string, value: unknown): OperationHandlerKind {
  if (!isOperationHandlerKind(value)) {
    throw new Error(`${context} must be a supported operation handler kind.`);
  }

  return value;
}

function parseOperationHandlerConfig<Kind extends OperationHandlerKind>(
  context: string,
  handler: Kind,
  value: unknown,
  scope: EntityOperationScope,
  target: EntityOperationTargetSchema | undefined,
  entityName: string,
  entity: EntitySchema,
  queries: Record<string, CollectionQuerySchema>,
  relationships: Record<string, RelationshipSchema> | undefined,
  parseTransitionSideEffects: TransitionSideEffectParser,
): OperationHandlerConfigSchemaByKind[Kind] {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  if (handler === "clear-completed") {
    return parseClearCompletedHandlerConfig(
      context,
      value,
      target,
      entityName,
      entity,
      queries,
    ) as OperationHandlerConfigSchemaByKind[Kind];
  }

  if (handler === "create-missing-join-records") {
    assertExactKeys(context, value, ["join"]);
    const join = parseOperationHandlerJoin(context, value.join, entityName, entity, queries);
    validateCreateMissingJoinRecordDefaults(context, entity, join);
    return { join } as OperationHandlerConfigSchemaByKind[Kind];
  }

  if (handler === "create-selected-join-record") {
    assertExactKeys(context, value, ["relationship"]);
    const relationshipName = parseOperationHandlerRelationshipName(context, value.relationship);
    const relationship = requireManyToManyHandlerRelationship(
      context,
      relationshipName,
      entityName,
      relationships,
    );
    validateJoinRecordDefaults(context, entity, [
      relationship.through.fromField,
      relationship.through.toField,
    ]);
    return { relationship: relationshipName } as OperationHandlerConfigSchemaByKind[Kind];
  }

  if (handler === "remove-selected-join-records") {
    assertExactKeys(context, value, ["relationship"]);
    const relationshipName = parseOperationHandlerRelationshipName(context, value.relationship);
    requireManyToManyHandlerRelationship(context, relationshipName, entityName, relationships);
    return { relationship: relationshipName } as OperationHandlerConfigSchemaByKind[Kind];
  }

  if (handler === "create-tree-child") {
    return parseCreateTreeChildHandlerConfig(
      context,
      value,
      entityName,
      entity,
      relationships,
    ) as OperationHandlerConfigSchemaByKind[Kind];
  }

  if (handler === "remove-tree-placement") {
    assertExactKeys(context, value, ["relationship"]);
    const relationshipName = parseOperationHandlerRelationshipName(context, value.relationship);
    requireToManyHandlerRelationship(context, relationshipName, entityName, relationships);
    return { relationship: relationshipName } as OperationHandlerConfigSchemaByKind[Kind];
  }

  if (handler === "subscribe") {
    assertExactKeys(context, value, []);
    return {} as OperationHandlerConfigSchemaByKind[Kind];
  }

  assertExactKeys(context, value, ["machine", "transition"], ["sideEffects", "targetValues"]);
  return parseTransitionStateHandlerConfig(
    context,
    value,
    scope,
    entity,
    parseTransitionSideEffects,
  ) as OperationHandlerConfigSchemaByKind[Kind];
}

function parseClearCompletedHandlerConfig(
  context: string,
  value: Record<string, unknown>,
  target: EntityOperationTargetSchema | undefined,
  entityName: string,
  entity: EntitySchema,
  queries: Record<string, CollectionQuerySchema>,
): OperationHandlerConfigSchemaByKind["clear-completed"] {
  assertExactKeys(context, value, [], ["query"]);
  if (definitionsToRecord(entity.fields).done?.type !== "boolean") {
    throw new Error(`${context} handler "clear-completed" requires a boolean "done" field.`);
  }
  const queryName = parseOptionalHandlerQueryReference(
    `${context} query`,
    value.query,
    target,
    entityName,
    queries,
  );
  const targetQuery = queries[queryName];

  if (!targetQuery || !isClearCompletedTargetQuery(targetQuery.expression)) {
    throw new Error(`${context} handler "clear-completed" target must be value.done eq true.`);
  }

  return { query: queryName };
}

function parseCreateTreeChildHandlerConfig(
  context: string,
  value: Record<string, unknown>,
  entityName: string,
  entity: EntitySchema,
  relationships: Record<string, RelationshipSchema> | undefined,
): OperationHandlerConfigSchemaByKind["create-tree-child"] {
  assertExactKeys(context, value, ["relationship", "childField"], ["orderField"]);

  const relationshipName = parseOperationHandlerRelationshipName(context, value.relationship);
  const relationship = requireToManyHandlerRelationship(
    context,
    relationshipName,
    entityName,
    relationships,
  );
  const childFieldName = parseRequiredNonEmptyString(`${context} childField`, value.childField);
  const fieldsByKey = definitionsToRecord(entity.fields);
  const childField = fieldsByKey[childFieldName];
  if (!childField) {
    throw new Error(`${context} childField references unknown field "${childFieldName}".`);
  }

  if (childField.type !== "reference") {
    throw new Error(`${context} childField must be a reference field.`);
  }

  if (childField.to !== relationship.from.entity) {
    throw new Error(`${context} childField must reference entity "${relationship.from.entity}".`);
  }

  const orderFieldName =
    value.orderField === undefined
      ? undefined
      : parseRequiredNonEmptyString(`${context} orderField`, value.orderField);
  const orderField = orderFieldName === undefined ? undefined : fieldsByKey[orderFieldName];
  if (orderFieldName !== undefined && !orderField) {
    throw new Error(`${context} orderField references unknown field "${orderFieldName}".`);
  }

  if (orderFieldName !== undefined && orderField?.type !== "number") {
    throw new Error(`${context} orderField must be a number field.`);
  }

  return {
    relationship: relationshipName,
    childField: childFieldName,
    ...(orderFieldName === undefined ? {} : { orderField: orderFieldName }),
  };
}

function parseTransitionStateHandlerConfig(
  context: string,
  value: Record<string, unknown>,
  scope: EntityOperationScope,
  entity: EntitySchema,
  parseTransitionSideEffects: TransitionSideEffectParser,
): OperationHandlerConfigSchemaByKind["transition-state"] {
  const machineName = parseRequiredNonEmptyString(`${context} machine`, value.machine);
  const transitionName = parseRequiredNonEmptyString(`${context} transition`, value.transition);
  const stateMachine = definitionsToRecord(entity.stateMachines)[machineName];
  if (!stateMachine) {
    throw new Error(`${context} references unknown state machine "${machineName}".`);
  }
  if (!definitionsToRecord(stateMachine.transitions)[transitionName]) {
    throw new Error(`${context} references unknown transition "${machineName}.${transitionName}".`);
  }
  const targetValues =
    value.targetValues === undefined
      ? undefined
      : parseTransitionTargetValues(
          `${context} targetValues`,
          value.targetValues,
          scope,
          entity,
          stateMachine.field,
        );
  const sideEffects =
    value.sideEffects === undefined
      ? undefined
      : parseTransitionSideEffects(`${context} sideEffects`, value.sideEffects);

  return {
    machine: machineName,
    transition: transitionName,
    ...(targetValues === undefined ? {} : { targetValues }),
    ...(sideEffects === undefined ? {} : { sideEffects }),
  };
}

function parseTransitionTargetValues(
  context: string,
  value: unknown,
  scope: EntityOperationScope,
  entity: EntitySchema,
  machineField: string,
): Record<string, RecordPlanGeneratedDateExpressionSchema> {
  if (scope !== "record") {
    throw new Error(`${context} requires a record-scoped transition operation.`);
  }

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    throw new Error(`${context} must not be empty.`);
  }

  const fields = definitionsToRecord(entity.fields);
  return Object.fromEntries(
    entries.map(([fieldName, expression]) => {
      const fieldContext = `${context}.${fieldName}`;
      if (isSystemFieldName(fieldName)) {
        throw new Error(`${fieldContext} must not target system field "${fieldName}".`);
      }

      const field = fields[fieldName];
      if (!field) {
        throw new Error(`${fieldContext} references unknown field "${fieldName}".`);
      }
      if (fieldName === machineField) {
        throw new Error(`${fieldContext} must not target state machine field "${machineField}".`);
      }
      if (field.type !== "date") {
        throw new Error(`${fieldContext} requires a date destination field.`);
      }
      if (!isRecord(expression) || expression.kind !== "generatedDate") {
        throw new Error(`${fieldContext} must use a generatedDate expression.`);
      }

      return [fieldName, parseGeneratedDateValueExpression(fieldContext, expression)];
    }),
  );
}

export function parseGeneratedDateValueExpression(
  context: string,
  value: Record<string, unknown>,
): RecordPlanGeneratedDateExpressionSchema {
  assertExactKeys(context, value, ["kind", "timeZone"]);
  const timeZone = parseRequiredNonEmptyString(`${context} timeZone`, value.timeZone);
  if (/^[+-]/.test(timeZone)) {
    throw new Error(`${context} timeZone must be a resolvable IANA time-zone identifier.`);
  }

  try {
    new Intl.DateTimeFormat("en", { timeZone }).resolvedOptions();
  } catch {
    throw new Error(`${context} timeZone must be a resolvable IANA time-zone identifier.`);
  }

  return { kind: "generatedDate", timeZone };
}

function parseOptionalHandlerQueryReference(
  context: string,
  value: unknown,
  target: EntityOperationTargetSchema | undefined,
  entityName: string,
  queries: Record<string, CollectionQuerySchema>,
): string {
  const queryName =
    value === undefined
      ? target?.query
      : parseOperationQueryReference(context, value, entityName, queries);

  if (queryName === undefined) {
    throw new Error(`${context} is required when command target is omitted.`);
  }

  if (target !== undefined && target.query !== queryName) {
    throw new Error(`${context} must match target query "${target.query}".`);
  }

  return queryName;
}

function parseOperationHandlerJoin(
  context: string,
  value: unknown,
  entityName: string,
  entity: EntitySchema,
  queries: Record<string, CollectionQuerySchema>,
): OperationHandlerJoinSchema {
  if (!isRecord(value)) {
    throw new Error(`${context} join must be an object.`);
  }

  assertExactKeys(`${context} join`, value, ["left", "right"]);

  const left = parseOperationHandlerJoinSource(
    `${context} join left`,
    value.left,
    entityName,
    entity,
    queries,
  );
  const right = parseOperationHandlerJoinSource(
    `${context} join right`,
    value.right,
    entityName,
    entity,
    queries,
  );

  if (left.field === right.field) {
    throw new Error(`${context} join fields must be different.`);
  }

  return { left, right };
}

function parseOperationHandlerJoinSource(
  context: string,
  value: unknown,
  entityName: string,
  entity: EntitySchema,
  queries: Record<string, CollectionQuerySchema>,
): OperationHandlerJoinSchema["left"] {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }
  assertExactKeys(context, value, ["field", "query"]);
  const fieldName = parseRequiredNonEmptyString(`${context} field`, value.field);
  const queryName = parseRequiredNonEmptyString(`${context} query`, value.query);
  const field = definitionsToRecord(entity.fields)[fieldName];
  if (!field) {
    throw new Error(`${context} references unknown field "${entityName}.${fieldName}".`);
  }

  if (field.type !== "reference") {
    throw new Error(`${context} field "${fieldName}" must be a reference field.`);
  }

  const query = queries[queryName];
  if (!query) {
    throw new Error(`${context} references unknown query "${queryName}".`);
  }

  if (query.entity !== field.to) {
    throw new Error(`${context} query "${queryName}" must use entity "${field.to}".`);
  }

  if (collectQueryContextNames(query.expression).length > 0) {
    throw new Error(`${context} query "${queryName}" must not require context.`);
  }

  return { field: fieldName, query: queryName };
}

function validateCreateMissingJoinRecordDefaults(
  context: string,
  entity: EntitySchema,
  join: OperationHandlerJoinSchema,
) {
  validateJoinRecordDefaults(context, entity, [join.left.field, join.right.field]);
}

function validateJoinRecordDefaults(
  context: string,
  entity: EntitySchema,
  joinFieldNames: string[],
) {
  const joinFields = new Set(joinFieldNames);
  for (const field of entity.fields) {
    const fieldName = field.key;
    if (joinFields.has(fieldName) || !field.required || fieldHasCreateDefault(field)) {
      continue;
    }

    throw new Error(
      `${context} handler "create-selected-join-record" requires field "${fieldName}" to have a default.`,
    );
  }
}

function parseOperationHandlerRelationshipName(context: string, value: unknown): string {
  return parseRequiredNonEmptyString(`${context} relationship`, value);
}

function requireManyToManyHandlerRelationship(
  context: string,
  relationshipName: string,
  entityName: string,
  relationships: Record<string, RelationshipSchema> | undefined,
): Extract<
  RelationshipSchema,
  {
    kind: "manyToMany";
  }
> {
  const relationship = relationships?.[relationshipName];
  if (!relationship) {
    throw new Error(`${context} references unknown relationship "${relationshipName}".`);
  }

  if (relationship.kind !== "manyToMany") {
    throw new Error(`${context} relationship "${relationshipName}" must be manyToMany.`);
  }

  if (relationship.through.entity !== entityName) {
    throw new Error(
      `${context} relationship "${relationshipName}" uses through entity "${relationship.through.entity}", not "${entityName}".`,
    );
  }

  return relationship;
}

function requireToManyHandlerRelationship(
  context: string,
  relationshipName: string,
  entityName: string,
  relationships: Record<string, RelationshipSchema> | undefined,
): Extract<
  RelationshipSchema,
  {
    kind: "toMany";
  }
> {
  const relationship = relationships?.[relationshipName];
  if (!relationship) {
    throw new Error(`${context} references unknown relationship "${relationshipName}".`);
  }

  if (relationship.kind !== "toMany") {
    throw new Error(`${context} relationship "${relationshipName}" must be toMany.`);
  }

  if (relationship.to.entity !== entityName) {
    throw new Error(
      `${context} relationship "${relationshipName}" targets entity "${relationship.to.entity}", not "${entityName}".`,
    );
  }

  return relationship;
}

function isClearCompletedTargetQuery(query: CollectionQuerySchema["expression"]) {
  return (
    query.kind === "where" &&
    query.op === "eq" &&
    query.value === true &&
    fieldRefsEqual(query.ref, { kind: "value", name: "done" })
  );
}

function parseOperationQueryReference(
  context: string,
  value: unknown,
  entityName: string,
  queries: Record<string, CollectionQuerySchema>,
): string {
  const queryName = parseRequiredNonEmptyString(context, value);
  const query = queries[queryName];

  if (!query) {
    throw new Error(`${context} references unknown query "${queryName}".`);
  }

  if (query.entity !== entityName) {
    throw new Error(`${context} query "${queryName}" must use entity "${entityName}".`);
  }

  return queryName;
}
