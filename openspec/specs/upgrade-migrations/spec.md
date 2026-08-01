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
