import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import type { FieldIntent, FieldSurface } from "@dpeek/formless-presentation/contract";
import {
  DocumentMediaInput,
  type DocumentMediaInputProps,
  MediaInput,
  type MediaInputProps,
} from "../media-input.tsx";
import { FieldRenderer } from "./field-renderer.tsx";
import { MediaFieldEditor } from "./media-field.tsx";
import { mediaScenarioGroups } from "./media-field.fixtures.ts";

const supportedMediaSurfaces = [
  { groupId: "media-create", surface: "create" },
  { groupId: "media-record", surface: "record" },
  { groupId: "media-table-cell", surface: "table-cell" },
  { groupId: "media-detail", surface: "detail" },
] as const;

describe("Astryx media field conformance", () => {
  it("covers canonical create, record, table, detail, and tree-record contract surfaces", () => {
    expect(mediaScenarioGroups.map(({ id, surface }) => ({ groupId: id, surface }))).toEqual(
      supportedMediaSurfaces,
    );

    const variants = mediaScenarioGroups.flatMap((group) => group.variants);

    expect(new Set(variants.map(({ field }) => field.surface))).toEqual(
      new Set<FieldSurface>(["create", "record", "table-cell", "detail"]),
    );
    expect(variants.some(({ field }) => field.surface === "operation")).toBe(false);

    for (const variant of variants) {
      const { field } = variant;
      const valueFacet = variant.facets.value;

      expect(field.control.controlKind).toBe("media");
      expect(field.options?.mediaAssetOptions?.length).toBeGreaterThan(0);

      if (variant.facets.format === "document") {
        if (valueFacet === "selected") {
          expect(field.media).toMatchObject({
            document: {
              byteSize: 42_000,
              contentType: "application/pdf",
              filename: "Quarterly report.pdf",
            },
            selectedAssetId: "document-quarterly-report",
          });
        } else if (valueFacet === "missing") {
          expect(field.media).toMatchObject({
            missingSelectedAsset: {
              assetId: "document-missing-report",
              reason: "The selected document is unavailable.",
            },
            selectedAssetId: "document-missing-report",
          });
        } else {
          expect(field.media?.selectedAssetId).toBeUndefined();
        }
      } else {
        if (valueFacet === "selected") {
          expect(field.media).toMatchObject({
            previewHref: expect.stringMatching(/^https:\/\/picsum\.photos\//),
            selectedAssetId: "media-homepage-hero",
          });
        } else if (valueFacet === "missing") {
          expect(field.media).toMatchObject({
            missingSelectedAsset: {
              assetId: "media-missing-hero",
              reason: "Media asset is unavailable.",
            },
            selectedAssetId: "media-missing-hero",
          });
          expect(field.media?.previewHref).toBeUndefined();
        } else {
          expect(field.media?.selectedAssetId).toBeUndefined();
        }
      }

      if (field.mode === "editor") {
        expect(field.media).toMatchObject({
          fileSelectEnabled: true,
          uploadEnabled: true,
          uploadPatchFields: {
            mediaAssetFieldName:
              variant.facets.format === "document" ? "reportAssetId" : "heroMediaId",
          },
        });
      } else {
        expect(field.media).not.toHaveProperty("fileSelectEnabled");
        expect(field.media).not.toHaveProperty("uploadEnabled");
      }

      expect(() => renderToStaticMarkup(<FieldRenderer field={field} />)).not.toThrow();
    }
  });

  it("routes canonical asset selection and file selection for every authoring surface", () => {
    for (const expected of supportedMediaSurfaces) {
      const field = requiredSelectedEditor(expected.groupId, "image");
      const intents: FieldIntent[] = [];
      const element = MediaFieldEditor({
        field,
        inputId: `media-${expected.surface}`,
        onIntent: (intent) => {
          intents.push(intent);
        },
      }) as ReactElement<MediaInputProps, typeof MediaInput>;
      const file = new File(["media"], `${expected.surface}.webp`, { type: "image/webp" });

      expect(element.type).toBe(MediaInput);
      expect(element.props).toMatchObject({
        accept: "image/jpeg,image/png,image/webp,image/gif",
        label: "Hero Media",
        maxSize: 5 * 1024 * 1024,
        previewUrl: expect.stringMatching(/^https:\/\/picsum\.photos\//),
        value: "media-homepage-hero",
      });

      element.props.onSelectOption?.("media-library-02");
      element.props.onUploadFile?.(file);

      expect(intents).toEqual([
        expected.surface === "create"
          ? {
              fieldName: "heroMediaId",
              fieldValue: { kind: "input", value: "media-library-02" },
              type: "createDraftChange",
            }
          : {
              assetId: "media-library-02",
              fieldName: "heroMediaId",
              type: "mediaAssetSelect",
            },
        { fieldName: "heroMediaId", file, type: "mediaFileSelect" },
      ]);
    }
  });

  it("renders file-oriented document controls and routes flat asset-id, upload, and remove intents", () => {
    for (const expected of supportedMediaSurfaces) {
      const field = requiredSelectedEditor(expected.groupId, "document");
      const intents: FieldIntent[] = [];
      const element = MediaFieldEditor({
        field,
        inputId: `document-${expected.surface}`,
        onIntent: (intent) => {
          intents.push(intent);
        },
      }) as ReactElement<DocumentMediaInputProps, typeof DocumentMediaInput>;
      const file = new File(["%PDF-1.7"], `${expected.surface}.pdf`, {
        type: "application/pdf",
      });

      expect(element.type).toBe(DocumentMediaInput);
      expect(element.props).toMatchObject({
        accept: "application/pdf",
        document: {
          byteSize: 42_000,
          contentType: "application/pdf",
          filename: "Quarterly report.pdf",
        },
        label: "Report",
        maxSize: 4 * 1024 * 1024,
        removalEnabled: true,
        selectedValue: "document-quarterly-report",
      });
      expect(element.props.options).toEqual([
        {
          byteSize: 42_000,
          contentType: "application/pdf",
          filename: "Quarterly report.pdf",
          label: "Quarterly report.pdf",
          value: "document-quarterly-report",
        },
        {
          byteSize: 720_000,
          contentType: "application/pdf",
          filename: "Report draft.pdf",
          label: "Report draft.pdf",
          value: "document-report-draft",
        },
      ]);

      element.props.onSelectOption?.("document-report-draft");
      element.props.onUploadFile?.(file);
      element.props.onRemove?.();

      expect(intents).toEqual([
        expected.surface === "create"
          ? {
              fieldName: "reportAssetId",
              fieldValue: { kind: "input", value: "document-report-draft" },
              type: "createDraftChange",
            }
          : {
              assetId: "document-report-draft",
              fieldName: "reportAssetId",
              type: "mediaAssetSelect",
            },
        { fieldName: "reportAssetId", file, type: "mediaFileSelect" },
        expected.surface === "create"
          ? {
              fieldName: "reportAssetId",
              fieldValue: { kind: "input", value: "" },
              type: "createDraftChange",
            }
          : {
              assetId: "",
              fieldName: "reportAssetId",
              type: "mediaAssetSelect",
            },
      ]);
    }
  });

  it("presents safe document actions, missing state, errors, and replacement without URL authoring", () => {
    const selected = requiredSelectedEditor("media-record", "document");
    const missing = requiredEditorVariant("media-record", {
      format: "document",
      requiredness: "optional",
      runtime: "ready",
      value: "missing",
    });
    const failed = requiredEditorVariant("media-record", {
      format: "document",
      requiredness: "optional",
      runtime: "error",
      value: "selected",
    });
    const uploading = requiredEditorVariant("media-record", {
      format: "document",
      requiredness: "optional",
      runtime: "uploading",
      value: "selected",
    });

    const selectedMarkup = renderToStaticMarkup(<FieldRenderer field={selected} />);
    const missingMarkup = renderToStaticMarkup(<FieldRenderer field={missing} />);
    const failedMarkup = renderToStaticMarkup(<FieldRenderer field={failed} />);
    const uploadingMarkup = renderToStaticMarkup(<FieldRenderer field={uploading} />);

    expect(selectedMarkup).toContain("Quarterly report.pdf");
    expect(selectedMarkup).toContain("application/pdf · 41 KiB");
    expect(selectedMarkup).toContain(
      'href="/api/app-installs/reports/private/media/documents/report-quarterly"',
    );
    expect(selectedMarkup).toContain(
      'href="/api/app-installs/reports/private/media/documents/report-quarterly?download=1"',
    );
    expect(selectedMarkup).toContain('target="_blank"');
    expect(selectedMarkup).toContain('rel="noopener noreferrer"');
    expect(selectedMarkup).toContain("Choose another Report");
    expect(selectedMarkup).toContain("Replace Report");
    expect(selectedMarkup).toContain("Remove Report");
    expect(selectedMarkup).toContain('type="file"');
    expect(selectedMarkup).not.toContain('type="text"');
    expect(selectedMarkup).not.toContain("storageKey");
    expect(selectedMarkup).not.toContain("providerUrl");

    expect(missingMarkup).toContain("Document unavailable");
    expect(missingMarkup).toContain("The selected document is unavailable.");
    expect(failedMarkup).toContain("The PDF could not be uploaded.");
    expect(uploadingMarkup).toContain("Replace Report");
    expect(uploadingMarkup).toContain('aria-busy="true"');
  });
});

function requiredSelectedEditor(groupId: string, format: "document" | "image") {
  const group = mediaScenarioGroups.find((candidate) => candidate.id === groupId);
  const field = group?.variants.find(
    ({ facets, field: candidate }) =>
      candidate.mode === "editor" &&
      facets.format === format &&
      facets.requiredness === "optional" &&
      (facets.runtime === undefined || facets.runtime === "ready") &&
      facets.value === "selected",
  )?.field;

  if (field?.mode !== "editor") {
    throw new Error(`Missing selected ${groupId} media editor fixture.`);
  }

  return field;
}

function requiredEditorVariant(
  groupId: string,
  facets: {
    format: "document" | "image";
    requiredness: "optional" | "required";
    runtime?: "error" | "ready" | "uploading";
    value: "missing" | "selected" | "unset";
  },
) {
  const field = mediaScenarioGroups
    .find((candidate) => candidate.id === groupId)
    ?.variants.find(
      ({ facets: candidate, field }) =>
        field.mode === "editor" &&
        candidate.format === facets.format &&
        candidate.requiredness === facets.requiredness &&
        candidate.runtime === facets.runtime &&
        candidate.value === facets.value,
    )?.field;

  if (field?.mode !== "editor") {
    throw new Error(`Missing ${groupId} media editor fixture.`);
  }

  return field;
}
