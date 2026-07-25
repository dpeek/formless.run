import { defineAppSchema } from "@dpeek/formless-schema";

export const tasksSchemaSource = defineAppSchema({
  version: 1,
  entities: {
    task: {
      label: "Task",
      fields: {
        title: {
          type: "text",
          required: true,
          label: "Title",
        },
        done: {
          type: "boolean",
          required: true,
          label: "Done",
          default: false,
        },
        dueDate: {
          type: "date",
          required: false,
          label: "Due date",
        },
        priority: {
          type: "enum",
          required: true,
          label: "Priority",
          default: "normal",
          values: {
            low: {
              label: "Low",
              presentation: {
                icon: "priority-marker",
                color: "priority.low",
              },
            },
            normal: {
              label: "Normal",
              presentation: {
                icon: "priority-marker",
                color: "priority.normal",
              },
            },
            high: {
              label: "High",
              presentation: {
                icon: "priority-marker",
                color: "priority.high",
              },
            },
          },
        },
      },
      operations: {
        create: {
          label: "Create Task",
          kind: "create",
          scope: "collection",
          input: {
            fields: {
              title: {
                field: "title",
              },
              done: {
                field: "done",
              },
              dueDate: {
                field: "dueDate",
              },
              priority: {
                field: "priority",
              },
            },
          },
          effect: {
            type: "createRecord",
          },
          output: {
            type: "create",
          },
          idempotency: {
            required: true,
          },
          audit: {
            input: "summary",
          },
        },
        update: {
          label: "Update Task",
          kind: "update",
          scope: "record",
          input: {
            fields: {
              title: {
                field: "title",
              },
              done: {
                field: "done",
              },
              dueDate: {
                field: "dueDate",
              },
              priority: {
                field: "priority",
              },
            },
          },
          effect: {
            type: "patchRecord",
          },
          output: {
            type: "update",
          },
          idempotency: {
            required: true,
          },
          audit: {
            input: "summary",
          },
        },
        clearCompletedTasks: {
          label: "Clear completed",
          kind: "command",
          scope: "collection",
          target: {
            query: "taskCompleted",
          },
          effect: {
            type: "operationHandler",
            handler: "clear-completed",
            config: {
              query: "taskCompleted",
            },
          },
          output: {
            type: "command",
          },
          idempotency: {
            required: true,
          },
          audit: {
            input: "summary",
          },
        },
      },
    },
  },
  queries: {
    taskAll: {
      label: "All",
      entity: "task",
      expression: {
        kind: "all",
      },
    },
    taskActive: {
      label: "Active",
      entity: "task",
      expression: {
        kind: "where",
        ref: {
          kind: "value",
          name: "done",
        },
        op: "eq",
        value: false,
      },
    },
    taskCompleted: {
      label: "Completed",
      entity: "task",
      expression: {
        kind: "where",
        ref: {
          kind: "value",
          name: "done",
        },
        op: "eq",
        value: true,
      },
    },
    taskOverdue: {
      label: "Overdue",
      entity: "task",
      expression: {
        kind: "and",
        expressions: [
          {
            kind: "where",
            ref: {
              kind: "value",
              name: "done",
            },
            op: "eq",
            value: false,
          },
          {
            kind: "where",
            ref: {
              kind: "value",
              name: "dueDate",
            },
            op: "before",
            value: {
              kind: "today",
            },
          },
        ],
      },
    },
  },
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
  tableViews: {},
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
