// @vitest-environment jsdom

import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { applyBootstrapResponse, resetClientStore } from "../../client/store.ts";
import { selectScreenModels } from "../../client/views.ts";
import { bootstrapResponse } from "../../test/protocol-builders.ts";
import { siteSourceSchema } from "../../test/schema-apps.ts";
import { testSiteRecords } from "../../test/site-records.ts";
import {
  useGeneratedWorkspaceRuntimeController,
  type GeneratedWorkspaceRuntimeController,
} from "./generated-workspace-runtime.tsx";

beforeEach(() => resetClientStore());

describe("generated workspace record-reference runtime", () => {
  it("keeps Site starter root references out of the Settings record form", async () => {
    applyBootstrapResponse(bootstrapResponse(siteSourceSchema, testSiteRecords));
    const screen = required(
      selectScreenModels(siteSourceSchema).find(
        (candidate) => candidate.screenName === "siteSettings",
      ),
    );
    let controller: GeneratedWorkspaceRuntimeController | undefined;

    function RuntimeProbe() {
      controller = useGeneratedWorkspaceRuntimeController({
        getSectionSelection: () => ({}),
        onSelectContext: () => undefined,
        onSelectQuery: () => undefined,
        screen,
        today: "2026-08-07",
      });
      return null;
    }

    await act(async () => {
      render(<RuntimeProbe />);
    });

    const result = required(controller).workspace?.sections[0]?.collection.presentation.result;
    if (!result || result.kind !== "recordResult") {
      throw new Error("Expected Site settings to project a record result.");
    }

    expect(result.fields.map((field) => field.fieldName)).not.toEqual(
      expect.arrayContaining(["home", "header", "footer"]),
    );
  });
});

function required<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error("Expected a value.");
  return value;
}
