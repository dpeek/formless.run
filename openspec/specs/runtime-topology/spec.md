# Runtime Topology Specification

## Purpose

Runtime topology defines the observable profile, route policy, route access,
mapped host, and request routing contracts for a Formless instance. It keeps
instance administration and published Site behavior coherent across browser
shells, APIs, static assets, SSR documents,
indexing, icons, public Site routes, cross-domain auth callback routes, and
local workspace gateway route eligibility.

## Requirements

### Requirement: Profile Resolution

The system SHALL resolve each runtime request to one runtime profile kind:
`instance` or `publishedSite`.

#### Scenario: Explicit profile wins

- GIVEN a request host that would otherwise infer `publishedSite`
- WHEN an explicit runtime profile of `instance` is configured
- THEN the request uses the `instance` profile
- AND route policy is selected from the `instance` profile

#### Scenario: Host convention infers profile

- GIVEN no explicit runtime profile is configured
- WHEN the hostname starts with `instance.` or `published-site.`
- THEN the request resolves to the matching `instance` or `publishedSite`
  profile
- AND a `*.workers.dev` host resolves to `publishedSite`

#### Scenario: Runtime-specific explicit profile hints

- GIVEN browser document metadata, browser build environment, Worker
  environment, and host conventions may supply profile hints
- WHEN the browser resolves its profile
- THEN a recognized `formless-runtime-profile` document value wins over a
  recognized `VITE_FORMLESS_RUNTIME_PROFILE` value and host convention
- AND when the Worker resolves its profile, a recognized
  `FORMLESS_RUNTIME_PROFILE` value wins over host convention
- AND missing or unrecognized hints continue to the next resolution source

#### Scenario: Unresolved profile uses instance

- GIVEN document metadata, environment input, and host conventions do not
  resolve a recognized runtime profile
- WHEN runtime topology selects a profile
- THEN the request uses the `instance` profile
- AND only recognized profile values participate in explicit profile selection

### Requirement: Profile Route Policy

The system MUST apply profile route policy before selecting browser shell, API,
static asset, or SSR handling. The Program API is the only generic data route
family. Local workspace capability selection remains a separate explicit
runtime fact.

#### Scenario: Product instance route policy

- GIVEN the runtime profile is `instance`
- WHEN a request targets browser or API behavior
- THEN declared Program screens and surface mounts, the
  `/api/formless/program` route family, origin-scoped account auth routes,
  principal-backed browser session routes, and instance browser routes remain
  route-policy eligible
- AND authenticated Site preview mounts may select the Site public renderer
  without selecting anonymous published Site route policy
- AND top-level public Site behavior is selected separately by an enabled mapped
  route rather than by the `instance` profile

### Requirement: Browser Route Mounts

The system SHALL mount browser surfaces according to the active runtime profile
and the materialized Program route declarations.

#### Scenario: Product instance browser routes

- GIVEN the runtime profile is `instance`
- WHEN a browser navigates to `/tasks`, `/site`, `/site/settings`,
  `/site/contacts`, `/site/subscribers`, `/settings/routes`, or
  `/settings/access`, or the default `/site/preview` browser preview subtree
- THEN the request is eligible for the client shell
- AND route selection uses the Program screen and surface-mount route table

#### Scenario: Unknown instance route stays outside the Program shell

- GIVEN the runtime profile is `instance`
- WHEN a browser navigates to a path that is not an active Program screen,
  materialized browser surface mount, or intrinsic runtime route
- THEN the path is not eligible for the client shell
- AND static asset fallback does not turn the unknown path into a Program route

#### Scenario: Authorize a direct Program deep link

- GIVEN a document request targets an active Program screen or browser surface
  mount on the default instance host or an enabled mapped instance route
- WHEN runtime topology selects the browser surface
- THEN server admission evaluates the current session, account completion,
  matched runtime-route access floor, and selected Program route declaration's
  access requirement
  before serving the protected client shell
- AND an unauthenticated, incomplete, or unauthorized request receives its
  current continuation or forbidden outcome without relying on browser-cached
  session, schema, route, or replica facts

#### Scenario: Keep client Program routing within one runtime target

- GIVEN a ready Program client runtime is bound to one route id, target profile,
  target origin, and Program storage identity
- WHEN same-origin client routing selects another active Program screen within
  that target
- THEN the browser resolves the screen from the active Program route table and
  applies the server-resolved runtime-route access floor before its screen access
  requirement
- AND the route change does not issue a replacement document request or weaken,
  replace, or cross the bound runtime target
- AND history traversal selects the corresponding Program workspace through the
  same client route decision

#### Scenario: Product instance Program routes

- GIVEN the runtime profile is `instance`
- WHEN a management browser opens the default Program
- THEN `/` selects the product-owned runtime instance home within the Program
  shell without selecting a package workspace
- AND `/settings/routes` selects the route-management screen and
  `/settings/access` selects the dedicated access-management screen
- AND `/tasks` selects the package-owned Tasks workspace through its
  Program-owned path and `member` access requirement
- AND `/site`, `/site/settings`, `/site/contacts`, and `/site/subscribers`
  select package-owned Site screens through Program-owned paths and `member`
  access requirements
- AND Program navigation order comes from the materialized Program artifact
- AND Routes and Access each declare the schema-defined Program
  `administrator` role requirement
- AND the default Program does not claim raw deployment, principal,
  organization, invitation, policy, or instance-settings screen paths
- AND Tasks declares the schema-defined Program `member` role requirement
- AND Site screens declare the schema-defined Program `member` role requirement
- AND the client shell is eligible to render each selected screen for an active
  principal with protected owner authority or the schema-defined Program
  `administrator` role
- AND owner-only security and recovery behavior remains unavailable to a
  principal authorized only as Program administrator

#### Scenario: Product instance access management route

- GIVEN the runtime profile is `instance`
- WHEN a browser navigates to the active Program path for the `access` screen,
  `/settings/access` in the default Program
- THEN the client shell is eligible to render the dedicated access management
  surface
- AND the route is treated as a management instance browser surface unless an
  explicit route access policy requires owner access
- AND protected owner authority or the schema-defined Program `administrator`
  role satisfies the management route while identity summary reads,
  collaborator invitation creation, role grants, and destructive identity
  actions remain authorized by identity-control-plane management rules
- AND public Site routing, account orchestrator routes,
  account gate routes, and raw generated identity-control-plane record editing
  remain separate route families

#### Scenario: Replaced product screen path

- GIVEN a downstream Program replaces the `routes` or `access` screen module
  while preserving the stable screen key and selecting another valid path
- WHEN browser shell eligibility, screen admission, navigation, or product
  runtime behavior is resolved
- THEN the final materialized screen path selects that screen and its
  screen-key-bound runtime behavior
- AND the default path is not claimed, redirected, or reserved unless another
  active Program screen declares it
- AND account auth, Program API, local session, asset, and top-level published
  Site route families remain intrinsic outside screen composition
- AND portable surface mounts remain a separate Program schema registry rather
  than screens or literal runtime-profile paths

#### Scenario: Product instance account gate routes

- GIVEN a browser is on the configured auth origin
- WHEN it navigates to `/formless/auth/setup` or `/formless/auth/sign-in`
- THEN the runtime may redirect or render through the account orchestrator
  contract
- AND passkey ceremony API calls use the canonical instance auth origin
- AND auth route eligibility is origin-scoped reserved runtime behavior rather
  than an exclusive runtime profile
- AND when the configured auth origin is also the preferred admin origin, the
  same host can serve account gate routes and ordinary instance admin routes
  according to path and route access policy
- AND account gate routes do not become durable logged-in account surfaces

#### Scenario: Auth origin account orchestrator routes

- GIVEN a browser is on the configured auth origin
- WHEN it navigates to `/formless/auth` or a reserved account gate path under
  `/formless/auth/*`
- THEN the client shell is eligible to render the runtime-owned account
  orchestrator or account gate surface
- AND the route is reserved runtime auth behavior rather than a public Site
  document, Program screen, or static asset fallback
- AND protected target continuations remain governed by route access policy and
  account completion gates before the target surface is served
- AND mapped public Site and non-auth mapped instance hosts do not
  become WebAuthn relying parties by serving the account orchestrator routes

### Requirement: Route Access Policy

The system SHALL evaluate current Program route access after profile and
route-record selection and before protected browser or API behavior.

#### Scenario: Program screen admission

- GIVEN profile and route resolution select a Program browser screen
- WHEN admission is evaluated
- THEN the browser satisfies both the matched route access floor and the
  screen's explicit Program access requirement
- AND replica membership, path names, package keys, module keys, declaration
  order, or navigation membership do not infer route authority

#### Scenario: Program surface-mount admission

- GIVEN the instance profile selects a materialized browser or Worker surface
  mount
- WHEN admission is evaluated
- THEN the request satisfies both the matched exact-host route access floor and
  the mount's explicit Program access requirement before shell or SSR behavior
  runs
- AND anonymous HTML requests continue through the configured auth origin and
  target-bound handoff rules without receiving protected shell, Site records,
  media, or SSR output first
- AND authenticated access does not itself grant Program role, operation,
  management, or owner authority

#### Scenario: Authenticated Program route

- GIVEN a Program route has effective access `authenticated`
- WHEN the request carries a valid central, local-owner, or matching host-local
  session for an active principal and matched instance route
- THEN the route remains eligible
- AND authenticated access does not itself grant management, operation, or
  owner authority

#### Scenario: Management Program route

- GIVEN a Program route has effective access `management`
- WHEN the active principal has protected-owner authority or the schema-defined
  Program `administrator` role
- THEN the route remains eligible
- AND management access does not grant owner recovery or weaken an operation's
  independent access requirement

#### Scenario: Owner Program route

- GIVEN a Program route has effective access `owner`
- WHEN the active principal has current `instance.owner` authority
- THEN the route remains eligible
- AND stale signed session facts do not retain owner access

#### Scenario: Anonymous protected Program route

- GIVEN an authenticated, management, or owner Program route receives an HTML
  request without current matching authority
- WHEN the route is evaluated
- THEN the runtime continues through the configured auth origin and target-bound
  handoff rules
- AND it does not serve the protected Program shell or data first

#### Scenario: Protected Program API

- GIVEN a protected Program API request is received
- WHEN the current principal, route, or required Program role does not match
- THEN the runtime returns an unauthorized response
- AND route eligibility does not replace operation or owner-only authorization

#### Scenario: Anonymous route remains narrow

- GIVEN a current route has effective access `anonymous`
- WHEN the request is otherwise eligible
- THEN public Site documents, indexing resources, static assets, auth entry, and
  declared public operations remain available through their narrow routes
- AND anonymous route access does not expose Program bootstrap, schema,
  snapshot, sync, WebSocket, replica, or generic operation access

### Requirement: Program Surface Mount Resolution

The system SHALL resolve portable Program surface mounts by stable mount key on
the instance profile while keeping exact-host deployment mappings and
top-level published Site behavior as separate runtime-topology facts.

#### Scenario: Resolve an instance surface-mount subtree

- GIVEN the active Program materializes a browser or Worker surface mount
- WHEN an instance-profile `GET` or `HEAD` HTML request targets its exact path,
  optional trailing slash, or a nested segment-boundary path
- THEN route resolution returns the stable mount key, target, materialized base,
  nested suffix, and effective access requirement
- AND the exact mount root resolves the target surface's home route directly
- AND executable behavior is selected by mount key rather than literal path
- AND a downstream replacement stops claiming the previous path without an
  alias, compatibility redirect, or reserved-path remnant

#### Scenario: Preserve Worker routing precedence

- GIVEN an instance request is eligible for a materialized Worker surface mount
- WHEN the Worker dispatches the request
- THEN reserved API, auth, callback, media, static-asset, and development-module
  route ownership is evaluated before the mount
- AND the mount handler runs before public document handling, client-shell
  delivery, or SPA asset fallback
- AND a non-HTML or mutating request is not converted into preview SSR or shell
  delivery

#### Scenario: Share materialized mount facts across browser and Worker

- GIVEN browser and Worker builds use the same complete Program artifact
- WHEN either target resolves Site preview routing
- THEN both consume the same ordered materialized mount declarations and route
  access data
- AND browser history routing, direct Worker admission, SSR, hydration, and link
  generation do not maintain independent literal path registries

#### Scenario: Exclude previews from public Site hosts

- GIVEN the runtime profile is `publishedSite` or an enabled exact-host route
  selects a mapped public Site target
- WHEN a request matches text equal to an instance Site preview mount path
- THEN no Program preview mount is installed or admitted on that host
- AND the path remains eligible only as an ordinary public Site document slug
  under public Site route policy
- AND no preview access, Program replica, protected Site records, or preview
  redirect is exposed
- AND an enabled mapped instance route may admit the mounts after applying its
  exact-host route access floor
- AND exact-host target, access, redirect, and deployment intent remain
  instance control-plane state rather than portable surface-mount data

### Requirement: Published Site Documents

The system MUST route public Site documents through published Site behavior only when the request is a read request that accepts HTML and the published Site profile owns the path.

#### Scenario: Public document SSR

- GIVEN the runtime profile is `publishedSite`
- WHEN a `GET` or `HEAD` request for `/`, `/blog/post`, or another public Site document path accepts HTML
- THEN the request is handled as a published Site document
- AND the response uses public Site SSR instead of the client shell

#### Scenario: Published document adapter selection

- GIVEN the runtime profile or a route record selects the Program-native public
  Site target
- WHEN a public Site document request is eligible for SSR
- THEN route topology selects Program Site behavior before document rendering
- AND Worker document rendering is dispatched through the Site Worker surface
  selected explicitly by build-time runtime composition

#### Scenario: Non-document paths stay out of SSR

- GIVEN the runtime profile is `publishedSite`
- WHEN a request targets `/api/*`, `/formless/*`, `/tasks`,
  `/site/schema`, `/schema`, static asset-like paths, dynamic root icon paths,
  or a non-HTML request
- THEN the request is not handled as a published Site document

### Requirement: Static Assets And Dynamic Public Resources

The system SHALL distinguish static asset fallback from dynamic public Site resources.

#### Scenario: Static asset fallback

- GIVEN a browser-shell route or asset-like path is allowed by profile route policy
- WHEN the request is a `GET` or `HEAD` request
- THEN the request may fall back to static asset serving
- AND API requests and mutating requests do not fall back to static asset serving

#### Scenario: Dynamic public resources

- GIVEN the runtime profile is `publishedSite`
- WHEN a `GET` or `HEAD` request targets `/robots.txt`, `/sitemap.xml`, `/favicon.svg`, `/favicon.ico`, or `/apple-touch-icon.png`
- THEN the request is handled as a dynamic public Site resource
- AND dynamic root icon requests are not served from static asset fallback
- AND the resource body is produced by the explicitly composed Site Worker
  surface from Program storage

### Requirement: Mapped Hosts

The system SHALL route enabled exact-host route records before ordinary host
profile behavior.

#### Scenario: Mapped public Site host

- **GIVEN** an enabled exact-host `route` mounts the Program-native public Site
- **WHEN** the mapped host receives a public document request for `/` or a
  nested page path
- **THEN** the response is rendered from Program storage
- **AND** public links, indexing resources, root icons, and core media use
  top-level mapped-host paths
- **AND** instance shell routes, account orchestrator routes, account
  completion gate routes, and passkey ceremony requests are blocked on that host
- **AND** account setup and sign-in gate browser requests redirect to the
  configured auth origin when the mapped public Site host is not that origin
- **AND** public Site document, indexing, and icon behavior is selected from the
  explicitly composed Site Worker surface
- **AND** Program browser and Worker preview mounts are not installed on the
  mapped public Site host

#### Scenario: Mapped host auth callback

- **GIVEN** an enabled exact-host `route` mounts an instance admin or public
  Site host
- **WHEN** the mapped host receives `/formless/auth/callback`
- **THEN** runtime topology reserves the request for cross-domain auth grant
  consumption
- **AND** Program schemas, generated Program routes, public Site SSR, static
  asset fallback, schema-key routes, account gate routes, and passkey
  ceremony routes do not claim the callback path
- **AND** callback handling may issue only a host-local session for the matched
  route target before redirecting to a path-only return target

#### Scenario: Mapped instance admin host

- **GIVEN** an enabled exact-host `route` mounts the instance admin surface
- **WHEN** the mapped host receives browser requests for `/settings/routes`,
  `/settings/access`, or another active Program admin path
- **THEN** the client shell is served only after the matched route access policy
  is satisfied
- **AND** protected access on the mapped admin host uses cross-domain auth
  handoff and a host-local session when the mapped host is not the configured
  auth origin
- **AND** protected Program management API requests may use a
  host-local session bound to that admin route and target profile `instance`
- **AND** account setup, account sign-in, central auth session, and passkey
  ceremony routes are served on the mapped admin host only when that host is
  also the configured auth origin
- **AND** when the mapped admin host is not the configured auth origin, account
  gate browser requests redirect to the configured auth origin and passkey
  ceremony API requests do not run locally

### Requirement: Schema-Owned Runtime Route Resolution

The system SHALL combine materialized Program route declarations with enabled
schema-owned control-plane `route` records without merging their ownership or
lifecycle.

#### Scenario: Keep Program mounts separate from deployment mappings

- **GIVEN** the active Program declares screens and surface mounts while
  instance records declare hostless, exact-host, or redirect routes
- **WHEN** runtime topology resolves a request
- **THEN** Program declarations select stable screen or mount identity, path,
  target, and Program access
- **AND** control-plane route records select deployment host, target profile,
  route access floor, redirect, and enabled state
- **AND** neither source synthesizes, replaces, or persists the other

#### Scenario: Program-native Site public route

- **GIVEN** a browser requests an enabled public-Site mapping
- **WHEN** runtime topology resolves the route
- **THEN** public reads use Program storage identity `instance:control-plane`
- **AND** behavior uses the Site public runtime surface selected explicitly by
  build-time composition

#### Scenario: Disabled or conflicting route

- **GIVEN** a route record is disabled or conflicts with a reserved or
  already-enabled route
- **WHEN** runtime topology selects mountable routes
- **THEN** the route is not eligible for runtime mounting
- **AND** route validation prevents the conflict from becoming active

### Requirement: Unified Route Resolution

The system SHALL resolve enabled instance `route` records as the desired route
source for hostless mounts, exact-host mounts, and redirects.

#### Scenario: Route match selection

- **GIVEN** enabled route records exist
- **WHEN** runtime topology resolves a request
- **THEN** exact-host route matches are evaluated before hostless route matches
- **AND** more specific exact path matches are evaluated before prefix matches
- **AND** disabled route records are not eligible for runtime mounting or
  redirect handling

#### Scenario: Redirect route

- **GIVEN** an enabled redirect route matches the request host and path
- **WHEN** runtime topology resolves the request
- **THEN** the runtime returns the configured redirect status code and target
- **AND** preservePath and preserveQueryString policy are applied to the
  redirect location
- **AND** the redirect response is produced by the Worker when the request is
  delivered through the redirect source host custom domain

#### Scenario: Captured redirect host without matching path

- **GIVEN** an enabled redirect route captures a request host
- **AND** no enabled exact-host route matches the request path
- **WHEN** runtime topology resolves the request
- **THEN** the request does not fall through to hostless mounts or ordinary host
  profile behavior
- **AND** the runtime returns no route for normal not-found handling unless
  another exact-host route matches

### Requirement: Runtime Route Decision Module Boundary

The system SHALL resolve deterministic route-record selection and route-access
facts through runtime-topology Module interfaces before Worker adapters perform
host-specific request handling.

#### Scenario: Resolve route records from explicit runtime facts

- **GIVEN** active route records and a request host, path, and query are
  available
- **WHEN** runtime topology selects an exact-host mount, hostless mount,
  redirect, or captured-host not-found result
- **THEN** the route Module consumes those facts directly and returns the
  selected route, effective access, redirect, or not-found result
- **AND** deterministic route selection does not require Durable Object,
  SQLite, service-binding, asset, or Worker interfaces
- **AND** exact-host precedence, path specificity, redirect preservation, and
  disabled-route exclusion remain unchanged

#### Scenario: Keep mounted surface behavior at the Worker boundary

- **GIVEN** runtime topology has selected a route result
- **WHEN** the request is served through an exact-host or hostless runtime route
- **THEN** the real Worker remains responsible for fetching current Program
  records, reserved callback ownership, HTTP redirects, public Site adapters,
  document rendering, indexing, icons, media, static assets,
  and response headers
- **AND** Module-owned route decision coverage does not replace representative
  complete mapped Site, mapped instance, redirect, adapter failure, and
  desired-route disablement contracts

### Requirement: Local Workspace Gateway Route Policy

The system SHALL expose workspace gateway API routes only for a local instance
runtime with explicit gateway sidecar proxy configuration.

#### Scenario: Shared gateway route policy fact

- **WHEN** Worker runtime routing or local Node runtime proxy composition derives
  workspace gateway route availability for a request
- **THEN** Worker and local Node runtime adapters derive an explicit capability
  from the `instance` profile, sidecar target, gateway enabled, proxy token, and
  exact-host mapped-route facts
- **AND** the `instance` profile alone does not make the workspace gateway API
  route family available
- **AND** the `publishedSite` profile and exact-host mapped routes do not expose
  the workspace gateway API route family
- **AND** adapters inject resolved route availability and sidecar target facts
  into Gateway proxy rules
- **AND** the Gateway package consumes injected route availability and sidecar
  target facts without owning runtime topology selection

#### Scenario: Local instance gateway route

- **WHEN** a local workspace runtime handles a request for the workspace gateway
  API family
- **THEN** the route is eligible only when the runtime is serving a local
  workspace with `FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL` and
  `FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN` configured
- **AND** the route can proxy semantic workspace operations for that workspace
  root to the local sidecar
- **AND** the Worker runtime does not require or receive filesystem adapters to
  make the route eligible

#### Scenario: Deployed runtime blocks gateway route

- **WHEN** an instance or published Site runtime without
  `FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL` and
  `FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN` handles a request for the workspace
  gateway API family
- **THEN** the route is unavailable
- **AND** the runtime does not expose workspace filesystem operation behavior or
  sidecar proxy behavior

#### Scenario: Gateway does not affect Program routing

- **WHEN** Program screens, surface mounts, public Site routes, schema-key
  routes, or static assets are resolved
- **THEN** workspace gateway route policy is evaluated separately
- **AND** Program route resolution continues to use runtime profile,
  materialized Program declarations, and schema-owned control-plane `route`
  records
