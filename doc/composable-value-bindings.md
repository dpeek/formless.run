# Composable Selection And Value Bindings

Last updated: 2026-08-10

Purpose: long-term architecture proposal for composable generated views built
from bounded typed values, selection, explicit bindings, and renderer-neutral
presentation controls.

This is not shipped behavior. Shipped behavior lives in
`openspec/specs/*/spec.md`.

This is not a committed implementation sequence. Concrete Git-backed changes
should be selected by immediate Formless or downstream Program requirements.
The purpose of this document is to make those independently useful changes
converge on one coherent design.

## Problem

Generated collection views currently combine several concerns through one
optional collection context:

- querying records that may be selected;
- rendering those records as tabs, a list, or sidebar navigation;
- declaring one selection dimension whose requested record id is owned by
  route-local UI state;
- selecting a fallback when the requested id is absent or stale;
- binding the selected id into the active collection query;
- deriving relationship counts, creation defaults, and item detail;
- supplying the root for tree presentation.

Query tabs and tree item selection add separate specialized selection paths.
This works for current generated surfaces, but it prevents a schema author from
reusing one selected value across otherwise independent views, queries,
operations, and presentations.

A composed screen should be able to express relationships such as:

- a status selection filters a Project query;
- the Project results are presented as a selectable list;
- the selected Project drives a detail editor;
- an Item query binds its Project reference to the same selection;
- a Group and Item tree uses the same Project as its root;
- the Project request is owned by local state on one screen and a path parameter
  on another without changing any consumer.

These are view and runtime composition concerns. They do not require nested
stored data, executable schema expressions, renderer-side queries, or a global
application store.

## Direction

Introduce an additive composable view-schema surface based on separable roles:

1. a typed named value;
2. one closed provider for that value;
3. an ordered option set when the value is selectable;
4. a request owner for the raw selection request;
5. explicit bindings from effective values to typed consumer inputs;
6. presentation controls that render resolved state and emit semantic intents.

This direction may be discussed informally as "View Schema V2," but that name
must not appear in the schema or runtime contract.

- Do not add an App schema version, view schema version, negotiation protocol,
  or `v1` and `v2` renderer contracts.
- New declaration shapes may coexist with current collection views, contexts,
  singleton scopes, query tabs, list-detail presentation, and trees.
- A downstream Program may adopt one new view without changing its other
  screens.
- The downstream-owned `formless.ts` selects new declarations and required
  runtime capabilities explicitly. Do not add discovery, implicit module
  inclusion, or provider negotiation.
- Current public declarations do not need to change or be reauthored before the
  first new capability ships.
- Each new declaration should extend only the existing owning layers exercised
  by its concrete scenario. It must not introduce a parallel application
  runtime or speculative operation, URL, dependency, or presentation
  machinery.
- Current primitives may reuse the same internal resolution helpers when that
  removes real duplication. Broader convergence requires a separate
  demonstrated benefit.

Additive coexistence is the iteration strategy. Compatibility aliases,
versioned duplicates, and automatic translation are not.

## Current Starting Point

Current as of 2026-08-10.

The current implementation provides useful seams to deepen:

- `lib/schema/src/types.ts` defines `QueryDynamicValue`, scalar
  `QueryEvaluationContext`, `CollectionContextSchema`, and
  `CollectionViewSchema`.
- `lib/schema/src/schema-collection-contexts.ts` validates query context names
  against one collection context or singleton scope and validates related
  reference predicates.
- `lib/schema/src/schema-collection-results.ts` makes tree roots depend on a
  collection context.
- `lib/formless/src/client/collection-shell-model.ts` selects one specialized
  `HomeContextConfig`.
- `lib/formless/src/client/generated-authoring.ts` resolves singleton and
  context selections and currently falls stale context requests back to the
  first option.
- `lib/formless/src/app/routes/home-selection.tsx` owns selected query and
  context state by screen and section.
- `lib/formless/src/app/generated/generated-workspace-foundation.ts` evaluates
  scope, options, selection, query context, collection results, context detail,
  and tree facts.
- `lib/formless/src/app/generated/generated-workspace-runtime.tsx` validates and
  handles query, context, tree-context, and tree-item selection intents as
  distinct cases.
- `lib/presentation/src/contract.ts` and `lib/renderer` already enforce the
  desired renderer boundary: the runtime projects resolved controlled
  contracts, and the Renderer emits semantic intents without evaluating schema
  queries or choosing fallback.

The Site editor demonstrates both the value and the limit of the current path.
Its selected Block identity drives a placement query and tree root, while the
same collection context also owns sidebar navigation, list-detail metadata,
relationship information, creation, and item detail. Sidebar projection and
workspace projection then resolve overlapping selection facts independently.
Sidebar navigation takes precedence over the declared list-detail presentation,
and inline-editor tree rendering suppresses the separate context detail. The
Site editor therefore demonstrates duplicated selection resolution, not the
current local list-detail rendering path.

The new work should deepen the existing runtime boundary. It should not begin
with a new compiler, store, renderer protocol, or application host.

## Convergence Constraints

Every admitted capability must preserve these constraints.

### Data And Schema

- App schema remains runtime data.
- Stored application records remain flat.
- Adopting a composable view does not transform stored records. Any required
  data evolution remains a separate explicit operation or migration.
- Rich composition remains in queries, read models, views, screens,
  projections, and operations.
- Schema contains no executable callbacks or arbitrary expressions.
- A selected record is represented by stable typed identity, not a full record
  object.
- Absent, requested, pending, unavailable, and effective values remain
  distinguishable.

### Values And Bindings

- Each named value has exactly one provider in one lexical occurrence.
- Consumers receive only resolved effective values.
- Raw selection requests never bind directly into queries, views, or
  operations.
- Bindings are explicit, typed, and directional.
- An unresolved required binding never causes a query predicate to be omitted
  or broadened.
- A bound operation input cannot also be authored by the caller.
- Action or operation outputs do not become general reactive value providers.

### Scope And Identity

- Values are lexically owned by a screen or view occurrence, not by a global
  schema-visible store.
- Same-scope names are unique. Nested views receive ancestor values only through
  declared inputs; there is no ambient ancestor-name lookup or implicit shadow
  capture.
- Repeated occurrences of the same reusable view have independent identities
  and state unless a common ancestor explicitly supplies the same value.
- A child can consume an ancestor value but cannot implicitly publish a value
  upward or sideways.
- Sharing between siblings is expressed by hoisting ownership to their nearest
  common ancestor.
- Presentation and operation intents carry stable occurrence identity and are
  validated against the latest runtime plan.
- An operation intent also identifies the plan generation or effective target
  observed when it was rendered. A later selection change makes that intent
  stale; dispatch must not silently retarget it.

### Runtime And Presentation

- Resolution uses one complete replica or server snapshot and publishes a
  coherent contract generation atomically.
- Incomplete or paginated option results are not proof that a requested value
  is invalid.
- Option completeness is an explicit runtime fact, not inferred from the
  current option array.
- A first-option default requires a total, portable ordering with stable
  identity as the final tie-break.
- Controls and layout do not own values or access data.
- Presentation contracts remain renderer-neutral and contain resolved state,
  stable identities, availability, and semantic intents.
- Renderers do not inspect App schema, evaluate queries, select fallback, own
  navigation policy, or execute effects.
- Selection state is never trusted as authorization. Reads and operations
  continue to enforce access and invariants.
- When effective identity changes, dependent draft, error, confirmation, and
  pending-effect state is cleared or rekeyed before the next contract is
  projected.

### Bounded Composition

- Provider kinds are a closed set owned by the schema and runtime.
- If dependent providers are admitted, their dependencies are statically
  declared, directional, and acyclic.
- Ordinary result views, layout, renderers, and operations are consumers, not
  nodes in a general reactive graph.
- Derived computation remains in named queries, read models, and projections.

## Domain Terms

### Value

A value is a named typed effective value in one lexical scope. Examples include
a Project reference or a declared Project status value.

The initial useful reference type is logically `recordRef(Project)`. Runtime
state and query evaluation may encode it as the scalar Project id because the
compiled declaration carries the entity type. The environment does not carry
the full Project record.

Additional scalar or derived value kinds should be admitted only with a
concrete consumer scenario.

### Provider

A provider is the one declared producer of a value. Provider kinds remain
closed. Likely kinds include:

- a fixed value;
- an input bound by a containing view or screen;
- a singleton query with explicit zero, one, and ambiguous results;
- a select-one provider that resolves a request against an option set.

A future derived provider must name a bounded query or read-model projection
with declared inputs. It must not introduce a general expression language.

### Request Ownership

A request owner owns the raw requested value for a selection. It defines state
lifetime and persistence without changing selection or consumer semantics.

Potential owners include:

- local ephemeral state owned by one screen or view occurrence;
- one path parameter;
- one query-string parameter.

A containing screen is not a request owner for a child. It provides an
effective value through an explicit input binding.

Local state is sufficient for the first admitted owner. Extract a shared
runtime adapter interface only when a second concrete owner, such as a URL
parameter, proves the seam.

### Option Set

An option set is an ordered collection of selectable values. It normally comes
from a schema query and projects stable identity, label, availability,
completeness, and any bounded presentation facts needed by a control.

The option set does not own selection state, fallback, detail layout, consumer
bindings, or navigation policy.

### Selection

A selection is a closed provider that resolves a requested value against an
option set and exposes one effective typed value.

Selection is semantic. Tabs, selector controls, lists, sidebar links, and other
visual forms are separate presentation bindings onto it.

### Parameter, Input, And Binding

A query parameter, view input, or operation input declares a typed value the
consumer requires. A binding maps an effective value to that input.

Queries continue to own filtering semantics. Views continue to own projection
and composition. Operations continue to own effects and authorization policy.
Bindings supply values; they do not redefine those contracts.

### Scope And Environment

Scope is the lexical ownership boundary. Environment is the runtime's resolved
snapshot of values for one scope occurrence.

Environment is runtime terminology, not an author-visible dictionary. Schema
authors cannot dynamically look up names, enumerate values, subscribe to slots,
or mutate an environment.

### Control

A control is one presentation placement for a selection. It receives resolved
options and selected state and emits semantic selection or navigation intents.

If a concrete capability admits multiple controls for one selection, they must
address the same selection occurrence explicitly and must not resolve it
independently.

## Normalized Semantic Kernel

The normalized runtime model separates six roles:

```text
typed value slot
  ← one closed provider

raw request ← request owner
       │
       ├──────────────┐
       │              │
ordered option set ───┴→ select-one provider → effective value
                                               ├→ query input
                                               ├→ view input
                                               ├→ operation input
                                               └→ dependent option query

selection control → request or navigation intent → runtime request owner
```

The normalized model is an internal module, not necessarily the public schema
surface. Public declarations may nest tightly related facts for authoring
locality, but parsing must retain the separate roles and validation rules.

Current context declarations and new composable declarations may remain
different public forms. When both express query-backed local record selection,
that overlapping behavior must populate one internal record-selection plan
inside the existing generated workspace section plan. Current-only context
navigation, relationship, creation, and tree facts remain explicit extensions.
One occurrence cannot declare both forms.

Removing this kernel should otherwise redistribute option resolution,
fallback, scoped identity, and intent validation across the workspace, shell,
routes, trees, and operation controllers. That is the coupling this design is
intended to prevent.

## Request And Resolution State

Raw request and effective selection are distinct:

```ts
type SelectionRequest<T> =
  | { state: "absent" }
  | { state: "invalidEncoding"; raw: string }
  | { state: "present"; value: T };

type SelectionResolution<T> =
  | { state: "pending" }
  | { state: "empty" }
  | { state: "unselected" }
  | { state: "unavailable"; requested: T }
  | {
      state: "ready";
      effective: T;
      origin: "requested" | "default";
    };
```

Only `ready.effective` is eligible for consumer bindings.

The request owner declares absent-value, invalid-value, and canonicalization
policy. The selection provider applies that policy as a pure resolution. If
canonicalization is required, the runtime derives a separate idempotent repair
effect after publishing the generation; the repair never changes the generation
that produced it.

Durable rules are:

- do not resolve or repair from an incomplete option set;
- preserve a requested identity while it remains eligible;
- publish no effective value for empty options;
- make default and invalid behavior explicit;
- do not mutate a raw request merely because a default was displayed unless the
  request owner's admitted policy explicitly canonicalizes it;
- issue an idempotent repair only after authoritative resolution and
  publication;
- discard results from obsolete evaluation generations;
- publish selection and all dependent consumers from one generation.

Local and URL-owned selection may deliberately use different invalid behavior.
A local selection can reasonably rebase and repair. A URL is also a shareable
claim about identity, so silently displaying a different record risks making
the screen disagree with its link. Exact URL behavior remains a product
decision until a route-backed scenario is admitted.

## Scope And Propagation

A portable value identity is its lexical owner plus local name. Runtime
identity adds the concrete occurrence path.

```text
(screen occurrence, nested view occurrences, local value name)
```

The encoding is an implementation detail, but it must be stable enough for
controlled contracts and exact intent validation.

A screen-owned Project selection may feed a detail view, an Item list, a tree,
and operation controls in sibling branches. A Project selection declared
inside one reusable view may feed only that occurrence and its descendants.

When the same reusable view is placed twice, each occurrence receives separate
local selection state, drafts, pending effects, and contracts. Sharing requires
an explicit parent value and two input bindings.

Do not introduce child output ports, upward lookup, cross-screen values, or
per-row environments before a concrete scenario demonstrates that lexical
inputs and common-ancestor ownership are insufficient.

## Dependency Evaluation

The useful dependency shape is deliberately narrow:

```text
status selection
  → Project option query
  → Project selection
      ├→ Project detail
      ├→ related Item query
      ├→ Project-rooted tree
      └→ bound operation controls
```

Only values, their closed providers, and concrete query invocations used as
option producers need ordering. The same named query used as an ordinary result
remains a sink in that invocation. Views, layout, Presentation contracts,
renderers, and operations also remain sinks.

If dependent option sets are admitted, schema parsing must reject:

- self-reference;
- a selection whose option query consumes its own output;
- mutually dependent selections;
- an out-of-scope value;
- a value whose type does not match the declared parameter.

Diagnostics should report the concrete dependency path. Runtime-discovered
dependencies, general transforms, dirty-closure scheduling, and per-slot
subscriptions remain out of scope.

## State Ownership And URLs

URL synchronization is a request-owner adapter, not a generic persistence flag and not
a mirror of local state.

For a URL-owned selection:

- the route or query-string parameter is the source of the raw request;
- a user activation receives a runtime-resolved destination and pushes browser
  history;
- browser back and forward reparses the URL into a new request;
- deep linking starts from the same request path;
- an automatic canonical repair, if the admitted policy allows one, replaces
  rather than pushes;
- no second local writable copy is synchronized with the URL.

Presentation may carry a canonical `href` or semantic navigation intent so
modified activation, copying, context menus, and browser navigation continue to
work. The Renderer does not receive route schema or decide history policy.

Parameterized screen paths are not currently part of App schema, so route-owned
selection must include a concrete path-pattern and SSR/hydration contract when
it is admitted. It should not be added as speculative request-owner
infrastructure before that scenario exists.

## Consumer Bindings

### Query Bindings

A query declares typed parameters. An invocation binds effective values to
them. The query expression continues to define its predicate.

Reference equality accepts a matching `recordRef(Entity)` and lowers it to the
stable record id for the current query evaluator. Missing required parameters
produce an unavailable query result, not an unfiltered query.

Current named query contexts continue to serve current collection views. Typed
parameters can be admitted for a composable view without translating those
current declarations.

### View Bindings

A view declares typed inputs such as the Project identity required by a detail
or tree view. A containing screen or view binds its effective value to that
input.

The child receives the value, not access to its parent's environment or state
adapter.

### Operation Bindings

An operation binding maps effective values directly into declared operation
input or target positions.

- Bound input is not also caller-authored.
- An unresolved required binding disables or omits invocation.
- Dispatch resolves the latest environment for the exact occurrence and
  verifies it still matches the effective target or generation observed by the
  rendered control.
- The intent carries stable control and observed-binding identity rather than a
  captured environment bag.
- Authority re-reads and revalidates target records, actor policy, references,
  and invariants.

A narrow post-create effect may request selection of the created record when a
concrete workflow requires it. Operation results must not become a general
reactive provider system.

## Presentation Boundary

The runtime resolves data access, selection, fallback, scope, navigation, and
effects before projection.

A selection-control contract can contain:

- stable control and selection occurrence identities;
- resolved options with stable ids, labels, availability, and selected state;
- ready, pending, empty, unselected, or unavailable presentation state;
- a semantic local-selection intent or runtime-resolved navigation activation;
- bounded accessibility and presentation facts.

It must not contain:

- App schema or query expressions;
- request owners or storage keys;
- raw record maps or full selected records;
- fallback policy;
- operation controllers or executable callbacks;
- route parsing or history policy.

Tabs, selectors, lists, sidebars, and future controls are renderer mappings over
this contract. A composable list-detail presentation is a selection control plus
a bound detail view. Current `listDetail` need not move to that composition.

## Runtime Evaluation

The generated runtime should extend its current foundation and contract-host
pipeline:

1. resolve the concrete screen and view occurrence tree;
2. read raw requests from admitted request owners;
3. evaluate provider and option dependencies against one complete snapshot;
4. resolve effective values and optional state-repair effects;
5. evaluate consumer queries and views with explicit bindings;
6. project one renderer-neutral contract generation;
7. publish the generation atomically;
8. validate incoming intents against the latest plan;
9. apply state, navigation, or operation effects outside projection.

React state is one implementation technique for local adapters. It is not the
schema model. The browser replica remains the source for protected records and
queries. Existing field, result, tree, and operation controllers remain the
owners of their effects.

The first implementation does not need a general environment store. A resolved
value map inside one workspace plan is sufficient. Introduce a more explicit
runtime module only when a second consumer or request owner proves the seam.

## SSR, Hydration, And Authorization

For a route-backed value, the server parses and type-decodes the request. If it
can evaluate the authoritative option set, it resolves the same selection as
the client. Otherwise it projects pending state rather than inventing a first
option.

Hydration preserves the route request and occurrence identities. Client
resolution publishes once the authoritative options are available. It must not
render one effective record on the server and silently replace it with another
after hydration.

Unavailable selection state should not distinguish a missing record from an
unauthorized record. Selection never proves existence or access. Every read and
operation retains its normal authorization and invariant checks.

## Illustrative Schema Shape

The following examples show semantic roles. They are not final source syntax.
Exact authoring syntax belongs to the first change that admits each capability.

### Local Project Selection And Detail

```yaml
values:
  project:
    type: recordRef(Project)
    provider: projectSelection

state:
  projectRequest:
    kind: local
    type: recordRef(Project)

options:
  projectOptions:
    type: recordRef(Project)
    query: ProjectList
    labelField: name
    order: [name.asc, id.asc]

selections:
  projectSelection:
    request: projectRequest
    options: projectOptions
    output: project
    default: first

layout:
  - control: projectSelection
    presentation: list
  - view: ProjectDetail
    bindings:
      record: { value: project }
```

The first useful public shape may nest the local request and query-backed
options inside one constrained selection declaration. It should still compile
to the separate semantic roles above. It must not also absorb downstream query
bindings, detail layout, navigation, relationship behavior, or operations.

### The Same Selection From A Path

Only request ownership changes:

```yaml
state:
  projectRequest:
    kind: pathParameter
    parameter: projectId
    type: recordRef(Project)
```

The Project detail, related Item query, tree, and operations continue to bind
the effective `project` value.

### Status-Filtered Projects

```yaml
values:
  status:
    type: fieldValue(Project.status)
    provider: statusSelection

options:
  statusOptions:
    kind: fixed
    values: [active, paused, completed]

queries:
  ProjectsByStatus:
    entity: Project
    parameters:
      status: fieldValue(Project.status)
    where:
      field: status
      equals: { parameter: status }

options:
  projectOptions:
    query: ProjectsByStatus
    bindings:
      status: { value: status }
```

This admits one bounded dependency: status selection before Project options and
Project selection.

### Related Items

```yaml
queries:
  ItemsForProject:
    entity: Item
    parameters:
      project: recordRef(Project)
    where:
      reference: project
      equals: { parameter: project }

views:
  RelatedItems:
    query: ItemsForProject
    bindings:
      project: { value: project }
```

### Project-Rooted Group And Item Tree

```yaml
views:
  ProjectStructure:
    inputs:
      rootProject: recordRef(Project)
    result:
      kind: tree
      presentation: inlineEditor
      roots:
        entity: Group
        query: GroupsForProject
        bindings:
          project: { input: rootProject }
      children:
        Group:
          entity: Item
          query: ItemsForGroup
          bindParentAs: group

layout:
  - view: ProjectStructure
    bindings:
      rootProject: { value: project }
```

Group and Item records remain flat. The tree is a query and projection over
references.

### Repeated Reusable Views

```yaml
layout:
  - id: leftProjects
    view: ProjectPane
  - id: rightProjects
    view: ProjectPane
```

Local values resolve under distinct occurrence paths. To share selection, the
screen declares one Project value and binds it into both panes.

## Accretive Delivery

### Admission Rule

Every implementation change begins with one concrete user-visible scenario in
Formless or an active downstream Program.

An admitted increment must:

1. name the screen or workflow it enables;
2. add the smallest public schema declaration required by that scenario;
3. work alongside current views in the same Program;
4. use the existing query, replica, operation, Presentation, and Renderer
   pipeline;
5. preserve the convergence constraints in this document;
6. cover the capability at its owning package boundary;
7. identify the exact downstream `formless.ts`, package, screen, and runtime
   composition seams when a downstream Program is the driver;
8. verify an exact downstream consumer revision against an exact Formless
   revision, on a recorded date, with exact type, build, configuration-load,
   state, and smoke commands when that Program is the driver;
9. record shipped behavior in canonical specs and implementation tasks in
   Git-backed change metadata.

An internal abstraction without a complete public declaration and rendered
user path is not an independently useful slice. When a downstream Program is
the driver, the slice is complete only after that exact consumer declares it,
parses it, mounts it, renders it, dispatches its intents, observes the intended
behavior, and records complete revision-pair evidence. Partial adoption is not
verification.

Add a provider kind, request owner, binding target, scope rule, or control only
when the admitted scenario makes that role vary. A second concrete
implementation establishes a reusable seam more reliably than a predicted one.

`DOWNSTREAMS.md` remains the revision-pair verification ledger. It should record
the exact consumer revision, Formless revision, verification date, and type,
build, configuration-load, state, and smoke commands after a real consumer is
fully verified. Partial adoption must not advance its verified revision. The
ledger is not the design backlog.

### Candidate Minimum For The First Downstream Slice

This candidate is unadmitted until change metadata names the concrete Formless
or downstream screen and its evidence. It is the smallest currently visible
vertical slice: local typed record selection with query-backed options and
attached detail.

- one `recordRef(Entity)` value;
- one local request owned by the mounted view or screen occurrence;
- one query-backed option set with a text label and deterministic total order;
- first-option default after complete options;
- one selector control using the current list-detail presentation seam;
- one detail view bound to the effective selected record;
- exact controlled selection intents and stale-request reconciliation;
- an empty state that does not produce an effective value.

This slice is useful without typed dependent query parameters, URL ownership,
screen-level sharing, action bindings, tree integration, sidebar navigation, or
changes to existing collection-context declarations. A distinct pending state
is required only when an admitted option source can be incomplete; the current
complete replica snapshot does not by itself require a new pending Presentation
contract.

It should reuse the existing record option projection, record-result detail,
workspace identity, Presentation contract host, and Renderer components where
their contracts already fit. Explicit portable option ordering is additional
schema and projection work because current collection queries do not declare an
order. The new form and the overlapping part of current context behavior should
populate one record-selection shape inside the existing generated workspace
section plan. It must not create a second app runtime, section planner, fallback
path, intent validator, or renderer protocol.

The first change owns the exact public shape. A constrained collection-view
addition is the narrowest current parser and runtime seam. General composed-view
and sibling-layout declarations are separate capabilities and should be
admitted only by a workflow that needs them.

### Candidate Capability Map

Every row is unadmitted until a concrete change names its driver. This is a
dependency and convergence map, not a backlog or scheduled phase plan. Work may
be selected in another order when its dependencies already exist and a concrete
downstream requirement justifies it.

| Capability | Immediate user value | Required semantic seam | Does not require |
| --- | --- | --- | --- |
| Local record selection and detail | Select a record from a query-backed selector and edit its detail | Typed record value, local request, ordered options, select-one resolution, control and detail binding | URL state, scalar filters, tree, changes to current contexts |
| Additional selection controls | Present the same selection as tabs, a compact selector, a list, or another admitted control | One resolved selection-control contract with presentation-specific facts | New state ownership or consumer bindings |
| Scalar and fixed values | Select a status or supply a fixed value to a consumer | One admitted scalar type and fixed or select-one provider | General derived values or expression evaluation |
| Typed query and view bindings | Filter Project options by status and query related Items from selected Project | Declared inputs, direct typed bindings, unresolved behavior | Operation binding, URL ownership, general expressions |
| Screen-owned values and sibling sharing | One selection drives several sibling views | Common-ancestor ownership and child inputs | Child output ports or global state |
| Operation input bindings | Invoke an operation against the selected record without hidden context | Direct bound inputs, current-environment dispatch, unavailable controls | Action-result providers or workflows |
| Query-string selection | Preserve a filter or selection in a shareable URL | Query-parameter adapter, codec, history and invalid-request policy | Path-pattern routing |
| Path-owned selection | Deep-link to a selected record | Parameterized route patterns, path adapter, canonical destinations, SSR and hydration behavior | Local/URL mirrored state |
| Dependent option sets | Status selection narrows Project options, which rebases Project selection | Bounded provider ordering and cycle rejection | General dataflow or runtime-discovered edges |
| Bound tree roots | Use selected Project as the root for an inline Group and Item editor | Typed tree input and flat relationship projection | Changes to current tree-selection syntax |
| Multiple controls for one selection | Present one value in shell and workspace without duplicate resolution | One selection occurrence projected into multiple controls | Renderer-side selection state |

Each capability should be split further when one row would require unrelated
schema, runtime, and product decisions for the selected downstream scenario.

## Relationship To Current Primitives

Current collection contexts, singleton scopes, query tabs, list-detail views,
and tree selection retain their present roles while composable declarations
develop.

Current and composable declarations are distinct current capabilities, not two
versions of one contract and not representations that require translation.

- Do not block a composable capability on expressing every current context
  feature.
- Do not add aliases or transitional fields inside a composable declaration.
- Do not require current screens to adopt the new declaration as evidence that
  it works.
- Do not create permanent duplicate runtime semantics when a small shared
  resolver can safely serve both paths.
- Do not force shared normalization when current behavior carries additional
  semantics that the new admitted capability does not yet represent.
- No translation program is promised. If a later current-state change
  supersedes a primitive, update or delete its code, tests, and canonical spec
  facts in that dedicated change.

Query tabs may remain a dedicated query-choice primitive. Singleton scope may
remain specialized until a downstream view needs the singleton as a reusable
typed value. Existing tree item selection need not become a generic selection
until another consumer needs its effective value.

Convergence means shared semantics and boundaries where concepts are truly the
same. It does not require syntax translation.

## Package Responsibilities

### Schema

`lib/schema` owns public declarations, value and input types, parsing, lexical
resolution, binding validation, option ordering requirements, and any bounded
dependency validation.

Schema validation must remain complete without running queries or application
code.

### Formless Client And Generated Runtime

`lib/formless/src/client` owns schema selection and pure plan evaluation over
browser replica snapshots.

`lib/formless/src/app` owns occurrence-scoped local state, route adapters,
evaluation orchestration, repair and navigation effects, contract projection,
and exact intent validation.

These packages extend the current generated workspace foundation and host. They
do not expose a global environment store to schema authors or renderers.

### Presentation

`lib/presentation` owns resolved, controlled, renderer-neutral contracts and
semantic intents. Contracts may grow a generic selection-control shape only
when two real presentation forms share it.

### Renderer

`lib/renderer` maps resolved contracts into Astryx components and forwards
intents. It does not own schema semantics, data access, selection resolution,
navigation policy, or effects.

### Operations And Authority

The operation runtime maps bound effective values into ordinary invocation
input. Authority continues to own authorization, current-record validation,
invariants, writes, and audit behavior.

### Canonical Specs And Change Metadata

This document owns long-term direction. Shipped facts belong in
`openspec/specs/app-schema/spec.md` and
`openspec/specs/generated-ui/spec.md`, with operation facts in the relevant
operation capability specs.

Concrete proposal, design, tasks, evidence, blockers, affected files, and
downstream verification belong in the Git-backed change metadata for the
admitted increment.

## Test Boundaries

### Schema Tests

Prove public declarations parse and materialize, value and binding types match,
names resolve lexically, option ordering is valid, invalid combinations are
rejected, and any admitted provider dependency is acyclic.

### Client And Foundation Tests

Prove requested and effective state remain distinct, complete options resolve
deterministically, stale and empty states follow the admitted policy, dependent
consumers see one environment generation, and repeated view occurrences remain
isolated.

### Runtime Tests

Prove exact intent resolution, stale-intent rejection, local or URL state
effects, browser history behavior when admitted, repair timing, and clearing or
rekeying record-specific draft and pending state when effective identity
changes.

### Presentation Tests

Prove contracts contain stable controlled state and semantic intents without
schema, query, request-owner, raw-record, or effect-planning facts.

### Renderer Tests

Use production renderers and real Astryx leaves. Prove each admitted
presentation forwards exact intents and renders every state admitted by that
contract without selecting fallback locally.

### Authority And Integration Tests

Prove a forged selected identity does not bypass read or operation policy. At
the narrowest stable integration boundary, prove one effective selection drives
all consumers admitted by the change.

When a downstream Program drives the change, verify its concrete screen or
workflow against the exact Formless revision and record that evidence through
the existing downstream procedure.

## Rejected Generalization

Do not build:

- a universal resource graph shared by reads, state, selections,
  presentations, surfaces, and operations;
- an app-wide `observe<Value>` host or per-value subscriptions;
- generic provider inputs, outputs, demands, policy, lifecycle, revisions, and
  dirty-closure scheduling;
- ambient context bags, arbitrary JSON values, or full record envelopes;
- arbitrary transforms, callbacks, computed expressions, or dynamic
  dependencies;
- layout-owned data access;
- URL and local state as two synchronized writable owners;
- implicit child exports, upward lookup, or cross-screen slots;
- action-output wiring as a reactive provider mechanism;
- selection state as evidence of record existence or authorization;
- a big-bang rewrite of current generated UI.

If every new provider needs generic inputs, outputs, dependencies, lifecycle,
policy, and observation, the bounded view model has become a general dataflow
framework and should be stopped.

## Decisions

- Use separable typed values, providers, request owners, option sets, bindings,
  and controls as the convergence model.
- Use `selection` only for choosing one effective value from options.
- Use `parameter` or `input` for consumer requirements and `binding` for the
  mapping from an effective value.
- Use lexical screen and view occurrence ownership rather than a global store.
- Carry typed record identity rather than full records.
- Keep provider and request-owner kinds closed.
- Keep environment a runtime snapshot rather than public schema API.
- Keep renderers controlled and schema-blind.
- Keep reads and operations responsible for authorization.
- Keep contract versioning out of composable view declarations and runtime
  contracts.
- Select implementation work from immediate downstream requirements while
  preserving the convergence constraints here.
- Keep concrete task sequencing and file-level plans in Git-backed change
  metadata.
- Keep current view primitives in their present roles unless a dedicated
  current-state change supersedes one.

## Deferred Product Decisions

- Exact public source syntax and whether the first declaration extends a
  collection view or introduces a composed-view kind.
- Initial value types beyond `recordRef(Entity)`.
- Local absent and invalid defaults beyond the first demonstrated scenario.
- URL invalid, empty, and canonical-repair behavior.
- Query-string encoding and path-parameter codecs.
- Local state lifetime after navigating away from and back to a screen.
- The first screen-level sibling-sharing scenario.
- Whether and how a control below an owner addresses an ancestor selection.
- The first direct operation-input binding and any post-create selection
  effect.
- Whether query tabs should ever expose their selected query identity as a
  value.
- Which current context, singleton, list-detail, or tree declaration first
  benefits from convergence.

These decisions should be resolved by the first concrete downstream scenario
that requires them, then recorded as shipped facts in canonical specs.
