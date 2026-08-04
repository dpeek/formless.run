import { siteSchemaSource } from "@dpeek/formless-site-app/schema";
import { parseAppSchema, type TextFieldSchema } from "@dpeek/formless-schema";
import { describe, expect, it } from "vite-plus/test";

import type { CreateFieldConfig, RecordFieldConfig } from "../../client/views.ts";
import { projectGeneratedCreateField, projectGeneratedRecordField } from "./field-projection.ts";

const parsedSiteSchema = parseAppSchema(siteSchemaSource);

const siteMediaOccurrenceConformance = [
  {
    id: "create-operation",
    schemaPath: "views.blockCreate.variants.image.fields.mediaAssetId",
    surface: "create",
  },
  {
    id: "record",
    schemaPath: "views.blockEdit.variants.image.fields.mediaAssetId",
    surface: "record",
  },
  {
    id: "table",
    schemaPath: "tableViews.blockTable.columns.4",
    surface: "table-cell",
  },
  {
    id: "detail",
    schemaPath: "itemViews.blockRootDetail.variants.image.fields.mediaAssetId",
    surface: "detail",
  },
  {
    id: "tree",
    schemaPath: "itemViews.blockTreeNode.variants.image.fields.mediaAssetId",
    surface: "record",
  },
] as const;

describe("generated media presentation conformance", () => {
  it("covers every canonical live Site media editor occurrence", () => {
    expect(collectMediaEditorPaths(siteSchemaSource)).toEqual(
      siteMediaOccurrenceConformance.map(({ schemaPath }) => schemaPath).sort(),
    );
    expect(siteMediaOccurrenceConformance.map(({ id }) => id)).toEqual([
      "create-operation",
      "record",
      "table",
      "detail",
      "tree",
    ]);
  });
  it("projects every occurrence through the canonical media field contract", () => {
    const mediaField = parsedSiteSchema.entities
      .find((definition) => definition.key === "block")
      ?.fields.find((definition) => definition.key === "mediaAssetId")!;
    if (mediaField?.type !== "text") {
      throw new Error("Missing canonical Site block mediaAssetId text field.");
    }

    const createConfig = {
      editor: "media",
      field: mediaField,
      fieldName: "mediaAssetId",
    } satisfies CreateFieldConfig;
    const recordConfig = {
      commit: "field-commit",
      editor: "media",
      field: mediaField,
      fieldName: "mediaAssetId",
    } satisfies RecordFieldConfig;
    const mediaAssetOptions = [
      {
        height: 630,
        href: "/api/formless/media/media/images/hero.webp",
        id: "hero.webp",
        label: "Hero",
        width: 1200,
      },
    ];
    const projectedById = {
      "create-operation": projectGeneratedCreateField({
        fieldConfig: createConfig,
        mediaAssetOptions,
        occurrence: {
          owner: { kind: "createSurface", surfaceId: "site:block-create" },
          placementId: "mediaAssetId",
        },
        value: "hero.webp",
      }),
      record: projectGeneratedRecordField({
        canPatch: true,
        entityName: "block",
        fieldConfig: recordConfig,
        mediaAssetOptions,
        occurrence: {
          owner: { kind: "listItem", listId: "site:block-list", recordId: "block-image" },
          placementId: "mediaAssetId",
        },
        recordId: "block-image",
        recordValue: "hero.webp",
        schema: parsedSiteSchema,
        surface: "record",
      }),
      table: projectGeneratedRecordField({
        canPatch: true,
        density: "compact",
        entityName: "block",
        fieldConfig: recordConfig,
        mediaAssetOptions,
        occurrence: {
          owner: { cellId: "block-image", kind: "tableCell", tableId: "site:block-table" },
          placementId: "mediaAssetId",
        },
        recordId: "block-image",
        recordValue: "hero.webp",
        schema: parsedSiteSchema,
        surface: "table-cell",
      }),
      detail: projectGeneratedRecordField({
        canPatch: true,
        entityName: "block",
        fieldConfig: recordConfig,
        mediaAssetOptions,
        occurrence: {
          owner: {
            kind: "recordResult",
            recordId: "block-image",
            resultId: "site:block-detail",
          },
          placementId: "mediaAssetId",
        },
        recordId: "block-image",
        recordValue: "hero.webp",
        schema: parsedSiteSchema,
        showLabel: true,
        surface: "detail",
      }),
      tree: projectGeneratedRecordField({
        canPatch: true,
        entityName: "block",
        fieldConfig: recordConfig,
        mediaAssetOptions,
        occurrence: {
          owner: {
            kind: "recordResult",
            recordId: "block-image",
            resultId: "site:block-tree:child-fields",
          },
          placementId: "mediaAssetId",
        },
        recordId: "block-image",
        recordValue: "hero.webp",
        schema: parsedSiteSchema,
        showLabel: true,
        surface: "record",
      }),
    };

    const fieldIds = new Set<string>();

    for (const occurrence of siteMediaOccurrenceConformance) {
      const field = projectedById[occurrence.id];

      if (field.mode !== "editor") {
        throw new Error(`Expected ${occurrence.id} media occurrence to be editable.`);
      }

      fieldIds.add(field.fieldId);

      expect(field).toMatchObject({
        control: { controlKind: "media" },
        media: {
          fileSelectEnabled: true,
          previewHref: mediaAssetOptions[0]!.href,
          selectedAssetId: "hero.webp",
          uploadEnabled: true,
        },
        mode: "editor",
        options: { mediaAssetOptions },
        surface: occurrence.surface,
      });
      expect(field.media?.uploadPatchFields).toMatchObject({
        mediaAssetFieldName: "mediaAssetId",
      });

      if (occurrence.id !== "create-operation") {
        expect(field.media?.uploadPatchFields).toMatchObject({
          heightFieldName: "height",
          widthFieldName: "width",
        });
      }
    }

    expect(fieldIds.size).toBe(siteMediaOccurrenceConformance.length);
  });

  it("projects document facts and constraints across create, list, record, table, and tree authoring", () => {
    const documentField: TextFieldSchema = {
      asset: {
        acceptedMimeTypes: ["application/pdf"],
        access: "private",
        kind: "document",
        maxBytes: 4 * 1024 * 1024,
      },
      required: false,
      type: "text",
    };
    const createConfig = {
      editor: "media",
      field: documentField,
      fieldName: "reportAssetId",
    } satisfies CreateFieldConfig;
    const recordConfig = {
      commit: "field-commit",
      editor: "media",
      field: documentField,
      fieldName: "reportAssetId",
    } satisfies RecordFieldConfig;
    const documentOption = {
      access: "private",
      byteSize: 42000,
      contentType: "application/pdf",
      downloadHref: "/api/formless/program/media/documents/report.pdf?download=1",
      filename: "Quarterly report.pdf",
      href: "/api/formless/program/media/documents/report.pdf",
      id: "report.pdf",
      label: "Quarterly report.pdf",
    } as const;
    const projected = [
      projectGeneratedCreateField({
        fieldConfig: createConfig,
        isPending: true,
        mediaAssetOptions: [documentOption],
        occurrence: {
          owner: { kind: "createSurface", surfaceId: "reports:create" },
          placementId: "reportAssetId",
        },
        value: documentOption.id,
      }),
      projectGeneratedRecordField({
        canPatch: true,
        entityName: "report",
        fieldConfig: recordConfig,
        isPending: true,
        mediaAssetOptions: [documentOption],
        occurrence: {
          owner: { kind: "listItem", listId: "reports:list", recordId: "report-1" },
          placementId: "reportAssetId",
        },
        recordId: "report-1",
        recordValue: documentOption.id,
        surface: "record",
      }),
      projectGeneratedRecordField({
        canPatch: true,
        entityName: "report",
        fieldConfig: recordConfig,
        isPending: true,
        mediaAssetOptions: [documentOption],
        occurrence: {
          owner: { kind: "recordResult", recordId: "report-1", resultId: "reports:detail" },
          placementId: "reportAssetId",
        },
        recordId: "report-1",
        recordValue: documentOption.id,
        surface: "detail",
      }),
      projectGeneratedRecordField({
        canPatch: true,
        density: "compact",
        entityName: "report",
        fieldConfig: recordConfig,
        isPending: true,
        mediaAssetOptions: [documentOption],
        occurrence: {
          owner: { cellId: "report-1", kind: "tableCell", tableId: "reports:table" },
          placementId: "reportAssetId",
        },
        recordId: "report-1",
        recordValue: documentOption.id,
        surface: "table-cell",
      }),
      projectGeneratedRecordField({
        canPatch: true,
        entityName: "report",
        fieldConfig: recordConfig,
        isPending: true,
        mediaAssetOptions: [documentOption],
        occurrence: {
          owner: {
            kind: "recordResult",
            recordId: "report-1",
            resultId: "reports:tree:fields",
          },
          placementId: "reportAssetId",
        },
        recordId: "report-1",
        recordValue: documentOption.id,
        surface: "record",
      }),
    ];

    for (const field of projected) {
      expect(field).toMatchObject({
        control: { controlKind: "media" },
        media: {
          accept: "application/pdf",
          document: {
            byteSize: 42000,
            contentType: "application/pdf",
            downloadIntent: {
              href: documentOption.downloadHref,
              type: "mediaDocumentDownload",
            },
            filename: "Quarterly report.pdf",
            openIntent: {
              href: documentOption.href,
              target: "newTab",
              type: "mediaDocumentOpen",
            },
          },
          fileSelectEnabled: true,
          maxSize: 4 * 1024 * 1024,
          removalEnabled: true,
          selectedAssetId: documentOption.id,
          uploadEnabled: true,
          uploadPatchFields: { mediaAssetFieldName: "reportAssetId" },
        },
        options: {
          mediaAssetOptions: [
            {
              byteSize: 42000,
              contentType: "application/pdf",
              downloadHref: documentOption.downloadHref,
              filename: "Quarterly report.pdf",
              href: documentOption.href,
              id: documentOption.id,
              label: "Quarterly report.pdf",
            },
          ],
        },
        pending: { isPending: true },
      });
      expect(field.value).toBe(documentOption.id);
    }
  });
});

function collectMediaEditorPaths(value: unknown, path: readonly string[] = []): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      collectMediaEditorPaths(entry, [...path, arrayEntryPathSegment(entry, path.at(-1), index)]),
    );
  }
  if (typeof value !== "object" || value === null) {
    return [];
  }

  const record = value as Record<string, unknown>;
  const current = record.editor === "media" ? [path.join(".")] : [];

  return [
    ...current,
    ...Object.entries(record).flatMap(([key, entry]) =>
      collectMediaEditorPaths(entry, [...path, key]),
    ),
  ];
}
function arrayEntryPathSegment(entry: unknown, registryName: string | undefined, index: number) {
  if (typeof entry !== "object" || entry === null) {
    return String(index);
  }
  const record = entry as Record<string, unknown>;
  if (
    [
      "entities",
      "itemViews",
      "queries",
      "relationships",
      "screens",
      "tableViews",
      "unions",
      "views",
    ].includes(registryName ?? "") &&
    typeof record.key === "string"
  ) {
    return record.key;
  }
  if (registryName === "variants" && typeof record.variant === "string") {
    return record.variant;
  }
  if (registryName === "fields" && typeof record.field === "string") {
    return record.field;
  }
  return String(index);
}
