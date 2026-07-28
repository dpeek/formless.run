import { getFieldTypeBehavior, parseEntityOperationKey } from "@dpeek/formless-schema";
import type {
  AppSchema,
  CollectionTableFooterSlotSchema,
  EditViewSchema,
  EntitySchema,
  FieldSchema,
  TableColumnDisplay,
  ItemViewSchema,
  TableOperationBindingSchema,
  TableViewSchema,
} from "@dpeek/formless-schema";
import type {
  EditViewConfig,
  FieldTableColumnConfig,
  OperationControlTableColumnConfig,
  OrderingHandleTableColumnConfig,
  RecordFieldConfig,
  TableColumnConfig,
  TableFooterSlotConfig,
  TableOperationControlConfig,
  TransitionStateOperationConfig,
  ValueUnitFieldConfig,
} from "./views.ts";
import { selectAggregateSlot } from "./collection-shell-model.ts";
import {
  selectAvailableEntityOperations,
  selectEntityOperationByKind,
  type EntityOperationPresentationConfig,
} from "./operation-presentation-model.ts";
import { selectResultOrderingConfig, type ResultOrderingConfig } from "./result-ordering-model.ts";
import { selectStateMachineField, selectTransitionStateOperations } from "./state-machine-model.ts";
import { selectRecordUnionPresentation } from "./union-presentation-model.ts";
import { selectAddressableRecordFieldConfig } from "./field-configs.ts";
import { humanizeFieldName } from "./view-labels.ts";

export type TableResultModel = {
  columns: TableColumnConfig[];
  updateOperation?: EditViewConfig["updateOperation"];
  deleteOperation?: EditViewConfig["updateOperation"];
  transitionOperations: TransitionStateOperationConfig[];
  ordering?: ResultOrderingConfig;
};

export function selectTableFooterSlots(
  schema: AppSchema,
  slots: CollectionTableFooterSlotSchema[],
  columns: TableColumnConfig[],
): TableFooterSlotConfig[] {
  return slots.map((slot) => {
    const column = columns.find((candidate) => tableFooterColumnName(candidate) === slot.column);

    if (!column) {
      throw new Error(`Missing table footer column "${slot.column}".`);
    }

    return {
      ...selectAggregateSlot(schema, slot),
      columnKey: column.key,
    };
  });
}

export function selectTableResultModel(
  schema: AppSchema,
  tableView: TableViewSchema,
  entityName: string,
  entity: EntitySchema,
  resultOrdering?: ResultOrderingConfig,
): TableResultModel {
  const ordering = resultOrdering ?? selectResultOrderingConfig(tableView.ordering, entity);
  const selectedColumns = selectTableColumns(schema, tableView, entity, ordering);
  const selectedTransitionOperations = selectTransitionStateOperations(entityName, entity);
  const { columns, transitionOperations } = pairVisibleStateMachineColumnTransitionOperations(
    selectedColumns,
    selectedTransitionOperations,
  );
  const updateOperation = selectEntityOperationByKind(entityName, entity, "update", "record");
  const deleteOperation = selectEntityOperationByKind(entityName, entity, "delete", "record");

  return {
    columns,
    ...(updateOperation === undefined ? {} : { updateOperation }),
    ...(deleteOperation === undefined ? {} : { deleteOperation }),
    transitionOperations,
    ...(ordering === undefined ? {} : { ordering }),
  };
}

function pairVisibleStateMachineColumnTransitionOperations(
  columns: TableColumnConfig[],
  transitionOperations: TransitionStateOperationConfig[],
): Pick<TableResultModel, "columns" | "transitionOperations"> {
  if (transitionOperations.length === 0) {
    return { columns, transitionOperations };
  }

  const pairedOperationNames = new Set<string>();
  const pairedMachineFields = new Set<string>();
  const pairedColumns = columns.map((column): TableColumnConfig => {
    if (
      column.type !== "field" ||
      column.display === "hidden" ||
      column.field.type !== "enum" ||
      column.stateMachine === undefined
    ) {
      return column;
    }

    const pairKey = `${column.stateMachine.machineName}:${column.fieldName}`;

    if (pairedMachineFields.has(pairKey)) {
      return column;
    }

    const operations = transitionOperations.filter(
      (operation) =>
        operation.machineName === column.stateMachine?.machineName &&
        operation.fieldName === column.fieldName,
    );

    if (operations.length === 0) {
      return column;
    }

    pairedMachineFields.add(pairKey);

    for (const operation of operations) {
      pairedOperationNames.add(operation.operationName);
    }

    return {
      ...column,
      stateTransitionOperations: operations,
    };
  });

  return {
    columns: pairedColumns,
    transitionOperations: transitionOperations.filter(
      (operation) => !pairedOperationNames.has(operation.operationName),
    ),
  };
}

function selectTableColumns(
  schema: AppSchema,
  view: TableViewSchema,
  entity: EntitySchema,
  ordering: ResultOrderingConfig | undefined,
): TableColumnConfig[] {
  const columns: TableColumnConfig[] = view.columns.flatMap((column): TableColumnConfig[] => {
    if (column.type === "computed") {
      const computedValue = schema.readModels?.computedValues?.find(
        (definition) => definition.key === column.computedValue,
      );
      if (!computedValue) {
        throw new Error(`Missing computed value "${column.computedValue}".`);
      }

      if (computedValue.entity !== view.entity) {
        throw new Error(
          `Computed value "${column.computedValue}" must use table entity "${view.entity}".`,
        );
      }

      return [
        {
          type: "computed",
          key: `computed:${column.computedValue}`,
          computedValueName: column.computedValue,
          computedValue,
          label: column.label ?? humanizeFieldName(column.computedValue),
          ...(column.align === undefined ? {} : { align: column.align }),
          ...(column.width === undefined ? {} : { width: column.width }),
          display: column.display === "hidden" ? "hidden" : "readOnly",
          ...(column.suffix === undefined ? {} : { suffix: column.suffix }),
          format: column.format ?? "plain",
        },
      ];
    }
    if (column.type === "referenceField") {
      const sourceReferenceField = entity.fields.find(
        (definition) => definition.key === column.referenceField,
      )! as FieldSchema;
      if (sourceReferenceField.type !== "reference") {
        throw new Error(`Missing reference field "${column.referenceField}".`);
      }
      const referencedEntity = schema.entities.find(
        (definition) => definition.key === sourceReferenceField.to,
      )! as EntitySchema;
      const selectedField = selectAddressableRecordFieldConfig(referencedEntity, column.field);
      const stateMachine =
        selectedField.fieldRef.kind === "value"
          ? selectStateMachineField(referencedEntity, column.field)
          : undefined;
      const referencedUpdateOperation = selectEntityOperationByKind(
        sourceReferenceField.to,
        referencedEntity,
        "update",
        "record",
      );

      return [
        {
          type: "referenceField",
          key: `referenceField:${column.referenceField}.${column.field}`,
          sourceReferenceFieldName: column.referenceField,
          referencedEntityName: sourceReferenceField.to,
          referencedEntity,
          ...(referencedUpdateOperation === undefined ? {} : { referencedUpdateOperation }),
          fieldName: column.field,
          fieldRef: selectedField.fieldRef,
          field: selectedField.field,
          editor:
            selectedField.writable && column.editor !== undefined
              ? column.editor
              : getFieldTypeBehavior(selectedField.field).defaultEditor,
          commit:
            selectedField.writable && column.commit !== undefined
              ? column.commit
              : getFieldTypeBehavior(selectedField.field).defaultCommit,
          writable: selectedField.writable,
          label: column.label ?? selectedField.label,
          ...(stateMachine === undefined ? {} : { stateMachine }),
          ...(column.align === undefined ? {} : { align: column.align }),
          ...(column.width === undefined ? {} : { width: column.width }),
          display: selectFieldColumnDisplay(column.display, selectedField.writable, "editor"),
          ...(column.suffix === undefined ? {} : { suffix: column.suffix }),
          format: column.format ?? "plain",
          ...(selectedField.writable && column.presentation !== undefined
            ? { presentation: column.presentation }
            : {}),
        },
      ];
    }

    if (column.type === "operationControl") {
      const bindingNames = operationControlBindingNames(column);
      const controls = selectTableOperationControlConfigs(schema, view, bindingNames);
      const includeOrdering =
        column.includeOrdering === true && ordering?.presentations.includes("moveMenu") === true;
      const presentation =
        column.presentation ?? (controls.length === 1 && !includeOrdering ? "button" : "dropdown");
      const headerLabel =
        column.label ??
        (includeOrdering ? "Actions" : defaultOperationControlHeaderLabel(controls));

      return [
        {
          type: "operationControl",
          key: `operationControl:${[...bindingNames, ...(includeOrdering ? ["ordering"] : [])].join(",")}`,
          label: column.label ?? "",
          headerLabel,
          controls,
          presentation,
          includeOrdering,
          ...(includeOrdering && ordering ? { ordering } : {}),
          ...(column.align === undefined ? { align: "end" as const } : { align: column.align }),
          ...(column.width === undefined ? { width: "xs" as const } : { width: column.width }),
          display:
            controls.length === 0 && !includeOrdering ? "hidden" : (column.display ?? "readOnly"),
          format: "plain",
        },
      ];
    }

    if (column.type === "orderingHandle") {
      return [
        {
          type: "orderingHandle",
          key: "orderingHandle",
          label: column.label ?? "",
          headerLabel: column.label ?? "Reorder",
          ...(column.align === undefined ? { align: "center" as const } : { align: column.align }),
          ...(column.width === undefined ? { width: "xs" as const } : { width: column.width }),
          display: column.display ?? "readOnly",
          format: "plain",
        },
      ];
    }

    const selectedField = selectAddressableRecordFieldConfig(entity, column.field);
    const stateMachine =
      selectedField.fieldRef.kind === "value"
        ? selectStateMachineField(entity, column.field)
        : undefined;
    const referenceItem = selectReferenceItem(
      schema,
      selectedField.field,
      column.referenceItemView,
    );
    const valueUnit = selectedField.writable
      ? selectValueUnitField(entity, column.valueUnit?.unitField)
      : undefined;

    return [
      {
        type: "field",
        key: `field:${column.field}`,
        fieldName: column.field,
        fieldRef: selectedField.fieldRef,
        field: selectedField.field,
        editor:
          selectedField.writable && column.editor !== undefined
            ? column.editor
            : getFieldTypeBehavior(selectedField.field).defaultEditor,
        commit:
          selectedField.writable && column.commit !== undefined
            ? column.commit
            : getFieldTypeBehavior(selectedField.field).defaultCommit,
        writable: selectedField.writable,
        label: column.label ?? selectedField.label,
        ...(stateMachine === undefined ? {} : { stateMachine }),
        ...(column.align === undefined ? {} : { align: column.align }),
        ...(column.width === undefined ? {} : { width: column.width }),
        display: selectFieldColumnDisplay(
          column.display,
          selectedField.writable,
          ordering?.fieldName === column.field ? "hidden" : "editor",
        ),
        ...(column.suffix === undefined ? {} : { suffix: column.suffix }),
        format: column.format ?? "plain",
        ...(referenceItem === undefined ? {} : { referenceItem }),
        ...(valueUnit === undefined ? {} : { valueUnit }),
        ...(selectedField.writable && column.presentation !== undefined
          ? { presentation: column.presentation }
          : {}),
      },
    ];
  });

  const columnsWithOrderingHandle =
    ordering?.presentations.includes("dragHandle") &&
    !view.columns.some((column) => column.type === "orderingHandle")
      ? [selectSyntheticOrderingHandleColumn(), ...columns]
      : columns;

  if (
    ordering?.presentations.includes("moveMenu") &&
    !view.columns.some((column) => column.type === "operationControl" && column.includeOrdering)
  ) {
    return [...columnsWithOrderingHandle, selectSyntheticOrderingMenuColumn(ordering)];
  }

  return columnsWithOrderingHandle;
}

function tableFooterColumnName(column: TableColumnConfig) {
  if (column.type === "field") {
    return column.fieldName;
  }

  if (column.type === "computed") {
    return column.computedValueName;
  }

  if (column.type === "operationControl" || column.type === "orderingHandle") {
    return "";
  }

  return `${column.sourceReferenceFieldName}.${column.fieldName}`;
}

function selectFieldColumnDisplay(
  display: TableColumnDisplay | undefined,
  writable: boolean,
  defaultDisplay: TableColumnDisplay,
) {
  if (display === "hidden") {
    return "hidden";
  }

  return writable ? (display ?? defaultDisplay) : "readOnly";
}

function selectSyntheticOrderingMenuColumn(
  ordering: ResultOrderingConfig,
): OperationControlTableColumnConfig {
  return {
    type: "operationControl",
    key: "operationControl:ordering",
    label: "",
    headerLabel: "Actions",
    controls: [],
    presentation: "dropdown",
    includeOrdering: true,
    ordering,
    align: "end",
    width: "xs",
    display: "readOnly",
    format: "plain",
  };
}

function selectSyntheticOrderingHandleColumn(): OrderingHandleTableColumnConfig {
  return {
    type: "orderingHandle",
    key: "orderingHandle",
    label: "",
    headerLabel: "Reorder",
    align: "center",
    width: "xs",
    display: "readOnly",
    format: "plain",
  };
}

function selectTableOperationControlConfigs(
  schema: AppSchema,
  tableView: TableViewSchema,
  operationKeys: string[],
): TableOperationControlConfig[] {
  const configs: TableOperationControlConfig[] = [];

  for (const operationKey of operationKeys) {
    const binding = tableView.operations?.find((candidate) => candidate.operation === operationKey);

    if (!binding || binding.availability?.state === "hidden") {
      continue;
    }

    const operation = selectBoundTableOperation(schema, binding.operation);

    if (operation === undefined) {
      continue;
    }

    const base = {
      bindingName: operation.canonicalKey,
      operation,
      label: binding.label ?? operation.label,
      variant:
        binding.variant ?? (operation.operation.kind === "delete" ? "destructive" : "default"),
      disabled: binding.availability?.state === "disabled",
      ...(binding.availability?.reason === undefined
        ? {}
        : { disabledReason: binding.availability.reason }),
    };

    if (operation.operation.kind !== "update" || binding.editView === undefined) {
      configs.push({ ...base, type: "static" });
      continue;
    }

    const editView = selectEditViewConfig(schema, binding.editView);

    configs.push({
      ...base,
      type: "editRecord",
      target: selectEditRecordTarget(schema, tableView, binding),
      editView,
    });
  }

  return configs;
}

function selectBoundTableOperation(
  schema: AppSchema,
  canonicalKey: string,
): EntityOperationPresentationConfig | undefined {
  const { entityKey: entityName, operationKey: operationName } = parseEntityOperationKey(
    "Table operation binding",
    canonicalKey,
  );
  const entity = schema.entities.find((definition) => definition.key === entityName)!;
  const operation = entity?.operations?.find((definition) => definition.key === operationName);
  if (!entity || !operation) {
    throw new Error(`Missing table operation binding "${canonicalKey}".`);
  }

  return selectAvailableEntityOperations(entityName, entity, "record").find(
    (candidate) => candidate.operationName === operationName,
  );
}

function selectEditRecordTarget(
  schema: AppSchema,
  tableView: TableViewSchema,
  binding: TableOperationBindingSchema,
): Extract<
  TableOperationControlConfig,
  {
    type: "editRecord";
  }
>["target"] {
  const tableEntity = schema.entities.find((definition) => definition.key === tableView.entity)!;
  if (!tableEntity) {
    throw new Error(`Missing table entity "${tableView.entity}".`);
  }
  const target = binding.target;
  if (target === undefined || target.kind === "row") {
    return {
      kind: "row",
      entityName: tableView.entity,
      entity: tableEntity,
    };
  }
  const field = tableEntity.fields.find((definition) => definition.key === target.field);
  if (field?.type !== "reference") {
    throw new Error(`Missing reference field "${tableView.entity}.${target.field}".`);
  }
  const referencedEntity = schema.entities.find((definition) => definition.key === field.to)!;
  if (!referencedEntity) {
    throw new Error(`Missing referenced entity "${field.to}".`);
  }
  return {
    kind: "reference",
    fieldName: target.field,
    field,
    entityName: field.to,
    entity: referencedEntity,
  };
}
function selectEditViewConfig(schema: AppSchema, editViewName: string): EditViewConfig {
  const view = schema.views.find((definition) => definition.key === editViewName)!;
  if (!view || view.type !== "edit") {
    throw new Error(`Missing edit view "${editViewName}".`);
  }
  const entity = schema.entities.find((definition) => definition.key === view.entity)!;
  if (!entity) {
    throw new Error(`Missing edit view entity "${view.entity}".`);
  }
  const union = selectRecordUnionPresentation(schema, view, entity);
  const updateOperation = selectEntityOperationByKind(view.entity, entity, "update", "record");

  return {
    viewName: editViewName,
    entityName: view.entity,
    entity,
    ...(updateOperation === undefined ? {} : { updateOperation }),
    fields: selectEditFields(view, entity),
    transitionOperations: selectTransitionStateOperations(view.entity, entity),
    ...(union === undefined ? {} : { union }),
  };
}
function selectEditFields(view: EditViewSchema, entity: EntitySchema): RecordFieldConfig[] {
  return view.fields.flatMap((viewField) => {
    const fieldName = viewField.field;
    const selectedField = selectAddressableRecordFieldConfig(entity, fieldName);
    if (!selectedField.writable) {
      return [];
    }

    const stateMachine = selectStateMachineField(entity, fieldName);

    return [
      {
        fieldName,
        fieldRef: selectedField.fieldRef,
        field: selectedField.field,
        editor: viewField.editor,
        commit: viewField.commit,
        writable: true,
        label: selectedField.label,
        ...(stateMachine === undefined ? {} : { stateMachine }),
        ...(viewField.visibleWhen === undefined ? {} : { visibleWhen: viewField.visibleWhen }),
        ...(viewField.presentation === undefined ? {} : { presentation: viewField.presentation }),
      },
    ];
  });
}
function selectRecordFields(view: ItemViewSchema, entity: EntitySchema): RecordFieldConfig[] {
  return view.fields.map((viewField) => {
    const fieldName = viewField.field;
    const selectedField = selectAddressableRecordFieldConfig(entity, fieldName);
    const stateMachine =
      selectedField.fieldRef.kind === "value"
        ? selectStateMachineField(entity, fieldName)
        : undefined;

    return {
      fieldName,
      fieldRef: selectedField.fieldRef,
      field: selectedField.field,
      editor: selectedField.writable ? viewField.editor : "text",
      commit: selectedField.writable ? viewField.commit : "field-commit",
      writable: selectedField.writable,
      label: selectedField.label,
      ...(stateMachine === undefined ? {} : { stateMachine }),
      ...(viewField.visibleWhen === undefined ? {} : { visibleWhen: viewField.visibleWhen }),
      ...(selectedField.writable && viewField.presentation !== undefined
        ? { presentation: viewField.presentation }
        : {}),
    };
  });
}
function operationControlBindingNames(
  column: Extract<
    TableViewSchema["columns"][number],
    {
      type: "operationControl";
    }
  >,
): string[] {
  return column.operation === undefined ? (column.operations ?? []) : [column.operation];
}

function defaultOperationControlHeaderLabel(controls: TableOperationControlConfig[]) {
  if (controls.length === 1) {
    return controls[0]?.label ?? "Operation";
  }

  return "Actions";
}

function selectValueUnitField(
  entity: EntitySchema,
  unitFieldName: string | undefined,
): ValueUnitFieldConfig | undefined {
  if (unitFieldName === undefined) {
    return undefined;
  }
  const unitField = entity.fields.find((definition) => definition.key === unitFieldName)!;
  if (!unitField || unitField.type !== "enum") {
    return undefined;
  }

  return {
    unitFieldName,
    unitField,
  };
}

function selectReferenceItem(
  schema: AppSchema,
  field: FieldSchema,
  itemViewName: string | undefined,
): FieldTableColumnConfig["referenceItem"] | undefined {
  if (itemViewName === undefined || field.type !== "reference") {
    return undefined;
  }
  const entity = schema.entities.find((definition) => definition.key === field.to)!;
  const itemView = schema.itemViews.find((definition) => definition.key === itemViewName)!;
  if (!entity || !itemView) {
    return undefined;
  }
  const recordUnion = selectRecordUnionPresentation(schema, itemView, entity);
  const updateOperation = selectEntityOperationByKind(field.to, entity, "update", "record");

  return {
    itemViewName,
    entityName: field.to,
    entity,
    recordFields: selectRecordFields(itemView, entity),
    ...(updateOperation === undefined ? {} : { updateOperation }),
    ...(recordUnion === undefined ? {} : { recordUnion }),
  };
}
