import { parseBrowserAccessRequirement } from "./schema-authorization.ts";
import { assertExactKeys, parseKeyedDefinitionArray } from "./schema-parse-helpers.ts";
import { isStaticAppRelativePath } from "./schema-screens.ts";
import type {
  AppAuthorizationSchema,
  KeyedDefinition,
  ScreenSchema,
  SurfaceMountSchema,
} from "./types.ts";

export function parseSurfaceMounts(
  value: unknown,
  screens: readonly KeyedDefinition<ScreenSchema>[],
  authorization: AppAuthorizationSchema | undefined,
): KeyedDefinition<SurfaceMountSchema>[] {
  if (value === undefined) {
    return [];
  }

  const mounts = parseKeyedDefinitionArray<SurfaceMountSchema>(
    "Schema surface mounts",
    value,
    (mountKey, mount) => {
      const context = `Surface mount "${mountKey}"`;
      assertExactKeys(context, mount, ["key", "target", "path", "access"]);
      if (mount.target !== "browser" && mount.target !== "worker") {
        throw new Error(`${context} target must be "browser" or "worker".`);
      }
      if (
        typeof mount.path !== "string" ||
        mount.path === "/" ||
        !isStaticAppRelativePath(mount.path)
      ) {
        throw new Error(`${context} path must be a non-root static absolute path.`);
      }

      return {
        target: mount.target,
        path: mount.path,
        access: parseBrowserAccessRequirement(mount.access, { authorization }, `${context} access`),
      };
    },
  );

  assertDisjointMountPaths(mounts);
  assertMountsDoNotContainScreens(mounts, screens);
  return mounts;
}

function assertDisjointMountPaths(mounts: readonly KeyedDefinition<SurfaceMountSchema>[]): void {
  for (const [index, mount] of mounts.entries()) {
    for (const other of mounts.slice(index + 1)) {
      if (pathContains(mount.path, other.path) || pathContains(other.path, mount.path)) {
        throw new Error(
          `Surface mount paths "${mount.path}" and "${other.path}" must not overlap.`,
        );
      }
    }
  }
}

function assertMountsDoNotContainScreens(
  mounts: readonly KeyedDefinition<SurfaceMountSchema>[],
  screens: readonly KeyedDefinition<ScreenSchema>[],
): void {
  for (const mount of mounts) {
    for (const screen of screens) {
      if (screen.path !== undefined && pathContains(mount.path, screen.path)) {
        throw new Error(
          `Surface mount "${mount.key}" path "${mount.path}" must not equal or contain screen "${screen.key}" path "${screen.path}".`,
        );
      }
    }
  }
}

function pathContains(base: string, candidate: string): boolean {
  return candidate === base || candidate.startsWith(`${base}/`);
}
