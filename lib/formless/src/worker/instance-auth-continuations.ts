import {
  parseAccountRedirectTarget,
  type AccountCompletionGateResolutionResult,
  type AccountRedirectTarget,
} from "../shared/instance-auth.ts";

const instanceAuthHandoffStartPath = "/formless/auth/handoff";
const base64UrlPattern = /^[A-Za-z0-9_-]+$/;

export function accountCompletionContinueToFromRequest(
  request: Request,
  accountCompletion: AccountCompletionGateResolutionResult,
  authOrigin: string | undefined,
): { continueTo?: AccountRedirectTarget } {
  if (accountCompletion.status !== "complete") {
    return {};
  }

  if (authOrigin !== undefined && accountCompletion.target.targetOrigin === authOrigin) {
    return { continueTo: accountCompletion.continueTo };
  }

  const handoff = accountCompletionHandoffContinueToFromRequest(request, accountCompletion);

  return handoff === undefined ? {} : { continueTo: handoff };
}

function accountCompletionHandoffContinueToFromRequest(
  request: Request,
  accountCompletion: Extract<AccountCompletionGateResolutionResult, { status: "complete" }>,
): AccountRedirectTarget | undefined {
  const url = new URL(request.url);
  const nonceHash = base64UrlSearchParam(url.searchParams.get("nonceHash"));
  const state = base64UrlSearchParam(url.searchParams.get("state"));

  if (nonceHash === undefined || state === undefined) {
    return undefined;
  }

  const target = accountCompletion.target;
  const handoffSearch = new URLSearchParams();
  const access = target.access ?? protectedAccessSearchParam(url.searchParams.get("access"));

  if (access !== undefined) {
    handoffSearch.set("access", access);
  }
  handoffSearch.set("targetOrigin", target.targetOrigin);
  handoffSearch.set("routeId", target.routeId);
  handoffSearch.set("targetProfile", target.targetProfile);
  if (target.storageIdentity !== undefined) {
    handoffSearch.set("storageIdentity", target.storageIdentity);
  }
  handoffSearch.set("returnTo", target.returnTo);
  handoffSearch.set("nonceHash", nonceHash);
  handoffSearch.set("state", state);

  return parseAccountRedirectTarget(`${instanceAuthHandoffStartPath}?${handoffSearch}`);
}

function base64UrlSearchParam(value: string | null): string | undefined {
  if (value === null || !base64UrlPattern.test(value)) {
    return undefined;
  }

  return value;
}

function protectedAccessSearchParam(
  value: string | null,
): "authenticated" | "management" | "owner" | undefined {
  return value === "authenticated" || value === "management" || value === "owner"
    ? value
    : undefined;
}
