import { describe, expect, it } from "vite-plus/test";
import { rateSourceSchema as rateCardSchema, siteSourceSchema } from "../test/schema-apps.ts";
import {
  selectGeneratedContextSelectionFacts,
  selectGeneratedRootNavigationFacts,
  selectGeneratedRootNavigationGroupFacts,
  selectGeneratedRootNavigationStateFacts,
} from "./generated-authoring.ts";
import {
  selectPrimaryCollectionModels,
  selectPrimaryScreenModels,
  type HomeContextConfig,
  type HomeScreenModel,
} from "./views.ts";

describe("generated authoring context selection", () => {
  it("preserves a selected context id that is still in the option set", () => {
    const context = requiredRateContext();
    const facts = selectGeneratedContextSelectionFacts({
      context,
      options: [
        { id: "card-1", label: "Default" },
        { id: "card-2", label: "Backup" },
      ],
      selectedRecordId: "card-2",
      today: "2026-05-12",
    });

    expect(facts.activeRecordId).toBe("card-2");
    expect(facts.detailLabel).toBe("Backup");
    expect(facts.queryContext).toEqual({
      today: "2026-05-12",
      values: { card: "card-2" },
    });
    expect(facts.actionQueryContext).toEqual({
      today: "2026-05-12",
      values: { card: "card-2" },
    });
    expect([...facts.selectableRecordIds]).toEqual(["card-1", "card-2"]);
    expect(facts.showLocalSelector).toBe(true);
    expect(facts.isEmpty).toBe(false);
  });

  it("falls back from a stale selected context id to the first current option", () => {
    const facts = selectGeneratedContextSelectionFacts({
      context: requiredRateContext(),
      options: [
        { id: "card-1", label: "Default" },
        { id: "card-2", label: "Backup" },
      ],
      selectedRecordId: "missing-card",
      today: "2026-05-12",
    });

    expect(facts.activeRecordId).toBe("card-1");
    expect(facts.queryContext).toEqual({
      today: "2026-05-12",
      values: { card: "card-1" },
    });
  });

  it("keeps empty context option sets unresolved", () => {
    const facts = selectGeneratedContextSelectionFacts({
      context: requiredRateContext(),
      options: [],
      selectedRecordId: "card-1",
      today: "2026-05-12",
    });

    expect(facts.activeRecordId).toBeNull();
    expect(facts.queryContext).toBeUndefined();
    expect(facts.actionQueryContext).toEqual({ today: "2026-05-12" });
    expect(facts.isEmpty).toBe(true);
    expect(facts.showUnselectedState).toBe(false);
  });

  it("hides local list/detail selectors for singleton or sidebar navigation contexts", () => {
    const context = requiredRateContext();
    const singletonFacts = selectGeneratedContextSelectionFacts({
      context,
      options: [{ id: "card-1", label: "Default" }],
      selectedRecordId: null,
      today: "2026-05-12",
    });
    const sidebarFacts = selectGeneratedContextSelectionFacts({
      context: {
        ...context,
        navigation: {
          placement: "sidebar",
          groups: [],
        },
      },
      options: [
        { id: "card-1", label: "Default" },
        { id: "card-2", label: "Backup" },
      ],
      selectedRecordId: null,
      today: "2026-05-12",
    });

    expect(singletonFacts.isSingleton).toBe(true);
    expect(singletonFacts.showLocalSelector).toBe(false);
    expect(sidebarFacts.hasSidebarNavigation).toBe(true);
    expect(sidebarFacts.showLocalSelector).toBe(false);
  });
});

describe("generated authoring root navigation", () => {
  it("selects the first collection section with context navigation", () => {
    const screen = requiredSiteScreen();
    const facts = selectGeneratedRootNavigationFacts(screen);

    expect(screen.layout.sections.map((section) => section.id)).toEqual(["site"]);
    expect(facts?.screen.screenName).toBe("siteEditor");
    expect(facts?.section.id).toBe("site");
    expect(facts?.context.name).toBe("block");
    expect(facts?.groups.map((group) => group.label)).toEqual([
      "Pages",
      "Posts",
      "Projects",
      "Navigation",
    ]);
  });
  it("exposes Site pages, posts and projects as root navigation groups with fixed creates", () => {
    const facts = selectGeneratedRootNavigationFacts(requiredSiteScreen());
    expect(
      siteSourceSchema.queries.find((definition) => definition.key === "blockPosts")?.label,
    ).toBe("Posts");
    expect(
      siteSourceSchema.queries.find((definition) => definition.key === "blockProjects")?.label,
    ).toBe("Projects");
    expect(
      facts?.groups.map((group) => [
        group.label,
        group.queryName,
        group.createOperation?.label ?? null,
        group.createOperation?.defaults.map((defaultValue) => [
          defaultValue.fieldName,
          defaultValue.value,
        ]) ?? [],
      ]),
    ).toEqual([
      ["Pages", "blockPages", "Create Page", [["type", { kind: "literal", value: "page" }]]],
      ["Posts", "blockPosts", "Create Post", [["type", { kind: "literal", value: "post" }]]],
      [
        "Projects",
        "blockProjects",
        "Create Project",
        [["type", { kind: "literal", value: "project" }]],
      ],
      ["Navigation", "blockNavigationRoots", null, []],
    ]);
  });

  it("leaves screens without context navigation on normal screen links", () => {
    const screen = selectPrimaryScreenModels(rateCardSchema)[0];

    if (!screen) {
      throw new Error("Missing rate-card screen.");
    }

    expect(selectGeneratedRootNavigationFacts(screen)).toBeUndefined();
  });

  it("falls root navigation selection back to the first available context option", () => {
    const facts = selectGeneratedRootNavigationStateFacts({
      options: [
        { id: "home", label: "Home" },
        { id: "blog", label: "Blog" },
      ],
      selectedRecordId: "missing",
    });

    expect(facts.activeRecordId).toBe("home");
  });

  it("models empty and active root navigation group items", () => {
    expect(
      selectGeneratedRootNavigationGroupFacts({
        activeRecordId: "home",
        options: [],
      }),
    ).toEqual({ isEmpty: true, items: [] });

    expect(
      selectGeneratedRootNavigationGroupFacts({
        activeRecordId: "blog",
        options: [
          { id: "home", label: "Home" },
          { id: "blog", label: "Blog" },
        ],
      }),
    ).toEqual({
      isEmpty: false,
      items: [
        { isActive: false, option: { id: "home", label: "Home" } },
        { isActive: true, option: { id: "blog", label: "Blog" } },
      ],
    });
  });
});

function requiredRateContext(): HomeContextConfig {
  const context = selectPrimaryCollectionModels(rateCardSchema).find(
    (model) => model.viewName === "rateHome",
  )?.context;

  if (!context) {
    throw new Error("Missing rate-card context.");
  }

  return context;
}

function requiredSiteScreen(): HomeScreenModel {
  const screen = selectPrimaryScreenModels(siteSourceSchema).find(
    (model) => model.screenName === "siteEditor",
  );

  if (!screen) {
    throw new Error("Missing site screen.");
  }

  return screen;
}
