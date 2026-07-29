import rawCrmSourceSchema from "@dpeek/formless-crm-app/schema.json";
import rawSiteSourceSchema from "@dpeek/formless-site-app/schema.json";
import rawTaskSourceSchema from "@dpeek/formless-tasks-app/schema.json";
import {
  findSchemaAppDefinition,
  schemaAppDefinitions,
  schemaApps,
  type SchemaAppDefinition,
  type SchemaKey,
} from "../shared/schema-apps.ts";
import { parseAppSchema, type AppSchema } from "@dpeek/formless-schema";

export type WorkerSchemaAppDefinition = Omit<SchemaAppDefinition, "key"> & {
  key: string;
  sourceSchema: AppSchema;
};

const taskSourceSchema = parseAppSchema(rawTaskSourceSchema);
const siteSourceSchema = parseAppSchema(rawSiteSourceSchema);
const crmSourceSchema = parseAppSchema(rawCrmSourceSchema);

export const workerSchemaAppDefinitions = {
  tasks: {
    ...schemaAppDefinitions.tasks,
    sourceSchema: taskSourceSchema,
  },
  site: {
    ...schemaAppDefinitions.site,
    sourceSchema: siteSourceSchema,
  },
  crm: {
    ...schemaAppDefinitions.crm,
    sourceSchema: crmSourceSchema,
  },
} as const satisfies Record<SchemaKey, WorkerSchemaAppDefinition>;

export const workerSchemaApps = schemaApps.map(
  (app) => workerSchemaAppDefinitions[app.key],
) satisfies WorkerSchemaAppDefinition[];

export function getWorkerSchemaAppDefinition(key: SchemaKey): WorkerSchemaAppDefinition {
  return workerSchemaAppDefinitions[key];
}

export function findWorkerSchemaAppDefinition(key: string): WorkerSchemaAppDefinition | undefined {
  const app = findSchemaAppDefinition(key);

  return app ? getWorkerSchemaAppDefinition(app.key) : undefined;
}
