// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vite-plus/test";
import type {
  RecordResultContract,
  WorkspaceContract,
  WorkspaceSelectedRecordSectionContract,
} from "@dpeek/formless-presentation/contract";
import { PresentationHostProvider } from "@dpeek/formless-presentation/host/react";
import { FormlessApplicationRenderer } from "../application-assembly.tsx";
import { operationControlFixtures } from "./operation-controls.fixtures.ts";
import {
  createFormlessGeneratedWorkspaceFixtureHost,
  selectedGeneratedWorkspaceFixture,
} from "./generated-workspace.tsx";
import { createFormlessGeneratedWorkspaceFixtures } from "./generated-workspace.fixtures.ts";
import {
  AstryxSubscribedWorkspaceScreenRenderer,
  AstryxWorkspaceScreenRenderer,
} from "./workspace-screen-renderer.tsx";

afterEach(cleanup);

describe("selected-record workspace renderer", () => {
  it("drills from the controlled list into composed record and relationship detail and back", async () => {
    const fixture = requiredFixture("selected-record-unselected");
    const fixtureHost = createFormlessGeneratedWorkspaceFixtureHost(fixture.workspace);
    const renderer = render(
      <PresentationHostProvider host={fixtureHost.host}>
        <AstryxSubscribedWorkspaceScreenRenderer reference={fixtureHost.workspaceReference} />
      </PresentationHostProvider>,
    );

    expect(renderer.queryByRole("button", { name: "Back to Orders" })).toBeNull();
    expect(renderer.queryByRole("heading", { name: "Order details" })).toBeNull();
    expect(fixture.workspace.surface).toBe("full");
    expect("width" in fixture.workspace).toBe(false);

    const firstOrder = renderer.getByRole("listitem", { name: "Patrick Lee" });
    expect(within(firstOrder).getByText("LH3BJMV5")).toBeDefined();
    expect(renderer.queryByRole("button", { name: "View" })).toBeNull();
    fireEvent.click(within(firstOrder).getByRole("button"));

    await waitFor(() =>
      expect(renderer.getByRole("heading", { name: "Order details" })).toBeDefined(),
    );
    expect(firstOrder.getAttribute("aria-current")).toBe("true");
    expect(renderer.getByRole("heading", { name: "Compounds" })).toBeDefined();
    expect(renderer.getByRole("table", { name: "Related compounds" })).toBeDefined();
    expect(renderer.getByRole("button", { name: "Add compound" })).toBeDefined();
    expect(renderer.queryByRole("button", { name: "Complete task" })).toBeNull();

    const recordDetail = renderer.getByRole("region", { name: "Order details" });
    fireEvent.click(
      within(recordDetail).getByRole("button", { name: /Status: Open.*Change state/ }),
    );
    fireEvent.click(await renderer.findByRole("menuitem", { name: "Complete" }));
    await waitFor(() =>
      expect(
        within(recordDetail).getByRole("status", { name: /Status: Done terminal/ }),
      ).toBeDefined(),
    );

    fireEvent.click(renderer.getByRole("button", { name: "Add compound" }));
    await waitFor(() => expect(renderer.getByText("Add compound complete")).toBeDefined());

    fireEvent.click(renderer.getByRole("button", { name: "Back to Orders" }));
    await waitFor(() =>
      expect(renderer.queryByRole("heading", { name: "Order details" })).toBeNull(),
    );
    expect(renderer.queryByRole("button", { name: "Back to Orders" })).toBeNull();
  });

  it("renders the full Orders workspace through the production application assembly", () => {
    const fixture = requiredFixture("selected-record");
    const fixtureHost = createFormlessGeneratedWorkspaceFixtureHost(fixture.workspace);
    const html = renderToStaticMarkup(
      <PresentationHostProvider host={fixtureHost.host}>
        <FormlessApplicationRenderer
          presentation={{ kind: "workspace", reference: fixtureHost.workspaceReference }}
        />
      </PresentationHostProvider>,
    );

    expect(html).toContain("align-items:stretch;flex:1");
    expect(html).toContain("height:100%");
    expect(html).not.toContain("max-width:1600px");
    expect(html).toContain("Patrick Lee");
    expect(html).toContain("Order details");
    expect(html).toContain("Related compounds");
  });

  it("keeps canonical pending confirmation, empty table, and unavailable record renderers", () => {
    const fixture = requiredFixture("selected-record");
    const workspace = withDetailStates(fixture.workspace);
    const renderer = render(
      <AstryxWorkspaceScreenRenderer onIntent={() => undefined} workspace={workspace} />,
    );

    expect(renderer.getByText("Order record is unavailable.")).toBeDefined();
    expect(renderer.getByText("No related compounds")).toBeDefined();
    expect(
      renderer
        .getAllByRole("button", { name: "Delete task" })
        .some((button) => button.hasAttribute("disabled")),
    ).toBe(true);
    expect(renderer.getByText("Deleting task")).toBeDefined();
    expect(renderer.getByRole("alertdialog", { name: "Delete task?" })).toBeDefined();
  });
});

function requiredFixture(id: "selected-record" | "selected-record-unselected") {
  const fixture = selectedGeneratedWorkspaceFixture(createFormlessGeneratedWorkspaceFixtures(), id);
  if (!fixture) {
    throw new Error(`Missing ${id} workspace fixture.`);
  }
  return fixture;
}

function required<Value>(value: Value): NonNullable<Value> {
  if (value === null || value === undefined) {
    throw new Error("Expected value.");
  }
  return value as NonNullable<Value>;
}

function withDetailStates(workspace: WorkspaceContract): WorkspaceContract {
  const section = required(workspace.sections[0]);
  const presentation = section.collection.presentation;
  if (presentation.kind !== "selectedRecord") {
    throw new Error("Expected selected-record workspace fixture.");
  }

  return {
    ...workspace,
    sections: [
      {
        ...section,
        collection: {
          ...section.collection,
          presentation: {
            ...presentation,
            sections: presentation.sections.map(withDetailSectionState),
          },
        },
      },
    ],
  };
}

function withDetailSectionState(
  section: WorkspaceSelectedRecordSectionContract,
): WorkspaceSelectedRecordSectionContract {
  if (section.kind === "selectedRecordRecordSection") {
    return {
      ...section,
      result: {
        ...section.result,
        actions: emptyRecordActions(section.result),
        availability: { message: "Order record is unavailable.", state: "unavailable" },
        fields: [],
      },
    };
  }

  return {
    ...section,
    headingOperations: [operationControlFixtures.deleteTask.pending],
    result: {
      ...section.result,
      emptyState: {
        id: `${section.result.id}:empty`,
        kind: "tableEmptyState",
        title: "No related compounds",
      },
      rows: [],
    },
  };
}

function emptyRecordActions(result: RecordResultContract): RecordResultContract["actions"] {
  return {
    ...result.actions,
    primary: [],
    secondary: [],
  };
}
