import type { RecordValues, StorageSnapshot } from "@dpeek/formless-storage";
import {
  FORMLESS_CLIENT_PACKAGE_REVISION_HEADER,
  FORMLESS_CLIENT_RUNTIME_PROTOCOL_HEADER,
  FORMLESS_CLIENT_SCHEMA_UPDATED_AT_HEADER,
  FORMLESS_CLIENT_SOURCE_SCHEMA_HASH_HEADER,
  type BrowserReplicaUpgradeFacts,
  type BootstrapResponse,
  type SchemaResponse,
  type SchemaUpdateResponse,
  type SyncResponse,
} from "../shared/protocol.ts";
import type {
  SitePageTreeResponse,
  SitePublicOperationTargetResolver,
} from "@dpeek/formless-site-app";
import type {
  OperationInvocationActor,
  OperationInvocationEnvelope,
  OperationInvocationResponse,
} from "../shared/operation-invocation.ts";
import {
  installedAppStorageIdentity,
  type AuthorityStorageIdentity,
} from "../shared/app-storage-identity.ts";
import {
  programPublicSiteRuntimeTarget,
  type PublicSiteRuntimeTarget,
} from "../shared/public-site-runtime-target.ts";
import type { PackageAppKey } from "@dpeek/formless-installed-apps";
import {
  findResolvedAppPackage,
  rootKnownPackageFactsResolver,
  type AppPackageResolver,
} from "../shared/app-packages.ts";
import { FORMLESS_RUNTIME_PROTOCOL_VERSION } from "../shared/deploy-metadata.ts";
import type {
  AppSchema,
  EntityOperationSchema,
  SchemaOperationActorKind,
} from "@dpeek/formless-schema";
import type { IdentityReferenceTargetResolver } from "./identity-reference-targets.ts";
import {
  isSourceSchemaHash,
  type PackageAppRevision,
  type SourceSchemaHash,
} from "../shared/upgrade-migrations.ts";
import {
  assertOperationInvocationAuthorized,
  executeReadOperationInvocation,
  executeWriteOperationInvocation,
  parseEntityOperationRoute,
} from "./entity-operations.ts";
import { buildProtocolOperationInvocationEnvelope } from "./operation-invocation-envelopes.ts";
import {
  validateSchemaUpdateRequest,
  validateSourceSchemaReset,
  validateStorageSnapshotRestore,
} from "./authority-validation.ts";
import { BadRequestError, ReloadRequiredError } from "./errors.ts";
import type { WorkerAppDefinition } from "./runtime-app-packages.ts";
import { PUBLIC_SITE_TREE_CACHE_CONTROL } from "@dpeek/formless-site-app/worker";
import {
  exportStorageSnapshot,
  getBootstrapRecords,
  getChangesAfter,
  getCurrentCursor,
  initializeStorageFromSource,
  mapWriteOutcome,
  applyPackageAppMigrationsOutcome,
  resetStorageSchemaToSourceOutcome,
  restoreStorageSnapshotOutcome,
  readCurrentStoredSchema,
  readPackageAppMigrationState,
  recordOperationInvocationAccepted,
  recordOperationInvocationFailed,
  recordOperationInvocationRejected,
  type RecordConstraintValidator,
  type ApplyPackageAppMigrationsResponse,
  type PackageAppSchemaProvenance,
  type StoredSchema,
  type StorageSource,
  type WriteOutcome,
  writeActiveSchemaOutcome,
} from "./storage.ts";
import {
  packageAppMigrationRegistry,
  selectPackageAppMigrationChain,
} from "./package-app-migrations.ts";
import { publicSiteWorkerAdapterForPackageAppKey } from "./public-site-worker-runtime.ts";

export type AuthorityOperationMode = "read" | "write";

export type AuthorityOperationKind =
  | "bootstrap"
  | "readSchema"
  | "exportSnapshot"
  | "siteTree"
  | "sync"
  | "writeSchema"
  | "restoreSnapshot"
  | "entityOperation"
  | "resetSchema"
  | "applyPackageMigrations";

export type AuthorityOperationMetadata = {
  kind: AuthorityOperationKind;
  method: string;
  mode: AuthorityOperationMode;
  path: string;
};

type AuthorityOperationMetadataFor<
  Kind extends AuthorityOperationKind,
  Mode extends AuthorityOperationMode,
> = AuthorityOperationMetadata & {
  kind: Kind;
  mode: Mode;
};

type ReadOperation<Kind extends AuthorityOperationKind> = {
  kind: Kind;
  metadata: AuthorityOperationMetadataFor<Kind, "read">;
};

type WriteOperation<Kind extends AuthorityOperationKind> = {
  kind: Kind;
  metadata: AuthorityOperationMetadataFor<Kind, "write">;
};

export type ReadAuthorityOperation =
  | ReadOperation<"bootstrap">
  | ReadOperation<"readSchema">
  | ReadOperation<"exportSnapshot">
  | ReadOperation<"siteTree">
  | (ReadOperation<"entityOperation"> & EntityOperationRoute)
  | (ReadOperation<"sync"> & {
      after: number;
      clientSchemaUpdatedAt: string | null;
    });

export type WriteAuthorityOperation =
  | WriteOperation<"writeSchema">
  | WriteOperation<"restoreSnapshot">
  | (WriteOperation<"entityOperation"> & EntityOperationRoute)
  | WriteOperation<"resetSchema">
  | WriteOperation<"applyPackageMigrations">;

export type AuthorityOperation = ReadAuthorityOperation | WriteAuthorityOperation;

export type AuthorityWriteNotifier = {
  apply<T>(write: () => WriteOutcome<T>): WriteOutcome<T>;
};

type AuthorityErrorResponse = {
  error: string;
};

export type AuthorityOperationResponseBody =
  | ApplyPackageAppMigrationsResponse
  | AuthorityErrorResponse
  | BootstrapResponse
  | OperationInvocationResponse
  | SchemaResponse
  | SchemaUpdateResponse
  | SitePageTreeResponse
  | StorageSnapshot
  | SyncResponse;

export type AuthorityOperationResult = {
  body: AuthorityOperationResponseBody;
  headers?: HeadersInit;
  status?: number;
};

type AuthorityOperationSelectionInput = {
  method: string;
  path: string;
  searchParams: URLSearchParams;
};

type EntityOperationRoute = {
  entityName: string;
  operationName: string;
  recordId?: string;
};

export type OperationInvocationActorCandidates = {
  admin?: OperationInvocationActor;
  authenticated?: OperationInvocationActor;
  owner?: OperationInvocationActor;
};

type AuthorityOperationExecutionInput = {
  actor?: OperationInvocationActor;
  actorCandidates?: OperationInvocationActorCandidates;
  actorKind?: SchemaOperationActorKind;
  app: WorkerAppDefinition;
  body?: unknown;
  createRecordId?: (entity: string, values: RecordValues) => string | undefined;
  identity: AuthorityStorageIdentity;
  identityReferenceResolver?: IdentityReferenceTargetResolver;
  operation: AuthorityOperation;
  packageResolver?: AppPackageResolver;
  programOperationAuthorized?: boolean;
  requestHeaders?: Headers;
  source: StorageSource;
  sourceSchemas?: Partial<Record<string, AppSchema>>;
  storage: DurableObjectStorage;
  turnstileSiteKey?: string;
  validateConstraints?: RecordConstraintValidator;
  writes: AuthorityWriteNotifier;
};

function publicOperationTargetResolver(input: {
  packageResolver?: AppPackageResolver;
  sourceSchemas?: Partial<Record<string, AppSchema>>;
}): SitePublicOperationTargetResolver {
  return (request) => {
    const sourceSchemas = input.sourceSchemas ?? {};
    const identity = installedAppStorageIdentity(
      {
        packageAppKey: request.packageAppKey,
        installId: request.installId,
      },
      input.packageResolver,
    );
    const schema = identity ? sourceSchemas[identity.sourceSchemaKey] : undefined;

    return identity && schema
      ? {
          schema,
          route: {
            kind: "appInstall",
            packageAppKey: identity.packageAppKey,
            installId: identity.installId,
            apiRoutePrefix: identity.apiRoutePrefix,
          },
        }
      : undefined;
  };
}

export function selectAuthorityOperation(
  input: AuthorityOperationSelectionInput,
): AuthorityOperation | undefined {
  const metadata = <Kind extends AuthorityOperationKind, Mode extends AuthorityOperationMode>(
    kind: Kind,
    mode: Mode,
  ) => operationMetadata(kind, input.method, mode, input.path);

  if (input.method === "GET" && input.path === "/bootstrap") {
    return { kind: "bootstrap", metadata: metadata("bootstrap", "read") };
  }

  if (input.method === "GET" && input.path === "/schema") {
    return { kind: "readSchema", metadata: metadata("readSchema", "read") };
  }

  if (input.method === "GET" && input.path === "/snapshot") {
    return { kind: "exportSnapshot", metadata: metadata("exportSnapshot", "read") };
  }

  if (input.method === "GET" && isSiteTreePath(input.path)) {
    return { kind: "siteTree", metadata: metadata("siteTree", "read") };
  }

  if (input.method === "GET" && input.path === "/sync") {
    return {
      after: parseCursor(input.searchParams.get("after")),
      clientSchemaUpdatedAt: input.searchParams.get("schemaUpdatedAt"),
      kind: "sync",
      metadata: metadata("sync", "read"),
    };
  }

  if (input.method === "POST" && input.path === "/schema") {
    return { kind: "writeSchema", metadata: metadata("writeSchema", "write") };
  }

  if (input.method === "POST" && input.path === "/snapshot/restore") {
    return { kind: "restoreSnapshot", metadata: metadata("restoreSnapshot", "write") };
  }

  const entityOperationRoute = parseEntityOperationRoute(input);
  if (entityOperationRoute) {
    if (input.method === "GET") {
      return {
        kind: "entityOperation",
        metadata: metadata("entityOperation", "read"),
        ...entityOperationRoute,
      };
    }

    return {
      kind: "entityOperation",
      metadata: metadata("entityOperation", "write"),
      ...entityOperationRoute,
    };
  }

  if (input.method === "POST" && input.path === "/reset/schema") {
    return { kind: "resetSchema", metadata: metadata("resetSchema", "write") };
  }

  if (input.method === "POST" && input.path === "/package-migrations/apply") {
    return {
      kind: "applyPackageMigrations",
      metadata: metadata("applyPackageMigrations", "write"),
    };
  }

  return undefined;
}

export async function executeAuthorityOperation(
  input: AuthorityOperationExecutionInput,
): Promise<AuthorityOperationResult> {
  const operation = input.operation;

  switch (operation.kind) {
    case "bootstrap": {
      const storedSchema = initializeStorageFromSource(input.storage, input.source);

      return {
        body: bootstrapResponse(input.storage, storedSchema),
        headers: browserReplicaUpgradeHeaders(input.storage, input.identity, input.packageResolver),
      };
    }

    case "readSchema": {
      const storedSchema = initializeStorageFromSource(input.storage, input.source);

      return {
        body: schemaResponse(storedSchema),
      };
    }

    case "exportSnapshot": {
      initializeStorageFromSource(input.storage, input.source);

      return {
        body: exportStorageSnapshot(input.storage, input.identity.authorityName, input.app.key),
      };
    }

    case "siteTree": {
      const slug = parseSiteTreeSlug(operation.metadata.path);
      const { schema } = initializeStorageFromSource(input.storage, input.source);
      const target = publicSiteRuntimeTargetForAuthority(input.identity);
      const adapter = publicSiteWorkerAdapterForPackageAppKey(
        target?.packageAppKey ??
          (input.identity.kind === "program" ? "site" : input.identity.packageAppKey),
        input.identity.kind === "program"
          ? rootKnownPackageFactsResolver(input.packageResolver)
          : input.packageResolver,
      );
      const projection = adapter.buildPublicTree({
        records: getBootstrapRecords(input.storage),
        schema,
        slug,
        publicOperationTargetResolver: publicOperationTargetResolver({
          packageResolver: input.packageResolver,
          sourceSchemas: input.sourceSchemas,
        }),
        target: target?.storageIdentity ?? input.identity,
        turnstileSiteKey: input.turnstileSiteKey,
      });

      if (!projection.tree) {
        return {
          body: { error: "Site page not found." },
          headers: { "Cache-Control": PUBLIC_SITE_TREE_CACHE_CONTROL },
          status: 404,
        };
      }

      const response: SitePageTreeResponse = projection.tree;

      return {
        body: response,
        headers: { "Cache-Control": PUBLIC_SITE_TREE_CACHE_CONTROL },
      };
    }

    case "sync": {
      const storedSchema = initializeStorageFromSource(input.storage, input.source);
      const changes = getChangesAfter(input.storage, operation.after);
      const schemaFields =
        operation.clientSchemaUpdatedAt === storedSchema.updatedAt
          ? {}
          : syncSchemaFields(storedSchema);

      return {
        body: {
          changes,
          cursor: getCurrentCursor(input.storage),
          ...schemaFields,
        },
        headers: browserReplicaUpgradeHeaders(input.storage, input.identity, input.packageResolver),
      };
    }

    case "writeSchema": {
      const currentSchema = initializeStorageFromSource(input.storage, input.source).schema;
      const records = getBootstrapRecords(input.storage);
      const nextSchema = validateSchemaUpdateRequest(input.body, currentSchema, records);

      return writeOperationResult(
        input.writes.apply(() => writeActiveSchemaOutcome(input.storage, nextSchema)),
      );
    }

    case "restoreSnapshot": {
      const snapshot = await validateStorageSnapshotRestore(
        input.body,
        {
          schemaKey: input.app.key,
          storageIdentity: input.identity.authorityName,
        },
        { identityReferenceResolver: input.identityReferenceResolver },
      );

      return writeOperationResult(
        input.writes.apply(() =>
          restoreStorageSnapshotOutcome(input.storage, snapshot, input.source),
        ),
      );
    }
    case "entityOperation": {
      const { schema } = initializeStorageFromSource(input.storage, input.source);
      const operationSchema = schema.entities
        .find((definition) => definition.key === operation.entityName)
        ?.operations?.find((definition) => definition.key === operation.operationName);

      if (input.identity.kind === "program") {
        if (operationSchema?.access === undefined) {
          throw new BadRequestError(
            `Program operation "${operation.entityName}.${operation.operationName}" is missing access.`,
          );
        }
        if (input.programOperationAuthorized !== true) {
          throw new BadRequestError(
            `Program operation "${operation.entityName}.${operation.operationName}" is not authorized.`,
          );
        }
      }

      const envelope = buildProtocolOperationInvocationEnvelope({
        actor:
          input.actor ??
          operationInvocationActorFromCandidates(input.actorCandidates, operationSchema),
        actorKind: input.actorKind,
        body: input.body,
        identity: input.identity,
        method: operation.metadata.method,
        path: operation.metadata.path,
        route: {
          entityName: operation.entityName,
          operationName: operation.operationName,
          ...(operation.recordId === undefined ? {} : { recordId: operation.recordId }),
        },
        schema,
      });

      if (input.identity.kind !== "program") {
        assertOperationInvocationAllowed(input.storage, envelope);
      }

      if (envelope.operation.kind === "list" || envelope.operation.kind === "get") {
        return {
          body: executeReadOperationInvocation({
            envelope,
            schema,
            storage: input.storage,
          }),
        };
      }

      assertBrowserReplicaWriteCompatibleForOperation(input, envelope);

      return {
        body: await executeWriteOperationInvocation({
          createRecordId: input.createRecordId,
          envelope,
          identityReferenceResolver: input.identityReferenceResolver,
          packageResolver: input.packageResolver,
          schema,
          storage: input.storage,
          validateConstraints: input.validateConstraints,
          writes: input.writes,
        }),
      };
    }

    case "resetSchema": {
      return writeOperationResult(
        input.writes.apply(() =>
          mapWriteOutcome(
            resetStorageSchemaToSourceOutcome(
              input.storage,
              input.source,
              validateSourceSchemaReset,
            ),
            (storedSchema) => bootstrapResponse(input.storage, storedSchema),
          ),
        ),
      );
    }

    case "applyPackageMigrations": {
      initializeStorageFromSource(input.storage, input.source, { refreshActiveSchema: false });

      const packageFacts = parsePackageAppMigrationApplyRequest(
        input.body,
        input.app.key,
        input.packageResolver,
      );
      const migrations = selectPackageAppMigrations({
        currentPackageRevision: packageFacts.currentPackageRevision,
        packageAppKey: packageFacts.packageAppKey,
        safety: packageFacts.safety,
        targetPackageRevision: packageFacts.targetPackageRevision,
      });

      return writeOperationResult(
        input.writes.apply(() =>
          applyPackageAppMigrationsOutcome(input.storage, {
            currentPackageRevision: packageFacts.currentPackageRevision,
            currentSourceSchemaHash: packageFacts.currentSourceSchemaHash,
            migrations,
            packageAppKey: packageFacts.packageAppKey,
            targetPackageRevision: packageFacts.targetPackageRevision,
            targetSourceSchemaHash: packageFacts.targetSourceSchemaHash,
          }),
        ),
      );
    }
  }
}

function publicSiteRuntimeTargetForAuthority(
  identity: AuthorityStorageIdentity,
): PublicSiteRuntimeTarget | undefined {
  if (identity.kind === "program") {
    return programPublicSiteRuntimeTarget();
  }

  return identity.kind === "appInstall"
    ? { packageAppKey: identity.packageAppKey, storageIdentity: identity }
    : undefined;
}

function operationInvocationActorFromCandidates(
  candidates: OperationInvocationActorCandidates | undefined,
  operation: EntityOperationSchema | undefined,
): OperationInvocationActor | undefined {
  if (!candidates || !operation) {
    return undefined;
  }

  const actors = operation.policy?.actors;

  if (actors?.includes("authenticated") && candidates.authenticated) {
    return candidates.authenticated;
  }

  if (actors?.includes("admin") && candidates.admin) {
    return candidates.admin;
  }

  if ((actors === undefined || actors.includes("owner")) && candidates.owner) {
    return candidates.owner;
  }

  if (actors === undefined && candidates.admin) {
    return candidates.admin;
  }

  if (actors === undefined && candidates.authenticated) {
    return candidates.authenticated;
  }

  return candidates.owner ?? candidates.admin ?? candidates.authenticated;
}

function writeOperationResult<T extends AuthorityOperationResponseBody>(
  outcome: WriteOutcome<T>,
): AuthorityOperationResult {
  return { body: outcome.response };
}

function assertOperationInvocationAllowed(
  storage: DurableObjectStorage,
  envelope: OperationInvocationEnvelope,
) {
  try {
    assertOperationInvocationAuthorized(envelope);
  } catch (error) {
    recordOperationInvocationRejected(storage, envelope, error);
    throw error;
  }
}

function assertBrowserReplicaWriteCompatibleForOperation(
  input: AuthorityOperationExecutionInput,
  envelope: OperationInvocationEnvelope,
) {
  try {
    assertBrowserReplicaWriteCompatible(input);
  } catch (error) {
    recordOperationInvocationAccepted(input.storage, envelope);
    recordOperationInvocationFailed(input.storage, envelope, error);
    throw error;
  }
}

function assertBrowserReplicaWriteCompatible(input: AuthorityOperationExecutionInput) {
  const clientFacts = parseBrowserReplicaWriteFacts(input.requestHeaders);

  if (!clientFacts.hasAnyFact) {
    return;
  }

  const upgrade = browserReplicaUpgradeFacts(input.storage, input.identity, input.packageResolver);

  if (
    clientFacts.runtimeProtocolVersion !== undefined &&
    clientFacts.runtimeProtocolVersion !== upgrade.runtimeProtocolVersion
  ) {
    throw reloadRequired("Browser runtime protocol changed. Reload required.", upgrade);
  }

  if (
    clientFacts.schemaUpdatedAt !== undefined &&
    clientFacts.schemaUpdatedAt !== upgrade.schemaUpdatedAt
  ) {
    throw reloadRequired("App schema changed. Reload required.", upgrade);
  }

  if (
    clientFacts.packageRevision !== undefined &&
    clientFacts.packageRevision !== upgrade.packageApp?.packageRevision
  ) {
    throw reloadRequired("Package app revision changed. Reload required.", upgrade);
  }

  if (
    clientFacts.sourceSchemaHash !== undefined &&
    clientFacts.sourceSchemaHash !== upgrade.schemaProvenance?.sourceSchemaHash
  ) {
    throw reloadRequired("App source schema changed. Reload required.", upgrade);
  }
}

function reloadRequired(message: string, upgrade: BrowserReplicaUpgradeFacts) {
  return new ReloadRequiredError(message, upgrade);
}

function parseBrowserReplicaWriteFacts(headers: Headers | undefined) {
  const runtimeProtocolVersion = parseOptionalPositiveIntegerHeader(
    headers,
    FORMLESS_CLIENT_RUNTIME_PROTOCOL_HEADER,
    "runtime protocol version",
  );
  const packageRevision = parseOptionalPositiveIntegerHeader(
    headers,
    FORMLESS_CLIENT_PACKAGE_REVISION_HEADER,
    "package app revision",
  );
  const schemaUpdatedAt = parseOptionalStringHeader(
    headers,
    FORMLESS_CLIENT_SCHEMA_UPDATED_AT_HEADER,
    "schema updated timestamp",
  );
  const sourceSchemaHash = parseOptionalSourceSchemaHashHeader(headers);

  return {
    hasAnyFact:
      runtimeProtocolVersion !== undefined ||
      packageRevision !== undefined ||
      schemaUpdatedAt !== undefined ||
      sourceSchemaHash !== undefined,
    packageRevision,
    runtimeProtocolVersion,
    schemaUpdatedAt,
    sourceSchemaHash,
  };
}

function parseOptionalPositiveIntegerHeader(
  headers: Headers | undefined,
  name: string,
  label: string,
) {
  const value = headers?.get(name);

  if (value === null || value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new BadRequestError(`Browser replica ${label} header must be a positive integer.`);
  }

  return parsed;
}

function parseOptionalStringHeader(headers: Headers | undefined, name: string, label: string) {
  const value = headers?.get(name);

  if (value === null || value === undefined) {
    return undefined;
  }

  if (value.trim() === "") {
    throw new BadRequestError(`Browser replica ${label} header must be non-empty.`);
  }

  return value;
}

function parseOptionalSourceSchemaHashHeader(headers: Headers | undefined) {
  const value = headers?.get(FORMLESS_CLIENT_SOURCE_SCHEMA_HASH_HEADER);

  if (value === null || value === undefined) {
    return undefined;
  }

  if (!isSourceSchemaHash(value)) {
    throw new BadRequestError(
      "Browser replica source schema hash header must be a sha256 source schema hash.",
    );
  }

  return value;
}

function browserReplicaUpgradeHeaders(
  storage: DurableObjectStorage,
  identity: AuthorityStorageIdentity,
  packageResolver?: AppPackageResolver,
): HeadersInit {
  const facts = browserReplicaUpgradeFacts(storage, identity, packageResolver);
  const headers: Record<string, string> = {
    [FORMLESS_CLIENT_RUNTIME_PROTOCOL_HEADER]: String(facts.runtimeProtocolVersion),
  };

  if (facts.schemaUpdatedAt !== null) {
    headers[FORMLESS_CLIENT_SCHEMA_UPDATED_AT_HEADER] = facts.schemaUpdatedAt;
  }

  if (facts.packageApp) {
    headers[FORMLESS_CLIENT_PACKAGE_REVISION_HEADER] = String(facts.packageApp.packageRevision);
  }

  if (facts.schemaProvenance) {
    headers[FORMLESS_CLIENT_SOURCE_SCHEMA_HASH_HEADER] = facts.schemaProvenance.sourceSchemaHash;
  }

  return headers;
}

function browserReplicaUpgradeFacts(
  storage: DurableObjectStorage,
  identity: AuthorityStorageIdentity,
  packageResolver?: AppPackageResolver,
): BrowserReplicaUpgradeFacts {
  const storedSchema = readCurrentStoredSchema(storage);

  if (identity.kind === "program") {
    const schemaProvenance =
      storedSchema?.schemaProvenance?.kind === "program" ? storedSchema.schemaProvenance : null;

    return {
      runtimeProtocolVersion: FORMLESS_RUNTIME_PROTOCOL_VERSION,
      schemaUpdatedAt: storedSchema?.updatedAt ?? null,
      schemaProvenance,
      packageApp: null,
    };
  }

  const packageProvenance = packageSchemaProvenanceForBrowserReplica(
    storage,
    identity.packageAppKey,
    storedSchema,
    packageResolver,
  );

  return {
    runtimeProtocolVersion: FORMLESS_RUNTIME_PROTOCOL_VERSION,
    schemaUpdatedAt: storedSchema?.updatedAt ?? null,
    schemaProvenance: packageProvenance ?? null,
    packageApp: packageProvenance
      ? {
          packageAppKey: packageProvenance.packageAppKey,
          packageRevision: packageProvenance.packageRevision,
          sourceSchemaHash: packageProvenance.sourceSchemaHash,
        }
      : null,
  };
}

function packageSchemaProvenanceForBrowserReplica(
  storage: DurableObjectStorage,
  packageAppKey: PackageAppKey,
  storedSchema: ReturnType<typeof readCurrentStoredSchema>,
  packageResolver?: AppPackageResolver,
): PackageAppSchemaProvenance | undefined {
  if (
    storedSchema?.schemaProvenance?.kind === "package-app" &&
    storedSchema.schemaProvenance.packageAppKey === packageAppKey
  ) {
    return storedSchema.schemaProvenance;
  }

  const packageState = readPackageAppMigrationState(storage, packageAppKey);

  if (packageState) {
    return {
      kind: "package-app",
      packageAppKey: packageState.packageAppKey,
      packageRevision: packageState.packageRevision,
      sourceSchemaHash: packageState.sourceSchemaHash,
    };
  }

  const packageApp = findResolvedAppPackage(packageAppKey, packageResolver);

  return packageApp
    ? {
        kind: "package-app",
        packageAppKey: packageApp.packageAppKey,
        packageRevision: packageApp.packageRevision,
        sourceSchemaHash: packageApp.sourceSchemaHash,
      }
    : undefined;
}

function operationMetadata<
  Kind extends AuthorityOperationKind,
  Mode extends AuthorityOperationMode,
>(kind: Kind, method: string, mode: Mode, path: string): AuthorityOperationMetadataFor<Kind, Mode> {
  return {
    kind,
    method,
    mode,
    path,
  };
}

function bootstrapResponse(
  storage: DurableObjectStorage,
  storedSchema: StoredSchema,
): BootstrapResponse {
  return {
    schema: storedSchema.schema,
    ...(storedSchema.schemaProvenance === undefined
      ? {}
      : { schemaProvenance: storedSchema.schemaProvenance }),
    schemaUpdatedAt: storedSchema.updatedAt,
    records: getBootstrapRecords(storage),
    cursor: getCurrentCursor(storage),
  };
}

function schemaResponse(storedSchema: StoredSchema): SchemaResponse {
  return {
    schema: storedSchema.schema,
    ...(storedSchema.schemaProvenance === undefined
      ? {}
      : { schemaProvenance: storedSchema.schemaProvenance }),
    updatedAt: storedSchema.updatedAt,
  };
}

function syncSchemaFields(
  storedSchema: StoredSchema,
): Pick<SyncResponse, "schema" | "schemaProvenance" | "schemaUpdatedAt"> {
  return {
    schema: storedSchema.schema,
    ...(storedSchema.schemaProvenance === undefined
      ? {}
      : { schemaProvenance: storedSchema.schemaProvenance }),
    schemaUpdatedAt: storedSchema.updatedAt,
  };
}

function parsePackageAppMigrationApplyRequest(
  value: unknown,
  packageAppKey: string,
  packageResolver?: AppPackageResolver,
) {
  const packageApp = findResolvedAppPackage(packageAppKey, packageResolver);

  if (!packageApp) {
    throw new BadRequestError(`Package app "${packageAppKey}" is not installable.`);
  }

  const body = isRecord(value) ? value : {};

  return {
    packageAppKey: packageApp.packageAppKey,
    currentPackageRevision: parseOptionalPackageRevision(
      body.currentPackageRevision,
      packageApp.packageRevision,
      "currentPackageRevision",
    ),
    currentSourceSchemaHash: parseOptionalSourceSchemaHash(
      body.currentSourceSchemaHash,
      packageApp.sourceSchemaHash,
      "currentSourceSchemaHash",
    ),
    targetPackageRevision: packageApp.packageRevision,
    targetSourceSchemaHash: packageApp.sourceSchemaHash,
    safety: parseOptionalPackageMigrationSafety(body.safety),
  };
}

function selectPackageAppMigrations(input: {
  currentPackageRevision: PackageAppRevision;
  packageAppKey: PackageAppKey;
  safety?: "auto-safe";
  targetPackageRevision: PackageAppRevision;
}) {
  try {
    const migrations = selectPackageAppMigrationChain(packageAppMigrationRegistry, {
      fromPackageRevision: input.currentPackageRevision,
      packageAppKey: input.packageAppKey,
      toPackageRevision: input.targetPackageRevision,
    });

    if (input.safety === "auto-safe") {
      const unsafe = migrations.find((migration) => migration.safety !== "auto-safe");

      if (unsafe) {
        throw new Error(
          `Package app migration "${unsafe.id}" requires safety class "${unsafe.safety}".`,
        );
      }
    }

    return migrations;
  } catch (error) {
    throw new BadRequestError(
      error instanceof Error ? error.message : "Package app migration chain is invalid.",
    );
  }
}

function parseOptionalPackageRevision(
  value: unknown,
  fallback: PackageAppRevision,
  fieldName: string,
): PackageAppRevision {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new BadRequestError(`Package migration ${fieldName} must be a positive integer.`);
  }

  return value;
}

function parseOptionalSourceSchemaHash(
  value: unknown,
  fallback: SourceSchemaHash,
  fieldName: string,
): SourceSchemaHash {
  if (value === undefined) {
    return fallback;
  }

  if (!isSourceSchemaHash(value)) {
    throw new BadRequestError(
      `Package migration ${fieldName} must be a sha256 source schema hash.`,
    );
  }

  return value;
}

function parseOptionalPackageMigrationSafety(value: unknown): "auto-safe" | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value !== "auto-safe") {
    throw new BadRequestError('Package migration safety must be "auto-safe".');
  }

  return value;
}

function parseCursor(value: string | null) {
  if (value === null) {
    return 0;
  }

  const cursor = Number(value);
  if (!Number.isInteger(cursor) || cursor < 0) {
    throw new BadRequestError("Sync cursor must be a non-negative integer.");
  }

  return cursor;
}

function isSiteTreePath(path: string): boolean {
  return path === "/tree" || path.startsWith("/tree/");
}

function parseSiteTreeSlug(path: string): string {
  if (!path.startsWith("/tree/")) {
    throw new BadRequestError("Site tree slug must be non-empty.");
  }

  try {
    const slug = decodeURIComponent(path.slice("/tree/".length)).trim();

    if (slug === "") {
      throw new BadRequestError("Site tree slug must be non-empty.");
    }

    return slug;
  } catch (error) {
    if (error instanceof BadRequestError) {
      throw error;
    }

    throw new BadRequestError("Site tree slug must be valid URL path text.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
