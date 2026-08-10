// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
  type RenderResult,
} from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vite-plus/test";
import type { IconValueMode } from "@dpeek/formless-schema";
import type {
  FieldIntent,
  IconPickerSelection,
  RecordFieldContract,
} from "@dpeek/formless-presentation/contract";
import { FieldRenderer } from "./field-renderer.tsx";
import { recordDrafts, recordField, textControl } from "./fixture-helpers.ts";

const productSource = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /></svg>';
const addSource = '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>';
const legacySource = '<svg viewBox="0 0 24 24"><path d="M4 12h16" /></svg>';
const customSource = '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z" /></svg>';

afterEach(cleanup);

describe("Astryx mode-aware icon field", () => {
  it("keeps source matching and custom SVG authoring in source mode", async () => {
    const field = iconField({
      previewSource: customSource,
      selection: { kind: "customSource", source: customSource },
      value: customSource,
      valueMode: "svgSource",
    });
    const intents: FieldIntent[] = [];
    const renderer = render(
      <FieldRenderer
        field={field}
        onIntent={(intent) => {
          intents.push(intent);
        }}
      />,
    );

    expect(renderer.getByText("Custom")).toBeDefined();
    const sourceInput = renderer.getByLabelText("Page icon custom source");
    fireEvent.change(sourceInput, { target: { value: legacySource } });
    expect(intents.at(-1)).toEqual({
      fieldName: "icon",
      type: "iconDialogDraftChange",
      value: legacySource,
    });

    await selectCatalogOption(renderer, "Product");
    await waitFor(() =>
      expect(intents).toContainEqual({
        fieldName: "icon",
        type: "recordValueCommit",
        value: productSource,
      }),
    );
  });

  it("renders transitional legacy source but commits catalog ids without custom authoring", async () => {
    const field = iconField({
      previewSource: legacySource,
      selection: { kind: "legacySource", source: legacySource },
      value: legacySource,
      valueMode: "iconIdWithSvgFallback",
    });
    const html = renderToStaticMarkup(<FieldRenderer field={field} />);
    const intents: FieldIntent[] = [];
    const renderer = render(
      <FieldRenderer
        field={field}
        onIntent={(intent) => {
          intents.push(intent);
        }}
      />,
    );

    expect(html).toContain('data-astryx-icon-preview="valid"');
    expect(html).not.toContain("Custom");
    expect(renderer.queryByLabelText("Page icon custom source")).toBeNull();

    await selectCatalogOption(renderer, "Product");
    await waitFor(() =>
      expect(intents).toContainEqual({
        fieldName: "icon",
        type: "recordValueCommit",
        value: "product",
      }),
    );
    expect(intents).not.toContainEqual({
      fieldName: "icon",
      type: "recordValueCommit",
      value: productSource,
    });
  });

  it("keeps missing strict ids visible and removable", async () => {
    const intents: FieldIntent[] = [];
    const renderer = render(
      <FieldRenderer
        field={iconField({
          previewSource: "",
          selection: { id: "retired-icon", kind: "missingId" },
          value: "retired-icon",
          valueMode: "iconId",
        })}
        onIntent={(intent) => {
          intents.push(intent);
        }}
      />,
    );

    expect(renderer.getByText("Missing icon: retired-icon")).toBeDefined();
    expect(renderer.queryByText("Custom")).toBeNull();
    await act(async () => {
      fireEvent.click(renderer.getByRole("button", { name: "Remove Page icon" }));
    });
    expect(intents).toContainEqual({
      fieldName: "icon",
      type: "recordValueCommit",
      value: "",
    });
  });
});

function iconField({
  previewSource,
  selection,
  value,
  valueMode,
}: {
  previewSource: string;
  selection: IconPickerSelection;
  value: string;
  valueMode: IconValueMode;
}): RecordFieldContract {
  const field = {
    format: "icon",
    icon: { valueMode },
    label: "Page icon",
    required: false,
    type: "text",
  } as const;

  return recordField({
    commit: "field-commit",
    control: textControl(field, { controlKind: "icon", editor: "icon" }),
    drafts: recordDrafts({ recordValue: value }),
    editor: "icon",
    field,
    fieldName: "icon",
    icon: {
      canCancel: false,
      canSave: false,
      dialogDraft: value,
      dialogOpen: false,
      emptyValue: value === "",
      previewSource,
      selection,
      valueMode,
    },
    labelVisibility: "visible",
    occurrence: { ownerId: `icon-${valueMode}`, placementId: "icon" },
    options: {
      iconOptions: [
        { group: "Brand", id: "product", label: "Product", source: productSource },
        { group: "Interface", id: "add", label: "Add", source: addSource },
      ],
    },
    rendererKind: "icon",
  });
}

async function selectCatalogOption(renderer: RenderResult, label: string) {
  fireEvent.click(renderer.getByRole("button", { name: /^Edit/ }));
  const catalogMode = renderer.queryByText("Catalog");
  if (catalogMode !== null) {
    fireEvent.click(catalogMode);
  }

  await act(async () => {
    fireEvent.click(renderer.getByRole("checkbox", { name: label }));
  });
}
