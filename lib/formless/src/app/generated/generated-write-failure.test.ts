import { describe, expect, it } from "vite-plus/test";
import {
  generatedMediaUploadFailure,
  generatedMediaUploadFailureMessage,
} from "./media-field-runtime.ts";
import {
  generatedRecordWriteFailure,
  generatedRecordWriteFailureMessage,
} from "./generated-write-failure.ts";

describe("generated browser write failures", () => {
  it("reduces media and record exceptions to local codes and fixed copy", () => {
    const diagnostic = new Error("provider path diagnostic alchemy-secret-value");
    const media = generatedMediaUploadFailure(diagnostic);
    const record = generatedRecordWriteFailure(diagnostic);
    const published = {
      media,
      mediaMessage: generatedMediaUploadFailureMessage(media),
      record,
      recordMessage: generatedRecordWriteFailureMessage(record),
    };

    expect(published).toEqual({
      media: { code: "upload-failed" },
      mediaMessage: "Media upload failed. Try again.",
      record: { code: "update-failed" },
      recordMessage: "Update failed. Try again.",
    });
    expect(JSON.stringify(published)).not.toContain("alchemy-secret-value");
  });
});
