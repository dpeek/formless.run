import { readFile } from "node:fs/promises";
import {
  identityControlPlaneAccessScreenSchemaModule,
  identityControlPlaneRecordSchemaModule,
} from "@dpeek/formless-identity-control-plane/schema";
import {
  instanceControlPlanePresentationSchemaModule,
  instanceControlPlaneRecordSchemaModule,
  instanceControlPlaneRoutesScreenSchemaModule,
} from "@dpeek/formless-instance-control-plane/schema";
import {
  standardContactSubscriptionRecordSchemaModule,
  standardInquiryRecordSchemaModule,
} from "@dpeek/formless-standard/schema";
import {
  tasksPresentationSchemaModule,
  tasksRecordSchemaModule,
} from "@dpeek/formless-tasks-app/schema";
import {
  siteContactIntakePresentationSchemaModule,
  sitePresentationSchemaModule,
  siteRecordSchemaModule,
} from "@dpeek/formless-site-app/schema";
import { parseAppSchema, type AppSchemaSource } from "@dpeek/formless-schema";
import { describe, expect, it } from "vite-plus/test";
import {
  formlessIdentityControlPlaneAccessScreenSchemaModule,
  formlessInstanceControlPlanePresentationSchemaModule,
  formlessInstanceControlPlaneRoutesScreenSchemaModule,
  formlessProgramSchemaModules,
  formlessProgramSourceSchema,
  formlessSiteContactIntakePresentationSchemaModule,
  formlessSitePresentationSchemaModule,
  formlessSiteRecordSchemaModule,
  formlessStandardContactSubscriptionRecordSchemaModule,
  formlessStandardInquiryRecordSchemaModule,
  formlessTasksPresentationSchemaModule,
  formlessTasksRecordSchemaModule,
} from "./schema.ts";

describe("Formless Program schema", () => {
  it("specializes control-plane presentation modules", () => {
    expect(formlessInstanceControlPlanePresentationSchemaModule.key).toBe(
      instanceControlPlanePresentationSchemaModule.key,
    );
    expect(formlessInstanceControlPlaneRoutesScreenSchemaModule.key).toBe(
      instanceControlPlaneRoutesScreenSchemaModule.key,
    );
    expect(formlessIdentityControlPlaneAccessScreenSchemaModule.key).toBe(
      identityControlPlaneAccessScreenSchemaModule.key,
    );
    expect(
      formlessInstanceControlPlanePresentationSchemaModule.tableViews.map(({ key }) => key),
    ).toEqual(["routeTable"]);
    expect(formlessInstanceControlPlanePresentationSchemaModule).not.toHaveProperty("screens");
    expect(
      formlessInstanceControlPlaneRoutesScreenSchemaModule.screens.map((screen) => ({
        access: screen.access,
        key: screen.key,
        path: screen.path,
      })),
    ).toEqual([{ access: { role: "administrator" }, key: "routes", path: "/settings/routes" }]);
    expect(
      formlessIdentityControlPlaneAccessScreenSchemaModule.screens.map((screen) => ({
        access: screen.access,
        key: screen.key,
        path: screen.path,
        type: screen.type,
      })),
    ).toEqual([
      {
        access: { role: "administrator" },
        key: "access",
        path: "/settings/access",
        type: "runtime",
      },
    ]);
  });

  it("uses whole package declaration replacements for Program access and paths", () => {
    expect(formlessProgramSchemaModules.slice(0, 6)).toEqual([
      instanceControlPlaneRecordSchemaModule,
      identityControlPlaneRecordSchemaModule,
      formlessStandardInquiryRecordSchemaModule,
      formlessStandardContactSubscriptionRecordSchemaModule,
      formlessTasksRecordSchemaModule,
      formlessSiteRecordSchemaModule,
    ]);
    expect(formlessStandardInquiryRecordSchemaModule).toBe(standardInquiryRecordSchemaModule);
    expect(formlessStandardContactSubscriptionRecordSchemaModule.key).toBe(
      standardContactSubscriptionRecordSchemaModule.key,
    );
    expect(
      formlessStandardContactSubscriptionRecordSchemaModule.entities.map(({ id, key }) => ({
        id,
        key,
      })),
    ).toEqual(
      standardContactSubscriptionRecordSchemaModule.entities.map(({ id, key }) => ({ id, key })),
    );
    expect(formlessSiteRecordSchemaModule.key).toBe(siteRecordSchemaModule.key);
    expect(formlessTasksRecordSchemaModule.key).toBe(tasksRecordSchemaModule.key);

    const recordModules = [
      formlessStandardInquiryRecordSchemaModule,
      formlessStandardContactSubscriptionRecordSchemaModule,
      formlessTasksRecordSchemaModule,
      formlessSiteRecordSchemaModule,
    ];
    const publicOperations: string[] = [];
    for (const module of recordModules) {
      for (const entity of module.entities ?? []) {
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
    }
    expect(publicOperations).toEqual(["contact-message.submit", "subscription.subscribe"]);

    expect(formlessTasksPresentationSchemaModule).toEqual({
      ...tasksPresentationSchemaModule,
      screens: tasksPresentationSchemaModule.screens.map((screen) => ({
        ...screen,
        path: "/tasks",
        access: { role: "member" },
      })),
    });
    expect(formlessSitePresentationSchemaModule.key).toBe(sitePresentationSchemaModule.key);
    expect(formlessSiteContactIntakePresentationSchemaModule.key).toBe(
      siteContactIntakePresentationSchemaModule.key,
    );
    expect(
      [
        ...formlessSitePresentationSchemaModule.screens,
        ...formlessSiteContactIntakePresentationSchemaModule.screens,
      ].map(({ access, key, path }) => ({ access, key, path })),
    ).toEqual([
      { access: { role: "member" }, key: "siteSettings", path: "/site/settings" },
      { access: { role: "member" }, key: "siteEditor", path: "/site" },
      { access: { role: "member" }, key: "siteSubscribers", path: "/site/subscribers" },
      { access: { role: "member" }, key: "siteContacts", path: "/site/contacts" },
    ]);
  });

  it("composes one standard owner into the root-owned Program presentation", () => {
    const parsed = parseAppSchema(formlessProgramSourceSchema);
    const screens = Object.fromEntries(parsed.screens.map((screen) => [screen.key, screen]));

    expect(
      formlessProgramSchemaModules.filter(
        ({ key }) => key === standardInquiryRecordSchemaModule.key,
      ),
    ).toHaveLength(1);
    expect(
      formlessProgramSchemaModules.filter(
        ({ key }) => key === standardContactSubscriptionRecordSchemaModule.key,
      ),
    ).toHaveLength(1);
    expect(parsed.runtime?.owner).toBe("runtime");
    expect(parsed.authorization?.roles.map(({ key }) => key)).toEqual([
      "member",
      "editor",
      "administrator",
    ]);
    expect(formlessProgramSchemaModules.every((module) => !("authorization" in module))).toBe(true);
    expect(parsed.screens.map(({ access, key }) => ({ access, key }))).toEqual([
      { access: { role: "administrator" }, key: "routes" },
      { access: { role: "administrator" }, key: "access" },
      { access: { role: "member" }, key: "taskHome" },
      { access: { role: "member" }, key: "siteSettings" },
      { access: { role: "member" }, key: "siteEditor" },
      { access: { role: "member" }, key: "siteSubscribers" },
      { access: { role: "member" }, key: "siteContacts" },
    ]);
    expect(screens.routes?.path).toBe("/settings/routes");
    expect(screens.access).toMatchObject({ type: "runtime", path: "/settings/access" });
    expect(screens.taskHome?.path).toBe("/tasks");
    expect(screens.siteEditor?.path).toBe("/site");
    expect(screens.siteSettings?.path).toBe("/site/settings");
    expect(screens.siteContacts?.path).toBe("/site/contacts");
    expect(screens.siteSubscribers?.path).toBe("/site/subscribers");
    expect(parsed.navigation?.groups).toEqual([
      { key: "tasks", label: "Tasks", screens: ["taskHome"] },
      { key: "site", label: "Site", screens: ["siteEditor"] },
      {
        key: "instance",
        label: "Instance",
        screens: ["routes", "access"],
      },
    ]);

    const packageEntityIds = Object.fromEntries(
      [
        ...instanceControlPlaneRecordSchemaModule.entities,
        ...identityControlPlaneRecordSchemaModule.entities,
        ...standardInquiryRecordSchemaModule.entities,
        ...standardContactSubscriptionRecordSchemaModule.entities,
        ...tasksRecordSchemaModule.entities,
        ...siteRecordSchemaModule.entities,
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
    expect(artifactText).not.toContain("standard-inquiry-records");
    expect(artifactText).not.toContain("standard-contact-subscription-records");
    expect(artifactText).not.toContain("tasks-records");
    expect(artifactText).not.toContain("tasks-presentation");
    expect(artifactText).not.toContain("site-records");
    expect(artifactText).not.toContain("site-presentation");
    expect(artifactText).not.toContain("site-contact-intake-presentation");
    expect(artifactText).not.toContain("@dpeek/");
  });
});
