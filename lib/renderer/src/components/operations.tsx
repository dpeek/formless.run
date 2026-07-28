import { useRef, useState } from "react";
import { Heading } from "@astryxdesign/core/Text";
import { ToastViewport } from "@astryxdesign/core/Toast";
import { VStack } from "@astryxdesign/core/VStack";
import type {
  OperationControlContract,
  OperationFeedbackEventContract,
  OperationPresentationIntentHandler,
} from "@dpeek/formless-presentation/contract";
import { AstryxApplicationSurfaceFrame } from "./application-surface-frame.tsx";
import {
  operationControlFixtures,
  type OperationControlFixtureKey,
} from "./operation-controls.fixtures.ts";
import {
  AstryxOperationButton,
  AstryxOperationButtonWithProgress,
  AstryxOperationDestructiveConfirmation,
  AstryxOperationFeedback,
} from "./operation-renderer.tsx";
import { FormlessFixtureFrame } from "./fixture-layout.tsx";

type OperationControlState = Record<OperationControlFixtureKey, OperationControlContract>;

const sharedClearCompletedFixtureKeys = [
  "clearCompletedToolbar",
  "clearCompletedSummary",
] as const satisfies readonly OperationControlFixtureKey[];
const fixtureDelayMs = 1100;
const operationUseCases = [
  {
    fixtureKey: "clearCompletedToolbar",
    presentation: "button",
    title: "Collection command with target count",
  },
  {
    fixtureKey: "clearCompletedSummary",
    presentation: "button",
    title: "Compact collection command with shared state",
  },
  {
    fixtureKey: "refreshTasks",
    presentation: "button",
    title: "Collection command with replayed result",
  },
  {
    fixtureKey: "archiveOverdue",
    presentation: "button",
    title: "Collection command with failed result",
  },
  {
    fixtureKey: "workspacePushSuccess",
    presentation: "workspaceProgress",
    title: "Workspace Push succeeds",
  },
  {
    fixtureKey: "workspacePushFailure",
    presentation: "workspaceProgress",
    title: "Workspace Push fails on health check",
  },
  {
    fixtureKey: "transferOwner",
    presentation: "button",
    title: "Disabled record command",
  },
  {
    fixtureKey: "deleteTask",
    presentation: "destructiveConfirmation",
    title: "Destructive record command with confirmation",
  },
] as const satisfies readonly {
  fixtureKey: OperationControlFixtureKey;
  presentation: "button" | "destructiveConfirmation" | "workspaceProgress";
  title: string;
}[];

export function FormlessOperationsLayout() {
  const [controls, setControls] = useState<OperationControlState>(initialOperationControls);
  const [feedback, setFeedback] = useState<OperationFeedbackEventContract>();
  const runningFixtureKeysRef = useRef<Set<OperationControlFixtureKey>>(new Set());

  const onIntent: OperationPresentationIntentHandler = async (intent) => {
    const fixtureKey = findFixtureKey(controls, intent.controlId);

    if (fixtureKey === undefined) {
      return;
    }

    if (intent.type === "operationConfirmationOpenChange") {
      setControls((currentControls) =>
        updateConfirmationOpen(currentControls, fixtureKey, intent.open),
      );
      return;
    }

    const fixtureKeys = sharedFixtureKeys(fixtureKey);
    if (
      fixtureKeys.some(
        (key) =>
          runningFixtureKeysRef.current.has(key) ||
          controls[key].trigger.disabled ||
          controls[key].trigger.pending?.isPending,
      )
    ) {
      return;
    }

    for (const key of fixtureKeys) {
      runningFixtureKeysRef.current.add(key);
    }

    setFeedback(undefined);
    setControls((currentControls) => applyFixtureSnapshot(currentControls, fixtureKeys, "pending"));

    const timeline =
      fixtureKeys.length === 1 ? operationControlFixtures[fixtureKey].timeline : undefined;

    if (timeline === undefined) {
      await waitForFixtureResult(fixtureDelayMs);
      setControls((currentControls) =>
        applyFixtureSnapshot(currentControls, fixtureKeys, "settled"),
      );
    } else {
      for (const transition of timeline) {
        await waitForFixtureResult(transition.delayMs);
        setControls((currentControls) => ({
          ...currentControls,
          [fixtureKey]: transition.snapshot,
        }));
      }
    }

    const settledFeedback = operationControlFixtures[fixtureKeys[0]].settled.feedback;
    if (settledFeedback !== undefined) {
      setFeedback(settledFeedback);
    }

    for (const key of fixtureKeys) {
      runningFixtureKeysRef.current.delete(key);
    }
  };

  return (
    <FormlessFixtureFrame ariaLabel="Operation fixtures">
      <ToastViewport maxVisible={3} position="bottomEnd">
        <main>
          <AstryxApplicationSurfaceFrame width="narrow">
            <VStack gap={6} width="100%">
              <Heading level={1}>Operations</Heading>
              {operationUseCases.map(({ fixtureKey, presentation, title }) => (
                <OperationUseCase
                  control={controls[fixtureKey]}
                  key={fixtureKey}
                  onIntent={onIntent}
                  presentation={presentation}
                  title={title}
                />
              ))}
            </VStack>
            <AstryxOperationFeedback feedback={feedback} />
          </AstryxApplicationSurfaceFrame>
        </main>
      </ToastViewport>
    </FormlessFixtureFrame>
  );
}

function OperationUseCase({
  control,
  onIntent,
  presentation,
  title,
}: {
  control: OperationControlContract;
  onIntent: OperationPresentationIntentHandler;
  presentation: "button" | "destructiveConfirmation" | "workspaceProgress";
  title: string;
}) {
  return (
    <VStack gap={3} hAlign="start">
      <Heading level={2}>{title}</Heading>
      {presentation === "workspaceProgress" && control.progress !== undefined ? (
        <AstryxOperationButtonWithProgress
          button={control.trigger}
          onIntent={onIntent}
          progress={control.progress}
        />
      ) : (
        <AstryxOperationButton button={control.trigger} onIntent={onIntent} />
      )}
      {presentation === "destructiveConfirmation" && control.confirmation !== undefined ? (
        <AstryxOperationDestructiveConfirmation
          confirmation={control.confirmation}
          onIntent={onIntent}
        />
      ) : null}
    </VStack>
  );
}

function initialOperationControls(): OperationControlState {
  return mapFixtureSnapshots("initial");
}

function mapFixtureSnapshots(snapshot: "initial" | "pending" | "settled"): OperationControlState {
  return Object.fromEntries(
    operationControlFixtureKeys.map((key) => [key, operationControlFixtures[key][snapshot]]),
  ) as OperationControlState;
}

function applyFixtureSnapshot(
  controls: OperationControlState,
  fixtureKeys: readonly OperationControlFixtureKey[],
  snapshot: "pending" | "settled",
): OperationControlState {
  const nextControls = { ...controls };

  for (const key of fixtureKeys) {
    nextControls[key] = operationControlFixtures[key][snapshot];
  }

  return nextControls;
}

function updateConfirmationOpen(
  controls: OperationControlState,
  fixtureKey: OperationControlFixtureKey,
  open: boolean,
): OperationControlState {
  const control = controls[fixtureKey];

  if (control.confirmation === undefined) {
    return controls;
  }

  return {
    ...controls,
    [fixtureKey]: {
      ...control,
      confirmation: {
        ...control.confirmation,
        open,
      },
    },
  };
}

function findFixtureKey(
  controls: OperationControlState,
  controlId: string,
): OperationControlFixtureKey | undefined {
  return operationControlFixtureKeys.find((key) => {
    const control = controls[key];

    return (
      control.trigger.intent.controlId === controlId ||
      control.confirmation?.action.intent.controlId === controlId
    );
  });
}

function sharedFixtureKeys(
  fixtureKey: OperationControlFixtureKey,
): readonly OperationControlFixtureKey[] {
  return sharedClearCompletedFixtureKeys.includes(
    fixtureKey as (typeof sharedClearCompletedFixtureKeys)[number],
  )
    ? sharedClearCompletedFixtureKeys
    : [fixtureKey];
}

function waitForFixtureResult(delayMs: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
}

const operationControlFixtureKeys = Object.keys(
  operationControlFixtures,
) as OperationControlFixtureKey[];
