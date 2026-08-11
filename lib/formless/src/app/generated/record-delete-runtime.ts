import type { FieldSchema } from "@dpeek/formless-schema";
import type { StoredRecord } from "@dpeek/formless-storage";
import type { SyncStatus } from "../../client/sync-status.ts";
import type { EntityOperationPresentationConfig } from "../../client/operation-presentation-model.ts";
import {
  projectRecordDeleteOperationControlBinding,
  type GeneratedOperationControlBinding,
  type GeneratedOperationController,
  type GeneratedOperationCallerInput,
  type GeneratedOperationExecutionResult,
} from "../../client/views.ts";
import { executeGeneratedOperationControl } from "./operation-control-runtime.ts";

export type RecordLabelFieldConfig = {
  fieldName: string;
  field: FieldSchema;
};

export function projectDeleteRecordButtonBinding({
  deleteOperation,
  entityLabel,
  idPrefix,
  recordId,
  recordLabel,
}: {
  deleteOperation: EntityOperationPresentationConfig;
  entityLabel: string;
  idPrefix?: string;
  recordId: string;
  recordLabel: string;
}): GeneratedOperationControlBinding | undefined {
  return projectRecordDeleteOperationControlBinding({
    entityLabel,
    label: "Delete",
    operation: deleteOperation,
    recordLabel,
    options: {
      executionTargetKey: recordId,
      ...(idPrefix === undefined ? {} : { idPrefix }),
    },
  });
}

export async function executeRecordDeleteOperation({
  binding,
  controller,
  recordId,
  recordLabel,
  setStatus,
  source = "confirmationDialog",
}: {
  binding: GeneratedOperationControlBinding;
  controller: GeneratedOperationController;
  recordId: string;
  recordLabel: string;
  setStatus?: (status: SyncStatus) => void;
  source?: GeneratedOperationCallerInput["source"];
}): Promise<GeneratedOperationExecutionResult> {
  return executeGeneratedOperationControl({
    binding,
    callerInput: {
      bindingId: binding.id,
      recordId,
      source,
    },
    controller,
    setStatus,
    statusLabel: `Delete ${recordLabel}`,
  });
}

export function selectRecordLabel(
  record: StoredRecord | undefined,
  labelFields: RecordLabelFieldConfig[],
  entityLabel: string,
  recordId: string,
) {
  const preferredFields = ["label", "title", "name", "slug"];

  for (const fieldName of preferredFields) {
    const value = record?.values[fieldName];

    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
  }

  for (const field of labelFields) {
    const value = record?.values[field.fieldName];

    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
  }

  return `${entityLabel} ${record?.id ?? recordId}`;
}
