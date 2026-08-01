import { programStorageIdentity, type ProgramStorageIdentity } from "./program-storage-identity.ts";
export type ProgramPublicSiteRuntimeTarget = {
  storageIdentity: ProgramStorageIdentity;
};

export type PublicSiteRuntimeTarget = ProgramPublicSiteRuntimeTarget;

export function programPublicSiteRuntimeTarget(): ProgramPublicSiteRuntimeTarget {
  return {
    storageIdentity: programStorageIdentity(),
  };
}
