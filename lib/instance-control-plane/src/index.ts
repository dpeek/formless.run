import {
  CONTROL_PLANE_DEPLOYMENT_CONFIG_OBSERVED_FIELDS,
  type ControlPlaneDeploymentConfigObservedStatus,
  type DeployDeploymentObservationFailureCode,
} from "@dpeek/formless-deploy";
import {
  composeAppSchema,
  defineAppSchemaModule,
  formatQualifiedEntityName,
  isRuntimeControlPlaneObservedField,
  isRuntimeControlPlaneSecretReferenceField,
  isValidStoredFieldValue,
  parseAppSchema,
  parseQualifiedEntityName,
} from "@dpeek/formless-schema";
import type {
  AccessRequirement,
  AppSchema,
  FieldEditor,
  FieldSchema,
  ToManyRelationshipSchema,
  ToOneRelationshipSchema,
  ViewFieldBindingSchema,
} from "@dpeek/formless-schema";
import { type RecordValues, type StoredRecord } from "@dpeek/formless-storage";
export * from "./types.ts";

export const INSTANCE_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY = "instance";
export const INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID = "instance";

export const instanceControlPlaneEntityNames = [
  "route",
  "deployment-config",
  "instance-settings",
  "email-domain",
  "email-sender",
] as const;

export type InstanceControlPlaneEntityName = (typeof instanceControlPlaneEntityNames)[number];

export function isInstanceControlPlaneEntityName(
  value: string,
): value is InstanceControlPlaneEntityName {
  return instanceControlPlaneEntityNames.includes(value as InstanceControlPlaneEntityName);
}

export function formatInstanceControlPlaneBoundaryEntityName(
  entityName: InstanceControlPlaneEntityName,
): string {
  return formatQualifiedEntityName({
    schemaKey: INSTANCE_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY,
    entityKey: entityName,
  });
}

export function parseInstanceControlPlaneBoundaryEntityName(
  context: string,
  value: string,
): InstanceControlPlaneEntityName {
  const qualifiedName = parseQualifiedEntityName(context, value);

  if (qualifiedName.schemaKey !== INSTANCE_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY) {
    throw new Error(
      `${context} schema key must be "${INSTANCE_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY}".`,
    );
  }

  if (!isInstanceControlPlaneEntityName(qualifiedName.entityKey)) {
    throw new Error(`${context} "${value}" is not an instance control-plane entity.`);
  }

  return qualifiedName.entityKey;
}

export type InstanceControlPlaneRecord<Entity extends InstanceControlPlaneEntityName, Values> = {
  createdAt: string;
  deletedAt?: string;
  entity: Entity;
  id: string;
  updatedAt: string;
  values: Values;
};

export type InstanceControlPlaneProjectionRecord = {
  createdAt: string;
  deletedAt?: string;
  entity: string;
  id: string;
  updatedAt: string;
  values: Readonly<Record<string, unknown>>;
};

export type InstanceControlPlaneRouteKind = "mount" | "redirect";
export type InstanceControlPlaneRouteSurface = "admin" | "public-site";
export type InstanceControlPlaneRouteTargetProfile = "instance" | "public-site";
export type InstanceControlPlaneRouteAccess =
  | "anonymous"
  | "authenticated"
  | "management"
  | "owner";

export type InstanceControlPlaneRouteValues = {
  enabled: boolean;
  matchHost?: string;
  matchPath: `/${string}`;
  matchPrefix?: `/${string}`;
  kind: InstanceControlPlaneRouteKind;
  targetProfile?: InstanceControlPlaneRouteTargetProfile;
  surface?: InstanceControlPlaneRouteSurface;
  access?: InstanceControlPlaneRouteAccess;
  deploymentConfig?: string;
  toHost?: string;
  toUrl?: string;
  statusCode?: InstanceControlPlaneRedirectStatusCode;
  preservePath?: boolean;
  preserveQueryString?: boolean;
};

export type InstanceControlPlaneProviderFamily = "cloudflare";

export type InstanceControlPlaneDeploymentConfigObservedStatus =
  ControlPlaneDeploymentConfigObservedStatus;

export const instanceControlPlaneDeploymentConfigObservedFields =
  CONTROL_PLANE_DEPLOYMENT_CONFIG_OBSERVED_FIELDS;

export type InstanceControlPlaneDeploymentConfigValues = {
  targetId: string;
  label: string;
  enabled: boolean;
  targetUrl: string;
  providerFamily: InstanceControlPlaneProviderFamily;
  accountId?: string;
  workerName?: string;
  credentialRef?: string;
  observedStatus?: InstanceControlPlaneDeploymentConfigObservedStatus;
  observedAt?: string;
  observedDesiredStateHash?: string;
  observedFailureCode?: DeployDeploymentObservationFailureCode;
};

export type InstanceControlPlaneProductionIdentityStatus = "configured" | "unconfigured";
export type InstanceControlPlaneEmailDnsStatus = "failed" | "pending" | "unconfigured" | "verified";
export type InstanceControlPlaneEmailSenderPurpose = "auth" | "contact-notification" | "system";

export type InstanceControlPlaneInstanceSettingsValues = {
  settingsId: typeof INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID;
  canonicalOrigin?: string;
  primaryRoute?: string;
  adminRoute?: string;
  authRoute?: string;
  authOrigin?: string;
  authRelyingPartyId?: string;
  authRelyingPartyName?: string;
  defaultEmailDomain?: string;
  defaultContactSender?: string;
  defaultAuthSender?: string;
  contactNotificationRecipient?: string;
  productionIdentityStatus: InstanceControlPlaneProductionIdentityStatus;
};

export type InstanceControlPlaneEmailDomainValues = {
  enabled: boolean;
  providerFamily: InstanceControlPlaneProviderFamily;
  domain: string;
  primaryRoute?: string;
  deploymentConfig?: string;
  dnsStatus?: InstanceControlPlaneEmailDnsStatus;
  latestError?: string;
};

export type InstanceControlPlaneEmailSenderValues = {
  enabled: boolean;
  address: string;
  displayName?: string;
  purpose: InstanceControlPlaneEmailSenderPurpose;
  emailDomain: string;
};

export type InstanceControlPlaneProductionIdentity = {
  authOrigin: string;
  canonicalOrigin: string;
  primaryRoute?: string;
  relyingPartyId: string;
  relyingPartyName?: string;
};

export type InstanceControlPlanePreferredAdminOriginSource =
  | "adminRoute"
  | "primaryRoute"
  | "singleCustomAdminRoute"
  | "deploymentTargetUrl";

export type InstanceControlPlanePreferredAdminRouteCandidate = {
  adminOrigin: string;
  matchHost: string;
  routeId: string;
};

export type InstanceControlPlanePreferredAdminOriginResolution =
  | {
      adminOrigin: string;
      routeId: string;
      source: Exclude<InstanceControlPlanePreferredAdminOriginSource, "deploymentTargetUrl">;
      status: "resolved";
    }
  | {
      adminOrigin: string;
      source: "deploymentTargetUrl";
      status: "resolved";
    }
  | {
      candidateRoutes: InstanceControlPlanePreferredAdminRouteCandidate[];
      status: "ambiguous";
    }
  | {
      status: "unconfigured";
    };

export type InstanceControlPlaneRedirectStatusCode = "301" | "302" | "303" | "307" | "308";

export type InstanceControlPlaneRecordValuesByEntity = {
  "deployment-config": InstanceControlPlaneDeploymentConfigValues;
  "email-domain": InstanceControlPlaneEmailDomainValues;
  "email-sender": InstanceControlPlaneEmailSenderValues;
  "instance-settings": InstanceControlPlaneInstanceSettingsValues;
  route: InstanceControlPlaneRouteValues;
};

type InstanceControlPlaneTableField = string;

type InstanceControlPlaneViewField =
  | string
  | {
      field: string;
      visibleWhen?: {
        field: string;
        values: Array<string | boolean | number>;
      };
    };
type InstanceControlPlaneQueryValue =
  | string
  | boolean
  | number
  | {
      kind: "context";
      name: string;
    };
type InstanceControlPlaneCollectionContext = NonNullable<
  Extract<
    AppSchema["views"][number],
    {
      type: "collection";
    }
  >["context"]
>;
export type AnyInstanceControlPlaneRecord = {
  [Entity in InstanceControlPlaneEntityName]: InstanceControlPlaneRecord<
    Entity,
    InstanceControlPlaneRecordValuesByEntity[Entity]
  >;
}[InstanceControlPlaneEntityName];

export const instanceControlPlaneImmutableFields = {
  "deployment-config": ["targetId", "providerFamily"],
  "email-domain": ["providerFamily"],
  "email-sender": ["emailDomain"],
  "instance-settings": ["settingsId"],
  route: ["kind"],
} as const satisfies Record<InstanceControlPlaneEntityName, readonly string[]>;

export const instanceControlPlaneReservedRoutePaths = [
  "/api",
  "/assets",
  "/favicon.ico",
  "/favicon.svg",
  "/formless",
  "/login",
  "/robots.txt",
  "/schema",
  "/setup",
  "/sitemap.xml",
  "/static",
] as const;
export const instanceControlPlaneRecordSchemaModule = defineAppSchemaModule({
  key: "instance-control-plane-records",
  runtimeRequirements: {
    shared: {
      recordAdapters: ["instance-control-plane.records"],
      createIdContributions: ["instance-control-plane.create-id"],
    },
  },
  entities: [
    {
      id: "entity_6f9905f7-05cd-41b1-a233-148b1718c6f0",
      key: "route",
      label: "Route",
      fields: [
        {
          key: "enabled",
          ...booleanField("Enabled", true),
        },
        {
          key: "matchHost",
          ...optionalTextField("Match host"),
        },
        {
          key: "matchPath",
          ...textField("Match path"),
        },
        {
          key: "matchPrefix",
          ...optionalTextField("Match prefix"),
        },
        {
          key: "kind",
          ...enumField("Kind", {
            mount: "Mount",
            redirect: "Redirect",
          }),
        },
        {
          key: "targetProfile",
          ...optionalEnumField("Target profile", {
            instance: "Instance",
            "public-site": "Public Site",
          }),
        },
        {
          key: "surface",
          ...optionalEnumField("Surface", {
            admin: "Admin",
            "public-site": "Public Site",
          }),
        },
        {
          key: "access",
          ...optionalEnumField("Access", {
            anonymous: "Anonymous",
            authenticated: "Authenticated",
            management: "Management",
            owner: "Owner",
          }),
        },
        {
          key: "deploymentConfig",
          ...optionalReferenceField("Deployment config", "deployment-config", "label"),
        },
        {
          key: "toHost",
          ...optionalTextField("To host"),
        },
        {
          key: "toUrl",
          ...optionalTextField("To URL", "href"),
        },
        {
          key: "statusCode",
          ...optionalEnumField("Status code", {
            "301": "301",
            "302": "302",
            "303": "303",
            "307": "307",
            "308": "308",
          }),
        },
        {
          key: "preservePath",
          ...optionalBooleanField("Preserve path", true),
        },
        {
          key: "preserveQueryString",
          ...optionalBooleanField("Preserve query string", true),
        },
      ],
      operations: writeOperations("Route", [
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
      ]),
    },
    {
      id: "entity_726ab70a-10a0-404b-8489-757a7b6c7aca",
      key: "deployment-config",
      label: "Deployment config",
      fields: [
        {
          key: "targetId",
          ...textField("Target id"),
        },
        {
          key: "label",
          ...textField("Label"),
        },
        {
          key: "enabled",
          ...booleanField("Enabled", true),
        },
        {
          key: "targetUrl",
          ...textField("Target URL", "href"),
        },
        {
          key: "providerFamily",
          ...enumField("Provider", { cloudflare: "Cloudflare" }),
        },
        {
          key: "accountId",
          ...optionalTextField("Account id"),
        },
        {
          key: "workerName",
          ...optionalTextField("Worker name"),
        },
        {
          key: "credentialRef",
          ...optionalTextField("Credential ref"),
        },
        {
          key: "observedStatus",
          ...optionalEnumField("Observed status", {
            deployed: "Deployed",
            drifted: "Drifted",
            failed: "Failed",
            "in-sync": "In sync",
            unknown: "Unknown",
          }),
        },
        {
          key: "observedAt",
          ...optionalTextField("Observed at"),
        },
        {
          key: "observedDesiredStateHash",
          ...optionalTextField("Observed desired-state hash"),
        },
        {
          key: "observedFailureCode",
          ...optionalEnumField("Observed failure code", {
            "provider-reconciliation-failed": "Provider reconciliation failed",
          }),
        },
      ],
      operations: writeOperations(
        "Deployment config",
        [
          "targetId",
          "label",
          "enabled",
          "targetUrl",
          "providerFamily",
          "accountId",
          "workerName",
          "credentialRef",
        ],
        {
          updateFields: [
            "targetId",
            "label",
            "enabled",
            "targetUrl",
            "providerFamily",
            "accountId",
            "workerName",
            "credentialRef",
            "observedStatus",
            "observedAt",
            "observedDesiredStateHash",
            "observedFailureCode",
          ],
        },
      ),
      constraints: [{ key: "uniqueTargetId", kind: "unique", fields: ["targetId"] }],
    },
    {
      id: "entity_1a429b35-c2e8-4ba7-8d31-18570948de4b",
      key: "instance-settings",
      label: "Instance settings",
      fields: [
        {
          key: "settingsId",
          ...textField("Settings id"),
        },
        {
          key: "canonicalOrigin",
          ...optionalTextField("Canonical origin", "href"),
        },
        {
          key: "primaryRoute",
          ...optionalReferenceField("Primary route", "route", "matchHost"),
        },
        {
          key: "adminRoute",
          ...optionalReferenceField("Admin route", "route", "matchHost"),
        },
        {
          key: "authRoute",
          ...optionalReferenceField("Auth route", "route", "matchHost"),
        },
        {
          key: "authOrigin",
          ...optionalTextField("Auth origin", "href"),
        },
        {
          key: "authRelyingPartyId",
          ...optionalTextField("Auth relying-party id"),
        },
        {
          key: "authRelyingPartyName",
          ...optionalTextField("Auth relying-party name"),
        },
        {
          key: "defaultEmailDomain",
          ...optionalReferenceField("Default email domain", "email-domain", "domain"),
        },
        {
          key: "defaultContactSender",
          ...optionalReferenceField("Default contact sender", "email-sender", "address"),
        },
        {
          key: "defaultAuthSender",
          ...optionalReferenceField("Default auth sender", "email-sender", "address"),
        },
        {
          key: "contactNotificationRecipient",
          ...optionalTextField("Contact notification recipient"),
        },
        {
          key: "productionIdentityStatus",
          ...enumField(
            "Production identity status",
            {
              configured: "Configured",
              unconfigured: "Unconfigured",
            },
            "unconfigured",
          ),
        },
      ],
      operations: writeOperations(
        "Instance settings",
        [
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
        ],
        {
          access: {
            anyOf: [{ actor: "owner" }, { actor: "adminBearer" }],
          },
          updateFields: [
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
          ],
        },
      ),
    },
    {
      id: "entity_4df3b716-c71a-4714-86d7-45728f94daa8",
      key: "email-domain",
      label: "Email domain",
      fields: [
        {
          key: "enabled",
          ...booleanField("Enabled", true),
        },
        {
          key: "providerFamily",
          ...enumField("Provider", { cloudflare: "Cloudflare" }),
        },
        {
          key: "domain",
          ...textField("Domain"),
        },
        {
          key: "primaryRoute",
          ...optionalReferenceField("Primary route", "route", "matchHost"),
        },
        {
          key: "deploymentConfig",
          ...optionalReferenceField("Deployment config", "deployment-config", "label"),
        },
        {
          key: "dnsStatus",
          ...optionalEnumField("DNS status", {
            failed: "Failed",
            pending: "Pending",
            unconfigured: "Unconfigured",
            verified: "Verified",
          }),
        },
        {
          key: "latestError",
          ...optionalTextField("Latest error", "longText"),
        },
      ],
      operations: writeOperations(
        "Email domain",
        [
          "enabled",
          "providerFamily",
          "domain",
          "primaryRoute",
          "deploymentConfig",
          "dnsStatus",
          "latestError",
        ],
        {
          updateFields: [
            "enabled",
            "domain",
            "primaryRoute",
            "deploymentConfig",
            "dnsStatus",
            "latestError",
          ],
        },
      ),
    },
    {
      id: "entity_cabf8d1e-002f-427d-8c46-1da32e1641c2",
      key: "email-sender",
      label: "Email sender",
      fields: [
        {
          key: "enabled",
          ...booleanField("Enabled", true),
        },
        {
          key: "address",
          ...textField("Address"),
        },
        {
          key: "displayName",
          ...optionalTextField("Display name"),
        },
        {
          key: "purpose",
          ...enumField("Purpose", {
            "contact-notification": "Contact notification",
            auth: "Auth messages",
            system: "System",
          }),
        },
        {
          key: "emailDomain",
          ...referenceField("Email domain", "email-domain", "domain"),
        },
      ],
      operations: writeOperations(
        "Email sender",
        ["enabled", "address", "displayName", "purpose", "emailDomain"],
        {
          updateFields: ["enabled", "address", "displayName", "purpose"],
        },
      ),
    },
  ],
  relationships: [
    {
      key: "routeDeploymentConfig",
      ...toOne(
        "Route deployment config",
        "route",
        "deploymentConfig",
        "deployment-config",
        "deploymentConfigRoutes",
      ),
    },
    {
      key: "settingsPrimaryRoute",
      ...toOne("Settings primary route", "instance-settings", "primaryRoute", "route"),
    },
    {
      key: "settingsAdminRoute",
      ...toOne("Settings admin route", "instance-settings", "adminRoute", "route"),
    },
    {
      key: "settingsAuthRoute",
      ...toOne("Settings auth route", "instance-settings", "authRoute", "route"),
    },
    {
      key: "settingsDefaultEmailDomain",
      ...toOne(
        "Settings default email domain",
        "instance-settings",
        "defaultEmailDomain",
        "email-domain",
      ),
    },
    {
      key: "settingsDefaultContactSender",
      ...toOne(
        "Settings default contact sender",
        "instance-settings",
        "defaultContactSender",
        "email-sender",
      ),
    },
    {
      key: "settingsDefaultAuthSender",
      ...toOne(
        "Settings default auth sender",
        "instance-settings",
        "defaultAuthSender",
        "email-sender",
      ),
    },
    {
      key: "emailDomainPrimaryRoute",
      ...toOne("Email domain primary route", "email-domain", "primaryRoute", "route"),
    },
    {
      key: "emailDomainDeploymentConfig",
      ...toOne(
        "Email domain deployment config",
        "email-domain",
        "deploymentConfig",
        "deployment-config",
        "deploymentConfigEmailDomains",
      ),
    },
    {
      key: "emailSenderDomain",
      ...toOne(
        "Email sender domain",
        "email-sender",
        "emailDomain",
        "email-domain",
        "emailDomainSenders",
      ),
    },
    {
      key: "deploymentConfigRoutes",
      ...toMany(
        "Deployment config routes",
        "deployment-config",
        "route",
        "deploymentConfig",
        "routeDeploymentConfig",
      ),
    },
    {
      key: "deploymentConfigEmailDomains",
      ...toMany(
        "Deployment config email domains",
        "deployment-config",
        "email-domain",
        "deploymentConfig",
        "emailDomainDeploymentConfig",
      ),
    },
    {
      key: "emailDomainSenders",
      ...toMany(
        "Email domain senders",
        "email-domain",
        "email-sender",
        "emailDomain",
        "emailSenderDomain",
      ),
    },
  ],
  queries: [
    {
      key: "routeAll",
      ...allQuery("Routes", "route"),
    },
    {
      key: "routeEnabled",
      ...whereQuery("Enabled routes", "route", "enabled", true),
    },
    {
      key: "routeMount",
      ...whereQuery("Mounts", "route", "kind", "mount"),
    },
    {
      key: "routeHostMapping",
      ...andWhereQuery("Host mappings", "route", [
        { field: "kind", value: "mount" },
        { field: "matchPath", value: "/" },
      ]),
    },
    {
      key: "routeRedirect",
      ...whereQuery("Redirects", "route", "kind", "redirect"),
    },
    {
      key: "routeInstanceMount",
      ...whereQuery("Instance paths", "route", "targetProfile", "instance"),
    },
    {
      key: "routePublicSiteMount",
      ...whereQuery("Public Site routes", "route", "targetProfile", "public-site"),
    },
    {
      key: "routesForSelectedDeploymentConfig",
      ...whereQuery("Selected deployment config", "route", "deploymentConfig", {
        kind: "context",
        name: "deploymentConfig",
      }),
    },
    {
      key: "deploymentConfigAll",
      ...allQuery("Deployment configs", "deployment-config"),
    },
    {
      key: "deploymentConfigEnabled",
      ...whereQuery("Enabled deployment configs", "deployment-config", "enabled", true),
    },
    {
      key: "instanceSettingsAll",
      ...allQuery("Instance settings", "instance-settings"),
    },
    {
      key: "emailDomainAll",
      ...allQuery("Email domains", "email-domain"),
    },
    {
      key: "emailDomainEnabled",
      ...whereQuery("Enabled email domains", "email-domain", "enabled", true),
    },
    {
      key: "emailSenderAll",
      ...allQuery("Email senders", "email-sender"),
    },
    {
      key: "emailSenderEnabled",
      ...whereQuery("Enabled email senders", "email-sender", "enabled", true),
    },
  ],
  runtime: {
    controlPlane: {
      entities: {
        route: {
          immutableFields: [...instanceControlPlaneImmutableFields.route],
        },
        "deployment-config": {
          immutableFields: [...instanceControlPlaneImmutableFields["deployment-config"]],
          observedFields: [...instanceControlPlaneDeploymentConfigObservedFields],
          secretReferenceFields: ["credentialRef"],
        },
        "instance-settings": {
          immutableFields: [...instanceControlPlaneImmutableFields["instance-settings"]],
        },
        "email-domain": {
          immutableFields: [...instanceControlPlaneImmutableFields["email-domain"]],
        },
        "email-sender": {
          immutableFields: [...instanceControlPlaneImmutableFields["email-sender"]],
        },
      },
    },
  },
});

export const instanceControlPlanePresentationSchemaModule = defineAppSchemaModule({
  key: "instance-control-plane-presentation",
  requires: ["instance-control-plane-records"],
  tableViews: [
    {
      key: "routeTable",
      ...tableView(
        "route",
        [
          "enabled",
          "matchHost",
          "matchPath",
          "matchPrefix",
          "kind",
          "targetProfile",
          "surface",
          "access",
          "toHost",
          "toUrl",
          "statusCode",
        ],
        {
          operations: [
            {
              operation: "route.update",
              label: "Edit route",
              target: { kind: "row" },
              editView: "routeEdit",
            },
          ],
        },
      ),
    },
  ],
  views: [
    {
      key: "routeCreate",
      ...createView("route", [
        "enabled",
        "matchHost",
        "matchPath",
        "matchPrefix",
        "kind",
        { field: "targetProfile", visibleWhen: { field: "kind", values: ["mount"] } },
        {
          field: "surface",
          visibleWhen: { field: "targetProfile", values: ["instance", "public-site"] },
        },
        { field: "access", visibleWhen: { field: "kind", values: ["mount"] } },
        { field: "toHost", visibleWhen: { field: "kind", values: ["redirect"] } },
        { field: "toUrl", visibleWhen: { field: "kind", values: ["redirect"] } },
        { field: "statusCode", visibleWhen: { field: "kind", values: ["redirect"] } },
        { field: "preservePath", visibleWhen: { field: "kind", values: ["redirect"] } },
        { field: "preserveQueryString", visibleWhen: { field: "kind", values: ["redirect"] } },
      ]),
    },
    {
      key: "routeEdit",
      ...editView("route", [
        "enabled",
        "matchHost",
        "matchPath",
        "matchPrefix",
        { field: "targetProfile", visibleWhen: { field: "kind", values: ["mount"] } },
        {
          field: "surface",
          visibleWhen: { field: "targetProfile", values: ["instance", "public-site"] },
        },
        { field: "access", visibleWhen: { field: "kind", values: ["mount"] } },
        { field: "toHost", visibleWhen: { field: "kind", values: ["redirect"] } },
        { field: "toUrl", visibleWhen: { field: "kind", values: ["redirect"] } },
        { field: "statusCode", visibleWhen: { field: "kind", values: ["redirect"] } },
        { field: "preservePath", visibleWhen: { field: "kind", values: ["redirect"] } },
        { field: "preserveQueryString", visibleWhen: { field: "kind", values: ["redirect"] } },
      ]),
    },
    {
      key: "routeList",
      ...collectionView("Routes", "route", "routeAll", "routeTable", {
        createView: "routeCreate",
        navigation: true,
      }),
    },
  ],
});

export const instanceControlPlaneRoutesScreenSchemaModule = defineAppSchemaModule({
  key: "instance-control-plane-routes-screen",
  requires: [instanceControlPlanePresentationSchemaModule.key],
  screens: [
    {
      key: "routes",
      type: "workspace",
      label: "Routes",
      path: "/routes",
      layout: {
        type: "stack",
        sections: [{ id: "routes", type: "collection", view: "routeList" }],
      },
    },
  ],
});

export const instanceControlPlaneSourceSchema = composeAppSchema({
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
    instanceControlPlaneRoutesScreenSchemaModule,
  ],
  runtime: {
    owner: "runtime",
  },
});

export const instanceControlPlaneSchema = parseAppSchema(instanceControlPlaneSourceSchema);
export const instanceControlPlaneEntityIds = instanceControlPlaneSchema.entities.map(
  ({ id }) => id,
);

function stringControlPlaneValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function isInstanceControlPlaneRouteSafePath(path: string): path is `/${string}` {
  if (!/^\/[a-z0-9._~-]+(?:\/[a-z0-9._~-]+)*$/.test(path)) {
    return false;
  }

  return !instanceControlPlaneReservedRoutePaths.some(
    (reservedPath) => path === reservedPath || path.startsWith(`${reservedPath}/`),
  );
}
export function instanceControlPlaneDefaultRouteAccess(
  route: Pick<InstanceControlPlaneRouteValues, "kind"> &
    Partial<Pick<InstanceControlPlaneRouteValues, "surface" | "targetProfile">>,
): InstanceControlPlaneRouteAccess {
  if (route.kind === "mount") {
    if (route.targetProfile === "public-site" || route.surface === "public-site") {
      return "anonymous";
    }

    if (route.targetProfile === "instance") {
      return "management";
    }
  }

  return "owner";
}

export function instanceControlPlaneEffectiveRouteAccess(
  route: Pick<InstanceControlPlaneRouteValues, "kind"> &
    Partial<Pick<InstanceControlPlaneRouteValues, "access" | "surface" | "targetProfile">>,
): InstanceControlPlaneRouteAccess {
  return route.access ?? instanceControlPlaneDefaultRouteAccess(route);
}

export function instanceControlPlaneProductionIdentityFromRecords(
  records: readonly InstanceControlPlaneProjectionRecord[],
): InstanceControlPlaneProductionIdentity | undefined {
  const activeRecords = records.filter((record) => record.deletedAt === undefined);
  const settings = activeRecords.find((record) => record.entity === "instance-settings");

  if (!settings) {
    return undefined;
  }

  const primaryRoute = stringControlPlaneValue(settings.values.primaryRoute);
  const authRoute = stringControlPlaneValue(settings.values.authRoute);
  const routeRecord =
    activeRecords.find((record) => record.id === (authRoute ?? primaryRoute)) ??
    activeRecords.find((record) => record.id === primaryRoute);
  const routeOrigin = routeRecord ? productionOriginForRouteRecord(routeRecord) : undefined;
  const canonicalOrigin = normalizeInstanceControlPlaneOrigin(
    stringControlPlaneValue(settings.values.canonicalOrigin) ?? routeOrigin,
  );
  const authOrigin = normalizeInstanceControlPlaneOrigin(
    stringControlPlaneValue(settings.values.authOrigin) ?? canonicalOrigin,
  );

  if (canonicalOrigin === undefined || authOrigin === undefined) {
    return undefined;
  }

  const relyingPartyId = normalizeInstanceControlPlaneRelyingPartyId(
    stringControlPlaneValue(settings.values.authRelyingPartyId) ??
      new URL(authOrigin).hostname.toLowerCase(),
    { canonicalOrigin: authOrigin },
  );
  const relyingPartyName = stringControlPlaneValue(settings.values.authRelyingPartyName);

  if (relyingPartyId === undefined) {
    return undefined;
  }

  return {
    authOrigin,
    canonicalOrigin,
    ...(primaryRoute === undefined ? {} : { primaryRoute }),
    relyingPartyId,
    ...(relyingPartyName === undefined ? {} : { relyingPartyName }),
  };
}

export function instanceControlPlanePreferredAdminOriginFromRecords(input: {
  deploymentTargetUrl?: string;
  records: readonly InstanceControlPlaneProjectionRecord[];
}): InstanceControlPlanePreferredAdminOriginResolution {
  const activeRecords = input.records.filter((record) => record.deletedAt === undefined);
  const settings = activeRecords.find((record) => record.entity === "instance-settings");
  const adminRouteId = stringControlPlaneValue(settings?.values.adminRoute);
  const primaryRouteId = stringControlPlaneValue(settings?.values.primaryRoute);
  const adminRoutes = activeRecords
    .flatMap((record) => {
      const candidate = preferredAdminRouteCandidate(record);

      return candidate === undefined ? [] : [candidate];
    })
    .sort(comparePreferredAdminRouteCandidates);
  const adminRoutesById = new Map(adminRoutes.map((route) => [route.routeId, route]));
  const explicitAdminRoute =
    adminRouteId === undefined ? undefined : adminRoutesById.get(adminRouteId);

  if (explicitAdminRoute !== undefined) {
    return {
      adminOrigin: explicitAdminRoute.adminOrigin,
      routeId: explicitAdminRoute.routeId,
      source: "adminRoute",
      status: "resolved",
    };
  }

  const primaryAdminRoute =
    primaryRouteId === undefined ? undefined : adminRoutesById.get(primaryRouteId);

  if (primaryAdminRoute !== undefined) {
    return {
      adminOrigin: primaryAdminRoute.adminOrigin,
      routeId: primaryAdminRoute.routeId,
      source: "primaryRoute",
      status: "resolved",
    };
  }

  if (adminRoutes.length === 1) {
    const [adminRoute] = adminRoutes;

    return {
      adminOrigin: adminRoute.adminOrigin,
      routeId: adminRoute.routeId,
      source: "singleCustomAdminRoute",
      status: "resolved",
    };
  }

  if (adminRoutes.length > 1) {
    return { candidateRoutes: adminRoutes, status: "ambiguous" };
  }

  const deploymentTargetOrigin =
    input.deploymentTargetUrl === undefined
      ? undefined
      : normalizeInstanceControlPlaneTargetUrl(input.deploymentTargetUrl);

  if (deploymentTargetOrigin === undefined) {
    return { status: "unconfigured" };
  }

  return {
    adminOrigin: deploymentTargetOrigin,
    source: "deploymentTargetUrl",
    status: "resolved",
  };
}

export const instanceControlPlaneRecordSourceExcludedEntityNames = [
  "deploy-desired-resource",
  "deploy-target",
  "deploy-attempt",
  "deploy-evidence-summary",
  "deploy-drift-report",
  "provider-config-ref",
] as const;

export type InstanceControlPlaneRecordSourceExcludedEntityName =
  (typeof instanceControlPlaneRecordSourceExcludedEntityNames)[number];

export type InstanceControlPlaneRecordValidationOptions = {
  candidateRecords?: readonly StoredRecord[];
  context?: string;
  sourceLabel?: string;
};

export function parseInstanceControlPlaneRecords(context: string, value: unknown): StoredRecord[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array.`);
  }

  return value.map((record, index) =>
    parseInstanceControlPlaneRecord(`${context}[${index}]`, record),
  );
}

export function reviewableInstanceControlPlaneRecords(
  records: readonly StoredRecord[],
  options: InstanceControlPlaneRecordValidationOptions = {},
): StoredRecord[] {
  const context = options.context ?? "Instance control-plane record source records";
  const sourceLabel = options.sourceLabel ?? "Instance control-plane record source";
  const sourceRecords: StoredRecord[] = [];

  for (const record of records) {
    const entity = instanceControlPlaneRecordSourceEntityName(record.entity);

    if (entity !== undefined) {
      sourceRecords.push(
        canonicalInstanceControlPlaneRecord({
          ...record,
          entity,
          values: reviewableInstanceControlPlaneRecordValues(entity, record.values),
        }),
      );
      continue;
    }

    if (excludedInstanceControlPlaneRecordSourceEntityName(record.entity) !== undefined) {
      continue;
    }

    throw new Error(
      `${sourceLabel} does not support entity "${controlPlaneEntityLabel(record.entity)}".`,
    );
  }

  validateInstanceControlPlaneRecords(context, sourceRecords, options);

  return sourceRecords;
}

export function isCurrentInstanceControlPlaneRecord(record: unknown): boolean {
  if (!isPlainRecord(record) || typeof record.entity !== "string") {
    return false;
  }

  return instanceControlPlaneRecordSourceEntityName(record.entity) !== undefined;
}

export function validateInstanceControlPlaneRecords(
  context: string,
  records: readonly StoredRecord[],
  options: InstanceControlPlaneRecordValidationOptions = {},
) {
  const recordsById = new Map<string, StoredRecord>(
    (options.candidateRecords ?? records).map((record) => [record.id, record]),
  );
  const ownedRecordIds = new Set<string>();

  for (const record of records) {
    if (ownedRecordIds.has(record.id)) {
      throw new Error(`${context} includes duplicate control-plane record id "${record.id}".`);
    }

    ownedRecordIds.add(record.id);
  }

  for (const record of records) {
    validateInstanceControlPlaneRecord(context, record, recordsById);
  }

  validateInstanceControlPlaneUniqueConstraints(context, records);
  validateInstanceSettingsSingleton(context, records);
  assertInstanceControlPlaneRoutesAreValid(context, records);
}

export function reviewableInstanceControlPlaneRecordValues(
  entity: InstanceControlPlaneEntityName,
  values: RecordValues,
): RecordValues {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([fieldName]) =>
        fieldName !== "createdAt" &&
        fieldName !== "updatedAt" &&
        !isRuntimeControlPlaneObservedField(instanceControlPlaneSchema, entity, fieldName),
    ),
  ) as RecordValues;
}

export function parseInstanceControlPlaneEntityName(
  context: string,
  value: unknown,
): InstanceControlPlaneEntityName {
  const entity = parseNonEmptyString(context, value);

  if (isInstanceControlPlaneEntityName(entity)) {
    return entity;
  }

  return parseInstanceControlPlaneBoundaryEntityName(context, entity);
}

export function instanceControlPlaneRecordSourceEntityName(
  value: string,
): InstanceControlPlaneEntityName | undefined {
  const localEntity = value.startsWith(`${INSTANCE_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY}:`)
    ? tryParseBoundaryEntityName(value)
    : isInstanceControlPlaneEntityName(value)
      ? value
      : undefined;

  return localEntity !== undefined && isInstanceControlPlaneEntityName(localEntity)
    ? localEntity
    : undefined;
}

export function excludedInstanceControlPlaneRecordSourceEntityName(
  value: string,
): InstanceControlPlaneRecordSourceExcludedEntityName | undefined {
  const localEntity = value.startsWith(`${INSTANCE_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY}:`)
    ? tryParseBoundaryEntityName(value)
    : value;

  return localEntity !== undefined &&
    instanceControlPlaneRecordSourceExcludedEntityNames.includes(
      localEntity as InstanceControlPlaneRecordSourceExcludedEntityName,
    )
    ? (localEntity as InstanceControlPlaneRecordSourceExcludedEntityName)
    : undefined;
}

export function normalizeInstanceControlPlaneTargetUrl(value: string): string {
  try {
    const url = new URL(value);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("invalid protocol");
    }

    return url.origin;
  } catch {
    throw new Error(`Instance control-plane target URL is invalid: ${value}`);
  }
}

function parseInstanceControlPlaneRecord(context: string, value: unknown): StoredRecord {
  if (!isPlainRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(
    context,
    value,
    ["id", "entity", "values", "createdAt", "updatedAt"],
    ["deletedAt"],
  );

  const id = parseNonEmptyString(`${context} id`, value.id);
  const entity = parseInstanceControlPlaneEntityName(
    `${context} record "${id}" entity`,
    value.entity,
  );

  return {
    id,
    entity,
    values: parseRecordValues(`${context} values`, value.values),
    createdAt: parseIsoTimestamp(`${context} createdAt`, value.createdAt),
    updatedAt: parseIsoTimestamp(`${context} updatedAt`, value.updatedAt),
    ...(value.deletedAt === undefined
      ? {}
      : { deletedAt: parseIsoTimestamp(`${context} deletedAt`, value.deletedAt) }),
  };
}

function validateInstanceControlPlaneRecord(
  context: string,
  record: StoredRecord,
  recordsById: ReadonlyMap<string, StoredRecord>,
) {
  const entity = instanceControlPlaneRecordSourceEntityName(record.entity);

  if (entity === undefined) {
    throw new Error(
      `${context} record "${record.id}" references unknown entity "${controlPlaneEntityLabel(record.entity)}".`,
    );
  }
  const entitySchema = instanceControlPlaneSchema.entities.find(({ key }) => key === entity)!;
  const fields = entitySchema.fields;
  for (const fieldName of Object.keys(record.values)) {
    if (isRuntimeControlPlaneObservedField(instanceControlPlaneSchema, entity, fieldName)) {
      throw new Error(
        `${context} record "${record.id}" field "${controlPlaneFieldLabel(record, fieldName)}" cannot store runtime-observed deployment cache fields.`,
      );
    }
    if (!fields.some(({ key }) => key === fieldName)) {
      throw new Error(
        `${context} record "${record.id}" includes unknown field "${controlPlaneFieldLabel(record, fieldName)}".`,
      );
    }
  }
  assertControlPlaneRecordValuesAreReviewable(context, record);
  for (const field of fields) {
    const fieldName = field.key;
    const value = record.values[fieldName];
    if (!isValidStoredFieldValue(value, field)) {
      throw new Error(
        `${context} record "${record.id}" has invalid field "${controlPlaneFieldLabel(record, fieldName)}".`,
      );
    }

    if (field.type === "reference" && value !== undefined) {
      validateInstanceControlPlaneReference(
        context,
        record,
        fieldName,
        field.to,
        value,
        recordsById,
      );
    }
  }

  if (entity === "deployment-config") {
    validateDeploymentConfigImmutableIdentity(context, record);
  }

  if (entity === "instance-settings") {
    validateInstanceSettingsRecord(context, record, recordsById);
  }

  if (entity === "email-domain") {
    validateEmailDomainRecord(context, record, recordsById);
  }

  if (entity === "email-sender") {
    validateEmailSenderRecord(context, record, recordsById);
  }
}

function validateInstanceControlPlaneReference(
  context: string,
  record: StoredRecord,
  fieldName: string,
  entityName: string,
  value: RecordValues[string],
  recordsById: ReadonlyMap<string, StoredRecord>,
) {
  if (typeof value !== "string") {
    return;
  }

  const target = recordsById.get(value);

  if (!target) {
    throw new Error(
      `${context} record "${record.id}" field "${controlPlaneFieldLabel(record, fieldName)}" references unknown ${controlPlaneEntityLabel(entityName)} record "${value}".`,
    );
  }

  if (instanceControlPlaneRecordSourceEntityName(target.entity) !== entityName) {
    throw new Error(
      `${context} record "${record.id}" field "${controlPlaneFieldLabel(record, fieldName)}" must reference a ${controlPlaneEntityLabel(entityName)} record.`,
    );
  }

  if (target.deletedAt) {
    throw new Error(
      `${context} record "${record.id}" field "${controlPlaneFieldLabel(record, fieldName)}" cannot reference tombstoned record "${value}".`,
    );
  }
}

function validateInstanceControlPlaneUniqueConstraints(
  context: string,
  records: readonly StoredRecord[],
) {
  for (const entity of instanceControlPlaneSchema.entities) {
    const entityName = entity.key;
    const activeRecords = records.filter(
      (record) =>
        instanceControlPlaneRecordSourceEntityName(record.entity) === entityName &&
        !record.deletedAt,
    );
    const constraints = ("constraints" in entity ? entity.constraints : {}) as Record<
      string,
      {
        fields: readonly string[];
        kind: string;
      }
    >;
    for (const [constraintName, constraint] of Object.entries(constraints)) {
      if (constraint.kind !== "unique") {
        continue;
      }

      const seen = new Set<string>();

      for (const record of activeRecords) {
        const key = JSON.stringify(
          constraint.fields.map((fieldName) => record.values[fieldName] ?? null),
        );

        if (seen.has(key)) {
          throw new Error(
            `${context} violates unique constraint "${controlPlaneEntityLabel(entityName)}.${constraintName}".`,
          );
        }

        seen.add(key);
      }
    }
  }
}

function validateDeploymentConfigImmutableIdentity(context: string, record: StoredRecord) {
  const targetId = requiredStringValue(context, record, "targetId");
  const targetUrl = requiredStringValue(context, record, "targetUrl");

  if (record.id !== targetId) {
    throw new Error(
      `${context} record "${record.id}" field "${controlPlaneFieldLabel(record, "targetId")}" must match record id.`,
    );
  }

  if (targetUrl !== normalizeInstanceControlPlaneTargetUrl(targetUrl)) {
    throw new Error(
      `${context} record "${record.id}" field "${controlPlaneFieldLabel(record, "targetUrl")}" must be a normalized HTTP origin.`,
    );
  }
}

function validateInstanceSettingsSingleton(context: string, records: readonly StoredRecord[]) {
  const activeSettings = records.filter(
    (record) =>
      instanceControlPlaneRecordSourceEntityName(record.entity) === "instance-settings" &&
      !record.deletedAt,
  );

  if (activeSettings.length > 1) {
    throw new Error(
      `${context} must include at most one active instance:instance-settings record.`,
    );
  }
}

function validateInstanceSettingsRecord(
  context: string,
  record: StoredRecord,
  recordsById: ReadonlyMap<string, StoredRecord>,
) {
  const settingsId = requiredStringValue(context, record, "settingsId");
  const productionIdentityStatus = requiredStringValue(context, record, "productionIdentityStatus");
  const canonicalOrigin = optionalStringValue(context, record, "canonicalOrigin");
  const authOrigin = optionalStringValue(context, record, "authOrigin");
  const authRelyingPartyId = optionalStringValue(context, record, "authRelyingPartyId");
  const authRelyingPartyName = optionalStringValue(context, record, "authRelyingPartyName");
  const contactNotificationRecipient = optionalStringValue(
    context,
    record,
    "contactNotificationRecipient",
  );
  const primaryRoute = optionalStringValue(context, record, "primaryRoute");
  const adminRoute = optionalStringValue(context, record, "adminRoute");
  const authRoute = optionalStringValue(context, record, "authRoute");
  const defaultEmailDomain = optionalStringValue(context, record, "defaultEmailDomain");
  const defaultContactSender = optionalStringValue(context, record, "defaultContactSender");
  const defaultAuthSender = optionalStringValue(context, record, "defaultAuthSender");

  if (settingsId !== INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID) {
    throw new Error(
      `${context} record "${record.id}" field "${controlPlaneFieldLabel(record, "settingsId")}" must be "${INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID}".`,
    );
  }

  if (canonicalOrigin !== undefined) {
    assertNormalizedControlPlaneOrigin(context, record, "canonicalOrigin", canonicalOrigin);
  }

  if (authOrigin !== undefined) {
    assertNormalizedControlPlaneOrigin(context, record, "authOrigin", authOrigin);
  }

  if (authRelyingPartyId !== undefined) {
    assertControlPlaneRelyingPartyId(context, record, "authRelyingPartyId", authRelyingPartyId, {
      canonicalOrigin: authOrigin ?? canonicalOrigin,
    });
  }

  if (authRelyingPartyName !== undefined && authRelyingPartyName.trim() === "") {
    throw new Error(
      `${context} record "${record.id}" field "${controlPlaneFieldLabel(record, "authRelyingPartyName")}" must be non-empty when set.`,
    );
  }

  if (contactNotificationRecipient !== undefined) {
    assertControlPlaneEmailAddress(
      context,
      record,
      "contactNotificationRecipient",
      contactNotificationRecipient,
    );
  }

  if (primaryRoute !== undefined) {
    assertProductionRouteReference(context, record, "primaryRoute", primaryRoute, recordsById);
  }

  if (adminRoute !== undefined) {
    assertAdminRouteReference(context, record, "adminRoute", adminRoute, recordsById);
  }

  if (authRoute !== undefined) {
    assertProductionRouteReference(context, record, "authRoute", authRoute, recordsById);
  }

  if (
    productionIdentityStatus === "configured" &&
    canonicalOrigin === undefined &&
    authOrigin === undefined &&
    primaryRoute === undefined &&
    authRoute === undefined
  ) {
    throw new Error(
      `${context} record "${record.id}" field "${controlPlaneFieldLabel(record, "productionIdentityStatus")}" cannot be "configured" without a canonical origin or production route.`,
    );
  }

  if (defaultEmailDomain !== undefined) {
    assertActiveRecordEntity(
      context,
      record,
      "defaultEmailDomain",
      defaultEmailDomain,
      "email-domain",
      recordsById,
    );
  }

  validateDefaultEmailSenderReference(context, record, recordsById, {
    defaultEmailDomain,
    fieldName: "defaultContactSender",
    purpose: "contact-notification",
    senderId: defaultContactSender,
  });
  validateDefaultEmailSenderReference(context, record, recordsById, {
    defaultEmailDomain,
    fieldName: "defaultAuthSender",
    purpose: "auth",
    senderId: defaultAuthSender,
  });
}

function validateDefaultEmailSenderReference(
  context: string,
  record: StoredRecord,
  recordsById: ReadonlyMap<string, StoredRecord>,
  input: {
    defaultEmailDomain?: string;
    fieldName: "defaultAuthSender" | "defaultContactSender";
    purpose: InstanceControlPlaneEmailSenderPurpose;
    senderId?: string;
  },
) {
  if (input.senderId === undefined) {
    return;
  }

  const sender = assertActiveRecordEntity(
    context,
    record,
    input.fieldName,
    input.senderId,
    "email-sender",
    recordsById,
  );
  const senderDomain = optionalStringValue(context, sender, "emailDomain");
  const senderPurpose = optionalStringValue(context, sender, "purpose");

  if (senderPurpose !== input.purpose) {
    throw new Error(
      `${context} record "${record.id}" field "${controlPlaneFieldLabel(record, input.fieldName)}" must reference a sender with purpose "${input.purpose}".`,
    );
  }

  if (input.defaultEmailDomain !== undefined && senderDomain !== input.defaultEmailDomain) {
    throw new Error(
      `${context} record "${record.id}" field "${controlPlaneFieldLabel(record, input.fieldName)}" must reference a sender for the selected default email domain.`,
    );
  }
}

function validateEmailDomainRecord(
  context: string,
  record: StoredRecord,
  recordsById: ReadonlyMap<string, StoredRecord>,
) {
  const domain = requiredStringValue(context, record, "domain");
  const primaryRoute = optionalStringValue(context, record, "primaryRoute");

  assertNormalizedControlPlaneHost(context, record, "domain", domain);

  if (primaryRoute !== undefined) {
    assertProductionRouteReference(context, record, "primaryRoute", primaryRoute, recordsById);
  }
}

function validateEmailSenderRecord(
  context: string,
  record: StoredRecord,
  recordsById: ReadonlyMap<string, StoredRecord>,
) {
  const address = requiredStringValue(context, record, "address");
  const emailDomain = requiredStringValue(context, record, "emailDomain");
  const displayName = optionalStringValue(context, record, "displayName");
  const parsedAddress = parseControlPlaneEmailAddress(context, record, "address", address);
  const domainRecord = assertActiveRecordEntity(
    context,
    record,
    "emailDomain",
    emailDomain,
    "email-domain",
    recordsById,
  );
  const domain = requiredStringValue(context, domainRecord, "domain");

  if (!controlPlaneHostBelongsToDomain(parsedAddress.host, domain)) {
    throw new Error(
      `${context} record "${record.id}" field "${controlPlaneFieldLabel(record, "address")}" host must belong to referenced email domain "${domain}".`,
    );
  }

  if (displayName !== undefined && /[\r\n]/.test(displayName)) {
    throw new Error(
      `${context} record "${record.id}" field "${controlPlaneFieldLabel(record, "displayName")}" must not contain line breaks.`,
    );
  }
}

function assertInstanceControlPlaneRoutesAreValid(
  context: string,
  records: readonly StoredRecord[],
) {
  const routes = records.filter(
    (record) =>
      instanceControlPlaneRecordSourceEntityName(record.entity) === "route" && !record.deletedAt,
  );

  for (const route of routes) {
    validateSourceRoute(context, route, routes);
  }
}

function validateSourceRoute(
  context: string,
  route: StoredRecord,
  routes: readonly StoredRecord[],
) {
  const matchHost = optionalStringValue(context, route, "matchHost");
  const matchPath = requiredStringValue(context, route, "matchPath");
  const matchPrefix = optionalStringValue(context, route, "matchPrefix");
  const kind = requiredStringValue(context, route, "kind");
  const deploymentConfig = optionalStringValue(context, route, "deploymentConfig");

  if (matchHost !== undefined) {
    assertNormalizedExactHost(context, route, "matchHost", matchHost);
  }

  assertNormalizedAbsoluteMatchPath(context, route, "matchPath", matchPath);

  if (matchPrefix !== undefined) {
    assertNormalizedMatchPrefix(context, route, matchPath, matchPrefix);
  }

  if (deploymentConfig !== undefined && matchHost === undefined) {
    throw new Error(
      `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "deploymentConfig")}" can only be set on exact-host route records.`,
    );
  }

  if (kind === "mount") {
    validateSourceMountRoute(context, route, matchHost, matchPath, matchPrefix);
  } else if (kind === "redirect") {
    validateSourceRedirectRoute(context, route, matchHost);
  } else {
    throw new Error(
      `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "kind")}" must be "mount" or "redirect".`,
    );
  }

  validateSourceRouteAuthorization(context, route, kind);

  if (route.values.enabled === true) {
    assertEnabledSourceRouteIsUnique(context, route, routes);
  }
}

function validateSourceRouteAuthorization(context: string, route: StoredRecord, kind: string) {
  const access = optionalStringValue(context, route, "access");
  const targetProfile = optionalStringValue(context, route, "targetProfile");

  if (access === "management" && (kind !== "mount" || targetProfile !== "instance")) {
    throw new Error(
      `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "access")}" can only be "management" for instance mount routes.`,
    );
  }
}

function validateSourceMountRoute(
  context: string,
  route: StoredRecord,
  matchHost: string | undefined,
  matchPath: string,
  matchPrefix: string | undefined,
) {
  const targetProfile = optionalStringValue(context, route, "targetProfile");
  const surface = optionalStringValue(context, route, "surface");

  for (const fieldName of ["toHost", "toUrl", "statusCode"] as const) {
    if (optionalStringValue(context, route, fieldName) !== undefined) {
      throw new Error(
        `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, fieldName)}" is incompatible with mount routes.`,
      );
    }
  }

  if (targetProfile === undefined) {
    throw new Error(
      `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "targetProfile")}" is required for mount routes.`,
    );
  }

  if (targetProfile === "instance") {
    if (surface !== undefined && surface !== "admin") {
      throw new Error(
        `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "surface")}" is incompatible with instance mount routes.`,
      );
    }

    return;
  }

  if (targetProfile !== "public-site") {
    throw new Error(
      `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "targetProfile")}" is invalid for mount routes.`,
    );
  }

  if (surface !== "public-site") {
    throw new Error(
      `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "surface")}" must be "public-site" for public-site mount routes.`,
    );
  }

  assertHostMountedPublicSiteRoute(context, route, matchHost, matchPath, matchPrefix);
}

function assertHostMountedPublicSiteRoute(
  context: string,
  route: StoredRecord,
  matchHost: string | undefined,
  matchPath: string,
  matchPrefix: string | undefined,
) {
  if (matchHost !== undefined && (matchPath !== "/" || matchPrefix !== "/")) {
    throw new Error(
      `${context} route "${route.id}" host-mounted public Site routes must set field "${controlPlaneFieldLabel(route, "matchPath")}" to "/" and field "${controlPlaneFieldLabel(route, "matchPrefix")}" to "/".`,
    );
  }
}

function validateSourceRedirectRoute(
  context: string,
  route: StoredRecord,
  matchHost: string | undefined,
) {
  if (matchHost === undefined) {
    throw new Error(
      `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "matchHost")}" is required for redirect routes.`,
    );
  }

  for (const fieldName of ["targetProfile", "surface"] as const) {
    if (optionalStringValue(context, route, fieldName) !== undefined) {
      throw new Error(
        `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, fieldName)}" is incompatible with redirect routes.`,
      );
    }
  }

  const toHost = optionalStringValue(context, route, "toHost");
  const toUrl = optionalStringValue(context, route, "toUrl");

  if (
    (toHost === undefined && toUrl === undefined) ||
    (toHost !== undefined && toUrl !== undefined)
  ) {
    throw new Error(
      `${context} route "${route.id}" must set exactly one of field "${controlPlaneFieldLabel(route, "toHost")}" or field "${controlPlaneFieldLabel(route, "toUrl")}".`,
    );
  }

  if (toHost !== undefined) {
    assertNormalizedExactHost(context, route, "toHost", toHost);
  }

  if (toUrl !== undefined) {
    assertNormalizedHttpsUrl(context, route, "toUrl", toUrl);
  }

  if (optionalStringValue(context, route, "statusCode") === undefined) {
    throw new Error(
      `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "statusCode")}" is required for redirect routes.`,
    );
  }

  for (const fieldName of ["preservePath", "preserveQueryString"] as const) {
    if (typeof route.values[fieldName] !== "boolean") {
      throw new Error(
        `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, fieldName)}" is required for redirect routes.`,
      );
    }
  }
}

function assertEnabledSourceRouteIsUnique(
  context: string,
  route: StoredRecord,
  routes: readonly StoredRecord[],
) {
  const candidate = sourceRouteMatch(context, route);

  for (const record of routes) {
    if (record.id === route.id || record.values.enabled !== true) {
      continue;
    }

    const existing = sourceRouteMatch(context, record);

    if (candidate.host !== existing.host || !sourceRoutesOverlap(candidate, existing)) {
      continue;
    }

    throw new Error(
      `${context} route "${route.id}" enabled route match "${formatSourceRouteMatch(candidate)}" conflicts with enabled route "${record.id}".`,
    );
  }
}

function sourceRouteMatch(
  context: string,
  route: StoredRecord,
): {
  host: string;
  path: string;
  prefix?: string;
} {
  const prefix = optionalStringValue(context, route, "matchPrefix");

  return {
    host: optionalStringValue(context, route, "matchHost") ?? "<hostless>",
    path: requiredStringValue(context, route, "matchPath"),
    ...(prefix === undefined ? {} : { prefix }),
  };
}
function sourceRoutesOverlap(
  left: {
    path: string;
    prefix?: string;
  },
  right: {
    path: string;
    prefix?: string;
  },
) {
  return (
    left.path === right.path ||
    (left.prefix !== undefined && routePathMatchesPrefix(right.path, left.prefix)) ||
    (right.prefix !== undefined && routePathMatchesPrefix(left.path, right.prefix)) ||
    (left.prefix !== undefined &&
      right.prefix !== undefined &&
      routePrefixesOverlap(left.prefix, right.prefix))
  );
}

function routePathMatchesPrefix(path: string, prefix: string) {
  return prefix === "/" || path.startsWith(prefix);
}

function routePrefixesOverlap(left: string, right: string) {
  return left === "/" || right === "/" || left.startsWith(right) || right.startsWith(left);
}

function formatSourceRouteMatch(match: { host: string; path: string; prefix?: string }) {
  return `${match.host}${match.path}${match.prefix === undefined ? "" : ` ${match.prefix}`}`;
}

function assertNormalizedExactHost(
  context: string,
  route: StoredRecord,
  fieldName: string,
  value: string,
) {
  const normalized = normalizeExactHost(value);

  if (normalized !== value) {
    throw new Error(
      `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, fieldName)}" must be a normalized exact host.`,
    );
  }
}

function assertNormalizedHttpsUrl(
  context: string,
  route: StoredRecord,
  fieldName: string,
  value: string,
) {
  try {
    const url = new URL(value);
    const normalizedHost = normalizeExactHost(url.hostname);
    const normalized = url.toString().replace(/\/$/, "");

    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      url.hash !== "" ||
      normalizedHost !== url.hostname ||
      normalized !== value
    ) {
      throw new Error("invalid URL");
    }
  } catch {
    throw new Error(
      `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, fieldName)}" must be a normalized absolute HTTPS URL without credentials or fragment.`,
    );
  }
}

function assertNormalizedControlPlaneOrigin(
  context: string,
  record: StoredRecord,
  fieldName: string,
  value: string,
) {
  if (normalizeInstanceControlPlaneOrigin(value) !== value) {
    throw new Error(
      `${context} record "${record.id}" field "${controlPlaneFieldLabel(record, fieldName)}" must be a normalized absolute origin.`,
    );
  }
}

function assertNormalizedControlPlaneHost(
  context: string,
  record: StoredRecord,
  fieldName: string,
  value: string,
) {
  if (normalizeExactHost(value) !== value) {
    throw new Error(
      `${context} record "${record.id}" field "${controlPlaneFieldLabel(record, fieldName)}" must be a normalized exact host.`,
    );
  }
}

function assertControlPlaneRelyingPartyId(
  context: string,
  record: StoredRecord,
  fieldName: string,
  value: string,
  options: {
    canonicalOrigin?: string;
  } = {},
) {
  if (normalizeInstanceControlPlaneRelyingPartyId(value, options) !== value) {
    throw new Error(
      `${context} record "${record.id}" field "${controlPlaneFieldLabel(record, fieldName)}" must be a normalized relying-party id for the configured auth origin.`,
    );
  }
}

function assertControlPlaneEmailAddress(
  context: string,
  record: StoredRecord,
  fieldName: string,
  value: string,
) {
  parseControlPlaneEmailAddress(context, record, fieldName, value);
}

function assertProductionRouteReference(
  context: string,
  record: StoredRecord,
  fieldName: string,
  routeId: string,
  recordsById: ReadonlyMap<string, StoredRecord>,
): StoredRecord {
  const route = assertActiveRecordEntity(context, record, fieldName, routeId, "route", recordsById);

  if (
    route.values.enabled !== true ||
    optionalStringValue(context, route, "matchHost") === undefined
  ) {
    throw new Error(
      `${context} record "${record.id}" field "${controlPlaneFieldLabel(record, fieldName)}" must reference an enabled exact-host route.`,
    );
  }

  return route;
}

function assertAdminRouteReference(
  context: string,
  record: StoredRecord,
  fieldName: string,
  routeId: string,
  recordsById: ReadonlyMap<string, StoredRecord>,
): StoredRecord {
  const route = assertActiveRecordEntity(context, record, fieldName, routeId, "route", recordsById);

  if (
    route.values.enabled !== true ||
    optionalStringValue(context, route, "matchHost") === undefined ||
    route.values.kind !== "mount" ||
    route.values.targetProfile !== "instance" ||
    route.values.surface !== "admin"
  ) {
    throw new Error(
      `${context} record "${record.id}" field "${controlPlaneFieldLabel(record, fieldName)}" must reference an enabled exact-host instance admin route.`,
    );
  }

  return route;
}

function assertActiveRecordEntity(
  context: string,
  record: StoredRecord,
  fieldName: string,
  recordId: string,
  entityName: InstanceControlPlaneEntityName,
  recordsById: ReadonlyMap<string, StoredRecord>,
): StoredRecord {
  const target = recordsById.get(recordId);

  if (!target || instanceControlPlaneRecordSourceEntityName(target.entity) !== entityName) {
    throw new Error(
      `${context} record "${record.id}" field "${controlPlaneFieldLabel(record, fieldName)}" references unknown ${formatInstanceControlPlaneBoundaryEntityName(entityName)} record "${recordId}".`,
    );
  }

  if (target.deletedAt) {
    throw new Error(
      `${context} record "${record.id}" field "${controlPlaneFieldLabel(record, fieldName)}" cannot reference tombstoned record "${recordId}".`,
    );
  }

  return target;
}

function assertNormalizedAbsoluteMatchPath(
  context: string,
  route: StoredRecord,
  fieldName: string,
  value: string,
) {
  if (!isNormalizedAbsoluteRoutePath(value)) {
    throw new Error(
      `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, fieldName)}" must be a normalized absolute path.`,
    );
  }
}

function assertNormalizedMatchPrefix(
  context: string,
  route: StoredRecord,
  matchPath: string,
  matchPrefix: string,
) {
  const normalizedPrefix =
    matchPrefix === "/" ? matchPrefix : matchPrefix.endsWith("/") ? matchPrefix.slice(0, -1) : "";

  if (matchPrefix !== "/" && !matchPrefix.endsWith("/")) {
    throw new Error(
      `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "matchPrefix")}" must be a normalized absolute path prefix.`,
    );
  }

  if (matchPrefix !== "/" && !isNormalizedAbsoluteRoutePath(normalizedPrefix)) {
    throw new Error(
      `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "matchPrefix")}" must be a normalized absolute path prefix.`,
    );
  }

  if (matchPath === "/") {
    if (matchPrefix !== "/") {
      throw new Error(
        `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "matchPrefix")}" must begin at or below field "${controlPlaneFieldLabel(route, "matchPath")}".`,
      );
    }

    return;
  }

  if (!matchPrefix.startsWith(`${matchPath}/`)) {
    throw new Error(
      `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "matchPrefix")}" must begin at or below field "${controlPlaneFieldLabel(route, "matchPath")}".`,
    );
  }
}

function isNormalizedAbsoluteRoutePath(value: string) {
  if (value === "/") {
    return true;
  }

  if (!/^\/[a-z0-9._~-]+(?:\/[a-z0-9._~-]+)*$/.test(value)) {
    return false;
  }

  const segments = value.slice(1).split("/");

  if (segments.some((segment) => segment === "." || segment === "..")) {
    return false;
  }

  return !instanceControlPlaneReservedRoutePaths.some(
    (reservedPath) => value === reservedPath || value.startsWith(`${reservedPath}/`),
  );
}

function assertControlPlaneRecordValuesAreReviewable(context: string, record: StoredRecord) {
  for (const [fieldName, value] of Object.entries(record.values)) {
    const entity = instanceControlPlaneRecordSourceEntityName(record.entity) ?? record.entity;
    const isSecretReference = isRuntimeControlPlaneSecretReferenceField(
      instanceControlPlaneSchema,
      entity,
      fieldName,
    );

    if (!isSecretReference && isForbiddenControlPlaneFieldName(fieldName)) {
      throw new Error(
        `${context} record "${record.id}" field "${controlPlaneFieldLabel(record, fieldName)}" cannot store control-plane secrets or provider truth.`,
      );
    }

    if (typeof value === "string") {
      assertControlPlaneStringValueIsReviewable(context, record, fieldName, value);
    }
  }
}

function assertControlPlaneStringValueIsReviewable(
  context: string,
  record: StoredRecord,
  fieldName: string,
  value: string,
) {
  if (containsForbiddenControlPlaneSecretValue(value)) {
    throw new Error(
      `${context} record "${record.id}" field "${controlPlaneFieldLabel(record, fieldName)}" cannot store control-plane secret values.`,
    );
  }

  const parsed = parseMaybeJson(value);

  if (parsed !== undefined) {
    assertControlPlaneJsonValueIsReviewable(context, record, fieldName, parsed);
  }
}

function assertControlPlaneJsonValueIsReviewable(
  context: string,
  record: StoredRecord,
  fieldName: string,
  value: unknown,
) {
  if (Array.isArray(value)) {
    for (const item of value) {
      assertControlPlaneJsonValueIsReviewable(context, record, fieldName, item);
    }

    return;
  }

  if (typeof value === "string") {
    assertControlPlaneStringValueIsReviewable(context, record, fieldName, value);
    return;
  }

  if (!isPlainRecord(value)) {
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    if (isForbiddenControlPlaneFieldName(key)) {
      throw new Error(
        `${context} record "${record.id}" field "${controlPlaneFieldLabel(record, fieldName)}" cannot store control-plane secrets or provider truth.`,
      );
    }

    assertControlPlaneJsonValueIsReviewable(context, record, fieldName, item);
  }
}

function parseMaybeJson(value: string): Record<string, unknown> | unknown[] | undefined {
  const trimmed = value.trim();

  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;

    if (Array.isArray(parsed)) {
      return parsed;
    }

    return isPlainRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function tryParseBoundaryEntityName(value: string): string | undefined {
  try {
    return parseQualifiedEntityName("Instance control-plane record entity", value).entityKey;
  } catch {
    return undefined;
  }
}

function canonicalInstanceControlPlaneRecord(record: StoredRecord): StoredRecord {
  const entity = parseInstanceControlPlaneEntityName(
    `Instance control-plane record "${record.id}" entity`,
    record.entity,
  );

  return {
    id: record.id,
    entity,
    values: stableJsonValue(
      reviewableInstanceControlPlaneRecordValues(entity, record.values),
    ) as RecordValues,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(record.deletedAt === undefined ? {} : { deletedAt: record.deletedAt }),
  };
}

function requiredStringValue(context: string, record: StoredRecord, fieldName: string): string {
  const value = record.values[fieldName];

  if (typeof value !== "string") {
    throw new Error(
      `${context} record "${record.id}" field "${controlPlaneFieldLabel(record, fieldName)}" must be a string.`,
    );
  }

  return value;
}

function optionalStringValue(
  context: string,
  record: StoredRecord,
  fieldName: string,
): string | undefined {
  const value = record.values[fieldName];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(
      `${context} record "${record.id}" field "${controlPlaneFieldLabel(record, fieldName)}" must be a string.`,
    );
  }

  return value;
}

function controlPlaneEntityLabel(entityName: string): string {
  const sourceEntity = instanceControlPlaneRecordSourceEntityName(entityName);

  if (sourceEntity !== undefined) {
    return formatInstanceControlPlaneBoundaryEntityName(sourceEntity);
  }

  return entityName;
}

function controlPlaneFieldLabel(record: Pick<StoredRecord, "entity">, fieldName: string): string {
  return `${controlPlaneEntityLabel(record.entity)}.${fieldName}`;
}

function parseRecordValues(context: string, value: unknown): RecordValues {
  if (!isPlainRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  const values: RecordValues = {};

  for (const [fieldName, fieldValue] of Object.entries(value)) {
    if (
      typeof fieldValue !== "string" &&
      typeof fieldValue !== "boolean" &&
      !isFiniteNumber(fieldValue)
    ) {
      throw new Error(`${context} field "${fieldName}" must be a scalar value.`);
    }

    values[fieldName] = fieldValue;
  }

  return values;
}

function parseIsoTimestamp(context: string, value: unknown): string {
  const timestamp = parseNonEmptyString(context, value);
  const date = new Date(timestamp);

  if (Number.isNaN(date.valueOf()) || date.toISOString() !== timestamp) {
    throw new Error(`${context} must be an ISO timestamp.`);
  }

  return timestamp;
}

function parseNonEmptyString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value;
}

function assertExactKeys(
  context: string,
  value: Record<string, unknown>,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
) {
  const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);

  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${context} has unsupported key "${key}".`);
    }
  }

  for (const key of requiredKeys) {
    if (!(key in value)) {
      throw new Error(`${context} must include "${key}".`);
    }
  }
}

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableJsonValue);
  }

  if (!isPlainRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableJsonValue(child)]),
  );
}

function isForbiddenControlPlaneFieldName(fieldName: string) {
  const normalized = normalizeControlPlaneSecretText(fieldName);

  return (
    normalized.includes("api_token") ||
    normalized.includes("access_token") ||
    normalized.includes("auth_token") ||
    normalized.includes("password") ||
    normalized.includes("secret_value") ||
    normalized.includes("raw_lease_token") ||
    normalized.includes("lease_token") ||
    normalized.includes("alchemy_state_token") ||
    normalized.includes("provider_truth") ||
    normalized.includes("provider_state") ||
    normalized.includes("provider_resource_json") ||
    normalized.includes("provider_resources_json")
  );
}

function containsForbiddenControlPlaneSecretValue(value: string) {
  const normalized = normalizeControlPlaneSecretText(value);

  return (
    normalized.includes("cf_api_token") ||
    normalized.includes("cloudflare_api_token") ||
    normalized.includes("alchemy_password") ||
    normalized.includes("alchemy_state_token") ||
    normalized.includes("raw_lease_token") ||
    normalized.includes("lease_token") ||
    value.includes("-----BEGIN PRIVATE KEY-----")
  );
}

function normalizeControlPlaneSecretText(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function normalizeExactHost(value: string): string | undefined {
  const raw = value.trim().toLowerCase();

  if (raw === "" || raw.includes("://")) {
    return undefined;
  }

  try {
    const url = new URL(`https://${raw}`);
    const normalized = stripTrailingDots(url.hostname.toLowerCase());

    if (
      url.username !== "" ||
      url.password !== "" ||
      url.pathname !== "/" ||
      url.search !== "" ||
      url.hash !== "" ||
      !isValidDnsHostname(normalized)
    ) {
      return undefined;
    }

    return normalized;
  } catch {
    return undefined;
  }
}

function normalizeInstanceControlPlaneOrigin(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const normalizedHost = isLocalControlPlaneHost(hostname)
      ? hostname
      : normalizeExactHost(hostname);
    const normalizedOrigin = url.origin.replace(url.hostname, hostname);

    if (
      normalizedHost === undefined ||
      url.username !== "" ||
      url.password !== "" ||
      url.pathname !== "/" ||
      url.search !== "" ||
      url.hash !== "" ||
      (url.protocol !== "https:" &&
        !(url.protocol === "http:" && isLocalControlPlaneHost(hostname))) ||
      normalizedOrigin !== value
    ) {
      return undefined;
    }

    return normalizedOrigin;
  } catch {
    return undefined;
  }
}
function normalizeInstanceControlPlaneRelyingPartyId(
  value: string | undefined,
  options: {
    canonicalOrigin?: string;
  } = {},
): string | undefined {
  const relyingPartyId = value?.trim().toLowerCase();
  if (!relyingPartyId || normalizeExactHost(relyingPartyId) !== relyingPartyId) {
    return undefined;
  }

  if (options.canonicalOrigin !== undefined) {
    const canonicalOrigin = normalizeInstanceControlPlaneOrigin(options.canonicalOrigin);

    if (canonicalOrigin === undefined) {
      return undefined;
    }

    const canonicalHost = new URL(canonicalOrigin).hostname.toLowerCase();

    if (canonicalHost !== relyingPartyId && !canonicalHost.endsWith(`.${relyingPartyId}`)) {
      return undefined;
    }
  }

  return relyingPartyId;
}

function productionOriginForRouteRecord(
  record: InstanceControlPlaneProjectionRecord,
): string | undefined {
  if (
    record.entity !== "route" ||
    record.deletedAt !== undefined ||
    record.values.enabled !== true
  ) {
    return undefined;
  }

  const matchHost = stringControlPlaneValue(record.values.matchHost);

  return matchHost === undefined ? undefined : `https://${matchHost}`;
}

function preferredAdminRouteCandidate(
  record: InstanceControlPlaneProjectionRecord,
): InstanceControlPlanePreferredAdminRouteCandidate | undefined {
  if (
    record.entity !== "route" ||
    record.deletedAt !== undefined ||
    record.values.enabled !== true ||
    record.values.kind !== "mount" ||
    record.values.targetProfile !== "instance" ||
    record.values.surface !== "admin"
  ) {
    return undefined;
  }

  const matchHost = stringControlPlaneValue(record.values.matchHost);

  if (matchHost === undefined) {
    return undefined;
  }

  return {
    adminOrigin: `https://${matchHost}`,
    matchHost,
    routeId: record.id,
  };
}

function comparePreferredAdminRouteCandidates(
  left: InstanceControlPlanePreferredAdminRouteCandidate,
  right: InstanceControlPlanePreferredAdminRouteCandidate,
) {
  const hostOrder = left.matchHost.localeCompare(right.matchHost);

  return hostOrder === 0 ? left.routeId.localeCompare(right.routeId) : hostOrder;
}

function parseControlPlaneEmailAddress(
  context: string,
  record: StoredRecord,
  fieldName: string,
  value: string,
): {
  host: string;
} {
  const atIndex = value.lastIndexOf("@");
  const local = atIndex <= 0 ? "" : value.slice(0, atIndex);
  const host = atIndex <= 0 ? "" : value.slice(atIndex + 1).toLowerCase();
  const normalized = `${local}@${host}`;

  if (
    value !== normalized ||
    value.indexOf("@") !== atIndex ||
    local === "" ||
    !/^[^@\s<>]+$/.test(local) ||
    normalizeExactHost(host) !== host
  ) {
    throw new Error(
      `${context} record "${record.id}" field "${controlPlaneFieldLabel(record, fieldName)}" must be a normalized email address.`,
    );
  }

  return { host };
}

function controlPlaneHostBelongsToDomain(host: string, domain: string) {
  return host === domain || host.endsWith(`.${domain}`);
}

function isLocalControlPlaneHost(value: string) {
  return value === "localhost" || value.endsWith(".localhost");
}

function stripTrailingDots(value: string): string {
  return value.replaceAll(/\.+$/g, "");
}

function isValidDnsHostname(value: string): boolean {
  if (value === "" || value.length > 253 || value.includes("_")) {
    return false;
  }

  return value
    .split(".")
    .every((label) => label.length > 0 && label.length <= 63 && hostnameLabelPattern.test(label));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const hostnameLabelPattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

function textField(label: string, format?: "href" | "longText"): FieldSchema {
  return { type: "text", required: true, label, ...(format === undefined ? {} : { format }) };
}

function optionalTextField(label: string, format?: "href" | "longText"): FieldSchema {
  return { type: "text", required: false, label, ...(format === undefined ? {} : { format }) };
}

function booleanField(label: string, defaultValue: boolean): FieldSchema {
  return { type: "boolean", required: true, label, default: defaultValue };
}

function optionalBooleanField(label: string, defaultValue: boolean): FieldSchema {
  return { type: "boolean", required: false, label, default: defaultValue };
}

function enumField(
  label: string,
  values: Record<string, string>,
  defaultValue?: string,
): FieldSchema {
  const entries = Object.entries(values).map(([key, valueLabel]) => ({ key, label: valueLabel }));
  return {
    type: "enum",
    required: true,
    label,
    values: entries,
    ...(defaultValue === undefined ? {} : { default: defaultValue }),
  };
}

function optionalEnumField(
  label: string,
  values: Record<string, string>,
  defaultValue?: string,
): FieldSchema {
  const field = enumField(label, values, defaultValue);

  return { ...field, required: false };
}

function optionalReferenceField(label: string, to: string, displayField: string): FieldSchema {
  return { type: "reference", required: false, label, to, displayField };
}

function referenceField(label: string, to: string, displayField: string): FieldSchema {
  return { type: "reference", required: true, label, to, displayField };
}

function toOne(
  label: string,
  fromEntity: string,
  fromField: string,
  toEntity: string,
  inverse?: string,
): ToOneRelationshipSchema {
  return {
    kind: "toOne",
    label,
    from: { entity: fromEntity, field: fromField },
    to: { entity: toEntity },
    ...(inverse === undefined ? {} : { inverse }),
  };
}

function toMany(
  label: string,
  fromEntity: string,
  toEntity: string,
  toField: string,
  inverse?: string,
): ToManyRelationshipSchema {
  return {
    kind: "toMany",
    label,
    from: { entity: fromEntity },
    to: { entity: toEntity, field: toField },
    ...(inverse === undefined ? {} : { inverse }),
  };
}

function allQuery(label: string, entity: InstanceControlPlaneEntityName) {
  return {
    label,
    entity,
    expression: { kind: "all" },
  } satisfies Omit<AppSchema["queries"][number], "key">;
}
function whereQuery(
  label: string,
  entity: InstanceControlPlaneEntityName,
  field: string,
  value: InstanceControlPlaneQueryValue,
) {
  return {
    label,
    entity,
    expression: {
      kind: "where",
      ref: { kind: "value", name: field },
      op: "eq",
      value,
    },
  } satisfies Omit<AppSchema["queries"][number], "key">;
}
function andWhereQuery(
  label: string,
  entity: InstanceControlPlaneEntityName,
  filters: Array<{
    field: string;
    value: InstanceControlPlaneQueryValue;
  }>,
) {
  return {
    label,
    entity,
    expression: {
      kind: "and",
      expressions: filters.map((filter) => ({
        kind: "where",
        ref: { kind: "value", name: filter.field },
        op: "eq",
        value: filter.value,
      })),
    },
  } satisfies Omit<AppSchema["queries"][number], "key">;
}
function tableView(
  entity: InstanceControlPlaneEntityName,
  fields: InstanceControlPlaneTableField[],
  options: {
    operations?: NonNullable<AppSchema["tableViews"][number]["operations"]>;
  } = {},
) {
  return {
    entity,
    ...(options.operations === undefined ? {} : { operations: options.operations }),
    columns: [
      ...fields.map(tableFieldColumn),
      ...(options.operations === undefined
        ? []
        : [
            {
              type: "operationControl",
            } satisfies AppSchema["tableViews"][number]["columns"][number],
          ]),
    ],
  } satisfies Omit<AppSchema["tableViews"][number], "key">;
}
function tableFieldColumn(fieldInput: InstanceControlPlaneTableField) {
  return {
    type: "field",
    field: fieldInput,
  } satisfies AppSchema["tableViews"][number]["columns"][number];
}
function createView(
  entity: InstanceControlPlaneEntityName,
  fields: InstanceControlPlaneViewField[],
) {
  return {
    type: "create",
    entity,
    fields: fields.map(createFieldEntry),
  } satisfies Omit<Extract<AppSchema["views"][number], { type: "create" }>, "key">;
}
function editView(entity: InstanceControlPlaneEntityName, fields: InstanceControlPlaneViewField[]) {
  return {
    type: "edit",
    entity,
    fields: fields.map(viewFieldEntry),
  } satisfies Omit<Extract<AppSchema["views"][number], { type: "edit" }>, "key">;
}
function collectionView(
  label: string,
  entity: InstanceControlPlaneEntityName,
  defaultQuery: string,
  tableViewName: string,
  options: {
    context?: InstanceControlPlaneCollectionContext;
    createView?: string;
    extraQueries?: string[];
    navigation?: boolean;
  } = {},
) {
  return {
    type: "collection",
    label,
    entity,
    ...(options.navigation ? { navigation: { primary: true } } : {}),
    ...(options.context === undefined ? {} : { context: options.context }),
    queries: [defaultQuery, ...(options.extraQueries ?? [])].map((query) => ({
      query,
      count: { type: "count" },
    })),
    defaultQuery,
    result: {
      type: "table",
      tableView: tableViewName,
    },
    ...(options.createView === undefined
      ? {}
      : {
          operations: [
            {
              operation: `${entity}.create`,
              placement: "toolbar",
              createView: options.createView,
            },
          ],
        }),
  } satisfies Omit<Extract<AppSchema["views"][number], { type: "collection" }>, "key">;
}
function writeOperations(
  label: string,
  fields: string[],
  options: {
    access?: AccessRequirement;
    updateFields?: string[];
  } = {},
) {
  const access =
    options.access ??
    ({
      anyOf: [{ role: "administrator" }, { actor: "adminBearer" }],
    } as const satisfies AccessRequirement);
  const input = { fields: fields.map((field) => ({ key: field, field })) };
  const updateInput = {
    fields: (options.updateFields ?? fields).map((field) => ({ key: field, field })),
  };
  return [
    {
      access,
      key: "create",
      label: `Create ${label}`,
      kind: "create",
      scope: "collection",
      input,
      effect: { type: "createRecord" },
      output: { type: "create" },
      idempotency: { required: true },
      audit: { input: "summary" },
    },
    {
      access,
      key: "update",
      label: `Update ${label}`,
      kind: "update",
      scope: "record",
      input: updateInput,
      effect: { type: "patchRecord" },
      output: { type: "update" },
      idempotency: { required: true },
      audit: { input: "summary" },
    },
  ] satisfies NonNullable<AppSchema["entities"][number]["operations"]>;
}
function viewField(editor: FieldEditor) {
  return { editor } satisfies Omit<ViewFieldBindingSchema, "field">;
}
function createField(editor: FieldEditor) {
  return { editor } satisfies Omit<
    NonNullable<
      Extract<
        AppSchema["views"][number],
        {
          type: "create";
        }
      >["fields"]
    >[number],
    "field"
  >;
}
function createFieldEntry(fieldInput: InstanceControlPlaneViewField) {
  const field = typeof fieldInput === "string" ? fieldInput : fieldInput.field;
  return {
    field,
    ...createField(editorForField(field)),
    ...(typeof fieldInput === "string" || fieldInput.visibleWhen === undefined
      ? {}
      : { visibleWhen: fieldInput.visibleWhen }),
  } as const;
}
function viewFieldEntry(fieldInput: InstanceControlPlaneViewField) {
  const field = typeof fieldInput === "string" ? fieldInput : fieldInput.field;
  return {
    field,
    ...viewField(editorForField(field)),
    ...(typeof fieldInput === "string" || fieldInput.visibleWhen === undefined
      ? {}
      : { visibleWhen: fieldInput.visibleWhen }),
  } as const;
}
function editorForField(field: string): FieldEditor {
  if (field === "enabled" || field === "preservePath" || field === "preserveQueryString") {
    return "boolean";
  }

  if (
    field === "surface" ||
    field === "access" ||
    field === "targetProfile" ||
    field === "providerFamily" ||
    field === "observedStatus" ||
    field === "observedFailureCode" ||
    field === "dnsStatus" ||
    field === "productionIdentityStatus" ||
    field === "purpose" ||
    field === "statusCode" ||
    field === "kind"
  ) {
    return "enum";
  }

  if (
    field === "deploymentConfig" ||
    field === "primaryRoute" ||
    field === "adminRoute" ||
    field === "authRoute" ||
    field === "defaultEmailDomain" ||
    field === "defaultContactSender" ||
    field === "defaultAuthSender" ||
    field === "emailDomain"
  ) {
    return "reference";
  }

  if (field === "latestError") {
    return "textarea";
  }

  if (field === "toUrl" || field === "canonicalOrigin" || field === "authOrigin") {
    return "href";
  }

  return "text";
}
