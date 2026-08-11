import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { ButtonGroup } from "@astryxdesign/core/ButtonGroup";
import { Card } from "@astryxdesign/core/Card";
import { HStack } from "@astryxdesign/core/HStack";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Heading, Text } from "@astryxdesign/core/Text";
import { useToast } from "@astryxdesign/core/Toast";
import { VStack } from "@astryxdesign/core/VStack";
import {
  borderVars,
  colorVars,
  radiusVars,
  spacingVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import { fieldKindOptions, fieldScenarioGroups } from "./fields/fixtures.ts";
import { FieldRenderer, FieldSubmitFormAdapter } from "./fields/field-renderer.tsx";
import {
  applyScenarioFieldIntent,
  applyScenarioFieldSubmit,
  scenarioFieldKey,
} from "./fields/fixture-helpers.ts";
import { FormlessFixtureFrame, FormlessFixtureSelector } from "./fixture-layout.tsx";
import { closestScenarioVariantForFacet } from "./field-scenario-model.ts";
import type {
  FieldKindKey,
  FieldScenarioFacet,
  FieldScenarioFacetId,
  FieldScenarioFacetValues,
  FieldScenarioGroup,
  FieldScenarioVariant,
} from "./field-scenario-model.ts";
import type {
  FieldContract,
  FieldIntent,
  FieldIntentHandler,
} from "@dpeek/formless-presentation/contract";
import { AstryxApplicationSurfaceFrame } from "./application-surface-frame.tsx";
type FieldOverrides = Record<string, FieldContract>;
type StateTransitionInvokeIntent = Extract<
  FieldIntent,
  {
    type: "stateTransitionInvoke";
  }
>;
const stateTransitionSimulationDelayMs = 700;
export function FormlessFieldsLayout() {
  const showToast = useToast();
  const [selectedKind, setSelectedKind] = useState<FieldKindKey>("enum");
  const [selectedFacetValues, setSelectedFacetValues] = useState<FieldScenarioFacetValues>(() =>
    defaultFacetValues(requiredScenarioGroup("enum")),
  );
  const [fieldOverrides, setFieldOverrides] = useState<FieldOverrides>({});
  const [submittedFieldKeys, setSubmittedFieldKeys] = useState<Set<string>>(() => new Set());

  const selectedKindOption =
    fieldKindOptions.find((option) => option.id === selectedKind) ?? fieldKindOptions[0];
  const selectedGroup = findScenarioGroup(selectedKindOption.id);
  const normalizedFacetValues = selectedGroup
    ? normalizeFacetValues(selectedGroup, selectedFacetValues)
    : {};
  const selectedVariant = selectedGroup
    ? findScenarioVariant(selectedGroup, normalizedFacetValues)
    : null;
  const selectedField = useMemo(
    () =>
      selectedVariant
        ? (fieldOverrides[scenarioFieldKey(selectedVariant.field)] ?? selectedVariant.field)
        : null,
    [fieldOverrides, selectedVariant],
  );
  const handleIntent = useFieldMatrixIntentHandler(
    selectedVariant,
    setFieldOverrides,
    submittedFieldKeys,
  );
  const handleSubmit = useFieldMatrixSubmitHandler(
    selectedVariant,
    setFieldOverrides,
    setSubmittedFieldKeys,
  );
  const stateMachineError =
    selectedField?.access.kind === "stateMachine" && selectedField.control.kind === "enum"
      ? selectedField.errors?.[0]
      : undefined;
  const selectedFieldId = selectedField ? scenarioFieldKey(selectedField) : undefined;

  useEffect(() => {
    if (!selectedFieldId || !stateMachineError) {
      return;
    }

    showToast({
      uniqueID: `field:${selectedFieldId}:${stateMachineError.fieldName}:${stateMachineError.message}`,
      collisionBehavior: "overwrite",
      body: stateMachineError.message,
      type: "error",
      isAutoHide: true,
      autoHideDuration: 6000,
    });
  }, [selectedFieldId, showToast, stateMachineError?.fieldName, stateMachineError?.message]);

  const handleKindChange = (kind: FieldKindKey) => {
    const nextGroup = findScenarioGroup(kind);

    setSelectedKind(kind);
    setSelectedFacetValues(nextGroup ? defaultFacetValues(nextGroup) : {});
  };

  const handleFacetChange = (facet: FieldScenarioFacet, value: string) => {
    if (!selectedGroup) {
      return;
    }

    const nextVariant = closestScenarioVariantForFacet(
      selectedGroup,
      normalizedFacetValues,
      facet.id,
      value,
    );

    if (nextVariant) {
      resetFieldScenarioState(setFieldOverrides, setSubmittedFieldKeys, nextVariant.field);
      setSelectedFacetValues(nextVariant.facets);
    }
  };

  return (
    <FormlessFixtureFrame
      ariaLabel="Field fixtures"
      controls={
        <>
          <FormlessFixtureSelector
            label="Field type"
            onSelectionChange={handleKindChange}
            options={fieldKindOptions}
            selectedId={selectedKindOption.id}
          />
          {selectedGroup
            ? visibleScenarioFacets(selectedGroup, normalizedFacetValues).map((facet) => (
                <FieldFacetControl
                  key={facet.id}
                  facet={facet}
                  group={selectedGroup}
                  selectedValues={normalizedFacetValues}
                  onChange={(value) => handleFacetChange(facet, value)}
                />
              ))
            : null}
        </>
      }
    >
      <main>
        <AstryxApplicationSurfaceFrame width="standard">
          <div {...stylex.props(styles.content)}>
            <header {...stylex.props(styles.header)}>
              <VStack gap={1}>
                <Heading level={1}>Field Explorer</Heading>
              </VStack>
            </header>

            <section {...stylex.props(styles.workbench)} aria-label={selectedKindOption.label}>
              <Card padding={4} variant="muted">
                {selectedField ? (
                  <FieldPreview
                    field={selectedField}
                    onIntent={handleIntent}
                    onSubmit={handleSubmit}
                  />
                ) : (
                  <NoScenario />
                )}
              </Card>
            </section>
          </div>
        </AstryxApplicationSurfaceFrame>
      </main>
    </FormlessFixtureFrame>
  );
}

function FieldPreview({
  field,
  onIntent,
  onSubmit,
}: {
  field: FieldContract;
  onIntent: FieldIntentHandler;
  onSubmit: () => void;
}) {
  const renderer = (
    <>
      <FieldRenderer field={field} onIntent={onIntent} />
      <FieldSubmitFormAdapter field={field} />
    </>
  );

  return (
    <div {...stylex.props(styles.preview, field.surface === "detail" && styles.previewDetail)}>
      {field.mode === "editor" && field.commit === "submit" ? (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <VStack gap={3}>
            {renderer}
            <HStack hAlign="end">
              <Button
                label="Submit"
                type="submit"
                variant="primary"
                isDisabled={Boolean(field.errors?.length)}
              />
            </HStack>
          </VStack>
        </form>
      ) : (
        renderer
      )}
    </div>
  );
}

function NoScenario() {
  return (
    <div {...stylex.props(styles.emptyScenario)}>
      <Text type="label">No scenario</Text>
    </div>
  );
}

function FieldFacetControl({
  facet,
  group,
  onChange,
  selectedValues,
}: {
  facet: FieldScenarioFacet;
  group: FieldScenarioGroup;
  onChange: (value: string) => void;
  selectedValues: FieldScenarioFacetValues;
}) {
  const value = selectedValues[facet.id] ?? facet.options[0]?.id ?? "";
  const options = facet.options.filter((option) =>
    facetOptionExistsForSelectedSurface(group, facet.id, option.id, selectedValues),
  );

  if (fieldScenarioFacetIsAction(facet.id)) {
    return (
      <div {...stylex.props(styles.facetControl)}>
        <ButtonGroup label={facet.label} size="sm">
          {options.map((option) => {
            const isDisabled = !facetOptionHasScenario(group, facet.id, option.id, selectedValues);

            return (
              <Button
                key={option.id}
                label={option.label}
                variant="secondary"
                isDisabled={isDisabled}
                onClick={() => onChange(option.id)}
              />
            );
          })}
        </ButtonGroup>
      </div>
    );
  }

  return (
    <div {...stylex.props(styles.facetControl)}>
      <SegmentedControl
        value={value}
        onChange={onChange}
        label={facet.label}
        layout="hug"
        size="sm"
      >
        {options.map((option) => (
          <SegmentedControlItem
            key={option.id}
            value={option.id}
            label={option.label}
            isDisabled={!facetOptionHasScenario(group, facet.id, option.id, selectedValues)}
          />
        ))}
      </SegmentedControl>
    </div>
  );
}

function fieldScenarioFacetIsAction(facetId: FieldScenarioFacetId) {
  return facetId === "value";
}

function resetFieldScenarioState(
  setFieldOverrides: React.Dispatch<React.SetStateAction<FieldOverrides>>,
  setSubmittedFieldKeys: React.Dispatch<React.SetStateAction<Set<string>>>,
  field: FieldContract,
) {
  const key = scenarioFieldKey(field);

  setFieldOverrides((currentOverrides) => {
    if (!(key in currentOverrides)) {
      return currentOverrides;
    }

    const nextOverrides = { ...currentOverrides };
    delete nextOverrides[key];
    return nextOverrides;
  });

  setSubmittedFieldKeys((currentKeys) => {
    if (!currentKeys.has(key)) {
      return currentKeys;
    }

    const nextKeys = new Set(currentKeys);
    nextKeys.delete(key);
    return nextKeys;
  });
}

function useFieldMatrixIntentHandler(
  selectedVariant: FieldScenarioVariant | null,
  setFieldOverrides: React.Dispatch<React.SetStateAction<FieldOverrides>>,
  submittedFieldKeys: ReadonlySet<string>,
): FieldIntentHandler {
  const transitionTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(
    () => () => {
      for (const timer of transitionTimersRef.current.values()) {
        clearTimeout(timer);
      }
      transitionTimersRef.current.clear();
    },
    [],
  );

  return useCallback(
    (intent) => {
      if (!selectedVariant) {
        return;
      }

      const key = scenarioFieldKey(selectedVariant.field);

      if (intent.type === "stateTransitionInvoke") {
        const timerKey = `${key}:${intent.fieldName}:${intent.transitionName}`;
        const existingTimer = transitionTimersRef.current.get(timerKey);

        if (existingTimer) {
          clearTimeout(existingTimer);
        }

        setFieldOverrides((currentOverrides) => {
          const currentField = currentOverrides[key] ?? selectedVariant.field;
          const nextField = applyStateTransitionPending(currentField, intent);

          if (nextField === currentField) {
            return currentOverrides;
          }

          return { ...currentOverrides, [key]: nextField };
        });

        const timer = setTimeout(() => {
          transitionTimersRef.current.delete(timerKey);
          setFieldOverrides((currentOverrides) => {
            const currentField = currentOverrides[key] ?? selectedVariant.field;
            const nextField = clearStateTransitionPending(
              applyScenarioFieldIntent(currentField, intent),
              intent,
            );

            if (nextField === currentField) {
              return currentOverrides;
            }

            return { ...currentOverrides, [key]: nextField };
          });
        }, stateTransitionSimulationDelayMs);

        transitionTimersRef.current.set(timerKey, timer);
        return;
      }

      setFieldOverrides((currentOverrides) => {
        const currentField = currentOverrides[key] ?? selectedVariant.field;
        let nextField = applyScenarioFieldIntent(currentField, intent);

        if (
          intent.type === "operationDraftChange" ||
          (intent.type === "createDraftChange" && submittedFieldKeys.has(key))
        ) {
          nextField = applyScenarioFieldSubmit(nextField);
        }

        if (nextField === currentField) {
          return currentOverrides;
        }

        return { ...currentOverrides, [key]: nextField };
      });
    },
    [selectedVariant, setFieldOverrides, submittedFieldKeys],
  );
}

function useFieldMatrixSubmitHandler(
  selectedVariant: FieldScenarioVariant | null,
  setFieldOverrides: React.Dispatch<React.SetStateAction<FieldOverrides>>,
  setSubmittedFieldKeys: React.Dispatch<React.SetStateAction<Set<string>>>,
) {
  return useCallback(() => {
    if (!selectedVariant || selectedVariant.field.commit !== "submit") {
      return;
    }

    const key = scenarioFieldKey(selectedVariant.field);

    setSubmittedFieldKeys((currentKeys) => {
      if (currentKeys.has(key)) {
        return currentKeys;
      }

      return new Set([...currentKeys, key]);
    });
    setFieldOverrides((currentOverrides) => {
      const currentField = currentOverrides[key] ?? selectedVariant.field;
      const nextField = applyScenarioFieldSubmit(currentField);

      return nextField === currentField
        ? currentOverrides
        : { ...currentOverrides, [key]: nextField };
    });
  }, [selectedVariant, setFieldOverrides, setSubmittedFieldKeys]);
}

function applyStateTransitionPending(
  field: FieldContract,
  intent: StateTransitionInvokeIntent,
): FieldContract {
  if (
    field.fieldName !== intent.fieldName ||
    field.stateMachineFacts === undefined ||
    field.pending?.isPending
  ) {
    return field;
  }

  if (field.stateMachineFacts.interaction.kind !== "transitions") {
    return field;
  }

  const transition = field.stateMachineFacts.interaction.transitions.find(
    (candidate) => candidate.transitionName === intent.transitionName,
  );

  if (!transition || transition.availability?.valid === false) {
    return field;
  }

  return {
    ...field,
    pending: { isPending: true, label: `${transition.label}...` },
    stateMachineFacts: {
      ...field.stateMachineFacts,
      interaction: {
        ...field.stateMachineFacts.interaction,
        transitions: field.stateMachineFacts.interaction.transitions.map((candidate) =>
          candidate.transitionName === intent.transitionName
            ? {
                ...candidate,
                pending: { isPending: true, label: "Running" },
              }
            : candidate,
        ),
      },
    },
  };
}

function clearStateTransitionPending(
  field: FieldContract,
  intent: StateTransitionInvokeIntent,
): FieldContract {
  if (field.fieldName !== intent.fieldName || field.stateMachineFacts === undefined) {
    return field;
  }

  if (field.stateMachineFacts.interaction.kind !== "transitions") {
    return { ...field, pending: undefined };
  }

  return {
    ...field,
    pending: undefined,
    stateMachineFacts: {
      ...field.stateMachineFacts,
      interaction: {
        ...field.stateMachineFacts.interaction,
        transitions: field.stateMachineFacts.interaction.transitions.map((candidate) =>
          candidate.transitionName === intent.transitionName
            ? {
                ...candidate,
                pending: undefined,
              }
            : candidate,
        ),
      },
    },
  };
}

function findScenarioGroup(kind: FieldKindKey) {
  return fieldScenarioGroups.find((group) => group.kind === kind);
}

function requiredScenarioGroup(kind: FieldKindKey) {
  const group = findScenarioGroup(kind);

  if (!group) {
    throw new Error(`Missing ${kind} field scenario group.`);
  }

  return group;
}

function defaultFacetValues(group: FieldScenarioGroup): FieldScenarioFacetValues {
  return normalizeFacetValues(group, group.variants[0]?.facets ?? {});
}

function normalizeFacetValues(
  group: FieldScenarioGroup,
  values: FieldScenarioFacetValues,
): FieldScenarioFacetValues {
  const nextValues: FieldScenarioFacetValues = {};
  const surfaceFacet = group.facets.find((facet) => facet.id === "surface");

  if (surfaceFacet) {
    const selectedSurface = values.surface;
    const surfaceIsAvailable = surfaceFacet.options.some((option) => option.id === selectedSurface);

    nextValues.surface =
      selectedSurface && surfaceIsAvailable
        ? selectedSurface
        : (group.variants[0]?.facets.surface ?? surfaceFacet.options[0]?.id);
  }

  for (const facet of activeScenarioFacets(group, nextValues)) {
    const selectedValue = values[facet.id];
    const selectedOption =
      selectedValue && facet.options.some((option) => option.id === selectedValue)
        ? selectedValue
        : undefined;

    nextValues[facet.id] =
      selectedOption ?? group.variants[0]?.facets[facet.id] ?? facet.options[0]?.id;
  }

  if (scenarioVariantExists(group, nextValues)) {
    return nextValues;
  }

  const fallbackVariant =
    group.variants.find((variant) => variant.facets.surface === nextValues.surface) ??
    group.variants[0];

  return fallbackVariant ? normalizeFacetValues(group, fallbackVariant.facets) : nextValues;
}

function findScenarioVariant(
  group: FieldScenarioGroup,
  values: FieldScenarioFacetValues,
): FieldScenarioVariant | null {
  const activeFacets = activeScenarioFacets(group, values);

  return (
    group.variants.find((variant) =>
      activeFacets.every((facet) => variant.facets[facet.id] === values[facet.id]),
    ) ??
    group.variants.find((variant) => variant.facets.surface === values.surface) ??
    group.variants[0] ??
    null
  );
}

function activeScenarioFacets(
  group: FieldScenarioGroup,
  values: FieldScenarioFacetValues,
): readonly FieldScenarioFacet[] {
  const selectedSurface = values.surface ?? group.variants[0]?.facets.surface;

  return group.facets.filter(
    (facet) =>
      facet.id === "surface" ||
      group.variants.some(
        (variant) =>
          variant.facets.surface === selectedSurface && variant.facets[facet.id] !== undefined,
      ),
  );
}

function visibleScenarioFacets(
  group: FieldScenarioGroup,
  values: FieldScenarioFacetValues,
): readonly FieldScenarioFacet[] {
  return activeScenarioFacets(group, values).filter(
    (facet) =>
      group.kind !== "enum" ||
      values.presentation !== "plain" ||
      (facet.id !== "trigger" && facet.id !== "list"),
  );
}

function facetOptionHasScenario(
  group: FieldScenarioGroup,
  facetId: FieldScenarioFacetId,
  optionId: string,
  selectedValues: FieldScenarioFacetValues,
) {
  return closestScenarioVariantForFacet(group, selectedValues, facetId, optionId) !== undefined;
}

function facetOptionExistsForSelectedSurface(
  group: FieldScenarioGroup,
  facetId: FieldScenarioFacetId,
  optionId: string,
  selectedValues: FieldScenarioFacetValues,
) {
  if (facetId === "surface") {
    return group.variants.some((variant) => (variant.facets.surface ?? group.surface) === optionId);
  }

  const selectedSurface = selectedValues.surface ?? group.surface;

  return group.variants.some(
    (variant) =>
      (variant.facets.surface ?? group.surface) === selectedSurface &&
      variant.facets[facetId] === optionId,
  );
}

function scenarioVariantExists(group: FieldScenarioGroup, values: FieldScenarioFacetValues) {
  const activeFacets = activeScenarioFacets(group, values);

  return group.variants.some((variant) =>
    activeFacets.every((facet) => variant.facets[facet.id] === values[facet.id]),
  );
}

const styles = stylex.create({
  content: {
    display: "grid",
    gap: spacingVars["--spacing-4"],
    width: "100%",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacingVars["--spacing-3"],
    flexWrap: "wrap",
  },
  workbench: {
    display: "grid",
    gap: spacingVars["--spacing-4"],
    minWidth: 0,
  },
  facetControl: {
    display: "grid",
    gap: spacingVars["--spacing-1"],
    minWidth: 0,
  },
  preview: {
    width: "100%",
    maxWidth: 760,
  },
  previewDetail: {
    maxWidth: 560,
  },
  emptyScenario: {
    minHeight: 132,
    display: "grid",
    placeItems: "center",
    borderWidth: borderVars["--border-width"],
    borderStyle: "dashed",
    borderColor: colorVars["--color-border"],
    borderRadius: radiusVars["--radius-element"],
    color: colorVars["--color-text-secondary"],
  },
});
