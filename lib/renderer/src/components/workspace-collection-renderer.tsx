import * as stylex from "@stylexjs/stylex";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { List, ListItem } from "@astryxdesign/core/List";
import { Section } from "@astryxdesign/core/Section";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { Heading, Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { borderVars, colorVars } from "@astryxdesign/core/theme/tokens.stylex";
import { memo, type ReactNode } from "react";
import type {
  CreateIntent,
  FieldIntent,
  ListIntent,
  ListOperationActionContract,
  OperationPresentationIntent,
  OperationControlContract,
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
  WorkspaceSelectedRecordContract,
  WorkspaceSelectedRecordSectionContract,
  WorkspaceSelectedRecordSectionShellContract,
  WorkspaceSelectedRecordShellContract,
  WorkspaceSurface,
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
  surface = "constrained",
}: {
  collection: WorkspaceCollectionContract;
  onIntent: WorkspaceIntentHandler;
  scope: WorkspaceIntentScope;
  surface?: WorkspaceSurface;
}) {
  const presentation = collection.presentation;
  const treeOwnsContextDetail =
    presentation.result.kind === "treeResult" &&
    presentation.result.presentation === "inlineEditor";

  return (
    <AstryxWorkspaceCollectionFrame
      collection={collection}
      contextResult={
        presentation.contextDetail && !treeOwnsContextDetail ? (
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
        <AstryxWorkspaceResult
          listSelection={selectedRecordListSelection(presentation, onIntent)}
          onIntent={onIntent}
          result={presentation.result}
          scope={scope}
        />
      }
      onIntent={onIntent}
      selectedRecordDetail={
        presentation.kind === "selectedRecord" ? (
          <AstryxWorkspaceSelectedRecordDetail
            onIntent={onIntent}
            presentation={presentation}
            scope={scope}
          />
        ) : undefined
      }
      scope={scope}
      surface={surface}
    />
  );
}

export function AstryxSubscribedWorkspaceCollectionRenderer({
  collection,
  scope,
  surface = "constrained",
}: {
  collection: WorkspaceCollectionShellContract;
  scope: WorkspaceIntentScope;
  surface?: WorkspaceSurface;
}) {
  const onIntent = useWorkspaceIntentHandler();
  const presentation = collection.presentation;
  const mainResult = useResult(presentation.result);
  const treeOwnsContextDetail =
    mainResult?.kind === "treeResult" && mainResult.presentation === "inlineEditor";

  return (
    <AstryxWorkspaceCollectionFrame
      collection={collection}
      contextResult={
        presentation.contextDetail && !treeOwnsContextDetail ? (
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
        <AstryxSubscribedWorkspaceMainResult
          listSelection={selectedRecordListSelection(presentation, onIntent)}
          reference={presentation.result}
          scope={scope}
        />
      }
      onIntent={onIntent}
      selectedRecordDetail={
        presentation.kind === "selectedRecord" ? (
          <AstryxSubscribedWorkspaceSelectedRecordDetail
            presentation={presentation}
            scope={scope}
          />
        ) : undefined
      }
      scope={scope}
      surface={surface}
    />
  );
}

function AstryxWorkspaceCollectionFrame({
  collection,
  contextResult,
  mainResult,
  onIntent,
  selectedRecordDetail,
  scope,
  surface,
}: {
  collection: WorkspaceCollectionContract | WorkspaceCollectionShellContract;
  contextResult?: ReactNode;
  mainResult: ReactNode;
  onIntent: WorkspaceIntentHandler;
  selectedRecordDetail?: ReactNode;
  scope: WorkspaceIntentScope;
  surface: WorkspaceSurface;
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
  const fillsFullSelectedRecordSurface =
    surface === "full" && presentation.kind === "selectedRecord";

  return (
    <VStack
      as="section"
      aria-label={collection.accessibilityLabel}
      data-formless-astryx-workspace-collection={collection.id}
      gap={fillsFullSelectedRecordSurface ? 0 : 6}
      width="100%"
      xstyle={fillsFullSelectedRecordSurface && styles.fullSelectedRecordCollection}
    >
      {presentation.kind === "selectedRecord" ? (
        <>
          {presentation.context ? (
            <AstryxWorkspaceOrdinaryContext
              context={presentation.context}
              detail={contextResult}
              onIntent={onIntent}
              scope={scope}
            />
          ) : null}
          <Grid
            aria-label={presentation.accessibilityLabel}
            columns={1}
            gap={fillsFullSelectedRecordSurface ? 0 : 6}
            role="group"
            width="100%"
            xstyle={
              fillsFullSelectedRecordSurface
                ? styles.fullSelectedRecordGrid
                : styles.selectedRecordGrid
            }
          >
            <VStack
              gap={6}
              width="100%"
              xstyle={[
                styles.selectedRecordPane,
                fillsFullSelectedRecordSurface
                  ? styles.fullSelectedRecordPane
                  : styles.constrainedSelectedRecordPane,
                fillsFullSelectedRecordSurface && styles.fullSelectedRecordSelectorPane,
                presentation.activePresentation === "detail" && styles.compactHiddenPane,
              ]}
            >
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
            <VStack
              aria-label={presentation.accessibilityLabel}
              gap={4}
              padding={fillsFullSelectedRecordSurface ? 5 : undefined}
              role="region"
              width="100%"
              xstyle={[
                styles.selectedRecordPane,
                fillsFullSelectedRecordSurface
                  ? styles.fullSelectedRecordPane
                  : styles.constrainedSelectedRecordPane,
                presentation.activePresentation === "list" && styles.compactHiddenPane,
              ]}
            >
              {presentation.backIntent ? (
                <HStack xstyle={styles.compactOnly}>
                  <Button
                    label={`Back to ${collection.label}`}
                    onClick={() => {
                      void onIntent(presentation.backIntent!);
                    }}
                    size="sm"
                    variant="ghost"
                  >
                    Back
                  </Button>
                </HStack>
              ) : null}
              {selectedRecordDetail}
            </VStack>
          </Grid>
        </>
      ) : presentation.kind === "listDetail" ? (
        <Grid
          aria-label={presentation.accessibilityLabel}
          columns={1}
          gap={6}
          role="group"
          width="100%"
          xstyle={styles.listDetailGrid}
        >
          <AstryxWorkspaceListDetailSelector
            context={presentation.selector}
            onIntent={onIntent}
            scope={scope}
          />
          <VStack gap={6} width="100%" xstyle={styles.listDetailMain}>
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

const styles = stylex.create({
  compactHiddenPane: {
    display: {
      default: "none",
      "@media (min-width: 768px)": "flex",
    },
  },
  compactOnly: {
    display: {
      default: "flex",
      "@media (min-width: 768px)": "none",
    },
  },
  listDetailGrid: {
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      "@media (min-width: 768px)": "minmax(280px, 1fr) minmax(0, 2fr)",
    },
  },
  listDetailMain: {
    minWidth: 0,
  },
  fullSelectedRecordCollection: {
    height: "100%",
    minHeight: 0,
  },
  fullSelectedRecordGrid: {
    alignItems: "stretch",
    flex: 1,
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      "@media (min-width: 768px)": "360px minmax(0, 1fr)",
    },
    height: "100%",
    minHeight: 0,
  },
  fullSelectedRecordPane: {
    height: {
      default: "auto",
      "@media (min-width: 768px)": "100%",
    },
    minHeight: 0,
    overflowY: {
      default: "visible",
      "@media (min-width: 768px)": "auto",
    },
  },
  fullSelectedRecordSelectorPane: {
    borderInlineEndColor: {
      default: "transparent",
      "@media (min-width: 768px)": colorVars["--color-border"],
    },
    borderInlineEndStyle: {
      default: "none",
      "@media (min-width: 768px)": "solid",
    },
    borderInlineEndWidth: {
      default: 0,
      "@media (min-width: 768px)": borderVars["--border-width"],
    },
  },
  selectedRecordGrid: {
    alignItems: "start",
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      "@media (min-width: 768px)": "minmax(280px, 1fr) minmax(0, 2fr)",
    },
  },
  selectedRecordPane: {
    minWidth: 0,
  },
  constrainedSelectedRecordPane: {
    maxHeight: {
      default: "none",
      "@media (min-width: 768px)": "calc(100vh - 12rem)",
    },
    overflowY: {
      default: "visible",
      "@media (min-width: 768px)": "auto",
    },
  },
});

function AstryxWorkspaceListDetailSelector({
  context,
  onIntent,
  scope,
}: {
  context: WorkspaceContextContract;
  onIntent: WorkspaceIntentHandler;
  scope: WorkspaceIntentScope;
}) {
  return (
    <Card padding={4} width="100%">
      <VStack gap={3} width="100%">
        <HStack align="center" gap={2} justify="between" width="100%" wrap="wrap">
          <Heading level={3}>{context.label}</Heading>
          <AstryxWorkspaceContextCreate context={context} onIntent={onIntent} scope={scope} />
        </HStack>
        <AstryxWorkspaceContextAvailability context={context} />
        {context.availability.state === "ready" ? (
          <section aria-label={context.accessibilityLabel}>
            <List density="compact">
              {context.options.map((option) => (
                <ListItem
                  endContent={
                    option.countText === undefined ? undefined : (
                      <Badge
                        aria-label={`${option.label} count`}
                        label={option.countText}
                        variant="neutral"
                      />
                    )
                  }
                  isDisabled={!option.availability.available}
                  isSelected={option.selected}
                  key={option.id}
                  label={option.label}
                  onClick={() => {
                    void dispatchAstryxWorkspaceContextSelection(onIntent, option);
                  }}
                />
              ))}
            </List>
          </section>
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

  return <AstryxWorkspaceOperationControl control={action.control} onIntent={dispatch} />;
}

function AstryxWorkspaceOperationControl({
  control,
  onIntent,
}: {
  control: OperationControlContract;
  onIntent: (intent: OperationPresentationIntent) => Promise<void> | void;
}) {
  return (
    <VStack gap={2}>
      {control.progress ? (
        <AstryxOperationButtonWithProgress
          button={control.trigger}
          onIntent={onIntent}
          progress={control.progress}
        />
      ) : (
        <AstryxOperationButton button={control.trigger} onIntent={onIntent} />
      )}
      {control.confirmation ? (
        <AstryxOperationDestructiveConfirmation
          confirmation={control.confirmation}
          onIntent={onIntent}
        />
      ) : null}
      {control.status.status === "idle" ? null : (
        <AstryxOperationCompactStatus status={control.status} />
      )}
      <AstryxOperationFeedback feedback={control.feedback} />
    </VStack>
  );
}

type WorkspaceListSelection = {
  onSelectItem: (item: { id: string }) => Promise<void> | void;
  selectedItemId: string | null;
};

function selectedRecordListSelection(
  presentation:
    | WorkspaceCollectionContract["presentation"]
    | WorkspaceCollectionShellContract["presentation"],
  onIntent: WorkspaceIntentHandler,
): WorkspaceListSelection | undefined {
  if (presentation.kind !== "selectedRecord") {
    return undefined;
  }

  return {
    onSelectItem: (item) => {
      const intent = presentation.selectionIntents.find(
        (selectionIntent) => selectionIntent.recordId === item.id,
      );
      return intent ? onIntent(intent) : undefined;
    },
    selectedItemId: presentation.selectedRecordId,
  };
}

function AstryxWorkspaceSelectedRecordDetail({
  onIntent,
  presentation,
  scope,
}: {
  onIntent: WorkspaceIntentHandler;
  presentation: WorkspaceSelectedRecordContract;
  scope: WorkspaceIntentScope;
}) {
  if (presentation.selectedRecordId === null) {
    return null;
  }

  return (
    <VStack gap={6} width="100%">
      {presentation.sections.map((section) => (
        <AstryxWorkspaceSelectedRecordSection
          key={section.id}
          onIntent={onIntent}
          scope={scope}
          section={section}
          selectedRecordId={presentation.selectedRecordId!}
        />
      ))}
    </VStack>
  );
}

function AstryxSubscribedWorkspaceSelectedRecordDetail({
  presentation,
  scope,
}: {
  presentation: WorkspaceSelectedRecordShellContract;
  scope: WorkspaceIntentScope;
}) {
  if (presentation.selectedRecordId === null) {
    return null;
  }

  return (
    <VStack gap={6} width="100%">
      {presentation.sections.map((section) => (
        <AstryxSubscribedWorkspaceSelectedRecordSection
          key={section.id}
          scope={scope}
          section={section}
          selectedRecordId={presentation.selectedRecordId!}
        />
      ))}
    </VStack>
  );
}

function AstryxSubscribedWorkspaceSelectedRecordSection({
  scope,
  section,
  selectedRecordId,
}: {
  scope: WorkspaceIntentScope;
  section: WorkspaceSelectedRecordSectionShellContract;
  selectedRecordId: string;
}) {
  const onIntent = useWorkspaceIntentHandler();
  const result = useResult(section.result);

  if (
    !result ||
    (section.kind === "selectedRecordRecordSection" && result.kind !== "recordResult") ||
    (section.kind === "selectedRecordRelationshipSection" && result.kind !== "table")
  ) {
    return null;
  }

  return section.kind === "selectedRecordRecordSection" && result.kind === "recordResult" ? (
    <AstryxWorkspaceSelectedRecordSection
      onIntent={onIntent}
      scope={scope}
      section={{ ...section, result }}
      selectedRecordId={selectedRecordId}
    />
  ) : section.kind === "selectedRecordRelationshipSection" && result.kind === "table" ? (
    <AstryxWorkspaceSelectedRecordSection
      onIntent={onIntent}
      scope={scope}
      section={{ ...section, result }}
      selectedRecordId={selectedRecordId}
    />
  ) : null;
}

function AstryxWorkspaceSelectedRecordSection({
  onIntent,
  scope,
  section,
  selectedRecordId,
}: {
  onIntent: WorkspaceIntentHandler;
  scope: WorkspaceIntentScope;
  section: WorkspaceSelectedRecordSectionContract;
  selectedRecordId: string;
}) {
  const headingOperations =
    section.kind === "selectedRecordRelationshipSection" ? section.headingOperations : [];
  const heading =
    section.label === undefined && headingOperations.length === 0 ? null : (
      <HStack align="center" gap={3} justify="between" width="100%" wrap="wrap">
        {section.label ? <Heading level={3}>{section.label}</Heading> : <span aria-hidden="true" />}
        {headingOperations.length > 0 ? (
          <HStack gap={2} wrap="wrap">
            {headingOperations.map((control) => (
              <AstryxWorkspaceOperationControl
                control={control}
                key={control.id}
                onIntent={(intent) =>
                  dispatchAstryxWorkspaceOperationIntent(onIntent, scope, control.id, intent, {
                    recordId: selectedRecordId,
                    resultId: section.result.id,
                  })
                }
              />
            ))}
          </HStack>
        ) : null}
      </HStack>
    );

  return (
    <VStack
      as="section"
      aria-label={section.label ?? section.result.accessibilityLabel}
      gap={4}
      width="100%"
    >
      {heading}
      <AstryxWorkspaceResult onIntent={onIntent} result={section.result} scope={scope} />
    </VStack>
  );
}

const AstryxSubscribedWorkspaceMainResult = memo(function AstryxSubscribedWorkspaceMainResult({
  listSelection,
  reference,
  scope,
}: {
  listSelection?: WorkspaceListSelection;
  reference: MainResultReference;
  scope: WorkspaceIntentScope;
}) {
  if (reference.kind === "treeResultReference") {
    return <AstryxSubscribedTreeResultRenderer reference={reference} scope={scope} />;
  }

  return (
    <AstryxSubscribedWorkspaceNonTreeMainResult
      listSelection={listSelection}
      reference={reference}
      scope={scope}
    />
  );
}, subscribedMainResultPropsEqual);

function AstryxSubscribedWorkspaceNonTreeMainResult({
  listSelection,
  reference,
  scope,
}: {
  listSelection?: WorkspaceListSelection;
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
    <AstryxWorkspaceResult
      listSelection={listSelection}
      onIntent={onIntent}
      result={result}
      scope={scope}
    />
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
    listSelection?: WorkspaceListSelection;
    reference: MainResultReference;
    scope: WorkspaceIntentScope;
  },
  next: {
    listSelection?: WorkspaceListSelection;
    reference: MainResultReference;
    scope: WorkspaceIntentScope;
  },
) {
  return (
    previous.listSelection === next.listSelection &&
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
  listSelection,
  onIntent,
  result,
  scope,
}: {
  listSelection?: WorkspaceListSelection;
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
        onItemSelect={listSelection?.onSelectItem}
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
        selectedItemId={listSelection?.selectedItemId}
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
    item.presentation === "fields"
      ? [...item.actions.primary, ...item.actions.secondary].includes(action)
      : false,
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
