import { describe, expect, it } from "vite-plus/test";
import {
  isSyncSocketAttachment,
  isSyncSocketServerMessage,
  parseOwnerSetupToken,
} from "./protocol.ts";

describe("push sync protocol", () => {
  it("accepts only the exact content-free server notification", () => {
    expect(isSyncSocketServerMessage({ type: "changed" })).toBe(true);
    expect(isSyncSocketServerMessage({ type: "changed", cursor: 1 })).toBe(false);
    expect(isSyncSocketServerMessage({ type: "sync", payload: { changes: [], cursor: 0 } })).toBe(
      false,
    );
    expect(isSyncSocketServerMessage({ type: "error", message: "Sync failed." })).toBe(false);
  });

  it("validates hibernation socket attachments", () => {
    expect(isSyncSocketAttachment({ expiresAt: 1_777_777_777_777 })).toBe(true);
    expect(isSyncSocketAttachment({ expiresAt: 1.5 })).toBe(false);
    expect(isSyncSocketAttachment({ expiresAt: 0 })).toBe(false);
    expect(isSyncSocketAttachment({ expiresAt: 1_777_777_777_777, cursor: 1 })).toBe(false);
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
