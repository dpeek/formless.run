import type { RecordValues } from "@dpeek/formless-storage";

export type RecordWriteKind = "create" | "patch" | "delete";

export type CreateRecordWriteRequest = {
  writeId: string;
  entity: string;
  id?: string;
  kind: "create";
  values: RecordValues;
};

export type PatchRecordWriteRequest = {
  writeId: string;
  entity: string;
  kind: "patch";
  recordId: string;
  values: Partial<RecordValues>;
};

export type DeleteRecordWriteRequest = {
  writeId: string;
  entity: string;
  kind: "delete";
  recordId: string;
};

export type RecordWriteRequest =
  | CreateRecordWriteRequest
  | PatchRecordWriteRequest
  | DeleteRecordWriteRequest;
