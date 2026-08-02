import {
  evaluateAccessRequirement,
  type AccessRequirement,
  type AppSchema,
} from "@dpeek/formless-schema";

import {
  formlessProgramScreenRouteTargets,
  resolveFormlessProgramScreenRouteTarget,
} from "../program/runtime.ts";
import type { ProgramSessionResponse } from "../shared/instance-auth.ts";
import type { RuntimeRouteAccess } from "../shared/runtime-topology.ts";

export function projectAuthorizedProgramScreenPaths(
  session: ProgramSessionResponse | undefined,
  programSchema: AppSchema,
): readonly string[] {
  if (session?.status !== "ready" || !satisfiesRuntimeRouteFloor(session, programSchema)) {
    return [];
  }

  return formlessProgramScreenRouteTargets(programSchema)
    .filter((screen) =>
      evaluateAccessRequirement(screen.access, session.callerFacts, programSchema),
    )
    .map((screen) => screen.path);
}

export function programScreenIsLocallyAuthorized({
  path,
  programSchema,
  session,
}: {
  path: string;
  programSchema: AppSchema;
  session: ProgramSessionResponse | undefined;
}): boolean {
  if (session?.status !== "ready" || !satisfiesRuntimeRouteFloor(session, programSchema)) {
    return false;
  }

  const screen = resolveFormlessProgramScreenRouteTarget(path, programSchema);

  return (
    screen !== undefined &&
    evaluateAccessRequirement(screen.access, session.callerFacts, programSchema)
  );
}

function satisfiesRuntimeRouteFloor(
  session: Extract<ProgramSessionResponse, { status: "ready" }>,
  programSchema: AppSchema,
): boolean {
  return evaluateAccessRequirement(
    runtimeRouteFloorRequirement(session.target.routeAccess),
    session.callerFacts,
    programSchema,
  );
}

function runtimeRouteFloorRequirement(access: RuntimeRouteAccess): AccessRequirement {
  switch (access) {
    case "anonymous":
      return { actor: "anonymous" };
    case "authenticated":
      return { actor: "authenticated" };
    case "management":
      return { role: "administrator" };
    case "owner":
      return { actor: "owner" };
  }
}
