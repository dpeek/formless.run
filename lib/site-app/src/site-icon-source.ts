import { parseSourceSvg, type SourceSvgElement } from "@dpeek/formless-source-svg";
import type { IconDefinitionSchema, KeyedDefinition } from "@dpeek/formless-schema";

export const DEFAULT_SITE_ICON_SVG =
  '<svg viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" fill="none" width="32" height="32" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><path d="M18 16l4-4-4-4" /><path d="M6 8 2 12l4 4" /><path d="M14.5 4l-5 16" /></svg>';

const svgAttributeNameMap: Record<string, string> = {
  "aria-hidden": "aria-hidden",
  clipRule: "clip-rule",
  cx: "cx",
  cy: "cy",
  d: "d",
  fill: "fill",
  fillOpacity: "fill-opacity",
  fillRule: "fill-rule",
  height: "height",
  opacity: "opacity",
  points: "points",
  r: "r",
  rx: "rx",
  ry: "ry",
  stroke: "stroke",
  strokeDasharray: "stroke-dasharray",
  strokeDashoffset: "stroke-dashoffset",
  strokeLinecap: "stroke-linecap",
  strokeLinejoin: "stroke-linejoin",
  strokeMiterlimit: "stroke-miterlimit",
  strokeOpacity: "stroke-opacity",
  strokeWidth: "stroke-width",
  transform: "transform",
  viewBox: "viewBox",
  width: "width",
  x: "x",
  x1: "x1",
  x2: "x2",
  xmlns: "xmlns",
  y: "y",
  y1: "y1",
  y2: "y2",
};

export type SiteIconValueResolution =
  | { kind: "empty" }
  | { kind: "missing"; value: string }
  | { kind: "resolved"; source: string }
  | { kind: "unsafe"; value: string };

export function resolveSiteIconValue(
  value: string | null | undefined,
  iconCatalog: readonly KeyedDefinition<IconDefinitionSchema>[] = [],
): SiteIconValueResolution {
  if (value === null || value === undefined || value === "") {
    return { kind: "empty" };
  }

  const legacySource = sanitizeSiteIconSvgSource(value);

  if (legacySource !== undefined) {
    return { kind: "resolved", source: legacySource };
  }

  const definition = iconCatalog.find(({ key }) => key === value);

  if (definition !== undefined) {
    const catalogSource = sanitizeSiteIconSvgSource(definition.source);

    return catalogSource === undefined
      ? { kind: "unsafe", value }
      : { kind: "resolved", source: catalogSource };
  }

  return value.trimStart().startsWith("<") ? { kind: "unsafe", value } : { kind: "missing", value };
}

export function resolveSiteIconSvgSource(
  source: string | null | undefined,
  iconCatalog: readonly KeyedDefinition<IconDefinitionSchema>[] = [],
): string {
  const resolution = resolveSiteIconValue(source, iconCatalog);

  return (
    (resolution.kind === "resolved" ? resolution.source : undefined) ??
    sanitizeSiteIconSvgSource(DEFAULT_SITE_ICON_SVG) ??
    DEFAULT_SITE_ICON_SVG
  );
}

export function sanitizeSiteIconSvgSource(source: string | null | undefined): string | undefined {
  const parsed = parseSourceSvg(source);

  return parsed ? serializeSvgElement(parsed, { root: true }) : undefined;
}

function serializeSvgElement(element: SourceSvgElement, options: { root?: boolean } = {}): string {
  const attributes = { ...element.attributes };

  if (options.root && !attributes.xmlns) {
    attributes.xmlns = "http://www.w3.org/2000/svg";
  }

  const serializedAttributes = Object.entries(attributes)
    .map(([name, value]) => {
      const svgName = svgAttributeNameMap[name];

      return svgName ? ` ${svgName}="${escapeSvgAttribute(value)}"` : "";
    })
    .join("");
  const children = element.children
    .map((child) =>
      typeof child === "string"
        ? escapeSvgText(child)
        : serializeSvgElement(child, { root: false }),
    )
    .join("");

  return `<${element.tagName}${serializedAttributes}>${children}</${element.tagName}>`;
}

function escapeSvgText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeSvgAttribute(value: string): string {
  return escapeSvgText(value).replaceAll('"', "&quot;");
}
