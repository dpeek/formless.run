import type { AppSchema } from "@dpeek/formless-schema";
import { isStoredRecord, type RecordValues, type StoredRecord } from "@dpeek/formless-storage";
import type {
  AppInstall,
  AppInstallInitializationPlan,
  AppInstallLaunchLink,
  AppInstallRegistrationOperation,
  AppInstallRegistrationPolicy,
  InstallableAppPackage,
  PackageAppKey,
} from "@dpeek/formless-installed-apps";
import {
  defaultAppInstallRegistrationPolicy,
  parseAppInstallRegistrationOperation,
  parseAppInstallRegistrationPolicy,
} from "@dpeek/formless-installed-apps";
import type { PackageAppRevision, SourceSchemaHash } from "./upgrade-migrations.ts";

export type EntityName = string;

export type PublicOperationProofInput = {
  turnstileToken: string;
};

export type PublicOperationRequestSource = {
  siteBlockId?: string;
};

export type PublicOperationProof = {
  kind: "turnstile";
  token: string;
  verification?: PublicOperationChallengeVerification;
};

export type PublicOperationChallengeVerification = {
  kind: "turnstile";
  success: boolean;
  verifiedAt: string;
  challengeTs?: string;
  hostname?: string;
};

export type PublicOperationRequest = {
  input: RecordValues;
  proof?: PublicOperationProofInput;
  source?: PublicOperationRequestSource;
  idempotencyKey?: string;
};

export type PublicOperationResponseOperation = {
  entityName: string;
  operationName: string;
  canonicalKey: string;
};

export type PublicOperationCommandResponse = {
  invocationId: string;
  operation: PublicOperationResponseOperation & {
    kind: "command";
  };
  output: {
    type: "command";
    affectedChangeIds: string[];
    cursor: number;
    recordPlan?: {
      steps: {
        name: string;
        kind: "create" | "patch" | "delete" | "tombstone";
        entity: EntityName;
        recordId: string;
        changeId: string;
      }[];
    };
  };
  status: "committed" | "replayed";
};

export type PublicOperationCreateResponse = {
  invocationId: string;
  operation: PublicOperationResponseOperation & {
    kind: "create";
  };
  output: {
    type: "create";
    affectedChangeIds: string[];
    changes: ChangeRow[];
    cursor: number;
    record: StoredRecord;
  };
  status: "committed" | "replayed";
};

export type PublicOperationListResponse = {
  invocationId: string;
  operation: PublicOperationResponseOperation & {
    kind: "list";
  };
  output: {
    type: "list";
    records: RecordValues[];
  };
  status: "accepted";
};

export type PublicOperationResponse =
  | PublicOperationCommandResponse
  | PublicOperationCreateResponse
  | PublicOperationListResponse;

export type ChangeRow = {
  seq: number;
  writeId: string;
  operationKind: "create" | "update" | "delete" | "command";
  entity: EntityName;
  recordId: string;
  payload: StoredRecord;
  createdAt: string;
};

export type BootstrapResponse = {
  schema: AppSchema;
  schemaProvenance?: BrowserReplicaSchemaProvenance;
  schemaUpdatedAt: string;
  records: StoredRecord[];
  cursor: number;
};

export type SyncResponse = {
  changes: ChangeRow[];
  cursor: number;
  schema?: AppSchema;
  schemaProvenance?: BrowserReplicaSchemaProvenance;
  schemaUpdatedAt?: string;
};

export type SyncSocketClientMessage =
  | {
      type: "hello";
      cursor: number;
      schemaUpdatedAt: string | null;
    }
  | {
      type: "sync-requested";
      cursor: number;
      schemaUpdatedAt: string | null;
    };

export type SyncSocketServerMessage =
  | {
      type: "sync";
      payload: SyncResponse;
    }
  | {
      type: "error";
      message: string;
    };

export type SyncSocketAttachment = {
  cursor: number;
  schemaUpdatedAt: string | null;
};

export const FORMLESS_CLIENT_RUNTIME_PROTOCOL_HEADER = "x-formless-runtime-protocol-version";
export const FORMLESS_CLIENT_SCHEMA_UPDATED_AT_HEADER = "x-formless-schema-updated-at";
export const FORMLESS_CLIENT_PACKAGE_REVISION_HEADER = "x-formless-package-app-revision";
export const FORMLESS_CLIENT_SOURCE_SCHEMA_HASH_HEADER = "x-formless-source-schema-hash";
export const FORMLESS_RELOAD_REQUIRED_ERROR_CODE = "reload-required";

export type BrowserReplicaSchemaProvenance =
  | {
      kind: "package-app";
      packageAppKey: PackageAppKey;
      packageRevision: PackageAppRevision;
      sourceSchemaHash: SourceSchemaHash;
    }
  | {
      kind: "instance-control-plane";
      sourceSchemaHash: SourceSchemaHash;
    }
  | {
      kind: "identity-control-plane";
      sourceSchemaHash: SourceSchemaHash;
    };

export type BrowserReplicaUpgradeFacts = {
  runtimeProtocolVersion: number;
  schemaUpdatedAt: string | null;
  schemaProvenance: BrowserReplicaSchemaProvenance | null;
  packageApp: {
    packageAppKey: PackageAppKey;
    packageRevision: PackageAppRevision;
    sourceSchemaHash: SourceSchemaHash;
  } | null;
};

export type ReloadRequiredErrorResponse = {
  error: string;
  code: typeof FORMLESS_RELOAD_REQUIRED_ERROR_CODE;
  reloadRequired: true;
  upgrade: BrowserReplicaUpgradeFacts;
};

export const OWNER_SETUP_TOKEN_MIN_LENGTH = 32;
export const OWNER_SETUP_TOKEN_MAX_LENGTH = 512;

export type OwnerIdentityInput = {
  name: string;
  email?: string;
};

export type OwnerIdentity = {
  id: string;
  name: string;
  email?: string;
  createdAt: string;
};

export type OwnerSetupStatusResponse = {
  adminOrigin?: string;
  authOrigin?: string;
  setupComplete: boolean;
  owner?: OwnerIdentity;
};

export type AppInstallsResponse = {
  packages: InstallableAppPackage[];
  installs: AppInstall[];
  launchLinks?: AppInstallLaunchLink[];
};

export type CreateAppInstallRequest = {
  packageAppKey: string;
  installId: string;
  label: string;
  registrationOperation?: AppInstallRegistrationOperation;
  registrationPolicy?: AppInstallRegistrationPolicy;
};

export type CreateAppInstallResponse = {
  initialization: AppInstallInitializationPlan;
  install: AppInstall;
  installs: AppInstall[];
};

export type SchemaResponse = {
  schema: AppSchema;
  schemaProvenance?: BrowserReplicaSchemaProvenance;
  updatedAt: string;
};

export type SchemaUpdateResponse = {
  schema: AppSchema;
  schemaProvenance?: BrowserReplicaSchemaProvenance;
  updatedAt: string;
};

export function isSyncSocketClientMessage(value: unknown): value is SyncSocketClientMessage {
  return (
    isRecord(value) &&
    (value.type === "hello" || value.type === "sync-requested") &&
    isCursor(value.cursor) &&
    isNullableString(value.schemaUpdatedAt)
  );
}

export function isSyncSocketServerMessage(value: unknown): value is SyncSocketServerMessage {
  if (!isRecord(value)) {
    return false;
  }

  if (value.type === "error") {
    return typeof value.message === "string";
  }

  return value.type === "sync" && isSyncResponse(value.payload);
}

export function isSyncSocketAttachment(value: unknown): value is SyncSocketAttachment {
  return isRecord(value) && isCursor(value.cursor) && isNullableString(value.schemaUpdatedAt);
}

export function parseOwnerSetupToken(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Owner setup token must be a string.");
  }

  const token = value.trim();

  if (token.length < OWNER_SETUP_TOKEN_MIN_LENGTH) {
    throw new Error(
      `Owner setup token must be at least ${OWNER_SETUP_TOKEN_MIN_LENGTH} characters.`,
    );
  }

  if (token.length > OWNER_SETUP_TOKEN_MAX_LENGTH) {
    throw new Error(
      `Owner setup token must be at most ${OWNER_SETUP_TOKEN_MAX_LENGTH} characters.`,
    );
  }

  if (!/^[A-Za-z0-9_-]+$/.test(token)) {
    throw new Error("Owner setup token must be URL-safe.");
  }

  return token;
}

export function parseCreateAppInstallRequest(value: unknown): CreateAppInstallRequest {
  if (!isRecord(value)) {
    throw new Error("App install request must be an object.");
  }

  assertCreateAppInstallRequestKeys(value);

  return {
    packageAppKey: parseTrimmedNonEmptyString("App install package app key", value.packageAppKey),
    installId: parseTrimmedNonEmptyString("App install id", value.installId),
    label: parseTrimmedNonEmptyString("App install label", value.label),
    registrationPolicy:
      parseOptionalAppInstallRegistrationPolicy(value.registrationPolicy) ??
      defaultAppInstallRegistrationPolicy(),
    ...(value.registrationOperation === undefined
      ? {}
      : {
          registrationOperation: parseAppInstallRegistrationOperation(
            value.registrationOperation,
            "App install registration operation",
          ),
        }),
  };
}

function isSyncResponse(value: unknown): value is SyncResponse {
  if (!isRecord(value) || !Array.isArray(value.changes) || !isCursor(value.cursor)) {
    return false;
  }

  if (!value.changes.every(isChangeRow)) {
    return false;
  }

  if ("schema" in value && !isRecord(value.schema)) {
    return false;
  }

  if ("schemaUpdatedAt" in value && typeof value.schemaUpdatedAt !== "string") {
    return false;
  }

  if ("schemaProvenance" in value && !isBrowserReplicaSchemaProvenance(value.schemaProvenance)) {
    return false;
  }

  return true;
}

function isBrowserReplicaSchemaProvenance(value: unknown): value is BrowserReplicaSchemaProvenance {
  if (!isRecord(value) || !isSha256SourceSchemaHash(value.sourceSchemaHash)) {
    return false;
  }

  if (value.kind === "instance-control-plane" || value.kind === "identity-control-plane") {
    return true;
  }

  return (
    value.kind === "package-app" &&
    typeof value.packageAppKey === "string" &&
    typeof value.packageRevision === "number" &&
    Number.isInteger(value.packageRevision) &&
    value.packageRevision > 0
  );
}

function isChangeRow(value: unknown): value is ChangeRow {
  return (
    isRecord(value) &&
    isCursor(value.seq) &&
    typeof value.writeId === "string" &&
    (value.operationKind === "create" ||
      value.operationKind === "update" ||
      value.operationKind === "delete" ||
      value.operationKind === "command") &&
    typeof value.entity === "string" &&
    typeof value.recordId === "string" &&
    isStoredRecord(value.payload) &&
    typeof value.createdAt === "string"
  );
}

function isCursor(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function isSha256SourceSchemaHash(value: unknown): value is SourceSchemaHash {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertCreateAppInstallRequestKeys(value: Record<string, unknown>) {
  const requiredKeys = ["packageAppKey", "installId", "label"];
  const allowedKeys = new Set([...requiredKeys, "registrationOperation", "registrationPolicy"]);

  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`App install request has unsupported key "${key}".`);
    }
  }

  for (const key of requiredKeys) {
    if (!(key in value)) {
      throw new Error(`App install request must include "${key}".`);
    }
  }
}

function parseOptionalAppInstallRegistrationPolicy(
  value: unknown,
): AppInstallRegistrationPolicy | undefined {
  if (value === undefined) {
    return undefined;
  }

  return parseAppInstallRegistrationPolicy(value, "App install registration policy");
}

function parseNonEmptyString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value;
}

function parseTrimmedNonEmptyString(context: string, value: unknown): string {
  return parseNonEmptyString(context, value).trim();
}
