import type { FieldSchema } from "@dpeek/formless-schema";
import type {
  ButtonContract,
  CreateFieldContract,
  CreateSurfaceContract,
  FieldContract,
  ManagementManifestContract,
  ManagementReadyContract,
  ManagementWorkspaceOperationContract,
  OperationControlContract,
  TableActionGroupContract,
  TableColumnContract,
  TableContract,
  TableEditActionContract,
  WorkspaceCollectionContract,
  WorkspaceCollectionActionGroupContract,
  WorkspaceContract,
  WorkspaceIntentScope,
  WorkspaceSectionContract,
} from "@dpeek/formless-presentation/contract";
import {
  managementManifestReference,
  workspaceManifestReference,
} from "@dpeek/formless-presentation/host";
import {
  booleanControl,
  createField,
  draftInput,
  enumControl,
  enumOptions,
  recordDrafts,
  recordField,
  referenceControl,
  referenceEditorFacts,
  referenceOptions,
  textControl,
} from "./fields/fixture-helpers.ts";
import { createWorkspacePushOperationControlFixture } from "./operation-controls.fixtures.ts";

export type FormlessInstanceManagementFixtureId =
  | "empty"
  | "failed"
  | "gateway-unavailable"
  | "installed"
  | "loading"
  | "push-authorization-required";

export type FormlessInstanceManagementFixtureState = {
  manifest: ManagementManifestContract;
  workspaces: readonly WorkspaceContract[];
};

export type FormlessInstanceManagementFixture = {
  id: FormlessInstanceManagementFixtureId;
  label: string;
  state: FormlessInstanceManagementFixtureState;
};

export const instanceManagementReference = managementManifestReference("instance-management");
export const instanceManagementRoutesReference = workspaceManifestReference(
  "instance-management:routes",
);
export const instanceManagementWorkspacePushOperationId = "instance-management:workspace:push";
export const instanceManagementWorkspacePushFixture = createWorkspacePushOperationControlFixture({
  id: `${instanceManagementWorkspacePushOperationId}:control`,
  outcome: "success",
});
const routeEnabledField = {
  default: true,
  label: "Enabled",
  required: true,
  type: "boolean",
} as const satisfies Extract<
  FieldSchema,
  {
    type: "boolean";
  }
>;
const routeMatchHostField = {
  label: "Match host",
  required: false,
  type: "text",
} as const satisfies Extract<
  FieldSchema,
  {
    type: "text";
  }
>;
const routeMatchPathField = {
  label: "Match path",
  required: true,
  type: "text",
} as const satisfies Extract<
  FieldSchema,
  {
    type: "text";
  }
>;
const routeMatchPrefixField = {
  label: "Match prefix",
  required: false,
  type: "text",
} as const satisfies Extract<
  FieldSchema,
  {
    type: "text";
  }
>;
const routeKindField = {
  label: "Kind",
  required: true,
  type: "enum",
  values: [
    { key: "mount", label: "Mount" },
    { key: "redirect", label: "Redirect" },
  ],
} as const satisfies Extract<
  FieldSchema,
  {
    type: "enum";
  }
>;
const routeTargetProfileField = {
  label: "Target profile",
  required: false,
  type: "enum",
  values: [
    { key: "instance", label: "Instance" },
    { key: "public-site", label: "Public Site" },
  ],
} as const satisfies Extract<
  FieldSchema,
  {
    type: "enum";
  }
>;
const routeSurfaceField = {
  label: "Surface",
  required: false,
  type: "enum",
  values: [
    { key: "admin", label: "Admin" },
    { key: "public-site", label: "Public Site" },
  ],
} as const satisfies Extract<
  FieldSchema,
  {
    type: "enum";
  }
>;
const routeAccessField = {
  label: "Access",
  required: false,
  type: "enum",
  values: [
    { key: "anonymous", label: "Anonymous" },
    { key: "authenticated", label: "Authenticated" },
    { key: "owner", label: "Owner" },
  ],
} as const satisfies Extract<
  FieldSchema,
  {
    type: "enum";
  }
>;
const routeDeploymentConfigField = {
  displayField: "label",
  label: "Deployment config",
  required: false,
  to: "deployment-config",
  type: "reference",
} as const satisfies Extract<
  FieldSchema,
  {
    type: "reference";
  }
>;
const routeDeploymentConfigOptions = [
  { id: "instance.primary", label: "instance.primary" },
] as const;

export function createFormlessInstanceManagementFixtures(): FormlessInstanceManagementFixture[] {
  return [
    fixture("loading", "Loading", {
      manifest: loadingManifest(),
      workspaces: [],
    }),
    fixture("failed", "Failed", {
      manifest: failedManifest(),
      workspaces: [],
    }),
    readyFixture("empty", "Empty", { installed: false }),
    readyFixture("installed", "Installed", {}),
    readyFixture("gateway-unavailable", "Gateway unavailable", {
      manifestOverrides: {
        workspaceFeedback: managementFeedback(
          "gateway-unavailable",
          "Workspace Push unavailable",
          "Connect the local workspace gateway to push source changes.",
          "warning",
        ),
        workspaceOperation: undefined,
      },
    }),
    readyFixture("push-authorization-required", "Push authorization", {
      pushState: "authorization-required",
    }),
  ];
}

function fixture(
  id: FormlessInstanceManagementFixtureId,
  label: string,
  state: FormlessInstanceManagementFixtureState,
): FormlessInstanceManagementFixture {
  return { id, label, state };
}

function readyFixture(
  id: FormlessInstanceManagementFixtureId,
  label: string,
  options: {
    installed?: boolean;
    manifestOverrides?: Partial<ManagementReadyContract>;
    pushState?: PushFixtureState;
  },
) {
  const installed = options.installed ?? true;
  const manifest = readyManifest(
    options.pushState === undefined
      ? options.manifestOverrides
      : {
          workspaceOperation: pushOperation(options.pushState),
          ...options.manifestOverrides,
        },
  );

  return fixture(id, label, {
    manifest,
    workspaces: [routesWorkspace(installed)],
  });
}

function manifestBase() {
  return {
    accessibilityLabel: "Instance settings overview",
    id: instanceManagementReference.managementId,
    kind: "managementManifest" as const,
    title: "Instance Settings",
  };
}

function loadingManifest(): ManagementManifestContract {
  return {
    ...manifestBase(),
    message: "Loading instance settings...",
    state: "loading",
  };
}

function failedManifest(): ManagementManifestContract {
  return {
    ...manifestBase(),
    feedback: managementFeedback(
      "load-failed",
      "Instance management unavailable",
      "Instance settings could not be loaded.",
      "danger",
    ),
    state: "failed",
  };
}

function readyManifest(overrides: Partial<ManagementReadyContract> = {}): ManagementReadyContract {
  return {
    ...manifestBase(),
    state: "ready",
    workspaceOperation: pushOperation("idle"),
    workspaces: [{ reference: instanceManagementRoutesReference, role: "routes" }],
    ...overrides,
  };
}

type PushFixtureState = "authorization-required" | "idle";

function pushOperation(state: PushFixtureState): ManagementWorkspaceOperationContract {
  const operationId = instanceManagementWorkspacePushOperationId;
  const promptId = `${operationId}:authorization`;

  return {
    ...(state === "authorization-required"
      ? {
          authorizationPrompt: {
            action: button(`${promptId}:open`, "Open authorization"),
            detail: "Authorize the local workspace gateway, then retry Push.",
            id: promptId,
            intent: {
              controlId: `${promptId}:open`,
              managementId: instanceManagementReference.managementId,
              operationId,
              promptId,
              type: "managementAuthorizationOpen" as const,
            },
            kind: "managementAuthorizationPrompt" as const,
            title: "Cloudflare authorization required",
          },
        }
      : {}),
    control: pushControl(state),
    id: operationId,
    kind: "managementWorkspaceOperation",
  };
}

function pushControl(state: PushFixtureState): OperationControlContract {
  const control = instanceManagementWorkspacePushFixture.initial;

  return state === "authorization-required"
    ? {
        ...control,
        status: {
          ...control.status,
          accessibilityLabel: "Authorization required. Authorize the workspace gateway.",
          detail: "Authorize the workspace gateway.",
          intent: "warning",
          label: "Authorization required",
        },
      }
    : control;
}

function managementFeedback(
  localId: string,
  title: string,
  detail: string,
  intent: "danger" | "info" | "success" | "warning",
) {
  return {
    detail,
    id: `instance-management:feedback:${localId}`,
    intent,
    kind: "managementFeedback" as const,
    title,
  };
}

function routesWorkspace(installed: boolean) {
  return managementWorkspace(instanceManagementRoutesReference.workspaceId, "Routes", "routes", {
    collectionActions: routeCollectionActions,
    columns: [
      ["profile", "Profile", "field"],
      ["path", "Path", "computed"],
    ],
    emptyDescription: "Program routes appear here.",
    emptyTitle: "No routes configured",
    keepCollectionReadyWhenEmpty: true,
    rowActions: (scope, [id, profile, path]) =>
      routeRowActions(scope, {
        access: id === "site-home" ? "anonymous" : "owner",
        id,
        matchPath: path,
        surface: id === "site-home" ? "public-site" : "admin",
        targetProfile: profile === "Public Site" ? "public-site" : "instance",
      }),
    rows: installed
      ? [
          ["site-home", "Public Site", "/"],
          ["instance", "Instance", "/admin"],
        ]
      : [],
  });
}

function managementWorkspace(
  workspaceId: string,
  label: string,
  localId: string,
  input: {
    columns: readonly (readonly [
      id: string,
      label: string,
      role: "computed" | "field" | "reference",
    ])[];
    collectionActions?: (scope: WorkspaceIntentScope) => WorkspaceCollectionActionGroupContract;
    emptyDescription: string;
    emptyTitle: string;
    keepCollectionReadyWhenEmpty?: boolean;
    rowActions?: (
      scope: WorkspaceIntentScope,
      row: readonly [id: string, first: string, second: string],
    ) => TableActionGroupContract;
    rows: readonly (readonly [id: string, first: string, second: string])[];
    sectionActions?: (scope: WorkspaceIntentScope) => WorkspaceSectionContract["actions"];
  },
): WorkspaceContract {
  const scope = workspaceScope(workspaceId, localId);
  const table = managementTable(scope, label, input);
  const queryNavigation = managementQueryNavigation(scope, input.rows.length);
  const collection: WorkspaceCollectionContract = {
    accessibilityLabel: label,
    availability:
      input.rows.length === 0 && !input.keepCollectionReadyWhenEmpty
        ? {
            emptyState: {
              description: input.emptyDescription,
              id: `${scope.collectionId}:empty`,
              kind: "workspaceEmptyState",
              title: input.emptyTitle,
            },
            state: "empty",
          }
        : { state: "ready" },
    id: scope.collectionId,
    kind: "workspaceCollection",
    label,
    presentation: {
      actions: input.collectionActions?.(scope) ?? emptyCollectionActions(scope),
      kind: "ordinary",
      queryNavigation,
      result: table,
      summaries: [],
    },
    selectedQueryId: queryNavigation.items[0]!.id,
  };
  const section: WorkspaceSectionContract = {
    accessibilityLabel: `${label} section`,
    actions: input.sectionActions?.(scope) ?? [],
    collection,
    headingVisibility: "hidden",
    id: scope.sectionId,
    kind: "workspaceSection",
    label,
  };

  return {
    accessibilityLabel: `${label} workspace`,
    actions: [],
    id: workspaceId,
    kind: "workspace",
    label,
    sections: [section],
    surface: "constrained",
    width: "standard",
  };
}

function managementTable(
  scope: WorkspaceIntentScope,
  label: string,
  input: {
    columns: readonly (readonly [
      id: string,
      label: string,
      role: "computed" | "field" | "reference",
    ])[];
    emptyDescription: string;
    emptyTitle: string;
    rowActions?: (
      scope: WorkspaceIntentScope,
      row: readonly [id: string, first: string, second: string],
    ) => TableActionGroupContract;
    rows: readonly (readonly [id: string, first: string, second: string])[];
  },
): TableContract {
  const resultId = `${scope.collectionId}:result`;
  const columns = [
    ...input.columns.map(([id, columnLabel, contentRole], index) => ({
      accessibilityLabel: columnLabel,
      alignment: "start" as const,
      contentRole,
      id,
      isRowHeader: index === 0,
      kind: "tableColumn" as const,
      label: columnLabel,
      labelVisibility: "visible" as const,
      width: index === 0 ? ("auto" as const) : ("md" as const),
    })),
    ...(input.rowActions === undefined
      ? []
      : [
          {
            accessibilityLabel: `${label} operations`,
            alignment: "end" as const,
            contentRole: "actions" as const,
            id: "actions",
            isRowHeader: false,
            kind: "tableColumn" as const,
            label: "Actions",
            labelVisibility: "hidden" as const,
            width: "xs" as const,
          },
        ]),
  ] satisfies readonly TableColumnContract[];

  return {
    accessibilityLabel: label,
    columns,
    density: "default",
    editing:
      input.rowActions === undefined
        ? { disabledReason: "Fixture records are read-only.", enabled: false }
        : { enabled: true },
    ...(input.rows.length === 0
      ? {
          emptyState: {
            description: input.emptyDescription,
            id: `${resultId}:empty`,
            kind: "tableEmptyState" as const,
            title: input.emptyTitle,
          },
        }
      : {}),
    id: resultId,
    kind: "table",
    rows: input.rows.map((row) => ({
      accessibilityLabel: `${row[1]} ${label.toLowerCase()} record`,
      cells: [
        tableCell(row[0], columns[0]!, row[1]),
        tableCell(row[0], columns[1]!, row[2]),
        ...(input.rowActions === undefined
          ? []
          : [
              {
                columnId: "actions",
                contents: [input.rowActions(scope, row)],
                id: `${row[0]}:actions`,
                kind: "tableCell" as const,
              },
            ]),
      ],
      id: `${resultId}:row:${row[0]}`,
      kind: "tableRow" as const,
      warnings: [],
    })),
  };
}

function routeCollectionActions(
  scope: WorkspaceIntentScope,
): WorkspaceCollectionActionGroupContract {
  return {
    id: `${scope.collectionId}:actions`,
    kind: "workspaceCollectionActions",
    primary: [{ kind: "createAction", surface: routeCreateSurface(scope) }],
    secondary: [],
    secondaryAccessibilityLabel: "More route actions",
  };
}

function routeCreateSurface(scope: WorkspaceIntentScope): CreateSurfaceContract {
  const id = `${scope.collectionId}:create:route`;
  const title = "Create Route";

  return {
    dialog: {
      form: {
        cancel: button(`${id}:cancel`, "Cancel"),
        errors: [],
        fieldSet: {
          disabled: false,
          fields: routeCreateFields(id),
          id: `${id}:fields`,
          kind: "fieldSet",
        },
        id: `${id}:form`,
        kind: "createForm",
        submit: button(`${id}:submit`, title, { prominence: "primary", type: "submit" }),
      },
      id: `${id}:dialog`,
      kind: "createDialog",
      open: false,
      title,
    },
    id,
    kind: "createSurface",
    trigger: {
      ...button(`${id}:trigger`, title, { prominence: "primary" }),
      content: { icon: "add", kind: "iconAndLabel", label: title },
    },
  };
}

function routeCreateFields(ownerId: string): CreateFieldContract[] {
  return [
    createRouteBooleanField(ownerId, "enabled", routeEnabledField, true),
    createRouteTextField(ownerId, "matchHost", routeMatchHostField, ""),
    createRouteTextField(ownerId, "matchPath", routeMatchPathField, "/docs"),
    createRouteTextField(ownerId, "matchPrefix", routeMatchPrefixField, ""),
    createRouteEnumField(ownerId, "kind", routeKindField, "mount"),
    createRouteEnumField(ownerId, "targetProfile", routeTargetProfileField, "public-site"),
    createRouteEnumField(ownerId, "surface", routeSurfaceField, "public-site"),
    createRouteEnumField(ownerId, "access", routeAccessField, "anonymous"),
    createRouteReferenceField(
      ownerId,
      "deploymentConfig",
      routeDeploymentConfigField,
      "instance.primary",
      routeDeploymentConfigOptions,
    ),
  ];
}

function createRouteTextField(
  ownerId: string,
  fieldName: string,
  field: Extract<
    FieldSchema,
    {
      type: "text";
    }
  >,
  value: string,
) {
  const control = textControl(field);

  return createField({
    control,
    draftInput: draftInput(value),
    editor: control.editor,
    field,
    fieldName,
    labelVisibility: "visible",
    occurrence: { ownerId, placementId: fieldName },
    recordId: ownerId,
    value,
  });
}

function createRouteBooleanField(
  ownerId: string,
  fieldName: string,
  field: Extract<
    FieldSchema,
    {
      type: "boolean";
    }
  >,
  value: boolean,
) {
  const control = booleanControl(field);

  return createField({
    control,
    draftInput: draftInput(value),
    editor: control.editor,
    field,
    fieldName,
    labelVisibility: "visible",
    occurrence: { ownerId, placementId: fieldName },
    recordId: ownerId,
    value,
  });
}

function createRouteEnumField(
  ownerId: string,
  fieldName: string,
  field: Extract<
    FieldSchema,
    {
      type: "enum";
    }
  >,
  value: string,
) {
  const control = enumControl(field);

  return createField({
    control,
    draftInput: draftInput(value),
    editor: control.editor,
    field,
    fieldName,
    labelVisibility: "visible",
    occurrence: { ownerId, placementId: fieldName },
    options: { enumOptions: enumOptions(field) },
    recordId: ownerId,
    value,
  });
}

function createRouteReferenceField(
  ownerId: string,
  fieldName: string,
  field: Extract<
    FieldSchema,
    {
      type: "reference";
    }
  >,
  value: string,
  options: readonly {
    id: string;
    label: string;
  }[],
) {
  const control = referenceControl(field);
  return createField({
    control,
    draftInput: draftInput(value),
    editor: control.editor,
    field,
    fieldName,
    labelVisibility: "visible",
    occurrence: { ownerId, placementId: fieldName },
    options: { referenceOptions: referenceOptions(options) },
    recordId: ownerId,
    reference: referenceEditorFacts(field, value, options),
    value,
  });
}

type RouteFixtureRecord = {
  access: "anonymous" | "authenticated" | "owner";
  id: string;
  matchPath: string;
  surface: "admin" | "public-site";
  targetProfile: "instance" | "public-site";
};

function routeRowActions(
  scope: WorkspaceIntentScope,
  record: RouteFixtureRecord,
): TableActionGroupContract {
  return {
    id: `${scope.collectionId}:result:row:${record.id}:actions`,
    kind: "actionGroup",
    primary: [],
    secondary: [routeEditAction(scope, record)],
    secondaryAccessibilityLabel: `Route operations for ${record.matchPath}`,
  };
}

function routeEditAction(
  scope: WorkspaceIntentScope,
  record: RouteFixtureRecord,
): TableEditActionContract {
  const tableId = `${scope.collectionId}:result`;
  const rowId = `${tableId}:row:${record.id}`;
  const dialogId = `${rowId}:route.update:dialog`;
  const openIntent = {
    dialogId,
    open: true,
    rowId,
    tableId,
    type: "tableEditDialogOpenChange" as const,
  };

  return {
    dialog: {
      close: button(`${dialogId}:close`, "Done", { density: "compact" }),
      description: "Route",
      id: dialogId,
      kind: "tableEditDialog",
      open: false,
      openChangeIntent: { ...openIntent, open: false },
      target: {
        fieldSet: {
          disabled: false,
          fields: routeEditFields(rowId, record),
          id: `${dialogId}:fields`,
          kind: "fieldSet",
        },
        kind: "available",
      },
      targetKind: "row",
      title: "Edit route",
    },
    kind: "editAction",
    openIntent,
    trigger: button(`${dialogId}:open`, "Edit route", { density: "compact" }),
  };
}

function routeEditFields(rowId: string, record: RouteFixtureRecord): FieldContract[] {
  return [
    recordRouteBooleanField(rowId, "enabled", routeEnabledField, true),
    recordRouteTextField(rowId, "matchHost", routeMatchHostField, ""),
    recordRouteTextField(rowId, "matchPath", routeMatchPathField, record.matchPath),
    recordRouteTextField(rowId, "matchPrefix", routeMatchPrefixField, ""),
    recordRouteEnumField(rowId, "targetProfile", routeTargetProfileField, record.targetProfile),
    recordRouteEnumField(rowId, "surface", routeSurfaceField, record.surface),
    recordRouteEnumField(rowId, "access", routeAccessField, record.access),
    recordRouteReferenceField(
      rowId,
      "deploymentConfig",
      routeDeploymentConfigField,
      "instance.primary",
      routeDeploymentConfigOptions,
    ),
  ];
}

function recordRouteTextField(
  rowId: string,
  fieldName: string,
  field: Extract<
    FieldSchema,
    {
      type: "text";
    }
  >,
  value: string,
) {
  const control = textControl(field);

  return recordField({
    commit: "field-commit",
    control,
    drafts: recordDrafts({ recordValue: value }),
    editor: control.editor,
    field,
    fieldName,
    labelVisibility: "visible",
    occurrence: { ownerId: rowId, placementId: fieldName },
    recordId: rowId,
    rendererKind: "text",
  });
}

function recordRouteBooleanField(
  rowId: string,
  fieldName: string,
  field: Extract<
    FieldSchema,
    {
      type: "boolean";
    }
  >,
  value: boolean,
) {
  const control = booleanControl(field);

  return recordField({
    commit: "immediate",
    control,
    drafts: recordDrafts({ recordValue: value }),
    editor: control.editor,
    field,
    fieldName,
    labelVisibility: "visible",
    occurrence: { ownerId: rowId, placementId: fieldName },
    recordId: rowId,
    rendererKind: "checkbox",
  });
}

function recordRouteEnumField(
  rowId: string,
  fieldName: string,
  field: Extract<
    FieldSchema,
    {
      type: "enum";
    }
  >,
  value: string,
) {
  const control = enumControl(field);

  return recordField({
    commit: "immediate",
    control,
    drafts: recordDrafts({ recordValue: value }),
    editor: control.editor,
    field,
    fieldName,
    labelVisibility: "visible",
    occurrence: { ownerId: rowId, placementId: fieldName },
    options: { enumOptions: enumOptions(field) },
    recordId: rowId,
    rendererKind: "enum",
  });
}

function recordRouteReferenceField(
  rowId: string,
  fieldName: string,
  field: Extract<
    FieldSchema,
    {
      type: "reference";
    }
  >,
  value: string,
  options: readonly {
    id: string;
    label: string;
  }[],
) {
  const control = referenceControl(field);
  return recordField({
    commit: "immediate",
    control,
    drafts: recordDrafts({ recordValue: value }),
    editor: control.editor,
    field,
    fieldName,
    labelVisibility: "visible",
    occurrence: { ownerId: rowId, placementId: fieldName },
    options: { referenceOptions: referenceOptions(options) },
    recordId: rowId,
    reference: referenceEditorFacts(field, value, options),
    rendererKind: "reference",
  });
}

function tableCell(rowId: string, column: TableColumnContract, displayValue: string) {
  return {
    columnId: column.id,
    contents: [
      {
        accessibilityLabel: `${column.label}: ${displayValue}`,
        displayValue,
        kind: "displayValue" as const,
        status: { kind: "ready" as const },
        valueKind:
          column.contentRole === "reference"
            ? ("reference" as const)
            : column.contentRole === "computed"
              ? ("computed" as const)
              : ("text" as const),
      },
    ],
    id: `${rowId}:${column.id}`,
    kind: "tableCell" as const,
  };
}

function managementQueryNavigation(scope: WorkspaceIntentScope, count: number) {
  const allId = `${scope.collectionId}:query:all`;
  const activeId = `${scope.collectionId}:query:active`;
  const item = (id: string, label: string, selected: boolean) => ({
    availability: { available: true as const },
    countText: String(count),
    id,
    kind: "workspaceQuery" as const,
    label,
    selected,
    selectionIntent: { ...scope, queryId: id, type: "workspaceQuerySelection" as const },
  });

  return {
    accessibilityLabel: `${scope.collectionId} queries`,
    id: `${scope.collectionId}:queries`,
    items: [item(allId, "All", true), item(activeId, "Active", false)],
    kind: "workspaceQueryNavigation" as const,
  };
}

function emptyCollectionActions(scope: WorkspaceIntentScope) {
  return {
    id: `${scope.collectionId}:actions`,
    kind: "workspaceCollectionActions" as const,
    primary: [],
    secondary: [],
    secondaryAccessibilityLabel: `More actions for ${scope.collectionId}`,
  };
}

function workspaceScope(workspaceId: string, localId: string): WorkspaceIntentScope {
  const sectionId = `${workspaceId}:section:${localId}`;
  return {
    collectionId: `${sectionId}:collection:${localId}`,
    screenId: workspaceId,
    sectionId,
  };
}

function button(
  id: string,
  label: string,
  options: {
    density?: ButtonContract["density"];
    disabled?: boolean;
    disabledReason?: string;
    pending?: ButtonContract["pending"];
    prominence?: ButtonContract["prominence"];
    type?: ButtonContract["type"];
  } = {},
): ButtonContract {
  return {
    accessibilityLabel: label,
    content: { kind: "label", label: label.replace(/ workspace$/, "") },
    density: options.density ?? "default",
    ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
    ...(options.disabledReason === undefined ? {} : { disabledReason: options.disabledReason }),
    id,
    kind: "button",
    ...(options.pending === undefined ? {} : { pending: options.pending }),
    prominence: options.prominence ?? "secondary",
    type: options.type ?? "button",
  };
}
