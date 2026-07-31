import { rmSync } from "node:fs";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build, type Plugin } from "esbuild";
import { Miniflare, type WorkerOptions } from "miniflare";
import { astryxStylexWorkerBundlePlugin } from "../runtime/stylex-esbuild.ts";
import {
  runtimeWorkspaceCrmAppPackageFixture,
  runtimeWorkspaceTaskAppPackageFixture,
} from "../test/workspace-app-package.ts";
import {
  FORMLESS_WORKSPACE_APP_PACKAGES_ENV_NAME,
  formatRuntimeWorkspaceAppPackages,
} from "../shared/workspace-runtime-packages.ts";
import { SITE_PUBLIC_RENDERER_WORKER_VIRTUAL_MODULE_ID } from "../shared/workspace-runtime-extensions.ts";

type DispatchFetchInit = Parameters<Miniflare["dispatchFetch"]>[1];
type DurableObjectNamespaceForHarness = Awaited<ReturnType<Miniflare["getDurableObjectNamespace"]>>;
type DurableObjectFetchInit = Parameters<
  ReturnType<DurableObjectNamespaceForHarness["get"]>["fetch"]
>[1];
type ServiceBindingHandler = (request: Request) => Promise<Response> | Response;

type DurableObjectBindings = Record<
  string,
  {
    className: string;
    useSQLite: true;
  }
>;

type WorkerHarnessOptions = Pick<
  WorkerOptions,
  "bindings" | "compatibilityDate" | "queueProducers" | "r2Buckets"
> & {
  serviceBindings?: Record<string, ServiceBindingHandler>;
};

type WorkerBundleInput = {
  mtimeMs: number;
  path: string;
  size: number;
};

type WorkerBundle = {
  inputs: WorkerBundleInput[];
  modulesRoot: string;
  scriptPath: string;
};

const workerBundleCache = new Map<string, Promise<WorkerBundle>>();
let workerBundleCacheRoot: Promise<string> | null = null;
let defaultRuntimePackages: Promise<string> | null = null;
export const FORMLESS_WORKER_COMPATIBILITY_DATE = "2026-04-28";

export async function createWorkerHarness(
  entryPoint: string,
  durableObjects: DurableObjectBindings,
  options: WorkerHarnessOptions = {},
) {
  const bundle = await workerBundle(entryPoint);

  const mf = new Miniflare({
    bindings: {
      [FORMLESS_WORKSPACE_APP_PACKAGES_ENV_NAME]: await defaultRuntimeWorkspacePackages(),
      ...options.bindings,
    },
    compatibilityDate: options.compatibilityDate,
    durableObjects,
    durableObjectsPersist: false,
    modules: true,
    modulesRoot: bundle.modulesRoot,
    modulesRules: [{ type: "CompiledWasm", include: ["**/*.wasm"] }],
    queueProducers: options.queueProducers,
    r2Buckets: options.r2Buckets,
    r2Persist: false,
    scriptPath: bundle.scriptPath,
    serviceBindings: options.serviceBindings,
  });

  return {
    mf,
    fetch: (path: string, init?: DispatchFetchInit) =>
      mf.dispatchFetch(`http://example.com${path}`, init),
    async durableObjectFetch(
      bindingName: string,
      objectName: string,
      path: string,
      init?: DurableObjectFetchInit,
    ) {
      const namespace = await mf.getDurableObjectNamespace(bindingName);
      const id = namespace.idFromName(objectName);

      return namespace.get(id).fetch(`http://example.com${path}`, init);
    },
    async dispose() {
      await mf.dispose();
    },
  };
}

async function defaultRuntimeWorkspacePackages() {
  defaultRuntimePackages ??= Promise.all([
    runtimeWorkspaceTaskAppPackageFixture(),
    runtimeWorkspaceCrmAppPackageFixture(),
  ]).then((appPackages) => formatRuntimeWorkspaceAppPackages(appPackages));

  return defaultRuntimePackages;
}

async function workerBundle(entryPoint: string): Promise<WorkerBundle> {
  const entryPath = resolve(entryPoint);
  const cached = workerBundleCache.get(entryPath);

  if (cached) {
    const bundle = await cached;

    if (await workerBundleIsFresh(bundle)) {
      return bundle;
    }

    workerBundleCache.delete(entryPath);
  }

  const next = buildWorkerBundle(entryPath);
  workerBundleCache.set(entryPath, next);

  try {
    return await next;
  } catch (error) {
    if (workerBundleCache.get(entryPath) === next) {
      workerBundleCache.delete(entryPath);
    }

    throw error;
  }
}

async function buildWorkerBundle(entryPoint: string): Promise<WorkerBundle> {
  const root = await currentWorkerBundleCacheRoot();
  const modulesRoot = await mkdtemp(join(root, "bundle-"));
  const scriptPath = join(modulesRoot, "worker.mjs");

  try {
    const result = await build({
      bundle: true,
      entryPoints: [entryPoint],
      external: ["cloudflare:workers"],
      format: "esm",
      loader: { ".wasm": "copy" },
      metafile: true,
      nodePaths: [resolve("node_modules")],
      outfile: scriptPath,
      platform: "browser",
      plugins: [
        astryxStylexWorkerBundlePlugin(resolve("lib/renderer")),
        workerRuntimeExtensionVirtualModulesPlugin(),
      ],
    });

    return {
      inputs: await Promise.all(
        Object.keys(result.metafile.inputs).map(async (inputPath) => {
          const path = resolve(inputPath);
          const inputStat = await stat(path);

          return {
            mtimeMs: inputStat.mtimeMs,
            path,
            size: inputStat.size,
          };
        }),
      ),
      modulesRoot,
      scriptPath,
    };
  } catch (error) {
    rmSync(modulesRoot, { force: true, recursive: true });
    throw error;
  }
}

function workerRuntimeExtensionVirtualModulesPlugin(): Plugin {
  const defaultRendererPath = resolve("src/worker/default-site-public-renderer.ts");

  return {
    name: "formless-worker-runtime-extension-virtual-modules",
    setup(build) {
      build.onResolve({ filter: /^virtual:formless\/site-public-renderer\/worker$/ }, (args) =>
        args.path === SITE_PUBLIC_RENDERER_WORKER_VIRTUAL_MODULE_ID
          ? { path: defaultRendererPath }
          : undefined,
      );
    },
  };
}

async function workerBundleIsFresh(bundle: WorkerBundle): Promise<boolean> {
  for (const input of bundle.inputs) {
    try {
      const inputStat = await stat(input.path);

      if (inputStat.mtimeMs !== input.mtimeMs || inputStat.size !== input.size) {
        return false;
      }
    } catch {
      return false;
    }
  }

  return true;
}

async function currentWorkerBundleCacheRoot(): Promise<string> {
  workerBundleCacheRoot ??= mkdtemp(join(tmpdir(), "formless-worker-bundle-cache-")).then(
    (root) => {
      process.once("exit", () => {
        rmSync(root, { force: true, recursive: true });
      });

      return root;
    },
  );

  return workerBundleCacheRoot;
}
