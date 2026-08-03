import type { AppSchema } from "@dpeek/formless-schema";
import type { RecordValues, StoredRecord } from "@dpeek/formless-storage";
import type { SourceSchemaHash } from "@dpeek/formless-schema";

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

export type SyncSocketServerMessage = {
  type: "changed";
};

export type SyncSocketAttachment = {
  expiresAt: number;
};

export const FORMLESS_CLIENT_RUNTIME_PROTOCOL_HEADER = "x-formless-runtime-protocol-version";
export const FORMLESS_CLIENT_SCHEMA_UPDATED_AT_HEADER = "x-formless-schema-updated-at";
export const FORMLESS_CLIENT_SOURCE_SCHEMA_HASH_HEADER = "x-formless-source-schema-hash";
export const FORMLESS_RELOAD_REQUIRED_ERROR_CODE = "reload-required";

export type BrowserReplicaSchemaProvenance = {
  kind: "program";
  sourceSchemaHash: SourceSchemaHash;
};

export type BrowserReplicaUpgradeFacts = {
  runtimeProtocolVersion: number;
  schemaUpdatedAt: string | null;
  schemaProvenance: BrowserReplicaSchemaProvenance | null;
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

export function isSyncSocketServerMessage(value: unknown): value is SyncSocketServerMessage {
  return isRecord(value) && Object.keys(value).length === 1 && value.type === "changed";
}

export function isSyncSocketAttachment(value: unknown): value is SyncSocketAttachment {
  return (
    isRecord(value) &&
    Object.keys(value).length === 1 &&
    typeof value.expiresAt === "number" &&
    Number.isSafeInteger(value.expiresAt) &&
    value.expiresAt > 0
  );
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
