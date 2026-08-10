# Portable Archives Specification

## Purpose

Portable archives move one complete Formless Program and its referenced media
through reviewable save, pull, push, backup, restore, import, and ejection
workflows. They are internal data-movement plumbing, not a separate public CLI
command family.

## Requirements

### Requirement: Program Archive Envelope

The system SHALL encode one complete Program snapshot and its referenced media
in the current instance archive envelope.

#### Scenario: Current archive kind

- GIVEN an instance archive is parsed
- WHEN the archive kind is read
- THEN the only supported kind is `formless.instanceArchive`
- AND the archive contains one Program storage snapshot and one global Program
  media manifest

#### Scenario: Media capability

- GIVEN an archive includes Program-owned image or document media
- WHEN capabilities are parsed
- THEN `core-media-assets` describes the archive media capability
- AND image and document asset metadata remain distinguished inside the one
  current core media capability

### Requirement: Current Archive Validation

The system SHALL validate the current Program archive and workspace state
contracts before restore or workspace synchronization.

#### Scenario: Validate archive input

- WHEN archive restore, restore dry-run planning, or workspace validation reads
  an instance archive
- THEN its kind, version, Program storage identity, Program provenance, entity
  names, records, references, and media are validated before mutation
- AND invalid input leaves Program and media data unchanged

#### Scenario: Select current workspace source

- GIVEN workspace state contains one Program record state file and referenced
  media payloads
- WHEN archive export, restore, save, check, pull, push, or local
  materialization selects current source
- THEN the current Program snapshot and referenced Program media are selected
- AND the archive boundary does not discover additional storage targets

### Requirement: Archive API Vocabulary

The system SHALL expose one Instance archive API vocabulary.

#### Scenario: Consume Instance archive contracts

- WHEN runtime, CLI, Workspace, Worker, or tests parse, format, plan, read, or
  write an archive
- THEN public contracts use `InstanceArchive`, `parseInstanceArchive`,
  `formatInstanceArchive`, and `planInstanceArchiveRestore`
- AND local directory adapters use corresponding Instance archive names
- AND the package does not expose a second alias family for the same envelope

### Requirement: Export Latest Archive Format

The system SHALL write instance archives using the latest supported archive
envelope.

#### Scenario: Export instance archive

- WHEN a Program instance archive is exported
- THEN the archive uses the latest supported archive version
- AND it records one canonical Program provenance and source schema hash
- AND provenance identifies the complete Program rather than an individual
  domain module or package artifact

### Requirement: Archive Export

The system SHALL export archives from Authority-backed source of truth, not
browser replica state.

#### Scenario: Instance export

- GIVEN a target Formless instance has Program records and referenced media
- WHEN an instance archive is exported
- THEN one Program storage snapshot and referenced core media are read from the
  target
- AND the Program snapshot contains instance, reviewable identity, standard,
  Task, and Site records from storage identity `instance:control-plane`
- AND core images referenced by Program-native Site records use canonical
  archive paths under `media/images/`
- AND Program document media uses canonical archive paths under
  `media/documents/`
- AND archive paths identify media kind independently from provider storage
  keys while the archive envelope and Program media manifest establish Program
  ownership
- AND archive media files are written at manifest archive paths
- AND protected target reads use owner session or admin bearer authorization
  supplied by the caller

#### Scenario: Export the target under its active Program contract

- GIVEN a target stores Program schema and provenance A
- AND a caller intends to compare, back up, or replace it with Program schema
  and provenance B
- WHEN the current target archive is exported
- THEN the target's active schema, active provenance, storage snapshot, and
  referenced media are read as one source state
- AND the current target snapshot is canonicalized and validated under A rather
  than under the caller's desired B artifact
- AND A's canonical schema hash and provenance remain mandatory archive
  integrity checks
- AND comparison with B happens only after the current target archive is valid
  under its own contract

### Requirement: Schema-Aware Record Formatting

The system SHALL format stored-record output deterministically from App schema
declaration order while treating input object property order as semantically
irrelevant.

#### Scenario: Format flat record values

- GIVEN a stored record has flat `values`
- WHEN the record is formatted for a storage snapshot, instance archive,
  workspace state, or CLI-readable output
- THEN known value properties are written in the containing entity's field
  declaration order
- AND absent fields are omitted without placeholders
- AND unexpected or forward-version value properties are preserved after known
  fields in locale-independent ordinal key order
- AND record ids, entity keys, lifecycle metadata, and flat value shape remain
  unchanged

#### Scenario: Preserve icon values without an archive capability

- GIVEN Program records contain source-backed, transitional, or id-backed icon
  text values
- WHEN workspace state or an instance archive is formatted, validated, or
  restored
- THEN each icon value remains an ordinary flat string under the active Program
  schema
- AND schema-declared icon definitions travel through the complete Program
  artifact identified by schema provenance rather than through Program records,
  the media manifest, or a separate archive payload
- AND transitional mode accepts unchanged safe legacy SVG values or icon ids
  without changing the archive envelope version
- AND archive and workspace boundaries do not silently rewrite legacy SVG
  values to ids

#### Scenario: Ignore input value property order

- GIVEN two record inputs contain equivalent flat values with different object
  property insertion order
- WHEN schema-aware record validation, restore planning, import validation, or
  workspace validation runs
- THEN both inputs have the same record meaning and validation outcome
- AND validation continues to reject undeclared, incompatible, or invalid
  values according to the resolved current schema
- AND object insertion order is not used as record identity, field order, or
  write intent

#### Scenario: Format record arrays by schema order

- GIVEN a snapshot, archive, or workspace state file contains records from more
  than one entity
- WHEN deterministic output is written
- THEN records are grouped in entity declaration order
- AND records within one entity are ordered by record id using the same
  locale-independent ordinal comparison
- AND tombstone state does not change a record's ordering key

#### Scenario: Reorder entity fields

- GIVEN an App schema changes only the declaration order of fields on an entity
- WHEN canonical schema and record artifacts are written
- THEN the schema hash and canonical record artifact bytes change
- AND each record retains the same flat field names and values
- AND archive or workspace input with the previous object property order still
  validates independently of that property order

### Requirement: Restore Planning

The system MUST validate an archive before mutating Authority storage or media
state.

#### Scenario: Restore dry-run

- GIVEN an instance archive directory exists
- WHEN restore planning or push dry-run runs
- THEN validation and planning run as a dry-run
- AND no remote Program or media data is mutated

#### Scenario: Plan a schema-changing push before runtime reconciliation

- GIVEN a desired archive validates under Program schema and provenance B
- AND the selected target still runs Program schema and provenance A
- WHEN push dry-run plans the replacement without reconciling the runtime
- THEN it reports A and B, whether the schema delta is storage-compatible, and
  that runtime reconciliation is required
- AND it reports local archive validation as complete and target-runtime restore
  validation as deferred until apply reconciles B
- AND it does not submit the B archive to the A runtime or mutate provider,
  Program, or media state

#### Scenario: Validate before apply

- GIVEN restore is requested with `--apply`
- WHEN the archive contains a Program snapshot and media
- THEN Program provenance, schema, records, references, unique constraints,
  media metadata, and media files are validated before mutation
- AND document validation checks asset kind, filename, normalized MIME type,
  byte size, access policy, archive path, storage key, and payload before
  mutation

### Requirement: Restore Execution

The system SHALL restore populated initial or replacement Program state through
portable archives and restore media before Program records.

#### Scenario: Apply restore

- GIVEN restore validation succeeds and mutation is explicitly requested
- WHEN restore applies
- THEN core media objects are written before Program records
- AND each image or document is written to the validated provider storage key
  declared separately from its archive path
- AND Program data is restored through `instance:control-plane` storage
  identity
- AND the complete target Program schema and canonical provenance validate the
  replacement snapshot
- AND Program-native Site image references use existing instance core media
  identities without retargeting
- AND a failed restore leaves existing Program and media state unchanged

#### Scenario: Guard a planned replacement from concurrent writes

- GIVEN restore planning and backup captured target source cursor C
- WHEN replacement restore begins
- THEN the restore acquires a target guard before its first media mutation and
  supplies C as the expected Program source cursor
- AND a target cursor other than C fails with a conflict before Program or
  media mutation
- AND ordinary Program writes cannot commit while the guard spans media restore,
  Program replacement, and rollback
- AND the guard is released after successful Program commit or after failed
  restore rollback has preserved the prior Program and media state

### Requirement: Archive Package Boundary

The system SHALL expose reusable instance archive contracts, current-envelope
parsing, restore planning, and local archive file adapters through the Archive
package slice.

#### Scenario: Package owns instance archive contracts

- **WHEN** CLI runtime, Worker restore APIs, Workspace operations,
  sync planning, tests, or package slices need archive envelope kinds,
  archive version constants, archive capability parsing, archive formatting,
  restore dry-run planning, media manifest validation, or deterministic local
  archive directory IO
- **THEN** they import that behavior from `@dpeek/formless-archive` or
  `@dpeek/formless-archive/node`
- **AND** they import package-owned archive behavior only through exported
  Archive package entrypoints, not source-tree modules or unexported package
  internals

#### Scenario: Package consumes public contract packages

- **WHEN** Archive package parsing, formatting, restore planning, local archive
  IO, or package-local tests need storage snapshot, core media, or App schema
  behavior
- **THEN** those dependencies come from public package exports such as
  `@dpeek/formless-storage`, `@dpeek/formless-media`, and
  `@dpeek/formless-schema`
- **AND** the downstream runtime supplies Program schema resolution,
  mixed-record validation, and domain-specific reviewable canonicalization
  through explicit Archive package inputs
- **AND** the Archive package does not import `lib/formless/src/shared/*` or
  `lib/formless/src/test/*` modules

#### Scenario: Package does not own archive execution

- **WHEN** archive export, archive restore apply, Authority reads or writes,
  Durable Object storage, browser replica state,
  media object mutation, provider mutation, workspace save/check/pull/push,
  or CLI command policy is needed
- **THEN** those behaviors remain owned by CLI runtime, Archive workflows,
  Workspace runtime, Worker runtime, Authority, Media runtime, Deploy runtime,
  or provider adapters
- **AND** the Archive package supplies contracts, parser/formatter behavior,
  deterministic planning, and local archive filesystem adapters rather than
  owning Program records, runtime storage, media storage, deployed runtime records,
  provider credentials, Cloudflare resources, or Alchemy resources

#### Scenario: Current archive version only

- **GIVEN** archive parsing, restore dry-run planning, or workspace validation
  checks read an archive envelope
- **WHEN** the archive version differs from the current instance archive version
- **THEN** the archive is rejected with an unsupported archive version error
- **AND** Program provenance is read only from current archive fields

### Requirement: Workspace Source Of Truth

The system SHALL treat the `formless.ts` workspace configuration, one Program
record state file, Program provenance, and referenced media payloads as the
reviewable local source of truth for local-first Formless workspaces.

#### Scenario: Fresh local workspace bootstrap

- **WHEN** `formless dev` starts for a selected workspace root without
  `formless.ts`
- **THEN** the CLI writes a base configuration with an explicit workspace name
  derived from the selected directory or confirmed interactive input
- **AND** the CLI prepares ignored local state and `.gitignore` coverage for
  `.formless/`
- **AND** local admin tokens, owner session signing secrets, local session
  bootstrap tokens, gateway proxy tokens, and CSRF tokens are kept under ignored
  local state or process environment
- **AND** the CLI does not create empty record state or media directories
- **AND** no route, deployment config, Cloudflare resource,
  Alchemy resource, provider credential, or remote instance is created by fresh
  local workspace bootstrap

#### Scenario: Save from local Authority

- **WHEN** workspace save runs against local Authority state containing active
  Program records and referenced core image or document media
- **THEN** the system writes one deterministic Program record state file, schema
  provenance, and referenced media payloads from Authority-backed state
- **AND** instance control-plane, reviewable identity, standard, Task, and Site
  records are written to `state/instance.json`
- **AND** browser replica state is not used as the source of truth
- **AND** secret-looking fields are rejected from reviewable workspace state

#### Scenario: Rebuild local runtime state

- **WHEN** workspace-local runtime state under `.formless/local` is reset
- **THEN** the next local dev run can rebuild runtime state from the Program
  record state file, Program provenance, and media payloads
- **AND** reviewable workspace source remains unchanged by the reset

#### Scenario: Empty workspace runtime state

- **WHEN** workspace-local dev starts after fresh CLI bootstrap with a base
  manifest and no record state files
- **THEN** the local product instance starts from the complete materialized
  Program with empty Program record state
- **AND** first use creates only Program-owned records

### Requirement: Workspace Storage State

The system SHALL store workspace state as compact record state files and media
payloads, not portable archive directories or duplicated schema source bodies.

#### Scenario: Program workspace state file

- **WHEN** workspace source is written
- **THEN** Program state is written to `state/instance.json`
- **AND** standard, Task, and built-in Site records are written only to
  `state/instance.json`
- **AND** the state file declares kind, version, storage identity, schema key,
  exported timestamp, schema timestamp, source cursor, schema provenance, and
  records
- **AND** `state/instance.json` declares `schemaProvenance.kind`
  `program` and the complete Program `sourceSchemaHash`
- **AND** workspace state does not embed the full App schema object
- **AND** `state/instance.json` uses storage identity `instance:control-plane`
- **AND** `state/instance.json` uses schema key `formless-program`
- **AND** it includes instance, reviewable identity, standard, Task, and Site
  records from the same Authority record-id namespace
- **AND** workspace state kind constants, version constants, and parsing
  behavior come from the Workspace package contract

#### Scenario: Auto-save uses compact workspace state

- **WHEN** local workspace auto-save persists source from local Authority
- **THEN** it writes the same `state/instance.json` and `state/media` source
  shape as manual workspace save
- **AND** it does not write portable archive envelopes as workspace source
- **AND** it does not read browser IndexedDB as source

#### Scenario: Workspace media state

- **WHEN** workspace source contains core media referenced by Program records
- **THEN** media payloads are stored under `state/media`
- **AND** image payloads use canonical local paths under `state/media/images/`
- **AND** document payloads use canonical local paths under
  `state/media/documents/`
- **AND** the workspace media manifest records archive path, provider storage
  key, and local payload path as distinct facts
- **AND** the current workspace media manifest version is `2`
- **AND** document payload content types and metadata come from validated media
  manifest facts rather than filename-only inference
- **AND** referenced private document payloads are included in authorized
  workspace source flows without being encrypted or redacted by runtime access
  policy
- **AND** media bytes, object metadata, and provider storage metadata are not
  nested into storage snapshots

#### Scenario: Adopt an earlier workspace media layout safely

- **GIVEN** a valid workspace media manifest addresses payloads through an
  earlier local layout
- **WHEN** an applied workspace save or pull adopts the current layout
- **THEN** every existing payload is read and validated before replacement
- **AND** current manifest and payload files are staged and validated before
  they replace prior workspace media state
- **AND** prior payload paths are pruned only after the current media state is
  safely installed
- **AND** dry-run reports the adoption without mutating workspace files

#### Scenario: Portable archive envelope composition

- **WHEN** workspace export, push, restore, or backup needs a portable archive
- **THEN** the workflow validates the canonical Program provenance from
  workspace state against the complete materialized Program artifact
- **AND** it composes a portable instance archive from `state/instance.json`
  and referenced `state/media` payloads
- **AND** workspace `state/instance.json` and `state/media` files are not
  themselves portable archive envelopes

#### Scenario: Workspace state vocabulary

- **WHEN** workspace save, check, pull, push, gateway status, tests, local
  adapters, or local agent instructions describe reviewable workspace source
- **THEN** the Program source file is described as workspace state, record
  state, Program state, instance state, or a storage snapshot and media files
  are described as media payloads
- **AND** archive terminology is reserved for portable archive envelopes,
  archive restore/export/import/backup workflows, and archive manifest paths
  inside portable archive payloads
- **AND** workspace result fields, sync summaries, logs, and package-local
  instructions do not call `state/instance.json` an instance archive

### Requirement: Workspace Runtime Code Archive Boundary

The system SHALL keep trusted workspace runtime composition code, runtime
extension code, and module configuration outside portable instance archive
envelopes.

#### Scenario: Runtime extension config is not archive data

- **WHEN** an instance archive is exported from a Formless instance or composed
  from workspace source
- **THEN** the archive includes one Program snapshot and referenced media
  payloads selected by the archive capabilities
- **AND** the archive does not include workspace adapter or renderer source
  files, runtime composition or renderer module paths, `formless.ts`
  `runtime.composition` or `runtime.extensions` entries, build aliases, local
  dependency paths, executable functions, or runtime build digests
- **AND** Program provenance does not imply that a restored target has the same
  workspace adapter or renderer code available

#### Scenario: Restore without renderer code

- **GIVEN** Program Site records are restored or imported into a workspace or
  runtime that does not configure `site.publicRenderer`
- **WHEN** public Site preview, mapped-host, or published rendering
  runs for those restored records
- **THEN** the bundled Site renderer is used
- **AND** restore does not fail only because the source workspace used a custom
  renderer outside the archive

#### Scenario: Runtime extension config remains workspace source

- **WHEN** a workspace push needs runtime code in addition to archive data
- **THEN** the workflow resolves runtime extension config from the reviewable
  workspace configuration outside the portable archive envelope
- **AND** archive restore planning, import validation, and archive metadata do
  not read renderer modules or execute workspace renderer code

#### Scenario: Restore through target runtime composition

- **GIVEN** an archive is restored into a target with an explicitly composed
  Program artifact and shared record adapters
- **WHEN** restore planning validates the archive before mutation
- **THEN** it validates the snapshot against the target Program provenance,
  complete schema, and selected record adapters
- **AND** incompatible current-state records fail restore before storage or
  media mutation
- **AND** restore does not load adapter code from the archive or infer adapters
  from archived entity ids

### Requirement: Workspace Package Boundary

The system SHALL expose reusable Formless workspace source, local and secret
state, and semantic operation metadata through the Workspace package slice.

#### Scenario: Package owns workspace source contracts

- **WHEN** CLI runtime, archive workflows,
  tests, or local agent workflows need `formless.ts` configuration contracts,
  default resolution, workspace path validation and defaults,
  workspace target URL normalization, workspace storage snapshot contracts,
  ignored local state contracts, ignored secret state contracts, semantic
  operation keys and execution requirements, or deterministic local filesystem
  workspace IO
- **THEN** they import that behavior from `@dpeek/formless-workspace` or
  `@dpeek/formless-workspace/node`
- **AND** they import package-owned workspace behavior only through exported
  Workspace package entrypoints, not source-tree modules or unexported package
  internals

#### Scenario: Package consumes public contract packages

- **WHEN** the Workspace package local Node adapter or package-local tests need
  Program storage snapshot contracts, source schema parsing, field value
  validation, or canonical source-schema hashing
- **THEN** those dependencies come from public package exports such as
  `@dpeek/formless-storage` and `@dpeek/formless-schema`
- **AND** the Workspace package does not import `lib/formless/src/shared/*` or
  `lib/formless/src/test/*` modules

#### Scenario: Package does not own runtime mutation

- **WHEN** workspace save, pull, push, credential setup, control-plane mutation,
  Authority reads, provider mutation, Gateway
  authorization, or runtime topology selection is needed
- **THEN** those behaviors remain owned by CLI runtime, Archive
  workflows, Deploy runtime, Worker runtime, Gateway runtime adapters, or
  provider adapters
- **AND** the Workspace package supplies source/state contracts, pure helpers,
  and local filesystem adapters rather than
  owning Program records, deployed runtime records, provider credentials, or
  Cloudflare and Alchemy execution
- **AND** the Workspace package does not persist generic operation state under
  ignored or reviewable workspace state

### Requirement: Instance Workspaces

The system SHALL let a local Formless workspace save, pull, push, and dev
instance state without storing instance intent or secrets in configuration.

#### Scenario: Workspace configuration

- **WHEN** a Formless workspace configuration is loaded
- **THEN** `formless.ts` default-exports trusted typed configuration with a
  required explicit name and optional workspace state root, media root, ignored
  local state root, ignored secret state root, and runtime
  extension declarations
- **AND** kind, version, layout roots, and bundled runtime
  extensions resolve from defaults when omitted
- **AND** unified `route`, `deployment-config` intent, remote
  target facts, deployment observation cache, deployment execution history, and
  default app policy are not declared in `formless.ts`
- **AND** provider worker-name overrides are deployment intent stored in
  schema-owned deployment config records, not in `formless.ts`
- **AND** deployed remote target origin facts are stored on
  `deployment-config` records as display-safe `targetUrl` values
- **AND** workspace save, pull, push, reset, export, and restore never rewrite
  owner-authored `formless.ts`

#### Scenario: Workspace push apply

- **WHEN** `formless push` runs
- **THEN** the workflow composes an instance archive from the Program record
  state file, complete materialized Program artifact, and referenced media
  payloads
- **AND** it reads and validates the current target source under the target's
  active Program schema and provenance before comparing it with the desired
  workspace source
- **AND** a schema delta is storage-compatible only when it changes no stored
  entity or field identity, stored value shape, constraint, or required record
  materialization and both current and replacement records validate unchanged
  under the desired schema
- **AND** schema-authored presentation links and link controls may differ without
  making an otherwise unchanged Program record contract migration-required
- **AND** it writes a durable backup of the validated current target archive
  before runtime, Program, or media mutation
- **AND** the backup remains governed by the target's pre-reconciliation Program
  schema and provenance
- **AND** it reconciles the runtime required by the desired workspace Program
  before final target restore validation
- **AND** it verifies the reconciled runtime identifies the desired Program and
  validates the replacement archive through target restore dry-run
- **AND** the workflow applies the composed instance archive restore through
  runtime APIs without requiring apply, replace, stale acknowledgement, or
  install collision flags
- **AND** remote Program records and referenced media are reconciled to match
  the composed workspace state
- **AND** archive restore planning validates workspace Program provenance
  against the complete Program artifact selected for the deployed runtime
- **AND** a schema-changing push apply validates the replacement archive against
  the selected target runtime after required runtime reconciliation and before
  mutating remote Program or media state
- **AND** replacement applies only while the target still has the source cursor
  captured for comparison and backup
- **AND** `formless push --dry-run` validates and reports every locally
  decidable part of the restore plan without mutating the target

### Requirement: Workspace Sync Planning

The system SHALL derive compact push and pull sync plans without treating remote
differences as a safety blocker.

#### Scenario: Check sync state

- **WHEN** a workspace targeting a remote instance runs `formless push`,
  `formless push --dry-run`, `formless pull`, or `formless pull --dry-run`
- **THEN** remote target records and schema provenance are compared with local
  workspace record state and schema provenance
- **AND** unified `route`, `deployment-config`, domain record, and media changes
  are reported without deriving intent from `formless.ts`
- **AND** pull treats target schema-owned control-plane records, routes,
  deployment config intent, complete Program state, Program provenance, and
  referenced media payloads as the source for local workspace replacement
- **AND** pull excludes raw provider state, Alchemy state, deployment observation
  cache fields, deployment execution history, and provider evidence from
  reviewable workspace source
- **AND** remote checks select the deployed instance origin from enabled
  `deployment-config.targetUrl` workspace state
- **AND** deployment attempt, evidence, cleanup, status summaries, and
  deployment config observation cache fields are treated as runtime observation
  state rather than source changes
- **AND** protected remote target reads use the workspace's resolved admin
  bearer authorization when no browser owner session is available to the CLI

#### Scenario: Up-to-date sync

- **WHEN** local workspace source and selected remote target state are already
  equivalent
- **THEN** push and pull report `Everything up to date.`
- **AND** the no-op message is the exact command output and is not accompanied
  by sync plan, drift, deploy, migration, retry, or warning text
- **AND** push does not run archive restore or provider mutation
- **AND** pull does not rewrite workspace source

### Requirement: Workspace Record Entity Names

The system SHALL keep workspace state record entity names aligned with the
resolved schema identified by that state file's schema provenance.

#### Scenario: Write Program workspace record entity

- WHEN Program records are written into workspace state
- THEN record `entity` values use entity keys from the complete Program schema
- AND portable archive envelopes do not rewrite workspace state records into a
  separate qualified entity-name format

### Requirement: Schema-Owned Program Snapshots

The system SHALL represent instance control-plane intent, reviewable identity,
standard, Task, and Site records in workspace state and portable archive
envelopes through one schema-owned Program snapshot without storing secrets,
deployment observation cache, or deployment execution history.

#### Scenario: Instance archive includes Program records

- **WHEN** an instance archive includes Program configuration
- **THEN** current `route`, `deployment-config`, and other instance records are
  represented through an `instance:control-plane` Program storage snapshot
- **AND** principals, principal emails, organizations, groups, memberships,
  roles, role assignments, invitations, account policies, and policy
  acceptances are represented through that same snapshot
- **AND** active and tombstoned Task records are represented through that same
  snapshot
- **AND** active and tombstoned records for all three Site-owned entities are
  represented through that same snapshot
- **AND** active and tombstoned standard inquiry and contact-subscription
  records are represented through that same snapshot
- **AND** the snapshot uses schema key `formless-program`, provenance kind
  `program`, and the complete Program source hash
- **AND** provider API tokens, Alchemy passwords, Alchemy state tokens, raw lease
  tokens, and full provider resource JSON are excluded
- **AND** credentials, sessions, challenge secrets, invite token hashes, grants,
  recovery material, and provider responses are excluded
- **AND** `deploy-attempt`, `deploy-evidence-summary`,
  cleanup audit summaries, and provider state payloads
  are excluded from instance archives and workspace state
- **AND** runtime-observed deployment cache fields on `deployment-config`
  records are excluded from instance archives and workspace state
- **AND** every record and media object belongs to the Program archive scope

#### Scenario: Workspace Program state remains reviewable

- **WHEN** workspace source is written
- **THEN** unified `route`, deployment intent, and current domain records are
  reviewable in `state/instance.json`
- **AND** reviewable identity records from the same Program Authority are present
  in that file
- **AND** reviewable Task records from the same Program Authority are present in
  that file
- **AND** reviewable Site records from the same Program Authority are present
  in that file
- **AND** reviewable standard inquiry and contact-subscription records from the
  same Program Authority are present
  in that file
- **AND** the file declares a workspace state kind, version,
  storage identity `instance:control-plane`, schema key
  `formless-program`, schema timestamp, source cursor, Program schema
  provenance, and records
- **AND** the file does not embed the full Program App schema object
- **AND** `formless.ts` does not duplicate that intent
- **AND** deployment attempts, evidence summaries, and cleanup
  audit summaries are available only through deployment runtime projection, not
  reviewable workspace state or Gateway Push
- **AND** deployment config observation cache fields are omitted from reviewable
  workspace state
- **AND** secret-looking fields are rejected from reviewable workspace state

### Requirement: Schema Program Sync Comparison

The system SHALL compare workspace Program records against remote schema-owned
Program records for push and pull sync planning.

#### Scenario: Check Program changes

- **GIVEN** a sync operation compares Program state
- **WHEN** remote and local Program records differ
- **THEN** changes are reported from schema-owned route and deployment config
  records
- **AND** reviewable identity record changes are reported from the same Program
  state comparison
- **AND** Task record changes are reported from the same Program state
  comparison
- **AND** Site record changes are reported from the same Program state
  comparison
- **AND** standard inquiry and contact-subscription record changes are reported
  from the same Program state
  comparison
- **AND** hostless path, exact-host mapping, and redirect changes are compared
  through `instance:route` records
- **AND** provider observations remain separate from desired intent comparison
