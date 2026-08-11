import { describe, expect, it } from "vite-plus/test";
import type {
  ActionTriggerContract,
  ButtonContract,
  CreateFieldContract,
  CreateSurfaceContract,
  OperationControlContract,
  TableContract,
} from "@dpeek/formless-presentation/contract";
import type { AppSchema } from "@dpeek/formless-schema";
import type { StoredRecord } from "@dpeek/formless-storage";
import type { GeneratedOperationControlBinding, HomeScreenModel } from "../../client/views.ts";
import type { EntityOperationPresentationConfig } from "../../client/operation-presentation-model.ts";
import {
  createGeneratedOperationController,
  selectScreenModelByPath,
  selectScreenModels,
} from "../../client/views.ts";
import type { RecordResultModel } from "../../client/list-result-model.ts";
import {
  rateCardTestRecords,
  rateSourceSchema,
  siteSourceSchema,
  taskSourceSchema,
  taskTestRecords,
} from "../../test/schema-apps.ts";
import { testSiteRecords } from "../../test/site-records.ts";
import { projectGeneratedOperationControl } from "./operation-projection.ts";
import {
  generatedWorkspaceScopedId,
  projectGeneratedWorkspaceCreateIntent,
  projectGeneratedWorkspaceExternalActionIntent,
  projectGeneratedWorkspaceFieldIntent,
  projectGeneratedWorkspaceListIntent,
  projectGeneratedWorkspaceOperationIntent,
  projectGeneratedWorkspaceRecordResultIntent,
  projectGeneratedWorkspaceTableIntent,
  projectGeneratedWorkspaceTreeIntent,
} from "./workspace-projection.ts";
import {
  createGeneratedRecordResultFieldAuthoringState,
  selectGeneratedRecordResultFoundation,
  type GeneratedRecordResultRecordState,
} from "./generated-record-result-foundation.ts";
import { selectGeneratedWorkspaceTableFoundation } from "./generated-table-foundation.tsx";
import {
  resolveGeneratedWorkspaceIntent,
  selectGeneratedWorkspaceFoundation,
  type GeneratedWorkspaceSectionFoundationInput,
  type GeneratedWorkspaceSectionSelectionFacts,
} from "./generated-workspace-foundation.ts";

describe("generated workspace foundation", () => {
  it("reconstructs a query-bound route without query navigation or retained selection", () => {
    const baseScreen = taskSourceSchema.screens[0];
    if (baseScreen?.type !== "workspace") {
      throw new Error("Missing task workspace screen.");
    }
    const baseSection = baseScreen.layout.sections[0]!;
    const schema = {
      ...taskSourceSchema,
      navigation: { primaryScreens: ["completedTasks"] },
      screens: [
        {
          ...baseScreen,
          key: "completedTasks",
          label: "Completed tasks",
          path: "/completed",
          layout: {
            ...baseScreen.layout,
            sections: [{ ...baseSection, query: "taskCompleted" }],
          },
        },
      ],
    };
    const selectRoute = (selectedQueryName?: string) => {
      const screen = required(selectScreenModelByPath(schema, "/completed"));
      return required(
        selectGeneratedWorkspaceFoundation({
          screen,
          ...(selectedQueryName === undefined
            ? {}
            : { sectionSelection: { tasks: { selectedQueryName } } }),
          snapshot: projectionSnapshot(taskTestRecords),
          today: "2026-05-02",
        }),
      );
    };

    const direct = selectRoute();
    const revisited = selectRoute("taskActive");

    for (const foundation of [direct, revisited]) {
      const plan = required(foundation.runtimePlan.sections[0]);
      const section = required(foundation.workspace.sections[0]);

      expect(plan.selectedQuery.queryName).toBe("taskCompleted");
      expect(plan.recordIds).toEqual(["rec_task_completed"]);
      expect(section.collection.presentation.queryNavigation).toBeUndefined();
    }
  });

  it("keeps selected-record state nullable and clears it when a query removes the record", () => {
    const screen = selectedRecordDetailRateScreen();
    const snapshot = projectionSnapshot(rateCardTestRecords);
    const select = (selectedQueryName?: string, selectedRecordId?: string) =>
      required(
        selectGeneratedWorkspaceFoundation({
          screen,
          sectionSelection: {
            cards: {
              ...(selectedQueryName === undefined ? {} : { selectedQueryName }),
              ...(selectedRecordId === undefined ? {} : { selectedRecordId }),
            },
          },
          selectSectionFoundation: selectSelectedRecordDetailSectionFoundation,
          snapshot,
          today: "2026-08-10",
        }),
      ).runtimePlan.sections[0];

    expect(required(select()).selectedRecordId).toBeNull();
    expect(required(select(undefined, "rec_card_premium")).selectedRecordId).toBe(
      "rec_card_premium",
    );
    expect(required(select("cardDefault", "rec_card_premium")).selectedRecordId).toBeNull();
  });

  it("projects selected-record composition and validates current selection and back intents", () => {
    const screen = selectedRecordDetailRateScreen();
    const snapshot = projectionSnapshot(rateCardTestRecords);
    const select = (selectedRecordId: string | null) =>
      required(
        selectGeneratedWorkspaceFoundation({
          screen,
          sectionSelection: { cards: { selectedRecordId } },
          selectSectionFoundation: selectSelectedRecordDetailSectionFoundation,
          snapshot,
          today: "2026-08-10",
        }),
      );
    const unselected = select(null);
    const unselectedPresentation = required(unselected.workspace.sections[0]).collection
      .presentation;
    if (unselectedPresentation.kind !== "selectedRecord") {
      throw new Error("Missing selected-record presentation.");
    }

    expect(unselectedPresentation).toMatchObject({
      activePresentation: "list",
      compactPresentation: "drillIn",
      sections: [],
      selectedRecordId: null,
    });
    expect(unselectedPresentation.backIntent).toBeUndefined();
    expect(unselectedPresentation.selectionIntents.map(({ recordId }) => recordId)).toEqual([
      "rec_card_default",
      "rec_card_premium",
    ]);
    const unselectedSummaryItems = unselectedPresentation.result.items.filter(
      (item) => item.presentation === "summary",
    );
    expect(unselectedSummaryItems).toHaveLength(2);
    expect(unselectedPresentation.result.selection).toEqual({ selectedItemId: null });
    expect(unselectedSummaryItems[0]).not.toHaveProperty("subtitle");
    const selectionIntent = required(
      unselectedSummaryItems.find(({ id }) => id === "rec_card_premium")?.selectionIntent,
    );
    expect(resolveGeneratedWorkspaceIntent(unselected.runtimePlan, selectionIntent)).toMatchObject({
      kind: "selectedRecordSelection",
      recordId: "rec_card_premium",
    });
    expect(
      resolveGeneratedWorkspaceIntent(unselected.runtimePlan, {
        ...selectionIntent,
        screenId: `${selectionIntent.screenId}:stale`,
      }),
    ).toBeUndefined();

    const selected = select("rec_card_premium");
    const selectedPresentation = required(selected.workspace.sections[0]).collection.presentation;
    if (selectedPresentation.kind !== "selectedRecord") {
      throw new Error("Missing selected-record presentation.");
    }
    expect(selectedPresentation).toMatchObject({
      activePresentation: "detail",
      backIntent: { recordId: "rec_card_premium", type: "workspaceSelectedRecordBack" },
      sections: [
        { kind: "selectedRecordRecordSection", result: { kind: "recordResult" } },
        { kind: "selectedRecordRelationshipSection", result: { kind: "table" } },
      ],
      selectedRecordId: "rec_card_premium",
    });
    expect(
      selectedPresentation.result.items.find(({ id }) => id === "rec_card_premium"),
    ).toMatchObject({
      presentation: "summary",
      selectionIntent,
      title: "Premium",
    });
    expect(selectedPresentation.result.selection).toEqual({
      selectedItemId: "rec_card_premium",
    });
    const backIntent = required(selectedPresentation.backIntent);
    expect(resolveGeneratedWorkspaceIntent(selected.runtimePlan, backIntent)).toMatchObject({
      kind: "selectedRecordSelection",
      recordId: null,
    });
    expect(
      resolveGeneratedWorkspaceIntent(selected.runtimePlan, {
        ...backIntent,
        recordId: "rec_card_default",
      }),
    ).toBeUndefined();
    const stale = required(
      selectGeneratedWorkspaceFoundation({
        screen,
        sectionSelection: {
          cards: { selectedQueryName: "cardDefault", selectedRecordId: "rec_card_premium" },
        },
        selectSectionFoundation: selectSelectedRecordDetailSectionFoundation,
        snapshot,
        today: "2026-08-10",
      }),
    );
    expect(resolveGeneratedWorkspaceIntent(stale.runtimePlan, selectionIntent)).toBeUndefined();
    expect(
      resolveGeneratedWorkspaceIntent(selected.runtimePlan, {
        ...selectionIntent,
        recordId: "rec_card_missing",
      }),
    ).toBeUndefined();
  });

  it("composes selected-record item views through section-scoped record-result foundations", () => {
    const base = selectedRecordDetailRateScreen();
    const section = required(base.layout.sections[0]);
    const screen: HomeScreenModel = {
      ...base,
      layout: {
        ...base.layout,
        sections: [
          { ...section, id: "primaryCards" },
          { ...section, id: "secondaryCards" },
        ],
      },
    };
    const snapshot = projectionSnapshot(rateCardTestRecords);
    const selectedRecordId = "rec_card_premium";
    const foundation = required(
      selectGeneratedWorkspaceFoundation({
        screen,
        sectionSelection: {
          primaryCards: { selectedRecordId },
          secondaryCards: { selectedRecordId },
        },
        selectSectionFoundation: selectSelectedRecordDetailSectionFoundation,
        snapshot,
        today: "2026-08-10",
      }),
    );
    const resultIds = new Set<string>();
    const selectionScopes = new Set<string>();

    for (const plan of foundation.runtimePlan.sections) {
      const detail = required(plan.collection.detail);
      const projected = required(plan.selectedRecordDetailRecordResults[0]);
      const recordSection = required(
        detail.sections.find((candidate) => candidate.type === "record"),
      );
      const expectedId = generatedWorkspaceScopedId(
        plan.scope,
        "result",
        `selectedRecord:${recordSection.id}`,
      );
      const direct = selectGeneratedRecordResultFoundation({
        accessibilityLabel: recordSection.label ?? `${detail.entity.label} detail`,
        entity: detail.entity,
        entityName: detail.entityName,
        id: expectedId,
        recordIds: [selectedRecordId],
        recordsById: snapshot.recordsById,
        result: recordSection.result,
        selectedRecordId,
      });

      expect(projected.id).toBe(recordSection.id);
      expect(projected.result.contract).toEqual(direct.recordResult);
      expect(projected.result.model).toBe(recordSection.result);
      expect(projected.result.recordState).toMatchObject({ baselineRecordId: selectedRecordId });
      expect(resultIds.has(projected.result.contract.id)).toBe(false);
      resultIds.add(projected.result.contract.id);

      const workspaceSection = required(
        foundation.workspace.sections.find(({ id }) => id === plan.scope.sectionId),
      );
      const presentation = workspaceSection.collection.presentation;
      if (presentation.kind !== "selectedRecord") {
        throw new Error("Missing repeated selected-record presentation.");
      }
      const summaryItem = required(
        presentation.result.items.find(
          (item) => item.presentation === "summary" && item.id === selectedRecordId,
        ),
      );
      if (summaryItem.presentation !== "summary") {
        throw new Error("Missing repeated summary selection.");
      }
      const summarySelectionIntent = required(summaryItem.selectionIntent);
      selectionScopes.add(
        `${summarySelectionIntent.screenId}:${summarySelectionIntent.sectionId}:${summarySelectionIntent.collectionId}`,
      );

      const field = required(projected.result.contract.fields[0]);
      const intent = projectGeneratedWorkspaceRecordResultIntent(plan.scope, expectedId, {
        fieldId: field.fieldId,
        intent: { fieldName: field.fieldName, type: "recordDraftRevert" },
        recordId: selectedRecordId,
        resultId: expectedId,
        type: "recordResultFieldIntent",
      });
      expect(resolveGeneratedWorkspaceIntent(foundation.runtimePlan, intent)).toMatchObject({
        kind: "result",
        result: { contract: { id: expectedId }, kind: "recordResult" },
      });
    }

    expect(resultIds.size).toBe(2);
    expect(selectionScopes.size).toBe(2);
  });

  it("evaluates selected-record relationship queries into scoped canonical tables", () => {
    const screen = selectedRecordDetailRateScreen();
    const snapshot = projectionSnapshot(rateCardTestRecords);
    const select = (
      selectedRecordId: string | null,
      options: {
        screen?: HomeScreenModel;
        selectedQueryName?: string;
        snapshot?: ReturnType<typeof projectionSnapshot>;
      } = {},
    ) =>
      required(
        selectGeneratedWorkspaceFoundation({
          screen: options.screen ?? screen,
          sectionSelection: {
            cards: {
              ...(options.selectedQueryName === undefined
                ? {}
                : { selectedQueryName: options.selectedQueryName }),
              selectedRecordId,
            },
          },
          selectSectionFoundation: selectSelectedRecordDetailSectionFoundation,
          snapshot: options.snapshot ?? snapshot,
          today: "2026-08-10",
        }),
      ).runtimePlan.sections[0];

    expect(required(select(null)).selectedRecordDetailRelationshipResults).toEqual([]);

    const premium = required(select("rec_card_premium"));
    const premiumRelationship = required(premium.selectedRecordDetailRelationshipResults[0]);
    expect(premiumRelationship.queryContext).toEqual({
      today: "2026-08-10",
      values: { card: "rec_card_premium" },
    });
    expect(premiumRelationship.recordIds).toEqual([
      "rec_rate_premium_designer",
      "rec_rate_premium_developer",
      "rec_rate_premium_producer",
      "rec_rate_premium_product_lead",
      "rec_rate_premium_qa",
    ]);
    expect(premiumRelationship.result.contract.rows.map(({ id }) => id)).toEqual(
      premiumRelationship.recordIds,
    );

    const firstRow = required(premiumRelationship.result.contract.rows[0]);
    expect(
      firstRow.cells.some((cell) => cell.contents.some((content) => content.kind === "cellValue")),
    ).toBe(true);
    expect(premiumRelationship.result.editFieldsById.size).toBe(0);

    const defaultRelationship = required(
      required(select("rec_card_default")).selectedRecordDetailRelationshipResults[0],
    );
    expect(defaultRelationship.result.contract.id).toBe(premiumRelationship.result.contract.id);
    expect(defaultRelationship.recordIds).toEqual([
      "rec_rate_default_designer",
      "rec_rate_default_developer",
      "rec_rate_default_producer",
      "rec_rate_default_product_lead",
      "rec_rate_default_qa",
    ]);

    const emptySnapshot = projectionSnapshot(
      rateCardTestRecords.filter(
        (record) => record.entity !== "rate" || record.values.card !== "rec_card_premium",
      ),
    );
    const emptyRelationship = required(
      required(select("rec_card_premium", { snapshot: emptySnapshot }))
        .selectedRecordDetailRelationshipResults[0],
    );
    expect(emptyRelationship.recordIds).toEqual([]);
    expect(emptyRelationship.result.contract).toMatchObject({
      emptyState: { kind: "tableEmptyState" },
      rows: [],
    });

    const stale = required(select("rec_card_premium", { selectedQueryName: "cardDefault" }));
    expect(stale.selectedRecordId).toBeNull();
    expect(stale.selectedRecordDetailRelationshipResults).toEqual([]);

    const relationship = required(
      required(screen.layout.sections[0]).collection.detail?.sections.find(
        (section) => section.type === "relationship",
      ),
    );
    if (relationship.type !== "relationship") {
      throw new Error("Missing relationship section.");
    }
    const unavailableScreen: HomeScreenModel = {
      ...screen,
      layout: {
        ...screen.layout,
        sections: screen.layout.sections.map((section) => ({
          ...section,
          collection: {
            ...section.collection,
            detail: section.collection.detail
              ? {
                  ...section.collection.detail,
                  sections: section.collection.detail.sections.map((detailSection) =>
                    detailSection.id === relationship.id
                      ? { ...relationship, query: { kind: "all" }, queryName: "rateAll" }
                      : detailSection,
                  ),
                }
              : undefined,
          },
        })),
      },
    };
    const unavailableSnapshot = projectionSnapshot(rateCardTestRecords);
    unavailableSnapshot.recordIdsByEntity.rate = ["rec_rate_unavailable"];
    const unavailable = required(
      required(
        select("rec_card_premium", {
          screen: unavailableScreen,
          snapshot: unavailableSnapshot,
        }),
      ).selectedRecordDetailRelationshipResults[0],
    );
    expect(unavailable.recordIds).toEqual(["rec_rate_unavailable"]);
    expect(unavailable.result.contract.rows[0]?.cells).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          contents: [expect.objectContaining({ kind: "unavailable" })],
        }),
      ]),
    );
  });

  it("projects zero, sole, and ambiguous Site authoring scope without a Site selector", () => {
    const editor = required(
      selectScreenModels(siteSourceSchema).find(({ screenName }) => screenName === "siteEditor"),
    );
    const settings = required(
      selectScreenModels(siteSourceSchema).find(({ screenName }) => screenName === "siteSettings"),
    );
    const site = required(testSiteRecords.find(({ entity }) => entity === "site"));
    const otherSite: StoredRecord = {
      ...site,
      id: "rec_site_other",
      values: { ...site.values, key: "other", label: "Other Site" },
    };
    const otherRoot: StoredRecord = {
      ...required(testSiteRecords.find(({ entity }) => entity === "block")),
      id: "rec_site_other_home",
      values: {
        site: otherSite.id,
        type: "page",
        label: "Other Home",
        href: "/",
      },
    };
    const zero = required(
      selectGeneratedWorkspaceFoundation({
        screen: editor,
        snapshot: projectionSnapshot([]),
        today: "2026-08-06",
      }),
    );
    const sole = required(
      selectGeneratedWorkspaceFoundation({
        screen: editor,
        snapshot: projectionSnapshot([...testSiteRecords, otherRoot]),
        today: "2026-08-06",
      }),
    );
    const ambiguous = required(
      selectGeneratedWorkspaceFoundation({
        screen: editor,
        snapshot: projectionSnapshot([...testSiteRecords, otherSite, otherRoot]),
        today: "2026-08-06",
      }),
    );
    const settingsFoundation = required(
      selectGeneratedWorkspaceFoundation({
        screen: settings,
        snapshot: projectionSnapshot(testSiteRecords),
        today: "2026-08-06",
      }),
    );

    expect(required(zero.runtimePlan.sections[0]).scopeSelection).toMatchObject({
      activeRecordId: null,
      state: "empty",
    });
    expect(required(zero.workspace.sections[0]).collection.availability).toMatchObject({
      emptyState: { title: "No Site configured" },
      state: "empty",
    });
    expect(required(sole.runtimePlan.sections[0])).toMatchObject({
      actionQueryContext: { values: { site: site.id } },
      scopeSelection: { activeRecordId: site.id, state: "ready" },
    });
    expect([
      ...required(sole.runtimePlan.sections[0]).contextOptionById.values(),
    ]).not.toContainEqual(expect.objectContaining({ id: otherRoot.id }));
    expect(required(ambiguous.runtimePlan.sections[0])).toMatchObject({
      recordIds: [],
      scopeSelection: { activeRecordId: null, state: "ambiguous" },
    });
    expect([...required(ambiguous.runtimePlan.sections[0]).contextOptionById.values()]).toEqual([]);
    expect(required(ambiguous.workspace.sections[0]).collection.availability).toEqual({
      message: "Site authoring is unavailable because more than one active record exists.",
      state: "unavailable",
    });
    expect(required(settingsFoundation.runtimePlan.sections[0]).recordIds).toEqual([site.id]);
    expect(JSON.stringify(sole.workspace)).not.toContain("scopeSelection");
    expect(JSON.stringify(sole.workspace)).not.toContain("queryContext");
  });

  it("selects complete eligible models, selection fallback, evaluated facts, controls, and scoped results", () => {
    const fixture = rateWorkspaceFixture();
    const foundation = fixture.foundation;
    const section = required(foundation.workspace.sections[0]);
    const plan = required(foundation.runtimePlan.sections[0]);
    const presentation = section.collection.presentation;
    const context = presentation.kind === "listDetail" ? presentation.selector : undefined;

    expect(plan.selectedQuery.queryName).toBe("ratesForSelectedCard");
    expect(plan.selectedContextRecordId).toBe("rec_card_default");
    expect(plan.recordIds).toHaveLength(5);
    expect(plan.contextRecordState).toMatchObject({
      baselineRecordId: "rec_card_default",
      confirmationOpenByControlId: {},
    });
    expect(section.collection).toMatchObject({
      selectedQueryId: generatedWorkspaceScopedId(plan.scope, "query", "ratesForSelectedCard"),
    });
    expect(presentation).toMatchObject({
      actions: {
        primary: [{ kind: "createAction" }],
        secondary: [{ kind: "operationAction" }],
      },
      contextDetail: {
        accessibilityLabel: "Default detail",
        density: "compact",
        selectedRecord: { id: "rec_card_default" },
      },
      kind: "listDetail",
      result: { id: fixture.table.id, kind: "table" },
      summaries: [
        { displayValue: "$565.00", label: "Average cost", suffix: "/ day" },
        { displayValue: "$848.00", label: "Average price", suffix: "/ day" },
        { label: "Average margin" },
      ],
    });
    expect(context).toMatchObject({
      availability: { state: "ready" },
      createAction: { kind: "createAction" },
      options: [
        { countText: "5", label: "Default", selected: true },
        { countText: "5", label: "Premium", selected: false },
      ],
      presentation: "localListDetail",
    });
    expect(presentation.queryNavigation?.items).toMatchObject([
      { countText: "5", label: "Selected card", selected: true },
      { countText: "10", label: "All rates", selected: false },
    ]);
    expect(section.actions).toHaveLength(1);
    expect(JSON.stringify(foundation.workspace)).not.toContain("queryContext");
    expect(JSON.stringify(foundation.workspace)).not.toContain("recordIds");
    expect(JSON.stringify(foundation.workspace)).not.toContain("runtime");

    const detail = presentation.contextDetail;
    const name = detail?.fields.find((field) => field.fieldName === "name");
    const margin = detail?.fields.find((field) => field.fieldName === "marginMin");
    expect(name).toMatchObject({ density: "default", labelVisibility: "hidden" });
    expect(margin).toMatchObject({ density: "compact", labelVisibility: "visible" });
  });

  it("resolves every controlled route and rejects stale or mismatched identities", () => {
    const fixture = rateWorkspaceFixture();
    const { foundation } = fixture;
    const section = required(foundation.workspace.sections[0]);
    const plan = required(foundation.runtimePlan.sections[0]);
    const presentation = section.collection.presentation;
    const listDetail = presentation.kind === "listDetail" ? presentation : undefined;
    const query = required(listDetail?.queryNavigation?.items[1]);
    const context = required(listDetail?.selector);
    const contextOption = required(context.options[1]);
    const external = required(section.actions[0]);
    const create = required(listDetail?.actions.primary[0]);
    const command = required(listDetail?.actions.secondary[0]);
    const contextCreate = required(context.createAction);

    expect(
      resolveGeneratedWorkspaceIntent(foundation.runtimePlan, query.selectionIntent),
    ).toMatchObject({ kind: "querySelection", query: { queryName: "rateAll" } });
    expect(
      resolveGeneratedWorkspaceIntent(foundation.runtimePlan, contextOption.selectionIntent),
    ).toMatchObject({ kind: "contextSelection", option: { id: "rec_card_premium" } });
    expect(
      resolveGeneratedWorkspaceIntent(
        foundation.runtimePlan,
        projectGeneratedWorkspaceExternalActionIntent(
          plan.scope,
          external.id,
          external.action.invoke,
        ),
      ),
    ).toMatchObject({ kind: "control", runtime: { runtime: "external" } });

    if (create.kind !== "createAction" || command.kind !== "operationAction") {
      throw new Error("Missing collection controls.");
    }

    expect(
      resolveGeneratedWorkspaceIntent(
        foundation.runtimePlan,
        projectGeneratedWorkspaceCreateIntent(plan.scope, create.surface.id, {
          open: true,
          surfaceId: create.surface.id,
          type: "createOpenChange",
        }),
      ),
    ).toMatchObject({ kind: "control", runtime: { runtime: "collection-create" } });
    expect(
      resolveGeneratedWorkspaceIntent(
        foundation.runtimePlan,
        projectGeneratedWorkspaceCreateIntent(
          plan.scope,
          contextCreate.surface.id,
          {
            open: true,
            surfaceId: contextCreate.surface.id,
            type: "createOpenChange",
          },
          context.id,
        ),
      ),
    ).toMatchObject({ kind: "control", runtime: { runtime: "context-create" } });
    const createField = required(create.surface.dialog.form.fieldSet.fields[0]);
    const createFieldIntent = projectGeneratedWorkspaceFieldIntent(
      plan.scope,
      createField.fieldId,
      {
        fieldName: createField.fieldName,
        fieldValue: { kind: "input", value: "Weekend rate" },
        type: "createDraftChange",
      },
      { surfaceId: create.surface.id },
    );
    expect(
      resolveGeneratedWorkspaceIntent(foundation.runtimePlan, createFieldIntent),
    ).toMatchObject({
      field: { fieldId: createField.fieldId, fieldName: createField.fieldName },
      kind: "field",
      runtime: { runtime: "collection-create" },
    });
    expect(
      resolveGeneratedWorkspaceIntent(foundation.runtimePlan, {
        ...createFieldIntent,
        fieldId: `${createField.fieldId}:stale`,
      }),
    ).toBeUndefined();
    expect(
      resolveGeneratedWorkspaceIntent(foundation.runtimePlan, {
        ...createFieldIntent,
        intent: {
          fieldName: `${createField.fieldName}:other`,
          fieldValue: { kind: "input", value: "Wrong field" },
          type: "createDraftChange",
        },
      }),
    ).toBeUndefined();
    expect(
      resolveGeneratedWorkspaceIntent(foundation.runtimePlan, {
        ...createFieldIntent,
        contextId: context.id,
        surfaceId: contextCreate.surface.id,
      }),
    ).toBeUndefined();
    expect(
      resolveGeneratedWorkspaceIntent(
        foundation.runtimePlan,
        projectGeneratedWorkspaceOperationIntent(
          plan.scope,
          command.control.id,
          command.control.trigger.intent,
        ),
      ),
    ).toMatchObject({ kind: "control", runtime: { runtime: "collection-command" } });

    const tableOrdering = required(fixture.table.rows[0]?.cells[0]?.contents[0]);
    if (tableOrdering.kind !== "ordering") {
      throw new Error("Missing table ordering.");
    }
    const tableIntent = required(tableOrdering.actions[0]).intent;
    expect(
      resolveGeneratedWorkspaceIntent(
        foundation.runtimePlan,
        projectGeneratedWorkspaceTableIntent(plan.scope, fixture.table.id, tableIntent),
      ),
    ).toMatchObject({ kind: "result", result: { kind: "table" } });

    expect(JSON.stringify(fixture.table)).not.toContain('"fieldId"');
    expect(
      fixture.table.rows[0]?.cells.some((cell) =>
        cell.contents.some((content) => content.kind === "cellValue"),
      ),
    ).toBe(true);

    const detail = required(listDetail?.contextDetail);
    const field = required(detail.fields.find((field) => field.fieldName === "marginMin"));
    const fieldIntent = projectGeneratedWorkspaceFieldIntent(
      plan.scope,
      field.fieldId,
      { fieldName: "marginMin", type: "recordEditorDraftChange", value: "0.45" },
      {
        contextId: context.id,
        recordId: "rec_card_default",
        resultId: detail.id,
      },
    );
    expect(resolveGeneratedWorkspaceIntent(foundation.runtimePlan, fieldIntent)).toMatchObject({
      kind: "field",
      result: { kind: "recordResult" },
    });

    const deletion = required(detail.actions.secondary[0]);
    const deleteIntent = deletion.control.confirmation?.closeIntent;
    expect(deleteIntent).toBeDefined();
    if (deleteIntent === undefined) {
      throw new Error("Missing delete confirmation intent.");
    }
    expect(
      resolveGeneratedWorkspaceIntent(
        foundation.runtimePlan,
        projectGeneratedWorkspaceRecordResultIntent(
          plan.scope,
          detail.id,
          {
            controlId: deletion.control.id,
            intent: deleteIntent,
            recordId: "rec_card_default",
            resultId: detail.id,
            type: "recordResultOperationIntent",
          },
          context.id,
        ),
      ),
    ).toMatchObject({ kind: "result", result: { kind: "recordResult" } });

    expect(
      resolveGeneratedWorkspaceIntent(foundation.runtimePlan, {
        ...fieldIntent,
        fieldId: `${field.fieldId}:stale`,
      }),
    ).toBeUndefined();
    expect(
      resolveGeneratedWorkspaceIntent(foundation.runtimePlan, {
        ...query.selectionIntent,
        sectionId: `${plan.scope.sectionId}:other`,
      }),
    ).toBeUndefined();
    expect(
      resolveGeneratedWorkspaceIntent(foundation.runtimePlan, {
        ...projectGeneratedWorkspaceOperationIntent(
          plan.scope,
          command.control.id,
          command.control.trigger.intent,
        ),
        controlId: `${command.control.id}:stale`,
      }),
    ).toBeUndefined();
  });

  it("scopes repeated list sections, resolves list intents, and composes mixed tree screens", () => {
    const setup = requiredScreen("rateSetup");
    const cards = required(setup.layout.sections[0]);
    const cardRecords = rateCardTestRecords
      .filter((record) => record.entity === "card")
      .map((record, index) => ({ ...record, values: { ...record.values, order: index + 1 } }));
    const ordering = {
      field: { min: 0, required: true, type: "number" as const },
      fieldName: "order",
      presentations: ["moveMenu" as const],
      scope: [],
    };
    const repeatedCollection = {
      ...cards.collection,
      result: { ...cards.collection.result, ordering },
    };
    const screen: HomeScreenModel = {
      ...setup,
      layout: {
        ...setup.layout,
        sections: [
          { ...cards, collection: repeatedCollection },
          { ...cards, collection: repeatedCollection, id: "cards-repeat" },
        ],
      },
    };
    const foundation = selectGeneratedWorkspaceFoundation({
      screen,
      snapshot: projectionSnapshot([
        ...rateCardTestRecords.filter((record) => record.entity !== "card"),
        ...cardRecords,
      ]),
      today: "2026-07-16",
    });
    const selected = required(foundation);
    const [first, second] = selected.runtimePlan.sections;
    const firstResult = required(first).result;
    const secondResult = required(second).result;

    expect(firstResult.contract.id).not.toBe(secondResult.contract.id);
    expect(JSON.stringify(firstResult.contract)).not.toBe(JSON.stringify(secondResult.contract));
    if (firstResult.kind !== "list") {
      throw new Error("Missing list result.");
    }
    const item = required(firstResult.contract.items[0]);
    if (item.presentation !== "fields") {
      throw new Error("Expected a field-presented list item.");
    }
    const field = required(item.fields[0]);
    const action = required(item.ordering?.actions.find((candidate) => !candidate.disabled));
    const intent = projectGeneratedWorkspaceListIntent(
      required(first).scope,
      firstResult.contract.id,
      action.intent,
    );
    expect(resolveGeneratedWorkspaceIntent(selected.runtimePlan, intent)).toMatchObject({
      kind: "result",
      result: { kind: "list" },
    });
    expect(
      resolveGeneratedWorkspaceIntent(selected.runtimePlan, {
        ...intent,
        collectionId: required(second).scope.collectionId,
        sectionId: required(second).scope.sectionId,
      }),
    ).toBeUndefined();

    const fieldIntent = projectGeneratedWorkspaceFieldIntent(
      required(first).scope,
      field.fieldId,
      { fieldName: field.fieldName, type: "recordDraftRevert" },
      { recordId: item.id, resultId: firstResult.contract.id },
    );
    expect(resolveGeneratedWorkspaceIntent(selected.runtimePlan, fieldIntent)).toMatchObject({
      field: { fieldId: field.fieldId },
      kind: "field",
      result: { kind: "list" },
    });
    expect(
      resolveGeneratedWorkspaceIntent(selected.runtimePlan, {
        ...fieldIntent,
        fieldId: `${field.fieldId}:stale`,
      }),
    ).toBeUndefined();
    expect(
      resolveGeneratedWorkspaceIntent(selected.runtimePlan, {
        ...fieldIntent,
        intent: { fieldName: `${field.fieldName}:other`, type: "recordDraftRevert" },
      }),
    ).toBeUndefined();
    expect(
      resolveGeneratedWorkspaceIntent(selected.runtimePlan, {
        ...fieldIntent,
        recordId: `${item.id}:other`,
      }),
    ).toBeUndefined();
    expect(
      resolveGeneratedWorkspaceIntent(selected.runtimePlan, {
        ...fieldIntent,
        collectionId: required(second).scope.collectionId,
        resultId: secondResult.contract.id,
        sectionId: required(second).scope.sectionId,
      }),
    ).toBeUndefined();

    const siteEditor = required(
      selectScreenModels(siteSourceSchema).find(
        (candidate) => candidate.screenName === "siteEditor",
      ),
    );
    const siteSection = required(siteEditor.layout.sections[0]);
    const mixedScreen: HomeScreenModel = {
      ...siteEditor,
      layout: {
        ...siteEditor.layout,
        sections: [siteSection, { ...cards, collection: repeatedCollection, id: "cards" }],
      },
    };
    const mixedFoundation = required(
      selectGeneratedWorkspaceFoundation({
        screen: mixedScreen,
        sectionSelection: { site: { selectedContextRecordId: "rec_site_content_home" } },
        snapshot: projectionSnapshot([...testSiteRecords, ...rateCardTestRecords]),
        today: "2026-07-16",
      }),
    );
    const [treeSection, listSection] = mixedFoundation.workspace.sections;
    const treeResult = required(treeSection).collection.presentation.result;
    const listResult = required(listSection).collection.presentation.result;

    expect(mixedFoundation.runtimePlan.sections.map(({ result }) => result.kind)).toEqual([
      "treeResult",
      "list",
    ]);
    expect(treeResult).toMatchObject({
      availability: { state: "ready" },
      kind: "treeResult",
      root: { label: "Home" },
    });
    expect(listResult.kind).toBe("list");
    if (treeResult.kind !== "treeResult") {
      throw new Error("Missing tree result.");
    }
    const firstTreeItem = required(treeResult.items[0]);
    expect(firstTreeItem.id).not.toBe(firstTreeItem.placementId);
    expect(firstTreeItem.id).not.toBe(firstTreeItem.childRecordId);
    expect(JSON.stringify(treeResult)).not.toContain("recordsById");
    const treePlan = required(mixedFoundation.runtimePlan.sections[0]);
    const treeIntent = projectGeneratedWorkspaceTreeIntent(
      treePlan.scope,
      treeResult.id,
      firstTreeItem.selectionIntent,
    );
    expect(resolveGeneratedWorkspaceIntent(mixedFoundation.runtimePlan, treeIntent)).toMatchObject({
      kind: "treeSelection",
      selection: {
        itemId: firstTreeItem.id,
        placementId: firstTreeItem.placementId,
      },
    });
    const treeEditor = required(treeResult.selectedEditor);
    const treeChildField = required(treeEditor.childFields?.fields[0]);
    const treeNestedFieldIntent = {
      fieldId: treeChildField.fieldId,
      intent: {
        fieldName: treeChildField.fieldName,
        type: "recordEditorDraftChange",
        value: "Next child value",
      },
      resultId: treeResult.id,
      target: {
        fieldSetId: required(treeEditor.childFields).id,
        itemId: treeEditor.itemId,
        kind: "child",
      },
      type: "treeField",
    } as const;
    const treeFieldIntent = projectGeneratedWorkspaceTreeIntent(
      treePlan.scope,
      treeResult.id,
      treeNestedFieldIntent,
    );
    expect(
      resolveGeneratedWorkspaceIntent(mixedFoundation.runtimePlan, treeFieldIntent),
    ).toMatchObject({
      field: { fieldId: treeChildField.fieldId, recordId: treeEditor.childRecordId },
      kind: "treeField",
      runtime: { target: { kind: "child", recordId: treeEditor.childRecordId } },
    });
    expect(
      resolveGeneratedWorkspaceIntent(mixedFoundation.runtimePlan, {
        ...treeFieldIntent,
        intent: {
          ...treeNestedFieldIntent,
          target: { ...treeNestedFieldIntent.target, kind: "placement" },
        },
      }),
    ).toBeUndefined();
    expect(
      resolveGeneratedWorkspaceIntent(mixedFoundation.runtimePlan, {
        ...treeIntent,
        intent: { ...firstTreeItem.selectionIntent, itemId: `${firstTreeItem.id}:stale` },
      }),
    ).toBeUndefined();
    expect(
      resolveGeneratedWorkspaceIntent(mixedFoundation.runtimePlan, {
        ...treeIntent,
        intent: { ...firstTreeItem.selectionIntent, resultId: listResult.id },
      }),
    ).toBeUndefined();
    expect(
      resolveGeneratedWorkspaceIntent(mixedFoundation.runtimePlan, {
        ...treeIntent,
        collectionId: required(mixedFoundation.runtimePlan.sections[1]).scope.collectionId,
        sectionId: required(mixedFoundation.runtimePlan.sections[1]).scope.sectionId,
      }),
    ).toBeUndefined();
  });
});

function rateWorkspaceFixture() {
  const base = requiredScreen("rateHome");
  const section = required(base.layout.sections[0]);
  const context = required(section.collection.context);
  const tableResult = section.collection.result;
  if (tableResult.type !== "table") {
    throw new Error("Missing rate table result.");
  }
  const query = section.collection.queries.defaultTab;
  const rateAll = {
    count: { type: "count" as const },
    label: "All rates",
    query: { kind: "all" as const },
    queryName: "rateAll",
  };
  const cardRates = rateSourceSchema.relationships!.find(
    (definition) => definition.key === "cardRates",
  )!;
  if (cardRates?.kind !== "toMany") {
    throw new Error("Missing card rates relationship.");
  }
  const relatedCollection = {
    entity: rateSourceSchema.entities.find((definition) => definition.key === "rate")!,
    entityName: "rate",
    label: "Rates",
    referenceFieldName: "card",
    relationship: cardRates,
    relationshipName: "cardRates",
  };
  const projectedContext = {
    ...context,
    deleteOperation: testOperation("card", "delete"),
    presentation: "listDetail",
    recordFields: [
      {
        commit: "field-commit",
        editor: "text",
        field: rateSourceSchema.entities
          .find((definition) => definition.key === "card")!
          .fields.find((definition) => definition.key === "name")!,
        fieldName: "name",
      },
      ...(context.recordFields ?? []),
    ],
  } satisfies typeof context;
  const contextResult = contextRecordResult(projectedContext);
  const premium = required(rateCardTestRecords.find((record) => record.id === "rec_card_premium"));
  const staleState: GeneratedRecordResultRecordState = {
    ...createGeneratedRecordResultFieldAuthoringState(premium, contextResult),
    baselineRecordId: premium.id,
    baselineUpdatedAt: premium.updatedAt,
    confirmationOpenByControlId: { stale: true },
    errorsByFieldName: { marginMin: "Stale error" },
    iconDialogOpenByFieldName: { name: true },
    pendingByFieldName: { marginMin: true },
  };
  const screen: HomeScreenModel = {
    ...base,
    layout: {
      ...base.layout,
      sections: [
        {
          ...section,
          collection: {
            ...section.collection,
            context: {
              ...projectedContext,
              relatedCollection,
            },
            queries: {
              defaultQueryName: query.queryName,
              defaultTab: query,
              tabs: [query, rateAll],
            },
            summary: tableResult.footer,
          },
        },
      ],
    },
  };
  let table: TableContract | undefined;
  const foundation = required(
    selectGeneratedWorkspaceFoundation({
      screen,
      sectionSelection: {
        rates: {
          selectedContextRecordId: "missing-card",
          selectedQueryName: "missing-query",
        },
      },
      selectSectionFoundation: (facts) => {
        const selected = selectRateSectionFoundation(facts, staleState);
        table = selected.table?.table;
        return selected;
      },
      snapshot: projectionSnapshot(rateCardTestRecords),
      today: "2026-07-16",
    }),
  );

  return { foundation, table: required(table) };
}

function selectRateSectionFoundation(
  facts: GeneratedWorkspaceSectionSelectionFacts,
  staleState: GeneratedRecordResultRecordState,
): GeneratedWorkspaceSectionFoundationInput {
  const externalControlId = generatedWorkspaceScopedId(facts.scope, "control", "external");
  const collectionSurfaceId = generatedWorkspaceScopedId(
    facts.scope,
    "surface",
    "collection-create",
  );
  const contextSurfaceId = generatedWorkspaceScopedId(facts.scope, "surface", "context-create");
  const commandId = generatedWorkspaceScopedId(facts.scope, "control", "collection-command");
  const table = tableFoundation(facts.resultId, facts.recordIds);

  return {
    collectionActions: [
      {
        action: {
          kind: "createAction",
          surface: createSurface(collectionSurfaceId, "Create rate"),
        },
        placement: "primary",
        runtime: "collection-create",
      },
      {
        action: { control: operationControl(commandId, "Refresh rates"), kind: "operationAction" },
        placement: "secondary",
        runtime: "collection-command",
      },
    ],
    contextCreate: {
      action: { kind: "createAction", surface: createSurface(contextSurfaceId, "Create card") },
      runtime: "context-create",
    },
    contextDetail: { recordState: staleState },
    externalActions: [
      {
        action: actionTrigger(externalControlId, "Install"),
        id: "install",
        runtime: "external",
      },
    ],
    table,
  };
}

function selectSelectedRecordDetailSectionFoundation(
  facts: GeneratedWorkspaceSectionSelectionFacts,
): GeneratedWorkspaceSectionFoundationInput {
  const controller = createGeneratedOperationController({ bindings: [] });

  return {
    selectedRecordDetailRelationships: Object.fromEntries(
      facts.selectedRecordDetailRelationships.map((relationship) => {
        const table = selectGeneratedWorkspaceTableFoundation({
          controller,
          entity: relationship.section.entity,
          entityName: relationship.section.entityName,
          id: relationship.resultId,
          query: relationship.section.query,
          queryContext: relationship.queryContext,
          queryName: relationship.section.queryName,
          recordIds: relationship.recordIds,
          recordsById: facts.snapshot.recordsById,
          result: relationship.section.result,
          schema: rateSourceSchema,
        });

        return [
          relationship.section.id,
          {
            table: {
              editFieldsById: table.editFieldsById,
              runtime: { kind: "table", runtimePlan: table.runtimePlan },
              table: table.table,
            },
          },
        ] as const;
      }),
    ),
  };
}

function tableFoundation(id: string, recordIds: readonly string[]) {
  const rowId = recordIds[0] ?? "empty";
  const record = required(rateCardTestRecords.find((candidate) => candidate.id === rowId));
  const actionId = `${id}:${rowId}:move-down`;
  const columnId = `${id}:ordering-column`;
  const fieldColumnId = `${id}:cost-column`;
  const fieldCellId = `${id}:${rowId}:cost-cell`;
  const table: TableContract = {
    accessibilityLabel: "Rate records",
    columns: [
      {
        accessibilityLabel: "Ordering",
        alignment: "start",
        contentRole: "ordering",
        id: columnId,
        isRowHeader: false,
        kind: "tableColumn",
        label: "Order",
        labelVisibility: "hidden",
        width: "xs",
      },
      {
        accessibilityLabel: "Cost",
        alignment: "end",
        contentRole: "field",
        id: fieldColumnId,
        isRowHeader: false,
        kind: "tableColumn",
        label: "Cost",
        labelVisibility: "visible",
        width: "sm",
      },
    ],
    density: "default",
    id,
    kind: "table",
    rows: [
      {
        accessibilityLabel: `Rate ${rowId}`,
        cells: [
          {
            columnId,
            contents: [
              {
                accessibilityLabel: `Reorder rate ${rowId}`,
                actions: [
                  {
                    direction: "down",
                    id: actionId,
                    intent: {
                      actionId,
                      direction: "down",
                      rowId,
                      tableId: id,
                      type: "tableReorder",
                    },
                    kind: "orderingAction",
                    label: "Move down",
                  },
                ],
                affordance: "reorder",
                kind: "ordering",
                pending: false,
              },
            ],
            id: `${id}:${rowId}:ordering-cell`,
            kind: "tableCell",
          },
          {
            columnId: fieldColumnId,
            contents: [
              {
                accessibilityLabel: `Cost: ${record.values.cost}`,
                displayValue: String(record.values.cost),
                kind: "cellValue",
                presentation: { kind: "number" },
              },
            ],
            id: fieldCellId,
            kind: "tableCell",
          },
        ],
        id: rowId,
        kind: "tableRow",
      },
    ],
  };

  return {
    editFieldsById: new Map(),
    runtime: "table",
    table,
  };
}

function contextRecordResult(
  context: NonNullable<HomeScreenModel["layout"]["sections"][number]["collection"]["context"]>,
): RecordResultModel {
  return {
    ...(context.deleteOperation === undefined ? {} : { deleteOperation: context.deleteOperation }),
    itemViewName: context.itemViewName ?? `${context.name}:detail`,
    recordFields: context.recordFields ?? [],
    ...(context.recordUnion === undefined ? {} : { recordUnion: context.recordUnion }),
    transitionOperations: context.transitionOperations,
    type: "record",
    ...(context.updateOperation === undefined ? {} : { updateOperation: context.updateOperation }),
  };
}

function projectionSnapshot(records: readonly StoredRecord[]) {
  return {
    recordsById: Object.fromEntries(records.map((record) => [record.id, record])),
    recordIdsByEntity: records.reduce<Record<string, string[]>>((byEntity, record) => {
      (byEntity[record.entity] ??= []).push(record.id);
      return byEntity;
    }, {}),
  };
}

function selectedRecordDetailRateScreen(): HomeScreenModel {
  const setup = rateSourceSchema.screens.find((screen) => screen.key === "rateSetup");
  const cardHome = rateSourceSchema.views.find((view) => view.key === "cardHome");
  if (
    setup?.type !== "workspace" ||
    cardHome?.type !== "collection" ||
    cardHome.result.type !== "list"
  ) {
    throw new Error("Missing rate-card selected-record fixtures.");
  }
  const cards = setup.layout.sections.find((section) => section.id === "cards")!;
  const schema = {
    ...rateSourceSchema,
    itemViews: [
      ...rateSourceSchema.itemViews,
      {
        key: "cardSummary",
        entity: "card",
        presentation: {
          type: "summary" as const,
          slots: { title: { field: "name" } },
        },
      },
    ],
    queries: [
      ...rateSourceSchema.queries,
      {
        key: "cardDefault",
        label: "Default",
        entity: "card",
        expression: {
          kind: "where" as const,
          ref: { kind: "value" as const, name: "isDefault" },
          op: "eq" as const,
          value: true,
        },
      },
    ],
    views: rateSourceSchema.views.map((view) =>
      view.key === cardHome.key
        ? {
            ...cardHome,
            queries: [...cardHome.queries, { query: "cardDefault" }],
            result: { ...cardHome.result, itemView: "cardSummary" },
          }
        : view,
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
                        id: "overview",
                        type: "record" as const,
                        itemView: "cardListItem",
                      },
                      {
                        id: "rates",
                        type: "relationship" as const,
                        relationship: "cardRates",
                        query: "ratesForSelectedCard",
                        result: { type: "table" as const, tableView: "rateTable" },
                      },
                    ],
                  },
                },
              ],
            },
          }
        : screen,
    ),
  } satisfies AppSchema;

  return required(selectScreenModels(schema).find((screen) => screen.screenName === "rateSetup"));
}

function requiredScreen(screenName: string): HomeScreenModel {
  return required(
    selectScreenModels(rateSourceSchema).find((screen) => screen.screenName === screenName),
  );
}

function actionTrigger(id: string, label: string): ActionTriggerContract {
  return {
    id,
    invocationSource: "button",
    invoke: { controlId: id, invocationSource: "button" },
    kind: "actionTrigger",
    label,
  };
}

function createSurface(id: string, label: string): CreateSurfaceContract {
  return {
    dialog: {
      form: {
        cancel: button(`${id}:cancel`, "Cancel"),
        errors: [],
        fieldSet: {
          disabled: false,
          fields: [createSurfaceField(id)],
          id: `${id}:fields`,
          kind: "fieldSet",
        },
        id: `${id}:form`,
        kind: "createForm",
        submit: { ...button(`${id}:submit`, label), type: "submit" },
      },
      id: `${id}:dialog`,
      kind: "createDialog",
      open: false,
      title: label,
    },
    id,
    kind: "createSurface",
    trigger: button(`${id}:trigger`, label),
  };
}

function createSurfaceField(surfaceId: string): CreateFieldContract {
  const field = { label: "Name", required: true, type: "text" } as const;

  return {
    access: { canPatch: true, kind: "editable", writable: true },
    commit: "submit",
    control: {
      control: { inputType: "text", kind: "input" },
      controlKind: "text",
      createDefaultChecked: false,
      createDefaultValue: undefined,
      editor: "text",
      field,
      inputAttributes: {},
      kind: "text",
      label: field.label,
      required: true,
    },
    density: "default",
    draftInput: { kind: "input", value: "" },
    editor: "text",
    field,
    fieldId: `${surfaceId}:field:name`,
    fieldName: "name",
    label: field.label,
    labelVisibility: "visible",
    mode: "editor",
    required: true,
    surface: "create",
    value: "",
  };
}

function button(id: string, label: string): ButtonContract {
  return {
    accessibilityLabel: label,
    content: { kind: "label", label },
    density: "default",
    id,
    kind: "button",
    prominence: "secondary",
    type: "button",
  };
}

function operationControl(id: string, label: string): OperationControlContract {
  const binding: GeneratedOperationControlBinding = {
    availability: { state: "enabled" },
    canonicalOperationKey: `rate.${id}`,
    entityName: "rate",
    executionKey: `${id}:execution`,
    id,
    input: { kind: "collectionCommand", ui: { showAffectedCountOnSuccess: false } },
    kind: "command",
    label,
    operationKind: "command",
    operationName: id,
    scope: "collection",
    visualIntent: "default",
  };
  return projectGeneratedOperationControl({
    binding,
    presentation: {
      accessibilityLabel: label,
      content: { kind: "label", label },
      density: "default",
      prominence: "secondary",
    },
    state: { executionKey: binding.executionKey, status: "idle" },
  });
}

function testOperation(
  entityName: string,
  kind: "delete" | "update",
): EntityOperationPresentationConfig {
  return {
    canonicalKey: `${entityName}.${kind}`,
    entityName,
    label: kind === "delete" ? "Delete" : "Update",
    operation: {
      audit: { input: "summary" },
      effect: kind === "delete" ? { type: "deleteRecord" } : { type: "patchRecord" },
      idempotency: { required: true },
      input: { fields: [] },
      kind,
      output: { type: kind },
      scope: "record",
    },
    operationName: kind,
  };
}

function required<T>(value: T | null | undefined): T {
  if (value === undefined || value === null) {
    throw new Error("Missing required fixture value.");
  }
  return value;
}
