/**
 * Public Schema contract version.
 *
 * Version 1 covers the Schema package public contract surface for App schema
 * language declarations, entity-name boundaries, query expressions, read-model
 * expressions, canonical source schema hashes, and runtime-neutral helper
 * contracts. App records and runtime storage stay outside this package contract.
 *
 * This file is intentionally import-free so runtime-neutral schema entrypoints
 * can share declarations without adapter dependencies.
 */
export const SCHEMA_PUBLIC_CONTRACT_VERSION = 1;
/** Canonical SHA-256 digest of one complete portable App schema source. */
export type SourceSchemaHash = `sha256:${string}`;
/** One portable keyed definition used by an ordered schema registry. */
export type KeyedDefinition<Definition extends object> = Definition & {
  key: string;
};
/** Opaque stable identity for one logical App schema entity. */
export type EntityId = `entity_${string}`;
/** Opaque stable identity for one schema-defined human authorization role. */
export type AuthorizationRoleId = `role_${string}`;
/** One ordered schema-defined human authorization role. */
export type AuthorizationRoleSchema = {
  id: AuthorizationRoleId;
  label: string;
};
/** Authored form of one ordered schema-defined human authorization role. */
export type AuthorizationRoleSchemaSource = AuthorizationRoleSchema;
/** Root-owned Program authorization definitions in a parsed App schema. */
export type AppAuthorizationSchema = {
  roles: KeyedDefinition<AuthorizationRoleSchema>[];
};
/** Root-owned Program authorization definitions in App schema source. */
export type AppAuthorizationSchemaSource = {
  roles: KeyedDefinition<AuthorizationRoleSchemaSource>[];
};
/** Intrinsic human facts and exact trusted runtime channels accepted by access requirements. */
export type AccessActor =
  | "anonymous"
  | "authenticated"
  | "owner"
  | "runner"
  | "deployer"
  | "adminBearer";
/** Trusted runtime channels that are not assignable human roles. */
export type TrustedAccessActor = Extract<AccessActor, "runner" | "deployer" | "adminBearer">;
/** One direct intrinsic or trusted actor requirement. */
export type ActorAccessRequirement = {
  actor: AccessActor;
};
/** One direct minimum ordered human-role requirement. */
export type RoleAccessRequirement = {
  role: string;
};
/** One non-nested access alternative. */
export type DirectAccessRequirement = ActorAccessRequirement | RoleAccessRequirement;
/** Parsed access requirement for a schema-defined resource. */
export type AccessRequirement =
  | DirectAccessRequirement
  | {
      anyOf: DirectAccessRequirement[];
    };
/** Authored direct access requirement. */
export type DirectAccessRequirementSource = DirectAccessRequirement;
/** Authored access requirement parsed against one complete App schema. */
export type AccessRequirementSource =
  | DirectAccessRequirementSource
  | {
      anyOf: DirectAccessRequirementSource[];
    };
/** Intrinsic browser actors accepted by screen access requirements. */
export type BrowserAccessActor = Exclude<AccessActor, TrustedAccessActor>;
/** One direct browser-applicable screen access requirement. */
export type DirectScreenAccessRequirement =
  | {
      actor: BrowserAccessActor;
    }
  | RoleAccessRequirement;
/** Parsed browser-applicable access requirement for one screen. */
export type ScreenAccessRequirement =
  | DirectScreenAccessRequirement
  | {
      anyOf: DirectScreenAccessRequirement[];
    };
/** Authored direct browser-applicable screen access requirement. */
export type DirectScreenAccessRequirementSource = DirectScreenAccessRequirement;
/** Authored screen access requirement parsed against one complete App schema. */
export type ScreenAccessRequirementSource =
  | DirectScreenAccessRequirementSource
  | {
      anyOf: DirectScreenAccessRequirementSource[];
    };
/** Runtime facts supplied to the pure access evaluator. */
export type AccessCallerFacts =
  | {
      kind: "anonymous";
    }
  | {
      kind: "principal";
      active: boolean;
      owner: boolean;
      roleId?: AuthorizationRoleId;
    }
  | {
      kind: "trusted";
      actor: TrustedAccessActor;
    };
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

export type IconValueMode = "svgSource" | "iconIdWithSvgFallback" | "iconId";

export type TextFieldIconBehaviorSchema = {
  valueMode: IconValueMode;
};

export type TextFieldSchema = {
  type: "text";
  required: boolean;
  label?: string;
  format?: TextFieldFormat;
  suggestions?: string[];
  asset?: TextFieldAssetPolicySchema;
  icon?: TextFieldIconBehaviorSchema;
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
  mustBeTrue?: true;
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
export type TableColumnFormat = "plain" | "number" | "currency" | "percent";
export type TableOperationControlVariant = "default" | "destructive";
export type TableOperationControlAvailabilityState = "visible" | "hidden" | "disabled";

export type RecordLinkTarget = "sameTab" | "newTab";
export type RecordLinkMissingBehavior = "disable" | "omit";

export type RecordLinkValueSourceSchema =
  | {
      kind: "literal";
      value: FieldValue;
    }
  | {
      kind: "field";
      field: string;
    }
  | {
      kind: "referenceField";
      referenceField: string;
      targetEntity: string;
      field: string;
    };

export type RecordLinkValueSourceSchemaSource =
  | Exclude<RecordLinkValueSourceSchema, { kind: "referenceField" }>
  | Omit<Extract<RecordLinkValueSourceSchema, { kind: "referenceField" }>, "targetEntity">;

export type RecordLinkQueryParameterSchema = {
  name: string;
  source: RecordLinkValueSourceSchema;
  missing: RecordLinkMissingBehavior;
};

export type RecordLinkQueryParameterSchemaSource = Omit<
  RecordLinkQueryParameterSchema,
  "missing" | "source"
> & {
  source: RecordLinkValueSourceSchemaSource;
  missing?: RecordLinkMissingBehavior;
};

export type RecordLinkUrlDestinationSchema = {
  type: "url";
  base: string;
  query: RecordLinkQueryParameterSchema[];
};

export type RecordLinkUrlDestinationSchemaSource = Omit<RecordLinkUrlDestinationSchema, "query"> & {
  query: RecordLinkQueryParameterSchemaSource[];
};

export type RecordLinkSchema = {
  label: string;
  target: RecordLinkTarget;
  destination: RecordLinkUrlDestinationSchema;
};

export type RecordLinkSchemaSource = Omit<RecordLinkSchema, "destination"> & {
  destination: RecordLinkUrlDestinationSchemaSource;
};

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
};

export type TableColumnValueUnitSchema = {
  unitField: string;
};

export type FieldTableColumnSchema = {
  type: "field";
  field: string;
  label?: string;
  align?: TableColumnAlign;
  width?: TableColumnWidth;
  suffix?: string;
  format?: TableColumnFormat;
  valueUnit?: TableColumnValueUnitSchema;
};

export type ReferenceFieldTableColumnSchema = {
  type: "referenceField";
  referenceField: string;
  field: string;
  label?: string;
  align?: TableColumnAlign;
  width?: TableColumnWidth;
  suffix?: string;
  format?: TableColumnFormat;
};

export type ComputedTableColumnSchema = {
  type: "computed";
  computedValue: string;
  label?: string;
  align?: TableColumnAlign;
  width?: TableColumnWidth;
  suffix?: string;
  format?: TableColumnFormat;
};

export type OperationControlTableColumnSchema = {
  type: "operationControl";
  includeOrdering?: boolean;
};

export type OrderingHandleTableColumnSchema = {
  type: "orderingHandle";
};

export type LinkControlTableColumnSchema = {
  type: "linkControl";
  link: string;
  label?: string;
  align?: TableColumnAlign;
  width?: TableColumnWidth;
  display?: undefined;
};

export type TableColumnSchema =
  | FieldTableColumnSchema
  | ReferenceFieldTableColumnSchema
  | ComputedTableColumnSchema
  | LinkControlTableColumnSchema
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
  links?: KeyedDefinition<RecordLinkSchema>[];
  operations?: TableOperationBindingSchema[];
  ordering?: ResultOrderingSchema;
  columns: TableColumnSchema[];
};

export type TableViewSchemaSource = Omit<TableViewSchema, "links"> & {
  links?: KeyedDefinition<RecordLinkSchemaSource>[];
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
  interaction?: "edit" | "display";
};
export type ViewFieldBindingSchemaSource = Omit<ViewFieldBindingSchema, "editor"> & {
  editor?: FieldEditor;
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
export type ViewVariantFieldsPresentationSchemaSource = Omit<
  ViewVariantFieldsPresentationSchema,
  "fields"
> & {
  fields: ViewFieldBindingSchemaSource[];
};
export type ViewVariantContextLinkPresentationSchema = {
  presentation: "contextLink";
  labelField: string;
  target: ContextSelectionTargetSchema;
};

export type ItemViewVariantPresentationSchema =
  | ViewVariantFieldsPresentationSchema
  | ViewVariantContextLinkPresentationSchema;
export type ItemViewVariantPresentationSchemaSource =
  | ViewVariantFieldsPresentationSchemaSource
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
export type ItemViewVariantBindingSchemaSource = ItemViewVariantPresentationSchemaSource & {
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
  presentation?: undefined;
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
export type FieldItemViewSchema = StaticItemViewSchema | UnionItemViewSchema;
export type ItemViewSummaryFieldSchema = {
  field: string;
};
export type ItemViewSummarySlotsSchema = {
  title: ItemViewSummaryFieldSchema;
  subtitle?: ItemViewSummaryFieldSchema;
};
export type ItemViewSummaryPresentationSchema = {
  type: "summary";
  slots: ItemViewSummarySlotsSchema;
};
export type SummaryItemViewSchema = {
  entity: string;
  presentation: ItemViewSummaryPresentationSchema;
  fields?: undefined;
  union?: undefined;
  variants?: undefined;
  fallback?: undefined;
};
export type ItemViewSchema = FieldItemViewSchema | SummaryItemViewSchema;

export type BaseItemViewSchemaSource = Omit<BaseItemViewSchema, "fields"> & {
  fields: ViewFieldBindingSchemaSource[];
};
export type StaticItemViewSchemaSource = BaseItemViewSchemaSource & {
  union?: undefined;
  variants?: undefined;
  fallback?: undefined;
};
export type UnionItemViewSchemaSource = BaseItemViewSchemaSource & {
  union: string;
  variants: ItemViewVariantBindingSchemaSource[];
  fallback?: ItemViewVariantPresentationSchemaSource;
};
export type FieldItemViewSchemaSource = StaticItemViewSchemaSource | UnionItemViewSchemaSource;
export type SummaryItemViewSchemaSource = SummaryItemViewSchema;
export type ItemViewSchemaSource = FieldItemViewSchemaSource | SummaryItemViewSchemaSource;
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

export type CollectionSingletonScopeSchema = {
  name: string;
  entity: string;
  query: string;
  selection: "singleton";
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
  placement: "toolbar" | "emptyStatePrimary";
  label?: string;
  createView?: string;
  count?: CountDisplaySchema;
};

export type CollectionOperationBindingSchemaSource = Omit<
  CollectionOperationBindingSchema,
  "placement"
> & {
  placement?: CollectionOperationBindingSchema["placement"];
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
  scope?: CollectionSingletonScopeSchema;
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

/** Collection view input accepted before parser-owned defaults are applied. */
export type CollectionViewSchemaSource = Omit<CollectionViewSchema, "context" | "operations"> & {
  context?: CollectionContextSchemaSource;
  operations?: CollectionOperationBindingSchemaSource[];
};
export type ViewSchemaSource = CollectionViewSchemaSource | CreateViewSchema | EditViewSchema;
/** Stable renderer-neutral icon identities accepted by portable navigation. */
export const semanticIconIds = [
  "add",
  "archive",
  "calendar",
  "close",
  "confirm",
  "copy",
  "delete",
  "disclosure",
  "disclosureDown",
  "dragHandle",
  "edit",
  "indeterminate",
  "loading",
  "menu",
  "next",
  "previous",
  "publish",
  "remove",
  "select",
  "selectDown",
  "sort",
  "sync",
  "treeDisclosure",
  "upload",
] as const;
export type SemanticIconId = (typeof semanticIconIds)[number];
export type AppNavigationQueryCountBadgeSchema = {
  type: "queryCount";
  section: string;
};
export type AppNavigationScreenReferenceSchema =
  | string
  | {
      screen: string;
      badge: AppNavigationQueryCountBadgeSchema;
    };
export type AppNavigationSectionSchema = {
  key: string;
  label: string;
  icon?: SemanticIconId;
  screens: AppNavigationScreenReferenceSchema[];
};
export type AppNavigationEntrySchema =
  | AppNavigationScreenReferenceSchema
  | AppNavigationSectionSchema;
export type AppNavigationGroupSchema = {
  label: string;
  screens: AppNavigationEntrySchema[];
};
export type AppNavigationSchema =
  | {
      primaryScreens?: AppNavigationEntrySchema[];
      groups?: never;
    }
  | {
      primaryScreens?: never;
      groups: KeyedDefinition<AppNavigationGroupSchema>[];
    };
export type AppNavigationGroupSchemaSource = AppNavigationGroupSchema;
export type AppNavigationSchemaSource =
  | {
      primaryScreens?: AppNavigationEntrySchema[];
      groups?: never;
    }
  | {
      primaryScreens?: never;
      groups: KeyedDefinition<AppNavigationGroupSchemaSource>[];
    };
export type SelectedRecordDetailOperationBindingSchema = {
  operation: string;
  placement: "heading";
  label?: string;
};

export type SelectedRecordDetailRelationshipCreateBindingSchema = {
  operation: string;
  createView: string;
  placement: "heading";
  label?: string;
};

export type SelectedRecordDetailRecordSectionSchema = {
  id: string;
  type: "record";
  label?: string;
  itemView: string;
};

export type SelectedRecordDetailRelationshipResultSchema = {
  type: "table";
  tableView: string;
};

export type SelectedRecordDetailRelationshipSectionSchema = {
  id: string;
  type: "relationship";
  label?: string;
  relationship: string;
  query: string;
  result: SelectedRecordDetailRelationshipResultSchema;
  createAction?: SelectedRecordDetailRelationshipCreateBindingSchema;
  operations?: SelectedRecordDetailOperationBindingSchema[];
};

export type SelectedRecordRelationshipHierarchyOperationBindingSchema = {
  operation: string;
  label?: string;
};

export type SelectedRecordRelationshipHierarchyCreateBindingSchema = {
  kind: "create";
  operation: string;
  createView: string;
  label?: string;
  content?: SelectedRecordRelationshipHierarchyHeaderActionContentSchema;
};

export type SelectedRecordRelationshipHierarchyRecordOperationBindingSchema = {
  kind: "recordOperation";
  operation: string;
  label?: string;
  content?: SelectedRecordRelationshipHierarchyHeaderActionContentSchema;
};

export type SelectedRecordRelationshipHierarchyHeaderActionContentSchema =
  | { kind: "label" }
  | { kind: "iconAndLabel"; icon: SemanticIconId }
  | { kind: "iconOnly"; icon: SemanticIconId };

export type SelectedRecordRelationshipHierarchyHeaderActionBindingSchema =
  | SelectedRecordRelationshipHierarchyCreateBindingSchema
  | SelectedRecordRelationshipHierarchyRecordOperationBindingSchema;

export type SelectedRecordRelationshipHierarchyRelationshipSchema = {
  id: string;
  label?: string;
  relationship: string;
  itemView: string;
  links?: KeyedDefinition<RecordLinkSchema>[];
  headerActions?: SelectedRecordRelationshipHierarchyHeaderActionBindingSchema[];
  operations?: SelectedRecordRelationshipHierarchyOperationBindingSchema[];
  relationships?: SelectedRecordRelationshipHierarchyRelationshipSchema[];
};

export type SelectedRecordDetailRelationshipHierarchySectionSchema = {
  id: string;
  type: "relationshipHierarchy";
  label?: string;
  itemView: string;
  links?: KeyedDefinition<RecordLinkSchema>[];
  operations?: SelectedRecordRelationshipHierarchyOperationBindingSchema[];
  relationships: SelectedRecordRelationshipHierarchyRelationshipSchema[];
};

export type SelectedRecordDetailSectionSchema =
  | SelectedRecordDetailRecordSectionSchema
  | SelectedRecordDetailRelationshipSectionSchema
  | SelectedRecordDetailRelationshipHierarchySectionSchema;

export type SelectedRecordDetailSchema = {
  type: "selectedRecord";
  context: string;
  sections: SelectedRecordDetailSectionSchema[];
};

export type SelectedRecordDetailOperationBindingSchemaSource =
  SelectedRecordDetailOperationBindingSchema;
export type SelectedRecordDetailRelationshipCreateBindingSchemaSource =
  SelectedRecordDetailRelationshipCreateBindingSchema;
export type SelectedRecordDetailRecordSectionSchemaSource = SelectedRecordDetailRecordSectionSchema;
export type SelectedRecordDetailRelationshipResultSchemaSource =
  SelectedRecordDetailRelationshipResultSchema;
export type SelectedRecordDetailRelationshipSectionSchemaSource =
  SelectedRecordDetailRelationshipSectionSchema;
export type SelectedRecordRelationshipHierarchyOperationBindingSchemaSource =
  SelectedRecordRelationshipHierarchyOperationBindingSchema;
export type SelectedRecordRelationshipHierarchyCreateBindingSchemaSource =
  SelectedRecordRelationshipHierarchyCreateBindingSchema;
export type SelectedRecordRelationshipHierarchyRecordOperationBindingSchemaSource =
  SelectedRecordRelationshipHierarchyRecordOperationBindingSchema;
export type SelectedRecordRelationshipHierarchyHeaderActionContentSchemaSource =
  SelectedRecordRelationshipHierarchyHeaderActionContentSchema;
export type SelectedRecordRelationshipHierarchyHeaderActionBindingSchemaSource =
  SelectedRecordRelationshipHierarchyHeaderActionBindingSchema;
export type SelectedRecordRelationshipHierarchyRelationshipSchemaSource = Omit<
  SelectedRecordRelationshipHierarchyRelationshipSchema,
  "links" | "relationships"
> & {
  links?: KeyedDefinition<RecordLinkSchemaSource>[];
  relationships?: SelectedRecordRelationshipHierarchyRelationshipSchemaSource[];
};
export type SelectedRecordDetailRelationshipHierarchySectionSchemaSource = Omit<
  SelectedRecordDetailRelationshipHierarchySectionSchema,
  "links" | "relationships"
> & {
  links?: KeyedDefinition<RecordLinkSchemaSource>[];
  relationships: SelectedRecordRelationshipHierarchyRelationshipSchemaSource[];
};
export type SelectedRecordDetailSectionSchemaSource =
  | SelectedRecordDetailRecordSectionSchemaSource
  | SelectedRecordDetailRelationshipSectionSchemaSource
  | SelectedRecordDetailRelationshipHierarchySectionSchemaSource;
export type SelectedRecordDetailSchemaSource = Omit<SelectedRecordDetailSchema, "sections"> & {
  sections: SelectedRecordDetailSectionSchemaSource[];
};

export type CollectionScreenSectionSchema = {
  id: string;
  type: "collection";
  view: string;
  label?: string;
  query?: string;
  detail?: SelectedRecordDetailSchema;
};

export type ScreenSectionSchema = CollectionScreenSectionSchema;

export type CollectionScreenSectionSchemaSource = Omit<CollectionScreenSectionSchema, "detail"> & {
  detail?: SelectedRecordDetailSchemaSource;
};
export type ScreenSectionSchemaSource = CollectionScreenSectionSchemaSource;

export type ScreenLayoutWidthSchema = "narrow" | "standard" | "wide";
export type ScreenLayoutSurfaceSchema = "constrained" | "full";

export type ConstrainedStackScreenLayoutSchema = {
  type: "stack";
  surface: "constrained";
  width: ScreenLayoutWidthSchema;
  sections: ScreenSectionSchema[];
};

export type FullStackScreenLayoutSchema = {
  type: "stack";
  surface: "full";
  width?: never;
  sections: ScreenSectionSchema[];
};

export type StackScreenLayoutSchema =
  | ConstrainedStackScreenLayoutSchema
  | FullStackScreenLayoutSchema;
export type ScreenLayoutSchema = StackScreenLayoutSchema;
export type ConstrainedStackScreenLayoutSchemaSource = Omit<
  ConstrainedStackScreenLayoutSchema,
  "sections" | "surface" | "width"
> & {
  surface?: "constrained";
  width?: ScreenLayoutWidthSchema;
  sections: ScreenSectionSchemaSource[];
};
export type FullStackScreenLayoutSchemaSource = Omit<FullStackScreenLayoutSchema, "sections"> & {
  sections: ScreenSectionSchemaSource[];
};
export type StackScreenLayoutSchemaSource =
  | ConstrainedStackScreenLayoutSchemaSource
  | FullStackScreenLayoutSchemaSource;
export type ScreenLayoutSchemaSource = StackScreenLayoutSchemaSource;

export type WorkspaceScreenSchema = {
  type: "workspace";
  label: string;
  path?: string;
  access?: ScreenAccessRequirement;
  layout: ScreenLayoutSchema;
};
export type RuntimeScreenSchema = {
  type: "runtime";
  label: string;
  path?: string;
  access?: ScreenAccessRequirement;
};
export type ScreenSchema = WorkspaceScreenSchema | RuntimeScreenSchema;
export type WorkspaceScreenSchemaSource = Omit<WorkspaceScreenSchema, "access" | "layout"> & {
  access?: ScreenAccessRequirementSource;
  layout: ScreenLayoutSchemaSource;
};
export type RuntimeScreenSchemaSource = Omit<RuntimeScreenSchema, "access"> & {
  access?: ScreenAccessRequirementSource;
};
export type ScreenSchemaSource = WorkspaceScreenSchemaSource | RuntimeScreenSchemaSource;
/** Runtime target selected by one portable Program surface mount. */
export type SurfaceMountTarget = "browser" | "worker";
/** One parsed portable Program surface-mount declaration. */
export type SurfaceMountSchema = {
  target: SurfaceMountTarget;
  path: string;
  access: ScreenAccessRequirement;
};
/** Authored form of one portable Program surface-mount declaration. */
export type SurfaceMountSchemaSource = Omit<SurfaceMountSchema, "access"> & {
  access: ScreenAccessRequirementSource;
};
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
  | "tombstone-query-results"
  | "create-missing-join-records"
  | "create-selected-join-record"
  | "remove-selected-join-records"
  | "create-tree-child"
  | "remove-tree-placement"
  | "contact-subscription.subscribe"
  | "transition-state";

export type OperationHandlerSelectionCapability =
  | "tombstoneQueryResultsTargetCount"
  | "createMissingJoinRecords"
  | "createSelectedJoinRecord"
  | "removeSelectedJoinRecords"
  | "createTreeChild"
  | "removeTreePlacement"
  | "publicContactSubscription"
  | "transitionState";

export type OperationHandlerKindBySelectionCapability = {
  tombstoneQueryResultsTargetCount: "tombstone-query-results";
  createMissingJoinRecords: "create-missing-join-records";
  createSelectedJoinRecord: "create-selected-join-record";
  removeSelectedJoinRecords: "remove-selected-join-records";
  createTreeChild: "create-tree-child";
  removeTreePlacement: "remove-tree-placement";
  publicContactSubscription: "contact-subscription.subscribe";
  transitionState: "transition-state";
};

export type TombstoneQueryResultsOperationHandlerConfigSchema = {
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
  inheritFields?: string[];
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
  "tombstone-query-results": TombstoneQueryResultsOperationHandlerConfigSchema;
  "create-missing-join-records": CreateMissingJoinRecordsOperationHandlerConfigSchema;
  "create-selected-join-record": CreateSelectedJoinRecordOperationHandlerConfigSchema;
  "remove-selected-join-records": RemoveSelectedJoinRecordsOperationHandlerConfigSchema;
  "create-tree-child": CreateTreeChildOperationHandlerConfigSchema;
  "remove-tree-placement": RemoveTreePlacementOperationHandlerConfigSchema;
  "contact-subscription.subscribe": SubscribeOperationHandlerConfigSchema;
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
  actors?: EntityOperationActorKind[];
  access?: OperationAccessPolicySchema;
  responseFields?: Partial<Record<EntityOperationActorKind, string[]>>;
  visible?: boolean;
};

export type EntityOperationSchema = {
  label?: string;
  access?: AccessRequirement;
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
  "access" | "audit" | "effect" | "idempotency" | "output"
> & {
  access?: AccessRequirementSource;
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
export type RuntimeSchemaHistorySchema = {
  kind: "operationCreated" | "appendOnly";
};

export type RuntimeSchemaControlPlaneEntitySchema = {
  immutableFields?: string[];
  observedFields?: string[];
  secretReferenceFields?: string[];
  history?: RuntimeSchemaHistorySchema;
};

export type RuntimeSchemaControlPlaneSchema = {
  entities: Record<string, RuntimeSchemaControlPlaneEntitySchema>;
};

export type RuntimeSchemaMetadata = {
  owner: "runtime";
  controlPlane?: RuntimeSchemaControlPlaneSchema;
};
export type IconDefinitionSchema = {
  label: string;
  group?: string;
  source: string;
};
export type AppSchema = {
  version: 1;
  authorization?: AppAuthorizationSchema;
  icons?: KeyedDefinition<IconDefinitionSchema>[];
  entities: KeyedDefinition<EntitySchema>[];
  relationships?: KeyedDefinition<RelationshipSchema>[];
  queries: KeyedDefinition<CollectionQuerySchema>[];
  readModels?: ReadModelSchema;
  unions?: KeyedDefinition<EntityUnionSchema>[];
  itemViews: KeyedDefinition<ItemViewSchema>[];
  tableViews: KeyedDefinition<TableViewSchema>[];
  views: KeyedDefinition<ViewSchema>[];
  screens: KeyedDefinition<ScreenSchema>[];
  surfaceMounts?: KeyedDefinition<SurfaceMountSchema>[];
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
  authorization: {
    roles: DefinitionIndex<KeyedDefinition<AuthorizationRoleSchema>>;
    rolesById: ReadonlyMap<AuthorizationRoleId, KeyedDefinition<AuthorizationRoleSchema>>;
  };
  icons: DefinitionIndex<KeyedDefinition<IconDefinitionSchema>>;
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
  surfaceMounts: DefinitionIndex<KeyedDefinition<SurfaceMountSchema>>;
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
export type AppSchemaSource = Omit<
  AppSchema,
  | "authorization"
  | "entities"
  | "itemViews"
  | "navigation"
  | "screens"
  | "surfaceMounts"
  | "tableViews"
  | "version"
  | "views"
> & {
  version: 1;
  authorization?: AppAuthorizationSchemaSource;
  entities: KeyedDefinition<EntitySchemaSource>[];
  itemViews: KeyedDefinition<ItemViewSchemaSource>[];
  navigation?: AppNavigationSchemaSource;
  screens: KeyedDefinition<ScreenSchemaSource>[];
  surfaceMounts?: KeyedDefinition<SurfaceMountSchemaSource>[];
  tableViews: KeyedDefinition<TableViewSchemaSource>[];
  views: KeyedDefinition<ViewSchemaSource>[];
};

/** Runtime policy contribution owned by one authoring module. */
export type AppSchemaModuleRuntimeSource = {
  controlPlane: {
    entities: Record<string, RuntimeSchemaControlPlaneEntitySchema>;
  };
};

/** Authoring-only executable behavior required by one schema module. */
export type AppSchemaModuleRuntimeRequirements = {
  shared?: {
    recordAdapters?: readonly string[];
    operationAdapters?: readonly string[];
    bootstrapContributions?: readonly string[];
    createIdContributions?: readonly string[];
  };
  browser?: {
    projections?: readonly string[];
    surfaces?: readonly string[];
  };
  worker?: {
    publicReads?: readonly string[];
    surfaces?: readonly string[];
    afterCommit?: readonly string[];
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
  runtimeRequirements?: AppSchemaModuleRuntimeRequirements;
  icons?: NonNullable<AppSchemaSource["icons"]>;
  entities?: AppSchemaSource["entities"];
  relationships?: NonNullable<AppSchemaSource["relationships"]>;
  queries?: AppSchemaSource["queries"];
  readModels?: NonNullable<AppSchemaSource["readModels"]>;
  unions?: NonNullable<AppSchemaSource["unions"]>;
  itemViews?: AppSchemaSource["itemViews"];
  tableViews?: AppSchemaSource["tableViews"];
  views?: AppSchemaSource["views"];
  screens?: AppSchemaSource["screens"];
  surfaceMounts?: NonNullable<AppSchemaSource["surfaceMounts"]>;
  runtime?: AppSchemaModuleRuntimeSource;
};

/** Explicit root input for composing one complete App schema source. */
export type AppSchemaCompositionSource = {
  version: AppSchemaSource["version"];
  authorization?: AppSchemaSource["authorization"];
  navigation?: AppSchemaSource["navigation"];
  runtime?: Pick<RuntimeSchemaMetadata, "owner">;
  modules: readonly AppSchemaModuleSource[];
};
