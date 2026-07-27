import type { MediaAssetOption } from "@dpeek/formless-media/client";
import type {
  FieldContract,
  FieldIntent,
  TableActionContract,
  TableActionGroupContract,
  TableCellContentContract,
  TableContract,
  TableOperationActionContract,
} from "@dpeek/formless-presentation/contract";
import {
  evaluateNumericExpression,
  resolveRecordFieldValue,
  type AppSchema,
  type EntitySchema,
  type QueryEvaluationContext,
} from "@dpeek/formless-schema";
import type { StoredRecord } from "@dpeek/formless-storage";
import {
  createAggregateValueMatchingQuerySelector,
  createReferenceOptionsSelector,
} from "../../client/projections.ts";
import { getRecordReadinessWarnings } from "../../client/readiness.ts";
import { getClientStoreSnapshot } from "../../client/store.ts";
import {
  projectOrderingMoveOperationControlBinding,
  projectStateTransitionOperationControlBinding,
  projectTableOperationControlBinding,
  recordFieldIsWritable,
  recordFieldRef,
  type EditRecordTableOperationControlConfig,
  type GeneratedOperationControlBinding,
  type GeneratedOperationController,
  type HomeQueryTabConfig,
  type RecordFieldConfig,
  type RecordUnionPresentationConfig,
  type TableOperationControlConfig,
  type TransitionStateOperationConfig,
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
  projectGeneratedTableDisplayValue,
  projectGeneratedTableEditAction,
  projectGeneratedTableFieldContent,
  projectGeneratedTableContract,
  projectGeneratedTableInvokeAction,
  projectGeneratedTableOperationAction,
  projectGeneratedTableOrdering,
  type GeneratedTablePlacedAction,
} from "./table-projection.ts";
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
  executeRecordDeleteOperation,
  projectDeleteRecordButtonBinding,
  selectRecordLabel,
} from "./record-delete-runtime.ts";
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

export type GeneratedTableFieldContext = {
  entityName: string;
  fields: RecordFieldConfig[];
  id: string;
  record: StoredRecord;
  recordId: string;
  union?: RecordUnionPresentationConfig;
  updateOperation?: TableCollectionResultModel["updateOperation"];
};

export type GeneratedTableFieldContextState = {
  baselineUpdatedAt: string;
  editorDraftByFieldName: Record<string, string | undefined>;
  errorsByFieldName: Record<string, string | undefined>;
  iconDialogDraftByFieldName: Record<string, string | undefined>;
  iconDialogOpenByFieldName: Record<string, boolean | undefined>;
  pendingByFieldName: Record<string, boolean | undefined>;
  session: GeneratedUpdateDraftSessionState;
};

export type GeneratedTableFieldRuntime = {
  context: GeneratedTableFieldContext;
  contextId: string;
  field: FieldContract;
  fieldConfig: RecordFieldConfig;
  fieldId: string;
  kind: "field";
  placement: "cell" | "dialog";
  recordId: string;
  tableId: string;
};

export type GeneratedTableFieldIndex = ReadonlyMap<string, GeneratedTableFieldRuntime>;

export type GeneratedTableOperationRuntime =
  | {
      binding: GeneratedOperationControlBinding;
      kind: "control";
      recordId: string;
      control: TableOperationControlConfig;
    }
  | {
      binding: GeneratedOperationControlBinding;
      kind: "delete";
      recordId: string;
      recordLabel: string;
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
      kind: "transition";
      operation: TransitionStateOperationConfig;
      recordId: string;
    };

type GeneratedTableTransitionRuntime = Extract<
  GeneratedTableOperationRuntime,
  { kind: "transition" }
>;

export type GeneratedTableRuntimePlan = {
  operationById: ReadonlyMap<string, GeneratedTableOperationRuntime>;
  operations: readonly GeneratedTableOperationRuntime[];
  orderingByCellId: ReadonlyMap<string, readonly GeneratedTableOperationRuntime[]>;
  orderingItemsByCellId: ReadonlyMap<string, readonly OrderingMoveMenuItem[]>;
  transitionsByContextId: ReadonlyMap<string, readonly GeneratedTableTransitionRuntime[]>;
};

export type SelectGeneratedWorkspaceTableFoundationOptions = {
  confirmationOpenById?: Readonly<Record<string, boolean | undefined>>;
  controller: GeneratedOperationController;
  dialogOpenById?: Readonly<Record<string, boolean | undefined>>;
  entity: EntitySchema;
  entityName: string;
  fieldStateByContextId?: Readonly<Record<string, GeneratedTableFieldContextState | undefined>>;
  id: string;
  mediaAssetOptionsForField?: (
    entityName: string,
    fieldName: string,
  ) => readonly MediaAssetOption[];
  query: HomeQueryTabConfig["query"];
  queryContext?: QueryEvaluationContext;
  queryName: string;
  recordIds: readonly string[];
  recordsById: Readonly<Record<string, StoredRecord>>;
  result: TableCollectionResultModel;
  schema?: AppSchema | null;
};

export function selectGeneratedWorkspaceTableFoundation({
  confirmationOpenById = {},
  controller,
  dialogOpenById = {},
  entity,
  entityName,
  fieldStateByContextId = {},
  id,
  mediaAssetOptionsForField = () => [],
  query,
  queryContext,
  queryName,
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
    canDelete: result.deleteOperation !== undefined,
    canPatch: result.updateOperation !== undefined,
    columns: result.columns,
    footer: result.footer ?? [],
    orderedRecordIds,
    orderingDragPatchEnabled: false,
    query,
    queryName,
    transitionOperations: result.transitionOperations,
  });
  const runtimePlan = selectGeneratedTableRuntimePlan({
    entity,
    orderingContext,
    presentation,
    recordsById,
    result,
    tableId: id,
  });
  const projected = projectGeneratedRecordTable({
    confirmationOpenById,
    controller,
    dialogOpenById,
    entity,
    entityName,
    fieldStateByContextId,
    mediaAssetOptionsForField,
    presentation,
    query,
    queryContext,
    recordsById,
    result,
    runtimePlan,
    schema,
    tableId: id,
  });

  return { ...projected, runtimePlan };
}

export function projectGeneratedRecordTable({
  confirmationOpenById,
  controller,
  dialogOpenById,
  entity,
  entityName,
  fieldStateByContextId,
  mediaAssetOptionsForField,
  presentation,
  query,
  queryContext,
  recordsById,
  result,
  runtimePlan,
  schema,
  tableId,
}: {
  confirmationOpenById: Readonly<Record<string, boolean | undefined>>;
  controller: GeneratedOperationController;
  dialogOpenById: Readonly<Record<string, boolean | undefined>>;
  entity: EntitySchema;
  entityName: string;
  fieldStateByContextId: Readonly<Record<string, GeneratedTableFieldContextState | undefined>>;
  mediaAssetOptionsForField: (entityName: string, fieldName: string) => readonly MediaAssetOption[];
  presentation: GeneratedTablePresentation;
  query: HomeQueryTabConfig["query"];
  queryContext?: QueryEvaluationContext;
  recordsById: Readonly<Record<string, StoredRecord>>;
  result: TableCollectionResultModel;
  runtimePlan: GeneratedTableRuntimePlan;
  schema: AppSchema | null;
  tableId: string;
}) {
  const fieldContexts = new Map<string, GeneratedTableFieldContext>();
  const rowsByRecordId: Record<
    string,
    {
      accessibilityLabel: string;
      contentsByColumnId: Record<string, readonly TableCellContentContract[]>;
      readinessWarnings: ReturnType<typeof getRecordReadinessWarnings>;
    }
  > = {};

  for (const row of presentation.rows) {
    const record = recordsById[row.recordId];
    const contentsByColumnId: Record<string, readonly TableCellContentContract[]> = {};

    for (const cell of row.cells) {
      contentsByColumnId[cell.columnId] = record
        ? projectGeneratedTableCell({
            cell,
            confirmationOpenById,
            controller,
            dialogOpenById,
            entityName,
            fieldContexts,
            fieldStateByContextId,
            mediaAssetOptionsForField,
            record,
            recordsById,
            result,
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
      readinessWarnings: record ? getRecordReadinessWarnings(record, recordsById) : [],
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
    editingDisabledReason: `Editing is disabled for ${entity.label}.`,
    footerValuesByColumnId,
    id: tableId,
    presentation,
    rowsByRecordId,
  });

  return {
    fieldContexts,
    fieldsById: indexGeneratedTableFieldOccurrences(table, fieldContexts, fieldStateByContextId),
    table,
  };
}

export function indexGeneratedTableFieldOccurrences(
  table: TableContract,
  fieldContexts: ReadonlyMap<string, GeneratedTableFieldContext>,
  fieldStateByContextId: Readonly<Record<string, GeneratedTableFieldContextState | undefined>> = {},
): GeneratedTableFieldIndex {
  const fieldsById = new Map<string, GeneratedTableFieldRuntime>();
  const visibleFieldsByContextId = new Map<string, readonly RecordFieldConfig[]>();

  const registerFields = (
    contextId: string,
    fields: readonly FieldContract[],
    placement: GeneratedTableFieldRuntime["placement"],
  ) => {
    const context = fieldContexts.get(contextId);

    if (context === undefined) {
      throw new Error(`Generated table "${table.id}" is missing field context "${contextId}".`);
    }

    let visibleFields = visibleFieldsByContextId.get(contextId);
    if (visibleFields === undefined) {
      const state = rebaseGeneratedTableFieldContextState(
        context,
        fieldStateByContextId[contextId],
      );
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
        placement,
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
    registerFields(target.fieldSet.id, target.fieldSet.fields, "dialog");
    if (target.actionGroup !== undefined) {
      indexActionGroup(target.actionGroup);
    }
  };

  const indexActionGroup = (group: TableActionGroupContract) => {
    for (const action of [...group.primary, ...group.secondary]) {
      indexAction(action);
    }
  };

  for (const row of table.rows) {
    for (const cell of row.cells) {
      for (const content of cell.contents) {
        if (content.kind === "field") {
          registerFields(cell.id, [content.field], "cell");
        } else if (content.kind === "actionGroup") {
          indexActionGroup(content);
        }
      }
    }
  }

  if (table.emptyState?.action !== undefined) {
    indexAction(table.emptyState.action);
  }

  return fieldsById;
}

export function resolveGeneratedTableFieldIntent(
  fieldsById: GeneratedTableFieldIndex,
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
): GeneratedTableFieldRuntime | undefined {
  if (recordId === undefined) {
    return undefined;
  }

  const runtime = fieldsById.get(fieldId);
  const fieldName = "fieldName" in intent ? intent.fieldName : undefined;
  const intentRecordId = intent.type === "stateTransitionInvoke" ? intent.recordId : recordId;

  return runtime !== undefined &&
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
  cell,
  confirmationOpenById,
  controller,
  dialogOpenById,
  entityName,
  fieldContexts,
  fieldStateByContextId,
  mediaAssetOptionsForField,
  record,
  recordsById,
  result,
  runtimePlan,
  schema,
  tableId,
}: {
  cell: GeneratedTableCellPresentation;
  confirmationOpenById: Readonly<Record<string, boolean | undefined>>;
  controller: GeneratedOperationController;
  dialogOpenById: Readonly<Record<string, boolean | undefined>>;
  entityName: string;
  fieldContexts: Map<string, GeneratedTableFieldContext>;
  fieldStateByContextId: Readonly<Record<string, GeneratedTableFieldContextState | undefined>>;
  mediaAssetOptionsForField: (entityName: string, fieldName: string) => readonly MediaAssetOption[];
  record: StoredRecord;
  recordsById: Readonly<Record<string, StoredRecord>>;
  result: TableCollectionResultModel;
  runtimePlan: GeneratedTableRuntimePlan;
  schema: AppSchema | null;
  tableId: string;
}): readonly TableCellContentContract[] {
  if (cell.column.type === "delete") {
    const operation = runtimePlan.operations.find(
      (candidate) => candidate.kind === "delete" && candidate.recordId === record.id,
    );
    const action = operationAction(operation, controller, confirmationOpenById);

    return action
      ? [
          projectGeneratedTableActionGroup({
            actions: [{ action, placement: "primary" }],
            id: `${cell.id}:actions`,
            secondaryAccessibilityLabel: "Delete actions",
          }),
        ]
      : [];
  }

  if (cell.column.type === "transition") {
    return actionGroupContents(
      `${cell.id}:actions`,
      "Lifecycle transitions",
      transitionActionsForContext(
        `row:${record.id}`,
        runtimePlan,
        controller,
        confirmationOpenById,
        "primary",
      ),
    );
  }

  const column = cell.column.column;

  if (column.type === "computed") {
    const value = evaluateNumericExpression(column.computedValue.expression, record);

    return [
      projectGeneratedTableDisplayValue({
        accessibilityLabel: `${column.label}: ${formatComputedDisplayValue(column, value)}`,
        displayValue: formatComputedDisplayValue(column, value),
        suffix: column.suffix,
        valueKind: "computed",
      }),
    ];
  }

  if (column.type === "orderingHandle") {
    const operations = runtimePlan.orderingByCellId.get(cell.id) ?? [];
    const items = runtimePlan.orderingItemsByCellId.get(cell.id) ?? [];
    return orderingContents(items, operations, controller, tableId, record.id, column.headerLabel);
  }

  if (column.type === "operationControl") {
    const actions = column.controls.flatMap((control): GeneratedTablePlacedAction[] => {
      if (control.type === "editRecord") {
        return [
          {
            action: projectTableEditAction({
              control,
              dialogOpenById,
              fieldContexts,
              fieldStateByContextId,
              mediaAssetOptionsForField,
              record,
              recordsById,
              runtimePlan,
              controller,
              confirmationOpenById,
              schema,
              tableId,
            }),
            placement:
              column.presentation === "button" && column.controls.length === 1
                ? "primary"
                : "secondary",
          },
        ];
      }

      const operation = runtimePlan.operations.find(
        (candidate): candidate is Extract<GeneratedTableOperationRuntime, { kind: "control" }> =>
          candidate.kind === "control" &&
          candidate.recordId === record.id &&
          candidate.control.bindingName === control.bindingName,
      );
      const action = operationAction(operation, controller, confirmationOpenById);
      const fallbackAction =
        action ??
        projectGeneratedTableInvokeAction({
          actionId: `${tableId}:${record.id}:${control.bindingName}:unavailable`,
          disabled: true,
          disabledReason: control.disabledReason ?? "Operation unavailable.",
          invocationSource:
            column.presentation === "button" && column.controls.length === 1
              ? "button"
              : "menuItem",
          label: control.label,
          role: "command",
          rowId: record.id,
          tableId,
        });
      return action
        ? [
            {
              action,
              placement:
                column.presentation === "button" && column.controls.length === 1
                  ? "primary"
                  : "secondary",
            },
          ]
        : [
            {
              action: fallbackAction,
              placement:
                column.presentation === "button" && column.controls.length === 1
                  ? "primary"
                  : "secondary",
            },
          ];
    });
    const contents: TableCellContentContract[] = [];

    if (actions.length > 0) {
      contents.push(
        projectGeneratedTableActionGroup({
          actions,
          id: `${cell.id}:actions`,
          secondaryAccessibilityLabel: column.headerLabel,
        }),
      );
    }

    const ordering = runtimePlan.orderingByCellId.get(cell.id) ?? [];
    const orderingItems = runtimePlan.orderingItemsByCellId.get(cell.id) ?? [];
    contents.push(
      ...orderingContents(
        orderingItems,
        ordering,
        controller,
        tableId,
        record.id,
        column.headerLabel,
      ),
    );
    return contents;
  }

  if (column.type === "referenceField") {
    const referenceRecordId = record.values[column.sourceReferenceFieldName];
    const referenceRecord =
      typeof referenceRecordId === "string" ? recordsById[referenceRecordId] : undefined;

    if (!referenceRecord) {
      return [
        {
          accessibilityLabel: `${column.label} unavailable`,
          kind: "unavailable",
          message: "",
        },
      ];
    }

    return [
      projectTableRecordField({
        controller,
        contextId: cell.id,
        entityName: column.referencedEntityName,
        fieldConfig: column,
        fieldContexts,
        fieldStateByContextId,
        mediaAssetOptionsForField,
        record: referenceRecord,
        recordsById,
        schema,
        source: "referencedRecord",
        tableId,
        transitionRuntimes: runtimePlan.transitionsByContextId.get(cell.id),
        updateOperation: column.referencedUpdateOperation,
      }),
    ];
  }

  const contents: TableCellContentContract[] = [
    projectTableRecordField({
      controller,
      contextId: cell.id,
      entityName,
      fieldConfig: column,
      fieldContexts,
      fieldStateByContextId,
      mediaAssetOptionsForField,
      record,
      recordsById,
      schema,
      source: "record",
      tableId,
      updateOperation: result.updateOperation,
      transitionOperations: column.stateTransitionOperations,
      transitionRuntimes: runtimePlan.transitionsByContextId.get(cell.id),
    }),
  ];

  if (column.referenceItem && column.field.type === "reference") {
    const referenceRecordId = record.values[column.fieldName];
    const referenceRecord =
      typeof referenceRecordId === "string" ? recordsById[referenceRecordId] : undefined;

    if (referenceRecord) {
      const dialogId = `${tableId}:${record.id}:${column.key}:reference-dialog`;
      const context = registerFieldContext({
        entityName: column.referenceItem.entityName,
        fields: column.referenceItem.recordFields,
        id: `${dialogId}:fields`,
        record: referenceRecord,
        union: column.referenceItem.recordUnion,
        updateOperation: column.referenceItem.updateOperation,
      });
      fieldContexts.set(context.id, context);
      const fields = projectFieldContext(
        context,
        { fieldSetId: context.id, kind: "tableEditFieldSet", tableId },
        fieldStateByContextId[context.id],
        mediaAssetOptionsForField,
        recordsById,
        schema,
      );
      const action = projectGeneratedTableEditAction({
        actionId: `${dialogId}:open`,
        description: `Changes apply to every record that uses this ${column.referenceItem.entity.label.toLowerCase()}.`,
        dialogId,
        fields,
        label: `Edit shared ${column.referenceItem.entity.label.toLowerCase()}`,
        open: dialogOpenById[dialogId] ?? false,
        rowId: record.id,
        tableId,
        target: {
          editingEnabled: column.referenceItem.updateOperation !== undefined,
          disabledReason:
            column.referenceItem.updateOperation === undefined
              ? `Editing is disabled for ${column.referenceItem.entity.label}.`
              : undefined,
          kind: "available",
        },
        targetKind: "reference",
        title: `Shared ${column.referenceItem.entity.label}`,
      });
      contents.push(
        projectGeneratedTableActionGroup({
          actions: [{ action, placement: "primary" }],
          id: `${cell.id}:reference-actions`,
          secondaryAccessibilityLabel: "Shared record actions",
        }),
      );
    }
  }

  return contents;
}

function projectTableRecordField({
  controller,
  contextId,
  entityName,
  fieldConfig,
  fieldContexts,
  fieldStateByContextId,
  mediaAssetOptionsForField,
  record,
  recordsById,
  schema,
  source,
  tableId,
  updateOperation,
  transitionOperations,
  transitionRuntimes,
}: {
  controller: GeneratedOperationController;
  contextId: string;
  entityName: string;
  fieldConfig: RecordFieldConfig & { display?: "editor" | "readOnly" | "hidden"; suffix?: string };
  fieldContexts: Map<string, GeneratedTableFieldContext>;
  fieldStateByContextId: Readonly<Record<string, GeneratedTableFieldContextState | undefined>>;
  mediaAssetOptionsForField: (entityName: string, fieldName: string) => readonly MediaAssetOption[];
  record: StoredRecord;
  recordsById: Readonly<Record<string, StoredRecord>>;
  schema: AppSchema | null;
  source: "record" | "referencedRecord";
  tableId: string;
  updateOperation?: TableCollectionResultModel["updateOperation"];
  transitionOperations?: readonly TransitionStateOperationConfig[];
  transitionRuntimes?: readonly GeneratedTableTransitionRuntime[];
}) {
  const context = registerFieldContext({
    entityName,
    fields: [fieldConfig],
    id: contextId,
    record,
    updateOperation,
  });
  fieldContexts.set(context.id, context);
  const recordValue = resolveRecordFieldValue(record, recordFieldRef(fieldConfig));
  const referenceOptions = referenceOptionsForField(fieldConfig, recordsById);
  const field = withTableStateTransitionRuntimeState(
    fieldConfig.display === "readOnly" || !recordFieldIsWritable(fieldConfig)
      ? projectGeneratedDisplayField({
          density: "compact",
          fieldConfig,
          mediaAssetOptions: mediaAssetOptionsForField(entityName, fieldConfig.fieldName),
          occurrence: {
            owner: { cellId: contextId, kind: "tableCell", tableId },
            placementId: fieldConfig.fieldName,
          },
          recordId: record.id,
          recordValue,
          referenceOptions,
          surface: "table-cell",
          transitionOperations,
        })
      : projectFieldContext(
          context,
          { cellId: contextId, kind: "tableCell", tableId },
          fieldStateByContextId[context.id],
          mediaAssetOptionsForField,
          recordsById,
          schema,
          transitionOperations?.length
            ? {
                controller,
                transitionOperations,
                transitionRuntimes: transitionRuntimes ?? [],
              }
            : undefined,
        )[0]!,
    transitionRuntimes ?? [],
    controller,
  );

  return projectGeneratedTableFieldContent(field, source);
}

function projectTableEditAction({
  confirmationOpenById,
  control,
  controller,
  dialogOpenById,
  fieldContexts,
  fieldStateByContextId,
  mediaAssetOptionsForField,
  record,
  recordsById,
  runtimePlan,
  schema,
  tableId,
}: {
  confirmationOpenById: Readonly<Record<string, boolean | undefined>>;
  control: EditRecordTableOperationControlConfig;
  controller: GeneratedOperationController;
  dialogOpenById: Readonly<Record<string, boolean | undefined>>;
  fieldContexts: Map<string, GeneratedTableFieldContext>;
  fieldStateByContextId: Readonly<Record<string, GeneratedTableFieldContextState | undefined>>;
  mediaAssetOptionsForField: (entityName: string, fieldName: string) => readonly MediaAssetOption[];
  record: StoredRecord;
  recordsById: Readonly<Record<string, StoredRecord>>;
  runtimePlan: GeneratedTableRuntimePlan;
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
    });
  }

  const context = registerFieldContext({
    entityName: control.editView.entityName,
    fields: control.editView.fields,
    id: `${dialogId}:fields`,
    record: targetRecord,
    union: control.editView.union,
    updateOperation: control.editView.updateOperation,
  });
  fieldContexts.set(context.id, context);
  const fields = projectFieldContext(
    context,
    { fieldSetId: context.id, kind: "tableEditFieldSet", tableId },
    fieldStateByContextId[context.id],
    mediaAssetOptionsForField,
    recordsById,
    schema,
    {
      controller,
      transitionOperations: control.editView.transitionOperations,
      transitionRuntimes: runtimePlan.transitionsByContextId.get(context.id) ?? [],
    },
  );
  const pairedTransitionOperationNames = new Set(
    fields.flatMap((field) =>
      field.stateMachineFacts?.interaction.kind === "transitions"
        ? field.stateMachineFacts.interaction.transitions.map(
            (transition) => transition.operationName,
          )
        : [],
    ),
  );
  const transitionActions = transitionActionsForContext(
    context.id,
    runtimePlan,
    controller,
    confirmationOpenById,
    "primary",
    pairedTransitionOperationNames,
  );

  return projectGeneratedTableEditAction({
    ...(transitionActions.length === 0
      ? {}
      : {
          actionGroup: projectGeneratedTableActionGroup({
            actions: transitionActions,
            id: `${dialogId}:actions`,
            secondaryAccessibilityLabel: "More record actions",
          }),
        }),
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
  });
}

function projectFieldContext(
  context: GeneratedTableFieldContext,
  owner: GeneratedRecordFieldOwner,
  currentState: GeneratedTableFieldContextState | undefined,
  mediaAssetOptionsForField: (entityName: string, fieldName: string) => readonly MediaAssetOption[],
  recordsById: Readonly<Record<string, StoredRecord>>,
  schema: AppSchema | null,
  transitionRuntime?: {
    controller: GeneratedOperationController;
    transitionOperations: readonly TransitionStateOperationConfig[];
    transitionRuntimes: readonly GeneratedTableTransitionRuntime[];
  },
): readonly FieldContract[] {
  const state = rebaseGeneratedTableFieldContextState(context, currentState);
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
  const transitionOperationsByFieldName = transitionRuntime
    ? groupTransitionOperationsByFieldName(transitionRuntime.transitionOperations, context.fields)
    : undefined;

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
    showLabel: context.fields.length > 1,
    state: state.session,
    surface: "table-cell",
    transitionOperationsByFieldName,
  }).map((field) =>
    transitionRuntime
      ? withTableStateTransitionRuntimeState(
          field,
          transitionRuntime.transitionRuntimes,
          transitionRuntime.controller,
        )
      : field,
  );
}

function groupTransitionOperationsByFieldName(
  operations: readonly TransitionStateOperationConfig[],
  fields: readonly RecordFieldConfig[],
): Readonly<Record<string, readonly TransitionStateOperationConfig[]>> {
  const byFieldName: Record<string, TransitionStateOperationConfig[]> = {};

  for (const field of fields) {
    if (!field.stateMachine) {
      continue;
    }

    const matchingOperations = operations.filter(
      (operation) =>
        operation.fieldName === field.fieldName &&
        operation.machineName === field.stateMachine?.machineName,
    );

    if (matchingOperations.length > 0) {
      byFieldName[field.fieldName] = matchingOperations;
    }
  }

  return byFieldName;
}

export function selectGeneratedTableRuntimePlan({
  entity,
  orderingContext,
  presentation,
  recordsById,
  result,
  tableId,
}: {
  entity: EntitySchema;
  orderingContext?: ResultOrderingContext;
  presentation: GeneratedTablePresentation;
  recordsById: Readonly<Record<string, StoredRecord>>;
  result: TableCollectionResultModel;
  tableId: string;
}): GeneratedTableRuntimePlan {
  const operations: GeneratedTableOperationRuntime[] = [];
  const orderingByCellId = new Map<string, readonly GeneratedTableOperationRuntime[]>();
  const orderingItemsByCellId = new Map<string, readonly OrderingMoveMenuItem[]>();
  const transitionsByContextId = new Map<string, readonly GeneratedTableTransitionRuntime[]>();

  for (const row of presentation.rows) {
    const record = recordsById[row.recordId];

    if (!record) {
      continue;
    }

    if (result.deleteOperation) {
      const recordLabel = selectRecordLabel(
        record,
        presentation.delete?.labelFields ?? [],
        entity.label,
        record.id,
      );
      const binding = projectDeleteRecordButtonBinding({
        deleteOperation: result.deleteOperation,
        entityLabel: entity.label,
        idPrefix: `${tableId}:${record.id}`,
        recordId: record.id,
        recordLabel,
      });

      if (binding) {
        operations.push({ binding, kind: "delete", recordId: record.id, recordLabel });
      }
    }

    const rowTransitions = projectTransitionRuntimes(
      result.transitionOperations,
      record,
      `row:${record.id}`,
    );
    operations.push(...rowTransitions);
    transitionsByContextId.set(`row:${record.id}`, rowTransitions);

    for (const cell of row.cells) {
      if (cell.column.type !== "data") {
        continue;
      }

      const column = cell.column.column;

      if (column.type === "field" && column.stateTransitionOperations?.length) {
        const contextId = cell.id;
        const transitions = projectTransitionRuntimes(
          column.stateTransitionOperations,
          record,
          contextId,
        );
        operations.push(...transitions);
        transitionsByContextId.set(contextId, transitions);
      }

      if (column.type === "operationControl") {
        for (const control of column.controls) {
          if (control.type === "editRecord") {
            const binding = projectTableOperationControlBinding(control, {
              executionTargetKey: record.id,
              idPrefix: `table:${record.id}`,
            });
            if (binding) {
              operations.push({ binding, control, kind: "control", recordId: record.id });
            }

            const dialogId = `${tableId}:${record.id}:${control.bindingName}:dialog`;
            const transitionContextId = `${dialogId}:fields`;
            const targetRecordId =
              control.target.kind === "row"
                ? record.id
                : typeof record.values[control.target.fieldName] === "string"
                  ? String(record.values[control.target.fieldName])
                  : undefined;
            const targetRecord = targetRecordId ? recordsById[targetRecordId] : undefined;
            const transitions = targetRecord
              ? projectTransitionRuntimes(
                  control.editView.transitionOperations,
                  targetRecord,
                  transitionContextId,
                )
              : [];
            operations.push(...transitions);
            transitionsByContextId.set(transitionContextId, transitions);
            continue;
          }

          const binding = projectTableOperationControlBinding(control, {
            executionTargetKey: record.id,
            idPrefix: `table:${record.id}`,
          });
          if (binding) {
            operations.push({ binding, control, kind: "control", recordId: record.id });
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
    transitionsByContextId,
  };
}

function projectTransitionRuntimes(
  transitionOperations: readonly TransitionStateOperationConfig[],
  record: StoredRecord,
  contextId: string,
): GeneratedTableTransitionRuntime[] {
  return transitionOperations.map((operation) => {
    const availability = selectTransitionStateOperationAvailability({
      currentValue: record.values[operation.fieldName],
      field: operation.field,
      operation,
    });
    const binding = projectStateTransitionOperationControlBinding({
      availability,
      operation,
      options: {
        executionTargetKey: record.id,
        idPrefix: contextId,
      },
    });

    return { binding, kind: "transition", operation, recordId: record.id };
  });
}

export function selectFieldTransitionRuntime(
  contextId: string,
  intent: Extract<FieldIntent, { type: "stateTransitionInvoke" }>,
  runtimePlan: GeneratedTableRuntimePlan,
): GeneratedTableTransitionRuntime | undefined {
  return (runtimePlan.transitionsByContextId.get(contextId) ?? []).find(
    (runtime) =>
      runtime.recordId === intent.recordId &&
      runtime.operation.fieldName === intent.fieldName &&
      runtime.operation.operationName === intent.operationName &&
      runtime.operation.transitionName === intent.transitionName,
  );
}

function withTableStateTransitionRuntimeState(
  field: FieldContract,
  runtimes: readonly GeneratedTableTransitionRuntime[],
  controller: GeneratedOperationController,
): FieldContract {
  const facts = field.stateMachineFacts;

  if (facts?.interaction.kind !== "transitions") {
    return field;
  }

  const runtimeByOperationName = new Map(
    runtimes
      .filter((runtime) => runtime.operation.fieldName === field.fieldName)
      .map((runtime) => [runtime.operation.operationName, runtime]),
  );
  const transitions = facts.interaction.transitions.map((transition) => {
    const runtime = runtimeByOperationName.get(transition.operationName);

    return runtime && controller.isPending(runtime.binding.id)
      ? {
          ...transition,
          pending: { isPending: true, label: `${transition.label}...` },
        }
      : transition;
  });
  const pendingTransition = transitions.find((transition) => transition.pending?.isPending);
  const pendingLabel = pendingTransition?.pending?.label;

  return {
    ...field,
    ...(pendingTransition
      ? {
          pending: {
            isPending: true,
            ...(pendingLabel === undefined ? {} : { label: pendingLabel }),
          },
        }
      : {}),
    stateMachineFacts: {
      ...facts,
      interaction: { ...facts.interaction, transitions },
    },
  };
}

function operationAction(
  runtime: GeneratedTableOperationRuntime | undefined,
  controller: GeneratedOperationController,
  confirmationOpenById: Readonly<Record<string, boolean | undefined>>,
): TableOperationActionContract | undefined {
  if (!runtime) {
    return undefined;
  }

  const state = controller.getStateByExecutionKey(runtime.binding.executionKey);
  if (!state) {
    return undefined;
  }

  const isDelete = runtime.kind === "delete";
  const control = projectGeneratedOperationControl({
    binding: runtime.binding,
    confirmationOpen: confirmationOpenById[runtime.binding.id] ?? false,
    presentation: {
      accessibilityLabel:
        runtime.kind === "delete" ? `Delete ${runtime.recordLabel}` : runtime.binding.label,
      content: isDelete
        ? { icon: "delete", kind: "iconOnly" }
        : { kind: "label", label: runtime.binding.label },
      density: "compact",
      pendingLabel: `${runtime.binding.label}...`,
      prominence: runtime.binding.destructive ? "destructive" : "secondary",
    },
    state,
  });

  return projectGeneratedTableOperationAction(
    control,
    runtime.kind === "delete" ? "delete" : runtime.kind === "transition" ? "transition" : "command",
  );
}

function transitionActionsForContext(
  contextId: string,
  runtimePlan: GeneratedTableRuntimePlan,
  controller: GeneratedOperationController,
  confirmationOpenById: Readonly<Record<string, boolean | undefined>>,
  placement: GeneratedTablePlacedAction["placement"],
  excludedOperationNames: ReadonlySet<string> = new Set(),
): GeneratedTablePlacedAction[] {
  return (runtimePlan.transitionsByContextId.get(contextId) ?? []).flatMap((runtime) => {
    if (excludedOperationNames.has(runtime.operation.operationName)) {
      return [];
    }

    const action = operationAction(runtime, controller, confirmationOpenById);
    return action ? [{ action, placement }] : [];
  });
}

function actionGroupContents(
  id: string,
  secondaryAccessibilityLabel: string,
  actions: readonly GeneratedTablePlacedAction[],
): readonly TableCellContentContract[] {
  return actions.length === 0
    ? []
    : [projectGeneratedTableActionGroup({ actions, id, secondaryAccessibilityLabel })];
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

export async function executeGeneratedTableRuntimeOperation(
  runtime: GeneratedTableOperationRuntime,
  controller: GeneratedOperationController,
  source: "button" | "confirmationDialog" | "menuItem",
) {
  if (runtime.kind === "delete") {
    return executeRecordDeleteOperation({
      binding: runtime.binding,
      controller,
      recordId: runtime.recordId,
      recordLabel: runtime.recordLabel,
      source: source === "menuItem" ? "button" : source,
    });
  }

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
      failedMessage: "Move failed.",
      orderingContext: runtime.orderingContext,
      plan: runtime.item.plan,
      source,
      successMessage: "Row moved and synced.",
      syncingMessage: `${runtime.item.label}...`,
    });
  }

  return executeGeneratedOperationControl({
    binding: runtime.binding,
    callerInput: {
      bindingId: runtime.binding.id,
      recordId: runtime.recordId,
      source,
    },
    controller,
  });
}

function registerFieldContext({
  entityName,
  fields,
  id,
  record,
  union,
  updateOperation,
}: Omit<GeneratedTableFieldContext, "recordId">): GeneratedTableFieldContext {
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

export function createGeneratedTableFieldContextState(
  context: GeneratedTableFieldContext,
): GeneratedTableFieldContextState {
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

export function rebaseGeneratedTableFieldContextState(
  context: GeneratedTableFieldContext,
  current?: GeneratedTableFieldContextState,
): GeneratedTableFieldContextState {
  return current?.baselineUpdatedAt === context.record.updatedAt
    ? current
    : createGeneratedTableFieldContextState(context);
}

export function resetFailedFieldContextSession(
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

  const snapshot = getClientStoreSnapshot();
  if (snapshot.recordsById !== recordsById) {
    return [];
  }

  return createReferenceOptionsSelector(
    fieldConfig.field.to,
    fieldConfig.field.displayField,
  )(snapshot);
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
