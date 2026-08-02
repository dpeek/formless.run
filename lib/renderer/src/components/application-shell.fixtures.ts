import type {
  ButtonContract,
  CreateFieldContract,
  CreateSurfaceContract,
  DocumentThemeActiveMode,
  DocumentThemeContract,
  DocumentThemeMode,
  ShellManifestContract,
  ShellNavigationSectionContract,
} from "@dpeek/formless-presentation/contract";
import { shellNavigationSectionReference } from "@dpeek/formless-presentation/host";

export type FormlessApplicationShellFixtureId =
  | "dev-workbench"
  | "no-shell"
  | "program-roots"
  | "program-settings"
  | "program-workspaces"
  | "site-authoring";

export type FormlessApplicationShellFixtureState = {
  manifest: ShellManifestContract;
  sections: readonly ShellNavigationSectionContract[];
};

export type FormlessApplicationShellFixture = {
  documentTheme: DocumentThemeContract | null;
  id: FormlessApplicationShellFixtureId;
  label: string;
  routeLabel: string;
  shell: FormlessApplicationShellFixtureState | null;
};

const shellId = "shell:application";

export function createFormlessApplicationShellFixtures(): FormlessApplicationShellFixture[] {
  return [
    {
      documentTheme: fixedDocumentTheme("light"),
      id: "program-workspaces",
      label: "Program workspaces",
      routeLabel: "Tasks workspace",
      shell: programWorkspacesShell(),
    },
    {
      documentTheme: fixedDocumentTheme("light"),
      id: "program-settings",
      label: "Program settings",
      routeLabel: "Settings",
      shell: programSettingsShell(),
    },
    {
      documentTheme: userDocumentTheme("system", "dark"),
      id: "dev-workbench",
      label: "Program workbench",
      routeLabel: "Tasks workspace",
      shell: devWorkbenchShell(),
    },
    {
      documentTheme: fixedDocumentTheme("dark"),
      id: "program-roots",
      label: "Program roots",
      routeLabel: "Tasks workspace",
      shell: programRootsShell(),
    },
    {
      documentTheme: userDocumentTheme("dark", "dark"),
      id: "site-authoring",
      label: "Site authoring",
      routeLabel: "Site authoring workspace",
      shell: siteAuthoringShell(),
    },
    {
      documentTheme: null,
      id: "no-shell",
      label: "No shell",
      routeLabel: "Public Site",
      shell: null,
    },
  ];
}

function fixedDocumentTheme(mode: DocumentThemeActiveMode): DocumentThemeContract {
  return {
    activeMode: mode,
    id: "theme:application",
    kind: "documentTheme",
    policy: { kind: "fixed", mode },
  };
}

function userDocumentTheme(
  selectedMode: DocumentThemeMode,
  activeMode: DocumentThemeActiveMode,
): DocumentThemeContract {
  const themeId = "theme:application";
  const controlId = "control:theme-mode";
  const option = (mode: DocumentThemeMode, label: string) => ({
    label,
    mode,
    selectionIntent: {
      controlId,
      mode,
      themeId,
      type: "documentThemeModeSelection" as const,
    },
  });

  return {
    activeMode,
    id: themeId,
    kind: "documentTheme",
    policy: { kind: "userControlled" },
    selectionControl: {
      accessibilityLabel: "Theme mode",
      id: controlId,
      kind: "documentThemeSelectionControl",
      options: [option("system", "System"), option("light", "Light"), option("dark", "Dark")],
      selectedMode,
    },
  };
}

function devWorkbenchShell(): FormlessApplicationShellFixtureState {
  const sections = [
    programSection("/tasks"),
    rootSection("tasks", "Projects", [
      ["launch", "Launch", "12"],
      ["website", "Website", "7"],
      ["operations", "Operations", "3"],
    ]),
    statusSection("tasks", {
      sync: {
        details: [
          { label: "Program", value: "Formless Program" },
          { label: "Schema", value: "v8" },
          { label: "Cursor", value: "42" },
          { label: "Last sync", value: "Just now" },
        ],
        label: "Synced",
        message: "All local changes are synced.",
        state: "idle",
      },
      workspaceSave: {
        label: "Saved",
        message: "Workspace source is saved.",
        state: "saved",
      },
    }),
    sessionSection(),
  ];

  return shell(sections);
}

function programSettingsShell(): FormlessApplicationShellFixtureState {
  const sections = [programSection("/settings"), sessionSection()];

  return shell(sections);
}

function programWorkspacesShell(): FormlessApplicationShellFixtureState {
  const sections = [
    workspaceSwitcherSection("tasks"),
    section("program", "program", {
      accessibilityLabel: "Tasks screens",
      destinations: [
        shellLink("program:tasks", "Tasks", "/tasks", true),
        shellLink("program:overdue", "Overdue", "/tasks/overdue"),
      ],
    }),
    sessionSection(),
  ];

  return shell(sections, "Tasks");
}

function programRootsShell(): FormlessApplicationShellFixtureState {
  const sections = [
    programSection("/tasks"),
    rootSection(
      "tasks",
      "Projects",
      [
        ["launch", "Launch", "12"],
        ["website", "Website", "7"],
      ],
      false,
    ),
    statusSection("tasks", {
      sync: {
        label: "Syncing",
        message: "Syncing local changes.",
        state: "syncing",
      },
    }),
    sessionSection(),
  ];

  return shell(sections);
}

function siteAuthoringShell(): FormlessApplicationShellFixtureState {
  const sections = [
    programSection("/site"),
    rootSection("site", "Pages", [
      ["home", "Home", "8"],
      ["about", "About", "4"],
      ["contact", "Contact", "2"],
    ]),
    statusSection("site", {
      sync: {
        label: "Sync issue",
        message: "Sync failed. Check the Program and try again.",
        state: "error",
      },
    }),
    sessionSection(),
  ];

  return shell(sections);
}

function shell(
  sections: readonly ShellNavigationSectionContract[],
  title = "Formless Program",
): FormlessApplicationShellFixtureState {
  const selectedSection = [...sections]
    .reverse()
    .find((section) => section.destinations.some((destination) => destination.selected));
  const selectedDestination = selectedSection?.destinations.find(
    (destination) => destination.selected,
  );
  const workspaceSwitcher = sections.find((section) => section.role === "workspaceSwitcher");

  return {
    manifest: {
      accessibilityLabel: "Formless Program application shell",
      activeDestination:
        selectedSection && selectedDestination
          ? { destinationId: selectedDestination.id, sectionId: selectedSection.id }
          : null,
      id: shellId,
      kind: "shellManifest",
      navigationSections: sections.map((section) =>
        shellNavigationSectionReference(shellId, section.id),
      ),
      title,
      workspaceSwitcher: workspaceSwitcher
        ? shellNavigationSectionReference(shellId, workspaceSwitcher.id)
        : null,
    },
    sections,
  };
}

function workspaceSwitcherSection(selectedKey: string): ShellNavigationSectionContract {
  return section("workspaces", "workspaceSwitcher", {
    accessibilityLabel: "Program workspaces",
    destinations: [
      shellLink("workspace:tasks", "Tasks", "/tasks", selectedKey === "tasks"),
      shellLink("workspace:site", "Site", "/site", selectedKey === "site"),
      shellLink("workspace:crm", "CRM", "/crm", selectedKey === "crm"),
      shellLink("workspace:instance", "Instance", "/settings/routes", selectedKey === "instance"),
    ],
    label: "Workspaces",
  });
}

function programSection(selectedHref: string): ShellNavigationSectionContract {
  return section("program", "program", {
    accessibilityLabel: "Program navigation",
    destinations: programDestinations().map((destination) => ({
      ...destination,
      selected: destination.href === selectedHref,
    })),
    label: "Program",
  });
}

function programDestinations() {
  return [
    shellLink("program:principals", "Principals", "/"),
    shellLink("program:tasks", "Tasks", "/tasks"),
    shellLink("program:site", "Site", "/site"),
    shellLink("program:crm", "CRM", "/crm"),
    shellLink("program:routes", "Routes", "/routes"),
    shellLink("program:deployments", "Deployments", "/deployments"),
    shellLink("program:settings", "Settings", "/settings"),
  ];
}

function rootSection(
  contextKey: string,
  label: string,
  roots: readonly (readonly [recordId: string, recordLabel: string, countText: string])[],
  withCreate = true,
): ShellNavigationSectionContract {
  const sectionId = `${shellId}:roots:${contextKey}`;

  return section(`roots:${contextKey}`, "rootRecords", {
    ...(withCreate ? { createSurface: createSurface(contextKey, label) } : {}),
    destinations: roots.map(([recordId, recordLabel, countText], index) => ({
      accessibilityLabel: recordLabel,
      availability: { available: true },
      countText,
      id: `root:${recordId}`,
      kind: "shellRootRecordDestination",
      label: recordLabel,
      recordId,
      selected: index === 0,
      selectionIntent: {
        destinationId: `root:${recordId}`,
        recordId,
        sectionId,
        shellId,
        type: "shellRootRecordSelection",
      },
    })),
    label,
  });
}

function statusSection(
  contextKey: string,
  options: {
    sync?: {
      details?: readonly {
        label: string;
        value: string;
      }[];
      label: string;
      message: string;
      state: "error" | "idle" | "syncing";
    };
    workspaceSave?: {
      label: string;
      message: string;
      state: "clean" | "dirty" | "failed" | "queued" | "saved" | "saving";
    };
  },
): ShellNavigationSectionContract {
  return section(`status:${contextKey}`, "status", {
    status: {
      id: `${shellId}:status:${contextKey}:controls`,
      kind: "shellStatus",
      ...(options.sync
        ? {
            sync: {
              ...options.sync,
              id: `${shellId}:sync:${contextKey}`,
              kind: "shellSyncStatus",
            },
          }
        : {}),
      ...(options.workspaceSave
        ? {
            workspaceSave: {
              ...options.workspaceSave,
              id: `${shellId}:workspace-save:${contextKey}`,
              kind: "shellWorkspaceSaveStatus",
            },
          }
        : {}),
    },
  });
}

function sessionSection(): ShellNavigationSectionContract {
  return section("owner-session", "session", {
    session: {
      id: `${shellId}:session`,
      identity: {
        displayName: "Ada Lovelace",
        secondaryLabel: "ada@example.com",
      },
      kind: "shellSession",
      logout: button(`${shellId}:session:logout`, "Log out", "quiet"),
      state: "authenticated",
    },
  });
}

function section(
  idSuffix: string,
  role: ShellNavigationSectionContract["role"],
  options: Partial<
    Pick<
      ShellNavigationSectionContract,
      "accessibilityLabel" | "createSurface" | "destinations" | "label" | "session" | "status"
    >
  > = {},
): ShellNavigationSectionContract {
  const id = `${shellId}:${idSuffix}`;

  return {
    accessibilityLabel: options.accessibilityLabel ?? `${options.label ?? role} navigation`,
    destinations: options.destinations ?? [],
    id,
    kind: "shellNavigationSection",
    role,
    shellId,
    ...(options.createSurface ? { createSurface: options.createSurface } : {}),
    ...(options.label ? { label: options.label } : {}),
    ...(options.session ? { session: options.session } : {}),
    ...(options.status ? { status: options.status } : {}),
  };
}

function shellLink(id: string, label: string, href: string, selected = false) {
  return {
    accessibilityLabel: label,
    availability: { available: true as const },
    href,
    id,
    kind: "shellLinkDestination" as const,
    label,
    selected,
  };
}

function createSurface(contextKey: string, label: string): CreateSurfaceContract {
  const id = `${shellId}:create:${contextKey}`;

  return {
    dialog: {
      form: {
        cancel: button(`${id}:cancel`, "Cancel"),
        errors: [],
        fieldSet: {
          disabled: false,
          fields: [createTitleField(id, label)],
          id: `${id}:fields`,
          kind: "fieldSet",
          label: `${label} details`,
        },
        id: `${id}:form`,
        kind: "createForm",
        submit: {
          ...button(`${id}:submit`, `Create ${label.toLowerCase()}`, "primary", "submit"),
          disabled: true,
        },
      },
      id: `${id}:dialog`,
      kind: "createDialog",
      open: false,
      title: `Create ${label.toLowerCase()}`,
    },
    id,
    kind: "createSurface",
    trigger: {
      ...button(`${id}:trigger`, `Create ${label.toLowerCase()}`, "quiet"),
      content: { icon: "add", kind: "iconOnly" },
      density: "compact",
    },
  };
}

function createTitleField(surfaceId: string, label: string): CreateFieldContract {
  const field = {
    label: `${label} name`,
    required: true,
    type: "text" as const,
  } satisfies CreateFieldContract["field"];
  const control = {
    control: { inputType: "text" as const, kind: "input" as const },
    controlKind: "text" as const,
    createDefaultChecked: false,
    createDefaultValue: undefined,
    editor: "text" as const,
    field,
    inputAttributes: {},
    kind: "text" as const,
    label: field.label,
    required: true,
  } satisfies Extract<
    CreateFieldContract["control"],
    {
      kind: "text";
    }
  >;
  return {
    access: { canPatch: true, kind: "editable", writable: true },
    commit: "submit",
    control,
    density: "default",
    draftInput: { kind: "input", value: "" },
    editor: "text",
    field,
    fieldId: `fixture-field:${encodeURIComponent(surfaceId)}:title`,
    fieldName: "title",
    label: field.label,
    labelVisibility: "visible",
    mode: "editor",
    required: true,
    surface: "create",
    value: "",
  };
}

function button(
  id: string,
  label: string,
  prominence: ButtonContract["prominence"] = "secondary",
  type: ButtonContract["type"] = "button",
): ButtonContract {
  return {
    accessibilityLabel: label,
    content: { kind: "label", label },
    density: "default",
    id,
    kind: "button",
    prominence,
    type,
  };
}
