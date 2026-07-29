import { useLayoutEffect, useMemo } from "react";
import type {
  PresentationIntent,
  ShellIntent,
  ShellIntentHandler,
  ShellManifestReference,
} from "@dpeek/formless-presentation/contract";
import {
  shellManifestReference,
  shellNavigationSectionReference,
  isShellIntent,
  type PresentationNodeSet,
} from "@dpeek/formless-presentation/host";
import {
  type ApplicationRuntimeContractContribution,
  type ApplicationRuntimeContractPublication,
  type ApplicationRuntimePublicationCoordinator,
  useApplicationRuntimePublicationCoordinator,
} from "./application-runtime-contract-host.tsx";
import {
  GENERATED_APPLICATION_SHELL_ID,
  type GeneratedApplicationShellProjection,
} from "./application-shell-projection.ts";
import {
  indexGeneratedCreateSurfaceFields,
  resolveGeneratedCreateFieldIntent,
} from "./generated-create-field-index.ts";

export type GeneratedApplicationShellContractHostPublication = {
  nodes: PresentationNodeSet;
  shellReference: ShellManifestReference;
};

const APPLICATION_SHELL_CONTRIBUTOR_ID = "application-shell";

export type ResolvedGeneratedShellIntent =
  | {
      intent: Extract<ShellIntent, { type: "shellCreate" }>;
      kind: "create";
    }
  | {
      intent: Extract<ShellIntent, { type: "shellLogout" }>;
      kind: "logout";
    }
  | {
      intent: Extract<ShellIntent, { type: "shellRootRecordSelection" }>;
      kind: "rootSelection";
    }
  | { kind: "ignored" };

export function projectGeneratedApplicationShellContractHostPublication(
  projection: GeneratedApplicationShellProjection,
): GeneratedApplicationShellContractHostPublication {
  const shellReference = shellManifestReference(projection.manifest.id);

  return {
    nodes: [
      { reference: shellReference, snapshot: projection.manifest },
      ...projection.sections.map((section) => ({
        reference: shellNavigationSectionReference(projection.manifest.id, section.id),
        snapshot: section,
      })),
    ],
    shellReference,
  };
}

export function resolveGeneratedApplicationShellIntent(
  projection: GeneratedApplicationShellProjection | undefined,
  intent: ShellIntent,
): ResolvedGeneratedShellIntent {
  if (!projection || intent.shellId !== projection.manifest.id) {
    return { kind: "ignored" };
  }

  const section = projection.sections.find((candidate) => candidate.id === intent.sectionId);

  if (!section) {
    return { kind: "ignored" };
  }

  switch (intent.type) {
    case "shellRootRecordSelection": {
      const destination = section.destinations.find(
        (candidate) =>
          candidate.kind === "shellRootRecordDestination" &&
          candidate.id === intent.destinationId &&
          candidate.recordId === intent.recordId,
      );

      return destination ? { intent, kind: "rootSelection" } : { kind: "ignored" };
    }
    case "shellCreate": {
      const surface = section.createSurface;
      if (surface?.id !== intent.surfaceId) {
        return { kind: "ignored" };
      }

      if ("fieldId" in intent) {
        return resolveGeneratedCreateFieldIntent(
          indexGeneratedCreateSurfaceFields(surface),
          intent.fieldId,
          intent.intent,
        ) === undefined
          ? { kind: "ignored" }
          : { intent, kind: "create" };
      }

      return intent.intent.surfaceId === intent.surfaceId
        ? { intent, kind: "create" }
        : { kind: "ignored" };
    }
    case "shellLogout": {
      const logout =
        section.session?.state === "authenticated" ? section.session.logout : undefined;

      return logout?.id === intent.controlId ? { intent, kind: "logout" } : { kind: "ignored" };
    }
  }
}

export function useGeneratedApplicationShellContractHost({
  dispatch,
  initialRouteContributions = [],
  projection,
}: {
  dispatch: ShellIntentHandler;
  initialRouteContributions?: readonly ApplicationRuntimeContractContribution[];
  projection: GeneratedApplicationShellProjection | undefined;
}): {
  coordinator: ApplicationRuntimePublicationCoordinator;
  host: ApplicationRuntimePublicationCoordinator["host"];
  shellReference: ShellManifestReference | undefined;
} {
  const publication = projection
    ? projectGeneratedApplicationShellContractHostPublication(projection)
    : undefined;
  const runtimePublication =
    projection && publication
      ? prepareGeneratedApplicationShellRuntimePublication(projection, publication, dispatch)
      : undefined;
  const initialShellContributions: readonly ApplicationRuntimeContractContribution[] =
    runtimePublication ? [[APPLICATION_SHELL_CONTRIBUTOR_ID, runtimePublication]] : [];
  const coordinator = useApplicationRuntimePublicationCoordinator([
    ...initialShellContributions,
    ...initialRouteContributions,
  ]);
  const shellReference = useMemo(() => shellManifestReference(GENERATED_APPLICATION_SHELL_ID), []);

  useLayoutEffect(() => {
    if (runtimePublication) {
      coordinator.publish(APPLICATION_SHELL_CONTRIBUTOR_ID, runtimePublication);
    } else {
      coordinator.remove(APPLICATION_SHELL_CONTRIBUTOR_ID);
    }
  }, [coordinator, runtimePublication]);

  return {
    coordinator,
    host: coordinator.host,
    shellReference: projection ? shellReference : undefined,
  };
}

export function prepareGeneratedApplicationShellRuntimePublication(
  projection: GeneratedApplicationShellProjection,
  publication: GeneratedApplicationShellContractHostPublication,
  dispatch: ShellIntentHandler,
): ApplicationRuntimeContractPublication {
  return {
    intentHandlers: [
      {
        dispatch: (intent: PresentationIntent) => {
          if (!isShellIntent(intent)) {
            return;
          }
          return dispatch(intent);
        },
        matches: (intent) => isShellIntent(intent) && intent.shellId === projection.manifest.id,
      },
    ],
    nodes: publication.nodes,
  };
}
