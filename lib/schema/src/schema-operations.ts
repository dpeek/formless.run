import { assertSchemaLocalEntityKey, parseQualifiedEntityName } from "./entity-names.ts";
import { fieldHasCreateDefault } from "./field-types.ts";
import { isSystemFieldName } from "./fields.ts";
import { parseAccessRequirement } from "./schema-authorization.ts";
import {
  isSupportedIdentityReferenceTarget,
  parseOptionalOperationTextFieldFormat,
  parseOptionalTextSuggestions,
} from "./schema-fields.ts";
import {
  isEntityOperationCommandEffectType,
  isOperationHandlerEffectForKind,
  parseGeneratedDateValueExpression,
  parseOperationHandlerEffect,
} from "./schema-operation-execution.ts";
import { collectQueryContextNames, queryRequiresContextEqualityOnEveryBranch } from "./query.ts";
import {
  assertExactKeys,
  definitionsToRecord,
  isFiniteNumber,
  isRecord,
  parseKeyedDefinitionArray,
  parseOptionalNonEmptyString,
  parseRequiredNonEmptyString,
} from "./schema-parse-helpers.ts";
import type {
  AccessRequirement,
  AppAuthorizationSchema,
  CollectionOperationBindingSchema,
  CollectionQuerySchema,
  CreateRecordEntityOperationEffectSchema,
  DeleteRecordEntityOperationEffectSchema,
  EntityOperationActorKind,
  EntityOperationAuditInputPolicy,
  EntityOperationAuditSchema,
  EntityOperationEffectSchema,
  EntityOperationIdempotencySchema,
  EntityOperationInlineInputFieldSchema,
  EntityOperationInputContractSchema,
  EntityOperationInputFieldSchema,
  EntityOperationKind,
  EntityOperationOutputContractSchema,
  EntityOperationPolicySchema,
  EntityOperationSchema,
  EntityOperationScope,
  EntityOperationTargetSchema,
  EntitySchema,
  EnumValueSchema,
  FieldSchema,
  KeyedDefinition,
  OperationHandlerEntityOperationEffectSchema,
  OperationAccessPolicySchema,
  OperationChallengePolicySchema,
  OperationOriginPolicySchema,
  OperationRateLimitPolicySchema,
  PatchRecordEntityOperationEffectSchema,
  QueryExpression,
  RelationshipSchema,
  RecordPlanActorContextField,
  RecordPlanEntityOperationEffectSchema,
  RecordPlanGeneratedCodeAlphabet,
  RecordPlanRecordIdExpressionSchema,
  RecordPlanSourceContextField,
  RecordPlanStepKind,
  RecordPlanStepOutputExpressionSchema,
  RecordPlanValueExpressionSchema,
  TableOperationBindingSchema,
  TransitionSideEffectRecordPlanSchema,
} from "./types.ts";

export const entityOperationKinds = [
  "list",
  "get",
  "create",
  "update",
  "delete",
  "command",
] as const satisfies readonly EntityOperationKind[];

export const entityOperationScopes = [
  "collection",
  "record",
] as const satisfies readonly EntityOperationScope[];

const entityOperationActorKinds = [
  "admin",
  "cliDeployer",
  "owner",
  "runner",
  "authenticated",
  "anonymous",
] as const satisfies readonly EntityOperationActorKind[];

export const entityOperationBindingKinds = ["collection", "table"] as const;

export type EntityOperationBindingKind = (typeof entityOperationBindingKinds)[number];

const entityOperationAuditInputPolicies = [
  "none",
  "hash",
  "summary",
  "snapshot",
] as const satisfies readonly EntityOperationAuditInputPolicy[];

const recordPlanStepKinds = [
  "create",
  "patch",
  "delete",
  "tombstone",
] as const satisfies readonly RecordPlanStepKind[];

const recordPlanActorContextFields = [
  "mode",
  "principalId",
] as const satisfies readonly RecordPlanActorContextField[];

const recordPlanSourceContextFields = [
  "protocol",
  "route",
  "host",
  "path",
] as const satisfies readonly RecordPlanSourceContextField[];

const recordPlanGeneratedCodeAlphabets = [
  "digits",
  "upperAlpha",
  "upperAlphaNumeric",
  "upperAlphaNumericNoConfusables",
] as const satisfies readonly RecordPlanGeneratedCodeAlphabet[];

const maxGeneratedCodeLength = 128;

export const PUBLIC_LIST_OPERATION_MAX_RESULTS = 100;

export type ParsedEntityOperationKey = {
  entityKey: string;
  operationKey: string;
};

export type EntityOperationBindingClassification = {
  kind: EntityOperationBindingKind;
  operationKey: ParsedEntityOperationKey;
  canonicalOperationKey: string;
};

type ParsedRecordPlanStep = {
  entity: string;
  kind: RecordPlanStepKind;
};

type RecordPlanParseOptions = {
  createOnly?: boolean;
  target?: {
    entity: EntitySchema;
    entityName: string;
  };
};

type ParsedRecordPlanStepSchema = {
  name: string;
  kind: RecordPlanStepKind;
  entity: string;
  recordId?: RecordPlanRecordIdExpressionSchema;
  values?: Record<string, RecordPlanValueExpressionSchema>;
};

export function formatEntityOperationKey(input: ParsedEntityOperationKey): string {
  assertSchemaLocalEntityKey(`Entity operation key entity "${input.entityKey}"`, input.entityKey);
  assertEntityOperationKey(
    `Entity operation key operation "${input.operationKey}"`,
    input.operationKey,
  );

  return `${input.entityKey}.${input.operationKey}`;
}

export function parseEntityOperationKey(context: string, value: unknown): ParsedEntityOperationKey {
  const key = parseRequiredNonEmptyString(context, value);
  const parts = key.split(".");

  if (parts.length !== 2) {
    throw new Error(`${context} must use "<entity-key>.<operation-key>" format.`);
  }

  const [entityKey, operationKey] = parts;

  assertSchemaLocalEntityKey(`${context} entity "${entityKey}"`, entityKey);
  assertEntityOperationKey(`${context} operation "${operationKey}"`, operationKey);

  return { entityKey, operationKey };
}

export function isEntityOperationWriteKind(kind: EntityOperationKind): boolean {
  return kind === "create" || kind === "update" || kind === "delete" || kind === "command";
}

export function isEntityOperationReadKind(kind: EntityOperationKind): boolean {
  return kind === "list" || kind === "get";
}

export function isEntityOperationCommandKind(kind: EntityOperationKind): boolean {
  return kind === "command";
}

export function isEntityOperationBindingKind(value: unknown): value is EntityOperationBindingKind {
  return entityOperationBindingKinds.includes(value as EntityOperationBindingKind);
}

export function classifyCollectionOperationBinding(
  binding: CollectionOperationBindingSchema,
): EntityOperationBindingClassification {
  const operationKey = parseEntityOperationKey(
    "Collection operation binding operation",
    binding.operation,
  );

  return {
    kind: "collection",
    operationKey,
    canonicalOperationKey: formatEntityOperationKey(operationKey),
  };
}

export function classifyTableOperationBinding(
  binding: TableOperationBindingSchema,
): EntityOperationBindingClassification {
  const operationKey = parseEntityOperationKey(
    "Table operation binding operation",
    binding.operation,
  );

  return {
    kind: "table",
    operationKey,
    canonicalOperationKey: formatEntityOperationKey(operationKey),
  };
}

export function isEntityOperationCommandEffect(
  effect: EntityOperationEffectSchema | undefined,
): effect is OperationHandlerEntityOperationEffectSchema | RecordPlanEntityOperationEffectSchema {
  return effect !== undefined && isEntityOperationCommandEffectType(effect.type);
}

export function isEntityOperationVisibleToBrowser(operation: EntityOperationSchema) {
  if (operation.policy?.visible === false) {
    return false;
  }

  if (operation.access !== undefined) {
    return accessRequirementHasBrowserActor(operation.access);
  }

  const actors = operation.policy?.actors;
  return (
    actors === undefined ||
    actors.includes("admin") ||
    actors.includes("authenticated") ||
    actors.includes("owner") ||
    actors.includes("anonymous")
  );
}

function accessRequirementHasBrowserActor(requirement: AccessRequirement): boolean {
  if ("anyOf" in requirement) {
    return requirement.anyOf.some(accessRequirementHasBrowserActor);
  }
  return (
    "role" in requirement ||
    requirement.actor === "anonymous" ||
    requirement.actor === "authenticated" ||
    requirement.actor === "owner"
  );
}

export function parseEntityOperationsForEntities(
  entities: KeyedDefinition<EntitySchema>[],
  operationInputsByEntity: Record<string, unknown>,
  queries: Record<string, CollectionQuerySchema>,
  relationships: Record<string, RelationshipSchema> | undefined,
  authorization: AppAuthorizationSchema | undefined,
): KeyedDefinition<EntitySchema>[] {
  const entitiesByKey = definitionsToRecord(entities);
  const entitiesWithOperations = entities.map((entity) => {
    const entityName = entity.key;
    const operations =
      parseEntityOperations(
        entityName,
        operationInputsByEntity[entityName],
        entity,
        entitiesByKey,
        queries,
        relationships,
        authorization,
      ) ?? [];
    return operations.length > 0 ? { ...entity, operations } : entity;
  });
  return entitiesWithOperations;
}
function parseEntityOperations(
  entityName: string,
  value: unknown,
  entity: EntitySchema,
  entities: Record<string, EntitySchema>,
  queries: Record<string, CollectionQuerySchema>,
  relationships: Record<string, RelationshipSchema> | undefined,
  authorization: AppAuthorizationSchema | undefined,
): KeyedDefinition<EntityOperationSchema>[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Entity "${entityName}" operations must not be empty.`);
  }
  return parseKeyedDefinitionArray(
    `Entity "${entityName}" operations`,
    value,
    (operationName, operation) => {
      assertEntityOperationKey(
        `Entity "${entityName}" operation key "${operationName}"`,
        operationName,
      );
      return parseEntityOperation(
        entityName,
        operationName,
        operation,
        entity,
        entities,
        queries,
        relationships,
        authorization,
      );
    },
  );
}
function parseEntityOperation(
  entityName: string,
  operationName: string,
  value: unknown,
  entity: EntitySchema,
  entities: Record<string, EntitySchema>,
  queries: Record<string, CollectionQuerySchema>,
  relationships: Record<string, RelationshipSchema> | undefined,
  authorization: AppAuthorizationSchema | undefined,
): EntityOperationSchema {
  const context = `Entity operation "${formatEntityOperationKey({
    entityKey: entityName,
    operationKey: operationName,
  })}"`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(
    context,
    value,
    ["key", "kind", "scope"],
    ["access", "label", "input", "target", "effect", "output", "policy", "audit", "idempotency"],
  );
  const kind = parseOperationKind(`${context} kind`, value.kind);
  const scope = parseOperationScope(`${context} scope`, value.scope);
  validateOperationKindScope(context, kind, scope);

  const label = parseOptionalNonEmptyString(`${context} label`, value.label);
  const access =
    value.access === undefined
      ? undefined
      : parseAccessRequirement(value.access, { authorization }, `${context} access`);
  const input = parseOperationInput(`${context} input`, value.input, kind, entity);
  const target = parseOperationTarget(`${context} target`, value.target, entityName, queries);
  const output = parseOperationOutput(
    `${context} output`,
    value.output,
    kind,
    target,
    entityName,
    queries,
  );
  const effect = parseOperationEffect(
    `${context} effect`,
    value.effect,
    kind,
    scope,
    input,
    target,
    entityName,
    entity,
    entities,
    queries,
    relationships,
  );
  const idempotency = parseOperationIdempotency(`${context} idempotency`, value.idempotency, kind);
  const audit = parseOperationAudit(`${context} audit`, value.audit);
  const policy = parseOperationPolicy(`${context} policy`, value.policy);
  validateOperationAuthorizationSources(context, access, policy);
  validateOperationPublicPolicy(
    context,
    kind,
    input,
    effect,
    output,
    access,
    policy,
    entity,
    queries,
  );

  return {
    ...(label === undefined ? {} : { label }),
    ...(access === undefined ? {} : { access }),
    kind,
    scope,
    ...(input === undefined ? {} : { input }),
    ...(target === undefined ? {} : { target }),
    ...(effect === undefined ? {} : { effect }),
    output,
    idempotency,
    audit,
    ...(policy === undefined ? {} : { policy }),
  };
}

function validateOperationAuthorizationSources(
  context: string,
  access: AccessRequirement | undefined,
  policy: EntityOperationPolicySchema | undefined,
) {
  if (access !== undefined && policy?.actors !== undefined) {
    throw new Error(`${context} must not declare both top-level access and policy.actors.`);
  }
  if (access === undefined && policy !== undefined && policy.actors === undefined) {
    throw new Error(`${context} policy must declare actors when top-level access is absent.`);
  }
  if (policy?.access !== undefined && !operationAdmissionIncludesAnonymous(access, policy)) {
    throw new Error(`${context} policy access requires anonymous actor policy.`);
  }
}

function operationAdmissionIncludesAnonymous(
  access: AccessRequirement | undefined,
  policy: EntityOperationPolicySchema | undefined,
): boolean {
  if (access === undefined) {
    return policy?.actors?.includes("anonymous") === true;
  }
  if ("anyOf" in access) {
    return access.anyOf.some(
      (alternative) => "actor" in alternative && alternative.actor === "anonymous",
    );
  }
  return "actor" in access && access.actor === "anonymous";
}

function validateOperationPublicPolicy(
  context: string,
  kind: EntityOperationKind,
  input: EntityOperationInputContractSchema | undefined,
  effect: EntityOperationEffectSchema | undefined,
  output: EntityOperationOutputContractSchema,
  access: AccessRequirement | undefined,
  policy: EntityOperationPolicySchema | undefined,
  entity: EntitySchema,
  queries: Record<string, CollectionQuerySchema>,
) {
  if (!operationAdmissionIncludesAnonymous(access, policy)) {
    return;
  }

  if (
    kind === "command" &&
    !(
      effect?.type === "recordPlan" ||
      isOperationHandlerEffectForKind(effect, "contact-subscription.subscribe")
    )
  ) {
    throw new Error(`${context} command effect is not eligible for public execution.`);
  }

  if (input === undefined) {
    throw new Error(`${context} anonymous actor policy requires explicit input.`);
  }
  if (policy === undefined) {
    throw new Error(`${context} anonymous operation access requires explicit public policy.`);
  }

  if (kind === "list") {
    validateAnonymousPublicListOperation(context, input, output, policy, entity, queries);
    return;
  }

  if ((kind === "create" || kind === "command") && policy.access?.challenge?.kind !== "turnstile") {
    throw new Error(`${context} anonymous ${kind} access requires a Turnstile challenge.`);
  }
}

function validateAnonymousPublicListOperation(
  context: string,
  input: EntityOperationInputContractSchema,
  output: EntityOperationOutputContractSchema,
  policy: EntityOperationPolicySchema,
  entity: EntitySchema,
  queries: Record<string, CollectionQuerySchema>,
) {
  if (output.type !== "list") {
    throw new Error(`${context} anonymous list access requires list output.`);
  }

  if (output.maxResults === undefined || output.maxResults > PUBLIC_LIST_OPERATION_MAX_RESULTS) {
    throw new Error(
      `${context} anonymous list output maxResults must be at most ${PUBLIC_LIST_OPERATION_MAX_RESULTS}.`,
    );
  }

  const access = policy.access;
  if (access === undefined) {
    throw new Error(`${context} anonymous list access requires explicit access policy.`);
  }

  if (access.rateLimit === undefined) {
    throw new Error(`${context} anonymous list access requires an explicit rate limit.`);
  }

  const anonymousResponseFields = policy.responseFields?.anonymous;
  if (anonymousResponseFields === undefined) {
    throw new Error(`${context} anonymous list access requires anonymous response fields.`);
  }
  for (const fieldName of anonymousResponseFields) {
    if (definitionsToRecord(entity.fields)[fieldName] === undefined) {
      throw new Error(
        `${context} policy responseFields.anonymous references unknown value field "${fieldName}".`,
      );
    }
  }

  const query = queries[output.query];
  if (!query) {
    throw new Error(`${context} output query references unknown query "${output.query}".`);
  }

  const contextNames = collectQueryContextNames(query.expression);
  for (const contextName of contextNames) {
    validateAnonymousListQueryContext(context, contextName, query.expression, input, entity);
  }

  if (!queryRequiresContextEqualityOnEveryBranch(query.expression, contextNames)) {
    throw new Error(
      `${context} anonymous list query must require exact equality against declared input on every matching branch.`,
    );
  }
}

function validateAnonymousListQueryContext(
  context: string,
  contextName: string,
  expression: QueryExpression,
  input: EntityOperationInputContractSchema,
  entity: EntitySchema,
) {
  const inputField = definitionsToRecord(input.fields)[contextName];
  if (inputField === undefined) {
    throw new Error(
      `${context} anonymous list query context "${contextName}" references undeclared input.`,
    );
  }

  if (!isOperationInputFieldRequired(inputField)) {
    throw new Error(
      `${context} anonymous list query context "${contextName}" requires required input.`,
    );
  }
  const inputValueField =
    "field" in inputField ? definitionsToRecord(entity.fields)[inputField.field] : inputField;
  if (
    inputValueField === undefined ||
    !["text", "boolean", "date", "number", "enum"].includes(inputValueField.type)
  ) {
    throw new Error(
      `${context} anonymous list query context "${contextName}" requires scalar input.`,
    );
  }
  for (const queryFieldName of collectQueryContextFieldNames(expression, contextName)) {
    const queryField = definitionsToRecord(entity.fields)[queryFieldName];
    if (
      queryField === undefined ||
      !areOperationInputAndQueryFieldsCompatible(inputValueField, queryField)
    ) {
      throw new Error(
        `${context} anonymous list query context "${contextName}" is incompatible with value field "${queryFieldName}".`,
      );
    }
  }
}

function areOperationInputAndQueryFieldsCompatible(
  inputField: FieldSchema,
  queryField: FieldSchema,
): boolean {
  if (inputField.type !== queryField.type) {
    return false;
  }

  if (inputField.type !== "enum" || queryField.type !== "enum") {
    return true;
  }
  const queryValues = definitionsToRecord(queryField.values);
  return inputField.values.every((value) => queryValues[value.key] !== undefined);
}
function collectQueryContextFieldNames(expression: QueryExpression, contextName: string): string[] {
  if (expression.kind === "and" || expression.kind === "or") {
    return expression.expressions.flatMap((child) =>
      collectQueryContextFieldNames(child, contextName),
    );
  }

  if (
    expression.kind === "where" &&
    expression.ref.kind === "value" &&
    typeof expression.value === "object" &&
    expression.value.kind === "context" &&
    expression.value.name === contextName
  ) {
    return [expression.ref.name];
  }

  return [];
}

function assertEntityOperationKey(context: string, value: string) {
  if (
    value.trim() === "" ||
    value.trim() !== value ||
    value.includes(".") ||
    value.includes("/") ||
    value.includes(":") ||
    /\s/.test(value)
  ) {
    throw new Error(
      `${context} must be non-empty and must not contain whitespace, dots, slashes, or colons.`,
    );
  }
}

function parseOperationKind(context: string, value: unknown): EntityOperationKind {
  if (!entityOperationKinds.includes(value as EntityOperationKind)) {
    throw new Error(`${context} must be list, get, create, update, delete, or command.`);
  }

  return value as EntityOperationKind;
}

function parseOperationScope(context: string, value: unknown): EntityOperationScope {
  if (!entityOperationScopes.includes(value as EntityOperationScope)) {
    throw new Error(`${context} must be collection or record.`);
  }

  return value as EntityOperationScope;
}

function validateOperationKindScope(
  context: string,
  kind: EntityOperationKind,
  scope: EntityOperationScope,
) {
  if ((kind === "list" || kind === "create") && scope !== "collection") {
    throw new Error(`${context} kind "${kind}" must use collection scope.`);
  }

  if ((kind === "get" || kind === "update" || kind === "delete") && scope !== "record") {
    throw new Error(`${context} kind "${kind}" must use record scope.`);
  }
}

function parseOperationInput(
  context: string,
  value: unknown,
  kind: EntityOperationKind,
  entity: EntitySchema,
): EntityOperationInputContractSchema | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }
  assertExactKeys(context, value, ["fields"]);
  if (!Array.isArray(value.fields) || value.fields.length === 0) {
    throw new Error(`${context} fields must not be empty.`);
  }
  return {
    fields: parseKeyedDefinitionArray(`${context} fields`, value.fields, (fieldName, field) => {
      assertOperationInputFieldName(`${context} field "${fieldName}"`, fieldName);
      return parseOperationInputField(`${context} fields.${fieldName}`, field, kind, entity);
    }),
  };
}
function assertOperationInputFieldName(context: string, value: string) {
  if (value.trim() === "") {
    throw new Error(`${context} must be non-empty.`);
  }
}

function isOperationInputFieldRequired(field: EntityOperationInputFieldSchema): boolean {
  return "field" in field ? field.required === true : field.required;
}

function parseOperationInputField(
  context: string,
  value: unknown,
  kind: EntityOperationKind,
  entity: EntitySchema,
): EntityOperationInputFieldSchema {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }
  if ("field" in value) {
    assertExactKeys(context, value, ["key", "field"], ["required", "label", "mustBeTrue"]);
    const fieldName = parseRequiredNonEmptyString(`${context} field`, value.field);
    const entityField = definitionsToRecord(entity.fields)[fieldName];
    if (!entityField) {
      throw new Error(`${context} references unknown field "${fieldName}".`);
    }

    const required = parseOptionalBoolean(`${context} required`, value.required);
    const label = parseOptionalNonEmptyString(`${context} label`, value.label);
    const mustBeTrue = parseOptionalAffirmativeConstraint(
      `${context} mustBeTrue`,
      value.mustBeTrue,
    );

    if (mustBeTrue && entityField.type !== "boolean") {
      throw new Error(`${context} mustBeTrue requires a boolean entity field.`);
    }

    if (mustBeTrue && required !== true) {
      throw new Error(`${context} mustBeTrue requires required to be true.`);
    }

    return {
      field: fieldName,
      ...(required === undefined ? {} : { required }),
      ...(label === undefined ? {} : { label }),
      ...(mustBeTrue === undefined ? {} : { mustBeTrue }),
    };
  }

  if (kind !== "command" && kind !== "list") {
    throw new Error(
      `${context} inline scalar fields are only supported for command or list operations.`,
    );
  }

  return parseInlineInputField(context, value);
}

function parseOptionalAffirmativeConstraint(context: string, value: unknown): true | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value !== true) {
    throw new Error(`${context} must be true when declared.`);
  }

  return true;
}

function parseInlineInputField(
  context: string,
  value: Record<string, unknown>,
): EntityOperationInlineInputFieldSchema {
  if (typeof value.required !== "boolean") {
    throw new Error(`${context} must declare whether it is required.`);
  }
  const label = parseOptionalNonEmptyString(`${context} label`, value.label);
  if (value.type === "text") {
    assertExactKeys(
      context,
      value,
      ["key", "type", "required"],
      ["label", "format", "suggestions"],
    );
    const format = parseOptionalOperationTextFieldFormat(`${context} format`, value.format);
    const suggestions = parseOptionalTextSuggestions(`${context} suggestions`, value.suggestions);
    return {
      type: "text",
      required: value.required,
      ...(label === undefined ? {} : { label }),
      ...(format === undefined ? {} : { format }),
      ...(suggestions === undefined ? {} : { suggestions }),
    };
  }
  if (value.type === "boolean") {
    assertExactKeys(context, value, ["key", "type", "required"], ["label"]);
    return {
      type: "boolean",
      required: value.required,
      ...(label === undefined ? {} : { label }),
    };
  }
  if (value.type === "date") {
    assertExactKeys(context, value, ["key", "type", "required"], ["label"]);
    return { type: "date", required: value.required, ...(label === undefined ? {} : { label }) };
  }
  if (value.type === "number") {
    assertExactKeys(context, value, ["key", "type", "required"], ["label"]);
    return {
      type: "number",
      required: value.required,
      ...(label === undefined ? {} : { label }),
    };
  }
  if (value.type === "enum") {
    assertExactKeys(context, value, ["key", "type", "required", "values"], ["label"]);
    return {
      type: "enum",
      required: value.required,
      values: parseInlineInputEnumValues(`${context} values`, value.values),
      ...(label === undefined ? {} : { label }),
    };
  }

  throw new Error(`${context} has unsupported type "${String(value.type)}".`);
}

function parseInlineInputEnumValues(
  context: string,
  value: unknown,
): KeyedDefinition<EnumValueSchema>[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${context} must not be empty.`);
  }
  return parseKeyedDefinitionArray(context, value, (enumValue, enumValueSchema) => {
    assertExactKeys(`${context}.${enumValue}`, enumValueSchema, ["key", "label"]);
    const label = parseRequiredNonEmptyString(
      `${context}.${enumValue} label`,
      enumValueSchema.label,
    );
    return { label };
  });
}
function parseOperationTarget(
  context: string,
  value: unknown,
  entityName: string,
  queries: Record<string, CollectionQuerySchema>,
): EntityOperationTargetSchema | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["query"]);

  const query = parseOperationQueryReference(`${context} query`, value.query, entityName, queries);
  return { query };
}

function parseOperationOutput(
  context: string,
  value: unknown,
  kind: EntityOperationKind,
  target: EntityOperationTargetSchema | undefined,
  entityName: string,
  queries: Record<string, CollectionQuerySchema>,
): EntityOperationOutputContractSchema {
  if (value === undefined) {
    return defaultOperationOutput(context, kind, target);
  }

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  if (value.type === "list") {
    assertExactKeys(context, value, ["type", "query"], ["maxResults"]);
    validateOperationOutputKind(context, kind, "list");
    const query = parseOperationQueryReference(
      `${context} query`,
      value.query,
      entityName,
      queries,
    );
    const maxResults = parseOptionalPositiveInteger(`${context} maxResults`, value.maxResults);
    return {
      type: "list",
      query,
      ...(maxResults === undefined ? {} : { maxResults }),
    };
  }

  if (value.type === "get") {
    assertExactKeys(context, value, ["type"]);
    validateOperationOutputKind(context, kind, "get");
    return { type: "get" };
  }

  if (value.type === "create") {
    assertExactKeys(context, value, ["type"]);
    validateOperationOutputKind(context, kind, "create");
    return { type: "create" };
  }

  if (value.type === "update") {
    assertExactKeys(context, value, ["type"]);
    validateOperationOutputKind(context, kind, "update");
    return { type: "update" };
  }

  if (value.type === "delete") {
    assertExactKeys(context, value, ["type"]);
    validateOperationOutputKind(context, kind, "delete");
    return { type: "delete" };
  }

  if (value.type === "command") {
    assertExactKeys(context, value, ["type"]);
    validateOperationOutputKind(context, kind, "command");
    return { type: "command" };
  }

  throw new Error(`${context} has unsupported type "${String(value.type)}".`);
}

function defaultOperationOutput(
  context: string,
  kind: EntityOperationKind,
  target: EntityOperationTargetSchema | undefined,
): EntityOperationOutputContractSchema {
  if (kind === "list") {
    if (target === undefined) {
      throw new Error(
        `${context} for list operations requires a target query or explicit output query.`,
      );
    }

    return { type: "list", query: target.query };
  }

  if (kind === "get") {
    return { type: "get" };
  }

  if (kind === "create") {
    return { type: "create" };
  }

  if (kind === "update") {
    return { type: "update" };
  }

  if (kind === "delete") {
    return { type: "delete" };
  }

  return { type: "command" };
}

function validateOperationOutputKind(
  context: string,
  operationKind: EntityOperationKind,
  outputKind: EntityOperationKind,
) {
  if (operationKind !== outputKind) {
    throw new Error(
      `${context} type "${outputKind}" must match operation kind "${operationKind}".`,
    );
  }
}

function parseOperationEffect(
  context: string,
  value: unknown,
  kind: EntityOperationKind,
  scope: EntityOperationScope,
  input: EntityOperationInputContractSchema | undefined,
  target: EntityOperationTargetSchema | undefined,
  entityName: string,
  entity: EntitySchema,
  entities: Record<string, EntitySchema>,
  queries: Record<string, CollectionQuerySchema>,
  relationships: Record<string, RelationshipSchema> | undefined,
): EntityOperationEffectSchema | undefined {
  if (value === undefined) {
    return defaultOperationEffect(context, kind);
  }

  if (kind === "list" || kind === "get") {
    throw new Error(`${context} is not supported for read operations.`);
  }

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  if (value.type === "createRecord") {
    assertExactKeys(context, value, ["type"], ["entity"]);
    validateOperationEffectKind(context, kind, "create");
    return {
      type: "createRecord",
      ...parseOperationEffectEntity(context, value.entity, entityName),
    };
  }

  if (value.type === "patchRecord") {
    assertExactKeys(context, value, ["type"], ["entity"]);
    validateOperationEffectKind(context, kind, "update");
    return {
      type: "patchRecord",
      ...parseOperationEffectEntity(context, value.entity, entityName),
    };
  }

  if (value.type === "deleteRecord" || value.type === "tombstoneRecord") {
    assertExactKeys(context, value, ["type"], ["entity"]);
    validateOperationEffectKind(context, kind, "delete");
    return {
      type: value.type,
      ...parseOperationEffectEntity(context, value.entity, entityName),
    };
  }

  if (value.type === "operationHandler") {
    validateOperationEffectKind(context, kind, "command");
    return parseOperationHandlerEffect(
      context,
      value,
      scope,
      target,
      entityName,
      entity,
      entities,
      queries,
      relationships,
      (sideEffectsContext, sideEffectsValue) => {
        if (scope !== "record") {
          throw new Error(`${sideEffectsContext} requires a record-scoped transition operation.`);
        }

        return parseTransitionSideEffectRecordPlan(
          sideEffectsContext,
          sideEffectsValue,
          input,
          entities,
          { entity, entityName },
        );
      },
    );
  }

  if (value.type === "recordPlan") {
    assertExactKeys(context, value, ["type", "steps"]);
    validateOperationEffectKind(context, kind, "command");
    return parseRecordPlanEffect(
      context,
      value,
      input,
      entities,
      scope === "record" ? { entity, entityName } : undefined,
    );
  }

  throw new Error(`${context} has unsupported type "${String(value.type)}".`);
}

function defaultOperationEffect(
  context: string,
  kind: EntityOperationKind,
): EntityOperationEffectSchema | undefined {
  if (kind === "create") {
    return { type: "createRecord" };
  }

  if (kind === "update") {
    return { type: "patchRecord" };
  }

  if (kind === "delete") {
    return { type: "deleteRecord" };
  }

  if (kind === "command") {
    throw new Error(`${context} is required for command operations.`);
  }

  return undefined;
}

function parseOperationEffectEntity(
  context: string,
  value: unknown,
  entityName: string,
):
  | Pick<CreateRecordEntityOperationEffectSchema, "entity">
  | Pick<PatchRecordEntityOperationEffectSchema, "entity">
  | Pick<DeleteRecordEntityOperationEffectSchema, "entity"> {
  const effectEntity = parseOptionalNonEmptyString(`${context} entity`, value);

  if (effectEntity === undefined) {
    return {};
  }

  if (effectEntity !== entityName) {
    throw new Error(`${context} entity must target containing entity "${entityName}".`);
  }

  return { entity: effectEntity };
}

function validateOperationEffectKind(
  context: string,
  operationKind: EntityOperationKind,
  expectedKind: EntityOperationKind,
) {
  if (operationKind !== expectedKind) {
    throw new Error(`${context} type is only valid for ${expectedKind} operations.`);
  }
}

function parseRecordPlanEffect(
  context: string,
  value: Record<string, unknown>,
  input: EntityOperationInputContractSchema | undefined,
  entities: Record<string, EntitySchema>,
  target: RecordPlanParseOptions["target"],
): RecordPlanEntityOperationEffectSchema {
  return parseRecordPlanEffectWithOptions(
    context,
    value,
    input,
    entities,
    target === undefined ? {} : { target },
  ) as unknown as RecordPlanEntityOperationEffectSchema;
}

function parseTransitionSideEffectRecordPlan(
  context: string,
  value: unknown,
  input: EntityOperationInputContractSchema | undefined,
  entities: Record<string, EntitySchema>,
  target: NonNullable<RecordPlanParseOptions["target"]>,
): TransitionSideEffectRecordPlanSchema {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["type", "steps"]);

  if (value.type !== "recordPlan") {
    throw new Error(`${context} type must be recordPlan.`);
  }

  return parseRecordPlanEffectWithOptions(context, value, input, entities, {
    createOnly: true,
    target,
  }) as unknown as TransitionSideEffectRecordPlanSchema;
}

function parseRecordPlanEffectWithOptions(
  context: string,
  value: Record<string, unknown>,
  input: EntityOperationInputContractSchema | undefined,
  entities: Record<string, EntitySchema>,
  options: RecordPlanParseOptions = {},
): {
  type: "recordPlan";
  steps: ParsedRecordPlanStepSchema[];
} {
  if (!Array.isArray(value.steps) || value.steps.length === 0) {
    throw new Error(`${context} steps must be a non-empty array.`);
  }

  const previousSteps = new Map<string, ParsedRecordPlanStep>();
  const steps = value.steps.map((step, index) => {
    const parsedStep = parseRecordPlanStep(
      `${context} steps[${index}]`,
      step,
      input,
      entities,
      previousSteps,
      options,
    );

    previousSteps.set(parsedStep.name, {
      entity: parsedStep.entity,
      kind: parsedStep.kind,
    });

    return parsedStep;
  });

  return { type: "recordPlan", steps };
}

function parseRecordPlanStep(
  context: string,
  value: unknown,
  input: EntityOperationInputContractSchema | undefined,
  entities: Record<string, EntitySchema>,
  previousSteps: Map<string, ParsedRecordPlanStep>,
  options: RecordPlanParseOptions,
): ParsedRecordPlanStepSchema {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  const kind = parseRecordPlanStepKind(`${context} kind`, value.kind);
  if (options.createOnly && kind !== "create") {
    throw new Error(`${context} kind must be create in transition side-effect plans.`);
  }

  if (kind === "create") {
    assertExactKeys(context, value, ["name", "kind", "entity", "values"], ["recordId"]);
  } else if (kind === "patch") {
    assertExactKeys(context, value, ["name", "kind", "entity", "recordId", "values"]);
  } else {
    assertExactKeys(context, value, ["name", "kind", "entity", "recordId"]);
  }

  const name = parseRecordPlanStepName(`${context} name`, value.name, previousSteps);
  const entityName = parseRecordPlanEntityReference(`${context} entity`, value.entity, entities);
  const entity = entities[entityName];
  if (!entity) {
    throw new Error(`${context} entity references unknown entity "${entityName}".`);
  }

  if (kind === "create") {
    const recordId =
      value.recordId === undefined
        ? undefined
        : parseRecordPlanRecordIdExpression(
            `${context} recordId`,
            value.recordId,
            input,
            entities,
            previousSteps,
            options,
          );
    const values = parseRecordPlanValues(
      `${context} values`,
      value.values,
      entity,
      input,
      entities,
      previousSteps,
      options,
    );

    return {
      name,
      kind,
      entity: entityName,
      ...(recordId === undefined ? {} : { recordId }),
      values,
    };
  }

  const recordId = parseRecordPlanRecordIdExpression(
    `${context} recordId`,
    value.recordId,
    input,
    entities,
    previousSteps,
    options,
  );

  if (kind === "patch") {
    return {
      name,
      kind,
      entity: entityName,
      recordId,
      values: parseRecordPlanValues(
        `${context} values`,
        value.values,
        entity,
        input,
        entities,
        previousSteps,
        options,
      ),
    };
  }

  return { name, kind, entity: entityName, recordId };
}

function parseRecordPlanStepKind(context: string, value: unknown): RecordPlanStepKind {
  if (!recordPlanStepKinds.includes(value as RecordPlanStepKind)) {
    throw new Error(`${context} must be create, patch, delete, or tombstone.`);
  }

  return value as RecordPlanStepKind;
}

function parseRecordPlanStepName(
  context: string,
  value: unknown,
  previousSteps: Map<string, ParsedRecordPlanStep>,
): string {
  const name = parseRequiredNonEmptyString(context, value);

  if (
    name.trim() !== name ||
    name.includes(".") ||
    name.includes("/") ||
    name.includes(":") ||
    /\s/.test(name)
  ) {
    throw new Error(`${context} must not contain whitespace, dots, slashes, or colons.`);
  }

  if (previousSteps.has(name)) {
    throw new Error(`${context} must be unique.`);
  }

  return name;
}

function parseRecordPlanEntityReference(
  context: string,
  value: unknown,
  entities: Record<string, EntitySchema>,
): string {
  const entityName = parseRequiredNonEmptyString(context, value);

  if (entityName.includes(":")) {
    const qualifiedName = parseQualifiedEntityName(`${context} "${entityName}"`, entityName);

    if (entities[qualifiedName.entityKey] !== undefined) {
      throw new Error(
        `${context} "${entityName}" references local entity "${qualifiedName.entityKey}" with a qualified name. Use local entity key "${qualifiedName.entityKey}".`,
      );
    }

    if (isSupportedIdentityReferenceTarget(entityName)) {
      return entityName;
    }

    throw new Error(`${context} must target an entity from the same schema.`);
  }

  assertSchemaLocalEntityKey(`${context} "${entityName}"`, entityName);

  if (!entities[entityName]) {
    throw new Error(`${context} references unknown entity "${entityName}".`);
  }

  return entityName;
}

function parseRecordPlanValues(
  context: string,
  value: unknown,
  entity: EntitySchema,
  input: EntityOperationInputContractSchema | undefined,
  entities: Record<string, EntitySchema>,
  previousSteps: Map<string, ParsedRecordPlanStep>,
  options: RecordPlanParseOptions,
): Record<string, RecordPlanValueExpressionSchema> {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    throw new Error(`${context} must not be empty.`);
  }

  return Object.fromEntries(
    entries.map(([fieldName, expression]) => {
      if (isSystemFieldName(fieldName)) {
        throw new Error(`${context}.${fieldName} must not target system field "${fieldName}".`);
      }
      const field = definitionsToRecord(entity.fields)[fieldName];
      if (!field) {
        throw new Error(`${context}.${fieldName} references unknown field "${fieldName}".`);
      }

      const parsedExpression = parseRecordPlanValueExpression(
        `${context}.${fieldName}`,
        expression,
        input,
        entities,
        previousSteps,
        options,
      );

      validateRecordPlanFieldExpression(
        `${context}.${fieldName}`,
        field,
        parsedExpression,
        previousSteps,
        options,
      );

      return [fieldName, parsedExpression];
    }),
  );
}

function parseRecordPlanValueExpression(
  context: string,
  value: unknown,
  input: EntityOperationInputContractSchema | undefined,
  entities: Record<string, EntitySchema>,
  previousSteps: Map<string, ParsedRecordPlanStep>,
  options: RecordPlanParseOptions,
): RecordPlanValueExpressionSchema {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an expression object.`);
  }

  if (value.kind === "input") {
    return parseRecordPlanInputExpression(context, value, input);
  }

  if (value.kind === "literal") {
    return parseRecordPlanLiteralExpression(context, value);
  }

  if (value.kind === "generatedId") {
    return parseRecordPlanGeneratedIdExpression(context, value);
  }

  if (value.kind === "generatedCode") {
    return parseRecordPlanGeneratedCodeExpression(context, value);
  }

  if (value.kind === "generatedTimestamp") {
    assertExactKeys(context, value, ["kind"]);
    return { kind: "generatedTimestamp" };
  }

  if (value.kind === "generatedDate") {
    return parseRecordPlanGeneratedDateExpression(context, value);
  }

  if (value.kind === "targetRecordId") {
    return parseRecordPlanTargetRecordIdExpression(context, value, options);
  }

  if (value.kind === "targetField") {
    return parseRecordPlanTargetFieldExpression(context, value, options);
  }

  if (value.kind === "actor") {
    return parseRecordPlanActorExpression(context, value);
  }

  if (value.kind === "source") {
    return parseRecordPlanSourceExpression(context, value);
  }

  if (value.kind === "stepOutput") {
    return parseRecordPlanStepOutputExpression(context, value, entities, previousSteps, {
      allowFieldOutput: true,
    });
  }

  if (value.kind === "reference") {
    return parseRecordPlanReferenceExpression(
      context,
      value,
      input,
      entities,
      previousSteps,
      options,
    );
  }

  throw new Error(`${context} has unsupported expression kind "${String(value.kind)}".`);
}

function parseRecordPlanRecordIdExpression(
  context: string,
  value: unknown,
  input: EntityOperationInputContractSchema | undefined,
  entities: Record<string, EntitySchema>,
  previousSteps: Map<string, ParsedRecordPlanStep>,
  options: RecordPlanParseOptions,
): RecordPlanRecordIdExpressionSchema {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an expression object.`);
  }

  if (value.kind === "input") {
    return parseRecordPlanInputExpression(context, value, input);
  }

  if (value.kind === "literal") {
    return parseRecordPlanLiteralExpression(context, value);
  }

  if (value.kind === "generatedId") {
    return parseRecordPlanGeneratedIdExpression(context, value);
  }

  if (value.kind === "targetRecordId") {
    return parseRecordPlanTargetRecordIdExpression(context, value, options);
  }

  if (value.kind === "stepOutput") {
    const stepOutput = parseRecordPlanStepOutputExpression(
      context,
      value,
      entities,
      previousSteps,
      {
        allowFieldOutput: false,
      },
    );

    if (stepOutput.output !== "id") {
      throw new Error(`${context} field output is not valid for record ids.`);
    }

    return stepOutput;
  }

  throw new Error(`${context} has unsupported record id expression kind "${String(value.kind)}".`);
}

function parseRecordPlanTargetRecordIdExpression(
  context: string,
  value: Record<string, unknown>,
  options: RecordPlanParseOptions,
): RecordPlanRecordIdExpressionSchema {
  assertRecordPlanTargetExpressionContext(context, options);
  assertExactKeys(context, value, ["kind"]);
  return { kind: "targetRecordId" };
}

function parseRecordPlanTargetFieldExpression(
  context: string,
  value: Record<string, unknown>,
  options: RecordPlanParseOptions,
): RecordPlanValueExpressionSchema {
  const target = assertRecordPlanTargetExpressionContext(context, options);
  assertExactKeys(context, value, ["kind", "field"]);
  const fieldName = parseRequiredNonEmptyString(`${context} field`, value.field);
  if (!definitionsToRecord(target.entity.fields)[fieldName]) {
    throw new Error(`${context} field references unknown target field "${fieldName}".`);
  }
  return { kind: "targetField", field: fieldName };
}
function assertRecordPlanTargetExpressionContext(
  context: string,
  options: RecordPlanParseOptions,
): NonNullable<RecordPlanParseOptions["target"]> {
  if (!options.target) {
    throw new Error(`${context} is only valid for record-scoped operations.`);
  }

  return options.target;
}

function parseRecordPlanInputExpression(
  context: string,
  value: Record<string, unknown>,
  input: EntityOperationInputContractSchema | undefined,
): RecordPlanRecordIdExpressionSchema {
  assertExactKeys(context, value, ["kind", "field"]);
  const fieldName = parseRequiredNonEmptyString(`${context} field`, value.field);
  if (!definitionsToRecord(input?.fields)[fieldName]) {
    throw new Error(`${context} field references unknown operation input field "${fieldName}".`);
  }
  return { kind: "input", field: fieldName };
}
function parseRecordPlanLiteralExpression(
  context: string,
  value: Record<string, unknown>,
): RecordPlanRecordIdExpressionSchema {
  assertExactKeys(context, value, ["kind", "value"]);

  if (!isRecordPlanLiteralValue(value.value)) {
    throw new Error(`${context} value must be a string, boolean, or finite number.`);
  }

  return { kind: "literal", value: value.value };
}

function parseRecordPlanGeneratedIdExpression(
  context: string,
  value: Record<string, unknown>,
): RecordPlanRecordIdExpressionSchema {
  assertExactKeys(context, value, ["kind"], ["prefix"]);

  const prefix = parseOptionalNonEmptyString(`${context} prefix`, value.prefix);
  return { kind: "generatedId", ...(prefix === undefined ? {} : { prefix }) };
}

function parseRecordPlanGeneratedDateExpression(
  context: string,
  value: Record<string, unknown>,
): RecordPlanValueExpressionSchema {
  return parseGeneratedDateValueExpression(context, value);
}

function parseRecordPlanGeneratedCodeExpression(
  context: string,
  value: Record<string, unknown>,
): RecordPlanValueExpressionSchema {
  assertExactKeys(
    context,
    value,
    ["kind", "alphabet"],
    ["length", "groups", "separator", "prefix"],
  );

  const alphabet = parseRecordPlanGeneratedCodeAlphabet(`${context} alphabet`, value.alphabet);
  const hasLength = value.length !== undefined;
  const hasGroups = value.groups !== undefined;

  if (hasLength === hasGroups) {
    throw new Error(`${context} must include exactly one of length or groups.`);
  }

  if (hasLength && value.separator !== undefined) {
    throw new Error(`${context} separator requires groups.`);
  }

  const prefix = parseOptionalNonEmptyString(`${context} prefix`, value.prefix);
  const separator = parseOptionalNonEmptyString(`${context} separator`, value.separator);

  if (hasLength) {
    const length = parseGeneratedCodePositiveInteger(`${context} length`, value.length);

    return {
      kind: "generatedCode",
      alphabet,
      length,
      ...(prefix === undefined ? {} : { prefix }),
    };
  }

  const groups = parseGeneratedCodeGroups(`${context} groups`, value.groups);

  return {
    kind: "generatedCode",
    alphabet,
    groups,
    ...(separator === undefined ? {} : { separator }),
    ...(prefix === undefined ? {} : { prefix }),
  };
}

function parseRecordPlanGeneratedCodeAlphabet(
  context: string,
  value: unknown,
): RecordPlanGeneratedCodeAlphabet {
  if (!recordPlanGeneratedCodeAlphabets.includes(value as RecordPlanGeneratedCodeAlphabet)) {
    throw new Error(
      `${context} must be digits, upperAlpha, upperAlphaNumeric, or upperAlphaNumericNoConfusables.`,
    );
  }

  return value as RecordPlanGeneratedCodeAlphabet;
}

function parseGeneratedCodeGroups(context: string, value: unknown): number[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${context} must be a non-empty array.`);
  }

  const groups = value.map((group, index) =>
    parseGeneratedCodePositiveInteger(`${context}[${index}]`, group),
  );
  const totalLength = groups.reduce((total, group) => total + group, 0);

  if (totalLength > maxGeneratedCodeLength) {
    throw new Error(`${context} total length must be at most ${maxGeneratedCodeLength}.`);
  }

  return groups;
}

function parseGeneratedCodePositiveInteger(context: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${context} must be a positive integer.`);
  }

  if (value > maxGeneratedCodeLength) {
    throw new Error(`${context} must be at most ${maxGeneratedCodeLength}.`);
  }

  return value;
}

function parseRecordPlanActorExpression(
  context: string,
  value: Record<string, unknown>,
): RecordPlanValueExpressionSchema {
  assertExactKeys(context, value, ["kind", "field"]);

  if (!recordPlanActorContextFields.includes(value.field as RecordPlanActorContextField)) {
    throw new Error(`${context} field must be mode or principalId.`);
  }

  return { kind: "actor", field: value.field as RecordPlanActorContextField };
}

function parseRecordPlanSourceExpression(
  context: string,
  value: Record<string, unknown>,
): RecordPlanValueExpressionSchema {
  assertExactKeys(context, value, ["kind", "field"]);

  if (!recordPlanSourceContextFields.includes(value.field as RecordPlanSourceContextField)) {
    throw new Error(`${context} field must be protocol, route, host, or path.`);
  }

  return { kind: "source", field: value.field as RecordPlanSourceContextField };
}

function parseRecordPlanStepOutputExpression(
  context: string,
  value: Record<string, unknown>,
  entities: Record<string, EntitySchema>,
  previousSteps: Map<string, ParsedRecordPlanStep>,
  options: {
    allowFieldOutput: boolean;
  },
): RecordPlanStepOutputExpressionSchema {
  const output = parseRequiredNonEmptyString(`${context} output`, value.output);
  if (output === "id") {
    assertExactKeys(context, value, ["kind", "step", "output"]);
  } else if (output === "field") {
    assertExactKeys(context, value, ["kind", "step", "output", "field"]);
  } else {
    throw new Error(`${context} output must be id or field.`);
  }

  const stepName = parseRequiredNonEmptyString(`${context} step`, value.step);
  const step = previousSteps.get(stepName);
  if (!step) {
    throw new Error(`${context} step references unknown earlier step "${stepName}".`);
  }

  if (output === "id") {
    return { kind: "stepOutput", step: stepName, output };
  }

  if (!options.allowFieldOutput) {
    throw new Error(`${context} field output is not valid for record ids.`);
  }
  const fieldName = parseRequiredNonEmptyString(`${context} field`, value.field);
  if (!definitionsToRecord(entities[step.entity]?.fields)[fieldName]) {
    throw new Error(`${context} field references unknown field "${step.entity}.${fieldName}".`);
  }
  return { kind: "stepOutput", step: stepName, output, field: fieldName };
}
function parseRecordPlanReferenceExpression(
  context: string,
  value: Record<string, unknown>,
  input: EntityOperationInputContractSchema | undefined,
  entities: Record<string, EntitySchema>,
  previousSteps: Map<string, ParsedRecordPlanStep>,
  options: RecordPlanParseOptions,
): RecordPlanValueExpressionSchema {
  assertExactKeys(context, value, ["kind", "entity", "id"]);

  const entity = parseRecordPlanEntityReference(`${context} entity`, value.entity, entities);
  const id = parseRecordPlanRecordIdExpression(
    `${context} id`,
    value.id,
    input,
    entities,
    previousSteps,
    options,
  );

  if (
    id.kind === "targetRecordId" &&
    options.target !== undefined &&
    entity !== options.target.entityName
  ) {
    throw new Error(
      `${context} targetRecordId must reference operation target entity "${options.target.entityName}".`,
    );
  }

  return {
    kind: "reference",
    entity,
    id,
  };
}

function validateRecordPlanFieldExpression(
  context: string,
  field: FieldSchema,
  expression: RecordPlanValueExpressionSchema,
  previousSteps: Map<string, ParsedRecordPlanStep>,
  options: RecordPlanParseOptions,
) {
  if (expression.kind === "generatedDate") {
    if (field.type !== "date") {
      throw new Error(`${context} generatedDate requires a date destination field.`);
    }

    return;
  }

  if (expression.kind === "generatedTimestamp" && field.type === "date") {
    throw new Error(`${context} generatedTimestamp is incompatible with date destination fields.`);
  }

  if (expression.kind === "targetField") {
    const targetField = definitionsToRecord(options.target?.entity.fields)[expression.field];
    if (!targetField) {
      throw new Error(`${context} references unknown target field "${expression.field}".`);
    }

    validateRecordPlanTargetFieldCompatibility(context, targetField, field);
    return;
  }

  if (expression.kind === "targetRecordId") {
    if (field.type !== "text" || (field.format !== undefined && field.format !== "plain")) {
      throw new Error(`${context} targetRecordId requires a plain text destination field.`);
    }

    return;
  }

  if (field.type !== "reference") {
    if (expression.kind === "reference") {
      throw new Error(`${context} reference expression is only valid for reference fields.`);
    }

    return;
  }

  if (expression.kind !== "reference") {
    throw new Error(`${context} must use a reference expression.`);
  }

  if (expression.entity !== field.to) {
    throw new Error(`${context} reference entity must target "${field.to}".`);
  }

  if (expression.id.kind === "stepOutput") {
    const step = previousSteps.get(expression.id.step);
    if (step !== undefined && step.entity !== expression.entity) {
      throw new Error(
        `${context} reference step "${expression.id.step}" creates "${step.entity}" but reference entity is "${expression.entity}".`,
      );
    }
  }
}

function validateRecordPlanTargetFieldCompatibility(
  context: string,
  source: FieldSchema,
  destination: FieldSchema,
) {
  if (source.type !== destination.type) {
    throw new Error(
      `${context} target field type "${source.type}" is incompatible with destination type "${destination.type}".`,
    );
  }

  if (!source.required && destination.required && !fieldHasCreateDefault(destination)) {
    throw new Error(
      `${context} optional target field requires an optional or defaulted destination.`,
    );
  }

  if (source.type === "text" && destination.type === "text") {
    const sourceFormat = source.format ?? "plain";
    const destinationFormat = destination.format ?? "plain";
    if (sourceFormat !== destinationFormat) {
      throw new Error(
        `${context} target text format "${sourceFormat}" is incompatible with destination format "${destinationFormat}".`,
      );
    }
  }
  if (source.type === "enum" && destination.type === "enum") {
    const destinationValues = definitionsToRecord(destination.values);
    const missingValue = source.values.find((value) => destinationValues[value.key] === undefined);
    if (missingValue !== undefined) {
      throw new Error(
        `${context} destination enum does not accept target value "${missingValue.key}".`,
      );
    }
  }

  if (
    source.type === "reference" &&
    destination.type === "reference" &&
    source.to !== destination.to
  ) {
    throw new Error(
      `${context} target reference entity "${source.to}" is incompatible with destination entity "${destination.to}".`,
    );
  }
}

function isRecordPlanLiteralValue(value: unknown): value is string | boolean | number {
  return typeof value === "string" || typeof value === "boolean" || isFiniteNumber(value);
}

function parseOperationIdempotency(
  context: string,
  value: unknown,
  kind: EntityOperationKind,
): EntityOperationIdempotencySchema {
  if (value === undefined) {
    return { required: isEntityOperationWriteKind(kind) };
  }

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["required"], ["source"]);

  if (typeof value.required !== "boolean") {
    throw new Error(`${context} required must be a boolean.`);
  }

  const source = parseOperationIdempotencySource(`${context} source`, value.source);

  if (isEntityOperationWriteKind(kind)) {
    if (!value.required) {
      throw new Error(`${context} is required for write and command operations.`);
    }
  } else if (value.required) {
    throw new Error(`${context} must not be required for read operations.`);
  }

  if (!value.required && source !== undefined) {
    throw new Error(`${context} source requires idempotency to be required.`);
  }

  return {
    required: value.required,
    ...(source === undefined ? {} : { source }),
  };
}

function parseOperationIdempotencySource(
  context: string,
  value: unknown,
): EntityOperationIdempotencySchema["source"] {
  if (value === undefined) {
    return undefined;
  }

  if (value !== "caller" && value !== "runtime") {
    throw new Error(`${context} must be caller or runtime.`);
  }

  return value;
}

function parseOperationAudit(context: string, value: unknown): EntityOperationAuditSchema {
  if (value === undefined) {
    return { input: "summary" };
  }

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["input"]);

  if (!entityOperationAuditInputPolicies.includes(value.input as EntityOperationAuditInputPolicy)) {
    throw new Error(`${context} input must be none, hash, summary, or snapshot.`);
  }

  return { input: value.input as EntityOperationAuditInputPolicy };
}

function parseOperationPolicy(
  context: string,
  value: unknown,
): EntityOperationPolicySchema | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, [], ["actors", "access", "responseFields", "visible"]);

  const actors =
    value.actors === undefined
      ? undefined
      : parseOperationActorKinds(`${context} actors`, value.actors);
  const access = parseOptionalOperationAccessPolicy(`${context} access`, value.access);
  const responseFields = parseOperationResponseFields(
    `${context} responseFields`,
    value.responseFields,
    actors,
  );
  const visible = parseOptionalBoolean(`${context} visible`, value.visible);

  return {
    ...(actors === undefined ? {} : { actors }),
    ...(access === undefined ? {} : { access }),
    ...(responseFields === undefined ? {} : { responseFields }),
    ...(visible === undefined ? {} : { visible }),
  };
}

function parseOperationActorKinds(context: string, value: unknown): EntityOperationActorKind[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${context} must be a non-empty array.`);
  }

  const actors = value.map((actor, index) => {
    if (!isEntityOperationActorKind(actor)) {
      throw new Error(
        `${context}[${index}] must be anonymous, authenticated, owner, admin, cliDeployer, or runner.`,
      );
    }

    return actor;
  });

  if (new Set(actors).size !== actors.length) {
    throw new Error(`${context} must be unique.`);
  }

  return actors;
}

function parseOptionalOperationAccessPolicy(
  context: string,
  value: unknown,
): OperationAccessPolicySchema | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["actor", "origin"], ["challenge", "rateLimit"]);

  if (value.actor !== "anonymous") {
    throw new Error(`${context} actor must be "anonymous".`);
  }

  const challenge =
    value.challenge === undefined
      ? undefined
      : parseOperationChallengePolicy(`${context} challenge`, value.challenge);
  const rateLimit =
    value.rateLimit === undefined
      ? undefined
      : parseOperationRateLimitPolicy(`${context} rateLimit`, value.rateLimit);

  return {
    actor: "anonymous",
    ...(challenge === undefined ? {} : { challenge }),
    origin: parseOperationOriginPolicy(`${context} origin`, value.origin),
    ...(rateLimit === undefined ? {} : { rateLimit }),
  };
}

function parseOperationChallengePolicy(
  context: string,
  value: unknown,
): OperationChallengePolicySchema {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["kind"]);

  if (value.kind !== "turnstile") {
    throw new Error(`${context} kind must be "turnstile".`);
  }

  return { kind: "turnstile" };
}

function parseOperationOriginPolicy(context: string, value: unknown): OperationOriginPolicySchema {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["kind"]);

  if (value.kind !== "same-origin") {
    throw new Error(`${context} kind must be "same-origin".`);
  }

  return { kind: "same-origin" };
}

function parseOperationRateLimitPolicy(
  context: string,
  value: unknown,
): OperationRateLimitPolicySchema {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["maxRequests", "windowSeconds"]);

  return {
    maxRequests: parsePositiveInteger(`${context} maxRequests`, value.maxRequests),
    windowSeconds: parsePositiveInteger(`${context} windowSeconds`, value.windowSeconds),
  };
}

function parseOperationResponseFields(
  context: string,
  value: unknown,
  actors: EntityOperationActorKind[] | undefined,
): EntityOperationPolicySchema["responseFields"] {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  const responseFields: Partial<Record<EntityOperationActorKind, string[]>> = {};

  for (const [actor, fields] of Object.entries(value)) {
    if (!isEntityOperationActorKind(actor)) {
      throw new Error(`${context} has unsupported actor "${actor}".`);
    }

    if (actors !== undefined && !actors.includes(actor)) {
      throw new Error(`${context}.${actor} must reference an operation actor.`);
    }

    responseFields[actor] = parseResponseFieldList(`${context}.${actor}`, fields);
  }

  if (Object.keys(responseFields).length === 0) {
    throw new Error(`${context} must not be empty.`);
  }

  return responseFields;
}

function parseResponseFieldList(context: string, value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${context} must be a non-empty array.`);
  }

  const fields = value.map((fieldName, index) =>
    parseRequiredNonEmptyString(`${context}[${index}]`, fieldName),
  );

  if (new Set(fields).size !== fields.length) {
    throw new Error(`${context} must be unique.`);
  }

  return fields;
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

function parseOptionalBoolean(context: string, value: unknown): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new Error(`${context} must be a boolean.`);
  }

  return value;
}

function parseOptionalPositiveInteger(context: string, value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return parsePositiveInteger(context, value);
}

function parsePositiveInteger(context: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${context} must be a positive integer.`);
  }

  return value;
}

function isEntityOperationActorKind(value: unknown): value is EntityOperationActorKind {
  return entityOperationActorKinds.includes(value as EntityOperationActorKind);
}
