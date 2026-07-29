# crm-app Specification

## Purpose

The CRM app defines the bundled customer relationship source app used for
contacts, audiences, campaigns, broadcasts, and generated CRM admin workflows.
It is an in-repo app package, not root runtime source data.

## Requirements

### Requirement: CRM App Package Source

The system SHALL provide CRM as a bundled in-repo app package that owns its
manifest and source schema.

#### Scenario: CRM package scaffold

- **GIVEN** the bundled CRM app package is present
- **WHEN** package source files are inspected
- **THEN** CRM source data lives under `lib/crm-app/`
- **AND** the package contains `formless.app.json`, `schema.json`, package-local
  `AGENTS.md`, `package.json`, `tsconfig.json`, and root `src/` exports
- **AND** root runtime does not keep a duplicate CRM source schema under
  `schema/apps/crm`

#### Scenario: CRM package manifest

- **GIVEN** bundled app package manifests are composed
- **WHEN** the CRM package manifest is parsed
- **THEN** it declares package app key `crm`, label `CRM`, default install id
  `crm`, bundled source schema key `crm`, and generated admin capability
- **AND** it does not declare public Site capability
- **AND** package metadata comes from the CRM package manifest rather than
  synthetic root runtime metadata

### Requirement: CRM Source App

The system SHALL provide a bundled `crm` source app schema for audience and CRM
workflows.

#### Scenario: Load CRM source schema

- **GIVEN** the runtime resolves bundled source app key `crm`
- **WHEN** the source schema is loaded
- **THEN** the app schema is available for schema key `crm`
- **AND** the schema parses through the normal app schema parser
- **AND** the app label is `CRM`

### Requirement: Flat CRM Data Model

The CRM source schema SHALL model CRM state as flat entity records with reference fields, relationships, and join records.

#### Scenario: Contact and audience records stay flat

- **WHEN** CRM contact, email address, company, audience, and subscription records are stored
- **THEN** each record stores only scalar and reference field values
- **AND** contact-company, email-address-contact, and subscription membership links are represented by reference fields
- **AND** no nested contact, company, audience, or subscription objects are persisted

#### Scenario: Campaign and broadcast records stay flat

- **WHEN** CRM campaign, campaign-message, broadcast, broadcast-recipient, and delivery-event records are stored
- **THEN** each record stores only scalar and reference field values
- **AND** campaign-message, broadcast target, broadcast-recipient, and delivery-event links are represented by reference fields
- **AND** no nested recipient or delivery event arrays are persisted on campaign or broadcast records

#### Scenario: CRM membership identity

- **WHEN** CRM email address and subscription records are created or updated
- **THEN** normalized email address is unique within the app storage identity
- **AND** the email-address and audience pair is unique within the app storage identity

#### Scenario: CRM subscription consent source

- **WHEN** CRM subscription records are created by a public subscribe operation
- **THEN** the subscription records the source kind, target app storage identity,
  canonical operation key, request host, request path, and Site block id when
  supplied
- **AND** raw visitor IP address and user-agent values are not required CRM
  subscription fields

### Requirement: Generated CRM Admin Workflows

The CRM source schema SHALL define generated screens and views for owner review and maintenance of CRM records.

#### Scenario: Review contacts and companies

- **WHEN** the CRM generated admin surface renders
- **THEN** the owner can inspect and create contacts, email addresses, and companies
- **AND** contact views expose company and email-address relationships through generated reference fields or related collections

#### Scenario: Review audiences and subscriptions

- **WHEN** the CRM generated admin surface renders
- **THEN** the owner can inspect audiences, email addresses, subscriptions, subscription status, and consent/source fields
- **AND** the owner can create audiences and owner-managed subscription records through generated create views

#### Scenario: Review campaigns and broadcasts

- **WHEN** the CRM generated admin surface renders
- **THEN** the owner can inspect campaigns, campaign messages, broadcasts, broadcast recipients, and delivery events
- **AND** broadcast review surfaces show recipient and delivery status without requiring queued email sending

### Requirement: CRM Public Subscribe Operation

CRM SHALL expose a public subscribe operation that writes CRM contact,
email-address, audience, and subscription records in the target CRM app storage
identity.

#### Scenario: CRM subscribe operation declaration

- **GIVEN** the bundled CRM source schema is parsed
- **WHEN** public operations are selected
- **THEN** `subscription.subscribe` is an anonymous Turnstile-protected command
  operation
- **AND** the operation uses the `subscribe` operation handler
- **AND** the operation input accepts a required public `email` field

#### Scenario: CRM public subscribe route

- **GIVEN** a CRM app install exists with install id `crm`
- **WHEN** a visitor posts valid public subscribe input to
  `/api/app-installs/crm/crm/public/operations/subscription/subscribe`
- **THEN** the runtime creates or reuses a CRM contact record
- **AND** creates or reuses a CRM email-address record with a normalized address
- **AND** creates or reuses a default CRM audience record
- **AND** creates or updates one CRM subscription record with status
  `subscribed`
- **AND** the public response is command-shaped and does not expose protected
  storage, challenge, or provider details

#### Scenario: CRM duplicate and resubscribe behavior

- **GIVEN** a CRM email address is already subscribed to the target audience
- **WHEN** the same visitor subscribes again
- **THEN** CRM keeps one email-address record and one subscription record for
  that email-address audience pair
- **AND** the operation returns a successful subscribed outcome

- **GIVEN** a CRM subscription is `unsubscribed`
- **WHEN** the visitor subscribes again with that email address
- **THEN** the existing CRM subscription is updated to `subscribed`
- **AND** the consent timestamp and source context are refreshed

### Requirement: CRM Subscribe Boundaries

CRM SHALL own public subscribe writes for CRM records when CRM public routes are
targeted without retiring Site-owned subscriber behavior or adding email
delivery in this slice.

#### Scenario: Site subscribe targets CRM explicitly

- **GIVEN** Site subscribe forms, Site-owned subscriber records, and an installed
  CRM app exist
- **WHEN** a Site `subscribeForm` block explicitly targets the installed CRM app
  and the visitor submits the projected form
- **THEN** the submission posts to the CRM public subscribe route and writes CRM
  contact, email-address, audience, and subscription records in the CRM app
  storage identity
- **AND** Site subscribe forms without an explicit CRM target continue to target
  the existing Site subscribe behavior
- **AND** a CRM-targeted Site subscribe form does not write Site-owned
  subscriber records

#### Scenario: No email queue execution

- **WHEN** CRM public subscribe, campaign, broadcast, recipient, or
  delivery-event records are stored
- **THEN** no queued email sending job is scheduled by this change
- **AND** delivery-event records are review data, not provider execution evidence from a new sending runtime
