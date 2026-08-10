# Site Runtime Specification

## Purpose

Site runtime turns flat Site records into authorable Program surfaces, nested
public trees, authenticated Program previews, and public documents for mapped
and published Program Site targets.

## Requirements

### Requirement: Site Records

The system SHALL model each Site as a flat aggregate rooted by one Site record
while all Site records remain in the selected Program Authority storage
identity.

#### Scenario: Site record owns settings and public roots

- GIVEN an active Site record exists
- WHEN Site settings or public roots are selected
- THEN that record provides editable key, label, description, icon value, and
  theme values
- AND optional `home`, `header`, and `footer` references select blocks owned by
  the same Site
- AND a Site may exist without one or more public roots while it is being
  created or repaired

#### Scenario: Content records have Site ownership

- GIVEN page, post, project, block, and placement records exist
- WHEN those records are stored
- THEN every block stores one required Site reference
- AND block placement records stay flat with parent and child block references
- AND placement Site scope is derived from its endpoints rather than duplicated
  on the placement record

#### Scenario: Validate Site aggregate invariants

- GIVEN Site, block, and block placement records are validated
- WHEN the selected Site record adapter evaluates the candidate Program records
- THEN Site home, header, and footer blocks must belong to that Site and have
  the corresponding page, header, and footer block types
- AND placement parent and child blocks must belong to the same Site
- AND internal block targets must belong to the source block's Site
- AND invalid cross-Site references reject the complete write before commit

### Requirement: Explicit Site Starter Operation

The Site schema SHALL declare an explicit collection-scoped
`site.createStarter` command that creates one useful Site aggregate without
making schema composition or bootstrap mutate Program records.

#### Scenario: Create starter Site through a record plan

- GIVEN an authorized caller invokes `site.createStarter` with no operation
  input
- WHEN Authority materializes its declarative record plan
- THEN the plan creates one valid, editable Site aggregate from ordinary Site
  records
- AND the created records satisfy the Site aggregate invariants
- AND the command output identifies every committed plan step

#### Scenario: Starter creation is one atomic invocation

- GIVEN `site.createStarter` has begun materialization
- WHEN a generated value, reference, record value, Site invariant, or placement
  invariant fails validation
- THEN no starter record or sync change is committed
- AND replaying one successful idempotency key returns its stored output without
  duplicate records
- AND a new idempotency key is a new intentional Site creation rather than an
  ensure, upsert, or reconciliation request

#### Scenario: Starter records have ordinary lifecycle

- GIVEN starter creation commits
- WHEN authors edit, archive, snapshot, export, restore, or delete its records
- THEN those records behave as ordinary user-owned Program records
- AND no starter provenance, definition version, reconciliation state, or
  automatic update behavior is stored
- AND changing the schema declaration or starter record plan affects only
  future invocations
- AND source bootstrap, compatible schema refresh, workspace load, archive
  restore, and snapshot restore do not invoke the operation

#### Scenario: Reuse the canonical operation across callers

- GIVEN generated Site presentation, trusted CLI or automation, or custom UI can
  submit a Program operation invocation
- WHEN it invokes `site.createStarter`
- THEN every caller uses the same declared input, effect, authorization,
  idempotency, audit, output, and committed record behavior
- AND no caller-specific starter endpoint or hidden bootstrap path is required

### Requirement: Reusable Site Schema Modules

The Site package SHALL declare its Site-owned App schema in package-local
TypeScript and expose independently selectable core and contact-intake
presentation declarations through a documented schema authoring subpath.

#### Scenario: Import Site schema authoring

- GIVEN trusted TypeScript composition needs Site declarations
- WHEN it imports `@dpeek/formless-site-app/schema`
- THEN the package exports `siteRecordSchemaModule`,
  `sitePresentationSchemaModule`,
  `siteContactIntakePresentationSchemaModule`, and the complete
  `siteSchemaSource`
- AND the record module owns the `site`, `block`, and `block-placement`
  entities with their stable entity ids, fields, constraints, operations,
  relationships, union, and queries
- AND the core presentation module depends only on Site records and owns Site
  content item views, table views, views, and screens
- AND the optional contact-intake presentation module depends explicitly on
  the standard inquiry and contact-subscription modules and owns the Site
  contact-message and subscriber projections
- AND Site form blocks, public operation binding, copy, placement, and public
  projection remain Site-owned schema and runtime behavior
- AND consumers do not deep-import Site package source files

#### Scenario: Compose the named complete Site schema

- GIVEN package-local TypeScript is authoritative for the named complete Site
  schema
- WHEN the named complete Site source is composed
- THEN the complete source explicitly composes the standard inquiry and
  contact-subscription modules before Site records and the dependent Site
  presentation modules
- AND the complete TypeScript source parses through the normal App schema
  contract
- AND public Site runtime consumes the complete data-only Program artifact
  rather than the named Site source or workspace TypeScript

#### Scenario: Site schema publication remains runtime neutral

- GIVEN the Site package publishes its schema modules and named complete source
- WHEN the authoring boundary is consumed or packaged
- THEN the package declarations do not select a Program, Authority, route,
  replica, archive, workspace, or CLI behavior by themselves
- AND a downstream Program may select Site content without standard contact
  intake or may select the named complete Site source as a prewired recipe
- AND the downstream Program root may compose and specialize those declarations
  without moving Site or standard domain ownership into core runtime

### Requirement: Program-Native Site Aggregates

The default Formless Program SHALL compose the built-in Site domain in Program
Authority while Phase 1 generated administration and public routing select
exactly one active Site aggregate.

#### Scenario: Compose Program-native Site records

- GIVEN the default Program composition imports the package-owned Site modules
- WHEN its materialized schema is selected
- THEN all three Site-owned entities and any separately selected standard
  contact-intake entities share storage identity
  `instance:control-plane`, schema key `formless-program`, the Program record-id
  namespace, cursor, change log, snapshot boundary, browser replica, and
  content-free invalidation WebSocket
- AND no composite record identity, built-in Site workspace identity, or second
  built-in Site storage identity is introduced
- AND the runtime does not discover, import, merge, or migrate Site records,
  cursors, changes, operation histories, media provenance, archives,
  workspaces, replicas, or provenance from legacy `app:<installId>` storage

#### Scenario: Validate Site-owned records through selected ownership

- GIVEN active or tombstoned Program records use any of the three stable Site
  entity ids
- WHEN Program validation or reviewable canonicalization runs
- THEN generic Program schema validation remains responsible for field,
  reference, unique, delete-blocker, stable-entity, and record-id constraints
- AND the explicitly selected Site record adapter owns Site aggregate invariants
  for the three stable Site entity ids
- AND Site-specific public projections, rendering, and side effects remain
  separate explicitly selected runtime capabilities

#### Scenario: Program specializes Site presentation and access

- GIVEN the standalone Site presentation contains paths that conflict with the
  default Program
- WHEN the Program root composes Site
- THEN deliberate same-key replacements mount Site at `/site`,
  `/site/settings`, `/site/contacts`, and `/site/subscribers`
- AND Site screens require Program `member` access and appear once in Program
  navigation
- AND `site.createStarter`, `site.update`, `block.create`, `block.update`,
  `block.delete`,
  `block-placement.create`, `block-placement.update`,
  `block-placement.addTreeChild`, and
  `block-placement.removeTreePlacement` require Program `editor` access
- AND selected standard `email-address.update`, `audience.update`, and
  `subscription.update` operations require Program `editor` access through
  deliberate complete Program replacements
- AND selected standard `contact-message.submit` and
  `subscription.subscribe` operations retain their anonymous public policies
  without receiving top-level Program role access

### Requirement: Public Tree Projection

The system SHALL project one selected Site's live block and block placement
records into a nested public tree ordered by placement order and grouped by
placement slot.

#### Scenario: Page tree renders children

- GIVEN a selected Site references a live page block with child placements
- WHEN the public tree is requested for the page route
- THEN the response contains the page root and its child block nodes
- AND default-slot child placements appear in placement order
- AND blocks owned by another Site are excluded

#### Scenario: Invalid structure warns

- GIVEN tree projection encounters missing children, cycles, duplicate roots, or maximum-depth cuts
- WHEN the public tree is built
- THEN the response includes metadata warnings
- AND page rendering is not blocked only because warnings exist

#### Scenario: Dynamic list blocks

- GIVEN `postList` or `projectList` blocks exist in a public tree
- WHEN the tree is projected
- THEN live dated post or project items are attached under query output
- AND items are ordered by descending date

### Requirement: Program Site Runtime Adapter

The system SHALL select Site-specific public runtime behavior through explicit
browser and Worker runtime composition and the one Program storage target.

#### Scenario: Adapter owns public tree behavior

- GIVEN a public Site runtime target selects the active Program
- WHEN the runtime receives a public tree read for that target
- THEN the runtime dispatches to the explicitly selected Site public-read
  adapter
- AND the adapter builds the public tree from flat app records and placement
  edges in Program storage identity `instance:control-plane`
- AND schema key `formless-program` and the complete Program source hash are the
  public Site target provenance

#### Scenario: Adapter owns public document behavior

- GIVEN a mapped host or published Site profile selects the Program public Site
  runtime target
- WHEN the runtime handles a public document, metadata, indexing, or root icon
  request for that target
- THEN Worker dispatch selects the explicitly composed Site Worker surface
- AND the adapter supplies document rendering, metadata, sitemap, robots, SVG
  icon, PNG icon, and ICO icon behavior
- AND request routing, route access, Program storage identity, and core media
  delivery remain owned by Formless core runtime boundaries
- AND every mapped and published target uses Program storage identity
  `instance:control-plane`

#### Scenario: Resolve the explicitly composed Site target

- GIVEN mapped-host or published rendering selects the Site surface
- WHEN its public runtime target is resolved
- THEN it uses the Site adapter explicitly selected by the default or downstream
  Worker composition with Program storage identity
  `instance:control-plane`
- AND Program route policy and the selected Site adapter supply the complete target

#### Scenario: Compose Site behavior by runtime target

- GIVEN a trusted Program composition includes Site executable behavior
- WHEN local development or deploy builds browser and Worker outputs
- THEN Site browser readiness and hydration, Worker public reads, document
  rendering, metadata, indexing, icons, and after-commit notification behavior
  are selected through explicit target entries
- AND any standard contact-subscription operation adapter required by the
  selected Program schema is supplied separately by shared runtime composition
- AND Site-owned target adapters are imported through documented
  `@dpeek/formless-site-app/runtime/browser` and
  `@dpeek/formless-site-app/runtime/worker` subpaths where those adapters live
- AND the browser and Worker entries receive the same complete data-only Program
  artifact and canonical provenance
- AND omitting Site schema and runtime entries omits Site executable code and
  public Site build inputs
- AND Worker request handling does not evaluate workspace TypeScript or discover
  a Site adapter dynamically

### Requirement: Program-Owned Site Preview Mounts

The Site package SHALL expose stable browser and Worker preview mount identities
whose final paths and access requirements are owned by the complete Program
schema.

#### Scenario: Compose the default preview mounts

- GIVEN the default Program composes the Site schema and its trusted browser and
  Worker runtime surfaces
- WHEN the Program schema is materialized
- THEN stable mount key `site.preview.browser` selects browser delivery at
  `/site/preview` with `authenticated` access
- AND stable mount key `site.preview.worker` selects Worker delivery at
  `/site/public` with `authenticated` access
- AND `public` names the public Site renderer rather than anonymous access
- AND a downstream Program may replace the mount module by its module key while
  preserving each stable mount key and target and selecting another valid path
  or access requirement
- AND browser and Worker runtime composition bind the existing Site public
  surface by stable mount identity rather than by either default path

#### Scenario: Render browser preview from the Program replica

- GIVEN the instance profile admits an authenticated request for the materialized
  `site.preview.browser` mount
- WHEN the browser opens the mount root or a nested path
- THEN the Site public renderer reads the live Program replica and uses the same
  Program records, media references, storage identity, cursor, and invalidation
  connection as ordinary Program screens
- AND a local Vite runtime may update the preview through its normal hot-module
  replacement behavior without a separate runtime profile or preview data copy
- AND a deployed instance may serve the same browser preview without implying
  local hot-module replacement availability

#### Scenario: Render Worker preview from Program storage

- GIVEN the instance profile admits an authenticated `GET` or `HEAD` request for
  the materialized `site.preview.worker` mount
- WHEN the Worker renders the preview document
- THEN it resolves the same Site page tree and core media from current Program
  Authority storage through the explicitly composed Site Worker surface
- AND it uses the public Site renderer without selecting anonymous published
  Site route policy, public indexing resources, or a second Site target
- AND public client hydration receives the resolved mount base and page slug so
  browser and Worker route interpretation agree

#### Scenario: Resolve preview roots and nested slugs

- GIVEN either Site preview mount has materialized path `base`
- WHEN a request targets exact `base`, `base/`, or a nested segment-boundary path
- THEN exact `base` and `base/` resolve the Site home page directly
- AND the suffix below `base` resolves the normal Site page slug
- AND no synthetic home redirect or literal default path participates in
  resolution

#### Scenario: Generate links relative to the selected Site route base

- GIVEN the Site public renderer is selected for browser preview, Worker
  preview, mapped public Site, or published Site delivery
- WHEN it resolves a canonical Site href for navigation or active-route state
- THEN stored Site hrefs remain root-relative Site paths
- AND preview links prepend the matched materialized mount path
- AND mapped and published Site links use their top-level public route base
- AND link generation, route matching, SSR, and hydration consume the same
  explicit route base rather than infer one from runtime profile or a literal
  prefix

#### Scenario: Keep Worker preview private and unindexed

- GIVEN Worker Site preview returns a document, not-found result, or rendering
  failure
- WHEN response policy is applied
- THEN the response uses `Cache-Control: private, no-store`
- AND it supplies `Vary: Accept, Cookie`
- AND it supplies `X-Robots-Tag: noindex, nofollow, noarchive`
- AND preview delivery does not expose sitemap, robots, or root-icon subroutes
  below the mount
- AND preview metadata does not derive canonical or OpenGraph URLs from the
  preview origin unless an independent published canonical target is known

### Requirement: Workspace Site Renderer Extension

The system SHALL compose one explicitly supplied built-in Site public page
renderer with an optional trusted workspace override without changing Site
records, public tree projection, routes, media delivery, or public action
storage contracts.

#### Scenario: Renderer input stays projection based

- GIVEN a workspace declares a `site.publicRenderer` extension
- WHEN mapped-host or published Site rendering needs a
  public page body
- THEN the extension renderer receives the canonical `SitePublicRendererProps`
  contract owned by the Site package
- AND the contract contains the projected `SitePageTree`, link mode, and route
  base needed to produce public links
- AND active navigation derives from projected route and resolved link facts
  rather than an additional browser-location or `currentPath` input
- AND the renderer does not receive raw Authority storage internals, browser
  replica internals, private Turnstile secrets, provider credentials, or app
  install records as renderer input

#### Scenario: Renderer output stays page scoped

- GIVEN a workspace renderer is active
- WHEN Worker SSR renders a successful public Site document
- THEN the workspace renderer returns a React page element or component output
  for the public page body
- AND Formless remains responsible for the HTTP `Response`, document shell,
  cache headers, runtime metadata hints, initial tree hydration script, client
  asset injection, default metadata, not-found documents, and error documents
- AND the first renderer extension contract does not allow workspace code to
  return a complete HTML document or `Response`

#### Scenario: Browser and Worker entrypoints are explicit

- GIVEN a workspace configures `site.publicRenderer`
- WHEN the runtime builds public Site client assets and the deployed Worker
  bundle
- THEN the config supplies explicit browser and Worker renderer entrypoints
- AND both entrypoints may re-export the same shared renderer component
- AND each entrypoint exports the renderer component as a default export or
  named `SitePublicRenderer` export
- AND the browser entrypoint is treated as public client asset code
- AND the Worker entrypoint is treated as trusted owner-authored deploy code
- AND the browser entrypoint shares the public Site client's React and React DOM
  runtime instances so renderer hooks participate in the active render
- AND renderer StyleX authoring calls are compiled out of both browser and
  Worker outputs before either output executes
- AND server-only imports, Worker bindings, runtime secrets, and provider
  credentials do not enter the browser renderer bundle

#### Scenario: Built-in renderer selection is explicit

- GIVEN root browser or Worker assembly configures a Site runtime adapter
- WHEN mapped-host or published Site rendering runs
- THEN the assembly supplies one required built-in page renderer
- AND an optional workspace `site.publicRenderer` takes precedence over that
  built-in renderer for successful public pages
- AND browser hydration and Worker SSR use the same selection rule and canonical
  renderer props
- AND Site adapter selection modules do not import a concrete built-in renderer
  implementation
- AND production root assembly explicitly supplies the Formless Renderer
  `FormlessSitePageRenderer` exported by `@dpeek/formless-renderer`

#### Scenario: Renderer fixture input stays projection shaped

- GIVEN a public Site renderer fixture or prototype exercises public page
  rendering behavior
- WHEN it renders Site content outside the generated admin shell
- THEN its fixture input is the canonical projected `SitePageTree` and
  `SitePublicRendererProps` contract imported from the Site package
- AND the fixture can include Site settings, SVG icon source, header and footer
  frame roots, page/root block placements, media delivery facts, tree warnings,
  and projected public operation facts
- AND it does not use raw Authority storage records, app install records,
  browser replica state, generated admin route state, provider credentials, or
  private challenge secrets as renderer input

### Requirement: Public Site System-State Renderer Contract

The system SHALL isolate public Site loading, not-found, and failure
presentation behind renderer-neutral Site-owned contracts while retaining
browser and Worker runtime ownership of state selection and document behavior.

#### Scenario: Browser system states use an explicit renderer

- GIVEN public Site route loading, not-found, or failure state is selected in
  the browser
- WHEN the public Site client renders that state
- THEN root assembly supplies one built-in system-state renderer that receives
  only state kind and display-safe presentation facts
- AND production root assembly explicitly supplies the Formless Renderer
  `FormlessSiteSystemStateRenderer`
- AND the workspace page-renderer extension does not replace browser
  system-state presentation

#### Scenario: Worker system states preserve document ownership

- GIVEN Worker public Site rendering resolves a not-found or error result
- WHEN the Worker produces the public document
- THEN it uses the explicitly supplied built-in system-state renderer for the
  display-safe page body
- AND the Worker retains ownership of HTTP status, headers, document shell,
  metadata, cache policy, runtime hints, and client assets
- AND the workspace page-renderer extension remains scoped to successful page
  bodies and cannot return a not-found document, error document, or `Response`

### Requirement: Formless Public Site Renderer

The system SHALL provide a complete Formless Renderer implementation of the
canonical Site page and system-state renderer contracts through
`@dpeek/formless-renderer` and mount it as the production built-in renderer.

#### Scenario: Renderer covers shipped public Site presentation

- GIVEN canonical projected Site fixtures exercise public Site rendering
- WHEN the Formless Renderer renders those fixtures in browser and Worker builds
- THEN it renders header and footer frames, page and post layouts, every shipped
  public block, route-aware links, source SVG icons, core media and missing-media
  states, content lists and summaries, fixed public forms, generic public
  operation forms, loading, not-found, and failure states
- AND it follows the renderer's layout, typography, navigation, responsive,
  form, and feedback conventions through package-owned presentation and styling
- AND it consumes canonical Site contracts and public helpers through documented
  Site package exports instead of duplicate projection or renderer types

#### Scenario: Renderer is selected at public roots

- GIVEN the Formless Renderer page and system-state implementations are
  exported through documented `@dpeek/formless-renderer` package subpaths
- WHEN production browser and Worker entrypoints are built
- THEN root assembly imports and supplies `FormlessSitePageRenderer` and
  `FormlessSiteSystemStateRenderer`
- AND public browser and Worker roots integrate
  `FormlessSiteRendererProvider`, the package's StyleX integration, and its CSS
  boundary atomically while preserving workspace renderer precedence

#### Scenario: Site package is renderer neutral

- GIVEN the Site package public exports and source graph are inspected
- WHEN production roots compose the built-in public page and system-state
  presentation
- THEN the Site package supplies renderer-neutral contracts, route hosts,
  public form sessions, theme behavior, and browser and Worker adapters
- AND built-in page and system-state presentation comes only from the renderer
  supplied by production roots
- AND it does not depend on `@dpeek/formless-renderer` or another presentation
  implementation

### Requirement: Subscribe Form Public Tree Projection

The system SHALL project subscribe form blocks into public Site trees against
the complete active Program without exposing private challenge or runtime
secrets.

#### Scenario: Project subscribe form operation facts

- GIVEN the public Site tree includes a `subscribeForm` block
- WHEN the block references a publicly executable operation in the active
  Program
- THEN the projected block includes the operation key and target public operation route
- AND the referenced operation is a public-eligible create, record-plan, or
  subscribe operation handler
- AND the target public operation route is built through the shared public
  operation route contract from the Program API route prefix, entity key, and
  operation key
- AND the Program-native source target records target kind `program`, schema key
  `formless-program`, and API prefix `/api/formless/program` without package or
  install provenance
- AND subscribe-specific operation eligibility, operation binding warnings, and
  projected route facts are owned by the Site subscribe public operation adapter
- AND generic public operation input field projection is not used to render the
  subscribe-specific email input
- AND the projected block does not include Turnstile secrets or subscriber data

#### Scenario: Warn for missing public operation

- GIVEN a `subscribeForm` block references an operation that is missing, not
  publicly executable, or unavailable in the active Program
- WHEN the public tree is projected
- THEN the public tree includes a warning
- AND public rendering does not expose a working form for that block

### Requirement: Contact Form Public Tree Projection

The system SHALL project contact form blocks into public Site trees without
exposing private challenge, email provider, or runtime secrets.

#### Scenario: Project contact form operation facts

- GIVEN the public Site tree includes a `contactForm` block
- WHEN the block references a publicly executable contact message operation
- THEN the projected block includes the operation key and target public
  operation route
- AND the referenced operation is a public-eligible create, record-plan, or
  operation handler command that stores flat contact message data
- AND the target public operation route is built through the shared public
  operation route contract from the Program API route prefix, entity key, and
  operation key
- AND contact-specific operation eligibility, operation binding warnings, and
  projected route facts are owned by the Site contact public operation adapter
- AND generic public operation input field projection is not used to render the
  contact-specific name, email, and message inputs
- AND the projected block does not include Turnstile secrets, email provider
  credentials, sender verification facts, or private notification recipients

#### Scenario: Warn for missing contact operation

- GIVEN a `contactForm` block references an operation that is missing or not
  publicly executable
- WHEN the public tree is projected
- THEN the public tree includes a warning
- AND public rendering does not expose a working form for that block

### Requirement: Public Operation Form Public Tree Projection

The system SHALL project generic public operation form blocks into public Site
trees without exposing private challenge, app storage, email provider, or
runtime secrets.

#### Scenario: Project public operation form facts

- GIVEN the public Site tree includes a `publicOperationForm` block
- WHEN the block references one publicly executable anonymous operation in the
  active Program
- THEN the projected block includes the canonical operation key, target public
  operation route, challenge facts required for browser rendering, and
  public-safe operation input field metadata
- AND the target is the Program public-operation route
- AND projected field metadata uses the schema-owned public-safe operation input
  projection and includes only field names, labels, required flags, affirmative
  boolean acceptance flags, supported scalar control types, text formats, text
  suggestions, and enum option labels
- AND the target public operation route is built through the shared public
  operation route contract from the Program API route prefix, entity key, and
  operation key
- AND public challenge site-key facts are supplied by runtime configuration,
  not by the operation input projection or Site record
- AND the projected block does not include Turnstile secrets, raw Authority
  storage records, app install records, private app records, email provider
  credentials, sender verification facts, or private notification recipients

#### Scenario: Warn for unavailable public operation form

- GIVEN a `publicOperationForm` block references an operation that is missing,
  not publicly executable, is unavailable in the active Program, lacks
  challenge configuration, or has required input outside the schema-owned public
  form field projection subset
- WHEN the public tree is projected
- THEN the public tree includes a warning
- AND public rendering does not expose a working form for that block

### Requirement: Public Operation Block Projection Locality

The system SHALL keep public operation block projection separate from generic
public tree traversal.

#### Scenario: Project public operation blocks through a focused boundary

- GIVEN tree projection encounters a `subscribeForm`, `contactForm`, or
  `publicOperationForm` block
- WHEN operation facts are projected for the block
- THEN stored operation keys, active Program public operation selection, Program
  public operation route construction, Turnstile challenge fact projection,
  and public-safe operation input field metadata projection are handled by the
  Site public operation block projection boundary
- AND generic public tree traversal only attaches returned `publicOperation`
  facts or records projection warnings on the tree metadata
- AND media projection, link resolution, dynamic list item projection,
  frame/root resolution, placement traversal, and browser submission helpers
  remain outside that boundary

### Requirement: Site Authoring

The system SHALL expose Site authoring through generated admin screens that
edit Site settings and renderer-neutral tree-structured block composition
without exposing raw implementation-only fields as primary controls.

#### Scenario: Create the first Site explicitly

- GIVEN the Program contains no active Site records
- WHEN an author opens the primary Site screen
- THEN the Site collection empty state presents `Create your first site` as its
  primary action
- AND the action is explicitly bound to `site.createStarter`
- AND schema registration, screen rendering, and empty-state projection do not
  invoke the command automatically
- AND successful creation selects the created Site for the singleton Site
  authoring experience

#### Scenario: Reject ambiguous singleton authoring

- GIVEN the Program contains more than one active Site record
- WHEN Phase 1 Site administration selects its Site aggregate
- THEN it presents an unavailable state identifying ambiguous Site selection
- AND it does not combine blocks, roots, settings, or actions across Sites
- AND a generated `New site` control and Site selector remain outside Phase 1

#### Scenario: Settings edit hides key

- GIVEN an author opens settings for the selected Site
- WHEN the generated settings form renders
- THEN label, description, icon, `initialThemeMode`, and `themeSwitchable` are
  editable
- AND authored accent and background colors are not Site settings
- AND key is hidden
- AND create and delete controls for Site settings are unavailable

#### Scenario: Review contact messages

- GIVEN selected standard public contact operations have stored flat
  `contact-message` records
- WHEN an author opens the Contacts screen after Subscribers
- THEN the generated admin table shows each message name, email, and message

#### Scenario: Tree child creation

- GIVEN an author selects a Site tree root
- WHEN they add an allowed child variant
- THEN the runtime creates a child block and a block placement
- AND the available child variants follow the parent block type and slot policy
- AND schema-declared variant labels, discriminator defaults, and literal
  placement values are resolved before the create intent reaches the renderer

#### Scenario: Project flat Site records for tree authoring

- GIVEN the selected Site root, its block records, and its block placement
  records exist
- WHEN the composition workspace projects its tree result
- THEN runtime builds an ordered nested authoring tree from the flat records
- AND each projected item keeps placement-edge identity separate from
  child-block identity
- AND storage does not gain nested child arrays or denormalized presentation
  trees
- AND records owned by another Site are not projected into the workspace

#### Scenario: Focus one placement for editing

- GIVEN the composition tree contains one or more placements
- WHEN the author selects a tree item
- THEN the hierarchy keeps concise item presentation while one focused editor
  exposes placement fields separately from child-block fields
- AND selecting an item does not patch Site records or change the selected Site
  root
- AND item-view context navigation remains available for child blocks that are
  valid root context targets
- AND refresh, creation, or placement removal resolves a missing selection
  through a stable runtime-owned fallback

#### Scenario: Remove a tree placement

- GIVEN an author selects a removable Site tree item
- WHEN they confirm removal
- THEN the runtime invokes the declared `remove-tree-placement` operation for
  the placement edge
- AND the authoring control does not delete or offer to delete the child block
  record

#### Scenario: Order Site placements

- GIVEN sibling placements are ordered within one parent and semantic slot
- WHEN the author selects an available top, up, down, or bottom action
- THEN runtime updates the declared placement rank only inside that parent and
  slot scope
- AND the authoring capability does not require drag and drop or permit
  cross-parent or cross-slot movement

#### Scenario: Surface Site tree diagnostics

- GIVEN Site tree authoring encounters placement or block readiness warnings, a
  missing child block, a cycle, a leaf branch, or descendants beyond the
  declared maximum depth
- WHEN the tree result is projected
- THEN the selected item exposes display-safe readiness and structural
  diagnostics without blocking otherwise valid authoring
- AND deep valid trees remain discoverable through controlled disclosure and a
  focused editor rather than rendering every nested block editor at once

#### Scenario: Root selection groups

- GIVEN the Site editor renders the primary composition workspace
- WHEN root context navigation is shown
- THEN roots are grouped for Pages, Posts, Projects, Header, and Footer
- AND raw Blocks and Placements remain non-primary admin or setup views

### Requirement: Subscribe Form Block

The system SHALL support a Site `subscribeForm` block that binds public page content to a schema-declared public subscribe operation.

#### Scenario: Author subscribe form block

- GIVEN a Site author creates a `subscribeForm` block
- WHEN the block is stored
- THEN the block stores normal flat block fields for label, body, operation
  name, and button label
- AND the operation always resolves from the active Program
- AND the block can be placed under public page and group composition branches

#### Scenario: Subscribe form variant is parsed

- GIVEN the Site source schema declares the `subscribeForm` block type
- WHEN the schema is parsed
- THEN `subscribeForm` is a valid block type and union variant
- AND its stored operation reference resolves through source-declared operation
  keys and operation handler capability facts
- AND generated Site authoring exposes the fields needed to configure the fixed
  subscribe form without package or install target fields

### Requirement: Contact Form Block

The system SHALL support a Site `contactForm` block that binds public page
content to a schema-declared public contact message operation.

#### Scenario: Author contact form block

- GIVEN a Site author creates a `contactForm` block
- WHEN the block is stored
- THEN the block stores normal flat block fields for label, body, operation
  name, button label, success label, and field labels
- AND the block can be placed under public page and group composition branches

#### Scenario: Contact form variant is parsed

- GIVEN the Site source schema declares the `contactForm` block type
- WHEN the schema is parsed
- THEN `contactForm` is a valid block type and union variant
- AND its stored operation reference resolves through source-declared operation
  keys and operation handler capability facts
- AND generated Site authoring exposes the fields needed to configure the form

### Requirement: Public Operation Form Block

The system SHALL support a Site `publicOperationForm` block that binds public
page content to a schema-declared anonymous public operation without
special-casing the submitted input fields in Site records.

#### Scenario: Author public operation form block

- GIVEN a Site author creates a `publicOperationForm` block
- WHEN the block is stored
- THEN the block stores normal flat block fields for label, body, canonical
  operation key, button label, success label, and optional operation input
  notification configuration
- AND the block does not store per-customer form field definitions that
  duplicate the target operation input contract
- AND the block can be placed under public page and group composition branches

#### Scenario: Public operation form variant is parsed

- GIVEN the Site source schema declares the `publicOperationForm` block type
- WHEN the schema is parsed
- THEN `publicOperationForm` is a valid block type and union variant
- AND its stored operation reference resolves through source-declared operation
  keys, Program operation policy, and operation input contracts
- AND generated Site authoring exposes the fields needed to configure the form

### Requirement: Generic Site Content Blocks

The system SHALL support generic Site content block variants for visually structured page sections, card grids, and metric grids without storing nested content.

#### Scenario: Author generic content blocks

- GIVEN the Site source schema declares block variants for `section`, `cardGrid`, `card`, `metricGrid`, and `metric`
- WHEN generated Site authoring parses the schema
- THEN each variant is a valid Site block type
- AND authors can edit the label and markdown body fields for content-bearing variants
- AND card blocks can edit icon and color fields
- AND metric blocks can edit color fields

#### Scenario: Compose generic content blocks

- GIVEN an author edits a public page or group in the Site composition workspace
- WHEN the author adds generic content blocks
- THEN page, group, and section parents allow section, card grid, metric grid, and existing public content children
- AND card grid parents allow card children
- AND metric grid parents allow metric children
- AND stored content remains flat block and block placement records

#### Scenario: Render generic content blocks

- GIVEN a public Site page contains section, card grid, card, metric grid, and metric blocks
- WHEN the default public Site renderer renders the page
- THEN sections render their heading, markdown intro, and ordered children as a visually separated page region
- AND card grids render card children in a responsive grid
- AND metric grids render metric children in a compact responsive proof-point layout
- AND the renderer uses the public tree projection rather than nested stored data

### Requirement: Public Routes

The system SHALL resolve public Site routes from one selected Site's explicit
home root and live routable block hrefs and render public documents outside
generated admin chrome.

#### Scenario: Home route

- GIVEN the selected Site references a live home page block
- WHEN a visitor opens `/`
- THEN the runtime resolves the home route
- AND renders the page using the public Site renderer

#### Scenario: Blog detail route

- GIVEN a live dated post block has a routable href
- WHEN a visitor opens its `/blog/*` route
- THEN the runtime renders the post detail document
- AND the `/blog` page remains the post index page
- AND matching blocks owned by another Site are not eligible

#### Scenario: Project route shape

- GIVEN live project blocks are curated through the Projects page
- WHEN public routes are resolved
- THEN `/projects` is a normal page route
- AND no project detail route is generated

### Requirement: Subscribe Form Rendering

The system SHALL render subscribe form blocks as public forms on mapped and
published public Site routes.

#### Scenario: Render Turnstile-protected subscribe form

- GIVEN a public Site page renders a valid `subscribeForm` block whose operation requires Turnstile
- WHEN the public renderer renders the block
- THEN the page renders an email input, submit control, and Turnstile widget using the public site key
- AND form submission posts to the target public operation route with the email input, source block id, idempotency key, and Turnstile token
- AND browser request envelope construction, JSON submission, response
  validation, public-safe error extraction, idempotency key generation, and
  Turnstile response token extraction use shared public operation browser
  client helpers
- AND subscribe-specific email input mapping remains owned by the Site public
  form session while the selected renderer owns only presentation

#### Scenario: Render successful subscribe outcome

- GIVEN a public subscribe form submission succeeds
- WHEN the public page handles the outcome
- THEN the page shows the configured success state
- AND the visitor is not shown admin-only subscriber records

### Requirement: Contact Form Rendering

The system SHALL render contact form blocks as public forms on mapped and
published public Site routes.

#### Scenario: Render Turnstile-protected contact form

- GIVEN a public Site page renders a valid `contactForm` block whose operation
  requires Turnstile
- WHEN the public renderer renders the block
- THEN the page renders name, email, and message inputs, a submit control, and
  Turnstile widget using the public site key
- AND form submission posts to the target public operation route with the
  declared contact message input, source block id, idempotency key, and
  Turnstile token
- AND browser request envelope construction, JSON submission, response
  validation, public-safe error extraction, idempotency key generation, and
  Turnstile response token extraction use shared public operation browser
  client helpers
- AND contact-specific input mapping remains owned by the Site public form
  session while the selected renderer owns only presentation

#### Scenario: Render successful contact outcome

- GIVEN a public contact form submission succeeds
- WHEN the public page handles the outcome
- THEN the page shows the configured success state
- AND the visitor is not shown provider delivery state, notification recipient
  configuration, or admin-only contact message records

### Requirement: Public Operation Form Rendering

The system SHALL render public operation form blocks as schema-driven public
forms on mapped and published public Site routes.

#### Scenario: Render Turnstile-protected public operation form

- GIVEN a public Site page renders a valid `publicOperationForm` block whose
  operation requires Turnstile
- WHEN the public renderer renders the block
- THEN the page renders one control for each projected public operation input
  field, a submit control, and a Turnstile widget using the public site key
- AND text, long text, enum, boolean, date, and number projected fields render
  with matching browser controls
- AND email-formatted text renders as an email input, phone-formatted text
  renders as a telephone input, and text suggestions render as native open
  datalist suggestions without preventing free text entry
- AND form submission posts to the target public operation route with the
  declared operation input values, source block id, idempotency key, and
  Turnstile token
- AND browser request envelope construction, JSON submission, response
  validation, public-safe error extraction, idempotency key generation, and
  Turnstile response token extraction use shared public operation browser
  client helpers
- AND browser coercion preserves booleans as booleans, numbers as finite
  numbers, dates as `YYYY-MM-DD` strings, and enum values as declared strings
- AND browser coercion trims and validates email-formatted and phone-formatted
  text with the same schema-owned validator used by Authority storage
- AND browser coercion accepts any text value for suggested text fields instead
  of restricting values to the datalist suggestions
- AND schema-driven form input coercion remains owned by the Site public form
  session while rendered controls consume only session presentation facts and
  intents

#### Scenario: Require affirmative boolean acceptance

- GIVEN a projected public operation boolean field carries `mustBeTrue: true`
- WHEN its controlled draft value is `false`
- THEN the Site public form session keeps submit unavailable after Turnstile is
  ready
- AND an attempted submit exposes a display-safe field error
- AND changing the controlled value to `true` clears that error and can make
  submit available
- AND an ordinary required boolean without `mustBeTrue` continues to accept
  explicit `false`
- AND the built-in Formless Renderer maps affirmative checkbox required and
  projected invalid facts to native and accessibility semantics while the Site
  session remains the source of truth

#### Scenario: Render successful public operation form outcome

- GIVEN a public operation form submission succeeds
- WHEN the public page handles the outcome
- THEN the page shows the configured success state
- AND the visitor is not shown operation-created records, provider delivery
  state, notification recipient configuration, or admin-only app records

#### Scenario: Render public-only form states

- GIVEN a public Site page renders `subscribeForm`, `contactForm`, or
  `publicOperationForm` blocks
- WHEN a block has no projected public operation facts because projection
  recorded a warning
- THEN the public renderer shows the form as unavailable instead of exposing a
  working submit target
- AND when a valid form is submitting, succeeds, or fails in the browser, the
  renderer shows only public pending, success, or display-safe failure state
- AND submitting, success, and failure state does not expose raw request
  envelopes, private challenge facts, submitted private records, provider
  delivery state, notification recipient configuration, or admin-only records

### Requirement: Public Site Form Session Boundary

The system SHALL expose controlled, display-safe public form presentation to
Site renderers while Site-owned foundations retain validation, challenge, and
operation execution behavior.

#### Scenario: Renderer consumes controlled form state and intents

- GIVEN a `subscribeForm`, `contactForm`, or `publicOperationForm` block has
  projected public operation facts
- WHEN the selected renderer presents the form
- THEN a Site-owned session supplies stable block and form identity, form kind,
  labels, body, controlled draft values, display-safe field errors, unavailable,
  ready, submitting, success, or failed state, submit availability, and
  presentation intents
- AND Turnstile presentation carries only its public site key, readiness, reset
  signal, and token-change intent
- AND generic public operation fields carry public-safe scalar control, format,
  suggestion, enum-option, required, affirmative boolean acceptance, and
  occurrence facts
- AND `@dpeek/formless-renderer` may adapt generic fields to canonical
  `FieldContract` controls inside the renderer package
- AND the Site package does not import `@dpeek/formless-renderer` field or
  renderer contracts

#### Scenario: Site foundation retains public form execution

- GIVEN a visitor edits or submits a public Site form
- WHEN the Site-owned session handles the presentation intents
- THEN it retains controlled draft resolution, scalar coercion, schema
  validation, idempotency keys, request envelope construction, JSON submission,
  response validation, challenge reset behavior, and display-safe error mapping
- AND `FormData` extraction, when required by a native boundary, adapts into the
  same controlled draft instead of becoming the source of truth
- AND raw errors, private challenge facts, request envelopes, submitted private
  values, created records, provider state, and notification configuration never
  enter renderer presentation facts

#### Scenario: Selected renderer consumes the session seam

- GIVEN production uses the Formless Renderer Site entrypoint
- WHEN fixed or generic public forms render
- THEN Formless Renderer presentation consumes the Site-owned session facts and
  dispatches only presentation intents
- AND current public routes, validation, coercion, Turnstile, idempotency,
  submission, pending, success, unavailable, and display-safe failure behavior
  remains unchanged

### Requirement: Public Site Client Runtime

The system SHALL keep published and mapped public Site browser assets scoped to
public Site interactivity rather than the
generated admin app shell or authenticated Program replica.

#### Scenario: Hydrate the Worker-rendered document shell

- GIVEN Worker SSR emits a public Site document with hydratable browser assets
- WHEN the public Site browser entrypoint hydrates the existing app root
- THEN Worker SSR and browser hydration render the same structural app shell
- AND hydration does not discard the Worker-rendered page because of a root
  element mismatch

#### Scenario: Published documents inject public Site assets

- GIVEN a published Site document needs browser code for a workspace public
  renderer, read-only markdown rendering, public form submission, Turnstile, or
  public tree hydration
- WHEN Worker SSR injects browser assets into the document shell
- THEN the injected assets come from a public Site browser entrypoint or manifest
- AND the injected assets do not require the generated admin app shell entrypoint
  to boot on the public page
- AND public Site documents that do not need browser interactivity may omit
  public Site script assets
- AND anonymous public clients do not bootstrap, synchronize, or open a
  WebSocket for the Program replica

#### Scenario: Public theme and CSS remain package scoped

- GIVEN the Formless Renderer public Site implementation is assembled in browser
  and Worker rendering
- WHEN its provider and styles are assembled
- THEN `@dpeek/formless-renderer` exposes the public provider and CSS
  boundaries needed by public roots
- AND public document and Site surfaces consume the selected renderer theme's
  `--color-background-body` token
- AND changing the resolved Site mode changes the token through the document
  `color-scheme` instead of a Site-derived palette or parallel boot background
- AND Worker rendering starts from a deterministic public theme mode and
  browser hydration remains structurally stable while stored or system mode is
  applied
- AND Site-owned public theme storage and document bootstrap facts remain
  outside the renderer implementation
- AND production public entrypoints use the `@dpeek/formless-renderer` public
  provider, StyleX integration, and CSS boundaries without importing application
  provider or CSS assembly

### Requirement: Schema-backed Public Site Theme

The system SHALL derive public Site document theming from the selected Site
record on published and mapped-host surfaces.

The Site settings fields are:

- `initialThemeMode`: optional enum `system`, `light`, or `dark`; missing values
  resolve as `system`.
- `themeSwitchable`: optional boolean; missing values resolve as `true`.

Authored accent and background colors are not Site settings. The selected
renderer theme owns public color tokens.

#### Scenario: Site route owns the public document theme

- GIVEN a public Site route has resolved its page tree
- WHEN the selected built-in or workspace `site.publicRenderer` is mounted
- THEN the Site route boundary resolves and applies the Site document theme
- AND a stored visitor light or dark preference takes precedence only when
  `themeSwitchable` is true
- AND the application document theme does not overwrite the Site theme while the
  public route remains mounted
- AND leaving an in-application Site route restores or reapplies the current
  application document theme
- AND Site theme storage, preference resolution, document ownership, and browser
  runtime behavior remain owned by `@dpeek/formless-site-app`

#### Scenario: Built-in theme control follows Site policy

- GIVEN the built-in Formless Renderer renders a public Site page
- WHEN `themeSwitchable` resolves to true
- THEN the renderer presents its concrete Astryx theme toggle
- AND selecting the toggle persists and applies the visitor preference
- WHEN `themeSwitchable` resolves to false
- THEN the renderer presents no theme toggle
- AND stored visitor overrides are neither read nor persisted

#### Scenario: Worker document theme follows Site settings

- GIVEN Worker SSR renders a published Site page with a built-in or workspace
  renderer
- WHEN the public document shell is produced
- THEN the initial Site theme marker, renderer mode marker, `color-scheme`, and
  browser bootstrap derive from the projected Site theme settings
- AND renderer root assembly supplies the selected provider theme identity on
  the document root before public CSS is applied
- AND renderer CSS paints the document background from
  `--color-background-body`
- AND Worker output does not emit a separate Site-authored or fallback
  background palette
- AND fixed light or dark settings ignore stored visitor preferences
- AND system settings start from deterministic light SSR output before the
  browser resolves the system preference

#### Scenario: Public Site assets exclude admin-only code

- GIVEN a visitor opens a published Site page or mapped public Site host
- WHEN the public Site browser assets load
- THEN generated admin screens, instance management shell, owner setup and login
  routes, workspace gateway controls, app replica sync for generated admin, and
  generated field editors are not part of the required public Site entrypoint
- AND the application `PresentationHost`, generated workspace runtime,
  shell and auth presentation, and private runtime adapters are not imported by
  the public Site browser or Worker renderer graph
- AND public forms continue to post through public operation routes with
  projected operation facts, source block id, idempotency key, and Turnstile
  token
- AND read-only markdown rendering remains available without loading rich
  markdown editor modules

### Requirement: Links And Frames

The system SHALL render header, footer, and links from the selected Site's
explicit root references, resolving same-Site internal targets from block
references and external targets from absolute URLs.

#### Scenario: Referenced frame roots render

- GIVEN the selected Site references live header and footer roots
- WHEN a public page renders
- THEN header and footer content comes from their nested Site block trees
- AND missing frame roots warn without blocking the page document

#### Scenario: Link target resolution

- GIVEN a link block uses a same-Site internal target block reference
- WHEN the public tree resolves links
- THEN the link href is derived from the target block route
- AND broken explicit targets produce public tree warnings

#### Scenario: Header and footer rendering

- GIVEN live header and footer frame roots have child placements
- WHEN a public page renders
- THEN header and footer output comes from the nested frame trees
- AND public header active state is route-aware

### Requirement: Media And Icons

The system SHALL render Site images from core media assets and derive public
Site icons from resolved source-backed or catalog-backed Site icon values.

#### Scenario: Core media image

- GIVEN an image block references a valid core media asset id
- WHEN the public Site tree and renderer process the image
- THEN the image href uses core media delivery
- AND the public image node does not project or render a manual block href
- AND an image without resolved core media renders the existing missing-image
  placeholder

#### Scenario: Root icon routes

- GIVEN the selected Site contains a safe legacy SVG icon or a resolvable icon id
- WHEN a visitor requests `/favicon.svg`, `/favicon.ico`, or `/apple-touch-icon.png`
- THEN the response is derived from the resolved Site icon SVG source
- AND generated PNG and ICO bytes are artifacts rather than stored record fields

#### Scenario: Resolve Site icon ids

- GIVEN Site settings or a Site block stores an icon catalog key
- WHEN browser preview or Worker public tree projection renders the Site
- THEN the runtime resolves the key from the complete Program schema icon
  catalog plus baked defaults before projecting renderer input
- AND the public Site renderer continues to receive display-safe SVG source
  rather than schema data, catalog access, or unresolved ids
- AND transitional Site icon fields continue rendering safe legacy SVG source
  while new catalog selections store icon ids
- AND an unresolved id produces an explicit tree warning and the existing
  missing-icon presentation

#### Scenario: Safe SVG icon rendering

- GIVEN a resolved or legacy SVG icon is missing, invalid, or unsafe
- WHEN Site or generated UI renders the SVG icon
- THEN rendering falls back to an empty outline
- AND scripts, event handlers, `javascript:` URLs, `foreignObject`, and external
  asset references are rejected

### Requirement: Site Media Package Boundary

The system SHALL render Site images through Media package public contracts while
keeping Site usage metadata in Site records.

#### Scenario: Site resolves core media through Media helpers

- GIVEN a Site image block references a core media asset id
- WHEN Site runtime resolves public image delivery
- THEN Site runtime resolves delivery facts through Media package public helpers
  or adapters
- AND public rendering does not fall back to a Site-authored image href

#### Scenario: Site usage metadata stays outside Media

- GIVEN Site authoring or public rendering uses label, alt text, caption, crop,
  slot, focal point, poster override, width, or height
- WHEN Site records are stored or rendered
- THEN those facts remain Site-owned flat record values

### Requirement: Metadata And Indexing

The system SHALL generate public document metadata, robots output, and sitemap
output from the selected Site and its live public blocks.

#### Scenario: Public metadata

- GIVEN a public page renders successfully
- WHEN the document is produced
- THEN it includes title, description, canonical URL, OpenGraph metadata, and Twitter card metadata
- AND metadata prefers Site settings before page-derived fallbacks

#### Scenario: Sitemap output

- GIVEN live routable page and dated post blocks exist
- WHEN `/sitemap.xml` is requested
- THEN sitemap entries come from those routable blocks
- AND settings records, generated app routes, tombstones, and non-routable blocks
  are excluded
- AND routable blocks owned by another Site are excluded

### Requirement: Program Public Sites

The system SHALL select exactly one active Program-native Site across mapped
public Site hosts and published Site profile redirects until explicit route and
domain Site targeting is introduced.

#### Scenario: Select the sole active Site

- GIVEN Program storage contains exactly one active Site record
- WHEN Phase 1 public Site behavior selects its target
- THEN that Site supplies settings, roots, blocks, metadata, indexing, icons,
  public action source scope, and rendering
- AND selection does not depend on a reserved Site key or record creation order

#### Scenario: Reject missing or ambiguous public Site selection

- GIVEN Program storage contains zero or more than one active Site records
- WHEN a mapped or published public Site request requires a Site target
- THEN the Site runtime returns an explicit unavailable system state
- AND it does not select the first record, combine records, or synthesize a Site

#### Scenario: Scope public operation source to the selected Site

- GIVEN a public Site form submits a source block id
- WHEN the public operation boundary validates the request
- THEN the server-derived public Site target owns the accepted source block
- AND a missing, tombstoned, wrong-type, or other-Site source block is rejected
- AND client-supplied host, path, or block facts cannot select a different Site

#### Scenario: Program Site remains the route contract

- GIVEN core runtime creates or resolves a public Site route
- WHEN the route is selected
- THEN it targets the Program-native Site
- AND the Site adapter supplies tree, document, metadata, indexing, and icon
  behavior from Program storage
- AND no package capability, app install, or installed storage target is
  selected

#### Scenario: Mapped public Site host

- GIVEN an enabled exact-host mapping uses profile `publicSite`
- WHEN a visitor opens the mapped host
- THEN the mapping renders top-level routes from the Program-native Site
- AND the mapping selects the sole active Program Site target
- AND generated admin and app shell routes are blocked on that host

#### Scenario: Published Site target selection

- GIVEN a published Site runtime starts
- WHEN it selects its public Site target
- THEN it renders the sole active Program-native Site from Program storage
- AND the complete Program artifact and canonical Program provenance select the
  target

#### Scenario: Published SSR response policy

- GIVEN a published Site document, redirect, indexing resource, icon, or media
  resource receives a `HEAD` request
- WHEN the matching `GET` request would have returned status and headers
- THEN `HEAD` returns matching status and headers without a body
- AND successful and not-found published SSR HTML may be retained only with
  mandatory revalidation and is not served through a stale-while-revalidate
  window
- AND SSR errors use `Cache-Control: no-store`

#### Scenario: Published Site client asset cache coherence

- GIVEN a production browser build emits public Site JavaScript and stylesheets
- WHEN SSR resolves its client assets from the build manifest
- THEN the manifest references content-addressed files under an immutable asset
  path
- AND immutable client assets use a long-lived immutable cache policy
- AND the stable-name client asset manifest is not cached
