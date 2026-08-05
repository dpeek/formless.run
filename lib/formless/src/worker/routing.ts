import {
  acceptsRuntimeHtml,
  isRuntimeApiPath,
  isRuntimeClientShellRoute,
  isRuntimeDynamicSiteIconPath,
  isRuntimeInstanceProfileClientShellRoute,
  isRuntimePublishedProfileClientShellRoute,
  isRuntimePublishedSiteIndexingResourcePath,
  isRuntimeReadRequestMethod,
  looksLikeRuntimeStaticAssetPath,
  resolveRuntimeProfileKind,
  runtimeRoutePolicyForProfileKind,
  runtimeTopologyRoutes,
  stricterRuntimeRouteAccess,
  stringRuntimeConfigValue,
  type RuntimeRouteAccess,
  type RuntimeProfileKind,
} from "../shared/runtime-topology.ts";
import { evaluateAccessRequirement, type AppSchema } from "@dpeek/formless-schema";
import {
  formlessProgramSchema,
  resolveFormlessProgramRouteTarget,
  type FormlessProgramRouteTarget,
} from "../program/runtime.ts";
import type { InstanceRuntimeRouteResolution } from "./instance-runtime-routes.ts";

export type WorkerRuntimeProfileInput = {
  hostname?: string | undefined;
  profile?: string | undefined;
  programSchema?: AppSchema | undefined;
};

export type WorkerRuntimeRoutePolicy = {
  instanceBrowserRoutes: boolean;
};

export type WorkerRuntimeRequestTopology = {
  acceptsHtml: boolean;
  apiPath: boolean;
  clientShellRoute: boolean;
  dynamicSiteIconPath: boolean;
  instanceProfileClientShellRoute: boolean;
  pathname: string;
  programRouteAllowsAnonymous: boolean | undefined;
  programRouteTarget: FormlessProgramRouteTarget | undefined;
  profileKind: RuntimeProfileKind;
  publishedProfileClientShellRoute: boolean;
  publishedSiteIndexingResourcePath: boolean;
  readMethod: boolean;
  routePolicy: WorkerRuntimeRoutePolicy;
  staticAssetPath: boolean;
  url: URL;
};

export type WorkerRuntimeRouteInput = WorkerRuntimeProfileInput | WorkerRuntimeRequestTopology;

export type MappedRuntimeRoutePolicy = {
  blocksAuthOriginRoutes: boolean;
  mappedTargetProfile?: "instance" | "public-site";
  runtimeProfile?: string;
};

export type ProtectedBrowserRouteSessionFact =
  | "account-completion-required"
  | "allowed"
  | "rejected"
  | "unread";

export type ProtectedBrowserRouteDecision =
  | {
      kind: "account-completion";
      requiredAccess: Exclude<RuntimeRouteAccess, "anonymous">;
    }
  | { kind: "authenticate"; requiredAccess: Exclude<RuntimeRouteAccess, "anonymous"> }
  | { kind: "continue" }
  | {
      kind: "validate-session";
      programRoute?: ProgramRouteTarget;
      requiredAccess: Exclude<RuntimeRouteAccess, "anonymous">;
    };

export type ProgramRouteTarget = FormlessProgramRouteTarget & {
  requiredAccess: RuntimeRouteAccess;
  routeAccess: RuntimeRouteAccess;
};

export type ProtectedBrowserRouteTarget = {
  programRoute?: ProgramRouteTarget;
  requiredAccess: Exclude<RuntimeRouteAccess, "anonymous">;
};

export type MappedAuthOriginRouteDecision =
  | { kind: "continue" }
  | { kind: "not-found" }
  | { kind: "read-auth-origin" }
  | { kind: "redirect"; location: string };

export function workerRuntimeProfileInput(profile: string | undefined): WorkerRuntimeProfileInput {
  return {
    profile: stringRuntimeConfigValue(profile),
  };
}

export function resolveWorkerRuntimeRequestTopology(
  request: Request,
  input: WorkerRuntimeRouteInput = {},
): WorkerRuntimeRequestTopology {
  if (isWorkerRuntimeRequestTopology(input)) {
    return input;
  }

  const url = new URL(request.url);
  const profileKind = resolveRuntimeProfileKind({ ...input, hostname: url.hostname });
  const readMethod = isRuntimeReadRequestMethod(request.method);
  const apiPath = isRuntimeApiPath(url.pathname);
  const staticAssetPath = looksLikeRuntimeStaticAssetPath(url.pathname);
  const programSchema = input.programSchema ?? formlessProgramSchema;
  const programRouteTarget = resolveFormlessProgramRouteTarget(url.pathname, programSchema);
  const programRouteAllowsAnonymous =
    programRouteTarget === undefined
      ? undefined
      : evaluateProgramRouteAccessForAnonymous(programRouteTarget, programSchema);

  return {
    acceptsHtml: acceptsRuntimeHtml(request.headers.get("Accept")),
    apiPath,
    clientShellRoute: isRuntimeClientShellRoute(url.pathname),
    dynamicSiteIconPath: isRuntimeDynamicSiteIconPath(url.pathname),
    instanceProfileClientShellRoute: isRuntimeInstanceProfileClientShellRoute(
      url.pathname,
      programSchema,
    ),
    pathname: url.pathname,
    programRouteAllowsAnonymous,
    programRouteTarget,
    profileKind,
    publishedProfileClientShellRoute: isRuntimePublishedProfileClientShellRoute(url.pathname),
    publishedSiteIndexingResourcePath: isRuntimePublishedSiteIndexingResourcePath(url.pathname),
    readMethod,
    routePolicy: workerRuntimeRoutePolicyFromKind(profileKind),
    staticAssetPath,
    url,
  };
}

export function mappedRuntimeRoutePolicyFromFacts(input: {
  configuredRuntimeProfile?: string;
  runtimeRoute?: InstanceRuntimeRouteResolution;
}): MappedRuntimeRoutePolicy {
  const mappedRoute =
    input.runtimeRoute?.kind === "mount" && input.runtimeRoute.matchHost !== undefined
      ? input.runtimeRoute
      : undefined;
  const mappedTargetProfile = mappedRoute?.targetProfile;
  const blocksAuthOriginRoutes = mappedTargetProfile === "public-site";

  return {
    blocksAuthOriginRoutes,
    ...(mappedTargetProfile === undefined ? {} : { mappedTargetProfile }),
    ...(mappedTargetProfile === "instance"
      ? { runtimeProfile: "instance" }
      : input.configuredRuntimeProfile === undefined
        ? {}
        : { runtimeProfile: input.configuredRuntimeProfile }),
  };
}

export function mappedAuthOriginRouteDecisionFromFacts(input: {
  authOrigin?: string;
  authOriginRead: boolean;
  mappedRoutePolicy: MappedRuntimeRoutePolicy;
  requestOrigin: string;
  reservedAuthOriginRoute: boolean;
  topology: WorkerRuntimeRequestTopology;
}): MappedAuthOriginRouteDecision {
  if (!input.mappedRoutePolicy.blocksAuthOriginRoutes || !input.reservedAuthOriginRoute) {
    return { kind: "continue" };
  }

  const credentialGate =
    (input.topology.pathname === runtimeTopologyRoutes.authAccountSignInRoute ||
      input.topology.pathname === runtimeTopologyRoutes.authAccountSetupRoute) &&
    input.topology.readMethod &&
    input.topology.acceptsHtml &&
    !input.topology.apiPath &&
    !input.topology.staticAssetPath;

  if (credentialGate && !input.authOriginRead) {
    return { kind: "read-auth-origin" };
  }

  if (credentialGate && input.authOrigin && input.authOrigin !== input.requestOrigin) {
    const location = new URL(input.authOrigin);

    location.pathname = input.topology.url.pathname;
    location.search = input.topology.url.search;

    return { kind: "redirect", location: location.toString() };
  }

  return { kind: "not-found" };
}

export function protectedBrowserRouteDecisionFromFacts(input: {
  runtimeRoute?: InstanceRuntimeRouteResolution;
  session: ProtectedBrowserRouteSessionFact;
  topology: WorkerRuntimeRequestTopology;
}): ProtectedBrowserRouteDecision {
  if (!protectedBrowserRouteCandidateFromFacts(input.topology)) {
    return { kind: "continue" };
  }

  const target = resolveProtectedBrowserRouteTargetFromFacts(input);

  if (target === undefined || input.session === "allowed") {
    return { kind: "continue" };
  }

  const { programRoute, requiredAccess } = target;

  if (input.session === "unread") {
    return {
      kind: "validate-session",
      ...(programRoute === undefined ? {} : { programRoute }),
      requiredAccess,
    };
  }

  if (input.session === "account-completion-required") {
    return { kind: "account-completion", requiredAccess };
  }

  return { kind: "authenticate", requiredAccess };
}

export function resolveProtectedBrowserRouteTargetFromFacts(input: {
  runtimeRoute?: InstanceRuntimeRouteResolution;
  topology: WorkerRuntimeRequestTopology;
}): ProtectedBrowserRouteTarget | undefined {
  const programRoute = resolveProgramRouteTargetFromFacts(input);
  const routeAccess =
    programRoute?.requiredAccess ??
    ownerBrowserRouteAccessFromFacts(input.topology, input.runtimeRoute);

  if (routeAccess === "anonymous") {
    return undefined;
  }

  return {
    ...(programRoute === undefined ? {} : { programRoute }),
    requiredAccess: routeAccess,
  };
}

export function resolveProgramRouteTargetFromFacts(input: {
  runtimeRoute?: InstanceRuntimeRouteResolution;
  topology: Pick<WorkerRuntimeRequestTopology, "pathname" | "profileKind"> &
    Partial<
      Pick<WorkerRuntimeRequestTopology, "programRouteAllowsAnonymous" | "programRouteTarget">
    >;
}): ProgramRouteTarget | undefined {
  const mountRoute = input.runtimeRoute?.kind === "mount" ? input.runtimeRoute : undefined;

  if (input.runtimeRoute !== undefined && mountRoute === undefined) {
    return undefined;
  }

  if (mountRoute !== undefined && mountRoute.targetProfile !== "instance") {
    return undefined;
  }

  if (mountRoute === undefined && input.topology.profileKind !== "instance") {
    return undefined;
  }

  const programRoute = Object.hasOwn(input.topology, "programRouteTarget")
    ? input.topology.programRouteTarget
    : resolveFormlessProgramRouteTarget(input.topology.pathname);

  if (programRoute === undefined) {
    return undefined;
  }

  const routeAccess = mountRoute?.access ?? "anonymous";
  const programRouteAccess =
    (input.topology.programRouteAllowsAnonymous ??
      evaluateProgramRouteAccessForAnonymous(programRoute, formlessProgramSchema)) === true
      ? "anonymous"
      : "authenticated";

  return {
    ...programRoute,
    requiredAccess: stricterRuntimeRouteAccess(routeAccess, programRouteAccess),
    routeAccess,
  };
}

export function workerRuntimeRoutePolicy(
  input: WorkerRuntimeProfileInput = {},
): WorkerRuntimeRoutePolicy {
  return workerRuntimeRoutePolicyFromKind(resolveRuntimeProfileKind(input));
}

export function shouldHandlePublishedSiteDocument(
  request: Request,
  input: WorkerRuntimeRouteInput = {},
): boolean {
  const topology = resolveWorkerRuntimeRequestTopology(request, input);

  if (!topology.readMethod) {
    return false;
  }

  if (topology.profileKind !== "publishedSite") {
    return false;
  }

  if (topology.apiPath || topology.clientShellRoute || topology.staticAssetPath) {
    return false;
  }

  return topology.acceptsHtml;
}

export function shouldHandlePublishedSiteIndexingResource(
  request: Request,
  input: WorkerRuntimeRouteInput = {},
): boolean {
  const topology = resolveWorkerRuntimeRequestTopology(request, input);

  return (
    topology.readMethod &&
    topology.profileKind === "publishedSite" &&
    topology.publishedSiteIndexingResourcePath
  );
}

export function shouldResolveInstanceSiteDomainMappingForRequest(
  request: Request,
  input: WorkerRuntimeRouteInput = {},
): boolean {
  const topology = resolveWorkerRuntimeRequestTopology(request, input);

  if (!topology.readMethod) {
    return false;
  }

  if (topology.apiPath) {
    return false;
  }

  return topology.profileKind === "instance";
}

export function shouldHandleMappedSiteHostDocument(
  request: Request,
  input: WorkerRuntimeRouteInput = { profile: "publishedSite" },
): boolean {
  const topology = resolveWorkerRuntimeRequestTopology(request, input);

  if (!topology.readMethod) {
    return false;
  }

  if (topology.apiPath || topology.clientShellRoute || topology.staticAssetPath) {
    return false;
  }

  return topology.acceptsHtml;
}

export function shouldBlockMappedSiteHostBrowserRoute(
  request: Request,
  input: WorkerRuntimeRouteInput = { profile: "publishedSite" },
): boolean {
  const topology = resolveWorkerRuntimeRequestTopology(request, input);

  return (
    topology.readMethod &&
    !topology.apiPath &&
    !topology.staticAssetPath &&
    topology.clientShellRoute
  );
}

export function shouldHandleMappedSiteHostIndexingResource(
  request: Request,
  input: WorkerRuntimeRouteInput = { profile: "publishedSite" },
): boolean {
  const topology = resolveWorkerRuntimeRequestTopology(request, input);

  return topology.readMethod && topology.publishedSiteIndexingResourcePath;
}

export function shouldDeferToStaticAssets(
  request: Request,
  input: WorkerRuntimeRouteInput = {},
): boolean {
  const topology = resolveWorkerRuntimeRequestTopology(request, input);

  if (!topology.readMethod) {
    return false;
  }

  if (topology.apiPath || topology.dynamicSiteIconPath) {
    return false;
  }

  if (topology.profileKind === "publishedSite") {
    return topology.publishedProfileClientShellRoute || topology.staticAssetPath;
  }

  if (topology.routePolicy.instanceBrowserRoutes) {
    return topology.instanceProfileClientShellRoute || topology.staticAssetPath;
  }

  return false;
}

export function workerWorkspaceGatewayRouteAvailableFromFacts(input: {
  exactHostMapped: boolean;
  gatewayEnabled: boolean;
  profileKind: RuntimeProfileKind;
  sidecarTargetAvailable: boolean;
}): boolean {
  return (
    input.profileKind === "instance" &&
    input.gatewayEnabled &&
    input.sidecarTargetAvailable &&
    !input.exactHostMapped
  );
}

export function shouldRedirectAnonymousOwnerBrowserRoute(
  request: Request,
  input: WorkerRuntimeRouteInput = {},
  runtimeRoute?: InstanceRuntimeRouteResolution,
): boolean {
  return (
    protectedBrowserRouteCandidate(request, input) &&
    ownerBrowserRouteAccessForRequest(request, input, runtimeRoute) === "owner"
  );
}

export function shouldRedirectAnonymousProtectedBrowserRoute(
  request: Request,
  input: WorkerRuntimeRouteInput = {},
  runtimeRoute?: InstanceRuntimeRouteResolution,
): boolean {
  return (
    protectedBrowserRouteCandidate(request, input) &&
    ownerBrowserRouteAccessForRequest(request, input, runtimeRoute) !== "anonymous"
  );
}

function protectedBrowserRouteCandidate(
  request: Request,
  input: WorkerRuntimeRouteInput = {},
): boolean {
  const topology = resolveWorkerRuntimeRequestTopology(request, input);

  return protectedBrowserRouteCandidateFromFacts(topology);
}

export function protectedBrowserRouteCandidateFromFacts(
  topology: WorkerRuntimeRequestTopology,
): boolean {
  if (
    !topology.readMethod ||
    !topology.acceptsHtml ||
    topology.apiPath ||
    topology.staticAssetPath ||
    isLegacyOwnerAuthBrowserPath(topology.pathname)
  ) {
    return false;
  }

  return true;
}

function isLegacyOwnerAuthBrowserPath(pathname: string): boolean {
  return pathname === "/login" || pathname === "/setup";
}

export function ownerBrowserRouteAccessForRequest(
  request: Request,
  input: WorkerRuntimeRouteInput = {},
  runtimeRoute?: InstanceRuntimeRouteResolution,
): RuntimeRouteAccess {
  const topology = resolveWorkerRuntimeRequestTopology(request, input);

  return ownerBrowserRouteAccessFromFacts(topology, runtimeRoute);
}

export function ownerBrowserRouteAccessFromFacts(
  topology: WorkerRuntimeRequestTopology,
  runtimeRoute?: InstanceRuntimeRouteResolution,
): RuntimeRouteAccess {
  const mountRoute = runtimeRoute?.kind === "mount" ? runtimeRoute : undefined;
  const programRoute = resolveProgramRouteTargetFromFacts({ runtimeRoute, topology });

  if (programRoute !== undefined) {
    return programRoute.requiredAccess;
  }

  if (mountRoute?.matchHost !== undefined) {
    return mountRoute.access;
  }

  if (topology.profileKind !== "instance") {
    return "anonymous";
  }

  if (mountRoute) {
    return mountRoute.access;
  }

  return "anonymous";
}

function evaluateProgramRouteAccessForAnonymous(
  programRoute: FormlessProgramRouteTarget,
  programSchema: AppSchema,
): boolean {
  return evaluateAccessRequirement(programRoute.access, { kind: "anonymous" }, programSchema);
}

export function isApiPath(pathname: string): boolean {
  return isRuntimeApiPath(pathname);
}

export function isClientShellRoute(pathname: string): boolean {
  return isRuntimeClientShellRoute(pathname);
}

function workerRuntimeRoutePolicyFromKind(
  profileKind: RuntimeProfileKind,
): WorkerRuntimeRoutePolicy {
  const policy = runtimeRoutePolicyForProfileKind(profileKind);

  return {
    instanceBrowserRoutes: policy.instanceBrowserRoutes,
  };
}

export function looksLikeStaticAssetPath(pathname: string): boolean {
  return looksLikeRuntimeStaticAssetPath(pathname);
}

export function isDynamicSiteIconPath(pathname: string): boolean {
  return isRuntimeDynamicSiteIconPath(pathname);
}

function isWorkerRuntimeRequestTopology(
  input: WorkerRuntimeRouteInput,
): input is WorkerRuntimeRequestTopology {
  return "profileKind" in input && "routePolicy" in input && "url" in input;
}
