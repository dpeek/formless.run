# local-workspace-gateway Specification

## Purpose

Local workspace gateway exposes one browser-visible Push capability from local
runtime profiles through a same-origin proxy and a filesystem-capable loopback
sidecar. Gateway owns the exact Push transport and process-local observation
registry while typed Push execution, owner sessions, runtime topology, provider
credentials, and app records stay owned by their existing runtime modules.

## Requirements

### Requirement: Local Workspace Gateway

The system SHALL expose browser-safe workspace Push from local workspace runtime
profiles through a filesystem-capable local gateway sidecar process.

#### Scenario: Gateway availability

- **WHEN** `formless dev` starts for a local Formless workspace
- **THEN** a local gateway sidecar is started with the resolved workspace root
  and ignored workspace state configuration
- **AND** workspace Push is available to the browser under a
  same-origin, local-only API family served by the local runtime
- **AND** local runtime gateway routes proxy authorized requests to the sidecar
  over HTTP
- **AND** the local runtime proxy receives only browser/proxy authorization,
  shared runtime topology route eligibility, and sidecar target facts
- **AND** the sidecar process receives only execution authorization, workspace
  root, and typed Push handler facts needed for filesystem-capable work
- **AND** the CLI-owned local gateway lifecycle creates the sidecar, mints
  process-scoped gateway and local session tokens, builds the child runtime
  environment, produces the browser session entrypoint, and closes the sidecar
  when the child runtime exits
- **AND** the same API family is unavailable in deployed instance, app,
  site-authoring, and published Site profiles

#### Scenario: Gateway Push surface

- **WHEN** a browser calls the workspace gateway through the local runtime
- **THEN** it can read Gateway status, start Push dry-run or apply, read current
  or latest Push, and answer a current Push account-selection interaction
- **AND** status is a Gateway transport read and auto-save enqueue is a separate
  fire-and-forget runtime endpoint; neither is a workspace operation
- **AND** save, check, pull, credential setup, deployment refresh, cleanup, and
  arbitrary operation kinds are not browser Gateway operations
- **AND** it cannot request arbitrary filesystem reads, arbitrary filesystem
  writes, shell commands, or path traversal
- **AND** each request is classified against the Gateway-owned Push route,
  actor, mode, capability, and exact input contract before it reaches a local
  execution handler
- **AND** deployment and provider execution remains internal work behind Push

#### Scenario: Gateway Push execution adapter

- **WHEN** a gateway sidecar starts Push
- **THEN** Gateway transport and sidecar adapters authorize, parse, and forward
  exact Push intent
- **AND** the local runtime adapter invokes the typed Push and credential
  functions directly and reports exact phase, outcome, failure-code, and
  interaction facts to the Gateway registry
- **AND** start returns queued Push state before typed Push execution completes
- **AND** arbitrary diagnostics, exceptions, logs, paths, commands, provider
  output, display copy, and generic result objects do not enter Gateway state

#### Scenario: Local runtime Push adapter

- **WHEN** the local gateway sidecar invokes runtime-supplied workspace
  Push handlers
- **THEN** local runtime adapters bind Gateway actor facts to typed Push input,
  scope execution to the configured workspace root, and project only the
  dependencies required by dry-run or apply
- **AND** auto-save enqueue, suppression, retry, and explicit run-now behavior
  are owned by a local runtime adapter module rather than by Gateway transport
  adapters or source-sync operation bodies
- **AND** Gateway package code does not read or write workspace files, ignored
  secret state, Authority snapshots, provider
  credentials, or deployment provider state while forwarding Push requests
- **AND** local gateway runtime adapter tests cover typed Push forwarding,
  phase observation, workspace root scoping, auto-save suppression, and
  diagnostic isolation without duplicating Gateway transport tests

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

- **WHEN** Gateway Push reads workspace source, reads ignored secret state, runs
  local credential setup, invokes local tools, or applies provider mutations
- **THEN** that work is executed by the local gateway sidecar process
- **AND** Worker runtime code only performs route policy, browser
  authorization, exact request validation, exact response forwarding, and HTTP
  proxying
- **AND** sidecar execution code does not depend on browser-only bootstrap or
  CSRF facts, sidecar endpoint selection, runtime topology facts, or
  browser-visible runtime configuration

#### Scenario: Revalidate execution requirements after request hop

- **WHEN** Gateway Push crosses browser, local runtime proxy, sidecar, or typed
  Push handler boundaries
- **THEN** each boundary that can authorize or execute the request revalidates
  Push mode, actor policy, required capability, intent, and relevant execution
  requirements before forwarding or executing the request
- **AND** the local runtime proxy refuses Push when the local workspace
  gateway route or sidecar target required for local filesystem, local
  Authority, secret-state, or provider-capable work is unavailable
- **AND** the sidecar refuses proxied or direct requests that lack accepted
  proxy or automation authorization before filesystem, local Authority,
  secret-state, Cloudflare, Alchemy, or provider work begins
- **AND** the local typed Push adapter rechecks the same semantic capability and
  execution requirements before invoking Push

### Requirement: Gateway Package Boundary

The system SHALL expose reusable local workspace gateway contracts and adapters
through the Gateway package slice.

#### Scenario: Package owns gateway interface

- **WHEN** runtime-neutral, browser, Worker, sidecar, CLI runtime, or
  tests need workspace gateway route constants, gateway proxy header
  contracts, Push wire contracts, browser fetch behavior, shared proxy rules,
  Worker proxy behavior, or sidecar HTTP routing helpers
- **THEN** they import those contracts and adapters from
  `@dpeek/formless-gateway`, `@dpeek/formless-gateway/client`,
  `@dpeek/formless-gateway/worker`, or `@dpeek/formless-gateway/sidecar`
- **AND** they import package-owned gateway behavior only through exported
  Gateway package entrypoints, not source-tree modules or unexported package
  internals
- **AND** CLI runtime adapter modules supply typed Push execution, credential
  continuation, owner session, and runtime topology dependencies to the package
  sidecar adapter

#### Scenario: Shared local runtime proxy rules

- **WHEN** a Worker runtime proxy adapter or local Node runtime proxy adapter
  handles a workspace gateway request before sidecar forwarding
- **THEN** it uses one package-owned proxy rules Module to classify gateway
  route and method intent, parse Push start or interaction input, apply actor
  policy from supplied owner session, bootstrap, admin bearer, route
  eligibility, and capability facts, validate CSRF proof for browser mutations,
  build bounded sidecar proxy headers, and wrap exact responses for browser
  callers
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
  creation, typed Push execution, filesystem work, or provider mutation
- **AND** the sidecar execution adapter remains a separate Module that
  revalidates proxied or direct automation authorization before invoking
  the injected typed Push handler
- **AND** sidecar startup builds the process execution environment from an
  explicit allowlist rather than forwarding local runtime proxy or
  browser-visible environment facts wholesale

#### Scenario: Shared proxy adapter contract coverage

- **WHEN** Gateway tests cover behavior owned by the shared local runtime proxy
  rules Module
- **THEN** route classification, method rejection, exact Push and interaction
  parsing, actor policy, bootstrap expiry, CSRF proof, sidecar header
  sanitization, capability gating, sidecar forwarding, and response wrapping
  are exercised through shared contract fixtures
- **AND** Worker proxy adapter tests cover only Worker-specific env parsing,
  runtime route availability injection, dependency isolation, capability
  injection, and Worker source boundary behavior
- **AND** local Node sidecar adapter tests cover only local proxy env mapping,
  loopback sidecar startup, sidecar execution ingress, direct automation
  authorization, and typed Push handler invocation behavior
- **AND** Worker and sidecar adapter tests do not duplicate the full shared proxy
  behavior matrix with separate harnesses

#### Scenario: Gateway response safety

- **WHEN** Gateway Worker, local runtime proxy, sidecar, browser client, or tests
  need to produce or inspect browser-visible gateway responses
- **THEN** one package-owned response safety Module defines transport-level JSON
  envelopes, closed error codes, allowed passthrough headers, sidecar
  unavailable responses, owner-session CSRF delivery, exact Push response
  parsing, and empty auto-save enqueue success responses
- **AND** Worker proxy, local Node proxy, and sidecar adapters use that Module
  instead of each owning separate response header filtering or JSON wrapper logic
- **AND** error bodies contain only a Gateway-owned code and never exception
  messages, response bodies, diagnostics, paths, commands, logs, or provider
  output
- **AND** the Gateway browser client preserves only the recognized code and HTTP
  status on request failures and does not translate those codes into display
  copy
- **AND** Formless browser runtime maps Gateway codes to fixed presentation copy
  before publishing renderer-neutral contracts
- **AND** non-JSON or structurally invalid sidecar responses become a closed
  `invalid-sidecar-response` error rather than passing through

#### Scenario: Gateway owns semantic Push transport

- **WHEN** Gateway browser, Worker, sidecar, CLI runtime adapter, or tests need
  Push start, status, phase, outcome, failure-code, interaction, or transport
  error shapes
- **THEN** those closed wire contracts come from `@dpeek/formless-gateway`
- **AND** Gateway does not alias Workspace operation state, generic result,
  display summary, log, error-message, or persistence contracts
- **AND** typed local Push execution results remain owned by Formless CLI domain
  modules and are projected into Gateway contracts by the local adapter

#### Scenario: Package does not own runtime operations

- **WHEN** a gateway adapter needs owner session validation, runtime topology
  eligibility, owner setup status, typed workspace Push, credential setup,
  filesystem access, execution context resolution, or provider mutation
- **THEN** those behaviors are supplied through Formless runtime adapters and
  typed domain modules
- **AND** the Gateway package does not own app records, Authority storage,
  owner session cookies, runtime topology records, provider credentials,
  Alchemy state, Cloudflare mutation, workspace storage snapshots, semantic
  CLI results, or durable operation history

### Requirement: Workspace Gateway Security Baseline

The system SHALL protect local workspace gateway routes with local route policy,
same-origin browser authorization, CSRF protection, internal sidecar proxy
authorization, Push-scoped input validation, and a separate local session
bootstrap boundary.

#### Scenario: Pre-owner Gateway status bootstrap

- **WHEN** `formless dev` starts a local workspace runtime before owner setup is
  complete
- **THEN** the runtime may issue a process-scoped, unguessable bootstrap
  capability to the same-origin browser shell
- **AND** that capability can authorize Gateway status reads only for the
  resolved workspace root
- **AND** that capability cannot authorize Push, interaction submission,
  auto-save enqueue, arbitrary control-plane writes, arbitrary filesystem
  access, Cloudflare mutation, Alchemy mutation, or provider mutation
- **AND** proxied bootstrap requests sent to the sidecar include only
  bounded actor and Gateway status intent facts plus internal proxy authorization
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
- **AND** the token cannot authorize Push, interaction submission, auto-save
  enqueue, control-plane writes, app installs, arbitrary filesystem access,
  Cloudflare mutation, Alchemy mutation, or provider mutation
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
- **AND** server-owned local Authority, media, and Wrangler state
  reset remains a CLI-owned local workspace state operation

#### Scenario: Browser starts Push or answers an interaction

- **WHEN** a browser starts Push or submits an account choice for current Push
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
  automation token, enabled flag, workspace root, and injected typed Push
  handler needed to authorize and execute Push
- **AND** browser-visible environment only contains same-origin gateway API and
  bootstrap facts that are safe for browser use
- **AND** browser-visible environment does not contain sidecar proxy tokens,
  sidecar endpoint URLs, workspace root facts, admin tokens, owner session
  secrets, or raw local session bootstrap tokens
- **AND** lifecycle tests can verify what reaches the child runtime process,
  what is printed or opened for the browser, and what is removed from
  browser-visible configuration without depending on workspace bootstrap,
  app-package resolution, Authority storage, or operation execution internals

#### Scenario: CLI or automation starts Push through Gateway

- **WHEN** a non-browser CLI or automation caller starts Push through Gateway
- **THEN** the sidecar may authorize through the admin bearer boundary or a
  local runtime proxy may forward an already authorized automation actor
- **AND** the request still must target the resolved local workspace sidecar and
  exact Push contract
- **AND** browser-visible responses do not expose whether an admin token exists
  or reveal token values

#### Scenario: Push scope validation

- **WHEN** any caller starts or reads Push or answers its interaction
- **THEN** Push id, mode, optional target alias, interaction id, interaction
  kind, and account choice are validated against closed contracts
- **AND** Push ids are unguessable and scoped to the current sidecar process
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
- **AND** the response contains only the applicable closed Gateway error code

### Requirement: Gateway Push Contract

The system SHALL expose exact Push lifecycle and progress contracts without a
generic operation-state or result envelope.

#### Scenario: Push routes and envelopes

- **WHEN** Gateway routes are built or parsed
- **THEN** `GET /api/formless/workspace/status` reads availability and
  rediscovery state, `POST /api/formless/workspace/pushes` starts Push,
  `GET /api/formless/workspace/pushes/:pushId` reads Push, and
  `POST /api/formless/workspace/pushes/:pushId/interactions/:interactionId`
  answers account selection
- **AND** successful status responses contain `gateway`, `currentPush`,
  `latestPush`, and an optional owner-session `csrfToken`
- **AND** successful Push responses contain one `push` value
- **AND** error responses contain only `code` selected from `invalid-request`,
  `unauthorized`, `forbidden`, `bootstrap-expired`, `csrf-invalid`,
  `gateway-unavailable`, `push-active`, `push-not-found`,
  `interaction-not-found`, `interaction-invalid`, `interaction-expired`,
  `invalid-sidecar-response`, `method-not-allowed`, or `not-found`

#### Scenario: Push start input

- **WHEN** a caller starts Push
- **THEN** the request contains only mode `dry-run` or `apply` and an optional
  workspace target alias
- **AND** browser Push has no force, path, command, provider, credential,
  account, diagnostic, or generic input field

#### Scenario: Push lifecycle

- **WHEN** Push is returned by start, read, or Gateway status
- **THEN** lifecycle is one of `queued`, `running`,
  `waiting-for-interaction`, `succeeded`, or `failed`
- **AND** it includes an unguessable Push id, requested mode, created time,
  updated time, ordered phase states, and optional target alias
- **AND** a succeeded Push has exactly one outcome `up-to-date`, `planned`, or
  `applied`
- **AND** a failed Push has one closed failure code and failed phase
- **AND** it has no arbitrary title, detail, message, summary, error, log,
  display object, runner id, path, command, provider output, or generic result

#### Scenario: Terminal Push invariants

- **WHEN** Push becomes terminal
- **THEN** `up-to-date` may complete either mode, `planned` completes only
  `dry-run`, and `applied` completes only `apply`
- **AND** outcome is present only for `succeeded`, failure code and failed phase
  are present only for `failed`, and interaction is absent from terminal Push

#### Scenario: Ordered Push phases

- **WHEN** Push progresses
- **THEN** phases remain ordered as `credentials`, `account-selection`,
  `desired-state-plan`, `provider-reconciliation`, `health-check`,
  `owner-setup`, `workspace-push-writeback`, and `observation-refresh`
- **AND** each phase contains only its id and status `pending`, `running`,
  `succeeded`, `skipped`, or `failed`
- **AND** phase transitions are monotonic and at most one phase is running

#### Scenario: Push failure codes

- **WHEN** typed Push execution fails
- **THEN** the local adapter maps the failure to one of `source-invalid`,
  `credential-unavailable`, `authorization-expired`, `account-discovery-failed`,
  `interaction-expired`, `target-unavailable`, `target-conflict`,
  `schema-incompatible`, `backup-failed`, `provider-reconciliation-failed`,
  `health-check-failed`, `owner-setup-failed`, `restore-validation-failed`,
  `restore-apply-failed`, `observation-write-failed`, or `internal-failure`
- **AND** the original exception and diagnostics remain process-local

### Requirement: Process-Local Push Registry

The sidecar SHALL observe current and latest Push in one process-local registry.

#### Scenario: Current and latest Push

- **WHEN** the sidecar starts, advances, waits, succeeds, or fails Push
- **THEN** the registry holds at most one current non-terminal Push and one
  latest terminal Push
- **AND** a second start while current Push exists fails with `push-active`
- **AND** terminal current Push atomically replaces latest and clears current
- **AND** starting a new Push retains latest until the new Push becomes terminal
- **AND** only current and latest Push ids are readable

#### Scenario: Gateway status response

- **WHEN** a caller reads Gateway status
- **THEN** the response reports Gateway `available`, current Push or null, and
  latest Push or null without executing a workspace status operation
- **AND** an owner-session browser response also delivers the current CSRF token
- **AND** status contains no workspace snapshot, filesystem, scheduler,
  diagnostic, credential, or provider state

#### Scenario: Sidecar restart

- **WHEN** the sidecar process stops or restarts
- **THEN** current Push, latest Push, interactions, continuations, and queued
  execution are discarded and not resumed
- **AND** the new registry starts empty and previous Push ids return
  `push-not-found`
- **AND** no `.formless/operations` file or other Push registry file is read or
  written

### Requirement: Cloudflare Credential Setup

The system SHALL use a Formless-owned Cloudflare OAuth client as the browser
onboarding path for Cloudflare credential setup.

#### Scenario: Push uses existing Formless Cloudflare OAuth credential

- **WHEN** Push resolves an existing Formless-owned Cloudflare OAuth credential
  from ignored local secret state
- **THEN** the gateway refreshes the access token if needed, validates the
  credential scopes and account visibility, and returns exact bounded account
  choices when selection is required
- **AND** no Cloudflare token is requested from browser input

#### Scenario: Push creates Formless Cloudflare OAuth credential

- **WHEN** Push starts without a usable
  Formless-owned Cloudflare OAuth credential
- **THEN** the gateway starts a trusted local Formless Cloudflare OAuth flow
  using Authorization Code with PKCE and the Formless-owned OAuth client
- **AND** the OAuth client id is a source-owned Formless constant rather than a
  browser input, workspace setting, secret-state value, or environment variable
- **AND** the requested Cloudflare scopes match the current Formless deploy
  resource set, including Worker scripts, Worker routes, R2, DNS, zones,
  account details, user details, Turnstile widgets, and offline access
- **AND** after authorization the gateway resolves accessible Cloudflare
  accounts and either selects the only available account or returns exact
  bounded account choices for browser selection
- **AND** the selected account is stored as semantic deployment intent
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

### Requirement: Push Interactions

The system SHALL allow current Push to wait for exact external authorization or
account-selection interaction facts from trusted local credential adapters.

#### Scenario: Formless adapter provides Cloudflare authorization URL

- **WHEN** the trusted Formless Cloudflare OAuth adapter provides an external
  authorization URL during Push
- **THEN** current Push enters `waiting-for-interaction` with one
  `external-authorization` interaction containing interaction id, provider
  `cloudflare`, validated URL, and expiry time
- **AND** the interaction expires five minutes after authorization starts
- **AND** raw adapter output, labels, logs, tokens, credentials, and local secret
  values are not interaction fields

#### Scenario: Complete external authorization

- **WHEN** the user completes the external Cloudflare authorization in the
  browser and the Formless Cloudflare OAuth adapter finishes locally
- **THEN** the sidecar continuation validates the resulting credential and
  resumes Push when exactly one account is available
- **AND** multiple accounts replace the authorization interaction with one
  `account-selection` interaction containing at most 100 exact account choices
- **AND** each account-selection interaction expires five minutes after it is
  issued
- **AND** each choice contains an account id matching
  `[A-Za-z0-9][A-Za-z0-9._-]{0,127}` and an optional name of at most 256
  characters
- **AND** secret material remains only under ignored workspace secret state

#### Scenario: Select an account

- **WHEN** the browser answers the current account-selection interaction
- **THEN** the request contains only the matching interaction id, kind
  `account-selection`, and one account id from the interaction's exact choices
- **AND** Gateway rejects unlisted, malformed, stale, duplicate, or expired
  choices without rerunning provider discovery
- **AND** the local credential adapter persists the selected account and resumes
  the same Push

#### Scenario: Interaction expiry

- **WHEN** the current interaction expires before its continuation completes
- **THEN** current Push becomes failed with `interaction-expired`, the
  continuation and account choices are discarded, and the terminal Push becomes
  latest
- **AND** a late answer returns transport code `interaction-expired` without
  changing latest Push

#### Scenario: Authorization URL validation

- **WHEN** the Formless Cloudflare credential adapter produces an authorization
  URL
- **THEN** the adapter validates HTTPS origin `https://dash.cloudflare.com`,
  path `/oauth2/auth`, the Formless client id, redirect URI, requested scopes,
  and current PKCE/state facts before yielding the interaction
- **AND** Gateway independently rejects any non-HTTPS or non-Cloudflare URL
  before registry storage
- **AND** unexpected URLs, raw logs, diagnostics, and secret-looking values are
  never browser responses

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
- **AND** the browser receives only exact Push lifecycle, phase, outcome,
  failure-code, and interaction contracts
- **AND** Push may patch the target deployment config's exact semantic
  observation cache after deploy or failure
- **AND** deployment diagnostics, evidence, drift reports, cleanup audit data,
  and observation record payloads do not enter Gateway responses

#### Scenario: Push dry-run stays read-only

- **WHEN** a browser starts Push dry-run through Gateway
- **THEN** typed Push planning may read current target and deployment facts
- **AND** it does not patch deployment config observation cache fields

#### Scenario: Secret rejection

- **WHEN** workspace source, Push input, typed execution output, or adapter
  diagnostics include
  provider API tokens, Cloudflare OAuth access tokens, Cloudflare OAuth refresh
  tokens, Alchemy passwords, Alchemy state tokens, raw lease tokens, owner setup
  tokens, or automation admin tokens
- **THEN** owning source and runtime adapters reject secret values before
  writing reviewable source
- **AND** Gateway constructs responses only from exact typed facts and never
  recursively sanitizes arbitrary execution objects

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
  exact Gateway route intent, validates shared runtime topology eligibility and
  configured sidecar target availability, validates that the configured gateway
  route can satisfy requirements that need sidecar execution, and proxies the
  request to the configured sidecar over HTTP
- **AND** the Worker does not read or write workspace source files, Push registry
  state, local secret state, or provider credentials

#### Scenario: Worker gateway unavailable without sidecar

- **WHEN** a Worker runtime receives a workspace gateway API request without
  `FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL` and
  `FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN`
- **THEN** the gateway route is unavailable
- **AND** no workspace filesystem, credential, Cloudflare, Alchemy, or provider
  mutation behavior is reachable
