export type SchemaKey = "tasks" | "site" | "crm";
export type SourceSchemaKey = Exclude<SchemaKey, "tasks" | "site">;

export const defaultSchemaKey = "crm" satisfies SourceSchemaKey;

export type SchemaAppDefinition = {
  key: SchemaKey;
  label: string;
  route: `/${string}`;
};
export type SourceSchemaAppDefinition = SchemaAppDefinition & {
  key: SourceSchemaKey;
};

export const schemaAppDefinitions = {
  tasks: {
    key: "tasks",
    label: "Tasks",
    route: "/tasks",
  },
  site: {
    key: "site",
    label: "Site",
    route: "/site",
  },
  crm: {
    key: "crm",
    label: "CRM",
    route: "/crm",
  },
} as const satisfies Record<SchemaKey, SchemaAppDefinition>;

export const schemaApps = [
  schemaAppDefinitions.crm,
] as const satisfies readonly SourceSchemaAppDefinition[];

export function isSchemaKey(value: string): value is SourceSchemaKey {
  return schemaApps.some((app) => app.key === value);
}

export function getSchemaAppDefinition(key: SchemaKey): SchemaAppDefinition {
  return schemaAppDefinitions[key];
}

export function findSchemaAppDefinition(key: string): SourceSchemaAppDefinition | undefined {
  return schemaApps.find((app) => app.key === key);
}

export function findSchemaAppDefinitionByRoute(
  pathname: string,
): SourceSchemaAppDefinition | undefined {
  return schemaApps.find((app) => schemaAppScreenPathFromRoute(app, pathname));
}

export function schemaAppScreenRoute(app: SchemaAppDefinition, screenPath: string): `/${string}` {
  return screenPath === "/" ? app.route : (`${app.route}${screenPath}` as `/${string}`);
}

export function schemaAppScreenPathFromRoute(
  app: SchemaAppDefinition,
  pathname: string,
): string | undefined {
  if (pathname === app.route) {
    return "/";
  }

  const routePrefix = `${app.route}/`;

  return pathname.startsWith(routePrefix) ? pathname.slice(app.route.length) : undefined;
}
