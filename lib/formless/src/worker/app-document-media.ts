import type { DocumentMediaCompatibility } from "@dpeek/formless-media";
import {
  documentMediaRouteFromPathname,
  handleDocumentMediaRequest,
  mediaObjectStoreFromR2Bucket,
  type DocumentMediaAuthorizationInput,
  type DocumentMediaRequestOperation,
  type DocumentMediaStorageIdentity,
  type MediaWriteAuthorizationResult,
} from "@dpeek/formless-media/worker";
import type { AppSchema } from "@dpeek/formless-schema";

import type {
  AuthorityApiRoute,
  InstalledAppStorageIdentity,
} from "../shared/app-storage-identity.ts";
import type { SchemaResponse } from "../shared/protocol.ts";
import {
  validateInstanceAuthAccessSession,
  type InstanceAuthAccessEnv,
} from "./instance-auth-handoff.ts";
import { authorizeOwnerManagementRead } from "./authority-admin-guard.ts";
import { INTERNAL_AUTH_PROFILE_COMPLETION_SCHEMA_PATH } from "./instance-auth-account-completion.ts";
import type { InstanceAuthSessionTargetBinding } from "./instance-auth-state.ts";

type AppDocumentMediaEnv = InstanceAuthAccessEnv & {
  FORMLESS_AUTHORITY: DurableObjectNamespace;
  FORMLESS_MEDIA: R2Bucket;
};

const ARCHIVE_EXPORT_MEDIA_READ_HEADER = "X-Formless-Archive-Export";

export async function handleAppDocumentMediaRequest(
  request: Request,
  env: AppDocumentMediaEnv,
  authorityRoute: AuthorityApiRoute | undefined,
  options: {
    pathname?: string;
    target?: InstanceAuthSessionTargetBinding;
  } = {},
): Promise<Response | undefined> {
  if (authorityRoute?.identity.kind !== "appInstall") {
    return undefined;
  }

  const pathname = options.pathname ?? new URL(request.url).pathname;
  const media = {
    documentsPath: `${authorityRoute.identity.apiRoutePrefix}/media/documents`,
    ownerAppInstallId: authorityRoute.identity.installId,
  } satisfies DocumentMediaStorageIdentity;
  const route = documentMediaRouteFromPathname(pathname, media);

  if (!route) {
    return undefined;
  }

  const archiveExportAuthorization = await authorizeArchiveExportMediaRead(request, env);
  const collectionOperation = documentMediaCollectionOperation(request, route.assetId);
  const collectionAuthorization =
    collectionOperation === undefined
      ? undefined
      : (archiveExportAuthorization ??
        (await authorizeAppDocumentMediaRequest(
          { operation: collectionOperation, request },
          env,
          media.ownerAppInstallId,
          options.target,
        )));
  const compatibility =
    collectionOperation !== undefined && collectionAuthorization?.authorized === true
      ? await resolveTrustedDocumentMediaCompatibility(
          request,
          env,
          authorityRoute.identity,
          media.ownerAppInstallId,
        )
      : undefined;

  return handleDocumentMediaRequest(request, {
    authorizeRequest: (input) =>
      archiveExportAuthorization !== undefined
        ? archiveExportAuthorization
        : collectionAuthorization !== undefined && input.operation === collectionOperation
          ? collectionAuthorization
          : authorizeAppDocumentMediaRequest(input, env, media.ownerAppInstallId, options.target),
    compatibility,
    media,
    pathname,
    provider: "r2",
    store: mediaObjectStoreFromR2Bucket(env.FORMLESS_MEDIA),
  });
}

async function authorizeArchiveExportMediaRead(
  request: Request,
  env: AppDocumentMediaEnv,
): Promise<MediaWriteAuthorizationResult | undefined> {
  if (
    request.headers.get(ARCHIVE_EXPORT_MEDIA_READ_HEADER) !== "1" ||
    (request.method !== "GET" && request.method !== "HEAD")
  ) {
    return undefined;
  }

  const authorization = await authorizeOwnerManagementRead(request, env);

  return authorization.authorized
    ? { authorized: true }
    : {
        authorized: false,
        error: authorization.error,
        headers: authorization.headers,
        status: authorization.status,
      };
}

function documentMediaCollectionOperation(
  request: Request,
  assetId: string | undefined,
): Extract<DocumentMediaRequestOperation, "list" | "upload"> | undefined {
  if (assetId !== undefined) {
    return undefined;
  }

  if (request.method === "GET") {
    return "list";
  }

  return request.method === "POST" ? "upload" : undefined;
}

async function authorizeAppDocumentMediaRequest(
  input: DocumentMediaAuthorizationInput,
  env: AppDocumentMediaEnv,
  appInstallId: string,
  target: InstanceAuthSessionTargetBinding | undefined,
): Promise<MediaWriteAuthorizationResult> {
  if (input.operation === "delivery" && input.asset?.access === "public") {
    return { authorized: true };
  }

  const access = await validateInstanceAuthAccessSession(input.request, env, {
    appInstallId,
    requiredAuthority: "app.admin",
    ...(target === undefined ? {} : { target }),
  });

  if (access.ok) {
    return { authorized: true };
  }

  const status = access.authenticated === undefined ? 401 : 403;

  return {
    authorized: false,
    error: "Owner or matching app administrator session is required for document media.",
    headers: status === 401 ? { "WWW-Authenticate": 'Bearer realm="formless-app-admin"' } : {},
    status,
  };
}

async function resolveTrustedDocumentMediaCompatibility(
  request: Request,
  env: AppDocumentMediaEnv,
  identity: InstalledAppStorageIdentity,
  ownerAppInstallId: string,
): Promise<DocumentMediaCompatibility | undefined> {
  const fieldIdentity = documentMediaFieldIdentityFromRequest(request);

  if (!fieldIdentity) {
    return undefined;
  }
  const schema = await readActiveInstalledAppSchema(env, identity);
  const field = schema?.entities
    .find((definition) => definition.key === fieldIdentity.entityName)
    ?.fields.find((definition) => definition.key === fieldIdentity.fieldName);
  const policy = field?.type === "text" ? field.asset : undefined;
  if (policy?.kind !== "document") {
    return undefined;
  }

  return {
    acceptedMimeTypes: policy.acceptedMimeTypes,
    access: policy.access,
    maxBytes: policy.maxBytes,
    ownerAppInstallId,
  };
}

async function readActiveInstalledAppSchema(
  env: AppDocumentMediaEnv,
  identity: InstalledAppStorageIdentity,
): Promise<AppSchema | undefined> {
  const id = env.FORMLESS_AUTHORITY.idFromName(identity.authorityName);
  const response = await env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(
      `http://internal${identity.apiRoutePrefix}${INTERNAL_AUTH_PROFILE_COMPLETION_SCHEMA_PATH}`,
      {
        headers: { Accept: "application/json" },
        method: "GET",
      },
    ),
  );

  if (!response.ok) {
    return undefined;
  }
  const body = (await response.json()) as Partial<SchemaResponse>;
  return body.schema;
}
function documentMediaFieldIdentityFromRequest(request: Request):
  | {
      entityName: string;
      fieldName: string;
    }
  | undefined {
  const searchParams = new URL(request.url).searchParams;
  const entityNames = searchParams.getAll("entity");
  const fieldNames = searchParams.getAll("field");

  if (
    entityNames.length !== 1 ||
    fieldNames.length !== 1 ||
    entityNames[0] === "" ||
    fieldNames[0] === ""
  ) {
    return undefined;
  }

  return {
    entityName: entityNames[0]!,
    fieldName: fieldNames[0]!,
  };
}
