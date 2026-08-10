import * as stylex from "@stylexjs/stylex";
import { VStack } from "@astryxdesign/core/VStack";
import { spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import { memo, type ReactNode } from "react";
import type {
  WorkspaceManifestReference,
  WorkspaceWidth,
} from "@dpeek/formless-presentation/contract";
import { useWorkspaceManifest } from "@dpeek/formless-presentation/host/react";

export const astryxApplicationSurfaceFramePolicy = {
  gutters: [
    { minimumViewportWidth: 0, spacing: 4 },
    { minimumViewportWidth: 768, spacing: 6 },
    { minimumViewportWidth: 1024, spacing: 8 },
  ],
  widthCaps: {
    narrow: 760,
    standard: 1200,
    wide: 1600,
  },
} as const;

export function AstryxApplicationSurfaceFrame({
  children,
  surface,
  width,
}: {
  children: ReactNode;
} & (
  | {
      surface?: "constrained";
      width: WorkspaceWidth;
    }
  | {
      surface: "full";
      width?: never;
    }
)) {
  if (surface === "full") {
    return (
      <VStack
        data-formless-astryx-application-surface={surface}
        height="100%"
        width="100%"
        xstyle={styles.fullFrame}
      >
        <VStack height="100%" width="100%" xstyle={styles.fullContent}>
          {children}
        </VStack>
      </VStack>
    );
  }

  return (
    <VStack
      data-formless-astryx-application-surface="constrained"
      hAlign="center"
      width="100%"
      xstyle={styles.constrainedFrame}
    >
      <VStack
        data-formless-astryx-application-surface-width={width}
        maxWidth={astryxApplicationSurfaceFramePolicy.widthCaps[width]}
        width="100%"
        xstyle={styles.content}
      >
        {children}
      </VStack>
    </VStack>
  );
}

export const AstryxSubscribedWorkspaceSurfaceFrame = memo(
  function AstryxSubscribedWorkspaceSurfaceFrame({
    children,
    reference,
  }: {
    children: ReactNode;
    reference: WorkspaceManifestReference;
  }) {
    const workspace = useWorkspaceManifest(reference);

    return workspace ? (
      workspace.surface === "full" ? (
        <AstryxApplicationSurfaceFrame surface={workspace.surface}>
          {children}
        </AstryxApplicationSurfaceFrame>
      ) : (
        <AstryxApplicationSurfaceFrame surface={workspace.surface} width={workspace.width}>
          {children}
        </AstryxApplicationSurfaceFrame>
      )
    ) : null;
  },
  (previous, next) =>
    previous.reference.workspaceId === next.reference.workspaceId &&
    previous.children === next.children,
);

const styles = stylex.create({
  constrainedFrame: {
    minWidth: 0,
    paddingBlock: spacingVars["--spacing-4"],
    paddingInline: spacingVars["--spacing-4"],
    "@media (min-width: 768px)": {
      paddingBlock: spacingVars["--spacing-6"],
      paddingInline: spacingVars["--spacing-6"],
    },
    "@media (min-width: 1024px)": {
      paddingBlock: spacingVars["--spacing-8"],
      paddingInline: spacingVars["--spacing-8"],
    },
  },
  content: {
    minWidth: 0,
  },
  fullFrame: {
    minHeight: 0,
    minWidth: 0,
  },
  fullContent: {
    minHeight: 0,
    minWidth: 0,
  },
});
