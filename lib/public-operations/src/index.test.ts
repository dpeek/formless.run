import { describe, expect, it } from "vite-plus/test";

import {
  PUBLIC_OPERATION_ROUTE_SUFFIX_PREFIX,
  PublicOperationRouteError,
  TURNSTILE_RESPONSE_FIELD_NAME,
  buildPublicOperationRequestBody,
  buildPublicOperationRouteSuffix,
  buildPublicOperationTargetRoute,
  createPublicOperationIdempotencyKey,
  decodePublicOperationRouteSegment,
  encodePublicOperationRouteSegment,
  isPublicOperationCommandResponse,
  isPublicOperationCreateResponse,
  isPublicOperationListResponse,
  isPublicOperationResponse,
  parsePublicOperationRouteSuffix,
  publicOperationErrorMessage,
  submitPublicOperationJson,
  turnstileResponseTokenFromFormData,
  type PublicOperationRouteErrorCode,
} from "./index.ts";

describe("public operation route package", () => {
  it("declares the public operation suffix prefix", () => {
    expect(PUBLIC_OPERATION_ROUTE_SUFFIX_PREFIX).toBe("/public/operations");
  });

  it("builds and parses public operation route suffixes", () => {
    const route = buildPublicOperationRouteSuffix({
      entityKey: "contact-message",
      operationKey: "submit",
    });

    expect(route).toBe("/public/operations/contact-message/submit");
    expect(parsePublicOperationRouteSuffix(route)).toEqual({
      entityKey: "contact-message",
      operationKey: "submit",
    });
  });

  it("encodes and decodes route path segments", () => {
    const route = buildPublicOperationRouteSuffix({
      entityKey: "support/request",
      operationKey: "submit invite",
    });

    expect(route).toBe("/public/operations/support%2Frequest/submit%20invite");
    expect(parsePublicOperationRouteSuffix(route)).toEqual({
      entityKey: "support/request",
      operationKey: "submit invite",
    });
    expect(encodePublicOperationRouteSegment("a/b c")).toBe("a%2Fb%20c");
    expect(decodePublicOperationRouteSegment("a%2Fb%20c")).toBe("a/b c");
  });

  it("builds target routes from runtime-owned target API route prefixes", () => {
    expect(
      buildPublicOperationTargetRoute({
        targetApiRoutePrefix: "/api/site",
        entityKey: "subscription",
        operationKey: "subscribe",
      }),
    ).toBe("/api/site/public/operations/subscription/subscribe");

    expect(
      buildPublicOperationTargetRoute({
        targetApiRoutePrefix: "/api/formless/program",
        entityKey: "contact-message",
        operationKey: "submit",
      }),
    ).toBe("/api/formless/program/public/operations/contact-message/submit");
  });

  it("rejects invalid suffix shape and extra segments", () => {
    expectRouteError(() => parsePublicOperationRouteSuffix("/public/operations"), "invalid-shape");
    expectRouteError(
      () => parsePublicOperationRouteSuffix("/public/operations/contact-message"),
      "invalid-shape",
    );
    expectRouteError(
      () => parsePublicOperationRouteSuffix("/public/operations/contact-message/submit/extra"),
      "invalid-shape",
    );
    expectRouteError(
      () => parsePublicOperationRouteSuffix("/private/operations/contact-message/submit"),
      "invalid-shape",
    );
  });

  it("rejects empty route segments", () => {
    expectRouteError(
      () => parsePublicOperationRouteSuffix("/public/operations//submit"),
      "invalid-shape",
    );
    expectRouteError(
      () => parsePublicOperationRouteSuffix("/public/operations/contact-message/"),
      "invalid-shape",
    );
    expectRouteError(
      () => parsePublicOperationRouteSuffix("/public/operations/%20/submit"),
      "empty-segment",
    );
    expectRouteError(
      () => buildPublicOperationRouteSuffix({ entityKey: "contact-message", operationKey: " " }),
      "empty-segment",
    );
  });

  it("rejects invalid path escapes", () => {
    expectRouteError(
      () => parsePublicOperationRouteSuffix("/public/operations/%E0%A4%A/submit"),
      "invalid-escape",
    );
    expectRouteError(
      () => parsePublicOperationRouteSuffix("/public/operations/contact-message/%"),
      "invalid-escape",
    );
  });
});

function expectRouteError(call: () => unknown, code: PublicOperationRouteErrorCode): void {
  try {
    call();
  } catch (error) {
    expect(error).toBeInstanceOf(PublicOperationRouteError);
    expect((error as PublicOperationRouteError).code).toBe(code);
    return;
  }

  throw new Error(`Expected public operation route error ${code}.`);
}

describe("public operation browser client helpers", () => {
  it("builds browser-safe public operation request envelopes", () => {
    expect(
      buildPublicOperationRequestBody({
        idempotencyKey: "site-contact:block-1:key-1",
        input: {
          name: "Ada Lovelace",
          confirmed: true,
          quantity: 2,
        },
        siteBlockId: "block-1",
        turnstileToken: "token-ok",
      }),
    ).toEqual({
      input: {
        name: "Ada Lovelace",
        confirmed: true,
        quantity: 2,
      },
      proof: {
        turnstileToken: "token-ok",
      },
      source: {
        siteBlockId: "block-1",
      },
      idempotencyKey: "site-contact:block-1:key-1",
    });

    expect(
      buildPublicOperationRequestBody({
        input: {
          email: "reader@example.com",
        },
        turnstileToken: "token-ok",
      }),
    ).toEqual({
      input: {
        email: "reader@example.com",
      },
      proof: {
        turnstileToken: "token-ok",
      },
    });

    expect(
      buildPublicOperationRequestBody({
        input: {
          lookup: "CODE-ALPHA",
        },
        siteBlockId: "lookup-block",
      }),
    ).toEqual({
      input: {
        lookup: "CODE-ALPHA",
      },
      source: {
        siteBlockId: "lookup-block",
      },
    });
  });

  it("posts JSON to public operation routes and validates the response", async () => {
    const requests: { url: string; init: RequestInit | undefined }[] = [];
    const responseBody = commandResponse("committed");
    const fetcher: typeof fetch = async (url, init) => {
      requests.push({ url: requestUrlString(url), init });

      return Response.json(responseBody);
    };
    const body = buildPublicOperationRequestBody({
      idempotencyKey: "site-public-operation:block-1:key-1",
      input: {
        summary: "Send lab results",
      },
      siteBlockId: "block-1",
      turnstileToken: "token-ok",
    });

    await expect(
      submitPublicOperationJson({
        body,
        fetcher,
        responseGuard: isPublicOperationCommandResponse,
        route: "/api/intake/public/operations/intake-request/submit",
      }),
    ).resolves.toEqual(responseBody);
    expect(requests).toEqual([
      {
        url: "/api/intake/public/operations/intake-request/submit",
        init: {
          body: JSON.stringify(body),
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          method: "POST",
        },
      },
    ]);
  });

  it("extracts public-safe operation errors and rejects failed JSON submissions", async () => {
    expect(publicOperationErrorMessage({ error: "Public operation challenge failed." })).toBe(
      "Public operation challenge failed.",
    );
    expect(publicOperationErrorMessage({ error: 400 })).toBeUndefined();
    expect(publicOperationErrorMessage(null)).toBeUndefined();

    const fetcher: typeof fetch = async () =>
      Response.json({ error: "Public operation input failed validation." }, { status: 400 });

    await expect(
      submitPublicOperationJson({
        body: buildPublicOperationRequestBody({
          input: {
            summary: "Send lab results",
          },
          turnstileToken: "bad-token",
        }),
        fetcher,
        responseGuard: isPublicOperationResponse,
        route: "/api/intake/public/operations/intake-request/submit",
      }),
    ).rejects.toThrow("Public operation input failed validation.");
  });

  it("rejects invalid successful JSON submissions before callers treat them as success", async () => {
    const fetcher: typeof fetch = async () =>
      Response.json({
        invocationId: "operation-1",
        operation: {
          entityName: "intake-request",
          operationName: "submit",
          canonicalKey: "intake-request.submit",
          kind: "command",
        },
        output: {
          type: "command",
          affectedChangeIds: [10],
          cursor: 12,
        },
        status: "committed",
      });

    await expect(
      submitPublicOperationJson({
        body: buildPublicOperationRequestBody({
          input: {
            summary: "Send lab results",
          },
          turnstileToken: "token-ok",
        }),
        fetcher,
        invalidResponseMessage: "Invalid public operation response.",
        responseGuard: isPublicOperationResponse,
        route: "/api/intake/public/operations/intake-request/submit",
      }),
    ).rejects.toThrow("Invalid public operation response.");
  });

  it("guards committed and replayed command and create public operation responses", () => {
    expect(isPublicOperationCommandResponse(commandResponse("committed"))).toBe(true);
    expect(isPublicOperationCommandResponse(commandResponse("replayed"))).toBe(true);
    expect(isPublicOperationCreateResponse(createResponse("committed"))).toBe(true);
    expect(isPublicOperationCreateResponse(createResponse("replayed"))).toBe(true);
    expect(isPublicOperationResponse(commandResponse("committed"))).toBe(true);
    expect(isPublicOperationResponse(createResponse("replayed"))).toBe(true);

    expect(
      isPublicOperationCommandResponse({
        ...commandResponse("committed"),
        status: "accepted",
      }),
    ).toBe(false);
    expect(
      isPublicOperationCreateResponse({
        ...createResponse("committed"),
        output: {
          type: "create",
          affectedChangeIds: ["10"],
          cursor: 12,
        },
      }),
    ).toBe(false);
  });

  it("submits challenge-free public reads and guards projected list rows", async () => {
    const responseBody = listResponse([
      {
        verificationCode: "CODE-ALPHA",
        reportNumber: "REPORT-1",
        publicDeliveryReference: "delivery-alpha",
      },
    ]);
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    const body = buildPublicOperationRequestBody({
      input: { lookup: "CODE-ALPHA" },
      siteBlockId: "lookup-block",
    });

    const result = await submitPublicOperationJson({
      body,
      fetcher: async (url, init) => {
        requests.push({ url: requestUrlString(url), init });
        return Response.json(responseBody);
      },
      responseGuard: isPublicOperationListResponse,
      route: "/api/verifi/public/operations/certificate/lookup",
    });

    expect(result.output.records).toEqual([
      {
        verificationCode: "CODE-ALPHA",
        reportNumber: "REPORT-1",
        publicDeliveryReference: "delivery-alpha",
      },
    ]);
    expect(requests[0]?.init?.body).toBe(JSON.stringify(body));
    expect(JSON.stringify(body)).not.toContain("proof");
    expect(JSON.stringify(body)).not.toContain("idempotency");
    expect(isPublicOperationResponse(responseBody)).toBe(true);
    expect(
      isPublicOperationListResponse({
        ...responseBody,
        output: {
          type: "list",
          records: [{ verificationCode: { private: "nested" } }],
        },
      }),
    ).toBe(false);
    expect(
      isPublicOperationListResponse({
        ...responseBody,
        status: "committed",
      }),
    ).toBe(false);
  });

  it("creates public operation idempotency keys from caller purpose and block id", () => {
    expect(
      createPublicOperationIdempotencyKey({
        purpose: "site-contact",
        randomId: "key-1",
        siteBlockId: "block-1",
      }),
    ).toBe("site-contact:block-1:key-1");
  });

  it("extracts the first non-empty Turnstile response token from form data", () => {
    const formData = new FormData();

    formData.append(TURNSTILE_RESPONSE_FIELD_NAME, "");
    formData.append(TURNSTILE_RESPONSE_FIELD_NAME, "token-ok");

    expect(turnstileResponseTokenFromFormData(formData)).toBe("token-ok");
  });
});

function commandResponse(status: "committed" | "replayed") {
  return {
    invocationId: "operation-1",
    operation: {
      entityName: "intake-request",
      operationName: "submit",
      canonicalKey: "intake-request.submit",
      kind: "command",
    },
    output: {
      type: "command",
      affectedChangeIds: ["10"],
      cursor: 12,
      recordPlan: {
        steps: [
          {
            name: "request",
            kind: "create",
            entity: "intake-request",
            recordId: "request-1",
            changeId: "10",
          },
        ],
      },
    },
    status,
  };
}

function createResponse(status: "committed" | "replayed") {
  return {
    invocationId: "operation-2",
    operation: {
      entityName: "contact-message",
      operationName: "submit",
      canonicalKey: "contact-message.submit",
      kind: "create",
    },
    output: {
      type: "create",
      affectedChangeIds: ["20"],
      cursor: 22,
      changes: [],
      record: {
        id: "message-1",
        entity: "contact-message",
        values: {
          name: "Ada Lovelace",
        },
      },
    },
    status,
  };
}

function listResponse(records: Array<Record<string, string | boolean | number>>) {
  return {
    invocationId: "operation-1",
    operation: {
      entityName: "certificate",
      operationName: "lookup",
      canonicalKey: "certificate.lookup",
      kind: "list",
    },
    output: {
      type: "list",
      records,
    },
    status: "accepted",
  } as const;
}

function requestUrlString(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}
