import type { NativeLinkActionContract } from "@dpeek/formless-presentation/contract";

export type ProjectGeneratedNativeLinkActionOptions = {
  accessibilityLabel: string;
  id: string;
  label: string;
  prominence?: NativeLinkActionContract["prominence"];
  resolution:
    | {
        href: string;
        kind: "available";
      }
    | {
        kind: "unavailable";
        reason: string;
      };
  target: NativeLinkActionContract["target"];
};

export function projectGeneratedNativeLinkAction({
  accessibilityLabel,
  id,
  label,
  prominence = "primary",
  resolution,
  target,
}: ProjectGeneratedNativeLinkActionOptions): NativeLinkActionContract {
  const base = {
    accessibilityLabel,
    id,
    kind: "nativeLinkAction" as const,
    label,
    prominence,
    target,
  };

  return resolution.kind === "available"
    ? { ...base, availability: "available", href: resolution.href }
    : {
        ...base,
        availability: "unavailable",
        unavailableReason: resolution.reason,
      };
}
