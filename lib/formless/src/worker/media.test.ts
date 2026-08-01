import { setKeyedDefinition } from "../test/schema-definition-test-helpers.ts";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import { FORMLESS_PROGRAM_API_ROUTE_PREFIX } from "../program/target.ts";
import { formlessProgramSchema } from "../program/runtime.ts";
import {
  FORMLESS_PROGRAM_ARTIFACT_DEFINE_NAME,
  formatFormlessProgramArtifact,
  materializeFormlessProgramSourceArtifact,
} from "../program/artifact.ts";
import type { DocumentMediaAsset } from "@dpeek/formless-media";

import type { OperationInvocationResponse } from "../shared/operation-invocation.ts";
import type { OwnerIdentity, SchemaResponse } from "../shared/protocol.ts";
import { recordOperationRequest } from "../test/authority-write.ts";
import { ensureTestIdentityOwner, resetTestIdentityStorage } from "../test/identity-owner.ts";
import { createWorkerHarness, FORMLESS_WORKER_COMPATIBILITY_DATE } from "./miniflare-test.ts";
import {
  CORE_IMAGE_KEY_PREFIX,
  CORE_MEDIA_ROUTE_PREFIX,
  MEDIA_IMAGE_UPLOAD_MAX_BYTES,
  MEDIA_OBJECT_CACHE_CONTROL,
  MEDIA_PRIVATE_DOCUMENT_CACHE_CONTROL,
} from "@dpeek/formless-media/worker";
import { CENTRAL_AUTH_SESSION_COOKIE_NAME } from "./central-auth-session.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import { createOwnerSessionCookie } from "./owner-session.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;
type HarnessResponse = Awaited<ReturnType<Harness["fetch"]>>;

const adminToken = "test-admin-token";
const sessionSecret = "test-session-secret";
const mediaBinding = "FORMLESS_MEDIA";
const mediaBuckets = [mediaBinding];
const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const pdfBytes = new TextEncoder().encode("%PDF-1.7\nFormless document media test\n%%EOF");
const privateDocumentField = "privateReport";
const publicDocumentField = "publicReport";
const programMediaSchema = programDocumentSchema(formlessProgramSchema);
const owner: OwnerIdentity = {
  id: "owner-1",
  name: "Ada Owner",
  email: "ada@example.com",
  createdAt: "2026-05-21T00:00:00.000Z",
};

type TestFile = {
  content: Uint8Array;
  name: string;
  type: string;
};

let harness: Harness;
let guardedHarness: Harness;
let guardedHarnessDir: string;

beforeAll(async () => {
  const programArtifact = await materializeFormlessProgramSourceArtifact(programMediaSchema);
  harness = await createWorkerHarness(
    "src/worker/index.ts",
    {
      FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
    },
    { compatibilityDate: FORMLESS_WORKER_COMPATIBILITY_DATE, r2Buckets: mediaBuckets },
  );
  guardedHarnessDir = await mkdtemp(join(tmpdir(), "formless-media-worker-harness-"));
  const guardedHarnessPath = await writeMediaWorkerHarness(guardedHarnessDir);
  guardedHarness = await createWorkerHarness(
    guardedHarnessPath,
    {
      FORMLESS_AUTHORITY: { className: "MediaWorkerHarnessAuthority", useSQLite: true },
    },
    {
      bindings: {
        FORMLESS_ADMIN_TOKEN: adminToken,
        FORMLESS_OWNER_SESSION_SECRET: sessionSecret,
      },
      compatibilityDate: FORMLESS_WORKER_COMPATIBILITY_DATE,
      define: {
        [FORMLESS_PROGRAM_ARTIFACT_DEFINE_NAME]: JSON.stringify(
          formatFormlessProgramArtifact(programArtifact),
        ),
      },
      r2Buckets: mediaBuckets,
    },
  );
});

beforeEach(async () => {
  await clearMediaBucket(harness);
  await clearMediaBucket(guardedHarness);
  await resetTestIdentityStorage(guardedHarness, adminToken, programMediaSchema);
});

afterAll(async () => {
  await harness.dispose();
  await guardedHarness.dispose();
  await rm(guardedHarnessDir, { force: true, recursive: true });
});

describe("media worker routes", () => {
  it("uploads a core image media asset and serves it from the instance media route", async () => {
    const upload = await uploadCoreImage(harness, imageFile("hero.png", "image/png", pngBytes));

    await expectResponseStatus(upload, 200);

    const body = (await upload.json()) as {
      asset: {
        byteSize: number;
        contentType: string;
        deliveryHref: string;
        filename?: string;
        id: string;
        kind: string;
        label: string;
        provider: string;
        status: string;
        storageKey: string;
      };
      assetId: string;
      contentType: string;
      href: string;
      key: string;
      size: number;
    };

    expect(body).toEqual({
      asset: {
        byteSize: pngBytes.byteLength,
        contentType: "image/png",
        deliveryHref: body.href,
        filename: "hero.png",
        id: body.assetId,
        kind: "image",
        label: "hero.png",
        provider: "r2",
        status: "ready",
        storageKey: body.key,
      },
      assetId: expect.stringMatching(/^[0-9a-f-]+\.png$/),
      contentType: "image/png",
      href: expect.stringMatching(/^\/api\/formless\/media\/media\/images\/.+\.png$/),
      key: expect.stringMatching(/^media\/images\/.+\.png$/),
      size: pngBytes.byteLength,
    });
    expect(body.href).toBe(`${CORE_MEDIA_ROUTE_PREFIX}${body.key}`);
    expect(body.key).toBe(`${CORE_IMAGE_KEY_PREFIX}/${body.assetId}`);
    await expectMediaObjectCustomMetadata(harness, body.key, {
      "formless-media-asset-id": body.assetId,
      "formless-media-byte-size": String(pngBytes.byteLength),
      "formless-media-content-type": "image/png",
      "formless-media-delivery-href": body.href,
      "formless-media-filename": "hero.png",
      "formless-media-kind": "image",
      "formless-media-label": "hero.png",
      "formless-media-provider": "r2",
      "formless-media-status": "ready",
      "formless-media-storage-key": body.key,
    });

    const served = await harness.fetch(body.href);

    expect(served.status).toBe(200);
    expect(served.headers.get("Content-Type")).toBe("image/png");
    expect(served.headers.get("Cache-Control")).toBe(MEDIA_OBJECT_CACHE_CONTROL);
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(pngBytes);
  });

  it("lists core image media assets for generated media selectors", async () => {
    const upload = await uploadCoreImage(harness, imageFile("hero.png", "image/png", pngBytes));
    const uploaded = (await upload.json()) as {
      assetId: string;
      href: string;
      key: string;
    };
    const list = await harness.fetch("/api/formless/media/images");

    expect(list.status).toBe(200);
    expect(list.headers.get("Cache-Control")).toBe("no-store");
    expect((await list.json()) as unknown).toEqual({
      assets: [
        expect.objectContaining({
          deliveryHref: uploaded.href,
          id: uploaded.assetId,
          kind: "image",
          label: "hero.png",
          storageKey: uploaded.key,
        }),
      ],
    });
  });

  it("uses the same write authorization boundaries for core media assets", async () => {
    const rejected = await uploadCoreImage(
      guardedHarness,
      imageFile("rejected.png", "image/png", pngBytes),
    );
    const adminAccepted = await uploadCoreImage(
      guardedHarness,
      imageFile("admin.png", "image/png", pngBytes),
      {
        Authorization: `Bearer ${adminToken}`,
      },
    );
    expect(adminAccepted.status).toBe(200);
    const body = (await adminAccepted.json()) as {
      href: string;
      key: string;
    };
    const ownerAccepted = await uploadCoreImage(
      guardedHarness,
      imageFile("owner.png", "image/png", pngBytes),
      await ownerSessionHeaders(),
    );

    expect(rejected.status).toBe(401);
    expect(ownerAccepted.status).toBe(200);

    const served = await guardedHarness.fetch(body.href);

    expect(body.key).toMatch(/^media\/images\/.+\.png$/);
    expect(served.status).toBe(200);
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(pngBytes);
    await expectMediaBucketKeysUnordered(guardedHarness, [
      expect.stringMatching(/^media\/images\/.+\.png$/),
      expect.stringMatching(/^media\/images\/.+\.png$/),
    ]);
  });

  it("rejects missing, repeated, unsupported, and oversized core image uploads before R2 writes", async () => {
    const cases = [
      await uploadForm(harness, multipartFormData([])),
      await uploadForm(
        harness,
        multipartFormData([
          imageFile("first.png", "image/png", pngBytes),
          imageFile("second.png", "image/png", pngBytes),
        ]),
      ),
      await uploadCoreImage(harness, imageFile("icon.svg", "image/svg+xml", textBytes("<svg />"))),
      await uploadCoreImage(
        harness,
        imageFile("huge.jpg", "image/jpeg", new Uint8Array(MEDIA_IMAGE_UPLOAD_MAX_BYTES + 1)),
      ),
    ];

    expect(cases.map((response) => response.status)).toEqual([400, 400, 415, 413]);
    await expectMediaBucketKeys(harness, []);
  });

  it("restores core media to an exact guarded R2 key", async () => {
    const key = "media/images/restored.png";
    const rejected = await restoreCoreMedia(guardedHarness, key, "image/png", pngBytes);
    const accepted = await restoreCoreMedia(guardedHarness, key, "image/png", pngBytes, {
      Authorization: `Bearer ${adminToken}`,
    });

    expect(rejected.status).toBe(401);
    expect(accepted.status).toBe(200);
    expect((await accepted.json()) as unknown).toEqual({
      contentType: "image/png",
      href: `${CORE_MEDIA_ROUTE_PREFIX}${key}`,
      key,
      size: pngBytes.byteLength,
    });
    await expectMediaBucketKeys(guardedHarness, [key]);

    const served = await guardedHarness.fetch(`${CORE_MEDIA_ROUTE_PREFIX}${key}`);

    expect(served.status).toBe(200);
    expect(served.headers.get("Content-Type")).toBe("image/png");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(pngBytes);
  });

  it("accepts owner session cookies for core media writes when configured", async () => {
    const headers = await ownerSessionHeaders();
    const upload = await uploadCoreImage(
      guardedHarness,
      imageFile("hero.png", "image/png", pngBytes),
      headers,
    );
    const restore = await restoreCoreMedia(
      guardedHarness,
      "media/images/restored-by-owner.png",
      "image/png",
      pngBytes,
      headers,
    );

    expect(upload.status).toBe(200);
    expect(restore.status).toBe(200);
    await expectMediaBucketKeysUnordered(guardedHarness, [
      expect.stringMatching(/^media\/images\/.+\.png$/),
      "media/images/restored-by-owner.png",
    ]);
  });

  it("authorizes Program editors for core image uploads", async () => {
    const editor = await createPrincipalSession({
      displayName: "Program Editor",
      role: "editor",
    });
    const uploaded = await uploadCoreImage(
      guardedHarness,
      imageFile("editor.png", "image/png", pngBytes),
      editor.headers,
    );

    expect(uploaded.status).toBe(200);
    await expectMediaBucketKeys(guardedHarness, [
      expect.stringMatching(/^media\/images\/.+\.png$/),
    ]);
  });

  it("rejects invalid core media restore keys and mismatched content types", async () => {
    const invalidKey = await restoreCoreMedia(
      harness,
      "media/videos/clip.mp4",
      "video/mp4",
      pngBytes,
    );
    const mismatchedContentType = await restoreCoreMedia(
      harness,
      "media/images/restored.png",
      "image/jpeg",
      pngBytes,
    );
    expect(invalidKey.status).toBe(400);
    expect(
      (await invalidKey.json()) as {
        error: string;
      },
    ).toEqual({
      error: "Unsupported media restore key.",
    });
    expect(mismatchedContentType.status).toBe(415);
    expect(
      (await mismatchedContentType.json()) as {
        error: string;
      },
    ).toEqual({
      error: "Media restore content type must match the media key.",
    });
    await expectMediaBucketKeys(harness, []);
  });

  it("keeps core media reads open when the admin token is configured", async () => {
    const bucket = await guardedHarness.mf.getR2Bucket(mediaBinding);
    const key = "media/images/public.png";

    await bucket.put(key, pngBytes, {
      httpMetadata: {
        cacheControl: MEDIA_OBJECT_CACHE_CONTROL,
        contentType: "image/png",
      },
    });

    const response = await guardedHarness.fetch(`${CORE_MEDIA_ROUTE_PREFIX}${key}`);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(pngBytes);
  });

  it("returns core media HEAD headers without a response body", async () => {
    const bucket = await harness.mf.getR2Bucket(mediaBinding);
    const key = "media/images/head.png";

    await bucket.put(key, pngBytes, {
      httpMetadata: {
        cacheControl: MEDIA_OBJECT_CACHE_CONTROL,
        contentType: "image/png",
      },
    });

    const getResponse = await harness.fetch(`${CORE_MEDIA_ROUTE_PREFIX}${key}`);
    const headResponse = await harness.fetch(`${CORE_MEDIA_ROUTE_PREFIX}${key}`, {
      method: "HEAD",
    });

    expect(headResponse.status).toBe(getResponse.status);
    expect(headResponse.headers.get("Content-Type")).toBe(getResponse.headers.get("Content-Type"));
    expect(headResponse.headers.get("Cache-Control")).toBe(
      getResponse.headers.get("Cache-Control"),
    );
    expect(headResponse.headers.get("ETag")).toBe(getResponse.headers.get("ETag"));
    expect((await headResponse.arrayBuffer()).byteLength).toBe(0);
  });

  it("uses Program field policy and role authorization for global public and private documents", async () => {
    await configureProgramDocumentSchema();

    const editor = await createPrincipalSession({
      displayName: "Program Document Editor",
      role: "editor",
    });
    const member = await createPrincipalSession({
      displayName: "Program Document Member",
      role: "member",
    });
    const privateUpload = await uploadProgramDocument(
      privateDocumentField,
      documentFile("program-private.pdf"),
      editor.headers,
    );
    const publicUpload = await uploadProgramDocument(
      publicDocumentField,
      documentFile("program-public.pdf"),
      editor.headers,
    );

    await expectResponseStatus(privateUpload, 200);
    await expectResponseStatus(publicUpload, 200);

    const privateAsset = (
      (await privateUpload.json()) as {
        asset: DocumentMediaAsset;
      }
    ).asset;
    const publicAsset = (
      (await publicUpload.json()) as {
        asset: DocumentMediaAsset;
      }
    ).asset;
    const anonymousList = await listProgramDocuments(privateDocumentField);
    const memberList = await listProgramDocuments(privateDocumentField, member.headers);
    const editorPrivateList = await listProgramDocuments(privateDocumentField, editor.headers);
    const editorPublicList = await listProgramDocuments(publicDocumentField, editor.headers);
    const anonymousPrivateRead = await guardedHarness.fetch(privateAsset.deliveryHref);
    const memberPrivateRead = await guardedHarness.fetch(privateAsset.deliveryHref, {
      headers: member.headers,
    });
    const anonymousPublicRead = await guardedHarness.fetch(publicAsset.deliveryHref);

    expect(privateAsset).toMatchObject({
      access: "private",
      contentType: "application/pdf",
      deliveryHref: expect.stringMatching(/^\/api\/formless\/program\/media\/documents\/.+\.pdf$/),
      kind: "document",
      storageKey: expect.stringMatching(/^media\/program\/documents\/.+\.pdf$/),
    });
    expect(privateAsset).not.toHaveProperty("ownerAppInstallId");
    expect(publicAsset).toMatchObject({
      access: "public",
      kind: "document",
      storageKey: expect.stringMatching(/^media\/program\/documents\/.+\.pdf$/),
    });
    expect(publicAsset).not.toHaveProperty("ownerAppInstallId");
    expect(anonymousList.status).toBe(401);
    expect(memberList.status).toBe(401);
    expect((await editorPrivateList.json()) as unknown).toEqual({
      assets: [privateAsset],
    });
    expect((await editorPublicList.json()) as unknown).toEqual({
      assets: [publicAsset],
    });
    expect(anonymousPrivateRead.status).toBe(401);
    expect(memberPrivateRead.status).toBe(200);
    expect(memberPrivateRead.headers.get("Cache-Control")).toBe(
      MEDIA_PRIVATE_DOCUMENT_CACHE_CONTROL,
    );
    expect(new Uint8Array(await memberPrivateRead.arrayBuffer())).toEqual(pdfBytes);
    expect(anonymousPublicRead.status).toBe(200);
    expect(anonymousPublicRead.headers.get("Cache-Control")).toBe(MEDIA_OBJECT_CACHE_CONTROL);
    expect(new Uint8Array(await anonymousPublicRead.arrayBuffer())).toEqual(pdfBytes);
    await expectMediaBucketKeysUnordered(guardedHarness, [
      privateAsset.storageKey,
      publicAsset.storageKey,
    ]);
  });
});

async function configureProgramDocumentSchema() {
  const schemaPath = `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/schema`;
  const current = await guardedHarness.fetch(schemaPath, {
    headers: adminHeaders(),
  });
  expect(current.status).toBe(200);
  const body = (await current.json()) as SchemaResponse;
  const schema = programDocumentSchema(body.schema);
  const update = await guardedHarness.fetch(schemaPath, {
    body: JSON.stringify({ schema }),
    headers: adminHeaders({ "Content-Type": "application/json" }),
    method: "POST",
  });

  expect(update.status).toBe(200);
}

function programDocumentSchema(source: SchemaResponse["schema"]) {
  const schema = structuredClone(source);
  const task = schema.entities.find((definition) => definition.key === "task");

  if (!task) {
    throw new Error("Expected Program Task schema.");
  }

  setKeyedDefinition(task.fields, privateDocumentField, {
    asset: {
      acceptedMimeTypes: ["application/pdf"],
      access: "private",
      kind: "document",
      maxBytes: 1024,
    },
    label: "Private Program report",
    required: false,
    type: "text",
  });
  setKeyedDefinition(task.fields, publicDocumentField, {
    asset: {
      acceptedMimeTypes: ["application/pdf"],
      access: "public",
      kind: "document",
      maxBytes: 1024,
    },
    label: "Public Program report",
    required: false,
    type: "text",
  });
  return schema;
}

async function createPrincipalSession(input: {
  displayName: string;
  role: "administrator" | "editor" | "member";
}) {
  const key = input.displayName.replace(/\W+/g, "-").toLowerCase();
  const principal = await postIdentityRecordOperation({
    entity: "principal",
    idempotencyKey: `document-media-principal-${key}`,
    operationName: "create",
    input: {
      displayName: input.displayName,
      kind: "human",
      status: "active",
    },
  });

  await postIdentityRecordOperation({
    entity: "program-role-assignment",
    idempotencyKey: `document-media-role-${key}`,
    operationName: "create",
    input: {
      principal: principal.id,
      roleId: programRoleId(input.role),
      status: "active",
    },
  });
  return {
    headers: await centralSessionHeaders(principal.id),
    principalId: principal.id,
  };
}

function programRoleId(roleKey: "administrator" | "editor" | "member"): string {
  const role = formlessProgramSchema.authorization?.roles.find(
    (candidate) => candidate.key === roleKey,
  );

  if (!role) {
    throw new Error(`Expected Program role "${roleKey}".`);
  }

  return role.id;
}

async function postIdentityRecordOperation(input: Parameters<typeof recordOperationRequest>[0]) {
  const operation = recordOperationRequest(input);
  const ownerIdentity = await ensureTestIdentityOwner(guardedHarness, adminToken, owner);
  const response = await guardedHarness.fetch(
    `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}${operation.path.slice("/api".length)}`,
    {
      body: JSON.stringify(operation.body),
      headers: {
        ...(await centralSessionHeaders(ownerIdentity.id)),
        "Content-Type": "application/json",
      },
      method: "POST",
    },
  );

  expect({
    body: await response.clone().text(),
    status: response.status,
  }).toEqual({
    body: expect.any(String),
    status: 200,
  });

  return operation.response((await response.json()) as OperationInvocationResponse).record;
}

async function centralSessionHeaders(principalId: string) {
  const response = await guardedHarness.durableObjectFetch(
    "FORMLESS_AUTHORITY",
    FORMLESS_INSTANCE_AUTHORITY_NAME,
    "/harness/auth/central-session",
    {
      body: JSON.stringify({ principalId }),
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-host": "example.com",
        "x-forwarded-proto": "https",
      },
      method: "POST",
    },
  );

  expect(response.status).toBe(200);

  const cookie = response.headers.get("Set-Cookie");

  if (!cookie || !cookie.includes(`${CENTRAL_AUTH_SESSION_COOKIE_NAME}=`)) {
    throw new Error("Central auth session harness did not return a session cookie.");
  }

  return {
    Cookie: cookiePair(cookie),
    "x-forwarded-host": "example.com",
    "x-forwarded-proto": "https",
  };
}

function uploadProgramDocument(
  fieldName: string,
  file: TestFile,
  headers: Record<string, string> = {},
) {
  return uploadForm(
    guardedHarness,
    multipartFormData([file]),
    headers,
    programDocumentCollectionPath(fieldName),
  );
}

function listProgramDocuments(fieldName: string, headers: Record<string, string> = {}) {
  return guardedHarness.fetch(programDocumentCollectionPath(fieldName), { headers });
}

function programDocumentCollectionPath(fieldName: string) {
  const query = new URLSearchParams({
    entity: "task",
    field: fieldName,
  });

  return `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/media/documents?${query.toString()}`;
}

function documentFile(name: string): TestFile {
  return {
    content: pdfBytes,
    name,
    type: "application/pdf",
  };
}

async function uploadCoreImage(
  harness: Harness,
  file: TestFile,
  headers: Record<string, string> = {},
) {
  return uploadForm(harness, multipartFormData([file]), headers, "/api/formless/media/images");
}

async function uploadForm(
  harness: Harness,
  formData: ReturnType<typeof multipartFormData>,
  headers: Record<string, string> = {},
  path = "/api/formless/media/images",
) {
  return harness.fetch(path, {
    body: formData.body.buffer,
    headers: {
      ...headers,
      "Content-Type": `multipart/form-data; boundary=${formData.boundary}`,
    },
    method: "POST",
  });
}

async function restoreCoreMedia(
  harness: Harness,
  key: string,
  contentType: string,
  body: Uint8Array,
  headers: Record<string, string> = {},
) {
  return harness.fetch(`${CORE_MEDIA_ROUTE_PREFIX}${key}`, {
    body,
    headers: {
      ...headers,
      "Content-Type": contentType,
    },
    method: "PUT",
  });
}

function multipartFormData(files: TestFile[]) {
  const boundary = `formless-test-${crypto.randomUUID()}`;
  const chunks: Uint8Array[] = [];

  for (const file of files) {
    chunks.push(
      textBytes(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`,
      ),
      file.content,
      textBytes("\r\n"),
    );
  }

  chunks.push(textBytes(`--${boundary}--\r\n`));

  return {
    body: concatBytes(chunks),
    boundary,
  };
}

function imageFile(name: string, type: string, content: Uint8Array): TestFile {
  return { content, name, type };
}

function textBytes(value: string) {
  return new TextEncoder().encode(value);
}

function concatBytes(chunks: Uint8Array[]) {
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const output = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
}

async function clearMediaBucket(harness: Harness) {
  const bucket = await harness.mf.getR2Bucket(mediaBinding);
  const objects = await bucket.list();

  if (objects.objects.length > 0) {
    await bucket.delete(objects.objects.map((object) => object.key));
  }
}

async function expectMediaBucketKeys(harness: Harness, expected: unknown[]) {
  const bucket = await harness.mf.getR2Bucket(mediaBinding);
  const objects = await bucket.list();

  expect(objects.objects.map((object) => object.key)).toEqual(expected);
}

async function expectMediaBucketKeysUnordered(harness: Harness, expected: unknown[]) {
  const bucket = await harness.mf.getR2Bucket(mediaBinding);
  const objects = await bucket.list();
  const keys = objects.objects.map((object) => object.key);

  expect(keys).toHaveLength(expected.length);
  expect(keys).toEqual(expect.arrayContaining(expected));
}

async function expectMediaObjectCustomMetadata(
  harness: Harness,
  key: string,
  expected: Record<string, string>,
) {
  const bucket = await harness.mf.getR2Bucket(mediaBinding);
  const object = await bucket.get(key);

  expect(object?.customMetadata).toEqual(expected);
}

async function expectResponseStatus(response: HarnessResponse, status: number) {
  expect({
    body: await response.clone().text(),
    status: response.status,
  }).toEqual({
    body: expect.any(String),
    status,
  });
}

async function ownerSessionHeaders() {
  const identityOwner = await ensureTestIdentityOwner(guardedHarness, adminToken, owner);
  const created = await createOwnerSessionCookie({
    env: { FORMLESS_OWNER_SESSION_SECRET: sessionSecret },
    maxAgeSeconds: 60,
    now: "2999-01-01T00:00:00.000Z",
    owner: identityOwner,
    request: new Request("http://example.com/admin"),
  });

  return {
    Cookie: cookiePair(created.cookie),
  };
}

function cookiePair(cookie: string) {
  return cookie.split(";")[0] ?? cookie;
}

function adminHeaders(headers: Record<string, string> = {}) {
  return {
    ...headers,
    Authorization: `Bearer ${adminToken}`,
  };
}

async function writeMediaWorkerHarness(directory: string) {
  const path = join(directory, "media-worker-harness.ts");

  await writeFile(
    path,
    `
      import worker, { FormlessAuthority } from "${process.cwd()}/src/worker/index.ts";
      import { createCentralAuthSessionCookie } from "${process.cwd()}/src/worker/central-auth-session.ts";
      import { writeInstanceAuthConfig } from "${process.cwd()}/src/worker/instance-auth-state.ts";

      export class MediaWorkerHarnessAuthority extends FormlessAuthority {
        async fetch(request) {
          const url = new URL(request.url);

          if (url.pathname === "/harness/auth/central-session" && request.method === "POST") {
            const body = await request.json();

            writeInstanceAuthConfig(this.ctx.storage, {
              canonicalOrigin: "https://example.com",
              relyingPartyId: url.hostname,
              relyingPartyName: "Formless Test",
            });

            const created = await createCentralAuthSessionCookie(this.ctx.storage, {
              env: this.env,
              maxAgeSeconds: 60,
              now: "2999-01-01T00:00:00.000Z",
              principalId: body.principalId,
              request,
            });

            return Response.json(
              { session: created.session },
              { headers: { "Set-Cookie": created.cookie } },
            );
          }

          return super.fetch(request);
        }
      }

      export default worker;
    `,
  );

  return path;
}
