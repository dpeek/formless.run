import { validateAppInstallId, type AppInstallId } from "@dpeek/formless-installed-apps";

export type InstanceDomainMappingProfile = "instance" | "app" | "publicSite";

export type InstanceDomainMappingSurface = "site";

export type InstanceDomainMapping = {
  host: string;
  profile: InstanceDomainMappingProfile;
  surface?: InstanceDomainMappingSurface;
  targetInstallId?: AppInstallId;
  installId?: AppInstallId;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type InstanceDomainMappingAppliedAction =
  | "adopted"
  | "created"
  | "deleted"
  | "manually-removed"
  | "overridden";

export type InstanceDomainMappingAppliedProvider = "cloudflare-worker-custom-domain";

export type InstanceDomainMappingAppliedState = {
  host: string;
  profile: InstanceDomainMappingProfile;
  surface?: InstanceDomainMappingSurface;
  targetInstallId?: AppInstallId;
  installId?: AppInstallId;
  provider: InstanceDomainMappingAppliedProvider;
  accountId: string;
  alchemyResourceId?: string;
  runnerId?: string;
  zoneId: string;
  zoneName: string;
  workerName: string;
  workerDomainId: string;
  action: InstanceDomainMappingAppliedAction;
  appliedAt: string;
  updatedAt: string;
};

export type InstanceDomainMappingAuditEvent = InstanceDomainMappingAppliedState & {
  eventId: number;
};

export type RecordInstanceDomainMappingApplyEvidenceRequest = {
  host: string;
  profile?: string;
  surface?: string;
  targetInstallId?: string;
  installId?: string;
  provider: string;
  accountId: string;
  alchemyResourceId?: string;
  runnerId?: string;
  zoneId: string;
  zoneName: string;
  workerName: string;
  workerDomainId: string;
  action: string;
};

export type InstanceDomainMappingLookupResponse = {
  mapping: InstanceDomainMapping | null;
};

export type RecordInstanceDomainMappingApplyEvidenceResponse = {
  appliedState: InstanceDomainMappingAppliedState;
  appliedStates: InstanceDomainMappingAppliedState[];
  auditEvent: InstanceDomainMappingAuditEvent;
  auditEvents: InstanceDomainMappingAuditEvent[];
};

export type InstanceDomainMappingRegistryErrorCode =
  | "domain-mapping-install-mismatch"
  | "domain-mapping-not-found"
  | "invalid-applied-action"
  | "invalid-host"
  | "invalid-install-id"
  | "invalid-profile"
  | "invalid-provider"
  | "invalid-surface";

export type InstanceDomainMappingRegistryError = {
  code: InstanceDomainMappingRegistryErrorCode;
  field?:
    | "accountId"
    | "action"
    | "host"
    | "installId"
    | "profile"
    | "provider"
    | "surface"
    | "targetInstallId"
    | "workerDomainId"
    | "workerName"
    | "zoneId"
    | "zoneName";
  message: string;
};

export type BuildInstanceDomainMappingAppliedStateInput =
  RecordInstanceDomainMappingApplyEvidenceRequest & {
    existingMappings: readonly InstanceDomainMapping[];
    now: string;
  };

export type BuildInstanceDomainMappingAppliedStateResult =
  | {
      ok: true;
      appliedState: InstanceDomainMappingAppliedState;
    }
  | {
      ok: false;
      error: InstanceDomainMappingRegistryError;
    };

export type InstanceDomainHostValidationResult =
  | {
      ok: true;
      host: string;
    }
  | {
      ok: false;
      error: InstanceDomainMappingRegistryError;
    };

export type InstanceDomainMappingProfileResolutionResult =
  | {
      ok: true;
      profile: InstanceDomainMappingProfile;
    }
  | {
      ok: false;
      error: InstanceDomainMappingRegistryError;
    };

const hostnameLabelPattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export function parseRecordInstanceDomainMappingApplyEvidenceRequest(
  value: unknown,
): RecordInstanceDomainMappingApplyEvidenceRequest {
  if (!isRecord(value)) {
    throw new Error("Domain mapping apply evidence request must be an object.");
  }

  assertRecordInstanceDomainMappingApplyEvidenceRequestKeys(value);

  return {
    host: parseTrimmedNonEmptyString("Domain mapping host", value.host),
    ...optionalStringProperty("profile", "Domain mapping profile", value.profile),
    ...optionalStringProperty("surface", "Domain mapping surface", value.surface),
    ...optionalStringProperty(
      "targetInstallId",
      "Domain mapping target install id",
      value.targetInstallId,
    ),
    ...optionalStringProperty("installId", "Domain mapping install id", value.installId),
    provider: parseTrimmedNonEmptyString("Domain mapping applied provider", value.provider),
    accountId: parseTrimmedNonEmptyString("Domain mapping Cloudflare account id", value.accountId),
    ...optionalStringProperty(
      "alchemyResourceId",
      "Domain mapping Alchemy resource id",
      value.alchemyResourceId,
    ),
    ...optionalStringProperty("runnerId", "Domain mapping provider runner id", value.runnerId),
    zoneId: parseTrimmedNonEmptyString("Domain mapping Cloudflare zone id", value.zoneId),
    zoneName: parseTrimmedNonEmptyString("Domain mapping Cloudflare zone name", value.zoneName),
    workerName: parseTrimmedNonEmptyString("Domain mapping Worker name", value.workerName),
    workerDomainId: parseTrimmedNonEmptyString(
      "Domain mapping Worker Custom Domain id",
      value.workerDomainId,
    ),
    action: parseTrimmedNonEmptyString("Domain mapping applied action", value.action),
  };
}

export function listInstanceDomainMappings(
  mappings: readonly InstanceDomainMapping[],
): InstanceDomainMapping[] {
  return [...mappings].sort((left, right) => {
    const hostOrder = left.host.localeCompare(right.host);
    const profileOrder = left.profile.localeCompare(right.profile);
    const leftTarget = left.targetInstallId ?? "";
    const rightTarget = right.targetInstallId ?? "";

    return hostOrder === 0
      ? profileOrder === 0
        ? leftTarget.localeCompare(rightTarget)
        : profileOrder
      : hostOrder;
  });
}

export function buildInstanceDomainMappingAppliedState(
  input: BuildInstanceDomainMappingAppliedStateInput,
): BuildInstanceDomainMappingAppliedStateResult {
  const hostResult = normalizeInstanceDomainHost(input.host);

  if (!hostResult.ok) {
    return { ok: false, error: hostResult.error };
  }

  const profileResult = resolveInstanceDomainMappingProfile(input);

  if (!profileResult.ok) {
    return { ok: false, error: profileResult.error };
  }

  const targetResult = resolveDomainMappingTargetInstallId(input, profileResult.profile);

  if (!targetResult.ok) {
    return { ok: false, error: targetResult.error };
  }

  const providerResult = parseInstanceDomainMappingAppliedProvider(input.provider);

  if (!providerResult.ok) {
    return { ok: false, error: providerResult.error };
  }

  const actionResult = parseInstanceDomainMappingAppliedAction(input.action);

  if (!actionResult.ok) {
    return { ok: false, error: actionResult.error };
  }

  const mapping = input.existingMappings.find(
    (candidate) =>
      candidate.host === hostResult.host && candidate.profile === profileResult.profile,
  );

  if (!mapping) {
    return {
      ok: false,
      error: domainMappingError(
        "domain-mapping-not-found",
        "host",
        `Domain mapping for host "${hostResult.host}" and profile "${profileResult.profile}" does not exist.`,
      ),
    };
  }

  if (mapping.targetInstallId !== targetResult.targetInstallId) {
    return {
      ok: false,
      error: domainMappingError(
        "domain-mapping-install-mismatch",
        "targetInstallId",
        `Domain mapping for host "${hostResult.host}" targets install "${mapping.targetInstallId ?? "none"}", not "${targetResult.targetInstallId ?? "none"}".`,
      ),
    };
  }

  return {
    ok: true,
    appliedState: instanceDomainMappingAppliedStateFromParts({
      accountId: input.accountId,
      action: actionResult.action,
      alchemyResourceId: input.alchemyResourceId,
      host: hostResult.host,
      now: input.now,
      profile: profileResult.profile,
      provider: providerResult.provider,
      runnerId: input.runnerId,
      targetInstallId: targetResult.targetInstallId,
      workerDomainId: input.workerDomainId,
      workerName: input.workerName,
      zoneId: input.zoneId,
      zoneName: input.zoneName,
    }),
  };
}

export function normalizeInstanceDomainHost(value: string): InstanceDomainHostValidationResult {
  const raw = value.trim().toLowerCase();

  if (raw === "") {
    return {
      ok: false,
      error: domainMappingError("invalid-host", "host", "Domain mapping host is required."),
    };
  }

  if (raw.includes("://")) {
    return invalidHost();
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
      return invalidHost();
    }

    return { ok: true, host: normalized };
  } catch {
    return invalidHost();
  }
}

export function resolveInstanceDomainMappingProfile(
  input: {
    profile?: string;
    surface?: string;
  },
  options: { defaultProfile?: InstanceDomainMappingProfile } = {},
): InstanceDomainMappingProfileResolutionResult {
  const profile = input.profile;
  const surface = input.surface;
  const profileResult =
    profile === undefined ? undefined : parseInstanceDomainMappingProfile(profile);

  if (profileResult && !profileResult.ok) {
    return profileResult;
  }

  const surfaceResult =
    surface === undefined ? undefined : parseInstanceDomainMappingSurface(surface);

  if (surfaceResult && !surfaceResult.ok) {
    return surfaceResult;
  }

  if (surfaceResult?.ok && profileResult?.ok && profileResult.profile !== "publicSite") {
    return {
      ok: false,
      error: domainMappingError(
        "invalid-surface",
        "surface",
        'Domain mapping surface compatibility is only valid with profile "publicSite".',
      ),
    };
  }

  if (profileResult?.ok) {
    return profileResult;
  }

  if (surfaceResult?.ok) {
    return { ok: true, profile: "publicSite" };
  }

  if (options.defaultProfile !== undefined) {
    return { ok: true, profile: options.defaultProfile };
  }

  return {
    ok: false,
    error: domainMappingError(
      "invalid-profile",
      "profile",
      'Domain mapping profile must be "instance", "app", or "publicSite".',
    ),
  };
}

function resolveDomainMappingTargetInstallId(
  input: {
    installId?: string;
    targetInstallId?: string;
  },
  profile: InstanceDomainMappingProfile,
):
  | {
      ok: true;
      targetInstallId?: AppInstallId;
    }
  | {
      ok: false;
      error: InstanceDomainMappingRegistryError;
    } {
  const targetInstallId = input.targetInstallId;
  const installId = input.installId;

  if (targetInstallId !== undefined && installId !== undefined && targetInstallId !== installId) {
    return {
      ok: false,
      error: domainMappingError(
        "invalid-install-id",
        "targetInstallId",
        "Domain mapping targetInstallId and installId must match.",
      ),
    };
  }

  const target = targetInstallId ?? installId;
  const targetField = targetInstallId === undefined ? "installId" : "targetInstallId";

  if (profile === "instance") {
    if (target !== undefined) {
      return {
        ok: false,
        error: domainMappingError(
          "invalid-install-id",
          targetField,
          "Instance domain mappings must not include an install id.",
        ),
      };
    }

    return { ok: true };
  }

  if (target === undefined && profile === "publicSite") {
    return { ok: true };
  }

  if (target === undefined) {
    return {
      ok: false,
      error: domainMappingError(
        "invalid-install-id",
        "targetInstallId",
        `Domain mapping profile "${profile}" requires a target install id.`,
      ),
    };
  }

  const installIdResult = validateAppInstallId(target);

  if (!installIdResult.ok) {
    return {
      ok: false,
      error: {
        code: "invalid-install-id",
        field: targetField,
        message: installIdResult.error.message,
      },
    };
  }

  return { ok: true, targetInstallId: installIdResult.installId };
}

function instanceDomainMappingAppliedStateFromParts(input: {
  accountId: string;
  action: InstanceDomainMappingAppliedAction;
  alchemyResourceId?: string;
  host: string;
  now: string;
  profile: InstanceDomainMappingProfile;
  provider: InstanceDomainMappingAppliedProvider;
  runnerId?: string;
  targetInstallId?: AppInstallId;
  workerDomainId: string;
  workerName: string;
  zoneId: string;
  zoneName: string;
}): InstanceDomainMappingAppliedState {
  return {
    host: input.host,
    profile: input.profile,
    ...compatibilitySurfaceForProfile(input.profile),
    ...compatibilityTargetForInstallId(input.targetInstallId),
    provider: input.provider,
    accountId: input.accountId,
    ...(input.alchemyResourceId === undefined
      ? {}
      : { alchemyResourceId: input.alchemyResourceId }),
    ...(input.runnerId === undefined ? {} : { runnerId: input.runnerId }),
    zoneId: input.zoneId,
    zoneName: input.zoneName,
    workerName: input.workerName,
    workerDomainId: input.workerDomainId,
    action: input.action,
    appliedAt: input.now,
    updatedAt: input.now,
  };
}

function compatibilitySurfaceForProfile(profile: InstanceDomainMappingProfile): {
  surface?: InstanceDomainMappingSurface;
} {
  return profile === "publicSite" ? { surface: "site" } : {};
}

function compatibilityTargetForInstallId(targetInstallId: AppInstallId | undefined): {
  targetInstallId?: AppInstallId;
  installId?: AppInstallId;
} {
  return targetInstallId === undefined
    ? {}
    : {
        installId: targetInstallId,
        targetInstallId,
      };
}

function parseInstanceDomainMappingProfile(
  value: string,
): InstanceDomainMappingProfileResolutionResult {
  if (value === "instance" || value === "app" || value === "publicSite") {
    return { ok: true, profile: value };
  }

  return {
    ok: false,
    error: domainMappingError(
      "invalid-profile",
      "profile",
      'Domain mapping profile must be "instance", "app", or "publicSite".',
    ),
  };
}

function parseInstanceDomainMappingSurface(value: string):
  | {
      ok: true;
      surface: InstanceDomainMappingSurface;
    }
  | {
      ok: false;
      error: InstanceDomainMappingRegistryError;
    } {
  if (value === "site") {
    return { ok: true, surface: value };
  }

  return {
    ok: false,
    error: domainMappingError(
      "invalid-surface",
      "surface",
      'Domain mapping surface must be "site".',
    ),
  };
}

function parseInstanceDomainMappingAppliedProvider(value: string):
  | {
      ok: true;
      provider: InstanceDomainMappingAppliedProvider;
    }
  | {
      ok: false;
      error: InstanceDomainMappingRegistryError;
    } {
  if (value === "cloudflare-worker-custom-domain") {
    return { ok: true, provider: value };
  }

  return {
    ok: false,
    error: domainMappingError(
      "invalid-provider",
      "provider",
      'Domain mapping applied provider must be "cloudflare-worker-custom-domain".',
    ),
  };
}

function parseInstanceDomainMappingAppliedAction(value: string):
  | {
      ok: true;
      action: InstanceDomainMappingAppliedAction;
    }
  | {
      ok: false;
      error: InstanceDomainMappingRegistryError;
    } {
  if (value === "adopted" || value === "created" || value === "deleted" || value === "overridden") {
    return { ok: true, action: value };
  }

  return {
    ok: false,
    error: domainMappingError(
      "invalid-applied-action",
      "action",
      'Domain mapping applied action must be "adopted", "created", "deleted", or "overridden".',
    ),
  };
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

function invalidHost(): InstanceDomainHostValidationResult {
  return {
    ok: false,
    error: domainMappingError("invalid-host", "host", "Domain mapping host must be a hostname."),
  };
}

function parseTrimmedNonEmptyString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value.trim();
}

function optionalStringProperty<K extends string>(
  key: K,
  context: string,
  value: unknown,
): { [P in K]?: string } {
  if (value === undefined) {
    return {};
  }

  return { [key]: parseTrimmedNonEmptyString(context, value) } as { [P in K]?: string };
}

function assertRecordInstanceDomainMappingApplyEvidenceRequestKeys(value: Record<string, unknown>) {
  const requiredKeys = [
    "host",
    "provider",
    "accountId",
    "zoneId",
    "zoneName",
    "workerName",
    "workerDomainId",
    "action",
  ];
  const allowedKeys = new Set([
    ...requiredKeys,
    "alchemyResourceId",
    "installId",
    "profile",
    "runnerId",
    "surface",
    "targetInstallId",
  ]);

  assertOnlyKeys(value, allowedKeys, "Domain mapping apply evidence request");
  assertRequiredKeys(value, requiredKeys, "Domain mapping apply evidence request");
}

function assertOnlyKeys(value: Record<string, unknown>, allowedKeys: Set<string>, context: string) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${context} has unsupported key "${key}".`);
    }
  }
}

function assertRequiredKeys(
  value: Record<string, unknown>,
  requiredKeys: readonly string[],
  context: string,
) {
  for (const key of requiredKeys) {
    if (!(key in value)) {
      throw new Error(`${context} must include "${key}".`);
    }
  }
}

function domainMappingError(
  code: InstanceDomainMappingRegistryErrorCode,
  field: InstanceDomainMappingRegistryError["field"],
  message: string,
): InstanceDomainMappingRegistryError {
  return {
    code,
    ...(field === undefined ? {} : { field }),
    message,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
