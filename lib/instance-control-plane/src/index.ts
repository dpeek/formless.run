import {
  findResolvedAppPackage,
  isAppInstallRegistrationPolicy,
  isSourceSchemaHash,
  listAppInstalls,
  parseAppInstallRegistrationOperation,
  type AppInstall,
  type AppInstallId,
  type AppInstallLaunchLink,
  type AppInstallRegistrationOperation,
  type AppInstallRegistrationPolicy,
  type AppInstallRouteAccess,
  type AppInstallRoute,
  type AppInstallRouteKind,
  type AppInstallRouteRequiredRole,
  type AppPackageResolver,
  type PackageAppKey,
  type PackageAppRevision,
  type SourceSchemaHash,
} from "@dpeek/formless-installed-apps";
import {
  CONTROL_PLANE_DEPLOYMENT_CONFIG_OBSERVED_FIELDS,
  type ControlPlaneDeploymentConfigObservedStatus,
} from "@dpeek/formless-deploy";
import {
  formatQualifiedEntityName,
  isRuntimeControlPlaneObservedField,
  isRuntimeControlPlaneSecretReferenceField,
  isValidStoredFieldValue,
  parseAppSchema,
  parseQualifiedEntityName,
} from "@dpeek/formless-schema";
import type {
  AppSchema,
  FieldEditor,
  FieldSchema,
  ToManyRelationshipSchema,
  ToOneRelationshipSchema,
} from "@dpeek/formless-schema";
import {
  formatStoredRecordsForArtifact,
  parseStorageSnapshot,
  type RecordValues,
  type StorageSnapshot,
  type StoredRecord,
} from "@dpeek/formless-storage";
export * from "./types.ts";

export const INSTANCE_CONTROL_PLANE_SCHEMA_KEY = "instance-control-plane";
export const INSTANCE_CONTROL_PLANE_BOUNDARY_SCHEMA_KEY = "instance";
export const INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY = "instance:control-plane";
export const INSTANCE_CONTROL_PLANE_API_ROUTE_PREFIX = "/api/formless/control-plane";
export const INSTANCE_CONTROL_PLANE_SOURCE_SCHEMA_HASH =
  "sha256:778ddfc129904de4a69b2fc8249d0832a25132d11138e342ef1b5bf96f88f0b2" satisfies SourceSchemaHash;
export const INSTANCE_CONTROL_PLANE_INSTANCE_SETTINGS_ID = "instance";
export const instanceControlPlaneSchemaProvenance = {
  kind: "instance-control-plane",
  sourceSchemaHash: INSTANCE_CONTROL_PLANE_SOURCE_SCHEMA_HASH,
} as const;

export const instanceControlPlaneEntityNames = [
  "app-install",
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

export type InstanceControlPlaneAppInstallStatus = "disabled" | "failed" | "installed";
export type InstanceControlPlaneAppInstallRegistrationPolicy = AppInstallRegistrationPolicy;

export type InstanceControlPlaneAppInstallValues = {
  installId: AppInstallId;
  packageAppKey: PackageAppKey;
  packageRevision?: PackageAppRevision;
  sourceSchemaHash?: SourceSchemaHash;
  label: string;
  registrationPolicy: InstanceControlPlaneAppInstallRegistrationPolicy;
  registrationOperation?: AppInstallRegistrationOperation;
  status: InstanceControlPlaneAppInstallStatus;
  storageIdentity: `app:${AppInstallId}`;
};

export type InstanceControlPlaneAppRouteKind = "admin" | "publicSite";
export type InstanceControlPlaneAppRouteCapability = "generatedApp" | "publicSite";
export type InstanceControlPlaneAppRouteSurface = "admin" | "publicSite";
export type InstanceControlPlaneRouteKind = "mount" | "redirect";
export type InstanceControlPlaneRouteSurface = "admin" | "public-site";
export type InstanceControlPlaneRouteTargetProfile = "app" | "instance" | "public-site";
export type InstanceControlPlaneRouteAccess = AppInstallRouteAccess;
export type InstanceControlPlaneRouteRequiredRole = AppInstallRouteRequiredRole;

export type InstanceControlPlaneRouteValues = {
  enabled: boolean;
  matchHost?: string;
  matchPath: `/${string}`;
  matchPrefix?: `/${string}`;
  kind: InstanceControlPlaneRouteKind;
  targetProfile?: InstanceControlPlaneRouteTargetProfile;
  appInstall?: AppInstallId;
  surface?: InstanceControlPlaneRouteSurface;
  access?: InstanceControlPlaneRouteAccess;
  requiredRole?: InstanceControlPlaneRouteRequiredRole;
  deploymentConfig?: string;
  toHost?: string;
  toUrl?: string;
  statusCode?: InstanceControlPlaneRedirectStatusCode;
  preservePath?: boolean;
  preserveQueryString?: boolean;
};

export type InstanceControlPlaneProviderFamily = "cloudflare";

export type InstanceControlPlaneDeploymentConfigTargetKind = "instance";
export type InstanceControlPlaneDeploymentConfigObservedStatus =
  ControlPlaneDeploymentConfigObservedStatus;

export const instanceControlPlaneDeploymentConfigObservedFields =
  CONTROL_PLANE_DEPLOYMENT_CONFIG_OBSERVED_FIELDS;

export type InstanceControlPlaneDeploymentConfigValues = {
  targetId: string;
  targetKind: InstanceControlPlaneDeploymentConfigTargetKind;
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
  observedSummary?: string;
  observedError?: string;
  observedRunnerId?: string;
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
  "app-install": InstanceControlPlaneAppInstallValues;
  "deployment-config": InstanceControlPlaneDeploymentConfigValues;
  "email-domain": InstanceControlPlaneEmailDomainValues;
  "email-sender": InstanceControlPlaneEmailSenderValues;
  "instance-settings": InstanceControlPlaneInstanceSettingsValues;
  route: InstanceControlPlaneRouteValues;
};

type InstanceControlPlaneTableField =
  | string
  | {
      display?: "editor" | "hidden" | "readOnly";
      field: string;
    };

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
  "app-install": ["installId", "packageAppKey", "registrationOperation", "storageIdentity"],
  "deployment-config": ["targetId", "targetKind", "providerFamily"],
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
export const instanceControlPlaneSourceSchema = {
  version: 1,
  entities: [
    {
      id: "entity_703e0070-a642-4c2d-8103-3221222a6c35",
      key: "app-install",
      label: "App install",
      fields: [
        {
          key: "installId",
          ...textField("Install id"),
        },
        {
          key: "packageAppKey",
          ...textField("Package"),
        },
        {
          key: "packageRevision",
          ...optionalNumberField("Package revision"),
        },
        {
          key: "sourceSchemaHash",
          ...optionalTextField("Source schema hash"),
        },
        {
          key: "label",
          ...textField("Label"),
        },
        {
          key: "registrationPolicy",
          ...enumField("Registration policy", {
            closed: "Closed",
            "email-verified": "Email verified",
            "custom-operation": "Custom operation",
          }),
        },
        {
          key: "registrationOperation",
          ...optionalTextField("Registration operation"),
        },
        {
          key: "status",
          ...enumField("Status", {
            disabled: "Disabled",
            failed: "Failed",
            installed: "Installed",
          }),
        },
        {
          key: "storageIdentity",
          ...textField("Storage identity"),
        },
      ],
      operations: writeOperations("App install", [
        "installId",
        "packageAppKey",
        "packageRevision",
        "sourceSchemaHash",
        "label",
        "registrationPolicy",
        "registrationOperation",
        "status",
        "storageIdentity",
      ]),
      constraints: [
        { key: "uniqueInstallId", kind: "unique", fields: ["installId"] },
        { key: "uniqueStorageIdentity", kind: "unique", fields: ["storageIdentity"] },
      ],
    },
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
            app: "App",
            instance: "Instance",
            "public-site": "Public Site",
          }),
        },
        {
          key: "appInstall",
          ...optionalReferenceField("App install", "app-install", "label"),
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
          key: "requiredRole",
          ...optionalEnumField("Required role", {
            "app.admin": "App admin",
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
        "appInstall",
        "surface",
        "access",
        "requiredRole",
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
          key: "targetKind",
          ...enumField("Kind", { instance: "Instance" }),
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
          key: "observedSummary",
          ...optionalTextField("Observed summary", "longText"),
        },
        {
          key: "observedError",
          ...optionalTextField("Observed error", "longText"),
        },
        {
          key: "observedRunnerId",
          ...optionalTextField("Observed runner"),
        },
      ],
      operations: writeOperations(
        "Deployment config",
        [
          "targetId",
          "targetKind",
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
            "targetKind",
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
            "observedSummary",
            "observedError",
            "observedRunnerId",
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
      key: "routeInstall",
      ...toOne("Route install", "route", "appInstall", "app-install"),
    },
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
      key: "appInstallAll",
      ...allQuery("App installs", "app-install"),
    },
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
      key: "routeAppMount",
      ...whereQuery("App install routes", "route", "targetProfile", "app"),
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
  itemViews: [
    {
      key: "appInstallItem",
      ...itemView("app-install", [
        "label",
        "installId",
        "packageAppKey",
        "registrationPolicy",
        "registrationOperation",
        "status",
      ]),
    },
    {
      key: "routeItem",
      ...itemView("route", ["matchHost", "matchPath", "kind", "enabled"]),
    },
    {
      key: "deploymentConfigItem",
      ...itemView("deployment-config", [
        "label",
        "targetId",
        "providerFamily",
        "enabled",
        "observedStatus",
        "observedAt",
      ]),
    },
    {
      key: "instanceSettingsItem",
      ...itemView("instance-settings", [
        "settingsId",
        "primaryRoute",
        "adminRoute",
        "canonicalOrigin",
        "productionIdentityStatus",
      ]),
    },
    {
      key: "emailDomainItem",
      ...itemView("email-domain", ["domain", "providerFamily", "enabled", "dnsStatus"]),
    },
    {
      key: "emailSenderItem",
      ...itemView("email-sender", ["address", "purpose", "enabled", "emailDomain"]),
    },
  ],
  tableViews: [
    {
      key: "appInstallTable",
      ...tableView("app-install", [
        { field: "label", display: "editor" },
        { field: "installId", display: "readOnly" },
        { field: "packageAppKey", display: "readOnly" },
        { field: "registrationPolicy", display: "readOnly" },
        { field: "registrationOperation", display: "readOnly" },
        { field: "status", display: "readOnly" },
        { field: "storageIdentity", display: "readOnly" },
        { field: "packageRevision", display: "readOnly" },
        { field: "sourceSchemaHash", display: "readOnly" },
      ]),
    },
    {
      key: "routeTable",
      ...tableView(
        "route",
        [
          { field: "enabled", display: "editor" },
          { field: "matchHost", display: "readOnly" },
          { field: "matchPath", display: "readOnly" },
          { field: "matchPrefix", display: "readOnly" },
          { field: "kind", display: "readOnly" },
          { field: "targetProfile", display: "readOnly" },
          { field: "appInstall", display: "readOnly" },
          { field: "surface", display: "readOnly" },
          { field: "access", display: "readOnly" },
          { field: "requiredRole", display: "readOnly" },
          { field: "toHost", display: "readOnly" },
          { field: "toUrl", display: "readOnly" },
          { field: "statusCode", display: "readOnly" },
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
          operationLabel: "Route operations",
        },
      ),
    },
    {
      key: "deploymentConfigTable",
      ...tableView(
        "deployment-config",
        [
          "label",
          "targetId",
          "targetKind",
          "providerFamily",
          "accountId",
          "workerName",
          "targetUrl",
          "enabled",
          "observedStatus",
          "observedAt",
          "observedDesiredStateHash",
          "observedSummary",
          "observedError",
          "observedRunnerId",
        ],
        {
          operations: [
            {
              operation: "deployment-config.update",
              label: "Edit deployment config",
              target: { kind: "row" },
              editView: "deploymentConfigEdit",
            },
          ],
          operationLabel: "Deployment config operations",
        },
      ),
    },
    {
      key: "instanceSettingsTable",
      ...tableView(
        "instance-settings",
        [
          { field: "settingsId", display: "readOnly" },
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
          operations: [
            {
              operation: "instance-settings.update",
              label: "Edit settings",
              target: { kind: "row" },
              editView: "instanceSettingsEdit",
            },
          ],
          operationLabel: "Settings operations",
        },
      ),
    },
    {
      key: "emailDomainTable",
      ...tableView(
        "email-domain",
        [
          { field: "enabled", display: "editor" },
          "domain",
          "providerFamily",
          "primaryRoute",
          "deploymentConfig",
          "dnsStatus",
          "latestError",
        ],
        {
          operations: [
            {
              operation: "email-domain.update",
              label: "Edit email domain",
              target: { kind: "row" },
              editView: "emailDomainEdit",
            },
          ],
          operationLabel: "Email domain operations",
        },
      ),
    },
    {
      key: "emailSenderTable",
      ...tableView(
        "email-sender",
        [
          { field: "enabled", display: "editor" },
          "address",
          "displayName",
          "purpose",
          "emailDomain",
        ],
        {
          operations: [
            {
              operation: "email-sender.update",
              label: "Edit email sender",
              target: { kind: "row" },
              editView: "emailSenderEdit",
            },
          ],
          operationLabel: "Email sender operations",
        },
      ),
    },
  ],
  views: [
    {
      key: "appInstallCreate",
      ...createView("app-install", [
        "installId",
        "packageAppKey",
        "packageRevision",
        "sourceSchemaHash",
        "label",
        "registrationPolicy",
        "registrationOperation",
        "status",
        "storageIdentity",
      ]),
    },
    {
      key: "appInstallList",
      ...collectionView("App installs", "app-install", "appInstallAll", "appInstallTable", {
        navigation: true,
      }),
    },
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
          field: "appInstall",
          visibleWhen: { field: "targetProfile", values: ["app", "public-site"] },
        },
        {
          field: "surface",
          visibleWhen: { field: "targetProfile", values: ["app", "public-site"] },
        },
        { field: "access", visibleWhen: { field: "kind", values: ["mount"] } },
        { field: "requiredRole", visibleWhen: { field: "targetProfile", values: ["app"] } },
        "deploymentConfig",
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
          field: "appInstall",
          visibleWhen: { field: "targetProfile", values: ["app", "public-site"] },
        },
        {
          field: "surface",
          visibleWhen: { field: "targetProfile", values: ["app", "public-site"] },
        },
        { field: "access", visibleWhen: { field: "kind", values: ["mount"] } },
        { field: "requiredRole", visibleWhen: { field: "targetProfile", values: ["app"] } },
        "deploymentConfig",
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
    {
      key: "deploymentConfigCreate",
      ...createView("deployment-config", [
        "targetId",
        "targetKind",
        "label",
        "enabled",
        "targetUrl",
        "providerFamily",
        "accountId",
        "workerName",
        "credentialRef",
      ]),
    },
    {
      key: "deploymentConfigEdit",
      ...editView("deployment-config", [
        "label",
        "enabled",
        "targetUrl",
        "accountId",
        "workerName",
        "credentialRef",
      ]),
    },
    {
      key: "deploymentConfigList",
      ...collectionView(
        "Deployment configs",
        "deployment-config",
        "deploymentConfigAll",
        "deploymentConfigTable",
        {
          createView: "deploymentConfigCreate",
          extraQueries: ["deploymentConfigEnabled"],
        },
      ),
    },
    {
      key: "instanceSettingsCreate",
      ...createView("instance-settings", [
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
      ]),
    },
    {
      key: "instanceSettingsEdit",
      ...editView("instance-settings", [
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
      ]),
    },
    {
      key: "instanceSettingsList",
      ...collectionView(
        "Instance settings",
        "instance-settings",
        "instanceSettingsAll",
        "instanceSettingsTable",
        {
          createView: "instanceSettingsCreate",
        },
      ),
    },
    {
      key: "emailDomainCreate",
      ...createView("email-domain", [
        "enabled",
        "providerFamily",
        "domain",
        "primaryRoute",
        "deploymentConfig",
        "dnsStatus",
        "latestError",
      ]),
    },
    {
      key: "emailDomainEdit",
      ...editView("email-domain", [
        "enabled",
        "domain",
        "primaryRoute",
        "deploymentConfig",
        "dnsStatus",
        "latestError",
      ]),
    },
    {
      key: "emailDomainList",
      ...collectionView("Email domains", "email-domain", "emailDomainAll", "emailDomainTable", {
        createView: "emailDomainCreate",
        extraQueries: ["emailDomainEnabled"],
      }),
    },
    {
      key: "emailSenderCreate",
      ...createView("email-sender", [
        "enabled",
        "address",
        "displayName",
        "purpose",
        "emailDomain",
      ]),
    },
    {
      key: "emailSenderEdit",
      ...editView("email-sender", ["enabled", "address", "displayName", "purpose"]),
    },
    {
      key: "emailSenderList",
      ...collectionView("Email senders", "email-sender", "emailSenderAll", "emailSenderTable", {
        createView: "emailSenderCreate",
        extraQueries: ["emailSenderEnabled"],
      }),
    },
  ],
  screens: [
    {
      key: "apps",
      type: "workspace",
      label: "Apps",
      path: "/",
      layout: {
        type: "stack",
        sections: [{ id: "app-installs", type: "collection", view: "appInstallList" }],
      },
    },
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
    {
      key: "deployments",
      type: "workspace",
      label: "Deployments",
      path: "/deployments",
      layout: {
        type: "stack",
        sections: [{ id: "deployment-configs", type: "collection", view: "deploymentConfigList" }],
      },
    },
    {
      key: "settings",
      type: "workspace",
      label: "Settings",
      path: "/settings",
      layout: {
        type: "stack",
        sections: [
          { id: "instance-settings", type: "collection", view: "instanceSettingsList" },
          { id: "email-domains", type: "collection", view: "emailDomainList" },
          { id: "email-senders", type: "collection", view: "emailSenderList" },
        ],
      },
    },
  ],
  runtime: {
    owner: "runtime",
    controlPlane: {
      entities: {
        "app-install": {
          immutableFields: [...instanceControlPlaneImmutableFields["app-install"]],
        },
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
};

export const instanceControlPlaneSchema = parseAppSchema(instanceControlPlaneSourceSchema);

export function instanceControlPlaneStorageIdentityForInstall(
  installId: AppInstallId,
): `app:${AppInstallId}` {
  return `app:${installId}`;
}

export function instanceControlPlaneAppInstallRecord(
  install: AppInstall,
): InstanceControlPlaneRecord<"app-install", InstanceControlPlaneAppInstallValues> {
  return {
    createdAt: install.createdAt,
    entity: "app-install",
    id: install.installId,
    updatedAt: install.updatedAt,
    values: {
      installId: install.installId,
      packageAppKey: install.packageAppKey,
      packageRevision: install.packageRevision,
      sourceSchemaHash: install.sourceSchemaHash,
      label: install.label,
      registrationPolicy: install.registrationPolicy,
      ...(install.registrationOperation === undefined
        ? {}
        : { registrationOperation: install.registrationOperation }),
      status: install.status,
      storageIdentity: instanceControlPlaneStorageIdentityForInstall(install.installId),
    },
  };
}

export function instanceControlPlaneRecordsForAppInstall(input: {
  install: AppInstall;
  now: string;
}): [
  InstanceControlPlaneRecord<"app-install", InstanceControlPlaneAppInstallValues>,
  ...InstanceControlPlaneRecord<"route", InstanceControlPlaneRouteValues>[],
] {
  return [
    instanceControlPlaneAppInstallRecord(input.install),
    ...instanceControlPlaneRouteRecordsForAppInstall(input),
  ];
}

export function instanceControlPlaneAppInstallsFromRecords(
  records: readonly InstanceControlPlaneProjectionRecord[],
  packageResolver?: AppPackageResolver,
): AppInstall[] {
  const activeRecords = records.filter((record) => record.deletedAt === undefined);
  const routeRecords = activeRecords.filter((record) => record.entity === "route");

  return listAppInstalls(
    activeRecords
      .filter((record) => record.entity === "app-install" && record.values.status === "installed")
      .map((record) =>
        appInstallFromControlPlaneRecord(
          record,
          hostlessRouteRecordsForInstall(routeRecords, record.id),
          packageResolver,
        ),
      ),
  );
}

export function instanceControlPlaneAppLaunchLinksFromRecords(
  records: readonly InstanceControlPlaneProjectionRecord[],
  packageResolver?: AppPackageResolver,
): AppInstallLaunchLink[] {
  const activeRecords = records.filter((record) => record.deletedAt === undefined);
  const routeRecords = activeRecords.filter((record) => record.entity === "route");

  return activeRecords
    .filter((record) => record.entity === "app-install" && record.values.status === "installed")
    .sort(compareControlPlaneAppInstallRecords)
    .flatMap((record) =>
      appInstallLaunchLinksFromControlPlaneRecord(
        record,
        hostlessRouteRecordsForInstall(routeRecords, record.id),
        packageResolver,
      ),
    );
}
function appInstallFromControlPlaneRecord(
  record: InstanceControlPlaneProjectionRecord,
  routeRecords: {
    id: string;
    values: InstanceControlPlaneRouteValues;
  }[],
  packageResolver?: AppPackageResolver,
): AppInstall {
  const values = record.values;
  const packageAppKey = stringControlPlaneValue(values.packageAppKey);
  const packageApp =
    packageAppKey && packageResolver
      ? findResolvedAppPackage(packageAppKey, packageResolver)
      : undefined;

  if (!packageApp) {
    throw new Error(`Stored app install "${String(values.installId)}" has unsupported package.`);
  }

  const installId = stringControlPlaneValue(values.installId) ?? "";
  const label = stringControlPlaneValue(values.label) ?? "";
  const registrationPolicy = appInstallRegistrationPolicyFromControlPlaneValue(
    values.registrationPolicy,
    record.id,
  );
  const registrationOperation = appInstallRegistrationOperationFromControlPlaneValues(
    values,
    registrationPolicy,
    record.id,
  );
  const routes = appInstallRoutesFromControlPlaneRoutes(routeRecords, packageApp);
  const hasRouteRecords = routeRecords.length > 0;
  const adminRoute =
    enabledRoutePath(routes, "admin") ?? `${packageApp.adminRouteBase}/${installId}`;
  const publicRoute = enabledAppInstallRoute(routes, "publicSite");
  const launchLinks = appInstallLaunchLinks({
    installId,
    label,
    packageApp,
    routeRecords,
  });

  return {
    installId,
    packageAppKey: packageApp.packageAppKey,
    packageRevision: packageRevisionFromControlPlaneValue(
      values.packageRevision,
      packageApp.packageRevision,
    ),
    sourceSchemaHash: sourceSchemaHashFromControlPlaneValue(
      values.sourceSchemaHash,
      packageApp.sourceSchemaHash,
    ),
    label,
    registrationPolicy,
    ...(registrationOperation === undefined ? {} : { registrationOperation }),
    status: "installed",
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    adminRoute,
    ...(publicRoute
      ? {
          publicRoute: publicRoute.path,
          publicRoutePrefix:
            publicRoute.prefix ?? (`${publicRoute.path.replace(/\/+$/, "")}/` as `/${string}/`),
        }
      : packageApp.publicRouteBase === undefined || hasRouteRecords
        ? {}
        : {
            publicRoute: `${packageApp.publicRouteBase}/${installId}`,
            publicRoutePrefix: `${packageApp.publicRouteBase}/${installId}/`,
          }),
    ...(hasRouteRecords ? { routes } : {}),
    ...(launchLinks.length > 0 ? { launchLinks } : {}),
  };
}
function appInstallLaunchLinksFromControlPlaneRecord(
  record: InstanceControlPlaneProjectionRecord,
  routeRecords: {
    id: string;
    values: InstanceControlPlaneRouteValues;
  }[],
  packageResolver?: AppPackageResolver,
): AppInstallLaunchLink[] {
  const values = record.values;
  const packageAppKey = stringControlPlaneValue(values.packageAppKey);
  const packageApp =
    packageAppKey && packageResolver
      ? findResolvedAppPackage(packageAppKey, packageResolver)
      : undefined;
  const installId = stringControlPlaneValue(values.installId);

  if (!installId || !packageApp) {
    return [];
  }

  return appInstallLaunchLinks({
    installId,
    label: stringControlPlaneValue(values.label) ?? "",
    packageApp,
    routeRecords,
  });
}

function hostlessRouteRecordsForInstall(
  routeRecords: readonly InstanceControlPlaneProjectionRecord[],
  installRecordId: string,
): {
  id: string;
  values: InstanceControlPlaneRouteValues;
}[] {
  return routeRecords
    .filter(
      (routeRecord) =>
        routeRecord.values.appInstall === installRecordId &&
        routeRecord.values.matchHost === undefined,
    )
    .map((routeRecord) => ({
      id: routeRecord.id,
      values: routeRecord.values as InstanceControlPlaneRouteValues,
    }));
}
function appInstallRoutesFromControlPlaneRoutes(
  routeRecords: {
    id: string;
    values: InstanceControlPlaneRouteValues;
  }[],
  packageApp: {
    publicRouteBase?: "/sites";
  },
): AppInstallRoute[] {
  return routeRecords
    .flatMap((record) => {
      const route = appInstallRouteFromControlPlaneRoute(record.id, record.values, packageApp);

      return route ? [route] : [];
    })
    .sort(compareAppInstallRoutes);
}

function appInstallRouteFromControlPlaneRoute(
  id: string,
  values: InstanceControlPlaneRouteValues,
  packageApp: {
    publicRouteBase?: "/sites";
  },
): AppInstallRoute | undefined {
  if (values.kind !== "mount") {
    return undefined;
  }

  const routeKind = appInstallRouteKindFromRouteValues(values, packageApp);

  if (routeKind === undefined) {
    return undefined;
  }

  return {
    access: instanceControlPlaneEffectiveRouteAccess(values),
    enabled: values.enabled,
    id,
    path: values.matchPath,
    ...(values.matchPrefix === undefined ? {} : { prefix: values.matchPrefix as `/${string}/` }),
    ...(values.requiredRole === undefined ? {} : { requiredRole: values.requiredRole }),
    routeKind,
  };
}

function compareAppInstallRoutes(left: AppInstallRoute, right: AppInstallRoute) {
  const kindOrder =
    appInstallRouteKindOrder(left.routeKind) - appInstallRouteKindOrder(right.routeKind);

  return kindOrder === 0 ? left.path.localeCompare(right.path) : kindOrder;
}

function appInstallRouteKindOrder(kind: AppInstallRouteKind) {
  switch (kind) {
    case "admin":
      return 0;
    case "publicSite":
      return 1;
  }
}
function appInstallRouteKindFromRouteValues(
  values: Pick<InstanceControlPlaneRouteValues, "surface" | "targetProfile">,
  packageApp: {
    publicRouteBase?: "/sites";
  },
): AppInstallRouteKind | undefined {
  if (values.surface === "admin" && values.targetProfile === "app") {
    return "admin";
  }

  if (
    values.surface === "public-site" &&
    values.targetProfile === "public-site" &&
    packageApp.publicRouteBase !== undefined
  ) {
    return "publicSite";
  }

  return undefined;
}

function appInstallLaunchLinks(input: {
  installId: AppInstallId;
  label: string;
  packageApp: {
    adminRouteBase: "/apps";
    packageAppKey: PackageAppKey;
    publicRouteBase?: "/sites";
  };
  routeRecords: {
    id: string;
    values: InstanceControlPlaneRouteValues;
  }[];
}): AppInstallLaunchLink[] {
  if (input.routeRecords.length === 0) {
    return defaultAppInstallLaunchLinks(input);
  }

  return input.routeRecords
    .flatMap((record) => {
      const link = appInstallLaunchLinkFromControlPlaneRoute(record.id, record.values, input);

      return link ? [link] : [];
    })
    .sort(compareAppInstallLaunchLinks);
}

function appInstallLaunchLinkFromControlPlaneRoute(
  id: string,
  values: InstanceControlPlaneRouteValues,
  input: {
    installId: AppInstallId;
    label: string;
    packageApp: {
      packageAppKey: PackageAppKey;
      publicRouteBase?: "/sites";
    };
  },
): AppInstallLaunchLink | undefined {
  if (values.kind !== "mount" || values.enabled !== true) {
    return undefined;
  }

  const routeKind = appInstallRouteKindFromRouteValues(values, input.packageApp);

  if (routeKind === undefined) {
    return undefined;
  }

  return {
    access: instanceControlPlaneEffectiveRouteAccess(values),
    href: values.matchPath,
    installId: input.installId,
    label: input.label,
    packageAppKey: input.packageApp.packageAppKey,
    ...(values.requiredRole === undefined ? {} : { requiredRole: values.requiredRole }),
    routeId: id,
    routeKind,
  };
}

function defaultAppInstallLaunchLinks(input: {
  installId: AppInstallId;
  label: string;
  packageApp: {
    adminRouteBase: "/apps";
    packageAppKey: PackageAppKey;
    publicRouteBase?: "/sites";
  };
}): AppInstallLaunchLink[] {
  return [
    {
      access: "owner",
      href: `${input.packageApp.adminRouteBase}/${input.installId}` as `/${string}`,
      installId: input.installId,
      label: input.label,
      packageAppKey: input.packageApp.packageAppKey,
      routeKind: "admin",
    },
    ...(input.packageApp.publicRouteBase === undefined
      ? []
      : [
          {
            access: "anonymous" as const,
            href: `${input.packageApp.publicRouteBase}/${input.installId}` as `/${string}`,
            installId: input.installId,
            label: input.label,
            packageAppKey: input.packageApp.packageAppKey,
            routeKind: "publicSite" as const,
          },
        ]),
  ];
}

function compareControlPlaneAppInstallRecords(
  left: InstanceControlPlaneProjectionRecord,
  right: InstanceControlPlaneProjectionRecord,
) {
  const createdAtOrder = left.createdAt.localeCompare(right.createdAt);

  return createdAtOrder === 0 ? left.id.localeCompare(right.id) : createdAtOrder;
}

function compareAppInstallLaunchLinks(left: AppInstallLaunchLink, right: AppInstallLaunchLink) {
  const kindOrder =
    appInstallRouteKindOrder(left.routeKind) - appInstallRouteKindOrder(right.routeKind);

  return kindOrder === 0 ? left.href.localeCompare(right.href) : kindOrder;
}

function enabledRoutePath(
  routes: readonly AppInstallRoute[],
  routeKind: AppInstallRoute["routeKind"],
): `/${string}` | undefined {
  return enabledAppInstallRoute(routes, routeKind)?.path;
}

function enabledAppInstallRoute(
  routes: readonly AppInstallRoute[],
  routeKind: AppInstallRoute["routeKind"],
): AppInstallRoute | undefined {
  return routes.find((route) => route.enabled && route.routeKind === routeKind);
}

function packageRevisionFromControlPlaneValue(
  value: unknown,
  fallback: PackageAppRevision,
): PackageAppRevision {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function sourceSchemaHashFromControlPlaneValue(
  value: unknown,
  fallback: SourceSchemaHash,
): SourceSchemaHash {
  return isSourceSchemaHash(value) ? value : fallback;
}

function appInstallRegistrationPolicyFromControlPlaneValue(
  value: unknown,
  installId: string,
): AppInstallRegistrationPolicy {
  if (isAppInstallRegistrationPolicy(value)) {
    return value;
  }

  throw new Error(`Stored app install "${installId}" has unsupported registration policy.`);
}

function appInstallRegistrationOperationFromControlPlaneValues(
  values: Readonly<Record<string, unknown>>,
  registrationPolicy: AppInstallRegistrationPolicy,
  installId: string,
): AppInstallRegistrationOperation | undefined {
  const value = values.registrationOperation;

  if (registrationPolicy === "custom-operation") {
    try {
      return parseAppInstallRegistrationOperation(
        value,
        `Stored app install "${installId}" registrationOperation`,
      );
    } catch {
      throw new Error(`Stored app install "${installId}" has invalid registration operation.`);
    }
  }

  if (value !== undefined) {
    throw new Error(`Stored app install "${installId}" has unexpected registration operation.`);
  }

  return undefined;
}

function stringControlPlaneValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function instanceControlPlaneAppRouteId(
  installId: AppInstallId,
  routeKind: InstanceControlPlaneAppRouteKind,
): string {
  return `route:${installId}:${routeKind === "publicSite" ? "public-site" : routeKind}`;
}

export function instanceControlPlaneDefaultRoutesForInstall(input: {
  installId: AppInstallId;
  packageAppKey: PackageAppKey;
  packageResolver?: AppPackageResolver;
  now: string;
}): InstanceControlPlaneRecord<"route", InstanceControlPlaneRouteValues>[] {
  const packageApp = input.packageResolver
    ? findResolvedAppPackage(input.packageAppKey, input.packageResolver)
    : undefined;
  const adminRouteBase = packageApp?.adminRouteBase ?? "/apps";
  const adminRoute = `${adminRouteBase}/${input.installId}` as `/${string}`;
  const publicRouteBase = packageApp?.publicRouteBase;
  const routeInput = { install: { installId: input.installId }, now: input.now };
  const adminRouteRecord = mountRouteRecord(routeInput, {
    access: "authenticated",
    matchPath: adminRoute,
    matchPrefix: `${adminRoute}/`,
    requiredRole: "app.admin",
    surface: "admin",
    targetProfile: "app",
  });

  if (publicRouteBase === undefined) {
    return [adminRouteRecord];
  }

  return [
    adminRouteRecord,
    mountRouteRecord(routeInput, {
      matchPath: `${publicRouteBase}/${input.installId}`,
      matchPrefix: `${publicRouteBase}/${input.installId}/`,
      surface: "public-site",
      targetProfile: "public-site",
    }),
  ];
}

export function instanceControlPlaneRouteRecordsForAppInstall(input: {
  install: Pick<
    AppInstall,
    "adminRoute" | "installId" | "packageAppKey" | "publicRoute" | "publicRoutePrefix"
  >;
  now: string;
}): InstanceControlPlaneRecord<"route", InstanceControlPlaneRouteValues>[] {
  const records = [
    mountRouteRecord(input, {
      access: "authenticated",
      matchPath: input.install.adminRoute,
      matchPrefix: `${input.install.adminRoute}/`,
      requiredRole: "app.admin",
      surface: "admin",
      targetProfile: "app",
    }),
  ];

  if (input.install.publicRoute !== undefined) {
    records.push(
      mountRouteRecord(input, {
        matchPath: input.install.publicRoute,
        matchPrefix:
          input.install.publicRoutePrefix ??
          (`${input.install.publicRoute.replace(/\/+$/, "")}/` as `/${string}/`),
        surface: "public-site",
        targetProfile: "public-site",
      }),
    );
  }

  return records;
}

export function isInstanceControlPlaneRouteSafePath(path: string): path is `/${string}` {
  if (!/^\/[a-z0-9._~-]+(?:\/[a-z0-9._~-]+)*$/.test(path)) {
    return false;
  }

  return !instanceControlPlaneReservedRoutePaths.some(
    (reservedPath) => path === reservedPath || path.startsWith(`${reservedPath}/`),
  );
}
function mountRouteRecord(
  input: {
    install: Pick<AppInstall, "installId">;
    now: string;
  },
  route: {
    access?: InstanceControlPlaneRouteAccess;
    matchPath: `/${string}`;
    matchPrefix?: `/${string}`;
    surface: InstanceControlPlaneRouteSurface;
    targetProfile: InstanceControlPlaneRouteTargetProfile;
    requiredRole?: InstanceControlPlaneRouteRequiredRole;
  },
): InstanceControlPlaneRecord<"route", InstanceControlPlaneRouteValues> {
  return {
    createdAt: input.now,
    entity: "route",
    id: instanceControlPlaneAppRouteId(
      input.install.installId,
      route.surface === "public-site" ? "publicSite" : route.surface,
    ),
    updatedAt: input.now,
    values: {
      enabled: true,
      matchPath: route.matchPath,
      ...(route.matchPrefix === undefined ? {} : { matchPrefix: route.matchPrefix }),
      kind: "mount",
      targetProfile: route.targetProfile,
      appInstall: input.install.installId,
      surface: route.surface,
      access:
        route.access ??
        instanceControlPlaneDefaultRouteAccess({
          kind: "mount",
          surface: route.surface,
          targetProfile: route.targetProfile,
        }),
      ...(route.requiredRole === undefined ? {} : { requiredRole: route.requiredRole }),
    },
  };
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
  context?: string;
  packageResolver?: AppPackageResolver;
  sourceLabel?: string;
};

export function parseInstanceControlPlaneStorageSnapshot(
  context: string,
  value: unknown,
  options: InstanceControlPlaneRecordValidationOptions = {},
): StorageSnapshot {
  const snapshot = parseStorageSnapshot(value, {
    schemaKey: INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
    storageIdentity: INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
  });

  validateInstanceControlPlaneRecords(`${context} records`, snapshot.records, options);

  return snapshot;
}

export function reviewableInstanceControlPlaneStorageSnapshot(
  snapshot: StorageSnapshot,
  options: InstanceControlPlaneRecordValidationOptions = {},
): StorageSnapshot {
  const parsed = parseStorageSnapshot(snapshot, {
    schemaKey: INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
    storageIdentity: INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
  });
  const records = reviewableInstanceControlPlaneRecords(parsed.records, options);

  return {
    ...parsed,
    records,
    sourceCursor: records.length,
  };
}

export function canonicalizeInstanceControlPlaneStorageSnapshot(
  snapshot: StorageSnapshot,
  options: InstanceControlPlaneRecordValidationOptions = {},
): StorageSnapshot {
  const reviewable = reviewableInstanceControlPlaneStorageSnapshot(snapshot, options);

  return {
    kind: reviewable.kind,
    version: reviewable.version,
    storageIdentity: reviewable.storageIdentity,
    schemaKey: reviewable.schemaKey,
    exportedAt: reviewable.exportedAt,
    schemaUpdatedAt: reviewable.schemaUpdatedAt,
    sourceCursor: reviewable.sourceCursor,
    schema: stableJsonValue(reviewable.schema) as AppSchema,
    records: formatStoredRecordsForArtifact(
      reviewable.schema,
      reviewable.records.map(canonicalInstanceControlPlaneRecord),
    ),
  };
}

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

export function validateInstanceControlPlaneRecords(
  context: string,
  records: readonly StoredRecord[],
  options: InstanceControlPlaneRecordValidationOptions = {},
) {
  const recordsById = new Map<string, StoredRecord>();

  for (const record of records) {
    if (recordsById.has(record.id)) {
      throw new Error(`${context} includes duplicate control-plane record id "${record.id}".`);
    }

    recordsById.set(record.id, record);
  }

  for (const record of records) {
    validateInstanceControlPlaneRecord(context, record, recordsById, options);
  }

  validateInstanceControlPlaneUniqueConstraints(context, records);
  validateInstanceSettingsSingleton(context, records);
  assertInstanceControlPlaneRoutesAreValid(context, records, options);
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
  options: InstanceControlPlaneRecordValidationOptions,
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

    if (
      entity === "app-install" &&
      fieldName === "packageAppKey" &&
      typeof value === "string" &&
      !schemaLocalEntityKeyPattern.test(value)
    ) {
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

  if (entity === "app-install") {
    validateAppInstallImmutableIdentity(context, record);
    validateAppInstallRegistrationPolicy(context, record);
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

  if (entity === "app-install" && options.packageResolver !== undefined) {
    const packageAppKey = requiredStringValue(context, record, "packageAppKey");

    if (!findResolvedAppPackage(packageAppKey, options.packageResolver)) {
      throw new Error(
        `${context} record "${record.id}" field "${controlPlaneFieldLabel(record, "packageAppKey")}" references unsupported package "${packageAppKey}".`,
      );
    }
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

function validateAppInstallImmutableIdentity(context: string, record: StoredRecord) {
  const installId = requiredStringValue(context, record, "installId");
  const storageIdentity = requiredStringValue(context, record, "storageIdentity");

  if (record.id !== installId) {
    throw new Error(
      `${context} record "${record.id}" field "${controlPlaneFieldLabel(record, "installId")}" must match record id.`,
    );
  }

  if (storageIdentity !== `app:${installId}`) {
    throw new Error(
      `${context} record "${record.id}" field "${controlPlaneFieldLabel(record, "storageIdentity")}" must be "app:${installId}".`,
    );
  }
}

function validateAppInstallRegistrationPolicy(context: string, record: StoredRecord) {
  const registrationPolicy = requiredStringValue(context, record, "registrationPolicy");

  if (!isAppInstallRegistrationPolicy(registrationPolicy)) {
    throw new Error(
      `${context} record "${record.id}" has invalid field "${controlPlaneFieldLabel(record, "registrationPolicy")}".`,
    );
  }

  validateAppInstallRegistrationOperation(
    context,
    record,
    registrationPolicy,
    `${context} record "${record.id}"`,
  );
}

function validateAppInstallRegistrationOperation(
  context: string,
  record: Pick<StoredRecord, "entity" | "id" | "values">,
  registrationPolicy: AppInstallRegistrationPolicy,
  recordContext: string,
) {
  const registrationOperation = record.values.registrationOperation;

  if (registrationPolicy === "custom-operation") {
    if (registrationOperation === undefined) {
      throw new Error(
        `${recordContext} field "${controlPlaneFieldLabel(record, "registrationOperation")}" is required when registration policy is "custom-operation".`,
      );
    }

    try {
      parseAppInstallRegistrationOperation(
        registrationOperation,
        `${recordContext} field "${controlPlaneFieldLabel(record, "registrationOperation")}"`,
      );
    } catch {
      throw new Error(
        `${context} record "${record.id}" has invalid field "${controlPlaneFieldLabel(record, "registrationOperation")}".`,
      );
    }

    return;
  }

  if (registrationOperation !== undefined) {
    throw new Error(
      `${recordContext} field "${controlPlaneFieldLabel(record, "registrationOperation")}" must be omitted unless registration policy is "custom-operation".`,
    );
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
  options: InstanceControlPlaneRecordValidationOptions,
) {
  const activeRecords = new Map(
    records.filter((record) => !record.deletedAt).map((record) => [record.id, record]),
  );
  const routes = records.filter(
    (record) =>
      instanceControlPlaneRecordSourceEntityName(record.entity) === "route" && !record.deletedAt,
  );

  for (const route of routes) {
    validateSourceRoute(context, route, activeRecords, routes, options);
  }
}

function validateSourceRoute(
  context: string,
  route: StoredRecord,
  activeRecords: ReadonlyMap<string, StoredRecord>,
  routes: readonly StoredRecord[],
  options: InstanceControlPlaneRecordValidationOptions,
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
    validateSourceMountRoute(
      context,
      route,
      activeRecords,
      matchHost,
      matchPath,
      matchPrefix,
      options,
    );
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
  const requiredRole = optionalStringValue(context, route, "requiredRole");
  const targetProfile = optionalStringValue(context, route, "targetProfile");
  const appInstall = optionalStringValue(context, route, "appInstall");
  const surface = optionalStringValue(context, route, "surface");

  if (access === "management" && (kind !== "mount" || targetProfile !== "instance")) {
    throw new Error(
      `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "access")}" can only be "management" for instance mount routes.`,
    );
  }

  if (requiredRole === undefined) {
    return;
  }

  if (requiredRole !== "app.admin") {
    throw new Error(
      `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "requiredRole")}" must be "app.admin".`,
    );
  }

  if (
    kind !== "mount" ||
    access !== "authenticated" ||
    targetProfile !== "app" ||
    appInstall === undefined ||
    surface !== "admin"
  ) {
    throw new Error(
      `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "requiredRole")}" requires an authenticated app admin mount with one app install.`,
    );
  }
}

function validateSourceMountRoute(
  context: string,
  route: StoredRecord,
  activeRecords: ReadonlyMap<string, StoredRecord>,
  matchHost: string | undefined,
  matchPath: string,
  matchPrefix: string | undefined,
  options: InstanceControlPlaneRecordValidationOptions,
) {
  const targetProfile = optionalStringValue(context, route, "targetProfile");
  const appInstall = optionalStringValue(context, route, "appInstall");
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
    if (appInstall !== undefined) {
      throw new Error(
        `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "appInstall")}" is incompatible with instance mount routes.`,
      );
    }

    if (surface !== undefined && surface !== "admin") {
      throw new Error(
        `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "surface")}" is incompatible with instance mount routes.`,
      );
    }

    return;
  }

  if (targetProfile !== "app" && targetProfile !== "public-site") {
    throw new Error(
      `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "targetProfile")}" is invalid for mount routes.`,
    );
  }

  if (appInstall === undefined) {
    throw new Error(
      `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "appInstall")}" is required for ${targetProfile} mount routes.`,
    );
  }

  const install = activeRecords.get(appInstall);

  if (!install || instanceControlPlaneRecordSourceEntityName(install.entity) !== "app-install") {
    throw new Error(
      `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "appInstall")}" references unknown instance:app-install record "${appInstall}".`,
    );
  }

  if (install.values.status !== "installed") {
    throw new Error(
      `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "appInstall")}" references non-installed instance:app-install record "${appInstall}".`,
    );
  }

  if (targetProfile === "app") {
    if (surface !== "admin") {
      throw new Error(
        `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "surface")}" must be "admin" for app mount routes.`,
      );
    }

    return;
  }

  if (surface !== "public-site") {
    throw new Error(
      `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "surface")}" must be "public-site" for public-site mount routes.`,
    );
  }

  assertInstallSupportsPublicSiteRoute(context, route, install, appInstall, options);

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

  for (const fieldName of ["targetProfile", "appInstall", "surface"] as const) {
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

function assertInstallSupportsPublicSiteRoute(
  context: string,
  route: StoredRecord,
  install: StoredRecord,
  appInstall: string,
  options: InstanceControlPlaneRecordValidationOptions,
) {
  const packageAppKey =
    typeof install.values.packageAppKey === "string" ? install.values.packageAppKey : "";

  if (options.packageResolver === undefined) {
    throw new Error(
      `${context} route "${route.id}" requires an active package resolver to validate public Site capability for app-install record "${appInstall}".`,
    );
  }

  const packageApp = findResolvedAppPackage(packageAppKey, options.packageResolver);

  if (packageApp === undefined) {
    throw new Error(
      `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "appInstall")}" references app-install record "${appInstall}" with unresolved package app "${packageAppKey}".`,
    );
  }

  if (packageApp.publicRouteBase === undefined) {
    throw new Error(
      `${context} route "${route.id}" field "${controlPlaneFieldLabel(route, "appInstall")}" references app-install record "${appInstall}" without public Site capability.`,
    );
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

const schemaLocalEntityKeyPattern = /^[a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*$/;
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

function optionalNumberField(label: string): FieldSchema {
  return { type: "number", required: false, label, integer: true, min: 0 };
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
function itemView(entity: InstanceControlPlaneEntityName, fields: string[]) {
  return {
    entity,
    fields: fields.map((field) => ({ field, ...viewField(editorForField(field)) })),
  } satisfies Omit<AppSchema["itemViews"][number], "key">;
}
function tableView(
  entity: InstanceControlPlaneEntityName,
  fields: InstanceControlPlaneTableField[],
  options: {
    operationLabel?: string;
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
              label: options.operationLabel ?? "Actions",
              operations: options.operations.map((operation) => operation.operation),
              align: "end",
              width: "xs",
              presentation: "dropdown",
            } satisfies AppSchema["tableViews"][number]["columns"][number],
          ]),
    ],
  } satisfies Omit<AppSchema["tableViews"][number], "key">;
}
function tableFieldColumn(fieldInput: InstanceControlPlaneTableField) {
  const field = typeof fieldInput === "string" ? fieldInput : fieldInput.field;
  const display = typeof fieldInput === "string" ? "readOnly" : (fieldInput.display ?? "readOnly");

  return {
    type: "field",
    field,
    display,
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
      : { operations: [{ operation: `${entity}.create`, createView: options.createView }] }),
  } satisfies Omit<Extract<AppSchema["views"][number], { type: "collection" }>, "key">;
}
function writeOperations(
  label: string,
  fields: string[],
  options: {
    updateFields?: string[];
  } = {},
) {
  const input = { fields: fields.map((field) => ({ key: field, field })) };
  const updateInput = {
    fields: (options.updateFields ?? fields).map((field) => ({ key: field, field })),
  };
  return [
    {
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
  return {
    editor,
    commit:
      editor === "boolean" || editor === "enum" || editor === "reference"
        ? "immediate"
        : "field-commit",
  } satisfies Omit<AppSchema["itemViews"][number]["fields"][number], "field">;
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
    field === "revision" ||
    field === "packageRevision" ||
    field === "createCount" ||
    field === "updateCount" ||
    field === "deleteCount"
  ) {
    return "number";
  }

  if (
    field === "status" ||
    field === "routeKind" ||
    field === "surface" ||
    field === "access" ||
    field === "requiredRole" ||
    field === "packageCapability" ||
    field === "registrationPolicy" ||
    field === "targetKind" ||
    field === "targetProfile" ||
    field === "providerFamily" ||
    field === "observedStatus" ||
    field === "dnsStatus" ||
    field === "productionIdentityStatus" ||
    field === "purpose" ||
    field === "profile" ||
    field === "statusCode" ||
    field === "kind" ||
    field === "mode" ||
    field === "actorKind" ||
    field === "action"
  ) {
    return "enum";
  }

  if (
    field === "appInstall" ||
    field === "appRoute" ||
    field === "deploymentConfig" ||
    field === "primaryRoute" ||
    field === "adminRoute" ||
    field === "authRoute" ||
    field === "defaultEmailDomain" ||
    field === "defaultContactSender" ||
    field === "defaultAuthSender" ||
    field === "emailDomain" ||
    field === "route" ||
    field === "domainMapping" ||
    field === "redirectIntent" ||
    field === "deployAttempt"
  ) {
    return "reference";
  }

  if (
    field === "inputsJson" ||
    field === "dependenciesJson" ||
    field === "providerResourceIdsJson" ||
    field === "affectedLogicalIdsJson" ||
    field === "latestError"
  ) {
    return "textarea";
  }

  if (field === "toUrl" || field === "canonicalOrigin" || field === "authOrigin") {
    return "href";
  }

  return "text";
}
