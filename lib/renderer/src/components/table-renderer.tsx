import type { CSSProperties } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button, type ButtonVariant } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { DropdownMenu, type DropdownMenuOption } from "@astryxdesign/core/DropdownMenu";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { FieldStatus } from "@astryxdesign/core/FieldStatus";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { Spinner } from "@astryxdesign/core/Spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHeader,
  TableHeaderCell,
  TableRow,
  pixel,
  proportional,
  resolveColumnWidths,
  type TableColumn,
  type TableDensity,
} from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import { VStack } from "@astryxdesign/core/VStack";
import { stableClassName } from "@astryxdesign/core/naming";
import {
  colorVars,
  fontWeightVars,
  radiusVars,
  spacingVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import type {
  ButtonContract,
  CollectionEmptyStatePrimaryActionContract,
  CreateFieldIntentHandler,
  CreateIntentHandler,
  FieldIntent,
  NativeLinkActionContract,
  OperationButtonContract,
  OperationPresentationIntent,
  TableActionContract,
  TableActionGroupContract,
  TableCellValueContract,
  TableCellContentContract,
  TableColumnContract,
  TableContract,
  TableEditActionContract,
  TableEditDialogContract,
  TableFooterCellContract,
  TableIntentHandler,
  TableOperationActionContract,
  TableOrderingContract,
  TableValueStatus,
} from "@dpeek/formless-presentation/contract";
import { AstryxCreateSurfaceRenderer } from "./create-renderer.tsx";
import { ColorValueDisplay, MarkdownFieldDisplay } from "./field-primitives.tsx";
import { FieldRenderer } from "./fields/field-renderer.tsx";
import {
  enumValuePresentationToSelectorVisualOption,
  hasSelectorOptionVisual,
  selectorOptionVisual,
} from "./fields/field-options.tsx";
import { IconPreview } from "./icon-preview.tsx";
import { MediaValueDisplay } from "./media-input.tsx";
import {
  AstryxOperationButton,
  AstryxOperationButtonWithProgress,
  AstryxOperationDestructiveConfirmation,
  AstryxOperationFeedback,
  AstryxOperationProgress,
  operationIcon,
} from "./operation-renderer.tsx";

export type AstryxTableFieldIntentHandler = (
  contextId: string,
  fieldId: string,
  recordId: string | undefined,
  intent: FieldIntent,
) => Promise<void> | void;

export type AstryxTableOperationIntentHandler = (
  action: TableOperationActionContract,
  intent: OperationPresentationIntent,
) => Promise<void> | void;

type AstryxTableRowData = {
  id: string;
} & Record<string, unknown>;

type AstryxTableButtonContract = ButtonContract | OperationButtonContract;

const astryxTableWidthPixels = {
  lg: 256,
  md: 160,
  sm: 112,
  xs: 80,
} as const;

export function AstryxTableRenderer({
  onCreateFieldIntent = ignoreCreateFieldIntent,
  onCreateIntent = ignoreCreateIntent,
  onFieldIntent,
  onOperationIntent,
  onTableIntent,
  table,
}: {
  onCreateFieldIntent?: CreateFieldIntentHandler;
  onCreateIntent?: CreateIntentHandler;
  onFieldIntent: AstryxTableFieldIntentHandler;
  onOperationIntent: AstryxTableOperationIntentHandler;
  onTableIntent: TableIntentHandler;
  table: TableContract;
}) {
  const columns = astryxTableColumns(table.columns);
  const resolvedWidths = resolveColumnWidths(columns);
  const footer = table.rows.length > 0 ? table.footer : undefined;

  return (
    <VStack as="section" aria-label={table.accessibilityLabel} gap={2} width="100%">
      <Table<AstryxTableRowData>
        columns={columns}
        density={astryxTableDensity(table.density)}
        dividers="none"
        hasHover
        aria-label={table.accessibilityLabel}
        textOverflow="wrap"
        verticalAlign="top"
      >
        <colgroup>
          {columns.map((column) => (
            <col key={column.key} style={resolvedWidths.columns.get(column.key)?.style} />
          ))}
        </colgroup>
        <TableHeader>
          <TableRow isHeaderRow>
            {table.columns.map((column) => (
              <TableHeaderCell
                aria-label={column.accessibilityLabel}
                id={astryxTableColumnHeaderId(table.id, column.id)}
                key={column.id}
                scope="col"
                style={astryxTableCellStyle(column, resolvedWidths.columns.get(column.id)?.style)}
              >
                {column.labelVisibility === "hidden" ? (
                  <VisuallyHidden>{column.accessibilityLabel}</VisuallyHidden>
                ) : (
                  column.label
                )}
              </TableHeaderCell>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.rows.length === 0 && table.emptyState ? (
            <TableRow aria-label={table.emptyState.title}>
              <TableCell colSpan={table.columns.length}>
                <EmptyState
                  actions={
                    table.emptyState.action ? (
                      <AstryxTableEmptyStatePrimaryAction
                        action={table.emptyState.action}
                        onCreateFieldIntent={onCreateFieldIntent}
                        onCreateIntent={onCreateIntent}
                        onOperationIntent={onOperationIntent}
                      />
                    ) : undefined
                  }
                  description={table.emptyState.description}
                  isCompact
                  title={table.emptyState.title}
                />
                {table.emptyState.action?.kind === "operationAction" ? (
                  <AstryxTableActionEffects
                    action={table.emptyState.action}
                    onFieldIntent={onFieldIntent}
                    onOperationIntent={onOperationIntent}
                    onTableIntent={onTableIntent}
                  />
                ) : null}
              </TableCell>
            </TableRow>
          ) : null}
          {table.rows.map((row) => {
            const rowHeaderCellId = astryxTableRowHeaderCellId(table, row);

            return (
              <AstryxTableRows
                columns={table.columns}
                key={row.id}
                onFieldIntent={onFieldIntent}
                onOperationIntent={onOperationIntent}
                onTableIntent={onTableIntent}
                row={row}
                rowHeaderCellId={rowHeaderCellId}
                tableId={table.id}
              />
            );
          })}
        </TableBody>
        {footer ? (
          <TableFooter>
            <TableRow aria-label={footer.accessibilityLabel} xstyle={[styles.footerRow]}>
              {table.columns.map((column) => {
                const cell = requiredAstryxTableFooterCell(footer.cells, column.id);

                return (
                  <TableCell
                    headers={astryxTableColumnHeaderId(table.id, column.id)}
                    key={cell.id}
                    style={astryxTableCellStyle(column)}
                  >
                    <AstryxTableFooterCell cell={cell} />
                  </TableCell>
                );
              })}
            </TableRow>
          </TableFooter>
        ) : null}
      </Table>
    </VStack>
  );
}

function AstryxTableEmptyStatePrimaryAction({
  action,
  onCreateFieldIntent,
  onCreateIntent,
  onOperationIntent,
}: {
  action: CollectionEmptyStatePrimaryActionContract;
  onCreateFieldIntent: CreateFieldIntentHandler;
  onCreateIntent: CreateIntentHandler;
  onOperationIntent: AstryxTableOperationIntentHandler;
}) {
  return action.kind === "createAction" ? (
    <AstryxCreateSurfaceRenderer
      onFieldIntent={onCreateFieldIntent}
      onIntent={onCreateIntent}
      surface={action.surface}
    />
  ) : (
    <AstryxTablePrimaryAction action={action} onOperationIntent={onOperationIntent} />
  );
}

function AstryxTableRows({
  columns,
  onFieldIntent,
  onOperationIntent,
  onTableIntent,
  row,
  rowHeaderCellId,
  tableId,
}: {
  columns: TableContract["columns"];
  onFieldIntent: AstryxTableFieldIntentHandler;
  onOperationIntent: AstryxTableOperationIntentHandler;
  onTableIntent: TableIntentHandler;
  row: TableContract["rows"][number];
  rowHeaderCellId: string | undefined;
  tableId: string;
}) {
  return (
    <>
      <TableRow aria-label={row.accessibilityLabel}>
        {columns.map((column) => {
          const cell = requiredAstryxTableCell(row.cells, column.id);
          const content = (
            <HStack
              align="start"
              gap={1}
              justify={column.alignment}
              width="100%"
              wrap="wrap"
              xstyle={styles.cellContent}
            >
              {cell.contents.map((item, index) => (
                <AstryxTableCellContent
                  content={item}
                  contentRole={column.contentRole}
                  key={astryxTableContentKey(item, index)}
                  onFieldIntent={onFieldIntent}
                  onOperationIntent={onOperationIntent}
                  onTableIntent={onTableIntent}
                />
              ))}
            </HStack>
          );
          const columnHeaderId = astryxTableColumnHeaderId(tableId, column.id);

          return column.isRowHeader ? (
            <TableHeaderCell
              id={cell.id}
              key={cell.id}
              scope="row"
              style={astryxTableCellStyle(column)}
              xstyle={styles.rowHeaderCell}
            >
              {content}
            </TableHeaderCell>
          ) : (
            <TableCell
              headers={rowHeaderCellId ? `${columnHeaderId} ${rowHeaderCellId}` : columnHeaderId}
              key={cell.id}
              style={astryxTableCellStyle(column)}
            >
              {content}
            </TableCell>
          );
        })}
      </TableRow>
    </>
  );
}

function AstryxTableCellContent({
  content,
  contentRole,
  onFieldIntent,
  onOperationIntent,
  onTableIntent,
}: {
  content: TableCellContentContract;
  contentRole: TableColumnContract["contentRole"];
  onFieldIntent: AstryxTableFieldIntentHandler;
  onOperationIntent: AstryxTableOperationIntentHandler;
  onTableIntent: TableIntentHandler;
}) {
  if (content.kind === "cellValue") {
    return <AstryxTableCellValue value={content} />;
  }

  if (content.kind === "invalidValue") {
    return <AstryxTableInvalidValue accessibilityLabel={content.accessibilityLabel} />;
  }

  if (content.kind === "unavailable") {
    if (contentRole === "actions") {
      return (
        <MoreMenu
          isDisabled
          items={[]}
          label={content.message || content.accessibilityLabel}
          size="sm"
          variant="ghost"
        />
      );
    }

    return (
      <Text
        aria-label={content.accessibilityLabel}
        color="secondary"
        display="block"
        type="supporting"
      >
        {content.message}
      </Text>
    );
  }

  if (content.kind === "ordering") {
    return <AstryxTableOrdering onTableIntent={onTableIntent} ordering={content} />;
  }

  if (content.kind === "nativeLinkAction") {
    return <AstryxNativeLinkAction action={content} />;
  }

  return (
    <AstryxTableActionGroup
      actionGroup={content}
      onFieldIntent={onFieldIntent}
      onOperationIntent={onOperationIntent}
      onTableIntent={onTableIntent}
    />
  );
}

function AstryxTableCellValue({ value }: { value: TableCellValueContract }) {
  const presentation = value.presentation;

  if (presentation.kind === "markdown") {
    return <MarkdownFieldDisplay density="compact" value={value.displayValue} />;
  }

  if (presentation.kind === "color") {
    return (
      <ColorValueDisplay
        density="compact"
        label={value.accessibilityLabel}
        swatchValue={presentation.swatch}
      />
    );
  }

  if (presentation.kind === "icon") {
    return (
      <IconPreview label={value.accessibilityLabel} size="compact" source={presentation.source} />
    );
  }

  if (presentation.kind === "media") {
    return (
      <MediaValueDisplay
        density="compact"
        label={value.accessibilityLabel}
        previewUrl={presentation.previewHref}
        value={presentation.previewHref}
      />
    );
  }

  if (presentation.kind === "enum" || presentation.kind === "state") {
    const option = enumValuePresentationToSelectorVisualOption(
      presentation.value,
      value.displayValue,
    );
    const showVisual = presentation.content === "icon" && hasSelectorOptionVisual(option);

    return (
      <HStack aria-label={showVisual ? value.accessibilityLabel : undefined} align="center" gap={1}>
        {showVisual ? selectorOptionVisual(option) : null}
        {showVisual ? <VisuallyHidden>{value.accessibilityLabel}</VisuallyHidden> : null}
        {showVisual ? null : (
          <AstryxTableValueText displayValue={presentation.value.label} suffix={value.suffix} />
        )}
      </HStack>
    );
  }

  if (presentation.kind === "temporal") {
    const temporal = presentation.temporal;
    return (
      <HStack aria-label={value.accessibilityLabel} align="center" gap={1} wrap="wrap">
        <Timestamp
          format={temporal.kind === "date" ? "date" : "date_time"}
          type="body"
          value={temporal.kind === "date" ? `${temporal.value}T00:00:00` : temporal.value}
        />
        {value.suffix ? (
          <Text color="secondary" textWrap="nowrap" type="body">
            {value.suffix}
          </Text>
        ) : null}
      </HStack>
    );
  }

  return (
    <div aria-label={value.accessibilityLabel}>
      <AstryxTableValueText displayValue={value.displayValue} suffix={value.suffix} />
    </div>
  );
}

function AstryxTableInvalidValue({ accessibilityLabel }: { accessibilityLabel: string }) {
  return (
    <span
      aria-label={accessibilityLabel}
      role="status"
      {...stylex.props(styles.issueIndicator, styles.warningIndicator)}
    >
      <Icon color="warning" icon="warning" size="sm" />
    </span>
  );
}

function AstryxTableValueText({
  displayValue,
  emphasized = false,
  suffix,
}: {
  displayValue: string;
  emphasized?: boolean;
  suffix?: string;
}) {
  return (
    <Text
      display="block"
      textWrap={suffix ? "nowrap" : undefined}
      weight={emphasized ? "semibold" : undefined}
      wordBreak="break-word"
    >
      {displayValue}
      {suffix ? (
        <>
          {"\u00a0"}
          <Text color="secondary" textWrap="nowrap" type="body">
            {suffix}
          </Text>
        </>
      ) : null}
    </Text>
  );
}

function AstryxTableValueStatus({ status }: { status: TableValueStatus }) {
  if (status.kind === "ready" || status.kind === "pending") {
    return null;
  }

  return (
    <Tooltip content={status.message} hasHoverIndication={false}>
      <span
        aria-label={status.message}
        role="status"
        tabIndex={0}
        {...stylex.props(
          styles.issueIndicator,
          status.kind === "invalid" ? styles.errorIndicator : styles.warningIndicator,
        )}
      >
        <Icon
          color={status.kind === "invalid" ? "error" : "warning"}
          icon={status.kind === "invalid" ? "error" : "warning"}
          size="sm"
        />
      </span>
    </Tooltip>
  );
}

function AstryxTableActionGroup({
  actionGroup,
  onFieldIntent,
  onOperationIntent,
  onTableIntent,
}: {
  actionGroup: TableActionGroupContract;
  onFieldIntent: AstryxTableFieldIntentHandler;
  onOperationIntent: AstryxTableOperationIntentHandler;
  onTableIntent: TableIntentHandler;
}) {
  const items = astryxTableActionItems(actionGroup.actions, onOperationIntent, onTableIntent);
  const isPending = actionGroup.actions.some(
    (action) =>
      action.kind === "operationAction" && Boolean(action.control.trigger.pending?.isPending),
  );

  return (
    <>
      {items.length > 0 ? (
        <DropdownMenu
          button={astryxTableMoreOptionsMenuButton(actionGroup.accessibilityLabel, isPending)}
          className={stableClassName("more-menu")}
          hasChevron={false}
          items={items}
        />
      ) : null}
      {actionGroup.actions.map((action) => (
        <AstryxTableActionEffects
          action={action}
          key={`${astryxTableActionId(action)}:effects`}
          onFieldIntent={onFieldIntent}
          onOperationIntent={onOperationIntent}
          onTableIntent={onTableIntent}
        />
      ))}
    </>
  );
}

function AstryxTablePrimaryAction({
  action,
  onOperationIntent,
}: {
  action: TableOperationActionContract;
  onOperationIntent: AstryxTableOperationIntentHandler;
}) {
  const onIntent = (intent: OperationPresentationIntent) => onOperationIntent(action, intent);

  return action.control.progress ? (
    <AstryxOperationButtonWithProgress
      button={action.control.trigger}
      onIntent={onIntent}
      progress={action.control.progress}
    />
  ) : (
    <AstryxOperationButton button={action.control.trigger} onIntent={onIntent} />
  );
}

function AstryxNativeLinkAction({ action }: { action: NativeLinkActionContract }) {
  const opensInNewTab = action.target === "newTab";

  return (
    <Button
      href={action.availability === "available" ? action.href : undefined}
      isDisabled={action.availability === "unavailable"}
      label={action.accessibilityLabel}
      rel={opensInNewTab && action.availability === "available" ? "noopener noreferrer" : undefined}
      size="sm"
      target={opensInNewTab && action.availability === "available" ? "_blank" : undefined}
      tooltip={action.availability === "unavailable" ? action.unavailableReason : undefined}
      variant={action.prominence}
    >
      {action.label}
    </Button>
  );
}

function AstryxTableActionEffects({
  action,
  onFieldIntent,
  onOperationIntent,
  onTableIntent,
}: {
  action: TableActionContract;
  onFieldIntent: AstryxTableFieldIntentHandler;
  onOperationIntent: AstryxTableOperationIntentHandler;
  onTableIntent: TableIntentHandler;
}) {
  if (action.kind === "operationAction") {
    return (
      <>
        {action.control.confirmation ? (
          <AstryxOperationDestructiveConfirmation
            confirmation={action.control.confirmation}
            onIntent={(intent) => onOperationIntent(action, intent)}
          />
        ) : null}
        {action.control.progress && action.control.trigger.pending?.isPending ? (
          <AstryxOperationProgress progress={action.control.progress} />
        ) : null}
        <AstryxOperationFeedback feedback={action.control.feedback} />
      </>
    );
  }

  return action.kind === "editAction" ? (
    <AstryxTableEditDialog
      action={action}
      onFieldIntent={onFieldIntent}
      onTableIntent={onTableIntent}
    />
  ) : null;
}

function AstryxTableEditDialog({
  action,
  onFieldIntent,
  onTableIntent,
}: {
  action: TableEditActionContract;
  onFieldIntent: AstryxTableFieldIntentHandler;
  onTableIntent: TableIntentHandler;
}) {
  const { dialog } = action;
  const target = dialog.target;
  const onOpenChange = astryxTableEditDialogOpenChangeHandler(dialog, onTableIntent);

  return (
    <Dialog
      isOpen={dialog.open}
      onOpenChange={onOpenChange}
      purpose="form"
      width={560}
      xstyle={styles.editDialog}
    >
      <Layout
        header={
          <DialogHeader
            onOpenChange={onOpenChange}
            subtitle={dialog.description}
            title={dialog.title}
          />
        }
        content={
          <LayoutContent>
            {target.kind === "unavailable" ? (
              <FieldStatus message={target.message} type="warning" variant="detached" />
            ) : (
              <VStack gap={3}>
                {dialog.warning ? (
                  <FieldStatus message={dialog.warning} type="warning" variant="detached" />
                ) : null}
                {target.fieldSet.disabledReason ? (
                  <Text color="secondary" display="block" role="status" type="supporting">
                    {target.fieldSet.disabledReason}
                  </Text>
                ) : null}
                <fieldset
                  aria-label={target.fieldSet.label}
                  disabled={target.fieldSet.disabled}
                  title={target.fieldSet.disabledReason}
                  {...stylex.props(styles.fieldSet)}
                >
                  <FormLayout direction="vertical">
                    {target.fieldSet.fields.map((field) => (
                      <FieldRenderer
                        field={field}
                        key={field.fieldId}
                        onIntent={(intent) =>
                          onFieldIntent(target.fieldSet.id, field.fieldId, field.recordId, intent)
                        }
                      />
                    ))}
                  </FormLayout>
                </fieldset>
                {target.fieldSet.errors?.map((error) => (
                  <FieldStatus key={error} message={error} type="error" variant="detached" />
                ))}
              </VStack>
            )}
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <HStack justify="end">
              <Button
                icon={astryxTableButtonIcon(dialog.close)}
                isDisabled={astryxTableButtonDisabled(dialog.close)}
                isIconOnly={dialog.close.content.kind === "iconOnly"}
                isLoading={Boolean(dialog.close.pending?.isPending)}
                label={dialog.close.accessibilityLabel}
                onClick={() => {
                  if (!astryxTableButtonDisabled(dialog.close)) {
                    void onTableIntent(dialog.openChangeIntent);
                  }
                }}
                size={dialog.close.density === "compact" ? "sm" : "md"}
                tooltip={
                  dialog.close.disabledReason ??
                  (dialog.close.content.kind === "iconOnly"
                    ? dialog.close.accessibilityLabel
                    : undefined)
                }
                type={dialog.close.type}
                variant={astryxTableButtonVariant(dialog.close.prominence)}
              >
                {dialog.close.content.kind === "iconOnly"
                  ? undefined
                  : astryxTableButtonLabel(dialog.close)}
              </Button>
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}

function AstryxTableOrdering({
  onTableIntent,
  ordering,
}: {
  onTableIntent: TableIntentHandler;
  ordering: TableOrderingContract;
}) {
  return (
    <MoreMenu
      icon={operationIcon("dragHandle")}
      isDisabled={ordering.actions.every(astryxTableOrderingActionDisabled)}
      items={astryxTableOrderingItems(ordering, onTableIntent)}
      label={ordering.accessibilityLabel}
      size="sm"
      variant="ghost"
    />
  );
}

function AstryxTableFooterCell({ cell }: { cell: TableFooterCellContract }) {
  if (cell.kind === "emptyFooterCell") {
    return <VisuallyHidden>&nbsp;</VisuallyHidden>;
  }

  return (
    <VStack aria-label={cell.accessibilityLabel} gap={0.5} width="100%">
      <HStack align="center" gap={0.5} wrap="wrap">
        {cell.status.kind === "pending" ? (
          <Spinner
            aria-label={cell.status.label ?? cell.accessibilityLabel}
            shade="subtle"
            size="sm"
          />
        ) : null}
        <AstryxTableValueText displayValue={cell.displayValue} emphasized suffix={cell.suffix} />
      </HStack>
      <AstryxTableValueStatus status={cell.status} />
    </VStack>
  );
}

export function astryxTableColumns(
  columns: readonly TableColumnContract[],
): TableColumn<AstryxTableRowData>[] {
  return columns.map((column) => ({
    align: column.alignment,
    header: column.label,
    key: column.id,
    resizable: false,
    width:
      column.contentRole === "ordering"
        ? pixel(48)
        : column.width === "auto"
          ? proportional(1, { minWidth: 160 })
          : pixel(astryxTableWidthPixels[column.width]),
  }));
}

export function astryxTableDensity(density: TableContract["density"]): TableDensity {
  return density === "compact" ? "compact" : "spacious";
}

export function astryxTableActionItems(
  actions: readonly TableActionContract[],
  onOperationIntent: AstryxTableOperationIntentHandler,
  onTableIntent: TableIntentHandler,
): DropdownMenuOption[] {
  return actions.flatMap((action): DropdownMenuOption[] => {
    if (action.kind === "orderingAction") {
      if (action.disabled && !action.pending?.isPending) {
        return [];
      }

      return [
        {
          isDisabled: astryxTableOrderingActionDisabled(action),
          label: action.pending?.label ?? action.label,
          onClick: () => dispatchAstryxTableAction(action, onOperationIntent, onTableIntent),
        },
      ];
    }

    const button = astryxTableActionButton(action);

    return [
      {
        icon: astryxTableButtonIcon(button),
        isDisabled: astryxTableButtonDisabled(button),
        label: astryxTableMenuItemLabel(button),
        onClick: () => dispatchAstryxTableAction(action, onOperationIntent, onTableIntent),
      },
    ];
  });
}

export function astryxTableMoreOptionsMenuButton(label: string, isPending = false) {
  return {
    icon: <Icon color="inherit" icon="moreHorizontal" size="sm" />,
    isIconOnly: true,
    isLoading: isPending,
    label,
    size: "sm" as const,
    tooltip: "More options",
    variant: "ghost" as const,
  };
}

export function astryxTableOrderingItems(
  ordering: TableOrderingContract,
  onTableIntent: TableIntentHandler,
): DropdownMenuOption[] {
  return ordering.actions
    .filter((action) => !action.disabled || action.pending?.isPending)
    .map((action) => ({
      isDisabled: astryxTableOrderingActionDisabled(action),
      label: action.pending?.label ?? action.label,
      onClick: () => {
        if (!astryxTableOrderingActionDisabled(action)) {
          void onTableIntent(action.intent);
        }
      },
    }));
}

export function astryxTableEditDialogOpenChangeHandler(
  dialog: TableEditDialogContract,
  onTableIntent: TableIntentHandler,
) {
  return (open: boolean) => {
    if (open !== dialog.open) {
      void onTableIntent({ ...dialog.openChangeIntent, open });
    }
  };
}

export function dispatchAstryxTableAction(
  action: TableActionContract,
  onOperationIntent: AstryxTableOperationIntentHandler,
  onTableIntent: TableIntentHandler,
) {
  if (action.kind === "orderingAction") {
    if (!astryxTableOrderingActionDisabled(action)) {
      void onTableIntent(action.intent);
    }
    return;
  }

  const button = astryxTableActionButton(action);

  if (astryxTableButtonDisabled(button)) {
    return;
  }

  if (action.kind === "operationAction") {
    void onOperationIntent(action, action.control.trigger.intent);
    return;
  }

  void onTableIntent(action.openIntent);
}

export function astryxTableButtonVariant(prominence: ButtonContract["prominence"]): ButtonVariant {
  switch (prominence) {
    case "primary":
      return "primary";
    case "secondary":
      return "secondary";
    case "quiet":
      return "ghost";
  }
}

function astryxTableColumnHeaderId(tableId: string, columnId: string) {
  return `${tableId}:column:${columnId}`;
}

function astryxTableRowHeaderCellId(table: TableContract, row: TableContract["rows"][number]) {
  const rowHeaderColumn = table.columns.find((column) => column.isRowHeader);

  return rowHeaderColumn ? requiredAstryxTableCell(row.cells, rowHeaderColumn.id).id : undefined;
}

function astryxTableCellStyle(
  column: TableColumnContract,
  widthStyle?: CSSProperties,
): CSSProperties {
  return {
    ...widthStyle,
    textAlign: column.alignment,
    verticalAlign: "top",
  };
}

function astryxTableActionButton(action: TableActionContract) {
  if (action.kind === "orderingAction") {
    throw new Error("Ordering actions do not expose table action buttons.");
  }

  return action.kind === "operationAction" ? action.control.trigger : action.trigger;
}

function astryxTableButtonLabel(
  button: Pick<ButtonContract, "accessibilityLabel" | "content" | "pending">,
) {
  if (button.pending?.isPending && button.pending.label) {
    return button.pending.label;
  }

  return button.content.kind === "iconOnly" ? button.accessibilityLabel : button.content.label;
}

function astryxTableMenuItemLabel(button: AstryxTableButtonContract) {
  const label = astryxTableButtonLabel(button);

  return button.disabledReason ? `${label} — ${button.disabledReason}` : label;
}

function astryxTableButtonIcon(button: AstryxTableButtonContract) {
  return button.content.kind === "label" ? undefined : operationIcon(button.content.icon);
}

function astryxTableButtonDisabled(button: AstryxTableButtonContract) {
  return Boolean(button.disabled || button.pending?.isPending);
}

function astryxTableOrderingActionDisabled(action: TableOrderingContract["actions"][number]) {
  return Boolean(action.disabled || action.pending?.isPending);
}

function astryxTableActionId(action: TableActionContract) {
  if (action.kind === "orderingAction") {
    return action.id;
  }

  return action.kind === "operationAction" ? action.control.id : action.trigger.id;
}

function astryxTableContentKey(content: TableCellContentContract, index: number) {
  if (content.kind === "actionGroup") {
    return content.id;
  }

  if (content.kind === "nativeLinkAction") {
    return content.id;
  }

  if (content.kind === "ordering") {
    return `${content.accessibilityLabel}:${index}`;
  }

  return `${content.kind}:${index}`;
}

function requiredAstryxTableCell(cells: TableContract["rows"][number]["cells"], columnId: string) {
  const cell = cells.find((candidate) => candidate.columnId === columnId);

  if (!cell) {
    throw new Error(`Missing Astryx table cell for column "${columnId}".`);
  }

  return cell;
}

function requiredAstryxTableFooterCell(
  cells: readonly TableFooterCellContract[],
  columnId: string,
) {
  const cell = cells.find((candidate) => candidate.columnId === columnId);

  if (!cell) {
    throw new Error(`Missing Astryx table footer cell for column "${columnId}".`);
  }

  return cell;
}

const styles = stylex.create({
  cellContent: {
    minWidth: 0,
  },
  errorIndicator: {
    backgroundColor: colorVars["--color-error-muted"],
  },
  editDialog: {
    textAlign: "start",
  },
  fieldSet: {
    border: 0,
    margin: 0,
    minWidth: 0,
    padding: 0,
  },
  footerRow: {
    backgroundColor: colorVars["--color-background-muted"],
    fontWeight: fontWeightVars["--font-weight-semibold"],
  },
  issueIndicator: {
    alignItems: "center",
    borderRadius: radiusVars["--radius-element"],
    display: "inline-flex",
    flexShrink: 0,
    justifyContent: "center",
    padding: spacingVars["--spacing-0-5"],
  },
  rowHeaderCell: {
    borderBottomWidth: 0,
  },
  warningIndicator: {
    backgroundColor: colorVars["--color-warning-muted"],
  },
});

function ignoreCreateFieldIntent() {}

function ignoreCreateIntent() {}
