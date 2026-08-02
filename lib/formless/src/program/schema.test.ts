import { readFile } from "node:fs/promises";
import {
  identityControlPlaneAccessScreenSchemaModule,
  identityControlPlanePresentationSchemaModule,
  identityControlPlaneRecordSchemaModule,
} from "@dpeek/formless-identity-control-plane/schema";
import { crmPresentationSchemaModule, crmRecordSchemaModule } from "@dpeek/formless-crm-app/schema";
import {
  instanceControlPlanePresentationSchemaModule,
  instanceControlPlaneRecordSchemaModule,
  instanceControlPlaneRoutesScreenSchemaModule,
} from "@dpeek/formless-instance-control-plane/schema";
import {
  tasksPresentationSchemaModule,
  tasksRecordSchemaModule,
} from "@dpeek/formless-tasks-app/schema";
import {
  sitePresentationSchemaModule,
  siteRecordSchemaModule,
} from "@dpeek/formless-site-app/schema";
import { parseAppSchema, type AppSchemaSource } from "@dpeek/formless-schema";
import { describe, expect, it } from "vite-plus/test";
import {
  formlessCrmPresentationSchemaModule,
  formlessCrmRecordSchemaModule,
  formlessIdentityControlPlaneAccessScreenSchemaModule,
  formlessIdentityControlPlanePresentationSchemaModule,
  formlessInstanceControlPlanePresentationSchemaModule,
  formlessInstanceControlPlaneRoutesScreenSchemaModule,
  formlessProgramSchemaModules,
  formlessProgramSourceSchema,
  formlessSitePresentationSchemaModule,
  formlessSiteRecordSchemaModule,
  formlessTasksPresentationSchemaModule,
  formlessTasksRecordSchemaModule,
} from "./schema.ts";

describe("Formless Program schema", () => {
  it("specializes control-plane presentation modules", () => {
    expect(formlessProgramSchemaModules.slice(0, 5)).toEqual([
      instanceControlPlaneRecordSchemaModule,
      identityControlPlaneRecordSchemaModule,
      formlessTasksRecordSchemaModule,
      formlessSiteRecordSchemaModule,
      formlessCrmRecordSchemaModule,
    ]);
    expect(formlessInstanceControlPlanePresentationSchemaModule.key).toBe(
      instanceControlPlanePresentationSchemaModule.key,
    );
    expect(formlessIdentityControlPlanePresentationSchemaModule.key).toBe(
      identityControlPlanePresentationSchemaModule.key,
    );
    expect(formlessInstanceControlPlaneRoutesScreenSchemaModule.key).toBe(
      instanceControlPlaneRoutesScreenSchemaModule.key,
    );
    expect(formlessIdentityControlPlaneAccessScreenSchemaModule.key).toBe(
      identityControlPlaneAccessScreenSchemaModule.key,
    );
    expect(
      formlessInstanceControlPlanePresentationSchemaModule.screens.map(({ key }) => key),
    ).toEqual(["deployments", "settings"]);
    expect(
      formlessInstanceControlPlaneRoutesScreenSchemaModule.screens.map(({ access, key, path }) => ({
        access,
        key,
        path,
      })),
    ).toEqual([{ access: { role: "administrator" }, key: "routes", path: "/settings/routes" }]);
    expect(
      formlessIdentityControlPlanePresentationSchemaModule.screens.map(({ key }) => key),
    ).toEqual(["principals", "organizations", "invitations", "policies"]);
    expect(
      formlessIdentityControlPlaneAccessScreenSchemaModule.screens.map(({ access, key, path }) => ({
        access,
        key,
        path,
      })),
    ).toEqual([{ access: { role: "administrator" }, key: "access", path: "/settings/access" }]);
  });

  it("specializes Tasks through same-key Program replacements", () => {
    expect(formlessTasksRecordSchemaModule).toEqual({
      ...tasksRecordSchemaModule,
      entities: tasksRecordSchemaModule.entities.map((entity) => ({
        ...entity,
        operations: entity.operations?.map((operation) => ({
          ...operation,
          access: { role: "editor" },
        })),
      })),
    });
    expect(formlessTasksPresentationSchemaModule).toEqual({
      ...tasksPresentationSchemaModule,
      screens: tasksPresentationSchemaModule.screens.map((screen) => ({
        ...screen,
        path: "/tasks",
        access: { role: "member" },
      })),
    });
    expect(formlessTasksRecordSchemaModule.key).toBe(tasksRecordSchemaModule.key);
    expect(formlessTasksPresentationSchemaModule.key).toBe(tasksPresentationSchemaModule.key);
  });

  it("specializes Site and CRM through same-key Program replacements", () => {
    expect(formlessSitePresentationSchemaModule).toEqual({
      ...sitePresentationSchemaModule,
      screens: sitePresentationSchemaModule.screens.map((screen) => ({
        ...screen,
        path: {
          siteEditor: "/site",
          siteSettings: "/site/settings",
          siteContacts: "/site/contacts",
          siteSubscribers: "/site/subscribers",
        }[screen.key],
        access: { role: "member" },
      })),
    });
    expect(formlessSiteRecordSchemaModule.key).toBe(siteRecordSchemaModule.key);
    expect(formlessSitePresentationSchemaModule.key).toBe(sitePresentationSchemaModule.key);
    expect(formlessCrmRecordSchemaModule.key).toBe(crmRecordSchemaModule.key);
    expect(formlessCrmPresentationSchemaModule.key).toBe(crmPresentationSchemaModule.key);

    const sharedKeys = ["contact", "email-address", "audience", "subscription"] as const;
    const siteEntityIds = new Map(siteRecordSchemaModule.entities.map(({ id, key }) => [key, id]));
    const programSharedEntities = formlessSiteRecordSchemaModule.entities.filter(({ key }) =>
      sharedKeys.includes(key as (typeof sharedKeys)[number]),
    );

    expect(programSharedEntities.map(({ id, key }) => ({ id, key }))).toEqual(
      sharedKeys.map((key) => ({ id: siteEntityIds.get(key), key })),
    );
    expect(
      Object.fromEntries(
        programSharedEntities.map((entity) => [entity.key, entity.fields.map(({ key }) => key)]),
      ),
    ).toEqual({
      contact: ["label", "company", "role", "lifecycle", "source", "notes"],
      "email-address": ["contact", "address", "normalizedAddress", "status", "primary"],
      audience: ["key", "label", "description", "status"],
      subscription: [
        "emailAddress",
        "audience",
        "status",
        "consentedAt",
        "sourceKind",
        "sourceLabel",
        "sourceTargetKind",
        "sourceSchemaKey",
        "sourceApiRoutePrefix",
        "sourceOperationKey",
        "sourceHost",
        "sourcePath",
        "sourceSiteBlockId",
      ],
    });
    expect(
      programSharedEntities
        .find(({ key }) => key === "subscription")
        ?.fields.find(({ key }) => key === "sourceTargetKind"),
    ).toMatchObject({
      type: "enum",
      values: [{ key: "program", label: "Program" }],
    });

    expect(formlessCrmRecordSchemaModule.entities.map(({ id, key }) => ({ id, key }))).toEqual(
      crmRecordSchemaModule.entities
        .filter(({ key }) => !sharedKeys.includes(key as (typeof sharedKeys)[number]))
        .map(({ id, key }) => ({ id, key })),
    );
    expect(
      formlessCrmRecordSchemaModule.relationships.some(({ key }) =>
        formlessSiteRecordSchemaModule.relationships.some(
          (relationship) => relationship.key === key,
        ),
      ),
    ).toBe(false);
    expect(
      formlessCrmRecordSchemaModule.queries.some(({ key }) =>
        formlessSiteRecordSchemaModule.queries.some((query) => query.key === key),
      ),
    ).toBe(false);

    const publicOperations: string[] = [];
    for (const entity of [
      ...formlessSiteRecordSchemaModule.entities,
      ...formlessCrmRecordSchemaModule.entities,
    ]) {
      for (const operation of entity.operations ?? []) {
        const canonicalKey = `${entity.key}.${operation.key}`;
        if ("policy" in operation && operation.policy.actors.includes("anonymous")) {
          publicOperations.push(canonicalKey);
          expect("access" in operation ? operation.access : undefined).toBeUndefined();
        } else {
          expect("access" in operation ? operation.access : undefined, canonicalKey).toEqual({
            role: "editor",
          });
        }
      }
    }
    expect(publicOperations).toEqual(["contact-message.submit", "subscription.subscribe"]);

    expect(formlessCrmPresentationSchemaModule.tableViews.map(({ key }) => key)).toEqual([
      "companyTable",
      "contactTable",
      "crmEmailAddressTable",
      "crmAudienceTable",
      "crmSubscriptionTable",
      "campaignTable",
      "campaignMessageTable",
      "broadcastTable",
      "broadcastRecipientTable",
      "deliveryEventTable",
    ]);
    expect(
      formlessCrmPresentationSchemaModule.screens.map(({ access, key, path }) => ({
        access,
        key,
        path,
      })),
    ).toEqual([
      { access: { role: "member" }, key: "contacts", path: "/crm" },
      { access: { role: "member" }, key: "audiences", path: "/crm/audiences" },
      { access: { role: "member" }, key: "campaigns", path: "/crm/campaigns" },
      { access: { role: "member" }, key: "broadcasts", path: "/crm/broadcasts" },
    ]);
  });

  it("composes one complete root-owned Program presentation", () => {
    const parsed = parseAppSchema(formlessProgramSourceSchema);
    const screens = Object.fromEntries(parsed.screens.map((screen) => [screen.key, screen]));

    expect(parsed.runtime?.owner).toBe("runtime");
    expect(parsed.authorization?.roles).toEqual([
      {
        id: "role_de3ae092-31a9-49df-b7f6-9f51f9403ff9",
        key: "member",
        label: "Member",
      },
      {
        id: "role_3e6f3057-22bf-4fb0-8bd5-7b61bb0f45c4",
        key: "editor",
        label: "Editor",
      },
      {
        id: "role_04144de6-7927-49f2-826a-cdcc70c47357",
        key: "administrator",
        label: "Administrator",
      },
    ]);
    expect(formlessProgramSchemaModules.every((module) => !("authorization" in module))).toBe(true);
    expect(parsed.screens.map(({ access, key }) => ({ access, key }))).toEqual([
      { access: { role: "administrator" }, key: "deployments" },
      { access: { role: "administrator" }, key: "settings" },
      { access: { role: "administrator" }, key: "routes" },
      { access: { role: "administrator" }, key: "principals" },
      { access: { role: "administrator" }, key: "organizations" },
      { access: { role: "administrator" }, key: "invitations" },
      { access: { role: "administrator" }, key: "policies" },
      { access: { role: "administrator" }, key: "access" },
      { access: { role: "member" }, key: "taskHome" },
      { access: { role: "member" }, key: "siteSettings" },
      { access: { role: "member" }, key: "siteEditor" },
      { access: { role: "member" }, key: "siteSubscribers" },
      { access: { role: "member" }, key: "siteContacts" },
      { access: { role: "member" }, key: "contacts" },
      { access: { role: "member" }, key: "audiences" },
      { access: { role: "member" }, key: "campaigns" },
      { access: { role: "member" }, key: "broadcasts" },
    ]);
    expect(screens.principals?.path).toBe("/");
    expect(screens.routes?.path).toBe("/settings/routes");
    expect(screens.access?.path).toBe("/settings/access");
    expect(screens.taskHome?.path).toBe("/tasks");
    expect(screens.siteEditor?.path).toBe("/site");
    expect(screens.siteSettings?.path).toBe("/site/settings");
    expect(screens.siteContacts?.path).toBe("/site/contacts");
    expect(screens.siteSubscribers?.path).toBe("/site/subscribers");
    expect(screens.contacts?.path).toBe("/crm");
    expect(screens.audiences?.path).toBe("/crm/audiences");
    expect(screens.campaigns?.path).toBe("/crm/campaigns");
    expect(screens.broadcasts?.path).toBe("/crm/broadcasts");
    expect(parsed.navigation?.primaryScreens).toEqual([
      "taskHome",
      "siteEditor",
      "contacts",
      "routes",
      "deployments",
      "principals",
      "organizations",
      "access",
      "invitations",
      "policies",
      "settings",
    ]);

    const packageEntityIds = Object.fromEntries(
      [
        ...instanceControlPlaneRecordSchemaModule.entities,
        ...identityControlPlaneRecordSchemaModule.entities,
        ...tasksRecordSchemaModule.entities,
        ...siteRecordSchemaModule.entities,
        ...crmRecordSchemaModule.entities.filter(
          ({ key }) => !["contact", "email-address", "audience", "subscription"].includes(key),
        ),
      ].map(({ id, key }) => [key, id]),
    );
    expect(Object.fromEntries(parsed.entities.map(({ id, key }) => [key, id]))).toEqual(
      packageEntityIds,
    );
    expect(new Set(parsed.entities.map(({ id }) => id)).size).toBe(parsed.entities.length);
  });

  it("keeps the canonical artifact aligned and free of authoring metadata", async () => {
    const artifactText = await readFile(new URL("./schema.json", import.meta.url), "utf8");
    const artifact = JSON.parse(artifactText) as AppSchemaSource;

    expect(artifact).toEqual(formlessProgramSourceSchema);
    expect(parseAppSchema(artifact)).toEqual(parseAppSchema(formlessProgramSourceSchema));
    expect(artifactText).not.toContain('"requires"');
    expect(artifactText).not.toContain("instance-control-plane-records");
    expect(artifactText).not.toContain("identity-control-plane-records");
    expect(artifactText).not.toContain("tasks-records");
    expect(artifactText).not.toContain("tasks-presentation");
    expect(artifactText).not.toContain("site-records");
    expect(artifactText).not.toContain("site-presentation");
    expect(artifactText).not.toContain("crm-records");
    expect(artifactText).not.toContain("crm-presentation");
    expect(artifactText).not.toContain("formless-program-presentation");
    expect(artifactText).not.toContain("@dpeek/");
  });
});
