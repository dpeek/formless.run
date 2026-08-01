import {
  composeScenarioAxis,
  projectScenarioGroup,
  scenarioOption,
} from "../field-scenario-model.ts";
import type {
  FieldScenarioGroup,
  FieldScenarioProjectionContext,
} from "../field-scenario-model.ts";
import type { FieldSchema } from "@dpeek/formless-schema";
import type { FieldSurface } from "@dpeek/formless-presentation/contract";
import {
  createField,
  displayField,
  draftInput,
  mediaAssetOptions,
  recordDrafts,
  recordField,
  textControl,
} from "./fixture-helpers.ts";

const mediaPreviewUrl = publicMediaFixtureUrl("01");
const missingMediaId = "media-missing-hero";
const missingDocumentId = "document-missing-report";
const mediaAccept = "image/jpeg,image/png,image/webp,image/gif";
const mediaMaxSize = 5 * 1024 * 1024;
const documentAccept = "application/pdf";
const documentMaxSize = 4 * 1024 * 1024;

const mediaField = {
  type: "text",
  required: true,
  label: "Hero Media",
} satisfies Extract<
  FieldSchema,
  {
    type: "text";
  }
>;
const optionalMediaField = {
  ...mediaField,
  required: false,
} satisfies Extract<
  FieldSchema,
  {
    type: "text";
  }
>;
const documentField = {
  asset: {
    access: "private",
    acceptedMimeTypes: ["application/pdf"],
    kind: "document",
    maxBytes: documentMaxSize,
  },
  label: "Report",
  required: true,
  type: "text",
} satisfies Extract<
  FieldSchema,
  {
    type: "text";
  }
>;
const optionalDocumentField = {
  ...documentField,
  required: false,
} satisfies Extract<
  FieldSchema,
  {
    type: "text";
  }
>;
const mediaOptions = [
  ...Array.from({ length: 20 }, (_, index) => {
    const number = String(index + 1).padStart(2, "0");

    return {
      id: index === 0 ? "media-homepage-hero" : `media-library-${number}`,
      label: `Media fixture ${number}`,
      href: publicMediaFixtureUrl(number),
      width: 240,
      height: 180,
    };
  }),
  {
    id: missingMediaId,
    label: missingMediaId,
    href: "",
    missing: true,
  },
] as const;
const documentOptions = [
  {
    byteSize: 42000,
    contentType: "application/pdf",
    downloadHref: "/api/formless/program/media/documents/report-quarterly?download=1",
    filename: "Quarterly report.pdf",
    href: "/api/formless/program/media/documents/report-quarterly",
    id: "document-quarterly-report",
    label: "Quarterly report.pdf",
  },
  {
    byteSize: 720000,
    contentType: "application/pdf",
    downloadHref: "/api/formless/program/media/documents/report-draft?download=1",
    filename: "Report draft.pdf",
    href: "/api/formless/program/media/documents/report-draft",
    id: "document-report-draft",
    label: "Report draft.pdf",
  },
] as const;

function publicMediaFixtureUrl(seed: string) {
  return `https://picsum.photos/seed/formless-media-${seed}/240/180`;
}

const requirednessAxis = composeScenarioAxis("requiredness", "Requiredness", [
  scenarioOption("required", "Required"),
  scenarioOption("optional", "Optional"),
]);
const mediaFormatAxis = composeScenarioAxis("format", "Asset", [
  scenarioOption("image", "Image"),
  scenarioOption("document", "Document"),
]);
const mediaCreateValueAxis = composeScenarioAxis("value", "Value", [
  scenarioOption("selected", "Selected Asset"),
  scenarioOption("unset", "Unset"),
]);
const mediaValueAxis = composeScenarioAxis("value", "Value", [
  scenarioOption("selected", "Selected Asset"),
  scenarioOption("missing", "Missing Asset"),
  scenarioOption("unset", "Unset"),
]);
const modeAxis = composeScenarioAxis("mode", "Mode", [
  scenarioOption("editor", "Editor"),
  scenarioOption("display", "Display"),
]);
const runtimeAxis = composeScenarioAxis("runtime", "Runtime", [
  scenarioOption("ready", "Ready"),
  scenarioOption("uploading", "Uploading"),
  scenarioOption("error", "Error"),
]);

export const mediaScenarioGroups = [
  createMediaGroup(),
  projectScenarioGroup({
    id: "media-record",
    kind: "media",
    axes: [mediaFormatAxis, modeAxis, requirednessAxis, mediaValueAxis, runtimeAxis],
    include: mediaRecordCombinationIsValid,
    projectField: (context) => projectExistingMediaField("record", context),
  }),
  existingMediaGroup("table-cell"),
  existingMediaGroup("detail"),
] satisfies readonly FieldScenarioGroup[];

function createMediaGroup() {
  return projectScenarioGroup({
    id: "media-create",
    kind: "media",
    axes: [mediaFormatAxis, requirednessAxis, mediaCreateValueAxis, runtimeAxis],
    include: ({ facets }) => facets.runtime === "ready" || facets.value === "selected",
    projectField: projectCreateMediaField,
  });
}

function existingMediaGroup(surface: Extract<FieldSurface, "detail" | "table-cell">) {
  return projectScenarioGroup({
    id: `media-${surface}`,
    kind: "media",
    axes: [mediaFormatAxis, modeAxis, requirednessAxis, mediaValueAxis],
    projectField: (context) => projectExistingMediaField(surface, context),
  });
}

function mediaRecordCombinationIsValid({ facets }: FieldScenarioProjectionContext) {
  return facets.runtime === "ready" || (facets.mode === "editor" && facets.value === "selected");
}

function projectCreateMediaField({ facets }: FieldScenarioProjectionContext) {
  const required = facets.requiredness === "required";
  const document = facets.format === "document";
  const field = document
    ? required
      ? documentField
      : optionalDocumentField
    : required
      ? mediaField
      : optionalMediaField;
  const value =
    facets.value === "selected"
      ? document
        ? "document-quarterly-report"
        : "media-homepage-hero"
      : "";
  const documentOption = documentOptions.find((option) => option.id === value);

  return createField({
    fieldName: document ? "reportAssetId" : "heroMediaId",
    field,
    editor: "media",
    control: textControl(field, {
      editor: "media",
      controlKind: "media",
    }),
    draftInput: draftInput(value),
    labelVisibility: "visible",
    media: {
      accept: document ? documentAccept : mediaAccept,
      ...(documentOption === undefined ? {} : { document: documentPresentation(documentOption) }),
      fileSelectEnabled: true,
      maxSize: document ? documentMaxSize : mediaMaxSize,
      previewHref: !document && value ? mediaPreviewUrl : undefined,
      removalEnabled: !required,
      selectedAssetId: value || undefined,
      uploadEnabled: true,
      uploadPatchFields: { mediaAssetFieldName: document ? "reportAssetId" : "heroMediaId" },
    },
    options: {
      mediaAssetOptions: mediaAssetOptions(document ? documentOptions : mediaOptions),
    },
    occurrence: {
      ownerId: `media-create-${facets.requiredness}-${facets.value}`,
      placementId: document ? "reportAssetId" : "heroMediaId",
    },
    errors:
      facets.runtime === "error"
        ? [
            {
              fieldName: document ? "reportAssetId" : "heroMediaId",
              message: document
                ? "The PDF could not be uploaded."
                : "The image could not be uploaded.",
            },
          ]
        : undefined,
    pending: facets.runtime === "uploading" ? { isPending: true, label: "Uploading" } : undefined,
    recordId: `media-create-${facets.requiredness}-${facets.value}`,
    value: value || undefined,
  });
}

function projectExistingMediaField(
  surface: Extract<FieldSurface, "detail" | "record" | "table-cell">,
  { facets }: FieldScenarioProjectionContext,
) {
  const required = facets.requiredness === "required";
  const document = facets.format === "document";
  const field = document
    ? required
      ? documentField
      : optionalDocumentField
    : required
      ? mediaField
      : optionalMediaField;
  const value =
    facets.value === "selected"
      ? document
        ? "document-quarterly-report"
        : "media-homepage-hero"
      : facets.value === "missing"
        ? document
          ? missingDocumentId
          : missingMediaId
        : "";
  const previewHref = !document && facets.value === "selected" ? mediaPreviewUrl : undefined;
  const documentOption = documentOptions.find((option) => option.id === value);
  const common = {
    fieldName: document ? "reportAssetId" : "heroMediaId",
    field,
    editor: "media" as const,
    labelVisibility: surface === "detail" ? ("visible" as const) : ("hidden" as const),
    occurrence: {
      ownerId: `media-${surface}-${facets.mode}-${facets.requiredness}-${facets.value}-${facets.runtime ?? "ready"}`,
      placementId: document ? "reportAssetId" : "heroMediaId",
    },
    recordId: `media-${surface}-${facets.mode}-${facets.requiredness}-${facets.value}-${facets.runtime ?? "ready"}`,
    surface,
  };

  return facets.mode === "display"
    ? displayField({
        ...common,
        control: textControl(field, { editor: "media", controlKind: "media" }),
        density: surface === "table-cell" ? "compact" : "default",
        formatting: { displayValue: value },
        media: {
          ...(documentOption === undefined
            ? {}
            : { document: documentPresentation(documentOption) }),
          ...(facets.value === "missing"
            ? {
                missingSelectedAsset: {
                  assetId: document ? missingDocumentId : missingMediaId,
                  reason: document
                    ? "The selected document is unavailable."
                    : "Media asset is unavailable.",
                },
              }
            : {}),
          previewHref,
          selectedAssetId: value || undefined,
        },
        options: {
          mediaAssetOptions: mediaAssetOptions(document ? documentOptions : mediaOptions),
        },
        value: value || undefined,
      })
    : recordField({
        ...common,
        control: textControl(field, { editor: "media", controlKind: "media" }),
        commit: "field-commit",
        density: surface === "table-cell" ? "compact" : "default",
        drafts: recordDrafts({ recordValue: value || undefined }),
        formatting: { displayValue: value },
        media: {
          accept: document ? documentAccept : mediaAccept,
          ...(documentOption === undefined
            ? {}
            : { document: documentPresentation(documentOption) }),
          fileSelectEnabled: true,
          maxSize: document ? documentMaxSize : mediaMaxSize,
          mediaPreviewHref: previewHref,
          ...(facets.value === "missing"
            ? {
                missingSelectedAsset: {
                  assetId: document ? missingDocumentId : missingMediaId,
                  reason: document
                    ? "The selected document is unavailable."
                    : "Media asset is unavailable.",
                },
              }
            : {}),
          previewHref,
          removalEnabled: !required,
          selectedAssetId: value || undefined,
          uploadEnabled: true,
          uploadPatchFields: {
            mediaAssetFieldName: document ? "reportAssetId" : "heroMediaId",
          },
        },
        options: {
          mediaAssetOptions: mediaAssetOptions(document ? documentOptions : mediaOptions),
        },
        errors:
          facets.runtime === "error"
            ? [
                {
                  fieldName: document ? "reportAssetId" : "heroMediaId",
                  message: document
                    ? "The PDF could not be uploaded."
                    : "The image could not be uploaded.",
                },
              ]
            : undefined,
        pending:
          facets.runtime === "uploading" ? { isPending: true, label: "Uploading" } : undefined,
        rendererKind: "media",
      });
}

function documentPresentation(option: (typeof documentOptions)[number]) {
  return {
    byteSize: option.byteSize,
    contentType: option.contentType,
    downloadIntent: {
      href: option.downloadHref,
      type: "mediaDocumentDownload" as const,
    },
    filename: option.filename,
    openIntent: {
      href: option.href,
      target: "newTab" as const,
      type: "mediaDocumentOpen" as const,
    },
  };
}
