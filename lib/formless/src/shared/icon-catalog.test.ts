import { parseSourceSvg } from "@dpeek/formless-source-svg";
import { addIconSource, formlessIconSource } from "@dpeek/formless-icons/sources";
import type { AppSchema } from "@dpeek/formless-schema";
import { describe, expect, it } from "vite-plus/test";
import {
  findAppIconCatalogEntry,
  findIconCatalogEntry,
  iconCatalogEntries,
  listAppIconCatalogEntries,
  listIconCatalogGroups,
  resolveAppIconCatalogSvg,
  resolveIconCatalogSvg,
} from "./icon-catalog.ts";

describe("icon catalog", () => {
  it("exposes unique icon keys grouped for authoring", () => {
    const keys = iconCatalogEntries.map((entry) => entry.key);

    expect(new Set(keys).size).toBe(keys.length);
    expect(listIconCatalogGroups().map(({ key, label }) => ({ key, label }))).toEqual([
      { key: "ui", label: "Interface" },
      { key: "brand", label: "Brand" },
      { key: "social", label: "Social" },
      { key: "provider", label: "Providers" },
    ]);
    expect(
      listIconCatalogGroups().find((group) => group.key === "ui")?.entries.length,
    ).toBeGreaterThan(0);
  });

  it("includes current UI purpose, social, and provider entries", () => {
    expect(findIconCatalogEntry("add")?.label).toBe("Add");
    expect(findIconCatalogEntry("copy")?.label).toBe("Copy");
    expect(findIconCatalogEntry("priority-marker")).toMatchObject({
      group: "ui",
      label: "Priority marker",
      searchTerms: ["flag"],
    });
    expect(findIconCatalogEntry("publish")?.label).toBe("Publish");
    expect(findIconCatalogEntry("formless")).toEqual({
      group: "brand",
      key: "formless",
      label: "Formless",
      source: formlessIconSource,
    });
    expect(findIconCatalogEntry("github")?.label).toBe("GitHub");
    expect(findIconCatalogEntry("linkedin")?.label).toBe("LinkedIn");
    expect(findIconCatalogEntry("bluesky")?.label).toBe("Bluesky");
    expect(findIconCatalogEntry("threads")?.label).toBe("Threads");
    expect(findIconCatalogEntry("mastodon")?.label).toBe("Mastodon");
    expect(findIconCatalogEntry("x")?.label).toBe("X");
    expect(findIconCatalogEntry("facebook")?.label).toBe("Facebook");
    expect(findIconCatalogEntry("instagram")?.label).toBe("Instagram");
    expect(findIconCatalogEntry("youtube")?.label).toBe("YouTube");
    expect(findIconCatalogEntry("vimeo")?.label).toBe("Vimeo");
    expect(findIconCatalogEntry("gravatar")?.label).toBe("Gravatar");
    expect(findIconCatalogEntry("movember")?.label).toBe("Movember");
    expect(findIconCatalogEntry("google")?.label).toBe("Google");
    expect(findIconCatalogEntry("apple")?.label).toBe("Apple");
    expect(findIconCatalogEntry("microsoft")?.label).toBe("Microsoft");
    expect(findIconCatalogEntry("gitlab")?.label).toBe("GitLab");
    expect(findIconCatalogEntry("npm")?.label).toBe("npm");
  });

  it("resolves current presentation tokens", () => {
    expect(resolveIconCatalogSvg(" ADD ")).toBe(addIconSource);
    expect(resolveIconCatalogSvg("priority-marker")).toBe(
      findIconCatalogEntry("priority-marker")?.source,
    );
    expect(resolveIconCatalogSvg("formless")).toBe(formlessIconSource);
    expect(resolveIconCatalogSvg("x")).toBe(findIconCatalogEntry("x")?.source);
    expect(findIconCatalogEntry("missing")).toBeUndefined();
  });

  it("merges ordered App schema icons ahead of baked defaults with schema precedence", () => {
    const overriddenAdd = '<svg viewBox="0 0 24 24"><path d="M2 2h20v20H2z" /></svg>';
    const product = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /></svg>';
    const schema = {
      icons: [
        { key: "product", label: "Product", group: "Brand", source: product },
        { key: "add", label: "Product add", source: overriddenAdd },
      ],
    } satisfies Pick<AppSchema, "icons">;
    const merged = listAppIconCatalogEntries(schema);

    expect(merged.slice(0, 2)).toEqual(schema.icons);
    expect(merged.filter((entry) => entry.key === "add")).toEqual([schema.icons[1]]);
    expect(merged.some((entry) => entry.key === "calendar")).toBe(true);
    expect(findAppIconCatalogEntry(schema, "product")).toEqual(schema.icons[0]);
    expect(resolveAppIconCatalogSvg(schema, "add")).toBe(overriddenAdd);
    expect(resolveIconCatalogSvg("add")).toBe(addIconSource);
  });

  it("keeps every catalog SVG source parseable by the renderer-neutral safe parser", () => {
    for (const entry of iconCatalogEntries) {
      expect(parseSourceSvg(entry.source), entry.key).not.toBeNull();
    }
  });

  it.each([
    "<svg><script>alert(1)</script></svg>",
    "<svg><foreignObject><p>HTML</p></foreignObject></svg>",
    '<svg><path href="javascript:alert(1)" /></svg>',
    '<svg><path fill="url(https://example.com/pattern.svg)" /></svg>',
    "<svg><path></svg>",
    `<svg>${" ".repeat(50000)}</svg>`,
  ])("keeps unsafe, malformed, and oversized catalog source outside the safe policy", (source) => {
    expect(parseSourceSvg(source)).toBeNull();
  });
});
