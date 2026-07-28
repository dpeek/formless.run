import { fieldHasCreateDefault } from "./field-types.ts";
import {
  assertExactKeys,
  definitionsToRecord,
  isRecord,
  parseKeyedDefinitionArray,
  parseRequiredNonEmptyString,
} from "./schema-parse-helpers.ts";
import type {
  EntitySchema,
  FieldSchema,
  KeyedDefinition,
  StateMachineSchema,
  StateMachineTransitionEventFieldMappingsSchema,
  StateMachineTransitionEventSchema,
  StateMachineTransitionSchema,
} from "./types.ts";

const transitionEventFieldMappingKeys = [
  "sourceEntity",
  "sourceRecordId",
  "transitionKey",
  "previousState",
  "nextState",
  "actorMode",
  "occurredAt",
] as const satisfies readonly (keyof StateMachineTransitionEventFieldMappingsSchema)[];
const transitionEventActorModes = ["admin", "cliDeployer", "owner", "runner"] as const;
export function parseStateMachinesForEntities(
  entities: KeyedDefinition<EntitySchema>[],
  stateMachineInputsByEntity: Record<string, unknown>,
): KeyedDefinition<EntitySchema>[] {
  if (Object.keys(stateMachineInputsByEntity).length === 0) {
    return entities;
  }
  const entitiesByKey = definitionsToRecord(entities);
  return entities.map((entity) => {
    const entityName = entity.key;
    const stateMachinesInput = stateMachineInputsByEntity[entityName];
    if (stateMachinesInput === undefined) {
      return entity;
    }
    return {
      ...entity,
      stateMachines: parseEntityStateMachines(
        entityName,
        stateMachinesInput,
        entity,
        entitiesByKey,
      ),
    };
  });
}
function parseEntityStateMachines(
  entityName: string,
  value: unknown,
  entity: EntitySchema,
  entities: Record<string, EntitySchema>,
): KeyedDefinition<StateMachineSchema>[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Entity "${entityName}" stateMachines must not be empty.`);
  }
  const ownedFields = new Set<string>();
  const stateMachines = parseKeyedDefinitionArray(
    `Entity "${entityName}" stateMachines`,
    value,
    (machineName, stateMachine) => {
      const parsed = parseStateMachine(entityName, machineName, stateMachine, entity, entities);
      if (ownedFields.has(parsed.field)) {
        throw new Error(
          `Entity "${entityName}" state machine "${machineName}" field "${parsed.field}" is already owned by another state machine.`,
        );
      }
      ownedFields.add(parsed.field);
      return parsed;
    },
  );
  return stateMachines;
}
function parseStateMachine(
  entityName: string,
  machineName: string,
  value: unknown,
  entity: EntitySchema,
  entities: Record<string, EntitySchema>,
): StateMachineSchema {
  const context = `Entity "${entityName}" state machine "${machineName}"`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(
    context,
    value,
    ["key", "field", "initial", "transitions"],
    ["states", "terminal", "event"],
  );
  const fieldName = parseRequiredNonEmptyString(`${context} field`, value.field);
  const field = definitionsToRecord(entity.fields)[fieldName];
  if (!field) {
    throw new Error(`${context} field references unknown field "${entityName}.${fieldName}".`);
  }

  if (field.type !== "enum") {
    throw new Error(`${context} field "${fieldName}" must be an enum field.`);
  }

  if (!field.required) {
    throw new Error(`${context} field "${fieldName}" must be required.`);
  }
  const enumStates = new Set(field.values.map((definition) => definition.key));
  const states =
    value.states === undefined
      ? undefined
      : parseStateList(`${context} states`, value.states, enumStates);
  const machineStates = new Set(states ?? field.values.map((definition) => definition.key));
  const initial = parseRequiredState(`${context} initial`, value.initial, machineStates);
  if (field.default !== undefined && field.default !== initial) {
    throw new Error(`${context} field "${fieldName}" default must match initial state.`);
  }

  const terminal =
    value.terminal === undefined
      ? undefined
      : parseStateList(`${context} terminal`, value.terminal, machineStates);
  const terminalStates = new Set(terminal ?? []);
  const transitions = parseTransitions(
    `${context} transitions`,
    value.transitions,
    machineStates,
    terminalStates,
  );
  const transitionKeys = transitions.map((transition) => transition.key);
  const event =
    value.event === undefined
      ? undefined
      : parseTransitionEvent(
          `${context} event`,
          value.event,
          entityName,
          entities,
          [...machineStates],
          transitionKeys,
        );

  return {
    field: fieldName,
    initial,
    ...(states === undefined ? {} : { states }),
    ...(terminal === undefined ? {} : { terminal }),
    transitions,
    ...(event === undefined ? {} : { event }),
  };
}

function parseTransitions(
  context: string,
  value: unknown,
  states: Set<string>,
  terminalStates: Set<string>,
): KeyedDefinition<StateMachineTransitionSchema>[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${context} must not be empty.`);
  }
  return parseKeyedDefinitionArray(context, value, (transitionName, transition) =>
    parseTransition(`${context}.${transitionName}`, transition, states, terminalStates),
  );
}
function parseTransition(
  context: string,
  value: unknown,
  states: Set<string>,
  terminalStates: Set<string>,
): StateMachineTransitionSchema {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }
  assertExactKeys(context, value, ["key", "label", "from", "to"]);
  const label = parseRequiredNonEmptyString(`${context} label`, value.label);
  const from = parseStateList(`${context} from`, value.from, states);
  const to = parseRequiredState(`${context} to`, value.to, states);

  for (const sourceState of from) {
    if (terminalStates.has(sourceState)) {
      throw new Error(`${context} from state "${sourceState}" is terminal.`);
    }
  }

  return {
    label,
    from,
    to,
  };
}

function parseStateList(context: string, value: unknown, validStates: Set<string>): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${context} must be a non-empty array.`);
  }

  const states = value.map((state, index) =>
    parseRequiredState(`${context}[${index}]`, state, validStates),
  );

  if (new Set(states).size !== states.length) {
    throw new Error(`${context} must be unique.`);
  }

  return states;
}

function parseRequiredState(context: string, value: unknown, validStates: Set<string>): string {
  const state = parseRequiredNonEmptyString(context, value);

  if (!validStates.has(state)) {
    throw new Error(`${context} references unknown state "${state}".`);
  }

  return state;
}

function parseTransitionEvent(
  context: string,
  value: unknown,
  sourceEntityName: string,
  entities: Record<string, EntitySchema>,
  states: string[],
  transitionKeys: string[],
): StateMachineTransitionEventSchema {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["entity", "fields"]);

  const entityName = parseRequiredNonEmptyString(`${context} entity`, value.entity);
  const targetEntity = entities[entityName];

  if (!targetEntity) {
    throw new Error(`${context} references unknown entity "${entityName}".`);
  }

  const fields = parseTransitionEventFieldMappings(`${context} fields`, value.fields);
  validateTransitionEventFieldMappings(
    context,
    fields,
    targetEntity,
    sourceEntityName,
    states,
    transitionKeys,
  );

  return { entity: entityName, fields };
}

function parseTransitionEventFieldMappings(
  context: string,
  value: unknown,
): StateMachineTransitionEventFieldMappingsSchema {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, [...transitionEventFieldMappingKeys]);

  const fields = Object.fromEntries(
    transitionEventFieldMappingKeys.map((mappingKey) => [
      mappingKey,
      parseRequiredNonEmptyString(`${context}.${mappingKey}`, value[mappingKey]),
    ]),
  ) as StateMachineTransitionEventFieldMappingsSchema;

  const mappedFields = Object.values(fields);
  if (new Set(mappedFields).size !== mappedFields.length) {
    throw new Error(`${context} values must be unique.`);
  }

  return fields;
}

function validateTransitionEventFieldMappings(
  context: string,
  fields: StateMachineTransitionEventFieldMappingsSchema,
  targetEntity: EntitySchema,
  sourceEntityName: string,
  states: string[],
  transitionKeys: string[],
) {
  validateStringAssignableField(
    `${context} fields.sourceEntity`,
    targetEntity,
    fields.sourceEntity,
    [sourceEntityName],
  );
  validateTextField(`${context} fields.sourceRecordId`, targetEntity, fields.sourceRecordId);
  validateStringAssignableField(
    `${context} fields.transitionKey`,
    targetEntity,
    fields.transitionKey,
    transitionKeys,
  );
  validateStringAssignableField(
    `${context} fields.previousState`,
    targetEntity,
    fields.previousState,
    states,
  );
  validateStringAssignableField(
    `${context} fields.nextState`,
    targetEntity,
    fields.nextState,
    states,
  );
  validateStringAssignableField(`${context} fields.actorMode`, targetEntity, fields.actorMode, [
    ...transitionEventActorModes,
  ]);
  validateDateField(`${context} fields.occurredAt`, targetEntity, fields.occurredAt);
  validateRequiredEventFields(context, targetEntity, Object.values(fields));
}

function validateRequiredEventFields(
  context: string,
  targetEntity: EntitySchema,
  mappedFields: string[],
) {
  const mappedFieldNames = new Set(mappedFields);
  for (const field of targetEntity.fields) {
    const fieldName = field.key;
    if (!field.required || mappedFieldNames.has(fieldName) || fieldHasCreateDefault(field)) {
      continue;
    }

    throw new Error(
      `${context} target entity requires field "${fieldName}" to have a default or event mapping.`,
    );
  }
}

function validateTextField(context: string, entity: EntitySchema, fieldName: string) {
  const field = requireEventTargetField(context, entity, fieldName);

  if (field.type !== "text") {
    throw new Error(`${context} must reference a text field.`);
  }
}

function validateDateField(context: string, entity: EntitySchema, fieldName: string) {
  const field = requireEventTargetField(context, entity, fieldName);

  if (field.type !== "date") {
    throw new Error(`${context} must reference a date field.`);
  }
}

function validateStringAssignableField(
  context: string,
  entity: EntitySchema,
  fieldName: string,
  values: readonly string[],
) {
  const field = requireEventTargetField(context, entity, fieldName);

  if (field.type === "text") {
    return;
  }

  if (field.type !== "enum") {
    throw new Error(`${context} must reference a text or enum field.`);
  }
  for (const value of values) {
    if (!definitionsToRecord(field.values)[value]) {
      throw new Error(`${context} enum field must include value "${value}".`);
    }
  }
}

function requireEventTargetField(
  context: string,
  entity: EntitySchema,
  fieldName: string,
): FieldSchema {
  const field = definitionsToRecord(entity.fields)[fieldName];
  if (!field) {
    throw new Error(`${context} references unknown field "${fieldName}".`);
  }

  return field;
}
