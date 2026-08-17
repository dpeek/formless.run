import type { MediaAssetOption } from "@dpeek/formless-media/client";
import type {
  CollectionEmptyStatePrimaryActionContract,
  DisplayFieldContract,
  FieldContract,
  FieldIntent,
  TableActionContract,
  TableActionGroupContract,
  TableCellContentContract,
  TableContract,
  TableOperationActionContract,
} from "@dpeek/formless-presentation/contract";
import { parseSourceSvg } from "@dpeek/formless-source-svg";
import {
  evaluateNumericExpression,
  isValidStoredFieldValue,
  resolveRecordLink,
  resolveRecordFieldValue,
  type AppSchema,
  type EntitySchema,
  type QueryEvaluationContext,
  type RecordLinkResolutionOptions,
} from "@dpeek/formless-schema";
import type { StoredRecord } from "@dpeek/formless-storage";
import { createAggregateValueMatchingQuerySelector } from "../../client/projections.ts";
import { getClientStoreSnapshot } from "../../client/store.ts";
import {
  createIdleGeneratedOperationExecutionState,
  projectOrderingMoveOperationControlBinding,
  projectTableOperationControlBinding,
  recordFieldIsWritable,
  recordFieldRef,
  type EditRecordTableOperationControlConfig,
  type GeneratedCommandDraftSessionState,
  type GeneratedOperationControlBinding,
  type GeneratedOperationController,
  type HomeQueryTabConfig,
  type RecordFieldConfig,
  type RecordUnionPresentationConfig,
  type TableOperationControlConfig,
} from "../../client/views.ts";
import type { TableCollectionResultModel } from "../../client/collection-result-model.ts";
import { selectTransitionStateOperationAvailability } from "../../client/state-machine-model.ts";
import { formatAggregateDisplayValue, formatComputedDisplayValue } from "./format.ts";
import { projectGeneratedOperationControl } from "./operation-projection.ts";
import {
  projectGeneratedDisplayField,
  projectGeneratedRecordFields,
  type GeneratedRecordFieldOwner,
} from "./field-projection.ts";
import {
  projectGeneratedTableActionGroup,
  projectGeneratedTableCellValue,
  projectGeneratedTableDisplayValue,
  projectGeneratedTableEditAction,
  projectGeneratedTableInvalidValue,
  projectGeneratedTableContract,
  projectGeneratedTableOperationAction,
  projectGeneratedTableOrdering,
} from "./table-projection.ts";
import { projectGeneratedNativeLinkAction } from "./native-link-projection.ts";
import {
  executeGeneratedOperationControl,
  executeGeneratedOrderingMoveOperation,
} from "./operation-control-runtime.ts";
import {
  selectOrderingMoveMenuItems,
  selectResultOrderingContext,
  type OrderingMoveMenuItem,
  type ResultOrderingContext,
} from "./ordering-ui.ts";
import {
  initialGeneratedUpdateDraftSessionState,
  nextGeneratedUpdateDraftSessionState,
  selectGeneratedUpdateDraftSession,
  type GeneratedUpdateDraftSessionState,
} from "./record-field-authoring.ts";
import { executeTransitionStateOperation } from "./state-machine-operation-runtime.ts";
import { shouldUseAppReplicaReferenceOptions } from "./reference-field-options.ts";
import {
  selectGeneratedTablePresentation,
  type GeneratedTableCellPresentation,
  type GeneratedTablePresentation,
} from "./table-presentation.ts";

export type GeneratedTableEditContext = {
  entityName: string;
  fields: RecordFieldConfig[];
  id: string;
  record: StoredRecord;
  recordId: string;
  union?: RecordUnionPresentationConfig;
  updateOperation?: TableCollectionResultModel["updateOperation"];
};

export type GeneratedTableEditContextState = {
  baselineUpdatedAt: string;
  editorDraftByFieldName: Record<string, string | undefined>;
  errorsByFieldName: Record<string, string | undefined>;
  iconDialogDraftByFieldName: Record<string, string | undefined>;
  iconDialogOpenByFieldName: Record<string, boolean | undefined>;
  pendingByFieldName: Record<string, boolean | undefined>;
  session: GeneratedUpdateDraftSessionState;
};

export type GeneratedTableEditFieldRuntime = {
  context: GeneratedTableEditContext;
  contextId: string;
  field: FieldContract;
  fieldConfig: RecordFieldConfig;
  fieldId: string;
  kind: "field";
  recordId: string;
  tableId: string;
};

export type GeneratedTableEditFieldIndex = ReadonlyMap<string, GeneratedTableEditFieldRuntime>;

export type GeneratedTableOperationRuntime =
  | {
      binding: GeneratedOperationControlBinding;
      kind: "control";
      recordId: string;
      control: TableOperationControlConfig;
    }
  | {
      binding: GeneratedOperationControlBinding;
      kind: "ordering";
      item: OrderingMoveMenuItem;
      orderingContext: ResultOrderingContext;
      recordId: string;
    }
  | {
      binding: GeneratedOperationControlBinding;
      control: Extract<TableOperationControlConfig, { type: "transition" }>;
      kind: "transition";
      operation: Extract<TableOperationControlConfig, { type: "transition" }>["transition"];
      recordId: string;
    };

export type GeneratedTableRuntimePlan = {
  operationById: ReadonlyMap<string, GeneratedTableOperationRuntime>;
  operations: readonly GeneratedTableOperationRuntime[];
  orderingByCellId: ReadonlyMap<string, readonly GeneratedTableOperationRuntime[]>;
  orderingItemsByCellId: ReadonlyMap<string, readonly OrderingMoveMenuItem[]>;
};

export type SelectGeneratedWorkspaceTableFoundationOptions = {
  commandDialogOpenById?: Readonly<Record<string, boolean | undefined>>;
  commandStateById?: Readonly<Record<string, GeneratedCommandDraftSessionState | undefined>>;
  confirmationOpenById?: Readonly<Record<string, boolean | undefined>>;
  controller: GeneratedOperationController;
  dialogOpenById?: Readonly<Record<string, boolean | undefined>>;
  entity: EntitySchema;
  entityName: string;
  emptyStateAction?: CollectionEmptyStatePrimaryActionContract;
  editStateByContextId?: Readonly<Record<string, GeneratedTableEditContextState | undefined>>;
  id: string;
  mediaAssetOptionsForField?: (
    entityName: string,
    fieldName: string,
  ) => readonly MediaAssetOption[];
  query: HomeQueryTabConfig["query"];
  queryContext?: QueryEvaluationContext;
  queryName: string;
  recordLinkOptions?: RecordLinkResolutionOptions;
  recordIds: readonly string[];
  recordsById: Readonly<Record<string, StoredRecord>>;
  result: TableCollectionResultModel;
  schema?: AppSchema | null;
};

export function selectGeneratedWorkspaceTableFoundation({
  commandDialogOpenById = {},
  commandStateById = {},
  confirmationOpenById = {},
  controller,
  dialogOpenById = {},
  entity,
  entityName,
  emptyStateAction,
  editStateByContextId = {},
  id,
  mediaAssetOptionsForField = () => [],
  query,
  queryContext,
  queryName,
  recordLinkOptions = {},
  recordIds,
  recordsById,
  result,
  schema = null,
}: SelectGeneratedWorkspaceTableFoundationOptions) {
  const orderingContext = selectResultOrderingContext({
    entityName,
    ordering: result.ordering,
    recordIds: [...recordIds],
    recordsById,
    updateOperation: result.updateOperation,
  });
  const orderedRecordIds = orderingContext?.orderedRecordIds ?? [...recordIds];
  const presentation = selectGeneratedTablePresentation({
    columns: result.columns,
    footer: result.footer ?? [],
    orderedRecordIds,
    query,
    queryName,
  });
  const runtimePlan = selectGeneratedTableRuntimePlan({
    orderingContext,
    presentation,
    recordsById,
    tableId: id,
  });
  const projected = projectGeneratedRecordTable({
    commandDialogOpenById,
    commandStateById,
    confirmationOpenById,
    controller,
    dialogOpenById,
    entity,
    entityName,
    emptyStateAction,
    editStateByContextId,
    mediaAssetOptionsForField,
    presentation,
    query,
    queryContext,
    recordLinkOptions,
    recordsById,
    result,
    runtimePlan,
    schema,
    tableId: id,
  });

  return { ...projected, runtimePlan };
}

export function projectGeneratedRecordTable({
  commandDialogOpenById,
  commandStateById,
  confirmationOpenById,
  controller,
  dialogOpenById,
  entity,
  entityName,
  emptyStateAction,
  editStateByContextId,
  mediaAssetOptionsForField,
  presentation,
  query,
  queryContext,
  recordLinkOptions,
  recordsById,
  result,
  runtimePlan,
  schema,
  tableId,
}: {
  commandDialogOpenById: Readonly<Record<string, boolean | undefined>>;
  commandStateById: Readonly<Record<string, GeneratedCommandDraftSessionState | undefined>>;
  confirmationOpenById: Readonly<Record<string, boolean | undefined>>;
  controller: GeneratedOperationController;
  dialogOpenById: Readonly<Record<string, boolean | undefined>>;
  entity: EntitySchema;
  entityName: string;
  emptyStateAction?: CollectionEmptyStatePrimaryActionContract;
  editStateByContextId: Readonly<Record<string, GeneratedTableEditContextState | undefined>>;
  mediaAssetOptionsForField: (entityName: string, fieldName: string) => readonly MediaAssetOption[];
  presentation: GeneratedTablePresentation;
  query: HomeQueryTabConfig["query"];
  queryContext?: QueryEvaluationContext;
  recordLinkOptions: RecordLinkResolutionOptions;
  recordsById: Readonly<Record<string, StoredRecord>>;
  result: TableCollectionResultModel;
  runtimePlan: GeneratedTableRuntimePlan;
  schema: AppSchema | null;
  tableId: string;
}) {
  const editContexts = new Map<string, GeneratedTableEditContext>();
  const rowsByRecordId: Record<
    string,
    {
      accessibilityLabel: string;
      contentsByColumnId: Record<string, readonly TableCellContentContract[]>;
    }
  > = {};

  for (const row of presentation.rows) {
    const record = recordsById[row.recordId];
    const contentsByColumnId: Record<string, readonly TableCellContentContract[]> = {};

    for (const cell of row.cells) {
      contentsByColumnId[cell.columnId] = record
        ? projectGeneratedTableCell({
            commandDialogOpenById,
            commandStateById,
            cell,
            confirmationOpenById,
            controller,
            dialogOpenById,
            entityLabel: entity.label,
            entityName,
            editContexts,
            editStateByContextId,
            mediaAssetOptionsForField,
            record,
            recordLinkOptions,
            recordsById,
            runtimePlan,
            schema,
            tableId,
          })
        : [
            {
              accessibilityLabel: `${cell.column.header.accessibleLabel} unavailable`,
              kind: "unavailable",
              message: "Record unavailable.",
            },
          ];
    }

    rowsByRecordId[row.recordId] = {
      accessibilityLabel: recordLabel(record, entity.label, row.recordId),
      contentsByColumnId,
    };
  }

  const snapshot = getClientStoreSnapshot();
  const footerValuesByColumnId = Object.fromEntries(
    (result.footer ?? []).map((slot) => {
      const value = createAggregateValueMatchingQuerySelector(
        entityName,
        query,
        slot.aggregate,
        slot.computedValues,
        queryContext,
      )(snapshot);

      return [
        presentation.columns.find(
          (column) => column.type === "data" && column.column.key === slot.columnKey,
        )?.id ?? slot.columnKey,
        {
          displayValue: formatAggregateDisplayValue(slot, value),
          ...(slot.suffix === undefined ? {} : { suffix: slot.suffix }),
        },
      ];
    }),
  );

  const table = projectGeneratedTableContract({
    accessibilityLabel: `${entity.label} records`,
    ...(emptyStateAction === undefined ? {} : { emptyStateAction }),
    footerValuesByColumnId,
    id: tableId,
    presentation,
    rowsByRecordId,
  });

  return {
    editContexts,
    editFieldsById: indexGeneratedTableEditFields(table, editContexts, editStateByContextId),
    table,
  };
}

export function indexGeneratedTableEditFields(
  table: TableContract,
  editContexts: ReadonlyMap<string, GeneratedTableEditContext>,
  editStateByContextId: Readonly<Record<string, GeneratedTableEditContextState | undefined>> = {},
): GeneratedTableEditFieldIndex {
  const fieldsById = new Map<string, GeneratedTableEditFieldRuntime>();
  const visibleFieldsByContextId = new Map<string, readonly RecordFieldConfig[]>();

  const registerFields = (contextId: string, fields: readonly FieldContract[]) => {
    const context = editContexts.get(contextId);

    if (context === undefined) {
      throw new Error(`Generated table "${table.id}" is missing edit context "${contextId}".`);
    }

    let visibleFields = visibleFieldsByContextId.get(contextId);
    if (visibleFields === undefined) {
      const state = rebaseGeneratedTableEditContextState(context, editStateByContextId[contextId]);
      visibleFields = selectGeneratedUpdateDraftSession({
        fields: context.fields,
        state: state.session,
        union: context.union,
      }).visibleFields;
      visibleFieldsByContextId.set(contextId, visibleFields);
    }

    for (const field of fields) {
      const fieldConfig = visibleFields.find(
        (candidate) => candidate.fieldName === field.fieldName,
      );

      if (fieldConfig === undefined || field.recordId !== context.recordId) {
        throw new Error(
          `Generated table "${table.id}" projected mismatched runtime facts for field occurrence "${field.fieldId}".`,
        );
      }
      if (fieldsById.has(field.fieldId)) {
        throw new Error(
          `Generated table "${table.id}" contains duplicate field occurrence "${field.fieldId}".`,
        );
      }

      fieldsById.set(field.fieldId, {
        context,
        contextId,
        field,
        fieldConfig,
        fieldId: field.fieldId,
        kind: "field",
        recordId: context.recordId,
        tableId: table.id,
      });
    }
  };

  const indexAction = (action: TableActionContract) => {
    if (action.kind !== "editAction" || action.dialog.target.kind !== "available") {
      return;
    }

    const { target } = action.dialog;
    registerFields(target.fieldSet.id, target.fieldSet.fields);
  };

  const indexActionGroup = (group: TableActionGroupContract) => {
    for (const action of group.actions) {
      indexAction(action);
    }
  };

  for (const row of table.rows) {
    for (const cell of row.cells) {
      for (const content of cell.contents) {
        if (content.kind === "actionGroup") {
          indexActionGroup(content);
        }
      }
    }
  }

  if (table.emptyState?.action !== undefined) {
    if (table.emptyState.action.kind === "operationAction") {
      indexAction(table.emptyState.action);
    }
  }

  return fieldsById;
}

export function resolveGeneratedTableEditFieldIntent(
  fieldsById: GeneratedTableEditFieldIndex,
  {
    contextId,
    fieldId,
    intent,
    recordId,
    tableId,
  }: {
    contextId: string;
    fieldId: string;
    intent: FieldIntent;
    recordId?: string;
    tableId: string;
  },
): GeneratedTableEditFieldRuntime | undefined {
  if (recordId === undefined) {
    return undefined;
  }

  const runtime = fieldsById.get(fieldId);
  const fieldName = "fieldName" in intent ? intent.fieldName : undefined;
  const intentRecordId = intent.type === "stateTransitionInvoke" ? intent.recordId : recordId;

  return runtime !== undefined &&
    recordFieldIsWritable(runtime.fieldConfig) &&
    runtime.tableId === tableId &&
    runtime.contextId === contextId &&
    runtime.recordId === recordId &&
    runtime.field.recordId === recordId &&
    runtime.fieldConfig.fieldName === fieldName &&
    intentRecordId === recordId
    ? runtime
    : undefined;
}

function projectGeneratedTableCell({
  commandDialogOpenById,
  commandStateById,
  cell,
  confirmationOpenById,
  controller,
  dialogOpenById,
  entityLabel,
  entityName,
  editContexts,
  editStateByContextId,
  mediaAssetOptionsForField,
  record,
  recordLinkOptions,
  recordsById,
  runtimePlan,
  schema,
  tableId,
}: {
  commandDialogOpenById: Readonly<Record<string, boolean | undefined>>;
  commandStateById: Readonly<Record<string, GeneratedCommandDraftSessionState | undefined>>;
  cell: GeneratedTableCellPresentation;
  confirmationOpenById: Readonly<Record<string, boolean | undefined>>;
  controller: GeneratedOperationController;
  dialogOpenById: Readonly<Record<string, boolean | undefined>>;
  entityLabel: string;
  entityName: string;
  editContexts: Map<string, GeneratedTableEditContext>;
  editStateByContextId: Readonly<Record<string, GeneratedTableEditContextState | undefined>>;
  mediaAssetOptionsForField: (entityName: string, fieldName: string) => readonly MediaAssetOption[];
  record: StoredRecord;
  recordLinkOptions: RecordLinkResolutionOptions;
  recordsById: Readonly<Record<string, StoredRecord>>;
  runtimePlan: GeneratedTableRuntimePlan;
  schema: AppSchema | null;
  tableId: string;
}): readonly TableCellContentContract[] {
  const column = cell.column.column;

  if (column.type === "computed") {
    const value = evaluateNumericExpression(column.computedValue.expression, record);

    if (value === undefined || !Number.isFinite(value)) {
      return [invalidTableCellValue(column.label)];
    }

    const displayValue = formatComputedDisplayValue(column, value);

    return [
      projectGeneratedTableDisplayValue({
        accessibilityLabel: `${column.label}: ${displayValue}`,
        displayValue,
        suffix: column.suffix,
      }),
    ];
  }

  if (column.type === "orderingHandle") {
    const operations = runtimePlan.orderingByCellId.get(cell.id) ?? [];
    const items = runtimePlan.orderingItemsByCellId.get(cell.id) ?? [];
    return orderingContents(items, operations, controller, tableId, record.id, column.headerLabel);
  }

  if (column.type === "operationControl") {
    const actions = column.controls.map((control): TableActionContract => {
      if (control.type === "editRecord") {
        return projectTableEditAction({
          control,
          dialogOpenById,
          editContexts,
          editStateByContextId,
          mediaAssetOptionsForField,
          record,
          recordsById,
          schema,
          tableId,
        });
      }

      const operation = runtimePlan.operations.find(
        (candidate): candidate is Exclude<GeneratedTableOperationRuntime, { kind: "ordering" }> =>
          candidate.kind !== "ordering" &&
          candidate.recordId === record.id &&
          candidate.control.bindingName === control.bindingName,
      );
      return operationAction({
        commandDialogOpenById,
        commandStateById,
        confirmationOpenById,
        controller,
        runtime: operation,
        schema,
      });
    });
    const ordering = runtimePlan.orderingByCellId.get(cell.id) ?? [];
    const orderingItems = runtimePlan.orderingItemsByCellId.get(cell.id) ?? [];
    const orderingActions = projectOrderingActions(
      orderingItems,
      ordering,
      controller,
      tableId,
      record.id,
      `Reorder ${recordLabel(record, entityLabel, record.id)}`,
    );
    const menuActions = [...actions, ...orderingActions];

    return menuActions.length === 0
      ? []
      : [
          projectGeneratedTableActionGroup({
            accessibilityLabel: `More options for ${recordLabel(record, entityLabel, record.id)}`,
            actions: menuActions,
            id: `${cell.id}:actions`,
          }),
        ];
  }

  if (column.type === "linkControl") {
    const action = projectGeneratedNativeLinkAction({
      accessibilityLabel: `${column.link.label} for ${recordLabel(record, entityLabel, record.id)}`,
      id: `${cell.id}:link`,
      label: column.link.label,
      resolution: resolveRecordLink(column.link, record, recordsById, recordLinkOptions),
      target: column.link.target,
    });

    return [action];
  }

  if (column.type === "referenceField") {
    const referenceRecordId = record.values[column.sourceReferenceFieldName];
    const referenceRecord =
      typeof referenceRecordId === "string" ? recordsById[referenceRecordId] : undefined;

    if (
      !referenceRecord ||
      referenceRecord.deletedAt !== undefined ||
      referenceRecord.entity !== column.referencedEntityName
    ) {
      return [invalidTableCellValue(column.label)];
    }

    return [
      projectTableCellValue({
        entityName: column.referencedEntityName,
        fieldConfig: column,
        mediaAssetOptionsForField,
        record: referenceRecord,
        recordsById,
        schema,
        valueOwnerId: cell.id,
      }),
    ];
  }

  return [
    projectTableCellValue({
      entityName,
      fieldConfig: column,
      mediaAssetOptionsForField,
      record,
      recordsById,
      schema,
      valueOwnerId: cell.id,
    }),
  ];
}

function projectTableCellValue({
  entityName,
  fieldConfig,
  mediaAssetOptionsForField,
  record,
  recordsById,
  schema,
  valueOwnerId,
}: {
  entityName: string;
  fieldConfig: RecordFieldConfig & { suffix?: string };
  mediaAssetOptionsForField: (entityName: string, fieldName: string) => readonly MediaAssetOption[];
  record: StoredRecord;
  recordsById: Readonly<Record<string, StoredRecord>>;
  schema: AppSchema | null;
  valueOwnerId: string;
}) {
  const recordValue = resolveRecordFieldValue(record, recordFieldRef(fieldConfig));
  const referenceOptions = referenceOptionsForField(fieldConfig, recordsById);
  const mediaAssetOptions = mediaAssetOptionsForField(entityName, fieldConfig.fieldName);
  const unitRecordValue =
    fieldConfig.valueUnit === undefined
      ? undefined
      : record.values[fieldConfig.valueUnit.unitFieldName];

  if (
    !tableStoredFieldValuesAreValid({
      fieldConfig,
      recordValue,
      unitRecordValue,
    })
  ) {
    return invalidTableCellValue(fieldConfig.label ?? fieldConfig.fieldName);
  }

  const field = projectGeneratedDisplayField({
    density: "compact",
    fieldConfig,
    mediaAssetOptions,
    occurrence: {
      owner: { kind: "standalone", ownerId: valueOwnerId },
      placementId: fieldConfig.fieldName,
    },
    recordId: record.id,
    recordValue,
    referenceOptions,
    schema,
    showLabel: false,
    surface: "record",
  });

  if (!tableDisplayFieldIsPresentable(field, fieldConfig, recordValue, recordsById)) {
    return invalidTableCellValue(fieldConfig.label ?? fieldConfig.fieldName);
  }

  const unitLabel = tableValueUnitLabel(fieldConfig, unitRecordValue);

  return projectGeneratedTableCellValue(
    field,
    unitLabel ?? field.formatting.suffix ?? field.suffix,
  );
}

function projectTableEditAction({
  control,
  dialogOpenById,
  editContexts,
  editStateByContextId,
  mediaAssetOptionsForField,
  record,
  recordsById,
  schema,
  tableId,
}: {
  control: EditRecordTableOperationControlConfig;
  dialogOpenById: Readonly<Record<string, boolean | undefined>>;
  editContexts: Map<string, GeneratedTableEditContext>;
  editStateByContextId: Readonly<Record<string, GeneratedTableEditContextState | undefined>>;
  mediaAssetOptionsForField: (entityName: string, fieldName: string) => readonly MediaAssetOption[];
  record: StoredRecord;
  recordsById: Readonly<Record<string, StoredRecord>>;
  schema: AppSchema | null;
  tableId: string;
}) {
  const dialogId = `${tableId}:${record.id}:${control.bindingName}:dialog`;
  const targetRecordId =
    control.target.kind === "row"
      ? record.id
      : typeof record.values[control.target.fieldName] === "string"
        ? String(record.values[control.target.fieldName])
        : undefined;
  const targetRecord = targetRecordId ? recordsById[targetRecordId] : undefined;

  if (!targetRecord) {
    return projectGeneratedTableEditAction({
      actionId: `${dialogId}:open`,
      disabled: control.disabled,
      disabledReason: control.disabledReason,
      dialogId,
      label: control.label,
      open: dialogOpenById[dialogId] ?? false,
      rowId: record.id,
      tableId,
      target: { kind: "unavailable", message: "Record unavailable." },
      targetKind: control.target.kind === "row" ? "row" : "reference",
      title: control.label,
      ...(control.target.kind === "reference"
        ? { warning: "Updating this shared record may affect other records." }
        : {}),
    });
  }

  const context = registerTableEditContext({
    entityName: control.editView.entityName,
    fields: control.editView.fields,
    id: `${dialogId}:fields`,
    record: targetRecord,
    union: control.editView.union,
    updateOperation: control.editView.updateOperation,
  });
  editContexts.set(context.id, context);
  const fields = projectTableEditFields(
    context,
    { fieldSetId: context.id, kind: "tableEditFieldSet", tableId },
    editStateByContextId[context.id],
    mediaAssetOptionsForField,
    recordsById,
    schema,
  );

  return projectGeneratedTableEditAction({
    actionId: `${dialogId}:open`,
    description: control.editView.entity.label,
    disabled: control.disabled,
    disabledReason: control.disabledReason,
    dialogId,
    fields,
    label: control.label,
    open: dialogOpenById[dialogId] ?? false,
    rowId: record.id,
    tableId,
    target: {
      editingEnabled: control.editView.updateOperation !== undefined,
      disabledReason:
        control.editView.updateOperation === undefined
          ? `Editing is disabled for ${control.editView.entity.label}.`
          : undefined,
      kind: "available",
    },
    targetKind: control.target.kind === "row" ? "row" : "reference",
    title: control.label,
    ...(control.target.kind === "reference"
      ? { warning: "Updating this shared record may affect other records." }
      : {}),
  });
}

function projectTableEditFields(
  context: GeneratedTableEditContext,
  owner: GeneratedRecordFieldOwner,
  currentState: GeneratedTableEditContextState | undefined,
  mediaAssetOptionsForField: (entityName: string, fieldName: string) => readonly MediaAssetOption[],
  recordsById: Readonly<Record<string, StoredRecord>>,
  schema: AppSchema | null,
): readonly FieldContract[] {
  const state = rebaseGeneratedTableEditContextState(context, currentState);
  const session = selectGeneratedUpdateDraftSession({
    fields: context.fields,
    state: state.session,
    union: context.union,
  });
  const referenceOptionsByFieldName = Object.fromEntries(
    context.fields.map((field) => [field.fieldName, referenceOptionsForField(field, recordsById)]),
  );
  const mediaAssetOptionsByFieldName = Object.fromEntries(
    context.fields
      .filter((field) => field.editor === "media")
      .map((field) => [
        field.fieldName,
        mediaAssetOptionsForField(context.entityName, field.fieldName),
      ]),
  );
  return projectGeneratedRecordFields({
    canPatch: context.updateOperation !== undefined,
    density: "compact",
    editorDraftByFieldName: state.editorDraftByFieldName,
    entityName: context.entityName,
    errorsByFieldName: state.errorsByFieldName,
    iconDialogDraftByFieldName: state.iconDialogDraftByFieldName,
    iconDialogOpenByFieldName: state.iconDialogOpenByFieldName,
    mediaAssetOptionsByFieldName,
    owner,
    pendingByFieldName: state.pendingByFieldName as Record<string, boolean>,
    recordId: context.recordId,
    referenceOptionsByFieldName,
    schema,
    session,
    showLabel: true,
    state: state.session,
    surface: "record",
  });
}

export function selectGeneratedTableRuntimePlan({
  orderingContext,
  presentation,
  recordsById,
  tableId,
}: {
  orderingContext?: ResultOrderingContext;
  presentation: GeneratedTablePresentation;
  recordsById: Readonly<Record<string, StoredRecord>>;
  tableId: string;
}): GeneratedTableRuntimePlan {
  const operations: GeneratedTableOperationRuntime[] = [];
  const orderingByCellId = new Map<string, readonly GeneratedTableOperationRuntime[]>();
  const orderingItemsByCellId = new Map<string, readonly OrderingMoveMenuItem[]>();

  for (const row of presentation.rows) {
    const record = recordsById[row.recordId];

    if (!record) {
      continue;
    }

    for (const cell of row.cells) {
      const column = cell.column.column;

      if (column.type === "operationControl") {
        for (const control of column.controls) {
          const options = {
            executionTargetKey: record.id,
            idPrefix: `table:${record.id}`,
          };
          const binding =
            control.type === "transition"
              ? projectExplicitTableTransitionBinding(control, record, options)
              : projectTableOperationControlBinding(control, options);
          if (binding) {
            operations.push(
              control.type === "transition"
                ? {
                    binding,
                    control,
                    kind: "transition",
                    operation: control.transition,
                    recordId: record.id,
                  }
                : { binding, control, kind: "control", recordId: record.id },
            );
          }
        }
      }

      if (
        column.type === "orderingHandle" ||
        (column.type === "operationControl" && column.includeOrdering)
      ) {
        const items = selectOrderingMoveMenuItems({
          includeOrdering: orderingContext !== undefined,
          orderingContext,
          sourceRecordId: record.id,
        });
        orderingItemsByCellId.set(cell.id, items);
        const ordering = items.flatMap((item): GeneratedTableOperationRuntime[] => {
          if (!orderingContext) {
            return [];
          }
          const binding = projectOrderingMoveOperationControlBinding(
            {
              direction: item.direction,
              disabledReason: item.disabledReason,
              label: item.label,
              ordering: orderingContext.ordering,
              updateOperation: orderingContext.updateOperation,
            },
            {
              executionTargetKey: record.id,
              idPrefix: `${tableId}:${cell.id}`,
            },
          );

          return binding
            ? [{ binding, item, kind: "ordering", orderingContext, recordId: record.id }]
            : [];
        });
        operations.push(...ordering);
        orderingByCellId.set(cell.id, ordering);
      }
    }
  }

  return {
    operationById: new Map(operations.map((operation) => [operation.binding.id, operation])),
    operations,
    orderingByCellId,
    orderingItemsByCellId,
  };
}

function projectExplicitTableTransitionBinding(
  control: Extract<TableOperationControlConfig, { type: "transition" }>,
  record: StoredRecord,
  options: { executionTargetKey: string; idPrefix: string },
): GeneratedOperationControlBinding | undefined {
  const binding = projectTableOperationControlBinding(control, options);
  if (binding === undefined) {
    return undefined;
  }

  const transitionAvailability = selectTransitionStateOperationAvailability({
    currentValue: record.values[control.transition.fieldName],
    field: control.transition.field,
    operation: control.transition,
  });
  const disabledReason =
    binding.availability.state === "disabled"
      ? binding.availability.reason
      : transitionAvailability.valid
        ? undefined
        : (transitionAvailability.disabledReason ?? "Transition unavailable.");
  const { disabledReason: _disabledReason, ...base } = binding;

  return {
    ...base,
    availability:
      disabledReason === undefined
        ? { state: "enabled" }
        : { reason: disabledReason, state: "disabled" },
    ...(disabledReason === undefined ? {} : { disabledReason }),
    input: {
      fieldName: control.transition.fieldName,
      kind: "stateTransition",
      machineName: control.transition.machineName,
      targetState: control.transition.transition.to,
      transitionName: control.transition.transitionName,
    },
    kind: "stateTransition",
  };
}

function operationAction({
  commandDialogOpenById,
  commandStateById,
  confirmationOpenById,
  controller,
  runtime,
  schema,
}: {
  commandDialogOpenById: Readonly<Record<string, boolean | undefined>>;
  commandStateById: Readonly<Record<string, GeneratedCommandDraftSessionState | undefined>>;
  confirmationOpenById: Readonly<Record<string, boolean | undefined>>;
  controller: GeneratedOperationController;
  runtime: GeneratedTableOperationRuntime | undefined;
  schema: AppSchema | null;
}): TableOperationActionContract {
  if (!runtime) {
    throw new Error("Missing generated table operation runtime.");
  }

  const state =
    controller.getStateByExecutionKey(runtime.binding.executionKey) ??
    createIdleGeneratedOperationExecutionState(runtime.binding.executionKey);
  const isDelete = runtime.binding.operationKind === "delete";
  const control = projectGeneratedOperationControl({
    binding: runtime.binding,
    commandDialogOpen: commandDialogOpenById[runtime.binding.id] ?? false,
    commandState: commandStateById[runtime.binding.id],
    confirmationOpen: confirmationOpenById[runtime.binding.id] ?? false,
    presentation: {
      accessibilityLabel: runtime.binding.label,
      content: isDelete
        ? { icon: "delete", kind: "iconAndLabel", label: runtime.binding.label }
        : { kind: "label", label: runtime.binding.label },
      density: "compact",
      invocationSource: "menuItem",
      pendingLabel: `${runtime.binding.label}...`,
      prominence: runtime.binding.destructive ? "destructive" : "secondary",
    },
    state,
    schema,
  });

  return projectGeneratedTableOperationAction(
    control,
    isDelete ? "delete" : runtime.kind === "transition" ? "transition" : "command",
  );
}

function orderingContents(
  items: readonly OrderingMoveMenuItem[],
  operations: readonly GeneratedTableOperationRuntime[],
  controller: GeneratedOperationController,
  tableId: string,
  rowId: string,
  accessibilityLabel: string,
): readonly TableCellContentContract[] {
  const ordering = operations.filter(
    (operation): operation is Extract<GeneratedTableOperationRuntime, { kind: "ordering" }> =>
      operation.kind === "ordering",
  );

  if (items.length === 0) {
    return [];
  }

  return [
    projectGeneratedTableOrdering({
      accessibilityLabel,
      items,
      pending: ordering.some((operation) => controller.isPending(operation.binding.id)),
      rowId,
      tableId,
    }),
  ];
}

function projectOrderingActions(
  items: readonly OrderingMoveMenuItem[],
  operations: readonly GeneratedTableOperationRuntime[],
  controller: GeneratedOperationController,
  tableId: string,
  rowId: string,
  accessibilityLabel: string,
): TableActionContract[] {
  const content = orderingContents(
    items,
    operations,
    controller,
    tableId,
    rowId,
    accessibilityLabel,
  )[0];

  return content?.kind === "ordering" ? [...content.actions] : [];
}

export async function executeGeneratedTableRuntimeOperation(
  runtime: GeneratedTableOperationRuntime,
  controller: GeneratedOperationController,
  source: "button" | "confirmationDialog" | "formSubmit" | "menuItem",
  commandInput?: unknown,
) {
  if (runtime.kind === "transition") {
    return executeTransitionStateOperation({
      binding: runtime.binding,
      controller,
      operation: runtime.operation,
      recordId: runtime.recordId,
      source,
    });
  }

  if (runtime.kind === "ordering") {
    if (runtime.item.plan.kind !== "patch") {
      throw new Error("Ordering action does not contain a patch plan.");
    }

    return executeGeneratedOrderingMoveOperation({
      binding: runtime.binding,
      controller,
      orderingContext: runtime.orderingContext,
      plan: runtime.item.plan,
      source,
    });
  }

  return executeGeneratedOperationControl({
    binding: runtime.binding,
    callerInput: {
      bindingId: runtime.binding.id,
      ...(commandInput === undefined ? {} : { input: commandInput }),
      recordId: runtime.recordId,
      source,
    },
    controller,
  });
}

function registerTableEditContext({
  entityName,
  fields,
  id,
  record,
  union,
  updateOperation,
}: Omit<GeneratedTableEditContext, "recordId">): GeneratedTableEditContext {
  return {
    entityName,
    fields,
    id,
    record,
    recordId: record.id,
    ...(union === undefined ? {} : { union }),
    ...(updateOperation === undefined ? {} : { updateOperation }),
  };
}

export function createGeneratedTableEditContextState(
  context: GeneratedTableEditContext,
): GeneratedTableEditContextState {
  return {
    baselineUpdatedAt: context.record.updatedAt,
    editorDraftByFieldName: {},
    errorsByFieldName: {},
    iconDialogDraftByFieldName: {},
    iconDialogOpenByFieldName: {},
    pendingByFieldName: {},
    session: initialGeneratedUpdateDraftSessionState({
      baselineValues: context.record.values,
      fields: context.fields,
      union: context.union,
    }),
  };
}

export function rebaseGeneratedTableEditContextState(
  context: GeneratedTableEditContext,
  current?: GeneratedTableEditContextState,
): GeneratedTableEditContextState {
  return current?.baselineUpdatedAt === context.record.updatedAt
    ? current
    : createGeneratedTableEditContextState(context);
}

export function resetFailedTableEditSession(
  session: GeneratedUpdateDraftSessionState,
  fieldConfig: RecordFieldConfig | undefined,
) {
  if (fieldConfig === undefined) {
    return session;
  }

  const resetFieldSession = nextGeneratedUpdateDraftSessionState({
    fieldName: fieldConfig.fieldName,
    fieldValue: undefined,
    state: session,
  });
  const unitFieldName = fieldConfig.valueUnit?.unitFieldName;

  return unitFieldName === undefined
    ? resetFieldSession
    : nextGeneratedUpdateDraftSessionState({
        fieldName: unitFieldName,
        fieldValue: undefined,
        state: resetFieldSession,
      });
}

function referenceOptionsForField(
  fieldConfig: RecordFieldConfig,
  recordsById: Readonly<Record<string, StoredRecord>>,
) {
  if (
    fieldConfig.field.type !== "reference" ||
    !shouldUseAppReplicaReferenceOptions(fieldConfig.field)
  ) {
    return [];
  }
  const referenceField = fieldConfig.field;

  return Object.values(recordsById).flatMap((record) => {
    if (record.entity !== referenceField.to || record.deletedAt !== undefined) {
      return [];
    }

    const displayValue =
      referenceField.displayField === undefined
        ? undefined
        : record.values[referenceField.displayField];

    return [
      {
        id: record.id,
        label:
          typeof displayValue === "string" && displayValue.trim() !== "" ? displayValue : record.id,
      },
    ];
  });
}

function tableStoredFieldValuesAreValid({
  fieldConfig,
  recordValue,
  unitRecordValue,
}: {
  fieldConfig: RecordFieldConfig;
  recordValue: StoredRecord["values"][string] | undefined;
  unitRecordValue: StoredRecord["values"][string] | undefined;
}) {
  if (recordValue === undefined && fieldConfig.field.required) {
    return false;
  }

  if (!isValidStoredFieldValue(recordValue, fieldConfig.field)) {
    return false;
  }

  const fieldRef = recordFieldRef(fieldConfig);
  if (
    fieldRef.kind === "system" &&
    fieldRef.name !== "id" &&
    recordValue !== undefined &&
    (typeof recordValue !== "string" || !Number.isFinite(Date.parse(recordValue)))
  ) {
    return false;
  }

  return (
    fieldConfig.valueUnit === undefined ||
    isValidStoredFieldValue(unitRecordValue, fieldConfig.valueUnit.unitField)
  );
}

function tableDisplayFieldIsPresentable(
  field: DisplayFieldContract,
  fieldConfig: RecordFieldConfig,
  recordValue: StoredRecord["values"][string] | undefined,
  recordsById: Readonly<Record<string, StoredRecord>>,
) {
  const hasValue =
    recordValue !== undefined && (typeof recordValue !== "string" || recordValue.trim() !== "");

  if (fieldConfig.field.type === "reference" && hasValue) {
    if (!shouldUseAppReplicaReferenceOptions(fieldConfig.field)) {
      return true;
    }

    const referencedRecord = typeof recordValue === "string" ? recordsById[recordValue] : undefined;
    return (
      referencedRecord?.entity === fieldConfig.field.to && referencedRecord.deletedAt === undefined
    );
  }

  if (field.control.controlKind === "color" && hasValue) {
    return field.color?.swatch.kind === "hex";
  }

  if (field.control.controlKind === "icon" && hasValue) {
    return parseSourceSvg(field.icon?.previewSource) !== null;
  }

  if (field.control.controlKind === "media" && hasValue) {
    return (
      field.media?.missingSelectedAsset === undefined &&
      typeof field.media?.previewHref === "string" &&
      field.media.previewHref.trim() !== ""
    );
  }

  return true;
}

function tableValueUnitLabel(
  fieldConfig: RecordFieldConfig,
  unitRecordValue: StoredRecord["values"][string] | undefined,
) {
  if (fieldConfig.valueUnit === undefined || typeof unitRecordValue !== "string") {
    return undefined;
  }

  return fieldConfig.valueUnit.unitField.values.find((option) => option.key === unitRecordValue)
    ?.label;
}

function invalidTableCellValue(label: string) {
  return projectGeneratedTableInvalidValue(`${label} value is invalid or unavailable.`);
}

function recordLabel(record: StoredRecord | undefined, entityLabel: string, recordId: string) {
  if (!record) {
    return recordId;
  }

  for (const fieldName of ["label", "title", "name", "slug"]) {
    const value = record.values[fieldName];
    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
  }

  return `${entityLabel} ${recordId}`;
}
