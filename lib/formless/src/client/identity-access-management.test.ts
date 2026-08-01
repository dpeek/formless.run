import { describe, expect, it } from "vite-plus/test";

import {
  createIdentityAccessManagementInvitation,
  IDENTITY_COLLABORATOR_INVITATIONS_API_ROUTE,
  IDENTITY_COLLABORATOR_INVITATION_REVOKE_API_ROUTE,
  IDENTITY_ACCESS_PERSON_REMOVAL_API_ROUTE,
  IDENTITY_ACCESS_PERSON_ROLE_REPLACEMENT_API_ROUTE,
  fetchIdentityAccessManagementSummary,
  IDENTITY_ACCESS_MANAGEMENT_SUMMARY_API_ROUTE,
  removeIdentityAccessManagementPerson,
  replaceIdentityAccessManagementPersonRoles,
  revokeIdentityAccessManagementInvitation,
} from "./identity-access-management.ts";
describe("identity access management client", () => {
  it("fetches the display-safe access summary contract", async () => {
    const requests: Array<{
      input: RequestInfo | URL;
      init?: RequestInit;
    }> = [];
    const summary = {
      groups: [],
      invitationGrantOptions: {
        authority: { instanceOwner: true, programAdministrator: false },
        memberships: [],
        roles: [],
      },
      invitations: [],
      memberships: [],
      organizations: [],
      people: [],
      programRoles: [],
      roles: [],
    };

    const result = await fetchIdentityAccessManagementSummary({
      fetcher: async (input, init) => {
        requests.push({ input, init });

        return Response.json(summary);
      },
    });

    expect(IDENTITY_ACCESS_MANAGEMENT_SUMMARY_API_ROUTE).toBe(
      "/api/formless/identity/access-summary",
    );
    expect(result).toEqual(summary);
    expect(requests).toEqual([
      {
        input: IDENTITY_ACCESS_MANAGEMENT_SUMMARY_API_ROUTE,
        init: {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          signal: undefined,
        },
      },
    ]);
  });

  it("raises response status and safe error text for rejected summary reads", async () => {
    await expect(
      fetchIdentityAccessManagementSummary({
        fetcher: async () =>
          Response.json({ error: "Current principal lacks access authority." }, { status: 403 }),
      }),
    ).rejects.toMatchObject({
      body: { error: "Current principal lacks access authority." },
      message: "Current principal lacks access authority.",
      name: "IdentityAccessManagementApiError",
      status: 403,
    });
  });
  it("creates collaborator invitations through the access management route", async () => {
    const requests: Array<{
      input: RequestInfo | URL;
      init?: RequestInit;
    }> = [];
    const body = {
      delivery: { status: "skipped", reason: "missing-auth-email-configuration" },
      invitation: {
        id: "invitation:ada",
        entity: "invitation",
        values: {
          targetEmail: "ada@example.com",
          targetSurface: "instance",
          status: "pending",
        },
      },
      records: [],
      status: "committed",
    };

    const result = await createIdentityAccessManagementInvitation(
      {
        idempotencyKey: "access-invite-ada",
        invitedPrincipal: { displayName: "Ada Collaborator" },
        principalEmail: { primary: true, recovery: false },
        roleAssignments: [
          {
            roleId: "role_04144de6-7927-49f2-826a-cdcc70c47357",
            scopeKind: "program",
          },
        ],
        targetEmail: "ada@example.com",
      },
      {
        fetcher: async (input, init) => {
          requests.push({ input, init });

          return Response.json(body);
        },
      },
    );

    expect(IDENTITY_COLLABORATOR_INVITATIONS_API_ROUTE).toBe(
      "/api/formless/identity/collaborator-invitations",
    );
    expect(result).toEqual(body);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.input).toBe(IDENTITY_COLLABORATOR_INVITATIONS_API_ROUTE);
    expect(requests[0]?.init).toMatchObject({
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: undefined,
    });
    expect(typeof requests[0]?.init?.body).toBe("string");
    expect(JSON.parse(requests[0]?.init?.body as string)).toEqual({
      idempotencyKey: "access-invite-ada",
      invitedPrincipal: { displayName: "Ada Collaborator" },
      memberships: [],
      principalEmail: { primary: true, recovery: false },
      roleAssignments: [
        {
          roleId: "role_04144de6-7927-49f2-826a-cdcc70c47357",
          scopeKind: "program",
        },
      ],
      targetEmail: "ada@example.com",
    });
    expect(JSON.stringify(result)).not.toContain("raw");
    expect(JSON.stringify(result)).not.toContain("token");
    expect(JSON.stringify(result)).not.toContain("session");
  });
  it("revokes collaborator invitations through the access management route", async () => {
    const requests: Array<{
      input: RequestInfo | URL;
      init?: RequestInit;
    }> = [];
    const body = {
      invitation: {
        createdAt: "2026-07-01T00:00:00.000Z",
        expiresAt: "2999-02-01T00:00:00.000Z",
        invitationId: "invitation:ada",
        inviterPrincipalId: "principal:owner",
        status: "revoked",
        targetEmail: "ada@example.com",
        targetSurface: "instance",
        updatedAt: "2026-07-01T00:00:01.000Z",
      },
      revokedAt: "2026-07-01T00:00:01.000Z",
      status: "revoked",
    };

    const result = await revokeIdentityAccessManagementInvitation(
      { invitationId: "invitation:ada" },
      {
        fetcher: async (input, init) => {
          requests.push({ input, init });

          return Response.json(body);
        },
      },
    );

    expect(IDENTITY_COLLABORATOR_INVITATION_REVOKE_API_ROUTE).toBe(
      "/api/formless/identity/collaborator-invitations/revoke",
    );
    expect(result).toEqual(body);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.input).toBe(IDENTITY_COLLABORATOR_INVITATION_REVOKE_API_ROUTE);
    expect(requests[0]?.init).toMatchObject({
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: undefined,
    });
    expect(JSON.parse(requests[0]?.init?.body as string)).toEqual({
      invitationId: "invitation:ada",
    });
    expect(JSON.stringify(result)).not.toContain("raw");
    expect(JSON.stringify(result)).not.toContain("token");
    expect(JSON.stringify(result)).not.toContain("session");
  });
  it("replaces person roles through one selected-set access request", async () => {
    const requests: Array<{
      input: RequestInfo | URL;
      init?: RequestInit;
    }> = [];
    const input = {
      idempotencyKey: "replace-ada-roles",
      now: "2026-07-23T00:00:00.000Z",
      principalId: "principal:ada",
      roles: [
        {
          roleId: "role_04144de6-7927-49f2-826a-cdcc70c47357" as const,
          scopeKind: "program" as const,
        },
      ],
    };
    const body = {
      principalId: input.principalId,
      programRoles: [],
      roles: [],
      status: "committed",
    } as const;

    const result = await replaceIdentityAccessManagementPersonRoles(input, {
      fetcher: async (requestInput, init) => {
        requests.push({ input: requestInput, init });
        return Response.json(body);
      },
    });

    expect(IDENTITY_ACCESS_PERSON_ROLE_REPLACEMENT_API_ROUTE).toBe(
      "/api/formless/identity/access-people/replace-roles",
    );
    expect(result).toEqual(body);
    expect(requests).toEqual([
      {
        input: IDENTITY_ACCESS_PERSON_ROLE_REPLACEMENT_API_ROUTE,
        init: {
          body: JSON.stringify(input),
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          method: "POST",
          signal: undefined,
        },
      },
    ]);
  });
  it("removes a person through the soft-disable access request", async () => {
    const requests: Array<{
      input: RequestInfo | URL;
      init?: RequestInit;
    }> = [];
    const input = {
      idempotencyKey: "remove-ada",
      principalId: "principal:ada",
    };
    const body = {
      person: {
        createdAt: "2026-07-01T00:00:00.000Z",
        displayName: "Ada",
        kind: "human",
        principalId: input.principalId,
        status: "disabled",
        updatedAt: "2026-07-23T00:00:00.000Z",
      },
      removedAt: "2026-07-23T00:00:00.000Z",
      status: "disabled",
    } as const;

    const result = await removeIdentityAccessManagementPerson(input, {
      fetcher: async (requestInput, init) => {
        requests.push({ input: requestInput, init });
        return Response.json(body);
      },
    });

    expect(IDENTITY_ACCESS_PERSON_REMOVAL_API_ROUTE).toBe(
      "/api/formless/identity/access-people/remove",
    );
    expect(result).toEqual(body);
    expect(requests[0]).toEqual({
      input: IDENTITY_ACCESS_PERSON_REMOVAL_API_ROUTE,
      init: {
        body: JSON.stringify(input),
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: undefined,
      },
    });
  });

  it("raises response status and safe error text for rejected invitation revokes", async () => {
    await expect(
      revokeIdentityAccessManagementInvitation(
        { invitationId: "invitation:ada" },
        {
          fetcher: async () =>
            Response.json(
              { error: "Collaborator invitation is not pending.", reason: "revoked-invitation" },
              { status: 409 },
            ),
        },
      ),
    ).rejects.toMatchObject({
      body: {
        error: "Collaborator invitation is not pending.",
        reason: "revoked-invitation",
      },
      message: "Collaborator invitation is not pending.",
      name: "IdentityAccessManagementApiError",
      status: 409,
    });
  });
});
