import {
  parseInstanceControlPlaneApiRoute,
  type InstanceControlPlaneStorageIdentity,
} from "../shared/app-storage-identity.ts";
import {
  appInstallRegistryError,
  createAppInstall,
  findAppInstall,
  isAppInstallRegistrationPolicy,
  parseAppInstallRegistrationOperation,
  type AppInstall,
  type AppInstallId,
  type PackageAppKey,
} from "@dpeek/formless-installed-apps";
import { findResolvedAppPackage, type AppPackageResolver } from "../shared/app-packages.ts";
import { nowIsoString } from "../shared/clock.ts";
import {
  INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
  INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
  INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID,
  instanceControlPlaneAppInstallsFromRecords,
  instanceControlPlaneDefaultRouteAccess,
  instanceControlPlaneSchemaProvenance,
  type InstanceControlPlaneRecord,
  instanceControlPlaneRecordsForAppInstall,
  instanceControlPlaneSchema,
  type InstanceControlPlaneAppInstallValues,
  type InstanceControlPlaneRedirectStatusCode,
  type InstanceControlPlaneRouteValues,
} from "@dpeek/formless-instance-control-plane";
import type { DeploymentTarget } from "../shared/deployment-runtime.ts";
import type { InstanceDomainProviderRedirectIntent } from "../shared/domain-provider-api.ts";
import type {
  InstanceDomainMapping,
  InstanceDomainMappingProfile,
} from "../shared/instance-domain-mappings.ts";
import { normalizeInstanceDomainHost } from "../shared/instance-domain-mappings.ts";
import type { RecordValues, StoredRecord } from "@dpeek/formless-storage";
import { parseCreateAppInstallRequest, type CreateAppInstallRequest } from "../shared/protocol.ts";
import { type EntityOperationSchema, type SchemaOperationActorKind } from "@dpeek/formless-schema";
import {
  isSourceSchemaHash,
  type PackageAppRevision,
  type SourceSchemaHash,
} from "../shared/upgrade-migrations.ts";
import {
  authorizeAuthorityOperation,
  authorizeOperationalManagement,
  type AuthorityAdminGuardEnv,
} from "./authority-admin-guard.ts";
import { authorityStorageRecordValidationReader } from "./authority-record-validation-reader.ts";
import {
  executeAuthorityOperation,
  selectAuthorityOperation,
  type AuthorityOperation,
  type AuthorityWriteNotifier,
} from "./authority-operations.ts";
import { validateRecordValues } from "./authority-validation.ts";
import { assertUniqueConstraints } from "./constraints.ts";
import { BadRequestError } from "./errors.ts";
import type { WorkerSchemaAppDefinition } from "./schema-apps.ts";
import {
  createRecordSetForOperationOutcome,
  ensureStorageTables,
  ActiveSchemaRefreshBlockedError,
  getBootstrapRecords,
  getOperationInvocationById,
  getStoredRecord,
  initializeStorageFromSource,
  patchStoredRecordOutcome,
  recordOperationInvocationAccepted,
  recordOperationInvocationFailed,
  recordOperationInvocationOutcome,
  readOperationInvocations,
  type RecordConstraintValidator,
  type StorageSource,
  writeRecordSetForOperationOutcome,
  writeRecordSetForCommandOperationOutcome,
} from "./storage.ts";
import type {
  OperationInvocationEnvelope,
  OperationCommandOutput,
  OperationInvocationResponse,
} from "../shared/operation-invocation.ts";
import {
  INTERNAL_RESOLVE_INSTANCE_RUNTIME_ROUTE_PATH,
  resolveInstanceRuntimeRouteFromRecords,
} from "./instance-runtime-routes.ts";
import {
  activeAppPackageResolver,
  findActiveWorkerSchemaAppDefinition,
  type ActiveRuntimeAppPackageEnv,
} from "./runtime-app-packages.ts";
import { hostAuthSessionTargetFromRequestHeaders } from "./instance-auth-handoff.ts";

const actorKinds = ["admin", "cliDeployer", "owner", "runner"] as const;
const operationalControlPlaneEntityNames = new Set([
  "app-install",
  "deployment-config",
  "email-domain",
  "email-sender",
  "route",
]);
const createAppInstallControlPlaneOperation = "createAppInstall";
const createAppInstallControlPlaneOperationKey = "app-install.createAppInstall";
export const CREATE_APP_INSTALL_CONTROL_PLANE_OPERATION_PATH =
  "/operations/app-install/createAppInstall";
const createAppInstallControlPlaneOperationSchema = {
  label: "Create app install",
  kind: "command",
  scope: "collection",
  output: { type: "command" },
  idempotency: { required: true },
  audit: { input: "summary" },
  policy: { actors: ["admin", "owner"], visible: false },
} satisfies EntityOperationSchema;
export const INTERNAL_UPDATE_APP_INSTALL_PACKAGE_FACTS_PATH =
  "/_internal/update-app-install-package-facts";
export const INTERNAL_READ_RECORDS_PATH = "/_internal/read-records";
export const INTERNAL_READ_OPERATION_INVOCATIONS_PATH = "/_internal/read-operation-invocations";
export const INTERNAL_SYNC_DOMAIN_INTENT_PATH = "/_internal/sync-domain-intent";
export const INTERNAL_SYNC_DEPLOYMENT_PROJECTION_PATH = "/_internal/sync-deployment-projection";
const instanceControlPlaneSourceSchema = instanceControlPlaneSchema;
const instanceControlPlaneApp = {
  key: INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
  label: "Instance control plane",
  route: "/instance-control-plane",
  sourceSchema: instanceControlPlaneSourceSchema,
} satisfies WorkerSchemaAppDefinition;

function instanceControlPlaneSource(): StorageSource {
  return {
    schema: instanceControlPlaneSourceSchema,
    schemaKey: INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
    schemaProvenance: instanceControlPlaneSchemaProvenance,
    storageIdentity: INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
  };
}

function initializeControlPlaneStorage(storage: DurableObjectStorage) {
  ensureStorageTables(storage);
  initializeStorageFromSource(storage, instanceControlPlaneSource());
}

function ensureControlPlaneStorage(storage: DurableObjectStorage) {
  initializeControlPlaneStorage(storage);
}

type InstanceControlPlaneApiEnv = AuthorityAdminGuardEnv &
  ActiveRuntimeAppPackageEnv & {
    FORMLESS_AUTHORITY: DurableObjectNamespace;
  };

type ParsedCreateAppInstallOperationRequest = {
  idempotencyKey: string;
  input: CreateAppInstallRequest;
  operationId: string;
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
  const route = parseInstanceControlPlaneApiRoute(new URL(request.url).pathname);

  if (!route) {
    return undefined;
  }

  if (isInternalControlPlanePath(route.path)) {
    return jsonResponse({ error: "Not found." }, 404);
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY);

  return env.FORMLESS_AUTHORITY.get(id).fetch(request);
}

export async function handleInstanceControlPlaneDurableObjectRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceControlPlaneApiEnv,
): Promise<Response | undefined> {
  const url = new URL(request.url);
  const route = parseInstanceControlPlaneApiRoute(url.pathname);

  if (!route) {
    return undefined;
  }

  try {
    if (route.path === INTERNAL_UPDATE_APP_INSTALL_PACKAGE_FACTS_PATH) {
      return await handleInternalUpdateAppInstallPackageFacts(request, storage, env);
    }

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
      return handleInternalResolveRuntimeRoute(request, storage, env);
    }

    if (route.path === INTERNAL_SYNC_DEPLOYMENT_PROJECTION_PATH) {
      return await handleInternalSyncDeploymentProjection(request, storage);
    }

    if (route.path === CREATE_APP_INSTALL_CONTROL_PLANE_OPERATION_PATH) {
      return await handleCreateAppInstallOperation(request, route.identity, storage, env);
    }

    const operation = selectAuthorityOperation({
      method: request.method,
      path: route.path,
      searchParams: url.searchParams,
    });

    if (!operation) {
      return jsonResponse({ error: "Not found." }, 404);
    }

    const actorKind = controlPlaneActorKindFromRequest(request, url);
    const hostSessionTarget = hostAuthSessionTargetForInstanceControlPlaneRequest(request);
    const authorization = isOperationalControlPlaneOperation(operation)
      ? await authorizeOperationalManagement(request, env, {
          error: operationalControlPlaneAuthorizationError(operation),
          hostSessionTarget,
        })
      : await authorizeAuthorityOperation(request, operation, env, { hostSessionTarget });

    if (!authorization.authorized) {
      return jsonResponse(
        { error: authorization.error },
        authorization.status,
        authorization.headers,
      );
    }

    if (operation.metadata.mode === "write") {
      assertBrowserControlPlaneWriteActor(actorKind, operation);
    }

    const body = operation.metadata.mode === "write" ? await readJson(request) : undefined;
    ensureControlPlaneStorage(storage);
    const packageResolver = activeAppPackageResolver(env);
    const source = instanceControlPlaneSource();
    const result = await executeAuthorityOperation({
      actorKind,
      app: instanceControlPlaneApp,
      body,
      identity: route.identity,
      operation,
      packageResolver,
      source,
      storage,
      validateConstraints:
        operation.metadata.mode === "write"
          ? validateControlPlaneRecordConstraint(storage, packageResolver)
          : undefined,
      writes: noopWriteNotifier,
    });

    return jsonResponse(result.body, result.status, result.headers);
  } catch (error) {
    if (error instanceof ActiveSchemaRefreshBlockedError) {
      return jsonResponse({ error: error.message, blocker: error.blocker }, 409);
    }

    if (error instanceof BadRequestError) {
      return jsonResponse({ error: error.message }, 400);
    }

    return jsonResponse({ error: errorMessage(error) }, 400);
  }
}

export function readControlPlaneAppInstalls(
  storage: DurableObjectStorage,
  packageResolver?: AppPackageResolver,
): AppInstall[] {
  ensureStorageTables(storage);

  return instanceControlPlaneAppInstallsFromRecords(
    activeControlPlaneRecords(storage),
    packageResolver,
  );
}

async function handleInternalUpdateAppInstallPackageFacts(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceControlPlaneApiEnv,
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowedResponse("POST");
  }

  ensureControlPlaneStorage(storage);

  const packageResolver = activeAppPackageResolver(env);
  const parsed = parseInternalAppInstallPackageFactsUpdate(
    await readJson(request),
    packageResolver,
  );
  const install = findAppInstall(
    readControlPlaneAppInstalls(storage, packageResolver),
    parsed.installId,
  );

  if (!install) {
    throw new BadRequestError(`Install id "${parsed.installId}" is not installed.`);
  }

  if (install.packageAppKey !== parsed.packageAppKey) {
    throw new BadRequestError(
      `Install id "${parsed.installId}" uses package "${install.packageAppKey}", not "${parsed.packageAppKey}".`,
    );
  }

  noopWriteNotifier.apply(() =>
    patchStoredRecordOutcome(
      storage,
      {
        entity: "app-install",
        writeId: `updateAppInstallPackageFacts:${parsed.installId}:${parsed.packageRevision}:${parsed.sourceSchemaHash}`,
        kind: "patch",
        recordId: parsed.installId,
        values: {
          packageRevision: parsed.packageRevision,
          sourceSchemaHash: parsed.sourceSchemaHash,
        },
      },
      withoutControlPlaneLifecycleValues({
        ...getStoredRecord(storage, parsed.installId)?.values,
        packageRevision: parsed.packageRevision,
        sourceSchemaHash: parsed.sourceSchemaHash,
      }),
      validateControlPlaneRecordWrite(storage, instanceControlPlaneSourceSchema, {
        packageResolver,
      }),
    ),
  );

  return jsonResponse({
    install: findAppInstall(
      readControlPlaneAppInstalls(storage, packageResolver),
      parsed.installId,
    ),
    installs: readControlPlaneAppInstalls(storage, packageResolver),
  });
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
  env: InstanceControlPlaneApiEnv,
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
  const packageResolver = activeAppPackageResolver(env);

  return jsonResponse({
    route:
      resolveInstanceRuntimeRouteFromRecords({
        appInstalls: readControlPlaneAppInstalls(storage, packageResolver),
        records: activeControlPlaneRecords(storage),
        request: {
          host,
          pathname,
          search,
        },
        options: { includeHostless },
        packageResolver,
      }) ?? null,
  });
}

async function handleCreateAppInstallOperation(
  request: Request,
  identity: InstanceControlPlaneStorageIdentity,
  storage: DurableObjectStorage,
  env: InstanceControlPlaneApiEnv,
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowedResponse("POST");
  }

  const actorKind = controlPlaneActorKindFromRequest(request, new URL(request.url));
  assertBrowserControlPlaneOperationActor(actorKind, createAppInstallControlPlaneOperationKey);

  const authorization = await authorizeOperationalManagement(request, env, {
    error:
      "Owner session, instance-admin session, or admin authorization is required for this write endpoint.",
    hostSessionTarget: hostAuthSessionTargetForInstanceControlPlaneRequest(request),
  });

  if (!authorization.authorized) {
    return jsonResponse(
      { error: authorization.error },
      authorization.status,
      authorization.headers,
    );
  }

  ensureControlPlaneStorage(storage);

  const parsed = parseCreateAppInstallOperationRequest(await readJson(request));
  const receivedAt = nowIsoString();
  const envelope = createAppInstallOperationEnvelope({
    actorKind,
    identity,
    input: parsed.input,
    receivedAt,
    writeIdentity: parsed.operationId,
    idempotencyKey: parsed.idempotencyKey,
  });

  recordOperationInvocationAccepted(storage, envelope);

  try {
    const replay = createAppInstallOperationReplayResponse(storage, envelope);

    if (replay) {
      recordOperationInvocationOutcome(storage, {
        envelope,
        output: replay.output,
        status: replay.status,
      });

      return jsonResponse(replay);
    }

    const packageResolver = activeAppPackageResolver(env);
    const result = createAppInstall({
      existingInstalls: readControlPlaneAppInstalls(storage, packageResolver),
      installId: parsed.input.installId,
      label: parsed.input.label,
      now: receivedAt,
      packageAppKey: parsed.input.packageAppKey,
      packageResolver,
      registrationOperation: parsed.input.registrationOperation,
      registrationPolicy: parsed.input.registrationPolicy,
      validateInitialSource: ({ initialization }) => {
        const source = findActiveWorkerSchemaAppDefinition(initialization.sourceSchemaKey, env);

        if (!source) {
          return appInstallRegistryError(
            "source-validation-failed",
            "source",
            `Package app "${initialization.packageAppKey}" source is unavailable.`,
          );
        }

        return undefined;
      },
    });

    if (!result.ok) {
      recordOperationInvocationFailed(storage, envelope, new BadRequestError(result.error.message));

      return jsonResponse(
        {
          error: result.error.message,
          code: result.error.code,
          ...(result.error.field === undefined ? {} : { field: result.error.field }),
          installs: result.installs,
        },
        result.error.code === "duplicate-install-id" ? 409 : 400,
      );
    }

    const records = instanceControlPlaneRecordsForAppInstall({
      install: result.install,
      now: receivedAt,
    });
    preflightAppInstallRecordSet(storage, records, receivedAt, packageResolver);

    const outcome = writeRecordSetForCommandOperationOutcome(
      storage,
      parsed.operationId,
      records.map((record) => ({
        kind: "create",
        entity: record.entity,
        id: record.id,
        values: record.values,
      })),
      validateControlPlaneRecordWrite(storage, instanceControlPlaneSourceSchema, {
        packageResolver,
      }),
      { allowStoredReplay: false, now: receivedAt },
    );
    const response = createAppInstallOperationResponse(
      envelope,
      outcome.response,
      outcome.kind === "replay" ? "replayed" : "committed",
    );

    recordOperationInvocationOutcome(storage, {
      envelope,
      output: response.output,
      status: response.status,
    });

    return jsonResponse(response);
  } catch (error) {
    recordOperationInvocationFailed(storage, envelope, error);
    throw error;
  }
}

function hostAuthSessionTargetForInstanceControlPlaneRequest(request: Request) {
  const target = hostAuthSessionTargetFromRequestHeaders(request.headers);

  if (
    !target ||
    target.appInstallId !== undefined ||
    target.targetProfile !== "instance" ||
    target.storageIdentity !== INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY
  ) {
    return undefined;
  }

  return target;
}

function isOperationalControlPlaneOperation(operation: AuthorityOperation): boolean {
  if (operation.metadata.mode === "read") {
    return true;
  }

  return (
    operation.kind === "entityOperation" &&
    operationalControlPlaneEntityNames.has(operation.entityName)
  );
}

function operationalControlPlaneAuthorizationError(operation: AuthorityOperation) {
  return operation.metadata.mode === "read"
    ? "Owner session, instance-admin session, or admin authorization is required for this read endpoint."
    : "Owner session, instance-admin session, or admin authorization is required for this write endpoint.";
}

function createAppInstallOperationEnvelope(input: {
  actorKind: SchemaOperationActorKind;
  identity: InstanceControlPlaneStorageIdentity;
  input: CreateAppInstallRequest;
  idempotencyKey: string;
  receivedAt: string;
  writeIdentity: string;
}): OperationInvocationEnvelope {
  return {
    invocationId: input.writeIdentity,
    appStorageIdentity: input.identity,
    actor: { kind: input.actorKind },
    source: {
      protocol: controlPlaneOperationSourceProtocol(input.actorKind),
      route: CREATE_APP_INSTALL_CONTROL_PLANE_OPERATION_PATH,
    },
    input: {
      type: "command",
      input: input.input,
    },
    idempotency: {
      required: true,
      key: input.idempotencyKey,
      source: "caller",
      writeIdentity: input.writeIdentity,
    },
    operation: {
      entityName: "app-install",
      operationName: createAppInstallControlPlaneOperation,
      canonicalKey: createAppInstallControlPlaneOperationKey,
      kind: createAppInstallControlPlaneOperationSchema.kind,
      scope: createAppInstallControlPlaneOperationSchema.scope,
      output: createAppInstallControlPlaneOperationSchema.output,
      policy: createAppInstallControlPlaneOperationSchema.policy,
    },
    receivedAt: input.receivedAt,
    schemaOperation: createAppInstallControlPlaneOperationSchema,
  };
}

function createAppInstallOperationResponse(
  envelope: OperationInvocationEnvelope,
  output: OperationCommandOutput,
  status: OperationInvocationResponse["status"],
): OperationInvocationResponse {
  return {
    invocation: envelope,
    output,
    status,
  };
}

function createAppInstallOperationReplayResponse(
  storage: DurableObjectStorage,
  envelope: OperationInvocationEnvelope,
): OperationInvocationResponse | undefined {
  const replay = getOperationInvocationById(storage, envelope.invocationId);

  if (!replay?.output) {
    return undefined;
  }

  if (replay.output.type !== "command") {
    throw new Error(
      `Stored operation "${envelope.operation.canonicalKey}" output is not command output.`,
    );
  }

  return createAppInstallOperationResponse(envelope, replay.output, "replayed");
}

function createAppInstallOperationWriteIdentity(idempotencyKey: string) {
  return `operation:${createAppInstallControlPlaneOperationKey}:${idempotencyKey}`;
}

function controlPlaneOperationSourceProtocol(
  actorKind: SchemaOperationActorKind,
): OperationInvocationEnvelope["source"]["protocol"] {
  if (actorKind === "cliDeployer") {
    return "cli";
  }

  if (actorKind === "runner") {
    return "runner";
  }

  return "protocol";
}

function preflightAppInstallRecordSet(
  storage: DurableObjectStorage,
  records: [
    InstanceControlPlaneRecord<"app-install", InstanceControlPlaneAppInstallValues>,
    ...InstanceControlPlaneRecord<"route", InstanceControlPlaneRouteValues>[],
  ],
  createdAt: string,
  packageResolver?: AppPackageResolver,
) {
  const pendingRecords: StoredRecord[] = records.map((record) => ({
    createdAt,
    entity: record.entity,
    id: record.id,
    updatedAt: createdAt,
    values: record.values,
  }));
  const validate = validateControlPlaneRecordWrite(storage, instanceControlPlaneSourceSchema, {
    additionalRecords: pendingRecords,
    packageResolver,
  });

  for (const record of pendingRecords) {
    validate(record.entity, record.values, { ignoreRecordId: record.id });
  }
}

function validateControlPlaneRecordWrite(
  storage: DurableObjectStorage,
  schema: typeof instanceControlPlaneSourceSchema,
  options: {
    additionalRecords?: StoredRecord[];
    packageResolver?: AppPackageResolver;
  } = {},
) {
  return (
    entityName: string,
    values: RecordValues,
    recordOptions?: {
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
        existingRecordId: recordOptions?.ignoreRecordId,
        packageResolver: options.packageResolver,
      },
    );

    validateControlPlanePackageBoundary(
      storage,
      entityName,
      validated,
      options,
      recordOptions?.ignoreRecordId,
    );
    assertUniqueConstraints(storage, schema, entityName, validated, recordOptions);
  };
}

function validateControlPlaneRecordConstraint(
  storage: DurableObjectStorage,
  packageResolver?: AppPackageResolver,
): RecordConstraintValidator {
  return (entityName, values, recordOptions) => {
    validateControlPlanePackageBoundary(
      storage,
      entityName,
      values,
      {
        additionalRecords:
          recordOptions?.additionalRecords === undefined
            ? undefined
            : [...recordOptions.additionalRecords],
        packageResolver,
      },
      recordOptions?.ignoreRecordId,
    );
  };
}

function validateControlPlanePackageBoundary(
  storage: DurableObjectStorage,
  entityName: string,
  values: RecordValues,
  options: {
    additionalRecords?: StoredRecord[];
    packageResolver?: AppPackageResolver;
  },
  existingRecordId?: string,
) {
  if (entityName === "app-install") {
    const packageAppKey = parseRequiredString("packageAppKey", values.packageAppKey);
    const registrationPolicy = parseRequiredString("registrationPolicy", values.registrationPolicy);

    if (!isAppInstallRegistrationPolicy(registrationPolicy)) {
      throw new BadRequestError(
        'App install registration policy must be "closed", "email-verified", or "custom-operation".',
      );
    }

    validateAppInstallRegistrationOperationBoundary(values, registrationPolicy);

    if (!findResolvedAppPackage(packageAppKey, options.packageResolver)) {
      throw new BadRequestError(`App install package "${packageAppKey}" is unsupported.`);
    }

    return;
  }

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
    return;
  }

  if (entityName !== "route" || values.kind !== "mount" || values.surface !== "public-site") {
    return;
  }

  const installId = stringRecordValue(values.appInstall);

  if (installId === undefined) {
    return;
  }

  const appInstallRecord = findControlPlaneRecord(
    storage,
    "app-install",
    installId,
    options.additionalRecords,
  );
  const packageAppKey = stringRecordValue(appInstallRecord?.values.packageAppKey);
  const packageApp = packageAppKey
    ? findResolvedAppPackage(packageAppKey, options.packageResolver)
    : undefined;

  if (!packageApp) {
    throw new BadRequestError(`Route app install "${installId}" uses unsupported package.`);
  }

  if (packageApp.publicRouteBase === undefined) {
    throw new BadRequestError(
      `Package app "${packageApp.packageAppKey}" does not support public Site routes.`,
    );
  }
}

function validateAppInstallRegistrationOperationBoundary(
  values: RecordValues,
  registrationPolicy: string,
) {
  const registrationOperation = values.registrationOperation;

  if (registrationPolicy === "custom-operation") {
    if (registrationOperation === undefined) {
      throw new BadRequestError(
        'App install registration operation is required when registration policy is "custom-operation".',
      );
    }

    try {
      parseAppInstallRegistrationOperation(
        registrationOperation,
        "App install registration operation",
      );
    } catch (error) {
      throw new BadRequestError(errorMessage(error));
    }

    return;
  }

  if (registrationOperation !== undefined) {
    throw new BadRequestError(
      'App install registration operation must be omitted unless registration policy is "custom-operation".',
    );
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

function parseCreateAppInstallOperationRequest(
  value: unknown,
): ParsedCreateAppInstallOperationRequest {
  if (!isRecord(value)) {
    throw new BadRequestError("Control-plane operation request must be an object.");
  }

  const inputValue = isRecord(value.input) ? value.input : value;
  const input = parseCreateAppInstallRequest(inputValue);
  const idempotencyKey = parseOptionalOperationIdentity(value.idempotencyKey);

  if (idempotencyKey === undefined) {
    throw new BadRequestError(
      `Operation "${createAppInstallControlPlaneOperationKey}" requires an idempotency key.`,
    );
  }

  return {
    idempotencyKey,
    input,
    operationId: createAppInstallOperationWriteIdentity(idempotencyKey),
  };
}

function parseOptionalOperationIdentity(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequestError(
      "Control-plane operation idempotency key must be a non-empty string.",
    );
  }

  return value.trim();
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
  const domainRouteCandidates =
    input.mappings?.map((mapping) => domainMappingRouteCandidate(storage, mapping)) ?? [];
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
    targetKind: input.target.kind,
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

function domainMappingRouteCandidate(
  storage: DurableObjectStorage,
  mapping: InstanceDomainMapping,
): RouteIntentSyncCandidate {
  return {
    id: domainMappingRouteRecordId(mapping),
    source: `domain mapping route sync "${mapping.profile}:${mapping.host}"`,
    values: domainMappingRouteRecordValues(storage, mapping),
  };
}

function domainMappingRouteRecordValues(
  storage: DurableObjectStorage,
  mapping: InstanceDomainMapping,
): RecordValues {
  const targetInstallId = mapping.targetInstallId ?? mapping.installId;
  const appInstall =
    targetInstallId && activeControlPlaneRecordExists(storage, "app-install", targetInstallId)
      ? targetInstallId
      : undefined;
  const surface = domainMappingSurfaceForProfile(mapping.profile);

  return {
    enabled: mapping.enabled,
    matchHost: mapping.host,
    matchPath: "/",
    matchPrefix: "/",
    kind: "mount",
    targetProfile: domainMappingTargetProfile(mapping.profile),
    ...(appInstall === undefined ? {} : { appInstall }),
    ...(surface === undefined ? {} : { surface }),
    access: instanceControlPlaneDefaultRouteAccess({
      kind: "mount",
      surface,
      targetProfile: domainMappingTargetProfile(mapping.profile),
    }),
  };
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
  },
) {
  const recordsToRemove = activeControlPlaneRecords(storage).filter(
    (record) =>
      record.entity === "route" &&
      record.id.startsWith(input.idPrefix) &&
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
  const kind = parseRequiredString("target.kind", value.kind);

  if (kind !== "instance") {
    throw new BadRequestError(`Deployment target kind "${kind}" is unsupported.`);
  }

  return {
    targetId,
    kind,
    ...(typeof value.label === "string" && value.label.trim() !== "" ? { label: value.label } : {}),
  };
}

function parseInternalAppInstallPackageFactsUpdate(
  value: unknown,
  packageResolver?: AppPackageResolver,
): {
  installId: AppInstallId;
  packageAppKey: PackageAppKey;
  packageRevision: PackageAppRevision;
  sourceSchemaHash: SourceSchemaHash;
} {
  if (!isRecord(value)) {
    throw new BadRequestError("App install package facts update must be an object.");
  }

  const packageAppKey = parseRequiredString("packageAppKey", value.packageAppKey);
  const packageApp = findResolvedAppPackage(packageAppKey, packageResolver);

  if (!packageApp) {
    throw new BadRequestError(`App install package "${packageAppKey}" is unsupported.`);
  }

  return {
    installId: parseRequiredString("installId", value.installId),
    packageAppKey: packageApp.packageAppKey,
    packageRevision: parsePackageRevision(
      "packageRevision",
      value.packageRevision,
      packageApp.packageRevision,
    ),
    sourceSchemaHash: parseSourceSchemaHash(
      "sourceSchemaHash",
      value.sourceSchemaHash,
      packageApp.sourceSchemaHash,
    ),
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

  const targetInstallId =
    optionalStringRecordValue(value.targetInstallId) ?? optionalStringRecordValue(value.installId);
  const profile = parseDomainMappingProfile(value.profile);

  return {
    host: parseRequiredString("mapping.host", value.host),
    profile,
    ...(profile === "publicSite" ? { surface: "site" as const } : {}),
    ...(targetInstallId === undefined ? {} : { installId: targetInstallId, targetInstallId }),
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

function parsePackageRevision(
  field: string,
  value: unknown,
  fallback: PackageAppRevision,
): PackageAppRevision {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new BadRequestError(`Field "${field}" must be a positive integer.`);
  }

  return value;
}

function parseSourceSchemaHash(
  field: string,
  value: unknown,
  fallback: SourceSchemaHash,
): SourceSchemaHash {
  if (value === undefined) {
    return fallback;
  }

  if (!isSourceSchemaHash(value)) {
    throw new BadRequestError(`Field "${field}" must be a sha256 source schema hash.`);
  }

  return value;
}

function optionalStringRecordValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
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

function withoutControlPlaneLifecycleValues(values: RecordValues): RecordValues {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([fieldName]) => fieldName !== "createdAt" && fieldName !== "updatedAt",
    ),
  ) as RecordValues;
}

function parseRouteString(field: string, value: unknown): `/${string}` {
  const route = parseRequiredString(field, value);

  if (!route.startsWith("/")) {
    throw new BadRequestError(`Field "${field}" must be a route path.`);
  }

  return route as `/${string}`;
}

function parseDomainMappingProfile(value: unknown): InstanceDomainMappingProfile {
  if (value === "app" || value === "instance" || value === "publicSite") {
    return value;
  }

  throw new BadRequestError('Field "mapping.profile" must be "app", "instance", or "publicSite".');
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
    case "app":
      return "admin";
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
    case "app":
      return "app";
    case "publicSite":
      return "public-site";
    case "instance":
      return "instance";
  }
}

function activeControlPlaneRecordExists(
  storage: DurableObjectStorage,
  entity: string,
  id: string,
): boolean {
  const record = getStoredRecord(storage, id);

  return record?.entity === entity && !record.deletedAt;
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

function assertBrowserControlPlaneOperationActor(
  actorKind: SchemaOperationActorKind,
  operationKey: string,
) {
  if (actorKind === "owner" || actorKind === "admin") {
    return;
  }

  throw new BadRequestError(`Operation "${operationKey}" is not exposed to actor "${actorKind}".`);
}

const noopWriteNotifier: AuthorityWriteNotifier = {
  apply(write) {
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
