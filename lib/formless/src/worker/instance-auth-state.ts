import type {
  AuthenticatorTransportFuture,
  CredentialDeviceType,
  WebAuthnCredential,
} from "@simplewebauthn/server";

import {
  COLLABORATOR_INVITATION_ACCEPT_PATH as SHARED_COLLABORATOR_INVITATION_ACCEPT_PATH,
  parseAccountCompletionGateTarget,
  parseInstanceAuthCanonicalOrigin,
  parseInstanceAuthConfigInput,
  parseInstanceAuthRelyingPartyId,
  parseAccountRedirectTarget,
  type AccountCompletionGateTarget,
  type InstanceAuthConfigInput,
  type AccountRedirectTarget,
} from "../shared/instance-auth.ts";
import {
  parseRuntimeRouteAccess,
  runtimeAuthAccountGateRoutes,
  type RuntimeRouteAccess,
} from "../shared/runtime-topology.ts";
import { normalizeEmailDeliveryAddress } from "../shared/email-runtime.ts";
import { nowIsoString } from "../shared/clock.ts";
import type { IdentityInvitationTargetSurface } from "@dpeek/formless-identity-control-plane";
import {
  createSqlStorageMigrationRegistry,
  runSqlStorageMigrations,
  storageSqlMigrationFamily,
} from "./sql-migrations.ts";

const base64UrlPattern = /^[A-Za-z0-9_-]+$/;
const credentialDeviceTypes = ["multiDevice", "singleDevice"] as const;
const passkeyChallengeKinds = ["login", "registration"] as const;
const instanceAuthHandoffTargetProfiles = ["instance", "public-site"] as const;
const emailVerificationChallengePurposes = [
  "account-completion",
  "invitation-acceptance",
  "owner-setup",
  "recovery",
] as const;
const collaboratorInvitationTargetSurfaces = [
  "instance",
  "organization",
] as const satisfies readonly IdentityInvitationTargetSurface[];
export const COLLABORATOR_INVITATION_ACCEPT_PATH = SHARED_COLLABORATOR_INVITATION_ACCEPT_PATH;
const authenticatorTransports = [
  "ble",
  "cable",
  "hybrid",
  "internal",
  "nfc",
  "smart-card",
  "usb",
] as const satisfies readonly AuthenticatorTransportFuture[];

const passkeyChallengesTableName = "instance_auth_challenges";
const passkeyChallengesExpiresAtIndexName = "idx_instance_auth_challenges_expires_at";
const passkeyChallengesTableSql = `
  CREATE TABLE IF NOT EXISTS ${passkeyChallengesTableName} (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('login', 'registration')),
    challenge TEXT NOT NULL UNIQUE,
    invitation_id TEXT,
    invitation_token_hash TEXT,
    principal_id TEXT,
    registration_origin TEXT,
    registration_relying_party_id TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    consumed_at TEXT,
    CHECK (
      (
        kind = 'registration'
        AND principal_id IS NOT NULL
        AND invitation_id IS NOT NULL
        AND invitation_token_hash IS NOT NULL
        AND registration_origin IS NOT NULL
        AND registration_relying_party_id IS NOT NULL
      )
      OR
      (
        kind = 'login'
        AND principal_id IS NULL
        AND invitation_id IS NULL
        AND invitation_token_hash IS NULL
        AND registration_origin IS NULL
        AND registration_relying_party_id IS NULL
      )
    )
  )
`;
const passkeyChallengesExpiresAtIndexSql = `
  CREATE INDEX IF NOT EXISTS ${passkeyChallengesExpiresAtIndexName}
    ON ${passkeyChallengesTableName} (expires_at)
`;
const instanceAuthSqlMigrationFamily = storageSqlMigrationFamily("instance-auth");
const instanceAuthSqlMigrations = createSqlStorageMigrationRegistry([
  {
    id: "2026-07-24-instance-auth-principal-neutral-login-challenges",
    owner: "formless",
    family: instanceAuthSqlMigrationFamily,
    checksum: "sha256:a067010dfdd1d5d38eb6d312fc9c1a1516ec7ab9caa315049210751c236164d8",
    safety: "auto-safe",
    summary: "Remove principal bindings from stored passkey login challenges.",
    apply: migratePrincipalNeutralLoginChallenges,
  },
  {
    id: "2026-07-24-instance-auth-repair-legacy-passkey-challenges",
    owner: "formless",
    family: instanceAuthSqlMigrationFamily,
    checksum: "sha256:b6d9d34075fd2eeaa919ba1dc63c662dd563668141659677fe65d48d0f9969a8",
    safety: "auto-safe",
    summary: "Repair deployed legacy passkey challenge storage.",
    apply: repairLegacyPasskeyChallengeStorage,
  },
]);

type InstanceAuthConfigRow = {
  canonical_origin: string;
  relying_party_id: string;
  relying_party_name: string;
  created_at: string;
  updated_at: string;
};

type PasskeyChallengeRow = {
  id: string;
  kind: string;
  challenge: string;
  invitation_id: string | null;
  invitation_token_hash: string | null;
  principal_id: string | null;
  registration_origin: string | null;
  registration_relying_party_id: string | null;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
};

type PasskeyCredentialRow = {
  credential_id: string;
  principal_id: string;
  public_key_base64url: string;
  counter: number;
  transports_json: string;
  credential_device_type: string;
  credential_backed_up: number;
  user_verified: number | null;
  last_verified_at: string | null;
  last_verification_origin: string | null;
  last_verification_relying_party_id: string | null;
  created_at: string;
  updated_at: string;
};

type CentralAuthSessionRow = {
  session_id_hash: string;
  instance_id: string;
  principal_id: string;
  issued_at: string;
  expires_at: string;
  revoked_at: string | null;
};

type HostSessionRevocationVersionRow = {
  scope_key: string;
  instance_id: string;
  principal_id: string;
  target_origin: string;
  route_id: string;
  target_profile: string;
  access: string;
  required_role: string | null;
  app_install_id: string | null;
  storage_identity: string | null;
  session_version: number;
  updated_at: string;
};

type HandoffGrantRow = {
  grant_id: string;
  grant_secret_hash: string;
  instance_id: string;
  principal_id: string;
  target_origin: string;
  route_id: string;
  target_profile: string;
  access: string;
  required_role: string | null;
  app_install_id: string | null;
  storage_identity: string | null;
  return_to: string;
  nonce_hash: string;
  state: string;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
};

type CollaboratorInvitationTokenRow = {
  invitation_id: string;
  token_hash: string;
  normalized_target_email: string;
  target_surface: IdentityInvitationTargetSurface;
  target_app_install_id: string | null;
  target_organization: string | null;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
  revoked_at: string | null;
};

type EmailVerificationChallengeRow = {
  challenge_id: string;
  idempotency_key: string;
  token_hash: string;
  normalized_email: string;
  display_email: string;
  purpose: string;
  principal_id: string;
  auth_origin: string;
  target_origin: string;
  route_id: string;
  target_profile: string;
  app_install_id: string | null;
  storage_identity: string | null;
  selected_organization: string | null;
  return_to: string;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
  revoked_at: string | null;
};

export type StoredInstanceAuthConfig = InstanceAuthConfigInput & {
  createdAt: string;
  updatedAt: string;
};

export type WriteInstanceAuthConfigInput = InstanceAuthConfigInput & {
  now?: string;
};

export type PasskeyChallengeKind = (typeof passkeyChallengeKinds)[number];

export type StoredCollaboratorInvitationPasskeyRegistrationChallenge = {
  canonicalOrigin: string;
  challenge: string;
  consumedAt?: string;
  createdAt: string;
  expiresAt: string;
  id: string;
  invitationId: string;
  invitationTokenHash: string;
  kind: "registration";
  principalId: string;
  relyingPartyId: string;
};

export type StoredPasskeyRegistrationChallenge =
  StoredCollaboratorInvitationPasskeyRegistrationChallenge;

export type StoredPasskeyLoginChallenge = {
  id: string;
  kind: "login";
  challenge: string;
  createdAt: string;
  expiresAt: string;
  consumedAt?: string;
};

export type StoredPasskeyChallenge =
  | StoredPasskeyRegistrationChallenge
  | StoredPasskeyLoginChallenge;

export type CreatePasskeyChallengeInput =
  | {
      canonicalOrigin: string;
      challenge: string;
      createdAt?: string;
      expiresAt: string;
      id?: string;
      invitationId: string;
      invitationTokenHash: string;
      kind: "registration";
      principalId: string;
      relyingPartyId: string;
    }
  | {
      id?: string;
      kind: "login";
      challenge: string;
      createdAt?: string;
      expiresAt: string;
    };

export type CreatePasskeyChallengeResult =
  | { ok: true; challenge: StoredPasskeyChallenge }
  | {
      ok: false;
      challenge: StoredPasskeyChallenge;
      reason: "duplicate-challenge";
    };

export type ConsumePasskeyChallengeInput = {
  challenge: string;
  kind: PasskeyChallengeKind;
  now?: string;
};

export type ConsumePasskeyChallengeResult =
  | { ok: true; challenge: StoredPasskeyChallenge }
  | {
      ok: false;
      challenge?: StoredPasskeyChallenge;
      reason: "already-consumed" | "expired-challenge" | "missing-challenge" | "wrong-kind";
    };

export type StoredPasskeyCredential = {
  credentialId: string;
  principalId: string;
  publicKeyBase64Url: string;
  counter: number;
  transports: AuthenticatorTransportFuture[];
  credentialDeviceType: CredentialDeviceType;
  credentialBackedUp: boolean;
  userVerified?: boolean;
  lastVerifiedAt?: string;
  lastVerificationOrigin?: string;
  lastVerificationRelyingPartyId?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreatePasskeyCredentialInput = {
  credentialId: string;
  principalId: string;
  publicKey: Uint8Array<ArrayBuffer>;
  counter: number;
  transports?: AuthenticatorTransportFuture[];
  credentialDeviceType: CredentialDeviceType;
  credentialBackedUp: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type CreatePasskeyCredentialResult =
  | { ok: true; credential: StoredPasskeyCredential }
  | {
      ok: false;
      credential: StoredPasskeyCredential;
      reason: "duplicate-credential-id";
    };

export type UpdatePasskeyCredentialVerificationInput = {
  credentialId: string;
  counter: number;
  verifiedAt?: string;
  userVerified: boolean;
  credentialDeviceType: CredentialDeviceType;
  credentialBackedUp: boolean;
  origin: string;
  relyingPartyId: string;
};

export type UpdatePasskeyCredentialVerificationResult =
  | { ok: true; credential: StoredPasskeyCredential }
  | {
      ok: false;
      credential?: StoredPasskeyCredential;
      reason: "counter-regression" | "missing-credential";
    };

export type InstanceAuthHandoffTargetProfile = (typeof instanceAuthHandoffTargetProfiles)[number];

export type InstanceAuthSessionTargetBinding = {
  access: Exclude<RuntimeRouteAccess, "anonymous">;
  routeId: string;
  storageIdentity?: string;
  targetOrigin: string;
  targetProfile: InstanceAuthHandoffTargetProfile;
};

export type StoredCentralAuthSession = {
  expiresAt: string;
  instanceId: string;
  issuedAt: string;
  principalId: string;
  revokedAt?: string;
  sessionIdHash: string;
};

export type CreateCentralAuthSessionInput = {
  expiresAt: string;
  instanceId: string;
  issuedAt?: string;
  principalId: string;
  sessionIdHash: string;
};

export type CreateCentralAuthSessionResult =
  | { ok: true; session: StoredCentralAuthSession }
  | {
      ok: false;
      reason: "duplicate-session";
      session: StoredCentralAuthSession;
    };

export type RevokeCentralAuthSessionResult =
  | { ok: true; session: StoredCentralAuthSession }
  | { ok: false; reason: "missing-session" };

export type StoredHostSessionRevocationVersion = InstanceAuthSessionTargetBinding & {
  instanceId: string;
  principalId: string;
  sessionVersion: number;
  updatedAt: string;
};

export type HostSessionRevocationVersionInput = InstanceAuthSessionTargetBinding & {
  instanceId: string;
  principalId: string;
};

export type BumpHostSessionRevocationVersionInput = HostSessionRevocationVersionInput & {
  now?: string;
};

export type StoredHandoffGrant = InstanceAuthSessionTargetBinding & {
  consumedAt?: string;
  createdAt: string;
  expiresAt: string;
  grantId: string;
  grantSecretHash: string;
  instanceId: string;
  nonceHash: string;
  principalId: string;
  returnTo: AccountRedirectTarget;
  state: string;
};

export type CreateHandoffGrantInput = InstanceAuthSessionTargetBinding & {
  createdAt?: string;
  expiresAt: string;
  grantId?: string;
  grantSecretHash: string;
  instanceId: string;
  nonceHash: string;
  principalId: string;
  returnTo: string;
  state: string;
};

export type CreateHandoffGrantResult =
  | { ok: true; grant: StoredHandoffGrant }
  | {
      ok: false;
      grant: StoredHandoffGrant;
      reason: "duplicate-grant-id" | "duplicate-grant-secret-hash";
    };

export type ConsumeHandoffGrantInput = {
  grantId: string;
  grantSecretHash?: string;
  instanceId?: string;
  nonceHash?: string;
  now?: string;
  principalId?: string;
  state?: string;
  target?: InstanceAuthSessionTargetBinding;
};

export type ConsumeHandoffGrantResult =
  | { ok: true; grant: StoredHandoffGrant }
  | {
      ok: false;
      grant?: StoredHandoffGrant;
      reason:
        | "already-consumed"
        | "expired-grant"
        | "missing-grant"
        | "wrong-grant-secret"
        | "wrong-instance"
        | "wrong-nonce"
        | "wrong-principal"
        | "wrong-state"
        | "wrong-target";
    };

type HandoffGrantMismatchReason =
  | "wrong-grant-secret"
  | "wrong-instance"
  | "wrong-nonce"
  | "wrong-principal"
  | "wrong-state"
  | "wrong-target";

export type CollaboratorInvitationTargetFacts = {
  targetSurface: IdentityInvitationTargetSurface;
  targetOrganization?: string;
};

export type StoredCollaboratorInvitationToken = CollaboratorInvitationTargetFacts & {
  consumedAt?: string;
  createdAt: string;
  expiresAt: string;
  invitationId: string;
  normalizedTargetEmail: string;
  revokedAt?: string;
  tokenHash: string;
};

export type CreateCollaboratorInvitationTokenInput = CollaboratorInvitationTargetFacts & {
  createdAt?: string;
  expiresAt: string;
  invitationId: string;
  targetEmail: string;
  tokenHash: string;
};

export type CreateCollaboratorInvitationTokenResult =
  | { ok: true; token: StoredCollaboratorInvitationToken }
  | {
      ok: false;
      reason: "duplicate-invitation-id" | "duplicate-token-hash";
      token: StoredCollaboratorInvitationToken;
    };

export type ConsumeCollaboratorInvitationTokenInput = {
  invitationId: string;
  now?: string;
  target?: CollaboratorInvitationTargetFacts;
  targetEmail?: string;
  tokenHash: string;
};

export type ConsumeCollaboratorInvitationTokenResult =
  | { ok: true; token: StoredCollaboratorInvitationToken }
  | {
      ok: false;
      reason:
        | "already-consumed"
        | "expired-token"
        | "missing-token"
        | "revoked-token"
        | "wrong-target"
        | "wrong-target-email"
        | "wrong-token";
      token?: StoredCollaboratorInvitationToken;
    };

export type RevokeCollaboratorInvitationTokenResult =
  | { ok: true; token: StoredCollaboratorInvitationToken }
  | {
      ok: false;
      reason: "already-consumed" | "expired-token" | "missing-token" | "revoked-token";
      token?: StoredCollaboratorInvitationToken;
    };

type CollaboratorInvitationTokenMismatchReason =
  | "wrong-target"
  | "wrong-target-email"
  | "wrong-token";

export type EmailVerificationChallengePurpose = (typeof emailVerificationChallengePurposes)[number];

export type StoredEmailVerificationChallenge = AccountCompletionGateTarget & {
  authOrigin: string;
  challengeId: string;
  consumedAt?: string;
  createdAt: string;
  displayEmail: string;
  expiresAt: string;
  idempotencyKey: string;
  normalizedEmail: string;
  principalId: string;
  purpose: EmailVerificationChallengePurpose;
  revokedAt?: string;
  tokenHash: string;
};

export type CreateEmailVerificationChallengeInput = {
  authOrigin: string;
  challengeId?: string;
  createdAt?: string;
  email: string;
  expiresAt: string;
  idempotencyKey: string;
  principalId: string;
  purpose: EmailVerificationChallengePurpose;
  target: AccountCompletionGateTarget;
  tokenHash: string;
};

export type CreateEmailVerificationChallengeResult =
  | { ok: true; challenge: StoredEmailVerificationChallenge; replayed: boolean }
  | {
      ok: false;
      challenge: StoredEmailVerificationChallenge;
      reason: "duplicate-challenge-id" | "duplicate-token-hash";
    };

export type EmailVerificationChallengeExpectation = {
  email?: string;
  principalId?: string;
  purpose?: EmailVerificationChallengePurpose;
  target?: AccountCompletionGateTarget;
  tokenHash: string;
};

export type ValidateEmailVerificationChallengeInput = EmailVerificationChallengeExpectation & {
  challengeId: string;
  now?: string;
};

export type ValidateEmailVerificationChallengeResult =
  | { ok: true; challenge: StoredEmailVerificationChallenge }
  | {
      ok: false;
      challenge?: StoredEmailVerificationChallenge;
      reason:
        | "already-consumed"
        | "expired-challenge"
        | "missing-challenge"
        | "revoked-challenge"
        | "wrong-email"
        | "wrong-purpose"
        | "wrong-target"
        | "wrong-token";
    };

export type ConsumeEmailVerificationChallengeInput = ValidateEmailVerificationChallengeInput;

export type ConsumeEmailVerificationChallengeResult = ValidateEmailVerificationChallengeResult;

export type RevokeEmailVerificationChallengeResult =
  | { ok: true; challenge: StoredEmailVerificationChallenge }
  | {
      ok: false;
      challenge?: StoredEmailVerificationChallenge;
      reason: "already-consumed" | "expired-challenge" | "missing-challenge" | "revoked-challenge";
    };

type EmailVerificationChallengeMismatchReason =
  | "wrong-email"
  | "wrong-purpose"
  | "wrong-target"
  | "wrong-token";

export function ensureInstanceAuthTables(storage: DurableObjectStorage) {
  storage.sql.exec(`
    CREATE TABLE IF NOT EXISTS instance_auth_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      canonical_origin TEXT NOT NULL,
      relying_party_id TEXT NOT NULL,
      relying_party_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    ${passkeyChallengesTableSql};
    ${passkeyChallengesExpiresAtIndexSql};

    CREATE TABLE IF NOT EXISTS instance_auth_passkey_credentials (
      credential_id TEXT PRIMARY KEY,
      principal_id TEXT NOT NULL,
      public_key_base64url TEXT NOT NULL,
      counter INTEGER NOT NULL,
      transports_json TEXT NOT NULL,
      credential_device_type TEXT NOT NULL CHECK (
        credential_device_type IN ('multiDevice', 'singleDevice')
      ),
      credential_backed_up INTEGER NOT NULL CHECK (credential_backed_up IN (0, 1)),
      user_verified INTEGER CHECK (user_verified IS NULL OR user_verified IN (0, 1)),
      last_verified_at TEXT,
      last_verification_origin TEXT,
      last_verification_relying_party_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_instance_auth_passkey_credentials_principal_id
      ON instance_auth_passkey_credentials (principal_id);

    CREATE TABLE IF NOT EXISTS instance_auth_central_sessions (
      session_id_hash TEXT PRIMARY KEY,
      instance_id TEXT NOT NULL,
      principal_id TEXT NOT NULL,
      issued_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_instance_auth_central_sessions_principal_id
      ON instance_auth_central_sessions (principal_id);

    CREATE INDEX IF NOT EXISTS idx_instance_auth_central_sessions_expires_at
      ON instance_auth_central_sessions (expires_at);

    CREATE TABLE IF NOT EXISTS instance_auth_host_session_versions (
      scope_key TEXT PRIMARY KEY,
      instance_id TEXT NOT NULL,
      principal_id TEXT NOT NULL,
      target_origin TEXT NOT NULL,
      route_id TEXT NOT NULL,
      target_profile TEXT NOT NULL CHECK (target_profile IN ('instance', 'app', 'public-site')),
      access TEXT NOT NULL CHECK (access IN ('authenticated', 'management', 'owner')),
      required_role TEXT CHECK (required_role IS NULL OR required_role = 'app.admin'),
      app_install_id TEXT,
      storage_identity TEXT,
      session_version INTEGER NOT NULL CHECK (session_version >= 0),
      updated_at TEXT NOT NULL,
      CHECK (required_role IS NULL OR (
        access = 'authenticated' AND
        target_profile = 'app' AND
        app_install_id IS NOT NULL
      )),
      CHECK (app_install_id IS NOT NULL OR storage_identity IS NOT NULL)
    );

    CREATE INDEX IF NOT EXISTS idx_instance_auth_host_session_versions_principal_id
      ON instance_auth_host_session_versions (principal_id);

    CREATE INDEX IF NOT EXISTS idx_instance_auth_host_session_versions_target
      ON instance_auth_host_session_versions (
        target_origin,
        route_id,
        target_profile,
        app_install_id,
        storage_identity
      );

    CREATE TABLE IF NOT EXISTS instance_auth_handoff_grants (
      grant_id TEXT PRIMARY KEY,
      grant_secret_hash TEXT NOT NULL UNIQUE,
      instance_id TEXT NOT NULL,
      principal_id TEXT NOT NULL,
      target_origin TEXT NOT NULL,
      route_id TEXT NOT NULL,
      target_profile TEXT NOT NULL CHECK (target_profile IN ('instance', 'app', 'public-site')),
      access TEXT NOT NULL CHECK (access IN ('authenticated', 'management', 'owner')),
      required_role TEXT CHECK (required_role IS NULL OR required_role = 'app.admin'),
      app_install_id TEXT,
      storage_identity TEXT,
      return_to TEXT NOT NULL,
      nonce_hash TEXT NOT NULL,
      state TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      CHECK (required_role IS NULL OR (
        access = 'authenticated' AND
        target_profile = 'app' AND
        app_install_id IS NOT NULL
      )),
      CHECK (app_install_id IS NOT NULL OR storage_identity IS NOT NULL)
    );

    CREATE INDEX IF NOT EXISTS idx_instance_auth_handoff_grants_principal_id
      ON instance_auth_handoff_grants (principal_id);

    CREATE INDEX IF NOT EXISTS idx_instance_auth_handoff_grants_target
      ON instance_auth_handoff_grants (
        target_origin,
        route_id,
        target_profile,
        app_install_id,
        storage_identity
      );

    CREATE INDEX IF NOT EXISTS idx_instance_auth_handoff_grants_expires_at
      ON instance_auth_handoff_grants (expires_at);

    CREATE TABLE IF NOT EXISTS instance_auth_collaborator_invitation_tokens (
      invitation_id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      normalized_target_email TEXT NOT NULL,
      target_surface TEXT NOT NULL CHECK (
        target_surface IN ('app-install', 'instance', 'organization')
      ),
      target_app_install_id TEXT,
      target_organization TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      revoked_at TEXT,
      CHECK (
        (target_surface = 'instance' AND target_app_install_id IS NULL AND target_organization IS NULL)
        OR
        (target_surface = 'app-install' AND target_app_install_id IS NOT NULL AND target_organization IS NULL)
        OR
        (target_surface = 'organization' AND target_app_install_id IS NULL AND target_organization IS NOT NULL)
      )
    );

    CREATE INDEX IF NOT EXISTS idx_instance_auth_collaborator_invitation_tokens_expires_at
      ON instance_auth_collaborator_invitation_tokens (expires_at);

    CREATE INDEX IF NOT EXISTS idx_instance_auth_collaborator_invitation_tokens_target
      ON instance_auth_collaborator_invitation_tokens (
        target_surface,
        target_app_install_id,
        target_organization
      );

    CREATE TABLE IF NOT EXISTS instance_auth_email_verification_challenges (
      challenge_id TEXT PRIMARY KEY,
      idempotency_key TEXT NOT NULL UNIQUE,
      token_hash TEXT NOT NULL UNIQUE,
      normalized_email TEXT NOT NULL,
      display_email TEXT NOT NULL,
      purpose TEXT NOT NULL CHECK (
        purpose IN (
          'account-completion',
          'invitation-acceptance',
          'owner-setup',
          'recovery'
        )
      ),
      principal_id TEXT NOT NULL,
      auth_origin TEXT NOT NULL,
      target_origin TEXT NOT NULL,
      route_id TEXT NOT NULL,
      target_profile TEXT NOT NULL CHECK (target_profile IN ('app', 'instance', 'public-site')),
      app_install_id TEXT,
      storage_identity TEXT,
      selected_organization TEXT,
      return_to TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      revoked_at TEXT,
      CHECK (app_install_id IS NOT NULL OR storage_identity IS NOT NULL)
    );

    CREATE INDEX IF NOT EXISTS idx_instance_auth_email_verification_challenges_expires_at
      ON instance_auth_email_verification_challenges (expires_at);

    CREATE INDEX IF NOT EXISTS idx_instance_auth_email_verification_challenges_principal_id
      ON instance_auth_email_verification_challenges (principal_id);

    CREATE INDEX IF NOT EXISTS idx_instance_auth_email_verification_challenges_target
      ON instance_auth_email_verification_challenges (
        target_origin,
        route_id,
        target_profile,
        app_install_id,
        storage_identity
      );
  `);
  runSqlStorageMigrations(storage, {
    family: instanceAuthSqlMigrationFamily,
    migrations: instanceAuthSqlMigrations,
  });
}

export function resetInstanceAuthTables(storage: DurableObjectStorage) {
  ensureInstanceAuthTables(storage);

  storage.transactionSync(() => {
    storage.sql.exec(`
      DELETE FROM instance_auth_email_verification_challenges;
      DELETE FROM instance_auth_collaborator_invitation_tokens;
      DELETE FROM instance_auth_handoff_grants;
      DELETE FROM instance_auth_host_session_versions;
      DELETE FROM instance_auth_central_sessions;
      DELETE FROM instance_auth_passkey_credentials;
      DELETE FROM instance_auth_challenges;
      DELETE FROM instance_auth_config;
    `);
  });
}

export function readInstanceAuthConfig(
  storage: DurableObjectStorage,
): StoredInstanceAuthConfig | undefined {
  ensureInstanceAuthTables(storage);

  return readInstanceAuthConfigRow(storage);
}

export function writeInstanceAuthConfig(
  storage: DurableObjectStorage,
  input: WriteInstanceAuthConfigInput,
): StoredInstanceAuthConfig {
  ensureInstanceAuthTables(storage);

  return storage.transactionSync(() => {
    const existing = readInstanceAuthConfigRow(storage);
    const normalizedConfig = parseInstanceAuthConfigInput({
      canonicalOrigin: input.canonicalOrigin,
      relyingPartyId: input.relyingPartyId,
      relyingPartyName: input.relyingPartyName,
    });
    const updatedAt = parseTimestamp("Instance auth config updatedAt", input.now ?? nowIsoString());
    const createdAt = existing?.createdAt ?? updatedAt;

    storage.sql.exec(
      `
        INSERT INTO instance_auth_config (
          id,
          canonical_origin,
          relying_party_id,
          relying_party_name,
          created_at,
          updated_at
        )
        VALUES (1, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          canonical_origin = excluded.canonical_origin,
          relying_party_id = excluded.relying_party_id,
          relying_party_name = excluded.relying_party_name,
          updated_at = excluded.updated_at
      `,
      normalizedConfig.canonicalOrigin,
      normalizedConfig.relyingPartyId,
      normalizedConfig.relyingPartyName,
      createdAt,
      updatedAt,
    );

    return {
      ...normalizedConfig,
      createdAt,
      updatedAt,
    };
  });
}

export function createPasskeyChallenge(
  storage: DurableObjectStorage,
  input: CreatePasskeyChallengeInput,
): CreatePasskeyChallengeResult {
  ensureInstanceAuthTables(storage);

  return storage.transactionSync(() => {
    const normalizedChallenge = normalizePasskeyChallengeInput(input);
    const existing = readPasskeyChallengeByChallenge(storage, normalizedChallenge.challenge);

    if (existing) {
      return {
        ok: false,
        challenge: existing,
        reason: "duplicate-challenge",
      };
    }

    storage.sql.exec(
      `
        INSERT INTO instance_auth_challenges (
          id,
          kind,
          challenge,
          invitation_id,
          invitation_token_hash,
          principal_id,
          registration_origin,
          registration_relying_party_id,
          created_at,
          expires_at,
          consumed_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      normalizedChallenge.id,
      normalizedChallenge.kind,
      normalizedChallenge.challenge,
      "invitationId" in normalizedChallenge ? normalizedChallenge.invitationId : null,
      "invitationTokenHash" in normalizedChallenge ? normalizedChallenge.invitationTokenHash : null,
      "principalId" in normalizedChallenge ? normalizedChallenge.principalId : null,
      "canonicalOrigin" in normalizedChallenge ? normalizedChallenge.canonicalOrigin : null,
      "relyingPartyId" in normalizedChallenge ? normalizedChallenge.relyingPartyId : null,
      normalizedChallenge.createdAt,
      normalizedChallenge.expiresAt,
      normalizedChallenge.consumedAt ?? null,
    );

    return { ok: true, challenge: normalizedChallenge };
  });
}

export function readPasskeyChallenge(
  storage: DurableObjectStorage,
  challenge: unknown,
): StoredPasskeyChallenge | undefined {
  ensureInstanceAuthTables(storage);

  return readPasskeyChallengeByChallenge(
    storage,
    parseBase64UrlString("Passkey challenge", challenge),
  );
}

export function consumePasskeyChallenge(
  storage: DurableObjectStorage,
  input: ConsumePasskeyChallengeInput,
): ConsumePasskeyChallengeResult {
  ensureInstanceAuthTables(storage);

  return storage.transactionSync(() => {
    const kind = parsePasskeyChallengeKind(input.kind);
    const challengeValue = parseBase64UrlString("Passkey challenge", input.challenge);
    const now = parseTimestamp("Passkey challenge consumedAt", input.now ?? nowIsoString());
    const challenge = readPasskeyChallengeByChallenge(storage, challengeValue);

    if (!challenge) {
      return { ok: false, reason: "missing-challenge" };
    }

    if (challenge.kind !== kind) {
      return { ok: false, challenge, reason: "wrong-kind" };
    }

    if (challenge.consumedAt !== undefined) {
      return { ok: false, challenge, reason: "already-consumed" };
    }

    if (challenge.expiresAt <= now) {
      return { ok: false, challenge, reason: "expired-challenge" };
    }

    storage.sql.exec(
      "UPDATE instance_auth_challenges SET consumed_at = ? WHERE challenge = ?",
      now,
      challenge.challenge,
    );

    return {
      ok: true,
      challenge: {
        ...challenge,
        consumedAt: now,
      },
    };
  });
}

export function expirePasskeyChallenges(storage: DurableObjectStorage, now: unknown): number {
  ensureInstanceAuthTables(storage);

  const expiresAt = parseTimestamp("Passkey challenge expiry timestamp", now);
  const row = storage.sql
    .exec<{ count: number }>(
      "SELECT COUNT(*) AS count FROM instance_auth_challenges WHERE expires_at <= ?",
      expiresAt,
    )
    .one();

  storage.sql.exec("DELETE FROM instance_auth_challenges WHERE expires_at <= ?", expiresAt);

  return row.count;
}

export function deletePasskeyChallenge(storage: DurableObjectStorage, challenge: unknown): boolean {
  ensureInstanceAuthTables(storage);

  const challengeValue = parseBase64UrlString("Passkey challenge", challenge);
  const existing = readPasskeyChallengeByChallenge(storage, challengeValue);

  if (!existing) {
    return false;
  }

  storage.sql.exec("DELETE FROM instance_auth_challenges WHERE challenge = ?", challengeValue);

  return true;
}

export function createPasskeyCredential(
  storage: DurableObjectStorage,
  input: CreatePasskeyCredentialInput,
): CreatePasskeyCredentialResult {
  ensureInstanceAuthTables(storage);

  return storage.transactionSync(() => createPasskeyCredentialInCurrentTransaction(storage, input));
}

export function createPasskeyCredentialInCurrentTransaction(
  storage: DurableObjectStorage,
  input: CreatePasskeyCredentialInput,
): CreatePasskeyCredentialResult {
  ensureInstanceAuthTables(storage);

  const normalizedCredential = normalizeCreatePasskeyCredentialInput(input);
  const existing = readPasskeyCredentialById(storage, normalizedCredential.credentialId);

  if (existing) {
    return {
      ok: false,
      credential: existing,
      reason: "duplicate-credential-id",
    };
  }

  storage.sql.exec(
    `
        INSERT INTO instance_auth_passkey_credentials (
          credential_id,
          principal_id,
          public_key_base64url,
          counter,
          transports_json,
          credential_device_type,
          credential_backed_up,
          user_verified,
          last_verified_at,
          last_verification_origin,
          last_verification_relying_party_id,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?)
      `,
    normalizedCredential.credentialId,
    normalizedCredential.principalId,
    normalizedCredential.publicKeyBase64Url,
    normalizedCredential.counter,
    JSON.stringify(normalizedCredential.transports),
    normalizedCredential.credentialDeviceType,
    storageBoolean(normalizedCredential.credentialBackedUp),
    normalizedCredential.createdAt,
    normalizedCredential.updatedAt,
  );

  return { ok: true, credential: normalizedCredential };
}

export function readPasskeyCredential(
  storage: DurableObjectStorage,
  credentialId: unknown,
): StoredPasskeyCredential | undefined {
  ensureInstanceAuthTables(storage);

  return readPasskeyCredentialById(
    storage,
    parseBase64UrlString("Passkey credential id", credentialId),
  );
}

export function deletePasskeyCredentialInCurrentTransaction(
  storage: DurableObjectStorage,
  input: { credentialId: unknown; principalId: unknown },
): boolean {
  ensureInstanceAuthTables(storage);

  const credentialId = parseBase64UrlString("Passkey credential id", input.credentialId);
  const principalId = parseNonEmptyString("Passkey credential principal id", input.principalId);
  const existing = readPasskeyCredentialById(storage, credentialId);

  if (!existing || existing.principalId !== principalId) {
    return false;
  }

  storage.sql.exec(
    "DELETE FROM instance_auth_passkey_credentials WHERE credential_id = ? AND principal_id = ?",
    credentialId,
    principalId,
  );

  return true;
}

export function readPasskeyCredentialsForPrincipal(
  storage: DurableObjectStorage,
  principalId: unknown,
): StoredPasskeyCredential[] {
  ensureInstanceAuthTables(storage);

  const principalIdValue = parseNonEmptyString("Passkey credential principal id", principalId);
  const credentials: StoredPasskeyCredential[] = [];

  for (const row of storage.sql.exec<PasskeyCredentialRow>(
    `
      SELECT
        credential_id,
        principal_id,
        public_key_base64url,
        counter,
        transports_json,
        credential_device_type,
        credential_backed_up,
        user_verified,
        last_verified_at,
        last_verification_origin,
        last_verification_relying_party_id,
        created_at,
        updated_at
      FROM instance_auth_passkey_credentials
      WHERE principal_id = ?
      ORDER BY created_at ASC, credential_id ASC
    `,
    principalIdValue,
  )) {
    credentials.push(passkeyCredentialFromRow(row));
  }

  return credentials;
}

export function passkeyCredentialToWebAuthnCredential(
  credential: StoredPasskeyCredential,
): WebAuthnCredential {
  return {
    id: credential.credentialId,
    publicKey: base64UrlDecode(credential.publicKeyBase64Url),
    counter: credential.counter,
    ...(credential.transports.length === 0 ? {} : { transports: credential.transports }),
  };
}

export function updatePasskeyCredentialVerification(
  storage: DurableObjectStorage,
  input: UpdatePasskeyCredentialVerificationInput,
): UpdatePasskeyCredentialVerificationResult {
  ensureInstanceAuthTables(storage);

  return storage.transactionSync(() => {
    const credentialId = parseBase64UrlString("Passkey credential id", input.credentialId);
    const existing = readPasskeyCredentialById(storage, credentialId);

    if (!existing) {
      return { ok: false, reason: "missing-credential" };
    }

    const counter = parseNonNegativeInteger("Passkey credential counter", input.counter);

    if (counter < existing.counter) {
      return {
        ok: false,
        credential: existing,
        reason: "counter-regression",
      };
    }

    const verifiedAt = parseTimestamp(
      "Passkey credential verifiedAt",
      input.verifiedAt ?? nowIsoString(),
    );
    const userVerified = parseBoolean("Passkey credential userVerified", input.userVerified);
    const credentialDeviceType = parseCredentialDeviceType(input.credentialDeviceType);
    const credentialBackedUp = parseBoolean(
      "Passkey credential backedUp",
      input.credentialBackedUp,
    );
    const origin = parseInstanceAuthCanonicalOrigin(input.origin);
    const relyingPartyId = parseInstanceAuthRelyingPartyId(input.relyingPartyId, {
      canonicalOrigin: origin,
    });

    storage.sql.exec(
      `
        UPDATE instance_auth_passkey_credentials
        SET
          counter = ?,
          credential_device_type = ?,
          credential_backed_up = ?,
          user_verified = ?,
          last_verified_at = ?,
          last_verification_origin = ?,
          last_verification_relying_party_id = ?,
          updated_at = ?
        WHERE credential_id = ?
      `,
      counter,
      credentialDeviceType,
      storageBoolean(credentialBackedUp),
      storageBoolean(userVerified),
      verifiedAt,
      origin,
      relyingPartyId,
      verifiedAt,
      credentialId,
    );

    return {
      ok: true,
      credential: {
        ...existing,
        counter,
        credentialDeviceType,
        credentialBackedUp,
        userVerified,
        lastVerifiedAt: verifiedAt,
        lastVerificationOrigin: origin,
        lastVerificationRelyingPartyId: relyingPartyId,
        updatedAt: verifiedAt,
      },
    };
  });
}

export function createCentralAuthSession(
  storage: DurableObjectStorage,
  input: CreateCentralAuthSessionInput,
): CreateCentralAuthSessionResult {
  ensureInstanceAuthTables(storage);

  return storage.transactionSync(() => {
    const session = normalizeCreateCentralAuthSessionInput(input);
    const existing = readCentralAuthSessionByHash(storage, session.sessionIdHash);

    if (existing) {
      return {
        ok: false,
        reason: "duplicate-session",
        session: existing,
      };
    }

    storage.sql.exec(
      `
        INSERT INTO instance_auth_central_sessions (
          session_id_hash,
          instance_id,
          principal_id,
          issued_at,
          expires_at,
          revoked_at
        )
        VALUES (?, ?, ?, ?, ?, NULL)
      `,
      session.sessionIdHash,
      session.instanceId,
      session.principalId,
      session.issuedAt,
      session.expiresAt,
    );

    return { ok: true, session };
  });
}

export function readCentralAuthSession(
  storage: DurableObjectStorage,
  sessionIdHash: unknown,
): StoredCentralAuthSession | undefined {
  ensureInstanceAuthTables(storage);

  return readCentralAuthSessionByHash(
    storage,
    parseBase64UrlString("Central auth session id hash", sessionIdHash),
  );
}

export function deleteCentralAuthSessionInCurrentTransaction(
  storage: DurableObjectStorage,
  input: { principalId: unknown; sessionIdHash: unknown },
): boolean {
  ensureInstanceAuthTables(storage);

  const sessionIdHash = parseBase64UrlString("Central auth session id hash", input.sessionIdHash);
  const principalId = parseNonEmptyString("Central auth session principal id", input.principalId);
  const existing = readCentralAuthSessionByHash(storage, sessionIdHash);

  if (!existing || existing.principalId !== principalId) {
    return false;
  }

  storage.sql.exec(
    "DELETE FROM instance_auth_central_sessions WHERE session_id_hash = ? AND principal_id = ?",
    sessionIdHash,
    principalId,
  );

  return true;
}

export function revokeCentralAuthSession(
  storage: DurableObjectStorage,
  sessionIdHash: unknown,
  now: unknown = nowIsoString(),
): RevokeCentralAuthSessionResult {
  ensureInstanceAuthTables(storage);

  return storage.transactionSync(() => {
    const sessionHash = parseBase64UrlString("Central auth session id hash", sessionIdHash);
    const revokedAt = parseTimestamp("Central auth session revokedAt", now);
    const existing = readCentralAuthSessionByHash(storage, sessionHash);

    if (!existing) {
      return { ok: false, reason: "missing-session" };
    }

    storage.sql.exec(
      "UPDATE instance_auth_central_sessions SET revoked_at = ? WHERE session_id_hash = ?",
      revokedAt,
      sessionHash,
    );

    return {
      ok: true,
      session: {
        ...existing,
        revokedAt,
      },
    };
  });
}

export function readHostSessionRevocationVersion(
  storage: DurableObjectStorage,
  input: HostSessionRevocationVersionInput,
): StoredHostSessionRevocationVersion | undefined {
  ensureInstanceAuthTables(storage);

  const scope = normalizeHostSessionRevocationVersionInput(input);

  return readHostSessionRevocationVersionByScopeKey(storage, hostSessionScopeKey(scope));
}

export function bumpHostSessionRevocationVersion(
  storage: DurableObjectStorage,
  input: BumpHostSessionRevocationVersionInput,
): StoredHostSessionRevocationVersion {
  ensureInstanceAuthTables(storage);

  return storage.transactionSync(() => {
    const scope = normalizeHostSessionRevocationVersionInput(input);
    const updatedAt = parseTimestamp(
      "Host session revocation version updatedAt",
      input.now ?? nowIsoString(),
    );
    const scopeKey = hostSessionScopeKey(scope);
    const existing = readHostSessionRevocationVersionByScopeKey(storage, scopeKey);
    const sessionVersion = (existing?.sessionVersion ?? 0) + 1;

    storage.sql.exec(
      `
        INSERT INTO instance_auth_host_session_versions (
          scope_key,
          instance_id,
          principal_id,
          target_origin,
          route_id,
          target_profile,
          access,
          required_role,
          app_install_id,
          storage_identity,
          session_version,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(scope_key) DO UPDATE SET
          session_version = excluded.session_version,
          updated_at = excluded.updated_at
      `,
      scopeKey,
      scope.instanceId,
      scope.principalId,
      scope.targetOrigin,
      scope.routeId,
      scope.targetProfile,
      scope.access,
      null,
      null,
      scope.storageIdentity ?? null,
      sessionVersion,
      updatedAt,
    );

    return {
      ...scope,
      sessionVersion,
      updatedAt,
    };
  });
}

export function createHandoffGrant(
  storage: DurableObjectStorage,
  input: CreateHandoffGrantInput,
): CreateHandoffGrantResult {
  ensureInstanceAuthTables(storage);

  return storage.transactionSync(() => {
    const grant = normalizeCreateHandoffGrantInput(input);
    const existingById = readHandoffGrantById(storage, grant.grantId);

    if (existingById) {
      return {
        ok: false,
        grant: existingById,
        reason: "duplicate-grant-id",
      };
    }

    const existingBySecret = readHandoffGrantBySecretHash(storage, grant.grantSecretHash);

    if (existingBySecret) {
      return {
        ok: false,
        grant: existingBySecret,
        reason: "duplicate-grant-secret-hash",
      };
    }

    storage.sql.exec(
      `
        INSERT INTO instance_auth_handoff_grants (
          grant_id,
          grant_secret_hash,
          instance_id,
          principal_id,
          target_origin,
          route_id,
          target_profile,
          access,
          required_role,
          app_install_id,
          storage_identity,
          return_to,
          nonce_hash,
          state,
          created_at,
          expires_at,
          consumed_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `,
      grant.grantId,
      grant.grantSecretHash,
      grant.instanceId,
      grant.principalId,
      grant.targetOrigin,
      grant.routeId,
      grant.targetProfile,
      grant.access,
      null,
      null,
      grant.storageIdentity ?? null,
      grant.returnTo,
      grant.nonceHash,
      grant.state,
      grant.createdAt,
      grant.expiresAt,
    );

    return { ok: true, grant };
  });
}

export function readHandoffGrant(
  storage: DurableObjectStorage,
  grantId: unknown,
): StoredHandoffGrant | undefined {
  ensureInstanceAuthTables(storage);

  return readHandoffGrantById(storage, parseBase64UrlString("Handoff grant id", grantId));
}

export function consumeHandoffGrant(
  storage: DurableObjectStorage,
  input: ConsumeHandoffGrantInput,
): ConsumeHandoffGrantResult {
  ensureInstanceAuthTables(storage);

  return storage.transactionSync(() => {
    const grantId = parseBase64UrlString("Handoff grant id", input.grantId);
    const consumedAt = parseTimestamp("Handoff grant consumedAt", input.now ?? nowIsoString());
    const expected = normalizeConsumeHandoffGrantInput(input);
    const grant = readHandoffGrantById(storage, grantId);

    if (!grant) {
      return { ok: false, reason: "missing-grant" };
    }

    if (grant.consumedAt !== undefined) {
      return { ok: false, grant, reason: "already-consumed" };
    }

    if (grant.expiresAt <= consumedAt) {
      return { ok: false, grant, reason: "expired-grant" };
    }

    const mismatchReason = handoffGrantMismatchReason(grant, expected);

    if (mismatchReason) {
      return { ok: false, grant, reason: mismatchReason };
    }

    storage.sql.exec(
      "UPDATE instance_auth_handoff_grants SET consumed_at = ? WHERE grant_id = ?",
      consumedAt,
      grant.grantId,
    );

    return {
      ok: true,
      grant: {
        ...grant,
        consumedAt,
      },
    };
  });
}

export function createCollaboratorInvitationToken(
  storage: DurableObjectStorage,
  input: CreateCollaboratorInvitationTokenInput,
): CreateCollaboratorInvitationTokenResult {
  ensureInstanceAuthTables(storage);

  return storage.transactionSync(() => {
    const token = normalizeCreateCollaboratorInvitationTokenInput(input);
    const existingByInvitation = readCollaboratorInvitationTokenByInvitationId(
      storage,
      token.invitationId,
    );

    if (existingByInvitation) {
      return {
        ok: false,
        reason: "duplicate-invitation-id",
        token: existingByInvitation,
      };
    }

    const existingByHash = readCollaboratorInvitationTokenByHash(storage, token.tokenHash);

    if (existingByHash) {
      return {
        ok: false,
        reason: "duplicate-token-hash",
        token: existingByHash,
      };
    }

    storage.sql.exec(
      `
        INSERT INTO instance_auth_collaborator_invitation_tokens (
          invitation_id,
          token_hash,
          normalized_target_email,
          target_surface,
          target_app_install_id,
          target_organization,
          created_at,
          expires_at,
          consumed_at,
          revoked_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
      `,
      token.invitationId,
      token.tokenHash,
      token.normalizedTargetEmail,
      token.targetSurface,
      null,
      token.targetOrganization ?? null,
      token.createdAt,
      token.expiresAt,
    );

    return { ok: true, token };
  });
}

export function readCollaboratorInvitationToken(
  storage: DurableObjectStorage,
  invitationId: unknown,
): StoredCollaboratorInvitationToken | undefined {
  ensureInstanceAuthTables(storage);

  return readCollaboratorInvitationTokenByInvitationId(
    storage,
    parseNonEmptyString("Collaborator invitation id", invitationId),
  );
}

export function consumeCollaboratorInvitationToken(
  storage: DurableObjectStorage,
  input: ConsumeCollaboratorInvitationTokenInput,
): ConsumeCollaboratorInvitationTokenResult {
  ensureInstanceAuthTables(storage);

  return storage.transactionSync(() =>
    consumeCollaboratorInvitationTokenInCurrentTransaction(storage, input),
  );
}

export function consumeCollaboratorInvitationTokenInCurrentTransaction(
  storage: DurableObjectStorage,
  input: ConsumeCollaboratorInvitationTokenInput,
): ConsumeCollaboratorInvitationTokenResult {
  const invitationId = parseNonEmptyString("Collaborator invitation id", input.invitationId);
  const consumedAt = parseTimestamp(
    "Collaborator invitation token consumedAt",
    input.now ?? nowIsoString(),
  );
  const expected = normalizeConsumeCollaboratorInvitationTokenInput(input);
  const token = readCollaboratorInvitationTokenByInvitationId(storage, invitationId);

  if (!token) {
    return { ok: false, reason: "missing-token" };
  }

  if (token.revokedAt !== undefined) {
    return { ok: false, reason: "revoked-token", token };
  }

  if (token.consumedAt !== undefined) {
    return { ok: false, reason: "already-consumed", token };
  }

  if (token.expiresAt <= consumedAt) {
    return { ok: false, reason: "expired-token", token };
  }

  const mismatchReason = collaboratorInvitationTokenMismatchReason(token, expected);

  if (mismatchReason) {
    return { ok: false, reason: mismatchReason, token };
  }

  storage.sql.exec(
    `
      UPDATE instance_auth_collaborator_invitation_tokens
      SET consumed_at = ?
      WHERE invitation_id = ?
    `,
    consumedAt,
    token.invitationId,
  );

  return {
    ok: true,
    token: {
      ...token,
      consumedAt,
    },
  };
}

export function revokeCollaboratorInvitationToken(
  storage: DurableObjectStorage,
  invitationId: unknown,
  now: unknown = nowIsoString(),
): RevokeCollaboratorInvitationTokenResult {
  ensureInstanceAuthTables(storage);

  return storage.transactionSync(() => {
    const tokenId = parseNonEmptyString("Collaborator invitation id", invitationId);
    const revokedAt = parseTimestamp("Collaborator invitation token revokedAt", now);
    const existing = readCollaboratorInvitationTokenByInvitationId(storage, tokenId);

    if (!existing) {
      return { ok: false, reason: "missing-token" };
    }

    if (existing.revokedAt !== undefined) {
      return { ok: false, reason: "revoked-token", token: existing };
    }

    if (existing.consumedAt !== undefined) {
      return { ok: false, reason: "already-consumed", token: existing };
    }

    if (existing.expiresAt <= revokedAt) {
      return { ok: false, reason: "expired-token", token: existing };
    }

    storage.sql.exec(
      `
        UPDATE instance_auth_collaborator_invitation_tokens
        SET revoked_at = ?
        WHERE invitation_id = ?
      `,
      revokedAt,
      existing.invitationId,
    );

    return {
      ok: true,
      token: {
        ...existing,
        revokedAt,
      },
    };
  });
}

export function createEmailVerificationChallenge(
  storage: DurableObjectStorage,
  input: CreateEmailVerificationChallengeInput,
): CreateEmailVerificationChallengeResult {
  ensureInstanceAuthTables(storage);

  return storage.transactionSync(() => {
    const challenge = normalizeCreateEmailVerificationChallengeInput(input);
    const existingByIdempotency = readEmailVerificationChallengeByIdempotencyKey(
      storage,
      challenge.idempotencyKey,
    );

    if (existingByIdempotency) {
      return { ok: true, challenge: existingByIdempotency, replayed: true };
    }

    const existingById = readEmailVerificationChallengeById(storage, challenge.challengeId);

    if (existingById) {
      return { ok: false, challenge: existingById, reason: "duplicate-challenge-id" };
    }

    const existingByHash = readEmailVerificationChallengeByHash(storage, challenge.tokenHash);

    if (existingByHash) {
      return { ok: false, challenge: existingByHash, reason: "duplicate-token-hash" };
    }

    storage.sql.exec(
      `
        INSERT INTO instance_auth_email_verification_challenges (
          challenge_id,
          idempotency_key,
          token_hash,
          normalized_email,
          display_email,
          purpose,
          principal_id,
          auth_origin,
          target_origin,
          route_id,
          target_profile,
          app_install_id,
          storage_identity,
          selected_organization,
          return_to,
          created_at,
          expires_at,
          consumed_at,
          revoked_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
      `,
      challenge.challengeId,
      challenge.idempotencyKey,
      challenge.tokenHash,
      challenge.normalizedEmail,
      challenge.displayEmail,
      challenge.purpose,
      challenge.principalId,
      challenge.authOrigin,
      challenge.targetOrigin,
      challenge.routeId,
      challenge.targetProfile,
      null,
      challenge.storageIdentity ?? null,
      challenge.selectedOrganization ?? null,
      challenge.returnTo,
      challenge.createdAt,
      challenge.expiresAt,
    );

    return { ok: true, challenge, replayed: false };
  });
}

export function readEmailVerificationChallenge(
  storage: DurableObjectStorage,
  challengeId: unknown,
): StoredEmailVerificationChallenge | undefined {
  ensureInstanceAuthTables(storage);

  return readEmailVerificationChallengeById(
    storage,
    parseNonEmptyString("Email verification challenge id", challengeId),
  );
}

export function listEmailVerificationChallenges(
  storage: DurableObjectStorage,
): StoredEmailVerificationChallenge[] {
  ensureInstanceAuthTables(storage);

  return storage.sql
    .exec<EmailVerificationChallengeRow>(
      `
        SELECT
          challenge_id,
          idempotency_key,
          token_hash,
          normalized_email,
          display_email,
          purpose,
          principal_id,
          auth_origin,
          target_origin,
          route_id,
          target_profile,
          app_install_id,
          storage_identity,
          selected_organization,
          return_to,
          created_at,
          expires_at,
          consumed_at,
          revoked_at
        FROM instance_auth_email_verification_challenges
        ORDER BY created_at ASC, challenge_id ASC
      `,
    )
    .toArray()
    .map(emailVerificationChallengeFromRow);
}

export function validateEmailVerificationChallenge(
  storage: DurableObjectStorage,
  input: ValidateEmailVerificationChallengeInput,
): ValidateEmailVerificationChallengeResult {
  ensureInstanceAuthTables(storage);

  const challengeId = parseNonEmptyString("Email verification challenge id", input.challengeId);
  const now = parseTimestamp(
    "Email verification challenge validation time",
    input.now ?? nowIsoString(),
  );
  const challenge = readEmailVerificationChallengeById(storage, challengeId);

  if (!challenge) {
    return { ok: false, reason: "missing-challenge" };
  }

  if (challenge.revokedAt !== undefined) {
    return { ok: false, challenge, reason: "revoked-challenge" };
  }

  if (challenge.consumedAt !== undefined) {
    return { ok: false, challenge, reason: "already-consumed" };
  }

  if (challenge.expiresAt <= now) {
    return { ok: false, challenge, reason: "expired-challenge" };
  }

  const mismatchReason = emailVerificationChallengeMismatchReason(
    challenge,
    normalizeEmailVerificationChallengeExpectation(input),
  );

  if (mismatchReason) {
    return { ok: false, challenge, reason: mismatchReason };
  }

  return { ok: true, challenge };
}

export function consumeEmailVerificationChallenge(
  storage: DurableObjectStorage,
  input: ConsumeEmailVerificationChallengeInput,
): ConsumeEmailVerificationChallengeResult {
  ensureInstanceAuthTables(storage);

  return storage.transactionSync(() => {
    const consumedAt = parseTimestamp(
      "Email verification challenge consumedAt",
      input.now ?? nowIsoString(),
    );
    const validation = validateEmailVerificationChallenge(storage, {
      ...input,
      now: consumedAt,
    });

    if (!validation.ok) {
      return validation;
    }

    storage.sql.exec(
      `
        UPDATE instance_auth_email_verification_challenges
        SET consumed_at = ?
        WHERE challenge_id = ?
      `,
      consumedAt,
      validation.challenge.challengeId,
    );

    return {
      ok: true,
      challenge: {
        ...validation.challenge,
        consumedAt,
      },
    };
  });
}

export function revokeEmailVerificationChallenge(
  storage: DurableObjectStorage,
  challengeId: unknown,
  now: unknown = nowIsoString(),
): RevokeEmailVerificationChallengeResult {
  ensureInstanceAuthTables(storage);

  return storage.transactionSync(() => {
    const id = parseNonEmptyString("Email verification challenge id", challengeId);
    const revokedAt = parseTimestamp("Email verification challenge revokedAt", now);
    const challenge = readEmailVerificationChallengeById(storage, id);

    if (!challenge) {
      return { ok: false, reason: "missing-challenge" };
    }

    if (challenge.revokedAt !== undefined) {
      return { ok: false, challenge, reason: "revoked-challenge" };
    }

    if (challenge.consumedAt !== undefined) {
      return { ok: false, challenge, reason: "already-consumed" };
    }

    if (challenge.expiresAt <= revokedAt) {
      return { ok: false, challenge, reason: "expired-challenge" };
    }

    storage.sql.exec(
      `
        UPDATE instance_auth_email_verification_challenges
        SET revoked_at = ?
        WHERE challenge_id = ?
      `,
      revokedAt,
      challenge.challengeId,
    );

    return {
      ok: true,
      challenge: {
        ...challenge,
        revokedAt,
      },
    };
  });
}

export function generateCollaboratorInvitationToken(byteLength = 32): string {
  const length = parsePositiveInteger("Collaborator invitation token byte length", byteLength);
  const bytes = new Uint8Array(new ArrayBuffer(length));

  crypto.getRandomValues(bytes);

  return base64UrlEncode(bytes);
}

export async function hashCollaboratorInvitationToken(value: unknown): Promise<string> {
  const token = parseBase64UrlString("Collaborator invitation token", value);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));

  return base64UrlEncode(new Uint8Array(digest));
}

export function generateEmailVerificationToken(byteLength = 32): string {
  const length = parsePositiveInteger("Email verification token byte length", byteLength);
  const bytes = new Uint8Array(new ArrayBuffer(length));

  crypto.getRandomValues(bytes);

  return base64UrlEncode(bytes);
}

export async function hashEmailVerificationToken(value: unknown): Promise<string> {
  const token = parseBase64UrlString("Email verification token", value);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));

  return base64UrlEncode(new Uint8Array(digest));
}

export function buildEmailVerificationLink(input: {
  authOrigin: string;
  challengeId: string;
  token: string;
}): string {
  const url = new URL(
    runtimeAuthAccountGateRoutes.emailVerification,
    parseInstanceAuthCanonicalOrigin(input.authOrigin),
  );

  url.searchParams.set(
    "challengeId",
    parseNonEmptyString("Email verification challenge id", input.challengeId),
  );
  url.searchParams.set("token", parseBase64UrlString("Email verification token", input.token));

  return url.toString();
}

export function buildCollaboratorInvitationLink(input: {
  authOrigin: string;
  invitationId: string;
  token: string;
}): string {
  const url = new URL(
    COLLABORATOR_INVITATION_ACCEPT_PATH,
    parseInstanceAuthCanonicalOrigin(input.authOrigin),
  );

  url.searchParams.set(
    "invitationId",
    parseNonEmptyString("Collaborator invitation id", input.invitationId),
  );
  url.searchParams.set("token", parseBase64UrlString("Collaborator invitation token", input.token));

  return url.toString();
}

function readInstanceAuthConfigRow(
  storage: DurableObjectStorage,
): StoredInstanceAuthConfig | undefined {
  const row = storage.sql
    .exec<InstanceAuthConfigRow>(
      `
        SELECT
          canonical_origin,
          relying_party_id,
          relying_party_name,
          created_at,
          updated_at
        FROM instance_auth_config
        WHERE id = 1
      `,
    )
    .next();

  if (row.done) {
    return undefined;
  }

  return {
    canonicalOrigin: row.value.canonical_origin,
    relyingPartyId: row.value.relying_party_id,
    relyingPartyName: row.value.relying_party_name,
    createdAt: row.value.created_at,
    updatedAt: row.value.updated_at,
  };
}

function normalizePasskeyChallengeInput(
  input: CreatePasskeyChallengeInput,
): StoredPasskeyChallenge {
  const id =
    input.id === undefined
      ? crypto.randomUUID()
      : parseNonEmptyString("Passkey challenge id", input.id);
  const kind = parsePasskeyChallengeKind(input.kind);
  const challenge = parseBase64UrlString("Passkey challenge", input.challenge);
  const createdAt = parseTimestamp(
    "Passkey challenge createdAt",
    input.createdAt ?? nowIsoString(),
  );
  const expiresAt = parseTimestamp("Passkey challenge expiresAt", input.expiresAt);

  if (expiresAt <= createdAt) {
    throw new Error("Passkey challenge expiresAt must be after createdAt.");
  }

  if (kind === "registration") {
    if (input.kind !== "registration") {
      throw new Error("Passkey registration challenge kind must be registration.");
    }

    const canonicalOrigin = parseInstanceAuthCanonicalOrigin(input.canonicalOrigin);

    return {
      id,
      kind,
      challenge,
      canonicalOrigin,
      invitationId: parseNonEmptyString(
        "Passkey challenge collaborator invitation id",
        input.invitationId,
      ),
      invitationTokenHash: parseBase64UrlString(
        "Passkey challenge collaborator invitation token hash",
        input.invitationTokenHash,
      ),
      principalId: parseNonEmptyString("Passkey challenge principal id", input.principalId),
      relyingPartyId: parseInstanceAuthRelyingPartyId(input.relyingPartyId, {
        canonicalOrigin,
      }),
      createdAt,
      expiresAt,
    };
  }

  if (input.kind !== "login") {
    throw new Error("Passkey login challenge kind must be login.");
  }

  return {
    id,
    kind,
    challenge,
    createdAt,
    expiresAt,
  };
}

function readPasskeyChallengeByChallenge(
  storage: DurableObjectStorage,
  challenge: string,
): StoredPasskeyChallenge | undefined {
  const row = storage.sql
    .exec<PasskeyChallengeRow>(
      `
        SELECT
          id,
          kind,
          challenge,
          invitation_id,
          invitation_token_hash,
          principal_id,
          registration_origin,
          registration_relying_party_id,
          created_at,
          expires_at,
          consumed_at
        FROM instance_auth_challenges
        WHERE challenge = ?
      `,
      challenge,
    )
    .next();

  return row.done ? undefined : passkeyChallengeFromRow(row.value);
}

function passkeyChallengeFromRow(row: PasskeyChallengeRow): StoredPasskeyChallenge {
  const base = {
    id: row.id,
    challenge: row.challenge,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    ...(row.consumed_at === null ? {} : { consumedAt: row.consumed_at }),
  };

  if (row.kind === "registration") {
    if (
      row.invitation_id === null ||
      row.invitation_token_hash === null ||
      row.principal_id === null ||
      row.registration_origin === null ||
      row.registration_relying_party_id === null
    ) {
      throw new Error("Stored collaborator invitation passkey challenge is missing scope.");
    }

    return {
      ...base,
      kind: "registration",
      canonicalOrigin: row.registration_origin,
      invitationId: row.invitation_id,
      invitationTokenHash: row.invitation_token_hash,
      principalId: row.principal_id,
      relyingPartyId: row.registration_relying_party_id,
    };
  }

  if (row.kind === "login") {
    if (row.principal_id !== null) {
      throw new Error("Stored passkey login challenge must not include a principal id.");
    }

    return {
      ...base,
      kind: "login",
    };
  }

  throw new Error(`Stored passkey challenge has unsupported kind "${row.kind}".`);
}

function migratePrincipalNeutralLoginChallenges(storage: DurableObjectStorage) {
  const tableSql = storage.sql
    .exec<{ sql: string | null }>(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
      passkeyChallengesTableName,
    )
    .toArray()[0]?.sql;

  if (
    tableSql === undefined ||
    tableSql === null ||
    !/kind\s*=\s*'login'\s+AND\s+principal_id\s+IS\s+NOT\s+NULL/i.test(tableSql)
  ) {
    return;
  }

  const legacyTableName = "instance_auth_challenges_principal_login_legacy";

  storage.sql.exec(`DROP TABLE IF EXISTS ${legacyTableName}`);
  storage.sql.exec(`DROP INDEX IF EXISTS ${passkeyChallengesExpiresAtIndexName}`);
  storage.sql.exec(`ALTER TABLE ${passkeyChallengesTableName} RENAME TO ${legacyTableName}`);
  storage.sql.exec(passkeyChallengesTableSql);
  storage.sql.exec(`
    INSERT INTO ${passkeyChallengesTableName} (
      id,
      kind,
      challenge,
      invitation_id,
      invitation_token_hash,
      principal_id,
      registration_origin,
      registration_relying_party_id,
      created_at,
      expires_at,
      consumed_at
    )
    SELECT
      id,
      kind,
      challenge,
      invitation_id,
      invitation_token_hash,
      CASE WHEN kind = 'login' THEN NULL ELSE principal_id END,
      registration_origin,
      registration_relying_party_id,
      created_at,
      expires_at,
      consumed_at
    FROM ${legacyTableName}
  `);
  storage.sql.exec(`DROP TABLE ${legacyTableName}`);
  storage.sql.exec(passkeyChallengesExpiresAtIndexSql);
}

function repairLegacyPasskeyChallengeStorage(storage: DurableObjectStorage) {
  const tableSql = storage.sql
    .exec<{ sql: string | null }>(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
      passkeyChallengesTableName,
    )
    .toArray()[0]?.sql;

  if (
    tableSql === undefined ||
    tableSql === null ||
    /kind\s*=\s*'login'\s+AND\s+principal_id\s+IS\s+NULL/i.test(tableSql)
  ) {
    return;
  }

  const legacyTableName = "instance_auth_challenges_legacy_repair";

  storage.sql.exec(`DROP TABLE IF EXISTS ${legacyTableName}`);
  storage.sql.exec(`DROP INDEX IF EXISTS ${passkeyChallengesExpiresAtIndexName}`);
  storage.sql.exec(`ALTER TABLE ${passkeyChallengesTableName} RENAME TO ${legacyTableName}`);
  storage.sql.exec(passkeyChallengesTableSql);
  storage.sql.exec(`
    INSERT INTO ${passkeyChallengesTableName} (
      id,
      kind,
      challenge,
      invitation_id,
      invitation_token_hash,
      principal_id,
      registration_origin,
      registration_relying_party_id,
      created_at,
      expires_at,
      consumed_at
    )
    SELECT
      id,
      kind,
      challenge,
      invitation_id,
      invitation_token_hash,
      CASE WHEN kind = 'login' THEN NULL ELSE principal_id END,
      registration_origin,
      registration_relying_party_id,
      created_at,
      expires_at,
      consumed_at
    FROM ${legacyTableName}
    WHERE
      kind = 'login'
      OR (
        kind = 'registration'
        AND principal_id IS NOT NULL
        AND invitation_id IS NOT NULL
        AND invitation_token_hash IS NOT NULL
        AND registration_origin IS NOT NULL
        AND registration_relying_party_id IS NOT NULL
      )
  `);
  storage.sql.exec(`DROP TABLE ${legacyTableName}`);
  storage.sql.exec(passkeyChallengesExpiresAtIndexSql);
}

function normalizeCreatePasskeyCredentialInput(
  input: CreatePasskeyCredentialInput,
): StoredPasskeyCredential {
  const createdAt = parseTimestamp(
    "Passkey credential createdAt",
    input.createdAt ?? nowIsoString(),
  );
  const updatedAt = parseTimestamp("Passkey credential updatedAt", input.updatedAt ?? createdAt);

  return {
    credentialId: parseBase64UrlString("Passkey credential id", input.credentialId),
    principalId: parseNonEmptyString("Passkey credential principal id", input.principalId),
    publicKeyBase64Url: publicKeyBase64Url(input.publicKey),
    counter: parseNonNegativeInteger("Passkey credential counter", input.counter),
    transports: parseAuthenticatorTransports(input.transports),
    credentialDeviceType: parseCredentialDeviceType(input.credentialDeviceType),
    credentialBackedUp: parseBoolean("Passkey credential backedUp", input.credentialBackedUp),
    createdAt,
    updatedAt,
  };
}

function readPasskeyCredentialById(
  storage: DurableObjectStorage,
  credentialId: string,
): StoredPasskeyCredential | undefined {
  const row = storage.sql
    .exec<PasskeyCredentialRow>(
      `
        SELECT
          credential_id,
          principal_id,
          public_key_base64url,
          counter,
          transports_json,
          credential_device_type,
          credential_backed_up,
          user_verified,
          last_verified_at,
          last_verification_origin,
          last_verification_relying_party_id,
          created_at,
          updated_at
        FROM instance_auth_passkey_credentials
        WHERE credential_id = ?
      `,
      credentialId,
    )
    .next();

  return row.done ? undefined : passkeyCredentialFromRow(row.value);
}

function passkeyCredentialFromRow(row: PasskeyCredentialRow): StoredPasskeyCredential {
  return {
    credentialId: row.credential_id,
    principalId: row.principal_id,
    publicKeyBase64Url: row.public_key_base64url,
    counter: row.counter,
    transports: parseAuthenticatorTransports(JSON.parse(row.transports_json)),
    credentialDeviceType: parseCredentialDeviceType(row.credential_device_type),
    credentialBackedUp: storedBoolean(row.credential_backed_up),
    ...(row.user_verified === null ? {} : { userVerified: storedBoolean(row.user_verified) }),
    ...(row.last_verified_at === null ? {} : { lastVerifiedAt: row.last_verified_at }),
    ...(row.last_verification_origin === null
      ? {}
      : { lastVerificationOrigin: row.last_verification_origin }),
    ...(row.last_verification_relying_party_id === null
      ? {}
      : { lastVerificationRelyingPartyId: row.last_verification_relying_party_id }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeCreateCentralAuthSessionInput(
  input: CreateCentralAuthSessionInput,
): StoredCentralAuthSession {
  const issuedAt = parseTimestamp(
    "Central auth session issuedAt",
    input.issuedAt ?? nowIsoString(),
  );
  const expiresAt = parseTimestamp("Central auth session expiresAt", input.expiresAt);

  if (expiresAt <= issuedAt) {
    throw new Error("Central auth session expiresAt must be after issuedAt.");
  }

  return {
    sessionIdHash: parseBase64UrlString("Central auth session id hash", input.sessionIdHash),
    instanceId: parseNonEmptyString("Central auth session instance id", input.instanceId),
    principalId: parseNonEmptyString("Central auth session principal id", input.principalId),
    issuedAt,
    expiresAt,
  };
}

function readCentralAuthSessionByHash(
  storage: DurableObjectStorage,
  sessionIdHash: string,
): StoredCentralAuthSession | undefined {
  const row = storage.sql
    .exec<CentralAuthSessionRow>(
      `
        SELECT
          session_id_hash,
          instance_id,
          principal_id,
          issued_at,
          expires_at,
          revoked_at
        FROM instance_auth_central_sessions
        WHERE session_id_hash = ?
      `,
      sessionIdHash,
    )
    .next();

  return row.done ? undefined : centralAuthSessionFromRow(row.value);
}

function centralAuthSessionFromRow(row: CentralAuthSessionRow): StoredCentralAuthSession {
  return {
    sessionIdHash: row.session_id_hash,
    instanceId: row.instance_id,
    principalId: row.principal_id,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    ...(row.revoked_at === null ? {} : { revokedAt: row.revoked_at }),
  };
}

function normalizeHostSessionRevocationVersionInput(
  input: HostSessionRevocationVersionInput,
): HostSessionRevocationVersionInput {
  return {
    instanceId: parseNonEmptyString("Host session instance id", input.instanceId),
    principalId: parseNonEmptyString("Host session principal id", input.principalId),
    ...normalizeInstanceAuthTargetBinding(input),
  };
}

function readHostSessionRevocationVersionByScopeKey(
  storage: DurableObjectStorage,
  scopeKey: string,
): StoredHostSessionRevocationVersion | undefined {
  const row = storage.sql
    .exec<HostSessionRevocationVersionRow>(
      `
        SELECT
          scope_key,
          instance_id,
          principal_id,
          target_origin,
          route_id,
          target_profile,
          access,
          required_role,
          app_install_id,
          storage_identity,
          session_version,
          updated_at
        FROM instance_auth_host_session_versions
        WHERE scope_key = ?
      `,
      scopeKey,
    )
    .next();

  return row.done ? undefined : hostSessionRevocationVersionFromRow(row.value);
}

function hostSessionRevocationVersionFromRow(
  row: HostSessionRevocationVersionRow,
): StoredHostSessionRevocationVersion {
  return {
    instanceId: row.instance_id,
    principalId: row.principal_id,
    targetOrigin: row.target_origin,
    routeId: row.route_id,
    targetProfile: parseInstanceAuthHandoffTargetProfile(row.target_profile),
    access: parseProtectedRuntimeRouteAccess(row.access),
    ...(row.storage_identity === null ? {} : { storageIdentity: row.storage_identity }),
    sessionVersion: parseNonNegativeInteger("Host session revocation version", row.session_version),
    updatedAt: row.updated_at,
  };
}

function hostSessionScopeKey(input: HostSessionRevocationVersionInput): string {
  return JSON.stringify([
    input.instanceId,
    input.principalId,
    input.targetOrigin,
    input.routeId,
    input.targetProfile,
    input.access,
    input.storageIdentity ?? null,
  ]);
}

function normalizeCreateHandoffGrantInput(input: CreateHandoffGrantInput): StoredHandoffGrant {
  const createdAt = parseTimestamp("Handoff grant createdAt", input.createdAt ?? nowIsoString());
  const expiresAt = parseTimestamp("Handoff grant expiresAt", input.expiresAt);

  if (expiresAt <= createdAt) {
    throw new Error("Handoff grant expiresAt must be after createdAt.");
  }

  return {
    grantId:
      input.grantId === undefined
        ? crypto.randomUUID()
        : parseBase64UrlString("Handoff grant id", input.grantId),
    grantSecretHash: parseBase64UrlString("Handoff grant secret hash", input.grantSecretHash),
    instanceId: parseNonEmptyString("Handoff grant instance id", input.instanceId),
    principalId: parseNonEmptyString("Handoff grant principal id", input.principalId),
    ...normalizeInstanceAuthTargetBinding(input),
    returnTo: parsePathOnlyReturnTarget("Handoff grant return target", input.returnTo),
    nonceHash: parseBase64UrlString("Handoff grant nonce hash", input.nonceHash),
    state: parseBase64UrlString("Handoff grant state", input.state),
    createdAt,
    expiresAt,
  };
}

function normalizeConsumeHandoffGrantInput(input: ConsumeHandoffGrantInput): {
  grantSecretHash?: string;
  instanceId?: string;
  nonceHash?: string;
  principalId?: string;
  state?: string;
  target?: InstanceAuthSessionTargetBinding;
} {
  return {
    ...(input.grantSecretHash === undefined
      ? {}
      : {
          grantSecretHash: parseBase64UrlString("Handoff grant secret hash", input.grantSecretHash),
        }),
    ...(input.instanceId === undefined
      ? {}
      : { instanceId: parseNonEmptyString("Handoff grant instance id", input.instanceId) }),
    ...(input.nonceHash === undefined
      ? {}
      : { nonceHash: parseBase64UrlString("Handoff grant nonce hash", input.nonceHash) }),
    ...(input.principalId === undefined
      ? {}
      : { principalId: parseNonEmptyString("Handoff grant principal id", input.principalId) }),
    ...(input.state === undefined
      ? {}
      : { state: parseBase64UrlString("Handoff grant state", input.state) }),
    ...(input.target === undefined
      ? {}
      : { target: normalizeInstanceAuthTargetBinding(input.target) }),
  };
}

function handoffGrantMismatchReason(
  grant: StoredHandoffGrant,
  expected: ReturnType<typeof normalizeConsumeHandoffGrantInput>,
): HandoffGrantMismatchReason | undefined {
  if (
    expected.grantSecretHash !== undefined &&
    expected.grantSecretHash !== grant.grantSecretHash
  ) {
    return "wrong-grant-secret";
  }

  if (expected.instanceId !== undefined && expected.instanceId !== grant.instanceId) {
    return "wrong-instance";
  }

  if (expected.principalId !== undefined && expected.principalId !== grant.principalId) {
    return "wrong-principal";
  }

  if (expected.state !== undefined && expected.state !== grant.state) {
    return "wrong-state";
  }

  if (expected.nonceHash !== undefined && expected.nonceHash !== grant.nonceHash) {
    return "wrong-nonce";
  }

  if (expected.target !== undefined && !instanceAuthTargetBindingsEqual(expected.target, grant)) {
    return "wrong-target";
  }

  return undefined;
}

function readHandoffGrantById(
  storage: DurableObjectStorage,
  grantId: string,
): StoredHandoffGrant | undefined {
  const row = storage.sql
    .exec<HandoffGrantRow>(
      `
        SELECT
          grant_id,
          grant_secret_hash,
          instance_id,
          principal_id,
          target_origin,
          route_id,
          target_profile,
          access,
          required_role,
          app_install_id,
          storage_identity,
          return_to,
          nonce_hash,
          state,
          created_at,
          expires_at,
          consumed_at
        FROM instance_auth_handoff_grants
        WHERE grant_id = ?
      `,
      grantId,
    )
    .next();

  return row.done ? undefined : handoffGrantFromRow(row.value);
}

function readHandoffGrantBySecretHash(
  storage: DurableObjectStorage,
  grantSecretHash: string,
): StoredHandoffGrant | undefined {
  const row = storage.sql
    .exec<HandoffGrantRow>(
      `
        SELECT
          grant_id,
          grant_secret_hash,
          instance_id,
          principal_id,
          target_origin,
          route_id,
          target_profile,
          access,
          required_role,
          app_install_id,
          storage_identity,
          return_to,
          nonce_hash,
          state,
          created_at,
          expires_at,
          consumed_at
        FROM instance_auth_handoff_grants
        WHERE grant_secret_hash = ?
      `,
      grantSecretHash,
    )
    .next();

  return row.done ? undefined : handoffGrantFromRow(row.value);
}

function handoffGrantFromRow(row: HandoffGrantRow): StoredHandoffGrant {
  return {
    grantId: row.grant_id,
    grantSecretHash: row.grant_secret_hash,
    instanceId: row.instance_id,
    principalId: row.principal_id,
    targetOrigin: row.target_origin,
    routeId: row.route_id,
    targetProfile: parseInstanceAuthHandoffTargetProfile(row.target_profile),
    access: parseProtectedRuntimeRouteAccess(row.access),
    ...(row.storage_identity === null ? {} : { storageIdentity: row.storage_identity }),
    returnTo: parsePathOnlyReturnTarget("Stored handoff grant return target", row.return_to),
    nonceHash: row.nonce_hash,
    state: row.state,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    ...(row.consumed_at === null ? {} : { consumedAt: row.consumed_at }),
  };
}

function normalizeCreateCollaboratorInvitationTokenInput(
  input: CreateCollaboratorInvitationTokenInput,
): StoredCollaboratorInvitationToken {
  const createdAt = parseTimestamp(
    "Collaborator invitation token createdAt",
    input.createdAt ?? nowIsoString(),
  );
  const expiresAt = parseTimestamp("Collaborator invitation token expiresAt", input.expiresAt);

  if (expiresAt <= createdAt) {
    throw new Error("Collaborator invitation token expiresAt must be after createdAt.");
  }

  return {
    invitationId: parseNonEmptyString("Collaborator invitation id", input.invitationId),
    tokenHash: parseBase64UrlString("Collaborator invitation token hash", input.tokenHash),
    normalizedTargetEmail: normalizeCollaboratorInvitationTargetEmail(input.targetEmail),
    ...normalizeCollaboratorInvitationTargetFacts(input),
    createdAt,
    expiresAt,
  };
}

function normalizeConsumeCollaboratorInvitationTokenInput(
  input: ConsumeCollaboratorInvitationTokenInput,
): {
  normalizedTargetEmail?: string;
  target?: CollaboratorInvitationTargetFacts;
  tokenHash: string;
} {
  return {
    tokenHash: parseBase64UrlString("Collaborator invitation token hash", input.tokenHash),
    ...(input.targetEmail === undefined
      ? {}
      : {
          normalizedTargetEmail: normalizeCollaboratorInvitationTargetEmail(input.targetEmail),
        }),
    ...(input.target === undefined
      ? {}
      : { target: normalizeCollaboratorInvitationTargetFacts(input.target) }),
  };
}

function collaboratorInvitationTokenMismatchReason(
  token: StoredCollaboratorInvitationToken,
  expected: ReturnType<typeof normalizeConsumeCollaboratorInvitationTokenInput>,
): CollaboratorInvitationTokenMismatchReason | undefined {
  if (expected.tokenHash !== token.tokenHash) {
    return "wrong-token";
  }

  if (
    expected.normalizedTargetEmail !== undefined &&
    expected.normalizedTargetEmail !== token.normalizedTargetEmail
  ) {
    return "wrong-target-email";
  }

  if (
    expected.target !== undefined &&
    !collaboratorInvitationTargetFactsEqual(expected.target, token)
  ) {
    return "wrong-target";
  }

  return undefined;
}

function readCollaboratorInvitationTokenByInvitationId(
  storage: DurableObjectStorage,
  invitationId: string,
): StoredCollaboratorInvitationToken | undefined {
  const row = storage.sql
    .exec<CollaboratorInvitationTokenRow>(
      `
        SELECT
          invitation_id,
          token_hash,
          normalized_target_email,
          target_surface,
          target_app_install_id,
          target_organization,
          created_at,
          expires_at,
          consumed_at,
          revoked_at
        FROM instance_auth_collaborator_invitation_tokens
        WHERE invitation_id = ?
      `,
      invitationId,
    )
    .next();

  return row.done ? undefined : collaboratorInvitationTokenFromRow(row.value);
}

function readCollaboratorInvitationTokenByHash(
  storage: DurableObjectStorage,
  tokenHash: string,
): StoredCollaboratorInvitationToken | undefined {
  const row = storage.sql
    .exec<CollaboratorInvitationTokenRow>(
      `
        SELECT
          invitation_id,
          token_hash,
          normalized_target_email,
          target_surface,
          target_app_install_id,
          target_organization,
          created_at,
          expires_at,
          consumed_at,
          revoked_at
        FROM instance_auth_collaborator_invitation_tokens
        WHERE token_hash = ?
      `,
      tokenHash,
    )
    .next();

  return row.done ? undefined : collaboratorInvitationTokenFromRow(row.value);
}

function collaboratorInvitationTokenFromRow(
  row: CollaboratorInvitationTokenRow,
): StoredCollaboratorInvitationToken {
  return {
    invitationId: row.invitation_id,
    tokenHash: row.token_hash,
    normalizedTargetEmail: row.normalized_target_email,
    targetSurface: parseCollaboratorInvitationTargetSurface(row.target_surface),
    ...(row.target_organization === null ? {} : { targetOrganization: row.target_organization }),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    ...(row.consumed_at === null ? {} : { consumedAt: row.consumed_at }),
    ...(row.revoked_at === null ? {} : { revokedAt: row.revoked_at }),
  };
}

function normalizeCreateEmailVerificationChallengeInput(
  input: CreateEmailVerificationChallengeInput,
): StoredEmailVerificationChallenge {
  const createdAt = parseTimestamp(
    "Email verification challenge createdAt",
    input.createdAt ?? nowIsoString(),
  );
  const expiresAt = parseTimestamp("Email verification challenge expiresAt", input.expiresAt);

  if (expiresAt <= createdAt) {
    throw new Error("Email verification challenge expiresAt must be after createdAt.");
  }

  const displayEmail = normalizeEmailDeliveryAddress("Email verification email", input.email);
  const target = parseAccountCompletionGateTarget(input.target);

  return {
    ...target,
    authOrigin: parseInstanceAuthCanonicalOrigin(input.authOrigin),
    challengeId:
      input.challengeId === undefined
        ? crypto.randomUUID()
        : parseNonEmptyString("Email verification challenge id", input.challengeId),
    createdAt,
    displayEmail,
    expiresAt,
    idempotencyKey: parseNonEmptyString(
      "Email verification challenge idempotency key",
      input.idempotencyKey,
    ),
    normalizedEmail: displayEmail.toLowerCase(),
    principalId: parseNonEmptyString(
      "Email verification challenge principal id",
      input.principalId,
    ),
    purpose: parseEmailVerificationChallengePurpose(input.purpose),
    tokenHash: parseBase64UrlString("Email verification token hash", input.tokenHash),
  };
}

function normalizeEmailVerificationChallengeExpectation(
  input: EmailVerificationChallengeExpectation,
): {
  normalizedEmail?: string;
  principalId?: string;
  purpose?: EmailVerificationChallengePurpose;
  target?: AccountCompletionGateTarget;
  tokenHash: string;
} {
  return {
    ...(input.email === undefined
      ? {}
      : {
          normalizedEmail: normalizeEmailDeliveryAddress(
            "Email verification expected email",
            input.email,
          ).toLowerCase(),
        }),
    ...(input.principalId === undefined
      ? {}
      : {
          principalId: parseNonEmptyString(
            "Email verification expected principal id",
            input.principalId,
          ),
        }),
    ...(input.purpose === undefined
      ? {}
      : { purpose: parseEmailVerificationChallengePurpose(input.purpose) }),
    ...(input.target === undefined
      ? {}
      : { target: parseAccountCompletionGateTarget(input.target) }),
    tokenHash: parseBase64UrlString("Email verification token hash", input.tokenHash),
  };
}

function emailVerificationChallengeMismatchReason(
  challenge: StoredEmailVerificationChallenge,
  expected: ReturnType<typeof normalizeEmailVerificationChallengeExpectation>,
): EmailVerificationChallengeMismatchReason | undefined {
  if (expected.tokenHash !== challenge.tokenHash) {
    return "wrong-token";
  }

  if (
    expected.normalizedEmail !== undefined &&
    expected.normalizedEmail !== challenge.normalizedEmail
  ) {
    return "wrong-email";
  }

  if (expected.purpose !== undefined && expected.purpose !== challenge.purpose) {
    return "wrong-purpose";
  }

  if (expected.principalId !== undefined && expected.principalId !== challenge.principalId) {
    return "wrong-target";
  }

  if (
    expected.target !== undefined &&
    !accountCompletionGateTargetsEqual(expected.target, challenge)
  ) {
    return "wrong-target";
  }

  return undefined;
}

function readEmailVerificationChallengeById(
  storage: DurableObjectStorage,
  challengeId: string,
): StoredEmailVerificationChallenge | undefined {
  const row = storage.sql
    .exec<EmailVerificationChallengeRow>(
      `
        SELECT
          challenge_id,
          idempotency_key,
          token_hash,
          normalized_email,
          display_email,
          purpose,
          principal_id,
          auth_origin,
          target_origin,
          route_id,
          target_profile,
          app_install_id,
          storage_identity,
          selected_organization,
          return_to,
          created_at,
          expires_at,
          consumed_at,
          revoked_at
        FROM instance_auth_email_verification_challenges
        WHERE challenge_id = ?
      `,
      challengeId,
    )
    .next();

  return row.done ? undefined : emailVerificationChallengeFromRow(row.value);
}

function readEmailVerificationChallengeByHash(
  storage: DurableObjectStorage,
  tokenHash: string,
): StoredEmailVerificationChallenge | undefined {
  const row = storage.sql
    .exec<EmailVerificationChallengeRow>(
      `
        SELECT
          challenge_id,
          idempotency_key,
          token_hash,
          normalized_email,
          display_email,
          purpose,
          principal_id,
          auth_origin,
          target_origin,
          route_id,
          target_profile,
          app_install_id,
          storage_identity,
          selected_organization,
          return_to,
          created_at,
          expires_at,
          consumed_at,
          revoked_at
        FROM instance_auth_email_verification_challenges
        WHERE token_hash = ?
      `,
      tokenHash,
    )
    .next();

  return row.done ? undefined : emailVerificationChallengeFromRow(row.value);
}

function readEmailVerificationChallengeByIdempotencyKey(
  storage: DurableObjectStorage,
  idempotencyKey: string,
): StoredEmailVerificationChallenge | undefined {
  const row = storage.sql
    .exec<EmailVerificationChallengeRow>(
      `
        SELECT
          challenge_id,
          idempotency_key,
          token_hash,
          normalized_email,
          display_email,
          purpose,
          principal_id,
          auth_origin,
          target_origin,
          route_id,
          target_profile,
          app_install_id,
          storage_identity,
          selected_organization,
          return_to,
          created_at,
          expires_at,
          consumed_at,
          revoked_at
        FROM instance_auth_email_verification_challenges
        WHERE idempotency_key = ?
      `,
      idempotencyKey,
    )
    .next();

  return row.done ? undefined : emailVerificationChallengeFromRow(row.value);
}

function emailVerificationChallengeFromRow(
  row: EmailVerificationChallengeRow,
): StoredEmailVerificationChallenge {
  return {
    authOrigin: row.auth_origin,
    challengeId: row.challenge_id,
    createdAt: row.created_at,
    displayEmail: row.display_email,
    expiresAt: row.expires_at,
    idempotencyKey: row.idempotency_key,
    normalizedEmail: row.normalized_email,
    principalId: row.principal_id,
    purpose: parseEmailVerificationChallengePurpose(row.purpose),
    returnTo: parsePathOnlyReturnTarget(
      "Email verification challenge return target",
      row.return_to,
    ),
    routeId: row.route_id,
    targetOrigin: row.target_origin,
    targetProfile: parseAccountCompletionGateTargetProfile(row.target_profile),
    tokenHash: row.token_hash,
    ...(row.consumed_at === null ? {} : { consumedAt: row.consumed_at }),
    ...(row.revoked_at === null ? {} : { revokedAt: row.revoked_at }),
    ...(row.selected_organization === null
      ? {}
      : { selectedOrganization: row.selected_organization }),
    ...(row.storage_identity === null ? {} : { storageIdentity: row.storage_identity }),
  };
}

function accountCompletionGateTargetsEqual(
  left: AccountCompletionGateTarget,
  right: AccountCompletionGateTarget,
): boolean {
  return (
    left.returnTo === right.returnTo &&
    left.routeId === right.routeId &&
    left.targetOrigin === right.targetOrigin &&
    left.targetProfile === right.targetProfile &&
    (left.selectedOrganization ?? undefined) === (right.selectedOrganization ?? undefined) &&
    (left.storageIdentity ?? undefined) === (right.storageIdentity ?? undefined)
  );
}

function parseEmailVerificationChallengePurpose(value: unknown): EmailVerificationChallengePurpose {
  return parseStringLiteral(
    "Email verification challenge purpose",
    value,
    emailVerificationChallengePurposes,
  );
}

function parseAccountCompletionGateTargetProfile(
  value: unknown,
): AccountCompletionGateTarget["targetProfile"] {
  return parseAccountCompletionGateTarget({
    returnTo: "/formless/auth",
    routeId: "parse-target-profile",
    storageIdentity: "instance:control-plane",
    targetOrigin: "https://parse-target-profile.example.com",
    targetProfile: value,
  }).targetProfile;
}

function normalizeCollaboratorInvitationTargetFacts(
  input: CollaboratorInvitationTargetFacts,
): CollaboratorInvitationTargetFacts {
  const targetSurface = parseCollaboratorInvitationTargetSurface(input.targetSurface);
  const targetOrganization = parseOptionalNonEmptyString(
    "Collaborator invitation target organization",
    input.targetOrganization,
  );

  switch (targetSurface) {
    case "organization":
      if (targetOrganization === undefined) {
        throw new Error(
          "Collaborator invitation organization target requires target organization only.",
        );
      }

      return {
        targetSurface,
        targetOrganization,
      };
    case "instance":
      if (targetOrganization !== undefined) {
        throw new Error("Collaborator invitation instance target cannot include target ids.");
      }

      return { targetSurface };
  }
}

function collaboratorInvitationTargetFactsEqual(
  left: CollaboratorInvitationTargetFacts,
  right: CollaboratorInvitationTargetFacts,
): boolean {
  return (
    left.targetSurface === right.targetSurface &&
    (left.targetOrganization ?? undefined) === (right.targetOrganization ?? undefined)
  );
}

function normalizeCollaboratorInvitationTargetEmail(value: unknown): string {
  return normalizeEmailDeliveryAddress("Collaborator invitation target email", value).toLowerCase();
}

function parseCollaboratorInvitationTargetSurface(value: unknown): IdentityInvitationTargetSurface {
  return parseStringLiteral(
    "Collaborator invitation target surface",
    value,
    collaboratorInvitationTargetSurfaces,
  );
}

function normalizeInstanceAuthTargetBinding(
  input: InstanceAuthSessionTargetBinding,
): InstanceAuthSessionTargetBinding {
  const access = parseProtectedRuntimeRouteAccess(input.access);
  const storageIdentity = parseOptionalNonEmptyString(
    "Instance auth target storage identity",
    input.storageIdentity,
  );

  if (storageIdentity === undefined) {
    throw new Error("Instance auth target requires a storage identity.");
  }
  const targetProfile = parseInstanceAuthHandoffTargetProfile(input.targetProfile);

  return {
    access,
    targetOrigin: parseInstanceAuthCanonicalOrigin(input.targetOrigin),
    routeId: parseNonEmptyString("Instance auth target route id", input.routeId),
    targetProfile,
    storageIdentity,
  };
}

function instanceAuthTargetBindingsEqual(
  left: InstanceAuthSessionTargetBinding,
  right: InstanceAuthSessionTargetBinding,
): boolean {
  return (
    left.targetOrigin === right.targetOrigin &&
    left.routeId === right.routeId &&
    left.targetProfile === right.targetProfile &&
    left.access === right.access &&
    (left.storageIdentity ?? undefined) === (right.storageIdentity ?? undefined)
  );
}

function parseProtectedRuntimeRouteAccess(
  value: unknown,
): Exclude<RuntimeRouteAccess, "anonymous"> {
  const access = typeof value === "string" ? parseRuntimeRouteAccess(value) : undefined;

  if (access === undefined || access === "anonymous") {
    throw new Error("Instance auth target access must be protected.");
  }

  return access;
}

function parseInstanceAuthHandoffTargetProfile(value: unknown): InstanceAuthHandoffTargetProfile {
  return parseStringLiteral(
    "Instance auth handoff target profile",
    value,
    instanceAuthHandoffTargetProfiles,
  );
}

function parsePasskeyChallengeKind(value: unknown): PasskeyChallengeKind {
  return parseStringLiteral("Passkey challenge kind", value, passkeyChallengeKinds);
}

function parseCredentialDeviceType(value: unknown): CredentialDeviceType {
  return parseStringLiteral("Passkey credential device type", value, credentialDeviceTypes);
}

function parseAuthenticatorTransports(value: unknown): AuthenticatorTransportFuture[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error("Passkey credential transports must be an array.");
  }

  const transports = value.map((transport) =>
    parseStringLiteral("Passkey credential transport", transport, authenticatorTransports),
  );

  return Array.from(new Set(transports));
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

function parseBase64UrlString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  const normalized = value.trim();

  if (!base64UrlPattern.test(normalized)) {
    throw new Error(`${context} must be base64url.`);
  }

  return normalized;
}

function parseNonEmptyString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value.trim();
}

function parseOptionalNonEmptyString(context: string, value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return parseNonEmptyString(context, value);
}

function parsePathOnlyReturnTarget(context: string, value: unknown): AccountRedirectTarget {
  const target = parseAccountRedirectTarget(value);

  if (target === undefined) {
    throw new Error(`${context} must be a safe path-only redirect target.`);
  }

  return target;
}

function parseTimestamp(context: string, value: unknown): string {
  return parseNonEmptyString(context, value);
}

function parseNonNegativeInteger(context: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${context} must be a non-negative integer.`);
  }

  return value;
}

function parsePositiveInteger(context: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`${context} must be a positive integer.`);
  }

  return value;
}

function parseBoolean(context: string, value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${context} must be a boolean.`);
  }

  return value;
}

function storageBoolean(value: boolean): number {
  return value ? 1 : 0;
}

function storedBoolean(value: number): boolean {
  if (value === 0) {
    return false;
  }

  if (value === 1) {
    return true;
  }

  throw new Error("Stored passkey boolean must be 0 or 1.");
}

function publicKeyBase64Url(value: Uint8Array<ArrayBuffer>): string {
  if (!(value instanceof Uint8Array) || value.length === 0) {
    throw new Error("Passkey credential public key must be a non-empty byte array.");
  }

  return base64UrlEncode(value);
}

function base64UrlEncode(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const normalized = parseBase64UrlString("Passkey credential public key", value);
  const base64 = normalized.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  let binary: string;

  try {
    binary = atob(padded);
  } catch {
    throw new Error("Passkey credential public key must be valid base64url.");
  }

  const bytes = new Uint8Array(new ArrayBuffer(binary.length));

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}
