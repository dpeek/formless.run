import type {
  AppSchema,
  CollectionViewSchema,
  EntitySchema,
  EntityUnionVariantSchema,
  FieldSchema,
  FieldVisibilityValue,
  OperationHandlerEffectSchemaForKind,
  ToManyRelationshipSchema,
  TreeBranchChildVariantSchema,
  TreeBranchVariantPolicySchema,
} from "@dpeek/formless-schema";
import { isOperationHandlerEffectForSelectionCapability } from "@dpeek/formless-schema";
import { selectRecordFields, selectToManyRelationship } from "./collection-shell-model.ts";
import {
  selectAvailableEntityOperations,
  type EntityOperationPresentationConfig,
  selectEntityOperationByKind,
} from "./operation-presentation-model.ts";
import type { ResultOrderingConfig } from "./result-ordering-model.ts";
import { selectResultOrderingConfig } from "./result-ordering-model.ts";
import { selectRecordUnionPresentation } from "./union-presentation-model.ts";
import type { HomeResultConfig, RecordUnionPresentationConfig } from "./views.ts";

export type TreeAllowedChildVariantConfig = {
  variantValue: string;
  label: string;
  unionVariant: EntityUnionVariantSchema;
  placementValues?: Record<string, FieldVisibilityValue>;
};
export type TreeVariantBranchPolicyConfig = {
  discriminatorFieldName: string;
  discriminatorField: Extract<
    FieldSchema,
    {
      type: "enum";
    }
  >;
  leafVariantValues: string[];
  allowedChildVariantsByParentVariant: Record<string, TreeAllowedChildVariantConfig[]>;
};

export type TreeBranchPolicyConfig = {
  variants: TreeVariantBranchPolicyConfig;
};

export type TreeCompositionOperationConfig = {
  create?: {
    operationName: string;
    operation: EntityOperationPresentationConfig;
    effect: OperationHandlerEffectSchemaForKind<"create-tree-child">;
  };
  remove?: {
    operationName: string;
    operation: EntityOperationPresentationConfig;
    effect: OperationHandlerEffectSchemaForKind<"remove-tree-placement">;
  };
};
export type TreeResultModel = Extract<
  HomeResultConfig,
  {
    type: "tree";
  }
>;
export function selectTreeResultModel(
  schema: AppSchema,
  result: Extract<
    CollectionViewSchema["result"],
    {
      type: "tree";
    }
  >,
  entityName: string,
  entity: EntitySchema,
): TreeResultModel {
  const relationship = selectToManyRelationship(schema, result.relationship);
  const childField = entity.fields.find((definition) => definition.key === result.childField)!;
  if (!childField || childField.type !== "reference") {
    throw new Error(`Missing tree child field "${result.childField}".`);
  }
  const childEntity = schema.entities.find((definition) => definition.key === childField.to)!;
  const childItemView = schema.itemViews.find(
    (definition) => definition.key === result.childItemView,
  )!;
  if (!childEntity) {
    throw new Error(`Missing child entity "${childField.to}".`);
  }

  if (!childItemView) {
    throw new Error(`Missing child item view "${result.childItemView}".`);
  }
  const placementItemViewName = result.placementItemView;
  const placementItemView =
    placementItemViewName === undefined
      ? undefined
      : schema.itemViews.find((definition) => definition.key === placementItemViewName)!;
  if (placementItemViewName !== undefined && placementItemView === undefined) {
    throw new Error(`Missing placement item view "${placementItemViewName}".`);
  }

  const ordering =
    selectResultOrderingConfig(result.ordering, entity, ["dragHandle"]) ??
    selectImplicitTreeOrderingFallback(entity, relationship);
  const childRecordUnion = selectRecordUnionPresentation(schema, childItemView, childEntity);
  const placementRecordUnion =
    placementItemView === undefined
      ? undefined
      : selectRecordUnionPresentation(schema, placementItemView, entity);
  const branches = selectTreeBranchPolicyConfig(result.branches, childRecordUnion);
  const composition = selectTreeCompositionOperationConfig(result.composition, entityName, entity);
  const childUpdateOperation = selectEntityOperationByKind(
    childField.to,
    childEntity,
    "update",
    "record",
  );
  const childDeleteOperation = selectEntityOperationByKind(
    childField.to,
    childEntity,
    "delete",
    "record",
  );
  const placementUpdateOperation = selectEntityOperationByKind(
    entityName,
    entity,
    "update",
    "record",
  );

  return {
    type: "tree",
    relationshipName: result.relationship,
    relationship,
    childFieldName: result.childField,
    childField,
    presentation: result.presentation ?? "outlineDetail",
    childEntityName: childField.to,
    childEntity,
    ...(childDeleteOperation === undefined ? {} : { childDeleteOperation }),
    ...(childUpdateOperation === undefined ? {} : { childUpdateOperation }),
    childItemViewName: result.childItemView,
    childRecordFields: selectRecordFields(childItemView, childEntity),
    ...(childRecordUnion === undefined ? {} : { childRecordUnion }),
    placementEntityName: entityName,
    placementEntity: entity,
    ...(placementItemViewName === undefined || placementItemView === undefined
      ? {}
      : {
          placementItemViewName,
          placementRecordFields: selectRecordFields(placementItemView, entity),
          ...(placementRecordUnion === undefined ? {} : { placementRecordUnion }),
        }),
    ...(placementUpdateOperation === undefined ? {} : { placementUpdateOperation }),
    ...(ordering === undefined ? {} : { ordering }),
    ...(branches === undefined ? {} : { branches }),
    ...(composition === undefined ? {} : { composition }),
    maxDepth: result.maxDepth ?? 8,
  };
}
function selectTreeBranchPolicyConfig(
  branches: Extract<
    CollectionViewSchema["result"],
    {
      type: "tree";
    }
  >["branches"],
  childRecordUnion: RecordUnionPresentationConfig | undefined,
): TreeBranchPolicyConfig | undefined {
  if (branches === undefined) {
    return undefined;
  }

  if (childRecordUnion === undefined) {
    throw new Error("Tree branch policy requires a child record union.");
  }

  return {
    variants: {
      discriminatorFieldName: childRecordUnion.discriminatorFieldName,
      discriminatorField: childRecordUnion.discriminatorField,
      leafVariantValues: Object.entries(branches.variants)
        .filter(([, policy]) => treeBranchVariantPolicyIsLeaf(policy))
        .map(([variantValue]) => variantValue),
      allowedChildVariantsByParentVariant: selectAllowedChildVariantsByParentVariant(
        branches.variants,
        childRecordUnion,
      ),
    },
  };
}

function selectAllowedChildVariantsByParentVariant(
  variants: Record<string, TreeBranchVariantPolicySchema>,
  childRecordUnion: RecordUnionPresentationConfig,
): Record<string, TreeAllowedChildVariantConfig[]> {
  return Object.fromEntries(
    Object.entries(variants)
      .map(([parentVariantValue, policy]) => {
        const childVariantPolicies =
          typeof policy === "object"
            ? (policy.children ?? [])
            : ([] as TreeBranchChildVariantSchema[]);

        return [
          parentVariantValue,
          childVariantPolicies.map((childVariantPolicy) => {
            const childVariantValue = treeChildVariantPolicyValue(childVariantPolicy);
            const unionVariant = childRecordUnion.union.variants.find(
              (definition) => definition.key === childVariantValue,
            )!;
            if (!unionVariant) {
              throw new Error(`Missing tree child variant "${childVariantValue}".`);
            }

            return {
              variantValue: childVariantValue,
              label:
                typeof childVariantPolicy === "string"
                  ? unionVariant.label
                  : (childVariantPolicy.label ?? unionVariant.label),
              unionVariant,
              ...(typeof childVariantPolicy === "string" ||
              childVariantPolicy.placementValues === undefined
                ? {}
                : { placementValues: childVariantPolicy.placementValues }),
            };
          }),
        ] as const;
      })
      .filter(([, childVariants]) => childVariants.length > 0),
  );
}

function treeChildVariantPolicyValue(policy: TreeBranchChildVariantSchema) {
  return typeof policy === "string" ? policy : policy.variant;
}

function treeBranchVariantPolicyIsLeaf(policy: TreeBranchVariantPolicySchema): boolean {
  return policy === "leaf" || (typeof policy === "object" && policy.action === "leaf");
}
function selectTreeCompositionOperationConfig(
  composition: Extract<
    CollectionViewSchema["result"],
    {
      type: "tree";
    }
  >["composition"],
  entityName: string,
  entity: EntitySchema,
): TreeCompositionOperationConfig | undefined {
  if (composition === undefined) {
    return undefined;
  }

  const recordOperations = selectAvailableEntityOperations(entityName, entity, "record");
  const createOperation =
    composition.createOperation === undefined
      ? undefined
      : recordOperations.find(
          (operation) => operation.canonicalKey === composition.createOperation,
        );
  const removeOperation =
    composition.removeOperation === undefined
      ? undefined
      : recordOperations.find(
          (operation) => operation.canonicalKey === composition.removeOperation,
        );
  const createEffect = selectTreeCompositionEffect(createOperation, "createTreeChild");
  const removeEffect = selectTreeCompositionEffect(removeOperation, "removeTreePlacement");

  return {
    ...(createOperation !== undefined && createEffect !== undefined
      ? {
          create: {
            operationName: createOperation.operationName,
            operation: createOperation,
            effect: createEffect,
          },
        }
      : {}),
    ...(removeOperation !== undefined && removeEffect !== undefined
      ? {
          remove: {
            operationName: removeOperation.operationName,
            operation: removeOperation,
            effect: removeEffect,
          },
        }
      : {}),
  };
}

function selectTreeCompositionEffect<Capability extends "createTreeChild">(
  operation: EntityOperationPresentationConfig | undefined,
  capability: Capability,
): OperationHandlerEffectSchemaForKind<"create-tree-child"> | undefined;
function selectTreeCompositionEffect<Capability extends "removeTreePlacement">(
  operation: EntityOperationPresentationConfig | undefined,
  capability: Capability,
): OperationHandlerEffectSchemaForKind<"remove-tree-placement"> | undefined;
function selectTreeCompositionEffect(
  operation: EntityOperationPresentationConfig | undefined,
  capability: "createTreeChild" | "removeTreePlacement",
) {
  const effect = operation?.operation.effect;

  if (!isOperationHandlerEffectForSelectionCapability(effect, capability)) {
    return undefined;
  }

  return effect;
}

// Infer tree ordering from entity fields when result-level ordering is absent.
function selectImplicitTreeOrderingFallback(
  entity: EntitySchema,
  relationship: ToManyRelationshipSchema,
): ResultOrderingConfig | undefined {
  const orderField = entity.fields.find((definition) => definition.key === "order")!;
  const scopeField = entity.fields.find((definition) => definition.key === relationship.to.field)!;
  if (!orderField || orderField.type !== "number" || !scopeField) {
    return undefined;
  }

  return {
    fieldName: "order",
    field: orderField,
    scope: [
      {
        kind: "field",
        fieldName: relationship.to.field,
        field: scopeField,
      },
    ],
    presentations: ["moveMenu"],
  };
}
