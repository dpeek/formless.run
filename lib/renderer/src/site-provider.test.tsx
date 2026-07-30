import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import {
  FORMLESS_SITE_RENDERER_DOCUMENT_THEME,
  FormlessSiteRendererProvider,
} from "./site-provider.tsx";

describe("Formless Site renderer provider", () => {
  it.each(["light", "dark"] as const)(
    "applies the stable renderer identity and canonical %s mode",
    (mode) => {
      const html = renderToStaticMarkup(
        <FormlessSiteRendererProvider mode={mode}>
          <main>Selected Site renderer</main>
        </FormlessSiteRendererProvider>,
      );

      expect(html).toContain(`data-theme="${mode}"`);
      expect(html).toContain(`data-site-theme="${mode}"`);
      expect(html).toContain("data-formless-native-navigation");
      expect(html).toContain("data-astryx-public-site-provider");
      expect(html).toContain(
        `${FORMLESS_SITE_RENDERER_DOCUMENT_THEME.attribute}="${FORMLESS_SITE_RENDERER_DOCUMENT_THEME.value}"`,
      );
      expect(html).toContain("<main>Selected Site renderer</main>");
    },
  );
});
