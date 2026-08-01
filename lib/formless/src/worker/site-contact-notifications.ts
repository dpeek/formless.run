import {
  INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID,
  instanceControlPlaneProductionIdentityFromRecords,
} from "@dpeek/formless-instance-control-plane";
import type { StoredRecord } from "@dpeek/formless-storage";
import type { EmailDeliveryScheduleRequest } from "../shared/email-runtime.ts";
import type { OperationInvocationResponse } from "../shared/operation-invocation.ts";
import type { DeploymentControlPlaneClientEnv } from "./deployment-control-plane-client.ts";
import { readControlPlaneRecords } from "./deployment-control-plane-client.ts";
import {
  resolveDefaultEmailSenderReference,
  schedulePlatformEmailDelivery,
} from "./email-runtime.ts";
import { FORMLESS_PROGRAM_STORAGE_IDENTITY } from "../program/target.ts";

const contactNotificationMessageKind = "site-contact-notification";

export type SiteContactNotificationEnv = DeploymentControlPlaneClientEnv & {
  FORMLESS_AUTHORITY?: DurableObjectNamespace;
};

export type SiteContactNotificationConfigurationAdapter = {
  read(input: {
    requestUrl: string;
  }): Promise<readonly StoredRecord[] | undefined> | readonly StoredRecord[] | undefined;
};

export type SiteContactNotificationEmailSchedulingAdapter = {
  schedule(input: {
    request: EmailDeliveryScheduleRequest;
    requestUrl: string;
  }): Promise<void> | void;
};

export type SiteContactNotificationAdapters = {
  configuration: SiteContactNotificationConfigurationAdapter;
  emailScheduling: SiteContactNotificationEmailSchedulingAdapter;
};

export function createSiteContactNotificationAdapters(
  env: SiteContactNotificationEnv,
): SiteContactNotificationAdapters {
  return {
    configuration: {
      read: ({ requestUrl }) => readControlPlaneRecords({ env, requestUrl }),
    },
    emailScheduling: {
      schedule: async ({ request, requestUrl }) => {
        if (!env.FORMLESS_AUTHORITY) {
          return;
        }

        await schedulePlatformEmailDelivery({
          env: { FORMLESS_AUTHORITY: env.FORMLESS_AUTHORITY },
          request,
          requestUrl,
        });
      },
    },
  };
}

export async function scheduleSiteContactNotificationAfterPublicOperation(input: {
  adapters: SiteContactNotificationAdapters;
  requestUrl: string;
  response: OperationInvocationResponse;
}): Promise<void> {
  if (!isCommittedContactMessageCreate(input.response)) {
    return;
  }

  const controlPlaneRecords =
    (await input.adapters.configuration.read({ requestUrl: input.requestUrl })) ?? [];
  const settings = contactNotificationSettings(controlPlaneRecords);
  const canonicalOrigin =
    instanceControlPlaneProductionIdentityFromRecords(controlPlaneRecords)?.canonicalOrigin;

  if (!settings || !canonicalOrigin) {
    return;
  }

  const record = input.response.output.record;
  const name = stringRecordValue(record.values.name);
  const email = stringRecordValue(record.values.email);
  const message = stringRecordValue(record.values.message);

  if (!name || !email || !message) {
    return;
  }

  try {
    await input.adapters.emailScheduling.schedule({
      requestUrl: input.requestUrl,
      request: {
        canonicalOrigin,
        idempotencyKey: await contactNotificationIdempotencyKey(input.response),
        message: renderSiteContactNotificationMessage({ email, message, name }),
        messageKind: contactNotificationMessageKind,
        recipients: [
          {
            address: settings.recipient,
            displayName: "Site contact",
          },
        ],
        replyTo: {
          address: email,
          displayName: singleLineDisplayName(name),
        },
        sender: {
          id: settings.senderId,
        },
        source: {
          operationId: input.response.invocation.invocationId,
          recordId: record.id,
          storageIdentity: FORMLESS_PROGRAM_STORAGE_IDENTITY,
        },
      },
    });
  } catch {
    return;
  }
}

function isCommittedContactMessageCreate(
  response: OperationInvocationResponse,
): response is OperationInvocationResponse & {
  output: Extract<OperationInvocationResponse["output"], { type: "create" }>;
} {
  return (
    response.status === "committed" &&
    response.invocation.operation.entityName === "contact-message" &&
    response.invocation.operation.operationName === "submit" &&
    response.output.type === "create" &&
    response.output.record.entity === "contact-message"
  );
}

function contactNotificationSettings(
  records: readonly StoredRecord[],
): { senderId: string; recipient: string } | undefined {
  const settings = records.find(
    (record) =>
      record.entity === "instance-settings" &&
      !record.deletedAt &&
      stringRecordValue(record.values.settingsId) === INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID,
  );
  const senderId = resolveDefaultEmailSenderReference(records, "contact-notification")?.id;
  const recipient = stringRecordValue(settings?.values.contactNotificationRecipient);

  return senderId && recipient ? { senderId, recipient } : undefined;
}

function renderSiteContactNotificationMessage(input: {
  email: string;
  message: string;
  name: string;
}) {
  const subjectName = input.name.slice(0, 120);

  return {
    subject: `New contact message from ${subjectName}`,
    text: [
      "New contact form message",
      "",
      `Name: ${input.name}`,
      `Email: ${input.email}`,
      "",
      input.message,
    ].join("\n"),
    html: [
      "<p>New contact form message</p>",
      "<dl>",
      `<dt>Name</dt><dd>${escapeHtml(input.name)}</dd>`,
      `<dt>Email</dt><dd>${escapeHtml(input.email)}</dd>`,
      "</dl>",
      `<p>${escapeHtml(input.message).replaceAll("\n", "<br>")}</p>`,
    ].join(""),
  };
}

async function contactNotificationIdempotencyKey(
  response: OperationInvocationResponse,
): Promise<string> {
  const key = response.invocation.idempotency.key ?? response.invocation.invocationId;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${response.invocation.invocationId}\n${key}`),
  );
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return `contact-notification:${hex}`;
}

function singleLineDisplayName(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 320) || "Site visitor";
}

function stringRecordValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
