import { Button } from "@astryxdesign/core/Button";
import { PublicSiteThemeProvider } from "@dpeek/formless-site-app/public/react";
import { useMemo } from "react";

import {
  createAstryxPublicFormFixtureControllers,
  publicSiteMultipleFormFixtureLayout,
  type AstryxPublicSiteFormFixtureLayout,
} from "../fixtures/public-site-forms.ts";
import { AstryxSitePresentation, type ProjectedPublicFormChallengeComponent } from "./site.tsx";

export function FormlessSiteLayout() {
  return <AstryxSitePageFixtureRenderer fixture={publicSiteMultipleFormFixtureLayout} />;
}

export function AstryxSitePageFixtureRenderer({
  fixture,
}: {
  fixture: AstryxPublicSiteFormFixtureLayout;
}) {
  const formSessionControllers = useMemo(
    () => createAstryxPublicFormFixtureControllers(fixture),
    [fixture],
  );

  return (
    <PublicSiteThemeProvider site={fixture.rendererProps.tree.site}>
      <AstryxSitePresentation
        formChallengeComponent={AstryxPublicFormFixtureChallenge}
        formSessionControllers={formSessionControllers}
        rendererProps={fixture.rendererProps}
      />
    </PublicSiteThemeProvider>
  );
}

const AstryxPublicFormFixtureChallenge: ProjectedPublicFormChallengeComponent = ({
  onTokenChange,
}) => (
  <Button
    label="Complete challenge"
    type="button"
    variant="secondary"
    onClick={() => onTokenChange("fixture-challenge-ready")}
  />
);
