import type { RecordValues, StorageSnapshot } from "@dpeek/formless-storage";
import {
  FORMLESS_CLIENT_RUNTIME_PROTOCOL_HEADER,
  FORMLESS_CLIENT_SCHEMA_UPDATED_AT_HEADER,
  FORMLESS_CLIENT_SOURCE_SCHEMA_HASH_HEADER,
  type BrowserReplicaUpgradeFacts,
  type BootstrapResponse,
  type SchemaResponse,
  type SchemaUpdateResponse,
  type SyncResponse,
} from "../shared/protocol.ts";
import type { SitePageTreeResponse } from "@dpeek/formless-site-app";
import type {
  OperationInvocationActor,
  OperationInvocationEnvelope,
  OperationInvocationResponse,
} from "../shared/operation-invocation.ts";
import type { AuthorityStorageIdentity } from "../shared/app-storage-identity.ts";
import { FORMLESS_RUNTIME_PROTOCOL_VERSION } from "../shared/deploy-metadata.ts";
import type { EntityOperationSchema, SchemaOperationActorKind } from "@dpeek/formless-schema";
import type { IdentityReferenceTargetResolver } from "./identity-reference-targets.ts";
import { isSourceSchemaHash } from "../shared/upgrade-migrations.ts";
import {
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
  resetStorageSchemaToSourceOutcome,
  restoreStorageSnapshotOutcome,
  readCurrentStoredSchema,
  recordOperationInvocationAccepted,
  recordOperationInvocationFailed,
  type RecordConstraintValidator,
  type StoredSchema,
  type StorageSource,
  type WriteOutcome,
  writeActiveSchemaOutcome,
} from "./storage.ts";
import { programPublicSiteWorkerAdapter } from "./public-site-worker-runtime.ts";
import {
  selectCurrentFormlessProgramChanges,
  selectCurrentFormlessProgramRecords,
} from "./program-authority.ts";
import { FORMLESS_PROGRAM_STORAGE_IDENTITY } from "../program/target.ts";

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
  | "resetSchema";

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
  | WriteOperation<"resetSchema">;

export type AuthorityOperation = ReadAuthorityOperation | WriteAuthorityOperation;

export type AuthorityWriteNotifier = {
  apply<T>(write: () => WriteOutcome<T>): WriteOutcome<T>;
};

type AuthorityErrorResponse = {
  error: string;
};

export type AuthorityOperationResponseBody =
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
  programOperationAuthorized?: boolean;
  requestHeaders?: Headers;
  source: StorageSource;
  storage: DurableObjectStorage;
  turnstileSiteKey?: string;
  validateConstraints?: RecordConstraintValidator;
  writes: AuthorityWriteNotifier;
};

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
        body: bootstrapResponse(input.storage, storedSchema, input.source),
        headers: browserReplicaUpgradeHeaders(input.storage),
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

      const snapshot = exportStorageSnapshot(
        input.storage,
        input.identity.authorityName,
        input.app.key,
      );

      return {
        body: isFormlessProgramSource(input.source)
          ? { ...snapshot, records: selectCurrentFormlessProgramRecords(snapshot.records) }
          : snapshot,
      };
    }

    case "siteTree": {
      const slug = parseSiteTreeSlug(operation.metadata.path);
      const { schema } = initializeStorageFromSource(input.storage, input.source);
      const adapter = programPublicSiteWorkerAdapter();
      const projection = adapter.buildPublicTree({
        records: getBootstrapRecords(input.storage),
        schema,
        slug,
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
      const storedChanges = getChangesAfter(input.storage, operation.after);
      const changes = isFormlessProgramSource(input.source)
        ? selectCurrentFormlessProgramChanges(storedChanges)
        : storedChanges;
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
        headers: browserReplicaUpgradeHeaders(input.storage),
      };
    }

    case "writeSchema": {
      const currentSchema = initializeStorageFromSource(input.storage, input.source).schema;
      const records = getBootstrapRecords(input.storage);
      const nextSchema = validateSchemaUpdateRequest(input.body, currentSchema, records);

      return writeOperationResult(
        input.writes.apply(() =>
          mapWriteOutcome(writeActiveSchemaOutcome(input.storage, nextSchema), schemaResponse),
        ),
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

      if (operationSchema?.access === undefined && input.programOperationAuthorized !== true) {
        throw new BadRequestError(
          `Program operation "${operation.entityName}.${operation.operationName}" is missing access.`,
        );
      }
      if (input.programOperationAuthorized !== true) {
        throw new BadRequestError(
          `Program operation "${operation.entityName}.${operation.operationName}" is not authorized.`,
        );
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
            (storedSchema) => bootstrapResponse(input.storage, storedSchema, input.source),
          ),
        ),
      );
    }
  }
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

  const upgrade = browserReplicaUpgradeFacts(input.storage);

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
  const schemaUpdatedAt = parseOptionalStringHeader(
    headers,
    FORMLESS_CLIENT_SCHEMA_UPDATED_AT_HEADER,
    "schema updated timestamp",
  );
  const sourceSchemaHash = parseOptionalSourceSchemaHashHeader(headers);

  return {
    hasAnyFact:
      runtimeProtocolVersion !== undefined ||
      schemaUpdatedAt !== undefined ||
      sourceSchemaHash !== undefined,
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

function browserReplicaUpgradeHeaders(storage: DurableObjectStorage): HeadersInit {
  const facts = browserReplicaUpgradeFacts(storage);
  const headers: Record<string, string> = {
    [FORMLESS_CLIENT_RUNTIME_PROTOCOL_HEADER]: String(facts.runtimeProtocolVersion),
  };

  if (facts.schemaUpdatedAt !== null) {
    headers[FORMLESS_CLIENT_SCHEMA_UPDATED_AT_HEADER] = facts.schemaUpdatedAt;
  }

  if (facts.schemaProvenance) {
    headers[FORMLESS_CLIENT_SOURCE_SCHEMA_HASH_HEADER] = facts.schemaProvenance.sourceSchemaHash;
  }

  return headers;
}

function browserReplicaUpgradeFacts(storage: DurableObjectStorage): BrowserReplicaUpgradeFacts {
  const storedSchema = readCurrentStoredSchema(storage);
  const schemaProvenance =
    storedSchema?.schemaProvenance?.kind === "program" ? storedSchema.schemaProvenance : null;

  return {
    runtimeProtocolVersion: FORMLESS_RUNTIME_PROTOCOL_VERSION,
    schemaUpdatedAt: storedSchema?.updatedAt ?? null,
    schemaProvenance,
  };
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
  source: StorageSource,
): BootstrapResponse {
  const storedRecords = getBootstrapRecords(storage);

  return {
    schema: storedSchema.schema,
    ...(storedSchema.schemaProvenance?.kind !== "program"
      ? {}
      : { schemaProvenance: storedSchema.schemaProvenance }),
    schemaUpdatedAt: storedSchema.updatedAt,
    records: isFormlessProgramSource(source)
      ? selectCurrentFormlessProgramRecords(storedRecords)
      : storedRecords,
    cursor: getCurrentCursor(storage),
  };
}

function isFormlessProgramSource(source: StorageSource): boolean {
  return source.storageIdentity === FORMLESS_PROGRAM_STORAGE_IDENTITY;
}

function schemaResponse(storedSchema: StoredSchema): SchemaResponse {
  return {
    schema: storedSchema.schema,
    ...(storedSchema.schemaProvenance?.kind !== "program"
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
    ...(storedSchema.schemaProvenance?.kind !== "program"
      ? {}
      : { schemaProvenance: storedSchema.schemaProvenance }),
    schemaUpdatedAt: storedSchema.updatedAt,
  };
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
