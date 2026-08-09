import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import stylex from "@stylexjs/unplugin";

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
                children: "@layer reset, astryx-base, astryx-theme, product;",
                injectTo: "head-prepend" as const,
              },
            ],
          },
          stylex.vite({
            dev: process.env.NODE_ENV !== "production",
            runtimeInjection: false,
            treeshakeCompensation: true,
            unstable_moduleResolution: {
              rootDir: rendererRoot,
              type: "commonJS",
            },
            useCSSLayers: { prefix: "product" },
          }),
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
