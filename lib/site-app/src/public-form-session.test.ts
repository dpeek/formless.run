import { describe, expect, it } from "vite-plus/test";
import {
  TEXT_EMAIL_FORMAT_INVALID_MESSAGE,
  TEXT_PHONE_FORMAT_INVALID_MESSAGE,
} from "@dpeek/formless-schema";

import {
  createSitePublicFormSessionController,
  projectSitePublicFormSession,
  type SitePublicFormFieldValue,
  type SitePublicFormSessionController,
} from "./public-form-session.ts";
import type {
  SiteBlockNode,
  SitePublicOperationInputFieldNode,
  SitePublicOperationNode,
} from "./types.ts";

describe("public Site form sessions", () => {
  it("projects deterministic presentation scenarios from the block contract", () => {
    const block = formBlock("contact-fixture", "contactForm", {
      buttonLabel: "Send enquiry",
      emailLabel: "Reply email",
      publicOperation: publicOperation(),
    });
    const session = projectSitePublicFormSession(block, {
      challengeReady: true,
      fieldErrors: { email: "Use a work email." },
      status: "ready",
      values: {
        name: "Ada Lovelace",
        email: "ada@example.com",
        message: "Please send details.",
      },
    });

    expect(session).toMatchObject({
      blockId: "contact-fixture",
      formId: "site-public-form:contact-fixture",
      heading: "Contact",
      fields: [
        { name: "name", value: "Ada Lovelace" },
        { name: "email", label: "Reply email", error: "Use a work email." },
        { name: "message", value: "Please send details." },
      ],
      challenge: { ready: true, siteKey: "public-site-key" },
      submit: { label: "Send enquiry", ready: false },
    });
  });

  it("projects unavailable subscribe, contact, and generic forms without submit targets", () => {
    const blocks = [
      formBlock("subscribe-unavailable", "subscribeForm"),
      formBlock("contact-unavailable", "contactForm", {
        publicOperation: publicOperation({ siteKey: undefined }),
      }),
      formBlock("generic-unavailable", "publicOperationForm", {
        publicOperation: publicOperation({ fields: undefined }),
      }),
    ];

    expect(
      blocks.map((block) => createSitePublicFormSessionController({ block }).getSnapshot()),
    ).toEqual([
      expect.objectContaining({
        blockId: "subscribe-unavailable",
        formId: "site-public-form:subscribe-unavailable",
        kind: "subscribe",
        status: "unavailable",
        disabled: true,
        feedback: { kind: "unavailable", message: "Subscribe form unavailable." },
        submit: expect.objectContaining({ ready: false }),
      }),
      expect.objectContaining({
        blockId: "contact-unavailable",
        kind: "contact",
        status: "unavailable",
        feedback: { kind: "unavailable", message: "Contact form unavailable." },
      }),
      expect.objectContaining({
        blockId: "generic-unavailable",
        kind: "publicOperation",
        status: "unavailable",
        feedback: {
          kind: "unavailable",
          message: "Public operation form unavailable.",
        },
      }),
    ]);

    for (const block of blocks) {
      const serialized = JSON.stringify(
        createSitePublicFormSessionController({ block }).getSnapshot(),
      );

      expect(serialized).not.toContain("/api/");
      expect(serialized).not.toContain("canonicalKey");
      expect(serialized).not.toContain("idempotency");
      expect(serialized).not.toContain("turnstileToken");
    }
  });

  it("projects fixed form labels, controlled values, validation, challenge readiness, and intents", async () => {
    const controller = createSitePublicFormSessionController({
      block: formBlock("contact", "contactForm", {
        body: "Tell us what you need.",
        buttonLabel: "Send enquiry",
        emailLabel: "Reply email",
        messageLabel: "Enquiry",
        nameLabel: "Your name",
        publicOperation: publicOperation(),
        successLabel: "We received your enquiry.",
      }),
      idempotencyKeyFactory: () => "private-contact-key",
    });
    const initial = controller.getSnapshot();

    expect(initial).toMatchObject({
      heading: "Contact",
      body: "Tell us what you need.",
      kind: "contact",
      status: "ready",
      disabled: false,
      fields: [
        {
          name: "name",
          label: "Your name",
          required: true,
          control: "text",
          value: "",
          disabled: false,
        },
        {
          name: "email",
          label: "Reply email",
          required: true,
          control: "text",
          format: "email",
          value: "",
        },
        {
          name: "message",
          label: "Enquiry",
          required: true,
          control: "longText",
          value: "",
        },
      ],
      challenge: {
        kind: "turnstile",
        siteKey: "public-site-key",
        ready: false,
        resetSignal: 0,
        tokenChangeIntent: {
          type: "challengeTokenChange",
          formId: "site-public-form:contact",
        },
      },
      submit: {
        label: "Send enquiry",
        pendingLabel: "Sending...",
        ready: false,
        intent: { type: "submit", formId: "site-public-form:contact" },
      },
    });
    expect(initial.fields[0]?.changeIntent).toEqual({
      type: "fieldChange",
      formId: initial.formId,
      occurrenceId: `${initial.formId}:field:name`,
    });

    await changeField(controller, "name", "Ada Lovelace");
    await changeField(controller, "email", "not-an-email");
    await changeField(controller, "message", "Please send details.");

    expect(field(controller, "email")).toMatchObject({
      value: "not-an-email",
      error: TEXT_EMAIL_FORMAT_INVALID_MESSAGE,
    });
    expect(controller.getSnapshot().submit.ready).toBe(false);

    await changeField(controller, "email", "  ada@example.com  ");
    await challengeToken(controller, "turnstile-token");

    expect(field(controller, "email")).toMatchObject({
      value: "  ada@example.com  ",
    });
    expect(field(controller, "email")).not.toHaveProperty("error");
    expect(controller.getSnapshot()).toMatchObject({
      challenge: { ready: true },
      submit: { ready: true },
    });
  });

  it("preserves every public scalar control, invalid raw drafts, and free-text suggestions", async () => {
    const controller = createSitePublicFormSessionController({
      block: formBlock("generic", "publicOperationForm", {
        publicOperation: publicOperation({ fields: genericFields }),
      }),
      idempotencyKeyFactory: () => "private-generic-key",
    });

    expect(
      controller.getSnapshot().fields.map((field) => ({
        control: field.control,
        format: field.format,
        name: field.name,
        options: field.options,
        suggestions: field.suggestions,
        value: field.value,
      })),
    ).toEqual([
      {
        control: "text",
        format: undefined,
        name: "summary",
        options: undefined,
        suggestions: undefined,
        value: "",
      },
      {
        control: "longText",
        format: undefined,
        name: "details",
        options: undefined,
        suggestions: undefined,
        value: "",
      },
      {
        control: "boolean",
        format: undefined,
        name: "confirmed",
        options: undefined,
        suggestions: undefined,
        value: false,
      },
      {
        control: "date",
        format: undefined,
        name: "neededBy",
        options: undefined,
        suggestions: undefined,
        value: "",
      },
      {
        control: "number",
        format: undefined,
        name: "quantity",
        options: undefined,
        suggestions: undefined,
        value: "",
      },
      {
        control: "enum",
        format: undefined,
        name: "category",
        options: [
          { value: "general", label: "General" },
          { value: "priority", label: "Priority" },
        ],
        suggestions: undefined,
        value: "",
      },
      {
        control: "text",
        format: "email",
        name: "replyEmail",
        options: undefined,
        suggestions: undefined,
        value: "",
      },
      {
        control: "text",
        format: "phone",
        name: "phone",
        options: undefined,
        suggestions: undefined,
        value: "",
      },
      {
        control: "text",
        format: undefined,
        name: "inquiryType",
        options: undefined,
        suggestions: ["Support", "Sales"],
        value: "",
      },
    ]);

    await changeField(controller, "summary", "Lab results");
    await changeField(controller, "details", "Include chain of custody.");
    await changeField(controller, "confirmed", true);
    await changeField(controller, "neededBy", "2026-02-31");
    await changeField(controller, "quantity", "many");
    await changeField(controller, "category", "private");
    await changeField(controller, "replyEmail", "not-an-email");
    await changeField(controller, "phone", "555-abc");
    await changeField(controller, "inquiryType", "Custom request");

    expect(field(controller, "neededBy")).toMatchObject({
      value: "2026-02-31",
      error: 'Field "neededBy" must be a YYYY-MM-DD date.',
    });
    expect(field(controller, "quantity")).toMatchObject({
      value: "many",
      error: "Enter a finite number.",
    });
    expect(field(controller, "category")).toMatchObject({
      value: "private",
      error: 'Field "category" must be a known enum value.',
    });
    expect(field(controller, "replyEmail").error).toBe(TEXT_EMAIL_FORMAT_INVALID_MESSAGE);
    expect(field(controller, "phone").error).toBe(TEXT_PHONE_FORMAT_INVALID_MESSAGE);
    expect(field(controller, "inquiryType")).toMatchObject({
      value: "Custom request",
      suggestions: ["Support", "Sales"],
    });
    expect(field(controller, "inquiryType")).not.toHaveProperty("error");

    await changeField(controller, "neededBy", "2026-07-20");
    await changeField(controller, "quantity", "3.5");
    await changeField(controller, "category", "priority");
    await changeField(controller, "replyEmail", "name@example.com");
    await changeField(controller, "phone", "+1 (555) 123-4567");
    await challengeToken(controller, "turnstile-token");

    expect(controller.getSnapshot().fields.every((field) => field.error === undefined)).toBe(true);
    expect(controller.getSnapshot().submit.ready).toBe(true);
  });

  it("publishes submitting then success while retaining request construction and response validation privately", async () => {
    const response = deferred<Response>();
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const controller = createSitePublicFormSessionController({
      block: formBlock("generic-submit", "publicOperationForm", {
        publicOperation: publicOperation({
          fields: [genericFields[0]!, genericFields[2]!, genericFields[4]!],
        }),
        successLabel: "Request accepted.",
      }),
      fetcher: async (input, init) => {
        requests.push({ input, init });
        return response.promise;
      },
      idempotencyKeyFactory: () => "site-public-operation:generic-submit:private-key",
    });
    const statuses: string[] = [];
    const unsubscribe = controller.subscribe(() => {
      statuses.push(controller.getSnapshot().status);
    });

    await changeField(controller, "summary", "Private request value");
    await changeField(controller, "confirmed", false);
    await changeField(controller, "quantity", "2.5");
    await challengeToken(controller, "private-turnstile-token");

    const submission = controller.dispatch(controller.getSnapshot().submit.intent);

    expect(controller.getSnapshot()).toMatchObject({
      status: "submitting",
      disabled: true,
      fields: [
        expect.objectContaining({ disabled: true }),
        expect.objectContaining({ disabled: true }),
        expect.objectContaining({ disabled: true }),
      ],
      challenge: { disabled: true },
      submit: { ready: false },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toEqual({
      input: "/api/site/public/operations/example/submit",
      init: {
        body: JSON.stringify({
          input: {
            summary: "Private request value",
            confirmed: false,
            quantity: 2.5,
          },
          proof: { turnstileToken: "private-turnstile-token" },
          source: { siteBlockId: "generic-submit" },
          idempotencyKey: "site-public-operation:generic-submit:private-key",
        }),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    });

    response.resolve(
      Response.json(
        publicCreateResponse({
          record: {
            id: "private-created-record",
            entity: "request",
            values: { providerSecret: "private-provider-value" },
          },
        }),
      ),
    );
    await submission;
    unsubscribe();

    expect(statuses).toContain("submitting");
    expect(controller.getSnapshot()).toMatchObject({
      status: "success",
      disabled: true,
      feedback: { kind: "success", message: "Request accepted." },
    });
    const serialized = JSON.stringify(controller.getSnapshot());

    expect(serialized).not.toContain("private-turnstile-token");
    expect(serialized).not.toContain("private-key");
    expect(serialized).not.toContain("/api/site/public/operations");
    expect(serialized).not.toContain("private-created-record");
    expect(serialized).not.toContain("private-provider-value");
    expect(serialized).not.toContain("idempotencyKey");
    expect(serialized).not.toContain("proof");
    expect(serialized).not.toContain("output");
  });

  it("projects display-safe failure, challenge reset, retry, and successful replay", async () => {
    let attempt = 0;
    const requestBodies: string[] = [];
    const controller = createSitePublicFormSessionController({
      block: formBlock("subscribe", "subscribeForm", {
        publicOperation: publicOperation({
          entityName: "subscription",
          operationName: "subscribe",
        }),
      }),
      fetcher: async (_input, init) => {
        if (typeof init?.body !== "string") {
          throw new Error("Expected a JSON request body.");
        }
        requestBodies.push(init.body);
        attempt += 1;

        return attempt === 1
          ? Response.json({ error: "Please try again." }, { status: 503 })
          : Response.json(publicCommandResponse({ status: "replayed" }));
      },
      idempotencyKeyFactory: () => "site-subscribe:subscribe:stable-key",
    });

    await changeField(controller, "email", "reader@example.com");
    await challengeToken(controller, "first-token");
    await controller.dispatch(controller.getSnapshot().submit.intent);

    expect(controller.getSnapshot()).toMatchObject({
      status: "failed",
      disabled: false,
      challenge: { ready: false, resetSignal: 1 },
      feedback: { kind: "failure", message: "Please try again." },
      retryIntent: { type: "retry", formId: "site-public-form:subscribe" },
      submit: { ready: false },
    });

    await controller.dispatch(controller.getSnapshot().retryIntent!);

    expect(controller.getSnapshot()).toMatchObject({
      status: "ready",
      challenge: { ready: false, resetSignal: 1 },
    });
    expect(controller.getSnapshot()).not.toHaveProperty("feedback");

    await challengeToken(controller, "second-token");
    await controller.dispatch(controller.getSnapshot().submit.intent);

    expect(controller.getSnapshot()).toMatchObject({
      status: "success",
      feedback: { kind: "success", message: "You're subscribed." },
    });
    expect(requestBodies).toHaveLength(2);
    expect(
      requestBodies.every((body) => body.includes("site-subscribe:subscribe:stable-key")),
    ).toBe(true);
  });

  it("maps raw fetch and invalid response failures to display-safe messages", async () => {
    const rawFailure = createSitePublicFormSessionController({
      block: formBlock("contact-raw", "contactForm", { publicOperation: publicOperation() }),
      fetcher: async () => {
        throw new Error("postgres://private-host/contact table failed");
      },
      idempotencyKeyFactory: () => "private-key",
    });

    await completeContactDraft(rawFailure);
    await rawFailure.dispatch(rawFailure.getSnapshot().submit.intent);

    expect(rawFailure.getSnapshot().feedback).toEqual({
      kind: "failure",
      message: "Contact request failed.",
    });
    expect(JSON.stringify(rawFailure.getSnapshot())).not.toContain("postgres");

    const invalidResponse = createSitePublicFormSessionController({
      block: formBlock("contact-invalid", "contactForm", { publicOperation: publicOperation() }),
      fetcher: async () => Response.json({ record: { id: "private-record" } }),
      idempotencyKeyFactory: () => "private-key",
    });

    await completeContactDraft(invalidResponse);
    await invalidResponse.dispatch(invalidResponse.getSnapshot().submit.intent);

    expect(invalidResponse.getSnapshot().feedback).toEqual({
      kind: "failure",
      message: "Contact request returned an invalid response.",
    });
    expect(JSON.stringify(invalidResponse.getSnapshot())).not.toContain("private-record");
  });

  it("marks every invalid field on submit without using native browser validation", async () => {
    const controller = createSitePublicFormSessionController({
      block: formBlock("generic-invalid", "publicOperationForm", {
        publicOperation: publicOperation({ fields: genericFields }),
      }),
      idempotencyKeyFactory: () => "private-key",
    });

    await controller.dispatch(controller.getSnapshot().submit.intent);

    expect(controller.getSnapshot().status).toBe("ready");
    expect(controller.getSnapshot().submit.ready).toBe(false);
    expect(field(controller, "summary").error).toBe('Field "summary" cannot be empty.');
    expect(field(controller, "neededBy").error).toBe('Field "neededBy" cannot be empty.');
    expect(field(controller, "quantity").error).toBe('Field "quantity" cannot be empty.');
    expect(field(controller, "category").error).toBe('Field "category" cannot be empty.');
  });

  it("requires affirmative boolean acceptance while ordinary required booleans accept false", async () => {
    const requestBodies: unknown[] = [];
    const controller = createSitePublicFormSessionController({
      block: formBlock("affirmative-consent", "publicOperationForm", {
        publicOperation: publicOperation({
          fields: [
            {
              name: "ordinaryBoolean",
              label: "Ordinary boolean",
              required: true,
              control: "boolean",
            },
            {
              name: "contactConsent",
              label: "I agree to be contacted",
              required: true,
              mustBeTrue: true,
              control: "boolean",
            },
          ],
        }),
      }),
      fetcher: async (_input, init) => {
        if (typeof init?.body !== "string") {
          throw new Error("Expected a JSON request body.");
        }
        requestBodies.push(JSON.parse(init.body));
        return Response.json(publicCreateResponse({ record: { id: "request-1" } }));
      },
      idempotencyKeyFactory: () => "affirmative-consent-key",
    });

    await challengeToken(controller, "turnstile-token");

    expect(field(controller, "ordinaryBoolean")).toMatchObject({
      required: true,
      value: false,
    });
    expect(field(controller, "ordinaryBoolean")).not.toHaveProperty("mustBeTrue");
    expect(field(controller, "contactConsent")).toMatchObject({
      required: true,
      mustBeTrue: true,
      value: false,
    });
    expect(controller.getSnapshot().submit.ready).toBe(false);

    await controller.dispatch(controller.getSnapshot().submit.intent);

    expect(field(controller, "ordinaryBoolean")).not.toHaveProperty("error");
    expect(field(controller, "contactConsent").error).toBe(
      'Field "contactConsent" must be accepted.',
    );
    expect(requestBodies).toEqual([]);

    await changeField(controller, "contactConsent", true);

    expect(field(controller, "contactConsent")).not.toHaveProperty("error");
    expect(controller.getSnapshot().submit.ready).toBe(true);

    await controller.dispatch(controller.getSnapshot().submit.intent);

    expect(requestBodies).toEqual([
      expect.objectContaining({
        input: {
          ordinaryBoolean: false,
          contactConsent: true,
        },
      }),
    ]);
  });
});

const genericFields: SitePublicOperationInputFieldNode[] = [
  { name: "summary", label: "Summary", required: true, control: "text" },
  { name: "details", label: "Details", required: false, control: "longText" },
  { name: "confirmed", label: "Confirmed", required: false, control: "boolean" },
  { name: "neededBy", label: "Needed by", required: true, control: "date" },
  { name: "quantity", label: "Quantity", required: true, control: "number" },
  {
    name: "category",
    label: "Category",
    required: true,
    control: "enum",
    options: [
      { value: "general", label: "General" },
      { value: "priority", label: "Priority" },
    ],
  },
  {
    name: "replyEmail",
    label: "Reply email",
    required: false,
    control: "text",
    format: "email",
  },
  {
    name: "phone",
    label: "Phone",
    required: false,
    control: "text",
    format: "phone",
  },
  {
    name: "inquiryType",
    label: "Inquiry type",
    required: false,
    control: "text",
    suggestions: ["Support", "Sales"],
  },
];

async function completeContactDraft(controller: SitePublicFormSessionController): Promise<void> {
  await changeField(controller, "name", "Ada");
  await changeField(controller, "email", "ada@example.com");
  await changeField(controller, "message", "Please send details.");
  await challengeToken(controller, "private-token");
}

async function changeField(
  controller: SitePublicFormSessionController,
  name: string,
  value: SitePublicFormFieldValue,
): Promise<void> {
  const projectedField = field(controller, name);

  await controller.dispatch({ ...projectedField.changeIntent, value });
}

async function challengeToken(
  controller: SitePublicFormSessionController,
  token: string,
): Promise<void> {
  const challenge = controller.getSnapshot().challenge;

  if (!challenge) {
    throw new Error("Expected a public form challenge.");
  }

  await controller.dispatch({ ...challenge.tokenChangeIntent, token });
}

function field(controller: SitePublicFormSessionController, name: string) {
  const projectedField = controller
    .getSnapshot()
    .fields.find((candidate) => candidate.name === name);

  if (!projectedField) {
    throw new Error(`Expected projected public form field "${name}".`);
  }

  return projectedField;
}

function formBlock(
  id: string,
  type: "subscribeForm" | "contactForm" | "publicOperationForm",
  overrides: Partial<SiteBlockNode> = {},
): SiteBlockNode {
  return {
    id,
    type,
    label: type === "subscribeForm" ? "Subscribe" : type === "contactForm" ? "Contact" : "Request",
    placements: [],
    ...overrides,
  };
}

function publicOperation(
  options: {
    entityName?: string;
    fields?: SitePublicOperationInputFieldNode[];
    operationName?: string;
    siteKey?: string;
  } = {},
): SitePublicOperationNode {
  const entityName = options.entityName ?? "example";
  const operationName = options.operationName ?? "submit";
  const fields = Object.hasOwn(options, "fields") ? options.fields : [];
  const siteKey = Object.hasOwn(options, "siteKey") ? options.siteKey : "public-site-key";

  return {
    entityName,
    operationName,
    canonicalKey: `${entityName}.${operationName}`,
    route: `/api/site/public/operations/${entityName}/${operationName}`,
    challenge: {
      kind: "turnstile",
      ...(siteKey === undefined ? {} : { siteKey }),
    },
    ...(fields === undefined ? {} : { fields }),
  };
}

function publicCommandResponse({
  status = "committed",
}: { status?: "committed" | "replayed" } = {}) {
  return {
    invocationId: "operation-1",
    operation: {
      entityName: "subscription",
      operationName: "subscribe",
      canonicalKey: "subscription.subscribe",
      kind: "command",
    },
    output: {
      type: "command",
      affectedChangeIds: ["10"],
      cursor: 12,
    },
    status,
  };
}

function publicCreateResponse({ record }: { record: unknown }) {
  return {
    invocationId: "operation-1",
    operation: {
      entityName: "request",
      operationName: "submit",
      canonicalKey: "request.submit",
      kind: "create",
    },
    output: {
      type: "create",
      affectedChangeIds: ["10"],
      cursor: 12,
      record,
    },
    status: "committed",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}
