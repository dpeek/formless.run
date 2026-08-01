import type { EmailDeliveryScheduleRequest } from "../shared/email-runtime.ts";
import { normalizeEmailDeliveryAddress } from "../shared/email-runtime.ts";
import {
  parseAccountCompletionGateTarget,
  type AccountCompletionGateTarget,
} from "../shared/instance-auth.ts";
import { nowIsoString } from "../shared/clock.ts";
import { runtimeAuthAccountGateRoutes } from "../shared/runtime-topology.ts";
import { validateCentralAuthSessionCookie } from "./central-auth-session.ts";
import { readControlPlaneRecords } from "./deployment-control-plane-client.ts";
import {
  resolveConfiguredDefaultCloudflareSender,
  resolveDefaultEmailSenderReference,
  scheduleEmailDelivery,
  type EmailDeliveryQueueBinding,
} from "./email-runtime.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import { commitIdentityEmailVerification } from "./identity-control-plane.ts";
import {
  buildEmailVerificationLink,
  consumeEmailVerificationChallenge,
  createEmailVerificationChallenge,
  generateEmailVerificationToken,
  hashEmailVerificationToken,
  readInstanceAuthConfig,
  validateEmailVerificationChallenge,
  type EmailVerificationChallengePurpose,
  type StoredEmailVerificationChallenge,
  type ValidateEmailVerificationChallengeResult,
} from "./instance-auth-state.ts";

export const INSTANCE_AUTH_EMAIL_VERIFICATION_REQUEST_PATH =
  `${runtimeAuthAccountGateRoutes.emailVerification}/request` as const;
export const INSTANCE_AUTH_EMAIL_VERIFICATION_VERIFY_PATH =
  `${runtimeAuthAccountGateRoutes.emailVerification}/verify` as const;

const emailVerificationChallengeTtlMs = 15 * 60 * 1000;
const emailVerificationMessageKind = "identity.emailVerification";
const emailVerificationDeliveryPurpose = "email-verification-delivery";
const instanceAuthStorageIdentity = "instance:auth";
const emailVerificationPurposes = [
  "account-completion",
  "invitation-acceptance",
  "owner-setup",
  "recovery",
] as const satisfies readonly EmailVerificationChallengePurpose[];

type InstanceAuthEmailVerificationEnv = {
  FORMLESS_AUTHORITY: DurableObjectNamespace;
  FORMLESS_EMAIL_DELIVERY_QUEUE?: EmailDeliveryQueueBinding;
  FORMLESS_OWNER_SESSION_SECRET?: string;
};

type EmailVerificationRequestChallengeRequest = {
  email: string;
  purpose: EmailVerificationChallengePurpose;
  target: AccountCompletionGateTarget;
};

type EmailVerificationVerifyRequest = EmailVerificationRequestChallengeRequest & {
  challengeId: string;
  token: string;
};

type EmailVerificationDeliveryConfiguration =
  | {
      authOrigin: string;
      controlPlaneRecords: Awaited<ReturnType<typeof readControlPlaneRecords>>;
      senderId: string;
    }
  | { response: Response };

export async function handleInstanceAuthEmailVerificationApiRequest(
  request: Request,
  env: InstanceAuthEmailVerificationEnv,
): Promise<Response | undefined> {
  if (!isInstanceAuthEmailVerificationApiPath(new URL(request.url).pathname)) {
    return undefined;
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);

  return env.FORMLESS_AUTHORITY.get(id).fetch(request);
}

export async function handleInstanceAuthEmailVerificationDurableObjectRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceAuthEmailVerificationEnv,
): Promise<Response | undefined> {
  const url = new URL(request.url);

  if (!isInstanceAuthEmailVerificationApiPath(url.pathname)) {
    return undefined;
  }

  if (request.method !== "POST") {
    return methodNotAllowedResponse("POST");
  }

  try {
    const config = await emailVerificationDeliveryConfiguration(request, storage, env);

    if ("response" in config) {
      return config.response;
    }

    const session = await validateCentralAuthSessionCookie(request, storage, env);

    if (!session.ok) {
      return jsonResponse({ error: "Authenticated account session is required." }, 401);
    }

    if (url.pathname === INSTANCE_AUTH_EMAIL_VERIFICATION_REQUEST_PATH) {
      return await handleEmailVerificationRequestChallenge(request, storage, env, config, {
        principalId: session.session.principalId,
      });
    }

    return await handleEmailVerificationVerify(request, storage, env, config, {
      principalId: session.session.principalId,
    });
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, 400);
  }
}

function isInstanceAuthEmailVerificationApiPath(pathname: string): boolean {
  return (
    pathname === INSTANCE_AUTH_EMAIL_VERIFICATION_REQUEST_PATH ||
    pathname === INSTANCE_AUTH_EMAIL_VERIFICATION_VERIFY_PATH
  );
}

async function handleEmailVerificationRequestChallenge(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceAuthEmailVerificationEnv,
  config: Extract<EmailVerificationDeliveryConfiguration, { authOrigin: string }>,
  session: { principalId: string },
): Promise<Response> {
  const input = parseEmailVerificationRequestChallengeRequest(await readJson(request));
  const displayEmail = normalizeEmailDeliveryAddress(
    "Email verification request email",
    input.email,
  );
  const normalizedEmail = displayEmail.toLowerCase();
  const now = nowIsoString();
  const expiresAt = new Date(Date.parse(now) + emailVerificationChallengeTtlMs).toISOString();
  const idempotencyKey = await emailVerificationChallengeIdempotencyKey({
    normalizedEmail,
    principalId: session.principalId,
    purpose: input.purpose,
    target: input.target,
  });
  let created: ReturnType<typeof createEmailVerificationChallenge> | undefined;
  let rawToken: string | undefined;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    rawToken = generateEmailVerificationToken();
    created = createEmailVerificationChallenge(storage, {
      authOrigin: config.authOrigin,
      createdAt: now,
      email: displayEmail,
      expiresAt,
      idempotencyKey,
      principalId: session.principalId,
      purpose: input.purpose,
      target: input.target,
      tokenHash: await hashEmailVerificationToken(rawToken),
    });

    if (created.ok) {
      if (created.replayed) {
        rawToken = undefined;
      }

      break;
    }

    if (created.reason !== "duplicate-token-hash") {
      return jsonResponse({ error: "Email verification challenge already exists." }, 409);
    }
  }

  if (!created?.ok) {
    return jsonResponse({ error: "Email verification challenge could not be created." }, 409);
  }

  let delivery: Awaited<ReturnType<typeof scheduleEmailDelivery>>;

  try {
    delivery = await scheduleEmailDelivery({
      controlPlaneRecords: config.controlPlaneRecords ?? [],
      emailDeliveryQueue: env.FORMLESS_EMAIL_DELIVERY_QUEUE,
      now,
      request: emailVerificationDeliveryScheduleRequest({
        authOrigin: config.authOrigin,
        challenge: created.challenge,
        senderId: config.senderId,
        verificationLink:
          rawToken === undefined
            ? undefined
            : buildEmailVerificationLink({
                authOrigin: config.authOrigin,
                challengeId: created.challenge.challengeId,
                token: rawToken,
              }),
      }),
      storage,
      targetAuthorityName: FORMLESS_INSTANCE_AUTHORITY_NAME,
    });
  } catch {
    return jsonResponse({ error: "Email verification delivery is not configured." }, 503);
  }

  return jsonResponse({
    challenge: emailVerificationChallengeSummary(created.challenge),
    delivery: {
      deliveryId: delivery.delivery.id,
      queued: delivery.queued,
      replayed: delivery.replayed,
      status: "scheduled",
    },
  });
}

async function handleEmailVerificationVerify(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceAuthEmailVerificationEnv,
  _config: Extract<EmailVerificationDeliveryConfiguration, { authOrigin: string }>,
  session: { principalId: string },
): Promise<Response> {
  const input = parseEmailVerificationVerifyRequest(await readJson(request));
  const tokenHash = await hashEmailVerificationToken(input.token);
  const now = nowIsoString();
  const challenge = validateEmailVerificationChallenge(storage, {
    challengeId: input.challengeId,
    email: input.email,
    now,
    principalId: session.principalId,
    purpose: input.purpose,
    target: input.target,
    tokenHash,
  });

  if (!challenge.ok) {
    return emailVerificationChallengeFailureResponse(challenge);
  }

  const identityCommit = await commitIdentityEmailVerification(env, {
    challengeId: challenge.challenge.challengeId,
    displayEmail: challenge.challenge.displayEmail,
    normalizedEmail: challenge.challenge.normalizedEmail,
    principalId: session.principalId,
    primary: true,
    recovery: false,
    verifiedAt: now,
  });

  if (!identityCommit.ok) {
    return jsonResponse({ error: "Email verification could not be committed." }, 409);
  }

  const consumed = consumeEmailVerificationChallenge(storage, {
    challengeId: challenge.challenge.challengeId,
    email: input.email,
    now,
    principalId: session.principalId,
    purpose: input.purpose,
    target: input.target,
    tokenHash,
  });

  if (!consumed.ok) {
    return emailVerificationChallengeFailureResponse(consumed);
  }

  return jsonResponse({
    principalEmail: identityCommit.principalEmail,
    verified: true,
  });
}

async function emailVerificationDeliveryConfiguration(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceAuthEmailVerificationEnv,
): Promise<EmailVerificationDeliveryConfiguration> {
  const config = readInstanceAuthConfig(storage);
  const requestOrigin = new URL(request.url).origin;

  if (!config) {
    return { response: jsonResponse({ error: "Email verification is unavailable." }, 503) };
  }

  if (requestOrigin !== config.canonicalOrigin) {
    return {
      response: jsonResponse(
        { error: "Email verification must use the configured auth origin." },
        404,
      ),
    };
  }

  if (!env.FORMLESS_EMAIL_DELIVERY_QUEUE) {
    return {
      response: jsonResponse({ error: "Email verification delivery is not configured." }, 503),
    };
  }

  let controlPlaneRecords: Awaited<ReturnType<typeof readControlPlaneRecords>>;

  try {
    controlPlaneRecords = await readControlPlaneRecords({ env, requestUrl: request.url });
  } catch {
    return {
      response: jsonResponse({ error: "Email verification delivery is not configured." }, 503),
    };
  }

  const sender = resolveDefaultEmailSenderReference(controlPlaneRecords ?? [], "auth");

  if (!sender) {
    return {
      response: jsonResponse({ error: "Email verification delivery is not configured." }, 503),
    };
  }

  try {
    resolveConfiguredDefaultCloudflareSender(controlPlaneRecords ?? [], "auth");
  } catch {
    return {
      response: jsonResponse({ error: "Email verification delivery is not configured." }, 503),
    };
  }

  return {
    authOrigin: config.canonicalOrigin,
    controlPlaneRecords,
    senderId: sender.id,
  };
}

function emailVerificationDeliveryScheduleRequest(input: {
  authOrigin: string;
  challenge: StoredEmailVerificationChallenge;
  senderId: string;
  verificationLink: string | undefined;
}): EmailDeliveryScheduleRequest {
  return {
    canonicalOrigin: input.authOrigin,
    idempotencyKey: emailVerificationDeliveryIdempotencyKey(input.challenge.challengeId),
    message: renderEmailVerificationDeliveryMessage({
      expiresAt: input.challenge.expiresAt,
      verificationLink: input.verificationLink,
    }),
    messageKind: emailVerificationMessageKind,
    recipients: [{ address: input.challenge.displayEmail }],
    sender: { id: input.senderId },
    source: {
      recordId: input.challenge.challengeId,
      storageIdentity: instanceAuthStorageIdentity,
    },
  };
}

function renderEmailVerificationDeliveryMessage(input: {
  expiresAt: string;
  verificationLink: string | undefined;
}) {
  if (input.verificationLink === undefined) {
    return {
      subject: "Verify your Formless email",
      text: "This email verification request has already been rendered.",
    };
  }

  const escapedLink = htmlAttributeEscape(input.verificationLink);

  return {
    subject: "Verify your Formless email",
    text: [
      "Verify your email address for Formless.",
      "",
      `Verify email: ${input.verificationLink}`,
      "",
      `This verification link expires at ${input.expiresAt}.`,
    ].join("\n"),
    html: [
      "<p>Verify your email address for Formless.</p>",
      `<p><a href="${escapedLink}">Verify email</a></p>`,
      `<p>This verification link expires at ${htmlTextEscape(input.expiresAt)}.</p>`,
    ].join(""),
  };
}

function parseEmailVerificationRequestChallengeRequest(
  value: unknown,
): EmailVerificationRequestChallengeRequest {
  const object = parseRecord("Email verification request", value);

  assertAllowedKeys("Email verification request", object, ["email", "purpose", "target"]);

  return {
    email: normalizeEmailDeliveryAddress("Email verification request email", object.email),
    purpose: parseEmailVerificationPurpose(object.purpose),
    target: parseAccountCompletionGateTarget(object.target),
  };
}

function parseEmailVerificationVerifyRequest(value: unknown): EmailVerificationVerifyRequest {
  const object = parseRecord("Email verification verify request", value);

  assertAllowedKeys("Email verification verify request", object, [
    "challengeId",
    "email",
    "purpose",
    "target",
    "token",
  ]);

  return {
    challengeId: parseNonEmptyString(
      "Email verification verify request challengeId",
      object.challengeId,
    ),
    email: normalizeEmailDeliveryAddress("Email verification verify request email", object.email),
    purpose: parseEmailVerificationPurpose(object.purpose),
    target: parseAccountCompletionGateTarget(object.target),
    token: parseBase64UrlString("Email verification verify request token", object.token),
  };
}

function emailVerificationChallengeSummary(challenge: StoredEmailVerificationChallenge) {
  return {
    challengeId: challenge.challengeId,
    displayEmail: challenge.displayEmail,
    expiresAt: challenge.expiresAt,
    purpose: challenge.purpose,
  };
}

function emailVerificationChallengeFailureResponse(
  result: Extract<ValidateEmailVerificationChallengeResult, { ok: false }>,
): Response {
  switch (result.reason) {
    case "already-consumed":
    case "revoked-challenge":
      return jsonResponse({ error: "Email verification link is no longer available." }, 409);
    case "expired-challenge":
      return jsonResponse({ error: "Email verification link has expired." }, 410);
    case "missing-challenge":
      return jsonResponse({ error: "Email verification link is invalid." }, 404);
    case "wrong-email":
    case "wrong-purpose":
    case "wrong-target":
    case "wrong-token":
      return jsonResponse({ error: "Email verification link is invalid." }, 401);
  }
}

async function emailVerificationChallengeIdempotencyKey(input: {
  normalizedEmail: string;
  principalId: string;
  purpose: EmailVerificationChallengePurpose;
  target: AccountCompletionGateTarget;
}): Promise<string> {
  return `email-verification:${await sha256Base64Url(
    [
      input.principalId,
      input.normalizedEmail,
      input.purpose,
      input.target.targetOrigin,
      input.target.routeId,
      input.target.targetProfile,
      input.target.storageIdentity ?? "",
      input.target.selectedOrganization ?? "",
      input.target.returnTo,
    ].join("\n"),
  )}`;
}

function emailVerificationDeliveryIdempotencyKey(challengeId: string): string {
  return `${challengeId}:${emailVerificationDeliveryPurpose}`;
}

function parseEmailVerificationPurpose(value: unknown): EmailVerificationChallengePurpose {
  return parseStringLiteral("Email verification purpose", value, emailVerificationPurposes);
}

async function readJson(request: Request): Promise<unknown> {
  return request.json();
}

function methodNotAllowedResponse(allow: string): Response {
  return jsonResponse({ error: "Method not allowed." }, 405, { Allow: allow });
}

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}) {
  const responseHeaders = new Headers(headers);

  responseHeaders.set("Cache-Control", "no-store");

  return Response.json(body, {
    headers: responseHeaders,
    status,
  });
}

function parseRecord(context: string, value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function assertAllowedKeys(context: string, value: Record<string, unknown>, allowedKeys: string[]) {
  const allowed = new Set(allowedKeys);

  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`${context} field "${key}" is not supported.`);
    }
  }
}

function parseStringLiteral<T extends string>(
  context: string,
  value: unknown,
  allowed: readonly T[],
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`${context} must be one of: ${allowed.join(", ")}.`);
  }

  return value as T;
}

function parseNonEmptyString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value.trim();
}

function parseBase64UrlString(context: string, value: unknown): string {
  const normalized = parseNonEmptyString(context, value);

  if (!/^[A-Za-z0-9_-]+$/.test(normalized)) {
    throw new Error(`${context} must be base64url.`);
  }

  return normalized;
}

function htmlAttributeEscape(value: string): string {
  return htmlTextEscape(value).replaceAll('"', "&quot;");
}

function htmlTextEscape(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  let binary = "";

  for (const byte of new Uint8Array(digest)) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
