import { useState } from "react";
import { Heading } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type {
  FieldIntent,
  FieldContract,
  OperationControlContract,
  RecordResultActionContract,
  RecordResultContract,
  RecordResultIntent,
} from "@dpeek/formless-presentation/contract";
import { AstryxApplicationSurfaceFrame } from "./application-surface-frame.tsx";
import { applyScenarioFieldIntent, withFixtureFieldOccurrence } from "./fields/fixture-helpers.ts";
import { FormlessFixtureFrame, FormlessFixtureSelector } from "./fixture-layout.tsx";
import { AstryxRecordResultRenderer } from "./record-result-renderer.tsx";
import { operationControlFixtures } from "./operation-controls.fixtures.ts";
import {
  completedTaskControl,
  createRecordResultFixtures,
  recordResultUnionField,
  taskStatusField,
  type RecordResultFixture,
  type RecordResultFixtureId,
} from "./record-results.fixtures.ts";

export function FormlessRecordResultsLayout() {
  const [fixtures, setFixtures] = useState(createRecordResultFixtures);
  const [selectedFixtureId, setSelectedFixtureId] = useState<RecordResultFixtureId>("editable");
  const selectedFixture =
    fixtures.find((fixture) => fixture.id === selectedFixtureId) ?? fixtures[0];

  const updateSelectedResult = (
    update: (recordResult: RecordResultContract) => RecordResultContract,
  ) => {
    setFixtures((currentFixtures) =>
      currentFixtures.map((fixture) =>
        fixture.id === selectedFixtureId
          ? { ...fixture, recordResult: update(fixture.recordResult) }
          : fixture,
      ),
    );
  };

  return (
    <FormlessFixtureFrame
      ariaLabel="Record result fixtures"
      controls={
        <FormlessFixtureSelector
          label="Record result state"
          onSelectionChange={setSelectedFixtureId}
          options={fixtures}
          selectedId={selectedFixtureId}
        />
      }
    >
      <main>
        <AstryxApplicationSurfaceFrame width="narrow">
          <VStack gap={5} width="100%">
            <Heading level={1}>Record Results</Heading>

            {selectedFixture ? (
              <AstryxRecordResultRenderer
                onIntent={(intent) =>
                  updateSelectedResult((recordResult) =>
                    applyRecordResultIntent(recordResult, intent),
                  )
                }
                recordResult={selectedFixture.recordResult}
              />
            ) : null}
          </VStack>
        </AstryxApplicationSurfaceFrame>
      </main>
    </FormlessFixtureFrame>
  );
}

export function applyRecordResultIntent(
  recordResult: RecordResultContract,
  intent: RecordResultIntent,
): RecordResultContract {
  const selectedRecord = recordResult.selectedRecord;

  if (
    intent.resultId !== recordResult.id ||
    !selectedRecord ||
    intent.recordId !== selectedRecord.id
  ) {
    return recordResult;
  }

  if (intent.type === "recordResultFieldIntent") {
    return applyRecordResultFieldIntent(recordResult, intent.fieldId, intent.intent);
  }

  return applyRecordResultOperationIntent(recordResult, intent.controlId, intent.intent);
}

function applyRecordResultFieldIntent(
  recordResult: RecordResultContract,
  fieldId: string,
  intent: FieldIntent,
): RecordResultContract {
  const sourceField = recordResult.fields.find((field) => field.fieldId === fieldId);
  if (!sourceField) {
    return recordResult;
  }

  const fields = recordResult.fields.map((field) =>
    field.fieldId === fieldId ? applyScenarioFieldIntent(field, intent) : field,
  );
  const unionKind = unionKindFromIntent(sourceField, intent);

  return {
    ...recordResult,
    fields: unionKind ? withVisibleUnionField(recordResult, fields, unionKind) : fields,
  };
}

function applyRecordResultOperationIntent(
  recordResult: RecordResultContract,
  controlId: string,
  intent: Extract<
    RecordResultIntent,
    {
      type: "recordResultOperationIntent";
    }
  >["intent"],
): RecordResultContract {
  const sourceAction = [...recordResult.actions.primary, ...recordResult.actions.secondary].find(
    (action) => action.control.id === controlId,
  );
  if (!sourceAction || intent.controlId !== sourceAction.control.id) {
    return recordResult;
  }

  if (intent.type === "operationConfirmationOpenChange") {
    return mapRecordResultAction(recordResult, controlId, (action) =>
      action.control.confirmation
        ? {
            ...action,
            control: {
              ...action.control,
              confirmation: { ...action.control.confirmation, open: intent.open },
            },
          }
        : action,
    );
  }

  const updatedResult = mapRecordResultAction(recordResult, controlId, (action) => ({
    ...action,
    control: fixtureOperationResult(action.control),
  }));

  if (controlId !== "task-complete") {
    return updatedResult;
  }

  return {
    ...updatedResult,
    fields: updatedResult.fields.map((field) =>
      field.fieldName === "status" ? { ...taskStatusField("done"), fieldId: field.fieldId } : field,
    ),
  };
}

function fixtureOperationResult(control: OperationControlContract): OperationControlContract {
  if (control.id === "task-complete") {
    return completedTaskControl();
  }

  if (control.id === operationControlFixtures.deleteTask.initial.id) {
    return operationControlFixtures.deleteTask.settled;
  }

  return control;
}

function unionKindFromIntent(
  sourceField: FieldContract,
  intent: FieldIntent,
): "article" | "link" | undefined {
  if (sourceField.fieldName !== "kind") {
    return undefined;
  }

  const value =
    intent.type === "recordEditorDraftChange"
      ? intent.value
      : intent.type === "recordValueCommit"
        ? intent.value
        : undefined;

  return value === "article" || value === "link" ? value : undefined;
}

function withVisibleUnionField(
  recordResult: RecordResultContract,
  fields: readonly FieldContract[],
  kind: "article" | "link",
) {
  const visibleFields = fields.filter(
    (field) => field.fieldName !== "summary" && field.fieldName !== "url",
  );
  const kindIndex = visibleFields.findIndex((field) => field.fieldName === "kind");
  const unionField = withRecordResultFieldIdentity(
    recordResult,
    recordResult.selectedRecord?.id ?? "record",
    recordResultUnionField(kind),
  );

  visibleFields.splice(kindIndex < 0 ? visibleFields.length : kindIndex + 1, 0, unionField);
  return visibleFields;
}

function withRecordResultFieldIdentity(
  recordResult: RecordResultContract,
  recordId: string,
  field: FieldContract,
): FieldContract {
  return withFixtureFieldOccurrence(field, {
    ownerId: `${recordResult.id}:${recordId}`,
    placementId: field.fieldName,
  });
}

function mapRecordResultAction(
  recordResult: RecordResultContract,
  controlId: string,
  update: (action: RecordResultActionContract) => RecordResultActionContract,
): RecordResultContract {
  const mapAction = (action: RecordResultActionContract) =>
    action.control.id === controlId ? update(action) : action;

  return {
    ...recordResult,
    actions: {
      ...recordResult.actions,
      primary: recordResult.actions.primary.map(mapAction),
      secondary: recordResult.actions.secondary.map(mapAction),
    },
  };
}

export function selectedRecordResultFixture(
  fixtures: readonly RecordResultFixture[],
  id: RecordResultFixtureId,
) {
  return fixtures.find((fixture) => fixture.id === id);
}
