import { parseProgramApiRoute } from "../shared/program-storage-identity.ts";
import { nowIsoString } from "../shared/clock.ts";
import {
  INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID,
  instanceControlPlaneDefaultRouteAccess,
  instanceControlPlaneSchema,
  type InstanceControlPlaneRedirectStatusCode,
  type InstanceControlPlaneRouteValues,
} from "@dpeek/formless-instance-control-plane";
import { FORMLESS_PROGRAM_STORAGE_IDENTITY } from "../program/target.ts";
import {
  FORMLESS_PROGRAM_REPLICA_ACCESS_REQUIREMENT,
  formlessProgramSchema,
  parseFormlessProgramStorageSnapshot,
} from "../program/runtime.ts";
import type { DeploymentTarget } from "../shared/deployment-runtime.ts";
import { activeSchemaRefreshBlockedResponse } from "../shared/protocol.ts";
import type { InstanceDomainProviderRedirectIntent } from "../shared/domain-provider-api.ts";
import type {
  InstanceDomainMapping,
  InstanceDomainMappingProfile,
} from "../shared/instance-domain-mappings.ts";
import { normalizeInstanceDomainHost } from "../shared/instance-domain-mappings.ts";
import type { RecordValues, StoredRecord } from "@dpeek/formless-storage";
import { type SchemaOperationActorKind } from "@dpeek/formless-schema";
import {
  authorizeAuthorityOperation,
  authorizeOwnerManagementRead,
  authorizeProgramAccess,
  type AuthorityAdminGuardEnv,
  type ProgramAccessAuthorizationResult,
} from "./authority-admin-guard.ts";
import { authorityStorageRecordValidationReader } from "./authority-record-validation-reader.ts";
import {
  executeAuthorityOperation,
  selectAuthorityOperation,
  type AuthorityOperation,
  type AuthorityWriteNotifier,
} from "./authority-operations.ts";
import { selectPublicOperationRoute } from "./public-operations.ts";
import { validateRecordValues } from "./authority-validation.ts";
import { assertUniqueConstraints } from "./constraints.ts";
import { ArchiveRestoreGuardConflictError, BadRequestError } from "./errors.ts";
import {
  ARCHIVE_RESTORE_CONFLICT_CODE,
  isArchiveRestoreOperationKind,
} from "./archive-restore-protocol.ts";
import {
  createRecordSetForOperationOutcome,
  ActiveSchemaRefreshBlockedError,
  getBootstrapRecords,
  getStoredRecord,
  patchStoredRecordOutcome,
  readOperationInvocations,
  writeRecordSetForOperationOutcome,
} from "./storage.ts";
import {
  INTERNAL_RESOLVE_INSTANCE_RUNTIME_ROUTE_PATH,
  resolveInstanceRuntimeRouteFromRecords,
} from "./instance-runtime-routes.ts";
import type { OperationInvocationEnvelope } from "../shared/operation-invocation.ts";
import {
  authenticatedOperationActorForSession,
  hostAuthSessionTargetFromRequestHeaders,
} from "./instance-auth-handoff.ts";
import {
  ensureFormlessProgramStorage,
  formlessProgramCreatedRecordId,
  formlessProgramSource,
  validateFormlessProgramRecordConstraint,
} from "./program-authority.ts";
import { programWorkerRuntime } from "../program/compiled/worker.ts";
import {
  INTERNAL_READ_OPERATION_INVOCATIONS_PATH,
  INTERNAL_READ_RECORDS_PATH,
  INTERNAL_SYNC_DEPLOYMENT_PROJECTION_PATH,
  INTERNAL_SYNC_DOMAIN_INTENT_PATH,
} from "./instance-control-plane-routes.ts";

export {
  INTERNAL_READ_OPERATION_INVOCATIONS_PATH,
  INTERNAL_READ_RECORDS_PATH,
  INTERNAL_SYNC_DEPLOYMENT_PROJECTION_PATH,
  INTERNAL_SYNC_DOMAIN_INTENT_PATH,
} from "./instance-control-plane-routes.ts";

const actorKinds = ["admin", "cliDeployer", "owner", "runner"] as const;
const instanceControlPlaneSourceSchema = instanceControlPlaneSchema;

function initializeControlPlaneStorage(storage: DurableObjectStorage) {
  ensureFormlessProgramStorage(storage);
}

function ensureControlPlaneStorage(storage: DurableObjectStorage) {
  initializeControlPlaneStorage(storage);
}

type InstanceControlPlaneApiEnv = AuthorityAdminGuardEnv & {
  FORMLESS_AUTHORITY: DurableObjectNamespace;
};

type RouteIntentSyncCandidate = {
  id: string;
  source: string;
  values: RecordValues;
};

export async function handleInstanceControlPlaneApiRequest(
  request: Request,
  env: InstanceControlPlaneApiEnv,
): Promise<Response | undefined> {
  const route = parseProgramApiRoute(new URL(request.url).pathname);

  if (!route) {
    return undefined;
  }

  if (isInternalControlPlanePath(route.path)) {
    return jsonResponse({ error: "Not found." }, 404);
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_PROGRAM_STORAGE_IDENTITY);

  return env.FORMLESS_AUTHORITY.get(id).fetch(request);
}

export async function handleInstanceControlPlaneDurableObjectRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceControlPlaneApiEnv,
  writes: AuthorityWriteNotifier = noopWriteNotifier,
): Promise<Response | undefined> {
  const url = new URL(request.url);
  const route = parseProgramApiRoute(url.pathname);

  if (!route) {
    return undefined;
  }

  if (route.path === "/sync/ws") {
    return undefined;
  }

  try {
    if (route.path === INTERNAL_READ_RECORDS_PATH) {
      return handleInternalReadRecords(request, storage);
    }

    if (route.path === INTERNAL_READ_OPERATION_INVOCATIONS_PATH) {
      return handleInternalReadOperationInvocations(request, storage);
    }

    if (route.path === INTERNAL_SYNC_DOMAIN_INTENT_PATH) {
      return await handleInternalSyncDomainIntent(request, storage);
    }

    if (route.path === INTERNAL_RESOLVE_INSTANCE_RUNTIME_ROUTE_PATH) {
      return handleInternalResolveRuntimeRoute(request, storage);
    }

    if (route.path === INTERNAL_SYNC_DEPLOYMENT_PROJECTION_PATH) {
      return await handleInternalSyncDeploymentProjection(request, storage);
    }

    if (
      selectPublicOperationRoute({
        method: request.method,
        path: route.path,
      })
    ) {
      return undefined;
    }

    const operation = selectAuthorityOperation({
      method: request.method,
      path: route.path,
      searchParams: url.searchParams,
    });

    if (!operation) {
      return jsonResponse({ error: "Not found." }, 404);
    }

    if (operation.kind === "siteTree") {
      return undefined;
    }

    const hostSessionTarget = hostAuthSessionTargetForInstanceControlPlaneRequest(request);
    const operationSchema =
      operation.kind === "entityOperation"
        ? formlessProgramSchema.entities
            .find((entity) => entity.key === operation.entityName)
            ?.operations?.find((candidate) => candidate.key === operation.operationName)
        : undefined;
    const programAuthorization =
      operation.kind === "entityOperation" && operationSchema?.access !== undefined
        ? await authorizeProgramAccess(
            request,
            env,
            operationSchema.access,
            formlessProgramSchema,
            {
              error: "Current Program operation access is required for this endpoint.",
              hostSessionTarget,
            },
          )
        : undefined;
    const authorization =
      operation.kind === "entityOperation"
        ? operationSchema?.access === undefined
          ? {
              authorized: false as const,
              error: `Program operation "${operation.entityName}.${operation.operationName}" is missing access.`,
              headers: { "WWW-Authenticate": 'Bearer realm="formless-admin"' },
              status: 401,
            }
          : programAuthorization!
        : isProgramReplicaReadOperation(operation)
          ? await authorizeProgramAccess(
              request,
              env,
              FORMLESS_PROGRAM_REPLICA_ACCESS_REQUIREMENT,
              formlessProgramSchema,
              {
                error:
                  "Current Program member, owner, or admin authorization is required for this read endpoint.",
                hostSessionTarget,
              },
            )
          : operation.metadata.mode === "read"
            ? await authorizeOwnerManagementRead(request, env, {
                hostSessionTarget,
                openAccessAllowed: false,
              })
            : await authorizeAuthorityOperation(request, operation, env, {
                hostSessionTarget,
                openAccessAllowed: false,
              });

    if (!authorization.authorized) {
      return jsonResponse(
        { error: authorization.error },
        authorization.status,
        authorization.headers,
      );
    }

    const actorKind =
      operation.kind === "entityOperation"
        ? controlPlaneActorKindFromRequest(request, url)
        : undefined;

    if (operation.metadata.mode === "write" && actorKind !== undefined) {
      assertBrowserControlPlaneWriteActor(actorKind, operation);
    }

    const body = operation.metadata.mode === "write" ? await readJson(request) : undefined;

    if (operation.kind === "restoreSnapshot") {
      parseFormlessProgramStorageSnapshot(
        "Formless Program storage snapshot",
        guardedSnapshotRestoreValue(body),
      );
    }

    if (!isArchiveRestoreOperationKind(operation.kind)) {
      ensureControlPlaneStorage(storage);
    }
    const source = formlessProgramSource();
    const result = await executeAuthorityOperation({
      ...(operation.kind === "entityOperation" && programAuthorization?.authorized
        ? {
            actor: programOperationInvocationActor(
              programAuthorization,
              actorKind!,
              hostSessionTarget,
            ),
            programOperationAuthorized: true,
          }
        : {}),
      body,
      createRecordId: formlessProgramCreatedRecordId,
      identity: route.identity,
      operation,
      publicReads: programWorkerRuntime.publicReads,
      source,
      storage,
      validateConstraints:
        operation.metadata.mode === "write"
          ? validateFormlessProgramRecordConstraint(storage)
          : undefined,
      writes,
    });

    return jsonResponse(result.body, result.status, result.headers);
  } catch (error) {
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

    if (error instanceof ActiveSchemaRefreshBlockedError) {
      return jsonResponse(activeSchemaRefreshBlockedResponse(error.message, error.blocker), 409);
    }

    if (error instanceof BadRequestError) {
      return jsonResponse({ error: error.message }, 400);
    }

    return jsonResponse({ error: errorMessage(error) }, 400);
  }
}

function guardedSnapshotRestoreValue(value: unknown): unknown {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "guardToken" in value &&
    "snapshot" in value
  ) {
    return (value as { snapshot: unknown }).snapshot;
  }

  return value;
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

function hostAuthSessionTargetForInstanceControlPlaneRequest(request: Request) {
  const target = hostAuthSessionTargetFromRequestHeaders(request.headers);

  if (!target || target.targetProfile !== "instance") {
    return undefined;
  }

  return target;
}

function isProgramReplicaReadOperation(operation: AuthorityOperation): boolean {
  return (
    operation.kind === "bootstrap" || operation.kind === "readSchema" || operation.kind === "sync"
  );
}

function programOperationInvocationActor(
  authorization: Extract<ProgramAccessAuthorizationResult, { authorized: true }>,
  requestedActorKind: SchemaOperationActorKind,
  target: ReturnType<typeof hostAuthSessionTargetForInstanceControlPlaneRequest>,
): OperationInvocationEnvelope["actor"] {
  if (authorization.callerFacts.kind === "trusted") {
    return {
      kind:
        requestedActorKind === "cliDeployer" || requestedActorKind === "runner"
          ? requestedActorKind
          : "admin",
    };
  }

  if (authorization.callerFacts.kind === "principal" && authorization.callerFacts.owner) {
    return { kind: "owner" };
  }

  const authenticated =
    authorization.session === undefined
      ? undefined
      : authenticatedOperationActorForSession({
          principalId: authorization.session.principalId,
          session: authorization.session,
          target,
        });

  return (
    authenticated ?? {
      kind: "authenticated",
      principalId: authorization.session?.principalId,
    }
  );
}

function handleInternalReadRecords(request: Request, storage: DurableObjectStorage): Response {
  if (request.method !== "GET") {
    return methodNotAllowedResponse("GET");
  }

  ensureControlPlaneStorage(storage);

  return jsonResponse({
    records: activeControlPlaneRecords(storage),
  });
}

function handleInternalReadOperationInvocations(
  request: Request,
  storage: DurableObjectStorage,
): Response {
  if (request.method !== "GET") {
    return methodNotAllowedResponse("GET");
  }

  ensureControlPlaneStorage(storage);

  return jsonResponse({
    invocations: readOperationInvocations(storage),
  });
}

async function handleInternalSyncDeploymentProjection(
  request: Request,
  storage: DurableObjectStorage,
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowedResponse("POST");
  }

  ensureControlPlaneStorage(storage);

  const parsed = parseInternalDeploymentProjectionRequest(await readJson(request));

  syncDeploymentProjectionRecords(storage, parsed);

  return jsonResponse({
    records: activeControlPlaneRecords(storage),
  });
}

async function handleInternalSyncDomainIntent(
  request: Request,
  storage: DurableObjectStorage,
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowedResponse("POST");
  }

  ensureControlPlaneStorage(storage);

  const parsed = parseInternalDomainIntentSyncRequest(await readJson(request));

  syncDomainIntentRecords(storage, parsed);

  return jsonResponse({
    records: activeControlPlaneRecords(storage),
  });
}

function handleInternalResolveRuntimeRoute(
  request: Request,
  storage: DurableObjectStorage,
): Response {
  if (request.method !== "GET") {
    return methodNotAllowedResponse("GET");
  }

  ensureControlPlaneStorage(storage);

  const url = new URL(request.url);
  const host = url.searchParams.get("host") ?? "";
  const pathname = routeRequestPath(url.searchParams.get("path"));
  const search = url.searchParams.get("search") ?? "";
  const includeHostless = url.searchParams.get("includeHostless") !== "false";
  return jsonResponse({
    route:
      resolveInstanceRuntimeRouteFromRecords({
        records: activeControlPlaneRecords(storage),
        request: {
          host,
          pathname,
          search,
        },
        options: { includeHostless },
      }) ?? null,
  });
}

function validateControlPlaneRecordWrite(
  storage: DurableObjectStorage,
  schema: typeof instanceControlPlaneSourceSchema,
  options: {
    additionalRecords?: StoredRecord[];
  } = {},
) {
  return (
    entityName: string,
    values: RecordValues,
    recordOptions?: {
      candidateRecordId?: string;
      ignoreRecordId?: string;
    },
  ) => {
    const entity = schema.entities.find((definition) => definition.key === entityName)!;
    if (!entity) {
      throw new BadRequestError(`Unknown entity "${entityName}".`);
    }

    const validated = validateRecordValues(
      values,
      entity,
      authorityStorageRecordValidationReader(storage),
      {
        additionalRecords: options.additionalRecords,
        entityName,
        schema,
      },
    );

    validateControlPlanePackageBoundary(
      storage,
      entityName,
      validated,
      options,
      recordOptions?.ignoreRecordId,
    );
    validateFormlessProgramRecordConstraint(storage)(entityName, validated, {
      ...(options.additionalRecords === undefined
        ? {}
        : { additionalRecords: options.additionalRecords }),
      ...(recordOptions?.candidateRecordId === undefined
        ? {}
        : { candidateRecordId: recordOptions.candidateRecordId }),
      ...(recordOptions?.ignoreRecordId === undefined
        ? {}
        : { ignoreRecordId: recordOptions.ignoreRecordId }),
    });
    assertUniqueConstraints(storage, schema, entityName, validated, recordOptions);
  };
}

function validateControlPlanePackageBoundary(
  storage: DurableObjectStorage,
  entityName: string,
  values: RecordValues,
  options: {
    additionalRecords?: StoredRecord[];
  },
  existingRecordId?: string,
) {
  if (entityName === "instance-settings") {
    validateInstanceSettingsBoundary(storage, values, options.additionalRecords, existingRecordId);
    return;
  }

  if (entityName === "email-domain") {
    validateEmailDomainBoundary(storage, values, options.additionalRecords);
    return;
  }

  if (entityName === "email-sender") {
    validateEmailSenderBoundary(storage, values, options.additionalRecords);
  }
}

function validateInstanceSettingsBoundary(
  storage: DurableObjectStorage,
  values: RecordValues,
  additionalRecords: readonly StoredRecord[] | undefined,
  existingRecordId: string | undefined,
) {
  const settingsId = parseRequiredString("settingsId", values.settingsId);

  if (settingsId !== INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID) {
    throw new BadRequestError(
      `Field "settingsId" must be "${INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID}".`,
    );
  }

  const existingSettings = getBootstrapRecordsForControlPlaneValidation(storage, additionalRecords)
    .filter((record) => record.entity === "instance-settings" && !record.deletedAt)
    .filter((record) => record.id !== existingRecordId);

  if (existingSettings.length > 0) {
    throw new BadRequestError("Only one active instance-settings record is allowed.");
  }

  validateOptionalOrigin("canonicalOrigin", values.canonicalOrigin);
  validateOptionalOrigin("authOrigin", values.authOrigin);
  validateOptionalRelyingPartyId(
    "authRelyingPartyId",
    values.authRelyingPartyId,
    stringRecordValue(values.authOrigin) ?? stringRecordValue(values.canonicalOrigin),
  );
  validateOptionalEmailAddress("contactNotificationRecipient", values.contactNotificationRecipient);

  for (const fieldName of ["primaryRoute", "authRoute"] as const) {
    const routeId = stringRecordValue(values[fieldName]);

    if (routeId === undefined) {
      continue;
    }

    const route = findControlPlaneRecord(storage, "route", routeId, additionalRecords);

    if (
      !route ||
      route.values.enabled !== true ||
      stringRecordValue(route.values.matchHost) === undefined
    ) {
      throw new BadRequestError(`Field "${fieldName}" must reference an enabled exact-host route.`);
    }
  }

  const adminRoute = stringRecordValue(values.adminRoute);

  if (adminRoute !== undefined) {
    const route = findControlPlaneRecord(storage, "route", adminRoute, additionalRecords);

    if (
      !route ||
      route.values.enabled !== true ||
      stringRecordValue(route.values.matchHost) === undefined ||
      route.values.kind !== "mount" ||
      route.values.targetProfile !== "instance" ||
      route.values.surface !== "admin"
    ) {
      throw new BadRequestError(
        'Field "adminRoute" must reference an enabled exact-host instance admin route.',
      );
    }
  }

  const defaultEmailDomain = stringRecordValue(values.defaultEmailDomain);
  const defaultContactSender = stringRecordValue(values.defaultContactSender);
  const defaultAuthSender = stringRecordValue(values.defaultAuthSender);

  validateDefaultEmailSenderBoundary(storage, additionalRecords, {
    defaultEmailDomain,
    fieldName: "defaultContactSender",
    purpose: "contact-notification",
    senderId: defaultContactSender,
  });
  validateDefaultEmailSenderBoundary(storage, additionalRecords, {
    defaultEmailDomain,
    fieldName: "defaultAuthSender",
    purpose: "auth",
    senderId: defaultAuthSender,
  });

  if (
    values.productionIdentityStatus === "configured" &&
    values.canonicalOrigin === undefined &&
    values.authOrigin === undefined &&
    values.primaryRoute === undefined &&
    values.authRoute === undefined
  ) {
    throw new BadRequestError(
      'Field "productionIdentityStatus" cannot be "configured" without a canonical origin or production route.',
    );
  }
}

function validateDefaultEmailSenderBoundary(
  storage: DurableObjectStorage,
  additionalRecords: readonly StoredRecord[] | undefined,
  input: {
    defaultEmailDomain?: string;
    fieldName: "defaultAuthSender" | "defaultContactSender";
    purpose: "auth" | "contact-notification";
    senderId?: string;
  },
) {
  if (input.senderId === undefined) {
    return;
  }

  const sender = findControlPlaneRecord(storage, "email-sender", input.senderId, additionalRecords);

  if (!sender) {
    throw new BadRequestError(
      `Field "${input.fieldName}" references unknown email-sender record "${input.senderId}".`,
    );
  }

  if (stringRecordValue(sender.values.purpose) !== input.purpose) {
    throw new BadRequestError(
      `Field "${input.fieldName}" must reference a sender with purpose "${input.purpose}".`,
    );
  }

  if (
    input.defaultEmailDomain !== undefined &&
    stringRecordValue(sender.values.emailDomain) !== input.defaultEmailDomain
  ) {
    throw new BadRequestError(
      `Field "${input.fieldName}" must reference a sender for the selected default email domain.`,
    );
  }
}

function validateEmailDomainBoundary(
  storage: DurableObjectStorage,
  values: RecordValues,
  additionalRecords: readonly StoredRecord[] | undefined,
) {
  assertNormalizedControlPlaneHost("domain", parseRequiredString("domain", values.domain));

  const primaryRoute = stringRecordValue(values.primaryRoute);

  if (primaryRoute === undefined) {
    return;
  }

  const route = findControlPlaneRecord(storage, "route", primaryRoute, additionalRecords);

  if (
    !route ||
    route.values.enabled !== true ||
    stringRecordValue(route.values.matchHost) === undefined
  ) {
    throw new BadRequestError('Field "primaryRoute" must reference an enabled exact-host route.');
  }
}

function validateEmailSenderBoundary(
  storage: DurableObjectStorage,
  values: RecordValues,
  additionalRecords: readonly StoredRecord[] | undefined,
) {
  const address = parseEmailAddress("address", parseRequiredString("address", values.address));
  const emailDomain = parseRequiredString("emailDomain", values.emailDomain);
  const domainRecord = findControlPlaneRecord(
    storage,
    "email-domain",
    emailDomain,
    additionalRecords,
  );

  if (!domainRecord) {
    throw new BadRequestError(
      `Field "emailDomain" references unknown email-domain record "${emailDomain}".`,
    );
  }

  const domain = parseRequiredString("emailDomain.domain", domainRecord.values.domain);

  if (!hostBelongsToDomain(address.host, domain)) {
    throw new BadRequestError(
      `Field "address" host must belong to referenced email domain "${domain}".`,
    );
  }

  const displayName = stringRecordValue(values.displayName);

  if (displayName !== undefined && /[\r\n]/.test(displayName)) {
    throw new BadRequestError('Field "displayName" must not contain line breaks.');
  }
}

function findControlPlaneRecord(
  storage: DurableObjectStorage,
  entity: string,
  id: string,
  additionalRecords: readonly StoredRecord[] | undefined,
): StoredRecord | undefined {
  const pending = additionalRecords?.find(
    (record) => record.entity === entity && record.id === id && !record.deletedAt,
  );

  if (pending) {
    return pending;
  }

  const stored = getStoredRecord(storage, id);

  return stored?.entity === entity && !stored.deletedAt ? stored : undefined;
}

function getBootstrapRecordsForControlPlaneValidation(
  storage: DurableObjectStorage,
  additionalRecords: readonly StoredRecord[] | undefined,
): StoredRecord[] {
  if (!additionalRecords?.length) {
    return getBootstrapRecords(storage);
  }

  const recordsById = new Map(getBootstrapRecords(storage).map((record) => [record.id, record]));

  for (const record of additionalRecords) {
    recordsById.set(record.id, record);
  }

  return [...recordsById.values()];
}

function validateOptionalOrigin(fieldName: string, value: unknown) {
  if (value === undefined) {
    return;
  }

  const origin = parseRequiredString(fieldName, value);
  const normalized = normalizeControlPlaneOrigin(origin);

  if (normalized !== origin) {
    throw new BadRequestError(`Field "${fieldName}" must be a normalized absolute origin.`);
  }
}

function validateOptionalRelyingPartyId(
  fieldName: string,
  value: unknown,
  canonicalOrigin: string | undefined,
) {
  if (value === undefined) {
    return;
  }

  const rawRelyingPartyId = parseRequiredString(fieldName, value);
  const relyingPartyId = rawRelyingPartyId.toLowerCase();

  if (
    relyingPartyId !== rawRelyingPartyId ||
    normalizeInstanceDomainHost(relyingPartyId).ok !== true ||
    (canonicalOrigin !== undefined && !relyingPartyIdMatchesOrigin(relyingPartyId, canonicalOrigin))
  ) {
    throw new BadRequestError(
      `Field "${fieldName}" must be a normalized relying-party id for the configured auth origin.`,
    );
  }
}

function validateOptionalEmailAddress(fieldName: string, value: unknown) {
  if (value === undefined) {
    return;
  }

  parseEmailAddress(fieldName, parseRequiredString(fieldName, value));
}

function assertNormalizedControlPlaneHost(fieldName: string, value: string) {
  const normalized = normalizeInstanceDomainHost(value);

  if (!normalized.ok || normalized.host !== value) {
    throw new BadRequestError(`Field "${fieldName}" must be a normalized exact host.`);
  }
}

function normalizeControlPlaneOrigin(value: string): string | undefined {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const normalizedHostResult = normalizeInstanceDomainHost(hostname);
    const normalizedHost = isLocalControlPlaneHost(hostname)
      ? hostname
      : normalizedHostResult.ok
        ? normalizedHostResult.host
        : undefined;
    const normalizedOrigin = url.origin.replace(url.hostname, hostname);

    if (
      normalizedHost === undefined ||
      url.username !== "" ||
      url.password !== "" ||
      url.pathname !== "/" ||
      url.search !== "" ||
      url.hash !== "" ||
      (url.protocol !== "https:" &&
        !(url.protocol === "http:" && isLocalControlPlaneHost(hostname))) ||
      normalizedOrigin !== value
    ) {
      return undefined;
    }

    return normalizedOrigin;
  } catch {
    return undefined;
  }
}

function relyingPartyIdMatchesOrigin(relyingPartyId: string, canonicalOrigin: string) {
  const normalizedOrigin = normalizeControlPlaneOrigin(canonicalOrigin);

  if (normalizedOrigin === undefined) {
    return false;
  }
  const canonicalHost = new URL(normalizedOrigin).hostname.toLowerCase();
  return canonicalHost === relyingPartyId || canonicalHost.endsWith(`.${relyingPartyId}`);
}
function parseEmailAddress(
  fieldName: string,
  value: string,
): {
  host: string;
} {
  const atIndex = value.lastIndexOf("@");
  const local = atIndex <= 0 ? "" : value.slice(0, atIndex);
  const host = atIndex <= 0 ? "" : value.slice(atIndex + 1).toLowerCase();
  const normalized = `${local}@${host}`;

  if (
    value !== normalized ||
    value.indexOf("@") !== atIndex ||
    local === "" ||
    !/^[^@\s<>]+$/.test(local) ||
    normalizeInstanceDomainHost(host).ok !== true
  ) {
    throw new BadRequestError(`Field "${fieldName}" must be a normalized email address.`);
  }

  return { host };
}

function hostBelongsToDomain(host: string, domain: string) {
  return host === domain || host.endsWith(`.${domain}`);
}

function isLocalControlPlaneHost(value: string) {
  return value === "localhost" || value.endsWith(".localhost");
}

function syncDeploymentProjectionRecords(
  storage: DurableObjectStorage,
  input: {
    now: string;
    target: DeploymentTarget;
    targetUrl: string;
  },
) {
  upsertDeploymentConfigRecord(storage, input);
}

function syncDomainIntentRecords(
  storage: DurableObjectStorage,
  input: {
    mappings?: InstanceDomainMapping[];
    now: string;
    redirectIntents?: InstanceDomainProviderRedirectIntent[];
  },
) {
  const domainRouteCandidates = input.mappings?.map(domainMappingRouteCandidate) ?? [];
  const redirectRouteCandidates =
    input.redirectIntents?.map((intent) => redirectRouteCandidate(intent)) ?? [];
  const safeCandidates = assertRouteIntentSyncCandidatesAreSafe(storage, [
    ...domainRouteCandidates,
    ...redirectRouteCandidates,
  ]);

  for (const candidate of safeCandidates) {
    upsertControlPlaneRecord(storage, {
      action: candidate.id.startsWith("route:redirect:")
        ? "syncRedirectIntent"
        : "syncDomainMapping",
      entity: "route",
      id: candidate.id,
      values: candidate.values,
    });
  }

  if (input.mappings !== undefined) {
    const nextDomainRouteIds = new Set(domainRouteCandidates.map((candidate) => candidate.id));

    removeMissingControlPlaneIntentRecords(storage, nextDomainRouteIds, {
      action: "removeDomainMappingIntent",
      idPrefix: "route:host:",
      selected: isCurrentDomainMappingRoute,
    });
  }

  if (input.redirectIntents !== undefined) {
    const nextRedirectRouteIds = new Set(redirectRouteCandidates.map((candidate) => candidate.id));

    removeMissingControlPlaneIntentRecords(storage, nextRedirectRouteIds, {
      action: "removeRedirectIntent",
      idPrefix: "route:redirect:",
    });
  }
}

function upsertDeploymentConfigRecord(
  storage: DurableObjectStorage,
  input: {
    now: string;
    target: DeploymentTarget;
    targetUrl: string;
  },
) {
  const existing = findActiveDeploymentConfigRecord(storage, input.target.targetId);

  if (existing) {
    return;
  }

  const values: RecordValues = {
    targetId: input.target.targetId,
    label: input.target.label ?? input.target.targetId,
    enabled: true,
    targetUrl: input.targetUrl,
    providerFamily: "cloudflare",
  };

  upsertControlPlaneRecord(storage, {
    action: "syncDeploymentConfig",
    entity: "deployment-config",
    id: input.target.targetId,
    values,
  });
}

function findActiveDeploymentConfigRecord(
  storage: DurableObjectStorage,
  targetId: string,
): StoredRecord | undefined {
  return activeControlPlaneRecords(storage).find(
    (record) =>
      record.entity === "deployment-config" &&
      stringRecordValue(record.values.targetId) === targetId,
  );
}

function upsertControlPlaneRecord(
  storage: DurableObjectStorage,
  input: {
    action: string;
    entity: string;
    id: string;
    values: RecordValues;
  },
) {
  const existing = getStoredRecord(storage, input.id);
  const validate = validateControlPlaneRecordWrite(storage, instanceControlPlaneSourceSchema);

  if (!existing || existing.deletedAt) {
    createRecordSetForOperationOutcome(
      storage,
      `controlPlane:${input.action}:create:${input.id}:${recordValuesHash(input.values)}`,
      input.entity,
      input.action,
      [{ entity: input.entity, id: input.id, values: input.values }],
      validate,
    );
    return;
  }

  if (recordValuesEqual(existing.values, input.values)) {
    return;
  }

  patchStoredRecordOutcome(
    storage,
    {
      writeId: `controlPlane:${input.action}:patch:${input.id}:${recordValuesHash(input.values)}`,
      entity: input.entity,
      kind: "patch",
      recordId: input.id,
      values: input.values,
    },
    input.values,
    validate,
  );
}

function domainMappingRouteCandidate(mapping: InstanceDomainMapping): RouteIntentSyncCandidate {
  return {
    id: domainMappingRouteRecordId(mapping),
    source: `domain mapping route sync "${mapping.profile}:${mapping.host}"`,
    values: domainMappingRouteRecordValues(mapping),
  };
}

function domainMappingRouteRecordValues(mapping: InstanceDomainMapping): RecordValues {
  const surface = domainMappingSurfaceForProfile(mapping.profile);

  return {
    enabled: mapping.enabled,
    matchHost: mapping.host,
    matchPath: "/",
    matchPrefix: "/",
    kind: "mount",
    targetProfile: domainMappingTargetProfile(mapping.profile),
    ...(surface === undefined ? {} : { surface }),
    access: instanceControlPlaneDefaultRouteAccess({
      kind: "mount",
      surface,
      targetProfile: domainMappingTargetProfile(mapping.profile),
    }),
  };
}

function isCurrentDomainMappingRoute(record: StoredRecord): boolean {
  const targetProfile = stringRecordValue(record.values.targetProfile);

  return (
    record.entity === "route" &&
    record.values.kind === "mount" &&
    stringRecordValue(record.values.matchHost) !== undefined &&
    (targetProfile === "instance" || targetProfile === "public-site")
  );
}

function redirectRouteCandidate(
  intent: InstanceDomainProviderRedirectIntent,
): RouteIntentSyncCandidate {
  return {
    id: redirectRouteRecordId(intent.fromHost),
    source: `redirect route sync "${intent.fromHost}"`,
    values: redirectRouteRecordValues(intent),
  };
}

function redirectRouteRecordValues(intent: InstanceDomainProviderRedirectIntent): RecordValues {
  return {
    enabled: intent.enabled,
    matchHost: intent.fromHost,
    matchPath: "/",
    matchPrefix: "/",
    kind: "redirect",
    ...(intent.toHost === undefined ? {} : { toHost: intent.toHost }),
    ...(intent.toUrl === undefined ? {} : { toUrl: intent.toUrl }),
    statusCode: String(intent.statusCode) as InstanceControlPlaneRedirectStatusCode,
    preservePath: intent.preservePath,
    preserveQueryString: intent.preserveQueryString,
  };
}

function removeMissingControlPlaneIntentRecords(
  storage: DurableObjectStorage,
  nextRecordIds: Set<string>,
  input: {
    action: string;
    idPrefix: string;
    selected?: (record: StoredRecord) => boolean;
  },
) {
  const recordsToRemove = activeControlPlaneRecords(storage).filter(
    (record) =>
      record.entity === "route" &&
      record.id.startsWith(input.idPrefix) &&
      (input.selected === undefined || input.selected(record)) &&
      !nextRecordIds.has(record.id),
  );

  if (recordsToRemove.length === 0) {
    return;
  }

  const removedRecordIds = recordsToRemove.map((record) => record.id).sort();
  const actionId = `controlPlane:${input.action}:${removedRecordIds.join(",")}`;
  const validate = validateControlPlaneRecordWrite(storage, instanceControlPlaneSourceSchema);

  writeRecordSetForOperationOutcome(
    storage,
    actionId,
    "route",
    input.action,
    recordsToRemove.map((record) => ({ kind: "delete" as const, record })),
    validate,
  );
}

function activeControlPlaneRecords(storage: DurableObjectStorage): StoredRecord[] {
  return getBootstrapRecords(storage).filter((record) => !record.deletedAt);
}

function parseInternalDeploymentProjectionRequest(value: unknown): {
  now: string;
  target: DeploymentTarget;
  targetUrl: string;
} {
  if (!isRecord(value)) {
    throw new BadRequestError("Deployment projection request must be an object.");
  }

  const target = parseDeploymentTarget(value.target);
  const targetUrl = parseRequiredString("targetUrl", value.targetUrl);
  const now = typeof value.now === "string" && value.now.trim() !== "" ? value.now : nowIsoString();

  return { now, target, targetUrl };
}

function parseDeploymentTarget(value: unknown): DeploymentTarget {
  if (!isRecord(value)) {
    throw new BadRequestError("Deployment target must be an object.");
  }

  const targetId = parseRequiredString("target.targetId", value.targetId);

  return {
    targetId,
    ...(typeof value.label === "string" && value.label.trim() !== "" ? { label: value.label } : {}),
  };
}

function parseInternalDomainIntentSyncRequest(value: unknown): {
  mappings?: InstanceDomainMapping[];
  now: string;
  redirectIntents?: InstanceDomainProviderRedirectIntent[];
} {
  if (!isRecord(value)) {
    throw new BadRequestError("Domain intent sync request must be an object.");
  }

  if (value.mappings === undefined && value.redirectIntents === undefined) {
    throw new BadRequestError("Domain intent sync request must include mappings or redirects.");
  }

  const now = typeof value.now === "string" && value.now.trim() !== "" ? value.now : nowIsoString();

  return {
    ...(value.mappings === undefined
      ? {}
      : { mappings: parseInternalDomainMappings(value.mappings) }),
    now,
    ...(value.redirectIntents === undefined
      ? {}
      : { redirectIntents: parseInternalRedirectIntents(value.redirectIntents) }),
  };
}

function parseInternalDomainMappings(value: unknown): InstanceDomainMapping[] {
  if (!Array.isArray(value)) {
    throw new BadRequestError("Domain intent sync mappings must be an array.");
  }

  return value.map(parseInternalDomainMapping);
}

function parseInternalDomainMapping(value: unknown): InstanceDomainMapping {
  if (!isRecord(value)) {
    throw new BadRequestError("Domain intent sync mapping must be an object.");
  }

  const profile = parseDomainMappingProfile(value.profile);

  return {
    host: parseRequiredString("mapping.host", value.host),
    profile,
    enabled: booleanRecordValue(value.enabled, "mapping.enabled"),
    createdAt: parseRequiredString("mapping.createdAt", value.createdAt),
    updatedAt: parseRequiredString("mapping.updatedAt", value.updatedAt),
  };
}

function parseInternalRedirectIntents(value: unknown): InstanceDomainProviderRedirectIntent[] {
  if (!Array.isArray(value)) {
    throw new BadRequestError("Domain intent sync redirect intents must be an array.");
  }

  return value.map(parseInternalRedirectIntent);
}

function parseInternalRedirectIntent(value: unknown): InstanceDomainProviderRedirectIntent {
  if (!isRecord(value)) {
    throw new BadRequestError("Domain intent sync redirect intent must be an object.");
  }

  return {
    fromHost: parseRequiredString("redirect.fromHost", value.fromHost),
    ...(typeof value.toHost === "string" && value.toHost.trim() !== ""
      ? { toHost: value.toHost }
      : {}),
    ...(typeof value.toUrl === "string" && value.toUrl.trim() !== "" ? { toUrl: value.toUrl } : {}),
    statusCode: parseRedirectStatusCode(value.statusCode),
    preservePath: booleanRecordValue(value.preservePath, "redirect.preservePath"),
    preserveQueryString: booleanRecordValue(
      value.preserveQueryString,
      "redirect.preserveQueryString",
    ),
    enabled: booleanRecordValue(value.enabled, "redirect.enabled"),
    createdAt: parseRequiredString("redirect.createdAt", value.createdAt),
    updatedAt: parseRequiredString("redirect.updatedAt", value.updatedAt),
  };
}

function parseRequiredString(field: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequestError(`Field "${field}" must be a non-empty string.`);
  }

  return value;
}

function booleanRecordValue(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new BadRequestError(`Field "${field}" must be a boolean.`);
  }

  return value;
}

function stringRecordValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseRouteString(field: string, value: unknown): `/${string}` {
  const route = parseRequiredString(field, value);

  if (!route.startsWith("/")) {
    throw new BadRequestError(`Field "${field}" must be a route path.`);
  }

  return route as `/${string}`;
}

function parseDomainMappingProfile(value: unknown): InstanceDomainMappingProfile {
  if (value === "instance" || value === "publicSite") {
    return value;
  }

  throw new BadRequestError('Field "mapping.profile" must be "instance" or "publicSite".');
}

function parseRedirectStatusCode(
  value: unknown,
): InstanceDomainProviderRedirectIntent["statusCode"] {
  if (value === 301 || value === 302 || value === 303 || value === 307 || value === 308) {
    return value;
  }

  throw new BadRequestError('Field "redirect.statusCode" must be 301, 302, 303, 307, or 308.');
}

function domainMappingRouteRecordId(mapping: Pick<InstanceDomainMapping, "host" | "profile">) {
  return `route:host:${mapping.profile}:${mapping.host}`;
}

function redirectRouteRecordId(fromHost: string) {
  return `route:redirect:${fromHost}`;
}

function domainMappingSurfaceForProfile(
  profile: InstanceDomainMappingProfile,
): InstanceControlPlaneRouteValues["surface"] | undefined {
  switch (profile) {
    case "publicSite":
      return "public-site";
    case "instance":
      return undefined;
  }
}

function domainMappingTargetProfile(
  profile: InstanceDomainMappingProfile,
): NonNullable<InstanceControlPlaneRouteValues["targetProfile"]> {
  switch (profile) {
    case "publicSite":
      return "public-site";
    case "instance":
      return "instance";
  }
}

function assertRouteIntentSyncCandidatesAreSafe(
  storage: DurableObjectStorage,
  candidates: readonly RouteIntentSyncCandidate[],
): RouteIntentSyncCandidate[] {
  const uniqueCandidates = uniqueRouteIntentSyncCandidates(candidates);
  const enabledRoutes = activeControlPlaneRecords(storage)
    .filter((record) => record.entity === "route" && record.values.enabled === true)
    .map((record) => ({
      id: record.id,
      match: routeMatchFromValues(record.values),
      source: `route "${record.id}"`,
    }));

  for (const candidate of uniqueCandidates) {
    if (candidate.values.enabled !== true) {
      continue;
    }

    const candidateMatch = routeMatchFromValues(candidate.values);

    for (const existing of enabledRoutes) {
      if (existing.id === candidate.id) {
        continue;
      }

      if (
        candidateMatch.host === existing.match.host &&
        routeMatchesOverlap(candidateMatch, existing.match)
      ) {
        throw new BadRequestError(
          `Route intent sync blocker: ${candidate.source} match "${formatRouteMatch(candidateMatch)}" conflicts with ${existing.source}.`,
        );
      }
    }

    enabledRoutes.push({
      id: candidate.id,
      match: candidateMatch,
      source: candidate.source,
    });
  }

  return uniqueCandidates;
}

function uniqueRouteIntentSyncCandidates(
  candidates: readonly RouteIntentSyncCandidate[],
): RouteIntentSyncCandidate[] {
  const byId = new Map<string, RouteIntentSyncCandidate>();

  for (const candidate of candidates) {
    const existing = byId.get(candidate.id);

    if (!existing) {
      byId.set(candidate.id, candidate);
      continue;
    }

    if (!recordValuesEqual(existing.values, candidate.values)) {
      throw new BadRequestError(
        `Route intent sync blocker: ${existing.source} and ${candidate.source} both map to route "${candidate.id}" with different values.`,
      );
    }
  }

  return [...byId.values()];
}

function routeMatchFromValues(values: RecordValues): {
  host: string;
  path: string;
  prefix?: string;
} {
  return {
    host: stringRecordValue(values.matchHost) ?? "<hostless>",
    path: parseRouteString("route.matchPath", values.matchPath),
    ...(stringRecordValue(values.matchPrefix) === undefined
      ? {}
      : { prefix: parseRouteString("route.matchPrefix", values.matchPrefix) }),
  };
}
function routeMatchesOverlap(
  left: {
    path: string;
    prefix?: string;
  },
  right: {
    path: string;
    prefix?: string;
  },
) {
  return (
    left.path === right.path ||
    (left.prefix !== undefined && routePathMatchesPrefix(right.path, left.prefix)) ||
    (right.prefix !== undefined && routePathMatchesPrefix(left.path, right.prefix)) ||
    (left.prefix !== undefined &&
      right.prefix !== undefined &&
      routePrefixesOverlap(left.prefix, right.prefix))
  );
}

function routePathMatchesPrefix(path: string, prefix: string) {
  return prefix === "/" || path.startsWith(prefix);
}

function routePrefixesOverlap(left: string, right: string) {
  return left === "/" || right === "/" || left.startsWith(right) || right.startsWith(left);
}

function formatRouteMatch(match: { host: string; path: string; prefix?: string }) {
  return `${match.host}${match.path}${match.prefix === undefined ? "" : ` ${match.prefix}`}`;
}

function recordValuesEqual(left: RecordValues, right: RecordValues) {
  const leftEntries = Object.entries(left);
  const rightKeys = new Set(Object.keys(right));

  return (
    leftEntries.length === rightKeys.size &&
    leftEntries.every(
      ([fieldName, fieldValue]) => rightKeys.has(fieldName) && right[fieldName] === fieldValue,
    )
  );
}

function recordValuesHash(values: RecordValues) {
  const stable = JSON.stringify(
    Object.fromEntries(Object.entries(values).sort(([left], [right]) => left.localeCompare(right))),
  );
  let hash = 2166136261;

  for (let index = 0; index < stable.length; index += 1) {
    hash ^= stable.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function routeRequestPath(value: string | null): `/${string}` {
  if (typeof value !== "string" || !value.startsWith("/")) {
    return "/";
  }

  return value as `/${string}`;
}

function isInternalControlPlanePath(path: string) {
  return path.startsWith("/_internal/");
}

function controlPlaneActorKindFromRequest(request: Request, url: URL): SchemaOperationActorKind {
  const value =
    request.headers.get("X-Formless-Control-Plane-Actor") ??
    request.headers.get("X-Formless-Actor-Kind") ??
    url.searchParams.get("actorKind") ??
    "owner";

  if (actorKinds.includes(value as SchemaOperationActorKind)) {
    return value as SchemaOperationActorKind;
  }

  throw new BadRequestError(`Unsupported control-plane actor "${value}".`);
}

function assertBrowserControlPlaneWriteActor(
  actorKind: SchemaOperationActorKind,
  operation: AuthorityOperation,
) {
  if (actorKind === "owner" || actorKind === "admin") {
    return;
  }

  throw new BadRequestError(
    `Control-plane ${operation.kind} writes are not exposed to actor "${actorKind}".`,
  );
}

const noopWriteNotifier: AuthorityWriteNotifier = {
  apply(write) {
    return write();
  },
  applyGuarded(_guardToken, write) {
    return write();
  },
};

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new BadRequestError("Request body must be valid JSON.");
  }
}

function methodNotAllowedResponse(allow: string): Response {
  return jsonResponse({ error: "Method not allowed." }, 405, { Allow: allow });
}

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  const responseHeaders = new Headers(headers);

  if (!responseHeaders.has("Cache-Control")) {
    responseHeaders.set("Cache-Control", "no-store");
  }

  return Response.json(body, {
    status,
    headers: responseHeaders,
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Bad request.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
