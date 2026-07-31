import { INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID } from "@dpeek/formless-instance-control-plane";
import type { StoredRecord } from "@dpeek/formless-storage";
import { describe, expect, it } from "vite-plus/test";

import { programStorageIdentity } from "../shared/app-storage-identity.ts";
import type { EmailDeliveryScheduleRequest } from "../shared/email-runtime.ts";
import type { OperationInvocationResponse } from "../shared/operation-invocation.ts";
import {
  scheduleSiteContactNotificationAfterPublicOperation,
  type SiteContactNotificationAdapters,
} from "./site-contact-notifications.ts";

describe("Site contact notification scheduling", () => {
  it("schedules contact notification email from committed public contact message output", async () => {
    const scheduled: EmailDeliveryScheduleRequest[] = [];

    await scheduleSiteContactNotificationAfterPublicOperation({
      adapters: notificationAdapters(contactNotificationControlPlaneRecords(), scheduled),
      identity: programStorageIdentity(),
      requestUrl: "https://www.example.com/api/site/public/operations/contact-message/submit",
      response: contactMessageResponse(),
    });

    expect(scheduled).toEqual([
      {
        canonicalOrigin: "https://www.example.com",
        idempotencyKey: expect.stringMatching(/^contact-notification:[a-f0-9]{64}$/),
        message: {
          subject: "New contact message from Ada Lovelace",
          text: [
            "New contact form message",
            "",
            "Name: Ada Lovelace",
            "Email: ada@example.com",
            "",
            "Please send details.",
          ].join("\n"),
          html: expect.stringContaining("Please send details."),
        },
        messageKind: "site-contact-notification",
        recipients: [
          {
            address: "owner@example.com",
            displayName: "Site contact",
          },
        ],
        replyTo: {
          address: "ada@example.com",
          displayName: "Ada Lovelace",
        },
        sender: {
          id: "email-sender:contact@mail.example.com",
        },
        source: {
          operationId: "operation:contact-message.submit:contact-create-email-notify",
          recordId: "contact-message-1",
          storageIdentity: "instance:control-plane",
        },
      },
    ]);
  });

  it("skips contact notification scheduling when email settings are incomplete", async () => {
    const scheduled: EmailDeliveryScheduleRequest[] = [];

    await scheduleSiteContactNotificationAfterPublicOperation({
      adapters: notificationAdapters([], scheduled),
      identity: programStorageIdentity(),
      requestUrl: "https://www.example.com/api/site/public/operations/contact-message/submit",
      response: contactMessageResponse(),
    });

    expect(scheduled).toEqual([]);
  });

  it("skips replayed and non-contact public operation outputs", async () => {
    const scheduled: EmailDeliveryScheduleRequest[] = [];
    const replayed = contactMessageResponse();
    const otherOperation = contactMessageResponse();

    replayed.status = "replayed";
    otherOperation.invocation.operation.operationName = "create";

    for (const response of [replayed, otherOperation]) {
      await scheduleSiteContactNotificationAfterPublicOperation({
        adapters: notificationAdapters(contactNotificationControlPlaneRecords(), scheduled),
        identity: programStorageIdentity(),
        requestUrl: "https://www.example.com/api/site/public/operations/contact-message/submit",
        response,
      });
    }

    expect(scheduled).toEqual([]);
  });

  it("contains platform scheduling failures without adding private delivery facts", async () => {
    const scheduled: EmailDeliveryScheduleRequest[] = [];
    const response = contactMessageResponse();
    const responseBeforeScheduling = JSON.stringify(response);

    await scheduleSiteContactNotificationAfterPublicOperation({
      adapters: notificationAdapters(
        contactNotificationControlPlaneRecords(),
        scheduled,
        new Error("Email delivery queue or provider failed for owner@example.com."),
      ),
      identity: programStorageIdentity(),
      requestUrl: "https://www.example.com/api/site/public/operations/contact-message/submit",
      response,
    });

    expect(scheduled).toHaveLength(1);
    expect(JSON.stringify(response)).toBe(responseBeforeScheduling);
    expect(JSON.stringify(response)).not.toContain("queue or provider failed");
    expect(JSON.stringify(response)).not.toContain("email_delivery_");
  });

  it("uses stable notification idempotency for the same public operation output", async () => {
    const scheduled: EmailDeliveryScheduleRequest[] = [];
    const adapters = notificationAdapters(contactNotificationControlPlaneRecords(), scheduled);
    const response = contactMessageResponse();

    await scheduleSiteContactNotificationAfterPublicOperation({
      adapters,
      identity: programStorageIdentity(),
      requestUrl: "https://www.example.com/api/site/public/operations/contact-message/submit",
      response,
    });
    await scheduleSiteContactNotificationAfterPublicOperation({
      adapters,
      identity: programStorageIdentity(),
      requestUrl: "https://www.example.com/api/site/public/operations/contact-message/submit",
      response,
    });
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
): SiteContactNotificationAdapters {
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

function contactNotificationControlPlaneRecords(): StoredRecord[] {
  return [
    {
      id: "route:primary",
      entity: "route",
      values: {
        enabled: true,
        matchHost: "www.example.com",
        matchPath: "/",
        matchPrefix: "/",
        kind: "mount",
        targetProfile: "instance",
        surface: "admin",
      },
      createdAt: "2026-06-24T00:00:00.000Z",
      updatedAt: "2026-06-24T00:00:00.000Z",
    },
    {
      id: "settings:instance",
      entity: "instance-settings",
      values: {
        settingsId: INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID,
        primaryRoute: "route:primary",
        defaultContactSender: "email-sender:contact@mail.example.com",
        contactNotificationRecipient: "owner@example.com",
        productionIdentityStatus: "configured",
      },
      createdAt: "2026-06-24T00:00:00.000Z",
      updatedAt: "2026-06-24T00:00:00.000Z",
    },
  ];
}

function contactMessageResponse(): OperationInvocationResponse {
  const identity = programStorageIdentity();

  return {
    invocation: {
      invocationId: "operation:contact-message.submit:contact-create-email-notify",
      actor: { kind: "anonymous" },
      appStorageIdentity: identity,
      idempotency: {
        required: true,
        key: "contact-create-email-notify",
        source: "caller",
        writeIdentity: "operation:contact-message.submit:contact-create-email-notify",
      },
      input: {
        type: "create",
        values: {
          name: "Ada Lovelace",
          email: "ada@example.com",
          message: "Please send details.",
        },
      },
      operation: {
        entityName: "contact-message",
        operationName: "submit",
        canonicalKey: "contact-message.submit",
        kind: "create",
        scope: "collection",
        output: { type: "create" },
      },
      receivedAt: "2026-06-24T00:00:00.000Z",
      schemaOperation: {} as never,
      source: {
        host: "www.example.com",
        path: "/api/site/public/operations/contact-message/submit",
        protocol: "public",
        siteBlockId: "contact-block",
      },
    },
    output: {
      type: "create",
      affectedChangeIds: ["1"],
      changes: [],
      cursor: 1,
      record: {
        id: "contact-message-1",
        entity: "contact-message",
        values: {
          name: "Ada Lovelace",
          email: "ada@example.com",
          message: "Please send details.",
        },
        createdAt: "2026-06-24T00:00:00.000Z",
        updatedAt: "2026-06-24T00:00:00.000Z",
      },
    },
    status: "committed",
  };
}
