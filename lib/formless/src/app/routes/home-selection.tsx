import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

export type HomeRouteSelectionStore = {
  selectionState: HomeRouteSelectionState;
  setSelectionState: Dispatch<SetStateAction<HomeRouteSelectionState>>;
};

const HomeRouteSelectionContext = createContext<HomeRouteSelectionStore | null>(null);

export function HomeRouteSelectionProvider({ children }: { children: ReactNode }) {
  const [selectionState, setSelectionState] = useState(createHomeRouteSelectionState);

  return (
    <HomeRouteSelectionContext.Provider value={{ selectionState, setSelectionState }}>
      {children}
    </HomeRouteSelectionContext.Provider>
  );
}

export function useHomeRouteSelectionStore(): HomeRouteSelectionStore | null {
  return useContext(HomeRouteSelectionContext);
}

export type HomeRouteSelectionState = {
  selectedScreenName: string | null;
  selectedQueryNamesBySection: Record<string, string | null>;
  selectedContextIdsBySection: Record<string, string | null>;
  selectedRecordIdsBySection: Record<string, string | null>;
};

export function createHomeRouteSelectionState(): HomeRouteSelectionState {
  return {
    selectedScreenName: null,
    selectedQueryNamesBySection: {},
    selectedContextIdsBySection: {},
    selectedRecordIdsBySection: {},
  };
}

export function withHomeRouteSelectedScreenName(
  current: HomeRouteSelectionState,
  selectedScreenName: string | null,
): HomeRouteSelectionState {
  return current.selectedScreenName === selectedScreenName
    ? current
    : { ...current, selectedScreenName, selectedRecordIdsBySection: {} };
}

export function withHomeRouteSelectedSectionQueryName(
  current: HomeRouteSelectionState,
  screenName: string,
  sectionId: string,
  selectedQueryName: string | null,
): HomeRouteSelectionState {
  const sectionKey = homeRouteSectionSelectionKey(screenName, sectionId);

  return current.selectedQueryNamesBySection[sectionKey] === selectedQueryName
    ? current
    : {
        ...current,
        selectedQueryNamesBySection: {
          ...current.selectedQueryNamesBySection,
          [sectionKey]: selectedQueryName,
        },
      };
}

export function withHomeRouteSelectedSectionContextRecordId(
  current: HomeRouteSelectionState,
  screenName: string,
  sectionId: string,
  recordId: string | null,
): HomeRouteSelectionState {
  const sectionKey = homeRouteSectionSelectionKey(screenName, sectionId);

  return current.selectedContextIdsBySection[sectionKey] === recordId
    ? current
    : {
        ...current,
        selectedContextIdsBySection: {
          ...current.selectedContextIdsBySection,
          [sectionKey]: recordId,
        },
      };
}

export function withHomeRouteSelectedSectionRecordId(
  current: HomeRouteSelectionState,
  screenName: string,
  sectionId: string,
  recordId: string | null,
): HomeRouteSelectionState {
  const sectionKey = homeRouteSectionSelectionKey(screenName, sectionId);

  return current.selectedScreenName === screenName &&
    current.selectedRecordIdsBySection[sectionKey] === recordId
    ? current
    : {
        ...current,
        selectedScreenName: screenName,
        selectedRecordIdsBySection: {
          ...(current.selectedScreenName === screenName ? current.selectedRecordIdsBySection : {}),
          [sectionKey]: recordId,
        },
      };
}

export function selectHomeRouteSectionQueryName(
  current: HomeRouteSelectionState,
  screenName: string,
  sectionId: string,
): string | null {
  const sectionKey = homeRouteSectionSelectionKey(screenName, sectionId);

  return current.selectedQueryNamesBySection[sectionKey] ?? null;
}

export function selectHomeRouteSectionContextRecordId(
  current: HomeRouteSelectionState,
  screenName: string,
  sectionId: string,
): string | null {
  const sectionKey = homeRouteSectionSelectionKey(screenName, sectionId);

  return current.selectedContextIdsBySection[sectionKey] ?? null;
}

export function selectHomeRouteSectionRecordId(
  current: HomeRouteSelectionState,
  screenName: string,
  sectionId: string,
): string | null {
  if (current.selectedScreenName !== screenName) {
    return null;
  }
  const sectionKey = homeRouteSectionSelectionKey(screenName, sectionId);

  return current.selectedRecordIdsBySection[sectionKey] ?? null;
}

export function homeRouteSectionSelectionKey(screenName: string, sectionId: string): string {
  return JSON.stringify([screenName, sectionId]);
}
