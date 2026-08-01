import { useState } from "react";
import type {
  ManagementIntent,
  ManagementReadyContract,
  ManagementWorkspaceOperationContract,
  WorkspaceIntent,
} from "@dpeek/formless-presentation/contract";
import {
  createMemoryPresentationHost,
  managementManifestReference,
  isManagementIntent,
  isWorkspaceIntent,
  type PresentationNodeSet,
  type MutablePresentationHost,
} from "@dpeek/formless-presentation/host";
import { PresentationHostProvider } from "@dpeek/formless-presentation/host/react";
import { AstryxApplicationSurfaceFrame } from "./application-surface-frame.tsx";
import { FormlessFixtureFrame, FormlessFixtureSelector } from "./fixture-layout.tsx";
import { AstryxSubscribedManagementRenderer } from "./management-renderer.tsx";
import {
  applyGeneratedWorkspaceIntent,
  projectGeneratedWorkspaceFixturePublication,
} from "./generated-workspace.tsx";
import {
  createFormlessInstanceManagementFixtures,
  instanceManagementWorkspacePushFixture,
  instanceManagementWorkspacePushOperationId,
  type FormlessInstanceManagementFixture,
  type FormlessInstanceManagementFixtureId,
  type FormlessInstanceManagementFixtureState,
} from "./instance-management.fixtures.ts";

export function FormlessInstanceManagementLayout() {
  const [fixtures] = useState(createFormlessInstanceManagementFixtureHosts);
  const [selectedFixtureId, setSelectedFixtureId] =
    useState<FormlessInstanceManagementFixtureId>("installed");
  const selectedFixture = fixtures.find((fixture) => fixture.id === selectedFixtureId);

  if (!selectedFixture) {
    return null;
  }

  return (
    <FormlessFixtureFrame
      ariaLabel="Instance management fixtures"
      controls={
        <FormlessFixtureSelector
          label="Instance management state"
          onSelectionChange={setSelectedFixtureId}
          options={fixtures}
          selectedId={selectedFixtureId}
        />
      }
    >
      <AstryxApplicationSurfaceFrame width="standard">
        <FormlessInstanceManagementFixtureView fixtureHost={selectedFixture} />
      </AstryxApplicationSurfaceFrame>
    </FormlessFixtureFrame>
  );
}

export function FormlessInstanceManagementFixtureView({
  fixtureHost,
}: {
  fixtureHost: FormlessInstanceManagementFixtureHost;
}) {
  return (
    <PresentationHostProvider host={fixtureHost.host}>
      <AstryxSubscribedManagementRenderer managementReference={fixtureHost.managementReference} />
    </PresentationHostProvider>
  );
}

export type FormlessInstanceManagementFixtureHost = FormlessInstanceManagementFixture & {
  getState(): FormlessInstanceManagementFixtureState;
  host: Omit<MutablePresentationHost, "dispatch"> & {
    dispatch(intent: ManagementIntent | WorkspaceIntent): void;
  };
  managementReference: ReturnType<typeof managementManifestReference>;
};

export function createFormlessInstanceManagementFixtureHost(
  fixture: FormlessInstanceManagementFixture,
): FormlessInstanceManagementFixtureHost {
  let state = fixture.state;
  const initialPublication = projectFormlessInstanceManagementFixturePublication(state);
  let host: MutablePresentationHost;

  host = createMemoryPresentationHost({
    dispatch: (intent) => {
      const nextState = isManagementIntent(intent)
        ? applyFormlessInstanceManagementFixtureIntent(state, intent)
        : isWorkspaceIntent(intent)
          ? applyFormlessInstanceManagementWorkspaceFixtureIntent(state, intent)
          : undefined;

      if (nextState === undefined) {
        throw new Error("Instance management fixture host received an unsupported intent.");
      }
      if (nextState === state) {
        return;
      }

      state = nextState;
      host.publish(projectFormlessInstanceManagementFixturePublication(state).nodes);

      if (intent.type === "managementWorkspaceOperation") {
        scheduleWorkspacePushTimeline();
      }
    },
    nodes: initialPublication.nodes,
  });

  function scheduleWorkspacePushTimeline() {
    let delayMs = 0;

    for (const transition of instanceManagementWorkspacePushFixture.timeline ?? []) {
      delayMs += transition.delayMs;
      globalThis.setTimeout(() => {
        if (state.manifest.state !== "ready") {
          return;
        }

        const operation = state.manifest.workspaceOperation;
        if (
          operation?.id !== instanceManagementWorkspacePushOperationId ||
          operation.control.status.status !== "pending"
        ) {
          return;
        }

        state = replaceReadyManifest(state, {
          ...state.manifest,
          workspaceOperation: {
            ...operation,
            control: transition.snapshot,
          },
        });
        host.publish(projectFormlessInstanceManagementFixturePublication(state).nodes);
      }, delayMs);
    }
  }

  return {
    ...fixture,
    getState: () => state,
    host: host as FormlessInstanceManagementFixtureHost["host"],
    managementReference: initialPublication.managementReference,
  };
}

export function projectFormlessInstanceManagementFixturePublication(
  state: FormlessInstanceManagementFixtureState,
): {
  managementReference: ReturnType<typeof managementManifestReference>;
  nodes: PresentationNodeSet;
} {
  const managementReference = managementManifestReference(state.manifest.id);
  const workspaceNodes = state.workspaces.flatMap(
    (workspace) => projectGeneratedWorkspaceFixturePublication(workspace).nodes,
  );

  return {
    managementReference,
    nodes: [{ reference: managementReference, snapshot: state.manifest }, ...workspaceNodes],
  };
}

export function applyFormlessInstanceManagementFixtureIntent(
  state: FormlessInstanceManagementFixtureState,
  intent: ManagementIntent,
): FormlessInstanceManagementFixtureState {
  if (state.manifest.id !== intent.managementId || state.manifest.state !== "ready") {
    return state;
  }

  if (
    intent.type === "managementWorkspaceOperation" ||
    intent.type === "managementAuthorizationOpen"
  ) {
    return applyManagementOperationIntent(state, state.manifest, intent);
  }

  return state;
}

export function applyFormlessInstanceManagementWorkspaceFixtureIntent(
  state: FormlessInstanceManagementFixtureState,
  intent: WorkspaceIntent,
): FormlessInstanceManagementFixtureState {
  let changed = false;
  const workspaces = state.workspaces.map((workspace) => {
    const nextWorkspace = applyGeneratedWorkspaceIntent(workspace, intent);
    changed ||= nextWorkspace !== workspace;
    return nextWorkspace;
  });

  return changed ? { ...state, workspaces } : state;
}

function createFormlessInstanceManagementFixtureHosts() {
  return createFormlessInstanceManagementFixtures().map(
    createFormlessInstanceManagementFixtureHost,
  );
}

function applyManagementOperationIntent(
  state: FormlessInstanceManagementFixtureState,
  manifest: ManagementReadyContract,
  intent: Extract<
    ManagementIntent,
    {
      type: "managementAuthorizationOpen" | "managementWorkspaceOperation";
    }
  >,
) {
  const operation = manifest.workspaceOperation;
  if (!operation || operation.id !== intent.operationId) {
    return state;
  }

  if (intent.type === "managementAuthorizationOpen") {
    const prompt = operation.authorizationPrompt;
    if (!prompt || prompt.id !== intent.promptId || prompt.action.id !== intent.controlId) {
      return state;
    }

    return replaceReadyManifest(state, {
      ...manifest,
      workspaceFeedback: {
        detail: "External authorization was simulated by the fixture.",
        id: "instance-management:feedback:authorization-opened",
        intent: "success",
        kind: "managementFeedback",
        title: "Authorization opened",
      },
      workspaceOperation: { ...operation, authorizationPrompt: undefined },
    });
  }

  if (
    operation.control.id !== intent.controlId ||
    intent.intent.controlId !== intent.controlId ||
    intent.intent.type !== "operationInvoke" ||
    operation.control.status.status === "pending"
  ) {
    return state;
  }

  return replaceReadyManifest(state, {
    ...manifest,
    workspaceFeedback: undefined,
    workspaceOperation: pendingOperation(operation),
  });
}

function pendingOperation(
  operation: ManagementWorkspaceOperationContract,
): ManagementWorkspaceOperationContract {
  return {
    ...operation,
    authorizationPrompt: undefined,
    control: instanceManagementWorkspacePushFixture.pending,
  };
}

function replaceReadyManifest(
  state: FormlessInstanceManagementFixtureState,
  manifest: ManagementReadyContract,
) {
  return manifest === state.manifest ? state : { ...state, manifest };
}
