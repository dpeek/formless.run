import { Avatar } from "@astryxdesign/core/Avatar";
import { Badge } from "@astryxdesign/core/Badge";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { HStack } from "@astryxdesign/core/HStack";
import { HoverCard } from "@astryxdesign/core/HoverCard";
import { IconButton } from "@astryxdesign/core/IconButton";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { NavHeadingMenu, NavHeadingMenuItem } from "@astryxdesign/core/NavMenu";
import { SideNav, SideNavHeading, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { StatusDot, type StatusDotVariant } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { radiusVars, spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import { memo, type ReactNode } from "react";
import type {
  CreateIntent,
  FieldIntent,
  ShellDestinationContract,
  ShellIntent,
  ShellIntentHandler,
  ShellManifestContract,
  ShellNavigationSectionContract,
  ShellNavigationSectionReference,
  ShellSessionContract,
  ShellStatusContract,
} from "@dpeek/formless-presentation/contract";
import {
  useShellIntentHandler,
  useShellNavigationSection,
} from "@dpeek/formless-presentation/host/react";
import { AstryxCreateSurfaceRenderer } from "./create-renderer.tsx";

type AstryxShellSectionSlot = "navigation" | "session" | "status" | "workspaceSwitcher";

const shellStyles = stylex.create({
  avatarTrigger: {
    borderRadius: radiusVars["--radius-full"],
  },
  footerUtilities: {
    marginInlineStart: "auto",
  },
  statusDetails: {
    maxWidth: 320,
    minWidth: 280,
  },
  statusMessage: {
    paddingInlineStart: spacingVars["--spacing-4"],
  },
  statusTrigger: {
    display: "inline-flex",
  },
});

export function AstryxApplicationSideNav({
  manifest,
  onIntent,
  sections,
  themeControl,
}: {
  manifest: ShellManifestContract;
  onIntent: ShellIntentHandler;
  sections: readonly ShellNavigationSectionContract[];
  themeControl?: ReactNode;
}) {
  const workspaceSwitcher = sections.find((section) => section.role === "workspaceSwitcher");

  return (
    <AstryxApplicationSideNavFrame
      manifest={manifest}
      navigation={sections.map((section) => (
        <AstryxApplicationShellSectionSlot
          key={section.id}
          onIntent={onIntent}
          section={section}
          slot="navigation"
        />
      ))}
      session={sections.map((section) => (
        <AstryxApplicationShellSectionSlot
          key={section.id}
          onIntent={onIntent}
          section={section}
          slot="session"
        />
      ))}
      status={sections.map((section) => (
        <AstryxApplicationShellSectionSlot
          key={section.id}
          onIntent={onIntent}
          section={section}
          slot="status"
        />
      ))}
      workspaceSwitcher={
        workspaceSwitcher ? (
          <AstryxApplicationShellSectionSlot
            onIntent={onIntent}
            section={workspaceSwitcher}
            slot="workspaceSwitcher"
          />
        ) : undefined
      }
      themeControl={themeControl}
    />
  );
}

export function AstryxSubscribedApplicationSideNav({
  manifest,
  references,
  themeControl,
}: {
  manifest: ShellManifestContract;
  references: readonly ShellNavigationSectionReference[];
  themeControl?: ReactNode;
}) {
  const onIntent = useShellIntentHandler();
  const workspaceSwitcherReference = manifest.workspaceSwitcher;
  const bodyReferences = workspaceSwitcherReference
    ? references.filter((reference) => reference.sectionId !== workspaceSwitcherReference.sectionId)
    : references;

  return (
    <AstryxApplicationSideNavFrame
      manifest={manifest}
      navigation={bodyReferences.map((reference) => (
        <AstryxSubscribedApplicationShellSectionSlot
          key={`${reference.shellId}:${reference.sectionId}`}
          onIntent={onIntent}
          reference={reference}
          slot="navigation"
        />
      ))}
      session={bodyReferences.map((reference) => (
        <AstryxSubscribedApplicationShellSectionSlot
          key={`${reference.shellId}:${reference.sectionId}`}
          onIntent={onIntent}
          reference={reference}
          slot="session"
        />
      ))}
      status={bodyReferences.map((reference) => (
        <AstryxSubscribedApplicationShellSectionSlot
          key={`${reference.shellId}:${reference.sectionId}`}
          onIntent={onIntent}
          reference={reference}
          slot="status"
        />
      ))}
      workspaceSwitcher={
        workspaceSwitcherReference ? (
          <AstryxSubscribedApplicationShellSectionSlot
            onIntent={onIntent}
            reference={workspaceSwitcherReference}
            slot="workspaceSwitcher"
          />
        ) : undefined
      }
      themeControl={themeControl}
    />
  );
}

function AstryxApplicationSideNavFrame({
  manifest,
  navigation,
  session,
  status,
  themeControl,
  workspaceSwitcher,
}: {
  manifest: ShellManifestContract;
  navigation: ReactNode;
  session: ReactNode;
  status: ReactNode;
  themeControl?: ReactNode;
  workspaceSwitcher?: ReactNode;
}) {
  return (
    <SideNav
      footer={
        <HStack
          align="center"
          data-formless-astryx-side-nav-footer
          gap={2}
          justify="between"
          width="100%"
        >
          {session}
          <HStack align="center" gap={1} xstyle={shellStyles.footerUtilities}>
            {status}
            {themeControl}
          </HStack>
        </HStack>
      }
      header={
        <SideNavHeading
          heading={manifest.title}
          menu={
            workspaceSwitcher ? (
              <NavHeadingMenu size="lg">{workspaceSwitcher}</NavHeadingMenu>
            ) : undefined
          }
        />
      }
    >
      {navigation}
    </SideNav>
  );
}

const AstryxSubscribedApplicationShellSectionSlot = memo(
  function AstryxSubscribedApplicationShellSectionSlot({
    onIntent,
    reference,
    slot,
  }: {
    onIntent: ShellIntentHandler;
    reference: ShellNavigationSectionReference;
    slot: AstryxShellSectionSlot;
  }) {
    const section = useShellNavigationSection(reference);

    return section ? (
      <AstryxApplicationShellSectionSlot onIntent={onIntent} section={section} slot={slot} />
    ) : null;
  },
  (previous, next) =>
    previous.reference.shellId === next.reference.shellId &&
    previous.reference.sectionId === next.reference.sectionId &&
    previous.slot === next.slot &&
    previous.onIntent === next.onIntent,
);

function AstryxApplicationShellSectionSlot({
  onIntent,
  section,
  slot,
}: {
  onIntent: ShellIntentHandler;
  section: ShellNavigationSectionContract;
  slot: AstryxShellSectionSlot;
}) {
  if (slot === "workspaceSwitcher") {
    return section.role === "workspaceSwitcher" ? (
      <AstryxWorkspaceSwitcherSection section={section} />
    ) : null;
  }

  if (slot === "session") {
    return section.role === "session" && section.session ? (
      <AstryxShellSession onIntent={onIntent} section={section} session={section.session} />
    ) : null;
  }

  if (slot === "status") {
    return section.role === "status" && section.status ? (
      <AstryxShellStatus status={section.status} />
    ) : null;
  }

  if (
    section.role === "session" ||
    section.role === "status" ||
    section.role === "workspaceSwitcher"
  ) {
    return null;
  }

  return <AstryxShellNavigationSection onIntent={onIntent} section={section} />;
}

function AstryxWorkspaceSwitcherSection({ section }: { section: ShellNavigationSectionContract }) {
  return section.destinations.map((destination) => (
    <NavHeadingMenuItem
      description={destinationSupportingText(destination)}
      href={destination.kind === "shellLinkDestination" ? destination.href : undefined}
      isDisabled={!destination.availability.available}
      key={destination.id}
      label={
        <HStack align="center" gap={2} justify="between" width="100%">
          <Text type="label" weight={destination.selected ? "semibold" : undefined}>
            <span aria-current={destination.selected ? "page" : undefined}>
              {destination.label}
            </span>
          </Text>
          {destination.countText ? (
            <Badge
              aria-label={`${destination.accessibilityLabel} count`}
              label={destination.countText}
              variant="neutral"
            />
          ) : null}
        </HStack>
      }
    />
  ));
}

function AstryxShellNavigationSection({
  onIntent,
  section,
}: {
  onIntent: ShellIntentHandler;
  section: ShellNavigationSectionContract;
}) {
  return (
    <SideNavSection
      endContent={
        section.createSurface ? (
          <AstryxCreateSurfaceRenderer
            onFieldIntent={(fieldId, intent) =>
              onIntent(astryxApplicationShellCreateIntent(section, intent, fieldId))
            }
            onIntent={(intent) => onIntent(astryxApplicationShellCreateIntent(section, intent))}
            surface={section.createSurface}
          />
        ) : undefined
      }
      isHeaderHidden={section.label === undefined}
      title={section.label ?? section.accessibilityLabel}
    >
      {section.destinations.map((destination) => (
        <AstryxShellDestination
          destination={destination}
          key={destination.id}
          onIntent={onIntent}
        />
      ))}
    </SideNavSection>
  );
}

function AstryxShellDestination({
  destination,
  onIntent,
}: {
  destination: ShellDestinationContract;
  onIntent: ShellIntentHandler;
}) {
  const supportingText = destinationSupportingText(destination);

  return (
    <VStack gap={supportingText ? 0.5 : 0} width="100%">
      <SideNavItem
        endContent={
          destination.countText ? (
            <Badge
              aria-label={`${destination.accessibilityLabel} count`}
              label={destination.countText}
              variant="neutral"
            />
          ) : undefined
        }
        href={destination.kind === "shellLinkDestination" ? destination.href : undefined}
        isDisabled={!destination.availability.available}
        isSelected={destination.selected}
        label={destination.label}
        onClick={
          destination.kind === "shellRootRecordDestination"
            ? () => {
                if (destination.availability.available) {
                  void onIntent(destination.selectionIntent);
                }
              }
            : undefined
        }
      />
      {supportingText ? (
        <Text color="secondary" display="block" type="supporting">
          {supportingText}
        </Text>
      ) : null}
    </VStack>
  );
}

function AstryxShellStatus({ status }: { status: ShellStatusContract }) {
  const sync = status.sync;

  if (!sync) {
    return null;
  }

  const dotVariant = syncStatusDotVariant(sync.state);

  return (
    <HoverCard
      alignment="end"
      content={<AstryxShellStatusDetails status={status} />}
      focusTrigger="always"
      hasHoverIndication={false}
      label={`Sync status details: ${sync.label}`}
      placement="above"
    >
      <span {...stylex.props(shellStyles.statusTrigger)}>
        <IconButton
          icon={
            <StatusDot
              isPulsing={sync.state === "syncing"}
              label={sync.label}
              variant={dotVariant}
            />
          }
          label={`Sync status: ${sync.label}`}
          size="sm"
          variant="ghost"
        />
      </span>
    </HoverCard>
  );
}

function AstryxShellStatusDetails({ status }: { status: ShellStatusContract }) {
  return (
    <VStack gap={3} width="100%" xstyle={shellStyles.statusDetails}>
      {status.sync ? (
        <VStack
          aria-label={`Sync status details: ${status.sync.label}`}
          gap={2}
          role={status.sync.state === "error" ? "alert" : "status"}
          width="100%"
        >
          <VStack gap={0.5} width="100%">
            <HStack align="center" gap={2} width="100%">
              <StatusDot
                isPulsing={status.sync.state === "syncing"}
                label={status.sync.label}
                variant={syncStatusDotVariant(status.sync.state)}
              />
              <Text type="label" weight="medium">
                {status.sync.label}
              </Text>
            </HStack>
            <Text color="secondary" type="supporting" xstyle={shellStyles.statusMessage}>
              {status.sync.message}
            </Text>
          </VStack>
          {status.sync.details ? (
            <MetadataList columns="single">
              {status.sync.details.map((detail) => (
                <MetadataListItem key={detail.label} label={detail.label}>
                  {detail.presentation === "timestamp" ? (
                    <Timestamp
                      color="primary"
                      format="auto"
                      hasTooltip={false}
                      isLive
                      type="body"
                      value={detail.value}
                    />
                  ) : (
                    detail.value
                  )}
                </MetadataListItem>
              ))}
            </MetadataList>
          ) : null}
        </VStack>
      ) : null}
      {status.workspaceSave ? (
        <HStack
          align="start"
          aria-label={`Workspace save status: ${status.workspaceSave.label}`}
          gap={2}
          role={status.workspaceSave.state === "failed" ? "alert" : "status"}
          width="100%"
        >
          <StatusDot
            label={status.workspaceSave.label}
            variant={workspaceSaveStatusDotVariant(status.workspaceSave.state)}
          />
          <VStack gap={0.5}>
            <Text type="label" weight="medium">
              {status.workspaceSave.label}
            </Text>
            <Text color="secondary" type="supporting">
              {status.workspaceSave.message}
            </Text>
          </VStack>
        </HStack>
      ) : null}
    </VStack>
  );
}

function AstryxShellSession({
  onIntent,
  section,
  session,
}: {
  onIntent: ShellIntentHandler;
  section: ShellNavigationSectionContract;
  session: ShellSessionContract;
}) {
  if (session.state === "anonymous") {
    return null;
  }

  const isLogoutDisabled = Boolean(session.logout.disabled || session.logout.pending?.isPending);

  return (
    <VStack gap={1}>
      <DropdownMenu
        button={{
          icon: <Avatar name={session.identity.displayName} size="xsm" />,
          isIconOnly: true,
          label: session.identity.displayName,
          size: "sm",
          variant: "ghost",
          xstyle: shellStyles.avatarTrigger,
        }}
        hasChevron={false}
        items={[
          {
            isDisabled: isLogoutDisabled,
            label: "Log out Local Owner",
            onClick: () => void onIntent(astryxApplicationShellLogoutIntent(section, session)),
          },
        ]}
        placement="above"
      />
      {session.logout.errors?.map((error) => (
        <Text color="secondary" display="block" key={error} role="alert" type="supporting">
          {error}
        </Text>
      ))}
    </VStack>
  );
}

function destinationSupportingText(destination: ShellDestinationContract) {
  return destination.availability.available
    ? destination.description
    : destination.availability.message;
}

function syncStatusDotVariant(
  state: NonNullable<ShellStatusContract["sync"]>["state"],
): StatusDotVariant {
  return state === "error" ? "error" : state === "syncing" ? "accent" : "success";
}

function workspaceSaveStatusDotVariant(
  state: NonNullable<ShellStatusContract["workspaceSave"]>["state"],
): StatusDotVariant {
  return state === "failed"
    ? "error"
    : state === "clean" || state === "saved"
      ? "success"
      : state === "dirty"
        ? "warning"
        : "accent";
}

export function astryxApplicationShellCreateIntent(
  section: ShellNavigationSectionContract,
  intent: CreateIntent,
): ShellIntent;
export function astryxApplicationShellCreateIntent(
  section: ShellNavigationSectionContract,
  intent: FieldIntent,
  fieldId: string,
): ShellIntent;
export function astryxApplicationShellCreateIntent(
  section: ShellNavigationSectionContract,
  intent: CreateIntent | FieldIntent,
  fieldId?: string,
): ShellIntent {
  if (!section.createSurface) {
    throw new Error(`Shell section "${section.id}" has no create surface.`);
  }

  const scope = {
    sectionId: section.id,
    shellId: section.shellId,
    surfaceId: section.createSurface.id,
    type: "shellCreate" as const,
  };

  if ("surfaceId" in intent) {
    return { ...scope, intent };
  }

  if (fieldId === undefined) {
    throw new Error("Shell create field intents require a projected field occurrence id.");
  }

  return {
    ...scope,
    fieldId,
    intent,
  };
}

export function astryxApplicationShellLogoutIntent(
  section: ShellNavigationSectionContract,
  session: Extract<
    ShellSessionContract,
    {
      state: "authenticated";
    }
  >,
): ShellIntent {
  return {
    controlId: session.logout.id,
    sectionId: section.id,
    shellId: section.shellId,
    type: "shellLogout",
  };
}
