import { AppShell, type AppShellVariant } from "@astryxdesign/core/AppShell";
import { memo, type ReactNode, useState } from "react";
import type {
  DocumentThemeContract,
  DocumentThemeIntentHandler,
  DocumentThemeReference,
  ShellIntentHandler,
  ShellManifestContract,
  ShellManifestReference,
  ShellNavigationSectionContract,
} from "@dpeek/formless-presentation/contract";
import {
  useDocumentTheme,
  useDocumentThemeIntentHandler,
  useShellManifest,
} from "@dpeek/formless-presentation/host/react";
import { AstryxApplicationSideNav, AstryxSubscribedApplicationSideNav } from "./side-nav.tsx";
import { FormlessThemeIconToggle } from "./theme.tsx";

type AstryxApplicationShellRendererProps = {
  children: ReactNode;
  manifest: ShellManifestContract;
  onIntent: ShellIntentHandler;
  sections: readonly ShellNavigationSectionContract[];
  variant?: AppShellVariant;
} & (
  | {
      onThemeIntent: DocumentThemeIntentHandler;
      theme: DocumentThemeContract;
    }
  | {
      onThemeIntent?: undefined;
      theme?: undefined;
    }
);

export function AstryxApplicationShellRenderer({
  children,
  manifest,
  onIntent,
  onThemeIntent,
  sections,
  theme,
  variant,
}: AstryxApplicationShellRendererProps) {
  const orderedSections = orderShellSections(manifest, sections);
  const themeControl =
    theme?.selectionControl && onThemeIntent ? (
      <FormlessThemeIconToggle
        activeMode={theme.activeMode}
        control={theme.selectionControl}
        onIntent={onThemeIntent}
      />
    ) : undefined;

  const shell = (
    <AstryxApplicationShellFrame
      manifest={manifest}
      sideNav={
        <AstryxApplicationSideNav
          manifest={manifest}
          onIntent={onIntent}
          sections={orderedSections}
          themeControl={themeControl}
        />
      }
      variant={variant}
    >
      {children}
    </AstryxApplicationShellFrame>
  );

  return shell;
}

export const AstryxSubscribedApplicationShellRenderer = memo(
  function AstryxSubscribedApplicationShellRenderer({
    children,
    shellReference,
    themeControl,
    themeReference,
    variant,
  }: {
    children: ReactNode;
    shellReference: ShellManifestReference;
    themeControl?: ReactNode;
    themeReference?: DocumentThemeReference | undefined;
    variant?: AppShellVariant;
  }) {
    const manifest = useShellManifest(shellReference);

    if (!manifest) {
      return children;
    }

    return themeReference ? (
      <AstryxSubscribedThemedApplicationShell
        manifest={manifest}
        themeControl={themeControl}
        themeReference={themeReference}
        variant={variant}
      >
        {children}
      </AstryxSubscribedThemedApplicationShell>
    ) : (
      <AstryxSubscribedApplicationShellContent
        manifest={manifest}
        themeControl={themeControl}
        variant={variant}
      >
        {children}
      </AstryxSubscribedApplicationShellContent>
    );
  },
  (previous, next) =>
    previous.shellReference.shellId === next.shellReference.shellId &&
    previous.themeReference?.themeId === next.themeReference?.themeId &&
    previous.themeControl === next.themeControl &&
    previous.variant === next.variant &&
    previous.children === next.children,
);

function AstryxSubscribedThemedApplicationShell({
  children,
  manifest,
  themeControl,
  themeReference,
  variant,
}: {
  children: ReactNode;
  manifest: ShellManifestContract;
  themeControl?: ReactNode;
  themeReference: DocumentThemeReference;
  variant?: AppShellVariant;
}) {
  const onThemeIntent = useDocumentThemeIntentHandler();
  const theme = useDocumentTheme(themeReference);
  const resolvedThemeControl = theme ? (
    theme.selectionControl ? (
      <FormlessThemeIconToggle
        activeMode={theme.activeMode}
        control={theme.selectionControl}
        onIntent={onThemeIntent}
      />
    ) : undefined
  ) : (
    themeControl
  );
  const shell = (
    <AstryxSubscribedApplicationShellContent
      manifest={manifest}
      themeControl={resolvedThemeControl}
      variant={variant}
    >
      {children}
    </AstryxSubscribedApplicationShellContent>
  );

  return shell;
}

function AstryxSubscribedApplicationShellContent({
  children,
  manifest,
  themeControl,
  variant,
}: {
  children: ReactNode;
  manifest: ShellManifestContract;
  themeControl?: ReactNode;
  variant?: AppShellVariant;
}) {
  return (
    <AstryxApplicationShellFrame
      manifest={manifest}
      sideNav={
        <AstryxSubscribedApplicationSideNav
          manifest={manifest}
          references={manifest.navigationSections}
          themeControl={themeControl}
        />
      }
      variant={variant}
    >
      {children}
    </AstryxApplicationShellFrame>
  );
}

function AstryxApplicationShellFrame({
  children,
  manifest,
  sideNav,
  variant,
}: {
  children: ReactNode;
  manifest: ShellManifestContract;
  sideNav: ReactNode;
  variant?: AppShellVariant;
}) {
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false);

  return (
    <div aria-label={manifest.accessibilityLabel} role="application">
      <AppShell
        contentPadding={0}
        data-testid={`formless-astryx-application-shell:${manifest.id}`}
        mobileNav={{
          breakpoint: "md",
          isOpen: isMobileNavigationOpen,
          onOpenChange: setIsMobileNavigationOpen,
        }}
        sideNav={sideNav}
        variant={variant}
      >
        {children}
      </AppShell>
    </div>
  );
}

function orderShellSections(
  manifest: ShellManifestContract,
  sections: readonly ShellNavigationSectionContract[],
) {
  const sectionById = new Map(sections.map((section) => [section.id, section]));

  return manifest.navigationSections.flatMap((reference) => {
    const section = sectionById.get(reference.sectionId);
    return section?.shellId === reference.shellId ? [section] : [];
  });
}
