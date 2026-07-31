import type { AppSchema } from "@dpeek/formless-schema";

export const emailStylePublicIntakeOperationKey = "intake-request.submit";
export const emailStylePublicIntakeFormBlockId = "rec_site_block_email_style_public_intake";

export const emailStylePublicIntakeInput = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  message: "Please send manual intake details.",
  requestType: "general",
  neededBy: "2026-07-15",
  quantity: 2,
} satisfies Record<string, unknown>;

export const emailStylePublicIntakeFormBlockValues = {
  type: "publicOperationForm",
  label: "Request manual intake",
  body: "Send the request details for manual follow-up.",
  operationKey: emailStylePublicIntakeOperationKey,
  buttonLabel: "Send request",
  successLabel: "Request received.",
  operationNotificationMode: "email",
  operationNotificationReplyToField: "email",
} satisfies Record<string, unknown>;
export function schemaWithEmailStylePublicIntake(sourceSchema: AppSchema): AppSchema {
  const schema = structuredClone(sourceSchema);
  schema.entities.push({
    id: "entity_c8c25918-f4f4-4b1d-bdb6-ad233be2a84b",
    key: "intake-request",
    label: "Intake request",
    fields: [
      {
        key: "name",
        type: "text",
        required: true,
        label: "Name",
      },
      {
        key: "email",
        type: "text",
        required: true,
        label: "Email",
      },
      {
        key: "message",
        type: "text",
        required: true,
        label: "Request details",
        format: "longText",
      },
      {
        key: "requestType",
        type: "enum",
        required: false,
        label: "Request type",
        values: [
          { key: "general", label: "General" },
          { key: "priority", label: "Priority" },
        ],
      },
      {
        key: "neededBy",
        type: "date",
        required: false,
        label: "Needed by",
      },
      {
        key: "quantity",
        type: "number",
        required: false,
        label: "Quantity",
        min: 1,
      },
    ],
    operations: [
      {
        key: "submit",
        label: "Submit intake request",
        kind: "create",
        scope: "collection",
        input: {
          fields: [
            {
              key: "name",
              field: "name",
              required: true,
              label: "Your name",
            },
            {
              key: "email",
              field: "email",
              required: true,
              label: "Email",
            },
            {
              key: "message",
              field: "message",
              required: true,
              label: "Request details",
            },
            {
              key: "requestType",
              field: "requestType",
              label: "Request type",
            },
            {
              key: "neededBy",
              field: "neededBy",
              label: "Needed by",
            },
            {
              key: "quantity",
              field: "quantity",
              label: "Quantity",
            },
          ],
        },
        effect: {
          type: "createRecord",
        },
        output: {
          type: "create",
        },
        policy: {
          actors: ["anonymous"],
          access: {
            actor: "anonymous",
            challenge: {
              kind: "turnstile",
            },
            origin: {
              kind: "same-origin",
            },
          },
        },
        idempotency: {
          required: true,
        },
        audit: {
          input: "summary",
        },
      },
    ],
  });
  return schema;
}
