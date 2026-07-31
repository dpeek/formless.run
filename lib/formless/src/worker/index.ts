import { FormlessAuthority } from "./authority.ts";
import { handleWorkspaceGatewayProxyRequest } from "@dpeek/formless-gateway/worker";
import { parseAuthorityApiRoute, parseProgramApiRoute } from "../shared/app-storage-identity.ts";
import { handleInstanceArchiveApiRequest } from "./archive-api.ts";
import {
  authorizeInstanceWrite,
  authorizeOwnerManagementRead,
  authorizeProgramAccess,
} from "./authority-admin-guard.ts";
import { selectAuthorityOperation } from "./authority-operations.ts";
import { handleClientAssetRequest, handleClientShellDocumentRequest } from "./client-shell.ts";
import { handleDeployMetadataRequest } from "./deploy-metadata.ts";
import {
  handleMediaRequest as handleMediaPackageRequest,
  mediaObjectStoreFromR2Bucket,
} from "@dpeek/formless-media/worker";
import { handleAppDocumentMediaRequest } from "./app-document-media.ts";
import { handleInstanceDomainProviderApiRequest } from "./domain-provider-api.ts";
import { handleInstanceDeploymentRuntimeApiRequest } from "./deployment-runtime-api.ts";
import {
  handleInstanceEmailDeliveryQueueBatch,
  handleInstanceEmailRuntimeApiRequest,
  type EmailDeliveryQueueBinding,
  type CloudflareSendEmailBinding,
} from "./email-runtime.ts";
import {
  handleInstanceAppInstallsApiRequest,
  isInstanceAppInstallsApiPath,
} from "./instance-app-installs.ts";
import { handleInstanceControlPlaneApiRequest } from "./instance-control-plane.ts";
import { handleInstanceDomainMappingsApiRequest } from "./instance-domain-mappings.ts";
import { handleIdentityControlPlaneApiRequest } from "./identity-control-plane.ts";
import { resolveInstanceRuntimeRouteForRequest } from "./instance-runtime-routes.ts";
import { mappedAppHostFromRuntimeRoute } from "./mapped-app-host.ts";
import {
  HOST_AUTH_SESSION_COOKIE_NAME,
  accountAuthorizationForbiddenResponse,
  accountAuthorizationForbiddenResult,
  configuredInstanceAuthOrigin,
  accountCompletionBlockedResponse,
  handleAuthAccountHandoffBrowserContinuation,
  handleInstanceAuthHandoffRequest,
  hostAuthSessionTargetForRuntimeRoute,
  installedAppApiRouteAccessFromFacts,
  mappedInstanceManagementTargetFromFacts,
  requestOriginForAuth,
  resolveAuthAccountHandoffContinuation,
  setHostAuthSessionTargetHeaders,
  startProtectedRouteAuthAccount,
  validateRouteAccessSession,
} from "./instance-auth-handoff.ts";
import {
  handleCollaboratorInvitationAcceptanceApiRequest,
  handleCollaboratorInvitationAcceptanceBrowserRequest,
} from "./collaborator-invitation-acceptance.ts";
import { handleInstanceAuthEmailVerificationApiRequest } from "./instance-auth-email-verification.ts";
import { handleInstanceAuthOwnerSetupApiRequest } from "./instance-auth-owner-setup.ts";
import { handleInstanceAuthSignupApiRequest } from "./instance-auth-signup.ts";
import { handleInstanceAuthAccountCompletionApiRequest } from "./instance-auth-account-completion.ts";
import { sameOriginAccountCompletionTargetForRuntimeRouteFacts } from "./instance-auth-account-target.ts";
import { handleAccountPasskeyApiRequest } from "./account-passkeys.ts";
import {
  accountRedirectLocationForRoute,
  parseAccountRedirectTarget,
  type AccountAuthorizationForbiddenResult,
  type AccountCompletionContinuationResult,
  type AccountCompletionGateResult,
} from "../shared/instance-auth.ts";
import {
  isRuntimeAuthAccountRoutePath,
  runtimeTopologyRoutes,
} from "../shared/runtime-topology.ts";
import {
  areSchemaKeyApiRoutesEnabledForRequest,
  mappedAuthOriginRouteDecisionFromFacts,
  mappedRuntimeRoutePolicyFromFacts,
  mappedSiteHostRedirectForRequest,
  protectedBrowserRouteDecisionFromFacts,
  publishedSiteRedirectForRequest,
  resolveProtectedBrowserRouteTargetFromFacts,
  resolveWorkerRuntimeRequestTopology,
  shouldDeferToStaticAssets,
  workerRuntimeProfileInput,
  type WorkerRuntimeRequestTopology,
} from "./routing.ts";
import {
  handlePublicSiteDocumentRequest,
  handlePublicSiteIconRequest,
  handlePublicSiteIndexingRequest,
  mappedPublicSiteHostFromRuntimeRoute,
} from "./public-site-worker-runtime.ts";
import { handleInstanceUpgradeStatusApiRequest } from "./upgrade-status-api.ts";
import {
  handleLocalSessionBootstrapApiRequest,
  isLocalSessionBootstrapApiPath,
} from "./local-session-bootstrap.ts";
import {
  handleOwnerSetupApiRequest,
  ACCOUNT_SESSION_API_PATH,
  ACCOUNT_SESSION_LOGOUT_API_PATH,
} from "./owner-setup.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import { validateOwnerSessionCookie } from "./owner-session.ts";
import type { TurnstileRuntimeEnv } from "../shared/turnstile-config.ts";
import { activeAppPackageResolver } from "./runtime-app-packages.ts";
import { WORKSPACE_OPERATION_CAPABILITIES } from "@dpeek/formless-workspace";
import {
  FORMLESS_PROGRAM_EDITOR_ACCESS_REQUIREMENT,
  formlessProgramSchema,
} from "../program/runtime.ts";

export { FormlessAuthority } from "./authority.ts";

export type Env = TurnstileRuntimeEnv & {
  ALCHEMY_PASSWORD?: string;
  ASSETS?: Fetcher;
  CF_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  FORMLESS_ADMIN_TOKEN?: string;
  FORMLESS_AUTHORITY: DurableObjectNamespace<FormlessAuthority>;
  FORMLESS_DEPLOY_VERSION?: string;
  FORMLESS_DOMAIN_PROVIDER_CLOUDFLARE_ACCOUNT_ID?: string;
  FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID?: string;
  FORMLESS_DOMAIN_PROVIDER_WORKER_NAME?: string;
  FORMLESS_EMAIL?: CloudflareSendEmailBinding;
  FORMLESS_EMAIL_DELIVERY_QUEUE?: EmailDeliveryQueueBinding;
  FORMLESS_DOMAIN_PROVIDER_ZONE_ID?: string;
  FORMLESS_DOMAIN_PROVIDER_ZONE_NAME?: string;
  FORMLESS_DOMAIN_PROVIDER_ZONES?: string;
  FORMLESS_INSTANCE_AUTH_ORIGIN?: string;
  FORMLESS_INSTANCE_AUTH_RELYING_PARTY_ID?: string;
  FORMLESS_INSTANCE_AUTH_RELYING_PARTY_NAME?: string;
  FORMLESS_LOCAL_SESSION_BOOTSTRAP_TOKEN?: string;
  FORMLESS_MEDIA: R2Bucket;
  FORMLESS_OWNER_SESSION_SECRET?: string;
  FORMLESS_RUNTIME_APP_INSTALL_ID?: string;
  FORMLESS_RUNTIME_PACKAGE_APP_KEY?: string;
  FORMLESS_RUNTIME_PROFILE?: string;
  FORMLESS_TURNSTILE_SITEVERIFY?: Fetcher;
  FORMLESS_WORKSPACE_APP_PACKAGES?: string;
  FORMLESS_WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN?: string;
  FORMLESS_WORKSPACE_GATEWAY_CSRF_TOKEN?: string;
  FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN?: string;
  FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL?: string;
};

export default {
  async fetch(request, env) {
    const requestUrl = new URL(request.url);
    const packageResolver = activeAppPackageResolver(env);
    const authorityRoute = parseAuthorityApiRoute(requestUrl.pathname, packageResolver);
    const authorityForwardRequest: Request | undefined = authorityRoute
      ? (request.clone() as Request)
      : undefined;
    const programRoute = parseProgramApiRoute(requestUrl.pathname);
    const programForwardRequest: Request | undefined = programRoute
      ? (request.clone() as Request)
      : undefined;
    const capabilityForwardRequests = {
      archive: request.clone() as Request,
      deployment: request.clone() as Request,
      domainMappings: request.clone() as Request,
      domainProvider: request.clone() as Request,
      email: request.clone() as Request,
      identity: request.clone() as Request,
      installs: request.clone() as Request,
      localSession: request.clone() as Request,
    };

    const earlyCollaboratorInvitationAcceptanceBrowserResponse =
      await handleCollaboratorInvitationAcceptanceBrowserRequest(request, env);

    if (earlyCollaboratorInvitationAcceptanceBrowserResponse) {
      return earlyCollaboratorInvitationAcceptanceBrowserResponse;
    }

    const earlyCollaboratorInvitationAcceptanceResponse =
      await handleCollaboratorInvitationAcceptanceApiRequest(request, env);

    if (earlyCollaboratorInvitationAcceptanceResponse) {
      return earlyCollaboratorInvitationAcceptanceResponse;
    }

    const earlyEmailVerificationResponse = await handleInstanceAuthEmailVerificationApiRequest(
      request,
      env,
    );

    if (earlyEmailVerificationResponse) {
      return earlyEmailVerificationResponse;
    }

    const runtimeRoute = await resolveInstanceRuntimeRouteForRequest(request, env, {
      includeHostless: false,
    });

    if (runtimeRoute?.kind === "redirect") {
      return redirectResponse(runtimeRoute.location, runtimeRoute.status);
    }

    if (runtimeRoute?.kind === "not-found") {
      return new Response(null, { status: 404 });
    }

    const mappedAppHost = mappedAppHostFromRuntimeRoute(runtimeRoute);
    const mappedSiteHost = mappedPublicSiteHostFromRuntimeRoute(runtimeRoute);
    const mappedRoutePolicy = mappedRuntimeRoutePolicyFromFacts({
      configuredRuntimeProfile: env.FORMLESS_RUNTIME_PROFILE,
      runtimeRoute,
    });
    const effectiveRuntimeProfile = workerRuntimeProfileInput(mappedRoutePolicy.runtimeProfile);
    const requestTopology = resolveWorkerRuntimeRequestTopology(request, effectiveRuntimeProfile);
    const workspaceGatewayRouteAvailable = workerWorkspaceGatewayRouteAvailable(
      requestTopology,
      runtimeRoute,
    );
    const workspaceGatewayResponse = await handleWorkspaceGatewayProxyRequest(request, env, {
      capabilities: WORKSPACE_OPERATION_CAPABILITIES,
      readOwnerSetupStatus: (setupRequest) => readOwnerSetupStatus(setupRequest, env),
      routeAvailable: workspaceGatewayRouteAvailable,
      validateOwnerSession: (sessionRequest) => validateOwnerSessionCookie(sessionRequest, env),
    });

    if (workspaceGatewayResponse) {
      return workspaceGatewayResponse;
    }

    const mediaResponse = await handleMediaPackageRequest(request, {
      authorizeWrite: async (writeRequest) => {
        const instanceAuthorization = await authorizeInstanceWrite(writeRequest, env);

        if (instanceAuthorization.authorized) {
          return instanceAuthorization;
        }

        const programAuthorization = await authorizeProgramAccess(
          writeRequest,
          env,
          FORMLESS_PROGRAM_EDITOR_ACCESS_REQUIREMENT,
          formlessProgramSchema,
          {
            error:
              "Current Program editor, administrator, owner, or admin authorization is required for core media writes.",
            hostSessionTarget: requestHasCookie(request, HOST_AUTH_SESSION_COOKIE_NAME)
              ? hostAuthSessionTargetForRuntimeRoute(request, runtimeRoute)
              : undefined,
          },
        );

        return programAuthorization.authorized ? programAuthorization : instanceAuthorization;
      },
      pathname: requestTopology.pathname,
      provider: "r2",
      store: mediaObjectStoreFromR2Bucket(env.FORMLESS_MEDIA),
    });

    if (mediaResponse) {
      return mediaResponse;
    }

    const appDocumentMediaResponse = await handleAppDocumentMediaRequest(
      request,
      env,
      authorityRoute,
      {
        pathname: requestTopology.pathname,
        target:
          authorityRoute?.identity.kind === "appInstall"
            ? installedAppApiRouteAccessFromFacts({
                requestOrigin: requestOriginForAuth(request),
                runtimeRoute,
                storageIdentity: authorityRoute.identity.authorityName,
              }).target
            : undefined,
      },
    );

    if (appDocumentMediaResponse) {
      return appDocumentMediaResponse;
    }

    const siteIconResponse = await handlePublicSiteIconRequest(request, env, {
      mappedSiteHost,
      packageResolver,
      runtimeTopology: requestTopology,
    });

    if (siteIconResponse) {
      return siteIconResponse;
    }

    const publishedSiteRedirect = mappedSiteHost
      ? mappedSiteHostRedirectForRequest(request, requestTopology)
      : publishedSiteRedirectForRequest(request, requestTopology);

    if (publishedSiteRedirect) {
      return redirectResponse(publishedSiteRedirect.location, publishedSiteRedirect.status);
    }

    const publishedSiteIndexingResponse = await handlePublicSiteIndexingRequest(request, env, {
      mappedSiteHost,
      packageResolver,
      runtimeTopology: requestTopology,
    });

    if (publishedSiteIndexingResponse) {
      return publishedSiteIndexingResponse;
    }

    const deployMetadataResponse = handleDeployMetadataRequest(request, env, {
      packageResolver,
    });

    if (deployMetadataResponse) {
      return deployMetadataResponse;
    }

    const instanceAuthHandoffResponse = await handleInstanceAuthHandoffRequest(
      request,
      env,
      runtimeRoute,
    );

    if (instanceAuthHandoffResponse) {
      return instanceAuthHandoffResponse;
    }

    let mappedAuthRouteDecision = mappedAuthOriginRouteDecisionFromFacts({
      authOriginRead: false,
      mappedRoutePolicy,
      requestOrigin: requestOriginForAuth(request),
      reservedAuthOriginRoute: isReservedAuthOriginRoute(requestTopology.pathname),
      topology: requestTopology,
    });

    if (mappedAuthRouteDecision.kind === "read-auth-origin") {
      mappedAuthRouteDecision = mappedAuthOriginRouteDecisionFromFacts({
        authOrigin: await configuredInstanceAuthOrigin(request, env),
        authOriginRead: true,
        mappedRoutePolicy,
        requestOrigin: requestOriginForAuth(request),
        reservedAuthOriginRoute: true,
        topology: requestTopology,
      });
    }

    if (mappedAuthRouteDecision.kind === "redirect") {
      return redirectResponse(mappedAuthRouteDecision.location, 302);
    }

    if (mappedAuthRouteDecision.kind === "not-found") {
      return notFoundResponse(requestTopology.apiPath);
    }

    const nonAuthOwnerRouteResponse = await handleNonAuthOriginOwnerAuthRoute(
      request,
      env,
      requestTopology,
      runtimeRoute,
    );

    if (nonAuthOwnerRouteResponse) {
      return nonAuthOwnerRouteResponse;
    }

    const authAccountCompletionApiResponse = await handleInstanceAuthAccountCompletionApiRequest(
      request,
      env,
    );

    if (authAccountCompletionApiResponse) {
      return authAccountCompletionApiResponse;
    }

    const authOwnerSetupApiResponse = await handleInstanceAuthOwnerSetupApiRequest(request, env);

    if (authOwnerSetupApiResponse) {
      return authOwnerSetupApiResponse;
    }

    const authSignupApiResponse = await handleInstanceAuthSignupApiRequest(request, env);

    if (authSignupApiResponse) {
      return authSignupApiResponse;
    }

    const authAccountStatusResponse = await handleAuthAccountStatusRequest(
      request,
      env,
      requestTopology,
    );

    if (authAccountStatusResponse) {
      return authAccountStatusResponse;
    }

    const authAccountBrowserResponse = await handleAuthAccountBrowserRequest(
      request,
      env,
      requestTopology,
    );

    if (authAccountBrowserResponse) {
      return authAccountBrowserResponse;
    }

    if (isRuntimeAuthAccountRoutePath(requestTopology.pathname)) {
      return notFoundResponse(requestTopology.apiPath);
    }

    const localSessionBootstrapResponse = isLocalSessionBootstrapApiPath(requestTopology.pathname)
      ? await handleLocalSessionBootstrapApiRequest(
          authorityRequestWithOriginalUrlFacts(capabilityForwardRequests.localSession),
          env,
        )
      : undefined;

    if (localSessionBootstrapResponse) {
      return localSessionBootstrapResponse;
    }

    const ownerSetupResponse = await handleOwnerSetupApiRequest(request, env);

    if (ownerSetupResponse) {
      return ownerSetupResponse;
    }

    const accountPasskeyResponse = await handleAccountPasskeyApiRequest(request, env);

    if (accountPasskeyResponse) {
      return accountPasskeyResponse;
    }

    const archiveResponse = await handleInstanceArchiveApiRequest(
      capabilityForwardRequests.archive,
      env,
    );

    if (archiveResponse) {
      return archiveResponse;
    }

    const instanceUpgradeStatusResponse = await handleInstanceUpgradeStatusApiRequest(request, env);

    if (instanceUpgradeStatusResponse) {
      return instanceUpgradeStatusResponse;
    }

    const instanceAppInstallsResponse = isInstanceAppInstallsApiPath(requestUrl.pathname)
      ? await handleInstanceAppInstallsApiRequest(
          authorityRequestWithOriginalUrlFacts(capabilityForwardRequests.installs, {
            hostSessionTarget: requestHasCookie(request, HOST_AUTH_SESSION_COOKIE_NAME)
              ? hostAuthSessionTargetForRuntimeRoute(request, runtimeRoute)
              : undefined,
          }),
          env,
        )
      : undefined;

    if (instanceAppInstallsResponse) {
      return instanceAppInstallsResponse;
    }

    const instanceControlPlaneResponse = programRoute
      ? await handleInstanceControlPlaneApiRequest(
          authorityRequestWithOriginalUrlFacts(programForwardRequest ?? request, {
            hostSessionTarget: mappedInstanceManagementTargetFromFacts({
              requestOrigin: requestOriginForAuth(request),
              runtimeRoute,
            }),
          }),
          env,
        )
      : undefined;

    if (instanceControlPlaneResponse) {
      return instanceControlPlaneResponse;
    }

    const identityControlPlaneResponse = await handleIdentityControlPlaneApiRequest(
      authorityRequestWithOriginalUrlFacts(capabilityForwardRequests.identity, {
        hostSessionTarget: mappedInstanceManagementTargetFromFacts({
          requestOrigin: requestOriginForAuth(request),
          runtimeRoute,
        }),
      }),
      env,
    );

    if (identityControlPlaneResponse) {
      return identityControlPlaneResponse;
    }

    const instanceDomainProviderResponse = await handleInstanceDomainProviderApiRequest(
      capabilityForwardRequests.domainProvider,
      env,
    );

    if (instanceDomainProviderResponse) {
      return instanceDomainProviderResponse;
    }

    const instanceDeploymentRuntimeResponse = await handleInstanceDeploymentRuntimeApiRequest(
      capabilityForwardRequests.deployment,
      env,
    );

    if (instanceDeploymentRuntimeResponse) {
      return instanceDeploymentRuntimeResponse;
    }

    const instanceEmailRuntimeResponse = await handleInstanceEmailRuntimeApiRequest(
      capabilityForwardRequests.email,
      env,
    );

    if (instanceEmailRuntimeResponse) {
      return instanceEmailRuntimeResponse;
    }

    const instanceDomainMappingsResponse = await handleInstanceDomainMappingsApiRequest(
      capabilityForwardRequests.domainMappings,
      env,
    );

    if (instanceDomainMappingsResponse) {
      return instanceDomainMappingsResponse;
    }

    if (authorityRoute) {
      const installedAppRouteAccess = installedAppApiRouteAccessFromFacts({
        requestOrigin: requestOriginForAuth(request),
        runtimeRoute,
        storageIdentity: authorityRoute.identity.authorityName,
      });
      const hostSessionTarget = installedAppRouteAccess.target;

      if (
        authorityRoute.identity.kind === "schemaKey" &&
        (mappedRoutePolicy.blocksSchemaKeyApiRoutes ||
          !areSchemaKeyApiRoutesEnabledForRequest(request, requestTopology))
      ) {
        return Response.json({ error: "Not found." }, { status: 404 });
      }

      const routeAccessAuthorization = await authorizeInstalledAppRouteAccess(
        request,
        env,
        installedAppRouteAccess.access,
        hostSessionTarget,
      );

      if (routeAccessAuthorization) {
        return routeAccessAuthorization;
      }

      const routeAccess = installedAppRouteAccess.access;

      if (
        authorityRoute.identity.kind === "appInstall" &&
        (routeAccess === undefined || routeAccess === "owner") &&
        isInstalledAppManagementApiRead(request, authorityRoute.path)
      ) {
        const managementHostSessionTarget =
          hostSessionTarget ??
          mappedInstanceManagementTargetFromFacts({
            requestOrigin: requestOriginForAuth(request),
            runtimeRoute,
          });
        const authorization = await authorizeOwnerManagementRead(request, env, {
          hostSessionTarget: managementHostSessionTarget,
        });

        if (!authorization.authorized) {
          return Response.json(
            { error: authorization.error },
            {
              headers: authorization.headers,
              status: authorization.status,
            },
          );
        }
      }

      const authorityId = env.FORMLESS_AUTHORITY.idFromName(authorityRoute.identity.authorityName);
      const authority = env.FORMLESS_AUTHORITY.get(authorityId);

      return authority.fetch(
        authorityRequestWithOriginalUrlFacts(authorityForwardRequest ?? request, {
          hostSessionTarget,
        }),
      );
    }

    const ownerBrowserRedirect = await redirectAnonymousProtectedBrowserRoute(
      request,
      env,
      requestTopology,
      runtimeRoute,
    );

    if (ownerBrowserRedirect) {
      return ownerBrowserRedirect;
    }

    const siteDocumentResponse = await handlePublicSiteDocumentRequest(request, env, {
      mappedSiteHost,
      packageResolver,
      runtimeTopology: requestTopology,
    });

    if (siteDocumentResponse) {
      return siteDocumentResponse;
    }

    if (env.ASSETS && shouldDeferToStaticAssets(request, requestTopology)) {
      const clientAssetResponse = await handleClientAssetRequest(request, env, {
        mappedAppHost,
        runtimeTopology: requestTopology,
      });

      if (clientAssetResponse) {
        return clientAssetResponse;
      }
    }

    return new Response(null, { status: 404 });
  },
  async queue(batch, env) {
    await handleInstanceEmailDeliveryQueueBatch(batch, env);
  },
} satisfies ExportedHandler<Env>;

function redirectResponse(location: string, status: number): Response {
  return new Response(null, {
    headers: {
      Location: location,
    },
    status,
  });
}

function isInstanceAuthApiRoute(pathname: string): boolean {
  return (
    isLocalSessionBootstrapApiPath(pathname) ||
    pathname === "/api/formless/setup" ||
    pathname.startsWith("/api/formless/setup/") ||
    pathname === "/api/formless/session" ||
    pathname.startsWith("/api/formless/session/") ||
    pathname === "/api/formless/passkeys" ||
    pathname.startsWith("/api/formless/passkeys/")
  );
}

function isReservedAuthOriginRoute(pathname: string): boolean {
  return isInstanceAuthApiRoute(pathname) || isRuntimeAuthAccountRoutePath(pathname);
}

async function handleAuthAccountStatusRequest(
  request: Request,
  env: Env,
  requestTopology: WorkerRuntimeRequestTopology,
): Promise<Response | undefined> {
  if (
    !isRuntimeAuthAccountRoutePath(requestTopology.pathname) ||
    !requestTopology.readMethod ||
    requestTopology.acceptsHtml ||
    requestTopology.apiPath ||
    requestTopology.staticAssetPath
  ) {
    return undefined;
  }

  const authOrigin = await configuredInstanceAuthOrigin(request, env);

  if (!authOrigin || authOrigin !== requestOriginForAuth(request)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  try {
    const handoffContinuation = await resolveAuthAccountHandoffContinuation(request, env);

    if (handoffContinuation?.kind === "login-required") {
      return Response.json(
        { error: "Authenticated account session is required." },
        { status: 401 },
      );
    }

    if (handoffContinuation?.kind === "blocked") {
      return accountCompletionBlockedResponse(handoffContinuation.accountCompletion);
    }

    if (handoffContinuation?.kind === "complete") {
      return Response.json(handoffContinuation.accountCompletion);
    }

    if (handoffContinuation?.kind === "forbidden") {
      return accountAuthorizationForbiddenResponse(handoffContinuation.accountAuthorization);
    }

    return await handleAuthAccountReturnTargetStatusRequest(request, env);
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 400 });
  }
}

async function handleAuthAccountBrowserRequest(
  request: Request,
  env: Env,
  requestTopology: WorkerRuntimeRequestTopology,
): Promise<Response | undefined> {
  if (
    !isRuntimeAuthAccountRoutePath(requestTopology.pathname) ||
    !requestTopology.readMethod ||
    !requestTopology.acceptsHtml ||
    requestTopology.apiPath ||
    requestTopology.staticAssetPath
  ) {
    return undefined;
  }

  const authOrigin = await configuredInstanceAuthOrigin(request, env);

  if (!authOrigin) {
    return new Response(null, { status: 404 });
  }

  if (authOrigin !== requestOriginForAuth(request)) {
    return redirectResponse(authOriginLocationForRequest(authOrigin, request), 302);
  }

  const handoffContinuation = await handleAuthAccountHandoffBrowserContinuation(request, env);

  if (handoffContinuation?.kind === "response") {
    return handoffContinuation.response;
  }

  if (handoffContinuation?.kind === "blocked") {
    return await handleClientShellDocumentRequest(request, env);
  }

  if (handoffContinuation?.kind === "forbidden") {
    return await handleClientShellDocumentRequest(request, env);
  }

  const returnTargetContinuation = await handleAuthAccountReturnTargetBrowserRequest(request, env);

  if (returnTargetContinuation?.kind === "response") {
    return returnTargetContinuation.response;
  }

  if (returnTargetContinuation?.kind === "blocked") {
    return await handleClientShellDocumentRequest(request, env);
  }

  return await handleClientShellDocumentRequest(request, env);
}

async function handleAuthAccountReturnTargetBrowserRequest(
  request: Request,
  env: Env,
): Promise<{ kind: "blocked" } | { kind: "response"; response: Response } | undefined> {
  const rawReturnTo = new URL(request.url).searchParams.get("returnTo");

  if (rawReturnTo === null) {
    return undefined;
  }

  const resolution = await resolveAuthAccountReturnTargetContinuation(request, env);

  switch (resolution.kind) {
    case "blocked":
      return { kind: "blocked" };
    case "complete":
      return {
        kind: "response",
        response: redirectResponse(resolution.accountCompletion.continueTo, 302),
      };
    case "forbidden":
      return { kind: "blocked" };
    case "invalid":
      return {
        kind: "response",
        response: Response.json({ error: resolution.error }, { status: 400 }),
      };
    case "login-required":
      return {
        kind: "response",
        response: redirectResponse(
          accountRedirectLocationForRoute(authAccountRedirectTarget(request)),
          302,
        ),
      };
  }
}

async function handleAuthAccountReturnTargetStatusRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  const resolution = await resolveAuthAccountReturnTargetContinuation(request, env);

  if (resolution.kind === "complete") {
    return Response.json(resolution.accountCompletion);
  }

  if (resolution.kind === "blocked") {
    return accountCompletionBlockedResponse(resolution.accountCompletion);
  }

  if (resolution.kind === "forbidden") {
    return accountAuthorizationForbiddenResponse(resolution.accountAuthorization);
  }

  if (resolution.kind === "invalid") {
    return Response.json({ error: resolution.error }, { status: 400 });
  }

  return Response.json({ error: "Authenticated account session is required." }, { status: 401 });
}

type AuthAccountReturnTargetContinuation =
  | { accountCompletion: AccountCompletionGateResult; kind: "blocked" }
  | { accountCompletion: AccountCompletionContinuationResult; kind: "complete" }
  | { accountAuthorization: AccountAuthorizationForbiddenResult; kind: "forbidden" }
  | { error: string; kind: "invalid" }
  | { kind: "login-required" };

async function resolveAuthAccountReturnTargetContinuation(
  request: Request,
  env: Env,
): Promise<AuthAccountReturnTargetContinuation> {
  const returnTo = parseAccountRedirectTarget(new URL(request.url).searchParams.get("returnTo"));

  if (!returnTo) {
    return { error: "Account return target must be path-only.", kind: "invalid" };
  }

  const targetUrl = new URL(returnTo, request.url);
  const targetRequest = new Request(targetUrl, {
    headers: request.headers,
    method: request.method,
  });
  const runtimeRoute = await resolveInstanceRuntimeRouteForRequest(targetRequest, env);
  const runtimeProfile =
    runtimeRoute?.kind === "mount" &&
    runtimeRoute.matchHost !== undefined &&
    runtimeRoute.targetProfile !== "public-site"
      ? runtimeRoute.targetProfile
      : env.FORMLESS_RUNTIME_PROFILE;
  const targetTopology = resolveWorkerRuntimeRequestTopology(
    targetRequest,
    workerRuntimeProfileInput(runtimeProfile),
  );
  const target = resolveProtectedBrowserRouteTargetFromFacts({
    runtimeRoute,
    topology: targetTopology,
  });

  if (target === undefined) {
    return { error: "Account continuation target is public.", kind: "invalid" };
  }

  const requiredAccess = target.requiredAccess;

  const accountCompletionTarget = sameOriginAccountCompletionTargetForRuntimeRouteFacts({
    accountOrigin: requestOriginForAuth(request),
    ...(target.programScreen === undefined ? { minimumAccess: "authenticated" as const } : {}),
    requestOrigin: requestOriginForAuth(targetRequest),
    returnTo,
    runtimeProfile: targetTopology.profileKind,
    runtimeRoute,
  });

  if (accountCompletionTarget === undefined) {
    return { error: "Account completion target is unavailable.", kind: "invalid" };
  }
  const session = await validateRouteAccessSession(targetRequest, env, {
    ...(target.programScreen === undefined
      ? {}
      : { programScreenAccess: target.programScreen.access }),
    requiredAccess,
    ...(runtimeRoute?.kind === "mount" ? { runtimeRoute } : {}),
  });

  if (session.ok) {
    return {
      accountCompletion: {
        continueTo: returnTo,
        status: "complete",
        target: accountCompletionTarget,
      },
      kind: "complete",
    };
  }

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

  return { kind: "login-required" };
}

async function handleNonAuthOriginOwnerAuthRoute(
  request: Request,
  env: Env,
  requestTopology: WorkerRuntimeRequestTopology,
  runtimeRoute: Awaited<ReturnType<typeof resolveInstanceRuntimeRouteForRequest>>,
): Promise<Response | undefined> {
  if (!isInstanceAuthApiRoute(requestTopology.pathname)) {
    return undefined;
  }

  const authOrigin = await configuredInstanceAuthOrigin(request, env);

  if (!authOrigin || authOrigin === requestOriginForAuth(request)) {
    return undefined;
  }

  if (isMappedInstanceHostSessionApiRequest(requestTopology, request)) {
    const hostSessionTarget = mappedInstanceManagementTargetFromFacts({
      requestOrigin: requestOriginForAuth(request),
      runtimeRoute,
    });

    if (hostSessionTarget) {
      return await handleOwnerSetupApiRequest(
        authorityRequestWithOriginalUrlFacts(request, { hostSessionTarget }),
        env,
      );
    }
  }

  return notFoundResponse(requestTopology.apiPath);
}

function isMappedInstanceHostSessionApiRequest(
  requestTopology: WorkerRuntimeRequestTopology,
  request: Request,
): boolean {
  return (
    (requestTopology.pathname === ACCOUNT_SESSION_API_PATH ||
      requestTopology.pathname === ACCOUNT_SESSION_LOGOUT_API_PATH) &&
    requestHasCookie(request, HOST_AUTH_SESSION_COOKIE_NAME)
  );
}

function authOriginLocationForRequest(authOrigin: string, request: Request): string {
  const sourceUrl = new URL(request.url);
  const location = new URL(authOrigin);

  location.pathname = sourceUrl.pathname;
  location.search = sourceUrl.search;

  return location.toString();
}

function isInstalledAppManagementApiRead(request: Request, path: `/${string}`): boolean {
  const operation = selectAuthorityOperation({
    method: request.method,
    path,
    searchParams: new URL(request.url).searchParams,
  });

  if (operation?.metadata.mode === "read") {
    return operation.kind === "exportSnapshot";
  }

  return false;
}

async function authorizeInstalledAppRouteAccess(
  request: Request,
  env: Env,
  access: ReturnType<typeof installedAppApiRouteAccessFromFacts>["access"],
  hostSessionTarget: ReturnType<typeof hostAuthSessionTargetForRuntimeRoute>,
): Promise<Response | undefined> {
  if (access === undefined || access === "anonymous") {
    return undefined;
  }

  const authorization = await validateRouteAccessSession(request, env, {
    requiredAccess: access,
    target: hostSessionTarget,
  });

  if (authorization.ok) {
    return undefined;
  }

  if (
    authorization.reason === "account-completion-required" &&
    authorization.accountCompletion !== undefined
  ) {
    return accountCompletionBlockedResponse(authorization.accountCompletion);
  }

  return Response.json(
    { error: "Authenticated session is required for this route." },
    {
      headers: {
        "WWW-Authenticate": 'Bearer realm="formless-authenticated"',
      },
      status: 401,
    },
  );
}

function workerWorkspaceGatewayRouteAvailable(
  requestTopology: WorkerRuntimeRequestTopology,
  runtimeRoute: Awaited<ReturnType<typeof resolveInstanceRuntimeRouteForRequest>>,
): boolean {
  return (
    requestTopology.routePolicy.workspaceGatewayApiRoutes &&
    !(runtimeRoute?.kind === "mount" && runtimeRoute.matchHost !== undefined)
  );
}

async function redirectAnonymousProtectedBrowserRoute(
  request: Request,
  env: Env,
  requestTopology: WorkerRuntimeRequestTopology,
  exactHostRuntimeRoute: Awaited<ReturnType<typeof resolveInstanceRuntimeRouteForRequest>>,
): Promise<Response | undefined> {
  let decision = protectedBrowserRouteDecisionFromFacts({
    runtimeRoute: exactHostRuntimeRoute,
    session: "unread",
    topology: requestTopology,
  });

  if (decision.kind !== "validate-session") {
    return undefined;
  }

  const runtimeRoute =
    exactHostRuntimeRoute?.kind === "mount"
      ? exactHostRuntimeRoute
      : await resolveInstanceRuntimeRouteForRequest(request, env);

  decision = protectedBrowserRouteDecisionFromFacts({
    runtimeRoute,
    session: "unread",
    topology: requestTopology,
  });

  if (decision.kind !== "validate-session") {
    return undefined;
  }

  const session = await validateRouteAccessSession(request, env, {
    ...(decision.programScreen === undefined
      ? {}
      : { programScreenAccess: decision.programScreen.access }),
    requiredAccess: decision.requiredAccess,
    ...(runtimeRoute?.kind === "mount" ? { runtimeRoute } : {}),
  });
  const requiredAccess = decision.requiredAccess;
  const programScreen = decision.programScreen;

  decision = protectedBrowserRouteDecisionFromFacts({
    runtimeRoute,
    session: session.ok
      ? "allowed"
      : session.reason === "account-completion-required" && session.accountCompletion !== undefined
        ? "account-completion-required"
        : "rejected",
    topology: requestTopology,
  });

  if (decision.kind === "continue") {
    return undefined;
  }

  if (decision.kind === "account-completion" && !session.ok && session.accountCompletion) {
    return (
      (await startProtectedRouteAuthAccount(request, env, runtimeRoute, requiredAccess, {
        allowRouteAccessElevation: programScreen !== undefined,
      })) ?? accountCompletionBlockedResponse(session.accountCompletion)
    );
  }

  if (!session.ok && session.authenticated !== undefined) {
    return accountAuthorizationForbiddenResponse(
      accountAuthorizationForbiddenResult(session.authenticated.principal),
    );
  }

  const accountRedirect = await startProtectedRouteAuthAccount(
    request,
    env,
    runtimeRoute,
    requiredAccess,
    {
      allowRouteAccessElevation: programScreen !== undefined,
    },
  );

  if (accountRedirect) {
    return accountRedirect;
  }

  return redirectResponse(
    accountRedirectLocationForRoute(ownerBrowserRedirectTarget(request)),
    302,
  );
}

function ownerBrowserRedirectTarget(request: Request) {
  const url = new URL(request.url);

  return `${url.pathname}${url.search}`;
}

function authAccountRedirectTarget(request: Request) {
  const url = new URL(request.url);
  const target = `${runtimeTopologyRoutes.authAccountRoute}${url.search}`;

  return parseAccountRedirectTarget(target) ?? runtimeTopologyRoutes.authAccountRoute;
}

function notFoundResponse(json: boolean): Response {
  return json
    ? Response.json({ error: "Not found." }, { status: 404 })
    : new Response(null, { status: 404 });
}

function requestHasCookie(request: Request, name: string): boolean {
  const header = request.headers.get("Cookie");

  if (!header) {
    return false;
  }

  return header.split(";").some((part) => part.split("=", 1)[0]?.trim() === name);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error.";
}

const FORMLESS_ORIGINAL_REQUEST_HOST_HEADER = "x-formless-original-request-host";
const FORMLESS_ORIGINAL_REQUEST_ORIGIN_HEADER = "x-formless-original-request-origin";

function authorityRequestWithOriginalUrlFacts(
  request: Request,
  options: {
    hostSessionTarget?: Parameters<typeof setHostAuthSessionTargetHeaders>[1];
  } = {},
): Request {
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  const forwardedHost = originalRequestHost(request);

  headers.set(FORMLESS_ORIGINAL_REQUEST_HOST_HEADER, forwardedHost ?? url.host);
  headers.set(FORMLESS_ORIGINAL_REQUEST_ORIGIN_HEADER, originalRequestOrigin(request));
  setHostAuthSessionTargetHeaders(headers, options.hostSessionTarget);

  return new Request(request, { headers });
}

function originalRequestOrigin(request: Request): string {
  const url = new URL(request.url);
  const forwardedHost = originalRequestHost(request);

  if (!forwardedHost) {
    return url.origin;
  }

  const forwardedProto =
    firstHeaderValue(request.headers.get("x-forwarded-proto")) ??
    forwardedHeaderValue(request.headers.get("forwarded"), "proto") ??
    url.protocol.replace(/:$/, "");

  return `${forwardedProto}://${forwardedHost}`;
}

function originalRequestHost(request: Request): string | undefined {
  return (
    firstHeaderValue(request.headers.get("x-forwarded-host")) ??
    forwardedHeaderValue(request.headers.get("forwarded"), "host")
  );
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

async function readOwnerSetupStatus(
  request: Request,
  env: Env,
): Promise<{ setupComplete: boolean }> {
  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);
  const response = await env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(new URL("/api/formless/setup", request.url), {
      headers: { accept: "application/json" },
      method: "GET",
    }),
  );

  if (!response.ok) {
    return { setupComplete: false };
  }

  const body = (await response.json()) as Partial<{ setupComplete: boolean }>;

  return { setupComplete: body.setupComplete === true };
}
