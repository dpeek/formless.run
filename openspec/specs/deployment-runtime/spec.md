# Deployment Runtime Specification

## Purpose

Deployment runtime projects Formless deployment intent for supported instance
targets and derives display status from schema-owned deployment config
observation cache. Push-owned deployers declare tracked Alchemy desired state,
Alchemy owns provider reconciliation and provider resource state, and
`deployment-config` records store only the latest display-safe observation.
Email sending domain onboarding and Worker email bindings follow the same
projected provider-resource boundary as HTTP route resources. Cloudflare Email
Sending DNS records are provider-owned after Email Sending onboarding and are
not projected as Formless-managed DNS resources.

## Requirements

### Requirement: Normal Provider Mutation Path

The system SHALL use projected deployment resource graphs as the normal provider
mutation input without storing deployment attempts in runtime SQL tables.

#### Scenario: Apply projected deployment resources

- **WHEN** a CLI, browser workspace gateway, CI job, or trusted deploy node
  applies deployment intent
- **THEN** it reads the current desired-state projection for the target
- **AND** provider mutation is performed by declaring the desired resource graph
  in tracked Alchemy state or an equivalent provider reconciler
- **AND** successful or failed results may patch the target deployment config's
  latest display-safe observation cache

#### Scenario: Route-derived resources share projected deploy graph

- **WHEN** route records project DNS or custom-domain resources
- **THEN** those resources are applied through the same projected resource graph
  as Worker and R2 resources
- **AND** redirect routes project Worker custom-domain resources for their
  source hosts so the deployed Worker can return redirect responses
- **AND** latest deployment status remains a cache on the target
  `deployment-config` record, not separate attempt, lease, evidence, or
  provider-difference report records

#### Scenario: Email resources share projected deploy graph

- **WHEN** email domain and sender records project Cloudflare Email Service
  resources
- **THEN** those resources are applied through the same projected resource graph
  as Worker, R2, Turnstile, DNS, and route-derived resources
- **AND** Email Sending domain and Worker `send_email` binding resources use
  stable logical ids
- **AND** latest deployment status remains a cache on the target
  `deployment-config` record, not separate email deployment attempt or provider
  evidence records

#### Scenario: Removed route resources reconcile through push

- **GIVEN** a previous successful push tracked route-derived DNS or
  custom-domain resources in Alchemy state
- **WHEN** the next desired-state projection omits those resources because a
  route was disabled or deleted
- **THEN** the deployer declares the new desired resource graph in the same
  tracked Alchemy app, stage, and state scope
- **AND** Alchemy destroys the omitted tracked provider resources during push
  provider reconciliation
- **AND** deployment observation records only display-safe latest status and
  summary fields on the deployment config

#### Scenario: Repair cleanup can remain explicit

- **GIVEN** provider evidence exists for a resource that cannot be reconciled
  from tracked Alchemy state because state is missing, stale, manually changed,
  or out-of-band repair is required
- **WHEN** an authorized cleanup workflow selects that evidence
- **THEN** cleanup may mutate the selected provider resource or evidence outside
  normal push provider reconciliation
- **AND** cleanup does not change control-plane deployment intent unless a
  separate authorized intent write is submitted

### Requirement: Read-Only Desired Deployment State

The system SHALL expose a read-only desired deployment state projection for a
supported deployment target.

#### Scenario: Read latest desired state

- **WHEN** a client reads desired deployment state for a target
- **THEN** the response includes a stable hash, schema version, target id,
  resource graph, and display summary
- **AND** instance targets project the resource graph from schema-owned
  control-plane records and higher-level runtime intent for that target
- **AND** host mount routes project custom-domain and DNS resources
- **AND** redirect routes project Worker custom-domain resources for redirect
  source hosts
- **AND** enabled email domains and senders project Email Sending domain and
  Worker email binding resources
- **AND** redirect source-host route-derived resources are limited to Worker
  custom-domain resources
- **AND** if control-plane route records are absent, no route-derived provider
  resources are included
- **AND** raw desired resource rows are not schema-owned control-plane source
  records
- **AND** the response does not include provider credentials, Alchemy
  passwords, state tokens, raw lease tokens, or runtime secrets
- **AND** the response is not cached

#### Scenario: Desired state hash stability

- **WHEN** user intent has not changed
- **THEN** repeated desired-state reads for the same target produce the same
  hash
- **AND** route-derived and email-derived resource graph hashes are based on the
  Deploy package control-plane projection output
- **AND** timestamps, attempt history, evidence summaries, cleanup history,
  deployment config observation cache fields, and status display
  data do not change the desired-state hash

#### Scenario: Deploy package owns desired-state versioning

- WHEN deployment runtime, CLI, workspace gateway, or tests need desired-state
  version facts
- THEN they use Deploy package helpers for canonical resource graph hashing,
  schema version refs, display summaries, target refs, and source revision
  normalization
- AND Worker runtime adapts control-plane records into Deploy package inputs
  instead of owning a separate desired-state version implementation
- AND provider credentials, runtime secrets, Alchemy passwords, and state tokens
  remain outside Deploy package version output

### Requirement: Runtime Metadata

The deployment runtime SHALL expose display-safe runtime metadata for sync
diagnostics without making push an upgrade-planning workflow.

#### Scenario: Metadata includes runtime facts

- WHEN a client reads deploy metadata for a Formless instance
- THEN the response includes package version, runtime protocol version, storage
  migration set identity, and current storage migration facts
- AND Program provenance is read from the complete Program artifact contract
- AND an optional browser or Worker bundle digest is deployment build evidence
  only and does not become Program schema provenance, storage identity,
  authorization identity, workspace state, or archive data
- AND the response does not expose provider credentials, admin tokens, Alchemy
  state, raw lease tokens, or runtime secrets
- AND the response is not cached

#### Scenario: Push does not gate on upgrade planning

- WHEN `formless push` deploys runtime code for an instance
- THEN it may read deployed metadata for diagnostics and health checks
- AND it does not build upgrade plans, require migration policy, apply data
  migrations, or block synchronization on migration evidence

#### Scenario: Desired state remains provider intent

- WHEN a client reads deployment desired state
- THEN desired-state hash and revision still describe deployment-facing resource
  intent
- AND runtime package version, migration set, and Program schema provenance do not
  change the desired-state hash unless they change resource intent

### Requirement: Deployment Resource Graph

The system SHALL represent deployment-facing intent as a resource graph with
stable logical ids and provider resource declarations.

#### Scenario: Graph resource identity

- **WHEN** desired state contains provider-managed resources
- **THEN** each graph resource has a stable logical id, kind, target id,
  provider family, inputs, and dependency metadata
- **AND** logical ids are deterministic for the same enabled route, email
  domain, email sender, and provider deployment config intent

### Requirement: Cloudflare Email Service Deployment

The deployment runtime SHALL project Cloudflare Email Service resources without
storing provider truth or provider secrets in control-plane records.

#### Scenario: Email Sending resources

- GIVEN a Cloudflare email domain is enabled for outbound sending
- WHEN desired deployment state is read for the selected deployment target
- THEN the resource graph includes provider resources for the Email Sending
  domain or subdomain and Worker send-email binding
- AND the send-email binding is constrained to the enabled configured sender
  addresses selected for that domain
- AND the Email Sending domain resource relies on Cloudflare Email Service to
  create and own its required bounce, SPF, DKIM, and DMARC DNS records
- AND the Worker runtime receives only the binding and display-safe
  configuration needed to send through the platform email primitive

#### Scenario: Email delivery queue resources

- GIVEN a Formless instance target is deployed
- WHEN the deployer declares base runtime resources for the Worker
- THEN it declares a Cloudflare Queue named
  `<instance-worker-name>-email-delivery`
- AND it declares a dead-letter queue named
  `<instance-worker-name>-email-delivery-dlq`
- AND the Worker receives the producer binding
  `FORMLESS_EMAIL_DELIVERY_QUEUE`
- AND the same Worker is registered as the queue consumer with DLQ-backed retry
  handling
- AND email delivery queue resources are base runtime resources rather than
  schema-owned control-plane records or desired-state graph resources derived
  from email domain or sender intent

#### Scenario: Dedicated sending subdomain by default

- GIVEN an instance selects a primary route host for production identity
- WHEN email defaults are initialized for deployment
- THEN the deployment projection prefers a dedicated sending subdomain under
  the same zone instead of apex sending
- AND apex email DNS policy is changed only by Cloudflare Email Service after
  the owner explicitly selects apex Email Sending onboarding

#### Scenario: Provider-owned Email Sending DNS

- GIVEN the deployer provisions or adopts a Cloudflare Email Sending domain
- WHEN Cloudflare creates or reports the required Email Sending DNS records
- THEN those records remain owned by Cloudflare Email Service rather than
  Formless Alchemy DNS resources
- AND the deployer does not preflight, update, delete, or adopt those DNS
  records through generic Cloudflare DNS record reconciliation

#### Scenario: Graph is not provider truth

- **WHEN** the resource graph is stored or returned
- **THEN** it represents desired resources for planning
- **AND** it does not claim to be the current provider resource state

### Requirement: Turnstile Challenge Deployment

The deployment runtime SHALL provision per-instance Turnstile challenge
configuration for deployed public action forms that require Turnstile.

#### Scenario: Declare Turnstile widget resource

- WHEN a deployer applies a Formless instance target whose public actions use
  Turnstile challenges
- THEN it declares a stable Cloudflare Turnstile widget resource in tracked
  Alchemy state with the Worker, Durable Object namespace, R2 bucket, and
  route-derived provider resources
- AND the widget inputs include a deterministic name, widget mode, and the
  deployed workers.dev host plus enabled public Site custom-domain hosts
- AND changed or removed widget host inputs reconcile through the next push
  provider reconciliation without storing Turnstile provider state in app records

#### Scenario: Bind Turnstile runtime configuration

- GIVEN the Turnstile widget resource returns a public site key and server-side
  verification secret
- WHEN the Worker resource is declared
- THEN the deployer binds the site key to `FORMLESS_TURNSTILE_SITE_KEY`
- AND binds the verification secret to `FORMLESS_TURNSTILE_SECRET_KEY` as a
  Worker secret
- AND deployment desired state, observation cache, status, metadata, and public
  artifacts do not include raw Turnstile secret values

### Requirement: Deployment Observation Cache

The system SHALL store latest display-safe deployment observation on the target
`deployment-config` record instead of runtime attempt, lease, evidence, or
provider-difference tables.

#### Scenario: Successful observation

- WHEN a deployer successfully applies deployment intent
- THEN it may patch the target deployment config with latest status, observed
  time, desired-state hash, summary, and runner
- AND Alchemy remains the owner of canonical provider resource state
- AND full provider current state is not stored in the observation cache

#### Scenario: Failed observation

- WHEN a deployer fails while applying deployment intent
- THEN it may patch the target deployment config with failed status,
  desired-state hash, observed time, display-safe error, and runner
- AND provider credentials, raw provider state, raw operation tokens, and full
  execution logs are not stored

#### Scenario: Observation replacement

- WHEN a newer push provider reconciliation or explicit refresh writes an
  observation
- THEN it replaces the previous observation fields on the deployment config
- AND the runtime does not append deployment history records

#### Scenario: Deploy package owns observation patch payloads

- WHEN a CLI deployer, workspace gateway, or trusted deploy node records latest
  deployment observation
- THEN it composes display-safe observation patch payloads through Deploy
  package helpers
- AND the payload references the desired-state version or hash being observed
- AND the payload does not include provider credentials, raw provider state, raw
  operation tokens, Alchemy state tokens, full execution logs, or runtime
  secrets

### Requirement: Deployment Status

The system SHALL derive display-friendly deployment status from the current
desired-state projection and the target deployment config's latest observation
cache.

#### Scenario: Deploy package owns latest status derivation

- WHEN runtime, CLI, workspace gateway, browser UI, or tests need latest
  deployment status
- THEN they use Deploy package helpers to interpret the current desired-state
  version together with the target deployment config observation cache
- AND Worker runtime supplies the current desired state and target deployment
  config data instead of maintaining a separate status derivation
- AND provider mutation, credential resolution, Alchemy state inspection, and
  operation execution stay outside the status helper

#### Scenario: No target state

- WHEN no enabled deployment config exists for a target
- THEN latest deployment status reports `no-target`

#### Scenario: Pending changes

- WHEN the current desired-state hash differs from the deployment config's last
  observed successful hash
- THEN latest deployment status reports desired changes pending

#### Scenario: Deployed current version

- WHEN the deployment config's last observed successful hash matches the current
  desired-state hash
- THEN latest deployment status reports the target deployed
- AND the deployed status includes the latest observed time and runner when
  available

#### Scenario: Failed current version

- WHEN the deployment config's latest failed observation hash matches the
  current desired-state hash
- THEN latest deployment status reports that the current desired state failed
- AND the last error details are available for display

#### Scenario: Stale failure

- WHEN the deployment config's latest failed observation hash differs from the
  current desired-state hash
- THEN latest deployment status reports desired changes pending and may show the
  stale failure separately

#### Scenario: Local active operation

- WHEN a local workspace gateway operation is actively deploying a target
- THEN browser UI may show in-progress state from gateway operation status
- AND the deployment config observation cache is updated only when push or
  refresh writes an observation

### Requirement: Deployer Protocol Boundary

The system SHALL keep deployer execution outside the runtime while exposing
read-only deployment projection and display status.

#### Scenario: External deployer apply

- **WHEN** a CLI, browser workspace gateway, CI job, or trusted deploy node
  applies desired state
- **THEN** it fetches the desired-state projection, resolves provider context
  and Formless-owned Cloudflare credential secrets outside the runtime
  desired-state response, declares the desired graph in tracked Alchemy state
  or another provider reconciler, and may patch the latest deployment
  observation cache
- **AND** when the provider reconciler is Alchemy, the deployer refreshes the
  Formless-owned Cloudflare OAuth access token before provider mutation and
  passes the fresh access token to Alchemy as an external bearer token through
  `apiToken` or `CLOUDFLARE_API_TOKEN`
- **AND** when the selected deployment config uses a
  `formless-cloudflare-oauth:<id>` credential reference, the deployer resolves
  and refreshes that credential before considering manual Cloudflare API token
  environment fallbacks
- **AND** Formless-owned Cloudflare OAuth credentials are not written to
  Alchemy OAuth profiles for refresh
- **AND** Worker, R2, DNS, custom-domain, and other projected provider
  resources use the same deployer protocol boundary
- **AND** when the deployer has a refreshed Cloudflare OAuth access token,
  Worker upload, R2, Turnstile, DNS, custom-domain, and Cloudflare state-store
  adapters receive it through explicit provider options rather than resolving an
  Alchemy OAuth profile

#### Scenario: Shared deployment client contracts

- WHEN a CLI, workspace gateway, browser client, or trusted deploy node reads
  desired state, reads status, or patches observation cache fields
- THEN route constants, response refs, desired-state version refs, and
  observation patch request payload contracts come from the Deploy package
  client boundary
- AND callers may provide transport, auth, storage, and gateway-specific
  adapters outside that package boundary

#### Scenario: Route deletion is not provider mutation

- **WHEN** route intent is disabled or deleted
- **THEN** the route write changes desired deployment state only
- **AND** provider resources are created, updated, or deleted only when a
  deployer reconciles the projected desired state

#### Scenario: Runtime does not expose mutation secrets

- **WHEN** browser clients, workspace configuration, portable archives, or
  desired-state reads inspect deployment state
- **THEN** provider API tokens, Cloudflare OAuth access tokens, Cloudflare OAuth
  refresh tokens, Alchemy passwords, and Alchemy state tokens are not returned

#### Scenario: Repair cleanup stays selected

- **GIVEN** provider evidence requires repair cleanup outside normal deploy
  reconciliation
- **WHEN** a cleanup workflow writes a display-safe cleanup observation
- **THEN** the observation identifies the selected resource or evidence summary
- **AND** the runtime does not treat repair cleanup as the normal route-removal
  path

### Requirement: Deployment Runtime API

The system SHALL expose instance deployment runtime reads through the
`/api/formless/deployments` API family.

#### Scenario: Read deployment state

- WHEN a client reads `/api/formless/deployments/desired-state` or
  `/api/formless/deployments/status`
- THEN the runtime reads the requested supported target
- AND the target is selected by target id without a one-case deployment target
  kind
- AND the desired-state projection may be materialized from schema-owned
  control-plane records when that target supports them
- AND status reads derive from desired-state projection and the target
  deployment config observation cache
- AND the response uses `Cache-Control: no-store`

#### Scenario: Runtime deployment API is read-only

- WHEN a client sends attempt, lease, plan, success, failure, or provider
  difference mutation requests through the deployment API
- THEN the runtime rejects the request
- AND persisted deployment observations must be written as authorized
  deployment-config cache field patches instead of runtime table writes

### Requirement: Local Gateway Deployment Operations

The deployment runtime SHALL allow local workspace gateway sidecar push
operations to plan and apply deployment state while preserving projection and
credential boundaries.

#### Scenario: Browser starts credential setup

- **WHEN** a browser starts Cloudflare credential setup through the local
  workspace gateway proxy before push planning
- **THEN** the local gateway sidecar runs the trusted Formless-owned
  Cloudflare OAuth adapter and returns display-safe authorization URL events
  through the proxy
- **AND** deployment intent records store only provider references, account
  facts, and validation status after credentials are validated
- **AND** the first browser onboarding flow does not create Cloudflare API
  tokens, request token-management credentials from browser input, or write
  Formless-owned OAuth credentials into Alchemy OAuth profiles
- **AND** ignored local secret state stores OAuth access token, refresh token,
  expiry, granted scopes, account selection, and credential id facts needed for
  just-in-time refresh
- **AND** Worker runtime code does not run Alchemy credential setup or read
  local provider credential state

#### Scenario: Browser starts push dry-run

- **WHEN** a browser starts push dry-run through the local workspace gateway
  proxy
- **THEN** the local gateway sidecar reads schema-owned deployment intent
  records, resolves local credential context outside browser-visible responses,
  reads the current desired-state projection, and compares selected workspace
  source with the target
- **AND** the browser receives display-safe sync plan output without provider API
  tokens, Alchemy passwords, Alchemy state tokens, raw lease tokens, or runtime
  secrets
- **AND** Worker runtime code does not read workspace source, ignored secret
  state, or provider credentials to produce the plan

#### Scenario: Push operation execution capability

- **WHEN** a CLI, browser workspace gateway, trusted deploy node, or future
  automation runner considers push dry-run, push apply, credential setup, or
  deployment refresh operation
- **THEN** the runtime matches the operation definition's required execution
  capability and actor policy before starting execution
- **AND** browser callers can only forward operations to an available gateway or
  runner that advertises the required local workspace or provider capability
- **AND** provider mutation, credential setup, and local filesystem access remain
  unavailable to Worker runtime actors that do not advertise those capabilities
- **AND** the operation result boundary remains display-safe operation state and
  summaries, not raw provider output or runner secret state
- **AND** standalone deploy, deploy plan, deploy apply, drift report, and
  migration policy operations are not exposed as browser gateway operations

#### Scenario: Browser starts push apply

- **WHEN** a browser starts push apply through the local workspace gateway
  proxy
- **THEN** the local gateway sidecar applies provider mutations as a trusted
  local deployer and patches the target deployment config's latest observation
  cache after provider reconciliation or failure
- **AND** the gateway returns display-safe operation, evidence, cleanup, sync,
  and observation summaries through operation status or completion responses
- **AND** any deploy wording is scoped to an internal push step rather than a
  standalone operation key, command, browser route, or public workflow
- **AND** deployment execution history is not written to schema-owned workspace
  storage snapshots
- **AND** Worker runtime code does not perform provider mutation for local
  workspace gateway push apply

### Requirement: Workspace Deploy Source Boundary

The deployment runtime SHALL keep deployment intent reviewable as schema-owned
storage snapshot records and deployment observation cache display-safe but
outside reviewable source.

#### Scenario: Save deployment intent

- **WHEN** deployment intent is saved from Authority to workspace source
- **THEN** `route` and `deployment-config` records are written as
  schema-owned storage snapshot records
- **AND** workspace and archive boundaries identify those records with
  qualified entity names such as `instance:route` and
  `instance:deployment-config`
- **AND** projected deployment resource graph entries are runtime desired-state
  content, not reviewable control-plane storage snapshot records
- **AND** `formless.ts` does not declare deployment intent or target facts
- **AND** `deploy-attempt`, `deploy-evidence-summary`,
  cleanup audit summaries, raw leases, and provider
  state payloads are not written as workspace storage state
- **AND** deployment config observation cache fields are not written as
  workspace storage state

#### Scenario: Worker name source

- **WHEN** local workspace push planning resolves the provider worker name
- **THEN** a schema-owned deployment config worker-name value is used when
  present
- **AND** otherwise the deployment projection may default the worker name from the
  workspace configuration name
- **AND** `formless.ts` does not declare a separate worker-name override

#### Scenario: Exclude execution secrets

- **WHEN** browser clients, workspace configuration, storage snapshots, portable
  archives, or desired-state reads inspect deployment state
- **THEN** provider API tokens, Cloudflare OAuth access tokens, Cloudflare OAuth
  refresh tokens, Alchemy passwords, Alchemy state tokens, raw lease tokens,
  and runtime secrets are not returned
- **AND** display-safe secret references and operation summaries may be returned

#### Scenario: Gateway returns operation summaries

- **WHEN** browser clients inspect local push dry-run, push apply, cleanup, or
  refresh operation status through the workspace gateway
- **THEN** responses may include display-safe operation ids, desired-state
  hashes, plan counts, evidence counts, affected logical ids, cleanup results,
  sync counts, runner ids, timestamps, and user-facing errors
- **AND** those responses do not require `deploy-attempt` or
  `deploy-evidence-summary` control-plane records
- **AND** provider credentials, raw provider state, raw lease tokens, Alchemy
  state tokens, and runtime secrets are omitted
