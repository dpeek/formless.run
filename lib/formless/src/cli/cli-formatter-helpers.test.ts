import path from "node:path";

import { tasksSchemaSource } from "@dpeek/formless-tasks-app/schema";
import { parseAppSchema } from "@dpeek/formless-schema";
import { describe, expect, it } from "vite-plus/test";

import {
  formatCliDisplayFields,
  formatCliDisplayValue,
  formatCliOutputLines,
  formatCliRelativePath,
  formatCliSelectedTarget,
  formatCliStoredRecords,
} from "./cli-formatter-helpers.ts";

describe("CLI formatter helpers", () => {
  it("renders relative paths inside the current workspace", () => {
    const cwd = path.resolve(path.sep, "repo", "workspace");

    expect(formatCliRelativePath(cwd, cwd)).toBe(".");
    expect(formatCliRelativePath(cwd, path.join(cwd, "formless.ts"))).toBe("formless.ts");
    expect(formatCliRelativePath(cwd, path.join(cwd, "schema", "apps"))).toBe(
      path.join("schema", "apps"),
    );
  });

  it("keeps paths outside the current workspace absolute", () => {
    const cwd = path.resolve(path.sep, "repo", "workspace");
    const outsidePath = path.resolve(path.sep, "repo", "secrets.env");

    expect(formatCliRelativePath(cwd, outsidePath)).toBe(outsidePath);
  });

  it("renders selected targets and missing targets", () => {
    expect(
      formatCliSelectedTarget({
        alias: "production",
        url: "https://example.com",
      }),
    ).toBe("production (https://example.com)");
    expect(formatCliSelectedTarget(undefined)).toBe("<none>");
  });

  it("renders stored records in schema declaration and record-id order", () => {
    const formatted = formatCliStoredRecords(parseAppSchema(tasksSchemaSource), [
      {
        id: "task-z",
        entity: "task",
        values: { priority: "high", done: false, title: "Zeta" },
        createdAt: "2026-06-18T00:00:01.000Z",
        updatedAt: "2026-06-18T00:00:01.000Z",
      },
      {
        id: "task-a",
        entity: "task",
        values: { done: true, title: "Alpha" },
        createdAt: "2026-06-18T00:00:02.000Z",
        updatedAt: "2026-06-18T00:00:02.000Z",
      },
    ]);
    const records = JSON.parse(formatted) as { id: string; values: Record<string, unknown> }[];

    expect(records.map((record) => record.id)).toEqual(["task-a", "task-z"]);
    expect(Object.keys(records[1]!.values)).toEqual(["title", "done", "priority"]);
    expect(formatted.endsWith("\n")).toBe(true);
  });

  it("omits optional output lines", () => {
    expect(formatCliOutputLines(["one", null, undefined, false, "two"])).toBe("one\ntwo");
  });

  it("renders display-safe scalar, list, and object values", () => {
    expect(formatCliDisplayValue(null)).toBe("none");
    expect(formatCliDisplayValue(true)).toBe("true");
    expect(formatCliDisplayValue(3)).toBe("3");
    expect(formatCliDisplayValue("instance.primary")).toBe("instance.primary");
    expect(formatCliDisplayValue([])).toBe("none");
    expect(formatCliDisplayValue(["worker", null, "route"])).toBe("worker, none, route");
    expect(formatCliDisplayValue({ changedAreas: ["apps", "media"], status: "changes" })).toBe(
      '{"changedAreas":["apps","media"],"status":"changes"}',
    );
  });

  it("renders sorted display-safe field lines", () => {
    expect(
      formatCliDisplayFields({
        target: "instance.primary",
        mode: "dry-run",
        noop: false,
      }),
    ).toEqual(["mode: dry-run.", "noop: false.", "target: instance.primary."]);
  });
});
