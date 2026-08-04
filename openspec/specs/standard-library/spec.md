# Formless Standard Library Specification

## Purpose

The Formless standard library provides reusable schema-as-data domain modules
for explicit trusted TypeScript composition without owning Program storage,
routes, navigation, or runtime discovery.

## Requirements

### Requirement: Standard Library Package

The system SHALL provide `@dpeek/formless-standard` as the package owner for
reusable standard domain declarations that are not owned by a product surface.

#### Scenario: Import standard schema authoring

- GIVEN trusted TypeScript composition needs standard contact-intake declarations
- WHEN it imports `@dpeek/formless-standard/schema`
- THEN the package exposes granular inquiry and contact-subscription record modules
- AND it exposes a complete standard schema source that composes those modules in
  deterministic order
- AND package exports contain runtime-neutral schema declarations and supported
  authoring metadata rather than runtime package metadata
- AND consumers do not deep-import package source files

#### Scenario: Standard declarations do not select a runtime

- GIVEN a Program imports one or more standard schema modules
- WHEN its complete Program artifact and runtime bundles are built
- THEN the Program root separately selects storage, routes, navigation,
  authorization, shared adapters, browser behavior, and Worker behavior
- AND importing the package does not discover modules, register executable
  adapters, create storage, or load package schema at request time

### Requirement: Standard Contact-Intake Records

The standard library SHALL own the existing flat `contact`, `contact-message`,
`email-address`, `audience`, and `subscription` declarations as reusable Program
record modules.

#### Scenario: Compose standard inquiries

- GIVEN a Program selects the standard inquiry record module
- WHEN its schema is composed
- THEN the module contributes the existing `contact-message` entity with its
  stable entity id, name, email, message, and anonymous public submit operation
- AND the submitted facts remain flat Program records
- AND the module does not require Site records, blocks, routes, or presentation

#### Scenario: Compose standard contact subscriptions

- GIVEN a Program selects the standard contact-subscription record module
- WHEN its schema is composed
- THEN the module contributes the existing `contact`, `email-address`,
  `audience`, and `subscription` entities with their stable entity ids, fields,
  constraints, operations, relationships, and queries
- AND it declares the shared `contact-subscription.subscribe` executable
  requirement for the public subscribe operation
- AND the records remain flat and use normal reference fields

#### Scenario: Contact does not assert authentication identity

- GIVEN the standard contact-subscription model stores a `contact` record
- WHEN identity or authorization behavior is evaluated
- THEN the contact is a Program record used by the current subscription model
- AND it is not an auth principal, private credential identity, organization,
  or assertion that one unique real-world person has been established

### Requirement: Granular Standard Composition

The system SHALL let downstream Programs select standard inquiry and
contact-subscription modules explicitly and independently.

#### Scenario: Select standard modules

- GIVEN a downstream Program owns its ordered schema module list
- WHEN it selects both standard record modules, only one module, or neither
- THEN ordinary whole-declaration composition produces the selected complete
  schema artifact
- AND the root does not copy, filter, merge, enrich, or rename declarations to
  reconcile competing owners
- AND normal duplicate declaration collision rules continue to reject multiple
  owners for one declaration path

#### Scenario: Default Program uses standard contact intake

- GIVEN the default Formless Program is composed
- WHEN its explicit module list is materialized
- THEN it includes the standard inquiry and contact-subscription record modules
  exactly once
- AND the resulting records use Program storage identity
  `instance:control-plane` and schema key `formless-program`
- AND standard package or module identity does not become record, storage,
  route, replica, archive, provenance, or authorization identity

### Requirement: Site Projection Over Standard Records

Site SHALL remain the owner of publishing, public form placement, public block
projection, copy, and Site-specific contact-intake presentation over selected
standard operations and records.

#### Scenario: Compose Site contact intake

- GIVEN a Program selects Site and the standard contact-intake modules
- WHEN it includes the optional Site contact-intake presentation module
- THEN Site subscriber and contact-message views and screens project the
  standard records
- AND Site public blocks bind to the selected standard public operations
- AND Site does not redeclare or own the standard record entities

#### Scenario: Omit standard contact intake from Site

- GIVEN a downstream Program selects Site content modules without the standard
  contact-intake modules or their Site presentation
- WHEN its schema and runtime are built
- THEN Site content, block placement, publishing, and public rendering remain
  composable
- AND a stored Site form block whose target operation is unavailable projects
  the existing unavailable-operation warning instead of discovering or
  installing a module
