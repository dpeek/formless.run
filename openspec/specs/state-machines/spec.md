# State Machines Specification

## Purpose

State machines declare lifecycle behavior over flat enum fields. They let app
schemas define valid transitions, protected status writes, generated transition
controls, and transition event records without storing nested workflow state or
hard-coding app-specific lifecycle logic.

## Requirements

### Requirement: Enum-Backed State Machines

The system SHALL let an entity declare state machines over required enum fields.

#### Scenario: Parse state machine declaration

- GIVEN an entity declares a state machine
- WHEN the app schema is parsed
- THEN the machine references an existing required enum field on the same entity
- AND every declared state and transition target references an enum value from
  that field
- AND every transition declares a non-empty label, one or more allowed source
  states, and one destination state
- AND terminal states cannot be used as transition source states
- AND transition definitions retain their declaration order

#### Scenario: Store state as normal field value

- GIVEN a record belongs to an entity with a state machine
- WHEN the record is stored, synced, snapshotted, archived, or restored
- THEN the current state is stored only as the machine's enum field value
- AND no nested machine state, transition history, or generated workflow object
  is persisted on the record

### Requirement: Transition Operations

The system SHALL expose state transitions through schema-declared transition
operations instead of generic status patches.

#### Scenario: Parse transition operation

- GIVEN an entity operation declares transition behavior through an
  operation-native handler effect
- WHEN the app schema is parsed
- THEN the operation references a state machine on the same entity
- AND the operation references a transition declared by that machine
- AND the operation remains unavailable for anonymous public execution in this
  change

#### Scenario: Execute valid transition

- GIVEN an active record has a current state allowed by a transition operation
- WHEN an authorized caller invokes that transition operation for the record
- THEN Authority patches the machine enum field to the transition destination
  state
- AND the write commits through normal operation idempotency and write-log behavior
- AND the operation response includes the committed record change

#### Scenario: Execute transition with record creates

- GIVEN a record-scoped transition operation declares a create-only side-effect
  record plan
- WHEN an authorized caller invokes the transition for an active record in an
  accepted current state
- THEN Authority evaluates target-record expressions from the stored
  pre-transition record
- AND the transition patch, optional transition event, and declared record
  creates commit as one operation outcome
- AND failure of transition, field, reference, unique constraint, generated
  value, or record validation commits none of those writes
- AND the operation response identifies records created by declared
  side-effect steps

#### Scenario: Recover undeclared state to initial

- GIVEN an active record has a non-empty current state string that is not
  declared by the machine enum field
- WHEN an authorized caller invokes a transition operation whose destination is
  the machine initial state
- THEN Authority treats the transition as a recovery transition and patches the
  machine enum field to the initial state
- AND transition operations to any other destination remain unavailable

#### Scenario: Reject invalid transition

- GIVEN a record is missing, tombstoned, or in a state not accepted by the
  selected transition
- WHEN a caller invokes the transition operation
- THEN the request is rejected before commit
- AND no record changes, transition events, side-effect records, or command
  replay rows are written

#### Scenario: Order generated transition choices

- GIVEN more than one transition operation is valid for a record's current
  state
- WHEN a generated surface has no explicit applicable operation binding order
- THEN transition controls use state-machine transition declaration order
- AND an explicit surface operation binding array may select or reorder the
  controls without changing the state machine

### Requirement: Protected Machine Fields

The system SHALL prevent direct lifecycle bypass for fields owned by a state
machine.

#### Scenario: Reject direct status patch

- GIVEN an entity field is owned by a state machine
- WHEN a generic update operation attempts to change that field
- THEN Authority rejects the operation
- AND callers must use a declared transition operation for lifecycle movement

#### Scenario: Create record at initial state

- GIVEN an entity has a state machine with an initial state
- WHEN a normal create operation writes a new record for that entity
- THEN the machine field is omitted or equals the initial state
- AND source seed bootstrap, reset, restore, and package migrations remain the
  explicit paths for loading already-progressed historical records

### Requirement: Transition Events

The system SHALL support one flat event record emitted by a transition operation
when the machine declares an event target.

#### Scenario: Emit transition event

- GIVEN a state machine declares a transition event target and field mappings
- WHEN a transition operation commits
- THEN Authority creates one event record in the same operation outcome
- AND the event records the source entity, source record id, transition key,
  previous state, next state, actor mode, and occurred date where mapped by the
  schema
- AND event records remain ordinary flat app records governed by the target
  entity schema

#### Scenario: Reject invalid event mapping

- GIVEN a state machine declares a transition event target
- WHEN the target entity or mapped fields cannot satisfy required event values
- THEN schema parsing fails
- AND the invalid app schema is not used for generated UI or writes
