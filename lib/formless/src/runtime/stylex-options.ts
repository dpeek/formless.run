import type { UserOptions } from "@stylexjs/unplugin";

export const FORMLESS_STYLEX_LAYER_ORDER = "@layer reset, astryx-base, astryx-theme, product;";

type FormlessProductStylexOptionsInput = {
  canonicalRoot: string;
  cssInjectionTarget?: NonNullable<UserOptions["cssInjectionTarget"]>;
  development: boolean;
};

export function formlessProductStylexOptions({
  canonicalRoot,
  cssInjectionTarget,
  development,
}: FormlessProductStylexOptionsInput): Partial<UserOptions> {
  return {
    classNamePrefix: "fml",
    dev: development,
    importSources: ["@stylexjs/stylex"],
    runtimeInjection: false,
    treeshakeCompensation: true,
    unstable_moduleResolution: {
      rootDir: canonicalRoot,
      type: "commonJS",
    },
    useCSSLayers: { prefix: "product" },
    ...(cssInjectionTarget ? { cssInjectionTarget } : {}),
  };
}
