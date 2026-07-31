import {
  INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID,
  instanceControlPlaneProductionIdentityFromRecords,
} from "@dpeek/formless-instance-control-plane";
import type { AppSchema } from "@dpeek/formless-schema";
import type { StoredRecord } from "@dpeek/formless-storage";
import type { AuthorityStorageIdentity } from "../shared/app-storage-identity.ts";
import {
  parseEmailDeliveryAddress,
  type EmailDeliveryAddress,
  type EmailDeliveryScheduleRequest,
} from "../shared/email-runtime.ts";
import type { OperationInvocationResponse } from "../shared/operation-invocation.ts";
import type { DeploymentControlPlaneClientEnv } from "./deployment-control-plane-client.ts";
import { readControlPlaneRecords } from "./deployment-control-plane-client.ts";
import {
  resolveDefaultEmailSenderReference,
  schedulePlatformEmailDelivery,
} from "./email-runtime.ts";
import {
  operationInputNotificationDisplayRows,
  operationInputNotificationOutputDisplayRows,
  operationInputNotificationSubmittedInput,
} from "./operation-input-notification-display.ts";
import { getBootstrapRecords } from "./storage.ts";

const operationInputNotificationMessageKind = "site-operation-input-notification";
const operationInputNotificationPurpose = "operation-input-notification";

export type SiteOperationInputNotificationEnv = DeploymentControlPlaneClientEnv & {
  FORMLESS_AUTHORITY?: DurableObjectNamespace;
};

export type SiteOperationInputNotificationConfigurationAdapter = {
  read(input: {
    requestUrl: string;
  }): Promise<readonly StoredRecord[] | undefined> | readonly StoredRecord[] | undefined;
};

export type SiteOperationInputNotificationEmailSchedulingAdapter = {
  schedule(input: {
    request: EmailDeliveryScheduleRequest;
    requestUrl: string;
  }): Promise<void> | void;
};

export type SiteOperationInputNotificationAdapters = {
  configuration: SiteOperationInputNotificationConfigurationAdapter;
  emailScheduling: SiteOperationInputNotificationEmailSchedulingAdapter;
};

export function createSiteOperationInputNotificationAdapters(
  env: SiteOperationInputNotificationEnv,
): SiteOperationInputNotificationAdapters {
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

export async function scheduleSiteOperationInputNotificationAfterPublicOperation(input: {
  adapters: SiteOperationInputNotificationAdapters;
  identity: AuthorityStorageIdentity;
  records?: readonly StoredRecord[];
  requestUrl: string;
  response: OperationInvocationResponse;
  schema: AppSchema;
  storage?: DurableObjectStorage;
}): Promise<void> {
  if (!isCommittedPublicOperation(input.response)) {
    return;
  }

  try {
    const sourceRecords = input.records ?? sourceRecordsFromStorage(input.storage);
    const sourceBlock = operationInputNotificationSourceBlock(
      sourceRecords,
      input.response,
      input.identity,
    );

    if (!sourceBlock) {
      return;
    }

    const controlPlaneRecords =
      (await input.adapters.configuration.read({ requestUrl: input.requestUrl })) ?? [];
    const settings = operationInputNotificationSettings(controlPlaneRecords);
    const canonicalOrigin =
      instanceControlPlaneProductionIdentityFromRecords(controlPlaneRecords)?.canonicalOrigin;

    if (!settings || !canonicalOrigin) {
      return;
    }

    const submittedInput = operationInputNotificationSubmittedInput(input.response);
    const fields = operationInputNotificationDisplayRows({
      response: input.response,
      schema: input.schema,
    });
    const outputFields = operationInputNotificationOutputDisplayRows({
      response: input.response,
      schema: input.schema,
    });

    if (fields.length === 0) {
      return;
    }

    await input.adapters.emailScheduling.schedule({
      requestUrl: input.requestUrl,
      request: {
        canonicalOrigin,
        idempotencyKey: await operationInputNotificationIdempotencyKey(input.response),
        message: renderOperationInputNotificationMessage({
          fields,
          host: input.response.invocation.source.host,
          operationKey: input.response.invocation.operation.canonicalKey,
          outputFields,
          path: input.response.invocation.source.path,
          siteBlockId: input.response.invocation.source.siteBlockId,
          storageIdentity: input.identity.authorityName,
        }),
        messageKind: operationInputNotificationMessageKind,
        recipients: [
          {
            address: settings.recipient,
            displayName: "Public operation",
          },
        ],
        ...operationInputNotificationReplyTo({
          input: submittedInput,
          replyToField: stringRecordValue(sourceBlock.values.operationNotificationReplyToField),
        }),
        sender: {
          id: settings.senderId,
        },
        source: {
          operationId: input.response.invocation.invocationId,
          ...createdRecordId(input.response),
          storageIdentity: input.identity.authorityName,
        },
      },
    });
  } catch {
    return;
  }
}

function sourceRecordsFromStorage(
  storage: DurableObjectStorage | undefined,
): readonly StoredRecord[] {
  return storage === undefined ? [] : getBootstrapRecords(storage);
}

function isCommittedPublicOperation(response: OperationInvocationResponse): boolean {
  return response.status === "committed" && response.invocation.source.protocol === "public";
}

function operationInputNotificationSourceBlock(
  records: readonly StoredRecord[],
  response: OperationInvocationResponse,
  identity: AuthorityStorageIdentity,
): StoredRecord | undefined {
  const siteBlockId = response.invocation.source.siteBlockId;

  if (!siteBlockId) {
    return undefined;
  }

  const block = records.find(
    (record) => record.id === siteBlockId && record.entity === "block" && !record.deletedAt,
  );

  if (
    block?.values.type !== "publicOperationForm" ||
    block.values.operationNotificationMode !== "email" ||
    block.values.operationKey !== response.invocation.operation.canonicalKey ||
    !sourceBlockTargetsIdentity(block, identity)
  ) {
    return undefined;
  }

  return block;
}

function sourceBlockTargetsIdentity(
  block: StoredRecord,
  identity: AuthorityStorageIdentity,
): boolean {
  const targetKind = stringRecordValue(block.values.operationTargetKind);

  if (!targetKind) {
    return true;
  }

  if (targetKind === "schemaKey") {
    return (
      identity.kind === "schemaKey" &&
      stringRecordValue(block.values.operationTargetSchemaKey) === identity.sourceSchemaKey
    );
  }

  if (targetKind === "appInstall") {
    return (
      identity.kind === "appInstall" &&
      stringRecordValue(block.values.operationTargetPackageAppKey) === identity.packageAppKey &&
      stringRecordValue(block.values.operationTargetInstallId) === identity.installId
    );
  }

  return false;
}

function operationInputNotificationSettings(
  records: readonly StoredRecord[],
): { senderId: string; recipient: string } | undefined {
  const settings = records.find(
    (record) =>
      record.entity === "instance-settings" &&
      !record.deletedAt &&
      record.values.settingsId === INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID,
  );
  const senderId = resolveDefaultEmailSenderReference(records, "contact-notification")?.id;
  const recipient = stringRecordValue(settings?.values.contactNotificationRecipient);

  return senderId && recipient ? { senderId, recipient } : undefined;
}

function operationInputNotificationReplyTo(input: {
  input: Record<string, unknown>;
  replyToField?: string;
}): { replyTo: EmailDeliveryAddress } | object {
  if (!input.replyToField) {
    return {};
  }

  const value = input.input[input.replyToField];

  if (typeof value !== "string" || value.trim() === "") {
    return {};
  }

  try {
    return {
      replyTo: parseEmailDeliveryAddress("Operation input notification reply-to", {
        address: value,
      }),
    };
  } catch {
    return {};
  }
}

function renderOperationInputNotificationMessage(input: {
  fields: Array<{ label: string; value: string }>;
  host?: string;
  operationKey: string;
  outputFields: Array<{ label: string; value: string }>;
  path?: string;
  siteBlockId?: string;
  storageIdentity: string;
}) {
  const facts = [
    { label: "Operation", value: input.operationKey },
    { label: "Target storage", value: input.storageIdentity },
    ...(input.host === undefined ? [] : [{ label: "Host", value: input.host }]),
    ...(input.path === undefined ? [] : [{ label: "Path", value: input.path }]),
    ...(input.siteBlockId === undefined ? [] : [{ label: "Site block", value: input.siteBlockId }]),
  ];
  const textFacts = facts.map((fact) => `${fact.label}: ${fact.value}`);
  const textFields = input.fields.map((field) => `${field.label}: ${field.value}`);
  const htmlFacts = renderKeyValueTable(facts);
  const htmlFields = renderKeyValueTable(input.fields);

  return {
    subject: `New public operation input for ${input.operationKey}`.slice(0, 998),
    text: [
      "New public operation form submission",
      "",
      ...textFacts,
      "",
      "Submitted input",
      "",
      ...textFields,
      ...operationOutputTextSection(input.outputFields),
    ].join("\n"),
    html: [
      "<p>New public operation form submission</p>",
      htmlFacts,
      "<p>Submitted input</p>",
      htmlFields,
      ...operationOutputHtmlSection(input.outputFields),
    ].join(""),
  };
}

function operationOutputTextSection(fields: Array<{ label: string; value: string }>): string[] {
  if (fields.length === 0) {
    return [];
  }

  return ["", "Operation output", "", ...fields.map((field) => `${field.label}: ${field.value}`)];
}

function operationOutputHtmlSection(fields: Array<{ label: string; value: string }>): string[] {
  if (fields.length === 0) {
    return [];
  }

  return ["<p>Operation output</p>", renderKeyValueTable(fields)];
}

function renderKeyValueTable(rows: Array<{ label: string; value: string }>): string {
  const tableStyle = "border-collapse:collapse;width:100%;margin:0 0 16px 0;";
  const labelStyle =
    "border:1px solid #d0d7de;padding:6px 8px;text-align:left;vertical-align:top;white-space:nowrap;";
  const valueStyle = "border:1px solid #d0d7de;padding:6px 8px;vertical-align:top;";
  const htmlRows = rows
    .map(
      (row) =>
        `<tr><th scope="row" style="${labelStyle}">${escapeHtml(
          row.label,
        )}</th><td style="${valueStyle}">${escapeHtml(row.value).replaceAll(
          "\n",
          "<br>",
        )}</td></tr>`,
    )
    .join("");

  return `<table cellpadding="0" cellspacing="0" style="${tableStyle}"><tbody>${htmlRows}</tbody></table>`;
}

function createdRecordId(response: OperationInvocationResponse): { recordId: string } | object {
  return response.output.type === "create" ? { recordId: response.output.record.id } : {};
}

async function operationInputNotificationIdempotencyKey(
  response: OperationInvocationResponse,
): Promise<string> {
  const key = response.invocation.idempotency.key ?? response.invocation.invocationId;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      `${operationInputNotificationPurpose}\n${response.invocation.operation.canonicalKey}\n${key}`,
    ),
  );
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return `${operationInputNotificationPurpose}:${hex}`;
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
