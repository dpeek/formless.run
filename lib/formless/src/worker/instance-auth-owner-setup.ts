import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  type PublicKeyCredentialCreationOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { StoredRecord } from "@dpeek/formless-storage";

import type { EmailDeliveryScheduleRequest } from "../shared/email-runtime.ts";
import { normalizeEmailDeliveryAddress } from "../shared/email-runtime.ts";
import { instanceAuthError, type AuthSuccessContinuationTarget } from "../shared/instance-auth.ts";
import { parseOwnerSetupToken } from "../shared/protocol.ts";
import { nowIsoString } from "../shared/clock.ts";
import { runtimeTopologyRoutes } from "../shared/runtime-topology.ts";
import { createCentralAuthSessionCookie } from "./central-auth-session.ts";
import { readControlPlaneRecords } from "./deployment-control-plane-client.ts";
import {
  resolveConfiguredDefaultCloudflareSender,
  resolveDefaultEmailSenderReference,
  scheduleEmailDelivery,
  type EmailDeliveryQueueBinding,
} from "./email-runtime.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import {
  consumeOwnerSetupPasskeyChallenge,
  completeOwnerSetupCompletionInCurrentTransaction,
  createOwnerSetupCompletionInCurrentTransaction,
  createOwnerSetupEmailChallenge,
  createOwnerSetupPasskeyChallenge,
  createOwnerSetupPasskeyPreparation,
  deleteOwnerSetupCompletionInCurrentTransaction,
  ownerSetupPreparedPasskeyPublicKey,
  readOwnerSetupCompletion,
  readOwnerSetupEmailProof,
  readOwnerSetupPasskeyPreparation,
  recordOwnerSetupCompletionSessionInCurrentTransaction,
  type StoredOwnerSetupCompletion,
  verifyOwnerSetupEmailChallenge,
  type StoredOwnerSetupEmailProof,
  type StoredOwnerSetupPasskeyChallenge,
  type VerifyOwnerSetupEmailChallengeResult,
} from "./instance-auth-owner-setup-state.ts";
import {
  createPasskeyCredentialInCurrentTransaction,
  deleteCentralAuthSessionInCurrentTransaction,
  deletePasskeyCredentialInCurrentTransaction,
  readInstanceAuthConfig,
  readPasskeyCredential,
} from "./instance-auth-state.ts";
import {
  completeFirstOwnerSetupInCurrentTransaction,
  hashOwnerSetupToken,
  validateFirstOwnerSetupCapability,
  type ValidateFirstOwnerSetupCapabilityResult,
} from "./instance-setup-state.ts";
import { commitIdentityOwnerSetupActivation, readIdentityOwner } from "./identity-control-plane.ts";
import { ownerSetupSuccessContinueTo } from "./owner-setup-continuation.ts";

export const INSTANCE_AUTH_OWNER_SETUP_START_PATH =
  `${runtimeTopologyRoutes.authAccountSetupRoute}/start` as const;
export const INSTANCE_AUTH_OWNER_SETUP_EMAIL_VERIFY_PATH =
  `${runtimeTopologyRoutes.authAccountSetupRoute}/email/verify` as const;
export const INSTANCE_AUTH_OWNER_SETUP_PASSKEY_REGISTER_OPTIONS_PATH =
  `${runtimeTopologyRoutes.authAccountSetupRoute}/passkeys/register/options` as const;
export const INSTANCE_AUTH_OWNER_SETUP_PASSKEY_REGISTER_VERIFY_PATH =
  `${runtimeTopologyRoutes.authAccountSetupRoute}/passkeys/register/verify` as const;
export const INSTANCE_AUTH_OWNER_SETUP_COMPLETE_PATH =
  `${runtimeTopologyRoutes.authAccountSetupRoute}/complete` as const;

const emailVerificationChallengeTtlMs = 15 * 60 * 1000;
const passkeyChallengeTtlMs = 5 * 60 * 1000;
const emailVerificationMessageKind = "identity.ownerSetupEmailVerification";
const emailVerificationDeliveryPurpose = "owner-setup-email-verification-delivery";
const instanceAuthStorageIdentity = "instance:auth";

type InstanceAuthOwnerSetupEnv = {
  FORMLESS_AUTHORITY: DurableObjectNamespace;
  FORMLESS_EMAIL_DELIVERY_QUEUE?: EmailDeliveryQueueBinding;
  FORMLESS_OWNER_SESSION_SECRET?: string;
};

type OwnerSetupStartRequest = {
  displayName: string;
  email: string;
  setupToken: string;
};

type OwnerSetupEmailVerifyRequest = {
  challengeId: string;
  email: string;
  setupToken: string;
  token: string;
};

type OwnerSetupPasskeyRegistrationOptionsRequest = {
  challengeId: string;
  email: string;
  setupToken: string;
};

type OwnerSetupPasskeyRegistrationVerifyRequest = OwnerSetupPasskeyRegistrationOptionsRequest & {
  completionId: string;
  response: RegistrationResponseJSON;
};

type OwnerSetupCompleteRequest = OwnerSetupPasskeyRegistrationOptionsRequest & {
  completionId: string;
};

type OwnerSetupAuthConfiguration = {
  authOrigin: string;
  relyingPartyId: string;
  relyingPartyName: string;
};

type OwnerSetupDeliveryConfiguration =
  | (Pick<OwnerSetupAuthConfiguration, "authOrigin"> & {
      controlPlaneRecords: readonly StoredRecord[];
      senderId: string;
    })
  | { response: Response };

export async function handleInstanceAuthOwnerSetupApiRequest(
  request: Request,
  env: InstanceAuthOwnerSetupEnv,
): Promise<Response | undefined> {
  if (!isInstanceAuthOwnerSetupApiPath(new URL(request.url).pathname)) {
    return undefined;
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);

  return env.FORMLESS_AUTHORITY.get(id).fetch(request);
}

export async function handleInstanceAuthOwnerSetupDurableObjectRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceAuthOwnerSetupEnv,
): Promise<Response | undefined> {
  const url = new URL(request.url);

  if (!isInstanceAuthOwnerSetupApiPath(url.pathname)) {
    return undefined;
  }

  if (request.method !== "POST") {
    return methodNotAllowedResponse("POST");
  }

  try {
    if (url.pathname === INSTANCE_AUTH_OWNER_SETUP_START_PATH) {
      return await handleOwnerSetupStart(request, storage, env);
    }

    if (url.pathname === INSTANCE_AUTH_OWNER_SETUP_EMAIL_VERIFY_PATH) {
      return await handleOwnerSetupEmailVerify(request, storage, env);
    }

    if (url.pathname === INSTANCE_AUTH_OWNER_SETUP_PASSKEY_REGISTER_OPTIONS_PATH) {
      return await handleOwnerSetupPasskeyRegistrationOptions(request, storage, env);
    }

    if (url.pathname === INSTANCE_AUTH_OWNER_SETUP_PASSKEY_REGISTER_VERIFY_PATH) {
      return await handleOwnerSetupPasskeyRegistrationVerify(request, storage, env);
    }

    return await handleOwnerSetupComplete(request, storage, env);
  } catch {
    return jsonResponse(instanceAuthError("invalid-request"), 400);
  }
}

function isInstanceAuthOwnerSetupApiPath(pathname: string): boolean {
  return (
    pathname === INSTANCE_AUTH_OWNER_SETUP_START_PATH ||
    pathname === INSTANCE_AUTH_OWNER_SETUP_EMAIL_VERIFY_PATH ||
    pathname === INSTANCE_AUTH_OWNER_SETUP_PASSKEY_REGISTER_OPTIONS_PATH ||
    pathname === INSTANCE_AUTH_OWNER_SETUP_PASSKEY_REGISTER_VERIFY_PATH ||
    pathname === INSTANCE_AUTH_OWNER_SETUP_COMPLETE_PATH
  );
}

async function handleOwnerSetupStart(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceAuthOwnerSetupEnv,
): Promise<Response> {
  const config = ownerSetupAuthConfiguration(request, storage);

  if ("response" in config) {
    return config.response;
  }

  const input = parseOwnerSetupStartRequest(await readJson(request));
  const setupTokenHash = await hashOwnerSetupToken(input.setupToken);
  const capability = await validatedOwnerSetupCapability(request, storage, env, setupTokenHash);

  if (!capability.ok) {
    return ownerSetupCapabilityFailureResponse(capability);
  }

  const deliveryConfig = await ownerSetupDeliveryConfiguration(request, storage, env, config);

  if ("response" in deliveryConfig) {
    return deliveryConfig.response;
  }

  const continuation =
    (await ownerSetupSuccessContinueTo(request, env)) ??
    (runtimeTopologyRoutes.authAccountRoute as AuthSuccessContinuationTarget);
  const displayEmail = normalizeEmailDeliveryAddress("Owner setup primary email", input.email);
  const normalizedEmail = displayEmail.toLowerCase();
  const instanceId = requestInstanceId(request);
  const idempotencyKey = await ownerSetupEmailChallengeIdempotencyKey({
    authOrigin: config.authOrigin,
    continuation,
    displayName: input.displayName,
    instanceId,
    normalizedEmail,
    setupTokenHash,
  });
  const now = nowIsoString();
  const expiresAt = new Date(Date.parse(now) + emailVerificationChallengeTtlMs).toISOString();
  let created: ReturnType<typeof createOwnerSetupEmailChallenge> | undefined;
  let rawToken: string | undefined;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    rawToken = generateEmailVerificationToken();
    created = createOwnerSetupEmailChallenge(storage, {
      authOrigin: config.authOrigin,
      continuation,
      createdAt: now,
      displayName: input.displayName,
      email: displayEmail,
      expiresAt,
      idempotencyKey,
      instanceId,
      setupTokenHash,
      tokenHash: await hashEmailVerificationToken(rawToken),
    });

    if (created.ok) {
      if (created.replayed) {
        rawToken = undefined;
      }

      break;
    }

    if (created.reason !== "duplicate-token-hash") {
      return jsonResponse(instanceAuthError("conflict"), 409);
    }
  }

  if (!created?.ok) {
    return jsonResponse(instanceAuthError("conflict"), 409);
  }

  let delivery: Awaited<ReturnType<typeof scheduleEmailDelivery>>;

  try {
    delivery = await scheduleEmailDelivery({
      controlPlaneRecords: deliveryConfig.controlPlaneRecords,
      emailDeliveryQueue: env.FORMLESS_EMAIL_DELIVERY_QUEUE,
      now,
      request: ownerSetupEmailDeliveryScheduleRequest({
        authOrigin: config.authOrigin,
        challenge: created.challenge,
        senderId: deliveryConfig.senderId,
        verificationLink:
          rawToken === undefined
            ? undefined
            : buildOwnerSetupEmailVerificationLink({
                authOrigin: config.authOrigin,
                challengeId: created.challenge.challengeId,
                email: created.challenge.displayEmail,
                setupToken: input.setupToken,
                token: rawToken,
              }),
      }),
      storage,
      targetAuthorityName: FORMLESS_INSTANCE_AUTHORITY_NAME,
    });
  } catch {
    return jsonResponse(instanceAuthError("unavailable"), 503);
  }

  return jsonResponse({
    delivery: {
      deliveryId: delivery.delivery.id,
      queued: delivery.queued,
      replayed: delivery.replayed,
      status: "scheduled",
    },
    ownerSetup: ownerSetupEmailChallengeSummary(created.challenge, "email-sent"),
  });
}

async function handleOwnerSetupEmailVerify(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceAuthOwnerSetupEnv,
): Promise<Response> {
  const config = ownerSetupAuthConfiguration(request, storage);

  if ("response" in config) {
    return config.response;
  }

  const input = parseOwnerSetupEmailVerifyRequest(await readJson(request));
  const setupTokenHash = await hashOwnerSetupToken(input.setupToken);
  const capability = await validatedOwnerSetupCapability(request, storage, env, setupTokenHash);

  if (!capability.ok) {
    return ownerSetupCapabilityFailureResponse(capability);
  }

  const verified = verifyOwnerSetupEmailChallenge(storage, {
    authOrigin: config.authOrigin,
    challengeId: input.challengeId,
    email: input.email,
    instanceId: requestInstanceId(request),
    now: nowIsoString(),
    setupTokenHash,
    tokenHash: await hashEmailVerificationToken(input.token),
  });

  if (!verified.ok) {
    return ownerSetupEmailChallengeFailureResponse(verified);
  }

  return jsonResponse({
    ownerSetup: ownerSetupEmailChallengeSummary(verified.challenge, "email-verified"),
    verified: true,
  });
}

async function handleOwnerSetupPasskeyRegistrationOptions(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceAuthOwnerSetupEnv,
): Promise<Response> {
  const config = ownerSetupAuthConfiguration(request, storage);

  if ("response" in config) {
    return config.response;
  }

  const input = parseOwnerSetupPasskeyRegistrationOptionsRequest(await readJson(request));
  const setupTokenHash = await hashOwnerSetupToken(input.setupToken);
  const capability = await validatedOwnerSetupCapability(request, storage, env, setupTokenHash);

  if (!capability.ok) {
    return ownerSetupCapabilityFailureResponse(capability);
  }

  const proof = currentOwnerSetupEmailProof(storage, {
    authOrigin: config.authOrigin,
    challengeId: input.challengeId,
    email: input.email,
    instanceId: requestInstanceId(request),
    setupTokenHash,
  });

  if (!proof.ok) {
    return currentOwnerSetupEmailProofFailureResponse(proof.reason);
  }

  const completionId = await ownerSetupCompletionId({
    authOrigin: config.authOrigin,
    emailChallengeId: proof.proof.challengeId,
    instanceId: proof.proof.instanceId,
    relyingPartyId: config.relyingPartyId,
    setupTokenHash,
  });
  const options = await generateRegistrationOptions({
    rpID: config.relyingPartyId,
    rpName: config.relyingPartyName,
    userDisplayName: proof.proof.displayName,
    userID: textBytes(ownerSetupPrincipalId(completionId)),
    userName: proof.proof.displayEmail,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required",
    },
  });
  const createdAt = nowIsoString();
  const created = createOwnerSetupPasskeyChallenge(storage, {
    authOrigin: config.authOrigin,
    challenge: options.challenge,
    completionId,
    createdAt,
    emailChallengeId: proof.proof.challengeId,
    expiresAt: new Date(Date.parse(createdAt) + passkeyChallengeTtlMs).toISOString(),
    instanceId: proof.proof.instanceId,
    relyingPartyId: config.relyingPartyId,
    setupTokenHash,
  });

  if (!created.ok) {
    return jsonResponse(instanceAuthError("conflict"), 409);
  }

  return jsonResponse({
    completionId,
    options,
  } satisfies {
    completionId: string;
    options: PublicKeyCredentialCreationOptionsJSON;
  });
}

async function handleOwnerSetupPasskeyRegistrationVerify(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceAuthOwnerSetupEnv,
): Promise<Response> {
  const config = ownerSetupAuthConfiguration(request, storage);

  if ("response" in config) {
    return config.response;
  }

  const input = parseOwnerSetupPasskeyRegistrationVerifyRequest(await readJson(request));
  const setupTokenHash = await hashOwnerSetupToken(input.setupToken);
  const capability = await validatedOwnerSetupCapability(request, storage, env, setupTokenHash);

  if (!capability.ok) {
    return ownerSetupCapabilityFailureResponse(capability);
  }

  const proof = currentOwnerSetupEmailProof(storage, {
    authOrigin: config.authOrigin,
    challengeId: input.challengeId,
    email: input.email,
    instanceId: requestInstanceId(request),
    setupTokenHash,
  });

  if (!proof.ok) {
    return currentOwnerSetupEmailProofFailureResponse(proof.reason);
  }

  const expectedCompletionId = await ownerSetupCompletionId({
    authOrigin: config.authOrigin,
    emailChallengeId: proof.proof.challengeId,
    instanceId: proof.proof.instanceId,
    relyingPartyId: config.relyingPartyId,
    setupTokenHash,
  });

  if (input.completionId !== expectedCompletionId) {
    return jsonResponse(instanceAuthError("unauthorized"), 401);
  }

  const challengeValue = clientDataChallenge(
    "Owner setup passkey registration response",
    input.response.response.clientDataJSON,
  );
  const passkeyChallenge = consumeOwnerSetupPasskeyChallenge(storage, {
    challenge: challengeValue,
    now: nowIsoString(),
  });

  if (!passkeyChallenge.ok) {
    return ownerSetupPasskeyChallengeFailureResponse(passkeyChallenge.reason);
  }

  if (
    !ownerSetupPasskeyChallengeMatches(passkeyChallenge.challenge, {
      authOrigin: config.authOrigin,
      completionId: input.completionId,
      emailChallengeId: proof.proof.challengeId,
      instanceId: proof.proof.instanceId,
      relyingPartyId: config.relyingPartyId,
      setupTokenHash,
    })
  ) {
    return jsonResponse(instanceAuthError("unauthorized"), 401);
  }

  let verified: Awaited<ReturnType<typeof verifyRegistrationResponse>>;

  try {
    verified = await verifyRegistrationResponse({
      response: input.response,
      expectedChallenge: passkeyChallenge.challenge.challenge,
      expectedOrigin: config.authOrigin,
      expectedRPID: config.relyingPartyId,
      requireUserVerification: true,
    });
  } catch {
    return jsonResponse(instanceAuthError("unauthorized"), 401);
  }

  if (!verified.verified) {
    return jsonResponse(instanceAuthError("unauthorized"), 401);
  }

  const credentialId = verified.registrationInfo.credential.id;

  if (readPasskeyCredential(storage, credentialId)) {
    return jsonResponse(instanceAuthError("conflict"), 409);
  }

  const prepared = createOwnerSetupPasskeyPreparation(storage, {
    authOrigin: config.authOrigin,
    completionId: input.completionId,
    counter: verified.registrationInfo.credential.counter,
    createdAt: nowIsoString(),
    credentialBackedUp: verified.registrationInfo.credentialBackedUp,
    credentialDeviceType: verified.registrationInfo.credentialDeviceType,
    credentialId,
    emailChallengeId: proof.proof.challengeId,
    instanceId: proof.proof.instanceId,
    publicKey: new Uint8Array(verified.registrationInfo.credential.publicKey),
    relyingPartyId: config.relyingPartyId,
    setupTokenHash,
    transports: verified.registrationInfo.credential.transports,
  });

  if (!prepared.ok) {
    return jsonResponse(instanceAuthError("conflict"), 409);
  }

  return jsonResponse({
    completionId: prepared.preparation.completionId,
    ownerSetup: ownerSetupEmailChallengeSummary(proof.proof, "passkey-prepared"),
    prepared: true,
  });
}

async function handleOwnerSetupComplete(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceAuthOwnerSetupEnv,
): Promise<Response> {
  const config = ownerSetupAuthConfiguration(request, storage);

  if ("response" in config) {
    return config.response;
  }

  const input = parseOwnerSetupCompleteRequest(await readJson(request));
  const setupTokenHash = await hashOwnerSetupToken(input.setupToken);
  const instanceId = requestInstanceId(request);
  let completion = readOwnerSetupCompletion(storage, input.completionId);

  if (completion) {
    if (
      !ownerSetupCompletionMatches(completion, {
        authOrigin: config.authOrigin,
        completionId: input.completionId,
        emailChallengeId: input.challengeId,
        email: input.email,
        instanceId,
        relyingPartyId: config.relyingPartyId,
        setupTokenHash,
      })
    ) {
      return jsonResponse(instanceAuthError("unauthorized"), 401);
    }
  } else {
    const capability = await validatedOwnerSetupCapability(request, storage, env, setupTokenHash);

    if (!capability.ok) {
      return ownerSetupCapabilityFailureResponse(capability);
    }

    const proof = currentOwnerSetupEmailProof(storage, {
      authOrigin: config.authOrigin,
      challengeId: input.challengeId,
      email: input.email,
      instanceId,
      setupTokenHash,
    });

    if (!proof.ok) {
      return currentOwnerSetupEmailProofFailureResponse(proof.reason);
    }

    const preparation = readOwnerSetupPasskeyPreparation(storage, input.completionId);

    if (
      !preparation ||
      preparation.authOrigin !== config.authOrigin ||
      preparation.completionId !== input.completionId ||
      preparation.emailChallengeId !== proof.proof.challengeId ||
      preparation.instanceId !== instanceId ||
      preparation.relyingPartyId !== config.relyingPartyId ||
      preparation.setupTokenHash !== setupTokenHash
    ) {
      return jsonResponse(instanceAuthError("conflict"), 409);
    }

    const createdAt = nowIsoString();
    const principalId = ownerSetupPrincipalId(input.completionId);

    try {
      completion = storage.transactionSync(() => {
        const createdCredential = createPasskeyCredentialInCurrentTransaction(storage, {
          credentialId: preparation.credentialId,
          principalId,
          publicKey: ownerSetupPreparedPasskeyPublicKey(preparation),
          counter: preparation.counter,
          transports: preparation.transports,
          credentialDeviceType: preparation.credentialDeviceType,
          credentialBackedUp: preparation.credentialBackedUp,
          createdAt,
          updatedAt: createdAt,
        });

        if (!createdCredential.ok) {
          throw new OwnerSetupCompletionConflictError();
        }

        const createdCompletion = createOwnerSetupCompletionInCurrentTransaction(storage, {
          authOrigin: config.authOrigin,
          completionId: input.completionId,
          continuation: proof.proof.continuation,
          createdAt,
          credentialId: preparation.credentialId,
          displayEmail: proof.proof.displayEmail,
          displayName: proof.proof.displayName,
          emailChallengeId: proof.proof.challengeId,
          instanceId,
          normalizedEmail: proof.proof.normalizedEmail,
          principalId,
          relyingPartyId: config.relyingPartyId,
          setupTokenHash,
        });

        if (!createdCompletion.ok) {
          throw new OwnerSetupCompletionConflictError();
        }

        return createdCompletion.completion;
      });
    } catch (error) {
      if (error instanceof OwnerSetupCompletionConflictError) {
        return jsonResponse(instanceAuthError("conflict"), 409);
      }

      throw error;
    }
  }

  if (!completion) {
    throw new Error("Owner setup completion could not be staged.");
  }

  let currentCompletion = completion;
  let session: Awaited<ReturnType<typeof createCentralAuthSessionCookie>>;

  try {
    session = await createCentralAuthSessionCookie(storage, {
      env,
      idempotencyKey: `owner-setup:${currentCompletion.completionId}`,
      now: currentCompletion.createdAt,
      principalId: currentCompletion.principalId,
      request,
    });
    currentCompletion = storage.transactionSync(() =>
      recordOwnerSetupCompletionSessionInCurrentTransaction(storage, {
        completionId: currentCompletion.completionId,
        sessionIdHash: session.session.sessionIdHash,
      }),
    );
  } catch {
    return jsonResponse(instanceAuthError("unavailable"), 503);
  }

  if (currentCompletion.completedAt === undefined) {
    let activation: Awaited<ReturnType<typeof commitIdentityOwnerSetupActivation>>;

    try {
      activation = await commitIdentityOwnerSetupActivation(env, {
        activatedAt: currentCompletion.createdAt,
        completionId: currentCompletion.completionId,
        displayEmail: currentCompletion.displayEmail,
        displayName: currentCompletion.displayName,
        normalizedEmail: currentCompletion.normalizedEmail,
        principalId: currentCompletion.principalId,
      });
    } catch {
      return jsonResponse(instanceAuthError("unavailable"), 503);
    }

    if (!activation.ok) {
      storage.transactionSync(() => {
        deleteCentralAuthSessionInCurrentTransaction(storage, {
          principalId: currentCompletion.principalId,
          sessionIdHash: session.session.sessionIdHash,
        });
        deletePasskeyCredentialInCurrentTransaction(storage, {
          credentialId: currentCompletion.credentialId,
          principalId: currentCompletion.principalId,
        });
        deleteOwnerSetupCompletionInCurrentTransaction(storage, currentCompletion.completionId);
      });

      return jsonResponse(instanceAuthError("conflict"), 409);
    }

    const completedAt = nowIsoString();

    try {
      currentCompletion = storage.transactionSync(() => {
        const setup = completeFirstOwnerSetupInCurrentTransaction(storage, {
          instanceId: currentCompletion.instanceId,
          now: completedAt,
          owner: activation.owner,
          tokenHash: currentCompletion.setupTokenHash,
        });

        if (!setup.ok) {
          throw new Error("Owner setup capability could not be consumed.");
        }

        return completeOwnerSetupCompletionInCurrentTransaction(storage, {
          completedAt,
          completionId: currentCompletion.completionId,
        });
      });
    } catch {
      return jsonResponse(instanceAuthError("unavailable"), 503);
    }
  }

  const headers = new Headers();

  headers.set("Set-Cookie", session.cookie);

  return jsonResponse(
    ownerSetupCompletionResponse(currentCompletion, session.session.expiresAt),
    200,
    headers,
  );
}

class OwnerSetupCompletionConflictError extends Error {
  constructor() {
    super("Owner setup completion conflicts with existing state.");
    this.name = "OwnerSetupCompletionConflictError";
  }
}

function ownerSetupCompletionMatches(
  completion: StoredOwnerSetupCompletion,
  expected: {
    authOrigin: string;
    completionId: string;
    email: string;
    emailChallengeId: string;
    instanceId: string;
    relyingPartyId: string;
    setupTokenHash: string;
  },
): boolean {
  return (
    completion.authOrigin === expected.authOrigin &&
    completion.completionId === expected.completionId &&
    completion.emailChallengeId === expected.emailChallengeId &&
    completion.instanceId === expected.instanceId &&
    completion.normalizedEmail ===
      normalizeEmailDeliveryAddress("Owner setup completion email", expected.email).toLowerCase() &&
    completion.relyingPartyId === expected.relyingPartyId &&
    completion.setupTokenHash === expected.setupTokenHash
  );
}

function ownerSetupPrincipalId(completionId: string): string {
  return `principal:owner-setup:${parseBase64UrlString("Owner setup completion id", completionId)}`;
}

function ownerSetupCompletionResponse(
  completion: StoredOwnerSetupCompletion,
  sessionExpiresAt: string,
) {
  const continuationUrl = completion.continuation.startsWith("/")
    ? undefined
    : new URL(completion.continuation);

  return {
    completed: true,
    completionId: completion.completionId,
    continueTo: completion.continuation,
    ...(continuationUrl === undefined
      ? {}
      : {
          handoff: {
            returnTo: `${continuationUrl.pathname}${continuationUrl.search}`,
            targetOrigin: continuationUrl.origin,
          },
        }),
    owner: {
      createdAt: completion.createdAt,
      email: completion.displayEmail,
      id: completion.principalId,
      name: completion.displayName,
    },
    session: { expiresAt: sessionExpiresAt },
    setupComplete: true,
  };
}

function ownerSetupAuthConfiguration(
  request: Request,
  storage: DurableObjectStorage,
): OwnerSetupAuthConfiguration | { response: Response } {
  const config = readInstanceAuthConfig(storage);
  const requestOrigin = new URL(request.url).origin;

  if (!config) {
    return { response: jsonResponse(instanceAuthError("unavailable"), 503) };
  }

  if (requestOrigin !== config.canonicalOrigin) {
    return {
      response: jsonResponse(instanceAuthError("not-found"), 404),
    };
  }

  return {
    authOrigin: config.canonicalOrigin,
    relyingPartyId: config.relyingPartyId,
    relyingPartyName: config.relyingPartyName,
  };
}

async function ownerSetupDeliveryConfiguration(
  request: Request,
  _storage: DurableObjectStorage,
  env: InstanceAuthOwnerSetupEnv,
  config: OwnerSetupAuthConfiguration,
): Promise<OwnerSetupDeliveryConfiguration> {
  if (!env.FORMLESS_EMAIL_DELIVERY_QUEUE) {
    return {
      response: jsonResponse(instanceAuthError("unavailable"), 503),
    };
  }

  let controlPlaneRecords: Awaited<ReturnType<typeof readControlPlaneRecords>>;

  try {
    controlPlaneRecords = await readControlPlaneRecords({ env, requestUrl: request.url });
  } catch {
    return {
      response: jsonResponse(instanceAuthError("unavailable"), 503),
    };
  }

  const sender = resolveDefaultEmailSenderReference(controlPlaneRecords ?? [], "auth");

  if (!sender) {
    return {
      response: jsonResponse(instanceAuthError("unavailable"), 503),
    };
  }

  try {
    resolveConfiguredDefaultCloudflareSender(controlPlaneRecords ?? [], "auth");
  } catch {
    return {
      response: jsonResponse(instanceAuthError("unavailable"), 503),
    };
  }

  return {
    authOrigin: config.authOrigin,
    controlPlaneRecords: controlPlaneRecords ?? [],
    senderId: sender.id,
  };
}

async function validatedOwnerSetupCapability(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceAuthOwnerSetupEnv,
  setupTokenHash: string,
): Promise<ValidateFirstOwnerSetupCapabilityResult> {
  const owner = await readIdentityOwner(env);

  return validateFirstOwnerSetupCapability(storage, {
    instanceId: requestInstanceId(request),
    now: nowIsoString(),
    owner,
    tokenHash: setupTokenHash,
  });
}

function currentOwnerSetupEmailProof(
  storage: DurableObjectStorage,
  input: {
    authOrigin: string;
    challengeId: string;
    email: string;
    instanceId: string;
    setupTokenHash: string;
  },
):
  | { ok: true; proof: StoredOwnerSetupEmailProof }
  | {
      ok: false;
      reason:
        | "consumed-proof"
        | "expired-proof"
        | "missing-proof"
        | "revoked-proof"
        | "unverified-email"
        | "wrong-auth-origin"
        | "wrong-capability"
        | "wrong-email"
        | "wrong-instance";
    } {
  const proof = readOwnerSetupEmailProof(storage, input.challengeId);

  if (!proof) {
    return { ok: false, reason: "missing-proof" };
  }

  if (proof.revokedAt !== undefined) {
    return { ok: false, reason: "revoked-proof" };
  }

  if (proof.consumedAt !== undefined) {
    return { ok: false, reason: "consumed-proof" };
  }

  if (proof.expiresAt <= nowIsoString()) {
    return { ok: false, reason: "expired-proof" };
  }

  if (proof.verifiedAt === undefined) {
    return { ok: false, reason: "unverified-email" };
  }

  if (proof.setupTokenHash !== input.setupTokenHash) {
    return { ok: false, reason: "wrong-capability" };
  }

  if (proof.instanceId !== input.instanceId.toLowerCase()) {
    return { ok: false, reason: "wrong-instance" };
  }

  if (proof.authOrigin !== input.authOrigin) {
    return { ok: false, reason: "wrong-auth-origin" };
  }

  if (
    proof.normalizedEmail !==
    normalizeEmailDeliveryAddress("Owner setup expected primary email", input.email).toLowerCase()
  ) {
    return { ok: false, reason: "wrong-email" };
  }

  return { ok: true, proof };
}

function ownerSetupEmailDeliveryScheduleRequest(input: {
  authOrigin: string;
  challenge: StoredOwnerSetupEmailProof;
  senderId: string;
  verificationLink: string | undefined;
}): EmailDeliveryScheduleRequest {
  return {
    canonicalOrigin: input.authOrigin,
    idempotencyKey: `${input.challenge.challengeId}:${emailVerificationDeliveryPurpose}`,
    message: renderOwnerSetupEmailVerificationMessage({
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

function buildOwnerSetupEmailVerificationLink(input: {
  authOrigin: string;
  challengeId: string;
  email: string;
  setupToken: string;
  token: string;
}): string {
  const url = new URL(runtimeTopologyRoutes.authAccountSetupRoute, input.authOrigin);

  url.searchParams.set(
    "challengeId",
    parseNonEmptyString("Owner setup email challenge id", input.challengeId),
  );
  url.searchParams.set(
    "email",
    normalizeEmailDeliveryAddress("Owner setup email verification link email", input.email),
  );
  url.searchParams.set("setupToken", parseOwnerSetupToken(input.setupToken));
  url.searchParams.set(
    "token",
    parseBase64UrlString("Owner setup email verification token", input.token),
  );

  return url.toString();
}

function renderOwnerSetupEmailVerificationMessage(input: {
  expiresAt: string;
  verificationLink: string | undefined;
}) {
  if (input.verificationLink === undefined) {
    return {
      subject: "Verify your Formless owner email",
      text: "This owner setup email verification request has already been rendered.",
    };
  }

  const escapedLink = htmlAttributeEscape(input.verificationLink);

  return {
    subject: "Verify your Formless owner email",
    text: [
      "Verify your primary email address for Formless owner setup.",
      "",
      `Verify email: ${input.verificationLink}`,
      "",
      `This verification link expires at ${input.expiresAt}.`,
    ].join("\n"),
    html: [
      "<p>Verify your primary email address for Formless owner setup.</p>",
      `<p><a href="${escapedLink}">Verify email</a></p>`,
      `<p>This verification link expires at ${htmlTextEscape(input.expiresAt)}.</p>`,
    ].join(""),
  };
}

function ownerSetupEmailChallengeSummary(
  challenge: StoredOwnerSetupEmailProof,
  status: "email-sent" | "email-verified" | "passkey-prepared",
) {
  return {
    challengeId: challenge.challengeId,
    displayEmail: challenge.displayEmail,
    displayName: challenge.displayName,
    expiresAt: challenge.expiresAt,
    status,
  };
}

function parseOwnerSetupStartRequest(value: unknown): OwnerSetupStartRequest {
  const object = parseRecord("Owner setup start request", value);

  assertAllowedKeys("Owner setup start request", object, ["displayName", "email", "setupToken"]);

  return {
    displayName: parseNonEmptyString("Owner setup display name", object.displayName),
    email: normalizeEmailDeliveryAddress("Owner setup primary email", object.email),
    setupToken: parseOwnerSetupToken(object.setupToken),
  };
}

function parseOwnerSetupEmailVerifyRequest(value: unknown): OwnerSetupEmailVerifyRequest {
  const object = parseRecord("Owner setup email verify request", value);

  assertAllowedKeys("Owner setup email verify request", object, [
    "challengeId",
    "email",
    "setupToken",
    "token",
  ]);

  return {
    challengeId: parseNonEmptyString(
      "Owner setup email verify request challenge id",
      object.challengeId,
    ),
    email: normalizeEmailDeliveryAddress("Owner setup email verify request email", object.email),
    setupToken: parseOwnerSetupToken(object.setupToken),
    token: parseBase64UrlString("Owner setup email verify request token", object.token),
  };
}

function parseOwnerSetupPasskeyRegistrationOptionsRequest(
  value: unknown,
): OwnerSetupPasskeyRegistrationOptionsRequest {
  const object = parseRecord("Owner setup passkey options request", value);

  assertAllowedKeys("Owner setup passkey options request", object, [
    "challengeId",
    "email",
    "setupToken",
  ]);

  return {
    challengeId: parseNonEmptyString(
      "Owner setup passkey options email challenge id",
      object.challengeId,
    ),
    email: normalizeEmailDeliveryAddress("Owner setup passkey options email", object.email),
    setupToken: parseOwnerSetupToken(object.setupToken),
  };
}

function parseOwnerSetupPasskeyRegistrationVerifyRequest(
  value: unknown,
): OwnerSetupPasskeyRegistrationVerifyRequest {
  const object = parseRecord("Owner setup passkey verify request", value);

  assertAllowedKeys("Owner setup passkey verify request", object, [
    "challengeId",
    "completionId",
    "email",
    "response",
    "setupToken",
  ]);

  return {
    challengeId: parseNonEmptyString(
      "Owner setup passkey verify email challenge id",
      object.challengeId,
    ),
    completionId: parseBase64UrlString(
      "Owner setup passkey verify completion id",
      object.completionId,
    ),
    email: normalizeEmailDeliveryAddress("Owner setup passkey verify email", object.email),
    response: parseRegistrationResponse(
      "Owner setup passkey registration response",
      object.response,
    ),
    setupToken: parseOwnerSetupToken(object.setupToken),
  };
}

function parseOwnerSetupCompleteRequest(value: unknown): OwnerSetupCompleteRequest {
  const object = parseRecord("Owner setup complete request", value);

  assertAllowedKeys("Owner setup complete request", object, [
    "challengeId",
    "completionId",
    "email",
    "setupToken",
  ]);

  return {
    challengeId: parseNonEmptyString("Owner setup complete email challenge id", object.challengeId),
    completionId: parseBase64UrlString("Owner setup complete completion id", object.completionId),
    email: normalizeEmailDeliveryAddress("Owner setup complete email", object.email),
    setupToken: parseOwnerSetupToken(object.setupToken),
  };
}

function parseRegistrationResponse(context: string, value: unknown): RegistrationResponseJSON {
  const object = parseRecord(context, value);
  const response = parseRecord(`${context} response`, object.response);

  parseBase64UrlString(`${context} id`, object.id);
  parseBase64UrlString(`${context} rawId`, object.rawId);
  parseBase64UrlString(`${context} clientDataJSON`, response.clientDataJSON);
  parseBase64UrlString(`${context} attestationObject`, response.attestationObject);

  return object as unknown as RegistrationResponseJSON;
}

function ownerSetupCapabilityFailureResponse(
  result: Extract<ValidateFirstOwnerSetupCapabilityResult, { ok: false }>,
): Response {
  switch (result.reason) {
    case "already-complete":
      return jsonResponse(instanceAuthError("conflict"), 409);
    case "expired-token":
      return jsonResponse(instanceAuthError("expired"), 410);
    case "invalid-token":
    case "missing-capability":
    case "wrong-instance":
      return jsonResponse(instanceAuthError("unauthorized"), 401);
  }
}

function ownerSetupEmailChallengeFailureResponse(
  result: Extract<VerifyOwnerSetupEmailChallengeResult, { ok: false }>,
): Response {
  switch (result.reason) {
    case "already-verified":
    case "revoked-challenge":
      return jsonResponse(instanceAuthError("conflict"), 409);
    case "expired-challenge":
      return jsonResponse(instanceAuthError("expired"), 410);
    case "missing-challenge":
      return jsonResponse(instanceAuthError("not-found"), 404);
    case "wrong-auth-origin":
    case "wrong-capability":
    case "wrong-email":
    case "wrong-instance":
    case "wrong-token":
      return jsonResponse(instanceAuthError("unauthorized"), 401);
  }
}

function currentOwnerSetupEmailProofFailureResponse(
  reason:
    | "consumed-proof"
    | "expired-proof"
    | "missing-proof"
    | "revoked-proof"
    | "unverified-email"
    | "wrong-auth-origin"
    | "wrong-capability"
    | "wrong-email"
    | "wrong-instance",
): Response {
  switch (reason) {
    case "consumed-proof":
    case "expired-proof":
      return reason === "expired-proof"
        ? jsonResponse(instanceAuthError("expired"), 410)
        : jsonResponse(instanceAuthError("conflict"), 409);
    case "revoked-proof":
      return jsonResponse(instanceAuthError("conflict"), 409);
    case "unverified-email":
      return jsonResponse(instanceAuthError("conflict"), 409);
    case "missing-proof":
      return jsonResponse(instanceAuthError("not-found"), 404);
    case "wrong-auth-origin":
    case "wrong-capability":
    case "wrong-email":
    case "wrong-instance":
      return jsonResponse(instanceAuthError("unauthorized"), 401);
  }
}

function ownerSetupPasskeyChallengeFailureResponse(
  reason: "already-consumed" | "expired-challenge" | "missing-challenge",
): Response {
  switch (reason) {
    case "already-consumed":
    case "missing-challenge":
      return jsonResponse(instanceAuthError("unauthorized"), 401);
    case "expired-challenge":
      return jsonResponse(instanceAuthError("expired"), 410);
  }
}

function ownerSetupPasskeyChallengeMatches(
  challenge: StoredOwnerSetupPasskeyChallenge,
  expected: {
    authOrigin: string;
    completionId: string;
    emailChallengeId: string;
    instanceId: string;
    relyingPartyId: string;
    setupTokenHash: string;
  },
): boolean {
  return (
    challenge.authOrigin === expected.authOrigin &&
    challenge.completionId === expected.completionId &&
    challenge.emailChallengeId === expected.emailChallengeId &&
    challenge.instanceId === expected.instanceId &&
    challenge.relyingPartyId === expected.relyingPartyId &&
    challenge.setupTokenHash === expected.setupTokenHash
  );
}

async function ownerSetupEmailChallengeIdempotencyKey(input: {
  authOrigin: string;
  continuation: AuthSuccessContinuationTarget;
  displayName: string;
  instanceId: string;
  normalizedEmail: string;
  setupTokenHash: string;
}): Promise<string> {
  return `owner-setup-email:${await sha256Base64Url(
    [
      input.setupTokenHash,
      input.instanceId,
      input.authOrigin,
      input.normalizedEmail,
      input.displayName,
      input.continuation,
    ].join("\n"),
  )}`;
}

async function ownerSetupCompletionId(input: {
  authOrigin: string;
  emailChallengeId: string;
  instanceId: string;
  relyingPartyId: string;
  setupTokenHash: string;
}): Promise<string> {
  return sha256Base64Url(
    [
      "owner-setup-passkey-completion",
      input.setupTokenHash,
      input.emailChallengeId,
      input.instanceId,
      input.authOrigin,
      input.relyingPartyId,
    ].join("\n"),
  );
}

function requestInstanceId(request: Request): string {
  return new URL(request.url).hostname.toLowerCase();
}

function generateEmailVerificationToken(byteLength = 32): string {
  const bytes = new Uint8Array(new ArrayBuffer(byteLength));

  crypto.getRandomValues(bytes);

  return base64UrlEncode(bytes);
}

async function hashEmailVerificationToken(value: unknown): Promise<string> {
  const token = parseBase64UrlString("Owner setup email verification token", value);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));

  return base64UrlEncode(new Uint8Array(digest));
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));

  return base64UrlEncode(new Uint8Array(digest));
}

function clientDataChallenge(context: string, value: string): string {
  let clientData: unknown;

  try {
    clientData = JSON.parse(new TextDecoder().decode(base64UrlDecode(value)));
  } catch {
    throw new Error(`${context} client data is invalid.`);
  }

  if (
    typeof clientData !== "object" ||
    clientData === null ||
    !("challenge" in clientData) ||
    typeof clientData.challenge !== "string"
  ) {
    throw new Error(`${context} client data challenge is invalid.`);
  }

  return parseBase64UrlString(`${context} challenge`, clientData.challenge);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function textBytes(value: string): Uint8Array<ArrayBuffer> {
  const encoded = new TextEncoder().encode(value);
  const bytes = new Uint8Array(new ArrayBuffer(encoded.byteLength));

  bytes.set(encoded);

  return bytes;
}

function htmlAttributeEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function htmlTextEscape(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

function methodNotAllowedResponse(allow: string): Response {
  return jsonResponse(instanceAuthError("method-not-allowed"), 405, { Allow: allow });
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

function assertAllowedKeys(
  context: string,
  object: Record<string, unknown>,
  allowedKeys: readonly string[],
) {
  const allowed = new Set(allowedKeys);

  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) {
      throw new Error(`${context} has unsupported key "${key}".`);
    }
  }
}

function parseNonEmptyString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value.trim();
}

function parseBase64UrlString(context: string, value: unknown): string {
  const parsed = parseNonEmptyString(context, value);

  if (!/^[A-Za-z0-9_-]+$/.test(parsed)) {
    throw new Error(`${context} must be base64url.`);
  }

  return parsed;
}
