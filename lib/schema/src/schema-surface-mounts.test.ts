import { describe, expect, it } from "vite-plus/test";

import { parseAppSchema, stringifySchema, type AppSchemaSource } from "./index.ts";
import { taskSchema, taskScreen } from "./schema-test-fixtures.ts";

const browserMount = {
  key: "site.preview.browser",
  target: "browser",
  path: "/site/preview",
  access: { actor: "authenticated" },
} as const satisfies NonNullable<AppSchemaSource["surfaceMounts"]>[number];

describe("App schema surface mounts", () => {
  it("parses ordered portable browser and Worker declarations", () => {
    const surfaceMounts = [
      browserMount,
      {
        key: "site.preview.worker",
        target: "worker",
        path: "/site/public",
        access: { actor: "owner" },
      },
    ] as const;
    const source = taskSchema({ surfaceMounts });
    const schema = parseAppSchema(source);

    expect(schema.surfaceMounts).toEqual(surfaceMounts);
    expect(JSON.parse(stringifySchema(schema)).surfaceMounts).toEqual(surfaceMounts);
    expect(parseAppSchema(taskSchema()).surfaceMounts).toEqual([]);
  });

  it("parses browser-applicable access against the root role catalog", () => {
    const schema = parseAppSchema(
      taskSchema({
        authorization: {
          roles: [
            {
              key: "member",
              id: "role_350205b8-5c45-4985-9caa-79e51fb8a5a4",
              label: "Member",
            },
          ],
        },
        surfaceMounts: [{ ...browserMount, access: { role: "member" } }],
      }),
    );

    expect(schema.surfaceMounts?.[0]?.access).toEqual({ role: "member" });
    expect(() =>
      parseAppSchema(
        taskSchema({
          surfaceMounts: [{ ...browserMount, access: { actor: "runner" } }],
        }),
      ),
    ).toThrow(
      'Surface mount "site.preview.browser" access actor "runner" is not available to browser presentation.',
    );
  });

  it("rejects invalid target, path, access, and executable fields", () => {
    const invalidCases = [
      {
        mount: { ...browserMount, target: "shared" },
        message: 'Surface mount "site.preview.browser" target must be "browser" or "worker".',
      },
      ...["/", "", "site/preview", "/site/preview/", "/site/:preview", "/site/*"].map((path) => ({
        mount: { ...browserMount, path },
        message:
          'Surface mount "site.preview.browser" path must be a non-root static absolute path.',
      })),
      {
        mount: { ...browserMount, access: undefined },
        message: 'Surface mount "site.preview.browser" access must be an object.',
      },
      {
        mount: { ...browserMount, component: "SitePreview" },
        message: 'Surface mount "site.preview.browser" has unsupported key "component".',
      },
    ];

    for (const { mount, message } of invalidCases) {
      expect(() => parseAppSchema(taskSchema({ surfaceMounts: [mount] }))).toThrow(message);
    }
  });

  it("rejects duplicate and overlapping mount subtrees at segment boundaries", () => {
    expect(() =>
      parseAppSchema(taskSchema({ surfaceMounts: [browserMount, browserMount] })),
    ).toThrow('Schema surface mounts contains duplicate key "site.preview.browser".');
    expect(() =>
      parseAppSchema(
        taskSchema({
          surfaceMounts: [
            browserMount,
            {
              ...browserMount,
              key: "site.preview.worker",
              target: "worker",
              path: "/site/preview/posts",
            },
          ],
        }),
      ),
    ).toThrow('Surface mount paths "/site/preview" and "/site/preview/posts" must not overlap.');
    expect(() =>
      parseAppSchema(
        taskSchema({
          surfaceMounts: [
            browserMount,
            {
              ...browserMount,
              key: "site.preview.worker",
              target: "worker",
              path: "/site/preview-other",
            },
          ],
        }),
      ),
    ).not.toThrow();
  });

  it("rejects equal and descendant screens while permitting a screen ancestor", () => {
    for (const screenPath of ["/site/preview", "/site/preview/settings"]) {
      expect(() =>
        parseAppSchema(
          taskSchema({
            screens: [{ key: "home", ...taskScreen({ path: screenPath }) }],
            surfaceMounts: [browserMount],
          }),
        ),
      ).toThrow(
        `Surface mount "site.preview.browser" path "/site/preview" must not equal or contain screen "home" path "${screenPath}".`,
      );
    }

    expect(() =>
      parseAppSchema(
        taskSchema({
          screens: [{ key: "home", ...taskScreen({ path: "/site" }) }],
          surfaceMounts: [browserMount],
        }),
      ),
    ).not.toThrow();
  });
});
