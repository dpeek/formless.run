export type SchemaKey = "tasks" | "site" | "crm";

export const defaultSchemaKey = "tasks" satisfies SchemaKey;

export type SchemaAppDefinition = {
  key: SchemaKey;
  label: string;
  route: `/${string}`;
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
  schemaAppDefinitions.tasks,
  schemaAppDefinitions.site,
  schemaAppDefinitions.crm,
] as const satisfies readonly SchemaAppDefinition[];

export function isSchemaKey(value: string): value is SchemaKey {
  return Object.prototype.hasOwnProperty.call(schemaAppDefinitions, value);
}

export function getSchemaAppDefinition(key: SchemaKey): SchemaAppDefinition {
  return schemaAppDefinitions[key];
}

export function findSchemaAppDefinition(key: string): SchemaAppDefinition | undefined {
  return isSchemaKey(key) ? getSchemaAppDefinition(key) : undefined;
}

export function findSchemaAppDefinitionByRoute(pathname: string): SchemaAppDefinition | undefined {
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
