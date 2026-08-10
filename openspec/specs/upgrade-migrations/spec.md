# Upgrade Migrations Specification

## Purpose

Upgrade migrations are reserved for a future explicit upgrade capability.
Current push and pull synchronization do not expose migration policy, upgrade
planning, migration backup requirements, or migration approval gates.

## Requirements

### Requirement: Metadata Helpers

The system SHALL expose display-safe runtime facts for diagnostics and future
upgrade work.

#### Scenario: Read deployed metadata facts

- WHEN a client reads deployed runtime metadata from a target instance
- THEN the response includes package version, runtime protocol version, storage
  migration set identity, and current storage migration facts
- AND Program provenance is read from the complete Program artifact contract
- AND the response uses `Cache-Control: no-store`
- AND the response does not include provider credentials, admin tokens, Alchemy
  passwords, raw lease tokens, or storage secrets

#### Scenario: Import canonical schema hash contracts

- WHEN runtime metadata checks or tests need source schema hash parsing or
  deterministic source schema hash computation
- THEN those contracts come from `@dpeek/formless-schema`
- AND sync code does not import those contracts from root runtime modules

### Requirement: Sync Does Not Run Migrations

The system SHALL keep migration and upgrade behavior out of current push and
pull synchronization.

#### Scenario: Push omits migration policy

- WHEN `formless push` or `formless push --dry-run` runs
- THEN it does not accept migration policy input
- AND it does not build CLI upgrade plans, classify migration safety, apply
  storage migrations, require backup evidence, or require manual approval
  evidence

#### Scenario: Compatible Program refresh is not a migration

- GIVEN current and desired Program schemas have the same stored record contract
- AND every committed and replacement record validates without creation,
  patching, deletion, value pruning, or constraint repair
- WHEN ordinary push reconciles the desired runtime and active Program schema
- THEN the compatible source refresh remains a synchronization operation
- AND it does not invoke a migration registry, record transform, migration
  approval, or migration evidence policy

#### Scenario: Add an icon catalog and transitional value mode compatibly

- GIVEN the desired Program adds schema-declared icon definitions
- AND an existing icon text field changes from omitted or `svgSource` behavior
  to `iconIdWithSvgFallback`
- AND every current record retains its existing safe SVG source or icon id
- WHEN ordinary push evaluates the desired Program
- THEN the icon catalog and transitional behavior do not change the stored field
  contract or materialize records
- AND the Program refresh is storage-compatible even though its source schema
  hash changes

#### Scenario: Require icon data conversion before strict id mode

- GIVEN a desired icon text field uses `iconId`
- AND one or more current records still store raw SVG source
- WHEN ordinary push validates current records under the desired Program
- THEN push reports that record materialization is required and changes nothing
- AND after an explicit workflow rewrites every raw source to an icon id, the
  same strict-mode schema refresh can be storage-compatible without changing
  the archive envelope

#### Scenario: Record-materializing evolution requires an explicit operation

- GIVEN a Program schema change removes or rebinds stored entities or fields,
  changes stored value shape, or requires record or constraint repair
- WHEN ordinary push plans that schema change
- THEN push fails without changing Program records or media
- AND neither ordinary push nor force silently transforms or prunes records
- AND a future explicit evolution or migration operation owns backup policy,
  transforms, approval, validation, apply evidence, and rollback

#### Scenario: Pull omits migration policy

- WHEN `formless pull` or `formless pull --dry-run` runs
- THEN it copies or plans target state into workspace source without applying
  runtime or data migrations
- AND unsupported future runtime, schema, or archive facts fail through
  ordinary sync validation until an explicit upgrade capability is reintroduced

### Requirement: Stale Runtime Reloads

The system SHALL prefer reload-required behavior over blocking server-side
future migrations for stale browser clients.

#### Scenario: Compatible stale read

- WHEN a stale browser bundle reads data through a still-compatible protocol
- THEN the runtime can continue returning read responses
- AND the stale browser does not block pending migrations

#### Scenario: Incompatible stale write

- WHEN a stale browser bundle attempts a write against an incompatible runtime
  protocol or complete Program schema contract
- THEN the runtime rejects the write with a reload-required error
- AND no partial mutation is committed
