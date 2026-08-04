# Operations Architecture

Last updated: 2026-06-19

Purpose: controlling architecture note for the Formless operation seam.

This is not shipped behavior. Shipped behavior lives in
`openspec/specs/*/spec.md`.

## Contract

Operations are the domain contract for what can happen.

Bindings are the surface contract for where and how an operation is exposed.

Adapters are the package or platform contract for behavior that cannot live in
portable schema data.

App schema should organize interaction semantics around:

- flat stored records;
- projections over records;
- operations over records or projections;
- bindings that invoke operations from generated UI, protocol routes, public
  forms, CLI calls, automation triggers, or runtime surfaces;
- adapters selected by package and runtime capability facts.

Mutation policy, entity actions, public action metadata, generated action
slots, table action columns, tree controls, workflow triggers, and provider
commands are not peer interaction models. They are internal materializers behind
source-declared operations. They must not create browser controls, protocol
write routes, public write routes, audit roots, or authorization decisions
without a source-declared operation.

## Domain Conventions

Names use different casing by purpose:

- target keys use kebab-case or a single lower-case word;
- entity keys use singular kebab-case;
- operation key segments use kebab-case;
- field keys use lower camelCase because record values are consumed directly in
  TypeScript;
- cross-schema entity boundaries use `<schema-key>:<entity-key>`.

First-pass app operations are entity-local:
`entities.<entityKey>.operations.<operationKey>`.

The canonical key for an entity-local app operation is
`<entityKey>.<operationKey>`.

Runtime platform operations use target-prefixed canonical keys when they need a
runtime target:

- `app`: app entity records in Authority;
- `instance`: installs, routes, domain intent, and deploy intent;
- `workspace`: local sidecar and file source operations;
- `deployment`: desired state, attempts, leases, and observation;
- `provider`: provider resources and cleanup;
- `archive`: app and instance export and restore;
- `auth`: owner setup, login, and session bootstrap.

These targets do not authorize standalone command systems. A platform surface
must still answer which operation it invokes, which binding exposes it, which
records or projections it touches, and which adapter handles target-specific
behavior.

App-related nouns stay separate:

- `package-app`: bundled or reusable app package metadata, source schema key,
  package revision, source schema hash, and default install facts;
- `app-install`: instance-local installation metadata that binds an install id
  to a package app, label, status, storage identity, and routes;
- `app`: the running app storage target containing entity records, schema,
  changes, snapshots, sync state, and operation invocations.

`package-app` is installed as an `app-install`; an `app-install` points to one
app storage identity. The app storage identity owns records. The install record
does not embed app data.

## Operation Kinds

First-pass entity operation kinds:

- `list`: return records selected by a query.
- `get`: return one record by identity.
- `create`: create a record from declared input.
- `update`: update a record from declared input.
- `delete`: tombstone or remove a record through declared policy.
- `command`: run a domain command that may affect one or more records.

Public access is not an operation scope. It is actor policy plus a public
binding on an operation.

`selection` and `workflow` remain reserved operation scopes or kinds until their
contracts are introduced by a concrete use case.

## Operation Shape

An operation declares:

- key and label;
- target;
- kind;
- scope, when the target supports scoped operations;
- input contract;
- output contract;
- effect model;
- idempotency policy;
- actor and permission policy;
- audit policy.

Protocol, CLI, and UI placement do not define the domain operation. They bind
to it from separate binding declarations.

## Schema Direction

Source schema declares first-pass operations under
`entities.<entityKey>.operations`.

Operation input is its own contract. An input field can reference an entity
field to reuse field validation, labels, defaults, and generated editors. Inline
scalar input fields can cover command-only input that is not stored directly on
the target record.

First-pass output contracts are kind-shaped:

- `list`: records selected by the referenced query.
- `get`: one active record selected by record id.
- `create`: created record plus affected change ids.
- `update`: updated record plus affected change ids.
- `delete`: tombstoned record id plus affected change ids.
- `command`: typed command response plus affected change ids.

Queries remain query primitives. `list` operations reference query keys instead
of replacing query declarations.

First-pass effects stay small: create one record, patch one record, delete or
tombstone one record, dispatch one registered command effect kind, or execute a
declarative record plan. Plans write flat records only.

## Invocation Envelope

Every operation call normalizes into one invocation envelope before
authorization, validation, execution, replay classification, audit, or
materialization.

The envelope includes:

- invocation id;
- operation key;
- app storage identity;
- entity;
- record id or selection when relevant;
- actor;
- source protocol;
- source route, host, UI surface, or public block when relevant;
- input;
- idempotency key when required;
- received timestamp.

The envelope is the root fact for execution, replay, audit, and later durable
runtime state.

## Bindings

Bindings are external declarations that reference operation keys. They compose
operations into generated UI, CLI, API, public forms, hooks, automation entry
points, and future runtime triggers.

A binding may define route, command name, placement, form presentation, output
formatting, ordering, display, and surface-specific availability. It must not
redefine operation input, output, effect, actor policy, idempotency, audit, or
storage target.

### Generated UI

Generated record, list, table, tree, and detail presentations should ask for
available operations for the presented entity and scope.

Generated UI can render:

- record controls for record-scoped operations;
- collection toolbar controls for collection-scoped operations;
- public forms for publicly exposed operations;
- future selection or resumable controls only after those operation contracts
  exist.

Create, edit, delete, move, tree add, tree remove, and custom commands should be
presented through operation bindings.

Views can bind operation keys for placement and ordering while leaving operation
meaning on the entity operation declaration.

```json
{
  "views": {
    "taskHome": {
      "operations": [
        { "operation": "task.create", "placement": "toolbar" },
        { "operation": "task.clearCompletedTasks", "placement": "toolbar" }
      ]
    }
  }
}
```

### Protocol Routes

Protocol routes are bindings onto operations.

Examples:

- `GET /tasks` invokes `task.list`.
- `GET /tasks/:id` invokes `task.get`.
- `POST /tasks` invokes `task.create`.
- `PATCH /tasks/:id` invokes `task.update`.
- `DELETE /tasks/:id` invokes `task.delete`.
- `POST /tasks/:id/complete` invokes `task.complete`.

Instance route records can mount operation API surfaces at specific host and
path matches.

Protocol routes are not publicly exposed by schema declaration alone. A route
record or target-scoped public operation route must explicitly expose the
operation surface.

### Public Forms

Public forms are target-scoped bindings onto operations with anonymous actor
policy.

The public route resolves a declared operation, validates public input, verifies
challenge policy, builds an anonymous operation envelope, commits through
Authority, and returns a public-safe operation response.

Public action metadata does not create public execution without a matching
source-declared public operation binding.

### Hooks And Automation

After-create hooks, CLI calls, worker tasks, scheduled work, and agent calls
should invoke operations through the same envelope.

System callers are actors with explicit policy, not bypasses.

## Audit

Authority stores operation invocation rows as the semantic audit log.

Change rows remain the sync materialization log. Operation invocation rows are
Authority-owned system rows. They are not normal app records and are not emitted
as browser replica sync changes by default.

The audit row stores:

- operation key and kind;
- actor and auth decision;
- source protocol and route context;
- target app storage identity;
- input hash;
- safe input summary or explicitly allowed safe snapshot;
- affected change ids;
- idempotency facts;
- status;
- timestamps.

Secret field values, challenge proofs, provider secrets, and runtime secrets are
not stored in full input snapshots.

## Auth And Permissions

Operation policy is the main authorization boundary.

First actor modes:

- owner;
- admin bearer;
- public anonymous;
- CLI deployer;
- runner.

Later actor support may include:

- app user;
- role;
- group;
- organization;
- service actor.

Policies should cover:

- who can invoke the operation;
- which records can be read or mutated;
- which fields can be read, provided, or changed;
- whether public challenge proof is required;
- whether response fields are filtered by actor;
- whether the operation is visible in generated UI.

## Custom Operations

Custom operations should support two levels.

Declarative operations use schema-owned primitives: validate input, read records,
create records, patch records, delete or tombstone records, branch, and emit
events.

Registered runtime operations call trusted package code by key. They still use
the same input, policy, audit, idempotency, and output envelope.

Long-running work is deferred behind the reserved `workflow` operation kind. If
added, it should store durable invocation and step state as flat records and
present resumable controls through operation bindings.

## Migration Guardrails

1. Add source-declared operation model types.
2. Derive canonical operation keys as `<entityKey>.<operationKey>`.
3. Add invocation envelopes and operation audit rows while preserving existing
   sync change rows.
4. Move generated UI menus, buttons, table controls, tree controls, and ordering
   controls to operation presentation models.
5. Move public forms to public operation bindings.
6. Keep mutation and action materializers internal until all callers cross the
   operation boundary.
7. Remove route, metadata, and control synthesis after operation coverage is
   complete.

Do not add workflow, marketplace, broad provider management, roles/orgs,
AI/agent, or deployment-console primitives under this seam unless a concrete
operation proves the primitive is needed.

## Open Questions

- What exact contract should introduce selection-scoped operations for bulk
  commands?
- What is the exact JSON grammar for field-referenced input and inline
  operation-only input?
- What are the default idempotency rules for each operation kind?
- Which protocol path templates should be available as built-in binding
  presets?
- When long-running operations are added, are invocation records enough for
  status UI or do they need separate state records?
