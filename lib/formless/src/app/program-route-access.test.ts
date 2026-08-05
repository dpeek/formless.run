import { describe, expect, it } from "vite-plus/test";

import { formlessProgramSchema } from "../program/runtime.ts";
import type { ProgramSessionResponse } from "../shared/instance-auth.ts";
import { FORMLESS_PROGRAM_STORAGE_IDENTITY } from "../program/target.ts";
import { programRouteIsLocallyAuthorized } from "./program-screen-access.ts";

describe("Program route local authorization", () => {
  it("applies the runtime-route floor and browser mount access requirement", () => {
    expect(
      programRouteIsLocallyAuthorized({
        path: "/site/preview/blog/post",
        programSchema: formlessProgramSchema,
        session: readySession("anonymous"),
      }),
    ).toBe(true);
    expect(
      programRouteIsLocallyAuthorized({
        path: "/site/preview/blog/post",
        programSchema: formlessProgramSchema,
        session: readySession("owner"),
      }),
    ).toBe(false);
    expect(
      programRouteIsLocallyAuthorized({
        path: "/site/public/blog/post",
        programSchema: formlessProgramSchema,
        session: readySession("anonymous"),
      }),
    ).toBe(false);
  });
});

function readySession(
  routeAccess: "anonymous" | "owner",
): Extract<ProgramSessionResponse, { status: "ready" }> {
  return {
    callerFacts: { active: true, kind: "principal", owner: false },
    principal: { displayName: "Editor", principalId: "principal:editor" },
    session: { expiresAt: "2026-08-06T00:00:00.000Z" },
    status: "ready",
    target: {
      routeAccess,
      routeId: "runtime:instance",
      storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
      targetOrigin: "https://instance.example.com",
      targetProfile: "instance",
    },
  };
}
