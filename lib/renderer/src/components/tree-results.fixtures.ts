import type { FieldSchema } from "@dpeek/formless-schema";
import type {
  ButtonContract,
  CompactStatusContract,
  CreateFieldContract,
  CreateSurfaceContract,
  OperationButtonContract,
  OperationControlContract,
  RecordResultContract,
  TreeChildCreationContract,
  TreeContextActionContract,
  TreeNodeActionContract,
  TreeNodeContract,
  TreeNodeStructureContract,
  TreeOrderingContract,
  TreeResultContract,
  TreeWarningContract,
} from "@dpeek/formless-presentation/contract";
import { createField, recordDrafts, recordField, textControl } from "./fields/fixture-helpers.ts";

export type TreeResultFixtureId =
  | "actions"
  | "cycle"
  | "duplicate-occurrences"
  | "editing-disabled"
  | "empty"
  | "leaf"
  | "maximum-depth"
  | "missing-child"
  | "no-actions"
  | "pending"
  | "shallow"
  | "unavailable"
  | "warnings";

export type TreeResultFixture = {
  id: TreeResultFixtureId;
  label: string;
  tree: TreeResultContract;
};

const labelSchema = {
  label: "Label",
  required: true,
  type: "text",
} satisfies Extract<FieldSchema, { type: "text" }>;
const labelControl = textControl(labelSchema);

export function createTreeResultFixtures(): TreeResultFixture[] {
  return [
    { id: "shallow", label: "Shallow", tree: shallowTree() },
    { id: "actions", label: "Actions", tree: actionsTree() },
    {
      id: "duplicate-occurrences",
      label: "Duplicate occurrences",
      tree: duplicateOccurrencesTree(),
    },
    { id: "maximum-depth", label: "Maximum depth", tree: maximumDepthTree() },
    { id: "no-actions", label: "No actions", tree: noActionsTree() },
    { id: "missing-child", label: "Missing child", tree: structuralTree("missingChild") },
    { id: "cycle", label: "Cycle stopped", tree: structuralTree("cycleStopped") },
    { id: "leaf", label: "Leaf", tree: structuralTree("leaf") },
    { id: "warnings", label: "Warnings", tree: warningsTree() },
    { id: "editing-disabled", label: "Editing disabled", tree: editingDisabledTree() },
    { id: "pending", label: "Pending", tree: pendingTree() },
    { id: "empty", label: "Empty", tree: emptyTree() },
    { id: "unavailable", label: "Unavailable", tree: unavailableTree() },
  ];
}

function shallowTree(): TreeResultContract {
  const resultId = treeId("shallow");
  const rootId = `${resultId}:root:page:homepage`;
  const navigationId = `${rootId}:placement:navigation`;

  return readyTree({
    id: resultId,
    root: treeNode({
      actions: [contextAction(resultId, rootId, "Open homepage")],
      children: [
        treeNode({
          children: [
            treeNode({
              entityTypeLabel: "Logo",
              id: `${navigationId}:placement:brand`,
              label: "Brand",
              recordId: "block:brand",
              resultId,
              slot: "Start",
              value: "Formless",
              variant: "Logo",
            }),
            treeNode({
              entityTypeLabel: "Link group",
              id: `${navigationId}:placement:links`,
              label: "Primary links",
              recordId: "block:links",
              resultId,
              slot: "Main",
              value: "Primary links",
              variant: "Group",
            }),
          ],
          entityTypeLabel: "Navigation",
          id: navigationId,
          label: "Navigation",
          recordId: "block:navigation",
          resultId,
          slot: "Header",
          value: "Navigation",
          variant: "Navigation",
        }),
        treeNode({
          entityTypeLabel: "Hero",
          id: `${rootId}:placement:hero`,
          label: "Hero",
          recordId: "block:hero",
          resultId,
          slot: "Main",
          value: "Build without boilerplate",
          variant: "Hero",
        }),
      ],
      entityTypeLabel: "Page",
      id: rootId,
      label: "Homepage",
      recordId: "page:homepage",
      resultId,
      value: "Homepage",
    }),
  });
}

function actionsTree(): TreeResultContract {
  const resultId = treeId("actions");
  const rootId = `${resultId}:root:page:landing`;
  const childId = `${rootId}:placement:announcement`;

  return readyTree({
    id: resultId,
    root: treeNode({
      actions: [
        contextAction(resultId, rootId, "Open landing page"),
        childCreation(resultId, rootId, { active: false }),
        operationAction(resultId, rootId, "Delete landing page", "rootDelete", {
          confirmationOpen: false,
        }),
      ],
      children: [
        treeNode({
          actions: [
            contextAction(resultId, childId, "Open announcement"),
            childCreation(resultId, childId, { active: true }),
            ordering(resultId, childId),
            operationAction(
              resultId,
              childId,
              "Remove announcement placement",
              "placementRemoval",
              {
                confirmationOpen: true,
              },
            ),
          ],
          entityTypeLabel: "Announcement",
          id: childId,
          label: "Announcement",
          recordId: "block:announcement",
          resultId,
          slot: "Main",
          value: "New release",
          variant: "Banner",
        }),
      ],
      entityTypeLabel: "Page",
      id: rootId,
      label: "Landing page",
      recordId: "page:landing",
      resultId,
      value: "Landing page",
    }),
  });
}

function duplicateOccurrencesTree(): TreeResultContract {
  const resultId = treeId("duplicate-occurrences");
  const rootId = `${resultId}:root:page:pricing`;

  return readyTree({
    id: resultId,
    root: treeNode({
      children: [
        treeNode({
          entityTypeLabel: "Promotion",
          id: `${rootId}:placement:promo-main`,
          label: "Shared promotion in Main",
          recordId: "block:shared-promotion",
          resultId,
          slot: "Main",
          value: "Start free",
          variant: "Call to action",
        }),
        treeNode({
          entityTypeLabel: "Promotion",
          id: `${rootId}:placement:promo-footer`,
          label: "Shared promotion in Footer",
          recordId: "block:shared-promotion",
          resultId,
          slot: "Footer",
          value: "Start free",
          variant: "Call to action",
        }),
      ],
      entityTypeLabel: "Page",
      id: rootId,
      label: "Pricing",
      recordId: "page:pricing",
      resultId,
      value: "Pricing",
    }),
  });
}

function maximumDepthTree(): TreeResultContract {
  const resultId = treeId("maximum-depth");
  const labels = ["Page", "Section", "Container", "Stack", "Group", "Panel", "Content", "Text"];
  let child: TreeNodeContract | undefined;

  for (let index = labels.length - 1; index >= 0; index -= 1) {
    const label = labels[index] ?? `Level ${index + 1}`;
    const id = `${resultId}:depth:${index + 1}`;
    child = treeNode({
      children: child ? [child] : [],
      entityTypeLabel: label,
      id,
      label,
      recordId: `block:depth:${index + 1}`,
      resultId,
      structure:
        index === labels.length - 1
          ? { message: "Maximum tree depth reached.", state: "depthStopped" }
          : undefined,
      value: label,
      variant: label,
    });
  }

  return readyTree({ id: resultId, root: required(child) });
}

function noActionsTree(): TreeResultContract {
  const resultId = treeId("no-actions");
  return readyTree({
    id: resultId,
    root: treeNode({
      entityTypeLabel: "Page",
      id: `${resultId}:root:page:readonly`,
      label: "Read-only page",
      recordId: "page:readonly",
      resultId,
      value: "Read-only page",
    }),
  });
}

function structuralTree(
  state: Extract<TreeNodeStructureContract["state"], "cycleStopped" | "leaf" | "missingChild">,
): TreeResultContract {
  const resultId = treeId(state);
  const rootId = `${resultId}:root:page:article`;
  const childId = `${rootId}:placement:${state}`;
  const structure: TreeNodeStructureContract =
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
    root: treeNode({
      children: [
        treeNode({
          actions:
            state === "missingChild"
              ? [
                  operationAction(
                    resultId,
                    childId,
                    "Remove missing placement",
                    "placementRemoval",
                    { confirmationOpen: false },
                  ),
                ]
              : [],
          editor: state !== "missingChild",
          entityTypeLabel: "Block",
          id: childId,
          label: state === "missingChild" ? "Missing child" : state === "leaf" ? "Body" : "Loop",
          recordId: `block:${state}`,
          resultId,
          structure,
          value: state,
        }),
      ],
      entityTypeLabel: "Page",
      id: rootId,
      label: "Article",
      recordId: "page:article",
      resultId,
      value: "Article",
    }),
  });
}

function warningsTree(): TreeResultContract {
  const resultId = treeId("warnings");
  const rootId = `${resultId}:root:page:portfolio`;

  return readyTree({
    id: resultId,
    root: treeNode({
      children: [
        treeNode({
          entityTypeLabel: "Gallery",
          id: `${rootId}:placement:gallery`,
          label: "Gallery",
          recordId: "block:gallery",
          resultId,
          value: "Gallery",
          warnings: [
            warning("placement", "Placement readiness", "Placement is hidden."),
            warning("child", "Block readiness", "Image reference is unavailable."),
          ],
        }),
      ],
      entityTypeLabel: "Page",
      id: rootId,
      label: "Portfolio",
      recordId: "page:portfolio",
      resultId,
      value: "Portfolio",
    }),
    warnings: [warning("tree", "Page readiness", "The page contains unpublished changes.")],
  });
}

function editingDisabledTree(): TreeResultContract {
  const resultId = treeId("editing-disabled");
  return readyTree({
    editing: { disabledReason: "Editing requires an owner session.", enabled: false },
    id: resultId,
    root: treeNode({
      availability: { available: false, message: "This block cannot be edited." },
      editing: { disabledReason: "Editing requires an owner session.", enabled: false },
      entityTypeLabel: "Page",
      id: `${resultId}:root:page:locked`,
      label: "Locked page",
      recordId: "page:locked",
      resultId,
      value: "Locked page",
    }),
  });
}

function pendingTree(): TreeResultContract {
  const resultId = treeId("pending");
  const rootId = `${resultId}:root:page:features`;
  const childId = `${rootId}:placement:grid`;

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
    root: treeNode({
      children: [
        treeNode({
          actions: [
            childCreation(resultId, childId, { active: true, pending: true }),
            ordering(resultId, childId, true),
            operationAction(resultId, childId, "Remove feature grid", "placementRemoval", {
              pending: true,
            }),
          ],
          entityTypeLabel: "Feature grid",
          id: childId,
          label: "Feature grid",
          recordId: "block:feature-grid",
          resultId,
          slot: "Main",
          value: "Feature grid",
          variant: "Grid",
        }),
      ],
      entityTypeLabel: "Page",
      id: rootId,
      label: "Features",
      recordId: "page:features",
      resultId,
      value: "Features",
    }),
    status: compactStatus(`${resultId}:status`, "Moving block", "pending"),
  });
}

function emptyTree(): TreeResultContract {
  const id = treeId("empty");
  return {
    accessibilityLabel: "Empty page composition",
    availability: {
      emptyState: {
        action: { kind: "createAction", surface: createSurface(`${id}:create-root`, false, false) },
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
    kind: "treeResult",
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
    kind: "treeResult",
    warnings: [],
  };
}

function readyTree({
  editing = { enabled: true },
  feedback = [],
  id,
  root,
  status,
  warnings = [],
}: {
  editing?: TreeResultContract["editing"];
  feedback?: TreeResultContract["feedback"];
  id: string;
  root: TreeNodeContract;
  status?: TreeResultContract["status"];
  warnings?: readonly TreeWarningContract[];
}): TreeResultContract {
  return {
    accessibilityLabel: `${root.label} composition tree`,
    availability: { state: "ready" },
    density: "default",
    editing,
    feedback,
    id,
    kind: "treeResult",
    root,
    ...(status ? { status } : {}),
    warnings,
  };
}

function treeNode({
  actions = [],
  availability = { available: true },
  children = [],
  editing = { enabled: true },
  editor = true,
  entityTypeLabel,
  id,
  label,
  recordId,
  resultId: _resultId,
  slot,
  structure,
  value,
  variant,
  warnings = [],
}: {
  actions?: readonly TreeNodeActionContract[];
  availability?: TreeNodeContract["availability"];
  children?: readonly TreeNodeContract[];
  editing?: RecordResultContract["editing"];
  editor?: boolean;
  entityTypeLabel: string;
  id: string;
  label: string;
  recordId: string;
  resultId: string;
  slot?: string;
  structure?: TreeNodeStructureContract;
  value: string;
  variant?: string;
  warnings?: readonly TreeWarningContract[];
}): TreeNodeContract {
  return {
    accessibilityLabel: label,
    availability,
    children,
    ...(editor ? { editor: recordResult(`${id}:editor`, recordId, label, value, editing) } : {}),
    entityTypeLabel,
    headerActions: {
      accessibilityLabel: `More ${label.toLowerCase()} actions`,
      id: `${id}:header-actions`,
      items: actions,
      kind: "treeNodeActions",
    },
    id,
    kind: "treeNode",
    label,
    ...(slot
      ? { slot: { id: `${id}:slot:${slug(slot)}`, kind: "treeNodeSlot", label: slot } }
      : {}),
    structure: structure ?? { state: children.length > 0 ? "branch" : "leaf" },
    ...(variant
      ? {
          variant: {
            id: `${id}:variant:${slug(variant)}`,
            kind: "treeNodeVariant",
            label: variant,
          },
        }
      : {}),
    warnings,
  };
}

function recordResult(
  id: string,
  recordId: string,
  accessibilityLabel: string,
  value: string,
  editing: RecordResultContract["editing"],
): RecordResultContract {
  const field = recordField({
    commit: "field-commit",
    control: labelControl,
    drafts: recordDrafts({ recordValue: value }),
    editor: labelControl.editor,
    field: labelSchema,
    fieldName: "label",
    labelVisibility: "visible",
    occurrence: { ownerId: id, placementId: "label" },
    recordId,
    rendererKind: "text",
  });

  return {
    accessibilityLabel: `${accessibilityLabel} editor`,
    actions: {
      id: `${id}:actions`,
      kind: "actionGroup",
      primary: [],
      secondary: [],
      secondaryAccessibilityLabel: `More ${accessibilityLabel.toLowerCase()} record actions`,
    },
    availability: { state: "ready" },
    density: "compact",
    editing,
    fields: [field],
    id,
    kind: "recordResult",
    selectedRecord: {
      accessibilityLabel,
      id: recordId,
      kind: "recordResultRecord",
    },
    warnings: [],
  };
}

function contextAction(
  resultId: string,
  nodeId: string,
  accessibilityLabel: string,
  available = true,
): TreeContextActionContract {
  const id = `${nodeId}:context`;
  const message = "This block is unavailable as a context target.";
  return {
    availability: available ? { available: true } : { available: false, message },
    control: {
      ...button(`${id}:control`, accessibilityLabel),
      ...(available ? {} : { disabled: true, disabledReason: message }),
    },
    id,
    intent: { actionId: id, nodeId, resultId, type: "treeContextAction" },
    kind: "treeContextAction",
  };
}

function childCreation(
  resultId: string,
  nodeId: string,
  { active, pending = false }: { active: boolean; pending?: boolean },
): TreeChildCreationContract {
  const id = `${nodeId}:children`;
  const textVariantId = `${id}:variant:text`;
  const surface = createSurface(`${id}:create:text`, active, pending);

  return {
    accessibilityLabel: `Add child to ${nodeId.split(":").at(-1) ?? "block"}`,
    ...(active ? { activeCreateSurface: surface, activeVariantId: textVariantId } : {}),
    id,
    kind: "treeChildCreation",
    variants: [
      childVariant(resultId, nodeId, textVariantId, "Text", "Main", active),
      childVariant(resultId, nodeId, `${id}:variant:image`, "Image", "Media", false),
    ],
  };
}

function childVariant(
  resultId: string,
  nodeId: string,
  id: string,
  label: string,
  slot: string,
  selected: boolean,
): TreeChildCreationContract["variants"][number] {
  return {
    availability: { available: true },
    id,
    kind: "treeChildVariant",
    label,
    selected,
    selectionIntent: { nodeId, resultId, variantId: id, type: "treeChildVariantSelection" },
    slot: { id: `${id}:slot`, kind: "treeNodeSlot", label: slot },
  };
}

function ordering(resultId: string, nodeId: string, pending = false): TreeOrderingContract {
  const directions = ["top", "up", "down", "bottom"] as const;
  return {
    accessibilityLabel: `Reorder ${nodeId.split(":").at(-1) ?? "block"}`,
    actions: directions.map((direction, index) => {
      const id = `${nodeId}:order:${direction}`;
      const structurallyAvailable = index > 1;
      return {
        direction,
        ...(pending ? { disabled: true, pending: { isPending: true, label: "Ordering" } } : {}),
        id,
        intent: { actionId: id, direction, nodeId, resultId, type: "treeReorder" },
        label: `Move ${direction}`,
        structurallyAvailable,
      };
    }),
    affordance: "reorder",
    id: `${nodeId}:ordering`,
    kind: "treeOrderingAction",
    pending,
  };
}

function operationAction(
  _resultId: string,
  nodeId: string,
  label: string,
  role: "placementRemoval" | "rootDelete",
  options: { confirmationOpen?: boolean; pending?: boolean } = {},
): TreeNodeActionContract {
  const id = `${nodeId}:${role}`;
  return {
    control: operationControl(id, label, options),
    kind: "operationAction",
    role,
  };
}

function operationControl(
  id: string,
  label: string,
  { confirmationOpen = false, pending = false }: { confirmationOpen?: boolean; pending?: boolean },
): OperationControlContract {
  const status = compactStatus(
    `${id}:status`,
    pending ? `${label} in progress` : `${label} available`,
    pending ? "pending" : "idle",
  );
  const trigger = operationButton(`${id}:trigger`, id, label, "menuItem", "quiet", pending);

  return {
    confirmation: {
      action: operationButton(
        `${id}:confirm`,
        id,
        label,
        "confirmationDialog",
        "destructive",
        pending,
      ),
      cancel: operationButton(`${id}:cancel`, id, "Cancel", "button", "secondary", false),
      closeIntent: { controlId: id, open: false, type: "operationConfirmationOpenChange" },
      description: `${label} will update the flat stored records.`,
      id: `${id}:confirmation`,
      kind: "destructiveConfirmation",
      open: confirmationOpen,
      title: `${label}?`,
    },
    ...(pending
      ? {
          feedback: {
            id: `${id}:feedback`,
            intent: "info" as const,
            kind: "operationFeedbackEvent" as const,
            status: "pending" as const,
            title: `${label} in progress`,
          },
          progress: {
            id: `${id}:progress`,
            kind: "operationProgress" as const,
            steps: [{ id: `${id}:step`, label, status: "running" as const }],
            title: `${label} in progress`,
            updatedAt: 1,
          },
        }
      : {}),
    id,
    kind: "operationControl",
    status,
    trigger,
  };
}

function operationButton(
  id: string,
  controlId: string,
  label: string,
  invocationSource: "button" | "confirmationDialog" | "menuItem",
  prominence: OperationButtonContract["prominence"],
  pending: boolean,
): OperationButtonContract {
  return {
    accessibilityLabel: label,
    content: { kind: "label", label },
    density: "compact",
    ...(pending
      ? { disabled: true, pending: { isPending: true, label: `${label} in progress` } }
      : {}),
    id,
    intent: { controlId, invocationSource, type: "operationInvoke" },
    kind: "button",
    prominence,
    type: "button",
  };
}

function compactStatus(
  id: string,
  label: string,
  status: CompactStatusContract["status"],
): CompactStatusContract {
  return {
    accessibilityLabel: label,
    detail: label,
    id,
    intent: status === "pending" ? "info" : "neutral",
    kind: "compactStatus",
    label,
    ...(status === "pending" ? { pending: { isPending: true, label } } : {}),
    status,
  };
}

function createSurface(id: string, open: boolean, pending: boolean): CreateSurfaceContract {
  const field = createField({
    control: labelControl,
    draftInput: { kind: "input", value: "New text block" },
    editor: labelControl.editor,
    field: labelSchema,
    fieldName: "label",
    labelVisibility: "visible",
    occurrence: { ownerId: id, placementId: "label" },
    recordId: id,
    value: "New text block",
  }) satisfies CreateFieldContract;

  return {
    dialog: {
      form: {
        cancel: button(`${id}:cancel`, "Cancel"),
        errors: [],
        fieldSet: {
          disabled: pending,
          ...(pending ? { disabledReason: "Creating block" } : {}),
          fields: [field],
          id: `${id}:fields`,
          kind: "fieldSet",
        },
        id: `${id}:form`,
        kind: "createForm",
        submit: {
          ...button(`${id}:submit`, "Create block", "submit"),
          ...(pending
            ? { disabled: true, pending: { isPending: true, label: "Creating block" } }
            : {}),
          prominence: "primary",
        },
      },
      id: `${id}:dialog`,
      kind: "createDialog",
      open,
      title: "Add text block",
    },
    id,
    kind: "createSurface",
    trigger: button(`${id}:trigger`, "Add block"),
  };
}

function warning(
  source: TreeWarningContract["source"],
  title: string,
  message: string,
): TreeWarningContract {
  const id = `warning:${source}:${slug(title)}`;
  return {
    id,
    items: [{ code: id, message }],
    kind: "treeWarning",
    source,
    title,
  };
}

function button(
  id: string,
  label: string,
  type: ButtonContract["type"] = "button",
): ButtonContract {
  return {
    accessibilityLabel: label,
    content: { kind: "label", label },
    density: "compact",
    id,
    kind: "button",
    prominence: "secondary",
    type,
  };
}

function treeId(id: string) {
  return `tree:${id}`;
}

function slug(value: string) {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");
}

function required<Value>(value: Value | undefined): Value {
  if (value === undefined) {
    throw new Error("Expected value.");
  }
  return value;
}
