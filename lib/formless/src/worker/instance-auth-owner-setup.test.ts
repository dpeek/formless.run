import { createHash, generateKeyPairSync, type KeyObject } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vite-plus/test";

import type { StoredRecord } from "@dpeek/formless-storage";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { EmailDeliveryRecord, EmailDeliveryRenderedMessage } from "../shared/email-runtime.ts";
import { createWorkerHarness } from "./miniflare-test.ts";
import type {
  StoredOwnerSetupCompletion,
  StoredOwnerSetupEmailProof,
  StoredOwnerSetupPasskeyChallenge,
  StoredOwnerSetupPasskeyPreparation,
} from "./instance-auth-owner-setup-state.ts";
import type { StoredPasskeyCredential } from "./instance-auth-state.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;
type HarnessDispatchFetchInit = Parameters<Harness["mf"]["dispatchFetch"]>[1];

type OwnerSetupStartResponse = {
  delivery: {
    deliveryId: string;
    queued: boolean;
    replayed: boolean;
    status: "scheduled";
  };
  ownerSetup: {
    challengeId: string;
    displayEmail: string;
    displayName: string;
    expiresAt: string;
    status: "email-sent";
  };
};

type OwnerSetupVerifyResponse = {
  ownerSetup: Omit<OwnerSetupStartResponse["ownerSetup"], "status"> & {
    status: "email-verified";
  };
  verified: true;
};

type OwnerSetupPasskeyOptionsResponse = {
  completionId: string;
  options: PublicKeyCredentialCreationOptionsJSON;
};

type OwnerSetupPasskeyVerifyResponse = {
  completionId: string;
  ownerSetup: Omit<OwnerSetupStartResponse["ownerSetup"], "status"> & {
    status: "passkey-prepared";
  };
  prepared: true;
};

type OwnerSetupCompleteResponse = {
  completed: true;
  completionId: string;
  continueTo: string;
  handoff?: {
    returnTo: string;
    targetOrigin: string;
  };
  owner: {
    createdAt: string;
    email: string;
    id: string;
    name: string;
  };
  session: {
    expiresAt: string;
  };
  setupComplete: true;
};
const authOrigin = "https://auth.example.com";
const authEmail = "email-sender:auth@mail.example.com";
const setupToken = "abcDEF0123456789_-abcDEF0123456789_-";
const otherSetupToken = "xyzXYZ0123456789_-xyzXYZ0123456789_-";
const futureExpiresAt = "2999-01-01T00:00:00.000Z";
const createdAt = "2026-07-24T00:00:00.000Z";
const packageRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const workspaceRoot = resolve(packageRoot, "../..");

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

describe("production owner setup email proof API", () => {
  it("creates one idempotent private challenge and verifies it without authorizing identity", async () => {
    harness = await createOwnerSetupHarness();
    await configureOwnerSetup();

    const started = await startOwnerSetup();
    const replayed = await startOwnerSetup();
    const message = await renderedMessage(started.delivery.deliveryId);
    const token = verificationTokenFromMessage(message);
    const tokenHash = sha256Base64Url(token);
    const link = verificationLinkFromMessage(message);
    const deliveries = await deliveryRecords();
    const queueJobs = await queueJobRecords();
    const proofs = await ownerSetupProofs();
    const identityBefore = await identityRecords();
    const publicState = JSON.stringify([started, replayed, deliveries, queueJobs, identityBefore]);

    expect(started).toMatchObject({
      delivery: {
        queued: true,
        replayed: false,
        status: "scheduled",
      },
      ownerSetup: {
        displayEmail: "Ada.Owner@example.com",
        displayName: "Ada Owner",
        status: "email-sent",
      },
    });
    expect(replayed).toMatchObject({
      delivery: {
        deliveryId: started.delivery.deliveryId,
        replayed: true,
      },
      ownerSetup: {
        challengeId: started.ownerSetup.challengeId,
      },
    });
    expect(proofs).toHaveLength(1);
    expect(proofs[0]).toMatchObject({
      authOrigin,
      challengeId: started.ownerSetup.challengeId,
      continuation: "/formless/auth",
      displayEmail: "Ada.Owner@example.com",
      displayName: "Ada Owner",
      instanceId: "auth.example.com",
      normalizedEmail: "ada.owner@example.com",
      setupTokenHash: sha256Base64Url(setupToken),
      tokenHash,
    });
    expect(new URL(link).origin).toBe(authOrigin);
    expect(new URL(link).pathname).toBe("/formless/auth/setup");
    expect(new URL(link).searchParams.get("challengeId")).toBe(started.ownerSetup.challengeId);
    expect(new URL(link).searchParams.get("email")).toBe("Ada.Owner@example.com");
    expect(new URL(link).searchParams.get("setupToken")).toBe(setupToken);
    expect(new URL(link).searchParams.get("token")).toBe(token);
    expect(publicState).not.toContain(token);
    expect(publicState).not.toContain(tokenHash);
    expect(deliveries).toHaveLength(1);
    expect(queueJobs).toHaveLength(1);
    expect(authorizingIdentityRecords(identityBefore)).toEqual([]);

    const verified = await verifyOwnerSetup({
      challengeId: started.ownerSetup.challengeId,
      email: "ada.owner@example.com",
      token,
    });
    const stored = await ownerSetupProof(started.ownerSetup.challengeId);
    const identityAfter = await identityRecords();

    expect(verified).toEqual({
      ownerSetup: {
        challengeId: started.ownerSetup.challengeId,
        displayEmail: "Ada.Owner@example.com",
        displayName: "Ada Owner",
        expiresAt: started.ownerSetup.expiresAt,
        status: "email-verified",
      },
      verified: true,
    });
    expect(stored).toMatchObject({
      challengeId: started.ownerSetup.challengeId,
      setupTokenHash: sha256Base64Url(setupToken),
      tokenHash,
      verifiedAt: expect.any(String),
    });
    expect(authorizingIdentityRecords(identityAfter)).toEqual([]);
  });

  it("rejects missing delivery, wrong capability, and wrong instance before challenge creation", async () => {
    harness = await createOwnerSetupHarness({ emailConfig: "missing-auth-sender" });
    await configureOwnerSetup();

    const missingDelivery = await postAuthJsonFailure("/formless/auth/setup/start", {
      displayName: "Ada Owner",
      email: "ada@example.com",
      setupToken,
    });

    expect(missingDelivery).toEqual({
      body: { error: "Owner setup email delivery is not configured." },
      status: 503,
    });
    expect(await ownerSetupProofs()).toEqual([]);
    expect(await deliveryRecords()).toEqual([]);

    await harness.dispose();
    harness = await createOwnerSetupHarness();
    await configureOwnerSetup();

    const wrongCapability = await postAuthJsonFailure("/formless/auth/setup/start", {
      displayName: "Ada Owner",
      email: "ada@example.com",
      setupToken: otherSetupToken,
    });

    expect(wrongCapability).toEqual({
      body: { error: "Owner setup link is invalid." },
      status: 401,
    });
    expect(await ownerSetupProofs()).toEqual([]);

    await configureOwnerSetup({ instanceId: "other.example.com" });

    const wrongInstance = await postAuthJsonFailure("/formless/auth/setup/start", {
      displayName: "Ada Owner",
      email: "ada@example.com",
      setupToken,
    });

    expect(wrongInstance).toEqual({
      body: { error: "Owner setup link is invalid." },
      status: 401,
    });
    expect(await ownerSetupProofs()).toEqual([]);
  });

  it("rejects expired, wrong-capability, and replayed verification without changing proof", async () => {
    harness = await createOwnerSetupHarness();
    await configureOwnerSetup();

    const expiredStart = await startOwnerSetup({ email: "expired@example.com" });
    const expiredMessage = await renderedMessage(expiredStart.delivery.deliveryId);
    const expiredToken = verificationTokenFromMessage(expiredMessage);

    await expireOwnerSetupProof(expiredStart.ownerSetup.challengeId);

    const expired = await postAuthJsonFailure("/formless/auth/setup/email/verify", {
      challengeId: expiredStart.ownerSetup.challengeId,
      email: "expired@example.com",
      setupToken,
      token: expiredToken,
    });

    expect(expired).toEqual({
      body: { error: "Owner setup email link has expired." },
      status: 410,
    });

    const validStart = await startOwnerSetup({ email: "valid@example.com" });
    const validMessage = await renderedMessage(validStart.delivery.deliveryId);
    const validToken = verificationTokenFromMessage(validMessage);
    const wrongCapability = await postAuthJsonFailure("/formless/auth/setup/email/verify", {
      challengeId: validStart.ownerSetup.challengeId,
      email: "valid@example.com",
      setupToken: otherSetupToken,
      token: validToken,
    });
    const pending = await ownerSetupProof(validStart.ownerSetup.challengeId);

    expect(wrongCapability).toEqual({
      body: { error: "Owner setup link is invalid." },
      status: 401,
    });
    expect(pending).not.toHaveProperty("verifiedAt");

    await verifyOwnerSetup({
      challengeId: validStart.ownerSetup.challengeId,
      email: "valid@example.com",
      token: validToken,
    });

    const replay = await postAuthJsonFailure("/formless/auth/setup/email/verify", {
      challengeId: validStart.ownerSetup.challengeId,
      email: "valid@example.com",
      setupToken,
      token: validToken,
    });

    expect(replay).toEqual({
      body: { error: "Owner setup email link is no longer available." },
      status: 409,
    });
  });

  it("does not disclose or mutate an email owned by another principal", async () => {
    harness = await createOwnerSetupHarness();
    await configureOwnerSetup();
    await createConflictingIdentityEmail("owned@example.com");

    const identityBefore = await identityRecords();
    const started = await startOwnerSetup({ email: "Owned@Example.com" });
    const message = await renderedMessage(started.delivery.deliveryId);
    const verified = await verifyOwnerSetup({
      challengeId: started.ownerSetup.challengeId,
      email: "owned@example.com",
      token: verificationTokenFromMessage(message),
    });
    const identityAfter = await identityRecords();

    expect(verified).toMatchObject({
      ownerSetup: {
        displayEmail: "Owned@example.com",
        status: "email-verified",
      },
      verified: true,
    });
    expect(authorizingIdentityRecords(identityAfter)).toEqual(
      authorizingIdentityRecords(identityBefore),
    );
    expect(
      identityAfter.find(
        (record) =>
          record.entity === "principal-email" &&
          record.values.normalizedEmail === "owned@example.com",
      )?.values.principal,
    ).toBe("principal:existing");
  });

  it("binds registration options to the verified email proof and prepares no authority", async () => {
    harness = await createOwnerSetupHarness();
    await configureOwnerSetup();

    const verifiedEmail = await createVerifiedOwnerSetupEmail();
    const options = await requestOwnerSetupPasskeyOptions({
      challengeId: verifiedEmail.started.ownerSetup.challengeId,
      email: "ada.owner@example.com",
    });
    const challenges = await ownerSetupPasskeyChallenges();

    expect(options.completionId).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(options.options.authenticatorSelection).toMatchObject({
      requireResidentKey: true,
      residentKey: "required",
      userVerification: "required",
    });
    expect(Buffer.from(options.options.user.id, "base64url").toString()).toBe(
      `principal:owner-setup:${options.completionId}`,
    );
    expect(challenges).toEqual([
      {
        authOrigin,
        challenge: options.options.challenge,
        completionId: options.completionId,
        createdAt: expect.any(String),
        emailChallengeId: verifiedEmail.started.ownerSetup.challengeId,
        expiresAt: expect.any(String),
        instanceId: "auth.example.com",
        relyingPartyId: "auth.example.com",
        setupTokenHash: sha256Base64Url(setupToken),
      },
    ]);

    const passkey = new VirtualPasskey("Y3JlZGVudGlhbC1vd25lci1wcmVwYXJlZA");
    const preparedResponse = await verifyOwnerSetupPasskey({
      challengeId: verifiedEmail.started.ownerSetup.challengeId,
      completionId: options.completionId,
      email: "ada.owner@example.com",
      response: passkey.registrationResponse(options.options, {
        origin: authOrigin,
        rpId: "auth.example.com",
      }),
    });
    const preparations = await ownerSetupPasskeyPreparations();
    const activeCredential = await passkeyCredential("Y3JlZGVudGlhbC1vd25lci1wcmVwYXJlZA");
    const identityAfter = await identityRecords();

    expect(preparedResponse).toEqual({
      completionId: options.completionId,
      ownerSetup: {
        challengeId: verifiedEmail.started.ownerSetup.challengeId,
        displayEmail: "Ada.Owner@example.com",
        displayName: "Ada Owner",
        expiresAt: verifiedEmail.started.ownerSetup.expiresAt,
        status: "passkey-prepared",
      },
      prepared: true,
    });
    expect(preparations).toMatchObject([
      {
        authOrigin,
        completionId: options.completionId,
        credentialId: "Y3JlZGVudGlhbC1vd25lci1wcmVwYXJlZA",
        emailChallengeId: verifiedEmail.started.ownerSetup.challengeId,
        instanceId: "auth.example.com",
        relyingPartyId: "auth.example.com",
        setupTokenHash: sha256Base64Url(setupToken),
      },
    ]);
    expect(activeCredential).toBeNull();
    expect(authorizingIdentityRecords(identityAfter)).toEqual([]);
  });

  it("rejects unverified and mismatched email proofs before issuing passkey options", async () => {
    harness = await createOwnerSetupHarness();
    await configureOwnerSetup();

    const pending = await startOwnerSetup();
    const unverified = await postAuthJsonFailure("/formless/auth/setup/passkeys/register/options", {
      challengeId: pending.ownerSetup.challengeId,
      email: "ada.owner@example.com",
      setupToken,
    });

    expect(unverified).toEqual({
      body: { error: "Owner setup email must be verified before passkey setup." },
      status: 409,
    });
    expect(await ownerSetupPasskeyChallenges()).toEqual([]);

    const message = await renderedMessage(pending.delivery.deliveryId);
    await verifyOwnerSetup({
      challengeId: pending.ownerSetup.challengeId,
      email: "ada.owner@example.com",
      token: verificationTokenFromMessage(message),
    });

    const wrongEmail = await postAuthJsonFailure("/formless/auth/setup/passkeys/register/options", {
      challengeId: pending.ownerSetup.challengeId,
      email: "other@example.com",
      setupToken,
    });
    const wrongCapability = await postAuthJsonFailure(
      "/formless/auth/setup/passkeys/register/options",
      {
        challengeId: pending.ownerSetup.challengeId,
        email: "ada.owner@example.com",
        setupToken: otherSetupToken,
      },
    );

    expect(wrongEmail).toEqual({
      body: { error: "Owner setup email proof is invalid." },
      status: 401,
    });
    expect(wrongCapability).toEqual({
      body: { error: "Owner setup link is invalid." },
      status: 401,
    });
    expect(await ownerSetupPasskeyChallenges()).toEqual([]);
  });

  it("rejects wrong-origin, wrong-RP, and replayed ceremonies without partial preparation", async () => {
    harness = await createOwnerSetupHarness();
    await configureOwnerSetup();

    const verifiedEmail = await createVerifiedOwnerSetupEmail();
    const credentialId = "Y3JlZGVudGlhbC1jZXJlbW9ueS1zY29wZQ";
    const passkey = new VirtualPasskey(credentialId);
    const wrongOriginOptions = await requestOwnerSetupPasskeyOptions({
      challengeId: verifiedEmail.started.ownerSetup.challengeId,
      email: "ada.owner@example.com",
    });
    const wrongOrigin = await postAuthJsonFailure("/formless/auth/setup/passkeys/register/verify", {
      challengeId: verifiedEmail.started.ownerSetup.challengeId,
      completionId: wrongOriginOptions.completionId,
      email: "ada.owner@example.com",
      response: passkey.registrationResponse(wrongOriginOptions.options, {
        origin: "https://other.example.com",
        rpId: "auth.example.com",
      }),
      setupToken,
    });

    expect(wrongOrigin).toEqual({
      body: { error: "Passkey registration verification failed." },
      status: 401,
    });
    expect(await ownerSetupPasskeyPreparations()).toEqual([]);

    const wrongRpOptions = await requestOwnerSetupPasskeyOptions({
      challengeId: verifiedEmail.started.ownerSetup.challengeId,
      email: "ada.owner@example.com",
    });
    const wrongRp = await postAuthJsonFailure("/formless/auth/setup/passkeys/register/verify", {
      challengeId: verifiedEmail.started.ownerSetup.challengeId,
      completionId: wrongRpOptions.completionId,
      email: "ada.owner@example.com",
      response: passkey.registrationResponse(wrongRpOptions.options, {
        origin: authOrigin,
        rpId: "other.example.com",
      }),
      setupToken,
    });

    expect(wrongRp).toEqual({
      body: { error: "Passkey registration verification failed." },
      status: 401,
    });
    expect(await ownerSetupPasskeyPreparations()).toEqual([]);

    const unverifiedOptions = await requestOwnerSetupPasskeyOptions({
      challengeId: verifiedEmail.started.ownerSetup.challengeId,
      email: "ada.owner@example.com",
    });
    const unverified = await postAuthJsonFailure("/formless/auth/setup/passkeys/register/verify", {
      challengeId: verifiedEmail.started.ownerSetup.challengeId,
      completionId: unverifiedOptions.completionId,
      email: "ada.owner@example.com",
      response: passkey.registrationResponse(unverifiedOptions.options, {
        origin: authOrigin,
        rpId: "auth.example.com",
        userVerified: false,
      }),
      setupToken,
    });

    expect(unverified).toEqual({
      body: { error: "Passkey registration verification failed." },
      status: 401,
    });
    expect(await ownerSetupPasskeyPreparations()).toEqual([]);

    const validOptions = await requestOwnerSetupPasskeyOptions({
      challengeId: verifiedEmail.started.ownerSetup.challengeId,
      email: "ada.owner@example.com",
    });
    const validRequest = {
      challengeId: verifiedEmail.started.ownerSetup.challengeId,
      completionId: validOptions.completionId,
      email: "ada.owner@example.com",
      response: passkey.registrationResponse(validOptions.options, {
        origin: authOrigin,
        rpId: "auth.example.com",
      }),
      setupToken,
    };
    const prepared = await postAuthJson<OwnerSetupPasskeyVerifyResponse>(
      "/formless/auth/setup/passkeys/register/verify",
      validRequest,
    );
    const replay = await postAuthJsonFailure(
      "/formless/auth/setup/passkeys/register/verify",
      validRequest,
    );

    expect(prepared).toMatchObject({ completionId: validOptions.completionId, prepared: true });
    expect(replay).toEqual({
      body: { error: "Passkey challenge is invalid." },
      status: 401,
    });
    expect(await ownerSetupPasskeyPreparations()).toHaveLength(1);
  });

  it("rejects an active duplicate credential before preparation becomes durable", async () => {
    harness = await createOwnerSetupHarness();
    await configureOwnerSetup();

    const verifiedEmail = await createVerifiedOwnerSetupEmail();
    const credentialId = "Y3JlZGVudGlhbC1hY3RpdmUtZHVwbGljYXRl";
    await createActivePasskeyCredential(credentialId);

    const options = await requestOwnerSetupPasskeyOptions({
      challengeId: verifiedEmail.started.ownerSetup.challengeId,
      email: "ada.owner@example.com",
    });
    const passkey = new VirtualPasskey(credentialId);
    const duplicate = await postAuthJsonFailure("/formless/auth/setup/passkeys/register/verify", {
      challengeId: verifiedEmail.started.ownerSetup.challengeId,
      completionId: options.completionId,
      email: "ada.owner@example.com",
      response: passkey.registrationResponse(options.options, {
        origin: authOrigin,
        rpId: "auth.example.com",
      }),
      setupToken,
    });

    expect(duplicate).toEqual({
      body: { error: "Passkey registration could not be prepared." },
      status: 409,
    });
    expect(await ownerSetupPasskeyPreparations()).toEqual([]);
    expect(await passkeyCredential(credentialId)).toMatchObject({
      credentialId,
      principalId: "principal:active",
    });
  });

  it("activates one owner completion and replays the same session and continuation", async () => {
    harness = await createOwnerSetupHarness();
    await configureOwnerSetup();

    const prepared = await createPreparedOwnerSetupPasskey("Y3JlZGVudGlhbC1vd25lci1jb21wbGV0ZQ");
    const request = ownerSetupCompletionRequest(prepared);
    const completed = await postAuthJsonResponse<OwnerSetupCompleteResponse>(
      "/formless/auth/setup/complete",
      request,
    );
    const replayed = await postAuthJsonResponse<OwnerSetupCompleteResponse>(
      "/formless/auth/setup/complete",
      request,
    );
    const identity = await identityRecords();
    const completions = await ownerSetupCompletions();
    const sessions = await centralAuthSessions();

    expect(completed.body).toMatchObject({
      completed: true,
      completionId: prepared.options.completionId,
      continueTo: "/formless/auth",
      owner: {
        email: "Ada.Owner@example.com",
        name: "Ada Owner",
      },
      setupComplete: true,
    });
    expect(replayed.body).toEqual(completed.body);
    expect(replayed.setCookie).toBe(completed.setCookie);
    expect(completed.setCookie).toContain("formless_auth_session=");
    expect(
      authorizingIdentityRecords(identity).filter((record) => !record.deletedAt),
    ).toMatchObject([
      {
        entity: "principal",
        id: completed.body.owner.id,
        values: {
          displayName: "Ada Owner",
          kind: "human",
          status: "active",
        },
      },
      {
        entity: "principal-email",
        values: {
          displayEmail: "Ada.Owner@example.com",
          normalizedEmail: "ada.owner@example.com",
          primary: true,
          principal: completed.body.owner.id,
          recovery: true,
          verificationStatus: "verified",
        },
      },
      {
        entity: "role-assignment",
        values: {
          scopeKind: "instance",
          status: "active",
          targetKind: "principal",
          targetPrincipal: completed.body.owner.id,
        },
      },
    ]);
    expect(completions).toMatchObject([
      {
        completedAt: expect.any(String),
        completionId: prepared.options.completionId,
        principalId: completed.body.owner.id,
        sessionIdHash: expect.any(String),
      },
    ]);
    expect(sessions).toHaveLength(1);
    expect(await ownerSetupPasskeyPreparations()).toEqual([]);
    expect(
      await ownerSetupProof(prepared.verifiedEmail.started.ownerSetup.challengeId),
    ).toMatchObject({ consumedAt: expect.any(String) });
    expect(await ownerSetupCapability()).toBeNull();
    expect(await passkeyCredential(prepared.credentialId)).toMatchObject({
      credentialId: prepared.credentialId,
      principalId: completed.body.owner.id,
    });
  });

  it("resumes after private-session and identity activation boundaries without early owner authority", async () => {
    harness = await createOwnerSetupHarness({ identityActivationFailures: 1 });
    await configureOwnerSetup();
    await setCompletionFault("session");

    const prepared = await createPreparedOwnerSetupPasskey(
      "Y3JlZGVudGlhbC1vd25lci1mYXVsdC1yZXRyeQ",
    );
    const request = ownerSetupCompletionRequest(prepared);
    const missingSession = await postAuthJsonFailure("/formless/auth/setup/complete", request);

    expect(missingSession).toEqual({
      body: { error: "Owner setup completion must be retried." },
      status: 503,
    });
    expect(authorizingIdentityRecords(await identityRecords())).toEqual([]);
    expect(await centralAuthSessions()).toEqual([]);
    expect(await ownerSetupCapability()).not.toBeNull();

    await setCompletionFault("none");

    const interruptedIdentity = await postAuthJsonFailure("/formless/auth/setup/complete", request);

    expect(interruptedIdentity).toEqual({
      body: { error: "Owner setup completion must be retried." },
      status: 503,
    });
    expect(authorizingIdentityRecords(await identityRecords())).toEqual([]);
    expect(await centralAuthSessions()).toHaveLength(1);
    expect(await ownerSetupCapability()).not.toBeNull();

    const completed = await postAuthJson<OwnerSetupCompleteResponse>(
      "/formless/auth/setup/complete",
      request,
    );

    expect(completed).toMatchObject({
      completed: true,
      completionId: prepared.options.completionId,
      setupComplete: true,
    });
    expect(await centralAuthSessions()).toHaveLength(1);
    expect(await ownerSetupCompletions()).toHaveLength(1);
    expect(await ownerSetupCapability()).toBeNull();
  });

  it("replays an identity activation whose committed response was interrupted", async () => {
    harness = await createOwnerSetupHarness({ identityActivationResponseFailures: 1 });
    await configureOwnerSetup();

    const prepared = await createPreparedOwnerSetupPasskey(
      "Y3JlZGVudGlhbC1vd25lci1sb3N0LXJlc3BvbnNl",
    );
    const request = ownerSetupCompletionRequest(prepared);
    const interrupted = await postAuthJsonFailure("/formless/auth/setup/complete", request);
    const identityAfterCommit = authorizingIdentityRecords(await identityRecords());

    expect(interrupted).toEqual({
      body: { error: "Owner setup completion must be retried." },
      status: 503,
    });
    expect(identityAfterCommit.filter((record) => record.entity === "principal")).toHaveLength(1);
    expect(
      identityAfterCommit.filter((record) => record.entity === "principal-email"),
    ).toHaveLength(1);
    expect(
      identityAfterCommit.filter((record) => record.entity === "role-assignment"),
    ).toHaveLength(1);
    expect(await centralAuthSessions()).toHaveLength(1);
    expect(await ownerSetupCapability()).not.toBeNull();

    const completed = await postAuthJson<OwnerSetupCompleteResponse>(
      "/formless/auth/setup/complete",
      request,
    );
    const identityAfterRetry = authorizingIdentityRecords(await identityRecords());

    expect(completed).toMatchObject({ completed: true, setupComplete: true });
    expect(identityAfterRetry).toEqual(identityAfterCommit);
    expect(await centralAuthSessions()).toHaveLength(1);
    expect(await ownerSetupCompletions()).toHaveLength(1);
    expect(await ownerSetupCapability()).toBeNull();
  });

  it("rolls back staged auth state when normalized email activation conflicts", async () => {
    harness = await createOwnerSetupHarness();
    await configureOwnerSetup();
    await createConflictingIdentityEmail("ada.owner@example.com");

    const prepared = await createPreparedOwnerSetupPasskey(
      "Y3JlZGVudGlhbC1vd25lci1lbWFpbC1jb25mbGljdA",
    );
    const identityBefore = await identityRecords();
    const conflict = await postAuthJsonFailure(
      "/formless/auth/setup/complete",
      ownerSetupCompletionRequest(prepared),
    );

    expect(conflict).toEqual({
      body: { error: "Owner setup completion could not be committed." },
      status: 409,
    });
    expect(await identityRecords()).toEqual(identityBefore);
    expect(await passkeyCredential(prepared.credentialId)).toBeNull();
    expect(await centralAuthSessions()).toEqual([]);
    expect(await ownerSetupCompletions()).toEqual([]);
    expect(await ownerSetupCapability()).not.toBeNull();
    expect(await ownerSetupPasskeyPreparations()).toHaveLength(1);
  });

  it("rejects a credential conflict introduced after preparation without consuming setup", async () => {
    harness = await createOwnerSetupHarness();
    await configureOwnerSetup();

    const prepared = await createPreparedOwnerSetupPasskey(
      "Y3JlZGVudGlhbC1vd25lci1sYXRlLWR1cGxpY2F0ZQ",
    );
    await createActivePasskeyCredential(prepared.credentialId);

    const conflict = await postAuthJsonFailure(
      "/formless/auth/setup/complete",
      ownerSetupCompletionRequest(prepared),
    );

    expect(conflict).toEqual({
      body: { error: "Owner setup completion could not be committed." },
      status: 409,
    });
    expect(authorizingIdentityRecords(await identityRecords())).toEqual([]);
    expect(await passkeyCredential(prepared.credentialId)).toMatchObject({
      principalId: "principal:active",
    });
    expect(await centralAuthSessions()).toEqual([]);
    expect(await ownerSetupCompletions()).toEqual([]);
    expect(await ownerSetupCapability()).not.toBeNull();
  });

  it("returns the runtime-selected mapped administration handoff", async () => {
    harness = await createOwnerSetupHarness({ mappedAdmin: true });
    await configureOwnerSetup();

    const prepared = await createPreparedOwnerSetupPasskey(
      "Y3JlZGVudGlhbC1vd25lci1tYXBwZWQtYWRtaW4",
    );
    const completed = await postAuthJson<OwnerSetupCompleteResponse>(
      "/formless/auth/setup/complete",
      ownerSetupCompletionRequest(prepared),
    );

    expect(completed).toMatchObject({
      continueTo: "https://admin.example.com/",
      handoff: {
        returnTo: "/",
        targetOrigin: "https://admin.example.com",
      },
    });
  });
});

async function createOwnerSetupHarness(
  options: {
    emailConfig?: "configured" | "missing-auth-sender";
    identityActivationFailures?: number;
    identityActivationResponseFailures?: number;
    mappedAdmin?: boolean;
  } = {},
): Promise<Harness> {
  return createWorkerHarness(
    await writeOwnerSetupHarness(),
    {
      FORMLESS_AUTHORITY: { className: "OwnerSetupHarnessAuthority", useSQLite: true },
    },
    {
      bindings: {
        EMAIL_CONFIG_MODE: options.emailConfig ?? "configured",
        FORMLESS_OWNER_SESSION_SECRET: "test-owner-session-secret",
        IDENTITY_ACTIVATION_FAILURES: String(options.identityActivationFailures ?? 0),
        IDENTITY_ACTIVATION_RESPONSE_FAILURES: String(
          options.identityActivationResponseFailures ?? 0,
        ),
        MAPPED_ADMIN: options.mappedAdmin === true ? "true" : "false",
      },
    },
  );
}
async function configureOwnerSetup(
  overrides: Partial<{
    expiresAt: string;
    instanceId: string;
    setupToken: string;
  }> = {},
) {
  return postHarnessJson("/harness/configure", {
    expiresAt: overrides.expiresAt ?? futureExpiresAt,
    instanceId: overrides.instanceId ?? "auth.example.com",
    setupToken: overrides.setupToken ?? setupToken,
  });
}
async function startOwnerSetup(
  overrides: Partial<{
    displayName: string;
    email: string;
    setupToken: string;
  }> = {},
) {
  return postAuthJson<OwnerSetupStartResponse>("/formless/auth/setup/start", {
    displayName: overrides.displayName ?? "Ada Owner",
    email: overrides.email ?? "Ada.Owner@Example.com",
    setupToken: overrides.setupToken ?? setupToken,
  });
}

async function verifyOwnerSetup(input: { challengeId: string; email: string; token: string }) {
  return postAuthJson<OwnerSetupVerifyResponse>("/formless/auth/setup/email/verify", {
    ...input,
    setupToken,
  });
}

async function createVerifiedOwnerSetupEmail() {
  const started = await startOwnerSetup();
  const message = await renderedMessage(started.delivery.deliveryId);
  const verified = await verifyOwnerSetup({
    challengeId: started.ownerSetup.challengeId,
    email: "ada.owner@example.com",
    token: verificationTokenFromMessage(message),
  });

  return { started, verified };
}

async function requestOwnerSetupPasskeyOptions(input: { challengeId: string; email: string }) {
  return postAuthJson<OwnerSetupPasskeyOptionsResponse>(
    "/formless/auth/setup/passkeys/register/options",
    {
      ...input,
      setupToken,
    },
  );
}

async function verifyOwnerSetupPasskey(input: {
  challengeId: string;
  completionId: string;
  email: string;
  response: RegistrationResponseJSON;
}) {
  return postAuthJson<OwnerSetupPasskeyVerifyResponse>(
    "/formless/auth/setup/passkeys/register/verify",
    {
      ...input,
      setupToken,
    },
  );
}

async function createPreparedOwnerSetupPasskey(credentialId: string) {
  const verifiedEmail = await createVerifiedOwnerSetupEmail();
  const options = await requestOwnerSetupPasskeyOptions({
    challengeId: verifiedEmail.started.ownerSetup.challengeId,
    email: "ada.owner@example.com",
  });
  const passkey = new VirtualPasskey(credentialId);
  const prepared = await verifyOwnerSetupPasskey({
    challengeId: verifiedEmail.started.ownerSetup.challengeId,
    completionId: options.completionId,
    email: "ada.owner@example.com",
    response: passkey.registrationResponse(options.options, {
      origin: authOrigin,
      rpId: "auth.example.com",
    }),
  });

  return { credentialId, options, prepared, verifiedEmail };
}

function ownerSetupCompletionRequest(
  prepared: Awaited<ReturnType<typeof createPreparedOwnerSetupPasskey>>,
) {
  return {
    challengeId: prepared.verifiedEmail.started.ownerSetup.challengeId,
    completionId: prepared.options.completionId,
    email: "ada.owner@example.com",
    setupToken,
  };
}

async function createConflictingIdentityEmail(email: string) {
  return postHarnessJson("/harness/conflicting-email", {
    email,
    principalId: "principal:existing",
  });
}

async function expireOwnerSetupProof(challengeId: string) {
  return postHarnessJson("/harness/expire-proof", { challengeId });
}
async function ownerSetupProofs() {
  return getHarnessJson<{
    proofs: StoredOwnerSetupEmailProof[];
  }>("/harness/proofs").then((result) => result.proofs);
}
async function ownerSetupProof(challengeId: string) {
  return getHarnessJson<{
    proof: StoredOwnerSetupEmailProof | null;
  }>(`/harness/proof/${encodeURIComponent(challengeId)}`).then((result) => result.proof);
}
async function ownerSetupPasskeyChallenges() {
  return getHarnessJson<{
    challenges: StoredOwnerSetupPasskeyChallenge[];
  }>("/harness/passkey-challenges").then((result) => result.challenges);
}
async function ownerSetupPasskeyPreparations() {
  return getHarnessJson<{
    preparations: StoredOwnerSetupPasskeyPreparation[];
  }>("/harness/passkey-preparations").then((result) => result.preparations);
}
async function ownerSetupCompletions() {
  return getHarnessJson<{
    completions: StoredOwnerSetupCompletion[];
  }>("/harness/completions").then((result) => result.completions);
}
async function centralAuthSessions() {
  return getHarnessJson<{
    sessions: Array<{
      expiresAt: string;
      instanceId: string;
      issuedAt: string;
      principalId: string;
      sessionIdHash: string;
    }>;
  }>("/harness/central-sessions").then((result) => result.sessions);
}
async function ownerSetupCapability() {
  return getHarnessJson<{
    capability: unknown;
  }>("/harness/capability").then((result) => result.capability);
}
async function setCompletionFault(fault: "none" | "session") {
  return postHarnessJson("/harness/completion-fault", { fault });
}

async function createActivePasskeyCredential(credentialId: string) {
  return postHarnessJson("/harness/active-credential", { credentialId });
}
async function passkeyCredential(credentialId: string) {
  return getHarnessJson<{
    credential: StoredPasskeyCredential | null;
  }>(`/harness/credential/${encodeURIComponent(credentialId)}`).then((result) => result.credential);
}
async function deliveryRecords() {
  return getHarnessJson<{
    deliveries: EmailDeliveryRecord[];
  }>("/harness/deliveries").then((result) => result.deliveries);
}
async function queueJobRecords() {
  return getHarnessJson<{
    jobs: unknown[];
  }>("/harness/queue-jobs").then((result) => result.jobs);
}
async function renderedMessage(deliveryId: string) {
  return getHarnessJson<{
    message?: EmailDeliveryRenderedMessage;
  }>(`/harness/internal-message/${encodeURIComponent(deliveryId)}`).then(
    (result) => result.message,
  );
}
async function identityRecords() {
  return getHarnessJson<{
    records: StoredRecord[];
  }>("/harness/identity-records").then((result) => result.records);
}
function authorizingIdentityRecords(records: StoredRecord[]) {
  return records.filter((record) =>
    ["app-registration", "principal", "principal-email", "role-assignment"].includes(record.entity),
  );
}

async function getHarnessJson<T>(path: string): Promise<T> {
  const response = await fetchHarness(path);

  expect(response.status).toBe(200);

  return (await response.json()) as T;
}

async function postHarnessJson<T = unknown>(path: string, body: unknown): Promise<T> {
  const response = await fetchHarness(path, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  expect(response.status).toBe(200);

  return (await response.json()) as T;
}

async function postAuthJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetchAuth(path, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  expect(response.status).toBe(200);

  return (await response.json()) as T;
}

async function postAuthJsonResponse<T>(path: string, body: unknown) {
  const response = await fetchAuth(path, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  expect(response.status).toBe(200);

  return {
    body: (await response.json()) as T,
    setCookie: response.headers.get("Set-Cookie"),
  };
}

async function postAuthJsonFailure(path: string, body: unknown) {
  const response = await fetchAuth(path, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  return {
    body: (await response.json()) as {
      error: string;
    },
    status: response.status,
  };
}

function fetchHarness(path: string, init?: HarnessDispatchFetchInit) {
  if (!harness) {
    throw new Error("Harness is not initialized.");
  }

  return harness.mf.dispatchFetch(`${authOrigin}${path}`, init);
}

function fetchAuth(path: string, init?: HarnessDispatchFetchInit) {
  return fetchHarness(path, init);
}

function verificationLinkFromMessage(message: EmailDeliveryRenderedMessage | undefined): string {
  const match = message?.text.match(/Verify email: (https:\/\/\S+)/);

  if (!match?.[1]) {
    throw new Error("Verification link was not rendered.");
  }

  return match[1];
}

function verificationTokenFromMessage(message: EmailDeliveryRenderedMessage | undefined): string {
  const link = verificationLinkFromMessage(message);
  const token = new URL(link).searchParams.get("token");

  if (!token) {
    throw new Error("Verification token was not rendered.");
  }

  return token;
}

function sha256Base64Url(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

class VirtualPasskey {
  private readonly credentialId: string;
  private readonly publicKey: KeyObject;

  constructor(credentialIdValue: string) {
    const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });

    this.credentialId = credentialIdValue;
    this.publicKey = pair.publicKey;
  }
  registrationResponse(
    options: PublicKeyCredentialCreationOptionsJSON,
    input: {
      origin: string;
      rpId: string;
      userVerified?: boolean;
    },
  ): RegistrationResponseJSON {
    const clientDataJSON = clientDataJson("webauthn.create", options.challenge, input.origin);
    const authData = registrationAuthenticatorData({
      credentialId: base64UrlDecode(this.credentialId),
      credentialPublicKey: this.credentialPublicKey(),
      counter: 0,
      rpId: input.rpId,
      userVerified: input.userVerified ?? true,
    });
    const attestationObject = cborMap([
      ["fmt", "none"],
      ["attStmt", []],
      ["authData", authData],
    ]);

    return {
      id: this.credentialId,
      rawId: this.credentialId,
      response: {
        clientDataJSON: base64UrlEncode(clientDataJSON),
        attestationObject: base64UrlEncode(attestationObject),
        transports: ["internal"],
      },
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
      type: "public-key",
    };
  }

  private credentialPublicKey(): Uint8Array {
    const jwk = this.publicKey.export({ format: "jwk" }) as JsonWebKey;

    if (!jwk.x || !jwk.y) {
      throw new Error("Virtual passkey public key export is missing coordinates.");
    }

    return cborMap([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, base64UrlDecode(jwk.x)],
      [-3, base64UrlDecode(jwk.y)],
    ]);
  }
}

function registrationAuthenticatorData(input: {
  counter: number;
  credentialId: Uint8Array;
  credentialPublicKey: Uint8Array;
  rpId: string;
  userVerified: boolean;
}) {
  const credentialIdLength = new Uint8Array(2);
  const credentialIdLengthView = new DataView(credentialIdLength.buffer);

  credentialIdLengthView.setUint16(0, input.credentialId.byteLength, false);

  return concatBytes([
    sha256(new TextEncoder().encode(input.rpId)),
    new Uint8Array([input.userVerified ? 0x45 : 0x41]),
    uint32(input.counter),
    new Uint8Array(16),
    credentialIdLength,
    input.credentialId,
    input.credentialPublicKey,
  ]);
}

function clientDataJson(type: "webauthn.create", challenge: string, origin: string) {
  return new TextEncoder().encode(
    JSON.stringify({
      type,
      challenge,
      origin,
      crossOrigin: false,
    }),
  );
}

type CborMapKey = number | string;
type CborMapEntry = readonly [CborMapKey, CborValue];
type CborValue = number | string | Uint8Array | readonly CborMapEntry[];

function cborMap(entries: readonly CborMapEntry[]): Uint8Array {
  return concatBytes([
    cborHeader(5, entries.length),
    ...entries.flatMap(([key, value]) => [cborEncode(key), cborEncode(value)]),
  ]);
}

function cborEncode(value: CborValue): Uint8Array {
  if (typeof value === "number") {
    return value >= 0 ? cborHeader(0, value) : cborHeader(1, -1 - value);
  }

  if (typeof value === "string") {
    const bytes = new TextEncoder().encode(value);

    return concatBytes([cborHeader(3, bytes.byteLength), bytes]);
  }

  if (value instanceof Uint8Array) {
    return concatBytes([cborHeader(2, value.byteLength), value]);
  }

  return cborMap(value);
}

function cborHeader(major: number, value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("CBOR value must be a non-negative integer.");
  }

  if (value < 24) {
    return new Uint8Array([(major << 5) | value]);
  }

  if (value <= 0xff) {
    return new Uint8Array([(major << 5) | 24, value]);
  }

  if (value <= 0xffff) {
    const bytes = new Uint8Array(3);
    const view = new DataView(bytes.buffer);

    bytes[0] = (major << 5) | 25;
    view.setUint16(1, value, false);

    return bytes;
  }

  const bytes = new Uint8Array(5);
  const view = new DataView(bytes.buffer);

  bytes[0] = (major << 5) | 26;
  view.setUint32(1, value, false);

  return bytes;
}

function uint32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  const view = new DataView(bytes.buffer);

  view.setUint32(0, value, false);

  return bytes;
}

function sha256(bytes: Uint8Array): Uint8Array {
  return createHash("sha256").update(Buffer.from(bytes)).digest();
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
}

function base64UrlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function base64UrlDecode(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

async function writeOwnerSetupHarness() {
  harnessDir = await mkdtemp(join(tmpdir(), "formless-owner-setup-email-harness-"));
  const harnessPath = join(harnessDir, "owner-setup-email-harness.ts");

  await writeFile(
    harnessPath,
    `
      import { DurableObject } from "cloudflare:workers";
      import {
        INSTANCE_CONTROL_PLANE_API_ROUTE_PREFIX,
        INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
      } from "${workspaceRoot}/lib/instance-control-plane/src/index.ts";
      import {
        IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY,
      } from "${workspaceRoot}/lib/identity-control-plane/src/index.ts";
      import {
        ensureEmailDeliveryTables,
        listEmailDeliveries,
        readEmailDeliveryRenderedMessageById,
      } from "${packageRoot}/src/worker/email-runtime-state.ts";
      import {
        handleInstanceEmailRuntimeDurableObjectRequest,
      } from "${packageRoot}/src/worker/email-runtime.ts";
      import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "${packageRoot}/src/worker/formless-instance.ts";
      import {
        handleIdentityControlPlaneDurableObjectRequest,
        INTERNAL_OWNER_SETUP_ACTIVATION_COMMIT_PATH,
      } from "${packageRoot}/src/worker/identity-control-plane.ts";
      import { INTERNAL_READ_RECORDS_PATH } from "${packageRoot}/src/worker/instance-control-plane.ts";
      import {
        handleInstanceAuthOwnerSetupApiRequest,
        handleInstanceAuthOwnerSetupDurableObjectRequest,
      } from "${packageRoot}/src/worker/instance-auth-owner-setup.ts";
      import {
        ensureOwnerSetupEmailProofTables,
        listOwnerSetupCompletions,
        listOwnerSetupEmailProofs,
        listOwnerSetupPasskeyChallenges,
        listOwnerSetupPasskeyPreparations,
        readOwnerSetupEmailProof,
      } from "${packageRoot}/src/worker/instance-auth-owner-setup-state.ts";
      import {
        createPasskeyCredential,
        ensureInstanceAuthTables,
        readPasskeyCredential,
        writeInstanceAuthConfig,
      } from "${packageRoot}/src/worker/instance-auth-state.ts";
      import {
        ensureInstanceSetupTables,
        hashOwnerSetupToken,
        readInstanceSetupState,
        writeOwnerSetupCapability,
      } from "${packageRoot}/src/worker/instance-setup-state.ts";
      import {
        ensureStorageTables,
        getBootstrapRecords,
        writeRecordSetForCommandOperationOutcome,
      } from "${packageRoot}/src/worker/storage.ts";

      export default {
        async fetch(request, env) {
          const url = new URL(request.url);
          const ownerSetupResponse = await handleInstanceAuthOwnerSetupApiRequest(request, env);

          if (ownerSetupResponse) {
            return ownerSetupResponse;
          }

          if (url.pathname === "/harness/conflicting-email") {
            const id = env.FORMLESS_AUTHORITY.idFromName(IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY);

            return env.FORMLESS_AUTHORITY.get(id).fetch(request);
          }

          if (url.pathname === "/harness/identity-records") {
            const id = env.FORMLESS_AUTHORITY.idFromName(IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY);

            return env.FORMLESS_AUTHORITY.get(id).fetch(request);
          }

          if (url.pathname.startsWith("/harness/")) {
            const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);

            return env.FORMLESS_AUTHORITY.get(id).fetch(request);
          }

          return Response.json({ error: "Not found." }, { status: 404 });
        },
      };

      export class OwnerSetupHarnessAuthority extends DurableObject {
        constructor(ctx, env) {
          super(ctx, env);
          this.env = env;

          if (ctx.id.name === FORMLESS_INSTANCE_AUTHORITY_NAME) {
            ensureInstanceAuthTables(ctx.storage);
            ensureInstanceSetupTables(ctx.storage);
            ensureOwnerSetupEmailProofTables(ctx.storage);
            ensureEmailDeliveryTables(ctx.storage);
          }

          if (ctx.id.name === IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY) {
            ensureStorageTables(ctx.storage);
          }
        }

        async fetch(request) {
          const url = new URL(request.url);

          if (this.ctx.id.name === INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY) {
            if (
              request.method === "GET" &&
              url.pathname === \`\${INSTANCE_CONTROL_PLANE_API_ROUTE_PREFIX}\${INTERNAL_READ_RECORDS_PATH}\`
            ) {
              return Response.json({
                records: controlPlaneRecords(
                  this.env.EMAIL_CONFIG_MODE,
                  this.env.MAPPED_ADMIN === "true",
                ),
              });
            }

            return Response.json({ error: "Not found." }, { status: 404 });
          }

          if (this.ctx.id.name === IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY) {
            if (url.pathname === "/harness/identity-records") {
              return Response.json({ records: getBootstrapRecords(this.ctx.storage) });
            }

            if (url.pathname === "/harness/conflicting-email") {
              const body = await request.json();
              writeRecordSetForCommandOperationOutcome(
                this.ctx.storage,
                \`owner-setup-conflicting-email:\${body.email}\`,
                [
                  {
                    kind: "create",
                    entity: "principal",
                    id: body.principalId,
                    values: {
                      displayName: "Existing Principal",
                      kind: "human",
                      status: "active",
                    },
                  },
                  {
                    kind: "create",
                    entity: "principal-email",
                    id: \`principal-email:\${body.principalId}:primary\`,
                    values: {
                      principal: body.principalId,
                      displayEmail: body.email,
                      normalizedEmail: String(body.email).toLowerCase(),
                      verificationStatus: "verified",
                      primary: true,
                      recovery: true,
                      verifiedAt: "${createdAt}",
                    },
                  },
                ],
                undefined,
                { now: "${createdAt}" },
              );

              return Response.json({ created: true });
            }

            if (url.pathname === INTERNAL_OWNER_SETUP_ACTIVATION_COMMIT_PATH) {
              this.ctx.storage.sql.exec(\`
                CREATE TABLE IF NOT EXISTS owner_setup_activation_faults (
                  id INTEGER PRIMARY KEY AUTOINCREMENT
                )
              \`);
              const failures = this.ctx.storage.sql
                .exec("SELECT COUNT(*) AS count FROM owner_setup_activation_faults")
                .one().count;
              const failureLimit = Number(this.env.IDENTITY_ACTIVATION_FAILURES);

              if (failures < failureLimit) {
                this.ctx.storage.sql.exec("INSERT INTO owner_setup_activation_faults DEFAULT VALUES");
                return Response.json(
                  { error: "Injected owner setup activation failure." },
                  { status: 503 },
                );
              }
            }

            const identityResponse = await handleIdentityControlPlaneDurableObjectRequest(
              request,
              this.ctx.storage,
              this.env,
            );

            if (
              url.pathname === INTERNAL_OWNER_SETUP_ACTIVATION_COMMIT_PATH &&
              identityResponse?.ok
            ) {
              this.ctx.storage.sql.exec(\`
                CREATE TABLE IF NOT EXISTS owner_setup_activation_response_faults (
                  id INTEGER PRIMARY KEY AUTOINCREMENT
                )
              \`);
              const failures = this.ctx.storage.sql
                .exec("SELECT COUNT(*) AS count FROM owner_setup_activation_response_faults")
                .one().count;
              const failureLimit = Number(this.env.IDENTITY_ACTIVATION_RESPONSE_FAILURES);

              if (failures < failureLimit) {
                this.ctx.storage.sql.exec(
                  "INSERT INTO owner_setup_activation_response_faults DEFAULT VALUES",
                );
                return Response.json(
                  { error: "Injected owner setup activation response failure." },
                  { status: 503 },
                );
              }
            }

            return identityResponse ?? Response.json({ error: "Not found." }, { status: 404 });
          }

          if (url.pathname === "/harness/configure") {
            const body = await request.json();

            writeInstanceAuthConfig(this.ctx.storage, {
              canonicalOrigin: "${authOrigin}",
              relyingPartyId: "auth.example.com",
              relyingPartyName: "Formless",
              now: "${createdAt}",
            });
            writeOwnerSetupCapability(this.ctx.storage, {
              createdAt: "${createdAt}",
              expiresAt: body.expiresAt,
              instanceId: body.instanceId,
              tokenHash: await hashOwnerSetupToken(body.setupToken),
            });

            return Response.json({ configured: true });
          }

          if (url.pathname === "/harness/completion-fault") {
            const body = await request.json();
            this.ctx.storage.sql.exec(\`
              CREATE TABLE IF NOT EXISTS owner_setup_completion_fault (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                fault TEXT NOT NULL
              )
            \`);
            this.ctx.storage.sql.exec(
              \`
                INSERT INTO owner_setup_completion_fault (id, fault)
                VALUES (1, ?)
                ON CONFLICT(id) DO UPDATE SET fault = excluded.fault
              \`,
              body.fault,
            );

            return Response.json({ fault: body.fault });
          }

          const ownerSetupResponse = await handleInstanceAuthOwnerSetupDurableObjectRequest(
            request,
            this.ctx.storage,
            ownerSetupEnv(this.env, this.ctx.storage),
          );

          if (ownerSetupResponse) {
            return ownerSetupResponse;
          }

          const emailRuntimeResponse = await handleInstanceEmailRuntimeDurableObjectRequest(
            request,
            this.ctx.storage,
            ownerSetupEnv(this.env, this.ctx.storage),
          );

          if (emailRuntimeResponse) {
            return emailRuntimeResponse;
          }

          if (url.pathname === "/harness/proofs") {
            return Response.json({ proofs: listOwnerSetupEmailProofs(this.ctx.storage) });
          }

          if (url.pathname.startsWith("/harness/proof/")) {
            const challengeId = decodeURIComponent(url.pathname.slice("/harness/proof/".length));

            return Response.json({
              proof: readOwnerSetupEmailProof(this.ctx.storage, challengeId) ?? null,
            });
          }

          if (url.pathname === "/harness/expire-proof") {
            const body = await request.json();

            this.ctx.storage.sql.exec(
              "UPDATE instance_auth_owner_setup_email_proofs SET expires_at = ? WHERE challenge_id = ?",
              "2000-01-01T00:00:00.000Z",
              body.challengeId,
            );

            return Response.json({ expired: true });
          }

          if (url.pathname === "/harness/passkey-challenges") {
            return Response.json({
              challenges: listOwnerSetupPasskeyChallenges(this.ctx.storage),
            });
          }

          if (url.pathname === "/harness/passkey-preparations") {
            return Response.json({
              preparations: listOwnerSetupPasskeyPreparations(this.ctx.storage),
            });
          }

          if (url.pathname === "/harness/completions") {
            return Response.json({
              completions: listOwnerSetupCompletions(this.ctx.storage),
            });
          }

          if (url.pathname === "/harness/central-sessions") {
            return Response.json({
              sessions: this.ctx.storage.sql
                .exec(\`
                  SELECT
                    session_id_hash AS sessionIdHash,
                    instance_id AS instanceId,
                    principal_id AS principalId,
                    issued_at AS issuedAt,
                    expires_at AS expiresAt
                  FROM instance_auth_central_sessions
                  ORDER BY issued_at ASC, session_id_hash ASC
                \`)
                .toArray(),
            });
          }

          if (url.pathname === "/harness/capability") {
            return Response.json({
              capability: readInstanceSetupState(this.ctx.storage).capability,
            });
          }

          if (url.pathname === "/harness/active-credential") {
            const body = await request.json();
            const created = createPasskeyCredential(this.ctx.storage, {
              credentialId: body.credentialId,
              principalId: "principal:active",
              publicKey: new Uint8Array([1, 2, 3, 4]),
              counter: 0,
              transports: ["internal"],
              credentialDeviceType: "singleDevice",
              credentialBackedUp: false,
              createdAt: "${createdAt}",
              updatedAt: "${createdAt}",
            });

            return Response.json({ created });
          }

          if (url.pathname.startsWith("/harness/credential/")) {
            const credentialId = decodeURIComponent(
              url.pathname.slice("/harness/credential/".length),
            );

            return Response.json({
              credential: readPasskeyCredential(this.ctx.storage, credentialId) ?? null,
            });
          }

          if (url.pathname === "/harness/deliveries") {
            return Response.json({ deliveries: listEmailDeliveries(this.ctx.storage) });
          }

          if (url.pathname === "/harness/queue-jobs") {
            ensureQueueTable(this.ctx.storage);
            return Response.json({
              jobs: this.ctx.storage.sql
                .exec("SELECT message_json FROM fake_email_delivery_queue_jobs ORDER BY send_id ASC")
                .toArray()
                .map((row) => JSON.parse(row.message_json)),
            });
          }

          if (url.pathname.startsWith("/harness/internal-message/")) {
            const deliveryId = decodeURIComponent(url.pathname.slice("/harness/internal-message/".length));

            return Response.json({
              message: readEmailDeliveryRenderedMessageById(this.ctx.storage, deliveryId),
            });
          }

          return Response.json({ error: "Not found." }, { status: 404 });
        }
      }

      function ownerSetupEnv(env, storage) {
        const fault = completionFault(storage);

        return {
          ...env,
          FORMLESS_EMAIL_DELIVERY_QUEUE: emailDeliveryQueueBinding(storage),
          FORMLESS_OWNER_SESSION_SECRET:
            fault === "session" ? undefined : env.FORMLESS_OWNER_SESSION_SECRET,
        };
      }

      function completionFault(storage) {
        storage.sql.exec(\`
          CREATE TABLE IF NOT EXISTS owner_setup_completion_fault (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            fault TEXT NOT NULL
          )
        \`);
        const row = storage.sql
          .exec("SELECT fault FROM owner_setup_completion_fault WHERE id = 1")
          .next();

        return row.done ? "none" : row.value.fault;
      }

      function emailDeliveryQueueBinding(storage) {
        return {
          async send(job) {
            ensureQueueTable(storage);
            storage.sql.exec(
              "INSERT INTO fake_email_delivery_queue_jobs (message_json) VALUES (?)",
              JSON.stringify(job),
            );

            return {};
          },
        };
      }

      function ensureQueueTable(storage) {
        storage.sql.exec(\`
          CREATE TABLE IF NOT EXISTS fake_email_delivery_queue_jobs (
            send_id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_json TEXT NOT NULL
          )
        \`);
      }

      function controlPlaneRecords(mode, mappedAdmin) {
        const records = [
          record("settings:instance", "instance-settings", {
            settingsId: "instance",
            defaultEmailDomain: "email-domain:mail.example.com",
            defaultAuthSender: "${authEmail}",
            ...(mappedAdmin ? { adminRoute: "route:admin" } : {}),
          }),
          record("email-domain:mail.example.com", "email-domain", {
            enabled: true,
            providerFamily: "cloudflare",
            domain: "mail.example.com",
          }),
          record("${authEmail}", "email-sender", {
            enabled: true,
            address: "auth@mail.example.com",
            displayName: "Example Auth",
            purpose: "auth",
            emailDomain: "email-domain:mail.example.com",
          }),
        ];

        if (mappedAdmin) {
          records.push(
            record("route:admin", "route", {
              access: "owner",
              enabled: true,
              kind: "mount",
              matchHost: "admin.example.com",
              matchPath: "/",
              matchPrefix: "/",
              surface: "admin",
              targetProfile: "instance",
            }),
          );
        }

        return mode === "missing-auth-sender"
          ? records.filter((record) => record.entity !== "email-sender")
          : records;
      }

      function record(id, entity, values) {
        return { id, entity, values, createdAt: "${createdAt}", updatedAt: "${createdAt}" };
      }
    `,
  );

  return harnessPath;
}
