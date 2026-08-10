import type { BuiltInIconKey } from "@dpeek/formless-icons";
import {
  addIconSource,
  archiveIconSource,
  calendarIconSource,
  closeIconSource,
  confirmIconSource,
  copyIconSource,
  deleteIconSource,
  disclosureDownIconSource,
  disclosureIconSource,
  dragHandleIconSource,
  editIconSource,
  indeterminateIconSource,
  loadingIconSource,
  menuIconSource,
  nextIconSource,
  previousIconSource,
  publishIconSource,
  removeIconSource,
  selectDownIconSource,
  selectIconSource,
  sortIconSource,
  syncIconSource,
  treeDisclosureIconSource,
  uploadIconSource,
} from "@dpeek/formless-icons/sources";
import type { SemanticIconId } from "@dpeek/formless-presentation/contract";
import { SourceIcon } from "./field-primitives.tsx";

const rendererBuiltInIconSources = {
  add: addIconSource,
  archive: archiveIconSource,
  calendar: calendarIconSource,
  close: closeIconSource,
  confirm: confirmIconSource,
  copy: copyIconSource,
  delete: deleteIconSource,
  disclosure: disclosureIconSource,
  "disclosure-down": disclosureDownIconSource,
  "drag-handle": dragHandleIconSource,
  edit: editIconSource,
  indeterminate: indeterminateIconSource,
  loading: loadingIconSource,
  menu: menuIconSource,
  next: nextIconSource,
  previous: previousIconSource,
  publish: publishIconSource,
  remove: removeIconSource,
  select: selectIconSource,
  "select-down": selectDownIconSource,
  sort: sortIconSource,
  sync: syncIconSource,
  "tree-disclosure": treeDisclosureIconSource,
  upload: uploadIconSource,
} satisfies Partial<Record<BuiltInIconKey, string>>;

type RendererBuiltInIconKey = keyof typeof rendererBuiltInIconSources;

const semanticIconBuiltInKeys = {
  add: "add",
  archive: "archive",
  calendar: "calendar",
  close: "close",
  confirm: "confirm",
  copy: "copy",
  delete: "delete",
  disclosure: "disclosure",
  disclosureDown: "disclosure-down",
  dragHandle: "drag-handle",
  edit: "edit",
  indeterminate: "indeterminate",
  loading: "loading",
  menu: "menu",
  next: "next",
  previous: "previous",
  publish: "publish",
  remove: "remove",
  select: "select",
  selectDown: "select-down",
  sort: "sort",
  sync: "sync",
  treeDisclosure: "tree-disclosure",
  upload: "upload",
} satisfies Record<SemanticIconId, RendererBuiltInIconKey>;

export function semanticIcon(icon: SemanticIconId) {
  const builtInKey = semanticIconBuiltInKeys[icon];

  return (
    <SourceIcon
      aria-hidden
      color="inherit"
      size="sm"
      source={rendererBuiltInIconSources[builtInKey]}
    />
  );
}
