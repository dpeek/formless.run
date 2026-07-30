import type { AuthorityOperation } from "./authority-operations.ts";
import {
  validateInstanceAuthAccessSession,
  type HostAuthSession,
} from "./instance-auth-handoff.ts";
import type { CentralAuthSession } from "./central-auth-session.ts";
import type { InstanceAuthSessionTargetBinding } from "./instance-auth-state.ts";
import type { ActiveIdentityAuthority } from "./identity-owner-internal.ts";
import {
  type OwnerSession,
  type OwnerSessionAuthorityResolver,
  type OwnerSessionEnv,
} from "./owner-session.ts";
import { evaluateAccessRequirement } from "@dpeek/formless-schema";
import {
  FORMLESS_PROGRAM_MANAGEMENT_ACCESS_REQUIREMENT,
  formlessProgramSchema,
} from "../program/runtime.ts";

export type AuthorityAdminGuardEnv = OwnerSessionEnv & {
  FORMLESS_ADMIN_TOKEN?: string;
};

export type AuthorityAdminGuardResult =
  | { authorized: true }
  | {
      authorized: false;
      error: string;
      headers: HeadersInit;
      status: number;
    };

export type InstanceWriteAuthorizationResult =
  | {
      authorized: true;
      session?: CentralAuthSession | HostAuthSession | OwnerSession;
      via: "admin-bearer" | "central-session" | "host-session" | "owner-session" | "open";
    }
  | {
      authorized: false;
      error: string;
      headers: HeadersInit;
      status: number;
    };

export type OwnerManagementReadAuthorizationResult = InstanceWriteAuthorizationResult;
export type OperationalManagementAuthorizationResult = InstanceWriteAuthorizationResult;
export type OperationalManagementAuthorityResolver = (
  session: OwnerSession,
) => Promise<ActiveIdentityAuthority | null>;

export function authorizeAuthorityOperation(
  request: Request,
  operation: AuthorityOperation,
  env: AuthorityAdminGuardEnv,
  options: {
    hostSessionTarget?: InstanceAuthSessionTargetBinding | undefined;
    openAccessAllowed?: boolean;
    resolveOwnerSession?: OwnerSessionAuthorityResolver;
  } = {},
): Promise<AuthorityAdminGuardResult> {
  if (operation.metadata.mode === "read") {
    return Promise.resolve({ authorized: true });
  }

  return authorizeInstanceWrite(request, env, options);
}

export function authorizeAdminWrite(
  request: Request,
  env: AuthorityAdminGuardEnv,
): AuthorityAdminGuardResult {
  const adminToken = normalizedAdminToken(env.FORMLESS_ADMIN_TOKEN);

  if (!adminToken) {
    return { authorized: true };
  }

  if (requestAdminToken(request) === adminToken) {
    return { authorized: true };
  }

  return {
    authorized: false,
    error: "Admin authorization is required for this write endpoint.",
    headers: {
      "WWW-Authenticate": 'Bearer realm="formless-admin"',
    },
    status: 401,
  };
}

export async function authorizeInstanceWrite(
  request: Request,
  env: AuthorityAdminGuardEnv,
  options: {
    hostSessionTarget?: InstanceAuthSessionTargetBinding | undefined;
    openAccessAllowed?: boolean;
    resolveOwnerSession?: OwnerSessionAuthorityResolver;
  } = {},
): Promise<InstanceWriteAuthorizationResult> {
  return authorizeOwnerSessionOrAdmin(request, env, {
    error: "Owner session or admin authorization is required for this write endpoint.",
    ...options,
  });
}

export async function authorizeOwnerManagementRead(
  request: Request,
  env: AuthorityAdminGuardEnv,
  options: {
    hostSessionTarget?: InstanceAuthSessionTargetBinding | undefined;
    resolveOwnerSession?: OwnerSessionAuthorityResolver;
  } = {},
): Promise<OwnerManagementReadAuthorizationResult> {
  return authorizeOwnerSessionOrAdmin(request, env, {
    error: "Owner session or admin authorization is required for this read endpoint.",
    ...options,
  });
}

export async function authorizeOperationalManagement(
  request: Request,
  env: AuthorityAdminGuardEnv,
  options: {
    error?: string;
    hostSessionTarget?: InstanceAuthSessionTargetBinding | undefined;
    resolveManagementAuthority?: OperationalManagementAuthorityResolver;
  } = {},
): Promise<OperationalManagementAuthorizationResult> {
  return authorizeManagementSessionOrAdmin(request, env, {
    ...options,
    error:
      options.error ??
      "Owner session, Program administrator session, or admin authorization is required for this endpoint.",
  });
}

async function authorizeOwnerSessionOrAdmin(
  request: Request,
  env: AuthorityAdminGuardEnv,
  options: {
    error: string;
    hostSessionTarget?: InstanceAuthSessionTargetBinding | undefined;
    openAccessAllowed?: boolean;
    resolveOwnerSession?: OwnerSessionAuthorityResolver;
  },
): Promise<InstanceWriteAuthorizationResult> {
  const adminToken = normalizedAdminToken(env.FORMLESS_ADMIN_TOKEN);
  const sessionProtectionConfigured =
    normalizedAdminToken(env.FORMLESS_OWNER_SESSION_SECRET) !== undefined;

  if (!adminToken && !sessionProtectionConfigured && options.openAccessAllowed !== false) {
    return { authorized: true, via: "open" };
  }

  if (adminToken && requestAdminToken(request) === adminToken) {
    return { authorized: true, via: "admin-bearer" };
  }

  const session = await validateInstanceAuthAccessSession(request, env, {
    ...(options.resolveOwnerSession === undefined
      ? {}
      : {
          readers: {
            readOwnerAuthority: (candidate) =>
              options.resolveOwnerSession?.(candidate as OwnerSession) ?? Promise.resolve(null),
          },
        }),
    requiredAuthority: "owner",
    target: options.hostSessionTarget,
  });

  if (session.ok) {
    return { authorized: true, session: session.session, via: session.via };
  }

  return {
    authorized: false,
    error: options.error,
    headers: {
      "WWW-Authenticate": 'Bearer realm="formless-admin"',
    },
    status: 401,
  };
}

async function authorizeManagementSessionOrAdmin(
  request: Request,
  env: AuthorityAdminGuardEnv,
  options: {
    error: string;
    hostSessionTarget?: InstanceAuthSessionTargetBinding | undefined;
    resolveManagementAuthority?: OperationalManagementAuthorityResolver;
  },
): Promise<OperationalManagementAuthorizationResult> {
  const adminToken = normalizedAdminToken(env.FORMLESS_ADMIN_TOKEN);

  if (
    adminToken &&
    requestAdminToken(request) === adminToken &&
    evaluateAccessRequirement(
      FORMLESS_PROGRAM_MANAGEMENT_ACCESS_REQUIREMENT,
      { actor: "adminBearer", kind: "trusted" },
      formlessProgramSchema,
    )
  ) {
    return { authorized: true, via: "admin-bearer" };
  }

  const session = await validateInstanceAuthAccessSession(request, env, {
    ...(options.resolveManagementAuthority === undefined
      ? {}
      : {
          readers: {
            readManagementAuthority: (candidate) =>
              options.resolveManagementAuthority?.(candidate as OwnerSession) ??
              Promise.resolve(null),
          },
        }),
    requiredAuthority: "management",
    target: options.hostSessionTarget,
  });

  if (session.ok) {
    return { authorized: true, session: session.session, via: session.via };
  }

  return {
    authorized: false,
    error: options.error,
    headers: {
      "WWW-Authenticate": 'Bearer realm="formless-admin"',
    },
    status: 401,
  };
}

function normalizedAdminToken(value: string | undefined) {
  const token = value?.trim();

  return token === "" ? undefined : token;
}

function requestAdminToken(request: Request) {
  const authorization = request.headers.get("Authorization");

  if (!authorization) {
    return undefined;
  }

  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());

  return match?.[1];
}
