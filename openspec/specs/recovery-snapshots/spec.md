# Recovery Snapshots Specification

## Purpose

Recovery snapshots provide a permanent, version-negotiated, fidelity-first
capture boundary for one resolved Formless target before deployment or exact
replacement. The remote Worker serializes its own active Program and media
state while the local caller validates a stable outer envelope without needing
the remote Program schema, portable archive version, payload format, or
Formless version.

## Requirements

### Requirement: Stable Recovery Discovery

The system SHALL expose one stable discovery path for supported recovery
snapshot protocols.

#### Scenario: Discover recovery capture

- GIVEN a resolved target runs a Worker with the recovery capability
- WHEN trusted automation sends `GET /api/formless/recovery` with valid admin
  bearer authorization
- THEN the response identifies the stable recovery discovery contract
- AND it advertises each supported protocol version, versioned capture path,
  and response media type in deterministic preference order
- AND it does not expose Program records, media metadata, private auth state,
  provider credentials, or Alchemy state
- AND it uses `Cache-Control: no-store`

#### Scenario: Fail closed without break-glass authorization

- WHEN recovery discovery or capture receives a missing or invalid admin bearer
- THEN it returns an authorization failure without reading Program or media
  payloads
- AND unconfigured local or owner-session behavior does not make the recovery
  ABI open
- AND owner authorization may be added later without replacing the admin-bearer
  compatibility path

#### Scenario: Unsupported recovery capability

- GIVEN a target Worker does not expose the stable discovery contract or does
  not advertise a protocol understood by the caller
- WHEN capture is requested
- THEN the operation reports that recovery capture is unavailable for that
  target
- AND it does not fall back to Program snapshot, portable archive, pull, push,
  restore, or provider workflows
- AND support for a known historical Worker requires a separately declared
  legacy adapter rather than guessing a response shape

### Requirement: Stable Recovery Envelope

The system SHALL stream recovery data through a stable outer protocol whose
payload bytes remain opaque to version-independent callers.

#### Scenario: Version one framed stream

- WHEN a Worker serves `POST /api/formless/recovery/v1/snapshot`
- THEN the response uses media type `application/vnd.formless.recovery.v1`
- AND the body is a length-delimited binary frame stream containing one capture
  header, ordered payload frames, and one terminal completion receipt
- AND payload bytes are binary rather than JSON base64 values
- AND one payload frame can be consumed and persisted without buffering the
  complete response or another payload frame in memory

#### Scenario: Minimum stable outer facts

- WHEN the version one envelope is parsed
- THEN its stable outer facts identify the envelope kind, protocol version,
  capture id, capture time, source origin, source cursor, Worker version,
  Formless version, native payload format and version, included application
  scope, excluded retained scopes, and ordered payload descriptors
- AND each payload descriptor identifies its stable frame id, payload kind,
  byte length, and SHA-256 digest
- AND the completion receipt binds the immutable capture header and ordered
  payload descriptors into one whole-snapshot SHA-256 root
- AND native payload metadata not required for framing or integrity remains
  opaque payload data rather than expanding the stable outer contract

#### Scenario: Verify complete transport

- GIVEN a caller receives a recovery stream
- WHEN frame boundaries, declared byte lengths, payload digests, terminal
  receipt, or whole-snapshot root are missing or invalid
- THEN outer validation rejects the snapshot
- AND no incomplete snapshot is published at the requested output path

#### Scenario: Preserve an unknown native payload

- GIVEN the stable outer protocol version is supported
- AND the remote native payload format or payload version is unknown locally
- WHEN every frame and integrity fact validates
- THEN the caller stores the payload bytes unchanged
- AND it records the unknown payload format and version in capture evidence
- AND it does not parse, canonicalize, migrate, compare, or reject those bytes
  through current Program or portable-archive contracts

### Requirement: Recovery Contract Package

The system SHALL expose recovery envelope contracts independently from current
portable archive contracts.

#### Scenario: Runtime-neutral recovery contracts

- WHEN runtime, Worker, CLI, or tests need discovery, frame, descriptor,
  integrity, scope, or receipt contracts
- THEN they import them from `@dpeek/formless-archive/recovery`
- AND Node capture persistence uses `@dpeek/formless-archive/recovery/node`
- AND those entrypoints do not parse App schemas, storage snapshots, Program
  records, media references, or current instance archive envelopes
- AND the package does not own Worker routes, Authority reads, media reads,
  target resolution, authentication, terminal output, or deployment policy

#### Scenario: Recovery and portable archive versions evolve independently

- GIVEN a portable instance archive version or a remote native recovery payload
  version changes
- WHEN stable recovery protocol version one still frames and verifies the bytes
- THEN version-independent capture continues without changing current portable
  archive validation
- AND a recovery protocol change requires discovery of a new protocol version
  rather than silently changing version one framing

### Requirement: Remote Recovery Contents

The system SHALL capture all replaceable application state through contracts
owned by the selected remote runtime.

#### Scenario: Capture remote Program state

- GIVEN the remote runtime has an active Program artifact and Program Authority
  state
- WHEN recovery capture runs
- THEN the remote runtime serializes the active Program artifact, provenance,
  complete replaceable application records, and replaceable tombstones through
  its own active native payload contract
- AND the local caller does not resolve or validate the remote Program schema
- AND the capture header records the remote native payload format and version

#### Scenario: Capture every application media object

- GIVEN application media objects exist under the instance-owned image or
  Program-document media namespaces
- WHEN recovery capture runs
- THEN every extant application media object is included with its exact provider
  storage key, byte length, content type, provider metadata required for
  fidelity, and payload bytes
- AND referenced, unreferenced, public, and private application media
  participate in the same capture
- AND recovery-internal objects outside application media namespaces do not
  recursively participate

#### Scenario: Exclude retained target state

- WHEN the remote runtime classifies recovery state
- THEN application Program records and application media are replaceable scope
- AND reviewable identity principals, emails, memberships, roles, assignments,
  invitations, and policies are retained security scope
- AND private credentials, sessions, challenges, grants, recovery material,
  invite token hashes, and admin bearer material are retained private-auth scope
- AND runtime-owned instance topology, deployment, provider, custom-domain,
  email-provider, provider credential, provider response, Alchemy, and resource
  state are retained provider scope
- AND retained security, private-auth, and provider state is absent from native
  replaceable payloads
- AND the stable capture header explicitly identifies every excluded retained
  scope

#### Scenario: Classify runtime-owned records by stable identity

- WHEN Program records are divided between replaceable and retained scopes
- THEN runtime-owned security and provider classifiers use package-owned stable
  entity identities rather than display labels or coincidental entity names
- AND active and tombstoned records receive the same scope classification
- AND an unclassified runtime-owned record scope fails capture closed
- AND ordinary Program entities not owned by a retained runtime scope remain
  replaceable application state

### Requirement: Coherent Recovery Capture

The system MUST reject a capture whose Program or media source changes while it
is being read.

#### Scenario: Verify a stable source interval

- GIVEN capture reads Program state and an ordered media inventory
- WHEN all payloads have streamed
- THEN the remote runtime re-reads Program source cursor and provenance and the
  ordered media key, size, and immutable-object identity inventory
- AND it emits the completion receipt only when those facts equal the facts
  captured before streaming
- AND object reads are bound to the immutable-object identity selected by the
  initial inventory

#### Scenario: Reject concurrent drift

- WHEN Program cursor, Program provenance, media membership, media size, media
  immutable-object identity, or a selected media object changes during capture
- THEN capture terminates without a completion receipt
- AND the caller rejects and removes incomplete local output
- AND recovery capture does not acquire a deployment lease, enter maintenance
  mode, or mutate Program, media, security, provider, or Alchemy state

### Requirement: Headless Recovery Capture Operation

The system SHALL provide a headless operation that captures one caller-resolved
target without owning target selection or terminal behavior.

#### Scenario: Capture an explicit resolved target

- GIVEN a caller supplies one resolved target id, origin, provider, admin bearer,
  and output path
- WHEN `captureRecoverySnapshot` runs
- THEN it discovers the target protocol, selects a mutually supported version,
  streams and verifies the response, and atomically publishes one complete
  recovery snapshot at the output path
- AND it returns structured progress, integrity evidence, excluded scopes, and
  a display-safe receipt
- AND it does not infer production, environment, branch, preview, retention, or
  backup policy from omitted input

#### Scenario: Keep operation and terminal boundaries separate

- WHEN the capture operation executes
- THEN its body accepts explicit dependencies and does not print, read terminal
  input, open a browser, terminate the process, or resolve a target from
  schema-owned deployment records
- AND target selection, admin-bearer resolution, output presentation, and any
  future public command spelling remain caller-owned
- AND no public `formless snapshot` binding is added until environment-owned
  target resolution supplies the exact target

#### Scenario: Leave prior output intact on failure

- GIVEN the requested output path already contains a complete snapshot
- WHEN discovery, authorization, network transport, framing, integrity, source
  stability, filesystem staging, or atomic publication fails
- THEN the previous complete output remains unchanged
- AND temporary capture output is removed or left only in a caller-identified
  recoverable temporary location

#### Scenario: Protect sensitive capture output

- GIVEN a recovery snapshot may contain private application records and media
- WHEN the Node capture adapter stages or publishes the snapshot
- THEN it creates local files with owner-only permissions where the platform
  supports them
- AND progress, evidence, receipts, errors, and logs omit admin bearer material,
  application record values, media bytes, and private provider metadata
- AND structured output reports only display-safe target, version, scope,
  count, size, path, and integrity facts

### Requirement: Recovery Pipeline Isolation

The system SHALL keep recovery capture independent from current synchronization
and deployment mutation workflows.

#### Scenario: Do not call the legacy pipeline

- WHEN recovery capture runs
- THEN it does not call current push, pull, source comparison, workspace save,
  portable archive export or parsing, archive restore, deployment observation,
  schema-owned deployment projection, provider reconciliation, or browser
  operation workflows
- AND narrow admin-bearer HTTP transport, Authority snapshot primitives, media
  listing and read primitives, hashing, streaming, and filesystem primitives may
  be reused behind recovery-owned interfaces

#### Scenario: Recovery capture is not recovery apply

- WHEN a complete recovery snapshot is captured
- THEN no workspace state, Program generation, Program record, media object,
  security assignment, provider resource, or deployment owner changes
- AND snapshot inspection, migration, restore, exact replacement, rollback,
  retention, and garbage collection remain separate future capabilities
