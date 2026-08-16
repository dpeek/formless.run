import path from "node:path";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { RECOVERY_GOLDEN_V1_HEX } from "./recovery-fixtures.ts";
import { persistRecoverySnapshot } from "./recovery-node.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("recovery snapshot Node persistence", () => {
  it("validates while staging and atomically publishes an owner-only file", async () => {
    const directory = await makeTemporaryDirectory();
    const outputPath = path.join(directory, "target.recovery");
    const bytes = fromHex(RECOVERY_GOLDEN_V1_HEX);
    await writeFile(outputPath, "prior complete snapshot");

    const result = await persistRecoverySnapshot({
      outputPath,
      source: fixedSizeChunks(bytes, 7),
    });

    expect(new Uint8Array(await readFile(outputPath))).toEqual(bytes);
    expect(result).toMatchObject({
      byteLength: bytes.byteLength,
      header: { captureId: "capture-0001", nativePayloadVersion: 47 },
      outputPath,
      receipt: { payloads: [{ id: "program:active" }, { id: "media:image:logo" }] },
    });
    if (process.platform !== "win32") {
      expect((await stat(outputPath)).mode & 0o777).toBe(0o600);
    }
    expect(await readdir(directory)).toEqual(["target.recovery"]);
  });

  it("preserves an existing output and removes staging after validation failure", async () => {
    const directory = await makeTemporaryDirectory();
    const outputPath = path.join(directory, "target.recovery");
    const prior = "prior complete snapshot";
    const bytes = fromHex(RECOVERY_GOLDEN_V1_HEX);
    await writeFile(outputPath, prior);

    await expect(
      persistRecoverySnapshot({
        outputPath,
        source: [bytes.subarray(0, bytes.byteLength - 1)],
      }),
    ).rejects.toThrow(/truncated/);

    expect(await readFile(outputPath, "utf8")).toBe(prior);
    expect(await readdir(directory)).toEqual(["target.recovery"]);
  });

  it("preserves output and removes staging after interrupted transport or publication failure", async () => {
    const directory = await makeTemporaryDirectory();
    const outputPath = path.join(directory, "target.recovery");
    const bytes = fromHex(RECOVERY_GOLDEN_V1_HEX);
    await writeFile(outputPath, "prior complete snapshot");

    await expect(
      persistRecoverySnapshot({ outputPath, source: interruptedSource(bytes) }),
    ).rejects.toThrow("transport interrupted");
    expect(await readFile(outputPath, "utf8")).toBe("prior complete snapshot");
    expect(await readdir(directory)).toEqual(["target.recovery"]);

    const directoryOutput = path.join(directory, "directory-output");
    await mkdir(directoryOutput);
    await expect(
      persistRecoverySnapshot({ outputPath: directoryOutput, source: [bytes] }),
    ).rejects.toThrow();
    expect((await stat(directoryOutput)).isDirectory()).toBe(true);
    expect((await readdir(directory)).sort()).toEqual(["directory-output", "target.recovery"]);
  });
});

async function makeTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "formless-recovery-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function* fixedSizeChunks(bytes: Uint8Array, size: number): AsyncGenerator<Uint8Array> {
  for (let offset = 0; offset < bytes.byteLength; offset += size) {
    yield bytes.subarray(offset, Math.min(offset + size, bytes.byteLength));
  }
}

async function* interruptedSource(bytes: Uint8Array): AsyncGenerator<Uint8Array> {
  yield bytes.subarray(0, Math.floor(bytes.byteLength / 2));
  throw new Error("transport interrupted");
}

function fromHex(value: string): Uint8Array {
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
}
