// @vitest-environment jsdom

import { useState } from "react";
import { act, fireEvent, render, waitFor, within, type RenderResult } from "@testing-library/react";
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
  GeneratedWorkspaceRuntime,
  useGeneratedWorkspaceRuntimeController,
  type GeneratedWorkspaceRuntimeController,
} from "./generated-workspace-runtime.tsx";
import {
  projectGeneratedWorkspaceFieldIntent,
  projectGeneratedWorkspaceOperationIntent,
  projectGeneratedWorkspaceTableIntent,
} from "./workspace-projection.ts";

const submitOperationMock = vi.hoisted(() => vi.fn());

vi.mock("../../client/sync.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../client/sync.ts")>()),
  submitOperation: submitOperationMock,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  resetClientStore();
  submitOperationMock.mockReset();
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: class TestResizeObserver implements ResizeObserver {
      disconnect() {}
      observe() {}
      unobserve() {}
    },
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string): MediaQueryList => ({
      addEventListener: () => undefined,
      addListener: () => undefined,
      dispatchEvent: () => true,
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: () => undefined,
      removeListener: () => undefined,
    }),
  });
  window.scrollTo = () => undefined;
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: {
      ...globalThis.CSS,
      escape: (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`),
    },
  });
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close() {
    this.open = false;
  };
  HTMLElement.prototype.showPopover = function showPopover() {
    this.setAttribute("popover-open", "");
    this.style.display = "block";
  };
  HTMLElement.prototype.hidePopover = function hidePopover() {
    this.removeAttribute("popover-open");
    this.style.display = "none";
  };
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

  it("retains and commits controlled drafts in a selected-record relationship edit dialog", async () => {
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
    let editAction = selectedRecordRelationshipEditAction(runtime);
    expect(editAction.dialog.open).toBe(false);

    await act(async () => {
      await runtime.dispatch(
        projectGeneratedWorkspaceTableIntent(scope, resultId, editAction.openIntent),
      );
    });

    runtime = required(controller);
    editAction = selectedRecordRelationshipEditAction(runtime);
    expect(editAction.dialog.open).toBe(true);
    if (editAction.dialog.target.kind !== "available") {
      throw new Error("Missing selected-record relationship edit target.");
    }
    const fieldSetId = editAction.dialog.target.fieldSet.id;
    const displayField = required(
      editAction.dialog.target.fieldSet.fields.find((candidate) => candidate.fieldName === "price"),
    );
    expect(displayField).toMatchObject({
      access: { kind: "readOnly", writable: false },
      mode: "display",
    });
    let field = required(
      editAction.dialog.target.fieldSet.fields.find((candidate) => candidate.fieldName === "cost"),
    );
    if (field.mode !== "editor" || !("drafts" in field)) {
      throw new Error("Missing selected-record relationship editor field.");
    }
    const recordId = required(field.recordId);
    const changedValue = "1250";
    const fieldEnvelope = (intent: Parameters<typeof projectGeneratedWorkspaceFieldIntent>[2]) =>
      projectGeneratedWorkspaceFieldIntent(scope, field.fieldId, intent, {
        contextId: fieldSetId,
        recordId,
        resultId,
      });

    await act(async () => {
      await runtime.dispatch(
        projectGeneratedWorkspaceFieldIntent(
          scope,
          displayField.fieldId,
          {
            fieldName: displayField.fieldName,
            fieldValue: { kind: "input", value: "9999" },
            type: "recordDraftCommit",
          },
          { contextId: fieldSetId, recordId, resultId },
        ),
      );
    });
    expect(submitOperationMock).not.toHaveBeenCalled();

    await act(async () => {
      await runtime.dispatch(
        fieldEnvelope({
          fieldName: field.fieldName,
          fieldValue: { kind: "input", value: changedValue },
          type: "recordDraftChange",
        }),
      );
    });

    runtime = required(controller);
    editAction = selectedRecordRelationshipEditAction(runtime);
    if (editAction.dialog.target.kind !== "available") {
      throw new Error("Missing selected-record relationship edit target after draft.");
    }
    field = required(
      editAction.dialog.target.fieldSet.fields.find((candidate) => candidate.fieldName === "cost"),
    );
    if (field.mode !== "editor" || !("drafts" in field)) {
      throw new Error("Missing selected-record relationship draft field.");
    }
    expect(field.drafts.draft).toBe(changedValue);

    const record = required(rateCardTestRecords.find((candidate) => candidate.id === recordId));
    const updated = {
      ...record,
      updatedAt: "2026-08-10T03:00:00.000Z",
      values: { ...record.values, cost: 1250 },
    };
    submitOperationMock.mockResolvedValueOnce(
      operationResponse({
        affectedChangeIds: ["write-rate-cost"],
        changes: [change(3, updated, "update", "write-rate-cost")],
        cursor: 3,
        record: updated,
        type: "update",
      }),
    );

    await act(async () => {
      await runtime.dispatch(
        fieldEnvelope({
          fieldName: field.fieldName,
          fieldValue: { kind: "input", value: changedValue },
          type: "recordDraftCommit",
        }),
      );
    });

    expect(submitOperationMock).toHaveBeenCalledTimes(1);
    expect(submitOperationMock.mock.calls[0]?.slice(0, 3)).toEqual([
      "rate",
      "update",
      { input: { cost: 1250 }, recordId },
    ]);

    await act(async () => {
      required(renderer).unmount();
    });
  });

  it("composes selected-record authoring through summary, record, table, and create surfaces", async () => {
    const schema = selectedRecordHeadingSchema();
    applyBootstrapResponse(bootstrapResponse(schema, rateCardTestRecords));
    const screen = required(
      selectScreenModels(schema).find((candidate) => candidate.screenName === "rateSetup"),
    );
    const selectedRecordId = "rec_card_premium";
    function IntegratedRuntime() {
      const [selected, setSelected] = useState<string | null>(null);
      return (
        <GeneratedWorkspaceRuntime
          getSectionSelection={() => ({ selectedRecordId: selected })}
          onSelectContext={() => undefined}
          onSelectQuery={() => undefined}
          onSelectRecord={(_section, recordId) => setSelected(recordId)}
          screen={screen}
          today="2026-08-10"
        />
      );
    }
    const renderer = render(<IntegratedRuntime />);

    expect(submitOperationMock).not.toHaveBeenCalled();
    const premiumSummary = await renderer.findByRole("listitem", { name: "Premium" });
    expect(premiumSummary.getAttribute("aria-current")).toBeNull();
    expect(renderer.queryByText(/Editing is disabled for/)).toBeNull();
    fireEvent.click(within(premiumSummary).getByRole("button"));
    await waitFor(() => expect(premiumSummary.getAttribute("aria-current")).toBe("true"));

    const cardDetails = required(
      (await renderer.findAllByRole("region", { name: "Card details" })).find((region) =>
        region.hasAttribute("data-formless-record-result"),
      ),
    );
    expect(within(cardDetails).getByText("Premium")).toBeDefined();
    expect(within(cardDetails).queryByRole("textbox", { name: /^Name/ })).toBeNull();
    expect(within(cardDetails).getByRole("textbox", { name: /^Minimum margin/ })).toBeDefined();

    const sourceRate = required(
      rateCardTestRecords.find((record) => record.id === "rec_rate_premium_designer"),
    );
    const updatedRate: StoredRecord = {
      ...sourceRate,
      values: { ...sourceRate.values, cost: 600 },
      updatedAt: "2026-08-10T03:30:00.000Z",
    };
    submitOperationMock.mockResolvedValueOnce(
      operationResponse({
        affectedChangeIds: ["write-rate-integration-edit"],
        changes: [change(3, updatedRate, "update", "write-rate-integration-edit")],
        cursor: 3,
        record: updatedRate,
        type: "update",
      }),
    );
    const editMenuButton = required(
      (await renderer.findAllByRole("button", { name: /^More options for Rate / })).find((button) =>
        button.getAttribute("aria-label")?.includes(sourceRate.id),
      ),
    );
    fireEvent.click(editMenuButton);
    fireEvent.click(await renderer.findByRole("menuitem", { name: "Edit rate" }));
    const editDialog = await renderer.findByRole("dialog", { name: "Edit rate" });
    const costInput = within(editDialog).getByRole("textbox", { name: /^Cost/ });
    fireEvent.change(costInput, { target: { value: "600" } });
    await waitFor(() => expect((costInput as HTMLInputElement).value).toBe("600"));
    fireEvent.blur(costInput);
    await waitFor(() => expect(submitOperationMock).toHaveBeenCalledTimes(1));
    expect(submitOperationMock.mock.calls[0]?.slice(0, 3)).toEqual([
      "rate",
      "update",
      { input: { cost: 600 }, recordId: sourceRate.id },
    ]);
    fireEvent.click(within(editDialog).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(renderer.queryByRole("dialog", { name: "Edit rate" })).toBeNull());
    submitOperationMock.mockClear();

    fireEvent.click(await renderer.findByRole("button", { name: "Add rate" }));
    const dialog = await renderer.findByRole("dialog", { name: "Add rate" });
    expect(submitOperationMock).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("combobox", { name: /^Resource/ }));
    fireEvent.click(renderer.getByRole("option", { name: "Designer" }));
    await waitFor(() =>
      expect(within(dialog).getByRole("combobox", { name: /^Resource/ }).textContent).toContain(
        "Designer",
      ),
    );

    const created: StoredRecord = {
      id: "rec_rate_created",
      entity: "rate",
      values: {
        resource: "rec_resource_designer",
        card: selectedRecordId,
        cost: 0,
        costUnit: "day",
        price: 2500,
      },
      createdAt: "2026-08-10T04:00:00.000Z",
      updatedAt: "2026-08-10T04:00:00.000Z",
    };
    const deferred = deferredResponse();
    submitOperationMock.mockImplementationOnce(() => deferred.promise);
    fireEvent.click(within(dialog).getByRole("button", { name: "Add rate" }));
    fireEvent.click(within(dialog).getByRole("button", { name: /Add rate|Saving/ }));
    expect(submitOperationMock).toHaveBeenCalledTimes(1);
    expect(submitOperationMock.mock.calls[0]?.slice(0, 2)).toEqual(["rate", "create"]);
    expect(submitOperationMock.mock.calls[0]?.[2]).toMatchObject({
      input: created.values,
      source: { protocol: "generated-ui", surface: "submitButton" },
    });

    deferred.resolve(
      operationResponse({
        affectedChangeIds: ["write-rate-create"],
        changes: [change(4, created, "create", "write-rate-create")],
        cursor: 4,
        record: created,
        type: "create",
      }),
    );
    await waitFor(() => expect(renderer.queryByRole("dialog", { name: "Add rate" })).toBeNull());
    expect(submitOperationMock).toHaveBeenCalledTimes(1);

    renderer.unmount();
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
    tableViews: rateSourceSchema.tableViews.map((tableView) =>
      tableView.key === "rateTable"
        ? {
            ...tableView,
            operations: [
              {
                operation: "rate.update",
                label: "Edit rate",
                target: { kind: "row" as const },
                editView: "rateEdit",
              },
            ],
            columns: [
              ...tableView.columns,
              {
                type: "operationControl" as const,
              },
            ],
          }
        : tableView,
    ),
    itemViews: [
      ...rateSourceSchema.itemViews,
      {
        key: "selectedCardSummary",
        entity: "card",
        presentation: {
          type: "summary" as const,
          slots: { title: { field: "name" } },
        },
      },
      {
        key: "selectedCardDetail",
        entity: "card",
        fields: [
          {
            field: "name",
            interaction: "display" as const,
            editor: "text" as const,
          },
          {
            field: "marginMin",
            editor: "number" as const,
          },
        ],
      },
    ],
    views: [
      ...rateSourceSchema.views.map((view) =>
        view.key === "cardHome" && view.type === "collection" && view.result.type === "list"
          ? {
              ...view,
              result: {
                ...view.result,
                type: "list" as const,
                itemView: "selectedCardSummary",
              },
            }
          : view,
      ),
      {
        key: "selectedRateCreate",
        type: "create" as const,
        entity: "rate",
        fields: [{ field: "resource", editor: "reference" as const }],
        defaults: {
          card: { kind: "context" as const, name: "card" },
          cost: { kind: "literal" as const, value: 0 },
          costUnit: { kind: "literal" as const, value: "day" },
          price: { kind: "literal" as const, value: 2500 },
        },
      },
      {
        key: "rateEdit",
        type: "edit" as const,
        entity: "rate",
        fields: [
          { field: "cost", editor: "number" as const },
          {
            field: "price",
            interaction: "display" as const,
            editor: "number" as const,
          },
        ],
      },
    ],
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
                        id: "cardDetails",
                        type: "record" as const,
                        label: "Card details",
                        itemView: "selectedCardDetail",
                      },
                      {
                        id: "rates",
                        type: "relationship" as const,
                        relationship: "cardRates",
                        query: "ratesForSelectedCard",
                        result: { type: "table" as const, tableView: "rateTable" },
                        createAction: {
                          operation: "rate.create",
                          createView: "selectedRateCreate",
                          placement: "heading" as const,
                          label: "Add rate",
                        },
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

function selectedRecordRelationshipEditAction(controller: GeneratedWorkspaceRuntimeController) {
  const workspace = required(controller.workspace);
  const section = required(workspace.sections[0]);
  if (section.collection.presentation.kind !== "selectedRecord") {
    throw new Error("Missing selected-record relationship presentation.");
  }
  const relationship = required(
    section.collection.presentation.sections.find(
      (candidate) => candidate.kind === "selectedRecordRelationshipSection",
    ),
  );
  if (relationship.kind !== "selectedRecordRelationshipSection") {
    throw new Error("Missing selected-record relationship section.");
  }
  const actions = relationship.result.rows.flatMap((row) =>
    row.cells.flatMap((cell) =>
      cell.contents.flatMap((content) => (content.kind === "actionGroup" ? content.actions : [])),
    ),
  );
  const editAction = required(actions.find((action) => action.kind === "editAction"));
  if (editAction.kind !== "editAction") {
    throw new Error("Missing selected-record relationship edit action.");
  }
  return editAction;
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
