import type {
  SiteBlockNode,
  SitePublicFormField,
  SitePublicFormFieldValue,
  SitePublicFormIntent,
  SitePublicFormKind,
  SitePublicFormPresentationState,
  SitePublicFormSession,
  SitePublicFormSessionController,
  SitePublicFormStatus,
  SitePublicOperationInputFieldNode,
  SitePublicRendererProps,
} from "@dpeek/formless-site-app";
import { projectSitePublicFormSession } from "@dpeek/formless-site-app";

import {
  createSiteBlockFixture,
  createSiteFrameFixture,
  createSitePageTreeFixture,
  createSitePlacementFixture,
  createSitePublicOperationFixture,
  createSitePublicRendererPropsFixture,
  createSiteRouteFixture,
  requiredSiteBlockFixture,
} from "./public-site.ts";
import { publicSiteRendererPropsFixture } from "./public-site.ts";

export type AstryxPublicSiteFormFixtureLayoutId =
  | "fixed-missing-operation"
  | "fixed-missing-site-key"
  | "fixed-ready"
  | "fixed-invalid"
  | "fixed-submitting"
  | "fixed-success"
  | "fixed-failure"
  | "generic-ready"
  | "generic-invalid"
  | "generic-submitting"
  | "generic-success"
  | "generic-failure"
  | "multiple";

export type AstryxPublicSiteFormFixtureLayout = {
  id: AstryxPublicSiteFormFixtureLayoutId;
  label: string;
  rendererProps: SitePublicRendererProps;
  sessions: SitePublicFormSession[];
};

type FormFixtureCase = {
  block: SiteBlockNode;
  session: SitePublicFormSession;
};

const publicSiteKey = "1x00000000000000000000AA";
const generatedAt = "2026-07-17T00:00:00.000Z";

const genericFieldDefinitions = [
  { name: "name", label: "Name", required: true, control: "text" },
  { name: "details", label: "Details", required: false, control: "longText" },
  { name: "approved", label: "Approved", required: false, control: "boolean" },
  { name: "requestedOn", label: "Requested on", required: true, control: "date" },
  { name: "quantity", label: "Quantity", required: true, control: "number" },
  {
    name: "tier",
    label: "Tier",
    required: true,
    control: "enum",
    options: [
      { value: "standard", label: "Standard" },
      { value: "enterprise", label: "Enterprise" },
    ],
  },
  { name: "email", label: "Email", required: true, control: "text", format: "email" },
  { name: "phone", label: "Phone", required: false, control: "text", format: "phone" },
  {
    name: "topic",
    label: "Topic",
    required: true,
    control: "text",
    suggestions: ["Research", "Delivery"],
  },
] satisfies SitePublicOperationInputFieldNode[];

const genericValidValues: Record<string, SitePublicFormFieldValue> = {
  name: "Ada Lovelace",
  details: "Review the public launch flow.",
  approved: false,
  requestedOn: "2026-08-01",
  quantity: 12.5,
  tier: "enterprise",
  email: "ada@example.com",
  phone: "+61 400 000 000",
  topic: "Custom research",
};

const multipleGenericValues: Record<string, SitePublicFormFieldValue> = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  phone: "+61 400 000 000",
  summary: "Review the public launch flow.",
  hasExistingSite: false,
  preferredDate: "2026-08-01",
  budget: 12.5,
  timeline: "quarter",
  referral: "Community",
};

const fixedMissingOperation = formCase(
  formBlock("fixed-missing-operation", "subscribe", { label: "Unavailable newsletter" }),
  {
    status: "unavailable",
  },
);

const fixedMissingSiteKey = formCase(
  formBlock("fixed-missing-site-key", "contact", {
    includeOperation: true,
    includeSiteKey: false,
    label: "Unavailable contact",
  }),
  {
    status: "unavailable",
    values: contactValues(),
  },
);

const fixedReady = formCase(formBlock("fixed-ready", "subscribe", { includeOperation: true }), {
  challengeReady: false,
  status: "ready",
});

const fixedInvalid = formCase(formBlock("fixed-invalid", "contact", { includeOperation: true }), {
  challengeReady: true,
  fieldErrors: { email: "Enter a valid email address." },
  status: "ready",
  values: contactValues({ email: "not-an-email" }),
});

const fixedSubmitting = formCase(
  formBlock("fixed-submitting", "contact", { includeOperation: true }),
  {
    challengeReady: true,
    status: "submitting",
    values: contactValues({ email: "ada@example.com" }),
  },
);

const fixedSuccess = formCase(
  formBlock("fixed-success", "subscribe", {
    includeOperation: true,
    successLabel: "You're on the studio list.",
  }),
  {
    challengeReady: true,
    status: "success",
    values: { email: "reader@example.com" },
  },
);

const fixedFailure = formCase(formBlock("fixed-failure", "contact", { includeOperation: true }), {
  challengeReady: false,
  challengeResetSignal: 1,
  failureMessage: "Please try again later.",
  status: "failed",
  values: contactValues({ email: "ada@example.com" }),
});

const genericReady = genericCase("generic-ready", "ready", {
  challengeReady: true,
});
const genericInvalid = genericCase("generic-invalid", "ready", {
  challengeReady: true,
  fieldErrors: {
    email: "Enter an email address like name@example.com.",
    quantity: "Enter a finite number.",
  },
  values: { email: "not-an-email", quantity: "many" },
});
const genericSubmitting = genericCase("generic-submitting", "submitting", {
  challengeReady: true,
});
const genericSuccess = genericCase("generic-success", "success", {
  challengeReady: true,
  successMessage: "Review request received.",
});
const genericFailure = genericCase("generic-failure", "failed", {
  failureMessage: "Please try the request again.",
  resetSignal: 2,
});

const multipleCases = [
  formCase(requiredSiteBlockFixture(publicSiteRendererPropsFixture.tree, "block-form-subscribe"), {
    challengeReady: false,
    status: "ready",
  }),
  formCase(requiredSiteBlockFixture(publicSiteRendererPropsFixture.tree, "block-form-contact"), {
    challengeReady: true,
    fieldErrors: { email: "Enter a valid email address." },
    status: "ready",
    values: contactValues({ email: "not-an-email" }),
  }),
  formCase(requiredSiteBlockFixture(publicSiteRendererPropsFixture.tree, "block-form-review"), {
    challengeReady: true,
    status: "ready",
    values: multipleGenericValues,
  }),
  formCase(requiredSiteBlockFixture(publicSiteRendererPropsFixture.tree, "block-form-archive"), {
    status: "unavailable",
    values: contactValues(),
  }),
] satisfies FormFixtureCase[];

export const publicSiteFormFixtureLayouts = [
  layout("fixed-missing-operation", "Fixed form without operation", [fixedMissingOperation]),
  layout("fixed-missing-site-key", "Fixed form without public challenge key", [
    fixedMissingSiteKey,
  ]),
  layout("fixed-ready", "Fixed form ready", [fixedReady]),
  layout("fixed-invalid", "Fixed form validation", [fixedInvalid]),
  layout("fixed-submitting", "Fixed form submitting", [fixedSubmitting]),
  layout("fixed-success", "Fixed form success", [fixedSuccess]),
  layout("fixed-failure", "Fixed form failure and retry", [fixedFailure]),
  layout("generic-ready", "Generic form controls", [genericReady]),
  layout("generic-invalid", "Generic form validation", [genericInvalid]),
  layout("generic-submitting", "Generic form submitting", [genericSubmitting]),
  layout("generic-success", "Generic form success", [genericSuccess]),
  layout("generic-failure", "Generic form failure and retry", [genericFailure]),
  layout("multiple", "Multiple forms", multipleCases, publicSiteRendererPropsFixture),
] satisfies AstryxPublicSiteFormFixtureLayout[];

export const publicSiteMultipleFormFixtureLayout = requiredLayout("multiple");

export function createAstryxPublicFormFixtureControllers(
  fixture: AstryxPublicSiteFormFixtureLayout,
): ReadonlyMap<string, SitePublicFormSessionController> {
  return new Map(
    fixture.sessions.map((initialSession) => [
      initialSession.blockId,
      createAstryxPublicFormFixtureController(initialSession),
    ]),
  );
}

export function createAstryxPublicFormFixtureController(
  initialSession: SitePublicFormSession,
): SitePublicFormSessionController {
  const listeners = new Set<() => void>();
  let snapshot = structuredClone(initialSession);

  return {
    getSnapshot: () => snapshot,
    async dispatch(intent) {
      const nextSnapshot = applyAstryxPublicFormFixtureIntent(snapshot, intent);

      if (nextSnapshot === snapshot) {
        return;
      }

      snapshot = nextSnapshot;
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function applyAstryxPublicFormFixtureIntent(
  current: SitePublicFormSession,
  intent: SitePublicFormIntent,
): SitePublicFormSession {
  if (intent.formId !== current.formId) {
    return current;
  }

  if (intent.type === "retry") {
    if (current.status !== "failed") {
      return current;
    }

    return interactiveSession({
      ...current,
      challenge: current.challenge ? { ...current.challenge, ready: false } : undefined,
      feedback: undefined,
      retryIntent: undefined,
      status: "ready",
    });
  }

  if (current.disabled) {
    return current;
  }

  if (intent.type === "fieldChange") {
    let changed = false;
    const fields = current.fields.map((field) => {
      if (field.occurrenceId !== intent.occurrenceId) {
        return field;
      }

      changed = true;
      return { ...field, error: undefined, value: intent.value };
    });

    if (!changed) {
      return current;
    }

    return interactiveSession({
      ...current,
      feedback: undefined,
      fields,
      retryIntent: undefined,
      status: "ready",
    });
  }

  if (intent.type === "challengeTokenChange") {
    if (!current.challenge) {
      return current;
    }

    return interactiveSession({
      ...current,
      challenge: { ...current.challenge, ready: intent.token.trim() !== "" },
      feedback: undefined,
      retryIntent: undefined,
      status: "ready",
    });
  }

  if (current.status !== "ready" || !current.submit.ready) {
    return current;
  }

  return disabledSession({ ...current, status: "submitting" });
}

function layout(
  id: AstryxPublicSiteFormFixtureLayoutId,
  label: string,
  cases: FormFixtureCase[],
  rendererProps = formRendererProps(
    id,
    cases.map(({ block }) => block),
  ),
): AstryxPublicSiteFormFixtureLayout {
  return {
    id,
    label,
    rendererProps,
    sessions: cases.map(({ session: formSession }) => formSession),
  };
}

function formRendererProps(
  id: AstryxPublicSiteFormFixtureLayoutId,
  blocks: SiteBlockNode[],
): SitePublicRendererProps {
  const slug = `forms-${id}`;
  const page = createSiteBlockFixture(`page-${id}`, "page", "Public forms", {
    placements: blocks.map((block, index) =>
      createSitePlacementFixture(`placement-${id}-${index + 1}`, (index + 1) * 1000, block),
    ),
  });

  return createSitePublicRendererPropsFixture({
    tree: createSitePageTreeFixture({
      frame: createSiteFrameFixture(),
      page,
      meta: { slug, generatedAt, warnings: [] },
      route: createSiteRouteFixture({ kind: "page", slug }),
    }),
    linkMode: "preview",
  });
}

function formCase(block: SiteBlockNode, state: SitePublicFormPresentationState): FormFixtureCase {
  return { block, session: projectSitePublicFormSession(block, state) };
}

function formBlock(
  id: string,
  kind: SitePublicFormKind,
  options: {
    includeOperation?: boolean;
    includeSiteKey?: boolean;
    label?: string;
    successLabel?: string;
  } = {},
): SiteBlockNode {
  const blockId = `form-${id}`;
  const type =
    kind === "subscribe"
      ? "subscribeForm"
      : kind === "contact"
        ? "contactForm"
        : "publicOperationForm";
  const entityName =
    kind === "subscribe" ? "subscription" : kind === "contact" ? "contactMessage" : "review";
  const operationName =
    kind === "subscribe" ? "subscribe" : kind === "contact" ? "send" : "request";

  return createSiteBlockFixture(blockId, type, options.label ?? formHeading(kind), {
    ...(kind === "contact"
      ? {
          buttonLabel: "Send enquiry",
          emailLabel: "Reply email",
          messageLabel: "Enquiry",
          nameLabel: "Your name",
        }
      : kind === "publicOperation"
        ? { buttonLabel: "Request review" }
        : {}),
    ...(options.successLabel ? { successLabel: options.successLabel } : {}),
    ...(options.includeOperation
      ? {
          publicOperation: createSitePublicOperationFixture({
            entityName,
            operationName,
            canonicalKey: `${entityName}.${operationName}`,
            kind: kind === "subscribe" ? "command" : kind === "contact" ? "create" : "command",
            route: `/api/site/public/operations/${entityName}/${operationName}`,
            challenge: {
              kind: "turnstile",
              ...(options.includeSiteKey === false ? {} : { siteKey: publicSiteKey }),
            },
            ...(kind === "publicOperation" ? { fields: genericFieldDefinitions } : {}),
          }),
        }
      : {}),
  });
}

function genericCase(
  id: Extract<
    AstryxPublicSiteFormFixtureLayoutId,
    | "generic-ready"
    | "generic-invalid"
    | "generic-submitting"
    | "generic-success"
    | "generic-failure"
  >,
  status: SitePublicFormStatus,
  options: {
    challengeReady?: boolean;
    failureMessage?: string;
    fieldErrors?: Record<string, string>;
    resetSignal?: number;
    successMessage?: string;
    values?: Record<string, SitePublicFormFieldValue>;
  },
): FormFixtureCase {
  const block = formBlock(id, "publicOperation", {
    includeOperation: true,
    successLabel: options.successMessage,
  });

  return formCase(block, {
    challengeReady: options.challengeReady ?? false,
    challengeResetSignal: options.resetSignal,
    failureMessage: options.failureMessage,
    fieldErrors: options.fieldErrors,
    status,
    values: { ...genericValidValues, ...options.values },
  });
}
function contactValues(
  options: {
    email?: string;
  } = {},
): Record<string, SitePublicFormFieldValue> {
  return {
    name: "Ada Lovelace",
    email: options.email ?? "",
    message: "Please send the details.",
  };
}

function interactiveSession(current: SitePublicFormSession): SitePublicFormSession {
  const fields = current.fields.map((field) => ({ ...field, disabled: false }));
  const challenge = current.challenge ? { ...current.challenge, disabled: false } : undefined;
  const ready = fieldsAreReady(fields) && Boolean(challenge?.ready);

  return {
    ...current,
    disabled: false,
    fields,
    ...(challenge ? { challenge } : {}),
    submit: { ...current.submit, ready },
  };
}

function disabledSession(current: SitePublicFormSession): SitePublicFormSession {
  return {
    ...current,
    disabled: true,
    fields: current.fields.map((field) => ({ ...field, disabled: true })),
    ...(current.challenge ? { challenge: { ...current.challenge, disabled: true } } : {}),
    submit: { ...current.submit, ready: false },
  };
}

function fieldsAreReady(fields: SitePublicFormField[]): boolean {
  return fields.every(
    (field) =>
      !field.error &&
      (!field.required ||
        typeof field.value === "boolean" ||
        (typeof field.value === "number" && Number.isFinite(field.value)) ||
        (typeof field.value === "string" && field.value.trim() !== "")),
  );
}

function formHeading(kind: SitePublicFormKind): string {
  return kind === "subscribe"
    ? "Studio notes"
    : kind === "contact"
      ? "Start a conversation"
      : "Request a review";
}

function requiredLayout(
  id: AstryxPublicSiteFormFixtureLayoutId,
): AstryxPublicSiteFormFixtureLayout {
  const fixture = publicSiteFormFixtureLayouts.find((candidate) => candidate.id === id);

  if (!fixture) {
    throw new Error(`Missing public Site form fixture layout: ${id}`);
  }

  return fixture;
}
