# App Schema Specification

## Purpose

App schema is runtime data that defines how a schema key stores flat records,
projects those records, and exposes operations over them. It is the durable
contract for source schemas, seed records, generated UI, Authority storage,
browser replicas, public bindings, automation, and package adapters.

## Requirements

### Requirement: Bundled Source Apps

The system SHALL provide source schemas for the current bundled schema keys `tasks`, `site`, and `crm`, and SHALL treat source seed records as stored-record shaped data.

#### Scenario: Load current source app

- **GIVEN** a current schema key `tasks`, `site`, or `crm`
- **WHEN** the runtime loads the source schema
- **THEN** the app schema is available for that schema key
- **AND** seed records can initialize records without being interpreted as change rows

### Requirement: TypeScript Schema Authoring

The system SHALL allow trusted package-local TypeScript to declare App schema
source while keeping the materialized schema and parsed runtime model as
data-only contracts.

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

#### Scenario: Materialize TypeScript-authored source

- GIVEN a package owns valid TypeScript-authored App schema source
- WHEN its schema artifact is materialized
- THEN the output is a deterministic plain JSON `schema.json` package artifact
- AND the materialized artifact parses through the same App schema parser as a
  hand-authored JSON schema
- AND Worker, workspace, install, archive, upgrade, and deploy runtime paths
  consume the data artifact without evaluating the TypeScript authoring module
- AND the artifact contains no executable callback, import reference,
  credential, provider object, or runtime implementation

#### Scenario: Preserve source-schema hash semantics

- GIVEN TypeScript-authored source omits a value for which parsing supplies a
  runtime default
- WHEN the package materializes and hashes its source schema
- THEN materialization preserves the authored omission in the plain data
  artifact
- AND `sourceSchemaHash` is computed from that complete materialized source
  data rather than from the parser-defaulted runtime model
- AND package checks reject canonical drift between the TypeScript declaration,
  the materialized artifact, and the manifest source-schema hash

### Requirement: App Package Source Manifests

The system SHALL represent installable app package source metadata as app
package manifest facts before exposing package metadata to install, upgrade,
archive, or deploy workflows.

#### Scenario: Parse app package manifest

- GIVEN an app package manifest declares kind `formless.appPackage` and version
  `1`
- WHEN the package source is resolved
- THEN the manifest declares a route-safe package app key, label, optional
  description, default install id, multiple-install policy, package revision,
  source schema location, seed records location, and runtime capabilities such
  as generated admin and optional public Site routes
- AND the manifest does not contain app install records, route records,
  deployment config, app records, media payloads, provider credentials, or
  workspace-local secrets
- AND the referenced source schema parses as an app schema
- AND referenced seed records validate as stored-record shaped data for that
  source schema

#### Scenario: Declare package runtime capabilities

- GIVEN an app package manifest declares runtime capabilities
- WHEN the package source is resolved
- THEN the resolved package metadata exposes stable capability facts such as
  generated admin and public Site runtime support
- AND capability facts are data declarations used by install, route, archive,
  deploy, and runtime dispatch validation
- AND the manifest does not embed executable handler paths, JavaScript module
  references, React component names, Worker functions, filesystem adapter
  functions, or other runtime implementation details
- AND executable behavior for a capability is selected from the runtime's
  package adapter registry for the resolved package app key

#### Scenario: Verify resolved package source hash

- GIVEN an app package manifest declares a source schema hash
- WHEN package source is resolved from local filesystem source
- THEN the resolver computes the deterministic source schema hash from the
  referenced source schema
- AND resolution fails when the computed hash differs from the manifest
  `sourceSchemaHash`
- AND the package is not exposed to install, upgrade, archive, or deploy
  workflows until the manifest and source schema agree

#### Scenario: Hash complete schema source

- GIVEN an app package source schema changes entities, fields, relationships,
  queries, read models, views, table views, item views, screens, operations,
  state machines, labels, or runtime metadata
- WHEN the deterministic source schema hash is computed
- THEN the hash input is the complete canonical App schema object
- AND generated UI-only changes such as view, table view, item view, or screen
  changes produce a different source schema hash
- AND the hash is independent of record data, seed records, workspace state, or
  active storage timestamps

#### Scenario: Import app package manifest contracts

- GIVEN app, client, Worker, archive, workspace, upgrade, Site runtime, or tests
  need app package manifest types, manifest parsing, package resolver behavior,
  package revision contracts, source schema hash parsing, or deterministic
  source schema hash computation
- WHEN those contracts are imported
- THEN they come from `@dpeek/formless-installed-apps`
- AND bundled source app facts are supplied by runtime code rather than imported
  by package slices

#### Scenario: Resolve bundled app packages from manifests

- GIVEN the current bundled package app keys `site`, `tasks`, and `crm`
- WHEN package metadata is listed or read
- THEN each package is exposed as a resolved app package derived from app
  package manifest facts
- AND existing package app keys, labels, default install ids, package
  revisions, source schema hashes, source schema keys, and seed record keys
  remain stable unless the package source changes

### Requirement: Package App Revision Facts

The system SHALL distinguish app schema language version from app package
revision and source schema hash.

#### Scenario: Parse schema language version

- **WHEN** an app schema is parsed
- **THEN** `schema.version` continues to represent the schema language version
- **AND** package app revision is not read from `schema.version`

#### Scenario: Describe resolved package app revision

- **WHEN** resolved app package metadata is read
- **THEN** the package declares a monotonic package revision, deterministic
  source schema hash, package app key, source origin, and source schema key
- **AND** current bundled packages can remain at package revision `1`

### Requirement: Package App Schema Migrations

The system SHALL support code-backed package app migrations between package app
revisions.

#### Scenario: Migrate package app schema

- WHEN an installed package app is behind the current package revision
- THEN matching package app migrations can update the active schema and package
  revision facts
- AND the schema remains a valid parsed app schema before it is stored

#### Scenario: Preserve schema hash provenance

- WHEN a package app migration completes
- THEN stored package facts identify the applied package revision and source
  schema hash
- AND the hash is used for drift/provenance checks, not migration ordering

#### Scenario: Refresh schema-only source changes

- GIVEN an installed package app has the same package revision as the active
  resolver and a different source schema hash
- WHEN the resolved source schema parses and validates against current active
  records without a record materialization plan
- THEN the runtime can refresh the stored active schema and package source
  schema hash without applying a package app migration
- AND the refresh updates the schema timestamp used by browser replicas and
  workspace state
- AND package app migrations remain required when the package revision advances
  or when current records need creates, patches, tombstones, or value pruning

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
  behavior is selected through adapters declared by runtime capability facts

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

### Requirement: Schema Package Boundary

The system SHALL expose reusable App schema language contracts, parsers, and
pure helpers through the Schema package slice.

#### Scenario: Package owns app schema interface

- **WHEN** generated UI models, Authority validation, browser replicas, archive
  planning, archive validation, upgrade migrations, tests, or other package
  slices need App schema types, parse behavior, stringify behavior,
  schema-local entity key helpers, qualified entity name helpers, field
  behavior, query helpers, read model helpers, create-default helpers, runtime
  metadata helpers, operation capability facts, or derived command capability
  facts
- **THEN** they import those contracts and helpers from
  `@dpeek/formless-schema`
- **AND** they do not import package-owned schema behavior from unexported
  package internals

#### Scenario: Package does not own runtime app records

- **WHEN** App schema behavior is used to load bundled or resolved package
  source schemas, load source seed records, render generated React surfaces,
  validate Authority writes, store active schemas, sync browser replicas, plan
  or apply archives, compose Workspace storage snapshots, build instance
  control-plane records, or apply package app migrations
- **THEN** those runtime behaviors remain owned by app, client, Worker,
  archive, Workspace, instance control-plane, migration, or generated UI modules
- **AND** the Schema package only owns runtime-neutral schema language
  contracts, parser/formatter behavior, field/query/read-model helpers, and
  package-local deterministic tests

### Requirement: Entity Key Grammar

The system SHALL validate schema-local entity keys as singular kebab-case data
identifiers.

#### Scenario: Parse schema-local entity key

- WHEN an app schema declares entity keys such as `block`, `app-install`, or
  `deployment-config`
- THEN schema parsing accepts those keys as local entity identifiers
- AND the entity keys remain unqualified inside the schema's `entities` object

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

The system SHALL represent entity identity as `<schema-key>:<entity-key>` at
cross-schema and external boundaries while preserving local entity keys inside
the declaring schema.

#### Scenario: Emit external qualified entity name

- WHEN records are written to archives, workspace record state, drift reports,
  logs, diagnostic output, or another external boundary that combines schema
  record families
- THEN entity identity is represented with a qualified name such as
  `site:block` or `instance:app-install`
- AND the right-hand side uses the local kebab-case entity key

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
- AND the runtime resolves the referenced record from identity control-plane
  storage identity `instance:identity`
- AND validation rejects missing, tombstoned, wrong-entity, unsupported
  qualified-target, or unavailable identity storage targets before committing
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

### Requirement: Screens And Navigation

The system SHALL let app schemas define workspace screens that compose collection views and own app-relative navigation when primary screens exist.

#### Scenario: Root screen fallback

- GIVEN screens exist and no explicit root screen is declared
- WHEN the first pathless primary screen is selected
- THEN it receives the app-relative `/` path
- AND collection primary navigation is used only when no screens exist

#### Scenario: Screen section references collection view

- GIVEN a workspace screen with collection sections
- WHEN the schema is parsed
- THEN each section references an existing collection view
- AND valid sections are available in schema order

#### Scenario: Screen layout width

- GIVEN a workspace screen layout declares a semantic width
- WHEN the schema is parsed
- THEN `narrow`, `standard`, and `wide` are accepted
- AND an omitted width resolves to `standard`
- AND any other width is rejected
- AND the width does not declare pixel dimensions, responsive breakpoints,
  presentation class names, or renderer-specific properties

#### Scenario: Screen access policy

- GIVEN a workspace screen declares access policy
- WHEN the schema is parsed
- THEN `access` is `anonymous`, `authenticated`, or `owner`
- AND `anonymous` means the screen does not require an owner session beyond the
  access required by its mounted route
- AND `authenticated` means the screen requires an active principal-backed
  browser session beyond the access required by its mounted route
- AND `owner` means the screen requires an active `instance.owner` principal
  session
- AND omitted screen access inherits the mounted route access

#### Scenario: Reject invalid screen access

- GIVEN a workspace screen declares an unsupported access value
- WHEN the schema is parsed
- THEN parsing fails
- AND the invalid screen is not made available for generated UI navigation

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

#### Scenario: Preserve typed scalar values

- GIVEN date and number fields receive create or inline inputs
- WHEN values are accepted
- THEN date fields preserve `YYYY-MM-DD` values
- AND number fields store numbers

#### Scenario: Declare asset-backed media authoring

- GIVEN a text field stores a reference to an owned image media asset
- WHEN schema field behavior selects editor and control metadata
- THEN the field uses the `media` editor and asset-backed media control
- AND the stored field value remains a flat media asset id
- AND the field editor vocabulary does not define a separate image editor or
  raw image URL authoring mode

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
- THEN operation handler capability facts drive runtime eligibility, UI input
  facts, public eligibility, and response filtering
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

- GIVEN an entity declares operations under `entities.<entityKey>.operations`
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
- AND for browser operations against an installed app storage identity,
  `admin` may be supplied by an active principal with current `app.admin`
  authority at that app-install scope
- AND `instance.admin` authority alone and `app.admin` authority for another
  app install do not supply that installed-app `admin` actor
- AND response field filters may be keyed by each declared actor kind
- AND response field filters select command output payload field names,
  including fields written by record-plan steps whose entity differs from the
  operation entity
- AND anonymous public access still requires the explicit anonymous operation
  access policy and public input contract

#### Scenario: Reuse entity fields in operation input

- GIVEN an operation input field references an entity field
- WHEN the schema is parsed
- THEN the referenced field must exist on the containing entity
- AND field behavior, validation, labels, defaults, and generated editor facts
  can be reused for that operation input
- AND inline scalar input fields can be declared for command-only input that is
  not stored directly on the target record

#### Scenario: Declare affirmative boolean operation input

- GIVEN an entity-backed operation input references a boolean entity field
- WHEN the input declares `required: true` and `mustBeTrue: true`
- THEN parsing preserves the affirmative acceptance constraint
- AND the constraint is rejected for non-boolean entity fields, inline scalar
  inputs, non-required inputs, or values other than literal `true`
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
- AND entity-backed input with `mustBeTrue: true` rejects any submitted value
  other than `true`
- AND inline scalar operation input validation uses the same field behavior
  validators as entity-backed operation input validation
- AND projection can return operation-input keyed values for command handlers
  and record plans
- AND projection can return entity-field keyed values for create and update
  record-write materialization
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
  actor/source context, and outputs from earlier steps
- AND generated human-readable code expressions declare a named alphabet, either
  one length or grouped segment lengths, an optional group separator, and an
  optional literal prefix
- AND generated human-readable code expressions are valid for step values, not
  record id expressions
- AND record id expressions use input, literal scalar, generated id, or earlier
  step id output expressions
- AND field values target declared fields on the step entity
- AND reference field values use a reference expression whose entity matches the
  declared reference target and whose id resolves to a flat record id
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
- THEN `list` operations return records selected by the referenced query
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
- AND operation visibility, policy, audit, and idempotency come from the
  operation declaration

#### Scenario: Expose operation-native parser surface

- GIVEN a source schema or runtime schema declares entity interaction contracts
- WHEN the schema is parsed, stringified, exported from the schema package, or
  used for generated UI selection
- THEN operations are the parser-visible interaction model
- AND parser modules, exported helpers, and public types are operation-named

#### Scenario: Parse table operation bindings

- GIVEN a table view needs row controls, edit dialogs, destructive controls, or
  ordering controls
- WHEN the table view is parsed
- THEN table `operations` binding declarations bind canonical operation keys
- AND `operationControl` columns reference those table operation bindings for
  row-control placement
- AND binding declarations may include placement, labels, ordering presentation,
  target record selection, and disabled reasons
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
  actor mode, challenge, or origin rule
- WHEN the schema is parsed
- THEN parsing fails
- AND the invalid app schema is not used for generated UI or writes

#### Scenario: Select public operation eligibility from schema facts

- GIVEN runtime, Site tree projection, notification projection, or tests need to
  decide whether an operation is eligible for anonymous public execution
- WHEN public operation eligibility is selected
- THEN the decision is derived from schema-owned operation facts including
  operation kind, effect, output contract, actor policy, access challenge, and
  origin policy
- AND target route resolution, app storage identity, runtime challenge
  configuration, provider secrets, request origin evaluation, storage writes,
  and delivery side effects are not schema facts

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
- AND affirmative boolean entity-backed inputs also expose `mustBeTrue: true`
- AND inline operation input fields expose only their declared labels, required
  flags, scalar types, enum values, public text formats, and public text
  suggestions
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

- GIVEN a command handler kind has no public execution module
- WHEN the schema declares anonymous public access for an operation using that
  handler
- THEN parsing rejects the public access policy
- AND the command operation can still exist for non-public actors when its
  schema is valid

#### Scenario: Subscribe command handler is eligible

- GIVEN an app schema declares a subscribe command operation with anonymous
  public access and valid public input
- WHEN the schema is parsed
- THEN parsing accepts the operation
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
- WHEN relationships between app install, route, provider, and deployment
  records exist
- THEN records keep flat field values
- AND relationships are represented by schema metadata over reference fields

### Requirement: Immutable Control-Plane Fields

The system SHALL let runtime-owned schemas mark identity fields as immutable
after record creation.

#### Scenario: Immutable install identity

- GIVEN an `app-install` record has been created
- WHEN a patch targets install identity, package app key, or storage identity
- THEN generated UI, CLI, sync, and operation writes reject the change
- AND mutable fields such as label can still be patched when schema policy
  allows

#### Scenario: Route target integrity

- GIVEN an `app-route` record references an `app-install`
- WHEN the route is created or patched
- THEN schema validation prevents the route from pointing at a missing,
  incompatible, or tombstoned app install record

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
  browser responses, archives, and workspace manifests

### Requirement: Route Field Validation

The system SHALL let runtime-owned schemas validate route path and route prefix
fields against runtime topology constraints.

#### Scenario: Validate app route path

- GIVEN an app route record is created or patched
- WHEN route validation runs
- THEN the route path or prefix is checked for route-safe shape, reserved path
  conflicts, package capability, route kind, and enabled-route uniqueness
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
