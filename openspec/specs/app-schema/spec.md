# App Schema Specification

## Purpose

App schema is runtime data that defines flat records, projections, and
operations. It is the durable contract for package schema sources, generated UI, Authority storage,
browser replicas, public bindings, automation, and package adapters.

## Requirements

### Requirement: Bundled Domain Schemas

The system SHALL provide package-owned standard library, Tasks, and Site schemas
for trusted build-time Program composition without coupling package source to
initial records.

#### Scenario: Load current package schema

- **GIVEN** trusted Program composition imports the standard library, Tasks, or
  Site package
- **WHEN** it loads the package's documented schema entrypoint
- **THEN** the package's App schema declarations and named complete source
  recipes are available
- **AND** package source loading does not supply initial stored records
- **AND** app records enter Authority through operations, workspace state,
  storage snapshot restore, or instance archive restore
- **AND** the default Program composes the domain declarations into the one
  `formless-program` schema used by runtime storage and routes

### Requirement: TypeScript Schema Authoring

The system SHALL allow trusted package-local TypeScript to declare App schema
source while keeping the complete materialized Program schema and parsed
runtime model as data-only contracts.

#### Scenario: Declare typed App schema source

- GIVEN a package declares App schema source in trusted TypeScript
- WHEN the source uses the public Schema package authoring contract
- THEN the declaration is checked against an App schema source type that
  represents parser input, including optional values for parser-owned defaults
- AND the same runtime-neutral App schema parser validates the complete
  declaration and its cross-references
- AND successful authoring returns the original source data without
  materializing parser defaults into it
- AND the authoring contract introduces no filesystem, network, provider,
  browser, Worker, or app-record dependency

#### Scenario: Publish TypeScript-authored package source

- GIVEN a package owns valid TypeScript-authored App schema source
- WHEN its documented schema entrypoint is checked or published
- THEN package checks validate the TypeScript declarations through the same App
  schema parser used for complete Program composition
- AND publication emits the documented executable schema entrypoint and its
  declarations rather than a standalone package JSON artifact
- AND Worker request handling consumes only the trusted complete Program
  artifact rather than package authoring source or workspace TypeScript
- AND executable callbacks, import references, credentials, provider objects,
  and runtime implementations remain outside the complete Program artifact

#### Scenario: Preserve source-schema hash semantics

- GIVEN a complete TypeScript-authored Program source omits a value for which
  parsing supplies a runtime default
- WHEN Program materialization hashes that source schema
- THEN materialization preserves the authored omission in the plain data
  artifact
- AND `sourceSchemaHash` is computed from that complete materialized source
  data rather than from the parser-defaulted runtime model
- AND Program checks reject canonical drift between the TypeScript composition
  and the complete materialized artifact

### Requirement: TypeScript Schema Module Composition

The system SHALL allow trusted TypeScript schema modules to compose one
complete App schema source without changing the portable source schema or
parsed runtime contracts.

#### Scenario: Compose declaration modules

- GIVEN package-local schema modules contribute whole declarations to the
  existing icon, entity, relationship, query, read-model, union, item-view,
  table-view, view, screen, or surface-mount namespaces
- AND a composition root explicitly lists the modules in source order
- WHEN the modules are composed
- THEN their declarations are flattened in listed order into one complete App
  schema source
- AND declaration arrays contributed by each module retain their explicit
  nested declaration order
- AND import evaluation order and object property insertion order do not select
  or reorder composed definitions
- AND modules may reference declarations owned by other modules
- AND the complete composition is validated once through the same
  runtime-neutral App schema parser
- AND an individual module is not required to be a valid App schema in
  isolation

#### Scenario: Enforce explicit replaceable module dependencies

- GIVEN a schema module declares another authoring module key as a dependency
- WHEN the composition root supplies an upstream or project-owned module with
  that exact key before the dependent module
- THEN the dependency is satisfied without requiring object identity with the
  original upstream module
- AND a project may eject and replace a module while preserving its key
- AND when the composition root omits that key or lists it after the dependent
  module, composition fails with an error identifying both module keys
- AND composition does not fetch, automatically include, or reorder modules
- AND duplicate module keys fail before App schema parsing

#### Scenario: Reject declaration collisions

- GIVEN two schema modules contribute the same declaration path
- WHEN the modules are composed
- THEN composition fails rather than overwriting, extending, or deep-merging
  the declaration
- AND the error identifies the declaration path and both owning module keys
- AND declaration keys in different App schema namespaces remain independent

#### Scenario: Compose module-owned control-plane entity policy

- GIVEN a schema module contributes an entity declaration
- WHEN that module contributes runtime control-plane policy for the same entity
- THEN composition adds that policy to the complete source schema's
  `runtime.controlPlane.entities` map
- AND the composition root owns the complete schema's runtime owner
- AND a module cannot contribute policy for an entity owned by another module
- AND duplicate policy ownership, policy without the matching module-owned
  entity, or module policy without a runtime-owned composition root fails
  before App schema parsing
- AND module runtime contribution is limited to control-plane entity policy
  rather than a generic deep merge of runtime metadata

#### Scenario: Preserve the portable schema artifact

- GIVEN valid modules compose an App schema source
- WHEN that source is materialized and hashed
- THEN the output contains only the existing App schema source data
- AND module keys, dependencies, module references, module policy ownership,
  and provenance are absent from the materialized artifact and parsed runtime
  model
- AND authored omissions and nested declaration order remain source data
- AND equivalent composed and monolithic sources produce the same canonical
  schema data and source-schema hash

#### Scenario: Declare build-time runtime requirements

- GIVEN a schema module depends on executable record, operation, browser, or
  Worker behavior
- WHEN the module declares that dependency as authoring-only runtime
  requirements
- THEN the requirements identify required adapter or surface keys without
  importing, locating, or activating executable code
- AND the trusted Program composition root explicitly supplies the matching
  runtime implementations
- AND missing, duplicate, or target-incompatible implementations fail during
  Program materialization or runtime build
- AND runtime requirement keys, executable functions, module paths, and build
  digests are absent from the portable schema artifact and source-schema hash

### Requirement: Downstream Program Schema Composition

The system SHALL let a downstream-owned TypeScript composition root use the
existing App schema language to produce one complete Program schema artifact
from reusable package modules.

#### Scenario: Compose the default Program schema

- GIVEN the Instance Control Plane, Identity Control Plane, standard library,
  Tasks, and Site packages expose their current record, presentation, screen,
  and surface-mount modules
  through public `./schema` subpaths
- WHEN the Formless product composition root builds its default Program schema
- THEN it explicitly lists package record modules before any dependent
  presentation or screen modules
- AND it supplies complete runtime ownership, navigation, surface placement,
  and any project-owned modules at the composition root
- AND the product-supplied route-management workspace and runtime-owned
  access-management screen are portable screen declarations contributed through
  independently replaceable modules
- AND the product-owned `instanceHome` runtime screen declares the root path
  `/` without making any package workspace the root route
- AND the result is one valid `AppSchemaSource` rather than a second Program
  schema language or wrapper contract
- AND instance, identity, standard, Task, and Site entities retain their
  package-owned stable entity ids in the complete source

#### Scenario: Place product screens through ordinary schema composition

- GIVEN reusable control-plane packages expose product screen declarations
  through independently replaceable schema modules
- WHEN the default Program composes those modules
- THEN the `routes` screen uses path `/settings/routes` and the `access` screen
  uses path `/settings/access`
- AND their keys, labels, paths, and access requirements remain ordinary
  portable screen data
- AND Routes retains its schema-owned workspace layout while Access declares a
  runtime-owned screen without collection sections or generated view references
- AND a downstream Program may eject either screen module and supply a same-key
  module whose screen keeps the stable screen key, presentation kind, and a
  valid selected path
- AND composition uses the existing screen registry, module dependency,
  collision, parsing, navigation, and hashing rules rather than a product-route
  registry, path override map, or second schema concept

#### Scenario: Apply Program-specific Tasks policy

- GIVEN the reusable Tasks modules retain standalone package presentation and
  operation declarations
- WHEN the default Program composes Tasks
- THEN the root supplies a same-key Tasks record-module replacement that
  preserves the Task entity and operation declarations while adding `editor`
  operation access
- AND the root supplies a same-key Tasks presentation-module replacement that
  preserves package-owned views while selecting screen path `/tasks` and
  `member` screen access
- AND the Program root owns navigation and access policy without taking
  ownership of Task domain declarations
- AND the package-owned Tasks source does not need to declare Program roles

#### Scenario: Materialize the Program schema artifact

- GIVEN trusted TypeScript is the authoritative source for the default Program
  composition
- WHEN the Program schema is materialized
- THEN it produces deterministic, data-only JSON containing one complete
  existing App schema source
- AND the materialized source parses through the normal App schema parser and
  uses the normal canonical source-schema hash semantics
- AND module keys, dependency keys, package paths, runtime callbacks, and
  authoring ownership are absent from the artifact
- AND package module declaration order and root-owned navigation remain
  portable, hash-significant source data
- AND the default runtime loads that materialized artifact as the active
  `formless-program` schema without evaluating the TypeScript composition root

#### Scenario: Select the default Program for runtime storage

- GIVEN the default Program artifact contains the composed instance, identity,
  standard, Tasks, and Site declarations
- WHEN runtime-owned reviewable records are bootstrapped, validated, operated
  on, synced, snapshotted, archived, or projected
- THEN the runtime uses that one complete artifact and its canonical source hash
- AND the Program root owns the runtime schema key, storage target, generic API
  route, navigation, and complete schema provenance
- AND the Tasks schema modules remain reusable package composition inputs
  rather than a separate runtime storage mount
- AND standard, Task, Site, and other explicitly composed domain records use
  Program storage while domain schema modules remain build-time composition
  inputs

#### Scenario: Materialize an explicit workspace Program extension

- GIVEN a trusted downstream `formless.ts` explicitly composes the built-in
  Program modules with ordered workspace-owned schema modules
- WHEN local development or a deploy build materializes that configuration
- THEN it produces one complete `formless-program` source artifact and its
  canonical source-schema hash
- AND the workspace root owns its final authorization catalog, navigation,
  screen paths, surface-mount paths, and deliberate module replacements
- AND product-supplied and workspace-owned screens and surface mounts use the
  same declaration and replacement rules for their respective registries
- AND module and declaration collision rules remain the normal schema-composer
  rules without automatic prefixes, discovery, registries, or deep merges
- AND the trusted workspace configuration explicitly selects shared, browser,
  and Worker runtime composition entrypoints independently of its ordered
  schema module list
- AND those entrypoints use ordinary static imports rather than package,
  manifest, filesystem, or entity-id discovery
- AND Worker, archive, workspace, replica, cursor, broadcast, WebSocket, and
  deploy runtime selection consume the data-only complete Program artifact
- AND they do not evaluate workspace TypeScript at request time
- AND the extension does not create a second Program, package-scoped schema,
  qualified record identity, or package-derived authorization identity

#### Scenario: Compose top-level Program navigation groups

- GIVEN a Program composition root includes product-supplied and
  workspace-owned screens in one complete schema
- WHEN the root declares grouped navigation
- THEN `navigation.groups` is an ordered array of stable group keys, human
  labels, and ordered screen-key references
- AND the default Program declares Home, Tasks, Site, and Instance groups while
  a downstream Program may replace that complete grouping and add its own
  groups
- AND the Home group selects the product-owned `instanceHome` screen
- AND the default Tasks and Site groups select `taskHome` and `siteEditor`
  respectively
- AND the default Instance group selects `routes` and `access` in that order
- AND group and nested screen order remain portable, source-hash-significant
  root-owned navigation data
- AND package module identity, declaration provenance, screen path prefixes,
  entity ownership, or runtime adapters do not infer group membership
- AND a navigation group does not create another Program, storage target, API
  prefix, browser replica, sync lineage, route mount, role catalog, or
  authorization scope

### Requirement: Portable Surface Mounts

The system SHALL let a complete Program schema place trusted browser and Worker
runtime surfaces at portable Program-owned route subtrees without embedding
executable behavior in schema data.

#### Scenario: Declare a surface mount

- GIVEN an App schema declares `surfaceMounts`
- WHEN the complete schema is parsed
- THEN each mount carries a unique stable `key`, target `browser` or `worker`,
  absolute subtree `path`, and explicit browser-applicable access requirement
- AND the mount key, target, path, access, and declaration order remain
  portable, materialized, and source-hash-significant data
- AND a mount path selects its exact root and nested segment-boundary paths
- AND callbacks, module paths, component names, runtime surface keys, and
  executable code remain absent from portable mount data

#### Scenario: Compose replaceable surface mounts

- GIVEN a reusable package owns stable surface-mount keys and a Program root
  owns their placement and access policy
- WHEN the Program root composes or deliberately replaces the package module
- THEN ordinary module dependency, same-key replacement, declaration
  collision, materialization, and hashing rules apply
- AND a downstream replacement preserves each stable mount key and target while
  selecting another valid path or browser-applicable access requirement
- AND workspace runtime configuration continues to select executable shared,
  browser, and Worker entrypoints independently of portable mount placement

#### Scenario: Bind a trusted runtime by mount identity

- GIVEN the materialized Program declares a browser or Worker surface mount
- WHEN trusted Program runtime composition is validated
- THEN the matching target runtime binds executable behavior by stable mount
  key rather than by literal path
- AND missing, duplicate, or target-incompatible bindings fail before the
  Program runtime is served
- AND the runtime binding does not change the portable Program artifact or its
  source-schema hash

#### Scenario: Reject surface-mount route collisions

- GIVEN a surface mount uses root `/`, duplicates or overlaps another mount
  subtree, equals a screen path, contains a screen path below its subtree, or
  uses an invalid absolute path
- WHEN the complete schema is parsed
- THEN parsing fails before the mount is available to browser or Worker routing
- AND an exact screen path may remain an ancestor of a more-specific mount
  subtree
- AND active Program materialization additionally rejects mount paths that
  overlap intrinsic API, auth, local-session, asset, development-module, icon,
  or indexing route families

### Requirement: Program Authorization Definitions

The system SHALL let a Program composition root declare one ordered catalog of
schema-defined human roles without making intrinsic or trusted runtime actors
assignable roles.

#### Scenario: Declare the Program role catalog

- GIVEN an App schema source declares `authorization.roles`
- WHEN the complete source is parsed
- THEN each role carries a stable opaque `id`, portable `key`, and human label
- AND role declaration order is increasing ordinary human authority
- AND duplicate role ids or keys are rejected
- AND the role catalog remains data-only, materialized, and source-hash
  significant
- AND persisted role assignments may reference stable role identity without
  making mutable assignment records part of App schema

#### Scenario: Keep role ownership at the Program root

- GIVEN reusable schema modules contribute Program domains
- WHEN the Program schema is composed
- THEN the composition root owns the complete role catalog
- AND modules may reference root-owned role keys through access requirements
- AND modules do not contribute, extend, replace, or reorder roles
- AND schema module composition does not introduce scoped role catalogs,
  app-install roles, role inheritance, or role grants

#### Scenario: Materialize the default Program role ladder

- GIVEN the Formless product composition root builds the default Program schema
- WHEN its schema artifact is materialized
- THEN the root declares `member`, `editor`, and `administrator` roles in
  increasing authority order
- AND each default role has a stable opaque id owned by that root
- AND `anonymous`, `authenticated`, `owner`, `runner`, `deployer`, and
  `adminBearer` are absent from the role catalog

### Requirement: Shared Access Requirement Contract

The system SHALL expose one runtime-neutral access requirement contract for
schema-defined resources without introducing a general policy-expression
language.

#### Scenario: Parse a direct actor requirement

- GIVEN an access requirement declares `{ actor }`
- WHEN it is parsed against a complete App schema
- THEN `actor` is `anonymous`, `authenticated`, `owner`, `runner`, `deployer`,
  or `adminBearer`
- AND `anonymous` permits admission without a principal but does not assign a
  role or expose any generic read, sync, snapshot, or write surface
- AND `authenticated` requires an active principal-backed session
- AND `owner` requires protected built-in owner authority
- AND each trusted system actor requires its exact runtime channel

#### Scenario: Parse a direct role requirement

- GIVEN an access requirement declares `{ role }`
- WHEN it is parsed against a complete App schema
- THEN the role key resolves against `authorization.roles`
- AND an active principal satisfies the requirement when its assigned role is
  the required role or a later role in the ordered catalog
- AND an active owner satisfies every ordinary role requirement
- AND an administrator, editor, or member never satisfies an `owner` actor
  requirement
- AND a trusted system actor satisfies a role requirement only when the
  resource explicitly supplies a separate accepted alternative

#### Scenario: Parse explicit access alternatives

- GIVEN one resource accepts either a human requirement or a trusted system
  actor
- WHEN its access declares `{ anyOf: [...] }`
- THEN each entry is one direct actor or direct role requirement
- AND one satisfied entry admits the caller
- AND `anyOf` is non-empty and cannot contain another `anyOf`
- AND conjunctions, negation, deny rules, wildcard grants, scoped grants,
  field policy, row policy, and relationship traversal are not part of the
  contract

#### Scenario: Reject unresolved access requirements

- GIVEN an access requirement contains an unknown actor, an unresolved role
  key, an empty alternative list, a nested alternative list, or more than one
  requirement form
- WHEN the App schema or standalone access requirement is parsed
- THEN parsing fails closed before the requirement reaches runtime enforcement
- AND the pure evaluator denies missing or inactive caller facts

#### Scenario: Keep public operation policy additional

- GIVEN a schema resource accepts the anonymous actor
- WHEN anonymous operation execution is considered
- THEN the access requirement alone does not create a public operation binding
- AND explicit public input, response projection, challenge, origin,
  rate-limit, idempotency, target-route, and audit requirements remain
  additional contracts
- AND a screen or route that admits anonymous presentation does not make its
  underlying records available through generic reads or sync

#### Scenario: Attach the contract to entity operations

- GIVEN an entity operation declares top-level `access`
- WHEN the complete App schema is parsed
- THEN the value is parsed as the shared access requirement against that
  schema's root-owned role catalog
- AND unresolved role keys, invalid actors, mixed requirement forms, empty
  alternatives, and nested alternatives fail schema parsing
- AND an operation using top-level `access` does not also use legacy
  `policy.actors` as a second authorization source
- AND operation visibility, response projection, input, output, effect,
  idempotency, audit, and explicit anonymous public policy remain separate
  contracts

#### Scenario: Program access does not derive identity from declarations

- GIVEN a Program operation declares top-level access
- WHEN runtime authorization resolves the request
- THEN it uses current principal, protected-owner, and Program role-assignment
  facts against the complete Program role catalog
- AND package, module, entity, field, media, adapter, or provenance identity
  does not become an authorization principal or scope

### Requirement: Ordered Keyed Definition Registries

The system SHALL represent every addressable App schema definition registry as
an ordered array whose definitions carry their existing portable `key`.

#### Scenario: Parse ordered definition registries

- GIVEN App schema source declares top-level authorization roles, icons, entities,
  relationships, queries, computed values, aggregates, unions, item views,
  table views, views, screens, or surface mounts
- OR it declares nested entity fields, enum values, constraints, state
  machines, transitions, operations, operation input fields, table record
  links, or union variants
- WHEN the source is parsed
- THEN each addressable registry is an array of keyed definitions
- AND array declaration order is preserved in the portable parsed schema
- AND a duplicate key within one registry is rejected
- AND definition keys remain portable addressable names
- AND entity definitions additionally carry stable entity identity
- AND role definitions additionally carry stable role identity because
  persisted assignments may reference them
- AND other definition registries do not gain a universal stable id

#### Scenario: Keep non-registry objects as objects

- GIVEN App schema data contains flat record `values`, operation effects,
  policies, visibility conditions, field-value mappings, transition-event
  mappings, relationship endpoint configuration, layout configuration,
  navigation configuration, runtime metadata, or archive envelopes
- WHEN the source is parsed or materialized
- THEN those records, mappings, and configuration structures remain objects
- AND object property order is not App schema semantics
- AND existing arrays that already express sequence, including query
  expressions, state lists, record-plan steps, table columns, view bindings,
  collection queries, screen sections, and module lists, remain arrays

#### Scenario: Distinguish definitions from surface placements

- GIVEN a create, edit, item, table, collection, or other presentation surface
  selects fields, queries, operations, variants, or other definitions
- WHEN the surface selection is declared
- THEN its array entries reference definitions and supply membership and order
  for that surface
- AND a reference entry does not gain a definition `key` or universal id only
  because it is addressable inside a runtime presentation graph
- AND renderer-facing occurrence ids remain a separate presentation concern

#### Scenario: Validate registry references

- GIVEN a keyed definition or surface placement references an entity, field,
  enum value, relationship, state machine, transition, operation, query, read
  model, union, item view, table view, view, or screen
- WHEN the complete App schema is parsed
- THEN the reference resolves against the corresponding keyed registry
- AND missing, wrong-scope, or incompatible references are rejected before the
  schema reaches Authority storage, browser replicas, generated UI, archives,
  or workspaces

### Requirement: Registry Declaration Order

The system SHALL treat keyed registry array order as intentional portable
schema data and SHALL let presentation surfaces override that order through
their own arrays.

#### Scenario: Use declaration order by default

- GIVEN a runtime needs a default icon catalog, field catalog, enum option list, union variant
  list, transition action list, operation list, screen catalog, or another
  keyed registry sequence
- WHEN no surface-specific selection array applies
- THEN definitions are selected in registry declaration order
- AND every keyed registry array remains order-significant even when its order
  is not currently presented

#### Scenario: Use surface-specific membership and order

- GIVEN a presentation surface declares its own array of field, query,
  operation, variant, screen, or other definition references
- WHEN the surface model is selected
- THEN that array supplies membership and order for the surface
- AND omitted definitions do not appear through a registry-order fallback
- AND no parallel registry order list is maintained

### Requirement: Derived Definition Indexes

The system SHALL permit runtimes to derive non-portable indexes for fast keyed
lookup while preserving the array-shaped parsed schema.

#### Scenario: Build shared keyed indexes

- GIVEN a parsed App schema is accepted after source parsing, bootstrap,
  archive restore, or browser load
- WHEN runtime code needs keyed lookup
- THEN it can derive an ordered definition list and a readonly map keyed by
  definition `key`
- AND nested indexes cover definitions such as fields by entity, transitions by
  state machine, operations by entity, and variants by union
- AND shared lookup behavior is owned by the Schema package rather than
  independently reconstructed by each consumer

#### Scenario: Keep indexes out of portable data

- GIVEN derived definition indexes exist for a parsed schema object
- WHEN the schema is stringified, materialized, hashed, stored by Authority,
  copied into a browser replica, snapshotted, archived, or written to a
  workspace
- THEN only the array-shaped portable schema is serialized
- AND maps, caches, reverse lookups, and other derived indexes are omitted
- AND indexes may be cached by parsed schema object identity and rebuilt after
  a new schema object is loaded

### Requirement: Canonical App Schema Ordering

The system SHALL canonicalize complete App schema source with array order
preserved and object property names sorted by one locale-independent ordinal
comparison.

#### Scenario: Canonicalize arrays and objects

- GIVEN two complete App schema source objects differ only in object property
  insertion order
- WHEN canonical JSON and `sourceSchemaHash` are computed
- THEN their object properties are recursively ordered using ordinal UTF-16
  code-unit comparison
- AND the canonical JSON and source-schema hashes are equal
- AND locale, host, import evaluation, and object insertion order do not affect
  the result

#### Scenario: Hash registry declaration order

- GIVEN two complete App schema sources contain the same keyed definitions in a
  different registry array order
- WHEN canonical JSON and `sourceSchemaHash` are computed
- THEN array order is preserved exactly
- AND the canonical JSON and source-schema hashes differ
- AND Authority schema equality and browser schema reuse apply the same
  canonical semantics

#### Scenario: Canonicalize TypeScript and JSON source equivalently

- GIVEN TypeScript-authored and JSON-authored source materialize to the same
  arrays, objects, scalar values, and authored omissions
- WHEN canonical schema artifacts and hashes are produced
- THEN both authoring forms produce equivalent canonical schema data and
  `sourceSchemaHash`

### Requirement: Canonical Source Schema Hash

The Schema package SHALL expose one deterministic source-schema hash contract
for complete portable App schema data without attaching package, module,
entity, field, media, route, or authorization identity.

#### Scenario: Hash complete schema source

- GIVEN a complete App schema changes icons, entities, fields, relationships, queries,
  read models, views, table views, item views, screens, surface mounts,
  operations, state machines, labels, or runtime metadata
- WHEN the deterministic source schema hash is computed
- THEN the hash input is the complete canonical App schema object
- AND keyed registry array order is part of the hash input
- AND object property insertion order is not part of the hash input
- AND generated UI-only changes produce a different source schema hash
- AND the hash is independent of record data, workspace state, runtime
  timestamps, package metadata, and module metadata

#### Scenario: Use the complete Program hash at runtime

- GIVEN trusted build-time composition produces one complete Program artifact
- WHEN Worker storage, browser bootstrap, replicas, workspaces, archives, or
  diagnostics identify its schema provenance
- THEN they use the source-schema hash of that complete Program artifact
- AND no package revision, package source hash, module key, entity key, field
  key, media scope, or install identity becomes alternate runtime provenance

### Requirement: Schema Parsing

The system MUST parse app schemas into validated runtime models before use.

#### Scenario: Reject conflicting ordering

- GIVEN an app schema with conflicting result-level and table-level ordering declarations
- WHEN the schema is parsed
- THEN parsing fails
- AND the invalid app schema is not used for generated UI or writes

#### Scenario: Reject invalid screen paths

- GIVEN a screen path that is relative, parameterized, or duplicate
- WHEN the schema is parsed
- THEN parsing fails
- AND the screen is not made available for app navigation

#### Scenario: Accept schema screen path

- GIVEN an app schema declares a screen path `/schema`
- WHEN the schema is parsed
- THEN parsing accepts the screen path
- AND generated UI may route `/schema` as an ordinary app screen where the
  active runtime profile exposes that app route

### Requirement: Operations-Centered Schema Contract

The system SHALL organize app schema interaction semantics around records,
projections, operations, bindings, and adapters.

#### Scenario: Classify schema primitives

- GIVEN app schema source is parsed
- WHEN runtime models are selected
- THEN entities and fields describe flat stored records
- AND queries, read models, views, table views, item views, screens, public
  outputs, and result models describe projections over stored records
- AND operations describe the allowed interactions with records or projections
- AND generated UI placements, protocol routes, public forms, CLI calls,
  automation triggers, and workflow triggers are bindings that reference
  operation keys
- AND package-specific React, Worker, Node, provider, media, Site, or deployment
  behavior is selected explicitly by the trusted runtime composition root
- AND schema capability or entity facts may validate and scope an already
  selected adapter but do not discover, activate, or authorize executable code

#### Scenario: Keep operation meaning out of bindings

- GIVEN a binding references an operation key
- WHEN the schema is parsed
- THEN the binding may declare route, placement, ordering, display, or
  surface-specific availability facts
- AND the binding does not redefine the operation input, output, effect, actor
  policy, idempotency policy, audit policy, or storage target

#### Scenario: Operation schema is the interaction model

- GIVEN source schema describes writes, commands, public execution, table
  controls, state transitions, generated controls, or workflow triggers
- WHEN the schema is parsed
- THEN those semantics are represented by source-declared operations and
  operation bindings
- AND bundled source schemas and fixtures express interaction behavior through
  operations and operation bindings
- AND new schema behavior that affects invocation semantics is added to
  operations or operation bindings rather than to a separate peer interaction
  model

#### Scenario: Keep native record links outside operation invocation

- GIVEN a presentation surface offers record-scoped navigation to a native URL
- WHEN the App schema describes that destination without a write, command, or
  operation effect
- THEN the destination is a projection binding rather than an entity operation
- AND following the destination does not invoke an operation, create operation
  execution state, or dispatch an operation intent
- AND navigation labels, targets, value sources, URL construction, and surface
  placement do not redefine operation input, output, effect, access,
  idempotency, audit, or storage semantics

### Requirement: Projection-Only Table Views

The system SHALL define generated tables as read-only record projections with
explicit row-level navigation, mutation, and ordering placements.

#### Scenario: Declare display columns

- GIVEN a table view declares field, reference-field, or computed columns
- WHEN the table view is parsed
- THEN each column selects display data plus optional label, width, alignment,
  format, suffix, or read-only value-unit presentation facts
- AND ordinary field and one-hop referenced-field columns remain display-only
  regardless of whether their source entity fields are writable
- AND a table column that should not be visible is omitted from the ordered
  column declaration
- AND table display columns carry no field editor, field commit, draft,
  reference-item authoring, field-interaction, or visibility-mode choice

#### Scenario: Declare one row operation menu

- GIVEN a table exposes update, delete, command, transition, or other
  record-scoped mutation controls
- WHEN the table view is parsed
- THEN every control comes from an ordered table `operations` binding
- AND one `operationControl` column places all bound operations in one row
  menu in binding declaration order
- AND a binding may select the row record or one referenced record, an edit
  view where applicable, a visible label, destructive semantics, and
  display-safe availability
- AND the table does not derive mutation controls merely because the entity
  declares an available operation

#### Scenario: Declare ordering affordances explicitly

- GIVEN a table supports sparse-rank ordering
- WHEN its table view is parsed
- THEN one table `ordering` declaration identifies the rank field and optional
  field scopes
- AND an `orderingHandle` column places the drag handle independently
- AND the `operationControl` column may include ordering move actions in the
  same row menu
- AND declared column placements determine the available ordering affordances
  without a second ordering-presentation registry

### Requirement: Schema-Declared Record Links

The system SHALL let presentation surfaces declare renderer-neutral record
links whose native URL destinations are derived from structured schema data and
the current flat record snapshot without storing or authoring interpolated URL
strings.

#### Scenario: Parse table record link definitions and placements

- GIVEN a table view declares an ordered `links` registry
- WHEN the table view is parsed
- THEN each link definition has a unique stable key, non-empty visible label,
  target `sameTab` or `newTab`, and a structured URL destination
- AND a structured URL destination declares one absolute base URL and an
  ordered array of query parameter definitions
- AND each query parameter has a unique non-empty name, one value source, and
  optional missing behavior `disable` or `omit`
- AND omitted missing behavior resolves to `disable`
- AND a `linkControl` column references exactly one link definition from the
  containing table view and supplies its row placement
- AND link definitions remain separate from column placements and
  renderer-facing occurrence ids

#### Scenario: Validate record link value sources

- GIVEN a record link query parameter derives a value from schema data
- WHEN its containing table view or relationship-hierarchy node is parsed
- THEN a `literal` source accepts a string, finite number, or boolean
- AND a `field` source references a declared non-reference scalar value field
  on the containing record entity
- AND a `referenceField` source names a declared reference field on the table or
  hierarchy node entity plus a declared non-reference scalar value field on
  that reference's local target entity
- AND the referenced terminal field does not need to appear in the containing
  surface's visible field projection
- AND unknown fields, system fields, non-scalar terminal fields, incompatible
  reference targets, cross-schema reference targets, and traversal beyond one
  reference hop are rejected before the schema reaches generated UI

#### Scenario: Validate record link URL destinations

- GIVEN a record link declares a structured URL destination
- WHEN the schema is parsed
- THEN the base is a valid absolute `https:` or `http:` URL without embedded
  credentials
- AND malformed URLs, protocol-relative URLs, and destinations using
  `javascript:`, `data:`, `file:`, `blob:`, or another undeclared scheme are
  rejected
- AND authored query parameter names do not collide with one another or with
  query parameter names already present in the base URL
- AND URL validation does not fetch the destination, inspect DNS, authorize an
  external service, or make the destination an operation or runtime adapter

#### Scenario: Resolve a deterministic record link URL

- GIVEN a parsed record link, one current record, and the current record map are
  available
- WHEN the runtime-neutral Schema package resolver evaluates the destination
- THEN literal values, direct field values, and one-hop referenced-record field
  values are converted to deterministic scalar query values
- AND string, finite number, and boolean values are encoded through standard
  URL query semantics while preserving `0`, `false`, and the empty string
- AND existing base query parameters retain their order before authored query
  parameters, whose declaration order is preserved
- AND reserved characters, whitespace, parameter names, existing query data,
  and fragments are handled by structured URL construction rather than string
  interpolation
- AND equal schema, row, and record-map inputs produce the same resolved href

#### Scenario: Resolve missing record link inputs

- GIVEN a record link source has no current field value or its reference id is
  absent, resolves to the wrong entity, resolves to a tombstoned record, or
  resolves to no record
- WHEN the structured destination is evaluated
- THEN a parameter with missing behavior `omit` is absent from the resolved URL
- AND a parameter with missing behavior `disable` makes the link destination
  unavailable with a display-safe reason
- AND an unexpected non-scalar runtime value also makes the destination
  unavailable rather than being stringified as an object or throwing through
  presentation
- AND link evaluation does not patch a record, persist a denormalized URL,
  fetch the destination, or change browser replica state

#### Scenario: Place record links on relationship-hierarchy nodes

- GIVEN a selected-record relationship hierarchy needs record-scoped native URL
  navigation in node headers
- WHEN its root or one recursive child declaration provides an ordered `links`
  array
- THEN each entry is one keyed record-link definition validated against that
  node's entity
- AND declaration order is link-action order in that node's one header menu
- AND the declaration itself supplies the hierarchy placement without a second
  link registry or action-placement array
- AND hierarchy links reuse table record-link labels, targets, structured
  destinations, value sources, missing behavior, and URL validation
- AND they do not become entity operations or redefine operation semantics

#### Scenario: Keep record link definitions reusable across surfaces

- GIVEN table and relationship-hierarchy placements use record links
- WHEN record-link contracts and resolution helpers are exposed by the Schema
  package
- THEN their definition, value-source, target, missing-value, and URL-resolution
  semantics remain independent from either renderer
- AND a later list, record-result, item-view, or other record-scoped placement
  can reuse those contracts without introducing an app-specific link language
- AND current placements do not synthesize list, record-result, workspace,
  screen, or collection-toolbar links

### Requirement: Schema Package Boundary

The system SHALL expose reusable App schema language contracts, parsers, and
pure helpers through the Schema package slice.

#### Scenario: Package owns app schema interface

- **WHEN** generated UI models, Authority validation, browser replicas, archive
  planning, archive validation, upgrade migrations, tests, or other package
  slices need App schema types, parse behavior, stringify behavior,
  schema-local entity key helpers, qualified entity name helpers, field
  behavior, query helpers, read model helpers, create-default helpers, runtime
  metadata helpers, record-link helpers, operation capability facts, or derived
  command capability facts
- **THEN** they import those contracts and helpers from
  `@dpeek/formless-schema`
- **AND** they do not import package-owned schema behavior from unexported
  package internals

#### Scenario: Package does not own runtime Program records

- **WHEN** App schema behavior is used to compose or load a complete Program
  schema, render generated React surfaces, validate Authority writes,
  store active schemas, sync browser replicas, plan or apply archives, compose
  Workspace storage snapshots, or build instance control-plane records
- **THEN** those runtime behaviors remain owned by app, client, Worker,
  archive, Workspace, instance control-plane, or generated UI modules
- **AND** the Schema package only owns runtime-neutral schema language
  contracts, parser/formatter behavior, field/query/read-model helpers, and
  package-local deterministic tests

### Requirement: Entity Key Grammar

The system SHALL validate schema-local entity keys as singular kebab-case data
names.

#### Scenario: Parse schema-local entity key

- WHEN an app schema declares entity keys such as `block`, `app-install`, or
  `deployment-config`
- THEN schema parsing accepts those keys as local entity names
- AND the entity keys remain unqualified on definitions inside the schema's
  `entities` registry

#### Scenario: Reject non-canonical entity key

- WHEN an app schema declares an entity key with uppercase characters,
  camelCase, underscores, dots, slashes, colons, leading digits, leading
  hyphens, trailing hyphens, double hyphens, or an empty value
- THEN schema parsing rejects the schema before generated UI, Authority writes,
  or browser replicas use it

#### Scenario: Leave other schema keys unchanged

- WHEN an app schema declares fields, queries, read models, views, screens,
  operations, or operation bindings
- THEN this entity-key grammar does not rename or normalize those keys
- AND existing validation for those schema sections remains separately owned by
  their current parser rules

### Requirement: Stable Entity Identity

The system SHALL give every App schema entity one opaque stable entity id that
is independent of its current key, module ownership, and declaration order.

#### Scenario: Parse stable entity id

- GIVEN an App schema declares an entity
- WHEN the schema is parsed
- THEN the entity carries a required id in canonical
  `entity_<lowercase-uuid>` form
- AND the complete schema rejects missing, malformed, or duplicate entity ids
- AND the entity id remains portable data in TypeScript source, materialized
  schema JSON, parsed schema, canonical schema bytes, and source-schema hashing

#### Scenario: Allocate entity identity once

- GIVEN trusted authoring introduces a new logical entity
- WHEN its identity is allocated
- THEN the opaque entity id is generated once and persisted in authoritative
  schema source
- AND parsing, module composition, materialization, hashing, and runtime loading
  do not generate or replace the id
- AND entity key, label, schema key, source path, module key, module order, and
  declaration order do not derive entity identity

#### Scenario: Preserve identity through recomposition

- GIVEN a schema module is moved, recomposed, or ejected into project ownership
- WHEN it continues to represent the same logical entity
- THEN it preserves the entity id
- AND a genuinely new logical entity receives a new entity id
- AND composition rejects two entity declarations with the same key or the
  same entity id rather than merging or rebinding them

#### Scenario: Keep current entity names addressable

- GIVEN an entity has a stable id and a schema-local key
- WHEN fields, relationships, queries, views, operations, records, workspaces,
  archives, or diagnostics address the entity in the current App schema
- THEN existing entity-key and qualified-entity-name contracts remain the
  addressable name boundary
- AND adding stable entity identity does not silently rename stored record
  entity values, rewrite schema references, allocate field slots, or add stable
  ids to every other definition registry

### Requirement: Field Key Grammar

The system SHALL use camelCase field keys for entity field identifiers.

#### Scenario: Declare entity fields

- WHEN an app schema declares entity fields
- THEN field keys use lower camelCase identifiers such as `appInstall`,
  `matchPath`, `providerConfig`, and `createdAt`
- AND kebab-case remains reserved for entity keys, not field keys

#### Scenario: Reference kebab-case entity from camelCase field

- WHEN a field references an entity such as `app-install`
- THEN the field key remains camelCase
- AND the reference target remains the local kebab-case entity key

### Requirement: Qualified Entity Names

The system SHALL represent addressable entity names as
`<schema-key>:<entity-key>` at cross-schema and external boundaries while
preserving opaque entity identity separately.

#### Scenario: Emit external qualified entity name

- WHEN records are written to archives, workspace record state, drift reports,
  logs, diagnostic output, or another external boundary that combines schema
  record families
- THEN the entity name is represented with a qualified name such as
  `site:block` or `instance:app-install`
- AND the right-hand side uses the local kebab-case entity key
- AND the qualified name remains a current addressable name rather than the
  entity's stable id

#### Scenario: Keep schema-internal references local

- WHEN a schema-internal reference field targets another entity in the same
  schema
- THEN the reference target uses the local entity key
- AND it does not store the schema namespace prefix in the reference target

#### Scenario: Cross-schema reference uses qualified target

- WHEN a schema explicitly introduces a reference to an entity owned by a
  different schema
- THEN the reference boundary identifies the target entity with a qualified
  entity name
- AND normal record values remain flat reference values

#### Scenario: Declare identity reference targets

- GIVEN an app schema declares a reference field targeting `auth:principal`,
  `auth:organization`, or `auth:group`
- WHEN the schema is parsed
- THEN the field is accepted as a supported cross-schema identity reference
- AND the declaring app schema does not define or own the target identity
  entity
- AND schema-internal references to entities in the same schema still use local
  entity keys without a schema namespace prefix
- AND relationships, reference-field table columns, and local read-model
  traversal do not treat cross-schema identity references as local relationship
  endpoints

#### Scenario: Validate identity reference values

- GIVEN an app record write stores a value for a field targeting
  `auth:principal`, `auth:organization`, or `auth:group`
- WHEN the Authority validates the write, operation record plan, or restored
  snapshot
- THEN the field value remains a flat record id
- AND the runtime resolves the referenced record from the identity entity in
  Program storage identity `instance:control-plane`
- AND validation rejects missing, tombstoned, wrong-entity, unsupported
  qualified-target, or unavailable Program storage targets before committing
  the app record
- AND principal status, role assignments, credentials, sessions, and
  authorization policy remain identity auth and operation-policy concerns
  rather than nested app record state

### Requirement: Flat Record Model

The system SHALL store entity records as flat values and SHALL keep relationships as schema metadata over reference fields.

#### Scenario: Preserve flat records with relationships

- GIVEN an app schema declares `toOne`, `toMany`, or `manyToMany` relationships
- WHEN records are stored or synced
- THEN records keep flat field values
- AND no nested relationship value is persisted for the relationship itself

#### Scenario: Represent many-to-many membership

- GIVEN a `manyToMany` relationship uses a through entity with reference fields for both sides
- WHEN relationship membership is created
- THEN through entity records represent the membership
- AND the endpoint references remain normal flat field values

### Requirement: Query And Collection Results

The system SHALL let collection views select records through schema-declared queries and result types `list`, `record`, `table`, and `tree`.

#### Scenario: Ordered collection result

- GIVEN a collection result with ordering over a non-integer number field and optional field scopes
- WHEN the result model is selected
- THEN matching records can be ordered through the declared rank field
- AND `list`, `table`, and `tree` results honor result-level ordering

#### Scenario: Declare one recursive inline tree result

- GIVEN a collection view projects flat placement records and referenced child
  records as a tree
- WHEN its `tree` result is parsed
- THEN the result declares the to-many placement relationship, the placement
  reference field that identifies each child record, and one child item view
- AND it may declare placement ordering, finite branch and child-variant policy,
  tree composition operations, and a maximum traversal depth
- AND the child item view owns block record presentation while placement records
  remain flat composition edges used for attachment, ordering, removal, and
  diagnostics
- AND the tree result has one recursive inline editor presentation without a
  presentation-mode choice or placement item view

#### Scenario: Bind list operation input into query context

- GIVEN a list operation declares required scalar input and references a query
  whose equality predicates use context values
- WHEN the operation is parsed and invoked
- THEN validated input values are available to query evaluation by declared
  operation input name
- AND text, boolean, date, number, and enum input values can satisfy compatible
  equality predicates over entity value fields
- AND callers cannot supply a query name, entity name, field reference,
  expression, ordering, projection, or result limit

#### Scenario: Constrain anonymous list lookup

- GIVEN a list operation declares anonymous public access
- WHEN the schema is parsed
- THEN its output declares a positive `maxResults` within the parser-owned
  public read ceiling
- AND every matching path through the referenced query contains an exact
  equality predicate bound to a required declared scalar input
- AND `responseFields.anonymous` declares one or more value fields on the query
  entity
- AND a query branch that can match without required input equality, an
  undeclared context value, a system-field response, an empty response
  projection, or an unbounded output is rejected
- AND these constraints do not expose a generic app query or listing interface

### Requirement: Shared View Field Interaction

The system SHALL let shared item- and edit-view field bindings declare whether
an ordinary entity field is editable or display-only, and SHALL validate that
interaction once as portable view schema.

#### Scenario: Declare a display-only view field

- GIVEN an item or edit view includes a shared field binding for an ordinary
  writable entity field
- WHEN the binding declares display interaction
- THEN the field remains an ordered member of the view and projects through its
  normal display formatting contract
- AND generated record results, list fields, item views, edit views, and row
  edit dialogs that consume the binding do not expose draft, commit, patch,
  picker, upload, or transition interaction for that occurrence
- AND neighboring editable bindings retain their declared editor, derived
  commit behavior, visibility, presentation, state-machine, validation, media,
  and union behavior

#### Scenario: Reject invalid view field interaction

- GIVEN a shared view field binding declares an unknown interaction value or
  otherwise contradicts the referenced field behavior
- WHEN the complete schema is parsed
- THEN parsing fails before the view reaches generated UI
- AND omission retains the ordinary editable behavior for writable entity
  fields

#### Scenario: Derive existing-record field commit behavior

- GIVEN an editable item- or edit-view field binding selects an editor for an
  ordinary writable entity field
- WHEN the complete schema is parsed
- THEN field and editor behavior derive whether the runtime commits on change
  or through an explicit field commit
- AND the authored field binding does not choose a second commit policy that
  can contradict the selected field and editor behavior
- AND generated runtime and Presentation contracts retain the derived commit
  mode needed to execute and render existing-record authoring

### Requirement: Item View Summary Presentation

The system SHALL let an item view select either its existing field-based record
presentation or a compact renderer-neutral summary presentation whose visible
content comes from declared entity fields.

#### Scenario: Declare title and subtitle summary slots

- GIVEN an item view declares `presentation.type: "summary"`
- WHEN the item view is parsed
- THEN `presentation.slots.title.field` references one declared field on the
  item view entity
- AND `presentation.slots.subtitle.field` may reference one declared field on
  the same entity
- AND title is required while subtitle is optional
- AND the slot declarations remain field-value projections rather than stored
  summary data, read models, callbacks, templates, or renderer properties

#### Scenario: Keep summary and field item views distinct

- GIVEN an item view declares summary presentation
- WHEN the complete schema is parsed
- THEN it does not also declare editable field bindings, union variants, or a
  union fallback
- AND summary presentation exposes exactly title and optional subtitle slots
- AND status, badge, icon, action, operation, editor, and arbitrary named slots
  are rejected
- AND an item view without summary presentation retains the existing ordered
  field-based record presentation

#### Scenario: Reject invalid summary slot fields

- GIVEN a summary item view omits its title, references an unknown or
  wrong-entity field, repeats a field through unsupported slot data, or
  declares a field whose value cannot be projected as display-safe text
- WHEN the item view is parsed
- THEN parsing fails
- AND the invalid item view is not materialized, hashed, or exposed to
  generated UI

### Requirement: Screens And Navigation

The system SHALL require app schemas to define one or more screens that own
app-relative navigation, SHALL let generated workspace screens compose
collection views, SHALL let runtime-owned screens bind custom presentation by
stable screen key, and SHALL let a composition root present selected screens
through either flat or grouped navigation whose ordered screen lists may
contain one level of destination-less labelled sections.

#### Scenario: Root screen fallback

- GIVEN a non-empty screen registry has no explicit root path
- WHEN primary navigation screens are selected
- THEN omitted `navigation.primaryScreens` selects every screen in declaration
  order
- AND a declared `navigation.primaryScreens` array selects and orders its
  referenced screen subset, including screens nested in navigation sections
- AND declared `navigation.groups` selects screens in group order and nested
  navigation-entry order
- AND the first selected pathless screen receives the app-relative `/` path
- AND every navigation reference resolves to a declared screen

#### Scenario: Parse grouped screen navigation

- GIVEN an app schema declares `navigation.groups`
- WHEN the complete schema is parsed
- THEN every group has a unique non-empty key, a non-empty label, and a
  non-empty ordered array of screen or navigation-section entries
- AND a screen may appear in at most one navigation group
- AND screens omitted from every group remain outside primary navigation
- AND an omitted screen with an explicit path remains directly routeable under
  its existing screen access and runtime-profile rules
- AND group order and nested screen order select the flattened primary screen
  order for root fallback and route-path uniqueness
- AND `navigation.groups` and `navigation.primaryScreens` are mutually
  exclusive so membership and order have one source

#### Scenario: Parse one-level screen navigation sections

- GIVEN a flat primary-screen list or grouped workspace screen list contains a
  navigation section
- WHEN the complete schema is parsed
- THEN the section has a stable non-empty key, non-empty label, optional
  renderer-neutral semantic icon id, and a non-empty ordered screen list
- AND the section is presentation-only and has no path, destination, route
  admission, selection state, storage identity, or Program boundary
- AND ordinary screen entries before and after the section retain their exact
  order with the section's child screens
- AND a child screen may use its string key shorthand or an object reference
  carrying navigation presentation
- AND section children are only screen references, so another section cannot
  be nested below them
- AND section keys are unique within their containing screen list and screen
  keys remain unique across the complete primary navigation selection

#### Scenario: Declare a screen query-count badge

- GIVEN a navigation screen reference requests a `queryCount` badge for one
  named collection section on that workspace screen
- WHEN the complete schema is parsed
- THEN the named screen section exists and binds one declared query from its
  referenced collection view
- AND the bound query can be evaluated without interactive context values
- AND the badge declaration remains portable navigation presentation rather
  than a stored count, read-model record, query expression, or route parameter
- AND a badge on a runtime-owned screen, missing section, unbound section,
  context-dependent query, or undeclared query is rejected

#### Scenario: Reject invalid grouped navigation

- GIVEN grouped navigation contains a duplicate group key, empty label, empty
  screen array, invalid navigation section, undeclared screen key, duplicate
  screen within or across groups or sections, or a simultaneous
  `primaryScreens` declaration
- WHEN the schema is parsed
- THEN parsing fails
- AND invalid grouped navigation is not materialized, hashed, or exposed to
  generated UI

#### Scenario: Reject missing screens

- GIVEN an app schema omits screens or declares an empty screen registry
- WHEN the schema is parsed
- THEN parsing fails
- AND no collection-navigation fallback is synthesized

#### Scenario: Reject invalid primary screen selection

- GIVEN `navigation.primaryScreens` contains a duplicate or undeclared screen
  key directly or within a navigation section
- WHEN the schema is parsed
- THEN parsing fails
- AND invalid navigation is not exposed to generated UI

#### Scenario: Select explicit root screen

- GIVEN a selected primary screen explicitly declares the root path
- WHEN app-relative routes are built
- THEN it receives the app-relative `/` path
- AND no other screen is assigned the same path

#### Scenario: Screen section references collection view

- GIVEN a workspace screen with collection sections
- WHEN the schema is parsed
- THEN each section references an existing collection view
- AND valid sections are available in schema order

#### Scenario: Bind a screen section to one collection query

- GIVEN a workspace screen collection section declares a query binding
- WHEN the schema is parsed
- THEN the query is one of the referenced collection view's declared query
  slots
- AND the screen section is bound to that one query rather than inheriting the
  collection view's default query and query navigation
- AND another screen may reuse the same collection view with a different bound
  query without duplicating the view, result, fields, or query expression
- AND omission retains the collection view's existing default-query and query-
  navigation behavior
- AND an undeclared query or query outside the referenced collection view is
  rejected

#### Scenario: Compose selected-record detail from a collection section

- GIVEN a workspace collection section presents one selected record from its
  referenced collection
- WHEN the section declares `detail` with type `selectedRecord`
- THEN the referenced collection result is a list whose entity is the selected
  record entity
- AND the detail declares a non-empty context name plus non-empty ordered
  record, relationship, and relationship-hierarchy sections with unique stable
  ids
- AND a record section references an item view for the selected record entity
  so ordered editable and read-only field projection remains owned by the item
  view
- AND a relationship section references a to-many relationship that starts at
  the selected record entity, a query for the relationship target entity, and a
  table result whose table view uses that target entity
- AND a relationship-hierarchy section references one field item view for the
  selected record root plus a finite ordered declaration of child relationships
- AND the selected-record detail composes projections without nesting or
  changing stored records

#### Scenario: Declare a selected-record relationship hierarchy

- GIVEN selected-record detail must author one heterogeneous hierarchy rooted
  at the selected record
- WHEN a detail section declares type `relationshipHierarchy`
- THEN the section declares one field item view for the selected root entity,
  optional ordered root record-link definitions, optional root record-operation
  bindings, and a non-empty ordered array of child relationship declarations
- AND each child declaration has a stable id, references a to-many relationship
  whose source is the current node entity, references a field item view for the
  relationship target entity, and may recursively declare the next fixed child
  relationships
- AND each child declaration may provide a display label for its relationship
  group plus ordered record-link definitions and record-operation bindings for
  its target record entity
- AND sibling declaration ids are unique, relationship order is schema order,
  and the finite declaration fixes every permitted entity and relationship path
- AND the hierarchy stores no nested arrays, placement records, projection
  records, selection state, disclosure state, query, or traversal callback

#### Scenario: Bind relationship-hierarchy record operations

- GIVEN a relationship-hierarchy root or child node declares operation bindings
- WHEN the complete schema is parsed
- THEN each binding references a browser-visible record-scoped operation for
  that node entity and may override only its visible label
- AND the binding does not redefine operation access, input, output, effect,
  audit, idempotency, transition validity, confirmation, or execution semantics
- AND an operation for another entity, a collection-scoped operation, an
  unknown operation, or an unsupported binding value is rejected

#### Scenario: Bind relationship-hierarchy child creation

- GIVEN a relationship-hierarchy child declaration exposes ordinary target
  record creation from its current parent node
- WHEN the child declaration binds a create action
- THEN the binding references an ordinary create view and browser-visible
  collection-scoped create operation for the child relationship target entity
- AND the create view defaults the relationship's exact target reference field
  from one named context value
- AND runtime derives that context name from the attachment default and scopes
  its current parent record value to the path-scoped record occurrence
- AND the binding stores no nested target data and expresses attachment through
  ordinary flat target fields
- AND an unknown or mismatched relationship, source or target entity, create
  view, create operation, missing attachment default, incompatible default, or
  unsupported binding value is rejected

#### Scenario: Bind a selected-record relationship action

- GIVEN a selected-record relationship section places an operation beside its
  heading
- WHEN the complete schema is parsed
- THEN the binding references a browser-visible record-scoped source operation
  on the selected record entity
- AND placement may select the visible label and heading location without
  redefining operation access, input, output, effect, audit, idempotency,
  transition validity, confirmation, or execution semantics
- AND an operation for another entity, a collection-scoped operation, an
  unknown operation, or an unsupported placement is rejected

#### Scenario: Bind a selected-record relationship create surface

- GIVEN a selected-record relationship section places a create action beside
  its heading
- WHEN the complete schema is parsed
- THEN the section's optional `createAction` declares a canonical `operation`,
  ordinary `createView`, `placement: "heading"`, and optional label
- AND the create view and browser-visible collection-scoped create operation
  use the section relationship target entity
- AND the create view defaults the relationship's exact target reference field
  from the selected-record detail context name, whose runtime query context
  resolves to the selected source record id
- AND the binding stores no nested target data and expresses attachment through
  ordinary flat target fields
- AND an unknown or mismatched relationship, source or target entity, create
  view, create operation, unavailable context, missing attachment default,
  incompatible default, or unsupported placement is rejected

#### Scenario: Keep selected-record detail distinct from collection context

- GIVEN a collection section declares selected-record detail or its referenced
  collection declares context presentation
- WHEN the complete schema is parsed
- THEN selected-record detail selects from that collection's own result while
  collection context continues to select a separate context record for query
  evaluation and related-result presentation
- AND `context.presentation: "listDetail"` is not inferred from selected-record
  detail and selected-record detail does not synthesize a collection context

#### Scenario: Declare runtime-owned screen presentation

- GIVEN a screen declares `type: "runtime"`
- WHEN the schema is parsed
- THEN the screen carries its stable key, label, optional path, and access
  requirement without declaring a workspace layout or referencing views
- AND the screen remains eligible for ordinary flat or grouped navigation,
  path selection, source hashing, and Program screen authorization
- AND a trusted runtime may bind custom presentation to the stable screen key
  without placing callbacks, module paths, component names, or executable code
  in portable schema data
- AND a runtime-owned screen that declares workspace layout or view data is
  rejected

#### Scenario: Screen layout width

- GIVEN a workspace screen layout declares a semantic width
- WHEN the schema is parsed
- THEN `narrow`, `standard`, and `wide` are accepted
- AND an omitted width resolves to `standard`
- AND any other width is rejected
- AND the width does not declare pixel dimensions, responsive breakpoints,
  presentation class names, or renderer-specific properties

#### Scenario: Screen surface extent

- GIVEN a workspace screen layout declares a semantic surface extent
- WHEN the schema is parsed
- THEN `constrained` and `full` are accepted
- AND an omitted surface extent resolves to `constrained`
- AND constrained layouts may use the existing `narrow`, `standard`, or `wide`
  semantic width
- AND full layouts fill the application shell's available inline and block
  extent without declaring a width
- AND any other extent or a width on a full layout is rejected
- AND surface extent does not declare pixel dimensions, pane proportions,
  responsive breakpoints, scrolling implementation, presentation class names,
  or renderer-specific properties

#### Scenario: Screen access policy

- GIVEN a screen declares access policy
- WHEN the schema is parsed
- THEN `access` is parsed as the shared access requirement against the complete
  schema's root-owned role catalog
- AND a screen accepts a direct `{ role }`, a browser actor requirement for
  `anonymous`, `authenticated`, or `owner`, or a non-empty flat `anyOf` of
  those direct requirements
- AND role requirements use the ordered role catalog so a later ordinary role
  satisfies an earlier role requirement and protected owner authority
  satisfies every ordinary role requirement
- AND screen admission remains additional to the access required by its
  mounted route
- AND a non-Program app screen may omit `access` to inherit only its mounted
  route access

#### Scenario: Require explicit Program screen access

- GIVEN a complete App schema is selected as the active Program schema
- WHEN the Program artifact is materialized or loaded for runtime use
- THEN every Program screen declares an explicit browser-applicable access
  requirement
- AND a missing or unresolved Program screen requirement fails closed before
  navigation or route admission
- AND module keys, schema keys, screen keys, entity keys, and declaration paths
  do not become runtime authorization identities

#### Scenario: Reject invalid screen access

- GIVEN a screen declares an unsupported access value, an unresolved
  role key, `runner`, `deployer`, `adminBearer`, an empty alternative list, a
  nested alternative list, or more than one requirement form
- WHEN the schema is parsed
- THEN parsing fails
- AND the invalid screen is not made available for generated UI navigation
- AND trusted runtime actors remain available only to resource contracts whose
  runtime channels can supply those actors

### Requirement: Entity Unions

The system SHALL model unions as schema metadata over flat entity records.

#### Scenario: Discriminator-backed union

- GIVEN an entity union declares a discriminator field
- WHEN the schema is parsed
- THEN the discriminator is a required enum field on the union entity
- AND variant keys match discriminator enum values
- AND no separate union value is stored in Authority storage or sync

#### Scenario: Variant coverage

- GIVEN a union has no fallback variant
- WHEN the schema is parsed
- THEN every discriminator enum value must be represented by a variant
- AND variant fields and required fields must reference fields on the same
  entity

### Requirement: Read Models

The system SHALL compute read-model values for display and SHALL NOT persist read-model values in records, writes, storage, or sync.

#### Scenario: Aggregate display output

- GIVEN aggregate read models over query results
- WHEN matching records are empty or contain bad aggregate values
- THEN empty `count` and `sum` render `0`
- AND empty `average`, `min`, and `max` render empty output
- AND bad runtime aggregate values are skipped

### Requirement: Field Behavior And Presentation

The system SHALL use field behavior to define validation, defaults, conversion, display, and editor metadata for scalar and reference fields.

#### Scenario: Declare a portable icon catalog

- GIVEN package or product schema modules contribute keyed icon definitions
- WHEN the complete App schema is composed and parsed
- THEN each icon definition has a stable key, display label, optional group,
  and display-safe SVG source
- AND module icon declarations flatten into one ordered top-level `icons`
  registry through ordinary declaration ownership and collision rules
- AND the complete schema rejects duplicate icon keys and invalid or unsafe SVG
  sources before runtime projection
- AND a schema icon definition takes precedence over the baked runtime icon
  with the same key while undeclared baked icons remain available as defaults
- AND icon definitions remain schema data rather than Program records, media
  objects, executable runtime extensions, or renderer components

#### Scenario: Compose baked icon defaults from shared sources

- GIVEN the runtime supplies baked icon defaults alongside schema-declared icons
- WHEN it builds resolution data or picker options
- THEN each baked SVG source comes from the renderer-neutral built-in icon
  source package under its stable key
- AND picker labels, groups, and search terms remain separate runtime metadata
  joined to those sources only for authoring surfaces
- AND resolution-only consumers do not need picker metadata or renderer
  components
- AND the baked defaults include the `formless` product icon

#### Scenario: Declare icon value interpretation

- GIVEN a text field declares `format` `icon`
- WHEN its optional icon behavior is parsed
- THEN `valueMode` accepts `svgSource`, `iconIdWithSvgFallback`, or `iconId`
- AND omission defaults to `svgSource` so existing schemas retain source-backed
  behavior
- AND `iconIdWithSvgFallback` accepts an icon catalog key or a safe legacy SVG
  source while authoring new catalog selections as keys
- AND `iconId` accepts catalog-key-shaped stored text without requiring the key
  to remain resolvable in the current catalog
- AND raw SVG source is invalid under `iconId`
- AND icon behavior is rejected on non-icon fields
- AND all three modes retain one optional or required flat text field rather
  than introducing a reference field or changing record shape

#### Scenario: Preserve typed scalar values

- GIVEN date and number fields receive create or inline inputs
- WHEN values are accepted
- THEN date fields preserve `YYYY-MM-DD` values
- AND number fields store numbers

#### Scenario: Declare asset-backed media authoring

- GIVEN a text field stores a reference to an owned image or document media
  asset
- WHEN schema field behavior selects editor and control metadata
- THEN the field uses the `media` editor and asset-backed media control
- AND the stored field value remains a flat media asset id
- AND the field editor vocabulary does not define a separate image editor or
  raw image URL authoring mode

#### Scenario: Declare document asset policy

- GIVEN a text field is authored for owned document media
- WHEN the source schema declares document asset policy
- THEN the policy declares kind `document`, a non-empty list of normalized
  accepted MIME types, a positive maximum byte size, and access `public` or
  `private`
- AND the `media` editor is available for that text field
- AND current document support accepts `application/pdf` while rejecting
  unsupported document MIME types
- AND the maximum byte size cannot exceed the runtime-owned document upload
  ceiling
- AND the parsed field policy is trusted runtime input for app-scoped upload and
  selection rather than browser-owned policy
- AND document asset policy is rejected on non-text fields

#### Scenario: Validate contact-shaped text formats

- GIVEN a text field or inline text operation input declares `format` `email`
  or `phone`
- WHEN schema field behavior validates accepted input for Authority storage,
  operation input projection, or public form coercion
- THEN validation uses one shared runtime-neutral text format validator
- AND accepted email and phone values are trimmed before storage
- AND email format requires exactly one `@`, rejects whitespace and control
  characters, requires non-empty local and domain parts, requires plausible
  dot-separated domain labels, caps length, and does not perform DNS, MX, or
  full RFC address validation
- AND invalid email input returns the user-facing message
  `Enter an email address like name@example.com.`
- AND optional blank phone input remains omitted
- AND phone format allows digits plus common separators `+`, `-`, `.`, `(`,
  `)`, and spaces, requires 7 to 15 digits, allows `+` only at the start,
  stores the trimmed original text, and does not perform country-specific
  formatting or E.164 normalization
- AND invalid phone input returns the user-facing message
  `Enter a phone number using digits and common separators.`

#### Scenario: Declare open text suggestions

- GIVEN a text field or inline text operation input declares `suggestions`
- WHEN the schema is parsed
- THEN `suggestions` is a non-empty array of non-empty strings
- AND suggestions are presentation metadata for text inputs, not enum values
- AND field validation accepts any text value allowed by the text field format
  instead of restricting stored values to the suggestions

#### Scenario: Validate presentation modes

- GIVEN presentation mode `iconOnly`, `completion`, or `valueOrInteraction`
- WHEN the schema is parsed
- THEN `iconOnly` requires an enum field
- AND `completion` requires a boolean field
- AND `valueOrInteraction` requires an optional date field

### Requirement: Record System Fields

The system SHALL expose record system fields as schema-addressable metadata
separate from entity value fields.

#### Scenario: Address record metadata

- GIVEN runtime code builds the field catalog for an entity
- WHEN the entity's addressable fields are inspected
- THEN system fields include `id`, `createdAt`, `updatedAt`, and `deletedAt`
- AND those fields provide labels, display type metadata, and query/display
  references without being stored in the record's flat `values`
- AND record lifecycle timestamps use system field references rather than
  entity value fields named `createdAt` or `updatedAt`

#### Scenario: Keep system fields non-writable

- GIVEN an operation input, generated create/edit view, public form, CLI write,
  automation write, or record-plan step targets record fields
- WHEN the target is a system field
- THEN schema parsing or Authority validation rejects the write target
- AND callers cannot provide, patch, unset, or override system field values
- AND generated ids and generated timestamps may still be used for normal value
  fields declared by the entity schema

### Requirement: Operation Command Execution

The system SHALL represent command behavior through declarative record plans or
operation-native handler effects.

#### Scenario: Compose tree child through a handler

- GIVEN an operation handler effect composes a relationship-backed tree result
- WHEN the owning command operation is invoked
- THEN one child record and one placement edge are created
- AND the paired placement removal handler tombstones the placement edge without
  deleting the child record

#### Scenario: Operation handler module dispatch

- GIVEN a command operation references an operation handler kind
- WHEN runtime and generated UI select behavior for that operation
- THEN generic operation handler capability facts drive runtime eligibility, UI
  input facts, public eligibility, and response filtering for runtime-owned
  handler kinds
- AND an adapter-backed handler declares an authoring-only runtime requirement
  that trusted Program composition satisfies with one explicitly selected
  operation adapter
- AND the handler key does not discover, import, activate, or authorize that
  adapter
- AND the operation remains the invocation, authorization, idempotency, and
  audit root for the command write
- AND handler dispatch uses the operation invocation envelope and typed handler
  configuration

#### Scenario: Declare operation handler input expectations

- GIVEN a command operation references an operation handler kind
- WHEN runtime, generated UI, public execution, or tests inspect that handler
- THEN handler capability facts may describe structural input expectations such
  as required object fields, required text fields, string record ids, arrays of
  string record ids, or scalar record-value maps
- AND handler input expectation facts are named by handler kind and remain
  separate from operation input field declarations and handler configuration
- AND handler input expectation facts do not own handler business rules,
  storage-backed record lookup, relationship target validation, tombstone
  checks, record value validation, provider calls, or writes

### Requirement: Entity Operations

The system SHALL let app schemas declare entity-local operations as the shared
interaction contract for generated UI, Authority execution, protocol bindings,
public forms, automation, audit, and authorization.

#### Scenario: Parse entity-local operation

- GIVEN an entity definition declares operations under `entities[].operations`
- WHEN the schema is parsed
- THEN each operation key is scoped to that containing entity
- AND the runtime derives a canonical operation key as
  `<entityKey>.<operationKey>`
- AND top-level or cross-entity operation declarations are rejected until a
  later schema contract introduces them

#### Scenario: Validate operation kind and scope

- GIVEN an entity operation is declared
- WHEN the schema is parsed
- THEN the operation kind is `list`, `get`, `create`, `update`, `delete`, or
  `command`
- AND the operation scope is `collection` or `record`
- AND `public` is rejected as an operation scope because public exposure is an
  actor policy and binding
- AND `selection` and `workflow` remain reserved until their contracts are
  introduced

#### Scenario: Parse operation actor policy

- GIVEN an entity operation declares actor policy
- WHEN the schema is parsed
- THEN operation actors may include `anonymous`, `authenticated`, `owner`,
  `admin`, `cliDeployer`, or `runner`
- AND `authenticated` means any active principal with a valid instance or
  host-local session for the target storage identity can invoke the operation
- AND `owner` means an active principal with active `instance.owner` authority
  can invoke the operation
- AND browser Program operation authorization comes from the operation's
  top-level access requirement rather than package or app-install scope
- AND response field filters may be keyed by each declared actor kind
- AND response field filters select command output payload field names,
  including fields written by record-plan steps whose entity differs from the
  operation entity, or value fields projected from public list results
- AND anonymous public access still requires the explicit anonymous operation
  access policy and public input contract

#### Scenario: Reuse entity fields in operation input

- GIVEN an operation input field references an entity field
- WHEN the schema is parsed
- THEN the referenced field must exist on the containing entity
- AND field behavior, validation, labels, defaults, and generated editor facts
  can be reused for that operation input
- AND inline scalar input fields can be declared for command or list input that
  is not automatically materialized as a record value

#### Scenario: Declare affirmative boolean operation input

- GIVEN an operation declares an entity-backed or inline boolean input
- WHEN the input declares `required: true` and `mustBeTrue: true`
- THEN parsing preserves the affirmative acceptance constraint
- AND the constraint is rejected for non-boolean inputs, non-required inputs,
  or declaration values other than literal `true`
- AND ordinary required boolean fields without `mustBeTrue` continue to accept
  explicit `false`

#### Scenario: Keep operation input names as the interaction contract

- GIVEN an operation declares input fields
- WHEN callers, public forms, command handlers, or record plans refer to
  operation input
- THEN those surfaces use the declared operation input field names
- AND create and update materialization may map entity-backed operation input
  fields to stored entity field names only at the record write layer
- AND operation handlers and record-plan input expressions continue to receive
  operation input names rather than stored entity field names

#### Scenario: Project operation input values from schema facts

- GIVEN an operation declares input fields
- WHEN the schema package projects submitted operation input
- THEN projection uses the declared operation input field names as the external
  contract
- AND projection derives required flags, inline scalar validation, entity-backed
  field targets, and storage-free scalar field behavior from the parsed schema
- AND boolean input with `mustBeTrue: true` rejects any submitted value other
  than boolean `true`
- AND inline scalar operation input validation uses the same field behavior
  validators as entity-backed operation input validation
- AND projection can return operation-input keyed values for command handlers
  and record plans
- AND projection can return entity-field keyed values for create and update
  record-write materialization
- AND inline input remains operation-input keyed and is absent from entity-field
  record-write projections
- AND projection remains storage-free and does not own caller-specific
  validation entrypoints, target app storage identity, public challenge policy,
  operation execution routing, or operation invocation audit state
- AND active reference lookup, tombstone state, unique constraints, idempotency,
  audit rows, challenge proof validation, source routing, and writes are not
  schema facts

#### Scenario: Validate operation effects

- GIVEN an entity operation declares an effect
- WHEN the schema is parsed
- THEN first-pass effects support creating one record, patching one record,
  deleting or tombstoning one record, dispatching one operation handler, or
  executing a declarative record plan
- AND create, update, and delete effects target the containing entity
- AND command handler effects can reference declared schema queries,
  relationships, state machines, fields, and handler configuration from the
  same schema

#### Scenario: Validate command record plan

- GIVEN a command operation declares effect type `recordPlan`
- WHEN the schema is parsed
- THEN the effect is valid only for command operations
- AND the plan contains an ordered list of named steps
- AND the effect declares steps under `steps[]` with step `name`, step `kind`,
  target `entity`, create or patch `values`, and patch, delete, or tombstone
  `recordId` expressions
- AND each step creates, patches, deletes, or tombstones one flat record in a
  declared entity from the same schema
- AND step values may reference operation input fields, literal scalar values,
  generated ids, generated human-readable codes, generated timestamps,
  generated dates, actor/source context, outputs from earlier steps, and the
  invocation target when the containing operation is record-scoped
- AND operation input that is not referenced by a record-plan step is not
  materialized as a record value
- AND generated human-readable code expressions declare a named alphabet, either
  one length or grouped segment lengths, an optional group separator, and an
  optional literal prefix
- AND generated human-readable code expressions are valid for step values, not
  record id expressions
- AND generated date expressions declare an explicit IANA time-zone identifier
  and are valid only for declared date fields
- AND generated timestamps remain ISO instant values and are not implicitly
  truncated to satisfy date fields
- AND record id expressions use input, literal scalar, generated id, earlier
  step id output, or record-scoped target record id expressions
- AND field values target declared fields on the step entity
- AND reference field values use a reference expression whose entity matches the
  declared reference target and whose id resolves to a flat record id
- AND `targetRecordId` resolves to the invocation target record id and may
  populate a compatible plain-text value or a reference expression whose entity
  is the containing operation entity
- AND `targetField` resolves a declared field from the stored invocation target
  record
- AND an absent optional target field omits the destination value
- AND target-field source and destination types, text formats, enum value
  coverage, requiredness, and reference targets are compatible
- AND target expressions are rejected when the containing operation is
  collection-scoped
- AND references to earlier steps resolve through flat record ids, not nested
  record values
- AND actor context expressions support actor mode and the authenticated
  principal id when present
- AND plans that include query fan-out, loops, arbitrary code, provider calls,
  cross-app writes, conditional dedupe, computed sibling ordering, state-machine
  transition semantics, or undeclared entity/field targets are rejected

#### Scenario: Validate operation output contract

- GIVEN an entity operation declares an output contract
- WHEN the schema is parsed
- THEN `list` operations return records selected by the referenced query up to
  the declared `maxResults` when present
- AND `get` operations return one active record selected by record id
- AND `create` operations return the created record plus affected change ids
- AND `update` operations return the updated record plus affected change ids
- AND `delete` operations return the tombstoned record id plus affected change
  ids
- AND `command` operations return operation-native command output plus affected
  change ids

#### Scenario: Require source-declared operations

- GIVEN an entity relies on generated UI, Authority execution, or public
  execution
- WHEN runtime models are selected
- THEN the runtime consumes source-declared entity operations
- AND operation bindings are selected only from source-declared operation keys
- AND operation bindings use the same canonical operation key grammar as their
  source-declared operations

#### Scenario: Parse collection operation placement

- GIVEN a collection view binds a collection-scoped source operation
- WHEN the collection operation binding is parsed
- THEN optional placement is `toolbar` or `emptyStatePrimary`
- AND omitted placement resolves as `toolbar`
- AND an `emptyStatePrimary` binding is the collection's explicit primary action
  only while its selected result is empty
- AND at most one `emptyStatePrimary` binding is allowed per collection view
- AND a command bound there has no required caller input until generated command
  input forms are introduced
- AND one source operation may have distinct toolbar and empty-state bindings
  without duplicating its effect, policy, invocation, audit, or idempotency

#### Scenario: Parse singleton collection scope

- GIVEN a collection view must project records for exactly one aggregate root
- WHEN it declares a named scope entity, context-free scope query, and
  `singleton` selection
- THEN the scope query resolves against the declared entity
- AND collection and context queries may bind equality predicates to the named
  scope value
- AND create defaults may bind reference fields to that named scope value
- AND a collection context name remains distinct from its scope name

#### Scenario: Parse operation-native command effects

- GIVEN a source schema declares a command operation
- WHEN the command effect is parsed
- THEN the effect identifies operation-native command behavior and declared
  input/output facts from the operation declaration
- AND the only supported command effect types are `operationHandler` and
  `recordPlan`
- AND command effect parsing selects one of those operation-native shapes
- AND operation handler effects declare a handler kind plus typed handler
  configuration
- AND runtime-owned generic handler kinds are validated by the Schema package
- AND adapter-backed handler requirements and configuration are validated by
  trusted runtime composition without serializing executable code
- AND operation visibility, policy, audit, and idempotency come from the
  operation declaration

#### Scenario: Expose operation-native parser surface

- GIVEN a source schema or runtime schema declares entity interaction contracts
- WHEN the schema is parsed, stringified, exported from the schema package, or
  used for generated UI selection
- THEN operations are the parser-visible interaction model
- AND parser modules, exported helpers, and public types are operation-named

#### Scenario: Parse table operation bindings

- GIVEN a table view needs row edit, destructive, command, transition, or
  ordering controls
- WHEN the table view is parsed
- THEN table `operations` binding declarations bind canonical operation keys
- AND one `operationControl` column places every declared binding in the row's
  More options menu
- AND binding declarations may include labels, target record selection, edit
  views, destructive semantics, and disabled reasons
- AND ordering move actions join that menu only when the operation-control
  placement includes ordering
- AND operation control presentation contracts use operation terminology

### Requirement: State Machines

The system SHALL let app schemas declare lifecycle state machines over enum
fields without adding nested stored workflow state.

#### Scenario: Parse enum-backed state machine

- GIVEN an entity declares a state machine over an enum field
- WHEN the schema is parsed
- THEN the machine field exists on the same entity
- AND the machine field is a required enum field
- AND machine state keys, initial state, terminal states, transition source
  states, and transition destination states all reference values declared by
  that enum field

#### Scenario: Parse transition command effect

- GIVEN an entity command operation declares an operation handler for
  transition-state behavior
- WHEN the schema is parsed
- THEN the handler configuration references a state machine on the same entity
- AND the handler configuration references one transition from that machine
- AND the operation uses normal actor exposure metadata for authenticated,
  owner, admin, CLI deployer, and runner callers
- AND anonymous public access is rejected unless a later transition operation
  policy explicitly supports it

#### Scenario: Parse transition target date values

- GIVEN a record-scoped transition-state operation needs to set an
  authority-generated date on the transitioned record
- WHEN the handler config declares a non-empty `targetValues` field map
- THEN every target field exists on the operation entity, is not a system field
  or the machine-owned enum field, and has date type
- AND every target value uses `generatedDate` with an explicit IANA time-zone
  identifier
- AND missing or unsupported time-zone identifiers fail schema parsing
- AND `targetValues` is rejected for collection-scoped transition operations
- AND literal values, operation input, target fields, generated timestamps,
  arbitrary expressions, and patch, delete, or workflow instructions are
  rejected from `targetValues`
- AND target date values do not change operation actor policy, idempotency,
  audit, transition validity, event behavior, or side-effect eligibility

#### Scenario: Parse transition side-effect creates

- GIVEN a record-scoped transition-state operation needs to create related
  records when the transition commits
- WHEN the handler config declares `sideEffects` with type `recordPlan`
- THEN the side-effect plan contains a non-empty ordered list of named create
  steps
- AND each step creates one flat record in a declared entity from the same app
  schema
- AND create values may use the existing record-plan input, literal, generated
  id, generated code, generated timestamp, actor, source, reference, and earlier
  step-output expressions
- AND `targetRecordId` resolves to the invocation target record id
- AND `targetField` resolves a declared field from the stored pre-transition
  target record
- AND an absent optional target field omits the destination value
- AND target-field source and destination field types, text formats, enum value
  coverage, requiredness, and reference targets are validated from schema facts
- AND transition side effects use the same record-scoped target-expression
  contract as ordinary record plans
- AND target expressions remain rejected for collection-scoped operations
- AND side-effect patch, delete, tombstone, transition, query fan-out, loop,
  arbitrary code, provider call, and cross-app write steps are rejected
- AND side effects do not change operation actor policy, idempotency, audit, or
  anonymous public eligibility

#### Scenario: Preserve flat lifecycle records

- GIVEN a record belongs to an entity with a state machine
- WHEN the record is created, patched through transition operations, synced,
  snapshotted, archived, or restored
- THEN the current state is represented by the normal enum field value
- AND state machine metadata does not create nested record values

### Requirement: Public Operation Policy

The system SHALL define public operation execution through operation policy,
operation input contracts, and public operation bindings only.

#### Scenario: Parse public operation policy

- GIVEN an app schema declares anonymous public access, public input, or response
  filtering for an operation
- WHEN the schema is parsed
- THEN those facts are parsed from the operation policy and operation input
  contract
- AND anonymous callers invoke the behavior through public operation routes

#### Scenario: Reject unsupported public operation policy

- GIVEN an app schema declares a public operation policy with an unsupported
  actor mode, challenge, origin rule, or rate limit
- WHEN the schema is parsed
- THEN parsing fails
- AND the invalid app schema is not used for generated UI or writes

#### Scenario: Select public operation eligibility from schema facts

- GIVEN runtime, Site tree projection, notification projection, or tests need to
  decide whether an operation is eligible for anonymous public execution
- WHEN public operation eligibility is selected
- THEN the decision is derived from schema-owned operation facts including
  operation kind, effect, output contract, actor policy, optional access
  challenge, origin policy, and rate-limit policy
- AND target route resolution, app storage identity, runtime challenge
  configuration, provider secrets, request origin evaluation, rate-limit
  counters, storage writes, and delivery side effects are not schema facts

#### Scenario: Declare challenge-free anonymous list access

- GIVEN an anonymous list operation is an exact input-constrained lookup with
  bounded output and explicit anonymous response fields
- WHEN its access policy is parsed
- THEN the policy requires same-origin access and an explicit rate limit with
  positive `maxRequests` and `windowSeconds`
- AND the policy may omit an interactive challenge
- AND anonymous create and command operations continue to require a Turnstile
  challenge

#### Scenario: Export operation-named public contracts

- GIVEN app, client, Worker, Site runtime, or tests need public execution
  protocol types, operation access policy types, or inline public input field
  types
- WHEN those contracts are imported from the schema or shared protocol packages
- THEN they are named for public operation execution

### Requirement: Public Operation Input Contract

The system SHALL let app schemas declare public input on operations that expose
anonymous public bindings.

#### Scenario: Parse public input fields

- GIVEN an app schema declares public input fields for an operation
- WHEN the schema is parsed
- THEN field names, scalar types, required flags, and labels are validated
- AND the parsed operation exposes that input contract to the public operation
  executor
- AND the public input contract does not redefine operation effect, output,
  idempotency, audit, app storage identity, or stored entity field names

#### Scenario: Project public-safe input fields

- GIVEN a public operation form binding or operation input notification needs
  public-safe input field metadata for an anonymous public operation
- WHEN public-safe input field metadata is projected for browser rendering or
  submitted input display
- THEN the projection is derived from `operation.input.fields`
- AND entity-backed operation input fields reuse public-safe entity field
  labels, required flags, scalar types, enum values, text formats, and text
  suggestions
- AND affirmative boolean entity-backed and inline inputs also expose
  `mustBeTrue: true`
- AND inline operation input fields expose only their declared labels, required
  flags, affirmative boolean constraints, scalar types, enum values, public text
  formats, and public text suggestions
- AND submitted input display can use the same public-safe projection to select
  fields, resolve entity-backed input names or stored field names, and format
  scalar display values without exposing private schema facts
- AND v1 generic public form rendering supports text, long text, enum, boolean,
  date, number, email-formatted text, phone-formatted text, and open suggested
  text controls
- AND reference fields, relationship pickers, query-backed choices, server-side
  conditional validation, wizard flow state, payment facts, and authenticated
  customer facts are not projected as generic public form fields
- AND an operation whose required input cannot be represented by the generic
  public form field projection is unavailable to that generic form binding
- AND email layout, reply-to parsing, runtime notification configuration, and
  delivery scheduling remain outside the schema-owned projection

#### Scenario: Require public input for anonymous operation

- GIVEN an app schema declares anonymous public access for an operation
- WHEN the schema is parsed
- THEN parsing requires an explicit public input contract
- AND anonymous callers cannot submit undeclared record values directly

### Requirement: Public Command Handler Eligibility

The system MUST only expose command handlers that are safe for public execution
through operation policy and public operation bindings.

#### Scenario: Reject ineligible command handler

- GIVEN a command handler kind has neither generic public eligibility nor an
  explicitly selected public-eligible operation adapter
- WHEN the schema declares anonymous public access for an operation using that
  handler
- THEN trusted composition validation rejects the public access policy before
  browser or Worker startup
- AND a non-public adapter-backed command still requires one explicitly
  selected adapter but does not require that adapter to declare public
  eligibility

#### Scenario: Adapter-backed public command handler is eligible

- GIVEN an app schema declares an adapter-backed command operation with
  anonymous public access and valid public input
- AND trusted Program composition explicitly selects one matching operation
  adapter that declares public eligibility
- WHEN the schema and runtime composition are validated
- THEN composition accepts the operation
- AND the runtime can dispatch it through the public operation executor

### Requirement: Runtime-Owned Control-Plane Schemas

The system SHALL support runtime-owned control-plane app schemas that use normal
schema entities, fields, relationships, queries, read models, views, screens,
operations, and operation bindings.

#### Scenario: Parse control-plane schema

- GIVEN a runtime-owned control-plane schema
- WHEN the schema is parsed
- THEN it is validated with the same schema parser as other app schemas
- AND runtime-owned schema sections remain source-schema data unless explicitly
  interpreted by runtime behavior

#### Scenario: Control-plane records stay flat

- GIVEN control-plane records are stored or synced
- WHEN relationships between route, provider, and deployment records exist
- THEN records keep flat field values
- AND relationships are represented by schema metadata over reference fields

### Requirement: Immutable Control-Plane Fields

The system SHALL let runtime-owned schemas mark identity fields as immutable
after record creation.

#### Scenario: Route target integrity

- GIVEN a Program `route` record selects a runtime target profile
- WHEN the route is created or patched
- THEN schema and runtime validation admit only current Program target fields
- AND package app keys, install ids, and alternate storage identities are not
  route target facts

### Requirement: Actor-Scoped Command Operations

The system SHALL support actor-scoped command operations for authenticated,
owner, admin, CLI deployer, and runner callers.

#### Scenario: Authorized actor invokes command operation

- GIVEN a caller invokes a command operation exposed to its actor kind
- WHEN auth, actor facts, input, idempotency, and schema validation pass
- THEN the runtime accepts the operation
- AND the operation response includes only fields allowed for that actor

#### Scenario: Unexposed command operation is hidden

- GIVEN a generated browser surface renders operation controls
- WHEN a command operation is exposed only to CLI deployers or runners
- THEN the operation is not rendered as a browser control
- AND direct browser invocation of that actor-only operation is rejected

### Requirement: Secret Reference Fields

The system SHALL allow schema records to carry non-secret references to runtime
or provider secrets without storing secret values.

#### Scenario: Store secret reference

- GIVEN deployment configuration needs a credential or provider state secret
- WHEN the record is stored, changed, read, archived, or written to a workspace
- THEN the schema record stores a secret reference or requirement fact
- AND the secret value is excluded from record values, changes, read models,
  browser responses, archives, and workspace configuration

### Requirement: Route Field Validation

The system SHALL validate current Program route records against runtime topology
constraints.

#### Scenario: Validate Program route intent

- GIVEN a Program route record is created or patched
- WHEN route validation runs
- THEN the route path or prefix is checked for route-safe shape, reserved path
  conflicts, current target profile, route kind, access, and enabled-route
  uniqueness
- AND invalid route values are rejected before runtime route behavior changes

### Requirement: Append-Only Control-Plane History

The system SHALL let runtime-owned schemas mark control-plane history records as
append-only or operation-created.

#### Scenario: Append-only evidence

- GIVEN deployment attempt, evidence, cleanup, or drift history is recorded
- WHEN the history record is created
- THEN it is created through an allowed operation or runtime write path
- AND ordinary generated patch or delete controls are not exposed for that
  history record

#### Scenario: Operation-created evidence

- GIVEN runtime control-plane metadata restricts an entity to operation-created
  history records
- WHEN the schema is parsed, stringified, or exported through the schema package
- THEN the history kind is `operationCreated`
- AND validation errors identify operation-created history as operation-owned
