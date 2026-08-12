import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import type { DropdownMenuItemData } from "@astryxdesign/core/DropdownMenu";
import { HStack } from "@astryxdesign/core/HStack";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type {
  RecordResultContract,
  RecordResultIntentHandler,
} from "@dpeek/formless-presentation/contract";
import type { ReactNode } from "react";
import { AstryxRecordResultRenderer } from "./record-result-renderer.tsx";

export function AstryxRecursiveRecordNode({
  accessibilityLabel,
  actionMenuAccessibilityLabel,
  actionMenuItems,
  children,
  editor,
  entityTypeLabel,
  headerActions,
  headerDetail,
  leadingContent,
  onEditorIntent,
  root = false,
}: {
  accessibilityLabel: string;
  actionMenuAccessibilityLabel: string;
  actionMenuItems: readonly DropdownMenuItemData[];
  children?: ReactNode;
  editor?: RecordResultContract;
  entityTypeLabel: string;
  headerActions?: ReactNode;
  headerDetail?: string;
  leadingContent?: ReactNode;
  onEditorIntent?: RecordResultIntentHandler;
  root?: boolean;
}) {
  return (
    <Card elevation="med" padding={0} variant={root ? "transparent" : "muted"} width="100%">
      <VStack as="section" aria-label={accessibilityLabel} gap={0} width="100%">
        <HStack
          align="center"
          gap={3}
          justify="between"
          paddingBlock={4}
          paddingInline={8}
          width="100%"
        >
          <VStack gap={0}>
            <Text color="secondary" type="supporting">
              {entityTypeLabel}
            </Text>
            {headerDetail ? (
              <Text color="secondary" type="supporting">
                {headerDetail}
              </Text>
            ) : null}
          </VStack>
          {headerActions ??
            (actionMenuItems.length > 0 ? (
              <MoreMenu
                items={[...actionMenuItems]}
                label={actionMenuAccessibilityLabel}
                size="sm"
                variant="ghost"
              />
            ) : null)}
        </HStack>
        <Divider isFullBleed />
        <VStack gap={4} padding={8} width="100%">
          {leadingContent}
          {editor && onEditorIntent ? (
            <AstryxRecordResultRenderer
              container="inline"
              onIntent={onEditorIntent}
              recordResult={editor}
              showActions={false}
            />
          ) : null}
          {children}
        </VStack>
      </VStack>
    </Card>
  );
}
