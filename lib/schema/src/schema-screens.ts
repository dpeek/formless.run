import { parseAccessRequirement, trustedAccessActors } from "./schema-authorization.ts";
import {
  assertExactKeys,
  definitionsToRecord,
  isRecord,
  parseKeyedDefinitionArray,
  parseOptionalNonEmptyString,
  parseRequiredNonEmptyString,
} from "./schema-parse-helpers.ts";
import type {
  AppAuthorizationSchema,
  AppNavigationGroupSchema,
  AppNavigationSchema,
  CollectionScreenSectionSchema,
  ScreenAccessRequirement,
  ScreenLayoutSchema,
  ScreenLayoutWidthSchema,
  ScreenSchema,
  ScreenSectionSchema,
  ViewSchema,
  KeyedDefinition,
} from "./types.ts";
export function parseScreens(
  value: unknown,
  views: Record<string, ViewSchema>,
  authorization: AppAuthorizationSchema | undefined,
): KeyedDefinition<ScreenSchema>[] {
  if (value === undefined) {
    throw new Error('Schema must include "screens".');
  }
  const screens = parseKeyedDefinitionArray("Schema screens", value, (screenName, screen) =>
    parseScreen(screenName, screen, views, authorization),
  );
  if (screens.length === 0) {
    throw new Error("Schema screens must not be empty.");
  }
  return screens;
}
export function parseAppNavigation(
  value: unknown,
  screens: KeyedDefinition<ScreenSchema>[],
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
    const groups = parseAppNavigationGroups(value.groups, screens);
    assertUniqueScreenPaths(
      screens,
      groups.flatMap((group) => group.screens),
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
  const primaryScreens = value.primaryScreens.map((screenKey, index) => {
    const key = parseRequiredNonEmptyString(
      `Schema navigation primaryScreens[${index}]`,
      screenKey,
    );
    if (!screensByKey[key]) {
      throw new Error(`Schema navigation primaryScreens references unknown screen "${key}".`);
    }
    return key;
  });
  if (new Set(primaryScreens).size !== primaryScreens.length) {
    throw new Error("Schema navigation primaryScreens must not contain duplicates.");
  }
  assertUniqueScreenPaths(screens, primaryScreens);
  return { primaryScreens };
}

function parseAppNavigationGroups(
  value: unknown,
  screens: KeyedDefinition<ScreenSchema>[],
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
    const groupScreens = group.screens.map((screenKey, index) => {
      const key = parseRequiredNonEmptyString(`${context} screens[${index}]`, screenKey);
      if (!screensByKey[key]) {
        throw new Error(`${context} references unknown screen "${key}".`);
      }
      if (referencedScreenKeys.has(key)) {
        throw new Error(
          `Schema navigation groups must not reference screen "${key}" more than once.`,
        );
      }
      referencedScreenKeys.add(key);
      return key;
    });
    return { label, screens: groupScreens };
  });
}
function parseScreen(
  screenName: string,
  value: unknown,
  views: Record<string, ViewSchema>,
  authorization: AppAuthorizationSchema | undefined,
): ScreenSchema {
  if (screenName.trim() === "") {
    throw new Error("Screen names must be non-empty.");
  }

  if (!isRecord(value)) {
    throw new Error(`Screen "${screenName}" must be an object.`);
  }

  assertExactKeys(
    `Screen "${screenName}"`,
    value,
    ["key", "type", "label", "layout"],
    ["access", "path"],
  );
  if (value.type !== "workspace") {
    throw new Error(`Screen "${screenName}" type must be "workspace".`);
  }

  const label = parseRequiredNonEmptyString(`Screen "${screenName}" label`, value.label);
  const path = parseScreenPath(screenName, value.path);
  const access = parseScreenAccess(screenName, value.access, authorization);
  const layout = parseScreenLayout(screenName, value.layout, views);
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

  const context = `Screen "${screenName}" access`;
  const access = parseAccessRequirement(value, { authorization }, context);
  const alternatives = "anyOf" in access ? access.anyOf : [access];
  for (const alternative of alternatives) {
    if (
      "actor" in alternative &&
      trustedAccessActors.some((actor) => actor === alternative.actor)
    ) {
      throw new Error(
        `${context} actor "${alternative.actor}" is not available to browser presentation.`,
      );
    }
  }

  return access as ScreenAccessRequirement;
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

function isStaticAppRelativePath(value: string): boolean {
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
    sections: parseScreenSections(screenName, value.sections, views),
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
): ScreenSectionSchema[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Screen "${screenName}" layout sections must be a non-empty array.`);
  }

  const sectionIds = new Set<string>();

  return value.map((section, index) => {
    const parsedSection = parseScreenSection(screenName, index, section, views);

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
): ScreenSectionSchema {
  const context = `Screen "${screenName}" layout section ${index}`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  if (value.type !== "collection") {
    throw new Error(`${context} type must be "collection".`);
  }

  return parseCollectionScreenSection(context, value, views);
}

function parseCollectionScreenSection(
  context: string,
  value: Record<string, unknown>,
  views: Record<string, ViewSchema>,
): CollectionScreenSectionSchema {
  assertExactKeys(context, value, ["id", "type", "view"], ["label"]);

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

  return {
    id,
    type: "collection",
    view: viewName,
    ...(label === undefined ? {} : { label }),
  };
}
