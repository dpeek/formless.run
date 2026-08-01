import type {
  EntityOperationActorKind,
  EntityOperationEffectSchema,
  EntityOperationKind,
  EntityOperationOutputContractSchema,
  EntityOperationPolicySchema,
  EntityOperationSchema,
  EntityOperationScope,
} from "@dpeek/formless-schema";
import type { StoredRecord } from "@dpeek/formless-storage";
import type { ChangeRow } from "./protocol.ts";

export type OperationInvocationActor = {
  kind: EntityOperationActorKind;
  principalId?: string;
  sessionTarget?: OperationInvocationActorSessionTarget;
};

export type OperationInvocationActorSessionTarget = {
  instanceId: string;
  routeId: string;
  targetOrigin: string;
  targetProfile: "instance" | "public-site";
};

export type OperationInvocationSourceProtocol =
  | "generated-ui"
  | "protocol"
  | "cli"
  | "runner"
  | "public"
  | "automation";

export type OperationInvocationSource = {
  protocol: OperationInvocationSourceProtocol;
  route?: string;
  surface?: string;
  host?: string;
  path?: string;
  siteBlockId?: string;
};

export type OperationInvocationInput =
  | {
      type: "list";
      input?: unknown;
    }
  | {
      type: "get";
      recordId: string;
    }
  | {
      type: "create";
      values: unknown;
    }
  | {
      type: "update";
      recordId: string;
      values: unknown;
    }
  | {
      type: "delete";
      recordId: string;
    }
  | {
      type: "command";
      recordId?: string;
      input?: unknown;
    };

export type OperationInvocationIdempotency = {
  required: boolean;
  key?: string;
  source?: "caller" | "runtime";
  writeIdentity?: string;
};

export type OperationInvocationStatus =
  | "accepted"
  | "rejected"
  | "committed"
  | "replayed"
  | "failed"
  | "resumed";

export type OperationInvocationOperation = {
  entityName: string;
  operationName: string;
  canonicalKey: string;
  kind: EntityOperationKind;
  scope: EntityOperationScope;
  effect?: EntityOperationEffectSchema;
  output: EntityOperationOutputContractSchema;
  policy?: EntityOperationPolicySchema;
};

export type OperationInvocationEnvelope = {
  invocationId: string;
  actor: OperationInvocationActor;
  source: OperationInvocationSource;
  input: OperationInvocationInput;
  idempotency: OperationInvocationIdempotency;
  operation: OperationInvocationOperation;
  receivedAt: string;
  schemaOperation: EntityOperationSchema;
};

export type OperationInvocationEffect = EntityOperationEffectSchema;

export type OperationCommandRecordPlanStepOutput = {
  name: string;
  kind: "create" | "patch" | "delete" | "tombstone";
  entity: string;
  recordId: string;
  changeId: string;
};

export type OperationCommandRecordPlanOutput = {
  steps: OperationCommandRecordPlanStepOutput[];
};

export type OperationCommandOutput = {
  type: "command";
  affectedChangeIds: string[];
  changes: ChangeRow[];
  cursor: number;
  recordPlan?: OperationCommandRecordPlanOutput;
};

export type OperationInvocationOutput =
  | {
      type: "list";
      records: StoredRecord[];
    }
  | {
      type: "get";
      record: StoredRecord;
    }
  | {
      type: "create";
      affectedChangeIds: string[];
      changes: ChangeRow[];
      cursor: number;
      record: StoredRecord;
    }
  | {
      type: "update";
      affectedChangeIds: string[];
      changes: ChangeRow[];
      cursor: number;
      record: StoredRecord;
    }
  | {
      type: "delete";
      affectedChangeIds: string[];
      changes: ChangeRow[];
      cursor: number;
      recordId: string;
    }
  | OperationCommandOutput;

export type OperationInvocationResponse = {
  invocation: OperationInvocationEnvelope;
  output: OperationInvocationOutput;
  status: OperationInvocationStatus;
};

export type OperationInvocationRequest = {
  input?: unknown;
  recordId?: string;
  idempotencyKey?: string;
  runtimeWriteId?: string;
  source?: OperationInvocationSource;
};
