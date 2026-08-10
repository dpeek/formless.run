import { parseBrowserAccessRequirement } from "./schema-authorization.ts";
import { collectQueryContextNames } from "./query.ts";
import {
  assertExactKeys,
  definitionsToRecord,
  isRecord,
  parseKeyedDefinitionArray,
  parseOptionalNonEmptyString,
  parseRequiredNonEmptyString,
} from "./schema-parse-helpers.ts";
import { semanticIconIds } from "./types.ts";
import type {
  AppAuthorizationSchema,
  AppNavigationEntrySchema,
  AppNavigationGroupSchema,
  AppNavigationQueryCountBadgeSchema,
  AppNavigationSchema,
  AppNavigationScreenReferenceSchema,
  AppNavigationSectionSchema,
  CollectionQuerySchema,
  CollectionScreenSectionSchema,
  RuntimeScreenSchema,
  ScreenAccessRequirement,
  ScreenLayoutSchema,
  ScreenLayoutWidthSchema,
  ScreenSchema,
  ScreenSectionSchema,
  SemanticIconId,
  ViewSchema,
  WorkspaceScreenSchema,
  KeyedDefinition,
} from "./types.ts";
export function parseScreens(
  value: unknown,
  views: Record<string, ViewSchema>,
  queries: Record<string, CollectionQuerySchema>,
  authorization: AppAuthorizationSchema | undefined,
): KeyedDefinition<ScreenSchema>[] {
  if (value === undefined) {
    throw new Error('Schema must include "screens".');
  }
  const screens = parseKeyedDefinitionArray("Schema screens", value, (screenName, screen) =>
    parseScreen(screenName, screen, views, queries, authorization),
  );
  if (screens.length === 0) {
    throw new Error("Schema screens must not be empty.");
  }
  return screens;
}
export function parseAppNavigation(
  value: unknown,
  screens: KeyedDefinition<ScreenSchema>[],
  queries: Record<string, CollectionQuerySchema>,
): AppNavigationSchema | undefined {
  if (value === undefined) {
    assertUniqueScreenPaths(
      screens,
      screens.map((screen) => screen.key),
    );
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error("Schema navigation must be an object.");
  }
  assertExactKeys("Schema navigation", value, [], ["groups", "primaryScreens"]);
  if (value.groups !== undefined && value.primaryScreens !== undefined) {
    throw new Error("Schema navigation must declare at most one of groups or primaryScreens.");
  }
  if (value.groups !== undefined) {
    const groups = parseAppNavigationGroups(value.groups, screens, queries);
    assertUniqueScreenPaths(
      screens,
      groups.flatMap((group) => flattenAppNavigationScreenKeys(group.screens)),
    );
    return { groups };
  }
  if (value.primaryScreens === undefined) {
    assertUniqueScreenPaths(
      screens,
      screens.map((screen) => screen.key),
    );
    return {};
  }
  if (!Array.isArray(value.primaryScreens) || value.primaryScreens.length === 0) {
    throw new Error("Schema navigation primaryScreens must be a non-empty array.");
  }
  const screensByKey = definitionsToRecord(screens);
  const primaryScreens = parseAppNavigationEntries(
    "Schema navigation primaryScreens",
    value.primaryScreens,
    screensByKey,
    queries,
    new Set(),
    (key) => `Schema navigation primaryScreens references unknown screen "${key}".`,
    () => "Schema navigation primaryScreens must not contain duplicates.",
  );
  assertUniqueScreenPaths(screens, flattenAppNavigationScreenKeys(primaryScreens));
  return { primaryScreens };
}

function parseAppNavigationGroups(
  value: unknown,
  screens: KeyedDefinition<ScreenSchema>[],
  queries: Record<string, CollectionQuerySchema>,
): KeyedDefinition<AppNavigationGroupSchema>[] {
  const screensByKey = definitionsToRecord(screens);
  const referencedScreenKeys = new Set<string>();

  return parseKeyedDefinitionArray("Schema navigation groups", value, (groupKey, group) => {
    const context = `Schema navigation group "${groupKey}"`;
    assertExactKeys(context, group, ["key", "label", "screens"]);
    const label = parseRequiredNonEmptyString(`${context} label`, group.label);
    if (!Array.isArray(group.screens) || group.screens.length === 0) {
      throw new Error(`${context} screens must be a non-empty array.`);
    }
    const groupScreens = parseAppNavigationEntries(
      `${context} screens`,
      group.screens,
      screensByKey,
      queries,
      referencedScreenKeys,
      (key) => `${context} references unknown screen "${key}".`,
      (key) => `Schema navigation groups must not reference screen "${key}" more than once.`,
    );
    return { label, screens: groupScreens };
  });
}

function parseAppNavigationEntries(
  context: string,
  value: unknown[],
  screens: Record<string, KeyedDefinition<ScreenSchema>>,
  queries: Record<string, CollectionQuerySchema>,
  referencedScreenKeys: Set<string>,
  unknownScreenError: (key: string) => string,
  duplicateScreenError: (key: string) => string,
): AppNavigationEntrySchema[] {
  const sectionKeys = new Set<string>();

  return value.map((entry, index) => {
    const entryContext = `${context}[${index}]`;
    if (
      isRecord(entry) &&
      !("screen" in entry) &&
      ("key" in entry || "label" in entry || "icon" in entry || "screens" in entry)
    ) {
      const section = parseAppNavigationSection(
        entryContext,
        entry,
        screens,
        queries,
        referencedScreenKeys,
        unknownScreenError,
        duplicateScreenError,
      );
      if (sectionKeys.has(section.key)) {
        throw new Error(`${context} contains duplicate navigation section key "${section.key}".`);
      }
      sectionKeys.add(section.key);
      return section;
    }

    return parseAppNavigationScreenReference(
      entryContext,
      entry,
      screens,
      queries,
      referencedScreenKeys,
      unknownScreenError,
      duplicateScreenError,
    );
  });
}

function parseAppNavigationSection(
  context: string,
  value: Record<string, unknown>,
  screens: Record<string, KeyedDefinition<ScreenSchema>>,
  queries: Record<string, CollectionQuerySchema>,
  referencedScreenKeys: Set<string>,
  unknownScreenError: (key: string) => string,
  duplicateScreenError: (key: string) => string,
): AppNavigationSectionSchema {
  assertExactKeys(context, value, ["key", "label", "screens"], ["icon"]);
  const key = parseRequiredNonEmptyString(`${context} key`, value.key);
  const label = parseRequiredNonEmptyString(`${context} label`, value.label);
  const icon = parseOptionalNonEmptyString(`${context} icon`, value.icon);
  if (icon !== undefined && !semanticIconIds.includes(icon as SemanticIconId)) {
    throw new Error(`${context} icon must be a supported semantic icon id.`);
  }
  if (!Array.isArray(value.screens) || value.screens.length === 0) {
    throw new Error(`${context} screens must be a non-empty array.`);
  }
  const sectionScreens = value.screens.map((screen, index) =>
    parseAppNavigationScreenReference(
      `${context} screens[${index}]`,
      screen,
      screens,
      queries,
      referencedScreenKeys,
      unknownScreenError,
      duplicateScreenError,
    ),
  );

  return {
    key,
    label,
    ...(icon === undefined ? {} : { icon: icon as SemanticIconId }),
    screens: sectionScreens,
  };
}

function parseAppNavigationScreenReference(
  context: string,
  value: unknown,
  screens: Record<string, KeyedDefinition<ScreenSchema>>,
  queries: Record<string, CollectionQuerySchema>,
  referencedScreenKeys: Set<string>,
  unknownScreenError: (key: string) => string,
  duplicateScreenError: (key: string) => string,
): AppNavigationScreenReferenceSchema {
  if (typeof value === "string") {
    const screenKey = parseNavigationScreenKey(context, value);
    assertNavigationScreenReference(
      screenKey,
      screens,
      referencedScreenKeys,
      unknownScreenError,
      duplicateScreenError,
    );
    return screenKey;
  }
  if (!isRecord(value)) {
    throw new Error(`${context} must be a non-empty screen key or an object screen reference.`);
  }
  assertExactKeys(context, value, ["screen", "badge"]);
  const screenKey = parseNavigationScreenKey(`${context} screen`, value.screen);
  assertNavigationScreenReference(
    screenKey,
    screens,
    referencedScreenKeys,
    unknownScreenError,
    duplicateScreenError,
  );
  return {
    screen: screenKey,
    badge: parseAppNavigationScreenBadge(
      `${context} badge`,
      value.badge,
      screens[screenKey],
      queries,
    ),
  };
}

function parseNavigationScreenKey(context: string, value: unknown): string {
  return parseRequiredNonEmptyString(context, value);
}

function assertNavigationScreenReference(
  screenKey: string,
  screens: Record<string, KeyedDefinition<ScreenSchema>>,
  referencedScreenKeys: Set<string>,
  unknownScreenError: (key: string) => string,
  duplicateScreenError: (key: string) => string,
) {
  if (!screens[screenKey]) {
    throw new Error(unknownScreenError(screenKey));
  }
  if (referencedScreenKeys.has(screenKey)) {
    throw new Error(duplicateScreenError(screenKey));
  }
  referencedScreenKeys.add(screenKey);
}

function parseAppNavigationScreenBadge(
  context: string,
  value: unknown,
  screen: KeyedDefinition<ScreenSchema>,
  queries: Record<string, CollectionQuerySchema>,
): AppNavigationQueryCountBadgeSchema {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }
  assertExactKeys(context, value, ["type", "section"]);
  if (value.type !== "queryCount") {
    throw new Error(`${context} type must be "queryCount".`);
  }
  const sectionId = parseRequiredNonEmptyString(`${context} section`, value.section);
  if (screen.type !== "workspace") {
    throw new Error(`${context} cannot reference runtime screen "${screen.key}".`);
  }
  const section = screen.layout.sections.find((candidate) => candidate.id === sectionId);
  if (!section) {
    throw new Error(`${context} references unknown screen section "${sectionId}".`);
  }
  if (section.query === undefined) {
    throw new Error(`${context} screen section "${sectionId}" must bind a query.`);
  }
  const query = queries[section.query];
  if (!query) {
    throw new Error(`${context} references unknown bound query "${section.query}".`);
  }
  if (collectQueryContextNames(query.expression).length > 0) {
    throw new Error(`${context} query "${section.query}" must not require context.`);
  }

  return { type: "queryCount", section: sectionId };
}

export function appNavigationScreenReferenceKey(
  reference: AppNavigationScreenReferenceSchema,
): string {
  return typeof reference === "string" ? reference : reference.screen;
}

export function flattenAppNavigationScreenReferences(
  entries: readonly AppNavigationEntrySchema[],
): AppNavigationScreenReferenceSchema[] {
  return entries.flatMap((entry) =>
    typeof entry === "object" && "screens" in entry ? entry.screens : [entry],
  );
}

export function flattenAppNavigationScreenKeys(
  entries: readonly AppNavigationEntrySchema[],
): string[] {
  return flattenAppNavigationScreenReferences(entries).map(appNavigationScreenReferenceKey);
}
function parseScreen(
  screenName: string,
  value: unknown,
  views: Record<string, ViewSchema>,
  queries: Record<string, CollectionQuerySchema>,
  authorization: AppAuthorizationSchema | undefined,
): ScreenSchema {
  if (screenName.trim() === "") {
    throw new Error("Screen names must be non-empty.");
  }

  if (!isRecord(value)) {
    throw new Error(`Screen "${screenName}" must be an object.`);
  }

  if (value.type === "runtime") {
    return parseRuntimeScreen(screenName, value, authorization);
  }

  if (value.type !== "workspace") {
    throw new Error(`Screen "${screenName}" type must be "workspace" or "runtime".`);
  }

  return parseWorkspaceScreen(screenName, value, views, queries, authorization);
}

function parseRuntimeScreen(
  screenName: string,
  value: Record<string, unknown>,
  authorization: AppAuthorizationSchema | undefined,
): RuntimeScreenSchema {
  assertExactKeys(`Screen "${screenName}"`, value, ["key", "type", "label"], ["access", "path"]);
  const label = parseRequiredNonEmptyString(`Screen "${screenName}" label`, value.label);
  const path = parseScreenPath(screenName, value.path);
  const access = parseScreenAccess(screenName, value.access, authorization);

  return {
    type: "runtime",
    label,
    ...(path === undefined ? {} : { path }),
    ...(access === undefined ? {} : { access }),
  };
}

function parseWorkspaceScreen(
  screenName: string,
  value: Record<string, unknown>,
  views: Record<string, ViewSchema>,
  queries: Record<string, CollectionQuerySchema>,
  authorization: AppAuthorizationSchema | undefined,
): WorkspaceScreenSchema {
  assertExactKeys(
    `Screen "${screenName}"`,
    value,
    ["key", "type", "label", "layout"],
    ["access", "path"],
  );
  const label = parseRequiredNonEmptyString(`Screen "${screenName}" label`, value.label);
  const path = parseScreenPath(screenName, value.path);
  const access = parseScreenAccess(screenName, value.access, authorization);
  const layout = parseScreenLayout(screenName, value.layout, views, queries);
  return {
    type: "workspace",
    label,
    ...(path === undefined ? {} : { path }),
    ...(access === undefined ? {} : { access }),
    layout,
  };
}

function parseScreenAccess(
  screenName: string,
  value: unknown,
  authorization: AppAuthorizationSchema | undefined,
): ScreenAccessRequirement | undefined {
  if (value === undefined) {
    return undefined;
  }

  return parseBrowserAccessRequirement(value, { authorization }, `Screen "${screenName}" access`);
}

function parseScreenPath(screenName: string, value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || !isStaticAppRelativePath(value)) {
    throw new Error(`Screen "${screenName}" path must be a static app-relative path.`);
  }

  return value;
}

export function isStaticAppRelativePath(value: string): boolean {
  if (value === "/") {
    return true;
  }
  return /^\/[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*$/.test(value);
}
function assertUniqueScreenPaths(
  screens: KeyedDefinition<ScreenSchema>[],
  primaryScreenKeys: string[],
) {
  const screenNamesByPath = new Map<string, string>();
  for (const screen of screens) {
    const screenName = screen.key;
    if (screen.path === undefined) {
      continue;
    }

    const existingScreenName = screenNamesByPath.get(screen.path);
    if (existingScreenName) {
      throw new Error(
        `Screen path "${screen.path}" must be unique. Used by "${existingScreenName}" and "${screenName}".`,
      );
    }
    screenNamesByPath.set(screen.path, screenName);
  }
  const screensByKey = definitionsToRecord(screens);
  const firstPathlessPrimaryScreenName = primaryScreenKeys.find(
    (screenName) => screensByKey[screenName]?.path === undefined,
  );
  const explicitRootScreenName = screenNamesByPath.get("/");
  if (firstPathlessPrimaryScreenName && explicitRootScreenName) {
    throw new Error(
      `Screen path "/" must be unique. It is implied by "${firstPathlessPrimaryScreenName}" and declared by "${explicitRootScreenName}".`,
    );
  }
}
function parseScreenLayout(
  screenName: string,
  value: unknown,
  views: Record<string, ViewSchema>,
  queries: Record<string, CollectionQuerySchema>,
): ScreenLayoutSchema {
  const context = `Screen "${screenName}" layout`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["type", "sections"], ["width"]);

  if (value.type !== "stack") {
    throw new Error(`${context} type must be "stack".`);
  }

  return {
    type: "stack",
    width: parseScreenLayoutWidth(screenName, value.width),
    sections: parseScreenSections(screenName, value.sections, views, queries),
  };
}

function parseScreenLayoutWidth(screenName: string, value: unknown): ScreenLayoutWidthSchema {
  if (value === undefined) {
    return "standard";
  }

  if (value !== "narrow" && value !== "standard" && value !== "wide") {
    throw new Error(`Screen "${screenName}" layout width must be "narrow", "standard", or "wide".`);
  }

  return value;
}

function parseScreenSections(
  screenName: string,
  value: unknown,
  views: Record<string, ViewSchema>,
  queries: Record<string, CollectionQuerySchema>,
): ScreenSectionSchema[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Screen "${screenName}" layout sections must be a non-empty array.`);
  }

  const sectionIds = new Set<string>();

  return value.map((section, index) => {
    const parsedSection = parseScreenSection(screenName, index, section, views, queries);

    if (sectionIds.has(parsedSection.id)) {
      throw new Error(
        `Screen "${screenName}" layout section id "${parsedSection.id}" must be unique.`,
      );
    }

    sectionIds.add(parsedSection.id);
    return parsedSection;
  });
}

function parseScreenSection(
  screenName: string,
  index: number,
  value: unknown,
  views: Record<string, ViewSchema>,
  queries: Record<string, CollectionQuerySchema>,
): ScreenSectionSchema {
  const context = `Screen "${screenName}" layout section ${index}`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  if (value.type !== "collection") {
    throw new Error(`${context} type must be "collection".`);
  }

  return parseCollectionScreenSection(context, value, views, queries);
}

function parseCollectionScreenSection(
  context: string,
  value: Record<string, unknown>,
  views: Record<string, ViewSchema>,
  queries: Record<string, CollectionQuerySchema>,
): CollectionScreenSectionSchema {
  assertExactKeys(context, value, ["id", "type", "view"], ["label", "query"]);

  const id = parseRequiredNonEmptyString(`${context} id`, value.id);
  const viewName = parseRequiredNonEmptyString(`${context} view`, value.view);
  const view = views[viewName];

  if (!view) {
    throw new Error(`${context} references unknown view "${viewName}".`);
  }

  if (view.type !== "collection") {
    throw new Error(`${context} must reference a collection view.`);
  }

  const label = parseOptionalNonEmptyString(`${context} label`, value.label);
  const queryName = parseOptionalNonEmptyString(`${context} query`, value.query);
  if (queryName !== undefined && !queries[queryName]) {
    throw new Error(`${context} references unknown query "${queryName}".`);
  }
  if (queryName !== undefined && !view.queries.some((slot) => slot.query === queryName)) {
    throw new Error(
      `${context} query "${queryName}" must reference one of collection view "${viewName}" query slots.`,
    );
  }

  return {
    id,
    type: "collection",
    view: viewName,
    ...(label === undefined ? {} : { label }),
    ...(queryName === undefined ? {} : { query: queryName }),
  };
}
