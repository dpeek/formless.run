import { StrictMode, type ReactNode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { useLocation } from "wouter";
import { App } from "./app.tsx";
import { ApplicationRendererRoot } from "./app/application-renderer-root.tsx";
import "./program/compiled/shared.ts";

const app = document.getElementById("app");

if (!app) {
  throw new Error("App root not found.");
}

const appTree = (
  <StrictMode>
    <ApplicationRoot>
      <App />
    </ApplicationRoot>
  </StrictMode>
);

if (app.hasChildNodes()) {
  hydrateRoot(app, appTree);
} else {
  createRoot(app).render(appTree);
}

function ApplicationRoot({ children }: { children: ReactNode }) {
  const [, navigate] = useLocation();

  return (
    <ApplicationRendererRoot navigate={(path) => navigate(path)}>
      {children}
    </ApplicationRendererRoot>
  );
}
