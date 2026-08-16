/**
 * Local Node recovery snapshot persistence adapter.
 */
import { randomUUID } from "node:crypto";
import { mkdir, open, rename, rm } from "node:fs/promises";
import path from "node:path";

import {
  decodeRecoverySnapshot,
  type RecoveryByteSource,
  type RecoverySnapshotValidation,
} from "./recovery.ts";

export * from "./recovery.ts";

export type PersistRecoverySnapshotResult = RecoverySnapshotValidation & {
  byteLength: number;
  outputPath: string;
};

export async function persistRecoverySnapshot(input: {
  outputPath: string;
  source: RecoveryByteSource;
}): Promise<PersistRecoverySnapshotResult> {
  const outputPath = path.resolve(input.outputPath);
  const outputDirectory = path.dirname(outputPath);
  const temporaryPath = path.join(
    outputDirectory,
    `.${path.basename(outputPath)}.${randomUUID()}.recovery-tmp`,
  );

  await mkdir(outputDirectory, { recursive: true });

  let handle: Awaited<ReturnType<typeof open>> | undefined;
  let byteLength = 0;
  let published = false;
  try {
    handle = await open(temporaryPath, "wx", 0o600);
    const temporaryHandle = handle;
    const validation = await decodeRecoverySnapshot(
      writeThroughRecoverySource(input.source, async (chunk) => {
        await writeAll(temporaryHandle, chunk);
        byteLength += chunk.byteLength;
      }),
    );

    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, outputPath);
    published = true;

    return { ...validation, byteLength, outputPath };
  } finally {
    await handle?.close().catch(() => undefined);
    if (!published) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }
}

async function* writeThroughRecoverySource(
  source: RecoveryByteSource,
  write: (chunk: Uint8Array) => Promise<void>,
): AsyncGenerator<Uint8Array> {
  if (isReadableStream(source)) {
    const reader = source.getReader();
    let completed = false;
    try {
      while (true) {
        const result = await reader.read();
        if (result.done) {
          completed = true;
          return;
        }
        await write(result.value);
        yield result.value;
      }
    } finally {
      if (!completed) {
        await reader.cancel().catch(() => undefined);
      }
      reader.releaseLock();
    }
  }

  if (Symbol.asyncIterator in source) {
    for await (const chunk of source) {
      await write(chunk);
      yield chunk;
    }
    return;
  }

  for (const chunk of source) {
    await write(chunk);
    yield chunk;
  }
}

function isReadableStream(source: RecoveryByteSource): source is ReadableStream<Uint8Array> {
  return typeof (source as ReadableStream<Uint8Array>).getReader === "function";
}

async function writeAll(
  handle: Awaited<ReturnType<typeof open>>,
  bytes: Uint8Array,
): Promise<void> {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const result = await handle.write(bytes, offset, bytes.byteLength - offset);
    if (result.bytesWritten === 0) {
      throw new Error("Recovery temporary file write made no progress.");
    }
    offset += result.bytesWritten;
  }
}
