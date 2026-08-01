import { instanceControlPlaneProductionIdentityFromRecords } from "@dpeek/formless-instance-control-plane";

import { nowIsoString } from "../shared/clock.ts";
import {
  FORMLESS_INSTANCE_AUTH_ORIGIN_ENV_NAME,
  accountRedirectLocationForRoute,
  parseAccountCompletionGateResolutionResult,
  parseAuthAccountStatusResult,
  parseInstanceAuthCanonicalOrigin,
  parseAccountRedirectTarget,
  type AccountAuthorizationForbiddenResult,
  type AccountCompletionGateResolutionResult,
  type AccountCompletionGateTarget,
  type AccountRedirectTarget,
} from "../shared/instance-auth.ts";
import {
  acceptsRuntimeHtml,
  parseRuntimeRouteAccess,
  runtimeTopologyRoutes,
  type RuntimeRouteAccess,
} from "../shared/runtime-topology.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import {
  INSTANCE_AUTH_ACCOUNT_COMPLETION_RESOLVE_PATH,
  resolveAccountCompletionGate,
} from "./instance-auth-account-completion.ts";
import {
  authenticatedOperationActorForAccess,
  resolveInstanceAuthAccess,
  validateHostSessionScope,
  validateCentralInstanceAuthAccess,
  validateHostInstanceAuthAccess,
  type HostAuthSession,
  type HostAuthSessionValidationFailureReason,
  type InstanceAuthAccessReaders,
  type InstanceAuthAccessResult,
  type InstanceAuthAuthorityRequirement,
  type InstanceAuthSession,
  type InstanceAuthSessionKind,
} from "./instance-auth-access.ts";
import {
  consumeHandoffGrant,
  createHandoffGrant,
  readInstanceAuthConfig,
  type CreateHandoffGrantInput,
  readHostSessionRevocationVersion,
  type InstanceAuthHandoffTargetProfile,
  type InstanceAuthSessionTargetBinding,
  type StoredHandoffGrant,
} from "./instance-auth-state.ts";
import { readControlPlaneRecords } from "./deployment-control-plane-client.ts";
import {
  readInternalIdentityAuthorityForPrincipal,
  readInternalActiveIdentityPrincipal,
  readInternalIdentityOwnerForPrincipal,
  type ActiveIdentityPrincipal,
} from "./identity-owner-internal.ts";
import {
  ownerSessionSigningSecret,
  validateOwnerSessionCookie,
  type OwnerSession,
  type OwnerSessionEnv,
} from "./owner-session.ts";
import {
  validateCentralAuthSessionBinding,
  validateCentralAuthSessionState,
  type CentralAuthSession,
  type CentralAuthSessionValidationFailureReason,
} from "./central-auth-session.ts";
import {
  resolveInstanceRuntimeRouteFromRecords,
  type InstanceRuntimeMountRouteResolution,
  type InstanceRuntimeRouteResolution,
} from "./instance-runtime-routes.ts";
import {
  evaluateAccessRequirement,
  type AccessRequirement,
  type AppSchema,
  type ScreenAccessRequirement,
} from "@dpeek/formless-schema";
import {
  isLocalOwnerSessionRuntime,
  type LocalSessionBootstrapEnv,
} from "./local-session-bootstrap.ts";
import { resolveProgramScreenRouteTargetFromFacts } from "./routing.ts";

export type {
  HostAuthSession,
  HostAuthSessionValidationFailureReason,
} from "./instance-auth-access.ts";

export const INSTANCE_AUTH_HANDOFF_START_PATH = "/formless/auth/handoff";
export const INSTANCE_AUTH_HANDOFF_CALLBACK_PATH = "/formless/auth/callback";
export const HOST_AUTH_NONCE_COOKIE_NAME = "formless_host_auth_nonce";
export const HOST_AUTH_SESSION_COOKIE_NAME = "formless_host_session";

const instanceAuthHostSessionValidatePath = "/formless/auth/host-session/validate";
const instanceAuthCentralSessionValidatePath = "/formless/auth/central-session/validate";
const internalBoundCentralSessionValidatePath = "/_internal/instance-auth/central-session/validate";
const handoffGrantTtlMs = 5 * 60 * 1000;
const hostNonceMaxAgeSeconds = 5 * 60;
const hostSessionMaxAgeSeconds = 12 * 60 * 60;
const hostSessionPurpose = "host-session";
const hostSessionVersion = 1;
const base64UrlPattern = /^[A-Za-z0-9_-]+$/;
const handoffTargetProfiles = ["instance", "public-site"] as const;
const handoffTargetHeaders = {
  access: "x-formless-auth-handoff-access",
  routeId: "x-formless-auth-handoff-route-id",
  targetOrigin: "x-formless-auth-handoff-target-origin",
  targetProfile: "x-formless-auth-handoff-target-profile",
} as const;

export type InstanceAuthHandoffEnv = OwnerSessionEnv & {
  [FORMLESS_INSTANCE_AUTH_ORIGIN_ENV_NAME]?: string;
  FORMLESS_AUTHORITY: DurableObjectNamespace;
  FORMLESS_RUNTIME_PROFILE?: string;
};

export type InstanceAuthAccessEnv = Omit<InstanceAuthHandoffEnv, "FORMLESS_AUTHORITY"> & {
  FORMLESS_AUTHORITY?: DurableObjectNamespace;
};

export type HostAuthSessionAuthorityValidationResult =
  | {
      ok: true;
      session: HostAuthSession;
    }
  | {
      ok: false;
      accountCompletion?: AccountCompletionGateResolutionResult;
      reason: HostAuthSessionValidationFailureReason;
    };

type HostAuthSessionPayload = HostAuthSession & {
  purpose: typeof hostSessionPurpose;
  version: typeof hostSessionVersion;
};

export type ProtectedRouteAccess = Exclude<RuntimeRouteAccess, "anonymous">;
type HostSessionAuthorityRequirement = ProtectedRouteAccess | "management";
type CentralSessionAuthorityRequirement = ProtectedRouteAccess | "management";
type CentralAuthSessionAuthorityValidationFailureReason =
  | CentralAuthSessionValidationFailureReason
  | "account-completion-required"
  | "missing-management-authority"
  | "missing-owner-authority";

type CentralAuthSessionAuthorityValidationResult =
  | {
      ok: true;
      ownerSessionFallbackAllowed: boolean;
      session: CentralAuthSession;
    }
  | {
      ok: false;
      accountCompletion?: AccountCompletionGateResolutionResult;
      ownerSessionFallbackAllowed: boolean;
      reason: CentralAuthSessionAuthorityValidationFailureReason;
    };

export type RouteAccessSessionValidationResult = InstanceAuthAccessResult;

export type InstanceAuthCallbackReservation =
  | { kind: "not-callback" }
  | { kind: "reserved"; target?: InstanceAuthSessionTargetBinding };

export type ProtectedRouteAuthRedirectPlan =
  | {
      kind: "account";
      location: string;
      returnTo: AccountRedirectTarget;
    }
  | {
      authOrigin: string;
      entryPath: string;
      kind: "handoff";
      returnTo: AccountRedirectTarget;
      target: InstanceAuthSessionTargetBinding;
    }
  | { error: "Handoff return target must be path-only."; kind: "invalid-return-target" }
  | { kind: "unavailable" };

export function planProtectedRouteAuthRedirect(input: {
  allowRouteAccessElevation?: boolean;
  authOrigin?: string;
  entry: "account" | "handoff";
  requestOrigin: string;
  requiredAccess: ProtectedRouteAccess;
  runtimeRoute: InstanceRuntimeRouteResolution | undefined;
  safeReturnTo: AccountRedirectTarget | undefined;
}): ProtectedRouteAuthRedirectPlan {
  if (!input.authOrigin) {
    return { kind: "unavailable" };
  }

  if (!input.safeReturnTo) {
    return {
      error: "Handoff return target must be path-only.",
      kind: "invalid-return-target",
    };
  }

  const target = hostAuthSessionTargetForRuntimeRouteFacts({
    ...(input.allowRouteAccessElevation ? { effectiveAccess: input.requiredAccess } : {}),
    minimumAccess: input.requiredAccess,
    requestOrigin: input.requestOrigin,
    runtimeRoute: input.runtimeRoute,
  });

  if (!target || input.authOrigin === input.requestOrigin) {
    if (input.entry === "handoff") {
      return { kind: "unavailable" };
    }

    const location = new URL(runtimeTopologyRoutes.authAccountRoute, input.authOrigin);

    location.searchParams.set("returnTo", input.safeReturnTo);

    return {
      kind: "account",
      location:
        input.authOrigin === input.requestOrigin
          ? `${location.pathname}${location.search}`
          : location.toString(),
      returnTo: input.safeReturnTo,
    };
  }

  return {
    authOrigin: input.authOrigin,
    entryPath:
      input.entry === "handoff"
        ? INSTANCE_AUTH_HANDOFF_START_PATH
        : runtimeTopologyRoutes.authAccountRoute,
    kind: "handoff",
    returnTo: input.safeReturnTo,
    target,
  };
}

export async function startProtectedRouteAuthHandoff(
  request: Request,
  env: InstanceAuthHandoffEnv,
  runtimeRoute: InstanceRuntimeRouteResolution | undefined,
  requiredAccess: ProtectedRouteAccess,
  options: { allowRouteAccessElevation?: boolean } = {},
): Promise<Response | undefined> {
  return startProtectedRouteAuthRedirect(request, env, runtimeRoute, {
    ...options,
    entry: "handoff",
    requiredAccess,
  });
}

export async function startProtectedRouteAuthAccount(
  request: Request,
  env: InstanceAuthHandoffEnv,
  runtimeRoute: InstanceRuntimeRouteResolution | undefined,
  requiredAccess: ProtectedRouteAccess,
  options: { allowRouteAccessElevation?: boolean } = {},
): Promise<Response | undefined> {
  return startProtectedRouteAuthRedirect(request, env, runtimeRoute, {
    ...options,
    entry: "account",
    requiredAccess,
  });
}

async function startProtectedRouteAuthRedirect(
  request: Request,
  env: InstanceAuthHandoffEnv,
  runtimeRoute: InstanceRuntimeRouteResolution | undefined,
  options: {
    allowRouteAccessElevation?: boolean;
    entry: "account" | "handoff";
    requiredAccess: ProtectedRouteAccess;
  },
): Promise<Response | undefined> {
  const authOrigin = await configuredInstanceAuthOrigin(request, env);
  const url = new URL(request.url);
  const plan = planProtectedRouteAuthRedirect({
    ...(options.allowRouteAccessElevation ? { allowRouteAccessElevation: true } : {}),
    authOrigin,
    entry: options.entry,
    requestOrigin: requestOriginForAuth(request),
    requiredAccess: options.requiredAccess,
    runtimeRoute,
    safeReturnTo: parseAccountRedirectTarget(`${url.pathname}${url.search}`),
  });

  if (plan.kind === "unavailable") {
    return undefined;
  }

  if (plan.kind === "invalid-return-target") {
    return jsonResponse({ error: plan.error }, 400);
  }

  if (plan.kind === "account") {
    return redirectResponse(plan.location, 302);
  }

  const nonce = randomBase64Url(32);
  const nonceHash = await sha256Base64Url(nonce);
  const state = randomBase64Url(32);
  const location = new URL(plan.entryPath, plan.authOrigin);

  location.searchParams.set("access", plan.target.access);
  location.searchParams.set("targetOrigin", plan.target.targetOrigin);
  location.searchParams.set("routeId", plan.target.routeId);
  location.searchParams.set("targetProfile", plan.target.targetProfile);
  location.searchParams.set("returnTo", plan.returnTo);
  location.searchParams.set("nonceHash", nonceHash);
  location.searchParams.set("state", state);

  return redirectResponse(location.toString(), 302, {
    "Set-Cookie": serializeHostAuthNonceCookie(plan.target.targetOrigin, nonce),
  });
}

export async function startOwnerRouteAuthHandoff(
  request: Request,
  env: InstanceAuthHandoffEnv,
  runtimeRoute: InstanceRuntimeRouteResolution | undefined,
): Promise<Response | undefined> {
  return startProtectedRouteAuthHandoff(request, env, runtimeRoute, "owner");
}

export async function handleInstanceAuthHandoffRequest(
  request: Request,
  env: InstanceAuthHandoffEnv,
  runtimeRoute?: InstanceRuntimeRouteResolution,
): Promise<Response | undefined> {
  const url = new URL(request.url);
  const callback = instanceAuthCallbackReservationFromFacts({
    effectiveAccess: protectedRouteAccessSearchParam(url, "access"),
    pathname: url.pathname,
    requestOrigin: requestOriginForAuth(request),
    runtimeRoute,
  });

  if (callback.kind === "reserved") {
    if (!callback.target) {
      return jsonResponse({ error: "Handoff callback is invalid." }, 400);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "GET, HEAD" });
    }

    const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);

    return env.FORMLESS_AUTHORITY.get(id).fetch(
      requestWithHandoffTargetHeaders(request, callback.target),
    );
  }

  if (url.pathname !== INSTANCE_AUTH_HANDOFF_START_PATH) {
    return undefined;
  }

  const authOrigin = await configuredInstanceAuthOrigin(request, env);

  if (!authOrigin) {
    return jsonResponse({ error: "Instance auth configuration is missing." }, 400);
  }

  if (authOrigin !== requestOriginForAuth(request)) {
    return new Response(null, { status: 404 });
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);

  return env.FORMLESS_AUTHORITY.get(id).fetch(request);
}

export type AuthAccountHandoffBrowserContinuationResult =
  | {
      accountCompletion: Extract<AccountCompletionGateResolutionResult, { status: "blocked" }>;
      kind: "blocked";
    }
  | {
      accountAuthorization: AccountAuthorizationForbiddenResult;
      kind: "forbidden";
    }
  | { kind: "response"; response: Response };

export type AuthAccountHandoffContinuationResolution =
  | {
      accountCompletion: Extract<AccountCompletionGateResolutionResult, { status: "blocked" }>;
      kind: "blocked";
    }
  | {
      accountCompletion: Extract<AccountCompletionGateResolutionResult, { status: "complete" }>;
      kind: "complete";
    }
  | {
      accountAuthorization: AccountAuthorizationForbiddenResult;
      kind: "forbidden";
    }
  | { kind: "login-required"; redirectTo: `/${string}` };

export async function handleAuthAccountHandoffBrowserContinuation(
  request: Request,
  env: InstanceAuthHandoffEnv,
): Promise<AuthAccountHandoffBrowserContinuationResult | undefined> {
  try {
    const resolution = await resolveAuthAccountHandoffContinuation(request, env);

    if (resolution === undefined) {
      return undefined;
    }

    if (resolution.kind === "login-required") {
      return {
        kind: "response",
        response: redirectResponse(resolution.redirectTo, 302),
      };
    }

    if (resolution.kind === "blocked") {
      return {
        accountCompletion: resolution.accountCompletion,
        kind: "blocked",
      };
    }

    if (resolution.kind === "forbidden") {
      return {
        accountAuthorization: resolution.accountAuthorization,
        kind: "forbidden",
      };
    }

    return {
      kind: "response",
      response: redirectResponse(resolution.accountCompletion.continueTo, 302),
    };
  } catch (error) {
    return {
      kind: "response",
      response: jsonResponse({ error: errorMessage(error) }, 400),
    };
  }
}

export async function resolveAuthAccountHandoffContinuation(
  request: Request,
  env: InstanceAuthHandoffEnv,
): Promise<AuthAccountHandoffContinuationResolution | undefined> {
  const url = new URL(request.url);

  if (!url.searchParams.has("targetOrigin")) {
    return undefined;
  }

  const target = await verifiedHandoffStartTargetFromSearch(request, env, url);
  const accountCompletionTarget = accountCompletionTargetForHandoffTarget(target);
  const session = await validateAuthOriginSession(request, env, target.requiredAccess, {
    accountCompletionTarget,
    ...(target.programScreenAccess === undefined
      ? {}
      : { programScreenAccess: target.programScreenAccess }),
    target,
  });

  if (!session.ok) {
    if (
      session.reason === "account-completion-required" &&
      session.accountCompletion?.status === "blocked"
    ) {
      return {
        accountCompletion: session.accountCompletion,
        kind: "blocked",
      };
    }

    if (session.authenticated !== undefined) {
      return {
        accountAuthorization: accountAuthorizationForbiddenResult(session.authenticated.principal),
        kind: "forbidden",
      };
    }

    return {
      kind: "login-required",
      redirectTo: accountRedirectLocationForRoute(authAccountRedirectTargetForRequest(request)),
    };
  }

  const accountCompletion =
    target.requiredAccess === "authenticated" && !session.ownerAuthorized
      ? await resolveAccountCompletionForTarget(
          request,
          env,
          session.session.principalId,
          accountCompletionTarget,
        )
      : completeAccountContinuationResult(accountCompletionTarget);

  if (accountCompletion.status === "blocked") {
    return {
      accountCompletion,
      kind: "blocked",
    };
  }

  return {
    accountCompletion: {
      ...accountCompletion,
      continueTo: handoffStartRedirectTargetForAuthAccountRequest(request),
    },
    kind: "complete",
  };
}

export async function handleInstanceAuthHandoffDurableObjectRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceAuthHandoffEnv,
): Promise<Response | undefined> {
  const url = new URL(request.url);

  if (url.pathname === instanceAuthHostSessionValidatePath) {
    return handleHostAuthSessionValidationDurableObjectRequest(request, storage, env);
  }

  if (url.pathname === instanceAuthCentralSessionValidatePath) {
    return handleCentralAuthSessionValidationDurableObjectRequest(request, storage, env);
  }

  if (url.pathname === internalBoundCentralSessionValidatePath) {
    return handleBoundCentralAuthSessionValidationDurableObjectRequest(request, storage);
  }

  if (url.pathname === INSTANCE_AUTH_HANDOFF_CALLBACK_PATH) {
    return handleHandoffCallbackDurableObjectRequest(request, storage, env);
  }

  if (url.pathname !== INSTANCE_AUTH_HANDOFF_START_PATH) {
    return undefined;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "GET, HEAD" });
  }

  try {
    const target = await verifiedHandoffStartTargetFromSearch(request, env, url);
    const session = await validateAuthOriginSession(request, env, target.requiredAccess, {
      accountCompletionTarget: accountCompletionTargetForHandoffTarget(target),
      ...(target.programScreenAccess === undefined
        ? {}
        : { programScreenAccess: target.programScreenAccess }),
      target,
    });

    if (!session.ok) {
      if (
        session.reason === "account-completion-required" &&
        session.accountCompletion?.status === "blocked"
      ) {
        if (acceptsRuntimeHtml(request.headers.get("Accept"))) {
          return redirectResponse(authAccountRedirectTargetForRequest(request), 302);
        }

        return accountCompletionBlockedResponse(session.accountCompletion);
      }

      if (session.authenticated !== undefined) {
        if (acceptsRuntimeHtml(request.headers.get("Accept"))) {
          return redirectResponse(authAccountRedirectTargetForRequest(request), 302);
        }

        return accountAuthorizationForbiddenResponse(
          accountAuthorizationForbiddenResult(session.authenticated.principal),
        );
      }

      if (!acceptsRuntimeHtml(request.headers.get("Accept"))) {
        return jsonResponse({ error: "Authenticated account session is required." }, 401);
      }

      return redirectResponse(authAccountRedirectTargetForRequest(request), 302);
    }

    if (target.requiredAccess === "authenticated" && !session.ownerAuthorized) {
      const accountCompletion = await resolveAccountCompletionGate({
        env,
        input: {
          actorKind: "authenticated",
          principalId: session.session.principalId,
          target: accountCompletionTargetForHandoffTarget(target),
        },
        storage,
      });

      if (accountCompletion.status === "blocked") {
        if (acceptsRuntimeHtml(request.headers.get("Accept"))) {
          return redirectResponse(authAccountRedirectTargetForRequest(request), 302);
        }

        return accountCompletionBlockedResponse(accountCompletion);
      }
    }

    return await issueHandoffGrantRedirect(storage, target, {
      instanceId: session.session.instanceId,
      principalId: session.session.principalId,
    });
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, 400);
  }
}

export async function configuredInstanceAuthOrigin(
  request: Request,
  env: Pick<
    InstanceAuthHandoffEnv,
    typeof FORMLESS_INSTANCE_AUTH_ORIGIN_ENV_NAME | "FORMLESS_AUTHORITY"
  > &
    Partial<LocalSessionBootstrapEnv>,
): Promise<string | undefined> {
  const explicitOrigin = stringEnvValue(env[FORMLESS_INSTANCE_AUTH_ORIGIN_ENV_NAME]);

  if (explicitOrigin !== undefined) {
    return configuredInstanceAuthOriginFromFacts({ explicitOrigin });
  }

  if (isLocalOwnerSessionRuntime(request, env)) {
    return requestOriginForAuth(request);
  }

  const identity = instanceControlPlaneProductionIdentityFromRecords(
    (await readControlPlaneRecords({ env, requestUrl: request.url })) ?? [],
  );

  return configuredInstanceAuthOriginFromFacts({ productionOrigin: identity?.authOrigin });
}

export function configuredInstanceAuthOriginFromFacts(input: {
  explicitOrigin?: string;
  productionOrigin?: string;
}): string | undefined {
  return input.explicitOrigin === undefined
    ? input.productionOrigin
    : parseInstanceAuthCanonicalOrigin(input.explicitOrigin);
}

export function hostAuthSessionTargetForRuntimeRoute(
  request: Request,
  runtimeRoute: InstanceRuntimeRouteResolution | undefined,
  options: {
    effectiveAccess?: ProtectedRouteAccess;
    minimumAccess?: ProtectedRouteAccess;
  } = {},
): InstanceAuthSessionTargetBinding | undefined {
  return hostAuthSessionTargetForRuntimeRouteFacts({
    ...(options.effectiveAccess === undefined ? {} : { effectiveAccess: options.effectiveAccess }),
    minimumAccess: options.minimumAccess,
    requestOrigin: requestOriginForAuth(request),
    runtimeRoute,
  });
}

export function routeAccessTargetForRuntimeRoute(
  request: Request,
  runtimeRoute: InstanceRuntimeRouteResolution | undefined,
  options: {
    effectiveAccess?: ProtectedRouteAccess;
    minimumAccess?: ProtectedRouteAccess;
  } = {},
): InstanceAuthSessionTargetBinding | undefined {
  const mountRoute = runtimeRoute?.kind === "mount" ? runtimeRoute : undefined;
  const effectiveAccess = options.effectiveAccess ?? mountRoute?.access;

  if (
    mountRoute === undefined ||
    effectiveAccess === undefined ||
    effectiveAccess === "anonymous" ||
    (options.minimumAccess !== undefined &&
      !runtimeRouteAccessSatisfies(effectiveAccess, options.minimumAccess)) ||
    (options.effectiveAccess !== undefined &&
      runtimeRouteAccessRank(options.effectiveAccess) < runtimeRouteAccessRank(mountRoute.access))
  ) {
    return undefined;
  }

  if (mountRoute.targetProfile !== "instance" && mountRoute.targetProfile !== "public-site") {
    return undefined;
  }

  return {
    access: effectiveAccess,
    routeId: mountRoute.id,
    targetOrigin: requestOriginForAuth(request),
    targetProfile: mountRoute.targetProfile,
  };
}

export function hostAuthSessionTargetForRuntimeRouteFacts(input: {
  effectiveAccess?: ProtectedRouteAccess;
  minimumAccess?: ProtectedRouteAccess;
  requestOrigin: string;
  runtimeRoute: InstanceRuntimeRouteResolution | undefined;
}): InstanceAuthSessionTargetBinding | undefined {
  const mountRoute = input.runtimeRoute?.kind === "mount" ? input.runtimeRoute : undefined;
  const effectiveAccess = input.effectiveAccess ?? mountRoute?.access;

  if (
    mountRoute === undefined ||
    mountRoute.matchHost === undefined ||
    effectiveAccess === undefined ||
    effectiveAccess === "anonymous" ||
    (input.minimumAccess !== undefined &&
      !runtimeRouteAccessSatisfies(effectiveAccess, input.minimumAccess)) ||
    (input.effectiveAccess !== undefined &&
      runtimeRouteAccessRank(input.effectiveAccess) < runtimeRouteAccessRank(mountRoute.access))
  ) {
    return undefined;
  }

  const targetOrigin = input.requestOrigin;

  if (mountRoute.targetProfile !== "instance" && mountRoute.targetProfile !== "public-site") {
    return undefined;
  }

  return {
    access: effectiveAccess,
    routeId: mountRoute.id,
    targetOrigin,
    targetProfile: mountRoute.targetProfile,
  };
}

export function instanceAuthCallbackReservationFromFacts(input: {
  effectiveAccess?: ProtectedRouteAccess;
  pathname: string;
  requestOrigin: string;
  runtimeRoute?: InstanceRuntimeRouteResolution;
}): InstanceAuthCallbackReservation {
  if (input.pathname !== INSTANCE_AUTH_HANDOFF_CALLBACK_PATH) {
    return { kind: "not-callback" };
  }

  const target = hostAuthSessionTargetForRuntimeRouteFacts({
    ...(input.effectiveAccess === undefined ? {} : { effectiveAccess: input.effectiveAccess }),
    requestOrigin: input.requestOrigin,
    runtimeRoute: input.runtimeRoute,
  });

  return target === undefined ? { kind: "reserved" } : { kind: "reserved", target };
}

export function mappedInstanceManagementTargetFromFacts(input: {
  requestOrigin: string;
  runtimeRoute?: InstanceRuntimeRouteResolution;
}): InstanceAuthSessionTargetBinding | undefined {
  const target = hostAuthSessionTargetForRuntimeRouteFacts({
    minimumAccess: "management",
    requestOrigin: input.requestOrigin,
    runtimeRoute: input.runtimeRoute,
  });

  if (!target || target.targetProfile !== "instance") {
    return undefined;
  }

  return target;
}

export function hostAuthSessionTargetFromRequestHeaders(
  headers: Headers,
): InstanceAuthSessionTargetBinding | undefined {
  return hostAuthSessionTargetFromHeaders(headers);
}

export function setHostAuthSessionTargetHeaders(
  headers: Headers,
  target: InstanceAuthSessionTargetBinding | undefined,
): void {
  if (target === undefined) {
    headers.delete(handoffTargetHeaders.access);
    headers.delete(handoffTargetHeaders.targetOrigin);
    headers.delete(handoffTargetHeaders.routeId);
    headers.delete(handoffTargetHeaders.targetProfile);

    return;
  }

  headers.set(handoffTargetHeaders.access, target.access);
  headers.set(handoffTargetHeaders.targetOrigin, target.targetOrigin);
  headers.set(handoffTargetHeaders.routeId, target.routeId);
  headers.set(handoffTargetHeaders.targetProfile, target.targetProfile);
}

export async function validateHostAuthSessionAuthority(
  request: Request,
  env: InstanceAuthHandoffEnv,
  options: {
    now?: string;
    requiredAccess?: ProtectedRouteAccess;
    runtimeRoute?: InstanceRuntimeRouteResolution | undefined;
    target?: InstanceAuthSessionTargetBinding | undefined;
  } = {},
): Promise<HostAuthSessionAuthorityValidationResult> {
  const requiredAccess = options.requiredAccess ?? "owner";
  const target =
    options.target ??
    (options.runtimeRoute === undefined
      ? undefined
      : hostAuthSessionTargetForRuntimeRoute(request, options.runtimeRoute, {
          minimumAccess: requiredAccess,
        }));

  return validateHostAuthSessionRequirement(request, env, {
    now: options.now,
    requiredAccess,
    target,
  });
}

export async function validateHostAuthSessionAuthorityInStorage(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceAuthHandoffEnv,
  options: {
    now?: string;
    target?: InstanceAuthSessionTargetBinding | undefined;
  } = {},
): Promise<HostAuthSessionAuthorityValidationResult> {
  return validateHostAuthSessionRequirement(request, env, {
    now: options.now,
    requiredAccess: options.target?.access ?? "owner",
    storage,
    target: options.target,
  });
}

export async function validateHostAuthSessionManagementAuthority(
  request: Request,
  env: InstanceAuthHandoffEnv,
  options: {
    now?: string;
    runtimeRoute?: InstanceRuntimeRouteResolution | undefined;
    target?: InstanceAuthSessionTargetBinding | undefined;
  } = {},
): Promise<HostAuthSessionAuthorityValidationResult> {
  const target =
    options.target ??
    (options.runtimeRoute === undefined
      ? undefined
      : hostAuthSessionTargetForRuntimeRoute(request, options.runtimeRoute));

  return validateHostAuthSessionRequirement(request, env, {
    now: options.now,
    requiredAccess: "management",
    target,
  });
}

export async function validateCentralAuthSessionAuthority(
  request: Request,
  env: InstanceAuthHandoffEnv,
  options: {
    now?: string;
  } = {},
): Promise<CentralAuthSessionAuthorityValidationResult> {
  return validateCentralAuthSessionRequirement(request, env, {
    now: options.now,
    requiredAccess: "owner",
  });
}

export async function validateCentralAuthSessionPrincipal(
  request: Request,
  env: InstanceAuthHandoffEnv,
  options: {
    accountCompletionTarget?: AccountCompletionGateTarget;
    now?: string;
  } = {},
): Promise<CentralAuthSessionAuthorityValidationResult> {
  return validateCentralAuthSessionRequirement(request, env, {
    accountCompletionTarget: options.accountCompletionTarget,
    now: options.now,
    requiredAccess: "authenticated",
  });
}

export async function validateCentralAuthSessionManagementAuthority(
  request: Request,
  env: InstanceAuthHandoffEnv,
  options: {
    now?: string;
  } = {},
): Promise<CentralAuthSessionAuthorityValidationResult> {
  return validateCentralAuthSessionRequirement(request, env, {
    now: options.now,
    requiredAccess: "management",
  });
}

async function validateCentralAuthSessionRequirement(
  request: Request,
  env: InstanceAuthHandoffEnv,
  options: {
    accountCompletionTarget?: AccountCompletionGateTarget;
    now?: string;
    requiredAccess: CentralSessionAuthorityRequirement;
  },
): Promise<CentralAuthSessionAuthorityValidationResult> {
  const result = await validateCentralInstanceAuthAccess(
    {
      ...(options.accountCompletionTarget === undefined
        ? {}
        : { accountCompletionTarget: options.accountCompletionTarget }),
      requiredAuthority: options.requiredAccess,
    },
    instanceAuthAccessReaders(request, env, { now: options.now }),
  );

  if (!result.ok) {
    return {
      ...result,
      reason: result.reason as CentralAuthSessionAuthorityValidationFailureReason,
    };
  }

  return result;
}

async function validateAuthOriginSession(
  request: Request,
  env: InstanceAuthHandoffEnv,
  requiredAccess: ProtectedRouteAccess,
  options: {
    accountCompletionTarget?: AccountCompletionGateTarget;
    now?: string;
    programScreenAccess?: ScreenAccessRequirement;
    target?: InstanceAuthSessionTargetBinding;
  } = {},
): Promise<
  | {
      ok: true;
      ownerAuthorized: boolean;
      session: CentralAuthSession | OwnerSession;
    }
  | Extract<InstanceAuthAccessResult, { ok: false }>
> {
  const result = await resolveInstanceAuthAccess(
    {
      ...(options.accountCompletionTarget === undefined
        ? {}
        : { accountCompletionTarget: options.accountCompletionTarget }),
      localOwnerSessionFallbackAllowed: isLocalOwnerSessionRuntime(request, env),
      ...(options.programScreenAccess === undefined
        ? {}
        : { programScreenAccess: options.programScreenAccess }),
      requiredAuthority: requiredAccess,
      ...(options.target === undefined ? {} : { target: options.target }),
    },
    instanceAuthAccessReaders(request, env, { now: options.now }),
  );

  return result.ok
    ? {
        ok: true,
        ownerAuthorized: result.ownerAuthorized,
        session: result.session as CentralAuthSession | OwnerSession,
      }
    : result;
}

async function validateHostAuthSessionRequirement(
  request: Request,
  env: InstanceAuthHandoffEnv,
  options: {
    now?: string;
    requiredAccess: HostSessionAuthorityRequirement;
    storage?: DurableObjectStorage;
    target?: InstanceAuthSessionTargetBinding | undefined;
  },
): Promise<HostAuthSessionAuthorityValidationResult> {
  const { requiredAccess, target } = options;

  if (!target) {
    return { ok: false, reason: "missing-target" };
  }

  const requiredAuthority = requiredAccess;
  const result = await validateHostInstanceAuthAccess(
    {
      ...(requiredAuthority === "authenticated"
        ? { accountCompletionTarget: accountCompletionTargetForRouteRequest(request, target) }
        : {}),
      requiredAuthority,
      target,
    },
    instanceAuthAccessReaders(request, env, {
      now: options.now,
      storage: options.storage,
    }),
  );

  if (!result.ok) {
    return {
      ...result,
      reason: result.reason as HostAuthSessionValidationFailureReason,
    };
  }

  return result;
}

export type InstanceAuthAccessReaderOverrides = Partial<
  Pick<
    InstanceAuthAccessReaders,
    "readActivePrincipal" | "readManagementAuthority" | "readOwnerAuthority"
  >
>;

export async function validateInstanceAuthAccessSession(
  request: Request,
  env: InstanceAuthAccessEnv,
  options: {
    accountCompletionTarget?: AccountCompletionGateTarget;
    now?: string;
    programScreenAccess?: ScreenAccessRequirement;
    readers?: InstanceAuthAccessReaderOverrides;
    requiredAuthority: InstanceAuthAuthorityRequirement;
    storage?: DurableObjectStorage;
    target?: InstanceAuthSessionTargetBinding | undefined;
  },
): Promise<RouteAccessSessionValidationResult> {
  return resolveInstanceAuthAccess(
    {
      ...(options.accountCompletionTarget === undefined
        ? {}
        : { accountCompletionTarget: options.accountCompletionTarget }),
      localOwnerSessionFallbackAllowed: isLocalOwnerSessionRuntime(request, env),
      ...(options.programScreenAccess === undefined
        ? {}
        : { programScreenAccess: options.programScreenAccess }),
      requiredAuthority: options.requiredAuthority,
      ...(options.target === undefined ? {} : { target: options.target }),
    },
    instanceAuthAccessReaders(request, env, {
      now: options.now,
      readers: options.readers,
      storage: options.storage,
    }),
  );
}

export type InstanceAuthAccessBinding = {
  principalId: string;
  session: InstanceAuthSession;
  via: InstanceAuthSessionKind;
};

export function bindInstanceAuthAccessSession(
  access: Extract<RouteAccessSessionValidationResult, { ok: true }>,
): InstanceAuthAccessBinding {
  return {
    principalId: access.principalId,
    session: access.session,
    via: access.via,
  };
}

export async function validateBoundInstanceAuthAccessSession(
  value: unknown,
  env: InstanceAuthAccessEnv,
  options: {
    now?: string;
  },
): Promise<boolean> {
  return validateBoundInstanceAuthAuthoritySession(value, env, {
    now: options.now,
    requiredAuthority: "owner",
  });
}

export async function validateBoundInstanceManagementAccessSession(
  value: unknown,
  env: InstanceAuthAccessEnv,
  options: {
    now?: string;
  },
): Promise<boolean> {
  return validateBoundInstanceAuthAuthoritySession(value, env, {
    now: options.now,
    requiredAuthority: "management",
  });
}

export async function validateBoundProgramAccessSession(
  value: unknown,
  env: InstanceAuthAccessEnv,
  options: {
    access: AccessRequirement;
    now?: string;
    schema: AppSchema;
  },
): Promise<boolean> {
  const binding = parseInstanceAuthAccessBinding(value);

  if (
    !binding ||
    !(await validateBoundInstanceAuthAuthoritySession(binding, env, {
      now: options.now,
      requiredAuthority: "authenticated",
    }))
  ) {
    return false;
  }

  const authority = await readInternalIdentityAuthorityForPrincipal(env, binding.principalId);

  return (
    authority?.id === binding.principalId &&
    evaluateAccessRequirement(options.access, authority.callerFacts, options.schema)
  );
}

async function validateBoundInstanceAuthAuthoritySession(
  value: unknown,
  env: InstanceAuthAccessEnv,
  options: {
    now?: string;
    requiredAuthority: "authenticated" | "management" | "owner";
  },
): Promise<boolean> {
  const binding = parseInstanceAuthAccessBinding(value);

  if (!binding) {
    return false;
  }

  const target =
    binding.via === "host-session"
      ? hostAuthSessionTargetFromSession(binding.session as HostAuthSession)
      : undefined;

  if (target !== undefined && !boundTargetMatchesAuthority(target, options.requiredAuthority)) {
    return false;
  }

  const readers: InstanceAuthAccessReaders = {
    readAccountCompletion: () =>
      Promise.reject(new Error("Bound push sessions do not resolve account completion.")),
    readActivePrincipal: (session) => readInternalActiveIdentityPrincipal(env, session.principalId),
    readCentralSession: async () => {
      if (binding.via !== "central-session") {
        return {
          ok: false,
          ownerSessionFallbackAllowed: binding.via === "owner-session",
          reason: "missing-session",
        };
      }

      const session = await readBoundCentralSessionFromRuntime(
        env,
        binding.session as CentralAuthSession,
        options.now,
      );

      return session
        ? { ok: true, ownerSessionFallbackAllowed: false, session }
        : {
            ok: false,
            ownerSessionFallbackAllowed: false,
            reason: "revoked-session",
          };
    },
    readHostSession: async (expectedTarget) => {
      if (
        binding.via !== "host-session" ||
        target === undefined ||
        !hostAuthSessionTargetBindingsEqual(target, expectedTarget) ||
        !sessionIsCurrent(binding.session, options.now)
      ) {
        return { ok: false, reason: "wrong-target" };
      }

      return { ok: true, session: binding.session as HostAuthSession };
    },
    readHostSessionVersion: (session) =>
      env.FORMLESS_AUTHORITY === undefined
        ? Promise.reject(new Error("Instance auth storage is unavailable."))
        : readHostSessionVersionFromRuntime(
            new Request("http://internal"),
            env as InstanceAuthHandoffEnv,
            session,
          ),
    readLocalOwnerSession: async () =>
      binding.via === "owner-session" && sessionIsCurrent(binding.session, options.now)
        ? { ok: true, session: binding.session as OwnerSession }
        : { ok: false, reason: "expired" },
    readManagementAuthority: (session) =>
      readInternalIdentityAuthorityForPrincipal(env, session.principalId),
    readOwnerAuthority: (session) =>
      readInternalIdentityOwnerForPrincipal(env, session.principalId),
  };
  const result = await resolveInstanceAuthAccess(
    {
      localOwnerSessionFallbackAllowed: binding.via === "owner-session",
      requiredAuthority: options.requiredAuthority,
      ...(target === undefined ? {} : { target }),
    },
    readers,
  );

  return result.ok && result.principalId === binding.principalId && result.via === binding.via;
}

function boundTargetMatchesAuthority(
  target: InstanceAuthSessionTargetBinding,
  requiredAuthority: "authenticated" | "management" | "owner",
): boolean {
  if (target.targetProfile !== "instance") {
    return false;
  }

  return (
    requiredAuthority === "authenticated" ||
    target.access === "management" ||
    target.access === "owner"
  );
}

export async function validateRouteAccessSession(
  request: Request,
  env: InstanceAuthHandoffEnv,
  options: {
    now?: string;
    programScreenAccess?: ScreenAccessRequirement;
    requiredAccess: ProtectedRouteAccess;
    runtimeRoute?: InstanceRuntimeRouteResolution | undefined;
    target?: InstanceAuthSessionTargetBinding | undefined;
  },
): Promise<RouteAccessSessionValidationResult> {
  const target =
    options.target ??
    (options.runtimeRoute === undefined
      ? undefined
      : routeAccessTargetForRuntimeRoute(request, options.runtimeRoute, {
          ...(options.programScreenAccess === undefined
            ? {}
            : { effectiveAccess: options.requiredAccess }),
          minimumAccess: options.requiredAccess,
        }));
  const requiredAuthority = options.requiredAccess;

  return validateInstanceAuthAccessSession(request, env, {
    ...(requiredAuthority === "authenticated" && target !== undefined
      ? { accountCompletionTarget: accountCompletionTargetForRouteRequest(request, target) }
      : {}),
    now: options.now,
    ...(options.programScreenAccess === undefined
      ? {}
      : { programScreenAccess: options.programScreenAccess }),
    requiredAuthority,
    target,
  });
}

export function accountCompletionBlockedResponse(
  result: AccountCompletionGateResolutionResult,
): Response {
  return jsonResponse(parseAccountCompletionGateResolutionResult(result), 409);
}

export function accountAuthorizationForbiddenResponse(
  result: AccountAuthorizationForbiddenResult,
): Response {
  return jsonResponse(parseAuthAccountStatusResult(result), 403);
}

export function accountAuthorizationForbiddenResult(
  principal: ActiveIdentityPrincipal,
): AccountAuthorizationForbiddenResult {
  return {
    principal: {
      displayName: principal.displayName,
      ...(principal.email === undefined ? {} : { email: principal.email }),
      principalId: principal.id,
    },
    status: "forbidden",
  };
}

export function authenticatedOperationActorForSession(session: {
  principalId: string;
  session: Pick<CentralAuthSession | HostAuthSession | OwnerSession, "instanceId">;
  target?: InstanceAuthSessionTargetBinding;
}) {
  return authenticatedOperationActorForAccess({
    principalId: session.principalId,
    session: session.session as InstanceAuthSession,
    target: session.target,
  });
}

function instanceAuthAccessReaders(
  request: Request,
  env: InstanceAuthAccessEnv,
  options: {
    now?: string;
    readers?: InstanceAuthAccessReaderOverrides;
    storage?: DurableObjectStorage;
  } = {},
): InstanceAuthAccessReaders {
  const readers: InstanceAuthAccessReaders = {
    readAccountCompletion: async (session, target) =>
      options.storage !== undefined
        ? resolveAccountCompletionGate({
            env,
            input: {
              actorKind: "authenticated",
              principalId: session.principalId,
              target,
            },
            storage: options.storage,
          })
        : env.FORMLESS_AUTHORITY === undefined
          ? Promise.reject(new Error("Instance auth storage is unavailable."))
          : resolveAccountCompletionForTarget(
              request,
              env as InstanceAuthHandoffEnv,
              session.principalId,
              target,
            ),
    readActivePrincipal: (session) => readInternalActiveIdentityPrincipal(env, session.principalId),
    readCentralSession: async () => {
      if (options.storage === undefined) {
        return env.FORMLESS_AUTHORITY === undefined
          ? {
              ok: false,
              ownerSessionFallbackAllowed: false,
              reason: "missing-auth-origin",
            }
          : readCentralSessionFromRuntime(request, env as InstanceAuthHandoffEnv, options.now);
      }

      const ownerSessionFallbackAllowed = readInstanceAuthConfig(options.storage) === undefined;
      const session = await validateCentralAuthSessionState(request, options.storage, env, {
        now: options.now,
      });

      return { ...session, ownerSessionFallbackAllowed };
    },
    readHostSession: (target) =>
      env.FORMLESS_AUTHORITY === undefined
        ? Promise.resolve({ ok: false as const, reason: "missing-principal" as const })
        : validateHostAuthSessionCookie(request, env as InstanceAuthHandoffEnv, {
            now: options.now,
            target,
          }),
    readHostSessionVersion: (session) =>
      options.storage !== undefined
        ? Promise.resolve(
            readHostSessionRevocationVersion(options.storage, session)?.sessionVersion ?? 0,
          )
        : env.FORMLESS_AUTHORITY === undefined
          ? Promise.reject(new Error("Instance auth storage is unavailable."))
          : readHostSessionVersionFromRuntime(request, env as InstanceAuthHandoffEnv, session),
    readLocalOwnerSession: () => validateOwnerSessionCookie(request, env, { now: options.now }),
    readManagementAuthority: (session) =>
      readInternalIdentityAuthorityForPrincipal(env, session.principalId),
    readOwnerAuthority: (session) =>
      readInternalIdentityOwnerForPrincipal(env, session.principalId),
  };

  return { ...readers, ...options.readers };
}

async function readCentralSessionFromRuntime(
  request: Request,
  env: InstanceAuthHandoffEnv,
  now?: string,
): ReturnType<InstanceAuthAccessReaders["readCentralSession"]> {
  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);
  const headers = new Headers(request.headers);

  headers.delete("Connection");
  headers.delete("Sec-WebSocket-Extensions");
  headers.delete("Sec-WebSocket-Key");
  headers.delete("Sec-WebSocket-Protocol");
  headers.delete("Sec-WebSocket-Version");
  headers.delete("Upgrade");

  const response = await env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(new URL(instanceAuthCentralSessionValidatePath, request.url), {
      body: JSON.stringify(now === undefined ? {} : { now }),
      headers,
      method: "POST",
    }),
  );
  const body = (await response.json()) as {
    ownerSessionFallbackAllowed?: boolean;
    reason?: CentralAuthSessionValidationFailureReason;
    session?: CentralAuthSession;
    validated?: boolean;
  };
  const ownerSessionFallbackAllowed = body.ownerSessionFallbackAllowed === true;

  if (!response.ok || body.validated !== true || body.session === undefined) {
    return {
      ok: false,
      ownerSessionFallbackAllowed,
      reason: body.reason ?? "missing-session",
    };
  }

  return {
    ok: true,
    ownerSessionFallbackAllowed,
    session: parseCentralAuthSessionBody(body.session),
  };
}

async function readHostSessionVersionFromRuntime(
  request: Request,
  env: InstanceAuthHandoffEnv,
  session: HostAuthSession,
): Promise<number> {
  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);
  const response = await env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(new URL(instanceAuthHostSessionValidatePath, request.url), {
      body: JSON.stringify({ session }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
  const body = (await response.json()) as { sessionVersion?: unknown };

  if (!response.ok || !Number.isInteger(body.sessionVersion) || Number(body.sessionVersion) < 0) {
    throw new Error("Host session revocation version lookup failed.");
  }

  return Number(body.sessionVersion);
}

async function resolveAccountCompletionForTarget(
  request: Request,
  env: InstanceAuthHandoffEnv,
  principalId: string,
  target: AccountCompletionGateTarget,
): Promise<AccountCompletionGateResolutionResult> {
  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);
  const response = await env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(new URL(INSTANCE_AUTH_ACCOUNT_COMPLETION_RESOLVE_PATH, request.url), {
      body: JSON.stringify({ actorKind: "authenticated", principalId, target }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
  const body = await response.json();

  if (!response.ok) {
    throw new Error(accountCompletionResolutionErrorMessage(body));
  }

  return parseAccountCompletionGateResolutionResult(body);
}

function accountCompletionTargetForHandoffTarget(
  target: Omit<
    CreateHandoffGrantInput,
    "expiresAt" | "grantSecretHash" | "instanceId" | "principalId"
  >,
): AccountCompletionGateTarget {
  const returnTo = parseAccountRedirectTarget(target.returnTo);

  if (!returnTo) {
    throw new Error("Account completion handoff return target must be path-only.");
  }

  return {
    access: target.access,
    returnTo,
    routeId: target.routeId,
    targetOrigin: target.targetOrigin,
    targetProfile: target.targetProfile,
  };
}

function accountCompletionTargetForRouteRequest(
  request: Request,
  target: InstanceAuthSessionTargetBinding,
): AccountCompletionGateTarget {
  const url = new URL(request.url);
  const returnTo = parseAccountRedirectTarget(`${url.pathname}${url.search}`);

  if (!returnTo) {
    throw new Error("Account completion return target must be path-only.");
  }

  return {
    access: target.access,
    returnTo,
    routeId: target.routeId,
    targetOrigin: target.targetOrigin,
    targetProfile: target.targetProfile,
  };
}

function completeAccountContinuationResult(
  target: AccountCompletionGateTarget,
): Extract<AccountCompletionGateResolutionResult, { status: "complete" }> {
  return {
    continueTo: target.returnTo,
    status: "complete",
    target,
  };
}

function authAccountRedirectTargetForRequest(request: Request) {
  const url = new URL(request.url);

  url.pathname = runtimeTopologyRoutes.authAccountRoute;

  return (
    parseAccountRedirectTarget(`${url.pathname}${url.search}`) ??
    runtimeTopologyRoutes.authAccountRoute
  );
}

function handoffStartRedirectTargetForAuthAccountRequest(request: Request) {
  const url = new URL(request.url);

  url.pathname = INSTANCE_AUTH_HANDOFF_START_PATH;

  return (
    parseAccountRedirectTarget(`${url.pathname}${url.search}`) ?? INSTANCE_AUTH_HANDOFF_START_PATH
  );
}

function accountCompletionResolutionErrorMessage(value: unknown): string {
  return isRecord(value) && typeof value.error === "string"
    ? value.error
    : "Account completion gate resolution failed.";
}

async function handleHandoffCallbackDurableObjectRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceAuthHandoffEnv,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "GET, HEAD" });
  }

  try {
    const url = new URL(request.url);
    const target = handoffTargetBindingFromHeaders(request.headers);
    const nonce = requestCookie(request, HOST_AUTH_NONCE_COOKIE_NAME);

    if (!nonce) {
      return jsonResponse({ error: "Handoff callback is invalid." }, 400);
    }

    const consumed = consumeHandoffGrant(storage, {
      grantId: base64UrlSearchParam(url, "grantId"),
      grantSecretHash: await sha256Base64Url(base64UrlSearchParam(url, "grantSecret")),
      nonceHash: await sha256Base64Url(nonce),
      state: base64UrlSearchParam(url, "state"),
      target,
    });

    if (!consumed.ok) {
      return jsonResponse({ error: "Handoff callback is invalid." }, 400);
    }

    const hostSession = await createHostAuthSessionCookie(storage, env, consumed.grant);
    const responseHeaders = new Headers();

    responseHeaders.set("Cache-Control", "no-store");
    responseHeaders.set("Location", consumed.grant.returnTo);
    responseHeaders.append("Set-Cookie", hostSession.cookie);
    responseHeaders.append("Set-Cookie", clearHostAuthNonceCookie(consumed.grant.targetOrigin));

    return new Response(null, {
      headers: responseHeaders,
      status: 302,
    });
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, 400);
  }
}

async function handleHostAuthSessionValidationDurableObjectRequest(
  request: Request,
  storage: DurableObjectStorage,
  _env: InstanceAuthHandoffEnv,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "POST" });
  }

  try {
    const body = (await request.json()) as { session?: unknown };
    const session = parseHostAuthSession(body.session);

    if (!session) {
      return jsonResponse({ error: "Host session payload is malformed." }, 400);
    }

    const currentVersion = readHostSessionRevocationVersion(storage, session);

    return jsonResponse({ sessionVersion: currentVersion?.sessionVersion ?? 0 });
  } catch {
    return jsonResponse({ error: "Host session payload is malformed." }, 400);
  }
}

async function handleCentralAuthSessionValidationDurableObjectRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceAuthHandoffEnv,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "POST" });
  }

  const ownerSessionFallbackAllowed = readInstanceAuthConfig(storage) === undefined;

  try {
    const body = (await request.json()) as { now?: unknown };
    const session = await validateCentralAuthSessionState(request, storage, env, {
      now: typeof body.now === "string" ? body.now : undefined,
    });

    if (!session.ok) {
      return jsonResponse(
        {
          ownerSessionFallbackAllowed,
          reason: session.reason,
        },
        401,
      );
    }

    return jsonResponse({
      ownerSessionFallbackAllowed,
      session: session.session,
      validated: true,
    });
  } catch {
    return jsonResponse(
      {
        ownerSessionFallbackAllowed,
        reason: "malformed-payload",
      },
      400,
    );
  }
}

async function handleBoundCentralAuthSessionValidationDurableObjectRequest(
  request: Request,
  storage: DurableObjectStorage,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "POST" });
  }

  try {
    const body = (await request.json()) as { now?: unknown; session?: unknown };
    const result = validateCentralAuthSessionBinding(storage, body.session, {
      now: typeof body.now === "string" ? body.now : undefined,
    });

    return result.ok
      ? jsonResponse({ session: result.session, validated: true })
      : jsonResponse({ reason: result.reason }, 401);
  } catch {
    return jsonResponse({ reason: "malformed-payload" }, 400);
  }
}

async function validateHostAuthSessionCookie(
  request: Request,
  env: InstanceAuthHandoffEnv,
  options: { now?: string; target: InstanceAuthSessionTargetBinding },
): Promise<HostAuthSessionAuthorityValidationResult> {
  const value = requestCookie(request, HOST_AUTH_SESSION_COOKIE_NAME);

  if (!value) {
    return { ok: false, reason: "missing-cookie" };
  }

  const secret = ownerSessionSigningSecret(env);

  if (!secret) {
    return { ok: false, reason: "missing-secret" };
  }

  const parts = value.split(".");

  if (parts.length !== 2 || parts[0] === "" || parts[1] === "") {
    return { ok: false, reason: "malformed-cookie" };
  }

  const [payloadPart, signature] = parts;
  const expectedSignature = await signString(payloadPart, secret);

  if (!constantTimeEqual(signature, expectedSignature)) {
    return { ok: false, reason: "tampered-cookie" };
  }

  const payload = parseHostAuthSessionPayload(payloadPart);

  if (!payload) {
    return { ok: false, reason: "malformed-payload" };
  }

  if (payload.purpose !== hostSessionPurpose) {
    return { ok: false, reason: "wrong-purpose" };
  }

  const instanceId = await hostAuthSessionInstanceId(request, env);

  if (
    parseTimestampMs("Host auth session expiresAt", payload.expiresAt) <=
    parseTimestampMs("Host auth session validation time", options.now ?? nowIsoString())
  ) {
    return { ok: false, reason: "expired" };
  }

  const scopeFailure = validateHostSessionScope(payload, {
    instanceId,
    requestOrigin: requestOriginForAuth(request),
    target: options.target,
  });

  if (scopeFailure !== undefined) {
    return { ok: false, reason: scopeFailure };
  }

  return {
    ok: true,
    session: {
      access: payload.access,
      expiresAt: payload.expiresAt,
      instanceId: payload.instanceId,
      issuedAt: payload.issuedAt,
      principalId: payload.principalId,
      routeId: payload.routeId,
      sessionVersion: payload.sessionVersion,
      targetOrigin: payload.targetOrigin,
      targetProfile: payload.targetProfile,
    },
  };
}

function handoffStartTargetFromSearch(
  url: URL,
): Omit<CreateHandoffGrantInput, "expiresAt" | "grantSecretHash" | "instanceId" | "principalId"> {
  const returnTo = parseAccountRedirectTarget(requiredSearchParam(url, "returnTo"));

  if (!returnTo) {
    throw new Error("Handoff return target must be path-only.");
  }

  return {
    access: handoffTargetAccessValue(requiredSearchParam(url, "access")),
    nonceHash: base64UrlSearchParam(url, "nonceHash"),
    returnTo,
    routeId: requiredSearchParam(url, "routeId"),
    state: base64UrlSearchParam(url, "state"),
    targetOrigin: parseInstanceAuthCanonicalOrigin(requiredSearchParam(url, "targetOrigin")),
    targetProfile: handoffTargetProfileSearchParam(url),
  };
}

async function verifiedHandoffStartTargetFromSearch(
  request: Request,
  env: InstanceAuthHandoffEnv,
  url: URL,
): Promise<
  Omit<CreateHandoffGrantInput, "expiresAt" | "grantSecretHash" | "instanceId" | "principalId"> & {
    programScreenAccess?: ScreenAccessRequirement;
    requiredAccess: ProtectedRouteAccess;
  }
> {
  const target = handoffStartTargetFromSearch(url);
  const route = await runtimeRouteForHandoffTarget(request, env, target);

  if (!route) {
    throw new Error("Handoff target route is not protected.");
  }

  const targetUrl = new URL(target.returnTo, target.targetOrigin);
  const programScreen = resolveProgramScreenRouteTargetFromFacts({
    runtimeRoute: route,
    topology: {
      pathname: targetUrl.pathname,
      profileKind: route.targetProfile === "instance" ? "instance" : "publishedSite",
    },
  });
  const requiredAccess = programScreen?.requiredAccess ?? route.access;

  if (requiredAccess === "anonymous") {
    throw new Error("Handoff target route is not protected.");
  }

  const routeTarget = hostAuthSessionTargetForRuntimeRoute(
    new Request(targetUrl.toString()),
    route,
    {
      ...(programScreen === undefined ? {} : { effectiveAccess: requiredAccess }),
      minimumAccess: "authenticated",
    },
  );

  if (!routeTarget || !hostAuthSessionTargetBindingsEqual(routeTarget, target)) {
    throw new Error("Handoff target route does not match.");
  }

  return {
    ...target,
    ...(programScreen === undefined ? {} : { programScreenAccess: programScreen.access }),
    requiredAccess,
  };
}

async function runtimeRouteForHandoffTarget(
  request: Request,
  env: InstanceAuthHandoffEnv,
  target: InstanceAuthSessionTargetBinding & { returnTo: string },
): Promise<InstanceRuntimeMountRouteResolution | undefined> {
  const records = (await readControlPlaneRecords({ env, requestUrl: request.url })) ?? [];
  const targetUrl = new URL(target.returnTo, target.targetOrigin);
  const route = resolveInstanceRuntimeRouteFromRecords({
    records,
    request: {
      host: targetUrl.hostname,
      pathname: targetUrl.pathname,
      search: targetUrl.search,
    },
    options: { includeHostless: false },
  });

  return route?.kind === "mount" && route.id === target.routeId ? route : undefined;
}

async function issueHandoffGrantRedirect(
  storage: DurableObjectStorage,
  target: Omit<
    CreateHandoffGrantInput,
    "expiresAt" | "grantSecretHash" | "instanceId" | "principalId"
  >,
  owner: { instanceId: string; principalId: string },
): Promise<Response> {
  const createdAt = nowIsoString();
  const expiresAt = new Date(Date.parse(createdAt) + handoffGrantTtlMs).toISOString();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const grantSecret = randomBase64Url(32);
    const grant = createHandoffGrant(storage, {
      ...target,
      createdAt,
      expiresAt,
      grantId: randomBase64Url(24),
      grantSecretHash: await sha256Base64Url(grantSecret),
      instanceId: owner.instanceId,
      principalId: owner.principalId,
    });

    if (grant.ok) {
      const location = new URL(INSTANCE_AUTH_HANDOFF_CALLBACK_PATH, grant.grant.targetOrigin);

      location.searchParams.set("access", grant.grant.access);
      location.searchParams.set("grantId", grant.grant.grantId);
      location.searchParams.set("grantSecret", grantSecret);
      location.searchParams.set("state", grant.grant.state);

      return redirectResponse(location.toString(), 302);
    }
  }

  return jsonResponse({ error: "Handoff grant could not be issued." }, 409);
}

async function createHostAuthSessionCookie(
  storage: DurableObjectStorage,
  env: InstanceAuthHandoffEnv,
  grant: StoredHandoffGrant,
): Promise<{ cookie: string; session: HostAuthSession }> {
  const secret = ownerSessionSigningSecret(env);

  if (!secret) {
    throw new Error("Host auth session signing secret is not configured.");
  }

  const issuedAt = nowIsoString();
  const expiresAt = new Date(Date.parse(issuedAt) + hostSessionMaxAgeSeconds * 1000).toISOString();
  const revocationVersion = readHostSessionRevocationVersion(storage, {
    access: grant.access,
    instanceId: grant.instanceId,
    principalId: grant.principalId,
    routeId: grant.routeId,
    targetOrigin: grant.targetOrigin,
    targetProfile: grant.targetProfile,
  });
  const session: HostAuthSession = {
    access: grant.access,
    expiresAt,
    instanceId: grant.instanceId,
    issuedAt,
    principalId: grant.principalId,
    routeId: grant.routeId,
    sessionVersion: revocationVersion?.sessionVersion ?? 0,
    targetOrigin: grant.targetOrigin,
    targetProfile: grant.targetProfile,
  };
  const payload: HostAuthSessionPayload = {
    ...session,
    purpose: hostSessionPurpose,
    version: hostSessionVersion,
  };
  const value = await signHostAuthSessionPayload(payload, secret);

  return {
    cookie: serializeHostAuthSessionCookie(grant.targetOrigin, value, expiresAt),
    session,
  };
}

function serializeHostAuthNonceCookie(targetOrigin: string, nonce: string): string {
  const parts = [
    `${HOST_AUTH_NONCE_COOKIE_NAME}=${nonce}`,
    "Path=/",
    `Max-Age=${hostNonceMaxAgeSeconds}`,
    `Expires=${new Date(Date.now() + hostNonceMaxAgeSeconds * 1000).toUTCString()}`,
    "HttpOnly",
    "SameSite=Lax",
  ];

  if (new URL(targetOrigin).protocol === "https:") {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function clearHostAuthNonceCookie(targetOrigin: string): string {
  const parts = [
    `${HOST_AUTH_NONCE_COOKIE_NAME}=`,
    "Path=/",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "HttpOnly",
    "SameSite=Lax",
  ];

  if (new URL(targetOrigin).protocol === "https:") {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function clearHostAuthSessionCookie(targetOrigin: string): string {
  const parts = [
    `${HOST_AUTH_SESSION_COOKIE_NAME}=`,
    "Path=/",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "HttpOnly",
    "SameSite=Lax",
  ];

  if (new URL(targetOrigin).protocol === "https:") {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function serializeHostAuthSessionCookie(
  targetOrigin: string,
  value: string,
  expiresAt: string,
): string {
  const parts = [
    `${HOST_AUTH_SESSION_COOKIE_NAME}=${value}`,
    "Path=/",
    `Max-Age=${hostSessionMaxAgeSeconds}`,
    `Expires=${new Date(expiresAt).toUTCString()}`,
    "HttpOnly",
    "SameSite=Lax",
  ];

  if (new URL(targetOrigin).protocol === "https:") {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function requestWithHandoffTargetHeaders(
  request: Request,
  target: InstanceAuthSessionTargetBinding,
): Request {
  const headers = new Headers(request.headers);

  setHostAuthSessionTargetHeaders(headers, target);

  return new Request(request, { headers });
}

function handoffTargetBindingFromHeaders(headers: Headers): InstanceAuthSessionTargetBinding {
  return {
    access: handoffTargetAccessValue(requiredHeader(headers, handoffTargetHeaders.access)),
    routeId: requiredHeader(headers, handoffTargetHeaders.routeId),
    targetOrigin: parseInstanceAuthCanonicalOrigin(
      requiredHeader(headers, handoffTargetHeaders.targetOrigin),
    ),
    targetProfile: handoffTargetProfileValue(
      requiredHeader(headers, handoffTargetHeaders.targetProfile),
    ),
  };
}

function hostAuthSessionTargetFromHeaders(
  headers: Headers,
): InstanceAuthSessionTargetBinding | undefined {
  try {
    return handoffTargetBindingFromHeaders(headers);
  } catch {
    return undefined;
  }
}

function parseHostAuthSessionPayload(payloadPart: string): HostAuthSessionPayload | undefined {
  try {
    const parsed = JSON.parse(base64UrlDecodeUtf8(payloadPart)) as unknown;
    const session = parseHostAuthSession(parsed);

    if (!session || !isRecord(parsed) || parsed.purpose !== hostSessionPurpose) {
      return undefined;
    }

    if (parsed.version !== hostSessionVersion) {
      return undefined;
    }

    return {
      ...session,
      purpose: hostSessionPurpose,
      version: hostSessionVersion,
    };
  } catch {
    return undefined;
  }
}

function parseHostAuthSession(value: unknown): HostAuthSession | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const sessionVersion = parseNonNegativeIntegerValue(value.sessionVersion);
  const access = typeof value.access === "string" ? handoffTargetAccessValue(value.access) : null;
  const targetProfile =
    typeof value.targetProfile === "string" ? handoffTargetProfileValue(value.targetProfile) : null;

  if (
    typeof value.instanceId !== "string" ||
    value.instanceId.trim() === "" ||
    typeof value.principalId !== "string" ||
    value.principalId.trim() === "" ||
    typeof value.issuedAt !== "string" ||
    value.issuedAt.trim() === "" ||
    typeof value.expiresAt !== "string" ||
    value.expiresAt.trim() === "" ||
    typeof value.routeId !== "string" ||
    value.routeId.trim() === "" ||
    typeof value.targetOrigin !== "string" ||
    value.targetOrigin.trim() === "" ||
    !isTimestamp(value.issuedAt) ||
    !isTimestamp(value.expiresAt) ||
    sessionVersion === undefined ||
    access === null ||
    targetProfile === null
  ) {
    return undefined;
  }

  return {
    access,
    expiresAt: value.expiresAt,
    instanceId: value.instanceId.trim(),
    issuedAt: value.issuedAt,
    principalId: value.principalId.trim(),
    routeId: value.routeId.trim(),
    sessionVersion,
    targetOrigin: parseInstanceAuthCanonicalOrigin(value.targetOrigin),
    targetProfile,
  };
}

function parseCentralAuthSessionBody(value: unknown): CentralAuthSession {
  if (
    !isRecord(value) ||
    typeof value.instanceId !== "string" ||
    value.instanceId.trim() === "" ||
    typeof value.principalId !== "string" ||
    value.principalId.trim() === "" ||
    typeof value.issuedAt !== "string" ||
    value.issuedAt.trim() === "" ||
    typeof value.expiresAt !== "string" ||
    value.expiresAt.trim() === "" ||
    typeof value.sessionIdHash !== "string" ||
    value.sessionIdHash.trim() === "" ||
    !isTimestamp(value.issuedAt) ||
    !isTimestamp(value.expiresAt)
  ) {
    throw new Error("Central auth session validation response is malformed.");
  }

  return {
    expiresAt: value.expiresAt,
    instanceId: value.instanceId.trim(),
    issuedAt: value.issuedAt,
    principalId: value.principalId.trim(),
    sessionIdHash: value.sessionIdHash.trim(),
  };
}

function parseInstanceAuthAccessBinding(value: unknown): InstanceAuthAccessBinding | undefined {
  if (
    !isRecord(value) ||
    typeof value.principalId !== "string" ||
    value.principalId.trim() === "" ||
    (value.via !== "central-session" &&
      value.via !== "host-session" &&
      value.via !== "owner-session")
  ) {
    return undefined;
  }

  try {
    const session =
      value.via === "central-session"
        ? parseCentralAuthSessionBody(value.session)
        : value.via === "host-session"
          ? parseHostAuthSession(value.session)
          : parseBoundOwnerSession(value.session);

    if (!session || session.principalId !== value.principalId.trim()) {
      return undefined;
    }

    return {
      principalId: session.principalId,
      session,
      via: value.via,
    };
  } catch {
    return undefined;
  }
}

function parseBoundOwnerSession(value: unknown): OwnerSession | undefined {
  if (
    !isRecord(value) ||
    typeof value.instanceId !== "string" ||
    value.instanceId.trim() === "" ||
    typeof value.principalId !== "string" ||
    value.principalId.trim() === "" ||
    typeof value.issuedAt !== "string" ||
    typeof value.expiresAt !== "string" ||
    !isTimestamp(value.issuedAt) ||
    !isTimestamp(value.expiresAt)
  ) {
    return undefined;
  }

  return {
    expiresAt: value.expiresAt,
    instanceId: value.instanceId.trim(),
    issuedAt: value.issuedAt,
    principalId: value.principalId.trim(),
  };
}

function hostAuthSessionTargetFromSession(
  session: HostAuthSession,
): InstanceAuthSessionTargetBinding {
  return {
    access: session.access,
    routeId: session.routeId,
    targetOrigin: session.targetOrigin,
    targetProfile: session.targetProfile,
  };
}

function sessionIsCurrent(session: InstanceAuthSession, now?: string): boolean {
  return (
    parseTimestampMs("Bound auth session expiresAt", session.expiresAt) >
    parseTimestampMs("Bound auth session validation time", now ?? nowIsoString())
  );
}

async function readBoundCentralSessionFromRuntime(
  env: InstanceAuthAccessEnv,
  session: CentralAuthSession,
  now?: string,
): Promise<CentralAuthSession | null> {
  if (env.FORMLESS_AUTHORITY === undefined) {
    return null;
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);
  const response = await env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(`http://internal${internalBoundCentralSessionValidatePath}`, {
      body: JSON.stringify({
        ...(now === undefined ? {} : { now }),
        session,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
  const body = (await response.json()) as { session?: unknown; validated?: boolean };

  if (!response.ok || body.validated !== true || body.session === undefined) {
    return null;
  }

  return parseCentralAuthSessionBody(body.session);
}

function hostAuthSessionTargetBindingsEqual(
  left: InstanceAuthSessionTargetBinding,
  right: InstanceAuthSessionTargetBinding,
): boolean {
  return (
    left.targetOrigin === right.targetOrigin &&
    left.routeId === right.routeId &&
    left.targetProfile === right.targetProfile &&
    left.access === right.access
  );
}

function runtimeRouteAccessSatisfies(
  actual: ProtectedRouteAccess | "anonymous",
  required: ProtectedRouteAccess,
): boolean {
  return runtimeRouteAccessRank(actual) >= runtimeRouteAccessRank(required);
}

function runtimeRouteAccessRank(access: ProtectedRouteAccess | "anonymous"): number {
  switch (access) {
    case "anonymous":
      return 0;
    case "authenticated":
      return 1;
    case "management":
      return 2;
    case "owner":
      return 3;
  }
}

export function requestOriginForAuth(request: Request): string {
  const requestUrl = new URL(request.url);
  const forwardedHost =
    firstHeaderValue(request.headers.get("x-forwarded-host")) ??
    forwardedHeaderValue(request.headers.get("forwarded"), "host");
  const forwardedProto =
    firstHeaderValue(request.headers.get("x-forwarded-proto")) ??
    forwardedHeaderValue(request.headers.get("forwarded"), "proto");
  const originUrl = new URL(
    `${forwardedProto ?? requestUrl.protocol.replace(/:$/, "")}://${forwardedHost ?? requestUrl.host}`,
  );

  if (originUrl.protocol === "http:" && !isLocalhost(originUrl.hostname)) {
    originUrl.protocol = "https:";
  }

  return parseInstanceAuthCanonicalOrigin(originUrl.origin);
}

function handoffTargetProfileSearchParam(url: URL): InstanceAuthHandoffTargetProfile {
  const value = requiredSearchParam(url, "targetProfile");

  return handoffTargetProfileValue(value);
}

function handoffTargetProfileValue(value: string): InstanceAuthHandoffTargetProfile {
  if (!handoffTargetProfiles.includes(value as InstanceAuthHandoffTargetProfile)) {
    throw new Error("Handoff target profile is invalid.");
  }

  return value as InstanceAuthHandoffTargetProfile;
}

function handoffTargetAccessValue(value: string): ProtectedRouteAccess {
  const access = parseRuntimeRouteAccess(value);

  if (access === undefined || access === "anonymous") {
    throw new Error("Handoff target access is invalid.");
  }

  return access;
}

function protectedRouteAccessSearchParam(url: URL, name: string): ProtectedRouteAccess | undefined {
  const value = optionalSearchParam(url, name);
  const access = value === undefined ? undefined : parseRuntimeRouteAccess(value);

  return access === undefined || access === "anonymous" ? undefined : access;
}

function requiredSearchParam(url: URL, name: string): string {
  const value = optionalSearchParam(url, name);

  if (value === undefined) {
    throw new Error(`Handoff ${name} is required.`);
  }

  return value;
}

function optionalSearchParam(url: URL, name: string): string | undefined {
  const value = url.searchParams.get(name);

  return value === null || value.trim() === "" ? undefined : value.trim();
}

function requiredHeader(headers: Headers, name: string): string {
  const value = optionalHeader(headers, name);

  if (value === undefined) {
    throw new Error(`Handoff ${name} header is required.`);
  }

  return value;
}

function optionalHeader(headers: Headers, name: string): string | undefined {
  const value = headers.get(name);

  return value === null || value.trim() === "" ? undefined : value.trim();
}

function base64UrlSearchParam(url: URL, name: string): string {
  const value = requiredSearchParam(url, name);

  if (!base64UrlPattern.test(value)) {
    throw new Error(`Handoff ${name} must be base64url.`);
  }

  return value;
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));

  return base64UrlEncode(new Uint8Array(digest));
}

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);

  crypto.getRandomValues(bytes);

  return base64UrlEncode(bytes);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signHostAuthSessionPayload(payload: HostAuthSessionPayload, secret: string) {
  const payloadPart = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await signString(payloadPart, secret);

  return `${payloadPart}.${signature}`;
}

async function signString(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));

  return base64UrlEncode(new Uint8Array(signature));
}

function base64UrlDecodeUtf8(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(normalized + padding);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new TextDecoder().decode(bytes);
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);

  if (leftBytes.length !== rightBytes.length) {
    return false;
  }

  let diff = 0;

  for (let index = 0; index < leftBytes.length; index += 1) {
    diff |= leftBytes[index] ^ rightBytes[index];
  }

  return diff === 0;
}

function redirectResponse(location: string, status: number, headers: HeadersInit = {}): Response {
  const responseHeaders = new Headers(headers);

  responseHeaders.set("Location", location);

  return new Response(null, {
    headers: responseHeaders,
    status,
  });
}

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  const responseHeaders = new Headers(headers);

  if (!responseHeaders.has("Cache-Control")) {
    responseHeaders.set("Cache-Control", "no-store");
  }

  return Response.json(body, {
    headers: responseHeaders,
    status,
  });
}

function stringEnvValue(value: string | undefined): string | undefined {
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function firstHeaderValue(value: string | null): string | undefined {
  const first = value?.split(",")[0]?.trim();

  return first ? first : undefined;
}

function forwardedHeaderValue(value: string | null, key: "host" | "proto"): string | undefined {
  const first = firstHeaderValue(value);

  if (!first) {
    return undefined;
  }

  for (const part of first.split(";")) {
    const [partKey, partValue] = part.split("=", 2);

    if (partKey?.trim().toLowerCase() !== key) {
      continue;
    }

    const normalized = partValue?.trim().replace(/^"|"$/g, "");

    return normalized ? normalized : undefined;
  }

  return undefined;
}

function requestCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("Cookie");

  if (!header) {
    return undefined;
  }

  for (const part of header.split(";")) {
    const [cookieName, ...valueParts] = part.split("=");

    if (cookieName?.trim() === name) {
      return valueParts.join("=").trim();
    }
  }

  return undefined;
}

async function hostAuthSessionInstanceId(
  request: Request,
  env: InstanceAuthHandoffEnv,
): Promise<string | undefined> {
  const authOrigin = await configuredInstanceAuthOrigin(request, env);

  return authOrigin ? new URL(authOrigin).hostname.toLowerCase() : undefined;
}

function parseTimestampMs(context: string, value: string): number {
  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    throw new Error(`${context} must be a valid timestamp.`);
  }

  return timestamp;
}

function isTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseNonNegativeIntegerValue(value: unknown): number | undefined {
  return Number.isInteger(value) && typeof value === "number" && value >= 0 ? value : undefined;
}

function isLocalhost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Bad request.";
}
