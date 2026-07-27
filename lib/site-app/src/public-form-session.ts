import {
  buildPublicOperationRequestBody,
  createPublicOperationIdempotencyKey,
  isPublicOperationCommandResponse,
  isPublicOperationCreateResponse,
  isPublicOperationListResponse,
  isPublicOperationResponse,
  publicOperationErrorMessage,
  type PublicOperationInputValues,
  type PublicOperationResultRow,
} from "@dpeek/formless-public-operations";

import {
  initialPublicOperationFormDraftSessionState,
  nextPublicOperationFormDraftSessionState,
  publicOperationFormDraftInput,
  selectPublicOperationFormDraftSession,
  type PublicOperationFormDraftSessionState,
} from "./public-operation-form-draft.ts";
import type {
  SiteBlockNode,
  SitePublicOperationNode,
  SitePublicOperationInputFieldNode,
  SitePublicOperationInputFieldOptionNode,
  SitePublicOperationTextFormatNode,
} from "./types.ts";

export type SitePublicFormKind = "subscribe" | "contact" | "publicOperation";

export type SitePublicFormStatus = "unavailable" | "ready" | "submitting" | "success" | "failed";

export type SitePublicFormFieldValue = string | boolean | number;

export type SitePublicFormFieldChangeIntent = {
  type: "fieldChange";
  formId: string;
  occurrenceId: string;
  value: SitePublicFormFieldValue;
};

export type SitePublicFormChallengeTokenChangeIntent = {
  type: "challengeTokenChange";
  formId: string;
  token: string;
};

export type SitePublicFormSubmitIntent = {
  type: "submit";
  formId: string;
};

export type SitePublicFormRetryIntent = {
  type: "retry";
  formId: string;
};

export type SitePublicFormIntent =
  | SitePublicFormFieldChangeIntent
  | SitePublicFormChallengeTokenChangeIntent
  | SitePublicFormSubmitIntent
  | SitePublicFormRetryIntent;

export type SitePublicFormField = {
  occurrenceId: string;
  name: string;
  label: string;
  required: boolean;
  mustBeTrue?: true;
  control: SitePublicOperationInputFieldNode["control"];
  format?: SitePublicOperationTextFormatNode;
  suggestions?: string[];
  options?: SitePublicOperationInputFieldOptionNode[];
  value: SitePublicFormFieldValue;
  error?: string;
  disabled: boolean;
  changeIntent: Omit<SitePublicFormFieldChangeIntent, "value">;
};

export type SitePublicFormChallenge = {
  kind: "turnstile";
  siteKey: string;
  ready: boolean;
  disabled: boolean;
  resetSignal: number;
  tokenChangeIntent: Omit<SitePublicFormChallengeTokenChangeIntent, "token">;
};

export type SitePublicFormSubmit = {
  label: string;
  pendingLabel: string;
  ready: boolean;
  intent: SitePublicFormSubmitIntent;
};

export type SitePublicFormFeedback = {
  kind: "unavailable" | "success" | "failure";
  message: string;
};

export type SitePublicFormResult = {
  kind: "list";
  records: PublicOperationResultRow[];
};

export type SitePublicFormSession = {
  blockId: string;
  formId: string;
  kind: SitePublicFormKind;
  heading: string;
  body?: string;
  status: SitePublicFormStatus;
  disabled: boolean;
  fields: SitePublicFormField[];
  challenge?: SitePublicFormChallenge;
  submit: SitePublicFormSubmit;
  feedback?: SitePublicFormFeedback;
  result?: SitePublicFormResult;
  retryIntent?: SitePublicFormRetryIntent;
};

export type SitePublicFormSessionController = {
  getSnapshot: () => SitePublicFormSession;
  dispatch: (intent: SitePublicFormIntent) => Promise<void>;
  subscribe: (listener: () => void) => () => void;
};

export type CreateSitePublicFormSessionControllerInput = {
  block: SiteBlockNode;
  fetcher?: typeof fetch;
  idempotencyKeyFactory?: (input: {
    blockId: string;
    formId: string;
    kind: SitePublicFormKind;
  }) => string;
};

export type SitePublicFormPresentationState = {
  challengeReady?: boolean;
  challengeResetSignal?: number;
  failureMessage?: string;
  fieldErrors?: Readonly<Record<string, string>>;
  result?: SitePublicFormResult;
  status: SitePublicFormStatus;
  values?: Readonly<Record<string, SitePublicFormFieldValue>>;
};

type SitePublicFormConfig = {
  available: boolean;
  blockId: string;
  body?: string;
  fields: SitePublicOperationInputFieldNode[];
  formId: string;
  heading: string;
  kind: SitePublicFormKind;
  operationKind?: SitePublicOperationNode["kind"];
  operationRoute?: string;
  siteKey?: string;
  submitLabel: string;
  pendingLabel: string;
  successMessage: string;
  unavailableMessage: string;
};

type SitePublicFormState = {
  challengeResetSignal: number;
  draft: PublicOperationFormDraftSessionState;
  failureMessage?: string;
  idempotencyKey?: string;
  result?: SitePublicFormResult;
  status: SitePublicFormStatus;
  touchedOccurrences: Set<string>;
  turnstileToken: string;
};

type SitePublicFormSubmissionInput = {
  config: SitePublicFormConfig;
  fetcher?: typeof fetch;
  idempotencyKey?: string;
  input: PublicOperationInputValues;
  turnstileToken?: string;
};

class SitePublicFormSubmissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SitePublicFormSubmissionError";
  }
}

export function projectSitePublicFormSession(
  block: SiteBlockNode,
  state: SitePublicFormPresentationState,
): SitePublicFormSession {
  const config = sitePublicFormConfig(block);
  let draft = initialPublicOperationFormDraftSessionState({ fields: config.fields });

  for (const [name, value] of Object.entries(state.values ?? {})) {
    draft = nextPublicOperationFormDraftSessionState({
      inputName: name,
      inputValue: publicOperationFormDraftInput(value),
      state: draft,
    });
  }

  const draftSession = selectPublicOperationFormDraftSession({
    enabled: state.status === "ready",
    fields: config.fields,
    state: draft,
  });

  return projectSitePublicFormSessionFacts(config, {
    canSubmit: draftSession.canSubmit && Object.keys(state.fieldErrors ?? {}).length === 0,
    challengeReady: state.challengeReady ?? false,
    challengeResetSignal: state.challengeResetSignal ?? 0,
    draft,
    failureMessage: state.failureMessage,
    fieldErrors: state.fieldErrors ?? {},
    result: state.result,
    status: state.status,
  });
}

export function createSitePublicFormSessionController({
  block,
  fetcher,
  idempotencyKeyFactory = defaultSitePublicFormIdempotencyKey,
}: CreateSitePublicFormSessionControllerInput): SitePublicFormSessionController {
  const config = sitePublicFormConfig(block);
  const listeners = new Set<() => void>();
  let state: SitePublicFormState = {
    challengeResetSignal: 0,
    draft: initialPublicOperationFormDraftSessionState({ fields: config.fields }),
    ...(config.available && config.operationKind !== "list"
      ? {
          idempotencyKey: idempotencyKeyFactory({
            blockId: config.blockId,
            formId: config.formId,
            kind: config.kind,
          }),
        }
      : {}),
    status: config.available ? "ready" : "unavailable",
    touchedOccurrences: new Set(),
    turnstileToken: "",
  };
  let snapshot = selectSitePublicFormSession(config, state);

  function commit(nextState: SitePublicFormState): void {
    state = nextState;
    snapshot = selectSitePublicFormSession(config, state);

    for (const listener of listeners) {
      listener();
    }
  }

  async function dispatch(intent: SitePublicFormIntent): Promise<void> {
    if (intent.formId !== config.formId) {
      return;
    }

    if (intent.type === "fieldChange") {
      if (sitePublicFormStateIsDisabled(state.status)) {
        return;
      }

      const field = config.fields.find(
        (candidate) =>
          sitePublicFormFieldOccurrenceId(config.formId, candidate.name) === intent.occurrenceId,
      );

      if (!field) {
        return;
      }

      commit({
        ...state,
        draft: nextPublicOperationFormDraftSessionState({
          inputName: field.name,
          inputValue: publicOperationFormDraftInput(intent.value),
          state: state.draft,
        }),
        ...(state.status === "failed"
          ? {
              failureMessage: undefined,
              status: "ready" as const,
            }
          : {}),
        touchedOccurrences: new Set(state.touchedOccurrences).add(intent.occurrenceId),
      });
      return;
    }

    if (intent.type === "challengeTokenChange") {
      if (sitePublicFormStateIsDisabled(state.status)) {
        return;
      }

      commit({
        ...state,
        ...(state.status === "failed"
          ? {
              failureMessage: undefined,
              status: "ready" as const,
            }
          : {}),
        turnstileToken: intent.token,
      });
      return;
    }

    if (intent.type === "retry") {
      if (state.status !== "failed") {
        return;
      }

      commit({
        ...state,
        failureMessage: undefined,
        status: "ready",
      });
      return;
    }

    if (state.status !== "ready") {
      return;
    }

    const draftSession = selectPublicOperationFormDraftSession({
      fields: config.fields,
      state: state.draft,
    });

    if (!draftSession.canSubmit) {
      commit({
        ...state,
        touchedOccurrences: new Set(
          config.fields.map((field) => sitePublicFormFieldOccurrenceId(config.formId, field.name)),
        ),
      });
      return;
    }

    if (config.siteKey !== undefined && state.turnstileToken.trim() === "") {
      commit({
        ...state,
        failureMessage: "Complete the challenge.",
        status: "failed",
      });
      return;
    }

    const idempotencyKey = state.idempotencyKey;

    if (config.operationKind !== "list" && !idempotencyKey) {
      return;
    }

    commit({
      ...state,
      failureMessage: undefined,
      status: "submitting",
    });

    try {
      const result = await submitSitePublicFormSession({
        config,
        fetcher,
        ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
        input: draftSession.input,
        ...(config.siteKey === undefined ? {} : { turnstileToken: state.turnstileToken }),
      });
      commit({
        ...state,
        failureMessage: undefined,
        ...(result === undefined ? {} : { result }),
        status: "success",
      });
    } catch (error) {
      commit({
        ...state,
        challengeResetSignal: state.challengeResetSignal + 1,
        failureMessage:
          error instanceof SitePublicFormSubmissionError
            ? error.message
            : sitePublicFormSubmitErrorMessage(config.kind),
        status: "failed",
        turnstileToken: "",
      });
    }
  }

  return {
    getSnapshot: () => snapshot,
    dispatch,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function selectSitePublicFormSession(
  config: SitePublicFormConfig,
  state: SitePublicFormState,
): SitePublicFormSession {
  const disabled = sitePublicFormStateIsDisabled(state.status);
  const draftSession = selectPublicOperationFormDraftSession({
    enabled: !disabled,
    fields: config.fields,
    state: state.draft,
  });
  const fieldErrors: Record<string, string> = {};

  for (const field of config.fields) {
    const occurrenceId = sitePublicFormFieldOccurrenceId(config.formId, field.name);
    const error = draftSession.fieldErrors[field.name];

    if (error !== undefined && state.touchedOccurrences.has(occurrenceId)) {
      fieldErrors[field.name] = error.message;
    }
  }

  return projectSitePublicFormSessionFacts(config, {
    canSubmit: draftSession.canSubmit,
    challengeReady: state.turnstileToken.trim() !== "",
    challengeResetSignal: state.challengeResetSignal,
    draft: state.draft,
    failureMessage: state.failureMessage,
    fieldErrors,
    result: state.result,
    status: state.status,
  });
}

function projectSitePublicFormSessionFacts(
  config: SitePublicFormConfig,
  state: {
    canSubmit: boolean;
    challengeReady: boolean;
    challengeResetSignal: number;
    draft: PublicOperationFormDraftSessionState;
    failureMessage?: string;
    fieldErrors: Readonly<Record<string, string>>;
    result?: SitePublicFormResult;
    status: SitePublicFormStatus;
  },
): SitePublicFormSession {
  const disabled = sitePublicFormStateIsDisabled(state.status);
  const fields = config.fields.map((field) => {
    const occurrenceId = sitePublicFormFieldOccurrenceId(config.formId, field.name);
    const inputValue = state.draft.draft.values[field.name]?.value ?? "";
    const error = state.fieldErrors[field.name];

    return {
      occurrenceId,
      name: field.name,
      label: field.label,
      required: field.required,
      ...(field.mustBeTrue ? { mustBeTrue: field.mustBeTrue } : {}),
      control: field.control,
      ...(field.format === undefined ? {} : { format: field.format }),
      ...(field.suggestions === undefined ? {} : { suggestions: [...field.suggestions] }),
      ...(field.options === undefined
        ? {}
        : { options: field.options.map((option) => ({ ...option })) }),
      value: inputValue,
      ...(error === undefined ? {} : { error }),
      disabled,
      changeIntent: {
        type: "fieldChange" as const,
        formId: config.formId,
        occurrenceId,
      },
    } satisfies SitePublicFormField;
  });

  return {
    blockId: config.blockId,
    formId: config.formId,
    kind: config.kind,
    heading: config.heading,
    ...(config.body === undefined ? {} : { body: config.body }),
    status: state.status,
    disabled,
    fields,
    ...(config.siteKey === undefined
      ? {}
      : {
          challenge: {
            kind: "turnstile" as const,
            siteKey: config.siteKey,
            ready: state.challengeReady,
            disabled,
            resetSignal: state.challengeResetSignal,
            tokenChangeIntent: {
              type: "challengeTokenChange" as const,
              formId: config.formId,
            },
          },
        }),
    submit: {
      label: config.submitLabel,
      pendingLabel: config.pendingLabel,
      ready:
        state.status === "ready" &&
        config.available &&
        state.canSubmit &&
        (config.siteKey === undefined || state.challengeReady),
      intent: {
        type: "submit",
        formId: config.formId,
      },
    },
    ...(sitePublicFormFeedback(config, state) === undefined
      ? {}
      : { feedback: sitePublicFormFeedback(config, state) }),
    ...(state.result === undefined
      ? {}
      : {
          result: {
            kind: "list" as const,
            records: state.result.records.map((record) => ({ ...record })),
          },
        }),
    ...(state.status === "failed"
      ? {
          retryIntent: {
            type: "retry" as const,
            formId: config.formId,
          },
        }
      : {}),
  };
}

function sitePublicFormConfig(block: SiteBlockNode): SitePublicFormConfig {
  const kind = sitePublicFormKind(block);
  const formId = `site-public-form:${block.id}`;
  const operation = block.publicOperation;
  const siteKey =
    operation?.challenge?.kind === "turnstile" && operation.challenge.siteKey?.trim()
      ? operation.challenge.siteKey
      : undefined;
  const fields = sitePublicFormFields(block, kind);
  const available =
    operation !== undefined &&
    operation.route.trim() !== "" &&
    (operation.kind === "list"
      ? operation.challenge === undefined || siteKey !== undefined
      : siteKey !== undefined) &&
    (kind !== "publicOperation" || operation.fields !== undefined);

  return {
    available,
    blockId: block.id,
    ...(block.body === undefined ? {} : { body: block.body }),
    fields,
    formId,
    heading: block.label,
    kind,
    ...(operation?.kind === undefined ? {} : { operationKind: operation.kind }),
    ...(operation?.route === undefined ? {} : { operationRoute: operation.route }),
    ...(siteKey === undefined ? {} : { siteKey }),
    submitLabel: block.buttonLabel || sitePublicFormDefaultSubmitLabel(kind),
    pendingLabel: sitePublicFormPendingLabel(kind),
    successMessage: block.successLabel || sitePublicFormDefaultSuccessMessage(kind),
    unavailableMessage: sitePublicFormUnavailableMessage(kind),
  };
}

function sitePublicFormKind(block: SiteBlockNode): SitePublicFormKind {
  switch (block.type) {
    case "subscribeForm":
      return "subscribe";
    case "contactForm":
      return "contact";
    case "publicOperationForm":
      return "publicOperation";
    default:
      throw new Error(`Site block "${block.id}" is not a public form block.`);
  }
}

function sitePublicFormFields(
  block: SiteBlockNode,
  kind: SitePublicFormKind,
): SitePublicOperationInputFieldNode[] {
  if (kind === "subscribe") {
    return [
      {
        name: "email",
        label: "Email",
        required: true,
        control: "text",
        format: "email",
      },
    ];
  }

  if (kind === "contact") {
    return [
      {
        name: "name",
        label: block.nameLabel || "Name",
        required: true,
        control: "text",
      },
      {
        name: "email",
        label: block.emailLabel || "Email",
        required: true,
        control: "text",
        format: "email",
      },
      {
        name: "message",
        label: block.messageLabel || "Message",
        required: true,
        control: "longText",
      },
    ];
  }

  return (block.publicOperation?.fields ?? []).map((field) => ({
    ...field,
    ...(field.suggestions === undefined ? {} : { suggestions: [...field.suggestions] }),
    ...(field.options === undefined
      ? {}
      : { options: field.options.map((option) => ({ ...option })) }),
  }));
}

function sitePublicFormFieldOccurrenceId(formId: string, fieldName: string): string {
  return `${formId}:field:${fieldName}`;
}

function sitePublicFormStateIsDisabled(status: SitePublicFormStatus): boolean {
  return status === "unavailable" || status === "submitting" || status === "success";
}

function sitePublicFormFeedback(
  config: SitePublicFormConfig,
  state: Pick<SitePublicFormState, "failureMessage" | "status">,
): SitePublicFormFeedback | undefined {
  if (state.status === "unavailable") {
    return { kind: "unavailable", message: config.unavailableMessage };
  }

  if (state.status === "success") {
    return { kind: "success", message: config.successMessage };
  }

  if (state.status === "failed") {
    return {
      kind: "failure",
      message: state.failureMessage ?? sitePublicFormSubmitErrorMessage(config.kind),
    };
  }

  return undefined;
}

async function submitSitePublicFormSession({
  config,
  fetcher = fetch,
  idempotencyKey,
  input,
  turnstileToken,
}: SitePublicFormSubmissionInput): Promise<SitePublicFormResult | undefined> {
  const route = config.operationRoute;

  if (!route) {
    throw new SitePublicFormSubmissionError(config.unavailableMessage);
  }

  let response: Response;

  try {
    response = await fetcher(route, {
      body: JSON.stringify(
        buildPublicOperationRequestBody({
          ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
          input,
          siteBlockId: config.blockId,
          ...(turnstileToken === undefined ? {} : { turnstileToken }),
        }),
      ),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      method: "POST",
    });
  } catch {
    throw new SitePublicFormSubmissionError(sitePublicFormSubmitErrorMessage(config.kind));
  }

  let body: unknown;

  try {
    body = await response.json();
  } catch {
    throw new SitePublicFormSubmissionError(sitePublicFormInvalidResponseMessage(config.kind));
  }

  if (!response.ok) {
    throw new SitePublicFormSubmissionError(
      publicOperationErrorMessage(body) ?? sitePublicFormSubmitErrorMessage(config.kind),
    );
  }

  const valid =
    config.kind === "subscribe"
      ? isPublicOperationCommandResponse(body)
      : config.kind === "contact"
        ? isPublicOperationCreateResponse(body)
        : config.operationKind === "list"
          ? isPublicOperationListResponse(body)
          : isPublicOperationResponse(body);

  if (!valid) {
    throw new SitePublicFormSubmissionError(sitePublicFormInvalidResponseMessage(config.kind));
  }

  return isPublicOperationListResponse(body)
    ? {
        kind: "list",
        records: body.output.records.map((record) => ({ ...record })),
      }
    : undefined;
}

function defaultSitePublicFormIdempotencyKey({
  blockId,
  kind,
}: {
  blockId: string;
  formId: string;
  kind: SitePublicFormKind;
}): string {
  return createPublicOperationIdempotencyKey({
    purpose:
      kind === "subscribe"
        ? "site-subscribe"
        : kind === "contact"
          ? "site-contact"
          : "site-public-operation",
    siteBlockId: blockId,
  });
}

function sitePublicFormDefaultSubmitLabel(kind: SitePublicFormKind): string {
  return kind === "subscribe" ? "Subscribe" : kind === "contact" ? "Send" : "Submit";
}

function sitePublicFormPendingLabel(kind: SitePublicFormKind): string {
  return kind === "subscribe" ? "Subscribing..." : "Sending...";
}

function sitePublicFormDefaultSuccessMessage(kind: SitePublicFormKind): string {
  return kind === "subscribe"
    ? "You're subscribed."
    : kind === "contact"
      ? "Thanks. Your message was sent."
      : "Thanks. Your request was received.";
}

function sitePublicFormUnavailableMessage(kind: SitePublicFormKind): string {
  return kind === "subscribe"
    ? "Subscribe form unavailable."
    : kind === "contact"
      ? "Contact form unavailable."
      : "Public operation form unavailable.";
}

function sitePublicFormSubmitErrorMessage(kind: SitePublicFormKind): string {
  return kind === "subscribe"
    ? "Subscribe request failed."
    : kind === "contact"
      ? "Contact request failed."
      : "Public operation request failed.";
}

function sitePublicFormInvalidResponseMessage(kind: SitePublicFormKind): string {
  return kind === "subscribe"
    ? "Subscribe request returned an invalid response."
    : kind === "contact"
      ? "Contact request returned an invalid response."
      : "Public operation request returned an invalid response.";
}
