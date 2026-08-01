import { projectDeployControlPlaneDesiredState } from "./index.ts";
import type {
  DeployDesiredStateProjection,
  DeployDesiredStateProjectionInput,
  DeploySecretReference,
} from "./types.ts";

export { projectDeployControlPlaneDesiredState } from "./index.ts";
export { DEPLOY_CONTROL_PLANE_ACTION_IDS, DEPLOY_PUBLIC_CONTRACT_VERSION } from "./types.ts";
export type {
  ControlPlaneEmailDomainProjectionRecord,
  ControlPlaneEmailSenderProjectionRecord,
  ControlPlaneProviderConfigProjectionRecord,
  ControlPlaneRouteProjectionRecord,
  DeployDesiredStateProjection,
  DeployDesiredStateProjectionInput,
  DeploySecretReference,
} from "./types.ts";

export type DeployWorkerProjectionAdapterInput = DeployDesiredStateProjectionInput & {
  secretReferences?: readonly DeploySecretReference[];
};

export type DeployWorkerProjectionAdapterResult = {
  projection: DeployDesiredStateProjection;
  secretReferences: readonly DeploySecretReference[];
};

export function projectDeployWorkerDesiredState(
  input: DeployWorkerProjectionAdapterInput,
): DeployWorkerProjectionAdapterResult {
  return {
    projection: projectDeployControlPlaneDesiredState(input),
    secretReferences: input.secretReferences ?? [],
  };
}
