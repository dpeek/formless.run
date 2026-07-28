// @vitest-environment jsdom

import { act, fireEvent, render, within } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import type {
  DocumentThemeContract,
  DocumentThemeIntent,
  DocumentThemeMode,
} from "@dpeek/formless-presentation/contract";
import {
  createMemoryPresentationHost,
  documentThemeReference,
} from "@dpeek/formless-presentation/host";
import { PresentationHostProvider } from "@dpeek/formless-presentation/host/react";
import { AstryxDocumentThemeRenderer, AstryxSubscribedDocumentThemeRenderer } from "./theme.tsx";
(
  globalThis as {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;
const themeReference = documentThemeReference("theme:application");
describe("Astryx document theme renderer", () => {
  it.each(["light", "dark"] as const)(
    "leaves fixed %s provider ownership at the application root without synthesizing a selector",
    (mode) => {
      const { container, unmount } = render(
        <AstryxDocumentThemeRenderer onIntent={() => undefined} theme={fixedTheme(mode)}>
          <article>Workspace</article>
        </AstryxDocumentThemeRenderer>,
      );

      expect(container.querySelector('[role="radiogroup"]')).toBeNull();
      expect(container.textContent).toContain("Workspace");

      unmount();
    },
  );

  it("keeps user selection controlled and dispatches the selected projected intent", () => {
    const intents: DocumentThemeIntent[] = [];
    const { container, unmount } = render(
      <AstryxDocumentThemeRenderer
        onIntent={(intent) => {
          intents.push(intent);
        }}
        theme={userTheme("system", "dark")}
      >
        <article>Workspace</article>
      </AstryxDocumentThemeRenderer>,
    );

    expect(container.querySelector('[aria-label="Theme mode"][role="radiogroup"]')).not.toBeNull();
    expect(radioByLabel(container, "System").getAttribute("aria-checked")).toBe("true");
    expect(
      Array.from(container.querySelectorAll('[role="radio"]'), (node) => node.textContent),
    ).toEqual(["System", "Light", "Dark"]);

    fireEvent.click(radioByLabel(container, "Light"));

    expect(intents).toEqual([
      {
        controlId: "control:theme-mode",
        mode: "light",
        themeId: themeReference.themeId,
        type: "documentThemeModeSelection",
      },
    ]);
    expect(radioByLabel(container, "System").getAttribute("aria-checked")).toBe("true");

    unmount();
  });

  it("subscribes to theme snapshots and dispatches through the memory host", async () => {
    const intents: DocumentThemeIntent[] = [];
    const host = createMemoryPresentationHost({
      dispatch: (intent) => {
        if (intent.type === "documentThemeModeSelection") {
          intents.push(intent);
        }
      },
      nodes: [{ reference: themeReference, snapshot: userTheme("system", "dark") }],
    });
    const { container, unmount } = render(
      <PresentationHostProvider host={host}>
        <AstryxSubscribedDocumentThemeRenderer themeReference={themeReference}>
          <article>Subscribed workspace</article>
        </AstryxSubscribedDocumentThemeRenderer>
      </PresentationHostProvider>,
    );

    fireEvent.click(radioByLabel(container, "Light"));
    expect(intents).toEqual([
      {
        controlId: "control:theme-mode",
        mode: "light",
        themeId: themeReference.themeId,
        type: "documentThemeModeSelection",
      },
    ]);

    await act(async () => {
      host.publish([{ reference: themeReference, snapshot: fixedTheme("light") }]);
    });
    expect(container.querySelector('[role="radiogroup"]')).toBeNull();

    unmount();
  });
});

function fixedTheme(mode: "light" | "dark"): DocumentThemeContract {
  return {
    activeMode: mode,
    id: themeReference.themeId,
    kind: "documentTheme",
    policy: { kind: "fixed", mode },
  };
}

function userTheme(
  selectedMode: DocumentThemeMode,
  activeMode: "light" | "dark",
): DocumentThemeContract {
  const controlId = "control:theme-mode";
  const option = (mode: DocumentThemeMode, label: string) => ({
    label,
    mode,
    selectionIntent: {
      controlId,
      mode,
      themeId: themeReference.themeId,
      type: "documentThemeModeSelection" as const,
    },
  });

  return {
    activeMode,
    id: themeReference.themeId,
    kind: "documentTheme",
    policy: { kind: "userControlled" },
    selectionControl: {
      accessibilityLabel: "Theme mode",
      id: controlId,
      kind: "documentThemeSelectionControl",
      options: [option("system", "System"), option("light", "Light"), option("dark", "Dark")],
      selectedMode,
    },
  };
}

function radioByLabel(container: HTMLElement, label: string): HTMLElement {
  return within(container).getByRole("radio", { name: label });
}
