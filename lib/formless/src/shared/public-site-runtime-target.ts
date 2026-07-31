import type { PackageAppKey } from "@dpeek/formless-installed-apps";
import {
  programStorageIdentity,
  type InstalledAppStorageIdentity,
  type ProgramStorageIdentity,
} from "./app-storage-identity.ts";
import { runtimeTopologyRoutes } from "./runtime-topology.ts";

export type PublicSiteRuntimeStorageIdentity = ProgramStorageIdentity | InstalledAppStorageIdentity;

export type PublicSiteRuntimeTarget = {
  packageAppKey: PackageAppKey;
  storageIdentity: PublicSiteRuntimeStorageIdentity;
};

export function programPublicSiteRuntimeTarget(): PublicSiteRuntimeTarget {
  return {
    packageAppKey: runtimeTopologyRoutes.publicSitePackageAppKey,
    storageIdentity: programStorageIdentity(),
  };
}

export function installedPublicSiteRuntimeTarget(
  storageIdentity: InstalledAppStorageIdentity,
): PublicSiteRuntimeTarget {
  return {
    packageAppKey: storageIdentity.packageAppKey,
    storageIdentity,
  };
}
