import * as stylex from "@stylexjs/stylex";
import { HStack } from "@astryxdesign/core/HStack";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { MediaTheme } from "@astryxdesign/core/theme";
import { colorVars, spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type {
  DocumentThemeContract,
  DocumentThemeSelectionControlContract,
} from "@dpeek/formless-presentation/contract";
import { FormlessThemeProvider } from "../theme.tsx";
import { FormlessThemeIconToggle } from "./theme.tsx";

export type FormlessFixtureThemeMode = "light" | "dark";

type FormlessFixtureEnvironment = {
  mode: FormlessFixtureThemeMode;
  setMode: Dispatch<SetStateAction<FormlessFixtureThemeMode>>;
};

const FormlessFixtureEnvironmentContext = createContext<FormlessFixtureEnvironment | null>(null);

export function FormlessFixtureEnvironmentProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<FormlessFixtureThemeMode>("light");

  return (
    <FormlessFixtureEnvironmentContext value={{ mode, setMode }}>
      {children}
    </FormlessFixtureEnvironmentContext>
  );
}

export function useFormlessFixtureEnvironment() {
  return useContext(FormlessFixtureEnvironmentContext);
}

export function FormlessFixtureFrame({
  ariaLabel,
  children,
  controls,
}: {
  ariaLabel: string;
  children: ReactNode;
  controls?: ReactNode;
}) {
  const sharedEnvironment = useFormlessFixtureEnvironment();
  const [localMode, setLocalMode] = useState<FormlessFixtureThemeMode>("light");
  const environment = sharedEnvironment ?? { mode: localMode, setMode: setLocalMode };
  const { mode, setMode } = environment;

  const frame = (
    <div {...stylex.props(styles.frame)}>
      <HStack
        align="center"
        aria-label={ariaLabel}
        gap={2}
        paddingBlock={2}
        paddingInline={4}
        role="toolbar"
        width="100%"
        xstyle={styles.fixtureBar}
      >
        <MediaTheme mode={mode === "light" ? "dark" : "light"}>
          <div {...stylex.props(styles.controls)}>{controls}</div>
          <FormlessFixtureSelector
            label="Fixture theme"
            onSelectionChange={setMode}
            options={fixtureThemeOptions}
            selectedId={mode}
          />
        </MediaTheme>
      </HStack>
      {children}
    </div>
  );

  return sharedEnvironment ? (
    frame
  ) : (
    <FormlessFixtureEnvironmentContext value={environment}>
      <FormlessThemeProvider theme={formlessFixtureTheme(mode)}>{frame}</FormlessThemeProvider>
    </FormlessFixtureEnvironmentContext>
  );
}

export function FormlessFixtureThemeToggle() {
  const environment = useFormlessFixtureEnvironment();

  return environment ? (
    <FormlessThemeIconToggle
      activeMode={environment.mode}
      control={fixtureDocumentThemeControl(environment.mode)}
      onIntent={(intent) => {
        if (intent.mode !== "system") {
          environment.setMode(intent.mode);
        }
      }}
    />
  ) : null;
}

export function FormlessFixtureSelector<OptionId extends string>({
  label,
  onSelectionChange,
  options,
  selectedId,
}: {
  label: string;
  onSelectionChange: (optionId: OptionId) => void;
  options: readonly {
    id: OptionId;
    label: string;
  }[];
  selectedId: OptionId;
}) {
  return (
    <SegmentedControl
      label={label}
      layout="hug"
      onChange={(value) => onSelectionChange(value as OptionId)}
      size="sm"
      value={selectedId}
    >
      {options.map((option) => (
        <SegmentedControlItem key={option.id} label={option.label} value={option.id} />
      ))}
    </SegmentedControl>
  );
}

const fixtureThemeOptions = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
] as const;

function fixtureDocumentThemeControl(
  mode: FormlessFixtureThemeMode,
): DocumentThemeSelectionControlContract {
  const controlId = "control:fixture-theme";
  const themeId = "theme:fixture";
  const option = (optionMode: FormlessFixtureThemeMode, label: string) => ({
    label,
    mode: optionMode,
    selectionIntent: {
      controlId,
      mode: optionMode,
      themeId,
      type: "documentThemeModeSelection" as const,
    },
  });

  return {
    accessibilityLabel: "Theme mode",
    id: controlId,
    kind: "documentThemeSelectionControl",
    options: [option("light", "Light"), option("dark", "Dark")],
    selectedMode: mode,
  };
}

export function formlessFixtureTheme(mode: FormlessFixtureThemeMode): DocumentThemeContract {
  return {
    activeMode: mode,
    id: "theme:fixture",
    kind: "documentTheme",
    policy: { kind: "fixed", mode },
  };
}

const styles = stylex.create({
  frame: {
    backgroundColor: colorVars["--color-background-body"],
    color: colorVars["--color-text-primary"],
    minHeight: "100vh",
  },
  fixtureBar: {
    backgroundColor: colorVars["--color-background-inverted"],
    overflowX: "auto",
  },
  controls: {
    alignItems: "center",
    display: "flex",
    flex: 1,
    gap: spacingVars["--spacing-2"],
    minWidth: "max-content",
  },
});
