# Formless CLI Specification

## Purpose

Formless CLI behavior lets a local Formless workspace run, save, sync, and
manage selected instance access.

## Requirements

### Requirement: Formless CLI Capability Naming

The system SHALL describe the public CLI capability as the Formless CLI rather
than as an app-specific publish CLI.

#### Scenario: Capability path and title

- GIVEN canonical capability specs describe the public `formless` command
- WHEN the CLI capability is referenced by agents, docs, change metadata, or
  validation output
- THEN the capability name is `formless-cli`
- AND the spec title is Formless CLI
- AND legacy app-specific publish capability names are not used for new change
  metadata or shipped spec references

#### Scenario: Source module names are not the CLI contract

- GIVEN the current implementation may still live under a historical source
  directory name
- WHEN users run the package CLI or specs describe command behavior
- THEN the externally supported command remains `formless`
- AND the implementation directory name is not part of the public CLI contract
- AND moving source modules is a mechanical cleanup that can happen separately
  from the capability rename

### Requirement: CLI Command Families

The package SHALL expose top-level `formless` command spellings only for
workspace operations that are promoted to public CLI bindings.

#### Scenario: Local workspace commands

- **GIVEN** the package CLI is installed
- **WHEN** a user runs `formless dev`, `formless pull`, `formless push`, or
  `formless destroy`
- **THEN** the command operates on the local Formless workspace selected by
  `formless.ts`
- **AND** `formless dev` and `formless pull` do not mutate remote instance data
  or Cloudflare resources unless `formless pull` is run without `--dry-run`, in
  which case it rewrites reviewable workspace record state and media without
  rewriting `formless.ts`
- **AND** `formless push` is the only normal command that reconciles a deployed
  instance from local workspace source, including runtime code, provider
  resources, control-plane records, app records, schema, and media
- **AND** `formless destroy` remains the explicit Cloudflare teardown boundary
- **AND** `formless pull` and `formless push` are the first public CLI bindings
  selected by Formless CLI for workspace operation definitions
- **AND** the workspace source save operation remains part of the workspace
  operation contract but has no public CLI command binding in this phase
- **AND** Formless CLI owns public command names, option syntax, terminal help
  labels, and dispatch behavior for public CLI bindings

#### Scenario: Sync dry-runs

- **GIVEN** the package CLI is installed
- **WHEN** a user runs `formless push --dry-run`, `formless push --force
--dry-run`, or `formless pull --dry-run`
- **THEN** the command reports the source, target, and high-level changes that
  would be synchronized
- **AND** it does not mutate local source, remote instance data, Cloudflare
  resources, or Alchemy state
- **AND** if source and target are already equivalent and no forced deployment
  or runtime rebuild is requested, it reports `Everything up to date.`
- **AND** the no-op message is the exact command output and is not accompanied
  by sync plan, drift, deploy, migration, retry, or warning text

#### Scenario: Forced push deployment

- **GIVEN** the package CLI is installed and local workspace source already
  matches the selected deployed instance data
- **WHEN** a user runs `formless push --force`
- **THEN** the command reconciles the deployment provider graph, including the
  Worker runtime
- **AND** it does not restore archive data when the source comparison is already
  up to date
- **AND** `formless push --force --dry-run` reports the forced runtime deployment
  as available without mutating local source, remote instance data, Cloudflare
  resources, or Alchemy state

#### Scenario: Forced push recovery from invalid remote source

- **GIVEN** the package CLI is installed and local workspace source can be
  composed into a valid instance archive
- **AND** the selected remote target's current instance archive cannot be parsed
  or validated because remote app or control-plane records are incompatible
  with the current schema
- **WHEN** a user runs `formless push --force`
- **THEN** the command may bypass normal remote sync comparison for that target
  validation failure
- **AND** it reconciles the selected remote target as an exact replacement from
  the validated local workspace archive
- **AND** invalid remote record values are not merged into, preserved in, or
  written back to local workspace source or the replacement archive
- **AND** the command reports that ordinary remote comparison, restore dry-run,
  or backup evidence was unavailable when target validation prevented producing
  it
- **AND** auth failures, network failures, provider failures, unsupported
  packages, invalid local workspace source, and invalid local archives still
  fail before target mutation
- **AND** `formless push --force --dry-run` remains read-only and reports that
  forced recovery would replace the unreadable target without mutating local
  source, remote instance data, Cloudflare resources, or Alchemy state

#### Scenario: Unsupported command families

- **GIVEN** the package CLI is installed
- **WHEN** a user runs a command with no public CLI binding
- **THEN** the command is handled by ordinary unsupported-command behavior
- **AND** provider, Authority, filesystem, deploy adapter, command, and state
  mutation code is not run for the unsupported command name

#### Scenario: Owner setup command

- **GIVEN** the package CLI is installed and a Formless instance workspace has a
  selected deployed target
- **WHEN** a user runs `formless owner setup ... [--open]`
- **THEN** the CLI reads the selected target owner setup status before minting a
  setup capability
- **AND** the CLI resolves the setup origin from the configured auth origin
  reported for that target when one exists
- **AND** the CLI keeps the reported preferred admin origin separate from the
  setup origin
- **AND** if no configured auth origin is reported, the CLI uses the selected
  deployment host as the setup origin
- **AND** if owner setup is incomplete, the CLI uses the selected admin token
  source to create one owner setup capability by posting to
  `/api/formless/setup/capability` on the setup origin and displays the
  intended `/formless/auth/setup?token=...` URL on the same setup origin
- **AND** if a configured auth origin is reported but capability creation on
  that origin fails, the CLI fails clearly without retrying capability creation
  on the deployment host
- **AND** if `--open` is present, the CLI opens only that intended setup URL
  after capability creation succeeds
- **AND** if owner setup is already complete, the CLI reports the existing owner
  state without minting a setup token, creating a capability, or opening a
  browser
- **AND** when a preferred admin origin is reported, owner setup output uses it
  for browser-visible admin continuation links instead of the workers.dev
  deployment target URL
- **AND** the admin token is not displayed and the setup token is displayed only
  as part of the intended setup URL

#### Scenario: Token commands

- **GIVEN** an instance workspace needs automation write access
- **WHEN** a user runs `formless token adopt` or `formless token rotate`
- **THEN** ignored workspace secret state stores the automation admin token
- **AND** reviewable workspace source does not store the secret

### Requirement: Bun-Native Package Executable

The package SHALL execute the Formless CLI directly from its TypeScript source
under Bun without producing a generated CLI JavaScript bundle during package
preparation.

#### Scenario: Installed package execution

- **GIVEN** Bun is installed and available on the user's executable path
- **AND** the Formless package and its runtime dependencies are installed
- **WHEN** the user invokes the package executable as `formless` or through
  `bunx @dpeek/formless`
- **THEN** the package executable selects Bun through its executable header
- **AND** Bun transpiles and executes the TypeScript CLI source at runtime
- **AND** package preparation, publishing, and installation do not require a
  generated CLI JavaScript bundle
- **AND** Node.js without Bun is not a supported Formless CLI runtime

#### Scenario: Runtime build boundaries remain separate

- **GIVEN** the package executable itself does not require a preparation build
- **WHEN** a command needs browser, Worker, deployment, or workspace runtime
  artifacts
- **THEN** the command may still build those artifacts as part of its declared
  operation
- **AND** those runtime builds are not treated as compilation of the package
  executable

#### Scenario: Installed package contains the runtime build host

- **GIVEN** the Formless package is installed outside the source monorepo
- **WHEN** `formless dev`, `formless push`, or another declared operation starts
  a browser or Worker build
- **THEN** the installed package contains the TypeScript CLI, package-owned
  runtime Vite configuration, browser shell, Worker configuration and
  entrypoints, and runtime source and assets required by that build
- **AND** Vite+ and the runtime build plugins and adapters used by the operation
  are direct installed runtime dependencies rather than monorepo-only or
  development-only dependencies
- **AND** the operation invokes the package-local Vite+ executable from the
  installed Formless package root
- **AND** tests, fixtures, and files not required by the installed runtime are
  excluded from the published package payload

#### Scenario: Verify a packed Formless installation

- **GIVEN** release tarballs are installed with Bun in an isolated workspace
  without monorepo dependency hoisting
- **WHEN** release verification invokes the CLI and its runtime build setup
- **THEN** CLI help executes directly from the published TypeScript source
- **AND** the bundled browser and Worker production build succeeds with the
  default published renderer
- **AND** a production build succeeds with trusted workspace browser and Worker
  renderer extensions
- **AND** no operation resolves unpublished monorepo source or undeclared
  development dependencies

### Requirement: Workspace Operation Definitions

The workspace package SHALL own runtime-neutral workspace operation definitions
that describe the operation contract before any CLI, browser gateway, runner, or
local execution binding handles it.

#### Scenario: Operation definition source

- **WHEN** the workspace package declares a workspace operation
- **THEN** the definition includes a target-prefixed canonical key, label, input
  fields, defaults, actor policy, read or write mode, bootstrap availability,
  display-safe input summary, gateway binding, required execution capability,
  and semantic execution requirements
- **AND** the definition includes a stable execution handler key that may match
  the canonical operation key
- **AND** operation kind allowlists, browser-visible operation sets, gateway
  mutating intent, bootstrap intent, and display input summaries are derived from
  the definitions
- **AND** duplicated semantic operation metadata is not maintained separately in
  CLI, gateway, or instance shell code
- **AND** the workspace package does not declare concrete public CLI command
  spellings such as `formless pull`

#### Scenario: Execution requirement vocabulary

- **WHEN** a workspace operation declares execution context requirements
- **THEN** each requirement is a string literal selected from
  `workspace-source-read`, `workspace-source-write`, `local-filesystem`,
  `local-authority`, `admin-token`, `remote-target`, and
  `provider-credentials`
- **AND** requirements describe execution context needed by the operation body,
  not actor authorization, route syntax, command syntax, or transport policy
- **AND** owner sessions, bootstrap tokens, CSRF proofs, admin bearer
  authentication, sidecar URLs, HTTP request paths, CLI command names, option
  names, and terminal help labels are not execution requirements
- **AND** an operation may have base requirements from its definition and
  effective requirements derived from validated input before execution

#### Scenario: Base operation execution requirements

- **WHEN** workspace operation definitions are read
- **THEN** workspace init requires `local-filesystem` and
  `workspace-source-write`
- **AND** workspace status requires `local-filesystem` and
  `workspace-source-read`, with `remote-target` and `admin-token` required only
  when target-backed remote status is requested or selected
- **AND** workspace source check requires `local-filesystem` and
  `workspace-source-read`, with `remote-target` and `admin-token` required only
  when a selected remote target is checked
- **AND** workspace source save requires `local-filesystem`,
  `workspace-source-read`, `workspace-source-write`, and `local-authority`
- **AND** workspace source pull requires `local-filesystem`,
  `workspace-source-read`, `workspace-source-write`, `remote-target`, and
  `admin-token`
- **AND** workspace source push requires `local-filesystem`,
  `workspace-source-read`, and `remote-target`, with `admin-token`,
  `provider-credentials`, and `workspace-source-write` added as effective
  requirements for apply, provider reconciliation, or local writeback phases
- **AND** credential setup requires `local-filesystem`,
  `workspace-source-read`, `workspace-source-write`, and
  `provider-credentials`
- **AND** deployment refresh requires `local-filesystem`,
  `workspace-source-read`, `remote-target`, and `admin-token`

#### Scenario: Definition and handler boundary

- **WHEN** a workspace operation is executed locally or through a gateway actor
- **THEN** the operation definition remains the source of semantic metadata,
  input shape, actor policy, mode, required execution capability, execution
  requirements, and gateway binding
- **AND** operation handler implementations remain grouped by execution domain
  such as workspace status, workspace source sync, credential setup, and
  deployment
- **AND** the first implementation does not require moving all operation bodies
  into one shared operation module

#### Scenario: CLI workspace implementation domains

- **WHEN** Formless CLI implements local workspace operation bodies and direct
  local workspace commands
- **THEN** workspace source sync behavior is owned by source-sync implementation
  modules that read and write reviewable workspace source, validate app and
  media state, compose portable archive sync payloads, compare source and
  target state, and apply pull, save, check, and push data results
- **AND** deployment refresh, deployment planning, provider reconciliation,
  deployment observation writes, deploy-state reads and writes, destroy provider
  teardown, and deployment step vocabulary are owned by deployment
  implementation modules
- **AND** workspace target and context resolution are owned by focused helpers
  that select workspace roots, deployment-config records, target URLs, admin
  bearer context, and display-safe target facts without owning source sync,
  provider mutation, or terminal formatting bodies
- **AND** provider credential resolution is owned by credential helpers that
  expose selected account and provider bearer facts through narrow interfaces
  without exposing OAuth token storage, browser authorization flows, ignored
  secret files, or provider profile details to source sync, gateway, or
  terminal formatting code
- **AND** broad compatibility entrypoints may remain as thin facades while CLI
  callers, operation handlers, and tests move to domain modules
- **AND** domain modules have focused tests for operation-body behavior, while
  CLI and gateway integration tests cover binding, authorization, routing, and
  display-safe progress boundaries

#### Scenario: CLI workspace operation runner boundary

- **WHEN** Formless CLI, local gateway, auto-save, or CLI runtime adapter code
  starts a workspace operation
- **THEN** the CLI workspace operation runner owns actor, capability, and
  execution requirement checks, workspace root resolution, operation id
  creation, display-safe input capture, queued/running/succeeded/failed
  operation state transitions, log and error persistence, result persistence,
  and result redaction
- **AND** operation body selection is delegated to operation-domain
  implementations keyed by the workspace operation definition's handler key
- **AND** the runner interface does not require deployment provider, credential
  setup, health check, owner setup, package build, local secret environment, or
  token-generation dependencies for operations whose effective execution
  requirements do not need them
- **AND** push dry-runs that do not perform apply, provider reconciliation, or
  local writeback are not required to provide provider mutation dependencies
- **AND** deployment step ids, deployment step labels, and domain-specific
  operation summaries are emitted by deployment or source-sync handlers rather
  than by the generic runner

#### Scenario: Formless CLI binding from operation definition

- **WHEN** the CLI exposes a workspace command for a defined operation
- **THEN** command names, option spellings, option ordering, terminal help
  labels, terminal descriptions, and dispatch behavior are declared in a Formless
  CLI-owned binding table keyed by workspace operation kind or canonical key
- **AND** command arguments and defaults are selected from the operation input
  contract and the Formless CLI binding table
- **AND** each workspace operation promoted to the public CLI has one CLI
  binding name
- **AND** the command invokes the same workspace operation contract with actor
  `cli`, either through direct local execution or through a gateway, API,
  sidecar, or runtime endpoint selected by Formless CLI from available execution
  context
- **AND** execution may continue to dispatch to existing local workspace
  functions while the operation definition remains the source of semantic input,
  actor policy, mode, required capability, execution requirements, and
  display-safe input facts
- **AND** the first public CLI operation bindings are `formless pull` and
  `formless push`
- **AND** public pull bindings expose only `--workspace`, `--target`, and
  `--dry-run` inputs
- **AND** public push bindings expose only `--workspace`, `--target`,
  `--dry-run`, and `--force` inputs
- **AND** the workspace source save operation may be invoked by local runtime,
  auto-save, or gateway flows without exposing `formless save`
- **AND** public CLI operation definitions do not expose save, apply, replace,
  stale acknowledgement, install-set replacement, deploy plan/apply, or
  migration policy inputs

#### Scenario: CLI command adapter boundary

- **WHEN** Formless CLI dispatches a parsed public command
- **THEN** top-level CLI entrypoints assemble process dependencies and select
  the command family without owning workspace operation input translation,
  operation execution, terminal preflight prompts, or workspace operation
  result formatting
- **AND** CLI command adapter modules translate parsed command values into
  workspace operation inputs selected from the operation definition and CLI
  binding table
- **AND** CLI command adapter modules invoke workspace operations with actor
  `cli`, CLI execution capabilities, and CLI-owned dependency assembly without
  bypassing the workspace operation runner
- **AND** CLI terminal preflight for provider credentials, browser opening,
  account selection, and non-interactive guidance stays in CLI command adapter
  modules before provider mutation begins
- **AND** provider credential helpers continue to own OAuth credential storage,
  token refresh, selected-account facts, and provider bearer resolution behind
  narrow interfaces
- **AND** CLI terminal formatters own command output strings, no-op output,
  operation summaries, display-safe field rendering, path rendering, and
  command-specific result text
- **AND** operation-domain modules emit display-safe operation results and
  summaries but do not own public CLI command spelling, terminal prompts, or
  terminal output layout
- **AND** Gateway adapters and local runtime proxy code do not own CLI command
  parsing, terminal preflight prompts, terminal output layout, or direct CLI
  dependency assembly

#### Scenario: Operation output formatting boundary

- **WHEN** Formless CLI reports workspace operation output, direct workspace
  command results, owner setup results, token command results, destroy results,
  paths, selected targets, display-safe fields, or no-op output
- **THEN** CLI formatter modules own the terminal strings, line ordering,
  display-safe value rendering, path rendering, selected-target rendering,
  command-specific result text, and exact no-op output
- **AND** top-level CLI dispatch logs formatted output without constructing
  command result strings inline
- **AND** operation-domain modules return display-safe summaries, details,
  steps, deployment facts, cleanup facts, target facts, and result objects but
  do not own terminal layout, punctuation, path relativity, or public command
  output wording
- **AND** direct command formatters use the same shared CLI formatting helpers
  as workspace operation formatters for display-safe values, selected targets,
  relative paths, and optional fields
- **AND** formatter tests own exact terminal string rendering while CLI command
  integration tests cover dispatch, dependency wiring, behavior, and secret
  redaction without duplicating every formatter case

#### Scenario: Local workspace operation test topology

- **WHEN** local workspace operation behavior is covered by tests
- **THEN** operation-domain suites own source sync, deployment refresh,
  deployment planning, provider reconciliation, destroy, credential setup,
  target/context resolution, and display-safe operation result construction at
  operation-body level
- **AND** CLI command integration suites keep representative coverage for
  command parsing and binding, dependency assembly, terminal preflight,
  account selection, runner invocation, no-op behavior, redaction boundaries,
  and public command behavior without duplicating each domain branch
- **AND** Gateway runtime integration suites own transport authorization,
  proxy and sidecar routing, operation id scoping, browser-visible state
  redaction, and auto-save enqueue/read behavior without asserting source sync
  or deployment execution internals
- **AND** formatter suites own exact terminal strings, line ordering, labels,
  path rendering, and display-safe value rendering for direct command and
  workspace operation output
- **AND** shared operation fixtures may be composed from domain-level helpers
  only when dependencies remain explicit and CLI or Gateway suites do not become
  the owner of operation-body behavior

#### Scenario: Provider credential boundary for deployment execution

- **WHEN** Formless CLI plans, applies, refreshes, or destroys a
  provider-backed workspace deployment
- **THEN** provider credential modules own deployment credential source
  selection, Cloudflare account resolution, OAuth credential reads and refresh,
  manual provider token fallback, and provider bearer material
- **AND** deployment implementation modules request a deployment credential
  context through a narrow CLI-owned interface that returns only display-safe
  selected account facts, credential reference or profile facts, and provider
  bearer material needed by provider adapters
- **AND** deployment implementation modules pass provider bearer material to
  deploy, destroy, health-check, and route-provider cleanup adapters without
  reading OAuth secret records, browser authorization callbacks, ignored
  credential files, provider profile files, or Cloudflare API token environment
  variables directly
- **AND** read-only planning and dry-run paths may use display-safe account and
  credential facts without refreshing or exposing provider bearer values
- **AND** deployment operation state, summaries, deploy state, workspace
  manifests, archives, browser-visible records, and terminal output do not
  expose OAuth tokens, manual provider API tokens, refresh tokens, or raw
  provider credential records
- **AND** credential onboarding, browser authorization, terminal account
  selection, and non-interactive credential guidance remain outside deployment
  execution and complete before provider mutation begins

#### Scenario: Gateway binding from operation definition

- **WHEN** a browser or automation caller starts a workspace operation through
  the same-origin gateway API
- **THEN** the gateway parses allowed request fields, defaults, read/write mode,
  bootstrap eligibility, required actor policy, required capability, and
  execution requirements from the operation definition
- **AND** forbidden secret-looking, path-like, raw provider state, or shell
  command inputs remain rejected before execution
- **AND** unsupported operations are rejected because no browser gateway binding
  is declared, not because a separate gateway-only enum omits them

#### Scenario: Local gateway runtime operation adapter boundary

- **WHEN** Formless CLI supplies operation handlers to the local workspace
  gateway sidecar
- **THEN** CLI runtime operation adapter modules own workspace root scoping,
  operation runner invocation, actor and capability forwarding, operation state
  reads, auto-save scheduling, and auto-save suppression decisions
- **AND** Gateway package adapters continue to own transport authorization,
  route parsing, sidecar proxy request and response shape, and browser-visible
  response wrapping without owning local workspace operation execution
- **AND** local gateway lifecycle code may start sidecars and assemble process
  environment facts without owning operation handler dependency projection,
  operation body dispatch, operation state persistence, or auto-save execution
- **AND** operation-domain modules continue to own source sync, credential setup,
  deployment, provider reconciliation, and summary vocabulary behind the runner
- **AND** runtime operation adapters do not own public CLI command parsing,
  terminal formatting, OAuth browser flows, provider secret storage, runtime
  topology definitions, or owner session cookie validation logic

### Requirement: TypeScript Workspace Configuration

The CLI SHALL select one trusted downstream-owned `formless.ts` module as the
single Formless configuration entrypoint for a workspace.

#### Scenario: Author typed workspace configuration

- **GIVEN** a downstream workspace owns `formless.ts`
- **WHEN** it declares Formless configuration
- **THEN** the module default-exports `defineConfig({ name: "workspace-name" })`
  using `defineConfig` from `@dpeek/formless`
- **AND** `name` is required, explicit, and stable when the workspace directory
  moves
- **AND** current workspace configuration keeps the existing `state`, `media`,
  `local`, `packages`, and `runtime` nesting
- **AND** configuration kind and version, workspace state root, media root, ignored
  local state root, ignored secret state root, empty package links, and bundled
  runtime behavior have defaults
- **AND** the author specifies only `name` and values that differ from those
  defaults
- **AND** the module may import project-local TypeScript modules so one
  configuration entrypoint can be split without automatic discovery or a
  registry

#### Scenario: Author one explicit workspace Program

- **GIVEN** a downstream workspace needs domain modules in its Program
- **WHEN** trusted `formless.ts` composes configuration
- **THEN** it explicitly imports and orders built-in and workspace-owned Program
  schema modules through documented package boundaries
- **AND** it declares one complete Program composition with root-owned roles,
  navigation, paths, and deliberate replacements
- **AND** it does not paste independent schema JSON into configuration, link the
  domain as a runtime-installed package, discover modules automatically, or
  fetch modules remotely

#### Scenario: Discover and load workspace configuration

- **WHEN** a CLI command selects a workspace without an explicit workspace path
- **THEN** discovery walks upward for the nearest exact `formless.ts`
- **AND** an explicit workspace path selects the exact `formless.ts` at that
  workspace root
- **AND** the Bun-native CLI evaluates the TypeScript module as trusted local
  code and reads its default-exported configuration object
- **AND** the CLI resolves omitted configuration values to their defaults
  before workspace consumers use them
- **AND** discovery does not select alternate configuration filenames
- **AND** TypeScript evaluation is limited to trusted local configuration and
  build/materialization time rather than Worker request handling

#### Scenario: Keep operational configuration invariants

- **WHEN** resolved configuration selects workspace write roots, linked package
  manifests, or runtime extension entrypoints
- **THEN** those operational consumers reject unsafe or invalid filesystem
  paths and duplicate package links before mutation or build execution
- **AND** App and Program schemas still pass through their semantic parsers and
  validators
- **AND** trusted TypeScript configuration is not parsed as JSON or recursively
  scanned as an untrusted data-file shape

#### Scenario: Preserve owner-authored configuration

- **WHEN** workspace save, check, pull, push, export, restore, auto-save, or
  reset runs
- **THEN** owner-authored `formless.ts` remains byte-for-byte unchanged
- **AND** those workflows write only the reviewable record state, schema
  provenance, and media payloads they own
- **AND** configuration never derives from Authority state or portable archive
  data

### Requirement: Local First Onboarding

The CLI SHALL start the local Formless workspace runtime through `formless dev`
before any Cloudflare account or deployment mutation, while the CLI owns fresh
workspace bootstrap and browser onboarding owns local session bootstrap,
credential setup, and push operations.

#### Scenario: Start local workspace runtime

- **WHEN** `formless dev` runs for an empty workspace root
- **THEN** the CLI writes a base `formless.ts` configuration with an explicit
  workspace name, prepares
  ignored `.formless/local` state, persists local dev secrets, and mints
  process-scoped local session, gateway proxy, gateway CSRF, and sidecar tokens
  before the product instance runtime starts
- **AND** local gateway lifecycle code owns sidecar creation, process token
  minting, child runtime gateway environment assembly, browser session
  entrypoint creation, and sidecar shutdown
- **AND** workspace configuration bootstrap, package resolution, local Authority
  bootstrap, operation execution, and auto-save scheduling remain outside the
  local gateway lifecycle code
- **AND** the CLI does not create empty storage snapshot or media directories
- **AND** no route, deployment config, Cloudflare resource,
  Alchemy resource, provider credential, or remote instance is created
- **AND** the workspace name defaults from the selected directory unless
  interactive confirmation supplies another valid name
- **AND** the selected name is written explicitly to `formless.ts` and is not
  inferred again when later commands load the configuration

#### Scenario: Start existing local workspace runtime

- **WHEN** `formless dev` runs for a config-only workspace or workspace
  source with storage snapshots and media payloads
- **THEN** the product instance runtime starts with workspace-local persistence
- **AND** the CLI materializes the complete Program from trusted downstream
  `formless.ts` composition before the Worker starts
- **AND** first-run local runtime state starts from workspace storage snapshots
  and media payloads when present
- **AND** the browser can complete onboarding before any Cloudflare deploy
- **AND** before a local owner session is established, the browser can only read
  gateway status through bootstrap authorization and exchange a CLI-minted local
  session bootstrap token for an owner session
- **AND** save, credential setup, push dry-run, and push apply
  entry points are available through browser-owned local runtime flows
  after local session bootstrap
- **AND** deployed canonical and auth origins preserved in workspace
  control-plane source do not govern local auth routing, passkeys, sessions, or
  redirects
- **AND** the local runtime uses the child dev server origin selected at startup
  or forwarded named-proxy origin as its browser-facing auth origin

#### Scenario: Open authenticated local session

- **WHEN** a user runs `formless dev --open`
- **THEN** the CLI prints and opens the same same-origin local session
  bootstrap URL for the running local workspace runtime
- **AND** successful bootstrap issues an owner session cookie and redirects the
  browser to the instance shell

#### Scenario: Print authenticated local session entrypoint

- **WHEN** `formless dev` runs for humans, agents, or dev supervisors
- **THEN** the CLI prints the local session bootstrap URL as a plain URL line
- **AND** when the dev server is wrapped by a named local proxy, the printed and
  opened browser URLs use the proxy origin while internal readiness probes may
  continue using the child dev server origin
- **AND** the printed bootstrap URL contains only the process-scoped local
  session bootstrap token and never prints the admin bearer token, owner session
  signing secret, gateway proxy token, gateway CSRF token, provider credential,
  raw filesystem path outside the workspace, or deploy secret
- **AND** lifecycle code keeps the child runtime's server-only gateway facts
  separate from browser-visible Vite facts before the URL is printed or opened
- **AND** the bootstrap URL is useful for a browser or agent to obtain an owner
  session and then navigate the named local instance origin

#### Scenario: Reset local workspace runtime state

- **WHEN** `formless dev --reset` runs for a selected workspace
- **THEN** before serving the local runtime it removes and recreates only the
  ignored local runtime state root used for dev server persistence, local dev
  secrets, local dev metadata, and local Wrangler state
- **AND** it preserves reviewable workspace source, package links, storage
  snapshots, media payloads, deployment secret state, provider credentials, and
  remote instance state
- **AND** the same `formless dev --reset` start can rebuild local Authority
  state from workspace storage snapshots and media payloads when present
- **AND** the printed local session bootstrap URL includes a reset request so
  browser-context Formless replica caches are reset before a fully fresh agent
  browser session enters the instance shell

#### Scenario: Reject missing linked package source

- **GIVEN** `formless.ts` `packages.links` points at a missing or invalid
  package manifest or source schema
- **WHEN** `formless dev`, `formless push`, or a workspace
  operation builds the active package resolver
- **THEN** the command fails before starting local runtime mutation, remote
  mutation, sync planning, or provider mutation
- **AND** the error identifies the invalid package link path and validation
  reason without exposing secrets

#### Scenario: Push a Program without optional domain records

- **WHEN** a local owner opens the sync flow before optional domain records exist
- **THEN** credential setup, push dry-run, and push apply remain available
  through the browser-owned local runtime flow
- **AND** push publishes one complete materialized Program artifact and its
  current Program snapshot

### Requirement: Runtime Build Config Boundary

The CLI SHALL keep monorepo quality tooling configuration separate from the
bundled Worker and browser runtime build setup used by local dev and push.

#### Scenario: Runtime build setup owns Worker and browser facts

- **WHEN** `formless dev`, `formless push`, or package build starts the bundled
  runtime build
- **THEN** Worker entrypoint, Cloudflare Worker configuration, browser shell
  entrypoint, public Site client entrypoint, runtime extension virtual modules,
  runtime environment injection, and browser asset output facts are resolved
  through package-owned runtime build setup
- **AND** monorepo quality tooling configuration does not own Worker or browser
  runtime build facts
- **AND** Cloudflare Worker configuration lives under Worker-owned runtime
  source and is passed to runtime build setup explicitly instead of relying on
  root repository file discovery
- **AND** the browser shell asset remains emitted and served as `/index.html`
- **AND** the public Site client manifest remains emitted and served as
  `/assets/formless-client-manifest.json`
- **AND** workspace-relative runtime extension paths are resolved during build
  setup rather than stored as app data, deployment intent, package app source,
  or Worker runtime bindings
- **AND** browser runtime extensions share singleton React and React DOM modules
  with the browser runtime even when their workspace source resolves through a
  different physical package installation
- **AND** build setup materializes and injects one data-only complete workspace
  Program artifact and canonical provenance for local dev and deployed Worker
  startup
- **AND** Worker request handling loads that artifact without importing or
  evaluating workspace TypeScript

### Requirement: Workspace Save From Local Authority

The local workspace operation layer SHALL save local workspace runtime state
from Authority-backed instance state back to reviewable workspace storage
snapshots and media payloads.

#### Scenario: Save local workspace state

- **WHEN** the workspace source save operation runs for a local Formless
  workspace
- **THEN** media payloads and schema-owned Program state are written to the
  deterministic Program workspace snapshot
- **AND** Task, Site, and CRM records are written through the Program snapshot
  in `state/instance.json`
- **AND** no package or install identity produces `state/apps/<installId>.json`
- **AND** browser IndexedDB state is not used as the source of truth
- **AND** secrets are not written to `formless.ts`, storage snapshots, or
  media files

#### Scenario: Runtime-installed app workflows are absent

- **WHEN** CLI archive, workspace, reset, deploy, or source synchronization
  selects runtime state
- **THEN** it does not select any package app key or install id as a target
- **AND** it does not read, write, reset, migrate, import, or export an
  `app:<installId>` Authority
- **AND** Task, Site, and CRM data participates only through the complete Program
  snapshot and Program source hash

#### Scenario: Auto-save local workspace state

- **WHEN** a local workspace runtime with a gateway sidecar receives a
  committed browser-originated local write
- **THEN** workspace auto-save writes the same deterministic storage snapshots
  and referenced media payloads as the workspace source save operation
- **AND** browser IndexedDB state is not used as the source of truth
- **AND** the workspace source save operation remains available as an explicit
  local runtime or gateway flush or retry action
- **AND** remote pull, push, and destroy remain explicit CLI or gateway
  operations according to their public bindings

#### Scenario: Workspace operation state vocabulary

- **WHEN** CLI output, gateway operation state, browser workspace status, or
  tests report workspace save, check, pull, or push results
- **THEN** reviewable workspace source paths and counts are reported with
  workspace state, storage state, app state, instance state, storage snapshot,
  or media payload terminology
- **AND** archive terminology is used only when the operation exports, imports,
  restores, backs up, or composes a portable archive envelope

#### Scenario: Check workspace source

- **WHEN** the workspace source save operation runs in check mode and local
  Authority state differs from the reviewable workspace source
- **THEN** the operation fails and reports that workspace source must be refreshed
- **AND** it does not rewrite storage snapshot or media files

### Requirement: Sync Omits Upgrade Planning

The Formless CLI SHALL keep push and pull focused on synchronizing current
workspace and target state rather than running upgrade or migration policy.

#### Scenario: Push does not run upgrade planning

- WHEN `formless push` or `formless push --dry-run` runs
- THEN it does not build a CLI upgrade plan, require migration policy input,
  require backup evidence for migrations, require manual migration approval, or
  apply package app or storage migrations
- AND unsupported schema, package, runtime, or archive facts fail through the
  ordinary sync validation path
- AND migration and upgrade policy can be reintroduced later as a new explicit
  capability without preserving the removed push/deploy flags

### Requirement: Formless CLI Media Package Boundary

The system SHALL keep workspace save behavior and Formless CLI pull and push
behavior stable while consuming Media contracts from public package subpaths.

#### Scenario: Archive workflows use Media contract

- GIVEN workspace save, Formless CLI pull, or Formless CLI push workflows validate or
  move core media payloads
- WHEN they need media asset, storage key, delivery, or restore result shapes
- THEN they use public Media package contracts

#### Scenario: Existing archive behavior remains stable

- GIVEN Formless CLI workflows move referenced owned image media
- WHEN media is represented in workspace source or sync payloads
- THEN media is represented with core media objects and the `core-media-assets`
  capability
- AND records do not receive provider-specific URLs

### Requirement: Workspace Runtime Extension Config

The system SHALL allow a local Formless workspace to declare trusted
owner-authored runtime extension entrypoints through reviewable workspace source
without storing executable code configuration in app data.

#### Scenario: Runtime config in workspace configuration

- **GIVEN** a workspace `formless.ts` may contain optional runtime extension
  config
- **WHEN** the runtime extension config is read
- **THEN** the resolved workspace configuration supplies the current default
  kind and version
- **AND** runtime extension config lives under optional `runtime.extensions`
- **AND** the first supported extension point is
  `runtime.extensions["site.publicRenderer"]`
- **AND** `runtime.extensions["site.publicRenderer"]` declares explicit
  `browser` and `worker` module paths
- **AND** each module path is a local workspace-relative path
- **AND** absolute paths, URL-like paths, home-relative paths, parent traversal,
  and empty paths are rejected before local dev startup, deploy planning, sync
  planning, or provider mutation continues

#### Scenario: Runtime config is deploy-code config

- **WHEN** workspace source is saved, checked, pushed, pulled, exported, or
  restored
- **THEN** the `formless.ts` `runtime.extensions` section is treated as
  reviewable deploy-code configuration for resolving trusted workspace runtime
  extension modules
- **AND** runtime extension config is not app install intent, route intent, app
  data, Site record data, media payload, package app source data, provider
  credential state, deployment observation state, or runtime secret state
- **AND** `formless.ts` declares runtime extension module paths only inside the
  configuration-owned `runtime.extensions` section
- **AND** `formless.ts` declares package app source links only inside the
  configuration-owned `packages.links` section
- **AND** app-install, route, deployment-config, app records, package manifests,
  and runtime package payloads do not store local renderer module paths

#### Scenario: Local dev uses runtime extensions

- **WHEN** `formless dev` starts for a workspace with `site.publicRenderer`
- **THEN** the local browser preview bundle resolves the configured browser
  renderer entrypoint
- **AND** the local Worker runtime resolves the configured Worker renderer
  entrypoint
- **AND** workspace-relative renderer paths are resolved from the workspace root
  during build setup rather than exposed as Worker runtime bindings
- **AND** the browser renderer uses the same React and React DOM module
  instances as the local public Site client
- **AND** Site authoring remains the bundled generated Site admin experience
  backed by flat Site records, schema, media, public actions, and routes
- **AND** omitting `runtime.extensions["site.publicRenderer"]` from
  `formless.ts` uses the bundled Site renderer

#### Scenario: Push deploys runtime extensions

- **WHEN** `formless push` applies a workspace with runtime extensions
- **THEN** the deployed Worker bundle includes the configured trusted
  owner-authored Worker renderer entrypoint
- **AND** the deployed browser assets include the configured browser renderer
  entrypoint needed for preview or hydration
- **AND** workspace-relative renderer paths are resolved from the workspace root
  during deploy build setup rather than exposed as Worker runtime bindings
- **AND** the deployed browser renderer uses the same React and React DOM module
  instances as the public Site client rather than bundling independent hook
  dispatchers
- **AND** provider credentials, ignored local secret state, Worker secrets, and
  server-only imports remain outside public browser assets
- **AND** when runtime extensions are configured, push apply does not skip
  Worker deployment solely because app records, control-plane records, media,
  and provider resource intent are otherwise unchanged
- **AND** `formless push --dry-run` remains read-only and may report that a
  configured runtime extension means push apply can rebuild the Worker

### Requirement: Instance Workspace

The system SHALL manage reviewable Formless workspaces whose `formless.ts`
modules describe workspace layout and local configuration while instance
intent lives in schema-owned storage snapshots.

#### Scenario: Pull from remote target

- **WHEN** `formless pull` runs for a workspace targeting a remote Formless
  instance
- **THEN** target control-plane records, app storage snapshots, and media
  payloads are written into workspace source
- **AND** app storage snapshot files and media payloads absent from the target
  are removed from workspace source
- **AND** target schema, app install records, routes, deployment config intent,
  and other schema-owned control-plane records replace the corresponding local
  workspace source
- **AND** raw provider state, Alchemy state, deployment observation cache fields,
  deployment execution history, and provider evidence are not written into
  reviewable workspace source
- **AND** `formless pull --dry-run` reports the local source changes that would
  be written without rewriting workspace source
- **AND** if local workspace source already matches the target, pull reports
  `Everything up to date.`
- **AND** the no-op message is exact and is not accompanied by sync plan, drift,
  deploy, migration, retry, or warning text
- **AND** pull and push select the remote HTTP origin from an enabled
  `deployment-config.targetUrl` record rather than `formless.ts`

#### Scenario: Push to remote target

- **WHEN** `formless push` runs with ready workspace source
- **THEN** it reconciles the selected remote target so remote runtime code,
  provider resources, control-plane records, app records, schema, and media
  match local workspace source
- **AND** if the target already matches workspace source and deployment desired
  state, push exits without restore or provider mutation and reports
  `Everything up to date.`
- **AND** the no-op message is exact and is not accompanied by sync plan, drift,
  deploy, migration, retry, or warning text
- **AND** `formless push --dry-run` reports the sync plan without mutating local
  source, remote data, Cloudflare resources, or Alchemy state
- **AND** `formless push --dry-run` does not start credential onboarding, open a
  provider authorization URL, wait for a localhost OAuth callback, write ignored
  credential secret state, or rewrite deployment intent
- **AND** push trusts the local workspace as the selected source and does not
  refuse because the remote target differs from it

#### Scenario: Schema-changing push apply

- **GIVEN** a local workspace source validates as a complete instance archive
- **AND** the selected remote target is readable but was deployed with different
  package source schemas, package facts, or active app schemas
- **WHEN** `formless push` applies that workspace source
- **THEN** the command keeps the local workspace source as the selected desired
  state and does not reject solely because the target's current runtime cannot
  validate the replacement archive's source schema facts
- **AND** it reconciles the runtime and provider graph needed for the local
  workspace source before treating target restore dry-run results as final
- **AND** it validates the composed archive restore against the selected target
  runtime before mutating remote control-plane records, app records, app schemas,
  or media
- **AND** restore validation failures that remain after runtime reconciliation
  fail before remote data mutation
- **AND** invalid local workspace source, invalid local archives, auth failures,
  network failures, provider failures, and unsupported packages still fail
  before remote data mutation

### Requirement: Push Provider Reconciliation

The system SHALL keep push and destroy credential-scoped while making projected
deployment resource graphs the only normal provider mutation input for
workspace-controlled deployment intent.

#### Scenario: First workspace push

- **GIVEN** a local Formless workspace has saved workspace source and no remote
  target
- **WHEN** `formless push` runs with a validated Formless-owned Cloudflare
  OAuth credential reference available to the CLI or trusted local deployer
- **THEN** the deployment uses the instance runtime profile
- **AND** the deployment does not require installed app records or app storage
  snapshots
- **AND** display-safe target facts are copied to ignored `.formless/` deploy
  state
- **AND** the deployer refreshes the Formless-owned Cloudflare OAuth access
  token just in time before provider mutation
- **AND** the fresh access token is passed to Alchemy as an external bearer
  token through `apiToken` or `CLOUDFLARE_API_TOKEN`
- **AND** Formless-owned OAuth credentials are not written to Alchemy OAuth
  profiles or browser-visible records
- **AND** provider credentials, OAuth refresh tokens, Alchemy secrets,
  automation admin tokens, and owner setup tokens are stored only under ignored
  secret state
- **AND** when push creates an owner setup capability, CLI output displays
  the intended owner setup URL for passkey-backed first-owner setup
- **AND** workspace source is restored or pushed through runtime APIs before
  remote data mutation is considered complete
- **AND** Worker, Durable Object, R2, DNS, and custom-domain resources are
  reconciled through tracked Alchemy desired state as an internal push deploy
  step
- **AND** Worker upload, R2, Turnstile, route-derived custom-domain resources,
  DNS resources, tracked Alchemy state, and domain cleanup runners receive the
  refreshed token through explicit provider options when a Formless-owned
  credential reference is used
- **AND** redirect source hosts are reconciled as Worker custom-domain
  resources in the internal push deploy step

#### Scenario: CLI push onboards Cloudflare credentials

- **GIVEN** a local Formless workspace has saved workspace source
- **AND** the selected deployment config has no usable Formless-owned
  Cloudflare OAuth credential reference, references missing ignored local
  credential state, or still names an Alchemy profile credential reference
- **WHEN** `formless push` runs without `--dry-run`
- **THEN** the CLI starts Formless-owned Cloudflare OAuth before provider
  reconciliation
- **AND** it prints the Cloudflare authorization URL, attempts to open that URL
  in the user's browser, and waits for the expected localhost OAuth callback
- **AND** if one accessible Cloudflare account is visible, that account is
  selected
- **AND** if multiple accessible Cloudflare accounts are visible in an
  interactive terminal, the CLI presents a display-safe terminal account
  selection using account id, name, and workers.dev subdomain
- **AND** if multiple accounts are visible without an interactive terminal, the
  CLI fails before provider mutation with display-safe account-selection
  instructions
- **AND** OAuth access tokens, OAuth refresh tokens, expiry, granted scopes,
  and selected-account secret state are stored only under ignored local
  workspace secret state
- **AND** the selected deployment config is written or enriched with
  display-safe target id, target URL, provider family, account id, worker name,
  and `formless-cloudflare-oauth:<id>` credential reference fields
- **AND** the push continues by refreshing the selected OAuth credential just in
  time for provider mutation
- **AND** manual `CLOUDFLARE_API_TOKEN` or `CF_API_TOKEN` environment values
  are not copied into deployment config, deploy state, archives, operation
  state, or reviewable workspace source as part of normal onboarding

#### Scenario: Route removal pushes provider deletion

- **GIVEN** workspace source no longer contains an enabled route that previously
  projected custom-domain or DNS provider resources
- **WHEN** `formless push` runs with a validated Formless-owned Cloudflare
  OAuth credential reference and ignored deploy state available
- **THEN** the CLI or trusted local deployer omits those resources from tracked
  Alchemy desired state
- **AND** Alchemy removes the omitted tracked provider resources
- **AND** push may patch the target deployment config's latest observation
  cache with the exact desired-state hash and display-safe result summary

#### Scenario: Workspace destroy

- **GIVEN** a local Formless workspace targets a Cloudflare-backed instance
- **WHEN** `formless destroy --confirm <workerName>` runs with a validated
  Formless-owned Cloudflare OAuth credential reference and ignored deploy state
  available
- **THEN** the selected target's Worker, Durable Object namespace, R2 media
  bucket, Worker assets, Worker secrets, custom-domain provider resources, DNS
  provider resources, and Alchemy deploy state are
  destroyed through tracked selected deploy state
- **AND** `formless.ts`, instance archives, and app archives remain in place
- **AND** ignored deploy state for the selected target is removed or marked
  destroyed only after provider destroy succeeds
- **AND** provider credentials and admin tokens remain outside workspace
  configuration, portable archives, browser responses, and spec artifacts

#### Scenario: Destroy confirmation

- **GIVEN** a workspace targets a Cloudflare-backed instance
- **WHEN** `formless destroy` runs without `--confirm <workerName>` matching the
  selected deployment Worker name
- **THEN** the command fails before Cloudflare or Alchemy mutation

#### Scenario: Authenticated instance target context

- **WHEN** CLI pull, push, push dry-run, pull dry-run, or owner setup workflows
  contact a selected deployed instance target
- **THEN** the CLI resolves one target context containing the normalized target
  URL, ignored local secret state, environment overrides, and optional explicit
  admin token
- **AND** protected management reads and writes use that resolved admin bearer
  authorization consistently
- **AND** logs and reviewable workspace source do not include admin bearer
  tokens, owner setup tokens, provider credentials, or other runtime secrets
- **AND** browser-visible admin entrypoints are selected from the reported
  preferred admin origin when one exists, while protected CLI management reads
  and writes continue to use the selected target URL and admin bearer
  authorization

#### Scenario: Owner setup command uses focused bootstrap reads

- **WHEN** owner setup is incomplete and the CLI prepares an owner setup URL
- **THEN** the command reads only the selected target, owner setup status, and
  resolved admin bearer authorization needed to create the setup capability
- **AND** configured setup-origin facts needed for capability creation are part
  of the owner setup status response
- **AND** preferred admin-origin facts needed for post-setup browser links are
  part of the owner setup status response when configured or unambiguously
  derivable
- **AND** it does not require installed app registry, route, deployment status,
  archive, or browser owner session reads before the first owner passkey exists

### Requirement: Schema Control-Plane Protocol

The Formless CLI SHALL use the instance protocol and local workspace operation
layer to query, write, save, and compare schema-owned `route` and deployment
intent records.

#### Scenario: CLI reads deployment records

- **WHEN** CLI pull, push, push dry-run, or pull dry-run workflows need instance
  control-plane state
- **THEN** they read allowed `route` and `deployment-config` records through the
  instance control-plane protocol or
  workspace storage snapshots
- **AND** deployment config credential references remain display-safe pointers
  to CLI, local gateway, or runner-held Formless credential secret locations
- **AND** provider credentials remain in those secret locations
- **AND** deployment observation, evidence, cleanup, sync, and status summaries
  are read through read-only deployment runtime projection or local gateway
  operation responses rather than control-plane storage snapshots
- **AND** latest persisted deployment status is read from display-safe
  deployment config observation cache fields

#### Scenario: CLI push writes latest observation

- **WHEN** `formless push` starts against a schema-owned target
- **THEN** it reads the current desired-state projection and applies the
  projected resource graph through the local deployment adapter
- **AND** the local deployment adapter receives a fresh Formless-refreshed
  Cloudflare OAuth access token rather than resolving an Alchemy OAuth profile
- **AND** after provider reconciliation or failure it patches the target
  deployment config's display-safe latest observation cache
- **AND** runner-held credentials remain outside browser, archive, record
  source, and workspace configuration responses

#### Scenario: Push dry-run remains read-only

- **WHEN** `formless push --dry-run` compares local workspace source, remote
  instance source, or deployment projection
- **THEN** it reports a sync plan without patching deployment config
  observation cache fields

#### Scenario: CLI reads Program routes

- **WHEN** an instance workspace needs instance or public Site route state
- **THEN** the CLI reads `route` records
- **AND** route changes are reported by comparing current Program route records
- **AND** route selection does not resolve installed package metadata

#### Scenario: CLI reads domain routes

- **WHEN** CLI pull, push, dry-run, domain inspection, route removal, redirect
  removal, or provider repair workflows need desired domain or redirect intent
- **THEN** they read schema-owned `route` records through the control-plane
  protocol or workspace storage snapshots
- **AND** route removal or redirect removal writes the corresponding `route`
  record change
