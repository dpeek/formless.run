import { readFile } from "node:fs/promises";
import {
  identityControlPlanePresentationSchemaModule,
  identityControlPlaneRecordSchemaModule,
} from "@dpeek/formless-identity-control-plane/schema";
import {
  instanceControlPlanePresentationSchemaModule,
  instanceControlPlaneRecordSchemaModule,
} from "@dpeek/formless-instance-control-plane/schema";
import {
  tasksPresentationSchemaModule,
  tasksRecordSchemaModule,
} from "@dpeek/formless-tasks-app/schema";
import {
  sitePresentationSchemaModule,
  siteRecordSchemaModule,
} from "@dpeek/formless-site-app/schema";
import { composeAppSchema, parseAppSchema, type AppSchemaSource } from "@dpeek/formless-schema";
import { describe, expect, it } from "vite-plus/test";
import {
  formlessIdentityControlPlanePresentationSchemaModule,
  formlessInstanceControlPlanePresentationSchemaModule,
  formlessProgramSchemaModules,
  formlessProgramSourceSchema,
  formlessSitePresentationSchemaModule,
  formlessSiteRecordSchemaModule,
  formlessTasksPresentationSchemaModule,
  formlessTasksRecordSchemaModule,
} from "./schema.ts";

describe("Formless Program schema", () => {
  it("deliberately replaces colliding package presentation modules", () => {
    expect(() =>
      composeAppSchema({
        version: 1,
        modules: [
          instanceControlPlaneRecordSchemaModule,
          identityControlPlaneRecordSchemaModule,
          instanceControlPlanePresentationSchemaModule,
          identityControlPlanePresentationSchemaModule,
        ],
        runtime: { owner: "runtime" },
      }),
    ).toThrow(
      'Schema declaration "screens.apps" is contributed by both modules "instance-control-plane-presentation" and "identity-control-plane-presentation".',
    );

    expect(formlessProgramSchemaModules.slice(0, 4)).toEqual([
      instanceControlPlaneRecordSchemaModule,
      identityControlPlaneRecordSchemaModule,
      formlessTasksRecordSchemaModule,
      formlessSiteRecordSchemaModule,
    ]);
    expect(formlessInstanceControlPlanePresentationSchemaModule.key).toBe(
      instanceControlPlanePresentationSchemaModule.key,
    );
    expect(formlessIdentityControlPlanePresentationSchemaModule.key).toBe(
      identityControlPlanePresentationSchemaModule.key,
    );
    expect(
      formlessInstanceControlPlanePresentationSchemaModule.screens.map(({ key }) => key),
    ).toEqual(["routes", "deployments", "settings"]);
    expect(
      formlessIdentityControlPlanePresentationSchemaModule.screens.map(({ key }) => key),
    ).toEqual(["principals", "organizations", "access", "invitations", "policies"]);
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

  it("specializes Site through same-key Program replacements", () => {
    expect(formlessSiteRecordSchemaModule).toEqual({
      ...siteRecordSchemaModule,
      entities: siteRecordSchemaModule.entities.map((entity) => ({
        ...entity,
        operations: entity.operations?.map((operation) =>
          "policy" in operation && operation.policy.actors.includes("anonymous")
            ? operation
            : {
                ...operation,
                access: { role: "editor" },
              },
        ),
      })),
    });
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
    expect(
      formlessSiteRecordSchemaModule.entities.flatMap((entity) =>
        (entity.operations ?? []).map((operation) => ({
          access: "access" in operation ? operation.access : undefined,
          operation: `${entity.key}.${operation.key}`,
          policy: "policy" in operation ? operation.policy : undefined,
        })),
      ),
    ).toEqual([
      { access: { role: "editor" }, operation: "site.update", policy: undefined },
      { access: { role: "editor" }, operation: "block.create", policy: undefined },
      { access: { role: "editor" }, operation: "block.update", policy: undefined },
      { access: { role: "editor" }, operation: "block.delete", policy: undefined },
      {
        access: { role: "editor" },
        operation: "block-placement.create",
        policy: undefined,
      },
      {
        access: { role: "editor" },
        operation: "block-placement.update",
        policy: undefined,
      },
      {
        access: { role: "editor" },
        operation: "block-placement.addTreeChild",
        policy: undefined,
      },
      {
        access: { role: "editor" },
        operation: "block-placement.removeTreePlacement",
        policy: undefined,
      },
      { access: { role: "editor" }, operation: "contact.update", policy: undefined },
      {
        access: undefined,
        operation: "contact-message.submit",
        policy: {
          actors: ["anonymous"],
          access: {
            actor: "anonymous",
            challenge: { kind: "turnstile" },
            origin: { kind: "same-origin" },
          },
        },
      },
      {
        access: { role: "editor" },
        operation: "email-address.update",
        policy: undefined,
      },
      { access: { role: "editor" }, operation: "audience.update", policy: undefined },
      {
        access: { role: "editor" },
        operation: "subscription.update",
        policy: undefined,
      },
      {
        access: undefined,
        operation: "subscription.subscribe",
        policy: {
          actors: ["anonymous"],
          access: {
            actor: "anonymous",
            challenge: { kind: "turnstile" },
            origin: { kind: "same-origin" },
          },
        },
      },
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
      { access: { role: "administrator" }, key: "routes" },
      { access: { role: "administrator" }, key: "deployments" },
      { access: { role: "administrator" }, key: "settings" },
      { access: { role: "administrator" }, key: "principals" },
      { access: { role: "administrator" }, key: "organizations" },
      { access: { role: "administrator" }, key: "access" },
      { access: { role: "administrator" }, key: "invitations" },
      { access: { role: "administrator" }, key: "policies" },
      { access: { role: "member" }, key: "taskHome" },
      { access: { role: "member" }, key: "siteSettings" },
      { access: { role: "member" }, key: "siteEditor" },
      { access: { role: "member" }, key: "siteSubscribers" },
      { access: { role: "member" }, key: "siteContacts" },
      { access: { role: "administrator" }, key: "apps" },
    ]);
    expect(screens.principals?.path).toBe("/");
    expect(screens.apps).toMatchObject({
      path: "/apps",
      layout: {
        sections: [
          { id: "app-installs", type: "collection", view: "appInstallList" },
          { id: "app-registrations", type: "collection", view: "appRegistrationList" },
        ],
      },
    });
    expect(screens.taskHome?.path).toBe("/tasks");
    expect(screens.siteEditor?.path).toBe("/site");
    expect(screens.siteSettings?.path).toBe("/site/settings");
    expect(screens.siteContacts?.path).toBe("/site/contacts");
    expect(screens.siteSubscribers?.path).toBe("/site/subscribers");
    expect(parsed.navigation?.primaryScreens).toEqual([
      "taskHome",
      "siteEditor",
      "apps",
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
      ].map(({ id, key }) => [key, id]),
    );
    expect(Object.fromEntries(parsed.entities.map(({ id, key }) => [key, id]))).toEqual(
      packageEntityIds,
    );
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
    expect(artifactText).not.toContain("formless-program-presentation");
    expect(artifactText).not.toContain("@dpeek/");
  });
});
