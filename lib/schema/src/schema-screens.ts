import { parseBrowserAccessRequirement } from "./schema-authorization.ts";
import { createViewContextDefaultEntries } from "./create-defaults.ts";
import { collectQueryContextNames } from "./query.ts";
import { isFieldItemViewSchema } from "./schema-views.ts";
import { parseRecordLinks } from "./schema-record-links.ts";
import {
  formatEntityOperationKey,
  isEntityOperationVisibleToBrowser,
  parseEntityOperationKey,
} from "./schema-operations.ts";
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
  EntitySchema,
  ItemViewSchema,
  RelationshipSchema,
  RuntimeScreenSchema,
  ScreenAccessRequirement,
  ScreenLayoutSchema,
  ScreenLayoutSurfaceSchema,
  ScreenLayoutWidthSchema,
  ScreenSchema,
  ScreenSectionSchema,
  SemanticIconId,
  SelectedRecordDetailOperationBindingSchema,
  SelectedRecordDetailRelationshipCreateBindingSchema,
  SelectedRecordDetailRelationshipHierarchySectionSchema,
  SelectedRecordDetailRelationshipResultSchema,
  SelectedRecordDetailRelationshipSectionSchema,
  SelectedRecordDetailSchema,
  SelectedRecordDetailSectionSchema,
  SelectedRecordRelationshipHierarchyCreateBindingSchema,
  SelectedRecordRelationshipHierarchyHeaderActionBindingSchema,
  SelectedRecordRelationshipHierarchyHeaderActionContentSchema,
  SelectedRecordRelationshipHierarchyOperationBindingSchema,
  SelectedRecordRelationshipHierarchyRecordOperationBindingSchema,
  SelectedRecordRelationshipHierarchyRelationshipSchema,
  TableViewSchema,
  ViewSchema,
  WorkspaceScreenSchema,
  KeyedDefinition,
  RecordLinkSchema,
} from "./types.ts";
export function parseScreens(
  value: unknown,
  views: Record<string, ViewSchema>,
  queries: Record<string, CollectionQuerySchema>,
  authorization: AppAuthorizationSchema | undefined,
  entities: Record<string, EntitySchema> = {},
  itemViews: Record<string, ItemViewSchema> = {},
  tableViews: Record<string, TableViewSchema> = {},
  relationships: Record<string, RelationshipSchema> = {},
): KeyedDefinition<ScreenSchema>[] {
  if (value === undefined) {
    throw new Error('Schema must include "screens".');
  }
  const screens = parseKeyedDefinitionArray("Schema screens", value, (screenName, screen) =>
    parseScreen(
      screenName,
      screen,
      views,
      queries,
      authorization,
      entities,
      itemViews,
      tableViews,
      relationships,
    ),
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
  entities: Record<string, EntitySchema>,
  itemViews: Record<string, ItemViewSchema>,
  tableViews: Record<string, TableViewSchema>,
  relationships: Record<string, RelationshipSchema>,
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

  return parseWorkspaceScreen(
    screenName,
    value,
    views,
    queries,
    authorization,
    entities,
    itemViews,
    tableViews,
    relationships,
  );
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
  entities: Record<string, EntitySchema>,
  itemViews: Record<string, ItemViewSchema>,
  tableViews: Record<string, TableViewSchema>,
  relationships: Record<string, RelationshipSchema>,
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
  const layout = parseScreenLayout(
    screenName,
    value.layout,
    views,
    queries,
    entities,
    itemViews,
    tableViews,
    relationships,
  );
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
  entities: Record<string, EntitySchema>,
  itemViews: Record<string, ItemViewSchema>,
  tableViews: Record<string, TableViewSchema>,
  relationships: Record<string, RelationshipSchema>,
): ScreenLayoutSchema {
  const context = `Screen "${screenName}" layout`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["type", "sections"], ["surface", "width"]);

  if (value.type !== "stack") {
    throw new Error(`${context} type must be "stack".`);
  }

  const surface = parseScreenLayoutSurface(screenName, value.surface);
  const sections = parseScreenSections(
    screenName,
    value.sections,
    views,
    queries,
    entities,
    itemViews,
    tableViews,
    relationships,
  );
  if (surface === "full") {
    if (value.width !== undefined) {
      throw new Error(`Screen "${screenName}" layout width is not supported for a full surface.`);
    }
    return { type: "stack", surface, sections };
  }

  return {
    type: "stack",
    surface,
    width: parseScreenLayoutWidth(screenName, value.width),
    sections,
  };
}

function parseScreenLayoutSurface(screenName: string, value: unknown): ScreenLayoutSurfaceSchema {
  if (value === undefined) {
    return "constrained";
  }

  if (value !== "constrained" && value !== "full") {
    throw new Error(`Screen "${screenName}" layout surface must be "constrained" or "full".`);
  }

  return value;
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
  entities: Record<string, EntitySchema>,
  itemViews: Record<string, ItemViewSchema>,
  tableViews: Record<string, TableViewSchema>,
  relationships: Record<string, RelationshipSchema>,
): ScreenSectionSchema[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Screen "${screenName}" layout sections must be a non-empty array.`);
  }

  const sectionIds = new Set<string>();

  return value.map((section, index) => {
    const parsedSection = parseScreenSection(
      screenName,
      index,
      section,
      views,
      queries,
      entities,
      itemViews,
      tableViews,
      relationships,
    );

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
  entities: Record<string, EntitySchema>,
  itemViews: Record<string, ItemViewSchema>,
  tableViews: Record<string, TableViewSchema>,
  relationships: Record<string, RelationshipSchema>,
): ScreenSectionSchema {
  const context = `Screen "${screenName}" layout section ${index}`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  if (value.type !== "collection") {
    throw new Error(`${context} type must be "collection".`);
  }

  return parseCollectionScreenSection(
    context,
    value,
    views,
    queries,
    entities,
    itemViews,
    tableViews,
    relationships,
  );
}

function parseCollectionScreenSection(
  context: string,
  value: Record<string, unknown>,
  views: Record<string, ViewSchema>,
  queries: Record<string, CollectionQuerySchema>,
  entities: Record<string, EntitySchema>,
  itemViews: Record<string, ItemViewSchema>,
  tableViews: Record<string, TableViewSchema>,
  relationships: Record<string, RelationshipSchema>,
): CollectionScreenSectionSchema {
  assertExactKeys(context, value, ["id", "type", "view"], ["detail", "label", "query"]);

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
  const detail = parseSelectedRecordDetail(
    `${context} detail`,
    value.detail,
    view,
    entities,
    itemViews,
    tableViews,
    queries,
    relationships,
    views,
  );

  return {
    id,
    type: "collection",
    view: viewName,
    ...(label === undefined ? {} : { label }),
    ...(queryName === undefined ? {} : { query: queryName }),
    ...(detail === undefined ? {} : { detail }),
  };
}

function parseSelectedRecordDetail(
  context: string,
  value: unknown,
  view: Extract<ViewSchema, { type: "collection" }>,
  entities: Record<string, EntitySchema>,
  itemViews: Record<string, ItemViewSchema>,
  tableViews: Record<string, TableViewSchema>,
  queries: Record<string, CollectionQuerySchema>,
  relationships: Record<string, RelationshipSchema>,
  views: Record<string, ViewSchema>,
): SelectedRecordDetailSchema | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["type", "context", "sections"]);
  if (value.type !== "selectedRecord") {
    throw new Error(`${context} type must be "selectedRecord".`);
  }
  if (view.result.type !== "list") {
    throw new Error(`${context} requires its collection view to use a list result.`);
  }

  const contextName = parseRequiredNonEmptyString(`${context} context`, value.context);
  if (!Array.isArray(value.sections) || value.sections.length === 0) {
    throw new Error(`${context} sections must be a non-empty array.`);
  }

  const sectionIds = new Set<string>();
  const sections = value.sections.map((section, index) => {
    const parsedSection = parseSelectedRecordDetailSection(
      `${context} section ${index}`,
      section,
      view.entity,
      entities,
      itemViews,
      tableViews,
      queries,
      relationships,
      views,
      contextName,
    );
    if (sectionIds.has(parsedSection.id)) {
      throw new Error(`${context} section id "${parsedSection.id}" must be unique.`);
    }
    sectionIds.add(parsedSection.id);
    return parsedSection;
  });

  return { type: "selectedRecord", context: contextName, sections };
}

function parseSelectedRecordDetailSection(
  context: string,
  value: unknown,
  sourceEntityName: string,
  entities: Record<string, EntitySchema>,
  itemViews: Record<string, ItemViewSchema>,
  tableViews: Record<string, TableViewSchema>,
  queries: Record<string, CollectionQuerySchema>,
  relationships: Record<string, RelationshipSchema>,
  views: Record<string, ViewSchema>,
  selectedRecordContextName: string,
): SelectedRecordDetailSectionSchema {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  if (value.type === "record") {
    assertExactKeys(context, value, ["id", "type", "itemView"], ["label"]);
    const id = parseRequiredNonEmptyString(`${context} id`, value.id);
    const label = parseOptionalNonEmptyString(`${context} label`, value.label);
    const itemViewName = parseRequiredNonEmptyString(`${context} itemView`, value.itemView);
    const itemView = itemViews[itemViewName];
    if (!itemView) {
      throw new Error(`${context} references unknown item view "${itemViewName}".`);
    }
    if (itemView.entity !== sourceEntityName) {
      throw new Error(
        `${context} item view "${itemViewName}" must use entity "${sourceEntityName}".`,
      );
    }
    return {
      id,
      type: "record",
      ...(label === undefined ? {} : { label }),
      itemView: itemViewName,
    };
  }

  if (value.type === "relationship") {
    return parseSelectedRecordRelationshipSection(
      context,
      value,
      sourceEntityName,
      entities,
      tableViews,
      queries,
      relationships,
      views,
      selectedRecordContextName,
    );
  }

  if (value.type === "relationshipHierarchy") {
    return parseSelectedRecordRelationshipHierarchySection(
      context,
      value,
      sourceEntityName,
      entities,
      itemViews,
      relationships,
      views,
    );
  }

  throw new Error(`${context} type must be "record", "relationship", or "relationshipHierarchy".`);
}

function parseSelectedRecordRelationshipHierarchySection(
  context: string,
  value: Record<string, unknown>,
  sourceEntityName: string,
  entities: Record<string, EntitySchema>,
  itemViews: Record<string, ItemViewSchema>,
  relationships: Record<string, RelationshipSchema>,
  views: Record<string, ViewSchema>,
): SelectedRecordDetailRelationshipHierarchySectionSchema {
  assertExactKeys(
    context,
    value,
    ["id", "type", "itemView", "relationships"],
    ["label", "links", "operations"],
  );
  const id = parseRequiredNonEmptyString(`${context} id`, value.id);
  const label = parseOptionalNonEmptyString(`${context} label`, value.label);
  const itemView = parseSelectedRecordRelationshipHierarchyItemView(
    `${context} itemView`,
    value.itemView,
    sourceEntityName,
    itemViews,
  );
  const operations = parseSelectedRecordRelationshipHierarchyOperationBindings(
    `${context} operations`,
    value.operations,
    sourceEntityName,
    entities,
  );
  const links = parseSelectedRecordRelationshipHierarchyLinks(
    `${context} links`,
    value.links,
    sourceEntityName,
    entities,
  );
  const parsedRelationships = parseSelectedRecordRelationshipHierarchyRelationships(
    `${context} relationships`,
    value.relationships,
    sourceEntityName,
    entities,
    itemViews,
    relationships,
    views,
    operations ?? [],
    true,
  );

  return {
    id,
    type: "relationshipHierarchy",
    ...(label === undefined ? {} : { label }),
    itemView,
    ...(links === undefined ? {} : { links }),
    ...(operations === undefined ? {} : { operations }),
    relationships: parsedRelationships!,
  };
}

function parseSelectedRecordRelationshipHierarchyRelationships(
  context: string,
  value: unknown,
  sourceEntityName: string,
  entities: Record<string, EntitySchema>,
  itemViews: Record<string, ItemViewSchema>,
  relationships: Record<string, RelationshipSchema>,
  views: Record<string, ViewSchema>,
  sourceNodeOperations: readonly SelectedRecordRelationshipHierarchyOperationBindingSchema[],
  required: boolean,
): SelectedRecordRelationshipHierarchyRelationshipSchema[] | undefined {
  if (value === undefined && !required) {
    return undefined;
  }
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${context} must be a non-empty array.`);
  }

  const siblingIds = new Set<string>();
  return value.map((relationshipValue, index) => {
    const relationshipContext = `${context} relationship ${index}`;
    if (!isRecord(relationshipValue)) {
      throw new Error(`${relationshipContext} must be an object.`);
    }
    assertExactKeys(
      relationshipContext,
      relationshipValue,
      ["id", "relationship", "itemView"],
      ["headerActions", "label", "links", "operations", "relationships"],
    );
    const id = parseRequiredNonEmptyString(`${relationshipContext} id`, relationshipValue.id);
    if (siblingIds.has(id)) {
      throw new Error(`${context} relationship id "${id}" must be unique.`);
    }
    siblingIds.add(id);

    const label = parseOptionalNonEmptyString(
      `${relationshipContext} label`,
      relationshipValue.label,
    );
    const relationshipName = parseRequiredNonEmptyString(
      `${relationshipContext} relationship`,
      relationshipValue.relationship,
    );
    const relationship = relationships[relationshipName];
    if (!relationship) {
      throw new Error(
        `${relationshipContext} references unknown relationship "${relationshipName}".`,
      );
    }
    if (relationship.kind !== "toMany") {
      throw new Error(
        `${relationshipContext} relationship "${relationshipName}" must be a toMany relationship.`,
      );
    }
    if (relationship.from.entity !== sourceEntityName) {
      throw new Error(
        `${relationshipContext} relationship "${relationshipName}" must start from entity "${sourceEntityName}".`,
      );
    }

    const itemView = parseSelectedRecordRelationshipHierarchyItemView(
      `${relationshipContext} itemView`,
      relationshipValue.itemView,
      relationship.to.entity,
      itemViews,
    );
    const operations = parseSelectedRecordRelationshipHierarchyOperationBindings(
      `${relationshipContext} operations`,
      relationshipValue.operations,
      relationship.to.entity,
      entities,
    );
    const links = parseSelectedRecordRelationshipHierarchyLinks(
      `${relationshipContext} links`,
      relationshipValue.links,
      relationship.to.entity,
      entities,
    );
    const headerActions = parseSelectedRecordRelationshipHierarchyHeaderActions(
      `${relationshipContext} headerActions`,
      relationshipValue.headerActions,
      sourceEntityName,
      relationshipName,
      relationship,
      entities,
      views,
      sourceNodeOperations,
    );
    if (headerActions !== undefined && label === undefined && relationship.label === undefined) {
      throw new Error(
        `${relationshipContext} with headerActions must resolve a label from its declaration or relationship "${relationshipName}".`,
      );
    }
    const childRelationships = parseSelectedRecordRelationshipHierarchyRelationships(
      `${relationshipContext} relationships`,
      relationshipValue.relationships,
      relationship.to.entity,
      entities,
      itemViews,
      relationships,
      views,
      operations ?? [],
      false,
    );

    return {
      id,
      ...(label === undefined ? {} : { label }),
      relationship: relationshipName,
      itemView,
      ...(links === undefined ? {} : { links }),
      ...(headerActions === undefined ? {} : { headerActions }),
      ...(operations === undefined ? {} : { operations }),
      ...(childRelationships === undefined ? {} : { relationships: childRelationships }),
    };
  });
}

function parseSelectedRecordRelationshipHierarchyLinks(
  context: string,
  value: unknown,
  entityName: string,
  entities: Record<string, EntitySchema>,
): KeyedDefinition<RecordLinkSchema>[] | undefined {
  const entity = entities[entityName];
  if (!entity) {
    throw new Error(`${context} references unknown entity "${entityName}".`);
  }
  return parseRecordLinks(context, value, entityName, entity, entities);
}

function parseSelectedRecordRelationshipHierarchyItemView(
  context: string,
  value: unknown,
  entityName: string,
  itemViews: Record<string, ItemViewSchema>,
): string {
  const itemViewName = parseRequiredNonEmptyString(context, value);
  const itemView = itemViews[itemViewName];
  if (!itemView) {
    throw new Error(`${context} references unknown item view "${itemViewName}".`);
  }
  if (!isFieldItemViewSchema(itemView)) {
    throw new Error(`${context} "${itemViewName}" must be a field item view.`);
  }
  if (itemView.entity !== entityName) {
    throw new Error(`${context} "${itemViewName}" must use entity "${entityName}".`);
  }
  return itemViewName;
}

function parseSelectedRecordRelationshipHierarchyOperationBindings(
  context: string,
  value: unknown,
  entityName: string,
  entities: Record<string, EntitySchema>,
): SelectedRecordRelationshipHierarchyOperationBindingSchema[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array.`);
  }

  const operations = value.map((binding, index) => {
    const bindingContext = `${context} binding ${index}`;
    if (!isRecord(binding)) {
      throw new Error(`${bindingContext} must be an object.`);
    }
    assertExactKeys(bindingContext, binding, ["operation"], ["label"]);
    const operationKey = parseEntityOperationKey(`${bindingContext} operation`, binding.operation);
    const operationEntity = entities[operationKey.entityKey];
    const operation = definitionsToRecord(operationEntity?.operations)[operationKey.operationKey];
    if (!operationEntity || !operation) {
      throw new Error(
        `${bindingContext} references unknown operation "${String(binding.operation)}".`,
      );
    }
    if (operationKey.entityKey !== entityName) {
      throw new Error(`${bindingContext} operation must use entity "${entityName}".`);
    }
    if (operation.scope !== "record") {
      throw new Error(`${bindingContext} operation must use record scope.`);
    }
    if (!isEntityOperationVisibleToBrowser(operation)) {
      throw new Error(`${bindingContext} operation must be visible to browser actors.`);
    }
    const label = parseOptionalNonEmptyString(`${bindingContext} label`, binding.label);
    return {
      operation: formatEntityOperationKey(operationKey),
      ...(label === undefined ? {} : { label }),
    };
  });

  return operations.length > 0 ? operations : undefined;
}

function parseSelectedRecordRelationshipHierarchyHeaderActions(
  context: string,
  value: unknown,
  sourceEntityName: string,
  relationshipName: string,
  relationship: Extract<RelationshipSchema, { kind: "toMany" }>,
  entities: Record<string, EntitySchema>,
  views: Record<string, ViewSchema>,
  sourceNodeOperations: readonly SelectedRecordRelationshipHierarchyOperationBindingSchema[],
): SelectedRecordRelationshipHierarchyHeaderActionBindingSchema[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array.`);
  }

  const sourceNodeOperationKeys = new Set(sourceNodeOperations.map(({ operation }) => operation));
  const actionKeys = new Set<string>();
  const actions = value.map(
    (binding, index): SelectedRecordRelationshipHierarchyHeaderActionBindingSchema => {
      const bindingContext = `${context} binding ${index}`;
      if (!isRecord(binding)) {
        throw new Error(`${bindingContext} must be an object.`);
      }

      let action: SelectedRecordRelationshipHierarchyHeaderActionBindingSchema;
      if (binding.kind === "create") {
        action = parseSelectedRecordRelationshipHierarchyCreateBinding(
          bindingContext,
          binding,
          relationshipName,
          relationship,
          entities,
          views,
        );
      } else if (binding.kind === "recordOperation") {
        action = parseSelectedRecordRelationshipHierarchyHeaderRecordOperationBinding(
          bindingContext,
          binding,
          sourceEntityName,
          entities,
        );
        if (sourceNodeOperationKeys.has(action.operation)) {
          throw new Error(
            `${bindingContext} operation "${action.operation}" cannot also be bound to the source record header.`,
          );
        }
      } else {
        throw new Error(`${bindingContext} has unsupported kind "${String(binding.kind)}".`);
      }

      const actionKey = `${action.kind}:${action.operation}`;
      if (actionKeys.has(actionKey)) {
        throw new Error(`${bindingContext} duplicates header action "${action.operation}".`);
      }
      actionKeys.add(actionKey);
      return action;
    },
  );

  return actions.length > 0 ? actions : undefined;
}

function parseSelectedRecordRelationshipHierarchyCreateBinding(
  context: string,
  value: Record<string, unknown>,
  relationshipName: string,
  relationship: Extract<RelationshipSchema, { kind: "toMany" }>,
  entities: Record<string, EntitySchema>,
  views: Record<string, ViewSchema>,
): SelectedRecordRelationshipHierarchyCreateBindingSchema {
  assertExactKeys(context, value, ["kind", "operation", "createView"], ["content", "label"]);

  const operationKey = parseEntityOperationKey(`${context} operation`, value.operation);
  const operationEntity = entities[operationKey.entityKey];
  const operation = definitionsToRecord(operationEntity?.operations)[operationKey.operationKey];
  if (!operationEntity || !operation) {
    throw new Error(`${context} references unknown operation "${String(value.operation)}".`);
  }
  if (operationKey.entityKey !== relationship.to.entity) {
    throw new Error(
      `${context} operation must use relationship target entity "${relationship.to.entity}".`,
    );
  }
  if (operation.kind !== "create" || operation.scope !== "collection") {
    throw new Error(`${context} operation must be a collection-scoped create operation.`);
  }
  if (!isEntityOperationVisibleToBrowser(operation)) {
    throw new Error(`${context} operation must be visible to browser actors.`);
  }

  const createViewName = parseRequiredNonEmptyString(`${context} createView`, value.createView);
  const createView = views[createViewName];
  if (!createView) {
    throw new Error(`${context} references unknown create view "${createViewName}".`);
  }
  if (createView.type !== "create") {
    throw new Error(`${context} view "${createViewName}" must be a create view.`);
  }
  if (createView.entity !== relationship.to.entity) {
    throw new Error(
      `${context} create view "${createViewName}" must use relationship target entity "${relationship.to.entity}".`,
    );
  }

  const contextDefaults = createViewContextDefaultEntries(createView);
  const attachmentDefault = contextDefaults.find(
    ([fieldName]) => fieldName === relationship.to.field,
  );
  if (attachmentDefault === undefined) {
    throw new Error(
      `${context} create view "${createViewName}" must default relationship field "${relationship.to.entity}.${relationship.to.field}" from one context.`,
    );
  }
  if (contextDefaults.length !== 1) {
    throw new Error(
      `${context} create view "${createViewName}" must use only relationship "${relationshipName}" field "${relationship.to.entity}.${relationship.to.field}" as a context default.`,
    );
  }
  const attachmentField = definitionsToRecord(operationEntity.fields)[relationship.to.field];
  if (attachmentField?.type !== "reference" || attachmentField.to !== relationship.from.entity) {
    throw new Error(
      `${context} create view "${createViewName}" relationship field "${relationship.to.entity}.${relationship.to.field}" must reference source entity "${relationship.from.entity}".`,
    );
  }

  const label = parseOptionalNonEmptyString(`${context} label`, value.label);
  const content = parseSelectedRecordRelationshipHierarchyHeaderActionContent(
    `${context} content`,
    value.content,
  );
  return {
    kind: "create",
    operation: formatEntityOperationKey(operationKey),
    createView: createViewName,
    ...(label === undefined ? {} : { label }),
    ...(content === undefined ? {} : { content }),
  };
}

function parseSelectedRecordRelationshipHierarchyHeaderRecordOperationBinding(
  context: string,
  value: Record<string, unknown>,
  sourceEntityName: string,
  entities: Record<string, EntitySchema>,
): SelectedRecordRelationshipHierarchyRecordOperationBindingSchema {
  assertExactKeys(context, value, ["kind", "operation"], ["content", "label"]);
  const operationKey = parseEntityOperationKey(`${context} operation`, value.operation);
  const operationEntity = entities[operationKey.entityKey];
  const operation = definitionsToRecord(operationEntity?.operations)[operationKey.operationKey];
  if (!operationEntity || !operation) {
    throw new Error(`${context} references unknown operation "${String(value.operation)}".`);
  }
  if (operationKey.entityKey !== sourceEntityName) {
    throw new Error(`${context} operation must use source entity "${sourceEntityName}".`);
  }
  if (operation.scope !== "record") {
    throw new Error(`${context} operation must use record scope.`);
  }
  if (!isEntityOperationVisibleToBrowser(operation)) {
    throw new Error(`${context} operation must be visible to browser actors.`);
  }

  const label = parseOptionalNonEmptyString(`${context} label`, value.label);
  const content = parseSelectedRecordRelationshipHierarchyHeaderActionContent(
    `${context} content`,
    value.content,
  );
  return {
    kind: "recordOperation",
    operation: formatEntityOperationKey(operationKey),
    ...(label === undefined ? {} : { label }),
    ...(content === undefined ? {} : { content }),
  };
}

function parseSelectedRecordRelationshipHierarchyHeaderActionContent(
  context: string,
  value: unknown,
): SelectedRecordRelationshipHierarchyHeaderActionContentSchema | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }
  if (value.kind === "label") {
    assertExactKeys(context, value, ["kind"], []);
    return { kind: "label" };
  }
  if (value.kind !== "iconAndLabel" && value.kind !== "iconOnly") {
    throw new Error(`${context} has unsupported kind "${String(value.kind)}".`);
  }
  assertExactKeys(context, value, ["kind", "icon"], []);
  const icon = parseRequiredNonEmptyString(`${context} icon`, value.icon);
  if (!semanticIconIds.includes(icon as SemanticIconId)) {
    throw new Error(`${context} icon must be a supported semantic icon id.`);
  }
  return { kind: value.kind, icon: icon as SemanticIconId };
}

function parseSelectedRecordRelationshipSection(
  context: string,
  value: Record<string, unknown>,
  sourceEntityName: string,
  entities: Record<string, EntitySchema>,
  tableViews: Record<string, TableViewSchema>,
  queries: Record<string, CollectionQuerySchema>,
  relationships: Record<string, RelationshipSchema>,
  views: Record<string, ViewSchema>,
  selectedRecordContextName: string,
): SelectedRecordDetailRelationshipSectionSchema {
  assertExactKeys(
    context,
    value,
    ["id", "type", "relationship", "query", "result"],
    ["createAction", "label", "operations"],
  );
  const id = parseRequiredNonEmptyString(`${context} id`, value.id);
  const label = parseOptionalNonEmptyString(`${context} label`, value.label);
  const relationshipName = parseRequiredNonEmptyString(
    `${context} relationship`,
    value.relationship,
  );
  const relationship = relationships[relationshipName];
  if (!relationship) {
    throw new Error(`${context} references unknown relationship "${relationshipName}".`);
  }
  if (relationship.kind !== "toMany") {
    throw new Error(`${context} relationship "${relationshipName}" must be a toMany relationship.`);
  }
  if (relationship.from.entity !== sourceEntityName) {
    throw new Error(
      `${context} relationship "${relationshipName}" must start from entity "${sourceEntityName}".`,
    );
  }

  const queryName = parseRequiredNonEmptyString(`${context} query`, value.query);
  const query = queries[queryName];
  if (!query) {
    throw new Error(`${context} references unknown query "${queryName}".`);
  }
  if (query.entity !== relationship.to.entity) {
    throw new Error(
      `${context} query "${queryName}" must use relationship target entity "${relationship.to.entity}".`,
    );
  }

  const result = parseSelectedRecordRelationshipResult(
    `${context} result`,
    value.result,
    relationship.to.entity,
    tableViews,
  );
  const operations = parseSelectedRecordDetailOperationBindings(
    `${context} operations`,
    value.operations,
    sourceEntityName,
    entities,
  );
  const createAction = parseSelectedRecordRelationshipCreateBinding(
    `${context} createAction`,
    value.createAction,
    relationshipName,
    relationship,
    selectedRecordContextName,
    entities,
    views,
  );

  return {
    id,
    type: "relationship",
    ...(label === undefined ? {} : { label }),
    relationship: relationshipName,
    query: queryName,
    result,
    ...(createAction === undefined ? {} : { createAction }),
    ...(operations === undefined ? {} : { operations }),
  };
}

function parseSelectedRecordRelationshipCreateBinding(
  context: string,
  value: unknown,
  relationshipName: string,
  relationship: Extract<RelationshipSchema, { kind: "toMany" }>,
  selectedRecordContextName: string,
  entities: Record<string, EntitySchema>,
  views: Record<string, ViewSchema>,
): SelectedRecordDetailRelationshipCreateBindingSchema | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }
  assertExactKeys(context, value, ["operation", "createView", "placement"], ["label"]);

  const operationKey = parseEntityOperationKey(`${context} operation`, value.operation);
  const operationEntity = entities[operationKey.entityKey];
  const operation = definitionsToRecord(operationEntity?.operations)[operationKey.operationKey];
  if (!operationEntity || !operation) {
    throw new Error(`${context} references unknown operation "${String(value.operation)}".`);
  }
  if (operationKey.entityKey !== relationship.to.entity) {
    throw new Error(
      `${context} operation must use relationship target entity "${relationship.to.entity}".`,
    );
  }
  if (operation.kind !== "create" || operation.scope !== "collection") {
    throw new Error(`${context} operation must be a collection-scoped create operation.`);
  }
  if (!isEntityOperationVisibleToBrowser(operation)) {
    throw new Error(`${context} operation must be visible to browser actors.`);
  }

  const createViewName = parseRequiredNonEmptyString(`${context} createView`, value.createView);
  const createView = views[createViewName];
  if (!createView) {
    throw new Error(`${context} references unknown create view "${createViewName}".`);
  }
  if (createView.type !== "create") {
    throw new Error(`${context} view "${createViewName}" must be a create view.`);
  }
  if (createView.entity !== relationship.to.entity) {
    throw new Error(
      `${context} create view "${createViewName}" must use relationship target entity "${relationship.to.entity}".`,
    );
  }

  const contextDefaults = createViewContextDefaultEntries(createView);
  const attachmentDefault = contextDefaults.find(
    ([fieldName]) => fieldName === relationship.to.field,
  );
  if (attachmentDefault === undefined || attachmentDefault[1].name !== selectedRecordContextName) {
    throw new Error(
      `${context} create view "${createViewName}" must default relationship field "${relationship.to.entity}.${relationship.to.field}" from selected-record context "${selectedRecordContextName}".`,
    );
  }
  for (const [fieldName, defaultValue] of contextDefaults) {
    if (defaultValue.name !== selectedRecordContextName) {
      throw new Error(
        `${context} create view "${createViewName}" requires unavailable context "${defaultValue.name}".`,
      );
    }
    const field = definitionsToRecord(operationEntity.fields)[fieldName];
    if (field?.type !== "reference" || field.to !== relationship.from.entity) {
      throw new Error(
        `${context} create view "${createViewName}" default field "${fieldName}" must reference source entity "${relationship.from.entity}".`,
      );
    }
    if (fieldName !== relationship.to.field) {
      throw new Error(
        `${context} create view "${createViewName}" context default must use relationship "${relationshipName}" field "${relationship.to.entity}.${relationship.to.field}".`,
      );
    }
  }

  if (value.placement !== "heading") {
    throw new Error(`${context} placement must be "heading".`);
  }
  const label = parseOptionalNonEmptyString(`${context} label`, value.label);
  return {
    operation: formatEntityOperationKey(operationKey),
    createView: createViewName,
    placement: "heading",
    ...(label === undefined ? {} : { label }),
  };
}

function parseSelectedRecordRelationshipResult(
  context: string,
  value: unknown,
  targetEntityName: string,
  tableViews: Record<string, TableViewSchema>,
): SelectedRecordDetailRelationshipResultSchema {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }
  assertExactKeys(context, value, ["type", "tableView"]);
  if (value.type !== "table") {
    throw new Error(`${context} type must be "table".`);
  }
  const tableViewName = parseRequiredNonEmptyString(`${context} tableView`, value.tableView);
  const tableView = tableViews[tableViewName];
  if (!tableView) {
    throw new Error(`${context} references unknown table view "${tableViewName}".`);
  }
  if (tableView.entity !== targetEntityName) {
    throw new Error(
      `${context} table view "${tableViewName}" must use entity "${targetEntityName}".`,
    );
  }
  return { type: "table", tableView: tableViewName };
}

function parseSelectedRecordDetailOperationBindings(
  context: string,
  value: unknown,
  sourceEntityName: string,
  entities: Record<string, EntitySchema>,
): SelectedRecordDetailOperationBindingSchema[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array.`);
  }

  const operations = value.map((binding, index) => {
    const bindingContext = `${context} binding ${index}`;
    if (!isRecord(binding)) {
      throw new Error(`${bindingContext} must be an object.`);
    }
    assertExactKeys(bindingContext, binding, ["operation", "placement"], ["label"]);
    const operationKey = parseEntityOperationKey(`${bindingContext} operation`, binding.operation);
    const operationEntity = entities[operationKey.entityKey];
    const operation = definitionsToRecord(operationEntity?.operations)[operationKey.operationKey];
    if (!operationEntity || !operation) {
      throw new Error(
        `${bindingContext} references unknown operation "${String(binding.operation)}".`,
      );
    }
    if (operationKey.entityKey !== sourceEntityName) {
      throw new Error(`${bindingContext} operation must use source entity "${sourceEntityName}".`);
    }
    if (operation.scope !== "record") {
      throw new Error(`${bindingContext} operation must use record scope.`);
    }
    if (!isEntityOperationVisibleToBrowser(operation)) {
      throw new Error(`${bindingContext} operation must be visible to browser actors.`);
    }
    if (binding.placement !== "heading") {
      throw new Error(`${bindingContext} placement must be "heading".`);
    }
    const label = parseOptionalNonEmptyString(`${bindingContext} label`, binding.label);
    return {
      operation: formatEntityOperationKey(operationKey),
      placement: "heading" as const,
      ...(label === undefined ? {} : { label }),
    };
  });

  return operations.length > 0 ? operations : undefined;
}
