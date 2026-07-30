# Sync Replica Specification

## Purpose

Sync replica keeps browser state aligned with Authority storage for a
browser-backed storage identity. It stores a local IndexedDB replica, advances
sync cursors through HTTP or push sync, merges committed changes, and derives
local projections for generated UI surfaces. Authority storage remains the
source of truth; the browser replica remains a cache.

## Requirements

### Requirement: Replica Identity

The system SHALL key each browser replica by storage identity.

#### Scenario: Schema-key browser replica

- GIVEN a schema-key app such as `tasks`, `site`, or `crm`
- WHEN the browser opens the app
- THEN the local IndexedDB replica uses a schema-key-specific database name
- AND the matching broadcast channel is scoped to the same schema key

#### Scenario: Installed app browser replica

- GIVEN an installed app with an app install id
- WHEN the browser opens the installed app
- THEN the local IndexedDB replica uses `formless:app:<installId>`
- AND the matching broadcast channel uses the same app install id scope

#### Scenario: Program browser replica

- GIVEN the browser opens the default Program management surface
- WHEN the client target is selected
- THEN the local IndexedDB replica uses `formless:instance:control-plane`
- AND the matching broadcast channel uses the same Program scope
- AND the replica contains instance and reviewable identity records from one
  active `formless-program` schema and cursor
- AND there is no separate identity-control-plane browser database or broadcast
  channel

### Requirement: Local Replica Stores

The system SHALL persist browser replica metadata and records locally.

#### Scenario: Browser replica storage shape

- GIVEN a browser replica database exists
- WHEN local sync state or records are saved
- THEN sync metadata is stored in the local `meta` store
- AND records are stored in the local `records` store

#### Scenario: Storage snapshot restore into local replica

- GIVEN a storage snapshot restore returns a bootstrap-shaped response
- WHEN the client accepts that restore for a matching storage identity
- THEN the selected local replica is saved from the restored bootstrap response
- AND later browser reads use that storage identity's local replica

#### Scenario: Store portable schema data

- GIVEN bootstrap, sync, or snapshot restore supplies a current App schema
- WHEN the browser replica saves and later loads that schema
- THEN IndexedDB retains the portable array-shaped schema
- AND generated runtime may build shared keyed definition indexes after load
- AND derived maps, caches, reverse lookups, and parallel order lists are not
  persisted in IndexedDB or broadcast to another replica

#### Scenario: Reuse equivalent browser schema

- GIVEN a browser replica compares a received schema with its cached schema
- WHEN the schemas differ only in object property insertion order
- THEN canonical App schema equality permits reuse
- AND registry array reordering prevents reuse and installs the new schema
- AND keyed definition indexes are associated with the accepted parsed schema
  object rather than serialized cache state

### Requirement: Stale Browser Write Handling

The system SHALL reject incompatible stale browser writes with reload-required
errors.

#### Scenario: Reject stale write

- WHEN a browser replica sends an operation write using a stale runtime
  protocol, schema timestamp, or package app revision that is no longer write
  compatible
- THEN the Authority rejects the write with a reload-required error
- AND no committed change row is appended

#### Scenario: Stale reads return reload facts

- WHEN a stale browser replica requests bootstrap or sync through the current
  read protocol
- THEN the runtime can return read data
- AND the response can include current schema facts needed for reload or
  re-bootstrap behavior

### Requirement: Browser Cache Migration

The system SHALL treat IndexedDB migrations as cache migrations, not source of
truth migrations.

#### Scenario: Local database migration succeeds

- WHEN browser replica storage opens with an older local database shape
- THEN local IndexedDB upgrade code can migrate cache metadata and records
- AND subsequent sync still uses Authority as source of truth

#### Scenario: Local database migration fails

- WHEN browser replica storage cannot safely migrate local IndexedDB state
- THEN the client can delete the local replica and re-bootstrap from Authority
- AND no Authority data is lost

#### Scenario: Reset incompatible schema cache

- GIVEN a Formless browser replica contains schema data that cannot be parsed
  under the current App schema contract
- WHEN the current runtime opens that replica
- THEN the client deletes the affected Formless replica and re-bootstraps it
  from Authority
- AND it does not convert unsupported registry objects, infer declaration order
  from their property order, or retain a dual-shape schema cache
- AND non-Formless IndexedDB databases remain unchanged

#### Scenario: Local dev browser replica reset

- WHEN a local dev authenticated session bootstrap URL requests a fresh browser
  replica state
- THEN the browser deletes same-origin Formless replica IndexedDB databases for
  schema-key apps, installed apps, and the Program before
  rendering owner-only local runtime surfaces
- AND non-Formless IndexedDB databases on the same origin are not deleted
- AND after reset, each opened Formless surface re-bootstraps or syncs from
  Authority storage for its storage identity
- AND if deletion is blocked by another tab or browser connection, the client
  reports the blocked local cache reset instead of treating browser cache state
  as source of truth

### Requirement: HTTP Cursor Sync

The system SHALL use a sync cursor to catch up a browser replica from Authority storage.

#### Scenario: Catch up from stale cursor

- GIVEN a browser replica has an older sync cursor
- WHEN the client requests sync for its selected storage identity
- THEN the Authority returns committed changes after that cursor
- AND the browser replica merges those changes into local records
- AND the local sync cursor advances

#### Scenario: Current cursor

- GIVEN a browser replica has a current sync cursor
- WHEN the client requests sync for its selected storage identity
- THEN no older changes are replayed into the local replica
- AND the local cursor remains ready for future catch-up

### Requirement: Write Log Cursor Catch-Up

The system SHALL catch browser replicas up from Authority write-log changes for
the matching storage identity.

#### Scenario: HTTP catch-up reads write-log changes

- WHEN a browser replica requests HTTP sync after a stale cursor
- THEN the Authority returns committed write-log changes after that cursor
- AND the response cursor advances to the latest committed cursor for that
  storage identity
- AND write-log change fields use `writeId` and `operationKind`

#### Scenario: Push catch-up reads write-log changes

- WHEN a browser replica opens a push sync socket and sends a cursor
- THEN the Authority reads committed write-log changes after that cursor
- AND the socket catch-up omits duplicate changes already covered by the
  client's cursor
- AND push catch-up preserves operation-named change fields used by HTTP sync

### Requirement: Push Sync Connection

The system SHALL support push sync over hibernatable WebSockets for the Program,
schema-key apps, and installed app identities.

#### Scenario: Program push sync route

- GIVEN a management browser uses the Program storage identity
- WHEN it connects to `/api/formless/program/sync/ws`
- THEN the surviving Program Authority catches up from its one write-log cursor
- AND the socket receives instance and identity record changes through the same
  connection
- AND no standalone instance or identity control-plane sync socket exposes a
  second cursor

#### Scenario: Program push authorization remains current

- GIVEN a Program push socket was accepted for an active instance owner or
  instance administrator
- WHEN the socket sends catch-up messages or becomes eligible for a committed
  change broadcast
- THEN the runtime rechecks current principal status, instance management
  authority, session version, route target, and `instance:control-plane`
  storage identity
- AND a disabled principal, removed matching authority, changed session,
  ordinary authenticated principal, or session for another target receives no
  later Program changes
- AND an unauthorized socket is closed or suppressed

#### Scenario: Schema-key push sync route

- GIVEN a schema-key app storage identity
- WHEN the browser connects to `/api/:schemaKey/sync/ws`
- THEN the Authority accepts push sync messages for that schema key
- AND the socket can catch up from the client's cursor

#### Scenario: Installed app push sync route

- GIVEN an installed app storage identity
- WHEN the browser connects to the installed app sync WebSocket route
- THEN the Authority accepts push sync messages for that installed app
- AND the socket can catch up from the client's cursor

#### Scenario: Installed app admin push authorization remains current

- GIVEN an installed app admin push socket was accepted for an active owner or
  matching app-install-scoped app administrator
- WHEN the socket sends catch-up messages or becomes eligible for a committed
  change broadcast
- THEN the runtime rechecks current principal status, matching authority, and
  session version before returning protected app changes
- AND a disabled principal, disabled or removed matching role, changed session
  version, ordinary authenticated principal, instance admin without matching app
  role, or app admin for another install receives no later catch-up or broadcast
  data
- AND an unauthorized socket is closed or suppressed instead of retaining
  handshake-time authority

### Requirement: Push Sync Messages

The system SHALL use push sync messages to catch up clients and deliver committed writes.

#### Scenario: Hello catch-up

- GIVEN a browser replica opens a push sync socket with a cursor
- WHEN it sends `hello`
- THEN the Authority catches the socket up from that cursor
- AND schema data is omitted when the client's schema timestamp is current

#### Scenario: Committed write broadcast

- GIVEN an operation, schema write, or reset schema write commits
- WHEN push sync sockets are connected
- THEN the Authority broadcasts a sync message for the committed write
- AND one stale socket does not prevent later sockets from receiving the broadcast
- AND the broadcast tells clients to catch up from the write-log cursor rather
  than from inline write responses

### Requirement: Write Outcome Push Notifications

The system SHALL use Authority storage write outcomes as the source of push
sync notification policy.

#### Scenario: Committed write notifies

- WHEN an operation, schema write, reset schema, or snapshot restore write
  returns a committed storage outcome
- THEN the Authority broadcasts a push sync message for that committed write
- AND connected browser replicas can catch up from their stored cursors

#### Scenario: Replay or failed write does not notify

- WHEN an operation write returns a replayed storage outcome
- THEN the Authority does not broadcast a committed-write push notification
- AND no duplicate local replica merge is caused by that replay

- WHEN a write fails validation before storage commit
- THEN the Authority does not broadcast a committed-write push notification

### Requirement: Local Workspace Dirty Signals

The system SHALL derive local workspace dirty signals from committed write
outcomes, not browser replica cache writes.

#### Scenario: Successful browser write marks workspace dirty

- GIVEN local workspace auto-save is available
- WHEN a browser operation, schema save, app install, control-plane operation,
  reset schema, snapshot restore, or deployment intent write returns a
  committed local write response
- OR a core media upload is accepted and then referenced by a committed app
  record
- THEN the client emits a local workspace dirty signal with the storage identity
  and write source
- AND the dirty signal is emitted after Authority or media storage accepts the
  write
- AND the dirty signal does not make browser IndexedDB a workspace source of
  truth

#### Scenario: Replica-only updates do not mark workspace dirty

- GIVEN a browser replica catches up from bootstrap, HTTP sync, push sync,
  broadcast sync request, or local IndexedDB migration
- WHEN records or schema are merged into IndexedDB from Authority
- THEN no workspace dirty signal is emitted
- AND failed or replayed writes do not mark workspace source dirty

### Requirement: Push Sync Limits

The system MUST NOT depend on push sync for validation or replay behavior.

#### Scenario: Failed or replayed write

- GIVEN a write fails validation or replays an already committed operation
- WHEN push sync sockets are connected
- THEN no committed-write push notification is broadcast for that request
- AND local replicas must wait for a later committed write or explicit sync request to change state

#### Scenario: No polling fallback

- GIVEN browser push sync is enabled for an app storage identity
- WHEN the push sync connection is unavailable
- THEN the browser does not switch to a polling fallback
- AND no automatic polling catch-up runs as a fallback

### Requirement: Local Projections

The system SHALL derive generated UI read state from browser replica records instead of storing read models as records.

#### Scenario: Projection selectors

- GIVEN browser replica records are available
- WHEN generated UI selectors evaluate queries, references, aggregates, or readiness
- THEN the selectors compute query ids, query options, query counts, reference options, reference counts, aggregate values, and readiness warnings from the local projection snapshot
- AND those computed outputs are not stored as Authority records

#### Scenario: Delete reconciliation

- GIVEN a synced change marks a record deleted
- WHEN the browser replica merges the change
- THEN local subscriptions receive reconciled record state for that app storage identity
- AND generated UI projections update from the reconciled local records
