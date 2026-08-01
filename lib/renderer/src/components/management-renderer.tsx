import { Banner, type BannerStatus } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { Section } from "@astryxdesign/core/Section";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Heading, Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { memo, type ReactNode } from "react";
import type {
  ButtonContract,
  ManagementFeedbackContract,
  ManagementIntentHandler,
  ManagementManifestContract,
  ManagementManifestReference,
  ManagementReadyContract,
  ManagementWorkspaceOperationContract,
  OperationPresentationIntent,
  WorkspaceContract,
  WorkspaceIntentHandler,
} from "@dpeek/formless-presentation/contract";
import {
  useManagementIntentHandler,
  useManagementManifest,
} from "@dpeek/formless-presentation/host/react";
import {
  AstryxOperationButton,
  AstryxOperationButtonWithProgress,
  AstryxOperationFeedback,
  operationButtonVariant,
  operationIcon,
} from "./operation-renderer.tsx";
import {
  AstryxSubscribedWorkspaceScreenRenderer,
  AstryxWorkspaceScreenRenderer,
} from "./workspace-screen-renderer.tsx";

export function AstryxManagementRenderer({
  manifest,
  onIntent,
  onWorkspaceIntent,
  workspaces = [],
}: {
  manifest: ManagementManifestContract;
  onIntent: ManagementIntentHandler;
  onWorkspaceIntent: WorkspaceIntentHandler;
  workspaces?: readonly WorkspaceContract[] | undefined;
}) {
  if (manifest.state !== "ready") {
    return <AstryxManagementFrame manifest={manifest} onIntent={onIntent} />;
  }

  const workspaceById = new Map(workspaces.map((workspace) => [workspace.id, workspace]));

  return (
    <AstryxManagementFrame
      manifest={manifest}
      onIntent={onIntent}
      workspaces={manifest.workspaces.flatMap(({ reference, role }) => {
        const workspace = workspaceById.get(reference.workspaceId);
        return workspace
          ? [
              <AstryxManagementWorkspace key={role} role={role}>
                <AstryxWorkspaceScreenRenderer onIntent={onWorkspaceIntent} workspace={workspace} />
              </AstryxManagementWorkspace>,
            ]
          : [];
      })}
    />
  );
}

export const AstryxSubscribedManagementRenderer = memo(
  function AstryxSubscribedManagementRenderer({
    managementReference,
  }: {
    managementReference: ManagementManifestReference;
  }) {
    const manifest = useManagementManifest(managementReference);
    const onIntent = useManagementIntentHandler();

    if (!manifest) {
      return null;
    }

    if (manifest.state !== "ready") {
      return <AstryxManagementFrame manifest={manifest} onIntent={onIntent} />;
    }

    return (
      <AstryxManagementFrame
        manifest={manifest}
        onIntent={onIntent}
        workspaces={manifest.workspaces.map(({ reference, role }) => (
          <AstryxManagementWorkspace key={role} role={role}>
            <AstryxSubscribedWorkspaceScreenRenderer reference={reference} />
          </AstryxManagementWorkspace>
        ))}
      />
    );
  },
  (previous, next) =>
    previous.managementReference.managementId === next.managementReference.managementId,
);

function AstryxManagementFrame({
  manifest,
  onIntent,
  workspaces,
}: {
  manifest: ManagementManifestContract;
  onIntent: ManagementIntentHandler;
  workspaces?: ReactNode;
}) {
  const headingId = `${manifest.id}:heading`;

  return (
    <Section
      aria-labelledby={headingId}
      data-formless-astryx-management={manifest.id}
      data-formless-astryx-management-state={manifest.state}
      padding={0}
      variant="transparent"
      width="100%"
    >
      <VStack gap={6} width="100%">
        <Heading id={headingId} level={1}>
          {manifest.title}
        </Heading>
        {manifest.state === "loading" ? (
          <EmptyState
            description={manifest.message}
            headingLevel={2}
            icon={<Spinner aria-label={manifest.message} size="md" />}
            isCompact
            title="Loading instance settings"
          />
        ) : null}
        {manifest.state === "failed" ? (
          <AstryxManagementFeedback feedback={manifest.feedback} />
        ) : null}
        {manifest.state === "ready" ? (
          <>
            <AstryxManagementWorkspaceControls manifest={manifest} onIntent={onIntent} />
            <VStack gap={8} width="100%">
              {workspaces}
            </VStack>
          </>
        ) : null}
      </VStack>
    </Section>
  );
}

function AstryxManagementWorkspace({ children, role }: { children: ReactNode; role: "routes" }) {
  return (
    <Section
      aria-label="Routes"
      data-formless-astryx-management-workspace={role}
      padding={0}
      variant="transparent"
      width="100%"
    >
      {children}
    </Section>
  );
}

function AstryxManagementWorkspaceControls({
  manifest,
  onIntent,
}: {
  manifest: ManagementReadyContract;
  onIntent: ManagementIntentHandler;
}) {
  const operation = manifest.workspaceOperation;

  if (!operation && !manifest.workspaceFeedback) {
    return null;
  }

  return (
    <Card
      aria-label="Workspace Push"
      data-formless-astryx-management-workspace-operation={operation?.id}
      padding={4}
      role="region"
      width="100%"
    >
      <VStack gap={4} width="100%">
        <HStack align="center" gap={3} justify="between" width="100%" wrap="wrap">
          <Heading level={2}>Workspace Push</Heading>
          {operation ? (
            <AstryxManagementOperationButton
              manifest={manifest}
              onIntent={onIntent}
              operation={operation}
            />
          ) : null}
        </HStack>
        {manifest.workspaceFeedback ? (
          <AstryxManagementFeedback feedback={manifest.workspaceFeedback} />
        ) : null}
        {operation?.control.feedback ? (
          <AstryxOperationFeedback feedback={operation.control.feedback} />
        ) : null}
        {operation?.authorizationPrompt ? (
          <AstryxManagementAuthorizationPrompt onIntent={onIntent} operation={operation} />
        ) : null}
      </VStack>
    </Card>
  );
}

function AstryxManagementOperationButton({
  manifest,
  onIntent,
  operation,
}: {
  manifest: ManagementReadyContract;
  onIntent: ManagementIntentHandler;
  operation: ManagementWorkspaceOperationContract;
}) {
  const handleIntent = (intent: OperationPresentationIntent) =>
    dispatchAstryxManagementWorkspaceOperationIntent(onIntent, manifest, operation, intent);

  return operation.control.progress ? (
    <AstryxOperationButtonWithProgress
      button={operation.control.trigger}
      onIntent={handleIntent}
      progress={operation.control.progress}
    />
  ) : (
    <AstryxOperationButton button={operation.control.trigger} onIntent={handleIntent} />
  );
}

function AstryxManagementAuthorizationPrompt({
  onIntent,
  operation,
}: {
  onIntent: ManagementIntentHandler;
  operation: ManagementWorkspaceOperationContract;
}) {
  const prompt = operation.authorizationPrompt;

  if (!prompt) {
    return null;
  }

  return (
    <Card
      aria-label={prompt.title}
      data-formless-astryx-management-authorization={prompt.id}
      padding={3}
      variant="muted"
      width="100%"
    >
      <HStack align="center" gap={3} justify="between" width="100%" wrap="wrap">
        <VStack gap={0.5}>
          <Text display="block" type="label" weight="medium">
            {prompt.title}
          </Text>
          {prompt.detail ? (
            <Text color="secondary" display="block" type="supporting">
              {prompt.detail}
            </Text>
          ) : null}
        </VStack>
        <AstryxManagementButton button={prompt.action} onPress={() => onIntent(prompt.intent)} />
      </HStack>
    </Card>
  );
}

function AstryxManagementFeedback({ feedback }: { feedback: ManagementFeedbackContract }) {
  return (
    <Banner
      container="card"
      data-formless-astryx-management-feedback={feedback.id}
      description={feedback.detail}
      status={astryxManagementFeedbackStatus(feedback.intent)}
      title={feedback.title}
    />
  );
}

function AstryxManagementButton({
  button,
  form,
  onPress,
}: {
  button: ButtonContract;
  form?: string;
  onPress?: (() => Promise<void> | void) | undefined;
}) {
  const isLoading = Boolean(button.pending?.isPending);
  const content = button.content;
  const isIconOnly = content.kind === "iconOnly";
  const icon = content.kind === "label" ? undefined : operationIcon(content.icon);

  return (
    <Button
      data-formless-astryx-management-control={button.id}
      form={form}
      icon={icon}
      isDisabled={Boolean(button.disabled || isLoading)}
      isIconOnly={isIconOnly}
      isLoading={isLoading}
      label={button.accessibilityLabel}
      onClick={onPress ? () => void onPress() : undefined}
      size={button.density === "compact" ? "sm" : "md"}
      tooltip={button.disabledReason}
      type={button.type}
      variant={operationButtonVariant(button.prominence)}
    >
      {content.kind === "iconOnly" ? undefined : content.label}
    </Button>
  );
}

export function dispatchAstryxManagementWorkspaceOperationIntent(
  onIntent: ManagementIntentHandler,
  manifest: ManagementReadyContract,
  operation: ManagementWorkspaceOperationContract,
  intent: OperationPresentationIntent,
) {
  return onIntent({
    controlId: operation.control.id,
    intent,
    managementId: manifest.id,
    operationId: operation.id,
    type: "managementWorkspaceOperation",
  });
}

function astryxManagementFeedbackStatus(
  intent: ManagementFeedbackContract["intent"],
): BannerStatus {
  switch (intent) {
    case "danger":
      return "error";
    case "warning":
      return "warning";
    case "success":
      return "success";
    case "info":
    case "neutral":
      return "info";
  }
}
