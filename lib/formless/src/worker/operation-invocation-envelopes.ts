import {
  formatEntityOperationKey,
  isEntityOperationWriteKind,
  type AppSchema,
  type EntityOperationActorKind,
  type EntityOperationKind,
  type EntityOperationSchema,
  type EntitySchema,
  type SchemaOperationActorKind,
} from "@dpeek/formless-schema";
import { nowIsoString } from "../shared/clock.ts";
import type {
  PublicOperationChallengeVerification,
  PublicOperationProof,
} from "../shared/protocol.ts";
import type {
  OperationInvocationActor,
  OperationInvocationEnvelope,
  OperationInvocationIdempotency,
  OperationInvocationInput,
  OperationInvocationSource,
  OperationInvocationSourceProtocol,
} from "../shared/operation-invocation.ts";
import { BadRequestError } from "./errors.ts";

type EntityOperationRoute = {
  entityName: string;
  operationName: string;
  recordId?: string;
};

type OperationInvocationBuildBase = {
  actor?: OperationInvocationActor;
  actorKind?: SchemaOperationActorKind;
  receivedAt?: string;
  schema: AppSchema;
};

type OperationRequestSourceDefaults = {
  protocol: OperationInvocationSourceProtocol;
  route?: string;
};

export type PublicOperationInvocationSourceFacts = {
  host: string;
  path: string;
  siteBlockId?: string;
};

export type VerifiedPublicOperationProofFacts = {
  turnstileToken: string;
  verification: PublicOperationChallengeVerification;
};

type PublicOperationInvocationBuildInput = OperationInvocationBuildBase & {
  idempotencyKey?: string;
  invocationId?: string;
  publicInput: unknown;
  route: Pick<EntityOperationRoute, "entityName" | "operationName">;
  source: PublicOperationInvocationSourceFacts;
};

const operationSourceProtocols = [
  "generated-ui",
  "protocol",
  "cli",
  "runner",
  "public",
  "automation",
] as const satisfies readonly OperationInvocationSourceProtocol[];

export function buildProtocolOperationInvocationEnvelope(
  input: OperationInvocationBuildBase & {
    body: unknown;
    method: string;
    path: string;
    route: EntityOperationRoute;
  },
): OperationInvocationEnvelope {
  const { operation } = requireOperation(input.schema, input.route);
  const actor = protocolOperationActor(input);
  const body = parseOptionalRecord("Operation request", input.body);
  assertOperationMethod(input.method, operation.kind);

  const invocationInput = operationInvocationInput(operation, body, input.route.recordId);
  assertOperationInputIsDeclared(operation, body);
  const source = operationRequestSource(body.source, {
    protocol: sourceProtocolForActor(actor.kind),
    route: input.path,
  });
  const canonicalKey = operationCanonicalKey(input.route);
  const idempotency = operationIdempotency(operation, canonicalKey, actor.kind, body);
  const invocationId =
    idempotency.writeIdentity ??
    parseOptionalNonEmptyString("Operation request invocationId", body.invocationId) ??
    createOperationInvocationId();

  return operationInvocationEnvelope({
    actor,
    idempotency,
    input: invocationInput,
    invocationId,
    operation,
    receivedAt: input.receivedAt,
    route: input.route,
    schemaOperation: operation,
    source,
  });
}

export function buildUnverifiedPublicOperationInvocationEnvelope(
  input: PublicOperationInvocationBuildInput,
): OperationInvocationEnvelope {
  return publicOperationInvocationEnvelope(input);
}

export function buildVerifiedPublicOperationInvocationEnvelope(
  input: PublicOperationInvocationBuildInput & {
    proof: VerifiedPublicOperationProofFacts;
  },
): OperationInvocationEnvelope {
  return publicOperationInvocationEnvelope({
    ...input,
    proof: publicOperationProof(input.proof),
  });
}

function operationInvocationEnvelope(input: {
  actor: OperationInvocationActor;
  idempotency: OperationInvocationIdempotency;
  input: OperationInvocationInput;
  invocationId: string;
  operation: EntityOperationSchema;
  receivedAt?: string;
  route: {
    entityName: string;
    operationName: string;
  };
  schemaOperation: EntityOperationSchema;
  source: OperationInvocationSource;
}): OperationInvocationEnvelope {
  return {
    invocationId: input.invocationId,
    actor: input.actor,
    source: input.source,
    input: input.input,
    idempotency: input.idempotency,
    operation: {
      entityName: input.route.entityName,
      operationName: input.route.operationName,
      canonicalKey: operationCanonicalKey(input.route),
      kind: input.operation.kind,
      scope: input.operation.scope,
      ...(input.operation.effect === undefined ? {} : { effect: input.operation.effect }),
      output: input.operation.output,
      ...(input.operation.policy === undefined ? {} : { policy: input.operation.policy }),
    },
    receivedAt: input.receivedAt ?? nowIsoString(),
    schemaOperation: input.schemaOperation,
  };
}

function requireOperation(
  schema: AppSchema,
  route: {
    entityName: string;
    operationName: string;
  },
): {
  entity: EntitySchema;
  operation: EntityOperationSchema;
} {
  const entity = schema.entities.find((definition) => definition.key === route.entityName)!;
  if (!entity) {
    throw new BadRequestError(`Unknown entity "${route.entityName}".`);
  }
  const operation = entity.operations?.find((definition) => definition.key === route.operationName);
  if (!operation) {
    throw new BadRequestError(
      `Unknown operation "${route.operationName}" for entity "${route.entityName}".`,
    );
  }

  return { entity, operation };
}

function operationCanonicalKey(route: { entityName: string; operationName: string }) {
  return formatEntityOperationKey({
    entityKey: route.entityName,
    operationKey: route.operationName,
  });
}

function operationWriteIdentity(canonicalKey: string, idempotencyKey: string) {
  return `operation:${canonicalKey}:${idempotencyKey}`;
}

function publicOperationInvocationEnvelope(
  input: PublicOperationInvocationBuildInput & {
    proof?: PublicOperationProof;
  },
): OperationInvocationEnvelope {
  const { operation } = requireOperation(input.schema, input.route);
  const canonicalKey = operationCanonicalKey(input.route);
  const idempotencyKey = parseOptionalNonEmptyString(
    "Public operation idempotencyKey",
    input.idempotencyKey,
  );
  const idempotency = !operation.idempotency.required
    ? { required: false as const }
    : idempotencyKey === undefined
      ? undefined
      : operationIdempotencyFromKey(canonicalKey, idempotencyKey, "caller");

  if (idempotency === undefined) {
    throw new BadRequestError(
      `Operation "${operation.kind}" requires an idempotency key for public execution.`,
    );
  }

  return operationInvocationEnvelope({
    actor: { kind: "anonymous" },
    idempotency,
    input: publicOperationInvocationInput(operation, input.publicInput, input.proof),
    invocationId: input.invocationId ?? idempotency.writeIdentity ?? createOperationInvocationId(),
    operation,
    receivedAt: input.receivedAt,
    route: input.route,
    schemaOperation: operation,
    source: {
      protocol: "public",
      host: input.source.host,
      path: input.source.path,
      ...(input.source.siteBlockId === undefined ? {} : { siteBlockId: input.source.siteBlockId }),
    },
  });
}

function protocolOperationActor(input: OperationInvocationBuildBase): OperationInvocationActor {
  if (
    input.actor !== undefined &&
    input.actorKind !== undefined &&
    input.actor.kind !== input.actorKind
  ) {
    throw new BadRequestError("Operation actor facts must match actor kind.");
  }

  return input.actor ?? { kind: input.actorKind ?? "owner" };
}

function publicOperationInvocationInput(
  operation: EntityOperationSchema,
  publicInput: unknown,
  proof: PublicOperationProof | undefined,
): OperationInvocationInput {
  if (operation.kind === "list") {
    return {
      type: "list",
      input: publicInput,
    };
  }

  if (operation.kind === "create") {
    return {
      type: "create",
      values: publicInput,
    };
  }

  if (operation.kind === "command" && operation.effect?.type === "recordPlan") {
    return {
      type: "command",
      input: publicInput,
    };
  }

  return {
    type: "command",
    input: proof === undefined ? { input: publicInput } : { input: publicInput, proof },
  };
}

function publicOperationProof(input: VerifiedPublicOperationProofFacts): PublicOperationProof {
  return {
    kind: "turnstile",
    token: input.turnstileToken,
    verification: input.verification,
  };
}

function operationInvocationInput(
  operation: EntityOperationSchema,
  body: Record<string, unknown>,
  routeRecordId: string | undefined,
): OperationInvocationInput {
  const kind = operation.kind;

  if (kind === "list") {
    return {
      type: "list",
      ...(body.input === undefined ? {} : { input: body.input }),
    };
  }

  if (kind === "get") {
    return {
      type: "get",
      recordId: parseNonEmptyString("Operation request recordId", body.recordId ?? routeRecordId),
    };
  }

  if (kind === "create") {
    return { type: "create", values: body.input };
  }

  if (kind === "update") {
    return {
      type: "update",
      recordId: parseNonEmptyString("Operation request recordId", body.recordId ?? routeRecordId),
      values: body.input,
    };
  }

  if (kind === "delete") {
    return {
      type: "delete",
      recordId: parseNonEmptyString("Operation request recordId", body.recordId ?? routeRecordId),
    };
  }

  const recordId =
    operation.scope === "record"
      ? parseOptionalNonEmptyString("Operation request recordId", body.recordId ?? routeRecordId)
      : undefined;

  return {
    type: "command",
    ...(recordId === undefined ? {} : { recordId }),
    ...(body.input === undefined ? {} : { input: body.input }),
  };
}

function assertOperationInputIsDeclared(
  operation: EntityOperationSchema,
  body: Record<string, unknown>,
) {
  if (body.input === undefined || operation.kind === "create" || operation.kind === "update") {
    return;
  }

  if (operation.kind === "command") {
    return;
  }

  if (!operation.input) {
    throw new BadRequestError(
      `Operation "${operation.kind}" request must not include input fields.`,
    );
  }
}

function operationIdempotency(
  operation: EntityOperationSchema,
  canonicalKey: string,
  actorKind: EntityOperationActorKind,
  body: Record<string, unknown>,
): OperationInvocationIdempotency {
  if (!operation.idempotency.required) {
    return { required: false };
  }

  const idempotencyKey = parseOptionalNonEmptyString(
    "Operation request idempotencyKey",
    body.idempotencyKey,
  );

  if (idempotencyKey !== undefined) {
    return operationIdempotencyFromKey(canonicalKey, idempotencyKey, "caller");
  }

  const runtimeWriteId = parseOptionalNonEmptyString(
    "Operation request runtimeWriteId",
    body.runtimeWriteId,
  );

  if (
    runtimeWriteId !== undefined &&
    operation.idempotency.source === "runtime" &&
    isTrustedRuntimeOperationActor(actorKind)
  ) {
    return operationIdempotencyFromKey(canonicalKey, runtimeWriteId, "runtime");
  }

  throw new BadRequestError(
    `Operation "${operation.kind}" requires an idempotency key for write execution.`,
  );
}

function operationIdempotencyFromKey(
  canonicalKey: string,
  key: string,
  source: "caller" | "runtime",
): OperationInvocationIdempotency {
  return {
    required: true,
    key,
    source,
    writeIdentity: operationWriteIdentity(canonicalKey, key),
  };
}

function operationRequestSource(
  value: unknown,
  defaults: OperationRequestSourceDefaults,
): OperationInvocationSource {
  const fallback = {
    protocol: defaults.protocol,
    ...(defaults.route === undefined ? {} : { route: defaults.route }),
  } satisfies OperationInvocationSource;

  if (value === undefined) {
    return fallback;
  }

  const source = parseRecord("Operation request source", value);
  const protocol =
    source.protocol === undefined
      ? defaults.protocol
      : parseOperationSourceProtocol("Operation request source protocol", source.protocol);
  const route = parseOptionalNonEmptyString("Operation request source route", source.route);
  const surface = parseOptionalNonEmptyString("Operation request source surface", source.surface);
  const host = parseOptionalNonEmptyString("Operation request source host", source.host);
  const path = parseOptionalNonEmptyString("Operation request source path", source.path);
  const siteBlockId = parseOptionalNonEmptyString(
    "Operation request source siteBlockId",
    source.siteBlockId,
  );

  return {
    protocol,
    ...(route === undefined
      ? fallback.route === undefined
        ? {}
        : { route: fallback.route }
      : { route }),
    ...(surface === undefined ? {} : { surface }),
    ...(host === undefined ? {} : { host }),
    ...(path === undefined ? {} : { path }),
    ...(siteBlockId === undefined ? {} : { siteBlockId }),
  };
}

function parseOperationSourceProtocol(
  context: string,
  value: unknown,
): OperationInvocationSourceProtocol {
  if (!operationSourceProtocols.includes(value as OperationInvocationSourceProtocol)) {
    throw new BadRequestError(`${context} must be a supported operation source protocol.`);
  }

  return value as OperationInvocationSourceProtocol;
}

function sourceProtocolForActor(
  actorKind: EntityOperationActorKind,
): OperationInvocationSourceProtocol {
  if (actorKind === "cliDeployer") {
    return "cli";
  }

  if (actorKind === "runner") {
    return "runner";
  }

  return "protocol";
}

function assertOperationMethod(method: string, kind: EntityOperationKind) {
  if (method === "GET" && isEntityOperationWriteKind(kind)) {
    throw new BadRequestError("Write and command operations require POST.");
  }
}

function createOperationInvocationId() {
  return `operation:${crypto.randomUUID()}`;
}

function isTrustedRuntimeOperationActor(actorKind: EntityOperationActorKind) {
  return actorKind === "cliDeployer" || actorKind === "runner";
}

function parseOptionalRecord(context: string, value: unknown): Record<string, unknown> {
  if (value === undefined) {
    return {};
  }

  return parseRecord(context, value);
}

function parseRecord(context: string, value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BadRequestError(`${context} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function parseNonEmptyString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequestError(`${context} must be a non-empty string.`);
  }

  return value;
}

function parseOptionalNonEmptyString(context: string, value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return parseNonEmptyString(context, value);
}
