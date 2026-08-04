import { describe, expect, it } from "vite-plus/test";
import type { ApplicationSystemStateKind } from "@dpeek/formless-presentation/contract";
import {
  projectApplicationSystemState,
  resolveApplicationSystemStateIntent,
} from "./application-system-state-projection.ts";

describe("application system-state projection", () => {
  it.each([
    "blocked",
    "empty",
    "failure",
    "loading",
    "missing",
    "unavailable",
  ] as const satisfies readonly ApplicationSystemStateKind[])(
    "projects complete %s state from presentation-ready input",
    (state) => {
      const snapshot = projectApplicationSystemState({
        facts: [{ id: "route", label: "Route", value: "Program" }],
        feedback: {
          detail: "Check the current connection and try again.",
          id: "feedback:test",
          intent: state === "failure" ? "danger" : "info",
          title: "Runtime status",
        },
        heading: "Formless",
        id: `application-system-state:${state}`,
        message: "The application could not start. Try again.",
        state,
      });

      expect(snapshot).toMatchObject({
        actions: [],
        facts: [{ id: "route", label: "Route", value: "Program" }],
        feedback: {
          detail: "Check the current connection and try again.",
          title: "Runtime status",
        },
        heading: "Formless",
        id: `application-system-state:${state}`,
        kind: "applicationSystemState",
        message: "The application could not start. Try again.",
        state,
      });
    },
  );

  it("composes intentional display data without rewriting it", () => {
    const snapshot = projectApplicationSystemState({
      accessibilityLabel: "Ada Lovelace account status",
      actions: [
        {
          accessibilityLabel: "Open Ada Lovelace account",
          id: "continue",
          label: "Continue to Ada Lovelace",
          purpose: "navigate",
        },
      ],
      facts: [
        {
          id: "primary-email",
          label: "Primary email",
          value: "ada+platform@example.com",
        },
      ],
      feedback: {
        detail: "Workspace label: Production / Australia",
        id: "feedback:identity",
        intent: "info",
        title: "Ada Lovelace",
      },
      heading: "Ada Lovelace",
      id: "application-system-state:identity",
      message: "Account ready for review",
      state: "blocked",
    });

    expect(snapshot).toMatchObject({
      accessibilityLabel: "Ada Lovelace account status",
      actions: [
        {
          control: {
            accessibilityLabel: "Open Ada Lovelace account",
            content: { label: "Continue to Ada Lovelace" },
          },
        },
      ],
      facts: [
        {
          label: "Primary email",
          value: "ada+platform@example.com",
        },
      ],
      feedback: { detail: "Workspace label: Production / Australia", title: "Ada Lovelace" },
      heading: "Ada Lovelace",
      message: "Account ready for review",
    });
  });

  it("resolves only the current enabled semantic action intent", () => {
    const snapshot = projectApplicationSystemState({
      actions: [
        { id: "retry", label: "Retry", purpose: "retry" },
        { id: "home", label: "Go home", prominence: "secondary", purpose: "navigate" },
      ],
      heading: "Application unavailable",
      id: "application-system-state:test",
      message: "Try again.",
      state: "unavailable",
    });
    const retry = snapshot.actions[0]!;

    expect(resolveApplicationSystemStateIntent(snapshot, retry.intent)).toEqual({
      action: retry,
      kind: "action",
    });
    expect(
      resolveApplicationSystemStateIntent(snapshot, {
        ...retry.intent,
        actionId: "stale",
      }),
    ).toEqual({ kind: "ignored" });
    expect(
      resolveApplicationSystemStateIntent(snapshot, {
        ...retry.intent,
        stateId: "application-system-state:stale",
      }),
    ).toEqual({ kind: "ignored" });
  });
});
