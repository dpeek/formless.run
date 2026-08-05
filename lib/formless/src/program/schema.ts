import {
  identityControlPlaneAccessScreenSchemaModule,
  identityControlPlaneRecordSchemaModule,
} from "@dpeek/formless-identity-control-plane/schema";
import {
  instanceControlPlanePresentationSchemaModule,
  instanceControlPlaneRecordSchemaModule,
  instanceControlPlaneRoutesScreenSchemaModule,
} from "@dpeek/formless-instance-control-plane/schema";
import {
  tasksPresentationSchemaModule,
  tasksRecordSchemaModule,
} from "@dpeek/formless-tasks-app/schema";
import {
  siteContactIntakePresentationSchemaModule,
  sitePresentationSchemaModule,
  siteRecordSchemaModule,
  SITE_PREVIEW_BROWSER_MOUNT_KEY,
  SITE_PREVIEW_WORKER_MOUNT_KEY,
} from "@dpeek/formless-site-app/schema";
import {
  standardContactSubscriptionRecordSchemaModule,
  standardInquiryRecordSchemaModule,
} from "@dpeek/formless-standard/schema";
import {
  composeAppSchema,
  defineAppSchemaModule,
  type AppSchemaCompositionSource,
  type AppSchemaSource,
} from "@dpeek/formless-schema";

const programAdministratorScreenAccess = { role: "administrator" } as const;
const programEditorOperationAccess = { role: "editor" } as const;
const programMemberScreenAccess = { role: "member" } as const;

export const formlessStandardInquiryRecordSchemaModule = standardInquiryRecordSchemaModule;

export const formlessStandardContactSubscriptionRecordSchemaModule = defineAppSchemaModule({
  ...standardContactSubscriptionRecordSchemaModule,
  entities: standardContactSubscriptionRecordSchemaModule.entities.map((entity) => ({
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
    operations: entity.operations?.map((operation) => ({
      ...operation,
      access: programEditorOperationAccess,
    })),
  })),
});

const formlessSiteScreenPaths = {
  siteEditor: "/site",
  siteSettings: "/site/settings",
} as const;

export const formlessSitePresentationSchemaModule = defineAppSchemaModule({
  ...sitePresentationSchemaModule,
  screens: sitePresentationSchemaModule.screens.map((screen) => ({
    ...screen,
    path: formlessSiteScreenPaths[screen.key],
    access: programMemberScreenAccess,
  })),
});

const formlessSiteContactIntakeScreenPaths = {
  siteContacts: "/site/contacts",
  siteSubscribers: "/site/subscribers",
} as const;

export const formlessSiteContactIntakePresentationSchemaModule = defineAppSchemaModule({
  ...siteContactIntakePresentationSchemaModule,
  screens: siteContactIntakePresentationSchemaModule.screens.map((screen) => ({
    ...screen,
    path: formlessSiteContactIntakeScreenPaths[screen.key],
    access: programMemberScreenAccess,
  })),
});

export const formlessSitePreviewSurfaceMountSchemaModule = defineAppSchemaModule({
  key: "site-preview-surface-mounts",
  requires: [siteRecordSchemaModule.key],
  surfaceMounts: [
    {
      key: SITE_PREVIEW_BROWSER_MOUNT_KEY,
      target: "browser",
      path: "/site/preview",
      access: { actor: "authenticated" },
    },
    {
      key: SITE_PREVIEW_WORKER_MOUNT_KEY,
      target: "worker",
      path: "/site/public",
      access: { actor: "authenticated" },
    },
  ],
});

export const formlessInstanceControlPlanePresentationSchemaModule =
  instanceControlPlanePresentationSchemaModule;

export const formlessInstanceControlPlaneRoutesScreenSchemaModule = defineAppSchemaModule({
  ...instanceControlPlaneRoutesScreenSchemaModule,
  screens: instanceControlPlaneRoutesScreenSchemaModule.screens.map((screen) => ({
    ...screen,
    path: "/settings/routes",
    access: programAdministratorScreenAccess,
  })),
});

export const formlessIdentityControlPlaneAccessScreenSchemaModule = defineAppSchemaModule({
  ...identityControlPlaneAccessScreenSchemaModule,
  screens: identityControlPlaneAccessScreenSchemaModule.screens.map((screen) => ({
    ...screen,
    path: "/settings/access",
    access: programAdministratorScreenAccess,
  })),
});

export const formlessProgramBuiltInModules = {
  instanceControlPlaneRecords: instanceControlPlaneRecordSchemaModule,
  identityControlPlaneRecords: identityControlPlaneRecordSchemaModule,
  standardInquiryRecords: formlessStandardInquiryRecordSchemaModule,
  standardContactSubscriptionRecords: formlessStandardContactSubscriptionRecordSchemaModule,
  tasksRecords: formlessTasksRecordSchemaModule,
  siteRecords: formlessSiteRecordSchemaModule,
  sitePreviewSurfaceMounts: formlessSitePreviewSurfaceMountSchemaModule,
  instanceControlPlanePresentation: formlessInstanceControlPlanePresentationSchemaModule,
  instanceControlPlaneRoutesScreen: formlessInstanceControlPlaneRoutesScreenSchemaModule,
  identityControlPlaneAccessScreen: formlessIdentityControlPlaneAccessScreenSchemaModule,
  tasksPresentation: formlessTasksPresentationSchemaModule,
  sitePresentation: formlessSitePresentationSchemaModule,
  siteContactIntakePresentation: formlessSiteContactIntakePresentationSchemaModule,
} as const;

export const formlessProgramSchemaModules = [
  formlessProgramBuiltInModules.instanceControlPlaneRecords,
  formlessProgramBuiltInModules.identityControlPlaneRecords,
  formlessProgramBuiltInModules.standardInquiryRecords,
  formlessProgramBuiltInModules.standardContactSubscriptionRecords,
  formlessProgramBuiltInModules.tasksRecords,
  formlessProgramBuiltInModules.siteRecords,
  formlessProgramBuiltInModules.sitePreviewSurfaceMounts,
  formlessProgramBuiltInModules.instanceControlPlanePresentation,
  formlessProgramBuiltInModules.instanceControlPlaneRoutesScreen,
  formlessProgramBuiltInModules.identityControlPlaneAccessScreen,
  formlessProgramBuiltInModules.tasksPresentation,
  formlessProgramBuiltInModules.sitePresentation,
  formlessProgramBuiltInModules.siteContactIntakePresentation,
] as const;

export const formlessProgramDefaultAuthorization: NonNullable<
  AppSchemaCompositionSource["authorization"]
> = {
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
};

export const formlessProgramDefaultNavigation: NonNullable<
  AppSchemaCompositionSource["navigation"]
> = {
  groups: [
    { key: "tasks", label: "Tasks", screens: ["taskHome"] },
    { key: "site", label: "Site", screens: ["siteEditor"] },
    {
      key: "instance",
      label: "Instance",
      screens: ["routes", "access"],
    },
  ],
};

export const formlessProgramDefaultRuntime: NonNullable<AppSchemaCompositionSource["runtime"]> = {
  owner: "runtime",
};

export const formlessProgramDefaultComposition: AppSchemaCompositionSource = {
  version: 1,
  authorization: formlessProgramDefaultAuthorization,
  modules: formlessProgramSchemaModules,
  navigation: formlessProgramDefaultNavigation,
  runtime: formlessProgramDefaultRuntime,
};

export const formlessProgramSourceSchema: AppSchemaSource = composeAppSchema(
  formlessProgramDefaultComposition,
);
