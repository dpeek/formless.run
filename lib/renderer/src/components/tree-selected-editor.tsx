import * as stylex from "@stylexjs/stylex";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { FieldStatus } from "@astryxdesign/core/FieldStatus";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type {
  FieldContract,
  FieldIntent,
  FieldSetContract,
  TreeIntentHandler,
  TreeItemContract,
  TreeResultContract,
  TreeSelectedEditorContract,
} from "@dpeek/formless-presentation/contract";
import { FieldRenderer } from "./fields/field-renderer.tsx";
import { AstryxTreeSelectedActions, AstryxTreeSelectedDiagnostics } from "./tree-actions.tsx";
import { AstryxTreeChildCreation } from "./tree-child-creation.tsx";

export function AstryxTreeSelectedEditor({
  editor,
  onIntent,
  selectedItem,
  tree,
}: {
  editor: TreeSelectedEditorContract | undefined;
  onIntent: TreeIntentHandler;
  selectedItem: TreeItemContract | undefined;
  tree: TreeResultContract;
}) {
  if (!editor) {
    return (
      <Card data-formless-astryx-tree-editor-empty={tree.id} padding={5} width="100%">
        <EmptyState headingLevel={2} isCompact title="Select an item to edit." />
      </Card>
    );
  }

  return (
    <Card
      aria-label={editor.accessibilityLabel}
      data-formless-astryx-tree-editor={editor.id}
      padding={5}
      width="100%"
    >
      <VStack gap={5} width="100%">
        <VStack gap={1} width="100%">
          <Heading level={2}>{selectedItem?.label ?? tree.root.label}</Heading>
          {selectedItem ? <AstryxTreeSelectedItemFacts item={selectedItem} /> : null}
        </VStack>
        <AstryxTreeSelectedDiagnostics editor={editor} item={selectedItem} />
        <AstryxTreeSelectedActions
          editor={editor}
          item={selectedItem}
          onIntent={onIntent}
          resultId={tree.id}
        />
        <AstryxTreeFieldSet
          editor={editor}
          fieldSet={editor.placementFields}
          kind="placement"
          onIntent={onIntent}
          resultId={tree.id}
        />
        {editor.childFields ? (
          <AstryxTreeFieldSet
            editor={editor}
            fieldSet={editor.childFields}
            kind="child"
            onIntent={onIntent}
            resultId={tree.id}
          />
        ) : null}
        {editor.childCreation ? (
          <AstryxTreeChildCreation
            creation={editor.childCreation}
            onIntent={onIntent}
            parent={{ itemId: editor.itemId, kind: "item" }}
            resultId={tree.id}
          />
        ) : null}
      </VStack>
    </Card>
  );
}

function AstryxTreeSelectedItemFacts({ item }: { item: TreeItemContract }) {
  const facts = [item.variant?.label, item.slot?.label].filter(Boolean).join(" · ");

  return facts ? (
    <Text color="secondary" display="block" type="supporting">
      {facts}
    </Text>
  ) : null;
}

export function AstryxTreeFieldSet({
  editor,
  fieldSet,
  kind,
  onIntent,
  resultId,
  showLabel = true,
}: {
  editor: Pick<TreeSelectedEditorContract, "itemId">;
  fieldSet: FieldSetContract;
  kind: "child" | "placement";
  onIntent: TreeIntentHandler;
  resultId: string;
  showLabel?: boolean;
}) {
  const label = fieldSet.label ?? (kind === "placement" ? "Placement" : "Child");
  const headingId = `${fieldSet.id}:heading`;

  const content = (
    <VStack gap={3} width="100%">
      {showLabel ? (
        <Heading id={headingId} level={3}>
          {label}
        </Heading>
      ) : null}
      {fieldSet.disabledReason ? (
        <Text color="secondary" display="block" role="status" type="supporting">
          {fieldSet.disabledReason}
        </Text>
      ) : null}
      <fieldset
        {...(showLabel ? { "aria-labelledby": headingId } : {})}
        disabled={fieldSet.disabled}
        title={fieldSet.disabledReason}
        {...stylex.props(styles.fieldSet)}
      >
        <FormLayout direction="vertical">
          {fieldSet.fields.map((field) => (
            <FieldRenderer
              field={field}
              key={field.fieldId}
              onIntent={(intent) =>
                dispatchAstryxTreeFieldIntent(
                  onIntent,
                  resultId,
                  editor,
                  fieldSet,
                  kind,
                  field,
                  intent,
                )
              }
            />
          ))}
        </FormLayout>
      </fieldset>
      {fieldSet.errors?.map((error) => (
        <FieldStatus key={error} message={error} type="error" variant="detached" />
      ))}
    </VStack>
  );

  return showLabel ? (
    <Card
      aria-labelledby={headingId}
      data-formless-astryx-tree-field-set={fieldSet.id}
      data-formless-astryx-tree-field-set-kind={kind}
      padding={4}
      role="region"
      variant="muted"
      width="100%"
    >
      {content}
    </Card>
  ) : (
    <div
      data-formless-astryx-tree-field-set={fieldSet.id}
      data-formless-astryx-tree-field-set-kind={kind}
    >
      {content}
    </div>
  );
}

export function dispatchAstryxTreeFieldIntent(
  onIntent: TreeIntentHandler,
  resultId: string,
  editor: Pick<TreeSelectedEditorContract, "itemId">,
  fieldSet: FieldSetContract,
  kind: "child" | "placement",
  field: FieldContract,
  intent: FieldIntent,
) {
  return onIntent({
    fieldId: field.fieldId,
    intent,
    resultId,
    target: {
      fieldSetId: fieldSet.id,
      itemId: editor.itemId,
      kind,
    },
    type: "treeField",
  });
}

const styles = stylex.create({
  fieldSet: {
    borderWidth: 0,
    margin: 0,
    minWidth: 0,
    padding: 0,
  },
});
