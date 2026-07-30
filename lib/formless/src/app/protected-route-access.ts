import {
  authAccountContinuationLocationForReturnTarget,
  parseAuthAccountStatusResult,
  type AccountRedirectTarget,
} from "../shared/instance-auth.ts";

export type ProtectedRouteAccessDecision =
  | { kind: "authorized" }
  | { kind: "continuation" }
  | { kind: "forbidden" };

export async function resolveProtectedRouteAccess(
  location: AccountRedirectTarget,
  {
    fetcher = fetch,
    signal,
  }: {
    fetcher?: typeof fetch;
    signal?: AbortSignal;
  } = {},
): Promise<ProtectedRouteAccessDecision> {
  const response = await fetcher(authAccountContinuationLocationForReturnTarget(location), {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });

  if (response.status === 401) {
    return { kind: "continuation" };
  }

  const result = parseAuthAccountStatusResult(await response.json());

  if (response.status === 403 && result.status === "forbidden") {
    return { kind: "forbidden" };
  }

  if (response.status === 409 && result.status === "blocked") {
    return { kind: "continuation" };
  }

  if (response.ok && result.status === "complete" && result.continueTo === location) {
    return { kind: "authorized" };
  }

  throw new Error("Protected route access response did not match the requested target.");
}
