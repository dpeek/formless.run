import { describe, expect, it } from "vite-plus/test";
import {
  createHomeRouteSelectionState,
  homeRouteSectionSelectionKey,
  selectHomeRouteSectionContextRecordId,
  selectHomeRouteSectionQueryName,
  selectHomeRouteSectionRecordId,
  withHomeRouteSelectedScreenName,
  withHomeRouteSelectedSectionContextRecordId,
  withHomeRouteSelectedSectionQueryName,
  withHomeRouteSelectedSectionRecordId,
} from "./home-selection.tsx";

describe("home route selection", () => {
  it("keeps query and context selection in the current screen section", () => {
    const state = withHomeRouteSelectedSectionContextRecordId(
      withHomeRouteSelectedSectionQueryName(
        withHomeRouteSelectedScreenName(createHomeRouteSelectionState(), "taskHome"),
        "taskHome",
        "tasks",
        "taskCompleted",
      ),
      "taskHome",
      "tasks",
      "record-1",
    );
    const sectionKey = homeRouteSectionSelectionKey("taskHome", "tasks");

    expect(state).toEqual({
      selectedScreenName: "taskHome",
      selectedQueryNamesBySection: { [sectionKey]: "taskCompleted" },
      selectedContextIdsBySection: { [sectionKey]: "record-1" },
      selectedRecordIdsBySection: {},
    });
    expect(createHomeRouteSelectionState()).toEqual({
      selectedScreenName: null,
      selectedQueryNamesBySection: {},
      selectedContextIdsBySection: {},
      selectedRecordIdsBySection: {},
    });
  });

  it("keeps the same section id independent across screens", () => {
    const state = withHomeRouteSelectedSectionContextRecordId(
      withHomeRouteSelectedSectionContextRecordId(
        createHomeRouteSelectionState(),
        "rateHome",
        "rates",
        "card-1",
      ),
      "rateSetup",
      "rates",
      "card-2",
    );

    expect(selectHomeRouteSectionContextRecordId(state, "rateHome", "rates")).toBe("card-1");
    expect(selectHomeRouteSectionContextRecordId(state, "rateSetup", "rates")).toBe("card-2");
    expect(selectHomeRouteSectionContextRecordId(state, "rateSetup", "resources")).toBeNull();
    expect(selectHomeRouteSectionQueryName(state, "rateHome", "rates")).toBeNull();
  });

  it("keeps repeated collection view sections independently selectable", () => {
    const state = withHomeRouteSelectedSectionRecordId(
      withHomeRouteSelectedSectionRecordId(
        withHomeRouteSelectedScreenName(createHomeRouteSelectionState(), "cards"),
        "cards",
        "primary",
        "card-1",
      ),
      "cards",
      "secondary",
      "card-2",
    );
    const cleared = withHomeRouteSelectedSectionRecordId(state, "cards", "primary", null);

    expect(selectHomeRouteSectionRecordId(state, "cards", "primary")).toBe("card-1");
    expect(selectHomeRouteSectionRecordId(state, "cards", "secondary")).toBe("card-2");
    expect(selectHomeRouteSectionRecordId(cleared, "cards", "primary")).toBeNull();
    expect(selectHomeRouteSectionRecordId(cleared, "cards", "secondary")).toBe("card-2");
    expect(
      selectHomeRouteSectionRecordId(createHomeRouteSelectionState(), "cards", "primary"),
    ).toBeUndefined();
  });

  it("clears selected records when the active screen changes", () => {
    const selected = withHomeRouteSelectedSectionRecordId(
      withHomeRouteSelectedScreenName(createHomeRouteSelectionState(), "cards"),
      "cards",
      "primary",
      "card-1",
    );
    const changedScreen = withHomeRouteSelectedScreenName(selected, "resources");

    expect(selectHomeRouteSectionRecordId(changedScreen, "cards", "primary")).toBeUndefined();
    expect(changedScreen.selectedRecordIdsBySection).toEqual({});
  });
});
