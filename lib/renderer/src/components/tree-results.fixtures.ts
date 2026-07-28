import type { FieldSchema } from "@dpeek/formless-schema";
import type {
  ButtonContract,
  CreateFieldContract,
  CreateSurfaceContract,
  FieldContract,
  FieldSetContract,
  OperationButtonContract,
  OperationControlContract,
  TreeChildCreationContract,
  TreeItemContract,
  TreeItemStructureContract,
  TreeParentIdentity,
  TreeResultContract,
  TreeSelectedEditorContract,
  TreeWarningContract,
} from "@dpeek/formless-presentation/contract";
import {
  draftInput,
  enumControl,
  enumOptions,
  fieldError,
  recordDrafts,
  recordField,
  referenceControl,
  referenceEditorFacts,
  referenceOptions,
  textControl,
  withFixtureFieldOccurrence,
} from "./fields/fixture-helpers.ts";
import { fieldScenarioGroups } from "./fields/fixtures.ts";

export type TreeResultFixtureId =
  | "actions"
  | "cycle"
  | "editing-disabled"
  | "empty"
  | "leaf"
  | "maximum-depth"
  | "missing-child"
  | "no-selection"
  | "pending"
  | "removal-confirmation"
  | "removal-failed"
  | "removal-pending"
  | "shallow"
  | "unavailable";

export type TreeResultFixture = {
  id: TreeResultFixtureId;
  label: string;
  tree: TreeResultContract;
};

export function createTreeResultFixtures(): TreeResultFixture[] {
  return [
    { id: "shallow", label: "Shallow", tree: shallowTree() },
    { id: "actions", label: "Actions", tree: actionsTree("actions", "idle") },
    {
      id: "removal-confirmation",
      label: "Confirm removal",
      tree: actionsTree("removal-confirmation", "confirmation"),
    },
    {
      id: "removal-pending",
      label: "Removing",
      tree: actionsTree("removal-pending", "pending"),
    },
    {
      id: "removal-failed",
      label: "Removal failed",
      tree: actionsTree("removal-failed", "failed"),
    },
    { id: "maximum-depth", label: "Deep", tree: maximumDepthTree() },
    { id: "empty", label: "Empty", tree: emptyTree() },
    { id: "unavailable", label: "Unavailable", tree: unavailableTree() },
    { id: "missing-child", label: "Missing child", tree: structuralTree("missingChild") },
    { id: "cycle", label: "Cycle", tree: structuralTree("cycleStopped") },
    { id: "leaf", label: "Leaf", tree: structuralTree("leaf") },
    { id: "no-selection", label: "No selection", tree: noSelectionTree() },
    { id: "editing-disabled", label: "Disabled", tree: editingDisabledTree() },
    { id: "pending", label: "Pending", tree: pendingTree() },
  ];
}

function actionsTree(
  fixtureId: Extract<
    TreeResultFixtureId,
    "actions" | "removal-confirmation" | "removal-failed" | "removal-pending"
  >,
  removalState: "confirmation" | "failed" | "idle" | "pending",
): TreeResultContract {
  const resultId = treeId(fixtureId);
  const selectedId = itemId("announcement");
  const selectedItem = treeItem({
    id: "announcement",
    label: "Announcement",
    ordering: ordering(
      resultId,
      selectedId,
      false,
      { top: false, up: false },
      "Order Announcement",
    ),
    resultId,
    selected: true,
    slot: "Main",
    variant: "Banner",
  });

  return readyTree({
    id: resultId,
    items: [
      selectedItem,
      treeItem({ id: "features", label: "Features", resultId, slot: "Main", variant: "Grid" }),
      treeItem({ id: "cta", label: "Call to action", resultId, slot: "Main", variant: "CTA" }),
    ],
    rootLabel: "Landing page",
    selectedEditor: selectedEditor({
      id: "announcement",
      label: "Announcement",
      removePlacement: removePlacementControl(resultId, selectedId, removalState),
      resultId,
    }),
  });
}

function shallowTree(): TreeResultContract {
  const resultId = treeId("shallow");
  const navigationId = itemId("navigation");
  const navigationWarning = warning(
    "navigation-label",
    "placement",
    "Placement readiness",
    "navigation-label",
    "Navigation label is recommended.",
  );
  const navigation = treeItem({
    children: [
      treeItem({
        id: "brand",
        label: "Brand",
        resultId,
        slot: "Start",
        variant: "Logo",
      }),
      treeItem({
        children: [
          treeItem({
            id: "home-link",
            label: "Home",
            resultId,
            slot: "Links",
            variant: "Link",
          }),
          treeItem({
            id: "about-link",
            label: "About",
            resultId,
            slot: "Links",
            variant: "Link",
          }),
        ],
        disclosureOpen: false,
        id: "primary-links",
        label: "Primary links",
        resultId,
        slot: "Main",
        variant: "Group",
      }),
    ],
    contextActions: [contextAction(resultId, navigationId, "Open navigation block")],
    disclosureOpen: true,
    id: "navigation",
    label: "Navigation",
    resultId,
    selected: true,
    slot: "Header",
    variant: "Navigation",
    warnings: [navigationWarning],
  });

  return readyTree({
    id: resultId,
    items: [
      navigation,
      treeItem({ id: "hero", label: "Hero", resultId, slot: "Main", variant: "Hero" }),
      treeItem({
        id: "footer",
        label: "Footer",
        resultId,
        slot: "Footer",
        variant: "Footer",
      }),
    ],
    rootChildCreation: childCreation(
      resultId,
      { kind: "root" },
      {
        accessibilityLabel: "Add child to Homepage",
      },
    ),
    rootLabel: "Homepage",
    selectedEditor: selectedEditor({
      childFields: navigationChildFields(resultId, "navigation"),
      childCreation: childCreation(
        resultId,
        { itemId: navigationId, kind: "item" },
        {
          accessibilityLabel: "Add child to Navigation",
        },
      ),
      id: "navigation",
      label: "Navigation",
      placementFields: navigationPlacementFields(resultId, "navigation"),
      resultId,
      warnings: [navigationWarning],
    }),
  });
}

function maximumDepthTree(): TreeResultContract {
  const resultId = treeId("maximum-depth");
  const labels = ["Page", "Section", "Container", "Stack", "Group", "Panel", "Content", "Text"];
  let child: TreeItemContract | undefined;

  for (let depth = labels.length; depth >= 1; depth -= 1) {
    const label = labels[depth - 1] ?? `Level ${depth}`;
    child = treeItem({
      children: child ? [child] : [],
      disclosureOpen: child ? true : undefined,
      id: `depth-${depth}`,
      label,
      resultId,
      selected: depth === labels.length,
      slot: "Main",
      structure:
        depth === labels.length
          ? { message: "Maximum tree depth reached.", state: "depthStopped" }
          : { state: "branch" },
      variant: label,
    });
  }

  return readyTree({
    id: resultId,
    items: child ? [child] : [],
    rootLabel: "Deep page",
    selectedEditor: selectedEditor({
      id: `depth-${labels.length}`,
      label: labels.at(-1) ?? "Selected block",
      resultId,
    }),
  });
}

function emptyTree(): TreeResultContract {
  const id = treeId("empty");

  return {
    accessibilityLabel: "Empty page composition",
    availability: {
      emptyState: {
        description: "Add the first block to begin composing this page.",
        id: `${id}:empty`,
        kind: "treeEmptyState",
        title: "No blocks yet",
      },
      state: "empty",
    },
    density: "default",
    editing: { enabled: true },
    feedback: [],
    id,
    items: [],
    kind: "treeResult",
    root: root("Blank page", id),
    rootChildCreation: childCreation(
      id,
      { kind: "root" },
      {
        accessibilityLabel: "Add first block to Blank page",
      },
    ),
    warnings: [],
  };
}

function unavailableTree(): TreeResultContract {
  const id = treeId("unavailable");

  return {
    accessibilityLabel: "Unavailable page composition",
    availability: { message: "Page composition is temporarily unavailable.", state: "unavailable" },
    density: "default",
    editing: { disabledReason: "Page composition is unavailable.", enabled: false },
    feedback: [],
    id,
    items: [],
    kind: "treeResult",
    root: root("Page", id),
    warnings: [],
  };
}

function structuralTree(state: "cycleStopped" | "leaf" | "missingChild"): TreeResultContract {
  const resultId = treeId(state);
  const id =
    state === "missingChild" ? "missing-block" : state === "cycleStopped" ? "loop" : "text";
  const label =
    state === "missingChild" ? "Missing block" : state === "cycleStopped" ? "Loop" : "Body copy";
  const structure: TreeItemStructureContract =
    state === "leaf"
      ? { state }
      : {
          message:
            state === "missingChild"
              ? "The placed block is unavailable."
              : "This branch stops before repeating an ancestor.",
          state,
        };

  return readyTree({
    id: resultId,
    items: [
      treeItem({
        childRecord: state !== "missingChild",
        childRecordId: state === "missingChild" ? `block:${id}` : undefined,
        id,
        label,
        resultId,
        selected: true,
        slot: "Main",
        structure,
        variant: state === "leaf" ? "Text" : undefined,
      }),
    ],
    rootLabel: "Article",
    selectedEditor: selectedEditor({
      childRecord: state !== "missingChild",
      childRecordId: state === "missingChild" ? `block:${id}` : undefined,
      id,
      label,
      removePlacement:
        state === "missingChild" ? removePlacementControl(resultId, itemId(id), "idle") : undefined,
      resultId,
    }),
  });
}

function noSelectionTree(): TreeResultContract {
  const resultId = treeId("no-selection");

  return readyTree({
    id: resultId,
    items: [
      treeItem({
        id: "article-body",
        label: "Article body",
        resultId,
        slot: "Main",
        variant: "Group",
      }),
    ],
    rootLabel: "Article",
  });
}

function editingDisabledTree(): TreeResultContract {
  const resultId = treeId("editing-disabled");
  const placementWarning = warning(
    "placement-ready",
    "placement",
    "Placement readiness",
    "placement-hidden",
    "Placement is hidden from the published page.",
  );
  const childWarning = warning(
    "child-ready",
    "child",
    "Block readiness",
    "image-missing",
    "Image reference is unavailable.",
  );
  const treeWarning = warning(
    "tree-ready",
    "tree",
    "Page readiness",
    "page-draft",
    "The page contains unpublished changes.",
  );

  return readyTree({
    editing: { disabledReason: "Editing requires an owner session.", enabled: false },
    id: resultId,
    items: [
      treeItem({
        availability: { available: false, message: "This block cannot be edited." },
        id: "gallery",
        label: "Gallery",
        resultId,
        selected: true,
        slot: "Main",
        variant: "Gallery",
        warnings: [placementWarning, childWarning],
      }),
    ],
    rootLabel: "Portfolio",
    selectedEditor: selectedEditor({
      available: false,
      childCreation: childCreation(
        resultId,
        { itemId: itemId("gallery"), kind: "item" },
        {
          accessibilityLabel: "Add child to Gallery",
          available: false,
        },
      ),
      editing: { disabledReason: "Editing requires an owner session.", enabled: false },
      id: "gallery",
      label: "Gallery",
      resultId,
      warnings: [placementWarning, childWarning],
    }),
    warnings: [treeWarning],
  });
}

function pendingTree(): TreeResultContract {
  const resultId = treeId("pending");
  const item = treeItem({
    id: "feature-grid",
    label: "Feature grid",
    ordering: ordering(resultId, itemId("feature-grid"), true),
    resultId,
    selected: true,
    slot: "Main",
    variant: "Grid",
  });

  return readyTree({
    feedback: [
      {
        detail: "Moving Feature grid within Main.",
        id: `${resultId}:feedback:move`,
        intent: "info",
        kind: "operationFeedbackEvent",
        status: "pending",
        title: "Moving block",
      },
    ],
    id: resultId,
    items: [item],
    rootLabel: "Features",
    selectedEditor: selectedEditor({
      childCreation: childCreation(
        resultId,
        { itemId: item.id, kind: "item" },
        {
          accessibilityLabel: "Add child to Feature grid",
          pending: true,
        },
      ),
      id: "feature-grid",
      label: "Feature grid",
      resultId,
    }),
    status: {
      accessibilityLabel: "Moving Feature grid",
      detail: "Ordering change is in progress.",
      id: `${resultId}:status`,
      intent: "info",
      kind: "compactStatus",
      label: "Moving block",
      pending: { isPending: true, label: "Moving block" },
      status: "pending",
    },
  });
}

function readyTree({
  editing = { enabled: true },
  feedback = [],
  id,
  items,
  rootChildCreation,
  rootLabel,
  selectedEditor,
  status,
  warnings = [],
}: {
  editing?: TreeResultContract["editing"];
  feedback?: TreeResultContract["feedback"];
  id: string;
  items: readonly TreeItemContract[];
  rootChildCreation?: TreeChildCreationContract;
  rootLabel: string;
  selectedEditor?: TreeSelectedEditorContract;
  status?: TreeResultContract["status"];
  warnings?: readonly TreeWarningContract[];
}): TreeResultContract {
  return {
    accessibilityLabel: `${rootLabel} composition tree`,
    availability: { state: "ready" },
    density: "default",
    editing,
    feedback,
    id,
    items,
    kind: "treeResult",
    root: root(rootLabel, id),
    rootChildCreation,
    selectedEditor,
    status,
    warnings,
  };
}

function treeItem({
  availability = { available: true },
  childRecord = true,
  childRecordId,
  children = [],
  contextActions = [],
  disclosureOpen,
  id,
  label,
  ordering: itemOrdering,
  resultId,
  selected = false,
  slot,
  structure,
  variant,
  warnings = [],
}: {
  availability?: TreeItemContract["availability"];
  childRecord?: boolean;
  childRecordId?: string;
  children?: readonly TreeItemContract[];
  contextActions?: TreeItemContract["contextActions"];
  disclosureOpen?: boolean;
  id: string;
  label: string;
  ordering?: TreeItemContract["ordering"];
  resultId: string;
  selected?: boolean;
  slot?: string;
  structure?: TreeItemStructureContract;
  variant?: string;
  warnings?: readonly TreeWarningContract[];
}): TreeItemContract {
  const stableItemId = itemId(id);

  return {
    accessibilityLabel: `${label} block`,
    availability,
    ...(childRecord || childRecordId ? { childRecordId: childRecordId ?? `block:${id}` } : {}),
    children,
    contextActions,
    ...(children.length > 0
      ? {
          disclosure: {
            accessibilityLabel: `${disclosureOpen ? "Collapse" : "Expand"} ${label}`,
            id: `${stableItemId}:disclosure`,
            intent: {
              itemId: stableItemId,
              open: !disclosureOpen,
              resultId,
              type: "treeDisclosureOpenChange",
            },
            kind: "treeItemDisclosure" as const,
            open: disclosureOpen ?? false,
          },
        }
      : {}),
    id: stableItemId,
    kind: "treeItem",
    label,
    ...(itemOrdering ? { ordering: itemOrdering } : {}),
    placementId: `placement:${id}`,
    selected,
    selectionIntent: { itemId: stableItemId, resultId, type: "treeItemSelection" },
    ...(slot ? { slot: { id: `slot:${slug(slot)}`, kind: "treeItemSlot", label: slot } } : {}),
    structure: structure ?? { state: children.length > 0 ? "branch" : "leaf" },
    ...(variant
      ? { variant: { id: `variant:${slug(variant)}`, kind: "treeItemVariant", label: variant } }
      : {}),
    warnings,
  };
}

function selectedEditor({
  available = true,
  childCreation: editorChildCreation,
  childFields,
  childRecord = true,
  childRecordId,
  editing = { enabled: true },
  id,
  label,
  placementFields,
  removePlacement,
  resultId,
  warnings = [],
}: {
  available?: boolean;
  childCreation?: TreeChildCreationContract;
  childFields?: FieldSetContract;
  childRecord?: boolean;
  childRecordId?: string;
  editing?: TreeSelectedEditorContract["editing"];
  id: string;
  label: string;
  placementFields?: FieldSetContract;
  removePlacement?: OperationControlContract;
  resultId: string;
  warnings?: readonly TreeWarningContract[];
}): TreeSelectedEditorContract {
  const stableItemId = itemId(id);
  const availability = available
    ? ({ available: true } as const)
    : ({ available: false, message: "This selected item is unavailable." } as const);

  return {
    accessibilityLabel: `Edit ${label} placement and block`,
    availability,
    ...(editorChildCreation ? { childCreation: editorChildCreation } : {}),
    ...(childRecord
      ? {
          childFields:
            childFields ?? fieldSet(`${resultId}:${id}:child-fields`, "Child fields", [], editing),
        }
      : {}),
    ...(childRecord || childRecordId ? { childRecordId: childRecordId ?? `block:${id}` } : {}),
    editing,
    id: `${resultId}:${id}:editor`,
    itemId: stableItemId,
    kind: "treeSelectedEditor",
    placementFields:
      placementFields ??
      fieldSet(`${resultId}:${id}:placement-fields`, "Placement fields", [], editing),
    placementId: `placement:${id}`,
    ...(removePlacement ? { removePlacement } : {}),
    warnings,
  };
}

function childCreation(
  resultId: string,
  parent: TreeParentIdentity,
  {
    accessibilityLabel = "Add child",
    available = true,
    pending = false,
  }: {
    accessibilityLabel?: string;
    available?: boolean;
    pending?: boolean;
  } = {},
): TreeChildCreationContract {
  const parentId = parent.kind === "root" ? "root" : parent.itemId;
  const activeVariantId = `${resultId}:${parentId}:variant:text`;
  const variant = (name: string, slot: string, selected: boolean) => {
    const variantId = `${resultId}:${parentId}:variant:${slug(name)}:${slug(slot)}`;
    return {
      availability: available
        ? ({ available: true } as const)
        : ({ available: false, message: "Child creation is unavailable." } as const),
      id: selected ? activeVariantId : variantId,
      kind: "treeChildVariant" as const,
      label: name,
      selected: available && selected,
      selectionIntent: {
        parent,
        resultId,
        variantId: selected ? activeVariantId : variantId,
        type: "treeChildVariantSelection" as const,
      },
      slot: { id: `slot:${slug(slot)}`, kind: "treeItemSlot" as const, label: slot },
    };
  };

  return {
    accessibilityLabel,
    ...(available
      ? {
          activeCreateSurface: createSurface(`${resultId}:${parentId}:create`, pending),
          activeVariantId,
        }
      : {}),
    id: `${resultId}:${parentId}:children`,
    kind: "treeChildCreation",
    variants: [variant("Text", "Main", true), variant("Button", "Actions", false)],
  };
}

function createSurface(id: string, pending: boolean): CreateSurfaceContract {
  const fields = fieldSet<CreateFieldContract>(`${id}:fields`, "New block", [
    createLabelField(id, pending),
  ]);

  return {
    dialog: {
      form: {
        cancel: button(`${id}:cancel`, "Cancel"),
        errors: [],
        fieldSet: pending
          ? { ...fields, disabled: true, disabledReason: "Creating block" }
          : fields,
        id: `${id}:form`,
        kind: "createForm",
        submit: {
          ...button(`${id}:submit`, "Create block"),
          ...(pending
            ? { disabled: true, pending: { isPending: true, label: "Creating block" } }
            : {}),
          prominence: "primary",
          type: "submit",
        },
      },
      id: `${id}:dialog`,
      kind: "createDialog",
      open: pending,
      title: "Add text block",
    },
    id,
    kind: "createSurface",
    trigger: button(`${id}:open`, "Add block"),
  };
}

function createLabelField(id: string, pending: boolean): CreateFieldContract {
  const field = { label: "Block label", required: true, type: "text" as const };

  return {
    access: { canPatch: true, kind: "editable", writable: true },
    commit: "submit",
    control: {
      control: { inputType: "text", kind: "input" },
      controlKind: "text",
      createDefaultChecked: false,
      createDefaultValue: undefined,
      editor: "text",
      field,
      inputAttributes: {},
      kind: "text",
      label: field.label,
      required: field.required,
    },
    density: "default",
    draftInput: { kind: "input", value: pending ? "Feature child" : "" },
    editor: "text",
    field,
    fieldId: `${id}:field:label`,
    fieldName: "label",
    label: field.label,
    labelVisibility: "visible",
    mode: "editor",
    required: field.required,
    surface: "create",
    value: undefined,
  };
}

function ordering(
  resultId: string,
  stableItemId: string,
  pending: boolean,
  structuralAvailability: Partial<Record<"bottom" | "down" | "top" | "up", boolean>> = {},
  accessibilityLabel = "Order Feature grid",
) {
  const directions = ["top", "up", "down", "bottom"] as const;

  return {
    accessibilityLabel,
    actions: directions.map((direction) => ({
      direction,
      ...(pending ? { disabled: true, disabledReason: "Ordering in progress" } : {}),
      id: `${stableItemId}:order:${direction}`,
      intent: {
        actionId: `${stableItemId}:order:${direction}`,
        direction,
        itemId: stableItemId,
        resultId,
        type: "treeReorder" as const,
      },
      label: `Move ${direction}`,
      structurallyAvailable: structuralAvailability[direction] ?? true,
    })),
    affordance: "reorder" as const,
    id: `${stableItemId}:ordering`,
    kind: "treeOrdering" as const,
    pending,
  };
}

function removePlacementControl(
  resultId: string,
  stableItemId: string,
  state: "confirmation" | "failed" | "idle" | "pending",
): OperationControlContract {
  const controlId = `${resultId}:${stableItemId}:remove-placement`;
  const isOpen = state !== "idle";
  const isPending = state === "pending";
  const trigger = operationButton(controlId, "Remove placement", {
    controlId,
    open: true,
    type: "operationConfirmationOpenChange",
  });
  const action = operationButton(`${controlId}:confirm`, "Remove", {
    controlId,
    invocationSource: "confirmationDialog",
    type: "operationInvoke",
  });
  const closeIntent = {
    controlId,
    open: false,
    type: "operationConfirmationOpenChange" as const,
  };
  const cancel = operationButton(`${controlId}:cancel`, "Cancel", closeIntent);
  const pending = { isPending: true, label: "Removing placement" } as const;

  return {
    confirmation: {
      action: isPending
        ? { ...action, disabled: true, disabledReason: pending.label, pending }
        : action,
      cancel,
      closeIntent,
      description: "The placement will be removed without deleting the child block.",
      id: `${controlId}:confirmation`,
      kind: "destructiveConfirmation",
      open: isOpen,
      title: "Remove placement?",
    },
    ...(state === "failed"
      ? {
          feedback: {
            detail: "Remove failed. Try again.",
            id: `${controlId}:feedback:failed`,
            intent: "danger" as const,
            kind: "operationFeedbackEvent" as const,
            status: "failed" as const,
            title: "Remove failed.",
          },
        }
      : isPending
        ? {
            feedback: {
              activeProgress: { label: "Remove placement" },
              id: `${controlId}:feedback:pending`,
              intent: "info" as const,
              kind: "operationFeedbackEvent" as const,
              status: "pending" as const,
              title: "Removing placement",
            },
          }
        : {}),
    id: controlId,
    kind: "operationControl",
    ...(isPending
      ? {
          progress: {
            id: `${controlId}:progress`,
            kind: "operationProgress" as const,
            steps: [
              { id: `${controlId}:remove`, label: "Remove placement", status: "running" as const },
              { id: `${controlId}:refresh`, label: "Refresh tree", status: "pending" as const },
            ],
            title: "Removing placement",
            updatedAt: 1,
          },
        }
      : {}),
    status:
      state === "failed"
        ? {
            accessibilityLabel: "Remove placement failed",
            detail: "Remove failed. Try again.",
            id: `${controlId}:status`,
            intent: "danger",
            kind: "compactStatus",
            label: "Remove failed.",
            status: "failed",
          }
        : isPending
          ? {
              accessibilityLabel: "Removing placement",
              detail: "Removal is in progress.",
              id: `${controlId}:status`,
              intent: "info",
              kind: "compactStatus",
              label: "Removing placement",
              pending,
              status: "pending",
            }
          : {
              accessibilityLabel: "Remove placement ready",
              detail: "Placement can be removed.",
              id: `${controlId}:status`,
              intent: "neutral",
              kind: "compactStatus",
              label: "Remove placement",
              status: "idle",
            },
    trigger: isPending
      ? { ...trigger, disabled: true, disabledReason: pending.label, pending }
      : trigger,
  };
}

function contextAction(resultId: string, stableItemId: string, label: string) {
  const id = `${stableItemId}:context`;
  return {
    availability: { available: true } as const,
    control: button(`${id}:control`, label),
    id,
    intent: { actionId: id, itemId: stableItemId, resultId, type: "treeContextAction" as const },
    kind: "treeContextAction" as const,
  };
}

function warning(
  id: string,
  source: TreeWarningContract["source"],
  title: string,
  code: string,
  message: string,
): TreeWarningContract {
  return {
    id: `warning:${id}`,
    items: [{ code, message }],
    kind: "treeWarning",
    source,
    title,
  };
}

const placementLabelSchema = {
  label: "Placement label",
  required: false,
  type: "text",
} satisfies Extract<
  FieldSchema,
  {
    type: "text";
  }
>;
const navigationLabelSchema = {
  label: "Navigation label",
  required: true,
  type: "text",
} satisfies Extract<
  FieldSchema,
  {
    type: "text";
  }
>;
const targetModeSchema = {
  default: "block",
  label: "Target mode",
  required: true,
  type: "enum",
  values: [
    { key: "block", label: "Block" },
    { key: "url", label: "URL" },
  ],
} as const satisfies Extract<
  FieldSchema,
  {
    type: "enum";
  }
>;
const targetBlockSchema = {
  label: "Target block",
  required: false,
  to: "block",
  type: "reference",
} satisfies Extract<
  FieldSchema,
  {
    type: "reference";
  }
>;
const targetBlockOptions = [
  { id: "block:home", label: "Home" },
  { id: "block:about", label: "About" },
] as const;

function navigationPlacementFields(resultId: string, id: string) {
  const fieldSetId = `${resultId}:${id}:placement-fields`;
  const recordId = `placement:${id}`;
  const control = textControl(placementLabelSchema);

  return fieldSet(fieldSetId, "Placement fields", [
    recordField({
      commit: "field-commit",
      control,
      density: "compact",
      drafts: recordDrafts({ recordValue: "Primary navigation" }),
      editor: control.editor,
      field: placementLabelSchema,
      fieldName: "label",
      labelVisibility: "visible",
      occurrence: { ownerId: fieldSetId, placementId: "label" },
      recordId,
      rendererKind: "text",
    }),
  ]);
}

function navigationChildFields(resultId: string, id: string) {
  const fieldSetId = `${resultId}:${id}:child-fields`;
  const recordId = `block:${id}`;
  const labelControl = textControl(navigationLabelSchema);
  const targetModeControl = enumControl(targetModeSchema);
  const targetBlockControl = referenceControl(targetBlockSchema);
  const iconField = specializedRecordField("source-icon", "icon", fieldSetId, recordId);

  return fieldSet(fieldSetId, "Child fields", [
    recordField({
      commit: "field-commit",
      control: labelControl,
      drafts: recordDrafts({
        draft: "Draft navigation",
        draftInput: draftInput("Draft navigation"),
        recordValue: "Navigation",
      }),
      editor: labelControl.editor,
      errors: [fieldError("label", "Navigation label could not be saved.", "Draft navigation")],
      field: navigationLabelSchema,
      fieldName: "label",
      labelVisibility: "hidden",
      occurrence: { ownerId: fieldSetId, placementId: "label" },
      presentationMode: "heading",
      recordId,
      rendererKind: "autosize-text",
    }),
    recordField({
      commit: "immediate",
      control: targetModeControl,
      drafts: recordDrafts({ recordValue: "block" }),
      editor: targetModeControl.editor,
      field: targetModeSchema,
      fieldName: "targetMode",
      labelVisibility: "visible",
      occurrence: { ownerId: fieldSetId, placementId: "targetMode" },
      options: { enumOptions: enumOptions(targetModeSchema) },
      recordId,
      rendererKind: "enum",
    }),
    recordField({
      commit: "immediate",
      control: targetBlockControl,
      drafts: recordDrafts({ recordValue: "block:missing" }),
      editor: targetBlockControl.editor,
      field: targetBlockSchema,
      fieldName: "targetBlock",
      labelVisibility: "visible",
      occurrence: { ownerId: fieldSetId, placementId: "targetBlock" },
      options: { referenceOptions: referenceOptions(targetBlockOptions) },
      recordId,
      reference: referenceEditorFacts(targetBlockSchema, "block:missing", targetBlockOptions),
      rendererKind: "reference",
      visibleWhen: { field: "targetMode", values: ["block"] },
    }),
    { ...iconField, pending: { isPending: true, label: "Saving icon" } },
  ]);
}

function specializedRecordField(
  kind: (typeof fieldScenarioGroups)[number]["kind"],
  rendererKind: "icon",
  fieldSetId: string,
  recordId: string,
) {
  const group = fieldScenarioGroups.find((candidate) => candidate.kind === kind);
  const variant = group?.variants.find(
    ({ field }) =>
      field.surface === "record" &&
      field.mode === "editor" &&
      "rendererKind" in field &&
      field.rendererKind === rendererKind,
  );

  if (!variant) {
    throw new Error(`Missing ${kind} ${rendererKind} record field scenario.`);
  }

  return withFixtureFieldOccurrence(
    { ...variant.field, labelVisibility: "visible", recordId },
    { ownerId: fieldSetId, placementId: variant.field.fieldName },
  );
}

function fieldSet<TField extends FieldContract = FieldContract>(
  id: string,
  label: string,
  fields: readonly TField[] = [],
  editing: TreeSelectedEditorContract["editing"] = { enabled: true },
): Omit<FieldSetContract, "fields"> & {
  fields: readonly TField[];
} {
  return {
    disabled: !editing.enabled,
    ...(editing.enabled ? {} : { disabledReason: editing.disabledReason }),
    fields,
    id,
    kind: "fieldSet",
    label,
  };
}

function root(label: string, resultId: string) {
  return {
    accessibilityLabel: `${label} root`,
    id: `${resultId}:root`,
    kind: "treeRoot" as const,
    label,
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

function operationButton(
  id: string,
  label: string,
  intent: OperationButtonContract["intent"],
): OperationButtonContract {
  return {
    ...button(id, label),
    intent,
    prominence: label.startsWith("Remove") ? "destructive" : "secondary",
  };
}

function treeId(id: string) {
  return `tree:fixture:${id}`;
}

function itemId(id: string) {
  return `tree-item:${id}`;
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
