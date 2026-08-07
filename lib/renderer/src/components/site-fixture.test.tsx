import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vite-plus/test";

import { FormlessSiteLayout } from "./site-fixture.tsx";

it("renders the public Site explorer layout with its required Site theme context", () => {
  expect(() => renderToStaticMarkup(<FormlessSiteLayout />)).not.toThrow();
});
