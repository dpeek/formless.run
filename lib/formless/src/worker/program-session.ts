import type { AppSchema } from "@dpeek/formless-schema";

import {
  instanceAuthError,
  parseProgramSessionRequest,
  parseProgramSessionResponse,
  PROGRAM_SESSION_API_PATH,
  type AccountPrincipalIdentity,
  type InstanceAuthErrorCode,
  type ProgramSessionResponse,
  type ProgramSessionTargetBinding,
} from "../shared/instance-auth.ts";
import { FORMLESS_PROGRAM_STORAGE_IDENTITY } from "../program/target.ts";
import { formlessProgramSchema } from "../program/runtime.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import {
  requestOriginForAuth,
  routeAccessTargetForRuntimeRoute,
  validateInstanceAuthAccessSession,
  type InstanceAuthHandoffEnv,
  type ProtectedRouteAccess,
} from "./instance-auth-handoff.ts";
import { sameOriginAccountCompletionTargetForRuntimeRouteFacts } from "./instance-auth-account-target.ts";
import {
  readInternalActiveIdentityPrincipal,
  readInternalIdentityAuthorityForPrincipal,
  type ActiveIdentityAuthority,
  type ActiveIdentityPrincipal,
} from "./identity-owner-internal.ts";
import {
  resolveInstanceRuntimeRouteForRequest,
  type InstanceRuntimeRouteResolution,
} from "./instance-runtime-routes.ts";
import {
  resolveProgramRouteTargetFromFacts,
  resolveWorkerRuntimeRequestTopology,
  workerRuntimeProfileInput,
  type ProgramRouteTarget,
} from "./routing.ts";
import type { InstanceAuthSessionTargetBinding } from "./instance-auth-state.ts";

export { PROGRAM_SESSION_API_PATH };

type ProgramSessionRouteResolution = {
  programRoute: ProgramRouteTarget;
  requiredAccess: ProtectedRouteAccess;
  sessionTarget: InstanceAuthSessionTargetBinding;
  target: ProgramSessionTargetBinding;
};

type ProgramSessionHandlerOptions = {
  programSchema?: AppSchema;
};

export async function handleProgramSessionRequest(
  request: Request,
  env: InstanceAuthHandoffEnv,
  options: ProgramSessionHandlerOptions = {},
): Promise<Response | undefined> {
  const url = new URL(request.url);

  if (url.pathname !== PROGRAM_SESSION_API_PATH) {
    return undefined;
  }

  if (request.method !== "GET") {
    return programSessionErrorResponse("method-not-allowed", 405, { Allow: "GET" });
  }

  try {
    const input = parseProgramSessionQuery(url.searchParams);
    const targetRequest = new Request(new URL(input.returnTo, request.url), {
      headers: request.headers,
      method: "GET",
    });
    const runtimeRoute = await resolveInstanceRuntimeRouteForRequest(targetRequest, env);
    const runtimeProfile =
      runtimeRoute?.kind === "mount" &&
      runtimeRoute.matchHost !== undefined &&
      runtimeRoute.targetProfile === "instance"
        ? "instance"
        : env.FORMLESS_RUNTIME_PROFILE;
    const programSchema = options.programSchema ?? formlessProgramSchema;
    const route = resolveProgramSessionRouteFromFacts({
      programSchema,
      request: targetRequest,
      runtimeProfile,
      runtimeRoute,
    });

    if (!route) {
      return programSessionErrorResponse("invalid-request", 400);
    }

    const current: {
      authority: ActiveIdentityAuthority | null;
      principal: ActiveIdentityPrincipal | null;
    } = { authority: null, principal: null };
    const access = await validateInstanceAuthAccessSession(targetRequest, env, {
      accountCompletionTarget: {
        ...route.sessionTarget,
        returnTo: input.returnTo,
      },
      programSchema,
      programRouteAccess: route.programRoute.access,
      readers: {
        readActivePrincipal: async (session) => {
          current.principal = await readInternalActiveIdentityPrincipal(env, session.principalId);
          return current.principal;
        },
        readManagementAuthority: async (session) => {
          current.authority = await readInternalIdentityAuthorityForPrincipal(
            env,
            session.principalId,
          );
          return current.authority;
        },
      },
      requiredAuthority: route.requiredAccess,
      target: route.sessionTarget,
    });

    if (!access.ok) {
      if (access.authenticated === undefined) {
        return programSessionResponse({
          setupComplete: await readOwnerSetupComplete(request, env),
          status: "anonymous",
        });
      }

      const authenticatedPrincipal = accountPrincipalIdentity(access.authenticated.principal);
      const session = { expiresAt: access.authenticated.session.expiresAt };

      if (
        access.reason === "account-completion-required" &&
        access.accountCompletion?.status === "blocked"
      ) {
        return programSessionResponse({
          accountCompletion: access.accountCompletion,
          principal: authenticatedPrincipal,
          session,
          status: "blocked",
          target: route.target,
        });
      }

      return programSessionResponse({
        principal: authenticatedPrincipal,
        session,
        status: "forbidden",
      });
    }

    const principal =
      current.principal ?? (await readInternalActiveIdentityPrincipal(env, access.principalId));
    const authority = current.authority;

    if (!principal || principal.id !== access.principalId || authority?.id !== access.principalId) {
      return programSessionErrorResponse("unauthorized", 401);
    }

    return programSessionResponse({
      callerFacts: authority.callerFacts,
      principal: accountPrincipalIdentity(principal),
      session: { expiresAt: access.session.expiresAt },
      status: "ready",
      target: route.target,
    });
  } catch {
    return programSessionErrorResponse("invalid-request", 400);
  }
}

export function resolveProgramSessionRouteFromFacts(input: {
  programSchema: AppSchema;
  request: Request;
  runtimeProfile?: string;
  runtimeRoute?: InstanceRuntimeRouteResolution;
}): ProgramSessionRouteResolution | undefined {
  const requestOrigin = requestOriginForAuth(input.request);
  const topology = resolveWorkerRuntimeRequestTopology(input.request, {
    ...workerRuntimeProfileInput(input.runtimeProfile),
    programSchema: input.programSchema,
  });
  const programRoute = resolveProgramRouteTargetFromFacts({
    runtimeRoute: input.runtimeRoute,
    topology,
  });

  if (!programRoute || programRoute.requiredAccess === "anonymous") {
    return undefined;
  }

  const returnTo = `${topology.url.pathname}${topology.url.search}` as `/${string}`;
  const accountTarget = sameOriginAccountCompletionTargetForRuntimeRouteFacts({
    accountOrigin: requestOrigin,
    requestOrigin,
    returnTo,
    runtimeProfile: topology.profileKind,
    runtimeRoute: input.runtimeRoute,
  });

  if (!accountTarget || accountTarget.targetProfile !== "instance") {
    return undefined;
  }

  const sessionTarget = routeAccessTargetForRuntimeRoute(input.request, input.runtimeRoute, {
    effectiveAccess: programRoute.requiredAccess,
    minimumAccess: programRoute.requiredAccess,
  }) ?? {
    access: programRoute.requiredAccess,
    routeId: accountTarget.routeId,
    targetOrigin: accountTarget.targetOrigin,
    targetProfile: accountTarget.targetProfile,
  };

  return {
    programRoute,
    requiredAccess: programRoute.requiredAccess,
    sessionTarget,
    target: {
      routeAccess: programRoute.routeAccess,
      routeId: accountTarget.routeId,
      storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
      targetOrigin: accountTarget.targetOrigin,
      targetProfile: "instance",
    },
  };
}

function parseProgramSessionQuery(search: URLSearchParams) {
  const entries = [...search.entries()];

  if (entries.length !== 1) {
    throw new Error("Program session request must include exactly one returnTo query parameter.");
  }

  return parseProgramSessionRequest(Object.fromEntries(entries));
}

async function readOwnerSetupComplete(
  request: Request,
  env: InstanceAuthHandoffEnv,
): Promise<boolean> {
  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);
  const response = await env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(new URL("/api/formless/setup", request.url), {
      headers: { Accept: "application/json" },
      method: "GET",
    }),
  );

  if (!response.ok) {
    return false;
  }

  const body = (await response.json()) as { setupComplete?: unknown };

  return body.setupComplete === true;
}

function accountPrincipalIdentity(principal: ActiveIdentityPrincipal): AccountPrincipalIdentity {
  return {
    displayName: principal.displayName,
    ...(principal.email === undefined ? {} : { email: principal.email }),
    principalId: principal.id,
  };
}

function programSessionResponse(result: ProgramSessionResponse): Response {
  return Response.json(parseProgramSessionResponse(result), {
    headers: { "Cache-Control": "no-store" },
  });
}

function programSessionErrorResponse(
  code: InstanceAuthErrorCode,
  status: number,
  headers: HeadersInit = {},
): Response {
  const responseHeaders = new Headers(headers);

  responseHeaders.set("Cache-Control", "no-store");

  return Response.json(instanceAuthError(code), {
    headers: responseHeaders,
    status,
  });
}
