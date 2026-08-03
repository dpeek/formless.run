import path from "node:path";

import type { AppSchema } from "@dpeek/formless-schema";
import { formatStoredRecordsForArtifact, type StoredRecord } from "@dpeek/formless-storage";

export type CliOutputLine = false | null | string | undefined;

export type CliDisplayValue =
  | boolean
  | null
  | number
  | string
  | CliDisplayValue[]
  | { [key: string]: CliDisplayValue };

export type CliDisplayObject = {
  [key: string]: CliDisplayValue;
};

export type CliSelectedTargetDisplay = {
  alias: string;
  url: string;
};

export function formatCliOutputLines(lines: readonly CliOutputLine[]): string {
  return lines.filter(isCliOutputLine).join("\n");
}

export function formatCliRelativePath(cwd: string, filePath: string): string {
  const relativePath = path.relative(cwd, filePath);

  if (relativePath === "") {
    return ".";
  }

  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    return filePath;
  }

  return relativePath;
}

export function formatCliSelectedTarget(target: CliSelectedTargetDisplay | undefined): string {
  return target ? `${target.alias} (${target.url})` : "<none>";
}

export function formatCliStoredRecords(
  schema: AppSchema,
  records: readonly StoredRecord[],
): string {
  return `${JSON.stringify(formatStoredRecordsForArtifact(schema, records), null, 2)}\n`;
}

export function formatCliDisplayFields(fields: CliDisplayObject): string[] {
  return Object.entries(fields)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}: ${formatCliDisplayValue(value)}.`);
}

export function formatCliDisplayValue(value: CliDisplayValue): string {
  if (value === null) {
    return "none";
  }

  if (Array.isArray(value)) {
    return value.length === 0
      ? "none"
      : value.map((entry) => formatCliDisplayValue(entry)).join(", ");
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function isCliOutputLine(line: CliOutputLine): line is string {
  return line !== false && line !== null && line !== undefined;
}
