import {
  FORMLESS_PROGRAM_API_ROUTE_PREFIX,
  formlessProgramTarget,
  type FormlessProgramTarget,
} from "../program/target.ts";

export type ProgramStorageIdentity = FormlessProgramTarget;
export type AppStorageIdentity = ProgramStorageIdentity;
export type AuthorityStorageIdentity = ProgramStorageIdentity;

export type AuthorityApiRoute = {
  identity: AuthorityStorageIdentity;
  path: `/${string}`;
};

export function programStorageIdentity(): ProgramStorageIdentity {
  return formlessProgramTarget;
}

export function parseAuthorityApiRoute(pathname: string): AuthorityApiRoute | undefined {
  return parseProgramApiRoute(pathname);
}

export function parseProgramApiRoute(pathname: string):
  | {
      identity: ProgramStorageIdentity;
      path: `/${string}`;
    }
  | undefined {
  if (
    pathname !== FORMLESS_PROGRAM_API_ROUTE_PREFIX &&
    !pathname.startsWith(`${FORMLESS_PROGRAM_API_ROUTE_PREFIX}/`)
  ) {
    return undefined;
  }

  const suffix = pathname.slice(FORMLESS_PROGRAM_API_ROUTE_PREFIX.length);

  if (!suffix.startsWith("/") || suffix === "/") {
    return undefined;
  }

  return {
    identity: programStorageIdentity(),
    path: suffix as `/${string}`,
  };
}
