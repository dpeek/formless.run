// @vitest-environment jsdom

import { act, render, type RenderResult } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { AppSchema } from "@dpeek/formless-schema";
import type { StoredRecord } from "@dpeek/formless-storage";
import type { OperationInvocationResponse } from "../../shared/operation-invocation.ts";
import type { ChangeRow } from "../../shared/protocol.ts";
import { applyBootstrapResponse, resetClientStore } from "../../client/store.ts";
import { selectScreenModels } from "../../client/views.ts";
import { bootstrapResponse } from "../../test/protocol-builders.ts";
import { rateCardTestRecords, rateSourceSchema } from "../../test/schema-apps.ts";
import {
  generatedWorkspaceSelectedRecordDetailHeadingOperationId,
  generatedWorkspaceSelectedRecordDetailResultId,
} from "./generated-workspace-foundation.ts";
import {
  useGeneratedWorkspaceRuntimeController,
  type GeneratedWorkspaceRuntimeController,
} from "./generated-workspace-runtime.tsx";
import { projectGeneratedWorkspaceOperationIntent } from "./workspace-projection.ts";

const submitOperationMock = vi.hoisted(() => vi.fn());

vi.mock("../../client/sync.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../client/sync.ts")>()),
  submitOperation: submitOperationMock,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  resetClientStore();
  submitOperationMock.mockReset();
});

describe("selected-record relationship heading operation runtime", () => {
  it("dispatches current selected-record selection and back intents", async () => {
    const schema = selectedRecordHeadingSchema();
    applyBootstrapResponse(bootstrapResponse(schema, rateCardTestRecords));
    const screen = required(
      selectScreenModels(schema).find((candidate) => candidate.screenName === "rateSetup"),
    );
    const onSelectRecord = vi.fn();
    let controller: GeneratedWorkspaceRuntimeController | undefined;
    let renderer: RenderResult | undefined;

    function RuntimeProbe({ selectedRecordId }: { selectedRecordId: string | null }) {
      controller = useGeneratedWorkspaceRuntimeController({
        getSectionSelection: () => ({ selectedRecordId }),
        onSelectContext: () => undefined,
        onSelectQuery: () => undefined,
        onSelectRecord,
        screen,
        today: "2026-08-10",
      });
      return null;
    }

    await act(async () => {
      renderer = render(<RuntimeProbe selectedRecordId={null} />);
    });
    let runtime = required(controller);
    let presentation = required(runtime.workspace?.sections[0]).collection.presentation;
    if (presentation.kind !== "selectedRecord") {
      throw new Error("Missing selected-record runtime presentation.");
    }
    const selectionIntent = required(
      presentation.selectionIntents.find(({ recordId }) => recordId === "rec_card_premium"),
    );

    await act(async () => {
      await runtime.dispatch(selectionIntent);
      await runtime.dispatch({ ...selectionIntent, recordId: "rec_card_missing" });
    });
    expect(onSelectRecord).toHaveBeenCalledTimes(1);
    expect(onSelectRecord).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "cards" }),
      "rec_card_premium",
    );

    await act(async () => {
      required(renderer).rerender(<RuntimeProbe selectedRecordId="rec_card_premium" />);
    });
    runtime = required(controller);
    presentation = required(runtime.workspace?.sections[0]).collection.presentation;
    if (presentation.kind !== "selectedRecord") {
      throw new Error("Missing selected-record runtime presentation.");
    }
    const backIntent = required(presentation.backIntent);

    await act(async () => {
      await runtime.dispatch(backIntent);
      await runtime.dispatch({ ...backIntent, recordId: "rec_card_default" });
    });
    expect(onSelectRecord).toHaveBeenCalledTimes(2);
    expect(onSelectRecord).toHaveBeenLastCalledWith(expect.objectContaining({ id: "cards" }), null);

    await act(async () => {
      required(renderer).unmount();
    });
  });

  it("dispatches the canonical operation with the exact selected source id", async () => {
    const schema = selectedRecordHeadingSchema();
    applyBootstrapResponse(bootstrapResponse(schema, rateCardTestRecords));
    const screen = required(
      selectScreenModels(schema).find((candidate) => candidate.screenName === "rateSetup"),
    );
    const selectedRecordId = "rec_card_premium";
    let controller: GeneratedWorkspaceRuntimeController | undefined;
    let renderer: RenderResult | undefined;

    function RuntimeProbe() {
      controller = useGeneratedWorkspaceRuntimeController({
        getSectionSelection: (section) => (section.id === "cards" ? { selectedRecordId } : {}),
        onSelectContext: () => undefined,
        onSelectQuery: () => undefined,
        onSelectRecord: () => undefined,
        screen,
        today: "2026-08-10",
      });
      return null;
    }

    await act(async () => {
      renderer = render(<RuntimeProbe />);
    });

    const runtime = required(controller);
    const scope = currentScope(runtime);
    const resultId = generatedWorkspaceSelectedRecordDetailResultId(scope, "rates");
    const controlId = generatedWorkspaceSelectedRecordDetailHeadingOperationId(
      scope,
      "rates",
      selectedRecordId,
      "card.rebuildRates",
    );
    const intent = projectGeneratedWorkspaceOperationIntent(
      scope,
      controlId,
      { controlId, invocationSource: "button", type: "operationInvoke" },
      { recordId: selectedRecordId, resultId },
    );
    const deferred = deferredResponse();
    submitOperationMock.mockImplementationOnce(() => deferred.promise);
    let pending: Promise<void> | undefined;

    await act(async () => {
      pending = Promise.resolve(runtime.dispatch(intent));
      await Promise.resolve();
    });
    expect(submitOperationMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await runtime.dispatch(intent);
    });
    expect(submitOperationMock).toHaveBeenCalledTimes(1);

    deferred.resolve(operationResponse(rebuildRatesOutput()));
    await act(async () => {
      await pending;
    });
    expect(submitOperationMock.mock.calls[0]?.slice(0, 3)).toEqual([
      "card",
      "rebuildRates",
      {
        recordId: selectedRecordId,
        source: { protocol: "generated-ui", surface: "button" },
      },
    ]);

    submitOperationMock.mockResolvedValueOnce(operationResponse(rebuildRatesOutput(), "rejected"));
    await act(async () => {
      await runtime.dispatch(intent);
    });
    expect(submitOperationMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await runtime.dispatch({ ...intent, recordId: "rec_card_default" });
      await runtime.dispatch({ ...intent, resultId: `${resultId}:stale` });
      await runtime.dispatch({ ...intent, controlId: `${controlId}:stale` });
    });
    expect(submitOperationMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      required(renderer).unmount();
    });
  });

  it("requires canonical delete confirmation before invoking the selected source record", async () => {
    const schema = selectedRecordHeadingSchema();
    applyBootstrapResponse(bootstrapResponse(schema, rateCardTestRecords));
    const screen = required(
      selectScreenModels(schema).find((candidate) => candidate.screenName === "rateSetup"),
    );
    const selectedRecordId = "rec_card_premium";
    let controller: GeneratedWorkspaceRuntimeController | undefined;
    let renderer: RenderResult | undefined;

    function RuntimeProbe() {
      controller = useGeneratedWorkspaceRuntimeController({
        getSectionSelection: () => ({ selectedRecordId }),
        onSelectContext: () => undefined,
        onSelectQuery: () => undefined,
        onSelectRecord: () => undefined,
        screen,
        today: "2026-08-10",
      });
      return null;
    }

    await act(async () => {
      renderer = render(<RuntimeProbe />);
    });

    let runtime = required(controller);
    const scope = currentScope(runtime);
    const resultId = generatedWorkspaceSelectedRecordDetailResultId(scope, "rates");
    const controlId = generatedWorkspaceSelectedRecordDetailHeadingOperationId(
      scope,
      "rates",
      selectedRecordId,
      "card.delete",
    );
    const envelope = (intent: Parameters<typeof projectGeneratedWorkspaceOperationIntent>[2]) =>
      projectGeneratedWorkspaceOperationIntent(scope, controlId, intent, {
        recordId: selectedRecordId,
        resultId,
      });

    await act(async () => {
      await runtime.dispatch(
        envelope({ controlId, open: true, type: "operationConfirmationOpenChange" }),
      );
    });
    expect(submitOperationMock).not.toHaveBeenCalled();
    runtime = required(controller);

    submitOperationMock.mockResolvedValueOnce(operationResponse(deleteCardOutput()));
    await act(async () => {
      await runtime.dispatch(
        envelope({
          controlId,
          invocationSource: "confirmationDialog",
          type: "operationInvoke",
        }),
      );
    });
    expect(submitOperationMock.mock.calls[0]?.slice(0, 3)).toEqual([
      "card",
      "delete",
      {
        recordId: selectedRecordId,
        source: { protocol: "generated-ui", surface: "confirmationDialog" },
      },
    ]);

    await act(async () => {
      required(renderer).unmount();
    });
  });
});

function selectedRecordHeadingSchema(): AppSchema {
  const setup = required(rateSourceSchema.screens.find((screen) => screen.key === "rateSetup"));
  if (setup.type !== "workspace") {
    throw new Error("Missing rate setup workspace.");
  }
  const cards = required(setup.layout.sections.find((section) => section.id === "cards"));

  return {
    ...rateSourceSchema,
    entities: rateSourceSchema.entities.map((entity) =>
      entity.key === "card"
        ? {
            ...entity,
            operations: [
              ...(entity.operations ?? []),
              {
                key: "rebuildRates",
                label: "Rebuild rates",
                kind: "command" as const,
                scope: "record" as const,
                effect: {
                  type: "recordPlan" as const,
                  steps: [
                    {
                      name: "makeDefault",
                      kind: "patch" as const,
                      entity: "card",
                      recordId: { kind: "targetRecordId" as const },
                      values: { isDefault: { kind: "literal" as const, value: true } },
                    },
                  ],
                },
                output: { type: "command" as const },
                idempotency: { required: true },
                audit: { input: "summary" as const },
                policy: { actors: ["owner" as const] },
              },
              {
                key: "delete",
                label: "Delete card",
                kind: "delete" as const,
                scope: "record" as const,
                effect: { type: "deleteRecord" as const },
                output: { type: "delete" as const },
                idempotency: { required: true },
                audit: { input: "summary" as const },
                policy: { actors: ["owner" as const] },
              },
            ],
          }
        : entity,
    ),
    screens: rateSourceSchema.screens.map((screen) =>
      screen.key === setup.key
        ? {
            ...setup,
            layout: {
              ...setup.layout,
              sections: [
                {
                  ...cards,
                  detail: {
                    type: "selectedRecord" as const,
                    context: "card",
                    sections: [
                      {
                        id: "rates",
                        type: "relationship" as const,
                        relationship: "cardRates",
                        query: "ratesForSelectedCard",
                        result: { type: "table" as const, tableView: "rateTable" },
                        operations: [
                          {
                            operation: "card.rebuildRates",
                            placement: "heading" as const,
                          },
                          { operation: "card.delete", placement: "heading" as const },
                        ],
                      },
                    ],
                  },
                },
              ],
            },
          }
        : screen,
    ),
  };
}

function rebuildRatesOutput(): Extract<OperationInvocationResponse["output"], { type: "command" }> {
  const record = required(
    rateCardTestRecords.find((candidate) => candidate.id === "rec_card_premium"),
  );
  const updated = {
    ...record,
    updatedAt: "2026-08-10T01:00:00.000Z",
    values: { ...record.values, isDefault: true },
  };

  return {
    affectedChangeIds: ["write-card-default"],
    changes: [change(1, updated, "update", "write-card-default")],
    cursor: 1,
    recordPlan: {
      steps: [
        {
          changeId: "write-card-default",
          entity: "card",
          kind: "patch",
          name: "makeDefault",
          recordId: record.id,
        },
      ],
    },
    type: "command",
  };
}

function deleteCardOutput(): Extract<OperationInvocationResponse["output"], { type: "delete" }> {
  const record = required(
    rateCardTestRecords.find((candidate) => candidate.id === "rec_card_premium"),
  );
  const deleted = {
    ...record,
    deletedAt: "2026-08-10T02:00:00.000Z",
    updatedAt: "2026-08-10T02:00:00.000Z",
  };

  return {
    affectedChangeIds: ["write-card-delete"],
    changes: [change(2, deleted, "delete", "write-card-delete")],
    cursor: 2,
    recordId: record.id,
    type: "delete",
  };
}

function change(
  seq: number,
  record: StoredRecord,
  operationKind: ChangeRow["operationKind"],
  writeId: string,
): ChangeRow {
  return {
    createdAt: record.updatedAt,
    entity: record.entity,
    operationKind,
    payload: record,
    recordId: record.id,
    seq,
    writeId,
  };
}

function operationResponse(
  output: OperationInvocationResponse["output"],
  status: OperationInvocationResponse["status"] = "committed",
): OperationInvocationResponse {
  return {
    invocation: {} as OperationInvocationResponse["invocation"],
    output,
    status,
  };
}

function deferredResponse() {
  let resolve!: (response: OperationInvocationResponse) => void;
  const promise = new Promise<OperationInvocationResponse>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function currentScope(controller: GeneratedWorkspaceRuntimeController) {
  const workspace = required(controller.workspace);
  const section = required(workspace.sections[0]);
  return {
    collectionId: section.collection.id,
    screenId: workspace.id,
    sectionId: section.id,
  };
}

function required<T>(value: T | null | undefined): T {
  if (value === undefined || value === null) {
    throw new Error("Missing selected-record relationship operation fixture.");
  }
  return value;
}
