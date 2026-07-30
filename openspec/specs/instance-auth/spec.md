# Instance Auth Specification

## Purpose

Instance auth owns product instance passkey credentials, WebAuthn challenge
ceremonies, canonical auth origin policy, central auth sessions, local-dev
owner session issuance, host-local sessions, cross-domain handoff grants,
account completion gates, collaborator invitation token state, logout, and
admin bearer recovery boundaries. Reviewable owner identity, owner
authority, pending invitation facts, and policy acceptance facts are stored as
identity control-plane principal, principal-email, invitation, membership,
app-registration, role-assignment, account-policy, and
principal-policy-acceptance records.

## Requirements

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

- GIVEN owner setup, collaborator invitation acceptance, or self-service signup
  requests passkey registration options
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
  arbitrary mapped app or public Site request host
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
  email, target surface, target app install, or target organization facts
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
- AND mapped app hosts and mapped public Site hosts do not start the
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
  targets a same-origin route, mapped app, mapped public Site, or mapped
  instance host
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

The system SHALL render collaborator invitation acceptance as an auth-origin
browser surface that drives the invitation acceptance APIs without depending on
an installed app route or generated app UI.

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
- AND the surface is served by instance auth runtime behavior rather than by an
  installed app, public Site document, source app screen, or generated
  identity-control-plane record editor

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
- AND mapped app hosts and mapped public Site hosts do not render or start the
  passkey ceremony unless they are also the configured auth origin

#### Scenario: Continue after accepted invitation

- GIVEN invitation acceptance completes successfully
- WHEN the accepted invitation has a mapped app, mapped public Site, or mapped
  instance target
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
  a Program role assignment, app-install role, or target-route authority before
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

#### Scenario: Session status evaluates a protected route target

- GIVEN client-side navigation selects an instance management route or an
  installed app route with a required role
- WHEN the browser requests session status for that resolved route target
- THEN instance auth evaluates the current principal, authority, role scope,
  session version, route, app install, storage identity, and host binding
- AND the response reports whether that exact route target is authorized
- AND the client does not infer management or app access from stale role claims
  stored in a cookie or from authentication alone

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

The system SHALL preserve safe account return targets for protected browser
routes through `/formless/auth` as the runtime-owned continuation contract.

#### Scenario: Account continuation completes with return target

- GIVEN an anonymous browser was redirected from a protected route to
  `/formless/auth` with a same-origin `returnTo` path and query
- WHEN passkey login succeeds
- THEN a central auth session cookie is issued on the configured auth origin
- AND `/formless/auth` validates route access and account completion for the
  target before continuing
- AND the browser is returned to the requested route only through the validated
  continuation target
- AND when the sign-in redirect target already names an account continuation,
  successful login resumes that continuation without nesting it in another
  account return target
- AND browser client code does not synthesize the final post-login destination
  from raw URL search parameters after login succeeds
- AND the return target is not exposed to passkey challenge verification as an
  authorization input

#### Scenario: Same-origin deployment target continuation

- GIVEN the configured auth origin is the Workers.dev deployment target for an
  instance-profile runtime
- AND the instance has no exact-host route for that deployment host
- WHEN `/formless/auth` continues to the instance root or a protected hostless
  installed-app route
- THEN account completion derives a target from the same-origin runtime surface
  and resolved route facts without requiring an exact-host binding
- AND a missing central auth session starts sign-in while a valid central
  principal session is evaluated against the requested path
- AND a hostless installed-app target remains bound to its route id, app install,
  storage identity, access policy, and path-only return target
- AND same-origin target derivation does not make hostless routes eligible for
  host-local session issuance or cross-domain handoff grants

#### Scenario: Unsafe return target rejected

- GIVEN an account continuation URL contains an absolute, protocol-relative,
  cross-origin, malformed, or unsupported `returnTo` value
- WHEN login renders or completes
- THEN the unsafe return target is ignored
- AND `/formless/auth` uses the product instance root as the continuation
  target after successful login

#### Scenario: Authenticated principal lacks target authority

- GIVEN a browser has a valid central session for an active principal
- AND `/formless/auth` evaluates a protected target that requires management,
  owner, or app-install authority the principal does not hold
- WHEN no supported account-completion gate can satisfy that target authority
- THEN the orchestrator returns a display-safe forbidden account outcome
  instead of restarting passkey sign-in
- AND the outcome may offer logout or a runtime-approved continuation without
  exposing unavailable routes, role assignments, other principals, or private
  target facts
- AND no target shell, host-local session, handoff grant, credential ceremony,
  or target data is made available

#### Scenario: Account continuation may enter auth handoff

- GIVEN an anonymous browser was redirected to `/formless/auth` with
  target-bound handoff facts
- WHEN passkey login succeeds
- THEN `/formless/auth` follows the continuation with document navigation so
  the runtime-owned handoff route can issue a target-bound one-time grant
- AND gate completion, signup completion, and handoff continuation clients use
  the runtime-returned continuation target rather than constructing
  cross-origin handoff URLs from raw account URL parameters
- AND no absolute, protocol-relative, cross-origin, malformed, or unsupported
  handoff target is accepted

### Requirement: Central Auth And Host Sessions

The system SHALL keep passkey login and central auth sessions on the configured
auth origin while issuing host-local sessions for other instance hosts through
one-time grants.

#### Scenario: Central auth session origin

- GIVEN passkey setup, passkey login, or invitation acceptance succeeds on the
  configured auth origin
- WHEN the runtime issues browser session state for that principal
- THEN the central auth session is scoped to the auth origin host
- AND the session is signed, instance-bound, principal-bound, and expires
- AND mapped instance admin hosts, mapped app hosts, and mapped public Site
  hosts do not receive the central auth session cookie through shared cookie
  scope
- AND mapped instance admin hosts, mapped app hosts, and mapped public Site
  hosts do not start passkey registration or login ceremonies unless they are
  also the configured auth origin
- AND the owner session cookie is accepted only for local-dev bootstrap flows,
  not for normal deployed passkey login, setup, invitation acceptance, or
  account continuation

#### Scenario: Non-auth admin host protected entry starts handoff

- GIVEN an enabled exact-host route mounts the instance admin surface
- AND the mapped admin host is not the configured auth origin
- AND a browser navigates to a protected admin route on that admin host with an
  optional safe path-only target
- WHEN the browser does not include a valid host-local session for that admin
  route and `instance:control-plane` target
- THEN the admin host redirects to the configured auth origin through the
  cross-domain handoff start flow
- AND the handoff target origin is the admin host origin
- AND the handoff target route is the matched instance admin route
- AND the handoff target storage identity is `instance:control-plane`
- AND the return target is the original protected path and query when safe, or
  the admin route root when no safe target is available
- AND the admin host does not render account sign-in UI, start a passkey ceremony,
  issue a central auth session cookie, or silently mint credentials for its own
  host

#### Scenario: Non-auth admin host account gates redirect to auth origin

- GIVEN a configured auth origin exists
- AND an enabled exact-host route mounts the instance admin surface on another
  host
- WHEN a browser navigates to the account sign-in or setup gate route on the
  admin host
- THEN the admin host redirects to the same path and query on the configured
  auth origin
- AND setup status, setup capability creation, owner passkey registration, and
  setup completion remain accepted only on the configured auth origin when
  production auth is configured
- AND the admin host does not render account setup UI or start passkey
  registration unless it is also the configured auth origin

#### Scenario: One-time grant issuance

- GIVEN a browser without a valid host-local session requests an authenticated,
  management, owner-only, or required-app-role route on a host that is not the
  configured auth origin
- AND the target host starts auth handoff with a host-local nonce cookie,
  target origin, route id, target profile, target app install or storage
  identity, path-only redirect target, and state
- WHEN the auth origin verifies or creates a central auth session for an active
  principal that satisfies the target route access requirement
- THEN the runtime stores a one-time grant bound to the instance, principal,
  target origin, route id, target profile, target app install or storage
  identity, redirect target, nonce, state, and expiry
- AND the raw grant secret is not stored in identity control-plane records,
  workspace state, archives, sync payloads, or reviewable snapshots
- AND absolute, protocol-relative, cross-origin, malformed, or unsupported
  redirect targets are rejected before grant issuance

#### Scenario: Host session callback

- GIVEN a target host receives the reserved auth callback route with a grant and
  state
- WHEN the target host validates the host-local nonce cookie and consumes a
  matching unexpired grant through the instance auth runtime
- THEN the grant cannot be used again
- AND the target host issues a host-local session cookie scoped to that request
  host
- AND the host session is signed, instance-bound, principal-bound,
  target-origin-bound, route-bound, target-profile-bound, and app-install or
  storage-identity-bound
- AND the host session includes issued time, expiry, and revocation or session
  version facts
- AND the browser redirects only to the path-only redirect target recorded in
  the consumed grant

#### Scenario: Reject invalid host session handoff

- WHEN a callback attempts to consume a missing, expired, already-used,
  wrong-state, wrong-nonce, wrong-origin, wrong-route, wrong-profile,
  wrong-install, or wrong-instance grant
- THEN the callback is rejected
- AND no host-local session cookie is issued
- AND the callback does not expose passkey ceremony, owner setup, central
  account-management behavior, or app-controlled redirects

#### Scenario: Host session authorization remains current

- GIVEN a host-local session exists for a principal
- WHEN an authenticated browser route, operation, privileged write, or
  protected management read or write is authorized from that session
- THEN the runtime rechecks current principal status and host session
  revocation or version facts
- AND owner-only routes and owner-only management reads or writes also recheck
  active `instance.owner` authority
- AND Program management reads or writes recheck the active principal's current
  schema role assignment or active `instance.owner` authority according to the
  path's access requirement
- AND app-admin routes, reads, writes, and sync recheck active `app.admin`
  authority at the host session target's app-install scope or active
  `instance.owner` authority
- AND disabled principals, removed owner authority, changed role assignments, or
  revoked session versions invalidate or narrow future authorization
- AND host sessions are not accepted on a different host, route, app install,
  storage identity, target profile, or instance

### Requirement: Authentication Decision Module Boundary

The system SHALL concentrate deterministic auth-origin, route-access, handoff,
and browser-session decisions behind instance-auth Module interfaces while
keeping durable auth state and Worker request handling at explicit adapters.

#### Scenario: Resolve auth origin and protected-route handoff from explicit facts

- GIVEN runtime routing has selected an authenticated, management, owner-only,
  or required-app-role route
- WHEN instance auth decides whether to continue locally, enter the auth account
  orchestrator, or start cross-origin handoff
- THEN the decision Module consumes the request, configured auth origin, route
  access, route target, and safe return-target facts explicitly
- AND it returns the selected continuation or handoff target without reading
  Durable Object storage or dispatching a Worker request
- AND target origin, route id, target profile, app install or storage identity,
  path-only return target, and access requirements remain bound exactly as they
  are at the runtime boundary

#### Scenario: Validate route access through instance-auth readers

- GIVEN a protected browser route or management request carries a central,
  local owner, or host-local session
- WHEN route access, owner authority, operational management authority,
  app-install role authority, host session revocation, or account completion is
  evaluated
- THEN the decision Module consumes current session, principal, authority,
  session-version, target, and account-completion facts through instance-auth
  reader interfaces
- AND production readers obtain those facts from private auth state, the
  identity control plane, the instance control plane, and target app storage
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
  invitation state, signup state, or app registration state
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

- GIVEN protected browser APIs, installed app APIs, operation requests, or
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
  authentication and carries only the passkey action, authenticated
  display-safe principal identity, logout action, and runtime-approved
  continuation presentation applicable to the current state
- AND successful setup and sign-in remain transient continuation states rather
  than becoming a durable account dashboard
- AND setup capability tokens, raw email tokens, passkey options, credential
  responses, private challenge ids, preparation state, and session material are
  absent from every auth snapshot

#### Scenario: Project account gates and signup states

- GIVEN `/formless/auth` renders account completion or self-service signup
- WHEN runtime returns a blocking gate, signup step, failure, completion, or
  continuation
- THEN the auth contract can represent `email-verification`, `credential`,
  `invitation`, `app-registration`, `profile-completion`, `terms-acceptance`,
  and `role-review` gates with only their display-safe target, operation, and
  policy facts
- AND signup presentation covers controlled display name and email entry,
  verification-token entry, passkey creation, pending, failure,
  passkey-unavailable, completion, and continuation states supported by the
  current runtime
- AND ordinary auth drafts compose canonical submit-bound field contracts and
  operation-backed profile completion composes canonical operation-input field
  contracts rather than defining a parallel field system
- AND verification-token presentation remains controlled and supports browser
  one-time-code autocomplete without assuming a fixed-length numeric code when
  runtime uses an opaque token
- AND terms acceptance projects only runtime-supplied policies, safe policy
  destinations, controlled acceptance state, and the available completion
  action
- AND blocked gates without a current completion action remain display-safe
  blocked states, and the renderer does not invent signup, invitation decline,
  destination choice, recovery, or other unavailable actions

#### Scenario: Project collaborator invitation acceptance states

- GIVEN the configured auth origin renders collaborator invitation acceptance
- WHEN eligibility, passkey support, submission, acceptance, failure, or
  continuation changes
- THEN the auth contract represents loading, invalid-link, unavailable,
  eligible, submitting, passkey-unavailable, failed, accepted, and continuing
  states as applicable
- AND eligible presentation includes only display-safe target email, target
  surface, expiry, invited principal display name, and one passkey-backed
  acceptance action
- AND accepted presentation may include display-safe accepted principal,
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
- AND display-safe session expiry, principal display identity, invitation facts,
  target labels, safe policy destinations, and runtime-approved continuation
  facts may be projected when the active state needs them
- AND runtime failures are reduced to concise display-safe messages before
  publication without exposing private values through nested error objects,
  serialized host nodes, or fixture data

#### Scenario: Formless Renderer consumes auth contracts

- GIVEN production owner setup, account sign-in, account, signup, and invitation
  routes publish complete renderer-neutral auth contracts
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
  account gate, signup, invitation, unavailable, failed, complete, and
  continuation states with minimal canonical intent reducers
- AND fixtures do not simulate WebAuthn, sessions, storage, handoff grants,
  redirects, unsupported destination selection, invitation decline, or
  hard-coded policy actions
- AND the renderer uses package-owned styling and contains no runtime clients,
  route policy, browser credential effects, or production assembly behavior

### Requirement: Account Completion Gate Resolution

The system SHALL evaluate target-scoped account completion gates before issuing
or using browser access for an authenticated target.

#### Scenario: Resolve next blocking account gate

- GIVEN an active principal has a central auth session or matching host-local
  session
- AND the runtime has resolved a requested target with target origin, route id,
  target profile, target app install or storage identity, path-only return
  target, and optional selected organization context
- WHEN the auth runtime evaluates account completion for that target
- THEN it returns either a display-safe continuation target or the next blocking
  gate for that principal and target
- AND supported first-pass gate kinds are `email-verification`, `credential`,
  `invitation`, `app-registration`, `profile-completion`,
  `terms-acceptance`, and `role-review`
- AND the gate response includes only display-safe gate kind, target facts,
  route facts, and operation or policy references needed to render or launch the
  next step
- AND it does not expose credential material, challenge secrets, token hashes,
  raw invite tokens, central session ids, host session cookies, handoff grant
  secrets, provider responses, recovery material, or app-private profile values

#### Scenario: Gate satisfaction reads current target state

- GIVEN account completion evaluates a target for an active principal
- WHEN the runtime checks gate satisfaction
- THEN `email-verification` requires a verified primary `principal-email`
  record for the principal
- AND `credential` requires an accepted credential method in private auth state
  for the principal
- AND `invitation` requires the target invitation to be accepted or no longer
  blocking the requested target
- AND `app-registration` requires an active `app-registration` record for the
  requested app install, principal or selected organization, and target context
  unless the target route requires an app-scoped runtime role that the
  principal already satisfies
- AND an active matching `app.admin` assignment satisfies an app route requiring
  `app.admin` without requiring a duplicate `app-registration` record
- AND for app installs whose registration policy is `closed`, a missing
  `app-registration` remains a blocking `app-registration` gate only when the
  target is not already authorized by its required app-scoped runtime role
- AND `profile-completion` is satisfied only by app-owned records or explicit
  app operations declared for that target, not by arbitrary auth-runtime writes
  to app storage
- AND `terms-acceptance` requires an accepted
  `principal-policy-acceptance` record for each active account policy whose
  scope applies to the target
- AND `role-review` requires the current identity-control-plane role,
  membership, or approval records that authorize the requested high-privilege
  target
- AND stale signed session facts do not satisfy gates after principal status,
  role assignments, memberships, app registrations, policy records, or policy
  acceptances change

#### Scenario: Authenticated principal lacks the target route role

- GIVEN an active principal has a valid browser session
- AND a protected continuation targets an app route requiring `app.admin`
- WHEN the principal lacks active `app.admin` authority for that app install
  and lacks active `instance.owner` authority
- THEN account completion selects a display-safe `role-review` gate instead of
  redirecting to owner sign-in or continuing to the app
- AND the role-review gate is selected before app-registration policy is
  evaluated for that role-protected route
- AND a role for another app install does not satisfy the gate

#### Scenario: App admin satisfies role-protected app registration

- GIVEN an active principal has a valid browser session
- AND a protected app route requires `app.admin`
- AND the principal has active `app.admin` authority for that app install
- AND the principal has no separate `app-registration` record for that install
- WHEN account completion evaluates the protected app target
- THEN the required role satisfies the target's registration gate
- AND account completion continues to any later profile, terms, or target
  continuation checks
- AND a role for another app install does not satisfy registration or
  authorization for the requested target

#### Scenario: Gate completion writes through owning records

- GIVEN the browser completes a blocking account gate on the configured auth
  origin
- WHEN the runtime commits the completion
- THEN it writes only the flat identity-control-plane, instance control-plane,
  private auth, or app-owned records that own that gate
- AND app profile completion uses explicit app operations or app-owned records
  rather than direct auth-runtime materialization of arbitrary app data
- AND terms acceptance writes `principal-policy-acceptance` records rather than
  changing credential or session state
- AND invitation completion continues to consume private invite token state and
  commit identity invitation acceptance atomically with the existing invitation
  acceptance contract
- AND gate completion returns a path-only continuation target or a display-safe
  cross-domain handoff target only after all earlier blocking gates for the same
  requested target are satisfied
- AND no host-local session or handoff grant is issued while a blocking gate
  remains

#### Scenario: Target-scoped gates remain isolated

- GIVEN a principal can access one app install, organization, or route target
- AND another target has a missing app registration, profile completion, terms
  acceptance, invitation, or role-review gate
- WHEN account completion evaluates either target
- THEN satisfied gates for the first target do not satisfy unrelated gates for
  the second target
- AND selected organization context is explicit when it affects app
  registration, role, profile, or terms gates
- AND app-private profile fields for one app install or organization are not
  exposed through another target's gate response
- AND public anonymous operations remain available through their public action
  policy without creating account completion gates

#### Scenario: Closed app registration gate

- GIVEN account completion evaluates an app target whose app install has
  registration policy `closed`
- AND the active principal has no active identity `app-registration` record for
  the requested app install and current principal or selected organization
  context
- AND the target is not already authorized by a satisfied app-scoped runtime
  role requirement
- WHEN the runtime resolves the next blocking account gate
- THEN it returns a display-safe `app-registration` gate with the target app
  install id, target facts, and registration policy `closed`
- AND the auth origin renders the gate as a blocked state rather than a signup
  or app profile form
- AND the runtime does not create or activate principal, principal-email,
  app-registration, role-assignment, app-owned profile, credential, central
  session, host session, or handoff grant state from that gate

#### Scenario: Closed app registration satisfied

- GIVEN account completion evaluates an app target whose app install has
  registration policy `closed`
- AND the active principal or selected organization has an active identity
  `app-registration` record for the requested app install
- WHEN the runtime resolves account completion for that target
- THEN the `app-registration` gate is satisfied
- AND later gates for verified email, credential, invitation, profile
  completion, terms acceptance, and role review still evaluate normally for
  the same target

#### Scenario: Email-verified app registration gate

- GIVEN account completion evaluates an app target whose app install has
  registration policy `email-verified`
- AND the active principal has a verified primary `principal-email` record and
  an accepted credential method
- AND the active principal or selected organization has no active identity
  `app-registration` record for the requested app install
- WHEN the runtime resolves the next blocking account gate
- THEN it returns a display-safe `app-registration` gate with the target app
  install id, target facts, registration policy `email-verified`, and a
  runtime-owned completion operation reference
- AND the gate response does not expose email challenge secrets, credential
  material, central session ids, host session cookies, handoff grant secrets,
  app-owned profile values, provider responses, or app-controlled redirect
  targets

#### Scenario: Complete email-verified app registration gate

- GIVEN a browser with an active central auth session completes an
  `email-verified` app-registration gate on the configured auth origin
- AND the principal still has active status, a verified primary email, an
  accepted credential, and a target whose app install still has registration
  policy `email-verified`
- WHEN the runtime commits the gate completion
- THEN identity storage creates or reuses one active `app-registration` record
  for the requested app install and principal or selected organization context
- AND the write is rejected without a partial commit when the target app
  install is missing, disabled, no longer `email-verified`, scoped to another
  target, or already has a conflicting active app-registration
- AND completion does not create role assignments, app-owned profile records,
  credentials, owner authority, host-local sessions, or cross-domain handoff
  grants
- AND the runtime re-evaluates account completion for the same target before
  returning a continuation target or starting target-bound handoff

#### Scenario: Custom operation app registration gate

- GIVEN account completion evaluates an app target whose app install has
  registration policy `custom-operation`
- AND the active principal has a verified primary `principal-email` record and
  an accepted credential method
- AND the active principal or selected organization has no active identity
  `app-registration` record for the requested app install
- WHEN the runtime resolves the next blocking account gate
- THEN it returns a display-safe `app-registration` gate with the target app
  install id, target facts, registration policy `custom-operation`, and a
  runtime-owned completion operation reference
- AND the operation reference is derived from the app install's
  `registrationOperation` metadata and includes only the target app install,
  canonical operation key, operation name, entity name, and display label needed
  to launch the next account step
- AND the gate response does not expose email challenge secrets, credential
  material, central session ids, host session cookies, handoff grant secrets,
  app-owned profile values, operation input values, provider responses, or
  app-controlled redirect targets

#### Scenario: Complete custom operation app registration gate

- GIVEN a browser with an active central auth session completes a
  `custom-operation` app-registration gate on the configured auth origin
- AND the principal still has active status, a verified primary email, an
  accepted credential, and a target whose app install still has registration
  policy `custom-operation`
- WHEN the runtime commits the app-registration part of the gate
- THEN identity storage creates or reuses one active `app-registration` record
  for the requested app install and principal or selected organization context
- AND completion does not create role assignments, app-owned profile records,
  credentials, owner authority, host-local sessions, or cross-domain handoff
  grants
- AND the runtime re-evaluates account completion for the same target and
  returns a `profile-completion` gate for the app-owned registration operation
  when the app profile requirement remains unsatisfied

#### Scenario: Complete operation-backed profile gate

- GIVEN account completion returns a `profile-completion` gate with an app-owned
  registration operation reference
- AND the gate includes only the display-safe operation input contract fields
  and unsupported required input field names needed to render or block the form
- AND the browser submits declared operation input for that gate on the
  configured auth origin
- WHEN the runtime validates the current central auth session, target facts,
  current gate, operation reference, and operation input
- THEN the runtime invokes the declared operation against the target app storage
  identity with authenticated actor facts for the active principal and target
  session
- AND app profile records are created or updated only through the declared app
  operation effect, operation handler, or record plan
- AND operation record plans may write flat app records that reference
  `auth:principal`, `auth:organization`, or `auth:group` using normal identity
  reference validation
- AND the auth runtime does not directly materialize arbitrary app profile
  records outside the operation model
- AND after the operation commits, the runtime re-evaluates account completion
  for the same target before returning a continuation target or starting
  target-bound handoff
- AND the profile gate response does not expose credential material, challenge
  secrets, token hashes, central session ids, host session cookies, handoff
  grant secrets, provider responses, recovery material, app-private profile
  values beyond the operation's authenticated response contract, or
  app-controlled redirect targets

### Requirement: Email Verification Challenge State

The system SHALL store email verification challenge secrets as private
instance auth state bound to the configured auth origin and account target.

#### Scenario: Create email verification challenge

- GIVEN the account journey needs a verified email for owner setup, signup,
  invitation acceptance, recovery, or account completion
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
  an app-registration, issue credentials, issue sessions, or mint handoff
  grants

#### Scenario: Verify email challenge

- GIVEN a browser submits an email verification token on the configured auth
  origin for the matching account target
- WHEN private auth state verifies an unexpired, unrevoked, unconsumed token
- THEN a flow for an existing principal creates or updates one
  `principal-email` record with normalized email, display email, verified
  status, primary flag, and verified timestamp according to the target flow
- AND a pre-identity signup or first-owner flow instead retains a private
  verified email proof bound to its account target until identity activation
- AND the token is consumed only when the matching identity write or private
  first-owner proof is durable
- AND wrong-token, wrong-email, wrong-target, expired, revoked, consumed, or
  missing challenge attempts do not reveal whether an unrelated principal
  exists for the same email
- AND verification does not create app-registration records, role assignments,
  credentials, owner authority, host-local sessions, or handoff grants

### Requirement: Self-Service App Signup

The system SHALL support email-verification based self-service app signup for
app installs whose registration policy is `email-verified` or
`custom-operation`.

#### Scenario: Start self-service app signup

- GIVEN an anonymous browser requests an app route whose target app install has
  registration policy `email-verified` or `custom-operation`
- WHEN the route requires authenticated browser access and no valid principal
  session exists
- THEN the runtime redirects through `/formless/auth` on the configured auth
  origin with target-bound continuation facts
- AND the auth-origin signup surface may request a display name and email
  address for the target app install
- AND signup start rejects missing auth configuration, missing email delivery
  configuration, disabled app installs, unsupported registration policies,
  unsafe return targets, and app-controlled redirect targets before creating
  verification challenges or identity records

#### Scenario: Complete self-service app signup

- GIVEN a self-service signup flow has verified control of the requested
  primary email on the configured auth origin
- AND passkey registration has been verified for the signup principal on the
  configured auth origin and relying-party id
- WHEN the runtime commits signup for the requested app target
- THEN it stores or reuses an active principal, stores a verified primary
  `principal-email`, stores the passkey credential as private auth state,
  creates or reuses an active app-registration for the requested app install,
  and issues a central auth session on the configured auth origin
- AND duplicate normalized active emails, duplicate credentials, wrong-origin
  passkey ceremonies, wrong-target signup state, unsupported registration
  policy, and stale target facts reject signup without a partial commit
- AND signup does not grant owner authority, create a Program role assignment,
  create app-owned profile records, issue host-local sessions directly from
  the auth origin, or expose raw verification tokens, token hashes, credential
  material, central session ids, host session cookies, or handoff grant secrets
- AND after signup commits for an `email-verified` target, the runtime
  re-evaluates account completion for the target before returning a path-only
  continuation or target-bound handoff
- AND after signup commits for a `custom-operation` target, the runtime
  re-evaluates account completion and returns a `profile-completion` gate when
  the app-owned profile remains unsatisfied

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
  create app-registration records, grant roles, issue host-local sessions, or
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
  target app install or storage identity
- THEN authenticated browser routes and operations accept the request as
  authenticated
- AND the resulting operation invocation envelope includes actor kind
  `authenticated`, the principal id, and the route or storage target facts used
  for authorization

#### Scenario: Session without active authenticated principal

- GIVEN a browser request includes a valid central auth session, local-dev owner
  session, or host-local session
- WHEN the session principal is missing, disabled, revoked, or scoped to a
  different host, route, profile, app install, storage identity, or instance
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
- WHEN the principal opens the instance settings surface, app install and route
  management, or `/access`
- THEN management route access accepts the request
- AND backing operational management APIs apply their Program-administrator
  grant limits
- AND the principal does not receive access to installed app data without a
  separate matching app-install role

### Requirement: Principal-Backed App Admin Authorization

The system SHALL authorize installed app administration through active
principals with active app-install-scoped `app.admin` authority while keeping
instance management and owner authority separate.

#### Scenario: Matching app admin authority

- GIVEN a browser request includes a valid central auth session on the
  configured auth origin or a matching host-local session
- WHEN the session principal is active
- AND the principal has an active `app.admin` role assignment whose scope id is
  the target app install id
- THEN the target app admin browser route and its authorized app data APIs
  accept the request
- AND private document list, upload, open, download, and replacement APIs for
  that exact app install accept the request
- AND active `instance.owner` authority also satisfies the app admin boundary
- AND authorization uses current identity-control-plane principal and role
  assignment records rather than stale cookie or handoff facts

#### Scenario: App admin scope isolation

- GIVEN a principal has active `app.admin` authority for one app install
- WHEN the principal requests another app install, instance settings, or an
  owner-only route or operation
- THEN the app role does not authorize the request
- AND the principal cannot list, read, upload, replace, or inspect private
  documents owned by another app install
- AND the schema-defined Program `administrator` role alone does not authorize
  installed app data

#### Scenario: App admin authority is revoked

- GIVEN a central or host-local session was previously accepted for an app
  admin target
- WHEN the principal is disabled, the matching role assignment or role is
  disabled, or the applicable session version changes
- THEN future route checks, app reads, app writes, sync catch-up, and push
  delivery reject or narrow access immediately
- AND the session or open push connection does not retain authority from stale
  signed or attached role facts

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

#### Scenario: Owner setup bootstrap does not require owner-protected app state

- GIVEN owner setup is incomplete and an admin bearer token is available to a
  trusted CLI
- WHEN the CLI prepares an owner account setup URL
- THEN it may read owner setup status and create the setup capability without
  first reading installed app, route, deployment, archive, or browser session
  state
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
- **WHEN** browser onboarding needs an owner session for app install or local
  workspace gateway mutations
- **THEN** local session bootstrap is the owner-session setup path
- **AND** first-owner passkey setup is not required for local dev onboarding
- **AND** deployed or remote instance owner setup still uses the
  verified-email-first passkey-backed account journey

#### Scenario: Reject local bootstrap outside local dev

- **WHEN** a deployed instance, mapped host, app profile, site-authoring
  profile, published Site profile, cross-origin browser, or request without the
  active local bootstrap token calls the local session bootstrap endpoint
- **THEN** the request is rejected
- **AND** no principal, role assignment, credential, challenge, setup
  capability, app install, session, or provider state is written
