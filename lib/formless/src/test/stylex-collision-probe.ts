import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  background: {
    backgroundColor: "transparent",
  },
  transform: {
    transform: "scale(1)",
  },
});

export function renderStylexCollisionProbe(): string {
  const { className } = stylex.props(styles.background, styles.transform);

  return `<div class="${className ?? ""}">StyleX collision probe</div>`;
}
