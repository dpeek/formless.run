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
      "siteHome",
      "blockHomeForSites",
      "siteHeader",
      "blockHeaderForSites",
      "siteFooter",
      "blockFooterForSites",
      "blockSite",
      "siteBlocks",
      "placementParent",
      "blockPlacements",
      "placementBlock",
      "blockUsedInPlacements",
    ]);
    expect(siteRecordSchemaModule.unions?.map(({ key }) => key)).toEqual(["blockByType"]);
    expect(siteRecordSchemaModule.queries?.map(({ key }) => key)).toEqual([
      "siteAll",
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
      shared: { recordAdapters: ["site.records"] },
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

  it("declares Site aggregate ownership in fields and operation contracts", () => {
    const schema = parseAppSchema(siteSchemaSource);
    const site = schema.entities.find(({ key }) => key === "site");
    const block = schema.entities.find(({ key }) => key === "block");
    const placement = schema.entities.find(({ key }) => key === "block-placement");
    const siteUpdate = site?.operations?.find(({ key }) => key === "update");
    const blockCreate = block?.operations?.find(({ key }) => key === "create");
    const blockUpdate = block?.operations?.find(({ key }) => key === "update");
    const addTreeChild = placement?.operations?.find(({ key }) => key === "addTreeChild");

    if (!site || !block || !siteUpdate || !blockCreate || !blockUpdate || !addTreeChild) {
      throw new Error("Expected Site aggregate schema declarations.");
    }

    expect(site.fields.filter(({ key }) => ["home", "header", "footer"].includes(key))).toEqual([
      expect.objectContaining({ key: "home", required: false, to: "block", type: "reference" }),
      expect.objectContaining({ key: "header", required: false, to: "block", type: "reference" }),
      expect.objectContaining({ key: "footer", required: false, to: "block", type: "reference" }),
    ]);
    expect(site.fields.find(({ key }) => key === "icon")).toMatchObject({
      format: "icon",
      icon: { valueMode: "iconIdWithSvgFallback" },
    });
    expect(block.fields.find(({ key }) => key === "site")).toMatchObject({
      key: "site",
      required: true,
      to: "site",
      type: "reference",
    });
    expect(block.fields.find(({ key }) => key === "icon")).toMatchObject({
      format: "icon",
      icon: { valueMode: "iconIdWithSvgFallback" },
    });
    expect(siteUpdate.input?.fields.map(({ key }) => key)).toEqual([
      "key",
      "label",
      "description",
      "icon",
      "initialThemeMode",
      "themeSwitchable",
      "home",
      "header",
      "footer",
    ]);
    expect(blockCreate.input?.fields.map(({ key }) => key)).toContain("site");
    expect(blockUpdate.input?.fields.map(({ key }) => key)).not.toContain("site");
    expect(addTreeChild.effect).toEqual({
      type: "operationHandler",
      handler: "create-tree-child",
      config: {
        relationship: "blockPlacements",
        childField: "block",
        orderField: "order",
        inheritFields: ["site"],
      },
    });

    const createViews = sitePresentationSchemaModule.views.filter(({ key }) =>
      ["blockCreate", "blockPageCreate", "blockPostCreate", "blockProjectCreate"].includes(key),
    );
    expect(createViews).toHaveLength(4);
    for (const view of createViews) {
      if (view.type !== "create") {
        throw new Error("Expected block create view.");
      }
      expect(view.fields.map(({ field }) => field)).not.toContain("site");
      expect(view.defaults).toMatchObject({ site: { kind: "context", name: "site" } });
    }
  });

  it("declares the inputless Site starter command", () => {
    const schema = parseAppSchema(siteSchemaSource);
    const operation = schema.entities
      .find(({ key }) => key === "site")
      ?.operations?.find(({ key }) => key === "createStarter");

    if (operation?.effect?.type !== "recordPlan") {
      throw new Error("Expected site.createStarter record plan.");
    }

    expect(operation).toMatchObject({
      key: "createStarter",
      kind: "command",
      scope: "collection",
      output: { type: "command" },
      idempotency: { required: true },
      audit: { input: "summary" },
    });
    expect(operation.input).toBeUndefined();
    expect(operation.access).toBeUndefined();
    expect(operation.effect.steps.find(({ name }) => name === "createSite")).toMatchObject({
      values: { icon: { kind: "literal", value: "formless" } },
    });
  });

  it("declares the default Site product icon in the portable catalog", () => {
    const schema = parseAppSchema(siteSchemaSource);

    expect(schema.icons).toEqual([
      {
        key: "formless",
        label: "Formless",
        group: "Brand",
        source: expect.stringContaining('<svg width="512" height="512"'),
      },
    ]);
  });

  it("declares singleton-scoped Site authoring and its explicit starter empty state", () => {
    const schema = parseAppSchema(siteSchemaSource);
    const settings = schema.views.find(({ key }) => key === "siteSettingsHome");
    const editor = schema.views.find(({ key }) => key === "siteCompositionHome");

    for (const view of [settings, editor]) {
      if (view?.type !== "collection") {
        throw new Error("Expected Site collection view.");
      }
      expect(view.scope).toEqual({
        name: "site",
        entity: "site",
        query: "siteAll",
        selection: "singleton",
      });
      expect(view.operations).toContainEqual({
        operation: "site.createStarter",
        placement: "emptyStatePrimary",
        label: "Create your first site",
      });
      expect(view.operations).not.toContainEqual(
        expect.objectContaining({ operation: "site.createStarter", placement: "toolbar" }),
      );
    }

    const scopedQueries = schema.queries.filter(({ key }) =>
      [
        "blockAll",
        "blockPages",
        "blockPosts",
        "blockProjects",
        "blockNavigationRoots",
        "blockSiteRoots",
      ].includes(key),
    );
    expect(scopedQueries).toHaveLength(6);
    expect(
      scopedQueries.every(({ expression }) => {
        const predicate = expression.kind === "and" ? expression.expressions[0] : expression;
        return (
          predicate?.kind === "where" &&
          predicate.ref.kind === "value" &&
          predicate.ref.name === "site" &&
          typeof predicate.value === "object" &&
          predicate.value.kind === "context" &&
          predicate.value.name === "site"
        );
      }),
    ).toBe(true);
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
