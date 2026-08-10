import { Button, type ButtonSize, type ButtonVariant } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { FieldStatus } from "@astryxdesign/core/FieldStatus";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { HStack } from "@astryxdesign/core/HStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import type { FormEvent } from "react";
import type {
  ButtonContract,
  CreateFieldIntentHandler,
  CreateIntentHandler,
  CreateSurfaceContract,
  SemanticIconId,
} from "@dpeek/formless-presentation/contract";
import { FieldRenderer } from "./fields/field-renderer.tsx";
import { semanticIcon } from "./semantic-icon.tsx";

export function AstryxCreateSurfaceRenderer({
  onFieldIntent,
  onIntent,
  renderTrigger = true,
  surface,
}: {
  onFieldIntent: CreateFieldIntentHandler;
  onIntent: CreateIntentHandler;
  renderTrigger?: boolean;
  surface: CreateSurfaceContract;
}) {
  const emitOpenChange = (open: boolean) => {
    void onIntent({ open, surfaceId: surface.id, type: "createOpenChange" });
  };

  return (
    <>
      {renderTrigger ? (
        <CreateButton button={surface.trigger} onClick={() => emitOpenChange(true)} />
      ) : null}
      <Dialog
        aria-label={surface.dialog.title}
        isOpen={surface.dialog.open}
        onOpenChange={emitOpenChange}
        purpose="form"
        width={520}
      >
        <form
          id={surface.dialog.form.id}
          noValidate
          onSubmit={(event) => submitCreateForm(event, surface, onIntent)}
        >
          <Layout
            header={<DialogHeader title={surface.dialog.title} onOpenChange={emitOpenChange} />}
            content={
              <LayoutContent>
                <VStack gap={3}>
                  <fieldset
                    aria-label={surface.dialog.form.fieldSet.label}
                    disabled={surface.dialog.form.fieldSet.disabled}
                    title={surface.dialog.form.fieldSet.disabledReason}
                    {...stylex.props(styles.fieldSet)}
                  >
                    <FormLayout direction="vertical">
                      {surface.dialog.form.fieldSet.fields.map((field) => (
                        <FieldRenderer
                          key={field.fieldId}
                          field={field}
                          onIntent={(intent) => onFieldIntent(field.fieldId, intent)}
                        />
                      ))}
                    </FormLayout>
                  </fieldset>
                  <CreateFormErrors errors={surface.dialog.form.errors} />
                </VStack>
              </LayoutContent>
            }
            footer={
              <LayoutFooter>
                <HStack gap={2} hAlign="end">
                  <CreateButton
                    button={surface.dialog.form.cancel}
                    onClick={() => emitOpenChange(false)}
                  />
                  <CreateButton button={surface.dialog.form.submit} form={surface.dialog.form.id} />
                </HStack>
              </LayoutFooter>
            }
          />
        </form>
      </Dialog>
    </>
  );
}

function CreateButton({
  button,
  form,
  onClick,
}: {
  button: ButtonContract;
  form?: string;
  onClick?: () => void;
}) {
  const icon = button.content.kind === "label" ? undefined : button.content.icon;
  const renderedIcon = icon ? createButtonIcon(icon) : undefined;
  const tooltip =
    button.disabledReason ??
    (button.content.kind === "iconOnly" ? button.accessibilityLabel : undefined);

  if (button.content.kind === "iconOnly" && renderedIcon) {
    return (
      <IconButton
        form={form}
        icon={renderedIcon}
        isDisabled={Boolean(button.disabled)}
        isLoading={Boolean(button.pending?.isPending)}
        label={button.accessibilityLabel}
        onClick={onClick}
        size={createButtonSize(button)}
        tooltip={tooltip}
        type={button.type}
        variant={createButtonVariant(button)}
      />
    );
  }

  return (
    <Button
      form={form}
      icon={renderedIcon}
      isDisabled={Boolean(button.disabled)}
      isIconOnly={button.content.kind === "iconOnly"}
      isLoading={Boolean(button.pending?.isPending)}
      label={button.accessibilityLabel}
      onClick={onClick}
      size={createButtonSize(button)}
      tooltip={tooltip}
      type={button.type}
      variant={createButtonVariant(button)}
    >
      {button.content.kind === "iconOnly" ? undefined : button.content.label}
    </Button>
  );
}

function CreateFormErrors({ errors }: { errors: readonly string[] }) {
  if (errors.length === 0) {
    return null;
  }

  return <FieldStatus message={errors.join(" ")} type="error" variant="detached" />;
}

function submitCreateForm(
  event: FormEvent<HTMLFormElement>,
  surface: CreateSurfaceContract,
  onIntent: CreateIntentHandler,
) {
  event.preventDefault();
  void onIntent({ surfaceId: surface.id, type: "createSubmit" });
}

function createButtonVariant(button: ButtonContract): ButtonVariant {
  if (button.prominence === "primary") {
    return "primary";
  }

  return button.prominence === "quiet" ? "ghost" : "secondary";
}

function createButtonSize(button: ButtonContract): ButtonSize {
  return button.density === "compact" ? "sm" : "md";
}

function createButtonIcon(icon: SemanticIconId) {
  return semanticIcon(icon);
}

const styles = stylex.create({
  fieldSet: {
    borderWidth: 0,
    margin: 0,
    minWidth: 0,
    padding: 0,
  },
});
