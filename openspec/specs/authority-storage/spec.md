# Authority Storage Specification

## Purpose

Authority storage owns committed Program records, the active Program schema,
operation invocations, write invariants, and the Program API contract. It is
the durable source of truth that the one browser replica, storage snapshots,
instance archive envelopes, and workspace state read from or write through.

## Requirements

### Requirement: Storage Identity

The system SHALL use one Program Authority storage identity.

#### Scenario: Program identity

- GIVEN the default Program storage is initialized
- WHEN instance, identity, Task, Site, or CRM records are stored, snapshotted,
  restored, or synced
- THEN committed records, changes, schema, and operation invocations belong to
  `instance:control-plane` storage
- AND one active `formless-program` schema and one `program` provenance hash
  govern those records
- AND Authority selection is a Program runtime fact rather than a package,
  module, entity, field, media, or route input

#### Scenario: Workspace-composed Program identity

- GIVEN a downstream workspace materializes an explicit complete Program
- WHEN its Worker bootstraps, validates, writes, snapshots, or restores Program
  records
- THEN the one active artifact and its canonical Program provenance govern
  `instance:control-plane`
- AND Worker requests use that Program Authority without evaluating workspace
  TypeScript at request time

### Requirement: Authority-Wide Record Identity

The system SHALL keep each record id unique across one Authority storage
identity without deriving record identity from an entity key or entity id.

#### Scenario: Commit globally unique record id

- GIVEN Authority creates a record with an Authority-generated UUID-backed id
  or accepts an explicit source, migration, restore, or operation id
- WHEN no record in that storage identity already uses the id
- THEN the record may commit under its declared entity
- AND the same flat record id can be stored in reference fields whose schemas
  declare the target entity

#### Scenario: Reject record id reuse

- GIVEN any active or tombstoned record in an Authority storage identity
  already uses a record id
- WHEN another write attempts to use that id for the same or a different
  entity
- THEN Authority rejects the collision
- AND stable entity ids do not change record-id uniqueness into a composite
  entity-and-record key

### Requirement: Program Storage API

The system SHALL expose generic storage operations only through the Program API
prefix.

#### Scenario: Program API paths

- GIVEN a client calls bootstrap, schema, tree, sync, operation, or reset paths
- WHEN the route is admitted
- THEN it resolves Authority `instance:control-plane` through
  `/api/formless/program`
- AND the Program API prefix does not accept a caller-selected Authority target

### Requirement: Storage Snapshot Contract Boundary

The system SHALL expose storage snapshot contracts and parsing through the
Storage package while keeping Authority storage execution in runtime modules.

#### Scenario: Runtime code consumes storage snapshot contracts

- GIVEN Authority storage, browser replicas, portable archive workflows,
  workspace source, Site runtime, Worker runtime, or tests need storage
  snapshot kind constants, version constants, stored-record contracts,
  flat record value contracts, or snapshot parsing
- WHEN those contracts are imported
- THEN they come from `@dpeek/formless-storage`
- AND they do not come from root runtime protocol modules

#### Scenario: Storage package stays execution-free

- GIVEN storage snapshot contracts are provided by the Storage package
- WHEN Authority bootstrap, schema storage, change rows, operation invocations,
  sync protocol, write routes, reset, restore, or Durable Object storage is
  implemented
- THEN those behaviors remain owned by Authority storage runtime modules
- AND the Storage package does not own runtime protocol routes, app records,
  browser replica persistence, or restore execution

### Requirement: Instance Management APIs

The system SHALL expose instance-level management APIs separately from generic
Program storage APIs.

#### Scenario: Instance setup and passkey session

- GIVEN owner setup or passkey login runs for a product instance
- WHEN `/api/formless/setup`, `/api/formless/passkeys/*`, or
  `/api/formless/session` is used
- THEN owner identity, passkey credentials, passkey challenges, and owner
  session state are established independently from Program domain records
- AND write operations can be guarded by owner session cookies
- AND admin bearer authorization remains available for bootstrap, automation,
  and recovery-sensitive write paths

### Requirement: Media Storage Adapter Boundary

The system SHALL keep Authority Program storage separate from instance media storage
while consuming Media package Worker adapters through public subpaths.

#### Scenario: Program storage avoids media internals

- GIVEN Authority storage handles bootstrap, schema, sync, operations, reset,
  snapshot, or record restore
- WHEN storage code needs media object handling
- THEN it does not deep-import Media package internals
- AND media object handling stays behind public Media package Worker/runtime
  contracts

#### Scenario: Media remains outside Authority records

- GIVEN Program records are committed or restored through Authority storage
- WHEN owned media exists for the instance
- THEN owned media object bytes and provider storage metadata remain outside
  Authority Program records

### Requirement: Source Schema Bootstrap

The system SHALL initialize an empty Authority from the resolved source schema
without treating package records as source.

#### Scenario: Fresh bootstrap

- GIVEN no active schema is stored for the Program storage identity
- WHEN the Program is bootstrapped
- THEN the active schema is initialized from the source schema
- AND no stored records or record changes are created by source bootstrap

#### Scenario: Runtime-owned invariant records

- GIVEN a runtime-owned control plane requires invariant records such as the
  identity role catalog
- WHEN that control plane initializes
- THEN its owning domain creates or reconciles those records idempotently after
  source schema bootstrap
- AND generic app package source and Authority bootstrap do not model those
  records as package initial data

### Requirement: Portable Active Schema

The system SHALL store and return the portable array-shaped parsed App schema
without serializing runtime definition indexes.

#### Scenario: Load an active schema

- GIVEN bootstrap, source refresh, reset, snapshot restore, or archive restore
  supplies an App schema
- WHEN Authority accepts the schema
- THEN the current array-shaped schema is parsed and stored
- AND shared derived indexes may be built for keyed lookup during validation
  and execution
- AND derived maps, caches, reverse lookups, and parallel order lists are not
  stored in Authority schema state or returned in bootstrap, sync, snapshot, or
  archive data

#### Scenario: Compare active schema content

- GIVEN Authority compares source, active, restored, or migrated schemas
- WHEN schema equality or reuse is evaluated
- THEN the comparison uses the canonical App schema semantics used for
  `sourceSchemaHash`
- AND registry array reordering is a schema change
- AND object property insertion reordering is not a schema change
- AND accepting a new parsed schema object causes runtime definition indexes to
  be rebuilt or selected for that object identity

#### Scenario: Preserve active entity identity

- GIVEN an active schema contains a stable entity id and current entity key
- WHEN normal source refresh, schema update, or package migration proposes
  another schema without replacing the storage identity's record lineage
- THEN Authority rejects changing the id assigned to that continuing entity
- AND it rejects rebinding the active entity id to an unrelated declaration
- AND a key rename that preserves the entity id does not implicitly rewrite
  stored record entity keys or bypass an explicit record migration or reset
- AND an explicit destructive reset or replacement may adopt different entity
  ids only with its existing record-lineage replacement semantics
- AND record ids remain globally unique within the Authority independently of
  entity identity

### Requirement: Schema Reset

The system MUST protect stored records during normal schema changes and SHALL support explicit source schema reset.

#### Scenario: Normal schema update rejects destructive field changes

- GIVEN records exist under the active schema
- WHEN a normal schema update removes or renames a field
- THEN the update is rejected
- AND stored records keep their current values

#### Scenario: Source schema reset prunes retired fields

- GIVEN stored records contain fields no longer present in the source schema
- WHEN reset schema runs
- THEN the source schema becomes active
- AND existing records are preserved
- AND stored values for retired fields are pruned with patch changes

#### Scenario: Destructively replace incompatible persisted schema state

- GIVEN persisted Authority state cannot be parsed under the current App schema
  contract
- WHEN an operator clears that storage identity through an explicit internal
  storage replacement before source bootstrap
- THEN records, changes, operation invocations, and the incompatible active
  schema are cleared for that storage identity
- AND the current source schema becomes the new durable state without creating
  package records
- AND Authority does not infer declaration order from an unsupported object
  shape or add a dual-shape parser, alias, compatibility shim, or schema-format
  migration layer

### Requirement: Write Invariants

The system MUST commit writes only when Authority validation succeeds.

#### Scenario: Operation replay

- GIVEN an operation write was already committed with a client-provided identity
- WHEN the same write is replayed
- THEN the stored response is returned
- AND duplicate changes are not inserted
- AND no push notification is emitted for the replay

#### Scenario: Committed write classification

- GIVEN a local workspace runtime needs to decide whether workspace source is
  dirty
- WHEN a Program operation, schema save, reset schema, snapshot restore, or
  control-plane write commits through Authority
- THEN the committed storage outcome is the write classification boundary
- AND the local runtime may enqueue Program workspace auto-save with the write
  source
- AND failed validation, failed authorization, read-only requests, and replayed
  writes do not classify as new workspace source changes

#### Scenario: Delete with active references

- GIVEN an active record references a target record through a schema reference field
- WHEN a client tries to delete the target record
- THEN the delete is rejected
- AND the target record remains active

#### Scenario: State machine field patch guard

- GIVEN an active record belongs to an entity with a state machine
- WHEN a generic update operation or internal patch materializer attempts to
  change the machine-owned enum field directly
- THEN the write is rejected before commit
- AND the field can change only through a declared transition operation, reset,
  restore, or migration path

#### Scenario: State machine transition operation

- GIVEN an authorized caller invokes a declared transition operation for an active
  record
- WHEN the record's current enum state is accepted by that transition
- THEN Authority commits the enum field patch through the operation write path
- AND any declared transition event record is committed in the same operation
  outcome
- AND operation idempotency and write-log cursor behavior match other committed
  operation writes

#### Scenario: Atomic transition side-effect creates

- GIVEN an authorized caller invokes a record-scoped transition operation whose
  handler declares a create-only side-effect record plan
- WHEN Authority validates and materializes the operation
- THEN transition validity is checked against the stored target record's
  current state
- AND target record id and field expressions resolve from that same stored
  pre-transition record
- AND side-effect creates may target any declared entity in the same app schema
  and reference outputs from earlier side-effect create steps
- AND the transition patch, optional transition event, and all side-effect
  creates commit in one storage transaction under the operation write identity
- AND all committed changes use the invocation actor, source, idempotency,
  received timestamp, audit root, and write-log behavior
- AND unique constraints are enforced for generated codes and target
  references, including planned records in the same operation
- AND any failed transition, generated-code exhaustion, field validation,
  reference validation, unique constraint, or record materialization rolls back
  the complete operation write set

#### Scenario: Recheck transition target before commit

- GIVEN transition side-effect planning reads a stored target record before the
  storage transaction begins
- WHEN the target record changes before the combined write set materializes
- THEN Authority rechecks the active target identity, entity, transition source
  state, and immutable target snapshot at the commit boundary
- AND stale target values are not copied into created records
- AND the operation fails without a transition patch, event, side-effect
  record, or sync change

#### Scenario: Invalid state machine transition

- GIVEN a caller invokes a transition operation for a missing, tombstoned, or
  incompatible-state record
- WHEN Authority validates the operation
- THEN the operation is rejected before materialization
- AND no partial record patch, event record, side-effect record, write-log
  change, or operation invocation output is stored

### Requirement: Operation Invocation Boundary

The system SHALL normalize operation calls into one invocation envelope before
authorization, validation, execution, replay classification, audit, or
materialization.

#### Scenario: Build operation invocation envelope

- GIVEN generated UI, protocol, public, automation, CLI, or runner callers invoke
  an entity operation
- WHEN Authority accepts the request for evaluation
- THEN the envelope includes invocation id, canonical operation key, entity,
  record id or selection when relevant, actor, source
  protocol, source route or UI surface when relevant, input, idempotency key
  when required, and received timestamp
- AND envelope construction is owned by source-kind builders that map protocol,
  generated UI, automation, CLI, runner, or public source facts into the
  canonical invocation shape
- AND route handlers and public executors pass source-kind facts into the
  envelope boundary instead of assembling actor, source, input, idempotency, and
  operation snapshots independently
- AND unsupported generic write protocol routes do not select Authority write
  operations
- AND anonymous public callers can build an operation invocation envelope only
  through narrow Program public-operation routes that resolve a declared
  entity operation

#### Scenario: Authorize operation before materialization

- GIVEN an operation invocation envelope has been built
- WHEN Authority evaluates the invocation
- THEN operation actor policy is evaluated before field validation and storage
  materialization
- AND rejected invocations do not create, patch, delete, tombstone, dispatch
  command effects, or run record plans
- AND operation policy becomes the primary authorization boundary for operation
  execution

#### Scenario: Operation idempotency

- GIVEN a create, update, delete, or command operation is invoked
- WHEN the request is evaluated
- THEN an idempotency key is required unless a trusted runtime actor supplies an
  explicit runtime-generated write identity
- AND replaying the same Program operation and idempotency key returns the
  stored operation output without duplicate change
  rows, command effect rows, or operation invocation rows
- AND list and get operations do not require idempotency keys

#### Scenario: Own operation invocation lifecycle transitions

- GIVEN an operation invocation envelope has been accepted for evaluation
- WHEN Authority evaluates the operation through a lifecycle wrapper
- THEN the wrapper records accepted or resumed status before invoking operation
  execution
- AND the wrapper returns a stored replay outcome without invoking operation
  execution when an existing committed or replayed output matches the envelope
- AND the wrapper records committed or replayed outcome status after successful
  execution
- AND the wrapper records rejected status for authorization denial and failed
  status for validation, challenge, materialization, or execution errors after
  the invocation envelope exists
- AND the execution callback remains responsible for operation-specific
  authorization, validation, materialization, response filtering, and storage
  writes

#### Scenario: Return operation output

- GIVEN an operation invocation is accepted
- WHEN Authority returns the operation result
- THEN list operations return records selected by the referenced query
- AND get operations return one active record selected by record id
- AND create operations return the created record plus affected change ids
- AND update operations return the updated record plus affected change ids
- AND delete operations return the tombstoned record id plus affected change ids
- AND command operations return operation-native command output plus affected
  change ids
- AND operation responses expose the declared operation output contract
- AND replayed write or command operations return the original operation-native
  output

#### Scenario: Materialize record lifecycle timestamps

- GIVEN an operation invocation creates, updates, deletes, tombstones, or
  materializes a record-plan step
- WHEN Authority commits the write
- THEN create writes set record system `createdAt` and `updatedAt` to the
  invocation received timestamp
- AND update and patch writes preserve `createdAt` and set system `updatedAt` to
  the invocation received timestamp
- AND delete and tombstone writes preserve `createdAt`, set system `deletedAt`,
  and set system `updatedAt` to the deletion timestamp
- AND sync change payloads, snapshots, exports, and browser replicas carry those
  system fields outside record `values`

#### Scenario: Reject caller-owned system fields

- GIVEN generated UI, protocol, public, automation, CLI, or runner callers submit
  operation input
- WHEN the input attempts to create, patch, unset, or record-plan-target `id`,
  `createdAt`, `updatedAt`, or `deletedAt`
- THEN Authority rejects the write before materialization
- AND accepted write paths derive lifecycle metadata from Authority-owned write
  context, not caller-provided values

#### Scenario: Validate operation input contract consistently

- GIVEN generated UI, protocol, public, automation, CLI, or runner callers submit
  operation input
- WHEN Authority validates the operation invocation before materialization
- THEN validation uses schema-owned operation input projection for unknown
  fields, required fields, system field rejection, operation input-name
  preservation, entity-backed field targets, and inline scalar field behavior
- AND one Authority-side operation input validation boundary normalizes
  route-based and operation-invocation-envelope requests before materialization
- AND that boundary exposes caller-specific validation entrypoints for
  record-write materialization, record-plan commands, operation handler
  commands, and public operation input without duplicating schema-owned
  projection rules
- AND validation preserves current operation input error modes for rejected
  invocations
- AND create and update materializers receive entity-field write values after
  operation input validation
- AND command record plans and operation handlers receive operation input values
  keyed by declared operation input field name
- AND Authority adapters add storage-backed reference existence, target entity,
  tombstone state, unique constraint, idempotency, audit row, and write-log
  classification checks
- AND storage-backed facts remain Authority-owned

### Requirement: Authority Validation Module Boundary

The system SHALL concentrate deterministic Authority validation behind
Authority-owned Module interfaces while keeping durable storage and Worker
runtime semantics at explicit adapters.

#### Scenario: Validate schema and snapshot requests from explicit facts

- GIVEN Authority evaluates a schema update, source schema reset, or storage
  snapshot restore request
- WHEN parsing, compatibility, stored-value, timestamp, reference, or unique
  constraint validation runs
- THEN the validation Module consumes the request plus explicit current schema,
  stored record, expected storage identity, and identity-reference resolution
  facts
- AND it returns the validated schema or snapshot without committing storage
- AND schema-language parsing remains owned by the reusable schema package
- AND current Authority-safe validation errors remain unchanged

#### Scenario: Resolve record validation through Authority-owned readers

- GIVEN Authority validates create, patch, or delete record materialization
- WHEN validation needs replay, target-record, active-record, inbound-reference,
  runtime control-plane, or identity-reference facts
- THEN the validation Module consumes those facts through Authority-owned record
  and identity-reference reader interfaces
- AND production readers obtain the facts from the target Authority storage and
  identity control-plane boundary
- AND deterministic validation does not require callers to emulate
  `DurableObjectStorage`, SQLite, or Worker runtime interfaces
- AND synchronous local-reference and asynchronous identity-reference paths
  share one record-write validation model rather than duplicating field,
  policy, patch, delete, or state-machine rules

#### Scenario: Keep durable behavior at the Authority runtime boundary

- GIVEN validation succeeds or fails through the Authority validation Module
- WHEN runtime behavior is exercised
- THEN real Authority storage remains responsible for commit, rollback, replay,
  operation invocation rows, write-log changes, cursor advancement, reset,
  snapshot materialization, and storage identity isolation
- AND real Worker contracts remain responsible for HTTP request parsing,
  response headers, broadcasts, hibernatable WebSockets, and runtime bindings
- AND focused validation coverage does not replace representative real-workerd
  contracts for those durable and Worker-owned behaviors

### Requirement: Authority-Generated Date Values

The system SHALL generate date-only operation values from the invocation
received instant and an explicit business time zone.

#### Scenario: Materialize a generated date

- GIVEN a validated record-plan value or transition target value declares
  `generatedDate` with an IANA time-zone identifier
- WHEN Authority materializes the operation
- THEN the expression interprets the invocation `receivedAt` instant in that
  time zone
- AND the result is the corresponding valid `YYYY-MM-DD` calendar date
- AND evaluation does not use the Worker host time zone, browser time zone, an
  ambient locale, or UTC timestamp truncation
- AND the same received instant and time-zone identifier produce the same date
  across retries
- AND replay of a successful invocation returns the stored output without
  reevaluating the date
- AND an invalid instant, unresolved time zone, incompatible destination field,
  or record validation failure commits no operation writes

#### Scenario: Commit a transition target date atomically

- GIVEN an accepted record-scoped transition operation declares validated
  generated-date `targetValues`
- WHEN Authority materializes a valid transition
- THEN generated target values are merged with the transition destination state
  and the stored pre-transition record values
- AND Authority validates and commits one target record patch containing both
  the next state and generated date values
- AND the target patch, optional transition event, and create-only side-effect
  records remain one operation transaction and outcome
- AND transition rejection, target snapshot conflict, generated-date failure,
  field validation, reference validation, unique constraint, or side-effect
  failure rolls back the complete operation write set

### Requirement: Operation Record Plan Materialization

The system SHALL materialize declarative command record plans through the same
Authority validation, idempotency, and write-log boundary as other operation
writes.

#### Scenario: Commit record plan atomically

- GIVEN an accepted command operation invocation has effect type `recordPlan`
- WHEN Authority materializes the plan
- THEN each plan step is validated against the active app schema before any
  step is committed
- AND create, patch, delete, and tombstone steps reuse the same field,
  reference, unique constraint, operation, and state-machine write protections
  as the equivalent single-record operation effects
- AND operation input expressions resolve from the declared operation input
  field names, not from stored entity field names
- AND later steps can reference ids and scalar outputs from earlier successful
  steps in the same plan
- AND all committed steps share the invocation id, actor, source context, and
  idempotency key from the operation envelope
- AND if any step fails validation or materialization, no plan step writes an
  app record, tombstone, operation handler replay row, or sync change row

#### Scenario: Resolve a record-scoped record-plan target

- GIVEN an accepted record-scoped command operation has effect type
  `recordPlan`
- WHEN Authority prepares the operation after checking for a stored successful
  replay
- THEN the invocation includes a non-empty target record id
- AND Authority requires an active stored target whose entity matches the
  operation entity
- AND missing, tombstoned, or wrong-entity targets fail before plan
  materialization
- AND the materializer receives one immutable snapshot of that target for all
  `targetRecordId` and `targetField` expressions
- AND target reference expressions remain subject to normal active-reference,
  target-entity, field, and unique-constraint validation
- AND Authority rechecks the active target against the immutable snapshot
  inside the record-plan storage transaction before materializing any write
- AND a changed or deleted target fails the complete operation without an app
  record, tombstone, committed operation output, or sync change

#### Scenario: Materialize record plan write requests

- GIVEN an accepted command operation invocation has validated operation input
  values keyed by declared operation input field name
- WHEN Authority plans a record-plan command effect
- THEN the record-plan materializer builds the ordered record-write requests
  for all declared steps before the commit boundary writes records
- AND step values resolve from validated operation input, literal scalar values,
  generated ids, generated timestamps, generated dates, actor context, source
  context, earlier step outputs, and the immutable target snapshot when the
  operation is record-scoped
- AND generated codes retry bounded unique-constraint collisions against stored
  and earlier planned records before commit
- AND create step write ids are derived from the operation invocation id and
  step name
- AND patch, delete, and tombstone step targets resolve to active existing
  records or records planned by earlier steps
- AND the materializer returns enough step metadata for the operation output to
  report step name, kind, entity, record id, and committed change id
- AND idempotency reservation, audit row transitions, unique constraints,
  lifecycle timestamps, sync change rows, and durable storage writes remain
  Authority commit-boundary responsibilities

#### Scenario: Return record plan outcome

- GIVEN a command record plan commits
- WHEN Authority records the operation outcome
- THEN one sync change row is appended for each committed app-record change
- AND the operation command output includes affected change ids and declared
  display-safe record identifiers or metadata for created plan steps
- AND operation invocation audit remains the semantic root for the multi-record
  write
- AND replaying the same Program operation and idempotency key returns the
  stored operation output without duplicate app
  records, tombstones, operation handler replay rows, operation invocation rows,
  or sync change rows
- AND invoking the same record-scoped operation with a new idempotency key is a
  new intentional invocation that may create another related record

### Requirement: Operation Handler Materialization

The system SHALL materialize command behavior through operation handler modules.

#### Scenario: Execute operation handler

- GIVEN an accepted command operation invocation has effect type
  `operationHandler`
- WHEN Authority materializes the handler
- THEN the handler receives the operation invocation envelope, active schema,
  storage identity, typed handler configuration, declared input, actor, source,
  idempotency, and received timestamp
- AND the handler returns operation-native command output or planned record
  writes through operation-named storage materializers
- AND handler execution uses operation input, effect configuration, and
  operation invocation output

#### Scenario: Materialize transition side-effect creates

- GIVEN an accepted transition-state handler declares a side-effect record plan
- WHEN Authority prepares the handler outcome
- THEN record-plan input validation and expression evaluation remain behind the
  focused record-plan materializer boundary
- AND the materializer receives the validated operation input, invocation
  envelope, stored transition target snapshot, active schema, and explicit
  storage and reference validation adapters
- AND generated codes retry bounded unique collisions before the combined
  commit
- AND the handler combines transition, optional event, and side-effect create
  plans without invoking another operation
- AND the command output reuses record-plan step metadata to report each
  side-effect step name, kind, entity, record id, and committed change id
- AND replay returns the stored created-record identifiers and values without
  regenerating ids or codes

#### Scenario: Validate handler input shape from capability facts

- GIVEN an accepted command operation invocation has effect type
  `operationHandler`
- WHEN Authority prepares the handler input
- THEN runtime validation may use handler capability facts for structural input
  shape checks before handler business logic executes
- AND structural checks cover required object input, required string record ids,
  required text fields, non-empty arrays of string record ids, duplicate id
  rejection, and scalar record-value maps where the handler declares those
  expectations
- AND handler-specific business validation, storage-backed record lookup,
  relationship target validation, tombstone checks, record value validation,
  unique constraints, provider calls, and writes remain handler or Authority
  execution responsibilities

#### Scenario: Handler-owned dynamic behavior

- GIVEN command behavior requires query fan-out, selected-record array input,
  conditional upsert, dedupe, computed ordering, state-transition validation, or
  public source materialization
- WHEN the operation is parsed and invoked
- THEN the behavior is represented by an operation handler kind with typed
  configuration
- AND declarative record plans remain limited to deterministic flat write steps

### Requirement: Operation Invocation Audit

The system SHALL store operation invocation rows as Authority-owned system rows
separate from stored app records and sync change rows.

#### Scenario: Store operation invocation row

- GIVEN an operation invocation is accepted, rejected, committed, replayed,
  failed, or resumed
- WHEN Authority records the invocation outcome
- THEN the row stores operation key and kind, actor and auth decision, source
  protocol and route context, input hash, safe
  input summary or explicitly allowed safe snapshot, affected change ids,
  idempotency facts, status, and timestamps
- AND secret field values, challenge proofs, provider secrets, and runtime
  secrets are not stored in full input snapshots
- AND operation invocation rows are not emitted as browser replica sync changes

#### Scenario: Audit rejected public operation attempt

- GIVEN a target-scoped public operation route resolves a declared entity
  operation for an anonymous caller
- WHEN operation policy, public input validation, origin validation, or challenge
  verification rejects the request
- THEN Authority stores an operation invocation row with anonymous actor,
  rejected or failed status, public source protocol, source host and path,
  canonical operation key, idempotency facts when
  available, input hash, and safe input audit metadata
- AND no sync change rows, operation handler replay rows, stored app records, or
  tombstones are written for the rejected attempt

#### Scenario: Change rows remain materialization log

- GIVEN an operation commits record effects
- WHEN sync clients read committed changes
- THEN clients receive change rows from the existing write log
- AND the operation invocation row remains the semantic audit and replay root
  for that operation
- AND shared change-row fields use `writeId` and `operationKind`

### Requirement: Storage Write Log Boundary

The system SHALL keep committed Authority write facts behind a storage
write-log boundary that owns write outcome classification, operation
idempotency, change-row append, cursor calculation, and committed change
readback. Record and command materializers may remain internal implementation
helpers, but caller-facing write and replay contracts are operation invocation
outputs.

#### Scenario: Materializers stay behind operation outputs

- GIVEN Authority uses internal record or command materializers to commit
  operation effects
- WHEN an operation is invoked through generated UI, protocol, public, CLI,
  runner, or automation surfaces
- THEN the caller submits an operation envelope and receives operation output
- AND internal materializer return values are adapted before crossing the
  operation response, replay, or command output boundary
- AND replay storage is keyed by operation identity and returns the
  operation-native output shape
- AND storage modules may expose `RecordWriteResponse` and
  `CommandWriteResponse` as internal materializer response types
- AND shared protocol modules expose operation invocation and change-row
  contracts using operation terminology

#### Scenario: Storage implementation names are operation-native

- GIVEN Authority creates or reads durable SQL tables, write-log columns,
  replay rows, or storage helper requests for operation materialization
- WHEN new storage state is initialized or storage tests inspect replay and
  change-log behavior
- THEN the active table, column, helper, fixture, and test names use
  operation, command, record-write, write-id, or operation-kind terminology

#### Scenario: Committed write facts

- WHEN an operation, schema reset, or snapshot restore commits
  storage changes
- THEN the storage write outcome identifies the result as committed
- AND committed change rows are appended once for that write identity
- AND the returned cursor reflects the committed change rows

#### Scenario: Replayed write facts

- WHEN an operation with a previously committed client-provided
  identity is replayed
- THEN the storage write outcome identifies the result as replayed
- AND the original stored response is returned
- AND duplicate change rows or operation handler replay rows are not inserted

#### Scenario: Change readback

- WHEN sync reads committed changes after a cursor
- THEN Authority storage returns Program change rows from the write log
- AND the returned cursor belongs to the one Program lineage

### Requirement: Record Materialization Boundary

The system SHALL keep stored record materialization explicit and separate from
write-log append behavior.

#### Scenario: Operation materialization

- WHEN create, update, delete, command-created record, or command tombstone
  effects are committed through an operation invocation
- THEN record materializers write flat stored records or tombstones
- AND write-log change payloads describe the committed stored records
- AND schema validation, value validation, reference validation, and delete
  blocker checks happen before materialization

#### Scenario: Reset and restore materialization

- WHEN source schema reset, snapshot restore, or instance archive restore runs
- THEN the reset or restore plan remains explicit before durable writes
- AND operation handler executions are cleared only by operations whose storage
  semantics require clearing them
- AND sync cursors remain monotonic after the operation

### Requirement: Tombstone Deletes

The system SHALL represent record deletes as tombstones.

#### Scenario: Delete operation commits a tombstone

- GIVEN a target record has no active referencing records
- WHEN a delete operation commits
- THEN the stored record row remains with its id, entity, values, created
  timestamp, and updated timestamp
- AND the record has a deleted timestamp
- AND a delete change is appended with the tombstoned record payload

#### Scenario: Tombstoned references do not block delete

- GIVEN a tombstoned record references a target record
- WHEN a client deletes the target record
- THEN the tombstoned referencing record does not block validation
- AND the target delete can commit if no active record references it

### Requirement: Storage Replacement And Snapshot

The system SHALL provide schema reset and storage snapshot operations that
preserve Authority storage invariants.

#### Scenario: Replace populated Program state

- GIVEN an owner or operator needs to replace the records of Program storage
- WHEN a validated storage snapshot or portable archive restore applies
- THEN the restored schema and records become the durable Program state
- AND replacement does not read package-owned initial records

#### Scenario: Storage snapshot export

- GIVEN snapshot export is requested for a storage identity
- WHEN the Authority reads durable storage
- THEN the snapshot is built from Authority storage, not browser IndexedDB
- AND the envelope kind is `formless.storageSnapshot`
- AND the envelope includes version, storage identity, schema key, exported
  timestamp, schema timestamp, source cursor, schema, and records
- AND storage identity is the compact Authority storage name such as
  `instance:control-plane`

#### Scenario: Storage snapshot restore

- GIVEN a storage snapshot envelope for the same storage identity and schema key
- WHEN snapshot restore validates its identity, schema, records, references,
  timestamps, and unique constraints
- THEN the restore commits as an Authority write
- AND the response has bootstrap shape
- AND sync cursors remain monotonic
- AND operation invocations are cleared

### Requirement: Authority Write Outcome Consumption

The system SHALL make Authority operation adapters consume storage write
outcomes instead of deriving write mode from protocol response shapes.

#### Scenario: Committed outcome consumed

- WHEN an Authority write operation receives a committed storage outcome
- THEN the operation returns the protocol response from that outcome
- AND the committed outcome is available for push sync notification policy

#### Scenario: Replay outcome consumed

- WHEN an Authority write operation receives a replayed storage outcome
- THEN the operation returns the protocol response from that outcome
- AND the replay outcome is distinguishable from a committed write without
  inspecting response payload shape

### Requirement: Write Guard And Cache Policy

The system MUST guard writes when owner or admin protection is configured and SHALL prevent Authority response caching by default.

#### Scenario: Unauthorized write

- GIVEN write protection is configured
- WHEN a request without a valid owner session cookie or admin bearer token attempts a write
- THEN the response is `401`
- AND JSON body parsing, storage setup, and operation execution do not run

#### Scenario: Public operation route bypasses only the generic write guard

- GIVEN write protection is configured
- WHEN an anonymous request targets a target-scoped public operation route
- THEN the owner or admin write guard does not reject the request before public
  operation policy is evaluated
- AND only declared operations with anonymous public policy and public bindings
  can commit effects through that route
- AND a Program-target public route does not grant Program bootstrap, schema,
  sync, WebSocket, generic operation, or snapshot access
- AND all other protected Program storage write routes still return `401` before
  JSON body parsing, storage setup, operation envelope construction, or write
  materialization

#### Scenario: Public read cache headers

- GIVEN an Authority read operation does not set a more specific cache policy
- WHEN the read response is returned
- THEN the response uses `Cache-Control: no-store`
- AND public Site tree API reads also use `Cache-Control: no-store`

### Requirement: Program Control-Plane Storage

The system SHALL store runtime-owned instance, identity, Tasks, Site, CRM, and
workspace-owned domain records in one Program Authority storage identity
separate from private authentication state.

#### Scenario: Program identity

- GIVEN default Program storage is initialized
- WHEN committed records, changes, active schema, or operation invocations are
  stored
- THEN they belong to storage identity `instance:control-plane`
- AND the active schema key is `formless-program`
- AND schema provenance has kind `program` with the complete materialized
  Program source hash
- AND instance, identity, Task, Site, and CRM records share one record-id namespace,
  write log, cursor, snapshot boundary, and operation-invocation store
- AND the Program runtime selects that record store directly
- AND credentials, sessions, challenge secrets, token hashes, provider state,
  and media blobs remain outside Program Authority records

#### Scenario: Tasks starts in Program Authority

- GIVEN the default Program schema contains the package-owned Task entity
- WHEN the first Task record or Task operation is committed
- THEN it is written directly to storage identity `instance:control-plane`
- AND ordinary globally unique Program record ids remain separate from the
  stable Task entity id
- AND Task package identity does not create another storage boundary

#### Scenario: Site starts in Program Authority

- GIVEN the default Program schema contains all eight package-owned Site
  entities
- WHEN the first Site record or Site operation is committed
- THEN it is written directly to storage identity `instance:control-plane`
- AND ordinary globally unique Program record ids remain separate from the
  stable Site entity ids
- AND Site package identity does not create another storage or media boundary

#### Scenario: CRM starts in Program Authority

- GIVEN the default Program schema contains the composed CRM domain
- WHEN the first CRM record or CRM operation is committed
- THEN it is written directly to storage identity `instance:control-plane`
- AND the shared contact subscription entities use the existing Site stable
  entity ids while CRM non-overlapping entities keep their package-owned ids
- AND CRM package identity does not create another storage boundary

#### Scenario: Program API

- GIVEN a current Program member, editor, administrator, owner, CLI deployer,
  runner, or explicitly accepted trusted actor queries or writes allowed
  Program records
- WHEN the request is accepted through `/api/formless/program`
- THEN the request targets storage identity `instance:control-plane`
- AND writes use Authority validation and write-log idempotency
- AND standalone instance and identity control-plane prefixes do not expose
  another bootstrap, schema, sync, snapshot, or generic operation mount
- AND purpose-built identity or auth capability routes may remain separate HTTP
  behavior while reading and writing the same Program Authority records

#### Scenario: Program replica authorization

- GIVEN a browser requests Program bootstrap, schema, HTTP sync, or push sync
- WHEN the request is authorized
- THEN the runtime evaluates the schema-defined `member` role
  requirement against current active principal, protected owner, and
  `program-role-assignment` facts
- AND the ordered role ladder lets current editors and administrators satisfy
  the member requirement
- AND valid admin bearer authorization remains an explicit trusted actor
  alternative where supported
- AND the complete reviewable Program record set, including Task, Site, and CRM
  records, is readable by every caller satisfying the member requirement
- AND an unassigned authenticated principal or anonymous session cannot read
  the mixed Program record set
- AND missing owner-session and admin-bearer configuration does not open the
  Program API or its replica to unauthenticated callers
- AND local development obtains Program access through explicit local owner
  session bootstrap rather than an open management fallback
- AND owner-only identity, recovery, policy, and security operations recheck
  active `instance.owner` authority independently of replica access
- AND current authority and session state are rechecked before later push
  catch-up or broadcast data is returned

#### Scenario: Program operations enforce schema access

- GIVEN a caller can read the complete Program replica
- WHEN the caller invokes an entity operation through
  `/api/formless/program/operations/:entity/:operation`
- THEN Authority resolves current caller facts and evaluates the operation's
  top-level access requirement before parsing operation input or executing an
  effect
- AND member-level replica admission does not itself authorize any operation
- AND ordinary domain writes may require `editor`, operational management
  writes may require `administrator`, and security-sensitive writes may
  require the exact `owner` actor
- AND Task create, update, and clear-completed operations require `editor`
- AND ordinary Site and CRM authoring operations require `editor`
- AND Site anonymous public operations are evaluated only by the dedicated
  public executor and do not derive authority from Program replica admission
- AND trusted runner, deployer, or admin-bearer channels satisfy an operation
  only when its access requirement names that exact actor alternative
- AND missing or invalid Program operation access fails closed
- AND schema writes, reset, snapshot restore, archive restore, owner recovery,
  credential management, and other non-entity storage or security operations
  retain their separate owner or trusted-channel authorization

### Requirement: Program Record Validation

The system SHALL validate mixed Program records through the complete schema and
the record adapters explicitly selected by the trusted Program runtime
composition.

#### Scenario: Validate a mixed Program record set

- GIVEN one Program record set contains records from the schema modules selected
  by its Program composition root
- WHEN bootstrap, source refresh, operation execution, snapshot
  restore, archive restore, or workspace validation runs
- THEN generic field, reference, unique, delete-blocker, stable entity identity,
  and record-id validation sees the complete Program schema and record set
- AND each explicitly selected record adapter receives only records owned by
  its declared stable entity ids
- AND stable entity ids filter records only after explicit adapter selection
  rather than discovering or activating adapters
- AND duplicate adapter keys, duplicate entity ownership, an adapter that
  claims an absent entity, or a missing module-required adapter fails before
  runtime startup or storage mutation
- AND an unknown entity, foreign record passed to a package validator, invalid
  cross-entity reference, or selected adapter constraint failure rejects the whole write
  before commit

#### Scenario: Canonicalize records through selected ownership

- GIVEN a Program snapshot contains records owned by an explicitly selected
  record adapter
- WHEN archive or workspace canonicalization runs
- THEN the Program root dispatches those records through the same unique entity
  ownership used for selected record validation
- AND adapter-owned canonicalization runs before generic complete-schema record
  formatting
- AND active and tombstoned generic-only records remain in the canonical
  Program snapshot without a package record adapter

#### Scenario: Omit unselected domain behavior

- GIVEN a Program omits a domain schema module and its runtime adapters
- WHEN the Program is materialized, started, snapshotted, archived, or restored
- THEN generic Program behavior does not import, register, require, or execute
  that domain's adapter code
- AND adapter declarations do not grant storage, replica, media, route,
  operation, or authorization scope

### Requirement: Active Schema Source Refresh

Authority storage SHALL keep the active schema aligned with the complete
materialized Program provenance without treating records or workspace state as
the source of schema truth.

#### Scenario: Refresh compatible source schema

- GIVEN an Authority storage identity already has committed records and an
  active schema
- WHEN the complete Program source hash differs from the stored source schema
  hash or runtime schema hash
- AND current active records validate against the complete Program schema without
  creates, patches, tombstones, or value pruning
- THEN Authority writes the complete Program schema as the active schema
- AND Authority records a new schema timestamp for sync, browser reload, and
  workspace state provenance
- AND committed records, source cursor, operation invocations, and change rows are
  not replaced

#### Scenario: Block incompatible Program refresh

- GIVEN current active records admitted by the current Program cannot validate
  against a newly materialized Program without record materialization
- WHEN no explicit current Program reset or restore path is selected
- THEN Authority keeps the existing active schema and records unchanged
- AND the caller receives a schema refresh blocker that identifies current and
  target Program provenance without package or module identity

### Requirement: Control-Plane Secret Boundary

Authority storage SHALL keep deployment secrets and canonical provider state
out of Program records and change rows.

#### Scenario: Secret values are excluded

- GIVEN control-plane records are stored, synced, snapshotted, or exported
- WHEN record values and change rows are produced
- THEN provider API tokens, Alchemy passwords, Alchemy state tokens, raw lease
  tokens, and runtime secrets are not included
- AND display-safe secret references may be stored

#### Scenario: Provider truth remains external

- GIVEN deployment evidence is recorded
- WHEN Authority records store the displayable result
- THEN records store summaries and ids needed for display, audit, and cleanup
- AND Alchemy or provider storage remains the canonical provider resource state

### Requirement: SQL Migration Runner

The system SHALL run registered Durable Object SQLite migrations before upgraded
code depends on migrated table shape.

#### Scenario: Apply pending SQL migration

- WHEN Authority or instance storage initializes for a storage identity with
  pending SQL migrations
- THEN the migration runner applies migrations in registry order
- AND each applied migration records its id, checksum, package version, and
  applied timestamp for that storage identity

#### Scenario: Skip applied SQL migration

- WHEN storage initializes for a storage identity whose migration id and checksum
  are already recorded as applied
- THEN the migration runner skips that migration
- AND storage initialization continues without duplicate table rewrites
