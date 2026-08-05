import {
  type AccountCompletionGateTarget,
  type AccountRedirectTarget,
} from "../shared/instance-auth.ts";
import { type RuntimeProfileKind, type RuntimeRouteAccess } from "../shared/runtime-topology.ts";
import type { InstanceRuntimeRouteResolution } from "./instance-runtime-routes.ts";

const sameOriginInstanceRuntimeRouteId = "runtime:instance";
type ProtectedRouteAccess = Exclude<RuntimeRouteAccess, "anonymous">;

export function sameOriginAccountCompletionTargetForRuntimeRouteFacts(input: {
  accountOrigin: string;
  minimumAccess?: ProtectedRouteAccess;
  requestOrigin: string;
  returnTo: AccountRedirectTarget;
  runtimeProfile: RuntimeProfileKind;
  runtimeRoute: InstanceRuntimeRouteResolution | undefined;
}): AccountCompletionGateTarget | undefined {
  if (input.accountOrigin !== input.requestOrigin) {
    return undefined;
  }

  if (input.runtimeRoute?.kind === "mount") {
    if (
      input.minimumAccess !== undefined &&
      !runtimeRouteAccessSatisfies(input.runtimeRoute.access, input.minimumAccess)
    ) {
      return undefined;
    }

    if (input.runtimeRoute.targetProfile !== "instance") {
      return undefined;
    }

    return {
      returnTo: input.returnTo,
      routeId: input.runtimeRoute.id,
      targetOrigin: input.requestOrigin,
      targetProfile: "instance",
    };
  }

  if (input.runtimeRoute !== undefined || input.runtimeProfile !== "instance") {
    return undefined;
  }

  return {
    returnTo: input.returnTo,
    routeId: sameOriginInstanceRuntimeRouteId,
    targetOrigin: input.requestOrigin,
    targetProfile: "instance",
  };
}

function runtimeRouteAccessSatisfies(
  actual: RuntimeRouteAccess,
  required: ProtectedRouteAccess,
): boolean {
  if (actual === "owner") {
    return true;
  }

  if (required === "authenticated") {
    return actual === "authenticated" || actual === "management";
  }

  return actual === required;
}
