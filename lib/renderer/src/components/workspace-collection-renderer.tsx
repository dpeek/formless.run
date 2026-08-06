import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { Section } from "@astryxdesign/core/Section";
import { Selector, type SelectorOptionData } from "@astryxdesign/core/Selector";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { Heading, Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { memo, type ReactNode } from "react";
import type {
  CreateIntent,
  FieldIntent,
  ListIntent,
  ListOperationActionContract,
  OperationPresentationIntent,
  RecordResultIntent,
  ContextResultReference,
  MainResultReference,
  TableOperationActionContract,
  TableIntent,
  WorkspaceCollectionActionContract,
  WorkspaceCollectionActionGroupContract,
  WorkspaceCollectionContract,
  WorkspaceCollectionShellContract,
  WorkspaceContextContract,
  WorkspaceContextOptionContract,
  WorkspaceIntentHandler,
  WorkspaceIntentScope,
  WorkspaceQueryContract,
  WorkspaceQueryNavigationContract,
  WorkspaceResultContract,
  WorkspaceSummaryContract,
} from "@dpeek/formless-presentation/contract";
import { presentationReferenceKey } from "@dpeek/formless-presentation/host";
import { useResult, useWorkspaceIntentHandler } from "@dpeek/formless-presentation/host/react";
import { AstryxCreateSurfaceRenderer } from "./create-renderer.tsx";
import { AstryxListRenderer } from "./list-renderer.tsx";
import { AstryxRecordResultRenderer } from "./record-result-renderer.tsx";
import { AstryxTableRenderer } from "./table-renderer.tsx";
import {
  AstryxSubscribedTreeResultRenderer,
  AstryxTreeResultRenderer,
  dispatchAstryxWorkspaceTreeIntent,
} from "./tree-renderer.tsx";
import {
  AstryxOperationButton,
  AstryxOperationButtonWithProgress,
  AstryxOperationCompactStatus,
  AstryxOperationDestructiveConfirmation,
  AstryxOperationFeedback,
} from "./operation-renderer.tsx";

export function AstryxWorkspaceCollectionRenderer({
  collection,
  onIntent,
  scope,
}: {
  collection: WorkspaceCollectionContract;
  onIntent: WorkspaceIntentHandler;
  scope: WorkspaceIntentScope;
}) {
  const presentation = collection.presentation;

  return (
    <AstryxWorkspaceCollectionFrame
      collection={collection}
      contextResult={
        presentation.contextDetail ? (
          <AstryxWorkspaceRecordResult
            contextId={
              presentation.kind === "listDetail"
                ? presentation.selector.id
                : presentation.context?.id
            }
            onIntent={onIntent}
            recordResult={presentation.contextDetail}
            scope={scope}
          />
        ) : undefined
      }
      mainResult={
        <AstryxWorkspaceResult onIntent={onIntent} result={presentation.result} scope={scope} />
      }
      onIntent={onIntent}
      scope={scope}
    />
  );
}

export function AstryxSubscribedWorkspaceCollectionRenderer({
  collection,
  scope,
}: {
  collection: WorkspaceCollectionShellContract;
  scope: WorkspaceIntentScope;
}) {
  const onIntent = useWorkspaceIntentHandler();
  const presentation = collection.presentation;

  return (
    <AstryxWorkspaceCollectionFrame
      collection={collection}
      contextResult={
        presentation.contextDetail ? (
          <AstryxSubscribedWorkspaceContextResult
            contextId={
              presentation.kind === "listDetail"
                ? presentation.selector.id
                : presentation.context?.id
            }
            reference={presentation.contextDetail}
            scope={scope}
          />
        ) : undefined
      }
      mainResult={
        <AstryxSubscribedWorkspaceMainResult reference={presentation.result} scope={scope} />
      }
      onIntent={onIntent}
      scope={scope}
    />
  );
}

function AstryxWorkspaceCollectionFrame({
  collection,
  contextResult,
  mainResult,
  onIntent,
  scope,
}: {
  collection: WorkspaceCollectionContract | WorkspaceCollectionShellContract;
  contextResult?: ReactNode;
  mainResult: ReactNode;
  onIntent: WorkspaceIntentHandler;
  scope: WorkspaceIntentScope;
}) {
  if (collection.availability.state === "empty") {
    return (
      <EmptyState
        actions={
          collection.availability.emptyState.action ? (
            <AstryxWorkspaceCollectionAction
              action={collection.availability.emptyState.action}
              onIntent={onIntent}
              scope={scope}
            />
          ) : undefined
        }
        data-formless-astryx-workspace-empty-state={collection.availability.emptyState.id}
        description={collection.availability.emptyState.description}
        headingLevel={3}
        title={collection.availability.emptyState.title}
      />
    );
  }

  if (collection.availability.state === "unavailable") {
    return (
      <Banner
        container="card"
        data-formless-astryx-workspace-unavailable={collection.id}
        status="warning"
        title={collection.availability.message}
      />
    );
  }

  const presentation = collection.presentation;

  return (
    <VStack
      as="section"
      aria-label={collection.accessibilityLabel}
      data-formless-astryx-workspace-collection={collection.id}
      gap={6}
      width="100%"
    >
      {presentation.kind === "listDetail" ? (
        <Grid
          aria-label={presentation.accessibilityLabel}
          columns={{ max: 2, minWidth: 280 }}
          gap={6}
          role="group"
          width="100%"
        >
          <AstryxWorkspaceListDetailSelector
            context={presentation.selector}
            onIntent={onIntent}
            scope={scope}
          />
          <VStack gap={6} width="100%">
            {contextResult}
            <AstryxWorkspaceQueryNavigation
              navigation={presentation.queryNavigation}
              onIntent={onIntent}
            />
            <AstryxWorkspaceSummaries summaries={presentation.summaries} />
            {mainResult}
            <AstryxWorkspaceCollectionActions
              actions={presentation.actions}
              onIntent={onIntent}
              scope={scope}
            />
          </VStack>
        </Grid>
      ) : (
        <>
          {presentation.context ? (
            <AstryxWorkspaceOrdinaryContext
              context={presentation.context}
              detail={contextResult}
              onIntent={onIntent}
              scope={scope}
            />
          ) : null}
          <AstryxWorkspaceQueryNavigation
            navigation={presentation.queryNavigation}
            onIntent={onIntent}
          />
          <AstryxWorkspaceSummaries summaries={presentation.summaries} />
          {mainResult}
          <AstryxWorkspaceCollectionActions
            actions={presentation.actions}
            onIntent={onIntent}
            scope={scope}
          />
        </>
      )}
    </VStack>
  );
}

function AstryxWorkspaceQueryNavigation({
  navigation,
  onIntent,
}: {
  navigation?: WorkspaceQueryNavigationContract;
  onIntent: WorkspaceIntentHandler;
}) {
  if (!navigation) {
    return null;
  }

  const selectedId = navigation.items.find((item) => item.selected)?.id ?? "";

  return (
    <TabList
      aria-label={navigation.accessibilityLabel}
      hasDivider
      onChange={(itemId) => {
        const item = navigation.items.find((candidate) => candidate.id === itemId);
        if (item) {
          void dispatchAstryxWorkspaceQuerySelection(onIntent, item);
        }
      }}
      value={selectedId}
    >
      {navigation.items.map((item) => (
        <Tab
          aria-disabled={!item.availability.available || undefined}
          endContent={
            item.countText === undefined ? undefined : (
              <Badge aria-label={`${item.label} count`} label={item.countText} variant="neutral" />
            )
          }
          key={item.id}
          label={item.label}
          value={item.id}
        />
      ))}
    </TabList>
  );
}

function AstryxWorkspaceOrdinaryContext({
  context,
  detail,
  onIntent,
  scope,
}: {
  context: WorkspaceContextContract;
  detail?: ReactNode;
  onIntent: WorkspaceIntentHandler;
  scope: WorkspaceIntentScope;
}) {
  if (context.presentation === "externalNavigation") {
    return detail ?? null;
  }

  return (
    <Section padding={3} variant="muted" width="100%">
      <VStack gap={3} width="100%">
        {context.presentation === "localTabs" ? (
          <HStack align="center" gap={3} justify="between" width="100%" wrap="wrap">
            <AstryxWorkspaceContextTabs context={context} onIntent={onIntent} />
            <AstryxWorkspaceContextCreate context={context} onIntent={onIntent} scope={scope} />
          </HStack>
        ) : null}
        <AstryxWorkspaceContextAvailability context={context} />
        {detail}
      </VStack>
    </Section>
  );
}

function AstryxWorkspaceContextTabs({
  context,
  onIntent,
}: {
  context: WorkspaceContextContract;
  onIntent: WorkspaceIntentHandler;
}) {
  return (
    <TabList
      aria-label={context.accessibilityLabel}
      onChange={(optionId) => {
        const option = context.options.find((candidate) => candidate.id === optionId);
        if (option) {
          void dispatchAstryxWorkspaceContextSelection(onIntent, option);
        }
      }}
      size="sm"
      value={context.selectedOptionId ?? ""}
    >
      {context.options.map((option) => (
        <Tab
          aria-disabled={!option.availability.available || undefined}
          endContent={
            option.countText === undefined ? undefined : (
              <Badge
                aria-label={`${option.label} count`}
                label={option.countText}
                variant="neutral"
              />
            )
          }
          key={option.id}
          label={option.label}
          value={option.id}
        />
      ))}
    </TabList>
  );
}

function AstryxWorkspaceListDetailSelector({
  context,
  onIntent,
  scope,
}: {
  context: WorkspaceContextContract;
  onIntent: WorkspaceIntentHandler;
  scope: WorkspaceIntentScope;
}) {
  const options = context.options.map(astryxWorkspaceContextSelectorOption);

  return (
    <Card padding={4} width="100%">
      <VStack gap={3} width="100%">
        <HStack align="center" gap={2} justify="between" width="100%" wrap="wrap">
          <Heading level={3}>{context.label}</Heading>
          <AstryxWorkspaceContextCreate context={context} onIntent={onIntent} scope={scope} />
        </HStack>
        <AstryxWorkspaceContextAvailability context={context} />
        {context.availability.state === "ready" ? (
          <Selector
            isLabelHidden
            label={context.accessibilityLabel}
            onChange={(optionId) => {
              const option = context.options.find((candidate) => candidate.id === optionId);
              if (option) {
                void dispatchAstryxWorkspaceContextSelection(onIntent, option);
              }
            }}
            options={options}
            renderOption={(option) => {
              const contextOption = context.options.find(
                (candidate) => candidate.id === option.value,
              );

              return (
                <HStack align="center" gap={2} justify="between" width="100%">
                  <Text type="label">{option.label}</Text>
                  {contextOption?.countText === undefined ? null : (
                    <Badge
                      aria-label={`${contextOption.label} count`}
                      label={contextOption.countText}
                      variant="neutral"
                    />
                  )}
                </HStack>
              );
            }}
            size="sm"
            value={context.selectedOptionId}
            width="100%"
          />
        ) : null}
      </VStack>
    </Card>
  );
}

function AstryxWorkspaceContextAvailability({ context }: { context: WorkspaceContextContract }) {
  if (context.availability.state === "ready") {
    return null;
  }

  return context.availability.state === "empty" ? (
    <EmptyState
      data-formless-astryx-workspace-context-empty={context.availability.emptyState.id}
      description={context.availability.emptyState.description}
      headingLevel={3}
      isCompact
      title={context.availability.emptyState.title}
    />
  ) : (
    <Banner container="card" status="warning" title={context.availability.message} />
  );
}

function AstryxWorkspaceContextCreate({
  context,
  onIntent,
  scope,
}: {
  context: WorkspaceContextContract;
  onIntent: WorkspaceIntentHandler;
  scope: WorkspaceIntentScope;
}) {
  const action = context.createAction;
  if (!action) {
    return null;
  }

  return (
    <AstryxCreateSurfaceRenderer
      onFieldIntent={(fieldId, intent) =>
        dispatchAstryxWorkspaceFieldIntent(onIntent, scope, fieldId, intent, {
          contextId: context.id,
          surfaceId: action.surface.id,
        })
      }
      onIntent={(intent) =>
        dispatchAstryxWorkspaceCreateIntent(onIntent, scope, action.surface.id, intent, context.id)
      }
      surface={action.surface}
    />
  );
}

function AstryxWorkspaceSummaries({
  summaries,
}: {
  summaries: readonly WorkspaceSummaryContract[];
}) {
  const availableSummaries = summaries.filter((summary) => summary.availability.available);
  if (availableSummaries.length === 0) {
    return null;
  }

  return (
    <Grid aria-label="Collection summary" columns={{ max: 4, minWidth: 128 }} gap={3}>
      {availableSummaries.map((summary) => (
        <Card aria-label={`${summary.label} summary`} key={summary.id} padding={3} variant="muted">
          <VStack gap={1}>
            <Text color="secondary" display="block" type="supporting" weight="medium">
              {summary.label}
            </Text>
            <HStack align="end" gap={1}>
              <Text display="block" type="body" weight="semibold">
                {summary.displayValue}
              </Text>
              {summary.suffix ? (
                <Text color="secondary" display="block" type="supporting">
                  {summary.suffix}
                </Text>
              ) : null}
            </HStack>
          </VStack>
        </Card>
      ))}
    </Grid>
  );
}

function AstryxWorkspaceCollectionActions({
  actions,
  onIntent,
  scope,
}: {
  actions: WorkspaceCollectionActionGroupContract;
  onIntent: WorkspaceIntentHandler;
  scope: WorkspaceIntentScope;
}) {
  const orderedActions = [...actions.primary, ...actions.secondary];
  if (orderedActions.length === 0) {
    return null;
  }

  return (
    <HStack aria-label={actions.secondaryAccessibilityLabel} gap={2} role="group" wrap="wrap">
      {orderedActions.map((action) => (
        <AstryxWorkspaceCollectionAction
          action={action}
          key={workspaceCollectionActionId(action)}
          onIntent={onIntent}
          scope={scope}
        />
      ))}
    </HStack>
  );
}

function AstryxWorkspaceCollectionAction({
  action,
  onIntent,
  scope,
}: {
  action: WorkspaceCollectionActionContract;
  onIntent: WorkspaceIntentHandler;
  scope: WorkspaceIntentScope;
}) {
  if (action.kind === "createAction") {
    return (
      <AstryxCreateSurfaceRenderer
        onFieldIntent={(fieldId, intent) =>
          dispatchAstryxWorkspaceFieldIntent(onIntent, scope, fieldId, intent, {
            surfaceId: action.surface.id,
          })
        }
        onIntent={(intent) =>
          dispatchAstryxWorkspaceCreateIntent(onIntent, scope, action.surface.id, intent)
        }
        surface={action.surface}
      />
    );
  }

  const dispatch = (intent: OperationPresentationIntent) =>
    dispatchAstryxWorkspaceOperationIntent(onIntent, scope, action.control.id, intent);

  return (
    <VStack gap={2}>
      {action.control.progress ? (
        <AstryxOperationButtonWithProgress
          button={action.control.trigger}
          onIntent={dispatch}
          progress={action.control.progress}
        />
      ) : (
        <AstryxOperationButton button={action.control.trigger} onIntent={dispatch} />
      )}
      {action.control.confirmation ? (
        <AstryxOperationDestructiveConfirmation
          confirmation={action.control.confirmation}
          onIntent={dispatch}
        />
      ) : null}
      {action.control.status.status === "idle" ? null : (
        <AstryxOperationCompactStatus status={action.control.status} />
      )}
      <AstryxOperationFeedback feedback={action.control.feedback} />
    </VStack>
  );
}

const AstryxSubscribedWorkspaceMainResult = memo(function AstryxSubscribedWorkspaceMainResult({
  reference,
  scope,
}: {
  reference: MainResultReference;
  scope: WorkspaceIntentScope;
}) {
  if (reference.kind === "treeResultReference") {
    return <AstryxSubscribedTreeResultRenderer reference={reference} scope={scope} />;
  }

  return <AstryxSubscribedWorkspaceNonTreeMainResult reference={reference} scope={scope} />;
}, subscribedMainResultPropsEqual);

function AstryxSubscribedWorkspaceNonTreeMainResult({
  reference,
  scope,
}: {
  reference: Exclude<
    MainResultReference,
    {
      kind: "treeResultReference";
    }
  >;
  scope: WorkspaceIntentScope;
}) {
  const onIntent = useWorkspaceIntentHandler();
  const result = useResult(reference);

  return result ? (
    <AstryxWorkspaceResult onIntent={onIntent} result={result} scope={scope} />
  ) : null;
}

const AstryxSubscribedWorkspaceContextResult = memo(
  function AstryxSubscribedWorkspaceContextResult({
    contextId,
    reference,
    scope,
  }: {
    contextId?: string;
    reference: ContextResultReference;
    scope: WorkspaceIntentScope;
  }) {
    const onIntent = useWorkspaceIntentHandler();
    const result = useResult(reference);

    return result ? (
      <AstryxWorkspaceRecordResult
        contextId={contextId}
        onIntent={onIntent}
        recordResult={result}
        scope={scope}
      />
    ) : null;
  },
  subscribedContextResultPropsEqual,
);

function subscribedMainResultPropsEqual(
  previous: {
    reference: MainResultReference;
    scope: WorkspaceIntentScope;
  },
  next: {
    reference: MainResultReference;
    scope: WorkspaceIntentScope;
  },
) {
  return (
    presentationReferenceKey(previous.reference) === presentationReferenceKey(next.reference) &&
    workspaceScopesEqual(previous.scope, next.scope)
  );
}

function subscribedContextResultPropsEqual(
  previous: {
    contextId?: string;
    reference: ContextResultReference;
    scope: WorkspaceIntentScope;
  },
  next: {
    contextId?: string;
    reference: ContextResultReference;
    scope: WorkspaceIntentScope;
  },
) {
  return (
    previous.contextId === next.contextId &&
    presentationReferenceKey(previous.reference) === presentationReferenceKey(next.reference) &&
    workspaceScopesEqual(previous.scope, next.scope)
  );
}

function workspaceScopesEqual(previous: WorkspaceIntentScope, next: WorkspaceIntentScope) {
  return (
    previous.collectionId === next.collectionId &&
    previous.screenId === next.screenId &&
    previous.sectionId === next.sectionId
  );
}

function AstryxWorkspaceResult({
  onIntent,
  result,
  scope,
}: {
  onIntent: WorkspaceIntentHandler;
  result: WorkspaceResultContract;
  scope: WorkspaceIntentScope;
}) {
  if (result.kind === "list") {
    const emptyCreateSurfaceId =
      result.emptyState?.action?.kind === "createAction"
        ? result.emptyState.action.surface.id
        : undefined;
    return (
      <AstryxListRenderer
        list={result}
        onCreateFieldIntent={(fieldId, intent) =>
          emptyCreateSurfaceId === undefined
            ? undefined
            : dispatchAstryxWorkspaceFieldIntent(onIntent, scope, fieldId, intent, {
                surfaceId: emptyCreateSurfaceId,
              })
        }
        onCreateIntent={(intent) =>
          emptyCreateSurfaceId === undefined
            ? undefined
            : dispatchAstryxWorkspaceCreateIntent(onIntent, scope, emptyCreateSurfaceId, intent)
        }
        onFieldIntent={(itemId, field, intent) =>
          dispatchAstryxWorkspaceFieldIntent(onIntent, scope, field.fieldId, intent, {
            recordId: field.recordId ?? itemId,
            resultId: result.id,
          })
        }
        onListIntent={(intent) =>
          dispatchAstryxWorkspaceListIntent(onIntent, scope, result.id, intent)
        }
        onOperationIntent={(action, intent) => {
          const recordId = workspaceListActionRecordId(result, action);
          return dispatchAstryxWorkspaceOperationIntent(
            onIntent,
            scope,
            action.control.id,
            intent,
            recordId === undefined ? {} : { recordId, resultId: result.id },
          );
        }}
      />
    );
  }

  if (result.kind === "table") {
    const emptyCreateSurfaceId =
      result.emptyState?.action?.kind === "createAction"
        ? result.emptyState.action.surface.id
        : undefined;
    return (
      <AstryxTableRenderer
        onCreateFieldIntent={(fieldId, intent) =>
          emptyCreateSurfaceId === undefined
            ? undefined
            : dispatchAstryxWorkspaceFieldIntent(onIntent, scope, fieldId, intent, {
                surfaceId: emptyCreateSurfaceId,
              })
        }
        onCreateIntent={(intent) =>
          emptyCreateSurfaceId === undefined
            ? undefined
            : dispatchAstryxWorkspaceCreateIntent(onIntent, scope, emptyCreateSurfaceId, intent)
        }
        onFieldIntent={(contextId, fieldId, recordId, intent) =>
          dispatchAstryxWorkspaceFieldIntent(onIntent, scope, fieldId, intent, {
            contextId,
            ...(recordId === undefined ? {} : { recordId }),
            resultId: result.id,
          })
        }
        onOperationIntent={(action, intent) => {
          const recordId = workspaceTableActionRecordId(result, action);
          return dispatchAstryxWorkspaceOperationIntent(
            onIntent,
            scope,
            action.control.id,
            intent,
            recordId === undefined ? {} : { recordId, resultId: result.id },
          );
        }}
        onTableIntent={(intent) =>
          dispatchAstryxWorkspaceTableIntent(onIntent, scope, result.id, intent)
        }
        table={result}
      />
    );
  }

  if (result.kind === "recordResult") {
    return <AstryxWorkspaceRecordResult onIntent={onIntent} recordResult={result} scope={scope} />;
  }

  return (
    <AstryxTreeResultRenderer
      onCreateFieldIntent={(fieldId, intent) => {
        const action =
          result.availability.state === "empty" ? result.availability.emptyState.action : undefined;
        return action?.kind === "createAction"
          ? dispatchAstryxWorkspaceFieldIntent(onIntent, scope, fieldId, intent, {
              surfaceId: action.surface.id,
            })
          : undefined;
      }}
      onCreateIntent={(intent) => {
        const action =
          result.availability.state === "empty" ? result.availability.emptyState.action : undefined;
        return action?.kind === "createAction"
          ? dispatchAstryxWorkspaceCreateIntent(onIntent, scope, action.surface.id, intent)
          : undefined;
      }}
      onIntent={(intent) => {
        const action =
          result.availability.state === "empty" ? result.availability.emptyState.action : undefined;
        return action?.kind === "operationAction" &&
          intent.type === "treeOperation" &&
          intent.controlId === action.control.id
          ? dispatchAstryxWorkspaceOperationIntent(
              onIntent,
              scope,
              action.control.id,
              intent.intent,
            )
          : dispatchAstryxWorkspaceTreeIntent(onIntent, scope, result.id, intent);
      }}
      tree={result}
    />
  );
}

function AstryxWorkspaceRecordResult({
  contextId,
  onIntent,
  recordResult,
  scope,
}: {
  contextId?: string;
  onIntent: WorkspaceIntentHandler;
  recordResult: Extract<
    WorkspaceResultContract,
    {
      kind: "recordResult";
    }
  >;
  scope: WorkspaceIntentScope;
}) {
  return (
    <AstryxRecordResultRenderer
      onCreateFieldIntent={(fieldId, intent) => {
        const action = recordResult.emptyState?.action;
        return action?.kind === "createAction"
          ? dispatchAstryxWorkspaceFieldIntent(onIntent, scope, fieldId, intent, {
              surfaceId: action.surface.id,
            })
          : undefined;
      }}
      onCreateIntent={(intent) => {
        const action = recordResult.emptyState?.action;
        return action?.kind === "createAction"
          ? dispatchAstryxWorkspaceCreateIntent(onIntent, scope, action.surface.id, intent)
          : undefined;
      }}
      onIntent={(intent) =>
        intent.type === "recordResultOperationIntent" &&
        intent.recordId === undefined &&
        recordResult.emptyState?.action?.kind === "operationAction" &&
        intent.controlId === recordResult.emptyState.action.control.id
          ? dispatchAstryxWorkspaceOperationIntent(onIntent, scope, intent.controlId, intent.intent)
          : dispatchAstryxWorkspaceRecordResultIntent(
              onIntent,
              scope,
              recordResult.id,
              intent,
              contextId,
            )
      }
      recordResult={recordResult}
    />
  );
}

export function dispatchAstryxWorkspaceQuerySelection(
  handler: WorkspaceIntentHandler,
  item: WorkspaceQueryContract,
) {
  return item.availability.available ? handler(item.selectionIntent) : undefined;
}

export function dispatchAstryxWorkspaceContextSelection(
  handler: WorkspaceIntentHandler,
  option: WorkspaceContextOptionContract,
) {
  return option.availability.available ? handler(option.selectionIntent) : undefined;
}

export function dispatchAstryxWorkspaceCreateIntent(
  handler: WorkspaceIntentHandler,
  scope: WorkspaceIntentScope,
  surfaceId: string,
  intent: CreateIntent,
  contextId?: string,
) {
  return handler({
    ...scope,
    ...(contextId === undefined ? {} : { contextId }),
    intent,
    surfaceId,
    type: "workspaceCreate",
  });
}

export function dispatchAstryxWorkspaceFieldIntent(
  handler: WorkspaceIntentHandler,
  scope: WorkspaceIntentScope,
  fieldId: string,
  intent: FieldIntent,
  identities: {
    contextId?: string;
    recordId?: string;
    resultId?: string;
    surfaceId?: string;
  } = {},
) {
  return handler({
    ...scope,
    ...identities,
    fieldId,
    intent,
    type: "workspaceField",
  });
}

export function dispatchAstryxWorkspaceOperationIntent(
  handler: WorkspaceIntentHandler,
  scope: WorkspaceIntentScope,
  controlId: string,
  intent: OperationPresentationIntent,
  identities: {
    contextId?: string;
    recordId?: string;
    resultId?: string;
  } = {},
) {
  return handler({
    ...scope,
    ...identities,
    controlId,
    intent,
    type: "workspaceOperation",
  });
}

export function dispatchAstryxWorkspaceListIntent(
  handler: WorkspaceIntentHandler,
  scope: WorkspaceIntentScope,
  resultId: string,
  intent: ListIntent,
) {
  return handler({ ...scope, intent, resultId, type: "workspaceList" });
}

export function dispatchAstryxWorkspaceTableIntent(
  handler: WorkspaceIntentHandler,
  scope: WorkspaceIntentScope,
  resultId: string,
  intent: TableIntent,
) {
  return handler({ ...scope, intent, resultId, type: "workspaceTable" });
}

export function dispatchAstryxWorkspaceRecordResultIntent(
  handler: WorkspaceIntentHandler,
  scope: WorkspaceIntentScope,
  resultId: string,
  intent: RecordResultIntent,
  contextId?: string,
) {
  return handler({
    ...scope,
    ...(contextId === undefined ? {} : { contextId }),
    intent,
    resultId,
    type: "workspaceRecordResult",
  });
}

function astryxWorkspaceContextSelectorOption(
  option: WorkspaceContextOptionContract,
): SelectorOptionData {
  return {
    disabled: !option.availability.available,
    label: option.label,
    value: option.id,
  };
}

function workspaceCollectionActionId(action: WorkspaceCollectionActionContract) {
  return action.kind === "createAction" ? action.surface.id : action.control.id;
}
function workspaceListActionRecordId(
  list: Extract<
    WorkspaceResultContract,
    {
      kind: "list";
    }
  >,
  action: ListOperationActionContract,
) {
  return list.items.find((item) =>
    [...item.actions.primary, ...item.actions.secondary].includes(action),
  )?.id;
}
function workspaceTableActionRecordId(
  table: Extract<
    WorkspaceResultContract,
    {
      kind: "table";
    }
  >,
  action: TableOperationActionContract,
) {
  return table.rows.find((row) =>
    row.cells.some((cell) =>
      cell.contents.some(
        (content) =>
          content.kind === "actionGroup" &&
          [...content.primary, ...content.secondary].includes(action),
      ),
    ),
  )?.id;
}
