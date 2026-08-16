import { describe, expect, it } from "vite-plus/test";
import { parseAppSchema } from "@dpeek/formless-schema";
import type { RecordValues, StoredRecord } from "@dpeek/formless-storage";
import { formlessProgramSchema, formlessProgramSchemaProvenance } from "../program/runtime.ts";
import {
  RECOVERY_NATIVE_MEDIA_KIND,
  RECOVERY_NATIVE_PAYLOAD_FORMAT,
  RECOVERY_NATIVE_PAYLOAD_VERSION,
  createRecoveryProgramSource,
  listRecoveryApplicationMediaPages,
  readRecoveryApplicationMediaInventory,
  readRecoveryApplicationMediaObject,
  type RecoveryNativeMediaHeader,
} from "./recovery-source.ts";

const privateAuthSecret = "private-auth-secret-must-not-escape";
const providerSecret = "provider-secret-must-not-escape";

describe("recovery Program source", () => {
  it("serializes application records and tombstones while excluding every retained scope", () => {
    const source = createRecoveryProgramSource({
      programProvenance: formlessProgramSchemaProvenance,
      records: [
        record("task-active", "task", { title: "Keep active" }),
        record("block-deleted", "block", { type: "page" }, true),
        record("principal-active", "principal", { displayName: privateAuthSecret }),
        record("membership-deleted", "membership", { principal: privateAuthSecret }, true),
        record("route-active", "route", { toUrl: providerSecret }),
        record("deployment-deleted", "deployment-config", { credentialRef: providerSecret }, true),
        record("private-auth-storage", "owner-session", { secret: privateAuthSecret }),
      ],
      schema: formlessProgramSchema,
      sourceCursor: 42,
    });
    const payload = JSON.parse(new TextDecoder().decode(source.payload.bytes)) as {
      artifact: { schemaProvenance: unknown; sourceSchema: unknown };
      programProvenance: unknown;
      records: StoredRecord[];
      sourceCursor: number;
      tombstones: StoredRecord[];
      version: number;
    };

    expect(source.excludedScopes).toEqual(["security", "private-auth", "provider"]);
    expect(source.nativePayloadFormat).toBe(RECOVERY_NATIVE_PAYLOAD_FORMAT);
    expect(source.nativePayloadVersion).toBe(RECOVERY_NATIVE_PAYLOAD_VERSION);
    expect(source.sourceCursor).toBe(42);
    expect(payload.artifact.sourceSchema).toEqual(formlessProgramSchema);
    expect(payload.artifact.schemaProvenance).toEqual(formlessProgramSchemaProvenance);
    expect(payload.programProvenance).toEqual(formlessProgramSchemaProvenance);
    expect(payload.sourceCursor).toBe(42);
    expect(payload.records.map((entry) => `${entry.entity}:${entry.id}`)).toEqual([
      "task:task-active",
    ]);
    expect(payload.tombstones.map((entry) => `${entry.entity}:${entry.id}`)).toEqual([
      "block:block-deleted",
    ]);
    expect(new TextDecoder().decode(source.payload.bytes)).not.toContain(privateAuthSecret);
    expect(new TextDecoder().decode(source.payload.bytes)).not.toContain(providerSecret);
  });

  it("fails closed for an unclassified runtime-owned stable entity", () => {
    const schema = parseAppSchema({
      ...formlessProgramSchema,
      entities: [
        ...formlessProgramSchema.entities,
        {
          fields: [
            {
              key: "value",
              label: "Value",
              required: false,
              type: "text",
            },
          ],
          id: "entity_3f5f71ea-e3e0-420a-a783-0bdf04bd4e4b",
          key: "future-runtime-resource",
          label: "Future runtime resource",
        },
      ],
      runtime: {
        ...formlessProgramSchema.runtime,
        controlPlane: {
          entities: {
            ...formlessProgramSchema.runtime?.controlPlane?.entities,
            "future-runtime-resource": { immutableFields: ["value"] },
          },
        },
      },
    });

    expect(() =>
      createRecoveryProgramSource({
        programProvenance: formlessProgramSchemaProvenance,
        records: [record("future-1", "future-runtime-resource", {})],
        schema,
        sourceCursor: 0,
      }),
    ).toThrow(
      'Recovery cannot classify runtime-owned entity "future-runtime-resource" with stable id "entity_3f5f71ea-e3e0-420a-a783-0bdf04bd4e4b".',
    );
  });
});

describe("recovery application media source", () => {
  it("paginates both namespaces and preserves unreferenced, public, private, and fidelity facts", async () => {
    const objects = [
      mediaObject("media/documents/private.pdf", [1, 2], {
        access: "private",
        contentType: "application/pdf",
      }),
      mediaObject("media/documents/public.pdf", [3], {
        access: "public",
        contentType: "application/pdf",
      }),
      mediaObject("media/images/referenced.png", [4, 5, 6], {
        cacheControl: "public, max-age=31536000, immutable",
        contentType: "image/png",
        label: "Referenced",
      }),
      mediaObject("media/images/unreferenced.webp", [7, 8, 9, 10], {
        contentDisposition: "inline",
        contentType: "image/webp",
        label: "Unreferenced",
      }),
      mediaObject("recovery/internal/snapshot", [99], {
        contentType: "application/octet-stream",
      }),
    ];
    const harness = mediaBucketHarness(objects);
    const pages = [];

    for await (const page of listRecoveryApplicationMediaPages(harness.bucket, {
      pageSize: 1,
    })) {
      pages.push(page);
    }

    const inventory = await readRecoveryApplicationMediaInventory(harness.bucket, {
      pageSize: 1,
    });

    expect(pages.flatMap((page) => page.entries.map((entry) => entry.key))).toEqual([
      "media/documents/private.pdf",
      "media/documents/public.pdf",
      "media/images/referenced.png",
      "media/images/unreferenced.webp",
    ]);
    expect(pages.filter((page) => page.nextCursor !== undefined)).toHaveLength(2);
    expect(inventory.map((entry) => entry.key)).not.toContain("recovery/internal/snapshot");
    expect(inventory.find((entry) => entry.key.endsWith("private.pdf"))).toMatchObject({
      contentType: "application/pdf",
      fidelityMetadata: {
        customMetadata: { access: "private" },
        httpMetadata: { contentType: "application/pdf" },
      },
      immutableObjectIdentity: "version:media/documents/private.pdf:1",
      kind: "document",
      size: 2,
    });
    expect(inventory.find((entry) => entry.key.endsWith("unreferenced.webp"))).toMatchObject({
      contentType: "image/webp",
      fidelityMetadata: {
        customMetadata: { label: "Unreferenced" },
        httpMetadata: {
          contentDisposition: "inline",
          contentType: "image/webp",
        },
      },
      kind: "image",
      size: 4,
    });
    expect(harness.listCalls.every((call) => call.limit === 1)).toBe(true);
    expect(
      harness.listCalls.every((call) => call.include?.join(",") === "customMetadata,httpMetadata"),
    ).toBe(true);
  });

  it("binds streamed bytes to the initial immutable object identity", async () => {
    const stored = mediaObject("media/images/unreferenced.webp", [7, 8, 9, 10], {
      contentDisposition: "inline",
      contentType: "image/webp",
      label: "Unreferenced",
    });
    const harness = mediaBucketHarness([stored]);
    const [entry] = await readRecoveryApplicationMediaInventory(harness.bucket);
    const source = await readRecoveryApplicationMediaObject(harness.bucket, entry!);
    const bytes = await collectBytes(source.bytes as AsyncIterable<Uint8Array>);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const headerLength = view.getUint32(0, false);
    const headerEnd = 4 + headerLength;
    const header = JSON.parse(
      new TextDecoder().decode(bytes.subarray(4, headerEnd)),
    ) as RecoveryNativeMediaHeader;

    expect(source.id).toBe("media:media/images/unreferenced.webp");
    expect(source.byteLength).toBe(bytes.byteLength);
    expect(header).toMatchObject({
      contentType: "image/webp",
      immutableObjectIdentity: stored.version,
      key: stored.key,
      kind: RECOVERY_NATIVE_MEDIA_KIND,
      mediaKind: "image",
      provider: "r2",
      size: 4,
      version: RECOVERY_NATIVE_PAYLOAD_VERSION,
    });
    expect([...bytes.subarray(headerEnd)]).toEqual([7, 8, 9, 10]);
    expect(harness.getCalls).toEqual([
      {
        key: stored.key,
        onlyIf: { etagMatches: stored.etag },
      },
    ]);
  });

  it("rejects changed and disappeared objects selected by the initial inventory", async () => {
    const original = mediaObject("media/images/asset.png", [1, 2, 3], {
      contentType: "image/png",
    });
    const harness = mediaBucketHarness([original]);
    const [entry] = await readRecoveryApplicationMediaInventory(harness.bucket);

    harness.objects.set(
      original.key,
      mediaObject(original.key, [1, 2, 3], {
        contentType: "image/png",
        version: `${original.version}:changed`,
      }),
    );
    await expect(readRecoveryApplicationMediaObject(harness.bucket, entry!)).rejects.toThrow(
      `Recovery media object "${original.key}" changed after inventory.`,
    );

    harness.objects.delete(original.key);
    await expect(readRecoveryApplicationMediaObject(harness.bucket, entry!)).rejects.toThrow(
      `Recovery media object "${original.key}" disappeared after inventory.`,
    );
  });
});

function record(id: string, entity: string, values: RecordValues, deleted = false): StoredRecord {
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

type StoredMediaObject = R2Object & {
  bytes: Uint8Array;
};

function mediaObject(
  key: string,
  bytes: number[],
  options: {
    access?: string;
    cacheControl?: string;
    contentDisposition?: string;
    contentType: string;
    label?: string;
    version?: string;
  },
): StoredMediaObject {
  const version = options.version ?? `version:${key}:1`;
  const etag = `etag:${key}:1`;
  const httpMetadata = {
    ...(options.cacheControl === undefined ? {} : { cacheControl: options.cacheControl }),
    ...(options.contentDisposition === undefined
      ? {}
      : { contentDisposition: options.contentDisposition }),
    contentType: options.contentType,
  };
  const customMetadata = {
    ...(options.access === undefined ? {} : { access: options.access }),
    ...(options.label === undefined ? {} : { label: options.label }),
  };

  return {
    bytes: Uint8Array.from(bytes),
    checksums: {
      toJSON: () => ({ sha256: `sha256:${key}` }),
    } as R2Checksums,
    customMetadata,
    etag,
    httpEtag: `"${etag}"`,
    httpMetadata,
    key,
    size: bytes.length,
    storageClass: "Standard",
    uploaded: new Date("2026-08-17T00:00:00.000Z"),
    version,
    writeHttpMetadata(headers) {
      if (httpMetadata.contentType) {
        headers.set("Content-Type", httpMetadata.contentType);
      }
    },
  } as StoredMediaObject;
}

function mediaBucketHarness(initialObjects: StoredMediaObject[]) {
  const objects = new Map(initialObjects.map((object) => [object.key, object]));
  const listCalls: Array<{
    cursor?: string;
    include?: string[];
    limit?: number;
    prefix?: string;
  }> = [];
  const getCalls: Array<{ key: string; onlyIf?: R2Conditional }> = [];
  const bucket = {
    async get(key: string, options?: { onlyIf?: R2Conditional }) {
      getCalls.push({ key, ...(options?.onlyIf ? { onlyIf: options.onlyIf } : {}) });
      const object = objects.get(key);

      if (object === undefined) {
        return null;
      }

      if (
        options?.onlyIf?.etagMatches !== undefined &&
        options.onlyIf.etagMatches !== object.etag
      ) {
        return object;
      }

      return Object.create(object, {
        body: {
          enumerable: true,
          value: new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(object.bytes);
              controller.close();
            },
          }),
        },
      }) as R2ObjectBody;
    },
    async list(options: { cursor?: string; include?: string[]; limit?: number; prefix?: string }) {
      listCalls.push({ ...options });
      const selected = [...objects.values()]
        .filter((object) => object.key.startsWith(options.prefix ?? ""))
        .sort((left, right) => left.key.localeCompare(right.key));
      const offset = options.cursor === undefined ? 0 : Number(options.cursor.split(":").at(-1));
      const limit = options.limit ?? selected.length;
      const page = selected.slice(offset, offset + limit);
      const nextOffset = offset + page.length;

      return nextOffset < selected.length
        ? {
            cursor: `${options.prefix}:${nextOffset}`,
            delimitedPrefixes: [],
            objects: page,
            truncated: true as const,
          }
        : { delimitedPrefixes: [], objects: page, truncated: false as const };
    },
  } as unknown as R2Bucket;

  return { bucket, getCalls, listCalls, objects };
}

async function collectBytes(source: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let length = 0;

  for await (const chunk of source) {
    chunks.push(chunk);
    length += chunk.byteLength;
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}
