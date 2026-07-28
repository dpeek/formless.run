import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { createWorkerHarness } from "./miniflare-test.ts";
import type {
  EmailDeliveryRecord,
  EmailDeliveryRenderedMessage,
  EmailDeliverySendRuntimeJob,
} from "../shared/email-runtime.ts";
import type { StoredRecord } from "@dpeek/formless-storage";
import {
  resolveConfiguredDefaultCloudflareSender,
  resolveDefaultEmailSenderReference,
  type CloudflareSendEmailMessage,
} from "./email-runtime.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;
type HarnessFetchInit = Parameters<Harness["fetch"]>[1];

let harness: Harness | undefined;
let harnessDir: string | undefined;

afterEach(async () => {
  await harness?.dispose();
  harness = undefined;

  if (harnessDir) {
    await rm(harnessDir, { recursive: true, force: true });
    harnessDir = undefined;
  }
});
function emailDefaultControlPlaneRecords(
  options: {
    defaultAuthSender?: string;
  } = {},
): StoredRecord[] {
  const createdAt = "2026-06-24T00:00:00.000Z";
  const defaultAuthSender =
    "defaultAuthSender" in options
      ? options.defaultAuthSender
      : "email-sender:auth@mail.example.com";

  return [
    {
      id: "settings:instance",
      entity: "instance-settings",
      values: {
        settingsId: "instance",
        defaultEmailDomain: "email-domain:mail.example.com",
        defaultContactSender: "email-sender:contact@mail.example.com",
        ...(defaultAuthSender === undefined ? {} : { defaultAuthSender }),
      },
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: "email-domain:mail.example.com",
      entity: "email-domain",
      values: {
        enabled: true,
        providerFamily: "cloudflare",
        domain: "mail.example.com",
      },
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: "email-sender:contact@mail.example.com",
      entity: "email-sender",
      values: {
        enabled: true,
        address: "contact@mail.example.com",
        displayName: "Example Contact",
        purpose: "contact-notification",
        emailDomain: "email-domain:mail.example.com",
      },
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: "email-sender:auth@mail.example.com",
      entity: "email-sender",
      values: {
        enabled: true,
        address: "auth@mail.example.com",
        displayName: "Example Auth",
        purpose: "auth",
        emailDomain: "email-domain:mail.example.com",
      },
      createdAt,
      updatedAt: createdAt,
    },
  ];
}

describe("email runtime default sender resolution", () => {
  it("resolves contact and auth sender defaults independently", () => {
    const records = emailDefaultControlPlaneRecords();

    expect(resolveDefaultEmailSenderReference(records, "contact-notification")).toEqual({
      id: "email-sender:contact@mail.example.com",
    });
    expect(resolveDefaultEmailSenderReference(records, "auth")).toEqual({
      id: "email-sender:auth@mail.example.com",
    });
    expect(resolveConfiguredDefaultCloudflareSender(records, "auth")).toMatchObject({
      address: "auth@mail.example.com",
      displayName: "Example Auth",
      id: "email-sender:auth@mail.example.com",
    });
  });

  it("does not reuse the contact sender when the auth sender default is unset", () => {
    const records = emailDefaultControlPlaneRecords({
      defaultAuthSender: undefined,
    });

    expect(resolveDefaultEmailSenderReference(records, "contact-notification")).toEqual({
      id: "email-sender:contact@mail.example.com",
    });
    expect(resolveDefaultEmailSenderReference(records, "auth")).toBeUndefined();
    expect(resolveConfiguredDefaultCloudflareSender(records, "auth")).toBeUndefined();
  });

  it("rejects configured defaults that reference the wrong sender purpose", () => {
    const records = emailDefaultControlPlaneRecords({
      defaultAuthSender: "email-sender:contact@mail.example.com",
    });

    expect(() => resolveConfiguredDefaultCloudflareSender(records, "auth")).toThrow(
      'Default auth email sender must reference a sender with purpose "auth".',
    );
  });
});

describe("email runtime delivery scheduling", () => {
  it("queues pending deliveries and replays idempotency keys without duplicate handoff", async () => {
    harness = await createEmailRuntimeHarness();
    const first = await postSchedule();
    const second = await postSchedule();
    const queueJobs = await getJson<{
      jobs: EmailDeliverySendRuntimeJob[];
    }>("/queue-jobs");
    const sends = await getJson<{
      sends: CloudflareSendEmailMessage[];
    }>("/sends");
    const deliveries = await getJson<{
      deliveries: EmailDeliveryRecord[];
    }>("/deliveries");
    const internalMessage = await getJson<{
      message?: EmailDeliveryRenderedMessage;
    }>(`/internal-message/${first.delivery.id}`);
    expect(first).toMatchObject({
      replayed: false,
      queued: true,
      delivery: {
        attemptCount: 0,
        canonicalOrigin: "https://www.example.com",
        idempotencyKey: "contact-message-1",
        messageKind: "site.contactNotification",
        providerFamily: "cloudflare",
        recipients: [{ address: "owner@example.com" }],
        replyTo: { address: "visitor@example.net" },
        sender: {
          address: "contact@mail.example.com",
          displayName: "Example Contact",
          id: "email-sender:contact@mail.example.com",
        },
        status: "pending",
      },
    });
    expect(first.delivery).not.toHaveProperty("providerMessageId");
    expect(first.delivery).not.toHaveProperty("latestError");
    expect(second).toMatchObject({
      replayed: true,
      queued: false,
      delivery: {
        id: first.delivery.id,
        status: "pending",
      },
    });
    expect(queueJobs.jobs).toEqual([
      {
        schemaVersion: 1,
        kind: "email.delivery.send",
        jobId: `email.delivery.send:${first.delivery.id}`,
        idempotencyKey: "contact-message-1",
        enqueuedAt: "2026-06-24T00:01:00.000Z",
        targetAuthorityName: "__formless_instance__",
        deliveryId: first.delivery.id,
      },
    ]);
    expect(JSON.stringify(queueJobs.jobs[0])).not.toContain("owner@example.com");
    expect(JSON.stringify(queueJobs.jobs[0])).not.toContain("contact@mail.example.com");
    expect(JSON.stringify(queueJobs.jobs[0])).not.toContain("Plain text body");
    expect(sends.sends).toEqual([]);
    expect(deliveries.deliveries).toHaveLength(1);
    expect(JSON.stringify(deliveries.deliveries[0])).not.toContain("Plain text body");
    expect(JSON.stringify(deliveries.deliveries[0])).not.toContain("<p>HTML body</p>");
    expect(internalMessage.message).toEqual({
      subject: "New contact message",
      text: "Plain text body",
      html: "<p>HTML body</p>",
    });
  });

  it("keeps collaborator invitation token material out of delivery records and queue jobs", async () => {
    harness = await createEmailRuntimeHarness();

    const rawToken = "aW52aXRlLXJhdy10b2tlbi0x";
    const tokenHash = "dG9rZW4taGFzaC0x";
    const inviteLink =
      "https://auth.example.com/formless/auth/invitations/accept?invitationId=invitation%3Aada&token=aW52aXRlLXJhdy10b2tlbi0x";
    const scheduled = await postSchedule({
      canonicalOrigin: "https://auth.example.com",
      idempotencyKey: "invitation:ada:delivery",
      message: {
        subject: "Accept your invite",
        text: `Use ${inviteLink}`,
        html: `<a href="${inviteLink}">Accept invite</a>`,
      },
      messageKind: "identity.collaboratorInvitation",
      recipientAddress: "ada@example.com",
      senderId: "email-sender:auth@mail.example.com",
      source: {
        storageIdentity: "instance:identity",
        recordId: "invitation:ada",
      },
    });
    const queueJobs = await getJson<{
      jobs: EmailDeliverySendRuntimeJob[];
    }>("/queue-jobs");
    const publicDeliveryState = JSON.stringify([scheduled.delivery, queueJobs.jobs]);
    expect(scheduled.delivery).toMatchObject({
      canonicalOrigin: "https://auth.example.com",
      idempotencyKey: "invitation:ada:delivery",
      messageKind: "identity.collaboratorInvitation",
      sourceRecordId: "invitation:ada",
      sourceStorageIdentity: "instance:identity",
      sender: {
        address: "auth@mail.example.com",
        displayName: "Example Auth",
        id: "email-sender:auth@mail.example.com",
      },
    });
    expect(queueJobs.jobs).toHaveLength(1);
    expect(publicDeliveryState).not.toContain(rawToken);
    expect(publicDeliveryState).not.toContain(tokenHash);
    expect(publicDeliveryState).not.toContain(inviteLink);
    expect(publicDeliveryState).not.toContain("Accept your invite");
  });

  it("fails scheduling when queue handoff fails and retries unqueued deliveries", async () => {
    harness = await createEmailRuntimeHarness();

    const failed = await postScheduleFailure({
      failQueue: true,
      idempotencyKey: "retry-message-1",
    });
    const retried = await postSchedule({ idempotencyKey: "retry-message-1" });
    const queueJobs = await getJson<{
      jobs: EmailDeliverySendRuntimeJob[];
    }>("/queue-jobs");
    const sends = await getJson<{
      sends: CloudflareSendEmailMessage[];
    }>("/sends");
    expect(failed).toEqual({ error: "Email delivery queue handoff failed." });
    expect(retried).toMatchObject({
      replayed: true,
      queued: true,
      delivery: {
        attemptCount: 0,
        idempotencyKey: "retry-message-1",
        status: "pending",
      },
    });
    expect(queueJobs.jobs).toHaveLength(1);
    expect(queueJobs.jobs[0]).toMatchObject({
      deliveryId: retried.delivery.id,
      idempotencyKey: "retry-message-1",
    });
    expect(sends.sends).toEqual([]);
  });

  it("queues from enabled configured senders without sender verification state", async () => {
    harness = await createEmailRuntimeHarness();

    const result = await postSchedule({
      idempotencyKey: "configured-sender-message-1",
      senderId: "email-sender:updates@mail.example.com",
    });
    const sends = await getJson<{
      sends: CloudflareSendEmailMessage[];
    }>("/sends");
    const deliveries = await getJson<{
      deliveries: EmailDeliveryRecord[];
    }>("/deliveries");
    expect(result).toMatchObject({
      replayed: false,
      queued: true,
      delivery: {
        sender: {
          address: "updates@mail.example.com",
          displayName: "Example Updates",
          id: "email-sender:updates@mail.example.com",
        },
        status: "pending",
      },
    });
    expect(sends.sends).toEqual([]);
    expect(deliveries.deliveries).toHaveLength(1);
  });
});

describe("email runtime delivery consumer", () => {
  it("sends queued deliveries once and no-ops duplicate accepted messages", async () => {
    harness = await createEmailRuntimeHarness();
    const scheduled = await postSchedule({ idempotencyKey: "duplicate-message-1" });
    const queueJobs = await getJson<{
      jobs: EmailDeliverySendRuntimeJob[];
    }>("/queue-jobs");
    const queueResult = await dispatchEmailDeliveryQueue(
      [queueJobs.jobs[0], queueJobs.jobs[0]],
      ["duplicate-a", "duplicate-b"],
    );
    const sends = await getJson<{
      sends: CloudflareSendEmailMessage[];
    }>("/sends");
    const deliveries = await getJson<{
      deliveries: EmailDeliveryRecord[];
    }>("/deliveries");
    expect(queueResult.explicitAcks).toEqual(["duplicate-a", "duplicate-b"]);
    expect(queueResult.retryMessages).toEqual([]);
    expect(sends.sends).toHaveLength(1);
    expect(sends.sends[0]).toMatchObject({
      subject: "New contact message",
      text: "Plain text body",
      html: "<p>HTML body</p>",
    });
    expect(deliveries.deliveries).toMatchObject([
      {
        id: scheduled.delivery.id,
        attemptCount: 1,
        providerMessageId: "provider-message-1",
        status: "accepted",
      },
    ]);
  });

  it("retries provider failures without redelivering accepted batch neighbors", async () => {
    harness = await createEmailRuntimeHarness();

    const accepted = await postSchedule({ idempotencyKey: "batch-accepted-message-1" });
    const retryable = await postSchedule({
      idempotencyKey: "batch-retry-message-1",
      recipientAddress: "retry@example.com",
    });
    const queueJobs = await getJson<{
      jobs: EmailDeliverySendRuntimeJob[];
    }>("/queue-jobs");
    const queueResult = await dispatchEmailDeliveryQueue(queueJobs.jobs, [
      "batch-accepted",
      "batch-retry",
    ]);
    const sends = await getJson<{
      sends: CloudflareSendEmailMessage[];
    }>("/sends");
    const deliveries = await getJson<{
      deliveries: EmailDeliveryRecord[];
    }>("/deliveries");
    expect(queueResult.explicitAcks).toEqual(["batch-accepted"]);
    expect(queueResult.retryMessages).toEqual([{ msgId: "batch-retry" }]);
    expect(sends.sends).toHaveLength(2);
    expect(deliveries.deliveries).toHaveLength(2);
    expect(deliveryById(deliveries.deliveries, accepted.delivery.id)).toMatchObject({
      attemptCount: 1,
      providerMessageId: "provider-message-1",
      status: "accepted",
    });
    expect(deliveryById(deliveries.deliveries, retryable.delivery.id)).toMatchObject({
      attemptCount: 1,
      latestError: "Email provider delivery failed.",
      status: "failed",
    });
  });
  it("acknowledges permanent configuration failures after marking delivery failed", async () => {
    harness = await createEmailRuntimeHarness();
    await setSendMode("missing-binding");
    const scheduled = await postSchedule({ idempotencyKey: "missing-binding-message-1" });
    const queueJobs = await getJson<{
      jobs: EmailDeliverySendRuntimeJob[];
    }>("/queue-jobs");
    const queueResult = await dispatchEmailDeliveryQueue([queueJobs.jobs[0]], ["missing-binding"]);
    const sends = await getJson<{
      sends: CloudflareSendEmailMessage[];
    }>("/sends");
    const deliveries = await getJson<{
      deliveries: EmailDeliveryRecord[];
    }>("/deliveries");
    expect(queueResult.explicitAcks).toEqual(["missing-binding"]);
    expect(queueResult.retryMessages).toEqual([]);
    expect(sends.sends).toEqual([]);
    expect(deliveries.deliveries).toMatchObject([
      {
        id: scheduled.delivery.id,
        attemptCount: 1,
        latestError: "Email delivery binding is not configured.",
        status: "failed",
      },
    ]);
  });
});

async function createEmailRuntimeHarness() {
  return createWorkerHarness(await writeEmailRuntimeHarness(), {
    FORMLESS_AUTHORITY: { className: "EmailRuntimeHarness", useSQLite: true },
  });
}

async function writeEmailRuntimeHarness() {
  harnessDir = await mkdtemp(join(tmpdir(), "formless-email-runtime-harness-"));
  const harnessPath = join(harnessDir, "email-runtime-harness.ts");

  await writeFile(
    harnessPath,
    `
      import { DurableObject } from "cloudflare:workers";
      import {
        parseEmailDeliveryScheduleRequest,
      } from "${process.cwd()}/src/shared/email-runtime.ts";
      import {
        scheduleEmailDelivery,
        handleInstanceEmailDeliveryQueueBatch,
        handleInstanceEmailRuntimeDurableObjectRequest,
      } from "${process.cwd()}/src/worker/email-runtime.ts";
      import {
        ensureEmailDeliveryTables,
        listEmailDeliveries,
        readEmailDeliveryRenderedMessageById,
      } from "${process.cwd()}/src/worker/email-runtime-state.ts";
      import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "${process.cwd()}/src/worker/formless-instance.ts";

      export default {
        fetch(request, env) {
          const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);
          return env.FORMLESS_AUTHORITY.get(id).fetch(request);
        },
        async queue(batch, env) {
          await handleInstanceEmailDeliveryQueueBatch(batch, env);
        },
      };

      export class EmailRuntimeHarness extends DurableObject {
        constructor(ctx, env) {
          super(ctx, env);
          this.env = env;
        }

        async fetch(request) {
          const url = new URL(request.url);

          const runtimeResponse = await handleInstanceEmailRuntimeDurableObjectRequest(
            request,
            this.ctx.storage,
            runtimeEmailEnv(this.env, this.ctx.storage),
          );

          if (runtimeResponse) {
            return runtimeResponse;
          }

          if (url.pathname === "/schedule") {
            try {
              const body = await request.json();
              const scheduleBody = { ...body };
              delete scheduleBody.now;
              delete scheduleBody.failQueue;
              const result = await scheduleEmailDelivery({
                controlPlaneRecords,
                emailDeliveryQueue: emailDeliveryQueueBinding(
                  this.ctx.storage,
                  body.failQueue === true,
                ),
                now: body.now,
                request: parseEmailDeliveryScheduleRequest(scheduleBody),
                storage: this.ctx.storage,
                targetAuthorityName: FORMLESS_INSTANCE_AUTHORITY_NAME,
              });

              return Response.json(result);
            } catch (error) {
              return Response.json(
                { error: error instanceof Error ? error.message : "Email scheduling failed." },
                { status: 400 },
              );
            }
          }

          if (url.pathname === "/deliveries") {
            return Response.json({ deliveries: listEmailDeliveries(this.ctx.storage) });
          }

          if (url.pathname.startsWith("/internal-message/")) {
            const deliveryId = decodeURIComponent(url.pathname.slice("/internal-message/".length));

            return Response.json({
              message: readEmailDeliveryRenderedMessageById(this.ctx.storage, deliveryId),
            });
          }

          if (url.pathname === "/queue-jobs") {
            ensureQueueTable(this.ctx.storage);
            return Response.json({
              jobs: this.ctx.storage.sql
                .exec("SELECT message_json FROM fake_email_delivery_queue_jobs ORDER BY send_id ASC")
                .toArray()
                .map((row) => JSON.parse(row.message_json)),
            });
          }

          if (url.pathname === "/sends") {
            ensureSendTable(this.ctx.storage);
            return Response.json({
              sends: this.ctx.storage.sql
                .exec("SELECT message_json FROM fake_email_sends ORDER BY send_id ASC")
                .toArray()
                .map((row) => JSON.parse(row.message_json)),
            });
          }

          if (url.pathname === "/send-mode") {
            const body = await request.json();
            setSendMode(this.ctx.storage, body.mode);

            return Response.json({ mode: currentSendMode(this.ctx.storage) });
          }

          return Response.json({ error: "Not found." }, { status: 404 });
        }
      }

      function emailDeliveryQueueBinding(storage, failQueue) {
        return {
          async send(job) {
            if (failQueue) {
              throw new Error("secret-queue-token leaked from queue");
            }

            ensureEmailDeliveryTables(storage);
            ensureQueueTable(storage);
            storage.sql.exec(
              "INSERT INTO fake_email_delivery_queue_jobs (message_json) VALUES (?)",
              JSON.stringify(job),
            );

            return {};
          },
        };
      }

      function runtimeEmailEnv(env, storage) {
        if (currentSendMode(storage) === "missing-binding") {
          return env;
        }

        return {
          ...env,
          FORMLESS_EMAIL: sendEmailBinding(storage),
        };
      }

      function sendEmailBinding(storage) {
        return {
          async send(message) {
            ensureSendTable(storage);
            storage.sql.exec(
              "INSERT INTO fake_email_sends (message_json) VALUES (?)",
              JSON.stringify(message),
            );

            const sendId = storage.sql
              .exec("SELECT last_insert_rowid() AS send_id")
              .toArray()[0].send_id;

            if (
              currentSendMode(storage) === "retryable-failure" ||
              emailRecipients(message).includes("retry@example.com")
            ) {
              throw new Error("secret provider token leaked from provider");
            }

            return { messageId: \`provider-message-\${sendId}\` };
          },
        };
      }

      function emailRecipients(message) {
        const recipients = Array.isArray(message.to) ? message.to : [message.to];

        return recipients.map((recipient) =>
          typeof recipient === "string" ? recipient : recipient.email,
        );
      }

      function ensureQueueTable(storage) {
        storage.sql.exec(\`
          CREATE TABLE IF NOT EXISTS fake_email_delivery_queue_jobs (
            send_id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_json TEXT NOT NULL
          )
        \`);
      }

      function ensureSendTable(storage) {
        storage.sql.exec(\`
          CREATE TABLE IF NOT EXISTS fake_email_sends (
            send_id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_json TEXT NOT NULL
          )
        \`);
      }

      function setSendMode(storage, mode) {
        if (
          mode !== "accept" &&
          mode !== "retryable-failure" &&
          mode !== "missing-binding"
        ) {
          throw new Error("Invalid send mode.");
        }

        ensureSendModeTable(storage);
        storage.sql.exec(
          "INSERT INTO fake_email_send_mode (id, mode) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET mode = excluded.mode",
          mode,
        );
      }

      function currentSendMode(storage) {
        ensureSendModeTable(storage);

        const row = storage.sql
          .exec("SELECT mode FROM fake_email_send_mode WHERE id = 1")
          .toArray()[0];

        return row?.mode ?? "accept";
      }

      function ensureSendModeTable(storage) {
        storage.sql.exec(\`
          CREATE TABLE IF NOT EXISTS fake_email_send_mode (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            mode TEXT NOT NULL
          )
        \`);
      }

      const createdAt = "2026-06-24T00:00:00.000Z";

      function record(id, entity, values) {
        return { id, entity, values, createdAt, updatedAt: createdAt };
      }

      const controlPlaneRecords = [
        record("email-domain:mail.example.com", "email-domain", {
          enabled: true,
          providerFamily: "cloudflare",
          domain: "mail.example.com",
        }),
        record("email-sender:contact@mail.example.com", "email-sender", {
          enabled: true,
          address: "contact@mail.example.com",
          displayName: "Example Contact",
          purpose: "contact-notification",
          emailDomain: "email-domain:mail.example.com",
        }),
        record("email-sender:updates@mail.example.com", "email-sender", {
          enabled: true,
          address: "updates@mail.example.com",
          displayName: "Example Updates",
          purpose: "contact-notification",
          emailDomain: "email-domain:mail.example.com",
        }),
        record("email-sender:auth@mail.example.com", "email-sender", {
          enabled: true,
          address: "auth@mail.example.com",
          displayName: "Example Auth",
          purpose: "auth",
          emailDomain: "email-domain:mail.example.com",
        }),
      ];
    `,
  );

  return harnessPath;
}

type ScheduleBodyOverrides = {
  canonicalOrigin?: string;
  failQueue?: boolean;
  idempotencyKey?: string;
  message?: EmailDeliveryRenderedMessage;
  messageKind?: string;
  recipientAddress?: string;
  senderId?: string;
  source?: {
    operationId?: string;
    recordId?: string;
    storageIdentity: string;
  };
};

async function postSchedule(overrides: ScheduleBodyOverrides = {}) {
  return postJson<{
    delivery: EmailDeliveryRecord;
    queued: boolean;
    replayed: boolean;
  }>("/schedule", scheduleBody(overrides));
}

async function postScheduleFailure(overrides: ScheduleBodyOverrides = {}) {
  const response = await fetchEmailRuntime("/schedule", {
    body: JSON.stringify(scheduleBody(overrides)),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  expect(response.status).toBe(400);
  return (await response.json()) as {
    error: string;
  };
}
function deliveryById(deliveries: EmailDeliveryRecord[], deliveryId: string) {
  return deliveries.find((delivery) => delivery.id === deliveryId);
}
async function setSendMode(mode: "accept" | "missing-binding" | "retryable-failure") {
  return postJson<{
    mode: string;
  }>("/send-mode", { mode });
}
type QueueDispatchResult = {
  explicitAcks: string[];
  retryMessages: {
    msgId: string;
  }[];
};
async function dispatchEmailDeliveryQueue(
  jobs: EmailDeliverySendRuntimeJob[],
  messageIds: string[],
): Promise<QueueDispatchResult> {
  if (!harness) {
    throw new Error("Email runtime harness was not created.");
  }

  const worker = (await harness.mf.getWorker()) as {
    queue(
      queueName: string,
      messages: {
        attempts: number;
        body: EmailDeliverySendRuntimeJob;
        id: string;
        timestamp: Date;
      }[],
    ): Promise<QueueDispatchResult>;
  };

  return worker.queue(
    "formless-email-delivery",
    jobs.map((job, index) => ({
      attempts: 1,
      body: job,
      id: messageIds[index] ?? `message-${index + 1}`,
      timestamp: new Date("2026-06-24T00:02:00.000Z"),
    })),
  );
}

function scheduleBody(overrides: ScheduleBodyOverrides = {}) {
  return {
    messageKind: overrides.messageKind ?? "site.contactNotification",
    source: overrides.source ?? {
      storageIdentity: "app:site",
      operationId: "operation_123",
    },
    idempotencyKey: overrides.idempotencyKey ?? "contact-message-1",
    sender: { id: overrides.senderId ?? "email-sender:contact@mail.example.com" },
    recipients: [{ address: overrides.recipientAddress ?? "owner@example.com" }],
    replyTo: { address: "visitor@example.net" },
    canonicalOrigin: overrides.canonicalOrigin ?? "https://www.example.com",
    message: overrides.message ?? {
      subject: "New contact message",
      text: "Plain text body",
      html: "<p>HTML body</p>",
    },
    now: "2026-06-24T00:01:00.000Z",
    ...(overrides.failQueue === undefined ? {} : { failQueue: overrides.failQueue }),
  };
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetchEmailRuntime(path, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  expect(response.status).toBe(200);

  return (await response.json()) as T;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetchEmailRuntime(path);

  expect(response.status).toBe(200);

  return (await response.json()) as T;
}

function fetchEmailRuntime(path: string, init?: HarnessFetchInit) {
  if (!harness) {
    throw new Error("Email runtime harness was not created.");
  }

  return harness.fetch(path, init);
}
