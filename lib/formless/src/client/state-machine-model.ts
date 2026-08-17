import type {
  EntitySchema,
  FieldSchema,
  OperationHandlerEffectSchemaForKind,
  StateMachineSchema,
  StateMachineTransitionSchema,
} from "@dpeek/formless-schema";
import type { FieldValue } from "@dpeek/formless-storage";
import {
  selectCommandOperationsByHandlerCapability,
  type EntityOperationPresentationConfig,
} from "./operation-presentation-model.ts";

export type StateMachineFieldConfig = {
  fieldName: string;
  machineName: string;
  machine: StateMachineSchema;
  initialState: string;
  terminalStates: string[];
};

export type TransitionStateOperationConfig = {
  entity: EntitySchema;
  operationName: string;
  operation: EntityOperationPresentationConfig;
  label: string;
  machineName: string;
  machine: StateMachineSchema;
  transitionName: string;
  transition: StateMachineTransitionSchema;
  fieldName: string;
  field: Extract<
    FieldSchema,
    {
      type: "enum";
    }
  >;
};
export type TransitionStateOperationAvailability = {
  valid: boolean;
  disabledReason?: string;
};

export function selectStateMachineField(
  entity: EntitySchema,
  fieldName: string,
): StateMachineFieldConfig | undefined {
  for (const machine of entity.stateMachines ?? []) {
    if (machine.field !== fieldName) {
      continue;
    }
    return {
      fieldName,
      machineName: machine.key,
      machine,
      initialState: machine.initial,
      terminalStates: machine.terminal ?? [],
    };
  }

  return undefined;
}

export function selectTransitionStateOperations(
  entityName: string,
  entity: EntitySchema,
): TransitionStateOperationConfig[] {
  return selectCommandOperationsByHandlerCapability(
    entityName,
    entity,
    "transitionState",
    "record",
  ).flatMap((operation) => {
    const transitionTarget = selectTransitionOperationTarget(entity, operation.operation.effect);

    if (transitionTarget === undefined) {
      return [];
    }
    const machine = entity.stateMachines?.find(
      (definition) => definition.key === transitionTarget.machineName,
    );
    const transition = machine?.transitions.find(
      (definition) => definition.key === transitionTarget.transitionName,
    );
    const field =
      machine === undefined
        ? undefined
        : entity.fields.find((definition) => definition.key === machine.field);
    if (!machine || !transition || field?.type !== "enum") {
      return [];
    }

    return [
      {
        entity,
        operationName: operation.operationName,
        operation,
        label: operation.label,
        machineName: transitionTarget.machineName,
        machine,
        transitionName: transitionTarget.transitionName,
        transition,
        fieldName: machine.field,
        field,
      },
    ];
  });
}

export function selectTransitionStateOperationAvailability({
  operation,
  currentValue,
  field,
}: {
  operation: TransitionStateOperationConfig;
  currentValue: FieldValue | undefined;
  field: Extract<
    FieldSchema,
    {
      type: "enum";
    }
  >;
}): TransitionStateOperationAvailability {
  if (typeof currentValue !== "string" || currentValue.trim() === "") {
    return {
      valid: false,
      disabledReason: `Requires ${transitionSourceStateLabels(operation, field).join(", ")}.`,
    };
  }
  if (!field.values.some((definition) => definition.key === currentValue)) {
    if (operation.transition.to === operation.machine.initial) {
      return { valid: true };
    }

    return {
      valid: false,
      disabledReason: `Current state "${currentValue}" is not declared.`,
    };
  }

  if (!operation.transition.from.includes(currentValue)) {
    return {
      valid: false,
      disabledReason: `Requires ${transitionSourceStateLabels(operation, field).join(", ")}.`,
    };
  }

  return { valid: true };
}

export function stateMachineStateIsTerminal(
  stateMachine: StateMachineFieldConfig,
  value: FieldValue | undefined,
) {
  return typeof value === "string" && stateMachine.terminalStates.includes(value);
}
function transitionSourceStateLabels(
  operation: TransitionStateOperationConfig,
  field: Extract<
    FieldSchema,
    {
      type: "enum";
    }
  >,
) {
  return operation.transition.from.map(
    (state) => field.values.find((definition) => definition.key === state)?.label ?? state,
  );
}
function selectTransitionOperationTarget(
  _entity: EntitySchema,
  effect: OperationHandlerEffectSchemaForKind<"transition-state">,
):
  | {
      machineName: string;
      transitionName: string;
    }
  | undefined {
  return {
    machineName: effect.config.machine,
    transitionName: effect.config.transition,
  };
}
