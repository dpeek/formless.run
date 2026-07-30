import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_INSTANCE_WORKSPACE_LOCAL_STATE_ROOT,
  DEFAULT_INSTANCE_WORKSPACE_MEDIA_ROOT,
  DEFAULT_INSTANCE_WORKSPACE_SECRET_STATE_ROOT,
  DEFAULT_INSTANCE_WORKSPACE_STATE_ROOT,
  FORMLESS_CONFIG_FILE,
  FORMLESS_CONFIG_KIND,
  FORMLESS_CONFIG_VERSION,
  defineConfig,
  resolveFormlessConfig,
} from "./index.ts";

describe("Formless configuration", () => {
  it("resolves every omitted authoring value from deterministic defaults", () => {
    const config = defineConfig({ name: "personal-sites" });

    expect(FORMLESS_CONFIG_FILE).toBe("formless.ts");
    expect(config).toEqual({ name: "personal-sites" });
    expect(resolveFormlessConfig(config)).toEqual({
      version: FORMLESS_CONFIG_VERSION,
      kind: FORMLESS_CONFIG_KIND,
      name: "personal-sites",
      state: {
        root: DEFAULT_INSTANCE_WORKSPACE_STATE_ROOT,
      },
      media: {
        root: DEFAULT_INSTANCE_WORKSPACE_MEDIA_ROOT,
      },
      local: {
        stateRoot: DEFAULT_INSTANCE_WORKSPACE_LOCAL_STATE_ROOT,
        secretStateRoot: DEFAULT_INSTANCE_WORKSPACE_SECRET_STATE_ROOT,
      },
      packages: {
        links: [],
      },
      runtime: {
        extensions: {},
      },
    });
  });

  it("resolves field-by-field overrides without replacing adjacent defaults", () => {
    const config = defineConfig({
      name: "private-sites",
      state: {
        root: "records",
      },
      media: {
        root: "assets/media",
      },
      local: {
        stateRoot: ".cache/formless",
      },
      packages: {
        links: [
          { manifest: "../private-site/formless.app.json" },
          { manifest: "packages/crm/formless.app.json" },
        ],
      },
      runtime: {
        extensions: {
          "site.publicRenderer": {
            browser: "renderers/site.browser.tsx",
            worker: "renderers/site.worker.tsx",
          },
        },
      },
    });

    expect(resolveFormlessConfig(config)).toEqual({
      version: FORMLESS_CONFIG_VERSION,
      kind: FORMLESS_CONFIG_KIND,
      name: "private-sites",
      state: {
        root: "records",
      },
      media: {
        root: "assets/media",
      },
      local: {
        stateRoot: ".cache/formless",
        secretStateRoot: DEFAULT_INSTANCE_WORKSPACE_SECRET_STATE_ROOT,
      },
      packages: {
        links: [
          { manifest: "../private-site/formless.app.json" },
          { manifest: "packages/crm/formless.app.json" },
        ],
      },
      runtime: {
        extensions: {
          "site.publicRenderer": {
            browser: "renderers/site.browser.tsx",
            worker: "renderers/site.worker.tsx",
          },
        },
      },
    });
  });

  it("rejects unsafe operational paths and duplicate package links during resolution", () => {
    expect(() =>
      resolveFormlessConfig({
        name: "private-sites",
        state: { root: "../records" },
      }),
    ).toThrow("formless.ts state.root must be a relative workspace path.");

    expect(() =>
      resolveFormlessConfig({
        name: "private-sites",
        packages: {
          links: [{ manifest: "https://example.com/formless.app.json" }],
        },
      }),
    ).toThrow(
      "formless.ts packages.links[0].manifest must be a local relative formless.app.json path.",
    );

    expect(() =>
      resolveFormlessConfig({
        name: "private-sites",
        packages: {
          links: [
            { manifest: "../private-site/formless.app.json" },
            { manifest: " ../private-site/formless.app.json " },
          ],
        },
      }),
    ).toThrow(
      'formless.ts packages.links has duplicate manifest "../private-site/formless.app.json".',
    );

    expect(() =>
      resolveFormlessConfig({
        name: "private-sites",
        runtime: {
          extensions: {
            "site.publicRenderer": {
              browser: "/renderers/site.browser.tsx",
              worker: "renderers/site.worker.tsx",
            },
          },
        },
      }),
    ).toThrow(
      'formless.ts runtime.extensions["site.publicRenderer"].browser must be a local workspace-relative path.',
    );
  });
});
