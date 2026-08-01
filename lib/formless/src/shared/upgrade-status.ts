import type { UpgradeMigrationChecksum, UpgradeMigrationId } from "./upgrade-migrations.ts";

export const INSTANCE_UPGRADE_API_PATH = "/api/formless/upgrade";
export const INSTANCE_UPGRADE_APPLY_API_PATH = `${INSTANCE_UPGRADE_API_PATH}/apply`;
export const INSTANCE_UPGRADE_STATUS_API_PATH = `${INSTANCE_UPGRADE_API_PATH}/status`;
export type UpgradeStorageIdentity = {
  authorityName: string;
  kind: "instance";
};

export type UpgradeSqlMigrationAppliedState = {
  appliedAt: string;
  checksum: UpgradeMigrationChecksum;
  migrationId: UpgradeMigrationId;
  packageVersion: string | null;
  storageFamily: string;
};

export type UpgradeStorageIdentityStatus = {
  identity: UpgradeStorageIdentity;
  sqlMigrations: UpgradeSqlMigrationAppliedState[];
};

export type InstanceUpgradeStatusResponse = {
  storageIdentities: UpgradeStorageIdentityStatus[];
};

export type InstanceUpgradeApplyResponse = InstanceUpgradeStatusResponse;
