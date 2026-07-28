import { setKeyedDefinition } from "../test/schema-definition-test-helpers.ts";
import type { RecordValues, StoredRecord } from "@dpeek/formless-storage";
import type { AppSchema } from "@dpeek/formless-schema";
import { describe, expect, it } from "vite-plus/test";

import { schemaKeyStorageIdentity } from "../shared/app-storage-identity.ts";
import type {
  OperationInvocationEnvelope,
  OperationInvocationOutput,
  OperationInvocationResponse,
} from "../shared/operation-invocation.ts";
import type { ChangeRow } from "../shared/protocol.ts";
import {
  executePublicOperationExecutor,
  PublicOperationError,
  type PublicOperationChallengeAdapterInput,
  type PublicOperationExecutorAdapters,
} from "./public-operation-executor.ts";
import type {
  PublicOperationReadRateLimitAdapterInput,
  PublicOperationReadRateLimitDecision,
} from "./public-operation-read-rate-limit.ts";
import { shapePublicOperationResponse } from "./public-operation-response.ts";
import { workerSchemaAppDefinitions } from "./schema-apps.ts";

describe("public operation executor adapters", () => {
  it("shapes committed public responses before after-commit adapters run", async () => {
    const events: string[] = [];
    const harness = publicOperationExecutorHarness({
      events,
      output: createPublicCreateOutput(),
    });

    const result = await executePublicOperationExecutor({
      adapters: harness.adapters,
      body: publicContactMessageBody("adapter-create"),
      identity: schemaKeyStorageIdentity("site"),
      request: publicOperationRequest("/api/site/public/operations/contact-message/submit"),
      route: {
        entityName: "contact-message",
        operationName: "submit",
        path: "/api/site/public/operations/contact-message/submit",
      },
      schema: workerSchemaAppDefinitions.site.sourceSchema,
    });

    expect(result.body).toMatchObject({
      operation: {
        canonicalKey: "contact-message.submit",
        kind: "create",
      },
      output: {
        type: "create",
      },
      status: "committed",
    });
    expect(events).toEqual(["shape", "afterCommit"]);
    expect(harness.state.afterCommitResponses).toHaveLength(1);
    expect(harness.state.authorityCalls).toBe(1);
    expect(harness.state.authorityEnvelopes[0]).toMatchObject({
      actor: { kind: "anonymous" },
      idempotency: {
        key: "adapter-create",
        source: "caller",
        writeIdentity: "operation:contact-message.submit:adapter-create",
      },
      operation: {
        canonicalKey: "contact-message.submit",
        kind: "create",
      },
      source: {
        host: "example.com",
        path: "/api/site/public/operations/contact-message/submit",
        protocol: "public",
        siteBlockId: "rec_site_contact_form",
      },
    });
    expect(harness.state.challengeCalls).toBe(1);
    expect(harness.state.challengeStages[0]).toMatchObject({
      idempotencyKey: "adapter-create",
      parsed: {
        input: {
          name: "Ada Lovelace",
          email: "ada@example.com",
          message: "Please send details.",
        },
        proof: { turnstileToken: "token-ok" },
        source: { siteBlockId: "rec_site_contact_form" },
      },
      requestUrlFacts: {
        host: "example.com",
        origin: "https://example.com",
        path: "/api/site/public/operations/contact-message/submit",
      },
      selected: {
        entityName: "contact-message",
        operationName: "submit",
      },
    });
    expect(harness.state.shapedResponses).toHaveLength(1);
  });

  it("shapes replayed public responses without challenge or after-commit adapters", async () => {
    const events: string[] = [];
    const harness = publicOperationExecutorHarness({
      events,
      output: createPublicCreateOutput(),
      recordExecutionStages: true,
      replayBeforeChallenge: true,
    });

    const result = await executePublicOperationExecutor({
      adapters: harness.adapters,
      body: publicContactMessageBody("adapter-replay"),
      identity: schemaKeyStorageIdentity("site"),
      request: publicOperationRequest("/api/site/public/operations/contact-message/submit"),
      route: {
        entityName: "contact-message",
        operationName: "submit",
        path: "/api/site/public/operations/contact-message/submit",
      },
      schema: workerSchemaAppDefinitions.site.sourceSchema,
    });

    expect(result.body.status).toBe("replayed");
    expect(events).toEqual(["validation", "shape"]);
    expect(harness.state.afterCommitResponses).toEqual([]);
    expect(harness.state.authorityCalls).toBe(0);
    expect(harness.state.challengeCalls).toBe(0);
    expect(harness.state.shapedResponses).toHaveLength(1);
  });

  it("validates input before rejecting malformed proof without challenge or Authority execution", async () => {
    const events: string[] = [];
    const harness = publicOperationExecutorHarness({
      events,
      output: createPublicCreateOutput(),
      recordExecutionStages: true,
    });

    const error = await captureRejection(
      executePublicOperationExecutor({
        adapters: harness.adapters,
        body: {
          ...publicContactMessageBody("adapter-malformed-proof"),
          proof: { turnstileToken: " " },
        },
        identity: schemaKeyStorageIdentity("site"),
        request: publicOperationRequest("/api/site/public/operations/contact-message/submit"),
        route: {
          entityName: "contact-message",
          operationName: "submit",
          path: "/api/site/public/operations/contact-message/submit",
        },
        schema: workerSchemaAppDefinitions.site.sourceSchema,
      }),
    );

    expect(error).toMatchObject({
      message: "Public operation Turnstile token is required.",
    });
    expect(events).toEqual(["validation"]);
    expect(harness.state.challengeCalls).toBe(0);
    expect(harness.state.authorityCalls).toBe(0);
    expect(harness.state.shapedResponses).toEqual([]);
    expect(harness.state.afterCommitResponses).toEqual([]);
  });

  it("runs validation and challenge before stopping failed challenges ahead of Authority execution", async () => {
    const events: string[] = [];
    const harness = publicOperationExecutorHarness({
      challengeError: new PublicOperationError("Public operation challenge failed.", 403),
      events,
      output: createPublicCreateOutput(),
      recordExecutionStages: true,
    });

    const error = await captureRejection(
      executePublicOperationExecutor({
        adapters: harness.adapters,
        body: publicContactMessageBody("adapter-failed-challenge"),
        identity: schemaKeyStorageIdentity("site"),
        request: publicOperationRequest("/api/site/public/operations/contact-message/submit"),
        route: {
          entityName: "contact-message",
          operationName: "submit",
          path: "/api/site/public/operations/contact-message/submit",
        },
        schema: workerSchemaAppDefinitions.site.sourceSchema,
      }),
    );

    expect(error).toBeInstanceOf(PublicOperationError);
    expect(error).toMatchObject({
      message: "Public operation challenge failed.",
      status: 403,
    });
    expect(events).toEqual(["validation", "challenge"]);
    expect(harness.state.challengeCalls).toBe(1);
    expect(harness.state.authorityCalls).toBe(0);
    expect(harness.state.shapedResponses).toEqual([]);
    expect(harness.state.afterCommitResponses).toEqual([]);
  });

  it("rejects missing and non-public operation selections before owned execution stages", async () => {
    const harness = publicOperationExecutorHarness({
      events: [],
      output: createPublicCreateOutput(),
      recordExecutionStages: true,
    });
    const route = {
      entityName: "contact-message",
      operationName: "missing",
      path: "/api/site/public/operations/contact-message/missing",
    };
    const missingError = await captureRejection(
      executePublicOperationExecutor({
        adapters: harness.adapters,
        body: publicContactMessageBody("missing-operation"),
        identity: schemaKeyStorageIdentity("site"),
        request: publicOperationRequest(route.path),
        route,
        schema: workerSchemaAppDefinitions.site.sourceSchema,
      }),
    );
    const nonPublicSchema = structuredClone(workerSchemaAppDefinitions.site.sourceSchema);
    const submit = nonPublicSchema.entities
      .find((definition) => definition.key === "contact-message")
      ?.operations!.find((definition) => definition.key === "submit")!;
    if (!submit) {
      throw new Error("Expected contact-message.submit operation.");
    }

    submit.policy = { actors: ["owner"] };
    const nonPublicError = await captureRejection(
      executePublicOperationExecutor({
        adapters: harness.adapters,
        body: publicContactMessageBody("non-public-operation"),
        identity: schemaKeyStorageIdentity("site"),
        request: publicOperationRequest("/api/site/public/operations/contact-message/submit"),
        route: {
          entityName: "contact-message",
          operationName: "submit",
          path: "/api/site/public/operations/contact-message/submit",
        },
        schema: nonPublicSchema,
      }),
    );

    for (const error of [missingError, nonPublicError]) {
      expect(error).toBeInstanceOf(PublicOperationError);
      expect(error).toMatchObject({
        message: "Public operation is not available.",
        status: 404,
      });
    }
    expect(harness.state.validatedInputs).toEqual([]);
    expect(harness.state.challengeCalls).toBe(0);
    expect(harness.state.authorityCalls).toBe(0);
    expect(harness.state.shapedResponses).toEqual([]);
    expect(harness.state.afterCommitResponses).toEqual([]);
  });
  it("parses request and source envelopes with exact public-safe errors", async () => {
    const cases: Array<{
      body: unknown;
      message: string;
    }> = [
      {
        body: null,
        message: "Public operation request must be an object.",
      },
      {
        body: {
          ...publicContactMessageBody("unsupported-request-key"),
          provider: "private",
        },
        message: 'Public operation request has unsupported key "provider".',
      },
      {
        body: {
          ...publicContactMessageBody("invalid-source"),
          source: "rec_site_contact_form",
        },
        message: "Public operation source must be an object.",
      },
      {
        body: {
          ...publicContactMessageBody("blank-source-block"),
          source: { siteBlockId: " " },
        },
        message: "Public operation source siteBlockId must be a non-empty string.",
      },
      {
        body: {
          ...publicContactMessageBody("invalid-idempotency"),
          idempotencyKey: "",
        },
        message: "Public operation idempotencyKey must be a non-empty string.",
      },
    ];

    for (const testCase of cases) {
      const harness = publicOperationExecutorHarness({
        events: [],
        output: createPublicCreateOutput(),
      });
      const error = await captureRejection(
        executePublicOperationExecutor({
          adapters: harness.adapters,
          body: testCase.body,
          identity: schemaKeyStorageIdentity("site"),
          request: publicOperationRequest("/api/site/public/operations/contact-message/submit"),
          route: {
            entityName: "contact-message",
            operationName: "submit",
            path: "/api/site/public/operations/contact-message/submit",
          },
          schema: workerSchemaAppDefinitions.site.sourceSchema,
        }),
      );

      expect(error).toMatchObject({ message: testCase.message });
      expect(harness.state.challengeCalls).toBe(0);
      expect(harness.state.authorityCalls).toBe(0);
    }
  });

  it("derives stable idempotency from canonical input and source facts", async () => {
    const firstHarness = publicOperationExecutorHarness({
      events: [],
      output: createPublicCreateOutput(),
    });
    const secondHarness = publicOperationExecutorHarness({
      events: [],
      output: createPublicCreateOutput(),
    });
    const changedSourceHarness = publicOperationExecutorHarness({
      events: [],
      output: createPublicCreateOutput(),
    });
    const firstBody = publicContactMessageBodyWithoutIdempotency({
      name: "Ada Lovelace",
      email: "ada@example.com",
      message: "Please send details.",
    });
    const reorderedBody = publicContactMessageBodyWithoutIdempotency({
      message: "Please send details.",
      email: "ada@example.com",
      name: "Ada Lovelace",
    });

    await executeContactMessage(firstHarness, firstBody);
    await executeContactMessage(secondHarness, reorderedBody);
    await executeContactMessage(changedSourceHarness, {
      ...firstBody,
      source: { siteBlockId: "different-block" },
    });

    const firstKey = firstHarness.state.challengeStages[0]?.idempotencyKey;
    const secondKey = secondHarness.state.challengeStages[0]?.idempotencyKey;
    const changedSourceKey = changedSourceHarness.state.challengeStages[0]?.idempotencyKey;

    expect(firstKey).toMatch(/^derived:[a-f0-9]{64}$/);
    expect(secondKey).toBe(firstKey);
    expect(changedSourceKey).not.toBe(firstKey);
    expect(firstHarness.state.authorityEnvelopes[0]).toMatchObject({
      invocationId: `operation:contact-message.submit:${firstKey}`,
      idempotency: {
        key: firstKey,
        writeIdentity: `operation:contact-message.submit:${firstKey}`,
      },
    });
  });

  it("builds verified command envelopes from parsed proof and source facts", async () => {
    const harness = publicOperationExecutorHarness({
      events: [],
      output: publicCommandOutput(),
    });

    await executePublicOperationExecutor({
      adapters: harness.adapters,
      body: {
        input: { email: "ada@example.com" },
        proof: { turnstileToken: "command-proof" },
        source: { siteBlockId: "subscribe-block" },
        idempotencyKey: "command-key",
      },
      identity: schemaKeyStorageIdentity("site"),
      request: publicOperationRequest("/api/site/public/operations/subscription/subscribe"),
      route: {
        entityName: "subscription",
        operationName: "subscribe",
        path: "/api/site/public/operations/subscription/subscribe",
      },
      schema: workerSchemaAppDefinitions.site.sourceSchema,
    });

    expect(harness.state.authorityEnvelopes[0]).toMatchObject({
      actor: { kind: "anonymous" },
      input: {
        type: "command",
        input: {
          input: { email: "ada@example.com" },
          proof: {
            kind: "turnstile",
            token: "command-proof",
            verification: {
              kind: "turnstile",
              success: true,
              verifiedAt: "2026-06-26T00:00:00.000Z",
            },
          },
        },
      },
      operation: {
        canonicalKey: "subscription.subscribe",
        kind: "command",
      },
      source: {
        host: "example.com",
        path: "/api/site/public/operations/subscription/subscribe",
        protocol: "public",
        siteBlockId: "subscribe-block",
      },
    });
  });

  it("uses original and local public request URL facts for same-origin evaluation", async () => {
    const forwardedHarness = publicOperationExecutorHarness({
      events: [],
      output: createPublicCreateOutput(),
    });
    const forwardedRequest = new Request(
      "http://authority.internal/api/site/public/operations/contact-message/submit",
      {
        headers: {
          Origin: "https://www.example.com",
          "x-formless-original-request-host": "www.example.com",
          "x-formless-original-request-origin": "https://www.example.com",
        },
        method: "POST",
      },
    );

    await executeContactMessage(
      forwardedHarness,
      publicContactMessageBody("forwarded-request"),
      forwardedRequest,
    );

    expect(forwardedHarness.state.challengeStages[0]).toMatchObject({
      requestUrlFacts: {
        host: "www.example.com",
        origin: "https://www.example.com",
        path: "/api/site/public/operations/contact-message/submit",
      },
      unverifiedEnvelope: {
        source: {
          host: "www.example.com",
          path: "/api/site/public/operations/contact-message/submit",
        },
      },
    });

    const localHarness = publicOperationExecutorHarness({
      events: [],
      output: createPublicCreateOutput(),
    });
    const localRequest = new Request(
      "http://127.0.0.1:8787/api/site/public/operations/contact-message/submit",
      {
        headers: { Origin: "https://preview.example" },
        method: "POST",
      },
    );

    await executeContactMessage(
      localHarness,
      publicContactMessageBody("local-request"),
      localRequest,
    );

    expect(localHarness.state.challengeStages[0]?.requestUrlFacts).toEqual({
      host: "preview.example",
      origin: "https://preview.example",
      path: "/api/site/public/operations/contact-message/submit",
    });
  });

  it("rejects cross-origin and malformed origins before validation or challenge", async () => {
    for (const origin of ["https://evil.example", "not an origin"]) {
      const events: string[] = [];
      const harness = publicOperationExecutorHarness({
        events,
        output: createPublicCreateOutput(),
        recordExecutionStages: true,
      });
      const request = new Request(
        "https://example.com/api/site/public/operations/contact-message/submit",
        { headers: { Origin: origin }, method: "POST" },
      );
      const error = await captureRejection(
        executeContactMessage(harness, publicContactMessageBody("origin-rejected"), request),
      );

      expect(error).toBeInstanceOf(PublicOperationError);
      expect(error).toMatchObject({
        message: "Public operation origin is not allowed.",
        status: 403,
      });
      expect(events).toEqual([]);
      expect(harness.state.validatedInputs).toEqual([]);
      expect(harness.state.challengeCalls).toBe(0);
      expect(harness.state.authorityCalls).toBe(0);
    }
  });

  it("runs validation, challenge, Authority, response, and after-commit in order", async () => {
    const events: string[] = [];
    const harness = publicOperationExecutorHarness({
      events,
      output: createPublicCreateOutput(),
      recordExecutionStages: true,
    });

    await executeContactMessage(harness, publicContactMessageBody("ordered-stages"));

    expect(events).toEqual(["validation", "challenge", "authority", "shape", "afterCommit"]);
  });

  it("executes bounded public reads without proof, idempotency, or write side effects", async () => {
    const events: string[] = [];
    const harness = publicOperationExecutorHarness({
      events,
      output: publicListOutput(),
      recordExecutionStages: true,
    });
    const result = await executePublicLookup(harness, {
      input: { lookup: "CODE-ALPHA" },
      source: { siteBlockId: "certificate-lookup" },
    });

    expect(result.body).toEqual({
      invocationId: expect.stringMatching(/^operation:[0-9a-f-]+$/),
      operation: {
        entityName: "certificate",
        operationName: "lookup",
        canonicalKey: "certificate.lookup",
        kind: "list",
      },
      output: {
        type: "list",
        records: [
          {
            code: "CODE-ALPHA",
            reportNumber: "REPORT-1",
          },
        ],
      },
      status: "accepted",
    });
    expect(events).toEqual(["rateLimit", "validation", "authority", "shape"]);
    expect(harness.state.challengeCalls).toBe(0);
    expect(harness.state.afterCommitResponses).toEqual([]);
    expect(harness.state.authorityEnvelopes[0]).toMatchObject({
      actor: { kind: "anonymous" },
      idempotency: { required: false },
      input: {
        type: "list",
        input: { lookup: "CODE-ALPHA" },
      },
      operation: {
        canonicalKey: "certificate.lookup",
        kind: "list",
      },
      source: {
        host: "example.com",
        path: "/api/tasks/public/operations/certificate/lookup",
        protocol: "public",
        siteBlockId: "certificate-lookup",
      },
    });
    expect(harness.state.authorityEnvelopes[0]?.idempotency).not.toHaveProperty("key");
    expect(harness.state.authorityEnvelopes[0]?.idempotency).not.toHaveProperty("writeIdentity");
    expect(harness.state.rateLimitStages).toHaveLength(1);
    expect(harness.state.rateLimitStages[0]).toMatchObject({
      identity: schemaKeyStorageIdentity("tasks"),
      operationKey: "certificate.lookup",
      policy: { maxRequests: 2, windowSeconds: 60 },
    });
    expect(harness.state.rateLimitStages[0]).not.toHaveProperty("input");
    expect(JSON.stringify(harness.state.rateLimitStages[0])).not.toContain("CODE-ALPHA");
    expect(JSON.stringify(result)).not.toContain("certificate-private-id");
    expect(JSON.stringify(result)).not.toContain("Private customer");
    expect(JSON.stringify(result)).not.toContain("private/provider-key.pdf");
  });

  it("requires a present matching Origin for challenge-free public reads", async () => {
    const requests = [
      new Request("https://example.com/api/tasks/public/operations/certificate/lookup", {
        method: "POST",
      }),
      new Request("https://example.com/api/tasks/public/operations/certificate/lookup", {
        headers: { Origin: "not an origin" },
        method: "POST",
      }),
      new Request("https://example.com/api/tasks/public/operations/certificate/lookup", {
        headers: { Origin: "https://other.example" },
        method: "POST",
      }),
    ];

    for (const request of requests) {
      const events: string[] = [];
      const harness = publicOperationExecutorHarness({
        events,
        output: publicListOutput(),
        recordExecutionStages: true,
      });
      const error = await captureRejection(
        executePublicLookup(harness, { input: { lookup: "CODE-ALPHA" } }, request),
      );

      expect(error).toMatchObject({
        message: "Public operation origin is not allowed.",
        status: 403,
      });
      expect(events).toEqual([]);
      expect(harness.state.rateLimitStages).toEqual([]);
      expect(harness.state.validatedInputs).toEqual([]);
      expect(harness.state.authorityCalls).toBe(0);
    }
  });

  it("consumes public-read attempts before validation and returns retry timing at 429", async () => {
    const validationEvents: string[] = [];
    const validationError = new Error("invalid lookup");
    const invalidHarness = publicOperationExecutorHarness({
      events: validationEvents,
      output: publicListOutput(),
      recordExecutionStages: true,
      validationError,
    });

    expect(
      await captureRejection(executePublicLookup(invalidHarness, { input: { lookup: "invalid" } })),
    ).toBe(validationError);
    expect(validationEvents).toEqual(["rateLimit", "validation"]);
    expect(invalidHarness.state.rateLimitStages).toHaveLength(1);
    expect(invalidHarness.state.authorityCalls).toBe(0);

    const limitedEvents: string[] = [];
    const limitedHarness = publicOperationExecutorHarness({
      events: limitedEvents,
      output: publicListOutput(),
      rateLimitDecision: { allowed: false, retryAfterSeconds: 23 },
      recordExecutionStages: true,
    });
    const error = await captureRejection(
      executePublicLookup(limitedHarness, { input: { lookup: "CODE-ALPHA" } }),
    );

    expect(error).toMatchObject({
      message: "Public operation rate limit exceeded.",
      status: 429,
      headers: { "Retry-After": "23" },
    });
    expect(limitedEvents).toEqual(["rateLimit"]);
    expect(limitedHarness.state.validatedInputs).toEqual([]);
    expect(limitedHarness.state.authorityCalls).toBe(0);
    expect(limitedHarness.state.challengeCalls).toBe(0);
  });

  it("propagates validation, Authority, response, and after-commit Adapter errors", async () => {
    const failures = [
      {
        expectedEvents: ["validation"],
        option: "validationError" as const,
      },
      {
        expectedEvents: ["validation", "challenge", "authority"],
        option: "authorityError" as const,
      },
      {
        expectedEvents: ["validation", "challenge", "authority", "shape"],
        option: "responseError" as const,
      },
      {
        expectedEvents: ["validation", "challenge", "authority", "shape", "afterCommit"],
        option: "afterCommitError" as const,
      },
    ];

    for (const failure of failures) {
      const events: string[] = [];
      const adapterError = new Error(`${failure.option} propagated`);
      const harness = publicOperationExecutorHarness({
        events,
        output: createPublicCreateOutput(),
        recordExecutionStages: true,
        [failure.option]: adapterError,
      });
      const error = await captureRejection(
        executeContactMessage(harness, publicContactMessageBody(failure.option)),
      );

      expect(error).toBe(adapterError);
      expect(events).toEqual(failure.expectedEvents);
    }
  });
});

function publicOperationExecutorHarness(input: {
  afterCommitError?: Error;
  authorityError?: Error;
  challengeError?: Error;
  events: string[];
  output: Extract<
    OperationInvocationOutput,
    {
      type: "create" | "command" | "list";
    }
  >;
  rateLimitDecision?: PublicOperationReadRateLimitDecision;
  recordExecutionStages?: boolean;
  replayBeforeChallenge?: boolean;
  responseError?: Error;
  validationError?: Error;
}) {
  const state = {
    afterCommitResponses: [] as OperationInvocationResponse[],
    authorityEnvelopes: [] as OperationInvocationEnvelope[],
    authorityCalls: 0,
    challengeCalls: 0,
    challengeStages: [] as PublicOperationChallengeAdapterInput[],
    rateLimitStages: [] as PublicOperationReadRateLimitAdapterInput[],
    shapedResponses: [] as OperationInvocationResponse[],
    validatedInputs: [] as Array<{
      rawInput: unknown;
    }>,
  };
  const adapters = {
    afterCommit: {
      run: ({ response }) => {
        input.events.push("afterCommit");
        state.afterCommitResponses.push(response);

        if (input.afterCommitError) {
          throw input.afterCommitError;
        }
      },
    },
    authority: {
      execute: ({ envelope }) => {
        if (input.recordExecutionStages) {
          input.events.push("authority");
        }
        state.authorityCalls += 1;
        state.authorityEnvelopes.push(envelope);

        if (input.authorityError) {
          throw input.authorityError;
        }

        return operationInvocationResponse(
          envelope,
          input.output,
          input.output.type === "list" ? "accepted" : "committed",
        );
      },
    },
    challenge: {
      verify: (stage) => {
        if (input.recordExecutionStages) {
          input.events.push("challenge");
        }
        state.challengeCalls += 1;
        state.challengeStages.push(stage);

        if (input.challengeError) {
          throw input.challengeError;
        }

        return {
          kind: "turnstile",
          success: true,
          verifiedAt: "2026-06-26T00:00:00.000Z",
        } as const;
      },
    },
    lifecycle: {
      execute: async (stage) => {
        stage.assertAllowed();
        await stage.beforeReplay();

        if (input.replayBeforeChallenge) {
          return operationInvocationResponse(stage.envelope, input.output, "replayed");
        }

        const envelope = await stage.prepareExecutionEnvelope();

        return stage.execute(envelope);
      },
    },
    rateLimit: {
      consume: (stage) => {
        if (input.recordExecutionStages) {
          input.events.push("rateLimit");
        }
        state.rateLimitStages.push(stage);

        return input.rateLimitDecision ?? { allowed: true };
      },
    },
    response: {
      shape: ({ response }) => {
        input.events.push("shape");
        state.shapedResponses.push(response);

        if (input.responseError) {
          throw input.responseError;
        }

        return shapePublicOperationResponse(response);
      },
    },
    validation: {
      validate: ({ rawInput }) => {
        if (input.recordExecutionStages) {
          input.events.push("validation");
        }
        state.validatedInputs.push({ rawInput });

        if (input.validationError) {
          throw input.validationError;
        }

        return rawInput as RecordValues;
      },
    },
  } satisfies PublicOperationExecutorAdapters;

  return { adapters, state };
}

function executeContactMessage(
  harness: ReturnType<typeof publicOperationExecutorHarness>,
  body: unknown,
  request = publicOperationRequest("/api/site/public/operations/contact-message/submit"),
) {
  return executePublicOperationExecutor({
    adapters: harness.adapters,
    body,
    identity: schemaKeyStorageIdentity("site"),
    request,
    route: {
      entityName: "contact-message",
      operationName: "submit",
      path: "/api/site/public/operations/contact-message/submit",
    },
    schema: workerSchemaAppDefinitions.site.sourceSchema,
  });
}

function executePublicLookup(
  harness: ReturnType<typeof publicOperationExecutorHarness>,
  body: unknown,
  request = publicOperationRequest("/api/tasks/public/operations/certificate/lookup"),
) {
  return executePublicOperationExecutor({
    adapters: harness.adapters,
    body,
    identity: schemaKeyStorageIdentity("tasks"),
    request,
    route: {
      entityName: "certificate",
      operationName: "lookup",
      path: "/api/tasks/public/operations/certificate/lookup",
    },
    schema: publicReadSchema(),
  });
}

function captureRejection<T>(promise: Promise<T>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (error: unknown) => error,
  );
}
function operationInvocationResponse(
  invocation: OperationInvocationResponse["invocation"],
  output: Extract<
    OperationInvocationOutput,
    {
      type: "create" | "command" | "list";
    }
  >,
  status: "accepted" | "committed" | "replayed",
): OperationInvocationResponse {
  return {
    invocation,
    output,
    status,
  };
}

function publicOperationRequest(path: string): Request {
  return new Request(`https://example.com${path}`, {
    headers: {
      "CF-Connecting-IP": "203.0.113.10",
      Origin: "https://example.com",
    },
    method: "POST",
  });
}

function publicContactMessageBody(idempotencyKey: string) {
  return {
    input: {
      name: "Ada Lovelace",
      email: "ada@example.com",
      message: "Please send details.",
    },
    proof: { turnstileToken: "token-ok" },
    source: { siteBlockId: "rec_site_contact_form" },
    idempotencyKey,
  };
}

function publicContactMessageBodyWithoutIdempotency(input: RecordValues) {
  return {
    input,
    proof: { turnstileToken: "token-ok" },
    source: { siteBlockId: "rec_site_contact_form" },
  };
}
function publicCommandOutput(): Extract<
  OperationInvocationOutput,
  {
    type: "command";
  }
> {
  return {
    type: "command",
    affectedChangeIds: [],
    changes: [],
    cursor: 0,
  };
}
function publicListOutput(): Extract<
  OperationInvocationOutput,
  {
    type: "list";
  }
> {
  return {
    type: "list",
    records: [
      {
        id: "certificate-private-id",
        entity: "certificate",
        values: {
          code: "CODE-ALPHA",
          reportNumber: "REPORT-1",
          customer: "Private customer",
          providerStorageKey: "private/provider-key.pdf",
        },
        createdAt: "2026-06-26T00:00:00.000Z",
        updatedAt: "2026-06-26T00:00:00.000Z",
      },
    ],
  };
}
function publicReadSchema(): AppSchema {
  const schema = structuredClone(workerSchemaAppDefinitions.tasks.sourceSchema);
  setKeyedDefinition(schema.entities, "certificate", {
    label: "Certificate",
    fields: [
      { key: "code", type: "text", required: true, label: "Code" },
      { key: "reportNumber", type: "text", required: true, label: "Report number" },
      { key: "customer", type: "text", required: true, label: "Customer" },
      {
        key: "providerStorageKey",
        type: "text",
        required: true,
        label: "Provider storage key",
      },
    ],
    operations: [
      {
        key: "lookup",
        label: "Lookup certificate",
        kind: "list",
        scope: "collection",
        target: { query: "certificateLookup" },
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
          query: "certificateLookup",
          maxResults: 2,
        },
        idempotency: { required: false },
        audit: { input: "summary" },
        policy: {
          actors: ["anonymous"],
          access: {
            actor: "anonymous",
            origin: { kind: "same-origin" },
            rateLimit: { maxRequests: 2, windowSeconds: 60 },
          },
          responseFields: {
            anonymous: ["code", "reportNumber"],
          },
        },
      },
    ],
  });
  setKeyedDefinition(schema.queries, "certificateLookup", {
    label: "Certificate lookup",
    entity: "certificate",
    expression: {
      kind: "where",
      ref: { kind: "value", name: "code" },
      op: "eq",
      value: { kind: "context", name: "lookup" },
    },
  });
  return schema;
}
function createPublicCreateOutput(): Extract<
  OperationInvocationOutput,
  {
    type: "create";
  }
> {
  const record: StoredRecord = {
    id: "contact-message-1",
    entity: "contact-message",
    values: {
      name: "Ada Lovelace",
      email: "ada@example.com",
      message: "Please send details.",
    },
    createdAt: "2026-06-26T00:00:00.000Z",
    updatedAt: "2026-06-26T00:00:00.000Z",
  };
  const change: ChangeRow = {
    seq: 1,
    writeId: "write-1",
    operationKind: "create",
    entity: "contact-message",
    recordId: record.id,
    payload: record,
    createdAt: "2026-06-26T00:00:00.000Z",
  };

  return {
    type: "create",
    affectedChangeIds: [change.writeId],
    changes: [change],
    cursor: change.seq,
    record,
  };
}
