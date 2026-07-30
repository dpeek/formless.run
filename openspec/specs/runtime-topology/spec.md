# Runtime Topology Specification

## Purpose

Runtime topology defines the observable profile, route policy, route access,
mapped host, and request routing contracts for a Formless instance. It keeps
product instance, dev workbench, app, Site authoring, and published Site
behavior coherent across browser shells, APIs, static assets, SSR documents,
indexing, icons, public Site routes, cross-domain auth callback routes, and
local workspace gateway route eligibility.

## Requirements

### Requirement: Profile Resolution

The system SHALL resolve each runtime request to one runtime profile kind: `instance`, `dev`, `app`, `siteAuthoring`, or `publishedSite`.

#### Scenario: Explicit profile wins

- GIVEN a request host that would otherwise infer `publishedSite`
- WHEN an explicit runtime profile of `instance` is configured
- THEN the request uses the `instance` profile
- AND route policy is selected from the `instance` profile

#### Scenario: Host convention infers profile

- GIVEN no explicit runtime profile is configured
- WHEN the hostname starts with `app.`, `instance.`, `site-authoring.`, or `published-site.`
- THEN the request resolves to the matching `app`, `instance`, `siteAuthoring`, or `publishedSite` profile
- AND a `*.workers.dev` host resolves to `publishedSite`

### Requirement: Profile Route Policy

The system MUST apply profile route policy before selecting browser shell, API,
static asset, SSR handling, or local workspace gateway proxy behavior. Installed
app API routes are always enabled; schema-key API routes are unavailable only in
the product instance profile.

#### Scenario: Product instance route policy

- GIVEN the runtime profile is `instance`
- WHEN a request targets schema-key browser or schema-key API routes
- THEN those schema-key routes are not available
- AND the Program browser and `/api/formless/program` route family, installed
  app API routes, installed app browser routes, installed Site public routes,
  account auth routes, principal-backed browser session routes, instance browser
  routes, and the workspace gateway API route family remain route-policy
  eligible

#### Scenario: Dev route policy

- GIVEN the runtime profile is `dev`
- WHEN a request targets the Program, bundled source app, installed app,
  installed Site, instance, account auth, schema-key API, or workspace gateway
  API routes
- THEN those route families remain available
- AND the dev workbench can compose source app and product instance surfaces together

### Requirement: Browser Route Mounts

The system SHALL mount browser surfaces according to the active runtime profile.

#### Scenario: Product instance browser routes

- GIVEN the runtime profile is `instance`
- WHEN a browser navigates to `/`, `/apps`, `/routes`, `/deployments`,
  `/organizations`, `/access`, `/invitations`, `/policies`, `/settings`,
  `/apps/<installId>`, `/apps/<installId>/*`, `/sites/<installId>`, or
  `/sites/<installId>/*`
- THEN the request is eligible for the client shell
- AND a default installed-app admin route matches its exact base and generated
  nested screen paths through `/apps/<installId>/`
- AND a more-specific exact path or longer nested route outranks that base
  admin prefix
- AND source app routes such as `/tasks`, `/crm/audiences`, `/site/schema`, and
  `/pages/home` are not eligible instance browser routes

#### Scenario: Product instance Program routes

- GIVEN the runtime profile is `instance`
- WHEN a management browser opens the default Program
- THEN `/` selects the root-owned principals screen and `/settings` selects
  Instance Settings
- AND `/apps` selects the root-owned screen that composes app installs and app
  registrations
- AND Program navigation order comes from the materialized Program artifact
- AND Apps, Routes, Deployments, Principals, Organizations, Access, Invitations,
  Policies, and Settings each declare the schema-defined Program
  `administrator` role requirement
- AND the client shell is eligible to render each selected screen for an active
  principal with protected owner authority or the schema-defined Program
  `administrator` role
- AND owner-only security and recovery behavior remains unavailable to a
  principal authorized only as Program administrator

#### Scenario: Product instance access management route

- GIVEN the runtime profile is `instance`
- WHEN a browser navigates to `/access`
- THEN the client shell is eligible to render the dedicated access management
  surface
- AND the route is treated as a management instance browser surface unless an
  explicit route access policy requires owner access
- AND protected owner authority or the schema-defined Program `administrator`
  role satisfies the management route while identity summary reads,
  collaborator invitation creation, role grants, and destructive identity
  actions remain authorized by identity-control-plane management rules
- AND installed app routing, public Site routing, account orchestrator routes,
  account gate routes, and raw generated identity-control-plane record editing
  remain separate route families

#### Scenario: Product instance deployment route

- GIVEN the runtime profile is `instance`
- WHEN a browser navigates to `/deployments`
- THEN the client shell is eligible to render the schema-owned Program
  deployment screen
- AND the screen requires the schema-defined Program `administrator` role or
  protected owner authority
- AND deployment operations, provider cleanup, credential handling, and owner
  recovery retain their independently evaluated authorization requirements
- AND installed app routing, public Site routing, account orchestrator routes,
  and account gate routes remain separate route families

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
- AND the route is reserved runtime auth behavior rather than an installed app,
  public Site document, source app screen, generated identity-control-plane
  editor, schema-key route, or static asset fallback
- AND protected target continuations remain governed by route access policy and
  account completion gates before the target surface is served
- AND mapped app, mapped public Site, and non-auth mapped instance hosts do not
  become WebAuthn relying parties by serving the account orchestrator routes

#### Scenario: App profile mounts one app

- GIVEN the runtime profile is `app`
- WHEN a browser navigates to `/` or an app screen path such as `/schema`
- THEN the selected installed app is mounted as the app surface
- AND `/schema` is not reserved for frontend schema editing

#### Scenario: Site authoring profile mounts preview and admin

- GIVEN the runtime profile is `siteAuthoring`
- WHEN a browser navigates to `/` or `/admin`
- THEN the public Site preview and generated Site admin are mounted in the same profile

### Requirement: Route Access Policy

The system SHALL evaluate route access after runtime profile route eligibility
and enabled route-record resolution, and before serving protected browser
surfaces or protected management API data.

#### Scenario: Resolve effective Program screen admission

- GIVEN profile and enabled route-record resolution select a Program browser
  screen
- WHEN runtime topology resolves effective browser admission
- THEN it combines the matched route access floor with the selected screen's
  browser access requirement
- AND the browser must satisfy both requirements
- AND an authenticated, management, or owner route floor cannot be weakened by
  a less restrictive screen
- AND a stricter screen can narrow a less restrictive route
- AND on the default instance host, the selected Program screen requirement
  replaces hard-coded access classification by pathname
- AND direct entry, mapped-host entry, account continuation, route-target
  session status, and client navigation identify the same concrete screen
  target and requirement

#### Scenario: Reject missing Program screen admission

- GIVEN a browser path selects the active Program
- WHEN no declared Program screen and explicit screen access requirement
  resolves for that path
- THEN runtime does not infer access from the path, primary navigation,
  declaration order, module key, schema key, or Program replica membership
- AND protected Program presentation fails closed before serving the screen or
  protected data

#### Scenario: Anonymous authenticated browser route

- GIVEN a runtime browser route has effective access `authenticated`
- AND the request is a `GET` or `HEAD` request that accepts HTML
- WHEN the request does not include a valid session for an active principal on
  the matched host, route, target profile, and target app install or storage
  identity
- THEN the runtime redirects to `/formless/auth` on the configured auth origin
  through safe return-target or target-bound handoff rules
- AND the authenticated browser shell, generated app surface, public Site
  document, or app screen is not served before authentication completes

#### Scenario: Authenticated browser route

- GIVEN a runtime browser route has effective access `authenticated`
- WHEN the request includes a valid central auth session on the configured auth
  origin, local-dev owner session, or host-local session for an active principal
  on the matched host, route, target profile, and target app install or storage
  identity
- THEN the route remains eligible for the matching browser shell, generated app
  surface, public Site document, or app screen
- AND `authenticated` access does not by itself grant owner-only instance
  management authority

#### Scenario: Management browser route

- GIVEN a runtime browser route has effective access `management`
- WHEN the request includes a valid central auth session on the configured auth
  origin, local-dev owner session, or matching host-local session for an active
  principal with protected owner authority or the schema-defined Program
  `administrator` role
- THEN the route remains eligible for the instance settings or access
  management surface
- AND `management` remains presentation and route-admission terminology whose
  authoritative Program check is the shared `{ role: "administrator" }`
  requirement
- AND owner recovery, owner-role management, auth-origin policy, browser
  session signing policy, and admin-bearer recovery remain owner-only

#### Scenario: Anonymous management browser route

- GIVEN a runtime browser route has effective access `management`
- AND the request is a `GET` or `HEAD` request that accepts HTML
- WHEN the request does not include a valid session for an active principal
- THEN the runtime redirects through `/formless/auth` on the configured auth
  origin
- AND credential entry uses generic account sign-in without selecting or
  disclosing the configured owner
- AND after authentication the account orchestrator evaluates the resolved
  principal's current management authority before serving the route

#### Scenario: Authenticated principal without management authority

- GIVEN a runtime browser route has effective access `management`
- AND the request includes a valid session for an active principal without
  protected owner authority or the schema-defined Program `administrator` role
- WHEN the runtime evaluates the route
- THEN it does not serve the management surface
- AND the account orchestrator returns a display-safe forbidden outcome instead
  of restarting account sign-in

#### Scenario: Program replica access does not open management routes

- GIVEN an active principal satisfies the Program `{ role: "member" }` replica
  requirement but not the `{ role: "administrator" }` management requirement
- WHEN the principal requests a management browser route
- THEN the runtime does not serve the management surface
- AND possession of a complete local Program replica is treated as read access,
  not route or operation authority
- AND editor or member role authority does not become administrator or owner
  authority

#### Scenario: App role browser route

- GIVEN an app route has effective access `authenticated`
- AND the route requires `app.admin`
- WHEN the request includes a valid central auth session on the configured auth
  origin, local-dev owner session, or matching host-local session
- THEN the route remains eligible only when the principal has active
  `app.admin` authority at app-install scope for the route's referenced app
  install or has active `instance.owner` authority
- AND the schema-defined Program `administrator` role, a role for another app
  install, or an ordinary authenticated session does not satisfy the route
  requirement

#### Scenario: Anonymous owner browser route

- GIVEN a runtime browser route has effective access `owner`
- AND the request is a `GET` or `HEAD` request that accepts HTML
- WHEN the request does not include a valid central auth session on the
  configured auth origin, local-dev owner session, or host-local session for an
  active principal with active `instance.owner` authority
- THEN the runtime redirects to `/formless/auth` on the configured auth origin,
  or starts cross-domain auth handoff when the matched host is not the
  configured auth origin
- AND the owner-only browser shell, instance dashboard, generated app surface,
  or app screen is not served

#### Scenario: Anonymous mapped protected browser route

- GIVEN a mapped host runtime browser route has effective access
  `authenticated`, `management`, or `owner`, including an authenticated route
  with a required app role
- AND the mapped host is not the configured auth origin
- AND the request is a `GET` or `HEAD` request that accepts HTML
- WHEN the request does not include a valid host-local session for the mapped
  host, route, target profile, and target app install or storage identity
- THEN the runtime starts cross-domain auth handoff through a top-level
  redirect to the configured auth origin
- AND the handoff records a host-local nonce and a safe path-only return target
  for the original path and query
- AND the mapped host does not serve the protected browser shell, generated app
  surface, public Site document, or app screen before the handoff completes

#### Scenario: Authenticated owner browser route

- GIVEN a runtime browser route has effective access `owner`
- WHEN the request includes a valid central auth session on the configured auth
  origin, local-dev owner session, or host-local session for an active principal
  with active `instance.owner` authority
- THEN the route remains eligible for the matching instance dashboard,
  generated app surface, or app screen
- AND deployed auth-origin owner access may be satisfied by a central auth
  session whose principal still has active `instance.owner` authority

#### Scenario: Anonymous route remains public

- GIVEN a runtime browser route has effective access `anonymous`
- WHEN the request is otherwise eligible for the active runtime profile
- THEN the route can be served without a principal-backed browser session
- AND account orchestrator routes, account gate routes, installed Site public
  routes, published Site documents, public Site resources, static assets, and
  public actions remain available according to their existing route policies

#### Scenario: Authenticated app API route

- GIVEN a browser API route is protected by effective access `authenticated`
- WHEN the request does not include a valid central auth session on the
  configured auth origin, local-dev owner session, or host-local session for an
  active principal on the matched host, route, target profile, and target app
  install or storage identity
- THEN the runtime returns an unauthorized JSON response
- AND route access does not replace operation actor policy for generated app
  reads, writes, or command execution

#### Scenario: Installed app admin API authorization

- GIVEN a generated admin app uses an installed app API for bootstrap, schema
  read, HTTP sync, push sync, or an entity operation
- WHEN the request is authorized
- THEN the app data boundary independently requires active `instance.owner`
  authority or active `app.admin` authority scoped to that app install
- AND browser route eligibility does not authorize another app install or make
  any installed app data available to every authenticated principal
- AND entity operation actor policy is still evaluated after app data access
  succeeds

#### Scenario: Owner management API route

- GIVEN a management API route exposes owner-only instance dashboard or
  generated app administration data
- WHEN the request does not include a valid central auth session on the
  configured auth origin, local-dev owner session for an active principal with
  active `instance.owner` authority, valid host-local session for the matched
  owner-only route target, or valid admin bearer authorization
- THEN the runtime returns an unauthorized JSON response
- AND public Site document reads, public Site indexing resources, public
  actions, and public route discovery needed for anonymous Site rendering are
  not made owner-only by that management API guard

#### Scenario: Mapped instance host management API route

- GIVEN an enabled exact-host `route` mounts the instance profile with
  effective access `management` or `owner`
- AND a browser has completed cross-domain auth handoff for that mapped
  instance host route
- WHEN the browser requests operational Program management API
  reads or writes through that mapped host
- THEN the runtime authorizes the request with the host-local session only when
  the session is valid for the same host, route, target profile, and
  `instance:control-plane` storage identity
- AND the runtime still rejects host-local sessions minted for a different
  mapped host, app install, route, profile, storage identity, or instance
- AND the request does not require the central auth origin session cookie to be
  scoped to the mapped instance host

### Requirement: Published Site Documents

The system MUST route public Site documents through published Site behavior only when the request is a read request that accepts HTML and the published Site profile owns the path.

#### Scenario: Public document SSR

- GIVEN the runtime profile is `publishedSite`
- WHEN a `GET` or `HEAD` request for `/`, `/blog/post`, or another public Site document path accepts HTML
- THEN the request is handled as a published Site document
- AND the response uses public Site SSR instead of the client shell

#### Scenario: Published document adapter selection

- GIVEN the runtime profile or a route record selects an installed app whose
  resolved package declares public Site runtime support
- WHEN a public Site document request is eligible for SSR
- THEN route topology selects the target app install and package app key before
  document rendering
- AND Worker document rendering is dispatched through the registered public Site
  adapter for that package app key
- AND no published document path is rendered by hard-coding the bundled `site`
  package implementation when the selected package has no adapter

#### Scenario: Non-document paths stay out of SSR

- GIVEN the runtime profile is `publishedSite`
- WHEN a request targets `/api/*`, `/formless/*`, `/tasks`, `/crm/audiences`, `/site/schema`, `/schema`, `/apps/<installId>`, `/sites/<installId>`, static asset-like paths, dynamic root icon paths, or a non-HTML request
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
- AND the resource body is produced by the public Site adapter selected for the
  target package app key

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

- **GIVEN** an enabled exact-host `route` mounts a public Site for an installed
  Site app
- **WHEN** the mapped host receives a public document request for `/` or a
  nested page path
- **THEN** the response is rendered from that installed Site storage
- **AND** public links, indexing resources, root icons, and core media use
  top-level mapped-host paths
- **AND** generated app routes, schema-key routes, instance shell routes,
  account orchestrator routes, account completion gate routes, and passkey
  ceremony requests are blocked on that host
- **AND** account setup and sign-in gate browser requests redirect to the
  configured auth origin when the mapped public Site host is not that origin
- **AND** public Site document, indexing, and icon behavior is selected from the
  package runtime adapter registered for the route target's package app key

#### Scenario: Mapped host auth callback

- **GIVEN** an enabled exact-host `route` mounts an instance admin, app, or
  public Site host
- **WHEN** the mapped host receives `/formless/auth/callback`
- **THEN** runtime topology reserves the request for cross-domain auth grant
  consumption
- **AND** app schemas, generated app routes, public Site SSR, clean redirects,
  static asset fallback, schema-key routes, account gate routes, and passkey
  ceremony routes do not claim the callback path
- **AND** callback handling may issue only a host-local session for the matched
  route target before redirecting to a path-only return target

#### Scenario: Mapped app host

- **GIVEN** an enabled exact-host `route` mounts an app surface for an installed
  app
- **WHEN** the mapped host receives browser requests for `/` or an app screen
  path such as `/schema`
- **THEN** the client shell is served with runtime profile, package app key,
  app install id, and resolved package metadata for that install
- **AND** the resolved package metadata is sufficient for the browser to build
  install-scoped storage identity and mount the generated app without bundled
  source app lookup
- **AND** schema-key API routes are not exposed on the mapped app host while
  the matching installed app API route remains available
- **AND** account setup and sign-in gate browser requests redirect to the
  configured auth origin when the mapped app host is not that origin
- **AND** account setup, account sign-in, and passkey ceremony requests do not
  treat the mapped app host as a WebAuthn relying party
- **AND** owner-only access on the mapped app host uses cross-domain auth
  handoff and a host-local session instead of local account sign-in or passkey
  ceremony routes

#### Scenario: Mapped instance admin host

- **GIVEN** an enabled exact-host `route` mounts the instance admin surface
- **WHEN** the mapped host receives browser requests for `/`, `/access`,
  `/deployments`, `/apps/<installId>`, or another instance admin path
- **THEN** the client shell is served only after the matched route access policy
  is satisfied
- **AND** protected access on the mapped admin host uses cross-domain auth
  handoff and a host-local session when the mapped host is not the configured
  auth origin
- **AND** protected Program management API requests may use a
  host-local session bound to that admin route, target profile `instance`, and
  storage identity `instance:control-plane`
- **AND** schema-key browser routes, source app routes, and unrelated installed
  app storage identities are not exposed through the mapped admin host
- **AND** account setup, account sign-in, central auth session, and passkey
  ceremony routes are served on the mapped admin host only when that host is
  also the configured auth origin
- **AND** when the mapped admin host is not the configured auth origin, account
  gate browser requests redirect to the configured auth origin and passkey
  ceremony API requests do not run locally

### Requirement: Schema-Owned App Route Resolution

The system SHALL resolve installed app browser routes and installed Site public
routes from enabled schema-owned `route` records.

#### Scenario: Installed app browser route

- **GIVEN** a browser requests an enabled admin app route
- **WHEN** runtime topology resolves the route
- **THEN** the route record resolves through `appInstall` to its referenced
  `app-install` record
- **AND** the selected installed app mounts with that app install identity

#### Scenario: Installed Site public route

- **GIVEN** a browser requests an enabled public Site route
- **WHEN** runtime topology resolves the route
- **THEN** the route record resolves through `appInstall` to its referenced
  Site `app-install` record
- **AND** public Site reads use the matching install-scoped app storage
  identity
- **AND** public Site runtime behavior is dispatched through the package
  adapter registered for that app install's package app key

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

#### Scenario: Hostless mount preserves configured profile policy

- **GIVEN** an `instance` or `dev` runtime resolves an enabled hostless mount
  for an installed app
- **WHEN** route access or account continuation is evaluated for that mount
- **THEN** the configured runtime profile remains the active route-policy
  profile
- **AND** the mount still supplies its target app install, target profile,
  storage identity, route access, and surface selection facts
- **AND** an owner-protected hostless app mount is not reclassified as an
  anonymous app-profile route

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

- **GIVEN** active route records, installed app records, package facts, and a
  request host, path, and query are available
- **WHEN** runtime topology selects an exact-host mount, hostless mount,
  redirect, or captured-host not-found result
- **THEN** the route Module consumes those facts directly and returns the
  selected route, target storage identity, effective access, redirect, or
  not-found result
- **AND** deterministic route selection does not require Durable Object,
  SQLite, service-binding, asset, or Worker interfaces
- **AND** exact-host precedence, path specificity, redirect preservation,
  disabled-route exclusion, and app-install target resolution remain unchanged

#### Scenario: Keep mounted surface behavior at the Worker boundary

- **GIVEN** runtime topology has selected a route result
- **WHEN** the request is served through an exact-host or hostless runtime route
- **THEN** the real Worker remains responsible for fetching current Program
  records, reserved callback ownership, HTTP redirects, public Site adapters,
  document rendering, indexing, icons, media, installed app APIs, static assets,
  and response headers
- **AND** Module-owned route decision coverage does not replace representative
  complete mapped Site, mapped app, mapped instance, redirect, adapter failure,
  and desired-route disablement contracts

### Requirement: Local Workspace Gateway Route Policy

The system SHALL expose workspace gateway API routes only for local workspace
runtime profiles that have local gateway sidecar proxy configuration.

#### Scenario: Shared gateway route policy fact

- **WHEN** Worker runtime routing or local Node runtime proxy composition derives
  workspace gateway route availability for a request
- **THEN** shared runtime topology route policy marks the workspace gateway API
  route family eligible only for the `instance` and `dev` runtime profiles
- **AND** the `app`, `siteAuthoring`, and `publishedSite` runtime profiles mark
  the workspace gateway API route family unavailable
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

- **WHEN** an instance, app, site-authoring, or published Site runtime without
  `FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL` and
  `FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN` handles a request for the workspace
  gateway API family
- **THEN** the route is unavailable
- **AND** the runtime does not expose workspace filesystem operation behavior or
  sidecar proxy behavior

#### Scenario: Gateway does not affect app routing

- **WHEN** installed app browser routes, installed Site public routes,
  schema-key routes, or static assets are resolved
- **THEN** workspace gateway route policy is evaluated separately
- **AND** app route resolution continues to use runtime profile and
  schema-owned `route` records
