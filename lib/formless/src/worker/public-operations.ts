import {
  PublicOperationRouteError,
  parsePublicOperationRouteSuffix,
} from "@dpeek/formless-public-operations";
import { formatEntityOperationKey, type AppSchema } from "@dpeek/formless-schema";
import {
  selectSoleActiveSite,
  sitePublicOperationSourceBlockMatches,
} from "@dpeek/formless-site-app";
import type { OperationInvocationResponse } from "../shared/operation-invocation.ts";
import type { ProgramSharedOperationAdapterDefinition } from "../program/composition.ts";
import {
  executeReadOperationInvocation,
  executeWriteOperationInvocation,
} from "./entity-operations.ts";
import { BadRequestError } from "./errors.ts";
import { executePublicOperationInvocationLifecycle } from "./operation-invocation-lifecycle.ts";
import { validatePublicOperationInputValues } from "./operation-input-validation.ts";
import {
  executePublicOperationExecutor,
  PublicOperationError,
  type PublicOperationExecutorAdapters,
  type PublicOperationExecutorResult,
  type PublicOperationExecutorRoute,
} from "./public-operation-executor.ts";
import {
  createPublicOperationTurnstileSiteverifyProvider,
  type PublicOperationTurnstileChallengeEnv,
  verifyPublicOperationTurnstileChallenge,
} from "./public-operation-turnstile-challenge.ts";
import { createPublicOperationReadRateLimitAdapter } from "./public-operation-read-rate-limit.ts";
import {
  shapePublicOperationResponse,
  type ShapedPublicOperationResponse,
} from "./public-operation-response.ts";
import type { IdentityReferenceTargetResolver } from "./identity-reference-targets.ts";
import { getActiveRecordsByEntity, getStoredRecord, type WriteOutcome } from "./storage.ts";

export type PublicOperationEnv = PublicOperationTurnstileChallengeEnv;

export { PublicOperationError };

export type PublicOperationRoute = PublicOperationExecutorRoute;

export type PublicOperationResult =
  | PublicOperationExecutorResult
  | {
      body: ShapedPublicOperationResponse["body"] | { error: string };
      headers?: HeadersInit;
      status?: number;
    };

export type PublicOperationWriteNotifier = {
  apply<T>(write: () => WriteOutcome<T>): WriteOutcome<T>;
};

type PublicOperationExecutionInput = {
  afterCommit?: (response: OperationInvocationResponse) => Promise<void> | void;
  body: unknown;
  env: PublicOperationEnv;
  identityReferenceResolver?: IdentityReferenceTargetResolver;
  operationAdapters?: readonly ProgramSharedOperationAdapterDefinition[];
  request: Request;
  route: PublicOperationRoute;
  schema: AppSchema;
  storage: DurableObjectStorage;
  validateConstraints?: Parameters<
    typeof executeWriteOperationInvocation
  >[0]["validateConstraints"];
  writes: PublicOperationWriteNotifier;
};

const publicOperationRoutePrefix = "/public/operations/";

export function selectPublicOperationRoute(input: {
  method: string;
  path: string;
}): PublicOperationRoute | undefined {
  if (input.method !== "POST" || !input.path.startsWith(publicOperationRoutePrefix)) {
    return undefined;
  }

  let routeParts: ReturnType<typeof parsePublicOperationRouteSuffix>;
  try {
    routeParts = parsePublicOperationRouteSuffix(input.path);
  } catch (error) {
    throw publicOperationRouteBadRequest(error);
  }

  return {
    entityName: routeParts.entityKey,
    operationName: routeParts.operationKey,
    path: input.path,
  };
}

function publicOperationRouteBadRequest(error: unknown): BadRequestError {
  if (error instanceof PublicOperationRouteError) {
    if (error.code === "invalid-escape") {
      return new BadRequestError("Public operation route segments must be valid URL path text.");
    }

    if (error.code === "empty-segment") {
      return new BadRequestError("Public operation entity and operation must be non-empty.");
    }
  }

  return new BadRequestError(
    "Public operation route must use /public/operations/:entity/:operation.",
  );
}

export async function executePublicOperationRequest(
  input: PublicOperationExecutionInput,
): Promise<PublicOperationResult> {
  return executePublicOperationExecutor({
    adapters: publicOperationExecutorAdapters(input),
    body: input.body,
    request: input.request,
    route: input.route,
    schema: input.schema,
  });
}

function publicOperationExecutorAdapters(
  input: PublicOperationExecutionInput,
): PublicOperationExecutorAdapters {
  return {
    afterCommit: {
      run: ({ response }) => input.afterCommit?.(response),
    },
    authority: {
      execute: ({ envelope }) =>
        envelope.operation.kind === "list"
          ? executeReadOperationInvocation({
              envelope,
              schema: input.schema,
              storage: input.storage,
            })
          : executeWriteOperationInvocation({
              envelope,
              identityReferenceResolver: input.identityReferenceResolver,
              operationAdapters: input.operationAdapters,
              schema: input.schema,
              storage: input.storage,
              validateConstraints: input.validateConstraints,
              writes: input.writes,
            }),
    },
    challenge: {
      verify: (stage) =>
        verifyPublicOperationTurnstileChallenge({
          env: input.env,
          idempotencyKey: stage.idempotencyKey,
          provider: createPublicOperationTurnstileSiteverifyProvider(input.env),
          token: stage.parsed.proof.turnstileToken,
        }),
    },
    lifecycle: {
      execute: (stage) =>
        executePublicOperationInvocationLifecycle({
          ...stage,
          storage: input.storage,
        }),
    },
    rateLimit: createPublicOperationReadRateLimitAdapter(input.storage),
    response: {
      shape: ({ response }) => shapePublicOperationResponse(response),
    },
    source: {
      validate: ({ selected, source }) =>
        validatePublicSiteOperationSource({
          schema: input.schema,
          selected,
          siteBlockId: source?.siteBlockId,
          storage: input.storage,
        }),
    },
    validation: {
      validate: ({ rawInput, selected }) =>
        validatePublicOperationInputValues({
          context: "Public operation input",
          entityName: selected.entityName,
          operation: selected.operation,
          operationName: selected.operationName,
          rawInput,
          schema: input.schema,
          storage: input.storage,
        }),
    },
  };
}

function validatePublicSiteOperationSource(input: {
  schema: AppSchema;
  selected: {
    entityName: string;
    operationName: string;
  };
  siteBlockId: string | undefined;
  storage: DurableObjectStorage;
}): void {
  if (input.siteBlockId === undefined) {
    return;
  }

  const selection = selectSoleActiveSite(getActiveRecordsByEntity(input.storage, "site"));

  if (selection.kind === "unavailable") {
    throw new PublicOperationError("Public Site is unavailable.", 503);
  }

  const sourceBlock = getStoredRecord(input.storage, input.siteBlockId);
  const canonicalOperationKey = formatEntityOperationKey({
    entityKey: input.selected.entityName,
    operationKey: input.selected.operationName,
  });

  if (
    sourceBlock?.entity !== "block" ||
    sourceBlock.deletedAt !== undefined ||
    sourceBlock.values.site !== selection.site.id ||
    !sitePublicOperationSourceBlockMatches({
      canonicalOperationKey,
      record: sourceBlock,
      schema: input.schema,
    })
  ) {
    throw new PublicOperationError("Public operation source is not available.", 404);
  }
}
