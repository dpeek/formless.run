export const PUBLIC_OPERATION_ROUTE_SUFFIX_PREFIX = "/public/operations" as const;
export const TURNSTILE_RESPONSE_FIELD_NAME = "cf-turnstile-response" as const;

export type PublicOperationRouteParts = {
  entityKey: string;
  operationKey: string;
};

export type PublicOperationRouteSuffix =
  `${typeof PUBLIC_OPERATION_ROUTE_SUFFIX_PREFIX}/${string}/${string}`;

export type PublicOperationTargetRouteInput = PublicOperationRouteParts & {
  targetApiRoutePrefix: `/${string}`;
};

export type PublicOperationRouteErrorCode = "empty-segment" | "invalid-escape" | "invalid-shape";

export type PublicOperationInputValue = string | boolean | number;
export type PublicOperationInputValues = Record<string, PublicOperationInputValue>;
export type PublicOperationResultRow = Record<string, PublicOperationInputValue>;

export type PublicOperationProofInput = {
  turnstileToken: string;
};

export type PublicOperationRequestSource = {
  siteBlockId: string;
};

export type PublicOperationRequestEnvelope = {
  input: PublicOperationInputValues;
  proof?: PublicOperationProofInput;
  source?: PublicOperationRequestSource;
  idempotencyKey?: string;
};

export type PublicOperationRequestBodyInput = {
  idempotencyKey?: string;
  input: PublicOperationInputValues;
  siteBlockId?: string;
  turnstileToken?: string;
};

export type PublicOperationResponseStatus = "accepted" | "committed" | "replayed";
export type PublicOperationWriteResponseStatus = Exclude<PublicOperationResponseStatus, "accepted">;

export type PublicOperationResponseOperation = {
  canonicalKey: string;
  entityName: string;
  operationName: string;
  kind: "command" | "create" | "list";
};

export type PublicOperationCommandOutput = {
  affectedChangeIds: string[];
  cursor: number;
  recordPlan?: unknown;
  type: "command";
};

export type PublicOperationCreateOutput = {
  affectedChangeIds: string[];
  changes?: unknown[];
  cursor: number;
  record: unknown;
  type: "create";
};

export type PublicOperationListOutput = {
  records: PublicOperationResultRow[];
  type: "list";
};

export type PublicOperationCommandResponse = {
  invocationId: string;
  operation: PublicOperationResponseOperation & {
    kind: "command";
  };
  output: PublicOperationCommandOutput;
  status: PublicOperationWriteResponseStatus;
};

export type PublicOperationCreateResponse = {
  invocationId: string;
  operation: PublicOperationResponseOperation & {
    kind: "create";
  };
  output: PublicOperationCreateOutput;
  status: PublicOperationWriteResponseStatus;
};

export type PublicOperationListResponse = {
  invocationId: string;
  operation: PublicOperationResponseOperation & {
    kind: "list";
  };
  output: PublicOperationListOutput;
  status: "accepted";
};

export type PublicOperationResponse =
  | PublicOperationCommandResponse
  | PublicOperationCreateResponse
  | PublicOperationListResponse;

export type SubmitPublicOperationJsonInput<ResponseBody extends PublicOperationResponse> = {
  body: PublicOperationRequestEnvelope;
  fetcher?: typeof fetch;
  invalidResponseMessage?: string;
  responseGuard: (value: unknown) => value is ResponseBody;
  route: string;
  submitErrorMessage?: string;
};

export type PublicOperationIdempotencyKeyInput = {
  purpose: string;
  randomId?: string;
  siteBlockId: string;
};

export class PublicOperationRouteError extends Error {
  readonly code: PublicOperationRouteErrorCode;

  constructor(code: PublicOperationRouteErrorCode, message: string) {
    super(message);
    this.name = "PublicOperationRouteError";
    this.code = code;
  }
}

export function buildPublicOperationRouteSuffix(
  input: PublicOperationRouteParts,
): PublicOperationRouteSuffix {
  return `${PUBLIC_OPERATION_ROUTE_SUFFIX_PREFIX}/${encodePublicOperationRouteSegment(
    input.entityKey,
  )}/${encodePublicOperationRouteSegment(input.operationKey)}`;
}

export function parsePublicOperationRouteSuffix(path: string): PublicOperationRouteParts {
  const prefix = `${PUBLIC_OPERATION_ROUTE_SUFFIX_PREFIX}/`;

  if (!path.startsWith(prefix)) {
    throw invalidShape();
  }

  const segments = path.slice(prefix.length).split("/");

  if (segments.length !== 2 || !segments[0] || !segments[1]) {
    throw invalidShape();
  }

  return {
    entityKey: decodePublicOperationRouteSegment(segments[0]),
    operationKey: decodePublicOperationRouteSegment(segments[1]),
  };
}

export function buildPublicOperationTargetRoute(
  input: PublicOperationTargetRouteInput,
): `/${string}` {
  return `${input.targetApiRoutePrefix}${buildPublicOperationRouteSuffix(input)}`;
}

export function buildPublicOperationRequestBody(
  input: PublicOperationRequestBodyInput,
): PublicOperationRequestEnvelope {
  return {
    input: input.input,
    ...(input.turnstileToken === undefined
      ? {}
      : {
          proof: {
            turnstileToken: input.turnstileToken,
          },
        }),
    ...(input.siteBlockId === undefined
      ? {}
      : {
          source: {
            siteBlockId: input.siteBlockId,
          },
        }),
    ...(input.idempotencyKey === undefined
      ? {}
      : {
          idempotencyKey: input.idempotencyKey,
        }),
  };
}

export async function submitPublicOperationJson<ResponseBody extends PublicOperationResponse>(
  input: SubmitPublicOperationJsonInput<ResponseBody>,
): Promise<ResponseBody> {
  const fetcher = input.fetcher ?? fetch;
  const response = await fetcher(input.route, {
    body: JSON.stringify(input.body),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const body = (await response.json()) as unknown;

  if (!response.ok) {
    throw new Error(
      publicOperationErrorMessage(body) ??
        input.submitErrorMessage ??
        "Public operation request failed.",
    );
  }

  if (!input.responseGuard(body)) {
    throw new Error(
      input.invalidResponseMessage ?? "Public operation request returned an invalid response.",
    );
  }

  return body;
}

export function publicOperationErrorMessage(value: unknown): string | undefined {
  return isRecord(value) && typeof value.error === "string" ? value.error : undefined;
}

export function isPublicOperationResponse(value: unknown): value is PublicOperationResponse {
  return (
    isPublicOperationCommandResponse(value) ||
    isPublicOperationCreateResponse(value) ||
    isPublicOperationListResponse(value)
  );
}

export function isPublicOperationCommandResponse(
  value: unknown,
): value is PublicOperationCommandResponse {
  return (
    hasPublicOperationResponseBasics(value, "command") &&
    isPublicOperationWriteResponseStatus(value.status) &&
    hasPublicOperationOutputBasics(value.output, "command")
  );
}

export function isPublicOperationCreateResponse(
  value: unknown,
): value is PublicOperationCreateResponse {
  return (
    hasPublicOperationResponseBasics(value, "create") &&
    isPublicOperationWriteResponseStatus(value.status) &&
    hasPublicOperationOutputBasics(value.output, "create") &&
    "record" in value.output
  );
}

export function isPublicOperationListResponse(
  value: unknown,
): value is PublicOperationListResponse {
  return (
    hasPublicOperationResponseBasics(value, "list") &&
    value.status === "accepted" &&
    value.output.type === "list" &&
    Array.isArray(value.output.records) &&
    value.output.records.every(isPublicOperationResultRow)
  );
}

export function createPublicOperationIdempotencyKey(
  input: PublicOperationIdempotencyKeyInput,
): string {
  const randomId =
    input.randomId ?? globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);

  return `${input.purpose}:${input.siteBlockId}:${randomId}`;
}

export function turnstileResponseTokenFromFormData(formData: FormData): string | undefined {
  for (const value of formData.getAll(TURNSTILE_RESPONSE_FIELD_NAME)) {
    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
  }

  return undefined;
}

export function encodePublicOperationRouteSegment(segment: string): string {
  assertNonEmptyRouteSegment(segment);

  return encodeURIComponent(segment);
}

export function decodePublicOperationRouteSegment(segment: string): string {
  let decoded: string;

  try {
    decoded = decodeURIComponent(segment);
  } catch {
    throw new PublicOperationRouteError(
      "invalid-escape",
      "Public operation route suffix segments must be valid URL path text.",
    );
  }

  assertNonEmptyRouteSegment(decoded);

  return decoded;
}

function assertNonEmptyRouteSegment(segment: string): void {
  if (segment.trim() === "") {
    throw new PublicOperationRouteError(
      "empty-segment",
      "Public operation route suffix entity and operation keys must be non-empty.",
    );
  }
}

function invalidShape(): PublicOperationRouteError {
  return new PublicOperationRouteError(
    "invalid-shape",
    "Public operation route suffix must use /public/operations/:entityKey/:operationKey.",
  );
}

function hasPublicOperationResponseBasics(
  value: unknown,
  kind: PublicOperationResponseOperation["kind"],
): value is {
  invocationId: string;
  operation: PublicOperationResponseOperation;
  output: Record<string, unknown>;
  status: PublicOperationResponseStatus;
} {
  return (
    isRecord(value) &&
    typeof value.invocationId === "string" &&
    (value.status === "accepted" || value.status === "committed" || value.status === "replayed") &&
    isRecord(value.operation) &&
    typeof value.operation.entityName === "string" &&
    typeof value.operation.operationName === "string" &&
    typeof value.operation.canonicalKey === "string" &&
    value.operation.kind === kind &&
    isRecord(value.output)
  );
}

function hasPublicOperationOutputBasics(
  output: Record<string, unknown>,
  type: "command" | "create",
): output is Record<string, unknown> & {
  affectedChangeIds: string[];
  cursor: number;
  type: "command" | "create";
} {
  return (
    output.type === type &&
    typeof output.cursor === "number" &&
    Array.isArray(output.affectedChangeIds) &&
    output.affectedChangeIds.every((changeId) => typeof changeId === "string") &&
    (!("changes" in output) || Array.isArray(output.changes))
  );
}

function isPublicOperationResultRow(value: unknown): value is PublicOperationResultRow {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (fieldValue) =>
        typeof fieldValue === "string" ||
        typeof fieldValue === "boolean" ||
        typeof fieldValue === "number",
    )
  );
}

function isPublicOperationWriteResponseStatus(
  value: PublicOperationResponseStatus,
): value is PublicOperationWriteResponseStatus {
  return value === "committed" || value === "replayed";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
