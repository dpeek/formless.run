import {
  useMemo,
  useState,
  useSyncExternalStore,
  type ComponentPropsWithRef,
  type ComponentType,
  type FormEvent,
  type ReactNode,
} from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import {
  borderVars,
  colorVars,
  fontWeightVars,
  radiusVars,
  spacingVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import { Card } from "@astryxdesign/core/Card";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { DateInput } from "@astryxdesign/core/DateInput";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Layout, LayoutContent, LayoutFooter, LayoutHeader } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { MobileNav } from "@astryxdesign/core/MobileNav";
import { Selector, type SelectorOptionData } from "@astryxdesign/core/Selector";
import { SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Heading, Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { createStaticSource, Typeahead, type SearchableItem } from "@astryxdesign/core/Typeahead";
import {
  TopNav,
  TopNavItem,
  type TopNavItemProps,
  type TopNavProps,
} from "@astryxdesign/core/TopNav";
import { VStack } from "@astryxdesign/core/VStack";
import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import { MoonIcon, SunIcon } from "@heroicons/react/24/outline";
import { Markdown } from "@astryxdesign/core/Markdown";
import {
  createSitePublicFormSessionController,
  isExternalSiteHref,
  profileAwareSiteHref,
  siteHrefMatchesRoute,
  siteLinkRel,
  siteLinkTarget,
  sitePagePathForSlug,
  type SiteBlockNode,
  type SitePlacementNode,
  type SitePublicFormField,
  type SitePublicFormFieldValue,
  type SitePublicFormSession,
  type SitePublicFormSessionController,
  type SitePublicFormStatus,
  type SitePublicRendererComponent,
  type SitePublicRendererProps,
} from "@dpeek/formless-site-app";
import {
  SitePublicTurnstileChallenge,
  usePublicSiteTheme,
} from "@dpeek/formless-site-app/public/react";
import type {
  FieldInputAttributes,
  FieldSchema,
  GeneratedFieldDraftInput,
  PublicSafeOperationInputField,
} from "@dpeek/formless-schema";
import type {
  FieldAccess,
  FieldControl,
  FieldOptions,
  OperationInputFieldContract,
} from "@dpeek/formless-presentation/contract";
import { FormlessSiteRendererProvider } from "../site-provider.tsx";
import { SourceIcon } from "./field-primitives.tsx";

export const FormlessSitePageRenderer: SitePublicRendererComponent = (rendererProps) => (
  <AstryxSitePresentation rendererProps={rendererProps} />
);

export function AstryxSitePresentation({
  formChallengeComponent,
  formSessionControllers,
  rendererProps,
}: {
  formChallengeComponent?: ProjectedPublicFormChallengeComponent;
  formSessionControllers?: ReadonlyMap<string, SitePublicFormSessionController>;
  rendererProps: SitePublicRendererProps;
}) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const theme = usePublicSiteTheme();
  const isMobile = useMediaQuery("(max-width: 768px)");
  const { tree } = rendererProps;
  const siteLabel = tree.site?.label ?? tree.page.label;
  const homeHref = sitePagePathForSlug("home", rendererProps.linkMode, rendererProps.routeBase);
  const headerNavigation = projectedHeaderNavigation(tree.frame.header, rendererProps);
  const hasMobileNavigation = headerNavigation.some((group) => group.links.length > 0);
  const header = tree.frame.header;
  const footer = tree.frame.footer;

  return (
    <FormlessSiteRendererProvider mode={theme.mode}>
      <FormlessSiteShell
        header={
          header ? (
            <LayoutHeader>
              <TopNav
                xstyle={siteTopNavXstyle}
                label={header.label}
                heading={
                  <FormlessSiteIdentity icon={tree.site?.icon} label={siteLabel} href={homeHref} />
                }
                startContent={
                  !isMobile ? (
                    <FormlessSiteDesktopNav
                      group={headerNavigation.find((group) => group.kind === "primary")}
                    />
                  ) : null
                }
                endContent={
                  <FormlessSiteHeaderActions
                    hasMobileNavigation={hasMobileNavigation}
                    isMobile={isMobile}
                    secondaryGroup={headerNavigation.find((group) => group.kind === "secondary")}
                    themeMode={theme.mode}
                    themeSwitchable={theme.switchable}
                    onOpenMobileNav={() => setIsMobileNavOpen(true)}
                    onToggleTheme={theme.toggleMode}
                  />
                }
              />
            </LayoutHeader>
          ) : undefined
        }
        content={
          <LayoutContent role="main">
            <FormlessPublicSiteRouteEntrypoint
              formChallengeComponent={formChallengeComponent}
              formSessionControllers={formSessionControllers}
              rendererProps={rendererProps}
            />
          </LayoutContent>
        }
        footer={
          footer ? (
            <LayoutFooter>
              <FormlessSiteFooter footer={footer} rendererProps={rendererProps} />
            </LayoutFooter>
          ) : undefined
        }
        mobileNav={
          header && hasMobileNavigation ? (
            <MobileNav
              isOpen={isMobileNavOpen}
              onOpenChange={setIsMobileNavOpen}
              header={siteLabel}
              label={header.label}
            >
              <FormlessSiteMobileNav
                groups={headerNavigation}
                onNavigate={() => setIsMobileNavOpen(false)}
              />
            </MobileNav>
          ) : undefined
        }
      />
    </FormlessSiteRendererProvider>
  );
}

const styles = stylex.create({
  siteShell: {
    minHeight: "100vh",
    backgroundColor: colorVars["--color-background-body"],
    color: colorVars["--color-text-primary"],
  },
  siteTopNav: {
    paddingInlineStart: 0,
    paddingInlineEnd: 0,
  },
  siteIdentityNavItem: {
    color: colorVars["--color-text-primary"],
    fontWeight: fontWeightVars["--font-weight-semibold"],
    marginInlineStart: `calc(-1 * ${spacingVars["--spacing-3"]})`,
  },
  mainContent: {
    paddingBlockStart: spacingVars["--spacing-12"],
    paddingBlockEnd: spacingVars["--spacing-12"],
  },
  blockStack: {
    width: "100%",
  },
  sectionBlock: {
    borderTopWidth: borderVars["--border-width"],
    borderTopStyle: "solid",
    borderTopColor: colorVars["--color-border"],
    paddingBlockStart: spacingVars["--spacing-8"],
  },
  sectionContent: {
    maxWidth: 720,
  },
  markdownBody: {
    color: colorVars["--color-text-secondary"],
  },
  plainText: {
    color: colorVars["--color-text-secondary"],
    whiteSpace: "pre-line",
  },
  heroBlock: {
    paddingBlock: spacingVars["--spacing-4"],
  },
  featureBlock: {
    paddingBlock: spacingVars["--spacing-4"],
  },
  featureContent: {
    minWidth: 0,
  },
  featureMedia: {
    minWidth: 0,
  },
  cardBody: {
    minHeight: 150,
  },
  cardIcon: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: spacingVars["--spacing-9"],
    height: spacingVars["--spacing-9"],
    borderRadius: radiusVars["--radius-element"],
    backgroundColor: colorVars["--color-background-muted"],
  },
  metricBody: {
    minHeight: 132,
  },
  metricValue: {
    color: colorVars["--color-text-primary"],
    fontWeight: fontWeightVars["--font-weight-semibold"],
  },
  publicFormCard: {
    minHeight: 260,
  },
  publicFormHeader: {
    minWidth: 0,
  },
  publicForm: {
    width: "100%",
  },
  publicFormFields: {
    width: "100%",
  },
  publicFormNotice: {
    borderWidth: borderVars["--border-width"],
    borderStyle: "solid",
    borderColor: colorVars["--color-border"],
    borderRadius: radiusVars["--radius-element"],
    paddingBlock: spacingVars["--spacing-3"],
    paddingInline: spacingVars["--spacing-3"],
    backgroundColor: colorVars["--color-background-muted"],
  },
  publicFormNoticeSuccess: {
    borderColor: colorVars["--color-success"],
    backgroundColor: colorVars["--color-success-muted"],
  },
  publicFormNoticeWarning: {
    borderColor: colorVars["--color-warning"],
    backgroundColor: colorVars["--color-warning-muted"],
  },
  publicFormNoticeError: {
    borderColor: colorVars["--color-error"],
    backgroundColor: colorVars["--color-error-muted"],
  },
  publicFormActions: {
    paddingBlockStart: spacingVars["--spacing-1"],
  },
  publicFormChallenge: {
    minHeight: 65,
  },
  publicFormChallengeDisabled: {
    opacity: 0.6,
    pointerEvents: "none",
  },
  imageFigure: {
    margin: 0,
    width: "100%",
  },
  imageFrame: {
    overflow: "hidden",
    width: "100%",
    aspectRatio: "4 / 3",
    borderRadius: radiusVars["--radius-container"],
    borderWidth: borderVars["--border-width"],
    borderStyle: "solid",
    borderColor: colorVars["--color-border"],
    backgroundColor: colorVars["--color-background-muted"],
  },
  image: {
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  summaryImage: {
    objectFit: "contain",
  },
  missingImage: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 128,
    paddingBlock: spacingVars["--spacing-6"],
    paddingInline: spacingVars["--spacing-6"],
    textAlign: "center",
  },
  summaryLayout: {
    alignItems: "flex-start",
  },
  summaryCard: {
    position: "relative",
  },
  summaryLink: {
    position: "absolute",
    inset: 0,
    zIndex: 1,
    borderRadius: radiusVars["--radius-container"],
  },
  summaryInteractiveContent: {
    position: "relative",
    zIndex: 2,
    pointerEvents: "none",
  },
  summaryNestedLink: {
    position: "relative",
    zIndex: 3,
    pointerEvents: "auto",
  },
  summaryDate: {
    color: colorVars["--color-text-secondary"],
  },
  summaryMedia: {
    width: "100%",
    maxWidth: 260,
  },
  summaryContent: {
    minWidth: 0,
    flex: 1,
  },
  linkList: {
    minWidth: 160,
  },
  footerColumns: {
    alignItems: "flex-start",
  },
  inlineLinkIcon: {
    display: "inline-flex",
    alignItems: "center",
  },
});

const dynamicStyles = stylex.create({
  blockColor: (color: string) => ({
    color,
  }),
  imageAspect: (width: number, height: number) => ({
    aspectRatio: `${width} / ${height}`,
  }),
});

// Astryx core and this package can resolve different StyleX type brands.
// The runtime style objects are compatible; keep the cast at the boundary.
const siteTopNavXstyle = styles.siteTopNav as unknown as NonNullable<TopNavProps["xstyle"]>;
const siteIdentityNavItemXstyle = styles.siteIdentityNavItem as unknown as NonNullable<
  TopNavItemProps["xstyle"]
>;

type FormlessSiteShellProps = {
  content: ReactNode;
  footer?: ReactNode;
  header?: ReactNode;
  mobileNav?: ReactNode;
};

export function FormlessSiteShell({ content, footer, header, mobileNav }: FormlessSiteShellProps) {
  const shellStyles = stylex.props(styles.siteShell);

  return (
    <>
      <Layout
        {...shellStyles}
        height="auto"
        padding={6}
        contentWidth={960}
        header={header}
        content={content}
        footer={footer}
      />
      {mobileNav}
    </>
  );
}

function FormlessSiteIdentity({
  icon,
  label,
  href,
}: {
  icon?: string;
  label: string;
  href: string;
}) {
  return (
    <TopNavItem
      href={href}
      icon={<SourceIcon source={icon} color="inherit" aria-hidden />}
      label={label}
      xstyle={siteIdentityNavItemXstyle}
    />
  );
}

type FormlessSiteHeaderActionsProps = {
  hasMobileNavigation: boolean;
  isMobile: boolean;
  secondaryGroup?: ProjectedNavigationGroup;
  themeMode: "light" | "dark";
  themeSwitchable: boolean;
  onOpenMobileNav: () => void;
  onToggleTheme: () => void;
};

function FormlessSiteHeaderActions({
  hasMobileNavigation,
  isMobile,
  secondaryGroup,
  themeMode,
  themeSwitchable,
  onOpenMobileNav,
  onToggleTheme,
}: FormlessSiteHeaderActionsProps) {
  const nextThemeMode = themeMode === "light" ? "dark" : "light";
  const ThemeIcon = themeMode === "light" ? MoonIcon : SunIcon;

  return (
    <HStack gap={2} vAlign="center" wrap="wrap">
      {!isMobile ? <FormlessSiteDesktopNav group={secondaryGroup} /> : null}
      {themeSwitchable ? (
        <IconButton
          aria-pressed={themeMode === "dark"}
          data-site-theme-control={themeMode}
          label={`Switch to ${nextThemeMode} mode`}
          tooltip={`Switch to ${nextThemeMode} mode`}
          variant="ghost"
          icon={<ThemeIcon aria-hidden="true" />}
          onClick={onToggleTheme}
        />
      ) : null}
      {isMobile && hasMobileNavigation ? (
        <IconButton
          label="Open navigation"
          tooltip="Open navigation"
          variant="ghost"
          icon={<Icon icon="menu" color="inherit" />}
          onClick={onOpenMobileNav}
        />
      ) : null}
    </HStack>
  );
}

type ProjectedShellLink = {
  label: string;
  publicHref: string;
  isExternal: boolean;
  isSelected: boolean;
  icon?: string;
};

type ProjectedNavigationGroup = {
  kind: "primary" | "secondary";
  label: string;
  links: readonly ProjectedShellLink[];
};

type ProjectedFormRenderingFacts = {
  challengeComponent?: ProjectedPublicFormChallengeComponent;
  sessionControllers?: ReadonlyMap<string, SitePublicFormSessionController>;
};

export type ProjectedPublicFormChallengeComponent = ComponentType<{
  onTokenChange: (token: string) => void;
  resetSignal: number;
  siteKey: string;
}>;

function FormlessSiteDesktopNav({ group }: { group?: ProjectedNavigationGroup }) {
  if (!group || group.links.length === 0) {
    return null;
  }

  return (
    <HStack gap={1} data-site-navigation-group={group.kind}>
      {group.links.map((item) => (
        <TopNavItem
          key={`${item.label}:${item.publicHref}`}
          label={item.label}
          href={item.publicHref}
          target={siteLinkTarget(item.publicHref)}
          rel={siteLinkRel(item.publicHref)}
          isSelected={item.isSelected}
          data-public-href={item.publicHref}
        />
      ))}
    </HStack>
  );
}

type FormlessSiteMobileNavProps = {
  groups: readonly ProjectedNavigationGroup[];
  onNavigate: () => void;
};

function FormlessSiteMobileNav({ groups, onNavigate }: FormlessSiteMobileNavProps) {
  return (
    <>
      {groups.map((group) => (
        <SideNavSection key={group.kind} title={group.label}>
          {group.links.map((item) => (
            <SideNavItem
              key={`${item.label}:${item.publicHref}`}
              as={item.isExternal ? ExternalSiteNavigationLink : undefined}
              label={item.label}
              href={item.publicHref}
              isSelected={item.isSelected}
              onClick={onNavigate}
              data-public-href={item.publicHref}
            />
          ))}
        </SideNavSection>
      ))}
    </>
  );
}

function ExternalSiteNavigationLink({ href, ...anchorProps }: ComponentPropsWithRef<"a">) {
  return (
    <a
      {...anchorProps}
      href={href}
      target={siteLinkTarget(href ?? "")}
      rel={siteLinkRel(href ?? "")}
    />
  );
}

function FormlessPublicSiteRouteEntrypoint({
  formChallengeComponent,
  formSessionControllers,
  rendererProps,
}: {
  formChallengeComponent?: ProjectedPublicFormChallengeComponent;
  formSessionControllers?: ReadonlyMap<string, SitePublicFormSessionController>;
  rendererProps: SitePublicRendererProps;
}) {
  const { tree } = rendererProps;
  const formFacts = {
    ...(formChallengeComponent ? { challengeComponent: formChallengeComponent } : {}),
    ...(formSessionControllers ? { sessionControllers: formSessionControllers } : {}),
  } satisfies ProjectedFormRenderingFacts;

  return <ProjectedPageBlock block={tree.page} formFacts={formFacts} routeFacts={rendererProps} />;
}

function FormlessSiteFooter({
  footer,
  rendererProps,
}: {
  footer: SiteBlockNode;
  rendererProps: SitePublicRendererProps;
}) {
  const footerComposition = projectedFooterComposition(footer, rendererProps);
  const footerNotes = footerComposition.notes;

  return (
    <VStack gap={8}>
      <HStack gap={10} hAlign="start" wrap="wrap" {...stylex.props(styles.footerColumns)}>
        {footerComposition.groups.map((group) => (
          <VStack
            key={`${group.kind}:${group.label}`}
            gap={2}
            data-site-footer-group={group.kind}
            {...stylex.props(styles.linkList)}
          >
            <Text type="supporting" weight="semibold" as="p">
              {group.label}
            </Text>
            <nav aria-label={group.label}>
              <VStack gap={2}>
                {group.links.map((item) => (
                  <ProjectedFooterLink
                    key={`${item.label}:${item.publicHref}`}
                    item={item}
                    social={group.kind === "social"}
                  />
                ))}
              </VStack>
            </nav>
          </VStack>
        ))}
      </HStack>
      {footerNotes.map((note, index) => (
        <Text key={`${index}:${note}`} type="supporting" as="p">
          {note}
        </Text>
      ))}
    </VStack>
  );
}

function ProjectedPlacementList({
  formFacts,
  headingLevel,
  placements,
  routeFacts,
}: {
  formFacts: ProjectedFormRenderingFacts;
  headingLevel: SiteHeadingLevel;
  placements: readonly SitePlacementNode[];
  routeFacts: SitePublicRendererProps;
}) {
  const ordered = orderedPlacements(placements);

  if (ordered.length === 0) {
    return null;
  }

  return (
    <VStack gap={8} {...stylex.props(styles.blockStack)}>
      {ordered.map((placement) => (
        <ProjectedSiteBlock
          key={placement.id}
          block={placement.block}
          formFacts={formFacts}
          headingLevel={headingLevel}
          placement={placement}
          routeFacts={routeFacts}
        />
      ))}
    </VStack>
  );
}

function ProjectedSiteBlock({
  block,
  formFacts,
  headingLevel,
  placement,
  routeFacts,
}: {
  block: SiteBlockNode;
  formFacts: ProjectedFormRenderingFacts;
  headingLevel: SiteHeadingLevel;
  placement?: SitePlacementNode;
  routeFacts: SitePublicRendererProps;
}) {
  switch (block.type) {
    case "page":
      return <ProjectedPageBlock block={block} formFacts={formFacts} routeFacts={routeFacts} />;
    case "group":
      return (
        <ProjectedGroupBlock
          block={block}
          formFacts={formFacts}
          headingLevel={headingLevel}
          placement={placement}
          routeFacts={routeFacts}
        />
      );
    case "hero":
      return (
        <ProjectedHeroBlock
          block={block}
          formFacts={formFacts}
          headingLevel={headingLevel}
          routeFacts={routeFacts}
        />
      );
    case "feature":
      return (
        <ProjectedFeatureBlock
          block={block}
          formFacts={formFacts}
          headingLevel={headingLevel}
          routeFacts={routeFacts}
        />
      );
    case "section":
      return (
        <ProjectedSectionBlock
          block={block}
          formFacts={formFacts}
          headingLevel={headingLevel}
          routeFacts={routeFacts}
        />
      );
    case "cardGrid":
      return (
        <ProjectedCardGridBlock
          block={block}
          formFacts={formFacts}
          headingLevel={headingLevel}
          routeFacts={routeFacts}
        />
      );
    case "card":
      return (
        <ProjectedCardBlock
          block={block}
          formFacts={formFacts}
          headingLevel={headingLevel}
          routeFacts={routeFacts}
        />
      );
    case "metricGrid":
      return (
        <ProjectedMetricGridBlock
          block={block}
          formFacts={formFacts}
          headingLevel={headingLevel}
          routeFacts={routeFacts}
        />
      );
    case "metric":
      return <ProjectedMetricBlock block={block} headingLevel={headingLevel} />;
    case "markdown":
      return (
        <ProjectedMarkdownBlock
          block={block}
          formFacts={formFacts}
          headingLevel={headingLevel}
          routeFacts={routeFacts}
        />
      );
    case "image":
      return <ProjectedImageBlock block={block} />;
    case "link":
      return (
        <ProjectedInlineLinkBlock block={block} placement={placement} routeFacts={routeFacts} />
      );
    case "subscribeForm":
    case "contactForm":
    case "publicOperationForm":
      return (
        <ProjectedPublicFormBlock block={block} formFacts={formFacts} headingLevel={headingLevel} />
      );
    case "postList":
    case "projectList":
      return (
        <ProjectedContentListBlock
          block={block}
          headingLevel={headingLevel}
          routeFacts={routeFacts}
        />
      );
    case "post":
    case "project":
      return (
        <ProjectedContentSummary
          block={block}
          headingLevel={headingLevel}
          routeFacts={routeFacts}
        />
      );
    default:
      return null;
  }
}

type SiteHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

function ProjectedPageBlock({
  block,
  formFacts,
  routeFacts,
}: {
  block: SiteBlockNode;
  formFacts: ProjectedFormRenderingFacts;
  routeFacts: SitePublicRendererProps;
}) {
  const isPostDetail = routeFacts.tree.route?.kind === "post";
  const primaryImage = isPostDetail ? primaryImagePlacement(block) : undefined;

  return (
    <VStack
      gap={8}
      data-site-block-type={block.type}
      data-site-block-id={block.id}
      {...stylex.props(styles.mainContent)}
    >
      <VStack gap={4}>
        {primaryImage ? (
          <ProjectedPrimaryImage placement={primaryImage} variant="post-detail" />
        ) : null}
        {isPostDetail ? null : <ProjectedMarkdown body={block.body} headingLevelStart={1} />}
      </VStack>
      <ProjectedPlacementList
        formFacts={formFacts}
        headingLevel={1}
        placements={defaultPlacements(block)}
        routeFacts={routeFacts}
      />
    </VStack>
  );
}

function ProjectedGroupBlock({
  block,
  formFacts,
  headingLevel,
  placement,
  routeFacts,
}: {
  block: SiteBlockNode;
  formFacts: ProjectedFormRenderingFacts;
  headingLevel: SiteHeadingLevel;
  placement?: SitePlacementNode;
  routeFacts: SitePublicRendererProps;
}) {
  const label = placement?.label ?? block.label;

  return (
    <section id={block.id} data-site-block-type={block.type}>
      <VStack gap={4}>
        {label ? <Heading level={headingLevel}>{label}</Heading> : null}
        <ProjectedPlainText body={block.body} />
        <ProjectedPlacementList
          formFacts={formFacts}
          headingLevel={nextHeadingLevel(headingLevel)}
          placements={defaultPlacements(block)}
          routeFacts={routeFacts}
        />
      </VStack>
    </section>
  );
}

function ProjectedHeroBlock({
  block,
  formFacts,
  headingLevel,
  routeFacts,
}: {
  block: SiteBlockNode;
  formFacts: ProjectedFormRenderingFacts;
  headingLevel: SiteHeadingLevel;
  routeFacts: SitePublicRendererProps;
}) {
  const media = orderedPlacements(block.placements).filter(
    (placement) => placement.block.type === "image",
  );
  const mediaIds = new Set(media.map((placement) => placement.id));
  const children = defaultPlacements(block).filter((placement) => !mediaIds.has(placement.id));
  const content = (
    <VStack gap={4}>
      {block.label ? (
        <Heading level={headingLevel} type="display-1">
          {block.label}
        </Heading>
      ) : null}
      <ProjectedPlainText body={block.body} />
    </VStack>
  );

  return (
    <section id={block.id} data-site-block-type={block.type} {...stylex.props(styles.heroBlock)}>
      <VStack gap={5}>
        {media.length > 0 ? (
          <Grid columns={{ minWidth: 280, max: 2, repeat: "fit" }} gap={6} width="100%">
            {content}
            <div data-site-hero-media>
              <ProjectedPlacementList
                formFacts={formFacts}
                headingLevel={nextHeadingLevel(headingLevel)}
                placements={media}
                routeFacts={routeFacts}
              />
            </div>
          </Grid>
        ) : (
          content
        )}
        <ProjectedPlacementList
          formFacts={formFacts}
          headingLevel={nextHeadingLevel(headingLevel)}
          placements={children}
          routeFacts={routeFacts}
        />
      </VStack>
    </section>
  );
}

function ProjectedFeatureBlock({
  block,
  formFacts,
  headingLevel,
  routeFacts,
}: {
  block: SiteBlockNode;
  formFacts: ProjectedFormRenderingFacts;
  headingLevel: SiteHeadingLevel;
  routeFacts: SitePublicRendererProps;
}) {
  const media = slottedPlacements(block, "media", "image");
  const actions = slottedPlacements(block, "actions", "link");
  const mediaSide = block.alignment === "right" ? "right" : "left";
  const content = (
    <VStack gap={4} {...stylex.props(styles.featureContent)}>
      {block.label ? <Heading level={headingLevel}>{block.label}</Heading> : null}
      <ProjectedMarkdown body={block.body} headingLevelStart={nextHeadingLevel(headingLevel)} />
      {actions.length > 0 ? (
        <nav aria-label={`${block.label} actions`} data-site-feature-actions>
          <ProjectedPlacementList
            formFacts={formFacts}
            headingLevel={nextHeadingLevel(headingLevel)}
            placements={actions}
            routeFacts={routeFacts}
          />
        </nav>
      ) : null}
    </VStack>
  );
  const mediaContent =
    media.length > 0 ? (
      <div data-site-feature-media {...stylex.props(styles.featureMedia)}>
        <ProjectedPlacementList
          formFacts={formFacts}
          headingLevel={nextHeadingLevel(headingLevel)}
          placements={media}
          routeFacts={routeFacts}
        />
      </div>
    ) : null;

  return (
    <section
      id={block.id}
      data-site-block-type={block.type}
      data-site-feature-alignment={mediaSide}
      {...stylex.props(styles.featureBlock)}
    >
      <VStack gap={5}>
        {mediaContent ? (
          <Grid columns={{ minWidth: 280, max: 2, repeat: "fit" }} gap={6} width="100%">
            {mediaSide === "left" ? (
              <>
                {mediaContent}
                {content}
              </>
            ) : (
              <>
                {content}
                {mediaContent}
              </>
            )}
          </Grid>
        ) : (
          content
        )}
        <ProjectedPlacementList
          formFacts={formFacts}
          headingLevel={nextHeadingLevel(headingLevel)}
          placements={defaultPlacements(block)}
          routeFacts={routeFacts}
        />
      </VStack>
    </section>
  );
}

function ProjectedSectionBlock({
  block,
  formFacts,
  headingLevel,
  routeFacts,
}: {
  block: SiteBlockNode;
  formFacts: ProjectedFormRenderingFacts;
  headingLevel: SiteHeadingLevel;
  routeFacts: SitePublicRendererProps;
}) {
  return (
    <section id={block.id} data-site-block-type={block.type} {...stylex.props(styles.sectionBlock)}>
      <VStack gap={5}>
        <VStack gap={2} {...stylex.props(styles.sectionContent)}>
          {block.label ? <Heading level={headingLevel}>{block.label}</Heading> : null}
          <ProjectedMarkdown body={block.body} headingLevelStart={nextHeadingLevel(headingLevel)} />
        </VStack>
        <ProjectedPlacementList
          formFacts={formFacts}
          headingLevel={nextHeadingLevel(headingLevel)}
          placements={defaultPlacements(block)}
          routeFacts={routeFacts}
        />
      </VStack>
    </section>
  );
}

function ProjectedCardGridBlock({
  block,
  formFacts,
  headingLevel,
  routeFacts,
}: {
  block: SiteBlockNode;
  formFacts: ProjectedFormRenderingFacts;
  headingLevel: SiteHeadingLevel;
  routeFacts: SitePublicRendererProps;
}) {
  const cards = defaultPlacements(block);

  return (
    <VStack gap={3} data-site-block-type={block.type}>
      {block.label ? <Heading level={headingLevel}>{block.label}</Heading> : null}
      <ProjectedMarkdown body={block.body} headingLevelStart={nextHeadingLevel(headingLevel)} />
      <Grid columns={{ minWidth: 220, max: 3, repeat: "fit" }} gap={4} width="100%">
        {cards.map((placement) => (
          <ProjectedSiteBlock
            key={placement.id}
            block={placement.block}
            formFacts={formFacts}
            headingLevel={nextHeadingLevel(headingLevel)}
            placement={placement}
            routeFacts={routeFacts}
          />
        ))}
      </Grid>
    </VStack>
  );
}

function ProjectedCardBlock({
  block,
  formFacts,
  headingLevel,
  routeFacts,
}: {
  block: SiteBlockNode;
  formFacts: ProjectedFormRenderingFacts;
  headingLevel: SiteHeadingLevel;
  routeFacts: SitePublicRendererProps;
}) {
  return (
    <Card
      padding={5}
      minHeight={180}
      data-site-block-type={block.type}
      data-site-block-color={block.color}
    >
      <VStack gap={3} {...stylex.props(styles.cardBody)}>
        {block.icon ? (
          <span
            {...stylex.props(
              styles.cardIcon,
              block.color ? dynamicStyles.blockColor(block.color) : null,
            )}
          >
            <SourceIcon source={block.icon} color="inherit" aria-hidden />
          </span>
        ) : null}
        {block.label ? <Heading level={headingLevel}>{block.label}</Heading> : null}
        <ProjectedMarkdown body={block.body} headingLevelStart={nextHeadingLevel(headingLevel)} />
        <ProjectedPlacementList
          formFacts={formFacts}
          headingLevel={nextHeadingLevel(headingLevel)}
          placements={defaultPlacements(block)}
          routeFacts={routeFacts}
        />
      </VStack>
    </Card>
  );
}

function ProjectedMetricGridBlock({
  block,
  formFacts,
  headingLevel,
  routeFacts,
}: {
  block: SiteBlockNode;
  formFacts: ProjectedFormRenderingFacts;
  headingLevel: SiteHeadingLevel;
  routeFacts: SitePublicRendererProps;
}) {
  const metrics = defaultPlacements(block);

  return (
    <VStack gap={3} data-site-block-type={block.type}>
      {block.label ? <Heading level={headingLevel}>{block.label}</Heading> : null}
      <ProjectedMarkdown body={block.body} headingLevelStart={nextHeadingLevel(headingLevel)} />
      <Grid columns={{ minWidth: 180, max: 3, repeat: "fit" }} gap={3} width="100%">
        {metrics.map((placement) => (
          <ProjectedSiteBlock
            key={placement.id}
            block={placement.block}
            formFacts={formFacts}
            headingLevel={nextHeadingLevel(headingLevel)}
            placement={placement}
            routeFacts={routeFacts}
          />
        ))}
      </Grid>
    </VStack>
  );
}

function ProjectedMetricBlock({
  block,
  headingLevel,
}: {
  block: SiteBlockNode;
  headingLevel: SiteHeadingLevel;
}) {
  return (
    <Card
      padding={4}
      minHeight={140}
      variant="muted"
      data-site-block-type={block.type}
      data-site-block-color={block.color}
    >
      <VStack gap={2} {...stylex.props(styles.metricBody)}>
        <Text
          type="large"
          as="p"
          {...stylex.props(
            styles.metricValue,
            block.color ? dynamicStyles.blockColor(block.color) : null,
          )}
        >
          {block.label}
        </Text>
        <ProjectedMarkdown body={block.body} headingLevelStart={headingLevel} />
      </VStack>
    </Card>
  );
}

function ProjectedMarkdownBlock({
  block,
  formFacts,
  headingLevel,
  routeFacts,
}: {
  block: SiteBlockNode;
  formFacts: ProjectedFormRenderingFacts;
  headingLevel: SiteHeadingLevel;
  routeFacts: SitePublicRendererProps;
}) {
  const hasHeading = Boolean(block.label && block.label !== "Body");

  return (
    <section id={block.id} data-site-block-type={block.type}>
      <VStack gap={3}>
        {hasHeading ? <Heading level={headingLevel}>{block.label}</Heading> : null}
        <ProjectedMarkdown
          body={block.body}
          headingLevelStart={hasHeading ? nextHeadingLevel(headingLevel) : headingLevel}
        />
        <ProjectedPlacementList
          formFacts={formFacts}
          headingLevel={hasHeading ? nextHeadingLevel(headingLevel) : headingLevel}
          placements={defaultPlacements(block)}
          routeFacts={routeFacts}
        />
      </VStack>
    </section>
  );
}

function ProjectedImageBlock({ block }: { block: SiteBlockNode }) {
  return (
    <figure
      {...stylex.props(styles.imageFigure)}
      data-media-asset-id={block.media?.assetId}
      data-site-image="block"
    >
      <ProjectedImageSurface block={block} variant="block" />
      <figcaption>
        <Text type="supporting" as="span" color="secondary">
          {block.label}
        </Text>
      </figcaption>
    </figure>
  );
}

type ProjectedImageVariant = "block" | "post-detail" | "summary";

function ProjectedPrimaryImage({
  placement,
  variant,
}: {
  placement: SitePlacementNode;
  variant: Exclude<ProjectedImageVariant, "block">;
}) {
  if (placement.block.type !== "image") {
    return null;
  }

  return (
    <figure
      {...stylex.props(styles.imageFigure)}
      data-media-asset-id={placement.block.media?.assetId}
      data-site-primary-image={variant}
    >
      <ProjectedImageSurface block={placement.block} variant={variant} />
    </figure>
  );
}

function ProjectedImageSurface({
  block,
  variant,
}: {
  block: SiteBlockNode;
  variant: ProjectedImageVariant;
}) {
  const aspectRatio = block.width && block.height ? `${block.width} / ${block.height}` : "4 / 3";
  const mediaHref = block.media?.href;

  return (
    <div
      {...stylex.props(
        styles.imageFrame,
        block.width && block.height ? dynamicStyles.imageAspect(block.width, block.height) : null,
      )}
      data-site-image-aspect-ratio={aspectRatio}
      data-site-image-variant={variant}
    >
      {mediaHref ? (
        <img
          src={mediaHref}
          alt={block.label}
          height={block.height}
          loading="lazy"
          width={block.width}
          {...stylex.props(styles.image, variant === "summary" ? styles.summaryImage : null)}
        />
      ) : (
        <div
          aria-label={block.label}
          data-site-image-missing
          {...stylex.props(styles.missingImage)}
        >
          <Text type="supporting" as="span" color="secondary">
            {block.label}
          </Text>
        </div>
      )}
    </div>
  );
}

function ProjectedInlineLinkBlock({
  block,
  placement,
  routeFacts,
}: {
  block: SiteBlockNode;
  placement?: SitePlacementNode;
  routeFacts: SitePublicRendererProps;
}) {
  if (!block.href) {
    return null;
  }

  const item = toProjectedShellLink(block, block.href, routeFacts, placement);

  if (placement?.slot === "actions") {
    return (
      <Button
        label={item.label}
        href={item.publicHref}
        target={siteLinkTarget(item.publicHref)}
        rel={siteLinkRel(item.publicHref)}
        icon={
          item.icon ? <SourceIcon source={item.icon} color="inherit" size="sm" aria-hidden /> : null
        }
        variant="primary"
        data-public-href={item.publicHref}
        data-site-action-link
      />
    );
  }

  return (
    <Link
      href={item.publicHref}
      target={siteLinkTarget(item.publicHref)}
      rel={siteLinkRel(item.publicHref)}
      isExternalLink={item.isExternal}
      isStandalone
      data-public-href={item.publicHref}
    >
      <ProjectedLinkLabel item={item} />
    </Link>
  );
}

function ProjectedContentListBlock({
  block,
  headingLevel,
  routeFacts,
}: {
  block: SiteBlockNode;
  headingLevel: SiteHeadingLevel;
  routeFacts: SitePublicRendererProps;
}) {
  const items = block.query?.items ?? [];

  return (
    <section data-site-block-type={block.type} data-site-content-list={block.type}>
      <VStack gap={4}>
        {block.label ? <Heading level={headingLevel}>{block.label}</Heading> : null}
        {items.length > 0 ? (
          <VStack gap={4}>
            {items.map((item) => (
              <ProjectedContentSummary
                key={item.id}
                block={item}
                headingLevel={nextHeadingLevel(headingLevel)}
                routeFacts={routeFacts}
              />
            ))}
          </VStack>
        ) : (
          <Text type="supporting" color="secondary" as="p">
            No published {block.type === "projectList" ? "projects" : "posts"} yet.
          </Text>
        )}
      </VStack>
    </section>
  );
}

function ProjectedContentSummary({
  block,
  headingLevel,
  routeFacts,
}: {
  block: SiteBlockNode;
  headingLevel: SiteHeadingLevel;
  routeFacts: SitePublicRendererProps;
}) {
  const primaryImage = primaryImagePlacement(block);
  const publicHref = block.href
    ? profileAwareSiteHref(block.href, routeFacts.linkMode, routeFacts.routeBase)
    : undefined;
  const summaryContent = (
    <HStack
      gap={4}
      wrap="wrap"
      data-site-summary-layout={primaryImage ? "media-start" : "text-only"}
      {...stylex.props(styles.summaryLayout, publicHref ? styles.summaryInteractiveContent : null)}
    >
      {primaryImage ? (
        <div data-site-summary-media {...stylex.props(styles.summaryMedia)}>
          <ProjectedPrimaryImage placement={primaryImage} variant="summary" />
        </div>
      ) : null}
      <VStack gap={3} data-site-summary-content {...stylex.props(styles.summaryContent)}>
        {block.date && block.type !== "project" ? (
          <time dateTime={block.date} {...stylex.props(styles.summaryDate)}>
            {block.date}
          </time>
        ) : null}
        {block.label ? <Heading level={headingLevel}>{block.label}</Heading> : null}
        <ProjectedContentSummaryBody block={block} />
      </VStack>
    </HStack>
  );

  return (
    <Card
      padding={5}
      data-site-block-type={block.type}
      data-site-summary-id={block.id}
      {...stylex.props(publicHref ? styles.summaryCard : null)}
    >
      {publicHref ? (
        <Link
          href={publicHref}
          target={siteLinkTarget(publicHref)}
          rel={siteLinkRel(publicHref)}
          color="inherit"
          data-public-href={publicHref}
          data-site-summary-link={block.type}
          {...stylex.props(styles.summaryLink)}
        >
          <VisuallyHidden>{block.label}</VisuallyHidden>
        </Link>
      ) : null}
      {summaryContent}
    </Card>
  );
}

function ProjectedContentSummaryBody({ block }: { block: SiteBlockNode }) {
  if (!block.body) {
    return null;
  }

  if (block.type === "project") {
    return (
      <ProjectedMarkdown
        body={block.body}
        headingLevelStart={4}
        linkComponent={ProjectedSummaryMarkdownLink}
      />
    );
  }

  return <ProjectedPlainText body={block.body} />;
}

function ProjectedSummaryMarkdownLink({ children, href }: { children: ReactNode; href: string }) {
  return (
    <Link
      href={href}
      target={siteLinkTarget(href)}
      rel={siteLinkRel(href)}
      type="inherit"
      {...stylex.props(styles.summaryNestedLink)}
    >
      {children}
    </Link>
  );
}

function ProjectedPublicFormBlock({
  block,
  formFacts,
  headingLevel,
}: {
  block: SiteBlockNode;
  formFacts: ProjectedFormRenderingFacts;
  headingLevel: SiteHeadingLevel;
}) {
  if (block.type === "subscribeForm" || block.type === "contactForm") {
    return (
      <ProjectedFixedPublicFormBlock
        block={block}
        formFacts={formFacts}
        headingLevel={headingLevel}
      />
    );
  }

  return (
    <ProjectedPublicOperationFormBlock
      block={block}
      formFacts={formFacts}
      headingLevel={headingLevel}
    />
  );
}

function ProjectedFixedPublicFormBlock({
  block,
  formFacts,
  headingLevel,
}: {
  block: SiteBlockNode;
  formFacts: ProjectedFormRenderingFacts;
  headingLevel: SiteHeadingLevel;
}) {
  const fixtureController = formFacts.sessionControllers?.get(block.id);
  const controller = useMemo(
    () => fixtureController ?? createSitePublicFormSessionController({ block }),
    [block, fixtureController],
  );
  const session = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  return (
    <ProjectedFixedPublicFormSession
      controller={controller}
      formFacts={formFacts}
      headingLevel={headingLevel}
      session={session}
    />
  );
}

function ProjectedFixedPublicFormSession({
  controller,
  formFacts,
  headingLevel,
  session,
}: {
  controller: SitePublicFormSessionController;
  formFacts: ProjectedFormRenderingFacts;
  headingLevel: SiteHeadingLevel;
  session: SitePublicFormSession;
}) {
  const blockType = session.kind === "subscribe" ? "subscribeForm" : "contactForm";
  const challenge = session.challenge;
  const ChallengeComponent = formFacts.challengeComponent ?? SitePublicTurnstileChallenge;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await controller.dispatch(session.submit.intent);
  }

  return (
    <Card
      padding={5}
      variant={session.status === "unavailable" ? "muted" : undefined}
      data-public-form-kind={session.kind}
      data-public-form-state={session.status}
      data-site-block-type={blockType}
    >
      <VStack gap={4} {...stylex.props(styles.publicFormCard)}>
        <VStack gap={2} {...stylex.props(styles.publicFormHeader)}>
          <Heading level={headingLevel}>{session.heading}</Heading>
          <ProjectedMarkdown
            body={session.body}
            headingLevelStart={nextHeadingLevel(headingLevel)}
          />
        </VStack>
        {session.status === "unavailable" ? (
          <ProjectedPublicFormFeedback session={session} />
        ) : (
          <form aria-label={session.heading} noValidate onSubmit={onSubmit}>
            <VStack gap={4} {...stylex.props(styles.publicForm)}>
              <VStack gap={3} {...stylex.props(styles.publicFormFields)}>
                {session.fields.map((field) => (
                  <ProjectedFixedPublicFormField
                    key={field.occurrenceId}
                    controller={controller}
                    field={field}
                  />
                ))}
              </VStack>
              {challenge ? (
                <div
                  aria-disabled={challenge.disabled || undefined}
                  data-public-form-challenge={challenge.kind}
                  data-public-form-challenge-ready={challenge.ready}
                  data-public-form-challenge-reset={challenge.resetSignal}
                  {...stylex.props(
                    styles.publicFormChallenge,
                    challenge.disabled ? styles.publicFormChallengeDisabled : null,
                  )}
                >
                  <ChallengeComponent
                    onTokenChange={(token) =>
                      void controller.dispatch({ ...challenge.tokenChangeIntent, token })
                    }
                    resetSignal={challenge.resetSignal}
                    siteKey={challenge.siteKey}
                  />
                </div>
              ) : null}
              <ProjectedPublicFormFeedback session={session} />
              <div {...stylex.props(styles.publicFormActions)}>
                {session.status === "failed" && session.retryIntent ? (
                  <Button
                    label="Try again"
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      if (session.retryIntent) {
                        void controller.dispatch(session.retryIntent);
                      }
                    }}
                  />
                ) : session.status === "success" ? null : (
                  <Button
                    isDisabled={!session.submit.ready}
                    isLoading={session.status === "submitting"}
                    label={
                      session.status === "submitting"
                        ? session.submit.pendingLabel
                        : session.submit.label
                    }
                    type="submit"
                    variant="primary"
                  />
                )}
              </div>
            </VStack>
          </form>
        )}
      </VStack>
    </Card>
  );
}

function ProjectedFixedPublicFormField({
  controller,
  field,
}: {
  controller: SitePublicFormSessionController;
  field: SitePublicFormField;
}) {
  const sharedProps = {
    "data-public-fixed-field": field.name,
    htmlName: field.name,
    isDisabled: field.disabled,
    isRequired: field.required,
    label: field.label,
    status: field.error ? ({ type: "error", message: field.error } as const) : undefined,
    value: publicFormTextValue(field.value),
    width: "100%" as const,
    onChange: (value: string) => dispatchFixedPublicFormField(controller, field, value),
  };

  return field.control === "longText" ? (
    <TextArea {...sharedProps} rows={4} />
  ) : (
    <TextInput {...sharedProps} type={field.format === "email" ? "email" : "text"} />
  );
}

function ProjectedPublicFormFeedback({ session }: { session: SitePublicFormSession }) {
  const feedback = session.feedback;

  if (!feedback) {
    return null;
  }

  return (
    <PublicFormStateNotice
      state={
        feedback.kind === "failure"
          ? "failed"
          : feedback.kind === "success"
            ? "success"
            : "unavailable"
      }
    >
      {feedback.message}
    </PublicFormStateNotice>
  );
}

function dispatchFixedPublicFormField(
  controller: SitePublicFormSessionController,
  field: SitePublicFormField,
  value: SitePublicFormFieldValue,
) {
  void controller.dispatch({ ...field.changeIntent, value });
}

function publicFormTextValue(value: SitePublicFormFieldValue) {
  return typeof value === "boolean" ? (value ? "true" : "false") : String(value);
}

function ProjectedPublicOperationFormBlock({
  block,
  formFacts,
  headingLevel,
}: {
  block: SiteBlockNode;
  formFacts: ProjectedFormRenderingFacts;
  headingLevel: SiteHeadingLevel;
}) {
  const fixtureController = formFacts.sessionControllers?.get(block.id);
  const controller = useMemo(
    () => fixtureController ?? createSitePublicFormSessionController({ block }),
    [block, fixtureController],
  );
  const session = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  return (
    <ProjectedPublicOperationFormSession
      controller={controller}
      formFacts={formFacts}
      headingLevel={headingLevel}
      session={session}
    />
  );
}

function ProjectedPublicOperationFormSession({
  controller,
  formFacts,
  headingLevel,
  session,
}: {
  controller: SitePublicFormSessionController;
  formFacts: ProjectedFormRenderingFacts;
  headingLevel: SiteHeadingLevel;
  session: SitePublicFormSession;
}) {
  const challenge = session.challenge;
  const ChallengeComponent = formFacts.challengeComponent ?? SitePublicTurnstileChallenge;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await controller.dispatch(session.submit.intent);
  }

  return (
    <Card
      padding={5}
      variant={session.status === "unavailable" ? "muted" : undefined}
      data-public-form-kind={session.kind}
      data-public-form-state={session.status}
      data-site-block-type="publicOperationForm"
    >
      <VStack gap={4} {...stylex.props(styles.publicFormCard)}>
        <VStack gap={2} {...stylex.props(styles.publicFormHeader)}>
          <Heading level={headingLevel}>{session.heading}</Heading>
          <ProjectedMarkdown
            body={session.body}
            headingLevelStart={nextHeadingLevel(headingLevel)}
          />
        </VStack>
        {session.status === "unavailable" ? (
          <ProjectedPublicFormFeedback session={session} />
        ) : (
          <form aria-label={session.heading} noValidate onSubmit={onSubmit}>
            <VStack gap={4} {...stylex.props(styles.publicForm)}>
              <ProjectedPublicOperationFormFields controller={controller} session={session} />
              {challenge ? (
                <div
                  aria-disabled={challenge.disabled || undefined}
                  data-public-form-challenge={challenge.kind}
                  data-public-form-challenge-ready={challenge.ready}
                  data-public-form-challenge-reset={challenge.resetSignal}
                  {...stylex.props(
                    styles.publicFormChallenge,
                    challenge.disabled ? styles.publicFormChallengeDisabled : null,
                  )}
                >
                  <ChallengeComponent
                    onTokenChange={(token) =>
                      void controller.dispatch({ ...challenge.tokenChangeIntent, token })
                    }
                    resetSignal={challenge.resetSignal}
                    siteKey={challenge.siteKey}
                  />
                </div>
              ) : null}
              <ProjectedPublicFormFeedback session={session} />
              <div {...stylex.props(styles.publicFormActions)}>
                {session.status === "failed" && session.retryIntent ? (
                  <Button
                    label="Try again"
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      if (session.retryIntent) {
                        void controller.dispatch(session.retryIntent);
                      }
                    }}
                  />
                ) : session.status === "success" ? null : (
                  <Button
                    isDisabled={!session.submit.ready}
                    isLoading={session.status === "submitting"}
                    label={
                      session.status === "submitting"
                        ? session.submit.pendingLabel
                        : session.submit.label
                    }
                    type="submit"
                    variant="primary"
                  />
                )}
              </div>
            </VStack>
          </form>
        )}
      </VStack>
    </Card>
  );
}

function PublicFormStateNotice({
  children,
  state,
}: {
  children: ReactNode;
  state: SitePublicFormStatus;
}) {
  return (
    <div
      role={state === "failed" ? "alert" : "status"}
      {...stylex.props(
        styles.publicFormNotice,
        state === "success" ? styles.publicFormNoticeSuccess : null,
        state === "unavailable" ? styles.publicFormNoticeWarning : null,
        state === "failed" ? styles.publicFormNoticeError : null,
      )}
    >
      <Text type="supporting" as="p">
        {children}
      </Text>
    </div>
  );
}

function ProjectedPublicOperationFormFields({
  controller,
  session,
}: {
  controller: SitePublicFormSessionController;
  session: SitePublicFormSession;
}) {
  if (session.fields.length === 0) {
    return null;
  }

  return (
    <VStack gap={3} {...stylex.props(styles.publicFormFields)}>
      {session.fields.map((field) => {
        const fieldData = toPublicOperationFieldData(
          field,
          session.status === "submitting",
          session.submit.pendingLabel,
        );

        return (
          <ProjectedPublicOperationField
            key={fieldData.fieldId}
            controller={controller}
            field={fieldData}
            sessionField={field}
          />
        );
      })}
    </VStack>
  );
}

function ProjectedPublicOperationField({
  controller,
  field,
  sessionField,
}: {
  controller: SitePublicFormSessionController;
  field: ProjectedPublicOperationFieldData;
  sessionField: SitePublicFormField;
}) {
  const isPending = Boolean(field.pending?.isPending);
  const isDisabled = field.access.kind !== "editable" || isPending;
  const status = field.errors?.[0]
    ? ({ type: "error", message: field.errors[0].message } as const)
    : undefined;
  const sharedProps = {
    description: field.publicDescription,
    isDisabled,
    isLoading: isPending,
    isRequired: field.required,
    label: field.label,
    placeholder: field.publicPlaceholder,
    status,
    width: "100%" as const,
  };
  const updateDraftValue = (value: SitePublicFormFieldValue) =>
    void controller.dispatch({ ...sessionField.changeIntent, value });

  return (
    <div
      data-public-field-control={publicOperationFieldControlName(field)}
      data-public-field-format={field.field.type === "text" ? field.field.format : undefined}
      data-public-field-id={field.fieldId}
      data-public-field-name={field.inputName}
    >
      {renderPublicOperationFieldControl(field, {
        mustBeTrue: sessionField.mustBeTrue,
        sharedProps,
        updateDraftValue,
      })}
    </div>
  );
}

function renderPublicOperationFieldControl(
  field: ProjectedPublicOperationFieldData,
  input: {
    mustBeTrue?: true;
    sharedProps: {
      description?: string;
      isDisabled: boolean;
      isLoading: boolean;
      isRequired?: boolean;
      label: string;
      placeholder?: string;
      status?: {
        message: string;
        type: "error";
      };
      width: "100%";
    };
    updateDraftValue: (value: SitePublicFormFieldValue) => void;
  },
) {
  const { mustBeTrue, sharedProps, updateDraftValue } = input;

  if (field.input.control === "longText") {
    return (
      <TextArea
        {...sharedProps}
        htmlName={field.inputName}
        rows={4}
        value={formatPublicFieldValue(field.draftInput)}
        onChange={updateDraftValue}
      />
    );
  }

  if (field.input.control === "boolean") {
    return (
      <CheckboxInput
        description={sharedProps.description}
        isDisabled={sharedProps.isDisabled}
        isLoading={sharedProps.isLoading}
        isRequired={mustBeTrue === true}
        label={sharedProps.label}
        status={sharedProps.status}
        value={field.draftInput?.value === true}
        width="100%"
        onChange={updateDraftValue}
      />
    );
  }

  if (field.input.control === "date") {
    return (
      <DateInput
        {...sharedProps}
        hasClear={!field.required}
        value={publicDateInputValue(formatPublicFieldValue(field.draftInput))}
        onChange={(value) => updateDraftValue(value ?? "")}
      />
    );
  }

  if (field.input.control === "number") {
    return (
      <TextInput
        {...sharedProps}
        hasClear={!field.required}
        htmlName={field.inputName}
        type="text"
        value={formatPublicFieldValue(field.draftInput)}
        onChange={updateDraftValue}
      />
    );
  }

  if (field.input.control === "enum") {
    return (
      <ProjectedPublicOperationSelector
        field={field}
        updateDraftValue={updateDraftValue}
        sharedProps={sharedProps}
      />
    );
  }

  if (field.options?.referenceOptions?.length) {
    return (
      <ProjectedPublicOperationTypeahead
        field={field}
        sharedProps={sharedProps}
        updateDraftValue={updateDraftValue}
      />
    );
  }

  return (
    <TextInput
      {...sharedProps}
      {...publicTextInputElementProps(field)}
      hasClear={!field.required}
      htmlName={field.inputName}
      type={field.field.type === "text" && field.field.format === "email" ? "email" : "text"}
      value={formatPublicFieldValue(field.draftInput)}
      onChange={updateDraftValue}
    />
  );
}
type PublicSuggestionItem = SearchableItem<{
  value: string;
}>;
function ProjectedPublicOperationTypeahead({
  field,
  sharedProps,
  updateDraftValue,
}: {
  field: ProjectedPublicOperationFieldData;
  sharedProps: {
    description?: string;
    isDisabled: boolean;
    isLoading: boolean;
    isRequired?: boolean;
    label: string;
    placeholder?: string;
    status?: {
      message: string;
      type: "error";
    };
    width: "100%";
  };
  updateDraftValue: (value: SitePublicFormFieldValue) => void;
}) {
  const items = publicSuggestionItems(field.options?.referenceOptions ?? []);
  const searchSource = createStaticSource(items);
  const value = formatPublicFieldValue(field.draftInput);
  const selectedItem = items.find((item) => publicSuggestionItemValue(item) === value) ?? null;

  return (
    <>
      <Typeahead
        description={sharedProps.description}
        emptySearchResultsText="No suggestions"
        hasClear={!field.required}
        hasEntriesOnFocus
        isDisabled={sharedProps.isDisabled}
        isRequired={sharedProps.isRequired}
        label={sharedProps.label}
        placeholder={sharedProps.placeholder}
        searchSource={searchSource}
        status={sharedProps.status}
        value={selectedItem}
        width={sharedProps.width}
        debounceMs={0}
        onChange={(item) => {
          updateDraftValue(item ? publicSuggestionItemValue(item) : "");
        }}
        onChangeQuery={updateDraftValue}
      />
      <input name={field.inputName} readOnly type="hidden" value={value} />
    </>
  );
}

function ProjectedPublicOperationSelector({
  field,
  sharedProps,
  updateDraftValue,
}: {
  field: ProjectedPublicOperationFieldData;
  sharedProps: {
    description?: string;
    isDisabled: boolean;
    isLoading: boolean;
    isRequired?: boolean;
    label: string;
    placeholder?: string;
    status?: {
      message: string;
      type: "error";
    };
    width: "100%";
  };
  updateDraftValue: (value: SitePublicFormFieldValue) => void;
}) {
  const options = publicSelectorOptions(field.options?.enumOptions ?? []);
  const value = formatPublicFieldValue(field.draftInput);

  if (field.required) {
    return (
      <Selector
        {...sharedProps}
        options={options}
        value={value || undefined}
        onChange={updateDraftValue}
      />
    );
  }

  return (
    <Selector
      {...sharedProps}
      hasClear
      options={options}
      value={value || null}
      onChange={(nextValue) => updateDraftValue(nextValue ?? "")}
    />
  );
}

type ProjectedPublicOperationFieldData = OperationInputFieldContract & {
  publicDescription?: string;
  publicPlaceholder?: string;
};
type ISODateInputValue =
  `${number}${number}${number}${number}-${number}${number}-${number}${number}`;

function toPublicOperationFieldData(
  field: SitePublicFormField,
  isPending: boolean,
  pendingLabel: string,
): ProjectedPublicOperationFieldData {
  const draftInput = publicDraftInputFromValue(field.value);
  const fieldSchema = toPublicOperationFieldSchema(field);
  const control = toPublicOperationFieldControl(field, fieldSchema);

  return {
    access: publicOperationFieldAccess(field.disabled),
    commit: "submit",
    control,
    density: "default",
    draftInput,
    editor: control.editor,
    ...(field.error
      ? {
          errors: [
            {
              draftValue: draftInput,
              fieldName: field.name,
              message: field.error,
            },
          ],
        }
      : {}),
    field: fieldSchema,
    fieldId: field.occurrenceId,
    fieldName: field.name,
    input: toPublicOperationInput(field),
    inputName: field.name,
    label: field.label,
    labelVisibility: "visible",
    options: toPublicOperationFieldOptions(field),
    ...(isPending ? { pending: { isPending: true, label: pendingLabel } } : {}),
    publicPlaceholder: publicOperationFieldPlaceholder(field),
    required: field.required,
    mode: "editor",
    surface: "operation",
    value: draftInput.value,
  };
}

function toPublicOperationFieldSchema(field: SitePublicFormField): FieldSchema {
  if (field.control === "boolean") {
    return { type: "boolean", required: field.required, label: field.label };
  }

  if (field.control === "date") {
    return { type: "date", required: field.required, label: field.label };
  }

  if (field.control === "number") {
    return { type: "number", required: field.required, label: field.label };
  }

  if (field.control === "enum") {
    return {
      type: "enum",
      required: field.required,
      label: field.label,
      values: (field.options ?? []).map((option) => ({
        key: option.value,
        label: option.label,
      })),
    };
  }
  return {
    type: "text",
    required: field.required,
    label: field.label,
    format: field.control === "longText" ? "longText" : field.format,
    suggestions: field.suggestions ? [...field.suggestions] : undefined,
  };
}

function toPublicOperationFieldOptions(field: SitePublicFormField): FieldOptions | undefined {
  if (field.control === "enum") {
    return {
      enumOptions: (field.options ?? []).map((option) => ({
        label: option.label,
        presentation: {
          color: {
            intent: "neutral",
            known: false,
          },
          iconKnown: true,
          label: option.label,
        },
        status: "declared",
        value: option.value,
      })),
    };
  }

  if (field.suggestions?.length) {
    return {
      referenceOptions: field.suggestions.map((suggestion) => ({
        id: suggestion,
        label: suggestion,
      })),
    };
  }

  return undefined;
}

function toPublicOperationFieldControl(
  field: SitePublicFormField,
  fieldSchema: FieldSchema,
): FieldControl {
  const common = {
    createDefaultChecked: false,
    createDefaultValue: undefined,
    inputAttributes: publicOperationInputAttributes(fieldSchema),
    label: field.label,
    required: field.required,
  };

  if (fieldSchema.type === "boolean") {
    return {
      ...common,
      control: { kind: "checkbox" },
      controlKind: "checkbox",
      editor: "boolean",
      field: fieldSchema,
      kind: "boolean",
    };
  }

  if (fieldSchema.type === "date") {
    return {
      ...common,
      control: { kind: "input", inputType: "date" },
      controlKind: "date",
      editor: "date",
      field: fieldSchema,
      kind: "date",
    };
  }

  if (fieldSchema.type === "number") {
    return {
      ...common,
      control: { kind: "formattedNumber" },
      controlKind: "number",
      editor: "number",
      field: fieldSchema,
      kind: "number",
    };
  }

  if (fieldSchema.type === "enum") {
    return {
      ...common,
      control: { kind: "select" },
      controlKind: "select",
      editor: "enum",
      field: fieldSchema,
      kind: "enum",
    };
  }
  const textField = fieldSchema as Extract<
    FieldSchema,
    {
      type: "text";
    }
  >;
  return {
    ...common,
    control:
      field.control === "longText" ? { kind: "textarea" } : { kind: "input", inputType: "text" },
    controlKind: field.control === "longText" ? "textarea" : "text",
    editor: field.control === "longText" ? "textarea" : "text",
    field: textField,
    kind: "text",
  };
}

function toPublicOperationInput(field: SitePublicFormField): PublicSafeOperationInputField {
  return {
    name: field.name,
    label: field.label,
    required: field.required,
    control: field.control,
    format: field.format,
    suggestions: field.suggestions ? [...field.suggestions] : undefined,
    options: field.options?.map((option) => ({
      value: option.value,
      label: option.label,
    })),
  };
}

function publicOperationFieldAccess(isDisabled: boolean): FieldAccess {
  if (isDisabled) {
    return { kind: "disabled", canPatch: false, writable: true };
  }

  return { kind: "editable", canPatch: true, writable: true };
}

function publicOperationInputAttributes(field: FieldSchema): FieldInputAttributes {
  if (field.type !== "number") {
    return {};
  }

  return {
    max: field.max,
    min: field.min,
    step: field.integer ? "1" : "any",
  };
}

function publicOperationFieldPlaceholder(field: SitePublicFormField) {
  if (field.suggestions?.[0]) {
    return field.suggestions[0];
  }

  if (field.format === "phone") {
    return "+1 555 0100";
  }

  if (field.format === "email") {
    return "name@example.com";
  }

  return undefined;
}

function publicTextInputElementProps(field: ProjectedPublicOperationFieldData) {
  const format = field.field.type === "text" ? field.field.format : undefined;

  return {
    inputMode: format === "phone" ? "tel" : undefined,
    pattern: format === "phone" ? "[0-9+() -]*" : undefined,
  } satisfies Record<string, string | undefined>;
}

function publicSelectorOptions(
  options: NonNullable<FieldOptions["enumOptions"]>,
): SelectorOptionData[] {
  return options.map((option) => ({
    label: option.label,
    value: option.value,
  }));
}

function publicSuggestionItems(
  options: NonNullable<FieldOptions["referenceOptions"]>,
): PublicSuggestionItem[] {
  return options.map((option) => ({
    id: option.id,
    label: option.label,
    auxiliaryData: {
      value: option.id,
    },
  }));
}

function publicSuggestionItemValue(item: PublicSuggestionItem) {
  return item.auxiliaryData?.value ?? item.id;
}

function publicOperationFieldControlName(field: ProjectedPublicOperationFieldData) {
  return field.input.control;
}

function publicDateInputValue(value: string): ISODateInputValue | undefined {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? (value as ISODateInputValue) : undefined;
}

function formatPublicFieldValue(input: GeneratedFieldDraftInput | undefined) {
  return String(input?.value ?? "");
}

function publicDraftInputFromValue(value: SitePublicFormFieldValue): GeneratedFieldDraftInput {
  if (typeof value === "boolean" || typeof value === "number") {
    return { kind: "value", value };
  }

  return { kind: "input", value };
}

function ProjectedMarkdown({
  body,
  headingLevelStart,
  linkComponent,
}: {
  body?: string;
  headingLevelStart: 1 | 2 | 3 | 4 | 5 | 6;
  linkComponent?: ComponentType<{
    children: ReactNode;
    href: string;
  }>;
}) {
  if (!body) {
    return null;
  }

  return (
    <div {...stylex.props(styles.markdownBody)}>
      <Markdown
        headingLevelStart={headingLevelStart}
        contentWidth="100%"
        components={linkComponent ? { link: linkComponent } : undefined}
      >
        {body}
      </Markdown>
    </div>
  );
}

function ProjectedPlainText({ body }: { body?: string }) {
  if (!body) {
    return null;
  }

  return (
    <VStack gap={2} {...stylex.props(styles.plainText)}>
      {body.split(/\n{2,}/).map((paragraph, index) => (
        <Text key={`${index}:${paragraph}`} as="p">
          {paragraph}
        </Text>
      ))}
    </VStack>
  );
}

function ProjectedLinkLabel({ item }: { item: ProjectedShellLink }) {
  return (
    <HStack gap={1} vAlign="center">
      <ProjectedLinkIcon item={item} />
      <span>{item.label}</span>
    </HStack>
  );
}

function ProjectedFooterLink({ item, social }: { item: ProjectedShellLink; social: boolean }) {
  return (
    <Link
      href={item.publicHref}
      label={social ? item.label : undefined}
      target={siteLinkTarget(item.publicHref)}
      rel={siteLinkRel(item.publicHref)}
      isExternalLink={item.isExternal}
      isStandalone
      tooltip={social ? item.label : undefined}
      data-public-href={item.publicHref}
      data-site-social-link={social ? true : undefined}
    >
      {social && item.icon ? <ProjectedLinkIcon item={item} /> : <ProjectedLinkLabel item={item} />}
    </Link>
  );
}

function ProjectedLinkIcon({ item }: { item: ProjectedShellLink }) {
  if (item.icon) {
    return (
      <span {...stylex.props(styles.inlineLinkIcon)}>
        <SourceIcon source={item.icon} color="inherit" size="sm" aria-hidden />
      </span>
    );
  }

  return null;
}

function projectedFrameLinks(
  block: SiteBlockNode | undefined,
  routeFacts: SitePublicRendererProps,
): ProjectedShellLink[] {
  if (!block) {
    return [];
  }

  const links: ProjectedShellLink[] = [];
  collectProjectedLinks(block, links, routeFacts);

  return links;
}

function projectedHeaderNavigation(
  header: SiteBlockNode | undefined,
  routeFacts: SitePublicRendererProps,
): ProjectedNavigationGroup[] {
  if (!header) {
    return [];
  }

  const placements = orderedPlacements(header.placements);
  const primaryPlacement = placements.find((placement) => placement.block.type === "headerPrimary");
  const secondaryPlacement = placements.find(
    (placement) => placement.block.type === "headerSecondary",
  );
  const directPlacements = placements.filter(
    (placement) =>
      placement.block.type !== "headerPrimary" && placement.block.type !== "headerSecondary",
  );

  if (!primaryPlacement && !secondaryPlacement) {
    const links = directPlacements.flatMap((placement) =>
      projectedFrameLinks(placement.block, routeFacts),
    );

    return links.length > 0 ? [{ kind: "primary", label: header.label, links }] : [];
  }

  const primaryBlocks = primaryPlacement
    ? [primaryPlacement.block]
    : directPlacements.slice(0, 1).map((placement) => placement.block);
  const secondaryBlocks = [
    ...(secondaryPlacement ? [secondaryPlacement.block] : []),
    ...(primaryPlacement ? directPlacements : directPlacements.slice(1)).map(
      (placement) => placement.block,
    ),
  ];
  const groups: ProjectedNavigationGroup[] = [
    {
      kind: "primary",
      label: primaryPlacement?.block.label ?? header.label,
      links: primaryBlocks.flatMap((block) => projectedFrameLinks(block, routeFacts)),
    },
    {
      kind: "secondary",
      label: secondaryPlacement?.block.label ?? header.label,
      links: secondaryBlocks.flatMap((block) => projectedFrameLinks(block, routeFacts)),
    },
  ];

  return groups.filter((group) => group.links.length > 0);
}

type ProjectedFooterGroup = {
  kind: "section" | "social" | "links";
  label: string;
  links: readonly ProjectedShellLink[];
};

type ProjectedFooterComposition = {
  groups: readonly ProjectedFooterGroup[];
  notes: readonly string[];
};

function projectedFooterComposition(
  footer: SiteBlockNode,
  routeFacts: SitePublicRendererProps,
): ProjectedFooterComposition {
  const groups: ProjectedFooterGroup[] = [];
  const notes: string[] = footer.body ? [footer.body] : [];
  const directLinks: ProjectedShellLink[] = [];

  for (const placement of orderedPlacements(footer.placements)) {
    const block = placement.block;

    if (block.type === "footerSection" || block.type === "footerSocial") {
      const links = projectedFrameLinks(block, routeFacts);

      if (links.length > 0) {
        groups.push({
          kind: block.type === "footerSocial" ? "social" : "section",
          label: block.label,
          links,
        });
      }
      continue;
    }

    if (block.type === "link" && block.href) {
      directLinks.push(toProjectedShellLink(block, block.href, routeFacts, placement));
      continue;
    }

    const nestedLinks = projectedFrameLinks(block, routeFacts);
    if (nestedLinks.length > 0) {
      groups.push({ kind: "links", label: block.label, links: nestedLinks });
    } else if (block.body) {
      notes.push(block.body);
    }
  }

  if (directLinks.length > 0) {
    groups.unshift({ kind: "links", label: footer.label, links: directLinks });
  }

  return { groups, notes };
}

function collectProjectedLinks(
  block: SiteBlockNode,
  links: ProjectedShellLink[],
  routeFacts: SitePublicRendererProps,
  placement?: SitePlacementNode,
): void {
  if (block.type === "link" && block.href) {
    links.push(toProjectedShellLink(block, block.href, routeFacts, placement));
  }

  for (const childPlacement of orderedPlacements(block.placements)) {
    collectProjectedLinks(childPlacement.block, links, routeFacts, childPlacement);
  }
}

function orderedPlacements(placements: readonly SitePlacementNode[]): SitePlacementNode[] {
  return [...placements].sort((first, second) => first.order - second.order);
}

function defaultPlacements(block: SiteBlockNode): SitePlacementNode[] {
  return orderedPlacements(block.placements).filter((placement) => !placement.slot);
}

function slottedPlacements(block: SiteBlockNode, slot: string, type: string): SitePlacementNode[] {
  return orderedPlacements(block.placements).filter(
    (placement) => placement.slot === slot && placement.block.type === type,
  );
}

function primaryImagePlacement(block: SiteBlockNode): SitePlacementNode | undefined {
  return orderedPlacements(block.placements).find(
    (placement) => placement.slot === "primaryImage" && placement.block.type === "image",
  );
}

function nextHeadingLevel(level: SiteHeadingLevel): SiteHeadingLevel {
  return Math.min(level + 1, 6) as SiteHeadingLevel;
}

function toProjectedShellLink(
  block: SiteBlockNode,
  sourceHref: string,
  routeFacts: SitePublicRendererProps,
  placement?: SitePlacementNode,
): ProjectedShellLink {
  const publicHref = profileAwareSiteHref(sourceHref, routeFacts.linkMode, routeFacts.routeBase);
  const isExternal = isExternalSiteHref(publicHref);

  return {
    label: placement?.label ?? block.label,
    publicHref,
    isExternal,
    isSelected: siteHrefMatchesRoute(publicHref, routeFacts.tree.route?.slug, routeFacts.routeBase),
    icon: block.icon,
  };
}
