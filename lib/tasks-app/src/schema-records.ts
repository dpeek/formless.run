import { defineAppSchemaModule } from "@dpeek/formless-schema";

export const tasksRecordSchemaModule = defineAppSchemaModule({
  key: "tasks-records",
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
});
