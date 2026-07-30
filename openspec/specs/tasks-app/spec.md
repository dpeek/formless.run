# tasks-app Specification

## Purpose

The Tasks app defines the bundled task tracking source app used for task
records and generated task admin workflows. It is an in-repo app package, not
root runtime source data.

## Requirements

### Requirement: Tasks App Package Source

The system SHALL provide Tasks as a bundled in-repo app package that owns its
manifest and source schema.

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

### Requirement: Reusable Tasks Schema Modules

The Tasks package SHALL expose its runtime-neutral schema declarations through
a documented TypeScript schema subpath while preserving its complete portable
installed-app artifact.

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
- **AND** exporting the TypeScript modules does not itself compose Tasks into
  the default Program, move Tasks records, or change installed-app runtime
  selection

### Requirement: Tasks Source App

The system SHALL provide a bundled `tasks` source app schema for task tracking
workflows.

#### Scenario: Load Tasks source schema

- **GIVEN** the runtime resolves bundled source app key `tasks`
- **WHEN** the source schema is loaded
- **THEN** the app schema is available for schema key `tasks`
- **AND** the schema parses through the normal app schema parser
- **AND** the generated workspace screen label is `Tasks`

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

- **WHEN** the Tasks generated admin surface renders
- **THEN** the owner can review all, active, completed, and overdue tasks
- **AND** the owner can create and update task records through generated
  operations
- **AND** the owner can clear completed tasks through the source-declared
  collection command
