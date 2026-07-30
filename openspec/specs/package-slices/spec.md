# Package Slices Specification

## Purpose

Package slices and in-repo app packages define package boundaries under
`lib/<package>/`. Capability slices own reusable contracts and adapters without
owning app records. App packages own schema authoring source when present,
portable schema artifacts, manifests, and any package-specific adapters for a
bundled app.

## Requirements

### Requirement: Package Slice Scope

The system SHALL treat package slices as reusable capability boundaries under
`lib/<package>/`.

#### Scenario: Capability crosses runtime surfaces

- GIVEN behavior spans app, client, React, Worker, archive, provider, or
  runtime-neutral surfaces
- WHEN the behavior does not own a full app schema
- THEN it can be extracted as a package slice

#### Scenario: Package does not own app records

- GIVEN a package slice is extracted for shared capability behavior
- WHEN app data is stored
- THEN app records remain owned by app schemas or runtime storage
- AND the package owns only reusable contracts, pure helpers, adapters, or
  package-specific UI behavior

### Requirement: Package Slice Structure

The system SHALL organize extracted capability slices under `lib/<package>/`
with a minimal package-local contract and adapter layout.

#### Scenario: Capability package scaffold

- GIVEN a capability is extracted as a package
- WHEN the package is scaffolded
- THEN the package contains package-local `AGENTS.md`, `package.json`,
  `tsconfig.json`, and `src/` files for public contract and supported adapters
- AND the package does not require a bundled app schema

### Requirement: In-Repo App Package Structure

The system SHALL allow in-repo app packages under `lib/<package>/` when the
package owns source schema and package-specific runtime adapters.

#### Scenario: App package scaffold

- GIVEN an app package such as Site, Tasks, or CRM is extracted into an in-repo
  package
- WHEN the package is scaffolded
- THEN the package contains package-local `AGENTS.md`, `package.json`,
  `tsconfig.json`, `formless.app.json`, `schema.json`, and `src/` entrypoints
  for public contracts and supported runtime adapters
- AND a package that uses TypeScript schema authoring owns its declaration
  under `src/` and a package-local schema materialization command
- AND the app package is published as a workspace package with documented root,
  React, Worker, and Node subpaths when those adapters exist
- AND `schema.json` remains the package's portable schema data artifact
- AND app packages without package-specific executable adapters do not need to
  expose unused adapter subpaths

#### Scenario: App package adapter ownership

- GIVEN an in-repo app package declares a runtime capability in
  `formless.app.json`
- WHEN core runtime, Worker, React, CLI, archive, or tests need executable
  behavior for that capability
- THEN they import the package root or documented adapter subpaths
- AND the package-owned adapter supplies capability-specific behavior such as
  public tree projection, public document rendering, metadata, icons, or
  indexing
- AND core runtime owns app install identity, route records, Authority storage,
  browser replicas, sync, media storage, and generic archive execution
- AND code outside the package does not deep-import package internals
- AND core runtime may register the package adapter for the current environment,
  but missing adapter registrations are unsupported capability errors rather
  than package-name fallbacks

#### Scenario: App package source replaces root app files

- GIVEN an app package such as Site, Tasks, or CRM owns `formless.app.json`,
  `schema.json`, and any package-local schema authoring source
- WHEN runtime code composes bundled package metadata or source schemas
- THEN it imports the package root or documented source JSON subpaths
- AND root runtime does not keep duplicate source schema files for that app
  package
- AND root `schema/apps/<packageAppKey>` source files are removed for extracted
  app packages

### Requirement: Package-Owned Schema Authoring Modules

The system SHALL let a package that owns runtime-neutral App schema
declarations expose composable TypeScript schema modules without moving those
domain declarations into the Schema package.

#### Scenario: Publish schema authoring modules

- GIVEN an in-repo package owns a complete App schema source or a reusable
  portion of one
- WHEN another trusted TypeScript composition root needs those declarations
- THEN the package exposes them through a documented `./schema` subpath
- AND each exported module is runtime-neutral and contains only App schema
  declarations and supported authoring metadata
- AND the Schema package owns the generic authoring DSL and compositor while
  the capability package owns its domain declarations
- AND consumers use the package's public subpath rather than deep-importing its
  source files
- AND the composed portable schema contains only existing App schema source
  data rather than package or module implementation identity

### Requirement: Downstream Program Composition Root

The system SHALL keep complete Program composition in a downstream-owned root
that consumes package-owned schema modules without taking ownership of their
domain declarations.

#### Scenario: Default Formless Program root

- GIVEN the Formless runtime package composes the default product Program
- WHEN it selects reusable instance and identity schema modules
- THEN it imports them through their documented package `./schema` subpaths
- AND the root owns the explicit module list, runtime owner, navigation,
  project-local modules, and deliberate replacements for conflicting
  presentation declarations
- AND the Instance Control Plane and Identity Control Plane packages continue
  owning their record and presentation declarations
- AND the Schema package continues owning only the generic App schema
  authoring and composition contracts
- AND no generic Program package or registry automatically discovers, fetches,
  versions, includes, or reorders domain modules

#### Scenario: Program root supports omission and ejection

- GIVEN a downstream project owns its ordered Program module list
- WHEN it omits an optional package module, supplies a local module, or replaces
  an upstream module while preserving the upstream authoring key
- THEN normal explicit schema composition selects that project-owned source
- AND a same-key replacement preserves stable entity ids for logical entities
  it continues to represent
- AND authoring module keys do not become runtime storage, routing,
  authorization, archive, record, or qualified-entity identity

#### Scenario: Materialize a downstream Program artifact

- GIVEN the default Program root composes a valid complete App schema source
- WHEN its materialization command runs
- THEN the checked-in Program artifact is deterministic plain schema data
- AND focused package checks reject canonical drift between the TypeScript
  composition and the materialized artifact
- AND runtime code does not evaluate the TypeScript composition root merely to
  load the portable artifact
- AND creating the artifact does not itself combine Authorities, app storage,
  package resolution, browser replicas, sync state, archives, or media

### Requirement: App Package Schema Materialization

An app package that uses TypeScript schema authoring SHALL materialize a
data-only `schema.json` artifact without making TypeScript evaluation part of
runtime package resolution.

#### Scenario: Materialize an authored package schema

- GIVEN an app package declares its schema in package-local TypeScript
- WHEN the package schema materialization command runs
- THEN it validates the declaration through the public Schema package contract
- AND it writes the complete deterministic `schema.json` artifact owned by that
  package
- AND the artifact remains checked in and included in the package's public
  files and source JSON export

#### Scenario: Detect materialized schema drift

- GIVEN an app package has TypeScript source, a materialized `schema.json`, and
  a manifest `sourceSchemaHash`
- WHEN package checks run
- THEN they compare canonical schema data rather than source formatting
- AND they fail when the declaration and JSON artifact differ
- AND they fail when the JSON artifact and manifest source-schema hash differ

#### Scenario: Keep authoring code outside runtime resolution

- GIVEN Worker, workspace, install, archive, upgrade, or deploy code resolves an
  app package schema
- WHEN it loads the package source
- THEN it consumes the exported `schema.json` artifact
- AND it does not import or evaluate the TypeScript authoring module or its
  materialization command

### Requirement: Minimal Package Documentation

Package documentation SHALL stay minimal and source-faithful.

#### Scenario: Package docs are introduced

- GIVEN a package slice is created
- WHEN package docs are added
- THEN the package has one `AGENTS.md`
- AND versioned public contract documentation lives with exported declarations
  in `src/types.ts`

#### Scenario: Package AGENTS stays operational

- GIVEN `AGENTS.md` documents a package slice
- WHEN the package changes
- THEN it records package ownership, non-ownership, source map, read path, and
  test rules
- AND it does not duplicate the versioned contract declarations owned by
  `src/types.ts`

#### Scenario: Agent reads package AGENTS

- GIVEN an agent works inside a package slice
- WHEN it gathers package AGENTS
- THEN it reads `AGENTS.md`, then `src/types.ts`, then only the relevant
  adapter file for the task

### Requirement: Public Contract File

The package `src/types.ts` file SHALL be the versioned public interface for
exported package contracts.

#### Scenario: Contract declarations

- GIVEN a package exposes types, public constants, or contract invariants
- WHEN adapter entrypoints need those declarations
- THEN they import declarations from `src/types.ts`
- AND they do not redefine compatible local shapes

#### Scenario: Contract purity

- GIVEN `src/types.ts` is evaluated as a public contract file
- WHEN it is imported
- THEN it contains pure documented types and constants
- AND it does not import runtime code

### Requirement: Runtime-Neutral Root Entrypoint

The package root entrypoint SHALL expose runtime-neutral helpers and public
contract types without pulling client, React, or Worker adapters.

#### Scenario: Root export

- GIVEN a consumer imports the package root
- WHEN the import is evaluated
- THEN it receives public type re-exports and runtime-neutral pure helpers
- AND it does not receive browser-only, React-only, Worker-only, or
  provider-specific dependencies

### Requirement: Adapter Subpath Boundaries

Package adapter subpaths SHALL separate browser/client HTTP, React, and
Worker/runtime responsibilities.

#### Scenario: Package export map

- GIVEN a package exposes adapter subpaths
- WHEN `package.json` declares supported imports
- THEN it documents only the root and adapter entrypoints that the package owns
- AND a package without React behavior does not expose a React entrypoint
- AND it does not export unowned internal implementation files

#### Scenario: Client adapter

- GIVEN a package exposes `src/client.ts`
- WHEN the client adapter is imported
- THEN that entrypoint owns browser/client HTTP adapters
- AND it does not import React

#### Scenario: React adapter

- GIVEN a package exposes `src/react.tsx`
- WHEN the React adapter is imported
- THEN that entrypoint owns package-specific React controls or React adapters
- AND it does not own generic generated form layout

#### Scenario: Worker adapter

- GIVEN a package exposes `src/worker.ts`
- WHEN the Worker adapter is imported
- THEN that entrypoint owns Worker/runtime adapters
- AND it does not import React

#### Scenario: Sidecar adapter

- GIVEN a package exposes `src/sidecar.ts`
- WHEN the sidecar adapter is imported
- THEN that entrypoint owns local Node sidecar adapters
- AND it does not import React
- AND it does not enter browser or Worker bundles

#### Scenario: Node adapter

- GIVEN a package exposes `src/node.ts`
- WHEN the Node adapter is imported
- THEN that entrypoint owns local Node filesystem or process adapters
- AND it does not import React
- AND it does not enter browser or Worker bundles

### Requirement: Public Import Boundary

External package consumers SHALL import only package roots or documented package
subpaths.

#### Scenario: Runtime code imports package behavior

- GIVEN app, client, Worker, archive, or Site runtime code consumes a package
  slice
- WHEN it imports package behavior
- THEN it imports from package public exports
- AND it does not deep-import unexported package internals

#### Scenario: Package internals remain private

- GIVEN code outside `lib/<package>/` imports package behavior
- WHEN the import path is checked
- THEN the import path is the package root or a documented package subpath
- AND wildcard exports or direct imports from private source files are not
  required

### Requirement: Package Internal Import Boundary

Package source SHALL depend only on package-local source, documented public
workspace package exports, npm dependencies, or Node built-ins.

#### Scenario: Package source avoids root runtime internals

- GIVEN a source file under `lib/<package>/src/` imports another module
- WHEN the import path is resolved
- THEN the dependency is package-local, a documented public workspace package
  root or subpath, an external package, or a Node built-in
- AND it does not resolve into `lib/formless/src/`, `lib/formless/src/test/`, or another
  package's unexported `lib/<other-package>/src/` internals

#### Scenario: Package tests stay package-local

- GIVEN tests live under `lib/<package>/src/`
- WHEN they need schemas, records, package manifests, storage snapshots, or
  media examples
- THEN they use package-local fixtures or public package exports
- AND they do not import `lib/formless/src/test/*` fixtures or Formless runtime-only
  modules

### Requirement: Package-Local Verification

Package verification SHALL be fast, deterministic, local, and limited to
behavior or artifacts owned by the package.

#### Scenario: Package tests run locally

- GIVEN package tests verify a capability slice
- WHEN the tests run
- THEN they live inside the package source or package test tree
- AND they use fake providers or stores, fixed clocks, and fixed ids
- AND they do not call live networks, Cloudflare APIs, or a dev server

#### Scenario: Browser smoke ownership

- GIVEN package implementation does not change visible app behavior
- WHEN package verification runs
- THEN browser smoke is not required for the package task
- AND browser smoke remains app-level when visible app behavior changes

#### Scenario: Behavior verification stays at the owning package

- GIVEN behavior crosses schema parsing, runtime projection, Presentation Host,
  renderer, or environment adapter boundaries
- WHEN focused verification is selected
- THEN each package verifies only the behavior it owns
- AND cross-package behavior is verified once at the narrowest stable public
  integration boundary
- AND fixture catalog completeness, type declaration shape, source text, and
  exact dependency versions are not independently verified when type checking,
  the real build, or package validation already enforces the requirement

#### Scenario: Import boundary verification stays shared and minimal

- GIVEN workspace packages expose explicit roots and documented subpaths
- WHEN repository package imports are verified
- THEN one shared boundary check derives allowed workspace imports from package
  export maps and covers production and test source
- AND package-specific import allowlists do not duplicate that shared check
- AND a separate graph or package check exists only for a distinct browser,
  Worker, SSR, or published-artifact boundary and evaluates the real artifact
  rather than exact manifest dependency values

### Requirement: Published Package Artifacts

Published reusable package slices SHALL use shared Vite+ Pack configuration to
produce explicit ESM runtime and declaration artifacts without bundling
dependency implementations into each package, while repository development
resolves the same public imports directly to current package source.

#### Scenario: Build a conventional package slice

- GIVEN a reusable package slice is not the Formless runtime build host or the
  source-distributed Formless Renderer
- WHEN its release artifacts are prepared
- THEN package-local Vite+ Pack emits ESM JavaScript, TypeScript declarations,
  and source maps for every documented TypeScript or TSX public entrypoint
- AND package dependencies and peer dependencies remain external to the emitted
  package code
- AND package export maps remain explicit manifest declarations that resolve
  runtime and type conditions from the generated artifact root
- AND wildcard exports, generated export-map mutation, and package-local
  `tsdown` configuration are not required
- AND Pack warnings fail the release build

#### Scenario: Develop against current package source

- GIVEN a repository package source file has changed since its latest Pack
  output
- WHEN TypeScript language services, package checks, local Vite or Vitest, or a
  Bun development command resolves a documented workspace package import
- THEN the repository package manifest resolves that same explicit public
  subpath directly to its TypeScript or TSX source entrypoint
- AND editors, type checks, tests, and local runtime builds do not require Pack
  or Pack watch mode to observe the current public contract
- AND Vite can bundle and evaluate package-owned configuration before reading
  any configured resolution conditions
- AND the release package manifest separately resolves generated ESM and
  declaration artifacts

#### Scenario: Publish a conventional package slice

- GIVEN a conventional package slice has been packed for release
- WHEN its package tarball and public entrypoints are validated
- THEN the tarball contains the generated runtime and declaration artifacts,
  the declared package source graph, and only explicitly declared non-code
  assets
- AND it excludes tests, fixtures, and development-only files
- AND its packed manifest resolves runtime and type conditions to generated
  artifacts without repository source export targets
- AND package export, ESM, and TypeScript declaration contracts pass package
  publication validation
- AND an in-repo app package continues to publish its declared app manifest and
  source schema JSON as uncompiled package artifacts

### Requirement: Formless Presentation Package Slice

The system SHALL provide a renderer-neutral Presentation package slice under
`lib/presentation/` for application presentation contracts, references, intents,
and reactive Presentation Host behavior.

#### Scenario: Presentation contracts and host exports are explicit

- GIVEN application runtime publishes renderer-neutral presentation
- WHEN runtime publishers, renderer implementations, or focused tests consume
  the presentation protocol
- THEN contract types, references, and intents come from documented
  `@dpeek/formless-presentation/contract` exports
- AND host types, reference helpers, and the reusable memory host come from
  documented `@dpeek/formless-presentation/host` exports
- AND the React provider and subscription hooks come from documented
  `@dpeek/formless-presentation/host/react` exports
- AND consumers do not need a concrete renderer package to publish, host, read,
  subscribe to, or dispatch presentation contracts

#### Scenario: Presentation symbols use package-scoped vocabulary

- GIVEN a consumer imports Presentation contracts or host behavior
- WHEN it names a public type, helper, hook, or projection
- THEN surface values use domain names with semantic suffixes such as
  `Contract`, `Intent`, `Reference`, `Facts`, `State`, `Option`, `Identity`,
  `Availability`, `Purpose`, or `Handler`
- AND generic protocol infrastructure uses `PresentationHost`,
  `PresentationSnapshot`, `PresentationReference`, `PresentationNode`, and
  `PresentationIntent` vocabulary
- AND package context supplies the Formless Presentation namespace without a
  universal `FormlessUi` symbol prefix
- AND renderer implementations use `Renderer`, runtime construction uses
  `Projection`, and app-schema `View` retains its existing domain meaning

#### Scenario: Presentation ownership stays renderer neutral

- GIVEN generated UI, auth, access, management, shell, theme, and system-state
  runtimes publish presentation contracts
- WHEN the Presentation package dependency graph is evaluated
- THEN it may depend on canonical schema contracts and React for its explicit
  React host adapter
- AND it does not own renderer components, styling, provider themes, routing,
  storage, browser replica reads, auth effects, operation execution, or Site
  projection
- AND public Site renderer contracts remain owned by
  `@dpeek/formless-site-app`

### Requirement: Formless Renderer Package Boundary

The Formless Renderer implementation SHALL expose application and public Site
presentation through documented `@dpeek/formless-renderer` package subpaths
while consuming application protocol from `@dpeek/formless-presentation` and
retaining Astryx as an internal component and build dependency.

#### Scenario: Application presentation exports stay complete and minimal

- GIVEN root application assembly mounts the Formless Renderer
- WHEN consumers import the application contract, host, assembly, provider,
  renderer, or CSS boundaries
- THEN application contracts and hosts come from documented
  `@dpeek/formless-presentation` subpaths
- AND concrete assembly, provider, renderer, and CSS boundaries come from
  documented `@dpeek/formless-renderer` subpaths
- AND `FormlessApplicationRenderer` accepts
  `FormlessApplicationPresentation` through
  `FormlessApplicationRendererProps` and supplies shell, management, auth,
  access, generated workspace, tree, list, table, record-result, field, create,
  operation, theme, and residual system-state presentation
- AND `FormlessApplicationRendererProvider` accepts
  `FormlessApplicationRendererProviderProps`
- AND the application provider and CSS boundary are exported independently from
  the public Site provider and CSS boundary
- AND root runtime does not deep-import `@dpeek/formless-renderer` source or
  assemble individual renderer leaves into route-local selector tables
- AND fixture roots, fixture state, and scenario controls remain private

#### Scenario: Public renderer names describe the product capability

- GIVEN consumers import the documented application and public Site renderer
  entrypoints
- WHEN those entrypoints expose renderer, provider, assembly, or presentation
  symbols
- THEN application entrypoints export `FormlessApplicationRenderer`,
  `FormlessApplicationPresentation`, and
  `FormlessApplicationRendererProvider`
- AND public Site entrypoints export `FormlessSitePageRenderer`,
  `FormlessSiteSystemStateRenderer`, and `FormlessSiteRendererProvider`
- AND Astryx names remain scoped to concrete component, token, StyleX, CSS, or
  build facts inside the renderer implementation

#### Scenario: Renderer package imports canonical Site contracts

- GIVEN `@dpeek/formless-renderer` implements public Site page, system-state,
  block, or form presentation
- WHEN it imports the renderer input, projected tree, link, media, icon, theme,
  or form facts needed by that presentation
- THEN it imports documented public contracts and helpers from
  `@dpeek/formless-site-app`
- AND it does not define structurally equivalent private Site projection or
  renderer input contracts
- AND `@dpeek/formless-site-app` does not import
  `@dpeek/formless-renderer`
- AND neither package deep-imports the other package's source internals

#### Scenario: Public Site exports stay separate from application exports

- GIVEN the Formless Renderer public Site implementation is complete
- WHEN the `@dpeek/formless-renderer` package export map is evaluated
- THEN documented public subpaths expose the browser and Worker-compatible Site
  renderers plus the public provider and CSS boundaries needed by production
  public roots
- AND fixture route roots, scenario controls, and package-local fixture state
  remain private
- AND public exports do not import application shell, management, auth, access,
  generated admin runtime, application provider, or application CSS assembly

#### Scenario: Public renderer graph stays presentation scoped

- GIVEN a consumer builds the `@dpeek/formless-renderer` public Site renderer
  entrypoints
- WHEN their import graph is checked
- THEN it excludes `lib/formless/src/` runtime source, the application Presentation Host,
  generated admin and workspace runtime, shell and auth presentation, browser
  replica and sync, gateway clients, rich editor modules, storage internals,
  private challenge facts, and provider credentials
- AND generic field presentation reused for public operation forms does not pull
  generated operation execution or admin runtime into the public graph

#### Scenario: Renderer package stays presentation scoped

- GIVEN application or public Site presentation is rendered through the
  Formless Renderer
- WHEN the package dependency graph is checked
- THEN `@dpeek/formless-renderer` consumes application contracts, stable
  references, display facts, React children, and canonical intents through
  `@dpeek/formless-presentation` exports
- AND it does not own browser replica reads, storage, routing policy, auth
  ceremonies, identity authority, Site projection, public form execution,
  operation execution, navigation effects, theme persistence, or document
  bootstrap
- AND reusable source SVG parsing comes from
  `@dpeek/formless-source-svg`
- AND application media presentation uses renderer-neutral Media contracts
  while the Media package exposes no React presentation adapter

#### Scenario: Renderer package is a published runtime build input

- GIVEN the installed Formless runtime provides the bundled application and
  public Site renderer
- WHEN local dev, push, or a production runtime build resolves
  `@dpeek/formless-renderer`
- THEN the renderer is an installable package with explicit application, public
  Site, provider, and CSS exports
- AND it publishes the TypeScript, TSX, and CSS source required by the runtime
  Vite, Astryx, and StyleX build pipeline instead of a conventional Pack output
- AND the package excludes tests, fixtures, fixture roots, and scenario controls
  from its published payload
- AND the same runtime build setup can replace the bundled renderer entrypoints
  with trusted workspace renderer extensions

### Requirement: Storage Package Slice

The system SHALL provide a Storage package slice under `lib/storage/` for
runtime-neutral storage snapshot and stored-record contracts.

#### Scenario: Storage package scaffold

- GIVEN the Storage package slice is introduced
- WHEN the package is scaffolded
- THEN it contains package-local `AGENTS.md`, `package.json`, `tsconfig.json`,
  and `src/` entrypoints for public contracts and runtime-neutral helpers
- AND the package is published as `@dpeek/formless-storage` with a root public
  subpath
- AND it follows package slice import and documentation boundaries
- AND it does not expose client, React, Worker, Node, or sidecar subpaths

#### Scenario: Storage package exports

- GIVEN Authority storage, browser replicas, archive packages, workspace
  packages, Site runtime, Worker runtime, or tests need storage snapshot kind
  constants, storage snapshot parsing, stored-record contracts, or flat record
  value contracts
- WHEN they import storage snapshot behavior
- THEN they import from `@dpeek/formless-storage`
- AND they do not import those contracts from root runtime protocol modules

### Requirement: Storage Package Non-Ownership

The Storage package SHALL own reusable storage snapshot contracts and parsers
without owning Authority execution or runtime protocol routes.

#### Scenario: Package owns snapshot contracts

- GIVEN storage snapshot kind constants, storage snapshot version constants,
  storage snapshot parsing, storage identity checks, stored-record contracts, or
  flat record value contracts are needed
- WHEN runtime-neutral code consumes storage snapshot behavior
- THEN they come from `lib/storage`
- AND App schema parsing and field behavior come from the Schema package

#### Scenario: Package does not own storage execution

- GIVEN Authority bootstrap, schema storage, change rows, operation
  invocations, sync protocol, mutation routes, Durable Object storage, browser
  replica persistence, or restore execution is needed
- WHEN those behaviors are implemented
- THEN Authority storage, browser replica, Worker runtime, or Site runtime own
  the execution
- AND the Storage package supplies only snapshot contracts, pure parsing, and
  package-local deterministic tests

### Requirement: Installed Apps Package Slice

The system SHALL provide an Installed Apps package slice under
`lib/installed-apps/` for app install identity, package app manifest, package
resolver, package revision, and source schema hash contracts.

#### Scenario: Installed Apps package scaffold

- GIVEN the Installed Apps package slice is introduced
- WHEN the package is scaffolded
- THEN it contains package-local `AGENTS.md`, `package.json`, `tsconfig.json`,
  and `src/` entrypoints for public contracts and runtime-neutral helpers
- AND the package is published as `@dpeek/formless-installed-apps` with a root
  public subpath
- AND it follows package slice import and documentation boundaries
- AND it does not expose client, React, Worker, Node, or sidecar subpaths

#### Scenario: Installed Apps package exports

- GIVEN app, client, Worker, archive, workspace, upgrade, Site runtime, or tests
  need app install id validation, app install contracts, app package manifest
  parsing, package resolver behavior, package revision contracts, or source
  schema hash helpers
- WHEN they import installed-app or app-package behavior
- THEN they import from `@dpeek/formless-installed-apps`
- AND they do not import those contracts from root runtime modules

### Requirement: Installed Apps Package Non-Ownership

The Installed Apps package SHALL own reusable install and package metadata
contracts without owning bundled app sources, app install storage mutation, or
runtime adapter execution.

#### Scenario: Package owns install and package metadata contracts

- GIVEN app install id validation, app install metadata shapes, package app
  manifest parsing, active resolver helpers, package revision contracts, source
  schema hash parsing, or deterministic source schema hash computation are
  needed
- WHEN runtime-neutral code consumes installed-app behavior
- THEN they come from `lib/installed-apps`
- AND source schema parsing comes from the Schema package

#### Scenario: Package does not own bundled defaults

- GIVEN the default runtime resolver needs bundled Site, Tasks, or CRM package
  manifests
- WHEN bundled package metadata is composed
- THEN root runtime code supplies bundled manifests to the Installed Apps
  package resolver
- AND package source does not import bundled schema JSON or root-only bundled
  package lists

### Requirement: Instance Control Plane Package Slice

The system SHALL provide an Instance Control Plane package slice under
`lib/instance-control-plane/` for schema-owned instance management contracts and
reviewable control-plane storage snapshot validation.

#### Scenario: Instance Control Plane package scaffold

- GIVEN the Instance Control Plane package slice is introduced
- WHEN the package is scaffolded
- THEN it contains package-local `AGENTS.md`, `package.json`, `tsconfig.json`,
  and `src/` entrypoints for public contracts and runtime-neutral helpers
- AND the package is published as `@dpeek/formless-instance-control-plane`
  with root and `./schema` public subpaths
- AND it follows package slice import and documentation boundaries
- AND it does not expose client, React, Worker, Node, or sidecar subpaths

#### Scenario: Instance Control Plane package exports

- GIVEN Archive, Workspace, Worker runtime, Site runtime, Deploy runtime, or
  tests need instance control-plane schema keys, storage identity constants,
  entity contracts, schema contracts, reviewable record validation, or
  display-safe control-plane storage snapshot canonicalization
- WHEN they import instance control-plane behavior
- THEN they import from `@dpeek/formless-instance-control-plane`
- AND trusted schema composition imports reusable declaration modules from
  `@dpeek/formless-instance-control-plane/schema`
- AND they do not import those contracts from root runtime modules

### Requirement: Instance Control Plane Package Non-Ownership

The Instance Control Plane package SHALL own reusable schema-owned instance
management contracts without owning Authority writes, app records, deployment
execution, or provider state.

#### Scenario: Package owns schema-owned control-plane contracts

- GIVEN app-install, route, or deployment-config entity contracts,
  control-plane schema constants, reviewable storage snapshot validation, or
  display-safe canonicalization are needed
- WHEN runtime-neutral code consumes instance control-plane behavior
- THEN they come from `lib/instance-control-plane`
- AND app install metadata contracts come from the Installed Apps package
- AND deployment projection contracts come from the Deploy package
- AND storage snapshot contracts come from the Storage package

#### Scenario: Package does not own control-plane execution

- GIVEN app install mutation, route mutation, deployment-config mutation,
  Authority storage, owner authorization, deployment projection execution,
  provider execution, or runtime observation persistence is needed
- WHEN those behaviors are implemented
- THEN Worker runtime, Site runtime, Deploy runtime, Gateway runtime adapters,
  or provider adapters own the execution
- AND the Instance Control Plane package supplies only schema contracts,
  reviewable validation, pure helpers, and package-local deterministic tests

### Requirement: Archive Package Slice

The system SHALL provide an Archive package slice under `lib/archive/` for
portable archive contracts, parsers, restore planning, and local
archive filesystem adapters.

#### Scenario: Archive package scaffold

- GIVEN the Archive package slice is introduced
- WHEN the package is scaffolded
- THEN it contains package-local `AGENTS.md`, `package.json`, `tsconfig.json`,
  and `src/` entrypoints for public contracts and supported adapters
- AND the package is published as `@dpeek/formless-archive` with root and
  `./node` public subpaths
- AND it follows package slice import and documentation boundaries
- AND it does not expose client, React, Worker, or sidecar subpaths

#### Scenario: Archive package exports

- GIVEN CLI runtime, Worker restore APIs, Workspace operations, upgrade
  planning, or tests need portable archive behavior
- WHEN they import archive contracts, parsers, restore planning,
  or local archive file adapters
- THEN they import from `@dpeek/formless-archive` or
  `@dpeek/formless-archive/node`
- AND they import Archive package behavior only through exported package
  entrypoints, not source-tree modules or package internals

### Requirement: Archive Package Non-Ownership

The Archive package SHALL own reusable portable archive contracts and pure
helpers without owning runtime storage, app records, media storage, provider
execution, workspace operation execution, or CLI command policy.

#### Scenario: Package owns archive contracts

- GIVEN archive envelope types, archive kind constants, archive version
  constants, archive capability parsing, archive formatting, restore dry-run
  planning, media manifest validation, or local
  archive directory IO are needed
- WHEN runtime-neutral or local Node code consumes portable archive behavior
- THEN they come from `lib/archive`
- AND app schema language behavior comes from the Schema package
- AND core media contracts come from the Media package
- AND local workspace source/state behavior comes from the Workspace package

#### Scenario: Package does not own archive execution

- GIVEN archive export, archive restore apply, app install mutation, Authority
  reads or writes, Durable Object storage, browser replica state, media object
  mutation, provider mutation, workspace save/check/pull/push/deploy, or CLI
  command policy is needed
- WHEN those behaviors are implemented
- THEN CLI runtime, Archive workflows, Workspace runtime, Worker runtime,
  Authority, Media runtime, Deploy runtime, or provider adapters own the
  execution
- AND the Archive package only supplies contracts, parser/formatter behavior,
  current-envelope rejection, deterministic planning, and package-local tests

### Requirement: Deploy Package Slice

The system SHALL provide a Deploy package slice under `lib/deploy/` for
deployment schema, projection, protocol, and adapter contracts.

#### Scenario: Deploy package scaffold

- GIVEN the Deploy package slice is introduced
- WHEN the package is scaffolded
- THEN it contains package-local `AGENTS.md`, `package.json`, `tsconfig.json`,
  and `src/` entrypoints for public contracts and supported adapters
- AND the package is published as `@dpeek/formless-deploy` with root,
  `./client`, `./react`, and `./worker` public subpaths
- AND it follows package slice import and documentation boundaries

#### Scenario: Deploy package exports

- GIVEN app, client, Worker, CLI, generated UI, or tests need deploy package
  behavior
- WHEN they import the package
- THEN they import from the package root or documented subpaths
- AND they do not deep-import deploy package internals

### Requirement: Deploy Package Non-Ownership

The Deploy package SHALL own reusable contracts and helpers without owning
provider secrets or canonical provider state.

#### Scenario: Package owns schema contracts

- GIVEN deployment entity shapes, action ids, projection helpers, display
  summaries, or protocol request shapes are needed
- WHEN runtime-neutral contracts are consumed
- THEN they come from `lib/deploy`
- AND provider SDK execution and Alchemy state remain outside the package's
  runtime-neutral contract
- AND app install and app route identity contracts are consumed from the
  instance control-plane model instead of being redefined as deploy-only shapes

### Requirement: Gateway Package Slice

The system SHALL provide a Gateway package slice under `lib/gateway/` for local
workspace gateway transport contracts, response safety helpers, browser
adapters, Worker proxy adapters, shared local runtime proxy rules, and local
sidecar HTTP adapters.

#### Scenario: Gateway package scaffold

- GIVEN the Gateway package slice is introduced
- WHEN the package is scaffolded
- THEN it contains package-local `AGENTS.md`, `package.json`, `tsconfig.json`,
  and `src/` entrypoints for public contracts and supported adapters
- AND the package is published as `@dpeek/formless-gateway` with root,
  `./client`, `./worker`, and `./sidecar` public subpaths
- AND it follows package slice import and documentation boundaries
- AND it does not expose a React subpath

#### Scenario: Gateway package exports

- GIVEN app, client, Worker, CLI runtime, or tests need workspace gateway
  behavior
- WHEN they import the package
- THEN they import from the package root or documented subpaths
- AND they do not deep-import gateway package internals
- AND package-internal shared proxy rules and response safety helpers remain
  private implementation behind documented Worker and sidecar adapter subpaths

### Requirement: Gateway Package Non-Ownership

The Gateway package SHALL own reusable local workspace gateway contracts,
wire-safety helpers, and adapters without owning Formless workspace operations,
owner session storage, runtime topology, provider execution, or app records.

#### Scenario: Package owns gateway contracts and adapters

- GIVEN workspace gateway route constants, proxy header contracts, operation
  intent helpers, browser fetch behavior, response safety helpers, shared local
  runtime proxy rules, Worker proxy behavior, or sidecar HTTP routing helpers
  are needed
- WHEN runtime-neutral, browser, Worker, or sidecar code consumes gateway
  capability behavior
- THEN they come from `lib/gateway`
- AND Worker proxy adapters and local Node runtime proxy adapters share one
  package-owned proxy rules Module for route classification, operation intent
  validation, browser actor policy, CSRF checks, sanitized sidecar forwarding,
  and display-safe response wrapping
- AND Worker proxy adapters, local Node runtime proxy adapters, sidecar adapters,
  and browser client tests share package-owned response safety helpers for JSON
  envelopes, allowed response headers, owner-session CSRF wrapping, sidecar
  fallback errors, and display-safe gateway transport wrappers
- AND direct sidecar automation authorization and sidecar execution ingress
  remain sidecar adapter behavior rather than browser proxy behavior
- AND semantic workspace operation input shapes, display-safe operation state,
  operation result contracts, operation storage, actual save, check, pull,
  push, deploy, credential setup, owner session, runtime topology, Authority,
  provider credential, and filesystem operation implementations remain outside
  the package contract
- AND Gateway may expose transport-facing aliases or response wrappers for
  Workspace operation states, but canonical operation declarations remain in
  the Workspace package

### Requirement: Public Operations Package Slice

The system SHALL provide a Public Operations package slice under
`lib/public-operations/` for reusable public operation route contracts and
browser-safe public operation client protocol helpers.

#### Scenario: Public Operations package scaffold

- GIVEN the Public Operations package slice is introduced
- WHEN the package is scaffolded
- THEN it contains package-local `AGENTS.md`, `package.json`, `tsconfig.json`,
  and `src/` entrypoints for public contracts and runtime-neutral helpers
- AND the package is published as `@dpeek/formless-public-operations` with a
  root public subpath
- AND it follows package slice import and documentation boundaries
- AND it does not expose React, Worker, Node, sidecar, app-schema, app-record,
  challenge, notification, or operation execution ownership subpaths

#### Scenario: Public Operations package exports

- GIVEN Site projection, Worker routing, browser clients, or tests need public
  operation route grammar, browser request envelope helpers, browser response
  guards, browser error extraction, browser idempotency key helpers, or
  Turnstile response token extraction
- WHEN they import public operation package behavior
- THEN they import from `@dpeek/formless-public-operations`
- AND they do not deep-import public operation package internals

### Requirement: Public Operations Package Non-Ownership

The Public Operations package SHALL own reusable public operation route
contracts and browser-safe public operation client protocol helpers without
owning target resolution, schema operation declarations, app storage, challenge
verification, notification delivery, Site records, or product-specific form UI.

#### Scenario: Package owns public operation route contracts

- GIVEN target-scoped public operation routes are built or parsed
- WHEN runtime-neutral, Site projection, browser, Worker, or tests consume public
  operation route behavior
- THEN path suffix construction, segment encoding, segment decoding, and suffix
  validation come from `lib/public-operations`
- AND target API route prefixes, app storage identities, mapped-host policy,
  Authority routing, public operation eligibility, Turnstile verification,
  operation execution, operation audit storage, notification delivery, and
  product-specific subscribe, contact, or generic form UI remain outside the
  package contract

#### Scenario: Package owns browser-safe client helpers

- GIVEN public Site browser forms submit to public operation routes
- WHEN browser code builds the submit envelope, posts JSON, extracts a
  public-safe error, validates a public operation response, creates a form
  idempotency key, or reads the Turnstile response token from `FormData`
- THEN shared protocol behavior comes from `lib/public-operations`
- AND product-specific form input mapping, schema-field form coercion,
  rendered controls, success/error UI, challenge widget rendering, route
  projection, challenge verification, operation execution, and notification
  scheduling remain outside the package contract

### Requirement: Schema Package Slice

The system SHALL provide a Schema package slice under `lib/schema/` for
runtime-neutral App schema language contracts, parsers, and pure helpers.

#### Scenario: Schema package scaffold

- GIVEN the Schema package slice is introduced
- WHEN the package is scaffolded
- THEN it contains package-local `AGENTS.md`, `package.json`, `tsconfig.json`,
  and `src/` entrypoints for public contracts and runtime-neutral helpers
- AND the package is published as `@dpeek/formless-schema` with a root public
  subpath
- AND it follows package slice import and documentation boundaries
- AND it does not expose client, React, Worker, Node, or sidecar subpaths

#### Scenario: Schema package exports

- GIVEN generated UI models, Authority validation, browser replicas, archives,
  upgrade migrations, tests, or package slices need
  App schema contracts, parser behavior, field behavior, query helpers, read
  model helpers, schema-local entity key helpers, or qualified entity name
  helpers
- WHEN they import schema language behavior
- THEN they import from `@dpeek/formless-schema`
- AND they do not deep-import schema package internals

### Requirement: Schema Package Non-Ownership

The Schema package SHALL own reusable App schema language contracts and pure
helpers without owning bundled app packages, runtime storage, generated React
surfaces, archive execution, or workspace source.

#### Scenario: Package owns schema language contracts

- GIVEN App schema types, schema parsing, schema formatting, schema-local entity
  key parsing, qualified entity name parsing, field type behavior, field value
  validation helpers, query expression helpers, read model numeric and aggregate
  helpers, create-default parsing helpers, runtime schema metadata helpers,
  action capability helpers, or schema section parsers are needed
- WHEN runtime-neutral code consumes schema capability behavior
- THEN they come from `lib/schema`
- AND callers consume the package root rather than knowing the internal parser
  file layout

#### Scenario: Package does not own runtime surfaces

- GIVEN bundled source app package metadata, source schema JSON loading, source
  schema Builder UI state, generated React rendering, Authority table mutation,
  Durable Object storage, browser replica persistence, archive restore
  execution, Workspace storage snapshots, instance control-plane schema
  construction, package app migrations, or provider execution is needed
- WHEN those behaviors are implemented
- THEN they remain owned by their existing app, client, Worker, archive,
  Workspace, Deploy, migration, or runtime modules
- AND the Schema package supplies only runtime-neutral schema contracts, pure
  parser/formatter behavior, and package-local deterministic tests

### Requirement: Workspace Package Slice

The system SHALL provide a Workspace package slice under `lib/workspace/` for
Formless workspace source contracts, ignored local state contracts, semantic
workspace operation contracts, and local Node filesystem adapters.

#### Scenario: Workspace package scaffold

- GIVEN the Workspace package slice is introduced
- WHEN the package is scaffolded
- THEN it contains package-local `AGENTS.md`, `package.json`, `tsconfig.json`,
  and `src/` entrypoints for public contracts and supported adapters
- AND the package is published as `@dpeek/formless-workspace` with root and
  `./node` public subpaths
- AND it follows package slice import and documentation boundaries
- AND it does not expose client, React, Worker, or sidecar subpaths

#### Scenario: Workspace package exports

- GIVEN CLI runtime, Gateway runtime adapters, archive workflows, tests,
  or local agent workflows need workspace source, local state, operation, or
  storage snapshot behavior
- WHEN they import the package
- THEN they import from `@dpeek/formless-workspace` or
  `@dpeek/formless-workspace/node`
- AND they do not deep-import workspace package internals

#### Scenario: Workspace package docs follow current source model

- GIVEN package-local `AGENTS.md` files, import-boundary tests, or local agent
  instructions describe workspace source responsibilities
- WHEN workspace source is represented as storage snapshot state and media
  payloads
- THEN those docs and tests name current workspace source, state, operation,
  manifest, local state, secret state, and storage snapshot helpers
- AND they direct agents and import allowlists toward Workspace package helpers
  and exported entrypoints

### Requirement: Workspace Package Non-Ownership

The Workspace package SHALL own reusable Formless workspace source, state, and
operation contracts without owning CLI command policy, gateway transport,
runtime storage, provider execution, or app records.

#### Scenario: Package owns workspace contracts and local adapters

- GIVEN `formless.json` manifest parsing, workspace path defaults, target URL
  normalization, reviewable control-plane storage snapshot contracts, ignored
  local or secret state file contracts, semantic workspace operation inputs,
  display-safe operation state, operation result shapes, operation redaction, or
  deterministic local filesystem workspace IO are needed
- WHEN runtime-neutral or local Node code consumes workspace capability
  behavior
- THEN they come from `lib/workspace`
- AND Gateway imports or is supplied those semantic operation contracts instead
  of defining Gateway-owned operation shapes
- AND package consumers import Workspace behavior only from
  `@dpeek/formless-workspace` or `@dpeek/formless-workspace/node`, never from
  source-tree modules or package internals

#### Scenario: Package does not own runtime execution

- GIVEN workspace operations save, check, pull, push, deploy, credential setup,
  restore, export, import, mutate provider state, read Authority storage, or
  select runtime topology
- WHEN those behaviors are implemented
- THEN CLI runtime, Gateway runtime adapters, Archive workflows, Deploy
  runtime, Worker runtime, or provider adapters own the execution
- AND the Workspace package only supplies contracts, pure helpers, display-safe
  state handling, and local filesystem adapters for workspace source or ignored
  local state

### Requirement: Source SVG Package Slice

The system SHALL provide a renderer-neutral Source SVG package slice under
`lib/source-svg/` for the shared safe SVG parser and parsed element contract.

#### Scenario: Renderers consume one safe parser

- GIVEN Site source sanitization, shared UI icons, or Formless Renderer source
  icons consume user-provided SVG markup
- WHEN they parse that markup
- THEN they import `parseSourceSvg` from `@dpeek/formless-source-svg`
- AND the package rejects unsupported elements, unsafe references, malformed
  markup, and oversized source without depending on React or app runtime code
- AND each consumer remains responsible only for rendering or serializing the
  parsed safe element tree
