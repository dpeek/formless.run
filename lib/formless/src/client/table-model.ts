import { getFieldTypeBehavior, parseEntityOperationKey } from "@dpeek/formless-schema";
import type {
  AppSchema,
  CollectionTableFooterSlotSchema,
  EditViewSchema,
  EntitySchema,
  FieldSchema,
  TableOperationBindingSchema,
  TableViewSchema,
} from "@dpeek/formless-schema";
import type {
  EditViewConfig,
  RecordFieldConfig,
  TableColumnConfig,
  TableFooterSlotConfig,
  TableOperationControlConfig,
  ValueUnitFieldConfig,
} from "./views.ts";
import { selectAggregateSlot } from "./collection-shell-model.ts";
import {
  selectAvailableEntityOperations,
  selectEntityOperationByKind,
  type EntityOperationPresentationConfig,
} from "./operation-presentation-model.ts";
import {
  selectResultOrderingConfig,
  type ResultOrderingConfig,
  type ResultOrderingPresentation,
} from "./result-ordering-model.ts";
import { selectStateMachineField, selectTransitionStateOperations } from "./state-machine-model.ts";
import { selectRecordUnionPresentation } from "./union-presentation-model.ts";
import {
  selectAddressableRecordFieldConfig,
  selectRecordFieldCommitPolicy,
} from "./field-configs.ts";
import { humanizeFieldName } from "./view-labels.ts";

export type TableResultModel = {
  columns: TableColumnConfig[];
  updateOperation?: EditViewConfig["updateOperation"];
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
  const selectedOrdering =
    resultOrdering ?? selectResultOrderingConfig(tableView.ordering, entity, []);
  const ordering = selectTableOrderingConfig(tableView, selectedOrdering);
  const columns = selectTableColumns(schema, tableView, entity, ordering);
  const updateOperation =
    ordering === undefined
      ? undefined
      : selectEntityOperationByKind(entityName, entity, "update", "record");

  return {
    columns,
    ...(updateOperation === undefined ? {} : { updateOperation }),
    ...(ordering === undefined ? {} : { ordering }),
  };
}

function selectTableOrderingConfig(
  tableView: TableViewSchema,
  ordering: ResultOrderingConfig | undefined,
): ResultOrderingConfig | undefined {
  if (ordering === undefined) {
    return undefined;
  }

  const presentations = tableView.columns.flatMap((column): ResultOrderingPresentation[] => {
    if (column.type === "orderingHandle") {
      return ["dragHandle"];
    }
    if (column.type === "operationControl" && column.includeOrdering === true) {
      return ["moveMenu"];
    }
    return [];
  });

  return { ...ordering, presentations };
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
          display: "readOnly",
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
      return [
        {
          type: "referenceField",
          key: `referenceField:${column.referenceField}.${column.field}`,
          sourceReferenceFieldName: column.referenceField,
          referencedEntityName: sourceReferenceField.to,
          referencedEntity,
          fieldName: column.field,
          fieldRef: selectedField.fieldRef,
          field: selectedField.field,
          editor: getFieldTypeBehavior(selectedField.field).defaultEditor,
          commit: getFieldTypeBehavior(selectedField.field).defaultCommit,
          writable: selectedField.writable,
          label: column.label ?? selectedField.label,
          ...(stateMachine === undefined ? {} : { stateMachine }),
          ...(column.align === undefined ? {} : { align: column.align }),
          ...(column.width === undefined ? {} : { width: column.width }),
          display: "readOnly",
          ...(column.suffix === undefined ? {} : { suffix: column.suffix }),
          format: column.format ?? "plain",
        },
      ];
    }

    if (column.type === "operationControl") {
      const bindingNames = (view.operations ?? []).map((binding) => binding.operation);
      const controls = selectTableOperationControlConfigs(schema, view, bindingNames);
      const includeOrdering = column.includeOrdering === true && ordering !== undefined;

      return [
        {
          type: "operationControl",
          key: `operationControl:${[...bindingNames, ...(includeOrdering ? ["ordering"] : [])].join(",")}`,
          label: "",
          headerLabel: "Actions",
          controls,
          includeOrdering,
          ...(includeOrdering && ordering ? { ordering } : {}),
          align: "end",
          width: "xs",
          display: controls.length === 0 && !includeOrdering ? "hidden" : "readOnly",
          format: "plain",
        },
      ];
    }

    if (column.type === "orderingHandle") {
      return [
        {
          type: "orderingHandle",
          key: "orderingHandle",
          label: "",
          headerLabel: "Reorder",
          align: "center",
          width: "xs",
          display: "readOnly",
          format: "plain",
        },
      ];
    }

    if (column.type === "linkControl") {
      const link = view.links?.find((definition) => definition.key === column.link);
      if (!link) {
        throw new Error(`Missing table link "${column.link}".`);
      }

      return [
        {
          type: "linkControl",
          key: `linkControl:${link.key}`,
          linkName: link.key,
          link,
          label: column.label ?? "",
          headerLabel: column.label ?? link.label,
          ...(column.align === undefined ? { align: "end" as const } : { align: column.align }),
          ...(column.width === undefined ? { width: "xs" as const } : { width: column.width }),
          display: "readOnly",
          format: "plain",
        },
      ];
    }

    const selectedField = selectAddressableRecordFieldConfig(entity, column.field);
    const stateMachine =
      selectedField.fieldRef.kind === "value"
        ? selectStateMachineField(entity, column.field)
        : undefined;
    const valueUnit = selectValueUnitField(entity, column.valueUnit?.unitField);

    return [
      {
        type: "field",
        key: `field:${column.field}`,
        fieldName: column.field,
        fieldRef: selectedField.fieldRef,
        field: selectedField.field,
        editor: getFieldTypeBehavior(selectedField.field).defaultEditor,
        commit: getFieldTypeBehavior(selectedField.field).defaultCommit,
        writable: selectedField.writable,
        label: column.label ?? selectedField.label,
        ...(stateMachine === undefined ? {} : { stateMachine }),
        ...(column.align === undefined ? {} : { align: column.align }),
        ...(column.width === undefined ? {} : { width: column.width }),
        display: "readOnly",
        ...(column.suffix === undefined ? {} : { suffix: column.suffix }),
        format: column.format ?? "plain",
        ...(valueUnit === undefined ? {} : { valueUnit }),
      },
    ];
  });

  return columns;
}

function tableFooterColumnName(column: TableColumnConfig) {
  if (column.type === "field") {
    return column.fieldName;
  }

  if (column.type === "computed") {
    return column.computedValueName;
  }

  if (
    column.type === "linkControl" ||
    column.type === "operationControl" ||
    column.type === "orderingHandle"
  ) {
    return "";
  }

  return `${column.sourceReferenceFieldName}.${column.fieldName}`;
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

    const operationEntity = schema.entities.find(
      (definition) => definition.key === operation.entityName,
    );
    if (operationEntity === undefined) {
      throw new Error(`Missing table operation entity "${operation.entityName}".`);
    }

    const base = {
      bindingName: operation.canonicalKey,
      entity: operationEntity,
      operation,
      label: binding.label ?? operation.label,
      variant:
        binding.variant ?? (operation.operation.kind === "delete" ? "destructive" : "default"),
      disabled: binding.availability?.state === "disabled",
      ...(binding.availability?.reason === undefined
        ? {}
        : { disabledReason: binding.availability.reason }),
    };

    const transition = selectTransitionStateOperations(operation.entityName, operationEntity).find(
      (candidate) => candidate.operationName === operation.operationName,
    );

    if (transition !== undefined) {
      configs.push({ ...base, transition, type: "transition" });
      continue;
    }

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
    ...(union === undefined ? {} : { union }),
  };
}
function selectEditFields(view: EditViewSchema, entity: EntitySchema): RecordFieldConfig[] {
  return view.fields.map((viewField) => {
    const fieldName = viewField.field;
    const selectedField = selectAddressableRecordFieldConfig(entity, fieldName);
    const writable = selectedField.writable && viewField.interaction !== "display";
    const stateMachine =
      writable && selectedField.fieldRef.kind === "value"
        ? selectStateMachineField(entity, fieldName)
        : undefined;

    return {
      fieldName,
      fieldRef: selectedField.fieldRef,
      field: selectedField.field,
      editor: viewField.editor,
      commit: selectRecordFieldCommitPolicy(selectedField.field, viewField.editor),
      writable,
      label: selectedField.label,
      ...(stateMachine === undefined ? {} : { stateMachine }),
      ...(viewField.visibleWhen === undefined ? {} : { visibleWhen: viewField.visibleWhen }),
      ...(viewField.presentation === undefined ? {} : { presentation: viewField.presentation }),
    };
  });
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
