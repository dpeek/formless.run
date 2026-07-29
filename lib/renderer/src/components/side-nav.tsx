import { Avatar } from "@astryxdesign/core/Avatar";
import { Badge, type BadgeVariant } from "@astryxdesign/core/Badge";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { HStack } from "@astryxdesign/core/HStack";
import { HoverCard } from "@astryxdesign/core/HoverCard";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { NavHeadingMenu, NavHeadingMenuItem } from "@astryxdesign/core/NavMenu";
import { SideNav, SideNavHeading, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { Text } from "@astryxdesign/core/Text";
import { radiusVars } from "@astryxdesign/core/theme/tokens.stylex";
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
  ShellSettingsContract,
} from "@dpeek/formless-presentation/contract";
import {
  useShellIntentHandler,
  useShellNavigationSection,
} from "@dpeek/formless-presentation/host/react";
import { AstryxCreateSurfaceRenderer } from "./create-renderer.tsx";

type AstryxShellSectionSlot = "appSwitcher" | "navigation" | "session";

const shellSessionStyles = stylex.create({
  avatarTrigger: {
    borderRadius: radiusVars["--radius-full"],
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
  return (
    <AstryxApplicationSideNavFrame
      appSwitcher={sections.map((section) => (
        <AstryxApplicationShellSectionSlot
          key={section.id}
          onIntent={onIntent}
          section={section}
          slot="appSwitcher"
        />
      ))}
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

  return (
    <AstryxApplicationSideNavFrame
      appSwitcher={references.map((reference) => (
        <AstryxSubscribedApplicationShellSectionSlot
          key={`${reference.shellId}:${reference.sectionId}`}
          onIntent={onIntent}
          reference={reference}
          slot="appSwitcher"
        />
      ))}
      manifest={manifest}
      navigation={references.map((reference) => (
        <AstryxSubscribedApplicationShellSectionSlot
          key={`${reference.shellId}:${reference.sectionId}`}
          onIntent={onIntent}
          reference={reference}
          slot="navigation"
        />
      ))}
      session={references.map((reference) => (
        <AstryxSubscribedApplicationShellSectionSlot
          key={`${reference.shellId}:${reference.sectionId}`}
          onIntent={onIntent}
          reference={reference}
          slot="session"
        />
      ))}
      themeControl={themeControl}
    />
  );
}

function AstryxApplicationSideNavFrame({
  appSwitcher,
  manifest,
  navigation,
  session,
  themeControl,
}: {
  appSwitcher: ReactNode;
  manifest: ShellManifestContract;
  navigation: ReactNode;
  session: ReactNode;
  themeControl?: ReactNode;
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
          {themeControl}
        </HStack>
      }
      header={
        <SideNavHeading
          heading={manifest.title}
          menu={
            manifest.scope === "multiApp" ? (
              <NavHeadingMenu size="lg">{appSwitcher}</NavHeadingMenu>
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
  if (slot === "appSwitcher") {
    return section.role === "appSwitcher" ? (
      <AstryxApplicationSwitcherSection section={section} />
    ) : null;
  }

  if (slot === "session") {
    return section.role === "session" && section.session ? (
      <AstryxShellSession onIntent={onIntent} section={section} session={section.session} />
    ) : null;
  }

  if (section.role === "appSwitcher" || section.role === "session") {
    return null;
  }

  return <AstryxShellNavigationSection onIntent={onIntent} section={section} />;
}

function AstryxApplicationSwitcherSection({
  section,
}: {
  section: ShellNavigationSectionContract;
}) {
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
  if (section.role === "appSettings" && section.settings) {
    return <AstryxShellSettingsNavigationItem section={section} settings={section.settings} />;
  }

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

function AstryxShellSettingsNavigationItem({
  section,
  settings,
}: {
  section: ShellNavigationSectionContract;
  settings: ShellSettingsContract;
}) {
  return (
    <HoverCard
      alignment="start"
      content={<AstryxShellSettings settings={settings} />}
      focusTrigger="always"
      hasHoverIndication={false}
      placement="end"
    >
      <SideNavItem label={section.label ?? section.accessibilityLabel} />
    </HoverCard>
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

function AstryxShellSettings({ settings }: { settings: ShellSettingsContract }) {
  return (
    <VStack gap={3} width="100%">
      {settings.sync ? (
        <VStack aria-label={settings.sync.label} gap={1} role="status" width="100%">
          <HStack align="center" gap={2} justify="between" width="100%">
            <Text type="supporting" weight="medium">
              {settings.sync.message}
            </Text>
            <Badge label={settings.sync.label} variant={syncStatusVariant(settings.sync.state)} />
          </HStack>
          {settings.sync.details ? (
            <MetadataList columns="single">
              {settings.sync.details.map((detail) => (
                <MetadataListItem key={detail.label} label={detail.label}>
                  {detail.value}
                </MetadataListItem>
              ))}
            </MetadataList>
          ) : null}
        </VStack>
      ) : null}
      {settings.workspaceSave ? (
        <HStack align="center" gap={2} justify="between" role="status" width="100%">
          <Text type="supporting">{settings.workspaceSave.message}</Text>
          <Badge
            label={settings.workspaceSave.label}
            variant={workspaceSaveStatusVariant(settings.workspaceSave.state)}
          />
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
          icon: <Avatar name={session.identity.displayName} size="xsmall" />,
          isIconOnly: true,
          label: session.identity.displayName,
          size: "sm",
          variant: "ghost",
          xstyle: shellSessionStyles.avatarTrigger,
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

function syncStatusVariant(
  state: NonNullable<ShellSettingsContract["sync"]>["state"],
): BadgeVariant {
  return state === "error" ? "error" : state === "syncing" ? "info" : "success";
}

function workspaceSaveStatusVariant(
  state: NonNullable<ShellSettingsContract["workspaceSave"]>["state"],
): BadgeVariant {
  return state === "failed"
    ? "error"
    : state === "clean" || state === "saved"
      ? "success"
      : state === "dirty"
        ? "warning"
        : "info";
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
