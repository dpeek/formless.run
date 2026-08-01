import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";

import { createWorkerHarness } from "./miniflare-test.ts";
import type {
  ConsumeCollaboratorInvitationTokenResult,
  ConsumeEmailVerificationChallengeResult,
  ConsumeHandoffGrantResult,
  ConsumePasskeyChallengeResult,
  CreateCentralAuthSessionResult,
  CreateCollaboratorInvitationTokenResult,
  CreateEmailVerificationChallengeResult,
  CreateHandoffGrantResult,
  CreatePasskeyChallengeResult,
  CreatePasskeyCredentialResult,
  RevokeEmailVerificationChallengeResult,
  RevokeCollaboratorInvitationTokenResult,
  RevokeCentralAuthSessionResult,
  StoredCollaboratorInvitationToken,
  StoredCentralAuthSession,
  StoredEmailVerificationChallenge,
  StoredHandoffGrant,
  StoredHostSessionRevocationVersion,
  StoredInstanceAuthConfig,
  StoredPasskeyChallenge,
  StoredPasskeyCredential,
  UpdatePasskeyCredentialVerificationResult,
  ValidateEmailVerificationChallengeResult,
} from "./instance-auth-state.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

const canonicalOrigin = "https://instance.example.com";
const relyingPartyId = "example.com";
const relyingPartyName = "Formless";
const createdAt = "2026-05-21T00:00:00.000Z";
const updatedAt = "2026-05-21T00:05:00.000Z";
const expiresAt = "2026-05-21T01:00:00.000Z";
const expiredAt = "2026-05-21T00:00:30.000Z";
const invitationRegistrationChallenge = "aW52aXRhdGlvbi1yZWdpc3RyYXRpb24tY2hhbGxlbmdl";
const loginChallenge = "bG9naW4tY2hhbGxlbmdl";
const migratedLoginChallenge = "bWlncmF0ZWQtbG9naW4tY2hhbGxlbmdl";
const legacyOwnerSetupChallenge = "bGVnYWN5LW93bmVyLXNldHVwLWNoYWxsZW5nZQ";
const deleteChallenge = "ZGVsZXRlLWNoYWxsZW5nZQ";
const centralSessionIdHash = "Y2VudHJhbC1zZXNzaW9uLWhhc2g";
const grantId = "aGFuZG9mZi1ncmFudC0x";
const duplicateGrantId = "aGFuZG9mZi1ncmFudC0y";
const expiredGrantId = "ZXhwaXJlZC1oYW5kb2ZmLWdyYW50";
const grantSecretHash = "Z3JhbnQtc2VjcmV0LWhhc2g";
const duplicateGrantSecretHash = "Z3JhbnQtc2VjcmV0LWhhc2gtMg";
const expiredGrantSecretHash = "ZXhwaXJlZC1ncmFudC1zZWNyZXQtaGFzaA";
const nonceHash = "bm9uY2UtaGFzaA";
const state = "c3RhdGU";
const instanceId = "instance.example.com";
const principalId = "principal-1";
const targetOrigin = canonicalOrigin;
const routeId = "route:instance:admin";
const storageIdentity = "instance:control-plane";
const returnTo = "/settings?panel=routes";
const invitationId = "invitation:ada";
const revokedInvitationId = "invitation:grace";
const duplicateInvitationId = "invitation:duplicate";
const invitationRawToken = "aW52aXRlLXJhdy10b2tlbi0x";
const revokedInvitationRawToken = "aW52aXRlLXJhdy10b2tlbi0y";
const emailVerificationRawToken = "ZW1haWwtdmVyaWZpY2F0aW9uLXJhdy10b2tlbi0x";
const revokedEmailVerificationRawToken = "ZW1haWwtdmVyaWZpY2F0aW9uLXJhdy10b2tlbi0y";
const emailVerificationChallengeId = "email-verification:ada";
const revokedEmailVerificationChallengeId = "email-verification:grace";
const expiredEmailVerificationChallengeId = "email-verification:expired";
const credentialId = "Y3JlZGVudGlhbC0x";
const publicKey = [1, 2, 3, 4, 5];
const publicKeyBase64Url = "AQIDBAU";

let harness: Harness;
let instanceAuthHarnessDir: string | undefined;
let instanceAuthHarnessName: string;

beforeAll(async () => {
  harness = await createWorkerHarness(await writeInstanceAuthHarness(), {
    INSTANCE_AUTH_HARNESS: { className: "InstanceAuthHarness", useSQLite: true },
  });
});

beforeEach(() => {
  instanceAuthHarnessName = randomUUID();
});

afterAll(async () => {
  await harness.dispose();

  if (instanceAuthHarnessDir) {
    await rm(instanceAuthHarnessDir, { recursive: true, force: true });
    instanceAuthHarnessDir = undefined;
  }
});

describe("instance auth state", () => {
  it("stores normalized auth config with stable created timestamps", async () => {
    const first = await writeConfig({
      canonicalOrigin: "https://instance.example.com/",
      relyingPartyId: "EXAMPLE.com.",
      relyingPartyName,
      now: createdAt,
    });
    const second = await writeConfig({
      canonicalOrigin,
      relyingPartyId: "instance.example.com",
      relyingPartyName: "Formless Instance",
      now: updatedAt,
    });
    const stored = await getJson<{
      config: StoredInstanceAuthConfig | null;
    }>("/config");
    expect(first).toEqual({
      canonicalOrigin,
      relyingPartyId,
      relyingPartyName,
      createdAt,
      updatedAt: createdAt,
    });
    expect(second).toEqual({
      canonicalOrigin,
      relyingPartyId: "instance.example.com",
      relyingPartyName: "Formless Instance",
      createdAt,
      updatedAt,
    });
    expect(stored.config).toEqual(second);
  });

  it("rejects invalid auth config without mutating stored config", async () => {
    const first = await writeConfig({
      canonicalOrigin,
      relyingPartyId,
      relyingPartyName,
      now: createdAt,
    });
    const rejected = await fetchInstanceAuth("/config", {
      body: JSON.stringify({
        canonicalOrigin: "https://other.example.net",
        relyingPartyId,
        relyingPartyName,
        now: updatedAt,
      }),
      method: "POST",
    });
    const stored = await getJson<{
      config: StoredInstanceAuthConfig | null;
    }>("/config");
    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toEqual({
      error:
        "Instance auth relying-party id must match or be a parent domain of the canonical origin.",
    });
    expect(stored.config).toEqual(first);
  });
  it("repairs deployed setup-token challenge storage after the first migration was recorded", async () => {
    const migrated = await postJson<{
      appliedMigrations: Array<{
        migrationId: string;
        storageFamily: string;
      }>;
      indexSql: string;
      rows: Array<{
        id: string;
        kind: string;
        principal_id: string | null;
      }>;
      tableSql: string;
    }>("/migrate-principal-neutral-login-challenges", {});
    expect(migrated.appliedMigrations).toEqual([
      expect.objectContaining({
        migrationId: "2026-07-24-instance-auth-principal-neutral-login-challenges",
        storageFamily: "instance-auth",
      }),
      expect.objectContaining({
        migrationId: "2026-07-24-instance-auth-repair-legacy-passkey-challenges",
        storageFamily: "instance-auth",
      }),
    ]);
    expect(migrated.rows).toEqual([
      { id: "legacy-login", kind: "login", principal_id: null },
      { id: "legacy-registration", kind: "registration", principal_id: principalId },
    ]);
    expect(migrated.tableSql).toMatch(/kind\s*=\s*'login'\s+AND\s+principal_id\s+IS\s+NULL/i);
    expect(migrated.tableSql).not.toContain("setup_token_hash");
    expect(migrated.indexSql).toContain("instance_auth_challenges");
    expect(await readChallenge(legacyOwnerSetupChallenge)).toEqual({ challenge: null });
    expect(await readChallenge(loginChallenge)).toEqual({
      challenge: {
        challenge: loginChallenge,
        createdAt,
        expiresAt,
        id: "legacy-login",
        kind: "login",
      },
    });
    expect(await readChallenge(invitationRegistrationChallenge)).toEqual({
      challenge: {
        canonicalOrigin,
        challenge: invitationRegistrationChallenge,
        createdAt,
        expiresAt,
        id: "legacy-registration",
        invitationId,
        invitationTokenHash: "aW52aXRhdGlvbi10b2tlbi1oYXNo",
        kind: "registration",
        principalId,
        relyingPartyId,
      },
    });
    expect(
      await createChallenge({
        kind: "login",
        challenge: migratedLoginChallenge,
        createdAt,
        expiresAt,
      }),
    ).toEqual({
      challenge: {
        challenge: migratedLoginChallenge,
        createdAt,
        expiresAt,
        id: expect.any(String),
        kind: "login",
      },
      ok: true,
    });
  });

  it("creates, consumes, rejects replay, expires, and deletes passkey challenges", async () => {
    const invitationTokenHash = await hashInvitationToken(invitationRawToken);
    const invitationRegistration = await createChallenge({
      kind: "registration",
      challenge: invitationRegistrationChallenge,
      invitationId,
      invitationTokenHash,
      principalId,
      canonicalOrigin,
      relyingPartyId,
      createdAt,
      expiresAt,
    });
    const storedInvitationRegistration = await readChallenge(invitationRegistrationChallenge);
    const consumedInvitationRegistration = await consumeChallenge({
      kind: "registration",
      challenge: invitationRegistrationChallenge,
      now: updatedAt,
    });
    const replay = await consumeChallenge({
      kind: "registration",
      challenge: invitationRegistrationChallenge,
      now: updatedAt,
    });

    expect(invitationRegistration).toEqual({
      ok: true,
      challenge: {
        id: expect.any(String),
        kind: "registration",
        challenge: invitationRegistrationChallenge,
        invitationId,
        invitationTokenHash,
        principalId,
        canonicalOrigin,
        relyingPartyId,
        createdAt,
        expiresAt,
      },
    });
    expect(storedInvitationRegistration).toEqual({
      challenge: invitationRegistration.ok ? invitationRegistration.challenge : undefined,
    });
    expect(consumedInvitationRegistration).toEqual({
      ok: true,
      challenge: {
        ...(invitationRegistration.ok ? invitationRegistration.challenge : undefined),
        consumedAt: updatedAt,
      },
    });
    expect(replay).toEqual({
      ok: false,
      challenge: consumedInvitationRegistration.ok
        ? consumedInvitationRegistration.challenge
        : undefined,
      reason: "already-consumed",
    });

    await createChallenge({
      kind: "login",
      challenge: loginChallenge,
      createdAt,
      expiresAt: expiredAt,
    });

    const expired = await consumeChallenge({
      kind: "login",
      challenge: loginChallenge,
      now: updatedAt,
    });
    const expiredCount = await postJson<{
      expired: number;
    }>("/expire", { now: updatedAt });
    expect(expired).toEqual({
      ok: false,
      challenge: {
        id: expect.any(String),
        kind: "login",
        challenge: loginChallenge,
        createdAt,
        expiresAt: expiredAt,
      },
      reason: "expired-challenge",
    });
    expect(expiredCount).toEqual({ expired: 1 });
    expect(await readChallenge(loginChallenge)).toEqual({ challenge: null });

    await createChallenge({
      kind: "login",
      challenge: deleteChallenge,
      createdAt,
      expiresAt,
    });
    expect(
      await postJson<{
        deleted: boolean;
      }>("/delete-challenge", { challenge: deleteChallenge }),
    ).toEqual({ deleted: true });
    expect(await readChallenge(deleteChallenge)).toEqual({ challenge: null });
  });

  it("prevents duplicate passkey credentials and updates verification facts", async () => {
    const created = await createCredential();
    const duplicate = await createCredential({ principalId: "principal-2" });
    const updated = await updateCredentialVerification({
      credentialId,
      counter: 9,
      credentialBackedUp: true,
      credentialDeviceType: "multiDevice",
      origin: canonicalOrigin,
      relyingPartyId,
      userVerified: true,
      verifiedAt: updatedAt,
    });
    const regression = await updateCredentialVerification({
      credentialId,
      counter: 8,
      credentialBackedUp: true,
      credentialDeviceType: "multiDevice",
      origin: canonicalOrigin,
      relyingPartyId,
      userVerified: true,
      verifiedAt: "2026-05-21T00:10:00.000Z",
    });
    const stored = await readCredential(credentialId);
    const principalCredentials = await getJson<{
      credentials: StoredPasskeyCredential[];
    }>(`/credentials?principalId=${principalId}`);
    const webauthnCredential = await getJson<{
      credential: {
        counter: number;
        id: string;
        publicKey: number[];
        transports?: string[];
      };
    }>(`/webauthn-credential?id=${credentialId}`);
    expect(created).toEqual({
      ok: true,
      credential: {
        credentialId,
        principalId,
        publicKeyBase64Url,
        counter: 3,
        transports: ["internal", "hybrid"],
        credentialDeviceType: "singleDevice",
        credentialBackedUp: false,
        createdAt,
        updatedAt: createdAt,
      },
    });
    expect(duplicate).toEqual({
      ok: false,
      credential: created.ok ? created.credential : undefined,
      reason: "duplicate-credential-id",
    });
    expect(updated).toEqual({
      ok: true,
      credential: {
        ...(created.ok ? created.credential : undefined),
        counter: 9,
        credentialDeviceType: "multiDevice",
        credentialBackedUp: true,
        userVerified: true,
        lastVerifiedAt: updatedAt,
        lastVerificationOrigin: canonicalOrigin,
        lastVerificationRelyingPartyId: relyingPartyId,
        updatedAt,
      },
    });
    expect(regression).toEqual({
      ok: false,
      credential: updated.ok ? updated.credential : undefined,
      reason: "counter-regression",
    });
    expect(stored.credential).toEqual(updated.ok ? updated.credential : undefined);
    expect(principalCredentials.credentials).toEqual([updated.ok ? updated.credential : undefined]);
    expect(webauthnCredential.credential).toEqual({
      id: credentialId,
      publicKey,
      counter: 9,
      transports: ["internal", "hybrid"],
    });
  });

  it("stores central auth sessions and host revocation versions as private auth state", async () => {
    const created = await createCentralSession();
    const duplicate = await createCentralSession({ principalId: "principal-2" });
    const revoked = await revokeCentralSession(centralSessionIdHash, updatedAt);
    const storedSession = await readCentralSession(centralSessionIdHash);
    const missingVersion = await readHostSessionRevocationVersion();
    const firstVersion = await bumpHostSessionRevocationVersion(createdAt);
    const secondVersion = await bumpHostSessionRevocationVersion(updatedAt);
    const storedVersion = await readHostSessionRevocationVersion();

    expect(created).toEqual({
      ok: true,
      session: {
        sessionIdHash: centralSessionIdHash,
        instanceId,
        principalId,
        issuedAt: createdAt,
        expiresAt,
      },
    });
    expect(duplicate).toEqual({
      ok: false,
      reason: "duplicate-session",
      session: created.ok ? created.session : undefined,
    });
    expect(revoked).toEqual({
      ok: true,
      session: {
        ...(created.ok ? created.session : undefined),
        revokedAt: updatedAt,
      },
    });
    expect(storedSession.session).toEqual(revoked.ok ? revoked.session : undefined);
    expect(missingVersion.version).toBeNull();
    expect(firstVersion).toEqual({
      access: "authenticated",
      instanceId,
      principalId,
      targetOrigin,
      routeId,
      targetProfile: "instance",
      storageIdentity,
      sessionVersion: 1,
      updatedAt: createdAt,
    });
    expect(secondVersion).toEqual({
      ...firstVersion,
      sessionVersion: 2,
      updatedAt,
    });
    expect(storedVersion.version).toEqual(secondVersion);
  });

  it("stores one-time handoff grants with hashed secrets and consumed status", async () => {
    const created = await createHandoffGrant();
    const duplicateBySecret = await createHandoffGrant({
      grantId: duplicateGrantId,
      grantSecretHash,
    });
    const consumed = await consumeHandoffGrant(grantId, updatedAt);
    const replay = await consumeHandoffGrant(grantId, updatedAt);
    const stored = await readHandoffGrant(grantId);

    await createHandoffGrant({
      grantId: expiredGrantId,
      grantSecretHash: expiredGrantSecretHash,
      expiresAt: expiredAt,
    });

    const expired = await consumeHandoffGrant(expiredGrantId, updatedAt);
    const rejectedUnsafeReturn = await fetchInstanceAuth("/handoff-grant", {
      body: JSON.stringify({
        ...handoffGrantInput(),
        grantId: "dW5zYWZlLXJldHVybg",
        grantSecretHash: duplicateGrantSecretHash,
        returnTo: "https://example.com/settings",
      }),
      method: "POST",
    });

    expect(created).toEqual({
      ok: true,
      grant: {
        access: "authenticated",
        grantId,
        grantSecretHash,
        instanceId,
        principalId,
        targetOrigin,
        routeId,
        targetProfile: "instance",
        storageIdentity,
        returnTo,
        nonceHash,
        state,
        createdAt,
        expiresAt,
      },
    });
    expect(duplicateBySecret).toEqual({
      ok: false,
      grant: created.ok ? created.grant : undefined,
      reason: "duplicate-grant-secret-hash",
    });
    expect(consumed).toEqual({
      ok: true,
      grant: {
        ...(created.ok ? created.grant : undefined),
        consumedAt: updatedAt,
      },
    });
    expect(replay).toEqual({
      ok: false,
      grant: consumed.ok ? consumed.grant : undefined,
      reason: "already-consumed",
    });
    expect(stored.grant).toEqual(consumed.ok ? consumed.grant : undefined);
    expect(expired).toEqual({
      ok: false,
      grant: {
        ...(created.ok ? created.grant : undefined),
        grantId: expiredGrantId,
        grantSecretHash: expiredGrantSecretHash,
        expiresAt: expiredAt,
      },
      reason: "expired-grant",
    });
    expect(rejectedUnsafeReturn.status).toBe(400);
    expect(await rejectedUnsafeReturn.json()).toEqual({
      error: "Handoff grant return target must be a safe path-only redirect target.",
    });
  });

  it("stores collaborator invitation token hashes with target binding and builds auth-origin links", async () => {
    const tokenHash = await hashInvitationToken(invitationRawToken);
    const revokedTokenHash = await hashInvitationToken(revokedInvitationRawToken);
    const created = await createInvitationToken({
      invitationId,
      tokenHash,
      targetEmail: "Ada@Example.COM",
      targetSurface: "instance",
    });
    const duplicateByInvitation = await createInvitationToken({
      invitationId,
      tokenHash: revokedTokenHash,
      targetEmail: "grace@example.com",
      targetSurface: "instance",
    });
    const duplicateByHash = await createInvitationToken({
      invitationId: duplicateInvitationId,
      tokenHash,
      targetEmail: "grace@example.com",
      targetSurface: "instance",
    });
    const link = await buildInvitationLink({
      authOrigin: `${canonicalOrigin}/`,
      invitationId,
      token: invitationRawToken,
    });
    const wrongToken = await consumeInvitationToken({
      invitationId,
      tokenHash: revokedTokenHash,
      now: updatedAt,
    });
    const wrongTarget = await consumeInvitationToken({
      invitationId,
      tokenHash,
      target: {
        targetSurface: "organization",
        targetOrganization: "organization:ops",
      },
      now: updatedAt,
    });
    const wrongEmail = await consumeInvitationToken({
      invitationId,
      tokenHash,
      targetEmail: "grace@example.com",
      now: updatedAt,
    });
    const consumed = await consumeInvitationToken({
      invitationId,
      tokenHash,
      target: {
        targetSurface: "instance",
      },
      targetEmail: "ada@example.com",
      now: updatedAt,
    });
    const replay = await consumeInvitationToken({
      invitationId,
      tokenHash,
      now: updatedAt,
    });
    const stored = await readInvitationToken(invitationId);
    const session = await createCentralSession();
    const grant = await createHandoffGrant();

    await createInvitationToken({
      invitationId: revokedInvitationId,
      tokenHash: revokedTokenHash,
      targetEmail: "grace@example.com",
      targetSurface: "instance",
    });

    const revoked = await revokeInvitationToken(revokedInvitationId, updatedAt);
    const consumedRevoked = await consumeInvitationToken({
      invitationId: revokedInvitationId,
      tokenHash: revokedTokenHash,
      now: updatedAt,
    });

    expect(created).toEqual({
      ok: true,
      token: {
        invitationId,
        tokenHash,
        normalizedTargetEmail: "ada@example.com",
        targetSurface: "instance",
        createdAt,
        expiresAt,
      },
    });
    expect(duplicateByInvitation).toEqual({
      ok: false,
      reason: "duplicate-invitation-id",
      token: created.ok ? created.token : undefined,
    });
    expect(duplicateByHash).toEqual({
      ok: false,
      reason: "duplicate-token-hash",
      token: created.ok ? created.token : undefined,
    });
    expect(link).toBe(
      `${canonicalOrigin}/formless/auth/invitations/accept?invitationId=invitation%3Aada&token=${invitationRawToken}`,
    );
    expect(new URL(link).searchParams.has("redirectTo")).toBe(false);
    expect(new URL(link).pathname).not.toContain("setup");
    expect(new URL(link).pathname).not.toContain("passkey");
    expect(wrongToken).toEqual({
      ok: false,
      reason: "wrong-token",
      token: created.ok ? created.token : undefined,
    });
    expect(wrongTarget).toEqual({
      ok: false,
      reason: "wrong-target",
      token: created.ok ? created.token : undefined,
    });
    expect(wrongEmail).toEqual({
      ok: false,
      reason: "wrong-target-email",
      token: created.ok ? created.token : undefined,
    });
    expect(consumed).toEqual({
      ok: true,
      token: {
        ...(created.ok ? created.token : undefined),
        consumedAt: updatedAt,
      },
    });
    expect(replay).toEqual({
      ok: false,
      reason: "already-consumed",
      token: consumed.ok ? consumed.token : undefined,
    });
    expect(stored.token).toEqual(consumed.ok ? consumed.token : undefined);
    expect(revoked).toEqual({
      ok: true,
      token: {
        invitationId: revokedInvitationId,
        tokenHash: revokedTokenHash,
        normalizedTargetEmail: "grace@example.com",
        targetSurface: "instance",
        createdAt,
        expiresAt,
        revokedAt: updatedAt,
      },
    });
    expect(consumedRevoked).toEqual({
      ok: false,
      reason: "revoked-token",
      token: revoked.ok ? revoked.token : undefined,
    });

    const privateAuthSessionState = JSON.stringify([session, grant]);

    expect(JSON.stringify([created, consumed, revoked])).not.toContain(invitationRawToken);
    expect(privateAuthSessionState).not.toContain(invitationRawToken);
    expect(privateAuthSessionState).not.toContain(tokenHash);
  });

  it("stores email verification challenge hashes with target binding and consumed or revoked status", async () => {
    const tokenHash = await hashEmailVerificationToken(emailVerificationRawToken);
    const revokedTokenHash = await hashEmailVerificationToken(revokedEmailVerificationRawToken);
    const created = await createEmailVerificationChallenge({
      authOrigin: `${canonicalOrigin}/`,
      challengeId: emailVerificationChallengeId,
      createdAt,
      email: "Ada@Example.COM",
      expiresAt,
      idempotencyKey: "email-verification:ada",
      principalId,
      purpose: "account-completion",
      target: accountCompletionTarget(),
      tokenHash,
    });
    const replayedCreate = await createEmailVerificationChallenge({
      authOrigin: canonicalOrigin,
      challengeId: "email-verification:ada-replay",
      createdAt,
      email: "ada@example.com",
      expiresAt,
      idempotencyKey: "email-verification:ada",
      principalId,
      purpose: "account-completion",
      target: accountCompletionTarget(),
      tokenHash: revokedTokenHash,
    });
    const link = await buildEmailVerificationLink({
      authOrigin: canonicalOrigin,
      challengeId: emailVerificationChallengeId,
      token: emailVerificationRawToken,
    });
    const wrongToken = await validateEmailVerificationChallenge({
      challengeId: emailVerificationChallengeId,
      email: "ada@example.com",
      now: updatedAt,
      principalId,
      purpose: "account-completion",
      target: accountCompletionTarget(),
      tokenHash: revokedTokenHash,
    });
    const wrongEmail = await validateEmailVerificationChallenge({
      challengeId: emailVerificationChallengeId,
      email: "grace@example.com",
      now: updatedAt,
      principalId,
      purpose: "account-completion",
      target: accountCompletionTarget(),
      tokenHash,
    });
    const wrongTarget = await validateEmailVerificationChallenge({
      challengeId: emailVerificationChallengeId,
      email: "ada@example.com",
      now: updatedAt,
      principalId,
      purpose: "account-completion",
      target: { ...accountCompletionTarget(), storageIdentity: "instance:other" },
      tokenHash,
    });
    const validated = await validateEmailVerificationChallenge({
      challengeId: emailVerificationChallengeId,
      email: "ada@example.com",
      now: updatedAt,
      principalId,
      purpose: "account-completion",
      target: accountCompletionTarget(),
      tokenHash,
    });
    const consumed = await consumeEmailVerificationChallenge({
      challengeId: emailVerificationChallengeId,
      email: "ada@example.com",
      now: updatedAt,
      principalId,
      purpose: "account-completion",
      target: accountCompletionTarget(),
      tokenHash,
    });
    const replay = await consumeEmailVerificationChallenge({
      challengeId: emailVerificationChallengeId,
      email: "ada@example.com",
      now: updatedAt,
      principalId,
      purpose: "account-completion",
      target: accountCompletionTarget(),
      tokenHash,
    });
    const stored = await readEmailVerificationChallenge(emailVerificationChallengeId);

    await createEmailVerificationChallenge({
      authOrigin: canonicalOrigin,
      challengeId: expiredEmailVerificationChallengeId,
      createdAt,
      email: "expired@example.com",
      expiresAt: expiredAt,
      idempotencyKey: "email-verification:expired",
      principalId,
      purpose: "account-completion",
      target: accountCompletionTarget(),
      tokenHash: await hashEmailVerificationToken("ZXhwaXJlZC1lbWFpbC12ZXJpZmljYXRpb24"),
    });

    const expired = await consumeEmailVerificationChallenge({
      challengeId: expiredEmailVerificationChallengeId,
      email: "expired@example.com",
      now: updatedAt,
      principalId,
      purpose: "account-completion",
      target: accountCompletionTarget(),
      tokenHash: await hashEmailVerificationToken("ZXhwaXJlZC1lbWFpbC12ZXJpZmljYXRpb24"),
    });

    await createEmailVerificationChallenge({
      authOrigin: canonicalOrigin,
      challengeId: revokedEmailVerificationChallengeId,
      createdAt,
      email: "grace@example.com",
      expiresAt,
      idempotencyKey: "email-verification:grace",
      principalId,
      purpose: "account-completion",
      target: accountCompletionTarget(),
      tokenHash: revokedTokenHash,
    });

    const revoked = await revokeEmailVerificationChallenge(
      revokedEmailVerificationChallengeId,
      updatedAt,
    );
    const consumedRevoked = await consumeEmailVerificationChallenge({
      challengeId: revokedEmailVerificationChallengeId,
      email: "grace@example.com",
      now: updatedAt,
      principalId,
      purpose: "account-completion",
      target: accountCompletionTarget(),
      tokenHash: revokedTokenHash,
    });

    expect(created).toEqual({
      ok: true,
      replayed: false,
      challenge: {
        ...accountCompletionTarget(),
        authOrigin: canonicalOrigin,
        challengeId: emailVerificationChallengeId,
        createdAt,
        displayEmail: "Ada@example.com",
        expiresAt,
        idempotencyKey: "email-verification:ada",
        normalizedEmail: "ada@example.com",
        principalId,
        purpose: "account-completion",
        tokenHash,
      },
    });
    expect(replayedCreate).toEqual({
      ok: true,
      replayed: true,
      challenge: created.ok ? created.challenge : undefined,
    });
    expect(link).toBe(
      `${canonicalOrigin}/formless/auth/email-verification?challengeId=email-verification%3Aada&token=${emailVerificationRawToken}`,
    );
    expect(wrongToken).toEqual({
      ok: false,
      challenge: created.ok ? created.challenge : undefined,
      reason: "wrong-token",
    });
    expect(wrongEmail).toEqual({
      ok: false,
      challenge: created.ok ? created.challenge : undefined,
      reason: "wrong-email",
    });
    expect(wrongTarget).toEqual({
      ok: false,
      challenge: created.ok ? created.challenge : undefined,
      reason: "wrong-target",
    });
    expect(validated).toEqual({
      ok: true,
      challenge: created.ok ? created.challenge : undefined,
    });
    expect(consumed).toEqual({
      ok: true,
      challenge: {
        ...(created.ok ? created.challenge : undefined),
        consumedAt: updatedAt,
      },
    });
    expect(replay).toEqual({
      ok: false,
      challenge: consumed.ok ? consumed.challenge : undefined,
      reason: "already-consumed",
    });
    expect(stored.challenge).toEqual(consumed.ok ? consumed.challenge : undefined);
    expect(expired).toEqual({
      ok: false,
      challenge: expect.objectContaining({
        challengeId: expiredEmailVerificationChallengeId,
        expiresAt: expiredAt,
      }),
      reason: "expired-challenge",
    });
    expect(revoked).toEqual({
      ok: true,
      challenge: expect.objectContaining({
        challengeId: revokedEmailVerificationChallengeId,
        revokedAt: updatedAt,
      }),
    });
    expect(consumedRevoked).toEqual({
      ok: false,
      challenge: revoked.ok ? revoked.challenge : undefined,
      reason: "revoked-challenge",
    });
    expect(JSON.stringify([created, consumed, revoked])).not.toContain(emailVerificationRawToken);
    expect(JSON.stringify([created, consumed, revoked])).not.toContain(
      revokedEmailVerificationRawToken,
    );
  });

  it("reports missing credentials before verification facts are updated", async () => {
    expect(
      await updateCredentialVerification({
        credentialId,
        counter: 1,
        credentialBackedUp: false,
        credentialDeviceType: "singleDevice",
        origin: canonicalOrigin,
        relyingPartyId,
        userVerified: false,
        verifiedAt: updatedAt,
      }),
    ).toEqual({
      ok: false,
      reason: "missing-credential",
    });
  });
});

function writeConfig(input: {
  canonicalOrigin: string;
  relyingPartyId: string;
  relyingPartyName: string;
  now: string;
}) {
  return postJson<StoredInstanceAuthConfig>("/config", input);
}

function createChallenge(input: unknown) {
  return postJson<CreatePasskeyChallengeResult>("/challenge", input);
}

function consumeChallenge(input: unknown) {
  return postJson<ConsumePasskeyChallengeResult>("/consume", input);
}
function readChallenge(challenge: string) {
  return getJson<{
    challenge: StoredPasskeyChallenge | null;
  }>(`/challenge?challenge=${challenge}`);
}
function createCredential(
  overrides: Partial<{
    principalId: string;
  }> = {},
) {
  return postJson<CreatePasskeyCredentialResult>("/credential", {
    credentialId,
    principalId: overrides.principalId ?? principalId,
    publicKey,
    counter: 3,
    transports: ["internal", "hybrid"],
    credentialDeviceType: "singleDevice",
    credentialBackedUp: false,
    createdAt,
  });
}

function updateCredentialVerification(input: unknown) {
  return postJson<UpdatePasskeyCredentialVerificationResult>("/credential/verify", input);
}
function readCredential(id: string) {
  return getJson<{
    credential: StoredPasskeyCredential | null;
  }>(`/credential?id=${id}`);
}
function createCentralSession(
  overrides: Partial<{
    principalId: string;
  }> = {},
) {
  return postJson<CreateCentralAuthSessionResult>("/central-session", {
    sessionIdHash: centralSessionIdHash,
    instanceId,
    principalId: overrides.principalId ?? principalId,
    issuedAt: createdAt,
    expiresAt,
  });
}
function readCentralSession(idHash: string) {
  return getJson<{
    session: StoredCentralAuthSession | null;
  }>(`/central-session?idHash=${idHash}`);
}
function revokeCentralSession(idHash: string, now: string) {
  return postJson<RevokeCentralAuthSessionResult>("/central-session/revoke", { idHash, now });
}
function readHostSessionRevocationVersion() {
  return getJson<{
    version: StoredHostSessionRevocationVersion | null;
  }>(`/host-session-version?${new URLSearchParams(hostSessionTarget()).toString()}`);
}
function bumpHostSessionRevocationVersion(now: string) {
  return postJson<StoredHostSessionRevocationVersion>("/host-session-version/bump", {
    ...hostSessionTarget(),
    now,
  });
}

function createHandoffGrant(overrides: Partial<ReturnType<typeof handoffGrantInput>> = {}) {
  return postJson<CreateHandoffGrantResult>("/handoff-grant", {
    ...handoffGrantInput(),
    ...overrides,
  });
}
function readHandoffGrant(id: string) {
  return getJson<{
    grant: StoredHandoffGrant | null;
  }>(`/handoff-grant?id=${id}`);
}
function consumeHandoffGrant(id: string, now: string) {
  return postJson<ConsumeHandoffGrantResult>("/handoff-grant/consume", { grantId: id, now });
}

function createInvitationToken(input: Record<string, unknown>) {
  return postJson<CreateCollaboratorInvitationTokenResult>("/invitation-token", {
    createdAt,
    expiresAt,
    ...input,
  });
}
function readInvitationToken(id: string) {
  return getJson<{
    token: StoredCollaboratorInvitationToken | null;
  }>(`/invitation-token?invitationId=${encodeURIComponent(id)}`);
}
function consumeInvitationToken(input: unknown) {
  return postJson<ConsumeCollaboratorInvitationTokenResult>("/invitation-token/consume", input);
}

function revokeInvitationToken(id: string, now: string) {
  return postJson<RevokeCollaboratorInvitationTokenResult>("/invitation-token/revoke", {
    invitationId: id,
    now,
  });
}

function buildInvitationLink(input: unknown) {
  return postJson<string>("/invitation-link", input);
}

function buildEmailVerificationLink(input: unknown) {
  return postJson<string>("/email-verification-link", input);
}

function createEmailVerificationChallenge(input: Record<string, unknown>) {
  return postJson<CreateEmailVerificationChallengeResult>("/email-verification-challenge", input);
}
function readEmailVerificationChallenge(id: string) {
  return getJson<{
    challenge: StoredEmailVerificationChallenge | null;
  }>(`/email-verification-challenge?challengeId=${encodeURIComponent(id)}`);
}
function validateEmailVerificationChallenge(input: unknown) {
  return postJson<ValidateEmailVerificationChallengeResult>(
    "/email-verification-challenge/validate",
    input,
  );
}

function consumeEmailVerificationChallenge(input: unknown) {
  return postJson<ConsumeEmailVerificationChallengeResult>(
    "/email-verification-challenge/consume",
    input,
  );
}

function revokeEmailVerificationChallenge(id: string, now: string) {
  return postJson<RevokeEmailVerificationChallengeResult>("/email-verification-challenge/revoke", {
    challengeId: id,
    now,
  });
}
async function hashInvitationToken(token: string) {
  const body = await getJson<{
    hash: string;
  }>(`/invitation-token/hash?token=${encodeURIComponent(token)}`);
  return body.hash;
}
async function hashEmailVerificationToken(token: string) {
  const body = await getJson<{
    hash: string;
  }>(`/email-verification-token/hash?token=${encodeURIComponent(token)}`);
  return body.hash;
}
function handoffGrantInput() {
  return {
    access: "authenticated",
    grantId,
    grantSecretHash,
    instanceId,
    principalId,
    targetOrigin,
    routeId,
    targetProfile: "instance",
    storageIdentity,
    returnTo,
    nonceHash,
    state,
    createdAt,
    expiresAt,
  };
}

function accountCompletionTarget() {
  return {
    returnTo: "/formless/auth",
    routeId,
    storageIdentity,
    targetOrigin,
    targetProfile: "instance",
  };
}

function hostSessionTarget() {
  return {
    access: "authenticated",
    instanceId,
    principalId,
    targetOrigin,
    routeId,
    targetProfile: "instance",
    storageIdentity,
  };
}

async function getJson<T>(path: string) {
  const response = await fetchInstanceAuth(path);

  expect(response.status).toBe(200);

  return (await response.json()) as T;
}

async function postJson<T>(path: string, body: unknown) {
  const response = await fetchInstanceAuth(path, {
    body: JSON.stringify(body),
    method: "POST",
  });

  expect(response.status).toBe(200);

  return (await response.json()) as T;
}

function fetchInstanceAuth(path: string, init: Parameters<Harness["fetch"]>[1] = {}) {
  return harness.fetch(path, {
    ...init,
    headers: { "x-instance-auth-harness-name": instanceAuthHarnessName },
  });
}

async function writeInstanceAuthHarness() {
  instanceAuthHarnessDir = await mkdtemp(join(tmpdir(), "formless-instance-auth-harness-"));
  const tempDir = instanceAuthHarnessDir;
  const harnessPath = join(tempDir, "instance-auth-harness.ts");

  await writeFile(
    harnessPath,
    `
      import { DurableObject } from "cloudflare:workers";
      import {
        buildCollaboratorInvitationLink,
        buildEmailVerificationLink,
        bumpHostSessionRevocationVersion,
        consumeCollaboratorInvitationToken,
        consumeEmailVerificationChallenge,
        consumeHandoffGrant,
        consumePasskeyChallenge,
        createCentralAuthSession,
        createCollaboratorInvitationToken,
        createEmailVerificationChallenge,
        createHandoffGrant,
        createPasskeyChallenge,
        createPasskeyCredential,
        deletePasskeyChallenge,
        ensureInstanceAuthTables,
        expirePasskeyChallenges,
        hashCollaboratorInvitationToken,
        hashEmailVerificationToken,
        passkeyCredentialToWebAuthnCredential,
        readCentralAuthSession,
        readCollaboratorInvitationToken,
        readEmailVerificationChallenge,
        readHandoffGrant,
        readHostSessionRevocationVersion,
        readInstanceAuthConfig,
        readPasskeyChallenge,
        readPasskeyCredential,
        readPasskeyCredentialsForPrincipal,
        revokeCollaboratorInvitationToken,
        revokeEmailVerificationChallenge,
        revokeCentralAuthSession,
        updatePasskeyCredentialVerification,
        validateEmailVerificationChallenge,
        writeInstanceAuthConfig,
      } from "${process.cwd()}/src/worker/instance-auth-state.ts";
      import {
        readAppliedSqlMigrations,
        storageSqlMigrationFamily,
      } from "${process.cwd()}/src/worker/sql-migrations.ts";

      export class InstanceAuthHarness extends DurableObject {
        constructor(ctx, env) {
          super(ctx, env);
          ensureInstanceAuthTables(ctx.storage);
        }

        async fetch(request) {
          const url = new URL(request.url);

          try {
            if (request.method === "GET" && url.pathname === "/config") {
              return Response.json({ config: readInstanceAuthConfig(this.ctx.storage) ?? null });
            }

            if (request.method === "POST" && url.pathname === "/config") {
              return Response.json(writeInstanceAuthConfig(this.ctx.storage, await request.json()));
            }

            if (request.method === "POST" && url.pathname === "/central-session") {
              return Response.json(createCentralAuthSession(this.ctx.storage, await request.json()));
            }

            if (request.method === "GET" && url.pathname === "/central-session") {
              return Response.json({
                session: readCentralAuthSession(this.ctx.storage, url.searchParams.get("idHash")) ?? null,
              });
            }

            if (request.method === "POST" && url.pathname === "/central-session/revoke") {
              const body = await request.json();

              return Response.json(
                revokeCentralAuthSession(this.ctx.storage, body.idHash, body.now),
              );
            }

            if (request.method === "GET" && url.pathname === "/host-session-version") {
              return Response.json({
                version: readHostSessionRevocationVersion(
                  this.ctx.storage,
                  targetBindingFromSearch(url),
                ) ?? null,
              });
            }

            if (request.method === "POST" && url.pathname === "/host-session-version/bump") {
              return Response.json(
                bumpHostSessionRevocationVersion(this.ctx.storage, await request.json()),
              );
            }

            if (request.method === "POST" && url.pathname === "/handoff-grant") {
              return Response.json(createHandoffGrant(this.ctx.storage, await request.json()));
            }

            if (request.method === "GET" && url.pathname === "/handoff-grant") {
              return Response.json({
                grant: readHandoffGrant(this.ctx.storage, url.searchParams.get("id")) ?? null,
              });
            }

            if (request.method === "POST" && url.pathname === "/handoff-grant/consume") {
              return Response.json(consumeHandoffGrant(this.ctx.storage, await request.json()));
            }

            if (request.method === "POST" && url.pathname === "/invitation-token") {
              return Response.json(
                createCollaboratorInvitationToken(this.ctx.storage, await request.json()),
              );
            }

            if (request.method === "GET" && url.pathname === "/invitation-token") {
              return Response.json({
                token:
                  readCollaboratorInvitationToken(
                    this.ctx.storage,
                    url.searchParams.get("invitationId"),
                  ) ?? null,
              });
            }

            if (request.method === "POST" && url.pathname === "/invitation-token/consume") {
              return Response.json(
                consumeCollaboratorInvitationToken(this.ctx.storage, await request.json()),
              );
            }

            if (request.method === "POST" && url.pathname === "/invitation-token/revoke") {
              const body = await request.json();

              return Response.json(
                revokeCollaboratorInvitationToken(this.ctx.storage, body.invitationId, body.now),
              );
            }

            if (request.method === "GET" && url.pathname === "/invitation-token/hash") {
              return Response.json({
                hash: await hashCollaboratorInvitationToken(url.searchParams.get("token")),
              });
            }

            if (request.method === "POST" && url.pathname === "/email-verification-challenge") {
              return Response.json(
                createEmailVerificationChallenge(this.ctx.storage, await request.json()),
              );
            }

            if (request.method === "GET" && url.pathname === "/email-verification-challenge") {
              return Response.json({
                challenge:
                  readEmailVerificationChallenge(
                    this.ctx.storage,
                    url.searchParams.get("challengeId"),
                  ) ?? null,
              });
            }

            if (
              request.method === "POST" &&
              url.pathname === "/email-verification-challenge/validate"
            ) {
              return Response.json(
                validateEmailVerificationChallenge(this.ctx.storage, await request.json()),
              );
            }

            if (
              request.method === "POST" &&
              url.pathname === "/email-verification-challenge/consume"
            ) {
              return Response.json(
                consumeEmailVerificationChallenge(this.ctx.storage, await request.json()),
              );
            }

            if (
              request.method === "POST" &&
              url.pathname === "/email-verification-challenge/revoke"
            ) {
              const body = await request.json();

              return Response.json(
                revokeEmailVerificationChallenge(this.ctx.storage, body.challengeId, body.now),
              );
            }

            if (request.method === "GET" && url.pathname === "/email-verification-token/hash") {
              return Response.json({
                hash: await hashEmailVerificationToken(url.searchParams.get("token")),
              });
            }

            if (request.method === "POST" && url.pathname === "/invitation-link") {
              return Response.json(buildCollaboratorInvitationLink(await request.json()));
            }

            if (request.method === "POST" && url.pathname === "/email-verification-link") {
              return Response.json(buildEmailVerificationLink(await request.json()));
            }

            if (
              request.method === "POST" &&
              url.pathname === "/migrate-principal-neutral-login-challenges"
            ) {
              this.ctx.storage.transactionSync(() => {
                this.ctx.storage.sql.exec(
                  "DROP INDEX IF EXISTS idx_instance_auth_challenges_expires_at",
                );
                this.ctx.storage.sql.exec("DROP TABLE instance_auth_challenges");
                this.ctx.storage.sql.exec(
                  "DELETE FROM formless_applied_sql_migrations WHERE storage_family = 'instance-auth'",
                );
                this.ctx.storage.sql.exec(\`
                  CREATE TABLE instance_auth_challenges (
                    id TEXT PRIMARY KEY,
                    kind TEXT NOT NULL CHECK (kind IN ('login', 'registration')),
                    challenge TEXT NOT NULL UNIQUE,
                    invitation_id TEXT,
                    invitation_token_hash TEXT,
                    setup_token_hash TEXT,
                    principal_id TEXT,
                    registration_origin TEXT,
                    registration_relying_party_id TEXT,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    consumed_at TEXT,
                    CHECK (
                      (
                        kind = 'registration'
                        AND setup_token_hash IS NOT NULL
                        AND principal_id IS NULL
                        AND invitation_id IS NULL
                        AND invitation_token_hash IS NULL
                        AND registration_origin IS NULL
                        AND registration_relying_party_id IS NULL
                      )
                      OR
                      (
                        kind = 'registration'
                        AND setup_token_hash IS NULL
                        AND principal_id IS NOT NULL
                        AND invitation_id IS NOT NULL
                        AND invitation_token_hash IS NOT NULL
                        AND registration_origin IS NOT NULL
                        AND registration_relying_party_id IS NOT NULL
                      )
                      OR
                      (
                        kind = 'login'
                        AND setup_token_hash IS NULL
                        AND principal_id IS NOT NULL
                        AND invitation_id IS NULL
                        AND invitation_token_hash IS NULL
                        AND registration_origin IS NULL
                        AND registration_relying_party_id IS NULL
                      )
                    )
                  );
                  CREATE INDEX idx_instance_auth_challenges_expires_at
                    ON instance_auth_challenges (expires_at);
                  INSERT INTO formless_applied_sql_migrations (
                    storage_family,
                    migration_id,
                    checksum,
                    package_version,
                    applied_at
                  )
                  VALUES (
                    'instance-auth',
                    '2026-07-24-instance-auth-principal-neutral-login-challenges',
                    'sha256:a067010dfdd1d5d38eb6d312fc9c1a1516ec7ab9caa315049210751c236164d8',
                    NULL,
                    '2026-07-24T00:00:00.000Z'
                  );
                  INSERT INTO instance_auth_challenges (
                    id,
                    kind,
                    challenge,
                    invitation_id,
                    invitation_token_hash,
                    setup_token_hash,
                    principal_id,
                    registration_origin,
                    registration_relying_party_id,
                    created_at,
                    expires_at,
                    consumed_at
                  )
                  VALUES
                    (
                      'legacy-owner-setup',
                      'registration',
                      '${legacyOwnerSetupChallenge}',
                      NULL,
                      NULL,
                      'c2V0dXAtdG9rZW4taGFzaA',
                      NULL,
                      NULL,
                      NULL,
                      '${createdAt}',
                      '${expiresAt}',
                      NULL
                    ),
                    (
                      'legacy-login',
                      'login',
                      '${loginChallenge}',
                      NULL,
                      NULL,
                      NULL,
                      '${principalId}',
                      NULL,
                      NULL,
                      '${createdAt}',
                      '${expiresAt}',
                      NULL
                    ),
                    (
                      'legacy-registration',
                      'registration',
                      '${invitationRegistrationChallenge}',
                      '${invitationId}',
                      'aW52aXRhdGlvbi10b2tlbi1oYXNo',
                      NULL,
                      '${principalId}',
                      '${canonicalOrigin}',
                      '${relyingPartyId}',
                      '${createdAt}',
                      '${expiresAt}',
                      NULL
                    );
                \`);
              });

              ensureInstanceAuthTables(this.ctx.storage);

              return Response.json({
                appliedMigrations: readAppliedSqlMigrations(
                  this.ctx.storage,
                  storageSqlMigrationFamily("instance-auth"),
                ),
                indexSql: this.ctx.storage.sql
                  .exec(
                    "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_instance_auth_challenges_expires_at'",
                  )
                  .one().sql,
                rows: this.ctx.storage.sql
                  .exec(
                    "SELECT id, kind, principal_id FROM instance_auth_challenges ORDER BY id ASC",
                  )
                  .toArray(),
                tableSql: this.ctx.storage.sql
                  .exec(
                    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'instance_auth_challenges'",
                  )
                  .one().sql,
              });
            }

            if (request.method === "POST" && url.pathname === "/challenge") {
              return Response.json(createPasskeyChallenge(this.ctx.storage, await request.json()));
            }

            if (request.method === "GET" && url.pathname === "/challenge") {
              return Response.json({
                challenge: readPasskeyChallenge(this.ctx.storage, url.searchParams.get("challenge")) ?? null,
              });
            }

            if (request.method === "POST" && url.pathname === "/consume") {
              return Response.json(consumePasskeyChallenge(this.ctx.storage, await request.json()));
            }

            if (request.method === "POST" && url.pathname === "/expire") {
              const body = await request.json();

              return Response.json({ expired: expirePasskeyChallenges(this.ctx.storage, body.now) });
            }

            if (request.method === "POST" && url.pathname === "/delete-challenge") {
              const body = await request.json();

              return Response.json({
                deleted: deletePasskeyChallenge(this.ctx.storage, body.challenge),
              });
            }

            if (request.method === "POST" && url.pathname === "/credential") {
              const body = await request.json();

              return Response.json(
                createPasskeyCredential(this.ctx.storage, {
                  ...body,
                  publicKey: new Uint8Array(body.publicKey),
                }),
              );
            }

            if (request.method === "GET" && url.pathname === "/credential") {
              return Response.json({
                credential: readPasskeyCredential(this.ctx.storage, url.searchParams.get("id")) ?? null,
              });
            }

            if (request.method === "GET" && url.pathname === "/credentials") {
              return Response.json({
                credentials: readPasskeyCredentialsForPrincipal(
                  this.ctx.storage,
                  url.searchParams.get("principalId"),
                ),
              });
            }

            if (request.method === "POST" && url.pathname === "/credential/verify") {
              return Response.json(
                updatePasskeyCredentialVerification(this.ctx.storage, await request.json()),
              );
            }

            if (request.method === "GET" && url.pathname === "/webauthn-credential") {
              const credential = readPasskeyCredential(this.ctx.storage, url.searchParams.get("id"));

              if (!credential) {
                return Response.json({ credential: null });
              }

              const webauthnCredential = passkeyCredentialToWebAuthnCredential(credential);

              return Response.json({
                credential: {
                  id: webauthnCredential.id,
                  publicKey: Array.from(webauthnCredential.publicKey),
                  counter: webauthnCredential.counter,
                  ...(webauthnCredential.transports === undefined
                    ? {}
                    : { transports: webauthnCredential.transports }),
                },
              });
            }

            return Response.json({ error: "Not found." }, { status: 404 });
          } catch (error) {
            return Response.json(
              { error: error instanceof Error ? error.message : "Unknown error." },
              { status: 400 },
            );
          }
        }
      }

      function targetBindingFromSearch(url) {
        return {
          access: url.searchParams.get("access") ?? undefined,
          instanceId: url.searchParams.get("instanceId") ?? undefined,
          principalId: url.searchParams.get("principalId") ?? undefined,
          targetOrigin: url.searchParams.get("targetOrigin") ?? undefined,
          routeId: url.searchParams.get("routeId") ?? undefined,
          targetProfile: url.searchParams.get("targetProfile") ?? undefined,
          storageIdentity: url.searchParams.get("storageIdentity") ?? undefined,
        };
      }

      export default {
        fetch(request, env) {
          const id = env.INSTANCE_AUTH_HARNESS.idFromName(
            request.headers.get("x-instance-auth-harness-name") ?? "default",
          );

          return env.INSTANCE_AUTH_HARNESS.get(id).fetch(request);
        },
      };
    `,
  );

  return harnessPath;
}
