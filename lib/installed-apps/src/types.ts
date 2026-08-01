export type SourceSchemaHash = `sha256:${string}`;
export type PackageAppRevision = number;

export type PackageAppKey = string;
export type AppPackageKey = PackageAppKey;
export type AppInstallId = string;
export type AppInstallStatus = "installed";
export type AppInstallRouteAccess = "anonymous" | "authenticated" | "management" | "owner";
export type AppInstallRouteKind = "admin";
export type AppInstallRouteRequiredRole = "app.admin";

export type AppInstallRoute = {
  access?: AppInstallRouteAccess;
  enabled: boolean;
  id: string;
  path: `/${string}`;
  prefix?: `/${string}/`;
  requiredRole?: AppInstallRouteRequiredRole;
  routeKind: AppInstallRouteKind;
};

export type AppInstallLaunchLink = {
  access: AppInstallRouteAccess;
  href: `/${string}`;
  installId: AppInstallId;
  label: string;
  packageAppKey: PackageAppKey;
  requiredRole?: AppInstallRouteRequiredRole;
  routeId?: string;
  routeKind: AppInstallRouteKind;
};

export type AppInstall = {
  installId: AppInstallId;
  packageAppKey: PackageAppKey;
  packageRevision: PackageAppRevision;
  sourceSchemaHash: SourceSchemaHash;
  label: string;
  status: AppInstallStatus;
  createdAt: string;
  updatedAt: string;
  adminRoute: `/${string}`;
  routes?: AppInstallRoute[];
  launchLinks?: AppInstallLaunchLink[];
};

export const appPackageManifestKind = "formless.appPackage";
export const appPackageManifestVersion = 1;

export type AppPackageSourceOrigin = "bundled" | "workspace";
export type AppPackageSourceLocationKind = AppPackageSourceOrigin;

export type AppPackageSourceLocation = {
  kind: AppPackageSourceLocationKind;
  key: string;
  path: string;
};

export type AppPackageCapability = {
  kind: "generatedAdmin";
  routeBase: "/apps";
};

export type AppPackageManifest = {
  kind: typeof appPackageManifestKind;
  version: typeof appPackageManifestVersion;
  packageAppKey: PackageAppKey;
  label: string;
  description?: string;
  defaultInstallId: string;
  supportsMultipleInstalls: boolean;
  packageRevision: PackageAppRevision;
  sourceSchema: AppPackageSourceLocation;
  sourceSchemaHash: SourceSchemaHash;
  capabilities: AppPackageCapability[];
};

export type ResolvedAppPackage = {
  packageAppKey: PackageAppKey;
  packageRevision: PackageAppRevision;
  sourceSchemaHash: SourceSchemaHash;
  label: string;
  description: string;
  defaultInstallId: string;
  supportsMultipleInstalls: boolean;
  sourceOrigin: AppPackageSourceOrigin;
  sourceSchemaKey: string;
  sourceSchemaLocation: AppPackageSourceLocation;
};

export type AppPackageResolver = {
  findPackage(packageAppKey: string): ResolvedAppPackage | undefined;
  listPackages(): ResolvedAppPackage[];
};

export type InstallableAppPackage = ResolvedAppPackage;

export type AppInstallInitializationPlan = {
  installId: AppInstallId;
  packageAppKey: PackageAppKey;
  sourceSchemaKey: string;
};

export type AppInstallRegistryErrorCode =
  | "duplicate-install-id"
  | "invalid-install-id"
  | "invalid-label"
  | "source-validation-failed"
  | "unsupported-package";

export type AppInstallRegistryError = {
  code: AppInstallRegistryErrorCode;
  field?: "installId" | "label" | "packageAppKey" | "source";
  message: string;
};

export type AppInstallIdValidationResult =
  | {
      ok: true;
      installId: AppInstallId;
    }
  | {
      ok: false;
      error: AppInstallRegistryError;
    };

export type AppInstallSourceValidationContext = {
  install: AppInstall;
  initialization: AppInstallInitializationPlan;
  packageApp: ResolvedAppPackage;
};

export type CreateAppInstallInput = {
  existingInstalls: readonly AppInstall[];
  installId: string;
  label: string;
  now: string;
  packageAppKey: string;
  packageResolver: AppPackageResolver;
  validateInitialSource?: (
    context: AppInstallSourceValidationContext,
  ) => AppInstallRegistryError | undefined;
};

export type CreateAppInstallResult =
  | {
      ok: true;
      initialization: AppInstallInitializationPlan;
      install: AppInstall;
      installs: AppInstall[];
    }
  | {
      ok: false;
      error: AppInstallRegistryError;
      installs: readonly AppInstall[];
    };
