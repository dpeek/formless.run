import { getAppSchemaDefinitionIndex, type AppSchema } from "@dpeek/formless-schema";

export function assertEntityIdentityContinuity(currentSchema: AppSchema, nextSchema: AppSchema) {
  const nextIndex = getAppSchemaDefinitionIndex(nextSchema);

  for (const currentEntity of currentSchema.entities) {
    const nextEntity = nextIndex.entities.byKey.get(currentEntity.key);

    if (!nextEntity || nextEntity.id === currentEntity.id) {
      continue;
    }

    const reboundEntity = nextIndex.entitiesById.get(currentEntity.id);

    if (reboundEntity) {
      throw new Error(
        `Cannot rebind entity id "${currentEntity.id}" from entity "${currentEntity.key}" to "${reboundEntity.key}" while entity key "${currentEntity.key}" continues with id "${nextEntity.id}".`,
      );
    }

    throw new Error(
      `Cannot change entity id for continuing entity "${currentEntity.key}" from "${currentEntity.id}" to "${nextEntity.id}".`,
    );
  }
}
