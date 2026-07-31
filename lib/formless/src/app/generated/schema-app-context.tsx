import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  programClientTarget,
  type ClientAppSchemaKey,
  type ClientAppTarget,
} from "../../client/app-target.ts";
import { FORMLESS_PROGRAM_SCHEMA_KEY } from "../../program/target.ts";
import type { AppPackageResolver } from "@dpeek/formless-installed-apps";

type SchemaAppContextValue = {
  activePackageResolver?: AppPackageResolver | undefined;
  schemaKey: ClientAppSchemaKey;
  target: ClientAppTarget;
};

const SchemaAppContext = createContext<SchemaAppContextValue>({
  schemaKey: FORMLESS_PROGRAM_SCHEMA_KEY,
  target: programClientTarget(),
});

export function SchemaAppProvider({
  activePackageResolver,
  children,
  schemaKey,
  target,
}: {
  activePackageResolver?: AppPackageResolver | undefined;
  children: ReactNode;
  schemaKey: ClientAppSchemaKey;
  target: ClientAppTarget;
}) {
  return (
    <SchemaAppContext.Provider value={{ activePackageResolver, schemaKey, target }}>
      {children}
    </SchemaAppContext.Provider>
  );
}

export function useSchemaKey() {
  return useContext(SchemaAppContext).schemaKey;
}

export function useSchemaAppTarget() {
  return useContext(SchemaAppContext).target;
}

export function useSchemaAppWriteOptions() {
  const { activePackageResolver } = useContext(SchemaAppContext);

  return useMemo(
    () => (activePackageResolver ? { activePackageResolver } : {}),
    [activePackageResolver],
  );
}
