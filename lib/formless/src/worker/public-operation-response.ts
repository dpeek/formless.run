import type { OperationInvocationResponse } from "../shared/operation-invocation.ts";
import type { PublicOperationResponse } from "../shared/protocol.ts";
import { BadRequestError } from "./errors.ts";

export type ShapedPublicOperationResponse = {
  body: PublicOperationResponse;
};

export function shapePublicOperationResponse(
  response: OperationInvocationResponse,
): ShapedPublicOperationResponse {
  if (response.output.type === "list" && response.invocation.operation.kind === "list") {
    const allowedFields = response.invocation.operation.policy?.responseFields?.anonymous;

    if (!allowedFields?.length) {
      throw new BadRequestError("Public operation response is not available.");
    }

    return {
      body: {
        invocationId: response.invocation.invocationId,
        operation: {
          entityName: response.invocation.operation.entityName,
          operationName: response.invocation.operation.operationName,
          canonicalKey: response.invocation.operation.canonicalKey,
          kind: "list",
        },
        output: {
          type: "list",
          records: response.output.records.map((record) =>
            Object.fromEntries(
              allowedFields.flatMap((fieldName) =>
                Object.hasOwn(record.values, fieldName)
                  ? [[fieldName, record.values[fieldName]]]
                  : [],
              ),
            ),
          ),
        },
        status: "accepted",
      },
    };
  }

  if (response.output.type === "create" && response.invocation.operation.kind === "create") {
    return {
      body: {
        invocationId: response.invocation.invocationId,
        operation: {
          entityName: response.invocation.operation.entityName,
          operationName: response.invocation.operation.operationName,
          canonicalKey: response.invocation.operation.canonicalKey,
          kind: "create",
        },
        output: {
          type: "create",
          affectedChangeIds: response.output.affectedChangeIds,
          changes: response.output.changes,
          cursor: response.output.cursor,
          record: response.output.record,
        },
        status: response.status === "replayed" ? "replayed" : "committed",
      },
    };
  }

  if (response.output.type !== "command" || response.invocation.operation.kind !== "command") {
    throw new BadRequestError("Public operation response is not available.");
  }

  return {
    body: {
      invocationId: response.invocation.invocationId,
      operation: {
        entityName: response.invocation.operation.entityName,
        operationName: response.invocation.operation.operationName,
        canonicalKey: response.invocation.operation.canonicalKey,
        kind: "command",
      },
      output: {
        type: "command",
        affectedChangeIds: response.output.affectedChangeIds,
        cursor: response.output.cursor,
        ...(response.output.recordPlan === undefined
          ? {}
          : { recordPlan: response.output.recordPlan }),
      },
      status: response.status === "replayed" ? "replayed" : "committed",
    },
  };
}
