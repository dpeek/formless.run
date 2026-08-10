import { parseSourceSvg } from "@dpeek/formless-source-svg";

import type { IconValueMode, TextFieldFormat, TextFieldSchema } from "./types.ts";

export const TEXT_EMAIL_FORMAT_INVALID_MESSAGE = "Enter an email address like name@example.com.";
export const TEXT_PHONE_FORMAT_INVALID_MESSAGE =
  "Enter a phone number using digits and common separators.";
export const TEXT_ICON_ID_INVALID_MESSAGE = "Enter an icon id instead of SVG source.";
export type TextValueValidationResult =
  | {
      kind: "set";
      value: string;
    }
  | {
      kind: "omit";
    };
export function textFormatValidatesStoredValue(format: TextFieldFormat | undefined): boolean {
  return format === "email" || format === "phone";
}
export function textFieldValidatesStoredValue(
  field: Pick<TextFieldSchema, "format" | "icon">,
): boolean {
  return (
    textFormatValidatesStoredValue(field.format) ||
    (field.format === "icon" && (field.icon?.valueMode ?? "svgSource") !== "svgSource")
  );
}
export function validateTextValueForStorage(
  field: Pick<TextFieldSchema, "format" | "icon">,
  value: string,
): TextValueValidationResult {
  if (field.format === "email") {
    const trimmed = value.trim();

    if (trimmed === "") {
      return { kind: "omit" };
    }

    assertEmailTextValue(trimmed);
    return { kind: "set", value: trimmed };
  }

  if (field.format === "phone") {
    const trimmed = value.trim();

    if (trimmed === "") {
      return { kind: "omit" };
    }

    assertPhoneTextValue(trimmed);
    return { kind: "set", value: trimmed };
  }

  if (field.format === "icon") {
    if (value.trim() === "") {
      return { kind: "omit" };
    }

    const valueMode = field.icon?.valueMode ?? "svgSource";
    if (valueMode !== "svgSource") {
      assertIconTextValue(value, valueMode);
    }
    return { kind: "set", value };
  }

  if (value === "") {
    return { kind: "omit" };
  }
  return { kind: "set", value };
}
export function isValidStoredTextValue(
  value: string,
  field: {
    required: boolean;
    format?: TextFieldFormat;
    icon?: TextFieldSchema["icon"];
  },
): boolean {
  if (!textFieldValidatesStoredValue(field)) {
    return !field.required || value.trim() !== "";
  }

  if (value.trim() === "") {
    return false;
  }

  try {
    const result = validateTextValueForStorage(field, value);
    return result.kind === "set" && result.value === value;
  } catch {
    return false;
  }
}

function assertIconTextValue(value: string, valueMode: IconValueMode): void {
  const safeSource = parseSourceSvg(value) !== null;

  if (valueMode === "iconIdWithSvgFallback" && safeSource) {
    return;
  }

  if (safeSource || value.trimStart().startsWith("<")) {
    throw new Error(TEXT_ICON_ID_INVALID_MESSAGE);
  }
}

function assertEmailTextValue(value: string) {
  if (value.length > 254 || emailTextValueHasWhitespaceOrControl(value)) {
    throw new Error(TEXT_EMAIL_FORMAT_INVALID_MESSAGE);
  }

  const parts = value.split("@");
  if (parts.length !== 2) {
    throw new Error(TEXT_EMAIL_FORMAT_INVALID_MESSAGE);
  }

  const [local, domain] = parts;
  if (!local || !domain || local.length > 64) {
    throw new Error(TEXT_EMAIL_FORMAT_INVALID_MESSAGE);
  }

  const labels = domain.split(".");
  if (labels.length < 2) {
    throw new Error(TEXT_EMAIL_FORMAT_INVALID_MESSAGE);
  }

  for (const label of labels) {
    if (
      label.length === 0 ||
      label.length > 63 ||
      !/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label)
    ) {
      throw new Error(TEXT_EMAIL_FORMAT_INVALID_MESSAGE);
    }
  }

  const lastLabel = labels[labels.length - 1];
  if (!lastLabel || lastLabel.length < 2) {
    throw new Error(TEXT_EMAIL_FORMAT_INVALID_MESSAGE);
  }
}

function emailTextValueHasWhitespaceOrControl(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);

    if (character.trim() === "" || code <= 0x1f || code === 0x7f) {
      return true;
    }
  }

  return false;
}

function assertPhoneTextValue(value: string) {
  if (!/^[0-9+\-.() ]+$/.test(value)) {
    throw new Error(TEXT_PHONE_FORMAT_INVALID_MESSAGE);
  }

  const firstPlus = value.indexOf("+");
  if (firstPlus > 0 || (firstPlus === 0 && value.indexOf("+", 1) !== -1)) {
    throw new Error(TEXT_PHONE_FORMAT_INVALID_MESSAGE);
  }

  const digitCount = value.replace(/\D/g, "").length;
  if (digitCount < 7 || digitCount > 15) {
    throw new Error(TEXT_PHONE_FORMAT_INVALID_MESSAGE);
  }
}
