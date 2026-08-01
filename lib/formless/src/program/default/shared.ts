import {
  identityControlPlaneBootstrapContribution,
  identityControlPlaneRecordAdapter,
} from "@dpeek/formless-identity-control-plane/records";
import {
  instanceControlPlaneCreateIdContribution,
  instanceControlPlaneRecordAdapter,
} from "@dpeek/formless-instance-control-plane/records";
import { defineProgramSharedRuntime } from "../composition.ts";
import { contactSubscriptionOperationAdapter } from "../../worker/contact-subscription-operation.ts";

export const formlessProgramDefaultSharedRuntime = defineProgramSharedRuntime({
  target: "shared",
  recordAdapters: [instanceControlPlaneRecordAdapter, identityControlPlaneRecordAdapter],
  operationAdapters: [contactSubscriptionOperationAdapter],
  bootstrapContributions: [identityControlPlaneBootstrapContribution],
  createIdContributions: [instanceControlPlaneCreateIdContribution],
});

export default formlessProgramDefaultSharedRuntime;
