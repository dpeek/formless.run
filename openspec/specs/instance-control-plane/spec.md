# Instance Control Plane Specification

## Purpose

Instance control plane models Formless instance management data as runtime-owned
schema records. It keeps unified Program route intent, deployment configuration,
production identity settings, and email deployment intent in flat Authority
records. Deployment config records may include a display-safe latest deployment
observation cache while provider secrets, raw operation tokens, projected
deployment resource graphs, deployment history, and provider resource truth
stay outside those records.

## Requirements

### Requirement: Schema-Owned Instance Control Plane

The system SHALL model owner-authored instance management intent as
schema-owned control-plane records while keeping deployment execution history
outside reviewable control-plane storage snapshots.

#### Scenario: Control-plane records

- **GIVEN** the instance control-plane record module is composed into a Program
- **WHEN** its declarations are loaded
- **THEN** the package supplies flat record and presentation declarations
  without selecting a storage identity or API prefix
- **AND** it defines flat records for unified routes, deployment configs,
  instance settings, email domains, and email senders
- **AND** each deployment config stores the target id, display-safe
  `targetUrl` origin facts, provider family, provider account, worker name, and
  optional display-safe credential reference used for that deployment target
- **AND** each deployment config may store display-safe latest deployment
  observation fields such as status, observed time, desired-state hash, summary,
  error, and runner
- **AND** deployment execution history, raw operation tokens, and provider
  resource truth stay at the deployment runtime and provider boundaries

### Requirement: Instance Control Plane Package Boundary

The system SHALL expose reusable schema-owned instance control-plane contracts
through the Instance Control Plane package slice.

#### Scenario: Package owns control-plane contracts

- GIVEN Archive, Workspace, Worker runtime, Site runtime, Deploy runtime, or
  tests need entity names, entity contracts, schema modules, reviewable record
  validation, or display-safe canonicalization
- WHEN those contracts are imported
- THEN they come from `@dpeek/formless-instance-control-plane`
- AND code does not import domain contracts from root runtime modules
- AND complete Program schema key, storage identity, provenance, generic API,
  cursor, replica, archive, and workspace selection remain downstream runtime
  concerns

#### Scenario: Select instance record behavior explicitly

- GIVEN a Program composes the instance control-plane record module
- WHEN trusted runtime composition supplies instance record behavior
- THEN it imports the package's narrow record validation and reviewable
  canonicalization adapter from
  `@dpeek/formless-instance-control-plane/records` and selects it explicitly
- AND the adapter owns instance singleton, reference, route, host, URL,
  reserved-path, and route-conflict invariants for snapshot and candidate writes
- AND stable instance entity ids only scope records passed to the selected
  adapter
- AND those ids do not activate the adapter or grant Program, storage, replica,
  route, operation, media, or authorization access

#### Scenario: Package exposes composable schema modules

- GIVEN trusted TypeScript authoring needs reusable instance control-plane
  declarations
- WHEN it imports `@dpeek/formless-instance-control-plane/schema`
- THEN the package exports one record module that owns the instance
  control-plane entities, relationships, queries, and runtime control-plane
  entity policies
- AND it exports one presentation module that depends on the record module key
  and owns item views, table views, views, and screens
- AND a downstream Program composes the record module before the presentation
  module and supplies runtime ownership at the composition root
- AND the modules remain runtime-neutral when a downstream Program selects
  Authority, storage, API, cursor, snapshot, or browser replica behavior

#### Scenario: Package consumes related public contracts

- GIVEN the Instance Control Plane package needs deployment projection field
  contracts, App schema behavior, or stored-record contracts
- WHEN those dependencies are imported
- THEN they come from public package exports such as `@dpeek/formless-deploy`,
  `@dpeek/formless-schema`, and `@dpeek/formless-storage`
- AND the package does not redefine compatible local shapes for those
  contracts

#### Scenario: Runtime owns control-plane execution

- GIVEN route operations, deployment-config operations,
  Authority writes, owner authorization, deployment projection execution,
  provider execution, or runtime observation persistence is needed
- WHEN those behaviors are implemented
- THEN Worker runtime, Site runtime, Deploy runtime, Gateway runtime adapters,
  or provider adapters own the execution
- AND the Instance Control Plane package supplies schema contracts, reviewable
  validation, pure helpers, and package-local deterministic tests

### Requirement: Control-Plane Module Schema

The system SHALL keep instance control-plane declarations deterministic while
the downstream Program owns complete runtime provenance.

#### Scenario: Resolve control-plane declarations

- GIVEN a runtime loads the instance control-plane schema declarations
- WHEN the declarations are parsed for package validation or downstream
  Program composition
- THEN it uses the normal App schema parser and App schema source hash rules
- AND entity, field, relationship, query, read model, view, screen,
  operation, and runtime metadata changes affect the composed Program schema
- AND the schema authoring format is not observable through records, workspace
  state, archives, sync, or generated UI behavior

#### Scenario: Refresh stored Program schema

- GIVEN Program storage already contains committed instance and identity records
- WHEN the complete resolved Program source hash differs from active `program`
  provenance
- AND all active Program records validate against the resolved schema without
  record materialization
- THEN the runtime refreshes the active Program schema and schema timestamp
  without materializing or replacing records
- AND the complete Program hash remains the active schema provenance
- AND incompatible control-plane schema changes require an explicit migration,
  backfill, or reset path before they can become active

### Requirement: Instance Settings

The system SHALL store active production identity and email defaults on one
singleton instance settings record.

#### Scenario: Settings singleton shape

- **GIVEN** the instance control-plane schema is loaded
- **WHEN** the `instance-settings` entity is inspected
- **THEN** at most one active settings record exists for the instance
- **AND** it stores camelCase fields for canonical origin, primary route
  reference, auth route reference or auth origin facts, preferred admin route
  reference, default email domain reference, default contact sender reference,
  default auth sender reference, contact notification recipient, and production
  identity status
- **AND** those fields are active policy selections, not provider resource
  truth, raw DNS state, provider credentials, or runtime secrets

#### Scenario: Bootstrap without production identity

- **GIVEN** an instance has no primary route selected
- **WHEN** deployment intent is projected
- **THEN** workers.dev deployment may remain valid
- **AND** production identity features that require a canonical origin report
  unconfigured state instead of inferring identity from the workers.dev host

#### Scenario: Settings reference domain records

- **GIVEN** primary route, email domain, or email sender records exist
- **WHEN** the settings singleton selects defaults
- **THEN** it stores stable record references to the selected records
- **AND** DNS authentication, Email Sending onboarding state, provider status,
  and cleanup lifecycle remain on the referenced records or provider observation
  boundary

#### Scenario: Preferred admin route selection

- **GIVEN** enabled exact-host instance admin route records exist
- **WHEN** the settings singleton selects `adminRoute`
- **THEN** `adminRoute` references an enabled exact-host `route` whose
  `targetProfile` is `instance` and whose surface is the admin surface
- **AND** the preferred admin origin is derived from that route's `matchHost`
- **AND** changing the preferred admin route does not change the configured auth
  origin, WebAuthn relying-party id, central auth session origin, deployment
  target URL, or provider resource truth

#### Scenario: Preferred admin origin fallback

- **GIVEN** no settings `adminRoute` is selected
- **WHEN** a browser-visible owner or admin link needs a preferred admin origin
- **THEN** the system may use `primaryRoute` only when it references an enabled
  exact-host instance admin route
- **AND** when exactly one enabled exact-host instance admin route exists, the
  system may use that route as the preferred admin origin
- **AND** when multiple enabled exact-host instance admin routes exist without a
  selected preferred route, the preferred admin origin is ambiguous instead of
  falling back to the deployment target URL
- **AND** the workers.dev deployment target URL is a browser admin fallback only
  when no enabled custom admin route exists

### Requirement: Email Domain And Sender Records

The system SHALL represent email deployment intent as flat control-plane
records separate from HTTP route behavior.

#### Scenario: Email domain record shape

- **GIVEN** the instance control-plane schema is loaded
- **WHEN** the `email-domain` entity is inspected
- **THEN** each record stores camelCase fields for enabled state, provider
  family, domain, optional primary route reference, optional deployment config
  reference, display-safe DNS or onboarding status, and latest display-safe
  error
- **AND** email domain records remain flat schema records
- **AND** created and updated timestamps come from record system fields rather
  than email-domain value fields
- **AND** provider credentials, Cloudflare OAuth tokens, Alchemy state, raw DNS
  provider truth, and runtime secrets are not stored on the record

#### Scenario: Email sender record shape

- **GIVEN** the instance control-plane schema is loaded
- **WHEN** the `email-sender` entity is inspected
- **THEN** each record stores camelCase fields for enabled state, address,
  display name, purpose, and email domain reference
- **AND** supported sender purposes include contact notification, system, and
  auth messages
- **AND** the sender address host must belong to the referenced email domain

#### Scenario: Route remains HTTP intent

- **GIVEN** an email domain uses a host under the same DNS zone as a public
  route
- **WHEN** the control-plane records are validated or projected
- **THEN** the email domain may reference the primary route for default
  derivation
- **AND** the route record still represents only HTTP mount or redirect
  behavior
- **AND** sender allowlists, SPF, DKIM, DMARC, and Email Sending state are not
  stored as route fields

### Requirement: Deployment Projection Boundary

The system SHALL build deployment runtime desired-state projections from
schema-owned control-plane intent records.

#### Scenario: Project desired state

- **GIVEN** desired deployment state is read for a supported target
- **WHEN** schema-owned control-plane records are read for that target
- **THEN** the resource graph is projected from the current control-plane
  records
- **AND** enabled `route` records provide app mount, custom-domain, DNS, and
  Worker-handled redirect source-host resources
- **AND** enabled `email-domain` and `email-sender` records provide Email
  Sending domain onboarding and Worker email binding resources
- **AND** the singleton `instance-settings` record provides active primary
  route and email default selections when those defaults are configured
- **AND** `deployment-config` records provide the target URL, provider account,
  worker name, and credential reference needed to project provider-facing
  resources
- **AND** no projected `DeploymentResourceGraph` resource is stored as
  schema-owned source intent
- **AND** the desired-state hash is computed from canonical projected content
- **AND** latest deployment observation fields do not affect the desired-state
  hash

#### Scenario: Projection omits operational secrets

- **GIVEN** control-plane records are projected into desired state
- **WHEN** the projection is returned to clients or deployers
- **THEN** provider API tokens, Alchemy passwords, Alchemy state tokens, raw
  lease tokens, and runtime secrets are omitted
- **AND** display-safe secret references may be included when needed

### Requirement: Deployment Observation Boundary

The system SHALL keep provider execution and deployment history outside
reviewable source while storing only the latest display-safe deployment
observation cache on `deployment-config` records.

#### Scenario: Display-safe latest observation

- **GIVEN** a CLI deployer, local workspace gateway, or explicit refresh
  observes deployment state
- **WHEN** the observation is persisted
- **THEN** the observation patches the matching `deployment-config` record with
  display-safe latest state such as status, observed time, desired-state hash,
  summary, error, and runner
- **AND** the observation does not store provider credentials, raw provider
  state, raw operation tokens, or full execution logs
- **AND** previous observations are replaced rather than appended as
  schema-owned history records
- **AND** provider reality remains owned by the provider and tracked Alchemy
  state

### Requirement: Deploy Vertical Slice

The system SHALL provide deployment schema contracts and projection helpers from
a deploy package slice.

#### Scenario: Deploy package owns contracts

- GIVEN runtime, UI, CLI, or tests need deployment schema or projection
  contracts
- WHEN they consume deploy capability behavior
- THEN they import public declarations or helpers from `lib/deploy`
- AND they do not redefine compatible deployment record shapes locally

#### Scenario: Shared route projection module

- GIVEN runtime, CLI, workspace, or tests need route-derived deployment
  projection from control-plane records
- WHEN route and deployment-config records are projected for a target
- THEN the records are adapted into public Deploy package projection input
- AND provider resource graphs, route target projections, source fingerprints,
  stable logical ids, and canonical hash inputs derive from the Deploy package
  projection helper
- AND runtime code does not maintain a separate route-to-provider-resource
  projection implementation

#### Scenario: Shared desired-state and observation module

- GIVEN runtime, CLI, workspace, gateway, UI, or tests need deployment
  desired-state version, latest status, or observation patch behavior
- WHEN control-plane route and deployment-config records are interpreted for a
  supported deployment target
- THEN desired-state response refs, canonical graph hashes, display summaries,
  latest status interpretation, and display-safe observation patch payloads
  derive from Deploy package helpers
- AND Worker runtime adapts schema-owned control-plane records into Deploy
  package inputs instead of redefining compatible deployment state, status, or
  observation payload shapes locally
- AND provider execution, credential resolution, raw provider state, Alchemy
  state, and runtime secrets remain outside the Deploy package boundary

### Requirement: Route Records

The system SHALL represent all desired route behavior as `route` control-plane
records.

#### Scenario: Route record shape

- **GIVEN** the instance control-plane schema is loaded
- **WHEN** the `route` entity is inspected
- **THEN** each route record can store camelCase fields for enabled state,
  optional match host, match path, optional match prefix, kind, optional target
  profile, optional surface, optional access policy, optional deployment config
  reference, redirect target fields, and redirect policy fields
- **AND** route records remain flat schema records
- **AND** created and updated timestamps come from record system fields rather
  than route value fields

#### Scenario: Mount route

- **GIVEN** an owner or admin creates a mount route
- **WHEN** the route is accepted
- **THEN** `kind` is `mount`
- **AND** the target profile is `instance` or `public-site`
- **AND** the route records the selected Program surface

#### Scenario: Program public Site mount

- **GIVEN** an owner or admin creates a public Site mount route
- **WHEN** the route is validated
- **THEN** target profile is `public-site` and surface is `public-site`
- **AND** the route targets Program storage

#### Scenario: Mount route access

- **GIVEN** an owner or admin creates a mount route
- **WHEN** the route includes access policy
- **THEN** `access` is `anonymous`, `authenticated`, `management`, or `owner`
- **AND** `anonymous` means the route can be read without a principal-backed
  browser session
- **AND** `authenticated` means browser reads require a valid owner session or
  host-local session for an active principal on the matched route target
- **AND** `management` means browser reads require an active principal with
  protected owner authority or the schema-defined Program `administrator` role
- **AND** `owner` means browser reads require an owner session or host-local
  session for the matched owner route target whose principal has active
  `instance.owner` authority
- **AND** route records do not carry app-scoped `requiredRole` authorization
- **AND** operational management API reads and writes require a session whose
  principal has protected owner authority or the schema-defined Program
  `administrator` role, a matching host-local session with that current
  authority, or admin bearer authorization
- **AND** owner-only recovery, owner role management, auth origin policy, and
  admin bearer recovery remain outside operational management authorization
- **AND** omitted access defaults to `management` for instance management
  mounts
- **AND** omitted access defaults to `anonymous` for public Site mounts

#### Scenario: Mapped instance route host session authorizes Program operations

- **GIVEN** an enabled exact-host `route` mounts the instance profile with
  access `management` or `owner`
- **AND** the browser has a valid host-local session for that route target and
  instance
- **WHEN** the browser reads or writes protected operational instance
  Program operations through the mapped host
- **THEN** the Program API accepts the host-local session as operational
  management authorization only when the current principal has active
  protected owner authority or the schema-defined `administrator` role for the
  requested path
- **AND** owner-only Program paths still recheck active `instance.owner`
  authority before privileged reads or writes
- **AND** host-local sessions minted for another route, profile, host, or
  instance do
  not authorize Program operations

#### Scenario: Program administrator writes operational control-plane intent

- **GIVEN** a browser session or matching mapped-instance host-local session
  resolves to an active principal with the schema-defined Program
  `administrator` role
- **WHEN** the browser writes operational instance intent such as route,
  deployment config, email domain, or email sender records
- **THEN** the Program API authorizes the write without requiring admin
  bearer authorization or `instance.owner` authority
- **AND** the write still commits through normal Program operation
  handling, record validation, immutable field checks, operation invocation
  recording, and storage provenance rules
- **AND** the control-plane operation writes only the named instance intent
  while provider secrets, runtime history, auth session material, and identity
  records stay at their owning boundaries

#### Scenario: Program administrator cannot write owner-only control-plane policy

- **GIVEN** a browser session or matching mapped-instance host-local session is
  authorized only by the schema-defined Program `administrator` role
- **WHEN** the browser attempts an owner-only control-plane write
- **THEN** the write is rejected unless the principal also has active
  `instance.owner` authority or the request uses valid admin bearer
  authorization where that path explicitly allows it
- **AND** owner-only control-plane policy includes auth origin selection,
  relying-party policy, owner-session signing policy, owner recovery material,
  admin bearer recovery material, and changes that would remove the last active
  owner

#### Scenario: Non-admin principal cannot write operational control-plane intent

- **GIVEN** a browser session or matching mapped-instance host-local session
  resolves to an active principal without the schema-defined Program
  `administrator` role or protected owner authority
- **WHEN** the browser reads or writes protected operational control-plane
  intent
- **THEN** the control-plane API rejects the request as unauthorized management
  access
- **AND** stale signed session role facts do not authorize the request after
  the current principal is disabled or its role assignments change

#### Scenario: Redirect route

- **GIVEN** an owner or admin creates a redirect route
- **WHEN** the route is accepted
- **THEN** `kind` is `redirect`
- **AND** the route stores the source match, target host or URL, status code,
  preservePath policy, and preserveQueryString policy

#### Scenario: Desired route write

- **GIVEN** an owner or admin writes route intent
- **WHEN** the write commits
- **THEN** the write stores desired route state only
- **AND** the write does not accept created or updated timestamp input
- **AND** Authority materializes route lifecycle timestamps as record system
  metadata
- **AND** no Program domain data, provider resource, runtime secret, provider
  evidence, cleanup history, deployment attempt, or drift report is mutated by
  the route write itself

#### Scenario: Control-plane lifecycle metadata

- **GIVEN** `route`, `deployment-config`, `instance-settings`, `email-domain`,
  or `email-sender` records are created,
  updated, synced, snapshotted, restored, or projected
- **WHEN** control-plane lifecycle timestamps are needed
- **THEN** `createdAt` and `updatedAt` are read from record system fields
- **AND** create and update operation inputs for those entities do not include
  lifecycle timestamp fields
- **AND** generated management tables and forms omit lifecycle timestamps unless
  a display-only surface explicitly includes the record system fields

### Requirement: Deployment Config Records

The system SHALL represent deploy target and provider selection as one
`deployment-config` control-plane record.

#### Scenario: Select deployment config record identity

- GIVEN the default Program composes the instance control-plane module
- WHEN a deployment-config create operation needs its stable target record id
- THEN the trusted shared runtime composition explicitly supplies the instance
  create-id contribution
- AND generic Program Authority does not recognize the deployment-config entity
  or derive record identity from package or entity discovery

#### Scenario: Deployment config shape

- **GIVEN** the instance control-plane schema is loaded
- **WHEN** the `deployment-config` entity is inspected
- **THEN** each record stores camelCase fields for target id, display label,
  enabled state, display-safe target URL, provider family,
  provider account id, worker name, optional display-safe credential reference,
  and optional latest deployment observation fields
- **AND** created and updated timestamps come from record system fields rather
  than deployment-config value fields
- **AND** the target id and provider family are immutable after creation
- **AND** a Cloudflare credential reference identifies a Formless-owned local
  OAuth credential without embedding OAuth access tokens, OAuth refresh tokens,
  API tokens, or Alchemy profile credentials
- **AND** provider API tokens, Cloudflare OAuth access tokens, Cloudflare OAuth
  refresh tokens, Alchemy passwords, Alchemy state tokens, raw lease tokens,
  and runtime secrets are not stored on the record
- **AND** latest deployment observation fields are runtime-observed cache fields
  rather than deploy intent fields

#### Scenario: Credential setup writes display-safe target facts

- **GIVEN** a local workspace gateway or CLI validates a Formless-owned
  Cloudflare OAuth credential
- **WHEN** deployment setup is written to control-plane records
- **THEN** the `deployment-config` record may store display-safe target id,
  target URL, provider family, account id, worker name, and credential
  reference fields
- **AND** CLI credential setup for `formless push` writes the selected
  deployment config for the requested target alias rather than an unrelated
  enabled deployment config
- **AND** CLI credential setup may replace an Alchemy profile credential
  reference with a `formless-cloudflare-oauth:<id>` credential reference after
  validating the Formless-owned OAuth credential
- **AND** OAuth access tokens, OAuth refresh tokens, token expiry, granted
  scopes, Alchemy passwords, and Alchemy state tokens remain only in ignored
  local secret state
- **AND** subsequent push, destroy, cleanup, or refresh operations resolve and
  refresh the referenced credential outside schema-owned records

#### Scenario: Route deployment selection

- **GIVEN** a route needs provider-managed DNS or custom-domain resources
- **WHEN** the route omits an explicit deployment config reference
- **THEN** projection uses the enabled primary instance deployment config
- **AND** a route may reference a specific deployment config only when the
  instance has multiple enabled deployment configs
- **AND** redirect routes that expose source hosts through Worker custom
  domains use the same deployment config selection

#### Scenario: Deployment config write

- **GIVEN** an owner, admin, local workspace gateway, or CLI writes deployment
  setup
- **WHEN** the write commits
- **THEN** the write stores deployment intent as a `deployment-config` record
- **AND** no provider resource, deployment attempt, evidence summary, drift
  report, cleanup history, or projected desired resource row is written by the
  deployment config write itself

#### Scenario: Deployment observation cache write

- **GIVEN** a local workspace gateway, CLI deploy, or explicit refresh observes
  deployment state for a deployment config
- **WHEN** it writes the observation
- **THEN** it patches only the deployment config's runtime-observed cache fields
- **AND** source intent fields such as provider family, account id, worker name,
  target URL, route intent, and credential reference remain unchanged unless a
  separate authorized intent write is submitted

### Requirement: Workspace Canonical Program Source

The system SHALL save instance control-plane and reviewable identity records
through the one Program workspace state boundary.

#### Scenario: Save Program records to workspace state

- **WHEN** local Program Authority state is saved to workspace source
- **THEN** `route`, `deployment-config`, `instance-settings`, `email-domain`,
  and `email-sender` records are written
  to the schema-owned `state/instance.json` workspace state file
- **AND** reviewable identity records from the same Program Authority are written
  to that file rather than a separate identity state file
- **AND** enabled `deployment-config` records include the display-safe
  deployed HTTP origin in `targetUrl`
- **AND** workspace and archive boundaries identify those records with
  qualified entity names such as `instance:route` and `instance:email-domain`
- **AND** `state/instance.json` declares a workspace state kind, version,
  storage identity `instance:control-plane`, schema key
  `formless-program`, Program schema provenance, source cursor, and
  records
- **AND** Program schema provenance uses `schemaProvenance.kind` `program` and
  the complete Program `sourceSchemaHash`
- **AND** `state/instance.json` does not embed the full Program App
  schema object
- **AND** `formless.ts` does not duplicate those records as app, route,
  domain, email, or deploy intent
- **AND** runtime-observed deployment cache fields on `deployment-config`
  records are omitted from reviewable workspace storage state

#### Scenario: Restore Program records from workspace state

- **WHEN** local dev, push, or deploy composes runtime state from workspace
  source
- **THEN** the Program storage snapshot is restored through the
  `instance:control-plane` Authority storage identity
- **AND** Authority validation rejects record-id collisions, invalid references,
  immutable field changes, route conflicts, identity constraint conflicts,
  email sender/domain conflicts, secret values, and unsupported Program
  entities before behavior changes
- **AND** workspace state containing runtime-observed deployment cache fields is
  rejected or stripped before restore
- **AND** restore admits only current Program route records

### Requirement: Browser-Owned Instance Intent

The system SHALL allow browser owner/admin flows to author instance intent by
writing schema-owned control-plane records.

#### Scenario: Browser edits route intent

- **WHEN** a browser owner or admin edits route configuration
- **THEN** the write invokes a control-plane operation and commits `route`
  records through Authority validation
- **AND** saved workspace source is later generated from those records rather
  than from manifest declarations

#### Scenario: Browser edits deploy and domain intent

- **WHEN** a browser owner or admin edits domain or deployment configuration
- **THEN** the write commits unified `route`, `deployment-config`,
  `instance-settings`, `email-domain`, or `email-sender` records through
  Authority validation
- **AND** provider credentials, raw provider state, and runtime secrets remain
  outside control-plane records
