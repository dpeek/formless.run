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
      programRoute: {
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

  it("resolves an authenticated browser mount and its downstream replacement", () => {
    const programSchema = structuredClone(formlessProgramSchema);
    const previewMount = programSchema.surfaceMounts?.find(
      (mount) => mount.key === "site.preview.browser",
    );

    if (!previewMount) {
      throw new Error("Expected the Program schema to include the Site browser preview mount.");
    }

    previewMount.path = "/review/site";

    const route = resolveProgramSessionRouteFromFacts({
      programSchema,
      request: new Request("https://instance.example.com/review/site/blog?draft=1"),
      runtimeProfile: "instance",
    });

    expect(route).toMatchObject({
      programRoute: {
        access: { actor: "authenticated" },
        key: "site.preview.browser",
        path: "/review/site",
        pathSuffix: "/blog",
        target: "browser",
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
    expect(
      resolveProgramSessionRouteFromFacts({
        programSchema,
        request: new Request("https://instance.example.com/site/preview/blog"),
        runtimeProfile: "instance",
      }),
    ).toBeUndefined();
  });

  it("resolves an authenticated Worker mount and its downstream replacement", () => {
    const programSchema = structuredClone(formlessProgramSchema);
    const previewMount = programSchema.surfaceMounts?.find(
      (mount) => mount.key === "site.preview.worker",
    );

    if (!previewMount) {
      throw new Error("Expected the Program schema to include the Site Worker preview mount.");
    }

    previewMount.path = "/review/public-site";

    const route = resolveProgramSessionRouteFromFacts({
      programSchema,
      request: new Request("https://instance.example.com/review/public-site/blog?draft=1"),
      runtimeProfile: "instance",
    });

    expect(route).toMatchObject({
      programRoute: {
        access: { actor: "authenticated" },
        key: "site.preview.worker",
        path: "/review/public-site",
        pathSuffix: "/blog",
        target: "worker",
      },
      requiredAccess: "authenticated",
      target: {
        routeAccess: "anonymous",
        storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
        targetProfile: "instance",
      },
    });
  });
});
