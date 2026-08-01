# crm-app Specification

## Purpose

CRM is a package-owned customer relationship domain composed into the default
Program. It supplies portable standalone schema artifacts and CRM presentation
declarations, but it is not a runtime-installable app or schema-key source app.

## Requirements

### Requirement: CRM Package Schema Source

The system SHALL provide CRM as an in-repo package with TypeScript-authoritative
record, presentation, and complete standalone schema modules.

#### Scenario: CRM package artifacts

- **GIVEN** the CRM package is present
- **WHEN** package source and published exports are inspected
- **THEN** it exposes a documented `./schema` subpath with CRM record,
  presentation, and complete standalone source modules
- **AND** `schema.json` is deterministically materialized portable schema data
- **AND** trusted Program composition imports the schema modules at
  build/materialization time while Worker request handling consumes only the
  complete Program artifact
- **AND** the standalone data artifact is retained for package checks and
  publication rather than runtime package resolution
- **AND** the package does not own Program storage, routes, replicas, archive,
  workspace, deployment, or authorization identity

### Requirement: Program-Native CRM Domain

The default Program SHALL compose one CRM domain into Program Authority from
first use.

#### Scenario: CRM storage and identity

- **GIVEN** a CRM record or operation is selected in the default product
- **WHEN** it is read or written
- **THEN** it uses Program storage identity `instance:control-plane`, schema
  key `formless-program`, and the complete Program schema hash
- **AND** CRM shares the Program record-id namespace, write log, cursor,
  snapshot, archive, workspace, replica, broadcast channel, and WebSocket
- **AND** no CRM install-scoped Authority, API, browser database, broadcast
  channel, archive, workspace snapshot, or source-schema route exists
- **AND** current Program schema and route policy select runtime state without
  consulting package or install metadata

#### Scenario: CRM Program screens and ordinary access

- **GIVEN** a principal has the Program `member` role
- **WHEN** it navigates CRM generated screens at `/crm`, `/crm/audiences`,
  `/crm/campaigns`, or `/crm/broadcasts`
- **THEN** the Program owns navigation and screen paths
- **AND** ordinary CRM create and update operations require Program `editor`
- **AND** every authenticated Program member receives the complete Program
  replica; screen access does not create CRM-scoped replica admission

### Requirement: Shared Contact Subscription Domain

The Program SHALL use one flat contact, email-address, audience, and
subscription declaration set for Site and CRM workflows.

#### Scenario: Stable entity identity

- **GIVEN** the complete Program schema is composed
- **WHEN** it contains contact subscription entities
- **THEN** `contact`, `email-address`, `audience`, and `subscription` retain
  their existing Program-native Site stable entity ids
- **AND** CRM enriches them with its company, lifecycle, source, status,
  description, notes, and consent fields without creating same-key entities
- **AND** CRM company, campaign, campaign-message, broadcast,
  broadcast-recipient, and delivery-event declarations remain package-owned
- **AND** stored records stay flat and references model relationships
- **AND** no composite record identity or qualified stored record id is used

#### Scenario: One subscription operation

- **GIVEN** a Site subscribe block or CRM public subscriber flow is projected
- **WHEN** it invokes `subscription.subscribe`
- **THEN** one anonymous Turnstile- and same-origin-protected Program operation
  upserts the shared contact, normalized email-address, default audience, and
  subscription records
- **AND** Site subscriber and CRM audience screens are separate presentations
  of those records
- **AND** a Site subscribe block does not select a CRM install id or another
  Authority after both domains share Program storage

### Requirement: CRM Public Subscribe Boundary

CRM public subscribe SHALL execute only through the narrow Program public
operation route.

#### Scenario: Program CRM subscribe

- **WHEN** a visitor posts valid input to
  `/api/formless/program/public/operations/subscription/subscribe`
- **THEN** the Program public executor commits the shared records through
  Program validation and the Program write log
- **AND** the response remains command-shaped and does not expose subscriber
  values, challenge proof, protected storage, or provider details
- **AND** provenance records Program target kind, schema key, API prefix,
  canonical operation, host, path, and Site block id when supplied, with no
  source install id
- **AND** anonymous callers receive no Program bootstrap, schema, snapshot,
  generic operation, sync, WebSocket, or replica access

### Requirement: CRM Runtime Availability

CRM SHALL not be bundled runtime-installable or source-routable.

#### Scenario: Removed CRM install and source surfaces

- **WHEN** runtime availability, routing, package resolution, archive, reset,
  workspace, deploy, drift, upgrade, or CLI target selection runs
- **THEN** CRM is absent from bundled runtime-installable packages and from
  schema-key/source-app registries
- **AND** `/crm`, `/api/crm`, `/apps/crm`, and installed CRM API routes are not
  current runtime surfaces
- **AND** the runtime does not discover, merge, import, reset, or clean up
  legacy CRM records, cursors, changes, operation histories, archives,
  workspaces, browser replicas, or provenance

### Requirement: CRM Delivery Scope

CRM record storage SHALL not itself schedule email delivery.

#### Scenario: No email queue execution

- **WHEN** CRM subscription, campaign, broadcast, recipient, or delivery-event
  records are stored
- **THEN** no queued email sending job is introduced
- **AND** delivery-event records remain review data rather than provider
  execution evidence
