# Identity Control Plane Specification

## Purpose

Identity control plane defines the runtime-owned, reviewable identity records
for a Formless instance. It supplies common principal, email, group,
organization, protected-owner role, membership, invitation, account policy, and
policy acceptance contracts while keeping credentials, challenges, token
hashes, sessions, grants, and provider state outside reviewable Program records.

## Requirements

### Requirement: Runtime-Owned Identity Module

The system SHALL model instance identity facts as reusable runtime-owned App
schema declarations composed into the downstream Program.

#### Scenario: Identity control-plane contract

- GIVEN the identity control-plane record module is composed into a Program
- WHEN its declarations are loaded
- THEN it uses boundary schema key `auth` without selecting a separate runtime
  schema key, storage identity, generic API, cursor, snapshot, or replica
- AND it defines flat records for principals, principal emails, groups,
  organizations, memberships, protected-owner roles and assignments, Program
  role assignments, and invitations
- AND it defines flat records for account policies and principal policy
  acceptances used by account completion gates
- AND identity and instance declarations remain package-owned domains inside one
  complete Program schema
- AND credentials, passkey challenges, email verification challenge secrets,
  invite token hashes, auth sessions, cross-domain grants, raw recovery
  material, and provider responses are not identity control-plane records

#### Scenario: Normal App schema provenance

- GIVEN the runtime loads the identity control-plane schema contract
- WHEN the schema is parsed for package validation, standalone package
  materialization, or downstream composition
- THEN it uses the normal App schema parser and App schema source hash rules
- AND entity, field, relationship, query, read model, view, screen, operation,
  and runtime metadata changes all affect package schema provenance
- AND entity records remain flat Authority records with system-owned created
  and updated timestamps

#### Scenario: Identity package boundary

- GIVEN runtime, archive, workspace, generated UI, tests, or future auth
  runtime code needs identity entity names, role keys, schema modules, record
  value contracts, validation helpers, or display-safe canonicalization
- WHEN those contracts are imported
- THEN they come from `@dpeek/formless-identity-control-plane`
- AND the package root remains runtime-neutral and does not import browser,
  React, Worker, provider SDK, filesystem, app package registry, or live
  network behavior
- AND complete Program schema key, storage identity, provenance, generic API,
  cursor, replica, archive, and workspace selection remain downstream runtime
  concerns

#### Scenario: Package exposes composable schema modules

- GIVEN trusted TypeScript authoring needs reusable identity control-plane
  declarations
- WHEN it imports `@dpeek/formless-identity-control-plane/schema`
- THEN the package exports one record module that owns the identity
  control-plane entities, relationships, queries, and runtime control-plane
  entity policies
- AND it exports one presentation module that depends on the record module key
  and owns item views, table views, views, and screens
- AND the package's complete source schema explicitly composes the record
  module before the presentation module and supplies runtime ownership at the
  composition root
- AND the recomposed source preserves the current schema data,
  source-schema hash, and package provenance
- AND the modules remain runtime-neutral when a downstream Program selects
  Authority, storage, API, cursor, snapshot, or browser replica behavior

### Requirement: Program Identity Storage

The system SHALL store reviewable identity records in the Program Authority
without forcing private auth state into reviewable storage.

#### Scenario: Identity records use Program storage

- GIVEN a Worker request reads or writes reviewable identity records
- WHEN the request selects generic schema, bootstrap, sync, snapshot, or entity
  operation behavior
- THEN it uses the `formless-program` schema in the Authority Durable Object
  named `instance:control-plane`
- AND the canonical generic storage prefix is `/api/formless/program`
- AND `/api/formless/identity` does not expose a second Authority storage mount
- AND purpose-built identity capability routes may retain an identity-specific
  HTTP namespace while reading and writing Program storage

#### Scenario: Identity storage initialization

- GIVEN Program storage is initialized
- WHEN the first bootstrap, read, or write operation runs
- THEN storage is initialized from the complete materialized Program source
- AND schema-defined Program roles come from the root-owned
  `authorization.roles` catalog rather than mutable identity `role` records
- AND built-in `role` records remain only for protected owner authority
- AND each remaining built-in role record has a deterministic id derived from
  its role key, such as `role:instance.owner` for `instance.owner`

#### Scenario: Program identity management authorization

- GIVEN a Program or purpose-built identity request selects a read or write
  operation over identity records
- WHEN the request is authorized
- THEN generic Program bootstrap and sync require a management session whose
  active principal has protected owner authority or one active
  `program-role-assignment` for the schema-defined `administrator` role
- AND the shared Program access evaluator resolves that requirement against the
  active Program schema and current principal and assignment records
- AND trusted automation remains authorized by valid admin bearer authorization
- AND anonymous or ordinary authenticated browser requests cannot bootstrap,
  sync, read, or mutate Program identity records
- AND admin bearer authorization remains separate from browser login and
  identity-control-plane records
- AND purpose-built collaborator invitation APIs may use their own grant
  authority rules before writing invitation records or private auth token state
- AND those grant rules do not make generic identity-control-plane record
  editors, snapshot restore, raw role assignment writes, or owner recovery
  writes available to non-owner browser principals
- AND owner-only operations still recheck active `instance.owner` authority
  after Program replica access is granted

#### Scenario: Runtime identity write validation

- GIVEN an identity control-plane write operation creates, patches, or deletes
  reviewable identity records
- WHEN the runtime validates the write before commit
- THEN generic Program validation sees the complete mixed record set
- AND identity-control-plane validation helpers receive only records owned by
  identity stable entity ids
- AND each Program role assignment references a stable role id from the active
  Program schema and at most one active Program role assignment exists for a
  principal
- AND selected-target uniqueness for memberships, protected-owner role
  assignments, and policy acceptances is enforced before commit
- AND invalid references, unsupported entity names, duplicate active role keys,
  unknown Program role ids, duplicate normalized active emails, and duplicate
  assignment or selected-target facts reject the write without a partial commit

#### Scenario: Reviewable identity records share Program data movement

- GIVEN Program records are snapshotted, archived, restored, saved to workspace,
  or synced to the management replica
- WHEN reviewable identity records are selected
- THEN they use the same Program schema, record-id namespace, source cursor,
  snapshot, archive, workspace state file, and browser replica as instance
  control-plane records
- AND private auth state remains excluded from each of those boundaries

#### Scenario: Removed app identity facts are not current Program state

- GIVEN stored Program history contains app registrations, app role records,
  app-scoped assignments, or app-targeted invitations and policies
- WHEN identity validation, access summaries, account completion, snapshots,
  workspace source, archives, sync, or replica projection selects current state
- THEN those facts are omitted because they are not declared by the active
  identity module or current Program schema
- AND omission does not migrate, rewrite, tombstone, clean up, alias, or expose
  a compatibility surface for the dormant records

### Requirement: Principal And Email Records

The system SHALL represent every authenticated human or future service subject
as an instance-local principal.

#### Scenario: Principal record shape

- GIVEN the identity control-plane schema defines `principal`
- WHEN principal records are inspected
- THEN each principal stores display name, kind, and status as flat values
- AND supported first-pass principal kinds are `human` and `service`
- AND supported principal statuses are `active`, `invited`, and `disabled`
- AND owner is not a separate principal kind
- AND no passkey credential, password hash, OAuth token, session id, grant id,
  recovery secret, raw invite token, or provider response is stored on the
  principal record

#### Scenario: Principal email record shape

- GIVEN the identity control-plane schema defines `principal-email`
- WHEN principal email records are inspected
- THEN each principal email stores a principal reference, display email,
  normalized email, verification status, primary flag, recovery flag, and
  optional verified timestamp as flat values
- AND supported first-pass verification statuses are `unverified` and
  `verified`
- AND normalized active email values are unique within the instance identity
  storage
- AND email verification token hashes and challenge attempt state remain
  private auth runtime state

### Requirement: Groups, Organizations, And Memberships

The system SHALL model shared authorization containers and tenant/account
boundaries as flat identity records.

#### Scenario: Group and organization records

- GIVEN the identity control-plane schema defines `group` and `organization`
- WHEN those records are inspected
- THEN each record stores display name and status as flat values
- AND supported first-pass statuses are `active` and `disabled`
- AND groups act as permission containers
- AND organizations act as tenant or account containers
- AND neither record stores nested members, nested roles, credentials, sessions,
  provider state, or app-owned profile records

#### Scenario: Membership record shape

- GIVEN the identity control-plane schema defines `membership`
- WHEN a membership is created or patched
- THEN it stores one principal reference, one target kind, one target reference,
  and one status as flat values
- AND supported target kinds are `group` and `organization`
- AND the target reference resolves to the target kind selected by the record
- AND supported first-pass statuses are `active`, `invited`, and `disabled`
- AND active memberships are unique by principal, target kind, and selected
  target record
- AND membership facts do not duplicate app-specific account or profile records

### Requirement: Program And Protected Owner Role Assignments

The system SHALL store Program-wide schema role assignments without adapting
protected owner authority into the Program role model.

#### Scenario: Program role assignment record shape

- GIVEN the identity control-plane schema defines `program-role-assignment`
- WHEN Program role assignments are inspected
- THEN each assignment stores one principal reference, one stable schema role
  id, and one status as flat values
- AND supported statuses are `active` and `disabled`
- AND the stable role id resolves against the active Program schema's
  root-owned `authorization.roles` catalog
- AND one principal has at most one active Program role assignment
- AND the assignment has no target-kind selector, scope kind, app-install id,
  organization id, mutable role record reference, grants, or inheritance

#### Scenario: Protected owner vocabulary remains isolated

- GIVEN protected owner authority is inspected
- WHEN built-in identity role records are selected
- THEN the only built-in role key is `instance.owner`
- AND `instance.admin` is not a role record, assignment, or authorization fact
- AND protected-owner assignments target a principal at instance scope
- AND those assignments are not interpreted as Program schema role
  assignments
- AND the first owner remains represented as an `instance.owner` role
  assignment for a principal at instance scope

### Requirement: Invitation Records

The system SHALL store display-safe pending invitation facts without storing
raw auth secrets.

#### Scenario: Invitation record shape

- GIVEN the identity control-plane schema defines `invitation`
- WHEN invitation records are inspected
- THEN each invitation stores display-safe pending invite facts such as target
  email, target surface, invited principal, inviter principal, status, expiry,
  and optional accepted timestamp as flat values
- AND supported first-pass statuses are `pending`, `accepted`, `revoked`, and
  `expired`
- AND raw invite tokens, token hashes, verification challenge secrets, delivery
  provider responses, and email recovery secrets remain private runtime state

### Requirement: Account Policy Acceptance Records

The system SHALL store target-scoped account policy and terms acceptance facts as
flat identity records without treating acceptance as a credential.

#### Scenario: Account policy record shape

- GIVEN the identity control-plane schema defines `account-policy`
- WHEN account policy records are inspected
- THEN each policy stores display name, policy key, version, scope kind,
  optional scope reference, status, and optional published timestamp as flat
  values
- AND supported first-pass scope kinds are `instance` and `organization`
- AND `instance` scope does not require a scope reference
- AND `organization` scope requires the selected scope reference
- AND supported first-pass statuses are `active` and `retired`
- AND the policy record may reference display-safe policy text, document, or
  app-owned content by id or URL, but it does not store credentials, sessions,
  challenge secrets, provider responses, or raw recovery material

#### Scenario: Principal policy acceptance record shape

- GIVEN the identity control-plane schema defines `principal-policy-acceptance`
- WHEN acceptance records are inspected
- THEN each acceptance stores a principal reference, account policy reference,
  acceptance status, and accepted timestamp as flat values
- AND supported first-pass statuses are `accepted` and `revoked`
- AND active accepted records are unique by principal and account policy
- AND terms or policy acceptance does not by itself authenticate the principal,
  grant roles, issue sessions, or mint handoff grants

#### Scenario: Account policy acceptance target scope

- GIVEN an active account policy is scoped to an instance or organization
- WHEN account completion evaluates a `terms-acceptance` gate for a target
- THEN only policies whose scope applies to that target can block that target
- AND accepting a policy for one organization does not satisfy an unrelated
  organization policy
- AND stale, revoked, retired, tombstoned, or wrong-scope acceptance records do
  not satisfy the gate
- AND policy acceptance records remain reviewable identity records rather than
  private auth session state

### Requirement: Collaborator Invitation Creation

The system SHALL create pending collaborator invitations through
grant-authorized identity control-plane behavior without exposing auth secrets
as reviewable identity records.

#### Scenario: Create pending collaborator invitation

- GIVEN a browser session resolves to an active principal whose current role
  assignments authorize every requested invitation grant
- OR trusted automation supplies valid admin bearer authorization
- WHEN the request creates a collaborator invitation through
  `POST /api/formless/identity/collaborator-invitations` for a valid target
  email, target surface, and optional target organization
- THEN identity storage commits one pending `invitation` record with
  display-safe target facts
- AND the runtime sets expiry to seven days after the accepted request time
- AND the inviter principal reference is recorded when the request is
  authorized by a browser principal session
- AND optional invited principal, principal-email, membership,
  `program-role-assignment`, or protected-owner role-assignment records are
  normal flat identity records linked by id
- AND invited principal and membership records use invited status until invite
  acceptance activates them
- AND any role assignment created for an invited principal does not authorize
  browser access until the invited principal becomes active
- AND raw invite tokens, token hashes, rendered email bodies, email delivery
  provider responses, and session material are not stored on identity records

#### Scenario: Select invitation roles across access surfaces

- GIVEN access management offers current grant-authorized Program role levels,
  protected owner authority, and organization membership
- WHEN an invitation selects role grants
- THEN each choice identifies one exact access surface and one role level
- AND the invitation may select role levels for more than one access surface
- AND it selects at most one role level for each exact access surface
- AND the invitation record retains one exact target surface for acceptance
  continuation
- AND when one role surface is selected that surface may be used as the target
- AND when several role surfaces are selected the request explicitly chooses
  one of those selected surfaces as the acceptance target
- AND a missing, unavailable, unauthorized, or unselected acceptance target
  rejects the invitation before identity or private token state is written

#### Scenario: Owner grants collaborator invitation roles

- GIVEN a browser session resolves to an active principal with active
  `instance.owner` authority at instance scope
- WHEN the principal creates a collaborator invitation
- THEN the request may include invited principal, principal-email, membership,
  Program role-assignment, and protected-owner role-assignment records for any
  schema-defined Program role or `instance.owner`
- AND owner-only last-owner, recovery, credential, and admin-bearer safety
  rules remain enforced by the owner-only paths that manage those capabilities
- AND the invitation still does not authorize browser access until invite
  acceptance activates the invited principal and current authorization checks
  pass

#### Scenario: Administrator grants non-owner collaborator invitation roles

- GIVEN a browser session resolves to an active principal with one active
  Program role assignment for the schema-defined `administrator` role
- AND the principal does not have active `instance.owner` authority
- WHEN the principal creates a collaborator invitation
- THEN the request may include invited principal and principal-email records
- AND it may include one Program role assignment for `administrator`, `editor`,
  or `member`
- AND it may not include `instance.owner`, organization-scoped role
  assignments, group memberships, organization memberships, or owner recovery
  capabilities
- AND the inviter principal reference is recorded from the current browser
  principal

#### Scenario: Reject collaborator invitation outside grant authority

- GIVEN a browser session resolves to an active principal without current grant
  authority for at least one requested invitation record
- WHEN the principal creates a collaborator invitation
- THEN the request is rejected before identity records are written
- AND no private invite token hash, rendered invitation link, email delivery
  request, session, credential, grant, or reviewable invitation record is
  created
- AND stale signed session facts do not authorize the request after the
  inviter principal is disabled or its role assignments change

#### Scenario: Invitation delivery request

- GIVEN a pending collaborator invitation has been committed by identity storage
- WHEN the runtime schedules its delivery
- THEN delivery uses the email runtime with the invitation record id as source
  record and `instance:control-plane` Program identity as source storage
- AND delivery uses an idempotency key derived from the invitation id and
  delivery purpose
- AND email scheduling does not grant authentication, activate the invited
  principal, verify the target email, or issue a browser session

### Requirement: Access Management Surface

The system SHALL expose dedicated instance access management behavior for
owner and administrator principals without exposing the raw generated
identity-control-plane record editor to normal administrators.

#### Scenario: Read access management summary

- GIVEN a browser session resolves to an active principal with protected owner
  authority or the schema-defined `administrator` role
- WHEN the principal opens the dedicated instance access management surface and
  reads `GET /api/formless/identity/access-summary`
- THEN the surface reads identity data through purpose-built access management
  behavior
- AND the response includes only display-safe people, primary email, role,
  organization, group, and invitation summary facts needed by the surface
- AND the response includes display-safe collaborator invitation grant choices
  derived from the current actor's active owner or Program administrator
  authority and exact available Program and organization surfaces
- AND revoked invitations and disabled principals may remain reviewable
  identity records without remaining in the active invitation or people lists
- AND raw invite tokens, token hashes, credential material, passkey challenge
  secrets, session ids, handoff grant secrets, provider responses, recovery
  material, and admin bearer material are not returned
- AND normal administrators do not receive generic identity-control-plane
  record editor, snapshot restore, raw role-assignment write, or owner recovery
  access through the surface

#### Scenario: Create collaborator invitation from access management

- GIVEN the dedicated access management surface submits an invitation request
  for a target email, display name, target surface, and requested
  roles, groups, or organization memberships
- WHEN the request is accepted
- THEN it uses the collaborator invitation creation contract and private invite
  token boundary
- AND the role and membership choices are limited to grants authorized for the
  current browser principal
- AND a principal authorized only by the `administrator` Program role cannot
  grant `instance.owner`, owner recovery capabilities, admin bearer
  capabilities, or destructive identity authority
- AND raw invite tokens and token hashes remain unavailable to the browser
  surface except for the delivery path that renders the invitation link

#### Scenario: Delete pending collaborator invitation from access management

- GIVEN the dedicated access management surface submits a delete request for a
  pending collaborator invitation
- AND the browser session resolves to an active principal with protected owner
  authority or the schema-defined `administrator` role
- WHEN the request is accepted
- THEN identity storage changes the matching `invitation` record status to
  `revoked`
- AND the active invitation list omits the revoked invitation after refresh
- AND the reviewable invitation record is retained rather than hard deleted
- AND the invitation keeps display-safe target email, target surface, inviter
  principal, invited principal, target organization, expiry, and
  accepted timestamp facts when present
- AND private instance auth state revokes the matching invitation token so the
  invitation link can no longer be accepted
- AND revocation does not activate invited principals, verify principal emails,
  enable invited memberships, grant role
  authority, issue credentials, issue sessions, or mint handoff grants
- AND raw invite tokens, token hashes, credential material, passkey challenge
  secrets, session ids, handoff grant secrets, provider responses, recovery
  material, and admin bearer material are not returned to the browser surface

#### Scenario: Reject invalid collaborator invitation revocation

- WHEN an access management revoke request targets a missing, accepted,
  expired, already revoked, or tombstoned invitation
- THEN the request is rejected before writing identity records
- AND private invitation token state, credentials, sessions, handoff grants,
  pending grant records, and email delivery records remain unchanged
- AND the response does not expose raw invite tokens, token hashes, passkey
  challenge secrets, credential material, session ids, handoff grant secrets,
  provider responses, recovery material, or admin bearer material

#### Scenario: Replace person role levels from access management

- GIVEN the dedicated access management surface submits the exact desired role
  level for each editable access surface of an existing active principal
- WHEN the current browser principal is still authorized to grant and remove
  every changed role level
- THEN identity storage disables replaced or removed role assignments and
  creates or reactivates the selected assignments in one identity commit
- AND role assignments outside the current actor's grant authority remain
  unchanged
- AND a request that attempts to alter a protected assignment is rejected
  rather than partially applied
- AND only an active `instance.owner` may grant, replace, or remove
  `instance.owner`
- AND a Program administrator may manage `administrator`, `editor`, `member`,
  but may not manage owner or organization authority
- AND current principal, role, assignment, target, and actor authority are
  re-read during the mutation instead of trusted from the browser summary
- AND successful replacement immediately narrows subsequent route, data,
  operation, handoff, host-session, and push authorization that depends on a
  removed role

#### Scenario: Preserve one active owner

- GIVEN a person role replacement or person removal would remove active
  `instance.owner` authority
- WHEN identity storage evaluates the mutation against current principals and
  role assignments
- THEN the mutation is authorized only for an active `instance.owner`
- AND it is rejected if it would leave the instance without an active owner
- AND the rejection does not change principal, role assignment, credential,
  session, invitation, membership, or private auth state

#### Scenario: Remove person from access management

- GIVEN the dedicated access management surface submits an explicitly confirmed
  remove request for an active or invited principal
- WHEN the current browser principal has active authority to manage that
  principal and the last-owner rule is satisfied
- THEN identity storage changes the principal status to `disabled`
- AND any pending invitation records bound to the principal change status to
  `revoked`
- AND private instance auth state revokes the matching pending invitation
  tokens so those invitation links can no longer be accepted
- AND the active people list omits the disabled principal after refresh
- AND existing email, membership, role-assignment, policy, and invitation
  identity records, including revoked invitations, remain
  reviewable rather than being hard deleted
- AND private credentials remain outside reviewable identity records and are
  not deleted by this access-management action
- AND the disabled principal and its retained assignments cannot authorize
  subsequent browser entry, data access, operations, handoff, host sessions, or
  push delivery
- AND a Program administrator cannot remove a principal with active
  `instance.owner` authority

#### Scenario: Reject unauthorized access management request

- GIVEN a browser session is missing, stale, disabled, scoped to the wrong
  Program, or lacks protected owner authority or the schema-defined
  `administrator` role
- WHEN it reads the access management summary, creates or deletes an
  invitation, replaces person roles, or removes a person through the dedicated
  access management behavior
- THEN the request is rejected before identity records, private invite token
  state, rendered invitation links, or email delivery requests are created
- AND stale signed session facts do not authorize access after the principal is
  disabled or role assignments change

#### Scenario: Access mutations remain purpose-built

- GIVEN the dedicated access management surface is available
- WHEN a principal deletes an invitation, replaces role assignments, grants or
  removes owner authority, or removes a person
- THEN the surface uses purpose-built access management requests with explicit
  confirmation for destructive effects
- AND it does not expose generic identity record editors, arbitrary record
  plans, snapshot restore, credential management, session material, or owner
  recovery controls

### Requirement: Reactive Access Management Presentation Contract

The system SHALL project dedicated instance access management through complete
renderer-neutral Presentation contracts on the stable application host while
identity runtime code owns authority, invitation creation and delivery,
revocation, refresh, validation, and private auth state.

#### Scenario: Project complete access management presentation

- GIVEN an authenticated principal opens `/access`
- WHEN runtime prepares the current access management presentation
- THEN one typed `AccessManifestReference` resolves one loading, unauthorized,
  failed, or ready access snapshot
- AND a ready access snapshot carries the `Access` title, display-safe people
  with primary email, status, role labels, role-edit availability, and
  person-removal availability
- AND it carries display-safe invitations with target, scope, status, expiry,
  inviter, and explicit deletion availability, page feedback, one
  invitation-authoring reference, and current person-role authoring when open
- AND the invitation-authoring snapshot carries dialog visibility, controlled
  target email, display name, one flat role-level selection, a conditional
  acceptance-target field when selected roles span several surfaces, ordered
  membership option groups, exact selected option ids, explicit option and
  control disabled reasons, validation, pending state, feedback, and cancel and
  submit actions
- AND invitation validation remains hidden until the first submit attempt, when
  invalid fields publish their errors without invoking invitation creation
- AND person-role authoring reuses the flat role-level selection contract with
  the person's current exact selected role levels and save and cancel actions
- AND selected role options remain visible while the other role levels for each
  selected surface are omitted until that selected level is removed
- AND person removal and invitation deletion carry explicit confirmation,
  pending, success, and failure contracts
- AND organization, group, membership, role, inviter, and scope labels are
  resolved before publication rather than being reconstructed from raw records
  or displayed from storage ids
- AND access snapshots contain no raw identity records, grant-authority
  internals, invitation requests, API clients, runtime callbacks, React nodes,
  raw invite tokens, token hashes, credentials, challenge secrets, session ids,
  handoff grants, provider responses, recovery material, or admin bearer
  material

#### Scenario: Compose access presentation on the application host

- GIVEN the application shell host is active and `/access` is the selected
  React route child
- WHEN shell, access summary, invitation authoring, person-role authoring,
  feedback, or confirmation presentation changes
- THEN the access runtime contributes its renderer-neutral nodes and current
  intent handler through the existing application-host publication coordinator
  without creating a nested host or replacing the stable host context
- AND server rendering seeds `/access` with its loading access-manifest node
  before route-child effects run, and hydration replaces that contribution
  atomically with current runtime state
- AND controlled invitation or person-role draft changes replace only their
  authoring snapshot while a semantically unchanged access summary retains
  object identity and does not notify its reference scope
- AND the complete access contribution adds and removes its manifest and
  authoring nodes atomically without changing shell reference roles or route
  selection

#### Scenario: Dispatch canonical access management intents

- GIVEN a subscribed access renderer reads the access manifest and invitation
  or person-role authoring snapshots
- WHEN the user opens or closes authoring, changes a field, replaces the exact
  selected role-level set, selects membership options, chooses an acceptance
  target, submits an invitation or person-role replacement, opens or closes
  destructive confirmation, or confirms invitation deletion or person removal
- THEN the renderer dispatches canonical access intents carrying exact current
  access, authoring, person, field, selected option set, invitation,
  confirmation, and control identity as applicable
- AND runtime resolves each intent against its latest summary, controlled
  draft, allowed grant options, active authority, and pending state before
  changing state or invoking an effect
- AND each role selector change is one atomic selected-set intent rather than
  concurrent per-option intents that can overwrite one another
- AND successful invitation creation resets and closes authoring, refreshes the
  display-safe summary, and publishes success feedback without exposing private
  delivery state
- AND successful person-role replacement refreshes the person and role summary
  before publishing success feedback
- AND invitation deletion and person removal require explicit destructive
  confirmation and refresh the active summary after success
- AND renderers do not construct invitation requests, infer authority, read
  identity APIs, construct role replacement or person removal requests, create
  or deliver tokens, revoke private token state, refresh summaries, redact
  errors, or navigate directly

#### Scenario: Formless Renderer consumes access contracts

- GIVEN production `/access` publishes complete renderer-neutral access
  contracts while runtime retains invitation effects
- WHEN runtime publishes the complete access contract graph
- THEN one subscribed Formless Renderer access entrypoint reads only access
  references and snapshots, renders people, roles, invitations, controlled
  invitation and person-role authoring, feedback, empty, unauthorized, loading,
  failure, and destructive confirmation states, and dispatches canonical
  access intents
- AND access runtime imports contracts and host behavior from documented
  `@dpeek/formless-presentation` subpaths while renderer entrypoints come from
  documented `@dpeek/formless-renderer` subpaths
- AND focused coverage asserts projection, current intent resolution, authority,
  controlled drafts, pending behavior, visible outcomes, and secret exclusion
- AND production mounts access presentation through the root
  `FormlessApplicationRenderer`

#### Scenario: Formless access management renderer

- GIVEN runtime publishes complete production access contracts
- WHEN the selected renderer implements the contract in `lib/renderer`
- THEN pure and subscribed renderer entrypoints use package `Section`, stack,
  and grid primitives for page layout, `Table` for the uniform people and
  invitation summaries, and `Badge` and `Timestamp` for status and temporal
  facts
- AND unavailable person-removal controls remain visible as disabled
  destructive buttons whose disabled reason is available on hover and keyboard
  focus
- AND invitation authoring opens in a form-purpose `Dialog` using `FormLayout`,
  `TextInput`, `Selector`, and `DateTimeInput` for controlled single-value
  fields
- AND invitation and person role levels render in one flat `MultiSelector`
  whose ungrouped labels combine the display-safe surface and level, such as
  `Instance — Owner`, `Instance — Administrator`, and
  `Site — Administrator`
- AND selecting one role level for a surface removes its other level options
  until the selected level is removed
- AND invitation authoring renders an acceptance-target `Selector` only when
  selected role levels span several surfaces
- AND memberships render in a separate sectioned `MultiSelector` grouped by
  Organizations and Groups instead of expanded checkbox lists
- AND grant selectors do not offer select-all, large option sets are searchable,
  and projected disabled reasons remain visible without the renderer inferring
  authority from role names, target kinds, or option ids
- AND person rows expose role-edit and destructive remove controls while
  pending invitation rows expose a destructive delete control
- AND loading, empty, validation, pending, success, and failure states compose
  package `Spinner`, `EmptyState`, `FieldStatus`, and `Banner` patterns, and
  invitation deletion and person removal compose `AlertDialog` before
  dispatching their confirm intents
- AND the renderer uses package-owned styling and contains no identity runtime
  imports, API clients, effect handlers, private auth state, or production
  assembly behavior

#### Scenario: Access management contract fixtures

- GIVEN runtime publishes complete production access contracts
- WHEN access UX is evaluated with package-local renderer fixtures
- THEN serializable data-only memory-host fixtures cover owner and
  Program administrator grants, loading, unauthorized, failed, empty and populated
  summaries, people and roles, organizations and groups, app-scoped grants,
  flat invitation and person-role authoring, multi-surface acceptance-target
  selection, exclusive role levels, pending and successful creation and role
  replacement, invitation deletion, person removal, confirmation, success, and
  failure
- AND a focused Access layout composes the subscribed access renderer as the
  route child of the existing application shell through one memory host
- AND minimal reducers may simulate canonical draft, atomic selected-set,
  dialog, submit, confirmation, delete, role replacement, and removal intents
  without importing identity runtime, storage, APIs, invitation delivery,
  credentials, sessions, private token state, navigation, or timers
- AND fixtures contain no secrets, generic identity editing, production
  assembly behavior, or behavior that bypasses the canonical Presentation Host

### Requirement: Collaborator Invitation Acceptance

The system SHALL accept pending collaborator invitations through auth-origin
identity behavior without exposing private auth secrets as reviewable identity
records.

#### Scenario: Invitation acceptance summary

- GIVEN a browser opens a collaborator invitation acceptance link on the
  configured auth origin
- WHEN the runtime verifies the invitation id and raw invite token against
  private auth state and a pending identity `invitation` record
- THEN the response contains only display-safe invitation facts such as target
  email, target surface, expiry, invited principal display name, and whether
  passkey registration is required
- AND the raw invite token, token hash, existing principal lookup results,
  passkey challenge secret, credential material, central session id, and host
  session state are not returned or stored on identity records
- AND checking acceptance eligibility does not consume the invite token, mark
  the invitation accepted, activate identity records, or issue a browser
  session

#### Scenario: Accept invitation into identity records

- GIVEN private auth state has verified an unexpired, unrevoked, unconsumed
  collaborator invitation token
- AND the auth runtime has verified passkey registration for the invited
  principal when a new principal needs a credential
- WHEN invitation acceptance is committed for the matching pending identity
  `invitation`
- THEN the invitation status becomes `accepted` and stores `acceptedAt`
- AND the invited principal is created or changed to active status
- AND the target principal email is recorded as verified for the accepted
  principal
- AND invited memberships for the accepted principal become active
- AND role assignments linked to the accepted principal authorize only after
  the principal is active and current authorization checks pass
- AND all reviewable identity changes for acceptance are committed together or
  rejected together without a partial identity commit

#### Scenario: Reject invalid invitation acceptance

- WHEN acceptance uses a missing, expired, revoked, already accepted,
  already consumed, wrong-token, wrong-email, or wrong-target invitation
- THEN identity records are not activated
- AND the invitation token is not consumed unless the matching invitation
  acceptance commit succeeds
- AND the response does not reveal whether an unrelated principal exists for
  the same email address
- AND no passkey credential, central auth session, host-local session, or
  cross-domain grant is issued

### Requirement: Target-Aware Identity Uniqueness

The system SHALL enforce identity uniqueness according to the record's selected
target and scope rather than raw optional fields.

#### Scenario: Do not use generic unique constraints for alternative targets

- GIVEN an identity record uses a selector such as target kind or scope kind
- AND the selected value decides which reference or scope field is meaningful
- WHEN the identity control-plane schema declares uniqueness
- THEN it does not declare generic App schema unique constraints over mutually
  exclusive optional target or scope fields
- AND selected-target uniqueness is enforced by identity-control-plane
  validation helpers or runtime-owned identity operation validation
- AND unselected optional target and scope fields are ignored for uniqueness
  decisions

#### Scenario: Membership uniqueness allows multiple containers

- GIVEN one active principal belongs to two different groups
- OR the same active principal belongs to two different organizations
- WHEN identity-control-plane records are validated
- THEN the records are valid
- AND a duplicate active membership for the same principal, target kind, and
  selected target record is rejected
- AND tombstoned duplicate memberships do not block the active membership

#### Scenario: Role assignment uniqueness

- GIVEN two different active principals receive the same role in the same scope
- WHEN identity-control-plane records are validated
- THEN the records are valid
- AND two different active role levels for the same target kind, selected target
  record, scope kind, and selected scope id are rejected
- AND replacing a level disables the prior assignment before the new level
  becomes active in the same identity commit
- AND tombstoned duplicate role assignments do not block the active assignment

#### Scenario: Policy acceptance uniqueness allows multiple policies

- GIVEN one active principal accepts two different active account policies
- OR two different active principals accept the same active account policy
- WHEN identity-control-plane records are validated
- THEN the records are valid
- AND a duplicate accepted principal policy acceptance for the same principal and
  account policy is rejected
- AND tombstoned duplicate policy acceptances do not block the active
  acceptance

### Requirement: Identity Boundary For App References

The system SHALL expose identity records through stable qualified entity names
without making app schemas own auth records.

#### Scenario: Qualified identity entity names

- GIVEN an external boundary combines identity records with records from another
  schema
- WHEN identity entity names are emitted
- THEN they use qualified names such as `auth:principal`, `auth:organization`,
  and `auth:group`
- AND the right-hand side remains the local identity entity key
- AND normal record values remain flat record ids

#### Scenario: Resolve app identity reference targets

- GIVEN an app Authority validates a record value for `auth:principal`,
  `auth:organization`, or `auth:group`
- WHEN it asks the identity control plane to resolve the target record id
- THEN the lookup reads the identity entity from Program storage identity
  `instance:control-plane`
- AND the lookup confirms the record exists, uses the requested identity entity,
  and is not tombstoned
- AND missing, tombstoned, wrong-entity, or unsupported qualified identity
  targets fail without exposing credentials, challenge secrets, token hashes,
  sessions, grants, recovery material, or provider responses
- AND resolving the reference does not copy identity records into the app
  storage identity

#### Scenario: App-owned profile extension

- GIVEN an app needs app-specific profile, account, customer, or tenant facts
- WHEN that app models those facts
- THEN it stores normal flat app records that reference identity records by id
- AND principal, email verification, credential, session, role assignment,
  group, organization, and invitation state remain identity or private auth
  runtime state
- AND direct auth-runtime materialization of arbitrary app records is not the
  identity control-plane contract

### Requirement: Private Auth State Boundary

The system MUST keep authentication secrets and session material outside
reviewable identity records.

#### Scenario: Private credential and session state

- GIVEN passkeys, future OAuth, magic links, passwords, SSO, central auth
  sessions, host sessions, cross-domain grants, recovery challenges, invite
  tokens, or revocation rows are stored
- WHEN storage is inspected through identity control-plane records, workspace
  state, archives, sync payloads, generated UI, or reviewable snapshots
- THEN those private auth facts are absent
- AND display-safe identity records may reference principals, roles, groups,
  organizations, invitations, account policies, policy acceptances, and
  verification status without exposing raw secrets

#### Scenario: Owner auth uses principal and role records

- GIVEN first-owner setup or local-dev owner bootstrap creates owner authority
- WHEN reviewable identity records are inspected
- THEN owner authority is represented by an active `principal` record and an
  active `instance.owner` role assignment for that principal at instance scope
- AND an optional owner email is represented by a `principal-email` record for
  that principal
- AND passkey credentials, passkey challenges, owner session material, setup
  capability token hashes, and raw browser cookie values remain private
  instance-auth runtime state outside identity-control-plane records
- AND admin bearer authorization remains separate from browser login and
  identity-control-plane records
