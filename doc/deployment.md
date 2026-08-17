# Deployment

Last updated: 2026-08-17

Purpose: design a reliable CLI-first deployment model for one resolved Formless
target. Alchemy remains the single provider reconciler and durable provider-state
owner. Recovery, Program activation, and data replacement remain separate from
provider deployment because they operate on different state and safety boundaries.

This document is design context, not the source of shipped behavior. Accepted
behavior, including the stable recovery snapshot ABI and current Alchemy-owned
deployment runtime, lives in `openspec/specs/*/spec.md`. Remaining design should
inform focused Git-backed changes before accepted behavior moves into canonical
specs.

Environment identity, route topology, custom domains, email capabilities,
branch lifecycle, and future browser onboarding live in
[`environments.md`](./environments.md). Environment resolution supplies the
explicit target and private Alchemy execution context consumed here.

## Decision Summary

- Alchemy is the only provider deployment engine. Formless does not implement a
  second resource diff, direct Worker uploader, or installed-resource model.
- Every provider deployment evaluates the complete Alchemy declaration for one
  stable app, stage, and remote state scope.
- Alchemy skips unchanged resources, reconciles changed resources, removes
  omitted tracked resources during finalization, and updates the Worker.
- A code-only change uses the same Alchemy run. Infrastructure declarations are
  unchanged, so only the Worker bundle and assets change.
- Worker bindings are supplied directly from resources declared in the same
  Alchemy program. Formless does not persist a duplicate binding inventory.
- Formless desired resource projections describe intent supplied to Alchemy.
  They are not deployed state or provider truth.
- Canonical remote Alchemy state is the durable record required for safe update
  and deletion. Formless stores only small display-safe deployment observations.
- A stable recovery ABI captures remote Program records and media without
  requiring the local CLI to understand the remote Program schema, archive
  version, or Formless version.
- Program deployment does not implicitly copy records or media. Exact
  replacement remains a separate destructive workflow with a recovery snapshot.
- Deployment evolution reuses and simplifies the current Alchemy path. It does
  not introduce a parallel provider pipeline or require target ownership
  adoption between two reconcilers.

## Problem

The current `formless push` path combines concerns with different state and
safety requirements:

- Alchemy provider and Worker deployment;
- remote source export and local comparison;
- archive parsing and Program compatibility;
- Program provenance activation;
- record and media replacement;
- backup and restore planning;
- deployment observation writes to Program records.

The problem is not that a Worker update evaluates the Alchemy program. That is
the expected safe deployment mechanism: Alchemy uses tracked state to avoid
recreating unchanged infrastructure while updating the Worker declaration.

The problem is that ordinary deployment is coupled to source synchronization,
archive compatibility, data mutation, and restore policy. Recovery and exact
replacement also depend on current local schema assumptions. Current archive
readers reject unknown archive versions, and `push --force` still crosses
Program, provenance, archive, restore, and concurrency boundaries.

Owner authentication also crosses the current storage boundary. Credentials and
sessions are private auth state, while the owner principal and protected owner
assignment are currently Program records. Blind record replacement can preserve
a credential while deleting its authority.

The deployment model must retain Alchemy as the provider owner while separating
provider deployment from recovery, Program activation, and deliberate data
replacement.

## Goals

- Resolve one exact target and one stable Alchemy state scope for every provider
  deployment.
- Redeploy Worker code by rerunning the complete Alchemy declaration, allowing
  unchanged provider resources to remain no-ops.
- Apply changed provider intent without deploying Program records or media.
- Keep Formless deployment intent separate from Alchemy's tracked provider state.
- Capture complete replaceable remote state before understanding or changing an
  older target.
- Install a Program artifact independently from record transfer when the runtime
  has a concrete Program-only installation boundary.
- Replace complete application records and media without comparing them to the
  old remote schema.
- Preserve owner sign-in and protected owner authority across every operation.
- Leave the active Program and records unchanged when staging or validation
  fails.
- Keep commands explicit, deterministic, non-interactive when requested, and
  suitable for CI.

## Non-Goals

- This design does not replace Alchemy resource tracking, diffing, application,
  deletion, Worker upload, or remote state.
- Formless does not persist an installed resource manifest, installed graph
  hash, binding inventory, or copy of Alchemy outputs.
- Formless does not upload Worker code directly through a separate Cloudflare
  adapter.
- This design does not own environment ids, branch policy, preview lifecycle,
  resource naming policy, custom-domain topology, or browser onboarding.
- The first implementation does not include a browser deploy UI, hosted runner,
  browser provider OAuth custody, or browser job-progress transport.
- Deployment does not publish selected content between environments.
- Force does not repair missing Alchemy state, make resources exist, repair
  corrupt input, bypass authentication, or accept an unknown outcome.
- A recovery snapshot is not a provider-resource or private-security backup.
- The recovery ABI cannot guarantee capture from a historical Worker that never
  exposed a compatible endpoint.

## Deployment Target

Deployment operates on one resolved target:

```ts
type DeploymentTarget = {
  targetId: string;
  origin: string;
  provider: "cloudflare";
};
```

The target id is opaque to deployment. It does not imply production, branch,
preview, retention, or side-effect policy. The caller resolves those facts
before invoking an operation.

Private environment resolution also supplies the stable workspace identity,
Alchemy app, stage, remote state store, credential profile, and provider
authority required for the operation. These execution details are not
user-authored deployment contracts and do not belong in a second persisted
target or resource format.

Production is never inferred by omission or fallback. Every operation names one
exact target.

## Artifact And State Model

### Desired Provider Intent

Desired provider intent comes from:

- user-authored deployment configuration in `formless.ts`;
- fixed Formless runtime resources such as the Worker, Authority namespace,
  media bucket, queues, Turnstile widget, assets, and runtime bindings;
- schema-owned deployment projections that currently supply route, domain, and
  email intent.

Formless may normalize this intent into deterministic declarations or a
display-safe desired-state projection before calling Alchemy. That projection is
not installed state. It contains no provider credentials, Alchemy password,
state token, raw provider responses, or resource outputs.

### Canonical Alchemy State

Alchemy state is the durable record of tracked provider resources and outputs.
It is necessary for safe updates and deletion. Non-local targets use canonical
remote Alchemy state keyed by stable workspace and environment identity.

Apply and destroy use the same Alchemy app, stage, encryption password, and state
scope. Missing, stale, or inaccessible canonical state blocks destructive
reconciliation and requires explicit Alchemy adoption, state repair, or operator
recovery.

Formless does not mirror this state. A deployment-config observation may cache
the latest desired-state hash, status, time, and failure code for display, but it
does not become provider truth.

### Worker Deployment Input

The Worker declaration contains executable code, browser assets, compatibility
settings, bindings, Durable Object classes and migrations, event sources,
routes, domains, observability settings, and Worker URL policy.

Resources are declared before or alongside the Worker in the same Alchemy
program. Their returned resource objects are passed directly into Worker
bindings. Alchemy resolves concrete identifiers and prepares the Cloudflare
Worker metadata. Secret values remain inside the deployment execution boundary.

The complete Alchemy declaration is evaluated for every provider deployment.
The Worker resource is updated while unchanged infrastructure remains unchanged.
No durable handoff format is required between resource and Worker deployment.

### Program Artifact And Generation

A Program artifact is the complete schema-as-data definition and provenance.
The current build injects the Program artifact and selected runtime composition
into the Worker. A future Program-only deployment requires the Program artifact
to become an independently installed Authority artifact first.

A Program generation binds one Program artifact to one complete application
record snapshot and media namespace. Exact replacement stages a new generation
and switches one active-generation pointer only after the desired runtime
validates it.

The previous generation may remain available for bounded rollback and later
garbage collection. An incompatible Program is never activated over old records
by itself; it requires an explicit migration or exact replacement.

### Instance Security Plane

The instance security plane owns target-specific principals, authentication,
authorization assignments, protected owner authority, sessions, challenges,
recovery state, and secrets. It is outside replaceable Program generations.

Program artifacts may declare application roles and permissions. Security
assignments may reference stable role keys, so removing or changing those keys
requires an explicit security migration. Exact replacement does not guess one.

Until storage is physically separated, replacement preserves the complete owner
continuity closure: owner principal, recovery identity, credential binding,
active protected owner assignment, and required intrinsic role records.

### Recovery Snapshot

A recovery snapshot is a fidelity-first export produced by the selected remote
runtime. It contains:

- the active remote Program artifact and provenance;
- complete replaceable records and tombstones;
- every extant application media object;
- source cursor and capture time;
- snapshot protocol, payload format, Worker, and Formless versions;
- payload and whole-snapshot integrity evidence;
- explicit excluded security and provider scopes.

Private credentials, sessions, challenges, recovery secrets, admin bearers,
provider credentials, Alchemy state, and reviewable identity and access records
are excluded.

The local CLI stores unknown payload versions as opaque bytes after verifying
transport completion and outer integrity. Converting a snapshot into current
workspace state is a separate migration operation.

## Deployment Operations

### Stable Recovery ABI

Recovery is an intentionally permanent compatibility surface outside ordinary
Program APIs. A stable discovery endpoint identifies the snapshot protocol
supported by the remote Worker. The remote runtime serializes state through its
own active contracts.

Snapshot capture does not parse the payload using local Program runtime modules
or the current portable-archive parser. Every media object is captured without
requiring either schema to prove it is referenced.

Admin bearer is the stable break-glass authorization path because it does not
depend on Program-owned identity records being readable. Owner authorization may
also be supported when healthy.

Known legacy Workers may use explicit snapshot adapters. No new CLI can promise
capture from a Worker that never exposed a readable export path.

```text
formless snapshot --target <id> --output <path>
```

### Provider And Worker Deployment

Provider deployment resolves current desired intent and evaluates the complete
Alchemy declaration against canonical remote state. The declaration includes
base runtime resources, projected route and email resources, Worker bindings,
the Worker bundle, and browser assets.

Alchemy owns planning, resource identity, diffing, mutation, deletion, Worker
metadata, and finalization. A source-code-only change does not use a partial
resource model or direct upload path; the same declaration produces no provider
resource changes and updates the Worker.

Bindings do not need a separate discovery or persistence step. The Alchemy
program already has the resource objects and configuration required to declare
the complete Worker.

### Program Deployment

Program deployment installs a complete Program artifact without transferring
records or media. This becomes an independent operation only after the Authority
owns an independently installed Program artifact. Until then, Program material
remains part of the Worker build input.

Normal activation validates the artifact through the active runtime. An
incompatible Program requires a migration or exact replacement. Force may bypass
compatibility with the old generation only when activation is paired with exact
data replacement.

### Data And Media Replacement

Data replacement stages complete local application records, tombstones, and
media in a new generation. The desired runtime and Program validate the input;
the old remote Program does not.

Replacement does not merge old application values into local state or import
security records. Failed staging leaves the active generation unchanged.

```text
formless data replace --target <id> <archive> --force
```

### Normal Deploy

Normal deploy resolves one target and runs the complete Alchemy deployment. If
Program installation has become independent, it then installs and activates a
compatible Program artifact.

Ordinary deploy does not replace application records or media. It preserves
security state and applies only provider intent and Worker or Program changes
declared by the desired deployment.

```text
formless deploy --target <id>
```

### Exact Replacement

Exact replacement is the explicit destructive workflow:

```text
formless target replace --target <id> --from workspace --force
```

It:

1. resolves one exact target and acquires its deployment lease;
2. captures and durably stores a recovery snapshot;
3. evaluates the desired Alchemy deployment against canonical remote state;
4. enters maintenance mode;
5. stages the desired Program, records, tombstones, and media;
6. validates the new generation using the desired runtime;
7. atomically switches the active generation;
8. verifies runtime health, owner authority, and snapshot access;
9. retains the prior generation for bounded rollback;
10. exits maintenance and later garbage-collects superseded data.

A destructive replacement requires a recovery snapshot. A separate explicit
policy may permit disposable targets to skip it; force never implies that
choice, and production policy may prohibit it.

## Force Semantics

| Operation | Force may bypass | Force never bypasses |
| --- | --- | --- |
| Alchemy deployment | explicit adoption or repair policy where supported | exact target, canonical state access, provider authority, valid declarations, destructive state-loss protection |
| Program | compatibility with the old generation when paired with replacement | desired artifact validity, security schema, safe activation |
| Data | old/new schema comparison, diff planning, migration requirements | local input validity, checksums, deployment lease, snapshot prerequisite, security preservation |

Authentication failure, network failure, corrupt input, incomplete upload,
wrong-target protection, missing canonical Alchemy state, and owner-continuity
failure remain fatal.

## Provider State And Backups

Alchemy state tracks provider resources and is necessary for safe update and
deletion. It does not contain Program records or media contents.

Non-local targets use canonical remote Alchemy state keyed by stable workspace
and target identity. Apply and destroy use the same Alchemy app, stage,
encryption password, and state scope. Missing canonical state blocks destructive
reconciliation and requires explicit adoption or repair.

There is no separate Formless installed-resource state. Inspection reads
display-safe desired intent, Alchemy plan or state through the Alchemy boundary,
and limited deployment observations without persisting another resource model.

Recovery snapshot policy is supplied by the caller. Exact replacement always
requires a fresh snapshot unless an explicit disposable-target policy permits
otherwise. Private security and provider-secret recovery require independent
protected operational backups.

## Implementation Strategy

### Simplify The Existing Alchemy Path

The new orchestration builds on the current Alchemy declaration, credential
resolution, Worker build, and desired resource projection. It separates source
synchronization, recovery, Program activation, and data replacement without
introducing a second provider pipeline.

There is one mutation owner for one Alchemy state scope. New and old command
surfaces must not run concurrently against the same target, but no resource
manifest adoption or provider-ownership handoff is required.

### Package And Runtime Boundaries

| Boundary | Owns | Does not own |
| --- | --- | --- |
| `@dpeek/formless-deploy` | display-safe desired deployment intent, deterministic logical ids and desired-state hashing | provider truth, Alchemy state, credentials, Worker upload |
| Alchemy | tracked provider state, resource reconciliation, Worker bindings and metadata, Worker and asset upload, deletion | Program records, media contents, Formless recovery policy |
| `@dpeek/formless-archive/recovery` | stable envelope, opaque payload descriptors, integrity facts, format negotiation | provider resources, Alchemy state, CLI capture policy, Worker storage reads |
| Formless CLI deployment modules | target resolution, command policy, Alchemy execution context, operation ordering, filesystem effects, terminal adapters | browser UI, Authority storage |
| Formless Worker and Authority modules | recovery routes, export, security filtering, Program generation staging, activation, rollback | provider reconciliation, CLI prompts, local workspace writes |

Do not add a deployment contract package until a concrete shared runtime-neutral
contract exists that is not already owned by the Deploy package, Alchemy, or the
recovery package.

### Reuse And Remove

Reuse:

- the current complete Alchemy resource and Worker declaration;
- canonical remote Alchemy state support;
- desired deployment projection for route and email intent;
- Program materialization and Worker bundling;
- provider credential resolution;
- admin-bearer and target HTTP transport;
- Authority storage, media, hashing, and filesystem primitives.

Separate or remove from ordinary deployment:

- workspace source comparison and merge behavior;
- backup and restore dry-run orchestration;
- current archive parsing during snapshot capture;
- data replacement and portable restore;
- deployment observations that duplicate provider state.

### Operation Design

Start with concrete use cases rather than a generic workflow framework:

```ts
captureRecoverySnapshot();
deployTargetWithAlchemy();
installProgramArtifact();
stageProgramGeneration();
activateProgramGeneration();
replaceTarget();
```

Operation bodies accept explicit dependencies and return structured results.
They do not read terminal input, print, open browsers, or terminate the process.
CLI adapters own confirmation and presentation.

## State Continuity And Cutover

Deployment changes preserve each target's stable Alchemy app, stage, and state
scope. Refactoring command orchestration does not create a new provider owner.

If an existing target uses local Alchemy state and the desired model requires
remote state, migrate or adopt that state through an explicit Alchemy-supported
workflow before destructive reconciliation. Do not reconstruct state from a
Formless resource inventory or provider guesses.

Preview targets should prove remote-state continuity, code-only deployment,
resource updates, and deletion before development and production targets move.

## Cutover Criteria

Production use requires evidence that:

- snapshot capture succeeds without local Program compatibility;
- snapshot records and media can be inspected and migrated;
- rerunning the complete Alchemy declaration updates Worker code while unchanged
  resources remain unchanged;
- changed and omitted resources reconcile correctly from canonical remote state;
- bindings, assets, compatibility settings, migrations, event sources, and
  routes remain correct after Worker deployment;
- compatible Program deployment preserves records and media;
- exact replacement preserves owner authentication and authority;
- failed staging leaves the prior generation active;
- generation rollback succeeds;
- missing or inaccessible Alchemy state blocks destructive reconciliation;
- no Formless persisted structure duplicates Alchemy's installed state.

## Safety Invariants

- Every operation names one exact target.
- Every non-local target maps to one stable Alchemy app, stage, and remote state
  scope.
- Alchemy is the only owner of provider reconciliation and deployed resource
  tracking.
- Worker deployment evaluates the complete Alchemy declaration and preserves
  unchanged resources through Alchemy state.
- Desired resource projections are intent, not provider truth.
- Formless does not persist an installed resource or binding manifest.
- Recovery capture does not depend on the local Program or archive parser.
- Recovery includes all replaceable records, tombstones, and application media
  while excluding security and provider secrets.
- Normal deploy does not replace records or media.
- Incompatible Programs activate only with migration or exact replacement.
- Exact replacement begins with a durable snapshot and preserves security.
- Every completed mutation preserves protected owner authentication and
  authority.
- Force never bypasses integrity, security, target, state, lease, or
  owner-continuity invariants.

## Change Sequence

1. Landed: isolated recovery contracts, stable Worker discovery and snapshot
   ABI, and opaque CLI capture.
2. Resolve stable deployment targets to canonical remote Alchemy app, stage, and
   state scope while retaining the current complete Alchemy declaration.
3. Extract ordinary deployment from source synchronization, archive parsing,
   restore, and data replacement without changing provider ownership.
4. Prove that repeated Alchemy deployment updates the Worker and no-ops unchanged
   resources for preview, development, and production targets.
5. Separate the Program artifact from Worker build injection only when a concrete
   Program-only installation caller is ready.
6. Define the security plane and owner-continuity closure, building from stable
   retained-scope classification toward storage separation.
7. Add Program generations, exact record and media replacement, maintenance
   mode, atomic activation, rollback retention, and force policy.
8. Remove obsolete source-sync and restore coupling after the replacement
   operations are proven.
9. Define a trusted hosted runner and browser orchestration only after the CLI
   deployment and recovery operations are proven.

The recommended next change is canonical remote Alchemy state resolution for the
existing complete deployment declaration. It should not introduce a new
resource model, deployment contract package, Worker upload adapter, or provider
state store.

## Open Decisions

- Define the exact stable mapping from workspace and environment identity to the
  Alchemy app, stage, and remote state scope.
- Define migration from existing local Alchemy state to canonical remote state.
- Decide when Program artifacts should become independently installed Authority
  state rather than Worker build input.
- Define physical security-plane separation and migration from currently
  classified retained scopes.
- Decide prior-generation retention and garbage collection.
- Decide whether disposable targets may explicitly skip replacement snapshots.
- Divide Durable Object code migration policy between Worker declarations and
  Program activation without duplicating Alchemy migration state.
