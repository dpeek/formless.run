import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { MediaAssetOption } from "@dpeek/formless-media/client";
import type {
  ButtonContent,
  CreateFieldIntentHandler,
  CreateIntent,
  CreateSurfaceContract,
} from "@dpeek/formless-presentation/contract";
import type { QueryEvaluationContext } from "@dpeek/formless-schema";
import type { RecordValues } from "@dpeek/formless-storage";
import { setSyncStatus } from "../../client/sync-status.ts";
import {
  createReferenceOptionsSelector,
  type BrowserReplicaProjectionSnapshot,
} from "../../client/projections.ts";
import { getClientStoreSnapshot, subscribeToClientStore } from "../../client/store.ts";
import {
  type CreateFieldConfig,
  type GeneratedOperationControlBinding,
  type GeneratedOperationController,
  type GeneratedOperationExecutionResult,
  type HomeOperationConfig,
  projectCollectionOperationControlBinding,
} from "../../client/views.ts";
import {
  initialGeneratedCreateDraftSessionState,
  markGeneratedCreateDraftSessionSubmitted,
  selectGeneratedCreateDraftSession,
  type GeneratedCreateDraftSessionState,
} from "./create-field-authoring.ts";
import { adaptGeneratedCreateDraftChange } from "./field-intents.ts";
import { projectGeneratedCreateSurface } from "./field-projection.ts";
import {
  indexGeneratedCreateSurfaceFields,
  resolveGeneratedCreateFieldIntent,
} from "./generated-create-field-index.ts";
import {
  executeGeneratedOperationControl,
  useGeneratedOperationController,
  useGeneratedOperationControllerVersion,
} from "./operation-control-runtime.ts";
import { shouldUseAppReplicaReferenceOptions } from "./reference-field-options.ts";
import { useSchemaAppTarget } from "./schema-app-context.tsx";
import {
  collectCreatePresentationFields,
  generatedMediaAssetOptionsForField,
  generatedMediaFieldKey,
  type GeneratedMediaAssetOptionsByFieldKey,
  type GeneratedMediaField,
} from "./media-field-model.ts";
import { loadGeneratedMediaAssetOptions, uploadGeneratedMediaFile } from "./media-field-runtime.ts";
import { upsertMediaAssetOption } from "./record-field-authoring.ts";

export type CreateHomeOperationConfig = Extract<HomeOperationConfig, { type: "create" }>;

export type GeneratedCreateTriggerPresentation = {
  content: ButtonContent;
  density: "default" | "compact";
  prominence: "primary" | "secondary" | "quiet";
};

export type GeneratedCreateSubmissionResult =
  | {
      recordId: string;
      state: GeneratedCreateDraftSessionState;
      type: "created";
    }
  | {
      displayError: string;
      state: GeneratedCreateDraftSessionState;
      type: "failed";
    };

const GENERATED_CREATE_FAILURE_MESSAGE = "Create failed. Try again.";

export type GeneratedCreateRuntimeOptions = {
  closeOnSuccess: boolean;
  displaySafeErrors?: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (recordId: string) => void;
  open: boolean;
  operation: CreateHomeOperationConfig;
  queryContext?: QueryEvaluationContext;
  submitValues?: (values: RecordValues) => Promise<{ recordId: string }>;
  surfaceId: string;
  trigger: GeneratedCreateTriggerPresentation;
};

export type GeneratedCreateRuntime = {
  onCreateIntent: (intent: CreateIntent) => Promise<void> | void;
  onFieldIntent: CreateFieldIntentHandler;
  surface: CreateSurfaceContract;
};

export function useGeneratedCreateRuntime({
  closeOnSuccess,
  displaySafeErrors = false,
  onOpenChange,
  onSuccess,
  open,
  operation,
  queryContext,
  submitValues,
  surfaceId,
  trigger,
}: GeneratedCreateRuntimeOptions): GeneratedCreateRuntime {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | undefined>();
  const [mediaFieldState, setMediaFieldState] = useState<{
    errorsByFieldName: Readonly<Record<string, string | undefined>>;
    pendingByFieldName: Readonly<Record<string, boolean | undefined>>;
  }>({ errorsByFieldName: {}, pendingByFieldName: {} });
  const [mediaAssetOptionsByFieldKey, setMediaAssetOptionsByFieldKey] = useState<
    Record<string, MediaAssetOption[] | undefined>
  >({});
  const [draftSessionState, setDraftSessionState] = useState(() => initialCreateState(operation));
  const programTarget = useSchemaAppTarget();
  const mediaFields = useMemo(() => collectGeneratedCreateMediaFields(operation), [operation]);
  const draftSession = selectGeneratedCreateDraftSession({
    defaults: operation.defaults,
    enabled: operation.enabled,
    fields: operation.fields,
    queryContext,
    state: draftSessionState,
    union: operation.union,
  });
  const binding = useMemo(
    () =>
      submitValues === undefined ? projectCreateSubmitBinding(operation, surfaceId) : undefined,
    [operation, submitValues, surfaceId],
  );
  const bindings = useMemo(() => (binding === undefined ? [] : [binding]), [binding]);
  const controller = useGeneratedOperationController(bindings);
  useGeneratedOperationControllerVersion(controller);
  const operationPending = binding === undefined ? false : controller.isPending(binding.id);
  const submitPending = isSubmitting || operationPending;
  const referenceOptionsByFieldName = useCreateReferenceOptionsByFieldName(operation.fields);
  const surface = projectGeneratedCreateSurface({
    enabled: operation.enabled,
    entityLabel: operation.entity.label,
    errorsByFieldName: mediaFieldState.errorsByFieldName,
    ...(submissionError === undefined ? {} : { formErrors: [submissionError] }),
    id: surfaceId,
    isSubmitting: submitPending,
    mediaAssetOptionsByFieldName: selectGeneratedCreateMediaOptions(
      operation,
      mediaAssetOptionsByFieldKey,
    ),
    open,
    pendingByFieldName: mediaFieldState.pendingByFieldName as Readonly<Record<string, boolean>>,
    referenceOptionsByFieldName,
    session: draftSession,
    state: draftSessionState,
    submitLabel: operation.label,
    trigger,
    triggerLabel: operation.label,
  });
  const fieldsById = indexGeneratedCreateSurfaceFields(surface);

  useEffect(() => {
    setDraftSessionState(initialCreateState(operation));
    setMediaFieldState({ errorsByFieldName: {}, pendingByFieldName: {} });
    setSubmissionError(undefined);
  }, [operation.defaults, operation.fields, operation.union]);

  useEffect(() => {
    let cancelled = false;

    void loadGeneratedMediaAssetOptions(mediaFields, programTarget).then((options) => {
      if (!cancelled) {
        setMediaAssetOptionsByFieldKey(options);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [programTarget, mediaFields]);

  useEffect(() => {
    if (!open && closeOnSuccess) {
      setDraftSessionState(initialCreateState(operation));
      setMediaFieldState({ errorsByFieldName: {}, pendingByFieldName: {} });
    }
  }, [closeOnSuccess, open, operation.defaults, operation.fields, operation.union]);

  async function onFieldIntent(fieldId: string, intent: Parameters<CreateFieldIntentHandler>[1]) {
    const projectedField = resolveGeneratedCreateFieldIntent(fieldsById, fieldId, intent);
    if (projectedField === undefined) {
      return;
    }

    if (intent.type === "mediaFileSelect") {
      const fieldConfig = collectCreatePresentationFields(operation.fields, operation.union).find(
        (field) =>
          field.fieldName === intent.fieldName &&
          field.editor === "media" &&
          field.field.type === "text",
      );
      const mediaField = fieldConfig?.field;
      if (
        !intent.file ||
        !fieldConfig ||
        mediaField?.type !== "text" ||
        mediaFieldState.pendingByFieldName[intent.fieldName] === true
      ) {
        return;
      }

      setMediaFieldState((current) => updateCreateMediaFieldState(current, intent.fieldName, true));
      setSyncStatus({ state: "syncing", message: "Uploading media..." });

      try {
        const result = await uploadGeneratedMediaFile({
          programTarget,
          entityName: operation.entityName,
          field: mediaField,
          fieldName: fieldConfig.fieldName,
          file: intent.file,
        });
        setMediaAssetOptionsByFieldKey((current) =>
          storeGeneratedCreateMediaOption(
            current,
            mediaFields,
            { field: mediaField, fieldName: fieldConfig.fieldName },
            result.option,
          ),
        );
        setDraftSessionState(
          (state) =>
            adaptGeneratedCreateDraftChange(
              {
                fieldName: fieldConfig.fieldName,
                fieldValue: { kind: "input", value: result.option.id },
                type: "createDraftChange",
              },
              { state },
            ).state ?? state,
        );
        setMediaFieldState((current) =>
          updateCreateMediaFieldState(current, intent.fieldName, false),
        );
        setSyncStatus({ state: "idle", message: "Media uploaded." });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Media upload failed.";
        setMediaFieldState((current) =>
          updateCreateMediaFieldState(current, intent.fieldName, false, message),
        );
        setSyncStatus({ state: "error", message });
      }
      return;
    }

    if (intent.type !== "createDraftChange") {
      return;
    }

    setSubmissionError(undefined);
    setDraftSessionState((state) => {
      const result = adaptGeneratedCreateDraftChange(intent, { state });
      return result.state ?? state;
    });
  }

  async function submit() {
    if (submitPending) {
      return;
    }

    const submittedState = markGeneratedCreateDraftSessionSubmitted(draftSessionState);
    const submittedSession = selectGeneratedCreateDraftSession({
      defaults: operation.defaults,
      enabled: operation.enabled,
      fields: operation.fields,
      queryContext,
      state: submittedState,
      union: operation.union,
    });
    setDraftSessionState(submittedState);
    setSubmissionError(undefined);

    if (!submittedSession.canSubmit) {
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await executeGeneratedCreateSubmission({
        resetState: initialCreateState(operation),
        state: submittedState,
        submitValues: (values) =>
          submitCreateValues({
            binding,
            controller,
            operation,
            submitValues,
            values,
          }),
        values: submittedSession.values,
      });
      setDraftSessionState(result.state);

      if (result.type === "failed") {
        if (displaySafeErrors) {
          setSubmissionError(GENERATED_CREATE_FAILURE_MESSAGE);
        }
        setSyncStatus({
          state: "error",
          message: displaySafeErrors ? GENERATED_CREATE_FAILURE_MESSAGE : result.displayError,
        });
        return;
      }

      onSuccess?.(result.recordId);

      if (closeOnSuccess) {
        onOpenChange(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function onCreateIntent(intent: CreateIntent) {
    if (intent.surfaceId !== surface.id) {
      return;
    }

    if (intent.type === "createSubmit") {
      return submit();
    }

    if (intent.open && surface.trigger.disabled) {
      return;
    }

    onOpenChange(intent.open);
  }

  return { onCreateIntent, onFieldIntent, surface };
}

export function projectInitialGeneratedCreateRuntimeSurface({
  operation,
  queryContext,
  snapshot,
  surfaceId,
  trigger,
}: {
  operation: CreateHomeOperationConfig;
  queryContext?: QueryEvaluationContext;
  snapshot: BrowserReplicaProjectionSnapshot;
  surfaceId: string;
  trigger: GeneratedCreateTriggerPresentation;
}): CreateSurfaceContract {
  const state = initialCreateState(operation);
  const session = selectGeneratedCreateDraftSession({
    defaults: operation.defaults,
    enabled: operation.enabled,
    fields: operation.fields,
    queryContext,
    state,
    union: operation.union,
  });

  return projectGeneratedCreateSurface({
    enabled: operation.enabled,
    entityLabel: operation.entity.label,
    id: surfaceId,
    isSubmitting: false,
    open: false,
    referenceOptionsByFieldName: selectCreateReferenceOptionsByFieldName(
      operation.fields,
      snapshot,
    ),
    session,
    state,
    submitLabel: operation.label,
    trigger,
    triggerLabel: operation.label,
  });
}

function useCreateReferenceOptionsByFieldName(fields: readonly CreateFieldConfig[]) {
  const snapshot = useSyncExternalStore(
    subscribeToClientStore,
    getClientStoreSnapshot,
    getClientStoreSnapshot,
  );

  return useMemo(
    () => selectCreateReferenceOptionsByFieldName(fields, snapshot),
    [fields, snapshot],
  );
}

export function selectCreateReferenceOptionsByFieldName(
  fields: readonly CreateFieldConfig[],
  snapshot: BrowserReplicaProjectionSnapshot,
) {
  return Object.fromEntries(
    fields.map((fieldConfig) => {
      const field = fieldConfig.field;

      if (field.type !== "reference" || !shouldUseAppReplicaReferenceOptions(field)) {
        return [fieldConfig.fieldName, []];
      }

      return [
        fieldConfig.fieldName,
        createReferenceOptionsSelector(field.to, field.displayField)(snapshot),
      ];
    }),
  );
}

function collectGeneratedCreateMediaFields(
  operation: CreateHomeOperationConfig,
): GeneratedMediaField[] {
  return collectCreatePresentationFields(operation.fields, operation.union).flatMap((fieldConfig) =>
    fieldConfig.editor === "media" && fieldConfig.field.type === "text"
      ? [
          {
            entityName: operation.entityName,
            field: fieldConfig.field,
            fieldName: fieldConfig.fieldName,
          },
        ]
      : [],
  );
}

function selectGeneratedCreateMediaOptions(
  operation: CreateHomeOperationConfig,
  optionsByFieldKey: GeneratedMediaAssetOptionsByFieldKey,
) {
  return Object.fromEntries(
    collectGeneratedCreateMediaFields(operation).map((field) => [
      field.fieldName,
      generatedMediaAssetOptionsForField(optionsByFieldKey, field.entityName, field.fieldName),
    ]),
  );
}

function storeGeneratedCreateMediaOption(
  current: Record<string, MediaAssetOption[] | undefined>,
  mediaFields: readonly GeneratedMediaField[],
  fieldConfig: Pick<GeneratedMediaField, "field" | "fieldName">,
  option: MediaAssetOption,
): Record<string, MediaAssetOption[] | undefined> {
  const targetFields =
    fieldConfig.field.asset?.kind === "document"
      ? mediaFields.filter((field) => field.fieldName === fieldConfig.fieldName)
      : mediaFields.filter((field) => field.field.asset === undefined);
  const next = { ...current };

  for (const field of targetFields) {
    const key = generatedMediaFieldKey(field.entityName, field.fieldName);
    next[key] = upsertMediaAssetOption([...(current[key] ?? [])], option);
  }

  return next;
}

function updateCreateMediaFieldState(
  current: {
    errorsByFieldName: Readonly<Record<string, string | undefined>>;
    pendingByFieldName: Readonly<Record<string, boolean | undefined>>;
  },
  fieldName: string,
  pending: boolean,
  error?: string,
) {
  return {
    errorsByFieldName: {
      ...current.errorsByFieldName,
      [fieldName]: error,
    },
    pendingByFieldName: {
      ...current.pendingByFieldName,
      [fieldName]: pending,
    },
  };
}

function initialCreateState(
  operation: CreateHomeOperationConfig,
): GeneratedCreateDraftSessionState {
  return initialGeneratedCreateDraftSessionState({
    defaults: operation.defaults,
    fields: operation.fields,
    union: operation.union,
  });
}

export async function executeGeneratedCreateSubmission({
  resetState,
  state,
  submitValues,
  values,
}: {
  resetState: GeneratedCreateDraftSessionState;
  state: GeneratedCreateDraftSessionState;
  submitValues: (values: RecordValues) => Promise<{ recordId: string }>;
  values: RecordValues;
}): Promise<GeneratedCreateSubmissionResult> {
  try {
    const response = await submitValues(values);

    return {
      recordId: response.recordId,
      state: resetState,
      type: "created",
    };
  } catch (error) {
    return {
      displayError: error instanceof Error ? error.message : "Save failed.",
      state,
      type: "failed",
    };
  }
}

async function submitCreateValues({
  binding,
  controller,
  operation,
  submitValues,
  values,
}: {
  binding: GeneratedOperationControlBinding | undefined;
  controller: GeneratedOperationController;
  operation: CreateHomeOperationConfig;
  submitValues?: (values: RecordValues) => Promise<{ recordId: string }>;
  values: RecordValues;
}): Promise<{ recordId: string }> {
  if (submitValues !== undefined) {
    setSyncStatus({
      state: "syncing",
      message: `Saving ${operation.entity.label.toLowerCase()}...`,
    });
    const response = await submitValues(values);
    setSyncStatus({ state: "idle", message: "Saved and synced." });
    return response;
  }

  if (binding === undefined) {
    throw new Error(`Create operation is unavailable for ${operation.entity.label}.`);
  }

  const result = await executeCreateSubmitOperation({
    binding,
    controller,
    progressMessage: `Saving ${operation.entity.label.toLowerCase()}...`,
    values,
  });

  if (result.type === "failed") {
    throw new Error(result.displayError);
  }

  return { recordId: selectCreatedOperationRecordId(result) };
}

export function projectCreateSubmitBinding(
  operation: CreateHomeOperationConfig,
  idPrefix: string,
): GeneratedOperationControlBinding {
  return projectCollectionOperationControlBinding(operation, { idPrefix });
}

export async function executeCreateSubmitOperation({
  binding,
  controller,
  progressMessage,
  values,
}: {
  binding: GeneratedOperationControlBinding;
  controller: GeneratedOperationController;
  progressMessage: string;
  values: RecordValues;
}): Promise<GeneratedOperationExecutionResult> {
  return executeGeneratedOperationControl({
    binding,
    callerInput: {
      bindingId: binding.id,
      input: values,
      source: "submitButton",
    },
    controller,
    feedback: {
      committedMessage: "Saved and synced.",
      progressMessage,
      replayedMessage: "Saved and synced.",
    },
  });
}

function selectCreatedOperationRecordId(result: GeneratedOperationExecutionResult) {
  if (result.type === "failed") {
    throw new Error(result.displayError);
  }

  const recordId = result.createdRecordIds?.[0];

  if (recordId === undefined) {
    throw new Error("Create operation did not return a created record.");
  }

  return recordId;
}
