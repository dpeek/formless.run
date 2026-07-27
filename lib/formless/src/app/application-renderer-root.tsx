import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { FormlessApplicationRendererProvider } from "@dpeek/formless-renderer/application/provider";
import { PUBLIC_SITE_THEME_RELEASE_EVENT } from "@dpeek/formless-site-app";
import "@dpeek/formless-renderer/application/global.css";
import {
  ApplicationRuntimeContractHostProvider,
  useApplicationRuntimePublicationCoordinator,
} from "./generated/application-runtime-contract-host.tsx";
import {
  APPLICATION_THEME_CONTRIBUTOR_ID,
  applicationThemeReference,
  applicationThemeRuntimePublication,
  browserApplicationTheme,
  createApplicationThemeController,
  type ApplicationThemeController,
} from "./application-theme-runtime.ts";
import { ApplicationRootThemeRuntimeProvider } from "./application-root-context.tsx";
import { ApplicationNavigationBridge } from "./application-navigation.tsx";

type ApplicationNavigationEventTarget = Pick<Document, "addEventListener" | "removeEventListener">;

export function ApplicationRendererRoot({
  children,
  currentHref,
  navigate,
  navigationTarget,
  themeController: suppliedThemeController,
}: {
  children: ReactNode;
  currentHref?: () => string;
  navigate: (href: string) => void;
  navigationTarget?: ApplicationNavigationEventTarget;
  themeController?: ApplicationThemeController;
}) {
  const [ownedThemeController] = useState(() =>
    suppliedThemeController
      ? undefined
      : createApplicationThemeController(browserApplicationTheme()),
  );
  const themeController = suppliedThemeController ?? ownedThemeController;
  if (!themeController) {
    throw new Error("Application renderer root requires a browser theme controller.");
  }

  const theme = useSyncExternalStore(
    (listener) => themeController.subscribe(listener),
    () => themeController.getSnapshot(),
    () => themeController.getSnapshot(),
  );
  const publication = useMemo(
    () => applicationThemeRuntimePublication(themeController),
    [theme, themeController],
  );
  const coordinator = useApplicationRuntimePublicationCoordinator([
    [APPLICATION_THEME_CONTRIBUTOR_ID, publication],
  ]);
  const rootThemeRuntime = useMemo(
    () => ({ publication, reference: applicationThemeReference }),
    [publication],
  );

  useLayoutEffect(() => {
    coordinator.publish(APPLICATION_THEME_CONTRIBUTOR_ID, publication);
  }, [coordinator, publication]);

  useEffect(
    () => () => {
      ownedThemeController?.destroy();
    },
    [ownedThemeController],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const reapplyApplicationTheme = () => themeController.reapply();
    window.addEventListener(PUBLIC_SITE_THEME_RELEASE_EVENT, reapplyApplicationTheme);
    return () =>
      window.removeEventListener(PUBLIC_SITE_THEME_RELEASE_EVENT, reapplyApplicationTheme);
  }, [themeController]);

  return (
    <ApplicationRootThemeRuntimeProvider runtime={rootThemeRuntime}>
      <ApplicationRuntimeContractHostProvider coordinator={coordinator}>
        <FormlessApplicationRendererProvider theme={theme}>
          <ApplicationNavigationBridge
            currentHref={currentHref}
            navigate={navigate}
            target={navigationTarget}
          >
            {children}
          </ApplicationNavigationBridge>
        </FormlessApplicationRendererProvider>
      </ApplicationRuntimeContractHostProvider>
    </ApplicationRootThemeRuntimeProvider>
  );
}
