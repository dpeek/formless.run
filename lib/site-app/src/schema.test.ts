import {
  standardContactSubscriptionRecordSchemaModule,
  standardInquiryRecordSchemaModule,
} from "@dpeek/formless-standard/schema";
import { composeAppSchema, parseAppSchema } from "@dpeek/formless-schema";
import { describe, expect, it } from "vite-plus/test";
import {
  siteContactIntakePresentationSchemaModule,
  sitePresentationSchemaModule,
  siteRecordSchemaModule,
  siteSchemaSource,
  SITE_PREVIEW_BROWSER_MOUNT_KEY,
  SITE_PREVIEW_WORKER_MOUNT_KEY,
} from "@dpeek/formless-site-app/schema";
import { sitePublicBrowserSurfaceDefinition } from "@dpeek/formless-site-app/runtime/browser";
import {
  sitePublicWorkerReadDefinition,
  sitePublicWorkerSurfaceDefinition,
} from "@dpeek/formless-site-app/runtime/worker";

describe("Site schema authoring", () => {
  it("separates Site content from standard contact-intake presentation", () => {
    expect([
      siteRecordSchemaModule.key,
      sitePresentationSchemaModule.key,
      siteContactIntakePresentationSchemaModule.key,
    ]).toEqual(["site-records", "site-presentation", "site-contact-intake-presentation"]);
    expect(siteRecordSchemaModule.entities?.map(({ id, key }) => ({ id, key }))).toEqual([
      {
        id: "entity_610ac202-b123-46ed-8bd3-5b65383e2233",
        key: "site",
      },
      {
        id: "entity_8aa7cc1a-c9a7-482e-b078-6ef5478794e2",
        key: "block",
      },
      {
        id: "entity_3d195c79-db03-4da4-95c8-433266271b21",
        key: "block-placement",
      },
    ]);
    expect(siteRecordSchemaModule.relationships?.map(({ key }) => key)).toEqual([
      "placementParent",
      "blockPlacements",
      "placementBlock",
      "blockUsedInPlacements",
    ]);
    expect(siteRecordSchemaModule.unions?.map(({ key }) => key)).toEqual(["blockByType"]);
    expect(siteRecordSchemaModule.queries?.map(({ key }) => key)).toEqual([
      "sitePrimary",
      "blockAll",
      "blockPages",
      "blockNavigationRoots",
      "blockSiteRoots",
      "blockPosts",
      "blockProjects",
      "blockLinks",
      "blockGroups",
      "blockImages",
      "placementsForSelectedBlock",
    ]);
    expect(siteRecordSchemaModule).not.toHaveProperty("itemViews");
    expect(siteRecordSchemaModule).not.toHaveProperty("tableViews");
    expect(siteRecordSchemaModule).not.toHaveProperty("views");
    expect(siteRecordSchemaModule).not.toHaveProperty("screens");
    expect(siteRecordSchemaModule.runtimeRequirements).toEqual({
      browser: { surfaces: ["site.public"] },
      worker: {
        publicReads: ["site.public-tree"],
        surfaces: ["site.public"],
        afterCommit: ["site.contact-notification", "site.operation-input-notification"],
      },
    });

    expect(sitePresentationSchemaModule.requires).toEqual([siteRecordSchemaModule.key]);
    expect(sitePresentationSchemaModule.itemViews?.map(({ key }) => key)).toEqual([
      "siteSettingsForm",
      "blockListItem",
      "blockContextItem",
      "blockRootDetail",
      "blockTreeNode",
      "blockPlacementTreeItem",
    ]);
    expect(sitePresentationSchemaModule.tableViews?.map(({ key }) => key)).toEqual([
      "blockTable",
      "blockPlacementTable",
    ]);
    expect(sitePresentationSchemaModule.views?.map(({ key }) => key)).toEqual([
      "siteSettingsHome",
      "blockHome",
      "siteCompositionHome",
      "pageCompositionHome",
      "navigationCompositionHome",
      "blockCreate",
      "blockPageCreate",
      "blockPostCreate",
      "blockProjectCreate",
      "blockEdit",
      "blockCompositionHome",
      "blockPlacementCreate",
    ]);
    expect(sitePresentationSchemaModule.screens?.map(({ key }) => key)).toEqual([
      "siteSettings",
      "siteEditor",
    ]);

    expect(siteContactIntakePresentationSchemaModule.requires).toEqual([
      standardInquiryRecordSchemaModule.key,
      standardContactSubscriptionRecordSchemaModule.key,
    ]);
    expect(siteContactIntakePresentationSchemaModule.tableViews?.map(({ key }) => key)).toEqual([
      "emailAddressTable",
      "audienceTable",
      "subscriptionTable",
      "contactMessageTable",
    ]);
    expect(
      siteContactIntakePresentationSchemaModule.tableViews?.find(
        ({ key }) => key === "emailAddressTable",
      )?.columns,
    ).toEqual([
      { type: "field", field: "address", width: "lg" },
      { type: "field", field: "normalizedAddress", width: "lg" },
    ]);
    expect(siteContactIntakePresentationSchemaModule.views?.map(({ key }) => key)).toEqual([
      "emailAddressHome",
      "audienceHome",
      "subscriptionHome",
      "contactMessageHome",
    ]);
    expect(siteContactIntakePresentationSchemaModule.screens?.map(({ key }) => key)).toEqual([
      "siteSubscribers",
      "siteContacts",
    ]);
    for (const module of [
      sitePresentationSchemaModule,
      siteContactIntakePresentationSchemaModule,
    ]) {
      expect(module).not.toHaveProperty("entities");
      expect(module).not.toHaveProperty("relationships");
      expect(module).not.toHaveProperty("unions");
      expect(module).not.toHaveProperty("queries");
    }
  });

  it("composes Site content without standard contact intake", () => {
    const contentOnlySource = composeAppSchema({
      version: 1,
      modules: [siteRecordSchemaModule, sitePresentationSchemaModule],
    });
    const contentOnlySchema = parseAppSchema(contentOnlySource);

    expect(contentOnlySchema.entities.map(({ key }) => key)).toEqual([
      "site",
      "block",
      "block-placement",
    ]);
    expect(contentOnlySchema.screens.map(({ key }) => key)).toEqual(["siteSettings", "siteEditor"]);
    expect(
      contentOnlySchema.entities.some(({ key }) =>
        ["contact", "contact-message", "email-address", "audience", "subscription"].includes(key),
      ),
    ).toBe(false);
  });

  it("exposes a valid named complete schema source", () => {
    const schema = parseAppSchema(siteSchemaSource);

    expect(schema.entities.map(({ key }) => key)).toEqual([
      "contact-message",
      "email-address",
      "audience",
      "subscription",
      "site",
      "block",
      "block-placement",
    ]);
    expect(schema.screens.map(({ key }) => key)).toEqual([
      "siteSettings",
      "siteEditor",
      "siteSubscribers",
      "siteContacts",
    ]);
  });

  it("publishes explicit browser and Worker runtime selections", () => {
    expect([SITE_PREVIEW_BROWSER_MOUNT_KEY, SITE_PREVIEW_WORKER_MOUNT_KEY]).toEqual([
      "site.preview.browser",
      "site.preview.worker",
    ]);
    expect(sitePublicBrowserSurfaceDefinition).toMatchObject({
      key: "site.public",
      kind: "surface",
      target: "browser",
    });
    expect(sitePublicBrowserSurfaceDefinition.surface.Route).toBeTypeOf("function");
    expect(sitePublicWorkerReadDefinition).toMatchObject({
      key: "site.public-tree",
      kind: "public-read",
      target: "worker",
    });
    expect(sitePublicWorkerReadDefinition.read).toBeTypeOf("function");
    expect(sitePublicWorkerSurfaceDefinition).toMatchObject({
      key: "site.public",
      kind: "surface",
      target: "worker",
    });
    expect(sitePublicWorkerSurfaceDefinition.surface).toMatchObject({
      createAdapter: expect.any(Function),
      normalizeRoutePath: expect.any(Function),
      siteIconRouteForPathname: expect.any(Function),
    });
  });
});
