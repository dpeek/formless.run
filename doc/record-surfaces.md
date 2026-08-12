# Record Surface Architecture

Last updated: 2026-08-12

Purpose: controlling design note for simplifying generated record display and
authoring across multiple independently shippable changes.

This is not shipped behavior. Shipped behavior lives in
`openspec/specs/*/spec.md`. Each Git-backed change must update canonical specs
for the coherent current state that it ships.

Individual Git-backed changes own their scope, spec delta, tasks, and evidence.
This document owns only the target architecture and sequencing constraints.

This is not a compatibility or migration plan. Formless does not retain old and
new record-surface contracts in parallel.

## Objective

Formless should describe record field selection and presentation once, then
reuse that description wherever a record is displayed or authored.

The target model is:

- one `recordView` selects and presents record fields;
- an existing-record placement displays the view unless it explicitly supports
  inline update;
- a create or update operation can bind a record view as its form;
- the bound operation kind determines whether form submission creates or
  updates;
- create and update forms share one whole-record draft foundation;
- inline update uses a field-scoped transaction;
- tables remain display-only projections and expose row operations through the
  More menu;
- removed item/create/edit field contracts are deleted rather than retained as
  aliases, shims, deprecated declarations, or compatibility parsers.

This direction is deliberately split into changes. Every change must leave one
coherent current model and delete the code it supersedes.

## Terms

- **Record view:** a reusable schema declaration that selects entity fields and
  owns their occurrence presentation. It does not own persistence timing or
  transaction behavior.
- **Record field binding:** one field occurrence in a record view. It identifies
  the entity field and may add visibility or presentation facts.
- **Effective control:** the normalized authoring control derived from entity
  field semantics. The Presentation Seam receives the effective control, not
  the source syntax used to derive it.
- **Completion:** the control event that finishes a field interaction, such as
  blur, Enter, selection, picker close, or upload completion. Completion is not
  itself a persistence policy.
- **Runtime access:** the projected fact that a field is editable, disabled,
  read-only, a system field, or state-machine-owned for the current record and
  operation context.
- **Form transaction:** one draft session spanning all fields in the bound
  record view for one record, submitted once through a create or update
  operation. It does not imply that every entity field appears in the view.
- **Field-scoped transaction:** an existing-record inline interaction that
  resolves and writes only the completed field or one semantic group of flat
  fields.

## Starting Point

The current schema has separate field-based item, create, and edit view
categories. Their field declarations, parsers, union variants, client configs,
runtime selectors, Presentation projections, and fixtures repeat closely
related facts. Materialized bindings carry `editor`, while current production
declarations carry neither authored `commit` nor field `interaction`.

At adoption, every shipped effective control derives from field type and text
format except `block.mediaAssetId`, which is plain text but selects the media
editor in item, create, tree, and edit declarations. No shipped entity-field
pair selects different editors by occurrence. These facts justify removing the
general override while strengthening media semantics.

Projection-only tables and More-menu row operations are already shipped. Table
cells do not own draft, commit, revert, or field intents. Row edit dialogs still
patch fields independently, and their Done action only closes the dialog.

Canonical starting facts live in `openspec/specs/app-schema/spec.md`,
`openspec/specs/generated-ui/spec.md`, `openspec/specs/core-media/spec.md`, and
`openspec/specs/media/spec.md`. Once a change ships, those specs supersede this
starting-point description.

## Architectural Shape

### Field Behavior Module

Field Behavior is the deep Module for scalar and reference field semantics.

Its Interface should accept an entity field plus structural context and expose
the facts needed by schema validation, runtime authoring, display formatting,
and Presentation projection. Its Implementation owns:

- effective control derivation;
- completion classification for existing-record inline authoring;
- stored-value and draft-value validation;
- create defaults and input conversion;
- input attributes and display formatting;
- enum and reference behavior;
- icon value behavior;
- image and document asset behavior.

This produces Leverage across create forms, update forms, inline record fields,
operation inputs, archive discovery, and future record views. It produces
Locality by keeping field/control validity in one place.

The deletion test distinguishes this Module from the current parser and
projection pass-throughs. Deleting Field Behavior would redistribute semantic
branches across every caller. Deleting separate create/item/edit field parsers
after normalization makes their complexity disappear.

### Record Field Interface

The first normalized authored Interface is:

```ts
type RecordFieldBindingSource =
  | string
  | {
      field: string;
      visibleWhen?: FieldVisibilityConditionSchema;
      presentation?: FieldPresentationSchema;
    };
```

The normalized binding contains the same three facts with `field` always
present.

It does not contain:

- `editor` or `control`;
- `commit`, `completion`, or persistence timing;
- `interaction`, `displayOnly`, or authored `readOnly`;
- create defaults or required-field coverage;
- runtime permission or update-operation availability;
- table formatting or layout facts;
- transaction or draft state.

`presentation` remains the occurrence-level term for real display differences,
including completion-checkbox, enum icon, heading, quiet-date, and visibility
presentation. It does not choose the semantic control.

Do not add an occurrence `control` override in the first change. No shipped
entity field uses different controls in different record views. If two real
control implementations later need to author the same semantic field, a narrow
`control` property can be added without restoring editor or commit syntax.

### Consumer Validation

One parser owns string/object normalization, field lookup, duplicate rejection,
visibility, presentation, and field-based union variant parsing.

Thin consumer Adapters impose lifecycle rules:

- create forms accept writable value fields and enforce required-field coverage,
  defaults, context defaults, union discriminator rules, and state-machine
  initial state;
- existing-record placements may include system fields, with runtime access
  deciding whether normal editing is available;
- state-machine-owned fields never enter a generic existing-record patch;
- item-only context links remain a union presentation concern rather than a
  nullable field-binding property;
- operation input declarations remain command contracts, not record-view field
  bindings, while reusing Field Behavior.

Create declarations should reject system field bindings rather than parsing
them and silently dropping them in the client.

### Media Semantics

Media asset identity belongs on the entity field:

```ts
type TextFieldAssetPolicySchema =
  | { kind: "image" }
  | TextFieldDocumentAssetPolicySchema;
```

A media field remains a flat text asset id. The asset policy derives the media
control, upload behavior, preview kind, and archive reference kind.

This is the smallest durable model because image and document are two real
implementations:

- `format: "media"` would split asset semantics between `format` and `asset`;
- a distinct media field type would duplicate text storage, query, protocol,
  and validation behavior;
- a record-view control override would leave media meaning dependent on
  placement and preserve archive view scanning.

The first image policy needs only `kind: "image"`. Add image-specific policy
facts only when real image fields require different behavior.

### Display And Access

Delete authored field `interaction` without replacement.

Display-only behavior has stronger owners:

- a record placement chooses display or explicit inline update;
- a table is a display-only projection;
- a form is authoring because it is bound to a create or update operation;
- system fields are intrinsically non-writable;
- state-machine fields are transition-owned for existing records;
- current permissions, operation availability, and pending state determine
  runtime access.

`readOnly` is reserved for runtime access. The model does not preserve an
unused authored ability to make one ordinary writable field display-only among
editable siblings. A concrete future requirement may add a narrower placement
or presentation fact; it must not restore the old `"edit" | "display"` axis.

## Field Derivation

| Entity field semantics | Effective control | Existing-record inline completion |
| --- | --- | --- |
| Plain text | text | blur or Enter |
| `format: "longText"` | textarea | blur |
| `format: "markdown"` | Markdown source | blur |
| `format: "email"` | validated email text | blur or Enter |
| `format: "phone"` | validated phone text | blur or Enter |
| `format: "href"` | href text | blur or Enter |
| `format: "slug"` | slug text | blur or Enter |
| `format: "color"` | colour picker | picker change or clear |
| `format: "icon"` plus icon value mode | icon picker | selection or valid custom-source close |
| `asset.kind: "image"` | image media picker/upload | selection, removal, or completed upload |
| `asset.kind: "document"` | document media picker/upload | selection, removal, or completed upload |
| Boolean | checkbox | natural toggle event |
| Date | date input | natural selection or clear |
| Number | formatted number | blur or Enter |
| Enum | select | natural selection or clear |
| Reference | reference selector | natural selection or clear |
| System field | display | none |
| State-machine-owned field | create initial value or existing transitions | form submit on create; no generic existing-record completion |

Field completion is a Renderer interaction fact. Persistence is selected by the
surface Adapter:

- a form Adapter applies draft changes to the whole-record draft, treats field
  completion as non-persistent, and writes only on form submit;
- an inline-update Adapter applies draft changes locally and resolves completion
  to one field-scoped patch;
- a display Adapter exposes no authoring intents.

The current Presentation `commit` fact may remain during early changes because
the Renderer consumes it. It is derived, not authored. Rename it to a completion
contract only when the transaction changes let the old fact and intents be
deleted rather than renamed in place.

## Transaction Model

### Whole-Record Form Session

Create and update forms eventually share a Form Session Module with one draft
shape and common field behavior. The bound operation supplies lifecycle facts:

- create begins from defaults and context-derived values and invokes a create
  operation;
- update begins from one record baseline and invokes an update operation;
- Save resolves and validates the active bound fields as one operation input;
- Cancel discards the form draft and performs no write.

The common Interface must not become one nullable contract containing every
create and update concern. Lifecycle-specific defaults, operation input, and
effects stay behind create and update Adapters at the form-operation Seam.

### Inline Field Session

Inline update remains deliberately different:

- a field draft starts from the record baseline;
- the control-specific completion event resolves one field or one semantic
  group of flat fields;
- successful completion invokes the bound update operation with a field-scoped
  patch;
- Escape or picker cancellation restores the baseline where the control
  supports it;
- pending, failure, and replica rebase remain field-scoped.

Value-unit controls and media uploads may update a semantic group such as value
plus unit or asset id plus dimensions. Their Implementation still produces flat
record values. Record-view syntax does not expose grouping or persistence
timing unless a second real grouping implementation proves a schema Interface
is needed.

### Draft And Validation Invariants

- Hidden and inactive-union drafts remain in local session state so revealing a
  field restores its draft.
- Hidden and inactive fields are excluded from create input and update patches.
- Invalid raw drafts remain visible with field errors and produce no write.
- Invalid stored values are separate integrity facts; display surfaces show
  explicit warnings rather than coercing them into valid drafts.
- Create required-field coverage remains a schema/operation validation rule.
- Existing-record field completion validates the affected field or semantic
  group before a patch.
- Form Save validates the active bound field set and whole-form invariants before
  invoking the bound operation.
- Authority remains the final source of record validation.
- State-machine-owned fields never enter a generic update patch.
- Runtime permissions and operation availability may disable an otherwise
  writable semantic field without changing the record view.
- Operation failure retains the draft and exposes an error; successful replica
  updates rebase the local baseline.

## Record View And Placement Model

A future `recordView` owns only reusable record selection and occurrence
presentation. Its exact source syntax belongs to the change that introduces it,
but its Interface must satisfy these rules:

- one entity per view;
- shared record field bindings for base and union fields;
- no create/edit lifecycle category;
- no persistence timing;
- no runtime permissions;
- no table column behavior;
- no operation effect or actor policy.

Placements and operations consume the view:

| Consumer | Meaning |
| --- | --- |
| Existing-record display placement | Project the view without field authoring intents. |
| Explicit inline-update placement | Project runtime-writable fields with field-scoped transactions. |
| Create operation form binding | Use the view as whole-record create input presentation. |
| Update operation form binding | Use the view as whole-record update input presentation. |
| Table row update operation | Open the bound update form from the row More menu. |

The operation remains the domain contract for what happens. The record view is
presentation reused by the binding; it does not redefine operation input,
effect, actor policy, idempotency, or audit. See
[Operations Architecture](operations.md).

## Presentation Seam

The Presentation Seam receives normalized facts. It must not expose whether an
effective control came from a default, format, asset policy, or any future
narrow override.

Retain distinct contracts while their transaction Interfaces differ:

- display field;
- create or update form field;
- inline record field;
- operation input field.

Do not force them into a giant nullable field contract. Collapse contract and
intent families only after shared form and record-surface Modules make the
distinctions redundant.

Presentation owns renderer-neutral facts such as:

- identity, value, draft, label, and errors;
- effective control and control options;
- surface, mode, density, and occurrence presentation;
- runtime access and pending state;
- derived completion behavior during the transitional contracts;
- specialized media, icon, reference, enum, state-machine, and grouped-field
  facts.

The Renderer Adapter owns control-specific event handling and DOM/Astryx
mapping. It does not infer entity schema, operation availability, media write
plans, or runtime access.

## Layer Ownership

| Layer | Ownership |
| --- | --- |
| Canonical specs | The current shipped record-view, field, transaction, table, and Renderer behavior after each change. |
| Schema | Entity field semantics, record field syntax, record views, consumer validation, and serialization. |
| Shipped app declarations | Entity fields, reusable record views, placements, and operation bindings. |
| Client models | Schema lookup and normalized field/view/placement configs; no authored editor or commit propagation. |
| Generated runtime | Draft sessions, visibility, union selection, access, option loading, validation, effects, pending, failure, and rebase. |
| Presentation | Renderer-neutral effective field, form, placement, and intent contracts. |
| Renderer | Production control rendering and event-to-intent mapping through real Astryx. |
| Archive | Asset reference discovery from semantic entity fields, independent of view placement. |

## Change Sequence

### 0. Projection-Only Tables — Shipped

Tables display compact values and expose row operations through More menus.
Table cells carry no authoring intents. Existing row edit dialogs still use
per-field writes and Done-only close.

Residual table configs that still synthesize editor or commit facts should be
deleted by the semantic-field change rather than treated as supported table
behavior.

### 1. Semantic Record-Field Bindings

Make entity field semantics the sole source of effective controls. Introduce
image asset semantics. Replace create/item/edit field declarations with the
shared string-or-object binding. Delete authored editor and interaction,
duplicate field types/parsers/configs, archive view scanning, and source-editor
facts at the Presentation Seam.

Preserve current transaction behavior:

- create remains whole-form submit;
- item/list/record/tree authoring remains field-scoped;
- row and reference-target edit dialogs keep per-field writes;
- Done only closes an edit dialog.

### 2. Reusable Record Views

Replace field-based item, create, and edit view formats with one `recordView`
format plus placement and operation bindings. Delete the old registries,
parsers, selectors, schema artifacts, and fixtures in the same change.

Keep current transactions during this structural change. A create binding still
submits a form; inline placements still patch fields; update dialogs still use
their current behavior until atomic forms ship.

### 3. Shared Record-Surface Runtime Module

Consolidate record field selection, union/visibility projection, control facts,
options, display formatting, and Presentation construction behind one deep
Module. Record, list, tree, selected detail, context detail, and form consumers
become thin placement Adapters.

Do not combine transaction state merely to remove type names. Create/update form
and inline field transactions remain distinct Interfaces.

### 4. Atomic Update Forms

Bind update operations to whole-record Form Sessions with real Save and Cancel.
Share the draft foundation with create while retaining update-specific baseline,
patch, permission, and rebase behavior behind its Adapter.

Replace per-field edit-dialog writes and Done-only close with atomic form
semantics where an update form is bound. Inline-update placements remain
field-scoped.

### 5. Presentation Contract Contraction

Remove lifecycle-specific Presentation contracts, session facts, and intents
that no longer express real differences. Replace transitional `commit`
terminology with a completion contract if the resulting model deletes old event
paths. Keep display, form, and inline transaction differences explicit wherever
they still exist.

## Change Discipline

Every Git-backed change in this sequence must:

- reference this document for direction and name the section it advances;
- treat canonical OpenSpec files as the authority for that change's resulting
  shipped state;
- state its transaction invariants and non-goals explicitly;
- update all affected schema artifacts, shipped declarations, client/runtime
  paths, Presentation contracts, Renderer fixtures, archives, workspace
  serialization, package exports, and public integration fixtures;
- delete superseded types, parsers, selectors, adapters, fixtures, and tests;
- avoid aliases, compatibility parsers, dual-schema phases, deprecated forms,
  and proof of removed behavior;
- verify behavior through public contracts, artifacts, runtime effects, and the
  production Renderer with real Astryx;
- leave later changes unnecessary for repository coherence.

A change should not copy future target facts into canonical specs before it
ships them. Update this document when a later design decision materially changes
the target sequence or Interface.

## Decisions And Trade-Offs

### Retained

- Existing effective controls and specialized picker behavior.
- Flat record storage and flat create/update operation input.
- Occurrence presentation and conditional visibility.
- Runtime access, system fields, and state-machine ownership.
- Create whole-form submission until the shared form changes.
- Existing-record inline field completion.
- Display-only tables and More-menu row operations.
- Invalid-draft preservation, stored-value warnings, pending, failure, and
  rebase behavior.

### Changed

- Entity fields, not record views, determine normal controls.
- Image asset fields declare semantic asset identity.
- One field declaration and parser serve record-shaped views.
- Existing-record display versus inline update becomes a placement decision.
- Create versus update becomes an operation-form binding decision.

### Removed

- Arbitrary authored editor choice for a field occurrence.
- Authored persistence timing.
- Authored field `"edit" | "display"` interaction.
- A hypothetical mixed authoring surface that forces one ordinary writable
  field to display-only.
- View-dependent media identity.
- Parallel item/create/edit field contracts.

### Escape Hatches

- Occurrence `presentation` remains for real visual differences.
- Runtime access remains contextual.
- Custom UI may bind the same operations without using generated record views.
- A narrow control override may be introduced later only when at least two real
  implementations require it.

Removing the old editor model is reversible only by adding a new, evidence-led
control choice. It must not be reversed by restoring the old general editor
catalog, commit syntax, or compatibility parser.

## Deferred Decisions

- Exact `recordView`, placement, and form-binding source syntax belongs to the
  reusable-record-view change.
- `EntityUnionVariantSchema.requiredFields` does not currently drive create
  draft requiredness; changing that is separate product semantics.
- Image-specific upload policy beyond `kind: "image"` requires a real varying
  field.
- Field-level display inside an authoring form requires a shipped use case.
- Presentation `commit` becomes `completion` only when transaction work can
  delete the old contract and intent paths.
