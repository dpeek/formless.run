import * as stylex from "@stylexjs/stylex";
import { DropdownMenu, DropdownMenuItem } from "@astryxdesign/core/DropdownMenu";
import { Icon } from "@astryxdesign/core/Icon";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import {
  colorVars,
  fontWeightVars,
  radiusVars,
  sizeVars,
  spacingVars,
  typeScaleVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import { SourceIcon } from "./field-primitives.tsx";
import { astryxPresentationColors } from "./presentation-color.ts";

export type StateInputOption = {
  colorIntent?: "neutral" | "success" | "warning" | "danger";
  colorToken?: string;
  label: string;
  source?: string;
};

export type StateInputTransition = {
  id: string;
  label: string;
  operationKey: string;
  pending?: {
    isPending: boolean;
  };
  targetValue: string;
};

export type StateInputProps = {
  label: string;
  value: string;
  option?: StateInputOption;
  transitions: readonly StateInputTransition[];
  isCompact?: boolean;
  isDisabled?: boolean;
  isTerminal?: boolean;
  isPending?: boolean;
  pendingLabel?: string;
  valueStatus:
    | {
        kind: "declared";
        value: string;
      }
    | {
        kind: "unset";
        message: string;
      }
    | {
        kind: "undeclared";
        message: string;
        value: string;
      };
  onTransition?: (transition: StateInputTransition) => void;
};
export function StateInput({
  label,
  value,
  option,
  transitions,
  isCompact = false,
  isDisabled = false,
  isTerminal = false,
  isPending = false,
  pendingLabel,
  valueStatus,
  onTransition,
}: StateInputProps) {
  const stateText = option?.label ?? (value ? value : "No state");
  const colors = stateInputColors(option);
  const invalidMessage = valueStatus.kind === "declared" ? undefined : valueStatus.message;
  const displayText =
    valueStatus.kind === "unset"
      ? "Unset"
      : valueStatus.kind === "undeclared"
        ? valueStatus.value
        : stateText;
  const stateDescription = `${displayText}${isTerminal ? " terminal" : ""}`;
  const controlLabel = isPending
    ? `${label}: ${stateDescription}. ${pendingLabel ?? "Updating state"}`
    : `${label}: ${stateDescription}`;
  const isStatic = isDisabled || transitions.length === 0;
  const stateIcon =
    valueStatus.kind === "declared" ? (
      option?.source ? (
        <StateIcon option={option} />
      ) : undefined
    ) : (
      <Icon icon="warning" color="warning" size="sm" />
    );

  const staticContent = (
    <span {...stylex.props(styles.content, isCompact && styles.contentCompact)}>
      {stateIcon ? <span {...stylex.props(styles.icon)}>{stateIcon}</span> : null}
      <span {...stylex.props(styles.label)}>{displayText}</span>
    </span>
  );

  if (isStatic) {
    const control = (
      <span
        aria-label={controlLabel}
        role="status"
        tabIndex={invalidMessage ? 0 : undefined}
        {...stylex.props(
          styles.staticControl,
          isCompact && styles.staticControlCompact,
          invalidMessage
            ? styles.invalidControl
            : dynamicStyles.color(colors.background, colors.foreground, colors.border),
        )}
      >
        {staticContent}
      </span>
    );

    return invalidMessage ? <Tooltip content={invalidMessage}>{control}</Tooltip> : control;
  }

  return (
    <DropdownMenu
      button={{
        label: `${controlLabel}. Change state`,
        children: displayText,
        variant: invalidMessage ? "ghost" : "secondary",
        size: isCompact ? "sm" : "md",
        isLoading: isPending,
        icon: stateIcon,
        tooltip: invalidMessage,
        xstyle: [
          styles.trigger,
          isCompact && styles.triggerCompact,
          invalidMessage
            ? styles.invalidControl
            : dynamicStyles.color(colors.background, colors.foreground, colors.border),
        ],
      }}
      hasChevron={false}
      menuWidth={248}
      placement="below"
    >
      {transitions.map((transition) => {
        const transitionIsDisabled = isDisabled || isPending || transition.pending?.isPending;

        return (
          <DropdownMenuItem
            key={transition.id}
            label={transition.label}
            icon={transition.pending?.isPending ? <Spinner size="sm" shade="inherit" /> : undefined}
            endContent={
              transition.pending?.isPending ? (
                <Text type="supporting" color="secondary">
                  Running
                </Text>
              ) : undefined
            }
            isDisabled={Boolean(transitionIsDisabled)}
            onClick={() => onTransition?.(transition)}
          />
        );
      })}
    </DropdownMenu>
  );
}

function StateIcon({ option }: { option: StateInputOption | undefined }) {
  if (option?.source) {
    return <SourceIcon source={option.source} size="sm" color="inherit" aria-hidden />;
  }

  return null;
}

type StateInputColor = {
  background: string;
  border: string;
  foreground: string;
};

function stateInputColors(option: StateInputOption | undefined): StateInputColor {
  const projectedColors = astryxPresentationColors(option?.colorToken);

  if (projectedColors) {
    return projectedColors;
  }

  if (option?.colorIntent === "success") {
    return {
      background: colorVars["--color-success"],
      border: colorVars["--color-success"],
      foreground: colorVars["--color-on-success"],
    };
  }

  if (option?.colorIntent === "warning") {
    return {
      background: colorVars["--color-warning"],
      border: colorVars["--color-warning"],
      foreground: colorVars["--color-on-warning"],
    };
  }

  if (option?.colorIntent === "danger") {
    return {
      background: colorVars["--color-error"],
      border: colorVars["--color-error"],
      foreground: colorVars["--color-on-error"],
    };
  }

  return {
    background: colorVars["--color-neutral"],
    border: colorVars["--color-neutral"],
    foreground: colorVars["--color-text-primary"],
  };
}

const styles = stylex.create({
  trigger: {
    borderRadius: radiusVars["--radius-full"],
  },
  triggerCompact: {
    minWidth: 0,
  },
  staticControl: {
    boxSizing: "border-box",
    display: "inline-flex",
    alignItems: "center",
    height: sizeVars["--size-element-md"],
    borderRadius: radiusVars["--radius-full"],
    overflow: "hidden",
    paddingBlock: 0,
    paddingInline: spacingVars["--spacing-3"],
    fontFamily: "inherit",
    fontSize: typeScaleVars["--text-label-size"],
    lineHeight: typeScaleVars["--text-label-leading"],
    fontWeight: fontWeightVars["--font-weight-medium"],
  },
  staticControlCompact: {
    height: sizeVars["--size-element-sm"],
  },
  content: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 0,
    gap: spacingVars["--spacing-2"],
  },
  contentCompact: {
    maxWidth: "100%",
  },
  label: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  icon: {
    display: "inline-flex",
    alignItems: "center",
    flexShrink: 0,
    lineHeight: 0,
  },
  invalidControl: {
    backgroundColor: "transparent",
    color: colorVars["--color-warning"],
  },
});

const dynamicStyles = stylex.create({
  color: (backgroundColor: string, color: string, borderColor: string) => ({
    backgroundColor,
    borderColor,
    color,
  }),
});
