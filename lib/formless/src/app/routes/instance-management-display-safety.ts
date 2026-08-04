export function displaySafeText(value: string): string {
  return value
    .replace(
      /([A-Z0-9_]*(?:TOKEN|PASSWORD|SECRET|API_KEY|APIKEY)[A-Z0-9_]*=)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
      "$1[redacted]",
    )
    .replace(/(owner[-_\s]?setup[-_\s]?token[:=]?\s*)[A-Za-z0-9._~+/-]+=*/gi, "$1[redacted]")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1[redacted]")
    .replace(/lease:[A-Za-z0-9._:-]+/gi, "[redacted]")
    .replace(/CF_API_TOKEN[_A-Za-z0-9-]*/g, "[redacted]")
    .replace(/\/Users\/[^\s,;'"<>)]+/g, "<path>")
    .replace(/\/(?:tmp|var|etc|home)\/[^\s,;'"<>)]+/g, "<path>")
    .replace(/[A-Za-z]:\\[^\s,;'"<>)]+/g, "<path>");
}

export function displaySafeAuthorizationUrl(
  value: string,
  provider: "alchemy" | "cloudflare",
): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return "";
  }

  if (url.protocol !== "https:") {
    return "";
  }

  for (const key of url.searchParams.keys()) {
    if (isForbiddenDisplayKey(key)) {
      return "";
    }
  }

  const host = url.hostname.toLowerCase();

  if (provider === "cloudflare" && host === "dash.cloudflare.com") {
    return url.toString();
  }

  if (
    provider === "alchemy" &&
    (host === "alchemy.com" ||
      host.endsWith(".alchemy.com") ||
      host === "alchemy.run" ||
      host.endsWith(".alchemy.run"))
  ) {
    return url.toString();
  }

  return "";
}

export function fieldKeyLabel(key: string): string {
  return key
    .replaceAll(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll(/[-_]/g, " ")
    .replace(/^\w/, (match) => match.toUpperCase());
}

function isForbiddenDisplayKey(key: string): boolean {
  const normalized = key.toLowerCase().replaceAll(/[-_]/g, "");

  return (
    normalized === "secret" ||
    normalized === "secrets" ||
    normalized.endsWith("token") ||
    normalized.endsWith("password") ||
    normalized.includes("apikey") ||
    normalized.includes("credential") ||
    normalized === "leasetoken" ||
    normalized.includes("providerstate") ||
    normalized.startsWith("raw")
  );
}
