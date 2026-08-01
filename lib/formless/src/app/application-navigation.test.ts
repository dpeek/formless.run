import { describe, expect, it } from "vite-plus/test";
import {
  APPLICATION_NATIVE_NAVIGATION_ATTRIBUTE,
  applicationSpaNavigationTarget,
  type ApplicationNavigationActivation,
} from "./application-navigation.tsx";

const eligible: ApplicationNavigationActivation = {
  altKey: false,
  button: 0,
  ctrlKey: false,
  currentHref: "https://formless.test/tasks?view=active",
  defaultPrevented: false,
  download: false,
  href: "/crm?view=all#records",
  metaKey: false,
  nativeNavigation: false,
  shiftKey: false,
  target: null,
};

describe("application navigation bridge", () => {
  it("selects unmodified same-origin primary link activation for SPA navigation", () => {
    expect(applicationSpaNavigationTarget(eligible)).toBe("/crm?view=all#records");
    expect(applicationSpaNavigationTarget({ ...eligible, target: "_self" })).toBe(
      "/crm?view=all#records",
    );
  });

  it.each([
    ["prevented", { defaultPrevented: true }],
    ["secondary", { button: 1 }],
    ["meta", { metaKey: true }],
    ["control", { ctrlKey: true }],
    ["alt", { altKey: true }],
    ["shift", { shiftKey: true }],
    ["download", { download: true }],
    ["new tab", { target: "_blank" }],
    ["named target", { target: "workspace" }],
    ["native subtree", { nativeNavigation: true }],
    ["external", { href: "https://example.com/crm" }],
    ["mailto", { href: "mailto:owner@formless.test" }],
    ["hash only", { href: "#records" }],
  ] as const)("preserves %s native navigation", (_label, override) => {
    expect(applicationSpaNavigationTarget({ ...eligible, ...override })).toBeUndefined();
  });

  it("uses a document-level opt-out marker without introducing a focus-owning wrapper", () => {
    expect(APPLICATION_NATIVE_NAVIGATION_ATTRIBUTE).toBe("data-formless-native-navigation");
    const focusedControl = { id: "focused-control" };
    const activeElement = focusedControl;

    applicationSpaNavigationTarget(eligible);

    expect(activeElement).toBe(focusedControl);
  });
});
