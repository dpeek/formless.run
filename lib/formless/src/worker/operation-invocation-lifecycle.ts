import type {
  OperationInvocationEnvelope,
  OperationInvocationOutput,
  OperationInvocationResponse,
} from "../shared/operation-invocation.ts";
import {
  committedWrite,
  getOperationInvocationById,
  recordOperationInvocationAccepted,
  recordOperationInvocationFailed,
  recordOperationInvocationOutcome,
  recordOperationInvocationRejected,
  replayedWrite,
  type WriteOutcome,
} from "./storage.ts";

export type OperationInvocationLifecycleWriteNotifier = {
  apply<T>(write: () => WriteOutcome<T>): WriteOutcome<T>;
};

export async function executeWriteOperationInvocationLifecycle(input: {
  envelope: OperationInvocationEnvelope;
  prepareExecute: () =>
    | Promise<() => WriteOutcome<OperationInvocationOutput>>
    | (() => WriteOutcome<OperationInvocationOutput>);
  storage: DurableObjectStorage;
  writes: OperationInvocationLifecycleWriteNotifier;
}): Promise<OperationInvocationResponse> {
  recordOperationInvocationAccepted(input.storage, input.envelope);

  try {
    const replay = recordStoredOperationInvocationReplay(input.storage, input.envelope);

    if (replay) {
      return input.writes.apply(() => replayedWrite(replay)).response;
    }

    const execute = await input.prepareExecute();
    const outcome = input.writes.apply(() => {
      const writeOutcome = execute();
      const status = writeOutcome.kind === "replay" ? "replayed" : "committed";
      const response = operationInvocationResponseFromWriteOutput(
        input.envelope,
        writeOutcome.response,
        status,
      );

      recordOperationInvocationOutcome(input.storage, {
        envelope: input.envelope,
        output: response.output,
        status: response.status,
      });

      return writeOutcome.kind === "replay" ? replayedWrite(response) : committedWrite(response);
    });

    return outcome.response;
  } catch (error) {
    recordOperationInvocationFailed(input.storage, input.envelope, error);
    throw error;
  }
}

export async function executePublicOperationInvocationLifecycle(input: {
  assertAllowed: () => void;
  beforeReplay: () => Promise<void> | void;
  envelope: OperationInvocationEnvelope;
  execute: (
    envelope: OperationInvocationEnvelope,
  ) => Promise<OperationInvocationResponse> | OperationInvocationResponse;
  prepareExecutionEnvelope: () =>
    | Promise<OperationInvocationEnvelope>
    | OperationInvocationEnvelope;
  storage: DurableObjectStorage;
}): Promise<OperationInvocationResponse> {
  try {
    input.assertAllowed();
  } catch (error) {
    recordOperationInvocationRejected(input.storage, input.envelope, error);
    throw error;
  }

  recordOperationInvocationAccepted(input.storage, input.envelope);

  let executionEnvelope: OperationInvocationEnvelope;
  try {
    await input.beforeReplay();

    const replay =
      input.envelope.idempotency.writeIdentity === undefined
        ? undefined
        : recordStoredOperationInvocationReplay(input.storage, input.envelope);

    if (replay) {
      return replay;
    }

    executionEnvelope = await input.prepareExecutionEnvelope();
  } catch (error) {
    recordOperationInvocationFailed(input.storage, input.envelope, error);
    throw error;
  }

  return await input.execute(executionEnvelope);
}

function recordStoredOperationInvocationReplay(
  storage: DurableObjectStorage,
  envelope: OperationInvocationEnvelope,
): OperationInvocationResponse | undefined {
  const replay = operationInvocationReplayResponse(storage, envelope);

  if (!replay) {
    return undefined;
  }

  recordOperationInvocationOutcome(storage, {
    envelope,
    output: replay.output,
    status: replay.status,
  });

  return replay;
}

function operationInvocationReplayResponse(
  storage: DurableObjectStorage,
  envelope: OperationInvocationEnvelope,
): OperationInvocationResponse | undefined {
  const replay = getOperationInvocationById(storage, envelope.invocationId);

  if (
    replay?.output === undefined ||
    (replay.status !== "committed" && replay.status !== "replayed")
  ) {
    return undefined;
  }

  assertStoredOperationOutputMatchesEnvelope(envelope, replay.output);

  return {
    invocation: envelope,
    output: replay.output,
    status: "replayed",
  };
}

function assertStoredOperationOutputMatchesEnvelope(
  envelope: OperationInvocationEnvelope,
  output: OperationInvocationOutput,
) {
  if (output.type !== envelope.operation.kind) {
    throw new Error(
      `Stored operation "${envelope.operation.canonicalKey}" output type "${output.type}" does not match operation kind "${envelope.operation.kind}".`,
    );
  }
}

function operationInvocationResponseFromWriteOutput(
  envelope: OperationInvocationEnvelope,
  output: OperationInvocationOutput,
  status: OperationInvocationResponse["status"],
): OperationInvocationResponse {
  return {
    invocation: envelope,
    output,
    status,
  };
}
