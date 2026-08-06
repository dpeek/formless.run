import {
  identityControlPlaneBootstrapContribution,
  identityControlPlaneRecordAdapter,
} from "@dpeek/formless-identity-control-plane/records";
import {
  instanceControlPlaneCreateIdContribution,
  instanceControlPlaneRecordAdapter,
} from "@dpeek/formless-instance-control-plane/records";
import { siteRecordAdapter } from "@dpeek/formless-site-app/records";
import { defineProgramSharedRuntime } from "../composition.ts";
import { contactSubscriptionOperationAdapter } from "../../worker/contact-subscription-operation.ts";

export const formlessProgramDefaultSharedRuntime = defineProgramSharedRuntime({
  target: "shared",
  recordAdapters: [
    instanceControlPlaneRecordAdapter,
    identityControlPlaneRecordAdapter,
    siteRecordAdapter,
  ],
  operationAdapters: [contactSubscriptionOperationAdapter],
  bootstrapContributions: [identityControlPlaneBootstrapContribution],
  createIdContributions: [instanceControlPlaneCreateIdContribution],
});

export default formlessProgramDefaultSharedRuntime;
