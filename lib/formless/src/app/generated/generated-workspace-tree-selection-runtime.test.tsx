// @vitest-environment jsdom

import { act, render, type RenderResult } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { TreeItemContract, TreeResultContract } from "@dpeek/formless-presentation/contract";
import type { AppSchema } from "@dpeek/formless-schema";
import type { StoredRecord } from "@dpeek/formless-storage";
import type { ChangeRow } from "../../shared/protocol.ts";
import type { OperationInvocationResponse } from "../../shared/operation-invocation.ts";
import {
  applyBootstrapResponse,
  applyRecordMerge,
  getClientStoreSnapshot,
  resetClientStore,
} from "../../client/store.ts";
import { selectScreenModels } from "../../client/views.ts";
import { bootstrapResponse } from "../../test/protocol-builders.ts";
import { siteSourceSchema } from "../../test/schema-apps.ts";
import { testSiteSeedRecords } from "../../test/site-records.ts";
import { projectGeneratedWorkspaceTreeIntent } from "./workspace-projection.ts";
import {
  useGeneratedWorkspaceRuntimeController,
  type GeneratedWorkspaceRuntimeController,
} from "./generated-workspace-runtime.tsx";
import { SchemaAppProvider } from "./schema-app-context.tsx";
import { installedAppStorageIdentity } from "../../shared/app-storage-identity.ts";

const submitOperationMock = vi.hoisted(() => vi.fn());
const listAppDocumentMediaAssetsMock = vi.hoisted(() => vi.fn());
const listCoreImageMediaAssetsMock = vi.hoisted(() => vi.fn());
const uploadAppDocumentMediaFileMock = vi.hoisted(() => vi.fn());
const uploadCoreImageMediaFileMock = vi.hoisted(() => vi.fn());

vi.mock("../../client/sync.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../client/sync.ts")>()),
  submitOperation: submitOperationMock,
}));

vi.mock("@dpeek/formless-media/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@dpeek/formless-media/client")>()),
  listAppDocumentMediaAssets: listAppDocumentMediaAssetsMock,
  listCoreImageMediaAssets: listCoreImageMediaAssetsMock,
  uploadAppDocumentMediaFile: uploadAppDocumentMediaFileMock,
  uploadCoreImageMediaFile: uploadCoreImageMediaFileMock,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  resetClientStore();
  submitOperationMock.mockReset();
  listAppDocumentMediaAssetsMock.mockReset();
  listAppDocumentMediaAssetsMock.mockResolvedValue([]);
  listCoreImageMediaAssetsMock.mockReset();
  listCoreImageMediaAssetsMock.mockResolvedValue([]);
  uploadAppDocumentMediaFileMock.mockReset();
  uploadCoreImageMediaFileMock.mockReset();
});

describe("generated workspace tree selection runtime", () => {
  it("owns selection across intents, refresh, creation, removal, and stale identities", async () => {
    applyBootstrapResponse(bootstrapResponse(siteSourceSchema, testSiteSeedRecords), "site");
    const screen = required(
      selectScreenModels(siteSourceSchema).find(
        (candidate) => candidate.screenName === "siteEditor",
      ),
    );
    const onSelectContext = vi.fn();
    const onSelectQuery = vi.fn();
    let controller: GeneratedWorkspaceRuntimeController | undefined;
    let renderer: RenderResult | undefined;

    function RuntimeProbe() {
      controller = useGeneratedWorkspaceRuntimeController({
        getSectionSelection: () => ({ selectedContextRecordId: "rec_site_content_home" }),
        onSelectContext,
        onSelectQuery,
        screen,
        today: "2026-07-19",
      });
      return null;
    }

    await act(async () => {
      renderer = render(
        <SchemaAppProvider schemaKey="site">
          <RuntimeProbe />
        </SchemaAppProvider>,
      );
    });

    const initialTree = currentTree(required(controller));
    const initialSelected = required(selectedTreeItem(initialTree.items));
    const second = required(initialTree.items[1]);
    expect(initialTree.selectedEditor?.placementId).toBe(initialSelected.placementId);

    const storeBeforeSelection = getClientStoreSnapshot();
    await act(async () => {
      await required(controller).dispatch(
        projectGeneratedWorkspaceTreeIntent(
          currentScope(required(controller)),
          initialTree.id,
          second.selectionIntent,
        ),
      );
    });
    expect(selectedTreeItem(currentTree(required(controller)).items)?.placementId).toBe(
      second.placementId,
    );
    expect(getClientStoreSnapshot()).toBe(storeBeforeSelection);
    expect(onSelectContext).not.toHaveBeenCalled();
    expect(onSelectQuery).not.toHaveBeenCalled();

    const selectedChild = required(
      getClientStoreSnapshot().recordsById[required(second.childRecordId)],
    );
    await act(async () => {
      applyRecordMerge(
        [
          {
            ...selectedChild,
            updatedAt: "2026-07-19T01:00:00.000Z",
            values: { ...selectedChild.values, label: "Refreshed selected block" },
          },
        ],
        undefined,
        "site",
      );
    });
    expect(currentTree(required(controller)).selectedEditor).toMatchObject({
      accessibilityLabel: "Edit Refreshed selected block",
      placementId: second.placementId,
    });

    const createdBlock = block("block-created", "Created block");
    const createdPlacement = placement("placement-created", createdBlock.id);
    await act(async () => {
      applyRecordMerge([createdBlock, createdPlacement], undefined, "site");
    });
    const createdItem = required(
      flattenTreeItems(currentTree(required(controller)).items).find(
        (item) => item.placementId === createdPlacement.id,
      ),
    );
    await act(async () => {
      await required(controller).dispatch(
        projectGeneratedWorkspaceTreeIntent(
          currentScope(required(controller)),
          currentTree(required(controller)).id,
          createdItem.selectionIntent,
        ),
      );
    });
    expect(currentTree(required(controller)).selectedEditor?.placementId).toBe(createdPlacement.id);

    const selectedBeforeRejectedIntents = currentTree(required(controller)).selectedEditor;
    const createdIntent = projectGeneratedWorkspaceTreeIntent(
      currentScope(required(controller)),
      currentTree(required(controller)).id,
      createdItem.selectionIntent,
    );
    await act(async () => {
      await required(controller).dispatch({
        ...createdIntent,
        intent: { ...createdItem.selectionIntent, itemId: `${createdItem.id}:stale` },
      });
      await required(controller).dispatch({
        ...createdIntent,
        intent: { ...createdItem.selectionIntent, resultId: `${createdIntent.resultId}:other` },
      });
    });
    expect(currentTree(required(controller)).selectedEditor).toEqual(selectedBeforeRejectedIntents);

    await act(async () => {
      applyRecordMerge(
        [
          {
            ...createdPlacement,
            deletedAt: "2026-07-19T02:00:00.000Z",
            updatedAt: "2026-07-19T02:00:00.000Z",
          },
        ],
        undefined,
        "site",
      );
    });
    const fallbackTree = currentTree(required(controller));
    expect(fallbackTree.selectedEditor?.placementId).toBe(initialSelected.placementId);
    expect(selectedTreeItem(fallbackTree.items)?.placementId).toBe(initialSelected.placementId);
    expect(onSelectContext).not.toHaveBeenCalled();

    await act(async () => {
      required(renderer).unmount();
    });
  });

  it("owns controlled disclosure through exact tree intents", async () => {
    applyBootstrapResponse(bootstrapResponse(siteSourceSchema, testSiteSeedRecords), "site");
    const branch = typedBlock("block-disclosure-branch", "group", "Disclosure branch");
    const child = typedBlock("block-disclosure-child", "markdown", "Disclosure child", {
      body: "Nested disclosure coverage.",
    });
    const branchPlacement = placement("placement-disclosure-branch", branch.id);
    const childPlacement = placementForParent("placement-disclosure-child", branch.id, child.id);
    applyRecordMerge([branch, child, branchPlacement, childPlacement], undefined, "site");
    const screen = required(
      selectScreenModels(siteSourceSchema).find(
        (candidate) => candidate.screenName === "siteEditor",
      ),
    );
    let controller: GeneratedWorkspaceRuntimeController | undefined;
    let renderer: RenderResult | undefined;

    function RuntimeProbe() {
      controller = useGeneratedWorkspaceRuntimeController({
        getSectionSelection: () => ({ selectedContextRecordId: "rec_site_content_home" }),
        onSelectContext: () => {},
        onSelectQuery: () => {},
        screen,
        today: "2026-07-19",
      });
      return null;
    }

    await act(async () => {
      renderer = render(
        <SchemaAppProvider schemaKey="site">
          <RuntimeProbe />
        </SchemaAppProvider>,
      );
    });

    const initialBranch = required(
      flattenTreeItems(currentTree(required(controller)).items).find(
        (item) => item.placementId === branchPlacement.id,
      ),
    );
    expect(initialBranch.disclosure).toMatchObject({
      accessibilityLabel: "Collapse Disclosure branch",
      intent: { open: false, type: "treeDisclosureOpenChange" },
      open: true,
    });

    await dispatchTreeIntent(required(controller), required(initialBranch.disclosure).intent);
    let currentBranch = required(
      flattenTreeItems(currentTree(required(controller)).items).find(
        (item) => item.placementId === branchPlacement.id,
      ),
    );
    expect(currentBranch.disclosure).toMatchObject({
      accessibilityLabel: "Expand Disclosure branch",
      intent: { open: true },
      open: false,
    });

    await dispatchTreeIntent(required(controller), {
      ...required(currentBranch.disclosure).intent,
      itemId: `${currentBranch.id}:stale`,
    });
    currentBranch = required(
      flattenTreeItems(currentTree(required(controller)).items).find(
        (item) => item.placementId === branchPlacement.id,
      ),
    );
    expect(currentBranch.disclosure?.open).toBe(false);

    await dispatchTreeIntent(required(controller), required(currentBranch.disclosure).intent);
    currentBranch = required(
      flattenTreeItems(currentTree(required(controller)).items).find(
        (item) => item.placementId === branchPlacement.id,
      ),
    );
    expect(currentBranch.disclosure).toMatchObject({ intent: { open: false }, open: true });

    await act(async () => {
      required(renderer).unmount();
    });
  });

  it("routes item context navigation and child field failures by exact identity", async () => {
    applyBootstrapResponse(bootstrapResponse(siteSourceSchema, testSiteSeedRecords), "site");
    applyRecordMerge(
      [placement("placement-header-context", "rec_site_content_group_header")],
      undefined,
      "site",
    );
    const screen = required(
      selectScreenModels(siteSourceSchema).find(
        (candidate) => candidate.screenName === "siteEditor",
      ),
    );
    const onSelectContext = vi.fn();
    submitOperationMock.mockRejectedValueOnce(new Error("Commit refused."));
    let controller: GeneratedWorkspaceRuntimeController | undefined;
    let renderer: RenderResult | undefined;

    function RuntimeProbe() {
      controller = useGeneratedWorkspaceRuntimeController({
        getSectionSelection: () => ({ selectedContextRecordId: "rec_site_content_home" }),
        onSelectContext,
        onSelectQuery: () => {},
        screen,
        today: "2026-07-19",
      });
      return null;
    }

    await act(async () => {
      renderer = render(
        <SchemaAppProvider schemaKey="site">
          <RuntimeProbe />
        </SchemaAppProvider>,
      );
    });

    const headerItem = required(
      flattenTreeItems(currentTree(required(controller)).items).find(
        (item) => item.childRecordId === "rec_site_content_group_header",
      ),
    );
    const contextAction = required(headerItem.contextActions[0]);
    expect(contextAction.availability).toEqual({ available: true });
    await act(async () => {
      await required(controller).dispatch(
        projectGeneratedWorkspaceTreeIntent(
          currentScope(required(controller)),
          currentTree(required(controller)).id,
          contextAction.intent,
        ),
      );
    });
    expect(onSelectContext).toHaveBeenCalledWith(
      expect.objectContaining({ id: "site" }),
      "rec_site_content_group_header",
    );

    const heroItem = required(
      flattenTreeItems(currentTree(required(controller)).items).find(
        (item) => item.childRecordId === "rec_site_block_home_hero",
      ),
    );
    await act(async () => {
      await required(controller).dispatch(
        projectGeneratedWorkspaceTreeIntent(
          currentScope(required(controller)),
          currentTree(required(controller)).id,
          heroItem.selectionIntent,
        ),
      );
    });
    const selectedTree = currentTree(required(controller));
    const editor = required(selectedTree.selectedEditor);
    const label = required(editor.childFields?.fields.find((field) => field.fieldName === "label"));
    const fieldIntent = {
      fieldId: label.fieldId,
      intent: { fieldName: "label", type: "recordValueCommit" as const, value: "Next hero" },
      resultId: selectedTree.id,
      target: {
        fieldSetId: required(editor.childFields).id,
        itemId: editor.itemId,
        kind: "child" as const,
      },
      type: "treeField" as const,
    };

    await act(async () => {
      await required(controller).dispatch(
        projectGeneratedWorkspaceTreeIntent(currentScope(required(controller)), selectedTree.id, {
          ...fieldIntent,
          target: { ...fieldIntent.target, kind: "placement" },
        }),
      );
    });
    expect(submitOperationMock).not.toHaveBeenCalled();

    await act(async () => {
      await required(controller).dispatch(
        projectGeneratedWorkspaceTreeIntent(
          currentScope(required(controller)),
          selectedTree.id,
          fieldIntent,
        ),
      );
    });
    expect(submitOperationMock).toHaveBeenCalledTimes(1);
    expect(submitOperationMock).toHaveBeenCalledWith(
      "site",
      "block",
      "update",
      expect.objectContaining({ input: { label: "Next hero" } }),
      undefined,
      {},
    );
    expect(
      currentTree(required(controller)).selectedEditor?.childFields?.fields.find(
        (field) => field.fieldName === "label",
      ),
    ).toMatchObject({ errors: [{ message: "Commit refused." }], pending: undefined });

    await act(async () => {
      required(renderer).unmount();
    });
  });

  it("loads and uploads media for selected tree records and tree child creation", async () => {
    applyBootstrapResponse(bootstrapResponse(siteSourceSchema, testSiteSeedRecords), "site");
    const image = typedBlock("block-tree-media", "image", "Tree media", {
      height: 180,
      mediaAssetId: "old.webp",
      width: 320,
    });
    const imagePlacement = placement("placement-tree-media", image.id);
    applyRecordMerge([image, imagePlacement], undefined, "site");
    listCoreImageMediaAssetsMock.mockResolvedValue([
      { href: "/media/existing.webp", id: "existing.webp", label: "Existing" },
    ]);
    const screen = required(
      selectScreenModels(siteSourceSchema).find(
        (candidate) => candidate.screenName === "siteEditor",
      ),
    );
    let controller: GeneratedWorkspaceRuntimeController | undefined;
    let renderer: RenderResult | undefined;

    function RuntimeProbe() {
      controller = useGeneratedWorkspaceRuntimeController({
        getSectionSelection: () => ({ selectedContextRecordId: "rec_site_content_home" }),
        onSelectContext: () => {},
        onSelectQuery: () => {},
        screen,
        today: "2026-07-19",
      });
      return null;
    }

    await act(async () => {
      renderer = render(
        <SchemaAppProvider schemaKey="site">
          <RuntimeProbe />
        </SchemaAppProvider>,
      );
    });

    expect(listCoreImageMediaAssetsMock).toHaveBeenCalledTimes(1);
    const imageItem = required(
      flattenTreeItems(currentTree(required(controller)).items).find(
        (item) => item.placementId === imagePlacement.id,
      ),
    );
    await dispatchTreeIntent(required(controller), imageItem.selectionIntent);
    let tree = currentTree(required(controller));
    let editor = required(tree.selectedEditor);
    let mediaField = required(
      editor.childFields?.fields.find((field) => field.fieldName === "mediaAssetId"),
    );
    expect(mediaField.options?.mediaAssetOptions).toEqual([
      { href: "/media/existing.webp", id: "existing.webp", label: "Existing" },
    ]);

    const recordFile = new File(["record"], "record.webp", { type: "image/webp" });
    uploadCoreImageMediaFileMock.mockResolvedValueOnce({
      assetId: "record.webp",
      contentType: "image/webp",
      dimensions: { height: 630, width: 1200 },
      href: "/media/record.webp",
      key: "media/images/record.webp",
      size: 6,
    });
    await dispatchTreeIntent(required(controller), {
      fieldId: mediaField.fieldId,
      intent: { fieldName: "mediaAssetId", file: recordFile, type: "mediaFileSelect" },
      resultId: tree.id,
      target: {
        fieldSetId: required(editor.childFields).id,
        itemId: editor.itemId,
        kind: "child",
      },
      type: "treeField",
    });

    expect(uploadCoreImageMediaFileMock).toHaveBeenCalledWith(recordFile);
    expect(submitOperationMock).toHaveBeenCalledWith(
      "site",
      "block",
      "update",
      {
        input: { height: 630, mediaAssetId: "record.webp", width: 1200 },
        recordId: image.id,
      },
      undefined,
      { autoSaveSource: "media-reference" },
    );
    tree = currentTree(required(controller));
    editor = required(tree.selectedEditor);
    mediaField = required(
      editor.childFields?.fields.find((field) => field.fieldName === "mediaAssetId"),
    );
    expect(mediaField.options?.mediaAssetOptions).toContainEqual({
      height: 630,
      href: "/media/record.webp",
      id: "record.webp",
      label: "record.webp",
      width: 1200,
    });

    const imageVariant = required(
      tree.rootChildCreation?.variants.find((variant) => variant.label === "Image"),
    );
    await dispatchTreeIntent(required(controller), imageVariant.selectionIntent);
    let createSurface = required(
      currentTree(required(controller)).rootChildCreation?.activeCreateSurface,
    );
    let createMediaField = required(
      createSurface.dialog.form.fieldSet.fields.find((field) => field.fieldName === "mediaAssetId"),
    );
    expect(createMediaField.options?.mediaAssetOptions).toContainEqual({
      href: "/media/existing.webp",
      id: "existing.webp",
      label: "Existing",
    });

    const createFile = new File(["create"], "create.webp", { type: "image/webp" });
    uploadCoreImageMediaFileMock.mockResolvedValueOnce({
      assetId: "create.webp",
      contentType: "image/webp",
      href: "/media/create.webp",
      key: "media/images/create.webp",
      size: 6,
    });
    await dispatchTreeIntent(required(controller), {
      fieldId: createMediaField.fieldId,
      intent: { fieldName: "mediaAssetId", file: createFile, type: "mediaFileSelect" },
      resultId: currentTree(required(controller)).id,
      target: {
        kind: "create",
        parent: imageVariant.selectionIntent.parent,
        surfaceId: createSurface.id,
      },
      type: "treeField",
    });

    expect(uploadCoreImageMediaFileMock).toHaveBeenLastCalledWith(createFile);
    createSurface = required(
      currentTree(required(controller)).rootChildCreation?.activeCreateSurface,
    );
    createMediaField = required(
      createSurface.dialog.form.fieldSet.fields.find((field) => field.fieldName === "mediaAssetId"),
    );
    expect(createMediaField.draftInput).toEqual({ kind: "input", value: "create.webp" });
    expect(createMediaField.options?.mediaAssetOptions).toContainEqual({
      href: "/media/create.webp",
      id: "create.webp",
      label: "create.webp",
    });

    await act(async () => {
      required(renderer).unmount();
    });
  });

  it("loads compatible app documents and replaces a tree record with a new flat asset id", async () => {
    const appTarget = required(
      installedAppStorageIdentity({ installId: "private", packageAppKey: "site" }),
    );
    const documentSchema = siteSchemaWithDocumentMedia();
    applyBootstrapResponse(bootstrapResponse(documentSchema, testSiteSeedRecords), appTarget);
    const image = typedBlock("block-tree-document", "image", "Tree document", {
      mediaAssetId: "old-report.pdf",
    });
    const imagePlacement = placement("placement-tree-document", image.id);
    applyRecordMerge([image, imagePlacement], undefined, appTarget);
    const existingOption = {
      access: "private",
      byteSize: 1200,
      contentType: "application/pdf",
      downloadHref: "/api/app-installs/site/private/media/documents/existing.pdf?download=1",
      filename: "Existing report.pdf",
      href: "/api/app-installs/site/private/media/documents/existing.pdf",
      id: "existing.pdf",
      label: "Existing report.pdf",
    } as const;
    listAppDocumentMediaAssetsMock.mockResolvedValue([existingOption]);
    const screen = required(
      selectScreenModels(documentSchema).find((candidate) => candidate.screenName === "siteEditor"),
    );
    let controller: GeneratedWorkspaceRuntimeController | undefined;
    let renderer: RenderResult | undefined;

    function RuntimeProbe() {
      controller = useGeneratedWorkspaceRuntimeController({
        getSectionSelection: () => ({ selectedContextRecordId: "rec_site_content_home" }),
        onSelectContext: () => {},
        onSelectQuery: () => {},
        screen,
        today: "2026-07-19",
      });
      return null;
    }

    await act(async () => {
      renderer = render(
        <SchemaAppProvider schemaKey="site" target={appTarget}>
          <RuntimeProbe />
        </SchemaAppProvider>,
      );
    });

    const documentTarget = {
      documentsPath: "/api/app-installs/site/private/media/documents",
      field: { entityName: "block", fieldName: "mediaAssetId" },
    };
    expect(listCoreImageMediaAssetsMock).not.toHaveBeenCalled();
    expect(listAppDocumentMediaAssetsMock).toHaveBeenCalledWith(documentTarget);

    const imageItem = required(
      flattenTreeItems(currentTree(required(controller)).items).find(
        (item) => item.placementId === imagePlacement.id,
      ),
    );
    await dispatchTreeIntent(required(controller), imageItem.selectionIntent);
    let tree = currentTree(required(controller));
    let editor = required(tree.selectedEditor);
    let mediaField = required(
      editor.childFields?.fields.find((field) => field.fieldName === "mediaAssetId"),
    );
    expect(mediaField.media).toMatchObject({
      accept: "application/pdf",
      maxSize: 4 * 1024 * 1024,
      removalEnabled: true,
    });
    expect(mediaField.options?.mediaAssetOptions).toContainEqual({
      byteSize: 1200,
      contentType: "application/pdf",
      downloadHref: existingOption.downloadHref,
      filename: "Existing report.pdf",
      href: existingOption.href,
      id: existingOption.id,
      label: existingOption.label,
    });

    const replacementFile = new File(["%PDF-1.7 replacement"], "replacement.pdf", {
      type: "application/pdf",
    });
    const replacementId = "replacement.pdf";
    uploadAppDocumentMediaFileMock.mockResolvedValue({
      asset: {
        access: "private",
        byteSize: replacementFile.size,
        contentType: "application/pdf",
        deliveryHref: `/api/app-installs/site/private/media/documents/${replacementId}`,
        filename: "replacement.pdf",
        id: replacementId,
        kind: "document",
        label: "replacement.pdf",
        ownerAppInstallId: "private",
        provider: "r2",
        status: "ready",
        storageKey: `media/app-installs/private/documents/${replacementId}`,
      },
      assetId: replacementId,
      contentType: "application/pdf",
      href: `/api/app-installs/site/private/media/documents/${replacementId}`,
      key: `media/app-installs/private/documents/${replacementId}`,
      size: replacementFile.size,
    });
    await dispatchTreeIntent(required(controller), {
      fieldId: mediaField.fieldId,
      intent: { fieldName: "mediaAssetId", file: replacementFile, type: "mediaFileSelect" },
      resultId: tree.id,
      target: {
        fieldSetId: required(editor.childFields).id,
        itemId: editor.itemId,
        kind: "child",
      },
      type: "treeField",
    });

    expect(uploadAppDocumentMediaFileMock).toHaveBeenCalledWith(replacementFile, documentTarget);
    expect(submitOperationMock).toHaveBeenCalledWith(
      appTarget,
      "block",
      "update",
      {
        input: { mediaAssetId: replacementId },
        recordId: image.id,
      },
      undefined,
      { autoSaveSource: "media-reference" },
    );
    tree = currentTree(required(controller));
    editor = required(tree.selectedEditor);
    mediaField = required(
      editor.childFields?.fields.find((field) => field.fieldName === "mediaAssetId"),
    );
    expect(mediaField.options?.mediaAssetOptions).toContainEqual({
      byteSize: replacementFile.size,
      contentType: "application/pdf",
      downloadHref: `/api/app-installs/site/private/media/documents/${replacementId}?download=1`,
      filename: "replacement.pdf",
      href: `/api/app-installs/site/private/media/documents/${replacementId}`,
      id: replacementId,
      label: "replacement.pdf",
    });

    await act(async () => {
      required(renderer).unmount();
    });
  });

  it("owns root cancel and nested child create validation, failure, retry, pending, and selection", async () => {
    applyBootstrapResponse(bootstrapResponse(siteSourceSchema, testSiteSeedRecords), "site");
    const feature = typedBlock("block-feature-create", "feature", "Feature create parent");
    const featurePlacement = placement("placement-feature-create", feature.id);
    const leaf = typedBlock("block-leaf-create", "card", "Leaf create target");
    const leafPlacement = placement("placement-leaf-create", leaf.id);
    applyRecordMerge([feature, featurePlacement, leaf, leafPlacement], undefined, "site");
    const screen = required(
      selectScreenModels(siteSourceSchema).find(
        (candidate) => candidate.screenName === "siteEditor",
      ),
    );
    let controller: GeneratedWorkspaceRuntimeController | undefined;
    let renderer: RenderResult | undefined;

    function RuntimeProbe() {
      controller = useGeneratedWorkspaceRuntimeController({
        getSectionSelection: () => ({ selectedContextRecordId: "rec_site_content_home" }),
        onSelectContext: () => {},
        onSelectQuery: () => {},
        screen,
        today: "2026-07-19",
      });
      return null;
    }

    await act(async () => {
      renderer = render(
        <SchemaAppProvider schemaKey="site">
          <RuntimeProbe />
        </SchemaAppProvider>,
      );
    });

    const rootVariant = required(
      currentTree(required(controller)).rootChildCreation?.variants.find(
        (variant) => variant.label === "Markdown",
      ),
    );
    await dispatchTreeIntent(required(controller), rootVariant.selectionIntent);
    const rootSurface = required(
      currentTree(required(controller)).rootChildCreation?.activeCreateSurface,
    );
    expect(rootSurface.dialog.open).toBe(true);
    await dispatchTreeIntent(required(controller), {
      intent: { open: false, surfaceId: rootSurface.id, type: "createOpenChange" },
      parent: rootVariant.selectionIntent.parent,
      resultId: currentTree(required(controller)).id,
      surfaceId: rootSurface.id,
      type: "treeCreate",
    });
    expect(currentTree(required(controller)).rootChildCreation?.activeVariantId).toBeUndefined();

    const leafItem = required(
      flattenTreeItems(currentTree(required(controller)).items).find(
        (item) => item.placementId === leafPlacement.id,
      ),
    );
    await dispatchTreeIntent(required(controller), leafItem.selectionIntent);
    expect(currentTree(required(controller)).selectedEditor?.childCreation).toBeUndefined();

    const featureItem = required(
      flattenTreeItems(currentTree(required(controller)).items).find(
        (item) => item.placementId === featurePlacement.id,
      ),
    );
    await dispatchTreeIntent(required(controller), featureItem.selectionIntent);
    const actionLink = required(
      currentTree(required(controller)).selectedEditor?.childCreation?.variants.find(
        (variant) => variant.label === "Action link",
      ),
    );
    await dispatchTreeIntent(required(controller), actionLink.selectionIntent);
    let surface = required(
      currentTree(required(controller)).selectedEditor?.childCreation?.activeCreateSurface,
    );

    await dispatchTreeIntent(required(controller), {
      intent: { surfaceId: surface.id, type: "createSubmit" },
      parent: actionLink.selectionIntent.parent,
      resultId: currentTree(required(controller)).id,
      surfaceId: surface.id,
      type: "treeCreate",
    });
    expect(submitOperationMock).not.toHaveBeenCalled();
    surface = required(
      currentTree(required(controller)).selectedEditor?.childCreation?.activeCreateSurface,
    );
    expect(
      surface.dialog.form.fieldSet.fields.find((field) => field.fieldName === "label"),
    ).toMatchObject({ errors: [{ message: expect.any(String) }] });

    for (const [fieldName, value] of [
      ["label", "Docs"],
      ["linkTargetMode", "external"],
    ] as const) {
      const field = required(
        surface.dialog.form.fieldSet.fields.find((candidate) => candidate.fieldName === fieldName),
      );
      await dispatchTreeIntent(required(controller), {
        fieldId: field.fieldId,
        intent: {
          fieldName,
          fieldValue: { kind: "input", value },
          type: "createDraftChange",
        },
        resultId: currentTree(required(controller)).id,
        target: {
          kind: "create",
          parent: actionLink.selectionIntent.parent,
          surfaceId: surface.id,
        },
        type: "treeField",
      });
      surface = required(
        currentTree(required(controller)).selectedEditor?.childCreation?.activeCreateSurface,
      );
    }

    submitOperationMock.mockRejectedValueOnce(new Error("Private operation failure."));
    await dispatchTreeIntent(required(controller), {
      intent: { surfaceId: surface.id, type: "createSubmit" },
      parent: actionLink.selectionIntent.parent,
      resultId: currentTree(required(controller)).id,
      surfaceId: surface.id,
      type: "treeCreate",
    });
    surface = required(
      currentTree(required(controller)).selectedEditor?.childCreation?.activeCreateSurface,
    );
    expect(surface.dialog.form.errors).toEqual(["Create failed. Try again."]);
    expect(JSON.stringify(surface)).not.toContain("Private operation failure");

    const createdChild = typedBlock("block-created-link", "link", "Docs", {
      linkTargetMode: "external",
    });
    const createdPlacement = placementForParent(
      "placement-created-link",
      feature.id,
      createdChild.id,
      { slot: "actions" },
    );
    let resolveSubmission: ((response: OperationInvocationResponse) => void) | undefined;
    submitOperationMock.mockImplementationOnce(
      () =>
        new Promise<OperationInvocationResponse>((resolve) => {
          resolveSubmission = resolve;
        }),
    );
    let submission: Promise<void> | void;
    await act(async () => {
      submission = required(controller).dispatch(
        projectGeneratedWorkspaceTreeIntent(
          currentScope(required(controller)),
          currentTree(required(controller)).id,
          {
            intent: { surfaceId: surface.id, type: "createSubmit" },
            parent: actionLink.selectionIntent.parent,
            resultId: currentTree(required(controller)).id,
            surfaceId: surface.id,
            type: "treeCreate",
          },
        ),
      );
      await Promise.resolve();
    });
    expect(
      currentTree(required(controller)).selectedEditor?.childCreation?.activeCreateSurface?.dialog
        .form.submit,
    ).toMatchObject({ disabled: true, pending: { isPending: true } });
    await act(async () => {
      applyRecordMerge([createdChild, createdPlacement], undefined, "site");
      required(resolveSubmission)(commandResponse([createdChild, createdPlacement]));
      await submission;
    });

    expect(submitOperationMock).toHaveBeenCalledTimes(2);
    expect(submitOperationMock).toHaveBeenLastCalledWith(
      "site",
      "block-placement",
      "addTreeChild",
      expect.objectContaining({
        input: {
          childValues: expect.objectContaining({
            label: "Docs",
            linkTargetMode: "external",
            type: "link",
          }),
          parentRecordId: feature.id,
          placementValues: { slot: "actions" },
        },
      }),
      undefined,
      {},
    );
    expect(currentTree(required(controller)).selectedEditor?.placementId).toBe(createdPlacement.id);
    expect(
      currentTree(required(controller)).selectedEditor?.childCreation?.activeCreateSurface,
    ).toBeUndefined();

    await act(async () => {
      required(renderer).unmount();
    });
  });

  it("executes semantic tree moves inside the exact scope with safe retry feedback", async () => {
    applyBootstrapResponse(bootstrapResponse(siteSourceSchema, testSiteSeedRecords), "site");
    const root = typedBlock("ordering-root", "page", "Ordering root");
    const mainFirstChild = block("ordering-main-first-child", "Main first");
    const mainSecondChild = block("ordering-main-second-child", "Main second");
    const sideFirstChild = block("ordering-side-first-child", "Side first");
    const sideSecondChild = block("ordering-side-second-child", "Side second");
    const mainFirst = placementForParent("ordering-main-first", root.id, mainFirstChild.id, {
      order: 1000,
      slot: "main",
    });
    const mainSecond = placementForParent("ordering-main-second", root.id, mainSecondChild.id, {
      order: 2000,
      slot: "main",
    });
    const sideFirst = placementForParent("ordering-side-first", root.id, sideFirstChild.id, {
      order: 1500,
      slot: "side",
    });
    const sideSecond = placementForParent("ordering-side-second", root.id, sideSecondChild.id, {
      order: 2500,
      slot: "side",
    });
    applyRecordMerge(
      [
        root,
        mainFirstChild,
        mainSecondChild,
        sideFirstChild,
        sideSecondChild,
        mainFirst,
        mainSecond,
        sideFirst,
        sideSecond,
      ],
      undefined,
      "site",
    );
    const screen = required(
      selectScreenModels(siteSourceSchema).find(
        (candidate) => candidate.screenName === "siteEditor",
      ),
    );
    let controller: GeneratedWorkspaceRuntimeController | undefined;
    let renderer: RenderResult | undefined;

    function RuntimeProbe() {
      controller = useGeneratedWorkspaceRuntimeController({
        getSectionSelection: () => ({ selectedContextRecordId: root.id }),
        onSelectContext: () => {},
        onSelectQuery: () => {},
        screen,
        today: "2026-07-19",
      });
      return null;
    }

    await act(async () => {
      renderer = render(
        <SchemaAppProvider schemaKey="site">
          <RuntimeProbe />
        </SchemaAppProvider>,
      );
    });

    let tree = currentTree(required(controller));
    let firstItem = required(tree.items.find((item) => item.placementId === mainFirst.id));
    let secondItem = required(tree.items.find((item) => item.placementId === mainSecond.id));
    const boundaryAction = required(
      firstItem.ordering?.actions.find((action) => action.direction === "top"),
    );
    const moveUp = required(
      secondItem.ordering?.actions.find((action) => action.direction === "up"),
    );
    expect(boundaryAction).toMatchObject({ disabled: true, structurallyAvailable: false });

    await dispatchTreeIntent(required(controller), boundaryAction.intent);
    await dispatchTreeIntent(required(controller), {
      ...moveUp.intent,
      actionId: `${moveUp.id}:stale`,
    });
    expect(submitOperationMock).not.toHaveBeenCalled();

    submitOperationMock.mockRejectedValueOnce(new Error("Private move failure."));
    await dispatchTreeIntent(required(controller), moveUp.intent);
    expect(submitOperationMock).toHaveBeenCalledTimes(1);
    expect(submitOperationMock).toHaveBeenLastCalledWith(
      "site",
      "block-placement",
      "update",
      {
        input: { order: 500 },
        recordId: mainSecond.id,
        source: { protocol: "generated-ui", surface: "menuItem" },
      },
      undefined,
      {},
    );
    tree = currentTree(required(controller));
    expect(tree.feedback).toMatchObject([
      {
        detail: "Move failed. Try again.",
        status: "failed",
        title: "Move failed.",
      },
    ]);
    expect(JSON.stringify(tree)).not.toContain("Private move failure");

    const movedPlacement = {
      ...mainSecond,
      updatedAt: "2026-07-19T04:00:00.000Z",
      values: { ...mainSecond.values, order: 500 },
    };
    let resolveMove: ((response: OperationInvocationResponse) => void) | undefined;
    submitOperationMock.mockImplementationOnce(
      () =>
        new Promise<OperationInvocationResponse>((resolve) => {
          resolveMove = resolve;
        }),
    );
    let submission: Promise<void> | void;
    await act(async () => {
      submission = required(controller).dispatch(
        projectGeneratedWorkspaceTreeIntent(
          currentScope(required(controller)),
          currentTree(required(controller)).id,
          moveUp.intent,
        ),
      );
      await Promise.resolve();
    });
    tree = currentTree(required(controller));
    secondItem = required(tree.items.find((item) => item.placementId === mainSecond.id));
    const pendingOrdering = required(secondItem.ordering);
    expect(pendingOrdering.pending).toBe(true);
    expect(
      pendingOrdering.actions.every(
        (action) => action.disabled && action.pending?.isPending === true,
      ),
    ).toBe(true);
    expect(tree.feedback).toMatchObject([{ status: "pending", title: "Moving placement." }]);

    await act(async () => {
      applyRecordMerge([movedPlacement], undefined, "site");
      required(resolveMove)(commandResponse([movedPlacement]));
      await submission;
    });

    tree = currentTree(required(controller));
    expect(
      tree.items.filter((item) => item.slot?.label === "Main").map((item) => item.placementId),
    ).toEqual([mainSecond.id, mainFirst.id]);
    expect(
      tree.items.filter((item) => item.slot?.label === "Side").map((item) => item.placementId),
    ).toEqual([sideFirst.id, sideSecond.id]);
    expect(tree.feedback).toMatchObject([
      { status: "committed", title: "Placement moved and synced." },
    ]);

    await act(async () => {
      required(renderer).unmount();
    });
  });

  it("routes placement removal confirmation, retry, refresh, and fallback by exact identity", async () => {
    applyBootstrapResponse(bootstrapResponse(siteSourceSchema, testSiteSeedRecords), "site");
    const screen = required(
      selectScreenModels(siteSourceSchema).find(
        (candidate) => candidate.screenName === "siteEditor",
      ),
    );
    let controller: GeneratedWorkspaceRuntimeController | undefined;
    let renderer: RenderResult | undefined;

    function RuntimeProbe() {
      controller = useGeneratedWorkspaceRuntimeController({
        getSectionSelection: () => ({ selectedContextRecordId: "rec_site_content_home" }),
        onSelectContext: () => {},
        onSelectQuery: () => {},
        screen,
        today: "2026-07-19",
      });
      return null;
    }

    await act(async () => {
      renderer = render(
        <SchemaAppProvider schemaKey="site">
          <RuntimeProbe />
        </SchemaAppProvider>,
      );
    });

    const initialTree = currentTree(required(controller));
    const fallbackPlacementId = required(initialTree.items[0]).placementId;
    const selectedItem = required(initialTree.items[1]);
    await dispatchTreeIntent(required(controller), selectedItem.selectionIntent);
    let editor = required(currentTree(required(controller)).selectedEditor);
    let removal = required(editor.removePlacement);
    const openIntent = {
      controlId: removal.id,
      intent: removal.trigger.intent,
      itemId: editor.itemId,
      resultId: currentTree(required(controller)).id,
      type: "treeOperation" as const,
    };

    await dispatchTreeIntent(required(controller), openIntent);
    removal = required(currentTree(required(controller)).selectedEditor?.removePlacement);
    expect(removal.confirmation?.open).toBe(true);
    expect(submitOperationMock).not.toHaveBeenCalled();

    await dispatchTreeIntent(required(controller), {
      ...openIntent,
      intent: required(removal.confirmation).cancel.intent,
    });
    expect(
      currentTree(required(controller)).selectedEditor?.removePlacement?.confirmation?.open,
    ).toBe(false);

    removal = required(currentTree(required(controller)).selectedEditor?.removePlacement);
    await dispatchTreeIntent(required(controller), {
      ...openIntent,
      intent: removal.trigger.intent,
    });
    removal = required(currentTree(required(controller)).selectedEditor?.removePlacement);
    await dispatchTreeIntent(required(controller), {
      ...openIntent,
      intent: required(removal.confirmation).action.intent,
      itemId: `${editor.itemId}:stale`,
    });
    expect(submitOperationMock).not.toHaveBeenCalled();

    submitOperationMock.mockRejectedValueOnce(new Error("Private remove failure."));
    await dispatchTreeIntent(required(controller), {
      ...openIntent,
      intent: required(removal.confirmation).action.intent,
    });
    expect(submitOperationMock).toHaveBeenCalledTimes(1);
    removal = required(currentTree(required(controller)).selectedEditor?.removePlacement);
    expect(removal).toMatchObject({
      confirmation: { open: true },
      feedback: {
        detail: "Remove failed. Try again.",
        status: "failed",
        title: "Remove failed.",
      },
      status: { detail: "Remove failed. Try again.", status: "failed" },
    });
    expect(JSON.stringify(removal)).not.toContain("Private remove failure");

    const selectedPlacement = required(getClientStoreSnapshot().recordsById[editor.placementId]);
    const selectedChildId = required(selectedItem.childRecordId);
    const removedPlacement = {
      ...selectedPlacement,
      deletedAt: "2026-07-19T03:00:00.000Z",
      updatedAt: "2026-07-19T03:00:00.000Z",
    };
    let resolveRemoval: ((response: OperationInvocationResponse) => void) | undefined;
    submitOperationMock.mockImplementationOnce(
      () =>
        new Promise<OperationInvocationResponse>((resolve) => {
          resolveRemoval = resolve;
        }),
    );
    let submission: Promise<void> | void;
    await act(async () => {
      submission = required(controller).dispatch(
        projectGeneratedWorkspaceTreeIntent(
          currentScope(required(controller)),
          currentTree(required(controller)).id,
          {
            ...openIntent,
            intent: required(removal.confirmation).action.intent,
          },
        ),
      );
      await Promise.resolve();
    });
    expect(currentTree(required(controller)).selectedEditor?.removePlacement).toMatchObject({
      confirmation: { action: { disabled: true }, open: true },
      status: { status: "pending" },
      trigger: { disabled: true, pending: { isPending: true } },
    });

    await act(async () => {
      applyRecordMerge([removedPlacement], undefined, "site");
      required(resolveRemoval)(commandResponse([removedPlacement]));
      await submission;
    });

    expect(submitOperationMock).toHaveBeenCalledTimes(2);
    expect(submitOperationMock).toHaveBeenLastCalledWith(
      "site",
      "block-placement",
      "removeTreePlacement",
      {
        input: { placementId: selectedPlacement.id },
        source: { protocol: "generated-ui", surface: "confirmationDialog" },
      },
      undefined,
      {},
    );
    expect(currentTree(required(controller)).selectedEditor?.placementId).toBe(fallbackPlacementId);
    expect(
      flattenTreeItems(currentTree(required(controller)).items).some(
        (item) => item.placementId === selectedPlacement.id,
      ),
    ).toBe(false);
    expect(getClientStoreSnapshot().recordsById[selectedChildId]?.deletedAt).toBeUndefined();

    await dispatchTreeIntent(required(controller), {
      ...openIntent,
      intent: required(removal.confirmation).action.intent,
    });
    expect(submitOperationMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      required(renderer).unmount();
    });
  });
});

async function dispatchTreeIntent(
  controller: GeneratedWorkspaceRuntimeController,
  intent: Parameters<typeof projectGeneratedWorkspaceTreeIntent>[2],
) {
  await act(async () => {
    await controller.dispatch(
      projectGeneratedWorkspaceTreeIntent(
        currentScope(controller),
        currentTree(controller).id,
        intent,
      ),
    );
  });
}

function currentTree(controller: GeneratedWorkspaceRuntimeController): TreeResultContract {
  const result = required(controller.workspace?.sections[0]).collection.presentation.result;
  if (result.kind !== "treeResult") {
    throw new Error("Expected a tree result.");
  }
  return result;
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

function selectedTreeItem(items: readonly TreeItemContract[]): TreeItemContract | undefined {
  return flattenTreeItems(items).find((item) => item.selected);
}

function flattenTreeItems(items: readonly TreeItemContract[]): TreeItemContract[] {
  return items.flatMap((item) => [item, ...flattenTreeItems(item.children)]);
}

function siteSchemaWithDocumentMedia(): AppSchema {
  const blockEntity = required(siteSourceSchema.entities.block);
  const mediaField = required(blockEntity.fields.mediaAssetId);
  if (mediaField.type !== "text") {
    throw new Error("Expected Site mediaAssetId to be text-backed.");
  }

  return {
    ...siteSourceSchema,
    entities: {
      ...siteSourceSchema.entities,
      block: {
        ...blockEntity,
        fields: {
          ...blockEntity.fields,
          mediaAssetId: {
            ...mediaField,
            asset: {
              acceptedMimeTypes: ["application/pdf"],
              access: "private",
              kind: "document",
              maxBytes: 4 * 1024 * 1024,
            },
          },
        },
      },
    },
  };
}

function block(id: string, label: string): StoredRecord {
  return typedBlock(id, "markdown", label, { body: "Created in selection coverage." });
}

function typedBlock(
  id: string,
  type: string,
  label: string,
  values: StoredRecord["values"] = {},
): StoredRecord {
  return {
    createdAt: "2026-07-19T00:00:00.000Z",
    entity: "block",
    id,
    updatedAt: "2026-07-19T00:00:00.000Z",
    values: { label, type, ...values },
  };
}

function placement(id: string, childId: string): StoredRecord {
  return placementForParent(id, "rec_site_content_home", childId);
}

function placementForParent(
  id: string,
  parentId: string,
  childId: string,
  values: StoredRecord["values"] = {},
): StoredRecord {
  return {
    createdAt: "2026-07-19T00:00:01.000Z",
    entity: "block-placement",
    id,
    updatedAt: "2026-07-19T00:00:01.000Z",
    values: {
      block: childId,
      order: 4000,
      parent: parentId,
      ...values,
    },
  };
}

function commandResponse(records: readonly StoredRecord[]): OperationInvocationResponse {
  const changes = records.map((record, index) => change(index + 1, record));
  return {
    invocation: {} as OperationInvocationResponse["invocation"],
    output: {
      affectedChangeIds: changes.map(({ writeId }) => writeId),
      changes,
      cursor: changes.length,
      type: "command",
    },
    status: "committed",
  };
}

function change(seq: number, storedRecord: StoredRecord): ChangeRow {
  return {
    createdAt: "2026-07-19T00:00:00.000Z",
    entity: storedRecord.entity,
    operationKind: "create",
    payload: storedRecord,
    recordId: storedRecord.id,
    seq,
    writeId: `write-create-${seq}`,
  };
}

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new Error("Expected fixture value.");
  }
  return value;
}
