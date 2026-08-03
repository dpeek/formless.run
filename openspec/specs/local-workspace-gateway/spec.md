# local-workspace-gateway Specification

## Purpose

Local workspace gateway exposes browser-safe workspace operation requests from
local runtime profiles through a same-origin proxy and a filesystem-capable
loopback sidecar. It keeps browser, Worker, and sidecar wire behavior
display-safe while local workspace operations, owner sessions, runtime
topology, provider credentials, and app records stay owned by their existing
runtime modules.

## Requirements

### Requirement: Local Workspace Gateway

The system SHALL expose browser-safe workspace operations from local workspace
runtime profiles through a filesystem-capable local gateway sidecar process.

#### Scenario: Gateway availability

- **WHEN** `formless dev` starts for a local Formless workspace
- **THEN** a local gateway sidecar is started with the resolved workspace root
  and ignored workspace state configuration
- **AND** workspace gateway operations are available to the browser under a
  same-origin, local-only API family served by the local runtime
- **AND** local runtime gateway routes proxy authorized requests to the sidecar
  over HTTP
- **AND** the local runtime proxy receives only browser/proxy authorization,
  shared runtime topology route eligibility, and sidecar target facts
- **AND** the sidecar process receives only execution authorization, workspace
  root, and operation handler facts needed for filesystem-capable work
- **AND** the CLI-owned local gateway lifecycle creates the sidecar, mints
  process-scoped gateway and local session tokens, builds the child runtime
  environment, produces the browser session entrypoint, and closes the sidecar
  when the child runtime exits
- **AND** the same API family is unavailable in deployed instance, app,
  site-authoring, and published Site profiles

#### Scenario: Gateway operation surface

- **WHEN** a browser calls the workspace gateway through the local runtime
- **THEN** it can request semantic operations for workspace status, save, check,
  pull, push, and credential setup
- **AND** it cannot request arbitrary filesystem reads, arbitrary filesystem
  writes, shell commands, or path traversal
- **AND** each request is classified against the workspace operation
  definition's mode, bootstrap availability, required capability, and execution
  requirements before it reaches a local execution handler
- **AND** deployment and provider execution remains internal work behind the
  workspace source push operation unless a later workspace operation definition
  explicitly promotes a deployment-facing operation

#### Scenario: Gateway operation execution adapter

- **WHEN** a gateway sidecar starts workspace status, save, check, pull, push,
  or credential setup
- **THEN** Gateway transport and sidecar adapters authorize, parse, and forward
  operation intent
- **AND** local runtime execution adapters use a Gateway-specific operation
  runner for operation state lifecycle, display-safe input, errors, logs,
  results, and redaction
- **AND** credential setup may surface external authorization events and
  continue asynchronously while using the same display-safe operation state
  contract
- **AND** Gateway adapters do not duplicate operation lifecycle transitions,
  operation body dispatch, or provider-specific step vocabulary

#### Scenario: Local runtime operation adapter

- **WHEN** the local gateway sidecar invokes runtime-supplied workspace
  operation handlers
- **THEN** local runtime operation adapters bind gateway actor facts to the
  Gateway operation runner, scope operation ids and workspace paths to the
  configured workspace root, project only the dependencies required by the
  operation's effective execution requirements, and return display-safe
  Workspace package operation state
- **AND** auto-save enqueue, suppression, retry, and explicit run-now behavior
  are owned by a local runtime adapter module rather than by Gateway transport
  adapters or source-sync operation bodies
- **AND** Gateway package code does not read or write workspace files,
  operation state files, ignored secret state, Authority snapshots, provider
  credentials, or deployment provider state while forwarding operation requests
- **AND** local gateway runtime adapter tests can cover operation forwarding,
  workspace root scoping, auto-save scheduling, capability forwarding, and
  display-safe response boundaries without duplicating Gateway package proxy
  route and authorization contract tests

### Requirement: Local Workspace Auto-Save

The system SHALL automatically persist committed local runtime writes to
reviewable workspace source when a local workspace gateway is available.

#### Scenario: Enqueue auto-save after committed browser writes

- **WHEN** a browser-originated Program operation, schema save,
  control-plane write, reset schema, storage snapshot restore, or deployment
  intent write commits through local Authority
- **OR** a core media upload is accepted and then referenced by a committed Program
  record
- **THEN** the browser or runtime enqueues workspace auto-save through the
  same-origin local gateway
- **AND** the sidecar records a process-local dirty generation and write source
  without writing workspace files from browser code
- **AND** failed writes, replayed writes, read-only requests, bootstrap reads,
  sync catch-up, and browser replica merges do not enqueue auto-save

#### Scenario: Auto-save executes through sidecar

- **WHEN** queued auto-save work runs
- **THEN** the gateway sidecar invokes the typed workspace save function
  against local Authority-backed storage snapshots and referenced media payloads
- **AND** auto-save consumes the typed save result directly without creating or
  persisting generic workspace operation state
- **AND** browser IndexedDB is not read as source
- **AND** deployed instance, mapped-host, site-authoring, and published Site
  profiles do not expose auto-save enqueue or execution

#### Scenario: Coalesce and retry auto-save

- **WHEN** multiple write sources enqueue auto-save while another debounce or
  save is pending
- **THEN** the scheduler coalesces them into one pending generation and
  serializes save execution
- **AND** a successful save clears dirty state only through the generation it
  persisted
- **AND** a failed save leaves process-local scheduler state dirty, reports the
  original failure only to local diagnostics, and retries only through bounded
  retry/backoff, the next committed local write, or an explicit manual save

#### Scenario: Auto-save state is process local

- **WHEN** the local sidecar starts, enqueues, retries, completes, or fails
  auto-save work
- **THEN** dirty generations, write sources, timers, retry count, and in-flight
  state exist only in the sidecar process
- **AND** no auto-save state file is written under ignored workspace state
- **AND** sidecar restart begins with no queued or resumed auto-save work
- **AND** the browser can enqueue auto-save but cannot read scheduler state,
  diagnostics, paths, commands, or errors through Gateway
- **AND** successful auto-save enqueue returns no generic result or status object

#### Scenario: Suppress auto-save loops

- **WHEN** local dev bootstraps Authority from workspace source, workspace pull
  restores local Authority, workspace restore or import applies snapshots, push
  or deploy writes remote targets, manual save writes workspace source, or
  auto-save writes workspace source
- **THEN** auto-save enqueue is suppressed for those internal write phases
- **AND** no workspace file write, push sync catch-up, or broadcast caused by
  those phases starts another auto-save loop

#### Scenario: Sidecar owns local execution

- **WHEN** a workspace gateway operation reads or writes workspace source,
  persists operation state, reads ignored secret state, runs local credential
  setup, invokes local tools, or applies provider mutations
- **THEN** that work is executed by the local gateway sidecar process
- **AND** Worker runtime code only performs route policy, browser
  authorization, operation intent validation, display-safe response forwarding,
  and HTTP proxying
- **AND** sidecar execution code does not depend on browser-only bootstrap or
  CSRF facts, sidecar endpoint selection, runtime topology facts, or
  browser-visible runtime configuration

#### Scenario: Revalidate execution requirements after request hop

- **WHEN** a workspace gateway operation crosses browser, local runtime proxy,
  sidecar, or runtime operation handler boundaries
- **THEN** each boundary that can authorize or execute the request revalidates
  the operation kind, actor policy, required capability, operation intent, and
  relevant execution requirements before forwarding or executing the request
- **AND** the local runtime proxy refuses operations when the local workspace
  gateway route or sidecar target required for local filesystem, local
  Authority, secret-state, or provider-capable work is unavailable
- **AND** the sidecar refuses proxied or direct requests that lack accepted
  proxy or automation authorization before filesystem, local Authority,
  secret-state, Cloudflare, Alchemy, or provider work begins
- **AND** the local workspace operation handler rechecks the same operation
  contract before invoking workspace operation bodies

### Requirement: Gateway Package Boundary

The system SHALL expose reusable local workspace gateway contracts and adapters
through the Gateway package slice.

#### Scenario: Package owns gateway interface

- **WHEN** runtime-neutral, browser, Worker, sidecar, CLI runtime, or
  tests need workspace gateway route constants, gateway proxy header
  contracts, operation intent helpers, browser fetch behavior, shared proxy
  rules, Worker proxy behavior, or sidecar HTTP routing helpers
- **THEN** they import those contracts and adapters from
  `@dpeek/formless-gateway`, `@dpeek/formless-gateway/client`,
  `@dpeek/formless-gateway/worker`, or `@dpeek/formless-gateway/sidecar`
- **AND** they import package-owned gateway behavior only through exported
  Gateway package entrypoints, not source-tree modules or unexported package
  internals
- **AND** CLI runtime adapter modules may supply non-package-owned operation
  execution, Workspace package operation state, owner session, and runtime
  topology dependencies to the package sidecar adapter

#### Scenario: Shared local runtime proxy rules

- **WHEN** a Worker runtime proxy adapter or local Node runtime proxy adapter
  handles a workspace gateway request before sidecar forwarding
- **THEN** it uses one package-owned proxy rules Module to classify gateway
  route and method intent, parse operation start input or read operation ids,
  classify operation intent, apply actor policy from supplied owner session,
  bootstrap, admin bearer, route eligibility, and capability facts, validate
  CSRF proof for browser mutations, build display-safe sidecar proxy headers,
  and wrap sidecar responses for browser-visible callers
- **AND** the Worker proxy adapter and local Node runtime proxy adapter may
  differ only in runtime seam facts such as shared runtime topology route
  eligibility, adapter-local sidecar target availability, owner session
  validation, owner setup status, advertised capabilities, proxy fetcher, and
  sidecar endpoint selection
- **AND** the local Node runtime proxy adapter and sidecar execution adapter use
  separate injected environment fact sets instead of sharing one sidecar-wide
  environment bag
- **AND** the shared proxy rules Module does not own owner session validation,
  owner setup status reads, runtime topology selection, sidecar endpoint
  creation, operation execution, operation state storage, filesystem work, or
  provider mutation
- **AND** the sidecar execution adapter remains a separate Module that
  revalidates proxied or direct automation authorization before invoking
  injected workspace operation handlers
- **AND** sidecar startup builds the process execution environment from an
  explicit allowlist rather than forwarding local runtime proxy or
  browser-visible environment facts wholesale

#### Scenario: Shared proxy adapter contract coverage

- **WHEN** Gateway tests cover behavior owned by the shared local runtime proxy
  rules Module
- **THEN** route classification, method rejection, operation intent parsing,
  actor policy, bootstrap expiry, CSRF proof, sidecar header sanitization,
  capability gating, sidecar forwarding, and browser-visible response wrapping
  are exercised through shared contract fixtures
- **AND** Worker proxy adapter tests cover only Worker-specific env parsing,
  runtime route availability injection, dependency isolation, capability
  injection, and Worker source boundary behavior
- **AND** local Node sidecar adapter tests cover only local proxy env mapping,
  loopback sidecar startup, sidecar execution ingress, direct automation
  authorization, and operation handler invocation behavior
- **AND** Worker and sidecar adapter tests do not duplicate the full shared proxy
  behavior matrix with separate harnesses

#### Scenario: Gateway response safety

- **WHEN** Gateway Worker, local runtime proxy, sidecar, browser client, or tests
  need to produce or inspect browser-visible gateway responses
- **THEN** one package-owned response safety Module defines transport-level JSON
  envelopes, allowed passthrough headers, method/error responses, sidecar
  unavailable responses, owner-session CSRF response wrapping, non-JSON sidecar
  passthrough safety, display-safe operation response wrapping, and empty
  auto-save enqueue success responses
- **AND** Worker proxy, local Node proxy, and sidecar adapters use that Module
  instead of each owning separate response header filtering or JSON wrapper logic
- **AND** the Module only wraps and filters transport output; semantic operation
  state redaction remains owned by Workspace package local state adapters and
  runtime operation adapters
- **AND** browser UI redaction remains a presentation fallback and does not
  replace Gateway transport response safety

#### Scenario: Workspace package owns semantic operation contracts

- **WHEN** Gateway browser, Worker, sidecar, CLI runtime, or tests need
  semantic workspace operation input shapes, display-safe operation state,
  operation result shapes, execution requirement declarations, operation state
  redaction, or operation persistence
- **THEN** those contracts and local state adapters come from
  `@dpeek/formless-workspace` or `@dpeek/formless-workspace/node`
- **AND** Gateway adapters treat those shapes as injected workspace operation
  contracts rather than Gateway-owned contracts
- **AND** Gateway response types may alias those Workspace contracts for
  transport callers without redefining compatible local operation shapes

#### Scenario: Package does not own runtime operations

- **WHEN** a gateway adapter needs owner session validation, runtime topology
  eligibility, owner setup status, workspace save, workspace check, workspace
  pull, workspace push, credential setup, operation persistence, filesystem
  access, execution context resolution, or provider mutation behind a workspace
  operation
- **THEN** those behaviors are supplied through Formless runtime adapters or
  Workspace package local state adapters
- **AND** the Gateway package does not own app records, Authority storage,
  owner session cookies, runtime topology records, provider credentials,
  Alchemy state, Cloudflare mutation, workspace storage snapshots, semantic
  operation contracts, or operation state storage

### Requirement: Workspace Gateway Security Baseline

The system SHALL protect local workspace gateway routes with local route policy,
same-origin browser authorization, CSRF protection, internal sidecar proxy
authorization, operation-scoped input validation, and a separate local session
bootstrap boundary.

#### Scenario: Pre-owner bootstrap operation

- **WHEN** `formless dev` starts a local workspace runtime before owner setup is
  complete
- **THEN** the runtime may issue a process-scoped, unguessable bootstrap
  capability to the same-origin browser shell
- **AND** that capability can authorize gateway status reads only for the
  resolved workspace root
- **AND** that capability cannot authorize save, pull, push, credential setup,
  cleanup, workspace initialization, arbitrary control-plane writes, arbitrary
  filesystem access, Cloudflare mutation, Alchemy mutation, provider mutation,
  or deployment-facing provider work behind a workspace operation
- **AND** proxied bootstrap requests sent to the sidecar include only
  display-safe actor and operation intent facts plus internal proxy
  authorization
- **AND** the capability expires when the local runtime process exits or owner
  setup completes

#### Scenario: Local session bootstrap

- **WHEN** `formless dev` starts a local workspace runtime with a CLI-minted
  local session bootstrap token
- **THEN** the same-origin browser can exchange that token only through the
  local session bootstrap endpoint
- **AND** the endpoint issues an owner session cookie for the local runtime and
  redirects to the instance shell
- **AND** when the local runtime is reached through a named same-origin proxy,
  the bootstrap URL may use the proxy origin while server readiness and admin
  bootstrap work may use the loopback child dev origin
- **AND** the owner session cookie is scoped to the request host that exchanged
  the token
- **AND** the token cannot authorize gateway operations, control-plane writes,
  app installs, arbitrary filesystem access, Cloudflare mutation, Alchemy
  mutation, or provider mutation
- **AND** the token expires when the local runtime process exits or after a
  successful exchange
- **AND** the local session bootstrap endpoint is unavailable outside local
  workspace runtime profiles

#### Scenario: Local agent session reset entrypoint

- **WHEN** a browser or agent opens a local session bootstrap URL with a reset
  request intended to start from a fresh authenticated browser session
- **THEN** the entrypoint must establish or verify a local owner session through
  the local session bootstrap boundary before any owner-only local runtime
  surface is used
- **AND** browser-visible reset work is limited to browser-owned local caches,
  session bootstrap redirect state, and same-origin client state for the local
  runtime
- **AND** resetting browser-owned local state cannot authorize save, pull, push,
  credential setup, cleanup, arbitrary filesystem access, Cloudflare mutation,
  Alchemy mutation, provider mutation, deployment-facing provider work behind a
  workspace operation, or admin bearer disclosure
- **AND** server-owned local Authority, media, operation, and Wrangler state
  reset remains a CLI-owned local workspace state operation

#### Scenario: Browser starts mutating operation

- **WHEN** a browser starts save, pull, push, credential setup, cleanup, or
  another post-bootstrap mutating gateway operation
- **THEN** the request must be served by a local workspace runtime profile with
  a configured local gateway sidecar target
- **AND** the request must have a same-origin `Origin` header for the local
  workspace origin
- **AND** the request must include a valid owner session cookie
- **AND** the request must include a same-origin CSRF token or equivalent
  double-submit/header proof issued by the local runtime
- **AND** the sidecar must receive an internal proxy authorization token before
  filesystem, Cloudflare, Alchemy, or provider mutation begins
- **AND** admin bearer tokens are not accepted through browser login or exposed
  to browser state

#### Scenario: Local gateway secret placement

- **WHEN** `formless dev` creates local gateway process tokens, sidecar
  execution configuration, child runtime environment, and browser-visible Vite
  configuration
- **THEN** sidecar endpoint facts may reach only the local runtime process that
  proxies to the sidecar
- **AND** sidecar proxy tokens may reach only the local runtime proxy and
  sidecar execution boundary
- **AND** the sidecar process may receive only the internal proxy token, admin
  automation token, enabled flag, workspace root, and injected operation
  handlers needed to authorize and execute local workspace operations
- **AND** browser-visible environment only contains same-origin gateway API and
  bootstrap facts that are safe for browser use
- **AND** browser-visible environment does not contain sidecar proxy tokens,
  sidecar endpoint URLs, workspace root facts, admin tokens, owner session
  secrets, or raw local session bootstrap tokens
- **AND** lifecycle tests can verify what reaches the child runtime process,
  what is printed or opened for the browser, and what is removed from
  browser-visible configuration without depending on workspace bootstrap,
  app-package resolution, Authority storage, or operation execution internals

#### Scenario: CLI or automation starts operation

- **WHEN** a non-browser CLI or automation caller starts a gateway operation
- **THEN** the sidecar may authorize through the admin bearer boundary or a
  local runtime proxy may forward an already authorized automation actor
- **AND** the request still must target the resolved local workspace sidecar and
  operation allowlist
- **AND** browser-visible responses do not expose whether an admin token exists
  or reveal token values

#### Scenario: Operation scope validation

- **WHEN** any caller starts or reads a gateway operation
- **THEN** the operation kind, operation id, and input shape are allowlisted
- **AND** operation ids are unguessable and scoped to the current workspace
- **AND** arbitrary filesystem paths, path traversal, shell commands, raw logs,
  raw adapter output, raw provider state, and secret-looking values are rejected
  or redacted

#### Scenario: Cross-origin or deployed request blocked

- **WHEN** a deployed runtime, mapped host, cross-origin browser request, or
  request without required bootstrap or owner/CSRF proof calls the gateway API
  family
- **THEN** the local runtime refuses the request before proxying to the sidecar
- **AND** the sidecar refuses direct requests without internal proxy
  authorization or accepted automation authorization before workspace
  filesystem, Authority, Cloudflare, Alchemy, or provider mutation
- **AND** the response remains display-safe

### Requirement: Workspace Operation Progress

The system SHALL track local workspace operations with display-safe progress.

#### Scenario: Operation state package boundary

- **WHEN** a local workspace operation starts, updates, completes, fails, or is
  read through Gateway
- **THEN** semantic operation input, result, event, log, error, summary, and
  display-safe state contracts are owned by the Workspace package
- **AND** Gateway transports those operation states without redefining
  compatible local response shapes
- **AND** operation persistence stays under ignored Workspace package local
  state adapters, not Gateway storage

#### Scenario: Start operation

- **WHEN** a browser starts a long-running workspace operation
- **THEN** the gateway returns an operation id and initial status
- **AND** the operation records display-safe kind, status, started time, updated
  time, actor, summary, and error fields

#### Scenario: Read operation progress

- **WHEN** a browser reads operation progress
- **THEN** the gateway returns display-safe progress, logs, and completion
  summary for the requested operation id
- **AND** provider credentials, local secret values, raw filesystem paths outside
  the workspace root, and provider state payloads are omitted

#### Scenario: Read deployment-facing push summaries

- **WHEN** a browser reads progress for a workspace source push operation that
  performs deployment or provider work internally
- **THEN** the gateway may return display-safe operation ids, desired-state
  hashes, plan counts, evidence counts, affected logical ids, cleanup summaries,
  drift counts, runner ids, timestamps, and user-facing errors
- **AND** those summaries are operation/runtime data, not workspace record
  source
- **AND** the response does not depend on `deploy-attempt`,
  `deploy-evidence-summary`, or `deploy-drift-report` schema-owned records

#### Scenario: Read deployment step progress

- **WHEN** a browser reads progress for a workspace source push operation that
  performs deployment or provider work internally
- **THEN** the gateway can return ordered display-safe steps for credential
  resolution, account selection, desired-state planning, Worker deployment,
  health check, owner setup, workspace push or writeback, and deployment
  observation refresh
- **AND** each step includes a stable step id, display label, status, optional
  timestamps, and optional display-safe summary or error
- **AND** health check failures include expected target URL and retry-safe
  diagnostic text without exposing provider credentials, admin tokens, raw
  Alchemy state, or raw provider responses
- **AND** operation logs remain display-safe summaries rather than raw adapter
  stdout, stderr, or provider state payloads

#### Scenario: Persist operation progress

- **WHEN** a workspace operation starts, updates, or completes
- **THEN** Workspace package local state adapters persist display-safe operation
  state under ignored workspace state
- **AND** browser refreshes can recover active or recently completed operation
  status
- **AND** secret material, raw adapter or tool output, and provider state payloads
  are not persisted in operation state

### Requirement: Cloudflare Credential Setup

The system SHALL use a Formless-owned Cloudflare OAuth client as the browser
onboarding path for Cloudflare credential setup.

#### Scenario: Existing Formless Cloudflare OAuth credential

- **WHEN** a browser starts Cloudflare credential setup and the local gateway can
  resolve an existing Formless-owned Cloudflare OAuth credential from ignored
  local secret state
- **THEN** the gateway refreshes the access token if needed, validates the
  credential scopes and account visibility, and returns display-safe account
  options
- **AND** no Cloudflare token is requested from browser input

#### Scenario: Create Formless Cloudflare OAuth credential

- **WHEN** a browser starts Cloudflare credential setup without a usable
  Formless-owned Cloudflare OAuth credential
- **THEN** the gateway starts a trusted local Formless Cloudflare OAuth flow
  using Authorization Code with PKCE and the Formless-owned OAuth client
- **AND** the OAuth client id is a source-owned Formless constant rather than a
  browser input, workspace setting, secret-state value, or environment variable
- **AND** the requested Cloudflare scopes match the current Formless deploy
  resource set, including Worker scripts, Worker routes, R2, DNS, zones,
  account details, user details, Turnstile widgets, and offline access
- **AND** after authorization the gateway resolves accessible Cloudflare
  accounts and either selects the only available account or returns
  display-safe account options for browser selection
- **AND** the selected account is stored as display-safe deployment intent
  together with a credential reference
- **AND** OAuth access tokens, refresh tokens, expiry, and granted scopes are
  stored only under ignored workspace secret state
- **AND** Formless-owned OAuth credentials are not written to Alchemy OAuth
  credentials or provider profiles

#### Scenario: API token creation excluded from first onboarding

- **WHEN** browser onboarding needs Cloudflare credentials
- **THEN** the gateway does not request a Cloudflare Global API Key, pasted API
  token, or token-management API token from the browser
- **AND** Cloudflare API token creation remains outside the first browser
  onboarding flow

#### Scenario: Browser token paste unavailable

- **WHEN** browser onboarding needs Cloudflare credentials
- **THEN** the gateway does not expose a browser token paste operation
- **AND** credential setup proceeds through existing Formless-owned OAuth
  credentials or Formless-owned OAuth creation

### Requirement: External Authorization URL Handoff

The system SHALL allow browser-initiated credential setup operations to surface
provider authorization URLs from trusted local credential adapters.

#### Scenario: Formless adapter provides Cloudflare authorization URL

- **WHEN** a browser starts Cloudflare credential setup through the workspace
  gateway and the trusted Formless Cloudflare OAuth adapter provides an external
  authorization URL
- **THEN** the gateway returns a display-safe operation event containing the URL,
  credential label, provider, and waiting status
- **AND** raw adapter or tool output is not returned to the browser
- **AND** OAuth access tokens, OAuth refresh tokens, provider tokens, Alchemy
  passwords, and local secret values are redacted from operation events

#### Scenario: Complete external authorization

- **WHEN** the user completes the external Cloudflare authorization in the
  browser and the Formless Cloudflare OAuth adapter finishes locally
- **THEN** the gateway validates the resulting Cloudflare credentials, resolves
  accessible accounts, and stores any secret material only under ignored
  workspace secret state
- **AND** browser-visible records and responses contain only display-safe
  credential references, account facts, and validation status

#### Scenario: Authorization URL validation

- **WHEN** trusted local credential setup produces an authorization URL or
  diagnostic output
- **THEN** the gateway extracts only allowlisted Cloudflare or Alchemy
  authorization URLs expected for the current operation
- **AND** unexpected URLs, raw logs, and secret-looking values are not exposed to
  browser clients

### Requirement: Browser Workspace Onboarding

The system SHALL allow a browser to complete local workspace onboarding through
the local gateway and Authority-backed control-plane writes after CLI-owned
workspace bootstrap.

#### Scenario: Start from CLI-initialized workspace

- **WHEN** a browser opens a fresh local workspace runtime started by
  `formless dev`
- **THEN** the workspace already has layout source and ignored local state
  prepared by the CLI before the runtime starts
- **AND** the browser is not offered a workspace initialization action

### Requirement: Gateway Secret Boundary

The system MUST keep workspace secrets and provider credentials outside browser
responses and reviewable source.

#### Scenario: Push deploys through gateway

- **WHEN** a browser starts a workspace source push operation that performs
  deployment or provider work internally
- **THEN** the gateway resolves Formless-owned Cloudflare OAuth credentials from
  ignored workspace secret state and refreshes the access token just in time for
  provider mutation
- **AND** existing deployed instance targets are resolved from enabled
  `deployment-config.targetUrl` workspace storage state
- **AND** the browser receives only display-safe plan, operation, health check,
  restore, and observation summaries
- **AND** push may patch the target deployment config's latest display-safe
  observation cache after deploy or failure
- **AND** deployment operation evidence summaries, drift reports, cleanup audit
  summaries, and deployment observation cache fields are returned through
  gateway operation status/results rather than reviewable workspace source

#### Scenario: Check stays read-only

- **WHEN** a browser starts a check operation through the gateway
- **THEN** the gateway reports fresh deployment and drift observations through
  operation status/results
- **AND** it does not patch deployment config observation cache fields

#### Scenario: Refresh persists observation

- **WHEN** a browser starts an explicit deployment refresh operation through the
  gateway
- **THEN** the gateway may persist the latest display-safe deployment
  observation by patching the target deployment config cache fields
- **AND** source intent fields remain unchanged

#### Scenario: Secret rejection

- **WHEN** workspace source, operation input, or operation output includes
  provider API tokens, Cloudflare OAuth access tokens, Cloudflare OAuth refresh
  tokens, Alchemy passwords, Alchemy state tokens, raw lease tokens, owner setup
  tokens, or automation admin tokens
- **THEN** Workspace package local state adapters or runtime operation adapters
  reject or redact the secret values before writing reviewable source
- **AND** Gateway rejects or redacts the secret values before returning
  browser-visible data

### Requirement: Worker Gateway Implementation Boundary

The system MUST keep workspace gateway execution implementation out of Worker
runtime code and bundles.

#### Scenario: Worker source dependency boundary

- **WHEN** Worker source modules are checked
- **THEN** they do not import the local gateway sidecar implementation,
  workspace filesystem operation modules, local credential setup adapters,
  shell/tool execution helpers, or Node filesystem/path/process APIs for
  workspace gateway execution

#### Scenario: Worker gateway route behavior

- **WHEN** a local Worker runtime receives a workspace gateway API request and
  `FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL` and
  `FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN` are present
- **THEN** the Worker authorizes the browser or automation request, classifies
  the operation intent, validates shared runtime topology route eligibility and
  configured sidecar target availability, validates that the configured gateway
  route can satisfy requirements that need sidecar execution, and proxies the
  request to the configured sidecar over HTTP
- **AND** the Worker does not read or write workspace source files, ignored
  gateway state, local secret state, or provider credentials

#### Scenario: Worker gateway unavailable without sidecar

- **WHEN** a Worker runtime receives a workspace gateway API request without
  `FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL` and
  `FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN`
- **THEN** the gateway route is unavailable
- **AND** no workspace filesystem, credential, Cloudflare, Alchemy, or provider
  mutation behavior is reachable
