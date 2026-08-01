import { createContext, useContext, type ReactNode } from "react";
import {
  programClientTarget,
  type ClientAppSchemaKey,
  type ClientAppTarget,
} from "../../client/app-target.ts";
import { FORMLESS_PROGRAM_SCHEMA_KEY } from "../../program/target.ts";

type SchemaAppContextValue = {
  schemaKey: ClientAppSchemaKey;
  target: ClientAppTarget;
};

const SchemaAppContext = createContext<SchemaAppContextValue>({
  schemaKey: FORMLESS_PROGRAM_SCHEMA_KEY,
  target: programClientTarget(),
});

export function SchemaAppProvider({
  children,
  schemaKey,
  target,
}: {
  children: ReactNode;
  schemaKey: ClientAppSchemaKey;
  target: ClientAppTarget;
}) {
  return (
    <SchemaAppContext.Provider value={{ schemaKey, target }}>{children}</SchemaAppContext.Provider>
  );
}

export function useSchemaKey() {
  return useContext(SchemaAppContext).schemaKey;
}

export function useSchemaAppTarget() {
  return useContext(SchemaAppContext).target;
}

export function useSchemaAppWriteOptions() {
  return EMPTY_SCHEMA_APP_WRITE_OPTIONS;
}

const EMPTY_SCHEMA_APP_WRITE_OPTIONS = {};
