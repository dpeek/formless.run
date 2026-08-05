# Sync Replica Specification

## Purpose

Sync replica keeps browser state aligned with the Program Authority. It stores
one local IndexedDB replica, advances one cursor through HTTP sync, uses a
content-free WebSocket to invalidate stale replicas, merges committed changes,
and derives local projections for generated UI surfaces. Program storage
remains the source of truth; the browser replica remains a cache.

## Requirements

### Requirement: Replica Identity

The system SHALL expose one browser replica keyed by the Program storage
identity.

#### Scenario: Program browser replica

- GIVEN the browser opens the default Program management surface
- WHEN the client target is selected
- THEN the local IndexedDB replica uses `formless:instance:control-plane`
- AND the matching broadcast channel uses the same Program scope
- AND the replica contains instance, reviewable identity, standard, Task, and
  Site records from one active `formless-program` schema and cursor
- AND all Program projections read from that replica

#### Scenario: Workspace Program extension replica

- GIVEN an authenticated principal has a role in a workspace-composed Program
- WHEN the browser bootstraps or synchronizes that Program
- THEN its one Program replica, cursor, broadcast channel, and HTTP sync route
  carry the complete active Program schema and records
- AND its one Program WebSocket carries only content-free invalidation
- AND workspace-owned module membership does not create a package replica,
  package cursor, selective sync admission, or separate socket

### Requirement: Local Replica Stores

The system SHALL persist browser replica metadata and records locally.

#### Scenario: Browser replica storage shape

- GIVEN a browser replica database exists
- WHEN local sync state or records are saved
- THEN sync metadata is stored in the local `meta` store
- AND records are stored in the local `records` store

#### Scenario: Bind cached Program data to the current principal

- GIVEN an IndexedDB replica exists for a Program storage identity
- WHEN a persistent Program runtime obtains a ready Program session snapshot
- THEN replica metadata binds the cached Program data to that snapshot's
  principal id before hydration can publish records to client projections
- AND hydration reuses the cache only when the principal binding and Program
  storage identity both match
- AND a missing or different principal binding clears the affected Formless
  Program cache before the new principal bootstraps it
- AND logout, anonymous, blocked, forbidden, and principal-change transitions
  clear in-memory Program state and make the prior persistent cache unavailable
  before another principal can render from it
- AND cross-tab invalidation coordinates that boundary without deleting
  non-Formless IndexedDB databases

#### Scenario: Storage snapshot restore into local replica

- GIVEN a storage snapshot restore returns a bootstrap-shaped response
- WHEN the client accepts that restore for a matching storage identity
- THEN the Program replica is saved from the restored bootstrap response
- AND later browser reads use that Program replica

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
  protocol, schema timestamp, or Program provenance that is no longer write
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
- THEN the browser deletes the same-origin Formless Program replica before
  rendering owner-only local runtime surfaces
- AND non-Formless IndexedDB databases on the same origin are not deleted
- AND after reset, the Program surface re-bootstraps or syncs from Program
  Authority storage
- AND if deletion is blocked by another tab or browser connection, the client
  reports the blocked local cache reset instead of treating browser cache state
  as source of truth

### Requirement: Browser Sync Status Boundary

The browser client SHALL retain semantic synchronization state while Formless
browser presentation code owns its user-visible copy.

#### Scenario: Publish semantic sync status

- GIVEN Program startup, replica catch-up, invalidation reconnect, generated
  record writes, or media writes update browser sync status
- WHEN the status is retained for shell presentation
- THEN it carries a closed browser-owned status code and only the bounded
  semantic data required by that code, such as an intentional schema field or
  entity label
- AND caught exception messages, response bodies, diagnostics, storage paths,
  commands, provider output, and generic result objects are not retained in
  sync status
- AND the shell projection maps each status code to fixed presentation copy
  before publishing its renderer-neutral contract

#### Scenario: Report local replica reset failure

- GIVEN local-session bootstrap optionally resets the same-origin Program
  replica
- WHEN reset is blocked or session verification fails
- THEN route state retains `replica-reset-blocked`, `session-required`,
  `request-unavailable`, or `invalid-response` as applicable
- AND the system-state projection publishes fixed browser-owned copy without
  forwarding an IndexedDB, fetch, parser, or exception message

### Requirement: HTTP Cursor Sync

The system SHALL use a sync cursor to catch up a browser replica from Authority storage.

#### Scenario: Catch up from stale cursor

- GIVEN a browser replica has an older sync cursor
- WHEN the client requests Program sync
- THEN the Authority returns committed changes after that cursor
- AND the browser replica merges those changes into local records
- AND the local sync cursor advances

#### Scenario: Current cursor

- GIVEN a browser replica has a current sync cursor
- WHEN the client requests Program sync
- THEN no older changes are replayed into the local replica
- AND the local cursor remains ready for future catch-up

### Requirement: Write Log Cursor Catch-Up

The system SHALL catch browser replicas up from Authority write-log changes for
the matching storage identity.

#### Scenario: HTTP catch-up reads write-log changes

- WHEN a browser replica requests HTTP sync after a stale cursor
- THEN the Authority returns committed write-log changes after that cursor
- AND the response cursor advances to the latest committed Program cursor
- AND write-log change fields use `writeId` and `operationKind`

### Requirement: Program Invalidation Connection

The system SHALL support content-free invalidation over one hibernatable
WebSocket for the Program identity.

#### Scenario: Program invalidation route

- GIVEN a management browser uses the Program storage identity
- WHEN it connects to `/api/formless/program/sync/ws`
- THEN the Authority authorizes the upgrade through the shared Program `member`
  access requirement
- AND the accepted socket is server-to-client only
- AND the socket carries no Program cursor, schema, record identity, change
  count, stored record, or other Program data

#### Scenario: Program invalidation authorization is checked at admission

- GIVEN a browser requests a Program invalidation WebSocket upgrade
- WHEN its current protected owner, Program role, principal, session version,
  route target, instance, or admin-bearer facts are evaluated
- THEN the runtime admits only a caller satisfying the shared Program `member`
  access requirement
- AND current editors and administrators satisfy the ordered member requirement
- AND accepted authority is not serialized with Program cursor or schema state
- AND later broadcasts do not reauthorize the socket
- AND every HTTP sync triggered by the socket performs normal current Program
  authorization before returning data

#### Scenario: Bound established socket authority

- GIVEN a Program invalidation socket was admitted with current authority
- WHEN that authority later expires or is revoked without a Program write
- THEN the socket sends no Program data
- AND server-enforced renewal schedules a randomized reconnect and closes every
  accepted socket with application code `4001` within five minutes of admission
- AND renewal state retained across hibernation contains only its expiry facts
- AND a failed renewal causes one current HTTP or Program-session authority check
- AND `401` or `403` invalidates the Program session snapshot while a transport
  failure follows bounded reconnect behavior without becoming polling
- AND close code `1008` remains a fail-closed policy or authority signal rather
  than the normal renewal path

#### Scenario: Reject client socket messages

- GIVEN an accepted Program invalidation socket is server-to-client only
- WHEN a client sends a WebSocket message
- THEN the Authority closes it as a policy violation
- AND it does not parse a sync cursor, read Program storage, or return an error
  payload through the socket

#### Scenario: Public Site visitors do not receive Program invalidation

- GIVEN a visitor opens a Program-native Site document on a mapped or published
  host
- WHEN public browser interactivity starts
- THEN it does not bootstrap or synchronize the authenticated Program replica
- AND it does not open `/api/formless/program/sync/ws`
- AND an authenticated browser Site preview selected by stable mount key
  `site.preview.browser` may use the same Program replica and invalidation
  socket because it is an admitted Program surface
- AND Worker Site preview selected by `site.preview.worker` reads current
  Program storage without bootstrapping the browser Program replica

### Requirement: Persistent Program Client Runtime

The system SHALL own Program session, replica, and synchronization effects at a
client runtime lifetime that persists across ordinary Program screen routes.

#### Scenario: Initialize one Program client runtime

- GIVEN a direct document request has admitted an eligible Program shell
- WHEN the client runtime starts
- THEN it resolves one Program session snapshot before publishing cached Program
  data
- AND a ready snapshot starts one principal-bound IndexedDB hydration, one
  Program bootstrap, one broadcast subscription, and one invalidation connection
- AND loading, blocked, forbidden, and failed states retain the runtime boundary
  while withholding the protected route workspace as applicable

#### Scenario: Navigate within one Program client runtime

- GIVEN the persistent Program runtime is ready and a Program workspace is
  mounted
- WHEN client routing selects another Program screen on the same runtime target
- THEN the session snapshot, hydrated replica, broadcast subscription, bootstrap
  state, and invalidation connection remain mounted
- AND no session or per-screen authorization request, IndexedDB rehydration,
  Program bootstrap, broadcast resubscription, or invalidation reconnection is caused by
  that route change
- AND only the selected route workspace and its route-local state may change

#### Scenario: End a Program client runtime safely

- GIVEN a persistent Program runtime is mounted
- WHEN navigation leaves its Program shell scope, logout completes, the principal
  changes, or its bound runtime target changes
- THEN it aborts pending client work, closes its broadcast subscription and
  invalidation connection, and clears protected in-memory projections
- AND cleanup from the ended lifetime cannot publish session, bootstrap, sync, or
  route state into a later lifetime

### Requirement: Program Invalidation Messages

The system SHALL use one content-free server message to invalidate connected
browser replicas after committed writes.

#### Scenario: Content-free changed message

- GIVEN a Program invalidation socket is connected
- WHEN the Authority notifies it of committed Program state
- THEN the server message is exactly `{ type: "changed" }`
- AND no client message is required to initialize or catch up the connection

#### Scenario: Committed write broadcast

- GIVEN an operation, schema write, or reset schema write commits
- WHEN Program invalidation sockets are connected
- THEN the Authority broadcasts a content-free changed message
- AND one stale socket does not prevent later sockets from receiving the broadcast
- AND concurrent committed notifications are coalesced into one changed message
  per socket no later than 100 milliseconds after the first pending notification
- AND connected clients catch up through HTTP from their stored cursor

### Requirement: HTTP Sync Trigger Coalescing

The system SHALL serialize HTTP catch-up triggers without losing an
invalidation that races an in-flight pull.

#### Scenario: Pull after connection boundaries

- WHEN a Program invalidation socket first opens or reconnects
- THEN the browser requests HTTP Program sync from its stored cursor and schema
  timestamp
- AND a write committed between bootstrap and socket connection is included
- AND no cursor or schema timestamp is sent through the socket

#### Scenario: Coalesce changed messages

- GIVEN an HTTP Program sync is scheduled or in flight
- WHEN one or more changed messages arrive
- THEN the browser coalesces them behind one in-flight pull
- AND a changed message received during that pull schedules exactly one trailing
  pull after the response is applied
- AND a changed message received after the pull completes starts a later pull
- AND response application remains bound to the current principal, runtime
  target, abort signal, and publication lifetime

#### Scenario: Catch up after focus recovery

- GIVEN a persistent Program runtime regains focus after actual suspension
- WHEN its Program session snapshot remains fresh and unexpired
- THEN it requests one coalesced HTTP Program sync
- AND a stale or expired snapshot follows the normal current-authority refresh
  before replica synchronization resumes

### Requirement: Write Outcome Invalidation Notifications

The system SHALL use Authority storage write outcomes as the source of
content-free invalidation policy.

#### Scenario: Committed write notifies

- WHEN an operation, schema write, reset schema, or snapshot restore write
  returns a committed storage outcome
- THEN the Authority schedules a content-free changed message for that committed
  write
- AND connected browser replicas can catch up from their stored cursors

#### Scenario: Replay or failed write does not notify

- WHEN an operation write returns a replayed storage outcome
- THEN the Authority does not broadcast a committed-write changed notification
- AND no duplicate local replica merge is caused by that replay

- WHEN a write fails validation before storage commit
- THEN the Authority does not broadcast a committed-write changed notification

### Requirement: Local Workspace Dirty Signals

The system SHALL derive local workspace dirty signals from committed write
outcomes, not browser replica cache writes.

#### Scenario: Successful browser write marks workspace dirty

- GIVEN local workspace auto-save is available
- WHEN a browser operation, schema save, control-plane operation,
  reset schema, snapshot restore, or deployment intent write returns a
  committed local write response
- OR a core media upload is accepted and then referenced by a committed Program
  record
- THEN the client emits a local Program workspace dirty signal with the write
  source
- AND the dirty signal is emitted after Authority or media storage accepts the
  write
- AND the dirty signal does not make browser IndexedDB a workspace source of
  truth

#### Scenario: Replica-only updates do not mark workspace dirty

- GIVEN a browser replica catches up from bootstrap, HTTP sync triggered by an
  invalidation, cross-tab refresh, or local IndexedDB migration
- WHEN records or schema are merged into IndexedDB from Authority
- THEN no workspace dirty signal is emitted
- AND failed or replayed writes do not mark workspace source dirty

### Requirement: Program Invalidation Limits

The system MUST NOT depend on Program invalidation for validation or replay
behavior.

#### Scenario: Failed or replayed write

- GIVEN a write fails validation or replays an already committed operation
- WHEN Program invalidation sockets are connected
- THEN no committed-write changed notification is broadcast for that request
- AND local replicas must wait for a later committed write or explicit sync request to change state

#### Scenario: No polling fallback

- GIVEN browser invalidation is enabled for the Program storage identity
- WHEN the invalidation connection is unavailable
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
- THEN local subscriptions receive reconciled Program record state
- AND generated UI projections update from the reconciled local records
