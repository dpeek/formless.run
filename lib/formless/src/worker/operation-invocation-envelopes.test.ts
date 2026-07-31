import { describe, expect, it } from "vite-plus/test";

import type { AppSchema } from "@dpeek/formless-schema";
import { programStorageIdentity } from "../shared/app-storage-identity.ts";
import type { PublicOperationProof } from "../shared/protocol.ts";
import { sourceLikeTaskSchema } from "../test/schema-builders.ts";
import { BadRequestError } from "./errors.ts";
import {
  buildProtocolOperationInvocationEnvelope,
  buildUnverifiedPublicOperationInvocationEnvelope,
  buildVerifiedPublicOperationInvocationEnvelope,
} from "./operation-invocation-envelopes.ts";

describe("operation invocation envelope construction", () => {
  it("builds protocol envelopes from private route and caller facts", () => {
    const envelope = buildProtocolOperationInvocationEnvelope({
      body: {
        idempotencyKey: "create-task-1",
        invocationId: "operation:ignored",
        input: {
          title: "Envelope task",
          done: false,
        },
        source: {
          protocol: "generated-ui",
          surface: "taskHome",
        },
      },
      identity: programStorageIdentity(),
      method: "POST",
      path: "/operations/task/create",
      receivedAt: "2026-06-27T00:00:00.000Z",
      route: {
        entityName: "task",
        operationName: "create",
      },
      schema: sourceLikeTaskSchema(),
    });

    expect(envelope).toMatchObject({
      actor: { kind: "owner" },
      idempotency: {
        key: "create-task-1",
        required: true,
        source: "caller",
        writeIdentity: "operation:task.create:create-task-1",
      },
      input: {
        type: "create",
        values: {
          title: "Envelope task",
          done: false,
        },
      },
      invocationId: "operation:task.create:create-task-1",
      operation: {
        canonicalKey: "task.create",
        entityName: "task",
        kind: "create",
        operationName: "create",
      },
      receivedAt: "2026-06-27T00:00:00.000Z",
      source: {
        protocol: "generated-ui",
        route: "/operations/task/create",
        surface: "taskHome",
      },
    });
  });

  it("builds authenticated protocol envelopes with principal and target session facts", () => {
    const envelope = buildProtocolOperationInvocationEnvelope({
      actor: {
        kind: "authenticated",
        principalId: "principal-ada",
        sessionTarget: authenticatedSessionTarget(),
      },
      body: {
        idempotencyKey: "create-task-authenticated",
        input: {
          title: "Authenticated envelope task",
          done: false,
        },
        source: {
          protocol: "generated-ui",
          host: "tasks.example.com",
          path: "/tasks",
        },
      },
      identity: programStorageIdentity(),
      method: "POST",
      path: "/operations/task/create",
      receivedAt: "2026-06-27T00:10:00.000Z",
      route: {
        entityName: "task",
        operationName: "create",
      },
      schema: sourceLikeTaskSchema(),
    });

    expect(envelope).toMatchObject({
      actor: {
        kind: "authenticated",
        principalId: "principal-ada",
        sessionTarget: authenticatedSessionTarget(),
      },
      idempotency: {
        key: "create-task-authenticated",
        writeIdentity: "operation:task.create:create-task-authenticated",
      },
      source: {
        protocol: "generated-ui",
        route: "/operations/task/create",
        host: "tasks.example.com",
        path: "/tasks",
      },
    });
  });
  it("uses trusted runtime write identity and protocol source defaults", () => {
    const schema = sourceLikeTaskSchema();
    const createOperation = schema.entities
      .find((definition) => definition.key === "task")
      ?.operations!.find((definition) => definition.key === "create")!;
    if (!createOperation) {
      throw new Error("Expected task create operation.");
    }

    createOperation.idempotency = { required: true, source: "runtime" };

    const envelope = buildProtocolOperationInvocationEnvelope({
      actorKind: "runner",
      body: {
        input: {
          title: "Runtime task",
          done: false,
        },
        runtimeWriteId: "runtime-write-1",
      },
      identity: programStorageIdentity(),
      method: "POST",
      path: "/operations/task/create",
      route: {
        entityName: "task",
        operationName: "create",
      },
      schema,
    });

    expect(envelope.idempotency).toEqual({
      key: "runtime-write-1",
      required: true,
      source: "runtime",
      writeIdentity: "operation:task.create:runtime-write-1",
    });
    expect(envelope.invocationId).toBe("operation:task.create:runtime-write-1");
    expect(envelope.source).toEqual({
      protocol: "runner",
      route: "/operations/task/create",
    });
  });

  it("preserves invocation id fallback for non-idempotent reads", () => {
    const schema = schemaWithListOperation();
    const envelope = buildProtocolOperationInvocationEnvelope({
      body: {
        invocationId: "operation:list-request",
      },
      identity: programStorageIdentity(),
      method: "GET",
      path: "/operations/task/activeList",
      route: {
        entityName: "task",
        operationName: "activeList",
      },
      schema,
    });

    expect(envelope.idempotency).toEqual({ required: false });
    expect(envelope.input).toEqual({ type: "list" });
    expect(envelope.invocationId).toBe("operation:list-request");
    expect(envelope.source).toEqual({
      protocol: "protocol",
      route: "/operations/task/activeList",
    });
  });

  it("rejects private write operation envelopes from GET requests", () => {
    expect(() =>
      buildProtocolOperationInvocationEnvelope({
        body: {
          idempotencyKey: "create-task-get",
          input: {
            title: "Invalid method",
            done: false,
          },
        },
        identity: programStorageIdentity(),
        method: "GET",
        path: "/operations/task/create",
        route: {
          entityName: "task",
          operationName: "create",
        },
        schema: sourceLikeTaskSchema(),
      }),
    ).toThrow(BadRequestError);
  });

  it("builds unverified public envelopes with public source facts and no proof", () => {
    const envelope = buildUnverifiedPublicOperationInvocationEnvelope({
      identity: programStorageIdentity(),
      idempotencyKey: "public-create-1",
      publicInput: {
        title: "Public task",
        done: false,
      },
      receivedAt: "2026-06-27T01:00:00.000Z",
      route: {
        entityName: "task",
        operationName: "publicCreate",
      },
      schema: publicEnvelopeSchema(),
      source: {
        host: "example.com",
        path: "/api/tasks/public/operations/task/publicCreate",
        siteBlockId: "rec_site_public_create",
      },
    });

    expect(envelope).toMatchObject({
      actor: { kind: "anonymous" },
      idempotency: {
        key: "public-create-1",
        required: true,
        source: "caller",
        writeIdentity: "operation:task.publicCreate:public-create-1",
      },
      input: {
        type: "create",
        values: {
          title: "Public task",
          done: false,
        },
      },
      invocationId: "operation:task.publicCreate:public-create-1",
      operation: {
        canonicalKey: "task.publicCreate",
        entityName: "task",
        kind: "create",
        operationName: "publicCreate",
      },
      receivedAt: "2026-06-27T01:00:00.000Z",
      source: {
        protocol: "public",
        host: "example.com",
        path: "/api/tasks/public/operations/task/publicCreate",
        siteBlockId: "rec_site_public_create",
      },
    });
    expect(JSON.stringify(envelope)).not.toContain("turnstile-token");
    expect(JSON.stringify(envelope)).not.toContain("proof");
  });

  it("builds challenge-free public list envelopes without idempotency reservation", () => {
    const envelope = buildUnverifiedPublicOperationInvocationEnvelope({
      identity: programStorageIdentity(),
      invocationId: "operation:public-read-1",
      publicInput: {
        lookup: "CODE-ALPHA",
      },
      receivedAt: "2026-06-27T01:02:00.000Z",
      route: {
        entityName: "task",
        operationName: "publicLookup",
      },
      schema: publicEnvelopeSchema(),
      source: {
        host: "example.com",
        path: "/api/tasks/public/operations/task/publicLookup",
      },
    });

    expect(envelope).toMatchObject({
      actor: { kind: "anonymous" },
      idempotency: {
        required: false,
      },
      input: {
        type: "list",
        input: {
          lookup: "CODE-ALPHA",
        },
      },
      invocationId: "operation:public-read-1",
      operation: {
        canonicalKey: "task.publicLookup",
        kind: "list",
      },
      source: {
        protocol: "public",
        host: "example.com",
        path: "/api/tasks/public/operations/task/publicLookup",
      },
    });
    expect(envelope.idempotency).not.toHaveProperty("key");
    expect(envelope.idempotency).not.toHaveProperty("writeIdentity");
    expect(JSON.stringify(envelope)).not.toContain("proof");
  });

  it("builds verified public handler command envelopes with verified proof facts", () => {
    const proofFacts = publicTurnstileProofFacts();
    const proof = publicTurnstileProof(proofFacts);
    const envelope = buildVerifiedPublicOperationInvocationEnvelope({
      identity: programStorageIdentity(),
      idempotencyKey: "public-handler-1",
      proof: proofFacts,
      publicInput: {
        email: "ada@example.com",
      },
      receivedAt: "2026-06-27T01:05:00.000Z",
      route: {
        entityName: "task",
        operationName: "publicHandler",
      },
      schema: publicEnvelopeSchema(),
      source: {
        host: "example.com",
        path: "/api/tasks/public/operations/task/publicHandler",
      },
    });

    expect(envelope.input).toEqual({
      type: "command",
      input: {
        input: {
          email: "ada@example.com",
        },
        proof,
      },
    });
    expect(envelope.source).toEqual({
      protocol: "public",
      host: "example.com",
      path: "/api/tasks/public/operations/task/publicHandler",
    });
  });

  it("keeps verified proof facts out of public record-plan command input", () => {
    const envelope = buildVerifiedPublicOperationInvocationEnvelope({
      identity: programStorageIdentity(),
      idempotencyKey: "public-plan-1",
      proof: publicTurnstileProofFacts(),
      publicInput: {
        title: "Plan task",
      },
      route: {
        entityName: "task",
        operationName: "publicRecordPlan",
      },
      schema: publicEnvelopeSchema(),
      source: {
        host: "example.com",
        path: "/api/tasks/public/operations/task/publicRecordPlan",
      },
    });

    expect(envelope.input).toEqual({
      type: "command",
      input: {
        title: "Plan task",
      },
    });
    expect(JSON.stringify(envelope.input)).not.toContain("turnstile-token");
    expect(JSON.stringify(envelope.input)).not.toContain("proof");
  });
});
function schemaWithListOperation() {
  const schema = sourceLikeTaskSchema();
  const task = schema.entities.find((definition) => definition.key === "task")!;
  if (!task) {
    throw new Error("Expected task entity.");
  }
  task.operations = [
    ...(task.operations ?? []),
    {
      label: "Active tasks",
      kind: "list",
      scope: "collection",
      target: { query: "taskActive" },
      output: {
        type: "list",
        query: "taskActive",
      },
      idempotency: {
        required: false,
      },
      audit: { input: "summary" },
      key: "activeList",
    },
  ];
  return schema;
}
function publicEnvelopeSchema(): AppSchema {
  const schema = sourceLikeTaskSchema();
  const task = schema.entities.find((definition) => definition.key === "task")!;
  if (!task) {
    throw new Error("Expected task entity.");
  }
  task.operations = [
    ...(task.operations ?? []),
    {
      label: "Public lookup",
      kind: "list",
      scope: "collection",
      target: { query: "taskActive" },
      input: {
        fields: [
          {
            key: "lookup",
            type: "text",
            required: true,
            label: "Lookup",
          },
        ],
      },
      output: {
        type: "list",
        query: "taskActive",
        maxResults: 2,
      },
      idempotency: {
        required: false,
      },
      audit: {
        input: "summary",
      },
      policy: {
        actors: ["anonymous"],
        access: {
          actor: "anonymous",
          origin: { kind: "same-origin" },
          rateLimit: { maxRequests: 10, windowSeconds: 60 },
        },
        responseFields: {
          anonymous: ["title"],
        },
      },
      key: "publicLookup",
    },
    {
      label: "Public create",
      kind: "create",
      scope: "collection",
      input: {
        fields: [
          {
            key: "title",
            field: "title",
          },
          {
            key: "done",
            field: "done",
          },
        ],
      },
      effect: {
        type: "createRecord",
      },
      output: {
        type: "create",
      },
      idempotency: {
        required: true,
      },
      audit: {
        input: "summary",
      },
      policy: anonymousTurnstilePolicy(),
      key: "publicCreate",
    },
    {
      label: "Public handler",
      kind: "command",
      scope: "collection",
      input: {
        fields: [
          {
            key: "email",
            type: "text",
            required: true,
            label: "Email",
          },
        ],
      },
      effect: {
        type: "operationHandler",
        handler: "subscribe",
        config: {},
      },
      output: {
        type: "command",
      },
      idempotency: {
        required: true,
      },
      audit: {
        input: "summary",
      },
      policy: anonymousTurnstilePolicy(),
      key: "publicHandler",
    },
    {
      label: "Public record plan",
      kind: "command",
      scope: "collection",
      input: {
        fields: [
          {
            key: "title",
            field: "title",
          },
        ],
      },
      effect: {
        type: "recordPlan",
        steps: [],
      },
      output: {
        type: "command",
      },
      idempotency: {
        required: true,
      },
      audit: {
        input: "summary",
      },
      policy: anonymousTurnstilePolicy(),
      key: "publicRecordPlan",
    },
  ];
  return schema;
}
function anonymousTurnstilePolicy() {
  return {
    actors: ["anonymous" as const],
    access: {
      actor: "anonymous" as const,
      challenge: {
        kind: "turnstile" as const,
      },
      origin: {
        kind: "same-origin" as const,
      },
    },
  };
}

function authenticatedSessionTarget() {
  return {
    appInstallId: "tasks",
    instanceId: "instance-1",
    routeId: "route-tasks",
    storageIdentity: "app:tasks",
    targetOrigin: "https://tasks.example.com",
    targetProfile: "app" as const,
  };
}

function publicTurnstileProofFacts() {
  return {
    turnstileToken: "turnstile-token-ok",
    verification: {
      kind: "turnstile",
      success: true,
      verifiedAt: "2026-06-27T01:04:00.000Z",
      hostname: "example.com",
    },
  } as const;
}

function publicTurnstileProof(
  input: ReturnType<typeof publicTurnstileProofFacts>,
): PublicOperationProof {
  return {
    kind: "turnstile",
    token: input.turnstileToken,
    verification: input.verification,
  };
}
