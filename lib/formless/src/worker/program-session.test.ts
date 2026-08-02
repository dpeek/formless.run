import { describe, expect, it } from "vite-plus/test";

import { formlessProgramSchema } from "../program/runtime.ts";
import { FORMLESS_PROGRAM_STORAGE_IDENTITY } from "../program/target.ts";
import { resolveProgramSessionRouteFromFacts } from "./program-session.ts";

describe("Program session route resolution", () => {
  it("resolves downstream Program screen paths from the active schema", () => {
    const programSchema = structuredClone(formlessProgramSchema);
    const tasks = programSchema.screens.find((screen) => screen.key === "taskHome");

    if (!tasks) {
      throw new Error("Expected the Program schema to include the Tasks screen.");
    }

    tasks.path = "/work-items";

    const downstream = resolveProgramSessionRouteFromFacts({
      programSchema,
      request: new Request("https://instance.example.com/work-items?view=active"),
      runtimeProfile: "instance",
    });
    const staleDefaultPath = resolveProgramSessionRouteFromFacts({
      programSchema,
      request: new Request("https://instance.example.com/tasks"),
      runtimeProfile: "instance",
    });

    expect(downstream).toMatchObject({
      programScreen: {
        key: "taskHome",
        path: "/work-items",
      },
      requiredAccess: "authenticated",
      sessionTarget: {
        access: "authenticated",
        routeId: "runtime:instance",
        targetOrigin: "https://instance.example.com",
        targetProfile: "instance",
      },
      target: {
        routeAccess: "anonymous",
        routeId: "runtime:instance",
        storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
        targetOrigin: "https://instance.example.com",
        targetProfile: "instance",
      },
    });
    expect(staleDefaultPath).toBeUndefined();
  });
});
