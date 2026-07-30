import { describe, expect, it } from "vite-plus/test";
import {
  installedAppStorageIdentity,
  parseAuthorityApiRoute,
  parseProgramApiRoute,
  programStorageIdentity,
  schemaKeyStorageIdentity,
} from "./app-storage-identity.ts";

describe("app storage identity", () => {
  it("maps source schema keys to package-level storage names and API paths", () => {
    expect(schemaKeyStorageIdentity("tasks")).toMatchObject({
      apiRoutePrefix: "/api/tasks",
      authorityName: "tasks",
      broadcastChannelName: "formless:tasks",
      browserDatabaseName: "formless:tasks",
      kind: "schemaKey",
      packageAppKey: "tasks",
      sourceSchemaKey: "tasks",
    });
    expect(schemaKeyStorageIdentity("site")).toMatchObject({
      apiRoutePrefix: "/api/site",
      authorityName: "site",
      broadcastChannelName: "formless:site",
      browserDatabaseName: "formless:site",
      kind: "schemaKey",
      packageAppKey: "site",
      sourceSchemaKey: "site",
    });
  });

  it("maps an installed Site to install-scoped storage names and API paths", () => {
    expect(
      installedAppStorageIdentity({
        installId: "personal",
        packageAppKey: "site",
      }),
    ).toEqual({
      apiRoutePrefix: "/api/app-installs/site/personal",
      authorityName: "app:personal",
      broadcastChannelName: "formless:app:personal",
      browserDatabaseName: "formless:app:personal",
      installId: "personal",
      kind: "appInstall",
      packageAppKey: "site",
      sourceSchemaKey: "site",
    });
  });

  it("maps installed non-Site apps without Site media facts", () => {
    expect(
      installedAppStorageIdentity({
        installId: "tasks",
        packageAppKey: "tasks",
      }),
    ).toEqual({
      apiRoutePrefix: "/api/app-installs/tasks/tasks",
      authorityName: "app:tasks",
      broadcastChannelName: "formless:app:tasks",
      browserDatabaseName: "formless:app:tasks",
      installId: "tasks",
      kind: "appInstall",
      packageAppKey: "tasks",
      sourceSchemaKey: "tasks",
    });
    expect(
      installedAppStorageIdentity({
        installId: "crm",
        packageAppKey: "crm",
      }),
    ).toEqual({
      apiRoutePrefix: "/api/app-installs/crm/crm",
      authorityName: "app:crm",
      broadcastChannelName: "formless:app:crm",
      browserDatabaseName: "formless:app:crm",
      installId: "crm",
      kind: "appInstall",
      packageAppKey: "crm",
      sourceSchemaKey: "crm",
    });
  });

  it("accepts default Site install identity and rejects invalid identities", () => {
    expect(installedAppStorageIdentity({ installId: "site", packageAppKey: "site" })).toMatchObject(
      {
        apiRoutePrefix: "/api/app-installs/site/site",
        authorityName: "app:site",
        browserDatabaseName: "formless:app:site",
        installId: "site",
        kind: "appInstall",
      },
    );
    expect(installedAppStorageIdentity({ installId: "Docs", packageAppKey: "site" })).toBe(
      undefined,
    );
    expect(installedAppStorageIdentity({ installId: "rates", packageAppKey: "missing" })).toBe(
      undefined,
    );
  });

  it("keeps installed app identity separate from source schema-key identity", () => {
    const schemaSite = schemaKeyStorageIdentity("site");
    const personal = installedAppStorageIdentity({
      installId: "personal",
      packageAppKey: "site",
    });
    const docs = installedAppStorageIdentity({ installId: "docs", packageAppKey: "site" });

    expect(personal).toBeDefined();
    expect(docs).toBeDefined();

    if (!personal || !docs) {
      throw new Error("Expected installed Site identities.");
    }

    expect(personal.authorityName).not.toBe(schemaSite.authorityName);
    expect(personal.authorityName).not.toBe(docs.authorityName);
    expect(personal.browserDatabaseName).not.toBe(docs.browserDatabaseName);
    expect(personal.broadcastChannelName).not.toBe(docs.broadcastChannelName);
  });

  it("maps the root-owned Program storage identity", () => {
    expect(programStorageIdentity()).toEqual({
      apiRoutePrefix: "/api/formless/program",
      authorityName: "instance:control-plane",
      broadcastChannelName: "formless:instance:control-plane",
      browserDatabaseName: "formless:instance:control-plane",
      kind: "program",
      schemaKey: "formless-program",
    });
  });

  it("parses source schema-key and installed app API route identities", () => {
    expect(parseAuthorityApiRoute("/api/site/bootstrap")).toMatchObject({
      identity: {
        authorityName: "site",
        kind: "schemaKey",
        packageAppKey: "site",
      },
      path: "/bootstrap",
    });
    expect(
      parseAuthorityApiRoute("/api/app-installs/site/personal/tree/blog%2Fpost"),
    ).toMatchObject({
      identity: {
        authorityName: "app:personal",
        installId: "personal",
        kind: "appInstall",
        packageAppKey: "site",
      },
      path: "/tree/blog%2Fpost",
    });
    expect(parseAuthorityApiRoute("/api/app-installs/site/site/bootstrap")).toMatchObject({
      identity: {
        authorityName: "app:site",
        installId: "site",
        kind: "appInstall",
        packageAppKey: "site",
      },
      path: "/bootstrap",
    });
    expect(parseAuthorityApiRoute("/api/app-installs/tasks/tasks/bootstrap")).toMatchObject({
      identity: {
        authorityName: "app:tasks",
        installId: "tasks",
        kind: "appInstall",
        packageAppKey: "tasks",
      },
      path: "/bootstrap",
    });
  });

  it("parses the Program API route as Authority storage", () => {
    expect(parseProgramApiRoute("/api/formless/program/bootstrap")).toEqual({
      identity: programStorageIdentity(),
      path: "/bootstrap",
    });
    expect(
      parseProgramApiRoute("/api/formless/program/operations/app-install/createAppInstall"),
    ).toEqual({
      identity: programStorageIdentity(),
      path: "/operations/app-install/createAppInstall",
    });
    expect(parseAuthorityApiRoute("/api/formless/program/bootstrap")).toEqual({
      identity: programStorageIdentity(),
      path: "/bootstrap",
    });
    expect(parseAuthorityApiRoute("/api/formless/identity/bootstrap")).toBeUndefined();
    expect(parseAuthorityApiRoute("/api/formless/control-plane/bootstrap")).toBeUndefined();
  });

  it("leaves unknown or incomplete API routes unclaimed", () => {
    for (const pathname of [
      "/api",
      "/api/site",
      "/api/missing/bootstrap",
      "/api/app-installs/site/personal",
      "/api/app-installs/missing/rates/bootstrap",
    ]) {
      expect(parseAuthorityApiRoute(pathname)).toBeUndefined();
    }
  });
});
