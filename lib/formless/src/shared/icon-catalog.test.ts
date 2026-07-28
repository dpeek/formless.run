import { parseSourceSvg } from "@dpeek/formless-source-svg";
import { describe, expect, it } from "vite-plus/test";
import {
  findIconCatalogEntry,
  iconCatalogEntries,
  listIconCatalogGroups,
  resolveIconCatalogSvg,
} from "./icon-catalog.ts";

describe("icon catalog", () => {
  it("exposes unique icon keys grouped for authoring", () => {
    const keys = iconCatalogEntries.map((entry) => entry.key);

    expect(new Set(keys).size).toBe(keys.length);
    expect(listIconCatalogGroups().map(({ key, label }) => ({ key, label }))).toEqual([
      { key: "ui", label: "Interface" },
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
    expect(findIconCatalogEntry("priority-marker")?.label).toBe("Priority marker");
    expect(findIconCatalogEntry("publish")?.label).toBe("Publish");
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
    expect(resolveIconCatalogSvg("priority-marker")).toBe(
      findIconCatalogEntry("priority-marker")?.source,
    );
    expect(resolveIconCatalogSvg("x")).toBe(findIconCatalogEntry("x")?.source);
    expect(findIconCatalogEntry("missing")).toBeUndefined();
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
