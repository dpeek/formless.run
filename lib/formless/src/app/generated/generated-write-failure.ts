export type GeneratedRecordWriteFailure = { code: "update-failed" };

export function generatedRecordWriteFailure(_error: unknown): GeneratedRecordWriteFailure {
  return { code: "update-failed" };
}

export function generatedRecordWriteFailureMessage(failure: GeneratedRecordWriteFailure): string {
  switch (failure.code) {
    case "update-failed":
      return "Update failed. Try again.";
  }
}
