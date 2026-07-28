import { defineAppSchemaModule } from "@dpeek/formless-schema";
import { tasksRecordSchemaModule } from "./schema-records.ts";

export const tasksPresentationSchemaModule = defineAppSchemaModule({
  key: "tasks-presentation",
  requires: [tasksRecordSchemaModule],
  itemViews: [
    {
      key: "taskListItem",
      entity: "task",
      fields: [
        {
          field: "title",
          editor: "text",
          commit: "field-commit",
        },
        {
          field: "dueDate",
          editor: "date",
          commit: "field-commit",
          presentation: {
            visibility: "valueOrInteraction",
          },
        },
        {
          field: "priority",
          editor: "enum",
          commit: "immediate",
          presentation: {
            list: "both",
            mode: "iconOnly",
            trigger: "icon",
          },
        },
        {
          field: "done",
          editor: "boolean",
          commit: "immediate",
          presentation: {
            mode: "completion",
          },
        },
      ],
    },
  ],
  views: [
    {
      key: "taskHome",
      type: "collection",
      label: "Tasks",
      entity: "task",
      queries: [
        {
          query: "taskAll",
          count: {
            type: "count",
          },
        },
        {
          query: "taskActive",
          count: {
            type: "count",
          },
        },
        {
          query: "taskCompleted",
          count: {
            type: "count",
          },
        },
        {
          query: "taskOverdue",
          count: {
            type: "count",
          },
        },
      ],
      defaultQuery: "taskAll",
      result: {
        type: "list",
        itemView: "taskListItem",
      },
      operations: [
        {
          operation: "task.create",
          createView: "taskCreate",
        },
        {
          operation: "task.clearCompletedTasks",
          count: {
            type: "count",
          },
        },
      ],
    },
    {
      key: "taskCreate",
      type: "create",
      entity: "task",
      fields: [
        {
          field: "title",
          editor: "text",
        },
        {
          field: "dueDate",
          editor: "date",
        },
        {
          field: "priority",
          editor: "enum",
        },
      ],
    },
  ],
  screens: [
    {
      key: "taskHome",
      type: "workspace",
      label: "Tasks",
      path: "/",
      layout: {
        type: "stack",
        sections: [
          {
            id: "tasks",
            type: "collection",
            view: "taskHome",
          },
        ],
      },
    },
  ],
});
