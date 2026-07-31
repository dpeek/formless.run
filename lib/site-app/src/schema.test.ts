import { computeSourceSchemaHash, parseAppPackageManifest } from "@dpeek/formless-installed-apps";
import { parseAppSchema } from "@dpeek/formless-schema";
import type { StoredRecord } from "@dpeek/formless-storage";
import { describe, expect, it } from "vite-plus/test";
import {
  reviewableSiteRecords,
  siteEntityIds,
  validateSiteRecords,
} from "@dpeek/formless-site-app";
import rawAppPackageManifest from "@dpeek/formless-site-app/formless.app.json";
import {
  sitePresentationSchemaModule,
  siteRecordSchemaModule,
  siteSchemaSource,
} from "@dpeek/formless-site-app/schema";
import rawSourceSchema from "@dpeek/formless-site-app/schema.json";

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

  it("keeps authored, materialized, parsed, and manifest schema data aligned", async () => {
    const manifest = parseAppPackageManifest(rawAppPackageManifest);

    expect(siteSchemaSource).toEqual(rawSourceSchema);
    expect(parseAppSchema(siteSchemaSource)).toEqual(parseAppSchema(rawSourceSchema));
    expect(manifest.sourceSchema).toEqual({
      kind: "bundled",
      key: "site",
      path: "schema.json",
    });
    expect(await computeSourceSchemaHash(siteSchemaSource)).toBe(manifest.sourceSchemaHash);
  });

  it("owns all Site stable identities and preserves active and tombstoned records", () => {
    const records = siteRecordSchemaModule.entities.map(({ key }, index) => ({
      ...storedRecord(`site-record:${index}`, key, { z: "discarded" }),
      ...(index % 2 === 0 ? {} : { deletedAt: "2026-07-31T01:00:00.000Z" }),
    }));

    expect(siteEntityIds).toEqual(siteRecordSchemaModule.entities.map(({ id }) => id));
    expect(() => validateSiteRecords("Site records", records)).not.toThrow();
    expect(reviewableSiteRecords([...records].reverse())).toEqual(records);
    expect(() =>
      validateSiteRecords("Site records", [storedRecord("site-record:foreign", "app-install", {})]),
    ).toThrow(
      'Site records does not support entity "app-install" for record "site-record:foreign".',
    );
  });
});

function storedRecord(id: string, entity: string, values: StoredRecord["values"]): StoredRecord {
  return {
    id,
    entity,
    values,
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
  };
}
