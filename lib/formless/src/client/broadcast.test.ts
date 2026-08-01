import { describe, expect, it } from "vite-plus/test";

import { channelName } from "./broadcast.ts";

describe("client broadcast channels", () => {
  it("uses the single Program channel", () => {
    expect(channelName()).toBe("formless:instance:control-plane");
  });
});
