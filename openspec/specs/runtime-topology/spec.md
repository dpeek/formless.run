# Runtime Topology Specification

## Purpose

Runtime topology defines the observable profile, route policy, route access,
mapped host, and request routing contracts for a Formless instance. It keeps
product instance, dev workbench, and published Site
behavior coherent across browser shells, APIs, static assets, SSR documents,
indexing, icons, public Site routes, cross-domain auth callback routes, and
local workspace gateway route eligibility.

## Requirements

### Requirement: Profile Resolution

The system SHALL resolve each runtime request to one runtime profile kind:
`instance`, `dev`, or `publishedSite`.

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

### Requirement: Profile Route Policy

The system MUST apply profile route policy before selecting browser shell, API,
static asset, SSR handling, or local workspace gateway proxy behavior. The
Program API is the only generic data route family.

#### Scenario: Product instance route policy

- GIVEN the runtime profile is `instance`
- WHEN a request targets browser or API behavior
- THEN the Program browser and `/api/formless/program` route family,
  Program-native Site preview and public routes, account auth routes,
  principal-backed browser session routes, instance browser routes, and the
  workspace gateway API route family remain route-policy eligible

#### Scenario: Dev route policy

- GIVEN the runtime profile is `dev`
- WHEN a request targets the Program, Program public Site,
  instance, account auth, or workspace gateway API routes
- THEN those route families remain available
- AND the dev workbench composes Program and product instance surfaces together
- AND Tasks, Site, and CRM are available through Program-owned paths

### Requirement: Browser Route Mounts

The system SHALL mount browser surfaces according to the active runtime profile.

#### Scenario: Product instance browser routes

- GIVEN the runtime profile is `instance`
- WHEN a browser navigates to `/tasks`, `/site`, `/site/settings`,
  `/site/contacts`, `/site/subscribers`, `/pages`, `/pages/*`,
  `/settings/routes`, or `/settings/access`
- THEN the request is eligible for the client shell
- AND route selection uses the Program route table

#### Scenario: Authorize a direct Program deep link

- GIVEN a document request targets an active Program screen on the default
  instance host or an enabled mapped instance route
- WHEN runtime topology selects the browser surface
- THEN server admission evaluates the current session, account completion,
  matched runtime-route access floor, and selected screen access requirement
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
- THEN `/settings/routes` selects the route-management screen and
  `/settings/access` selects the dedicated access-management screen
- AND `/tasks` selects the package-owned Tasks workspace through its
  Program-owned path and `member` access requirement
- AND `/site`, `/site/settings`, `/site/contacts`, and `/site/subscribers`
  select package-owned Site screens through Program-owned paths and `member`
  access requirements
- AND `/crm`, `/crm/audiences`, `/crm/campaigns`, and `/crm/broadcasts` select
  package-owned CRM screens through Program-owned paths and `member` access
  requirements
- AND `/pages` and nested `/pages/*` paths select the authenticated
  Program-native Site preview
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
- AND account auth, Program API, local session, asset, public Site, and other
  intrinsic runtime route families remain fixed outside screen composition

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
- WHEN a request targets `/api/*`, `/formless/*`, `/tasks`, `/crm/audiences`,
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

### Requirement: Published Site Clean Redirects

The system SHALL redirect published Site collection paths to their clean public
paths.

#### Scenario: Clean published redirects

- GIVEN the runtime profile is `publishedSite`
- WHEN a read request targets `/pages`, `/pages/home`, or `/pages/blog/agents?ref=preview`
- THEN the system redirects with status `308`
- AND the redirect locations are `/`, `/`, and `/blog/agents?ref=preview`

#### Scenario: Non-published profiles do not apply preview redirects

- GIVEN the runtime profile is not `publishedSite`
- WHEN a request targets a `/pages/*` path
- THEN no published Site preview redirect is applied

#### Scenario: Ineligible published paths do not apply preview redirects

- GIVEN the runtime profile is `publishedSite`
- WHEN a request targets an API path, an asset-like preview path, or uses a mutating method
- THEN no published Site preview redirect is applied

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

#### Scenario: Mapped host auth callback

- **GIVEN** an enabled exact-host `route` mounts an instance admin or public
  Site host
- **WHEN** the mapped host receives `/formless/auth/callback`
- **THEN** runtime topology reserves the request for cross-domain auth grant
  consumption
- **AND** Program schemas, generated Program routes, public Site SSR, clean redirects,
  static asset fallback, schema-key routes, account gate routes, and passkey
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

The system SHALL resolve Program browser routes and the Program-native public
Site from enabled schema-owned `route` records.

#### Scenario: Program-native Site public route

- **GIVEN** a browser requests the default Program Site preview or an enabled
  public-Site mapping
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

The system SHALL expose workspace gateway API routes only for local workspace
runtime profiles that have local gateway sidecar proxy configuration.

#### Scenario: Shared gateway route policy fact

- **WHEN** Worker runtime routing or local Node runtime proxy composition derives
  workspace gateway route availability for a request
- **THEN** shared runtime topology route policy marks the workspace gateway API
  route family eligible only for the `instance` and `dev` runtime profiles
- **AND** the `publishedSite` runtime profile marks the workspace gateway API
  route family unavailable
- **AND** Worker and local Node runtime adapters may combine that shared route
  policy fact with adapter-local sidecar target, gateway enabled, proxy token,
  and mapped-host facts before injecting route availability into Gateway proxy
  rules
- **AND** the Gateway package consumes injected route availability and sidecar
  target facts without owning runtime topology selection

#### Scenario: Local dev gateway route

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

- **WHEN** Program browser routes, Program public Site routes, schema-key routes,
  or static assets are resolved
- **THEN** workspace gateway route policy is evaluated separately
- **AND** Program route resolution continues to use runtime profile and
  schema-owned `route` records
