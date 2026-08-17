# Generated UI Specification

## Purpose

Generated UI renders React app surfaces selected from app schema models and
runtime profiles. It turns screens, views, fields, read models, operation
bindings, and Program storage identity into browser behavior for records without
requiring custom app code.

## Requirements

### Requirement: Runtime Profile Routing

The system SHALL select generated surfaces from the active runtime profile and route policy.

#### Scenario: Instance Program routes

- **GIVEN** the instance profile
- **WHEN** the user visits an active Program route such as `/tasks` or `/site`
- **THEN** the matching Program administration surface mounts
- **AND** `/tasks` does not mount a schema-key surface
- **AND** public Site surfaces remain selected by mapped public Site routing

#### Scenario: Published public Site avoids generated admin entrypoint

- **GIVEN** the runtime renders a published Site page or mapped public Site host
  for anonymous visitors
- **WHEN** browser assets are selected for that public route
- **THEN** the selected assets do not require the generated admin `HomeRoute`,
  instance shell, app settings shell, owner setup or login routes, workspace
  gateway controls, or generated field editor modules to load
- **AND** Program and instance management routes continue to mount through their
  own generated UI entrypoint when an admin or owner visits those routes
- **AND** public Site browser behavior is limited to the package public route
  component, configured public renderer, read-only markdown display, and public
  form behavior needed by the rendered tree

### Requirement: Unified Application Shell And Settings

The system SHALL project eligible application and instance chrome through one
renderer-neutral shell model and SHALL expose app-local controls through that
shell.

#### Scenario: Profile and route select shell scope

- **GIVEN** React routing selects a generated admin, management, auth, or public
  surface
- **WHEN** the runtime selects application chrome
- **THEN** the product instance profile uses the Program shell for instance
  settings, instance access, and Program screens
- **AND** Site authoring admin uses the same Program shell
- **AND** unknown product instance routes, owner setup and login routes,
  invitation routes, local session routes, mapped public Site hosts, published
  Site profiles, and Program public Site routes do not render the shell
- **AND** shell selection does not change route matching, access policy, or the
  selected route workspace

#### Scenario: Instance management shell

- **GIVEN** the product instance shell renders
- **WHEN** Program screens and custom domains are available
- **THEN** Tasks, Site, Instance, and downstream Program navigation groups
  appear as top-level workspace destinations
- **AND** only screens in the selected group appear in its screen navigation
- **AND** custom domain management shows desired route state and provider applied
  evidence separately
- **AND** deployment records, provider state, and workspace sync do not become
  standalone destinations
- **AND** deployed instance profiles or profiles without an available local
  workspace gateway proxy do not show workspace operation controls
- **AND** Cloudflare API tokens and Alchemy secret values are not exposed to the
  browser

#### Scenario: Unified shell navigation

- **GIVEN** an eligible Program shell is selected
- **WHEN** runtime profile, route, Program schema, sync, and session
  facts are available
- **THEN** runtime projects one shell manifest with stable identity, title,
  active destination, and ordered navigation-section references
- **AND** navigation presents product-supplied and workspace-owned Program
  screens from the complete materialized Program artifact through the same
  destination contract
- **AND** grouped navigation projects a top-level workspace switcher and the
  selected group's generated Program screens while flat navigation retains one
  Program screen section
- **AND** shell sections can contain the workspace switcher, generated Program
  screens, root record navigation, footer status, and display-safe session
  controls
- **AND** public Site routes are excluded from the top-level switcher and are
  exposed from Site admin workspaces as prominent links that open a new tab
- **AND** destination hrefs derive from active Program route data and selected
  state derives from the current path
- **AND** the selected route workspace remains a React child of the shell
  renderer rather than contract data
- **AND** the shell contract does not expose runtime profiles, route policy,
  schemas, queries, raw records, browser replica APIs, React nodes,
  presentation class names, or renderer-specific component props

#### Scenario: Preserve Program runtime across client navigation

- **GIVEN** an eligible Program shell has resolved its Program session and
  initialized its browser replica
- **WHEN** an ordinary same-origin anchor activation, browser back or forward
  action, or runtime navigation intent selects another authorized Program screen
- **THEN** client routing changes only the selected route workspace
- **AND** the Program session, shell, hydrated replica, broadcast subscription,
  bootstrap state, and invalidation connection retain their mounted lifetime
- **AND** the transition sends no document, session-status, route-authorization,
  bootstrap, HTTP sync, or IndexedDB hydration request and opens no replacement
  invalidation socket
- **AND** loading or forbidden presentation replaces the selected workspace
  outlet without tearing down the persistent Program runtime or shell
- **AND** semantic anchor hrefs, modified activation, explicit targets, downloads,
  same-page fragments, browser history, and new-tab behavior retain native
  browser semantics
- **AND** leaving the Program shell scope may end the persistent runtime lifetime

#### Scenario: Select grouped Program navigation

- **GIVEN** the active Program schema declares ordered `navigation.groups`
- **WHEN** an authorized Program screen route is selected
- **THEN** runtime resolves the active group from the selected stable screen key
  rather than a route prefix, module key, or entity declaration
- **AND** the shell title is the active group's label and its screen section
  contains only authorized screens from that group in declared order
- **AND** the workspace switcher contains each group with at least one
  authorized screen in declared order
- **AND** each workspace destination links to that group's first authorized
  screen and is selected exactly when the current screen belongs to the group
- **AND** a directly opened screen omitted from every group retains the Program
  shell and workspace switcher, uses the Program title, and does not select a
  group or synthesize group membership
- **AND** the selected screen destination remains the shell's active
  destination rather than the containing workspace destination

#### Scenario: Keep navigation grouping presentation-only

- **GIVEN** a grouped Program shell is selected
- **WHEN** runtime admits routes, authorizes screens or operations, reads or
  writes records, syncs the replica, or resolves public Site behavior
- **THEN** those behaviors continue to use the one complete Program and the
  selected screen's existing path and access requirement
- **AND** group keys and workspace destinations do not become route mounts,
  access grants, API identities, storage identities, replica identities, or
  runtime adapter selectors

#### Scenario: Root record navigation

- **GIVEN** an app exposes root-record navigation and a root-record create
  operation
- **WHEN** generated runtime projects the application shell
- **THEN** runtime resolves ordered root options, selected record, formatted
  counts, availability, and one complete controlled create-surface contract
- **AND** selection and create interactions dispatch canonical shell intent
  envelopes with stable section, destination, record, and create-surface
  identity
- **AND** generated runtime retains query evaluation, record reads, route or
  selection state, create drafts, validation, operation execution, sync
  feedback, and post-create selection
- **AND** renderer-local responsive and collapsed presentation state does not
  become canonical runtime state

#### Scenario: Shell status and session state

- **GIVEN** shell-eligible sync, workspace-save, or owner session state is
  available
- **WHEN** runtime projects shell controls
- **THEN** browser runtime maps semantic sync status and workspace-save status
  where supported to explicit presentation facts, and validated authenticated
  identity plus logout availability are explicit presentation facts
- **AND** shell status remains separate from schema-declared Program Settings
  destinations and does not synthesize a settings navigation item
- **AND** logout interactions dispatch canonical shell intents while runtime
  owns session, navigation, and error effects
- **AND** the shell does not expose session tokens, challenge material, provider
  credentials, raw runtime errors, profile or account settings destinations,
  or a synthesized sign-in destination
- **AND** any theme control is supplied only through the separate
  document-theme contract rather than inferred from shell status or session
  state

#### Scenario: Local workspace save status

- **GIVEN** the product instance shell renders in a local workspace profile with
  workspace gateway auto-save available
- **WHEN** workspace source is clean, dirty, queued, saving, saved, or failed
- **THEN** the shell shows display-safe workspace save state without manual
  browser save or retry controls
- **AND** CLI save remains the fallback for explicit flush or retry behavior
- **AND** raw filesystem paths, provider credentials, admin tokens, and secret
  state are not exposed

#### Scenario: App-local settings

- **GIVEN** app settings are opened for the active app
- **WHEN** settings render
- **THEN** sync status remains available through the shell footer where
  supported
- **AND** schema-declared app screen navigation remains available through the
  shell
- **AND** frontend Schema links and schema editor controls are not shown
- **AND** portable archive backup, restore, or import controls are not shown

#### Scenario: Instance management provider controls

- **GIVEN** the product instance shell renders domain, route, deployment,
  provider observation, or provider evidence state
- **WHEN** the user reviews provider resources
- **THEN** supported explicit provider delete, manual cleanup, or evidence repair
  controls may remain available for selected recorded evidence
- **AND** provider change guidance points to workspace push

### Requirement: Consistent Application Surface Layouts

The system SHALL render generated and native admin surfaces through one
responsive surface-layout policy with constrained and full workspace extents.

#### Scenario: Project generated workspace width

- GIVEN a generated workspace screen selects `narrow`, `standard`, or `wide`
  layout width
- WHEN generated runtime projects the workspace Presentation contract
- THEN the contract carries the selected semantic width
- AND omitted schema width reaches the contract as `standard`
- AND the contract does not expose pixel dimensions, responsive breakpoints,
  presentation class names, CSS values, or renderer-specific component props

#### Scenario: Project generated workspace surface extent

- GIVEN a generated workspace screen selects constrained or full surface
  extent
- WHEN generated runtime projects the workspace Presentation contract
- THEN the contract carries the selected semantic extent
- AND omitted schema extent reaches the contract as `constrained`
- AND a full workspace carries no semantic width
- AND the contract does not expose viewport dimensions, pane proportions,
  scrolling implementation, presentation class names, CSS values, or
  renderer-specific component props

#### Scenario: Apply one top-level application surface frame

- GIVEN application assembly renders a generated workspace, instance Access,
  instance Management, or application system-state surface
- WHEN Formless Renderer selects page geometry
- THEN one renderer-owned surface frame applies responsive inline and block
  gutters, centering, and the width cap for that surface
- AND generated workspaces use their projected semantic width
- AND Access and Management use the standard width
- AND application system states use the narrow width
- AND auth and public Site surfaces retain their separate presentation frames
- AND a workspace embedded inside Management does not receive a second surface
  frame

#### Scenario: Apply a full workspace surface frame

- GIVEN application assembly renders a generated workspace with full surface
  extent
- WHEN Formless Renderer selects page geometry
- THEN the application surface frame fills the application shell's available
  inline and block extent
- AND it does not apply the constrained frame's centering, maximum content
  width, or outer content gutters
- AND shell navigation and viewport ownership remain unchanged
- AND nested workspace and result renderers do not add a second page frame

#### Scenario: Keep shell, surface, and result layout ownership distinct

- GIVEN a shell-eligible admin route renders through the application surface
  frame
- WHEN shell, surface, section, and result layout compose
- THEN the application shell owns navigation, viewport behavior, and scrolling
  without adding an independent route-content gutter
- AND the application surface frame is the only owner of page gutters and
  maximum content width
- AND workspace, Access, Management, and system-state renderers do not duplicate
  outer page-frame policy
- AND table, list, record, and tree renderers retain their own internal layout,
  density, wrapping, and overflow behavior without selecting page width
- AND table horizontal scrolling and package section edge behavior do not cancel
  the selected surface gutters

#### Scenario: Responsive surface widths

- GIVEN a narrow, standard, or wide admin surface
- WHEN available viewport width becomes smaller than its preferred content width
- THEN the surface shrinks to the available width while preserving responsive
  gutters
- AND wide data tables scroll horizontally inside the framed content when their
  minimum column width exceeds the available width
- AND desktop width differences do not become separate mobile layout modes

### Requirement: Screen Workspaces

The system SHALL render generated screens from screen models and collection sections.

#### Scenario: Multi-section workspace

- GIVEN a workspace screen with multiple collection sections
- WHEN the screen is opened
- THEN sections render in schema order
- AND query and context state is keyed by screen and section
- AND the screen body does not repeat the active screen heading

#### Scenario: Query-bound screen section

- GIVEN a workspace screen collection section binds one declared view query
- WHEN the screen is opened
- THEN the section selects that query from the route-owned screen model
- AND it renders only the bound query without collection query tabs or a
  navigation-supplied query selection side effect
- AND revisiting or directly opening the screen path reconstructs the same
  query result without retained browser selection state

#### Scenario: Select one collection record for composed detail

- GIVEN a workspace collection section declares selected-record detail
- WHEN the screen is opened or the user selects an item from that collection's
  list result
- THEN runtime owns nullable selected-record identity keyed by screen and
  section separately from shell navigation, query, and collection-context state
- AND missing initial selection and stale selection fall back to the first
  record in the current non-empty collection result
- AND explicit cleared selection remains nullable so compact Back navigation
  returns to the list
- AND selection is retained while the selected record remains in the current
  collection result and is cleared when that result becomes empty
- AND the renderer receives semantic select-record and clear-selection intents
  rather than owning selected-record state

#### Scenario: Generated app navigation

- GIVEN primary screen models are available
- WHEN generated app chrome renders
- THEN omitted `navigation.primaryScreens` lists all app screens in screen
  declaration order
- AND a declared `navigation.primaryScreens` array selects and orders the
  sidebar screen subset
- AND declared `navigation.groups` selects ordered workspace and nested screen
  navigation without also consulting `primaryScreens`
- AND either ordered screen list may interleave ordinary screen destinations
  with one-level labelled navigation sections containing screen destinations
- AND a navigation section renders its optional semantic icon and label without
  becoming a link or destination
- AND flat navigation uses the app label as the sidebar title while grouped
  navigation uses the selected group's label

#### Scenario: Program navigation query-count badge

- GIVEN an authorized Program navigation screen reference requests a query-
  count badge from a query-bound collection section
- WHEN generated runtime projects Program navigation from the current browser
  replica snapshot
- THEN it evaluates that section's bound query through the local query-count
  selector and projects the formatted count onto the screen destination
- AND zero renders as `0`, committed replica changes update the count through
  the existing shell subscription, and no count is stored as a Program record
- AND navigation does not pass, persist, or mutate screen query selection when
  the destination is opened
- AND the Presentation contract carries only display-safe count text rather
  than query identity, expression, context, raw records, or selector behavior

#### Scenario: Authorized Program navigation

- GIVEN the active Program schema declares flat or grouped ordered navigation
  screens with explicit access requirements
- WHEN generated runtime projects Program navigation for the current browser
  session
- THEN it evaluates each declared screen access requirement with the shared pure
  access evaluator, the active Program schema, and the current browser-safe
  principal caller facts
- AND it includes only destinations that satisfy both that screen requirement
  and the server-resolved runtime-route access floor
- AND flat screen order, group order, nested screen order, and destination paths
  remain owned by the materialized Program schema
- AND a navigation group with no authorized screen is omitted without exposing
  the labels or paths of its unavailable screens
- AND a navigation section with no authorized child screen is omitted without
  exposing its label or semantic icon
- AND omitted destinations remain unavailable through client-side navigation
  while direct navigation returns the same forbidden outcome
- AND local client route admission uses the same evaluation as navigation
  projection and fails closed while session facts are loading, blocked, expired,
  forbidden, or invalidated
- AND navigation filtering is a usability boundary rather than a record-secrecy
  boundary because every authenticated `member`, `editor`, `administrator`, or
  protected owner admitted to Program sync receives the complete reviewable
  Program replica
- AND screen keys, module keys, schema keys, paths, locally projected visibility,
  and cached client caller facts are not treated as server authorization grants

#### Scenario: Product screen route placement

- GIVEN the materialized Program declares stable `routes` and `access` screen
  keys
- WHEN generated runtime projects, selects, or renders those product-supplied
  screens
- THEN the default Program exposes them at `/settings/routes` and
  `/settings/access`
- AND Routes renders its schema-owned generated workspace while Access selects
  its runtime-owned purpose-built presentation without generated identity views
- AND a downstream Program replacement may expose either screen at another
  valid declared path without changing its presentation or management behavior
- AND navigation and selected state use the final materialized screen path
- AND product runtime contributions select the stable screen key rather than
  comparing the browser location to a built-in path
- AND the previous `/routes` and `/access` paths are not inferred, redirected,
  or reserved unless the active Program declares screens at those paths

#### Scenario: Runtime-owned Program screen

- GIVEN the materialized Program declares a runtime-owned screen with a stable
  key, path, label, and explicit access requirement
- WHEN generated runtime admits and selects that screen
- THEN shell navigation and selected state use its portable screen facts
- AND the registered stable-key runtime contribution renders the route child
  without projecting a generated workspace or requiring collection views
- AND an unavailable runtime contribution fails closed instead of rendering an
  empty or fabricated generated workspace

#### Scenario: Program Tasks workspace

- GIVEN the materialized Program declares the Tasks screen at `/tasks`
- WHEN a current Program member opens the screen
- THEN generated UI renders the package-owned Tasks views against the Program
  client target and complete Program replica
- AND Task operation controls remain present only when their schema-declared
  `editor` access requirement can be satisfied by the current caller
- AND operation requests use `/api/formless/program` and Program write
  compatibility facts

#### Scenario: Schema path app screen

- GIVEN an app schema declares a screen with path `/schema`
- WHEN the generated app is mounted at a route where `/schema` is reachable
- THEN generated UI renders the declared app screen
- AND no frontend schema editor route takes precedence over that screen path

#### Scenario: Protected screen route guard

- GIVEN a generated route selects a protected schema screen
- AND its effective admission combines profile eligibility, matched mount route
  access, and the selected screen's browser access requirement
- WHEN a browser without the required current authority navigates to that route
- THEN generated UI does not render the screen workspace
- AND an unauthenticated browser enters the runtime account continuation while
  an authenticated but insufficient browser receives a display-safe forbidden
  outcome without restarting sign-in
- AND app record sync, invalidation connection, or protected screen data loading does
  not start before the exact route access check resolves
- AND initial Worker entry, mapped-host entry, direct browser entry, and
  client-side navigation use the same current instance-auth route decision
- AND client-side routing does not infer admission from a previously synced
  role assignment or cached session claim

#### Scenario: Anonymous screen route

- GIVEN a generated app route and its selected screen both admit the anonymous
  browser actor
- WHEN an anonymous browser navigates to that route
- THEN generated UI can render the selected screen without an owner session
- AND operation and management controls still use their existing write and
  authorization contracts

### Requirement: Schema Declaration Order And Surface Overrides

The system SHALL use portable registry declaration order as the generated
presentation default and SHALL honor explicit surface arrays as membership and
order overrides.

#### Scenario: Select fields for a generated surface

- GIVEN an entity declares an ordered field registry
- WHEN generated UI builds a general field catalog without a surface-specific
  field array
- THEN fields appear in entity field declaration order
- AND when a create, edit, item, table, collection, or other surface declares
  its own field or column array, that array selects and orders the fields for
  that surface
- AND fields omitted by the surface array are not appended from the entity
  registry

#### Scenario: Select generated options and variants

- GIVEN an enum field or entity union has no surface-specific presentation
  order
- WHEN generated UI builds enum options or union discriminator choices
- THEN enum values and union variants appear in their registry declaration
  order
- AND an explicit surface array may select, omit, or reorder applicable
  definitions without changing the registry

#### Scenario: Select generated operation controls

- GIVEN entity operations or state-machine transitions are eligible for a
  generated surface
- WHEN the surface has no explicit applicable operation binding array
- THEN eligible controls use operation or transition declaration order
- AND an explicit operation binding array selects and orders the controls for
  that surface
- AND hidden, unauthorized, or state-inapplicable controls remain omitted even
  when declaration order supplies the default sequence

#### Scenario: Ignore object property order

- GIVEN generated UI receives a parsed App schema
- WHEN it selects fields, options, variants, operations, views, or screens
- THEN it uses registry arrays, surface arrays, and shared keyed indexes
- AND it does not derive membership or order from object property insertion
  order

### Requirement: Collection Rendering

The system SHALL render collection views with query tabs, context selection,
summary slots, operation controls, and schema-declared result types.

#### Scenario: Collection model selection

- GIVEN collection models are selected in `lib/formless/src/client/views.ts`
- WHEN `HomeViewModel.collection` builds a `HomeCollectionConfig`
- THEN the model selects entity, context, query tabs, default query, result,
  operation controls, and summaries before rendering
- AND it composes shell facts from `lib/formless/src/client/collection-shell-model.ts` with result facts from `lib/formless/src/client/collection-result-model.ts`
- AND shell selection owns query tabs, default query, context, summaries,
  operation controls, related collections, and create facts

#### Scenario: Result model ownership

- GIVEN collection result selection dispatches from `lib/formless/src/client/collection-result-model.ts`
- WHEN a `list`, `record`, `table`, or `tree` result model is selected
- THEN `lib/formless/src/client/list-result-model.ts` owns list and record result facts
- AND `lib/formless/src/client/table-model.ts` owns table result and footer facts
- AND `lib/formless/src/client/tree-result-model.ts` owns tree result facts
- AND `lib/formless/src/client/result-ordering-model.ts` owns shared result ordering facts

#### Scenario: Selected result renderer handoff

- GIVEN generated UI renders a collection result inside a screen workspace
- WHEN it selects a `list`, `record`, `table`, or `tree` result model
- THEN generated workspace foundations compose canonical list, record, table,
  or tree result contracts under the projected collection contract before the
  active workspace renderer renders them
- AND list and record foundations consume result facts from
  `lib/formless/src/client/list-result-model.ts`
- AND the table foundation consumes table result facts selected through
  `lib/formless/src/client/collection-result-model.ts`
- AND the tree foundation consumes tree result facts from
  `lib/formless/src/client/tree-result-model.ts` and projects flat placement and child
  records into a complete renderer-neutral tree result
- AND record- and tree-result fields, actions, warnings, empty state, and
  availability are not composed directly in the collection renderer
- AND generated ordering UI consumes result ordering facts from `lib/formless/src/client/result-ordering-model.ts`

#### Scenario: List-detail context

- GIVEN a collection context uses `listDetail` presentation
- WHEN a context record is selected
- THEN the selected context detail composes a canonical record-result contract
  with the related collection result
- AND related context counts derive from local records and cross the renderer
  boundary as display text

#### Scenario: Selected-record detail composition

- GIVEN a collection screen section declares selected-record detail
- WHEN one record from the collection list result is selected
- THEN the detail composes its ordered record and relationship sections for
  that selected record
- AND a record section projects its item view through the canonical
  record-result foundation and contract
- AND a relationship section evaluates its declared target query with the
  selected record id under the detail's declared context name and projects its
  table view through the canonical table foundation and contract
- AND a relationship-hierarchy section projects the selected record and every
  declared related record through canonical record-result foundations and a
  recursive renderer-neutral hierarchy contract
- AND hierarchy runtime selects active direct children exclusively from flat
  target records whose declared relationship reference equals the current
  parent record id, orders siblings by `createdAt` then record id, and retains
  schema declaration order for relationship groups
- AND a relationship heading operation uses the canonical record-scoped
  operation controller with the selected source record id
- AND a relationship heading create action composes the canonical target create
  surface with schema-declared defaults resolved from the selected source record
  and relationship query context
- AND opening that create surface changes only controlled dialog and draft state;
  one target record is created and attached through flat reference values only
  after a valid submit
- AND selected-record detail does not select a separate context entity or use
  collection `listDetail` fallback semantics

#### Scenario: Project the complete inline relationship hierarchy

- GIVEN a selected-record detail section declares a finite heterogeneous
  relationship hierarchy
- WHEN generated runtime projects the selected root and its active related
  records
- THEN the hierarchy contains one root record node whose ordered relationship
  groups recursively contain complete child record nodes selected through the
  declared to-many relationships
- AND every record node carries stable path-scoped occurrence identity, its
  entity type label, one canonical record-result editor contract, resolved
  record-link actions, enabled operation controls, ordered relationship groups,
  and display-safe runtime state
- AND every relationship group carries a display-safe accessibility label, one
  ordered heading-action group, and its ordered child record nodes
- AND every declared labelled relationship group remains present with its
  available heading actions when it has no active target records while its
  parent record node remains present
- AND a hierarchy with no child relationship declarations contains its root
  record node with zero relationship groups while preserving the root item
  view, record links, and enabled record-operation controls
- AND occurrence identity scopes fields, create surfaces, controls, drafts,
  confirmations, feedback, and intent routing without becoming stored record
  identity or user selection state
- AND runtime does not project hierarchy node selection, selection intents,
  selected-node fallback, disclosure state, expand or collapse intents,
  placement identity, placement fields, or post-create focus behavior

#### Scenario: Author every hierarchy record inline

- GIVEN generated runtime projects a complete relationship hierarchy
- WHEN the active renderer renders its root and child nodes
- THEN every node uses the same recursive structure of a record-type header,
  right-aligned available actions, ordinary record editor, and ordered child
  relationship groups
- AND record editors preserve canonical editable and display fields, drafts,
  commits, specialized fields, readiness, updates, lifecycle controls, pending
  state, feedback, and display-safe errors
- AND the complete finite hierarchy renders without an outline-detail split,
  selected-node editor, disclosure control, hierarchy toolbar, or application-
  specific renderer
- AND a root-only hierarchy renders the root record and its available header
  actions without a relationship heading, placeholder row, or relationship
  empty-state section

#### Scenario: Render responsive hierarchy record-header actions

- GIVEN a hierarchy record node declares record links or record operations
- WHEN generated runtime resolves action availability for the current record
- THEN the node header exposes one ordered single-line action list containing
  link actions in link declaration order followed by enabled operation actions
  in operation declaration order
- AND actions that fit render as labelled controls while trailing actions that
  do not fit collapse in stable order into one icon-only More menu with a
  display-safe accessible label and no visible overflow count
- AND wide headers expose every fitting action, narrow headers may collapse
  every action behind the More menu, and the action list does not force the
  record card wider than its available inline space
- AND fitting operation controls preserve projected prominence including
  destructive presentation while overflow items preserve invocation,
  confirmation, pending, and disabled behavior supported by the More-menu
  primitive
- AND an unavailable link remains present and disabled with its display-safe
  reason and no href while unavailable operations retain their canonical
  filtering behavior
- AND the action list is omitted only when no link or operation item remains
- AND a semantically enabled operation that is currently executing remains in
  the action list or overflow menu with canonical pending and disabled
  interaction state
- AND invocation reuses canonical operation controls, authorization,
  confirmation, idempotency, progress, feedback, and error behavior
- AND following a link does not invoke those controls or dispatch a hierarchy,
  workspace, presentation, or operation intent
- AND the renderer does not discover entity operations, evaluate availability,
  construct operation input, attach child records, or execute writes

#### Scenario: Render relationship-group heading actions

- GIVEN a hierarchy relationship group declares ordered create or source-record
  operation heading actions
- WHEN generated runtime resolves those actions for the current parent record
  occurrence
- THEN the relationship-group contract carries one ordered heading-action group
  whose create actions target that relationship and whose operation controls
  target the immediate parent record occurrence
- AND a group action is exclusive to that heading and is not duplicated in the
  parent record header
- AND labelled controls are the default while explicitly icon-only controls use
  their projected semantic icon, accessible action name, and understandable
  tooltip
- AND fitting operation controls preserve projected prominence including
  destructive presentation while their overflow items retain canonical
  confirmation and execution behavior
- AND multiple actions retain declaration order and use the same responsive
  trailing-overflow behavior as record-header actions
- AND a labelled empty group retains its heading and available actions, an
  action-free empty unlabelled group may remain omitted, and unavailable actions
  retain their canonical filtering behavior
- AND deeply nested group operations use the exact immediate parent occurrence
  rather than a root, ancestor, sibling, child, entity-first, or operation-name
  target
- AND create dialogs, destructive confirmation, pending state, progress,
  feedback, disabled reasons, and display-safe errors remain associated with the
  control at its one projected placement

#### Scenario: Create a flat related child from a hierarchy node

- GIVEN an immediate child relationship heading exposes an enabled canonical
  create action for its target entity
- WHEN the user opens and submits its ordinary create dialog
- THEN opening changes only controlled dialog and draft state and creates no
  placeholder record
- AND runtime resolves the current parent occurrence against the latest
  hierarchy, supplies its record id under the context name derived from the
  attachment default, and submits once through the target create operation
- AND the submitted flat record puts that parent id in the relationship's
  declared target reference field
- AND successful committed data refreshes the flat-record projection, closes
  and resets the dialog, and causes the active child record to appear in its
  declared relationship group according to `createdAt` and record-id order
- AND failure retains ordinary create feedback without inserting, selecting,
  expanding, scrolling to, focusing, or otherwise inferring a hierarchy node
- AND runtime does not infer insertion from created record ids, entity type,
  operation name, record diffs, or rendered position

#### Scenario: Summary item view projection

- GIVEN a list result references an item view with summary presentation
- WHEN generated runtime projects the list result
- THEN each list item carries display-safe title text and optional subtitle text
  selected from the declared summary slot fields
- AND it does not project the item view as record fields, field editors,
  readiness status, badges, or record operation controls
- AND missing optional source values produce omitted display text rather than
  raw values or renderer-selected fallback fields
- AND runtime retains record reads, field formatting, and schema selection
  outside the renderer

#### Scenario: Ordered list result

- GIVEN a list result declares ordering
- WHEN the user selects an available list-item move action
- THEN generated UI patches the declared rank field
- AND field editors, delete controls, readiness warnings, visible union fields, and ordering behavior remain available in the list
- AND list ordering does not require a drag-handle gesture when equivalent
  projected move actions preserve the declared ordering capability

### Requirement: Generated Workspace Renderer Contract

The system SHALL project complete generated screens whose collection sections
use list, table, record, or tree results through a controlled renderer-neutral
Presentation workspace contract while generated runtime code owns model
selection, reads, evaluation, operation execution, and effects.

#### Scenario: Select complete workspace composition

- GIVEN generated UI selects a workspace screen
- WHEN its collection sections use list, table, record, or tree results
- THEN the complete screen and all ordered sections are eligible for the
  renderer-neutral workspace boundary
- AND each section composes one complete canonical main result plus any
  explicitly declared selected-record or context detail results before the
  active renderer is selected
- AND generated UI does not split one screen between contract and direct
  runtime renderers or add an opaque slot, React-node escape hatch,
  placeholder, or compatibility wrapper to the workspace contract

#### Scenario: Project complete screen and collection presentation

- GIVEN a generated workspace screen is selected
- WHEN generated runtime prepares it for the Formless Renderer
- THEN the workspace contract carries stable screen identity, an accessible
  label, ordered section identity and labels, section actions, and one complete
  collection contract per section, plus ordered renderer-neutral workspace link
  actions when the owning route exposes a related native destination
- AND each collection carries stable identity, an accessible label, selected
  query identity, optional query navigation, optional context presentation,
  summaries, collection actions, explicit empty or unavailable presentation,
  one canonical main list, table, record-result, or tree-result contract, and
  any explicitly declared selected-record detail composition
- AND nested create surfaces, operation controls, fields, lists, tables, and
  record and tree results retain their canonical contract shapes and receive
  screen-and-section-scoped identities when composed into a workspace
- AND single-section and multi-section screens preserve schema order without
  repeating the active screen heading in the screen body
- AND the workspace contract does not expose `HomeScreenModel`,
  `HomeCollectionConfig`, query expressions, query contexts, raw records,
  aggregate or computed-value definitions, operation bindings, browser replica
  hooks, app targets, sync setters, presentation class names, React nodes,
  runtime callbacks, or renderer-specific component props

#### Scenario: Project query context and summary facts

- GIVEN an eligible collection has query tabs, context selection, related
  counts, summaries, or list-detail presentation
- WHEN generated runtime prepares collection presentation
- THEN visible query navigation carries ordered tab identity, labels, selected
  state, optional formatted count text, availability, and semantic selection
  intents
- AND context presentation explicitly selects local tabs, a local list-detail
  selector, singleton detail, or externally-owned navigation without requiring
  the renderer to inspect schema or option counts
- AND locally rendered context options carry stable identity, labels, selected
  state, optional related-count text, availability, and semantic selection
  intents
- AND an invalid or absent selected context falls back to the first available
  context option in runtime before projection, while no available options
  produce an explicit empty context state rather than an unreachable unselected
  state
- AND selected context detail uses a canonical record-result contract with
  explicit compact or default density, label presentation, fields, actions,
  warnings, and availability
- AND list-detail composition carries the selector, selected detail, query
  navigation, summaries, related result, and collection actions as ordered
  presentation data
- AND summary slots carry stable identity, labels, formatted display values,
  optional suffixes, and availability without exposing raw aggregate or
  computed-value inputs

#### Scenario: Project selected-record workspace presentation

- GIVEN a collection section declares selected-record detail and its main list
  result is available
- WHEN generated runtime prepares workspace presentation
- THEN the collection contract carries an explicit selected-record composition
  with nullable selected record identity, list or detail presentation state,
  ordered record and relationship section references, and semantic selection
  and back intents
- AND record sections reference canonical record-result contracts while
  relationship sections reference canonical table contracts and may carry one
  optional canonical `headingCreate` surface plus ordered canonical
  `headingOperations`
- AND relationship-hierarchy sections reference complete recursive hierarchy
  contracts whose nodes compose canonical record-result, create-surface, and
  operation-control contracts
- AND a summary main list carries only each record's title and optional
  subtitle plus one controlled semantic selection state and intent
- AND the contract declares compact presentation as `drillIn`, so compact
  rendering shows the list for explicit cleared selection, selection enters
  detail, and back clears the selection
- AND desktop column proportions, compact breakpoints, scrolling, and visual
  hierarchy remain renderer-owned
- AND selected-record contracts do not expose query contexts, relationships,
  raw records, operation authorization rules, or renderer-specific layout props

#### Scenario: Project workspace actions and nested intents

- GIVEN a workspace exposes section actions, context create controls,
  collection create or command controls, selections, nested result
  interactions, or a related native destination
- WHEN generated runtime prepares controlled interaction data
- THEN external section actions compose canonical action-trigger contracts,
  create controls compose canonical create-surface contracts, and commands
  compose canonical operation-control contracts
- AND workspace link actions carry stable identity, accessible and visible
  labels, native href, prominence, and same-tab or new-tab target without an
  intent callback
- AND a Site admin workspace receives a prominent `View site` link from active
  public route facts, while workspaces without a public route receive no link
- AND workspace intent envelopes carry stable screen, section, collection,
  context, result, field, surface, and control identity as applicable while
  preserving canonical nested field, create, operation, list, table,
  record-result, and tree-result intents
- AND a workspace field envelope carries the exact projected field occurrence
  id rather than deriving identity from its schema field name, operation input
  name, record id, or another containing contract id
- AND generated runtime selects the current typed surface or result field index
  by that occurrence id and verifies its field or input name, record identity,
  and owning surface, result, or context identity before applying the nested
  intent
- AND generated runtime resolves selected route state, automatic context
  fallback, query contexts, result dispatch, record-keyed field state,
  operation controllers, writes, uploads, sync feedback, and local auto-save
  outside the renderer
- AND changing selected context does not project draft, error, pending, icon
  dialog, or confirmation state from the previously selected record
- AND changing or clearing selected-record identity does not project draft,
  error, pending, icon dialog, or confirmation state from the previous record
- AND runtime verifies selected-record, detail-section, relationship-result,
  relationship-hierarchy occurrence, relationship group, heading-operation,
  heading-create-surface, result, record, field, table, and operation-control
  identity against the latest screen projection before applying a nested intent
- AND table display cells carry no draft, commit, transition, picker, upload,
  media, reference-option, or other field-authoring intent route
- AND nested result and control ids remain unique when one screen repeats the
  same view, item view, entity, or query in multiple sections
- AND renderers do not evaluate queries or aggregates, select context fallback,
  own operation state, upload media, patch records, execute operations, or
  update route state locally

#### Scenario: Workspace presentation stays behind the renderer contract

- GIVEN generated screens compose headings, section controls, tabs, badges,
  context selectors, summaries, list-detail layout, collection actions, and
  result dispatch
- WHEN generated runtime projects a generated workspace
- THEN the selected screen and collection adapters render only the
  canonical workspace and nested contracts and dispatch canonical intents
- AND production single-section and multi-section list-, table-, record-, and
  tree-backed screens, ordinary and list-detail contexts, counts, summaries,
  context detail, create controls, command controls, empty states, and
  unavailable states cross that adapter boundary
- AND callers that provide a non-schema section action supply canonical action
  facts and an intent handler instead of a React node; the owning shell retains
  its dialog state and effect execution
- AND the presentation adapters do not select models, read records, evaluate
  queries, counts, aggregates, or computed values, own route or authoring
  state, build operation input, execute operations, or update sync state
- AND generated runtime uses documented
  `@dpeek/formless-presentation` contract and host exports without
  owning presentation implementation
- AND production renders the contract through the Formless Renderer application
  assembly

#### Scenario: Formless workspace renderer

- GIVEN runtime publishes complete production workspace contracts
- WHEN the selected renderer implements those contracts in `lib/renderer`
- THEN it composes package section, stack, grid, card, navigation, tabs or
  selector, badge, status, empty-state, action, create, operation, list, table,
  field, and record-result primitives without importing generated runtime
- AND selected query and context state remains controlled by the contract while
  the renderer emits canonical intents without changing runtime state locally
- AND ordinary context and list-detail layouts follow the renderer's hierarchy
  and action placement
- AND selected-record layouts render the list and composed detail side by side
  at wide widths and as list-to-detail drill-in with a back control at compact
  widths
- AND a full selected-record layout fills the available workspace height, uses
  a renderer-owned fixed selector width with the detail taking remaining inline
  space, and lets the selector and detail panes scroll independently
- AND summary selector rows render only title and optional subtitle, make the
  row the selection target, and do not add a separate view action or status
  presentation
- AND the workspace renderer does not read storage, evaluate queries or
  aggregates, execute operations, use media clients, run sync effects, or import
  runtime data
- AND the renderer is exported through documented
  `@dpeek/formless-renderer` package subpaths and receives theme and CSS only
  from root application assembly

#### Scenario: Workspace contract fixtures

- GIVEN runtime publishes complete production workspace contracts
- WHEN workspace UX is evaluated with package-local renderer fixtures
- THEN data-only fixtures use the same contract shapes for an unscoped
  collection, query navigation, ordinary context, list-detail context,
  selected-record detail with unselected and selected states,
  singleton and empty context, summaries, workspace link actions, section and
  collection actions,
  single- and multi-section screens, unavailable collections, and list, table,
  record, and tree results
- AND a focused Generated Workspace layout renders the subscribed screen and
  collection renderers with minimal local selection, field, create, operation,
  and confirmation intent simulation
- AND package-local fixtures do not import generated runtime, storage, browser
  replica, query or aggregate evaluators, media clients, operation controllers,
  sync, app targets, or shell behavior

### Requirement: Generated Tree Builder Renderer Contract

The system SHALL project complete generated trees as recursive inline record
nodes through a controlled renderer-neutral Presentation contract while
generated runtime owns flat record reads, tree-model selection, traversal,
authoring state, operation execution, ordering plans, navigation, and effects.

#### Scenario: Project flat records into a complete tree result

- GIVEN a generated collection selects a tree result for one root record
- WHEN generated runtime prepares the result for the active workspace renderer
- THEN it projects stable tree identity, accessibility, editing availability,
  explicit ready, empty, or unavailable state, one root record node,
  recursively ordered child nodes, display-safe feedback, and nested intent
  routing
- AND every available record node carries stable path-scoped occurrence
  identity, its entity type label, one canonical record-result editor, one
  ordered header action group, structural and readiness facts, and its child
  nodes
- AND child occurrence identity scopes editor fields, create surfaces,
  operation controls, confirmations, feedback, and stale-intent checks while
  runtime privately retains the corresponding placement edge and child record
  identities
- AND the nested hierarchy is a presentation projection over flat placement and
  child records rather than stored nesting or denormalized child arrays
- AND the contract does not expose tree result models, relationships, schemas,
  records, record maps, query contexts, operation bindings or controllers,
  ordering scope keys or rank plans, recursion bookkeeping, storage hooks, sync
  functions, React nodes, presentation class names, or renderer props
- AND it projects no node selection, selected-node editor, selection fallback,
  disclosure state, expand or collapse intent, presentation mode, placement
  field editor, or post-create focus state

#### Scenario: Preserve an explicit collection empty-state action

- GIVEN a workspace collection selects an empty list, table, record, or tree
  result and binds one collection operation at `emptyStatePrimary`
- WHEN generated runtime projects the collection and workspace states
- THEN the collection's empty-state contract carries that operation as its one
  optional primary action
- AND a workspace-level empty presentation preserves the action instead of
  short-circuiting before collection interaction is rendered
- AND the action retains the canonical operation control identity, availability,
  pending state, feedback, and invocation intent
- AND no renderer reads schema bindings or invents an empty-state action

#### Scenario: Project singleton collection scope

- GIVEN a generated collection declares `singleton` scope over an aggregate
  root query
- WHEN runtime evaluates active scope records from the browser replica
- THEN zero matches produce an explicit collection empty state
- AND one match supplies the named scope value to collection queries, nested
  context queries, and create defaults without rendering a scope selector
- AND more than one match produces an explicit unavailable state without
  selecting the first record, combining results, or exposing collection actions

#### Scenario: Author every block record inline

- GIVEN a projected tree contains a root block and zero or more child placement
  occurrences
- WHEN the active renderer presents the tree
- THEN the root and every available child block render through the same
  recursive structure of record-type header, right-aligned available actions,
  ordinary record editor, and child blocks
- AND each record editor preserves canonical editable and display fields,
  active union and `visibleWhen` selection, specialized fields, drafts, commits,
  pending state, readiness, feedback, and display-safe errors
- AND a child block placed more than once receives one independently scoped
  editor occurrence at every placement path without duplicating stored data
- AND the complete finite tree remains inline without an outline-detail split,
  selected row, focused editor, disclosure control, or placement-field section

#### Scenario: Create and remove tree placements

- GIVEN the root or one child node permits one or more schema-declared child
  variants
- WHEN the renderer opens child creation or placement removal
- THEN runtime projects stable allowed-variant options and only the active
  canonical create surface for child creation
- AND runtime retains branch and slot policy, discriminator and literal default
  derivation, create draft state, `create-tree-child` execution, operation
  output handling, and flat-record refresh
- AND placement removal composes a canonical operation control and destructive
  confirmation for `remove-tree-placement`
- AND the tree result exposes no child-record delete control through placement
  removal capability
- AND successful child creation or placement removal updates ordinary recursive
  reprojection without selecting, expanding, focusing, or inferring a node from
  an operation result

#### Scenario: Project one node header action group

- GIVEN a tree node exposes context navigation, child creation, placement
  ordering, root deletion, or placement removal
- WHEN runtime resolves the actions available for that exact occurrence
- THEN the node header carries one ordered action group with only applicable
  controls and omits its menu when no control remains
- AND context navigation resolves the current block as a workspace context,
  root deletion targets the root block, and placement removal and ordering
  target only the current placement occurrence
- AND create, operation, confirmation, ordering, progress, feedback, disabled,
  and error behavior retain their canonical contracts
- AND the renderer does not discover entity operations, resolve placement
  targets, calculate ranks, attach child records, or execute writes

#### Scenario: Order placements inside one parent and slot

- GIVEN a tree result declares ordered placement edges
- WHEN the user selects an available `top`, `up`, `down`, or `bottom` action
- THEN the tree contract carries a tree-specific reorder intent using the
  shared semantic ordering direction
- AND runtime calculates and executes the sparse-rank update only within the
  exact projected parent-and-slot scope
- AND boundary availability, pending state, no-op moves, rebalance requirements,
  operation failures, and committed moves are projected without drag data,
  target indexes, sortable refs, suspended drops, or cross-scope movement
- AND preserving ordering capability does not require a drag gesture

#### Scenario: Project structural diagnostics

- GIVEN traversal encounters readiness issues, a missing child, a cycle, a leaf
  branch, or descendants beyond the declared maximum depth
- WHEN runtime projects the tree result
- THEN placement and child readiness warnings remain distinct from item-local
  missing-child, cycle-stopped, and depth-stopped structural diagnostics
- AND warnings carry stable identity, display-safe codes or labels, and
  display-safe messages without records, payloads, exceptions, parser errors,
  operation responses, or sync internals
- AND a missing-child placement remains an inline diagnostic node whose removal
  action stays reachable while it exposes no child record editor or child
  creation contract
- AND cycle-stopped and depth-stopped items expose no child creation even when
  their referenced child record would otherwise permit child variants
- AND valid descendants render recursively until the declared maximum depth,
  where an explicit depth-stopped diagnostic replaces further traversal

#### Scenario: Selected tree renderer consumes the complete contract

- GIVEN production tree workspaces use the generated workspace Presentation Host
- WHEN the generated tree foundation publishes a complete tree-result node
- THEN the subscribed Formless Renderer tree entrypoint reads only the scoped
  tree-result reference and delegates to a pure complete-snapshot renderer
- AND generated runtime uses documented
  `@dpeek/formless-presentation` contract and host exports without
  owning tree presentation
- AND production tree sections use the same generated workspace host path as
  list, table, and record results without a direct tree fallback
- AND production uses the Formless Renderer workspace entrypoint

#### Scenario: Formless tree renderer and fixtures

- GIVEN runtime publishes complete production tree contracts
- WHEN the selected renderer implements the contract in `lib/renderer`
- THEN it reuses the recursive record-node structure established by relationship
  hierarchy rendering: record-type header, one action menu, ordinary inline
  record editor, and child node groups
- AND it composes canonical record-result, create, operation, confirmation,
  ordering, warning, status, and empty-state renderers without reading generated
  runtime
- AND package-local data-only fixtures cover shallow and maximum-depth trees,
  duplicate block occurrences, slots, active variants, context actions, empty,
  unavailable, missing-child, cycle, depth-stopped, leaf, warning,
  editing-disabled, and pending states through the reusable memory host
- AND fixtures and production rendering contain no outline, selected editor,
  placement field set, disclosure, or selection state
- AND the renderer does not read records, schemas, or storage; execute
  operations; own DnD behavior; use media clients; run sync effects; or import
  runtime modules

### Requirement: Reactive Generated UI Presentation Host

The system SHALL expose generated workspace contracts through a
stable renderer-neutral reactive host that supports concurrency-safe scoped
subscriptions while preserving complete data-only snapshots and pure renderer
entrypoints.

#### Scenario: Provide a stable renderer-neutral host

- GIVEN generated runtime owns replica reads, local interaction state,
  operation execution, media effects, sync feedback, and route selection
- WHEN it exposes a generated workspace to a renderer
- THEN a stable host supports typed contract-reference reads, cached server
  snapshots, scoped subscriptions, and dispatch of canonical workspace intents
- AND contract references use stable workspace, section, and result identities
  plus an explicit contract role rather than selector functions or runtime
  records as public subscription keys
- AND React Context carries the stable host rather than a changing workspace
  snapshot
- AND renderer-neutral host types, provider and subscription hooks, and a
  reusable memory implementation live in `lib/presentation` without importing
  generated runtime, `src/*`, browser replica, storage, query evaluation,
  operation execution, media clients, or sync behavior
- AND the production adapter that reads client-store and runtime state,
  projects contracts, resolves effects, and dispatches intents remains outside
  `lib/presentation`

#### Scenario: Publish contract snapshots transactionally

- GIVEN one runtime transition changes one or more projected contract nodes
- WHEN the production or memory host publishes the next projection
- THEN it commits the complete next immutable node set before notifying any
  subscriber
- AND reads during one publication observe either the complete previous set or
  the complete next set without tearing
- AND semantically unchanged snapshots retain object identity and do not notify
  their scoped subscribers
- AND reads and cached server snapshots remain referentially stable until their
  referenced node changes
- AND removed references become unavailable in the same atomic publication
  that removes their parent reference
- AND React consumers use `useSyncExternalStore` semantics for client
  subscription, server rendering, and hydration

#### Scenario: Subscribe at workspace, section, and result boundaries

- GIVEN a workspace contains ordered collection sections and each section
  contains one main list, table, record, or tree result plus optional context or
  selected-record detail results
- WHEN generated runtime publishes its projected contracts
- THEN the workspace subscription exposes screen presentation and ordered
  section references
- AND each section subscription exposes collection chrome, actions, query,
  context and selected-record selection, counts, summaries, availability, and
  main, context, and ordered selected-record detail result references
- AND each main, context, or selected-record detail result subscription exposes
  its existing complete canonical list, table, record-result, or tree-result
  snapshot
- AND a field draft or nested operation-state change can notify only its result
  subtree, a count, summary, query, context, or availability change can notify
  only its section subtree, and screen structure or section ordering can notify
  the workspace subtree
- AND row membership or ordering changes notify their complete result subtree
  without requiring per-row, per-cell, per-field, per-operation, per-warning,
  per-tab, or per-summary normalization
- AND the initial host may retain complete workspace projection work while
  bounding React renderer fanout at these subscription boundaries

#### Scenario: Preserve pure renderers and data-only fixtures

- GIVEN Formless Renderer entrypoints accept complete workspace, list, table,
  record-result, and tree-result contract snapshots
- WHEN subscribed renderer entrypoints consume contract references from the
  host
- THEN subscribed wrappers read scoped snapshots and delegate presentation to
  the existing pure snapshot renderers
- AND pure renderer entrypoints continue accepting complete contract snapshots
  directly without a host
- AND package-local fixtures remain serializable contract data with no
  callbacks, React nodes, runtime records, replica APIs, media clients,
  operation controllers, or sync behavior
- AND interactive fixtures use the reusable memory host or its reducer rather
  than production generated runtime
- AND workspace subscription boundaries remain independent from application
  shell contract nodes
- AND tree-result references, snapshots, nodes, subscription hooks, memory-host
  publication, server snapshots, and hydration use the same host semantics as
  list, table, and record results
- AND extending the host does not replace the client store or change auth-route
  or public Site behavior

### Requirement: Reactive Application Shell Presentation Host

The system SHALL expose eligible application shell presentation through the
stable renderer-neutral reactive host while runtime code owns route selection,
data reads, session behavior, operations, and effects.

#### Scenario: Expose shell contract nodes

- **GIVEN** runtime selects an eligible Program shell route
- **WHEN** it projects shell presentation for a renderer
- **THEN** the host exposes typed references for one shell manifest and its
  ordered navigation-section nodes through the same generic contract-node
  boundary used by generated workspace contracts
- **AND** shell nodes carry complete renderer-neutral workspace-switcher and
  screen destinations, selection, counts, statuses, controlled create
  surfaces, and session presentation needed by the shell
- **AND** workspace references retain their existing roles and contract shapes
- **AND** shell references and snapshots are serializable data without route
  objects, schemas, records, queries, runtime callbacks, React nodes, storage
  clients, or renderer imports

#### Scenario: Publish shell state transactionally

- **GIVEN** route, Program access, root-record, create, sync, or session state
  changes one or more shell nodes
- **WHEN** runtime publishes the next shell projection
- **THEN** the complete immutable node set is committed before subscribers are
  notified
- **AND** unchanged shell and navigation-section snapshots retain object
  identity and do not notify their scoped subscribers
- **AND** changed sections notify only their subscribers unless manifest
  structure or ordered references also change
- **AND** removed references become unavailable in the same atomic publication
  that removes them from the manifest
- **AND** typed reads, cached server snapshots, client subscription, and
  hydration retain the host's existing `useSyncExternalStore` semantics

#### Scenario: Dispatch shell intents

- **GIVEN** a shell renderer receives projected links and controlled controls
- **WHEN** the user follows a destination, selects or creates a root record,
  or logs out
- **THEN** ordinary destinations use their projected hrefs
- **AND** controlled interactions dispatch canonical shell intent envelopes
  through the host using stable manifest, section, destination, record,
  create-surface, or control identity as applicable
- **AND** runtime resolves intents against its latest route, selection, create,
  and session state before performing navigation, writes, operations, or logout
  effects
- **AND** shell create-field intents carry the exact projected field occurrence
  id and resolve it against the latest identified create surface before changing
  its runtime-owned draft
- **AND** renderers do not mutate canonical route, record, operation, reset, or
  session state locally

#### Scenario: Formless Renderer consumes the shell contract

- **GIVEN** production publishes one unified application shell contract
- **WHEN** runtime publishes an eligible unified shell
- **THEN** one subscribed Formless Renderer shell entrypoint reads only shell
  references and snapshots, renders the selected route workspace as its child,
  and dispatches canonical shell intents
- **AND** local and deployed instance Program routes use that renderer
- **AND** no-shell routes remain outside the shell host and renderer
- **AND** application source consumes contracts and host behavior
  through documented `@dpeek/formless-presentation` exports and concrete
  rendering through documented `@dpeek/formless-renderer` exports
- **AND** production mounts the renderer through the root Formless Renderer
  application assembly

#### Scenario: Formless shell renderer

- **GIVEN** runtime publishes complete production shell contracts
- **WHEN** the selected renderer implements the contracts in
  `lib/renderer`
- **THEN** pure and subscribed renderer entrypoints render the active workspace
  title, an accessible heading-menu workspace switcher when grouped navigation
  is present, active-group Program screen navigation with destination-less
  labelled sections and optional semantic icons, screen query-count badges,
  root records and create controls, Program Settings destinations, footer sync
  state, session identity, logout, and the route child without importing
  generated runtime
- **AND** the workspace-switcher section renders only in the heading menu while
  ordinary screen sections remain in the navigation body
- **AND** shell status renders as a compact ghost icon-button utility in the
  sidebar footer alongside session and document-theme controls rather than as a
  navigation item
- **AND** the status trigger's accessible name includes the projected sync
  label, and its hover and focus overlay contains the projected sync message,
  detail rows, and workspace-save status where present
- **AND** the status utility visually distinguishes static synced, active
  syncing, and error states, limits motion to the active syncing indication,
  and respects reduced-motion preferences
- **AND** projected sync detail rows render through the package `MetadataList`
  component
- **AND** root create actions render as compact ghost package `IconButton`
  controls with an add icon and the projected accessible label
- **AND** responsive presentation state remains renderer-owned and desktop
  navigation remains expanded
- **AND** the renderer does not read storage, own route policy, evaluate
  queries, execute operations, run session effects, or import runtime data
- **AND** the renderer is exported through documented
  `@dpeek/formless-renderer` subpaths and receives theme and CSS only from root
  application assembly

#### Scenario: Shell contract fixtures

- **GIVEN** runtime publishes complete production shell contracts
- **WHEN** shell UX is evaluated with package-local renderer fixtures
- **THEN** data-only memory-host fixtures cover flat Program destinations,
  grouped workspace destinations, one-level labelled screen sections, semantic
  section icons, screen query-count badges including zero, active-group screens,
  authorization-filtered and ungrouped screen selection, Site authoring, root
  records and counts, controlled create, synced, syncing, and error status,
  authenticated session state, and no-shell selection
- **AND** fixture reducers may simulate root selection, create, and logout
  intents without importing generated runtime, schemas, routing, browser
  replica, storage, operation controllers, or session clients
- **AND** shell fixtures do not synthesize theme controls, while document-theme
  fixtures may compose a separate theme node through the same memory host

### Requirement: Generated List Renderer Contract

The system SHALL project complete generated list results through a controlled
renderer-neutral Presentation list contract while generated runtime code owns
record reads, authoring state, operation execution, and ordering effects.

#### Scenario: Project complete list result

- GIVEN generated UI selects a list result model
- WHEN generated runtime prepares the list for the Formless Renderer
- THEN it projects a stable list id, accessible label, density, ordered items,
  empty state, and editing applicability plus availability when authoring is
  applicable
- AND each field-presented list item carries a stable id, accessible label,
  projected record fields, explicit primary and secondary actions, optional
  ordering actions, and display-safe readiness warnings
- AND each summary-presented list item instead carries a stable id, accessible
  label, display-safe title, optional display-safe subtitle, and optional
  controlled selection state and intent
- AND each projected list field carries a stable occurrence id scoped by the
  list result, item record, and field placement, so the same schema field in a
  different item or result has a different identity
- AND ordinary and specialized list fields cross their applicable Presentation
  field contract boundaries before entering the list renderer
- AND state transitions, delete controls, destructive confirmations, pending
  state, and execution feedback compose existing operation-control contracts
  where applicable
- AND generated runtime retains query evaluation, record and system-field
  reads, active union and `visibleWhen` selection, draft sessions, reference and
  media option loading, media effects, operation controllers, ordering plans,
  sync feedback, and local auto-save behavior
- AND the list contract does not expose `StoredRecord`, `ListResultModel`,
  `GeneratedOperationControlBinding`, ordering patch plans, DnD library events,
  browser replica hooks, app targets, sync setters, presentation class names,
  React nodes, or renderer-specific component props

#### Scenario: Project list actions and ordering intents

- GIVEN a generated list item exposes transition, delete, or ordering controls
- WHEN generated runtime prepares list-item interaction data
- THEN the list contract carries explicit action hierarchy, availability,
  disabled reasons, pending state, controlled destructive confirmation, and
  semantic invocation and confirmation-open intents
- AND ordering data carries display-safe top, up, down, and bottom move labels,
  structural availability, pending state, and semantic reorder intents without
  exposing sparse-rank calculations or drag event payloads
- AND generated runtime selects visible fields, resolves record labels, builds
  operation caller input, calculates ordering moves, invokes operations, and
  closes controlled confirmation only according to operation results
- AND renderers keep list items non-interactive when the item contains nested
  field editors or actions instead of creating nested interactive targets
- AND renderers may choose accessible menus or direct controls that preserve
  projected list-item capabilities and action placement

#### Scenario: Project summary list selection

- GIVEN a summary-presented list is the selector for selected-record detail
- WHEN generated runtime prepares list-item interaction data
- THEN the list contract owns one controlled selected item identity and each
  item carries a semantic select-record intent without a second selected flag
- AND the summary item carries no field, operation, delete, ordering, warning,
  status, or badge contracts
- AND summary presentation declares authoring not applicable rather than
  disabled, so it publishes no editing-disabled reason or status
- AND the renderer may make the whole summary row the selection target because
  it contains no nested interactive fields or actions
- AND summary lists outside a selection composition remain non-interactive
  unless another explicit contract supplies interaction

#### Scenario: Formless Renderer consumes the list contract

- GIVEN production generated lists publish complete renderer-neutral contracts
- WHEN generated runtime projects a complete list result
- THEN the Formless Renderer list entrypoint renders only the projected list,
  item, field, operation, warning, empty-state, and ordering contracts and
  dispatches their intents
- AND production list paths for ordered records, visible union fields, ordinary
  and specialized editors, state transitions, delete confirmation, readiness
  warnings, editing-disabled state, and empty state cross that adapter boundary
- AND the presentation adapter does not query records, select union fields, own
  draft sessions, load reference or media options, build operation input,
  calculate rank patches, execute operations, or update sync state
- AND production list rendering does not use raw model callbacks, React-node
  slots, or DnD event types to bypass the renderer-neutral contract
- AND production mounts list presentation through the root Formless Renderer
  application assembly

#### Scenario: Formless list renderer

- GIVEN runtime publishes the complete production list contract
- WHEN the selected renderer implements that contract in `lib/renderer`
- THEN it uses package list, field, action, menu, empty-state, status, tooltip,
  and feedback primitives without importing generated runtime
- AND the list uses a visible or assistive heading, consistent density, optional
  dividers, and non-interactive list items that compose nested controlled fields
  and actions without turning the whole item into a click target
- AND projected primary actions remain visible where applicable while secondary,
  destructive, and ordering actions use accessible overflow interactions
- AND ordering menus omit structurally unavailable boundary moves while
  retaining pending moves and their projected status
- AND readiness warnings use a compact accessible indicator whose tooltip or
  status presentation contains only projected warning messages
- AND summary items render title and optional subtitle without synthesizing a
  status badge, field control, or action control
- AND the renderer derives selected/current semantics for summary and
  field-presented items from the same controlled list selection identity
- AND a selected row has a persistent visible treatment distinct from hover and
  keyboard focus while retaining accessible current semantics and click or
  keyboard selection behavior
- AND authoring-not-applicable lists emit no disabled-editing status, while a
  list whose expected authoring is unavailable retains its projected reason
- AND empty states use only projected title, description, and optional action
  facts rather than inventing unavailable create behavior
- AND list behavior follows the renderer's list and action hierarchy
  conventions
- AND the list renderer does not read storage, execute operations, run
  sync effects, or import runtime data
- AND the renderer receives theme and CSS only from root application assembly

#### Scenario: List contract fixtures

- GIVEN runtime publishes complete production list contracts
- WHEN list UX is evaluated with package-local renderer fixtures
- THEN data-only fixtures use the same contract shapes to cover editable and
  read-only fields, active union variants, state transitions, destructive
  confirmation, ordering boundaries, readiness warnings, editing-disabled
  state, empty state, and pending or invalid items
- AND a dedicated Lists layout renders the subscribed list renderer with its
  production contract shape
- AND package-local fixture state may simulate field, operation, confirmation,
  and reorder intents for UX review but does not import generated runtime,
  storage, browser replica, operation controllers, ordering plans, sync, or app
  targets
- AND collection tabs, context selection, summaries, collection toolbars,
  record results, public Site rendering, and shell navigation remain owned by
  their existing contracts

### Requirement: Generated Record Result Renderer Contract

The system SHALL project complete generated record results through a controlled
renderer-neutral Presentation record-result contract while generated runtime
code owns record selection, authoring state, operation execution, and effects.

#### Scenario: Project complete record result

- GIVEN generated UI selects a record result model
- WHEN generated runtime prepares the result for the Formless Renderer
- THEN it projects a stable result id, accessible label, density, ready, empty,
  or unavailable state, selected record identity, editing availability, ordered
  fields, explicit action hierarchy, display-safe readiness warnings, and
  operation feedback
- AND ordinary, read-only, icon, media, color, value-unit, quiet-date, Markdown,
  rich-enum, and state-machine fields cross their applicable Presentation field
  contract boundaries before entering the result renderer
- AND visible state-machine fields carry display-safe lifecycle presentation and
  valid transition operation controls with availability, pending, confirmation,
  and feedback facts while delete and other actions retain the record action
  hierarchy
- AND a transition paired with a visible state-machine field is not duplicated
  as a separate record action
- AND generated runtime retains query evaluation, first-record selection, record
  and system-field reads, active union and `visibleWhen` selection, draft
  sessions, reference and media option loading, icon dialog state, media upload
  effects, operation controllers, warning selection, sync feedback, and local
  auto-save behavior
- AND the record-result contract does not expose `StoredRecord`,
  `RecordResultModel`, query expressions, operation bindings, browser replica
  hooks, app targets, sync setters, presentation class names, React nodes,
  runtime callbacks, or renderer-specific component props

#### Scenario: Project record-result intents

- GIVEN a ready record result contains editable fields, state transitions, or a
  delete action
- WHEN generated runtime prepares controlled interaction data
- THEN field changes, commit, revert, icon dialog, media selection, media upload,
  operation invocation, and confirmation-open behavior dispatch canonical field
  and operation intents with stable result, record, field, and control identity
- AND each record-result field owns its occurrence id directly without a
  second field-placement wrapper id
- AND generated runtime resolves field patches, uploads media, builds operation
  caller input, invokes transition or delete operations, reports sync state, and
  closes controlled confirmation only according to successful operation results
- AND renderers do not infer write availability, select transition handlers,
  parse schema, read icon catalogs, upload media, patch records, or execute
  operations

#### Scenario: Formless Renderer consumes the record-result contract

- GIVEN production generated record results publish complete renderer-neutral
  contracts
- WHEN generated runtime projects a complete record result
- THEN the Formless Renderer record-result entrypoint renders only the projected
  result, field, operation, confirmation, warning, empty, unavailable, and
  editing-availability contracts and dispatches their intents
- AND the production collection `record` result path for ordinary and
  specialized editors, read-only displays, active unions, state transitions,
  delete confirmation, warnings, editing-disabled state, unavailable records,
  and empty state crosses that adapter boundary
- AND the presentation adapter does not query records, select fields, own draft or icon
  dialog state, load reference or media options, upload media, build operation
  input, execute operations, or update sync state
- AND collection context detail, referenced-record leaf paths, and tree-builder
  composition retain their owning renderer contracts
- AND production mounts record-result presentation through the root Formless
  Renderer application assembly

#### Scenario: Formless record-result renderer

- GIVEN runtime publishes the complete production record-result contract
- WHEN the selected renderer implements that contract in `lib/renderer`
- THEN it composes package field, operation, confirmation, status, warning, and
  empty-state primitives for ready, empty, unavailable, editing-disabled,
  warning, confirmation, and pending states
- AND layout and action hierarchy follow the renderer's component behavior
- AND the renderer dispatches only canonical nested intents and contains
  no generated runtime, storage, browser replica, media client, operation
  execution, or sync effect imports
- AND the renderer receives theme and CSS only from root application assembly

#### Scenario: Record-result contract fixtures

- GIVEN runtime publishes complete production record-result contracts
- WHEN record-result UX is evaluated with package-local renderer fixtures
- THEN data-only fixtures use the same contract shapes to cover editable and
  read-only detail, active unions, visible-field changes, specialized fields,
  state transitions, destructive confirmation, readiness warnings,
  editing-disabled state, unavailable state, empty state, and pending or invalid
  fields
- AND a focused Record Results layout renders the subscribed record-result
  renderer with minimal local field, operation, and confirmation intent
  simulation
- AND package-local fixtures do not import generated runtime, storage, browser
  replica, media clients, operation controllers, sync, app targets, collection
  tabs, context selection, summaries, or tree composition

### Requirement: Table Surfaces

The system SHALL render generated tables as read-only record projections with
explicit row links, one row operation menu, and explicit ordering affordances.

#### Scenario: Render read-only table cells

- GIVEN a generated table contains field, referenced-field, computed, or
  system-field columns
- WHEN generated UI projects each row
- THEN every data cell renders in compact display mode without a visible field
  label, field-level error text, edit control, draft, commit, or revert behavior
- AND text, long text, Markdown, booleans, dates, datetimes, numbers, enums,
  colours, icons, media, references, state-machine values, computed values, and
  value-unit pairs retain their supported read-only formatting
- AND references use display labels, enums use declared presentation, colours
  use swatches, icons use safe resolved sources, media and images use
  thumbnails, and dates and numbers use their declared display formats
- AND state-machine fields display current state without embedding transition
  controls in the cell

#### Scenario: Render a uniform invalid-cell warning

- GIVEN a table cell's stored value is invalid, its reference is missing, or
  its value cannot be presented safely
- WHEN the cell renders
- THEN the cell displays the existing uniform orange warning icon instead of an
  authoring control or unsafe value
- AND the warning carries concise accessible text identifying an invalid or
  unavailable value
- AND neither the Presentation contract nor the Renderer exposes a tooltip,
  detailed validation reason, raw unsafe content, or field-level correction
  message for that table cell

#### Scenario: Table operation dialog

- GIVEN an explicitly bound table update operation targets the row record or a
  referenced record and opens an edit dialog
- WHEN the dialog renders
- THEN its fields use the declared edit view and existing-record field
  authoring behavior outside the table-cell projection
- AND active union variant fields can render for either target
- AND a referenced-record dialog clearly warns that updating the shared record
  may affect other records

#### Scenario: Render one More options menu

- GIVEN a table row has explicitly bound update, delete, command, transition,
  or move operations
- WHEN the row renders
- THEN one operation-control cell exposes every available row operation through
  one trigger whose accessible name is `More options for <row label>` and whose
  visible tooltip is `More options`
- AND no row operation renders as an inline button or as a state-machine cell
  control
- AND menu order follows declared table operation order with ordering move
  actions composed into the same menu when explicitly placed
- AND unavailable or pending operations retain their projected state, and
  destructive operations retain their confirmation and feedback behavior
- AND a schema-declared `linkControl` remains an independent native-link column
  rather than joining the operation menu

#### Scenario: Table ordering and aggregates

- GIVEN a table result declares ordering and aggregate footer slots
- WHEN the table renders and the user moves rows
- THEN aggregate footers display read-model values
- AND an explicitly placed drag handle remains separate from the More options
  menu while explicitly placed move actions render inside that menu
- AND either affordance patches sparse numeric ranks through the same ordering
  effect

### Requirement: Record Link Presentation

The system SHALL project schema-declared record links through a reusable
renderer-neutral native-link contract while generated runtime owns record reads,
reference resolution, structured URL construction, and availability.

#### Scenario: Project a record link contract

- GIVEN a supported generated record surface places a parsed record link
- WHEN generated runtime prepares the link for the Formless Renderer
- THEN it resolves the destination from the current record and current browser
  replica record map before crossing the presentation boundary
- AND the projected link carries stable occurrence identity, visible and
  accessible labels, semantic prominence, `sameTab` or `newTab` target, and
  available or unavailable destination state
- AND an available destination carries only its resolved native href while an
  unavailable destination carries a display-safe reason and no href
- AND the link contract contains no App schema definitions, raw records,
  record maps, reference paths, URL value-source expressions, browser replica
  hooks, operation controls, callbacks, React nodes, or renderer-specific props

#### Scenario: Render native record link semantics

- GIVEN the Formless Renderer receives an available record link in a placement
  whose control supports link-backed rendering
- WHEN it renders and the user follows the destination
- THEN it renders a native anchor rather than a button click that dispatches an
  operation or presentation intent
- AND a same-tab link retains ordinary native same-tab behavior
- AND a new-tab link uses target `_blank` with `rel="noopener noreferrer"`
- AND modified activation, copying the destination, browser context menus, and
  other native link behavior remain available
- AND an unavailable destination renders as a disabled control with its
  display-safe reason and without an href

#### Scenario: Navigate overflowed relationship-hierarchy links

- GIVEN a relationship-hierarchy node header carries a projected native-link
  action that does not fit inline and the active More-menu primitive exposes
  callback-backed items rather than link-backed items
- WHEN the user activates the available overflow item
- THEN `sameTab` navigation assigns the resolved href to the current location
- AND `newTab` navigation opens the resolved href in a new tab without an opener
- AND the callback performs client-side navigation directly without dispatching
  a hierarchy, workspace, presentation, or operation intent
- AND an unavailable item is disabled, includes its display-safe reason, carries
  no activation callback, and performs no navigation
- AND the callback placement does not add callbacks to the native-link contract
  and may become a native anchor when the menu primitive supports href, target,
  and relationship attributes

#### Scenario: Keep current record link placement bounded

- GIVEN current schema placements for record links are table `linkControl`
  columns and selected-record relationship-hierarchy node headers
- WHEN generated UI selects record controls
- THEN each `linkControl` renders its one referenced link as a visible primary
  row action in its own table column
- AND each hierarchy node projects its ordered links into that node's one
  responsive record-header action list without a second placement registry
- AND an available hierarchy link that fits inline renders through native link
  semantics while only an overflowed link uses the callback-backed More-menu
  behavior
- AND the table's one operation-control column places edit, command,
  destructive, transition, delete, or ordering operations independently
- AND a row may contain both link-control and operation-control columns in
  declared column order
- AND current record links are not placed in table operation overflow menus,
  list items, ordinary record results, item views, collection toolbars,
  workspace actions, or external section actions
- AND the reusable record-link contract and resolution semantics do not depend
  on the table renderer or introduce a COA- or builder-specific abstraction

### Requirement: Generated Table Renderer Contract

The system SHALL project complete generated table results through a controlled
renderer-neutral Presentation table contract while generated runtime code owns
record reads, operation execution, and ordering effects.

#### Scenario: Project complete table result

- GIVEN generated UI selects a table result model
- WHEN generated runtime prepares the table for the Formless Renderer
- THEN it projects a stable table id, accessible label, density, semantic column
  definitions, ordered rows, display cells, empty state, and aggregate footer
  values
- AND each column carries a stable id, visible and accessible header labels,
  semantic width, alignment, row-header status, and content role without
  renderer component props, presentation classes, or React components
- AND data-cell content composes compact display-field facts, display-safe
  computed values, or one uniform invalid-value warning
- AND cells carry no field authoring session, draft map, field occurrence intent
  index, table field-context id, commit policy, editor control, option picker,
  media authoring state, patch resolver, or field intent
- AND row interaction content consists only of independent native record links,
  one operation action group, and explicitly placed ordering controls
- AND generated runtime retains query evaluation, record and system-field
  reads, reference resolution, structured record-link URL resolution, computed
  and aggregate evaluation, display formatting, safe-value resolution,
  operation controllers, ordering plans, sync feedback, and local auto-save
  behavior
- AND the table contract does not expose `StoredRecord`, `TableColumnConfig`,
  `GeneratedOperationControlBinding`, ordering patch plans, drag events, browser
  replica hooks, app targets, sync setters, presentation class names, React
  nodes, or renderer-specific component props

#### Scenario: Project table actions dialogs links and ordering intents

- GIVEN a table row exposes an independent native record link or explicitly
  bound update, command, destructive, transition, delete, or ordering control
- WHEN generated runtime prepares row interaction data
- THEN each `linkControl` carries one native record-link action in its own cell
- AND one row operation action group carries the ordered menu actions,
  availability and disabled reasons, controlled confirmation or edit-dialog
  state, projected edit fields, empty or unavailable target state, and semantic
  invocation and open-change intents
- AND a record-link action carries its resolved href and native target when
  available, or its display-safe unavailable reason without an href
- AND record-link actions do not carry invocation, open-change, or operation
  intents
- AND referenced-record and row-record edit dialogs use the same projected
  record-field and operation-control contracts as other existing-record surfaces
- AND ordering data carries display-safe move labels, availability, pending
  state, semantic ordering affordances, and reorder intents without exposing
  sparse-rank calculations or DnD library events
- AND generated runtime resolves row and reference targets, selects active union
  fields, resolves patch input, calculates ordering moves, invokes operations,
  and closes controlled dialogs only according to operation results
- AND runtime does not synthesize update, delete, transition, or ordering
  controls from entity operation availability without the matching table
  binding and column placement

#### Scenario: Formless Renderer consumes the table contract

- GIVEN production generated tables publish complete renderer-neutral contracts
- WHEN generated runtime projects a complete table result
- THEN the Formless Renderer table entrypoint renders only the projected table,
  native link, display-field, operation, dialog, warning, and footer contracts
  and dispatches only their applicable intents
- AND production table paths for field, reference-field, computed,
  link-control, operation-control, ordering-handle, edit-dialog, invalid-cell,
  empty-state, and aggregate-footer behavior
  cross that adapter boundary
- AND the presentation adapter does not read records, resolve references,
  construct link URLs, evaluate computed values, build operation input,
  calculate rank patches, execute operations, or update sync state
- AND production table rendering does not use raw model callbacks or React-node
  slots to bypass the renderer-neutral table contract
- AND production mounts table presentation through the root Formless Renderer
  application assembly

#### Scenario: Formless table renderer

- GIVEN runtime publishes the complete production table contract
- WHEN the selected renderer implements that contract in `lib/renderer`
- THEN it uses package table, display-field, action, menu, dialog, empty-state,
  status, and feedback primitives without importing generated runtime
- AND table columns use explicit renderer-owned widths, spacious default table
  density, top-aligned compact display cells, appropriate wrapping, and
  non-wrapping value and suffix pairs
- AND an available primary record-link action renders as a native link with its
  projected target and security relationship while an unavailable link renders
  disabled without an href
- AND every row operation and placed ordering move action renders in one
  accessible More options menu while no operation renders as an inline button
- AND the trigger keeps its contextual projected accessible name while its
  visible tooltip reads `More options`
- AND ordering menus omit structurally disabled boundary actions such as moves
  above the first row or below the last row while retaining pending actions
- AND an invalid or unavailable cell renders one orange warning icon with
  concise accessible text and no tooltip or detailed validation reason
- AND edit dialogs use a focused form-purpose composition, controlled projected
  form fields with visible labels, start-aligned content, and explicit close
  behavior
- AND empty states use only projected title, description, and optional action
  facts rather than inventing unavailable create behavior
- AND table behavior follows the renderer's hierarchy and interaction
  conventions
- AND the table renderer does not read storage, execute operations, run
  sync effects, or import runtime data

#### Scenario: Table contract fixtures

- GIVEN runtime publishes complete production table contracts
- WHEN table UX is evaluated with package-local renderer fixtures
- THEN data-only fixtures use the same contract shapes to cover read-only field
  kinds, references, computed values, available and unavailable native record
  links, one row operation menu, destructive confirmation, row and referenced
  record dialogs, ordering, aggregate footers, empty state, and invalid cells
- AND a dedicated table layout renders the subscribed table renderer with its
  production contract shape
- AND package-local fixture state may simulate action, dialog, and reorder
  intents for UX review but does not import generated runtime, storage,
  browser replica, operation controllers, ordering plans, sync, or app targets
- AND collection tabs, context selection, summaries, collection toolbars, list,
  record results, public Site rendering, and shell navigation remain owned by
  their existing contracts

### Requirement: Field Editing And Presentation

The system SHALL render generated field displays and editors from field behavior and presentation metadata.

#### Scenario: Open text suggestions

- GIVEN a generated create, operation, ordinary record, or selected-record
  relationship hierarchy item editor renders a text field whose schema declares
  `suggestions`
- WHEN generated runtime projects the field and Formless Renderer renders it
- THEN the Presentation field contract carries the ordered text suggestions as
  explicit text option facts distinct from enum and reference options
- AND a text editor with non-empty suggestions uses the Astryx `Typeahead`
  backed by `createStaticSource` while the same editor without suggestions
  continues using `TextInput`
- AND suggestions assist entry without constraining it, so an arbitrary value
  accepted by ordinary text field behavior remains visible, editable, and
  committable even when it does not match a suggestion
- AND query changes, suggestion selection, and optional clearing dispatch the
  same controlled draft intents as ordinary text entry
- AND required, disabled, pending, validation, dirty, blur and save, Enter
  commit, Escape revert, and suggestion-list keyboard behavior retain the
  field contract's existing semantics
- AND moving focus within the Typeahead control or its suggestion list does not
  commit a record field as though the user left the editor
- AND Formless Renderer shares the open-text Typeahead behavior with public
  operation forms while keeping public submit-boundary hidden inputs outside
  the shared control
- AND generated suggested text does not use a native HTML `datalist` or alter
  enum and reference field behavior

#### Scenario: Specialized text-backed editors

- GIVEN text fields use `icon` or `media` editor metadata
- WHEN generated editors render
- THEN source-backed icon fields use a catalog-first picker with custom SVG mode
- AND id-backed icon fields use the merged baked and schema-declared catalog,
  commit icon keys, and do not author new inline SVG source
- AND image media fields browse existing core image media assets, select by
  display-safe label, upload images, preview thumbnails, and remove optional
  selections without raw image URL authoring
- AND document media fields browse compatible current-app documents, select by
  display-safe filename, upload files, show MIME type and byte size, open or
  download the selection, replace it, and remove optional selections without
  raw provider URL authoring

#### Scenario: Markdown source editor

- GIVEN text fields use `markdown` editor metadata
- WHEN generated editors render
- THEN markdown fields use the shared `MarkdownEditor` component boundary with
  a controlled textarea source editor
- AND the source editor uses monospace text styling, disables spellcheck, and
  stores and commits the field value as flat Markdown text
- AND generated markdown editing does not require Plate, Slate, or other rich
  text editor runtime modules

#### Scenario: Presentation fallbacks

- GIVEN enum `iconOnly`, boolean `completion`, and optional date `valueOrInteraction` presentations
- WHEN fields render
- THEN known icon and color tokens render visual controls
- AND unknown tokens fall back to visible text or neutral styling
- AND empty `valueOrInteraction` date controls stay quiet until hover or focus

#### Scenario: System field display

- GIVEN a generated table, detail, list, or record surface includes a record
  system field
- WHEN generated UI renders the field
- THEN it resolves the value from record metadata such as `id`, `createdAt`,
  `updatedAt`, or `deletedAt`
- AND it uses the same display formatting and layout pipeline as schema value
  fields
- AND it treats the field as read-only regardless of field editor metadata or
  operation availability

#### Scenario: Identity reference field fallback

- GIVEN a generated field display or editor renders a reference field targeting
  `auth:principal`, `auth:organization`, or `auth:group`
- WHEN display-safe identity target records are not loaded in the active app
  browser replica
- THEN generated UI keeps the stored flat record id visible as the fallback
  reference label
- AND it does not query unrelated app storage, expose the raw generated
  identity-control-plane record editor, or require credentials, challenge
  secrets, token hashes, sessions, grants, recovery material, or provider
  responses
- AND when display-safe identity reference options are available through a
  runtime-owned client path, generated UI may use those options without
  changing the stored app record value shape

#### Scenario: Presentation field contract boundary

- GIVEN generated UI renders create forms, record editors, detail fields, Site
  block authoring fields, public operation input fields, or table display cells
  through Formless Renderer field presentation
- WHEN the foundation model prepares field data for the view layer
- THEN authoring surfaces project applicable `FieldContract` data with stable
  occurrence identity, access, editor, draft, commit, pending, option,
  presentation, and display-safe error facts
- AND table cells project only the compact display facts needed to render the
  current value, formatting, reference label, enum presentation, colour swatch,
  icon, media thumbnail, or uniform invalid-value warning
- AND hidden fields are omitted before they reach the renderer, except hidden
  literal create defaults remain foundation-owned operation input
- AND shared view bindings that declare display interaction project ordinary
  entity fields with display access even when the underlying field is writable,
  and those occurrences publish no draft or patch intents
- AND `visibleWhen`, union discriminator variants, create defaults,
  non-writable fields, system fields, state-machine-owned fields, reference
  option loading, missing reference fallbacks, media upload state, value
  coercion, validation, operation submission, sync status, and local auto-save
  remain foundation behavior
- AND schema-shaped field, presentation, state-machine, and operation-input
  facts in the contract are readonly projection facts
- AND renderers do not use schema-shaped facts to parse schemas, select fields,
  validate values, load data, resolve reference or media options, execute
  operations, infer route policy, or infer write policy
- AND renderers receive only projected field data and applicable intent
  callbacks such as draft change, commit, revert, picker open, or upload file
- AND table display cells receive no field intent callback
- AND field renderer implementations remain controlled value components whose
  core contract does not require browser form names, hidden inputs, or
  `FormData` extraction
- AND browser submit-form adapters may project HTML field names and hidden
  inputs from `FieldContract` data only at the submit-form boundary
- AND production generated surfaces render `FieldContract` through the
  Formless Renderer field entrypoint
- AND renderer implementations do not import schema parser internals, browser
  replica APIs, app target selectors, write option hooks, `submitOperation`,
  media clients, sync status hooks, or generated UI storage helpers
- AND foundation code does not render renderer components or decide field group,
  form, table, detail, picker, popover, or compact cell layout

#### Scenario: Resolve exact field occurrence identity

- GIVEN the same authored schema field or operation input can be rendered for
  different records, results, surfaces, dialogs, forms, or other placements
- WHEN generated runtime projects those fields through `FieldContract`
- THEN every projected field carries a required opaque `fieldId` identifying
  exactly one occurrence within its published root contract graph
- AND `fieldName` remains the schema and stored-data key while `inputName`
  remains the declared operation-input key; neither is an occurrence identity
- AND the projection boundary derives `fieldId` from stable owner and placement
  identity, including a stable placement discriminator when one owner can
  contain the same semantic field more than once
- AND unchanged logical placements retain their `fieldId` across draft, value,
  pending, error, ordering, and reactive contract publication changes
- AND occurrences in different records, results, surfaces, edit field sets, or
  operation forms have different ids even when their field or input names match
- AND array indexes, mutable values, draft state, pending state, and renderer
  order do not contribute to field occurrence identity
- AND renderers and intent adapters consume and forward the projected
  `fieldId` without generating, parsing, or replacing it
- AND runtime resolves field intents through a typed occurrence index, rejects
  duplicate ids when constructing that index, and verifies the resolved field
  or input name plus applicable record, result, surface, and context identity
- AND a stale, mismatched, cross-owner, or unknown occurrence id has no effect
- AND runtime does not accept a field or input name, record-result placement id,
  arbitrary nested object id, or recursive contract match as a field occurrence
  id

#### Scenario: Common Presentation contract foundation

- GIVEN generated UI prepares renderer-facing contracts across selected
  presentation surfaces
- WHEN it projects buttons, action triggers, menus, confirmation prompts,
  compact status, field sets, submit-boundary hidden inputs, media picker
  facts, icon picker facts, or semantic control icons
- THEN those contracts carry stable ids, labels, accessibility labels, selected
  state, disabled state, pending state, display-safe errors, operation
  invocation sources, projected fields, option facts, and intent callbacks
- AND hidden inputs and native `FormData` handling remain submit-boundary
  adapter facts rather than the source of runtime state
- AND semantic renderer icons are represented as ids in the contract rather than
  React components or renderer package imports
- AND the contracts do not include renderer component props, storage handles,
  browser replica hooks, sync functions, presentation class names, React
  components, raw records, or media client calls
- AND table, collection, shell/navigation, public Site, and tree-builder
  contracts remain owned by their specific capability boundaries

#### Scenario: Resolve semantic control icons from built-in sources

- GIVEN a Presentation contract carries a semantic control icon id
- WHEN the Formless Renderer renders that control
- THEN the renderer maps the semantic id to a stable built-in icon key and
  renders the trusted SVG source supplied by the built-in icon package
- AND the Presentation contract continues carrying only the semantic id
- AND the renderer does not import the runtime picker catalog or picker labels,
  groups, and search terms
- AND schema definitions that replace same-key baked picker icons do not alter
  renderer-owned semantic controls

### Requirement: Generated Create Surface Contract

The system SHALL project generated create triggers, dialogs, and forms through a
controlled Presentation create-surface contract while generated runtime code
owns create policy, draft state, validation, and operation execution.

#### Scenario: Project controlled create surface

- GIVEN a generated collection, context selector, list-detail selector,
  selected-record relationship heading, or root navigation group exposes a
  create operation
- WHEN generated runtime prepares the create control for the Formless Renderer
- THEN it projects a stable create-surface id, semantic trigger content,
  accessible trigger label, disabled state and reason, controlled dialog open
  state, dialog title, projected create field set, form-level errors, cancel
  control, submit control, and dialog-open and submit intents
- AND each projected create field carries an occurrence id scoped by the create
  surface and stable field placement, and its field intent forwards that exact
  id to runtime
- AND the trigger contract distinguishes visible-label, icon-plus-label, and
  icon-only controls without carrying React icons, renderer component props, or
  presentation classes
- AND opening the create dialog is a presentation intent and does not execute
  the declared create operation
- AND a selected-record relationship create surface resolves compatible
  schema-declared defaults from the selected source record and relationship
  query context into ordinary flat target operation input
- AND unresolved context defaults or disabled create policy disable the trigger
  with a display-safe reason before the dialog opens
- AND generated runtime retains the operation config, query context, create
  draft session, operation controller, sync feedback, created record selection,
  and caller-owned success behavior

#### Scenario: Formless Renderer consumes the create surface contract

- GIVEN production generated UI publishes controlled create-surface contracts
- WHEN generated runtime projects a create surface
- THEN collection operation rows, context selectors, list-detail selectors,
  selected-record relationship headings, root navigation groups, standalone
  generated create dialogs, and embedded tree-child create forms render through
  a Formless Renderer entrypoint that consumes the controlled create-surface
  and field contracts
- AND the presentation adapter receives projected display facts and open, field,
  cancel, and submit intents instead of raw operation configs, query context,
  draft-session state, operation controllers, records, or storage hooks
- AND field changes emit controlled field intents and form submission emits a
  submit intent without treating DOM controls or `FormData` as the source of
  draft values
- AND generated runtime marks the draft session submitted, resolves visible
  union and `visibleWhen` fields plus hidden literal defaults, prevents invalid
  submission, invokes the declared create operation, and closes the dialog only
  after a successful create result
- AND operation failure leaves the dialog and authored draft values available
  for correction while runtime-owned operation feedback reports the failure
- AND current create capability includes mutation-policy disabled
  state, unresolved context defaults, create-view field selection, union
  variants, `visibleWhen`, hidden literal defaults, required and invalid draft
  errors, reference options, state-machine initial values, supported specialized
  fields, pending submission, failure retry, and created-record callbacks
- AND production mounts create presentation through the root Formless Renderer
  application assembly

#### Scenario: Create surface contract fixture

- GIVEN runtime publishes the production create-surface contract
- WHEN product UX is evaluated in `lib/renderer`
- THEN an unexported package fixture renders representative create triggers,
  dialog state, projected create fields, validation, pending submission, and
  failure state from the same contract shape used by production
- AND the fixture covers visible-label, icon-plus-label, and icon-only triggers
  plus disabled and unresolved-default states needed by current call sites
- AND the package fixture uses a form-purpose dialog with a clear title, a real
  browser form, a vertical form layout, a secondary cancel action, and one
  loading primary submit action
- AND package-local fixture state may simulate intents for UX review but does
  not import generated runtime, operation execution, browser replica, storage,
  or sync behavior
- AND command buttons, collection and table chrome, edit and delete dialogs,
  the tree-builder presentation contract, and public Site forms remain owned by
  their existing contracts

### Requirement: Generated Record Field Renderer Contract

The system SHALL project supported existing-record field editors and read-only
field displays through the Presentation field contract while generated runtime
code owns record reads, draft state, field visibility, update resolution, and
operation execution.

#### Scenario: Project ordinary record editor and display fields

- GIVEN a generated record-result or list surface renders an ordinary writable
  or read-only field, or a table renders an ordinary display field
- WHEN generated runtime prepares that field for the Formless Renderer
- THEN record and list authoring projects a `RecordFieldContract`, read-only
  record and list presentation projects a `DisplayFieldContract`, and a table
  projects only compact display facts without an addressable field occurrence
- AND authored fields retain stable field id, record id, access mode, committed
  value, controlled draft, display formatting, density, label visibility,
  pending state, display-safe errors, projected options, derived commit policy,
  and field intents as applicable
- AND ordinary fields include text, long text, number, value-unit, date,
  datetime, boolean, non-state-machine enum, reference, markdown, and color
  fields whose authoring does not require media upload or icon-picker effects
- AND generated runtime retains browser replica reads plus record, system-field,
  reference-label, formatting, and safe-display resolution for every surface
- AND reference option loading, active union and `visibleWhen` selection, draft
  sessions, patch resolution, operation execution, sync feedback, and local
  auto-save behavior remain limited to authoring surfaces
- AND missing reference ids, invalid number drafts, unknown or alpha color text,
  read-only and system fields, compact fields, heading fields, and visible-label
  detail fields remain explicit projected facts instead of renderer inference

#### Scenario: Project specialized record-result fields

- GIVEN a generated record result renders icon, media, color, value-unit,
  quiet-date, Markdown, rich-enum, or state-machine fields
- WHEN generated runtime prepares those fields for the Formless Renderer
- THEN mode-aware icon options and dialog state, media presentation and
  upload facts, color drafts and fallbacks, formatted values and units, temporal
  display, enum presentation, label visibility, density, and state-machine
  lifecycle facts remain explicit field contract data
- AND state-machine-owned values remain read-only while a visible
  state-machine field may compose its valid projected transition operation
  controls as the field interaction
- AND the same transition is not also projected as a separate record action
- AND invalid or alpha colors, missing icon or media ids, legacy or custom SVG drafts, undeclared
  enum and state values, pending operations, and hidden accessible labels remain
  visible without renderer inference or coercion
- AND generated runtime retains icon catalog resolution, SVG validation, media
  asset loading and upload, grouped patch resolution, transition binding,
  writes, sync feedback, and auto-save effects

#### Scenario: Formless Renderer consumes record field contracts

- GIVEN production generated UI publishes existing-record field contracts
- WHEN generated runtime projects a supported record field on a generated
  record surface
- THEN the Formless Renderer field entrypoint renders only the projected field
  contract and dispatches field intents without reading records, loading
  options, resolving patches, invoking operations, or updating sync state
- AND list and record-result call sites retain their editing, read-only display,
  derived commit, failure, specialized-field, and missing-reference behavior
- AND table call sites reuse read-only display presentation without dispatching
  field intents
- AND collection context detail and tree-builder field composition retain their
  owning record-result and tree-result contract boundaries
- AND existing-record text editors with email format render with browser
  autocomplete disabled and 1Password ignore metadata while create and
  operation email inputs retain their form behavior
- AND production mounts field presentation through the root Formless Renderer
  application assembly

#### Scenario: Record field data fixtures

- GIVEN runtime publishes ordinary production record field contracts
- WHEN renderer UX is evaluated in `lib/renderer`
- THEN unexported package-local data-only fixtures provide representative
  `RecordFieldContract` and `DisplayFieldContract` values using the same
  contract shapes as production
- AND fixtures include editable, read-only, dirty, invalid, pending,
  compact, default, heading, visible-label detail, missing-reference, and
  display-fallback states
- AND the fixtures contain no React components, generated runtime imports,
  browser replica reads, storage records, operation execution, media clients, or
  sync behavior

#### Scenario: Presentation field contract coverage

- GIVEN generated UI projects supported field display and editor kinds to
  `FieldContract`
- WHEN the Formless Renderer renders the projected fields
- THEN text, long text, number, date, boolean, enum, reference, markdown
  display, icon display, source SVG icon display, color, and media
  fields share field framing, labels, status, density, and keyboard
  behavior
- AND markdown editing uses a plain text area while markdown display uses the
  active renderer's Markdown display primitive
- AND source SVG icon rendering accepts a display-safe SVG source supplied by
  generated UI and preserves renderer icon sizing, color, accessibility, and
  layout semantics
- AND reusable source SVG parsing or sanitizing comes from
  `@dpeek/formless-source-svg` rather than a presentation package
- AND color fields use a renderer-owned color input primitive while generated UI
  owns validation, draft value preservation, and commit policy
- AND when the color picker control can only represent valid opaque hex colors,
  invalid, alpha, missing, or unknown stored text values remain visible as
  field draft or display text rather than being coerced by renderer primitives

#### Scenario: Mode-aware icon picker contract

- GIVEN generated icon editor fields use source, transitional, or id value mode
- WHEN generated UI projects the fields through the Presentation field contract
- THEN it merges baked runtime icons with schema-declared icon definitions into
  `IconOption` facts with ids, labels, groups, and display-safe SVG sources
- AND schema definitions replace same-key baked options while other baked
  options remain available
- AND source mode matches catalog selections by SVG source and commits SVG
  source while retaining custom SVG drafts and validation
- AND transitional mode resolves catalog keys by id, renders safe legacy SVG
  values, and commits ids for new catalog selections without offering inline
  SVG authoring
- AND id mode resolves and commits catalog keys without accepting raw SVG input
- AND an unresolved stored id remains explicit missing-icon state with its id
  visible and removable rather than being coerced to an empty value
- AND mode, selection, resolved preview source, legacy source state, missing id,
  open state, and save availability are explicit contract facts
- AND the renderer does not infer icon options by reading runtime or schema icon
  catalogs, parsing app schema, importing runtime icon components, or deciding
  how stored icon values are interpreted

#### Scenario: Presentation generated-field contract vertical slice

- GIVEN the Formless Renderer renders a generated-field vertical
  slice
- WHEN the slice renders one coherent record workflow and one public operation
  form workflow
- THEN create form fields, record edit fields, detail or read-only fields, and
  public-action form fields are composed from the same projected
  `FieldContract`
- AND table-cell presentation reuses the same read-only value formatting and
  visual display primitives through its smaller intent-free cell contract
- AND a package-local generated foundation fixture owns shared draft state,
  validation errors, pending state, baseline values, commit, revert, missing
  reference fallback, and submit readiness for the slice
- AND text, long text, boolean, enum, reference, number, markdown, source SVG
  icon, color, and media-shaped values are represented without
  importing Formless storage, browser replica, generated write hooks, operation
  executors, or media clients into the renderer implementation
- AND field-commit interactions invoke commit and revert intents, immediate
  fields commit on change, and submit fields resolve through a submit-form
  adapter boundary
- AND invalid number draft text, missing reference ids, alpha or unknown color
  values, markdown source, source icon SVG, and display-safe field errors remain
  visible instead of being coerced by renderer primitives
- AND media asset ids and preview hrefs remain renderer contract facts while
  media fields render only image thumbnails

#### Scenario: Public Site renderer stays outside the application Presentation Host

- GIVEN generated admin, shell, management, auth, and access presentation use
  the reactive `PresentationHost`
- WHEN public Site page, block, frame, system-state, or form presentation is
  rendered
- THEN successful public pages consume the Site-owned component-shaped
  `SitePublicRendererProps` contract with canonical `SitePageTree`, link mode,
  and route-base facts
- AND public form renderers consume Site-owned session facts and intents while
  Site foundations retain validation, coercion, challenge, idempotency, and
  public operation execution
- AND `@dpeek/formless-renderer` may adapt generic public operation fields to
  canonical `FieldContract` controls inside the package without importing the
  application Presentation Host or generated admin runtime into the public graph
- AND production browser and Worker roots mount the Formless Renderer page and
  system-state entrypoints through explicit public Site assembly

### Requirement: Media Field Renderer Boundary

The system SHALL keep generated field layout and commit behavior in generated UI
while delegating media-specific controls to the Formless Renderer.

#### Scenario: Media editor uses renderer contract

- GIVEN a text field declares the `media` editor
- WHEN generated UI renders the field
- THEN generated UI projects media kind, compatible asset options, selected
  asset state, image preview or document file facts, upload constraints,
  availability, delivery intents, and file-select intent routing through the
  Presentation field contract
- AND the active renderer handles asset selection, upload file selection, image
  preview, document open or download, replacement, removal, and broken-asset
  display through projected facts and intent callbacks
- AND media editors, media libraries, and media displays render image thumbnails
  or document filename, MIME type, and byte size without exposing raw asset ids,
  provider keys, or provider URLs for authoring
- AND generated workspace media discovery includes record-presentation media
  fields from every selected-record relationship-hierarchy node recursively,
  including the root, nested relationships, union variants, and union fallbacks,
  while retaining hierarchy create-action media fields and deduplicating fields
  by entity and field name
- AND generated and renderer contracts expose one Media control and renderer
  kind without Image or Document field kinds or an asset-versus-URL mode
  discriminator
- AND the Media package exposes no React presentation adapter and selected
  Media presentation stays in `@dpeek/formless-renderer`
- AND the field value remains a flat media asset id committed as text by
  generated UI

### Requirement: Create Edit And Delete Flows

The system SHALL honor generated create, edit, `visibleWhen`, create default, union variant, and delete policies across record surfaces.

#### Scenario: Shared authoring session foundation

- GIVEN generated create forms, record update/edit surfaces, public operation
  forms, or generated Presentation projections author field-shaped values
- WHEN the user changes authored values
- THEN a generated authoring session owns typed draft values, visible field
  selection, field errors, submit or commit readiness, and optional baseline
  values for future save/cancel behavior
- AND generated controls and Presentation projections read from and write to that
  session as the source of truth instead of reading values back from browser
  form controls
- AND schema-owned or generated-ui-owned resolvers convert typed drafts into
  flat `RecordValues`, flat patch values, or declared operation input before
  operation submission
- AND `FormData`, browser field names, hidden submit inputs, and native form
  extraction are adapter-only concerns at submit boundaries
- AND shared draft resolution preserves boolean `false`, invalid number raw
  draft text, reference ids with missing-option fallback, text-backed markdown,
  icon, image, media, and color values, and display-safe field errors
- AND public operation forms use the same controlled field authoring and
  validation projection as generated admin forms for supported scalar operation
  input fields
- AND the foundation may carry baseline and revert facts needed by later
  save/cancel edit sessions without requiring this flow to expose a full
  cancelable edit mode

#### Scenario: Create form submission

- GIVEN a create form has hidden literal defaults and `visibleWhen` fields
- WHEN the user submits the form
- THEN generated UI resolves operation input from a foundation-owned create
  draft session rather than treating DOM `FormData` as the source of truth
- AND hidden literal defaults are submitted through the declared create
  operation
- AND hidden `visibleWhen` fields are not submitted
- AND active union variant fields follow draft discriminator values
- AND unresolved context defaults, invalid draft values, and required field
  errors prevent submit with display-safe field errors before the operation is
  invoked
- AND Authority validation remains the source of record validation for submitted
  create operation input

#### Scenario: Create draft value resolution

- GIVEN a generated create session contains visible draft values, hidden draft
  values, create defaults, and optional union presentation metadata
- WHEN generated UI prepares create operation input
- THEN the schema-owned create value resolver selects the active union fields
  from the draft discriminator, filters fields by `visibleWhen`, coerces visible
  drafts to flat record values, and then applies hidden create defaults
- AND hidden draft values remain available in the local session when fields are
  hidden and later revealed, but they are not included in operation input while
  hidden
- AND boolean, date, enum, text, reference, markdown, icon, image, media, color,
  and scalar text-backed editors resolve to flat field values through generated
  field behavior
- AND number editors preserve invalid raw draft text in the session and expose a
  field error instead of submitting `NaN` or coercing the invalid draft to an
  empty value
- AND a FormData-based submit path, when needed by a public or native form
  adapter, first converts HTML form values into the same typed draft shape and
  then uses the same schema-owned create value resolver

#### Scenario: Update draft patch resolution

- GIVEN an existing record edit session contains committed baseline values and
  typed draft values for writable generated fields
- WHEN a field commit, edit dialog submit, or generated Presentation record intent
  prepares an update
- THEN generated UI resolves the draft through a generated patch resolver before
  invoking the declared update operation
- AND the resolver selects visible fields from draft-aware `visibleWhen` and
  union discriminator state where a session is active
- AND the resolver omits hidden fields, unchanged values, record system fields,
  non-writable fields, and state-machine-owned fields from patch input
- AND hidden drafts may remain available in the local session when fields are
  hidden and later revealed, but they are not included in patch input while
  hidden
- AND invalid number drafts remain visible as raw text with a display-safe field
  error instead of submitting `NaN` or reverting the draft
- AND grouped generated adapters such as value-unit controls and media upload
  controls resolve to flat patch values while media upload, picker, and preview
  state remain generated or runtime adapter behavior outside schema storage
- AND Authority validation remains the source of record validation for submitted
  update operation input

#### Scenario: Non-writable fields stay out of authoring

- GIVEN a generated create form, edit form, or table row operation dialog
  resolves field configs
- WHEN a field is a record system field or otherwise non-writable
- THEN generated UI does not render a user-editable control for that field
- AND generated UI does not include that field in operation input
- AND read-only metadata display remains available through display-only
  surfaces

#### Scenario: Local workspace auto-save after generated writes

- GIVEN generated UI runs in a local workspace profile with auto-save available
- WHEN a generated create, update, delete, command, ordering, media-backed
  patch, schema edit, or control-plane edit commits successfully
- THEN generated UI reports the committed write to the local workspace
  auto-save client hook
- AND generated UI does not write workspace files or read browser IndexedDB as
  workspace source

#### Scenario: Delete control availability

- GIVEN an entity delete policy is enabled
- WHEN records render in collection contexts, list rows, table rows, or tree
  child nodes
- THEN collection, list, and tree delete controls can render according to their
  owning placement rules
- AND a table delete control renders only through an explicit table operation
  binding and its one operation-control menu
- AND rendered delete controls retain destructive confirmation
- AND tree placement removal stays separate from child record deletion

### Requirement: Operation Presentation

The system SHALL render generated record and collection controls from available
entity operations and view operation bindings.

#### Scenario: Select available operations for surface scope

- GIVEN a generated collection, list, table, tree, record, or detail surface
  renders an entity
- WHEN the surface model is selected
- THEN generated UI asks for available operations for the entity and current
  scope
- AND collection-scoped operations can render in collection toolbars
- AND record-scoped operations can render in record menus, list rows, tree
  nodes, or detail operation controls according to those surface placements
- AND table rows render only operations explicitly bound and placed by the
  table view
- AND operations hidden from the browser actor are not rendered as controls

#### Scenario: Bind operation placement from view schema

- GIVEN a collection view declares operation bindings
- WHEN generated UI selects the collection model
- THEN each binding references a canonical operation key such as `task.create`
  or `task.clearCompletedTasks`
- AND the binding can provide placement and ordering hints without redefining
  the operation input, effect, policy, or audit behavior

#### Scenario: Place a selected-record operation at a detail heading

- GIVEN a selected-record relationship section binds a record-scoped source
  operation at its heading
- WHEN generated runtime projects and invokes the control
- THEN the control uses the selected source record id and the same canonical
  operation binding, controller, execution key, authorization, availability,
  pending, confirmation, result, and effect behavior as any other placement
- AND heading placement changes only ordered presentation and visible labeling
- AND the renderer cannot weaken operation authorization, transition validity,
  confirmation, input construction, or execution semantics

#### Scenario: Place a selected-record create surface at a relationship heading

- GIVEN a selected-record relationship section binds a target create view and
  create operation at its heading
- WHEN generated runtime projects and invokes the control
- THEN the control reuses the canonical create surface, draft state, field
  projection, validation, submission, feedback, operation controller, and
  execution behavior
- AND runtime resolves the selected source, relationship query context, and
  declared compatible defaults against the latest workspace before opening or
  submitting the surface
- AND opening does not create a placeholder record, valid submission executes
  once through the target entity's canonical collection create operation, and
  the created flat target record carries the selected source id in the
  relationship's declared target reference field

#### Scenario: Bind a collection operation to empty state

- GIVEN a collection view explicitly binds one operation at
  `emptyStatePrimary`
- WHEN the selected collection result is empty
- THEN generated UI projects the binding as the empty state's primary action
- AND invoking it uses the same foundation operation controller as a toolbar
  control for that canonical operation
- AND the binding is absent from the non-empty collection toolbar unless a
  distinct toolbar binding declares that placement
- AND a collection without the explicit binding receives no inferred setup,
  create, or first-command action

#### Scenario: Project operation controls

- GIVEN a source schema or view declares operation bindings
- WHEN generated UI selects presentation models
- THEN generated controls are selected from source-declared operations and
  operation bindings
- AND generated controls invoke source-declared operations as the primary
  browser interaction model

#### Scenario: Operation is the control contract

- GIVEN generated UI renders create dialogs, edit dialogs, delete controls,
  table row controls, tree controls, ordering controls, state transition
  controls, public form controls, or instance management controls
- WHEN the user submits the control
- THEN generated UI invokes a source-declared operation or a runtime-declared
  workspace operation
- AND generated UI submits operation invocation requests through operation
  endpoints or runtime operation adapters
- AND operation response shape drives progress, success, failure, replay, local
  auto-save, and compact status presentation

#### Scenario: Project operation control bindings

- GIVEN generated UI selects operation controls for collection toolbars, record
  menus, form submits, table rows, tree nodes, state transitions, ordering
  controls, public forms, or workspace controls
- WHEN the foundation model prepares data for the view layer
- THEN it projects each renderable control as plain operation-shaped data with a
  stable binding id, shared execution key, canonical operation key, scope, kind,
  label, visual intent, availability state, optional disabled reason, optional
  destructive confirmation, and compact feedback labels
- AND hidden controls are omitted before they reach the view layer
- AND disabled, destructive, confirmation, ordering, menu placement, edit-dialog,
  public-safe field, and reference-target facts remain presentation facts derived
  from source operations, operation bindings, runtime operation definitions, or
  public operation projections
- AND the projected data does not expose app targets, schema parser internals,
  browser replica internals, write options, local auto-save hooks, operation
  handler internals, or auth policy internals

#### Scenario: Execute through operation controller

- GIVEN multiple generated controls are bound to the same operation execution key
- WHEN the user invokes one of those controls
- THEN generated UI submits a binding id and caller input to a foundation-owned
  operation controller
- AND the controller builds the operation invocation request, calls the
  Authority operation endpoint or runtime operation adapter, applies materialized
  changes to the browser replica, reports committed writes to local workspace
  auto-save where available, and returns a normalized committed, replayed, or
  failed result
- AND pending, success, replay, and failure state is shared across all controls
  that use the same execution key
- AND created record ids, affected counts, and replay status come from the typed
  normalized operation result while capability adapters or the controller map
  closed failure state to fixed browser-owned copy
- AND caught exceptions and arbitrary transport messages do not become an
  operation result's presentation error

#### Scenario: Operation progress is generic execution state

- GIVEN a generated operation may take long enough to need more than a spinner
- WHEN the foundation operation controller reports execution state
- THEN the state can include optional display-safe progress with a title, detail,
  updated timestamp, and ordered steps
- AND each progress step has a stable id, label, optional detail, and status of
  pending, running, succeeded, failed, or skipped
- AND compact generated UI can render the active progress step while the
  operation is pending
- AND richer progress views such as a popover or overlay use the same operation
  progress state rather than a workspace-specific panel contract
- AND progress state does not expose app targets, gateway proxy details,
  filesystem paths, provider secrets, raw logs, or internal tokens

#### Scenario: Presentation operation control boundary

- GIVEN generated UI renders operation controls through the Formless Renderer
- WHEN buttons, menu items, submit buttons, confirmation dialogs, progress
  indicators, compact status, or toast feedback render
- THEN the renderer consumes only projected operation control data, current
  execution state, and callback functions supplied by generated UI
- AND production generated surfaces render operation control contracts through
  the Formless Renderer operation entrypoint
- AND renderer implementations do not import or call `submitOperation`, app
  target selectors, schema parsing helpers, browser replica APIs, write option
  hooks, local auto-save hooks, operation handler helpers, or auth policy
  helpers
- AND foundation code does not render renderer components or decide page, table,
  row, tree, dialog, menu, or toast layout

#### Scenario: Project operation buttons and execution feedback

- GIVEN generated UI prepares a collection command, record-delete control,
  compact operation status, or operation progress presentation
- WHEN it projects the control for the Formless Renderer
- THEN the renderer contract carries a stable control id, explicit button
  content, semantic prominence, density, accessibility label, availability,
  disabled reason, pending state, optional count badge, optional controlled
  destructive confirmation, and projected execution feedback
- AND projected execution feedback can carry a stable event identity, status,
  title, detail, semantic intent, active progress summary, and ordered progress
  steps derived from generic operation execution state
- AND controls that share an execution key receive the same pending and result
  state without exposing the execution key as permission to execute an
  operation
- AND confirmation open state is controlled through presentation intents while
  generated runtime closes the confirmation after committed or replayed
  execution, retains the current controlled state after failure, and permits
  user dismissal during pending execution without cancelling the operation
- AND generated runtime retains target counts, record-label resolution,
  operation input adapters, caller input, operation controllers, sync feedback,
  result handling, and post-success callbacks
- AND the renderer contract does not expose raw
  `GeneratedOperationControlBinding` values, generated input adapters, caller
  input payloads, records, app targets, sync setters, or controller methods
- AND renderers use only explicitly projected labels, icons, count facts,
  disabled reasons, status copy, and feedback copy rather than inferring them
  from operation kinds

#### Scenario: Formless Renderer consumes operation button contracts

- GIVEN production collection commands, record deletion, compact status, and
  progress output publish complete renderer-neutral contracts
- WHEN generated runtime publishes those leaves through the Presentation
  operation contract
- THEN Formless Renderer entrypoints render the projected controls,
  confirmations, status, and progress while dispatching only presentation and
  invocation intents
- AND collection queries and counts, record reads and labels, operation
  execution, sync feedback, successful-delete callbacks, and execution-state
  subscriptions remain in generated runtime
- AND production mounts operation presentation through the root Formless
  Renderer application assembly

#### Scenario: Formless operation control renderer

- GIVEN production operation leaves publish the renderer-neutral operation
  contract
- WHEN the selected renderer implements that contract in `lib/renderer`
- THEN it uses package action, badge, destructive confirmation, loading, status,
  progress, and toast primitives without importing generated runtime
- AND it presents one primary action per action group, uses loading state for
  asynchronous controls, exposes disabled reasons, uses dedicated icon-only
  controls when projected, and pairs semantic status indicators with visible
  text
- AND destructive confirmations use explicit consequence copy and specific
  action labels, while committed and replayed feedback is concise and repeated
  feedback events are deduplicated by projected identity
- AND operation-control behavior follows the renderer's interaction and
  hierarchy conventions

#### Scenario: Operation control fixtures

- GIVEN runtime publishes production operation button and feedback contracts
- WHEN operation UX is evaluated in the package-local renderer Operations layout
- THEN data-only fixtures use the same contract shapes to cover collection
  command buttons, a target-count badge, disabled and pending controls,
  destructive confirmation, committed, replayed, and failed results, shared
  execution state, compact status, and ordered progress
- AND package-local fixture state may simulate open-state, invocation, result,
  and feedback intents for UX review but does not import operation controllers,
  generated runtime, storage, browser replica, sync, or app target modules
- AND create and public operation forms, workspace shell controls, and public
  Site rendering remain owned by their existing contracts

#### Scenario: Specialized controls use adapters

- GIVEN create dialogs, edit dialogs, delete confirmations, table row menus,
  state transition menus, ordering moves, tree child add or remove controls,
  public operation forms, or workspace controls need specialized input
- WHEN the user submits the specialized control
- THEN a foundation adapter builds the operation input from form values, record
  ids, transition facts, ordering move plans, tree parent and variant facts,
  public proof fields, or workspace operation fields
- AND the adapter invokes the same operation controller contract used by simple
  operation buttons and menu items
- AND adapters do not redefine operation input, output, effect, actor policy,
  idempotency policy, audit policy, or storage target semantics

#### Scenario: Collect declared collection command input

- GIVEN a generated collection-scoped command declares operation input fields
- WHEN the user selects its generated operation control
- THEN generated UI opens a controlled command-input dialog without invoking
  the command
- AND the dialog projects entity-backed and inline input definitions through
  the generated field and form contracts with their declared labels, required
  state, field types, formats, enum values, suggestions, and validation
- AND cancelling closes the dialog without invoking the command
- AND submitting a valid draft invokes the command exactly once with input
  keyed by the declared operation input names

#### Scenario: Collect declared record command input

- GIVEN a generated record-scoped command declares operation input fields
- WHEN the user selects its control from a record, table, detail, or
  relationship-hierarchy `recordOperation` surface
- THEN generated UI opens the same controlled command-input dialog without
  invoking the command
- AND submitting a valid draft invokes the command exactly once with the
  selected record id and resolved declared input
- AND the invocation source identifies the generated command form submit
  surface

#### Scenario: Validate and execute command input dialogs

- GIVEN a generated command-input dialog is open
- WHEN the dialog first projects an untouched draft with missing required fields
- THEN generated validation does not present those missing-required errors and
  keeps the initial submit action available
- WHEN the user first submits the invalid draft
- THEN generated validation marks the draft session submitted, reports
  display-safe required field errors, and does not invoke the command
- AND subsequent field edits recompute visible validation so resolved errors
  disappear, unresolved errors remain, and submit becomes available when the
  draft is valid
- AND a valid submission invokes the command exactly once with the resolved
  input
- AND pending, failed, committed, and replayed execution uses the command's
  existing shared execution state, idempotency, feedback, and close behavior
- AND generated runtime closes the dialog only after committed or replayed
  execution and retains the draft after failure
- AND Authority remains responsible for record-plan generation and trusted
  generated ids, codes, dates, and other operation effects

#### Scenario: Preserve input-free command behavior

- GIVEN a generated collection-scoped or record-scoped command declares no
  input fields
- WHEN the user selects its operation control
- THEN the command retains its existing immediate or controlled-confirmation
  behavior without opening a command-input dialog

#### Scenario: Public operation form authoring controls

- GIVEN generated Site authoring renders a `publicOperationForm` block editor
- WHEN the author configures the block
- THEN the editable controls cover the block label, body, target app route
  identity, canonical operation key, button label, success label, and optional
  operation input notification configuration
- AND generated UI does not ask the author to manually define submitted form
  fields that duplicate `operation.input.fields`
- AND generated UI surfaces unavailable target operations, missing Turnstile
  configuration, unsupported required input fields, and invalid target route
  facts as configuration feedback instead of rendering a working public form

#### Scenario: Public operation form runtime authoring

- GIVEN a public Site renders a working public operation form from
  `operation.input.fields`
- WHEN a visitor edits and submits the form
- THEN generated UI uses a client-side controlled generated operation draft
  session as the source of truth for submitted input values
- AND the public form reuses generated field projection, editor selection,
  display-safe validation, and Presentation field data for supported text,
  long text, boolean, date, number, and enum input fields
- AND each projected operation input field carries an occurrence id scoped by
  its hosting block, form, or control and declared input name
- AND generated validation owns required, type, enum, text format, and invalid
  number errors before submission while the public operation executor remains
  authoritative for server-side validation
- AND native browser validation does not decide whether the generated public
  form can submit
- AND the resolved public input stays keyed by declared operation input names
  until the operation execution boundary maps entity-backed inputs for
  materialization
- AND Turnstile proof values, source block ids, route facts, and idempotency
  keys remain public operation adapter facts outside field authoring state
- AND a native `FormData` path, when present, is only a submit adapter that
  converts browser form values into the same typed operation draft shape before
  resolution

#### Scenario: Ordering stays direct operation input

- GIVEN generated ordering controls prepare a sparse rank move for an ordered
  result
- WHEN the user moves a row, list item, or tree placement
- THEN generated UI may continue to send the declared ordering patch value
  directly through the operation controller
- AND ordering moves do not require a generated authoring session unless a
  future operation form explicitly exposes user-authored ordering input fields

#### Scenario: Table controls bind operations directly

- GIVEN a generated table declares row update, delete, command, transition, or
  ordering controls
- WHEN the table model is selected
- THEN record mutation controls are selected only from the table's ordered
  `operations` bindings and placed by its one `operationControl` column
- AND table operation selection does not synthesize controls from otherwise
  available entity update, delete, command, or transition operations
- AND ordering controls require table ordering plus an explicit ordering-handle
  or operation-control placement
- AND edit dialogs, disabled reasons, destructive presentation, ordering menus,
  and reference-target editing remain presentation facts on the operation
  binding

#### Scenario: Table record links do not bind operations

- GIVEN a generated table renders a schema-declared `linkControl` for each row
- WHEN the table model and runtime projection select that control
- THEN the link comes from the containing table view's record-link registry
  rather than its operation bindings or the entity operation registry
- AND destination availability is derived from the current row, current
  referenced-record facts, and the structured record-link definition
- AND following the link does not call an operation controller, create shared
  execution state, report operation feedback, enqueue local auto-save, or send
  a write to Authority
- AND operation controls in the same row retain their existing operation keys,
  placement, availability, invocation, confirmation, progress, and feedback
  behavior

#### Scenario: State transitions read operation handler facts

- GIVEN a state-machine field exposes transition controls
- WHEN generated UI selects transition operation configs
- THEN the machine, transition, availability, input, and response handling come
  from operation-native transition handler facts
- AND operation handler helpers expose operation-native selection contracts
- AND generated UI selects transition controls from operation handler facts

### Requirement: Operations And Tree Composition

The system SHALL render schema operations through generated operation UI and
SHALL use relationship context and readiness facts to shape command inputs.

#### Scenario: Many-to-many selection operation

- GIVEN a selected join command operation uses an operation handler targeting a
  `manyToMany` relationship
- WHEN the user submits selected related records
- THEN explicit join records are created or removed
- AND generic field defaults fill other required through fields when join records are created

#### Scenario: Tree add and remove controls

- GIVEN a tree result declares allowed child variants and literal placement values
- WHEN the user opens the add child menu and submits a child
- THEN one child record and one placement edge are created
- AND leaf policy renders leaf children without descendants
- AND remove-placement controls tombstone placement edges without showing child delete controls on placement cards
- AND tree controls are selected from operation handler capability facts

### Requirement: State Machine Controls

The system SHALL render state-machine lifecycle facts from schema models and
shall invoke transition operations instead of directly patching machine-owned
status fields.

#### Scenario: Render state badges

- GIVEN a table, list, record, or detail surface includes an enum field owned by
  a state machine
- WHEN generated UI renders the field
- THEN the current state is displayed with the enum label and presentation
  metadata where available
- AND terminal states are visually distinguishable from active states

#### Scenario: Render valid transition controls

- GIVEN a generated surface renders a record with transition-state operation
  handlers
- WHEN the record's current state allows one or more transitions
- THEN generated UI renders controls for the valid transition operations
- AND a table renders those controls only when its operations binding and
  operation-control placement explicitly include them
- AND invalid transition operations are hidden or disabled with schema-derived
  reasons
- AND submitting a transition invokes the matching operation through the normal
  Authority operation boundary

#### Scenario: Render transition with side-effect creates

- GIVEN a transition-state operation declares create-only side effects
- WHEN generated UI selects row, list, record, or detail transition controls
- THEN the operation remains classified from its transition-state handler facts
- AND availability continues to reflect the record's current machine state
- AND invocation sends the target record id through the existing operation
  boundary
- AND committed or replayed command output exposes side-effect create record ids
  through normal generated operation result facts
- AND generated UI does not require a separate composite-operation control or
  infer automatic navigation to a created record

#### Scenario: Render table state transition menu

- GIVEN a generated table includes a visible enum field owned by a state machine
- AND the table explicitly binds record-scoped transition-state operations
  targeting that machine in its operation-control placement
- WHEN generated UI renders the state-machine field cell for a row
- THEN the cell displays the current state using the enum label and presentation
  metadata without an inline control
- AND the row's More options menu shows only explicitly bound transition
  operations valid for the current state
- AND selecting a transition invokes the matching operation through the normal
  Authority operation boundary with its availability, pending, confirmation,
  result, and effect behavior
- AND no transition control is synthesized from the visible state field or the
  entity operation registry

#### Scenario: Render record-detail state transition menu

- GIVEN a generated record-result detail includes a visible enum field owned by
  a state machine
- AND the record entity has record-scoped transition-state operations targeting
  that machine
- WHEN generated UI renders the state-machine field for the selected record
- THEN the current state is rendered as one field control using the enum label
  and presentation metadata
- AND opening the control shows only transition operations valid for the
  record's current state
- AND selecting a transition invokes the matching operation through the normal
  Authority operation boundary with its existing pending, confirmation, result,
  and effect behavior
- AND generated UI does not add a duplicate lifecycle action when the matching
  state-machine field is visible
- AND it may keep a separate lifecycle action when that field is hidden or
  absent from the record detail

#### Scenario: Protect machine-owned field editors

- GIVEN a generated create, edit, or detail surface includes a field owned by a
  state machine, or a table displays that field
- WHEN the surface renders existing records
- THEN generated UI treats the field as read-only outside transition controls
- AND create forms allow the initial state behavior declared by the schema

### Requirement: Reactive Instance Management Presentation Host

The system SHALL expose the product instance overview through complete
renderer-neutral management contracts on the stable application host while
runtime code owns control-plane reads, workspace gateway behavior, mutations,
navigation, and external effects.

#### Scenario: Project complete instance management presentation

- GIVEN an owner or instance admin opens `/settings/routes` on an eligible
  product instance shell
- WHEN generated runtime projects instance management presentation
- THEN a typed management manifest reference resolves one loading, failed, or
  ready management snapshot
- AND a ready snapshot carries the `Instance Settings` title, an ordered Routes
  generated-workspace manifest reference, and an optional local Push operation
  presentation
- AND Push presentation composes canonical operation control, progress, status,
  feedback, and optional external-authorization prompt facts
- AND Routes retains its existing workspace, section, result, field, create,
  and operation contract shapes rather than defining management-specific table
  contracts
- AND management snapshots contain no control-plane records, gateway clients,
  operation handlers, browser replica APIs, route objects, React nodes, runtime
  callbacks, raw logs, filesystem paths, provider credentials, or secrets

#### Scenario: Instance admin management navigation

- GIVEN an active principal has protected owner authority or the schema-defined
  Program `administrator` role
- WHEN the browser opens the active Program `routes` or `access` screen
- THEN the client management guard accepts the management route
- AND Routes and access-management presentation render through their
  existing operational API authorization
- AND owner setup, recovery, owner-role management, auth-origin policy, and
  admin-bearer recovery controls remain unavailable without owner authority

#### Scenario: Compose management and workspaces on the application host

- GIVEN an application shell host is active and the selected React route child
  renders instance management
- WHEN shell, management, or Routes workspace
  presentation changes
- THEN one application-host publication coordinator commits the complete next
  set of shell, management, and generated-workspace contract nodes
- AND each participating runtime contributes renderer-neutral nodes and current
  intent handlers without creating a nested host or replacing the stable host
  context
- AND server rendering seeds the selected instance route with its loading
  management snapshot before route-child effects run, and hydration replaces
  that same contribution atomically with current runtime state
- AND the combined publication retains identity for semantically unchanged
  nodes, notifies only changed reference scopes, and removes child references
  atomically with their parent references
- AND management composition does not move the selected React route child into
  shell contract data or change existing generated-workspace reference roles

#### Scenario: Dispatch management and nested workspace intents

- GIVEN a subscribed management renderer reads the management manifest and its
  referenced nodes from the application host
- WHEN the user starts Push, opens an external authorization URL, or interacts
  with Routes
- THEN controlled management interactions dispatch canonical intent envelopes
  carrying stable manifest, dialog, field occurrence, control, or prompt
  identity as applicable
- AND nested Routes interactions continue to dispatch their existing
  canonical generated-workspace intents through the same host
- AND runtime resolves every intent against its latest contributed state before
  changing drafts, invoking operations, opening a browser URL, polling gateway
  state, refreshing records, or navigating
- AND renderers do not call control-plane, gateway, browser, operation, or
  navigation effects directly

#### Scenario: Formless Renderer consumes management contracts

- GIVEN production instance management publishes complete renderer-neutral
  contracts for generated workspaces and workspace gateway controls
- WHEN runtime publishes the complete management contract graph
- THEN one subscribed Formless Renderer management entrypoint reads only
  contract references and snapshots, renders the referenced Routes workspace,
  and dispatches canonical intents
- AND application source consumes contracts and host behavior through
  documented `@dpeek/formless-presentation` exports and concrete rendering
  through documented `@dpeek/formless-renderer` exports
- AND production mounts management and the active Program `access` screen
  through the same root Formless Renderer application assembly

#### Scenario: Formless management renderer

- GIVEN runtime publishes complete production management contracts
- WHEN the selected renderer implements the contract in `lib/renderer`
- THEN pure and subscribed renderer entrypoints compose existing workspace,
  operation, progress, status, dialog, field, feedback, and empty-state
  primitives without importing generated runtime
- AND the renderer does not perform control-plane reads, use gateway
  clients, execute operations, run browser effects, or import runtime data
- AND the renderer receives theme and CSS only from root application assembly

#### Scenario: Instance management contract fixtures

- GIVEN runtime publishes complete production management contracts
- WHEN instance management UX is evaluated with package-local renderer fixtures
- THEN data-only memory-host fixtures cover loading, failed, empty, and
  populated Routes states, gateway unavailable, and Push idle, pending,
  success, failure, and authorization-required states
- AND an integrated fixture composes the management renderer as the route child
  of the application shell renderer through one memory host
- AND fixture reducers may simulate management and nested workspace intents
  without importing generated runtime, control-plane clients, gateway clients,
  storage, browser replica, operation controllers, routing, or browser effects
- AND fixtures contain no secrets or behavior that bypasses the canonical
  Presentation Host

### Requirement: Schema-Driven Instance Management UI

The system SHALL render instance management in the instance shell from
schema-owned route, deployment config, deployment observation cache, provider
evidence, view, screen, read model, and operation models.

#### Scenario: Instance management surface

- **GIVEN** the product instance shell renders instance management
- **WHEN** control-plane records are available
- **THEN** routes and deployment configs come from the instance control-plane
  schema
- **AND** latest deployment status comes from deployment config observation
  cache fields and read-only deployment projection
- **AND** active or latest local Push progress may come from exact Gateway Push
  state
- **AND** custom-domain desired route state and provider applied evidence remain
  visually separate

#### Scenario: Instance overview surface

- **GIVEN** an owner or instance admin opens `/settings/routes` on the product
  instance shell
- **WHEN** route, workspace gateway, deployment config,
  deployment observation, desired-state projection, and provider evidence data
  are available
- **THEN** the overview is titled `Instance Settings`
- **AND** the overview renders route management as a table-backed section
- **AND** route management uses the default route collection title, table, and
  `Create Route` control without route-category query tabs
- **AND** the overview renders one local workspace control, `Push`, only when
  the local workspace gateway proxy is available
- **AND** push completion or failure is shown as compact browser-owned status or
  alert feedback derived from exact outcome or failure codes instead of a
  workspace status panel
- **AND** the overview does not render deployment setup, deployment status,
  desired-state summaries, deployment operation controls, deployment config
  management tables, routes grouped by deployment config, primary instance
  target summaries, deployment target selectors, deployment target links,
  standalone workspace sync panels, workspace status panels, auto-save panels,
  local onboarding panels, overview navigation, brand eyebrow text, or
  standalone provider evidence cleanup panels
- **AND** deployment and provider runtime reads are not required to render the
  overview

#### Scenario: Workspace gateway state does not gate instance editors

- **GIVEN** route management data is ready
- **WHEN** local workspace gateway status is loading, unavailable, or failed
- **THEN** the Routes generated workspace remains available
- **AND** Gateway availability governs only the Push control and associated
  typed progress, browser-owned feedback, and current interaction
- **AND** an unavailable gateway omits or disables Push without presenting a
  management-level failure
- **AND** a failed Push may present concise browser-owned feedback selected from
  its semantic failure code
  without exposing raw gateway output, provider state, filesystem paths,
  credentials, or secrets

#### Scenario: Browser secret boundary

- **GIVEN** deployment management UI reads control-plane records or desired
  state
- **WHEN** browser responses are returned
- **THEN** Cloudflare API tokens, Alchemy passwords, Alchemy state tokens, raw
  lease tokens, and runtime secrets are not exposed to the browser

### Requirement: Actor-Safe Workspace Sync Operations

Generated UI SHALL render only workspace sync operations exposed to browser
actor kinds.

#### Scenario: Browser-visible operations

- GIVEN an owner or admin views workspace sync controls
- WHEN generated UI renders operations
- THEN it renders only the workspace push operation on the instance management
  surface
- AND standalone deploy, deploy plan, deploy apply, drift report, and provider
  runner operations are hidden from the browser surface
- AND workspace check, pull, credential setup, deployment refresh, and save are
  not Gateway operation contracts rather than hidden browser operation variants

#### Scenario: Read-only deployment observation

- GIVEN deployment config observation cache fields render
- WHEN generated UI displays deployment state
- THEN generated UI treats those fields as read-only runtime-observed cache
- AND generated UI does not require `deploy-attempt` or
  `deploy-evidence-summary` collection views

### Requirement: Routes Editor

The generated instance UI SHALL provide one editor experience for route records
that covers instance paths, host mappings, public Site routes, and redirects.

#### Scenario: Route list

- **GIVEN** owner or admin users inspect routes
- **WHEN** route records render
- **THEN** routes show match host, match path, match prefix, kind, target
  profile, surface, redirect target, and enabled state
- **AND** routes render as a single all-routes collection with the default
  `Create Route` control
- **AND** route management does not render route-category query tabs for
  enabled routes, mounts, host mappings, redirects, instance paths, or public
  Site routes
- **AND** route lifecycle timestamps may render only as read-only record metadata
  in surfaces that explicitly include them
- **AND** browser route management does not expose deployment config grouping,
  deployment config table columns, or target-selection controls

#### Scenario: Edit mount route

- **GIVEN** owner or admin users edit an allowed mount route field
- **WHEN** the edit is submitted
- **THEN** the editor validates route-safe match shape, reserved path
  conflicts, target profile, surface, and enabled-route uniqueness
- **AND** the browser editor omits deployment config selection so route writes
  use the primary deployment target by default

#### Scenario: Edit redirect route

- **GIVEN** owner or admin users edit a redirect route
- **WHEN** the edit is submitted
- **THEN** the editor validates match host, match path, redirect target, status
  code, preservePath policy, and preserveQueryString policy
- **AND** the redirect route does not select a Program storage target

#### Scenario: Evidence remains separate

- **GIVEN** provider evidence, cleanup history, deployment attempts, or provider
  observations exist for a route
- **WHEN** the route editor renders
- **THEN** desired route fields remain visually separate from provider evidence
  and cleanup state
- **AND** route edits do not imply provider changes
- **AND** deployment config observation cache fields may be displayed for status
  but are not editable route intent
- **AND** route lifecycle timestamps are system-owned metadata, not editable
  route intent

#### Scenario: Primary deployment target default

- **GIVEN** a browser owner or admin creates or edits a route that needs
  provider-managed DNS, custom-domain, or redirect resources
- **WHEN** the route write commits without a deployment config field
- **THEN** deployment projection uses the enabled primary instance deployment
  config
- **AND** browser UI does not expose multiple deployment targets, target ids,
  enabled target counts, or route-to-target assignment controls

### Requirement: Default Instance Control-Plane Surface

The product instance shell SHALL expose only the current purpose-built instance
management destinations while retaining control-plane records as Program data.

#### Scenario: Default instance destinations

- **GIVEN** the active default Program schema is materialized
- **WHEN** a Program administrator or protected owner opens the Instance group
- **THEN** the group contains Routes followed by Access
- **AND** Routes renders the schema-owned route editor and Access renders the
  runtime-owned purpose-built access-management surface
- **AND** deployment, principal, organization, invitation, policy, and instance
  settings records do not produce generated screens or navigation destinations
- **AND** `/deployments`, `/principals`, `/organizations`, `/invitations`,
  `/policies`, and `/settings` are not claimed as default Program screen paths
- **AND** those records remain available to their owning runtime behavior,
  archive, workspace, sync, projection, and purpose-built capability boundaries

#### Scenario: Sync controls stay local to workspace operations

- **GIVEN** the product instance shell renders in a local workspace runtime with
  gateway proxy status available
- **WHEN** workspace sync operations are available
- **THEN** only the `Push` control may render through the workspace operation
  controls
- **AND** route management and owner auth remain outside those controls
- **AND** deployment config records may exist as schema-owned intent, but the UI
  does not expose target selectors, enabled target counts, routes-by-target
  groupings, or raw generated `deployment-config` management tables

#### Scenario: Push progress may include internal deployment step

- **WHEN** a browser workspace operation displays push progress
- **THEN** exact Gateway phases are mapped in their declared order into the
  existing generated operation progress contract
- **AND** progress is presented as one Push with credentials, account selection,
  desired-state planning, optional provider reconciliation, health check, owner
  setup, workspace push/writeback, and observation refresh phases
- **AND** any deploy wording is scoped to an internal push step rather than a
  standalone command, route, operation, or destination
- **AND** Push progress maps into the same generic operation progress state used
  by other generated operations

### Requirement: Browser Workspace Operation Controls

Generated instance management UI SHALL expose local workspace push when a
workspace gateway proxy is available through the local runtime.

#### Scenario: Local workspace controls

- **WHEN** the product instance shell renders in a local workspace runtime with
  gateway proxy status available
- **THEN** the UI can start workspace push through the same-origin gateway API
  family
- **AND** the UI does not expose workspace check, pull, credential setup, or
  save controls on the instance overview
- **AND** the browser UI does not expose a user-triggered workspace save control
  because browser writes enqueue workspace auto-save
- **AND** CLI and local runtime save remain outside the browser as flush or retry
  fallbacks
- **AND** the Push control is selected from exact Gateway availability and actor
  capability rather than a generic browser operation-definition catalog
- **AND** the UI does not expose arbitrary filesystem path inputs or raw file
  read/write controls
- **AND** the UI does not receive or render the sidecar loopback URL or internal
  proxy token

#### Scenario: Push request facts

- **WHEN** the browser starts Push
- **THEN** it posts only exact mode and optional target alias fields
- **AND** force, workspace paths, credentials, account ids, commands, and
  generic operation inputs are unavailable
- **AND** exact Gateway Push state is mapped to generic generated operation
  progress before it reaches generated view primitives

#### Scenario: Operation status display

- **WHEN** current or latest Push is running or terminal
- **THEN** the UI can display compact pending, completion, replay, and failure
  feedback derived from exact lifecycle, outcome, phase, and failure-code facts
- **AND** pending feedback describes the active push progress step when one is
  available instead of showing only an indefinite spinner
- **AND** failure feedback uses browser-owned fixed copy for the failure code
- **AND** the instance overview does not require a separate workspace progress
  panel to render push progress or failure state
- **AND** provider credentials, local secret values, raw provider state, and
  disallowed filesystem paths are not rendered

#### Scenario: Rediscover current or latest Push

- **WHEN** the instance shell loads or refreshes with Gateway available
- **THEN** it consumes current and latest Push from the Gateway status response
  and stores the delivered owner-session CSRF token for later mutations
- **AND** current Push resumes polling and progress projection without starting
  duplicate execution
- **AND** latest terminal Push restores compact outcome or failure feedback

#### Scenario: External authorization prompt

- **WHEN** current Push reports an `external-authorization` interaction through
  the local runtime Gateway proxy
- **THEN** the UI can render a control to open that URL and continue polling the
  operation
- **AND** raw adapter or tool output, provider tokens, refresh tokens, Alchemy
  passwords, and local secret values are not rendered

#### Scenario: Account selection prompt

- **WHEN** current Push reports an `account-selection` interaction
- **THEN** the UI renders only the bounded account choices returned for that
  interaction and submits its id with the selected account id
- **AND** stale Push or interaction state is rediscovered through Gateway status
- **AND** account selection does not accept free-form provider ids

#### Scenario: Gateway proxy unavailable

- **WHEN** the product instance shell renders without local gateway proxy status
  available
- **THEN** the UI treats Push as unavailable
- **AND** it does not offer controls that would imply workspace filesystem,
  credential setup, push dry-run, or push apply execution is available

### Requirement: Local Workspace Onboarding UI

Generated instance management UI SHALL support onboarding a CLI-bootstrapped
local workspace from the browser.

#### Scenario: Save after browser edits

- **WHEN** a browser owner or admin edits route, domain, or deploy intent records
- **THEN** the UI enqueues workspace auto-save through the gateway after the
  Authority-backed write commits
- **AND** the saved workspace source is generated from Authority-backed records,
  not from manifest app, route, domain, or deploy fields
- **AND** the UI does not expose a separate user-triggered save control for the
  same committed browser edit

### Requirement: Onboarding Form Reuse

Generated instance management UI SHALL reuse generated field and validation
behavior for onboarding steps that write schema records.

#### Scenario: Onboarding record form

- **WHEN** a browser onboarding step creates or edits route or deployment
  config records
- **THEN** field rendering reuses generated create/edit field controls, field
  editor selection, defaults, `visibleWhen`, and union variant behavior where
  the step is backed by schema view facts
- **AND** submit behavior writes through Authority-backed operations so
  Authority validation remains the source of record validation
- **AND** onboarding-specific React code does not duplicate schema field
  validation rules

#### Scenario: Gateway operation step

- **WHEN** an onboarding step starts workspace push
- **THEN** the step invokes the workspace gateway operation model and renders
  display-safe completion or failure feedback
- **AND** push apply completion may refresh displayed deployment config
  observation cache fields after the authorized cache patch commits
- **AND** schema field controls are used only for schema-record inputs, not for
  arbitrary filesystem paths, credentials, raw provider state, or shell output
- **AND** local dev browser onboarding does not present a workspace
  initialization control because fresh workspace bootstrap is completed by the
  CLI before the runtime starts

#### Scenario: Future schema-defined setup flows

- **WHEN** app-specific setup flows such as a newly installed Site app template
  flow are considered in a later change
- **THEN** the existing onboarding UI structure keeps step orchestration
  separate from generated field rendering and operation submission
- **AND** this change does not add a schema-declared onboarding or setup-flow
  language

### Requirement: Document Theme Renderer Contract

The system SHALL present application document theme policy and mode through a
controlled renderer-neutral Presentation contract while the application runtime
retains preference storage, system-mode resolution, browser bootstrap, and
document effects.

#### Scenario: Project controlled document theme

- **GIVEN** a top-level application surface uses the application theme policy
- **WHEN** the application runtime prepares theme presentation for a renderer
- **THEN** it projects a stable document-theme identity, selected preference,
  resolved light or dark mode, ordered display-safe options, and canonical
  mode-selection intents through contract types owned by `lib/presentation`
- **AND** application preference modes are `system`, `light`, or `dark`
- **AND** absent stored preference defaults to `system`
- **AND** the preference is app-wide and is separate from the public Site theme
  contract and Site-owned public theme storage
- **AND** theme selection is a presentation intent rather than an app-schema
  operation, mutation, action execution, or Authority write
- **AND** the top-level workspace package imports the contract through an
  explicit `@dpeek/formless-presentation` contract subpath rather than defining
  a parallel runtime contract or deep-importing package source

#### Scenario: Runtime behavior stays outside the contract renderer

- **GIVEN** a renderer receives a document-theme snapshot and selection intent
- **WHEN** it renders or dispatches the control
- **THEN** the snapshot contains no cookie names, storage adapters, browser
  media-query APIs, document mutation callbacks, React nodes, presentation class
  names, renderer component props, or renderer-specific state
- **AND** application runtime owns local preference persistence, system-mode
  resolution, pre-mount browser bootstrap, document markers, and document-root
  side effects
- **AND** application runtime has no SSR theme path
- **AND** a fixed surface can override the active mode without requiring the
  renderer contract to erase or replace any separately owned user preference

#### Scenario: Formless Renderer consumes the theme contract

- **GIVEN** production mounts the Formless Renderer application assembly
- **WHEN** the top-level workspace supplies a document-theme contract
- **THEN** the Formless Renderer theme entrypoint renders only the projected
  active mode and control and dispatches canonical mode-selection intents
- **AND** the renderer does not own policy selection, preference storage,
  system-mode resolution, browser bootstrap, or document initialization
- **AND** one root `FormlessThemeProvider` wraps application shell and no-shell
  routes, while shell and leaf renderers consume theme facts without mounting a
  second provider
- **AND** root application assembly owns the document-level toast surface

#### Scenario: Apply the resolved application theme before mount

- **GIVEN** the application document starts before React mounts
- **WHEN** runtime resolves the stored `system`, `light`, or `dark` preference
- **THEN** it applies one resolved light or dark data marker and matching
  `color-scheme` to the document before rendering the application
- **AND** changes to stored preference or system color scheme update the marker,
  `color-scheme`, provider value, and document-theme contract coherently
- **AND** system, light, and dark fixtures exercise the same contract through
  the reusable memory host

### Requirement: Application System-State Presentation Contract

The system SHALL present top-level application loading, empty, missing,
unavailable, blocked, and failure states through renderer-neutral contracts
while route and runtime foundations retain state selection and effects.

#### Scenario: Project residual application states

- GIVEN an application route cannot yet render a shell, management surface,
  auth surface, access surface, or generated workspace contract
- WHEN runtime selects its top-level loading, empty, missing, unavailable,
  blocked, or failure state
- THEN it publishes one complete immutable system-state snapshot with stable
  identity, state kind, presentation-ready heading, message, ordered facts,
  feedback, and available retry, continuation, or navigation intents
- AND runtime owns route matching, owner and session checks, schema loading,
  package capability checks, retry effects, navigation, and semantic failure
  projection
- AND the snapshot contains no storage clients, route callbacks, raw errors,
  React nodes, presentation class names, or renderer-specific props

#### Scenario: Keep system-state projection renderer neutral

- GIVEN browser runtime has selected fixed copy or intentional display data for
  an application state
- WHEN it projects the application system-state contract
- THEN the projection composes those values without inspecting, rewriting, or
  regex-redacting their text
- AND transport and route boundaries must reduce failures to closed semantic
  codes before projection
- AND validated user-authored names, labels, and email addresses remain direct
  presentation data while arbitrary exception, parser, storage, provider, path,
  command, and log text remains unavailable

### Requirement: Browser-Owned Failure Presentation

Formless browser runtime SHALL convert semantic transport, domain, and local
effect failures into fixed presentation copy before publishing Presentation
contracts.

#### Scenario: Project browser failures

- GIVEN Gateway, instance auth, identity access, Program runtime, generated
  operation, media, or replica behavior fails
- WHEN browser route or controller state records the failure
- THEN it records a closed capability- or route-owned failure code and bounded
  semantic data rather than an arbitrary message
- AND the owning browser projection selects fixed title, detail, status, retry,
  and action copy for that code
- AND Presentation and Renderer contracts receive only the resulting copy and
  intentional display data, not the code, exception, response body, diagnostic,
  path, command, log, provider output, or generic result

#### Scenario: Preserve typed operation output internally

- GIVEN a generated Authority operation commits or replays
- WHEN generated runtime needs affected counts, created record ids, record-plan
  steps, or typed materialized changes for browser behavior
- THEN it consumes the typed operation invocation output internally
- AND runtime adapters do not add unrelated generic output objects to browser
  operation results
- AND no operation output object enters a Presentation or Renderer contract

#### Scenario: Formless Renderer covers every selected application state

- GIVEN production root assembly mounts the Formless Renderer
- WHEN any application route or top-level runtime state renders
- THEN shell, management, auth, access, generated workspace, tree, list, table,
  record, field, create, operation, and residual system-state presentation all
  enter through the same renderer assembly
- AND each surface consumes its renderer-neutral contract and dispatches its
  canonical intents while runtime retains state, policy, and effects

### Requirement: Formless Renderer Application Assembly

The system SHALL mount one complete Formless Renderer application assembly at
production roots while runtime foundations retain data, state, policy, effects,
routing, and stable Presentation Host ownership.

#### Scenario: Root assembly selects presentation once

- GIVEN the browser application root assembles production presentation
- WHEN shell and no-shell routes mount
- THEN one `FormlessApplicationRenderer` receives
  `FormlessApplicationPresentation` and supplies shell,
  management, auth, access, generated workspace, tree, list, table,
  record-result, field, create, operation, theme, and system-state entrypoints
- AND route foundations and contract publishers do not import or choose between
  renderer implementations
- AND the selected renderer consumes the existing stable host, scoped
  references, immutable snapshots, intent handlers, and React route child
  without moving runtime state or effects into `lib/renderer`
- AND root assembly obtains the implementation from documented
  `@dpeek/formless-renderer` package subpaths

#### Scenario: Application roots own provider and navigation integration

- GIVEN the Formless Renderer application assembly is active
- WHEN application root behavior is installed
- THEN `application-renderer-root` exports `ApplicationRendererRoot` and mounts
  one `FormlessApplicationRendererProvider`, application CSS boundary, StyleX
  integration, toast surface, document-theme controller, and navigation adapter
  across shell and no-shell routes
- AND the navigation adapter intercepts eligible same-origin primary link
  activation and preserves modified clicks, downloads, external origins,
  unsupported targets, hash-only navigation, and explicit opt-out behavior
- AND application shell renderers do not mount a nested theme provider or own
  document navigation effects
- AND public Site browser and Worker roots use their separate public provider,
  CSS, navigation, and theme assembly

#### Scenario: Production roots load renderer assets

- GIVEN production application and public Site entrypoints are built
- WHEN their renderer dependencies and emitted assets are assembled
- THEN application roots load the Formless Renderer application provider and
  CSS while public roots load its public Site provider and CSS
- AND the build applies the StyleX integration required by
  `@dpeek/formless-renderer`
- AND storage, auth, Site projection, public forms, routes, and operations remain
  outside renderer asset assembly

### Requirement: Generated Presentation Verification Boundaries

The system SHALL verify generated presentation at the owning runtime projection,
Presentation Host, Formless Renderer, and production assembly boundaries without
repeating the same behavior through multiple concrete render paths.

#### Scenario: Runtime verification stops at presentation contracts

- GIVEN Formless runtime owns route and model selection, projection, state,
  intent resolution, and effects
- WHEN generated application behavior is verified in `lib/formless`
- THEN verification asserts selected runtime targets, projected contracts,
  Presentation Host publications, canonical intent resolution, and runtime
  effects
- AND it does not assert concrete Formless Renderer markup, Astryx component
  output, renderer-private data attributes, or renderer layout
- AND a React mount harness may exercise runtime publication or lifecycle
  behavior only when the observed result remains a contract, host publication,
  intent, or runtime effect

#### Scenario: Renderer verification maps contracts to user-visible DOM

- GIVEN the Formless Renderer consumes a complete projected contract
- WHEN renderer behavior is verified in `lib/renderer`
- THEN verification uses the production renderer with real Astryx components
  and asserts user-visible DOM, accessibility semantics, controlled values and
  state, and exact canonical intent dispatch
- AND it does not replace Astryx components or adjacent production renderer
  leaves with module mocks or stand-in components
- AND fixture catalog completeness, fixture reducer behavior, private data
  attributes, exact Astryx component variants, and Astryx library behavior are
  not independent Formless Renderer requirements
- AND public Site session validation, challenge, request, retry, and outcome
  behavior remains verified at the Site-owned session boundary while renderer
  verification covers the mapping from projected Site session facts to DOM

#### Scenario: Production assembly verification uses real artifacts

- GIVEN application and public Site roots integrate Formless runtime, package
  adapters, and the Formless Renderer
- WHEN their assembly or dependency separation is verified
- THEN one focused integration at each distinct production root uses actual
  render, SSR, build, or package output
- AND source-text assertions, absent-file assertions, exact dependency-version
  assertions, and duplicated hand-built import graphs do not substitute for the
  production integration
