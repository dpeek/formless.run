import { renderToString } from "react-dom/server";
import { FormlessStylexStateParityLayout } from "./components/stylex-state-parity.tsx";

export function renderStylexStateParityFixture(): string {
  return renderToString(<FormlessStylexStateParityLayout />);
}
