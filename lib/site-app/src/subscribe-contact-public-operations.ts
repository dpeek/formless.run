import {
  isOperationHandlerEffectForKind,
  selectAnonymousPublicOperation,
  type AppSchema,
  type EntityOperationSchema,
} from "@dpeek/formless-schema";
import { buildPublicOperationTargetRoute } from "@dpeek/formless-public-operations";
import type {
  SitePublicOperationNode,
  SitePublicOperationTargetNode,
  SiteTreeWarning,
} from "./types.ts";

type SubscribeContactPublicOperationBlockType = "subscribeForm" | "contactForm";

type SubscribeContactPublicOperationProjectionInput = {
  blockType: SubscribeContactPublicOperationBlockType;
  recordId: string;
  operationName: string | undefined;
  publicOperationApiRoutePrefix: `/${string}`;
  schema: AppSchema;
  target?: SitePublicOperationTargetNode;
  turnstileSiteKey: string | undefined;
  warnings: SiteTreeWarning[];
};

type SubscribeContactPublicOperationSelection =
  | {
      kind: "available";
      entityName: string;
      canonicalKey: string;
      operationKind: "command" | "create";
    }
  | { kind: "unavailable"; code: string; message: string };

type SubscribeContactPublicOperationAdapter = {
  formLabel: string;
  selectOperation: (
    schema: AppSchema,
    operationName: string,
  ) => SubscribeContactPublicOperationSelection;
};

const subscribeContactPublicOperationAdapters = {
  subscribeForm: {
    formLabel: "Subscribe form",
    selectOperation: selectPublicSubscribeOperation,
  },
  contactForm: {
    formLabel: "Contact form",
    selectOperation: selectPublicContactOperation,
  },
} satisfies Record<
  SubscribeContactPublicOperationBlockType,
  SubscribeContactPublicOperationAdapter
>;

export function projectSubscribeContactPublicOperation(
  input: SubscribeContactPublicOperationProjectionInput,
): SitePublicOperationNode | undefined {
  const adapter = subscribeContactPublicOperationAdapters[input.blockType];

  if (!input.operationName) {
    input.warnings.push({
      code: "missing-public-operation",
      recordId: input.recordId,
      message: `${adapter.formLabel} block "${input.recordId}" does not declare an operation name.`,
    });
    return undefined;
  }

  const operation = adapter.selectOperation(input.schema, input.operationName);

  if (operation.kind !== "available") {
    input.warnings.push({
      code: operation.code,
      recordId: input.recordId,
      message: operation.message,
    });
    return undefined;
  }

  if (input.turnstileSiteKey === undefined) {
    input.warnings.push({
      code: "missing-public-operation-challenge-config",
      recordId: input.recordId,
      message: `${adapter.formLabel} operation "${input.operationName}" requires Turnstile site key configuration.`,
    });
    return undefined;
  }

  return {
    entityName: operation.entityName,
    operationName: input.operationName,
    canonicalKey: operation.canonicalKey,
    kind: operation.operationKind,
    ...(input.target ? { target: input.target } : {}),
    route: buildPublicOperationTargetRoute({
      targetApiRoutePrefix: input.publicOperationApiRoutePrefix,
      entityKey: operation.entityName,
      operationKey: input.operationName,
    }),
    challenge: {
      kind: "turnstile",
      siteKey: input.turnstileSiteKey,
    },
  };
}

function selectPublicContactOperation(
  schema: AppSchema,
  operationName: string,
): SubscribeContactPublicOperationSelection {
  const candidates = operationCandidates(schema, operationName);

  if (candidates.length === 0) {
    return {
      kind: "unavailable",
      code: "missing-public-operation",
      message: `Contact form operation "${operationName}" does not exist.`,
    };
  }

  const publicContactOperations = candidates.flatMap(({ entityName }) => {
    if (entityName !== "contact-message") {
      return [];
    }

    const operation = selectAnonymousPublicOperation(schema, { entityName, operationName });

    return operation.kind === "available" && operation.executionKind !== "list" ? [operation] : [];
  });

  if (publicContactOperations.length !== 1) {
    return {
      kind: "unavailable",
      code: "invalid-public-operation",
      message: `Contact form operation "${operationName}" is not publicly executable.`,
    };
  }

  const publicOperation = publicContactOperations[0];

  if (!publicOperation) {
    throw new Error("Public contact operation selection was empty after validation.");
  }

  return {
    kind: "available",
    entityName: publicOperation.entityName,
    canonicalKey: publicOperation.canonicalKey,
    operationKind: publicOperation.operation.kind === "create" ? "create" : "command",
  };
}

function selectPublicSubscribeOperation(
  schema: AppSchema,
  operationName: string,
): SubscribeContactPublicOperationSelection {
  const candidates = operationCandidates(schema, operationName);

  if (candidates.length === 0) {
    return {
      kind: "unavailable",
      code: "missing-public-operation",
      message: `Subscribe form operation "${operationName}" does not exist.`,
    };
  }

  const publicSubscribeOperations = candidates.flatMap(({ entityName }) => {
    const operation = selectAnonymousPublicOperation(schema, { entityName, operationName });

    return operation.kind === "available" && isSubscribeFormPublicOperation(operation)
      ? [operation]
      : [];
  });

  if (publicSubscribeOperations.length !== 1) {
    return {
      kind: "unavailable",
      code: "invalid-public-operation",
      message: `Subscribe form operation "${operationName}" is not publicly executable.`,
    };
  }

  const publicOperation = publicSubscribeOperations[0];

  if (!publicOperation) {
    throw new Error("Public subscribe operation selection was empty after validation.");
  }

  return {
    kind: "available",
    entityName: publicOperation.entityName,
    canonicalKey: publicOperation.canonicalKey,
    operationKind: publicOperation.operation.kind === "create" ? "create" : "command",
  };
}

function isSubscribeFormPublicOperation(
  operation: Extract<ReturnType<typeof selectAnonymousPublicOperation>, { kind: "available" }>,
): boolean {
  if (
    operation.operation.kind === "command" &&
    isOperationHandlerEffectForKind(operation.operation.effect, "subscribe")
  ) {
    return true;
  }

  return (
    operation.entityName === "subscription" &&
    (operation.executionKind === "create" || operation.executionKind === "recordPlanCommand")
  );
}

function operationCandidates(
  schema: AppSchema,
  operationName: string,
): Array<{ entityName: string; operation: EntityOperationSchema }> {
  return Object.entries(schema.entities)
    .map(([entityName, entity]) => {
      const operation = entity.operations?.[operationName];

      return operation ? { entityName, operation } : undefined;
    })
    .filter(
      (candidate): candidate is { entityName: string; operation: EntityOperationSchema } =>
        candidate !== undefined,
    );
}
