# tasks-app Specification

## Purpose

The Tasks package owns reusable task tracking schema declarations and adapters.
The default Formless Program composes those declarations as one built-in
singleton domain whose records live in Program Authority.

## Requirements

### Requirement: Tasks App Package Source

The system SHALL provide Tasks as a bundled in-repo app package that owns its
standalone artifact, reusable schema modules, and domain adapters.

#### Scenario: Tasks package scaffold

- **GIVEN** the bundled Tasks app package is present
- **WHEN** package source files are inspected
- **THEN** Tasks source data lives under `lib/tasks-app/`
- **AND** the package contains `formless.app.json`, `schema.json`, package-local
  `AGENTS.md`, `package.json`, `tsconfig.json`, and root `src/` exports
- **AND** root runtime does not keep a duplicate Tasks source schema under
  `schema/apps/tasks`

#### Scenario: Tasks package manifest

- **GIVEN** bundled app package manifests are composed
- **WHEN** the Tasks package manifest is parsed
- **THEN** it declares package app key `tasks`, label `Tasks`, default install
  id `tasks`, bundled source schema key `tasks`, and generated admin capability
- **AND** it does not declare public Site capability
- **AND** package metadata comes from the Tasks package manifest rather than
  synthetic root runtime metadata
- **AND** retaining the manifest and standalone schema artifact does not make
  Tasks available to the default runtime install resolver or route admission

### Requirement: Reusable Tasks Schema Modules

The Tasks package SHALL expose its runtime-neutral schema declarations through
a documented TypeScript schema subpath while preserving its complete portable
standalone artifact.

#### Scenario: Import Tasks schema authoring

- **GIVEN** a trusted TypeScript composition root needs Tasks declarations
- **WHEN** it imports `@dpeek/formless-tasks-app/schema`
- **THEN** the package exports the `tasksRecordSchemaModule`,
  `tasksPresentationSchemaModule`, and complete `tasksSchemaSource`
- **AND** the record module owns the Task entity, its stable entity id,
  operations, and queries
- **AND** the presentation module depends on the record module and owns the
  Tasks item views, collection views, create view, and screen
- **AND** the complete source composes the record module before the dependent
  presentation module
- **AND** consumers do not deep-import Tasks package source files

#### Scenario: Publish Tasks schema authoring

- **GIVEN** the Tasks package is packed for publication
- **WHEN** its documented entrypoints are emitted
- **THEN** the root and `./schema` entrypoints have executable ESM,
  declarations, and source maps
- **AND** `schema.json` remains the deterministic portable schema artifact
- **AND** `formless.app.json` continues to identify and hash that artifact
- **AND** package exports do not select Program storage, routing,
  authorization, archive, workspace, or runtime package availability

### Requirement: Program-Native Singleton Tasks

The default Formless runtime SHALL expose one Tasks domain through the Program
without a schema-key or installed-app Tasks surface.

#### Scenario: Compose Tasks into the default Program

- **GIVEN** the default Program composition imports the public Tasks modules
- **WHEN** the Program artifact is materialized
- **THEN** the Task entity, queries, operations, item views, views, and screen
  are part of the complete `formless-program` schema
- **AND** the Task entity retains its package-owned stable entity id
- **AND** Program-owned same-key replacements add Program access requirements,
  select screen path `/tasks`, and place Tasks in Program navigation
- **AND** the package-owned standalone source remains a valid deterministic
  artifact without becoming another default runtime mount

#### Scenario: Store Tasks in Program Authority from first use

- **WHEN** a Program-authorized caller creates, updates, reads, or clears Tasks
- **THEN** Task records, changes, operation invocations, schema, and cursor use
  storage identity `instance:control-plane`
- **AND** Task records share the Program record-id namespace, snapshot boundary,
  browser replica, broadcast channel, and push connection
- **AND** no record, cursor, change history, operation history, archive,
  workspace state, replica, or provenance is imported from a legacy
  `app:<installId>` Tasks Authority

#### Scenario: Keep legacy Tasks installs dormant

- **GIVEN** Program records still contain legacy Tasks `app-install` or `route`
  metadata
- **WHEN** install registry, navigation, route admission, archive app selection,
  workspace app selection, or package upgrade selection runs
- **THEN** those records do not resolve a Tasks runtime surface
- **AND** legacy Tasks Authority storage remains untouched and unreachable
- **AND** cleanup, deletion, discovery, collision checking, or migration is not
  required

### Requirement: Flat Tasks Data Model

The Tasks source schema SHALL model task state as flat task records with scalar
fields, generated queries, and generated operations.

#### Scenario: Task records stay flat

- **WHEN** task records are stored
- **THEN** each task record stores only scalar field values for title, done
  status, optional due date, and priority
- **AND** subtasks, checklists, comments, and related workflow state are not
  nested inside task records

#### Scenario: Generated task workflows

- **WHEN** the Program Tasks screen renders
- **THEN** a current Program member can review all, active, completed, and
  overdue tasks through the complete Program replica
- **AND** the Task create, update, and clear-completed operations require the
  schema-defined Program `editor` role
- **AND** replica membership alone does not authorize a Task operation

### Requirement: Tasks Program Adapter

The Tasks package SHALL own the stable-entity constraint and reviewable-record
behavior needed when downstream Programs compose Task records.

#### Scenario: Validate composed Task records

- **GIVEN** a Program contains the package-owned Task entity
- **WHEN** Program bootstrap, write validation, snapshot parsing,
  canonicalization, archive, or workspace validation runs
- **THEN** the Program root registers a Tasks adapter by the Task stable entity
  id
- **AND** the adapter receives only Task records while generic Program
  validation sees the complete mixed record set
- **AND** reviewable Task records remain flat and retain lifecycle and tombstone
  state
- **AND** authoring module keys, package keys, schema keys, screen keys, and
  route keys are not used as runtime constraint or authorization identity
