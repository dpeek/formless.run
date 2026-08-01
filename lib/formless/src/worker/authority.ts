import { DurableObject } from "cloudflare:workers";
import type {
  SyncResponse,
  SyncSocketAttachment,
  SyncSocketServerMessage,
} from "../shared/protocol.ts";
import { isSyncSocketAttachment, isSyncSocketClientMessage } from "../shared/protocol.ts";
import { parseAuthorityApiRoute } from "../shared/program-storage-identity.ts";
import { handleInstanceArchiveDurableObjectRequest } from "./archive-api.ts";
import {
  ensureStorageTables,
  getChangesAfter,
  getCurrentCursor,
  initializeStorageFromSource,
  resetStorageToEmpty,
  ActiveSchemaRefreshBlockedError,
  type StorageSource,
  type WriteOutcome,
} from "./storage.ts";
import { BadRequestError, ReloadRequiredError } from "./errors.ts";
import type { Env } from "./index.ts";
import {
  authorizeAuthorityOperation,
  authorizeProgramAccess,
  type AuthorityAdminGuardResult,
} from "./authority-admin-guard.ts";
import {
  executeAuthorityOperation,
  selectAuthorityOperation,
  type AuthorityOperation,
  type OperationInvocationActorCandidates,
} from "./authority-operations.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
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
import { handleInstanceAuthAccountCompletionDurableObjectRequest } from "./instance-auth-account-completion.ts";
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
  validateBoundProgramAccessSession,
  validateCentralAuthSessionAuthority,
  validateCentralAuthSessionPrincipal,
  validateHostAuthSessionAuthority,
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
import { handleInstanceUpgradeStatusDurableObjectRequest } from "./upgrade-status-api.ts";
import { INTERNAL_PUBLIC_SITE_BOOTSTRAP_PATH } from "./public-site-worker-runtime.ts";
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
  formlessProgramSource,
  selectCurrentFormlessProgramChanges,
  validateFormlessProgramRecordConstraint,
} from "./program-authority.ts";

type ProgramSyncSocketAuthorization =
  | {
      access: unknown;
      kind: "program-access";
    }
  | {
      authorization: string;
      kind: "program-admin-bearer";
    };

type AuthoritySyncSocketAttachment = SyncSocketAttachment & {
  authorization?: ProgramSyncSocketAuthorization;
};

export class FormlessAuthority extends DurableObject<Env> {
  private readonly bindings: Env;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.bindings = env;
  }

  async fetch(request: Request) {
    const url = new URL(request.url);

    if (
      this.ctx.id.name === FORMLESS_PROGRAM_STORAGE_IDENTITY &&
      url.pathname === "/_internal/reset-program-storage"
    ) {
      if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "POST" });
      }

      resetStorageToEmpty(this.ctx.storage);
      return jsonResponse({ reset: true });
    }

    if (this.ctx.id.name === FORMLESS_PROGRAM_STORAGE_IDENTITY) {
      ensureFormlessProgramStorage(this.ctx.storage);
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
        ? parseAuthorityApiRoute(`${apiRoutePrefix}/bootstrap`)
        : undefined;

      if (!route || route.identity.authorityName !== this.ctx.id.name) {
        return jsonResponse({ error: "Not found." }, 404);
      }

      const source = formlessProgramSource();
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
        identity: route.identity,
        operation,
        source,
        storage: this.ctx.storage,
        writes: new AuthorityWriteModule(() => this.scheduleCommittedWriteBroadcast(source)),
      });

      return jsonResponse(result.body, result.status, result.headers);
    }

    const route = parseAuthorityApiRoute(url.pathname);

    if (!route) {
      return jsonResponse({ error: "Not found." }, 404);
    }

    try {
      if (route.path === "/sync/ws") {
        return this.handleSyncWebSocketRequest(request);
      }

      const source = formlessProgramSource();
      const writes = new AuthorityWriteModule(() => this.scheduleCommittedWriteBroadcast(source));

      if (request.method === "GET" && route.path === "/sync") {
        const cursor = url.searchParams.get("after");
        const parsedCursor = cursor === null ? 0 : Number(cursor);

        if (!Number.isInteger(parsedCursor) || parsedCursor < 0) {
          return jsonResponse({ error: "Sync cursor must be a non-negative integer." }, 400);
        }
      }

      const selectedOperation = selectAuthorityOperation({
        method: request.method,
        path: route.path,
        searchParams: url.searchParams,
      });
      const operation = selectedOperation;
      const publicOperationRoute = selectPublicOperationRoute({
        method: request.method,
        path: route.path,
      });

      if (publicOperationRoute) {
        const body = await readJson(request);
        ensureStorageTables(this.ctx.storage);
        const { schema } = initializeStorageFromSource(this.ctx.storage, source);
        const result = await executePublicOperationRequest({
          afterCommit: async (response) => {
            await Promise.allSettled([
              scheduleSiteContactNotificationAfterPublicOperation({
                adapters: createSiteContactNotificationAdapters(this.bindings),
                requestUrl: request.url,
                response,
              }),
              scheduleSiteOperationInputNotificationAfterPublicOperation({
                adapters: createSiteOperationInputNotificationAdapters(this.bindings),
                requestUrl: request.url,
                response,
                schema,
                storage: this.ctx.storage,
              }),
            ]);
          },
          body,
          env: this.bindings,
          identityReferenceResolver: (lookup) =>
            resolveIdentityAppReferenceTarget(this.bindings, lookup),
          request,
          route: publicOperationRoute,
          schema,
          storage: this.ctx.storage,
          validateConstraints: validateFormlessProgramRecordConstraint(this.ctx.storage),
          writes,
        });

        return jsonResponse(result.body, result.status, result.headers);
      }

      if (operation) {
        const hostSessionTarget = hostAuthSessionTargetForAuthorityRoute(request);
        const actorCandidates =
          operation.kind === "entityOperation"
            ? await operationActorCandidatesForRequest(request, this.bindings, hostSessionTarget)
            : undefined;
        const authorization =
          operation.kind === "entityOperation"
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
          body,
          identity: route.identity,
          identityReferenceResolver: (lookup) =>
            resolveIdentityAppReferenceTarget(this.bindings, lookup),
          operation,
          actorCandidates,
          requestHeaders: request.headers,
          source,
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

  private async handleSyncWebSocketRequest(request: Request) {
    if (request.method !== "GET") {
      return jsonResponse({ error: "WebSocket sync requires GET." }, 405, { Allow: "GET" });
    }

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return jsonResponse({ error: "Expected Upgrade: websocket." }, 426, {
        Upgrade: "websocket",
      });
    }

    const authorization = await this.programSyncSocketAuthorization(request);

    if (authorization === undefined) {
      return jsonResponse(
        {
          error:
            "Current Program member, owner, or admin authorization is required for Program push sync.",
        },
        401,
        { "WWW-Authenticate": 'Bearer realm="formless-program"' },
      );
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    server.serializeAttachment(initialSyncSocketAttachment(authorization));
    this.ctx.acceptWebSocket(server, [FORMLESS_PROGRAM_SCHEMA_KEY]);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  private async programSyncSocketAuthorization(
    request: Request,
  ): Promise<ProgramSyncSocketAuthorization | undefined> {
    const target = hostAuthSessionTargetForAuthorityRoute(request);
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
        }
      : undefined;
  }

  private async syncSocketAuthorized(
    socket: WebSocket,
    attachment: AuthoritySyncSocketAttachment,
  ): Promise<boolean> {
    const authorization = attachment.authorization;

    if (authorization === undefined) {
      return false;
    }

    if (authorization.kind === "program-admin-bearer") {
      return (
        this.ctx.id.name === FORMLESS_PROGRAM_STORAGE_IDENTITY &&
        authorization.authorization === this.bindings.FORMLESS_ADMIN_TOKEN?.trim()
      );
    }

    if (authorization.kind === "program-access") {
      return (
        this.ctx.id.name === FORMLESS_PROGRAM_STORAGE_IDENTITY &&
        this.ctx.getTags(socket)[0] === FORMLESS_PROGRAM_SCHEMA_KEY &&
        (await validateBoundProgramAccessSession(authorization.access, this.bindings, {
          access: FORMLESS_PROGRAM_REPLICA_ACCESS_REQUIREMENT,
          schema: formlessProgramSchema,
        }))
      );
    }

    return false;
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

function hostAuthSessionTargetForAuthorityRoute(request: Request) {
  const target = hostAuthSessionTargetFromRequestHeaders(request.headers);

  if (!target || target.targetProfile !== "instance") {
    return undefined;
  }

  return target;
}

function bearerTokenFromRequest(request: Request): string | undefined {
  const authorization = request.headers.get("Authorization");
  const match = authorization ? /^Bearer\s+(.+)$/i.exec(authorization.trim()) : null;

  return match?.[1];
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

function storageSourceFromSyncSocket(
  ctx: DurableObjectState,
  _socket: WebSocket,
  _env: Env,
): StorageSource {
  if (ctx.id.name !== FORMLESS_PROGRAM_STORAGE_IDENTITY) {
    throw new Error("Push sync is available only for the Program Authority.");
  }

  return formlessProgramSource();
}

function initialSyncSocketAttachment(
  authorization?: ProgramSyncSocketAuthorization,
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
    changes: selectCurrentFormlessProgramChanges(getChangesAfter(storage, attachment.cursor)),
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
): ProgramSyncSocketAuthorization | undefined {
  if (!isObjectRecord(value)) {
    return undefined;
  }

  if (value.kind === "program-access" && "access" in value) {
    return {
      access: value.access,
      kind: "program-access",
    };
  }

  if (
    value.kind === "program-admin-bearer" &&
    typeof value.authorization === "string" &&
    value.authorization !== ""
  ) {
    return {
      authorization: value.authorization,
      kind: "program-admin-bearer",
    };
  }

  return undefined;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new BadRequestError("Request body must be valid JSON.");
  }
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
