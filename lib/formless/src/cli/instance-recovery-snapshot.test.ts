import path from "node:path";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  RECOVERY_CAPTURE_KIND,
  RECOVERY_DISCOVERY_PATH,
  RECOVERY_MEDIA_TYPE,
  RECOVERY_PROTOCOL_VERSION,
  decodeRecoverySnapshot,
  encodeRecoverySnapshot,
  recoveryDiscoveryV1,
  recoveryExcludedScopes,
  recoveryIncludedScopes,
  type RecoveryCaptureHeader,
  type RecoveryDiscovery,
} from "@dpeek/formless-archive/recovery";

import {
  RecoverySnapshotCaptureError,
  captureRecoverySnapshot,
  recoverySnapshotNodeFilesystem,
  type RecoverySnapshotCaptureErrorCode,
  type RecoverySnapshotCaptureProgress,
} from "./instance-recovery-snapshot.ts";

const adminBearer = "recovery-admin-bearer-private";
const privatePayloadValue = "not-json:private-record-value";
const target = {
  id: "production-primary",
  origin: "https://example.test",
  provider: "cloudflare",
};
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("headless recovery snapshot capture", () => {
  it("preserves an unknown native payload and returns only display-safe evidence", async () => {
    const directory = await makeTemporaryDirectory();
    const outputPath = path.join(directory, "target.recovery");
    const payload = new TextEncoder().encode(privatePayloadValue);
    const bytes = await encodedRecoverySnapshot(payload);
    const requests: { headers: Headers; method: string; url: string }[] = [];
    const progress: RecoverySnapshotCaptureProgress[] = [];
    await writeFile(outputPath, "prior snapshot");

    const result = await captureRecoverySnapshot(
      { adminBearer, outputPath, target },
      dependencies(
        (async (request, init) => {
          const url = requestUrl(request);
          requests.push({
            headers: new Headers(init?.headers),
            method: init?.method ?? "GET",
            url,
          });

          if (url === `${target.origin}${RECOVERY_DISCOVERY_PATH}`) {
            return discoveryResponse();
          }
          return captureResponse(bytes);
        }) as typeof fetch,
        progress,
      ),
    );

    expect(requests.map(({ method, url }) => ({ method, url }))).toEqual([
      { method: "GET", url: `${target.origin}${RECOVERY_DISCOVERY_PATH}` },
      {
        method: "POST",
        url: `${target.origin}${recoveryDiscoveryV1.protocols[0]!.capturePath}`,
      },
    ]);
    expect(requests.map(({ headers }) => headers.get("authorization"))).toEqual([
      `Bearer ${adminBearer}`,
      `Bearer ${adminBearer}`,
    ]);
    expect(result).toMatchObject({
      evidence: {
        excludedScopes: ["security", "private-auth", "provider"],
        includedScopes: ["application"],
        nativePayloadFormat: "remote.future.program",
        nativePayloadVersion: 47,
        payloadByteLength: payload.byteLength,
        payloadCount: 1,
        protocolVersion: RECOVERY_PROTOCOL_VERSION,
      },
      outputPath,
      receipt: {
        byteLength: bytes.byteLength,
        payloadCount: 1,
        version: RECOVERY_PROTOCOL_VERSION,
      },
      target,
    });
    expect(result.progress).toEqual(progress);
    expect(progress.map(({ phase, status }) => `${phase}:${status}`)).toEqual([
      "discovery:started",
      "discovery:completed",
      "capture:started",
      "capture:completed",
    ]);
    expect(new Uint8Array(await readFile(outputPath))).toEqual(bytes);

    const observedPayload: Uint8Array[] = [];
    await decodeRecoverySnapshot([new Uint8Array(await readFile(outputPath))], {
      onPayloadChunk(_payload, chunk) {
        observedPayload.push(chunk.slice());
      },
    });
    expect(joinChunks(observedPayload)).toEqual(payload);

    const displayOutput = JSON.stringify({ progress, result });
    expect(displayOutput).not.toContain(adminBearer);
    expect(displayOutput).not.toContain(privatePayloadValue);
    expect(displayOutput).not.toContain("program:opaque-private");
  });

  it("preserves prior output across discovery, negotiation, authorization, and source failures", async () => {
    const unsupportedDiscovery: RecoveryDiscovery = {
      kind: recoveryDiscoveryV1.kind,
      protocols: [
        {
          capturePath: "/api/formless/recovery/v2/snapshot",
          mediaType: "application/vnd.formless.recovery.v2",
          version: 2,
        },
      ],
    };
    const scenarios: {
      code: RecoverySnapshotCaptureErrorCode;
      fetch: typeof fetch;
      name: string;
    }[] = [
      {
        code: "discovery-unavailable",
        fetch: (async () => new Response(privatePayloadValue, { status: 404 })) as typeof fetch,
        name: "unavailable discovery",
      },
      {
        code: "protocol-unavailable",
        fetch: (async () => discoveryResponse(unsupportedDiscovery)) as typeof fetch,
        name: "no common protocol",
      },
      {
        code: "authorization-failed",
        fetch: recoveryFetch(() => new Response(privatePayloadValue, { status: 401 })),
        name: "capture authorization failure",
      },
      {
        code: "source-changed",
        fetch: recoveryFetch(() => new Response(privatePayloadValue, { status: 409 })),
        name: "source drift before streaming",
      },
    ];

    for (const scenario of scenarios) {
      const directory = await makeTemporaryDirectory();
      const outputPath = path.join(directory, "target.recovery");
      await writeFile(outputPath, "prior snapshot");

      const error = await captureFailure(
        captureRecoverySnapshot({ adminBearer, outputPath, target }, dependencies(scenario.fetch)),
      );

      expect(error.code, scenario.name).toBe(scenario.code);
      expect(await readFile(outputPath, "utf8"), scenario.name).toBe("prior snapshot");
      expect(await readdir(directory), scenario.name).toEqual(["target.recovery"]);
      expect(safeErrorText(error), scenario.name).not.toContain(adminBearer);
      expect(safeErrorText(error), scenario.name).not.toContain(privatePayloadValue);
    }
  });

  it("rejects interrupted, corrupt, and incomplete streams without exposing transport data", async () => {
    const bytes = await encodedRecoverySnapshot(new TextEncoder().encode(privatePayloadValue));
    const corruptBytes = corruptPayload(bytes, new TextEncoder().encode(privatePayloadValue));
    const scenarios: {
      code: RecoverySnapshotCaptureErrorCode;
      name: string;
      response: () => Response;
    }[] = [
      {
        code: "transport-interrupted",
        name: "interrupted transport",
        response: () => interruptedCaptureResponse(bytes),
      },
      {
        code: "snapshot-invalid",
        name: "payload digest mismatch",
        response: () => captureResponse(corruptBytes),
      },
      {
        code: "snapshot-invalid",
        name: "concurrent-source termination before completion",
        response: () => captureResponse(bytes.subarray(0, bytes.byteLength - 24)),
      },
    ];

    for (const scenario of scenarios) {
      const directory = await makeTemporaryDirectory();
      const outputPath = path.join(directory, "target.recovery");
      await writeFile(outputPath, "prior snapshot");

      const error = await captureFailure(
        captureRecoverySnapshot(
          { adminBearer, outputPath, target },
          dependencies(recoveryFetch(scenario.response)),
        ),
      );

      expect(error.code, scenario.name).toBe(scenario.code);
      expect(await readFile(outputPath, "utf8"), scenario.name).toBe("prior snapshot");
      expect(await readdir(directory), scenario.name).toEqual(["target.recovery"]);
      expect(safeErrorText(error), scenario.name).not.toContain(adminBearer);
      expect(safeErrorText(error), scenario.name).not.toContain(privatePayloadValue);
    }
  });

  it("keeps prior filesystem state when atomic publication fails", async () => {
    const directory = await makeTemporaryDirectory();
    const outputPath = path.join(directory, "existing-output");
    const markerPath = path.join(outputPath, "prior.snapshot");
    const bytes = await encodedRecoverySnapshot(new TextEncoder().encode(privatePayloadValue));
    await mkdir(outputPath);
    await writeFile(markerPath, "prior snapshot");

    const error = await captureFailure(
      captureRecoverySnapshot(
        { adminBearer, outputPath, target },
        dependencies(recoveryFetch(() => captureResponse(bytes))),
      ),
    );

    expect(error).toMatchObject({ code: "publication-failed", phase: "publication" });
    expect(await readFile(markerPath, "utf8")).toBe("prior snapshot");
    expect(await readdir(directory)).toEqual(["existing-output"]);
    expect(safeErrorText(error)).not.toContain(adminBearer);
    expect(safeErrorText(error)).not.toContain(privatePayloadValue);
  });
});

function dependencies(fetcher: typeof fetch, progress: RecoverySnapshotCaptureProgress[] = []) {
  let clockTick = 0;
  return {
    fetch: fetcher,
    filesystem: recoverySnapshotNodeFilesystem,
    now: () => `2026-08-17T00:00:0${clockTick++}.000Z`,
    progress: (event: RecoverySnapshotCaptureProgress) => progress.push(event),
  };
}

function recoveryFetch(capture: () => Response): typeof fetch {
  let requestCount = 0;
  return (async () => {
    requestCount += 1;
    return requestCount === 1 ? discoveryResponse() : capture();
  }) as typeof fetch;
}

function discoveryResponse(discovery: RecoveryDiscovery = recoveryDiscoveryV1): Response {
  return Response.json(discovery, {
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
  });
}

function captureResponse(bytes: Uint8Array): Response {
  return new Response(Uint8Array.from(bytes).buffer, {
    headers: { "Cache-Control": "no-store", "Content-Type": RECOVERY_MEDIA_TYPE },
  });
}

function interruptedCaptureResponse(bytes: Uint8Array): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.subarray(0, Math.floor(bytes.byteLength / 2)));
        controller.error(new Error(`transport:${adminBearer}:${privatePayloadValue}`));
      },
    }),
    { headers: { "Content-Type": RECOVERY_MEDIA_TYPE } },
  );
}

async function encodedRecoverySnapshot(payload: Uint8Array): Promise<Uint8Array> {
  const header: RecoveryCaptureHeader = {
    captureId: "capture-unknown-native",
    capturedAt: "2026-08-17T00:00:00.000Z",
    excludedScopes: [...recoveryExcludedScopes],
    formlessVersion: "47.0.0-remote",
    includedScopes: [...recoveryIncludedScopes],
    kind: RECOVERY_CAPTURE_KIND,
    nativePayloadFormat: "remote.future.program",
    nativePayloadVersion: 47,
    sourceCursor: "remote-cursor-47",
    sourceOrigin: target.origin,
    version: RECOVERY_PROTOCOL_VERSION,
    workerVersion: "remote-worker-47",
  };
  const chunks: Uint8Array[] = [];

  for await (const chunk of encodeRecoverySnapshot({
    header,
    payloads: [
      {
        byteLength: payload.byteLength,
        bytes: [payload],
        id: "program:opaque-private",
        kind: "program",
      },
    ],
  })) {
    chunks.push(chunk);
  }

  return joinChunks(chunks);
}

function corruptPayload(bytes: Uint8Array, payload: Uint8Array): Uint8Array {
  const copy = bytes.slice();
  const offset = findBytes(copy, payload);
  if (offset < 0) {
    throw new Error("Test payload bytes were not found.");
  }
  copy[offset] ^= 0xff;
  return copy;
}

function findBytes(bytes: Uint8Array, expected: Uint8Array): number {
  outer: for (let offset = 0; offset <= bytes.byteLength - expected.byteLength; offset += 1) {
    for (let index = 0; index < expected.byteLength; index += 1) {
      if (bytes[offset + index] !== expected[index]) {
        continue outer;
      }
    }
    return offset;
  }
  return -1;
}

function joinChunks(chunks: readonly Uint8Array[]): Uint8Array {
  const joined = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

async function captureFailure(promise: Promise<unknown>): Promise<RecoverySnapshotCaptureError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(RecoverySnapshotCaptureError);
    return error as RecoverySnapshotCaptureError;
  }
  throw new Error("Expected recovery snapshot capture to fail.");
}

function safeErrorText(error: RecoverySnapshotCaptureError): string {
  return `${String(error)} ${JSON.stringify(error)}`;
}

function requestUrl(request: RequestInfo | URL): string {
  return request instanceof Request ? request.url : request.toString();
}

async function makeTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "formless-cli-recovery-"));
  temporaryDirectories.push(directory);
  return directory;
}
