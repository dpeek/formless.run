import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import {
  FormlessApplicationRenderer,
  type FormlessApplicationPresentation,
} from "@dpeek/formless-renderer/application/assembly";
import { FormlessApplicationRendererProvider } from "@dpeek/formless-renderer/application/provider";
import { createMemoryPresentationHost } from "@dpeek/formless-presentation/host";
import { PresentationHostProvider } from "@dpeek/formless-presentation/host/react";
import { createFormlessApplicationShellFixtures } from "./components/application-shell.fixtures.ts";
import { projectFormlessApplicationShellFixturePublication } from "./components/application-shell.tsx";
import { createFormlessApplicationSystemStateFixtures } from "./components/application-system-state.fixtures.ts";
import { createFormlessAccessFixtures } from "./components/access.fixtures.ts";
import { projectFormlessAccessFixturePublication } from "./components/access.tsx";
import { createFormlessGeneratedWorkspaceFixtures } from "./components/generated-workspace.fixtures.ts";
import { projectGeneratedWorkspaceFixturePublication } from "./components/generated-workspace.tsx";
import { createFormlessInstanceManagementFixtures } from "./components/instance-management.fixtures.ts";
import { projectFormlessInstanceManagementFixturePublication } from "./components/instance-management.tsx";

describe("Formless application renderer", () => {
  it("exports an application-only root provider over the renderer-neutral theme contract", () => {
    const html = renderToStaticMarkup(
      <FormlessApplicationRendererProvider
        theme={{
          activeMode: "dark",
          id: "theme:application",
          kind: "documentTheme",
          policy: { kind: "fixed", mode: "dark" },
        }}
      >
        <main>Application</main>
      </FormlessApplicationRendererProvider>,
    );

    expect(html).toContain('data-theme="dark"');
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="Notifications"');
    expect(html).toContain("<main>Application</main>");
  });

  it("composes the renderer from stable root references and a separate React route child", () => {
    const systemState = requiredFixture(createFormlessApplicationSystemStateFixtures(), "missing");
    const shellFixture = requiredFixture(createFormlessApplicationShellFixtures(), "dev-workbench");
    if (!shellFixture.shell) {
      throw new Error("Missing dev-workbench shell fixture.");
    }
    const shellPublication = projectFormlessApplicationShellFixturePublication(
      shellFixture.shell,
      shellFixture.documentTheme,
    );
    if (!shellPublication.shellReference) {
      throw new Error("Missing dev-workbench shell reference.");
    }
    const nodes = [
      ...shellPublication.nodes,
      { reference: systemState.reference, snapshot: systemState.snapshot },
    ] as const;
    const host = createMemoryPresentationHost({ nodes, serverNodes: nodes });

    const shellHtml = renderToStaticMarkup(
      <PresentationHostProvider host={host}>
        <FormlessApplicationRenderer
          presentation={{
            children: <span data-route-child="selected">Route child</span>,
            kind: "shell",
            shellReference: shellPublication.shellReference,
          }}
        />
      </PresentationHostProvider>,
    );
    const stateHtml = renderToStaticMarkup(
      <PresentationHostProvider host={host}>
        <FormlessApplicationRenderer
          presentation={{
            kind: "applicationSystemState",
            systemStateReference: systemState.reference,
          }}
        />
      </PresentationHostProvider>,
    );

    expect(shellHtml).toContain('data-route-child="selected"');
    expect(shellHtml).toContain("Route child");
    expect(stateHtml).toContain(systemState.snapshot.heading);
    expect(stateHtml).toContain(systemState.reference.stateId);
    expect(stateHtml).toContain("max-width:760px");
  });

  it("frames top-level native and generated surfaces once at their selected widths", () => {
    const access = requiredFixture(createFormlessAccessFixtures(), "populated-owner");
    const management = requiredFixture(createFormlessInstanceManagementFixtures(), "installed");
    const workspace = requiredFixture(createFormlessGeneratedWorkspaceFixtures(), "multi-section");
    const accessPublication = projectFormlessAccessFixturePublication(access.state);
    const managementPublication = projectFormlessInstanceManagementFixturePublication(
      management.state,
    );
    const workspacePublication = projectGeneratedWorkspaceFixturePublication(workspace.workspace);
    const nodes = [
      ...accessPublication.nodes,
      ...managementPublication.nodes,
      ...workspacePublication.nodes,
    ];
    const host = createMemoryPresentationHost({ nodes, serverNodes: nodes });
    const renderPresentation = (presentation: FormlessApplicationPresentation) =>
      renderToStaticMarkup(
        <PresentationHostProvider host={host}>
          <FormlessApplicationRenderer presentation={presentation} />
        </PresentationHostProvider>,
      );

    const accessHtml = renderPresentation({
      accessReference: accessPublication.accessReference,
      kind: "access",
    });
    const managementHtml = renderPresentation({
      kind: "management",
      managementReference: managementPublication.managementReference,
    });
    const workspaceHtml = renderPresentation({
      kind: "workspace",
      reference: workspacePublication.workspaceReference,
    });

    expect(accessHtml.match(/max-width:1200px/g)).toHaveLength(1);
    expect(managementHtml.match(/max-width:1200px/g)).toHaveLength(1);
    expect(workspaceHtml.match(/max-width:1600px/g)).toHaveLength(1);
  });
});
function requiredFixture<
  Fixture extends {
    id: string;
  },
>(fixtures: readonly Fixture[], id: string) {
  const fixture = fixtures.find((candidate) => candidate.id === id);
  if (!fixture) {
    throw new Error(`Missing ${id} fixture.`);
  }
  return fixture;
}
