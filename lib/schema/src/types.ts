/**
 * Public Schema contract version.
 *
 * Version 1 covers the Schema package public contract surface for App schema
 * language declarations, entity-name boundaries, query expressions, read-model
 * expressions, and runtime-neutral helper contracts. Bundled app revisions,
 * source schema hashes, app records, and runtime storage stay outside this
 * package contract.
 *
 * This file is intentionally import-free so runtime-neutral schema entrypoints
 * can share declarations without adapter dependencies.
 */
export const SCHEMA_PUBLIC_CONTRACT_VERSION = 1;
/** One portable keyed definition used by an ordered schema registry. */
export type KeyedDefinition<Definition extends object> = Definition & {
  key: string;
};
/** Opaque stable identity for one logical App schema entity. */
export type EntityId = `entity_${string}`;
/** Entity identity at cross-schema and external boundaries. */
export type QualifiedEntityName = {
  entityKey: string;
  schemaKey: string;
};

/** Scalar field value accepted by schema field behavior and query helpers. */
export type FieldValue = string | boolean | number;

/** Flat record values keyed by field name. */
export type RecordValues = Record<string, FieldValue>;

/**
 * Minimal stored-record shape consumed by runtime-neutral schema helpers.
 *
 * Runtime storage, sync, archives, and source records own app record lifecycle.
 * The Schema package uses this structural shape only to evaluate field, query,
 * and read-model behavior against flat records.
 */
export type StoredRecord = {
  id: string;
  entity: string;
  values: RecordValues;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};
/** System-owned fields that can be addressed by schema query expressions. */
export type SystemFieldName = "id" | "createdAt" | "updatedAt" | "deletedAt";
/** Reference to a value field or supported system field in a query expression. */
export type FieldRef =
  | {
      kind: "value";
      name: string;
    }
  | {
      kind: "system";
      name: SystemFieldName;
    };
/** Query operators supported by the portable schema query contract. */
export type QueryOperator = "eq" | "before";
/** Runtime-resolved query value placeholders accepted by schema parsing. */
export type QueryDynamicValue =
  | {
      kind: "today";
    }
  | {
      kind: "context";
      name: string;
    };
/** Literal or dynamic value used by a query predicate. */
export type QueryValue = string | boolean | number | QueryDynamicValue;
/** Portable query expression stored in App schema collection queries. */
export type QueryExpression =
  | {
      kind: "all";
    }
  | {
      kind: "where";
      ref: FieldRef;
      op: QueryOperator;
      value: QueryValue;
    }
  | {
      kind: "and";
      expressions: QueryExpression[];
    }
  | {
      kind: "or";
      expressions: QueryExpression[];
    };
/** Deterministic context values used when evaluating portable queries. */
export type QueryEvaluationContext = {
  today: string;
  values?: Record<string, string | boolean | number>;
};

/** Capability envelope for adapters that validate query portability. */
export type QueryCapabilities = {
  operators: QueryOperator[];
  fieldKinds: FieldRef["kind"][];
  expressionKinds: QueryExpression["kind"][];
  dynamicValues: QueryDynamicValue["kind"][];
};

/** Addressable field kinds exposed to schema query parsing and evaluation. */
export type AddressableFieldType =
  | "text"
  | "boolean"
  | "date"
  | "number"
  | "enum"
  | "reference"
  | "id"
  | "datetime";

/** Field catalog entry used by schema query parsing. */
export type AddressableField = {
  ref: FieldRef;
  type: AddressableFieldType;
  label: string;
  writable: boolean;
  filterOps: QueryOperator[];
  values?: readonly KeyedDefinition<EnumValueSchema>[];
  to?: string;
  displayField?: string;
};

/** Arithmetic operators for numeric read-model expressions. */
export type NumericExpressionOperator = "add" | "subtract" | "multiply" | "divide";

/** Numeric expression stored in computed read-model values. */
export type NumericExpression =
  | {
      kind: "field";
      field: string;
    }
  | {
      kind: "literal";
      value: number;
    }
  | {
      kind: "binary";
      op: NumericExpressionOperator;
      left: NumericExpression;
      right: NumericExpression;
    };

/** Current runtime ceiling for one schema-declared document upload. */
export const DOCUMENT_ASSET_POLICY_MAX_BYTES = 25 * 1024 * 1024;

/** Document MIME types currently supported by the App schema language. */
export const documentAssetMimeTypes = ["application/pdf"] as const;

export type DocumentAssetMimeType = (typeof documentAssetMimeTypes)[number];
export type DocumentAssetAccess = "public" | "private";

export type TextFieldDocumentAssetPolicySchema = {
  kind: "document";
  acceptedMimeTypes: DocumentAssetMimeType[];
  maxBytes: number;
  access: DocumentAssetAccess;
};

export type TextFieldAssetPolicySchema = TextFieldDocumentAssetPolicySchema;

export type TextFieldSchema = {
  type: "text";
  required: boolean;
  label?: string;
  format?: TextFieldFormat;
  suggestions?: string[];
  asset?: TextFieldAssetPolicySchema;
};

export type ContactTextFieldFormat = "email" | "phone";

export type TextFieldFormat =
  | "plain"
  | "longText"
  | "markdown"
  | "href"
  | "slug"
  | "color"
  | "icon"
  | ContactTextFieldFormat;

export type BooleanFieldSchema = {
  type: "boolean";
  required: boolean;
  label?: string;
  default?: boolean;
};

export type DateFieldSchema = {
  type: "date";
  required: boolean;
  label?: string;
};

export type NumberFieldSchema = {
  type: "number";
  required: boolean;
  label?: string;
  default?: number;
  min?: number;
  max?: number;
  integer?: boolean;
};

export type PresentationToken = string;

export type EnumValuePresentationSchema = {
  icon?: PresentationToken;
  color?: PresentationToken;
};

export type EnumValueSchema = {
  label: string;
  presentation?: EnumValuePresentationSchema;
};

export type EnumFieldSchema = {
  type: "enum";
  required: boolean;
  label?: string;
  values: readonly KeyedDefinition<EnumValueSchema>[];
  default?: string;
};
export type ReferenceFieldSchema = {
  type: "reference";
  required: boolean;
  label?: string;
  to: string;
  displayField?: string;
};

export type FieldSchema =
  | TextFieldSchema
  | BooleanFieldSchema
  | DateFieldSchema
  | NumberFieldSchema
  | EnumFieldSchema
  | ReferenceFieldSchema;

export type OperationAccessActorMode = "anonymous";

export type OperationChallengePolicySchema = {
  kind: "turnstile";
};

export type OperationOriginPolicySchema = {
  kind: "same-origin";
};

export type OperationRateLimitPolicySchema = {
  maxRequests: number;
  windowSeconds: number;
};

export type OperationAccessPolicySchema = {
  actor: OperationAccessActorMode;
  challenge?: OperationChallengePolicySchema;
  origin: OperationOriginPolicySchema;
  rateLimit?: OperationRateLimitPolicySchema;
};

export type PublicOperationTextInputFieldSchema = {
  type: "text";
  required: boolean;
  label?: string;
  format?: ContactTextFieldFormat;
  suggestions?: string[];
};

export type PublicOperationBooleanInputFieldSchema = {
  type: "boolean";
  required: boolean;
  label?: string;
};

export type PublicOperationDateInputFieldSchema = {
  type: "date";
  required: boolean;
  label?: string;
};

export type PublicOperationNumberInputFieldSchema = {
  type: "number";
  required: boolean;
  label?: string;
};

export type PublicOperationEnumInputFieldSchema = {
  type: "enum";
  required: boolean;
  label?: string;
  values: readonly KeyedDefinition<EnumValueSchema>[];
};
export type PublicOperationInputFieldSchema =
  | PublicOperationTextInputFieldSchema
  | PublicOperationBooleanInputFieldSchema
  | PublicOperationDateInputFieldSchema
  | PublicOperationNumberInputFieldSchema
  | PublicOperationEnumInputFieldSchema;
export type PublicOperationInputContractSchema = {
  fields: KeyedDefinition<PublicOperationInputFieldSchema>[];
};
export type FieldCommitPolicy = "immediate" | "field-commit";
export type FieldEditor =
  | "text"
  | "textarea"
  | "markdown"
  | "href"
  | "slug"
  | "color"
  | "icon"
  | "media"
  | "boolean"
  | "date"
  | "number"
  | "enum"
  | "reference";

export type FieldVisibilityValue = string | boolean | number;

export type FieldVisibilityConditionSchema = {
  field: string;
  values: FieldVisibilityValue[];
};

export type FieldPresentationMode = "iconOnly" | "completion";
export type FieldPresentationVisibility = "valueOrInteraction";
export type FieldPresentationEnumContent = "icon" | "label" | "both";

export type FieldPresentationSchema = {
  list?: FieldPresentationEnumContent;
  mode?: FieldPresentationMode;
  trigger?: FieldPresentationEnumContent;
  visibility?: FieldPresentationVisibility;
};

export type ViewFieldSchema = {
  editor: FieldEditor;
  commit: FieldCommitPolicy;
  visibleWhen?: FieldVisibilityConditionSchema;
  presentation?: FieldPresentationSchema;
};

export type CreateViewFieldSchema = {
  editor: FieldEditor;
  visibleWhen?: FieldVisibilityConditionSchema;
  presentation?: FieldPresentationSchema;
};

export type TableColumnAlign = "start" | "center" | "end";
export type TableColumnWidth = "xs" | "sm" | "md" | "lg";
export type TableColumnDisplay = "editor" | "readOnly" | "hidden";
export type TableColumnFormat = "plain" | "number" | "currency" | "percent";
export type TableOperationControlVariant = "default" | "destructive";
export type TableOperationControlAvailabilityState = "visible" | "hidden" | "disabled";
export type TableOperationControlPresentation = "button" | "dropdown";
export type ResultOrderingPresentation = "moveMenu" | "dragHandle";

export type TableOperationControlAvailabilitySchema = {
  state: TableOperationControlAvailabilityState;
  reason?: string;
};

export type TableEditRecordTargetSchema =
  | {
      kind: "row";
    }
  | {
      kind: "reference";
      field: string;
    };

export type ResultOrderingScopeSchema = {
  kind: "field";
  field: string;
};

export type ResultOrderingSchema = {
  field: string;
  scope?: ResultOrderingScopeSchema[];
  presentations?: ResultOrderingPresentation[];
};

export type ValueUnitEditorSchema = {
  unitField: string;
};

export type FieldTableColumnSchema = {
  type: "field";
  field: string;
  label?: string;
  editor?: FieldEditor;
  commit?: FieldCommitPolicy;
  align?: TableColumnAlign;
  width?: TableColumnWidth;
  display?: TableColumnDisplay;
  suffix?: string;
  format?: TableColumnFormat;
  referenceItemView?: string;
  valueUnit?: ValueUnitEditorSchema;
  presentation?: FieldPresentationSchema;
};

export type ReferenceFieldTableColumnSchema = {
  type: "referenceField";
  referenceField: string;
  field: string;
  label?: string;
  editor?: FieldEditor;
  commit?: FieldCommitPolicy;
  align?: TableColumnAlign;
  width?: TableColumnWidth;
  display?: TableColumnDisplay;
  suffix?: string;
  format?: TableColumnFormat;
  presentation?: FieldPresentationSchema;
};

export type ComputedTableColumnSchema = {
  type: "computed";
  computedValue: string;
  label?: string;
  align?: TableColumnAlign;
  width?: TableColumnWidth;
  display?: TableColumnDisplay;
  suffix?: string;
  format?: TableColumnFormat;
};

export type OperationControlTableColumnSchema = {
  type: "operationControl";
  operation?: string;
  operations?: string[];
  includeOrdering?: boolean;
  label?: string;
  align?: TableColumnAlign;
  width?: TableColumnWidth;
  display?: TableColumnDisplay;
  presentation?: TableOperationControlPresentation;
};

export type OrderingHandleTableColumnSchema = {
  type: "orderingHandle";
  label?: string;
  align?: TableColumnAlign;
  width?: TableColumnWidth;
  display?: TableColumnDisplay;
};

export type TableColumnSchema =
  | FieldTableColumnSchema
  | ReferenceFieldTableColumnSchema
  | ComputedTableColumnSchema
  | OperationControlTableColumnSchema
  | OrderingHandleTableColumnSchema;

export type TableOperationBindingSchema = {
  operation: string;
  label?: string;
  variant?: TableOperationControlVariant;
  availability?: TableOperationControlAvailabilitySchema;
  target?: TableEditRecordTargetSchema;
  editView?: string;
};

export type TableViewSchema = {
  entity: string;
  operations?: TableOperationBindingSchema[];
  ordering?: ResultOrderingSchema;
  columns: TableColumnSchema[];
};

export type CreateDefaultValueSchema =
  | {
      kind: "context";
      name: string;
    }
  | {
      kind: "literal";
      value: string | boolean | number;
    };

export type CollectionQuerySchema = {
  label: string;
  entity: string;
  expression: QueryExpression;
};

export type ComputedValueSchema = {
  entity: string;
  type: "number";
  expression: NumericExpression;
};

export type AggregateFunction = "count" | "sum" | "average" | "min" | "max";

export type AggregateValueSchema =
  | {
      kind: "field";
      field: string;
    }
  | {
      kind: "computed";
      computedValue: string;
    };

export type AggregateSchema = {
  query: string;
  function: AggregateFunction;
  value?: AggregateValueSchema;
};
export type ReadModelSchema = {
  computedValues?: KeyedDefinition<ComputedValueSchema>[];
  aggregates?: KeyedDefinition<AggregateSchema>[];
};
export type EntityUnionVariantSchema = {
  label: string;
  fields: string[];
  requiredFields?: string[];
};

export type EntityUnionSchema = {
  entity: string;
  discriminator: string;
  variants: KeyedDefinition<EntityUnionVariantSchema>[];
  fallback?: EntityUnionVariantSchema;
};
export type ViewFieldBindingSchema = ViewFieldSchema & {
  field: string;
};
export type CreateViewFieldBindingSchema = CreateViewFieldSchema & {
  field: string;
};
export type ContextSelectionTargetSchema = {
  kind: "selectContext";
  context: string;
  record: "self";
};
export type ViewVariantFieldsPresentationSchema = {
  presentation: "fields";
  fields: ViewFieldBindingSchema[];
};
export type ViewVariantContextLinkPresentationSchema = {
  presentation: "contextLink";
  labelField: string;
  target: ContextSelectionTargetSchema;
};

export type ItemViewVariantPresentationSchema =
  | ViewVariantFieldsPresentationSchema
  | ViewVariantContextLinkPresentationSchema;
export type EditViewVariantPresentationSchema = ViewVariantFieldsPresentationSchema;
export type CreateViewVariantFieldsPresentationSchema = {
  presentation: "fields";
  fields: CreateViewFieldBindingSchema[];
};
export type CreateViewVariantPresentationSchema = CreateViewVariantFieldsPresentationSchema;
export type ItemViewVariantBindingSchema = ItemViewVariantPresentationSchema & {
  variant: string;
};
export type CreateViewVariantBindingSchema = CreateViewVariantPresentationSchema & {
  variant: string;
};
export type EditViewVariantBindingSchema = EditViewVariantPresentationSchema & {
  variant: string;
};
export type BaseItemViewSchema = {
  entity: string;
  fields: ViewFieldBindingSchema[];
};
export type StaticItemViewSchema = BaseItemViewSchema & {
  union?: undefined;
  variants?: undefined;
  fallback?: undefined;
};
export type UnionItemViewSchema = BaseItemViewSchema & {
  union: string;
  variants: ItemViewVariantBindingSchema[];
  fallback?: ItemViewVariantPresentationSchema;
};
export type ItemViewSchema = StaticItemViewSchema | UnionItemViewSchema;
export type CountDisplaySchema = {
  type: "count";
  label?: string;
};

export type CollectionViewQuerySlotSchema = {
  query: string;
  label?: string;
  count?: CountDisplaySchema;
};

export type TreeBranchActionSchema = "leaf";

export type TreeBranchChildVariantSchema =
  | string
  | {
      variant: string;
      label?: string;
      placementValues?: Record<string, FieldVisibilityValue>;
    };

export type TreeBranchVariantPolicySchema =
  | TreeBranchActionSchema
  | {
      action?: TreeBranchActionSchema;
      children?: TreeBranchChildVariantSchema[];
    };

export type TreeBranchPolicySchema = {
  variants: Record<string, TreeBranchVariantPolicySchema>;
};

export type TreeCompositionOperationSchema = {
  createOperation?: string;
  removeOperation?: string;
};

export type CollectionResultSchema =
  | {
      type: "list";
      itemView: string;
      ordering?: ResultOrderingSchema;
    }
  | {
      type: "record";
      itemView: string;
    }
  | {
      type: "table";
      tableView: string;
      ordering?: ResultOrderingSchema;
      footer?: CollectionTableFooterSlotSchema[];
    }
  | {
      type: "tree";
      relationship: string;
      childField: string;
      childItemView: string;
      placementItemView?: string;
      ordering?: ResultOrderingSchema;
      branches?: TreeBranchPolicySchema;
      composition?: TreeCompositionOperationSchema;
      maxDepth?: number;
    };

export type CollectionTableFooterSlotSchema = {
  type: "aggregate";
  column: string;
  aggregate: string;
  label?: string;
  suffix?: string;
  format?: TableColumnFormat;
};

export type CollectionNavigationSchema = {
  primary: boolean;
};

export type CollectionContextPresentation = "tabs" | "listDetail";

export type CollectionContextNavigationGroupSchema = {
  label: string;
  query: string;
  createView?: string;
};

export type CollectionContextNavigationSchema = {
  placement: "sidebar";
  groups: CollectionContextNavigationGroupSchema[];
};

export type CollectionContextSchema = {
  name: string;
  entity: string;
  query: string;
  labelField: string;
  presentation: CollectionContextPresentation;
  navigation?: CollectionContextNavigationSchema;
  relationship?: string;
  createView?: string;
  itemView?: string;
};

/** Collection context input accepted before the presentation default is applied. */
export type CollectionContextSchemaSource = Omit<CollectionContextSchema, "presentation"> & {
  presentation?: CollectionContextPresentation;
};

export type CollectionOperationBindingSchema = {
  operation: string;
  label?: string;
  createView?: string;
  count?: CountDisplaySchema;
};

export type CollectionSummarySlotSchema = {
  type: "aggregate";
  aggregate: string;
  label?: string;
  suffix?: string;
  format?: TableColumnFormat;
};

export type CollectionViewSchema = {
  type: "collection";
  label: string;
  entity: string;
  navigation?: CollectionNavigationSchema;
  context?: CollectionContextSchema;
  queries: CollectionViewQuerySlotSchema[];
  defaultQuery: string;
  result: CollectionResultSchema;
  operations?: CollectionOperationBindingSchema[];
  summary?: CollectionSummarySlotSchema[];
};

export type CreateViewSchema = {
  type: "create";
  entity: string;
  fields: CreateViewFieldBindingSchema[];
  defaults?: Record<string, CreateDefaultValueSchema>;
} & (
  | {
      union?: undefined;
      variants?: undefined;
      fallback?: undefined;
    }
  | {
      union: string;
      variants: CreateViewVariantBindingSchema[];
      fallback?: CreateViewVariantPresentationSchema;
    }
);

export type EditViewSchema = {
  type: "edit";
  entity: string;
  fields: ViewFieldBindingSchema[];
} & (
  | {
      union?: undefined;
      variants?: undefined;
      fallback?: undefined;
    }
  | {
      union: string;
      variants: EditViewVariantBindingSchema[];
      fallback?: EditViewVariantPresentationSchema;
    }
);

export type ViewSchema = CollectionViewSchema | CreateViewSchema | EditViewSchema;

/** Collection view input accepted before context defaults are applied. */
export type CollectionViewSchemaSource = Omit<CollectionViewSchema, "context"> & {
  context?: CollectionContextSchemaSource;
};
export type ViewSchemaSource = CollectionViewSchemaSource | CreateViewSchema | EditViewSchema;
export type AppNavigationSchema = {
  primaryScreens?: string[];
};
export type ScreenAccessSchema = "anonymous" | "authenticated" | "owner";
export type CollectionScreenSectionSchema = {
  id: string;
  type: "collection";
  view: string;
  label?: string;
};

export type ScreenSectionSchema = CollectionScreenSectionSchema;

export type ScreenLayoutWidthSchema = "narrow" | "standard" | "wide";

export type StackScreenLayoutSchema = {
  type: "stack";
  width?: ScreenLayoutWidthSchema;
  sections: ScreenSectionSchema[];
};

export type ScreenLayoutSchema = StackScreenLayoutSchema;

export type WorkspaceScreenSchema = {
  type: "workspace";
  label: string;
  path?: string;
  access?: ScreenAccessSchema;
  layout: ScreenLayoutSchema;
};
export type ScreenSchema = WorkspaceScreenSchema;
export type ToOneRelationshipSchema = {
  kind: "toOne";
  label?: string;
  from: {
    entity: string;
    field: string;
  };
  to: {
    entity: string;
  };
  inverse?: string;
};

export type ToManyRelationshipSchema = {
  kind: "toMany";
  label?: string;
  from: {
    entity: string;
  };
  to: {
    entity: string;
    field: string;
  };
  inverse?: string;
};

export type ManyToManyRelationshipSchema = {
  kind: "manyToMany";
  label?: string;
  from: {
    entity: string;
  };
  to: {
    entity: string;
  };
  through: {
    entity: string;
    fromField: string;
    toField: string;
    uniqueConstraint?: string;
  };
  inverse?: string;
};

export type RelationshipSchema =
  | ToOneRelationshipSchema
  | ToManyRelationshipSchema
  | ManyToManyRelationshipSchema;

export type StateMachineTransitionSchema = {
  label: string;
  from: string[];
  to: string;
};

export type StateMachineTransitionEventFieldMappingsSchema = {
  sourceEntity: string;
  sourceRecordId: string;
  transitionKey: string;
  previousState: string;
  nextState: string;
  actorMode: string;
  occurredAt: string;
};

export type StateMachineTransitionEventSchema = {
  entity: string;
  fields: StateMachineTransitionEventFieldMappingsSchema;
};

export type StateMachineSchema = {
  field: string;
  initial: string;
  states?: string[];
  terminal?: string[];
  transitions: readonly KeyedDefinition<StateMachineTransitionSchema>[];
  event?: StateMachineTransitionEventSchema;
};
export type SchemaOperationActorKind = "admin" | "cliDeployer" | "owner" | "runner";
export type EntityOperationKind = "list" | "get" | "create" | "update" | "delete" | "command";
export type EntityOperationScope = "collection" | "record";
export type EntityOperationActorKind = SchemaOperationActorKind | "authenticated" | "anonymous";
export type EntityOperationFieldInputSchema = {
  field: string;
  required?: boolean;
  label?: string;
  mustBeTrue?: true;
};

export type EntityOperationInlineInputFieldSchema = PublicOperationInputFieldSchema;

export type EntityOperationInputFieldSchema =
  | EntityOperationFieldInputSchema
  | EntityOperationInlineInputFieldSchema;
export type EntityOperationInputContractSchema = {
  fields: KeyedDefinition<EntityOperationInputFieldSchema>[];
};
export type EntityOperationTargetSchema = {
  query: string;
};

export type CreateRecordEntityOperationEffectSchema = {
  type: "createRecord";
  entity?: string;
};

export type PatchRecordEntityOperationEffectSchema = {
  type: "patchRecord";
  entity?: string;
};

export type DeleteRecordEntityOperationEffectSchema = {
  type: "deleteRecord" | "tombstoneRecord";
  entity?: string;
};

export type OperationHandlerJoinSourceSchema = {
  field: string;
  query: string;
};

export type OperationHandlerJoinSchema = {
  left: OperationHandlerJoinSourceSchema;
  right: OperationHandlerJoinSourceSchema;
};

export type OperationHandlerInputStringRecordIdExpectation = {
  type: "stringRecordId";
  required: true;
};

export type OperationHandlerInputStringRecordIdArrayExpectation = {
  type: "stringRecordIdArray";
  required: true;
  nonEmpty: true;
  rejectDuplicates: true;
};

export type OperationHandlerInputScalarRecordValueMapExpectation = {
  type: "scalarRecordValueMap";
  required: boolean;
};

export type OperationHandlerInputTextExpectation = {
  type: "text";
  required: true;
};

export type OperationHandlerInputFieldExpectation =
  | OperationHandlerInputStringRecordIdExpectation
  | OperationHandlerInputStringRecordIdArrayExpectation
  | OperationHandlerInputScalarRecordValueMapExpectation
  | OperationHandlerInputTextExpectation;

export type OperationHandlerInputExpectation = {
  type: "object";
  required: true;
  fields: Record<string, OperationHandlerInputFieldExpectation>;
};

export type OperationHandlerCapabilities = {
  createAfterCreateHook: boolean;
  publicExecution: boolean;
  input?: OperationHandlerInputExpectation;
};

export type OperationHandlerKind =
  | "clear-completed"
  | "create-missing-join-records"
  | "create-selected-join-record"
  | "remove-selected-join-records"
  | "create-tree-child"
  | "remove-tree-placement"
  | "subscribe"
  | "transition-state";

export type OperationHandlerSelectionCapability =
  | "clearCompletedTargetCount"
  | "createMissingJoinRecords"
  | "createSelectedJoinRecord"
  | "removeSelectedJoinRecords"
  | "createTreeChild"
  | "removeTreePlacement"
  | "publicSubscribe"
  | "transitionState";

export type OperationHandlerKindBySelectionCapability = {
  clearCompletedTargetCount: "clear-completed";
  createMissingJoinRecords: "create-missing-join-records";
  createSelectedJoinRecord: "create-selected-join-record";
  removeSelectedJoinRecords: "remove-selected-join-records";
  createTreeChild: "create-tree-child";
  removeTreePlacement: "remove-tree-placement";
  publicSubscribe: "subscribe";
  transitionState: "transition-state";
};

export type ClearCompletedOperationHandlerConfigSchema = {
  query: string;
};

export type CreateMissingJoinRecordsOperationHandlerConfigSchema = {
  join: OperationHandlerJoinSchema;
};

export type CreateSelectedJoinRecordOperationHandlerConfigSchema = {
  relationship: string;
};

export type RemoveSelectedJoinRecordsOperationHandlerConfigSchema = {
  relationship: string;
};

export type CreateTreeChildOperationHandlerConfigSchema = {
  relationship: string;
  childField: string;
  orderField?: string;
};

export type RemoveTreePlacementOperationHandlerConfigSchema = {
  relationship: string;
};

export type SubscribeOperationHandlerConfigSchema = Record<string, never>;

export type TransitionStateOperationHandlerConfigSchema = {
  machine: string;
  transition: string;
  targetValues?: Record<string, RecordPlanGeneratedDateExpressionSchema>;
  sideEffects?: TransitionSideEffectRecordPlanSchema;
};

export type OperationHandlerConfigSchemaByKind = {
  "clear-completed": ClearCompletedOperationHandlerConfigSchema;
  "create-missing-join-records": CreateMissingJoinRecordsOperationHandlerConfigSchema;
  "create-selected-join-record": CreateSelectedJoinRecordOperationHandlerConfigSchema;
  "remove-selected-join-records": RemoveSelectedJoinRecordsOperationHandlerConfigSchema;
  "create-tree-child": CreateTreeChildOperationHandlerConfigSchema;
  "remove-tree-placement": RemoveTreePlacementOperationHandlerConfigSchema;
  subscribe: SubscribeOperationHandlerConfigSchema;
  "transition-state": TransitionStateOperationHandlerConfigSchema;
};

export type OperationHandlerEffectSchemaForKind<Kind extends OperationHandlerKind> = {
  type: "operationHandler";
  handler: Kind;
  config: OperationHandlerConfigSchemaByKind[Kind];
};

export type OperationHandlerEntityOperationEffectSchema = {
  [Kind in OperationHandlerKind]: OperationHandlerEffectSchemaForKind<Kind>;
}[OperationHandlerKind];

export type RecordPlanStepKind = "create" | "patch" | "delete" | "tombstone";

export type RecordPlanActorContextField = "mode" | "principalId";

export type RecordPlanSourceContextField = "protocol" | "route" | "host" | "path";

export type RecordPlanInputValueExpressionSchema = {
  kind: "input";
  field: string;
};

export type RecordPlanLiteralValueExpressionSchema = {
  kind: "literal";
  value: FieldValue;
};

export type RecordPlanGeneratedIdExpressionSchema = {
  kind: "generatedId";
  prefix?: string;
};

export type RecordPlanGeneratedCodeAlphabet =
  | "digits"
  | "upperAlpha"
  | "upperAlphaNumeric"
  | "upperAlphaNumericNoConfusables";

export type RecordPlanGeneratedCodeExpressionSchema = {
  kind: "generatedCode";
  alphabet: RecordPlanGeneratedCodeAlphabet;
  length?: number;
  groups?: number[];
  separator?: string;
  prefix?: string;
};

export type RecordPlanGeneratedTimestampExpressionSchema = {
  kind: "generatedTimestamp";
};

export type RecordPlanGeneratedDateExpressionSchema = {
  kind: "generatedDate";
  timeZone: string;
};

export type RecordPlanActorContextExpressionSchema = {
  kind: "actor";
  field: RecordPlanActorContextField;
};

export type RecordPlanSourceContextExpressionSchema = {
  kind: "source";
  field: RecordPlanSourceContextField;
};

export type RecordPlanStepIdOutputExpressionSchema = {
  kind: "stepOutput";
  step: string;
  output: "id";
};

export type RecordPlanStepFieldOutputExpressionSchema = {
  kind: "stepOutput";
  step: string;
  output: "field";
  field: string;
};

export type RecordPlanStepOutputExpressionSchema =
  | RecordPlanStepIdOutputExpressionSchema
  | RecordPlanStepFieldOutputExpressionSchema;

export type RecordPlanTargetRecordIdExpressionSchema = {
  kind: "targetRecordId";
};

export type RecordPlanTargetFieldExpressionSchema = {
  kind: "targetField";
  field: string;
};

export type RecordPlanRecordIdExpressionSchema =
  | RecordPlanInputValueExpressionSchema
  | RecordPlanLiteralValueExpressionSchema
  | RecordPlanGeneratedIdExpressionSchema
  | RecordPlanStepIdOutputExpressionSchema
  | RecordPlanTargetRecordIdExpressionSchema;

export type RecordPlanScalarValueExpressionSchema =
  | RecordPlanRecordIdExpressionSchema
  | RecordPlanGeneratedCodeExpressionSchema
  | RecordPlanGeneratedTimestampExpressionSchema
  | RecordPlanGeneratedDateExpressionSchema
  | RecordPlanActorContextExpressionSchema
  | RecordPlanSourceContextExpressionSchema
  | RecordPlanStepFieldOutputExpressionSchema
  | RecordPlanTargetFieldExpressionSchema;

export type RecordPlanReferenceValueExpressionSchema = {
  kind: "reference";
  entity: string;
  id: RecordPlanRecordIdExpressionSchema;
};

export type RecordPlanValueExpressionSchema =
  | RecordPlanScalarValueExpressionSchema
  | RecordPlanReferenceValueExpressionSchema;

export type RecordPlanCreateStepSchema = {
  name: string;
  kind: "create";
  entity: string;
  recordId?: RecordPlanRecordIdExpressionSchema;
  values: Record<string, RecordPlanValueExpressionSchema>;
};

export type RecordPlanPatchStepSchema = {
  name: string;
  kind: "patch";
  entity: string;
  recordId: RecordPlanRecordIdExpressionSchema;
  values: Record<string, RecordPlanValueExpressionSchema>;
};

export type RecordPlanDeleteStepSchema = {
  name: string;
  kind: "delete" | "tombstone";
  entity: string;
  recordId: RecordPlanRecordIdExpressionSchema;
};

export type RecordPlanStepSchema =
  | RecordPlanCreateStepSchema
  | RecordPlanPatchStepSchema
  | RecordPlanDeleteStepSchema;

export type RecordPlanEntityOperationEffectSchema = {
  type: "recordPlan";
  steps: RecordPlanStepSchema[];
};

export type TransitionSideEffectCreateStepSchema = {
  name: string;
  kind: "create";
  entity: string;
  recordId?: RecordPlanRecordIdExpressionSchema;
  values: Record<string, RecordPlanValueExpressionSchema>;
};

export type TransitionSideEffectRecordPlanSchema = {
  type: "recordPlan";
  steps: TransitionSideEffectCreateStepSchema[];
};

export type EntityOperationCommandEffectSchema =
  | OperationHandlerEntityOperationEffectSchema
  | RecordPlanEntityOperationEffectSchema;

export type EntityOperationCommandEffectType = EntityOperationCommandEffectSchema["type"];

export type EntityOperationEffectSchema =
  | CreateRecordEntityOperationEffectSchema
  | PatchRecordEntityOperationEffectSchema
  | DeleteRecordEntityOperationEffectSchema
  | EntityOperationCommandEffectSchema;

export type EntityOperationOutputContractSchema =
  | {
      type: "list";
      query: string;
      maxResults?: number;
    }
  | {
      type: "get";
    }
  | {
      type: "create";
    }
  | {
      type: "update";
    }
  | {
      type: "delete";
    }
  | {
      type: "command";
    };

export type EntityOperationIdempotencySchema = {
  required: boolean;
  source?: "caller" | "runtime";
};

export type EntityOperationAuditInputPolicy = "none" | "hash" | "summary" | "snapshot";

export type EntityOperationAuditSchema = {
  input: EntityOperationAuditInputPolicy;
};

export type EntityOperationPolicySchema = {
  actors: EntityOperationActorKind[];
  access?: OperationAccessPolicySchema;
  responseFields?: Partial<Record<EntityOperationActorKind, string[]>>;
  visible?: boolean;
};

export type EntityOperationSchema = {
  label?: string;
  kind: EntityOperationKind;
  scope: EntityOperationScope;
  input?: EntityOperationInputContractSchema;
  target?: EntityOperationTargetSchema;
  effect?: EntityOperationEffectSchema;
  output: EntityOperationOutputContractSchema;
  idempotency: EntityOperationIdempotencySchema;
  audit: EntityOperationAuditSchema;
  policy?: EntityOperationPolicySchema;
};

/**
 * Authored operation input accepted before parser-owned defaults are applied.
 *
 * Parsing supplies the operation output, built-in mutation effect,
 * idempotency policy, and audit policy when the operation kind permits their
 * omission.
 */
export type EntityOperationSchemaSource = Omit<
  EntityOperationSchema,
  "audit" | "effect" | "idempotency" | "output"
> & {
  audit?: EntityOperationAuditSchema;
  effect?: EntityOperationEffectSchema;
  idempotency?: EntityOperationIdempotencySchema;
  output?: EntityOperationOutputContractSchema;
};

export type UniqueConstraintSchema = {
  kind: "unique";
  fields: string[];
};
export type EntityConstraintSchema = UniqueConstraintSchema;
export type EntitySchema = {
  id: EntityId;
  label: string;
  fields: KeyedDefinition<FieldSchema>[];
  constraints?: KeyedDefinition<EntityConstraintSchema>[];
  stateMachines?: KeyedDefinition<StateMachineSchema>[];
  operations?: KeyedDefinition<EntityOperationSchema>[];
};
/** Entity input accepted before operation defaults are applied. */
export type EntitySchemaSource = Omit<EntitySchema, "operations"> & {
  operations?: KeyedDefinition<EntityOperationSchemaSource>[];
};
export type RuntimeSchemaRouteValidationSchema = {
  pathField: string;
  prefixField?: string;
  enabledField: string;
  routeKindField: string;
  packageCapabilityField: string;
  appInstallField?: string;
  reservedPaths?: string[];
  routeKindCapabilities: Record<string, string>;
};

export type RuntimeSchemaHistorySchema = {
  kind: "operationCreated" | "appendOnly";
};

export type RuntimeSchemaControlPlaneEntitySchema = {
  immutableFields?: string[];
  observedFields?: string[];
  secretReferenceFields?: string[];
  routeValidation?: RuntimeSchemaRouteValidationSchema;
  history?: RuntimeSchemaHistorySchema;
};

export type RuntimeSchemaControlPlaneSchema = {
  entities: Record<string, RuntimeSchemaControlPlaneEntitySchema>;
};

export type RuntimeSchemaMetadata = {
  owner: "runtime";
  controlPlane?: RuntimeSchemaControlPlaneSchema;
};
export type AppSchema = {
  version: 1;
  entities: KeyedDefinition<EntitySchema>[];
  relationships?: KeyedDefinition<RelationshipSchema>[];
  queries: KeyedDefinition<CollectionQuerySchema>[];
  readModels?: ReadModelSchema;
  unions?: KeyedDefinition<EntityUnionSchema>[];
  itemViews: KeyedDefinition<ItemViewSchema>[];
  tableViews: KeyedDefinition<TableViewSchema>[];
  views: KeyedDefinition<ViewSchema>[];
  screens: KeyedDefinition<ScreenSchema>[];
  navigation?: AppNavigationSchema;
  runtime?: RuntimeSchemaMetadata;
};
/** Derived ordered and keyed access to one schema definition registry. */
export type DefinitionIndex<
  Definition extends {
    key: string;
  },
> = {
  ordered: readonly Definition[];
  byKey: ReadonlyMap<string, Definition>;
};

export type AppSchemaDefinitionIndex = {
  entities: DefinitionIndex<KeyedDefinition<EntitySchema>>;
  entitiesById: ReadonlyMap<EntityId, KeyedDefinition<EntitySchema>>;
  relationships: DefinitionIndex<KeyedDefinition<RelationshipSchema>>;
  queries: DefinitionIndex<KeyedDefinition<CollectionQuerySchema>>;
  readModels: {
    computedValues: DefinitionIndex<KeyedDefinition<ComputedValueSchema>>;
    aggregates: DefinitionIndex<KeyedDefinition<AggregateSchema>>;
  };
  unions: DefinitionIndex<KeyedDefinition<EntityUnionSchema>>;
  itemViews: DefinitionIndex<KeyedDefinition<ItemViewSchema>>;
  tableViews: DefinitionIndex<KeyedDefinition<TableViewSchema>>;
  views: DefinitionIndex<KeyedDefinition<ViewSchema>>;
  screens: DefinitionIndex<KeyedDefinition<ScreenSchema>>;
  fieldsByEntity: ReadonlyMap<string, DefinitionIndex<KeyedDefinition<FieldSchema>>>;
  enumValuesByEntityField: ReadonlyMap<
    string,
    ReadonlyMap<string, DefinitionIndex<KeyedDefinition<EnumValueSchema>>>
  >;
  constraintsByEntity: ReadonlyMap<
    string,
    DefinitionIndex<KeyedDefinition<EntityConstraintSchema>>
  >;
  stateMachinesByEntity: ReadonlyMap<string, DefinitionIndex<KeyedDefinition<StateMachineSchema>>>;
  transitionsByEntityStateMachine: ReadonlyMap<
    string,
    ReadonlyMap<string, DefinitionIndex<KeyedDefinition<StateMachineTransitionSchema>>>
  >;
  operationsByEntity: ReadonlyMap<string, DefinitionIndex<KeyedDefinition<EntityOperationSchema>>>;
  operationInputFieldsByEntityOperation: ReadonlyMap<
    string,
    ReadonlyMap<string, DefinitionIndex<KeyedDefinition<EntityOperationInputFieldSchema>>>
  >;
  operationInputEnumValuesByEntityOperationField: ReadonlyMap<
    string,
    ReadonlyMap<string, ReadonlyMap<string, DefinitionIndex<KeyedDefinition<EnumValueSchema>>>>
  >;
  variantsByUnion: ReadonlyMap<string, DefinitionIndex<KeyedDefinition<EntityUnionVariantSchema>>>;
};

/**
 * Complete, portable App schema parser input.
 *
 * This source contract preserves authored omissions. `AppSchema` is the
 * parser-defaulted runtime model.
 */
export type AppSchemaSource = Omit<AppSchema, "entities" | "version" | "views"> & {
  version: 1;
  entities: KeyedDefinition<EntitySchemaSource>[];
  views: KeyedDefinition<ViewSchemaSource>[];
};

/** Runtime policy contribution owned by one authoring module. */
export type AppSchemaModuleRuntimeSource = {
  controlPlane: {
    entities: Record<string, RuntimeSchemaControlPlaneEntitySchema>;
  };
};

/**
 * Package-local contribution to a complete App schema source.
 *
 * Module identity and dependencies are authoring metadata. Each registry entry
 * is a whole declaration and is flattened by `composeAppSchema`.
 */
export type AppSchemaModuleSource = {
  key: string;
  requires?: readonly string[];
  entities?: AppSchemaSource["entities"];
  relationships?: NonNullable<AppSchemaSource["relationships"]>;
  queries?: AppSchemaSource["queries"];
  readModels?: NonNullable<AppSchemaSource["readModels"]>;
  unions?: NonNullable<AppSchemaSource["unions"]>;
  itemViews?: AppSchemaSource["itemViews"];
  tableViews?: AppSchemaSource["tableViews"];
  views?: AppSchemaSource["views"];
  screens?: AppSchemaSource["screens"];
  runtime?: AppSchemaModuleRuntimeSource;
};

/** Explicit root input for composing one complete App schema source. */
export type AppSchemaCompositionSource = {
  version: AppSchemaSource["version"];
  navigation?: AppSchemaSource["navigation"];
  runtime?: Pick<RuntimeSchemaMetadata, "owner">;
  modules: readonly AppSchemaModuleSource[];
};
