import { defineAppSchemaModule } from "@dpeek/formless-schema";

export const workspaceRuntimeEntityId = "entity_35df35d7-d869-4b88-b5db-93d27f42c720";

const workspaceRecords = defineAppSchemaModule({
  key: "workspace-runtime-records",
  runtimeRequirements: {
    shared: { recordAdapters: ["workspace.record"] },
    browser: { projections: ["workspace.browser"] },
    worker: { publicReads: ["workspace.worker"] },
  },
  entities: [
    {
      id: workspaceRuntimeEntityId,
      key: "workspace-record",
      label: "Workspace record",
      fields: [{ key: "label", label: "Label", required: true, type: "text" }],
    },
  ],
  queries: [
    {
      key: "workspaceRecordAll",
      label: "All workspace records",
      entity: "workspace-record",
      expression: { kind: "all" },
    },
  ],
  itemViews: [
    {
      key: "workspaceRecordItem",
      entity: "workspace-record",
      fields: [{ field: "label", editor: "text", commit: "field-commit" }],
    },
  ],
  views: [
    {
      key: "workspaceRecordHome",
      type: "collection",
      label: "Workspace records",
      entity: "workspace-record",
      queries: [{ query: "workspaceRecordAll" }],
      defaultQuery: "workspaceRecordAll",
      result: { type: "list", itemView: "workspaceRecordItem" },
    },
  ],
  screens: [
    {
      key: "workspaceRecordHome",
      type: "workspace",
      label: "Workspace records",
      path: "/workspace-records",
      access: { actor: "owner" },
      layout: {
        type: "stack",
        sections: [
          {
            id: "workspace-records",
            type: "collection",
            view: "workspaceRecordHome",
          },
        ],
      },
    },
  ],
});

export const workspaceProgramComposition = {
  version: 1,
  modules: [workspaceRecords],
  runtime: { owner: "runtime" },
} as const;
