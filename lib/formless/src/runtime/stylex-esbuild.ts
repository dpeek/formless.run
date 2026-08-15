import type { Plugin } from "esbuild";
import stylexEsbuild from "@stylexjs/unplugin/esbuild";
import { formlessProductStylexOptions } from "./stylex-options.ts";

export function formlessStylexWorkerBundlePlugin(rendererRoot: string): Plugin {
  return stylexEsbuild(
    formlessProductStylexOptions({
      canonicalRoot: rendererRoot,
      development: false,
    }) as never,
  ) as Plugin;
}
