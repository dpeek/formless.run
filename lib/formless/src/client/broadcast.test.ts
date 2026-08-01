import { describe, expect, it } from "vite-plus/test";

import { channelName } from "./broadcast.ts";
import { programClientTarget } from "./app-target.ts";

describe("client broadcast channels", () => {
  it("uses the single Program channel", () => {
    expect(channelName(programClientTarget())).toBe("formless:instance:control-plane");
  });
});
