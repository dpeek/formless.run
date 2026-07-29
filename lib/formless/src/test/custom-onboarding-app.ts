import { computeSourceSchemaHash } from "@dpeek/formless-installed-apps";

import { workspaceAppPackageManifestFixture } from "./workspace-app-package.ts";

export const customOnboardingPackageAppKey = "custom-onboarding";
export const customOnboardingDefaultInstallId = "custom-onboarding";
export const customOnboardingRegistrationOperationKey = "profile.completeRegistration";
export const customOnboardingSourceSchema = {
  version: 1,
  entities: [
    {
      id: "entity_b0f56213-edc1-41af-b27f-83edd746ce17",
      key: "profile",
      label: "Profile",
      fields: [
        {
          key: "actorPrincipalId",
          type: "text",
          required: true,
          label: "Actor principal",
        },
        {
          key: "displayName",
          type: "text",
          required: true,
          label: "Display name",
        },
        {
          key: "principal",
          type: "reference",
          required: true,
          label: "Principal",
          to: "auth:principal",
        },
      ],
      operations: [
        {
          key: "completeRegistration",
          label: "Complete profile",
          kind: "command",
          scope: "collection",
          policy: {
            actors: ["authenticated"],
          },
          input: {
            fields: [
              {
                key: "displayName",
                field: "displayName",
              },
              {
                key: "principal",
                field: "principal",
              },
            ],
          },
          effect: {
            type: "recordPlan",
            steps: [
              {
                name: "createProfile",
                kind: "create",
                entity: "profile",
                recordId: { kind: "generatedId", prefix: "profile" },
                values: {
                  actorPrincipalId: { kind: "actor", field: "principalId" },
                  displayName: { kind: "input", field: "displayName" },
                  principal: {
                    kind: "reference",
                    entity: "auth:principal",
                    id: { kind: "input", field: "principal" },
                  },
                },
              },
            ],
          },
          output: {
            type: "command",
          },
          idempotency: {
            required: true,
          },
        },
      ],
    },
  ],
  queries: [
    {
      key: "profileAll",
      label: "All",
      entity: "profile",
      expression: {
        kind: "all",
      },
    },
  ],
  itemViews: [
    {
      key: "profileItem",
      entity: "profile",
      fields: [
        {
          field: "displayName",
          editor: "text",
          commit: "field-commit",
        },
      ],
    },
  ],
  tableViews: [],
  views: [
    {
      key: "profileHome",
      type: "collection",
      label: "Profiles",
      entity: "profile",
      queries: [{ query: "profileAll" }],
      defaultQuery: "profileAll",
      result: {
        type: "list",
        itemView: "profileItem",
      },
    },
  ],
  screens: [
    {
      key: "profileHome",
      type: "workspace",
      label: "Profiles",
      path: "/",
      layout: {
        type: "stack",
        sections: [
          {
            id: "profiles",
            type: "collection",
            view: "profileHome",
          },
        ],
      },
    },
  ],
};
export async function customOnboardingWorkspacePackageFixture() {
  const sourceSchemaHash = await computeSourceSchemaHash(customOnboardingSourceSchema);
  return {
    manifest: workspaceAppPackageManifestFixture({
      defaultInstallId: customOnboardingDefaultInstallId,
      label: "Custom Onboarding",
      packageAppKey: customOnboardingPackageAppKey,
      packageRevision: 1,
      sourceSchemaHash,
      supportsMultipleInstalls: true,
    }),
    sourceSchema: customOnboardingSourceSchema,
  };
}

export function customOnboardingProfileCompletionOperation(appInstallId: string) {
  return {
    appInstallId,
    entityName: "profile",
    label: "Complete profile",
    operationKey: customOnboardingRegistrationOperationKey,
    operationName: "completeRegistration",
  };
}
