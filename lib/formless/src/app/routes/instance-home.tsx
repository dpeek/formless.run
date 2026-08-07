import { useLocation } from "wouter";
import { ApplicationSystemStateRuntime } from "./application-system-state-runtime.tsx";
import { projectApplicationSystemState } from "./application-system-state-projection.ts";

const instanceHomeDestinations = {
  site: "/site",
  tasks: "/tasks",
} as const;

const instanceHomeSnapshot = projectApplicationSystemState({
  accessibilityLabel: "Formless instance home",
  actions: [
    {
      id: "site",
      label: "Set up a site",
      purpose: "navigate",
    },
    {
      id: "tasks",
      label: "Open Tasks",
      prominence: "secondary",
      purpose: "navigate",
    },
  ],
  heading: "Welcome to Formless",
  id: "application-system-state:instance-home",
  message:
    "Start with a workspace. Set up a Site, manage Tasks, or use the Instance workspace when you have access.",
  state: "empty",
});

export function InstanceHomeRoute() {
  const [, navigate] = useLocation();

  return (
    <ApplicationSystemStateRuntime
      onIntent={(intent) => {
        const destination =
          instanceHomeDestinations[intent.actionId as keyof typeof instanceHomeDestinations];

        if (destination) navigate(destination);
      }}
      snapshot={instanceHomeSnapshot}
    />
  );
}
