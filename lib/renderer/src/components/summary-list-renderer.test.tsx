// @vitest-environment jsdom

import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { ListContract, ListSummaryItemContract } from "@dpeek/formless-presentation/contract";
import { AstryxListRenderer } from "./list-renderer.tsx";

afterEach(cleanup);

describe("Astryx summary list renderer", () => {
  it("renders controlled title and subtitle rows as the sole selection targets", () => {
    const list = summaryList(true);
    const onItemSelect = vi.fn();
    const onFieldIntent = vi.fn();
    const onListIntent = vi.fn();
    const onOperationIntent = vi.fn();
    const renderer = render(
      <AstryxListRenderer
        list={list}
        onFieldIntent={onFieldIntent}
        onItemSelect={onItemSelect}
        onListIntent={onListIntent}
        onOperationIntent={onOperationIntent}
        selectedItemId="order-1"
      />,
    );

    const firstOrder = renderer.getByRole("listitem", { name: "Order 1001" });
    const secondOrder = renderer.getByRole("listitem", { name: "Order 1002" });

    expect(within(firstOrder).getByText("Order 1001")).toBeDefined();
    expect(within(firstOrder).getByText("Ready to ship")).toBeDefined();
    expect(within(secondOrder).getByText("Order 1002")).toBeDefined();
    expect(within(secondOrder).queryByText("Ready to ship")).toBeNull();
    expect(firstOrder.getAttribute("aria-current")).toBeNull();
    expect(secondOrder.getAttribute("aria-current")).toBe("true");
    expect(renderer.queryByText("View")).toBeNull();
    expect(renderer.queryByRole("status")).toBeNull();
    expect(renderer.queryByRole("textbox")).toBeNull();

    fireEvent.click(firstOrder);

    expect(onItemSelect).toHaveBeenCalledWith(list.items[0]);
    expect(onFieldIntent).not.toHaveBeenCalled();
    expect(onListIntent).not.toHaveBeenCalled();
    expect(onOperationIntent).not.toHaveBeenCalled();
  });

  it("keeps summary rows without controlled selection facts non-interactive", () => {
    const renderer = render(
      <AstryxListRenderer
        list={summaryList(false)}
        onFieldIntent={() => undefined}
        onListIntent={() => undefined}
        onOperationIntent={() => undefined}
      />,
    );

    expect(renderer.getByRole("listitem", { name: "Order 1001" })).toBeDefined();
    expect(renderer.queryByRole("button")).toBeNull();
  });
});

function summaryList(selectable: boolean): ListContract {
  return {
    accessibilityLabel: "Orders",
    density: "compact",
    editing: { enabled: true },
    id: "orders",
    items: [
      summaryItem("order-1", "Order 1001", "Ready to ship", false, selectable),
      summaryItem("order-2", "Order 1002", undefined, true, selectable),
    ],
    kind: "list",
  };
}

function summaryItem(
  id: string,
  title: string,
  subtitle: string | undefined,
  selected: boolean,
  selectable: boolean,
): ListSummaryItemContract {
  const item = {
    accessibilityLabel: title,
    id,
    kind: "listItem" as const,
    presentation: "summary" as const,
    ...(subtitle === undefined ? {} : { subtitle }),
    title,
  };

  return selectable
    ? {
        ...item,
        selected,
        selectionIntent: {
          collectionId: "orders",
          recordId: id,
          screenId: "orders",
          sectionId: "orders",
          type: "workspaceSelectedRecordSelection",
        },
      }
    : item;
}
