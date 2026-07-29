import type {
  AppInstallsResponse,
  CreateAppInstallRequest,
  CreateAppInstallResponse,
} from "../shared/protocol.ts";
import type { AppPackageResolver, InstallableAppPackage } from "@dpeek/formless-installed-apps";
import { INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY } from "@dpeek/formless-instance-control-plane";
import {
  enqueueLocalWorkspaceAutoSave,
  type LocalWorkspaceAutoSaveOptions,
} from "./workspace-auto-save.ts";

export const INSTANCE_APP_INSTALLS_API_PATH = "/api/formless/app-installs";

export type AppInstallApiErrorBody = {
  code?: string;
  error: string;
  field?: string;
};

export class AppInstallApiError extends Error {
  readonly body: AppInstallApiErrorBody;
  readonly status: number;

  constructor(message: string, options: { body: AppInstallApiErrorBody; status: number }) {
    super(message);
    this.name = "AppInstallApiError";
    this.body = options.body;
    this.status = options.status;
  }
}

export async function fetchInstanceAppInstalls({
  fetcher = fetch,
  signal,
}: {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
} = {}): Promise<AppInstallsResponse> {
  const response = await fetcher(INSTANCE_APP_INSTALLS_API_PATH, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });

  return readJsonResponse<AppInstallsResponse>(response);
}

export function activeAppPackageResolverFromAppInstallsResponse(
  response: Pick<AppInstallsResponse, "packages">,
): AppPackageResolver {
  return activeAppPackageResolverFromPackages(response.packages);
}

export function activeAppPackageResolverFromPackages(
  packages: readonly InstallableAppPackage[],
): AppPackageResolver {
  const packagesByKey = new Map<string, InstallableAppPackage>();
  const orderedPackages: InstallableAppPackage[] = [];

  for (const appPackage of packages) {
    if (packagesByKey.has(appPackage.packageAppKey)) {
      throw new Error(`Active package app key "${appPackage.packageAppKey}" is already resolved.`);
    }

    const cloned = cloneInstallableAppPackage(appPackage);
    packagesByKey.set(cloned.packageAppKey, cloned);
    orderedPackages.push(cloned);
  }

  return {
    findPackage(packageAppKey) {
      const appPackage = packagesByKey.get(packageAppKey);

      return appPackage ? cloneInstallableAppPackage(appPackage) : undefined;
    },
    listPackages() {
      return orderedPackages.map(cloneInstallableAppPackage);
    },
  };
}

export async function createInstanceAppInstall(
  input: CreateAppInstallRequest,
  {
    autoSave,
    fetcher = fetch,
    signal,
  }: {
    autoSave?: LocalWorkspaceAutoSaveOptions["autoSave"];
    fetcher?: typeof fetch;
    signal?: AbortSignal;
  } = {},
): Promise<CreateAppInstallResponse> {
  const response = await fetcher(INSTANCE_APP_INSTALLS_API_PATH, {
    body: JSON.stringify(input),
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  });

  const body = await readJsonResponse<CreateAppInstallResponse>(response);

  await enqueueLocalWorkspaceAutoSave(
    { source: "app-install", storageIdentity: INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY },
    { autoSave },
  );

  return body;
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as unknown;

  if (!response.ok) {
    const errorBody = appInstallErrorBody(body);

    throw new AppInstallApiError(errorBody.error, {
      body: errorBody,
      status: response.status,
    });
  }

  return body as T;
}

function appInstallErrorBody(value: unknown): AppInstallApiErrorBody {
  if (!isRecord(value)) {
    return { error: "App install request failed." };
  }

  const error = typeof value.error === "string" ? value.error : "App install request failed.";
  const code = typeof value.code === "string" ? value.code : undefined;
  const field = typeof value.field === "string" ? value.field : undefined;

  return {
    error,
    ...(code === undefined ? {} : { code }),
    ...(field === undefined ? {} : { field }),
  };
}

function cloneInstallableAppPackage(appPackage: InstallableAppPackage): InstallableAppPackage {
  return {
    ...appPackage,
    sourceSchemaLocation: { ...appPackage.sourceSchemaLocation },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
