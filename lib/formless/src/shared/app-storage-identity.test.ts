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

  it("does not map the Program-native Site to installed storage", () => {
    expect(
      installedAppStorageIdentity({
        installId: "personal",
        packageAppKey: "site",
      }),
    ).toBeUndefined();
  });

  it("maps installed non-Site apps without Site media facts", () => {
    expect(
      installedAppStorageIdentity({
        installId: "tasks",
        packageAppKey: "tasks",
      }),
    ).toBeUndefined();
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

  it("rejects built-in and invalid installed identities", () => {
    expect(
      installedAppStorageIdentity({ installId: "site", packageAppKey: "site" }),
    ).toBeUndefined();
    expect(installedAppStorageIdentity({ installId: "Docs", packageAppKey: "site" })).toBe(
      undefined,
    );
    expect(installedAppStorageIdentity({ installId: "rates", packageAppKey: "missing" })).toBe(
      undefined,
    );
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
    expect(parseAuthorityApiRoute("/api/site/bootstrap")).toBeUndefined();
    expect(
      parseAuthorityApiRoute("/api/app-installs/site/personal/tree/blog%2Fpost"),
    ).toBeUndefined();
    expect(parseAuthorityApiRoute("/api/app-installs/site/site/bootstrap")).toBeUndefined();
    expect(parseAuthorityApiRoute("/api/tasks/bootstrap")).toBeUndefined();
    expect(parseAuthorityApiRoute("/api/app-installs/tasks/tasks/bootstrap")).toBeUndefined();
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
