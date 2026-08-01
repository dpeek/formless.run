import { canonicalJsonStringify } from "@dpeek/formless-schema";

import {
  appPackageManifestKind,
  appPackageManifestVersion,
  type AppInstall,
  type AppInstallId,
  type AppInstallIdValidationResult,
  type AppInstallInitializationPlan,
  type AppInstallRegistryError,
  type AppInstallRegistryErrorCode,
  type AppPackageCapability,
  type AppPackageManifest,
  type AppPackageResolver,
  type AppPackageSourceLocation,
  type CreateAppInstallInput,
  type CreateAppInstallResult,
  type InstallableAppPackage,
  type PackageAppRevision,
  type ResolvedAppPackage,
  type SourceSchemaHash,
} from "./types.ts";

export * from "./types.ts";

const installIdMinLength = 2;
const installIdMaxLength = 48;
const installIdPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const routeSafeIdPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const routeSafeIdMinLength = 2;
const routeSafeIdMaxLength = 64;
const sourceLocationPathPattern = /^[a-z0-9][a-z0-9._/-]*\.json$/;
const sha256DigestPattern = /^sha256:[a-f0-9]{64}$/;
const reservedInstallIds = new Set([
  "admin",
  "api",
  "app",
  "apps",
  "asset",
  "assets",
  "favicon",
  "new",
  "robots",
  "schema",
  "setup",
  "sites",
  "sitemap",
  "static",
]);

export function parseAppPackageManifest(
  value: unknown,
  context = "app package manifest",
): AppPackageManifest {
  const object = parseObject(value, context);
  rejectUnknownKeys(object, context, [
    "capabilities",
    "defaultInstallId",
    "description",
    "kind",
    "label",
    "packageAppKey",
    "packageRevision",
    "sourceSchema",
    "sourceSchemaHash",
    "supportsMultipleInstalls",
    "version",
  ]);

  if (object.kind !== appPackageManifestKind) {
    throw new Error(`${context} kind must be "${appPackageManifestKind}".`);
  }

  if (object.version !== appPackageManifestVersion) {
    throw new Error(`${context} version must be ${appPackageManifestVersion}.`);
  }

  const packageAppKey = parseRouteSafeId(object.packageAppKey, `${context} packageAppKey`);
  const defaultInstallId = parseRouteSafeId(object.defaultInstallId, `${context} defaultInstallId`);

  if (reservedInstallIds.has(defaultInstallId)) {
    throw new Error(`${context} defaultInstallId "${defaultInstallId}" is reserved.`);
  }

  const label = parseRequiredString(object.label, `${context} label`);
  const description =
    object.description === undefined
      ? undefined
      : parseRequiredString(object.description, `${context} description`);
  const supportsMultipleInstalls = parseBoolean(
    object.supportsMultipleInstalls,
    `${context} supportsMultipleInstalls`,
  );
  const packageRevision = parsePackageRevision(
    object.packageRevision,
    `${context} packageRevision`,
  );
  const sourceSchema = parseSourceLocation(object.sourceSchema, `${context} sourceSchema`);
  const sourceSchemaHash = parseSourceSchemaHash(
    object.sourceSchemaHash,
    `${context} sourceSchemaHash`,
  );
  const capabilities = parseCapabilities(object.capabilities, `${context} capabilities`);

  return {
    kind: appPackageManifestKind,
    version: appPackageManifestVersion,
    packageAppKey,
    label,
    ...(description === undefined ? {} : { description }),
    defaultInstallId,
    supportsMultipleInstalls,
    packageRevision,
    sourceSchema,
    sourceSchemaHash,
    capabilities,
  };
}

export function createAppPackageResolver(manifests: readonly unknown[]): AppPackageResolver {
  const packages = manifests.map((manifest, index) =>
    resolveAppPackageManifest(manifest, `app package manifests[${index}]`),
  );
  const packagesByKey = new Map<string, ResolvedAppPackage>();

  for (const appPackage of packages) {
    if (packagesByKey.has(appPackage.packageAppKey)) {
      throw new Error(`Package app key "${appPackage.packageAppKey}" is already resolved.`);
    }

    packagesByKey.set(appPackage.packageAppKey, appPackage);
  }

  return {
    findPackage(packageAppKey) {
      const appPackage = packagesByKey.get(packageAppKey);

      return appPackage ? cloneResolvedAppPackage(appPackage) : undefined;
    },
    listPackages() {
      return packages.map(cloneResolvedAppPackage);
    },
  };
}

export function listResolvedAppPackages(resolver: AppPackageResolver): ResolvedAppPackage[] {
  return resolver.listPackages();
}

export function findResolvedAppPackage(
  packageAppKey: string,
  resolver: AppPackageResolver,
): ResolvedAppPackage | undefined {
  return resolver.findPackage(packageAppKey);
}

export function listInstallableAppPackages(resolver: AppPackageResolver): InstallableAppPackage[] {
  return listResolvedAppPackages(resolver);
}

export function packageAppFactsForKey(
  packageAppKey: string,
  resolver: AppPackageResolver,
):
  | {
      packageRevision: PackageAppRevision;
      sourceSchemaHash: SourceSchemaHash;
    }
  | undefined {
  const packageApp = findResolvedAppPackage(packageAppKey, resolver);

  return packageApp
    ? {
        packageRevision: packageApp.packageRevision,
        sourceSchemaHash: packageApp.sourceSchemaHash,
      }
    : undefined;
}

export function listAppInstalls(installs: readonly AppInstall[]): AppInstall[] {
  return [...installs].sort((left, right) => {
    const createdAtOrder = left.createdAt.localeCompare(right.createdAt);

    return createdAtOrder === 0 ? left.installId.localeCompare(right.installId) : createdAtOrder;
  });
}

export function findAppInstall(
  installs: readonly AppInstall[],
  installId: string,
): AppInstall | undefined {
  return installs.find((install) => install.installId === installId);
}

export function validateAppInstallId(value: string): AppInstallIdValidationResult {
  const installId = value.trim();

  if (installId === "") {
    return {
      ok: false,
      error: appInstallRegistryError("invalid-install-id", "installId", "Install id is required."),
    };
  }

  if (installId.length < installIdMinLength) {
    return {
      ok: false,
      error: appInstallRegistryError(
        "invalid-install-id",
        "installId",
        `Install id must be at least ${installIdMinLength} characters.`,
      ),
    };
  }

  if (installId.length > installIdMaxLength) {
    return {
      ok: false,
      error: appInstallRegistryError(
        "invalid-install-id",
        "installId",
        `Install id must be ${installIdMaxLength} characters or fewer.`,
      ),
    };
  }

  if (reservedInstallIds.has(installId)) {
    return {
      ok: false,
      error: appInstallRegistryError(
        "invalid-install-id",
        "installId",
        `Install id "${installId}" is reserved.`,
      ),
    };
  }

  if (!installIdPattern.test(installId)) {
    return {
      ok: false,
      error: appInstallRegistryError(
        "invalid-install-id",
        "installId",
        "Install id must start with a lowercase letter and use lowercase letters, numbers, and single hyphens.",
      ),
    };
  }

  return {
    ok: true,
    installId,
  };
}

export function createAppInstall(input: CreateAppInstallInput): CreateAppInstallResult {
  const packageApp = findResolvedAppPackage(input.packageAppKey, input.packageResolver);

  if (!packageApp) {
    return {
      ok: false,
      error: appInstallRegistryError(
        "unsupported-package",
        "packageAppKey",
        `Package app "${input.packageAppKey}" is not installable.`,
      ),
      installs: input.existingInstalls,
    };
  }

  const installIdResult = validateAppInstallId(input.installId);

  if (!installIdResult.ok) {
    return {
      ok: false,
      error: installIdResult.error,
      installs: input.existingInstalls,
    };
  }

  if (findAppInstall(input.existingInstalls, installIdResult.installId)) {
    return {
      ok: false,
      error: appInstallRegistryError(
        "duplicate-install-id",
        "installId",
        `Install id "${installIdResult.installId}" is already installed.`,
      ),
      installs: input.existingInstalls,
    };
  }

  const label = input.label.trim();

  if (label === "") {
    return {
      ok: false,
      error: appInstallRegistryError("invalid-label", "label", "Install label is required."),
      installs: input.existingInstalls,
    };
  }

  const install = appInstallFromPackage({
    installId: installIdResult.installId,
    label,
    now: input.now,
    packageApp,
  });
  const initialization = initializationPlanForInstall(packageApp, install);

  try {
    const sourceValidationError = input.validateInitialSource?.({
      install,
      initialization,
      packageApp,
    });

    if (sourceValidationError) {
      return {
        ok: false,
        error: sourceValidationError,
        installs: input.existingInstalls,
      };
    }
  } catch (error) {
    return {
      ok: false,
      error: appInstallRegistryError(
        "source-validation-failed",
        "source",
        error instanceof Error && error.message.trim() !== ""
          ? error.message
          : "Initial source validation failed.",
      ),
      installs: input.existingInstalls,
    };
  }

  return {
    ok: true,
    initialization,
    install,
    installs: [...input.existingInstalls, install],
  };
}

export function appInstallInitializationPlan(
  install: AppInstall,
  resolver: AppPackageResolver,
): AppInstallInitializationPlan {
  const packageApp = findResolvedAppPackage(install.packageAppKey, resolver);

  if (!packageApp) {
    throw new Error(`Package app "${install.packageAppKey}" is not installable.`);
  }

  return initializationPlanForInstall(packageApp, install);
}

export function appInstallRegistryError(
  code: AppInstallRegistryErrorCode,
  field: AppInstallRegistryError["field"],
  message: string,
): AppInstallRegistryError {
  return {
    code,
    ...(field === undefined ? {} : { field }),
    message,
  };
}

export function sourceSchemaCanonicalJson(schema: unknown): string {
  return canonicalJsonStringify(schema);
}

export async function computeSourceSchemaHash(schema: unknown): Promise<SourceSchemaHash> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(sourceSchemaCanonicalJson(schema)),
  );
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return `sha256:${hex}`;
}

export function isSourceSchemaHash(value: unknown): value is SourceSchemaHash {
  return typeof value === "string" && sha256DigestPattern.test(value);
}

export function isPackageAppRevision(value: unknown): value is PackageAppRevision {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function resolveAppPackageManifest(manifest: unknown, context: string): ResolvedAppPackage {
  const parsed = parseAppPackageManifest(manifest, context);

  return {
    packageAppKey: parsed.packageAppKey,
    packageRevision: parsed.packageRevision,
    sourceSchemaHash: parsed.sourceSchemaHash,
    label: parsed.label,
    description: parsed.description ?? "",
    defaultInstallId: parsed.defaultInstallId,
    supportsMultipleInstalls: parsed.supportsMultipleInstalls,
    sourceOrigin: parsed.sourceSchema.kind,
    sourceSchemaKey: parsed.sourceSchema.key,
    sourceSchemaLocation: cloneSourceLocation(parsed.sourceSchema),
  };
}

function appInstallFromPackage(input: {
  installId: AppInstallId;
  label: string;
  now: string;
  packageApp: ResolvedAppPackage;
}): AppInstall {
  return {
    installId: input.installId,
    packageAppKey: input.packageApp.packageAppKey,
    packageRevision: input.packageApp.packageRevision,
    sourceSchemaHash: input.packageApp.sourceSchemaHash,
    label: input.label,
    status: "installed",
    createdAt: input.now,
    updatedAt: input.now,
    adminRoute: `/apps/${input.installId}`,
  };
}

function initializationPlanForInstall(
  packageApp: ResolvedAppPackage,
  install: AppInstall,
): AppInstallInitializationPlan {
  return {
    installId: install.installId,
    packageAppKey: packageApp.packageAppKey,
    sourceSchemaKey: packageApp.sourceSchemaKey,
  };
}

function parseSourceLocation(value: unknown, context: string): AppPackageSourceLocation {
  const object = parseObject(value, context);
  rejectUnknownKeys(object, context, ["key", "kind", "path"]);

  if (object.kind !== "bundled" && object.kind !== "workspace") {
    throw new Error(`${context} kind must be "bundled" or "workspace".`);
  }

  const key = parseRouteSafeId(object.key, `${context} key`);
  const path = parseSourceLocationPath(object.path, context);

  return {
    kind: object.kind,
    key,
    path,
  };
}

function parseCapabilities(value: unknown, context: string): AppPackageCapability[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array.`);
  }

  const capabilities = value.map((capability, index) =>
    parseCapability(capability, `${context}[${index}]`),
  );
  const seen = new Set<AppPackageCapability["kind"]>();

  for (const capability of capabilities) {
    if (seen.has(capability.kind)) {
      throw new Error(`${context} must not repeat "${capability.kind}".`);
    }

    seen.add(capability.kind);
  }

  if (!seen.has("generatedAdmin")) {
    throw new Error(`${context} must include generatedAdmin.`);
  }

  return capabilities;
}

function parseCapability(value: unknown, context: string): AppPackageCapability {
  const object = parseObject(value, context);
  rejectUnknownKeys(object, context, ["kind", "routeBase"]);

  if (object.kind === "generatedAdmin") {
    if (object.routeBase !== "/apps") {
      throw new Error(`${context} routeBase must be "/apps".`);
    }

    return {
      kind: "generatedAdmin",
      routeBase: "/apps",
    };
  }

  throw new Error(`${context} kind is unsupported.`);
}

function parseRouteSafeId(value: unknown, context: string): string {
  if (typeof value !== "string") {
    throw new Error(`${context} must be a string.`);
  }

  if (value.length < routeSafeIdMinLength) {
    throw new Error(`${context} must be at least ${routeSafeIdMinLength} characters.`);
  }

  if (value.length > routeSafeIdMaxLength) {
    throw new Error(`${context} must be ${routeSafeIdMaxLength} characters or fewer.`);
  }

  if (!routeSafeIdPattern.test(value)) {
    throw new Error(
      `${context} must start with a lowercase letter and use lowercase letters, numbers, and single hyphens.`,
    );
  }

  return value;
}

function parseRequiredString(value: unknown, context: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value.trim();
}

function parseBoolean(value: unknown, context: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${context} must be a boolean.`);
  }

  return value;
}

function parsePackageRevision(value: unknown, context: string): PackageAppRevision {
  if (!isPackageAppRevision(value)) {
    throw new Error(`${context} must be a positive integer.`);
  }

  return value;
}

function parseSourceSchemaHash(value: unknown, context: string): SourceSchemaHash {
  if (!isSourceSchemaHash(value)) {
    throw new Error(`${context} must be a sha256 source schema hash.`);
  }

  return value;
}

function parseSourceLocationPath(value: unknown, context: string): string {
  if (typeof value !== "string" || !sourceLocationPathPattern.test(value)) {
    throw new Error(`${context} path must be a relative JSON path.`);
  }

  if (value.startsWith("/") || value.includes("//") || value.split("/").includes("..")) {
    throw new Error(`${context} path must stay within the package source.`);
  }

  if (!value.endsWith("/schema.json") && value !== "schema.json") {
    throw new Error(`${context} path must end with "schema.json".`);
  }

  return value;
}

function parseObject(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function rejectUnknownKeys(
  object: Record<string, unknown>,
  context: string,
  allowedKeys: readonly string[],
) {
  const allowed = new Set(allowedKeys);
  const unknownKey = Object.keys(object).find((key) => !allowed.has(key));

  if (unknownKey) {
    throw new Error(`${context} contains unsupported field "${unknownKey}".`);
  }
}

function cloneResolvedAppPackage(appPackage: ResolvedAppPackage): ResolvedAppPackage {
  return {
    ...appPackage,
    sourceSchemaLocation: cloneSourceLocation(appPackage.sourceSchemaLocation),
  };
}

function cloneSourceLocation(location: AppPackageSourceLocation): AppPackageSourceLocation {
  return {
    ...location,
  };
}
