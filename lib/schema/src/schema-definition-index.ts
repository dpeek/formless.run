import type {
  AppSchema,
  AppSchemaDefinitionIndex,
  AuthorizationRoleId,
  AuthorizationRoleSchema,
  DefinitionIndex,
  EntityConstraintSchema,
  EntityId,
  EntityOperationInputFieldSchema,
  EntityOperationSchema,
  EntitySchema,
  EntityUnionVariantSchema,
  EnumValueSchema,
  FieldSchema,
  KeyedDefinition,
  StateMachineSchema,
  StateMachineTransitionSchema,
} from "./types.ts";
const definitionIndexesBySchema = new WeakMap<AppSchema, AppSchemaDefinitionIndex>();
export function createDefinitionIndex<
  Definition extends {
    key: string;
  },
>(
  definitions: readonly Definition[],
  context = "Definition registry",
): DefinitionIndex<Definition> {
  const ordered = [...definitions];
  const byKey = new Map<string, Definition>();

  for (const definition of ordered) {
    if (byKey.has(definition.key)) {
      throw new Error(`${context} contains duplicate definition key "${definition.key}".`);
    }

    byKey.set(definition.key, definition);
  }

  return { ordered, byKey };
}

export function getAppSchemaDefinitionIndex(schema: AppSchema): AppSchemaDefinitionIndex {
  const cached = definitionIndexesBySchema.get(schema);

  if (cached !== undefined) {
    return cached;
  }

  const index = createAppSchemaDefinitionIndex(schema);
  definitionIndexesBySchema.set(schema, index);
  return index;
}

export function createAppSchemaDefinitionIndex(schema: AppSchema): AppSchemaDefinitionIndex {
  const rolesById = new Map<AuthorizationRoleId, KeyedDefinition<AuthorizationRoleSchema>>();
  for (const role of schema.authorization?.roles ?? []) {
    if (rolesById.has(role.id)) {
      throw new Error(`Schema authorization roles contain duplicate role id "${role.id}".`);
    }
    rolesById.set(role.id, role);
  }
  const entitiesById = new Map<EntityId, KeyedDefinition<EntitySchema>>();
  for (const entity of schema.entities) {
    if (entitiesById.has(entity.id)) {
      throw new Error(`Schema entities contain duplicate entity id "${entity.id}".`);
    }
    entitiesById.set(entity.id, entity);
  }
  const fieldsByEntity = new Map<string, DefinitionIndex<KeyedDefinition<FieldSchema>>>();
  const enumValuesByEntityField = new Map<
    string,
    ReadonlyMap<string, DefinitionIndex<KeyedDefinition<EnumValueSchema>>>
  >();
  const constraintsByEntity = new Map<
    string,
    DefinitionIndex<KeyedDefinition<EntityConstraintSchema>>
  >();
  const stateMachinesByEntity = new Map<
    string,
    DefinitionIndex<KeyedDefinition<StateMachineSchema>>
  >();
  const transitionsByEntityStateMachine = new Map<
    string,
    ReadonlyMap<string, DefinitionIndex<KeyedDefinition<StateMachineTransitionSchema>>>
  >();
  const operationsByEntity = new Map<
    string,
    DefinitionIndex<KeyedDefinition<EntityOperationSchema>>
  >();
  const operationInputFieldsByEntityOperation = new Map<
    string,
    ReadonlyMap<string, DefinitionIndex<KeyedDefinition<EntityOperationInputFieldSchema>>>
  >();
  const operationInputEnumValuesByEntityOperationField = new Map<
    string,
    ReadonlyMap<string, ReadonlyMap<string, DefinitionIndex<KeyedDefinition<EnumValueSchema>>>>
  >();
  for (const entity of schema.entities) {
    const entityKey = entity.key;
    fieldsByEntity.set(
      entityKey,
      createDefinitionIndex(entity.fields, `Entity "${entityKey}" fields`),
    );
    constraintsByEntity.set(
      entityKey,
      createDefinitionIndex(entity.constraints ?? [], `Entity "${entityKey}" constraints`),
    );
    stateMachinesByEntity.set(
      entityKey,
      createDefinitionIndex(entity.stateMachines ?? [], `Entity "${entityKey}" state machines`),
    );
    operationsByEntity.set(
      entityKey,
      createDefinitionIndex(entity.operations ?? [], `Entity "${entityKey}" operations`),
    );
    const enumValuesByField = new Map<string, DefinitionIndex<KeyedDefinition<EnumValueSchema>>>();
    for (const field of entity.fields) {
      if (field.type === "enum") {
        enumValuesByField.set(
          field.key,
          createDefinitionIndex(field.values, `Field "${entityKey}.${field.key}" enum values`),
        );
      }
    }
    enumValuesByEntityField.set(entityKey, enumValuesByField);

    const transitionsByStateMachine = new Map<
      string,
      DefinitionIndex<KeyedDefinition<StateMachineTransitionSchema>>
    >();
    for (const stateMachine of entity.stateMachines ?? []) {
      transitionsByStateMachine.set(
        stateMachine.key,
        createDefinitionIndex(
          stateMachine.transitions,
          `State machine "${entityKey}.${stateMachine.key}" transitions`,
        ),
      );
    }
    transitionsByEntityStateMachine.set(entityKey, transitionsByStateMachine);

    const inputFieldsByOperation = new Map<
      string,
      DefinitionIndex<KeyedDefinition<EntityOperationInputFieldSchema>>
    >();
    const inputEnumValuesByOperation = new Map<
      string,
      ReadonlyMap<string, DefinitionIndex<KeyedDefinition<EnumValueSchema>>>
    >();
    for (const operation of entity.operations ?? []) {
      inputFieldsByOperation.set(
        operation.key,
        createDefinitionIndex(
          operation.input?.fields ?? [],
          `Operation "${entityKey}.${operation.key}" input fields`,
        ),
      );
      const inputEnumValuesByField = new Map<
        string,
        DefinitionIndex<KeyedDefinition<EnumValueSchema>>
      >();
      for (const field of operation.input?.fields ?? []) {
        if ("type" in field && field.type === "enum") {
          inputEnumValuesByField.set(
            field.key,
            createDefinitionIndex(
              field.values,
              `Operation "${entityKey}.${operation.key}" input field "${field.key}" enum values`,
            ),
          );
        }
      }
      inputEnumValuesByOperation.set(operation.key, inputEnumValuesByField);
    }
    operationInputFieldsByEntityOperation.set(entityKey, inputFieldsByOperation);
    operationInputEnumValuesByEntityOperationField.set(entityKey, inputEnumValuesByOperation);
  }

  const variantsByUnion = new Map<
    string,
    DefinitionIndex<KeyedDefinition<EntityUnionVariantSchema>>
  >();
  for (const union of schema.unions ?? []) {
    variantsByUnion.set(
      union.key,
      createDefinitionIndex(union.variants, `Union "${union.key}" variants`),
    );
  }
  return {
    authorization: {
      roles: createDefinitionIndex(schema.authorization?.roles ?? [], "Schema authorization roles"),
      rolesById,
    },
    entities: createDefinitionIndex(schema.entities, "Schema entities"),
    entitiesById,
    relationships: createDefinitionIndex(schema.relationships ?? [], "Schema relationships"),
    queries: createDefinitionIndex(schema.queries, "Schema queries"),
    readModels: {
      computedValues: createDefinitionIndex(
        schema.readModels?.computedValues ?? [],
        "Schema computed values",
      ),
      aggregates: createDefinitionIndex(schema.readModels?.aggregates ?? [], "Schema aggregates"),
    },
    unions: createDefinitionIndex(schema.unions ?? [], "Schema unions"),
    itemViews: createDefinitionIndex(schema.itemViews, "Schema item views"),
    tableViews: createDefinitionIndex(schema.tableViews, "Schema table views"),
    views: createDefinitionIndex(schema.views, "Schema views"),
    screens: createDefinitionIndex(schema.screens, "Schema screens"),
    surfaceMounts: createDefinitionIndex(schema.surfaceMounts ?? [], "Schema surface mounts"),
    fieldsByEntity,
    enumValuesByEntityField,
    constraintsByEntity,
    stateMachinesByEntity,
    transitionsByEntityStateMachine,
    operationsByEntity,
    operationInputFieldsByEntityOperation,
    operationInputEnumValuesByEntityOperationField,
    variantsByUnion,
  };
}
