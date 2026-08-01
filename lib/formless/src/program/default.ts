import { defineProgramRuntimeComposition } from "./composition.ts";
import { formlessProgramDefaultBrowserRuntime } from "./default/browser.ts";
import { formlessProgramDefaultSharedRuntime } from "./default/shared.ts";
import { formlessProgramDefaultWorkerRuntime } from "./default/worker.ts";

export { formlessProgramDefaultBrowserRuntime } from "./default/browser.ts";
export { formlessProgramDefaultSharedRuntime } from "./default/shared.ts";
export { formlessProgramDefaultWorkerRuntime } from "./default/worker.ts";

export {
  formlessProgramBuiltInModules,
  formlessProgramDefaultAuthorization,
  formlessProgramDefaultComposition,
  formlessProgramDefaultNavigation,
  formlessProgramDefaultRuntime,
  formlessProgramSchemaModules,
  formlessProgramSourceSchema,
} from "./schema.ts";

export const formlessProgramDefaultRuntimeComposition = defineProgramRuntimeComposition({
  shared: formlessProgramDefaultSharedRuntime,
  browser: formlessProgramDefaultBrowserRuntime,
  worker: formlessProgramDefaultWorkerRuntime,
});
