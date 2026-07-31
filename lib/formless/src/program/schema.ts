import {
  identityControlPlanePresentationSchemaModule,
  identityControlPlaneRecordSchemaModule,
} from "@dpeek/formless-identity-control-plane/schema";
import {
  instanceControlPlanePresentationSchemaModule,
  instanceControlPlaneRecordSchemaModule,
} from "@dpeek/formless-instance-control-plane/schema";
import {
  tasksPresentationSchemaModule,
  tasksRecordSchemaModule,
} from "@dpeek/formless-tasks-app/schema";
import {
  sitePresentationSchemaModule,
  siteRecordSchemaModule,
} from "@dpeek/formless-site-app/schema";
import {
  composeAppSchema,
  defineAppSchemaModule,
  type AppSchemaSource,
} from "@dpeek/formless-schema";

const programAdministratorScreenAccess = { role: "administrator" } as const;
const programEditorOperationAccess = { role: "editor" } as const;
const programMemberScreenAccess = { role: "member" } as const;

export const formlessTasksRecordSchemaModule = defineAppSchemaModule({
  ...tasksRecordSchemaModule,
  entities: tasksRecordSchemaModule.entities.map((entity) => ({
    ...entity,
    operations: entity.operations?.map((operation) => ({
      ...operation,
      access: programEditorOperationAccess,
    })),
  })),
});

export const formlessTasksPresentationSchemaModule = defineAppSchemaModule({
  ...tasksPresentationSchemaModule,
  screens: tasksPresentationSchemaModule.screens.map((screen) => ({
    ...screen,
    path: "/tasks",
    access: programMemberScreenAccess,
  })),
});

export const formlessSiteRecordSchemaModule = defineAppSchemaModule({
  ...siteRecordSchemaModule,
  entities: siteRecordSchemaModule.entities.map((entity) => ({
    ...entity,
    operations: entity.operations?.map((operation) =>
      "policy" in operation && operation.policy.actors.includes("anonymous")
        ? operation
        : {
            ...operation,
            access: programEditorOperationAccess,
          },
    ),
  })),
});

const formlessSiteScreenPaths = {
  siteEditor: "/site",
  siteSettings: "/site/settings",
  siteContacts: "/site/contacts",
  siteSubscribers: "/site/subscribers",
} as const;

export const formlessSitePresentationSchemaModule = defineAppSchemaModule({
  ...sitePresentationSchemaModule,
  screens: sitePresentationSchemaModule.screens.map((screen) => ({
    ...screen,
    path: formlessSiteScreenPaths[screen.key],
    access: programMemberScreenAccess,
  })),
});

export const formlessInstanceControlPlanePresentationSchemaModule = defineAppSchemaModule({
  ...instanceControlPlanePresentationSchemaModule,
  screens: instanceControlPlanePresentationSchemaModule.screens
    .filter((screen) => screen.key !== "apps")
    .map((screen) => ({ ...screen, access: programAdministratorScreenAccess })),
});

export const formlessIdentityControlPlanePresentationSchemaModule = defineAppSchemaModule({
  ...identityControlPlanePresentationSchemaModule,
  screens: identityControlPlanePresentationSchemaModule.screens
    .filter((screen) => screen.key !== "apps")
    .map((screen) => ({ ...screen, access: programAdministratorScreenAccess })),
});

export const formlessProgramPresentationSchemaModule = defineAppSchemaModule({
  key: "formless-program-presentation",
  requires: ["instance-control-plane-presentation", "identity-control-plane-presentation"],
  screens: [
    {
      key: "apps",
      type: "workspace",
      label: "Apps",
      path: "/apps",
      access: programAdministratorScreenAccess,
      layout: {
        type: "stack",
        sections: [
          {
            id: "app-installs",
            type: "collection",
            view: "appInstallList",
          },
          {
            id: "app-registrations",
            type: "collection",
            view: "appRegistrationList",
          },
        ],
      },
    },
  ],
});

export const formlessProgramSchemaModules = [
  instanceControlPlaneRecordSchemaModule,
  identityControlPlaneRecordSchemaModule,
  formlessTasksRecordSchemaModule,
  formlessSiteRecordSchemaModule,
  formlessInstanceControlPlanePresentationSchemaModule,
  formlessIdentityControlPlanePresentationSchemaModule,
  formlessTasksPresentationSchemaModule,
  formlessSitePresentationSchemaModule,
  formlessProgramPresentationSchemaModule,
] as const;

export const formlessProgramSourceSchema: AppSchemaSource = composeAppSchema({
  version: 1,
  authorization: {
    roles: [
      {
        id: "role_de3ae092-31a9-49df-b7f6-9f51f9403ff9",
        key: "member",
        label: "Member",
      },
      {
        id: "role_3e6f3057-22bf-4fb0-8bd5-7b61bb0f45c4",
        key: "editor",
        label: "Editor",
      },
      {
        id: "role_04144de6-7927-49f2-826a-cdcc70c47357",
        key: "administrator",
        label: "Administrator",
      },
    ],
  },
  modules: formlessProgramSchemaModules,
  navigation: {
    primaryScreens: [
      "taskHome",
      "siteEditor",
      "apps",
      "routes",
      "deployments",
      "principals",
      "organizations",
      "access",
      "invitations",
      "policies",
      "settings",
    ],
  },
  runtime: {
    owner: "runtime",
  },
});
