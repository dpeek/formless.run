import { INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID } from "@dpeek/formless-instance-control-plane";
import type { AppSchema, EntityOperationSchema } from "@dpeek/formless-schema";
import type { RecordValues, StoredRecord } from "@dpeek/formless-storage";
import { describe, expect, it } from "vite-plus/test";

import type { EmailDeliveryScheduleRequest } from "../shared/email-runtime.ts";
import type { OperationInvocationResponse } from "../shared/operation-invocation.ts";
import {
  scheduleSiteOperationInputNotificationAfterPublicOperation,
  type SiteOperationInputNotificationAdapters,
} from "./site-operation-input-notifications.ts";

describe("Site operation input notification scheduling", () => {
  it("schedules structured operation input email from a committed public operation form", async () => {
    const scheduled: EmailDeliveryScheduleRequest[] = [];

    await scheduleSiteOperationInputNotificationAfterPublicOperation({
      adapters: notificationAdapters(notificationControlPlaneRecords(), scheduled),
      records: operationFormSourceRecords({ replyToField: "email" }),
      requestUrl: "https://www.example.com/api/site/public/operations/request/submit",
      response: operationInputResponse({
        input: {
          fullName: "Ada Lovelace",
          email: "Ada@Example.COM",
          details: "Need <testing> & review.\nSecond line.",
          tier: "priority",
          acceptedTerms: true,
          quantity: 3,
        },
      }),
      schema: operationInputSchema(),
    });

    expect(scheduled).toEqual([
      {
        canonicalOrigin: "https://www.example.com",
        idempotencyKey: expect.stringMatching(/^operation-input-notification:[a-f0-9]{64}$/),
        message: {
          subject: "New public operation input for request.submit",
          text: expect.stringContaining("Operation: request.submit"),
          html: expect.stringContaining("Need &lt;testing&gt; &amp; review.<br>Second line."),
        },
        messageKind: "site-operation-input-notification",
        recipients: [
          {
            address: "owner@example.com",
            displayName: "Public operation",
          },
        ],
        replyTo: {
          address: "Ada@example.com",
        },
        sender: {
          id: "email-sender:contact@mail.example.com",
        },
        source: {
          operationId: "operation:request.submit:operation-input-notify",
          recordId: "request-1",
          storageIdentity: "instance:control-plane",
        },
      },
    ]);
    const message = (
      scheduled[0] as {
        message: {
          html: string;
          text: string;
        };
      }
    ).message;
    expect(message.text).toContain("Request details <safe label>: Need <testing> & review.");
    expect(message.text).toContain("Tier: Priority");
    expect(message.text).toContain("Accepted terms: Yes");
    expect(message.text).toContain("Quantity: 3");
    expect(message.html).toContain("<table");
    expect(message.html).not.toContain("<dl>");
    expect(message.html).toMatch(
      /<tr><th scope="row"[^>]*>Operation<\/th><td[^>]*>request\.submit<\/td><\/tr>/,
    );
    expect(message.html).toMatch(
      /<tr><th scope="row"[^>]*>Request details &lt;safe label&gt;<\/th><td[^>]*>Need &lt;testing&gt; &amp; review\.<br>Second line\.<\/td><\/tr>/,
    );
    expect(message.html).toContain("Request details &lt;safe label&gt;");
    expect(message.html).not.toContain("<testing>");
  });

  it("omits invalid reply-to values without skipping the notification", async () => {
    const scheduled: EmailDeliveryScheduleRequest[] = [];

    await scheduleSiteOperationInputNotificationAfterPublicOperation({
      adapters: notificationAdapters(notificationControlPlaneRecords(), scheduled),
      records: operationFormSourceRecords({ replyToField: "email" }),
      requestUrl: "https://www.example.com/api/site/public/operations/request/submit",
      response: operationInputResponse({
        input: {
          fullName: "Ada Lovelace",
          email: "not-an-email",
          details: "Need review.",
          tier: "standard",
        },
      }),
      schema: operationInputSchema(),
    });

    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]).not.toHaveProperty("replyTo");
  });

  it("schedules command handler operation input email from the public command wrapper", async () => {
    const scheduled: EmailDeliveryScheduleRequest[] = [];
    const operation = requestSubmitCommandHandlerOperation();

    await scheduleSiteOperationInputNotificationAfterPublicOperation({
      adapters: notificationAdapters(notificationControlPlaneRecords(), scheduled),
      records: operationFormSourceRecords({ replyToField: "email" }),
      requestUrl: "https://www.example.com/api/site/public/operations/request/submit",
      response: operationInputCommandResponse({
        input: {
          email: "Ada@Example.COM",
          wantsNewsletter: false,
        },
        operation,
      }),
      schema: operationInputSchema(operation),
    });
    expect(scheduled).toHaveLength(1);
    const delivery = scheduled[0] as {
      message: {
        html: string;
        text: string;
      };
      replyTo: {
        address: string;
      };
      source: Record<string, unknown>;
    };
    expect(delivery.message.text).toContain("Email: Ada@Example.COM");
    expect(delivery.message.text).toContain("Wants newsletter: No");
    expect(delivery.message.html).toMatch(
      /<tr><th scope="row"[^>]*>Wants newsletter<\/th><td[^>]*>No<\/td><\/tr>/,
    );
    expect(delivery.replyTo).toEqual({ address: "Ada@example.com" });
    expect(delivery.source).not.toHaveProperty("recordId");
  });

  it("renders exposed command output fields in operation input email", async () => {
    const scheduled: EmailDeliveryScheduleRequest[] = [];
    const operation = {
      ...recordPlanRequestOperation(),
      policy: {
        actors: ["anonymous"],
        responseFields: { anonymous: ["requestCode"] },
      },
    } satisfies EntityOperationSchema;

    await scheduleSiteOperationInputNotificationAfterPublicOperation({
      adapters: notificationAdapters(notificationControlPlaneRecords(), scheduled),
      records: operationFormSourceRecords(),
      requestUrl: "https://www.example.com/api/site/public/operations/request/submit",
      response: operationInputCommandResponse({
        input: {
          email: "Ada@Example.COM",
        },
        operation,
        outputValues: {
          requestCode: "7K2Q-9D3A",
        },
      }),
      schema: operationInputSchema(operation),
    });
    expect(scheduled).toHaveLength(1);
    const message = (
      scheduled[0] as {
        message: {
          html: string;
          text: string;
        };
      }
    ).message;
    expect(message.text).toContain("Operation output");
    expect(message.text).toContain("Request code: 7K2Q-9D3A");
    expect(message.html).toMatch(
      /<tr><th scope="row"[^>]*>Request code<\/th><td[^>]*>7K2Q-9D3A<\/td><\/tr>/,
    );
  });

  it("skips scheduling when form or email configuration is incomplete", async () => {
    const scheduled: EmailDeliveryScheduleRequest[] = [];
    const response = operationInputResponse();

    await scheduleSiteOperationInputNotificationAfterPublicOperation({
      adapters: notificationAdapters(notificationControlPlaneRecords(), scheduled),
      records: operationFormSourceRecords({ mode: "none" }),
      requestUrl: "https://www.example.com/api/site/public/operations/request/submit",
      response,
      schema: operationInputSchema(),
    });
    await scheduleSiteOperationInputNotificationAfterPublicOperation({
      adapters: notificationAdapters([], scheduled),
      records: operationFormSourceRecords(),
      requestUrl: "https://www.example.com/api/site/public/operations/request/submit",
      response,
      schema: operationInputSchema(),
    });

    expect(scheduled).toEqual([]);
  });

  it("skips replayed and non-public operation responses", async () => {
    const scheduled: EmailDeliveryScheduleRequest[] = [];
    const replayed = operationInputResponse();
    const nonPublic = operationInputResponse();

    replayed.status = "replayed";
    nonPublic.invocation.source.protocol = "cli";

    for (const response of [replayed, nonPublic]) {
      await scheduleSiteOperationInputNotificationAfterPublicOperation({
        adapters: notificationAdapters(notificationControlPlaneRecords(), scheduled),
        records: operationFormSourceRecords(),
        requestUrl: "https://www.example.com/api/site/public/operations/request/submit",
        response,
        schema: operationInputSchema(),
      });
    }

    expect(scheduled).toEqual([]);
  });

  it("contains platform scheduling failures without adding private delivery facts", async () => {
    const scheduled: EmailDeliveryScheduleRequest[] = [];
    const response = operationInputResponse();
    const responseBeforeScheduling = JSON.stringify(response);

    await scheduleSiteOperationInputNotificationAfterPublicOperation({
      adapters: notificationAdapters(
        notificationControlPlaneRecords(),
        scheduled,
        new Error("Email delivery queue or provider failed for owner@example.com."),
      ),
      records: operationFormSourceRecords({ replyToField: "email" }),
      requestUrl: "https://www.example.com/api/site/public/operations/request/submit",
      response,
      schema: operationInputSchema(),
    });

    expect(scheduled).toHaveLength(1);
    expect(JSON.stringify(response)).toBe(responseBeforeScheduling);
    expect(JSON.stringify(response)).not.toContain("queue or provider failed");
    expect(JSON.stringify(response)).not.toContain("owner@example.com");
    expect(JSON.stringify(response)).not.toContain("email_delivery_");
  });

  it("uses stable operation input notification idempotency for the same operation retry", async () => {
    const scheduled: EmailDeliveryScheduleRequest[] = [];
    const adapters = notificationAdapters(notificationControlPlaneRecords(), scheduled);
    const response = operationInputResponse();

    await scheduleSiteOperationInputNotificationAfterPublicOperation({
      adapters,
      records: operationFormSourceRecords(),
      requestUrl: "https://www.example.com/api/site/public/operations/request/submit",
      response,
      schema: operationInputSchema(),
    });
    await scheduleSiteOperationInputNotificationAfterPublicOperation({
      adapters,
      records: operationFormSourceRecords(),
      requestUrl: "https://www.example.com/api/site/public/operations/request/submit",
      response,
      schema: operationInputSchema(),
    });
    expect(scheduled).toHaveLength(2);
    expect(
      (
        scheduled[0] as {
          idempotencyKey: string;
        }
      ).idempotencyKey,
    ).toBe(
      (
        scheduled[1] as {
          idempotencyKey: string;
        }
      ).idempotencyKey,
    );
  });
});

function notificationAdapters(
  records: readonly StoredRecord[],
  scheduled: EmailDeliveryScheduleRequest[],
  schedulingError?: Error,
): SiteOperationInputNotificationAdapters {
  return {
    configuration: {
      read: () => records,
    },
    emailScheduling: {
      schedule({ request }) {
        scheduled.push(request);

        if (schedulingError) {
          throw schedulingError;
        }
      },
    },
  };
}

function notificationControlPlaneRecords(): StoredRecord[] {
  return [
    record("route:primary", "route", {
      enabled: true,
      matchHost: "www.example.com",
      matchPath: "/",
      matchPrefix: "/",
      kind: "mount",
      targetProfile: "instance",
      surface: "admin",
    }),
    record("settings:instance", "instance-settings", {
      settingsId: INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID,
      primaryRoute: "route:primary",
      defaultContactSender: "email-sender:contact@mail.example.com",
      contactNotificationRecipient: "owner@example.com",
      productionIdentityStatus: "configured",
    }),
  ];
}

function operationFormSourceRecords(
  input: {
    mode?: "email" | "none";
    replyToField?: string;
  } = {},
): StoredRecord[] {
  return [
    record("form-block", "block", {
      type: "publicOperationForm",
      label: "Request a review",
      operationKey: "request.submit",
      operationNotificationMode: input.mode ?? "email",
      ...(input.replyToField === undefined
        ? {}
        : { operationNotificationReplyToField: input.replyToField }),
    }),
  ];
}

function operationInputSchema(
  operation: EntityOperationSchema = requestSubmitOperation(),
): AppSchema {
  return {
    version: 1,
    entities: [
      {
        id: "entity_bfc261ad-39e9-4aca-ba08-3f3afc55deab",
        key: "request",
        label: "Request",
        fields: [
          { key: "fullName", type: "text", required: true, label: "Full name" },
          { key: "email", type: "text", required: false, label: "Email" },
          {
            key: "details",
            type: "text",
            required: true,
            label: "Request details <safe label>",
            format: "longText",
          },
          {
            key: "tier",
            type: "enum",
            required: true,
            label: "Tier",
            values: [
              { key: "standard", label: "Standard" },
              { key: "priority", label: "Priority" },
            ],
          },
          { key: "acceptedTerms", type: "boolean", required: false, label: "Accepted terms" },
          { key: "quantity", type: "number", required: false, label: "Quantity" },
          { key: "requestCode", type: "text", required: false, label: "Request code" },
        ],
        operations: [
          {
            key: "submit",
            ...operation,
          },
        ],
      },
    ],
    queries: [],
    itemViews: [],
    tableViews: [],
    views: [],
    screens: [
      {
        key: "requests",
        type: "workspace",
        label: "Requests",
        layout: { type: "stack", sections: [] },
      },
    ],
  };
}
function requestSubmitOperation(): EntityOperationSchema {
  return {
    label: "Submit request",
    kind: "create",
    scope: "collection",
    input: {
      fields: [
        { key: "fullName", field: "fullName", required: true },
        { key: "email", field: "email", required: false },
        { key: "details", field: "details", required: true },
        { key: "tier", field: "tier", required: true },
        { key: "acceptedTerms", field: "acceptedTerms", required: false },
        { key: "quantity", field: "quantity", required: false },
      ],
    },
    effect: { type: "createRecord" },
    output: { type: "create" },
    idempotency: { required: true },
    audit: { input: "summary" },
  };
}

function requestSubmitCommandHandlerOperation(): EntityOperationSchema {
  return {
    label: "Submit request",
    kind: "command",
    scope: "collection",
    input: {
      fields: [
        { key: "email", field: "email", required: true },
        { key: "wantsNewsletter", type: "boolean", required: false, label: "Wants newsletter" },
      ],
    },
    effect: { type: "operationHandler", handler: "subscribe", config: {} },
    output: { type: "command" },
    idempotency: { required: true },
    audit: { input: "summary" },
  };
}

function recordPlanRequestOperation(): EntityOperationSchema {
  return {
    label: "Submit request",
    kind: "command",
    scope: "collection",
    input: {
      fields: [{ key: "email", field: "email", required: true }],
    },
    effect: { type: "recordPlan", steps: [] },
    output: { type: "command" },
    idempotency: { required: true },
    audit: { input: "summary" },
  };
}

function operationInputResponse(
  input: {
    input?: RecordValues;
  } = {},
): OperationInvocationResponse {
  const values = input.input ?? {
    fullName: "Ada Lovelace",
    email: "ada@example.com",
    details: "Need review.",
    tier: "priority",
  };
  const operation = requestSubmitOperation();

  return {
    invocation: {
      invocationId: "operation:request.submit:operation-input-notify",
      actor: { kind: "anonymous" },
      idempotency: {
        required: true,
        key: "operation-input-notify",
        source: "caller",
        writeIdentity: "operation:request.submit:operation-input-notify",
      },
      input: {
        type: "create",
        values,
      },
      operation: {
        entityName: "request",
        operationName: "submit",
        canonicalKey: "request.submit",
        kind: "create",
        scope: "collection",
        output: { type: "create" },
      },
      receivedAt: "2026-06-24T00:00:00.000Z",
      schemaOperation: operation,
      source: {
        host: "www.example.com",
        path: "/api/site/public/operations/request/submit",
        protocol: "public",
        siteBlockId: "form-block",
      },
    },
    output: {
      type: "create",
      affectedChangeIds: ["1"],
      changes: [],
      cursor: 1,
      record: {
        id: "request-1",
        entity: "request",
        values,
        createdAt: "2026-06-24T00:00:00.000Z",
        updatedAt: "2026-06-24T00:00:00.000Z",
      },
    },
    status: "committed",
  };
}

function operationInputCommandResponse(input: {
  input: RecordValues;
  operation: EntityOperationSchema;
  outputValues?: RecordValues;
}): OperationInvocationResponse {
  return {
    invocation: {
      invocationId: "operation:request.submit:operation-input-notify",
      actor: { kind: "anonymous" },
      idempotency: {
        required: true,
        key: "operation-input-notify",
        source: "caller",
        writeIdentity: "operation:request.submit:operation-input-notify",
      },
      input: {
        type: "command",
        input:
          input.operation.effect?.type === "recordPlan"
            ? input.input
            : {
                input: input.input,
                proof: { kind: "turnstile", token: "token-ok" },
              },
      },
      operation: {
        entityName: "request",
        operationName: "submit",
        canonicalKey: "request.submit",
        kind: input.operation.kind,
        scope: input.operation.scope,
        output: input.operation.output,
        ...(input.operation.effect === undefined ? {} : { effect: input.operation.effect }),
      },
      receivedAt: "2026-06-24T00:00:00.000Z",
      schemaOperation: input.operation,
      source: {
        host: "www.example.com",
        path: "/api/site/public/operations/request/submit",
        protocol: "public",
        siteBlockId: "form-block",
      },
    },
    output: {
      type: "command",
      affectedChangeIds: ["1"],
      changes:
        input.outputValues === undefined
          ? []
          : [
              {
                seq: 1,
                writeId: "operation:request.submit:operation-input-notify",
                operationKind: "command",
                entity: "request",
                recordId: "request-1",
                payload: {
                  id: "request-1",
                  entity: "request",
                  values: input.outputValues,
                  createdAt: "2026-06-24T00:00:00.000Z",
                  updatedAt: "2026-06-24T00:00:00.000Z",
                },
                createdAt: "2026-06-24T00:00:00.000Z",
              },
            ],
      cursor: 1,
    },
    status: "committed",
  };
}

function record(id: string, entity: string, values: RecordValues): StoredRecord {
  return {
    id,
    entity,
    values,
    createdAt: "2026-06-24T00:00:00.000Z",
    updatedAt: "2026-06-24T00:00:00.000Z",
  };
}
