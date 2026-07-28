import type { FieldContract, FieldSurface } from "@dpeek/formless-presentation/contract";

export type FieldKindKey =
  | "boolean"
  | "color"
  | "date"
  | "enum"
  | "long-text"
  | "markdown"
  | "media"
  | "number"
  | "reference"
  | "source-icon"
  | "state-machine-enum"
  | "text";

export type FieldKindOption = {
  id: FieldKindKey;
  label: string;
};

export type FieldScenarioGroup = {
  id: string;
  kind: FieldKindKey;
  surface: FieldSurface;
  facets: readonly FieldScenarioFacet[];
  variants: readonly FieldScenarioVariant[];
};

export type FieldScenarioFacetId =
  | "composition"
  | "format"
  | "interaction"
  | "list"
  | "machine"
  | "mode"
  | "presentation"
  | "requiredness"
  | "runtime"
  | "state"
  | "suffix"
  | "surface"
  | "trigger"
  | "unit-requiredness"
  | "unit-state"
  | "value";

export type FieldScenarioAxis = {
  id: FieldScenarioFacetId;
  label: string;
  variants: readonly FieldScenarioVariant[];
};

export type FieldScenarioFacet = {
  id: FieldScenarioFacetId;
  label: string;
  options: readonly FieldScenarioFacetOption[];
};

export type FieldScenarioFacetOption = {
  id: string;
  label: string;
};

export type FieldScenarioVariant = {
  id: string;
  label: string;
  facets: FieldScenarioFacetValues;
  field: FieldContract;
};

export type FieldScenarioFacetValues = Partial<Record<FieldScenarioFacetId, string>>;

export type FieldScenarioFieldPatch = Partial<FieldContract> & Record<string, unknown>;

export type FieldScenarioFieldModifier =
  | FieldScenarioFieldPatch
  | ((field: FieldContract) => FieldContract);

export type FieldScenarioComposeOption = FieldScenarioFacetOption & {
  modify?: FieldScenarioFieldModifier | readonly FieldScenarioFieldModifier[];
};

export type FieldScenarioComposeAxis = {
  id: FieldScenarioFacetId;
  label: string;
  options: readonly FieldScenarioComposeOption[];
};

export type FieldScenarioComposeContext = {
  facets: FieldScenarioFacetValues;
  field: FieldContract;
  optionIds: readonly string[];
  optionLabels: readonly string[];
  options: readonly FieldScenarioComposeOption[];
};

export type ComposeScenarioGroupInput = {
  id: string;
  kind: FieldKindKey;
  surface: FieldSurface;
  base: FieldContract;
  axes: readonly FieldScenarioComposeAxis[];
  include?: (context: FieldScenarioComposeContext) => boolean;
  finalizeField?: (context: FieldScenarioComposeContext) => FieldContract;
  variantId?: (context: FieldScenarioComposeContext) => string;
  variantLabel?: (context: FieldScenarioComposeContext) => string;
};

export type FieldScenarioProjectionContext = {
  facets: FieldScenarioFacetValues;
  optionIds: readonly string[];
  optionLabels: readonly string[];
  options: readonly FieldScenarioFacetOption[];
};

export type ProjectScenarioGroupInput = {
  id: string;
  kind: FieldKindKey;
  axes: readonly FieldScenarioComposeAxis[];
  include?: (context: FieldScenarioProjectionContext) => boolean;
  projectField: (context: FieldScenarioProjectionContext) => FieldContract;
  variantId?: (context: FieldScenarioProjectionContext) => string;
  variantLabel?: (context: FieldScenarioProjectionContext) => string;
};

export function composeScenarioGroup({
  axes,
  base,
  finalizeField,
  id,
  include,
  kind,
  surface,
  variantId,
  variantLabel,
}: ComposeScenarioGroupInput): FieldScenarioGroup {
  const combinations = scenarioOptionCombinations(axes);

  return {
    facets: axes.map((axis) => ({
      id: axis.id,
      label: axis.label,
      options: axis.options.map((option) => ({
        id: option.id,
        label: option.label,
      })),
    })),
    id,
    kind,
    surface,
    variants: combinations.flatMap((options) => {
      const facets: FieldScenarioFacetValues = {};

      for (const [index, option] of options.entries()) {
        facets[axes[index].id] = option.id;
      }

      const optionIds = options.map((option) => option.id);
      const optionLabels = options.map((option) => option.label);
      let field = options.reduce<FieldContract>(
        (currentField, option) => applyFieldScenarioModifiers(currentField, option.modify),
        { ...base } as FieldContract,
      );
      let context: FieldScenarioComposeContext = {
        facets,
        field,
        optionIds,
        optionLabels,
        options,
      };

      if (include && !include(context)) {
        return [];
      }

      if (finalizeField) {
        field = finalizeField(context);
        context = { ...context, field };
      }

      return scenarioVariant(
        variantId?.(context) ?? optionIds.join("-"),
        variantLabel?.(context) ?? optionLabels.join(" / "),
        field,
        facets,
      );
    }),
  };
}

export function projectScenarioGroup({
  axes,
  id,
  include,
  kind,
  projectField,
  variantId,
  variantLabel,
}: ProjectScenarioGroupInput): FieldScenarioGroup {
  const variants = scenarioOptionCombinations(axes).flatMap((options) => {
    const facets: FieldScenarioFacetValues = {};

    for (const [index, option] of options.entries()) {
      facets[axes[index].id] = option.id;
    }

    const optionIds = options.map((option) => option.id);
    const optionLabels = options.map((option) => option.label);
    const context: FieldScenarioProjectionContext = {
      facets,
      optionIds,
      optionLabels,
      options,
    };

    if (include && !include(context)) {
      return [];
    }

    const field = projectField(context);

    return scenarioVariant(
      variantId?.(context) ?? optionIds.join("-"),
      variantLabel?.(context) ?? optionLabels.join(" / "),
      field,
      facets,
    );
  });

  return {
    facets: axes.map((axis) => ({
      id: axis.id,
      label: axis.label,
      options: axis.options.map((option) => ({
        id: option.id,
        label: option.label,
      })),
    })),
    id,
    kind,
    surface: variants[0]?.field.surface ?? "record",
    variants,
  };
}
export function mergeScenarioGroupsByKind(
  groups: readonly FieldScenarioGroup[],
  surfaceOptions: readonly {
    id: FieldSurface;
    label: string;
  }[],
): FieldScenarioGroup[] {
  const groupsByKind = new Map<FieldKindKey, FieldScenarioGroup[]>();
  for (const group of groups) {
    groupsByKind.set(group.kind, [...(groupsByKind.get(group.kind) ?? []), group]);
  }

  return Array.from(groupsByKind.entries()).map(([kind, kindGroups]) => {
    const facets = mergeScenarioFacets([
      surfaceScenarioFacet(surfaceOptions, kindGroups),
      ...kindGroups.flatMap((group) => group.facets),
    ]);

    return {
      facets,
      id: `${kind}-fields`,
      kind,
      surface: kindGroups[0]?.surface ?? "record",
      variants: kindGroups.flatMap((group) =>
        group.variants.map((variant) => ({
          ...variant,
          facets: {
            surface: variant.facets.surface ?? group.surface,
            ...variant.facets,
          },
        })),
      ),
    };
  });
}

export function scenarioOption(
  id: string,
  label: string,
  modify?: FieldScenarioComposeOption["modify"],
): FieldScenarioComposeOption {
  return modify === undefined ? { id, label } : { id, label, modify };
}

export function composeScenarioAxis(
  id: FieldScenarioFacetId,
  label: string,
  options: readonly FieldScenarioComposeOption[],
): FieldScenarioComposeAxis {
  return { id, label, options };
}

export function scenarioGroup(
  id: string,
  kind: FieldKindKey,
  surface: FieldSurface,
  facetsOrAxes: readonly FieldScenarioFacet[] | readonly FieldScenarioAxis[],
  variants?: readonly FieldScenarioVariant[],
): FieldScenarioGroup {
  if (variants !== undefined) {
    return { facets: facetsOrAxes as readonly FieldScenarioFacet[], id, kind, surface, variants };
  }

  const axes = facetsOrAxes as readonly FieldScenarioAxis[];

  return {
    facets: axes.map((axis) => ({
      id: axis.id,
      label: axis.label,
      options: axis.variants.map((variant) => ({
        id: variant.id,
        label: variant.label,
      })),
    })),
    id,
    kind,
    surface,
    variants: axes.flatMap((axis) =>
      axis.variants.map((variant) => ({
        ...variant,
        facets: {
          ...variant.facets,
          [axis.id]: variant.facets[axis.id] ?? variant.id,
        },
      })),
    ),
  };
}

export function scenarioAxis(
  id: FieldScenarioFacetId,
  label: string,
  variants: readonly FieldScenarioVariant[],
): FieldScenarioAxis {
  return { id, label, variants };
}

export function scenarioFacet(
  id: FieldScenarioFacetId,
  label: string,
  options: readonly FieldScenarioFacetOption[],
): FieldScenarioFacet {
  return { id, label, options };
}

export function facetOption(id: string, label: string): FieldScenarioFacetOption {
  return { id, label };
}

export function scenarioVariant(
  id: string,
  label: string,
  field: FieldContract,
  facets: FieldScenarioFacetValues = {},
): FieldScenarioVariant {
  return { facets, field, id, label };
}

export function closestScenarioVariantForFacet(
  group: FieldScenarioGroup,
  selectedValues: FieldScenarioFacetValues,
  facetId: FieldScenarioFacetId,
  optionId: string,
): FieldScenarioVariant | undefined {
  const selectedSurface =
    facetId === "surface" ? optionId : (selectedValues.surface ?? group.surface);
  let closestVariant: FieldScenarioVariant | undefined;
  let closestScore = -1;

  for (const variant of group.variants) {
    const variantSurface = variant.facets.surface ?? group.surface;
    const variantOption = facetId === "surface" ? variantSurface : variant.facets[facetId];

    if (variantSurface !== selectedSurface || variantOption !== optionId) {
      continue;
    }

    const score = scenarioVariantFacetMatchScore(variant, selectedValues, facetId);

    if (score > closestScore) {
      closestVariant = variant;
      closestScore = score;
    }
  }

  return closestVariant;
}

function scenarioVariantFacetMatchScore(
  variant: FieldScenarioVariant,
  selectedValues: FieldScenarioFacetValues,
  changedFacetId: FieldScenarioFacetId,
) {
  let score = 0;

  for (const [facetId, selectedValue] of Object.entries(selectedValues)) {
    if (facetId === changedFacetId || selectedValue === undefined) {
      continue;
    }

    if (variant.facets[facetId as FieldScenarioFacetId] === selectedValue) {
      score += 1;
    }
  }
  return score;
}
function surfaceScenarioFacet(
  surfaceOptions: readonly {
    id: FieldSurface;
    label: string;
  }[],
  kindGroups: readonly FieldScenarioGroup[],
): FieldScenarioFacet {
  const surfaces = new Set<FieldSurface>();

  for (const kindGroup of kindGroups) {
    surfaces.add(kindGroup.surface);

    for (const variant of kindGroup.variants) {
      if (variant.facets.surface) {
        surfaces.add(variant.facets.surface as FieldSurface);
      }
    }
  }

  return scenarioFacet(
    "surface",
    "Surface",
    surfaceOptions
      .filter((option) => surfaces.has(option.id))
      .map((option) => facetOption(option.id, option.label)),
  );
}

function mergeScenarioFacets(facets: readonly FieldScenarioFacet[]): FieldScenarioFacet[] {
  const merged = new Map<FieldScenarioFacetId, FieldScenarioFacet>();

  for (const facet of facets) {
    const existingFacet = merged.get(facet.id);

    if (!existingFacet) {
      merged.set(facet.id, facet);
      continue;
    }

    merged.set(facet.id, {
      ...existingFacet,
      options: mergeScenarioFacetOptions(existingFacet.options, facet.options),
    });
  }

  return Array.from(merged.values());
}

function mergeScenarioFacetOptions(
  existingOptions: readonly FieldScenarioFacetOption[],
  nextOptions: readonly FieldScenarioFacetOption[],
): FieldScenarioFacetOption[] {
  const options = new Map(existingOptions.map((option) => [option.id, option]));

  for (const option of nextOptions) {
    if (!options.has(option.id)) {
      options.set(option.id, option);
    }
  }

  return Array.from(options.values());
}

function scenarioOptionCombinations(
  axes: readonly FieldScenarioComposeAxis[],
): FieldScenarioComposeOption[][] {
  return axes.reduce<FieldScenarioComposeOption[][]>(
    (combinations, axis) =>
      combinations.flatMap((combination) => axis.options.map((option) => [...combination, option])),
    [[]],
  );
}

function applyFieldScenarioModifiers(
  field: FieldContract,
  modifiers: FieldScenarioComposeOption["modify"],
): FieldContract {
  if (modifiers === undefined) {
    return field;
  }

  if (fieldScenarioModifiersAreArray(modifiers)) {
    return modifiers.reduce<FieldContract>(
      (currentField, modifier) => applyFieldScenarioModifier(currentField, modifier),
      field,
    );
  }

  return applyFieldScenarioModifier(field, modifiers);
}

function fieldScenarioModifiersAreArray(
  modifiers: FieldScenarioComposeOption["modify"],
): modifiers is readonly FieldScenarioFieldModifier[] {
  return Array.isArray(modifiers);
}

function applyFieldScenarioModifier(
  field: FieldContract,
  modifier: FieldScenarioFieldModifier,
): FieldContract {
  if (typeof modifier === "function") {
    return modifier(field);
  }

  return { ...field, ...modifier } as FieldContract;
}
