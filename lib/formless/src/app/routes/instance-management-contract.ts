import type { ManagementLoadingContract } from "@dpeek/formless-presentation/contract";
import { managementManifestReference } from "@dpeek/formless-presentation/host";
import type { ApplicationRuntimeContractContribution } from "../generated/application-runtime-contract-host.tsx";

export const INSTANCE_MANAGEMENT_ID = "instance-management";
export const INSTANCE_MANAGEMENT_PUSH_OPERATION_ID = "instance-management:workspace:push";
export const INSTANCE_MANAGEMENT_PUSH_CONTROL_ID = "workspace:push";
export const INSTANCE_MANAGEMENT_CONTRIBUTOR_ID = "instance-management";

export const instanceManagementReference = managementManifestReference(INSTANCE_MANAGEMENT_ID);

export const instanceManagementLoadingManifest = {
  accessibilityLabel: "Instance management",
  id: INSTANCE_MANAGEMENT_ID,
  kind: "managementManifest",
  message: "Loading Program routes...",
  state: "loading",
  title: "Instance Settings",
} satisfies ManagementLoadingContract;

export const initialInstanceManagementRuntimeContribution = [
  INSTANCE_MANAGEMENT_CONTRIBUTOR_ID,
  {
    nodes: [
      {
        reference: instanceManagementReference,
        snapshot: instanceManagementLoadingManifest,
      },
    ],
  },
] as const satisfies ApplicationRuntimeContractContribution;
