import rawCrmSourceSchema from "@dpeek/formless-crm-app/schema.json";
import {
  findSchemaAppDefinition,
  schemaAppDefinitions,
  schemaApps,
  type SchemaAppDefinition,
  type SourceSchemaKey,
} from "../shared/schema-apps.ts";
import { parseAppSchema, type AppSchema } from "@dpeek/formless-schema";

export type WorkerSchemaAppDefinition = Omit<SchemaAppDefinition, "key"> & {
  key: string;
  sourceSchema: AppSchema;
};

const crmSourceSchema = parseAppSchema(rawCrmSourceSchema);

export const workerSchemaAppDefinitions = {
  crm: {
    ...schemaAppDefinitions.crm,
    sourceSchema: crmSourceSchema,
  },
} as const satisfies Record<SourceSchemaKey, WorkerSchemaAppDefinition>;

export const workerSchemaApps = schemaApps.map(
  (app) => workerSchemaAppDefinitions[app.key],
) satisfies WorkerSchemaAppDefinition[];

export function getWorkerSchemaAppDefinition(key: SourceSchemaKey): WorkerSchemaAppDefinition {
  return workerSchemaAppDefinitions[key];
}

export function findWorkerSchemaAppDefinition(key: string): WorkerSchemaAppDefinition | undefined {
  const app = findSchemaAppDefinition(key);

  return app ? getWorkerSchemaAppDefinition(app.key) : undefined;
}
