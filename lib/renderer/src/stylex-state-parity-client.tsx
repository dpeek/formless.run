import { hydrateRoot } from "react-dom/client";
import { FormlessStylexStateParityLayout } from "./components/stylex-state-parity.tsx";
import "./global.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("StyleX state parity fixture root not found.");
}

hydrateRoot(root, <FormlessStylexStateParityLayout />);
