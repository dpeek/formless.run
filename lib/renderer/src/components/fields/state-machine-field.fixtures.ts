import {
  composeScenarioAxis,
  composeScenarioGroup,
  scenarioOption,
} from "../field-scenario-model.ts";
import type {
  FieldScenarioComposeContext,
  FieldScenarioFieldModifier,
  FieldScenarioGroup,
} from "../field-scenario-model.ts";
import type { FieldSchema, StateMachineSchema } from "@dpeek/formless-schema";
import type { FieldContract } from "@dpeek/formless-presentation/contract";
import {
  createField,
  displayField,
  enumControl,
  enumOptions,
  enumValuePresentation,
  stateMachineFacts,
  stateMachineField,
} from "./fixture-helpers.ts";

const priorityMarkerIconSource = [
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">',
  '<path d="M12 4.75v14.5" />',
  '<path d="m6.75 10 5.25-5.25L17.25 10" />',
  "</svg>",
].join("");

const closeIconSource = [
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">',
  '<path d="m6.75 6.75 10.5 10.5" />',
  '<path d="m17.25 6.75-10.5 10.5" />',
  "</svg>",
].join("");

const confirmIconSource = [
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">',
  '<path d="m5 12 5 5L20 7" />',
  "</svg>",
].join("");

const stateStatusField = {
  type: "enum",
  required: true,
  label: "Status",
  values: [
    {
      key: "open",
      label: "Open",
      presentation: { color: "blue", icon: "priority-marker" },
    },
    { key: "waiting", label: "Waiting", presentation: { color: "orange" } },
    { key: "blocked", label: "Blocked", presentation: { color: "red", icon: "close" } },
    { key: "done", label: "Done", presentation: { color: "green", icon: "confirm" } },
  ],
  default: "open",
} as const;
const stateStatusOptions = enumOptions(stateStatusField, {
  blocked: { iconSource: closeIconSource },
  done: { iconSource: confirmIconSource },
  open: { iconSource: priorityMarkerIconSource },
});

const taskWorkflowMachine = {
  field: "status",
  initial: "open",
  terminal: ["done"],
  transitions: [
    { key: "complete", label: "Complete", from: ["open", "waiting", "blocked"], to: "done" },
    { key: "sendWaiting", label: "Send to waiting", from: ["open", "blocked"], to: "waiting" },
    {
      key: "reopen",
      label: "Reopen",
      from: ["waiting", "blocked"],
      to: "open",
    },
    { key: "block", label: "Block", from: ["open", "waiting"], to: "blocked" },
  ],
} satisfies StateMachineSchema;
const operationNames = {
  block: "tasks.block",
  complete: "tasks.complete",
  reopen: "tasks.reopen",
  sendWaiting: "tasks.sendToWaiting",
};

const stateMachineCreateBase = stateMachineCreateField();

const stateMachineRecordBase = stateMachineDisplayField({
  recordId: "state-status-record",
  surface: "record",
  value: "open",
});

const stateMachineTableCellBase = stateMachineDisplayField({
  recordId: "state-status-cell",
  surface: "table-cell",
  value: "open",
});

const stateMachineDetailBase = stateMachineDisplayField({
  recordId: "state-status-detail",
  surface: "detail",
  value: "open",
});

const stateMachineInteractionAxis = composeScenarioAxis("interaction", "Interaction", [
  scenarioOption("transitions", "Transitions"),
  scenarioOption("display", "Display", withStateMachineInteraction("display")),
]);

export const stateMachineScenarioGroups = [
  composeScenarioGroup({
    id: "state-machine-create",
    kind: "state-machine-enum",
    surface: "create",
    base: stateMachineCreateBase,
    axes: [composeScenarioAxis("state", "State", [scenarioOption("initial", "Initial")])],
  }),
  composeScenarioGroup({
    id: "state-machine-record",
    kind: "state-machine-enum",
    surface: "record",
    base: stateMachineRecordBase,
    axes: [
      composeScenarioAxis("value", "Value", [
        scenarioOption("open", "Active", withStateValue("open")),
        scenarioOption("done", "Terminal", withStateValue("done")),
        scenarioOption("undeclared", "Undeclared", withStateValue("paused")),
        scenarioOption("unset", "Unset", withStateValue("")),
      ]),
      stateMachineInteractionAxis,
    ],
    finalizeField: finalizeRecordStateMachineField,
  }),
  composeScenarioGroup({
    id: "state-machine-table-cell",
    kind: "state-machine-enum",
    surface: "table-cell",
    base: stateMachineTableCellBase,
    axes: [
      composeScenarioAxis("value", "Value", [
        scenarioOption("open", "Active", withStateValue("open")),
        scenarioOption("done", "Terminal", withStateValue("done")),
        scenarioOption("undeclared", "Undeclared", withStateValue("paused")),
        scenarioOption("unset", "Unset", withStateValue("")),
      ]),
      stateMachineInteractionAxis,
    ],
    finalizeField: finalizeTableCellStateMachineField,
  }),
  composeScenarioGroup({
    id: "state-machine-detail",
    kind: "state-machine-enum",
    surface: "detail",
    base: stateMachineDetailBase,
    axes: [
      composeScenarioAxis("value", "Value", [
        scenarioOption("open", "Active", withStateValue("open")),
        scenarioOption("done", "Terminal", withStateValue("done")),
        scenarioOption("undeclared", "Undeclared", withStateValue("paused")),
        scenarioOption("unset", "Unset", withStateValue("")),
      ]),
      stateMachineInteractionAxis,
    ],
    finalizeField: finalizeDetailStateMachineField,
  }),
] satisfies readonly FieldScenarioGroup[];

function finalizeRecordStateMachineField({ field, optionIds }: FieldScenarioComposeContext) {
  return {
    ...field,
    recordId: `state-status-record-${optionIds.join("-")}`,
  };
}

function finalizeTableCellStateMachineField({ field, optionIds }: FieldScenarioComposeContext) {
  return {
    ...field,
    recordId: `state-status-cell-${optionIds.join("-")}`,
  };
}

function finalizeDetailStateMachineField({ field, optionIds }: FieldScenarioComposeContext) {
  return {
    ...field,
    recordId: `state-status-detail-${optionIds.join("-")}`,
  };
}

function withStateValue(value: string): FieldScenarioFieldModifier {
  return (field) => applyStateMachineFacts(field, { value });
}

function withStateMachineInteraction(
  interaction: "display" | "transitions",
): FieldScenarioFieldModifier {
  return (field) => applyStateMachineFacts(field, { interaction });
}

function stateMachineCreateField() {
  const stateMachine = stateMachineField({
    fieldName: "status",
    machineName: "taskWorkflow",
    machine: taskWorkflowMachine,
  });

  return createField({
    fieldName: "status",
    field: stateStatusField,
    editor: "enum",
    control: enumControl(stateStatusField),
    draftInput: { kind: "value", value: stateMachine.initialState },
    access: { kind: "stateMachine", writable: false },
    labelVisibility: "visible",
    options: { enumOptions: stateStatusOptions },
    occurrence: { ownerId: "state-status-create", placementId: "status" },
    recordId: "state-status-create",
    stateMachine,
    stateMachineFacts: stateMachineFacts({
      currentValue: stateMachine.initialState,
      field: stateStatusField,
      interaction: "display",
      operationNames,
      stateMachine,
    }),
    value: stateMachine.initialState,
  });
}

function stateMachineDisplayField(input: {
  recordId: string;
  surface: "detail" | "record" | "table-cell";
  value: string;
}) {
  const stateMachine = stateMachineField({
    fieldName: "status",
    machineName: "taskWorkflow",
    machine: taskWorkflowMachine,
  });

  return displayField({
    fieldName: "status",
    field: stateStatusField,
    editor: "enum",
    control: enumControl(stateStatusField),
    access: { kind: "stateMachine", writable: false },
    density: input.surface === "table-cell" ? "compact" : "default",
    formatting: {
      displayValue: displayOption(stateStatusField, input.value),
      enumValuePresentation: stateValuePresentation(stateStatusField, input.value),
    },
    labelVisibility: input.surface === "detail" ? "visible" : "hidden",
    options: { enumOptions: stateStatusOptions },
    occurrence: { ownerId: input.recordId, placementId: "status" },
    recordId: input.recordId,
    stateMachine,
    stateMachineFacts: stateMachineFacts({
      currentValue: input.value,
      field: stateStatusField,
      operationNames,
      stateMachine,
    }),
    surface: input.surface,
    value: input.value,
  });
}

function applyStateMachineFacts(
  field: FieldContract,
  input: {
    field?: Extract<
      FieldSchema,
      {
        type: "enum";
      }
    >;
    interaction?: "display" | "transitions";
    machine?: StateMachineSchema;
    value?: unknown;
  },
): FieldContract {
  if (field.mode !== "display") {
    return field;
  }

  const enumField = input.field ?? (field.field.type === "enum" ? field.field : stateStatusField);
  const machine =
    input.machine ?? field.stateMachineFacts?.stateMachine.machine ?? taskWorkflowMachine;
  const value =
    typeof input.value === "string"
      ? input.value
      : typeof field.stateMachineFacts?.currentValue === "string"
        ? field.stateMachineFacts.currentValue
        : "";
  const stateMachine = stateMachineField({
    fieldName: "status",
    machineName: "taskWorkflow",
    machine,
  });

  return {
    ...field,
    control: enumControl(enumField),
    field: enumField,
    formatting: {
      ...field.formatting,
      displayValue: displayOption(enumField, value),
      enumValuePresentation: stateValuePresentation(enumField, value),
    },
    options: {
      enumOptions: enumOptions(enumField, {
        blocked: { iconSource: closeIconSource },
        done: { iconSource: confirmIconSource },
        open: { iconSource: priorityMarkerIconSource },
      }),
    },
    stateMachine,
    stateMachineFacts: stateMachineFacts({
      currentValue: value,
      field: enumField,
      interaction: input.interaction ?? field.stateMachineFacts?.interaction.kind,
      operationNames,
      stateMachine,
    }),
    value,
  };
}
function displayOption(
  field: Extract<
    FieldSchema,
    {
      type: "enum";
    }
  >,
  value: string,
) {
  return field.values.find((definition) => definition.key === value)?.label ?? value;
}
function stateValuePresentation(
  field: Extract<
    FieldSchema,
    {
      type: "enum";
    }
  >,
  value: string,
) {
  const iconSource =
    value === "open"
      ? priorityMarkerIconSource
      : value === "blocked"
        ? closeIconSource
        : value === "done"
          ? confirmIconSource
          : undefined;

  return enumValuePresentation(field, value, iconSource);
}
