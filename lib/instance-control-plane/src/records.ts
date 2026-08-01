import type { AppSchema } from "@dpeek/formless-schema";
import type { RecordValues, StoredRecord } from "@dpeek/formless-storage";

import {
  instanceControlPlaneEntityIds,
  instanceControlPlaneSchema,
  parseInstanceControlPlaneEntityName,
  reviewableInstanceControlPlaneRecordValues,
  reviewableInstanceControlPlaneRecords,
  validateInstanceControlPlaneRecords,
} from "./index.ts";

type InstanceRecordAdapterInput = {
  allRecords: readonly StoredRecord[];
  records: readonly StoredRecord[];
  schema: AppSchema;
};

const deploymentConfigEntityId = instanceEntityId("deployment-config");

export const instanceControlPlaneRecordAdapter = {
  target: "shared",
  kind: "record-adapter",
  key: "instance-control-plane.records",
  entityIds: instanceControlPlaneEntityIds,
  adapter: {
    canonicalize(input: InstanceRecordAdapterInput): readonly StoredRecord[] {
      return reviewableInstanceControlPlaneRecords(input.records, {
        candidateRecords: input.allRecords,
      });
    },
    validate(context: string, input: InstanceRecordAdapterInput): void {
      validateInstanceRecords(context, input);
    },
    validateCandidate(context: string, input: InstanceRecordAdapterInput): void {
      validateInstanceRecords(context, input);
    },
  },
} as const;

export const instanceControlPlaneCreateIdContribution = {
  target: "shared",
  kind: "create-id-contribution",
  key: "instance-control-plane.create-id",
  entityIds: [deploymentConfigEntityId],
  createId(entity: string, values: RecordValues): string | undefined {
    const id = values.targetId;

    return entity === "deployment-config" && typeof id === "string" ? id : undefined;
  },
} as const;

function validateInstanceRecords(context: string, input: InstanceRecordAdapterInput): void {
  validateInstanceControlPlaneRecords(
    context,
    input.records
      .filter((record) => record.deletedAt === undefined)
      .map((record) => reviewableInstanceRecord(record, input.schema)),
    {
      candidateRecords: input.allRecords.map((record) =>
        reviewableInstanceRecord(record, input.schema),
      ),
    },
  );
}

function reviewableInstanceRecord(record: StoredRecord, schema: AppSchema): StoredRecord {
  const entity = schema.entities.find((candidate) => candidate.key === record.entity);

  if (entity === undefined || !instanceControlPlaneEntityIds.includes(entity.id)) {
    return record;
  }

  const entityName = parseInstanceControlPlaneEntityName(
    `Instance control-plane record "${record.id}" entity`,
    record.entity,
  );

  return {
    ...record,
    values: reviewableInstanceControlPlaneRecordValues(entityName, record.values),
  };
}

function instanceEntityId(entityName: string): string {
  const id = instanceControlPlaneSchema.entities.find(({ key }) => key === entityName)?.id;

  if (id === undefined) {
    throw new Error(`Instance control-plane schema must contain entity "${entityName}".`);
  }

  return id;
}
