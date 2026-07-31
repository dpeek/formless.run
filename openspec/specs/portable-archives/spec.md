# Portable Archives Specification

## Purpose

Portable archives move Formless app and instance data through reviewable save,
pull, push, backup, restore, import, and ejection workflows. They are
internal data-movement plumbing, not a separate public CLI command family.

## Requirements

### Requirement: Archive Kinds And Capabilities

The system SHALL encode app and instance archives with explicit kind, version,
capability, metadata, app data, and media payload information.

#### Scenario: Archive kinds

- GIVEN a portable archive is parsed
- WHEN the archive kind is read
- THEN supported kinds are `formless.instanceArchive` and
  `formless.appArchive`
- AND unsupported kinds are rejected before mutation

#### Scenario: Media capability

- GIVEN an archive includes owned image or app-scoped document media
- WHEN capabilities are parsed
- THEN `core-media-assets` is accepted
- AND `app-scoped-media` is rejected
- AND image and document asset metadata remain distinguished inside the one
  current core media capability

### Requirement: Current Archive Input Only

The system SHALL reject non-current portable archive envelopes before restore,
import, or workspace validation.

#### Scenario: Reject non-current archive input

- WHEN archive restore, restore dry-run planning, import validation, or
  workspace validation checks read an unsupported archive kind, archive version
  older or newer than the current archive version, missing package fact fields,
  or unsupported entity-name spelling
- THEN the archive is rejected before mutation
- AND target app, instance, and media data remain unchanged

#### Scenario: Program cutover advances current state contracts

- GIVEN an instance archive or `state/instance.json` uses the former standalone
  instance-control-plane schema key or provenance
- WHEN current archive or workspace parsing runs after the Program cutover
- THEN the input is rejected as non-current before mutation
- AND current output uses schema key `formless-program`, provenance kind
  `program`, and one mixed Program record set
- AND the runtime does not retain dual current archive or workspace state shapes

#### Scenario: Tasks cutover advances current state contracts

- GIVEN an archive or workspace contains Tasks as an installed-app storage
  snapshot or `state/apps/<installId>.json`
- WHEN current archive or workspace parsing runs after the Tasks Program cutover
- THEN that input is not adopted as the authoritative Tasks record set
- AND current output carries Task records only inside the Program snapshot
- AND no legacy Tasks record, cursor, change history, operation history,
  archive, workspace state, replica, or provenance is imported or merged

#### Scenario: Site cutover advances current state contracts

- GIVEN an archive or workspace contains built-in Site records in an installed
  app storage snapshot or `state/apps/<installId>.json`
- WHEN current archive or workspace parsing runs after the Site Program cutover
- THEN that input is not adopted as the authoritative Site record set
- AND current output carries built-in Site records only inside the Program
  snapshot
- AND no legacy Site record, cursor, change history, operation history, media
  provenance, archive, workspace state, replica, or provenance is imported or
  merged

### Requirement: Export Latest Archive Format

The system SHALL write portable archives using the latest supported archive
envelope.

#### Scenario: Export app or instance archive

- WHEN an app or instance archive is exported
- THEN the archive uses the latest supported archive version
- AND the archive records enough package app revision and schema hash facts for
  source identity checks
- AND each archived app install records package revision and source schema hash
  facts

### Requirement: Archive Export

The system SHALL export archives from Authority-backed source of truth, not
browser replica state.

#### Scenario: Instance export

- GIVEN a target Formless instance has app installs and app data
- WHEN an instance archive is exported
- THEN one Program storage snapshot, app storage snapshots, and
  referenced core media are read from the target
- AND the Program snapshot contains instance, reviewable identity, Task, and
  Site records from storage identity `instance:control-plane`
- AND legacy Tasks and built-in Site installs do not contribute app storage
  snapshots
- AND core images referenced by Program-native Site records are carried by a
  Program media manifest using archive paths under `media/program/`
- AND archive media files are written at manifest archive paths
- AND protected target reads use owner session or admin bearer authorization
  supplied by the caller

#### Scenario: App export

- GIVEN one installed app is selected
- WHEN an app archive is exported
- THEN one app archive directory is written
- AND referenced core image and document media objects are included when
  schema-declared asset fields reference them
- AND document objects preserve filename, MIME type, byte size, access policy,
  asset id, and source owner install id without exposing provider credentials
- AND protected target reads use owner session or admin bearer authorization
  supplied by the caller

### Requirement: Schema-Aware Record Formatting

The system SHALL format stored-record output deterministically from App schema
declaration order while treating input object property order as semantically
irrelevant.

#### Scenario: Format flat record values

- GIVEN a stored record has flat `values`
- WHEN the record is formatted for a storage snapshot, portable archive,
  workspace state, or CLI-readable output
- THEN known value properties are written in the containing entity's field
  declaration order
- AND absent fields are omitted without placeholders
- AND unexpected or forward-version value properties are preserved after known
  fields in locale-independent ordinal key order
- AND record ids, entity keys, lifecycle metadata, and flat value shape remain
  unchanged

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

- GIVEN a portable archive directory exists
- WHEN restore runs without `--apply`
- THEN validation and planning run as a dry-run
- AND no remote app, instance, or media data is mutated

#### Scenario: Validate before apply

- GIVEN restore is requested with `--apply`
- WHEN the archive contains schemas, records, install metadata, or media
- THEN schema, records, references, unique constraints, app install policy,
  media metadata, and media files are validated before mutation
- AND document validation checks asset kind, filename, normalized MIME type,
  byte size, access policy, owner install id, archive path, storage key, and
  payload before mutation

### Requirement: Restore Execution

The system SHALL restore populated initial or replacement state through
portable archives, restore media before app records, and keep restore policy
explicit.

#### Scenario: Apply restore

- GIVEN restore validation succeeds and mutation is explicitly requested
- WHEN restore applies
- THEN core media objects are written before Program or app records
- AND app data is restored through installed app storage identity
- AND Program data is restored through `instance:control-plane` storage identity
  when the archive includes it
- AND Program-native Site image references use existing instance core media
  identities without app-install retargeting

#### Scenario: Create populated install from app archive

- GIVEN an app archive targets an install id that is not installed
- WHEN restore validation succeeds and apply is explicitly requested
- THEN restore creates the install from resolved package metadata
- AND the archive supplies the install's schema, records, and referenced media
- AND package source does not supply records before or after archive restore
- AND the install route becomes usable only after its archive data is restored
- AND a failed restore does not leave a partially usable installed app route

#### Scenario: Replacement policy

- GIVEN restore would collide with existing install metadata
- WHEN replacement was not explicitly requested
- THEN restore refuses the collision
- AND existing target data remains unchanged

### Requirement: App Archive Retargeting

The system SHALL allow app archives to restore to a selected install id when the
restore command supports retargeting.

#### Scenario: Retarget private app archive

- GIVEN an archive for a runtime-installable private app exists
- WHEN a workspace or restore workflow applies the archive with a target
  install id
- THEN the app archive can be restored to that install id
- AND install-scoped storage and routes use the target install id
- AND this behavior does not restore a built-in Site archive into Program
  storage

#### Scenario: Retarget app-scoped document media

- GIVEN an app archive contains referenced document assets
- WHEN the archive is restored to a selected target install id
- THEN each document keeps its flat asset id, filename, MIME type, byte size,
  and public or private access policy
- AND its owner install id, provider storage key, and delivery href are
  recomputed for the target install
- AND a target collision with incompatible immutable bytes or metadata is
  rejected before mutation

### Requirement: Archive Package Boundary

The system SHALL expose reusable portable archive contracts, current-envelope
parsing, restore planning, and local archive file adapters through the Archive
package slice.

#### Scenario: Package owns portable archive contracts

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
  IO, or package-local tests need storage snapshot contracts, installed app
  metadata contracts, app package resolver contracts, package revision/hash
  contracts, or App schema behavior
- **THEN** those dependencies come from public package exports such as
  `@dpeek/formless-storage`, `@dpeek/formless-installed-apps`, and
  `@dpeek/formless-schema`
- **AND** the downstream runtime supplies Program schema resolution,
  mixed-record validation, and domain-specific reviewable canonicalization
  through explicit Archive package inputs
- **AND** the Archive package does not import `lib/formless/src/shared/*` or
  `lib/formless/src/test/*` modules

#### Scenario: Package does not own archive execution

- **WHEN** archive export, archive restore apply, app install mutation,
  Authority reads or writes, Durable Object storage, browser replica state,
  media object mutation, provider mutation, workspace save/check/pull/push,
  or CLI command policy is needed
- **THEN** those behaviors remain owned by CLI runtime, Archive workflows,
  Workspace runtime, Worker runtime, Authority, Media runtime, Deploy runtime,
  or provider adapters
- **AND** the Archive package supplies contracts, parser/formatter behavior,
  deterministic planning, and local archive filesystem adapters rather than
  owning app records, runtime storage, media storage, deployed runtime records,
  provider credentials, Cloudflare resources, or Alchemy resources

#### Scenario: Current archive version only

- **GIVEN** archive parsing, restore dry-run planning, or workspace validation
  checks read an archive envelope
- **WHEN** the archive version differs from the current portable archive version
- **THEN** the archive is rejected with an unsupported archive version error
- **AND** package facts are read only from current archive fields

### Requirement: Workspace Source Of Truth

The system SHALL treat the `formless.ts` workspace configuration,
configuration-owned workspace package links, workspace record state files,
schema provenance, and media payloads as the reviewable local source of truth
for local-first Formless workspaces.

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
- **AND** no app install, route, deployment config, Cloudflare resource,
  Alchemy resource, provider credential, or remote instance is created by fresh
  local workspace bootstrap

#### Scenario: Save from local Authority

- **WHEN** workspace save runs against local Authority state containing active
  app records, Program records, and referenced core image or document media
- **THEN** the system writes deterministic record state files, schema
  provenance, and referenced media payloads from Authority-backed state
- **AND** instance control-plane, reviewable identity, Task, and Site records
  are written to `state/instance.json`
- **AND** installed app records are written to `state/apps/<installId>.json`
- **AND** no Program-native Tasks or built-in Site install produces an app state
  file
- **AND** browser replica state is not used as the source of truth
- **AND** secret-looking fields are rejected from reviewable workspace state

#### Scenario: Rebuild local runtime state

- **WHEN** workspace-local runtime state under `.formless/local` is reset
- **THEN** the next local dev run can rebuild runtime state from workspace
  record state files, schema provenance, and media payloads
- **AND** reviewable workspace source remains unchanged by the reset

#### Scenario: Empty workspace runtime state

- **WHEN** workspace-local dev starts after fresh CLI bootstrap with a base
  manifest and no record state files
- **THEN** the local product instance starts with no installed apps
- **AND** the user can install the first app through local Authority-backed
  browser actions

### Requirement: Workspace Storage State

The system SHALL store workspace state as compact record state files and media
payloads, not portable archive directories or duplicated schema source bodies.

#### Scenario: Workspace record state files

- **WHEN** workspace source is written
- **THEN** Program state is written to `state/instance.json`
- **AND** each installed app's Authority storage state is written to
  `state/apps/<installId>.json`
- **AND** Task and built-in Site records are written only to
  `state/instance.json`
- **AND** no Program-native Tasks or built-in Site install produces
  `state/apps/<installId>.json`
- **AND** each state file declares kind, version, storage identity, schema key,
  exported timestamp, schema timestamp, source cursor, schema provenance, and
  records
- **AND** schema provenance identifies the resolved source schema by source
  schema hash, package app key and package revision for installed apps, or
  runtime-owned schema hash for the complete Program schema
- **AND** installed app state files declare `schemaProvenance.kind`
  `package-app`, `packageAppKey`, `packageRevision`, and `sourceSchemaHash`
- **AND** `state/instance.json` declares `schemaProvenance.kind`
  `program` and the complete Program `sourceSchemaHash`
- **AND** workspace state files do not embed the full App schema object
- **AND** `state/instance.json` uses storage identity `instance:control-plane`
- **AND** `state/instance.json` uses schema key `formless-program`
- **AND** it includes instance, reviewable identity, Task, and Site records from
  the same Authority record-id namespace
- **AND** app state files use storage identity `app:<installId>`
- **AND** workspace state kind constants, version constants, and parsing
  behavior come from the Workspace package contract

#### Scenario: Auto-save uses compact workspace state

- **WHEN** local workspace auto-save persists source from local Authority
- **THEN** it writes the same `state/instance.json`, `state/apps/<installId>.json`,
  and `state/media` source shape as manual workspace save
- **AND** it does not write portable archive envelopes as workspace source
- **AND** it does not read browser IndexedDB as source

#### Scenario: Workspace media state

- **WHEN** workspace source contains core media referenced by Program or
  installed app records
- **THEN** media payloads are stored under `state/media`
- **AND** document payload content types and metadata come from validated media
  manifest facts rather than filename-only inference
- **AND** referenced private document payloads are included in authorized
  workspace source flows without being encrypted or redacted by runtime access
  policy
- **AND** media bytes, object metadata, and provider storage metadata are not
  nested into storage snapshots

#### Scenario: Portable archive envelope composition

- **WHEN** workspace export, push, restore, or backup needs a portable archive
- **THEN** the workflow resolves package and control-plane source schemas from
  workspace schema provenance
- **AND** it composes a portable archive envelope from resolved schemas,
  workspace record state files, media payloads, and the restore policy selected
  by the owning workflow
- **AND** workspace `state/instance.json`, `state/apps/<installId>.json`, and
  `state/media` files are not themselves portable archive envelopes

#### Scenario: Workspace state vocabulary

- **WHEN** workspace save, check, pull, push, gateway status, tests, local
  adapters, or local agent instructions describe reviewable workspace source
- **THEN** instance and app source files are described as workspace state,
  record state, instance state, app state, or media payloads
- **AND** archive terminology is reserved for portable archive envelopes,
  archive restore/export/import/backup workflows, and archive manifest paths
  inside portable archive payloads
- **AND** workspace result fields, sync summaries, logs, and package-local
  instructions do not call `state/instance.json` an instance archive,
  `state/apps/<installId>.json` app archives, or workspace state files storage
  snapshots

### Requirement: Workspace App Package Links

The system SHALL allow a local Formless workspace to link private filesystem app
package manifests through reviewable workspace configuration
without storing package links in instance control-plane records.

#### Scenario: Workspace package link source

- **GIVEN** a workspace contains optional `formless.ts` `packages.links`
- **WHEN** the package link source is read
- **THEN** the workspace configuration declares an ordered list of app package
  manifest links in `packages.links`
- **AND** each link points to a local relative `formless.app.json` path such as
  `../app/formless.app.json`
- **AND** absolute paths, URL-like values, home-relative paths, empty paths,
  duplicate links, and secret-looking fields are rejected
- **AND** omitting `packages.links` means the active resolver contains only
  bundled app packages

#### Scenario: Resolve linked package source

- **GIVEN** a workspace package link points at a local app package manifest
- **WHEN** the workspace package resolver is built
- **THEN** the linked package manifest is parsed
- **AND** the linked package source schema is read relative to the package
  manifest directory
- **AND** the source schema parses as an app schema
- **AND** the computed source schema hash matches the package manifest
  `sourceSchemaHash`
- **AND** the resolved package is added to the active workspace resolver
  without writing package source paths to `app-install`, `route`, or
  `deployment-config` records

#### Scenario: Package link source is dependency config

- **WHEN** workspace source is saved, checked, pushed, exported, or
  restored
- **THEN** `formless.ts` `packages.links` is treated as reviewable
  dependency configuration for resolving package app source
- **AND** package links are not app install intent, route intent, app data,
  media payloads, provider config, deployment observation, or runtime secret
  state
- **AND** `formless.ts` declares package app source links only inside
  configuration-owned package configuration

### Requirement: Workspace Runtime Extension Archive Boundary

The system SHALL keep trusted workspace runtime extension code and renderer
module configuration outside portable app and instance archive envelopes.

#### Scenario: Runtime extension config is not archive data

- **WHEN** an app or instance archive is exported from a Formless instance or
  composed from workspace source
- **THEN** the archive includes app data, control-plane data, schemas, package
  facts, and media payloads selected by the archive capabilities
- **AND** the archive does not include workspace renderer source files,
  renderer module paths, `formless.ts` `runtime.extensions` entries, build
  aliases, local dependency paths, or runtime extension digests
- **AND** archive package facts do not imply that a restored target has the
  same workspace renderer code available

#### Scenario: Restore without renderer code

- **GIVEN** Site app records are restored or imported into a workspace or
  runtime that does not configure `site.publicRenderer`
- **WHEN** public Site preview, installed, mapped-host, or published rendering
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

### Requirement: Workspace Package Boundary

The system SHALL expose reusable Formless workspace source, local state, and
semantic operation contracts through the Workspace package slice.

#### Scenario: Package owns workspace source contracts

- **WHEN** CLI runtime, Gateway runtime adapters, archive workflows,
  tests, or local agent workflows need `formless.ts` configuration contracts,
  default resolution, package link validation, workspace path defaults,
  workspace target URL normalization, workspace storage snapshot contracts,
  ignored local state
  contracts, ignored secret state contracts, semantic workspace operation input
  shapes, display-safe operation state, operation result shapes, operation
  redaction, or deterministic local filesystem workspace IO
- **THEN** they import that behavior from `@dpeek/formless-workspace` or
  `@dpeek/formless-workspace/node`
- **AND** they import package-owned workspace behavior only through exported
  Workspace package entrypoints, not source-tree modules or unexported package
  internals

#### Scenario: Package consumes public contract packages

- **WHEN** the Workspace package local Node adapter or package-local tests need
  storage snapshot contracts, app package manifest parsing, active package
  resolver behavior, package revision/hash contracts, source schema parsing, or
  field value validation
- **THEN** those dependencies come from public package exports such as
  `@dpeek/formless-storage`, `@dpeek/formless-installed-apps`, and
  `@dpeek/formless-schema`
- **AND** the Workspace package does not import `lib/formless/src/shared/*` or
  `lib/formless/src/test/*` modules

#### Scenario: Package does not own runtime mutation

- **WHEN** workspace save, pull, push, credential setup, app install,
  control-plane mutation, Authority reads, provider mutation, Gateway
  authorization, or runtime topology selection is needed
- **THEN** those behaviors remain owned by CLI runtime, Archive
  workflows, Deploy runtime, Worker runtime, Gateway runtime adapters, or
  provider adapters
- **AND** the Workspace package supplies source/state contracts, pure helpers,
  display-safe state handling, and local filesystem adapters rather than
  owning app records, deployed runtime records, provider credentials, or
  Cloudflare and Alchemy execution
- **AND** display-safe operation state persists under ignored local workspace
  state, not reviewable storage snapshots or media payloads

### Requirement: Instance Workspaces

The system SHALL let a local Formless workspace save, pull, push, and dev
instance state without storing instance intent or secrets in configuration.

#### Scenario: Workspace configuration

- **WHEN** a Formless workspace configuration is loaded
- **THEN** `formless.ts` default-exports trusted typed configuration with a
  required explicit name and optional workspace state root, media root, ignored
  local state root, ignored secret state root, package links, and runtime
  extension declarations
- **AND** kind, version, layout roots, empty package links, and bundled runtime
  extensions resolve from defaults when omitted
- **AND** `app-install`, unified `route`, `deployment-config` intent, remote
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
- **THEN** the workflow composes an instance archive from workspace record
  state files, resolved source schemas, and media payloads
- **AND** the workflow applies the composed instance archive restore through
  runtime APIs without requiring apply, replace, stale acknowledgement, or
  install-set replacement flags
- **AND** remote app installs, control-plane records, app data, and media are
  reconciled to match the composed workspace state
- **AND** archive restore planning for push apply uses the source schemas and
  package facts selected by the workspace source being pushed rather than stale
  target runtime source facts that are being replaced
- **AND** a schema-changing push apply validates the replacement archive against
  the selected target runtime after required runtime reconciliation and before
  mutating remote app, control-plane, or media state
- **AND** `formless push --dry-run` validates and reports the restore plan
  without mutating the target

### Requirement: Workspace Sync Planning

The system SHALL derive compact push and pull sync plans without treating remote
differences as a safety blocker.

#### Scenario: Check sync state

- **WHEN** a workspace targeting a remote instance runs `formless push`,
  `formless push --dry-run`, `formless pull`, or `formless pull --dry-run`
- **THEN** remote target records and schema provenance are compared with local
  workspace record state and schema provenance
- **AND** `app-install`, unified `route`, `deployment-config`, app record, and
  media changes are reported without deriving intent from `formless.ts`
- **AND** pull treats target schema-owned control-plane records, routes,
  deployment config intent, installed app set, app storage snapshots, schemas,
  and media payloads as the source for local workspace replacement
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

#### Scenario: Write schema-local workspace record entity

- WHEN app or Program records are written into workspace state
- THEN record `entity` values use the entity keys from the resolved schema
- AND portable archive envelopes do not rewrite workspace state records into a
  separate qualified entity-name format

#### Scenario: Keep app data outside control-plane records

- WHEN workspace state or an instance archive includes installed app data
- THEN installed app records remain scoped by app install identity through app
  record state or archive storage snapshots
- AND installed app records are not stored as instance control-plane records
- AND singleton Task and Site records are Program records rather than installed
  app data

### Requirement: Schema-Owned Program Snapshots

The system SHALL represent instance control-plane intent, reviewable identity
records, singleton Task records, and singleton Site records in workspace state
and portable archive envelopes through one schema-owned Program snapshot
without storing secrets, deployment observation cache, or deployment execution
history.

#### Scenario: Instance archive includes Program records

- **WHEN** an instance archive includes Program configuration
- **THEN** `app-install`, `route`, and `deployment-config` records are
  represented through an `instance:control-plane` storage snapshot
- **AND** principals, principal emails, organizations, groups, memberships,
  roles, role assignments, app registrations, invitations, account policies,
  and policy acceptances are represented through that same snapshot
- **AND** active and tombstoned Task records are represented through that same
  snapshot
- **AND** active and tombstoned records for all eight Site entities are
  represented through that same snapshot
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
- **AND** installed app data remains represented through storage snapshots
  scoped by app install identity
- **AND** dormant legacy Tasks or built-in Site install metadata may remain as
  Program metadata while their legacy app storage remains absent from current
  archive output

#### Scenario: Workspace Program state remains reviewable

- **WHEN** workspace source is written
- **THEN** `app-install`, unified `route`, and deployment intent is reviewable
  in `state/instance.json`
- **AND** reviewable identity records from the same Program Authority are present
  in that file
- **AND** reviewable Task records from the same Program Authority are present in
  that file
- **AND** reviewable Site records from the same Program Authority are present
  in that file
- **AND** the file declares a workspace state kind, version,
  storage identity `instance:control-plane`, schema key
  `formless-program`, schema timestamp, source cursor, Program schema
  provenance, and records
- **AND** the file does not embed the full Program App schema object
- **AND** `formless.ts` does not duplicate that intent
- **AND** deployment attempts, evidence summaries, and cleanup
  audit summaries are available only through deployment runtime projection or
  gateway operation status, not reviewable workspace state
- **AND** deployment config observation cache fields are omitted from reviewable
  workspace state
- **AND** secret-looking fields are rejected from reviewable workspace state

### Requirement: Schema Program Sync Comparison

The system SHALL compare workspace Program records against remote schema-owned
Program records for push and pull sync planning.

#### Scenario: Check Program changes

- **GIVEN** a sync operation compares Program state
- **WHEN** remote and local Program records differ
- **THEN** changes are reported from schema-owned app install, route, and
  deployment config records
- **AND** reviewable identity record changes are reported from the same Program
  state comparison
- **AND** Task record changes are reported from the same Program state
  comparison
- **AND** Site record changes are reported from the same Program state
  comparison
- **AND** app path, exact-host mapping, and redirect changes are compared through
  `instance:route` records
- **AND** provider observations remain separate from desired intent comparison
