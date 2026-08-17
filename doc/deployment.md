# Deployment

Last updated: 2026-08-17

Purpose: design a reliable CLI-first deployment model for one resolved Formless
target without coupling provider resources, Worker code, Program definitions,
records, media, and security state into one synchronization operation.

This document is design context, not the source of shipped behavior. Accepted
behavior, including the stable recovery snapshot ABI, lives in
`openspec/specs/*/spec.md`. The remaining design should inform multiple
Git-backed changes before accepted behavior moves into canonical specs.

Environment identity, route topology, custom domains, email capabilities,
branch lifecycle, and future browser onboarding live in
[`environments.md`](./environments.md). That design resolves an environment into
the deployment target consumed here.

## Decision Summary

- Recovery snapshot, resource deployment, Worker deployment, Program
  deployment, and data replacement are independent operations.
- A stable recovery ABI captures remote Program records and media without
  requiring the local CLI to understand the remote Program schema, archive
  version, or Formless version.
- Resource deployment reconciles provider infrastructure through Alchemy and
  publishes an installed resource manifest.
- Worker deployment uploads executable code through the provider adapter using
  the installed manifest without rerunning Alchemy.
- Program deployment installs a Program artifact without implicitly copying
  records or media.
- Exact replacement stages a complete Program generation and atomically
  activates it while preserving target-owned security state.
- Ordinary deploy updates Worker code and a compatible Program artifact. It
  preserves records, media, security state, provider resources, and Alchemy
  state.
- Force bypasses compatibility policy only within the selected operation. It
  never bypasses target identity, authentication, integrity, required physical
  resources, deployment leases, or owner continuity.
- The new model is a parallel CLI-first pipeline. It does not call current
  `push`, source-sync, restore, deployment-observation, or schema-owned
  deployment projection workflows.
- Browser deployment is deferred. Headless operation bodies return structured
  plans, progress, evidence, and receipts for CLI and CI first.
- One deployment pipeline owns mutation of a target at a time. Existing targets
  move through an explicit one-way adoption workflow.

## Problem

The current `formless push` path combines concerns with different rates of
change and different safety requirements:

- remote source export and local comparison;
- archive parsing and Program schema compatibility;
- Alchemy resource reconciliation;
- Worker and browser asset deployment;
- Program provenance activation;
- record and media replacement;
- backup and restore planning;
- deployment observation writes to Program records.

This causes ordinary runtime changes to run through provider reconciliation and
causes recovery or exact replacement to depend on current local schema
assumptions. Current archive readers reject unknown archive versions, and
`push --force` still depends on Program, provenance, archive, restore, and
concurrency validation.

Owner authentication also crosses the current storage boundary. Credentials and
sessions are private auth state, while the owner principal and protected owner
assignment are currently Program records. Blind record replacement can preserve
a credential while deleting its authority.

The deployment path must permit safe remote capture and deliberate exact
replacement even when the old and desired Workers, Programs, records, and
Formless versions disagree.

## Goals

- Capture complete replaceable remote state before understanding or changing an
  older target.
- Update Worker code without reconciling unchanged provider resources.
- Apply provider resources without deploying Program records or media.
- Install a Program artifact independently from record transfer.
- Replace complete application records and media without comparing them to the
  old remote schema.
- Preserve owner sign-in and protected owner authority across every operation.
- Leave the previous Program generation active when staging or validation
  fails.
- Support explicit rollback to a retained generation.
- Keep commands headless, deterministic, non-interactive when requested, and
  suitable for CI.
- Cut over incrementally without extending the current deployment pipeline.

## Non-Goals

- This design does not own environment ids, branch policy, preview lifecycle,
  resource naming policy, custom-domain topology, or browser onboarding.
- The first implementation does not include a browser deploy UI, hosted runner,
  browser provider OAuth custody, or browser job-progress transport.
- Deployment does not publish selected content between environments.
  Publication is a separate future capability.
- Force does not make missing resources exist, repair corrupt input, bypass
  authentication, or accept an unknown outcome.
- A recovery snapshot is not a provider-resource or private-security backup.
- The recovery ABI cannot retroactively guarantee capture from a historical
  Worker that never exposed a compatible endpoint.
- The new pipeline does not preserve `push` as an alias, add a permanent
  `deploy-v2` package, or allow dual mutation ownership.

## Deployment Target

Deployment operates on one resolved target:

```ts
type DeploymentTarget = {
  targetId: string;
  origin: string;
  provider: "cloudflare";
  installedManifestRef?: string;
};
```

The target id is opaque to deployment. It does not imply production, branch,
preview, retention, or side-effect policy. The caller resolves those facts
before invoking a deployment operation.

Every operation receives an explicit target. Production is never inferred by
omission or fallback. First resource creation does not yet have an installed
manifest. Worker deployment and later resource mutation require one.

## Artifact And State Model

### Installed Resource Manifest

Resource deployment produces an installed resource manifest containing:

- provider account and Worker identity;
- exact binding names, kinds, and concrete resource identifiers;
- compatibility date and flags;
- Durable Object classes and applied provider migration revision;
- assets and route capability configuration;
- installed resource-graph hash;
- update time and resource-deployment evidence.

The manifest is display-safe canonical deployment state. It contains no
provider credentials, Alchemy encryption material, or raw provider responses.
Worker deployment consumes it without rerunning Alchemy.

### Worker Artifact

A Worker artifact contains executable Worker code and browser assets. It
declares the bindings, provider capabilities, runtime extensions, and Program
capabilities it requires.

Deploying it changes executable code without changing the active Program
artifact, Program records, media, security state, provider resource graph, or
Alchemy state.

The current build injects the Program artifact and selected runtime composition
into one deployment. Independent Worker deployment requires the Program
artifact to become an independently installed Authority artifact. Runtime
extensions may remain compiled into the Worker and appear in its capability
manifest.

### Program Artifact And Generation

A Program artifact is the complete schema-as-data definition and provenance.

A Program generation binds one Program artifact to one complete application
record snapshot and media namespace. Exact replacement stages a new generation
and switches one active-generation pointer only after the desired runtime
validates it.

The previous generation remains available for bounded rollback and later
garbage collection. An incompatible Program is never activated over old records
by itself; it requires an explicit migration or an exact replacement
generation.

### Instance Security Plane

The instance security plane owns target-specific principals, authentication,
authorization assignments, protected owner authority, sessions, challenges,
recovery state, and secrets. It is outside replaceable Program generations.

Program artifacts may declare application roles and permissions. Security
assignments may reference stable role keys, so removing or changing those keys
requires an explicit security migration. Exact replacement does not guess one.

Until storage is physically separated, replacement preserves the complete
owner continuity closure: owner principal, recovery identity, credential
binding, active protected owner assignment, and required intrinsic role
records.

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

### Resource Deployment

Resource deployment reconciles already resolved provider intent through
Alchemy, stores canonical remote Alchemy state, and publishes the installed
resource manifest.

It owns resource creation and deletion, bindings, storage, queues, custom
domains, compatibility configuration, and provider migrations. It does not
deploy Program records or media.

```text
formless resources apply --target <id>
```

Resource deployment is explicit after target creation. Ordinary Worker or
Program deployment does not run Alchemy to discover an unchanged graph.

### Worker Deployment

Worker deployment compares the artifact capability requirements with the
installed resource manifest and uploads code and assets directly through the
provider adapter.

A missing binding or unapplied provider migration requires resource deployment.
Force may ignore remote version provenance but cannot manufacture physical
resources.

```text
formless worker deploy --target <id>
```

### Program Deployment

Program deployment installs a complete Program artifact without transferring
records or media. Normal activation validates the artifact against the active
generation and installed Worker capability manifest.

An incompatible Program requires a migration or an exact replacement. Force
may bypass compatibility with the old generation only when activation is paired
with exact data replacement.

```text
formless program deploy --target <id>
```

### Data And Media Replacement

Data replacement stages complete local application records, tombstones, and
media in a new generation. The desired Worker and Program validate the input;
the old remote Program does not.

Replacement does not merge old application values into local state or import
security records. Failed staging leaves the active generation unchanged.

```text
formless data replace --target <id> <archive> --force
```

### Normal Deploy

Normal deploy orchestrates Worker deployment and compatible Program deployment.
It preserves application records, media, security, resources, and Alchemy state.
It is not destructive when `--force` is present.

```text
formless deploy --target <id>
```

### Exact Replacement

Exact replacement is the explicit nuclear workflow:

```text
formless target replace --target <id> --from workspace --force
```

It:

1. resolves one exact target and acquires its deployment lease;
2. captures and durably stores a recovery snapshot;
3. enters maintenance mode;
4. deploys the desired Worker through the installed manifest;
5. stages the desired Program, records, tombstones, and media;
6. validates the new generation using the desired runtime;
7. atomically switches the active generation;
8. verifies runtime health, owner authority, and snapshot access;
9. retains the prior generation for bounded rollback;
10. exits maintenance and later garbage-collects superseded data.

Resource reconciliation is not implicit. Missing required infrastructure blocks
replacement until `resources apply` installs it.

A destructive replacement requires a recovery snapshot. A separate explicit
policy may permit disposable targets to skip it; force never implies that
choice, and production policy may prohibit it.

## Force Semantics

| Operation | Force may bypass | Force never bypasses |
| --- | --- | --- |
| Resources | desired-state drift and redundant reconciliation suppression | exact target, canonical state access, provider authority, valid resource configuration |
| Worker | remote Formless, Worker, or Program version comparison | artifact integrity, provider authority, required bindings, valid provider migrations |
| Program | compatibility with the old generation when paired with replacement | desired artifact validity, Worker capabilities, security schema, safe activation |
| Data | old/new schema comparison, diff planning, migration requirements | local input validity, checksums, deployment lease, snapshot prerequisite, security preservation |

Authentication failure, network failure, corrupt input, incomplete upload,
wrong-target protection, and owner-continuity failure remain fatal.

## Provider State And Backups

Alchemy state tracks provider resources and is necessary for safe update and
deletion. It does not contain Program records or media contents.

Non-local targets use canonical remote Alchemy state keyed by stable workspace
and target identity. Apply and destroy use the same Alchemy app, stage,
encryption password, and state scope. Missing canonical state blocks destructive
reconciliation and requires explicit adoption or repair.

The installed resource manifest is separate display-safe deployment state used
by Worker upload and inspection. It is not provider truth or a data backup.

Recovery snapshot policy is supplied by the caller. Exact replacement always
requires a fresh snapshot unless an explicit disposable-target policy permits
otherwise. Private security and provider-secret recovery require independent
protected operational backups.

## Implementation Strategy

### Parallel Clean-Sheet Pipeline

Clean sheet applies to orchestration and public semantics, not every low-level
adapter. The current pipeline remains available only for unadopted targets and
receives no new behavior beyond fixes needed to keep them operable.

The two pipelines may coexist in one CLI release but never mutate one target
concurrently. New commands use final semantic names rather than a temporary
version namespace.

### Package And Runtime Boundaries

| Boundary | Owns | Does not own |
| --- | --- | --- |
| `@dpeek/formless-environment` | target identity, installed manifests, Worker capability manifests, Program generation refs, stage plans and receipts, pure compatibility helpers | CLI commands, provider execution, credentials, Worker routes, Authority mutation, terminal output |
| `@dpeek/formless-archive/recovery` | stable envelope, opaque payload descriptors, integrity facts, format negotiation | portable-archive validation, CLI capture policy, Worker export, storage reads |
| Formless CLI deployment modules | command policy, filesystem effects, provider adapters, operation ordering, terminal wrappers | browser UI, Worker routes, Authority storage |
| Formless Worker and Authority modules | recovery routes, export, security filtering, generation staging, activation, rollback | provider reconciliation, CLI prompts, local workspace writes |

The existing `@dpeek/formless-deploy` package remains legacy while its public
contract is based on schema-owned deployment records. New contracts do not
import it. Obsolete contracts and projections are deleted after cutover.

The Environment package starts with runtime-neutral root contracts only. It
does not add browser, React, client, or provider entrypoints without a concrete
caller.

### Reuse And Quarantine

The new pipeline may reuse narrow leaf capabilities:

- Program materialization and Worker bundling;
- provider credential resolution and Cloudflare API clients;
- individual Alchemy resource declarations;
- admin-bearer and target HTTP transport;
- Authority storage, media object, hashing, and filesystem primitives.

It does not reuse:

- `pushFormlessInstanceWorkspace` or its planning types;
- workspace source comparison and merge behavior;
- desired resource projection from Program records;
- push-owned backup and restore dry-run orchestration;
- current archive parsing during snapshot capture;
- deployment observation writes to Program records.

### CLI Operation Design

Initial implementation exposes explicit use cases instead of a generic workflow
engine:

```ts
captureRecoverySnapshot();
applyTargetResources();
deployWorkerArtifact();
installProgramArtifact();
stageProgramGeneration();
activateProgramGeneration();
replaceTarget();
```

Operation bodies accept explicit dependencies and return structured plans,
progress events, evidence, and receipts. They do not read terminal input, print,
open browsers, or terminate the process. CLI adapters own confirmation and
presentation.

Commands support explicit target selection, non-interactive execution,
machine-readable output, idempotency, and durable evidence. These properties
support CI now and a trusted hosted runner later.

## Pipeline Ownership And Adoption

Each target records one deployment-pipeline owner:

```text
legacy
deployment
```

New targets use `deployment`. Existing targets move through one explicit
adoption workflow:

1. capture a recovery snapshot through the best available ABI;
2. discover provider resources and canonical state;
3. produce a read-only adoption plan with exact resource identities;
4. persist the installed manifest without changing resources;
5. verify Worker capability and no-op deployment plans;
6. record new pipeline ownership;
7. reject subsequent legacy mutation.

A narrow one-time adapter may read legacy Alchemy state or provider truth as
evidence. That state does not become permanent desired input. Adoption becomes
one-way once generation or security storage semantics change. Rollback then
uses the new pipeline.

Preview targets adopt first, followed by development and production. Read-only
plans may be compared between pipelines; mutating shadow deployment is
prohibited.

## Cutover Criteria

Production adoption requires evidence that:

- snapshot capture succeeds without local Program compatibility;
- snapshot records and media can be inspected and migrated;
- Worker-only deployment preserves bindings and target data;
- compatible Program deployment preserves records and media;
- exact replacement preserves owner authentication and authority;
- failed staging leaves the prior generation active;
- generation rollback succeeds;
- resource update and destroy work from canonical remote state;
- adopted targets reject legacy mutation.

After a bounded production observation period, old command bodies,
schema-owned deployment records, obsolete Deploy package contracts, and legacy
tests are removed. No compatibility aliases remain.

## Safety Invariants

- Every operation names one exact target.
- One pipeline owns target mutation at a time.
- Recovery capture does not depend on the local Program or archive parser.
- Recovery includes all replaceable records, tombstones, and application media
  while excluding security and provider secrets.
- Resource, Worker, Program, and data concerns remain independently executable.
- Worker deployment never reconciles provider resources.
- Normal deploy preserves records, media, security, resources, and Alchemy
  state.
- Incompatible Programs activate only with migration or exact replacement.
- Exact replacement begins with a durable snapshot and preserves security.
- Every completed mutation preserves protected owner authentication and
  authority.
- Force never bypasses integrity, security, target, lease, or required-resource
  invariants.

## Change Sequence

1. Landed: isolated recovery contracts, stable Worker discovery and snapshot
   ABI, and opaque CLI capture.
2. Add runtime-neutral target, Worker artifact, capability,
   installed-manifest, plan, evidence, and receipt contracts. Reuse the shared
   target contract from recovery capture without adding provider execution.
3. Add CLI-only resource deployment and canonical remote provider state.
4. Separate the Program artifact from the Worker build and activation path so
   the Worker resolves an independently installed Authority artifact.
5. Add direct Worker code and asset deployment through the installed manifest.
6. Define the security plane and owner-continuity closure, building from stable
   retained-scope classification toward storage separation.
7. Add Program-only deployment and staged Program generations.
8. Add exact record and media replacement, maintenance mode, atomic activation,
   rollback retention, and force policy.
9. Add normal deploy, explicit stage commands, target inspect and destroy, and
   composite exact replacement on the parallel CLI pipeline.
10. Adopt preview, development, and production targets in order; enforce one
   pipeline owner; then remove `push` and obsolete contracts.
11. Define a trusted hosted runner and browser orchestration only after the CLI
    operations and receipts are proven.

The stable recovery snapshot ABI is landed. The recommended next change is the
runtime-neutral deployment contract foundation. It establishes the shared
target and installed-manifest vocabulary required by resource deployment and
recovery without extending the legacy Deploy package.

Direct Worker deployment follows only after resource deployment can publish an
installed manifest and the Program artifact no longer depends on Worker build
injection. That ordering lets Worker upload preserve the active Program,
records, media, security state, provider resources, and Alchemy state.

## Open Decisions

- Define the exact versioned Worker artifact and binding-capability vocabulary.
- Define canonical storage and references for installed manifests and remote
  provider state.
- Define physical security-plane separation and migration from the currently
  classified retained scopes.
- Decide prior-generation retention and garbage collection.
- Decide whether disposable targets may explicitly skip replacement snapshots.
- Define how each provider preserves bindings during direct Worker upload.
- Divide Durable Object code migrations between Worker and resource deployment.
- Choose final CLI nouns for a resolved target versus an environment.
