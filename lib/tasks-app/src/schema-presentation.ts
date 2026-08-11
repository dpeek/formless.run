import { defineAppSchemaModule } from "@dpeek/formless-schema";

export const tasksPresentationSchemaModule = defineAppSchemaModule({
  key: "tasks-presentation",
  requires: ["tasks-records"],
  itemViews: [
    {
      key: "taskListItem",
      entity: "task",
      fields: [
        {
          field: "title",
          editor: "text",
        },
        {
          field: "dueDate",
          editor: "date",
          presentation: {
            visibility: "valueOrInteraction",
          },
        },
        {
          field: "priority",
          editor: "enum",
          presentation: {
            list: "both",
            mode: "iconOnly",
            trigger: "icon",
          },
        },
        {
          field: "done",
          editor: "boolean",
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
