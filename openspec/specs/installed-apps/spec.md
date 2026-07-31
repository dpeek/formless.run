# Installed Apps Specification

## Purpose

Installed apps define the product instance app shape: stable app install
identity, package-backed initialization, install-scoped routes, and
install-scoped storage/API behavior. They let one Formless instance host
multiple resolved package app installs without mixing app data, browser
replicas, public Site routes, or source schema-key storage.

## Requirements

### Requirement: App Install Identity

The system SHALL treat an app install id as the stable instance-local identity for one app install.

#### Scenario: Valid install id

- GIVEN a create app install request uses an install id such as `site`, `crm`,
  `docs-site`, or `project-site-2026`
- WHEN the install id is route-safe and unique within the Formless instance
- THEN the app install can be created
- AND the app install id is used in admin, API, Authority, browser replica, and broadcast identity

#### Scenario: Invalid or duplicate install id

- GIVEN an install id is empty, too short, uppercase, slash-containing, double-hyphenated, reserved, too long, or already installed
- WHEN a create app install request uses that install id
- THEN the request is rejected
- AND existing app install registry state is not mutated

### Requirement: Resolved Package Apps

The system MUST expose app packages through resolved package metadata before an
app install can be created.

#### Scenario: Package metadata

- **GIVEN** the instance app install registry is read
- **WHEN** resolved packages are listed
- **THEN** packages are returned with package app key, label, description,
  default install id, multiple-install policy, source origin, source schema key,
  package revision, source schema hash, admin route base, and optional public
  route capability
- **AND** the default runtime-installable resolver includes bundled CRM
- **AND** CRM package metadata comes from app package manifest facts, not from
  app install records, instance control-plane route records, or root schema
  path conventions
- **AND** the Program-native package keys `tasks` and `site` are absent from the
  runtime-installable resolver

#### Scenario: Active resolver is authoritative

- **GIVEN** app install creation, package fact updates, route validation, upgrade
  planning, archive planning, browser replica metadata, or install registry
  responses need package app metadata
- **WHEN** package metadata is resolved
- **THEN** the runtime uses the active package resolver for the current
  workspace, request, or deployment target
- **AND** globally bundled package metadata is used only as input to the default
  resolver when no workspace-linked packages are present
- **AND** public Site route validation fails when no active resolver is
  available rather than treating package app key `site` as an implicit
  capability fallback

#### Scenario: Runtime adapter availability

- **GIVEN** an installed route, public route, mapped host, archive import,
  generated public surface, or runtime read requires package-specific behavior
- **WHEN** runtime dispatch selects the installed app's package app key
- **THEN** the runtime first verifies the package is present in the active
  resolver and declares the required capability
- **AND** executable behavior is selected from the environment-specific package
  runtime adapter registry for that resolved package app key
- **AND** a route or operation whose package declares the capability but has no
  registered adapter is rejected with an unsupported package capability result
  before calling Site-specific fallback code
- **AND** install records, route records, and app records do not store adapter
  module paths or executable handler identities
- **AND** the bundled Site package may be the default registered public Site
  adapter, but adapter selection is still keyed by resolved package app metadata
  rather than by source schema key or install id

#### Scenario: Private package availability

- **GIVEN** a private app package such as Verifi-Labs is resolved from a
  workspace-linked package source
- **WHEN** app packages are listed for that workspace or runtime
- **THEN** the private package is installable only in that resolver scope
- **AND** the package is not made globally bundled, public, discoverable, or
  installable by unrelated workspaces

#### Scenario: Unsupported package

- **GIVEN** a create app install request names an unsupported package app key
- **WHEN** the package key is absent from the active resolver
- **THEN** the request is rejected
- **AND** no app install metadata or initial app data is committed

#### Scenario: Program-native package is not installable

- **GIVEN** package key `tasks` or `site` identifies a domain composed into the
  default Program
- **WHEN** package lists, create-install APIs, generic Program app-install
  writes, source-app registries, installed-app route admission, browser
  registries, handoff, reset, migration, archive app selection, workspace app
  selection, deploy targeting, or upgrade planning run
- **THEN** the package is unavailable as a runtime-installed package
- **AND** a workspace-linked manifest cannot reintroduce `tasks` or `site` as
  an installable package key
- **AND** package facts retained for standalone artifact or dormant metadata
  validation do not confer runtime availability

### Requirement: Installed Apps Package Boundary

The system SHALL expose reusable installed-app and app-package metadata
contracts through the Installed Apps package slice.

#### Scenario: Package owns install and package metadata contracts

- GIVEN app, client, Worker, archive, workspace, upgrade, Site runtime, or tests
  need app install id validation, app install metadata shapes, package app
  manifest parsing, active package resolver behavior, package revision
  contracts, source schema hash parsing, or deterministic source schema hash
  computation
- WHEN those contracts are imported
- THEN they come from `@dpeek/formless-installed-apps`
- AND code does not import those contracts from root runtime modules

#### Scenario: Runtime supplies installable bundled package manifests

- GIVEN the default runtime resolver needs bundled CRM package metadata
- WHEN the resolver is composed
- THEN root runtime code supplies bundled package manifests as resolver input
- AND the bundled CRM manifest can be imported from its app package through
  documented public exports
- AND the root may import the Site and Tasks manifests separately for known
  package artifacts or dormant metadata validation without supplying them to
  the runtime-installable resolver
- AND the Installed Apps package does not import bundled app schema JSON,
  root-only bundled package lists, or package-specific runtime adapters

#### Scenario: Workspace resolver has explicit defaults

- GIVEN a workspace package resolver is built from optional `formless.ts`
  `packages.links`
- WHEN bundled package metadata should be part of that resolver
- THEN the caller supplies bundled manifests explicitly
- AND the Workspace package does not import root bundled package lists as an
  implicit fallback

### Requirement: Flat App Install Metadata

The system SHALL store app installs as flat instance metadata that binds install
id, package app key, label, and status while route behavior is stored in
instance `route` records.

#### Scenario: Private public Site install routes

- **GIVEN** a private package app declares public Site route capability in the
  active package resolver
- **WHEN** an install is created from that package
- **THEN** route records target the install for an admin route under
  `/apps/<installId>`
- **AND** the admin route prefix `/apps/<installId>/` covers generated nested
  app screen paths
- **AND** public Site route records use `/sites/<installId>` and
  `/sites/<installId>/`
- **AND** the install metadata keeps the private package app key rather than
  rewriting it to `site`

#### Scenario: Non-Site install routes

- **GIVEN** a package app install without public Site route capability is created
- **WHEN** install metadata is returned
- **THEN** the app install metadata stores package app key, label, and status
- **AND** route records target the install for an admin route under
  `/apps/<installId>`
- **AND** the admin route prefix `/apps/<installId>/` covers generated nested
  app screen paths
- **AND** no public Site route record is created for that install

#### Scenario: App install registration policy metadata

- GIVEN app install metadata is parsed, created, returned, archived, restored,
  or projected for launch navigation
- WHEN the install record carries registration policy metadata
- THEN supported policies are `closed`, `email-verified`, and
  `custom-operation`
- AND omitted registration policy defaults to `closed`
- AND `closed` means browser app entry requires an existing active identity
  app-registration for the requested app install and principal or selected
  organization context
- AND `email-verified` means the account journey may self-service create an
  active identity app-registration for the requested app install after the
  principal has a verified primary email and accepted credential
- AND `custom-operation` means the account journey may create or reuse an
  active identity app-registration for the requested app install after the
  principal has a verified primary email and accepted credential, then require
  a declared app-owned registration operation before app entry
- AND when registration policy is `custom-operation`, app install metadata
  includes a display-safe `registrationOperation` canonical entity operation
  key that resolves against the installed app schema
- AND `registrationOperation` is omitted for `closed` and `email-verified`
  installs
- AND the app install metadata does not store principal ids, identity
  app-registration records, email challenge secrets, credentials, sessions,
  handoff grants, app-owned profile values, operation input values, or role
  assignments
- AND `domain-allowlist` registration policy remains unsupported until a later
  spec defines its account gate completion behavior

#### Scenario: Route-derived launch navigation

- **GIVEN** instance shell navigation needs launch links for installed apps and
  public Site surfaces
- **WHEN** app install registry metadata is projected from schema-owned
  `app-install` and `route` records
- **THEN** admin launch links are derived from enabled `route` records whose
  surface is `admin` and target profile is `app`
- **AND** public Site launch links are derived from enabled `route` records
  whose surface is `public-site` and target profile is `public-site`
- **AND** disabled route records, deleted installs, unsupported package keys,
  and missing public Site capability are omitted from launch navigation
- **AND** the link label, install id, package app key, route id, route kind,
  access policy, required role, and href are available to the browser without
  exposing installed app records, provider secrets, deployment evidence, or raw
  route provider state
- **AND** default `/apps/<installId>` and `/sites/<installId>` paths are used
  only when no schema-owned route records exist for an older install snapshot
- **AND** custom enabled route paths are preserved rather than recomputed from
  install id

### Requirement: Installed Package Revision

The system SHALL track package app revision and source schema hash for each
installed package app without changing install identity.

#### Scenario: Create install with package facts

- WHEN a resolved package app install is created
- THEN install metadata records the package app key, install id, package
  revision, and source schema hash used for initialization
- AND admin, API, Authority, browser replica, and broadcast identity
  remain derived from the stable install id

#### Scenario: Upgrade installed package facts

- WHEN a package app migration completes for an installed app
- THEN the installed app metadata records the new package revision and source
  schema hash
- AND the install id and package app key remain immutable

#### Scenario: Track schema-only package source changes

- GIVEN a resolved package app source schema changes without requiring record
  data migration
- WHEN the installed app active schema is refreshed from that source
- THEN install metadata records the new source schema hash
- AND the package revision may remain unchanged
- AND browser replica metadata, workspace state, archive planning, and upgrade
  planning use the new source schema hash as the exact schema freshness fact

### Requirement: Package Revision Drift

The system SHALL report installed package app revision drift to CLI upgrade
planning.

#### Scenario: Installed app behind resolved package

- WHEN a CLI reads app install metadata and local resolved package metadata
- THEN it can identify installed apps whose package revision or schema hash
  differs from the local package facts
- AND it can include required package app migrations in the upgrade plan

#### Scenario: Installed app schema hash behind resolved package

- GIVEN an installed app package revision equals the active resolver package
  revision
- WHEN the installed source schema hash differs from the resolver source schema
  hash
- THEN upgrade planning treats the difference as a schema refresh candidate
  rather than package revision drift
- AND the plan blocks only when current records cannot be validated against the
  resolved source schema without a package app migration

### Requirement: Package Schema Initialization

The system MUST initialize a created package app install from that resolved
package's source schema without creating package-owned records.

#### Scenario: Program-native Tasks bypasses install initialization

- **GIVEN** the default Program contains the package-owned Task entity
- **WHEN** Task storage is initialized
- **THEN** it uses the Program Authority and complete Program schema
- **AND** no Tasks install-scoped Authority, API prefix, replica, broadcast
  channel, or package initialization plan is created

#### Scenario: CRM initialization

- **GIVEN** a CRM app install is created with install id `crm`
- **WHEN** `/api/app-installs/crm/crm/bootstrap` is read
- **THEN** the bootstrap response contains the bundled CRM app package source
  schema and no records
- **AND** the install metadata keeps label and route identity scoped to `crm`

#### Scenario: Private package initialization

- **GIVEN** a private app package is available through the active package
  resolver
- **WHEN** an owner creates an app install from that package
- **THEN** the installed app storage identity is initialized from the resolved
  package source schema without package-owned records
- **AND** install metadata stores the resolved package app key, package
  revision, source schema hash, label, and install id
- **AND** the source package path, repository URL, local link, or resolver
  configuration is not stored in the `app-install` record

### Requirement: Install-Scoped Storage And API

The system MUST keep installed app storage, APIs, browser replicas, broadcast channels, and public Site reads scoped by app install identity.

#### Scenario: Installed app storage identity

- GIVEN an installed private public-Site-capable package with package key
  `docs` and install id `personal`
- WHEN the app storage identity is selected
- THEN the API prefix is `/api/app-installs/docs/personal`, the Authority name
  is `app:personal`, and browser database and broadcast channel names use
  `formless:app:personal`
- AND those names are distinct from Program storage and from other installed
  apps
- AND storage snapshots for that install use storage identity `app:personal`
- AND Authority storage does not own media object bytes or provider metadata

#### Scenario: Installed app API routes

- GIVEN an installed app API prefix `/api/app-installs/:packageAppKey/:installId`
- WHEN app data is read, synced, reset, snapshotted, restored, mutated, or acted on
- THEN operations use that install-scoped prefix
- AND public Site tree reads use the same target prefix for installed private
  public-Site-capable packages

#### Scenario: Installed app document media route

- GIVEN an installed app has document-backed text fields
- WHEN a client lists, uploads, restores, or delivers its owned documents
- THEN document media routes use
  `/api/app-installs/:packageAppKey/:installId/media/documents`
- AND the route resolves the same validated package app key and install id as
  the installed app API target
- AND media bytes and provider metadata remain outside Authority app records
- AND a document route for one install cannot browse or deliver private
  documents owned by another install

### Requirement: Schema-Owned App Install Registry

The system SHALL represent app install registry state as schema-owned instance
control-plane records.

#### Scenario: Install record creation

- GIVEN an authorized owner or admin creates a package app install
- WHEN the runtime accepts the install
- THEN it creates an `app-install` control-plane record with stable install
  identity, package app key, label, status, created time, and updated time
- AND creation is exposed as a control-plane operation with operation
  idempotency, audit, replay, and operation-native output
- AND the install-scoped app storage identity initializes from the resolved
  package source schema with no records

#### Scenario: Immutable install identity

- GIVEN an existing `app-install` record is edited
- WHEN a patch is submitted
- THEN label and supported display metadata can change
- AND install identity, package app key, and install-scoped storage identity
  cannot be patched

### Requirement: Schema-Owned App Routes

The system SHALL represent app admin and public Site routes as schema-owned
`route` records that target app install records.

#### Scenario: Private public Site install route records

- **GIVEN** an install of a private package with public Site capability and
  install id `personal` is created
- **WHEN** default route records are created
- **THEN** route records target the `personal` app install for admin route
  `/apps/personal`, admin route prefix `/apps/personal/`, public route
  `/sites/personal`, and public route prefix `/sites/personal/`
- **AND** public Site route metadata is scoped to that app install record

#### Scenario: Non-Site install route records

- **GIVEN** a package app install without public Site route capability is created
- **WHEN** default route records are created
- **THEN** route records target the app install for an admin route under
  `/apps/<installId>`
- **AND** the admin route prefix `/apps/<installId>/` covers generated nested
  app screen paths
- **AND** the admin route uses authenticated access with required role
  `app.admin` scoped through that app install target
- **AND** no public Site route record is created for that install

#### Scenario: Private public Site admin route role

- **GIVEN** a private public-Site-capable install creates its default admin and
  public route records
- **WHEN** route access is projected
- **THEN** the admin route uses authenticated access with required role
  `app.admin` scoped through that app install target
- **AND** its exact base and nested screen paths use the same install-scoped
  authorization
- **AND** the public Site routes retain anonymous access without a required app
  role

#### Scenario: Route record target

- **GIVEN** app routing, custom-domain targets, deployment graphs, archive
  export, or generated UI need to identify an app route
- **WHEN** a route target is selected
- **THEN** they reference a `route` record that uses `appInstall` to reference
  an `app-install` record
- **AND** the install id remains the storage identity for installed app data

### Requirement: App Install Control-Plane Source

App install APIs SHALL derive install state from schema-owned control-plane
records and the active package resolver.

#### Scenario: Registry read

- **GIVEN** `/api/formless/app-installs` is read
- **WHEN** control-plane install and route records are available
- **THEN** the response derives installed apps from schema-owned app install and
  route records
- **AND** package lists come from the active package resolver
- **AND** Program-native Tasks and built-in Site install metadata and routes are
  omitted from the operational registry even when dormant records remain in
  Program storage

#### Scenario: Role-filtered browser registry read

- **GIVEN** a principal-backed browser reads `/api/formless/app-installs`
- **WHEN** current instance auth resolves the principal's authority
- **THEN** active `instance.owner` or `instance.admin` authority can read the
  complete operational install registry and active package list
- **AND** a principal authorized only by app-install-scoped `app.admin` receives
  only matching install records, their eligible routes, and package facts
  needed to mount those installs
- **AND** packages, installs, and routes outside the principal's current scope
  are omitted
- **AND** an ordinary authenticated principal receives no protected installed
  app registry metadata

#### Scenario: Browser active package registry

- **GIVEN** a browser shell needs to mount installed app routes, build
  install-scoped storage identity, or attach package fact headers to installed
  app writes
- **WHEN** it reads the install registry response
- **THEN** it uses the returned package list as the active package resolver for
  that browser runtime
- **AND** workspace-linked package app keys are eligible for browser route,
  replica, broadcast, and write metadata selection when they are present in
  that active package list
- **AND** browser installed app behavior does not resolve package metadata
  through the globally bundled package resolver alone

#### Scenario: Create install request

- **GIVEN** the create app install API is called
- **WHEN** the request is valid
- **THEN** it creates schema-owned app install and route records
- **AND** unsupported packages, invalid install ids, duplicate install ids,
  invalid labels, and invalid default route records are rejected before
  installed app storage is initialized

### Requirement: Workspace App Installs From Records

The system SHALL derive workspace app install intent from schema-owned
`app-install` records rather than `formless.ts` configuration.

#### Scenario: Compose install from workspace source

- **WHEN** local dev, push, deploy, or archive restore composes installed app
  registry state from workspace source
- **THEN** each installed app comes from an `app-install` control-plane record
  and its matching app storage snapshot
- **AND** `formless.ts` does not declare app labels, package app keys, or route
  summaries as install source

#### Scenario: Workspace install requires active package

- **WHEN** workspace source contains an active `app-install` record
- **THEN** its package app key must be available in the active package resolver
  built for that workspace
- **AND** local dev, check, push, deploy, and archive restore report missing
  package metadata before mutating app storage, control-plane records, provider
  resources, or remote instances
- **AND** package source paths, repository URLs, local links, and resolver
  configuration are not copied into the `app-install` record
- **AND** workspace source that contains public Site route records is validated
  against that same active resolver before those routes are accepted

#### Scenario: Dormant Program-native install records do not become workspace app intent

- **GIVEN** `state/instance.json` contains legacy Tasks or built-in Site
  `app-install` or `route` records
- **WHEN** local dev, check, push, deploy, archive restore, or workspace app
  state selection runs
- **THEN** those records do not require or create a matching
  `state/apps/<installId>.json` snapshot
- **AND** they do not resolve an install-scoped route or Authority
- **AND** CRM and other runtime-installable private records retain their
  existing package and storage behavior

#### Scenario: Missing app storage snapshot

- **WHEN** workspace source contains an active `app-install` record without the
  app storage snapshot needed for restore or push
- **THEN** the operation reports the missing snapshot before mutation
- **AND** target app install registry state is not changed

### Requirement: Browser-Created App Install Source

The system SHALL let browser onboarding create app install source through the
same install records used by CLI and archive workflows.

#### Scenario: Browser creates install

- **WHEN** a browser owner or admin creates a package app install during local
  onboarding
- **THEN** the runtime creates `app-install` and default `route` records in the
  instance control-plane identity
- **AND** the installed app storage identity is initialized from the package
  source schema with no records
- **AND** the next workspace save writes the install records and app storage
  snapshot to reviewable workspace source

### Requirement: Blank Instances Stay App-Less

The system SHALL keep blank instances app-less until an authorized package app
install request succeeds.

#### Scenario: Blank local dev bootstrap

- **GIVEN** a local workspace runtime has no installed app metadata
- **WHEN** local dev owner session bootstrap succeeds
- **THEN** no app install metadata is created
- **AND** no route records are created
- **AND** the authenticated browser can create the first app through the normal
  package app install flow
