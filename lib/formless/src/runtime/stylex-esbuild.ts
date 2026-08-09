import type { Plugin } from "esbuild";
import stylexEsbuild from "@stylexjs/unplugin/esbuild";

export function formlessStylexWorkerBundlePlugin(rendererRoot: string): Plugin {
  return stylexEsbuild({
    dev: false,
    runtimeInjection: false,
    treeshakeCompensation: true,
    unstable_moduleResolution: {
      rootDir: rendererRoot,
      type: "commonJS",
    },
    useCSSLayers: { prefix: "product" },
  } as never) as Plugin;
}
