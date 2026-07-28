import { describe, expect, it } from "vite-plus/test";
import {
  EMAIL_DELIVERY_SEND_RUNTIME_JOB_KIND,
  EMAIL_DELIVERY_SEND_RUNTIME_JOB_SCHEMA_VERSION,
  emailDeliveryIdempotencyScope,
  emailDeliverySendRuntimeJob,
  parseEmailDeliverySendRuntimeJob,
  parseEmailDeliveryScheduleRequest,
  renderEmailDeliveryMessage,
} from "./email-runtime.ts";

describe("email runtime contracts", () => {
  it("normalizes schedule requests without retaining rendered body in the idempotency scope", () => {
    const request = parseEmailDeliveryScheduleRequest({
      messageKind: "site.contactNotification",
      source: {
        storageIdentity: "app:site",
        operationId: "operation_123",
      },
      idempotencyKey: "contact-message-1",
      sender: { id: "email-sender:contact@mail.example.com" },
      recipients: [{ address: " Owner@Example.com ", displayName: "Owner" }],
      replyTo: { address: " Visitor@Example.net " },
      canonicalOrigin: "https://www.example.com/contact",
      message: {
        subject: "New contact message",
        text: "Plain text body",
        html: "<p>HTML body</p>",
      },
    });

    expect(request).toEqual({
      messageKind: "site.contactNotification",
      source: {
        storageIdentity: "app:site",
        operationId: "operation_123",
      },
      idempotencyKey: "contact-message-1",
      sender: { id: "email-sender:contact@mail.example.com" },
      recipients: [{ address: "Owner@example.com", displayName: "Owner" }],
      replyTo: { address: "Visitor@example.net" },
      canonicalOrigin: "https://www.example.com",
      message: {
        subject: "New contact message",
        text: "Plain text body",
        html: "<p>HTML body</p>",
      },
    });
    expect(emailDeliveryIdempotencyScope(request)).toBe(
      ["app:site", "site.contactNotification", "operation_123", "", "contact-message-1"].join("\n"),
    );
    expect(emailDeliveryIdempotencyScope(request)).not.toContain("Plain text body");
  });

  it("rejects invalid visitor reply-to addresses at the boundary", () => {
    expect(() =>
      parseEmailDeliveryScheduleRequest({
        messageKind: "site.contactNotification",
        source: {
          storageIdentity: "app:site",
          recordId: "record_123",
        },
        idempotencyKey: "contact-message-1",
        sender: { id: "email-sender:contact@mail.example.com" },
        recipients: [{ address: "owner@example.com" }],
        replyTo: { address: "not-an-email" },
        canonicalOrigin: "https://www.example.com",
        message: {
          subject: "New contact message",
          text: "Plain text body",
        },
      }),
    ).toThrow("Email delivery reply-to must be a valid email address.");
  });

  it("renders text and HTML message bodies through plain hooks", async () => {
    await expect(
      renderEmailDeliveryMessage(
        {
          canonicalOrigin: "https://www.example.com",
          facts: { name: "Ada" },
          kind: "site.contactNotification",
        },
        {
          "site.contactNotification": ({ canonicalOrigin, facts }) => ({
            subject: `Message from ${
              (
                facts as {
                  name: string;
                }
              ).name
            }`,
            text: `Open ${canonicalOrigin}/admin`,
            html: `<p>Open <a href="${canonicalOrigin}/admin">admin</a></p>`,
          }),
        },
      ),
    ).resolves.toEqual({
      subject: "Message from Ada",
      text: "Open https://www.example.com/admin",
      html: '<p>Open <a href="https://www.example.com/admin">admin</a></p>',
    });
  });

  it("parses email delivery send runtime job envelopes", () => {
    const job = parseEmailDeliverySendRuntimeJob({
      schemaVersion: EMAIL_DELIVERY_SEND_RUNTIME_JOB_SCHEMA_VERSION,
      kind: EMAIL_DELIVERY_SEND_RUNTIME_JOB_KIND,
      jobId: "email.delivery.send:email_delivery_123",
      idempotencyKey: "contact-message-1",
      enqueuedAt: "2026-06-24T00:01:00.000Z",
      targetAuthorityName: "__formless_instance__",
      deliveryId: "email_delivery_123",
    });

    expect(job).toEqual({
      schemaVersion: 1,
      kind: "email.delivery.send",
      jobId: "email.delivery.send:email_delivery_123",
      idempotencyKey: "contact-message-1",
      enqueuedAt: "2026-06-24T00:01:00.000Z",
      targetAuthorityName: "__formless_instance__",
      deliveryId: "email_delivery_123",
    });
    expect(
      emailDeliverySendRuntimeJob({
        deliveryId: "email_delivery_123",
        enqueuedAt: "2026-06-24T00:01:00.000Z",
        idempotencyKey: "contact-message-1",
        targetAuthorityName: "__formless_instance__",
      }),
    ).toEqual(job);
  });

  it("rejects invalid or overfull email delivery send runtime job envelopes", () => {
    const validJob = {
      schemaVersion: 1,
      kind: "email.delivery.send",
      jobId: "email.delivery.send:email_delivery_123",
      idempotencyKey: "contact-message-1",
      enqueuedAt: "2026-06-24T00:01:00.000Z",
      targetAuthorityName: "__formless_instance__",
      deliveryId: "email_delivery_123",
    };

    expect(() =>
      parseEmailDeliverySendRuntimeJob({
        ...validJob,
        schemaVersion: 2,
      }),
    ).toThrow("Email delivery send runtime job schemaVersion is unsupported.");
    expect(() =>
      parseEmailDeliverySendRuntimeJob({
        ...validJob,
        kind: "email.delivery.broadcast",
      }),
    ).toThrow("Email delivery send runtime job kind is unsupported.");
    expect(() =>
      parseEmailDeliverySendRuntimeJob({
        ...validJob,
        recipients: [{ address: "owner@example.com" }],
      }),
    ).toThrow('Email delivery send runtime job field "recipients" is not supported.');
    expect(() =>
      parseEmailDeliverySendRuntimeJob({
        ...validJob,
        text: "Plain text body",
      }),
    ).toThrow('Email delivery send runtime job field "text" is not supported.');
  });
});
