import { describe, expect, it } from "vite-plus/test";

import { resolveIconCatalogSvg } from "../shared/icon-catalog.ts";
import type { FieldValue, StoredRecord } from "@dpeek/formless-storage";
import { siteSeedRecords } from "../test/schema-apps.ts";

describe("Site starter seed", () => {
  it("defines a neutral no-media starter source", () => {
    expect(siteSeedRecords.length).toBeGreaterThan(0);
    expect(siteSeedRecords.some((record) => record.deletedAt !== undefined)).toBe(false);
    expect(blocksOfType("image")).toEqual([]);
    expect(ownedOrInlineImageHrefs()).toEqual([]);
    expect(serializedSeed()).not.toContain("David Peek");
    expect(serializedSeed()).not.toContain("dpeek");
    expect(serializedSeed()).not.toContain("PricingLab");
    expect(serializedSeed()).not.toContain("OpenSurf");
  });

  it("includes one primary Site settings record with authored label, description, SVG icon, and colors", () => {
    const settings = siteSeedRecords.filter((record) => record.entity === "site");

    expect(settings).toHaveLength(1);
    expect(settings[0]?.values).toEqual({
      key: "primary",
      label: "Starter Site",
      description: "A small starter site.",
      icon: expect.stringMatching(/^<svg[\s\S]*<\/svg>$/),
      accentColor: "#C98A2E",
      backgroundColor: "#09090B",
      initialThemeMode: "system",
      themeSwitchable: true,
    });
    expect(settings[0]?.values).not.toHaveProperty("png");
    expect(settings[0]?.values).not.toHaveProperty("ico");
  });

  it("includes starter pages, one post, one project, and minimal page composition", () => {
    expect(
      blocksOfType("page").map((record) => ({
        href: stringField(record, "href"),
        label: stringField(record, "label"),
      })),
    ).toEqual([
      { label: "Home", href: "/" },
      { label: "About", href: "/about" },
      { label: "Blog", href: "/blog" },
      { label: "Projects", href: "/projects" },
      { label: "Resume", href: "/resume" },
    ]);

    const post = onlyBlockOfType("post");
    expect(stringField(post, "href")).toMatch(/^\/blog\//);
    expect(stringField(post, "date")).toBe("2026-05-15");

    const project = onlyBlockOfType("project");
    expect(stringField(project, "href")).toBeUndefined();
    expect(stringField(project, "date")).toBe("2026-05-15");

    expect(childTypes(requiredBlock("page", "Home").id)).toEqual(["hero"]);
    expect(childTypes(requiredBlock("page", "About").id)).toEqual(["markdown"]);
    expect(childTypes(requiredBlock("page", "Blog").id)).toEqual(["postList"]);
    expect(childTypes(requiredBlock("page", "Projects").id)).toEqual(["projectList"]);
    expect(childTypes(requiredBlock("page", "Resume").id)).toEqual(["markdown"]);
  });

  it("keeps header and footer links data-driven", () => {
    const header = onlyBlockOfType("header");
    const headerGroups = childBlocks(header.id);

    expect(headerGroups.map((record) => stringField(record, "type"))).toEqual([
      "headerPrimary",
      "headerSecondary",
    ]);
    expect(
      headerGroups.flatMap((group) => childBlocks(group.id)).map((record) => record.values),
    ).toEqual([
      expect.objectContaining({
        label: "Home",
        linkTargetBlock: "rec_site_starter_page_home",
        linkTargetMode: "internal",
      }),
      expect.objectContaining({
        label: "About",
        linkTargetBlock: "rec_site_starter_page_about",
        linkTargetMode: "internal",
      }),
      expect.objectContaining({
        label: "Blog",
        linkTargetBlock: "rec_site_starter_page_blog",
        linkTargetMode: "internal",
      }),
      expect.objectContaining({
        label: "Projects",
        linkTargetBlock: "rec_site_starter_page_projects",
        linkTargetMode: "internal",
      }),
      expect.objectContaining({
        label: "Resume",
        linkTargetBlock: "rec_site_starter_page_resume",
        linkTargetMode: "internal",
      }),
    ]);

    const footerSocial = childBlocks(onlyBlockOfType("footer").id).find(
      (record) => stringField(record, "type") === "footerSocial",
    );

    if (!footerSocial) {
      throw new Error("Missing footer social group.");
    }

    expect(childBlocks(footerSocial.id).map((record) => record.values)).toEqual([
      expect.objectContaining({
        href: "https://github.com/your-handle",
        icon: requiredIconCatalogSvg("github"),
        label: "GitHub",
        linkTargetMode: "external",
      }),
      expect.objectContaining({
        href: "https://www.linkedin.com/in/your-handle",
        icon: requiredIconCatalogSvg("linkedin"),
        label: "LinkedIn",
        linkTargetMode: "external",
      }),
      expect.objectContaining({
        href: "https://x.com/your-handle",
        icon: requiredIconCatalogSvg("x"),
        label: "X",
        linkTargetMode: "external",
      }),
    ]);
  });
});

function blocksOfType(type: string): StoredRecord[] {
  return siteSeedRecords.filter(
    (record) => record.entity === "block" && stringField(record, "type") === type,
  );
}

function onlyBlockOfType(type: string): StoredRecord {
  const records = blocksOfType(type);

  expect(records).toHaveLength(1);

  const record = records[0];

  if (!record) {
    throw new Error(`Missing ${type} block.`);
  }

  return record;
}

function requiredBlock(type: string, label: string): StoredRecord {
  const record = blocksOfType(type).find((candidate) => stringField(candidate, "label") === label);

  if (!record) {
    throw new Error(`Missing ${label} ${type} block.`);
  }

  return record;
}

function childBlocks(parentId: string): StoredRecord[] {
  const records = new Map(siteSeedRecords.map((record) => [record.id, record]));

  return siteSeedRecords
    .filter(
      (record) => record.entity === "block-placement" && stringField(record, "parent") === parentId,
    )
    .sort((left, right) => numberField(left, "order") - numberField(right, "order"))
    .map((placement) => records.get(String(placement.values.block)))
    .filter((record): record is StoredRecord => record !== undefined);
}

function childTypes(parentId: string): string[] {
  return childBlocks(parentId).map((record) => stringField(record, "type") ?? "");
}

function ownedOrInlineImageHrefs(): string[] {
  return siteSeedRecords
    .map((record) => stringField(record, "href"))
    .filter(
      (href): href is string =>
        href !== undefined && (href.startsWith("/api/formless/media/") || href.startsWith("data:")),
    );
}

function serializedSeed(): string {
  return JSON.stringify(siteSeedRecords);
}

function stringField(record: StoredRecord, field: string): string | undefined {
  const value = record.values[field];

  return typeof value === "string" && value !== "" ? value : undefined;
}

function numberField(record: StoredRecord, field: string): number {
  const value: FieldValue | undefined = record.values[field];

  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function requiredIconCatalogSvg(key: string): string {
  const source = resolveIconCatalogSvg(key);

  if (!source) {
    throw new Error(`Missing icon catalog entry "${key}".`);
  }

  return source;
}
