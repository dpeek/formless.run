import { describe, expect, it } from "vite-plus/test";

import { channelName } from "./broadcast.ts";
import { programClientTarget } from "./app-target.ts";
import { installedAppStorageIdentity } from "../shared/app-storage-identity.ts";

describe("client broadcast channels", () => {
  it("can scope channel names by installed app identity", () => {
    expect(channelName(installedCRMIdentity("personal"))).toBe("formless:app:personal");
    expect(channelName(installedCRMIdentity("docs"))).toBe("formless:app:docs");
  });

  it("can scope channel names by instance control-plane identity", () => {
    expect(channelName(programClientTarget())).toBe("formless:instance:control-plane");
  });
});

function installedCRMIdentity(installId: string) {
  const identity = installedAppStorageIdentity({ installId, packageAppKey: "crm" });

  if (!identity) {
    throw new Error(`Expected installed CRM identity for ${installId}.`);
  }

  return identity;
}
