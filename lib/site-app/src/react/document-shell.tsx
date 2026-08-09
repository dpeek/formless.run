import type { ReactNode } from "react";

export function PublicSiteDocumentShell({ children }: { children: ReactNode }) {
  return <main style={{ minHeight: "100dvh" }}>{children}</main>;
}
