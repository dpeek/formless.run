import { describe, expect, it } from "vite-plus/test";
import {
  parseAuthorityApiRoute,
  parseProgramApiRoute,
  programStorageIdentity,
} from "./app-storage-identity.ts";

describe("app storage identity", () => {
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

  it("leaves built-in package API paths unclaimed", () => {
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
