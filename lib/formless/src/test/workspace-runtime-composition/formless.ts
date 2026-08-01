import { defineConfig } from "@dpeek/formless";
import { workspaceProgramComposition } from "./program.ts";

export default defineConfig({
  name: "workspace-runtime-composition",
  program: workspaceProgramComposition,
  runtime: {
    composition: {
      shared: "shared.ts",
      browser: "browser.ts",
      worker: "worker.ts",
    },
  },
});
