import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_SITE_ICON_SVG,
  resolveSiteIconSvgSource,
  sanitizeSiteIconSvgSource,
} from "./site-icon-source.ts";

describe("Site icon source", () => {
  it("serializes safe SVG source for HTTP serving", () => {
    const source =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><title>Site &amp; icon</title><path d="M4 12h16" stroke-width="2" stroke-linecap="round" /></svg>';

    expect(sanitizeSiteIconSvgSource(source)).toBe(
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg"><title>Site &amp; icon</title><path d="M4 12h16" stroke-width="2" stroke-linecap="round"></path></svg>',
    );
  });

  it("strips event handlers from otherwise safe SVG", () => {
    const source =
      '<svg viewBox="0 0 24 24" onload="alert(1)"><path onclick="alert(1)" d="M4 4h16v16H4z" /></svg>';
    const sanitized = sanitizeSiteIconSvgSource(source);

    expect(sanitized).toContain('<path d="M4 4h16v16H4z"></path>');
    expect(sanitized).not.toContain("onload");
    expect(sanitized).not.toContain("onclick");
  });

  it("falls back to the default SVG for empty or unsafe source", () => {
    expect(resolveSiteIconSvgSource("")).toBe(resolveSiteIconSvgSource(DEFAULT_SITE_ICON_SVG));
    expect(
      resolveSiteIconSvgSource('<svg viewBox="0 0 24 24"><script>alert(1)</script></svg>'),
    ).toBe(resolveSiteIconSvgSource(DEFAULT_SITE_ICON_SVG));
    expect(
      resolveSiteIconSvgSource(
        '<svg viewBox="0 0 24 24"><path fill="url(https://example.com/a.svg)" d="M0 0h1v1z" /></svg>',
      ),
    ).toBe(resolveSiteIconSvgSource(DEFAULT_SITE_ICON_SVG));
  });
});
