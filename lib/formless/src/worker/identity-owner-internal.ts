import { FORMLESS_PROGRAM_STORAGE_IDENTITY } from "../program/target.ts";
import type { StoredRecord } from "@dpeek/formless-storage";
import type { AccountCompletionGateTarget } from "../shared/instance-auth.ts";
import type { OwnerIdentity } from "../shared/protocol.ts";
import type { AccessCallerFacts } from "@dpeek/formless-schema";

export const INTERNAL_IDENTITY_OWNER_PATH = "/_internal/identity-owner";
export const INTERNAL_IDENTITY_OWNER_RESET_PATH = "/_internal/identity-owner/reset";
export const INTERNAL_IDENTITY_ACTIVE_PRINCIPAL_PATH = "/_internal/identity-owner/active-principal";
export const INTERNAL_IDENTITY_OWNER_PRINCIPAL_PATH =
  "/_internal/identity-owner/principal-authority";
export const INTERNAL_IDENTITY_PRINCIPAL_AUTHORITY_PATH = "/_internal/identity-owner/authority";
export const INTERNAL_IDENTITY_APP_AUTHORITY_PATH = "/_internal/identity-owner/app-authority";
export const INTERNAL_IDENTITY_ACCOUNT_COMPLETION_STATE_PATH =
  "/_internal/identity-owner/account-completion-state";
export const INTERNAL_IDENTITY_EMAIL_VERIFICATION_COMMIT_PATH =
  "/_internal/identity-owner/email-verification-commit";

export type IdentityOwnerInternalEnv = {
  FORMLESS_AUTHORITY?: DurableObjectNamespace;
};

export type ActiveIdentityPrincipal = {
  displayName: string;
  email?: string;
  id: string;
};

export type ActiveIdentityAuthority = {
  callerFacts: Extract<AccessCallerFacts, { kind: "principal" }>;
  id: string;
};

export type ActiveIdentityAppAuthority = {
  appAdmin: boolean;
  appInstallId: string;
  id: string;
  instanceOwner: boolean;
};

export type AccountCompletionIdentityState = {
  accountPolicies: StoredRecord[];
  appRegistrations: StoredRecord[];
  invitations: StoredRecord[];
  memberships: StoredRecord[];
  policyAcceptances: StoredRecord[];
  primaryEmail: StoredRecord | null;
  principal: StoredRecord | null;
  roleAssignments: StoredRecord[];
  roles: StoredRecord[];
};

export async function readInternalActiveIdentityPrincipal(
  env: IdentityOwnerInternalEnv,
  principalId: string,
): Promise<ActiveIdentityPrincipal | null> {
  if (!env.FORMLESS_AUTHORITY) {
    return null;
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_PROGRAM_STORAGE_IDENTITY);
  const url = new URL(`http://internal${INTERNAL_IDENTITY_ACTIVE_PRINCIPAL_PATH}`);

  url.searchParams.set("principalId", principalId);

  const response = await env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(url.toString(), {
      method: "GET",
    }),
  );
  const body = (await response.json()) as {
    error?: string;
    principal?: ActiveIdentityPrincipal | null;
  };

  if (!response.ok) {
    throw new Error(body.error ?? "Identity active principal lookup failed.");
  }

  return body.principal ?? null;
}

export async function readInternalIdentityOwnerForPrincipal(
  env: IdentityOwnerInternalEnv,
  principalId: string,
): Promise<OwnerIdentity | null> {
  if (!env.FORMLESS_AUTHORITY) {
    return null;
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_PROGRAM_STORAGE_IDENTITY);
  const url = new URL(`http://internal${INTERNAL_IDENTITY_OWNER_PRINCIPAL_PATH}`);

  url.searchParams.set("principalId", principalId);

  const response = await env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(url.toString(), {
      method: "GET",
    }),
  );
  const body = (await response.json()) as { error?: string; owner?: OwnerIdentity | null };

  if (!response.ok) {
    throw new Error(body.error ?? "Identity owner principal lookup failed.");
  }

  return body.owner ?? null;
}

export async function readInternalIdentityAuthorityForPrincipal(
  env: IdentityOwnerInternalEnv,
  principalId: string,
): Promise<ActiveIdentityAuthority | null> {
  if (!env.FORMLESS_AUTHORITY) {
    return null;
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_PROGRAM_STORAGE_IDENTITY);
  const url = new URL(`http://internal${INTERNAL_IDENTITY_PRINCIPAL_AUTHORITY_PATH}`);

  url.searchParams.set("principalId", principalId);

  const response = await env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(url.toString(), {
      method: "GET",
    }),
  );
  const body = (await response.json()) as {
    authority?: ActiveIdentityAuthority | null;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(body.error ?? "Identity principal authority lookup failed.");
  }

  return body.authority ?? null;
}

export async function readInternalIdentityAppAuthorityForPrincipal(
  env: IdentityOwnerInternalEnv,
  principalId: string,
  appInstallId: string,
): Promise<ActiveIdentityAppAuthority | null> {
  if (!env.FORMLESS_AUTHORITY) {
    return null;
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_PROGRAM_STORAGE_IDENTITY);
  const url = new URL(`http://internal${INTERNAL_IDENTITY_APP_AUTHORITY_PATH}`);

  url.searchParams.set("principalId", principalId);
  url.searchParams.set("appInstallId", appInstallId);

  const response = await env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(url.toString(), {
      method: "GET",
    }),
  );
  const body = (await response.json()) as {
    authority?: ActiveIdentityAppAuthority | null;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(body.error ?? "Identity app authority lookup failed.");
  }

  return body.authority ?? null;
}

export async function readInternalAccountCompletionIdentityState(
  env: IdentityOwnerInternalEnv,
  input: {
    principalId: string;
    target: AccountCompletionGateTarget;
  },
): Promise<AccountCompletionIdentityState | null> {
  if (!env.FORMLESS_AUTHORITY) {
    return null;
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_PROGRAM_STORAGE_IDENTITY);
  const response = await env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(`http://internal${INTERNAL_IDENTITY_ACCOUNT_COMPLETION_STATE_PATH}`, {
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
  const body = (await response.json()) as {
    error?: string;
    state?: AccountCompletionIdentityState | null;
  };

  if (!response.ok) {
    throw new Error(body.error ?? "Identity account completion state lookup failed.");
  }

  return body.state ?? null;
}
