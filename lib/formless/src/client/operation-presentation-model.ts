import {
  formatEntityOperationKey,
  isEntityOperationVisibleToBrowser,
  isOperationHandlerEffectForSelectionCapability,
  type EntityOperationKind,
  type EntityOperationSchema,
  type EntityOperationScope,
  type EntitySchema,
  type OperationHandlerEffectSchemaForKind,
  type OperationHandlerKindBySelectionCapability,
  type OperationHandlerSelectionCapability,
} from "@dpeek/formless-schema";

export type EntityOperationPresentationConfig = {
  entityName: string;
  operationName: string;
  canonicalKey: string;
  label: string;
  operation: EntityOperationSchema;
};

export type CommandOperationPresentationConfigForCapability<
  Capability extends OperationHandlerSelectionCapability,
> = EntityOperationPresentationConfig & {
  operation: EntityOperationSchema & {
    kind: "command";
    effect: OperationHandlerEffectSchemaForKind<
      OperationHandlerKindBySelectionCapability[Capability]
    >;
  };
};

export function selectAvailableEntityOperations(
  entityName: string,
  entity: EntitySchema,
  scope: EntityOperationScope,
): EntityOperationPresentationConfig[] {
  return (entity.operations ?? []).flatMap((operation) => {
    const operationName = operation.key;
    if (operation.scope !== scope || !isEntityOperationVisibleToBrowser(operation)) {
      return [];
    }

    return [selectEntityOperationPresentation(entityName, operationName, operation)];
  });
}

export function selectEntityOperationByKind(
  entityName: string,
  entity: EntitySchema,
  kind: EntityOperationKind,
  scope: EntityOperationScope,
): EntityOperationPresentationConfig | undefined {
  return selectAvailableEntityOperations(entityName, entity, scope).find(
    (operation) => operation.operation.kind === kind,
  );
}

export function selectCommandOperationsByHandlerCapability<
  Capability extends OperationHandlerSelectionCapability,
>(
  entityName: string,
  entity: EntitySchema,
  capability: Capability,
  scope: EntityOperationScope,
): CommandOperationPresentationConfigForCapability<Capability>[] {
  return selectAvailableEntityOperations(entityName, entity, scope).filter(
    (operation): operation is CommandOperationPresentationConfigForCapability<Capability> =>
      commandOperationHasHandlerCapability(operation, capability),
  );
}

export function selectCommandOperationByHandlerCapability<
  Capability extends OperationHandlerSelectionCapability,
>(
  entityName: string,
  entity: EntitySchema,
  capability: Capability,
  scope: EntityOperationScope,
): CommandOperationPresentationConfigForCapability<Capability> | undefined {
  return selectCommandOperationsByHandlerCapability(entityName, entity, capability, scope)[0];
}

export function commandOperationHasHandlerCapability<
  Capability extends OperationHandlerSelectionCapability,
>(
  operation: EntityOperationPresentationConfig,
  capability: Capability,
): operation is CommandOperationPresentationConfigForCapability<Capability> {
  return (
    operation.operation.kind === "command" &&
    isOperationHandlerEffectForSelectionCapability(operation.operation.effect, capability)
  );
}

export function selectEntityOperationPresentation(
  entityName: string,
  operationName: string,
  operation: EntityOperationSchema,
): EntityOperationPresentationConfig {
  return {
    entityName,
    operationName,
    canonicalKey: formatEntityOperationKey({ entityKey: entityName, operationKey: operationName }),
    label: operation.label ?? defaultOperationLabel(operation, operationName),
    operation,
  };
}

function defaultOperationLabel(operation: EntityOperationSchema, operationName: string) {
  if (operation.kind === "create") {
    return "Create";
  }

  if (operation.kind === "update") {
    return "Update";
  }

  if (operation.kind === "delete") {
    return "Delete";
  }

  return humanizeOperationName(operationName);
}

function humanizeOperationName(operationName: string) {
  return operationName
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (first) => first.toUpperCase());
}
