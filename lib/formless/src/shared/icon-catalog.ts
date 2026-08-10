import {
  builtInIconSources,
  isBuiltInIconKey,
  resolveBuiltInIconSource,
  type BuiltInIconKey,
} from "@dpeek/formless-icons";
import { mergeSchemaIconDefinitionsWithDefaults, type AppSchema } from "@dpeek/formless-schema";

const iconCatalogGroupDefinitions = [
  { key: "ui", label: "Interface" },
  { key: "brand", label: "Brand" },
  { key: "social", label: "Social" },
  { key: "provider", label: "Providers" },
] as const;

export type IconCatalogGroupKey = (typeof iconCatalogGroupDefinitions)[number]["key"];

export type IconCatalogEntry = {
  group: IconCatalogGroupKey;
  key: string;
  label: string;
  searchTerms?: readonly string[];
  source: string;
};

export type IconCatalogGroup = {
  entries: readonly IconCatalogEntry[];
  key: IconCatalogGroupKey;
  label: string;
};

export type AppIconCatalogEntry = {
  group?: string;
  key: string;
  label: string;
  source: string;
};

type IconCatalogMetadata = Omit<IconCatalogEntry, "key" | "source"> & {
  key: BuiltInIconKey;
};

const iconCatalogMetadata = [
  { group: "ui", key: "add", label: "Add" },
  { group: "ui", key: "calendar", label: "Calendar" },
  { group: "ui", key: "confirm", label: "Confirm", searchTerms: ["check"] },
  { group: "ui", key: "close", label: "Close", searchTerms: ["dismiss", "x"] },
  { group: "ui", key: "color-pick", label: "Color pick", searchTerms: ["pipette"] },
  { group: "ui", key: "copy", label: "Copy" },
  { group: "ui", key: "disclosure", label: "Disclosure", searchTerms: ["chevron right"] },
  { group: "ui", key: "disclosure-down", label: "Disclosure down", searchTerms: ["chevron down"] },
  { group: "ui", key: "drag-handle", label: "Drag handle", searchTerms: ["grip"] },
  { group: "ui", key: "indeterminate", label: "Indeterminate", searchTerms: ["minus"] },
  { group: "ui", key: "loading", label: "Loading", searchTerms: ["spinner"] },
  { group: "ui", key: "menu", label: "Menu" },
  { group: "ui", key: "next", label: "Next", searchTerms: ["chevron right"] },
  { group: "ui", key: "previous", label: "Previous", searchTerms: ["chevron left"] },
  { group: "ui", key: "priority-marker", label: "Priority marker", searchTerms: ["flag"] },
  { group: "ui", key: "publish", label: "Publish", searchTerms: ["rocket"] },
  { group: "ui", key: "remove", label: "Remove", searchTerms: ["delete"] },
  { group: "ui", key: "select", label: "Select", searchTerms: ["chevrons"] },
  { group: "ui", key: "select-down", label: "Select down" },
  { group: "ui", key: "sort", label: "Sort" },
  { group: "ui", key: "tree-disclosure", label: "Tree disclosure" },
  { group: "ui", key: "text-bold", label: "Bold" },
  { group: "ui", key: "text-bulleted-list", label: "Bulleted list" },
  { group: "ui", key: "text-code", label: "Code" },
  { group: "ui", key: "text-heading-two", label: "Heading 2" },
  { group: "ui", key: "text-heading-three", label: "Heading 3" },
  { group: "ui", key: "text-italic", label: "Italic" },
  { group: "ui", key: "text-link", label: "Link" },
  { group: "ui", key: "text-numbered-list", label: "Numbered list" },
  { group: "ui", key: "text-paragraph", label: "Paragraph" },
  { group: "ui", key: "text-quote", label: "Quote" },
  { group: "ui", key: "text-strikethrough", label: "Strikethrough" },
  { group: "brand", key: "formless", label: "Formless" },
  { group: "social", key: "github", label: "GitHub" },
  { group: "social", key: "linkedin", label: "LinkedIn" },
  { group: "social", key: "bluesky", label: "Bluesky", searchTerms: ["bsky"] },
  { group: "social", key: "threads", label: "Threads", searchTerms: ["meta"] },
  { group: "social", key: "mastodon", label: "Mastodon" },
  { group: "social", key: "x", label: "X", searchTerms: ["twitter"] },
  { group: "social", key: "facebook", label: "Facebook" },
  { group: "social", key: "instagram", label: "Instagram" },
  { group: "social", key: "youtube", label: "YouTube" },
  { group: "social", key: "vimeo", label: "Vimeo" },
  { group: "social", key: "gravatar", label: "Gravatar" },
  { group: "social", key: "movember", label: "Movember", searchTerms: ["moustache", "mustache"] },
  { group: "provider", key: "apple", label: "Apple" },
  { group: "provider", key: "gitlab", label: "GitLab" },
  { group: "provider", key: "google", label: "Google" },
  { group: "provider", key: "microsoft", label: "Microsoft" },
  { group: "provider", key: "npm", label: "npm" },
] as const satisfies readonly IconCatalogMetadata[];

export const iconCatalogEntries = iconCatalogMetadata.map((entry) => ({
  ...entry,
  source: builtInIconSources[entry.key],
})) satisfies readonly IconCatalogEntry[];

export function listIconCatalogEntries(): readonly IconCatalogEntry[] {
  return iconCatalogEntries;
}

export function listIconCatalogGroups(): readonly IconCatalogGroup[] {
  return iconCatalogGroupDefinitions.map((group) => ({
    ...group,
    entries: iconCatalogEntries.filter((entry) => entry.group === group.key),
  }));
}

export function findIconCatalogEntry(key: string | undefined): IconCatalogEntry | undefined {
  if (!key) {
    return undefined;
  }

  return iconCatalogEntries.find((entry) => entry.key === normalizeIconCatalogKey(key));
}

export function resolveIconCatalogSvg(key: string | undefined): string | undefined {
  return resolveBuiltInIconSource(key);
}

export function listAppIconCatalogEntries(
  schema: Pick<AppSchema, "icons"> | null | undefined,
): readonly AppIconCatalogEntry[] {
  return mergeSchemaIconDefinitionsWithDefaults<AppIconCatalogEntry>(
    schema?.icons,
    iconCatalogEntries,
  );
}

export function findAppIconCatalogEntry(
  schema: Pick<AppSchema, "icons"> | null | undefined,
  key: string | undefined,
): AppIconCatalogEntry | undefined {
  if (!key) {
    return undefined;
  }

  return listAppIconCatalogEntries(schema).find((entry) => entry.key === key);
}

export function resolveAppIconCatalogSvg(
  schema: Pick<AppSchema, "icons"> | null | undefined,
  key: string | undefined,
): string | undefined {
  if (!key) {
    return undefined;
  }

  const schemaSource = schema?.icons?.find((entry) => entry.key === key)?.source;

  if (schemaSource !== undefined) {
    return schemaSource;
  }

  return isBuiltInIconKey(key) ? builtInIconSources[key] : undefined;
}

function normalizeIconCatalogKey(key: string): string {
  return key.trim().toLowerCase();
}
