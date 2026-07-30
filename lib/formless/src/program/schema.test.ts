import { readFile } from "node:fs/promises";
import {
  identityControlPlanePresentationSchemaModule,
  identityControlPlaneRecordSchemaModule,
} from "@dpeek/formless-identity-control-plane/schema";
import {
  instanceControlPlanePresentationSchemaModule,
  instanceControlPlaneRecordSchemaModule,
} from "@dpeek/formless-instance-control-plane/schema";
import { composeAppSchema, parseAppSchema, type AppSchemaSource } from "@dpeek/formless-schema";
import { describe, expect, it } from "vite-plus/test";
import {
  formlessIdentityControlPlanePresentationSchemaModule,
  formlessInstanceControlPlanePresentationSchemaModule,
  formlessProgramSchemaModules,
  formlessProgramSourceSchema,
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

    expect(formlessProgramSchemaModules.slice(0, 2)).toEqual([
      instanceControlPlaneRecordSchemaModule,
      identityControlPlaneRecordSchemaModule,
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
    expect(parsed.navigation?.primaryScreens).toEqual([
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
    expect(artifactText).not.toContain("formless-program-presentation");
    expect(artifactText).not.toContain("@dpeek/");
  });
});
