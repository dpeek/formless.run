import { DurableObject } from "cloudflare:workers";
import type {
  BootstrapResponse,
  SchemaResponse,
  SyncResponse,
  SyncSocketAttachment,
  SyncSocketServerMessage,
} from "../shared/protocol.ts";
import { isSyncSocketAttachment, isSyncSocketClientMessage } from "../shared/protocol.ts";
import {
  installedAppStorageIdentity,
  parseAuthorityApiRoute,
  programStorageIdentity,
  type AuthorityStorageIdentity,
} from "../shared/app-storage-identity.ts";
import type { StoredRecord } from "@dpeek/formless-storage";
import { handleInstanceArchiveDurableObjectRequest } from "./archive-api.ts";
import {
  ensureStorageTables,
  getChangesAfter,
  getCurrentCursor,
  initializeStorageFromSource,
  resetStorageToEmpty,
  readProgramConvergenceSourceState,
  ActiveSchemaRefreshBlockedError,
  type PackageAppSchemaProvenance,
  type StorageSource,
  type WriteOutcome,
} from "./storage.ts";
import { BadRequestError, ReloadRequiredError } from "./errors.ts";
import type { Env } from "./index.ts";
import {
  authorizeAuthorityOperation,
  authorizeInstanceWrite,
  authorizeOwnerManagementRead,
  authorizeProgramAccess,
  type AuthorityAdminGuardResult,
} from "./authority-admin-guard.ts";
import {
  executeAuthorityOperation,
  selectAuthorityOperation,
  type AuthorityOperation,
  type OperationInvocationActorCandidates,
} from "./authority-operations.ts";
import type { OperationInvocationActor } from "../shared/operation-invocation.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import { handleInstanceAppInstallsDurableObjectRequest } from "./instance-app-installs.ts";
import { handleInstanceControlPlaneDurableObjectRequest } from "./instance-control-plane.ts";
import {
  handleCollaboratorInvitationDeliveryDurableObjectRequest,
  handleCollaboratorInvitationTokenRevocationDurableObjectRequest,
  handleIdentityControlPlaneDurableObjectRequest,
  resolveIdentityAppReferenceTarget,
} from "./identity-control-plane.ts";
import { handleOwnerSetupDurableObjectRequest } from "./owner-setup.ts";
import { handleAccountPasskeyDurableObjectRequest } from "./account-passkeys.ts";
import { handleCollaboratorInvitationAcceptanceDurableObjectRequest } from "./collaborator-invitation-acceptance.ts";
import { handleInstanceAuthEmailVerificationDurableObjectRequest } from "./instance-auth-email-verification.ts";
import { handleInstanceAuthOwnerSetupDurableObjectRequest } from "./instance-auth-owner-setup.ts";
import { handleInstanceAuthSignupDurableObjectRequest } from "./instance-auth-signup.ts";
import {
  handleInstanceAuthAccountCompletionDurableObjectRequest,
  INTERNAL_AUTH_PROFILE_COMPLETION_OPERATION_PATH,
  INTERNAL_AUTH_PROFILE_COMPLETION_SCHEMA_PATH,
} from "./instance-auth-account-completion.ts";
import { handleInstanceDomainProviderDurableObjectRequest } from "./domain-provider-api.ts";
import { handleInstanceDomainMappingsDurableObjectRequest } from "./instance-domain-mappings.ts";
import { handleInstanceDeploymentRuntimeDurableObjectRequest } from "./deployment-runtime-api.ts";
import { handleInstanceEmailRuntimeDurableObjectRequest } from "./email-runtime.ts";
import { ensureRuntimeInstanceAuthConfig } from "./instance-auth-runtime.ts";
import {
  authenticatedOperationActorForSession,
  bindInstanceAuthAccessSession,
  handleInstanceAuthHandoffDurableObjectRequest,
  hostAuthSessionTargetFromRequestHeaders,
  validateBoundInstanceAuthAccessSession,
  validateBoundProgramAccessSession,
  validateCentralAuthSessionAuthority,
  validateCentralAuthSessionPrincipal,
  validateHostAuthSessionAuthority,
  validateInstanceAuthAccessSession,
} from "./instance-auth-handoff.ts";
import { validateOwnerSessionAuthority, validateOwnerSessionPrincipal } from "./owner-session.ts";
import {
  handleLocalSessionBootstrapDurableObjectRequest,
  isLocalOwnerSessionRuntime,
} from "./local-session-bootstrap.ts";
import {
  executePublicOperationRequest,
  PublicOperationError,
  selectPublicOperationRoute,
} from "./public-operations.ts";
import {
  createSiteContactNotificationAdapters,
  scheduleSiteContactNotificationAfterPublicOperation,
} from "./site-contact-notifications.ts";
import {
  createSiteOperationInputNotificationAdapters,
  scheduleSiteOperationInputNotificationAfterPublicOperation,
} from "./site-operation-input-notifications.ts";
import { turnstileSiteKeyFromEnv } from "../shared/turnstile-config.ts";
import {
  handleAppStorageUpgradeStatusDurableObjectRequest,
  handleInstanceUpgradeStatusDurableObjectRequest,
} from "./upgrade-status-api.ts";
import {
  activeAppPackageResolver,
  activeWorkerSourceSchemas,
  findActiveWorkerSchemaAppDefinition,
  listActiveAppPackages,
  type WorkerAppDefinition,
} from "./runtime-app-packages.ts";
import { INTERNAL_PUBLIC_SITE_BOOTSTRAP_PATH } from "./public-site-worker-runtime.ts";
import { IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY } from "@dpeek/formless-identity-control-plane";
import {
  FORMLESS_PROGRAM_REPLICA_ACCESS_REQUIREMENT,
  formlessProgramSchema,
} from "../program/runtime.ts";
import {
  FORMLESS_PROGRAM_SCHEMA_KEY,
  FORMLESS_PROGRAM_STORAGE_IDENTITY,
} from "../program/target.ts";
import {
  ensureFormlessProgramStorage,
  formlessProgramApp,
  formlessProgramSource,
  INTERNAL_PROGRAM_CONVERGENCE_SOURCE_PATH,
  validateFormlessProgramRecordConstraint,
} from "./program-authority.ts";

export const INTERNAL_RESET_APP_STORAGE_PATH = "/_internal/reset-app-storage";

type InstalledAppSyncSocketAuthorization =
  | { kind: "open" }
  | {
      access: unknown;
      appInstallId: string;
      kind: "instance-auth";
      packageAppKey: string;
      storageIdentity: string;
    };

type ProgramSyncSocketAuthorization =
  | {
      access: unknown;
      kind: "program-access";
      storageIdentity: string;
    }
  | {
      authorization: string;
      kind: "program-admin-bearer";
      storageIdentity: string;
    };

type AuthoritySyncSocketAttachment = SyncSocketAttachment & {
  authorization?: InstalledAppSyncSocketAuthorization | ProgramSyncSocketAuthorization;
};

export class FormlessAuthority extends DurableObject<Env> {
  private readonly bindings: Env;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.bindings = env;
  }

  async fetch(request: Request) {
    const url = new URL(request.url);

    if (url.pathname === INTERNAL_RESET_APP_STORAGE_PATH) {
      if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "POST" });
      }

      resetStorageToEmpty(this.ctx.storage);

      return jsonResponse({ reset: true });
    }

    if (
      this.ctx.id.name === IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY &&
      url.pathname === INTERNAL_PROGRAM_CONVERGENCE_SOURCE_PATH
    ) {
      if (request.method !== "GET") {
        return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "GET" });
      }

      return jsonResponse({
        state: readProgramConvergenceSourceState(this.ctx.storage) ?? null,
      });
    }

    if (this.ctx.id.name === FORMLESS_PROGRAM_STORAGE_IDENTITY) {
      try {
        ensureFormlessProgramStorage(
          this.ctx.storage,
          await readLegacyIdentityStorageState(this.bindings),
          activeAppPackageResolver(this.bindings),
        );
      } catch (error) {
        return jsonResponse(
          {
            error: error instanceof Error ? error.message : "Program convergence preflight failed.",
          },
          409,
        );
      }
    }

    if (this.ctx.id.name === FORMLESS_INSTANCE_AUTHORITY_NAME) {
      await ensureRuntimeInstanceAuthConfig(this.ctx.storage, request, this.bindings);
    }

    const localSessionBootstrapResponse = await handleLocalSessionBootstrapDurableObjectRequest(
      request,
      this.ctx.storage,
      this.bindings,
    );

    if (localSessionBootstrapResponse) {
      return localSessionBootstrapResponse;
    }

    const ownerSetupResponse = await handleOwnerSetupDurableObjectRequest(
      request,
      this.ctx.storage,
      this.bindings,
    );

    if (ownerSetupResponse) {
      return ownerSetupResponse;
    }

    const instanceUpgradeStatusResponse = await handleInstanceUpgradeStatusDurableObjectRequest(
      request,
      this.ctx.storage,
      this.bindings,
    );

    if (instanceUpgradeStatusResponse) {
      return instanceUpgradeStatusResponse;
    }

    const accountPasskeyResponse = await handleAccountPasskeyDurableObjectRequest(
      request,
      this.ctx.storage,
      this.bindings,
    );

    if (accountPasskeyResponse) {
      return accountPasskeyResponse;
    }

    const collaboratorInvitationAcceptanceResponse =
      await handleCollaboratorInvitationAcceptanceDurableObjectRequest(
        request,
        this.ctx.storage,
        this.bindings,
      );

    if (collaboratorInvitationAcceptanceResponse) {
      return collaboratorInvitationAcceptanceResponse;
    }

    const instanceAuthEmailVerificationResponse =
      await handleInstanceAuthEmailVerificationDurableObjectRequest(
        request,
        this.ctx.storage,
        this.bindings,
      );

    if (instanceAuthEmailVerificationResponse) {
      return instanceAuthEmailVerificationResponse;
    }

    const instanceAuthOwnerSetupResponse = await handleInstanceAuthOwnerSetupDurableObjectRequest(
      request,
      this.ctx.storage,
      this.bindings,
    );

    if (instanceAuthOwnerSetupResponse) {
      return instanceAuthOwnerSetupResponse;
    }

    const instanceAuthSignupResponse = await handleInstanceAuthSignupDurableObjectRequest(
      request,
      this.ctx.storage,
      this.bindings,
    );

    if (instanceAuthSignupResponse) {
      return instanceAuthSignupResponse;
    }

    const instanceAuthHandoffResponse = await handleInstanceAuthHandoffDurableObjectRequest(
      request,
      this.ctx.storage,
      this.bindings,
    );

    if (instanceAuthHandoffResponse) {
      return instanceAuthHandoffResponse;
    }

    if (this.ctx.id.name === FORMLESS_INSTANCE_AUTHORITY_NAME) {
      const accountCompletionResponse =
        await handleInstanceAuthAccountCompletionDurableObjectRequest(
          request,
          this.ctx.storage,
          this.bindings,
        );

      if (accountCompletionResponse) {
        return accountCompletionResponse;
      }
    }

    const instanceDomainMappingsResponse = await handleInstanceDomainMappingsDurableObjectRequest(
      request,
      this.ctx.storage,
      this.bindings,
    );

    if (instanceDomainMappingsResponse) {
      return instanceDomainMappingsResponse;
    }

    const instanceDomainProviderResponse = await handleInstanceDomainProviderDurableObjectRequest(
      request,
      this.ctx.storage,
      this.bindings,
    );

    if (instanceDomainProviderResponse) {
      return instanceDomainProviderResponse;
    }

    const instanceDeploymentRuntimeResponse =
      await handleInstanceDeploymentRuntimeDurableObjectRequest(
        request,
        this.ctx.storage,
        this.bindings,
      );

    if (instanceDeploymentRuntimeResponse) {
      return instanceDeploymentRuntimeResponse;
    }

    const collaboratorInvitationDeliveryResponse =
      await handleCollaboratorInvitationDeliveryDurableObjectRequest(
        request,
        this.ctx.storage,
        this.bindings,
      );

    if (collaboratorInvitationDeliveryResponse) {
      return collaboratorInvitationDeliveryResponse;
    }

    const collaboratorInvitationTokenRevocationResponse =
      await handleCollaboratorInvitationTokenRevocationDurableObjectRequest(
        request,
        this.ctx.storage,
      );

    if (collaboratorInvitationTokenRevocationResponse) {
      return collaboratorInvitationTokenRevocationResponse;
    }

    const instanceEmailRuntimeResponse = await handleInstanceEmailRuntimeDurableObjectRequest(
      request,
      this.ctx.storage,
      this.bindings,
    );

    if (instanceEmailRuntimeResponse) {
      return instanceEmailRuntimeResponse;
    }

    const instanceAppInstallsResponse = await handleInstanceAppInstallsDurableObjectRequest(
      request,
      this.ctx.storage,
      this.bindings,
    );

    if (instanceAppInstallsResponse) {
      return instanceAppInstallsResponse;
    }

    const instanceControlPlaneResponse = await handleInstanceControlPlaneDurableObjectRequest(
      request,
      this.ctx.storage,
      this.bindings,
      new AuthorityWriteModule(() => this.scheduleCommittedWriteBroadcast(formlessProgramSource())),
    );

    if (instanceControlPlaneResponse) {
      return instanceControlPlaneResponse;
    }

    const identityControlPlaneResponse = await handleIdentityControlPlaneDurableObjectRequest(
      request,
      this.ctx.storage,
      this.bindings,
    );

    if (identityControlPlaneResponse) {
      return identityControlPlaneResponse;
    }

    const instanceArchiveResponse = await handleInstanceArchiveDurableObjectRequest(
      request,
      this.ctx.storage,
      this.bindings,
    );

    if (instanceArchiveResponse) {
      return instanceArchiveResponse;
    }

    if (url.pathname === INTERNAL_PUBLIC_SITE_BOOTSTRAP_PATH) {
      if (request.method !== "GET") {
        return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "GET" });
      }

      const apiRoutePrefix = url.searchParams.get("apiRoutePrefix");
      const route = apiRoutePrefix
        ? parseAuthorityRoute(`${apiRoutePrefix}/bootstrap`, this.bindings)
        : undefined;

      if (!route || route.identity.authorityName !== this.ctx.id.name) {
        return jsonResponse({ error: "Not found." }, 404);
      }

      const source = storageSourceFromRoute(route, this.bindings);
      const operation = selectAuthorityOperation({
        method: "GET",
        path: "/bootstrap",
        searchParams: new URLSearchParams(),
      });

      if (!operation) {
        return jsonResponse({ error: "Not found." }, 404);
      }

      ensureStorageTables(this.ctx.storage);
      const result = await executeAuthorityOperation({
        app: route.app,
        identity: route.identity,
        operation,
        packageResolver: activeAppPackageResolver(this.bindings),
        source,
        sourceSchemas: activeWorkerSourceSchemas(this.bindings),
        storage: this.ctx.storage,
        writes: new AuthorityWriteModule(() => this.scheduleCommittedWriteBroadcast(source)),
      });

      return jsonResponse(result.body, result.status, result.headers);
    }

    const route = parseAuthorityRoute(url.pathname, this.bindings);

    if (!route) {
      return jsonResponse({ error: "Not found." }, 404);
    }

    try {
      if (isRetiredWriteRoute(request.method, route.path)) {
        const authorization = await authorizeInstanceWrite(request, this.bindings, {
          hostSessionTarget: hostAuthSessionTargetForAuthorityRoute(request, route.identity),
        });

        if (!authorization.authorized) {
          return jsonResponse(
            { error: authorization.error },
            authorization.status,
            authorization.headers,
          );
        }

        return jsonResponse({ error: "Not found." }, 404);
      }

      if (route.path === "/sync/ws") {
        return this.handleSyncWebSocketRequest(request, route.identity, route.app);
      }

      const source = storageSourceFromRoute(route, this.bindings);
      const writes = new AuthorityWriteModule(() => this.scheduleCommittedWriteBroadcast(source));

      const internalAuthProfileCompletionResponse =
        await handleInternalAuthProfileCompletionRequest({
          env: this.bindings,
          request,
          route,
          source,
          storage: this.ctx.storage,
          url,
          writes,
        });

      if (internalAuthProfileCompletionResponse) {
        return internalAuthProfileCompletionResponse;
      }

      const appStorageUpgradeStatusResponse =
        route.identity.kind === "program"
          ? undefined
          : await handleAppStorageUpgradeStatusDurableObjectRequest({
              env: this.bindings,
              identity: route.identity,
              path: route.path,
              request,
              storage: this.ctx.storage,
            });

      if (appStorageUpgradeStatusResponse) {
        return appStorageUpgradeStatusResponse;
      }

      if (request.method === "GET" && route.path === "/sync") {
        const cursor = url.searchParams.get("after");
        const parsedCursor = cursor === null ? 0 : Number(cursor);

        if (!Number.isInteger(parsedCursor) || parsedCursor < 0) {
          return jsonResponse({ error: "Sync cursor must be a non-negative integer." }, 400);
        }
      }

      const operation = selectAuthorityOperation({
        method: request.method,
        path: route.path,
        searchParams: url.searchParams,
      });
      const publicOperationRoute = selectPublicOperationRoute({
        method: request.method,
        path: route.path,
      });

      if (publicOperationRoute) {
        const publicIdentity = route.identity;
        const packageResolver = activeAppPackageResolver(this.bindings);
        const body = await readJson(request);
        ensureStorageTables(this.ctx.storage);
        const { schema } = initializeStorageFromSource(this.ctx.storage, source);
        const result = await executePublicOperationRequest({
          afterCommit: async (response) => {
            const operationInputNotificationRecords =
              await publicOperationInputNotificationSourceRecords({
                env: this.bindings,
                identity: publicIdentity,
                requestUrl: request.url,
                response,
              });

            await Promise.allSettled([
              scheduleSiteContactNotificationAfterPublicOperation({
                adapters: createSiteContactNotificationAdapters(this.bindings),
                identity: publicIdentity,
                requestUrl: request.url,
                response,
              }),
              scheduleSiteOperationInputNotificationAfterPublicOperation({
                adapters: createSiteOperationInputNotificationAdapters(this.bindings),
                identity: publicIdentity,
                requestUrl: request.url,
                response,
                ...(operationInputNotificationRecords === undefined
                  ? {}
                  : { records: operationInputNotificationRecords }),
                schema,
                storage: this.ctx.storage,
              }),
            ]);
          },
          body,
          env: this.bindings,
          identity: publicIdentity,
          identityReferenceResolver: (lookup) =>
            resolveIdentityAppReferenceTarget(this.bindings, lookup),
          request,
          route: publicOperationRoute,
          schema,
          storage: this.ctx.storage,
          validateConstraints:
            publicIdentity.kind === "program"
              ? validateFormlessProgramRecordConstraint(this.ctx.storage, packageResolver)
              : undefined,
          writes,
        });

        return jsonResponse(result.body, result.status, result.headers);
      }

      if (operation) {
        const hostSessionTarget = hostAuthSessionTargetForAuthorityRoute(request, route.identity);
        const installedAppDataAuthorization =
          route.identity.kind === "appInstall" && isInstalledAppDataOperation(operation)
            ? await authorizeInstalledAppDataRequest(
                request,
                this.bindings,
                route.identity,
                hostSessionTarget,
              )
            : undefined;
        const actorCandidates =
          operation.kind === "entityOperation"
            ? installedAppDataAuthorization?.authorized
              ? installedAppDataAuthorization.actorCandidates
              : installedAppDataAuthorization
                ? undefined
                : await operationActorCandidatesForRequest(
                    request,
                    this.bindings,
                    hostSessionTarget,
                  )
            : undefined;
        const authorization = installedAppDataAuthorization
          ? installedAppDataAuthorization.authorized
            ? { authorized: true as const }
            : await authorizeInstalledAppDataFallback(
                request,
                operation,
                this.bindings,
                hostSessionTarget,
              )
          : route.identity.kind === "appInstall" && operation.kind === "exportSnapshot"
            ? await authorizeOwnerManagementRead(request, this.bindings, {
                hostSessionTarget,
              })
            : operation.kind === "entityOperation"
              ? await authorizeEntityOperationRequest(request, operation, this.bindings, {
                  actorCandidates,
                  hostSessionTarget,
                })
              : await authorizeAuthorityOperation(request, operation, this.bindings, {
                  hostSessionTarget,
                });

        if (!authorization.authorized) {
          return jsonResponse(
            { error: authorization.error },
            authorization.status,
            authorization.headers,
          );
        }

        const body = operation.metadata.mode === "write" ? await readJson(request) : undefined;
        ensureStorageTables(this.ctx.storage);
        const result = await executeAuthorityOperation({
          app: route.app,
          body,
          identity: route.identity,
          identityReferenceResolver: (lookup) =>
            resolveIdentityAppReferenceTarget(this.bindings, lookup),
          operation,
          actorCandidates,
          packageResolver: activeAppPackageResolver(this.bindings),
          requestHeaders: request.headers,
          source,
          sourceSchemas: activeWorkerSourceSchemas(this.bindings),
          storage: this.ctx.storage,
          turnstileSiteKey: turnstileSiteKeyFromEnv(this.bindings),
          writes,
        });

        return jsonResponse(result.body, result.status, result.headers);
      }

      return jsonResponse({ error: "Not found." }, 404);
    } catch (error) {
      if (error instanceof PublicOperationError) {
        return jsonResponse({ error: error.message }, error.status, error.headers);
      }

      if (error instanceof BadRequestError) {
        return jsonResponse({ error: error.message }, 400);
      }

      if (error instanceof ReloadRequiredError) {
        return jsonResponse(error.body, error.status);
      }

      if (error instanceof ActiveSchemaRefreshBlockedError) {
        return jsonResponse({ error: error.message, blocker: error.blocker }, 409);
      }

      throw error;
    }
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    const parsedMessage = parseSyncSocketMessage(message);

    if (!parsedMessage) {
      closeMalformedSyncSocket(socket);
      return;
    }

    const currentAttachment = syncSocketAttachment(socket);

    if (!(await this.syncSocketAuthorized(socket, currentAttachment))) {
      closeUnauthorizedSyncSocket(socket);
      return;
    }

    ensureStorageTables(this.ctx.storage);
    const source = storageSourceFromSyncSocket(this.ctx, socket, this.bindings);
    const attachment = {
      ...currentAttachment,
      cursor: parsedMessage.cursor,
      schemaUpdatedAt: parsedMessage.schemaUpdatedAt,
    } satisfies AuthoritySyncSocketAttachment;

    sendSyncToSocket(this.ctx.storage, source, socket, attachment);
  }

  private async handleSyncWebSocketRequest(
    request: Request,
    identity: AuthorityStorageIdentity,
    app: WorkerAppDefinition,
  ) {
    if (request.method !== "GET") {
      return jsonResponse({ error: "WebSocket sync requires GET." }, 405, { Allow: "GET" });
    }

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return jsonResponse({ error: "Expected Upgrade: websocket." }, 426, {
        Upgrade: "websocket",
      });
    }

    const authorization =
      identity.kind === "appInstall"
        ? await this.installedAppSyncSocketAuthorization(request, identity)
        : identity.kind === "program"
          ? await this.programSyncSocketAuthorization(request, identity)
          : undefined;

    if (
      (identity.kind === "appInstall" || identity.kind === "program") &&
      authorization === undefined
    ) {
      return jsonResponse(
        {
          error:
            identity.kind === "program"
              ? "Current Program member, owner, or admin authorization is required for Program push sync."
              : "Owner or matching app administrator session is required for push sync.",
        },
        401,
        { "WWW-Authenticate": 'Bearer realm="formless-app-admin"' },
      );
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    server.serializeAttachment(initialSyncSocketAttachment(authorization));
    this.ctx.acceptWebSocket(server, [app.key]);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  private async installedAppSyncSocketAuthorization(
    request: Request,
    identity: Extract<AuthorityStorageIdentity, { kind: "appInstall" }>,
  ): Promise<InstalledAppSyncSocketAuthorization | undefined> {
    const target = hostAuthSessionTargetForAuthorityRoute(request, identity);
    const authorization = await authorizeInstalledAppDataRequest(
      request,
      this.bindings,
      identity,
      target,
    );

    if (authorization.authorized) {
      return {
        access: bindInstanceAuthAccessSession(authorization.access),
        appInstallId: identity.installId,
        kind: "instance-auth",
        packageAppKey: identity.packageAppKey,
        storageIdentity: identity.authorityName,
      };
    }

    const fallback = await authorizeOwnerManagementRead(request, this.bindings, {
      hostSessionTarget: target,
    });

    return fallback.authorized && fallback.via === "open" ? { kind: "open" } : undefined;
  }

  private async programSyncSocketAuthorization(
    request: Request,
    identity: Extract<AuthorityStorageIdentity, { kind: "program" }>,
  ): Promise<ProgramSyncSocketAuthorization | undefined> {
    const target = hostAuthSessionTargetForAuthorityRoute(request, identity);
    const authorization = await authorizeProgramAccess(
      request,
      this.bindings,
      FORMLESS_PROGRAM_REPLICA_ACCESS_REQUIREMENT,
      formlessProgramSchema,
      {
        error:
          "Current Program member, owner, or admin authorization is required for Program push sync.",
        hostSessionTarget: target,
      },
    );

    if (!authorization.authorized) {
      return undefined;
    }

    if (authorization.via === "admin-bearer") {
      const token = bearerTokenFromRequest(request);

      return token
        ? {
            authorization: token,
            kind: "program-admin-bearer",
            storageIdentity: identity.authorityName,
          }
        : undefined;
    }

    return authorization.session
      ? {
          access: bindInstanceAuthAccessSession({
            ok: true,
            ownerAuthorized:
              authorization.callerFacts.kind === "principal" && authorization.callerFacts.owner,
            principalId: authorization.session.principalId,
            session: authorization.session,
            via: authorization.via,
          }),
          kind: "program-access",
          storageIdentity: identity.authorityName,
        }
      : undefined;
  }

  private async syncSocketAuthorized(
    socket: WebSocket,
    attachment: AuthoritySyncSocketAttachment,
  ): Promise<boolean> {
    const authorization = attachment.authorization;

    if (authorization === undefined) {
      return (
        this.ctx.id.name !== FORMLESS_PROGRAM_STORAGE_IDENTITY &&
        this.ctx.id.name?.startsWith("app:") !== true
      );
    }

    if (authorization.kind === "open") {
      return (
        this.ctx.id.name?.startsWith("app:") === true && installedAppOpenSyncAllowed(this.bindings)
      );
    }

    if (authorization.kind === "program-admin-bearer") {
      return (
        authorization.storageIdentity === FORMLESS_PROGRAM_STORAGE_IDENTITY &&
        authorization.storageIdentity === this.ctx.id.name &&
        authorization.authorization === this.bindings.FORMLESS_ADMIN_TOKEN?.trim()
      );
    }

    if (authorization.kind === "program-access") {
      return (
        this.ctx.getTags(socket)[0] === FORMLESS_PROGRAM_SCHEMA_KEY &&
        authorization.storageIdentity === FORMLESS_PROGRAM_STORAGE_IDENTITY &&
        authorization.storageIdentity === this.ctx.id.name &&
        (await validateBoundProgramAccessSession(authorization.access, this.bindings, {
          access: FORMLESS_PROGRAM_REPLICA_ACCESS_REQUIREMENT,
          schema: formlessProgramSchema,
          storageIdentity: authorization.storageIdentity,
        }))
      );
    }

    const identity = installedAppStorageIdentity(
      {
        installId: authorization.appInstallId,
        packageAppKey: authorization.packageAppKey,
      },
      activeAppPackageResolver(this.bindings),
    );

    if (
      identity === undefined ||
      identity.sourceSchemaKey !== this.ctx.getTags(socket)[0] ||
      authorization.storageIdentity !== this.ctx.id.name ||
      authorization.storageIdentity !== identity.authorityName
    ) {
      return false;
    }

    return validateBoundInstanceAuthAccessSession(authorization.access, this.bindings, {
      appInstallId: authorization.appInstallId,
      storageIdentity: authorization.storageIdentity,
    });
  }

  private scheduleCommittedWriteBroadcast(source: StorageSource) {
    this.ctx.waitUntil(this.broadcastCommittedWrite(source));
  }

  private async broadcastCommittedWrite(source: StorageSource) {
    await Promise.allSettled(
      this.ctx.getWebSockets().map(async (socket) => {
        const attachment = syncSocketAttachment(socket);

        if (!(await this.syncSocketAuthorized(socket, attachment))) {
          closeUnauthorizedSyncSocket(socket);
          return;
        }

        sendSyncToSocket(this.ctx.storage, source, socket, attachment);
      }),
    );
  }
}

async function readLegacyIdentityStorageState(env: Env) {
  const id = env.FORMLESS_AUTHORITY.idFromName(IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY);
  const response = await env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(`http://internal${INTERNAL_PROGRAM_CONVERGENCE_SOURCE_PATH}`),
  );

  if (!response.ok) {
    throw new Error("Could not read the legacy identity Authority convergence snapshot.");
  }

  const body = (await response.json()) as {
    state?: ReturnType<typeof readProgramConvergenceSourceState> | null;
  };

  return body.state ?? undefined;
}

function hostAuthSessionTargetForAuthorityRoute(
  request: Request,
  identity: AuthorityStorageIdentity,
) {
  if (identity.kind !== "appInstall" && identity.kind !== "program") {
    return undefined;
  }

  const target = hostAuthSessionTargetFromRequestHeaders(request.headers);

  if (
    !target ||
    target.storageIdentity !== identity.authorityName ||
    (identity.kind === "program" &&
      (target.appInstallId !== undefined || target.targetProfile !== "instance"))
  ) {
    return undefined;
  }

  return target;
}

function bearerTokenFromRequest(request: Request): string | undefined {
  const authorization = request.headers.get("Authorization");
  const match = authorization ? /^Bearer\s+(.+)$/i.exec(authorization.trim()) : null;

  return match?.[1];
}

function isInstalledAppDataOperation(operation: AuthorityOperation): boolean {
  return (
    operation.kind === "bootstrap" ||
    operation.kind === "readSchema" ||
    operation.kind === "sync" ||
    operation.kind === "entityOperation"
  );
}

async function authorizeInstalledAppDataRequest(
  request: Request,
  env: Env,
  identity: Extract<AuthorityStorageIdentity, { kind: "appInstall" }>,
  target: ReturnType<typeof hostAuthSessionTargetFromRequestHeaders>,
): Promise<
  | {
      access: Extract<Awaited<ReturnType<typeof validateInstanceAuthAccessSession>>, { ok: true }>;
      actorCandidates: OperationInvocationActorCandidates;
      authorized: true;
    }
  | { authorized: false }
> {
  const access = await validateInstanceAuthAccessSession(request, env, {
    appInstallId: identity.installId,
    requiredAuthority: "app.admin",
    target,
  });

  if (!access.ok) {
    return { authorized: false };
  }

  const actorCandidates: OperationInvocationActorCandidates = {};
  const authenticated = authenticatedOperationActorForSession({
    principalId: access.principalId,
    session: access.session,
    target,
  });

  if (access.ownerAuthorized) {
    actorCandidates.owner = { kind: "owner" };
  } else {
    actorCandidates.admin = {
      kind: "admin",
      principalId: access.principalId,
      ...(authenticated?.sessionTarget === undefined
        ? {}
        : { sessionTarget: authenticated.sessionTarget }),
    };
  }

  if (authenticated) {
    actorCandidates.authenticated = authenticated;
  }

  return { access, actorCandidates, authorized: true };
}

async function authorizeInstalledAppDataFallback(
  request: Request,
  operation: AuthorityOperation,
  env: Env,
  hostSessionTarget: ReturnType<typeof hostAuthSessionTargetFromRequestHeaders>,
): Promise<AuthorityAdminGuardResult> {
  return operation.metadata.mode === "read"
    ? authorizeOwnerManagementRead(request, env, { hostSessionTarget })
    : authorizeAuthorityOperation(request, operation, env, { hostSessionTarget });
}

async function authorizeEntityOperationRequest(
  request: Request,
  operation: AuthorityOperation,
  env: Env,
  options: {
    actorCandidates?: OperationInvocationActorCandidates;
    hostSessionTarget?: ReturnType<typeof hostAuthSessionTargetFromRequestHeaders>;
  },
): Promise<AuthorityAdminGuardResult> {
  if (operation.metadata.mode === "read") {
    return { authorized: true };
  }

  if (options.actorCandidates?.authenticated || options.actorCandidates?.owner) {
    return { authorized: true };
  }

  return authorizeAuthorityOperation(request, operation, env, {
    hostSessionTarget: options.hostSessionTarget,
  });
}

async function operationActorCandidatesForRequest(
  request: Request,
  env: Env,
  target: ReturnType<typeof hostAuthSessionTargetFromRequestHeaders>,
): Promise<OperationInvocationActorCandidates> {
  const candidates: OperationInvocationActorCandidates = {};
  const centralOwnerSession = await validateCentralAuthSessionAuthority(request, env);

  if (centralOwnerSession.ok) {
    candidates.owner = { kind: "owner" };

    const actor = authenticatedOperationActorForSession({
      principalId: centralOwnerSession.session.principalId,
      session: centralOwnerSession.session,
      target,
    });

    if (actor) {
      candidates.authenticated = actor;
    }

    return candidates;
  }

  const ownerSessionFallbackAllowed =
    centralOwnerSession.ownerSessionFallbackAllowed || isLocalOwnerSessionRuntime(request, env);

  if (ownerSessionFallbackAllowed) {
    const ownerSession = await validateOwnerSessionAuthority(request, env);

    if (ownerSession.ok) {
      candidates.owner = { kind: "owner" };

      const actor = authenticatedOperationActorForSession({
        principalId: ownerSession.session.principalId,
        session: ownerSession.session,
        target,
      });

      if (actor) {
        candidates.authenticated = actor;
      }

      return candidates;
    }
  }

  const centralPrincipalSession = await validateCentralAuthSessionPrincipal(request, env);

  if (centralPrincipalSession.ok) {
    const actor = authenticatedOperationActorForSession({
      principalId: centralPrincipalSession.session.principalId,
      session: centralPrincipalSession.session,
      target,
    });

    if (actor) {
      candidates.authenticated = actor;
    }
  }

  if (ownerSessionFallbackAllowed) {
    const principalSession = await validateOwnerSessionPrincipal(request, env);

    if (principalSession.ok) {
      const actor = authenticatedOperationActorForSession({
        principalId: principalSession.session.principalId,
        session: principalSession.session,
        target,
      });

      if (actor) {
        candidates.authenticated = actor;
      }
    }
  }

  if (target === undefined) {
    return candidates;
  }

  const hostOwnerSession = await validateHostAuthSessionAuthority(request, env, {
    requiredAccess: "owner",
    target,
  });

  if (hostOwnerSession.ok) {
    candidates.owner = { kind: "owner" };
    const actor = authenticatedOperationActorForSession({
      principalId: hostOwnerSession.session.principalId,
      session: hostOwnerSession.session,
      target,
    });

    if (actor) {
      candidates.authenticated = actor;
    }

    return candidates;
  }

  const hostPrincipalSession = await validateHostAuthSessionAuthority(request, env, {
    requiredAccess: "authenticated",
    target,
  });

  if (hostPrincipalSession.ok) {
    const actor = authenticatedOperationActorForSession({
      principalId: hostPrincipalSession.session.principalId,
      session: hostPrincipalSession.session,
      target,
    });

    if (actor) {
      candidates.authenticated = actor;
    }
  }

  return candidates;
}

class AuthorityWriteModule {
  private readonly notifyCommittedWrite: () => void;

  constructor(notifyCommittedWrite: () => void) {
    this.notifyCommittedWrite = notifyCommittedWrite;
  }

  apply<T>(write: () => WriteOutcome<T>): WriteOutcome<T> {
    const outcome = write();

    if (outcome.kind === "committed") {
      this.notifyCommittedWrite();
    }

    return outcome;
  }
}

function storageSourceFromRoute(
  route: { app: WorkerAppDefinition; identity: AuthorityStorageIdentity },
  env: Env,
): StorageSource {
  if (route.identity.kind === "program") {
    return formlessProgramSource();
  }

  return storageSourceFromApp(route.app, {
    schemaProvenance: packageSchemaProvenanceForIdentity(route.identity, env),
    schemaKey: route.identity.sourceSchemaKey,
    storageIdentity: route.identity.authorityName,
  });
}

function storageSourceFromApp(
  app: WorkerAppDefinition,
  options: {
    schemaKey?: string;
    schemaProvenance?: PackageAppSchemaProvenance;
    storageIdentity?: string;
  } = {},
): StorageSource {
  return {
    schema: app.sourceSchema,
    ...(options.schemaKey === undefined ? {} : { schemaKey: options.schemaKey }),
    ...(options.schemaProvenance === undefined
      ? {}
      : { schemaProvenance: options.schemaProvenance }),
    ...(options.storageIdentity === undefined ? {} : { storageIdentity: options.storageIdentity }),
  };
}

function packageSchemaProvenanceForIdentity(
  identity: Exclude<AuthorityStorageIdentity, { kind: "program" }>,
  env: Env,
): PackageAppSchemaProvenance {
  const packageApp = activeAppPackageResolver(env).findPackage(identity.packageAppKey);

  if (!packageApp) {
    throw new Error(`Package app "${identity.packageAppKey}" is not installable.`);
  }

  return {
    kind: "package-app",
    packageAppKey: packageApp.packageAppKey,
    packageRevision: packageApp.packageRevision,
    sourceSchemaHash: packageApp.sourceSchemaHash,
  };
}

async function publicOperationInputNotificationSourceRecords(input: {
  env: Env;
  identity: AuthorityStorageIdentity;
  requestUrl: string;
  response: { invocation: { source: { siteBlockId?: string } } };
}): Promise<readonly StoredRecord[] | undefined> {
  if (input.response.invocation.source.siteBlockId === undefined) {
    return undefined;
  }

  if (publicOperationTargetOwnsSiteBlock(input.identity, input.env)) {
    return undefined;
  }

  const programIdentity = programStorageIdentity();

  try {
    const id = input.env.FORMLESS_AUTHORITY.idFromName(programIdentity.authorityName);
    const url = new URL(INTERNAL_PUBLIC_SITE_BOOTSTRAP_PATH, input.requestUrl);

    url.searchParams.set("apiRoutePrefix", programIdentity.apiRoutePrefix);

    const response = await input.env.FORMLESS_AUTHORITY.get(id).fetch(
      new Request(url, {
        headers: { Accept: "application/json" },
        method: "GET",
      }),
    );
    const body = (await response.json()) as Partial<BootstrapResponse> & { error?: string };

    return response.ok && Array.isArray(body.records) ? body.records : undefined;
  } catch {
    return undefined;
  }
}

function publicOperationTargetOwnsSiteBlock(identity: AuthorityStorageIdentity, env: Env): boolean {
  if (identity.kind === "program") {
    return true;
  }

  return Boolean(
    activeAppPackageResolver(env).findPackage(identity.packageAppKey)?.publicRouteBase,
  );
}

function storageSourceFromSyncSocket(
  ctx: DurableObjectState,
  socket: WebSocket,
  env: Env,
): StorageSource {
  if (ctx.id.name === FORMLESS_PROGRAM_STORAGE_IDENTITY) {
    return formlessProgramSource();
  }

  return storageSourceFromSchemaKey(ctx.getTags(socket)[0] ?? ctx.id.name, env, ctx.id.name);
}

function storageSourceFromSchemaKey(
  schemaKey: string | undefined,
  env: Env,
  storageIdentity?: string,
): StorageSource {
  if (!schemaKey) {
    throw new Error("Authority Durable Object is missing a valid schema key.");
  }

  const app = findActiveWorkerSchemaAppDefinition(schemaKey, env);

  if (!app) {
    throw new Error("Authority Durable Object is missing a valid schema key.");
  }

  return storageSourceFromApp(app, {
    schemaKey,
    schemaProvenance: packageSchemaProvenanceForSchemaKey(schemaKey, env),
    storageIdentity,
  });
}

function packageSchemaProvenanceForSchemaKey(
  schemaKey: string,
  env: Env,
): PackageAppSchemaProvenance | undefined {
  const packageApp = listActiveAppPackages(env).find(
    (candidate) => candidate.sourceSchemaKey === schemaKey,
  );

  return packageApp
    ? {
        kind: "package-app",
        packageAppKey: packageApp.packageAppKey,
        packageRevision: packageApp.packageRevision,
        sourceSchemaHash: packageApp.sourceSchemaHash,
      }
    : undefined;
}

function initialSyncSocketAttachment(
  authorization?: InstalledAppSyncSocketAuthorization | ProgramSyncSocketAuthorization,
): AuthoritySyncSocketAttachment {
  return {
    ...(authorization === undefined ? {} : { authorization }),
    cursor: 0,
    schemaUpdatedAt: null,
  };
}

function syncSocketAttachment(socket: WebSocket): AuthoritySyncSocketAttachment {
  const attachment = socket.deserializeAttachment();

  if (!isSyncSocketAttachment(attachment)) {
    return initialSyncSocketAttachment();
  }

  const authorization =
    isObjectRecord(attachment) && "authorization" in attachment
      ? parseAuthoritySyncSocketAuthorization(attachment.authorization)
      : undefined;

  return {
    ...(authorization === undefined ? {} : { authorization }),
    cursor: attachment.cursor,
    schemaUpdatedAt: attachment.schemaUpdatedAt,
  };
}

function parseSyncSocketMessage(message: string | ArrayBuffer) {
  if (typeof message !== "string") {
    return undefined;
  }

  try {
    const parsed = JSON.parse(message) as unknown;

    return isSyncSocketClientMessage(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function sendSyncToSocket(
  storage: DurableObjectStorage,
  source: StorageSource,
  socket: WebSocket,
  attachment: AuthoritySyncSocketAttachment,
) {
  const response = syncResponseForAttachment(storage, source, attachment);
  const message = {
    type: "sync",
    payload: response,
  } satisfies SyncSocketServerMessage;

  socket.send(JSON.stringify(message));
  socket.serializeAttachment({
    ...(attachment.authorization === undefined ? {} : { authorization: attachment.authorization }),
    cursor: response.cursor,
    schemaUpdatedAt: response.schemaUpdatedAt ?? attachment.schemaUpdatedAt,
  } satisfies AuthoritySyncSocketAttachment);
}

function syncResponseForAttachment(
  storage: DurableObjectStorage,
  source: StorageSource,
  attachment: SyncSocketAttachment,
): SyncResponse {
  const storedSchema = initializeStorageFromSource(storage, source);
  const schemaFields =
    attachment.schemaUpdatedAt === storedSchema.updatedAt
      ? {}
      : {
          schema: storedSchema.schema,
          ...(storedSchema.schemaProvenance === undefined
            ? {}
            : { schemaProvenance: storedSchema.schemaProvenance }),
          schemaUpdatedAt: storedSchema.updatedAt,
        };

  return {
    changes: getChangesAfter(storage, attachment.cursor),
    cursor: getCurrentCursor(storage),
    ...schemaFields,
  };
}

function closeMalformedSyncSocket(socket: WebSocket) {
  sendSyncSocketError(socket, "Malformed sync socket message.");
  socket.close(1003, "Malformed sync message.");
}

function closeUnauthorizedSyncSocket(socket: WebSocket) {
  try {
    socket.close(1008, "Push sync authorization is no longer current.");
  } catch {
    // The socket is already closing or closed.
  }
}

function sendSyncSocketError(socket: WebSocket, message: string) {
  const response = {
    type: "error",
    message,
  } satisfies SyncSocketServerMessage;

  try {
    socket.send(JSON.stringify(response));
  } catch {
    // The socket is already closing or closed.
  }
}

function parseAuthoritySyncSocketAuthorization(
  value: unknown,
): InstalledAppSyncSocketAuthorization | ProgramSyncSocketAuthorization | undefined {
  if (!isObjectRecord(value)) {
    return undefined;
  }

  if (value.kind === "open") {
    return { kind: "open" };
  }

  if (
    value.kind === "program-access" &&
    typeof value.storageIdentity === "string" &&
    value.storageIdentity !== "" &&
    "access" in value
  ) {
    return {
      access: value.access,
      kind: "program-access",
      storageIdentity: value.storageIdentity,
    };
  }

  if (
    value.kind === "program-admin-bearer" &&
    typeof value.authorization === "string" &&
    value.authorization !== "" &&
    typeof value.storageIdentity === "string" &&
    value.storageIdentity !== ""
  ) {
    return {
      authorization: value.authorization,
      kind: "program-admin-bearer",
      storageIdentity: value.storageIdentity,
    };
  }

  if (
    value.kind !== "instance-auth" ||
    typeof value.appInstallId !== "string" ||
    value.appInstallId === "" ||
    typeof value.packageAppKey !== "string" ||
    value.packageAppKey === "" ||
    typeof value.storageIdentity !== "string" ||
    value.storageIdentity === "" ||
    !("access" in value)
  ) {
    return undefined;
  }

  return {
    access: value.access,
    appInstallId: value.appInstallId,
    kind: "instance-auth",
    packageAppKey: value.packageAppKey,
    storageIdentity: value.storageIdentity,
  };
}

function installedAppOpenSyncAllowed(env: Env): boolean {
  return (
    (env.FORMLESS_ADMIN_TOKEN?.trim() ?? "") === "" &&
    (env.FORMLESS_OWNER_SESSION_SECRET?.trim() ?? "") === ""
  );
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function handleInternalAuthProfileCompletionRequest(input: {
  env: Env;
  request: Request;
  route: { app: WorkerAppDefinition; identity: AuthorityStorageIdentity; path: string };
  source: StorageSource;
  storage: DurableObjectStorage;
  url: URL;
  writes: AuthorityWriteModule;
}): Promise<Response | undefined> {
  if (
    input.route.path !== INTERNAL_AUTH_PROFILE_COMPLETION_OPERATION_PATH &&
    input.route.path !== INTERNAL_AUTH_PROFILE_COMPLETION_SCHEMA_PATH
  ) {
    return undefined;
  }

  if (input.url.origin !== "http://internal" || input.route.identity.kind !== "appInstall") {
    return jsonResponse({ error: "Not found." }, 404);
  }

  if (input.route.path === INTERNAL_AUTH_PROFILE_COMPLETION_SCHEMA_PATH) {
    if (input.request.method !== "GET") {
      return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "GET" });
    }

    ensureStorageTables(input.storage);
    const storedSchema = initializeStorageFromSource(input.storage, input.source, {
      refreshActiveSchema: false,
    });

    return jsonResponse({
      schema: storedSchema.schema,
      ...(storedSchema.schemaProvenance === undefined
        ? {}
        : { schemaProvenance: storedSchema.schemaProvenance }),
      updatedAt: storedSchema.updatedAt,
    } satisfies SchemaResponse);
  }

  if (input.request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "POST" });
  }

  const body = parseInternalAuthProfileCompletionOperationRequest(await readJson(input.request));
  const operation = selectAuthorityOperation({
    method: "POST",
    path: `/operations/${encodeURIComponent(body.operation.entityName)}/${encodeURIComponent(
      body.operation.operationName,
    )}`,
    searchParams: new URLSearchParams(),
  });

  if (!operation) {
    return jsonResponse({ error: "Profile-completion operation is unavailable." }, 404);
  }

  ensureStorageTables(input.storage);
  const source = currentActiveSchemaSource(input.storage, input.source);
  const result = await executeAuthorityOperation({
    actor: body.actor,
    app: input.route.app,
    body: body.request,
    identity: input.route.identity,
    identityReferenceResolver: (lookup) => resolveIdentityAppReferenceTarget(input.env, lookup),
    operation,
    packageResolver: activeAppPackageResolver(input.env),
    source,
    sourceSchemas: activeWorkerSourceSchemas(input.env),
    storage: input.storage,
    turnstileSiteKey: turnstileSiteKeyFromEnv(input.env),
    writes: input.writes,
  });

  return jsonResponse(result.body, result.status, result.headers);
}

function currentActiveSchemaSource(
  storage: DurableObjectStorage,
  source: StorageSource,
): StorageSource {
  const storedSchema = initializeStorageFromSource(storage, source, {
    refreshActiveSchema: false,
  });

  return {
    ...source,
    schema: storedSchema.schema,
    ...(storedSchema.schemaProvenance === undefined
      ? { schemaProvenance: undefined }
      : { schemaProvenance: storedSchema.schemaProvenance }),
  };
}

function parseAuthorityRoute(
  pathname: string,
  env: Env,
): { app: WorkerAppDefinition; identity: AuthorityStorageIdentity; path: string } | undefined {
  const route = parseAuthorityApiRoute(pathname, activeAppPackageResolver(env));

  if (!route) {
    return undefined;
  }

  if (route.identity.kind === "program") {
    return { app: formlessProgramApp, identity: route.identity, path: route.path };
  }

  const app = findActiveWorkerSchemaAppDefinition(route.identity.sourceSchemaKey, env);

  if (!app) {
    return undefined;
  }

  return { app, identity: route.identity, path: route.path };
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new BadRequestError("Request body must be valid JSON.");
  }
}

function parseInternalAuthProfileCompletionOperationRequest(value: unknown): {
  actor: OperationInvocationActor;
  operation: { entityName: string; operationName: string };
  request: Record<string, unknown>;
} {
  const object = parseInternalRecord("Internal profile-completion operation request", value);
  assertInternalAllowedKeys("Internal profile-completion operation request", object, [
    "actor",
    "operation",
    "request",
  ]);
  const operation = parseInternalRecord(
    "Internal profile-completion operation reference",
    object.operation,
  );

  assertInternalAllowedKeys("Internal profile-completion operation reference", operation, [
    "entityName",
    "operationName",
  ]);

  return {
    actor: parseInternalAuthenticatedOperationActor(object.actor),
    operation: {
      entityName: parseInternalNonEmptyString(
        "Internal profile-completion operation entityName",
        operation.entityName,
      ),
      operationName: parseInternalNonEmptyString(
        "Internal profile-completion operation operationName",
        operation.operationName,
      ),
    },
    request: parseInternalOperationRequest(object.request),
  };
}

function parseInternalAuthenticatedOperationActor(value: unknown): OperationInvocationActor {
  const object = parseInternalRecord("Internal profile-completion operation actor", value);
  assertInternalAllowedKeys("Internal profile-completion operation actor", object, [
    "kind",
    "principalId",
    "sessionTarget",
  ]);

  if (object.kind !== "authenticated") {
    throw new BadRequestError(
      'Internal profile-completion operation actor kind must be "authenticated".',
    );
  }

  const target = parseInternalRecord(
    "Internal profile-completion operation actor sessionTarget",
    object.sessionTarget,
  );
  assertInternalAllowedKeys("Internal profile-completion operation actor sessionTarget", target, [
    "appInstallId",
    "instanceId",
    "routeId",
    "storageIdentity",
    "targetOrigin",
    "targetProfile",
  ]);

  return {
    kind: "authenticated",
    principalId: parseInternalNonEmptyString(
      "Internal profile-completion operation actor principalId",
      object.principalId,
    ),
    sessionTarget: {
      appInstallId: parseInternalNonEmptyString(
        "Internal profile-completion operation actor target appInstallId",
        target.appInstallId,
      ),
      instanceId: parseInternalNonEmptyString(
        "Internal profile-completion operation actor target instanceId",
        target.instanceId,
      ),
      routeId: parseInternalNonEmptyString(
        "Internal profile-completion operation actor target routeId",
        target.routeId,
      ),
      storageIdentity: parseInternalNonEmptyString(
        "Internal profile-completion operation actor target storageIdentity",
        target.storageIdentity,
      ),
      targetOrigin: parseInternalNonEmptyString(
        "Internal profile-completion operation actor target targetOrigin",
        target.targetOrigin,
      ),
      targetProfile: parseInternalTargetProfile(target.targetProfile),
    },
  };
}

function parseInternalOperationRequest(value: unknown): Record<string, unknown> {
  const object = parseInternalRecord("Internal profile-completion operation input", value);
  assertInternalAllowedKeys("Internal profile-completion operation input", object, [
    "idempotencyKey",
    "input",
    "recordId",
  ]);

  return object;
}

function parseInternalTargetProfile(value: unknown): "app" | "instance" | "public-site" {
  const profile = parseInternalNonEmptyString(
    "Internal profile-completion operation actor target targetProfile",
    value,
  );

  if (profile !== "app" && profile !== "instance" && profile !== "public-site") {
    throw new BadRequestError(
      "Internal profile-completion operation actor target targetProfile is unsupported.",
    );
  }

  return profile;
}

function parseInternalRecord(context: string, value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestError(`${context} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function assertInternalAllowedKeys(
  context: string,
  object: Record<string, unknown>,
  allowedKeys: readonly string[],
) {
  const allowed = new Set(allowedKeys);

  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) {
      throw new BadRequestError(`${context} has unsupported key "${key}".`);
    }
  }
}

function parseInternalNonEmptyString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequestError(`${context} must be a non-empty string.`);
  }

  return value.trim();
}

function isRetiredWriteRoute(method: string, path: string) {
  if (method !== "POST" || !path.startsWith("/")) {
    return false;
  }

  const retiredWriteRouteNames = new Set(["mutations", "actions"]);

  return retiredWriteRouteNames.has(path.slice(1));
}

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}) {
  const responseHeaders = new Headers(headers);

  if (!responseHeaders.has("Cache-Control")) {
    responseHeaders.set("Cache-Control", "no-store");
  }

  return Response.json(body, {
    status,
    headers: responseHeaders,
  });
}
