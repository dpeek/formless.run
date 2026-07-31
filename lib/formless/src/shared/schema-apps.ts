export type SchemaKey = "tasks" | "site" | "crm";

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

export function getSchemaAppDefinition(key: SchemaKey): SchemaAppDefinition {
  return schemaAppDefinitions[key];
}

export function findSchemaAppDefinition(key: string): SchemaAppDefinition | undefined {
  return schemaAppDefinitions[key as SchemaKey];
}
