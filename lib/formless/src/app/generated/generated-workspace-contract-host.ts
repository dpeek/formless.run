import { useLayoutEffect, useRef, useState } from "react";
import type {
  PresentationIntent,
  ContextResultReference,
  MainResultReference,
  RecordResultContract,
  SelectedDetailReference,
  WorkspaceContract,
  WorkspaceCollectionShellContract,
  WorkspaceIntentHandler,
  WorkspaceManifestReference,
  WorkspaceSectionContract,
  WorkspaceSectionShellReference,
  WorkspaceSelectedRecordSectionContract,
  WorkspaceSelectedRecordSectionShellContract,
} from "@dpeek/formless-presentation/contract";
import {
  createMemoryPresentationHost,
  listResultReference,
  recordResultReference,
  relationshipHierarchyReference,
  tableResultReference,
  treeResultReference,
  workspaceManifestReference,
  workspaceSectionShellReference,
  isWorkspaceIntent,
  type PresentationNode,
  type PresentationNodeSet,
  type MutablePresentationHost,
} from "@dpeek/formless-presentation/host";
import type { ApplicationRuntimeContractPublication } from "./application-runtime-contract-host.tsx";

export type GeneratedWorkspaceContractHostPublication = {
  nodes: PresentationNodeSet;
  workspaceReference: WorkspaceManifestReference;
};

export type GeneratedWorkspaceRuntimePublication = GeneratedWorkspaceContractHostPublication &
  ApplicationRuntimeContractPublication;

export function projectGeneratedWorkspaceContractHostPublication(
  workspace: WorkspaceContract,
): GeneratedWorkspaceContractHostPublication {
  const workspaceReference = workspaceManifestReference(workspace.id);
  const sectionPublications = workspace.sections.map((section) =>
    projectSection(workspaceReference.workspaceId, section),
  );
  const sectionReferences = sectionPublications.map(({ reference }) => reference);

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
          sections: sectionReferences,
          ...(workspace.surface === "full"
            ? { surface: workspace.surface }
            : { surface: workspace.surface, width: workspace.width }),
        },
      },
      ...sectionPublications.flatMap(({ nodes }) => nodes),
    ],
    workspaceReference,
  };
}

export function prepareGeneratedWorkspaceRuntimePublication(
  workspace: WorkspaceContract,
  dispatch: WorkspaceIntentHandler,
): GeneratedWorkspaceRuntimePublication {
  const publication = projectGeneratedWorkspaceContractHostPublication(workspace);

  return {
    ...publication,
    intentHandlers: [
      {
        dispatch: (intent: PresentationIntent) => {
          if (!isWorkspaceIntent(intent)) {
            return;
          }
          return dispatch(intent);
        },
        matches: (intent) => isWorkspaceIntent(intent) && intent.screenId === workspace.id,
      },
    ],
  };
}

export function useGeneratedWorkspaceContractHost({
  dispatch,
  publication,
}: {
  dispatch: WorkspaceIntentHandler;
  publication: GeneratedWorkspaceRuntimePublication | undefined;
}): {
  host: MutablePresentationHost;
  workspaceReference: WorkspaceManifestReference | undefined;
} {
  const dispatchRef = useRef(dispatch);
  const [host] = useState(() =>
    createMemoryPresentationHost({
      dispatch: (intent) => {
        if (!isWorkspaceIntent(intent)) {
          throw new Error("Generated workspace contract host received a shell intent.");
        }
        return dispatchRef.current(intent);
      },
      ...(publication === undefined ? {} : { nodes: publication.nodes }),
    }),
  );

  useLayoutEffect(() => {
    dispatchRef.current = dispatch;
    host.publish(publication?.nodes ?? []);
  }, [dispatch, host, publication]);

  return { host, workspaceReference: publication?.workspaceReference };
}

function projectSection(
  workspaceId: string,
  section: WorkspaceSectionContract,
): {
  nodes: PresentationNodeSet;
  reference: WorkspaceSectionShellReference;
} {
  const reference = workspaceSectionShellReference(workspaceId, section.id);
  const collectionPresentation = section.collection.presentation;
  const { contextDetail, result } = collectionPresentation;
  const mainResult = projectMainResult(workspaceId, section.id, result);
  const projectedContext = contextDetail
    ? projectContextResult(workspaceId, section.id, contextDetail)
    : undefined;
  const projectedSelectedDetail =
    collectionPresentation.kind === "selectedRecord"
      ? collectionPresentation.sections.map((detailSection) =>
          projectSelectedDetailResult(workspaceId, section.id, detailSection),
        )
      : [];
  let presentation: WorkspaceCollectionShellContract["presentation"];
  if (collectionPresentation.kind === "selectedRecord") {
    if (mainResult.reference.kind !== "listResultReference") {
      throw new Error("Selected-record workspaces require a main list result reference.");
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
      ...(projectedContext === undefined ? {} : { contextDetail: projectedContext.reference }),
      result: mainResult.reference,
      sections: projectedSelectedDetail.map(({ section: detailSection }) => detailSection),
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
      ...(projectedContext === undefined ? {} : { contextDetail: projectedContext.reference }),
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
      ...(projectedContext === undefined ? [] : [projectedContext.node]),
      ...projectedSelectedDetail.map(({ node }) => node),
    ],
    reference,
  };
}

function projectSelectedDetailResult(
  workspaceId: string,
  sectionId: string,
  detailSection: WorkspaceSelectedRecordSectionContract,
): {
  node: PresentationNode;
  reference: SelectedDetailReference;
  section: WorkspaceSelectedRecordSectionShellContract;
} {
  if (detailSection.kind === "selectedRecordRelationshipHierarchySection") {
    const reference = relationshipHierarchyReference({
      hierarchyId: detailSection.hierarchy.id,
      sectionId,
      workspaceId,
    });
    return {
      node: { reference, snapshot: detailSection.hierarchy },
      reference,
      section: { ...detailSection, hierarchy: reference },
    };
  }

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

function projectMainResult(
  workspaceId: string,
  sectionId: string,
  result: WorkspaceSectionContract["collection"]["presentation"]["result"],
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

function projectContextResult(
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
