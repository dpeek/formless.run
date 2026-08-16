import { DurableObject } from "cloudflare:workers";
import {
  activeSchemaRefreshBlockedResponse,
  type SyncSocketAttachment,
  type SyncSocketServerMessage,
} from "../shared/protocol.ts";
import { parseAuthorityApiRoute } from "../shared/program-storage-identity.ts";
import { handleInstanceArchiveDurableObjectRequest } from "./archive-api.ts";
import {
  ensureStorageTables,
  assertArchiveRestoreGuardAllowsWrite,
  initializeStorageFromSource,
  resetStorageToEmpty,
  ActiveSchemaRefreshBlockedError,
  type WriteOutcome,
} from "./storage.ts";
import {
  ArchiveRestoreGuardConflictError,
  BadRequestError,
  ReloadRequiredError,
} from "./errors.ts";
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
  handleInstanceAuthHandoffDurableObjectRequest,
  hostAuthSessionTargetFromRequestHeaders,
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
  validateFormlessProgramRecordConstraint,
} from "./program-authority.ts";
import { type FormlessProgramDefaultWorkerAfterCommitInput } from "../program/default/worker.ts";
import { programSharedRuntime } from "../program/compiled/shared.ts";
import { programWorkerRuntime } from "../program/compiled/worker.ts";
import {
  enforceProgramSyncSocketRenewal,
  randomizedProgramSyncSocketExpiry,
} from "./program-sync-renewal.ts";
import { ARCHIVE_RESTORE_CONFLICT_CODE } from "./archive-restore-protocol.ts";
import {
  RECOVERY_PROGRAM_SOURCE_INTERNAL_PATH,
  handleRecoveryProgramSourceDurableObjectRequest,
} from "./recovery-source.ts";

const COMMITTED_WRITE_BROADCAST_DELAY_MS = 100;

export class FormlessAuthority extends DurableObject<Env> {
  private readonly bindings: Env;
  private pendingCommittedWriteBroadcast: Promise<void> | undefined;
  private readonly pendingCommittedWriteSockets = new Set<WebSocket>();

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
      try {
        ensureFormlessProgramStorage(this.ctx.storage);
      } catch (error) {
        if (
          !(error instanceof ActiveSchemaRefreshBlockedError) ||
          (parseAuthorityApiRoute(url.pathname) === undefined &&
            url.pathname !== RECOVERY_PROGRAM_SOURCE_INTERNAL_PATH)
        ) {
          throw error;
        }
      }

      const recoveryProgramSourceResponse = handleRecoveryProgramSourceDurableObjectRequest(
        request,
        this.ctx.storage,
      );

      if (recoveryProgramSourceResponse) {
        return recoveryProgramSourceResponse;
      }
    }

    if (this.ctx.id.name === FORMLESS_INSTANCE_AUTHORITY_NAME) {
      const instanceArchiveResponse = await handleInstanceArchiveDurableObjectRequest(
        request,
        this.ctx.storage,
        this.bindings,
      );

      if (instanceArchiveResponse) {
        return instanceArchiveResponse;
      }

      await ensureRuntimeInstanceAuthConfig(this.ctx.storage, request, this.bindings);
    }

    const instanceControlPlaneResponse = await handleInstanceControlPlaneDurableObjectRequest(
      request,
      this.ctx.storage,
      this.bindings,
      new AuthorityWriteModule(this.ctx.storage, () => this.scheduleCommittedWriteBroadcast()),
    );

    if (instanceControlPlaneResponse) {
      return instanceControlPlaneResponse;
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

    const identityControlPlaneResponse = await handleIdentityControlPlaneDurableObjectRequest(
      request,
      this.ctx.storage,
      this.bindings,
    );

    if (identityControlPlaneResponse) {
      return identityControlPlaneResponse;
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
        writes: new AuthorityWriteModule(this.ctx.storage, () =>
          this.scheduleCommittedWriteBroadcast(),
        ),
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
      const writes = new AuthorityWriteModule(this.ctx.storage, () =>
        this.scheduleCommittedWriteBroadcast(),
      );

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
            const context = {
              bindings: this.bindings,
              requestUrl: request.url,
              response,
              schema,
              storage: this.ctx.storage,
            } satisfies FormlessProgramDefaultWorkerAfterCommitInput;

            await Promise.allSettled(
              programWorkerRuntime.afterCommit.map((adapter) =>
                (adapter.run as (input: FormlessProgramDefaultWorkerAfterCommitInput) => unknown)(
                  context,
                ),
              ),
            );
          },
          body,
          env: this.bindings,
          identityReferenceResolver: (lookup) =>
            resolveIdentityAppReferenceTarget(this.bindings, lookup),
          operationAdapters: programSharedRuntime.operationAdapters,
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
          operationAdapters: programSharedRuntime.operationAdapters,
          publicReads: programWorkerRuntime.publicReads,
          actorCandidates,
          requestHeaders: request.headers,
          sharedRuntime: programSharedRuntime,
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

      if (isArchiveRestoreGuardConflict(error)) {
        return jsonResponse(
          {
            code: ARCHIVE_RESTORE_CONFLICT_CODE,
            currentSourceCursor: error.currentSourceCursor,
            error: error.message,
            ...(error.expectedSourceCursor === undefined
              ? {}
              : { expectedSourceCursor: error.expectedSourceCursor }),
            reason: error.reason,
          },
          409,
        );
      }

      if (error instanceof BadRequestError) {
        return jsonResponse({ error: error.message }, 400);
      }

      if (error instanceof ReloadRequiredError) {
        return jsonResponse(error.body, error.status);
      }

      if (error instanceof ActiveSchemaRefreshBlockedError) {
        return jsonResponse(activeSchemaRefreshBlockedResponse(error.message, error.blocker), 409);
      }

      throw error;
    }
  }

  async webSocketMessage(socket: WebSocket, _message: string | ArrayBuffer) {
    closePolicyViolationSyncSocket(socket);
  }

  async alarm() {
    const nextExpiry = enforceProgramSyncSocketRenewal(
      this.ctx.getWebSockets(FORMLESS_PROGRAM_SCHEMA_KEY),
    );

    if (nextExpiry !== undefined) {
      await this.ctx.storage.setAlarm(nextExpiry);
    }
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

    const authorized = await this.programSyncSocketIsAuthorized(request);

    if (!authorized) {
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
    const expiresAt = randomizedProgramSyncSocketExpiry();

    server.serializeAttachment({ expiresAt } satisfies SyncSocketAttachment);
    this.ctx.acceptWebSocket(server, [FORMLESS_PROGRAM_SCHEMA_KEY]);
    await this.scheduleProgramSyncSocketRenewal(expiresAt);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  private async programSyncSocketIsAuthorized(request: Request): Promise<boolean> {
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

    return authorization.authorized;
  }

  private async scheduleProgramSyncSocketRenewal(expiresAt: number) {
    await this.ctx.storage.transaction(async (transaction) => {
      const scheduledAlarm = await transaction.getAlarm();

      if (scheduledAlarm === null || expiresAt < scheduledAlarm) {
        await transaction.setAlarm(expiresAt);
      }
    });
  }

  private scheduleCommittedWriteBroadcast() {
    for (const socket of this.ctx.getWebSockets()) {
      this.pendingCommittedWriteSockets.add(socket);
    }

    if (this.pendingCommittedWriteSockets.size === 0) {
      return;
    }

    if (this.pendingCommittedWriteBroadcast) {
      return;
    }

    const pendingBroadcast = delay(COMMITTED_WRITE_BROADCAST_DELAY_MS)
      .then(() => this.broadcastCommittedWrite())
      .finally(() => {
        if (this.pendingCommittedWriteBroadcast === pendingBroadcast) {
          this.pendingCommittedWriteBroadcast = undefined;
        }
      });

    this.pendingCommittedWriteBroadcast = pendingBroadcast;
    this.ctx.waitUntil(pendingBroadcast);
  }

  private broadcastCommittedWrite() {
    const message = JSON.stringify({ type: "changed" } satisfies SyncSocketServerMessage);
    const sockets = [...this.pendingCommittedWriteSockets];
    this.pendingCommittedWriteSockets.clear();

    for (const socket of sockets) {
      try {
        socket.send(message);
      } catch {
        // One stale socket does not prevent later sockets from receiving invalidation.
      }
    }
  }
}

function hostAuthSessionTargetForAuthorityRoute(request: Request) {
  const target = hostAuthSessionTargetFromRequestHeaders(request.headers);

  if (!target || target.targetProfile !== "instance") {
    return undefined;
  }

  return target;
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

function isArchiveRestoreGuardConflict(error: unknown): error is ArchiveRestoreGuardConflictError {
  return (
    error instanceof ArchiveRestoreGuardConflictError ||
    (error instanceof Error &&
      error.name === "ArchiveRestoreGuardConflictError" &&
      "currentSourceCursor" in error &&
      "reason" in error)
  );
}

class AuthorityWriteModule {
  private readonly notifyCommittedWrite: () => void;
  private readonly storage: DurableObjectStorage;

  constructor(storage: DurableObjectStorage, notifyCommittedWrite: () => void) {
    this.storage = storage;
    this.notifyCommittedWrite = notifyCommittedWrite;
  }

  apply<T>(write: () => WriteOutcome<T>): WriteOutcome<T> {
    assertArchiveRestoreGuardAllowsWrite(this.storage);
    return this.applyAllowed(write);
  }

  applyGuarded<T>(guardToken: string, write: () => WriteOutcome<T>): WriteOutcome<T> {
    assertArchiveRestoreGuardAllowsWrite(this.storage, guardToken);
    return this.applyAllowed(write);
  }

  private applyAllowed<T>(write: () => WriteOutcome<T>): WriteOutcome<T> {
    const outcome = write();

    if (outcome.kind === "committed") {
      this.notifyCommittedWrite();
    }

    return outcome;
  }
}

function closePolicyViolationSyncSocket(socket: WebSocket) {
  try {
    socket.close(1008, "Program invalidation sockets are server-to-client only.");
  } catch {
    // The socket is already closing or closed.
  }
}

function delay(delayMs: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, delayMs));
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
