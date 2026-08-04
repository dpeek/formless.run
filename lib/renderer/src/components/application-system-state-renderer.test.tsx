import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { createMemoryPresentationHost } from "@dpeek/formless-presentation/host";
import { PresentationHostProvider } from "@dpeek/formless-presentation/host/react";
import { createFormlessApplicationSystemStateFixtures } from "./application-system-state.fixtures.ts";
import { AstryxSubscribedApplicationSystemStateRenderer } from "./application-system-state-renderer.tsx";

describe("Astryx application system-state renderer", () => {
  it("renders every data-only memory-host fixture through the subscribed entrypoint", () => {
    const fixtures = createFormlessApplicationSystemStateFixtures();

    expect(fixtures.map(({ id }) => id)).toEqual([
      "loading",
      "empty",
      "missing",
      "unavailable",
      "blocked",
      "failure",
    ]);

    for (const fixture of fixtures) {
      const host = createMemoryPresentationHost({
        nodes: [{ reference: fixture.reference, snapshot: fixture.snapshot }],
      });
      const html = renderToStaticMarkup(
        <PresentationHostProvider host={host}>
          <AstryxSubscribedApplicationSystemStateRenderer
            systemStateReference={fixture.reference}
          />
        </PresentationHostProvider>,
      );

      expect(html).toContain(`data-formless-astryx-application-system-state-kind="${fixture.id}"`);
      expect(html).toContain(fixture.snapshot.heading);
      expect(html).toContain(fixture.snapshot.message);
      if (fixture.id === "loading") {
        expect(html).toContain('role="status"');
        expect(html).toContain('aria-busy="true"');
      }
      if (fixture.id === "failure") expect(html).toContain('role="alert"');
    }
  });

  it("renders fixed copy and intentional system-state display data unchanged", () => {
    const fixture = createFormlessApplicationSystemStateFixtures().find(
      ({ id }) => id === "failure",
    );
    if (!fixture) throw new Error("Missing failure fixture.");
    const snapshot = {
      ...fixture.snapshot,
      facts: [
        {
          id: "owner",
          kind: "applicationSystemStateFact" as const,
          label: "Account owner",
          value: "Ada Byron-Lovelace",
        },
        {
          id: "primary-email",
          kind: "applicationSystemStateFact" as const,
          label: "Primary email",
          value: "ada+platform@example.com",
        },
      ],
      message: "The application could not start. Try again.",
    };
    const host = createMemoryPresentationHost({
      nodes: [{ reference: fixture.reference, snapshot }],
    });
    const html = renderToStaticMarkup(
      <PresentationHostProvider host={host}>
        <AstryxSubscribedApplicationSystemStateRenderer systemStateReference={fixture.reference} />
      </PresentationHostProvider>,
    );

    expect(html).toContain("The application could not start. Try again.");
    expect(html).toContain("Account owner");
    expect(html).toContain("Ada Byron-Lovelace");
    expect(html).toContain("ada+platform@example.com");
  });
});
