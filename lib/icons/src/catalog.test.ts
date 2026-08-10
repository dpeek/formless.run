import { parseSourceSvg } from "@dpeek/formless-source-svg";
import { describe, expect, it } from "vite-plus/test";

import { builtInIconKeys, builtInIconSources, resolveBuiltInIconSource } from "./catalog.ts";
import { addIconSource, formlessIconSource } from "./sources.ts";

describe("built-in icon sources", () => {
  it("exposes stable named and keyed source identities", () => {
    expect(builtInIconSources.add).toBe(addIconSource);
    expect(builtInIconSources.formless).toBe(formlessIconSource);
    expect(builtInIconKeys).toEqual(Object.keys(builtInIconSources));
    expect(new Set(builtInIconKeys).size).toBe(builtInIconKeys.length);
  });

  it("resolves normalized built-in keys without picker metadata", () => {
    expect(resolveBuiltInIconSource(" ADD ")).toBe(addIconSource);
    expect(resolveBuiltInIconSource("formless")).toBe(formlessIconSource);
    expect(resolveBuiltInIconSource("missing")).toBeUndefined();
    expect(resolveBuiltInIconSource(undefined)).toBeUndefined();
  });

  it("keeps every trusted source inside the renderer-neutral safe SVG policy", () => {
    for (const key of builtInIconKeys) {
      expect(parseSourceSvg(builtInIconSources[key]), key).not.toBeNull();
    }
  });
});
