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
import {
  FORMLESS_PROGRAM_API_ROUTE_PREFIX,
  FORMLESS_PROGRAM_EDITOR_ACCESS_REQUIREMENT,
  FORMLESS_PROGRAM_REPLICA_ACCESS_REQUIREMENT,
  formlessProgramSchema,
} from "../program/runtime.ts";
import { authorizeOwnerManagementRead, authorizeProgramAccess } from "./authority-admin-guard.ts";
import type { InstanceAuthSessionTargetBinding } from "./instance-auth-state.ts";
import type { InstanceAuthAccessEnv } from "./instance-auth-handoff.ts";

type ProgramDocumentMediaEnv = InstanceAuthAccessEnv & {
  FORMLESS_AUTHORITY: DurableObjectNamespace;
  FORMLESS_MEDIA: R2Bucket;
};

const ARCHIVE_EXPORT_MEDIA_READ_HEADER = "X-Formless-Archive-Export";
const programDocumentMedia = {
  documentsPath: `${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/media/documents`,
} satisfies DocumentMediaStorageIdentity;

export async function handleProgramDocumentMediaRequest(
  request: Request,
  env: ProgramDocumentMediaEnv,
  options: {
    pathname?: string;
    target?: InstanceAuthSessionTargetBinding;
  } = {},
): Promise<Response | undefined> {
  const pathname = options.pathname ?? new URL(request.url).pathname;
  const route = documentMediaRouteFromPathname(pathname, programDocumentMedia);

  if (!route) {
    return undefined;
  }

  const archiveExportAuthorization = await authorizeArchiveExportMediaRead(request, env);
  const collectionOperation = documentMediaCollectionOperation(request, route.assetId);
  const collectionAuthorization =
    collectionOperation === undefined
      ? undefined
      : (archiveExportAuthorization ??
        (await authorizeProgramDocumentMediaRequest(
          { operation: collectionOperation, request },
          env,
          options.target,
        )));
  const compatibility =
    collectionOperation !== undefined && collectionAuthorization?.authorized === true
      ? resolveTrustedProgramDocumentMediaCompatibility(request)
      : undefined;

  return handleDocumentMediaRequest(request, {
    authorizeRequest: (input) =>
      archiveExportAuthorization !== undefined
        ? archiveExportAuthorization
        : collectionAuthorization !== undefined && input.operation === collectionOperation
          ? collectionAuthorization
          : authorizeProgramDocumentMediaRequest(input, env, options.target),
    compatibility,
    media: programDocumentMedia,
    pathname,
    provider: "r2",
    store: mediaObjectStoreFromR2Bucket(env.FORMLESS_MEDIA),
  });
}

async function authorizeArchiveExportMediaRead(
  request: Request,
  env: ProgramDocumentMediaEnv,
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

async function authorizeProgramDocumentMediaRequest(
  input: DocumentMediaAuthorizationInput,
  env: ProgramDocumentMediaEnv,
  target: InstanceAuthSessionTargetBinding | undefined,
): Promise<MediaWriteAuthorizationResult> {
  if (input.operation === "delivery" && input.asset?.access === "public") {
    return { authorized: true };
  }

  const requirement =
    input.operation === "list" || input.operation === "upload"
      ? FORMLESS_PROGRAM_EDITOR_ACCESS_REQUIREMENT
      : FORMLESS_PROGRAM_REPLICA_ACCESS_REQUIREMENT;
  const authorization = await authorizeProgramAccess(
    input.request,
    env,
    requirement,
    formlessProgramSchema,
    {
      error:
        input.operation === "list" || input.operation === "upload"
          ? "Current Program editor, administrator, owner, or admin authorization is required for Program document media."
          : "Current Program member, owner, or admin authorization is required for private Program document media.",
      ...(target === undefined ? {} : { hostSessionTarget: target }),
    },
  );

  return authorization.authorized
    ? { authorized: true }
    : {
        authorized: false,
        error: authorization.error,
        headers: authorization.headers,
        status: authorization.status,
      };
}

function resolveTrustedProgramDocumentMediaCompatibility(
  request: Request,
): DocumentMediaCompatibility | undefined {
  const fieldIdentity = documentMediaFieldIdentityFromRequest(request);

  if (!fieldIdentity) {
    return undefined;
  }

  const field = formlessProgramSchema.entities
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
  };
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
