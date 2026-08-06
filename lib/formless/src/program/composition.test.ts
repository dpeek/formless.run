import { defineAppSchemaModule } from "@dpeek/formless-schema";
import { describe, expect, it } from "vite-plus/test";

import {
  defineProgramBrowserRuntime,
  defineProgramRuntimeComposition,
  defineProgramSharedRuntime,
  defineProgramWorkerRuntime,
  formatFormlessProgramArtifact,
  materializeFormlessProgramArtifact,
  type ProgramBrowserRuntimeDefinition,
  type ProgramRuntimeComposition,
} from "@dpeek/formless/program";
import {
  formlessProgramDefaultBrowserRuntime,
  formlessProgramDefaultComposition,
  formlessProgramDefaultRuntimeComposition,
  formlessProgramDefaultSharedRuntime,
  formlessProgramDefaultWorkerRuntime,
  formlessProgramSourceSchema,
} from "@dpeek/formless/program/default";
import { formlessProgramDefaultBrowserRuntime as directDefaultBrowserRuntime } from "@dpeek/formless/program/default/browser";
import { formlessProgramDefaultSharedRuntime as directDefaultSharedRuntime } from "@dpeek/formless/program/default/shared";
import { formlessProgramDefaultWorkerRuntime as directDefaultWorkerRuntime } from "@dpeek/formless/program/default/worker";

const recordEntityId = "entity_d0501a6e-4992-46dc-9f76-c67b362dd3bd";

describe("Program runtime composition", () => {
  it("exposes explicit default schema and target composition roots", () => {
    expect(formlessProgramSourceSchema.entities.length).toBeGreaterThan(0);
    expect(formlessProgramDefaultRuntimeComposition).toEqual({
      shared: formlessProgramDefaultSharedRuntime,
      browser: formlessProgramDefaultBrowserRuntime,
      worker: formlessProgramDefaultWorkerRuntime,
    });
    expect(formlessProgramDefaultSharedRuntime).toBe(directDefaultSharedRuntime);
    expect(formlessProgramDefaultBrowserRuntime).toBe(directDefaultBrowserRuntime);
    expect(formlessProgramDefaultWorkerRuntime).toBe(directDefaultWorkerRuntime);
    expect(formlessProgramDefaultSharedRuntime.recordAdapters.map(({ key }) => key)).toEqual([
      "instance-control-plane.records",
      "identity-control-plane.records",
      "site.records",
    ]);
    expect(formlessProgramDefaultSharedRuntime.operationAdapters.map(({ key }) => key)).toEqual([
      "contact-subscription.subscribe",
    ]);
    expect(
      formlessProgramDefaultSharedRuntime.bootstrapContributions.map(({ key }) => key),
    ).toEqual(["identity-control-plane.bootstrap"]);
    expect(formlessProgramDefaultSharedRuntime.createIdContributions.map(({ key }) => key)).toEqual(
      ["instance-control-plane.create-id"],
    );
    expect(formlessProgramDefaultWorkerRuntime.afterCommit.map(({ key }) => key)).toEqual([
      "site.contact-notification",
      "site.operation-input-notification",
    ]);
    expect(formlessProgramDefaultBrowserRuntime.surfaces.map(({ key }) => key)).toEqual([
      "site.public",
    ]);
    expect(formlessProgramDefaultBrowserRuntime.mounts).toEqual([
      {
        target: "browser",
        mountKey: "site.preview.browser",
        surfaceKey: "site.public",
      },
    ]);
    expect(formlessProgramDefaultWorkerRuntime.publicReads.map(({ key }) => key)).toEqual([
      "site.public-tree",
    ]);
    expect(formlessProgramDefaultWorkerRuntime.surfaces.map(({ key }) => key)).toEqual([
      "site.public",
    ]);
    expect(formlessProgramDefaultWorkerRuntime.mounts).toEqual([
      {
        target: "worker",
        mountKey: "site.preview.worker",
        surfaceKey: "site.public",
      },
    ]);
  });

  it("rejects an omitted contact subscription operation adapter before build", async () => {
    await expect(
      materializeFormlessProgramArtifact(formlessProgramDefaultComposition, {
        runtime: {
          ...formlessProgramDefaultRuntimeComposition,
          shared: {
            ...formlessProgramDefaultSharedRuntime,
            operationAdapters: [],
          },
        },
      }),
    ).rejects.toThrow(
      'Schema module "standard-contact-subscription-records" requires Program runtime selection "contact-subscription.subscribe" in shared.operationAdapters.',
    );
  });

  it("rejects omitted Site target selections before build", async () => {
    await expect(
      materializeFormlessProgramArtifact(formlessProgramDefaultComposition, {
        runtime: {
          ...formlessProgramDefaultRuntimeComposition,
          browser: {
            ...formlessProgramDefaultBrowserRuntime,
            surfaces: [],
          },
        },
      }),
    ).rejects.toThrow(
      'Program runtime surface mount binding "site.preview.browser" references missing surface "site.public" in browser.surfaces.',
    );

    await expect(
      materializeFormlessProgramArtifact(formlessProgramDefaultComposition, {
        runtime: {
          ...formlessProgramDefaultRuntimeComposition,
          worker: {
            ...formlessProgramDefaultWorkerRuntime,
            publicReads: [],
          },
        },
      }),
    ).rejects.toThrow(
      'Schema module "site-records" requires Program runtime selection "site.public-tree" in worker.publicReads.',
    );

    await expect(
      materializeFormlessProgramArtifact(formlessProgramDefaultComposition, {
        runtime: {
          ...formlessProgramDefaultRuntimeComposition,
          worker: {
            ...formlessProgramDefaultWorkerRuntime,
            surfaces: [],
          },
        },
      }),
    ).rejects.toThrow(
      'Program runtime surface mount binding "site.preview.worker" references missing surface "site.public" in worker.surfaces.',
    );
  });

  it("validates required selections while keeping runtime metadata out of artifacts", async () => {
    const composition = requiringProgramComposition();
    const runtime = completeRuntimeComposition();
    const artifact = await materializeFormlessProgramArtifact(composition, { runtime });
    const artifactText = formatFormlessProgramArtifact(artifact);
    const dataOnlyArtifact = await materializeFormlessProgramArtifact(
      {
        ...composition,
        modules: composition.modules.map(({ runtimeRequirements: _requirements, ...module }) =>
          defineAppSchemaModule(module),
        ),
      },
      { runtime },
    );

    expect(artifact).toEqual(dataOnlyArtifact);
    expect(artifactText).not.toContain("runtimeRequirements");
    expect(artifactText).not.toContain("workspace.records");
    expect(artifactText).not.toContain("publicEligible");
  });

  it("rejects a missing required selection during materialization", async () => {
    await expect(
      materializeFormlessProgramArtifact(requiringProgramComposition(), {
        runtime: formlessProgramDefaultRuntimeComposition,
      }),
    ).rejects.toThrow(
      'Schema module "workspace-records" requires Program runtime selection "workspace.records" in shared.recordAdapters.',
    );
  });

  it("rejects duplicate selections before artifact materialization", async () => {
    const runtime = completeRuntimeComposition();
    const workspaceAdapter = runtime.shared.recordAdapters.at(-1)!;

    await expect(
      materializeFormlessProgramArtifact(requiringProgramComposition(), {
        runtime: {
          ...runtime,
          shared: {
            ...runtime.shared,
            recordAdapters: [...runtime.shared.recordAdapters, workspaceAdapter],
          },
        },
      }),
    ).rejects.toThrow(
      'Program runtime selection key "workspace.records" is listed more than once in shared.recordAdapters.',
    );

    await expect(
      materializeFormlessProgramArtifact(requiringProgramComposition(), {
        runtime: {
          ...runtime,
          shared: {
            ...runtime.shared,
            recordAdapters: [
              ...runtime.shared.recordAdapters,
              {
                ...workspaceAdapter,
                key: "workspace.records.alternate",
              },
            ],
          },
        },
      }),
    ).rejects.toThrow(
      `Program runtime selections "workspace.records" and "workspace.records.alternate" in shared.recordAdapters both claim entity id "${recordEntityId}".`,
    );
  });

  it("rejects selections that claim an entity absent from the Program", async () => {
    const runtime = completeRuntimeComposition();
    const workspaceAdapter = runtime.shared.recordAdapters.at(-1)!;

    await expect(
      materializeFormlessProgramArtifact(requiringProgramComposition(), {
        runtime: {
          ...runtime,
          shared: {
            ...runtime.shared,
            recordAdapters: runtime.shared.recordAdapters.map((adapter) =>
              adapter === workspaceAdapter
                ? {
                    ...adapter,
                    entityIds: ["entity_390400f3-eb7f-4ce9-bcff-a3c2cc6c3863"],
                  }
                : adapter,
            ),
          },
        },
      }),
    ).rejects.toThrow(
      'Program runtime selection "workspace.records" in shared.recordAdapters claims entity id "entity_390400f3-eb7f-4ce9-bcff-a3c2cc6c3863", but the Program schema does not contain it.',
    );
  });

  it("rejects a target-incompatible selection at the build boundary", async () => {
    const runtime = completeRuntimeComposition();
    const workspaceSurface = runtime.browser.surfaces.find(
      ({ key }) => key === "workspace.browser",
    )!;
    const incompatibleBrowser = {
      ...runtime.browser,
      surfaces: [
        {
          ...workspaceSurface,
          target: "worker",
        },
      ],
    } as unknown as ProgramBrowserRuntimeDefinition;

    await expect(
      materializeFormlessProgramArtifact(requiringProgramComposition(), {
        runtime: { ...runtime, browser: incompatibleBrowser },
      }),
    ).rejects.toThrow(
      'Program runtime selection "workspace.browser" in browser.surfaces targets "worker" instead of "browser".',
    );
  });

  it("rejects missing, duplicate, and target-incompatible surface-mount bindings", async () => {
    await expect(
      materializeFormlessProgramArtifact(formlessProgramDefaultComposition, {
        runtime: {
          ...formlessProgramDefaultRuntimeComposition,
          browser: { ...formlessProgramDefaultBrowserRuntime, mounts: [] },
        },
      }),
    ).rejects.toThrow(
      'Program surface mount "site.preview.browser" has no browser runtime binding.',
    );

    await expect(
      materializeFormlessProgramArtifact(formlessProgramDefaultComposition, {
        runtime: {
          ...formlessProgramDefaultRuntimeComposition,
          browser: {
            ...formlessProgramDefaultBrowserRuntime,
            mounts: [
              ...formlessProgramDefaultBrowserRuntime.mounts,
              ...formlessProgramDefaultBrowserRuntime.mounts,
            ],
          },
        },
      }),
    ).rejects.toThrow('Program surface mount "site.preview.browser" is bound more than once.');

    await expect(
      materializeFormlessProgramArtifact(formlessProgramDefaultComposition, {
        runtime: {
          ...formlessProgramDefaultRuntimeComposition,
          browser: { ...formlessProgramDefaultBrowserRuntime, mounts: [] },
          worker: {
            ...formlessProgramDefaultWorkerRuntime,
            mounts: [
              ...formlessProgramDefaultWorkerRuntime.mounts,
              {
                target: "worker",
                mountKey: "site.preview.browser",
                surfaceKey: "site.public",
              },
            ],
          },
        },
      }),
    ).rejects.toThrow(
      'Program runtime surface mount binding "site.preview.browser" targets "worker" instead of declared target "browser".',
    );
  });
});

function requiringProgramComposition() {
  return {
    ...formlessProgramDefaultComposition,
    modules: [
      ...formlessProgramDefaultComposition.modules,
      defineAppSchemaModule({
        key: "workspace-records",
        runtimeRequirements: {
          shared: {
            recordAdapters: ["workspace.records"],
            operationAdapters: ["workspace.operation"],
            bootstrapContributions: ["workspace.bootstrap"],
            createIdContributions: ["workspace.create-id"],
          },
          browser: {
            projections: ["workspace.projection"],
            surfaces: ["workspace.browser"],
          },
          worker: {
            publicReads: ["workspace.public-read"],
            surfaces: ["workspace.worker"],
            afterCommit: ["workspace.after-commit"],
          },
        },
        entities: [
          {
            id: recordEntityId,
            key: "workspace-record",
            label: "Workspace record",
            fields: [{ key: "name", type: "text", required: true }],
          },
        ],
      }),
    ],
  };
}

function completeRuntimeComposition(): ProgramRuntimeComposition {
  const shared = defineProgramSharedRuntime({
    ...formlessProgramDefaultSharedRuntime,
    recordAdapters: [
      ...formlessProgramDefaultSharedRuntime.recordAdapters,
      {
        target: "shared",
        kind: "record-adapter",
        key: "workspace.records",
        entityIds: [recordEntityId],
        adapter: {
          canonicalize: () => [],
          validate: () => undefined,
          validateCandidate: () => undefined,
        },
      },
    ],
    operationAdapters: [
      ...formlessProgramDefaultSharedRuntime.operationAdapters,
      {
        target: "shared",
        kind: "operation-adapter",
        key: "workspace.operation",
        publicEligible: false,
        execute: () => undefined,
      },
    ],
    bootstrapContributions: [
      ...formlessProgramDefaultSharedRuntime.bootstrapContributions,
      {
        target: "shared",
        kind: "bootstrap-contribution",
        key: "workspace.bootstrap",
        entityIds: [recordEntityId],
        contribute: () => [],
      },
    ],
    createIdContributions: [
      ...formlessProgramDefaultSharedRuntime.createIdContributions,
      {
        target: "shared",
        kind: "create-id-contribution",
        key: "workspace.create-id",
        entityIds: [recordEntityId],
        createId: () => "workspace-record:created",
      },
    ],
  });
  const browser = defineProgramBrowserRuntime({
    ...formlessProgramDefaultBrowserRuntime,
    target: "browser",
    projections: [
      {
        target: "browser",
        kind: "projection",
        key: "workspace.projection",
        entityIds: [recordEntityId],
        project: () => undefined,
      },
    ],
    surfaces: [
      ...formlessProgramDefaultBrowserRuntime.surfaces,
      {
        target: "browser",
        kind: "surface",
        key: "workspace.browser",
        entityIds: [recordEntityId],
        surface: {},
      },
    ],
  });
  const worker = defineProgramWorkerRuntime({
    ...formlessProgramDefaultWorkerRuntime,
    target: "worker",
    publicReads: [
      ...formlessProgramDefaultWorkerRuntime.publicReads,
      {
        target: "worker",
        kind: "public-read",
        key: "workspace.public-read",
        entityIds: [recordEntityId],
        read: () => undefined,
      },
    ],
    surfaces: [
      ...formlessProgramDefaultWorkerRuntime.surfaces,
      {
        target: "worker",
        kind: "surface",
        key: "workspace.worker",
        entityIds: [recordEntityId],
        surface: {},
      },
    ],
    afterCommit: [
      ...formlessProgramDefaultWorkerRuntime.afterCommit,
      {
        target: "worker",
        kind: "after-commit",
        key: "workspace.after-commit",
        entityIds: [recordEntityId],
        run: () => undefined,
      },
    ],
  });

  return defineProgramRuntimeComposition({ shared, browser, worker });
}
