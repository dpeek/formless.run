import { defineAppSchemaModule } from "@dpeek/formless-schema";
import { TASK_ENTITY_ID } from "./types.ts";

export const tasksRecordSchemaModule = defineAppSchemaModule({
  key: "tasks-records",
  entities: [
    {
      id: TASK_ENTITY_ID,
      key: "task",
      label: "Task",
      fields: [
        {
          key: "title",
          type: "text",
          required: true,
          label: "Title",
        },
        {
          key: "done",
          type: "boolean",
          required: true,
          label: "Done",
          default: false,
        },
        {
          key: "dueDate",
          type: "date",
          required: false,
          label: "Due date",
        },
        {
          key: "priority",
          type: "enum",
          required: true,
          label: "Priority",
          default: "normal",
          values: [
            {
              key: "low",
              label: "Low",
              presentation: {
                icon: "priority-marker",
                color: "priority.low",
              },
            },
            {
              key: "normal",
              label: "Normal",
              presentation: {
                icon: "priority-marker",
                color: "priority.normal",
              },
            },
            {
              key: "high",
              label: "High",
              presentation: {
                icon: "priority-marker",
                color: "priority.high",
              },
            },
          ],
        },
      ],
      operations: [
        {
          key: "create",
          label: "Create Task",
          kind: "create",
          scope: "collection",
          input: {
            fields: [
              {
                key: "title",
                field: "title",
              },
              {
                key: "done",
                field: "done",
              },
              {
                key: "dueDate",
                field: "dueDate",
              },
              {
                key: "priority",
                field: "priority",
              },
            ],
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
        {
          key: "update",
          label: "Update Task",
          kind: "update",
          scope: "record",
          input: {
            fields: [
              {
                key: "title",
                field: "title",
              },
              {
                key: "done",
                field: "done",
              },
              {
                key: "dueDate",
                field: "dueDate",
              },
              {
                key: "priority",
                field: "priority",
              },
            ],
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
        {
          key: "clearCompletedTasks",
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
      ],
    },
  ],
  queries: [
    {
      key: "taskAll",
      label: "All",
      entity: "task",
      expression: {
        kind: "all",
      },
    },
    {
      key: "taskActive",
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
    {
      key: "taskCompleted",
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
    {
      key: "taskOverdue",
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
  ],
});
