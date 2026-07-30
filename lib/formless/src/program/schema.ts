import {
  identityControlPlanePresentationSchemaModule,
  identityControlPlaneRecordSchemaModule,
} from "@dpeek/formless-identity-control-plane/schema";
import {
  instanceControlPlanePresentationSchemaModule,
  instanceControlPlaneRecordSchemaModule,
} from "@dpeek/formless-instance-control-plane/schema";
import {
  composeAppSchema,
  defineAppSchemaModule,
  type AppSchemaSource,
} from "@dpeek/formless-schema";

export const formlessInstanceControlPlanePresentationSchemaModule = defineAppSchemaModule({
  ...instanceControlPlanePresentationSchemaModule,
  screens: instanceControlPlanePresentationSchemaModule.screens.filter(
    (screen) => screen.key !== "apps",
  ),
});

export const formlessIdentityControlPlanePresentationSchemaModule = defineAppSchemaModule({
  ...identityControlPlanePresentationSchemaModule,
  screens: identityControlPlanePresentationSchemaModule.screens.filter(
    (screen) => screen.key !== "apps",
  ),
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
  formlessInstanceControlPlanePresentationSchemaModule,
  formlessIdentityControlPlanePresentationSchemaModule,
  formlessProgramPresentationSchemaModule,
] as const;

export const formlessProgramSourceSchema: AppSchemaSource = composeAppSchema({
  version: 1,
  modules: formlessProgramSchemaModules,
  navigation: {
    primaryScreens: [
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
