import { defineAppSchemaModule } from "@dpeek/formless-schema";
import { STANDARD_CONTACT_MESSAGE_ENTITY_ID } from "./types.ts";

export const standardInquiryRecordSchemaModule = defineAppSchemaModule({
  key: "standard-inquiry-records",
  entities: [
    {
      id: STANDARD_CONTACT_MESSAGE_ENTITY_ID,
      key: "contact-message",
      label: "Contact message",
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
          label: "Message",
          format: "longText",
        },
      ],
      operations: [
        {
          key: "submit",
          label: "Submit message",
          kind: "create",
          scope: "collection",
          input: {
            fields: [
              {
                key: "name",
                field: "name",
                required: true,
              },
              {
                key: "email",
                field: "email",
                required: true,
              },
              {
                key: "message",
                field: "message",
                required: true,
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
        },
      ],
    },
  ],
  queries: [
    {
      key: "contactMessageAll",
      label: "All",
      entity: "contact-message",
      expression: {
        kind: "all",
      },
    },
  ],
});
