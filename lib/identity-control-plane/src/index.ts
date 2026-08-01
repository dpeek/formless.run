import {
  formatQualifiedEntityName,
  isValidStoredFieldValue,
  parseAppSchema,
  parseQualifiedEntityName,
} from "@dpeek/formless-schema";
import { type RecordValues, type StoredRecord } from "@dpeek/formless-storage";
import { identityControlPlaneSourceSchema } from "./schema.ts";
import {
  IDENTITY_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY,
  identityControlPlaneEntityNames,
  identityControlPlaneRoleKeys,
  type IdentityControlPlaneEntityName,
  type IdentityControlPlaneRecordValuesByEntity,
  type IdentityControlPlaneRoleKey,
} from "./types.ts";
import type {
  AccessCallerFacts,
  AuthorizationRoleId,
  AuthorizationRoleSchema,
  KeyedDefinition,
} from "@dpeek/formless-schema";

export * from "./types.ts";
export { identityControlPlaneSourceSchema } from "./schema.ts";

export const identityControlPlaneSchema = parseAppSchema(identityControlPlaneSourceSchema);
export const identityControlPlaneEntityIds = identityControlPlaneSchema.entities.map(
  ({ id }) => id,
);

export type IdentityControlPlaneRecord<Entity extends IdentityControlPlaneEntityName> = {
  createdAt: string;
  deletedAt?: string;
  entity: Entity;
  id: string;
  updatedAt: string;
  values: IdentityControlPlaneRecordValuesByEntity[Entity];
};

export type AnyIdentityControlPlaneRecord = {
  [Entity in IdentityControlPlaneEntityName]: IdentityControlPlaneRecord<Entity>;
}[IdentityControlPlaneEntityName];

export type IdentityControlPlaneRecordValidationOptions = {
  authorizationRoles?: readonly KeyedDefinition<AuthorizationRoleSchema>[];
  candidateRecords?: readonly StoredRecord[];
  context?: string;
  sourceLabel?: string;
};

export type IdentityCollaboratorInvitationGrantAuthority = {
  instanceOwner: boolean;
  principalId: string;
  programAdministrator: boolean;
};

export type IdentityCollaboratorInvitationGrantRecord = Pick<
  StoredRecord,
  "entity" | "id" | "values"
>;

export type IdentityCollaboratorInvitationGrantValidationInput = {
  authorizationRoles: readonly KeyedDefinition<AuthorizationRoleSchema>[];
  grantRecords: readonly IdentityCollaboratorInvitationGrantRecord[];
  inviterPrincipalId: string;
  records: readonly StoredRecord[];
};

export function resolveIdentityProgramCallerFacts(
  records: readonly StoredRecord[],
  principalId: string,
  authorizationRoles: readonly KeyedDefinition<AuthorizationRoleSchema>[],
): Extract<AccessCallerFacts, { kind: "principal" }> {
  const principal = records.find(
    (record) =>
      identityControlPlaneRecordSourceEntityName(record.entity) === "principal" &&
      record.id === principalId &&
      !record.deletedAt,
  );
  const active = principal?.values.status === "active";

  if (!active) {
    return { active: false, kind: "principal", owner: false };
  }

  const ownerRoleId = activeIdentityRoleIdsByKey(records).get("instance.owner");
  const owner = hasActiveIdentityPrincipalRoleAssignment(records, principalId, ownerRoleId);
  const programAssignment = activeStatusRecordsForEntity(records, "program-role-assignment").find(
    (record) => record.values.principal === principalId,
  );
  const roleId = programAssignment?.values.roleId;
  const validRoleId =
    typeof roleId === "string" && authorizationRoles.some((role) => role.id === roleId)
      ? (roleId as AuthorizationRoleId)
      : undefined;

  return {
    active: true,
    kind: "principal",
    owner,
    ...(validRoleId === undefined ? {} : { roleId: validRoleId }),
  };
}

export function isIdentityControlPlaneEntityName(
  value: string,
): value is IdentityControlPlaneEntityName {
  return identityControlPlaneEntityNames.includes(value as IdentityControlPlaneEntityName);
}

export function formatIdentityControlPlaneBoundaryEntityName(
  entityName: IdentityControlPlaneEntityName,
): string {
  return formatQualifiedEntityName({
    schemaKey: IDENTITY_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY,
    entityKey: entityName,
  });
}

export function parseIdentityControlPlaneBoundaryEntityName(
  context: string,
  value: string,
): IdentityControlPlaneEntityName {
  const qualifiedName = parseQualifiedEntityName(context, value);

  if (qualifiedName.schemaKey !== IDENTITY_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY) {
    throw new Error(
      `${context} schema key must be "${IDENTITY_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY}".`,
    );
  }

  if (!isIdentityControlPlaneEntityName(qualifiedName.entityKey)) {
    throw new Error(`${context} "${value}" is not an identity control-plane entity.`);
  }

  return qualifiedName.entityKey;
}

export function parseIdentityControlPlaneEntityName(
  context: string,
  value: unknown,
): IdentityControlPlaneEntityName {
  const entity = parseNonEmptyString(context, value);

  if (isIdentityControlPlaneEntityName(entity)) {
    return entity;
  }

  return parseIdentityControlPlaneBoundaryEntityName(context, entity);
}

export function identityControlPlaneRecordSourceEntityName(
  value: string,
): IdentityControlPlaneEntityName | undefined {
  const localEntity = value.startsWith(`${IDENTITY_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY}:`)
    ? tryParseBoundaryEntityName(value)
    : isIdentityControlPlaneEntityName(value)
      ? value
      : undefined;

  return localEntity !== undefined && isIdentityControlPlaneEntityName(localEntity)
    ? localEntity
    : undefined;
}

export function parseIdentityControlPlaneRecords(context: string, value: unknown): StoredRecord[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array.`);
  }

  return value.map((record, index) =>
    parseIdentityControlPlaneRecord(`${context}[${index}]`, record),
  );
}

export function reviewableIdentityControlPlaneRecords(
  records: readonly StoredRecord[],
  options: IdentityControlPlaneRecordValidationOptions = {},
): StoredRecord[] {
  const context = options.context ?? "Identity control-plane record source records";
  const sourceLabel = options.sourceLabel ?? "Identity control-plane record source";
  const sourceRecords: StoredRecord[] = [];

  for (const record of records) {
    const entity = identityControlPlaneRecordSourceEntityName(record.entity);

    if (entity === undefined) {
      throw new Error(
        `${sourceLabel} does not support entity "${identityEntityLabel(record.entity)}".`,
      );
    }

    sourceRecords.push(canonicalIdentityControlPlaneRecord({ ...record, entity }));
  }

  validateIdentityControlPlaneRecords(context, sourceRecords, options);

  return sourceRecords;
}

export function validateIdentityControlPlaneRecords(
  context: string,
  records: readonly StoredRecord[],
  options: IdentityControlPlaneRecordValidationOptions = {},
) {
  const recordsById = new Map<string, StoredRecord>(
    (options.candidateRecords ?? records).map((record) => [record.id, record]),
  );
  const ownedRecordIds = new Set<string>();

  for (const record of records) {
    if (ownedRecordIds.has(record.id)) {
      throw new Error(`${context} includes duplicate identity record id "${record.id}".`);
    }

    ownedRecordIds.add(record.id);
  }

  for (const record of records) {
    validateIdentityControlPlaneRecord(context, record, recordsById, options);
  }

  validateUniqueNormalizedEmails(context, records);
  validateUniqueRoleKeys(context, records);
  validateUniqueActiveMemberships(context, records);
  validateUniqueActiveProgramRoleAssignments(context, records);
  validateUniqueActiveRoleAssignments(context, records);
  validateUniqueAcceptedPolicyAcceptances(context, records);
}

export function reviewableIdentityControlPlaneRecordValues(
  _entity: IdentityControlPlaneEntityName,
  values: RecordValues,
): RecordValues {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([fieldName]) => fieldName !== "createdAt" && fieldName !== "updatedAt",
    ),
  ) as RecordValues;
}

export function resolveIdentityCollaboratorInvitationGrantAuthority(
  records: readonly StoredRecord[],
  principalId: string,
  authorizationRoles: readonly KeyedDefinition<AuthorizationRoleSchema>[],
): IdentityCollaboratorInvitationGrantAuthority | null {
  const parsedPrincipalId = parseNonEmptyString(
    "Identity collaborator invitation inviter principal id",
    principalId,
  );
  const principal = records.find(
    (record) =>
      identityControlPlaneRecordSourceEntityName(record.entity) === "principal" &&
      record.id === parsedPrincipalId &&
      !record.deletedAt &&
      record.values.status === "active",
  );

  if (!principal) {
    return null;
  }

  const callerFacts = resolveIdentityProgramCallerFacts(records, principal.id, authorizationRoles);
  const administratorRole = authorizationRoles.find((role) => role.key === "administrator");

  return {
    principalId: principal.id,
    instanceOwner: callerFacts.owner,
    programAdministrator:
      administratorRole !== undefined && callerFacts.roleId === administratorRole.id,
  };
}

export function validateIdentityCollaboratorInvitationGrants(
  context: string,
  input: IdentityCollaboratorInvitationGrantValidationInput,
): IdentityCollaboratorInvitationGrantAuthority {
  const authority = resolveIdentityCollaboratorInvitationGrantAuthority(
    input.records,
    input.inviterPrincipalId,
    input.authorizationRoles,
  );

  if (!authority) {
    throw new Error(`${context} requires an active inviter principal.`);
  }

  if (!authority.instanceOwner && !authority.programAdministrator) {
    throw new Error(
      `${context} requires current instance owner or Program administrator authority.`,
    );
  }

  if (authority.instanceOwner) {
    validateOwnerIdentityCollaboratorInvitationGrants(context, input.records, input.grantRecords);
    return authority;
  }

  validateProgramAdministratorIdentityCollaboratorInvitationGrants(
    context,
    input.authorizationRoles,
    input.records,
    input.grantRecords,
  );
  return authority;
}

function parseIdentityControlPlaneRecord(context: string, value: unknown): StoredRecord {
  if (!isPlainRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(
    context,
    value,
    ["id", "entity", "values", "createdAt", "updatedAt"],
    ["deletedAt"],
  );

  const id = parseNonEmptyString(`${context} id`, value.id);
  const entity = parseIdentityControlPlaneEntityName(
    `${context} record "${id}" entity`,
    value.entity,
  );

  return {
    id,
    entity,
    values: parseRecordValues(`${context} values`, value.values),
    createdAt: parseIsoTimestamp(`${context} createdAt`, value.createdAt),
    updatedAt: parseIsoTimestamp(`${context} updatedAt`, value.updatedAt),
    ...(value.deletedAt === undefined
      ? {}
      : { deletedAt: parseIsoTimestamp(`${context} deletedAt`, value.deletedAt) }),
  };
}

function validateIdentityControlPlaneRecord(
  context: string,
  record: StoredRecord,
  recordsById: ReadonlyMap<string, StoredRecord>,
  options: IdentityControlPlaneRecordValidationOptions,
) {
  const entity = identityControlPlaneRecordSourceEntityName(record.entity);

  if (entity === undefined) {
    throw new Error(
      `${context} record "${record.id}" references unknown entity "${identityEntityLabel(record.entity)}".`,
    );
  }

  const entitySchema = identityControlPlaneSchema.entities.find(({ key }) => key === entity)!;
  const fields = entitySchema.fields;

  assertIdentityRecordValuesAreDisplaySafe(context, record);

  for (const fieldName of Object.keys(record.values)) {
    if (!fields.some(({ key }) => key === fieldName)) {
      throw new Error(
        `${context} record "${record.id}" includes unknown field "${identityFieldLabel(record, fieldName)}".`,
      );
    }
  }

  for (const field of fields) {
    const fieldName = field.key;
    const value = record.values[fieldName];

    if (!isValidStoredFieldValue(value, field)) {
      throw new Error(
        `${context} record "${record.id}" has invalid field "${identityFieldLabel(record, fieldName)}".`,
      );
    }

    if (field.type === "reference" && value !== undefined) {
      validateIdentityControlPlaneReference(
        context,
        record,
        fieldName,
        field.to,
        value,
        recordsById,
      );
    }
  }

  if (entity === "membership") {
    validateMembershipRecord(context, record);
  }

  if (entity === "role-assignment") {
    validateRoleAssignmentRecord(context, record);
  }

  if (entity === "program-role-assignment") {
    validateProgramRoleAssignmentRecord(context, record, options.authorizationRoles);
  }

  if (entity === "invitation") {
    validateInvitationRecord(context, record);
  }

  if (entity === "account-policy") {
    validateAccountPolicyRecord(context, record);
  }

  if (entity === "principal-policy-acceptance") {
    validatePrincipalPolicyAcceptanceRecord(context, record);
  }
}

function validateIdentityControlPlaneReference(
  context: string,
  record: StoredRecord,
  fieldName: string,
  entityName: string,
  value: RecordValues[string],
  recordsById: ReadonlyMap<string, StoredRecord>,
) {
  if (typeof value !== "string") {
    return;
  }

  const target = recordsById.get(value);

  if (!target) {
    throw new Error(
      `${context} record "${record.id}" field "${identityFieldLabel(record, fieldName)}" references unknown ${identityEntityLabel(entityName)} record "${value}".`,
    );
  }

  if (identityControlPlaneRecordSourceEntityName(target.entity) !== entityName) {
    throw new Error(
      `${context} record "${record.id}" field "${identityFieldLabel(record, fieldName)}" must reference a ${identityEntityLabel(entityName)} record.`,
    );
  }

  if (target.deletedAt) {
    throw new Error(
      `${context} record "${record.id}" field "${identityFieldLabel(record, fieldName)}" cannot reference tombstoned record "${value}".`,
    );
  }
}

function validateUniqueNormalizedEmails(context: string, records: readonly StoredRecord[]) {
  const seen = new Set<string>();

  for (const record of activeRecordsForEntity(records, "principal-email")) {
    const normalizedEmail = requiredStringValue(context, record, "normalizedEmail");

    if (seen.has(normalizedEmail)) {
      throw new Error(
        `${context} violates unique constraint "${formatIdentityControlPlaneBoundaryEntityName("principal-email")}.uniqueNormalizedEmail".`,
      );
    }

    seen.add(normalizedEmail);
  }
}

function validateUniqueRoleKeys(context: string, records: readonly StoredRecord[]) {
  const seen = new Set<string>();

  for (const record of activeRecordsForEntity(records, "role")) {
    const roleKey = requiredStringValue(context, record, "key");

    if (seen.has(roleKey)) {
      throw new Error(
        `${context} violates unique constraint "${formatIdentityControlPlaneBoundaryEntityName("role")}.uniqueKey".`,
      );
    }

    seen.add(roleKey);
  }
}

function validateUniqueActiveMemberships(context: string, records: readonly StoredRecord[]) {
  const seen = new Set<string>();

  for (const record of activeStatusRecordsForEntity(records, "membership")) {
    const key = identityUniqueKey([
      requiredStringValue(context, record, "principal"),
      requiredStringValue(context, record, "targetKind"),
      selectedMembershipTargetValue(context, record),
    ]);

    if (seen.has(key)) {
      throw new Error(
        `${context} violates identity uniqueness "${formatIdentityControlPlaneBoundaryEntityName("membership")}.uniqueActiveMembership".`,
      );
    }

    seen.add(key);
  }
}

function validateUniqueActiveRoleAssignments(context: string, records: readonly StoredRecord[]) {
  const seen = new Set<string>();

  for (const record of activeStatusRecordsForEntity(records, "role-assignment")) {
    const key = identityUniqueKey([
      requiredStringValue(context, record, "targetKind"),
      selectedRoleAssignmentTargetValue(context, record),
      requiredStringValue(context, record, "scopeKind"),
      selectedRoleAssignmentScopeValue(context, record),
    ]);

    if (seen.has(key)) {
      throw new Error(
        `${context} violates identity uniqueness "${formatIdentityControlPlaneBoundaryEntityName("role-assignment")}.uniqueActiveAssignment".`,
      );
    }

    seen.add(key);
  }
}

function validateUniqueActiveProgramRoleAssignments(
  context: string,
  records: readonly StoredRecord[],
) {
  const seen = new Set<string>();

  for (const record of activeStatusRecordsForEntity(records, "program-role-assignment")) {
    const principal = requiredStringValue(context, record, "principal");

    if (seen.has(principal)) {
      throw new Error(
        `${context} violates identity uniqueness "${formatIdentityControlPlaneBoundaryEntityName("program-role-assignment")}.uniqueActiveAssignment".`,
      );
    }

    seen.add(principal);
  }
}

function validateUniqueAcceptedPolicyAcceptances(
  context: string,
  records: readonly StoredRecord[],
) {
  const seen = new Set<string>();

  for (const record of acceptedStatusRecordsForEntity(records, "principal-policy-acceptance")) {
    const key = identityUniqueKey([
      requiredStringValue(context, record, "principal"),
      requiredStringValue(context, record, "accountPolicy"),
    ]);

    if (seen.has(key)) {
      throw new Error(
        `${context} violates identity uniqueness "${formatIdentityControlPlaneBoundaryEntityName("principal-policy-acceptance")}.uniqueAcceptedPrincipalPolicy".`,
      );
    }

    seen.add(key);
  }
}

function activeRecordsForEntity(
  records: readonly StoredRecord[],
  entityName: IdentityControlPlaneEntityName,
) {
  return records.filter(
    (record) =>
      identityControlPlaneRecordSourceEntityName(record.entity) === entityName && !record.deletedAt,
  );
}

function activeStatusRecordsForEntity(
  records: readonly StoredRecord[],
  entityName: IdentityControlPlaneEntityName,
) {
  return activeRecordsForEntity(records, entityName).filter(
    (record) => record.values.status === "active",
  );
}

function acceptedStatusRecordsForEntity(
  records: readonly StoredRecord[],
  entityName: IdentityControlPlaneEntityName,
) {
  return activeRecordsForEntity(records, entityName).filter(
    (record) => record.values.status === "accepted",
  );
}

function validateOwnerIdentityCollaboratorInvitationGrants(
  context: string,
  currentRecords: readonly StoredRecord[],
  grantRecords: readonly IdentityCollaboratorInvitationGrantRecord[],
) {
  for (const grantRecord of grantRecords) {
    const entity = parseIdentityCollaboratorInvitationGrantEntity(context, grantRecord);

    if (entity === "role-assignment") {
      identityCollaboratorInvitationGrantRoleKey(context, currentRecords, grantRecord);
    }
  }
}

function validateProgramAdministratorIdentityCollaboratorInvitationGrants(
  context: string,
  authorizationRoles: readonly KeyedDefinition<AuthorizationRoleSchema>[],
  currentRecords: readonly StoredRecord[],
  grantRecords: readonly IdentityCollaboratorInvitationGrantRecord[],
) {
  for (const grantRecord of grantRecords) {
    const entity = parseIdentityCollaboratorInvitationGrantEntity(context, grantRecord);

    if (entity === "membership") {
      throw new Error(
        `${context} record "${grantRecord.id}" cannot grant collaborator memberships with Program administrator authority.`,
      );
    }

    if (entity === "principal-email") {
      validateProgramAdministratorCollaboratorInvitationPrincipalEmail(context, grantRecord);
      continue;
    }

    if (entity === "role-assignment") {
      validateProgramAdministratorCollaboratorInvitationRoleAssignment(
        context,
        currentRecords,
        grantRecord,
      );
    }

    if (entity === "program-role-assignment") {
      validateProgramAdministratorCollaboratorInvitationProgramRoleAssignment(
        context,
        authorizationRoles,
        grantRecord,
      );
    }
  }
}

function parseIdentityCollaboratorInvitationGrantEntity(
  context: string,
  record: IdentityCollaboratorInvitationGrantRecord,
): "membership" | "principal" | "principal-email" | "program-role-assignment" | "role-assignment" {
  const entity = identityControlPlaneRecordSourceEntityName(record.entity);

  if (
    entity === "membership" ||
    entity === "principal" ||
    entity === "principal-email" ||
    entity === "program-role-assignment" ||
    entity === "role-assignment"
  ) {
    return entity;
  }

  throw new Error(
    `${context} record "${record.id}" entity "${identityEntityLabel(record.entity)}" is not a supported collaborator invitation grant.`,
  );
}

function validateProgramAdministratorCollaboratorInvitationPrincipalEmail(
  context: string,
  record: IdentityCollaboratorInvitationGrantRecord,
) {
  if (record.values.recovery === true) {
    throw new Error(
      `${context} record "${record.id}" cannot grant recovery email authority with Program administrator authority.`,
    );
  }
}

function validateProgramAdministratorCollaboratorInvitationRoleAssignment(
  context: string,
  currentRecords: readonly StoredRecord[],
  record: IdentityCollaboratorInvitationGrantRecord,
) {
  const grantRecord = storedGrantRecord(record, "role-assignment");
  const roleKey = identityCollaboratorInvitationGrantRoleKey(context, currentRecords, record);
  const targetKind = requiredStringValue(context, grantRecord, "targetKind");
  const scopeKind = requiredStringValue(context, grantRecord, "scopeKind");

  if (targetKind !== "principal") {
    throw new Error(
      `${context} record "${record.id}" cannot grant non-principal role assignments with Program administrator authority.`,
    );
  }

  if (scopeKind === "organization") {
    throw new Error(
      `${context} record "${record.id}" cannot grant organization-scoped roles with Program administrator authority.`,
    );
  }

  if (roleKey === "instance.owner") {
    throw new Error(
      `${context} record "${record.id}" cannot grant instance.owner with Program administrator authority.`,
    );
  }

  if (scopeKind === "instance") {
    throw new Error(
      `${context} record "${record.id}" cannot grant legacy instance roles with Program administrator authority.`,
    );
  }

  throw new Error(
    `${context} record "${record.id}" cannot grant scope "${scopeKind}" with Program administrator authority.`,
  );
}

function validateProgramAdministratorCollaboratorInvitationProgramRoleAssignment(
  context: string,
  authorizationRoles: readonly KeyedDefinition<AuthorizationRoleSchema>[],
  record: IdentityCollaboratorInvitationGrantRecord,
) {
  const roleId = requiredStringValue(
    context,
    storedGrantRecord(record, "program-role-assignment"),
    "roleId",
  );
  const role = authorizationRoles.find((candidate) => candidate.id === roleId);

  if (
    role === undefined ||
    (role.key !== "member" && role.key !== "editor" && role.key !== "administrator")
  ) {
    throw new Error(
      `${context} record "${record.id}" references a Program role unavailable to Program administrators.`,
    );
  }
}

function identityCollaboratorInvitationGrantRoleKey(
  context: string,
  currentRecords: readonly StoredRecord[],
  record: IdentityCollaboratorInvitationGrantRecord,
): IdentityControlPlaneRoleKey {
  const roleId = requiredStringValue(context, storedGrantRecord(record, "role-assignment"), "role");
  const role = currentRecords.find(
    (candidate) =>
      identityControlPlaneRecordSourceEntityName(candidate.entity) === "role" &&
      candidate.id === roleId &&
      !candidate.deletedAt &&
      candidate.values.status === "active",
  );
  const roleKey = role?.values.key;

  if (typeof roleKey === "string" && isIdentityControlPlaneRoleKey(roleKey)) {
    return roleKey;
  }

  throw new Error(
    `${context} record "${record.id}" references an unsupported collaborator invitation role.`,
  );
}

function activeIdentityRoleIdsByKey(
  records: readonly StoredRecord[],
): Map<IdentityControlPlaneRoleKey, string> {
  const roles = new Map<IdentityControlPlaneRoleKey, string>();

  for (const record of activeStatusRecordsForEntity(records, "role")) {
    const roleKey = record.values.key;

    if (typeof roleKey === "string" && isIdentityControlPlaneRoleKey(roleKey)) {
      roles.set(roleKey, record.id);
    }
  }

  return roles;
}

function hasActiveIdentityPrincipalRoleAssignment(
  records: readonly StoredRecord[],
  principalId: string,
  roleId: string | undefined,
): boolean {
  if (roleId === undefined) {
    return false;
  }

  return activeStatusRecordsForEntity(records, "role-assignment").some(
    (record) =>
      record.values.role === roleId &&
      record.values.targetKind === "principal" &&
      record.values.targetPrincipal === principalId &&
      record.values.scopeKind === "instance",
  );
}

function isIdentityControlPlaneRoleKey(value: string): value is IdentityControlPlaneRoleKey {
  return identityControlPlaneRoleKeys.includes(value as IdentityControlPlaneRoleKey);
}

function storedGrantRecord(
  record: IdentityCollaboratorInvitationGrantRecord,
  entity: IdentityControlPlaneEntityName,
): StoredRecord {
  return {
    id: record.id,
    entity,
    values: record.values,
    createdAt: "",
    updatedAt: "",
  };
}

function validateMembershipRecord(context: string, record: StoredRecord) {
  const targetKind = requiredStringValue(context, record, "targetKind");

  assertSelectedTargetField(context, record, "targetKind", targetKind, {
    group: "targetGroup",
    organization: "targetOrganization",
  });
}

function validateRoleAssignmentRecord(context: string, record: StoredRecord) {
  const targetKind = requiredStringValue(context, record, "targetKind");
  const scopeKind = requiredStringValue(context, record, "scopeKind");

  assertSelectedTargetField(context, record, "targetKind", targetKind, {
    group: "targetGroup",
    organization: "targetOrganization",
    principal: "targetPrincipal",
  });
  assertSelectedTargetField(context, record, "scopeKind", scopeKind, {
    organization: "scopeOrganization",
  });

  if (scopeKind === "instance") {
    assertUnsetFields(context, record, "scopeKind", ["scopeOrganization"]);
  }
}

function validateProgramRoleAssignmentRecord(
  context: string,
  record: StoredRecord,
  roles: readonly KeyedDefinition<AuthorizationRoleSchema>[] | undefined,
) {
  const roleId = requiredStringValue(context, record, "roleId");

  if (roles === undefined || !roles.some((role) => role.id === roleId)) {
    throw new Error(
      `${context} record "${record.id}" field "${identityFieldLabel(record, "roleId")}" references unknown Program role id "${roleId}".`,
    );
  }
}

function validateInvitationRecord(context: string, record: StoredRecord) {
  const targetSurface = requiredStringValue(context, record, "targetSurface");

  assertSelectedTargetField(context, record, "targetSurface", targetSurface, {
    organization: "targetOrganization",
  });

  if (targetSurface === "instance") {
    assertUnsetFields(context, record, "targetSurface", ["targetOrganization"]);
  }
}

function validateAccountPolicyRecord(context: string, record: StoredRecord) {
  const scopeKind = requiredStringValue(context, record, "scopeKind");

  assertKnownFieldStringValue(context, record, "scopeKind", ["instance", "organization"]);
  assertKnownFieldStringValue(context, record, "status", ["active", "retired"]);
  assertSelectedTargetField(context, record, "scopeKind", scopeKind, {
    organization: "scopeOrganization",
  });

  if (scopeKind === "instance") {
    assertUnsetFields(context, record, "scopeKind", ["scopeOrganization"]);
  }
}

function validatePrincipalPolicyAcceptanceRecord(context: string, record: StoredRecord) {
  assertKnownFieldStringValue(context, record, "status", ["accepted", "revoked"]);
}

function selectedMembershipTargetValue(context: string, record: StoredRecord): string {
  const targetKind = requiredStringValue(context, record, "targetKind");

  if (targetKind === "group") {
    return requiredStringValue(context, record, "targetGroup");
  }

  return requiredStringValue(context, record, "targetOrganization");
}

function selectedRoleAssignmentTargetValue(context: string, record: StoredRecord): string {
  const targetKind = requiredStringValue(context, record, "targetKind");

  if (targetKind === "group") {
    return requiredStringValue(context, record, "targetGroup");
  }

  if (targetKind === "organization") {
    return requiredStringValue(context, record, "targetOrganization");
  }

  return requiredStringValue(context, record, "targetPrincipal");
}

function selectedRoleAssignmentScopeValue(context: string, record: StoredRecord): string {
  const scopeKind = requiredStringValue(context, record, "scopeKind");

  if (scopeKind === "organization") {
    return requiredStringValue(context, record, "scopeOrganization");
  }

  return "";
}

function identityUniqueKey(values: readonly string[]) {
  return JSON.stringify(values);
}

function assertSelectedTargetField(
  context: string,
  record: StoredRecord,
  selectorField: string,
  selectorValue: string,
  selectedFields: Record<string, string>,
) {
  const selectedField = selectedFields[selectorValue];

  if (selectedField === undefined) {
    return;
  }

  const value = record.values[selectedField];

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(
      `${context} record "${record.id}" field "${identityFieldLabel(record, selectorField)}" requires field "${identityFieldLabel(record, selectedField)}".`,
    );
  }

  assertUnsetFields(
    context,
    record,
    selectorField,
    Object.values(selectedFields).filter((fieldName) => fieldName !== selectedField),
  );
}

function assertUnsetFields(
  context: string,
  record: StoredRecord,
  selectorField: string,
  fieldNames: readonly string[],
) {
  for (const fieldName of fieldNames) {
    if (record.values[fieldName] !== undefined) {
      throw new Error(
        `${context} record "${record.id}" field "${identityFieldLabel(record, selectorField)}" cannot set field "${identityFieldLabel(record, fieldName)}".`,
      );
    }
  }
}

function assertKnownFieldStringValue(
  context: string,
  record: StoredRecord,
  fieldName: string,
  allowedValues: readonly string[],
) {
  const value = requiredStringValue(context, record, fieldName);

  if (!allowedValues.includes(value)) {
    throw new Error(
      `${context} record "${record.id}" has invalid field "${identityFieldLabel(record, fieldName)}".`,
    );
  }
}

function assertIdentityRecordValuesAreDisplaySafe(context: string, record: StoredRecord) {
  for (const [fieldName, value] of Object.entries(record.values)) {
    if (isForbiddenIdentityPrivateAuthFieldName(fieldName)) {
      throw new Error(
        `${context} record "${record.id}" field "${identityFieldLabel(record, fieldName)}" cannot store private auth state.`,
      );
    }

    if (typeof value === "string") {
      assertIdentityStringValueIsDisplaySafe(context, record, fieldName, value);
    }
  }
}

function assertIdentityStringValueIsDisplaySafe(
  context: string,
  record: StoredRecord,
  fieldName: string,
  value: string,
) {
  if (value.includes("-----BEGIN PRIVATE KEY-----")) {
    throw new Error(
      `${context} record "${record.id}" field "${identityFieldLabel(record, fieldName)}" cannot store private auth state.`,
    );
  }

  const parsed = parseMaybeJson(value);

  if (parsed !== undefined) {
    assertIdentityJsonValueIsDisplaySafe(context, record, fieldName, parsed);
  }
}

function assertIdentityJsonValueIsDisplaySafe(
  context: string,
  record: StoredRecord,
  fieldName: string,
  value: unknown,
) {
  if (Array.isArray(value)) {
    for (const item of value) {
      assertIdentityJsonValueIsDisplaySafe(context, record, fieldName, item);
    }

    return;
  }

  if (typeof value === "string") {
    assertIdentityStringValueIsDisplaySafe(context, record, fieldName, value);
    return;
  }

  if (!isPlainRecord(value)) {
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    if (isForbiddenIdentityPrivateAuthFieldName(key)) {
      throw new Error(
        `${context} record "${record.id}" field "${identityFieldLabel(record, fieldName)}" cannot store private auth state.`,
      );
    }

    assertIdentityJsonValueIsDisplaySafe(context, record, fieldName, item);
  }
}

function parseMaybeJson(value: string): Record<string, unknown> | unknown[] | undefined {
  const trimmed = value.trim();

  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;

    if (Array.isArray(parsed)) {
      return parsed;
    }

    return isPlainRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isForbiddenIdentityPrivateAuthFieldName(fieldName: string) {
  const normalized = normalizeIdentityPrivateAuthText(fieldName);

  return (
    normalized === "token" ||
    normalized.endsWith("_token") ||
    normalized.includes("token_hash") ||
    normalized.includes("raw_token") ||
    normalized.includes("invite_token") ||
    normalized.includes("challenge") ||
    normalized.includes("credential") ||
    normalized.includes("password") ||
    normalized.includes("session") ||
    normalized.includes("cross_domain_grant") ||
    normalized.includes("grant_id") ||
    normalized.includes("recovery_secret") ||
    normalized.includes("provider_response") ||
    normalized.includes("provider_state") ||
    normalized.includes("revocation") ||
    normalized.includes("secret")
  );
}

function normalizeIdentityPrivateAuthText(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function tryParseBoundaryEntityName(value: string): string | undefined {
  try {
    return parseQualifiedEntityName("Identity control-plane record entity", value).entityKey;
  } catch {
    return undefined;
  }
}

function canonicalIdentityControlPlaneRecord(record: StoredRecord): StoredRecord {
  const entity = parseIdentityControlPlaneEntityName(
    `Identity control-plane record "${record.id}" entity`,
    record.entity,
  );

  return {
    id: record.id,
    entity,
    values: stableJsonValue(
      reviewableIdentityControlPlaneRecordValues(entity, record.values),
    ) as RecordValues,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(record.deletedAt === undefined ? {} : { deletedAt: record.deletedAt }),
  };
}

function requiredStringValue(context: string, record: StoredRecord, fieldName: string): string {
  const value = record.values[fieldName];

  if (typeof value !== "string") {
    throw new Error(
      `${context} record "${record.id}" field "${identityFieldLabel(record, fieldName)}" must be a string.`,
    );
  }

  return value;
}

function identityEntityLabel(entityName: string): string {
  const sourceEntity = identityControlPlaneRecordSourceEntityName(entityName);

  if (sourceEntity !== undefined) {
    return formatIdentityControlPlaneBoundaryEntityName(sourceEntity);
  }

  return entityName;
}

function identityFieldLabel(record: Pick<StoredRecord, "entity">, fieldName: string): string {
  return `${identityEntityLabel(record.entity)}.${fieldName}`;
}

function parseRecordValues(context: string, value: unknown): RecordValues {
  if (!isPlainRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  const values: RecordValues = {};

  for (const [fieldName, fieldValue] of Object.entries(value)) {
    if (
      typeof fieldValue !== "string" &&
      typeof fieldValue !== "boolean" &&
      !isFiniteNumber(fieldValue)
    ) {
      throw new Error(`${context} field "${fieldName}" must be a scalar value.`);
    }

    values[fieldName] = fieldValue;
  }

  return values;
}

function parseIsoTimestamp(context: string, value: unknown): string {
  const timestamp = parseNonEmptyString(context, value);
  const date = new Date(timestamp);

  if (Number.isNaN(date.valueOf()) || date.toISOString() !== timestamp) {
    throw new Error(`${context} must be an ISO timestamp.`);
  }

  return timestamp;
}

function parseNonEmptyString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value;
}

function assertExactKeys(
  context: string,
  value: Record<string, unknown>,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
) {
  const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);

  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${context} has unsupported key "${key}".`);
    }
  }

  for (const key of requiredKeys) {
    if (!(key in value)) {
      throw new Error(`${context} must include "${key}".`);
    }
  }
}

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableJsonValue);
  }

  if (!isPlainRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableJsonValue(child)]),
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
