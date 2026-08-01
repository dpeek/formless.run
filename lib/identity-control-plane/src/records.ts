import type { AppSchema } from "@dpeek/formless-schema";
import type { StoredRecord } from "@dpeek/formless-storage";

import {
  identityControlPlaneEntityIds,
  identityControlPlaneRoleKeys,
  identityControlPlaneSchema,
  reviewableIdentityControlPlaneRecords,
  validateIdentityControlPlaneRecords,
} from "./index.ts";

type IdentityRecordAdapterInput = {
  allRecords: readonly StoredRecord[];
  records: readonly StoredRecord[];
  schema: AppSchema;
};

const builtInRoleCreatedAt = "2026-06-26T00:00:00.000Z";
const identityRoleEntityId = identityControlPlaneSchema.entities.find(
  ({ key }) => key === "role",
)?.id;

if (identityRoleEntityId === undefined) {
  throw new Error('Identity control-plane schema must contain entity "role".');
}

export const identityControlPlaneRecordAdapter = {
  target: "shared",
  kind: "record-adapter",
  key: "identity-control-plane.records",
  entityIds: identityControlPlaneEntityIds,
  adapter: {
    canonicalize(input: IdentityRecordAdapterInput): readonly StoredRecord[] {
      return reviewableIdentityControlPlaneRecords(input.records, {
        authorizationRoles: input.schema.authorization?.roles,
        candidateRecords: input.allRecords,
      });
    },
    validate(context: string, input: IdentityRecordAdapterInput): void {
      validateIdentityRecords(context, input);
    },
    validateCandidate(context: string, input: IdentityRecordAdapterInput): void {
      validateIdentityRecords(context, input);
    },
  },
} as const;

export const identityControlPlaneBootstrapContribution = {
  target: "shared",
  kind: "bootstrap-contribution",
  key: "identity-control-plane.bootstrap",
  entityIds: [identityRoleEntityId],
  contribute: builtInIdentityRoleRecords,
} as const;

function validateIdentityRecords(context: string, input: IdentityRecordAdapterInput): void {
  validateIdentityControlPlaneRecords(
    context,
    input.records.filter((record) => record.deletedAt === undefined),
    {
      authorizationRoles: input.schema.authorization?.roles,
      candidateRecords: input.allRecords,
    },
  );
}

function builtInIdentityRoleRecords(): StoredRecord[] {
  return identityControlPlaneRoleKeys.map((roleKey) => ({
    id: `role:${roleKey}`,
    entity: "role",
    values: {
      key: roleKey,
      displayLabel: roleKey,
      status: "active",
    },
    createdAt: builtInRoleCreatedAt,
    updatedAt: builtInRoleCreatedAt,
  }));
}
