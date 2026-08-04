import type { StoredRecord } from "@dpeek/formless-storage";

export const taskStorageSnapshotRecords: StoredRecord[] = [
  testRecord({
    id: "rec_task_backlog",
    entity: "task",
    values: {
      title: "Capture research notes",
      done: false,
      priority: "normal",
    },
    createdAt: "2026-05-01T00:00:05.000Z",
  }),
  testRecord({
    id: "rec_task_completed",
    entity: "task",
    values: {
      title: "Send signed kickoff notes",
      done: true,
      dueDate: "2026-04-30",
      priority: "normal",
    },
    createdAt: "2026-05-01T00:00:04.000Z",
  }),
  testRecord({
    id: "rec_task_later",
    entity: "task",
    values: {
      title: "Schedule design review",
      done: false,
      dueDate: "2026-05-08",
      priority: "low",
    },
    createdAt: "2026-05-01T00:00:03.000Z",
  }),
  testRecord({
    id: "rec_task_overdue",
    entity: "task",
    values: {
      title: "Review overdue proposal",
      done: false,
      dueDate: "2026-05-01",
      priority: "high",
    },
    createdAt: "2026-05-01T00:00:01.000Z",
  }),
  testRecord({
    id: "rec_task_today",
    entity: "task",
    values: {
      title: "Plan today's delivery",
      done: false,
      dueDate: "2026-05-02",
      priority: "normal",
    },
    createdAt: "2026-05-01T00:00:02.000Z",
  }),
];

export const taskTestRecords = [...taskStorageSnapshotRecords].sort(compareRecordsByCreatedAt);

function testRecord(record: Omit<StoredRecord, "updatedAt">): StoredRecord {
  return {
    ...record,
    updatedAt: record.createdAt,
  };
}

function compareRecordsByCreatedAt(left: StoredRecord, right: StoredRecord): number {
  const createdAtOrder =
    left.createdAt < right.createdAt ? -1 : left.createdAt > right.createdAt ? 1 : 0;

  return createdAtOrder !== 0
    ? createdAtOrder
    : left.id < right.id
      ? -1
      : left.id > right.id
        ? 1
        : 0;
}
