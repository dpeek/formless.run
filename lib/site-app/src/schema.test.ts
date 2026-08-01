import { computeSourceSchemaHash, parseAppSchema } from "@dpeek/formless-schema";
import { describe, expect, it } from "vite-plus/test";
import {
  sitePresentationSchemaModule,
  siteRecordSchemaModule,
  siteSchemaSource,
} from "@dpeek/formless-site-app/schema";
import rawSourceSchema from "@dpeek/formless-site-app/schema.json";
import { sitePublicBrowserSurfaceDefinition } from "@dpeek/formless-site-app/runtime/browser";
import {
  sitePublicWorkerReadDefinition,
  sitePublicWorkerSurfaceDefinition,
} from "@dpeek/formless-site-app/runtime/worker";

describe("Site schema authoring", () => {
  it("composes record declarations before dependent presentation declarations", () => {
    expect([siteRecordSchemaModule.key, sitePresentationSchemaModule.key]).toEqual([
      "site-records",
      "site-presentation",
    ]);
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
      {
        id: "entity_dd5c1285-721a-4294-8114-efd784b6a578",
        key: "contact",
      },
      {
        id: "entity_5a3667a2-a5a7-46ed-b3a4-b6364bae31a0",
        key: "contact-message",
      },
      {
        id: "entity_9863574c-952d-41a9-b90e-b40f6eda5eba",
        key: "email-address",
      },
      {
        id: "entity_8999782d-0e12-4e4b-8830-0e60cb3f1179",
        key: "audience",
      },
      {
        id: "entity_da574ad0-f310-4542-927e-c76dd89402f0",
        key: "subscription",
      },
    ]);
    expect(siteRecordSchemaModule.relationships?.map(({ key }) => key)).toEqual([
      "placementParent",
      "blockPlacements",
      "placementBlock",
      "blockUsedInPlacements",
      "emailAddressContact",
      "contactEmailAddresses",
      "subscriptionEmailAddress",
      "emailAddressSubscriptions",
      "subscriptionAudience",
      "audienceSubscriptions",
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
      "emailAddressAll",
      "audienceAll",
      "subscriptionAll",
      "contactMessageAll",
      "placementsForSelectedBlock",
    ]);
    expect(siteRecordSchemaModule).not.toHaveProperty("itemViews");
    expect(siteRecordSchemaModule).not.toHaveProperty("tableViews");
    expect(siteRecordSchemaModule).not.toHaveProperty("views");
    expect(siteRecordSchemaModule).not.toHaveProperty("screens");
    expect(siteRecordSchemaModule.runtimeRequirements).toEqual({
      shared: { operationAdapters: ["contact-subscription.subscribe"] },
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
      "emailAddressTable",
      "audienceTable",
      "subscriptionTable",
      "contactMessageTable",
    ]);
    expect(sitePresentationSchemaModule.views?.map(({ key }) => key)).toEqual([
      "siteSettingsHome",
      "blockHome",
      "emailAddressHome",
      "audienceHome",
      "subscriptionHome",
      "contactMessageHome",
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
      "siteSubscribers",
      "siteContacts",
    ]);
    expect(sitePresentationSchemaModule).not.toHaveProperty("entities");
    expect(sitePresentationSchemaModule).not.toHaveProperty("relationships");
    expect(sitePresentationSchemaModule).not.toHaveProperty("unions");
    expect(sitePresentationSchemaModule).not.toHaveProperty("queries");
  });

  it("keeps authored, materialized, and parsed schema data aligned", async () => {
    expect(siteSchemaSource).toEqual(rawSourceSchema);
    expect(parseAppSchema(siteSchemaSource)).toEqual(parseAppSchema(rawSourceSchema));
    expect(await computeSourceSchemaHash(siteSchemaSource)).toBe(
      await computeSourceSchemaHash(rawSourceSchema),
    );
  });

  it("publishes explicit browser and Worker runtime selections", () => {
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
