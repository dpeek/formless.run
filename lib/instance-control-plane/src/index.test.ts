import { describe, expect, it } from "vite-plus/test";
import {
  INSTANCE_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY,
  INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID,
  formatInstanceControlPlaneBoundaryEntityName,
  instanceControlPlanePreferredAdminOriginFromRecords,
  instanceControlPlaneProductionIdentityFromRecords,
  instanceControlPlaneDeploymentConfigObservedFields,
  instanceControlPlaneEffectiveRouteAccess,
  instanceControlPlaneEntityNames,
  instanceControlPlaneImmutableFields,
  reviewableInstanceControlPlaneRecords,
  instanceControlPlaneSchema,
  instanceControlPlaneSourceSchema,
  isInstanceControlPlaneEntityName,
  isInstanceControlPlaneRouteSafePath,
  parseInstanceControlPlaneBoundaryEntityName,
  validateInstanceControlPlaneRecords,
} from "./index.ts";
import {
  composeAppSchema,
  computeSourceSchemaHash,
  defineAppSchemaModule,
  parseAppSchema,
  type AppSchema,
  type KeyedDefinition,
  type WorkspaceScreenSchema,
} from "@dpeek/formless-schema";
import type { StoredRecord } from "@dpeek/formless-storage";
import {
  isRuntimeControlPlaneObservedField,
  isRuntimeControlPlaneSecretReferenceField,
} from "@dpeek/formless-schema";
import {
  instanceControlPlanePresentationSchemaModule,
  instanceControlPlaneRecordSchemaModule,
  instanceControlPlaneRoutesScreenSchemaModule,
} from "@dpeek/formless-instance-control-plane/schema";
import {
  instanceControlPlaneCreateIdContribution,
  instanceControlPlaneRecordAdapter,
} from "@dpeek/formless-instance-control-plane/records";

describe("instance control-plane schema contracts", () => {
  it("publishes records and route-only presentation declarations", () => {
    expect(instanceControlPlaneRecordSchemaModule).toMatchObject({
      key: "instance-control-plane-records",
      runtimeRequirements: {
        shared: {
          recordAdapters: ["instance-control-plane.records"],
          createIdContributions: ["instance-control-plane.create-id"],
        },
      },
      entities: instanceControlPlaneEntityNames.map((key) => expect.objectContaining({ key })),
      relationships: expect.arrayContaining([
        expect.objectContaining({ key: "emailDomainSenders" }),
      ]),
      queries: expect.arrayContaining([expect.objectContaining({ key: "emailSenderEnabled" })]),
      runtime: expect.objectContaining({
        controlPlane: expect.objectContaining({
          entities: expect.any(Object),
        }),
      }),
    });
    expect(instanceControlPlanePresentationSchemaModule).toMatchObject({
      key: "instance-control-plane-presentation",
      requires: ["instance-control-plane-records"],
      tableViews: [expect.objectContaining({ key: "routeTable" })],
      views: [
        expect.objectContaining({ key: "routeCreate" }),
        expect.objectContaining({ key: "routeEdit" }),
        expect.objectContaining({ key: "routeList" }),
      ],
    });
    expect(instanceControlPlaneRoutesScreenSchemaModule).toMatchObject({
      key: "instance-control-plane-routes-screen",
      requires: ["instance-control-plane-presentation"],
      screens: [expect.objectContaining({ key: "routes", path: "/routes" })],
    });
    expect(instanceControlPlaneSourceSchema.runtime?.owner).toBe("runtime");
    expect(instanceControlPlaneRecordSchemaModule.runtime.controlPlane.entities).toEqual(
      instanceControlPlaneSourceSchema.runtime?.controlPlane?.entities,
    );
    expect(instanceControlPlaneRecordAdapter.entityIds).toEqual(
      instanceControlPlaneSchema.entities.map(({ id }) => id),
    );
    expect(instanceControlPlaneSchema.itemViews).toEqual([]);
    expect(instanceControlPlaneSchema.tableViews.map(({ key }) => key)).toEqual(["routeTable"]);
    expect(instanceControlPlaneSchema.views.map(({ key }) => key)).toEqual([
      "routeCreate",
      "routeEdit",
      "routeList",
    ]);
    expect(instanceControlPlaneSchema.screens.map(({ key }) => key)).toEqual(["routes"]);
    expect(
      instanceControlPlaneCreateIdContribution.createId("deployment-config", {
        targetId: "deployment:one",
      }),
    ).toBe("deployment:one");
    expect(
      instanceControlPlaneCreateIdContribution.createId("route", {
        targetId: "deployment:one",
      }),
    ).toBeUndefined();
  });

  it("composes a same-key downstream routes screen replacement", () => {
    const replacement = defineAppSchemaModule({
      ...instanceControlPlaneRoutesScreenSchemaModule,
      screens: instanceControlPlaneRoutesScreenSchemaModule.screens.map((screen) => ({
        ...screen,
        path: "/infrastructure/routes",
        access: { role: "administrator" },
      })),
    });
    const schema = parseAppSchema(
      composeAppSchema({
        version: 1,
        authorization: {
          roles: [
            {
              id: "role_04144de6-7927-49f2-826a-cdcc70c47357",
              key: "administrator",
              label: "Administrator",
            },
          ],
        },
        modules: [
          instanceControlPlaneRecordSchemaModule,
          instanceControlPlanePresentationSchemaModule,
          replacement,
        ],
        runtime: { owner: "runtime" },
      }),
    );
    const routesScreen = schema.screens.find(
      (screen): screen is KeyedDefinition<WorkspaceScreenSchema> =>
        screen.key === "routes" && screen.type === "workspace",
    );

    expect(replacement.key).toBe(instanceControlPlaneRoutesScreenSchemaModule.key);
    expect(routesScreen).toMatchObject({
      key: "routes",
      path: "/infrastructure/routes",
      access: { role: "administrator" },
    });
    expect(routesScreen?.layout.sections.map(({ view }) => view)).toEqual(["routeList"]);
    expect(schema.views.some(({ key }) => key === "routeList")).toBe(true);
  });

  it("owns its administrator role and materializes exact operation access", () => {
    expect(instanceControlPlaneSchema.authorization?.roles).toEqual([
      {
        id: "role_04144de6-7927-49f2-826a-cdcc70c47357",
        key: "administrator",
        label: "Administrator",
      },
    ]);

    for (const entity of instanceControlPlaneSchema.entities) {
      for (const operation of entity.operations ?? []) {
        expect(operation.access, `${entity.key}.${operation.key}`).toEqual(
          entity.key === "instance-settings"
            ? { anyOf: [{ actor: "owner" }, { actor: "adminBearer" }] }
            : { anyOf: [{ role: "administrator" }, { actor: "adminBearer" }] },
        );
      }
    }
  });

  it("uses normal App schema source hashing for the full control-plane schema", async () => {
    const baseHash = await computeSourceSchemaHash(instanceControlPlaneSourceSchema);
    const mutationCases: Array<[string, (schema: AppSchema) => void]> = [
      [
        "view",
        (schema) => {
          const view = schema.views.find((definition) => definition.key === "routeList")!;
          if (view.type !== "collection") {
            throw new Error("Expected routeList to be a collection view.");
          }

          view.label = "Runtime routes";
        },
      ],
      [
        "runtime metadata",
        (schema) => {
          const routeMetadata = schema.runtime?.controlPlane?.entities.route;

          if (!routeMetadata) {
            throw new Error("Expected route runtime control-plane metadata.");
          }

          routeMetadata.immutableFields = ["kind", "matchPath"];
        },
      ],
    ];

    expect(baseHash).toMatch(/^sha256:[a-f0-9]{64}$/);

    for (const [label, mutate] of mutationCases) {
      const changedSchema = structuredClone(
        instanceControlPlaneSourceSchema,
      ) as unknown as AppSchema;
      mutate(changedSchema);

      expect(await computeSourceSchemaHash(changedSchema), label).not.toBe(baseHash);
    }
  });
  it("defines the runtime-owned flat record schema", () => {
    const schema = instanceControlPlaneSchema;
    const referenceTargets = schema.entities.flatMap((entity) =>
      entity.fields.flatMap((field) => (field.type === "reference" ? [field.to] : [])),
    );
    expect(schema.entities.map(({ key }) => key).sort()).toEqual(
      [...instanceControlPlaneEntityNames].sort(),
    );
    expect(schema.entities.map(({ key }) => key)).not.toContain("appInstall");
    expect(referenceTargets.filter((target) => target.includes(":"))).toEqual([]);
    expect(referenceTargets).toEqual(
      expect.arrayContaining(["deployment-config", "email-domain", "email-sender", "route"]),
    );
    expect(schema.entities.map(({ key }) => key)).not.toEqual(
      expect.arrayContaining(["deploy-target", "provider-config-ref", "deploy-desired-resource"]),
    );
    expect(schema.screens.find((definition) => definition.key === "routes")!.path).toBe("/routes");
    expect(schema.runtime?.owner).toBe("runtime");
    expect(schema.runtime).not.toHaveProperty("builder");
  });
  it("defines deployment config intent and observation cache fields", () => {
    const schema = instanceControlPlaneSchema;
    const deploymentFields = definitionRecord(
      schema.entities.find((definition) => definition.key === "deployment-config")?.fields ?? [],
    );
    expect(deploymentFields).toMatchObject({
      targetId: { type: "text", required: true },
      label: { type: "text", required: true },
      enabled: { type: "boolean", required: true, default: true },
      targetUrl: { type: "text", required: true, format: "href" },
      providerFamily: {
        type: "enum",
        required: true,
        values: [{ key: "cloudflare", label: "Cloudflare" }],
      },
      accountId: { type: "text", required: false },
      workerName: { type: "text", required: false },
      credentialRef: { type: "text", required: false },
      observedStatus: {
        type: "enum",
        required: false,
        values: [
          { key: "deployed", label: "Deployed" },
          { key: "drifted", label: "Drifted" },
          { key: "failed", label: "Failed" },
          { key: "in-sync", label: "In sync" },
          { key: "unknown", label: "Unknown" },
        ],
      },
      observedAt: { type: "text", required: false },
      observedDesiredStateHash: { type: "text", required: false },
      observedSummary: { type: "text", required: false, format: "longText" },
      observedError: { type: "text", required: false, format: "longText" },
      observedRunnerId: { type: "text", required: false },
    });
    expect(Object.keys(deploymentFields ?? {})).toEqual([
      "targetId",
      "label",
      "enabled",
      "targetUrl",
      "providerFamily",
      "accountId",
      "workerName",
      "credentialRef",
      ...instanceControlPlaneDeploymentConfigObservedFields,
    ]);
  });
  it("defines instance settings and email intent records with validation", () => {
    const schema = instanceControlPlaneSchema;
    const settingsFields = definitionRecord(
      schema.entities.find((definition) => definition.key === "instance-settings")?.fields ?? [],
    );
    const emailDomainFields = definitionRecord(
      schema.entities.find((definition) => definition.key === "email-domain")?.fields ?? [],
    );
    const emailSenderFields = definitionRecord(
      schema.entities.find((definition) => definition.key === "email-sender")?.fields ?? [],
    );
    const records = controlPlaneRecords({
      emailIntent: true,
    });

    expect(settingsFields).toMatchObject({
      settingsId: { type: "text", required: true },
      canonicalOrigin: { type: "text", required: false, format: "href" },
      primaryRoute: { type: "reference", required: false, to: "route" },
      adminRoute: { type: "reference", required: false, to: "route" },
      authRoute: { type: "reference", required: false, to: "route" },
      authOrigin: { type: "text", required: false, format: "href" },
      authRelyingPartyId: { type: "text", required: false },
      defaultEmailDomain: { type: "reference", required: false, to: "email-domain" },
      defaultContactSender: { type: "reference", required: false, to: "email-sender" },
      defaultAuthSender: { type: "reference", required: false, to: "email-sender" },
      contactNotificationRecipient: { type: "text", required: false },
      productionIdentityStatus: {
        type: "enum",
        required: true,
        default: "unconfigured",
      },
    });
    expect(emailDomainFields).toMatchObject({
      enabled: { type: "boolean", required: true, default: true },
      providerFamily: {
        type: "enum",
        required: true,
        values: [{ key: "cloudflare", label: "Cloudflare" }],
      },
      domain: { type: "text", required: true },
      primaryRoute: { type: "reference", required: false, to: "route" },
      deploymentConfig: { type: "reference", required: false, to: "deployment-config" },
      dnsStatus: { type: "enum", required: false },
      latestError: { type: "text", required: false, format: "longText" },
    });
    expect(emailSenderFields).toMatchObject({
      enabled: { type: "boolean", required: true, default: true },
      address: { type: "text", required: true },
      displayName: { type: "text", required: false },
      purpose: {
        type: "enum",
        required: true,
        values: [
          { key: "contact-notification", label: "Contact notification" },
          { key: "auth", label: "Auth messages" },
          { key: "system", label: "System" },
        ],
      },
      emailDomain: { type: "reference", required: true, to: "email-domain" },
    });
    expect(schema.runtime?.controlPlane?.entities["instance-settings"]).toEqual({
      immutableFields: ["settingsId"],
    });
    expect(schema.runtime?.controlPlane?.entities["email-domain"]).toEqual({
      immutableFields: ["providerFamily"],
    });
    expect(schema.runtime?.controlPlane?.entities["email-sender"]).toEqual({
      immutableFields: ["emailDomain"],
    });
    expect(instanceControlPlaneProductionIdentityFromRecords(records)).toMatchObject({
      authOrigin: "https://www.example.com",
      canonicalOrigin: "https://www.example.com",
      primaryRoute: "route:host:public-site:www.example.com",
      relyingPartyId: "example.com",
      relyingPartyName: "Example Instance",
    });
    expect(reviewableInstanceControlPlaneRecords(records).map((record) => record.entity)).toEqual(
      expect.arrayContaining(["instance-settings", "email-domain", "email-sender"]),
    );

    expect(() =>
      validateInstanceControlPlaneRecords("Control-plane records", [
        ...records,
        {
          ...records.find((record) => record.entity === "instance-settings")!,
          id: "settings:duplicate",
        },
      ]),
    ).toThrow("at most one active instance:instance-settings");

    expect(() =>
      validateInstanceControlPlaneRecords(
        "Control-plane records",
        records.map((record) =>
          record.entity === "email-sender"
            ? { ...record, values: { ...record.values, address: "contact@other.example.com" } }
            : record,
        ),
      ),
    ).toThrow('field "instance:email-sender.address" host must belong');

    expect(() =>
      validateInstanceControlPlaneRecords(
        "Control-plane records",
        records.map((record) =>
          record.entity === "instance-settings"
            ? {
                ...record,
                values: {
                  ...record.values,
                  defaultAuthSender: "email-sender:contact@mail.example.com",
                },
              }
            : record,
        ),
      ),
    ).toThrow(
      'field "instance:instance-settings.defaultAuthSender" must reference a sender with purpose "auth"',
    );
  });

  it("validates preferred admin route references in control-plane record sources", () => {
    const settings = storedInstanceSettingsRecord({
      adminRoute: "route:host:instance:admin.example.com",
      productionIdentityStatus: "unconfigured",
    });
    const adminRoute = storedAdminRouteRecord({
      id: "route:host:instance:admin.example.com",
      matchHost: "admin.example.com",
    });
    const parseRecords = (records: StoredRecord[]) =>
      reviewableInstanceControlPlaneRecords(records);

    expect(parseRecords([settings, adminRoute])).toEqual([settings, adminRoute]);
    expect(() =>
      parseRecords([
        settings,
        storedAdminRouteRecord({
          id: "route:host:instance:admin.example.com",
          enabled: false,
          matchHost: "admin.example.com",
        }),
      ]),
    ).toThrow(
      'field "instance:instance-settings.adminRoute" must reference an enabled exact-host instance admin route',
    );
    expect(() =>
      parseRecords([
        settings,
        storedAdminRouteRecord({
          id: "route:host:instance:admin.example.com",
        }),
      ]),
    ).toThrow(
      'field "instance:instance-settings.adminRoute" must reference an enabled exact-host instance admin route',
    );
    expect(() =>
      parseRecords([
        settings,
        storedAdminRouteRecord({
          id: "route:host:instance:admin.example.com",
          matchHost: "admin.example.com",
          surface: undefined,
        }),
      ]),
    ).toThrow(
      'field "instance:instance-settings.adminRoute" must reference an enabled exact-host instance admin route',
    );
  });

  it("resolves preferred admin origins from selected and fallback routes", () => {
    const adminOne = storedAdminRouteRecord({
      id: "route:host:instance:admin.example.com",
      matchHost: "admin.example.com",
    });
    const adminTwo = storedAdminRouteRecord({
      id: "route:host:instance:control.example.com",
      matchHost: "control.example.com",
    });
    const publicRoute = storedRouteRecord({
      id: "route:host:public-site:www.example.com",
      values: {
        enabled: true,
        matchHost: "www.example.com",
        matchPath: "/",
        matchPrefix: "/",
        kind: "mount",
        targetProfile: "public-site",
        surface: "public-site",
      },
    });

    expect(
      instanceControlPlanePreferredAdminOriginFromRecords({
        records: [
          storedInstanceSettingsRecord({ adminRoute: adminTwo.id }),
          adminOne,
          adminTwo,
          publicRoute,
        ],
        deploymentTargetUrl: "https://personal.dpeek.workers.dev",
      }),
    ).toEqual({
      adminOrigin: "https://control.example.com",
      routeId: adminTwo.id,
      source: "adminRoute",
      status: "resolved",
    });
    expect(
      instanceControlPlanePreferredAdminOriginFromRecords({
        records: [storedInstanceSettingsRecord({ primaryRoute: adminOne.id }), adminOne, adminTwo],
        deploymentTargetUrl: "https://personal.dpeek.workers.dev",
      }),
    ).toEqual({
      adminOrigin: "https://admin.example.com",
      routeId: adminOne.id,
      source: "primaryRoute",
      status: "resolved",
    });
    expect(
      instanceControlPlanePreferredAdminOriginFromRecords({
        records: [adminOne, publicRoute],
        deploymentTargetUrl: "https://personal.dpeek.workers.dev",
      }),
    ).toEqual({
      adminOrigin: "https://admin.example.com",
      routeId: adminOne.id,
      source: "singleCustomAdminRoute",
      status: "resolved",
    });
    expect(
      instanceControlPlanePreferredAdminOriginFromRecords({
        records: [adminTwo, adminOne, publicRoute],
        deploymentTargetUrl: "https://personal.dpeek.workers.dev",
      }),
    ).toEqual({
      candidateRoutes: [
        {
          adminOrigin: "https://admin.example.com",
          matchHost: "admin.example.com",
          routeId: adminOne.id,
        },
        {
          adminOrigin: "https://control.example.com",
          matchHost: "control.example.com",
          routeId: adminTwo.id,
        },
      ],
      status: "ambiguous",
    });
    expect(
      instanceControlPlanePreferredAdminOriginFromRecords({
        records: [publicRoute],
        deploymentTargetUrl: "https://personal.dpeek.workers.dev",
      }),
    ).toEqual({
      adminOrigin: "https://personal.dpeek.workers.dev",
      source: "deploymentTargetUrl",
      status: "resolved",
    });
  });
  it("declares operation contracts for generated instance management records", () => {
    const schema = instanceControlPlaneSchema;
    expect(operationInputKeys(schema, "route", "create")).toEqual([
      "enabled",
      "matchHost",
      "matchPath",
      "matchPrefix",
      "kind",
      "targetProfile",
      "surface",
      "access",
      "deploymentConfig",
      "toHost",
      "toUrl",
      "statusCode",
      "preservePath",
      "preserveQueryString",
    ]);
    expect(operationInputKeys(schema, "route", "update")).toEqual([
      "enabled",
      "matchHost",
      "matchPath",
      "matchPrefix",
      "kind",
      "targetProfile",
      "surface",
      "access",
      "deploymentConfig",
      "toHost",
      "toUrl",
      "statusCode",
      "preservePath",
      "preserveQueryString",
    ]);
    expect(operationInputKeys(schema, "deployment-config", "create")).toEqual([
      "targetId",
      "label",
      "enabled",
      "targetUrl",
      "providerFamily",
      "accountId",
      "workerName",
      "credentialRef",
    ]);
    expect(operationInputKeys(schema, "deployment-config", "update")).toEqual([
      "targetId",
      "label",
      "enabled",
      "targetUrl",
      "providerFamily",
      "accountId",
      "workerName",
      "credentialRef",
      ...instanceControlPlaneDeploymentConfigObservedFields,
    ]);
    expect(operationInputKeys(schema, "instance-settings", "create")).toEqual([
      "settingsId",
      "canonicalOrigin",
      "primaryRoute",
      "adminRoute",
      "authRoute",
      "authOrigin",
      "authRelyingPartyId",
      "authRelyingPartyName",
      "defaultEmailDomain",
      "defaultContactSender",
      "defaultAuthSender",
      "contactNotificationRecipient",
      "productionIdentityStatus",
    ]);
    expect(operationInputKeys(schema, "instance-settings", "update")).toEqual([
      "canonicalOrigin",
      "primaryRoute",
      "adminRoute",
      "authRoute",
      "authOrigin",
      "authRelyingPartyId",
      "authRelyingPartyName",
      "defaultEmailDomain",
      "defaultContactSender",
      "defaultAuthSender",
      "contactNotificationRecipient",
      "productionIdentityStatus",
    ]);
  });
  it("defines flat unified route fields for mount and redirect intent", () => {
    const schema = instanceControlPlaneSchema;
    const routeFields = definitionRecord(
      schema.entities.find((definition) => definition.key === "route")?.fields ?? [],
    );
    expect(routeFields).toMatchObject({
      enabled: { type: "boolean", required: true, default: true },
      matchHost: { type: "text", required: false },
      matchPath: { type: "text", required: true },
      matchPrefix: { type: "text", required: false },
      kind: {
        type: "enum",
        required: true,
        values: [
          { key: "mount", label: "Mount" },
          { key: "redirect", label: "Redirect" },
        ],
      },
      targetProfile: {
        type: "enum",
        required: false,
        values: [
          { key: "instance", label: "Instance" },
          { key: "public-site", label: "Public Site" },
        ],
      },
      surface: {
        type: "enum",
        required: false,
        values: [
          { key: "admin", label: "Admin" },
          { key: "public-site", label: "Public Site" },
        ],
      },
      access: {
        type: "enum",
        required: false,
        values: [
          { key: "anonymous", label: "Anonymous" },
          { key: "authenticated", label: "Authenticated" },
          { key: "management", label: "Management" },
          { key: "owner", label: "Owner" },
        ],
      },
      deploymentConfig: {
        type: "reference",
        required: false,
        to: "deployment-config",
        displayField: "label",
      },
      toHost: { type: "text", required: false },
      toUrl: { type: "text", required: false, format: "href" },
      statusCode: {
        type: "enum",
        required: false,
        values: [
          { key: "301", label: "301" },
          { key: "302", label: "302" },
          { key: "303", label: "303" },
          { key: "307", label: "307" },
          { key: "308", label: "308" },
        ],
      },
      preservePath: { type: "boolean", required: false, default: true },
      preserveQueryString: { type: "boolean", required: false, default: true },
    });
    expect(Object.keys(routeFields ?? {})).toEqual([
      "enabled",
      "matchHost",
      "matchPath",
      "matchPrefix",
      "kind",
      "targetProfile",
      "surface",
      "access",
      "deploymentConfig",
      "toHost",
      "toUrl",
      "statusCode",
      "preservePath",
      "preserveQueryString",
    ]);
    expect(schema.runtime?.controlPlane?.entities.route).toEqual({
      immutableFields: ["kind"],
    });
  });

  it("records identity invariants outside mutable generated fields", () => {
    expect(INSTANCE_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY).toBe("instance");
    expect(formatInstanceControlPlaneBoundaryEntityName("route")).toBe("instance:route");
    expect(
      parseInstanceControlPlaneBoundaryEntityName("Archive record entity", "instance:route"),
    ).toBe("route");
    expect(() =>
      parseInstanceControlPlaneBoundaryEntityName("Archive record entity", "other:route"),
    ).toThrow('Archive record entity schema key must be "instance".');
    expect(instanceControlPlaneImmutableFields["deployment-config"]).toEqual([
      "targetId",
      "providerFamily",
    ]);
    expect(instanceControlPlaneImmutableFields["instance-settings"]).toEqual(["settingsId"]);
    expect(instanceControlPlaneImmutableFields["email-domain"]).toEqual(["providerFamily"]);
    expect(instanceControlPlaneImmutableFields["email-sender"]).toEqual(["emailDomain"]);
    expect(instanceControlPlaneImmutableFields.route).toEqual(["kind"]);
    expect(isInstanceControlPlaneEntityName("unknown")).toBe(false);
    expect(isInstanceControlPlaneEntityName("deployment-config")).toBe(true);
    expect(isInstanceControlPlaneEntityName("instance-settings")).toBe(true);
    expect(isInstanceControlPlaneEntityName("email-domain")).toBe(true);
    expect(isInstanceControlPlaneEntityName("email-sender")).toBe(true);
    expect(isInstanceControlPlaneEntityName("app-route")).toBe(false);
    expect(isInstanceControlPlaneEntityName("deploy-target")).toBe(false);
    expect(isInstanceControlPlaneEntityName("missing")).toBe(false);

    const schema = instanceControlPlaneSchema;
    expect(
      isRuntimeControlPlaneSecretReferenceField(schema, "deployment-config", "credentialRef"),
    ).toBe(true);
    expect(
      instanceControlPlaneDeploymentConfigObservedFields.every((field) =>
        isRuntimeControlPlaneObservedField(schema, "deployment-config", field),
      ),
    ).toBe(true);
    expect(isRuntimeControlPlaneObservedField(schema, "deployment-config", "targetUrl")).toBe(
      false,
    );
    expect(
      schema.entities.find((definition) => definition.key === "deploy-attempt")!,
    ).toBeUndefined();
    expect(
      schema.entities.find((definition) => definition.key === "deploy-evidence-summary")!,
    ).toBeUndefined();
    expect(
      schema.entities.find((definition) => definition.key === "deploy-drift-report")!,
    ).toBeUndefined();
  });
  it("marks generated route editor fields by ownership", () => {
    const schema = instanceControlPlaneSchema;
    const routeTable = schema.tableViews.find((definition) => definition.key === "routeTable")!;
    const routesScreen = schema.screens.find(
      (screen): screen is KeyedDefinition<WorkspaceScreenSchema> =>
        screen.key === "routes" && screen.type === "workspace",
    )!;
    const routeCreate = schema.views.find((definition) => definition.key === "routeCreate")!;
    const routeEdit = schema.views.find((definition) => definition.key === "routeEdit")!;
    const routeList = schema.views.find((definition) => definition.key === "routeList")!;
    const routeCreateFields =
      routeCreate.type === "create" ? routeCreate.fields.map(({ field }) => field) : [];
    const routeEditFields =
      routeEdit.type === "edit" ? routeEdit.fields.map(({ field }) => field) : [];
    expect(routeList.type).toBe("collection");
    expect(routeList.type === "collection" ? routeList.operations : undefined).toEqual([
      { operation: "route.create", createView: "routeCreate" },
    ]);
    expect(
      routeList.type === "collection" ? routeList.queries.map((slot) => slot.query) : undefined,
    ).toEqual(["routeAll"]);
    expect(
      schema.views.find((definition) => definition.key === "routesByDeploymentConfigList")!,
    ).toBeUndefined();
    expect(routesScreen?.layout.sections.map((section) => section.view)).toEqual(["routeList"]);
    expect(JSON.stringify(routesScreen)).not.toContain("deployEvidenceSummaryList");
    expect(JSON.stringify(routesScreen)).not.toContain("deployDriftReportList");
    expect(routeTable.operations?.[0]).toMatchObject({
      operation: "route.update",
      label: "Edit route",
      editView: "routeEdit",
    });
    expect(routeTable?.columns).toMatchObject([
      { field: "enabled", display: "editor" },
      { field: "matchHost", display: "readOnly" },
      { field: "matchPath", display: "readOnly" },
      { field: "matchPrefix", display: "readOnly" },
      { field: "kind", display: "readOnly" },
      { field: "targetProfile", display: "readOnly" },
      { field: "surface", display: "readOnly" },
      { field: "access", display: "readOnly" },
      { field: "toHost", display: "readOnly" },
      { field: "toUrl", display: "readOnly" },
      { field: "statusCode", display: "readOnly" },
      { type: "operationControl", operations: ["route.update"] },
    ]);
    expect(routeCreateFields).not.toContain("deploymentConfig");
    expect(routeEditFields).not.toContain("deploymentConfig");
    expect(
      routeEdit.type === "edit" ? definitionRecord(routeEdit.fields, "field") : undefined,
    ).toMatchObject({
      targetProfile: { visibleWhen: { field: "kind", values: ["mount"] } },
      access: { visibleWhen: { field: "kind", values: ["mount"] } },
      toHost: { visibleWhen: { field: "kind", values: ["redirect"] } },
      statusCode: { visibleWhen: { field: "kind", values: ["redirect"] } },
    });
  });
  it("derives Program route access without app install scope", () => {
    expect(
      instanceControlPlaneEffectiveRouteAccess({
        kind: "mount",
        targetProfile: "public-site",
        surface: "public-site",
      }),
    ).toBe("anonymous");
    expect(
      instanceControlPlaneEffectiveRouteAccess({
        kind: "mount",
        targetProfile: "public-site",
        surface: "public-site",
        access: "owner",
      }),
    ).toBe("owner");
    expect(
      instanceControlPlaneEffectiveRouteAccess({
        kind: "mount",
        targetProfile: "instance",
        surface: "admin",
      }),
    ).toBe("management");
  });

  it("keeps route paths static, lowercase, and away from reserved roots", () => {
    expect(isInstanceControlPlaneRouteSafePath("/apps/personal")).toBe(true);
    expect(isInstanceControlPlaneRouteSafePath("/sites/personal")).toBe(true);
    expect(isInstanceControlPlaneRouteSafePath("apps/personal")).toBe(false);
    expect(isInstanceControlPlaneRouteSafePath("/Apps/personal")).toBe(false);
    expect(isInstanceControlPlaneRouteSafePath("/apps//personal")).toBe(false);
    expect(isInstanceControlPlaneRouteSafePath("/api")).toBe(false);
    expect(isInstanceControlPlaneRouteSafePath("/api/jobs")).toBe(false);
    expect(isInstanceControlPlaneRouteSafePath("/formless")).toBe(false);
    expect(isInstanceControlPlaneRouteSafePath("/formless/auth")).toBe(false);
  });

  it("canonicalizes reviewable control-plane records", () => {
    expect(
      reviewableInstanceControlPlaneRecords(controlPlaneRecords({ observedCache: true })).find(
        (record) => record.entity === "deployment-config",
      )?.values,
    ).not.toHaveProperty("observedStatus");

    expect(() =>
      reviewableInstanceControlPlaneRecords(controlPlaneRecords({ accountId: "CF_API_TOKEN" })),
    ).toThrow("cannot store control-plane secret values");
  });
});
function operationInputKeys(schema: AppSchema, entityKey: string, operationKey: string): string[] {
  const entity = schema.entities.find((definition) => definition.key === entityKey);
  const operation = entity?.operations?.find((definition) => definition.key === operationKey);
  return operation?.input?.fields?.map(({ key }) => key) ?? [];
}
function definitionRecord<T extends object>(
  definitions: readonly T[],
  identity: keyof T = "key" as keyof T,
) {
  return Object.fromEntries(
    definitions.map((definition) => {
      const value = { ...definition };
      const key = value[identity];
      delete value[identity];
      return [String(key), value];
    }),
  );
}
function storedRouteRecord(input: {
  id: string;
  values: Record<string, boolean | string>;
}): StoredRecord {
  const now = "2026-05-28T00:00:00.000Z";

  return {
    id: input.id,
    entity: "route",
    values: input.values,
    createdAt: now,
    updatedAt: now,
  };
}

function storedAdminRouteRecord(input: {
  enabled?: boolean;
  id: string;
  matchHost?: string;
  surface?: "admin" | undefined;
}): StoredRecord {
  const surface = Object.prototype.hasOwnProperty.call(input, "surface") ? input.surface : "admin";

  return storedRouteRecord({
    id: input.id,
    values: {
      enabled: input.enabled ?? true,
      ...(input.matchHost === undefined ? {} : { matchHost: input.matchHost }),
      matchPath: "/",
      matchPrefix: "/",
      kind: "mount",
      targetProfile: "instance",
      ...(surface === undefined ? {} : { surface }),
      access: "owner",
    },
  });
}

function storedInstanceSettingsRecord(values: Record<string, string>): StoredRecord {
  const now = "2026-05-28T00:00:00.000Z";

  return {
    id: "settings:instance",
    entity: "instance-settings",
    values: {
      settingsId: INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID,
      productionIdentityStatus: "unconfigured",
      ...values,
    },
    createdAt: now,
    updatedAt: now,
  };
}

function controlPlaneRecords(
  options: {
    accountId?: string;
    emailIntent?: boolean;
    observedCache?: boolean;
  } = {},
): StoredRecord[] {
  const now = "2026-05-28T00:00:00.000Z";
  return [
    {
      id: "route:program:public-site",
      entity: "route",
      values: {
        enabled: true,
        matchPath: "/pages",
        matchPrefix: "/pages/",
        kind: "mount",
        targetProfile: "public-site",
        surface: "public-site",
      },
      createdAt: now,
      updatedAt: now,
    },
    ...(options.emailIntent
      ? [
          {
            id: "route:host:public-site:www.example.com",
            entity: "route",
            values: {
              enabled: true,
              matchHost: "www.example.com",
              matchPath: "/",
              matchPrefix: "/",
              kind: "mount",
              targetProfile: "public-site",
              surface: "public-site",
              access: "anonymous",
              deploymentConfig: "instance.primary",
            },
            createdAt: now,
            updatedAt: now,
          },
          {
            id: "settings:instance",
            entity: "instance-settings",
            values: {
              settingsId: INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID,
              primaryRoute: "route:host:public-site:www.example.com",
              authRelyingPartyId: "example.com",
              authRelyingPartyName: "Example Instance",
              defaultEmailDomain: "email-domain:mail.example.com",
              defaultContactSender: "email-sender:contact@mail.example.com",
              defaultAuthSender: "email-sender:auth@mail.example.com",
              contactNotificationRecipient: "owner@example.com",
              productionIdentityStatus: "configured",
            },
            createdAt: now,
            updatedAt: now,
          },
          {
            id: "email-domain:mail.example.com",
            entity: "email-domain",
            values: {
              enabled: true,
              providerFamily: "cloudflare",
              domain: "mail.example.com",
              primaryRoute: "route:host:public-site:www.example.com",
              deploymentConfig: "instance.primary",
              dnsStatus: "verified",
            },
            createdAt: now,
            updatedAt: now,
          },
          {
            id: "email-sender:contact@mail.example.com",
            entity: "email-sender",
            values: {
              enabled: true,
              address: "contact@mail.example.com",
              displayName: "Contact",
              purpose: "contact-notification",
              emailDomain: "email-domain:mail.example.com",
            },
            createdAt: now,
            updatedAt: now,
          },
          {
            id: "email-sender:auth@mail.example.com",
            entity: "email-sender",
            values: {
              enabled: true,
              address: "auth@mail.example.com",
              displayName: "Auth",
              purpose: "auth",
              emailDomain: "email-domain:mail.example.com",
            },
            createdAt: now,
            updatedAt: now,
          },
        ]
      : []),
    {
      id: "instance.primary",
      entity: "deployment-config",
      values: {
        targetId: "instance.primary",
        label: "instance.primary",
        enabled: true,
        targetUrl: "https://personal.dpeek.workers.dev",
        providerFamily: "cloudflare",
        ...(options.accountId === undefined ? {} : { accountId: options.accountId }),
        ...(options.observedCache
          ? {
              observedAt: now,
              observedDesiredStateHash:
                "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              observedError: "none",
              observedRunnerId: "local-gateway",
              observedStatus: "deployed",
              observedSummary: "Deployed revision 2",
            }
          : {}),
      },
      createdAt: now,
      updatedAt: now,
    },
  ];
}
