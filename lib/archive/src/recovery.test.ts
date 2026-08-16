import { describe, expect, it } from "vite-plus/test";

import {
  RECOVERY_GOLDEN_V1_HEX,
  recoveryGoldenHeader,
  recoveryGoldenPayloads,
} from "./recovery-fixtures.ts";
import {
  RECOVERY_FRAME_KINDS,
  RECOVERY_FRAME_PREFIX_BYTES,
  RECOVERY_MAX_FRAME_HEADER_BYTES,
  RECOVERY_STREAM_MAGIC,
  decodeRecoverySnapshot,
  encodeRecoverySnapshot,
  formatRecoveryDiscovery,
  parseRecoveryDiscovery,
  recoveryDiscoveryV1,
  recoverySha256Digest,
  type RecoveryByteSource,
  type RecoveryPayloadInput,
} from "./recovery.ts";

describe("recovery snapshot version one", () => {
  it("freezes canonical framing, descriptor digests, and the whole-snapshot root", async () => {
    const bytes = await encodeGoldenSnapshot();
    const payloadChunks: number[] = [];
    const validation = await decodeRecoverySnapshot(oneByteChunks(bytes), {
      onPayloadChunk: (_payload, chunk) => {
        payloadChunks.push(chunk.byteLength);
      },
    });

    expect(toHex(bytes)).toBe(RECOVERY_GOLDEN_V1_HEX);
    expect(payloadChunks).toEqual(Array(23).fill(1));
    expect(validation).toEqual({
      header: recoveryGoldenHeader,
      receipt: {
        kind: "formless.recovery.completion",
        payloads: [
          {
            byteLength: 5,
            id: "program:active",
            kind: "program",
            sha256: "sha256:0150a92bb1212cd00516b65fde0704614760000963874fcbb11eaa734ee87809",
          },
          {
            byteLength: 18,
            id: "media:image:logo",
            kind: "media",
            sha256: "sha256:eaa939fc7491640a48f4c14ebc5ac101979af2e7a4e50f0033a51b46f52aedbd",
          },
        ],
        rootSha256: "sha256:e7e32b2f8d17625a002948e8976ed691efe257da103011a009aa9f3ae98d6c74",
        version: 1,
      },
    });
    expect(recoverySha256Digest(new TextEncoder().encode("abc"))).toBe(
      "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("round trips discovery and preserves unknown native payload versions", async () => {
    expect(formatRecoveryDiscovery(recoveryDiscoveryV1)).toBe(
      '{"kind":"formless.recovery.discovery","protocols":[{"capturePath":"/api/formless/recovery/v1/snapshot","mediaType":"application/vnd.formless.recovery.v1","version":1}]}',
    );
    expect(
      parseRecoveryDiscovery(JSON.parse(formatRecoveryDiscovery(recoveryDiscoveryV1))),
    ).toEqual(recoveryDiscoveryV1);

    const bytes = await collect(
      encodeRecoverySnapshot({
        header: { ...recoveryGoldenHeader, nativePayloadVersion: 999_999 },
        payloads: recoveryGoldenPayloads(),
      }),
    );
    await expect(decodeRecoverySnapshot([bytes])).resolves.toMatchObject({
      header: { nativePayloadFormat: "formless.program.native", nativePayloadVersion: 999_999 },
    });
  });

  it("rejects oversized and non-canonical JSON headers", async () => {
    const oversized = new Uint8Array(RECOVERY_STREAM_MAGIC.length + RECOVERY_FRAME_PREFIX_BYTES);
    oversized.set(new TextEncoder().encode(RECOVERY_STREAM_MAGIC));
    const oversizedView = new DataView(oversized.buffer);
    oversizedView.setUint8(RECOVERY_STREAM_MAGIC.length, RECOVERY_FRAME_KINDS.captureHeader);
    oversizedView.setUint32(
      RECOVERY_STREAM_MAGIC.length + 1,
      RECOVERY_MAX_FRAME_HEADER_BYTES + 1,
      false,
    );
    await expect(decodeRecoverySnapshot([oversized])).rejects.toThrow(/header length/);

    const bytes = await encodeGoldenSnapshot();
    const [capture] = frameSpans(bytes);
    if (capture === undefined) {
      throw new Error("Golden recovery capture frame is missing.");
    }
    const header = JSON.parse(
      text(bytes.subarray(capture.headerStart, capture.headerEnd)),
    ) as Record<string, unknown>;
    const nonCanonical = new TextEncoder().encode(
      JSON.stringify({ workerVersion: header.workerVersion, ...header }),
    );
    expect(nonCanonical.byteLength).toBe(capture.headerEnd - capture.headerStart);
    const mutated = bytes.slice();
    mutated.set(nonCanonical, capture.headerStart);
    await expect(decodeRecoverySnapshot([mutated])).rejects.toThrow(/canonical JSON/);
  });

  it("rejects truncated streams, missing completion, and trailing bytes", async () => {
    const bytes = await encodeGoldenSnapshot();
    const frames = frameSpans(bytes);
    const firstPayload = frames[1];
    const completion = frames.at(-1);
    if (firstPayload === undefined || completion === undefined) {
      throw new Error("Golden recovery frames are incomplete.");
    }

    for (const truncated of [
      bytes.subarray(0, RECOVERY_STREAM_MAGIC.length - 1),
      bytes.subarray(0, firstPayload.payloadEnd - 1),
      bytes.subarray(0, bytes.byteLength - 1),
    ]) {
      await expect(decodeRecoverySnapshot([truncated])).rejects.toThrow(/truncated|missing/);
    }

    await expect(decodeRecoverySnapshot([bytes.subarray(0, completion.start)])).rejects.toThrow(
      /missing its completion/,
    );
    await expect(decodeRecoverySnapshot([bytes, Uint8Array.of(0xff)])).rejects.toThrow(
      /trailing bytes/,
    );
  });

  it("rejects invalid frame ordering and duplicate payload ids", async () => {
    const invalidOrder = await encodeGoldenSnapshot();
    invalidOrder[RECOVERY_STREAM_MAGIC.length] = RECOVERY_FRAME_KINDS.payload;
    await expect(decodeRecoverySnapshot([invalidOrder])).rejects.toThrow(/must be the first frame/);

    const duplicateInput: RecoveryPayloadInput[] = [
      { byteLength: 1, bytes: [Uint8Array.of(1)], id: "payload:1", kind: "opaque" },
      { byteLength: 1, bytes: [Uint8Array.of(2)], id: "payload:2", kind: "opaque" },
    ];
    const encoded = await collect(
      encodeRecoverySnapshot({ header: recoveryGoldenHeader, payloads: duplicateInput }),
    );
    const secondPayload = frameSpans(encoded)[2];
    if (secondPayload === undefined) {
      throw new Error("Second recovery payload frame is missing.");
    }
    replaceTextInRange(
      encoded,
      secondPayload.headerStart,
      secondPayload.headerEnd,
      "payload:2",
      "payload:1",
    );
    await expect(decodeRecoverySnapshot([encoded])).rejects.toThrow(/must be unique/);

    await expect(
      collect(
        encodeRecoverySnapshot({
          header: recoveryGoldenHeader,
          payloads: [duplicateInput[0]!, duplicateInput[0]!],
        }),
      ),
    ).rejects.toThrow(/must be unique/);
  });

  it("rejects declared length, payload digest, and whole-root mismatches", async () => {
    const golden = await encodeGoldenSnapshot();
    const validation = await decodeRecoverySnapshot([golden]);
    const completion = frameSpans(golden).at(-1);
    if (completion === undefined) {
      throw new Error("Golden completion frame is missing.");
    }

    const wrongLength = golden.slice();
    replaceTextInRange(
      wrongLength,
      completion.headerStart,
      completion.headerEnd,
      '"byteLength":5',
      '"byteLength":6',
    );
    await expect(decodeRecoverySnapshot([wrongLength])).rejects.toThrow(
      /byte length does not match/,
    );

    const wrongDigest = golden.slice();
    const payloadDigest = validation.receipt.payloads[0]!.sha256;
    replaceTextInRange(
      wrongDigest,
      completion.headerStart,
      completion.headerEnd,
      payloadDigest,
      alterDigest(payloadDigest),
    );
    await expect(decodeRecoverySnapshot([wrongDigest])).rejects.toThrow(/digest does not match/);

    const wrongRoot = golden.slice();
    replaceTextInRange(
      wrongRoot,
      completion.headerStart,
      completion.headerEnd,
      validation.receipt.rootSha256,
      alterDigest(validation.receipt.rootSha256),
    );
    await expect(decodeRecoverySnapshot([wrongRoot])).rejects.toThrow(/root does not match/);

    await expect(
      collect(
        encodeRecoverySnapshot({
          header: recoveryGoldenHeader,
          payloads: [{ byteLength: 2, bytes: [Uint8Array.of(1)], id: "short", kind: "opaque" }],
        }),
      ),
    ).rejects.toThrow(/ended at 1 bytes; expected 2/);
  });
});

async function encodeGoldenSnapshot(): Promise<Uint8Array> {
  return collect(
    encodeRecoverySnapshot({
      header: recoveryGoldenHeader,
      payloads: recoveryGoldenPayloads(),
    }),
  );
}

async function collect(source: RecoveryByteSource): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  for await (const chunk of source) {
    chunks.push(chunk);
    byteLength += chunk.byteLength;
  }
  const output = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

async function* oneByteChunks(bytes: Uint8Array): AsyncGenerator<Uint8Array> {
  for (let index = 0; index < bytes.byteLength; index += 1) {
    yield bytes.subarray(index, index + 1);
  }
}

type FrameSpan = {
  end: number;
  headerEnd: number;
  headerStart: number;
  kind: number;
  payloadEnd: number;
  payloadStart: number;
  start: number;
};

function frameSpans(bytes: Uint8Array): FrameSpan[] {
  const frames: FrameSpan[] = [];
  let offset = RECOVERY_STREAM_MAGIC.length;
  while (offset < bytes.byteLength) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, RECOVERY_FRAME_PREFIX_BYTES);
    const headerLength = view.getUint32(1, false);
    const payloadLength = Number(view.getBigUint64(5, false));
    const headerStart = offset + RECOVERY_FRAME_PREFIX_BYTES;
    const headerEnd = headerStart + headerLength;
    const payloadStart = headerEnd;
    const payloadEnd = payloadStart + payloadLength;
    frames.push({
      end: payloadEnd,
      headerEnd,
      headerStart,
      kind: view.getUint8(0),
      payloadEnd,
      payloadStart,
      start: offset,
    });
    offset = payloadEnd;
  }
  return frames;
}

function replaceTextInRange(
  bytes: Uint8Array,
  start: number,
  end: number,
  from: string,
  to: string,
): void {
  if (from.length !== to.length) {
    throw new Error("Recovery test replacements must preserve byte length.");
  }
  const value = text(bytes.subarray(start, end));
  const index = value.indexOf(from);
  if (index < 0) {
    throw new Error(`Recovery test value does not contain ${from}.`);
  }
  bytes.set(new TextEncoder().encode(to), start + index);
}

function alterDigest(digest: string): string {
  return `${digest.slice(0, -1)}${digest.endsWith("0") ? "1" : "0"}`;
}

function text(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
