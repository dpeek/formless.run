import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type {
  ButtonContract,
  CreateSurfaceContract,
  OperationButtonContract,
} from "@dpeek/formless-presentation/contract";
import { AstryxCreateSurfaceRenderer } from "./create-renderer.tsx";
import { AstryxOperationButton } from "./operation-renderer.tsx";

describe("Formless Renderer semantic icons", () => {
  it("renders trusted built-in sources for representative controls without runtime catalog input", () => {
    const html = renderToStaticMarkup(
      <>
        <AstryxOperationButton button={operationButton()} onIntent={() => undefined} />
        <AstryxCreateSurfaceRenderer
          onFieldIntent={() => undefined}
          onIntent={() => undefined}
          surface={createSurface()}
        />
      </>,
    );

    expect(html).toContain('aria-label="Delete completed tasks"');
    expect(html).toContain('aria-label="Create task"');
    expect(html.match(/data-astryx-source-icon="svg"/g)).toHaveLength(2);
    expect(html.match(/aria-hidden="true"/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

function operationButton(): OperationButtonContract {
  return {
    accessibilityLabel: "Delete completed tasks",
    content: { icon: "delete", kind: "iconOnly" },
    density: "compact",
    id: "delete-completed",
    intent: {
      controlId: "delete-completed",
      invocationSource: "button",
      type: "operationInvoke",
    },
    kind: "button",
    prominence: "destructive",
    type: "button",
  };
}

function createSurface(): CreateSurfaceContract {
  return {
    dialog: {
      form: {
        cancel: button("create:cancel", "Cancel"),
        errors: [],
        fieldSet: {
          disabled: false,
          errors: [],
          fields: [],
          id: "create:fields",
          kind: "fieldSet",
        },
        id: "create:form",
        kind: "createForm",
        submit: button("create:submit", "Create task", "primary", "submit"),
      },
      id: "create:dialog",
      kind: "createDialog",
      open: false,
      title: "Create task",
    },
    id: "create:task",
    kind: "createSurface",
    trigger: {
      ...button("create:trigger", "Create task", "quiet"),
      content: { icon: "add", kind: "iconOnly" },
      density: "compact",
    },
  };
}

function button(
  id: string,
  label: string,
  prominence: ButtonContract["prominence"] = "secondary",
  type: ButtonContract["type"] = "button",
): ButtonContract {
  return {
    accessibilityLabel: label,
    content: { kind: "label", label },
    density: "default",
    id,
    kind: "button",
    prominence,
    type,
  };
}
