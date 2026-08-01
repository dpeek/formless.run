import { describe, expect, it } from "vite-plus/test";
import {
  parseAuthorityApiRoute,
  parseProgramApiRoute,
  programStorageIdentity,
} from "./program-storage-identity.ts";

describe("Program storage identity", () => {
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

  it("parses the Program API route as Authority storage", () => {
    expect(parseProgramApiRoute("/api/formless/program/bootstrap")).toEqual({
      identity: programStorageIdentity(),
      path: "/bootstrap",
    });
    expect(parseProgramApiRoute("/api/formless/program/operations/task/create")).toEqual({
      identity: programStorageIdentity(),
      path: "/operations/task/create",
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
      "/api/missing/bootstrap",
      "/api/formless/program",
      "/api/formless/program/",
    ]) {
      expect(parseAuthorityApiRoute(pathname)).toBeUndefined();
    }
  });
});
