import {
  createStaticSource,
  Typeahead,
  type SearchableItem,
  type TypeaheadStatus,
} from "@astryxdesign/core/Typeahead";
import { useMemo, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";

type OpenTextSuggestionItem = SearchableItem<{
  value: string;
}>;

export function OpenTextTypeahead({
  description,
  hasClear,
  isDisabled,
  isLabelHidden,
  isLoading,
  isRequired,
  label,
  onBlur,
  onEnter,
  onEscape,
  onValueChange,
  placeholder,
  size,
  status,
  suggestions,
  value,
  width = "100%",
}: {
  description?: string;
  hasClear: boolean;
  isDisabled: boolean;
  isLabelHidden?: boolean;
  isLoading: boolean;
  isRequired?: boolean;
  label: string;
  onBlur?: (value: string) => void;
  onEnter?: (value: string) => void;
  onEscape?: () => void;
  onValueChange: (value: string) => void;
  placeholder?: string;
  size?: "sm" | "md" | "lg";
  status?: TypeaheadStatus;
  suggestions: readonly string[];
  value: string;
  width?: string | number;
}) {
  const items = useMemo(() => suggestionItems(suggestions), [suggestions]);
  const searchSource = useMemo(() => createStaticSource(items), [items]);
  const [queryEditing, setQueryEditing] = useState(false);
  const latestDraftRef = useRef(value);
  const projectedValueRef = useRef(value);

  if (projectedValueRef.current !== value) {
    projectedValueRef.current = value;
    latestDraftRef.current = value;
  }

  const selectedItem = queryEditing ? null : suggestionItemForValue(items, value);

  function updateValue(nextValue: string) {
    latestDraftRef.current = nextValue;
    onValueChange(nextValue);
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (focusRemainsInTypeahead(event.currentTarget, event.relatedTarget)) {
      return;
    }

    setQueryEditing(false);
    onBlur?.(latestDraftRef.current);
  }

  function handleKeyDownCapture(event: KeyboardEvent<HTMLDivElement>) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.getAttribute("role") !== "combobox") {
      return;
    }

    const listOpen = input.getAttribute("aria-expanded") === "true";
    const suggestionHighlighted = input.hasAttribute("aria-activedescendant");

    if (event.key === "Enter" && (!listOpen || !suggestionHighlighted)) {
      event.preventDefault();
      onEnter?.(latestDraftRef.current);
      return;
    }

    if (event.key === "Escape" && !listOpen) {
      event.preventDefault();
      onEscape?.();
    }
  }

  return (
    <div
      aria-busy={isLoading || undefined}
      onBlur={handleBlur}
      onKeyDownCapture={handleKeyDownCapture}
    >
      <Typeahead
        debounceMs={0}
        description={description}
        emptySearchResultsText="No suggestions"
        hasClear={hasClear}
        hasEntriesOnFocus
        isDisabled={isDisabled}
        isLabelHidden={isLabelHidden}
        isRequired={isRequired}
        label={label}
        placeholder={placeholder}
        searchSource={searchSource}
        size={size}
        status={status}
        value={selectedItem}
        width={width}
        onChange={(item) => {
          setQueryEditing(false);
          updateValue(item ? suggestionItemValue(item) : "");
        }}
        onChangeQuery={(query) => {
          setQueryEditing(true);
          updateValue(query);
        }}
      />
    </div>
  );
}

function suggestionItems(suggestions: readonly string[]): OpenTextSuggestionItem[] {
  return suggestions.map((suggestion, index) => ({
    auxiliaryData: { value: suggestion },
    id: `open-text-suggestion-${index}`,
    label: suggestion,
  }));
}

function suggestionItemForValue(
  items: readonly OpenTextSuggestionItem[],
  value: string,
): OpenTextSuggestionItem | null {
  if (value === "") {
    return null;
  }

  return (
    items.find((item) => suggestionItemValue(item) === value) ?? {
      auxiliaryData: { value },
      id: "open-text-current-value",
      label: value,
    }
  );
}

function suggestionItemValue(item: OpenTextSuggestionItem) {
  return item.auxiliaryData?.value ?? item.label;
}

function focusRemainsInTypeahead(container: HTMLDivElement, relatedTarget: EventTarget | null) {
  if (!(relatedTarget instanceof Node)) {
    return false;
  }

  if (container.contains(relatedTarget)) {
    return true;
  }

  const listboxId = container.querySelector('[role="combobox"]')?.getAttribute("aria-controls");
  return Boolean(listboxId && document.getElementById(listboxId)?.contains(relatedTarget));
}
