import { describe, expect, it } from "vite-plus/test";

import { programPublicSiteRuntimeTarget } from "./public-site-runtime-target.ts";

describe("public Site runtime targets", () => {
  it("selects Program storage without package identity", () => {
    expect(programPublicSiteRuntimeTarget()).toEqual({
      storageIdentity: {
        apiRoutePrefix: "/api/formless/program",
        authorityName: "instance:control-plane",
        broadcastChannelName: "formless:instance:control-plane",
        browserDatabaseName: "formless:instance:control-plane",
        kind: "program",
        schemaKey: "formless-program",
      },
    });
  });
});
