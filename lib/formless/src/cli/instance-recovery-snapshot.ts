import {
  RECOVERY_DISCOVERY_PATH,
  RECOVERY_MEDIA_TYPE,
  RECOVERY_PROTOCOL_VERSION,
  RecoveryValidationError,
  parseRecoveryDiscovery,
  type RecoveryByteSource,
  type RecoveryExcludedScope,
  type RecoveryIncludedScope,
} from "@dpeek/formless-archive/recovery";
import {
  persistRecoverySnapshot,
  type PersistRecoverySnapshotResult,
} from "@dpeek/formless-archive/recovery/node";

export type ResolvedRecoverySnapshotTarget = {
  id: string;
  origin: string;
  provider: string;
};

export type CaptureRecoverySnapshotInput = {
  adminBearer: string;
  outputPath: string;
  target: ResolvedRecoverySnapshotTarget;
};

export type RecoverySnapshotFilesystem = {
  persistRecoverySnapshot: (input: {
    expectedSourceOrigin: string;
    outputPath: string;
    source: RecoveryByteSource;
  }) => Promise<PersistRecoverySnapshotResult>;
};

export type RecoverySnapshotCaptureProgress = {
  at: string;
  phase: "capture" | "discovery";
  status: "completed" | "started";
  byteLength?: number;
  payloadCount?: number;
  protocolVersion?: number;
};

export type CaptureRecoverySnapshotDependencies = {
  fetch: typeof fetch;
  filesystem: RecoverySnapshotFilesystem;
  now: () => string;
  progress: (event: RecoverySnapshotCaptureProgress) => void;
};

export type RecoverySnapshotCaptureEvidence = {
  byteLength: number;
  captureId: string;
  capturedAt: string;
  excludedScopes: RecoveryExcludedScope[];
  formlessVersion: string;
  includedScopes: RecoveryIncludedScope[];
  nativePayloadFormat: string;
  nativePayloadVersion: number;
  payloadByteLength: number;
  payloadCount: number;
  protocolVersion: number;
  sourceCursor: string;
  workerVersion: string;
};

export type RecoverySnapshotDisplayReceipt = {
  byteLength: number;
  payloadCount: number;
  rootSha256: `sha256:${string}`;
  version: number;
};

export type CaptureRecoverySnapshotResult = {
  evidence: RecoverySnapshotCaptureEvidence;
  outputPath: string;
  progress: RecoverySnapshotCaptureProgress[];
  receipt: RecoverySnapshotDisplayReceipt;
  target: ResolvedRecoverySnapshotTarget;
};

export type RecoverySnapshotCaptureErrorCode =
  | "authorization-failed"
  | "capture-unavailable"
  | "discovery-unavailable"
  | "invalid-input"
  | "protocol-unavailable"
  | "publication-failed"
  | "snapshot-invalid"
  | "source-changed"
  | "transport-interrupted";

export class RecoverySnapshotCaptureError extends Error {
  readonly code: RecoverySnapshotCaptureErrorCode;
  readonly httpStatus?: number;
  readonly phase: "capture" | "discovery" | "input" | "publication";

  constructor(input: {
    code: RecoverySnapshotCaptureErrorCode;
    httpStatus?: number;
    message: string;
    phase: RecoverySnapshotCaptureError["phase"];
  }) {
    super(input.message);
    this.name = "RecoverySnapshotCaptureError";
    this.code = input.code;
    this.phase = input.phase;
    if (input.httpStatus !== undefined) {
      this.httpStatus = input.httpStatus;
    }
  }
}

export const recoverySnapshotNodeFilesystem = {
  persistRecoverySnapshot,
} satisfies RecoverySnapshotFilesystem;

export async function captureRecoverySnapshot(
  input: CaptureRecoverySnapshotInput,
  dependencies: CaptureRecoverySnapshotDependencies,
): Promise<CaptureRecoverySnapshotResult> {
  const captureInput = parseCaptureInput(input);
  const progress: RecoverySnapshotCaptureProgress[] = [];
  emitProgress(progress, dependencies, { phase: "discovery", status: "started" });

  const discovery = await discoverRecoveryProtocol(captureInput, dependencies.fetch);
  const protocol = discovery.protocols.find(
    (candidate) =>
      candidate.version === RECOVERY_PROTOCOL_VERSION &&
      normalizeMediaType(candidate.mediaType) === RECOVERY_MEDIA_TYPE,
  );

  if (!protocol) {
    throw captureError(
      "protocol-unavailable",
      "discovery",
      "The target does not offer a supported recovery snapshot protocol.",
    );
  }

  emitProgress(progress, dependencies, {
    phase: "discovery",
    protocolVersion: protocol.version,
    status: "completed",
  });
  emitProgress(progress, dependencies, {
    phase: "capture",
    protocolVersion: protocol.version,
    status: "started",
  });

  const response = await requestRecoveryCapture(
    captureInput,
    protocol.capturePath,
    dependencies.fetch,
  );
  const body = response.body;
  if (!body) {
    throw captureError(
      "capture-unavailable",
      "capture",
      "The target returned no recovery snapshot stream.",
      response.status,
    );
  }

  let persisted: PersistRecoverySnapshotResult;
  try {
    persisted = await dependencies.filesystem.persistRecoverySnapshot({
      expectedSourceOrigin: captureInput.target.origin,
      outputPath: captureInput.outputPath,
      source: classifyTransportFailures(body),
    });
  } catch (error) {
    await body.cancel().catch(() => undefined);

    if (error instanceof RecoverySnapshotTransportError) {
      throw captureError(
        "transport-interrupted",
        "capture",
        "The recovery snapshot transport was interrupted.",
      );
    }
    if (error instanceof RecoveryValidationError) {
      throw captureError(
        "snapshot-invalid",
        "capture",
        "The target returned an invalid or incomplete recovery snapshot.",
      );
    }
    throw captureError(
      "publication-failed",
      "publication",
      "The recovery snapshot could not be published.",
    );
  }

  const payloadByteLength = persisted.receipt.payloads.reduce(
    (total, payload) => total + payload.byteLength,
    0,
  );
  emitProgress(progress, dependencies, {
    byteLength: persisted.byteLength,
    payloadCount: persisted.receipt.payloads.length,
    phase: "capture",
    protocolVersion: protocol.version,
    status: "completed",
  });

  return {
    evidence: {
      byteLength: persisted.byteLength,
      captureId: persisted.header.captureId,
      capturedAt: persisted.header.capturedAt,
      excludedScopes: [...persisted.header.excludedScopes],
      formlessVersion: persisted.header.formlessVersion,
      includedScopes: [...persisted.header.includedScopes],
      nativePayloadFormat: persisted.header.nativePayloadFormat,
      nativePayloadVersion: persisted.header.nativePayloadVersion,
      payloadByteLength,
      payloadCount: persisted.receipt.payloads.length,
      protocolVersion: protocol.version,
      sourceCursor: persisted.header.sourceCursor,
      workerVersion: persisted.header.workerVersion,
    },
    outputPath: persisted.outputPath,
    progress,
    receipt: {
      byteLength: persisted.byteLength,
      payloadCount: persisted.receipt.payloads.length,
      rootSha256: persisted.receipt.rootSha256,
      version: persisted.receipt.version,
    },
    target: captureInput.target,
  };
}

function parseCaptureInput(input: CaptureRecoverySnapshotInput): CaptureRecoverySnapshotInput {
  const id = parseDisplayString(input.target.id);
  const provider = parseDisplayString(input.target.provider);
  const outputPath = parseDisplayString(input.outputPath);
  const adminBearer = parseSecret(input.adminBearer);
  let origin: string;

  try {
    const url = new URL(input.target.origin);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username !== "" ||
      url.password !== "" ||
      url.pathname !== "/" ||
      url.search !== "" ||
      url.hash !== ""
    ) {
      throw new Error();
    }
    origin = url.origin;
  } catch {
    throw captureError("invalid-input", "input", "Recovery target input is invalid.");
  }

  if (!id || !provider || !outputPath || !adminBearer) {
    throw captureError("invalid-input", "input", "Recovery capture input is incomplete.");
  }

  return {
    adminBearer,
    outputPath,
    target: { id, origin, provider },
  };
}

async function discoverRecoveryProtocol(
  input: CaptureRecoverySnapshotInput,
  fetcher: typeof fetch,
) {
  const url = new URL(RECOVERY_DISCOVERY_PATH, input.target.origin);
  let response: Response;

  try {
    response = await fetcher(url, {
      headers: recoveryRequestHeaders(input.adminBearer, "application/json"),
      method: "GET",
      redirect: "error",
    });
  } catch {
    throw captureError(
      "discovery-unavailable",
      "discovery",
      "Recovery snapshot discovery is unavailable.",
    );
  }

  if (!response.ok) {
    await discardResponse(response);
    if (response.status === 401 || response.status === 403) {
      throw captureError(
        "authorization-failed",
        "discovery",
        "Recovery snapshot authorization failed.",
        response.status,
      );
    }
    throw captureError(
      "discovery-unavailable",
      "discovery",
      "Recovery snapshot discovery is unavailable.",
      response.status,
    );
  }

  try {
    return parseRecoveryDiscovery(await response.json());
  } catch {
    throw captureError(
      "discovery-unavailable",
      "discovery",
      "Recovery snapshot discovery is invalid.",
      response.status,
    );
  }
}

async function requestRecoveryCapture(
  input: CaptureRecoverySnapshotInput,
  capturePath: string,
  fetcher: typeof fetch,
): Promise<Response> {
  const url = new URL(capturePath, input.target.origin);
  let response: Response;

  try {
    response = await fetcher(url, {
      headers: recoveryRequestHeaders(input.adminBearer, RECOVERY_MEDIA_TYPE),
      method: "POST",
      redirect: "error",
    });
  } catch {
    throw captureError(
      "capture-unavailable",
      "capture",
      "Recovery snapshot capture is unavailable.",
    );
  }

  if (!response.ok) {
    await discardResponse(response);
    if (response.status === 401 || response.status === 403) {
      throw captureError(
        "authorization-failed",
        "capture",
        "Recovery snapshot authorization failed.",
        response.status,
      );
    }
    if (response.status === 409) {
      throw captureError(
        "source-changed",
        "capture",
        "The recovery snapshot source changed during capture.",
        response.status,
      );
    }
    throw captureError(
      "capture-unavailable",
      "capture",
      "Recovery snapshot capture is unavailable.",
      response.status,
    );
  }

  if (normalizeMediaType(response.headers.get("content-type")) !== RECOVERY_MEDIA_TYPE) {
    await discardResponse(response);
    throw captureError(
      "capture-unavailable",
      "capture",
      "The target returned an unsupported recovery snapshot media type.",
      response.status,
    );
  }

  return response;
}

async function* classifyTransportFailures(
  source: ReadableStream<Uint8Array>,
): AsyncGenerator<Uint8Array> {
  const reader = source.getReader();
  let completed = false;
  try {
    while (true) {
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await reader.read();
      } catch {
        throw new RecoverySnapshotTransportError();
      }
      if (result.done) {
        completed = true;
        return;
      }
      yield result.value;
    }
  } finally {
    if (!completed) {
      await reader.cancel().catch(() => undefined);
    }
    reader.releaseLock();
  }
}

class RecoverySnapshotTransportError extends Error {}

function recoveryRequestHeaders(adminBearer: string, accept: string): Headers {
  return new Headers({
    accept,
    authorization: `Bearer ${adminBearer}`,
  });
}

function normalizeMediaType(value: string | null): string {
  return value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

async function discardResponse(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

function emitProgress(
  progress: RecoverySnapshotCaptureProgress[],
  dependencies: Pick<CaptureRecoverySnapshotDependencies, "now" | "progress">,
  event: Omit<RecoverySnapshotCaptureProgress, "at">,
): void {
  const next = { ...event, at: dependencies.now() };
  progress.push(next);
  try {
    dependencies.progress(next);
  } catch {
    // Progress is observational and cannot invalidate an otherwise complete capture.
  }
}

function parseDisplayString(value: string): string | undefined {
  return typeof value === "string" && value.trim() !== "" && value === value.trim()
    ? value
    : undefined;
}

function parseSecret(value: string): string | undefined {
  return parseDisplayString(value);
}

function captureError(
  code: RecoverySnapshotCaptureErrorCode,
  phase: RecoverySnapshotCaptureError["phase"],
  message: string,
  httpStatus?: number,
): RecoverySnapshotCaptureError {
  return new RecoverySnapshotCaptureError({ code, httpStatus, message, phase });
}
