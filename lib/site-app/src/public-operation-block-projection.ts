import {
  projectPublicSafeOperationInputFields,
  selectAnonymousPublicOperationByKey,
  type AppSchema,
  type EntityOperationSchema,
} from "@dpeek/formless-schema";
import { buildPublicOperationTargetRoute } from "@dpeek/formless-public-operations";

import { projectSubscribeContactPublicOperation } from "./subscribe-contact-public-operations.ts";
import type {
  SitePublicOperationInputFieldNode,
  SitePublicOperationNode,
  SiteTreeWarning,
  StoredRecord,
} from "./types.ts";

export type SitePublicOperationBlockProjectionInput = {
  record: StoredRecord;
  type: string;
  schema: AppSchema;
  turnstileSiteKey?: string;
  warnings: SiteTreeWarning[];
};

const PROGRAM_PUBLIC_OPERATION_API_ROUTE_PREFIX = "/api/formless/program";

export function projectSitePublicOperationBlock(
  input: SitePublicOperationBlockProjectionInput,
): SitePublicOperationNode | undefined {
  if (input.type === "publicOperationForm") {
    return projectedGenericPublicOperationFields(input.record, input);
  }

  if (input.type !== "subscribeForm" && input.type !== "contactForm") {
    return undefined;
  }

  return projectSubscribeContactPublicOperation({
    blockType: input.type,
    recordId: input.record.id,
    operationName: stringValue(input.record.values.operationName),
    publicOperationApiRoutePrefix: PROGRAM_PUBLIC_OPERATION_API_ROUTE_PREFIX,
    schema: input.schema,
    turnstileSiteKey: input.turnstileSiteKey,
    warnings: input.warnings,
  });
}

function projectedGenericPublicOperationFields(
  record: StoredRecord,
  input: SitePublicOperationBlockProjectionInput,
): SitePublicOperationNode | undefined {
  const operationKey = stringValue(record.values.operationKey);
  const formLabel = "Public operation form";

  if (!operationKey) {
    input.warnings.push({
      code: "missing-public-operation",
      recordId: record.id,
      message: `${formLabel} block "${record.id}" does not declare an operation key.`,
    });
    return undefined;
  }

  const operation = selectGenericPublicOperation(input.schema, operationKey);

  if (operation.kind !== "available") {
    input.warnings.push({
      code: operation.code,
      recordId: record.id,
      message: operation.message,
    });
    return undefined;
  }

  const challenge = operation.operation.policy?.access?.challenge;

  if (challenge?.kind === "turnstile" && input.turnstileSiteKey === undefined) {
    input.warnings.push({
      code: "missing-public-operation-challenge-config",
      recordId: record.id,
      message: `${formLabel} operation "${operationKey}" requires Turnstile site key configuration.`,
    });
    return undefined;
  }

  const fields = projectPublicOperationInputFields({
    entityName: operation.entityName,
    operation: operation.operation,
    recordId: record.id,
    schema: input.schema,
    warnings: input.warnings,
  });

  if (!fields) {
    return undefined;
  }

  return {
    entityName: operation.entityName,
    operationName: operation.operationName,
    canonicalKey: operation.canonicalKey,
    kind: publicOperationKind(operation.operation),
    route: buildPublicOperationTargetRoute({
      targetApiRoutePrefix: PROGRAM_PUBLIC_OPERATION_API_ROUTE_PREFIX,
      entityKey: operation.entityName,
      operationKey: operation.operationName,
    }),
    ...(challenge?.kind === "turnstile"
      ? {
          challenge: {
            kind: "turnstile" as const,
            siteKey: input.turnstileSiteKey,
          },
        }
      : {}),
    fields,
  };
}

function selectGenericPublicOperation(
  schema: AppSchema,
  operationKey: string,
):
  | {
      kind: "available";
      entityName: string;
      operationName: string;
      canonicalKey: string;
      operation: EntityOperationSchema;
    }
  | { kind: "unavailable"; code: string; message: string } {
  const operation = selectAnonymousPublicOperationByKey(schema, operationKey);

  if (operation.kind !== "available") {
    return {
      kind: "unavailable",
      code:
        operation.reason === "missing-operation"
          ? "missing-public-operation"
          : "invalid-public-operation",
      message: operation.message,
    };
  }

  return {
    kind: "available",
    entityName: operation.entityName,
    operationName: operation.operationName,
    canonicalKey: operation.canonicalKey,
    operation: operation.operation,
  };
}

function projectPublicOperationInputFields(input: {
  entityName: string;
  operation: EntityOperationSchema;
  recordId: string;
  schema: AppSchema;
  warnings: SiteTreeWarning[];
}): SitePublicOperationInputFieldNode[] | undefined {
  const entity = input.schema.entities.find(({ key }) => key === input.entityName);

  if (!entity) {
    return undefined;
  }

  const projection = projectPublicSafeOperationInputFields({
    entity,
    operation: input.operation,
  });

  for (const inputName of projection.unsupportedRequiredFields) {
    input.warnings.push({
      code: "unsupported-public-operation-input",
      recordId: input.recordId,
      message: `Public operation form block "${input.recordId}" cannot render required input field "${inputName}".`,
    });
  }

  if (projection.unsupportedRequiredFields.length > 0) {
    return undefined;
  }

  return projection.fields;
}

function publicOperationKind(operation: EntityOperationSchema): SitePublicOperationNode["kind"] {
  if (operation.kind === "command" || operation.kind === "create" || operation.kind === "list") {
    return operation.kind;
  }

  throw new Error("Selected public operation has an unsupported kind.");
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}
