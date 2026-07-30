import {
  assertExactKeys,
  isRecord,
  parseKeyedDefinitionArray,
  parseRequiredNonEmptyString,
} from "./schema-parse-helpers.ts";
import type {
  AccessActor,
  AccessCallerFacts,
  AccessRequirement,
  AppAuthorizationSchema,
  AppSchema,
  AuthorizationRoleId,
  AuthorizationRoleSchema,
  DirectAccessRequirement,
  KeyedDefinition,
  TrustedAccessActor,
} from "./types.ts";

const authorizationRoleIdPattern =
  /^role_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const accessActors = [
  "anonymous",
  "authenticated",
  "owner",
  "runner",
  "deployer",
  "adminBearer",
] as const satisfies readonly AccessActor[];

export const trustedAccessActors = [
  "runner",
  "deployer",
  "adminBearer",
] as const satisfies readonly TrustedAccessActor[];

export function isAuthorizationRoleId(value: unknown): value is AuthorizationRoleId {
  return typeof value === "string" && authorizationRoleIdPattern.test(value);
}

export function parseAuthorizationRoleId(context: string, value: unknown): AuthorizationRoleId {
  if (!isAuthorizationRoleId(value)) {
    throw new Error(`${context} must use "role_<lowercase-uuid>" format.`);
  }

  return value;
}

export function parseAppAuthorization(value: unknown): AppAuthorizationSchema | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error("Schema authorization must be an object.");
  }

  assertExactKeys("Schema authorization", value, ["roles"]);
  const roles = parseKeyedDefinitionArray(
    "Schema authorization roles",
    value.roles,
    (roleKey, role) => parseAuthorizationRole(roleKey, role),
  );
  if (roles.length === 0) {
    throw new Error("Schema authorization roles must not be empty.");
  }

  const roleKeysById = new Map<AuthorizationRoleId, string>();
  for (const role of roles) {
    const existingRoleKey = roleKeysById.get(role.id);
    if (existingRoleKey !== undefined) {
      throw new Error(
        `Schema authorization roles contain duplicate role id "${role.id}" for keys "${existingRoleKey}" and "${role.key}".`,
      );
    }
    roleKeysById.set(role.id, role.key);
  }

  return { roles };
}

export function parseAccessRequirement(
  value: unknown,
  schema: Pick<AppSchema, "authorization">,
  context = "Access requirement",
): AccessRequirement {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  const forms = ["actor", "role", "anyOf"].filter((key) => key in value);
  if (forms.length !== 1) {
    throw new Error(`${context} must declare exactly one of "actor", "role", or "anyOf".`);
  }

  if ("actor" in value) {
    return parseActorAccessRequirement(context, value);
  }
  if ("role" in value) {
    return parseRoleAccessRequirement(context, value, schema);
  }

  assertExactKeys(context, value, ["anyOf"]);
  if (!Array.isArray(value.anyOf) || value.anyOf.length === 0) {
    throw new Error(`${context} anyOf must be a non-empty array.`);
  }
  return {
    anyOf: value.anyOf.map((alternative, index) =>
      parseDirectAccessRequirement(`${context} anyOf[${index}]`, alternative, schema),
    ),
  };
}

export function evaluateAccessRequirement(
  requirement: AccessRequirement,
  caller: AccessCallerFacts | undefined,
  schema: AppSchema,
): boolean {
  let parsedRequirement: AccessRequirement;
  let roles: KeyedDefinition<AuthorizationRoleSchema>[];
  try {
    parsedRequirement = parseAccessRequirement(requirement, schema);
    roles = validatedAuthorizationRoles(schema);
  } catch {
    return false;
  }

  if (!isValidAccessCallerFacts(caller, roles)) {
    return false;
  }

  if ("anyOf" in parsedRequirement) {
    return parsedRequirement.anyOf.some((alternative) =>
      evaluateDirectAccessRequirement(alternative, caller, roles),
    );
  }
  return evaluateDirectAccessRequirement(parsedRequirement, caller, roles);
}

function parseAuthorizationRole(
  roleKey: string,
  value: Record<string, unknown>,
): AuthorizationRoleSchema {
  const context = `Authorization role "${roleKey}"`;
  assertExactKeys(context, value, ["key", "id", "label"]);
  if (isAccessActor(roleKey)) {
    throw new Error(`${context} key is reserved for an intrinsic or trusted access actor.`);
  }

  return {
    id: parseAuthorizationRoleId(`${context} id`, value.id),
    label: parseRequiredNonEmptyString(`${context} label`, value.label),
  };
}

function parseDirectAccessRequirement(
  context: string,
  value: unknown,
  schema: Pick<AppSchema, "authorization">,
): DirectAccessRequirement {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }
  if ("anyOf" in value) {
    throw new Error(
      `${context} must be a direct actor or role requirement; nested anyOf is unsupported.`,
    );
  }

  const forms = ["actor", "role"].filter((key) => key in value);
  if (forms.length !== 1) {
    throw new Error(`${context} must declare exactly one of "actor" or "role".`);
  }
  return "actor" in value
    ? parseActorAccessRequirement(context, value)
    : parseRoleAccessRequirement(context, value, schema);
}

function parseActorAccessRequirement(
  context: string,
  value: Record<string, unknown>,
): DirectAccessRequirement {
  assertExactKeys(context, value, ["actor"]);
  if (!isAccessActor(value.actor)) {
    throw new Error(
      `${context} actor must be anonymous, authenticated, owner, runner, deployer, or adminBearer.`,
    );
  }
  return { actor: value.actor };
}

function parseRoleAccessRequirement(
  context: string,
  value: Record<string, unknown>,
  schema: Pick<AppSchema, "authorization">,
): DirectAccessRequirement {
  assertExactKeys(context, value, ["role"]);
  const role = parseRequiredNonEmptyString(`${context} role`, value.role);
  const roles = validatedAuthorizationRoles(schema);
  if (!roles.some((definition) => definition.key === role)) {
    throw new Error(`${context} references unknown authorization role "${role}".`);
  }
  return { role };
}

function validatedAuthorizationRoles(
  schema: Pick<AppSchema, "authorization">,
): KeyedDefinition<AuthorizationRoleSchema>[] {
  const roles = schema.authorization?.roles ?? [];
  const keys = new Set<string>();
  const ids = new Set<AuthorizationRoleId>();

  for (const [index, role] of roles.entries()) {
    if (!isRecord(role)) {
      throw new Error(`Schema authorization roles[${index}] must be an object.`);
    }
    assertExactKeys(`Schema authorization roles[${index}]`, role, ["key", "id", "label"]);
    const key = parseRequiredNonEmptyString(`Schema authorization roles[${index}] key`, role.key);
    if (keys.has(key)) {
      throw new Error(`Schema authorization roles contains duplicate key "${key}".`);
    }
    if (isAccessActor(key)) {
      throw new Error(
        `Authorization role "${key}" key is reserved for an intrinsic or trusted access actor.`,
      );
    }
    keys.add(key);

    const id = parseAuthorizationRoleId(`Authorization role "${key}" id`, role.id);
    if (ids.has(id)) {
      throw new Error(`Schema authorization roles contains duplicate role id "${id}".`);
    }
    ids.add(id);
    parseRequiredNonEmptyString(`Authorization role "${key}" label`, role.label);
  }

  return roles;
}

function evaluateDirectAccessRequirement(
  requirement: DirectAccessRequirement,
  caller: AccessCallerFacts,
  roles: KeyedDefinition<AuthorizationRoleSchema>[],
): boolean {
  if ("actor" in requirement) {
    if (requirement.actor === "anonymous") {
      return caller.kind === "anonymous" || (caller.kind === "principal" && caller.active);
    }
    if (requirement.actor === "authenticated") {
      return caller.kind === "principal" && caller.active;
    }
    if (requirement.actor === "owner") {
      return caller.kind === "principal" && caller.active && caller.owner;
    }
    return caller.kind === "trusted" && caller.actor === requirement.actor;
  }

  if (caller.kind !== "principal" || !caller.active) {
    return false;
  }
  if (caller.owner) {
    return true;
  }
  if (caller.roleId === undefined) {
    return false;
  }

  const requiredIndex = roles.findIndex((role) => role.key === requirement.role);
  const callerIndex = roles.findIndex((role) => role.id === caller.roleId);
  return requiredIndex >= 0 && callerIndex >= requiredIndex;
}

function isValidAccessCallerFacts(
  value: unknown,
  roles: KeyedDefinition<AuthorizationRoleSchema>[],
): value is AccessCallerFacts {
  if (!isRecord(value)) {
    return false;
  }

  if (value.kind === "anonymous") {
    return hasExactKeys(value, ["kind"]);
  }

  if (value.kind === "trusted") {
    return (
      hasExactKeys(value, ["kind", "actor"]) &&
      trustedAccessActors.includes(value.actor as TrustedAccessActor)
    );
  }

  if (value.kind !== "principal") {
    return false;
  }
  if (!hasExactKeys(value, ["kind", "active", "owner"], ["roleId"])) {
    return false;
  }
  if (typeof value.active !== "boolean" || typeof value.owner !== "boolean") {
    return false;
  }
  if (value.roleId === undefined) {
    return true;
  }
  return isAuthorizationRoleId(value.roleId) && roles.some((role) => role.id === value.roleId);
}

function hasExactKeys(
  value: Record<string, unknown>,
  required: string[],
  optional: string[] = [],
): boolean {
  const keys = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => key in value) && keys.every((key) => allowed.has(key));
}

function isAccessActor(value: unknown): value is AccessActor {
  return accessActors.includes(value as AccessActor);
}
