import type {
  ActionTriggerContract,
  ActionTriggerIntent,
  CollectionEmptyStatePrimaryActionContract,
  CreateIntent,
  FieldIntent,
  ListIntent,
  OperationPresentationIntent,
  RecordResultContract,
  RecordResultIntent,
  TableIntent,
  TreeIntent,
  WorkspaceAvailability,
  WorkspaceCollectionActionContract,
  WorkspaceCollectionActionGroupContract,
  WorkspaceCollectionContract,
  WorkspaceCollectionPresentationContract,
  WorkspaceContextContract,
  WorkspaceContract,
  WorkspaceCreateIntent,
  WorkspaceExternalActionIntent,
  WorkspaceFieldIntent,
  WorkspaceIntentScope,
  WorkspaceItemAvailability,
  WorkspaceLinkActionContract,
  WorkspaceListIntent,
  WorkspaceOperationIntent,
  WorkspaceRecordResultIntent,
  WorkspaceResultContract,
  WorkspaceSectionContract,
  WorkspaceSummaryContract,
  WorkspaceTableIntent,
  WorkspaceTreeIntent,
  WorkspaceWidth,
} from "@dpeek/formless-presentation/contract";

export type GeneratedWorkspaceIdentityScope = WorkspaceIntentScope;

export type GeneratedWorkspaceScopedIdentityKind =
  | "collectionActions"
  | "context"
  | "contextOption"
  | "control"
  | "externalAction"
  | "field"
  | "listDetail"
  | "query"
  | "queryNavigation"
  | "result"
  | "summary"
  | "surface";

export type GeneratedWorkspaceAvailabilityProjection =
  | {
      state: "ready";
    }
  | {
      description?: string;
      state: "empty";
      title: string;
    }
  | {
      message: string;
      state: "unavailable";
    };

export type GeneratedWorkspaceItemAvailabilityProjection =
  | {
      available: true;
    }
  | {
      available: false;
      message: string;
    };

export type GeneratedWorkspaceQueryProjectionFacts = {
  availability?: GeneratedWorkspaceItemAvailabilityProjection;
  count?: number;
  id: string;
  label: string;
};

export type GeneratedWorkspaceContextOptionProjectionFacts = {
  availability?: GeneratedWorkspaceItemAvailabilityProjection;
  count?: number;
  id: string;
  label: string;
};

export type GeneratedWorkspaceContextProjectionFacts = {
  accessibilityLabel?: string;
  availability?: GeneratedWorkspaceAvailabilityProjection;
  createAction?: WorkspaceCollectionActionContract & { kind: "createAction" };
  detail?: RecordResultContract;
  id: string;
  label: string;
  options: readonly GeneratedWorkspaceContextOptionProjectionFacts[];
  presentation: WorkspaceContextContract["presentation"];
  selectedOptionId?: string;
};

export type GeneratedWorkspaceSummaryProjectionFacts = {
  availability?: GeneratedWorkspaceItemAvailabilityProjection;
  displayValue: string;
  id: string;
  label: string;
  suffix?: string;
};

export type GeneratedWorkspacePlacedCollectionAction = {
  action: WorkspaceCollectionActionContract;
  placement: "primary" | "secondary";
};

export type GeneratedWorkspaceExternalActionProjectionFacts = {
  action: ActionTriggerContract;
  id: string;
};

export type GeneratedWorkspaceCollectionProjectionFacts = {
  accessibilityLabel?: string;
  actions?: readonly GeneratedWorkspacePlacedCollectionAction[];
  availability?: GeneratedWorkspaceAvailabilityProjection;
  context?: GeneratedWorkspaceContextProjectionFacts;
  emptyStatePrimaryAction?: CollectionEmptyStatePrimaryActionContract;
  id: string;
  label: string;
  layout?: "ordinary" | "listDetail";
  queries: readonly GeneratedWorkspaceQueryProjectionFacts[];
  queryNavigationAccessibilityLabel?: string;
  result: WorkspaceResultContract;
  secondaryActionsAccessibilityLabel?: string;
  selectedQueryId?: string;
  summaries?: readonly GeneratedWorkspaceSummaryProjectionFacts[];
};

export type GeneratedWorkspaceSectionProjectionFacts = {
  accessibilityLabel?: string;
  actions?: readonly GeneratedWorkspaceExternalActionProjectionFacts[];
  collection: GeneratedWorkspaceCollectionProjectionFacts;
  id: string;
  label: string;
};

export type ProjectGeneratedWorkspaceContractOptions = {
  accessibilityLabel?: string;
  actions?: readonly WorkspaceLinkActionContract[];
  id: string;
  label: string;
  sections: readonly GeneratedWorkspaceSectionProjectionFacts[];
  width: WorkspaceWidth;
};

export function generatedWorkspaceScreenId(screenId: string): string {
  return `workspace:${screenId}`;
}

export function generatedWorkspaceSectionId(screenId: string, sectionId: string): string {
  return `${screenId}:section:${sectionId}`;
}

export function generatedWorkspaceCollectionId(sectionId: string, collectionId: string): string {
  return `${sectionId}:collection:${collectionId}`;
}

export function generatedWorkspaceScopedId(
  scope: GeneratedWorkspaceIdentityScope,
  kind: GeneratedWorkspaceScopedIdentityKind,
  localId: string,
): string {
  return `${scope.collectionId}:${kind}:${localId}`;
}

export function projectGeneratedWorkspaceContract({
  accessibilityLabel,
  actions = [],
  id,
  label,
  sections,
  width,
}: ProjectGeneratedWorkspaceContractOptions): WorkspaceContract {
  const screenId = generatedWorkspaceScreenId(id);
  const headingVisibility = sections.length === 1 ? "hidden" : "visible";

  return {
    accessibilityLabel: accessibilityLabel ?? label,
    actions,
    id: screenId,
    kind: "workspace",
    label,
    sections: sections.map((section) =>
      projectGeneratedWorkspaceSection({
        headingVisibility,
        screenId,
        section,
      }),
    ),
    width,
  };
}

export function projectGeneratedWorkspaceSection({
  headingVisibility,
  screenId,
  section,
}: {
  headingVisibility: WorkspaceSectionContract["headingVisibility"];
  screenId: string;
  section: GeneratedWorkspaceSectionProjectionFacts;
}): WorkspaceSectionContract {
  const sectionId = generatedWorkspaceSectionId(screenId, section.id);
  const collectionId = generatedWorkspaceCollectionId(sectionId, section.collection.id);
  const scope = { collectionId, screenId, sectionId };

  return {
    accessibilityLabel: section.accessibilityLabel ?? section.label,
    actions: (section.actions ?? []).map(({ action, id }) => ({
      action,
      id: generatedWorkspaceScopedId(scope, "externalAction", id),
      kind: "workspaceExternalAction",
    })),
    collection: projectGeneratedWorkspaceCollection({
      collection: section.collection,
      scope,
    }),
    headingVisibility,
    id: sectionId,
    kind: "workspaceSection",
    label: section.label,
  };
}

export function projectGeneratedWorkspaceCollection({
  collection,
  scope,
}: {
  collection: GeneratedWorkspaceCollectionProjectionFacts;
  scope: GeneratedWorkspaceIdentityScope;
}): WorkspaceCollectionContract {
  const selectedQueryId = projectSelectedQueryId(scope, collection);
  const queryNavigation = projectGeneratedWorkspaceQueryNavigation({
    accessibilityLabel:
      collection.queryNavigationAccessibilityLabel ?? `${collection.label} queries`,
    queries: collection.queries,
    scope,
    selectedQueryId,
  });
  const context =
    collection.context === undefined
      ? undefined
      : projectGeneratedWorkspaceContext({ context: collection.context, scope });
  const actions = projectGeneratedWorkspaceCollectionActions({
    actions: collection.actions ?? [],
    scope,
    secondaryAccessibilityLabel:
      collection.secondaryActionsAccessibilityLabel ?? `More ${collection.label} actions`,
  });
  const summaries = (collection.summaries ?? []).map((summary) =>
    projectGeneratedWorkspaceSummary({ scope, summary }),
  );
  const commonPresentation = {
    actions,
    ...(queryNavigation === undefined ? {} : { queryNavigation }),
    result: collection.result,
    summaries,
  };
  const layout = collection.layout ?? "ordinary";
  let presentation: WorkspaceCollectionPresentationContract;

  if (layout === "listDetail") {
    if (context?.presentation !== "localListDetail" || collection.context === undefined) {
      throw new Error("List-detail workspace collections require a local list-detail context.");
    }

    presentation = {
      accessibilityLabel: `${collection.context.label} list detail`,
      ...commonPresentation,
      ...(collection.context.detail === undefined
        ? {}
        : { contextDetail: collection.context.detail }),
      id: generatedWorkspaceScopedId(scope, "listDetail", collection.context.id),
      kind: "listDetail",
      selector: { ...context, presentation: "localListDetail" },
    };
  } else {
    presentation = {
      ...commonPresentation,
      ...(context === undefined ? {} : { context }),
      ...(collection.context?.detail === undefined
        ? {}
        : { contextDetail: collection.context.detail }),
      kind: "ordinary",
    };
  }

  return {
    accessibilityLabel: collection.accessibilityLabel ?? collection.label,
    availability: projectGeneratedWorkspaceAvailability({
      availability: collection.availability ?? { state: "ready" },
      ...(collection.emptyStatePrimaryAction === undefined
        ? {}
        : { emptyStatePrimaryAction: collection.emptyStatePrimaryAction }),
      id: `${collection.id}:availability`,
      scope,
    }),
    id: scope.collectionId,
    kind: "workspaceCollection",
    label: collection.label,
    presentation,
    selectedQueryId,
  };
}

export function projectGeneratedWorkspaceQueryNavigation({
  accessibilityLabel,
  queries,
  scope,
  selectedQueryId,
}: {
  accessibilityLabel: string;
  queries: readonly GeneratedWorkspaceQueryProjectionFacts[];
  scope: GeneratedWorkspaceIdentityScope;
  selectedQueryId: string | null;
}) {
  if (queries.length <= 1) {
    return undefined;
  }

  return {
    accessibilityLabel,
    id: generatedWorkspaceScopedId(scope, "queryNavigation", "navigation"),
    items: queries.map((query) => {
      const id = generatedWorkspaceScopedId(scope, "query", query.id);

      return {
        availability: projectGeneratedWorkspaceItemAvailability(query.availability),
        ...(query.count === undefined
          ? {}
          : { countText: formatGeneratedWorkspaceCount(query.count) }),
        id,
        kind: "workspaceQuery" as const,
        label: query.label,
        selected: id === selectedQueryId,
        selectionIntent: {
          ...scope,
          queryId: id,
          type: "workspaceQuerySelection" as const,
        },
      };
    }),
    kind: "workspaceQueryNavigation" as const,
  };
}

export function projectGeneratedWorkspaceContext({
  context,
  scope,
}: {
  context: GeneratedWorkspaceContextProjectionFacts;
  scope: GeneratedWorkspaceIdentityScope;
}): WorkspaceContextContract {
  const contextId = generatedWorkspaceScopedId(scope, "context", context.id);
  const selectedOptionId =
    context.selectedOptionId === undefined
      ? undefined
      : generatedWorkspaceContextOptionId(scope, context.id, context.selectedOptionId);
  const availability =
    context.availability ??
    (context.options.length === 0
      ? {
          state: "empty" as const,
          title: `No ${context.label.toLowerCase()} records yet.`,
        }
      : { state: "ready" as const });

  if (
    availability.state === "ready" &&
    (selectedOptionId === undefined ||
      !context.options.some(
        (option) =>
          generatedWorkspaceContextOptionId(scope, context.id, option.id) === selectedOptionId,
      ))
  ) {
    throw new Error("Ready workspace contexts require a selected available option.");
  }

  return {
    accessibilityLabel: context.accessibilityLabel ?? `${context.label} records`,
    availability: projectGeneratedWorkspaceAvailability({
      availability,
      id: `${context.id}:availability`,
      scope,
    }),
    ...(context.createAction === undefined ? {} : { createAction: context.createAction }),
    id: contextId,
    kind: "workspaceContext",
    label: context.label,
    options: context.options.map((option) => {
      const id = generatedWorkspaceContextOptionId(scope, context.id, option.id);

      return {
        availability: projectGeneratedWorkspaceItemAvailability(option.availability),
        ...(option.count === undefined
          ? {}
          : { countText: formatGeneratedWorkspaceCount(option.count) }),
        id,
        kind: "workspaceContextOption",
        label: option.label,
        selected: id === selectedOptionId,
        selectionIntent: {
          ...scope,
          contextId,
          contextOptionId: id,
          type: "workspaceContextSelection",
        },
      };
    }),
    presentation: context.presentation,
    ...(selectedOptionId === undefined ? {} : { selectedOptionId }),
  };
}

export function projectGeneratedWorkspaceSummary({
  scope,
  summary,
}: {
  scope: GeneratedWorkspaceIdentityScope;
  summary: GeneratedWorkspaceSummaryProjectionFacts;
}): WorkspaceSummaryContract {
  return {
    availability: projectGeneratedWorkspaceItemAvailability(summary.availability),
    displayValue: summary.displayValue,
    id: generatedWorkspaceScopedId(scope, "summary", summary.id),
    kind: "workspaceSummary",
    label: summary.label,
    ...(summary.suffix === undefined ? {} : { suffix: summary.suffix }),
  };
}

export function projectGeneratedWorkspaceCollectionActions({
  actions,
  scope,
  secondaryAccessibilityLabel,
}: {
  actions: readonly GeneratedWorkspacePlacedCollectionAction[];
  scope: GeneratedWorkspaceIdentityScope;
  secondaryAccessibilityLabel: string;
}): WorkspaceCollectionActionGroupContract {
  return {
    id: generatedWorkspaceScopedId(scope, "collectionActions", "actions"),
    kind: "workspaceCollectionActions",
    primary: actions.filter(({ placement }) => placement === "primary").map(({ action }) => action),
    secondary: actions
      .filter(({ placement }) => placement === "secondary")
      .map(({ action }) => action),
    secondaryAccessibilityLabel,
  };
}

export function projectGeneratedWorkspaceAvailability({
  availability,
  emptyStatePrimaryAction,
  id,
  scope,
}: {
  availability: GeneratedWorkspaceAvailabilityProjection;
  emptyStatePrimaryAction?: CollectionEmptyStatePrimaryActionContract;
  id: string;
  scope: GeneratedWorkspaceIdentityScope;
}): WorkspaceAvailability {
  if (availability.state === "empty") {
    return {
      emptyState: {
        ...(emptyStatePrimaryAction === undefined ? {} : { action: emptyStatePrimaryAction }),
        ...(availability.description === undefined
          ? {}
          : { description: availability.description }),
        id: generatedWorkspaceScopedId(scope, "result", `${id}:empty`),
        kind: "workspaceEmptyState",
        title: availability.title,
      },
      state: "empty",
    };
  }

  return availability;
}

export function formatGeneratedWorkspaceCount(count: number): string {
  return String(count);
}

export function projectGeneratedWorkspaceExternalActionIntent(
  scope: WorkspaceIntentScope,
  actionId: string,
  intent: ActionTriggerIntent,
): WorkspaceExternalActionIntent {
  return {
    ...scope,
    actionId,
    controlId: intent.controlId,
    intent,
    type: "workspaceExternalAction",
  };
}

export function projectGeneratedWorkspaceCreateIntent(
  scope: WorkspaceIntentScope,
  surfaceId: string,
  intent: CreateIntent,
  contextId?: string,
): WorkspaceCreateIntent {
  return {
    ...scope,
    ...(contextId === undefined ? {} : { contextId }),
    intent,
    surfaceId,
    type: "workspaceCreate",
  };
}

export function projectGeneratedWorkspaceOperationIntent(
  scope: WorkspaceIntentScope,
  controlId: string,
  intent: OperationPresentationIntent,
  options: Pick<WorkspaceOperationIntent, "contextId" | "recordId" | "resultId"> = {},
): WorkspaceOperationIntent {
  return {
    ...scope,
    ...definedWorkspaceIntentOptions(options),
    controlId,
    intent,
    type: "workspaceOperation",
  };
}

export function projectGeneratedWorkspaceFieldIntent(
  scope: WorkspaceIntentScope,
  fieldId: string,
  intent: FieldIntent,
  options: Pick<WorkspaceFieldIntent, "contextId" | "recordId" | "resultId" | "surfaceId"> = {},
): WorkspaceFieldIntent {
  return {
    ...scope,
    ...definedWorkspaceIntentOptions(options),
    fieldId,
    intent,
    type: "workspaceField",
  };
}

export function projectGeneratedWorkspaceListIntent(
  scope: WorkspaceIntentScope,
  resultId: string,
  intent: ListIntent,
): WorkspaceListIntent {
  return { ...scope, intent, resultId, type: "workspaceList" };
}

export function projectGeneratedWorkspaceTableIntent(
  scope: WorkspaceIntentScope,
  resultId: string,
  intent: TableIntent,
): WorkspaceTableIntent {
  return { ...scope, intent, resultId, type: "workspaceTable" };
}

export function projectGeneratedWorkspaceRecordResultIntent(
  scope: WorkspaceIntentScope,
  resultId: string,
  intent: RecordResultIntent,
  contextId?: string,
): WorkspaceRecordResultIntent {
  return {
    ...scope,
    ...(contextId === undefined ? {} : { contextId }),
    intent,
    resultId,
    type: "workspaceRecordResult",
  };
}

export function projectGeneratedWorkspaceTreeIntent(
  scope: WorkspaceIntentScope,
  resultId: string,
  intent: TreeIntent,
): WorkspaceTreeIntent {
  return { ...scope, intent, resultId, type: "workspaceTree" };
}

function projectSelectedQueryId(
  scope: GeneratedWorkspaceIdentityScope,
  collection: GeneratedWorkspaceCollectionProjectionFacts,
): string | null {
  if (collection.selectedQueryId === undefined) {
    if (collection.availability?.state === "unavailable" && collection.queries.length === 0) {
      return null;
    }
    throw new Error("Ready workspace collections require a selected query.");
  }

  if (!collection.queries.some((query) => query.id === collection.selectedQueryId)) {
    throw new Error("The selected workspace query must be present in the ordered query facts.");
  }

  return generatedWorkspaceScopedId(scope, "query", collection.selectedQueryId);
}

function generatedWorkspaceContextOptionId(
  scope: GeneratedWorkspaceIdentityScope,
  contextId: string,
  optionId: string,
): string {
  return generatedWorkspaceScopedId(scope, "contextOption", `${contextId}:${optionId}`);
}

function projectGeneratedWorkspaceItemAvailability(
  availability: GeneratedWorkspaceItemAvailabilityProjection | undefined,
): WorkspaceItemAvailability {
  return availability ?? { available: true };
}

function definedWorkspaceIntentOptions<T extends Record<string, string | undefined>>(
  options: T,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(options).filter((entry): entry is [string, string] => entry[1] !== undefined),
  ) as Partial<T>;
}
