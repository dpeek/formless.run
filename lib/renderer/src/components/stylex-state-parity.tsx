import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { TopNavItem } from "@astryxdesign/core/TopNav";
import { colorVars, spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import { FormlessFixtureFrame } from "./fixture-layout.tsx";

export function FormlessStylexStateParityLayout() {
  return (
    <FormlessFixtureFrame ariaLabel="StyleX state parity fixture controls">
      <main aria-label="StyleX state parity fixture" {...stylex.props(styles.fixture)}>
        <section aria-label="Astryx navigation states" {...stylex.props(styles.probeGroup)}>
          <TopNavItem href="#stylex-state-parity" label="Default navigation" />
          <TopNavItem href="#stylex-state-parity" isSelected label="Selected navigation" />
        </section>

        <section aria-label="Astryx control states" {...stylex.props(styles.probeGroup)}>
          <Button
            aria-label="Interactive state probe"
            label="Interactive state probe"
            variant="secondary"
          />
          <SegmentedControl
            label="Selected state probe"
            layout="hug"
            onChange={() => undefined}
            value="selected"
          >
            <SegmentedControlItem label="Selected option" value="selected" />
            <SegmentedControlItem label="Unselected option" value="unselected" />
          </SegmentedControl>
        </section>

        <FormLayout
          aria-label="Astryx responsive layout"
          direction="horizontal-labels"
          xstyle={styles.responsiveProbe}
        >
          <span>Responsive label</span>
          <span>Responsive value</span>
        </FormLayout>
      </main>
    </FormlessFixtureFrame>
  );
}

const styles = stylex.create({
  fixture: {
    backgroundColor: "transparent",
    color: colorVars["--color-text-primary"],
    display: "grid",
    gap: spacingVars["--spacing-6"],
    padding: spacingVars["--spacing-6"],
    transform: "scale(1)",
  },
  probeGroup: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: spacingVars["--spacing-3"],
  },
  responsiveProbe: {
    backgroundColor: colorVars["--color-background-surface"],
    padding: spacingVars["--spacing-4"],
  },
});
