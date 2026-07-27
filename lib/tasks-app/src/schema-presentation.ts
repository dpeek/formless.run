import { defineAppSchemaModule } from "@dpeek/formless-schema";
import { tasksRecordSchemaModule } from "./schema-records.ts";

export const tasksPresentationSchemaModule = defineAppSchemaModule({
  key: "tasks-presentation",
  requires: [tasksRecordSchemaModule],
  itemViews: {
    taskListItem: {
      entity: "task",
      fields: {
        title: {
          editor: "text",
          commit: "field-commit",
        },
        dueDate: {
          editor: "date",
          commit: "field-commit",
          presentation: {
            visibility: "valueOrInteraction",
          },
        },
        priority: {
          editor: "enum",
          commit: "immediate",
          presentation: {
            list: "both",
            mode: "iconOnly",
            trigger: "icon",
          },
        },
        done: {
          editor: "boolean",
          commit: "immediate",
          presentation: {
            mode: "completion",
          },
        },
      },
    },
  },
  views: {
    taskHome: {
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
    taskCreate: {
      type: "create",
      entity: "task",
      fields: {
        title: {
          editor: "text",
        },
        dueDate: {
          editor: "date",
        },
        priority: {
          editor: "enum",
        },
      },
    },
  },
  screens: {
    taskHome: {
      type: "workspace",
      label: "Tasks",
      path: "/",
      navigation: {
        primary: true,
      },
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
  },
});
