import { describe, expect, it } from "vite-plus/test";
import {
  selectAuthorityOperation,
  type AuthorityOperationKind,
  type AuthorityOperationMode,
} from "./authority-operations.ts";
import { BadRequestError } from "./errors.ts";

describe("authority operation selection", () => {
  it("selects read operation metadata from HTTP route facts", () => {
    const cases = [
      ["GET", "/bootstrap", "bootstrap"],
      ["GET", "/schema", "readSchema"],
      ["GET", "/snapshot", "exportSnapshot"],
      ["GET", "/tree/blog%2Fshipping-schema-backed-authoring", "siteTree"],
      ["GET", "/sync", "sync"],
    ] satisfies Array<[string, string, AuthorityOperationKind]>;
    for (const [method, path, kind] of cases) {
      expect(selectOperation(method, path)).toMatchObject({
        kind,
        metadata: { kind, method, mode: "read" satisfies AuthorityOperationMode, path },
      });
    }
  });

  it("selects write operation metadata before request body parsing", () => {
    const cases = [
      ["POST", "/schema", "writeSchema"],
      ["POST", "/snapshot/restore", "restoreSnapshot"],
      ["POST", "/reset/schema", "resetSchema"],
    ] satisfies Array<[string, string, AuthorityOperationKind]>;
    for (const [method, path, kind] of cases) {
      expect(selectOperation(method, path)).toEqual({
        kind,
        metadata: { kind, method, mode: "write" satisfies AuthorityOperationMode, path },
      });
    }
  });

  it("selects entity operation routes with route facts", () => {
    expect(selectOperation("GET", "/operations/task/activeList")).toEqual({
      entityName: "task",
      kind: "entityOperation",
      metadata: {
        kind: "entityOperation",
        method: "GET",
        mode: "read",
        path: "/operations/task/activeList",
      },
      operationName: "activeList",
    });
    expect(selectOperation("POST", "/operations/task/create")).toEqual({
      entityName: "task",
      kind: "entityOperation",
      metadata: {
        kind: "entityOperation",
        method: "POST",
        mode: "write",
        path: "/operations/task/create",
      },
      operationName: "create",
    });
    expect(
      selectOperation("GET", "/operations/task/read", new URLSearchParams("recordId=record_1")),
    ).toEqual({
      entityName: "task",
      kind: "entityOperation",
      metadata: {
        kind: "entityOperation",
        method: "GET",
        mode: "read",
        path: "/operations/task/read",
      },
      operationName: "read",
      recordId: "record_1",
    });
  });

  it("parses sync request facts during operation selection", () => {
    expect(
      selectOperation(
        "GET",
        "/sync",
        new URLSearchParams("after=12&schemaUpdatedAt=2026-05-12T01%3A02%3A03.000Z"),
      ),
    ).toEqual({
      after: 12,
      clientSchemaUpdatedAt: "2026-05-12T01:02:03.000Z",
      kind: "sync",
      metadata: { kind: "sync", method: "GET", mode: "read", path: "/sync" },
    });
  });

  it("rejects invalid sync cursors before operation execution", () => {
    expect(() => selectOperation("GET", "/sync", new URLSearchParams("after=bad"))).toThrow(
      BadRequestError,
    );
    expect(() => selectOperation("GET", "/sync", new URLSearchParams("after=-1"))).toThrow(
      BadRequestError,
    );
  });

  it("leaves WebSocket sync and unknown routes outside operation dispatch", () => {
    expect(selectOperation("GET", "/sync/ws")).toBeUndefined();
    expect(selectOperation("POST", "/sync/ws")).toBeUndefined();
    expect(selectOperation("GET", "/missing")).toBeUndefined();
  });
});

function selectOperation(method: string, path: string, searchParams = new URLSearchParams()) {
  return selectAuthorityOperation({ method, path, searchParams });
}
