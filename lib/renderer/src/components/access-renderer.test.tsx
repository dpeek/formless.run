// @vitest-environment jsdom

import { fireEvent, render, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { ToastViewport } from "@astryxdesign/core/Toast";
import type {
  AccessActionContract,
  AccessConfirmationContract,
  AccessFeedbackContract,
  AccessIntent,
  AccessInvitationAuthoringContract,
  AccessManifestContract,
  AccessReadyContract,
  ButtonContract,
} from "@dpeek/formless-presentation/contract";
import { createMemoryPresentationHost } from "@dpeek/formless-presentation/host";
import { PresentationHostProvider } from "@dpeek/formless-presentation/host/react";
import {
  accessFixtureAuthoringReference,
  accessFixturePersonAuthoringReference,
  accessFixtureReference,
  createFormlessAccessFixtures,
  invitationAuthoring,
  personRoleAuthoring,
} from "./access.fixtures.ts";
import {
  AstryxAccessInvitationAuthoring,
  AstryxAccessPersonRoleAuthoring,
  AstryxAccessRenderer,
  AstryxSubscribedAccessRenderer,
} from "./access-renderer.tsx";
(
  globalThis as {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;
describe("Astryx access renderer", () => {
  it("renders complete state, table, action, feedback, and confirmation outcomes", () => {
    const loading = fixtureManifest("loading");
    const unauthorized = fixtureManifest("unauthorized");
    const failed = fixtureManifest("failed");
    const empty = fixtureManifest("empty");
    const populated = ready(fixtureManifest("populated-owner"));
    const populatedWithConfirmation: AccessReadyContract = {
      ...populated,
      confirmation: invitationDeletionConfirmation(),
      feedback: feedback("Invitation deleted", "success"),
    };

    expect(renderAccess(loading)).toContain("Loading access summary");
    expect(renderAccess(unauthorized)).toContain("Access unavailable");
    expect(renderAccess(failed)).toContain("Access could not be loaded");
    expect(renderAccess(empty)).toContain("No people");
    expect(renderAccess(empty)).toContain("No invitations");

    const html = renderAccess(populatedWithConfirmation, invitationAuthoring(false));
    expect(html.match(/<table/g)).toHaveLength(2);
    expect(html).toContain("Ada Lovelace");
    expect(html).toContain("Edit roles");
    expect(html).toContain("Remove person");
    expect(html).toContain("Delete invitation");
    expect(html).toContain("Delete invitation?");
    expect(html).not.toContain("raw-invitation-token");
  });

  it("renders unavailable person removal as a disabled button with its reason as a tooltip", () => {
    const populated = ready(fixtureManifest("populated-owner"));
    const person = required(populated.people[0]);
    if (person.removal.availability !== "available") {
      throw new Error("Expected the populated access fixture to allow person removal.");
    }
    const disabledReason = "The last active owner cannot be removed.";
    const manifest: AccessReadyContract = {
      ...populated,
      people: [
        {
          ...person,
          removal: {
            availability: "unavailable",
            control: {
              ...person.removal.action.control,
              disabled: true,
              disabledReason,
              errors: [disabledReason],
            },
            disabledReason,
          },
        },
      ],
    };
    const intents: AccessIntent[] = [];
    const { container, unmount } = render(
      <AstryxAccessRenderer
        manifest={manifest}
        onIntent={(intent) => {
          intents.push(intent);
        }}
      />,
    );
    const queries = within(container);
    const button = queries.getByRole("button", { name: "Remove person" });
    const tooltip = within(document.body).getByRole("tooltip", { hidden: true });

    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.getAttribute("aria-describedby")).toContain(tooltip.id);
    expect(tooltip.textContent).toBe(disabledReason);
    fireEvent.click(button);
    expect(intents).toEqual([]);
    unmount();
  });

  it("renders a flat controlled role selector and conditional acceptance target", () => {
    const base = invitationAuthoring(true);
    const acceptanceTarget = {
      ...base.fields.targetEmail,
      changeIntent: {
        ...base.fields.targetEmail.changeIntent,
        fieldId: "access:fixture:field:acceptance-target",
      },
      id: "access:fixture:field:acceptance-target",
      inputKind: "select" as const,
      label: "Continue to",
      options: [
        { id: "target:instance", label: "Instance", selected: true, value: "instance" },
        {
          id: "target:site",
          label: "Site",
          selected: false,
          value: "program",
        },
      ],
      purpose: "acceptance-target" as const,
      value: "instance",
    };
    const authoring: AccessInvitationAuthoringContract = {
      ...base,
      errors: ["Review the invitation."],
      fields: { ...base.fields, acceptanceTarget },
      roleSelection: {
        ...base.roleSelection,
        errors: ["Choose an available role."],
      },
    };
    const { container, unmount } = render(
      <ToastViewport isTopLayer={false}>
        <AstryxAccessInvitationAuthoring authoring={authoring} onIntent={() => undefined} />
      </ToastViewport>,
    );
    const queries = within(container);
    const roleSelector = queries.getByRole("combobox", { name: /^Roles/ });
    const targetSelector = queries.getByRole("combobox", { name: /^Continue to/ });
    const membershipSelector = queries.getByRole("combobox", { name: /^Memberships/ });

    expect(queries.getByRole("dialog", { name: "Invite collaborator" })).toHaveProperty(
      "open",
      true,
    );
    expect(roleSelector.textContent).toContain("Instance — Owner");
    expect(roleSelector.textContent).not.toContain("Instance — Administrator");
    expect(targetSelector.textContent).toContain("Instance");
    expect(membershipSelector).toBeTruthy();
    expect(container.textContent).toContain("Review the invitation.");
    expect(roleSelector.getAttribute("aria-invalid")).toBe("true");
    unmount();
  });

  it("dispatches one exact selected-set intent and person/destructive actions", () => {
    const authoring = invitationAuthoring(true);
    const personAuthoring = personRoleAuthoring();
    const manifest: AccessReadyContract = {
      ...ready(fixtureManifest("populated-owner")),
      confirmation: personRemovalConfirmation(),
      personAuthoring: accessFixturePersonAuthoringReference,
    };
    const intents: AccessIntent[] = [];
    const onIntent = (intent: AccessIntent) => {
      intents.push(intent);
    };
    const invitationRender = render(
      <AstryxAccessInvitationAuthoring authoring={authoring} onIntent={onIntent} />,
    );
    const personRender = render(
      <AstryxAccessPersonRoleAuthoring authoring={personAuthoring} onIntent={onIntent} />,
    );
    const accessRender = render(
      <AstryxAccessRenderer
        authoring={authoring}
        manifest={manifest}
        onIntent={onIntent}
        personAuthoring={personAuthoring}
      />,
    );

    const invitationQueries = within(invitationRender.container);
    fireEvent.click(invitationQueries.getByRole("combobox", { name: /^Roles/ }));
    fireEvent.click(invitationQueries.getByRole("option", { name: "Program — Editor" }));
    fireEvent.submit(required(invitationRender.container.querySelector("form")));

    fireEvent.submit(required(personRender.container.querySelector("form")));

    const confirmation = within(
      within(accessRender.container).getByRole("alertdialog", { name: "Remove person?" }),
    );
    fireEvent.click(confirmation.getByRole("button", { name: "Cancel" }));
    fireEvent.click(confirmation.getByRole("button", { name: "Remove person" }));

    expect(intents).toEqual([
      {
        ...authoring.roleSelection.changeIntent,
        selectedOptionIds: ["role:instance-owner", "role:program-editor"],
      },
      authoring.submit.intent,
      personAuthoring.save.intent,
      { ...required(manifest.confirmation).cancel.intent, open: false },
      required(manifest.confirmation).action.intent,
    ]);

    invitationRender.unmount();
    personRender.unmount();
    accessRender.unmount();
  });

  it("subscribes to manifest plus invitation and person authoring on one host", () => {
    const invitation = invitationAuthoring(true);
    const person = personRoleAuthoring();
    const manifest: AccessReadyContract = {
      ...ready(fixtureManifest("populated-owner")),
      personAuthoring: accessFixturePersonAuthoringReference,
    };
    const host = createMemoryPresentationHost({
      nodes: [
        { reference: accessFixtureReference, snapshot: manifest },
        { reference: accessFixtureAuthoringReference, snapshot: invitation },
        { reference: accessFixturePersonAuthoringReference, snapshot: person },
      ],
    });
    const html = renderToStaticMarkup(
      <PresentationHostProvider host={host}>
        <AstryxSubscribedAccessRenderer accessReference={accessFixtureReference} />
      </PresentationHostProvider>,
    );

    expect(html).toContain("Ada Lovelace");
    expect(html).toContain('value="invitee@example.com"');
    expect(html).toContain("Edit roles for Ada Lovelace");
  });
});

function fixtureManifest(id: ReturnType<typeof createFormlessAccessFixtures>[number]["id"]) {
  const fixture = createFormlessAccessFixtures().find((candidate) => candidate.id === id);
  if (!fixture) {
    throw new Error(`Missing fixture ${id}.`);
  }
  return fixture.state.manifest;
}

function renderAccess(
  manifest: AccessManifestContract,
  authoring?: AccessInvitationAuthoringContract,
) {
  return renderToStaticMarkup(
    <AstryxAccessRenderer authoring={authoring} manifest={manifest} onIntent={() => undefined} />,
  );
}

function invitationDeletionConfirmation(): AccessConfirmationContract {
  return {
    action: action("invitation-delete", "Delete invitation", {
      accessId: accessFixtureReference.accessId,
      actionId: "confirmation:action",
      confirmationId: "confirmation:delete",
      controlId: "confirmation:action-control",
      invitationId: "invitation:pending",
      type: "accessInvitationDelete",
    }),
    cancel: action("invitation-deletion-cancel", "Cancel", {
      accessId: accessFixtureReference.accessId,
      actionId: "confirmation:cancel",
      confirmationId: "confirmation:delete",
      controlId: "confirmation:cancel-control",
      invitationId: "invitation:pending",
      open: false,
      type: "accessInvitationDeletionConfirmationOpenChange",
    }),
    description: "The invitation will no longer be usable.",
    id: "confirmation:delete",
    invitationId: "invitation:pending",
    kind: "accessConfirmation",
    open: true,
    purpose: "invitation-deletion",
    title: "Delete invitation?",
  };
}

function personRemovalConfirmation(): AccessConfirmationContract {
  return {
    action: action("person-remove", "Remove person", {
      accessId: accessFixtureReference.accessId,
      actionId: "confirmation:action",
      confirmationId: "confirmation:remove",
      controlId: "confirmation:action-control",
      personId: "person:ada",
      type: "accessPersonRemove",
    }),
    cancel: action("person-removal-cancel", "Cancel", {
      accessId: accessFixtureReference.accessId,
      actionId: "confirmation:cancel",
      confirmationId: "confirmation:remove",
      controlId: "confirmation:cancel-control",
      open: false,
      personId: "person:ada",
      type: "accessPersonRemovalConfirmationOpenChange",
    }),
    description: "This person will lose access.",
    id: "confirmation:remove",
    kind: "accessConfirmation",
    open: true,
    personId: "person:ada",
    purpose: "person-removal",
    title: "Remove person?",
  };
}

function action<Intent extends AccessActionContract["intent"]>(
  purpose: AccessActionContract<Intent>["purpose"],
  label: string,
  intent: Intent,
): AccessActionContract<Intent> {
  return {
    control: button(intent.controlId, label),
    id: intent.actionId,
    intent,
    kind: "accessAction",
    purpose,
  };
}

function button(id: string, label: string): ButtonContract {
  return {
    accessibilityLabel: label,
    content: { kind: "label", label },
    density: "default",
    id,
    kind: "button",
    prominence: "secondary",
    type: "button",
  };
}

function feedback(title: string, intent: AccessFeedbackContract["intent"]) {
  return {
    detail: title,
    id: `feedback:${title}`,
    intent,
    kind: "accessFeedback" as const,
    title,
  };
}

function ready(manifest: AccessManifestContract): AccessReadyContract {
  if (manifest.state !== "ready") {
    throw new Error("Expected ready manifest.");
  }
  return manifest;
}

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new Error("Expected value.");
  }
  return value;
}
