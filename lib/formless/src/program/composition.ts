import type {
  AppSchema,
  AppSchemaCompositionSource,
  AppSchemaModuleRuntimeRequirements,
  AppSchemaSource,
} from "@dpeek/formless-schema";
import type { RecordValues, StoredRecord } from "@dpeek/formless-storage";

type ProgramRuntimeTarget = "shared" | "browser" | "worker";
export type ProgramSharedRecordAdapterInput = {
  allRecords: readonly StoredRecord[];
  records: readonly StoredRecord[];
  schema: AppSchema;
};

export type ProgramSharedRecordCandidateInput = ProgramSharedRecordAdapterInput & {
  candidate: StoredRecord;
};

export type ProgramSharedRecordAdapter = {
  canonicalize: (input: ProgramSharedRecordAdapterInput) => readonly StoredRecord[];
  validate: (context: string, input: ProgramSharedRecordAdapterInput) => void;
  validateCandidate: (context: string, input: ProgramSharedRecordCandidateInput) => void;
};

export type ProgramSharedRecordAdapterDefinition = {
  adapter: ProgramSharedRecordAdapter;
  entityIds: readonly string[];
  key: string;
  kind: "record-adapter";
  target: "shared";
};

export type ProgramSharedOperationAdapterDefinition = {
  execute: (...args: never[]) => unknown;
  key: string;
  kind: "operation-adapter";
  publicEligible: boolean;
  target: "shared";
};

export type ProgramSharedBootstrapContributionDefinition = {
  contribute: () => readonly StoredRecord[];
  entityIds: readonly string[];
  key: string;
  kind: "bootstrap-contribution";
  target: "shared";
};

export type ProgramSharedCreateIdContributionDefinition = {
  createId: (entity: string, values: RecordValues) => string | undefined;
  entityIds: readonly string[];
  key: string;
  kind: "create-id-contribution";
  target: "shared";
};

export type ProgramBrowserProjectionDefinition = {
  entityIds: readonly string[];
  key: string;
  kind: "projection";
  project: (...args: never[]) => unknown;
  target: "browser";
};

export type ProgramBrowserSurfaceDefinition = {
  entityIds: readonly string[];
  key: string;
  kind: "surface";
  surface: object;
  target: "browser";
};

export type ProgramBrowserSurfaceMountBinding = {
  mountKey: string;
  surfaceKey: string;
  target: "browser";
};

export type ProgramWorkerPublicReadDefinition = {
  entityIds: readonly string[];
  key: string;
  kind: "public-read";
  read: (...args: never[]) => unknown;
  target: "worker";
};

export type ProgramWorkerSurfaceDefinition = {
  entityIds: readonly string[];
  key: string;
  kind: "surface";
  surface: object;
  target: "worker";
};

export type ProgramWorkerSurfaceMountBinding = {
  mountKey: string;
  surfaceKey: string;
  target: "worker";
};

export type ProgramWorkerAfterCommitDefinition = {
  entityIds: readonly string[];
  key: string;
  kind: "after-commit";
  run: (...args: never[]) => unknown;
  target: "worker";
};

export type ProgramSharedRuntimeDefinition = {
  target: "shared";
  recordAdapters: readonly ProgramSharedRecordAdapterDefinition[];
  operationAdapters: readonly ProgramSharedOperationAdapterDefinition[];
  bootstrapContributions: readonly ProgramSharedBootstrapContributionDefinition[];
  createIdContributions: readonly ProgramSharedCreateIdContributionDefinition[];
};

export type ProgramBrowserRuntimeDefinition = {
  target: "browser";
  projections: readonly ProgramBrowserProjectionDefinition[];
  surfaces: readonly ProgramBrowserSurfaceDefinition[];
  mounts: readonly ProgramBrowserSurfaceMountBinding[];
};

export type ProgramWorkerRuntimeDefinition = {
  target: "worker";
  publicReads: readonly ProgramWorkerPublicReadDefinition[];
  surfaces: readonly ProgramWorkerSurfaceDefinition[];
  mounts: readonly ProgramWorkerSurfaceMountBinding[];
  afterCommit: readonly ProgramWorkerAfterCommitDefinition[];
};

export type ProgramRuntimeComposition = {
  shared: ProgramSharedRuntimeDefinition;
  browser: ProgramBrowserRuntimeDefinition;
  worker: ProgramWorkerRuntimeDefinition;
};

export function defineProgramSharedRuntime<const Definition extends ProgramSharedRuntimeDefinition>(
  definition: Definition,
): Definition {
  return definition;
}

export function defineProgramBrowserRuntime<
  const Definition extends ProgramBrowserRuntimeDefinition,
>(definition: Definition): Definition {
  return definition;
}

export function defineProgramWorkerRuntime<const Definition extends ProgramWorkerRuntimeDefinition>(
  definition: Definition,
): Definition {
  return definition;
}

export function defineProgramRuntimeComposition<
  const Composition extends ProgramRuntimeComposition,
>(composition: Composition): Composition {
  return composition;
}

export function validateProgramRuntimeComposition(input: {
  composition: AppSchemaCompositionSource;
  runtime?: ProgramRuntimeComposition;
  sourceSchema: AppSchemaSource;
}): void {
  const runtime = input.runtime ?? emptyProgramRuntimeComposition;
  const entityIds = new Set(input.sourceSchema.entities.map((entity) => entity.id));

  validateProgramSharedRuntimeDefinition(input.sourceSchema, runtime.shared);
  assertRuntimeRootTarget("browser", runtime.browser.target);
  assertRuntimeRootTarget("worker", runtime.worker.target);
  validateSelections(
    "browser.projections",
    runtime.browser.projections,
    "browser",
    "projection",
    entityIds,
  );
  validateSelections("browser.surfaces", runtime.browser.surfaces, "browser", "surface", entityIds);
  validateSelections(
    "worker.publicReads",
    runtime.worker.publicReads,
    "worker",
    "public-read",
    entityIds,
  );
  validateSelections("worker.surfaces", runtime.worker.surfaces, "worker", "surface", entityIds);
  validateSelections(
    "worker.afterCommit",
    runtime.worker.afterCommit,
    "worker",
    "after-commit",
    entityIds,
  );
  validateSurfaceMountBindings(input.sourceSchema, runtime);

  validateSharedRequirements(input.composition, runtime.shared);
  validateTargetRequirements(input.composition, runtime, "browser");
  validateTargetRequirements(input.composition, runtime, "worker");
}

export function validateProgramSharedRuntimeComposition(input: {
  composition: AppSchemaCompositionSource;
  runtime: ProgramSharedRuntimeDefinition;
  sourceSchema: AppSchemaSource;
}): void {
  validateProgramSharedRuntimeDefinition(input.sourceSchema, input.runtime);
  validateSharedRequirements(input.composition, input.runtime);
}

export function validateProgramSharedRuntimeDefinition(
  schema: { entities: readonly { id: string }[] },
  runtime: ProgramSharedRuntimeDefinition,
): void {
  const entityIds = new Set(schema.entities.map((entity) => entity.id));

  assertRuntimeRootTarget("shared", runtime.target);
  validateSelections(
    "shared.recordAdapters",
    runtime.recordAdapters,
    "shared",
    "record-adapter",
    entityIds,
    true,
  );
  validateSelections(
    "shared.operationAdapters",
    runtime.operationAdapters,
    "shared",
    "operation-adapter",
    entityIds,
  );
  validateSelections(
    "shared.bootstrapContributions",
    runtime.bootstrapContributions,
    "shared",
    "bootstrap-contribution",
    entityIds,
  );
  validateSelections(
    "shared.createIdContributions",
    runtime.createIdContributions,
    "shared",
    "create-id-contribution",
    entityIds,
    true,
  );
}

const emptyProgramRuntimeComposition: ProgramRuntimeComposition = {
  shared: {
    target: "shared",
    recordAdapters: [],
    operationAdapters: [],
    bootstrapContributions: [],
    createIdContributions: [],
  },
  browser: { target: "browser", projections: [], surfaces: [], mounts: [] },
  worker: { target: "worker", publicReads: [], surfaces: [], mounts: [], afterCommit: [] },
};

type RuntimeSelection = {
  entityIds?: readonly string[];
  key: string;
  kind: string;
  target: ProgramRuntimeTarget;
};

function assertRuntimeRootTarget(expected: ProgramRuntimeTarget, actual: unknown): void {
  if (actual !== expected) {
    throw new Error(`Program ${expected} runtime definition targets "${String(actual)}".`);
  }
}

function validateSelections(
  path: string,
  selections: readonly RuntimeSelection[],
  target: ProgramRuntimeTarget,
  kind: string,
  schemaEntityIds: ReadonlySet<string>,
  ownsEntityTransform = false,
): void {
  const keys = new Set<string>();
  const entityOwners = new Map<string, string>();

  for (const selection of selections) {
    if (selection.target !== target) {
      throw new Error(
        `Program runtime selection "${selection.key}" in ${path} targets "${selection.target}" instead of "${target}".`,
      );
    }
    if (selection.kind !== kind) {
      throw new Error(
        `Program runtime selection "${selection.key}" in ${path} has kind "${selection.kind}" instead of "${kind}".`,
      );
    }
    if (selection.key.trim() === "") {
      throw new Error(`Program runtime selection in ${path} must have a non-empty key.`);
    }
    if (keys.has(selection.key)) {
      throw new Error(
        `Program runtime selection key "${selection.key}" is listed more than once in ${path}.`,
      );
    }
    keys.add(selection.key);

    const selectedEntityIds = selection.entityIds;
    if (selectedEntityIds === undefined) {
      continue;
    }
    if (selectedEntityIds.length === 0) {
      throw new Error(
        `Program runtime selection "${selection.key}" in ${path} must claim at least one entity id.`,
      );
    }

    const localEntityIds = new Set<string>();
    for (const entityId of selectedEntityIds) {
      if (localEntityIds.has(entityId)) {
        throw new Error(
          `Program runtime selection "${selection.key}" in ${path} lists entity id "${entityId}" more than once.`,
        );
      }
      localEntityIds.add(entityId);

      if (!schemaEntityIds.has(entityId)) {
        throw new Error(
          `Program runtime selection "${selection.key}" in ${path} claims entity id "${entityId}", but the Program schema does not contain it.`,
        );
      }

      if (ownsEntityTransform) {
        const owner = entityOwners.get(entityId);
        if (owner !== undefined) {
          throw new Error(
            `Program runtime selections "${owner}" and "${selection.key}" in ${path} both claim entity id "${entityId}".`,
          );
        }
        entityOwners.set(entityId, selection.key);
      }
    }
  }
}

type ProgramSurfaceMountBinding =
  | ProgramBrowserSurfaceMountBinding
  | ProgramWorkerSurfaceMountBinding;

function validateSurfaceMountBindings(
  schema: AppSchemaSource,
  runtime: ProgramRuntimeComposition,
): void {
  validateSurfaceMountBindingTargets("browser.mounts", runtime.browser.mounts, "browser");
  validateSurfaceMountBindingTargets("worker.mounts", runtime.worker.mounts, "worker");
  const declarations = new Map((schema.surfaceMounts ?? []).map((mount) => [mount.key, mount]));
  const bindings: readonly ProgramSurfaceMountBinding[] = [
    ...runtime.browser.mounts,
    ...runtime.worker.mounts,
  ];
  const boundMountKeys = new Set<string>();
  const surfacesByTarget = {
    browser: new Set(runtime.browser.surfaces.map(({ key }) => key)),
    worker: new Set(runtime.worker.surfaces.map(({ key }) => key)),
  };

  for (const binding of bindings) {
    if (binding.mountKey.trim() === "" || binding.surfaceKey.trim() === "") {
      throw new Error("Program runtime surface mount bindings must use non-empty keys.");
    }
    if (boundMountKeys.has(binding.mountKey)) {
      throw new Error(`Program surface mount "${binding.mountKey}" is bound more than once.`);
    }
    boundMountKeys.add(binding.mountKey);

    const declaration = declarations.get(binding.mountKey);
    if (declaration === undefined) {
      throw new Error(
        `Program runtime surface mount binding "${binding.mountKey}" does not match a declared surface mount.`,
      );
    }
    if (binding.target !== declaration.target) {
      throw new Error(
        `Program runtime surface mount binding "${binding.mountKey}" targets "${binding.target}" instead of declared target "${declaration.target}".`,
      );
    }
    if (!surfacesByTarget[binding.target].has(binding.surfaceKey)) {
      throw new Error(
        `Program runtime surface mount binding "${binding.mountKey}" references missing surface "${binding.surfaceKey}" in ${binding.target}.surfaces.`,
      );
    }
  }

  for (const declaration of declarations.values()) {
    if (!boundMountKeys.has(declaration.key)) {
      throw new Error(
        `Program surface mount "${declaration.key}" has no ${declaration.target} runtime binding.`,
      );
    }
  }
}

function validateSurfaceMountBindingTargets(
  path: string,
  bindings: readonly ProgramSurfaceMountBinding[],
  target: "browser" | "worker",
): void {
  for (const binding of bindings) {
    if (binding.target !== target) {
      throw new Error(
        `Program runtime surface mount binding "${binding.mountKey}" in ${path} targets "${binding.target}" instead of "${target}".`,
      );
    }
  }
}

function validateSharedRequirements(
  composition: AppSchemaCompositionSource,
  runtime: ProgramSharedRuntimeDefinition,
): void {
  const selected = {
    recordAdapters: new Set(runtime.recordAdapters.map(({ key }) => key)),
    operationAdapters: new Set(runtime.operationAdapters.map(({ key }) => key)),
    bootstrapContributions: new Set(runtime.bootstrapContributions.map(({ key }) => key)),
    createIdContributions: new Set(runtime.createIdContributions.map(({ key }) => key)),
  };

  for (const module of composition.modules) {
    const requirements = module.runtimeRequirements;
    if (requirements === undefined) {
      continue;
    }

    assertRequirementsSelected(
      module.key,
      "shared.recordAdapters",
      requirements.shared?.recordAdapters,
      selected.recordAdapters,
    );
    assertRequirementsSelected(
      module.key,
      "shared.operationAdapters",
      requirements.shared?.operationAdapters,
      selected.operationAdapters,
    );
    assertRequirementsSelected(
      module.key,
      "shared.bootstrapContributions",
      requirements.shared?.bootstrapContributions,
      selected.bootstrapContributions,
    );
    assertRequirementsSelected(
      module.key,
      "shared.createIdContributions",
      requirements.shared?.createIdContributions,
      selected.createIdContributions,
    );
  }
}

function validateTargetRequirements(
  composition: AppSchemaCompositionSource,
  runtime: ProgramRuntimeComposition,
  target: "browser" | "worker",
): void {
  const browserProjections = new Set(runtime.browser.projections.map(({ key }) => key));
  const browserSurfaces = new Set(runtime.browser.surfaces.map(({ key }) => key));
  const workerPublicReads = new Set(runtime.worker.publicReads.map(({ key }) => key));
  const workerSurfaces = new Set(runtime.worker.surfaces.map(({ key }) => key));
  const workerAfterCommit = new Set(runtime.worker.afterCommit.map(({ key }) => key));

  for (const module of composition.modules) {
    if (target === "browser") {
      assertRequirementsSelected(
        module.key,
        "browser.projections",
        module.runtimeRequirements?.browser?.projections,
        browserProjections,
      );
      assertRequirementsSelected(
        module.key,
        "browser.surfaces",
        module.runtimeRequirements?.browser?.surfaces,
        browserSurfaces,
      );
      continue;
    }

    assertRequirementsSelected(
      module.key,
      "worker.publicReads",
      module.runtimeRequirements?.worker?.publicReads,
      workerPublicReads,
    );
    assertRequirementsSelected(
      module.key,
      "worker.surfaces",
      module.runtimeRequirements?.worker?.surfaces,
      workerSurfaces,
    );
    assertRequirementsSelected(
      module.key,
      "worker.afterCommit",
      module.runtimeRequirements?.worker?.afterCommit,
      workerAfterCommit,
    );
  }
}

function assertRequirementsSelected(
  moduleKey: string,
  path: RuntimeRequirementPath,
  requirements: readonly string[] | undefined,
  selected: ReadonlySet<string>,
): void {
  const requiredKeys = new Set<string>();

  for (const key of requirements ?? []) {
    if (key.trim() === "") {
      throw new Error(
        `Schema module "${moduleKey}" runtime requirement ${path} must use non-empty keys.`,
      );
    }
    if (requiredKeys.has(key)) {
      throw new Error(
        `Schema module "${moduleKey}" runtime requirement "${key}" is listed more than once in ${path}.`,
      );
    }
    requiredKeys.add(key);

    if (!selected.has(key)) {
      throw new Error(
        `Schema module "${moduleKey}" requires Program runtime selection "${key}" in ${path}.`,
      );
    }
  }
}

type RuntimeRequirementPath =
  | `shared.${keyof NonNullable<AppSchemaModuleRuntimeRequirements["shared"]>}`
  | `browser.${keyof NonNullable<AppSchemaModuleRuntimeRequirements["browser"]>}`
  | `worker.${keyof NonNullable<AppSchemaModuleRuntimeRequirements["worker"]>}`;
