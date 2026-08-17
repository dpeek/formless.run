/**
 * Runtime-neutral recovery discovery and framed snapshot contracts.
 */

export const RECOVERY_DISCOVERY_KIND = "formless.recovery.discovery";
export const RECOVERY_DISCOVERY_PATH = "/api/formless/recovery";
export const RECOVERY_PROTOCOL_VERSION = 1;
export const RECOVERY_CAPTURE_PATH = "/api/formless/recovery/v1/snapshot";
export const RECOVERY_MEDIA_TYPE = "application/vnd.formless.recovery.v1";
export const RECOVERY_STREAM_MAGIC = "FRLSREC1";
export const RECOVERY_CAPTURE_KIND = "formless.recovery.capture";
export const RECOVERY_COMPLETION_KIND = "formless.recovery.completion";
export const RECOVERY_MAX_FRAME_HEADER_BYTES = 64 * 1024;
export const RECOVERY_FRAME_PREFIX_BYTES = 13;

export const RECOVERY_FRAME_KINDS = {
  captureHeader: 1,
  payload: 2,
  completion: 3,
} as const;

export const recoveryIncludedScopes = ["application"] as const;
export const recoveryExcludedScopes = ["security", "private-auth", "provider"] as const;

export type RecoveryIncludedScope = (typeof recoveryIncludedScopes)[number];
export type RecoveryExcludedScope = (typeof recoveryExcludedScopes)[number];
export type RecoveryFrameKind = (typeof RECOVERY_FRAME_KINDS)[keyof typeof RECOVERY_FRAME_KINDS];
export type RecoverySha256Digest = `sha256:${string}`;

export type RecoveryDiscoveryProtocol = {
  capturePath: string;
  mediaType: string;
  version: number;
};

export type RecoveryDiscovery = {
  kind: typeof RECOVERY_DISCOVERY_KIND;
  protocols: RecoveryDiscoveryProtocol[];
};

export const recoveryDiscoveryV1: RecoveryDiscovery = {
  kind: RECOVERY_DISCOVERY_KIND,
  protocols: [
    {
      capturePath: RECOVERY_CAPTURE_PATH,
      mediaType: RECOVERY_MEDIA_TYPE,
      version: RECOVERY_PROTOCOL_VERSION,
    },
  ],
};

export type RecoveryCaptureHeader = {
  captureId: string;
  capturedAt: string;
  excludedScopes: RecoveryExcludedScope[];
  formlessVersion: string;
  includedScopes: RecoveryIncludedScope[];
  kind: typeof RECOVERY_CAPTURE_KIND;
  nativePayloadFormat: string;
  nativePayloadVersion: number;
  sourceCursor: string;
  sourceOrigin: string;
  version: typeof RECOVERY_PROTOCOL_VERSION;
  workerVersion: string;
};

export type RecoveryPayloadFrameHeader = {
  id: string;
  kind: string;
};

export type RecoveryPayloadDescriptor = RecoveryPayloadFrameHeader & {
  byteLength: number;
  sha256: RecoverySha256Digest;
};

export type RecoveryCompletionFrameHeader = {
  kind: typeof RECOVERY_COMPLETION_KIND;
  rootSha256: RecoverySha256Digest;
  version: typeof RECOVERY_PROTOCOL_VERSION;
};

export type RecoveryCompletionReceipt = RecoveryCompletionFrameHeader & {
  payloads: RecoveryPayloadDescriptor[];
};

export type RecoveryByteSource =
  | AsyncIterable<Uint8Array>
  | Iterable<Uint8Array>
  | ReadableStream<Uint8Array>;

export type RecoveryPayloadInput = RecoveryPayloadFrameHeader & {
  byteLength: number;
  bytes: RecoveryByteSource;
};

export type RecoverySnapshotInput = {
  header: RecoveryCaptureHeader;
  payloads: AsyncIterable<RecoveryPayloadInput> | Iterable<RecoveryPayloadInput>;
};

export type RecoveryPayloadObservation = RecoveryPayloadFrameHeader & {
  byteLength: number;
};

export type RecoveryDecodeObserver = {
  onCaptureHeader?: (header: RecoveryCaptureHeader) => void | Promise<void>;
  onPayloadChunk?: (payload: RecoveryPayloadObservation, chunk: Uint8Array) => void | Promise<void>;
  onPayloadEnd?: (descriptor: RecoveryPayloadDescriptor) => void | Promise<void>;
  onPayloadStart?: (payload: RecoveryPayloadObservation) => void | Promise<void>;
};

export type RecoverySnapshotValidation = {
  header: RecoveryCaptureHeader;
  receipt: RecoveryCompletionReceipt;
};

export class RecoveryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecoveryValidationError";
  }
}

export function parseRecoveryDiscovery(value: unknown): RecoveryDiscovery {
  const object = parseObject("Recovery discovery", value);

  assertExactKeys("Recovery discovery", object, ["kind", "protocols"]);
  if (object.kind !== RECOVERY_DISCOVERY_KIND) {
    throw new RecoveryValidationError(
      `Recovery discovery kind must be "${RECOVERY_DISCOVERY_KIND}".`,
    );
  }
  if (!Array.isArray(object.protocols) || object.protocols.length === 0) {
    throw new RecoveryValidationError("Recovery discovery protocols must be a non-empty array.");
  }

  const versions = new Set<number>();
  const protocols = object.protocols.map((protocol, index) => {
    const context = `Recovery discovery protocols[${index}]`;
    const parsed = parseObject(context, protocol);

    assertExactKeys(context, parsed, ["capturePath", "mediaType", "version"]);
    const version = parsePositiveInteger(`${context} version`, parsed.version);
    if (versions.has(version)) {
      throw new RecoveryValidationError(`${context} version must be unique.`);
    }
    versions.add(version);

    return {
      capturePath: parseAbsolutePath(`${context} capturePath`, parsed.capturePath),
      mediaType: parseTrimmedString(`${context} mediaType`, parsed.mediaType),
      version,
    };
  });

  return { kind: RECOVERY_DISCOVERY_KIND, protocols };
}

export function formatRecoveryDiscovery(discovery: RecoveryDiscovery): string {
  return canonicalJsonStringify(parseRecoveryDiscovery(discovery));
}

export function recoverySha256Digest(bytes: Uint8Array): RecoverySha256Digest {
  const sha256 = new Sha256();
  sha256.update(bytes);
  return sha256.digest();
}

export function recoverySnapshotRootSha256(
  header: RecoveryCaptureHeader,
  payloads: readonly RecoveryPayloadDescriptor[],
): RecoverySha256Digest {
  const parsedHeader = parseRecoveryCaptureHeader(header);
  const parsedPayloads = payloads.map((payload, index) =>
    parseRecoveryPayloadDescriptor(`Recovery root payloads[${index}]`, payload),
  );

  return recoverySha256Digest(
    textEncoder.encode(canonicalJsonStringify({ header: parsedHeader, payloads: parsedPayloads })),
  );
}

export async function* encodeRecoverySnapshot(
  input: RecoverySnapshotInput,
): AsyncGenerator<Uint8Array> {
  const header = parseRecoveryCaptureHeader(input.header);
  const seenPayloadIds = new Set<string>();
  const descriptors: RecoveryPayloadDescriptor[] = [];

  yield textEncoder.encode(RECOVERY_STREAM_MAGIC);
  yield encodeFrameStart(RECOVERY_FRAME_KINDS.captureHeader, header, 0);

  for await (const payloadInput of input.payloads) {
    const payloadHeader = parseRecoveryPayloadFrameHeader("Recovery payload", {
      id: payloadInput.id,
      kind: payloadInput.kind,
    });
    const byteLength = parseByteLength("Recovery payload byteLength", payloadInput.byteLength);

    if (seenPayloadIds.has(payloadHeader.id)) {
      throw new RecoveryValidationError(
        `Recovery payload id "${payloadHeader.id}" must be unique.`,
      );
    }
    seenPayloadIds.add(payloadHeader.id);

    yield encodeFrameStart(RECOVERY_FRAME_KINDS.payload, payloadHeader, byteLength);

    const sha256 = new Sha256();
    let received = 0;
    for await (const chunk of recoveryByteChunks(payloadInput.bytes)) {
      if (received + chunk.byteLength > byteLength) {
        throw new RecoveryValidationError(
          `Recovery payload "${payloadHeader.id}" exceeds its declared byte length.`,
        );
      }
      if (chunk.byteLength === 0) {
        continue;
      }
      received += chunk.byteLength;
      sha256.update(chunk);
      yield chunk;
    }

    if (received !== byteLength) {
      throw new RecoveryValidationError(
        `Recovery payload "${payloadHeader.id}" ended at ${received} bytes; expected ${byteLength}.`,
      );
    }

    descriptors.push({
      ...payloadHeader,
      byteLength,
      sha256: sha256.digest(),
    });
  }

  if (descriptors.length === 0) {
    throw new RecoveryValidationError("Recovery snapshot must contain at least one payload.");
  }

  const completion: RecoveryCompletionFrameHeader = {
    kind: RECOVERY_COMPLETION_KIND,
    rootSha256: recoverySnapshotRootSha256(header, descriptors),
    version: RECOVERY_PROTOCOL_VERSION,
  };

  yield encodeFrameStart(RECOVERY_FRAME_KINDS.completion, completion, 0);
}

export async function decodeRecoverySnapshot(
  source: RecoveryByteSource,
  observer: RecoveryDecodeObserver = {},
): Promise<RecoverySnapshotValidation> {
  const reader = new RecoveryByteReader(recoveryByteChunks(source));
  try {
    return await decodeRecoverySnapshotFromReader(reader, observer);
  } finally {
    await reader.close().catch(() => undefined);
  }
}

async function decodeRecoverySnapshotFromReader(
  reader: RecoveryByteReader,
  observer: RecoveryDecodeObserver,
): Promise<RecoverySnapshotValidation> {
  const magic = await reader.readExactly(RECOVERY_STREAM_MAGIC.length, "Recovery stream magic");

  if (!bytesEqual(magic, textEncoder.encode(RECOVERY_STREAM_MAGIC))) {
    throw new RecoveryValidationError(`Recovery stream magic must be "${RECOVERY_STREAM_MAGIC}".`);
  }

  const firstFrame = await readFrameStart(reader, "Recovery capture header frame");
  if (firstFrame.kind !== RECOVERY_FRAME_KINDS.captureHeader) {
    throw new RecoveryValidationError("Recovery capture header must be the first frame.");
  }
  if (firstFrame.payloadLength !== 0) {
    throw new RecoveryValidationError("Recovery capture header frame must not have payload bytes.");
  }

  const header = parseRecoveryCaptureHeader(firstFrame.header);
  await observer.onCaptureHeader?.(header);

  const seenPayloadIds = new Set<string>();
  const descriptors: RecoveryPayloadDescriptor[] = [];

  while (true) {
    const frame = await readOptionalFrameStart(reader);
    if (frame === undefined) {
      throw new RecoveryValidationError("Recovery stream is missing its completion receipt.");
    }

    if (frame.kind === RECOVERY_FRAME_KINDS.captureHeader) {
      throw new RecoveryValidationError("Recovery capture header may appear only once.");
    }

    if (frame.kind === RECOVERY_FRAME_KINDS.payload) {
      const payloadHeader = parseRecoveryPayloadFrameHeader("Recovery payload frame", frame.header);
      if (seenPayloadIds.has(payloadHeader.id)) {
        throw new RecoveryValidationError(
          `Recovery payload id "${payloadHeader.id}" must be unique.`,
        );
      }
      seenPayloadIds.add(payloadHeader.id);

      const payload = { ...payloadHeader, byteLength: frame.payloadLength };
      await observer.onPayloadStart?.(payload);

      const sha256 = new Sha256();
      await reader.readPayload(
        frame.payloadLength,
        `Recovery payload "${payloadHeader.id}"`,
        async (chunk) => {
          sha256.update(chunk);
          await observer.onPayloadChunk?.(payload, chunk);
        },
      );

      const descriptor = {
        ...payload,
        sha256: sha256.digest(),
      } satisfies RecoveryPayloadDescriptor;
      descriptors.push(descriptor);
      await observer.onPayloadEnd?.(descriptor);
      continue;
    }

    if (frame.kind !== RECOVERY_FRAME_KINDS.completion) {
      throw new RecoveryValidationError(`Recovery frame kind ${frame.kind} is not supported.`);
    }
    if (frame.payloadLength !== 0) {
      throw new RecoveryValidationError("Recovery completion frame must not have payload bytes.");
    }
    if (descriptors.length === 0) {
      throw new RecoveryValidationError("Recovery completion must follow at least one payload.");
    }

    const completion = parseRecoveryCompletionFrameHeader(frame.header);

    const expectedRoot = recoverySnapshotRootSha256(header, descriptors);
    if (completion.rootSha256 !== expectedRoot) {
      throw new RecoveryValidationError("Recovery completion whole-snapshot root does not match.");
    }
    if (await reader.hasBytes()) {
      throw new RecoveryValidationError("Recovery stream has trailing bytes after completion.");
    }

    return { header, receipt: { ...completion, payloads: descriptors } };
  }
}

function parseRecoveryCaptureHeader(value: unknown): RecoveryCaptureHeader {
  const context = "Recovery capture header";
  const object = parseObject(context, value);

  assertExactKeys(context, object, [
    "captureId",
    "capturedAt",
    "excludedScopes",
    "formlessVersion",
    "includedScopes",
    "kind",
    "nativePayloadFormat",
    "nativePayloadVersion",
    "sourceCursor",
    "sourceOrigin",
    "version",
    "workerVersion",
  ]);
  if (object.kind !== RECOVERY_CAPTURE_KIND) {
    throw new RecoveryValidationError(`${context} kind must be "${RECOVERY_CAPTURE_KIND}".`);
  }
  if (object.version !== RECOVERY_PROTOCOL_VERSION) {
    throw new RecoveryValidationError(`${context} version must be ${RECOVERY_PROTOCOL_VERSION}.`);
  }

  return {
    captureId: parseTrimmedString(`${context} captureId`, object.captureId),
    capturedAt: parseIsoTimestamp(`${context} capturedAt`, object.capturedAt),
    excludedScopes: parseExactStringArray(
      `${context} excludedScopes`,
      object.excludedScopes,
      recoveryExcludedScopes,
    ),
    formlessVersion: parseTrimmedString(`${context} formlessVersion`, object.formlessVersion),
    includedScopes: parseExactStringArray(
      `${context} includedScopes`,
      object.includedScopes,
      recoveryIncludedScopes,
    ),
    kind: RECOVERY_CAPTURE_KIND,
    nativePayloadFormat: parseTrimmedString(
      `${context} nativePayloadFormat`,
      object.nativePayloadFormat,
    ),
    nativePayloadVersion: parsePositiveInteger(
      `${context} nativePayloadVersion`,
      object.nativePayloadVersion,
    ),
    sourceCursor: parseTrimmedString(`${context} sourceCursor`, object.sourceCursor),
    sourceOrigin: parseOrigin(`${context} sourceOrigin`, object.sourceOrigin),
    version: RECOVERY_PROTOCOL_VERSION,
    workerVersion: parseTrimmedString(`${context} workerVersion`, object.workerVersion),
  };
}

function parseRecoveryPayloadFrameHeader(
  context: string,
  value: unknown,
): RecoveryPayloadFrameHeader {
  const object = parseObject(context, value);
  assertExactKeys(context, object, ["id", "kind"]);

  return {
    id: parseTrimmedString(`${context} id`, object.id),
    kind: parseTrimmedString(`${context} kind`, object.kind),
  };
}

function parseRecoveryPayloadDescriptor(
  context: string,
  value: unknown,
): RecoveryPayloadDescriptor {
  const object = parseObject(context, value);
  assertExactKeys(context, object, ["byteLength", "id", "kind", "sha256"]);

  return {
    byteLength: parseByteLength(`${context} byteLength`, object.byteLength),
    id: parseTrimmedString(`${context} id`, object.id),
    kind: parseTrimmedString(`${context} kind`, object.kind),
    sha256: parseSha256Digest(`${context} sha256`, object.sha256),
  };
}

function parseRecoveryCompletionFrameHeader(value: unknown): RecoveryCompletionFrameHeader {
  const context = "Recovery completion frame header";
  const object = parseObject(context, value);
  assertExactKeys(context, object, ["kind", "rootSha256", "version"]);
  if (object.kind !== RECOVERY_COMPLETION_KIND) {
    throw new RecoveryValidationError(`${context} kind must be "${RECOVERY_COMPLETION_KIND}".`);
  }
  if (object.version !== RECOVERY_PROTOCOL_VERSION) {
    throw new RecoveryValidationError(`${context} version must be ${RECOVERY_PROTOCOL_VERSION}.`);
  }
  return {
    kind: RECOVERY_COMPLETION_KIND,
    rootSha256: parseSha256Digest(`${context} rootSha256`, object.rootSha256),
    version: RECOVERY_PROTOCOL_VERSION,
  };
}

function encodeFrameStart(
  kind: RecoveryFrameKind,
  header: unknown,
  payloadLength: number,
): Uint8Array {
  const headerBytes = textEncoder.encode(canonicalJsonStringify(header));
  if (headerBytes.byteLength === 0 || headerBytes.byteLength > RECOVERY_MAX_FRAME_HEADER_BYTES) {
    throw new RecoveryValidationError(
      `Recovery frame header must be between 1 and ${RECOVERY_MAX_FRAME_HEADER_BYTES} bytes.`,
    );
  }

  const prefix = new Uint8Array(RECOVERY_FRAME_PREFIX_BYTES + headerBytes.byteLength);
  const view = new DataView(prefix.buffer, prefix.byteOffset, prefix.byteLength);
  view.setUint8(0, kind);
  view.setUint32(1, headerBytes.byteLength, false);
  view.setBigUint64(
    5,
    BigInt(parseByteLength("Recovery frame payload length", payloadLength)),
    false,
  );
  prefix.set(headerBytes, RECOVERY_FRAME_PREFIX_BYTES);
  return prefix;
}

type DecodedFrameStart = {
  header: unknown;
  kind: number;
  payloadLength: number;
};

async function readOptionalFrameStart(
  reader: RecoveryByteReader,
): Promise<DecodedFrameStart | undefined> {
  const prefix = await reader.readExactlyOrEnd(
    RECOVERY_FRAME_PREFIX_BYTES,
    "Recovery frame prefix",
  );
  if (prefix === undefined) {
    return undefined;
  }

  return decodeFrameStart(reader, prefix, "Recovery frame");
}

async function readFrameStart(
  reader: RecoveryByteReader,
  context: string,
): Promise<DecodedFrameStart> {
  const prefix = await reader.readExactly(RECOVERY_FRAME_PREFIX_BYTES, `${context} prefix`);
  return decodeFrameStart(reader, prefix, context);
}

async function decodeFrameStart(
  reader: RecoveryByteReader,
  prefix: Uint8Array,
  context: string,
): Promise<DecodedFrameStart> {
  const view = new DataView(prefix.buffer, prefix.byteOffset, prefix.byteLength);
  const kind = view.getUint8(0);
  const headerLength = view.getUint32(1, false);
  const payloadLengthValue = view.getBigUint64(5, false);

  if (headerLength === 0 || headerLength > RECOVERY_MAX_FRAME_HEADER_BYTES) {
    throw new RecoveryValidationError(
      `${context} header length must be between 1 and ${RECOVERY_MAX_FRAME_HEADER_BYTES} bytes.`,
    );
  }
  if (payloadLengthValue > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RecoveryValidationError(`${context} payload length exceeds the supported bound.`);
  }

  const headerBytes = await reader.readExactly(headerLength, `${context} header`);
  return {
    header: parseCanonicalJsonHeader(headerBytes, `${context} header`),
    kind,
    payloadLength: Number(payloadLengthValue),
  };
}

function parseCanonicalJsonHeader(bytes: Uint8Array, context: string): unknown {
  let text: string;
  try {
    text = textDecoder.decode(bytes);
  } catch {
    throw new RecoveryValidationError(`${context} must be valid UTF-8.`);
  }

  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new RecoveryValidationError(`${context} must be valid JSON.`);
  }

  if (canonicalJsonStringify(value) !== text) {
    throw new RecoveryValidationError(`${context} must use canonical JSON.`);
  }
  return value;
}

async function* recoveryByteChunks(source: RecoveryByteSource): AsyncGenerator<Uint8Array> {
  if (isReadableStream(source)) {
    const reader = source.getReader();
    let completed = false;
    try {
      while (true) {
        const result = await reader.read();
        if (result.done) {
          completed = true;
          return;
        }
        yield parseByteChunk(result.value);
      }
    } finally {
      if (!completed) {
        await reader.cancel().catch(() => undefined);
      }
      reader.releaseLock();
    }
  }

  if (Symbol.asyncIterator in source) {
    for await (const chunk of source) {
      yield parseByteChunk(chunk);
    }
    return;
  }

  for (const chunk of source) {
    yield parseByteChunk(chunk);
  }
}

function isReadableStream(source: RecoveryByteSource): source is ReadableStream<Uint8Array> {
  return typeof (source as ReadableStream<Uint8Array>).getReader === "function";
}

function parseByteChunk(value: unknown): Uint8Array {
  if (!(value instanceof Uint8Array)) {
    throw new RecoveryValidationError("Recovery byte source must yield Uint8Array chunks.");
  }
  return value;
}

class RecoveryByteReader {
  readonly #iterator: AsyncIterator<Uint8Array>;
  #buffer: Uint8Array = new Uint8Array();
  #offset = 0;
  #ended = false;

  constructor(source: AsyncIterable<Uint8Array>) {
    this.#iterator = source[Symbol.asyncIterator]();
  }

  async readExactly(length: number, context: string): Promise<Uint8Array> {
    const value = await this.readExactlyOrEnd(length, context);
    if (value === undefined) {
      throw new RecoveryValidationError(`${context} is missing.`);
    }
    return value;
  }

  async readExactlyOrEnd(length: number, context: string): Promise<Uint8Array | undefined> {
    const output = new Uint8Array(length);
    let written = 0;

    while (written < length) {
      if (!(await this.#ensureBytes())) {
        if (written === 0) {
          return undefined;
        }
        throw new RecoveryValidationError(`${context} is truncated.`);
      }

      const available = this.#buffer.byteLength - this.#offset;
      const take = Math.min(available, length - written);
      output.set(this.#buffer.subarray(this.#offset, this.#offset + take), written);
      this.#offset += take;
      written += take;
    }

    return output;
  }

  async readPayload(
    length: number,
    context: string,
    visit: (chunk: Uint8Array) => void | Promise<void>,
  ): Promise<void> {
    let remaining = length;
    while (remaining > 0) {
      if (!(await this.#ensureBytes())) {
        throw new RecoveryValidationError(`${context} is truncated.`);
      }

      const available = this.#buffer.byteLength - this.#offset;
      const take = Math.min(available, remaining);
      const chunk = this.#buffer.subarray(this.#offset, this.#offset + take);
      this.#offset += take;
      remaining -= take;
      await visit(chunk);
    }
  }

  async hasBytes(): Promise<boolean> {
    return this.#ensureBytes();
  }

  async close(): Promise<void> {
    this.#ended = true;
    await this.#iterator.return?.();
  }

  async #ensureBytes(): Promise<boolean> {
    while (this.#offset === this.#buffer.byteLength && !this.#ended) {
      const result = await this.#iterator.next();
      if (result.done) {
        this.#ended = true;
        this.#buffer = new Uint8Array();
        this.#offset = 0;
        break;
      }
      this.#buffer = result.value;
      this.#offset = 0;
    }

    return this.#offset < this.#buffer.byteLength;
  }
}

function parseObject(context: string, value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RecoveryValidationError(`${context} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(
  context: string,
  value: Record<string, unknown>,
  expected: readonly string[],
): void {
  const actual = Object.keys(value).sort(compareOrdinalStrings);
  const canonicalExpected = [...expected].sort(compareOrdinalStrings);
  if (
    actual.length !== canonicalExpected.length ||
    actual.some((key, index) => key !== canonicalExpected[index])
  ) {
    throw new RecoveryValidationError(`${context} fields must be exact.`);
  }
}

function parseTrimmedString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "" || value !== value.trim()) {
    throw new RecoveryValidationError(`${context} must be a non-empty trimmed string.`);
  }
  return value;
}

function parseAbsolutePath(context: string, value: unknown): string {
  const parsed = parseTrimmedString(context, value);
  if (!parsed.startsWith("/") || parsed.startsWith("//")) {
    throw new RecoveryValidationError(`${context} must be an absolute URL path.`);
  }
  return parsed;
}

function parsePositiveInteger(context: string, value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new RecoveryValidationError(`${context} must be a positive safe integer.`);
  }
  return value as number;
}

function parseByteLength(context: string, value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new RecoveryValidationError(`${context} must be a non-negative safe integer.`);
  }
  return value as number;
}

function parseIsoTimestamp(context: string, value: unknown): string {
  const parsed = parseTrimmedString(context, value);
  if (Number.isNaN(Date.parse(parsed)) || new Date(parsed).toISOString() !== parsed) {
    throw new RecoveryValidationError(`${context} must be a canonical ISO timestamp.`);
  }
  return parsed;
}

function parseOrigin(context: string, value: unknown): string {
  const parsed = parseTrimmedString(context, value);
  try {
    const url = new URL(parsed);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.origin !== parsed) {
      throw new Error();
    }
  } catch {
    throw new RecoveryValidationError(`${context} must be an HTTP origin.`);
  }
  return parsed;
}

function parseExactStringArray<const Expected extends readonly string[]>(
  context: string,
  value: unknown,
  expected: Expected,
): [...Expected] {
  if (
    !Array.isArray(value) ||
    value.length !== expected.length ||
    value.some((child, index) => child !== expected[index])
  ) {
    throw new RecoveryValidationError(`${context} must equal ${JSON.stringify(expected)}.`);
  }
  return [...expected];
}

function parseSha256Digest(context: string, value: unknown): RecoverySha256Digest {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new RecoveryValidationError(
      `${context} must use "sha256:" followed by 64 lowercase hexadecimal characters.`,
    );
  }
  return value as RecoverySha256Digest;
}

function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(canonicalizeJsonValue(value));
}

function canonicalizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJsonValue);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => compareOrdinalStrings(left, right))
      .map(([key, child]) => [key, canonicalizeJsonValue(child)]),
  );
}

function compareOrdinalStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });

const sha256RoundConstants = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

class Sha256 {
  readonly #state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  readonly #buffer = new Uint8Array(64);
  #bufferLength = 0;
  #bytesHashed = 0;
  #finished = false;

  update(bytes: Uint8Array): void {
    if (this.#finished) {
      throw new RecoveryValidationError("Recovery SHA-256 digest is already complete.");
    }
    if (this.#bytesHashed + bytes.byteLength > Number.MAX_SAFE_INTEGER) {
      throw new RecoveryValidationError("Recovery SHA-256 input exceeds the supported bound.");
    }
    this.#bytesHashed += bytes.byteLength;

    let offset = 0;
    while (offset < bytes.byteLength) {
      const take = Math.min(64 - this.#bufferLength, bytes.byteLength - offset);
      this.#buffer.set(bytes.subarray(offset, offset + take), this.#bufferLength);
      this.#bufferLength += take;
      offset += take;

      if (this.#bufferLength === 64) {
        this.#processBlock(this.#buffer);
        this.#bufferLength = 0;
      }
    }
  }

  digest(): RecoverySha256Digest {
    if (this.#finished) {
      throw new RecoveryValidationError("Recovery SHA-256 digest is already complete.");
    }
    this.#finished = true;

    this.#buffer[this.#bufferLength] = 0x80;
    this.#bufferLength += 1;
    if (this.#bufferLength > 56) {
      this.#buffer.fill(0, this.#bufferLength);
      this.#processBlock(this.#buffer);
      this.#bufferLength = 0;
    }
    this.#buffer.fill(0, this.#bufferLength, 56);
    new DataView(this.#buffer.buffer).setBigUint64(56, BigInt(this.#bytesHashed) * 8n, false);
    this.#processBlock(this.#buffer);

    const digest = new Uint8Array(32);
    const view = new DataView(digest.buffer);
    for (const [index, word] of this.#state.entries()) {
      view.setUint32(index * 4, word, false);
    }

    return `sha256:${[...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }

  #processBlock(block: Uint8Array): void {
    const words = new Uint32Array(64);
    const view = new DataView(block.buffer, block.byteOffset, block.byteLength);
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(index * 4, false);
    }
    for (let index = 16; index < 64; index += 1) {
      const word15 = words[index - 15] ?? 0;
      const word2 = words[index - 2] ?? 0;
      const sigma0 = rotateRight(word15, 7) ^ rotateRight(word15, 18) ^ (word15 >>> 3);
      const sigma1 = rotateRight(word2, 17) ^ rotateRight(word2, 19) ^ (word2 >>> 10);
      words[index] = ((words[index - 16] ?? 0) + sigma0 + (words[index - 7] ?? 0) + sigma1) >>> 0;
    }

    let a = this.#state[0] ?? 0;
    let b = this.#state[1] ?? 0;
    let c = this.#state[2] ?? 0;
    let d = this.#state[3] ?? 0;
    let e = this.#state[4] ?? 0;
    let f = this.#state[5] ?? 0;
    let g = this.#state[6] ?? 0;
    let h = this.#state[7] ?? 0;

    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temporary1 =
        (h + sum1 + choice + (sha256RoundConstants[index] ?? 0) + (words[index] ?? 0)) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }

    this.#state[0] = ((this.#state[0] ?? 0) + a) >>> 0;
    this.#state[1] = ((this.#state[1] ?? 0) + b) >>> 0;
    this.#state[2] = ((this.#state[2] ?? 0) + c) >>> 0;
    this.#state[3] = ((this.#state[3] ?? 0) + d) >>> 0;
    this.#state[4] = ((this.#state[4] ?? 0) + e) >>> 0;
    this.#state[5] = ((this.#state[5] ?? 0) + f) >>> 0;
    this.#state[6] = ((this.#state[6] ?? 0) + g) >>> 0;
    this.#state[7] = ((this.#state[7] ?? 0) + h) >>> 0;
  }
}

function rotateRight(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount));
}
