import { describe, expect, it } from "vite-plus/test";
import { createMemoryPresentationHost } from "@dpeek/formless-presentation/host";
import { instanceControlPlaneSchema } from "@dpeek/formless-instance-control-plane";
import type { AppSchema } from "@dpeek/formless-schema";
import type { StoredRecord } from "@dpeek/formless-storage";
import { selectScreenModels } from "../../client/views.ts";
import {
  crmSourceSchema,
  rateSourceSchema,
  siteSourceSchema,
  taskTestRecords,
  taskSourceSchema,
} from "../../test/schema-apps.ts";
import { projectGeneratedWorkspaceContractHostPublication } from "./generated-workspace-contract-host.ts";
import { selectGeneratedWorkspaceFoundation } from "./generated-workspace-foundation.ts";
import { projectGeneratedWorkspaceContract } from "./workspace-projection.ts";

describe("generated workspace production path", () => {
  it("keeps every shipped screen on a supported canonical result path", () => {
    const inventory = Object.fromEntries(
      Object.entries(productionSchemas).map(([schemaKey, schema]) => [
        schemaKey,
        selectScreenModels(schema).map((screen) => ({
          results: screen.layout.sections.map((section) => section.collection.result.type),
          screen: screen.screenName,
          width: screen.layout.width,
        })),
      ]),
    );

    expect(inventory).toEqual({
      crm: [
        { results: ["table", "table", "table"], screen: "contacts", width: "wide" },
        { results: ["table", "table"], screen: "audiences", width: "wide" },
        { results: ["table", "table"], screen: "campaigns", width: "wide" },
        { results: ["table", "table", "table"], screen: "broadcasts", width: "wide" },
      ],
      instance: [
        { results: ["table"], screen: "deployments", width: "standard" },
        { results: ["table", "table", "table"], screen: "settings", width: "standard" },
        { results: ["table"], screen: "routes", width: "standard" },
      ],
      rate: [
        { results: ["table"], screen: "rateHome", width: "standard" },
        { results: ["list", "list"], screen: "rateSetup", width: "standard" },
      ],
      site: [
        { results: ["record"], screen: "siteSettings", width: "narrow" },
        { results: ["tree"], screen: "siteEditor", width: "wide" },
        { results: ["table", "table", "table"], screen: "siteSubscribers", width: "wide" },
        { results: ["table"], screen: "siteContacts", width: "wide" },
      ],
      tasks: [{ results: ["list"], screen: "taskHome", width: "standard" }],
    });
  });

  it("publishes narrow, standard, and wide shipped workspace widths", () => {
    const examples = [
      { schema: siteSourceSchema, screenName: "siteSettings" },
      { schema: taskSourceSchema, screenName: "taskHome" },
      { schema: crmSourceSchema, screenName: "contacts" },
    ];

    const widths = examples.map(({ schema, screenName }) => {
      const screen = required(
        selectScreenModels(schema).find((candidate) => candidate.screenName === screenName),
      );
      const workspace = projectGeneratedWorkspaceContract({
        id: screen.screenName,
        label: screen.label,
        sections: [],
        width: screen.layout.width,
      });
      const publication = projectGeneratedWorkspaceContractHostPublication(workspace);
      const host = createMemoryPresentationHost({ nodes: publication.nodes });

      return required(host.read(publication.workspaceReference)).width;
    });

    expect(widths).toEqual(["narrow", "standard", "wide"]);
  });

  it("publishes a selected route result through the scoped workspace host", () => {
    const screen = required(
      selectScreenModels(taskSourceSchema).find((candidate) => candidate.screenName === "taskHome"),
    );
    const foundation = required(
      selectGeneratedWorkspaceFoundation({
        screen,
        snapshot: projectionSnapshot(taskTestRecords),
        today: "2026-07-19",
      }),
    );
    const publication = projectGeneratedWorkspaceContractHostPublication(foundation.workspace);
    const host = createMemoryPresentationHost({ nodes: publication.nodes });
    const workspace = required(host.read(publication.workspaceReference));
    const section = required(host.read(required(workspace.sections[0])));
    const result = required(host.read(section.collection.presentation.result));

    expect(workspace).toMatchObject({
      id: "workspace:taskHome",
      kind: "workspaceManifest",
      width: "standard",
    });
    expect(section).toMatchObject({ kind: "workspaceSectionShell" });
    expect(result).toMatchObject({ kind: "list" });
  });
});

const productionSchemas = {
  crm: crmSourceSchema,
  instance: instanceControlPlaneSchema,
  rate: rateSourceSchema,
  site: siteSourceSchema,
  tasks: taskSourceSchema,
} satisfies Record<string, AppSchema>;

function projectionSnapshot(records: readonly StoredRecord[]) {
  return {
    recordsById: Object.fromEntries(records.map((record) => [record.id, record])),
    recordIdsByEntity: records.reduce<Record<string, string[]>>((byEntity, record) => {
      (byEntity[record.entity] ??= []).push(record.id);
      return byEntity;
    }, {}),
  };
}

function required<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("Missing required generated workspace fixture value.");
  }
  return value;
}
