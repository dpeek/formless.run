import { useState } from "react";
import { Heading } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type {
  ContextResultReference,
  CreateSurfaceContract,
  CreateFieldContract,
  ListContract,
  MainResultReference,
  OperationControlContract,
  OperationPresentationIntent,
  RecordResultContract,
  SelectedDetailResultReference,
  TableActionGroupContract,
  WorkspaceCollectionActionGroupContract,
  WorkspaceCollectionContract,
  WorkspaceCollectionPresentationContract,
  WorkspaceCollectionShellContract,
  WorkspaceContextContract,
  WorkspaceIntent,
  WorkspaceManifestReference,
  WorkspaceResultContract,
  WorkspaceSectionContract,
  WorkspaceSectionShellReference,
  WorkspaceSelectedRecordSectionContract,
  WorkspaceSelectedRecordSectionShellContract,
} from "@dpeek/formless-presentation/contract";
import {
  createMemoryPresentationHost,
  listResultReference,
  recordResultReference,
  tableResultReference,
  treeResultReference,
  workspaceManifestReference,
  workspaceSectionShellReference,
  isWorkspaceIntent,
  type PresentationNode,
  type PresentationNodeSet,
  type MutablePresentationHost,
} from "@dpeek/formless-presentation/host";
import { PresentationHostProvider } from "@dpeek/formless-presentation/host/react";
import { AstryxSubscribedWorkspaceSurfaceFrame } from "./application-surface-frame.tsx";
import { applyScenarioFieldIntent } from "./fields/fixture-helpers.ts";
import { FormlessFixtureFrame, FormlessFixtureSelector } from "./fixture-layout.tsx";
import { AstryxSubscribedWorkspaceScreenRenderer } from "./workspace-screen-renderer.tsx";
import {
  createFormlessGeneratedWorkspaceFixtures,
  selectFormlessGeneratedWorkspaceRecord,
  type FormlessGeneratedWorkspaceFixture,
  type FormlessGeneratedWorkspaceFixtureId,
} from "./generated-workspace.fixtures.ts";
import { applyListFieldIntent, applyListIntent } from "./lists.tsx";
import { applyTableFieldIntent, applyTableIntent } from "./tables.tsx";
import { applyTreeResultFixtureIntent } from "./tree-results.tsx";

export function FormlessGeneratedWorkspaceLayout() {
  const [fixtures] = useState(createFormlessGeneratedWorkspaceHosts);
  const [selectedFixtureId, setSelectedFixtureId] =
    useState<FormlessGeneratedWorkspaceFixtureId>("tasks");
  const selectedFixture = fixtures.find((fixture) => fixture.id === selectedFixtureId);

  return (
    <FormlessFixtureFrame
      ariaLabel="Generated workspace fixtures"
      controls={
        <FormlessFixtureSelector
          label="Workspace state"
          onSelectionChange={setSelectedFixtureId}
          options={fixtures}
          selectedId={selectedFixtureId}
        />
      }
    >
      <main>
        {selectedFixture ? (
          <PresentationHostProvider host={selectedFixture.host}>
            <AstryxSubscribedWorkspaceSurfaceFrame reference={selectedFixture.workspaceReference}>
              <VStack gap={5} width="100%">
                <Heading level={1}>Generated Workspace</Heading>

                <AstryxSubscribedWorkspaceScreenRenderer
                  reference={selectedFixture.workspaceReference}
                />
              </VStack>
            </AstryxSubscribedWorkspaceSurfaceFrame>
          </PresentationHostProvider>
        ) : null}
      </main>
    </FormlessFixtureFrame>
  );
}

export type FormlessGeneratedWorkspaceFixtureHost = {
  getWorkspace(): FormlessGeneratedWorkspaceFixture["workspace"];
  host: Omit<MutablePresentationHost, "dispatch"> & {
    dispatch(intent: WorkspaceIntent): void;
  };
  workspaceReference: WorkspaceManifestReference;
};

export function createFormlessGeneratedWorkspaceFixtureHost(
  initialWorkspace: FormlessGeneratedWorkspaceFixture["workspace"],
): FormlessGeneratedWorkspaceFixtureHost {
  let workspace = initialWorkspace;
  const initialPublication = projectGeneratedWorkspaceFixturePublication(workspace);
  let host: MutablePresentationHost;

  host = createMemoryPresentationHost({
    dispatch: (intent) => {
      if (!isWorkspaceIntent(intent)) {
        throw new Error("Generated workspace fixture host received a shell intent.");
      }
      const nextWorkspace = applyGeneratedWorkspaceIntent(workspace, intent);
      if (nextWorkspace === workspace) {
        return;
      }

      workspace = nextWorkspace;
      host.publish(projectGeneratedWorkspaceFixturePublication(workspace).nodes);
    },
    nodes: initialPublication.nodes,
  });

  return {
    getWorkspace: () => workspace,
    host: host as FormlessGeneratedWorkspaceFixtureHost["host"],
    workspaceReference: initialPublication.workspaceReference,
  };
}

export function projectGeneratedWorkspaceFixturePublication(
  workspace: FormlessGeneratedWorkspaceFixture["workspace"],
): {
  nodes: PresentationNodeSet;
  workspaceReference: WorkspaceManifestReference;
} {
  const workspaceReference = workspaceManifestReference(workspace.id);
  const sections = workspace.sections.map((section) =>
    projectGeneratedWorkspaceFixtureSection(workspaceReference.workspaceId, section),
  );

  return {
    nodes: [
      {
        reference: workspaceReference,
        snapshot: {
          accessibilityLabel: workspace.accessibilityLabel,
          actions: workspace.actions,
          id: workspace.id,
          kind: "workspaceManifest",
          label: workspace.label,
          sections: sections.map(({ reference }) => reference),
          ...(workspace.surface === "full"
            ? { surface: workspace.surface }
            : { surface: workspace.surface, width: workspace.width }),
        },
      },
      ...sections.flatMap(({ nodes }) => nodes),
    ],
    workspaceReference,
  };
}

function createFormlessGeneratedWorkspaceHosts() {
  return createFormlessGeneratedWorkspaceFixtures().map(({ id, label, workspace }) => ({
    id,
    label,
    ...createFormlessGeneratedWorkspaceFixtureHost(workspace),
  }));
}

function projectGeneratedWorkspaceFixtureSection(
  workspaceId: string,
  section: WorkspaceSectionContract,
): {
  nodes: PresentationNodeSet;
  reference: WorkspaceSectionShellReference;
} {
  const reference = workspaceSectionShellReference(workspaceId, section.id);
  const collectionPresentation = section.collection.presentation;
  const { contextDetail, result } = collectionPresentation;
  const mainResult = projectGeneratedWorkspaceFixtureMainResult(workspaceId, section.id, result);
  const contextResult = contextDetail
    ? projectGeneratedWorkspaceFixtureContextResult(workspaceId, section.id, contextDetail)
    : undefined;
  const selectedDetailResults =
    collectionPresentation.kind === "selectedRecord"
      ? collectionPresentation.sections.map((detailSection) =>
          projectGeneratedWorkspaceFixtureSelectedDetailResult(
            workspaceId,
            section.id,
            detailSection,
          ),
        )
      : [];
  let presentation: WorkspaceCollectionShellContract["presentation"];
  if (collectionPresentation.kind === "selectedRecord") {
    if (mainResult.reference.kind !== "listResultReference") {
      throw new Error("Selected-record workspace fixtures require a main list result reference.");
    }
    const {
      contextDetail: sourceContextDetail,
      result: sourceResult,
      sections: sourceSections,
      ...selectedRecordPresentation
    } = collectionPresentation;
    void sourceContextDetail;
    void sourceResult;
    void sourceSections;
    presentation = {
      ...selectedRecordPresentation,
      ...(contextResult === undefined ? {} : { contextDetail: contextResult.reference }),
      result: mainResult.reference,
      sections: selectedDetailResults.map(({ section: detailSection }) => detailSection),
    };
  } else {
    const {
      contextDetail: sourceContextDetail,
      result: sourceResult,
      ...ordinaryPresentation
    } = collectionPresentation;
    void sourceContextDetail;
    void sourceResult;
    presentation = {
      ...ordinaryPresentation,
      ...(contextResult === undefined ? {} : { contextDetail: contextResult.reference }),
      result: mainResult.reference,
    };
  }

  return {
    nodes: [
      {
        reference,
        snapshot: {
          accessibilityLabel: section.accessibilityLabel,
          actions: section.actions,
          collection: {
            ...section.collection,
            presentation,
          },
          headingVisibility: section.headingVisibility,
          id: section.id,
          kind: "workspaceSectionShell",
          label: section.label,
        },
      },
      mainResult.node,
      ...(contextResult === undefined ? [] : [contextResult.node]),
      ...selectedDetailResults.map(({ node }) => node),
    ],
    reference,
  };
}

function projectGeneratedWorkspaceFixtureSelectedDetailResult(
  workspaceId: string,
  sectionId: string,
  detailSection: WorkspaceSelectedRecordSectionContract,
): {
  node: PresentationNode;
  reference: SelectedDetailResultReference;
  section: WorkspaceSelectedRecordSectionShellContract;
} {
  if (detailSection.kind === "selectedRecordRecordSection") {
    const reference = recordResultReference({
      resultId: detailSection.result.id,
      role: "selectedDetailResult",
      sectionId,
      workspaceId,
    });
    return {
      node: { reference, snapshot: detailSection.result },
      reference,
      section: { ...detailSection, result: reference },
    };
  }

  const reference = tableResultReference({
    resultId: detailSection.result.id,
    role: "selectedDetailResult",
    sectionId,
    workspaceId,
  });
  return {
    node: { reference, snapshot: detailSection.result },
    reference,
    section: { ...detailSection, result: reference },
  };
}

function projectGeneratedWorkspaceFixtureMainResult(
  workspaceId: string,
  sectionId: string,
  result: WorkspaceResultContract,
): {
  node: PresentationNode;
  reference: MainResultReference;
} {
  switch (result.kind) {
    case "list": {
      const reference = listResultReference({
        resultId: result.id,
        role: "mainResult",
        sectionId,
        workspaceId,
      });
      return { node: { reference, snapshot: result }, reference };
    }
    case "recordResult": {
      const reference = recordResultReference({
        resultId: result.id,
        role: "mainResult",
        sectionId,
        workspaceId,
      });
      return { node: { reference, snapshot: result }, reference };
    }
    case "table": {
      const reference = tableResultReference({
        resultId: result.id,
        role: "mainResult",
        sectionId,
        workspaceId,
      });
      return { node: { reference, snapshot: result }, reference };
    }
    case "treeResult": {
      const reference = treeResultReference({
        resultId: result.id,
        role: "mainResult",
        sectionId,
        workspaceId,
      });
      return { node: { reference, snapshot: result }, reference };
    }
  }
}

function projectGeneratedWorkspaceFixtureContextResult(
  workspaceId: string,
  sectionId: string,
  result: RecordResultContract,
): {
  node: PresentationNode;
  reference: ContextResultReference;
} {
  const reference = recordResultReference({
    resultId: result.id,
    role: "contextResult",
    sectionId,
    workspaceId,
  });
  return { node: { reference, snapshot: result }, reference };
}

export function applyGeneratedWorkspaceIntent(
  workspace: FormlessGeneratedWorkspaceFixture["workspace"],
  intent: WorkspaceIntent,
): FormlessGeneratedWorkspaceFixture["workspace"] {
  if (intent.screenId !== workspace.id) {
    return workspace;
  }

  let matched = false;
  const sections = workspace.sections.map((section) => {
    if (section.id !== intent.sectionId || section.collection.id !== intent.collectionId) {
      return section;
    }

    matched = true;
    if (intent.type === "workspaceExternalAction") {
      return {
        ...section,
        actions: section.actions.map((externalAction) =>
          externalAction.id === intent.actionId &&
          externalAction.action.id === intent.controlId &&
          intent.intent.controlId === intent.controlId
            ? {
                ...externalAction,
                action: { ...externalAction.action, selected: true },
              }
            : externalAction,
        ),
      };
    }

    return {
      ...section,
      collection: applyCollectionIntent(section.collection, intent),
    };
  });

  return matched ? { ...workspace, sections } : workspace;
}

export function selectedGeneratedWorkspaceFixture(
  fixtures: readonly FormlessGeneratedWorkspaceFixture[],
  id: FormlessGeneratedWorkspaceFixtureId,
) {
  return fixtures.find((fixture) => fixture.id === id);
}
function applyCollectionIntent(
  collection: WorkspaceCollectionContract,
  intent: Exclude<
    WorkspaceIntent,
    {
      type: "workspaceExternalAction";
    }
  >,
): WorkspaceCollectionContract {
  if (intent.type === "workspaceSelectedRecordSelection") {
    const presentation = collection.presentation;
    return presentation.kind === "selectedRecord" &&
      presentation.selectionIntents.some(
        (selectionIntent) => selectionIntent.recordId === intent.recordId,
      )
      ? selectFormlessGeneratedWorkspaceRecord(collection, intent.recordId)
      : collection;
  }

  if (intent.type === "workspaceSelectedRecordBack") {
    const presentation = collection.presentation;
    return presentation.kind === "selectedRecord" &&
      presentation.backIntent?.recordId === intent.recordId
      ? selectFormlessGeneratedWorkspaceRecord(collection, null)
      : collection;
  }

  if (intent.type === "workspaceQuerySelection") {
    const navigation = collection.presentation.queryNavigation;
    if (!navigation?.items.some((item) => item.id === intent.queryId)) {
      return collection;
    }

    return {
      ...collection,
      presentation: withQueryNavigation(collection.presentation, {
        ...navigation,
        items: navigation.items.map((item) => ({
          ...item,
          selected: item.id === intent.queryId,
        })),
      }),
      selectedQueryId: intent.queryId,
    };
  }

  if (intent.type === "workspaceContextSelection") {
    return {
      ...collection,
      presentation: withSelectedContext(
        collection.presentation,
        intent.contextId,
        intent.contextOptionId,
      ),
    };
  }

  if (intent.type === "workspaceCreate") {
    return {
      ...collection,
      presentation: mapCreateSurfaces(collection.presentation, intent.surfaceId, (surface) => {
        if (intent.intent.surfaceId !== surface.id) {
          return surface;
        }

        return {
          ...surface,
          dialog: {
            ...surface.dialog,
            open: intent.intent.type === "createOpenChange" ? intent.intent.open : false,
          },
        };
      }),
    };
  }

  if (intent.type === "workspaceField") {
    if (intent.surfaceId !== undefined) {
      return {
        ...collection,
        presentation: mapCreateSurfaces(collection.presentation, intent.surfaceId, (surface) => ({
          ...surface,
          dialog: {
            ...surface.dialog,
            form: {
              ...surface.dialog.form,
              fieldSet: {
                ...surface.dialog.form.fieldSet,
                fields: surface.dialog.form.fieldSet.fields.map((field) =>
                  field.fieldId === intent.fieldId
                    ? (applyScenarioFieldIntent(field, intent.intent) as CreateFieldContract)
                    : field,
                ),
              },
            },
          },
        })),
      };
    }

    return {
      ...collection,
      presentation: mapWorkspaceResults(collection.presentation, intent.resultId, (result) =>
        applyWorkspaceResultFieldIntent(result, intent.fieldId, intent.recordId, intent.intent),
      ),
    };
  }

  if (intent.type === "workspaceOperation") {
    const presentation = mapPresentationOperation(
      collection.presentation,
      intent.controlId,
      intent.intent,
    );

    return {
      ...collection,
      presentation: mapWorkspaceResults(presentation, intent.resultId, (result) =>
        mapResultOperation(result, intent.controlId, intent.intent),
      ),
    };
  }

  if (intent.type === "workspaceList") {
    return {
      ...collection,
      presentation: mapWorkspaceResults(collection.presentation, intent.resultId, (result) =>
        result.kind === "list" ? applyListIntent(result, intent.intent) : result,
      ),
    };
  }

  if (intent.type === "workspaceTable") {
    return {
      ...collection,
      presentation: mapWorkspaceResults(collection.presentation, intent.resultId, (result) =>
        result.kind === "table" ? applyTableIntent(result, intent.intent) : result,
      ),
    };
  }

  if (intent.type === "workspaceTree") {
    return {
      ...collection,
      presentation: mapWorkspaceResults(collection.presentation, intent.resultId, (result) =>
        result.kind === "treeResult" ? applyTreeResultFixtureIntent(result, intent.intent) : result,
      ),
    };
  }

  return intent.type === "workspaceRecordResult"
    ? {
        ...collection,
        presentation: mapWorkspaceResults(collection.presentation, intent.resultId, (result) =>
          result.kind === "recordResult" ? applyRecordResultIntent(result, intent.intent) : result,
        ),
      }
    : collection;
}

function withQueryNavigation(
  presentation: WorkspaceCollectionPresentationContract,
  queryNavigation: NonNullable<WorkspaceCollectionPresentationContract["queryNavigation"]>,
): WorkspaceCollectionPresentationContract {
  return { ...presentation, queryNavigation };
}

function withSelectedContext(
  presentation: WorkspaceCollectionPresentationContract,
  contextId: string,
  optionId: string,
): WorkspaceCollectionPresentationContract {
  if (presentation.kind === "listDetail") {
    return {
      ...presentation,
      selector: selectContextOption(presentation.selector, contextId, optionId),
    };
  }

  return presentation.context
    ? {
        ...presentation,
        context: selectContextOption(presentation.context, contextId, optionId),
      }
    : presentation;
}
function selectContextOption<P extends WorkspaceContextContract["presentation"]>(
  context: WorkspaceContextContract & {
    presentation: P;
  },
  contextId: string,
  optionId: string,
): WorkspaceContextContract & {
  presentation: P;
} {
  if (
    context.id !== contextId ||
    !context.options.some((option) => option.id === optionId && option.availability.available)
  ) {
    return context;
  }

  return {
    ...context,
    options: context.options.map((option) => ({ ...option, selected: option.id === optionId })),
    selectedOptionId: optionId,
  };
}

function mapCreateSurfaces(
  presentation: WorkspaceCollectionPresentationContract,
  surfaceId: string,
  update: (surface: CreateSurfaceContract) => CreateSurfaceContract,
): WorkspaceCollectionPresentationContract {
  const actions = mapCollectionCreateSurface(presentation.actions, surfaceId, update);

  if (presentation.kind === "listDetail") {
    return {
      ...presentation,
      actions,
      selector: mapContextCreateSurface(presentation.selector, surfaceId, update),
    };
  }

  return {
    ...presentation,
    actions,
    ...(presentation.context === undefined
      ? {}
      : { context: mapContextCreateSurface(presentation.context, surfaceId, update) }),
  };
}

function mapCollectionCreateSurface(
  actions: WorkspaceCollectionActionGroupContract,
  surfaceId: string,
  update: (surface: CreateSurfaceContract) => CreateSurfaceContract,
): WorkspaceCollectionActionGroupContract {
  const mapAction = (action: WorkspaceCollectionActionGroupContract["primary"][number]) =>
    action.kind === "createAction" && action.surface.id === surfaceId
      ? { ...action, surface: update(action.surface) }
      : action;

  return {
    ...actions,
    primary: actions.primary.map(mapAction),
    secondary: actions.secondary.map(mapAction),
  };
}
function mapContextCreateSurface<P extends WorkspaceContextContract["presentation"]>(
  context: WorkspaceContextContract & {
    presentation: P;
  },
  surfaceId: string,
  update: (surface: CreateSurfaceContract) => CreateSurfaceContract,
): WorkspaceContextContract & {
  presentation: P;
} {
  return context.createAction?.surface.id === surfaceId
    ? {
        ...context,
        createAction: { ...context.createAction, surface: update(context.createAction.surface) },
      }
    : context;
}

function mapWorkspaceResults(
  presentation: WorkspaceCollectionPresentationContract,
  resultId: string | undefined,
  update: (result: WorkspaceResultContract) => WorkspaceResultContract,
): WorkspaceCollectionPresentationContract {
  if (resultId === undefined) {
    return presentation;
  }

  const result =
    presentation.result.id === resultId ? update(presentation.result) : presentation.result;
  const contextDetail =
    presentation.contextDetail?.id === resultId
      ? (update(presentation.contextDetail) as RecordResultContract)
      : presentation.contextDetail;

  if (presentation.kind === "selectedRecord") {
    const mainResult = result.kind === "list" ? result : presentation.result;
    const sections = presentation.sections.map((section) => {
      if (section.result.id !== resultId) {
        return section;
      }
      const nextResult = update(section.result);
      if (
        (section.kind === "selectedRecordRecordSection" && nextResult.kind === "recordResult") ||
        (section.kind === "selectedRecordRelationshipSection" && nextResult.kind === "table")
      ) {
        return { ...section, result: nextResult } as typeof section;
      }
      return section;
    });

    return {
      ...presentation,
      ...(contextDetail === undefined ? {} : { contextDetail }),
      result: mainResult,
      sections,
    };
  }

  return {
    ...presentation,
    ...(contextDetail === undefined ? {} : { contextDetail }),
    result,
  };
}

function applyWorkspaceResultFieldIntent(
  result: WorkspaceResultContract,
  fieldId: string,
  recordId: string | undefined,
  intent: Extract<
    WorkspaceIntent,
    {
      type: "workspaceField";
    }
  >["intent"],
): WorkspaceResultContract {
  if (result.kind === "list") {
    const sourceItem = result.items.find((item) => item.id === recordId);
    const sourceField =
      sourceItem?.presentation === "fields"
        ? sourceItem.fields.find((field) => field.fieldId === fieldId)
        : undefined;

    return sourceField ? applyListFieldIntent(result, recordId ?? "", sourceField, intent) : result;
  }

  if (result.kind === "table") {
    return applyTableFieldIntent(result, fieldId, intent);
  }

  return result;
}

function mapCollectionOperation(
  actions: WorkspaceCollectionActionGroupContract,
  controlId: string,
  intent: OperationPresentationIntent,
): WorkspaceCollectionActionGroupContract {
  const mapAction = (action: WorkspaceCollectionActionGroupContract["primary"][number]) =>
    action.kind === "operationAction" && action.control.id === controlId
      ? { ...action, control: applyFixtureOperationIntent(action.control, intent) }
      : action;

  return {
    ...actions,
    primary: actions.primary.map(mapAction),
    secondary: actions.secondary.map(mapAction),
  };
}

function mapPresentationOperation(
  presentation: WorkspaceCollectionPresentationContract,
  controlId: string,
  intent: OperationPresentationIntent,
): WorkspaceCollectionPresentationContract {
  const actions = mapCollectionOperation(presentation.actions, controlId, intent);
  if (presentation.kind !== "selectedRecord") {
    return { ...presentation, actions };
  }

  return {
    ...presentation,
    actions,
    sections: presentation.sections.map((section) =>
      section.kind === "selectedRecordRelationshipSection"
        ? {
            ...section,
            headingOperations: section.headingOperations.map((control) =>
              control.id === controlId ? applyFixtureOperationIntent(control, intent) : control,
            ),
          }
        : section,
    ),
  };
}

function mapResultOperation(
  result: WorkspaceResultContract,
  controlId: string,
  intent: OperationPresentationIntent,
): WorkspaceResultContract {
  if (result.kind === "list") {
    return {
      ...result,
      items: result.items.map((item) =>
        item.presentation === "summary"
          ? item
          : {
              ...item,
              actions: mapListActionGroup(item.actions, controlId, intent),
            },
      ),
    };
  }

  if (result.kind === "table") {
    return {
      ...result,
      rows: result.rows.map((row) => ({
        ...row,
        cells: row.cells.map((cell) => ({
          ...cell,
          contents: cell.contents.map((content) =>
            content.kind === "actionGroup"
              ? mapTableActionGroup(content, controlId, intent)
              : content,
          ),
        })),
      })),
    };
  }

  return result.kind === "recordResult"
    ? mapRecordResultOperation(result, controlId, intent)
    : result;
}

function mapListActionGroup(
  actions: Extract<ListContract["items"][number], { presentation: "fields" }>["actions"],
  controlId: string,
  intent: OperationPresentationIntent,
) {
  const mapAction = (action: (typeof actions.primary)[number]) =>
    action.control.id === controlId
      ? { ...action, control: applyFixtureOperationIntent(action.control, intent) }
      : action;

  return {
    ...actions,
    primary: actions.primary.map(mapAction),
    secondary: actions.secondary.map(mapAction),
  };
}

function mapTableActionGroup(
  actions: TableActionGroupContract,
  controlId: string,
  intent: OperationPresentationIntent,
) {
  const mapAction = (action: (typeof actions.primary)[number]) =>
    action.kind === "operationAction" && action.control.id === controlId
      ? { ...action, control: applyFixtureOperationIntent(action.control, intent) }
      : action;

  return {
    ...actions,
    primary: actions.primary.map(mapAction),
    secondary: actions.secondary.map(mapAction),
  };
}

function mapRecordResultOperation(
  result: RecordResultContract,
  controlId: string,
  intent: OperationPresentationIntent,
): RecordResultContract {
  const mapAction = (action: RecordResultContract["actions"]["primary"][number]) =>
    action.control.id === controlId
      ? { ...action, control: applyFixtureOperationIntent(action.control, intent) }
      : action;

  return {
    ...result,
    actions: {
      ...result.actions,
      primary: result.actions.primary.map(mapAction),
      secondary: result.actions.secondary.map(mapAction),
    },
  };
}
function applyRecordResultIntent(
  result: RecordResultContract,
  intent: Extract<
    WorkspaceIntent,
    {
      type: "workspaceRecordResult";
    }
  >["intent"],
): RecordResultContract {
  if (intent.resultId !== result.id || intent.recordId !== result.selectedRecord?.id) {
    return result;
  }

  if (intent.type === "recordResultFieldIntent") {
    return {
      ...result,
      fields: result.fields.map((field) =>
        field.fieldId === intent.fieldId ? applyScenarioFieldIntent(field, intent.intent) : field,
      ),
    };
  }

  return mapRecordResultOperation(result, intent.controlId, intent.intent);
}

function applyFixtureOperationIntent(
  control: OperationControlContract,
  intent: OperationPresentationIntent,
): OperationControlContract {
  if (intent.controlId !== control.id) {
    return control;
  }

  if (intent.type === "operationConfirmationOpenChange") {
    return control.confirmation
      ? {
          ...control,
          confirmation: { ...control.confirmation, open: intent.open },
        }
      : control;
  }

  const label =
    control.trigger.content.kind === "iconOnly"
      ? control.trigger.accessibilityLabel
      : control.trigger.content.label;
  const completion = `${label} complete`;

  return {
    ...control,
    ...(control.confirmation === undefined
      ? {}
      : { confirmation: { ...control.confirmation, open: false } }),
    feedback: {
      detail: "Prototype intent handled.",
      id: `${control.id}:fixture:committed`,
      intent: "success",
      kind: "operationFeedbackEvent",
      status: "committed",
      title: completion,
    },
    status: {
      ...control.status,
      accessibilityLabel: completion,
      detail: "Prototype intent handled.",
      intent: "success",
      label: completion,
      status: "committed",
    },
  };
}
