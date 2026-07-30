import { describe, expect, it } from "vite-plus/test";

import { channelName } from "./broadcast.ts";
import { programClientTarget } from "./app-target.ts";
import { installedAppStorageIdentity } from "../shared/app-storage-identity.ts";

describe("client broadcast channels", () => {
  it("can scope channel names by installed app identity", () => {
    expect(channelName(installedSiteIdentity("personal"))).toBe("formless:app:personal");
    expect(channelName(installedSiteIdentity("docs"))).toBe("formless:app:docs");
  });

  it("can scope channel names by instance control-plane identity", () => {
    expect(channelName(programClientTarget())).toBe("formless:instance:control-plane");
  });
});

function installedSiteIdentity(installId: string) {
  const identity = installedAppStorageIdentity({ installId, packageAppKey: "site" });

  if (!identity) {
    throw new Error(`Expected installed Site identity for ${installId}.`);
  }

  return identity;
}
