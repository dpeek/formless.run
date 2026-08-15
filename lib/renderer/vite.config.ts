import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import stylex from "@stylexjs/unplugin";
import {
  FORMLESS_STYLEX_LAYER_ORDER,
  formlessProductStylexOptions,
} from "../formless/src/runtime/stylex-options.ts";

const rendererRoot = path.dirname(fileURLToPath(import.meta.url));
const isUnitTest = process.env.VITEST === "true" && process.env.NODE_ENV !== "production";

export default defineConfig({
  // @ts-ignore
  plugins: [
    ...(isUnitTest
      ? []
      : [
          {
            name: "formless-renderer-stylex-layer-order",
            transformIndexHtml: () => [
              {
                tag: "style",
                children: FORMLESS_STYLEX_LAYER_ORDER,
                injectTo: "head-prepend" as const,
              },
            ],
          },
          stylex.vite(
            formlessProductStylexOptions({
              canonicalRoot: rendererRoot,
              development: process.env.NODE_ENV !== "production",
            }),
          ),
        ]),
    react(),
  ],
  resolve: isUnitTest
    ? {
        alias: {
          "@stylexjs/stylex": path.resolve(rendererRoot, "../formless/src/test/stylex.ts"),
        },
      }
    : undefined,
  test: {
    reporters: ["minimal"],
    setupFiles: ["./test/setup.ts"],
  },
  server: {
    watch: {
      usePolling: true,
    },
  },
});
