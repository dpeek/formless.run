# tasks-app Specification

## Purpose

The Tasks package owns reusable task tracking schema declarations.
The default Formless Program composes those declarations as one built-in
singleton domain whose records live in Program Authority.

## Requirements

### Requirement: Tasks Domain Package Source

The system SHALL provide Tasks as a bundled in-repo domain package that owns its
standalone artifact and reusable schema modules.

#### Scenario: Tasks domain package scaffold

- **GIVEN** the bundled Tasks domain package is present
- **WHEN** package source files are inspected
- **THEN** Tasks source data lives under `lib/tasks-app/`
- **AND** the package contains `schema.json`, package-local `AGENTS.md`,
  `package.json`, `tsconfig.json`, and root and schema `src/` exports
- **AND** `lib/tasks-app/` is the repository source owner for Tasks schema declarations

#### Scenario: Tasks package runtime boundary

- **GIVEN** the Tasks package publishes schema modules and standalone
  `schema.json`
- **WHEN** the default Program is materialized and served
- **THEN** trusted build-time composition imports the schema modules
- **AND** Worker request handling consumes only the complete Program artifact
- **AND** the package root exports the stable Task entity id without install,
  source-schema selection, or record-adapter keys
- **AND** the standalone artifact is not an install, route, Authority, replica,
  archive, workspace, upgrade, deploy, or authorization identity

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
- **AND** package exports do not select Program storage, routing,
  authorization, archive, workspace, or runtime availability

### Requirement: Program-Native Singleton Tasks

The default Formless runtime SHALL expose one Tasks domain through the Program
screen, Authority, replica, archive, and workspace.

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

### Requirement: Generic Tasks Runtime Behavior

The Tasks package SHALL require no package-specific executable record adapter.

#### Scenario: Validate and canonicalize composed Task records

- **GIVEN** a Program contains the package-owned Task entity
- **WHEN** Program bootstrap, write validation, snapshot parsing,
  canonicalization, archive, or workspace validation runs
- **THEN** generic complete-schema validation checks Task fields, references,
  uniqueness, lifecycle state, tombstones, stable entity identity, and record ids
- **AND** generic reviewable-record formatting retains flat Task records
- **AND** omitting Tasks from a Program does not require or bundle Tasks runtime
  behavior

#### Scenario: Execute clear completed declaratively

- **GIVEN** the Tasks schema declares its completed query and clear-completed
  operation
- **WHEN** the operation executes
- **THEN** the operation uses the generic `tombstone-query-results` handler to
  tombstone records selected by the declared query
- **AND** no Tasks-specific operation handler or entity-id activation is used
