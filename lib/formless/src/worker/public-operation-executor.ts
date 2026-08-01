import type { ProgramStorageIdentity } from "../shared/program-storage-identity.ts";
import type {
  PublicOperationChallengeVerification,
  PublicOperationRequestSource,
} from "../shared/protocol.ts";
import type {
  OperationInvocationEnvelope,
  OperationInvocationResponse,
} from "../shared/operation-invocation.ts";
import { nowIsoString } from "../shared/clock.ts";
import type { AppSchema, EntityOperationSchema } from "@dpeek/formless-schema";
import {
  formatEntityOperationKey,
  isAnonymousPublicOperationExecutable,
  selectAnonymousPublicOperation,
} from "@dpeek/formless-schema";
import type { RecordValues } from "@dpeek/formless-storage";
import { BadRequestError } from "./errors.ts";
import {
  buildUnverifiedPublicOperationInvocationEnvelope,
  buildVerifiedPublicOperationInvocationEnvelope,
  type PublicOperationInvocationSourceFacts,
} from "./operation-invocation-envelopes.ts";
import type { PublicOperationReadRateLimitAdapter } from "./public-operation-read-rate-limit.ts";
import type { ShapedPublicOperationResponse } from "./public-operation-response.ts";

export type PublicOperationExecutorRoute = {
  entityName: string;
  operationName: string;
  path: string;
};

export type PublicOperationRequestUrlFacts = {
  host: string;
  origin: string;
  path: string;
};

export type SelectedPublicOperation = {
  entityName: string;
  operation: EntityOperationSchema;
  operationName: string;
};
export type ParsedPublicOperationRequest = {
  input: RecordValues;
  proof?: {
    turnstileToken: string;
  };
  source?: PublicOperationRequestSource;
  idempotencyKey?: string;
};

export type PublicOperationChallengeAdapterInput = {
  idempotencyKey: string;
  parsed: ParsedPublicOperationRequest & {
    proof: {
      turnstileToken: string;
    };
  };
  requestUrlFacts: PublicOperationRequestUrlFacts;
  selected: SelectedPublicOperation;
  unverifiedEnvelope: OperationInvocationEnvelope;
};

export type PublicOperationInputValidationAdapter = {
  validate(input: { rawInput: unknown; selected: SelectedPublicOperation }): RecordValues;
};

export type PublicOperationChallengeAdapter = {
  verify(
    input: PublicOperationChallengeAdapterInput,
  ): Promise<PublicOperationChallengeVerification> | PublicOperationChallengeVerification;
};

export type PublicOperationLifecycleAdapter = {
  execute(input: {
    assertAllowed: () => void;
    beforeReplay: () => Promise<void> | void;
    envelope: OperationInvocationEnvelope;
    execute: (
      envelope: OperationInvocationEnvelope,
    ) => Promise<OperationInvocationResponse> | OperationInvocationResponse;
    prepareExecutionEnvelope: () =>
      | Promise<OperationInvocationEnvelope>
      | OperationInvocationEnvelope;
  }): Promise<OperationInvocationResponse>;
};

export type PublicOperationAuthorityExecutionAdapter = {
  execute(input: {
    envelope: OperationInvocationEnvelope;
  }): Promise<OperationInvocationResponse> | OperationInvocationResponse;
};

export type PublicOperationResponseAdapter = {
  shape(input: { response: OperationInvocationResponse }): PublicOperationExecutorResult;
};

export type PublicOperationAfterCommitAdapter = {
  run(input: { response: OperationInvocationResponse }): Promise<void> | void;
};

export type PublicOperationExecutorAdapters = {
  afterCommit: PublicOperationAfterCommitAdapter;
  authority: PublicOperationAuthorityExecutionAdapter;
  challenge: PublicOperationChallengeAdapter;
  lifecycle: PublicOperationLifecycleAdapter;
  rateLimit: PublicOperationReadRateLimitAdapter;
  response: PublicOperationResponseAdapter;
  validation: PublicOperationInputValidationAdapter;
};

export type PublicOperationExecutorResult = {
  body: ShapedPublicOperationResponse["body"];
  headers?: HeadersInit;
  status?: number;
};

export type PublicOperationExecutorInput = {
  adapters: PublicOperationExecutorAdapters;
  body: unknown;
  identity: ProgramStorageIdentity;
  request: Request;
  route: PublicOperationExecutorRoute;
  schema: AppSchema;
};

type PublicOperationRequestEnvelopeFields = {
  input: unknown;
  proof: unknown;
  source?: PublicOperationRequestSource;
  idempotencyKey?: string;
};

const originalRequestHostHeader = "x-formless-original-request-host";
const originalRequestOriginHeader = "x-formless-original-request-origin";

export class PublicOperationError extends Error {
  readonly headers?: HeadersInit;
  readonly status: number;

  constructor(message: string, status: number, headers?: HeadersInit) {
    super(message);
    this.name = "PublicOperationError";
    this.status = status;
    this.headers = headers;
  }
}

export async function executePublicOperationExecutor(
  input: PublicOperationExecutorInput,
): Promise<PublicOperationExecutorResult> {
  const selected = selectPublicOperation(input.schema, input.route);
  const envelopeFields = parsePublicOperationRequestEnvelopeFields(input.body);
  const receivedAt = nowIsoString();
  const challengeFreeRead = isChallengeFreePublicRead(selected.operation);
  const idempotencyKey = challengeFreeRead
    ? undefined
    : (envelopeFields.idempotencyKey ??
      (await derivePublicOperationIdempotencyKey({
        entityName: input.route.entityName,
        input: envelopeFields.input,
        operationName: input.route.operationName,
        source: envelopeFields.source,
      })));
  const requestUrlFacts = publicRequestUrlFacts(input.request);
  const unverifiedEnvelope = buildUnverifiedPublicOperationInvocationEnvelope({
    identity: input.identity,
    ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
    publicInput: envelopeFields.input,
    receivedAt,
    route: {
      entityName: input.route.entityName,
      operationName: input.route.operationName,
    },
    schema: input.schema,
    source: publicOperationSourceFacts({
      requestUrlFacts,
      source: envelopeFields.source,
    }),
  });

  let parsed: ParsedPublicOperationRequest | undefined;

  const response = await input.adapters.lifecycle.execute({
    assertAllowed: () => assertPublicOperationInvocationAllowed(unverifiedEnvelope, input.schema),
    beforeReplay: async () => {
      assertPublicOperationOrigin(input.request, selected.operation);
      await consumePublicOperationRateLimit({
        adapters: input.adapters,
        identity: input.identity,
        operation: selected.operation,
        operationKey: unverifiedEnvelope.operation.canonicalKey,
        receivedAt,
        request: input.request,
      });
      parsed = parsePublicOperationRequest(envelopeFields, selected, input.adapters.validation);
    },
    envelope: unverifiedEnvelope,
    execute: (envelope) => input.adapters.authority.execute({ envelope }),
    prepareExecutionEnvelope: async () => {
      if (!parsed) {
        throw new Error("Public operation request was not parsed before challenge verification.");
      }

      if (challengeFreeRead) {
        return buildUnverifiedPublicOperationInvocationEnvelope({
          identity: input.identity,
          invocationId: unverifiedEnvelope.invocationId,
          publicInput: parsed.input,
          receivedAt,
          route: {
            entityName: selected.entityName,
            operationName: selected.operationName,
          },
          schema: input.schema,
          source: publicOperationSourceFacts({
            requestUrlFacts,
            source: parsed.source,
          }),
        });
      }

      if (idempotencyKey === undefined || parsed.proof === undefined) {
        throw new Error("Public operation challenge facts were not prepared.");
      }

      const stage = {
        idempotencyKey,
        parsed: {
          ...parsed,
          proof: parsed.proof,
        },
        receivedAt,
        requestUrlFacts,
        selected,
        unverifiedEnvelope,
      };
      const verification = await input.adapters.challenge.verify(stage);

      return buildVerifiedPublicOperationInvocationEnvelope({
        identity: input.identity,
        idempotencyKey,
        invocationId: unverifiedEnvelope.invocationId,
        proof: {
          turnstileToken: parsed.proof.turnstileToken,
          verification,
        },
        publicInput: parsed.input,
        receivedAt,
        route: {
          entityName: selected.entityName,
          operationName: selected.operationName,
        },
        schema: input.schema,
        source: publicOperationSourceFacts({
          requestUrlFacts,
          source: parsed.source,
        }),
      });
    },
  });

  const result = input.adapters.response.shape({ response });

  if (response.status === "committed") {
    await input.adapters.afterCommit.run({ response });
  }

  return result;
}

function assertPublicOperationInvocationAllowed(
  envelope: OperationInvocationEnvelope,
  schema: AppSchema,
) {
  const operation = selectAnonymousPublicOperation(schema, {
    entityName: envelope.operation.entityName,
    operationName: envelope.operation.operationName,
  });

  if (operation.kind !== "available") {
    throw new PublicOperationError("Public operation is not available.", 404);
  }
}

function parsePublicOperationRequest(
  envelopeFields: PublicOperationRequestEnvelopeFields,
  selected: SelectedPublicOperation,
  validation: PublicOperationInputValidationAdapter,
): ParsedPublicOperationRequest {
  if (!selected.operation.input) {
    throw new PublicOperationError("Public operation is not available.", 404);
  }

  const validatedInput = validation.validate({
    rawInput: envelopeFields.input,
    selected,
  });
  const challenge = selected.operation.policy?.access?.challenge;
  const proof =
    challenge?.kind === "turnstile" ? parsePublicOperationProof(envelopeFields.proof) : undefined;

  return {
    input: validatedInput,
    ...(proof === undefined ? {} : { proof }),
    ...(envelopeFields.source === undefined ? {} : { source: envelopeFields.source }),
    ...(envelopeFields.idempotencyKey === undefined
      ? {}
      : { idempotencyKey: envelopeFields.idempotencyKey }),
  };
}

function parsePublicOperationRequestEnvelopeFields(
  value: unknown,
): PublicOperationRequestEnvelopeFields {
  if (!isRecord(value)) {
    throw new BadRequestError("Public operation request must be an object.");
  }

  assertExactKeys(
    "Public operation request",
    value,
    ["input"],
    ["proof", "source", "idempotencyKey"],
  );

  return {
    input: value.input,
    proof: value.proof,
    ...(value.source === undefined ? {} : { source: parsePublicOperationSource(value.source) }),
    ...(value.idempotencyKey === undefined
      ? {}
      : { idempotencyKey: parseIdempotencyKey(value.idempotencyKey, "Public operation") }),
  };
}

function parsePublicOperationProof(value: unknown): ParsedPublicOperationRequest["proof"] {
  if (!isRecord(value)) {
    throw new BadRequestError("Public operation proof must be an object.");
  }

  assertExactKeys("Public operation proof", value, ["turnstileToken"]);

  if (typeof value.turnstileToken !== "string" || value.turnstileToken.trim() === "") {
    throw new BadRequestError("Public operation Turnstile token is required.");
  }

  if (value.turnstileToken.length > 2048) {
    throw new BadRequestError("Public operation Turnstile token is too long.");
  }

  return {
    turnstileToken: value.turnstileToken,
  };
}

function selectPublicOperation(
  schema: AppSchema,
  route: Pick<PublicOperationExecutorRoute, "entityName" | "operationName">,
): SelectedPublicOperation {
  const entity = schema.entities.find((definition) => definition.key === route.entityName)!;
  const operation = entity?.operations?.find(
    (definition) => definition.key === route.operationName,
  );
  if (!entity || !operation) {
    throw new PublicOperationError("Public operation is not available.", 404);
  }

  if (!isAnonymousPublicOperationExecutable(operation)) {
    throw new PublicOperationError("Public operation is not available.", 404);
  }

  return {
    entityName: route.entityName,
    operation,
    operationName: route.operationName,
  };
}

function assertPublicOperationOrigin(request: Request, operation: EntityOperationSchema) {
  if (operation.policy?.access?.origin.kind !== "same-origin") {
    return;
  }

  const origin = request.headers.get("Origin");
  if (!origin) {
    if (isChallengeFreePublicRead(operation)) {
      throw new PublicOperationError("Public operation origin is not allowed.", 403);
    }

    return;
  }

  let parsedOrigin: URL;

  try {
    parsedOrigin = new URL(origin);
  } catch {
    throw new PublicOperationError("Public operation origin is not allowed.", 403);
  }

  if (parsedOrigin.origin !== publicRequestUrlFacts(request).origin) {
    throw new PublicOperationError("Public operation origin is not allowed.", 403);
  }
}

async function consumePublicOperationRateLimit(input: {
  adapters: PublicOperationExecutorAdapters;
  identity: ProgramStorageIdentity;
  operation: EntityOperationSchema;
  operationKey: string;
  receivedAt: string;
  request: Request;
}) {
  const policy = input.operation.policy?.access?.rateLimit;
  if (policy === undefined) {
    return;
  }

  const decision = await input.adapters.rateLimit.consume({
    identity: input.identity,
    nowMs: Date.parse(input.receivedAt),
    operationKey: input.operationKey,
    policy,
    request: input.request,
  });

  if (!decision.allowed) {
    throw new PublicOperationError("Public operation rate limit exceeded.", 429, {
      "Retry-After": String(decision.retryAfterSeconds),
    });
  }
}

function isChallengeFreePublicRead(operation: EntityOperationSchema) {
  return operation.kind === "list" && operation.policy?.access?.challenge === undefined;
}

function parsePublicOperationSource(value: unknown): PublicOperationRequestSource {
  if (!isRecord(value)) {
    throw new BadRequestError("Public operation source must be an object.");
  }

  assertExactKeys("Public operation source", value, [], ["siteBlockId"]);

  if (value.siteBlockId === undefined) {
    return {};
  }

  if (typeof value.siteBlockId !== "string" || value.siteBlockId.trim() === "") {
    throw new BadRequestError("Public operation source siteBlockId must be a non-empty string.");
  }

  return { siteBlockId: value.siteBlockId };
}

function parseIdempotencyKey(value: unknown, context: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequestError(`${context} idempotencyKey must be a non-empty string.`);
  }

  if (value.length > 512) {
    throw new BadRequestError(`${context} idempotencyKey must be at most 512 characters.`);
  }

  return value;
}

function publicRequestUrlFacts(request: Request): PublicOperationRequestUrlFacts {
  const url = new URL(request.url);
  const originalOrigin = request.headers.get(originalRequestOriginHeader);
  const originalHost = request.headers.get(originalRequestHostHeader);
  const origin = originalOrigin ?? `${url.protocol}//${originalHost ?? url.host}`;
  const originUrl = parseUrl(origin);
  const originHeader = parseRequestOriginHeader(request);

  if (isLocalRequestHostname(originUrl?.hostname ?? url.hostname) && originHeader) {
    return {
      host: originHeader.host,
      origin: originHeader.origin,
      path: url.pathname,
    };
  }

  return {
    host: originalHost ?? url.host,
    origin,
    path: url.pathname,
  };
}

function publicOperationSourceFacts(input: {
  requestUrlFacts: PublicOperationRequestUrlFacts;
  source: PublicOperationRequestSource | undefined;
}): PublicOperationInvocationSourceFacts {
  return {
    host: input.requestUrlFacts.host,
    path: input.requestUrlFacts.path,
    ...(input.source?.siteBlockId === undefined ? {} : { siteBlockId: input.source.siteBlockId }),
  };
}

function parseRequestOriginHeader(request: Request): URL | undefined {
  const origin = request.headers.get("Origin");

  if (!origin) {
    return undefined;
  }

  try {
    return new URL(origin);
  } catch {
    return undefined;
  }
}

function parseUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function isLocalRequestHostname(hostname: string) {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

async function derivePublicOperationIdempotencyKey(input: {
  entityName: string;
  operationName: string;
  input: unknown;
  source: PublicOperationRequestSource | undefined;
}) {
  const digest = await sha256Hex(
    stableJson({
      input: input.input,
      operationKey: formatEntityOperationKey({
        entityKey: input.entityName,
        operationKey: input.operationName,
      }),
      source: input.source,
    }),
  );

  return `derived:${digest}`;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function assertExactKeys(
  context: string,
  value: Record<string, unknown>,
  required: string[],
  optional: string[] = [],
) {
  const allowed = new Set([...required, ...optional]);

  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new BadRequestError(`${context} has unsupported key "${key}".`);
    }
  }

  for (const key of required) {
    if (!Object.hasOwn(value, key)) {
      throw new BadRequestError(`${context} must include "${key}".`);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
