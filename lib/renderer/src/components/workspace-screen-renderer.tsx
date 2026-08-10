import * as stylex from "@stylexjs/stylex";
import { Button, type ButtonVariant } from "@astryxdesign/core/Button";
import { Banner } from "@astryxdesign/core/Banner";
import { HStack } from "@astryxdesign/core/HStack";
import { Section } from "@astryxdesign/core/Section";
import { Heading } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { memo, type ReactNode, useMemo } from "react";
import type {
  ActionTriggerContract,
  WorkspaceContract,
  WorkspaceExternalActionContract,
  WorkspaceIntentHandler,
  WorkspaceLinkActionContract,
  WorkspaceManifestContract,
  WorkspaceManifestReference,
  WorkspaceIntentScope,
  WorkspaceSectionContract,
  WorkspaceSectionShellContract,
  WorkspaceSectionShellReference,
} from "@dpeek/formless-presentation/contract";
import {
  useWorkspaceIntentHandler,
  useWorkspaceManifest,
  useWorkspaceSectionShell,
} from "@dpeek/formless-presentation/host/react";
import { operationIcon } from "./operation-renderer.tsx";
import {
  AstryxSubscribedWorkspaceCollectionRenderer,
  AstryxWorkspaceCollectionRenderer,
} from "./workspace-collection-renderer.tsx";

export function AstryxWorkspaceScreenRenderer({
  onIntent,
  workspace,
}: {
  onIntent: WorkspaceIntentHandler;
  workspace: WorkspaceContract;
}) {
  if (workspace.sections.length === 0 && workspace.actions.length === 0) {
    return null;
  }

  return (
    <AstryxWorkspaceFrame workspace={workspace}>
      {workspace.sections.map((section) => (
        <AstryxWorkspaceSection
          key={section.id}
          onIntent={onIntent}
          screenId={workspace.id}
          section={section}
          surface={workspace.surface}
        />
      ))}
    </AstryxWorkspaceFrame>
  );
}

export const AstryxSubscribedWorkspaceScreenRenderer = memo(
  function AstryxSubscribedWorkspaceScreenRenderer({
    reference,
  }: {
    reference: WorkspaceManifestReference;
  }) {
    const workspace = useWorkspaceManifest(reference);

    if (!workspace || (workspace.sections.length === 0 && workspace.actions.length === 0)) {
      return null;
    }

    return (
      <AstryxWorkspaceFrame workspace={workspace}>
        {workspace.sections.map((sectionReference) => (
          <AstryxSubscribedWorkspaceSection
            key={`${sectionReference.workspaceId}:${sectionReference.sectionId}`}
            reference={sectionReference}
            surface={workspace.surface}
          />
        ))}
      </AstryxWorkspaceFrame>
    );
  },
  (previous, next) => previous.reference.workspaceId === next.reference.workspaceId,
);

function AstryxWorkspaceFrame({
  children,
  workspace,
}: {
  children: ReactNode;
  workspace: WorkspaceContract | WorkspaceManifestContract;
}) {
  return (
    <VStack
      aria-label={workspace.accessibilityLabel}
      data-formless-astryx-workspace={workspace.id}
      gap={workspace.sections.length === 1 ? 4 : 8}
      role="region"
      width="100%"
      xstyle={workspace.surface === "full" && styles.fullWorkspace}
    >
      {workspace.actions.length > 0 ? (
        <HStack justify="end" width="100%" wrap="wrap">
          {workspace.actions.map((action) => (
            <AstryxWorkspaceLinkAction action={action} key={action.id} />
          ))}
        </HStack>
      ) : null}
      {children}
    </VStack>
  );
}

function AstryxWorkspaceLinkAction({ action }: { action: WorkspaceLinkActionContract }) {
  const opensInNewTab = action.target === "newTab";

  return (
    <Button
      data-formless-astryx-workspace-link-action={action.id}
      href={action.href}
      label={action.accessibilityLabel}
      rel={opensInNewTab ? "noopener noreferrer" : undefined}
      size="sm"
      target={opensInNewTab ? "_blank" : undefined}
      variant={action.prominence}
    >
      {action.label}
    </Button>
  );
}

function AstryxWorkspaceSection({
  onIntent,
  screenId,
  section,
  surface,
}: {
  onIntent: WorkspaceIntentHandler;
  screenId: string;
  section: WorkspaceSectionContract;
  surface: WorkspaceContract["surface"];
}) {
  const scope = {
    collectionId: section.collection.id,
    screenId,
    sectionId: section.id,
  };

  return (
    <AstryxWorkspaceSectionFrame
      onIntent={onIntent}
      scope={scope}
      section={section}
      surface={surface}
    >
      <AstryxWorkspaceCollectionRenderer
        collection={section.collection}
        onIntent={onIntent}
        scope={scope}
        surface={surface}
      />
    </AstryxWorkspaceSectionFrame>
  );
}

const AstryxSubscribedWorkspaceSection = memo(
  function AstryxSubscribedWorkspaceSection({
    reference,
    surface,
  }: {
    reference: WorkspaceSectionShellReference;
    surface: WorkspaceManifestContract["surface"];
  }) {
    const onIntent = useWorkspaceIntentHandler();
    const section = useWorkspaceSectionShell(reference);
    const scope = useMemo(
      () =>
        section
          ? {
              collectionId: section.collection.id,
              screenId: reference.workspaceId,
              sectionId: reference.sectionId,
            }
          : undefined,
      [reference.sectionId, reference.workspaceId, section?.collection.id],
    );

    if (!section || !scope) {
      return null;
    }

    return (
      <AstryxWorkspaceSectionFrame
        onIntent={onIntent}
        scope={scope}
        section={section}
        surface={surface}
      >
        <AstryxSubscribedWorkspaceCollectionRenderer
          collection={section.collection}
          scope={scope}
          surface={surface}
        />
      </AstryxWorkspaceSectionFrame>
    );
  },
  (previous, next) =>
    previous.reference.workspaceId === next.reference.workspaceId &&
    previous.reference.sectionId === next.reference.sectionId &&
    previous.surface === next.surface,
);

function AstryxWorkspaceSectionFrame({
  children,
  onIntent,
  scope,
  section,
  surface,
}: {
  children: ReactNode;
  onIntent: WorkspaceIntentHandler;
  scope: WorkspaceIntentScope;
  section: WorkspaceSectionContract | WorkspaceSectionShellContract;
  surface: WorkspaceContract["surface"];
}) {
  const renderHeader = section.headingVisibility === "visible";
  const renderActionsAfterCollection =
    section.headingVisibility === "hidden" && section.actions.length > 0;
  const fillsFullSelectedRecordSurface =
    surface === "full" && section.collection.presentation.kind === "selectedRecord";

  return (
    <Section
      aria-label={section.accessibilityLabel}
      data-formless-astryx-workspace-section={section.id}
      padding={0}
      role="region"
      variant="transparent"
      width="100%"
      xstyle={fillsFullSelectedRecordSurface && styles.fullSelectedRecordSection}
    >
      <VStack
        gap={renderHeader || renderActionsAfterCollection ? 4 : 0}
        width="100%"
        xstyle={fillsFullSelectedRecordSurface && styles.fullSelectedRecordSectionContent}
      >
        {renderHeader ? (
          <HStack align="center" gap={3} justify="between" width="100%" wrap="wrap">
            {section.headingVisibility === "visible" ? (
              <Heading level={2}>{section.label}</Heading>
            ) : (
              <span aria-hidden="true" />
            )}
            {section.actions.length > 0 ? (
              <HStack gap={2} wrap="wrap">
                {section.actions.map((externalAction) => (
                  <AstryxWorkspaceExternalAction
                    externalAction={externalAction}
                    key={externalAction.id}
                    onIntent={onIntent}
                    scope={scope}
                  />
                ))}
              </HStack>
            ) : null}
          </HStack>
        ) : null}
        {children}
        {renderActionsAfterCollection ? (
          <HStack gap={2} wrap="wrap">
            {section.actions.map((externalAction) => (
              <AstryxWorkspaceExternalAction
                externalAction={externalAction}
                key={externalAction.id}
                onIntent={onIntent}
                scope={scope}
              />
            ))}
          </HStack>
        ) : null}
      </VStack>
    </Section>
  );
}

const styles = stylex.create({
  fullSelectedRecordSection: {
    flex: 1,
    minHeight: 0,
  },
  fullSelectedRecordSectionContent: {
    height: "100%",
    minHeight: 0,
  },
  fullWorkspace: {
    height: "100%",
    minHeight: 0,
  },
});

function AstryxWorkspaceExternalAction({
  externalAction,
  onIntent,
  scope,
}: {
  externalAction: WorkspaceExternalActionContract;
  onIntent: WorkspaceIntentHandler;
  scope: WorkspaceIntentScope;
}) {
  const action = externalAction.action;
  const isPending = Boolean(action.pending?.isPending);
  const isDisabled = Boolean(action.disabled || isPending);

  return (
    <VStack gap={1}>
      <Button
        aria-pressed={action.selected || undefined}
        data-formless-astryx-workspace-external-action={externalAction.id}
        icon={action.icon ? operationIcon(action.icon) : undefined}
        isDisabled={isDisabled}
        isLoading={isPending}
        label={action.accessibilityLabel ?? action.label}
        onClick={() => {
          if (!isDisabled) {
            void dispatchAstryxWorkspaceExternalAction(onIntent, scope, externalAction);
          }
        }}
        size="md"
        tooltip={action.disabledReason}
        variant={astryxWorkspaceActionVariant(action)}
      >
        {action.label}
      </Button>
      {action.errors?.length ? (
        <Banner container="card" status="error" title={action.errors.join(" ")} />
      ) : null}
    </VStack>
  );
}

export function dispatchAstryxWorkspaceExternalAction(
  handler: WorkspaceIntentHandler,
  scope: WorkspaceIntentScope,
  externalAction: WorkspaceExternalActionContract,
) {
  return handler({
    ...scope,
    actionId: externalAction.id,
    controlId: externalAction.action.id,
    intent: externalAction.action.invoke,
    type: "workspaceExternalAction",
  });
}

function astryxWorkspaceActionVariant(action: ActionTriggerContract): ButtonVariant {
  switch (action.intent) {
    case "danger":
      return "destructive";
    case "primary":
    case "success":
      return "primary";
    case "neutral":
    case "warning":
    case undefined:
      return "secondary";
  }
}
