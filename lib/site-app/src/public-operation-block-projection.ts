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
  SitePublicOperationTargetNode,
  SiteTreeWarning,
  StoredRecord,
} from "./types.ts";

export type SitePublicOperationTargetRequest =
  | {
      kind: "schemaKey";
      schemaKey: string;
    }
  | {
      kind: "appInstall";
      packageAppKey: string;
      installId: string;
    };

export type SitePublicOperationTargetResolution = {
  route: SitePublicOperationTargetNode;
  schema: AppSchema;
};

export type SitePublicOperationTargetResolver = (
  request: SitePublicOperationTargetRequest,
) => SitePublicOperationTargetResolution | undefined;

export type SitePublicOperationBlockProjectionInput = {
  record: StoredRecord;
  type: string;
  schema: AppSchema;
  publicOperationTargetResolver?: SitePublicOperationTargetResolver;
  publicOperationApiRoutePrefix: `/${string}`;
  turnstileSiteKey?: string;
  warnings: SiteTreeWarning[];
};

type FixedPublicOperationTarget = {
  schema: AppSchema;
  publicOperationApiRoutePrefix: `/${string}`;
  route?: SitePublicOperationTargetNode;
};

export function projectSitePublicOperationBlock(
  input: SitePublicOperationBlockProjectionInput,
): SitePublicOperationNode | undefined {
  if (input.type === "publicOperationForm") {
    return projectedGenericPublicOperationFields(input.record, input);
  }

  if (input.type !== "subscribeForm" && input.type !== "contactForm") {
    return undefined;
  }

  const target: FixedPublicOperationTarget | undefined =
    input.type === "subscribeForm"
      ? selectSubscribeFormPublicOperationTarget(input.record, input)
      : siteLocalPublicOperationTarget(input);

  if (!target) {
    return undefined;
  }

  return projectSubscribeContactPublicOperation({
    blockType: input.type,
    recordId: input.record.id,
    operationName: stringValue(input.record.values.operationName),
    publicOperationApiRoutePrefix: target.publicOperationApiRoutePrefix,
    schema: target.schema,
    ...(target.route ? { target: target.route } : {}),
    turnstileSiteKey: input.turnstileSiteKey,
    warnings: input.warnings,
  });
}

function selectSubscribeFormPublicOperationTarget(
  record: StoredRecord,
  input: SitePublicOperationBlockProjectionInput,
): FixedPublicOperationTarget | undefined {
  if (!hasPublicOperationTargetIdentity(record)) {
    return siteLocalPublicOperationTarget(input);
  }

  const target = selectPublicOperationFormTarget(record, input, "Subscribe form");

  if (!target) {
    return undefined;
  }

  if (target.route.kind !== "appInstall" || target.route.packageAppKey !== "crm") {
    input.warnings.push({
      code: "invalid-public-operation-target",
      recordId: record.id,
      message: `Subscribe form target must resolve to an installed CRM app.`,
    });
    return undefined;
  }

  return {
    schema: target.schema,
    publicOperationApiRoutePrefix: target.route.apiRoutePrefix,
    route: target.route,
  };
}

function siteLocalPublicOperationTarget(
  input: SitePublicOperationBlockProjectionInput,
): FixedPublicOperationTarget {
  return {
    schema: input.schema,
    publicOperationApiRoutePrefix: input.publicOperationApiRoutePrefix,
  };
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

  const target = selectPublicOperationFormTarget(record, input, formLabel);

  if (!target) {
    return undefined;
  }

  const operation = selectGenericPublicOperation(target.schema, operationKey);

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
    schema: target.schema,
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
    target: target.route,
    route: buildPublicOperationTargetRoute({
      targetApiRoutePrefix: target.route.apiRoutePrefix,
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

function selectPublicOperationFormTarget(
  record: StoredRecord,
  input: SitePublicOperationBlockProjectionInput,
  formLabel: string,
): SitePublicOperationTargetResolution | undefined {
  const targetKind = stringValue(record.values.operationTargetKind);

  if (targetKind === "schemaKey") {
    const schemaKey = stringValue(record.values.operationTargetSchemaKey);

    if (!schemaKey) {
      input.warnings.push({
        code: "missing-public-operation-target",
        recordId: record.id,
        message: `${formLabel} block "${record.id}" does not declare a target schema key.`,
      });
      return undefined;
    }

    return resolvePublicOperationFormTarget(record, input, formLabel, {
      kind: "schemaKey",
      schemaKey,
    });
  }

  if (targetKind === "appInstall") {
    const packageAppKey = stringValue(record.values.operationTargetPackageAppKey);
    const installId = stringValue(record.values.operationTargetInstallId);

    if (!packageAppKey || !installId) {
      input.warnings.push({
        code: "missing-public-operation-target",
        recordId: record.id,
        message: `${formLabel} block "${record.id}" does not declare an installed app target.`,
      });
      return undefined;
    }

    return resolvePublicOperationFormTarget(record, input, formLabel, {
      kind: "appInstall",
      packageAppKey,
      installId,
    });
  }

  input.warnings.push({
    code: "missing-public-operation-target",
    recordId: record.id,
    message: `${formLabel} block "${record.id}" does not declare a supported target route kind.`,
  });
  return undefined;
}

function resolvePublicOperationFormTarget(
  record: StoredRecord,
  input: SitePublicOperationBlockProjectionInput,
  formLabel: string,
  request: SitePublicOperationTargetRequest,
): SitePublicOperationTargetResolution | undefined {
  const target = input.publicOperationTargetResolver?.(request);

  if (!target) {
    input.warnings.push({
      code: "invalid-public-operation-target",
      recordId: record.id,
      message:
        request.kind === "schemaKey"
          ? `${formLabel} target schema key "${request.schemaKey}" is unavailable.`
          : `${formLabel} target install "${request.packageAppKey}/${request.installId}" is unavailable.`,
    });
    return undefined;
  }

  return target;
}

function hasPublicOperationTargetIdentity(record: StoredRecord): boolean {
  return (
    stringValue(record.values.operationTargetKind) !== undefined ||
    stringValue(record.values.operationTargetSchemaKey) !== undefined ||
    stringValue(record.values.operationTargetPackageAppKey) !== undefined ||
    stringValue(record.values.operationTargetInstallId) !== undefined
  );
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
