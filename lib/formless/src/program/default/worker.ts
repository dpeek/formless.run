import type { AppSchema } from "@dpeek/formless-schema";
import {
  sitePublicWorkerReadDefinition,
  sitePublicWorkerSurfaceDefinition,
} from "@dpeek/formless-site-app/runtime/worker";
import { SITE_PREVIEW_WORKER_MOUNT_KEY } from "@dpeek/formless-site-app/schema";
import type { OperationInvocationResponse } from "../../shared/operation-invocation.ts";
import {
  createSiteContactNotificationAdapters,
  scheduleSiteContactNotificationAfterPublicOperation,
  type SiteContactNotificationEnv,
} from "../../worker/site-contact-notifications.ts";
import {
  createSiteOperationInputNotificationAdapters,
  scheduleSiteOperationInputNotificationAfterPublicOperation,
  type SiteOperationInputNotificationEnv,
} from "../../worker/site-operation-input-notifications.ts";
import { defineProgramWorkerRuntime } from "../composition.ts";

export type FormlessProgramDefaultWorkerAfterCommitInput = {
  bindings: SiteContactNotificationEnv & SiteOperationInputNotificationEnv;
  requestUrl: string;
  response: OperationInvocationResponse;
  schema: AppSchema;
  storage: DurableObjectStorage;
};

export const siteContactNotificationAfterCommitAdapter = {
  target: "worker",
  kind: "after-commit",
  key: "site.contact-notification",
  entityIds: ["entity_5a3667a2-a5a7-46ed-b3a4-b6364bae31a0"],
  run: (input: FormlessProgramDefaultWorkerAfterCommitInput) =>
    scheduleSiteContactNotificationAfterPublicOperation({
      adapters: createSiteContactNotificationAdapters(input.bindings),
      requestUrl: input.requestUrl,
      response: input.response,
    }),
} as const;

export const siteOperationInputNotificationAfterCommitAdapter = {
  target: "worker",
  kind: "after-commit",
  key: "site.operation-input-notification",
  entityIds: ["entity_8aa7cc1a-c9a7-482e-b078-6ef5478794e2"],
  run: (input: FormlessProgramDefaultWorkerAfterCommitInput) =>
    scheduleSiteOperationInputNotificationAfterPublicOperation({
      adapters: createSiteOperationInputNotificationAdapters(input.bindings),
      requestUrl: input.requestUrl,
      response: input.response,
      schema: input.schema,
      storage: input.storage,
    }),
} as const;

export const formlessProgramDefaultWorkerRuntime = defineProgramWorkerRuntime({
  target: "worker",
  publicReads: [sitePublicWorkerReadDefinition],
  surfaces: [sitePublicWorkerSurfaceDefinition],
  mounts: [
    {
      target: "worker",
      mountKey: SITE_PREVIEW_WORKER_MOUNT_KEY,
      surfaceKey: sitePublicWorkerSurfaceDefinition.key,
    },
  ],
  afterCommit: [
    siteContactNotificationAfterCommitAdapter,
    siteOperationInputNotificationAfterCommitAdapter,
  ],
});

export default formlessProgramDefaultWorkerRuntime;
