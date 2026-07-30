import { describe, expect, it } from "vite-plus/test";
import {
  findSchemaAppDefinition,
  findSchemaAppDefinitionByRoute,
  getSchemaAppDefinition,
  isSchemaKey,
  schemaAppScreenPathFromRoute,
  schemaAppScreenRoute,
  schemaApps,
} from "./schema-apps.ts";

describe("schema app definitions", () => {
  it("declares only runtime-routable source apps in order", () => {
    expect(schemaApps.map((app) => app.key)).toEqual(["site", "crm"]);
    expect(schemaApps.map((app) => app.route)).toEqual(["/site", "/crm"]);
  });

  it("looks up app definitions by schema key and route", () => {
    expect(isSchemaKey("tasks")).toBe(false);
    expect(isSchemaKey("missing")).toBe(false);
    expect(getSchemaAppDefinition("tasks").label).toBe("Tasks");
    expect(findSchemaAppDefinition("tasks")).toBeUndefined();
    expect(findSchemaAppDefinition("rates")).toBeUndefined();
    expect(findSchemaAppDefinition("site")?.label).toBe("Site");
    expect(findSchemaAppDefinition("crm")?.label).toBe("CRM");
    expect(findSchemaAppDefinition("missing")).toBeUndefined();
    expect(findSchemaAppDefinitionByRoute("/site")?.key).toBe("site");
    expect(findSchemaAppDefinitionByRoute("/site/header")?.key).toBe("site");
    expect(findSchemaAppDefinitionByRoute("/crm")?.key).toBe("crm");
    expect(findSchemaAppDefinitionByRoute("/crm/audiences")?.key).toBe("crm");
    expect(findSchemaAppDefinitionByRoute("/crm/schema")?.key).toBe("crm");
    expect(findSchemaAppDefinitionByRoute("/verifi")).toBeUndefined();
    expect(findSchemaAppDefinitionByRoute("/verifi/orders")).toBeUndefined();
    expect(findSchemaAppDefinitionByRoute("/verifi/schema")).toBeUndefined();
    expect(findSchemaAppDefinitionByRoute("/rates/schema")).toBeUndefined();
    expect(findSchemaAppDefinitionByRoute("/site/schema")?.key).toBe("site");
    expect(findSchemaAppDefinitionByRoute("/missing")).toBeUndefined();
  });

  it("maps app-relative screen paths to browser routes", () => {
    const site = getSchemaAppDefinition("site");

    expect(schemaAppScreenRoute(site, "/")).toBe("/site");
    expect(schemaAppScreenRoute(site, "/setup")).toBe("/site/setup");
    expect(schemaAppScreenPathFromRoute(site, "/site")).toBe("/");
    expect(schemaAppScreenPathFromRoute(site, "/site/setup")).toBe("/setup");
    expect(schemaAppScreenPathFromRoute(site, "/site/schema")).toBe("/schema");
    expect(schemaAppScreenPathFromRoute(site, "/tasks")).toBeUndefined();
  });
});
