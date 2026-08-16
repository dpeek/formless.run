import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import {
  RECOVERY_CAPTURE_KIND,
  RECOVERY_CAPTURE_PATH,
  RECOVERY_DISCOVERY_PATH,
  RECOVERY_MEDIA_TYPE,
  RECOVERY_PROTOCOL_VERSION,
  decodeRecoverySnapshot,
  encodeRecoverySnapshot,
  recoveryDiscoveryV1,
  type RecoveryCaptureHeader,
  type RecoveryPayloadObservation,
} from "@dpeek/formless-archive/recovery";
import type { StorageSnapshot, StoredRecord } from "@dpeek/formless-storage";
import packageJson from "../../package.json";
import { formlessProgramSchemaProvenance } from "../program/runtime.ts";
import {
  createAuthorityWriteHelpers,
  instanceControlPlaneTestStorageSnapshot,
  restoreTestStorageSnapshot,
} from "../test/authority-write.ts";
import { createOwnerSessionCookie } from "./owner-session.ts";
import { createWorkerHarness } from "./miniflare-test.ts";
import { createRecoveryPayloads } from "./recovery-api.ts";
import {
  RECOVERY_NATIVE_MEDIA_KIND,
  RECOVERY_NATIVE_PAYLOAD_FORMAT,
  RECOVERY_NATIVE_PAYLOAD_VERSION,
  RECOVERY_PROGRAM_PAYLOAD_ID,
  readRecoveryApplicationMediaInventory,
  type RecoveryMediaInventoryEntry,
  type RecoveryNativeMediaHeader,
} from "./recovery-source.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

const adminToken = "recovery-admin-token";
const ownerSessionSecret = "recovery-owner-session-secret";
const workerVersion = "worker-2026.08.17";
const initialRecords = [
  record("task-active", "task", {
    done: false,
    priority: "normal",
    title: "Recovery task",
  }),
  record(
    "task-deleted",
    "task",
    {
      done: true,
      priority: "normal",
      title: "Deleted recovery task",
    },
    true,
  ),
];
const initialMedia = [
  media("media/documents/private.pdf", [1, 2, 3], "application/pdf", {
    access: "private",
  }),
  media("media/documents/unreferenced.txt", [4, 5], "text/plain", {
    reference: "none",
  }),
  media("media/images/public.png", [6, 7, 8, 9], "image/png", { access: "public" }),
  media("media/images/unreferenced.webp", [10], "image/webp", { reference: "none" }),
];

let harness: Harness;
let localHarness: Harness;

beforeAll(async () => {
  harness = await createWorkerHarness(
    "src/worker/index.ts",
    {
      FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
    },
    {
      bindings: {
        FORMLESS_ADMIN_TOKEN: adminToken,
        FORMLESS_DEPLOY_VERSION: workerVersion,
        FORMLESS_OWNER_SESSION_SECRET: ownerSessionSecret,
      },
      r2Buckets: ["FORMLESS_MEDIA"],
    },
  );
  localHarness = await createWorkerHarness(
    "src/worker/index.ts",
    {
      FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
    },
    {
      bindings: {
        FORMLESS_OWNER_SESSION_SECRET: ownerSessionSecret,
        FORMLESS_RUNTIME_PROFILE: "local",
      },
      r2Buckets: ["FORMLESS_MEDIA"],
    },
  );
});

beforeEach(async () => {
  await restoreTestStorageSnapshot(
    harness,
    "/api/formless/program/snapshot/restore",
    instanceControlPlaneTestStorageSnapshot(initialRecords),
    adminHeaders(),
  );

  const bucket = await harness.mf.getR2Bucket("FORMLESS_MEDIA");
  const listed = await bucket.list();
  if (listed.objects.length > 0) {
    await bucket.delete(listed.objects.map(({ key }) => key));
  }
  for (const object of initialMedia) {
    await bucket.put(object.key, object.bytes, {
      customMetadata: object.customMetadata,
      httpMetadata: { contentType: object.contentType },
    });
  }
});

afterAll(async () => {
  await Promise.all([harness.dispose(), localHarness.dispose()]);
});

describe("Worker recovery discovery", () => {
  it("returns the exact no-store version-one discovery contract and method boundaries", async () => {
    const response = await harness.fetch(RECOVERY_DISCOVERY_PATH, { headers: adminHeaders() });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(await response.json()).toEqual(recoveryDiscoveryV1);

    for (const [path, method, allow] of [
      [RECOVERY_DISCOVERY_PATH, "POST", "GET"],
      [RECOVERY_CAPTURE_PATH, "GET", "POST"],
    ] as const) {
      const rejected = await harness.fetch(path, { headers: adminHeaders(), method });

      expect(rejected.status).toBe(405);
      expect(rejected.headers.get("Allow")).toBe(allow);
      expect(rejected.headers.get("Cache-Control")).toBe("no-store");
    }
  });

  it("requires only the configured admin bearer and stays closed to owner and local fallbacks", async () => {
    for (const [path, method] of [
      [RECOVERY_DISCOVERY_PATH, "GET"],
      [RECOVERY_CAPTURE_PATH, "POST"],
    ] as const) {
      for (const headers of [{}, { Authorization: "Bearer invalid-recovery-token" }]) {
        const rejected = await harness.fetch(path, { headers, method });

        expect(rejected.status).toBe(401);
        expect(rejected.headers.get("Cache-Control")).toBe("no-store");
        expect(rejected.headers.get("WWW-Authenticate")).toBe('Bearer realm="formless-admin"');
      }
    }

    const ownerCookie = await signedOwnerSessionCookie();
    const ownerRejected = await harness.fetch(RECOVERY_DISCOVERY_PATH, {
      headers: { Cookie: cookiePair(ownerCookie) },
    });
    const localRejected = await localHarness.fetch(RECOVERY_DISCOVERY_PATH);

    expect(ownerRejected.status).toBe(401);
    expect(localRejected.status).toBe(401);
    expect(localRejected.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("Worker recovery capture", () => {
  it("streams one verifiable immutable capture with every application media object", async () => {
    const bucket = (await harness.mf.getR2Bucket("FORMLESS_MEDIA")) as unknown as R2Bucket;
    await bucket.put("recovery/internal/previous.snapshot", new Uint8Array([99]));
    const programBefore = await readProgramSnapshot();
    const mediaBefore = await readRecoveryApplicationMediaInventory(bucket);
    const response = await harness.fetch(RECOVERY_CAPTURE_PATH, {
      headers: adminHeaders(),
      method: "POST",
    });
    const payloadChunks = new Map<string, Uint8Array[]>();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Type")).toBe(RECOVERY_MEDIA_TYPE);

    const validation = await decodeRecoverySnapshot(response.body!, {
      onPayloadChunk(payload, chunk) {
        const chunks = payloadChunks.get(payload.id) ?? [];
        chunks.push(chunk.slice());
        payloadChunks.set(payload.id, chunks);
      },
    });

    expect(validation.header).toMatchObject({
      captureId: expect.stringMatching(/^recovery:[0-9a-f-]+$/),
      capturedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      excludedScopes: ["security", "private-auth", "provider"],
      formlessVersion: packageJson.version,
      includedScopes: ["application"],
      kind: RECOVERY_CAPTURE_KIND,
      nativePayloadFormat: RECOVERY_NATIVE_PAYLOAD_FORMAT,
      nativePayloadVersion: RECOVERY_NATIVE_PAYLOAD_VERSION,
      sourceCursor: String(programBefore.sourceCursor),
      sourceOrigin: "http://example.com",
      version: RECOVERY_PROTOCOL_VERSION,
      workerVersion,
    });
    expect(validation.receipt.payloads.map(({ id }) => id)).toEqual([
      RECOVERY_PROGRAM_PAYLOAD_ID,
      ...initialMedia.map(({ key }) => `media:${key}`),
    ]);

    const programPayload = JSON.parse(
      new TextDecoder().decode(joinChunks(payloadChunks.get(RECOVERY_PROGRAM_PAYLOAD_ID)!)),
    ) as {
      records: StoredRecord[];
      tombstones: StoredRecord[];
    };
    expect(programPayload.records.map(({ id }) => id)).toEqual(["task-active"]);
    expect(programPayload.tombstones.map(({ id }) => id)).toEqual(["task-deleted"]);

    for (const expected of initialMedia) {
      const payload = decodeNativeMedia(joinChunks(payloadChunks.get(`media:${expected.key}`)!));

      expect(payload.header).toMatchObject({
        contentType: expected.contentType,
        key: expected.key,
        kind: RECOVERY_NATIVE_MEDIA_KIND,
        provider: "r2",
        version: RECOVERY_NATIVE_PAYLOAD_VERSION,
      });
      expect(payload.bytes).toEqual(expected.bytes);
    }
    expect(payloadChunks.has("media:recovery/internal/previous.snapshot")).toBe(false);

    const programAfter = await readProgramSnapshot();
    const mediaAfter = await readRecoveryApplicationMediaInventory(bucket);
    expect(programAfter.sourceCursor).toBe(programBefore.sourceCursor);
    expect(programAfter.records).toEqual(programBefore.records);
    expect(mediaAfter).toEqual(mediaBefore);
  });

  it("terminates before completion when Program state drifts", async () => {
    const writes = createAuthorityWriteHelpers(harness, adminHeaders());

    await expectDriftAfterPayload(
      ({ id }) => id === RECOVERY_PROGRAM_PAYLOAD_ID,
      async () => {
        await writes.postCreateOperation("recovery-program-drift", {
          done: false,
          priority: "normal",
          title: "Concurrent recovery write",
        });
      },
    );
  });

  it("terminates before completion when media membership drifts", async () => {
    await expectMediaInventoryDrift((entry) => [
      entry,
      {
        ...entry,
        fidelityMetadata: {
          ...entry.fidelityMetadata,
          etag: "concurrent-etag",
          httpEtag: '"concurrent-etag"',
        },
        immutableObjectIdentity: "concurrent-version",
        key: "media/images/concurrent.png",
      },
    ]);
  });

  it("terminates before completion when a selected media identity drifts", async () => {
    await expectMediaInventoryDrift((entry) => [
      {
        ...entry,
        fidelityMetadata: {
          ...entry.fidelityMetadata,
          etag: `${entry.fidelityMetadata.etag}-changed`,
        },
        immutableObjectIdentity: `${entry.immutableObjectIdentity}-changed`,
      },
    ]);
  });
});

async function expectDriftAfterPayload(
  select: (payload: RecoveryPayloadObservation) => boolean,
  mutate: () => Promise<void>,
): Promise<void> {
  const response = await harness.fetch(RECOVERY_CAPTURE_PATH, {
    headers: adminHeaders(),
    method: "POST",
  });
  let mutated = false;

  expect(response.status).toBe(200);
  await expect(
    decodeRecoverySnapshot(response.body!, {
      async onPayloadStart(payload) {
        if (!mutated && select(payload)) {
          mutated = true;
          await mutate();
        }
      },
    }),
  ).rejects.toThrow();
  expect(mutated).toBe(true);
}

async function readProgramSnapshot(): Promise<StorageSnapshot> {
  const response = await harness.fetch("/api/formless/program/snapshot?actorKind=cliDeployer", {
    headers: adminHeaders(),
  });

  expect(response.status).toBe(200);
  return (await response.json()) as StorageSnapshot;
}

async function expectMediaInventoryDrift(
  drift: (entry: RecoveryMediaInventoryEntry) => RecoveryMediaInventoryEntry[],
): Promise<void> {
  const bucket = (await harness.mf.getR2Bucket("FORMLESS_MEDIA")) as unknown as R2Bucket;
  const [entry] = await readRecoveryApplicationMediaInventory(bucket);
  if (entry === undefined) {
    throw new Error("Expected recovery media test entry.");
  }
  let currentMedia = [entry];
  const programIdentity = {
    programProvenance: formlessProgramSchemaProvenance,
    sourceCursor: 5,
  };
  const programBytes = new Uint8Array([1, 2, 3]);

  async function* changingProgramBytes() {
    yield programBytes;
    currentMedia = drift(entry);
  }

  const encoded = encodeRecoverySnapshot({
    header: recoveryTestHeader(programIdentity.sourceCursor),
    payloads: createRecoveryPayloads(
      {
        ...programIdentity,
        byteLength: programBytes.byteLength,
        bytes: changingProgramBytes(),
      },
      [entry],
      {
        readMediaInventory: async () => currentMedia,
        readMediaObject: async (mediaEntry) => ({
          byteLength: 1,
          bytes: [new Uint8Array([4])],
          id: `media:${mediaEntry.key}`,
          kind: "media",
          media: mediaEntry,
        }),
        readProgramIdentity: async () => programIdentity,
      },
    ),
  });

  await expect(decodeRecoverySnapshot(encoded)).rejects.toThrow(
    "Recovery media source changed during capture.",
  );
}

function recoveryTestHeader(sourceCursor: number): RecoveryCaptureHeader {
  return {
    captureId: "recovery:media-drift-test",
    capturedAt: "2026-08-17T00:00:00.000Z",
    excludedScopes: ["security", "private-auth", "provider"],
    formlessVersion: packageJson.version,
    includedScopes: ["application"],
    kind: RECOVERY_CAPTURE_KIND,
    nativePayloadFormat: RECOVERY_NATIVE_PAYLOAD_FORMAT,
    nativePayloadVersion: RECOVERY_NATIVE_PAYLOAD_VERSION,
    sourceCursor: String(sourceCursor),
    sourceOrigin: "http://example.com",
    version: RECOVERY_PROTOCOL_VERSION,
    workerVersion,
  };
}

async function signedOwnerSessionCookie(): Promise<string> {
  const created = await createOwnerSessionCookie({
    env: { FORMLESS_OWNER_SESSION_SECRET: ownerSessionSecret },
    maxAgeSeconds: 60,
    now: "2026-08-17T00:00:00.000Z",
    owner: {
      createdAt: "2026-08-17T00:00:00.000Z",
      email: "owner@example.com",
      id: "recovery-owner",
      name: "Recovery Owner",
    },
    request: new Request("http://example.com/admin"),
  });

  return created.cookie;
}

function decodeNativeMedia(bytes: Uint8Array): {
  bytes: Uint8Array;
  header: RecoveryNativeMediaHeader;
} {
  const headerLength = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, false);
  const headerEnd = 4 + headerLength;

  return {
    bytes: bytes.slice(headerEnd),
    header: JSON.parse(
      new TextDecoder().decode(bytes.subarray(4, headerEnd)),
    ) as RecoveryNativeMediaHeader,
  };
}

function joinChunks(chunks: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
}

function record(
  id: string,
  entity: string,
  values: StoredRecord["values"],
  deleted = false,
): StoredRecord {
  const timestamp = "2026-08-17T00:00:00.000Z";

  return {
    createdAt: timestamp,
    ...(deleted ? { deletedAt: timestamp } : {}),
    entity,
    id,
    updatedAt: timestamp,
    values,
  };
}

function media(
  key: string,
  values: number[],
  contentType: string,
  customMetadata: Record<string, string>,
) {
  return { bytes: new Uint8Array(values), contentType, customMetadata, key };
}

function adminHeaders() {
  return { Authorization: `Bearer ${adminToken}` };
}

function cookiePair(cookie: string): string {
  return cookie.split(";")[0] ?? cookie;
}
