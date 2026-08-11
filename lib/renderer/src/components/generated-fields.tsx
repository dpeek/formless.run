import { useState } from "react";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { FieldIntentHandler } from "@dpeek/formless-presentation/contract";
import { AstryxApplicationSurfaceFrame } from "./application-surface-frame.tsx";
import { applyScenarioFieldIntent, scenarioFieldKey } from "./fields/fixture-helpers.ts";
import { FormlessFixtureFrame, FormlessFixtureSelector } from "./fixture-layout.tsx";
import {
  createRecordFieldSurfaceFixtures,
  type RecordFieldSurfaceFixture,
} from "./fields/record-field.fixtures.ts";
import { FieldRenderer } from "./fields/field-renderer.tsx";

export function FormlessGeneratedFieldsLayout() {
  const [surfaceFixtures, setSurfaceFixtures] = useState(createRecordFieldSurfaceFixtures);
  const [selectedSurfaceId, setSelectedSurfaceId] =
    useState<RecordFieldSurfaceFixture["id"]>("record");
  const selectedSurface =
    surfaceFixtures.find((surface) => surface.id === selectedSurfaceId) ?? surfaceFixtures[0];
  const handleIntent =
    (recordId: string): FieldIntentHandler =>
    (intent) => {
      setSurfaceFixtures((currentFixtures) =>
        currentFixtures.map((surface) =>
          surface.id === selectedSurfaceId
            ? {
                ...surface,
                records: surface.records.map((record) =>
                  record.id === recordId
                    ? {
                        ...record,
                        fields: record.fields.map((field) =>
                          applyScenarioFieldIntent(field, intent),
                        ),
                      }
                    : record,
                ),
              }
            : surface,
        ),
      );
    };

  return (
    <FormlessFixtureFrame
      ariaLabel="Generated field fixtures"
      controls={
        <FormlessFixtureSelector
          label="Surface"
          onSelectionChange={setSelectedSurfaceId}
          options={surfaceFixtures}
          selectedId={selectedSurfaceId}
        />
      }
    >
      <main>
        <AstryxApplicationSurfaceFrame width="standard">
          <VStack gap={6} width="100%">
            <Heading level={1}>Generated record fields</Heading>

            {selectedSurface ? (
              <RecordFieldSet surface={selectedSurface} onIntent={handleIntent} />
            ) : null}
          </VStack>
        </AstryxApplicationSurfaceFrame>
      </main>
    </FormlessFixtureFrame>
  );
}

function RecordFieldSet({
  onIntent,
  surface,
}: {
  onIntent: (recordId: string) => FieldIntentHandler;
  surface: RecordFieldSurfaceFixture;
}) {
  const record = surface.records[0];

  if (!record) {
    return null;
  }

  return (
    <Card padding={4} variant="muted">
      <VStack gap={4} maxWidth={640} width="100%">
        {record.fields.map((field) => (
          <FieldRenderer
            key={scenarioFieldKey(field)}
            field={field}
            onIntent={onIntent(record.id)}
          />
        ))}
      </VStack>
    </Card>
  );
}
