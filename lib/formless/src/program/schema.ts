import {
  identityControlPlaneAccessScreenSchemaModule,
  identityControlPlanePresentationSchemaModule,
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
  sitePresentationSchemaModule,
  siteRecordSchemaModule,
} from "@dpeek/formless-site-app/schema";
import { crmPresentationSchemaModule, crmRecordSchemaModule } from "@dpeek/formless-crm-app/schema";
import {
  composeAppSchema,
  defineAppSchemaModule,
  type AppSchemaCompositionSource,
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

const crmSharedProgramEntityKeys = new Set([
  "contact",
  "email-address",
  "audience",
  "subscription",
]);
const siteRelationshipKeys = new Set<string>(
  siteRecordSchemaModule.relationships.map(({ key }) => key),
);
const siteQueryKeys = new Set<string>(siteRecordSchemaModule.queries.map(({ key }) => key));

export const formlessSiteRecordSchemaModule = defineAppSchemaModule({
  ...siteRecordSchemaModule,
  entities: siteRecordSchemaModule.entities.map((siteEntity) => {
    const crmEntity = crmSharedProgramEntityKeys.has(siteEntity.key)
      ? crmRecordSchemaModule.entities.find(({ key }) => key === siteEntity.key)
      : undefined;
    const entity =
      crmEntity === undefined
        ? siteEntity
        : {
            ...crmEntity,
            id: siteEntity.id,
            fields:
              crmEntity.key === "subscription"
                ? crmEntity.fields.map((field) =>
                    field.key === "sourceTargetKind" && field.type === "enum"
                      ? {
                          ...field,
                          values: [{ key: "program", label: "Program" }],
                        }
                      : field,
                  )
                : crmEntity.fields,
          };

    return {
      ...entity,
      ...("operations" in entity
        ? {
            operations: entity.operations.map((operation) =>
              "policy" in operation && operation.policy.actors.includes("anonymous")
                ? operation
                : {
                    ...operation,
                    access: programEditorOperationAccess,
                  },
            ),
          }
        : {}),
    };
  }),
});

export const formlessCrmRecordSchemaModule = defineAppSchemaModule({
  ...crmRecordSchemaModule,
  requires: [siteRecordSchemaModule.key],
  entities: crmRecordSchemaModule.entities
    .filter(({ key }) => !crmSharedProgramEntityKeys.has(key))
    .map((entity) => ({
      ...entity,
      ...("operations" in entity
        ? {
            operations: entity.operations.map((operation) => ({
              ...operation,
              access: programEditorOperationAccess,
            })),
          }
        : {}),
    })),
  relationships: crmRecordSchemaModule.relationships.filter(
    ({ key }) => !siteRelationshipKeys.has(key),
  ),
  queries: crmRecordSchemaModule.queries.filter(({ key }) => !siteQueryKeys.has(key)),
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

const formlessCrmScreenPaths = {
  contacts: "/crm",
  audiences: "/crm/audiences",
  campaigns: "/crm/campaigns",
  broadcasts: "/crm/broadcasts",
} as const;
const formlessCrmPresentationKeys: Readonly<Record<string, string>> = {
  emailAddressTable: "crmEmailAddressTable",
  audienceTable: "crmAudienceTable",
  subscriptionTable: "crmSubscriptionTable",
  emailAddressHome: "crmEmailAddressHome",
  audienceHome: "crmAudienceHome",
  subscriptionHome: "crmSubscriptionHome",
};

function formlessCrmPresentationKey(key: string): string {
  return formlessCrmPresentationKeys[key] ?? key;
}

export const formlessCrmPresentationSchemaModule = defineAppSchemaModule({
  ...crmPresentationSchemaModule,
  requires: [siteRecordSchemaModule.key, crmRecordSchemaModule.key],
  tableViews: crmPresentationSchemaModule.tableViews.map((tableView) => ({
    ...tableView,
    key: formlessCrmPresentationKey(tableView.key),
  })),
  views: crmPresentationSchemaModule.views.map((view) => ({
    ...view,
    key: formlessCrmPresentationKey(view.key),
    ...(view.type === "collection" && view.result.type === "table"
      ? {
          result: {
            ...view.result,
            tableView: formlessCrmPresentationKey(view.result.tableView),
          },
        }
      : {}),
  })),
  screens: crmPresentationSchemaModule.screens.map((screen) => ({
    ...screen,
    path: formlessCrmScreenPaths[screen.key],
    access: programMemberScreenAccess,
    layout: {
      ...screen.layout,
      sections: screen.layout.sections.map((section) => ({
        ...section,
        view: formlessCrmPresentationKey(section.view),
      })),
    },
  })),
});

export const formlessInstanceControlPlanePresentationSchemaModule = defineAppSchemaModule({
  ...instanceControlPlanePresentationSchemaModule,
  screens: instanceControlPlanePresentationSchemaModule.screens.map((screen) => ({
    ...screen,
    access: programAdministratorScreenAccess,
  })),
});

export const formlessInstanceControlPlaneRoutesScreenSchemaModule = defineAppSchemaModule({
  ...instanceControlPlaneRoutesScreenSchemaModule,
  screens: instanceControlPlaneRoutesScreenSchemaModule.screens.map((screen) => ({
    ...screen,
    path: "/settings/routes",
    access: programAdministratorScreenAccess,
  })),
});

export const formlessIdentityControlPlanePresentationSchemaModule = defineAppSchemaModule({
  ...identityControlPlanePresentationSchemaModule,
  screens: identityControlPlanePresentationSchemaModule.screens.map((screen) => ({
    ...screen,
    path: screen.key === "principals" ? "/principals" : screen.path,
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
  tasksRecords: formlessTasksRecordSchemaModule,
  siteRecords: formlessSiteRecordSchemaModule,
  crmRecords: formlessCrmRecordSchemaModule,
  instanceControlPlanePresentation: formlessInstanceControlPlanePresentationSchemaModule,
  instanceControlPlaneRoutesScreen: formlessInstanceControlPlaneRoutesScreenSchemaModule,
  identityControlPlanePresentation: formlessIdentityControlPlanePresentationSchemaModule,
  identityControlPlaneAccessScreen: formlessIdentityControlPlaneAccessScreenSchemaModule,
  tasksPresentation: formlessTasksPresentationSchemaModule,
  sitePresentation: formlessSitePresentationSchemaModule,
  crmPresentation: formlessCrmPresentationSchemaModule,
} as const;

export const formlessProgramSchemaModules = [
  formlessProgramBuiltInModules.instanceControlPlaneRecords,
  formlessProgramBuiltInModules.identityControlPlaneRecords,
  formlessProgramBuiltInModules.tasksRecords,
  formlessProgramBuiltInModules.siteRecords,
  formlessProgramBuiltInModules.crmRecords,
  formlessProgramBuiltInModules.instanceControlPlanePresentation,
  formlessProgramBuiltInModules.instanceControlPlaneRoutesScreen,
  formlessProgramBuiltInModules.identityControlPlanePresentation,
  formlessProgramBuiltInModules.identityControlPlaneAccessScreen,
  formlessProgramBuiltInModules.tasksPresentation,
  formlessProgramBuiltInModules.sitePresentation,
  formlessProgramBuiltInModules.crmPresentation,
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
    { key: "crm", label: "CRM", screens: ["contacts"] },
    {
      key: "instance",
      label: "Instance",
      screens: [
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
