# Instance Auth Specification

## Purpose

Instance auth owns product instance passkey credentials, WebAuthn challenge
ceremonies, canonical auth origin policy, central auth sessions, local-dev
owner session issuance, host-local sessions, cross-domain handoff grants,
account completion gates, collaborator invitation token state, logout, and
admin bearer recovery boundaries. Reviewable owner identity, owner
authority, pending invitation facts, and policy acceptance facts are stored as
identity control-plane principal, principal-email, invitation, membership,
Program role-assignment, protected-owner role-assignment, account-policy, and
principal-policy-acceptance records.

## Requirements

### Requirement: Program-Native Auth Targets

The system SHALL authorize browser access only against the complete Program and
current Program route targets.

#### Scenario: Auth target identity

- GIVEN sign-in, invitation acceptance, account completion, central-session
  continuation, or cross-domain handoff resolves a protected target
- WHEN the target is validated or a host-local session is minted
- THEN target facts bind only the current instance, Program storage identity,
  current route id, target profile, host, and safe path-only continuation
- AND Program roles and protected-owner roles are the authorization principals

#### Scenario: Dormant non-Program auth state is unselected

- GIVEN Program records or private auth state contain dormant non-Program
  registration, continuation, handoff, session-target, or role facts
- WHEN current account or authorization state is resolved
- THEN those facts are not selected and confer no route, Program, operation,
  media, replica, or session authority
- AND the runtime does not migrate, rewrite, clean up, alias, or expose a
  compatibility or legacy rejection surface for that dormant state

### Requirement: Instance Auth Configuration

The system SHALL store explicit instance auth configuration for passkey
ceremonies.

#### Scenario: Canonical auth origin

- GIVEN a Formless instance has auth configured
- WHEN a passkey registration or login ceremony is started
- THEN the ceremony options use the configured canonical origin and WebAuthn
  relying-party id
- AND the relying-party id is not inferred from an arbitrary mapped request host

#### Scenario: Production auth uses primary route identity

- GIVEN an instance has selected a primary route as its production identity
- WHEN production passkey registration or login ceremonies are configured
- THEN canonical origin and relying-party id are derived from that selected
  route or explicit instance settings
- AND workers.dev origin remains a bootstrap or preview identity unless the
  owner explicitly selects it as production identity

#### Scenario: Local workspace auth uses the browser-facing local origin

- GIVEN `formless dev` is running a local workspace runtime
- AND workspace control-plane records contain a deployed production identity
- WHEN the runtime selects its effective auth origin for request routing,
  passkeys, sessions, or redirects
- THEN an explicit runtime auth-origin setting continues to take precedence
- AND otherwise the effective auth origin is derived from the browser-facing
  local request origin, including forwarded host and protocol facts
- AND the deployed production identity does not contribute to local runtime auth
  configuration
- AND changed local dev ports or named proxy origins can replace stale persisted
  local auth configuration even after the local owner exists
- AND production runtimes continue deriving auth configuration from the deployed
  production identity when no explicit runtime auth origin is configured

#### Scenario: Missing auth configuration

- GIVEN owner setup or passkey login requires instance auth configuration
- WHEN canonical origin or relying-party id is missing
- THEN the ceremony request is rejected with a configuration error
- AND no principal, role assignment, credential, challenge, or session state is
  written

#### Scenario: Owner setup status reports configured origins

- GIVEN first-owner setup is incomplete
- WHEN a trusted CLI reads owner setup status from a deployed instance
- THEN the status response includes `authOrigin` with the effective auth origin when instance
  auth configuration selects one
- AND the status response includes `adminOrigin` with the preferred admin origin when instance
  control-plane settings or route records select one
- AND if no effective auth origin is configured, the status response does not
  invent one from the workers.dev deployment host
- AND if no preferred custom admin route exists, the status response may report
  the deployment target URL as the admin fallback without treating it as the
  auth origin

#### Scenario: Primary domain activation before production owner credentials

- GIVEN a deployed instance has only a workers.dev bootstrap origin
- WHEN the owner principal attempts to create production owner passkey
  credentials
- THEN the runtime requires configured canonical auth origin and relying-party
  id before accepting the ceremony
- AND local-dev bootstrap sessions and preview deployment remain available
  without creating production passkey credentials

### Requirement: Production First Owner Account Setup

The system SHALL complete deployed first-owner setup through the auth-origin
account journey after verifying the owner's primary email and passkey.

#### Scenario: Start owner setup through the account journey

- GIVEN first-owner setup is incomplete
- AND a valid owner setup capability exists for the instance
- AND a browser opens `/formless/auth/setup` on the configured auth origin
- WHEN the browser submits its required display name and primary email
- THEN the account orchestrator validates the capability for the host-derived
  instance
- AND the setup surface collects a required display name and required primary
  email
- AND starting setup creates a private `owner-setup` email challenge bound to
  the setup capability hash, instance, auth origin, and runtime-owned
  continuation
- AND missing auth or email-delivery configuration is rejected before creating
  the challenge
- AND starting setup does not create a principal, principal-email, credential,
  role assignment, session, app install, route, or handoff grant

#### Scenario: Register owner passkey after verified email

- GIVEN a valid owner setup capability has an unexpired verified email proof
  for its required primary email
- WHEN the browser requests passkey registration options on the configured auth
  origin
- THEN the one-time registration challenge is bound to the setup capability,
  verified email proof, instance, auth origin, and relying-party id
- AND the options require a discoverable resident credential with required user
  verification
- AND the WebAuthn user id is the deterministic principal id that will own the
  credential when setup completes
- AND passkey options are not issued for an unverified, expired, revoked,
  consumed, wrong-capability, wrong-instance, or wrong-origin email proof

#### Scenario: Complete production owner setup

- GIVEN a valid owner setup capability has verified control of its required
  primary email
- AND passkey registration has been verified on the configured auth origin and
  relying-party id
- WHEN the runtime commits first-owner setup
- THEN the system makes one active human principal, one verified primary
  recovery `principal-email`, one active `instance.owner` role assignment, and
  one passkey credential effective for that principal
- AND the setup capability is consumed
- AND no app install metadata or route record is created by owner setup
- AND a central auth session cookie is issued for that principal on the
  configured auth origin
- AND account completion continues through the runtime-owned account
  continuation or mapped-admin handoff instead of leaving a durable
  setup-complete surface
- AND deployed owner setup does not issue an owner session or host-local session
  cookie

#### Scenario: Prepare owner setup without partial authority

- GIVEN identity records and private auth state have separate transaction
  owners
- WHEN the runtime prepares a verified owner setup completion before its final
  activation decision
- THEN it may retain private, purpose-bound, non-authorizing preparation state
  needed to resume or revoke that completion
- AND prepared state is absent from identity records, reviewable snapshots,
  archives, sync payloads, browser presentation contracts, credential lookup,
  session authorization, and owner authorization
- AND no prepared principal, email proof, credential, role assignment, session,
  or setup capability is treated as active, verified, accepted, or consumed
- AND the final activation decision is idempotent and makes the principal,
  verified primary email, credential, owner role, consumed capability, and
  central session effective as one logical completion
- AND retry after an interrupted response resumes the same completion or
  returns its completed account continuation without granting duplicate
  identity, credential, role, or session authority

#### Scenario: Reject incomplete owner setup

- GIVEN a valid owner setup capability exists for the instance
- WHEN setup completion lacks a verified primary email proof or valid passkey
  registration response, or the verified email or credential conflicts with an
  existing identity
- THEN setup completion is rejected
- AND no principal, verified principal-email, passkey credential, owner role
  assignment, central session, owner session, or host-local session becomes
  effective
- AND the setup capability is not consumed
- AND the failure does not disclose whether an unrelated principal owns the
  normalized email or credential

### Requirement: Passkey Credential Storage

The system SHALL store passkey credentials as private instance auth metadata
bound to identity principals without storing private authenticator material.

#### Scenario: Store verified credential

- WHEN a passkey registration response is verified
- THEN the credential record stores principal id, credential id, public key,
  sign counter, credential device facts needed for later verification, created
  timestamp, and updated timestamp
- AND the credential record does not store a private key, raw setup token, or
  raw challenge secret

#### Scenario: Prevent duplicate credential id

- GIVEN a passkey credential id is already stored for the instance
- WHEN another registration attempts to store the same credential id
- THEN the registration is rejected
- AND the existing credential remains unchanged

### Requirement: Passkey Challenge Ceremonies

The system MUST make passkey registration and login challenges one-time and
instance-scoped.

#### Scenario: Registration requires discoverable credentials

- GIVEN owner setup or collaborator invitation acceptance requests passkey
  registration options
- WHEN the runtime builds browser-safe WebAuthn creation options
- THEN the options require a resident credential and required user verification
- AND the WebAuthn user id is the stable identity principal id that owns or will
  own the credential
- AND registration remains bound to its existing setup capability, invitation,
  verified email proof, instance, canonical origin, and relying-party facts

#### Scenario: Registration options

- GIVEN first-owner setup is not complete and a valid setup capability is
  supplied
- AND the capability has a current verified `owner-setup` email proof
- WHEN registration options are requested
- THEN the system stores a one-time registration challenge scoped to the
  instance, setup capability, and verified email proof
- AND the response contains only browser-safe WebAuthn creation options

#### Scenario: Login options

- GIVEN owner setup is complete
- WHEN account sign-in requests passkey login options on the configured auth
  origin
- THEN the system stores a one-time login challenge scoped to the instance
- AND the challenge is not bound to a principal, credential, route target, role,
  or display identity before the browser returns an assertion
- AND the browser-safe WebAuthn request options omit `allowCredentials` so the
  authenticator selects a discoverable credential for the relying party
- AND the options require user verification
- AND requesting login options does not disclose whether any principal,
  credential, email, or role exists

#### Scenario: Upgrade legacy login challenge storage

- GIVEN an existing instance has a passkey challenge table from an earlier
  runtime that requires login challenges to carry a principal id
- AND the table may include retired owner-setup challenge columns and
  constraints
- WHEN the current runtime initializes instance auth before issuing login
  options
- THEN it upgrades the table to accept principal-neutral login challenges even
  if an earlier migration attempt was recorded without changing that legacy
  table
- AND compatible invitation registration challenges remain available
- AND retired owner-setup challenge rows are not copied into current challenge
  storage
- AND no passkey credential, principal, role assignment, or session state is
  changed
- AND any upgrade or challenge-storage failure is returned as a display-safe
  account sign-in error without raw SQL or storage diagnostics

#### Scenario: Challenge replay

- GIVEN a registration or login challenge has already been verified or has
  expired
- WHEN the same challenge is submitted again
- THEN verification is rejected
- AND no credential, principal, role assignment, or session state is written

### Requirement: Collaborator Invitation Token State

The system SHALL store collaborator invitation token secrets as private
instance auth state bound to reviewable identity invitation records.

#### Scenario: Create invitation token

- GIVEN a grant-authorized collaborator invitation request is accepted
- WHEN the runtime creates the invite token
- THEN private auth state stores only a token hash, invitation id, normalized
  target email, target surface facts, created timestamp, expiry, and consumed or
  revoked status
- AND target surface is `instance` or `organization`, with an organization
  identifier present only for the organization surface
- AND the token expiry matches the pending identity `invitation` record expiry
- AND the raw invite token is only available to the delivery path that renders
  the invitation link
- AND the raw invite token and token hash are not stored in identity
  control-plane records, email-delivery records, queue messages, workspace
  state, archives, sync payloads, or reviewable snapshots
- AND creating an invitation token does not issue a passkey credential, central
  auth session, host-local session, or cross-domain handoff grant

#### Scenario: Reject unauthorized invitation token creation

- GIVEN a collaborator invitation request asks for identity records outside the
  current browser principal's invitation grant authority
- WHEN the runtime evaluates the request
- THEN it rejects the request before creating private invite token state
- AND no invitation token hash, raw invite token, rendered invitation link,
  email delivery request, passkey challenge, central session, host-local
  session, or cross-domain handoff grant is created

#### Scenario: Revoke invitation token

- GIVEN a pending identity collaborator invitation has matching private
  invitation token state
- WHEN grant-authorized access management revokes the collaborator invitation
- THEN private auth state records the token as revoked
- AND later invitation acceptance eligibility and completion reject the
  invitation as revoked
- AND token revocation does not expose the raw invite token, token hash,
  credential material, passkey challenge secrets, central session ids,
  host-local session cookies, handoff grant secrets, provider responses, or
  recovery material
- AND token revocation does not issue credentials, central auth sessions,
  host-local sessions, or cross-domain handoff grants

#### Scenario: Reject invalid invitation token revocation

- WHEN invitation token revocation targets missing, consumed, expired, or
  already revoked private token state
- THEN the revocation request is rejected or reported as not applied without
  issuing credentials, sessions, or handoff grants
- AND raw invite tokens, token hashes, credential material, passkey challenge
  secrets, central session ids, host-local session cookies, handoff grant
  secrets, provider responses, and recovery material remain private auth state

#### Scenario: Invitation link origin

- GIVEN a collaborator invitation email is rendered
- WHEN the runtime builds the invitation link
- THEN the link uses the configured auth origin
- AND the auth origin is selected by instance auth configuration rather than an
  arbitrary mapped public Site request host
- AND the link target does not expose owner setup, passkey ceremony internals,
  central session ids, host session cookies, or app-controlled redirect targets

### Requirement: Collaborator Invitation Acceptance

The system SHALL accept collaborator invitations on the configured auth origin
by verifying private invite token state, registering passkeys for new
principals, committing identity acceptance, and issuing central auth sessions.

#### Scenario: Invitation acceptance eligibility

- GIVEN a browser opens `/formless/auth/invitations/accept` on the configured
  auth origin with an invitation id and raw invite token
- WHEN the runtime checks acceptance eligibility
- THEN it hashes the raw token and verifies it against private invitation token
  state
- AND it requires a matching pending identity invitation with the same target
  email, target surface, or target organization facts
- AND it rejects missing, expired, revoked, consumed, accepted, wrong-token,
  wrong-email, and wrong-target invitations without revealing whether an
  unrelated principal exists for the same email
- AND eligibility checks do not consume the token, create a passkey challenge,
  activate identity records, create credentials, issue sessions, or mint
  handoff grants

#### Scenario: Invitation-bound passkey registration options

- GIVEN an invitation is eligible for acceptance on the configured auth origin
- WHEN passkey registration options are requested for the invitation
- THEN the runtime creates a one-time registration challenge scoped to the
  instance, invitation id, token hash, invited principal, canonical auth
  origin, and relying-party id
- AND the response contains only browser-safe WebAuthn creation options for
  the accepted principal
- AND mapped public Site hosts do not start the
  invitation passkey ceremony unless they are also the configured auth origin
- AND requesting options does not consume the invite token, activate identity
  records, store credentials, issue sessions, or mint handoff grants

#### Scenario: Complete invitation acceptance

- GIVEN an invitation-bound passkey registration challenge is active
- AND the browser submits a valid registration response for the challenge,
  canonical auth origin, relying-party id, and accepted principal
- WHEN the runtime completes invitation acceptance
- THEN it stores the passkey credential as private auth state for the accepted
  principal
- AND it consumes the matching invitation token
- AND it commits the identity-control-plane invitation acceptance changes for
  the same principal and target facts
- AND it issues a central auth session scoped to the configured auth origin
- AND it returns a display-safe continuation target when the accepted invitation
  targets a same-origin route, mapped public Site, or mapped instance host
- AND raw invite tokens, token hashes, passkey challenge secrets, credential
  material, central session ids, host session cookies, and handoff grant
  secrets are not stored in identity records, email-delivery records, queue
  messages, workspace state, archives, sync payloads, or reviewable snapshots

#### Scenario: Reject invalid invitation acceptance completion

- WHEN invitation acceptance completion uses a missing, expired, already
  consumed, revoked, wrong-token, wrong-target, wrong-challenge, malformed, or
  duplicate passkey credential
- THEN acceptance is rejected
- AND the invite token is not consumed before the matching identity acceptance
  commit is durable
- AND failed or retried completion attempts do not authorize an invited
  principal, issue a central auth session, issue a host-local session, or mint a
  handoff grant from stale or partial state

### Requirement: Collaborator Invitation Acceptance Browser Surface

The system SHALL render collaborator invitation acceptance as a dedicated
auth-origin browser surface that drives the invitation acceptance APIs.

#### Scenario: Render eligible invitation

- GIVEN a browser navigates to `/formless/auth/invitations/accept` on the
  configured auth origin with an invitation id and raw invite token
- WHEN the invitation acceptance eligibility check succeeds
- THEN the browser surface renders display-safe invitation facts needed to
  continue acceptance, including target email, target surface, expiry, and
  invited principal display name when available
- AND it does not render or persist raw invite tokens, token hashes, passkey
  challenge secrets, credential material, central session ids, host session
  cookies, or handoff grant secrets
- AND the surface is served by instance auth runtime behavior outside public
  Site documents and generated Program record editors

#### Scenario: Render ineligible invitation safely

- GIVEN a browser opens an invitation acceptance URL whose token, target,
  invitation, auth configuration, or origin is invalid or unavailable
- WHEN the eligibility check fails
- THEN the browser surface renders a display-safe failure state
- AND it does not reveal whether an unrelated principal exists for the same
  email address
- AND it does not start passkey registration, activate identity records, create
  credentials, issue sessions, mint handoff grants, or redirect to an
  app-controlled target

#### Scenario: Complete passkey-backed invitation acceptance

- GIVEN the browser surface has an eligible invitation
- WHEN the invited user starts passkey registration and submits the resulting
  registration response from the configured auth origin
- THEN the surface requests invitation-bound registration options and verifies
  the registration through the invitation acceptance APIs
- AND successful completion stores the credential, consumes the invite token,
  commits identity acceptance, and receives only display-safe accepted
  principal, session-expiry, and optional continuation target facts
- AND mapped public Site hosts do not render or start the
  passkey ceremony unless they are also the configured auth origin

#### Scenario: Continue after accepted invitation

- GIVEN invitation acceptance completes successfully
- WHEN the accepted invitation has a mapped public Site or mapped instance
  target
- THEN the browser surface continues through the target-bound cross-domain
  handoff flow
- AND it follows only the runtime-returned continuation target instead of
  synthesizing a cross-origin redirect target from raw URL search parameters
- AND mapped instance targets use the preferred admin origin resolved from the
  selected admin route, eligible primary route, or one unambiguous enabled
  custom admin route
- AND mapped instance continuations enter the `/formless/auth` continuation
  contract with target-bound handoff facts and a path-only return target
- AND the redirect target remains path-only for the target origin
- AND the auth origin does not issue a host-local session cookie directly for
  the target host
- AND when no handoff target is available, the surface remains on the auth
  origin and renders a display-safe accepted state

### Requirement: Passkey Login

The system SHALL issue central auth sessions after successful passkey assertion
verification.

#### Scenario: Successful passkey login

- GIVEN owner setup is complete
- AND a discoverable passkey credential is stored for an active principal
- WHEN the browser submits a valid assertion for the active principal-neutral
  login challenge,
  canonical origin, relying-party id, and stored credential public key
- THEN the runtime resolves the credential id to its stored principal
- AND the returned WebAuthn user handle matches the stable principal id that owns
  the credential
- AND the system updates the stored credential verification facts
- AND the system issues a central auth session cookie for that principal scoped
  to the configured auth origin
- AND the response includes a display-safe continuation target back through
  `/formless/auth`
- AND passkey authentication does not require `instance.owner`,
  a Program role assignment, or target-route authority before
  creating the principal session
- AND deployed passkey login does not issue a host-local session cookie

#### Scenario: Reject invalid passkey login

- WHEN a passkey login assertion has the wrong challenge, origin, relying-party
  id, credential id, user handle, signature, or authenticator counter
- OR the resolved credential principal is missing, disabled, or revoked
- THEN login is rejected
- AND no central auth session, owner session, or host-local session cookie is
  issued
- AND stored credential verification facts are not advanced

### Requirement: Auth Session Status And Logout

The system SHALL expose account session status and logout for central auth
sessions, local-dev owner sessions, and mapped host-local sessions.

#### Scenario: Session status after central passkey login

- GIVEN an active principal has logged in with a passkey
- WHEN the browser requests `/api/formless/session`
- THEN the response reports the principal as authenticated
- AND the response includes the display-safe principal identity from identity
  records and central session expiry
- AND the response is available only on the configured auth origin for the
  central auth session cookie
- AND an unauthenticated response does not identify the configured owner or any
  other principal

#### Scenario: Session status after local dev bootstrap

- GIVEN the browser has completed local dev owner session bootstrap
- WHEN the browser requests `/api/formless/session`
- THEN the response reports the local owner as authenticated
- AND the response includes the display-safe owner identity from the principal
  records and session expiry

#### Scenario: Session status evaluates a protected entry target

- GIVEN direct browser entry, account continuation, or a non-Program management
  transition selects a Program screen or an instance management route
- WHEN the browser requests session status for that resolved route target
- THEN instance auth evaluates the current principal, protected owner
  authority, Program role assignment, session version, route, selected Program
  screen requirement, storage identity, and host binding as applicable
- AND the response reports whether that exact route target is authorized
- AND the client does not infer management access from stale role claims
  stored in a cookie, a previously synced Program replica, or authentication
  alone
- AND an unauthenticated target returns account-continuation facts while an
  authenticated principal with insufficient authority receives a display-safe
  forbidden result without a repeated sign-in continuation

#### Scenario: Resolve one Program runtime session snapshot

- GIVEN the browser is entering an eligible Program shell through a central,
  local-dev owner, or matching host-local session boundary
- WHEN it requests `/api/formless/session/program` with a safe path-only
  `returnTo` target
- THEN instance auth returns one strict `anonymous`, `blocked`, `forbidden`, or
  `ready` Program session result for the matched runtime route
- AND an anonymous result exposes only setup-completion state needed to select
  the account continuation
- AND a blocked result exposes the display-safe principal and session summary,
  the next target-scoped account-completion gate, and its bound runtime target
- AND a forbidden result exposes the display-safe principal and session summary
  without authorizing Program replica hydration
- AND a ready result exposes the display-safe principal and session summary plus
  principal caller facts shaped as `{ kind: "principal", active, owner, roleId? }`
- AND the ready target binds route id, target profile, target origin, Program
  storage identity, and the server-resolved runtime-route access floor
- AND the response contains no session id, cookie, session version, credential,
  challenge, token, private auth state, admin-bearer fact, authorized screen key,
  or authorized path set

#### Scenario: Keep a Program session snapshot current

- GIVEN a persistent Program runtime holds a ready session snapshot
- WHEN its session expires, logout completes, current principal or authority
  changes, an authority-staleness `401` or `403` is received, bounded Program
  socket renewal fails current authority, a suspended tab regains focus after
  its freshness boundary, or another same-origin tab announces invalidation
- THEN the client invalidates the snapshot, fails closed for later Program route
  projection, and coalesces concurrent causes into one current snapshot refresh
- AND replica hydration, screen admission, and invalidation reconnection resume only from
  a new ready snapshot bound to the same principal and runtime target
- AND a failed read or write is not treated as authorized and a failed write is
  not replayed automatically after refresh

#### Scenario: Logout clears auth-origin session

- GIVEN a browser has a central auth session cookie or local-dev owner session
  cookie
- WHEN the browser posts to the logout endpoint
- THEN the runtime revokes any matching central auth session row
- AND the response clears the matching auth-origin session cookie
- AND the response includes a path-only continuation target for the
  runtime-owned sign-in route
- AND later session status requests without a valid cookie report
  unauthenticated state

#### Scenario: Mapped admin host session status and logout

- GIVEN a mapped instance admin host has completed cross-domain auth handoff
  for an active principal
- WHEN the browser requests `/api/formless/session` from that mapped host with
  the host-local session cookie
- THEN the response reports that principal as authenticated without requiring a
  central auth-origin cookie on that host
- WHEN the browser posts to `/api/formless/session/logout` from that mapped
  host
- THEN the response clears the host-local session cookie
- AND the response does not issue a central auth session cookie on the mapped
  host

### Requirement: Account Auth Continuations

The system SHALL keep account continuations bound to current Program route
targets and safe path-only returns.

#### Scenario: Continue to a protected Program target

- GIVEN a protected Program route requires sign-in or account completion
- WHEN the runtime creates or consumes continuation state
- THEN it binds the current instance, route id, target profile, Program storage
  identity, target origin, expiry, and path-only return target
- AND it does not bind a package app key, install id, app role, app
  registration, module, entity, field, media namespace, or adapter identity
- AND wrong-origin, wrong-route, stale, expired, replayed, or unsafe
  continuation facts fail closed without becoming generic Program access

### Requirement: Central Auth And Host Sessions

The system SHALL use the configured auth origin for central sessions and
target-bound host-local sessions for protected mapped Program routes.

#### Scenario: Mint target-bound host session

- GIVEN a principal with current authority completes account gates on the auth
  origin for a mapped Program route
- WHEN a one-time handoff grant is consumed on the matched host
- THEN the host-local session binds the current principal, instance, route,
  target profile, Program storage identity, host, session version, and expiry
- AND the session contains no package app key, install id, app-registration, app
  role, or derived authorization identity
- AND each protected request rechecks current principal, protected-owner or
  Program role authority, route target, storage identity, and session version

#### Scenario: Host session isolation

- GIVEN a host-local Program session exists
- WHEN it is presented on another host, route, profile, storage identity, or
  instance
- THEN it is rejected
- AND it does not authorize generic Program access, public Site documents,
  owner-only recovery, or another mapped route

### Requirement: Authentication Decision Module Boundary

The system SHALL concentrate deterministic auth-origin, route-access, handoff,
and browser-session decisions behind instance-auth Module interfaces while
keeping durable auth state and Worker request handling at explicit adapters.

#### Scenario: Resolve auth origin and protected-route handoff from explicit facts

- GIVEN runtime routing has selected an authenticated, management, or owner-only
  Program route
- WHEN instance auth decides whether to continue locally, enter the auth account
  orchestrator, or start cross-origin handoff
- THEN the decision Module consumes the request, configured auth origin, route
  access, route target, and safe return-target facts explicitly
- AND it returns the selected continuation or handoff target without reading
  Durable Object storage or dispatching a Worker request
- AND target origin, route id, target profile, Program storage identity,
  path-only return target, and access requirements remain bound exactly as they
  are at the runtime boundary

#### Scenario: Validate route access through instance-auth readers

- GIVEN a protected browser route or management request carries a central,
  local owner, or host-local session
- WHEN route access, owner authority, operational management authority,
  host session revocation, or account completion is evaluated
- THEN the decision Module consumes current session, principal, authority,
  session-version, target, and account-completion facts through instance-auth
  reader interfaces
- AND production readers obtain those facts from private auth state and current
  Program identity and instance records
- AND deterministic access decisions do not require callers to emulate
  `DurableObjectStorage`, SQLite, service bindings, or Worker routing
- AND central auth, local owner, and host-local sessions remain distinct session
  kinds with their existing origin, fallback, target, and authority rules
- AND current rejection reasons, safe errors, session precedence, and operation
  actor facts remain unchanged

#### Scenario: Keep durable handoff and HTTP behavior at runtime boundaries

- GIVEN a deterministic auth or route-access decision succeeds or fails
- WHEN the runtime creates, consumes, revokes, or validates durable auth state
- THEN real private auth storage remains responsible for central sessions,
  one-time grants, passkey credentials, host-session revocation versions, and
  account-completion state
- AND the real Worker remains responsible for host routing, reserved callback
  handling, Durable Object forwarding, redirects, response headers, and cookie
  delivery
- AND Module-owned decision coverage does not replace representative complete
  auth-origin, mapped-host, grant-consumption, callback, and cookie journeys

### Requirement: Auth Origin Account Orchestrator

The system SHALL expose `/formless/auth` on the configured auth origin as the
runtime-owned account orchestrator for protected browser continuations and
account completion gates.

#### Scenario: Resolve account continuation

- GIVEN a browser navigates to `/formless/auth` on the configured auth origin
- AND the request identifies a runtime-owned target through path-only return
  target facts or target-bound handoff facts
- AND the browser has an active central auth session for a principal that
  satisfies the target route access requirement
- WHEN account completion for that principal and target is complete
- THEN the orchestrator redirects to the validated path-only same-origin
  continuation or to the target-bound cross-domain handoff start path
- AND the redirect target is derived from runtime route resolution, setup state,
  or invitation state
- AND absolute, protocol-relative, malformed, unsupported, or app-controlled
  redirect targets are rejected before redirecting
- AND no credential material, challenge secrets, token hashes, central session
  ids, host session cookies, handoff grant secrets, provider responses, recovery
  material, or app-private profile values are exposed in the response

#### Scenario: Render next blocking account gate

- GIVEN `/formless/auth` resolves a principal and target whose account
  completion result is blocked
- WHEN the request accepts HTML
- THEN the orchestrator renders an auth-origin browser surface for the next
  blocking gate
- AND the rendered gate includes only display-safe gate kind, target facts,
  route facts, and operation or policy references needed to render or launch the
  next step
- AND the surface does not issue a host-local session, mint a handoff grant, or
  redirect to the target while a blocking gate remains
- AND gates that do not yet have first-pass completion UI render a display-safe
  blocked state rather than falling through to the protected target

#### Scenario: Browser surface reads account status

- GIVEN a browser surface is rendering `/formless/auth` on the configured auth
  origin
- WHEN the surface reads the account status with `Accept: application/json`
- THEN the runtime returns the existing account completion result contract
- AND blocked results use the existing display-safe 409 account completion
  response
- AND complete results use a display-safe 200 account completion response whose
  continuation is the validated same-origin target or the target-bound
  cross-domain handoff path
- AND the status response does not issue a host-local session cookie, mint a
  handoff grant, or expose credential material, challenge secrets, token hashes,
  raw invite tokens, central session ids, host session cookies, handoff grant
  secrets, provider responses, recovery material, or app-private profile values

#### Scenario: Redirect unauthenticated account browser

- GIVEN a browser navigates to `/formless/auth` with a protected target
- WHEN the browser has no valid central auth session for an active principal
- THEN the orchestrator starts the configured credential entry path with a safe
  path-only return target back to `/formless/auth`
- AND the credential entry path remains on the configured auth origin
- AND no target host receives a central auth session cookie before the browser
  returns through the account orchestrator or handoff flow

#### Scenario: Account sign-in and setup gates use account orchestrator

- GIVEN a browser navigates to `/formless/auth/sign-in` or
  `/formless/auth/setup` on the configured auth origin
- WHEN the runtime can express the requested work as a `/formless/auth`
  continuation, credential, or setup gate
- THEN the runtime redirects or renders through the `/formless/auth`
  orchestrator contract
- AND sign-in and setup gates do not become durable logged-in account surfaces
- AND passkey ceremonies remain scoped to the configured auth origin and
  relying-party id

#### Scenario: Render generic account sign-in

- GIVEN `/formless/auth` starts credential entry for a protected target
- WHEN the configured auth origin renders `/formless/auth/sign-in`
- THEN the browser surface identifies the Formless instance without identifying
  the owner or any candidate principal
- AND the surface offers one discoverable-passkey sign-in action
- AND successful authentication creates a session for the principal resolved
  from the verified credential before returning through `/formless/auth`
- AND target authorization, account completion, and handoff are evaluated only
  after authentication and are not inferred by the sign-in surface

#### Scenario: Orchestrate production owner setup

- GIVEN `/formless/auth/setup` carries a valid first-owner setup capability
- WHEN the browser completes display-name entry, required email verification,
  and passkey registration
- THEN each step is represented by the `/formless/auth` account journey and its
  renderer-neutral presentation contract
- AND the owner setup capability, private email proof, passkey options,
  credential response, preparation state, session material, and raw
  continuation state remain runtime-owned
- AND successful setup re-enters account completion for the runtime-selected
  administration target before returning a same-origin continuation or
  target-bound handoff

#### Scenario: Preserve machine-readable account gate responses

- GIVEN protected browser APIs, Program operation requests, or
  non-HTML handoff requests encounter a blocking account completion gate
- WHEN the request does not accept an HTML account surface
- THEN the runtime returns the existing display-safe account completion result
  as a machine-readable `409` response
- AND the response does not include credential material, challenge secrets,
  token hashes, raw invite tokens, central session ids, host session cookies,
  handoff grant secrets, provider responses, recovery material, or app-private
  profile values

### Requirement: Reactive Auth-Origin Presentation Contract

The system SHALL project owner setup, account sign-in, account orchestration, and
collaborator invitation acceptance through complete renderer-neutral auth
contracts on stable scoped hosts while instance-auth runtime code owns secrets,
ceremonies, sessions, route policy, operations, and navigation.

#### Scenario: Publish one complete transient auth surface

- GIVEN a no-shell auth-origin browser route is mounted
- WHEN runtime prepares its current presentation
- THEN one typed `AuthSurfaceReference` resolves one complete immutable snapshot
  with stable surface identity, surface kind, and state
- AND the snapshot carries the complete renderer-neutral frame, brand, heading,
  message severity, ordered display facts, controlled fields, policy facts,
  actions, passkey availability, pending state, feedback, and continuation
  presentation applicable to that state
- AND draft, pending, failure, completion, and continuation transitions publish
  a new complete auth snapshot while semantically unchanged snapshots retain
  object identity
- AND typed reads, cached server snapshots, scoped subscriptions, client
  rendering, and hydration use the same generic Presentation Host semantics as
  other Presentation references
- AND one transient auth surface remains one subscription boundary unless a
  measured need establishes a separately hot child boundary
- AND the auth route does not require an application-shell or management host to
  render its no-shell surface

#### Scenario: Dispatch canonical auth intents

- GIVEN a subscribed auth renderer receives an auth-surface reference
- WHEN the user changes a draft, submits or retries a step, starts a passkey
  ceremony, changes policy acceptance, logs out, or follows an approved
  continuation
- THEN the renderer dispatches a canonical auth intent carrying exact current
  surface, field, policy, action, or destination identity as applicable
- AND runtime resolves the intent against its latest route state and controlled
  draft before requesting options, starting browser credential APIs, invoking
  operations, writing identity state, changing sessions, or navigating
- AND runtime-approved policy and continuation destinations remain explicit
  presentation facts rather than values synthesized from raw URL parameters
- AND renderers do not call auth APIs, browser credential APIs, session clients,
  operation controllers, or navigation effects directly

#### Scenario: Project owner setup and account sign-in states

- GIVEN the configured auth origin renders first-owner setup or account sign-in
- WHEN setup status, session status, passkey support, authenticated principal
  identity, pending state, failure, completion, or continuation changes
- THEN the auth contract represents loading, invalid or incomplete setup,
  identity entry, email sending, email sent, email verification, credential
  creation, passkey-unavailable, failed, already-complete, complete,
  logout-pending, and continuing states where applicable
- AND owner setup carries controlled required display-name, primary-email, and
  verification-token fields plus the action available for its current account
  step
- AND account sign-in carries no candidate principal identity before
  authentication and carries only the passkey action, authenticated validated
  principal identity, logout action, and runtime-approved
  continuation presentation applicable to the current state
- AND successful setup and sign-in remain transient continuation states rather
  than becoming a durable account dashboard
- AND setup capability tokens, raw email tokens, passkey options, credential
  responses, private challenge ids, preparation state, and session material are
  absent from every auth snapshot

#### Scenario: Project account gates

- GIVEN `/formless/auth` renders account completion
- WHEN runtime returns a blocking gate, failure, completion, or continuation
- THEN the auth contract can represent `email-verification`, `credential`,
  `invitation`, `profile-completion`, and `terms-acceptance` gates with only
  their validated target and policy presentation facts
- AND ordinary auth drafts compose canonical submit-bound field contracts
- AND verification-token presentation remains controlled and supports browser
  one-time-code autocomplete without assuming a fixed-length numeric code when
  runtime uses an opaque token
- AND terms acceptance projects only runtime-supplied policies, safe policy
  destinations, controlled acceptance state, and the available completion
  action
- AND blocked gates without a current completion action remain display-safe
  blocked states, and the renderer does not invent invitation decline,
  destination choice, recovery, or other unavailable actions

#### Scenario: Project collaborator invitation acceptance states

- GIVEN the configured auth origin renders collaborator invitation acceptance
- WHEN eligibility, passkey support, submission, acceptance, failure, or
  continuation changes
- THEN the auth contract represents loading, invalid-link, unavailable,
  eligible, submitting, passkey-unavailable, failed, accepted, and continuing
  states as applicable
- AND eligible presentation includes only validated target email, target
  surface, expiry, invited principal display name, and one passkey-backed
  acceptance action
- AND accepted presentation may include validated accepted principal,
  session-expiry, target-origin, and continuation facts returned by runtime
- AND the renderer does not invent invitation decline, contact-owner, or target
  selection behavior
- AND the raw invitation token remains only in the runtime closure that checks
  eligibility and completes acceptance

#### Scenario: Keep secrets and private target state out of auth contracts

- GIVEN route state or API responses contain private auth or routing material
- WHEN runtime projects any auth snapshot, intent, fixture, or renderer input
- THEN setup tokens, raw invitation tokens, token hashes, challenge ids,
  WebAuthn options and responses, credential ids and material, central session
  ids, session cookies, handoff grants and secrets, storage identities, provider
  responses, recovery material, and app-private profile values are absent
- AND validated session expiry, principal display identity, invitation facts,
  target labels, safe policy destinations, and runtime-approved continuation
  facts may be projected when the active state needs them
- AND runtime failures are reduced to closed semantic codes and then fixed
  browser-owned copy before publication without exposing private values through
  nested error objects, serialized host nodes, or fixture data

### Requirement: Instance Auth Browser Failure Protocol

Instance auth SHALL expose closed browser failure contracts while route runtime
owns local browser-effect codes and presentation copy.

#### Scenario: Return a closed auth API error

- GIVEN an instance-auth browser API cannot return its typed success, session,
  gate, or invitation result
- WHEN it returns an error response
- THEN the body contains only `code` selected from `invalid-request`,
  `unauthorized`, `forbidden`, `not-found`, `method-not-allowed`, `conflict`,
  `expired`, `unavailable`, or `internal-failure`
- AND exception messages, parser output, storage diagnostics, SQL, credential
  material, response bodies, paths, commands, logs, and provider output remain
  server-local
- AND collaborator invitation ineligibility retains its existing exact reason
  without an additional arbitrary error string

#### Scenario: Record auth route failures semantically

- GIVEN account setup, sign-in, logout, account gates, email verification,
  invitation acceptance, or a passkey browser ceremony fails
- WHEN the auth route records a retryable or terminal state
- THEN it retains the recognized API code or invitation reason plus a
  route-local `network-failure`, `invalid-response`, `passkey-unavailable`, or
  `passkey-failed` code as applicable
- AND the auth projection selects fixed copy from the action and code
- AND browser credential exceptions and arbitrary API messages do not enter the
  auth Presentation contract

#### Scenario: Present intentional auth data directly

- GIVEN instance-auth parsers have accepted a principal name, email address,
  invitation label, policy label, policy version, expiry, continuation, or
  approved destination
- WHEN auth runtime projects that value
- THEN it remains direct intentional presentation data
- AND auth projection does not apply a generic regex text sanitizer

#### Scenario: Formless Renderer consumes auth contracts

- GIVEN production owner setup, account sign-in, account, and invitation routes
  publish complete renderer-neutral auth contracts
- WHEN each route publishes its auth-surface snapshot
- THEN pure and subscribed Formless Renderer auth entrypoints consume only auth
  references and snapshots and dispatch canonical auth intents
- AND auth runtime imports contracts and host behavior from documented
  `@dpeek/formless-presentation` subpaths while renderer entrypoints come from
  documented `@dpeek/formless-renderer` subpaths
- AND focused coverage asserts controlled drafts, available actions, pending and
  retry behavior, continuation, accessibility, and secret exclusion
- AND production mounts auth presentation through the root
  `FormlessApplicationRenderer`

#### Scenario: Formless auth renderer and canonical fixtures

- GIVEN runtime publishes complete production auth contracts
- WHEN the selected renderer implements the contract in `lib/renderer`
- THEN pure and subscribed renderer entrypoints compose package frame, card,
  form, field, action, status, passkey, policy, fact, and loading primitives
  without importing instance-auth runtime
- AND data-only memory-host fixtures cover all shipped owner setup, sign-in,
  account gate, invitation, unavailable, failed, complete, and continuation
  states with minimal canonical intent reducers
- AND fixtures do not simulate WebAuthn, sessions, storage, handoff grants,
  redirects, unsupported destination selection, invitation decline, or
  hard-coded policy actions
- AND the renderer uses package-owned styling and contains no runtime clients,
  route policy, browser credential effects, or production assembly behavior

### Requirement: Account Completion Gate Resolution

The system SHALL resolve account completion only from current Program,
invitation, profile, credential, and policy state.

#### Scenario: Resolve next blocking account gate

- GIVEN an authenticated principal continues to a current Program route target
- WHEN the auth-origin account orchestrator evaluates completion
- THEN it may return only invitation, profile-completion, terms-acceptance, or
  credential gates declared by current instance and Program policy
- AND it does not return app-registration, app-role review, package operation,
  install-target, or app-owned profile gates
- AND each gate response remains display-safe and bound to the current
  principal, route, Program storage identity, and safe continuation target

#### Scenario: Gate completion writes through owning boundaries

- GIVEN a current account gate is completed
- WHEN the runtime validates the active session, target, gate, and submitted
  input
- THEN invitation, identity policy acceptance, credential, and profile facts
  are written through their owning Program or private-auth boundaries
- AND completion is re-evaluated from current state before continuation or
  host-local handoff
- AND account completion retains the current Program and private-auth storage identities
### Requirement: Email Verification Challenge State

The system SHALL store email verification challenge secrets as private
instance auth state bound to the configured auth origin and account target.

#### Scenario: Create email verification challenge

- GIVEN the account journey needs a verified email for owner setup, invitation
  acceptance, recovery, or account completion
- WHEN the runtime creates an email verification challenge
- THEN private auth state stores only a token hash, normalized email, purpose,
  target facts, created timestamp, expiry, and consumed or revoked status
- AND the challenge email is scheduled through the email runtime with an
  idempotent source record or private challenge identifier
- AND the verification link uses the configured auth origin
- AND raw verification tokens and token hashes are not stored in identity
  control-plane records, email-delivery records, queue messages, workspace
  state, archives, sync payloads, or reviewable snapshots
- AND creating an email verification challenge does not verify an email, create
  credentials, sessions, or handoff grants

#### Scenario: Verify email challenge

- GIVEN a browser submits an email verification token on the configured auth
  origin for the matching account target
- WHEN private auth state verifies an unexpired, unrevoked, unconsumed token
- THEN a flow for an existing principal creates or updates one
  `principal-email` record with normalized email, display email, verified
  status, primary flag, and verified timestamp according to the target flow
- AND a first-owner flow instead retains a private verified email proof bound
  to its account target until identity activation
- AND the token is consumed only when the matching identity write or private
  first-owner proof is durable
- AND wrong-token, wrong-email, wrong-target, expired, revoked, consumed, or
  missing challenge attempts do not reveal whether an unrelated principal
  exists for the same email
- AND verification does not create role assignments, credentials, owner
  authority, host-local sessions, or handoff grants

### Requirement: Terms Acceptance Completion

The system SHALL let authenticated principals complete target-scoped
terms-acceptance gates by writing reviewable identity policy acceptance records.

#### Scenario: Complete terms acceptance gate

- GIVEN account completion returns a `terms-acceptance` gate for an active
  principal and target
- WHEN the browser accepts the listed active policies on the configured auth
  origin
- THEN identity storage creates accepted `principal-policy-acceptance` records
  for the principal and every required active policy whose scope applies to the
  target
- AND existing accepted records for the same principal and policy are reused
  rather than duplicated
- AND retired, wrong-scope, revoked, tombstoned, or app-controlled policies do
  not satisfy the target gate
- AND terms acceptance does not authenticate the principal, create credentials,
  grant roles, issue host-local sessions, or
  mint handoff grants
- AND the runtime re-evaluates account completion for the same target before
  returning a continuation target or starting target-bound handoff

### Requirement: Principal-Backed Authenticated Authorization

The system SHALL authorize authenticated browser access through an active
principal with a valid central auth-origin, local-dev owner, or host-local
browser session.

#### Scenario: Session resolves to active authenticated principal

- GIVEN a browser request includes a valid central auth session for the
  configured auth origin, local-dev owner session, or host-local session
- WHEN the session principal is active
- AND central auth sessions are used only on the configured auth origin
- AND host-local sessions match the request host, route, target profile, and
  Program storage identity
- THEN authenticated browser routes and operations accept the request as
  authenticated
- AND the resulting operation invocation envelope includes actor kind
  `authenticated`, the principal id, and the route or storage target facts used
  for authorization

#### Scenario: Session without active authenticated principal

- GIVEN a browser request includes a valid central auth session, local-dev owner
  session, or host-local session
- WHEN the session principal is missing, disabled, revoked, or scoped to a
  different host, route, profile, storage identity, or instance
- THEN authenticated browser routes and operations reject the request as
  unauthenticated
- AND the runtime does not build an authenticated operation invocation envelope
  from stale signed session facts

### Requirement: Principal-Backed Owner Authorization

The system SHALL authorize browser owner access through an active principal
with active `instance.owner` authority.

#### Scenario: Owner access resolves to active owner principal

- GIVEN a browser request includes a valid central auth session on the configured
  auth origin, local-dev owner session cookie, or matching host-local session
- WHEN the session principal is active
- AND the principal has an active `instance.owner` role assignment at instance
  scope
- THEN owner-only browser routes and owner-protected management reads and writes
  accept the request as owner-authorized

#### Scenario: Owner access without active owner authority

- GIVEN a browser request includes a valid central auth session, local-dev owner
  session cookie, or matching host-local session
- WHEN the session principal is missing, disabled, or no longer has an active
  `instance.owner` role assignment at instance scope
- THEN owner-only browser routes and owner-protected management reads and writes
  reject the request as unauthenticated owner access
- AND privileged writes do not rely only on stale role facts in the signed
  cookie payload

### Requirement: Principal-Backed Program Replica Authorization

The system SHALL authorize complete reviewable Program replica reads through
active principals satisfying the schema-defined `member` role requirement
without treating read access as operation or route authority.

#### Scenario: Member session resolves to Program replica authority

- GIVEN a browser request includes a valid central auth session on the
  configured auth origin, local-dev owner session, or matching host-local
  session
- WHEN the session principal is active
- AND the principal has one active `program-role-assignment` whose stable role
  id resolves to `member`, `editor`, or `administrator` in the ordered Program
  role catalog
- THEN Program bootstrap, schema, HTTP sync, and invalidation socket admission
  accept the request through the shared `{ role: "member" }` requirement
- AND the complete reviewable Program replica may include identity,
  control-plane, and migrated domain records
- AND the member requirement does not authorize a management browser route,
  entity operation, owner-only route, or storage-control operation

#### Scenario: Program replica authority is revoked

- GIVEN a Program browser session was previously accepted through the member
  requirement
- WHEN the principal is disabled, its active Program role assignment is
  removed or changed below the required role, its session is revoked, or its
  host target no longer matches
- THEN later Program HTTP reads and socket renewal reject the session
- AND an already admitted socket returns no Program data
- AND it can expose only content-free changed timing until its bounded renewal
- AND signed session role facts do not retain stale replica authority

### Requirement: Principal-Backed Program Administrator Authorization

The system SHALL authorize operational Program management through active
principals with the schema-defined `administrator` role while preserving
owner-only recovery authority.

#### Scenario: Administrator session resolves to management authority

- GIVEN a browser request includes a valid central auth session on the configured
  auth origin, local-dev owner session, or matching host-local session
- WHEN the session principal is active
- AND the principal has one active `program-role-assignment` whose stable role
  id resolves to the Program schema's `administrator` role
- THEN operational instance management reads and writes accept the request as
  Program-administrator-authorized
- AND an active `instance.owner` role assignment at instance scope also
  satisfies the ordinary administrator role requirement
- AND authorization uses the shared Program access evaluator with current
  identity principal, protected owner, and Program role-assignment facts rather
  than stale role facts in signed cookies

#### Scenario: Administrator session without active authority

- GIVEN a browser request includes a valid central auth session, local-dev owner
  session, or matching host-local session
- WHEN the session principal is missing, disabled, or no longer has active
  `administrator` role or protected owner authority
- THEN operational instance management reads and writes reject the request as
  unauthorized management access
- AND removed admin authority, disabled principals, or changed role assignments
  invalidate or narrow future management authorization

#### Scenario: Administrator does not receive owner recovery authority

- GIVEN a browser request is authorized only by the schema-defined
  `administrator` role
- WHEN the request attempts owner-only recovery or auth-sensitive management
- THEN the request is rejected unless the principal also has active
  `instance.owner` authority or the request uses valid admin bearer
  authorization where that path explicitly allows it
- AND owner-only recovery includes granting, revoking, or disabling
  `instance.owner`, removing the last active owner, owner setup replacement,
  owner credential recovery, changing auth origin or relying-party policy,
  rotating browser session signing policy, and creating or rotating admin-bearer
  recovery material

#### Scenario: Administrator opens instance settings

- GIVEN a browser session resolves to an active principal with active
  `administrator` Program role
- WHEN the principal opens Routes or Access in the current Program
- THEN the selected screen's explicit `{ role: "administrator" }` requirement
  accepts the request
- AND backing operational management APIs apply their Program-administrator
  grant limits

### Requirement: Schema-Owned Program Screen Authorization

The system SHALL authorize Program presentation from each selected screen's
browser access requirement without turning replica admission, navigation
identity, or module identity into route authority.

#### Scenario: Apply the Program presentation role ladder

- GIVEN a Program screen declares an ordinary role requirement
- WHEN an active principal requests that screen
- THEN a `{ role: "member" }` screen admits `member`, `editor`,
  `administrator`, and protected owner authority
- AND a `{ role: "editor" }` screen admits `editor`, `administrator`, and
  protected owner authority
- AND a `{ role: "administrator" }` screen admits `administrator` and
  protected owner authority
- AND an `{ actor: "owner" }` screen admits only protected owner authority
- AND member-level complete Program replica access does not satisfy a screen
  requiring editor, administrator, or owner authority

#### Scenario: Combine screen and mounted route requirements

- GIVEN runtime topology selects a Program screen through the default instance
  host or an enabled mapped instance route
- WHEN browser admission is evaluated
- THEN profile and mapped-route eligibility are evaluated first
- AND the browser must satisfy both the matched route access floor and the
  selected screen access requirement
- AND a screen cannot weaken an authenticated, management, or owner route floor
- AND the default instance host derives Program presentation admission from
  the selected screen instead of a hard-coded path list

#### Scenario: Keep Program screen authorization current

- GIVEN a central, local-owner, or matching host-local session previously
  opened a Program screen
- WHEN the principal is disabled, its Program role assignment changes, owner
  authority is removed, the session is revoked, or the host target no longer
  matches
- THEN later direct entry and protected server requests re-evaluate current
  authority through instance-auth readers
- AND client navigation evaluates the current Program schema against only a
  ready browser-safe Program session snapshot within its bound runtime-route
  floor
- AND relevant replica authority changes, session expiry, logout, protected
  request rejection, failed bounded invalidation renewal, policy closure, focus
  recovery, and cross-tab notices invalidate that snapshot before later client
  route admission
- AND signed cookie facts, cached Program caller facts, schema screen keys,
  module keys, navigation membership, and prior presentation do not retain
  server authorization

#### Scenario: Keep operation and owner recovery authorization separate

- GIVEN a principal is admitted to a Program screen
- WHEN the screen presents entity operations, security-sensitive controls, or
  owner recovery behavior
- THEN each operation still applies its own schema access requirement and
  runtime grant limits
- AND owner credential recovery, owner-role changes, auth-origin policy,
  browser session signing policy, admin-bearer recovery material, credentials,
  token hashes, provider secrets, and private session state do not become
  available through screen admission

### Requirement: Admin Bearer Boundary

The system MUST keep admin bearer authorization separate from passkey browser
login.

#### Scenario: Admin bearer remains write authorization

- GIVEN an admin bearer token is configured
- WHEN a protected write request supplies the valid admin bearer token
- THEN the request is authorized without requiring a principal-backed owner
  session

#### Scenario: Admin bearer authorizes protected management reads

- GIVEN an admin bearer token is configured
- WHEN a trusted CLI or automation request reads an owner-protected management
  endpoint with the valid admin bearer token
- THEN the request is authorized without requiring a principal-backed owner
  session
- AND the token is not accepted as a browser owner-login credential

#### Scenario: Admin bearer mints owner setup capability

- GIVEN owner setup is incomplete and an admin bearer token is configured
- WHEN a trusted CLI or automation request creates an owner setup capability
  with a setup token and the valid admin bearer token
- THEN the runtime stores a hashed setup capability scoped to the requested
  instance and reports that setup remains incomplete
- AND the requested instance identity is derived from the host that receives the
  setup capability request
- AND setup completion only accepts the setup token for the same host-derived
  instance identity
- AND the raw setup token and admin bearer token are not returned in the
  response
- AND if owner setup is already complete, the request reports the existing
  display-safe owner identity and does not replace the existing owner principal
  or store a new setup capability

#### Scenario: Trusted CLI uses configured auth origin for setup capability

- GIVEN owner setup is incomplete and an admin bearer token is available to a
  trusted CLI
- AND the deployed instance reports an effective auth origin in owner setup
  status
- WHEN the CLI prepares an owner account setup URL
- THEN the CLI creates the setup capability on that auth origin
- AND the browser account setup URL uses the same auth origin
- AND the runtime does not silently fall back to the workers.dev deployment host
  when the auth-origin capability request is unreachable or misconfigured

#### Scenario: Owner setup bootstrap does not require owner-protected Program state

- GIVEN owner setup is incomplete and an admin bearer token is available to a
  trusted CLI
- WHEN the CLI prepares an owner account setup URL
- THEN it may read owner setup status and create the setup capability without
  first reading route, deployment, archive, or browser session state
- AND protected management reads remain separately authorized by central
  auth-origin session, local-dev owner session, host-local session, or admin
  bearer authorization

#### Scenario: Browser login does not accept admin token

- GIVEN owner setup is complete and passkey login is available
- WHEN a browser attempts normal browser passkey login by submitting only an
  admin token
- THEN browser login is rejected
- AND no central auth session or owner session cookie is issued from that
  token-only login attempt

### Requirement: Local Dev Owner Session Bootstrap

The system SHALL support owner session bootstrap for local workspace runtimes
without requiring passkey registration.

#### Scenario: Bootstrap local owner session

- **GIVEN** `formless dev` starts a local workspace runtime with a
  CLI-generated local session bootstrap token
- **WHEN** the same-origin browser requests the local session bootstrap endpoint
  with that token
- **THEN** the runtime creates a local active owner principal and active
  `instance.owner` role assignment if no owner principal exists
- **AND** the runtime issues the existing owner session cookie for that
  principal
- **AND** local dev bootstrap does not create a central auth session unless a
  configured local auth origin explicitly uses the normal deployed auth flow
- **AND** no passkey credential, passkey challenge, setup capability, app
  install, route record, Cloudflare resource, Alchemy resource, or provider
  resource is created

#### Scenario: Fresh local workspace does not require passkey setup

- **GIVEN** `formless dev` starts a fresh local workspace after CLI-owned
  workspace bootstrap
- **WHEN** browser onboarding needs an owner session for local workspace gateway
  mutations
- **THEN** local session bootstrap is the owner-session setup path
- **AND** first-owner passkey setup is not required for local dev onboarding
- **AND** deployed or remote instance owner setup still uses the
  verified-email-first passkey-backed account journey

#### Scenario: Reject local bootstrap outside local dev

- **WHEN** a deployed instance, mapped host, site-authoring
  profile, published Site profile, cross-origin browser, or request without the
  active local bootstrap token calls the local session bootstrap endpoint
- **THEN** the request is rejected
- **AND** no principal, role assignment, credential, challenge, setup
  capability, session, or provider state is written
