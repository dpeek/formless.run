import { Heading, Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useState } from "react";
import type {
  CreateFieldContract,
  CreateSurfaceContract,
  DocumentThemeContract,
  DocumentThemeIntent,
  DocumentThemeReference,
  ShellIntent,
  ShellManifestReference,
  ShellNavigationSectionContract,
} from "@dpeek/formless-presentation/contract";
import {
  createMemoryPresentationHost,
  documentThemeReference,
  shellManifestReference,
  shellNavigationSectionReference,
  isDocumentThemeIntent,
  isShellIntent,
  type PresentationNodeSet,
  type MutablePresentationHost,
} from "@dpeek/formless-presentation/host";
import { PresentationHostProvider } from "@dpeek/formless-presentation/host/react";
import { AstryxApplicationSurfaceFrame } from "./application-surface-frame.tsx";
import {
  createFormlessApplicationShellFixtures,
  type FormlessApplicationShellFixture,
  type FormlessApplicationShellFixtureId,
  type FormlessApplicationShellFixtureState,
} from "./application-shell.fixtures.ts";
import {
  FormlessFixtureFrame,
  FormlessFixtureSelector,
  FormlessFixtureThemeToggle,
} from "./fixture-layout.tsx";
import { AstryxSubscribedApplicationShellRenderer } from "./shell.tsx";

export function FormlessApplicationShellLayout() {
  const [fixtures] = useState(createFormlessApplicationShellFixtureHosts);
  const [selectedFixtureId, setSelectedFixtureId] =
    useState<FormlessApplicationShellFixtureId>("product-instance");
  const selectedFixture = fixtures.find((fixture) => fixture.id === selectedFixtureId);

  if (!selectedFixture) {
    return null;
  }

  const routeChild = (
    <AstryxApplicationSurfaceFrame width="standard">
      <VStack gap={5} width="100%">
        <VStack gap={1}>
          <Heading level={1}>Application Shell</Heading>
          <Text color="secondary">{selectedFixture.routeLabel}</Text>
        </VStack>
      </VStack>
    </AstryxApplicationSurfaceFrame>
  );

  return (
    <FormlessFixtureFrame
      ariaLabel="Application shell fixtures"
      controls={
        <FormlessFixtureSelector
          label="Shell state"
          onSelectionChange={setSelectedFixtureId}
          options={fixtures}
          selectedId={selectedFixtureId}
        />
      }
    >
      <PresentationHostProvider host={selectedFixture.host}>
        {selectedFixture.shellReference ? (
          <AstryxSubscribedApplicationShellRenderer
            shellReference={selectedFixture.shellReference}
            themeControl={<FormlessFixtureThemeToggle />}
          >
            {routeChild}
          </AstryxSubscribedApplicationShellRenderer>
        ) : (
          routeChild
        )}
      </PresentationHostProvider>
    </FormlessFixtureFrame>
  );
}

export type FormlessApplicationShellFixtureHost = FormlessApplicationShellFixture & {
  getDocumentTheme(): DocumentThemeContract | null;
  getShell(): FormlessApplicationShellFixtureState | null;
  host: Omit<MutablePresentationHost, "dispatch"> & {
    dispatch(intent: DocumentThemeIntent | ShellIntent): void;
  };
  shellReference: ShellManifestReference | null;
  themeReference: DocumentThemeReference | null;
};

export function createFormlessApplicationShellFixtureHost(
  fixture: FormlessApplicationShellFixture,
): FormlessApplicationShellFixtureHost {
  let documentTheme = fixture.documentTheme;
  let shell = fixture.shell;
  const initialPublication = projectFormlessApplicationShellFixturePublication(
    shell,
    documentTheme,
  );
  let host: MutablePresentationHost;

  host = createMemoryPresentationHost({
    dispatch: (intent) => {
      if (isDocumentThemeIntent(intent)) {
        const nextDocumentTheme = applyFormlessApplicationShellFixtureThemeIntent(
          documentTheme,
          intent,
        );
        if (nextDocumentTheme === documentTheme) {
          return;
        }

        documentTheme = nextDocumentTheme;
      } else if (isShellIntent(intent)) {
        const nextShell = applyFormlessApplicationShellFixtureIntent(shell, intent);
        if (nextShell === shell) {
          return;
        }

        shell = nextShell;
      } else {
        throw new Error("Application shell fixture host received an unsupported intent.");
      }

      host.publish(projectFormlessApplicationShellFixturePublication(shell, documentTheme).nodes);
    },
    nodes: initialPublication.nodes,
  });

  return {
    ...fixture,
    getDocumentTheme: () => documentTheme,
    getShell: () => shell,
    host: host as FormlessApplicationShellFixtureHost["host"],
    shellReference: initialPublication.shellReference,
    themeReference: initialPublication.themeReference,
  };
}

export function projectFormlessApplicationShellFixturePublication(
  shell: FormlessApplicationShellFixtureState | null,
  documentTheme: DocumentThemeContract | null = null,
): {
  nodes: PresentationNodeSet;
  shellReference: ShellManifestReference | null;
  themeReference: DocumentThemeReference | null;
} {
  const shellReference = shell ? shellManifestReference(shell.manifest.id) : null;
  const themeReference = documentTheme ? documentThemeReference(documentTheme.id) : null;

  return {
    nodes: [
      ...(shellReference && shell
        ? [
            { reference: shellReference, snapshot: shell.manifest },
            ...shell.sections.map((section) => ({
              reference: shellNavigationSectionReference(shell.manifest.id, section.id),
              snapshot: section,
            })),
          ]
        : []),
      ...(themeReference && documentTheme
        ? [{ reference: themeReference, snapshot: documentTheme }]
        : []),
    ],
    shellReference,
    themeReference,
  };
}

export function applyFormlessApplicationShellFixtureThemeIntent(
  documentTheme: DocumentThemeContract | null,
  intent: DocumentThemeIntent,
): DocumentThemeContract | null {
  const control = documentTheme?.selectionControl;
  const option = control?.options.find(
    (candidate) =>
      candidate.mode === intent.mode &&
      candidate.selectionIntent.controlId === intent.controlId &&
      candidate.selectionIntent.themeId === intent.themeId,
  );

  if (!documentTheme || documentTheme.id !== intent.themeId || !control || !option) {
    return documentTheme;
  }

  return {
    ...documentTheme,
    activeMode: option.mode === "system" ? "dark" : option.mode,
    selectionControl: { ...control, selectedMode: option.mode },
  };
}

export function applyFormlessApplicationShellFixtureIntent(
  shell: FormlessApplicationShellFixtureState | null,
  intent: ShellIntent,
): FormlessApplicationShellFixtureState | null {
  if (!shell || shell.manifest.id !== intent.shellId) {
    return shell;
  }

  switch (intent.type) {
    case "shellRootRecordSelection":
      return applyRootSelection(shell, intent);
    case "shellCreate":
      return applyCreate(shell, intent);
    case "shellReset":
      return applyReset(shell, intent);
    case "shellLogout":
      return applyLogout(shell, intent);
  }
}

function createFormlessApplicationShellFixtureHosts() {
  return createFormlessApplicationShellFixtures().map(createFormlessApplicationShellFixtureHost);
}
function applyRootSelection(
  shell: FormlessApplicationShellFixtureState,
  intent: Extract<
    ShellIntent,
    {
      type: "shellRootRecordSelection";
    }
  >,
) {
  const section = shell.sections.find(
    (candidate) => candidate.id === intent.sectionId && candidate.role === "rootRecords",
  );
  const destination = section?.destinations.find(
    (candidate) =>
      candidate.kind === "shellRootRecordDestination" &&
      candidate.id === intent.destinationId &&
      candidate.recordId === intent.recordId,
  );

  if (!section || !destination || !destination.availability.available) {
    return shell;
  }

  const nextSection = {
    ...section,
    destinations: section.destinations.map((candidate) => ({
      ...candidate,
      selected: candidate.id === destination.id,
    })),
  };

  return replaceShellSection(shell, nextSection, {
    destinationId: destination.id,
    sectionId: section.id,
  });
}
function applyCreate(
  shell: FormlessApplicationShellFixtureState,
  intent: Extract<
    ShellIntent,
    {
      type: "shellCreate";
    }
  >,
) {
  const section = shell.sections.find(
    (candidate) =>
      candidate.id === intent.sectionId &&
      candidate.createSurface?.id === intent.surfaceId &&
      candidate.role === "rootRecords",
  );

  const createSurface = section?.createSurface;
  if (!section || !createSurface) {
    return shell;
  }

  if ("fieldId" in intent) {
    if (intent.intent.type !== "createDraftChange") {
      return shell;
    }
    const nextSurface = applyCreateDraft(
      createSurface,
      intent.fieldId,
      intent.intent.fieldName,
      intent.intent.fieldValue,
    );
    return nextSurface === createSurface
      ? shell
      : replaceShellSection(shell, withCreateSurface(section, nextSurface));
  }

  if (intent.intent.type === "createOpenChange") {
    const nextSection = withCreateSurface(section, {
      ...createSurface,
      dialog: { ...createSurface.dialog, open: intent.intent.open },
    });
    return replaceShellSection(shell, nextSection);
  }

  return submitCreate(shell, section, createSurface);
}

function applyCreateDraft(
  surface: CreateSurfaceContract,
  fieldId: string,
  fieldName: string,
  draftInput: NonNullable<CreateFieldContract["draftInput"]>,
): CreateSurfaceContract {
  const target = surface.dialog.form.fieldSet.fields.find(
    (field) => field.fieldId === fieldId && field.fieldName === fieldName,
  );
  if (!target) {
    return surface;
  }

  const fields = surface.dialog.form.fieldSet.fields.map((field) =>
    field.fieldId === target.fieldId
      ? {
          ...field,
          draftInput,
          value: typeof draftInput.value === "string" ? draftInput.value : field.value,
        }
      : field,
  );
  const title = createTitle(fields);
  const errors = title ? [] : [`${surface.dialog.title.replace(/^Create /, "")} name is required.`];

  return {
    ...surface,
    dialog: {
      ...surface.dialog,
      form: {
        ...surface.dialog.form,
        errors,
        fieldSet: { ...surface.dialog.form.fieldSet, fields },
        submit: { ...surface.dialog.form.submit, disabled: !title },
      },
    },
  };
}

function submitCreate(
  shell: FormlessApplicationShellFixtureState,
  section: ShellNavigationSectionContract,
  createSurface: CreateSurfaceContract,
): FormlessApplicationShellFixtureState {
  const title = createTitle(createSurface.dialog.form.fieldSet.fields);

  if (!title) {
    const titleField = createSurface.dialog.form.fieldSet.fields.find(
      (field) => field.fieldName === "title",
    );
    if (!titleField) {
      return shell;
    }
    const nextSurface = applyCreateDraft(createSurface, titleField.fieldId, "title", {
      kind: "input",
      value: "",
    });
    return replaceShellSection(shell, withCreateSurface(section, nextSurface));
  }

  const createdIndex =
    section.destinations.filter((destination) => destination.id.startsWith("root:fixture-created-"))
      .length + 1;
  const recordId = `fixture-created-${createdIndex}`;
  const destinationId = `root:${recordId}`;
  const nextSurface = resetCreateSurface(createSurface);
  const nextSection = withCreateSurface(
    {
      ...section,
      destinations: [
        ...section.destinations.map((destination) => ({ ...destination, selected: false })),
        {
          accessibilityLabel: title,
          availability: { available: true },
          countText: "0",
          id: destinationId,
          kind: "shellRootRecordDestination",
          label: title,
          recordId,
          selected: true,
          selectionIntent: {
            destinationId,
            recordId,
            sectionId: section.id,
            shellId: shell.manifest.id,
            type: "shellRootRecordSelection",
          },
        },
      ],
    },
    { ...nextSurface, dialog: { ...nextSurface.dialog, open: false } },
  );

  return replaceShellSection(shell, nextSection, {
    destinationId,
    sectionId: section.id,
  });
}

function resetCreateSurface(surface: CreateSurfaceContract): CreateSurfaceContract {
  return {
    ...surface,
    dialog: {
      ...surface.dialog,
      form: {
        ...surface.dialog.form,
        errors: [],
        fieldSet: {
          ...surface.dialog.form.fieldSet,
          fields: surface.dialog.form.fieldSet.fields.map((field) => ({
            ...field,
            draftInput: { kind: "input", value: "" },
            value: "",
          })),
        },
        submit: { ...surface.dialog.form.submit, disabled: true },
      },
    },
  };
}
function applyReset(
  shell: FormlessApplicationShellFixtureState,
  intent: Extract<
    ShellIntent,
    {
      type: "shellReset";
    }
  >,
) {
  const section = shell.sections.find(
    (candidate) =>
      candidate.id === intent.sectionId && candidate.settings?.reset?.id === intent.controlId,
  );
  const reset = section?.settings?.reset;

  if (!section?.settings || !reset) {
    return shell;
  }

  const nextReset =
    intent.intent.type === "resetOpenChange"
      ? {
          ...reset,
          confirmation: { ...reset.confirmation, open: intent.intent.open },
        }
      : {
          ...reset,
          confirmation: { ...reset.confirmation, open: false },
          status: { message: "Source seed data reset.", state: "success" as const },
        };

  return replaceShellSection(shell, {
    ...section,
    settings: { ...section.settings, reset: nextReset },
  });
}
function applyLogout(
  shell: FormlessApplicationShellFixtureState,
  intent: Extract<
    ShellIntent,
    {
      type: "shellLogout";
    }
  >,
) {
  const section = shell.sections.find(
    (candidate) =>
      candidate.id === intent.sectionId &&
      candidate.session?.state === "authenticated" &&
      candidate.session.logout.id === intent.controlId,
  );

  if (!section?.session) {
    return shell;
  }

  return replaceShellSection(shell, {
    ...section,
    session: { id: section.session.id, kind: "shellSession", state: "anonymous" },
  });
}

function withCreateSurface(
  section: ShellNavigationSectionContract,
  createSurface: CreateSurfaceContract,
) {
  return { ...section, createSurface };
}

function createTitle(fields: readonly CreateFieldContract[]) {
  const draftInput = fields.find((field) => field.fieldName === "title")?.draftInput;
  const value = draftInput?.value;
  return typeof value === "string" ? value.trim() : "";
}

function replaceShellSection(
  shell: FormlessApplicationShellFixtureState,
  nextSection: ShellNavigationSectionContract,
  activeDestination = shell.manifest.activeDestination,
): FormlessApplicationShellFixtureState {
  return {
    manifest:
      activeDestination === shell.manifest.activeDestination
        ? shell.manifest
        : { ...shell.manifest, activeDestination },
    sections: shell.sections.map((section) =>
      section.id === nextSection.id ? nextSection : section,
    ),
  };
}
