# Public Operations Specification

## Purpose

Public operation bindings execute schema-declared Program entity operations for
public callers through narrow Program routes while preserving protected
operation and generic Program APIs.

## Requirements

### Requirement: Public Operation Policy

The system SHALL let schema-declared operations opt in to public execution
through an explicit actor policy and public binding.

#### Scenario: Public exposure is a binding

- GIVEN a schema-declared operation can be invoked by an anonymous actor
- WHEN public execution models are selected
- THEN the public form, Program route, challenge requirement, origin rule,
  rate-limit rule, and response filtering are public bindings or operation
  policy facts
- AND those facts do not redefine the operation input, output, effect,
  idempotency, audit, or Program storage identity
- AND public access remains part of the operation interaction model

#### Scenario: Reject operation without public policy

- GIVEN an anonymous request targets a schema operation that has no public
  actor policy or public binding
- WHEN the public operation executor evaluates the request
- THEN the request is rejected
- AND no operation effects are committed
- AND the rejection is recorded as an operation invocation only after the
  Program public operation route and declared operation are resolved

#### Scenario: Resolve declared public operation

- GIVEN a public form targets an entity operation key
- WHEN the schema or public Site tree is selected for public execution
- THEN the operation key resolves to one source-declared public operation in the
  active Program schema
- AND anonymous callers invoke that operation through the public operation
  executor

#### Scenario: Anonymous operation is eligible

- GIVEN a schema operation policy allows anonymous public execution
- WHEN an anonymous request targets that operation
- THEN the public operation executor evaluates the request through the public
  operation path
- AND the executor does not require owner session or admin bearer authorization
  for that request

#### Scenario: Executor uses schema-owned eligibility

- GIVEN an anonymous public operation route resolves to a declared operation
- WHEN the public operation executor evaluates operation eligibility
- THEN it consumes the schema-owned public operation eligibility facts for the
  declared operation
- AND target route resolution, request origin evaluation, Turnstile secret
  verification, rate-limit counters, Authority storage identity selection,
  Authority reads or writes, audit rows, idempotency, and post-commit delivery
  side
  effects remain runtime-owned

#### Scenario: Execute public operations

- GIVEN an entity operation declares anonymous public policy
- WHEN public execution models are selected
- THEN public execution invokes the operation envelope and policy model
- AND public read, create, and command execution returns operation-native public
  output rather than adapter-private storage or materialization metadata

#### Scenario: Execute public create operation

- GIVEN the Site schema declares `contact-message.submit` as an anonymous
  Turnstile-protected create operation
- WHEN a visitor posts declared contact message input to the Program public
  operation route
- THEN the executor validates `operation.input.fields` before Turnstile
  verification
- AND successful execution commits one flat `contact-message` record
- AND the public response returns create-shaped operation output
- AND Turnstile proof values are not stored in the created record or returned in
  the public response

#### Scenario: Reject missing affirmative acceptance

- GIVEN a public operation input declares an entity-backed boolean with
  `required: true` and `mustBeTrue: true`
- WHEN a direct public operation request submits `false` for that input
- THEN schema-owned operation input validation rejects the request before
  Turnstile verification
- AND no operation effects are committed
- AND ordinary required boolean operation inputs without `mustBeTrue` continue
  to accept explicit `false`

#### Scenario: Execute parameterized public list operation

- GIVEN an app declares an anonymous list operation whose input-constrained
  query, `maxResults`, same-origin rule, rate limit, and anonymous response
  fields satisfy public read policy
- WHEN a visitor posts declared scalar lookup input to the Program public
  operation route
- THEN the executor validates the declared input and binds it into the
  operation query context by input name
- AND query evaluation performs only the source-declared exact lookup and
  returns no more than `maxResults`
- AND each public result contains only the explicitly declared anonymous
  response value fields
- AND record ids, entity names, system timestamps, undeclared values, customer
  fields, order fields, query definitions, and generic app records are excluded
- AND the lookup commits no app record changes and does not run post-commit
  write side effects
- AND no match returns an empty public result rather than a generic listing

#### Scenario: Public contact notification side effect

- GIVEN a Site contact message public operation commits successfully
- WHEN instance email defaults and a contact notification recipient are
  configured
- THEN post-commit email notification scheduling may create or update platform
  email delivery records outside Program storage identity
- AND the public operation response remains the operation-native create output
- AND provider delivery status, sender verification facts, and notification
  recipient configuration are not returned in the public response
- AND retries use the public operation idempotency key and contact notification
  purpose to avoid duplicate sends

#### Scenario: Public operation input notification side effect

- GIVEN a public operation form submission commits successfully
- WHEN the form binding or target configuration enables an operation input
  notification and instance email defaults and a recipient are configured
- THEN post-commit email notification scheduling may create or update platform
  email delivery records outside Program storage identity
- AND the notification message is rendered from the submitted operation input,
  public-safe field labels, canonical operation key, target storage identity,
  request host and path, Site block id when supplied, and command output fields
  already exposed by the operation policy for the anonymous actor
- AND submitted input extraction and display-row projection are concentrated in
  a display module that consumes the operation invocation response,
  schema-owned public-safe input field projection, and active Program schema
- AND the display module supports create, record-plan command, and operation
  handler command public operation input shapes
- AND scalar display formatting maps booleans to `Yes` or `No`, enum values to
  public-safe or schema labels when available, finite numbers to decimal text,
  and text values to string display values
- AND the HTML notification body renders operation facts, submitted input, and
  non-empty operation output rows as key-value tables
- AND configured reply-to fields may use submitted scalar input values but
  missing or invalid reply-to values do not block the committed operation
- AND the public operation response remains the operation-native create or
  command output
- AND provider delivery status, sender verification facts, notification
  recipient configuration, Turnstile proof values, and private notification
  errors are not returned in the public response
- AND retries use the public operation idempotency key and notification purpose
  to avoid duplicate sends

#### Scenario: Execute public record-plan command operation

- GIVEN a Program module declares an anonymous public command operation with a
  `recordPlan` effect
- WHEN a visitor posts declared input and proof data to the Program public
  operation route
- THEN the executor validates the operation input contract before challenge
  verification or record materialization
- AND successful execution commits only the flat records declared by the
  operation record plan for Program storage identity
- AND the public response and after-commit side effects expose only the command
  output payload field names, record ids, or metadata allowed by the operation
  policy
- AND challenge proof values, provider secrets, and protected internal fields
  are not stored in committed app records or returned in the public response

#### Scenario: Execute public operation handler command

- GIVEN the Program declares an anonymous public command operation with an
  `operationHandler` effect whose handler is public-eligible
- WHEN a visitor posts declared input and proof data to the Program public
  operation route
- THEN the executor validates the operation input contract before challenge
  verification or handler materialization
- AND successful execution commits only records planned or written by that
  operation handler for Program storage identity
- AND handler execution receives operation source facts such as host, path,
  canonical operation key, and Site block id through the operation envelope
- AND public execution tests, fixtures, and response helpers use operation names
  consistently

#### Scenario: Execute Program CRM public subscribe operation

- GIVEN the Program declares `subscription.subscribe` as an anonymous public
  command operation with the `subscribe` operation handler
- WHEN a visitor posts valid subscribe input to
  `/api/formless/program/public/operations/subscription/subscribe`
- THEN the public operation executor commits the handler-planned shared contact
  subscription records to Program storage identity
- AND the executor returns command-shaped public output without exposing the
  submitted email address, Turnstile proof, provider details, or protected
  internal storage state
- AND replaying the same idempotency key returns the original committed public
  operation response without duplicating CRM contact, email-address, audience,
  or subscription records

### Requirement: Program Public Operation API

The system SHALL expose public operation execution only through the narrow
Program public-operation endpoint.

#### Scenario: Program-native Site and CRM public operation route

- GIVEN a visitor posts to
  `/api/formless/program/public/operations/:entityKey/:operationKey`
- WHEN the route resolves a package-owned Site or CRM operation with anonymous
  public policy
- THEN the dedicated public executor uses Program storage identity
  `instance:control-plane`
- AND effects are committed through Program record validation and the Program
  write log
- AND the request does not gain Program bootstrap, schema, sync, WebSocket,
  snapshot, generic operation, or replica access

#### Scenario: Shared public operation route contract

- GIVEN public Site projection builds a target public operation route or Worker
  code parses an Authority-relative public operation path
- WHEN route construction or parsing evaluates the public operation suffix
- THEN one public operation route contract owns
  `/public/operations/:entityKey/:operationKey` path construction, segment
  encoding, segment decoding, and suffix shape validation
- AND target Authority storage identity resolution remains runtime-owned
  outside that route contract
- AND invalid public operation suffixes fail before public operation policy,
  JSON body parsing, or app storage initialization

#### Scenario: Generic write routes stay protected

- GIVEN a visitor lacks owner session or admin bearer authorization
- WHEN the visitor posts outside the Program public operation route
- THEN protected operation, schema reset, snapshot restore, and
  package migration write routes return the configured unauthorized response
  before evaluating public operation policy, parsing JSON, or initializing app
  storage
- AND no public operation invocation row is recorded for those protected generic
  write attempts

#### Scenario: Public operation route stays narrow

- GIVEN a visitor posts to the Program public operation route
- WHEN the route does not resolve a declared public operation on the target
  Authority storage identity
- THEN the runtime returns a public-safe unavailable response
- AND no operation effect is committed
- AND the unavailable response does not expose whether a protected generic write
  route exists for the same entity

#### Scenario: Public list route does not become a query API

- GIVEN a visitor posts to a declared Program public list operation route
- WHEN the request includes an entity, query, expression, field selection,
  ordering, projection, or result limit not declared by the source operation
- THEN the request is rejected as invalid public input
- AND the runtime does not expose generic app listing, record get, query, or
  projection behavior through the public route

### Requirement: Public Operation Execution Envelope

The system SHALL normalize each public operation request into an operation
invocation envelope before validating input or committing effects.

#### Scenario: Anonymous execution envelope

- GIVEN an anonymous public operation request is accepted for evaluation
- WHEN the public operation executor builds the envelope
- THEN the envelope includes actor mode `anonymous`, target Authority storage
  identity, canonical operation key, request host, request path, source block id
  when
  supplied, public input, received timestamp, and proof or idempotency facts
  only when required by the operation policy
- AND the public executor builds an auditable public envelope from request
  source facts, public input, optional idempotency, and received timestamp
  before optional challenge verification
- AND challenge-protected public execution rebuilds the envelope through the
  same public source-kind boundary with verified proof facts before Authority
  execution

#### Scenario: Source context is preserved

- GIVEN a public operation commits records
- WHEN operation effects are written
- THEN committed records or operation response metadata include enough source
  context to identify the operation, target Authority storage identity, host,
  path,
  and Site block that caused the write
- AND source records identify the causing operation by canonical operation key
- AND source records are produced by operation-native create, record-plan, or
  operation handler execution

#### Scenario: Program-native Site and CRM source context

- GIVEN a Program-native Site or CRM public operation commits records
- WHEN source context is recorded
- THEN its source target kind is `program`, schema key is `formless-program`,
  and API prefix is `/api/formless/program`
- AND source context identifies the canonical operation, host, path, and Site
  block when those facts apply
- AND this audit context does not become generic Program access or an alternate
  storage, route, replica, media, or authorization identity

#### Scenario: Public operation contracts are operation-named

- GIVEN app, client, Worker, Site runtime, or tests import public execution
  protocol contracts
- WHEN those contracts describe public operation execution, storage targets,
  source facts, effects, audit facts, or responses
- THEN the exported names use `PublicOperation` terminology
- AND source records identify public writes by canonical operation key rather
  than display label

#### Scenario: Browser client request envelope

- GIVEN browser code submits a public operation from a public form
- WHEN the browser client helper builds the request body
- THEN the body contains submitted public input values, optional
  `proof.turnstileToken`, optional `source.siteBlockId`, and optional
  idempotency key using the public operation request envelope
- AND proof and idempotency are omitted for a challenge-free public read
- AND generated public operation forms may resolve controlled operation drafts
  into flat public input values before calling the browser client helper
- AND product-specific forms remain responsible for mapping their own UI fields
  into the submitted public input values

#### Scenario: Browser client response guards

- GIVEN browser code receives a public operation JSON response
- WHEN the browser client helper validates the response
- THEN it accepts committed or replayed public operation responses with command
  or create output shapes and accepted public list responses with projected
  result rows
- AND it rejects malformed responses before product-specific form UI treats the
  submission as successful
- AND public-safe `{ error: string }` response bodies are extracted through one
  browser-safe helper

#### Scenario: Rejected public attempt is auditable

- GIVEN the Program public operation route resolves a declared operation
- WHEN anonymous policy, rate-limit evaluation, input validation, origin
  validation, or challenge validation rejects the request
- THEN the operation invocation audit records anonymous actor, rejected or
  failed status, Program storage identity, canonical operation key, source
  host and path, idempotency facts when available, and safe input metadata
- AND challenge proofs and Turnstile secret material are excluded from audit
  snapshots and summaries

#### Scenario: Public execution uses invocation lifecycle

- GIVEN the Program public operation route resolves a declared operation
- WHEN the public runtime evaluates origin, rate limit, input, optional
  challenge, optional replay, and operation execution
- THEN accepted, rejected, failed, replayed, and committed invocation statuses
  are recorded through the shared operation invocation lifecycle
- AND target route resolution, request URL fact selection, challenge proof
  verification, public source-kind envelope construction, invocation lifecycle
  rows, durable writes, public response filtering, and after-commit side effects
  remain explicit runtime adapters

#### Scenario: Stage public operation execution

- GIVEN the Program public operation route resolves a declared operation
- WHEN the public operation executor evaluates the request
- THEN the executor stages operation selection, public request envelope parsing,
  auditable public source-kind envelope construction, origin evaluation,
  rate-limit evaluation, input validation, optional proof validation, optional
  idempotency derivation and replay detection, optional challenge verification,
  Authority execution, public response filtering, and write-only after-commit
  side effects in that order
- AND each stage receives only the public request facts, schema facts, storage
  facts, challenge adapter, lifecycle adapter, Authority execution adapter,
  public response adapter, or after-commit adapter it needs
- AND target route resolution, storage identity selection, Turnstile secret
  handling, Turnstile Siteverify provider details, invocation lifecycle rows,
  durable app writes, notification scheduling, and public response shaping
  remain explicit runtime adapters
- AND failed origin, rate-limit, input, proof, challenge, or execution stages
  preserve public-safe errors, audit behavior, replay behavior where
  applicable, and no-partial-write behavior

### Requirement: Public Operation Module Contract

The system SHALL concentrate Formless-owned public operation behavior behind
the Module interfaces that own it while keeping Cloudflare runtime semantics in
a small real-workerd contract portfolio.

#### Scenario: Executor is the primary fast behavior surface

- GIVEN public operation selection, request parsing, idempotency derivation,
  source fact construction, origin evaluation, stage ordering, replay gating,
  response shaping, or after-commit gating is evaluated
- WHEN focused public operation behavior is exercised
- THEN the public operation executor Interface is the primary test surface for
  the orchestration it owns
- AND deterministic validation, challenge, lifecycle, Authority execution,
  response, after-commit, clock, or generated-identifier Adapters may supply
  owned outcomes without starting a Worker runtime
- AND direct Module coverage preserves the same public-safe errors, ordering,
  envelope facts, response filtering, and committed-versus-replayed behavior as
  production execution

#### Scenario: Concrete owned adapter behavior stays local

- GIVEN Turnstile verification, rate-limit evaluation, public response shaping,
  contact notification, or public operation input notification behavior is
  evaluated
- WHEN provider responses, missing configuration, delivery outcomes, filtering,
  or failure containment are exercised
- THEN the concrete owning Module exposes a Formless-owned Adapter boundary for
  deterministic focused coverage
- AND focused tests fake owned Adapters rather than Durable Object, queue,
  service-binding, or other Cloudflare runtime interfaces
- AND the public operation executor remains responsible only for invoking those
  concrete Adapters in the declared execution order

#### Scenario: Real-workerd contract portfolio stays narrow

- GIVEN public operation behavior is covered through its owning Module
- WHEN real-workerd contract coverage is selected
- THEN each retained contract verifies Worker routing, Wrangler binding wiring,
  Program storage identity selection, Durable Object persistence, replay and audit
  rows, transaction behavior, mapped-host routing, one real Turnstile
  service-binding path, one real queue or post-commit notification path, or
  Worker-specific request and response semantics
- AND Durable Object storage, SQLite transactions or migrations, R2,
  WebSockets, Worker routing, workerd lifecycle, and storage isolation are not
  replaced by broad fakes
- AND the full repository check continues to require the retained real-workerd
  contract portfolio

### Requirement: Public Input Validation

The system MUST validate public operation input against the operation's public
input contract before challenge verification commits records.

#### Scenario: Public validation uses operation input names

- GIVEN an anonymous public operation request is accepted for evaluation
- WHEN the public operation executor validates submitted input
- THEN validation uses the Authority-side operation input validation boundary
  and schema-owned operation input projection for the declared operation input
  field names from the source operation
- AND public create operations map validated entity-backed input to stored
  entity field names only for create materialization
- AND public record-plan and operation-handler commands keep validated input
  keyed by declared operation input field name
- AND the public operation executor does not duplicate schema-owned projection
  or effect-specific operation input validation branch logic
- AND public request envelope parsing, source facts, proof parsing,
  storage-backed reference checks, challenge proof validation, idempotency
  reservation, audit rows, Program storage identity, and public response
  filtering remain public runtime or Authority-owned outside the operation
  input validation boundary
- AND invalid public input is rejected before challenge verification or
  successful outcome reservation

#### Scenario: Unknown public input field

- GIVEN a public operation request includes a field not declared by the
  operation public input contract
- WHEN input is validated
- THEN the request is rejected
- AND no operation effects are committed

#### Scenario: Invalid public input field

- GIVEN a public operation request includes a declared field with an invalid value
- WHEN input is validated
- THEN the request is rejected with a public-safe validation error
- AND no operation effects are committed

#### Scenario: Public form draft projection

- GIVEN a generated public form projects public-safe fields from a declared
  operation input contract
- WHEN browser code prepares the public operation request
- THEN client-side form state is held as typed operation drafts keyed by
  declared operation input name
- AND the browser resolves those drafts to flat public input values before
  constructing the public operation request envelope
- AND optional empty drafts are omitted, boolean `false` remains explicit,
  invalid number drafts remain visible as raw draft text with a display-safe
  error, and required or unsupported inputs block client submission
- AND native browser validation and raw `FormData` extraction are not the source
  of truth for generated public operation input
- AND server-side public operation input validation still validates the request
  before challenge verification or successful outcome reservation

### Requirement: Public Read Access Policy

The system SHALL allow bounded anonymous public list operations to use strict
same-origin and rate-limit policy without requiring an interactive Turnstile
challenge.

#### Scenario: Require same-origin public read

- GIVEN an anonymous public list operation omits a challenge
- WHEN its public request is evaluated
- THEN the request must include an origin matching the effective public request
  origin
- AND a missing, malformed, or mismatched origin is rejected before input
  validation or query evaluation

#### Scenario: Apply declared public read rate limit

- GIVEN an anonymous public list operation declares positive `maxRequests` and
  `windowSeconds`
- WHEN a same-origin request resolves that operation
- THEN the runtime consumes an attempt before input validation or query
  evaluation
- AND the counter is scoped by Program storage identity, canonical operation
  key, and a privacy-safe key derived from trusted client network facts
- AND the counter does not store submitted lookup values, response fields, or
  challenge secrets
- AND an exhausted limit returns a public-safe `429` response with retry timing
  without evaluating the query

#### Scenario: Reject unsafe challenge-free public operation

- GIVEN an anonymous public operation omits a Turnstile challenge
- WHEN it is a create, command, unbounded list, input-unconstrained list, or
  list without explicit anonymous response fields and rate-limit policy
- THEN schema parsing rejects the operation
- AND the operation is unavailable through public routes

### Requirement: Turnstile Challenge

The system SHALL support Turnstile as an anonymous public operation challenge.

#### Scenario: Verify Turnstile before write

- GIVEN a public operation access policy requires Turnstile
- WHEN a public operation request is evaluated
- THEN the executor validates the submitted Turnstile token server-side before
  committing operation effects
- AND failed, missing, expired, or replayed verification rejects the request without committing records

#### Scenario: Turnstile challenge adapter locality

- GIVEN the public operation executor delegates challenge verification through
  its runtime challenge adapter
- WHEN the concrete public operation runtime verifies a Turnstile proof
- THEN Worker-local Turnstile challenge code owns secret lookup, Siteverify
  request construction, provider fetch selection, provider response parsing,
  Siteverify idempotency key normalization, public-safe challenge errors, and
  verified proof facts
- AND the target public operation route module only wires that Turnstile
  challenge code into the executor adapter
- AND schema policy, public request envelope shape, Site tree challenge
  projection, browser widget rendering, and deployment provisioning remain
  explicit Turnstile surfaces rather than a generic challenge abstraction

#### Scenario: Keep Turnstile secrets server-side

- GIVEN Site trees, public HTML, browser state, snapshots, archives, or bootstrap data are produced
- WHEN public artifacts are emitted
- THEN Turnstile secret values are not included
- AND only public widget site keys required for rendering may reach the browser

### Requirement: Turnstile Configuration

The system SHALL use separate runtime configuration for public Turnstile widget
keys and server-side verification secrets.

#### Scenario: Deployment-provided challenge configuration

- GIVEN a deployed instance provisions a Turnstile widget for public operations
- WHEN runtime bindings are configured
- THEN `FORMLESS_TURNSTILE_SITE_KEY` contains the public widget site key
- AND `FORMLESS_TURNSTILE_SECRET_KEY` contains the server-side verification
  secret
- AND public operation APIs, Site trees, snapshots, archives, and bootstrap data do
  not expose the verification secret

#### Scenario: Public site key reaches renderer

- GIVEN `FORMLESS_TURNSTILE_SITE_KEY` is configured
- WHEN a public Site tree projects a Turnstile-protected operation
- THEN the public widget site key may be included for browser rendering
- AND the secret key is not included

#### Scenario: Project Site binding by challenge policy

- GIVEN a generic public Site form references an anonymous public operation
- WHEN the Site tree projects its browser binding
- THEN a challenge-free bounded list operation is projected without requiring or
  exposing a Turnstile site key
- AND its browser session submits declared input without proof or idempotency and
  exposes only response-guarded projected list rows to product-specific
  presentation
- AND public create and command bindings continue to require and project the
  configured Turnstile site key

#### Scenario: Missing challenge configuration fails closed

- GIVEN a public operation requires Turnstile
- WHEN the public site key or secret key configuration is missing or blank
- THEN public rendering omits a working operation binding or public execution
  fails closed before records are written

### Requirement: Public Operation Idempotency

The system SHALL make public write operation execution replay-safe for client
retries while keeping public reads free of successful outcome reservation.

#### Scenario: Replay same idempotency key

- GIVEN the same public operation request is replayed with the same idempotency
  key for the same target storage identity and operation
- WHEN the replay is accepted
- THEN the runtime returns the existing accepted outcome
- AND duplicate records are not created

#### Scenario: Public read does not reserve outcome

- GIVEN a challenge-free public list operation is invoked
- WHEN the exact lookup succeeds or returns no match
- THEN execution does not require an idempotency key
- AND the read result is not stored as a replayable successful write outcome

#### Scenario: Failed request does not reserve successful outcome

- GIVEN a public operation request fails input validation or challenge validation
- WHEN a later valid request uses the same visitor input
- THEN the later request can still commit normally
