import { describe, expect, it } from "vite-plus/test";
import {
  isSyncSocketAttachment,
  isSyncSocketClientMessage,
  isSyncSocketServerMessage,
  parseCreateAppInstallRequest,
  parseOwnerSetupToken,
  type ChangeRow,
  type SyncResponse,
} from "./protocol.ts";
import type { StoredRecord } from "@dpeek/formless-storage";
import { taskSourceSchema as appSchema } from "../test/schema-apps.ts";

describe("push sync protocol", () => {
  it("validates client socket messages", () => {
    expect(
      isSyncSocketClientMessage({
        type: "hello",
        cursor: 1,
        schemaUpdatedAt: null,
      }),
    ).toBe(true);
    expect(
      isSyncSocketClientMessage({
        type: "sync-requested",
        cursor: 2,
        schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      }),
    ).toBe(true);

    expect(
      isSyncSocketClientMessage({
        type: "hello",
        cursor: -1,
        schemaUpdatedAt: null,
      }),
    ).toBe(false);
    expect(
      isSyncSocketClientMessage({
        type: "schema-updated",
        cursor: 1,
        schemaUpdatedAt: null,
      }),
    ).toBe(false);
  });

  it("validates server socket messages", () => {
    expect(
      isSyncSocketServerMessage({
        type: "sync",
        payload: {
          changes: [change(1, record("record-1"))],
          cursor: 1,
          schema: appSchema,
          schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
        } satisfies SyncResponse,
      }),
    ).toBe(true);
    expect(
      isSyncSocketServerMessage({
        type: "sync",
        payload: {
          changes: [
            change(2, { ...record("record-2"), deletedAt: "2026-04-28T00:00:02.000Z" }, "delete"),
          ],
          cursor: 2,
        } satisfies SyncResponse,
      }),
    ).toBe(true);
    expect(
      isSyncSocketServerMessage({
        type: "error",
        message: "Malformed sync message.",
      }),
    ).toBe(true);

    expect(
      isSyncSocketServerMessage({
        type: "sync",
        payload: {
          changes: [],
          cursor: Number.NaN,
        },
      }),
    ).toBe(false);
    expect(
      isSyncSocketServerMessage({
        type: "error",
        message: 400,
      }),
    ).toBe(false);
  });

  it("validates hibernation socket attachments", () => {
    expect(
      isSyncSocketAttachment({
        cursor: 1,
        schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
      }),
    ).toBe(true);
    expect(
      isSyncSocketAttachment({
        cursor: 0,
        schemaUpdatedAt: null,
      }),
    ).toBe(true);

    expect(
      isSyncSocketAttachment({
        cursor: 1.5,
        schemaUpdatedAt: null,
      }),
    ).toBe(false);
    expect(
      isSyncSocketAttachment({
        cursor: 1,
        schemaUpdatedAt: 123,
      }),
    ).toBe(false);
  });
});

describe("owner setup protocol", () => {
  it("parses URL-safe setup tokens", () => {
    const token = "abcDEF0123456789_-abcDEF0123456789_-";

    expect(parseOwnerSetupToken(` ${token} `)).toBe(token);
  });

  it("rejects missing, short, oversized, and unsafe setup tokens", () => {
    expect(() => parseOwnerSetupToken(undefined)).toThrow("Owner setup token must be a string.");
    expect(() => parseOwnerSetupToken("short-token")).toThrow(
      "Owner setup token must be at least 32 characters.",
    );
    expect(() => parseOwnerSetupToken("a".repeat(513))).toThrow(
      "Owner setup token must be at most 512 characters.",
    );
    expect(() => parseOwnerSetupToken("abcDEF0123456789_-abcDEF0123456789_~")).toThrow(
      "Owner setup token must be URL-safe.",
    );
  });
});

describe("app install protocol", () => {
  it("parses create app install requests", () => {
    expect(
      parseCreateAppInstallRequest({
        packageAppKey: " site ",
        installId: " personal ",
        label: " Personal Site ",
      }),
    ).toEqual({
      packageAppKey: "site",
      installId: "personal",
      label: "Personal Site",
    });
  });

  it("rejects unsupported create install request shapes", () => {
    expect(() => parseCreateAppInstallRequest({ installId: "personal", label: "Site" })).toThrow(
      'App install request must include "packageAppKey".',
    );
    expect(() =>
      parseCreateAppInstallRequest({
        packageAppKey: "site",
        installId: "personal",
        label: "Site",
        route: "/apps/personal",
      }),
    ).toThrow('App install request has unsupported key "route".');
    expect(() =>
      parseCreateAppInstallRequest({
        packageAppKey: "site",
        installId: "personal",
        label: "Site",
        registrationOperation: "profile.register",
      }),
    ).toThrow('App install request has unsupported key "registrationOperation".');
    expect(() =>
      parseCreateAppInstallRequest({
        packageAppKey: "site",
        installId: "personal",
        label: "Site",
        registrationPolicy: "domain-allowlist",
      }),
    ).toThrow('App install request has unsupported key "registrationPolicy".');
  });
});

function record(id: string): StoredRecord {
  return {
    id,
    entity: "task",
    values: { title: "First", done: false },
    createdAt: "2026-04-28T00:00:01.000Z",
    updatedAt: "2026-04-28T00:00:01.000Z",
  };
}

function change(
  seq: number,
  payload: StoredRecord,
  operationKind: ChangeRow["operationKind"] = "create",
): ChangeRow {
  return {
    seq,
    writeId: `write-${seq}`,
    operationKind,
    entity: payload.entity,
    recordId: payload.id,
    payload,
    createdAt: `2026-04-28T00:00:0${seq}.000Z`,
  };
}
