# Formless Data And Interaction Architecture

Last updated: 2026-07-23

Status: proposal for iteration.

This document defines the intended architecture and semantic contracts for a
schema-as-data application runtime. It is not an implementation plan and does
not prescribe delivery stages, physical databases, transports, UI frameworks,
or deployment providers.

The document is self-contained. Its terms, Interfaces, invariants, failure
model, and conformance requirements are intended to be understandable and
reviewable without reference to an existing Formless implementation.

## Relationship To Current Formless

This proposal is a clean-sheet semantic architecture. The current Formless
implementation and shipped specifications are evidence about product use cases,
failure modes, and operational experience. Their names, storage identities,
record envelopes, cursors, routes, database layouts, browser replicas, Archive
formats, and deployment mechanisms are not requirements of this architecture.

Only semantics stated by this document or adopted by a named Product
Conformance Profile are normative for a conforming implementation. Existing 
behavior is retained only when its product meaning is deliberately restated 
through those contracts, not because its current representation exists.

Compatibility with or cutover from an existing implementation is a separate
transition design. It may consume the identity, lineage, Archive, and recovery
contracts defined here, but it does not constrain their clean-sheet design.

## Document Map

- [Thirty-Second Model](#thirty-second-model) gives the smallest complete
  mental model and a running example.
- [Core Concepts](#core-concepts) and
  [Foundational Invariants](#foundational-invariants) define the language and
  non-negotiable semantics.
- [Definition Authoring And Canonical Compilation](#definition-authoring-and-canonical-compilation)
  defines the trusted TypeScript authoring path and portable artifact.
- [Value, Identity, And Record Model](#value-identity-and-record-model) defines
  portable value meaning, canonical codecs, field identity, and flat records.
- [Common Caller Interfaces](#common-caller-interfaces) defines what renderers,
  custom UX, agents, and headless callers use.
- [Read Semantics](#read-semantics), [Interaction Model](#interaction-model), and
  [Operation Model](#operation-model) define logical behavior.
- [Record Model Evolution](#record-model-evolution),
  [Data Contexts, Authority Partitions, And Authority Scopes](#data-contexts-authority-partitions-and-authority-scopes), and
  [Snapshots, Archives, And Recovery](#snapshots-archives-and-recovery) define
  persistent identity, live change, ownership, placement, and portability.
- [Computed Values And Evaluation](#computed-values-and-evaluation) defines
  lazy deterministic computation and memo validity.
- [Adapter Seams](#adapter-seams) and [Runtime Topology](#runtime-topology)
  define how the same behavior crosses client, server, and command-line
  environments.
- [Deterministic Reference Model](#deterministic-reference-model) and the
  conformance sections define executable proof obligations.
- [Open Design Questions](#open-design-questions) records unresolved public
  contract choices rather than implementation sequencing.

## Purpose

Formless should let humans and agents define an application once and use that
definition through generated UI, custom UI, command-line tools, protocols,
automation, and server-side runtimes.

The definition should be expressive enough for large and specialized
interfaces while retaining strong defaults:

- flat records with lossless typed values and relationships;
- modular trusted TypeScript authoring that emits canonical portable data;
- stable Record Model identity and explicit live Record Model Transitions;
- declarative Reads, projections, and ordered relations;
- lazy, memoized, deterministic computed values;
- typed State, Selection, and explicit Input Bindings;
- domain Operations with authorization, idempotency, conflict, and audit
  semantics;
- renderer-neutral Presentation contracts;
- bounded, granular, asynchronous observation;
- optimistic local feedback reconciled with authoritative commits;
- local, remote, and hybrid data execution without changing logical meaning;
- storage, transport, persistence, and provider Adapters behind explicit
  capability Seams;
- logical data ownership independent of Application Installation and physical
  placement;
- deterministic snapshots, portable archives, and explicit recovery modes;
- deterministic reference Implementations and shared conformance suites.

The default runtime should remove boilerplate. Custom UX should be able to
replace presentation, composition, or specialized behavior at clear Seams
without replacing the data model, Authority invariants, or operation contract.

## Thirty-Second Model

A schema compiles into a typed interaction program. Callers observe immutable
snapshots and dispatch serializable intents. Runtime Modules own evaluation,
state, caching, reconciliation, authorization, effects, and asynchronous
policy. Renderers display Presentation data and translate platform events back
into intents.

```text
Schema-as-data
    |
    v
Compiler ---------> Compiled interaction and data program
                              |
                    +---------+---------+
                    |                   |
             Interaction Host      Data Runtime
             observe / dispatch   observe / invoke
                    |                   |
                    v                   v
              Presentation       Read + Operation
                    |                   |
          generated or custom     Adapter Seams
               renderer          client / server
```

The data model has two primary flows:

```text
Read + Interest -> Observation

Invocation -> Authority decision -> Commit | terminal rejection
                                  |
                                  +-> accepted Commit contains Mutation[]
```

The interaction model composes those flows with local State:

```text
State + Read observations + Input Bindings
    -> atomic interaction evaluation
    -> Presentation snapshots and semantic intents
```

Schema is executable declarative data. It is not an executable renderer tree,
event handler language, physical database schema, or provider query builder.

Trusted authoring and runtime interpretation are separate:

```text
modular TypeScript data definitions
    -> TypeScript structural checking
    -> pure semantic Definition Compiler
    -> canonical Portable Definition + standalone Proposed Record Model Artifacts
    -> immutable Compiled Program
```

The TypeScript source is an authoring convenience. The Portable Definition is
the canonical contract. Runtime semantics never depend on source file layout,
module evaluation, inferred TypeScript types, or arbitrary author callbacks.

Value representation follows the same separation:

```text
Value Shape -> typed runtime value <-> canonical data <-> Adapter storage
                    |
                    +-> Presentation formatting and draft input
```

The compiled Value Shape and its codecs own meaning and conversion. A codec may
use canonical strings for values that JSON and JavaScript numbers cannot
represent exactly, but values are not universally stringly typed and physical
stores may use native types.

A running application is an active Application Installation of a Program over
bound data, not a storage container:

```text
Schema Modules -> Program -> Source Binding Requirements
                                      |
                          Installation resolves
                                      |
                              Source Bindings
                                      |
                     +----------------+----------------+
                     |                                 |
               Data Contexts               external Source Instances
                     |                                 |
            Authority Partitions                    Placement
                     |                                 |
              Authority Scopes                  Source Adapters
                     |
                  Placement
                     |
             Authority Store Adapters
```

### Running example

A project workspace can be described without choosing a renderer, transport,
or database:

```text
projects Read
    -> selectedProject Selection
    -> tasksForProject Read
    -> taskTable Presentation

completeTask Operation
    -> optional local Prediction
    -> authoritative Commit or terminal rejection
```

A renderer obtains compiler-issued references from the Compiled Program
catalog, observes the workspace Surface, and receives an immutable Presentation
snapshot. Selecting a project dispatches a State Transition. Completing a task
dispatches an Operation Intent; Host allocates the Invocation's stable identity
from prefetched bounded capacity and returns its handle. The client may publish a
Prediction immediately; Authority later validates witnessed facts and either
commits a patch to the task record's completion field or returns a terminal
rejection. Runtime rebases remaining Predictions and publishes one atomic next
snapshot. The same trace is valid in-process or across Transport and Authority
Store Adapter Seams.

## Goals

### One mental model

Generated UI, custom UI, clients, servers, command-line tools, tests, humans,
and agents should use the same concepts. Topology may change lifetime and
latency, but it must not change semantics.

### Deep runtime Interfaces

Callers should not coordinate query placement, cache keys, pagination cursors,
network retries, request races, optimistic replay, database transactions, or
sync gaps. Those concerns belong behind small, deep Interfaces with high
Leverage and strong Locality.

### Honest partial knowledge

The runtime MUST distinguish incomplete knowledge, cache state, freshness,
domain deletion, and Relation membership internally. Public observations expose
only distinctions permitted by Read policy. Whole-Read denial is an error;
row-level policy MAY deliberately make forbidden and nonexistent identities
indistinguishable to prevent existence disclosure.

### Bounded work

A bounded UI demand should be satisfiable without materializing an unbounded
relation when an Adapter advertises the necessary capability. Static and
runtime analysis should make unnecessary work avoidable and observable.

### Storage portability

Logical Reads and Operations must not encode SQLite, SQL, HTTP, IndexedDB,
graph traversal syntax, time-series syntax, or provider-specific cursors.
Adapters may optimize aggressively, but they must preserve declared semantics
or reject unsupported requirements.

Logical record identity, ownership, atomicity, and physical placement remain
separate. Moving an intact Authority Scope between conforming Adapters does not
change Program meaning. Splitting an atomic scope is a semantic change and must
be validated as such.

### Portable value fidelity

Each declared Value Type has one portable logical meaning and deterministic
canonical encoding. Runtime, Presentation, Transport, Archive, and physical
storage representations may differ only through compiled codecs and conforming
Adapters that preserve that meaning. Exact decimals, integers, temporal values,
identities, and domain values must not be forced through lossy JavaScript
numbers or provider-specific coercions.

### Evolvable models

An agent should be able to add, rename, retire, or transform model fields and
resources without requiring an application reset. Evolution is an explicit,
versioned, deterministic Record Model Transition with atomic activation. A generated
diff may propose a transition; it never invents ambiguous intent.

### Computation without a second data model

Data-derived values use Reads and Derivations. Reusable interaction-local
values use Computed Values. Both share one deterministic demand graph,
provenance model, invalidation model, and memoization discipline. A cache or
materialization never becomes authoritative merely because it is durable.

### Deterministic verification

The pure data and interaction semantics must be executable through in-memory
reference Adapters. Clocks, identities, scheduling, transport delivery,
failures, and source changes must be controllable so edge cases can be proved
without nondeterministic sleeps or external infrastructure.

### Explicit escape seams

Custom UX should be able to replace rendering, Surface composition,
Presentation projection, specialized Reads, or operation planning one layer at
a time. Each deeper escape assumes explicit responsibilities and retains the
invariants of the Interfaces it continues to use.

## Normative Language

The words MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY describe proposed
contract strength:

- MUST and MUST NOT define correctness or interoperability invariants.
- SHOULD and SHOULD NOT define strong defaults that may be varied only by an
  explicit capability or policy.
- MAY identifies optional behavior whose absence must remain observable.

TypeScript examples are illustrative. The semantic distinctions and
invariants are normative; exact type and field names remain open to refinement.

## Architecture Vocabulary

- **Module**: a coherent capability with an Interface and an Implementation.
- **Interface**: everything a caller must know, including types, invariants,
  ordering, errors, configuration, and performance guarantees.
- **Implementation**: behavior hidden inside a Module.
- **Seam**: where an Interface lives and behavior can vary.
- **Adapter**: a concrete Implementation satisfying an Interface at a Seam.
- **Depth**: Leverage provided behind a small Interface.
- **Leverage**: capability callers receive without reproducing complexity.
- **Locality**: concentration of behavior, knowledge, bugs, and verification in
  one Module.

The Interface is the test surface. A Seam is real when at least two Adapters,
normally an in-memory reference Adapter and a production Adapter, satisfy the
same conformance suite.

## Core Concepts

### Schema-as-data

Portable declarative values that describe an application's data, interaction,
operation, and presentation semantics. Schema-as-data can be stored,
transmitted, validated, compared, generated, and compiled without executing
author-supplied behavior. A trusted TypeScript module may execute once as an
authoring mechanism to emit those values; its code is not part of the portable
artifact or runtime semantics.

### Canonical form

The unique normalized representation used for equality, identity,
fingerprinting, caching, idempotency, and deterministic traces. Values that are
semantically equivalent under their declared type MUST have the same canonical
form.

### Value Type

A portable declaration of one value's logical domain, canonical codec,
equality, hashing, optional ordering, supported semantic operators, constraints,
and resource bounds. Text, boolean, finite floating point, exact integer,
decimal, temporal, enum, identity, reference, bytes, typed atomic structure, and
opaque JSON are distinct Value Types even when several use strings or JSON data
in their canonical encoding.

### Value Shape

A canonical compositional type expression built from Value Types, optional and
nullable positions, records, collections, tuples, and closed tagged variants. 
A structured domain whose members are not independently addressable is one 
atomic Value Type; an addressable composition is a Value Shape. Input, output, 
field, State, effect, and Presentation contracts carry Value Shapes. Compilation 
resolves every leaf to an exact codec and semantic operator version and produces 
the typed runtime contract for the complete shape.

### Canonical Value

The unique portable encoding of a value under one exact compiled Value Shape
and codec version. A Canonical Value is data suitable for deterministic
transport, hashing, persistence, archives, and traces. It is not necessarily the
value representation exposed to typed runtime callers or used by a physical
database. Except where an explicit tagged envelope is declared, canonical data
is interpreted only together with its Value Shape; the same string token may
mean text, an integer, a decimal, or an instant under different shapes.

### Capability

A named, versioned semantic feature that an Adapter or registered extension
may provide, such as rank windows, graph traversal, full-text search, or a
Presentation contract kind. A capability declares reference behavior,
requirements, failure semantics, and conformance obligations. It is not a
provider brand or an unchecked feature flag.

### Product Conformance Profile

A canonical, named, versioned artifact containing capability-availability
guarantees, policy floors, resource bounds, and conformance suites that one
product promises to compatible Installations. The portable architecture may
permit an Adapter to reject unsupported behavior; a Product Conformance Profile
converts selected behavior into a deployment requirement.

```ts
interface ProductConformanceProfile {
  id: ProductConformanceProfileId;
  revision: ProductConformanceProfileRevision;
  requiredCapabilities: readonly CapabilityReference[];
  policyFloors: readonly ProductPolicyFloor[];
  resourceBounds: readonly ProductResourceBound[];
  conformanceSuites: readonly ConformanceSuiteReference[];
}

interface ProductConformanceProfileReference {
  id: ProductConformanceProfileId;
  revision: ProductConformanceProfileRevision;
}
```

The exact profile revision is registered independently and selected by an
Installation Revision. Compatibility means that the deployment satisfies every
profile guarantee and the Program and Installation stay within its policy
floors and bounds. A profile guarantees availability; it never silently enables
anonymous exposure, offline behavior, persistence, or another semantic choice
that the Program and Installation did not explicitly declare. Changing the
selected profile is an Installation change.

Deployment changes that would remove a selected guarantee reject while a
compatible Installation remains active or draining. Unexpected loss of a
guaranteed Implementation is a Product Conformance failure and availability
incident, not ordinary `unsupported` behavior or permission to approximate
semantics.

An active or draining Installation holds a typed Product Conformance Profile retention
reference. The reference keeps the exact profile and required capability
Implementations resolvable; accepted work retaining that Installation Revision
keeps the reference transitively. Release is idempotent and profile retirement
waits for an empty reference set.

Generated administration, support for anonymous Installed Operation Exposures, owned
media, offline execution, or reviewable local workspaces belong in a Product
Conformance Profile when the product chooses to guarantee them. Current
implementation details do not enter a profile unless their product semantics
are deliberately retained.

### Authoring Definition

Trusted data exported by TypeScript modules before stable identity resolution,
semantic validation, and canonical normalization. It may use current qualified
names and modular references for ergonomics. It is never a runtime or transport
artifact.

### Portable Definition

A canonical serialized schema-as-data representation of one exact Program
Revision, describing Schema Modules, record types, Reads, State, Selections,
Computed Values, Operations, Operation Exposure Definitions, Input Bindings,
Presentation, Source Binding Requirements, capabilities, and the exact
`CompilerSemanticsReference` used to normalize and interpret them.

The trusted TypeScript authoring path and Definition Compiler produce a Portable
Definition. Portable Definitions use resolved stable identities and declarative
data. They contain no runtime callbacks, credentials, provider clients,
framework objects, ambient values, or physical query plans. Unqualified
`Definition` in runtime contracts means this portable form.

### Schema Module

A separately authored and composable Program fragment emitted into the Portable
Definition, with stable identity, declared entity-identity namespace and
slot-allocation coordination metadata, and exported logical resources. A Schema
Module may import other modules. It does not own runtime records, security
grants, Authority placement, persistent lineage, or an Application Installation
merely because it declares an entity. Persistent lineage becomes a Data Context
fact only through Record Model activation.

### Program

A logical application composition and identity consisting of Schema Modules,
Reads, Operations, Operation Exposure Definitions, interaction resources,
Presentation, and Source Binding Requirements. A Program's requirements may be
satisfied by private, shared, or external data. Activating or deactivating an
Application Installation does not by itself create, own, export, or delete
every Data Context the Program can access.

Program Identity is the stable logical identity across revisions. Program
Revision identifies one exact canonical semantic composition of that Program.
Changing canonical semantics creates a new Program Revision without changing
Program Identity unless the author explicitly declares a different logical
Program.

Program Revision is the content address of the normalized Portable Definition
payload, excluding its own revision field. The payload embeds the exact
compiler, operator, and capability semantics needed to interpret it. Derived
Compiled Program layout and runtime placement do not participate.

`Authoring Definition -> Portable Definition -> Compiled Program` is the
artifact pipeline for one Program Revision. These are representations of the
same Program semantics, not three additional application concepts.

### Compiled Program

The immutable typed runtime representation derived from an exact Portable
Definition. It contains stable references, normalized types, dependency facts,
capability requirements, and declarative plans interpreted by the reference
runtime or named registered capability Implementations. It contains no embedded
author closure and is not a second canonical portable artifact.

Callers do not hand-author Compiled Programs, dependency manifests, cache keys,
or execution plans.

### Installation activation

Compilation and registration do not make a Program current. Installation
activation is an authorized Installation Catalog fact associating one
Application Installation with one exact Program Revision, Product Conformance
Profile Revision, Source Binding basis, required Record Model Revisions, and
capability versions.

One Application Installation has one active Program Revision unless it
explicitly uses a named multiversion capability. Installation activation does
not implicitly activate or replace a persistent Record Model Revision or mutate
Context Catalog data topology.

### Schema resource

A named declaration inside a Definition, such as a Read, Query Set, Operation,
State declaration, Computed Value, Presentation definition, or Surface
definition. Schema resources have stable identity and compiler-derived Resource
Revision but do not automatically gain record storage, Mutation, deletion, or
synchronization semantics.

### Data Context

A stable logical namespace that qualifies record identity and states data
ownership, lifecycle, retention, and Source Binding policy. A Data Context is not
a Program, Application Installation, database, shard, Authority transaction, or
security grant.

### Authority Partition

A stable logical partition identity inside one Data Context. The unpartitioned
case uses one declared singleton partition. Every stored Record Identity belongs
to exactly one Authority Partition. Authority Partition IDs are never reused,
including after every record and payload in the partition is retired.

At one Context Catalog Revision, the Context Catalog maps each Authority
Partition to exactly one Authority Scope. One Authority Scope may own several
partitions. Trusted composition derives partition identity from declared
semantic affinity at record creation; callers cannot provide an unchecked
partition or Authority Scope as routing data. Partition assignment is immutable
record metadata. Any Field References used to derive it are immutable for that
record under ordinary Mutation.

Regrouping Authority Scopes changes catalog ownership of whole Authority
Partitions, not Record Identity. Its transition closure includes every current
partition in every touched source scope, including partitions whose desired
grouping appears unchanged, because the source scope's history and ledger are
indivisible. The portable core drains and fences every affected source scope,
settles pending Invocations, and establishes new Authority Scope IDs and Epochs
from transferred current records, Record allocation state, non-reuse fences, 
and Record Model lineage. Old Commit IDs, Invocation IDs, ledgers, outbox 
entries, and history remain qualified by the retained source scope; 
terminal-outcome lookup continues there. New work uses the new scope, and 
synchronization consumers bootstrap rather than splicing unrelated orders. 
The retained source scope accepts no new domain Invocation or Commit, but 
remains available for terminal lookup, audit, retention, and completion of 
its existing outbox delivery/status work. If bounded drain policy cannot 
settle accepted Invocations, core regrouping aborts; only the named translation
capability may carry them across.

Record allocation domains move with their Authority Partitions. Regrouping
atomically transfers each live Record lease and its consumed-offset state, or
closes it before publication when lease ownership cannot be preserved.
Invocation allocation domains belong to the prior Authority Scope lineage:
cutover closes and fences every outstanding Invocation lease, invalidates unused
offsets, and requires fresh capacity from the new scope. Already
Authority-acknowledged Invocations settle in the prior scope; an unacknowledged
old-scope Invocation or Prediction is withdrawn and never translated to a new
qualified identity implicitly.

The core never attempts to split one old Commit order, Invocation ledger, or
outbox per partition. A named authority-topology migration capability may
translate history only with an exact, auditable mapping and equivalent
idempotency, effect, and recovery proofs. Dividing one existing Authority
Partition is a separate repartitioning migration that creates new Record
Identities and rewrites affected references; it is not an ordinary scope split.

### Source Instance

One stable logical data instance, such as a particular Data Context entity set,
external product catalog, time series, graph, or search corpus. Source Instance
identity is independent of Program, Source Binding, Adapter, and
physical placement. Several explicit Source Bindings may target the same instance.

### Source Binding

A stable edge from one Program requirement to one Source Instance.
`SourceBindingId` identifies the edge; `SourceBindingRevision` identifies its
exact target and declared semantic routing and coherence requirements. Exact
Authority topology is selected by the retained Context Catalog Basis; the
Source Binding neither owns nor embeds that topology. Editing or rebinding
preserves the Source Binding ID only under explicit catalog policy and always
creates a new revision. It does not expose an Adapter or physical locator.

Distinct Source Bindings never collide by name. They may deliberately target the same
Source Instance. Source-fact reuse then still requires compatible Record Model, Source
Epoch, Read Data Revision, coverage, and Security Partition basis.

### Context Catalog Revision

The exact revision of the authoritative Context Catalog containing Data
Contexts, Source Instances, Source Binding edges, ownership, Authority topology, and
active logical lineage. It is separate from Program, Record Model, Placement, and
Source revisions.

A Context Catalog Basis is the canonically ordered set of exact catalog-entry
revisions on which one decision depends. Ordinary activation compares touched
entries, so an unrelated catalog change does not cause a false conflict. A
whole-catalog operation such as replacement Restore may additionally compare
the exact root Context Catalog Revision.

```ts
interface CatalogEntryBasis {
  kind: CatalogEntryKind;
  id: CatalogEntryId;
  revision: CatalogEntryRevision;
}

type ContextCatalogBasis = readonly CatalogEntryBasis[];
```

### Authority Scope

The domain within which Commit atomicity, Authority Revision, Authority Epoch,
Invocation ledger, constraint enforcement, transactional outbox, and ordered
change history are interpreted. No transaction, total order, snapshot, or
identity equivalence is implied across Authority Scopes.

An Authority Scope owns a catalog-declared set of Authority Partitions. Scope
identity and partition identity are distinct: topology may group or separate
stable partitions without rewriting Record Identity. The Context Catalog
prevents one partition from being current in two scopes. A caller-supplied
semantic value may inform trusted partition derivation, but never directly
selects a scope.

An Authority Scope may be implemented by one process, many physical shards, or
a distributed database only when its Adapter proves the declared atomicity. If
physical partitions cannot provide that atomicity, they are separate Authority
Scopes.

### Placement Revision

A trusted versioned mapping from logical Sources and Authority Scopes, plus
semantic partition keys, to concrete Adapters and physical locators. Placement
is not Definition data. A caller cannot select placement to bypass policy.

### Record Model Revision

The identity of one canonical persistent model: entities, current semantic
field-name catalog, Field Slots, per-entity high-water marks, retired-slot
fences, Value Shapes and codec versions, constraints, and record semantics. It
changes only when persistent model meaning or its active name mapping changes;
Presentation labels and display order are excluded.

### Record Model Artifact

The standalone canonical data required to interpret one exact Record Model
Revision: Entity identities, semantic-name catalog, Field Slots, Value Shapes,
compiled codec references, constraints, high-water marks, retired-slot fences,
and record semantics. It is content-addressed by its Record Model Revision and
is independent of any Program that proposes, uses, or presents that model.

A Program's Portable Definition may carry Proposed Record Model Artifacts or
requirements for registered Record Model Revisions, but Record Model activation
makes a registered artifact part of a Data Context lineage. Authority
Snapshots, transition barriers, Archives, and historical decoders carry or
reference the exact Record Model Artifact; they do not depend on one Program's
Portable Definition to decode records.

A `ProposedRecordModelArtifact` is the compiler's canonical candidate relative
to an exact prior lineage. It has no active data authority. Immutable
registration yields a resolvable `RecordModelArtifact`; activation then selects
that artifact for a Data Context and its Authority Partitions.

### Resource Revision

The compiler-derived semantic revision of one stable Read, Operation,
Predictor, Computed Value, Presentation, State declaration, or other Schema
Resource. Stable Resource ID plus Resource Revision is the exact semantic
identity used for execution and compatibility analysis across a larger Program
change. An author-declared `ContractVersion`, when an external protocol needs
one, is separate and participates in Resource Revision rather than competing
with it.

### Record Model Transition

A canonical, versioned declaration that transforms one exact Record Model Revision to
another, including identity preservation, backfill or transform semantics,
preconditions, retention policy, and verification. A Record Model Transition is the
authoritative migration contract; a structural diff is only a proposal.

### Scope Instance

One runtime instance of a compiled Scope Declaration. Its identity is exactly
the Scope Declaration Identity plus one stable scope key. It never depends on
layout position, current Relation rank, or current parameter values. State,
Computed Values, Presentations, Surfaces, and repeated nodes declare which Scope
Instance they inhabit; the scope is not itself the resource.

A Resource Instance is one stable Resource Identity in one Scope Instance. Its
active semantic basis includes the exact Resource Revision. An evaluation
generation consists of Resource Instance, Resource Revision, and canonical
parameters. Changing parameters therefore reevaluates the same Resource
Instance and retains its State according to declared policy. When parameter
identity must create independent State or lifetime, the author explicitly
derives the stable scope key from those canonical parameters.

### Identity

A stable logical token for a record, relation item, State node, Computed Value,
Read, Operation, Presentation node, or Invocation. A current semantic name may
resolve to an identity but is not the identity. Identities MUST NOT depend on
labels, mutable array position, current rank, rendering order, or random
compilation order.
Field identity is the deliberate exception in form, not in stability: a Field
Slot is an immutable allocated position and never the field's current display
or source position.

### Identity allocation

Record IDs and Invocation IDs in the portable core are opaque encodings of
identities issued from stable allocation domains. Allocation uses finite leases
over monotonically increasing ranges. Each domain has a configured bound on
concurrent leases and total reserved offsets. Issuing a range permanently
advances the domain high-water mark. Public identity semantics expose equality
only; allocation order is not domain order.

While a lease is live, Authority retains its bounded set of consumed offsets.
After closure or expiry, every unconsumed offset in that lease becomes invalid
and the entire range is represented by the allocation high-water fence. A new
identity is valid only when allocated directly by Authority or presented under
a current lease. Lookup of an existing terminal Invocation precedes lease
validation, allowing retained results to replay. After outcome compaction, an
identity from a closed or expired lease rejects as expired.

Record allocation domains are scoped by Data Context, Authority Partition, and
Entity. Invocation allocation has exactly one domain per Authority Scope
lineage, so `(AuthorityScopeId, InvocationId)` is unambiguous. Moving a
partition transfers its Record allocation state atomically. Archives retain
allocation domain identities, high-water fences, and an explicit disposition
for every live lease.

The caller-facing Identity Allocator is a deep Interface over local lease
consumption and replenishment:

```ts
interface IdentityAllocator {
  allocateRecord(domain: RecordAllocationDomainReference):
    | {
        kind: "allocated";
        identity: QualifiedRecordIdentity;
        lease: IdentityLeaseId;
      }
    | { kind: "capacityUnavailable"; issue: DisplaySafeIssue };

  allocateInvocation(scope: AuthorityScopeId):
    | { kind: "allocated"; id: InvocationId; lease: IdentityLeaseId }
    | { kind: "capacityUnavailable"; issue: DisplaySafeIssue };

  replenish(
    request: IdentityCapacityRequest,
    options?: CallOptions,
  ): Promise<IdentityCapacityOutcome>;

  close(lease: IdentityLeaseId): Promise<void>;
}

interface IdentityLeaseProvider {
  acquire(request: IdentityLeaseRequest): Promise<IdentityLease>;
  close(lease: IdentityLeaseId): Promise<void>;
}
```

Record allocation uses a trusted, compiler-issued domain reference after
semantic affinity resolution; untrusted callers never construct a Data Context
or Authority Partition selector. Preparation and interactive dispatch consume
prefetched capacity synchronously. If none is available, preparation returns a
retryable capacity diagnostic; dispatch creates no Prediction, Invocation, or
transport work. Replenishment is explicit asynchronous work and never hides
network waiting inside synchronous
dispatch. Authority Store owns allocation truth; a local Authority or
Transport-backed Adapter implements `IdentityLeaseProvider`.

Lease policy states whether an already consumed offset remains acceptable after
lease expiry. The portable core requires Authority-verifiable consumption before
expiry; an unacknowledged offline Invocation from an expired lease is not
dispatched. An offline-execution capability may instead require non-time-based
finite leases or another verifiable rule, and must specify exhaustion, renewal,
expiry, recovery, and Prediction withdrawal.

A named extension may accept arbitrary caller-chosen identity strings only when
it retains an exact non-reuse set. Such
an extension cannot advertise bounded identity-fence storage.

### Field Slot

An immutable, monotonically allocated entity-local field identity. A complete
Field Reference is `(Entity Identity, Field Slot)`. Slots are seeded by the
initial explicit field sequence, preserved by Record Model lineage, and never
renumbered or reused. Current semantic name and display order are separate.
A Field Slot is not a physical column offset, runtime array position, display
position, or current source position.

### Record

A stored entity instance with qualified Record Identity, Entity Identity, a
flat Field Slot vector interpreted under exact Record Model Revision, and the
explicit Record envelope metadata defined below. Stored records remain flat.
References are stored as identities, not nested records.

Computed Read results MAY be structured. Structured output is a projection; it
does not change flat storage semantics.

### Row

One identified item in a Relation. A Row may represent a projected record,
relationship edge, graph path, time bucket, metric sample, aggregate group,
search result, or other derived value. Row identity need not equal record
identity.

### Relation

A logical set of identified Rows with declared ordering semantics. A Relation
is not an array of currently loaded Rows, a page, or a window.

### Read

A typed, serializable description of a logical scalar, optional value,
aggregate, structured value, or ordered Relation. A Read describes meaning,
not storage location or execution placement.

### Bound Read

A Read Definition with canonical input values and a resolved output contract.
It identifies logical meaning but not actor authority, cache placement,
Interest, or a physical execution plan.

### Read Execution Context

Trusted actor, tenant, policy revision, security partition, and environment
facts supplied by an authoritative composition root. Untrusted callers cannot
construct or choose trusted context. It participates in authorization and
cache partitioning without becoming caller-controlled Read input.

Security Partition Identity is an opaque derived identity for facts that may be
reused together. It changes when actor, tenant, policy, credential state, or
another authorization dimension makes reuse unsafe; it never contains raw
credentials.

### Source

A logical leaf used by a Read, such as an entity record set, schema resource
set, time series, search index, or graph. Source identifies semantics and
capabilities. It does not name a physical database or transport.

A Source Definition describes the logical kind. A Source Instance identifies
the particular data. A Source Binding connects a Program requirement to that
instance.

Source is not a separate UI observation model. UI observes Reads.

### Query

A named Read Definition whose output is normally a logical Relation. Query is
not synonymous with a Source, loaded result, table, operator, or provider query
syntax.

### Derivation

A deterministic pure node or operator inside a Read program that computes a
value from declared inputs. A reusable Derivation may be named, but observation
always targets the enclosing Read; Derivation has no separate lifecycle.
Naming exists for compiler identity, sharing, and diagnostics. A publicly
reusable data computation is a Read.

### Computed Value

A named, typed, immutable, unsettable, pure interaction value derived from
State, Selection, environment inputs, Read outputs, or other Computed Values.
It exists only when a non-visual result must be reused by several Input Bindings or
observed directly. Internal Derivations remain private; the enclosing Computed
Value owns lifecycle, errors, scope, and observation.

### Interest

The bounded portions of a Read result currently required by a caller. Interest
may request windows, membership proofs, or extent facts. It does not alter the
logical Read.

### Observation

A lease over a coherent, versioned answer to a Bound Read and Interest.
Observations provide synchronous immutable snapshots while resolution may be
asynchronous.

### Observable Reference

A compiler-issued typed handle to a State, Selection, Computed Value,
Presentation, Surface, or derived subprojection that the Interaction Host can
observe. Raw Read
observation uses a Bound Read through Data Runtime so its Read Data Revision,
freshness, coverage, and satisfaction remain explicit. An Observable Reference
is opaque to callers, stable across equivalent compilation, and contains no
cache key, provider cursor, or runtime callback. It records its issuing Program
Revision and exact Resource Revision; reuse across Programs requires an
explicit compiler compatibility proof.

### State

A named, typed, runtime-owned interaction value with scope, initialization,
reset, and optional persistence policy. State is not a domain record, URL value,
renderer-local variable, or storage row.

### Selection

State containing zero, one, or many identities constrained by a declared
selection domain. A data domain proves membership through a selectable Read. A
schema-resource domain proves membership through a compiled resource set.
Selection reuses State mechanics and adds domain-specific membership
reconciliation.

### Input Binding

An explicit typed edge from a literal, environment input, State value,
Selection value, or Read output to a declared consumer input. An Input Binding
owns no fallback, transformation, callback, lifecycle, or effect behavior.

### Intent

A serializable request emitted by Presentation. An Intent either requests a
local State Transition or invokes a domain Operation. Intent is not a callback,
Mutation, Commit, or proof of authorization.

### State Transition

A canonical local transition over interaction State. It validates and applies
State policy, reevaluates affected graph nodes, reconciles dependent Selection,
and publishes one atomic interaction revision. It does not write domain records
or enter Authority audit.

### Operation

A named request for an authoritative domain decision with typed input and
output, actor policy, authorization, planning, idempotency, concurrency, audit,
and effect semantics. It may mutate current state, enqueue external-effect
intents, or accept without record changes.

Finite retrieval uses Read observation or finite Read resolution. An audited
command that returns data without changing records accepts through an empty
Commit.

### Operation Exposure

A declarative association defining how an Operation may be made reachable
through a Surface, protocol route, command-line command, automation trigger, or
another named channel. It declares channel-specific input projection,
challenge or origin policy, response projection, and trusted invocation-source
facts. An Operation Exposure Definition becomes reachable only when an active
Installation Revision selects it as an Installed Operation Exposure. Exposure
does not grant authorization and is not an Input Binding or Source Binding.

An Operation Exposure Definition is a Program-owned Schema Resource with stable
`OperationExposureId` and exact Resource Revision. Installation activation
selects that definition plus channel-specific route and challenge policy to
produce an `InstalledOperationExposureRevision`. The latter is the exact reachable
association retained in Invocation Source Basis; it never changes the Program
definition in place.

### Invocation Source Basis

The canonical trusted basis under which one Invocation became reachable and was
prepared. It identifies the exact Application Installation and Installation
Revision, selected Product Conformance Profile Revision, channel kind, optional
Installed Operation Exposure Revision, and compiler-declared canonical trusted
source facts used by policy.

```ts
interface InvocationSourceBasis {
  installation: ApplicationInstallationId;
  installationRevision: InstallationRevision;
  productConformanceProfile: ProductConformanceProfileReference;
  channel:
    | "installedInteraction"
    | "protocolRoute"
    | "commandLine"
    | "trustedAutomation";
  operationExposure?: InstalledOperationExposureRevision;
  trustedFacts: CanonicalInvocationSourceFacts;
}
```

Trusted composition constructs this basis after route, origin, challenge, and
channel validation. An untrusted caller may present channel input but cannot
assert trusted facts. Protocol, command-line, and automation reachability
requires the exact selected `operationExposure`. An installed interaction may
omit it only when reachability comes directly from a Presentation Intent in the
same active Installation; if that interaction uses an exposure, it carries the
revision too. Canonical trusted facts contain policy results such as validated
channel and origin class, never credentials, raw challenge proofs, or secrets.
Authorization remains separate.

### Invocation

One logical request to execute an Operation, which may be delivered or retried
many times. Its creator supplies an Authority-issued Invocation identity or one
from a current finite lease, plus Operation identity, exact Resource Revision,
and canonical input. Trusted preparation resolves exact Invocation Source Basis,
Source Binding, Authority Scope, and expected Authority Epoch. Host creates
identity at Intent dispatch; headless callers use an Installation-scoped
`InstallationBinder`. Authority
associates authenticated actor and security context after receipt; untrusted
callers never supply trusted actor context.

Qualified Invocation Identity is `(Authority Scope ID, Invocation ID)`. Local
Invocation IDs may repeat in different Authority Scope allocation domains without collision;
every ledger, retry, settlement, and audit uses the qualified identity.

### Prediction

An optional pure local interpretation of an Invocation used to provide
optimistic feedback. A Prediction is not authoritative validation or a Commit.

### Mutation

An internal current-state effect planned by an authoritative Operation. Core
record Mutations are create, patch, and delete. Presentation and ordinary
callers never construct Mutations.

### Commit

One immutable, authoritative, atomic accepted batch containing Mutations,
semantic output, audit facts, and durable external-effect intents. A Commit is
current-state evidence, not necessarily an indefinitely retained event-source
history.

Qualified Commit Identity is `(Authority Scope ID, Commit ID)`. Any globally
derived identity, including Effect Identity, includes the qualified form.

### Authority

The trusted runtime context that authenticates actors, authorizes and plans
Operations, validates authoritative facts, creates Commits, and owns terminal
Invocation outcomes. Authority describes responsibility and invariants, not a
particular process, database, or deployment primitive.

Every core authoritative decision and Commit settles in exactly one Authority
Scope without exception. A distributed database spanning physical shards may
implement one logical scope only when it provides one atomic transaction,
ledger, revision order, and change history. Work across independently
revisioned scopes is a workflow or separately named distributed-authority
algebra, not a core Commit.

### Snapshot

A machine-oriented capture of one Source or Authority Scope with exact declared
epoch, provenance, continuation, and coherence claims. An Authority Snapshot is
coherent at one Authority Revision; an external Source Snapshot or Capture
claims only the coherence its Adapter proves. Snapshots support bootstrap,
synchronization, migration, rebalance, recovery, and deterministic tests. A set
of independent Snapshots is not one global instant.

### Portable Archive

A canonical, reviewable, hashable artifact containing selected Snapshots plus
Record Model provenance, Data Context ownership, Source Binding topology, capability and
codec requirements, and explicit treatment of external dependencies. It is a
logical state-transfer format, not necessarily an exact physical backup.

### Presentation

A Presentation Definition declares a pure projection from resolved interaction
and data facts. It produces a versioned renderer-neutral Presentation Contract.
A compiler-issued Presentation Reference addresses one runtime instance, and a
Presentation Snapshot is its immutable observed value. Snapshots contain
display-safe data and semantic Intents, not runtime callbacks or provider
handles.

### Surface

A Surface Definition composes Presentation References and layout facts. A
Surface Snapshot is the immutable observed composition for one Scope Instance.
Surface determines arrangement, not data meaning, evaluation order, or
Operation policy.

## Foundational Invariants

- **INV-01 — Placement equivalence.** The same canonical logical state, Bound
  inputs, Interest, Program, Resource, Record Model, Source Binding, Security
  Partition, and declared capability basis produces observationally equivalent
  results across conforming Adapters, Read execution placement, and physical
  storage placement.
- **INV-02 — Explicit influence.** Ambient time, randomness, locale, actor,
  and environment facts influence evaluation only through declared canonical
  inputs or trusted execution context. Trusted context participates in
  authorization and cache partitioning without becoming caller-controlled
  Read input.
- **INV-03 — Flat authority state.** Stored records remain flat. Rich
  structures are composed in Read, projection, Presentation, or Operation
  layers.
- **INV-04 — Stable relation semantics.** Every ordered Relation has stable
  Row identity and deterministic total ordering.
- **INV-05 — Honest knowledge.** Unknown is never represented as absent,
  empty, exhausted, deleted, or exact.
- **INV-06 — Interest independence.** Changing Interest changes materialized
  coverage, not logical membership or ordering.
- **INV-07 — Atomic publication.** One runtime transition publishes one
  coherent immutable revision before notifying observers.
- **INV-08 — Generation safety.** Obsolete asynchronous results never
  overwrite a newer request generation.
- **INV-09 — Explicit capability failure.** Unsupported semantics are
  rejected explicitly rather than approximated silently or satisfied by an
  undeclared unbounded scan.
- **INV-10 — Authoritative security.** Trusted execution reauthorizes every
  Read and Operation. UI availability and static analysis are not security
  decisions.
- **INV-11 — Invocation singularity.** One qualified Invocation identity produces at
  most one authoritative terminal outcome and at most one Commit.
- **INV-12 — Atomic acceptance.** A Commit applies all of its Mutations or none
  and stores its terminal Invocation outcome atomically.
- **INV-13 — Overlay separation.** Optimistic Predictions never enter
  committed state or advance committed synchronization position.
- **INV-14 — Gap honesty.** Snapshot plus subsequent change delivery is
  gap-free or explicitly resets.
- **INV-15 — Partition-safe reuse.** Cache, memo, materialization, and result
  reuse never cross incompatible security partitions, semantic fingerprints,
  Source Bindings, epochs, revisions, coverage, overlays, or logical Reads.
- **INV-16 — Caller equivalence.** Generated and custom callers using the same
  references, Interest, trusted context, and Intent trace receive the same
  semantic facts and Operation outcomes.
- **INV-17 — Renderer neutrality.** Renderer replacement cannot change runtime
  semantics.
- **INV-18 — Extension accountability.** Every public semantic extension has
  deterministic reference behavior, dependency facts, capability declarations,
  and conformance tests.
- **INV-19 — Stable field slots.** A field is identified by Entity Identity and
  immutable Field Slot. Allocated slots are never renumbered, reassigned, or
  reused, including after retirement or erasure.
- **INV-20 — Atomic Record Model activation.** One Authority Scope exposes exactly one
  active Record Model Revision at a time. A failed or partial transition never becomes
  externally current, and every accepted Commit appears exactly once across
  cutover.
- **INV-21 — Logical placement independence.** Record, Source, Data Context,
  and Authority Scope identity do not depend on Application Installation, Adapter,
  database, shard, or physical locator.
- **INV-22 — Honest authority scope.** No core transaction, Commit, order,
  uniqueness, or referential integrity spans independently revisioned Authority
  Scopes. A coordinated multi-scope Snapshot or separately named distributed
  algebra states its weaker or stronger semantics explicitly.
- **INV-23 — Derived equivalence.** For exact and incremental-equivalent
  capabilities, local, remote, incremental, and full recomputation publish the
  same value and provenance claims under the same basis. Memo state may change
  permitted lifecycle timing and work, but never the value, provenance,
  freshness, coverage, or issue claim of a published snapshot. Approximate
  capabilities conform instead to their declared deterministic representation,
  precision, error bound, merge algebra, and provenance contract.
- **INV-24 — Archive truthfulness.** Every Archive states its exact lineage,
  consistency, external-dependency, and restore claims. Restore cannot permit
  retired Record, Field, Commit, or Invocation identity reuse or replay a
  delivered external effect as new.
- **INV-25 — Demand-bounded evaluation.** Required evaluation is limited to the
  dependency closure of active Observations, explicit prefetch or offline pins,
  active Prediction/reconciliation work, in-flight Intent or Operation input
  resolution, and declared background demand policies. Unobserved unrelated
  graph branches require no work.
- **INV-26 — Context lineage locality.** One Authority Scope belongs to exactly
  one Data Context. One Data Context may contain many scopes, and many Programs
  may bind the same context. Every Record belongs to exactly one Authority
  Partition, and every Authority Partition maps to exactly one Authority Scope
  at one Context Catalog Revision.
- **INV-27 — Atomic catalog activation.** One Context Catalog change publishes
  one complete Context Catalog Revision or none. Stale touched-entry bases,
  unauthorized, duplicate, and fingerprint-reused changes cannot publish a
  partial graph.
- **INV-28 — Value fidelity.** A logical value has one meaning and one
  deterministic canonical form under its exact Value Shape and codec version.
  Runtime, Presentation, Transport, Archive, and physical storage
  representations never change equality, ordering, validation, operator,
  absence, null, precision, or resource-bound semantics.
- **INV-29 — Bounded identity allocation.** A new Record or Invocation identity
  is accepted only from Authority allocation or a valid bounded lease. Domain
  high-water state never rewinds, retired identities never become new, and
  configured concurrent-lease and reserved-offset bounds are enforced.
- **INV-30 — Installation coherence.** One active Installation Revision
  atomically selects one Program Revision, Product Conformance Profile, Source
  Binding and Context Catalog basis, exact per-binding and per-scope Record
  Model basis, routes, Presentation policy, Installed Operation Exposures, and
  grants. Every selected revision remains resolvable while a
  typed use reference exists.
- **INV-31 — Authority regrouping honesty.** Regrouping Authority Partitions
  starts new Authority Scope lineages and retains prior qualified history. Core
  topology change never splits or relabels one Commit order, Invocation ledger,
  or outbox as partition-local history.

## Module Architecture

The semantic Modules are runtime-agnostic and may live in a standalone package.
Their public Interfaces depend only on canonical data, deterministic pure
functions, async lifecycle contracts, and Adapter Interfaces. Client, server,
CLI, React, Worker, SQLite, and provider Implementations depend inward on them.

### Definition Module

Owns:

- trusted TypeScript authoring types and local inference helpers;
- the canonical portable Definition representation;
- stable schema-resource identities;
- modular composition contracts;
- declaration-level diagnostics emitted by TypeScript.

It does not own live State, I/O, authorization, physical storage, or rendering.
It does not maintain a second hand-written structural parser for trusted
TypeScript definitions.

### Compiler Module

Owns:

- type, entity, cardinality, and scope inference;
- canonical Definition emission and semantic validation;
- Entity Identity and Field Slot allocation against exact Record Model lineage;
- canonical Read and interaction plans;
- stable semantic node fingerprints;
- explicit dependency graph construction;
- cycle and unresolved Input Binding diagnostics;
- capability requirements;
- dependency manifests for static analysis;
- stable, inspectable explanations of compiled plans.

Compilation is pure and deterministic. Equivalent declaration ordering MUST
produce equivalent compiled output unless order is explicitly semantic. The
initial explicit field-allocation sequence is semantic; the default ordered
field-list helper may supply it. Incidental object, module, source-display, and
Presentation ordering never allocates or reallocates Field Slots.

The Compiler does not trust TypeScript casts, `any`, getters, exotic objects,
or environment-dependent module output. It accepts only canonical data and
proves referential, graph, capability, identity, evolution, and portability
invariants that the TypeScript type checker cannot prove.

### Program Registry Module

Owns immutable Compiled Program registration, exact Resource Revision
resolution, installation eligibility, Program retention state, and exact
semantic-use references. It proves that
every Resource and registered capability required by a candidate Program is
available before activation.

It does not own Data Context records, persistent Record Model constraints,
Source Bindings, routes, grants, or installation policy. The Installation
Catalog selects registered Program Revisions; the Context Catalog owns data
topology.

```ts
interface CompiledProgramBundle {
  portableDefinition: PortableDefinition;
  compiledProgram: CompiledProgram;
  compatibility: CompatibilityManifest;
}

interface ProgramRegistry {
  register(bundle: CompiledProgramBundle): ProgramRegistrationOutcome;
  resolve(revision: ProgramRevision): CompiledProgram | UnavailableProgram;
  retain(request: ProgramRetentionRequest): ProgramRetentionAcquireOutcome;
  release(reference: ProgramRetentionReferenceId): ProgramRetentionReleaseOutcome;
  transitionRetention(
    change: ProgramRetentionChange,
  ): ProgramRetentionOutcome;
}
```

The Definition Compiler produces the bundle. Registration validates canonical
identity, the exact Portable-to-Compiled linkage, compiler and capability
availability, and compatibility evidence; the Registry never invokes the
Compiler or changes its output. Registration is content-addressed and
idempotent. Registry state is
`registered`, `retained`, or `retired`. `registered` is eligible for new
Installations. `retained` accepts no new Installation but remains resolvable.
`retired` is unavailable.

Every Installation, accepted Invocation, active Observation, Archive, and
historical decoder that needs exact Program semantics acquires a typed
`ProgramRetentionReference`; durable work records that reference atomically
before becoming visible. The reference transitively retains the exact Portable
and Compiled artifacts plus every compiler, codec, operator, and capability
Implementation required by that Program Revision, including requirements not
guaranteed by its Product Conformance Profile. Release is idempotent and auditable. Retention
transitions are authorized and compare-and-set; retirement succeeds only when
the complete reference set is empty. This reference Interface makes semantic
obligations inspectable rather than inferred from process-local activity.

### Value Module

Owns the portable Value Type algebra; canonical codecs; equality, hashing, and
ordering semantics; semantic operator contracts; resource limits; and
path-aware diagnostics. It compiles each declared Value Shape into one typed
runtime codec used consistently by Input Bindings, Reads, Operations, State,
Transport, Archives, and Adapter validation.

The Module separates logical meaning from representation. It does not prescribe
database columns, localized display formatting, form-draft text, or one
JavaScript representation for every type. Built-in types have pure reference
Implementations. A custom Value Type is a named versioned capability with the
same deterministic reference behavior and conformance obligations; Definition
data cannot install an inline JavaScript codec.

### Record Model Evolution Module

Owns pure change analysis, explicit Record Model Transition validation, compatibility
proofs, deterministic transformation, activation preconditions, and transition
diagnostics. A provider-specific Record Model Evolution Adapter may perform physical work,
but the common Interface owns identity, atomic visibility, replay, and failure
semantics.

### Record Model Registry Module

Owns immutable Record Model Artifact registration, exact-reference resolution,
and typed retention. Registration is content-addressed and idempotent. It does
not activate a model or own records: Data Context lineage and Authority model
activation select registered artifacts.

```ts
interface RecordModelRegistry {
  register(candidate: ProposedRecordModelArtifact): RecordModelRegistrationOutcome;
  resolve(reference: RecordModelArtifactReference):
    | RecordModelArtifact
    | UnavailableRecordModelArtifact;
  retain(request: RecordModelRetentionRequest): RecordModelRetentionAcquireOutcome;
  release(reference: RecordModelRetentionReferenceId): RecordModelRetentionReleaseOutcome;
}
```

Active Data Context lineages, pending transitions, Authority history barriers,
Snapshots, Archives, and historical decoders hold typed retention references.
Retirement requires an empty complete reference set or an explicit complete
translation. A transition never points at an artifact that can disappear
between validation and activation.

### Context Catalog Module

Owns the authoritative Context Catalog: Data Context and Source Instance
identity, Source Bindings, Authority Partitions and scope topology, ownership
and lifecycle facts, Context Catalog Revision, compare-and-set activation, and
observation. It does not
infer ownership from Read access or Application Installation.

### Installation Catalog Module

Owns Application Installation identity, active Installation Revision, routes,
presentation policy, Installed Operation Exposures, grants, exact Program
Revision, and complete Source Binding, Record Model, Context Catalog, and
Product Conformance Profile basis. Installation
change is authorized, compare-and-set, idempotent, auditable, and observable.

It does not own Program artifacts, Data Contexts, Authority topology, or
physical placement. It may coordinate requested Context Catalog changes, but an
installation is not itself Context Catalog data.

### Installation–Record Model Coordination Module

Owns durable fencing across Installation Catalog publication and Authority
Record Model activation. It serializes every overlapping change against exact
Installation, Authority Epoch, active Record Model, and Context Catalog bases;
it does not own any of those facts.

```ts
interface InstallationRecordModelCoordinator {
  acquire(
    request: InstallationRecordModelCoordinationRequest,
  ): InstallationRecordModelCoordinationAcquireOutcome;
  release(
    fence: InstallationRecordModelCoordinationFence,
  ): InstallationRecordModelCoordinationReleaseOutcome;
}

interface InstallationRecordModelCoordinationFence {
  id: InstallationRecordModelCoordinationFenceId;
  fencingToken: MonotonicFencingToken;
  installationBasis: readonly InstallationRevisionBasis[];
  authorityModelBasis: readonly AuthorityRecordModelBasis[];
  contextBasis: ContextCatalogBasis;
}
```

Every Installation change and Record Model Transition Execution carries one
such fence. The Installation Catalog and Authority Store validate the same
current fencing token immediately before their own compare-and-set. Acquiring a
fence excludes an overlapping acquisition; recovery may supersede a failed
owner only with a higher durable token, so delayed work from the prior owner
rejects. A multi-step core cutover may expose intentional downtime while it
holds the fence. Atomic publication across both owners remains a separately
proved coordinated-control-plane capability.

### Product Conformance Profile Registry Module

Owns immutable Product Conformance Profile registration, exact revision
resolution, compatibility evaluation, conformance evidence, and typed retention
of the profile plus every capability Implementation needed to honor its
guarantees. It does not activate capabilities or Program behavior. Installation
activation selects and retains one registered profile revision and proves that
the deployment satisfies it.

### Identity Allocation Module

Owns caller-side bounded lease pools, synchronous Record and Invocation
allocation from prefetched capacity, asynchronous replenishment, expiry and
close handling, and allocation availability. Authority Store owns allocation
truth and high-water fences; a local or Transport-backed Identity Lease Provider
crosses that Seam. The Module does not invent caller-selected identities or
weaken non-reuse policy.

### Placement Module

Owns trusted binding of logical Sources and Authority Scopes to Adapters under
one Placement Revision. It enforces semantic affinity, single-writer movement,
capability requirements, and physical-locator secrecy. It does not redefine
record identity, authorization, or Authority atomicity.

### Archive Module

Owns canonical Snapshot and Archive manifests, deterministic chunking and
hashes, dependency classification, restore-mode validation, and lineage rules.
Provider backup and computation-checkpoint Adapters remain distinct from the
portable Archive Interface.

### Data Runtime Module

Owns:

- Read observation;
- Interest management and lease sharing;
- Source-fact cache identity, coverage, and invalidation;
- instantiated Read evaluation graphs and demand-driven scheduling;
- Read and Derivation memo validity;
- local, remote, and hybrid Read execution placement;
- request generations, retries, and cancellation races;
- optimistic not-yet-incorporated Invocation overlay;
- authoritative Commit ingestion and rebase;
- atomic data publication.

It does not own Surface layout or renderer behavior.

### Interaction Runtime Module

Owns:

- scoped State;
- Selection candidate and membership resolution;
- Computed Value evaluation and interaction-local memo validity;
- typed Input Binding evaluation;
- local State Transitions;
- dirty dependency evaluation;
- State persistence effects;
- atomic interaction publication;
- projection into Presentation references.

It consumes the Data Runtime Interface rather than assuming a full local
replica.

### Authority Runtime Module

Owns:

- Operation resolution;
- authenticated actor context;
- authorization and field policy;
- input validation;
- deterministic planning over witnessed facts;
- conflict and retry policy;
- Commit attempts and terminal outcomes;
- audit projection;
- external-effect outbox intent.

It does not expose physical transactions, SQL, or provider syntax to Operation
planners.

### Effect Delivery Module

Owns durable outbox claiming, bounded concurrency, retry and backoff,
same-identity delivery, canonical status, and reconciliation after uncertain
provider outcomes. It calls the External Effect Interface only after the
originating Commit is durable.

It does not plan Operations, mutate committed records, promise exactly-once
transport, or treat provider success as part of Commit atomicity.

### Presentation Module

Owns:

- renderer-neutral contracts;
- typed references to Surface, section, result, and control snapshots;
- availability, progress, display-safe issue, and accessibility facts;
- semantic Intent schemas;
- atomic reference-scoped publication semantics.

Presentation does not expose schema syntax, raw storage records, cache keys,
provider cursors, credentials, runtime callbacks, or effect implementations.

### Renderer Module

Owns platform rendering, accessibility implementation, interaction affordances,
and translation of platform events into declared Intents.

Renderer does not evaluate Reads, reconcile Selection, mutate State, authorize
Operations, or access storage.

### Composition root

Binds one Program's logical requirements to Data Contexts, Source Bindings,
Authority Scopes, security grants, one Product Conformance Profile, registered
capabilities, Placement Revision, and concrete Adapters for one runtime
topology. It does not infer ownership or redefine primitive semantics.

At minimum, capability resolution separates pure metadata used by compilation
from trusted runtime Implementations:

```ts
interface CapabilityRegistry {
  describe(reference: CapabilityReference):
    CapabilityDescriptor | UnsupportedCapability;

  resolve<T extends CapabilityInterface>(
    reference: CapabilityReference<T>,
  ): T | UnsupportedCapability;
}

interface ProductConformanceProfileRegistry {
  register(profile: ProductConformanceProfile): ProductConformanceProfileRegistrationOutcome;

  retain(request: ProductConformanceProfileRetentionRequest):
    ProductConformanceProfileRetentionAcquireOutcome;

  release(reference: ProductConformanceProfileRetentionReferenceId):
    ProductConformanceProfileRetentionReleaseOutcome;

  resolve(reference: ProductConformanceProfileReference):
    | ProductConformanceProfile
    | UnavailableProductConformanceProfile;

  evaluate(request: ProductConformanceProfileCompatibilityRequest):
    ProductConformanceProfileCompatibility;
}
```

Definition data may select a registered identity, version, and declarative
configuration. It cannot register executable code. Compilation records the
descriptor and exact version; runtime resolution MUST match it. A registry
entry advertises only capabilities proved by its conformance evidence.

### Testkit Module

Owns deterministic reference Implementations, scripted Adapters, trace runners,
Record Model and Value Type generators, conformance suites, work counters, and
invariant assertions.
It does not contain production-only policy.

### Runtime flow

```text
TypeScript data -> Definition Compiler -> Portable Definition -> Compiled Program
                                                                  |
                                Program Registry + Product Conformance Profile Registry
                                                                  |
                                Application Installation + Source Bindings
                                                                  |
                                                Data Context + Placement
                                                                  |
                         +------------------------+---------------+--------------+
                         |                        |                              |
                Interaction Runtime       Read Execution                Authority Runtime
                         |                        |                              |
                  Presentation             Source Adapters               Authority Store
                         |                                                       |
                     Renderer                                            durable outbox
                                                                                 |
                                                                        Effect Delivery
```

The arrows show runtime information flow, not source-code dependency. Core
Modules depend on Interfaces, not concrete Adapters. Provider and platform
Implementations depend inward on the contracts they satisfy.

## Definition Authoring And Canonical Compilation

### Trusted TypeScript authoring

TypeScript is the default trusted Authoring Definition language. A definition
module exports data and may import separately typed fragments. TypeScript checks
well-typed source at authoring time. One compiler-owned canonical
data normalizer rejects values outside the allowed data-only domain, and one
versioned codec decodes Portable Definition artifacts. Cross-resource semantic
validation remains in the Compiler. There is no handwritten field-by-field Zod
mirror or second schema implementation for the trusted authoring contract.

An illustrative fragment may look like:

```ts
export const tasks = defineSchemaModule({
  name: "tasks",
  entities: [
    {
      key: "task",
      ...defineEntity({
      fields: [
        field("title", text({ required: true })),
        field("completed", boolean({ default: false })),
      ],
      }),
    },
  ],
} satisfies SchemaModuleAuthoring);
```

The exact helper syntax is not normative. The important properties are:

- exported values are primitives, canonical scalar values, arrays, records,
  and symbolic references understood by the Definition Compiler;
- Value Type helpers emit data-only descriptors; they do not install runtime
  constructors, JavaScript coercions, or executable codec callbacks;
- exact integer, decimal, temporal, and other non-JavaScript literals are
  authored through canonical strings or data-only helpers; the Compiler rejects
  a JavaScript number where evaluation may already have lost the declared
  value;
- modules may compose without requiring one enormous literal;
- every Entity Identity has exactly one declared slot-allocation coordinator;
  imported modules extend it only through an explicit serialized extension
  contract;
- callbacks, getters, classes, closures, provider clients, credentials,
  mutable runtime handles, and environment-dependent values are forbidden;
- computation expressions compile to declarative operators or named versioned
  capability references, never embedded TypeScript functions;
- labels and documentation may widen to ordinary strings while identity names,
  discriminants, field value types, and Operation input/output types retain
  useful local inference.

The preferred authoring style uses `satisfies` on modular fragments and const
generic helpers where they improve local inference. It does not require one
deeply `as const` application object. Whole-program literal inference is not a
portability or correctness requirement; generated bindings or a compiler-issued
type catalog may expose precise application types after compilation.

### Validation responsibilities

The TypeScript compiler checks the structural contract visible in well-typed
source. It cannot prove the emitted value or runtime and cross-resource
semantics because casts, `any`, imported code, and module evaluation may bypass
static checking. The pure Definition Compiler remains authoritative for:

- canonical data and serializability;
- Value Shape resolution, codec availability, and canonical value semantics;
- duplicate and unresolved identities;
- entity, field, reference, scope, and cardinality compatibility;
- legal dependency graphs and cycle diagnostics;
- capability availability and version compatibility;
- Record Model Transition and Field Slot lineage validity;
- authorization, constraint, Operation, and Presentation contract coherence;
- deterministic canonical fingerprints.

This semantic compilation is not a second general-purpose schema parser.
The Value Module compiles field and value codecs that validate data crossing
Authority Store, Source, Transport, Archive, persistence, and untrusted caller
Seams. Those runtime values remain untrusted even when the Authoring Definition
that produced their codecs came from trusted TypeScript. Codec generation follows the
declared Value Shapes, so it does not require a parallel handwritten Zod model.

An optional future untrusted-definition Module decodes unknown portable input
into the same canonical Portable Definition contract. It never evaluates submitted
TypeScript and does not change compiler semantics.

### Portable artifact and reproducibility

Authoring Definition compilation produces a canonical Portable Definition and
standalone Proposed Record Model Artifacts before deriving the executable
Compiled Program. The Portable Definition contains resolved Program identities,
types, declarative programs, requirements, and registered capability references.
Proposed Record Model Artifacts describe candidate persistent lineage but own no
active data. Neither contains TypeScript source or executable closure.

Program Revision hashes canonical semantics. It does not hash whitespace,
comments, source file paths, module layout, incidental object property order,
or the size and shape of inferred TypeScript types. Explicit ordered sequences,
Field Slots, operator order, capability versions, and other semantic order do
participate.

The same source inputs, prior Record Model lineage, compiler semantics, and capability
descriptors MUST produce byte-equivalent canonical output and equivalent
diagnostics. Environment-dependent module output is a reproducibility failure.
Trusted authoring modules therefore run in a declared hermetic authoring
environment, or build verification independently repeats compilation and
compares canonical output. One observed value alone cannot prove that ambient
time, environment, or filesystem state did not influence module evaluation.

### Field allocation during compilation

Field Slot allocation is pure relative to an exact prior entity lineage:

```text
Authoring Definition + prior Record Model Revision + explicit identity intent
    -> resolved candidate
    -> semantic diff and Record Model Transition Definition
    -> Portable Definition + Proposed Record Model Artifacts
    -> Compiled Program + compatibility facts
```

The first revision assigns slots from an explicit canonical allocation
sequence, which the default ordered field authoring form supplies. Incidental
object enumeration and display order are never allocation order.
After that, the prior lineage is authoritative. Existing fields retain slots;
new fields allocate above the entity's high-water mark; retired slots remain
reserved. A rename identifies the prior slot explicitly. Reordering source or
display declarations never silently changes identity.

Two candidates compiled from one prior Record Model Revision may propose the same next
slot. Durable activation compares the exact base lineage; one may activate and
the other must rebase and compile again. Compilation itself performs no write.

## Common Caller Interfaces

### Compiled Program catalog

Custom UX, agents, renderers, and tools discover the program through a public
catalog or generated bindings derived from it:

```ts
interface ProgramCatalog {
  describe(): ProgramDescriptor;
  modules(): readonly SchemaModuleDescriptor[];
  entities(): readonly EntityDescriptor[];
  fields(entity: EntityIdentity): readonly FieldDescriptor[];
  reads(): readonly ReadDescriptor[];
  computedValues(): readonly ComputedValueDescriptor[];
  operations(): readonly OperationDescriptor[];
  operationExposureDefinitions(): readonly OperationExposureDefinitionDescriptor[];
  observables(): readonly ObservableDescriptor[];
  presentations(): readonly PresentationDefinitionDescriptor[];
  sourceBindingRequirements(): readonly SourceBindingRequirementDescriptor[];
  resolve<Name extends CatalogName>(name: Name): CatalogReference<Name>;
}

interface InstallationBinder {
  bindRead<Input, Output>(request: {
    reference: ReadReference<Input, Output>;
    input: Input;
  }): BindResult<BoundRead<Output>>;

  prepareInvocation<Input, Output>(request: {
    reference: OperationReference<Input, Output>;
    input: Input;
    invocationId?: InvocationId;
  }): BindResult<PreparedInvocation<Input, Output>>;

  instantiate<Parameters, Value>(request: {
    template: ObservableTemplateReference<Parameters, Value>;
    scopeKey: CanonicalScopeKey;
    parameters: Parameters;
  }): BindResult<ObservableReference<Value>>;
}

type BindResult<Value> =
  | { kind: "bound"; value: Value }
  | { kind: "invalid"; diagnostics: readonly BindDiagnostic[] };
```

An `InstallationBinder` is constructed from one `ActiveInstallationGate`. Its
current Application Installation Revision, Program, Product Conformance Profile, Source
Bindings, Context Catalog Basis, grants, exposures, and Authority topology are
one validated basis; callers cannot combine those facts independently. A
Program Catalog remains usable without an Installation for inspection, but it
cannot bind executable Reads or prepare Invocations by itself.

Descriptors expose current semantic name, stable identity, Resource Revision,
optional external Contract Version, documentation, input and output shape,
scope, Intent signature, required Input Bindings, Source Binding Requirements,
and capabilities, plus display-safe ownership and availability facts.
Field descriptors expose Field References and current names. They do not expose
cache keys, physical plans, credentials, provider cursors, locators, or runtime
objects.

Catalog names are module- and resource-qualified. Convenience resolution of an
unqualified name succeeds only when unique; ambiguity is a diagnostic. The
result is always a compiler-issued reference.

Generated bindings provide compile-time typed wrappers over `InstallationBinder`.
Dynamic callers use catalog descriptors and receive checked references or
diagnostics. Preparation canonicalizes and validates values, requiredness,
cardinality, scope visibility, parameter identity, Program, Record Model,
Resource, and Source Binding basis. Trusted composition resolves Authority
Scope and exact Authority Epoch. Ordinary callers do not choose Data Context or
placement unless a declared user-facing context Selection makes that choice
part of domain semantics. Invocation preparation allocates an Invocation
identity through the injected lease-backed identity allocator when one is
omitted; retry supplies the prior identity explicitly. Testkits inject a
deterministic reference allocator rather than bypassing allocation semantics.
Preparation performs all pure validation and trusted resolution before
consuming capacity. An invalid bind consumes no identity; a successfully
prepared but uncertain dispatch retains and retries its same identity.
Callers never construct `BoundRead`, `PreparedInvocation`, scope identity, or
parameterized Observable Reference objects by hand.

A catalog or successful bind never grants authority: execution still validates
the reference, trusted context, inputs, capability, and policy. Metadata visible
to untrusted callers is itself policy-filtered.

### Interaction Host

Generated renderers, custom renderers, and headless custom UX use one Host
Interface:

```ts
interface InteractionHost {
  observe<Value>(
    request: ObserveRequest<Value>,
  ): InteractionObservation<Value>;

  dispatch(intent: InteractionIntent): IntentDispatch;
}

type ObserveRequest<Value> = {
  reference: ObservableReference<Value>;
  interest?: InterestFor<Value>;
};

interface InteractionObservation<Value> {
  getSnapshot(): InteractionSnapshot<Value>;
  subscribe(listener: () => void): InteractionSubscription<Value>;
  update(request: ObserveRequest<Value>): void;
  close(): void;
}

interface InteractionSubscription<Value> {
  initial: InteractionSnapshot<Value>;
  close(): void;
}

type InteractionSnapshot<Value> =
  | { phase: "unavailable"; generation: number; reason: UnavailableReason }
  | { phase: "loading"; generation: number }
  | {
      phase: "ready";
      generation: number;
      evaluationRevision: EvaluationRevision;
      value: Value;
      issue?: DisplaySafeIssue;
    }
  | { phase: "error"; generation: number; issue: DisplaySafeIssue };
```

Host references are interaction references, not raw Reads. Presentation
Snapshots project each dependent Read's lifecycle, freshness, coverage, and
display-safe issue into the relevant contract while the outer
`InteractionSnapshot` identifies atomic interaction publication. Headless
callers needing raw Read provenance use `DataRuntime.observe`.

Interaction Intent is a closed semantic union:

```ts
type InteractionIntent =
  | {
      kind: "stateTransition";
      transition: StateTransitionReference;
      input: unknown;
    }
  | {
      kind: "operation";
      operation: OperationReference;
      input: unknown;
    };

type IntentDispatch =
  | {
      kind: "stateTransition";
      transition: TransitionHandle;
    }
  | {
      kind: "operation";
      invocation: InvocationHandle<unknown>;
    }
  | {
      kind: "operationNotDispatched";
      issue: DisplaySafeIssue;
    };

interface TransitionHandle {
  getSnapshot(): TransitionSnapshot;
  subscribe(listener: () => void): TransitionSubscription;
  wait(options?: CallOptions): Promise<TransitionResult>;
  close(): void;
}

type TransitionSnapshot =
  | { phase: "queued" }
  | {
      phase: "applied";
      revision: EvaluationRevision;
      persistence: StatePersistenceStatus;
    }
  | { phase: "rejected"; issue: DisplaySafeIssue };

type StatePersistenceStatus =
  | { kind: "notConfigured" }
  | {
      kind: "readOnly";
      state: "synchronized";
      revision: PersistenceRevision;
    }
  | { kind: "readOnly"; state: "defaulted" }
  | {
      kind: "readOnly";
      state: "diverged";
      basis:
        | { kind: "persisted"; revision: PersistenceRevision }
        | { kind: "missing" };
    }
  | { kind: "pending" }
  | { kind: "synchronized"; revision: PersistenceRevision }
  | {
      kind: "conflict";
      reference: StatePersistenceConflictReference;
      issue: DisplaySafeIssue;
    }
  | { kind: "failed"; issue: DisplaySafeIssue };

interface StateObservableSnapshot<Value> {
  value: Value;
  persistence: StatePersistenceStatus;
}

type TransitionResult =
  | { kind: "applied"; revision: EvaluationRevision }
  | { kind: "rejected"; issue: DisplaySafeIssue }
  | { kind: "cancelled" };

interface TransitionSubscription {
  initial: TransitionSnapshot;
  close(): void;
}
```

A non-reentrant local transition normally returns an already applied or
rejected handle. `queued` exists for serialized reentrant dispatch. `wait`
completes on the local State decision; later persistence status remains
observable through the handle and cannot retroactively relabel applied State as
rejected. Transition subscriptions use the same atomic initial-snapshot protocol
as Observations.

After local publication, Interaction Runtime owns the persistence write and its
bounded retry policy. Closing the Transition Handle stops observation only; it
does not cancel or roll back that write. Persistence status remains available
through `StateObservableSnapshot`.

Presentation receives compiler-issued references. It does not synthesize
Operation identity, target records, Field References, or actor context from
display labels or semantic names.

Compiler-issued references are typed. Callers do not construct string paths,
query keys, cache keys, or provider requests manually.

Host rules:

- `observe` never invokes a domain Operation.
- `dispatch` never directly edits storage, URLs, or renderer state.
- `operationNotDispatched` means no identity, Prediction, Invocation, or
  transport work was created; Host may begin bounded Identity Allocator
  replenishment and publish renewed availability before a later Intent.
- runtime revalidates every Intent; disabled UI is not authorization.
- one transition commits a complete immutable next node set before notifying.
- semantically unchanged snapshots retain identity and do not notify.
- a late generation cannot replace a newer generation.
- `close` prevents later observable publication to that caller.
- generated and custom callers receive identical snapshots and outcomes.

`subscribe` atomically registers the listener and captures `initial`; no
publication can occur between those two acts. Callers render that returned
snapshot, then use `getSnapshot` after notifications. A bare `getSnapshot`
before subscribing is only a point-in-time inspection and carries no
missed-update guarantee.

Runtime installs every changed snapshot for an Evaluation Revision before
notifying any listener. Notification passes are serialized. A reentrant local
State Transition returns a queued `TransitionHandle` and evaluates after the
current pass; Operation dispatch with available identity capacity returns its
InvocationHandle immediately and may begin transport independently. Reentrant
update or close is also applied
after the pass. Callbacks never nest and Runtime never awaits work returned by a
listener. A synchronous listener can delay completion of its current call, so
implementations measure or isolate slow listeners according to declared host
policy. Listener failure is isolated from other listeners.

Host allocates a new Invocation identity only when dispatching an Operation
Intent and only from prefetched capacity. Immutable Presentation snapshots
therefore describe an action, not a preallocated attempt. The returned
InvocationHandle exposes that identity and owns same-identity transport retry.
Capacity failure returns `operationNotDispatched`. Dispatching the Intent after
replenishment is a new logical attempt; no hidden attempt existed before the
identity was allocated. A declared interaction policy may suppress duplicate
dispatch.

Hydration supplies compatible initial runtime state at construction. Framework
Adapters MAY project their own server-snapshot helper from that state; the core
Host Interface does not depend on framework hydration conventions.

### Granular observable references

The compiler may issue Observable References at Surface, section,
Presentation, Relation-structure, Row, control, and declared field-projection
granularity. Each reference has a static or parameterized dependency mask. A
dynamic Row reference is keyed by stable Row identity and Scope Instance, never
by current rank.

Entity-field references, dirty masks, pending facts, and granular invalidation
use `FieldReference` and slot bitmaps. A semantic name may label a snapshot but
never selects its subscription identity.

Granularity does not imply independent I/O. Runtime coalesces references over
the same Bound Read, aggregates their Interest, and shares one evaluation or
transport lease where possible. A virtual table can therefore observe:

- one structure reference for visible Row identities, order, continuation, and
  extent;
- one Row reference per rendered identity for projected values and pending
  facts;
- optional control or field references when the renderer benefits from finer
  invalidation.

A projection-only change notifies affected Row or Field Slot references without
notifying Relation structure. Insert, delete, or reorder notifies structure and
only affected Row references. All changed references for one event carry one
Evaluation Revision and become readable before any listener runs, preventing
tearing between granular subscriptions.

These derived subreferences are compiled pure Presentation projections, not
independent Derivations or caller callbacks. A reusable non-visual interaction
result is a Computed Value. Subreferences
cannot broaden authorization, alter Read membership or ordering, or invent
independent freshness. Closing a subreference releases only its demand. The
runtime MAY retain shared underlying coverage while another reference or cache
policy still owns it.

### Data Runtime

Headless data callers and the Interaction Runtime use two behavioral entry
points:

```ts
interface DataRuntime {
  observe<Output>(
    request: DataObserveRequest<Output>,
    options?: CallOptions,
  ): DataObservation<Output>;

  invoke<Input, Output>(
    invocation: PreparedInvocation<Input, Output>,
    options?: CallOptions,
  ): InvocationHandle<Output>;
}

interface DataObserveRequest<Output> {
  read: BoundRead<Output>;
  interest: InterestFor<Output>;
}

interface CallOptions {
  cancellation?: CancellationSignal;
  deadline?: Deadline;
}

interface CancellationSignal {
  isCancelled(): boolean;
  subscribe(listener: () => void): () => void;
}
```

`DataObservation` owns snapshot access, subscription, Bound Read and Interest
updates, and disposal. `InvocationHandle` exposes optimistic status,
authoritative outcome, and transport uncertainty. Construction and Adapter
injection are configuration, not additional behavioral concepts.

```ts
interface PreparedInvocation<Input, Output> {
  programRevision: ProgramRevision;
  source: InvocationSourceBasis;
  recordModelRevision: RecordModelRevision;
  resourceRevision: ResourceRevision;
  operation: OperationReference<Input, Output>;
  invocationId: InvocationId;
  input: Input;
  targetSourceBinding: SourceBindingRevision;
  sourceBindingBasis: readonly SourceBindingRevision[];
  contextBasis: ContextCatalogBasis;
  authorityScope: AuthorityScopeId;
  expectedAuthorityEpoch: AuthorityEpoch;
}

interface InvocationEnvelope {
  programRevision: ProgramRevision;
  source: InvocationSourceBasis;
  recordModelRevision: RecordModelRevision;
  resourceRevision: ResourceRevision;
  operation: OperationId;
  invocationId: InvocationId;
  input: CanonicalValue;
  targetSourceBinding: SourceBindingRevision;
  sourceBindingBasis: readonly SourceBindingRevision[];
  contextBasis: ContextCatalogBasis;
  authorityScope: AuthorityScopeId;
  expectedAuthorityEpoch: AuthorityEpoch;
}

interface AuthorityInvocation extends InvocationEnvelope {
  qualifiedId: QualifiedInvocationId;
  actor: AuthenticatedActorContext;
  securityPartition: SecurityPartitionIdentity;
  requestFingerprint: RequestFingerprint;
}

interface InvocationHandle<Output> {
  id: QualifiedInvocationId;
  getSnapshot(): InvocationSnapshot<Output>;
  subscribe(listener: () => void): InvocationSubscription<Output>;
  wait(options?: CallOptions): Promise<
    | { kind: "authoritative"; outcome: AuthorityOutcome<Output> }
    | { kind: "indeterminate"; issue: DisplaySafeIssue }
    | { kind: "cancelled" }
  >;
  retry(options?: CallOptions): void;
  close(): void;
}

interface InvocationSubscription<Output> {
  initial: InvocationSnapshot<Output>;
  close(): void;
}

type DisclosedValue<Value> =
  | { kind: "available"; value: Value }
  | { kind: "withheld"; reason: DisclosureReason };

interface DisclosureReason {
  code: DisclosureReasonCode;
  data?: CanonicalValue;
}

type TerminalRejection =
  | { kind: "issue"; issue: DisplaySafeIssue }
  | { kind: "conflict"; conflict: DisplaySafeConflict };

type AuthorityOutcome<Output> =
  | {
      kind: "committed";
      commit: QualifiedCommitId;
      output: DisclosedValue<Output>;
    }
  | { kind: "rejected"; rejection: TerminalRejection };

type InvocationSnapshot<Output> =
  | {
      phase: "pending";
      delivery: "queued" | "dispatched" | "retrying";
      prediction: "none" | "applied" | "blocked";
      issue?: DisplaySafeIssue;
    }
  | {
      phase: "committed";
      output: DisclosedValue<Output>;
      commit: QualifiedCommitId;
      incorporation: "awaitingBase" | "incorporated" | "notTracked";
    }
  | { phase: "rejected"; rejection: TerminalRejection }
  | { phase: "indeterminate"; issue: DisplaySafeIssue }
  | { phase: "cancelled" };
```

`PreparedInvocation` is the trusted, typed local form produced by an
Installation Binder. `DataRuntime.invoke` validates and canonical-encodes its
input through the exact Operation input Value Shape to produce an
`InvocationEnvelope`; callers cannot provide an envelope directly. At the
trusted Authority boundary, Authority Runtime authenticates the request,
validates every carried semantic and routing basis, derives the qualified
identity, actor, and Security Partition, and constructs
`AuthorityInvocation`. Untrusted transport input cannot supply or override
those Authority-derived fields. The resulting Authority-validated request is
the sole basis for the request fingerprint used by planning, settlement,
retry, and reconciliation.

`DisclosedValue` uses the closed tagged-variant Value Shape. Stable reason code
and canonical data participate in logical equality; localized or mutable message
text does not. Presentation resolves a display message from the reason under its
own localization policy.

Closing an Invocation handle stops observation of its status. It does not
cancel an Invocation already accepted for remote dispatch. `wait` may return
indeterminate when no authoritative outcome is known before its caller scope
ends; `retry` resends the canonical Invocation with the same identity and never
creates a new logical attempt.

Invocation subscriptions use the same atomic initial-snapshot and serialized,
non-reentrant notification protocol as other runtime subscriptions.

`cancelled` is final only when local cancellation wins before dispatch. A
transiently unavailable Transport remains `pending` with retry status or becomes
`indeterminate`; it is never stored as a terminal domain rejection.

The cancellation and deadline in `CallOptions` bound caller-owned work and
waiting. A Deadline is evaluated
against an injected deterministic clock. Reaching it closes caller-owned leases
or returns a deadline/indeterminate result as appropriate; it does not become a
domain rejection or prove that dispatched remote work stopped.

The Depth of this Module comes from hiding placement, caching, synchronization,
transport, retries, request races, optimistic replay, and Adapter event forms
behind `observe` and `invoke`.

## Value, Identity, And Record Model

### Values

The portable value system supports explicit scalar, temporal, enum, identity,
reference, collection, typed atomic structure, and opaque JSON shapes. A value
is never just an untyped JavaScript primitive or provider cell. Its exact
compiled Value Shape determines validation, canonicalization, equality,
hashing, ordering, operators, and decoding.

Optional, absent, and null remain distinct whenever the declared shape
distinguishes them. Absence is a fact about a containing field, member, or
input; it is not encoded as `undefined`, an array hole, an empty string, zero,
or null. Null is an ordinary canonical value only for a shape that permits it.

#### Representation layers

One logical value may have several deliberately different representations:

| Layer | Responsibility | Example for an exact decimal |
| --- | --- | --- |
| Definition | declares logical type and constraints | decimal with declared precision and scale policy |
| Typed runtime | useful immutable value for Reads, State, Input Bindings, and Operations | exact decimal value, not a binary float |
| Canonical data | deterministic portable encoding for identity and interchange | normalized decimal token encoded as JSON-compatible data |
| Presentation draft | locale-aware and possibly incomplete editing state | `"-"`, `"1."`, or `"1,25"` while editing |
| Physical storage | Adapter-private native or encoded representation | `DECIMAL`, sortable bytes, text, or split columns |

The uniformity lives in the Value Shape and compiled codec Interface, not in forcing all
five layers to use strings. A representation change is valid only when it
round-trips through the exact codec without changing logical meaning.

Presentation formatting and parsing are not canonical codecs. Locale, grouping,
calendar display, and incomplete user input belong to Presentation and draft
State. A draft may temporarily contain text that is not a domain value. Only a
successful parse and validation produces the typed value supplied to a State
Transition or Operation input.

#### Portable value algebra

The portable core distinguishes at least these semantic families:

- text with explicit Unicode normalization, equality, and collation policy;
- boolean;
- finite IEEE-754 floating point with explicit signed-zero policy;
- exact bounded or arbitrary-size integer;
- exact decimal, including explicit precision, rounding, and scale semantics;
- calendar date, wall-clock time, local date-time, instant, duration, and time
  zone as separate temporal types;
- enum, opaque identity, Record reference, and other branded tokens;
- bytes;
- optional, nullable, list, tuple, and typed atomic structure shapes;
- opaque canonical JSON as a deliberately capability-poor escape type.

These types are not interchangeable because their canonical encodings happen
to share a JSON primitive. In particular, a decimal string is not text, a date
string is not an instant, an integer is not a floating-point value, and a Record
ID is not an arbitrary string.

The core finite floating-point type uses a JavaScript `number` safely because
its logical semantics are explicitly IEEE-754 and its canonical codec defines
normalization. Non-finite values and bit distinctions such as signed zero are
either forbidden or represented by a separately declared type whose canonical
form preserves them; they never leak accidentally through JSON coercion.

Exact integers, decimals, temporal values, identities, and bytes may use
canonical strings or structured scalar tokens because JSON and JavaScript
numbers cannot represent their full domains reliably. Their typed runtime representations
may expose `bigint`, immutable decimal or temporal values, branded strings, or
another stable typed representation. Transport and Archive always cross the
canonical codec rather than serializing runtime objects directly.

Ordering and equality semantics are part of every supporting Value Type.
Locale, Unicode normalization, collation, timezone, calendar, precision,
rounding, numeric edge cases, and unit semantics are explicit whenever they can
affect results. A type that does not define a total order cannot be used as an
ordering term without a named semantic operator that does.

#### Compiled codec contract

Every compiled Value Shape resolves to one pure codec contract conceptually
equivalent to:

```ts
interface CompiledValueCodec<RuntimeValue> {
  shape: ValueShapeDescriptor;
  decodeCanonical(input: unknown): ValueDecodeResult<RuntimeValue>;
  encodeCanonical(value: RuntimeValue): CanonicalValue;
  equals(left: RuntimeValue, right: RuntimeValue): boolean;
  hash(value: RuntimeValue): CanonicalDigest;
  compare?: (left: RuntimeValue, right: RuntimeValue) => -1 | 0 | 1;
  operators: readonly SemanticValueOperator[];
}
```

The exact TypeScript shape is illustrative. The contract is normative:

- decoding rejects noncanonical, out-of-range, malformed, oversized, or
  wrong-shape values with stable path-aware diagnostics;
- encoding always produces the unique canonical form;
- decode followed by encode is canonical and deterministic;
- equal values hash identically within one Value Shape; a mixed-type digest
  includes the Value Shape and codec basis, and digest equality alone never
  authorizes cross-type value equality;
- comparison, where present, is a deterministic total order consistent with
  declared equality;
- operators such as arithmetic, range comparison, aggregation, and member
  access have typed inputs, overflow or rounding policy, deterministic errors,
  and declared capability requirements;
- codec and operator execution is pure, bounded by declared limits, and
  independent of locale, ambient timezone, host database, or object identity;
- codec identity and version participate in Record Model, Resource, cache, memo,
  Invocation, Snapshot, and Archive provenance wherever the value participates.

Input Bindings, State persistence, Read inputs and outputs, Mutation values,
Invocation envelopes, effect payloads, Transport frames, Snapshots, and
Archives all use codecs compiled from the same Value Shape. TypeScript checks
trusted source ergonomics but does not validate runtime data from any of those
Seams.

When another contract calls a typed runtime value or snapshot serializable, it
means serializable through its compiled codec. It does not require direct
`JSON.stringify` support for `bigint`, decimal, temporal, branded, or custom
runtime representations.

#### Canonical data domain

Canonical values use a bounded data-only domain: null, booleans, canonical
strings, permitted finite numbers, arrays, and records with deterministic key
ordering. They contain no `undefined`, sparse arrays, functions, symbols,
`bigint`, mutable class instances, getters, prototypes with behavior, provider
objects, or ambient references. A Value Type whose domain exceeds these JSON
primitives encodes through a canonical string or data structure selected by its
codec.

Canonical encoding is schema-directed. Stored fields, Read results, Invocation
inputs, and other typed positions carry or imply the exact Value Shape and
codec version. A generic tagged envelope may be used where no enclosing shape
exists, but tags are not duplicated into every field merely to make the storage
encoding self-describing.

Semantically equivalent inputs normalize to byte-equivalent canonical data.
Numeric spelling, negative zero, Unicode form, object key order, temporal
offsets, decimal scale, and other representational choices normalize according
to the declared type. Where a distinction is semantically meaningful, the
codec preserves it instead. No caller compares raw encoded strings to implement
numeric, temporal, collation, or domain ordering.

#### Typed atomic values and opaque JSON

Money, quantities, rates, ranges, coordinates, and similar domain values should
normally be declared as refined scalars or typed atomic structures composed
from portable Value Types. Their member shapes, validation, equality, operators,
and canonical encoding remain statically visible. An Authority Store or Source
Adapter may map one logical atomic value to a native provider type, encoded
value, JSON column, or several private columns without changing its one-field
logical identity.

A typed atomic structure does not violate flat record storage. It has no
independent Record Identity, lifecycle, authorization owner, or relationship
semantics and is replaced as one field value by the core Mutation algebra. If a
member needs independent identity, reference integrity, field policy,
subscription, conflict handling, patching, or indexing semantics, it should be
a separate field or related record unless a named extension explicitly defines
those semantics.

Opaque JSON is a deliberate escape hatch for data whose internal meaning the
portable runtime does not interpret. Its core contract is conservative:

- bounded canonical JSON validation and deterministic structural equality;
- deterministic object-key normalization and rejection of non-data values;
- one explicit finite JSON-number policy; exact large integers and decimals
  require a typed value or deliberate string or tagged representation;
- whole-field dependency, authorization, invalidation, and replacement;
- no portable ordering, arithmetic, aggregation, member-path query, granular
  subscription, partial Mutation, or optimistic merge semantics;
- no claim that a provider JSON index makes a provider expression portable.

A named JSON-path or document capability may add typed path operators,
dependency facts, patch algebra, and Adapter pushdown. It is then responsible
for deterministic reference behavior, conflict semantics, and conformance. A
provider-specific JSON query cannot silently escape through the core Read
language.

#### Custom Value Types

Most domain types should compose built-in scalars, refinements, enums, and typed
atomic structures. A genuinely custom Value Type is a named versioned
capability, not an inline TypeScript class or callback. Its descriptor declares
canonical data form, typed runtime representation contract, validation, equality, hashing,
ordering and operators where supported, resource limits, and compatibility
rules. It supplies a deterministic in-memory reference Implementation.

Every topology that must decode or operate on that type resolves the exact
capability version. A server-only type may remain opaque to a client only when
the Program exposes an already-decoded display-safe projection and requires no
client comparison, editing, Prediction, State persistence, or local Read
execution for it. Missing capability otherwise makes the dependent resource
explicitly unsupported.

### Entity and field identity

Entity Identity is stable across semantic rename and module reorganization.
Entity-local fields use the smallest durable identity that preserves that
property:

```ts
type FieldSlot = Brand<number, "FieldSlot">;

interface FieldReference {
  entity: EntityIdentity;
  slot: FieldSlot;
}
```

A Field Slot is monotonically allocated from durable entity lineage. The first
model assigns slots from an explicit canonical allocation sequence. Later
models retain the immutable slot lineage and high-water mark while publishing
one current active name-to-slot map. Adding a field allocates above that mark. Renaming
replaces the active name mapping while preserving the slot and history; the old
name is not active unless an explicit alias contract says otherwise. Retiring,
erasing, or purging a field never frees the slot. Reintroducing the same semantic
name later allocates a new slot.

Within one Record Model Revision, every active semantic field name resolves to exactly
one active slot and every active slot has exactly one current semantic name.
Transition-only aliases may aid diagnostics but cannot appear in executable
plans.

Field names are current authoring symbols and diagnostic metadata, not storage
identity. Display order and source organization are separate Presentation and
authoring concerns. A compiler-issued `FieldReference` is the only executable
field address used by Reads, Operations, policies, constraints, dependency
masks, audit, caches, or synchronization. Generated TypeScript bindings let
humans and agents use current names while encoding resolved references beneath
them.

Authoring names are qualified by Schema Module and Entity. Dynamic catalog
lookup rejects ambiguity and returns a compiler-issued reference; no execution
request contains an unresolved name.

Within one Data Context-owned Record Model lineage, every Entity Identity has
one slot-allocation coordinator responsible for its active name map, slot
high-water mark, and retired-slot history. A Schema Module may declare or extend
that entity but does not thereby own the persistent lineage. Two modules cannot
allocate slots for the same entity unless one explicit extension contract
serializes against the coordinator and exact prior lineage.

Moving a field between entities is not a rename because Field Slots are
entity-local. It requires an explicit copy or reference rewrite and retirement
transition.

### Canonical field vectors

A record's ordinary field payload is logically a tuple indexed by Field Slot.
System metadata remains outside that tuple. The canonical encoded form may be
compact rather than a literally dense array:

```ts
interface CanonicalFieldVector {
  recordModelRevision: RecordModelRevision;
  present: SlotBitmap;
  values: readonly CanonicalValue[]; // increasing present-slot order
}
```

This is the canonical logical shape; the exact packed binary or textual codec
remains a Core Interface choice. Every codec MUST preserve these facts without
JavaScript array holes or `undefined`:

- an occupied slot whose canonical value is `null`;
- an optional slot that is absent;
- a slot introduced after an older stored row was written.

The bitmap domain is exactly the entity lineage below its high-water mark;
trailing bits normalize canonically; only active slots may be set; and `values`
contains exactly `popcount(present)` entries in increasing slot order.
Canonicalization rejects out-of-range or non-normal bits, popcount mismatch,
retired slots, wrong codecs, and any other representation.

Each `CanonicalValue` is interpreted through the Value Shape and codec version
assigned to that slot by `recordModelRevision`. The vector does not repeat a type tag
for every value, and no reader may decode it without the exact model. Identical
encoded strings in differently typed slots remain differently typed facts.

Every logical vector exposed by an Authority uses its active Record Model Revision.
Older physical row encodings may remain behind an Adapter, which normalizes them
before exposure. A required added field therefore needs an explicit default or
backfill; it is not conjured by tuple length. A type change at one slot requires
explicit old and new codecs and never silently reinterprets bytes.

Retired payload, erasure evidence, and non-reuse lineage are retention metadata,
not ordinary current record values. Active Reads never receive retired payload.
Storage or Archives may retain it only under declared policy, and erasure may
remove it while preserving the slot fence.

Tuple semantics do not require physical dense arrays. An Adapter may use SQL
columns, document keys, sparse maps, packed bitmaps, or chunked vectors. Physical
column names and order are private mappings. Reordering provider columns or
compacting retired payload cannot change logical Field Slots or canonical
results. This freedom prevents long-lived schemas with many retired fields from
incurring unbounded dense-row cost.

Projected Read output properties use their own compiled output-shape identity.
They do not inherit source Field Slots merely because a property has the same
name.

### Record identity

Qualified Record Identity consists of Data Context Identity, Authority
Partition Identity, Entity Identity, and a partition-local Record ID. It is
stable across Application Installation replacement, Authority Scope movement, Adapter
replacement, and physical sharding. Record IDs may repeat in different Data
Contexts or Authority Partitions without collision.

Ordinary patch cannot change Authority Partition assignment or any immutable
affinity input used to derive it. Cross-partition relocation is an explicit
repartitioning migration that creates a new Qualified Record Identity, rewrites
affected references and constraints, and retires the prior identity under
non-reuse policy.

The default portable Record ID is an opaque allocated identity. A business key
or externally meaningful identifier is an ordinary uniquely constrained field,
not Record Identity. Field Slots are not Record IDs, and a record's position in
any Source or Relation never identifies it.

Normal creation MUST NOT reuse the identity of a deleted record. Recovering an
archived or soft-deleted record may retain identity because no delete Mutation
occurred. Recreating data after a delete Mutation uses a new identity.

Optimistic creation uses an Authority-issued identity or an identity from a
current finite client lease. A purely local provisional key is interaction
State, is never a Record ID, and must be replaced by an allocated Record ID
before authoritative dispatch. Replacing that UI key is not Record-ID
remapping. Dispatching a Mutation under a provisional Record ID and later
remapping that Record ID is an explicit specialized capability, not the default.

### Record revision

Every material record change produces a new opaque Record Revision. Revisions
support equality and Adapter-declared comparisons only. Timestamps are display
and audit data, never concurrency versions.

### Record envelope metadata

Every portable Record envelope contains exactly these core facts:

```ts
interface RecordEnvelope {
  identity: QualifiedRecordIdentity;
  entity: EntityIdentity;
  recordModelRevision: RecordModelRevision;
  recordRevision: RecordRevision;
  fields: CanonicalFieldVector;
}
```

No other system metadata is implicit. Identity and revision references are
compiler-issued, read-only metadata references rather than Field Slots. They
participate explicitly in Read dependency, authorization, canonical Transport,
Snapshot, and Archive semantics and cannot be targeted by ordinary Record
Mutations.

Additional lifecycle or audit metadata is either an ordinary declared field or
a named metadata capability defining its Value Shape, Authority mutation rules,
Read addressability, policy, synchronization, and Archive behavior. For
example, Authority-assigned creation or update instants may be such a
capability; they are never concurrency versions. A delete is an authoritative
change and retained identity fact, not an implicitly readable `deletedAt` field
on a current Record.

### References and relationships

Records store reference identities. Relationship metadata describes target
types, cardinality, inverse behavior, and mutation policy. It does not nest
target records.

Delete behavior such as restrict, set-null, or cascade is Operation policy that
plans one atomic Mutation set. References whose invariants resolve inside one
Authority Scope may be strong. A reference across Authority Scopes is an
explicit versioned external reference with declared existence, freshness, and
delete behavior; it cannot imply atomic integrity without an explicit
distributed capability.

## Record Model Evolution

Record Model evolution is a first-class data contract. It is not a startup script, a
best-effort schema diff, or an Adapter-specific SQL file. The reference model
must support compiling, validating, transforming, and activating changes with
no process restart or implicit data reset.

### Revision dimensions

The architecture separates:

- **Program Revision:** the identity of one exact logical Program composition;
- **Record Model Revision:** persistent entity lineages, active names, slots, types,
  constraints, and record semantics;
- **Resource Revision:** exact semantics of one Read, Operation, Predictor,
  Computed Value, State, Presentation, or other resource;
- **Source Binding Revision:** the exact revision and target of one Source Binding edge
  from a Program requirement to a logical Source instance;
- **Authority Epoch and Revision:** lineage and Commit position for one
  Authority Scope;
- **Placement Revision:** current physical routing, which is not domain
  provenance.

A label or Presentation change does not create a Record Model Transition. An unrelated
Presentation change does not make an unchanged Operation semantically new. The
root Program Revision remains useful provenance, while Record Model and Resource
Revisions allow selective compatibility rather than resetting everything.

### Analysis, intent, and transition

Pure evolution analysis compares one active Record Model Artifact with one
Proposed Record Model Artifact and
classifies every semantic difference. Its output is evidence for review, not
authority:

```ts
interface RecordModelEvolutionAnalysis {
  from: RecordModelArtifact;
  to: ProposedRecordModelArtifact;
  changes: readonly ClassifiedRecordModelChange[];
  diagnostics: readonly EvolutionDiagnostic[];
  proposedTransition?: RecordModelTransitionDefinition;
}

interface RecordModelTransitionDefinition {
  id: RecordModelTransitionId;
  fingerprint: CanonicalDigest;
  from: RecordModelRevision;
  to: RecordModelRevision;
  targetArtifact: RecordModelArtifactReference;
  changes: readonly RecordModelChange[];
  destructivePolicy: DestructiveChangePolicy;
  verification: readonly TransitionVerification[];
  requiredCapabilities: readonly CapabilityReference[];
}

interface RecordModelTransitionExecution {
  id: TransitionExecutionId;
  coordinationFence: InstallationRecordModelCoordinationFence;
  transition: RecordModelTransitionId;
  transitionFingerprint: CanonicalDigest;
  authorityScope: AuthorityScopeId;
  expectedAuthorityEpoch: AuthorityEpoch;
  expectedActiveRecordModel: RecordModelRevision;
  capturedAuthorityRevision: AuthorityRevision;
  expectedContextCatalogBasis: ContextCatalogBasis;
  planFingerprint: CanonicalDigest;
  destructiveApproval?: DestructiveApprovalEvidence;
}
```

A Record Model Transition Definition is portable and reusable wherever its exact
source Record Model applies. Execution is instance-specific. Transition Execution Identity is
qualified by Authority Scope, is never reused, and remains fenced after result
compaction. Same execution identity with a different fingerprint rejects;
replay returns its recorded outcome. Names in authoring intent resolve to Entity
Identity and Field Slot before the transition becomes canonical.

A diff may synthesize an unambiguous compatible transition. It MUST NOT infer a
rename merely because one similar field disappeared and another appeared, a
type transform merely because TypeScript accepts both types, or destructive
intent from absence in source. Ambiguous, destructive, or data-transforming
changes require explicit transition data.

### Change classification

| Change | Default meaning |
| --- | --- |
| Add optional field | Allocate a new slot; compatible model addition |
| Add required field | Explicit default or deterministic backfill required |
| Rename field | Preserve exact slot, codec, constraints, and policy |
| Reorder authoring or display | No slot or stored-data change |
| Remove field from active Record Model | Retire slot; payload retention is separate |
| Reuse a retired slot | Prohibited |
| Reuse a retired semantic name | Allocate a new slot |
| Transform field type in place | Explicit semantic intent preserves slot and declares old/new codecs and failure policy |
| Change canonical codec, equality, ordering, precision, scale, unit, or temporal meaning | Semantic type transform requiring explicit compatibility or value migration |
| Replace field with similar type or name | Retire old slot and allocate a new slot |
| Move field between entities | Copy or reference rewrite plus retirement |
| Add uniqueness/reference constraint | Validate all affected current data before activation |
| Remove entity | Explicit reference, retention, archive, and erasure policy |
| Add Read, Computed Value, or Presentation | Resource change, not Record Model migration |
| Change Operation semantics | New Resource Revision; pending Invocation policy required |
| Change physical placement | Placement change, not Record Model change |
| Change only a lossless physical value mapping | Adapter or Placement change, not Record Model change |

Declarative transforms SHOULD use a portable deterministic algebra. A transform
outside that algebra uses a named, versioned migration capability with
deterministic in-memory reference semantics. An inline TypeScript callback is
not transition data.

### Activation semantics

A candidate Portable Definition, derived Compiled Program, and standalone
Record Model Artifact can compile, explain, simulate, and verify without
becoming active. Activation binds the transition to:

- exact source and target Record Model Revisions;
- exact Authority Scope, expected Authority Epoch, active Record Model Revision,
  captured Authority Revision, and relevant Context Catalog Basis;
- current Installation–Record Model Coordination Fence and fencing token;
- exact base Record Model lineage, including every entity slot high-water mark and
  retired-slot fence;
- required migration capability versions;
- deterministic verification results bound to the captured Authority Revision;
- trusted ownership authority, authenticated actor, destructive approval,
  retention decisions, and durable audit facts.

Activation validates the shared Coordination Fence and compare-and-sets the
currently active Record Model Revision and lineage. Concurrent proposals from the same base conflict rather than silently
merging. One Authority Scope exposes the prior Record Model until cutover and
the target Record Model after cutover; no caller observes partially transformed
target semantics. Failure leaves the prior Record Model active and a durable
failed transition result.
Prepared inactive state may be discarded before activation. After activation,
rollback is a new forward Record Model Transition; Authority never silently rewinds the
transition ledger.

A logical model deployed across several Authority Scopes has no implicit global
activation transaction. It is a set of independently fenced transitions. A
coordinator may prepare every scope and atomically switch a Source Binding only
when its advertised capability proves that visibility; otherwise Reads and
administrative status carry an explicit per-scope Record Model Revision vector during
rollout. A Program requiring one model across all scopes remains unavailable or
uses an explicit multiversion compatibility policy until the requirement is
satisfied. Mixed scope state is never mislabeled as one atomic cutover.

Normal writes and transformation cannot leave a gap. A conforming evolution
capability proves one of these semantics:

- prior Record Model writes are quiesced at an exact cutover Authority Revision; or
- the transition captures a revision and deterministically translates or
  replays every later accepted Commit exactly once before activation.

Activation atomically revalidates the captured basis or proves complete replay
through the current Authority Revision. Stale verification alone can never
authorize cutover.

Every accepted Commit is stamped with the Record Model Revision under which its
Mutations were interpreted. A snapshot or change page carries enough model
provenance to decode Field Slots. A failed retry, crash, or duplicate transition
request cannot double-transform data or advance the model twice.

Every materially transformed or backfilled record receives a new Record
Revision. Activation appends an ordered model-transition barrier to Authority
history before any target Record Model Commit. The barrier carries the exact
target Record Model Artifact and either interpretable transformed changes or an
explicit `BootstrapRequired`. A prior Record Model snapshot can never be followed by an
unannounced target Record Model change.

After activation, an old Operation cannot directly write a retired or
incompatible slot. It executes only against an Authority retaining the exact
prior Record Model
or through an explicit deterministic translation. Multiversion Program support
does not imply multiversion writes against one active Record Model.

### Record Model Evolution Adapter Seam

The Record Model Evolution Module owns common semantics; Adapters expose only physical
capabilities needed to realize them:

```ts
interface RecordModelEvolutionAdapter {
  analyzePhysicalSupport(
    transition: RecordModelTransitionDefinition,
    placement: PlacementRevision,
  ): SupportedEvolution | UnsupportedEvolution;

  prepare(
    request: EvolutionPreparation,
    sink: EvolutionPreparationSink,
  ): EvolutionPreparationLease;
}

interface RecordModelEvolutionRuntime {
  submit(execution: RecordModelTransitionExecution): EvolutionHandle;
  inspect(
    authorityScope: AuthorityScopeId,
    id: TransitionExecutionId,
  ): EvolutionStatus | UnknownTransition;
}
```

Preparation may build indexes, transformed state, or provider metadata, but it
does not change the externally active Record Model. The physical Record Model Evolution Adapter
cannot activate a model independently. Authority Runtime uses the same atomic
Authority Store coordination Interface as ordinary settlement to append the
activation barrier, change active Record Model Revision, store the terminal transition
outcome, and fence ordinary writes.

Evolution status is durable and inspectable: proposed, preparing, prepared,
activating, applied, failed, or expired. Preparation and activation are
idempotent by execution identity and fingerprint. Response loss replays stored
status. Cancellation before durable acceptance may prevent work; afterward it
only stops that caller waiting. Prepared-state expiry, abandoned staging
cleanup, progress retention, crash recovery, and disclosure filtering have
explicit owners and policy.

A production Adapter may use an in-place transaction, shadow tables, online
DDL, or provider-native migration; the choice is private and cannot weaken
identity, visibility, verification, authorization, audit, or
Commit-preservation rules. `inspect` is Authority-scope-qualified and applies
current disclosure policy.

The in-memory Record Model Evolution Adapter implements the same asynchronous Interface and
fault points. It is not a special synchronous shortcut.

### Resource compatibility at cutover

A new Program creates a new semantic graph. Reuse across revisions requires a
compiler-issued compatibility proof, never matching names alone.

- a field rename with the same slot and codec can preserve only slot-addressed
  facts whose complete Resource and output-shape compatibility proof succeeds;
- adding an unrelated field does not invalidate resources that do not depend on
  it;
- changing type, collation, authorization, dependency, operator, or capability
  version invalidates the affected resource and descendants;
- changing only a runtime representation or lossless physical mapping preserves
  logical facts when the exact Value Type conformance proof succeeds;
- active Observations retain identity only when their complete Resource, Source
  Binding, security, and provenance basis remains compatible;
- persistent derived materializations rebuild unless their semantic
  fingerprint and complete Source Binding, Record Model, security, Source provenance,
  coverage, freshness, and materializer validity proof remain compatible;
- an old pending Invocation executes only under its exact Operation semantics
  or an explicit deterministic translation;
- a terminal Invocation outcome remains terminal and never re-executes;
- a Prediction survives only through an explicit compatible Predictor and
  overlay transition; otherwise its speculative effects are withdrawn.

Materialization rebuild does not block Installation activation by default. Dependent
Reads expose honest loading or permitted stale state while rebuilding. Requiring
a materialization-readiness fence before cutover is an explicit deployment
capability.

Old and new Program versions may coexist only through a named multiversion
capability. Each Observation cuts over atomically and never mixes nodes from
incompatible semantic graphs.

### Installation activation and Program retention

Installation activation is compare-and-set against the current Installation
Revision and exact relevant Context Catalog Basis. Before activation:

- the target Compiled Program and every exact Resource Revision are registered;
- the selected Product Conformance Profile is registered and satisfied;
- every bound Authority Scope exposes the exact selected active Record Model
  Revision and the Program compatibility facts permit it;
- Source Binding Requirements resolve to exact current Source Binding Revisions;
- grants, selected Installed Operation Exposure Revisions, and capability versions are
  current;
- pending Invocations, active Observations, retained outcomes, and Archives keep
  a resolvable semantic basis or an explicit deterministic translation.

Activation atomically makes new Invocation preparation, Observation creation,
and dispatch resolve through the target Program Revision. Existing Observations transfer only under a complete
compiler-issued compatibility proof; otherwise they reset or close without
mixing semantic graphs.

An Installation Revision is `active`, `draining`, or `inactive`. Draining stops
new preparation and Observation creation for that Installation while already
accepted work retains exact Operation, planner, codec, and policy resources.

Program Registry state is independently `registered`, `retained`, or `retired`.
A Program Revision may become retired only when its complete typed retention
reference set is empty, including pending Invocation, active Observation,
terminal-outcome disclosure, Archive, and historical-decoding uses. An explicit
deterministic translation may discharge a reference. Deployment timing alone
never retires semantics. A stored terminal outcome remains terminal and need
not retain its planner when its output and disclosure resources have their own
complete retained basis.

## Read Semantics

### Read Definition

A Read is a typed, serializable logical program:

```ts
interface ReadDefinition<Inputs, Output> {
  id: ReadId;
  inputs: InputShape<Inputs>;
  output: OutputShape<Output>;
  program: ReadProgram;
  requirements: ReadRequirements;
  authorization: ReadAuthorizationPolicyReference;
}

interface BoundRead<Output> {
  programRevision: ProgramRevision;
  resourceRevision: ResourceRevision;
  sourceInstances: readonly SourceInstanceId[];
  sourceBindings: readonly SourceBindingRevision[];
  recordModelRevisions: readonly RecordModelRevision[];
  definition: ReadId;
  inputs: CanonicalInputs;
  output: OutputShape<Output>;
  manifest: ReadManifest;
}
```

Authorization behavior is part of the compiled output shape. An output position
of plain type `T` is required: inability to disclose it rejects the complete
Read. A position declared as `DisclosedValue<T>` may instead publish
`withheld`. Runtime never represents denial by omitting a property, substituting
null, returning an empty Relation, or changing output shape.

Row authorization defines the caller's logical Relation before projection and
aggregation. Field or traversal policy applies before protected facts enter an
ordinary derivation. A derived scalar, ordering term, membership fact, or
aggregate over protected facts requires its own explicit output policy;
otherwise the Read rejects or the result inhabits a declared
`DisclosedValue`. Exact counts and absence proofs may themselves be protected
facts.

Callers bind declared inputs. Compiler and runtime derive canonical identity,
dependency facts, capability requirements, and cache partitioning.

A Read may produce:

- one scalar or structured value;
- one optional value;
- one aggregate;
- one finite or unbounded ordered Relation;
- a structure composed from those shapes when coherence is defined.

A Read is pure relative to declared inputs and logical data state. Time, locale,
actor-dependent facts, randomness, and environment values MUST be explicit
inputs or trusted execution context.

### Read program

A Read program is a deterministic operator graph over logical Sources. Core
operators may include lookup, traversal, filtering, projection, grouping,
aggregation, ordering, and semantic limiting.

The program describes semantics, not physical execution. An Adapter may
interpret it directly, compile it to SQL, map it to a graph traversal, execute a
time-series range query, use an index, or serve a materialized projection.

Read literals and operators address compiled Value Types. They never implement
numeric, temporal, collation, identity, or domain semantics by coercing values
to strings or by relying on JavaScript or provider defaults.

A specialized operator is valid only when it declares:

- typed inputs and output;
- deterministic reference semantics;
- exact, incremental-equivalent, approximate, recursive, or fixpoint evaluation
  class;
- dependency behavior;
- required capabilities;
- error behavior;
- deterministic in-memory evaluation.

Only exact acyclic deterministic operators belong to the portable core. Other
classes require named capability semantics and visible precision or convergence
facts where applicable.

An opaque operator without fine-grained dependency facts conservatively depends
on its complete logical input.

A semantic limit inside a Read changes the logical result. An Interest window
does not.

### Read requirements

A Read declares semantic requirements rather than preferred topology:

- coherence such as snapshot, monotonic, or explicitly eventual;
- acceptable freshness or staleness;
- ordering, null, and collation semantics;
- exact Value Type, numeric, temporal, unit, and operator semantics required by
  filtering, ordering, grouping, and aggregation;
- aggregate, traversal, search, spatial, temporal, rank, membership, or extent
  capabilities;
- whether cached or offline answers are permitted;
- whether partial Interest satisfaction is useful.

An Adapter MUST reject requirements it cannot satisfy. It MUST NOT silently
weaken consistency, ordering, completeness, freshness, or authorization.

Cost estimates, indexes, cardinality hints, locality, and provider affinity MAY
influence placement. They MUST NOT influence logical results.

### Query Sets

A Query Set is an ordered schema-resource collection of compatible named Read
Definitions. Every member exposes the same declared input signature and a
compatible output shape. Stable Query keys identify members; labels and list
position do not.

A Query Set permits a Query-key State or Selection to choose logical Read
behavior without changing the graph's Input Binding structure. Its entries are
schema resources, not domain records, and do not gain record storage, Mutation,
deletion, or synchronization semantics.

## Ordered Relations

Every ordered Relation declares:

- stable Row identity unique within the logical Relation;
- deterministic total order;
- direction for every order term;
- explicit null placement;
- collation or comparison semantics;
- a final unique identity tie-breaker.

Source iteration order is never logical order. Equal user-visible sort values
are resolved by the declared tie-breaker.

Ordering compares typed values through their declared semantic operator.
Lexical order of a canonical string is irrelevant unless the Value Type is text
with that exact collation or its codec explicitly defines an order-preserving
encoding and the Adapter proves equivalence.

Relation observations expose bounded facts explicitly:

```ts
interface RelationSnapshot<Row> {
  windows: readonly RelationWindowResult<Row>[];
  membership: readonly Membership[];
  extent: Extent;
  coverage: RelationCoverage;
}

interface RelationWindowResult<Row> {
  id: InterestId;
  rows: readonly Row[];
  before: Continuation;
  after: Continuation;
}
```

All facts inherit the enclosing Observation's Read Data Revision and Evaluation
Revision. A Relation snapshot never combines facts from incompatible revisions
while claiming coherence.

Window results follow canonical Interest order. Membership results follow
canonical Row-identity order. Runtime Implementations may index them internally;
the public form remains immutable, serializable, and deterministically
comparable.

### Relation windows

Three semantic window forms cover expected UI demand:

```ts
type RelationWindow =
  | {
      id: InterestId;
      kind: "edge";
      origin:
        | { kind: "start" }
        | { kind: "end" }
        | { kind: "after"; cursor: RelationCursor }
        | { kind: "before"; cursor: RelationCursor };
      count: number;
    }
  | {
      id: InterestId;
      kind: "rank";
      start: number;
      count: number;
    }
  | {
      id: InterestId;
      kind: "anchor";
      identity: RowIdentity;
      before: number;
      after: number;
    };
```

- Edge windows support growing prefixes or suffixes and infinite scrolling.
- Rank windows support virtual tables addressing visible positions.
- Anchor windows preserve context around a stable identity while surrounding
  membership changes.

An Adapter MAY support only a subset. Rank addressing, exact rank, and exact
extent are capabilities because some stores cannot provide them efficiently or
consistently.

Provider cursors remain inside the Data Runtime and Adapter Seam. Presentation
and State MUST NOT persist provider cursors. A `RelationCursor` is instead a
runtime-issued logical continuation scoped to one Bound Read, ordering,
security partition, Source Epoch, issuing Read Data Revision, and declared
continuation policy. It does not claim a durable rank. Use against an
incompatible Read, ordering, security partition, epoch, or revision policy
produces explicit expiry or replacement rather than a possibly skipped suffix.

`InterestId` identifies one requested window slot within an Observation
generation. Updating the same identity replaces that slot. Reusing it with a
different window kind discards prior coverage. It is not Read identity, cache
identity, cursor, or durable State.

Adjacent and overlapping windows deduplicate by Row identity and preserve
canonical order. Callers needing positional stability SHOULD use anchor or edge
semantics rather than treating rank as durable identity.

### Continuation facts

Each window edge reports one of:

- `available`: traversal can continue;
- `exhausted`: no Row exists beyond that edge at the stated revision;
- `unknown`: neither fact has been established.

```ts
type Continuation =
  | { kind: "available"; cursor: RelationCursor }
  | { kind: "exhausted" }
  | { kind: "unknown" };
```

An empty returned window does not prove an empty Relation. It may represent an
empty region, rank beyond the known end, invalidated coverage, or incomplete
knowledge.

## Interest, Coverage, Membership, And Extent

Interest describes which parts of an already-defined result are currently
needed:

```ts
type RelationInterest = {
  windows: readonly RelationWindow[];
  membership: readonly RowIdentity[];
  extent: "none" | "lowerBound" | "estimate" | "exact";
};
```

Interest MUST NOT:

- alter predicates or ordering;
- authorize access;
- become domain State; a declared State value MAY derive or update Interest,
  but the resulting Interest remains transient observation demand;
- enter Operation history;
- be confused with a change-stream Resume Token;
- determine whether a Row logically belongs to a Relation.

Search text, chosen filters, user-selected ordering, and a semantic date range
normally bind Read inputs because they change the logical result. Viewport,
overscan, prefetched windows, and visible identities normally form Interest
because they change only materialized coverage.

Field projection is fixed by the compiled Read. The Compiler MAY emit distinct
projected Reads for different consumers. Activating or deactivating Presentation
nodes opens or closes those Reads; it does not mutate an existing Bound Read's
output projection. This preserves type safety, authorization, static analysis,
and cache safety.

### Interest satisfaction

Interest satisfaction is `complete` or `partial` for the requested windows,
membership probes, and extent facts.

Complete Interest satisfaction does not mean the complete Relation is loaded.
A fifty-Row window can be completely satisfied while the Relation contains
millions of Rows.

### Coverage

Coverage records which windows are materially known at one coherent revision.
Unknown gaps remain explicit. Combining cached fragments MUST NOT imply
coverage between them.

A finite Relation is fully materialized only when contiguous coverage reaches
proven exhausted edges. Exact extent alone does not mean Row values are loaded.

### Membership

Membership is:

```ts
type Membership =
  | { kind: "present"; identity: RowIdentity }
  | { kind: "absent"; identity: RowIdentity }
  | { kind: "unknown"; identity: RowIdentity; reason: UnknownReason };

type UnknownReason =
  | "outsideCoverage"
  | "evicted"
  | "stale"
  | "sourceUnavailable";
```

- `present` proves membership at the stated Relation revision.
- `absent` proves non-membership at that revision.
- `unknown` means available knowledge cannot decide.

Missing from a window is not absent. Evicted is not absent. Outside current
coverage is not absent. Whole-Read authorization denial is an error. A
policy-filtered Relation may intentionally report an identity as absent without
revealing whether it exists outside the caller's authorized Relation. A
Selection may reconcile away an identity only from a sufficiently fresh
authoritative `absent` proof in its own security partition.

Reads MAY expose deleted-versus-never-existed as explicit domain data. The base
membership Interface does not infer that distinction.

### Extent

Extent is:

```ts
type Extent =
  | { kind: "exact"; value: number }
  | { kind: "estimate"; value: number; confidence?: number }
  | { kind: "lowerBound"; value: number }
  | { kind: "unknown" };
```

Only exact extent zero proves an empty Relation. Estimates and lower bounds
MUST NOT drive destructive reconciliation or exact pagination controls.

Membership, extent, windows, and aggregate facts published together describe
one coherent revision unless the Read explicitly declares eventual composition.

## Observation Semantics

### Read observation

```ts
interface DataObservation<Output> {
  getSnapshot(): ReadObservationSnapshot<Output>;
  subscribe(listener: () => void): DataSubscription<Output>;
  update(request: DataObserveRequest<Output>): void;
  close(): void;
}

interface DataSubscription<Output> {
  initial: ReadObservationSnapshot<Output>;
  close(): void;
}
```

`getSnapshot` is synchronous. Resolution behind it may be asynchronous. A
finite resolver for server and CLI callers is built over the same Observation
semantics and does not introduce a second Read model.

Data subscriptions use the same atomic initial-snapshot and serialized,
non-reentrant notification protocol as Host subscriptions.

### Observation lifecycle

```ts
type UnavailableReason = {
  code: "unresolvedInput";
  input: string;
};

type ReadObservationSnapshot<Value> =
  | {
      phase: "unavailable";
      generation: number;
      reason: UnavailableReason;
    }
  | {
      phase: "loading";
      generation: number;
    }
  | {
      phase: "ready";
      generation: number;
      evaluationRevision: EvaluationRevision;
      readDataRevision: ReadDataRevision;
      freshness: "current" | "stale" | "unknown";
      satisfaction: "complete" | "partial";
      refresh: "idle" | "loading" | "failed";
      overlay: PredictionOverlayProvenance;
      value: Value;
      issue?: DisplaySafeIssue;
    }
  | {
      phase: "error";
      generation: number;
      issue: DisplaySafeIssue;
    };

type PredictionOverlayProvenance =
  | { kind: "none" }
  | {
      kind: "applied";
      revision: OverlayRevision;
      invocations: readonly QualifiedInvocationId[];
      projection: "complete" | "partial";
    };
```

- `unavailable` means evaluation is intentionally inactive because a required
  upstream input is unresolved.
- `loading` means no usable value exists for the current generation.
- `ready` means a usable value exists. It may be current, stale, or of unknown
  freshness and may
  partially satisfy Interest.
- `error` means no usable current value exists and the latest attempt failed.
- refresh failure MAY retain a ready stale value with a display-safe issue.
- empty is a value fact, not a lifecycle phase.
- stale is freshness, not absence.

`readDataRevision` and freshness describe the authoritative base.
`overlay.revision` identifies deterministic local Prediction replay and never
masquerades as Read Data Revision. Interest satisfaction describes the visible
composite result; it becomes partial when a Prediction cannot safely reconstruct
all requested facts.

Invalid Read, unsupported capability, authorization denial, and Adapter failure
are diagnostics or errors, not unavailable states.

`current` means the result satisfies the Read's declared freshness requirement
relative to known Source progress. `stale` means the value is usable under
policy but is known not to satisfy that requirement. `unknown` means Source
progress cannot be established and is valid only when the Read explicitly
permits unknown freshness. Freshness never means wall-clock recency without a
declared clock and policy.

A retained value for the same Bound Read remains `ready` and stale. A value from
a prior Bound Read may be exposed separately only with its prior Read identity,
generation, and revision and an explicit not-current designation.

### Atomic publication

Every publication is coherent. Relation membership, order, Row values, extent,
and aggregate facts for one revision become visible together. Callers never
observe a new Row manifest with old Row values or a partially applied Adapter
delta.

Subscriptions signal that a new immutable snapshot is available. They do not
deliver mutable event payloads. Structural sharing SHOULD retain identity for
semantically unchanged values.

### Generations and races

One Observation generation identifies the canonical Bound Read and Interest
tuple. A canonically changed tuple increments the generation exactly once; an
equivalent update retains the current generation. Every Adapter request and
event carries that generation. Coverage from older Interest may be reused
internally, but older events cannot satisfy the newer generation until
revalidated.

Late events from older generations MUST NOT overwrite current demand.
Correctness MUST NOT rely on cancellation succeeding; cancelled remote work may
still complete and must be ignored.

Closing an Observation releases its Interest and prevents future publication
to that caller. Adapters tolerate close, cancellation, and Interest changes
racing with in-flight events.

### Progressive and chunked results

A Transport Adapter may deliver a large replacement in chunks. The runtime
either assembles all chunks before one coherent publication or publishes
explicit partial coverage at one stated revision. Interrupted chunks MUST NOT
silently become a complete result.

## Static Dependency Analysis

Every compiled Read carries a conservative manifest:

```ts
interface ReadManifest {
  logicalSources: readonly LogicalSourceReference[];
  sourceBindingRequirements: readonly SourceBindingRequirement[];
  dependencies: readonly ReadDependency[];
  requiredCapabilities: readonly Capability[];
  rowIdentity?: RowIdentityDefinition;
  ordering?: TotalOrderDefinition;
}

interface ReadDependency {
  source: LogicalSourceReference;
  selector: DependencySelector;
  roles: readonly (
    | "membership"
    | "ordering"
    | "projection"
    | "aggregate"
    | "traversal"
  )[];
}
```

A selector may identify Field References or entity-scoped slot bitmaps,
relationships, key ranges, time intervals, spatial regions, graph edges,
aggregate groups, or a complete Source. It contains no unresolved semantic
field names and describes logical dependencies, not physical indexes.

Dependency roles matter:

- membership changes may add or remove Rows;
- ordering changes may move Rows;
- projection changes may update known Row values without changing membership;
- aggregate changes may update scalar or grouped outputs;
- traversal changes may alter graph reachability or path identity.

Static analysis is conservative. Uncertain relevance causes reevaluation or
invalidation, never a false claim that stale data is current.

Dynamic inputs refine the manifest after binding. The unbound manifest remains
a safe upper bound.

### Selective demand

The runtime demand footprint is the union of:

```text
active observations
+ prefetch Interest
+ explicit offline pins
+ active Prediction, reconciliation, or retry dependencies
+ in-flight Intent, State Transition, or Operation input resolution
+ declared background demand policies
```

Static UI analysis identifies possible Reads and dependencies. Runtime Interest
identifies active windows and identities. This may guide selective sync, cache
retention, batching, and placement.

Demand analysis is an optimization, never authorization. When analysis is
uncertain, runtime over-fetches, invalidates, or executes remotely rather than
omitting correctness-critical data.

### Static interaction analysis

Compiled Surfaces, Presentation projections, Input Bindings, conditional instances,
and Operation Predictors contribute a conservative demand graph. The Compiler
can explain:

- Reads that may become active and the State or Selection inputs that bind them;
- possible Relation, membership, extent, and field-projection Interest;
- scopes and dynamic keys that create repeated instances;
- Reads needed by not-yet-incorporated Predictions or offline policy;
- required Adapter, Renderer, and domain capabilities.

A custom Renderer does not obscure demand because it consumes compiled
Presentation references. A custom Presentation projector must declare its
inputs. Host-level or Data Runtime-level custom UX may be dynamically opaque;
it may provide a conservative manifest, but runtime Observations remain the
source of current demand. Missing static knowledge reduces optimization and
prefetch quality, never correctness or authorization.

## Read Execution Placement

Read execution placement is an Implementation decision hidden by the Data
Runtime Interface.

### Local execution

A Read may execute locally only when sufficient Source coverage, compatible
operator semantics, authorization partition, freshness, and coherence are
proven. Having some cached Rows is not proof that a local filter, order,
aggregate, or traversal is correct.

### Remote execution

A remote Adapter validates the registered Read, canonical inputs, trusted actor
context, capabilities, authorization, and Interest. It does not trust a
client-provided provider plan or dependency manifest.

### Hybrid execution

A plan may split operators across locations only when operator order and
semantics are preserved.

For example:

```text
filter -> order -> window -> project -> format
```

Filtering and ordering operate against complete candidate coverage before
windowing. Row-local projection or formatting may occur after windowing when
all required values are present. A whole-Relation aggregate cannot be computed
from a visible window.

Adapter preparation or placement rejects every physical plan that filters or
orders after applying a partial window. Definition compilation records semantic
operator order and coverage requirements; final placement validation proves the
selected Adapter plan satisfies them.

Planner changes caused by connectivity, indexes, cache coverage, cardinality,
or cost MUST NOT change Observation meaning.

Cross-Source Reads either satisfy an explicitly declared coherence model or are
rejected. Runtime MUST NOT fabricate snapshot isolation across unrelated
stores.

### Presentation placement

Pure Presentation projection may execute on client or server when all declared
inputs, scope facts, and contract versions are available. Equivalent inputs at
the same Evaluation and Read provenance produce equivalent snapshots.
Projection caches include semantic fingerprint, Program and Resource basis,
reference and scope identity, canonical inputs, Source Bindings, security
partition, and dependency provenance. They never share actor-sensitive display
facts across incompatible partitions.

Server projection can reduce client work or support rendering and agents;
client projection can react immediately to local State and Predictions. The
placement decision does not change Intents, accessibility facts, or lifecycle.

## Computed Values And Evaluation

Computed data deepens the existing Read and interaction model; it does not
introduce a second data model or a generic executable callback layer.

| Required result | Architectural expression |
| --- | --- |
| Data-derived scalar, aggregate, structure, or Relation | named Read |
| Internal pure step in one Read | Derivation |
| Reusable pure value from State, Selection, or Read outputs | Computed Value |
| Renderer payload shaping | Presentation projection |
| Independently evolving external data | Source |
| Authoritative persisted derived value | Authority-owned generated-value invariant applied or validated for every affected Commit |
| Nondeterministic or effectful work | Source, Operation, or External Effect |

A Computed Value is warranted only when several downstream Input Bindings need the
same non-visual interaction result or a caller needs to observe it directly:

```ts
interface ComputedValueDefinition<Inputs, Output> {
  id: ComputedValueId;
  scope: ScopeDeclaration;
  inputs: InputShape<Inputs>;
  output: OutputShape<Output>;
  expression: DeclarativeExpression;
  requirements: ComputationRequirements;
}

interface CompiledComputedValue<Output> {
  resourceRevision: ResourceRevision;
  fingerprint: SemanticNodeFingerprint;
  manifest: ComputationManifest;
  output: OutputShape<Output>;
  expression: CompiledDeclarativeExpression;
}
```

It is immutable and cannot be set by an Intent. Its expression contains
portable operators or named versioned capabilities, not a TypeScript closure.
It uses the Interaction Host lifecycle when observed. Internal Derivations do
not gain independent loading, error, subscription, or retention policy.

Expression literals and operators use compiled Value Types. Exact decimal,
integer, temporal, unit, text, and structured operations therefore retain the
same semantics in local, remote, incremental, and materialized evaluation;
implementations cannot substitute JavaScript coercion or provider defaults.

The Compiler, not authoring data, derives Resource Revision, semantic
fingerprint, resolved references, and the conservative dependency manifest.

A normal value Input Binding satisfies a Computed Value input only when its
declared readiness requirement is met. Unresolved, loading, and error states propagate
unless an input explicitly consumes that lifecycle fact. Stale, partial, or
unknown-freshness input is accepted only when declared. Computation never
upgrades input freshness, coverage, authorization, or coherence.

Several Read inputs retain their complete independent provenance tuple unless
the Computed Value declares a stronger input-coherence requirement that Runtime
can prove or rejects as unsupported. Its Security Partition is at least as
restrictive as every dependency. Computation cannot declassify protected data
without a named, authoritative declassification capability.

An authoritative generated value is an Authority invariant, not merely one
Operation planner convention. A named Authority capability applies or validates
it atomically for every affected Commit and exposes deterministic reference
semantics.

### Three graphs

The architecture distinguishes three graphs:

1. The **semantic graph** is compiler-owned canonical meaning: operators,
   dependencies, types, fingerprints, and resource identity.
2. The **instantiated evaluation graph** is runtime state for current Bound
   Reads, Scope Instances, canonical parameters, active demand, and overlays.
3. The **physical execution graph** is Adapter-private SQL, indexes, graph
   traversal, distributed work, or materialized-view access.

Placement selects or changes the physical graph. It never changes the semantic
graph. Runtime instantiation and lease sharing never change resource meaning.

A semantic node fingerprint includes operator identity and version, canonical
configuration, output type, dependency meaning, and referenced capability
versions. It excludes SQL, provider cursors, index names, physical placement,
and current cache contents.

The portable core is an acyclic graph of exact deterministic operators.
Recursion, fixpoints, constraint solving, approximate sketches, distributed
incremental joins, GPU or ML execution, and provider-specific computation are
named capabilities with explicit convergence, error, precision, provenance,
and work contracts.

### Demand-driven evaluation

Required roots are exactly:

```text
active Observations
+ explicit prefetch or offline pins
+ active Prediction, reconciliation, or retry dependencies
+ in-flight Intent, State Transition, or Operation input resolution
+ declared background demand policies
```

Runtime marks affected nodes dirty, then evaluates only the transitive dirty
closure required by those roots. An undemanded descendant may remain dirty
until demanded. One node shared by a diamond graph evaluates at most once in one
atomic evaluation pass that produces at most one Evaluation Revision.
Equivalent concurrent demand coalesces while each lease keeps independent
lifetime.

Every non-Observation root has an explicit lifetime owner and work, retention,
and cancellation budget. Persisting a pending Invocation alone does not keep its
entire dependency graph hot indefinitely.

Static manifests are conservative upper bounds. Runtime traces may narrow the
active dependency set only when every guard capable of selecting a different
branch remains a dependency. Otherwise changing a guard could make an
untracked branch relevant without invalidation.

Computation dependencies distinguish the aspect observed where relevant:

- value, membership, ordering, extent, or aggregate;
- lifecycle and availability;
- coverage and freshness;
- Read and Source provenance;
- issue state;
- optimistic overlay status.

Equal output values do not erase a change in an observable dependency aspect.
A new revision, freshness state, coverage proof, issue, or overlay basis may
require publication even when the value compares equal.

### Fact caches and memo validity

Caching and memoization are Implementation concerns, not Read or Computed Value
meaning. Their ownership remains local:

- Data Runtime owns Source-fact caches and Read or Derivation memo entries;
- Interaction Runtime owns State-derived, Computed Value, and Presentation
  projection memo entries;
- Read Execution Adapters may own transparent provider caches and
  materialized-view plans.

A memo entry is valid only with a complete proof compatible with:

```text
semantic node fingerprint
+ canonical bound inputs and scope
+ Record Model Revision vector and Resource Revision compatibility
+ Value Type, codec, operator, and capability versions
+ Source Instance and Source Binding Revision vectors
+ Security Partition Identity
+ Source Epoch vector and Read provenance vector
+ coverage and fact kind
+ Overlay Revision, Invocation sequence, and Predictor versions when speculative
```

The root Program Revision records provenance but is not the sole reuse proof.
Source facts may survive an unrelated Program change after their Source Binding,
Record Model, codec, security, and Source provenance are revalidated. Derived memo
entries require semantic-fingerprint compatibility. Names alone never prove
reuse.

Interest identifies coverage within one logical Read. It is not the complete
Read identity. A Source-fact cache may independently retain:

- ordered Row-key manifests;
- projected Row values and entity-scoped Field Slot masks;
- membership proofs;
- Relation windows and edge proofs;
- extents and aggregates;
- Adapter resume information.

Every fact carries compatible revision, coverage, freshness, Source Binding, and
security provenance.

### Invalidation and failure

- cache miss or eviction means unknown, not absent or deleted;
- stale data is usable only under declared freshness policy;
- fragments from incompatible revisions never claim one coherent result;
- projection supersets satisfy subsets only within compatible authorization,
  slot codec, and provenance;
- invalidation marks dirty, triggers demanded reevaluation or replacement, and
  is never a Mutation;
- uncertainty causes conservative invalidation, never a false-current value;
- deterministic declared outcomes, including semantic errors, may be memoized
  against their complete basis;
- transient Adapter, Transport, cancellation, deadline, and obsolete-generation
  failure never populates a semantic memo;
- exact incremental evaluation MUST be observationally equivalent to full
  canonical recomputation; approximate capabilities satisfy their separately
  declared precision and merge contract;
- cold, warm, disabled, restored, and evicted memo state may change permitted
  loading timing and work but not any published semantic claim;
- retained memo and Source coverage obey declared memory and work budgets;
- cache keys, materializer locators, and physical plans never leak into
  Definition or Presentation.

### Materialization

Three cases remain distinct:

1. **Ephemeral memo:** rebuildable, freely evictable, and invisible to callers.
2. **Derived materialization:** persisted or shared acceleration with explicit
   ownership, refresh, retention, failure, lineage, and rebuild policy. It
   remains derived and discardable.
3. **Authoritative derived value:** committed state governed by Authority
   atomicity, Record Model Transition, witnesses, audit, and Mutations. It is not a
   cache.

A transparent provider materialized view stays inside a Read Execution Adapter.
If a managed materialization is exposed as a logical Source consumed by Reads,
or exposes a management-status Read, it has its own Source Epoch, freshness,
coverage, dependency lineage, and conformance contract. Callers still observe
Reads, not Sources. An asynchronously refreshed projection cannot claim the
snapshot semantics of its inputs unless it proves them.

Incremental materialization is an optimization capability. Update-order
sensitive floating-point aggregates, sketches, search scores, or other
approximate algorithms declare their exact or approximate semantics rather than
claiming equivalence they cannot provide.

### Cross-Source and optimistic computation

A cross-Source computed result carries the exact composite Source provenance
required by the enclosing Read or Computed Value input-coherence contract.
Equal values from incompatible revision vectors do not share a memo entry.
Common-snapshot, monotonic, and explicitly eventual composition are distinct
claims; no runtime invents a global revision.

Committed and speculative computation use separate memo partitions. A
speculative entry includes authoritative base provenance, Overlay Revision,
Invocation order, and Predictor versions. Equal predicted and committed values
do not make their provenance interchangeable. Settlement advances the base,
removes settled Predictions, replays the remaining overlay, and evaluates the
demanded dirty closure once.

Partial candidate coverage cannot prove a whole-Relation aggregate, rank, or
membership result. Prediction and computation degrade such facts to partial or
unknown instead of inventing an answer.

## Interaction Model

### Program graph

The compiled interaction program is a directed graph:

- State, Read observation, Selection resolution, Computed Value, and
  Presentation are nodes;
- Input Binding is a typed edge;
- State Transition, Read publication, authoritative Commit, persistence
  update, and external environment update are graph events;
- Surface order is layout only and never evaluation order.

The graph is acyclic under ordinary evaluation. A node reevaluates only when a
declared dependency changes. One event evaluates the complete dirty closure
required by demanded roots and explicit background policy, then publishes one
coherent interaction revision. Undemanded descendants may remain dirty.

Constraint solving, recursive graph evaluation, and fixpoint semantics require
named capabilities with their own convergence and failure contracts.

### Repeated and parameterized instances

Definitions may create repeated, conditional, routed, modal, or otherwise
parameterized instances without creating anonymous runtime state.

One Scope Instance is identified by:

```text
Scope Declaration Identity + stable scope key
```

One dynamic Resource Instance is its stable Resource Identity plus that Scope
Instance. Canonical parameters and exact Resource Revision are part of its Bound
reference and evaluation generation, not automatically part of Scope Instance
or Resource Instance Identity. Runtime never independently concatenates every
parameter into identity. A declaration that needs
parameter-distinct instances makes the relevant canonical parameter digest its
explicit scope key.

For a Relation-backed repeat, the scope key is Row identity, never rank, array
position, viewport slot, or renderer key. Parameters arrive through declared
Input Bindings. Reordering a Row preserves its instance identity. Removing it closes
the instance and releases its Observation demand. Reintroduction creates or
restores State only according to the declared scope retention or persistence
policy.

State sharing is explicit. A repeated child either uses State in its own scope
instance, binds to a declared ancestor scope, or addresses a named shared State
node. Naming coincidence never shares State. Closing one instance MUST NOT
cancel shared Observations still demanded by another instance.

The runtime MAY coalesce equivalent Reads and Interests across instances while
retaining independent lifetimes and Presentation references. Definitions and
renderers do not create one physical subscription per visible cell by default.

### Typed State

State declares:

- stable State Resource Identity and Scope Declaration;
- value type and cardinality;
- initialization and default policy;
- reset policy;
- optional persistence, external-update, and conflict policy.

The portable State policy is closed over these decisions:

- initialization is `default`, `persistedThenDefault`, or `requiredPersisted`;
- reset targets `initial`, `latestPersisted`, or `default`;
- persistence is `none`, `readOnly`, or `writeThrough`;
- an external update is `adopt`, `adoptIfClean`, `ignore`, or `conflict`;
- a persistence conflict is `retainLocal`, `adoptExternal`, or
  `requireExplicitResolution`.

Unsupported combinations reject compilation or binding. Specialized
persistence semantics require a named capability rather than an untyped policy
object.

Scope and persistence are independent. Memory, URL, path, session storage, or a
custom Adapter may initialize and reflect State, but the persistence medium
does not own State semantics.

The complete portable persisted-state address is:

```text
Program Identity + State Resource Identity + Scope Instance Identity
+ Security Partition Identity + State Persistence Binding Revision
```

The envelope also carries exact State Resource Revision and Value Shape/codec
basis for compatibility and decoding. Current parameters are not part of the
address unless the declaration deliberately derives the stable scope key from
their canonical digest. Identically named State, scopes, media, or security
partitions therefore cannot collide.

A State Persistence Binding Revision is the trusted logical association between
declared State and one persistence namespace plus Adapter contract. It carries
no credential or physical locator. Changing the selected medium or namespace
creates a new revision and requires explicit initialization or migration policy.

Declared scope may be Surface, route, layout, session, or another named runtime
scope with explicit identity and visibility rules. Repeating one Presentation
of a scoped State does not create another value. State in different scope
instances remains isolated.

Persistence is bidirectional projection: it may initialize State and report
external navigation or storage changes, while committed State may update the
medium. Runtime owns codecs, validation, canonicalization, update ordering, and
feedback-loop prevention. Persistence never turns interaction State into a
domain record implicitly.

`writeThrough` publishes local State first and then exposes `pending`,
`synchronized`, `conflict`, or `failed` persistence status through the
Transition Handle and the State's observable snapshot. A use case requiring
persistence acceptance before visible State publication is a different named
capability; it is not ordinary State.

`readOnly` never reports a write lifecycle. A valid persisted value reports
`readOnly/synchronized`; permitted fallback after a missing value reports
`readOnly/defaulted`; and an accepted local transition or ignored external
update that differs from persistence reports `readOnly/diverged` with its
persisted or missing basis. Missing or invalid persistence under
`requiredPersisted` makes the State unavailable and produces no false default
snapshot. Other read-only conflicts use the same explicit conflict reference
and resolution policy as write-through State.

`requireExplicitResolution` publishes a stable
`StatePersistenceConflictReference` containing the persisted-state address,
local generation, external Persistence Revision, and safe competing values.
The State Definition exposes compiler-issued `retainLocal` and `adoptExternal`
State Transition References. Dispatch validates that the conflict reference is
still current and applies the selected value. For `writeThrough`, the
transition starts a new compare-and-set write. For `readOnly`, `adoptExternal`
adopts the current persisted value and `retainLocal` reports divergence without
writing. A stale resolution rejects. The conflict remains observable after the
originating Transition Handle closes until it is resolved or reset by declared
policy.

The core scalar persistence status means one State Transition writes at most one
State Persistence Scope. It may change several State values only when they share
one Adapter and atomic `StatePersistenceCommit`. A multi-target transition
requires a named capability with a status vector and explicit partial-failure
algebra.

A State declared with a domain Value Type contains an accepted typed value, not
an arbitrary formatted string. UI controls that must represent incomplete or
locale-formatted input use an explicit draft shape containing raw Presentation
input plus its latest parse status and optional accepted value. Draft text
cannot satisfy a domain input until the declared parser succeeds.

Defaults initialize according to policy. They do not continuously overwrite a
valid committed value.

### Selection

Selection is State constrained by a declared selection domain. It stores
identities, not nested Rows.

```ts
type SelectionDomain =
  | { kind: "relation"; read: ReadReference<Relation<unknown>> }
  | { kind: "resourceSet"; set: SchemaResourceSetReference };
```

A Relation domain resolves membership from authoritative Read facts and may be
partial or asynchronous. A resource-set domain resolves identity membership
from the Compiled Program. Runtime capability or policy may make a present
resource unavailable for use, but that availability is not Relation coverage
and does not cause record synchronization or membership probes.

Selection tracks at least:

- candidate value retained from State or persistence;
- membership resolution: present, absent, or unknown;
- resolved value safe for consumers requiring authoritative membership.

For a Relation domain, runtime requests membership Interest for selected
identities even when they are outside visible windows.

Candidate identity may drive the membership probe or other explicit resolution
Read. Ordinary consumers that require a source-constrained value receive only
the resolved value unless their input contract explicitly accepts unknown
membership.

Relation-domain reconciliation rules:

- retain identities proven present;
- preserve candidates while membership is unknown;
- remove or repair only after authoritative absence at a compatible revision;
- preserve identity across option reordering;
- apply a default only after authoritative reconciliation permits it;
- exact empty Relation and empty loaded window remain distinct;
- publish reconciliation and dependent results atomically.

A `first` default requires a start-edge result under the declared total order.
It cannot be inferred from an arbitrary loaded window.

Resource-set reconciliation validates a candidate against the exact compiled
set and declared availability policy. Program revision change explicitly
revalidates persisted resource keys. It never interprets missing domain records,
cache eviction, or Read errors as resource absence.

### Selectable values and Query Sets

Selection mechanics are shared without erasing value types:

- a schema-resource Selection may contain a Query key;
- a data Selection may contain a record or Row identity;
- scalar, enum, date, range, and many-valued State use the same scope,
  persistence, and Input Binding infrastructure when their semantics require it.

A Query key cannot satisfy a record input. A record identity cannot choose a
Query. A date range cannot satisfy text input. Compiler validation preserves
value kind, target entity or schema resource, and cardinality.

A Query-key Selection may choose one member of a compatible Query Set without
changing the graph's Input Binding structure.

Selectable Reads may project a common option shape containing stable identity,
label, availability, selected state, optional count, and Intent. A Query option
and a record option can share Presentation while retaining distinct identity
types and membership semantics.

### State Transition

State types derive canonical local transitions such as set, clear, toggle, add,
or remove. Authors do not declare repetitive handlers for routine controls.

One State Transition:

1. validates the Intent and value;
2. stages the State change;
3. reevaluates the dirty dependency closure;
4. reconciles affected Selections with available membership proofs;
5. resolves consumer inputs;
6. commits one immutable interaction revision;
7. notifies changed observations;
8. runs declared persistence effects.

Intermediate graph states never leak. Layout order never determines evaluation
order.

Persistence failure does not retroactively corrupt the already applied State.
It produces explicit persistence status and retry/canonicalization behavior.

### Input Bindings

Input Bindings connect compatible producers and consumer inputs. The compiler
validates value kind, entity, cardinality, scope visibility, requiredness, and
signature. Compatibility follows compiled Value Shapes. A declared conversion
is an explicit pure Computed Value or named conversion Resource in the graph;
it is not behavior owned by the edge. Sharing a JavaScript primitive or
canonical string encoding does not make two types compatible. An Input Binding
never performs string, number, boolean, temporal, identity, or JSON coercion.

No dependency is inferred from matching names, layout order, relationship
names, or Presentation type.

Unresolved required inputs make only dependent nodes unavailable. They MUST NOT
broaden a Query to all records.

Common Input Bindings include:

- Query-key Selection to the Read chosen for a result;
- record Selection to a required Read input;
- record Selection to an identity result or detail Presentation;
- State or Selection to create defaults;
- State, Selection, Computed Value, literal, or Read output to Operation input;
- State, Selection, Read output, or Computed Value to another compatible
  Computed Value, Read, or Presentation input;
- Read aggregates or counts to section and option Presentation;
- environment inputs such as explicit current date, locale, or authenticated
  scope to compatible runtime inputs.

Multiple consumers may bind to one producer. One consumer may bind inputs from
multiple producers when the graph remains acyclic.

The ordinary graph is acyclic. Mutually constrained domains require a compound
State node or a named constraint-solving capability with its own Interface and
invariants.

### Ordinary create and edit forms

Routine record forms use the same State, Read, Input Binding, Operation, and
Presentation model. They do not require a specialized editor runtime.

One form scope owns slot-addressed draft State plus dirty, touched, issue, and
local validation facts. Each field draft distinguishes raw Presentation input,
parse status, and the latest accepted typed value. Controls such as toggles may
produce an accepted value directly; textual decimal, temporal, and structured
editors may retain incomplete raw input without corrupting the domain value.
Current names and labels are Presentation metadata. An edit form binds an
identity Read and its Record Revision as the authoritative base. A create form
binds declared defaults. Initialization occurs according to policy; a later
Read publication MUST NOT silently overwrite dirty draft fields.

Pure field and cross-field rules MAY validate draft State for immediate
feedback. Authority repeats all required validation and may return structured,
display-safe field or form issues. Local validity is never authorization or a
promise of acceptance.

Reset restores the latest compatible base or declared defaults. Cancel closes
or resets the form according to declared policy and does not invoke an
Operation unless cancellation is itself a domain action. Submit first requires
every submitted draft to have an accepted value under its exact Value Shape,
then dispatches one declared create or edit Operation with a stable Invocation
identity and the required base revision or witness. Raw draft strings never
enter a Mutation. Submission status comes from its
InvocationHandle. The authoritative outcome either supplies canonical accepted
values and Commit identity or preserves the draft with an actionable terminal
rejection, including structured conflict facts.

A compatible field rename or display reorder can preserve draft and issue state
because identity follows Field Slot. A retired or type-incompatible slot
requires explicit reconciliation and never silently attaches its draft to a new
same-named field.

Definitions declare double-submit, leave-while-dirty, post-commit reset, and
concurrent-base-change policy. Generated and custom renderers receive the same
form Presentation Contract and Intents. Rich text editors, spreadsheets,
collaborative buffers, and long-lived autosave drafts remain named specialized
runtimes because their internal operation and merge semantics are deeper than
ordinary form State.

## Presentation And Surface Composition

Presentation is orthogonal to State and data behavior. Tabs, lists, selects,
tables, boards, charts, calendars, maps, and custom renderers may display the
same logical State or Read without changing its semantics.

A Presentation Definition selects a registered Presentation Contract kind and
version. The contract specifies its serializable Snapshot shape, supported
Intents, accessibility facts, and fallback behavior. A runtime or Renderer that
does not support the required version MUST use an explicitly declared generic
fallback or report `unsupported`; it MUST NOT guess from fields or silently
drop behavior.

```ts
interface PresentationDefinition<Inputs> {
  id: PresentationId;
  inputs: InputShape<Inputs>;
  projection: PresentationProjection;
  contract: PresentationContractReference;
  unsupported: "error" | GenericFallbackReference;
}

interface PresentationContract<Payload> {
  kind: PresentationKind;
  version: PresentationContractVersion;
  payload: OutputShape<Payload>;
  intents: readonly IntentSignature[];
  accessibility: AccessibilityRequirements;
}

interface PresentationReference<Payload> {
  programRevision: ProgramRevision;
  definition: PresentationId;
  resourceRevision: ResourceRevision;
  scope: ScopeInstanceId;
  contract: PresentationContractReference;
  observable: ObservableReference<PresentationSnapshot<Payload>>;
}

interface PresentationSnapshot<Payload> {
  reference: PresentationReference<Payload>;
  payload: Payload;
  intents: readonly InteractionIntent[];
}

interface SurfaceDefinition {
  id: SurfaceId;
  composition: SurfaceCompositionProgram;
}

interface SurfaceSnapshot {
  reference: SurfaceReference;
  scope: ScopeInstanceId;
  children: readonly SurfaceChildSnapshot[];
}
```

`PresentationReference.definition` identifies the Presentation Resource;
`(definition, scope)` identifies its Resource Instance, while
`resourceRevision` identifies the exact semantics used for that instance.
Compilation and binding reject a reference whose Presentation Definition does
not declare that Scope Declaration. The fields are complementary and cannot
independently select different scopes or semantics.

The Presentation Contract is a registered semantic protocol, not merely a
shape inferred from one payload. Contract evolution follows explicit version
compatibility rules; Definition compilation resolves the exact required
version and fallback.

Presentation projects:

- stable identities and labels;
- accessibility facts;
- lifecycle, freshness, progress, and display-safe issues;
- bounded Relation windows and extent facts;
- selected and pending facts;
- Operation availability;
- semantic Intents.

Presentation does not contain:

- schema ASTs;
- provider cursors;
- raw credentials or access tokens;
- storage or transport clients;
- runtime callbacks;
- arbitrary framework nodes;
- effect implementations.

Surface composes Presentation References and layout. Conditional, repeated,
modal, and routed composition MAY react to declared Input Bindings, State, and
Presentation facts. Such composition participates in the compiled dependency
graph and controls instance lifetime and Observation demand. Surface does not
create hidden data dependencies from layout position or renderer behavior.

Master-detail and list-detail are ordinary composition: a selectable Relation,
one Selection, one identity Read, and any dependent Reads. A layout preset may
arrange them without introducing special dataflow semantics.

Grouped navigation is a projection over one selectable base Relation. Groups do
not create independent Selection State unless the Definition explicitly
declares it.

Candidate portable result shapes such as record, list, table, tree, board, chart,
calendar, map, compare, or repeat provide strong renderer-neutral semantics.
Specialized UX may register another result contract; arbitrary executable UI graphs
do not replace the data and interaction model.

Observation granularity follows semantic references and bounded results rather
than normalizing every cell into public State. Workspace and section references
carry structure and chrome; result references carry only requested Relation
windows; identity Reads carry focused detail. Stable Row objects and dependency
masks let renderers reuse unchanged Rows without exposing cache internals.

Viewport demand is Observation Interest, not an Operation or persisted State by
default. A paged route may explicitly model user-selected page State while the
underlying provider cursor remains private.

## Operation Model

### Operation, Invocation, Mutation, and Commit

These concepts remain distinct:

- Operation is named domain intent and policy.
- Invocation is one identified request to execute it.
- Mutation is an internal current-state effect.
- Commit is one authoritative atomic accepted batch.
- change stream is retained Commit evidence for synchronization and
  invalidation, not the domain contract or an eternal event source.

Presentation emits Operation Intents. It never emits Mutations or constructs
Commits.

### Operation Definition and planning Interface

An Operation Definition is schema-as-data. It names registered semantic policy
and pure planning capabilities; it does not embed an application callback:

```ts
interface OperationDefinition<Input, Output> {
  id: OperationId;
  input: InputShape<Input>;
  output: OutputShape<Output>;
  authorization: AuthorizationPolicyReference;
  planner: OperationPlannerReference;
  concurrency: ConcurrencyPolicy;
  prediction?: PredictorReference;
  audit: AuditPolicy;
  effects: readonly EffectContractReference[];
}

interface OperationPlanning {
  begin(request: PlanningRequest): PlanningDecision;
  continue(request: PlanningContinuation): PlanningDecision;
}

type PlanningDecision =
  | {
      kind: "needFacts";
      state: CanonicalPlanningState;
      requests: readonly FactRequest[];
    }
  | { kind: "accept"; attempt: CommitAttempt }
  | { kind: "reject"; outcome: TerminalRejection };
```

`begin` and `continue` are pure. The Authority Runtime resolves registered
planner identity and version, supplies canonical Invocation and trusted
context, performs authorized Fact batches, and feeds their witnessed Snapshots
back to the planner. Each batch is coherent at one Authority Epoch and
Authority Revision. Separate planning rounds may observe later revisions.
Planning state is canonical data and cannot carry provider handles,
credentials, closures, mutable objects, or ambient globals.

```ts
interface FactSnapshot {
  authorityScope: AuthorityScopeId;
  epoch: AuthorityEpoch;
  recordModelRevision: RecordModelRevision;
  revision: AuthorityRevision;
  facts: readonly WitnessedFact[];
}
```

The planner may combine facts from different rounds only as witnessed
propositions. Acceptance never assumes they were read simultaneously: the
Authority Store atomically proves every carried witness against one current
state before Commit. A planner requiring several facts from one historical
snapshot requests them in one batch or declares a stronger snapshot-read
capability.

External or cross-Authority Source facts may inform domain planning only as
explicit versioned assertions. The local Authority Store cannot atomically
revalidate them and they cannot become strong witnesses unless a named
coordinating capability proves that semantics.

Fact requests declare exact record, absence, unique-key, reference, predicate,
range, or other registered witness needs. They are finite and capability
checked. Authority Store independently enforces every registered invariant at
settlement; the planner is not a privileged escape from storage constraints.

The planner descriptor declares maximum rounds, fact cardinality, and pure work
class. Authority Runtime canonicalizes and deduplicates requests and enforces
those bounds. Exceeding them is a planner capability or internal failure, not a
stored domain rejection. Conformance proves termination for every built-in
planner and bounded generated cases for registered planners.

A Predictor has a separate pure Interface over declared locally available
facts. Sharing canonical validation and calculation functions with the planner
is encouraged, but Predictor inability or failure never prevents authoritative
execution.

### Record Mutation algebra

```ts
type FieldAssignment = readonly [field: FieldReference, value: CanonicalValue];

type RecordMutation =
  | {
      op: "create";
      identity: QualifiedRecordIdentity;
      values: ActiveCreateFieldValues;
    }
  | {
      op: "patch";
      identity: QualifiedRecordIdentity;
      expectedRevision: RecordRevision;
      set: readonly FieldAssignment[];
      unset: readonly FieldReference[];
    }
  | {
      op: "delete";
      identity: QualifiedRecordIdentity;
      expectedRevision: RecordRevision;
    };
```

Omission means untouched. `unset` explicitly removes an optional field. A
Field Reference cannot appear in both `set` and `unset`. Assignments and unsets
normalize by Entity Identity and strictly increasing slot order. Duplicate,
unknown, retired, wrong-entity,
wrong-type, metadata, or unauthorized slots reject. Record metadata references
are not Field Slots and are never patched as ordinary values. Optional absence
remains distinct from canonical null.
Each assignment is decoded against the exact active field Value Shape; sharing
the same JSON primitive or string encoding never permits cross-type assignment
or implicit coercion.

`ActiveCreateFieldValues` is a canonical field vector whose Record Model Revision must
exactly equal the Commit attempt and current Authority model. It contains only
active slots for the record's Entity Identity, applies required/default policy
deterministically, and cannot contain retained retired or erased payload.

Create proves that the identity belongs to a valid allocation and has never
previously been committed. Current record absence alone is insufficient. Patch
and delete require explicit concurrency preconditions. Operation-specific
semantics may add stronger witnesses.

A canonical Commit attempt contains at most one record Mutation per record
identity. Planning folds internal steps into one final Mutation:

- create followed by patch becomes one create;
- patch followed by delete becomes one delete against the original revision;
- create followed by delete becomes no record Mutation;
- no-op patches are omitted unless an explicit touch capability declares a
  material system change.

There is no universal record merge rule. Each Operation declares one of:

- apply intent to current authoritative state;
- strict record compare-and-set;
- explicit field or value witnesses;
- a named commutative semantic operation.

A Mutation whose `expectedRevision` is stale conflicts. An Operation may
deliberately replan field intent against current Authority state only when its
declared concurrency policy permits that behavior. Apparent field disjointness
alone never authorizes merge.

Routine entity authoring need not require a handwritten planner. A Definition
may request compiler-provided create, edit, and delete Operations parameterized
by declared field, authorization, validation, reference, delete, concurrency,
audit, and Prediction policy. They still cross the full Invocation and
Authority path. `create | patch | delete` remains the internal storage algebra,
not an unaudited client write Interface.

### Commit invariants

A Commit MUST:

- belong to exactly one Authority Scope and one active Record Model Revision;
- apply every Mutation or none;
- expose no intermediate record state;
- assign one Authority Revision and new revisions to materially changed
  records;
- durably record the terminal Invocation outcome, audit facts, and outbox
  intents in the same atomic transaction;
- preserve one stable Commit identity across duplicate delivery;
- carry its originating Invocation identity, Operation identity, and exact
  Resource Revision;
- be deterministic for the accepted canonical attempt;
- become observable atomically by Commit identity.

An accepted semantic no-op MUST create an empty Commit so its terminal outcome,
causal position, audit, stream correlation, and any outbox intent remain durable
without fabricating a record change.

Synchronization consumers use Invocation correlation to settle pending
Predictions when push arrives before, or instead of, the Invocation response.

One Invocation normally produces at most one Commit. Long-running or multi-step
work belongs to an explicit workflow capability with separate state semantics.

### Authority planning

Operation planning is deterministic and performs no external I/O or effects. It
consumes:

- canonical Invocation;
- Authority-derived actor and security context;
- explicit deterministic runtime inputs;
- witnessed authoritative facts.

Planning validates and computes through compiled Value Types and semantic
operators. It cannot obtain different currency, decimal, temporal, text, JSON,
or overflow behavior by executing on a different JavaScript runtime or storage
provider.

It produces one of:

- requests for additional witnessed facts;
- an accepted Commit attempt;
- a terminal structured rejection.

Dynamic planning may be a deterministic request/response state machine. The
Authority orchestrator performs asynchronous reads between pure planning
steps.

A Commit attempt contains:

- Invocation identity and canonical request fingerprint;
- Program, Record Model, Source Binding, Authority Scope, and Authority Epoch used for
  planning;
- Context Catalog Basis proving Authority Partition ownership;
- record, absence, unique-key, reference, and predicate witnesses;
- Mutation preconditions;
- typed semantic output;
- safe audit facts;
- deterministically keyed outbox intents.

The Authority Store Adapter atomically revalidates all witnesses and preconditions
before applying the attempt. Application planning code does not run inside a
provider transaction. This keeps transaction lifetime and provider behavior
local to the Adapter.

A `WitnessConflict` is an internal, non-terminal result. Authority Runtime may
replan only when Operation policy declares replanning safe. Otherwise it submits
a terminal rejection whose `kind` is `conflict`; settlement stores that
rejection atomically under Invocation identity.

### Constraint witnesses

Touched-record compare-and-set is not enough. A sound attempt may require:

- record revision or authoritative absence;
- Program, Record Model, Resource, Source Binding, Authority Scope, and Authority
  Epoch basis;
- unique-key vacancy or ownership;
- referenced record existence and active status;
- absence of inbound references blocking delete;
- predicate or range stability for set-based commands.

Field policies, unique keys, references, predicates, and accepted-field
witnesses address exact Field References, never current semantic names.

An Adapter that cannot atomically validate a required witness rejects the
Operation capability. It does not weaken the invariant.

Cross-Authority facts are explicit versioned assertions or workflows. They do not
pretend to be one local transaction.

## Idempotency And Outcomes

Invocation identity and canonical request identity are different.

```text
request fingerprint =
  operation identity + Resource Revision
  + canonical input
  + exact Invocation Source Basis
  + authenticated security scope
  + target Source Binding Revision
  + complete canonically ordered Source Binding basis
  + relevant Authority Partition ownership and Context Catalog basis
  + Authority Scope + Authority Epoch
  + relevant Record Model and Program basis
```

Idempotency invariants:

- Authority authenticates and derives security scope before idempotency lookup;
  untrusted actor or partition claims never select a stored outcome;
- replay disclosure is checked against current output policy without
  re-executing or changing the stored semantic outcome;
- same Invocation identity and fingerprint returns the stored terminal outcome
  without replanning, rewriting, or re-emitting effects;
- same Invocation identity with a different fingerprint returns an
  idempotency-key reuse error;
- concurrent duplicate delivery produces one terminal outcome;
- timeout, disconnect, or caller cancellation after dispatch does not imply
  rejection or rollback;
- an uncertain caller retries the same Invocation identity;
- transient infrastructure failure is not stored as a domain rejection;
- an expired compacted Invocation identity is rejected as expired, never
  executed as new;
- outbox consumers deduplicate by stable effect identity derived from qualified
  Commit identity and effect position;
- external effects run only after Commit and outbox intent are durable;
- delivery is at least once and follows the Effect contract's declared
  `idempotent`, `reconcilable`, or `compensating` guarantee;
- effect failure does not roll back record state and instead produces separately
  observable delivery status and retry behavior.

Authoritative terminal outcomes are:

- committed, including an accepted empty Commit;
- terminally rejected by validation, authorization, policy, concurrency,
  expired identity, or incompatible epoch.

`replayed` describes delivery of an already stored terminal outcome. It is not
a new outcome.

Invocation runtime states include queued, predicted, dispatched, transiently
unavailable, indeterminate, and caller-cancelled. They are not authoritative
outcomes and MUST NOT enter the idempotency ledger as domain rejection.

Transport errors MUST NOT be converted into domain rejection. Authorization and
validation failures MUST NOT be converted into empty Read results.

## Delete And Retention Semantics

Record delete, field retirement, soft delete, tombstone, erasure, and purge are
different policies.

### Delete

A delete Mutation removes a record from logical current state. A delete Commit
retains record identity, entity, deletion revision, and Commit identity so
replicas and caches can remove known values or invalidate affected Reads. It
need not retain prior field values; an Adapter lacking enough dependency facts
uses conservative invalidation.

### Soft delete or archive

Recoverable domain status is an ordinary patch to an explicitly declared field
such as status or archived time. It remains visible according to Reads that
include that status.

### Field retirement

Removing a field from the active Record Model retires its Field Slot. Active Programs
cannot read or write it. Retained payload, historical decoding, archive
inclusion, and erasure follow explicit policy independently. No transition,
purge, compaction, epoch change, or restore may reassign the slot. A later field
with the same semantic name receives a new slot.

### Physical tombstone

A tombstone is an optional Adapter representation of retained deletion
evidence. It is not a domain record, Mutation kind, UI status, or required
physical model.

### Erasure

Erasure is an explicit retention/privacy policy that removes payload from
current state, history, audit, cache, or external effects according to declared
scope. It is not implied by ordinary delete.

Erasure may redact payload, but it MUST preserve non-sensitive integrity fences
needed to prevent Invocation replay, record-identity reuse, or continuation
across an unknown history gap. If even non-reversible fences cannot be
preserved, Authority retires the complete Data Context lineage; any successor
uses a distinct Data Context identity. Rotating Authority Epoch alone does not
authorize logical identity reuse.

### Purge and compaction

Purge or compaction reclaims physical payload, tombstones, Invocation history,
or change history after retention policy permits. A checkpoint, watermark, or
new Authority Epoch preserves the ability to detect stale clients.

Compaction MAY remove payload and synchronization evidence after a checkpoint.
It preserves allocation-domain high-water fences and bounded live-lease state
rather than retaining one permanent tombstone for every portable-core identity.
It also retains the minimum lineage needed to reject stale synchronization and
replay. Rotating Authority Epoch invalidates stale synchronization state; it
does not authorize identity reuse.

After compaction, an old Resume Token yields `bootstrapRequired`. Silent
continuation across an unknown history gap is forbidden.

A Row leaving a Read's Relation is a membership change, not deletion. Cache
eviction and unloaded data are unknown, not deletion.

## Optimistic Operations

Client-visible data is:

```text
authoritative committed base
+ deterministic replay of ordered Predictions not yet proved incorporated
```

Optimistic Mutations never enter committed storage, advance the committed
Resume Token, or masquerade as Authority Commits.

A Predictor is optional, pure, and explicitly associated with an Operation.
Generated create, patch, and delete Operations may have standard Predictors.
Commands requiring secrets, complete data, or Authority-only policy may be
non-optimistic.

### Prediction evaluation and bounded results

A Predictor returns canonical proposed current-state effects or an explicit
inability to predict:

```ts
type PredictionEvaluation =
  | {
      kind: "applied";
      basis: LocalFactBasis;
      mutations: readonly PredictedRecordMutation[];
      sidecars: readonly PredictedInteractionFact[];
    }
  | {
      kind: "blocked";
      reason: "missingFacts" | "unsupported" | "incompatibleVersion";
    };
```

`LocalFactBasis` identifies the authoritative record revisions, Read
provenance, coverage, and security partition actually used. Predicted Mutations
reuse canonical create, patch, and delete meaning but are tagged with
Invocation, Predictor version, local causal sequence, and Overlay Revision.
They are never Commit attempts or Authority witnesses.

Runtime projects predicted effects through the same compiled Read dependencies
used for invalidation. It never lets a Predictor edit a Relation window,
continuation, extent, aggregate, or Presentation payload directly.

When complete local Source facts prove canonical reevaluation, the overlay may
publish a complete predicted result. With bounded or result-only coverage:

- a projection-only patch may update a known Row while retaining membership
  and order;
- a membership- or ordering-affecting patch invalidates any fact that cannot be
  recomputed from known candidate coverage;
- predicted deletion may hide a known Row, but missing backfill becomes partial
  coverage and unknown continuation rather than an invented Row;
- predicted creation enters a window only when membership and ordered position
  relative to that window are provable; otherwise it remains a pending sidecar;
- predicted membership is visibly speculative and never reconciles Selection
  or satisfies an authoritative membership proof;
- exact extent or exhaustion is retained or adjusted only when the complete
  membership delta is proved; otherwise it degrades to a safe lower bound or
  unknown;
- an aggregate changes only when its declared incremental algebra and the
  complete membership delta are locally known;
- a result-only remote Read with insufficient dependency facts keeps its last
  authoritative value and reports a blocked Prediction instead of fabricating
  output.

The authoritative base retains its Read Data Revision and freshness. Overlay
Revision and applied Invocation identities are separate provenance. Any unknown
window, continuation, extent, aggregate, or membership consequence makes
Interest satisfaction partial until remote reevaluation or authoritative
change fills it.

A runtime advertising durable pending-work or offline-recovery capability
persists each pending or confirmed-but-unincorporated canonical Invocation,
local causal sequence and dependencies, known outcome correlation, and the
exact Operation and Predictor Resource Revisions used to interpret it, not speculative
record snapshots. Such work MUST NOT replay under an incompatible Predictor
version. Runtime either migrates it explicitly or retains the Invocation while
withdrawing speculative effects.

When either capability is active, persisted Invocations, local facts, and
overlays are keyed by trusted local
Security Partition Identity and protected according to the client storage
policy. Logout, tenant switch, actor change, or incompatible policy revision
immediately closes affected Observations and withdraws their Predictions from
visible state before new-context data is shown. Runtime MUST NOT dispatch or
replay old work under a new security context.

Policy may delete the persisted envelope or retain it inaccessible for later
reauthentication to the same partition. Reauthentication revalidates program,
Operation, Predictor, epoch, and server policy before redisplay or retry. A
locally remembered Prediction is never evidence that the new actor may read its
values.

If replay lacks required local facts, Prediction produces no speculative
Mutation and reports blocked or unavailable optimistic status. It MUST NOT infer
absence or fabricate data.

Reconciliation:

1. advances the committed base through Commit ingestion or a fenced result
   replacement;
2. updates matching Invocation outcomes by Invocation and Commit identity;
3. removes rejected Predictions and removes a committed Prediction only when
   its Commit is proved incorporated in the current base;
4. replays remaining Predictions in local causal order;
5. publishes one atomic Evaluation Revision.

Local causal order is a stable per-runtime sequence augmented by explicit
dependencies, such as an Invocation targeting identity created by an earlier
pending Invocation. A durable-pending-work capability persists that sequence and
its canonical envelopes for recovery; core in-memory execution does not.
Authority Commit order supersedes local order for committed state.

Before publishing an authority-backed committed base through Authority Revision
`R`, Data Runtime MUST reconcile every locally pending Invocation against an
Invocation Settlement Fence through `R`. The fence states whether each requested
Invocation has no terminal outcome through `R`, has a terminal rejection
without a Commit, or committed at a revision at or before `R`.

A contiguous Commit suffix supplies this fence directly. A result-level Read
replacement or delta may carry safe Invocation/Commit correlations; otherwise
Transport queries the Authority ledger for the caller's pending Invocation
identities. Runtime does not infer settlement merely because predicted values
appear in a Read. If a fence is temporarily unavailable, it retains the prior
coherent publication or reports refresh/loading rather than replaying a
possibly duplicated non-idempotent Prediction over its own Commit.

Composite Read provenance fences each Authority Scope independently. No
cross-Authority order is inferred.

Response-first, stream-first, duplicate, delayed, and reordered delivery MUST
converge to the same visible state.

A rejected optimistic delete restores membership through replay. Canonical
server values replace Predictions without exposing a committed base plus stale
overlay intermediate state.

Pending, validation, conflict, and draft facts are sidecar interaction state,
not domain record fields.

The client and Authority execute the same logical Operation identity and input,
but not necessarily identical code. Only Authority validates complete business
rules and creates Commits.

## Change And Synchronization Model

Current state is authoritative. The Commit/change stream provides retained
evidence for replication, cache invalidation, optimistic settlement, and audit
correlation. Formless does not require permanent event sourcing.

Authority history also orders Record Model activation barriers. A barrier publishes
the target Record Model basis before any target Record Model record change and supplies
compatible transformed deltas or requires bootstrap. Resume Tokens always name
complete Authority change batches, never the interior of a Commit or transition
barrier.

An Authority-backed record Source exposes:

- a coherent snapshot associated with Authority Scope, Authority Epoch, Record
  Model Revision, and Resume Token;
- atomic Commit batches after that snapshot;
- unique Commit identity;
- batch ordering within one Authority Scope;
- gap, expiry, and epoch-reset detection.

One multi-record Commit is delivered and applied atomically. An internal change
may carry Commit identity and `MutationIndex`, but a Resume Token names a
complete batch position and never an interior partially applied Mutation.
Record payloads and change masks use Field Slots and carry exact Record Model Revision
provenance.

Duplicate Commit delivery is harmless. A detected base mismatch, missing batch,
expired token, or epoch mismatch causes invalidation and replacement, never
speculative patching across the gap.

There is no implied total order across Authority Scopes.

An external Source need not expose Formless Commits. It declares its actual
replacement, delta, CDC, watermark, Source Epoch, Read Data Revision, deletion,
freshness, gap, and reset semantics. A detected CDC gap invalidates affected
coverage; it does not imply absence or fabricate an Authority history.

### Synchronization strategies

Core conformance requires Observation semantics. It does not require Source
replication, durable client records, or offline execution. Selective Source
materialization and full Source replication are optional named capabilities. A
conforming runtime may implement neither and satisfy Reads through local,
remote, or hybrid result observation.

A Program or Product Conformance Profile that requires selective
materialization, full replication, offline Reads, or durable optimistic work
MUST declare the corresponding capability. That capability owns persistence,
synchronization transport, cache migration or reset, security partitioning,
resource bounds, and recovery conformance. These obligations are not silently
inherited by every Data Runtime or core Transport Adapter.

Observation semantics do not require a client to synchronize all records. The
Data Runtime may choose among three capability-checked strategies per Read and
active demand:

- **result observation:** execute remotely and transport only requested scalar
  facts, Relation windows, membership proofs, extent, and deltas;
- **selective Source materialization:** synchronize a declared Source slice with
  explicit coverage and completeness fences, then evaluate compatible Reads
  locally;
- **full Source replica:** synchronize a complete Source snapshot and Commit
  suffix when offline or workload policy justifies it.

Static dependency manifests describe what might be required. Current Bound
Reads and Interest describe active demand. Runtime cost, connectivity, privacy,
cache, freshness, and Adapter capabilities select a strategy; Definition does
not encode one.

Selective materialization MUST preserve honest unknown gaps. It may support a
local Read only when its coverage proves the Read's membership, ordering,
aggregate, and coherence requirements. Otherwise runtime executes remotely or
reports unsupported; it never treats the local slice as the whole Source.

The trusted Authority continuity primitive supplies authoritative state-transfer
Snapshots and Commit suffixes for Archive, migration, rebalance, recovery, and
optional replica capabilities. Read Execution and Transport supply result-level observation.
Both converge through the same revisions, generations, invalidation, and
Observation lifecycle rather than creating separate UI subscription models.

## Qualified Identity And Revision Model

The following types are not interchangeable:

| Term | Meaning |
| --- | --- |
| Data Context ID | Stable logical namespace qualifying owned records and lifecycle |
| Entity Identity | Stable entity token independent of current name or module layout |
| Field Slot | Immutable monotonically allocated entity-local field identity |
| Field Reference | Qualified pair of Entity Identity and Field Slot |
| Authority Partition ID | Stable logical record partition inside one Data Context |
| Qualified Record Identity | Data Context, Authority Partition, Entity Identity, and partition-local Record ID |
| Source Instance ID | Stable logical identity of the particular data behind a Source |
| Source Binding ID | Stable Program requirement-to-Source Instance edge |
| Source Binding Revision | Exact revision and target of one Source Binding edge |
| Context Catalog Revision | Exact authoritative Context Catalog revision |
| Context Catalog Basis | Canonically ordered exact catalog-entry revisions on which one decision depends |
| Scope Instance ID | Scope Declaration Identity plus stable scope key |
| Resource Instance ID | Stable Resource Identity plus Scope Instance ID |
| Authority Scope ID | Identity of one atomic Commit, witness, ledger, and history domain |
| Invocation ID | Allocated local part of one Operation request identity |
| Qualified Invocation ID | Authority Scope and Invocation ID used by every ledger and retry |
| Request fingerprint | Canonical identity of Operation, input, actor scope, Source Binding, Authority Scope, and semantic basis |
| Commit ID | Authority-local part of one accepted batch identity |
| Qualified Commit ID | Authority Scope and Commit ID used by change, audit, and effects |
| Authority Revision | Total order of Commits and Record Model activation barriers within one Authority Scope and Authority Epoch |
| Authority Epoch | Identity of one compatible Authority Scope lineage and history |
| Record Revision | Opaque version used for record concurrency control |
| Read Data Revision | Opaque scalar or composite Source provenance satisfying the Read's declared coherence model |
| Observation generation | Identity of the canonical observed reference or Bound Read and Interest tuple |
| Evaluation generation | Resource Instance, exact Resource Revision, and canonical parameters |
| Evaluation Revision | One atomic data or interaction publication |
| Overlay Revision | Identity of one deterministic replay of locally unincorporated Predictions over an authoritative base |
| Relation cursor | Runtime-issued logical continuation within one Bound Read and ordering |
| Resume Token | Opaque position in retained synchronization history |
| Observation Resume Token | Opaque position in one result Observation generation; not Source synchronization history |
| Source Epoch | Identity of one compatible Read history or materialization for a logical Source |
| Record Model Revision | Exact persistent entity, slot, codec, and constraint semantics |
| Resource Revision | Exact semantics of one named Schema Resource |
| Program ID | Stable logical Program identity across semantic revisions |
| Program Revision | Content address of exact canonical Program and compiler semantics used for evaluation |
| Semantic Node Fingerprint | Canonical identity of one exact computation node's meaning |
| Placement Revision | Version of trusted physical routing; never domain data provenance |

Relation cursors are scoped to one canonical Bound Read, ordering, security
partition, and Source Epoch. They are not record identities, provider cursors,
or Resume Tokens.

Evaluation Revision orders atomic runtime publications. Read Data Revision describes
data provenance. Snapshot and monotonic Reads normally have one coherent Source
revision; explicitly eventual cross-Source Reads carry composite provenance.
Provider revisions are not globally comparable.

An Authority Epoch may supply Source Epoch for an Authority-backed Source.
Search, graph, time-series, and other external Sources may have independent
epochs. A cross-Source result retains an epoch and revision vector unless a real
coordinator proves one common revision.

Timestamps are descriptive and auditable. They are not revisions or ordering
proofs unless a specific domain type declares that semantic explicitly.

## Data Contexts, Authority Partitions, And Authority Scopes

The default product experience may allocate one private Data Context, one
singleton Authority Partition, and one Authority Scope for each installed
application. That is a useful policy, not an identity invariant. The more
general model is:

```text
Schema Modules
     |
Program ------ Source Binding Requirements
     |                              |
Application Installation      Source Bindings
routes + grants + UI          /      |       \
                         private   shared   external
                         Context   Context   Source
                              \      /
                      Authority Partitions
                                  |
                           Authority Scopes
                                  |
                          Placement Revision
                                  |
                       concrete Adapters and locators
```

This supports one Program over several contexts, several Programs over shared
domain data, independently owned private context data, and direct access to an
existing Source without importing it into Formless record storage.

### Program requirements and Installation

A Program declares required logical Source and Operation
capabilities. A trusted composition binds those requirements to exact Source
Binding Revisions, Data Contexts, Authority Scopes, security grants, and
placement. Ordinary UI and remote callers cannot supply those trusted bindings.

An Application Installation is a runtime association among one exact Program
Revision, one Product Conformance Profile Revision, routes, presentation policy,
Installed Operation Exposures, grants, Source Bindings, exact per-scope Record
Model Revisions, and one complete Context Catalog Basis. It is not a record namespace or
Authority Scope. Uninstall removes that association and its grants. It deletes
a Data Context only through a separate authorized Context Catalog change when
the installation explicitly owns the context and its lifecycle policy permits
deletion.

A unified deployment therefore means one inspectable Context Catalog and
Source Binding graph, not one global database or Authority. Same-named entities from
different Schema Modules never merge implicitly. Modules deliberately sharing
an entity model use one stable Entity Identity, one canonical Record Model
namespace and serialized extension contract, and compatible Data Context
ownership facts.

### Installation Catalog Interface

The Installation Catalog is the authoritative owner of Application
Installations and their active revisions:

```ts
interface InstallationCatalog {
  read(id: ApplicationInstallationId): ApplicationInstallationSnapshot;
  resolve(
    id: ApplicationInstallationId,
    revision: InstallationRevision,
  ): RetainedInstallationRevisionSnapshot | UnavailableInstallationRevision;
  openActive(
    id: ApplicationInstallationId,
    expectedRevision?: InstallationRevision,
  ): ActiveInstallationGate | InstallationNotActive;
  observe(
    id: ApplicationInstallationId,
    sink: ApplicationInstallationSink,
  ): ApplicationInstallationSubscription;
  retain(request: InstallationRetentionRequest): InstallationRetentionAcquireOutcome;
  release(reference: InstallationRetentionReferenceId): InstallationRetentionReleaseOutcome;
  apply(change: InstallationChange): InstallationOutcome;
}

interface InstallationTarget {
  programRevision: ProgramRevision;
  productConformanceProfile: ProductConformanceProfileReference;
  contextBasis: ContextCatalogBasis;
  sourceBindings: readonly SourceBindingRevision[];
  recordModels: readonly InstallationRecordModelBasis[];
  routes: RoutePolicyRevision;
  presentation: PresentationPolicyRevision;
  operationExposures: readonly InstalledOperationExposureRevision[];
  grants: GrantSetRevision;
}

interface InstallationRecordModelBasis {
  sourceBinding: SourceBindingRevision;
  authorityScope: AuthorityScopeId;
  recordModelRevision: RecordModelRevision;
}

type ApplicationInstallationSnapshot =
  | {
      id: ApplicationInstallationId;
      revision: InstallationRevision;
      state: "active" | "draining";
      target: InstallationTarget;
    }
  | {
      id: ApplicationInstallationId;
      revision: InstallationRevision;
      state: "inactive";
      previousTarget?: InstallationTarget;
    };

type ActiveApplicationInstallationSnapshot = Extract<
  ApplicationInstallationSnapshot,
  { state: "active" }
>;

type RetainedInstallationRevisionSnapshot =
  | {
      id: ApplicationInstallationId;
      revision: InstallationRevision;
      publishedState: "active" | "draining";
      target: InstallationTarget;
    }
  | {
      id: ApplicationInstallationId;
      revision: InstallationRevision;
      publishedState: "inactive";
      previousTarget?: InstallationTarget;
    };

interface ActiveInstallationGate {
  snapshot: ActiveApplicationInstallationSnapshot;
  admit(use: InstallationUseKind): ActiveInstallationAdmission;
  close(): void;
}

type InstallationUseKind =
  | "bindRead"
  | "openObservation"
  | "prepareInvocation"
  | "dispatchInvocation";

type ActiveInstallationAdmission =
  | { kind: "admitted"; installationRevision: InstallationRevision }
  | { kind: "notCurrent"; currentRevision?: InstallationRevision };

interface InstallationChangeBasis {
  id: InstallationChangeId;
  fingerprint: CanonicalDigest;
  coordinationFence: InstallationRecordModelCoordinationFence;
  installation: ApplicationInstallationId;
  expectedRevision?: InstallationRevision;
}

type InstallationChange = InstallationChangeBasis &
  (
    | { kind: "activate"; target: InstallationTarget }
    | { kind: "beginDrain" }
    | { kind: "deactivate" }
  );
```

Every `apply` validates the change's Installation–Record Model Coordination Fence
and monotonic token through the Coordinator immediately before its catalog
compare-and-set. A stale, released, or basis-mismatched fence rejects without
publication.

Activation validates that the Compiled Program and exact Resource Revisions are
registered, the Product Conformance Profile is registered and satisfied, Source
Binding Requirements resolve at the named Context Catalog Basis, bound Authority
Scopes expose exactly the selected Record Model Revisions and the Program's
compatibility facts permit them, grants and Installed Operation Exposures are
valid, and required capabilities are available. It then publishes the complete
active Installation Revision atomically. A stale expected
revision conflicts; the same change identity and fingerprint replays.

`recordModels` contains exactly one entry for every `(Source Binding Revision,
Authority Scope ID)` pair reachable through a record-backed binding at the
target Context Catalog Basis. The catalog basis derives the covered Data
Context and Authority Partitions. Duplicate or missing pairs reject activation.
Different Record Model Revisions may coexist only on distinct Authority Scopes;
one scope still exposes exactly one active model.

An Authority cannot activate a different Record Model Revision while any active
Installation still targets its prior revision. Core change acquires one shared
Coordination Fence over every affected Installation and Authority Scope, drains
those Installations, activates the model, publishes their replacement
Installation bases, and then releases the fence before new work starts. Both
owners reject a stale or mismatched token. A named
coordinated-control-plane capability may atomically publish the model and
replacement Installation revisions when it proves there is no interval in
which either basis is only partially visible.

Before publication, activation acquires the Program, Product Conformance
Profile, Record Model Artifact, and Context Catalog retention references for
the exact target basis. A failed
activation releases them. Replacement publication points atomically at the already-retained new
basis; it releases prior Installation-owned references only afterward. Temporary
reference overlap is safe and validation cannot race retirement or a
destructive catalog change. The durable Installation Change owns prepublication
references; replay completes publication or idempotent cleanup after a crash.

`beginDrain` stops new route resolution, Observation creation, and Invocation
preparation for that Installation while retained semantic uses continue.
`deactivate` publishes an inactive revision and releases the Installation's
active Program, Product Conformance Profile, Record Model Artifact, and Context
Catalog retention references.

`openActive` is the only way to obtain current authority for new binding,
Observation creation, Invocation preparation, or dispatch. Its gate is
invalidated atomically before replacement, `beginDrain`, or `deactivate`
publishes. `admit` is a Catalog-coordinated use check, not a process-local
boolean; a revoked gate rejects new use. A prepared Invocation is admitted again
at dispatch. Work already admitted and durably accepted retains its exact
Installation Revision independently.

Accepted work and Archives retain their historical Installation Revision, which
transitively retains its exact dependency references. Installation state is local to one Installation. The same Program
Revision may be active in one Installation, draining in another, and globally
retained by the Program Registry.

Accepted Invocations, outcome disclosure, and Archives also retain their exact
Installation Revision through the Catalog's typed retention Interface. This
keeps Invocation Source Basis, selected Installed Operation Exposure, Record
Model Artifact, profile, and trusted source-policy semantics resolvable after
replacement or deactivation. Release
is idempotent; historical Installation Revision compaction waits for an empty
reference set or an explicit complete translation, then releases that revision's
transitive Program, Product Conformance Profile, Record Model Artifact, and
Context Catalog references.

`read` returns the current Installation Revision. `resolve` returns an exact
retained historical fact for Invocation replay, disclosure, Archive, and audit;
its `publishedState` records history but grants no current-use authority. A
retained revision cannot become unavailable; after its last reference is
released, compaction may make later resolution explicitly unavailable.

Context changes required by an install are prepared and activated before the
Installation Revision becomes visible. Failure may leave unreferenced staged
data governed by explicit cleanup policy, but never a partially active
installation. Uninstall applies `deactivate` first; owned-context
retention or deletion follows independently under Context Catalog policy.

### Context Catalog Interface

The Context Catalog is the authoritative owner of Data Contexts, Source
Instances, Source Bindings, Authority Partitions and scope topology, ownership
facts, and their active logical lineages:

```ts
interface ContextCatalog {
  read(): ContextCatalogSnapshot;
  resolve(basis: ContextCatalogBasis):
    | ContextCatalogBasisSnapshot
    | UnavailableContextCatalogBasis;
  observe(sink: ContextCatalogSink): ContextCatalogSubscription;
  retain(request: ContextCatalogRetentionRequest):
    ContextCatalogRetentionAcquireOutcome;
  release(reference: ContextCatalogRetentionReferenceId):
    ContextCatalogRetentionReleaseOutcome;
  activate(change: ContextCatalogChange): ContextCatalogOutcome;
}

interface ContextCatalogSnapshot {
  revision: ContextCatalogRevision;
  contexts: readonly DataContextDescriptor[];
  sourceInstances: readonly SourceInstanceDescriptor[];
  sourceBindings: readonly SourceBindingDescriptor[];
  authorityPartitions: readonly AuthorityPartitionDescriptor[];
  authorityScopes: readonly AuthorityScopeDescriptor[];
}

interface ContextCatalogBasisSnapshot {
  basis: ContextCatalogBasis;
  entries: readonly RetainedCatalogEntryDescriptor[];
}

interface ContextCatalogChange {
  id: ContextCatalogChangeId;
  fingerprint: CanonicalDigest;
  expectedEntries: readonly CatalogEntryBasis[];
  expectedRootRevision?: ContextCatalogRevision;
  changes: readonly CanonicalCatalogMutation[];
}
```

An `AuthorityPartitionDescriptor` carries stable partition identity, owning Data
Context, semantic-affinity contract, current Authority Scope, and entry
revision. Allocation high-water state remains Authority data and moves with the
partition; it is not mutable routing configuration.

Activation is atomic, compare-and-set, idempotent by change identity and
fingerprint, authorized from trusted actor and ownership context, durably
audited, and observable as one new Context Catalog Revision. Same identity with
a different fingerprint rejects. A stale touched-entry basis conflicts. An
exact-root operation also conflicts when `expectedRootRevision` is stale.
Unrelated entry changes do not prevent an otherwise valid activation. Callers
never mutate the catalog by editing Adapter configuration directly.

The catalog also resolves semantic Authority identity before physical
placement:

```text
Source Binding Revision -> exact Source Instance
Data Context + Authority Partition -> exact Authority Scope ID
Authority Scope ID -> Placement Revision -> Authority Adapter binding
```

Trusted semantic affinity selects an Authority Partition before this resolution;
it is not a physical shard hint. A Placement change preserves Authority Scope
identity. A topology change may reassign whole partitions only after transfer
and fencing complete. Rebinding, partition regrouping, and staged Restore
publication use catalog activation. Application installation is owned
separately and may request catalog changes without becoming a catalog fact.

An active or draining Installation holds a typed Context Catalog retention
reference over every entry in its basis. `retain` atomically validates the entry
revisions; accepted Invocations, Archives, and other durable work acquire their
own narrower references before the Installation can release its set. `release`
is idempotent. A catalog change that would remove,
incompatibly supersede, or remap a referenced entry rejects. Reconfiguration
therefore either activates a replacement Installation whose basis remains
simultaneously valid, or drains and deactivates the old Installation before the
catalog change and reactivates afterward. A separately named coordinated
control-plane capability may provide an atomic zero-downtime switch across both
catalogs; ordinary independent calls never expose a dangling active
Installation.

`read` returns current catalog state. `resolve` returns the exact immutable
entries named by a retained basis, even when they are no longer current. A
retained entry cannot become unavailable; after its final reference is released,
compaction may make later resolution explicitly unavailable.

### Ownership and lifecycle

Data ownership is the authority to archive, migrate, retain, erase, replace, or
delete a Data Context. Read or write access does not imply ownership. Ownership
is explicit and may be shared only under a declared policy.

Each Data Context states:

- stable identity and owning principal or lifecycle policy;
- bound Record Model lineage and compatible Schema Modules;
- retention, archive, erasure, and uninstall behavior;
- Source instances and Authority partitioning requirements;
- export and restore policy;
- grants separately administered from ownership.

Persistent Record Model lineage is owned by the Data Context and its Authority
Partitions, not by any Program that binds them. Several Programs may require
compatible views of that lineage. A Program may propose a Record Model
Transition only through explicit ownership authority; Installation activation alone
cannot change persistent constraints or field identity.

Archive reachability follows ownership, not arbitrary Read dependencies. An
Installation artifact may include its Portable Definition and Source Binding
Requirements, embed its owned contexts, and refer to shared or external
contexts without duplicating them.

### Authority grouping and constraints

Authority Scope placement follows invariants rather than UI packaging. Facts
belong in one scope when they require atomic:

- multi-record Operations;
- uniqueness or compare-and-set;
- strong references and delete blockers;
- Invocation idempotency settlement;
- ordered change delivery;
- transactional outbox append.

Every Commit belongs to one Authority Scope. All core record Mutations and
store-enforced witnesses in that Commit resolve inside the scope. A distributed
database may physically shard the scope only when its Adapter still proves
that Interface.

Across scopes there is no shared revision, core Commit, or implicit snapshot.
Operations use a workflow, outbox, compensation, versioned external assertion,
or separately named distributed-authority algebra. Global uniqueness requires
an explicit coordinating Authority or index and cannot be mislabeled as one
local record constraint. Every constraint declares its enforcement scope; no
Adapter silently reduces global intent to per-shard behavior.

A Data Context may contain several Authority Scopes. One Authority Scope belongs
to exactly one Data Context so Record Model, retention, erasure, restore, Invocation,
outbox, compaction, and exact-recovery lineage remain coherent. Several
Programs share atomic domain data by binding the same Data Context, not by
merging independently owned contexts into one scope. Physical co-location never
creates a common scope.

Every current Record resolves through its Authority Partition to exactly one
Authority Scope at one Context Catalog Revision. Scope regrouping drains and
fences prior scopes, transfers current whole-partition state, creates new scope
lineages, and retains old qualified history and terminal-outcome lookup.
Repartitioning inside an existing partition is an explicit identity-and-reference
migration because it changes Record Identity, identity allocation, and
constraint locality.

### Security independence

Application Installation, Data Context ownership, Authority grouping, and physical
co-location grant no visibility by themselves. Each Source and Operation is
reauthorized from trusted context. A cross-Source Read applies the intersection
of relevant policy. Cache and memo identity contains all relevant Security
Partition and provenance facts. Credentials and locators remain in trusted
Adapter configuration.

### Placement and sharding

Definition may declare semantic affinity, such as all records for one tenant
needing transaction-local Operations. It does not declare database names,
shard URLs, Durable Object names, or provider routing keys.

```ts
interface PlacementResolver {
  resolveAuthority(request: {
    scope: AuthorityScopeId;
    revision: PlacementRevision;
  }): AuthorityAdapterBinding | UnsupportedPlacement;

  resolveSource(request: {
    sourceBinding: SourceBindingRevision;
    semanticPartition?: CanonicalPartitionKey;
    revision: PlacementRevision;
  }): SourceAdapterBinding | UnsupportedPlacement;
}
```

Routing is deterministic and Authority-validated. Callers cannot choose a
physical partition to bypass policy. One Authority Scope has one active writer
during movement. Moving an intact scope between Adapters preserves logical
identity, Authority lineage, Invocation singularity, and change continuity. If
continuity cannot be proved, the Authority Epoch changes and consumers reset.

Splitting one Authority Scope changes which constraints and Operations can be
atomic. It is therefore a semantic topology and capability change, not merely
rebalancing. It may require new Operation or constraint Resource Revisions even
when field Record Model Revision is unchanged, and it produces a new Source Binding
Revision for affected logical Sources. The transition rejects any Operation or
constraint that no longer fits unless a new coordinating capability satisfies
it.

Read sharding is less restrictive. A Read Execution Adapter may perform a
bounded merge across shards or heterogeneous Sources and return ordinary
Relations with composite provenance. Exact global rank, extent, pagination, or
ordering is available only when the Adapter advertises and proves it.

## Adapter Seams

Adapters implement semantic Interfaces. They MUST NOT redefine semantics or
leak provider concepts into Definition, Reads, Operations, or Presentation.

### Read Execution and Source Adapter Seams

One `ReadExecution` Implementation owns the complete logical Read plan for an
Observation. It proves operator order, Interest placement, coherence,
authorization context, and final result publication even when it delegates
fragments to several Sources.

```ts
interface ReadExecution {
  capabilities: ReadCapabilities;

  prepare(
    program: ReadProgram,
    requirements: ReadRequirements,
  ): Promise<PreparedRead | UnsupportedRead>;

  open(
    prepared: PreparedRead,
    request: AdapterReadRequest,
    sink: ReadEventSink,
  ): ReadLease;
}

interface SourceExecution {
  descriptor: SourceExecutionDescriptor;

  prepare(
    request: SourcePreparationRequest,
  ): Promise<PreparedSourceFragment | UnsupportedSourceFragment>;

  open(
    prepared: PreparedSourceFragment,
    request: SourceOpenRequest,
    sink: SourceEventSink,
  ): SourceLease;
}

interface ReadLease {
  updateInterest(generation: number, interest: ReadInterest): void;
  close(): void;
}

interface SourceLease {
  update(request: SourceDemandUpdate): void;
  close(): void;
}
```

The Composition Root resolves each logical Source reference through its exact
Source Binding Revision and Placement Revision before selecting a
`SourceExecution` Adapter. Distinct Source Bindings never collide merely because names
match; they may resolve to the same explicitly identified Source Instance.
Source-fact reuse then requires complete compatible instance, Record Model, epoch,
revision, coverage, and Security Partition basis. A Source Adapter implements a
declared logical fragment such as entity access,
time interval scan, graph traversal, or search; it does not decide whole-Read
window placement or cross-Source coherence.

A Read Execution Adapter may push a complete fused program into one provider,
or its hidden planner may delegate semantic fragments to several Source
Adapters and compose their results. Either way, only the owning Read Execution
Adapter emits the Observation event stream. Source events never race directly
into caller snapshots.

Entity Source fragments consume and emit canonical slot-addressed rows.
Provider column names, document keys, and physical order remain private to the
Adapter. Provider values cross the compiled field codec before entering a
Source fact. A provider coercion, collation, timezone, numeric operation, or JSON
operator is usable only when the Adapter proves it implements the declared
Value Type semantics.

Cross-Source planning declares the provenance and coherence each fragment can
provide. The owner rejects a plan unless composition satisfies the Read's
requirements. A Source Adapter never upgrades its local revision into a global
snapshot claim.

`PreparedRead` and prepared Source fragments are opaque and local to their
Adapters. SQL, graph traversal,
time-series plans, provider cursors, index choices, and materialized-view keys
remain inside the Adapter.

A Read Execution Adapter may emit:

- coherent replacement;
- delta with explicit base and next revision;
- invalidation requiring replacement;
- structured fault;
- end-of-lease.

Read Execution invariants:

- initial replacement and live delivery have no missed-update gap;
- every request and event carries lease identity, Observation generation,
  applicable Source Epoch vector, stream sequence, and applicable base and next
  Read Data Revision;
- a live-capable Adapter provides a coherent replacement followed by a gap-free
  suffix; a finite Adapter may provide one replacement and end;
- delta applies only to its declared base revision;
- duplicate delivery is harmless;
- gap or base mismatch causes invalidation or replacement;
- invalidation is always a valid fallback when precise delta is unavailable;
- an Adapter advertising bounded execution satisfies its declared work bound
  for requested Interest, otherwise preparation rejects or exposes a
  non-bounded plan before execution;
- a correct full scan is permitted only under explicit capability and policy;
- unsupported capability is reported before an incorrect result;
- events after close or from obsolete generations are tolerated and ignored;
- physical iteration order never becomes logical Relation order implicitly.

Read capabilities include Value Type and semantic operator support,
edge/rank/anchor windows, extent, membership probes, live mode, consistency,
freshness, and bounded execution.

### Authority Store Adapter Seam

```ts
type AuthorityDecision =
  | { kind: "accept"; attempt: CommitAttempt }
  | {
      kind: "reject";
      invocation: AuthorityInvocation;
      fingerprint: RequestFingerprint;
      outcome: TerminalRejection;
      audit: SafeAuditFacts;
    };

interface AuthorityStore {
  leaseIdentities(request: IdentityLeaseRequest): Promise<IdentityLease>;

  read(request: FactBatchRequest): Promise<FactSnapshot>;

  settle(decision: AuthorityDecision): Promise<
    Committed | Rejected | Replayed | WitnessConflict
  >;

  activateRecordModel(request: RecordModelActivationRequest): Promise<
    RecordModelActivated | RecordModelTransitionRejected | RecordModelTransitionReplayed | WitnessConflict
  >;

  reconcileInvocations(
    request: AuthorityInvocationReconciliationRequest,
  ): Promise<AuthorityInvocationSettlementFence>;

  readContinuity(request: AuthorityContinuityRequest): Promise<
    AuthoritySnapshotPage | AuthorityChangePage | BootstrapRequired
  >;

  closeContinuityLease(request: CloseContinuityLeaseRequest): Promise<void>;
}

type AuthorityContinuityRequest =
  | {
      kind: "startSnapshot";
      expectedEpoch: AuthorityEpoch;
      expectedRecordModel?: RecordModelRevision;
      owner: AuthorityContinuityOwner;
      coverage: AuthorityContinuityCoverage;
      limits: SnapshotPageLimits;
    }
  | {
      kind: "nextSnapshotPage";
      lease: SnapshotLeaseId;
      owner: AuthorityContinuityOwner;
      next: SnapshotPageToken;
    }
  | {
      kind: "readChanges";
      expectedEpoch: AuthorityEpoch;
      owner: AuthorityContinuityOwner;
      after: ResumeToken;
      limits: ChangePageLimits;
    };

interface AuthoritySnapshotPage {
  kind: "snapshotPage";
  lease: SnapshotLeaseId;
  authorityScope: AuthorityScopeId;
  epoch: AuthorityEpoch;
  recordModel: RecordModelRevision;
  snapshotRevision: AuthorityRevision;
  coverage: AuthorityContinuityCoverage;
  suffixAfter: ResumeToken;
  sequence: number;
  previousPageDigest?: CanonicalDigest;
  state: readonly AuthorityStateChunk[];
  next?: SnapshotPageToken;
}

interface AuthorityChangePage {
  kind: "changePage";
  authorityScope: AuthorityScopeId;
  epoch: AuthorityEpoch;
  after: ResumeToken;
  through: ResumeToken;
  batches: readonly AuthorityHistoryBatch[];
  completeThrough: AuthorityRevision;
}

type AuthorityHistoryBatch = CommitChangeBatch | RecordModelActivationBarrier;

interface AuthorityContinuityCoverage {
  records: "complete";
  recordIdentityFences: CoverageClaim;
  allocationState: CoverageClaim;
  invocationLedger: CoverageClaim;
  audit: CoverageClaim;
  outboxAndDelivery: CoverageClaim;
}

interface CloseContinuityLeaseRequest {
  lease: SnapshotLeaseId;
  owner: AuthorityContinuityOwner;
}

interface BootstrapRequired {
  kind: "bootstrapRequired";
  authorityScope: AuthorityScopeId;
  currentEpoch: AuthorityEpoch;
  reason:
    | "unknownToken"
    | "expiredHistory"
    | "expiredLease"
    | "epochChanged"
    | "recordModelArtifactUnavailable";
}
```

One bound `AuthorityStore` instance serves one exact Authority Scope, Authority
Epoch, and Placement Revision. It owns exactly one active Record Model Revision
at a time. Every read and settlement carries its expected Record Model basis;
continuity validates the requested epoch, optional starting model, and every
ordered model barrier. `activateRecordModel` uses the same atomic coordination as
`settle`; it changes active Record Model, appends the transition barrier, and records
the terminal execution outcome without a write gap. Its request contains the
complete `RecordModelTransitionExecution`; immediately before compare-and-set,
the Store validates that execution's Installation–Record Model Coordination Fence
and monotonic token through the Coordinator. An alternative Adapter may
carry scope and placement basis on every request, but it MUST NOT mix scopes
implicitly. Routing and expected Record Model are supplied by trusted composition,
never accepted as unvalidated caller claims.

`readContinuity` is a trusted Authority state-transfer primitive for Archive,
Record Model evolution, migration, rebalance, recovery, and optional replica
capabilities. It is not a client entitlement or part of result Observation
Transport. A client materialization or replica capability must define its own
authorized projection, Transport Interface, security partitioning, and resource
bounds before it may consume this primitive.

`startSnapshot` covers every current Record and exactly the additional Authority
state claimed by `AuthorityContinuityCoverage` in the bound Authority Scope at
one exact epoch, Record Model Revision, and Authority Revision. Migration and
exact recovery require complete allocation, identity-fence, Invocation ledger,
audit, and outbox coverage; a record-replica extension does not thereby gain
those facts. Page sequence starts at zero, follows the digest chain, and
terminates only when `next` is absent.
Every next-page and close request is authenticated as the lease owner. The
snapshot's `suffixAfter` is the only valid start position for its contiguous
change suffix.

`readChanges` returns whole ordered Authority history batches strictly after its
token through `completeThrough`; an empty page may still advance that proven
fence. `through` resumes the next page. A Record Model activation barrier is a
history batch and supplies the exact target Record Model Artifact before any
batch interpreted under it. Unknown, expired, or wrong-epoch state returns
`BootstrapRequired`, never an empty page or false continuity claim.

`WitnessConflict` is not a stored terminal outcome. It permits replanning only
when Operation policy declares replanning safe. A terminal validation, policy,
authorization, or concurrency rejection is submitted through `settle` and
becomes replayable under the Invocation's idempotency identity.

An Adapter or infrastructure failure during `settle` may leave acceptance
indeterminate. It is never normalized into or stored as a domain rejection.
Recovery retries the same qualified Invocation identity and fingerprint or uses
Invocation reconciliation; it never invents a new logical attempt.

The Adapter owns:

- identity range issuance, allocation high-water fences, and live-lease state;
- atomic witness and precondition validation;
- idempotency claim and replay outcome;
- Commit, Authority Revision, Record Revision, and Resume Token allocation;
- active Record Model Revision and durable Record Model Transition execution ledger;
- record materialization;
- Invocation ledger, coherent settlement fences, and audit persistence;
- atomic change-batch append;
- transactional outbox append;
- checkpoint and compaction mechanics.

Every provider value entering or leaving logical Authority state is checked
against the active compiled Value Shape. Native columns, encoded strings,
provider JSON, and split private columns are physical choices; none may change
canonical equality, ordering, precision, absence, null, or constraint meaning.

It does not execute arbitrary application callbacks inside provider
transactions.

Authority Store enforces the active persistent Record Model constraints and its
store-level policies for every attempted Mutation. Authority Runtime resolves
the exact retained Operation Resource Revision and supplies its witnessed
attempt. Activating a Program cannot add, remove, or weaken persistent
constraints; that requires an explicit Record Model Transition.

Every attempted Record Mutation also carries a trusted Context Catalog basis
proving that its Authority Partition maps to this Authority Scope. A stale or
mismatched ownership basis conflicts before any identity allocation or record
state changes. Operation planners cannot bypass uniqueness, reference, delete,
schema, field-policy, or partition-ownership constraints by omitting a witness.

Snapshot pages remain pinned to one Authority Revision, Authority Epoch, and
Record Model Revision and carry the Resume Token from which their change suffix
begins. Changes after that token remain available until snapshot completion.
`BootstrapRequired`
directs the caller to request a replacement snapshot; it is never treated as
an empty change page.

If the retained suffix crosses Record Model activation, the Adapter delivers the
ordered transition barrier and target Record Model Artifact before any
target Record Model change, or returns `BootstrapRequired`. It never exposes a slot
before the consumer can decode its Record Model Revision.

Starting a paged snapshot allocates a bounded Snapshot Lease with stable lease
identity, pinned epoch and revision, suffix Resume Token, next-page token,
maximum lifetime, and declared page/resource limits. Every page proves the same
lease basis. The trusted continuity caller owns the lease; a client replica can
do so only through its named capability and authorized Transport.
Completion or explicit close releases it; abandonment expires deterministically.

Store retains the required suffix only through the bounded lease lifetime.
After expiry, a page or suffix request returns `BootstrapRequired`, allowing
compaction to proceed without unbounded abandoned-client retention. Renewal, if
supported, is an explicit capability with a hard maximum rather than an
untrusted caller-selected duration.

Required base capabilities include atomic multi-record compare-and-commit,
idempotency, revisions, ordered change retrieval, and snapshot/checkpoint
support. A physical store unable to provide them may serve as a derived Read
Source, but it does not weaken the Authority Store Interface.

### Transport Adapter Seam

Transport moves registered Reads, Interest, Observation frames, Invocations,
and outcomes across process Seams. It does not evaluate Reads, authorize actors,
cache values, or define logical semantics.

Transport carries canonical data under exact input and output Value Shapes. It
never serializes runtime `bigint`, decimal objects, temporal objects, class
instances, or Presentation drafts directly. Both sender and receiver validate
the declared codec basis; a value that decodes only after host-language or JSON
coercion is a protocol failure.

```ts
interface Transport {
  acquireIdentityLease(
    request: IdentityLeaseRequest,
  ): Promise<TransportResult<IdentityLease>>;

  closeIdentityLease(lease: IdentityLeaseId): Promise<TransportResult<void>>;

  openObservation(
    request: RemoteObservationRequest,
    sink: RemoteObservationSink,
  ): RemoteObservationLease;

  invoke(
    invocation: InvocationEnvelope,
  ): Promise<TransportResult<AuthorityOutcome<CanonicalValue>>>;

  reconcileInvocations(
    request: InvocationReconciliationRequest,
  ): Promise<TransportResult<InvocationSettlementFence>>;
}

interface InvocationReconciliationRequest {
  authorityScope: AuthorityScopeId;
  epoch: AuthorityEpoch;
  through: AuthorityRevision;
  invocations: readonly InvocationReconciliationBasis[];
}

interface InvocationReconciliationBasis {
  invocation: InvocationId;
  programRevision: ProgramRevision;
  source: InvocationSourceBasis;
  recordModelRevision: RecordModelRevision;
  resourceRevision: ResourceRevision;
  targetSourceBinding: SourceBindingRevision;
  sourceBindingBasis: readonly SourceBindingRevision[];
  contextBasis: ContextCatalogBasis;
  operation: OperationId;
  canonicalInputDigest: CanonicalDigest;
}

interface InvocationSettlementFence {
  authorityScope: AuthorityScopeId;
  epoch: AuthorityEpoch;
  through: AuthorityRevision;
  settlements: readonly InvocationSettlement[];
}

type InvocationSettlement =
  | { invocation: InvocationId; kind: "noTerminalOutcomeKnown" }
  | {
      invocation: InvocationId;
      kind: "rejected";
      outcome: DisclosedRejectedOutcome;
    }
  | {
      invocation: InvocationId;
      kind: "commitIncluded" | "commitAfterFence";
      commit: QualifiedCommitId;
      revision: AuthorityRevision;
      outcome: DisclosedCommittedOutcome;
    };

interface DisclosedOutcomeBasis {
  programRevision: ProgramRevision;
  source: InvocationSourceBasis;
  recordModelRevision: RecordModelRevision;
  resourceRevision: ResourceRevision;
  targetSourceBinding: SourceBindingRevision;
  sourceBindingBasis: readonly SourceBindingRevision[];
  contextBasis: ContextCatalogBasis;
  authorityScope: AuthorityScopeId;
  authorityEpoch: AuthorityEpoch;
  operation: OperationId;
  requestFingerprint: RequestFingerprint;
}

interface DisclosedCommittedOutcome extends DisclosedOutcomeBasis {
  commit: QualifiedCommitId;
  output: DisclosedValue<CanonicalValue>;
}

interface DisclosedRejectedOutcome extends DisclosedOutcomeBasis {
  rejection: TerminalRejection;
}
```

Core Transport carries result-level Observation replacements and deltas, not a
complete Source replica protocol. A named selective-materialization or
full-replica capability adds its own snapshot/change Transport and persistence
Interfaces, security partitioning, migration or reset behavior, resource bounds,
and recovery conformance.

For a remote Authority, the two identity-lease methods implement
`IdentityLeaseProvider`; they do not make record replication part of Transport.
Transport authenticates the allocation domain, enforces the Authority's total
lease and reserved-offset bounds, and preserves close/replay correlation.

The server derives security scope before reconciliation and filters each stored
outcome through current disclosure policy. A caller cannot use reconciliation
to probe Invocation identities from another partition. The server validates
Program, Record Model, Resource, Source Binding, Authority, Operation, and canonical
input basis, then derives the request fingerprint using authenticated security
scope rather than trusting a caller fingerprint. Data Runtime validates the
returned basis and protocol correlation before attaching the outcome to a
handle. Mismatch returns an idempotency or program error, never another
request's outcome.

Available canonical output is decoded through the exact Compiled Program output
shape. Committed outcomes and terminal rejections, including structured
conflict rejections, reconstruct the same `AuthorityOutcome` and
`InvocationSnapshot` obtainable from a direct response. Outcome recovery and
Commit incorporation remain independent: a
handle may know its terminal outcome while its Prediction remains until the
corresponding base includes the Commit.

Underlying delivery may duplicate, delay, reorder, or drop frames. Transport
frames therefore carry epoch and sequence identity. The Transport Adapter and
Data Runtime together deduplicate and reorder bounded disorder or emit an
explicit gap/reset. They MUST NOT present an unmarked missing frame as a
continuous stream.

For result Observation and Invocation traffic, Transport additionally handles:

- disconnect between snapshot and first change;
- push arriving before an Invocation response;
- reconnect and resume;
- expired Observation Resume Tokens and server epoch reset;
- cancellation races;
- Interest changes while data is in flight;
- pending-Invocation settlement against an Authority Revision before optimistic
  replay over a replacement result;
- chunking, backpressure, and bounded buffering.

Every message carries enough protocol, request, generation, epoch, sequence,
and correlation identity to reject stale or misplaced data.

An Observation Resume Token is scoped to one result Observation generation. It
may carry an Authority Revision fence for settlement, but it is not an Authority
synchronization Resume Token and cannot retrieve Source records. An expired
Observation Resume Token produces explicit result replacement. Backpressure leads to
coalescing, invalidation, or reset rather than unbounded memory.

### State Persistence Adapter Seam

```ts
interface StatePersistence {
  capabilities: StatePersistenceCapabilities;

  read(scope: StatePersistenceScope, declarations: readonly PersistedState[]):
    Promise<PersistedStateSnapshot>;

  write(commit: StatePersistenceCommit): Promise<StatePersistenceReceipt>;

  subscribe?(
    scope: StatePersistenceScope,
    listener: (event: StatePersistenceEvent) => void,
  ): StatePersistenceSubscription;
}

interface StatePersistenceScope {
  program: ProgramId;
  scope: ScopeInstanceId;
  securityPartition: SecurityPartitionIdentity;
  binding: StatePersistenceBindingRevision;
}

interface PersistedStateAddress {
  scope: StatePersistenceScope;
  state: StateId;
}

interface PersistedStateSnapshot {
  scope: StatePersistenceScope;
  revision: PersistenceRevision;
  values: readonly PersistedStateValue[];
}

interface StatePersistenceCommit {
  scope: StatePersistenceScope;
  origin: PersistenceOriginId;
  basis?: PersistenceRevision;
  changes: readonly PersistedStateChange[];
}

type StatePersistenceReceipt =
  | {
      kind: "applied";
      origin: PersistenceOriginId;
      revision: PersistenceRevision;
      canonical: PersistedStateSnapshot;
    }
  | {
      kind: "conflict";
      current: PersistedStateSnapshot;
    };

type StatePersistenceEvent =
  | {
      kind: "snapshot";
      snapshot: PersistedStateSnapshot;
      origin?: PersistenceOriginId;
      cause: "localEcho" | "externalChange";
    }
  | {
      kind: "reset";
      scope: StatePersistenceScope;
      reset: PersistenceResetId;
      reason: PersistenceResetReason;
    };

interface StatePersistenceSubscription {
  initial: PersistedStateSnapshot;
  close(): void;
}
```

Each `PersistedStateValue` and `PersistedStateChange` carries its exact
`PersistedStateAddress`, State Resource Revision, and Value Shape/codec basis.
A `StatePersistenceConflictReference` is derived from that address, local
generation, and external Persistence Revision; it contains no medium locator or
credential.

Runtime owns Value Shapes, codecs, validation, canonicalization, feedback-loop
prevention, and State semantics. Adapters own the persistence medium, navigation
events, and preservation of unrelated medium-specific data.

Persistence Revision is opaque and ordered only within one scope and medium.
Origin correlation makes local write echoes identifiable without assuming they
will be suppressed by the medium. Subscriptions publish monotonic revisions or
an explicit reset; duplicate echoes are harmless. `subscribe` atomically
captures `initial` under the same protocol as other Observations.

A reset invalidates the prior Persistence Revision lineage and requires a fresh
read followed by initialization under the declared State policy. It is not an
empty snapshot, does not itself delete State, and never authorizes removal of
unrelated data in the persistence medium. `requiredPersisted` becomes
unavailable if that fresh read has no valid value; `persistedThenDefault` may
truthfully reinitialize from its declared default.

The Adapter declares whether a commit is atomic for the whole scope or only one
entry and whether compare-and-set by `basis` is supported. State policy declares
how a concurrent external change, such as navigation, competes with a staged
local transition. Unsupported required atomicity or conflict behavior fails
explicitly. Runtime never overwrites unrelated URL, navigation, or storage data
that is outside the declared persisted State projection.

### External Effect Adapter Seam

Operations interact with email, payments, queues, specialized write stores,
and other non-transactional systems through versioned durable effect intents:

```ts
interface EffectExecution {
  capabilities: EffectCapabilities;

  execute(
    intent: EffectIntent,
    context: EffectExecutionContext,
  ): Promise<EffectDeliveryOutcome>;
}

interface EffectIntent {
  effectId: EffectId;
  kind: EffectKind;
  version: EffectVersion;
  commit: QualifiedCommitId;
  payload: CanonicalValue;
}

type EffectDeliveryOutcome =
  | { kind: "succeeded"; receipt?: CanonicalValue }
  | { kind: "retryableFailure"; issue: SafeEffectIssue }
  | { kind: "terminalFailure"; issue: SafeEffectIssue };
```

The exact Effect kind and version declares payload and receipt Value Shapes.
Effect Delivery validates both before provider execution or durable status
publication. Provider SDK objects, floating-point coercions, and arbitrary JSON
serialization never become effect semantics implicitly.

Effect identity is deterministic and globally unique for the intended external
action. Delivery begins only after Commit and outbox intent are durable and is
at least once. Each Effect contract declares one semantic guarantee:

- `idempotent`: same Effect Identity produces at most one semantic external
  action;
- `reconcilable`: uncertain delivery is inspected before retry and converges to
  an explicit provider outcome under its declared rules;
- `compensating`: duplicate or partial external action is possible and a named
  compensation workflow owns convergence.

An Operation requiring at-most-once external semantics may select only an
`idempotent` Effect capability. The handler reports result; an outbox
coordinator owns claiming, retry, backoff, and durable status. Cancellation of
a worker does not prove cancellation of the external action.

Commit atomicity ends at durable outbox append. External success is not part of
the Authority Store transaction, and effect failure does not roll back record
state. Delivery status is separately observable through a declared Read Source
when product behavior exposes it. A provider that cannot deduplicate uses a
declared reconciliation or compensation capability and cannot claim
idempotent external semantics.

### Environment Adapters

Clock, identity generation, scheduling, authentication, authorization context,
and other environmental facts are injected through narrow Interfaces where
behavior varies by topology. External effects use their dedicated Interface.
Pure planning receives resolved deterministic values rather than reading
ambient globals.

### In-memory reference Adapters

The Testkit Module provides at least:

- in-memory Read Execution Adapter executing canonical Read semantics;
- in-memory record and scripted specialized Source Adapters;
- in-memory Authority Store Adapter with witnessed atomic commits;
- in-memory Record Model Evolution Adapter with atomic Record Model activation
  and fault injection;
- in-memory Data Context catalog and Placement Adapter;
- in-memory Snapshot, Archive, and restore Adapters;
- in-memory Transport Adapter using real protocol envelopes;
- in-memory State Persistence Adapter;
- in-memory External Effect Adapter with idempotency and scripted outcomes;
- pure built-in Value Type codecs plus scripted custom codec capabilities;
- deterministic clock, ID generator, scheduler, and fault injector;
- deterministic memo hit, miss, eviction, dirty-node, evaluation, materializer,
  provider-call, and retained-memory counters.

These are executable reference Implementations, not simplified mocks returning
fixtures. They implement asynchronous contracts, revisions, backpressure,
cancellation, compaction, and failures so local tests exercise the same
semantics expected across runtime topology.

## Storage And Source Portability

Formless does not define one universal physical database Interface.

Entity records are one logical Source kind with record Mutation semantics.
Scalable relational stores may implement the Authority Store Interface
directly when they provide its invariants.

Time-series, graph, search, analytics, and other optimized systems may implement
Source Adapters and, where useful, fused Read Execution Adapters that produce
ordinary scalar or Relation outputs. They do not need to pretend their physical
data is a generic record table.

Writes to specialized systems remain domain Operations whose durable intents
cross the External Effect Interface or another named domain capability.
Cross-Authority atomicity is not inferred. A domain requiring cross-store work
declares workflow, outbox, compensation, or provider-native transaction
semantics explicitly.

### Logical record encoding

Entity record semantics use qualified identity and a canonical Field Slot
vector. They do not require a physical row table or dense array. Each Adapter
maps its provider representation to exact slot, codec, absence, retirement,
erasure, Record Model Revision, and Record Revision meaning. A physical column reorder
or rename has no semantic effect. An Adapter unable to preserve these facts
cannot implement the Authority Store Interface, though it may still expose a
derived Source.

### Value storage mapping

The canonical data format is not the universal physical database format. An
Authority Store or Source Adapter maps each exact compiled Value Shape to a
provider representation and declares which semantic operators it can preserve.
For example, an Adapter may map a decimal to a native `DECIMAL`, canonical
text, sortable bytes, or private coefficient and scale columns. It may map an
atomic money value to one provider value or several private columns while
exposing one logical Field Slot.

Every mapping satisfies both directions:

```text
canonical value -> provider representation -> equivalent canonical value

provider comparison or operator -> declared logical comparison or operator
```

Successful round-trip is necessary but not sufficient for query pushdown. A
plain textual decimal representation may round-trip exactly while lexical range
and order operations remain wrong. The Adapter advertises support per Value
Type, codec version, operator, collation, precision, null policy, and required
provider configuration. Read preparation may push an operator only when that
support is proved. Otherwise it evaluates over complete bounded canonical input
at another placement or reports the requirement unsupported; it never inserts
an implicit cast or provider-default approximation.

Native provider indexes and JSON indexes remain private accelerators. Their
existence does not create logical ordering, path-query, partial-update, or
granular-dependency semantics. Conversely, storing every canonical scalar in a
text or byte column is a valid Adapter strategy when its mapping and supported
operators pass conformance; it is not required by the portable model.

Changing only the lossless provider mapping, index, or column layout is an
Adapter or Placement concern. Changing a canonical codec, equality, ordering,
rounding, scale, temporal, unit, or JSON interpretation changes logical meaning
and therefore requires the corresponding Record Model Transition and Resource
compatibility analysis.

### Existing data integration

Existing product, analytics, graph, search, and time-series systems can
participate at four honest levels:

1. **Read Source Adapter.** The existing system remains authoritative. The
   Adapter declares identity, revision, freshness, ordering, deletion,
   authorization, live-delivery, and gap semantics.
2. **Selective mirror.** CDC materializes an explicitly covered slice. A gap
   invalidates that coverage. Local completeness never makes the mirror
   authoritative.
3. **Authority Store Adapter.** The database owns Formless records only when it
   atomically provides witness validation, idempotency ledger, Commit order,
   Record Model codecs, change history, audit, and outbox durability.
4. **External authority or effect.** The system retains its own write model.
   Formless invokes a named versioned domain capability or durable effect and
   exposes eventual status without pretending it joined a Formless Commit.

This permits a Program to use an existing product or analytics database
without copying everything into a Formless Data Context or flattening every
provider into a lowest-common-denominator record store.

### Sharding and rebalancing

A store may physically shard one Authority Scope only when the Adapter proves
the same atomic Commit, witness, uniqueness, idempotency, revision, snapshot,
and change-suffix semantics. Logical scope regrouping moves whole Authority
Partitions. It changes the available transaction and constraint domain and
therefore requires explicit semantic-topology, Operation, constraint, and
capability validation. Dividing a partition additionally requires an explicit
repartitioning migration. Core regrouping starts new Authority Scope IDs and
Epochs and retains each source scope's indivisible Commit order, Invocation
ledger, outbox, and terminal-outcome lookup. It never partitions historical
authority by inspecting old Mutations.

Placement movement preserves qualified record identity and has one writer at
cutover. Invocation retry resolves to the same logical Authority Scope. A
lossless move preserves Authority Epoch and history; an incompatible move
rotates the epoch and forces honest reset. Placement Revision remains separate
from both Program Revision and Authority Epoch.

Cross-shard or cross-Source Reads use composite provenance. Stable global
ordering, rank windows, exact extent, or pagination require a proved merge
capability. Otherwise the Read uses weaker declared semantics or fails as
unsupported.

### Authority model extensibility

The core Authority capability uses flat records and create, patch, and delete
Mutations. That is a semantic authority model, not a requirement to store rows
in SQLite or any other physical database. A distributed relational, key-value,
or document store may implement the same Authority Store Interface when it can
prove the required witnesses, atomic settlement, revisions, idempotency, and
change history.

A specialized system need not disguise append-only samples, graph changes, or
search indexing as record patches. A named authoritative write capability may
define another mutation and witness algebra, but it MUST declare:

- canonical input, Mutation, terminal outcome, and audit forms;
- atomicity and idempotency scope;
- concurrency, witness, revision, and conflict semantics;
- snapshot, change, resume, gap, deletion, and retention behavior where data is
  synchronizable;
- authorization and cache-partition facts;
- deterministic in-memory reference behavior and conformance traces.

Such a capability reuses Invocation identity, trusted Authority context,
terminal-outcome singularity, and explicit effect semantics. It does not extend
record Mutation with opaque provider commands or imply an atomic Commit across
independent authorities. Operations spanning authority capabilities use a
declared workflow, compensation, or provider-native common transaction.

Provider-specific performance is an allowed Implementation detail.
Provider-specific logical meaning is not.

## Snapshots, Archives, And Recovery

Snapshot, Portable Archive, computation checkpoint, and provider backup solve
different problems:

| Artifact | Purpose | Semantic claim |
| --- | --- | --- |
| Authority Snapshot | bootstrap, synchronization, migration, rebalance | one Authority Scope, Epoch, Record Model Revision, and Authority Revision |
| Source Snapshot | export from a Source that advertises it | exactly the Source coherence and provenance declared by its Adapter |
| Portable Archive | reviewable logical save, clone, transfer, or restore | canonical manifest plus independently fenced logical snapshots |
| Computation checkpoint | optional restore acceleration | discardable derived facts with complete validity proofs |
| Provider backup | provider-scoped physical recovery | physical encrypted/index/ledger state under provider-specific rules |

A record's domain `archived` status is an ordinary field patch and is unrelated
to every artifact in this section.

### Snapshot semantics

An Authority Snapshot is pinned to one exact Authority Scope, Authority Epoch,
Record Model Revision, Authority Revision, and Resume Token. Paging never changes that
basis. Snapshot plus its retained Commit suffix reconstructs current Authority
state or explicitly requires a new bootstrap. A suffix crossing Record Model
activation includes the ordered transition barrier and target Record Model Artifact
before any target Record Model record change; otherwise the lease ends with
`BootstrapRequired`.

A generic Source Snapshot exists only when the Source Adapter advertises an
export capability. External Sources may provide immutable versions,
watermarked ranges, or explicitly eventual enumeration. The Archive Module
records the actual claim and never relabels it as an Authority Snapshot.

### Portable Archive contract

A Portable Archive is canonical data, suitable for deterministic review,
diffing, hashing, signing, saving to disk, and transport. It may be streaming
and chunked; reviewability does not require one unbounded JSON object.

```ts
interface PortableArchiveManifest {
  format: ArchiveFormatVersion;
  program?: ArchivedProgramBasis;
  recordModels: readonly ArchivedRecordModelBasis[];
  contexts: readonly ArchivedDataContext[];
  sourceBindings: readonly ArchivedSourceBinding[];
  snapshots: readonly ArchivedSnapshotBasis[];
  externalDependencies: readonly ArchivedExternalDependency[];
  continuity: ArchiveContinuityClaims;
  capabilities: readonly ArchivedCapabilityRequirement[];
  chunks: readonly ArchiveChunkDescriptor[];
  rootDigest: CanonicalDigest;
}

type ExternalDependencyTreatment =
  | { kind: "embedded"; snapshot: ArchivedSnapshotId }
  | {
      kind: "referenced";
      immutableReference: CanonicalValue;
      provenance: SourceSnapshotProvenance;
    }
  | { kind: "omitted"; requirement: SourceRequirement };

interface SourceSnapshotProvenance {
  sourceInstance: SourceInstanceId;
  sourceBinding?: SourceBindingRevision;
  sourceEpoch: SourceEpoch;
  revisionOrWatermark: CanonicalValue;
  coherence: SourceCoherence;
  immutableVersionProof?: CanonicalValue;
}

interface ArchiveContinuityClaims {
  restoreModes: readonly RestoreMode[];
  currentRecords: CoverageClaim;
  identityAllocation: CoverageClaim;
  retiredIdentityFences: CoverageClaim;
  commitsAndChanges: CoverageClaim;
  invocationLedger: CoverageClaim;
  audit: CoverageClaim;
  outbox: CoverageClaim;
  deliveryStatus: CoverageClaim;
  recordModelTransitions: CoverageClaim;
  bindingCatalog: CoverageClaim;
}
```

The manifest includes:

- Schema Module and exact Record Model Artifact, including Revision, entity
  lineage, Field Slot high-water marks,
  retired-slot fences, exact Value Shapes and codec versions, and constraint
  provenance;
- Data Context identity, ownership, lifecycle, retention, Authority Partitions,
  and Authority Scope topology;
- identity allocation domains, high-water fences, and disposition of every
  live lease;
- Source Binding graph and external dependency treatment;
- per-Snapshot epoch, revision, coherence, continuation, and content digest;
- canonical Record IDs and slot-addressed values;
- required semantic capability and operator versions;
- deterministic ordering and chunk hashes.

`rootDigest` is computed from the canonical manifest with the `rootDigest`
position omitted, together with the ordered chunk descriptors and digests. It
does not recursively hash itself.

Canonical content contains no ambient export time or random identity. Archive
identity is content-addressed from the manifest and chunk digests; display
metadata such as who exported it and when belongs in a separate noncanonical
envelope.

Human-facing archive views may annotate slots with current semantic names, but
names do not replace canonical identities. Different physical Adapters export
byte-equivalent canonical content only for equivalent selected logical content,
lineage, continuity class, Archive profile, external-dependency treatment, and
provenance. Selected logical values enter only through their declared Value
Shapes. Runtime objects and ordinary Presentation drafts are omitted;
host-language serialization never determines Archive content.

Export is independently authorized against Data Context ownership, security and
field policy, retention, and erasure state. Hashes prove integrity, not trust or
authorization. Archive input is hostile: decoding enforces declared bounds on
bytes, nesting, chunks, expansion, values, and work before exposing facts.
Ownership or grant data inside an Archive is an untrusted claim at the target;
restore imports no credential or security grant implicitly. Every Program and
external Source attachment is rebound and reauthorized.

### Multi-scope consistency

A Portable Archive over several Authority Scopes is normally a set of
independently fenced Snapshots. It MUST NOT claim one global instant, revision,
or transaction unless a coordinated-snapshot capability proves it. Cross-Source
artifacts retain their actual revision vectors and coherence.

Portability classes are explicit. A self-contained Archive embeds every owned
dependency needed for restore. An environment-dependent Archive may retain
immutable references or omitted requirements that must be rebound and
revalidated.

Archive ownership follows Data Context ownership rather than every Source a
Program can read. A Program export contains its Portable Definition and Source
Binding Requirements. An Installation export adds its exact Source Binding
basis, owned context Snapshots, and references to shared or external contexts.
An instance Archive includes a Source Binding graph and each selected shared
context at most once.

### Computation checkpoints and historical meaning

Authoritative Archive correctness never depends on memoized or materialized
results. Derived data is rebuildable from authoritative Source state. An
optional computation checkpoint is a sidecar referencing the authoritative
Archive root digest. It does not participate in or change that root, canonical
identity, or review diff. A checkpoint may accelerate restore only when every
entry carries:

- semantic node fingerprint and compatible Program, Record Model, and Resource basis;
- exact Source Binding, epochs, Read provenance, coverage, and freshness;
- Security Partition Identity or a proof that the value is public;
- materializer, operator, and capability versions;
- an Archive persistence and encryption policy appropriate for its protected
  payload.

Portable Authority Archives MUST omit speculative checkpoints and pending
client overlay state. Exact client-session recovery, if ever supported, is a
separate protected artifact containing canonical pending Invocation envelopes;
speculative memo alone never authorizes redisplay or dispatch.

Restore verifies every fact or discards it. It never guesses compatibility or
migrates a memo entry by name. Erasure removes affected checkpoint and
materialized payload or invalidates the complete relevant partition.
Erasure cannot revoke an already exported copy outside managed storage. Runtime
can prevent later export or restore, record revocation and identity fences, and
erase Archive copies it controls; it never claims more.

Two restore intentions differ:

- **state under current semantics:** restore authoritative data, bind the
  current Program, and recompute derived results;
- **historical reproduction:** also restore the exact Portable Definition,
  Record Model Artifacts, compiler semantics, operator semantics, capability
  versions, and external immutable inputs used at that historical point. The
  Compiled Program is deterministically reconstructed or used as a verified
  cache; it is not a second semantic source.

Without the historical semantic artifacts, reevaluating old data under a new
Computed Value or Read is valid current interpretation, not historical
reproduction.

### Restore modes

Restore mode is explicit:

1. **Clone** creates a new Data Context and Authority lineage. Local Record IDs
   may be preserved because the Data Context qualifier changes. A multi-context
   clone uses one canonical Context Identity map and rewrites qualified internal
   references consistently.
2. **Replace** normally preserves Data Context Identity, builds verified
   inactive Authority lineages with new Authority Epochs, then compare-and-set
   activates them through one Context Catalog revision. Old lineages become
   historical inactive recovery state under policy rather than remaining
   simultaneously current.
3. **Merge or import** invokes explicit Operations or Record Model Transitions with an
   identity mapping and conflict policy. It is not a byte overwrite.
4. **Exact recovery** restores operational continuity, including required
   Invocation ledger, Commit and change lineage, retired-identity fences,
   outbox state, and delivery identities.

A state-transfer Archive that omits Invocation, outbox, or retention continuity
cannot silently resume the same lineage as exact recovery. It must clone, use a
new lineage, or carry explicit reset semantics that still preserve every
non-reuse fence required by the logical identities it retains.

Portable restore never replays an already delivered external effect. Exact
recovery preserves stable effect identities and statuses so delivery can resume
idempotently. A staged multi-context replacement publishes either the old or
new Context Catalog state, never a partially restored mixture.

### Archive and restore Interface

Archive semantics and execution remain separate. Inspection and restore
planning are pure over canonical manifests, chunk facts, target capabilities,
and explicit policy. Export and restore execution are asynchronous and perform
I/O only through Adapters:

```ts
interface ArchiveSemantics {
  inspect(input: CanonicalArchiveFacts): ArchiveInspection;
  planRestore(request: ArchiveRestoreRequest): RestorePlan | ArchiveIssue;
}

interface ArchiveRuntime {
  export(request: ArchiveExportRequest): ArchiveStream;
  restore(execution: RestoreExecution): RestoreHandle;
  inspectRestore(
    targetContext: DataContextId,
    id: RestoreExecutionId,
  ): RestoreStatus | UnknownRestore;
}

interface RestoreExecution {
  id: RestoreExecutionId;
  archiveRoot: CanonicalDigest;
  mode: RestoreMode;
  expectedContextCatalogRevision: ContextCatalogRevision;
  targetAuthorityBasis: readonly AuthorityRestoreBasis[];
  planFingerprint: CanonicalDigest;
  requiredCapabilities: readonly CapabilityReference[];
}
```

Restore revalidates the pure plan against current catalog, ownership, policy,
Authority, and capability facts before mutation. Execution is durable and
idempotent by Restore Execution Identity and fingerprint. Same identity with a
different fingerprint rejects; retry or response loss returns stored status.
Replace publication compare-and-sets one Context Catalog Revision. Caller
cancellation after durable acceptance stops waiting but does not imply rollback.
Staging cleanup, terminal status, and abandoned work have explicit lifetime
owners. Exact recovery rejects unless every required continuity claim is
complete and supported.

Snapshot acquisition, artifact persistence, external Source export, and
provider recovery vary behind separate Adapter Seams. The in-memory Archive
Adapters support arbitrary chunk splits, cancellation, corruption, partial input,
fault injection, and all restore modes so correctness is proved without a
filesystem or production database.

## Runtime Topology

The same semantic Interfaces operate across client, server, and CLI. Topology
changes lifetime, latency, and available Adapters, not correctness rules.

### Client runtime

Core client behavior may:

- maintain long-lived Observations;
- coalesce Interest from multiple Surfaces;
- retain stale values during reconnect;
- apply Predictions and rebase them over Commits;
- update viewport Interest frequently.

Optional named capabilities may:

- persist bounded Source coverage;
- persist pending and confirmed-but-unincorporated Invocations and their causal
  order;
- execute declared Reads or Predictions while offline;
- hydrate Presentation from server snapshots.

Each optional capability owns its persistence, security, expiry, migration or
reset, recovery, and resource-bound semantics. None is implied by ordinary
Observation, Interest, Prediction, or rebase behavior.

Client cache and pending-work identity includes Data Context, Authority
Partition and relevant Context Catalog Basis, Source Binding Revision, Record
Model/Resource basis, Authority Epoch where applicable, and Security Partition.
Physical placement remains hidden. Rebinding to a different logical context
resets incompatible coverage; a transparent placement move need not.

Network loss changes freshness and refresh state, not logical membership. An
offline miss is unknown, never absent.

The client never becomes authoritative merely because it has a full replica.

### Server runtime

A server may host:

- Authority Operation execution;
- Data Context, Source Binding, Evolution, Placement, and Archive Modules;
- direct or remote Read Execution and Source Adapters;
- request-scoped Observations;
- server-side Presentation projection;
- shared caches with explicit ownership and security partitioning;
- transport endpoints.

A request-scoped Observation has deadline and cancellation ownership. Request
completion closes its leases unless an explicit shared cache or background rule
owns them.

Server composition across Sources respects declared coherence. Sharing a
process, Data Context, or database never implies an atomic cross-Authority
snapshot where none exists.

### Command-line runtime

A CLI uses the same Compiled Program, Reads, Operations, and Adapters. It may:

- validate and explain compiled plans;
- resolve a finite Observation;
- explicitly watch an Observation;
- invoke an Operation and wait for a terminal or indeterminate outcome;
- inspect Program, Data Context, ownership, Source Binding, Authority, and Placement
  graphs without exposing credentials;
- compare and validate Record Model Transitions;
- export, verify, diff, and inspect Portable Archives;
- plan or execute an explicit clone, replace, merge, or exact-recovery mode;
- run deterministic reference and Adapter conformance traces.

A finite resolve states its completion condition:

- first usable value;
- value satisfying freshness requirements;
- complete satisfaction of bounded Interest.

A finite resolver MUST use bounded Interest and a finite completion condition.
Full export or traversal of a finite or unbounded Relation requires a separate
streaming mode with explicit continuation, backpressure, cancellation, and
resource limits. Deadlines, display-safe diagnostics, and stable exit status
are part of its Interface.

### Server rendering and hydration

An interaction hydration envelope identifies typed observable reference, Scope
Instance, issuing Program Revision, Resource Revision, Evaluation Revision, and
compatible initial State. Each data dependency separately identifies Bound
Read, canonical inputs, Data Context and Source Binding Revision, Record Model
Revision, security partition, Source Epoch, Read Data Revision or composite
provenance, Interest coverage, and freshness. A multi-Read Presentation never
fabricates one shared Read Data Revision. No hydration artifact exposes physical
placement or provider locator.

Only compatible dependency facts initialize current client coverage. The
runtime may reuse a compatible subset while publishing one honest atomic client
snapshot for the resulting ready, loading, stale, or unavailable facts. An
incompatible server Presentation may be shown as explicitly prior display data,
but it MUST NOT initialize current coverage or masquerade as current State.

A compatible but stale server value may remain visible while revalidating. The
client must not silently relabel incompatible data as current.

### Program, Record Model, Source Binding, and Placement changes

Every Bound Read, Prepared Invocation, Observable Reference, hydration envelope,
Invocation envelope, and remote Observation request carries its exact issuing
Program Revision plus the Record Model, Resource, Source Binding, Authority, and
provenance basis required by that artifact. Compatibility is never inferred
from reused names or similar TypeScript types.

When Program Revision changes, the Compiler emits explicit compatibility facts:

- an active Observation can survive only when resource fingerprint, complete
  dependency meaning, Source Binding, output codec, authorization, scope, and Source
  provenance remain compatible;
- incompatible Observations reset atomically and late old-graph events cannot
  publish as current;
- Source facts may be reused after Source Binding, Record Model codec, authorization, and
  provenance revalidation even when derived memo entries cannot;
- derived memo and persistent materialization reuse requires semantic node
  fingerprint plus the complete memo or materialization validity proof;
  otherwise it rebuilds;
- old Presentation or hydration data becomes explicitly prior display data
  when its resource projection is incompatible;
- a compatible field rename retains its Field Slot and may preserve record
  facts, dependency masks, drafts, and issues;
- unincorporated Predictions are withdrawn unless exact Predictor and overlay
  compatibility is proved;
- a no-outcome Invocation executes only against its exact Operation semantics
  or an explicit deterministic translation; same name never rebinds it;
- a stored terminal outcome remains terminal and may be replayed under current
  disclosure policy without re-execution.

A Record Model Revision changes only through atomic Record Model Transition. A Source Binding
Revision change to a different logical Data Context or external Source
invalidates affected Observations, cursors, caches, and Predictions even if the
provider happens to contain equal values.

A Placement Revision change alone does not change logical identity or Program
meaning. If Authority and Source continuity are proved, Observations resume
under the same epochs and provenance. Otherwise transport or Source coverage
resets honestly; a broken Authority lineage also rotates Authority Epoch.

A runtime may retain multiple exact Program and Resource Revisions as a declared
capability, but compatibility is not assumed. Version retirement, cutover,
reset, and outcome retention are deterministic policy rather than deployment
timing accidents.

## Async And Error Semantics

Every asynchronous activity has one explicit lifetime owner:

| Activity | Lifetime owner | Completion or release | Failure meaning |
| --- | --- | --- | --- |
| Client Observation | Surface, Presentation, or custom caller | `close`, scope cancellation, or replacement | may retain honest stale value |
| State persistence write | Interaction Runtime after local State publication | synchronized, conflict, failed, or bounded retry exhaustion | handle close stops observation; it does not roll back published State or cancel runtime-owned persistence |
| Shared cache or prefetch | declared cache, pin, or background policy | budget expiry or owner release | loses coverage, never proves absence |
| Server Observation | request or explicit shared runtime policy | finite condition, deadline, or request end | closes request-owned leases only |
| Identity allocation lease | allocating caller and Authority allocation domain | range exhaustion, explicit close, or bounded expiry | unused offsets become invalid; issued high-water never rewinds |
| Authority snapshot | snapshot, Archive, migration, or optional replica caller | completion, explicit close, or bounded lease expiry | later page requires a replacement snapshot after expiry |
| CLI resolve/watch | command scope | finite condition, user cancellation, or deadline | stable exit issue; no domain rollback claim |
| Invocation | Invocation identity and Authority ledger after dispatch | authoritative terminal outcome or explicit expiry | caller may be indeterminate while work continues |
| Effect delivery | durable outbox entry | succeeded or declared terminal delivery status | never rolls back originating Commit |
| Record Model Transition | durable Transition Execution and Authority | applied, failed, or expired with cleanup policy | cancellation after acceptance stops waiting, not cutover |
| Installation activation | durable Installation Change and Installation Catalog | active revision, terminal rejection, or staged cleanup | no partially active installation becomes visible |
| Placement move | durable Placement coordinator | continuity-preserving cutover or explicit epoch reset | exactly one writer remains active |
| Archive export | export scope and artifact policy | valid final root digest or discarded incomplete output | cancellation never yields a valid partial Archive |
| Staged Restore | durable Restore Execution and Context Catalog | terminal outcome plus catalog activation or staging cleanup | caller cancellation after acceptance does not roll back |

Cancellation propagates only through activities owned by the cancelling scope.
Shared work continues while another owner demands it. Closing a handle prevents
later publication to that caller but correctness never assumes remote
cancellation succeeded.

Errors are owned and classified by the Module that understands them:

- static Definition or capability diagnostic;
- unresolved required input;
- invalid Operation input;
- authorization or policy rejection;
- concurrency conflict;
- Source or Adapter unavailability;
- transport interruption;
- deadline exceeded;
- indeterminate Invocation outcome;
- expired Resume Token or incompatible Authority Epoch;
- incompatible Record Model or Source Binding;
- stale Context Catalog Basis or exact-root Revision, or transition conflict;
- placement unavailable;
- invalid or corrupt Archive;
- unsupported restore mode or restore conflict;
- protocol or Adapter contract violation;
- internal invariant failure.

Issues crossing caller or Presentation Seams use stable, display-safe data:

```ts
interface DisplaySafeIssue {
  code:
    | "invalidDefinition"
    | "invalidInput"
    | "forbidden"
    | "unsupported"
    | "sourceUnavailable"
    | "identityCapacityUnavailable"
    | "productConformanceFailure"
    | "deadlineExceeded"
    | "transportFailure"
    | "protocolFailure"
    | "persistenceConflict"
    | "persistenceFailure"
    | "incompatibleProgram"
    | "incompatibleRecordModel"
    | "incompatibleBinding"
    | "staleCatalog"
    | "placementUnavailable"
    | "invalidArchive"
    | "restoreConflict"
    | "transitionConflict"
    | "expired"
    | "internal";
  retry: "never" | "sameInvocation" | "immediate" | "backoff" | "afterReset";
  message: string;
  details?: readonly DisplaySafeIssueDetail[];
  correlationId?: string;
}

interface DisplaySafeIssueDetail {
  code: string;
  path?: readonly (string | number)[];
  message: string;
}

interface DisplaySafeConflict {
  code: string;
  target?: QualifiedRecordIdentity;
  expectedRevision?: RecordRevision;
  actualRevision?: RecordRevision;
  resolution: "none" | "newInvocationAfterRebase" | "newInvocationAfterReplan";
}
```

A `DisplaySafeConflict` is terminal for its Invocation identity. Rebase or
replan creates a new Invocation identity and may cite the rejected Invocation as
causal context. Only an internal nonterminal `WitnessConflict` may replan and
retry before an Authority outcome is settled under the same identity.

Display-safe issues cross untrusted or renderer Seams. Provider details,
credentials, internal stack traces, and secret record values remain on the
trusted side.

Error invariants:

- authorization failure is not empty data;
- unsupported semantics are not silently approximated;
- timeout is a caller-scope outcome, not proof about Source state;
- transient transport failure may retain a stale ready value;
- partial Source failure produces partial data only when the Read explicitly
  permits it;
- otherwise runtime retains the last coherent stale result or reports error;
- Adapter exceptions normalize into stable issues;
- invalid caller values report `invalidInput`, while malformed canonical data
  from Transport, Authority Store, persistence, or Archive is a protocol,
  Adapter, or artifact violation at that Seam; neither is repaired by implicit
  coercion;
- retry does not duplicate logical publication or authoritative effects;
- cancellation correctness never depends on remote cancellation succeeding.

Cancelling an Observation releases Interest. Cancelling an Invocation is
effective only before dispatch is accepted. After dispatch, cancellation means
the caller stopped waiting; it does not imply rollback.

## Authorization, Privacy, And Audit

Authorization is evaluated by a trusted server or authoritative local context.
Clients may hide unavailable controls, but every Read and Operation is
reauthorized at its execution Seam.

A Bound Read contains exact Program Revision, Read Resource Revision, Source
Binding basis, and canonical inputs. A
trusted composition root or server supplies a Read Execution Context containing
actor, tenant, policy revision, and security partition. Remote callers cannot
choose this context or its cache partition. Cache identity combines the Bound
Read key with trusted execution context. Credentials themselves are not cache
keys.

Facts from different partitions never share cache entries unless the Adapter
proves equivalence.

Application Installation association, Data Context ownership, Authority Scope membership, and
physical co-location never grant access. Grants remain explicit and
reauthorizable.

Read policy may constrain Rows, Field References, aggregates, relationship
traversal, and individual output positions. Required output denial rejects the
Read. A declared disclosure output may become `withheld`. Policy filtering is
part of logical Read evaluation and never post-hoc property omission, null
substitution, a false empty Relation, or a false zero aggregate.

Operation policy may constrain actor, target records, accepted Field Slots,
Mutation effects, and output disclosure. A committed semantic result may be
withheld under current disclosure policy without changing or re-executing its
stored terminal outcome.

Audit records the semantic Invocation and terminal outcome, not transport
attempts as separate domain actions. Secret input, challenge proofs,
credentials, and protected field values are redacted or summarized according
to explicit audit policy.

Field-level audit facts retain Field References across rename. A display-safe
projection may add the current semantic name, but policy cannot be bypassed by
renaming a field or reusing an old name for a new slot.

Archive export and restore are independently authorized against Data Context
ownership, field policy, retention, erasure, and target Source Binding policy. Archive
ownership and grants are untrusted input at restore; credentials never enter
the logical artifact, and external references are rebound and reauthorized.
Protected checkpoint persistence additionally requires an explicit encryption
and key policy. Integrity hashes do not grant trust or access.

Static analysis and declared dependency manifests optimize execution. They do
not grant access or replace server validation.

## Generated And Custom UX

Generated UI is the default consumer of the same Host used by custom UX. There
is no generated-only State, Read, Selection, Operation, or lifecycle model.

Built-in Value Types provide renderer-neutral display and draft-input contract
descriptors sufficient for generated UI. Presentation chooses labels, locale,
format policy, and allowed control behavior without redefining the canonical
codec. A custom Value Type declares its required Presentation and Renderer
capabilities or an explicit display-only canonical fallback; a runtime never
guesses an editor from the value's underlying string or JSON encoding.

### Renderer Interface

Renderer Adapters consume versioned Presentation or Surface Snapshots and send
only declared Intents back through the Host:

```ts
interface Renderer<PlatformOutput> {
  capabilities: RendererCapabilities;

  render(
    snapshot: PresentationSnapshot<unknown> | SurfaceSnapshot,
    context: RendererContext,
  ): PlatformOutput | UnsupportedPresentation;
}

interface RendererContext {
  dispatch(intent: InteractionIntent): IntentDispatch;
  openInterest<Value>(
    reference: ObservableReference<Value>,
    interest: InterestFor<Value>,
  ): RendererInterestLease<Value>;
  environment: DisplayEnvironment;
}

interface RendererInterestLease<Value> {
  update(interest: InterestFor<Value>): void;
  close(): void;
}
```

The Renderer Interface owns platform event translation, focus, accessibility,
responsive behavior, and safe display formatting through declared Presentation
format and parse contracts. Formatting may depend on explicit locale and display
environment; it never changes canonical Value Type meaning. Raw or incomplete
editor text returns through declared draft Intents rather than masquerading as a
domain value. Renderer does not own State, Selection, Read evaluation,
authorization, prediction, or Operation planning.
Viewport and overscan changes update an explicitly owned Interest Lease;
they are not State Transitions or domain Intents unless Definition explicitly
models user-selected paging State.
Each Renderer Context belongs to one renderer instance and scope. Closing that
instance closes all of its Interest Leases without cancelling demand still
owned elsewhere.
Conformance verifies contract-version handling, Intent fidelity,
accessibility-required facts, lifecycle display, stable identity, and explicit
unsupported behavior.

Customization should use the shallowest Seam that supplies the needed control:
theme and design tokens; density, locale-aware formatting, and labels; one
Presentation-kind Renderer; Surface composition; complete Renderer; custom
Presentation; Host-level custom UX; or lower data and domain extensions.

| Customization Seam | Guarantees retained | Responsibility assumed | Required proof and forbidden bypasses |
| --- | --- | --- | --- |
| Theme, tokens, density, formatter | all Host and Renderer semantics | visual choices and display-only formatting | preserve typed values, accessibility facts, and Intent identity |
| Value formatter or editor | canonical Value Type, draft State, Input Binding, and Operation semantics | locale display, incomplete input, parse feedback, and platform control | emit accepted typed values only through declared parse contract; never redefine canonical encoding |
| One contract-kind Renderer | all runtime semantics and other renderers | platform UX for one versioned contract | Renderer conformance; no direct State or storage mutation |
| Custom Surface composition | compiled references, State, Reads, Operations | explicit layout and declared conditional instance composition | every dependency is an Input Binding; no policy inferred from layout |
| Complete Renderer | all Host semantics | all platform rendering and event translation | Renderer conformance for every claimed contract version |
| Custom Presentation projector | State, Read, Input Binding, Operation, Host lifecycle | pure projection and registered contract semantics | deterministic projection; emits only declared Intents |
| Interaction Host-level custom UX | interaction graph, Selection, Presentation, optimism, authorization outcomes | observation lifetime, display, and dispatch timing | use catalog references and Host Intents; no Data Runtime or storage bypass |
| Data Runtime-level custom UX | Read, cache, sync, Invocation, optimism, Authority semantics | its own State, Selection, Input Binding, Presentation, and interaction atomicity | never claim Host guarantees it did not implement |
| Semantic Read operator | common Read lifecycle and placement model | reference semantics, dependencies, capabilities, errors | deterministic in-memory evaluator and Read conformance |
| Physical Source Adapter | logical Read contract | provider planning, cursors, cancellation, work bounds | advertise only proved capabilities; no provider concepts escape |
| Operation planner | Invocation, Authority Store, idempotency, audit, outbox | pure authoritative decision and witnesses | no external I/O or direct physical writes during planning |
| External-effect handler | durable Commit and outbox identity | provider call, idempotence, result classification | Effect conformance; never report effect success as Commit atomicity |
| Specialized interaction runtime | declared Reads, Operations, and Presentation at its exterior | internal State, lifecycle, merge, undo, collaboration, or workflow semantics | explicit Interface and conformance; no pretense that internals are generic Selection |

Direct storage access is not an escape Seam inside this architecture. A fully
external runtime may choose it, but then it is outside Formless authorization,
idempotency, audit, synchronization, prediction, and invariant guarantees.

Definition contains capability keys and declarative configuration. It never
contains framework imports, arbitrary functions, credentials, or provider
clients.

## Worked Interaction Example

Consider a project workspace:

```text
Read projects
  -> ordered Relation<ProjectOption>

State selectedProject
  -> Selection<RecordId<Project>> constrained by projects

Read tasksForProject(project = selectedProject)
  -> ordered Relation<TaskRow>

Presentation projectTabs
  <- projects + selectedProject

Presentation taskTable
  <- tasksForProject + visible rank Interest

Operation completeTask(task)
  -> patch the task record's completion field
```

The same declaration supports:

- tabs, list, combobox, or custom project selection without changing State;
- URL persistence without making the URL the State owner;
- selected-project membership probes outside loaded project windows;
- a virtual table observing only visible and overscan task Rows;
- an infinite list using edge Interest over the same logical Read;
- optimistic completion through a Prediction;
- canonical Authority validation and Commit;
- custom UI observing the same references;
- CLI resolution of the selected project or invocation of `completeTask`;
- local, remote, or hybrid Read placement without schema changes.

If project membership is unknown during reconnect, Selection retains its
candidate. It is not cleared. If Authority proves absence at a compatible
revision, runtime reconciles according to declared policy and publishes the
new Selection and dependent task availability atomically.

## Deterministic Reference Model

The architecture is specified by observable behavior through its Interfaces.
The reference machine is conceptually:

```ts
interface CompilationArtifacts extends CompiledProgramBundle {
  proposedRecordModels: readonly ProposedRecordModelArtifact[];
}

compile(
  authoringDefinition: AuthoringDefinition,
  priorRecordModelLineage: readonly RecordModelArtifact[],
  capabilities: CapabilityCatalogSnapshot,
): CompilationArtifacts | Diagnostics;

analyzeEvolution(
  current: RecordModelArtifact,
  candidate: ProposedRecordModelArtifact,
): RecordModelEvolutionAnalysis;

interface ResolvedInstallationRuntimeBasis {
  installation: ActiveInstallationGate;
  program: CompiledProgram;
  sourceBindings: readonly ResolvedSourceBinding[];
  context: ContextCatalogBasisSnapshot;
  productConformanceProfile: ProductConformanceProfile;
}

open(
  basis: ResolvedInstallationRuntimeBasis,
  environment: RuntimeEnvironment,
  adapters: RuntimeAdapters,
): RuntimeState;

step(
  runtimeState,
  event,
  scriptedAdapters,
  deterministicDependencies,
): {
  state: RuntimeState;
  declaredEffects: readonly DeclaredEffect[];
  notifications: readonly ObservableReference[];
};
```

Resolving this runtime basis atomically proves that the gate's current active
Installation target names the supplied Compiled Program, Product Conformance Profile, Source
Binding revisions, and retained Context Catalog entries. `open` rejects an
incomplete, inactive, or cross-revision combination; it does not reconcile
independently supplied facts at runtime.

Runtime retains the gate and calls `admit` for every new use. Gate invalidation
therefore stops new work without pretending that the immutable historical
snapshot changed; existing admitted work follows its explicit retention and
cutover rules.

Tests inject:

- logical clock;
- fixed and generated Value Type vectors, malformed canonical data, locale
  formatters, and custom codec capability versions;
- identity and revision allocation;
- prior Record Model lineage, Field Slot high-water marks, and concurrent transition
  candidates;
- Data Context Source Bindings, Authority Scopes, and Placement Revisions;
- deterministic scheduler;
- Source changes and invalidations;
- transport delay, duplication, reorder, loss, chunking, and reconnect;
- storage and transport faults;
- Record Model cutover, Archive chunking, restore, and materializer faults;
- deadlines and cancellation;
- Adapter work and memory counters.

No conformance test depends on wall-clock sleeps, framework rendering, browser
storage, network access, or physical database internals.

Pure reference tests prove portable semantics and failure handling. They cannot
by themselves prove a production store's isolation, durability, latency, or
bounded-work claims. Every production Adapter additionally supplies
provider-specific evidence for the capabilities it advertises while running the
same shared conformance traces.

The same scenario traces run against local in-memory execution and remote
in-memory execution through the Transport Adapter.

## Compiler Conformance

The Compiler suite verifies:

- every reference resolves;
- input types, entity identities, cardinalities, and scopes match;
- every required input is bound exactly once;
- unused or ambiguous declarations are diagnosed according to policy;
- cycles fail with a path diagnostic, including mixed Computed Value and
  interaction cycles;
- layout order never determines dataflow;
- equivalent nonsemantic declaration ordering produces canonical output;
- initial explicit field sequences allocate deterministic slots, while later
  authoring or display reorder preserves prior slots;
- incidental object ordering cannot allocate slots, and multiple new fields use
  the explicit canonical allocation sequence rather than random module order;
- two Schema Modules cannot allocate one Entity lineage without an explicit
  serialized extension contract;
- qualified name lookup rejects ambiguity;
- every executable field use resolves to a Field Reference and no semantic
  field-name lookup remains in a Read, Operation, policy, constraint, audit, or
  dependency plan;
- entity slot high-water marks increase monotonically and retired slots cannot
  be allocated;
- null and optional absence have unambiguous active-vector encoding, while
  retired payload and erasure evidence remain separate retention metadata;
- every ordered Relation has a unique identity tie-breaker;
- Read operators declare dependencies and capabilities;
- Operation planners, Predictors, policies, Presentation contracts, and effect
  kinds resolve by stable identity and compatible version;
- unsupported capabilities fail explicitly;
- compiled operator order preserves filtering and ordering before Interest
  restriction and records their need for complete candidate coverage;
- whole-Relation aggregates cannot bind to window-local Rows as complete input;
- trusted TypeScript fragments compose without a second structural parser;
- every declared Value Shape resolves one exact available codec version and
  every operator is valid for its input and output Value Types;
- Input Bindings reject implicit coercion between types that share a JavaScript or
  canonical primitive representation;
- TypeScript `any`, casts, getters, exotic values, or environment-dependent
  output cannot bypass canonical semantic validation;
- Definition cannot embed callbacks, credentials, or provider clients;
- computation expressions compile to declarative nodes or registered
  capability references, never closures;
- semantic node fingerprints are stable under nonsemantic source changes and
  change under operator, type, dependency, authorization, collation, or
  capability changes;
- Source Binding Requirements are complete and stable, and their installed
  Source Binding Revisions never expose placement;
- a core strong constraint spanning independently revisioned Authority Scopes
  is rejected; a separately named distributed-authority algebra cannot
  masquerade as one core Commit;
- catalog descriptors and generated bindings resolve to the same stable typed
  references;
- bind factories canonicalize inputs, reject invalid scope or parameters, and
  produce stable Bound Read, Prepared Invocation, and Observable identities;
- omitted Invocation identity uses the deterministic injected generator while
  an explicit retry preserves the supplied identity;
- catalog visibility policy cannot grant execution authority or disclose
  protected metadata;
- catalog descriptors contain no cache key, physical plan, or provider handle;
- compiled plan explanations are stable and agent-readable.

## Value Conformance

The Value suite runs shared generated and fixed vectors through the pure Value
Module, runtime Input Bindings, in-memory Adapters, Transport, Archives, and each
production Adapter mapping it claims to support. It verifies:

- every core Value Type round-trips from canonical data to typed runtime value
  and back to byte-equivalent canonical data;
- semantically equivalent typed values encode to one canonical form, while
  distinct values do not compare equal and values from different shapes retain
  their type and codec basis in mixed-type fingerprints;
- equality is reflexive, symmetric, and transitive, and every orderable type's
  comparison is a deterministic total order consistent with equality;
- malformed, noncanonical, wrong-shape, out-of-range, oversized, and
  over-complex values reject with stable path-aware diagnostics;
- optional absence, explicit null, empty text, zero, false, empty collection,
  and an absent structure member remain distinct where declared;
- booleans remain native boolean values and are never accepted through truthy
  string or numeric coercion;
- finite floating-point behavior follows its declared signed-zero, overflow,
  rounding, and non-finite policy in every topology;
- exact integers above JavaScript's safe integer range survive client, server,
  Transport, Archive, and storage round-trip without loss;
- JavaScript numeric literals that cannot exactly represent a declared integer
  or decimal reject instead of preserving an already-rounded value;
- exact decimals preserve declared precision, scale, rounding, equality,
  ordering, arithmetic, and aggregation semantics without passing through
  binary floating point;
- lexical order of integer, decimal, temporal, identity, or domain encodings is
  never substituted for logical order unless the codec and Adapter explicitly
  prove an order-preserving mapping;
- date, time, local date-time, instant, duration, and timezone values never
  coerce into one another or acquire an ambient timezone;
- text follows its declared Unicode normalization and collation rather than
  host locale or provider defaults;
- enum, identity, and reference values cannot satisfy ordinary text or one
  another merely because each has a string encoding;
- byte encodings reject noncanonical variants and reproduce exact bytes;
- typed lists, tuples, and atomic structures validate every member through its
  own shape, canonicalize deterministic order, and enforce declared depth and
  size bounds;
- closed tagged variants reject unknown discriminants and validate exactly the
  selected branch;
- `DisclosedValue` canonical equality uses stable reason code and data, while
  localized Presentation messages do not change logical Read identity;
- runtime `bigint`, decimal, temporal, and custom values never cross Transport
  or Archive through host-language serialization;
- different Presentation locales and formatters produce the same domain and
  canonical value after successful parse;
- incomplete drafts such as `"-"`, `"1."`, or a partial date remain draft
  State, cannot satisfy a domain input, and never enter a Mutation;
- opaque JSON canonicalizes key order and accepted numbers, rejects
  `undefined`, sparse arrays, behavior-bearing objects, and excessive resource
  use, and has deterministic structural equality;
- opaque JSON receives whole-field dependency, replacement, and conflict
  behavior; unadvertised member-path queries, patches, ordering, or granular
  subscriptions reject;
- typed atomic values remain one logical Field Slot even when an Adapter uses
  several private provider columns;
- canonical-to-provider-to-canonical round-trip preserves logical values for
  every advertised physical mapping;
- provider filtering, ordering, grouping, and aggregation match pure reference
  operators for every advertised Value Type and edge-case vector;
- an Adapter that can round-trip a type but cannot preserve one operator may
  advertise the type without that operator and Read preparation rejects unsafe
  pushdown;
- local, remote, native-provider, and fallback bounded evaluation produce
equivalent canonical results and issues;
- changing only a conforming runtime or physical representation preserves
  Record Model meaning, while changing canonical codec, equality, ordering, rounding,
  scale, temporal, unit, or JSON semantics requires explicit compatibility or a
  Record Model Transition;
- a custom Value Type with a missing or mismatched capability version makes
  every dependent resource unsupported before execution;
- registered custom Value Types pass the same determinism, purity, resource,
  transport, storage, operator, and hostile-input traces as built-in types.

## Record Model Evolution Conformance

The evolution suite verifies:

- same Record Model Transition Definition ID with different semantics rejects;
- same qualified Transition Execution ID with a different plan fingerprint
  rejects, while replay returns its stored outcome;
- one Authority Scope exposes exactly one active Record Model Revision;
- a failed preparation or activation leaves the prior Record Model and data current;
- concurrent candidates from one base have one compare-and-set winner and the
  loser rebases before allocating slots;
- accepted Commits around cutover appear exactly once under quiesce or replay
  semantics;
- preparation racing ordinary writes either revalidates or translates every
  Commit after its captured Authority Revision;
- stale verification cannot activate;
- a stale or superseded Installation–Record Model Coordination Fence rejects at
  both Installation Catalog and Authority Store admission;
- a core drain/model/reactivate sequence excludes overlapping activation for
  its complete fenced basis, including after coordinator recovery;
- crash before durable activation leaves the prior Record Model current, while crash or
  lost response after activation replays the stored applied outcome;
- snapshot plus suffix crossing cutover delivers the target Record Model Artifact
  and transition barrier before target Record Model changes or requires bootstrap;
- every transformed or backfilled record receives a new Record Revision and
  observable change or replacement basis;
- unauthorized or destructively unapproved preparation and activation reject
  without disclosing protected facts;
- multi-scope rollout exposes per-scope Record Model provenance or an actually proved
  coordinated Source Binding switch, never a false global activation;
- every Commit, Snapshot page, and change page carries decodable Record Model
  provenance;
- add optional field preserves every existing slot and older short row;
- add required field fails without a valid default or complete backfill;
- reorder source declarations or displayed columns preserves Record Model Revision,
  slots, row bytes, dependency masks, and cache identity;
- rename preserves slot, payload, constraints, policies, and indexes; drafts,
  issues, and projected objects survive only under complete Resource and
  output-shape compatibility; the old authoring name stops resolving;
- retire field hides it from active Programs but retains its non-reuse fence;
- add after retirement allocates above the high-water mark;
- reintroduce a retired semantic name allocates a new slot;
- moving a field between entities requires explicit copy or reference rewrite;
- type transformation uses exact old and new codecs, handles every declared
  failure case deterministically, and never partially activates;
- changing canonical equality, ordering, rounding, precision, scale, temporal,
  unit, or JSON semantics is classified as a semantic Value Type change rather
  than a transparent physical remapping;
- adding uniqueness or reference constraints validates the complete affected
  current state, including races at cutover;
- differently ordered patch assignments normalize to one canonical Mutation;
- duplicate slot assignment, set/unset overlap, wrong-entity slot, retired
  slot, wrong codec, metadata reference, and unauthorized slot reject;
- null, optional absence, later-added slots, retained retired payload, and
  erasure evidence round-trip in their distinct logical or retention layers;
- every core Record envelope contains only qualified identity, Entity Identity,
  Record Model Revision, Record Revision, and canonical field vector;
- metadata references are read-only, policy-checked, and round-trip through
  Transport, Snapshot, and Archive without becoming Field Slots;
- an additional timestamp or lifecycle fact exists only through an ordinary
  declared field or a conforming named metadata capability;
- physical column reorder and vector compaction preserve canonical records;
- thousands of retire/add cycles preserve correctness without requiring a
  physically dense row;
- payload purge preserves slot, Record, and Invocation non-reuse fences;
- active Observation survives only when complete Resource compatibility is
  proved and otherwise resets atomically;
- unchanged resources may retain compatible Source facts across an unrelated
  Program change;
- pending Invocation and Prediction follow exact Resource transition policy;
- an old Operation cannot write a retired slot after activation without exact
  prior Record Model Authority or explicit translation;
- terminal Invocation outcome survives evolution and never re-executes;
- the same semantic transition executes independently in two Authority Scopes;
- post-activation rollback requires a new forward transition;
- Record Model Transition traces are equivalent through in-memory and production
  Record Model Evolution Adapters.

## Program And Installation Conformance

The Program Registry and Installation Catalog suites verify:

- registering one Program Revision is idempotent by canonical artifact identity;
- registration does not make a Program reachable through an Installation;
- Program retention pins every exact compiler, codec, operator, and capability
  Implementation required by retained semantic use;
- activation rejects an unregistered Resource, incompatible Record Model,
  missing Source Binding, stale relevant Context Catalog Basis, unavailable or
  unsatisfied Product Conformance Profile, invalid grant, invalid Installed
  Operation Exposure selection, or unavailable required capability;
- one Installation Revision publishes its Program, Product Conformance Profile,
  exact per-binding Record Model basis, routes, presentation policy,
  Installed Operation Exposures, grants, and Source Binding basis atomically;
- Record Model bases contain exactly one unambiguous entry per reachable Source
  Binding and Authority Scope pair;
- Installation and Record Model activation races are serialized by one durable
  monotonic Coordination Fence validated by both owners;
- resolving a retained historical Installation Revision never grants a current
  active gate, and gate invalidation rejects new preparation and dispatch;
- a Product Conformance Profile guarantees support and policy floors but never
  enables persistence or offline execution, or makes an Operation Exposure
  Definition reachable without both its Program definition and Installed
  Operation Exposure selection;
- deployment change cannot withdraw a selected profile guarantee from an active
  or draining Installation; unexpected loss reports Product Conformance failure
  rather than silently downgrading semantics;
- Installed Operation Exposure controls channel reachability and trusted source facts but
  never substitutes for Operation authorization;
- Invocation Source Basis binds Installation, Product Conformance Profile,
  Installed Operation Exposure where applicable, and trusted channel facts into
  preparation, idempotency, reconciliation, and replay;
- an unrelated Context Catalog change does not conflict with activation whose
  complete relevant basis remains current;
- a destructive Context Catalog change rejects while an active or draining
  Installation retains an affected entry; deactivation or a proved coordinated
  switch prevents dangling references;
- an incompatible Observation resets rather than mixing old and new Program
  graphs;
- a draining Installation accepts no new preparation while already accepted
  Invocations retain their exact Operation semantics;
- a retained Program cannot back a new Installation, but preserves exact
  semantics for existing typed references and follows each Installation's local
  active or draining state;
- retirement rejects while any unresolved semantic obligation remains;
- typed Program retention references are acquired and released by Installation,
  Invocation, Observation, Archive, and historical-decoder lifetimes;
- accepted work retains its exact historical Installation Revision and
  Invocation Source Basis until disclosure and replay obligations end;
- deactivate is expressible as an Installation Change and uninstall deactivates
  the Installation without implicitly deleting a Data
  Context or Source Binding.

## Data Context And Placement Conformance

The context and placement suites verify:

- two private contexts may use the same local Record ID without collision;
- two Authority Partitions in one context may use the same partition-local
  Record ID without collision;
- qualified Record ID survives Application Installation replacement, Adapter change, and physical
  shard movement or whole-partition scope regrouping;
- two Programs bound to one shared context observe the same Commits under
  independently enforced policy;
- two Program Source Bindings may target the same explicit Source Instance and share
  only facts whose complete Source, Record Model, security, coverage, and coherence
  bases are compatible;
- Source Binding Identity remains stable across a Source Binding catalog edit while Source
  Binding Revision and Context Catalog Revision advance;
- two concurrent catalog activations touching the same entry basis have one
  winner, while disjoint changes may both succeed and still publish ordered
  complete catalog revisions;
- one Program can combine private, shared, and external Sources without
  transferring ownership;
- uninstall removes the installation and grants but does not delete an unowned
  shared context or unrelated Source Binding;
- same-named entities from unrelated modules never merge implicitly;
- two Source Binding Requirements resolved to incompatible Source Instances
  cannot share cache facts;
- each Commit, Invocation ledger entry, outbox intent, and Authority Revision
  belongs to one Authority Scope;
- one Authority Partition cannot be current in two Authority Scopes at one
  Context Catalog Revision;
- scope regrouping drains and fences source scopes, settles pending Invocations,
  transfers current records, Record allocation state, fences, and Record Model
  lineage, then starts new scope IDs and Epochs;
- regrouping closure contains every current partition in each touched source
  scope, so no partition remains mapped to a scope that accepts no new work;
- regrouping retains old qualified Commit, Invocation, ledger, outbox, and
  terminal-outcome history and requires synchronization bootstrap;
- regrouping transfers or closes live Record leases atomically with each
  partition, closes old-scope Invocation leases, invalidates unused offsets,
  and requires fresh Invocation capacity in the new scope;
- dividing an Authority Partition rejects without an explicit repartitioning
  migration that creates new Record Identities and rewrites references;
- Authority Partition Identity and retired Qualified Record Identity are never
  reused;
- ordinary patch rejects a change to partition assignment or an immutable
  affinity input;
- no Authority Scope contains facts from independently owned Data Contexts;
- a core Mutation batch cannot span Authority Scopes;
- global constraint intent is never silently reduced to per-partition scope;
- a cross-Authority reference does not acquire strong delete or existence
  semantics by physical co-location;
- caller-selected routing cannot bypass authorization or constraint policy;
- tenant or domain affinity resolves an immutable Authority Partition and the
  Context Catalog resolves its current Authority Scope before Placement;
  caller-controlled physical hints cannot change either resolution;
- moving one intact Authority Scope preserves identity, idempotency, and change
  continuity under a proved single-writer cutover;
- a move racing Invocation retry, Snapshot paging, and a live Observation has
  exactly one active writer and preserves every accepted outcome and change;
- a discontinuous move rotates Authority Epoch and resets stale consumers;
- splitting a scope rejects Operations or constraints whose required atomicity
  no longer fits;
- a named authority-topology capability translates old-scope Invocations,
  history, outbox, Snapshot leases, Resume Tokens, or Observations only with an
  exact auditable equivalence proof;
- cross-scope and cross-Source Reads carry honest composite provenance;
- a placement-only move does not change Program, Record Model, Resource, Record, or
  Data Context identity;
- rebinding to a different logical context invalidates affected Observations,
  cursors, caches, and Predictions;
- security grants remain independent of ownership and physical co-location;
- in-memory and production Placement Adapters run the same routing, movement,
  reset, and failure traces.

## Data Runtime Read Conformance

### Logical semantics

- canonical equivalent inputs share Read identity;
- different Read Resource Revisions, Source Bindings, Record Model codecs, security
  partitions, collations, or semantic inputs do not collide;
- values sharing the same encoded string but different Value Shapes do not
  collide, bind, compare, or cache as the same typed value;
- ambient clock changes do not affect Reads lacking a time input;
- unresolved required input is unavailable and causes no Adapter work;
- local, remote, and hybrid execution over the same scripted logical Source
  state and provenance produce equivalent canonical results; explicitly
  eventual Sources may observe different revisions and report that provenance;
- fused and delegated multi-Source plans have one owning Read Execution stream
  and equivalent results under the same declared coherence;
- a Source Adapter cannot publish directly to callers or upgrade local revision
  into cross-Source coherence;
- unsupported operators fail rather than approximate silently; a supported
  operator scans only when selected Adapter and policy explicitly permit its
  declared work class.

### Ordered Relations

- duplicate visible sort values resolve by identity tie-breaker;
- null, collation, numeric, temporal, and descending semantics are deterministic;
- overlapping windows deduplicate and preserve order;
- insert before a rank window shifts positions coherently;
- delete inside a window removes and backfills when possible;
- ordering-field patch moves a Row atomically;
- membership-field patch moves a Row into or out of the Relation;
- projection-only patch changes value without changing membership or order;
- deletion or absence of an anchor publishes absent or unknown membership and
  does not invent a replacement position; fallback requires explicit edge or
  rank Interest;
- forward and backward edge traversal never skips or duplicates Rows.

### Knowledge and coverage

- selected identity outside loaded windows remains unknown;
- membership probe establishes present or absent without loading the Relation;
- only authoritative absence reconciles Selection;
- eviction changes known state to unknown, never absent;
- empty window does not imply empty Relation;
- exact extent zero proves empty;
- estimate zero does not prove empty;
- windows, membership, extent, and aggregates never combine incompatible
  revisions;
- one satisfied window can be complete Interest with partial Relation coverage.

### Dependency and invalidation

- unrelated Field Slot change causes no publication;
- projected Field Slot change updates affected materialized Rows;
- membership dependency invalidates membership;
- ordering dependency invalidates ordering and affected rank windows;
- graph edge change invalidates reachable traversals conservatively;
- time-series point invalidates relevant intervals or buckets when provable;
- opaque extension safely invalidates its complete logical input;
- uncertainty causes extra work, never a false-current result.

### Cache and security

- actor or tenant partitions never share protected facts;
- denial of a required projected field rejects the complete Read;
- a disclosure-typed output position becomes `withheld` without changing shape;
- denial never becomes null, omission, an empty Relation, or a zero aggregate;
- Row policy applies before projection and aggregate semantics;
- a derived output over protected facts requires explicit derived-output policy;
- cache reuse never crosses distinct field-disclosure bases;
- stale result remains visibly stale during refresh;
- refresh failure retains stale data only when policy permits;
- Record Model, Resource, Source Binding, Authority, or Source epoch change
  invalidates incompatible cache entries;
- projection superset reuse respects authorization and revision;
- TTL or memory pressure creates unknown coverage, not deletion;
- selective Source materialization cannot answer a filter, order, or aggregate
  whose completeness fence is insufficient;
- every advertised result-observation, selective-materialization, or full-replica
  strategy converges for the same logical Source state and provenance;
- committed cache and optimistic overlay never merge physically.

### Async and transport

- slow obsolete generation is ignored;
- cancellation races safely with replacement and delta events;
- Interest shrinks and grows while data is in flight;
- duplicate delta is idempotent;
- out-of-order or missing delta resets without state corruption;
- disconnect after snapshot resumes without a gap;
- expired token causes replacement;
- server epoch reset invalidates old cursors and tokens;
- Program Revision change retains only compiler-proved compatible observations,
  resets incompatible observations, and rejects every obsolete late frame;
- placement-only move preserves logical results and identity when continuity is
  proved;
- rebinding to another Data Context changes provenance and resets incompatible
  observations even when values happen to compare equal;
- interrupted chunks never publish false completeness;
- backpressure remains bounded;
- an equivalent Bound Read and Interest update retains generation and performs
  no logically required Adapter restart;
- one canonical change to Bound Read or Interest creates exactly one generation;
- close releases all owned leases.

## Computation Conformance

The computation suite verifies:

- cold, warm, disabled, evicted, and restored memo states preserve every
  published semantic claim while permitted loading timing and work may differ;
- a diamond graph evaluates one shared dirty node at most once per atomic
  evaluation pass;
- an unrelated Field Slot or State change performs zero affected-node work and
  publishes nothing;
- only the dirty closure required by current demand and background policy
  evaluates;
- closing one lease preserves shared computation while another owner demands
  it and releases it when the last owner closes;
- dynamic conditional dependency switches correctly because every branch guard
  remains tracked;
- unresolved, loading, and error inputs propagate unless explicitly consumed as
  lifecycle facts;
- stale, partial, and unknown-freshness inputs are accepted only by declared
  requirements and are never upgraded;
- a Computed Value combining several Reads preserves their complete provenance
  and restrictive Security Partition basis;
- uncertainty broadens invalidation rather than retaining a false-current memo;
- same semantic value with changed revision, freshness, coverage, issue, or
  overlay provenance remains observable according to contract;
- deterministic semantic errors may memoize against their complete basis while
  transient failure, cancellation, obsolete generation, and late completion
  cannot populate a semantic memo;
- cache-stampede demand coalesces without coupling caller cancellation;
- memo entries never cross Resource fingerprint, Record Model codec vector,
  Source Binding vector, Security Partition, Source epoch/revision vector, coverage,
  or Overlay basis;
- Computed Values are pure, typed, immutable, unsettable, scope-aware, and
  usable by Read, Operation, Computed Value, and Presentation Input Bindings;
- dispatching an Operation activates an otherwise unobserved Computed input,
  then releases its bounded demand after binding;
- a Computed-to-Read input change increments the downstream Observation
  generation exactly once, while equal output and dependency aspects leave it
  unchanged;
- internal Derivations cannot be independently observed or assigned lifecycle;
- local, remote, fused, and delegated physical graphs match the semantic graph;
- exact incremental evaluation equals full canonical recomputation, while
  approximate capabilities satisfy deterministic precision, error, merge, and
  provenance contracts;
- partial Relation coverage cannot satisfy a whole-Relation aggregate;
- cross-Source values and materializations preserve exact revision vectors and
  declared coherence;
- committed and speculative memo partitions never become interchangeable;
- optimistic overlay replay equals full recomputation and settlement evaluates
  the affected demanded closure once;
- a transparent or durable materialization may be discarded and rebuilt
  without changing Read meaning;
- authoritative derived values change only through Authority Commit semantics;
- incompatible Program or Resource change invalidates derived memo and rebuilds
  persistent materialization;
- materialization rebuild during cutover exposes honest loading or permitted
  stale state unless an explicit readiness fence was required;
- work, retained memory, invalidation fan-out, and provider calls remain inside
  advertised deterministic bounds.

## Interaction Runtime Conformance

### State

- typed transitions reject invalid values;
- domain State rejects raw formatted strings while declared draft State retains
  incomplete input and exposes parse status without producing a domain value;
- one State Transition publishes one interaction revision;
- shared scope shares identity and distinct scope isolates identity;
- defaults initialize only when policy permits;
- reset follows declared policy;
- persistence failure does not corrupt committed State;
- read-only persistence reports synchronized, defaulted, diverged, conflict, or
  unavailable truthfully and never enters a write-pending state;
- persisted State address includes Program, State Resource, Scope Instance,
  Security Partition, and State Persistence Binding identities; parameters join
  only through an explicitly derived scope key;
- one core State Transition writes one State Persistence Scope, while a
  multi-target capability exposes per-target status and partial-failure rules;
- `requireExplicitResolution` exposes a stable observable conflict reference and
  stale retain-local or adopt-external resolution transitions reject;
- closing a Transition Handle after local publication does not cancel the
  runtime-owned persistence write;
- persistence updates cannot create feedback loops;
- local write echoes deduplicate by origin and Persistence Revision;
- external navigation racing a local transition follows declared conflict
  policy and preserves unrelated medium data;
- duplicate, reset, and out-of-order persistence events are handled explicitly;
- a persistence reset invalidates the prior revision lineage and triggers fresh
  policy-driven initialization; it is never interpreted as an empty snapshot;
- one State change reevaluates all dependents before notification.

### Selection

- zero, one, and many cardinalities remain distinct;
- duplicate identities normalize deterministically;
- option reordering preserves Selection;
- loading, unavailable, stale, evicted, and outside-coverage preserve candidate;
- authoritative absence reconciles according to policy;
- exact empty Relation and empty loaded window remain distinct;
- invalid persisted values do not become resolved before membership proof;
- resource-set Selection uses compiled membership rather than Relation coverage;
- capability-unavailable resource remains distinct from an unknown or missing
  record;
- Program and Resource revision changes revalidate persisted resource keys
  deterministically;
- reconciliation and dependent Presentation publication are atomic.

### Input Bindings and graph

- Input Bindings from literal, environment, State, Selection, and Read sources
  preserve types;
- Input Bindings perform no implicit primitive or string coercion and accept a draft
  value only after its exact parser produces the declared domain type;
- Input Bindings carry no behavior;
- missing required inputs make dependents unavailable;
- optional and missing-required inputs remain distinct;
- layout order does not affect evaluation;
- unrelated graph nodes do not reevaluate or notify;
- one data revision yields one coherent affected interaction revision.

### Dynamic instances and forms

- repeated instance identity follows Row identity across reorder;
- changing canonical parameters reevaluates the same Scope Instance when its
  stable scope key is unchanged;
- parameter-distinct State exists only when the declaration explicitly derives
  distinct scope keys;
- removal closes instance-owned Observations and releases demand;
- reinsertion restores State only under declared retention or persistence;
- shared ancestor State remains live while any instance demands it;
- equivalent Reads across instances may coalesce without coupling lifetime;
- dirty edit fields survive unrelated authoritative refresh;
- incomplete numeric, temporal, and structured drafts survive rerender and
  cannot submit until every required field has an accepted typed value;
- reset, cancel, double-submit, and leave-while-dirty follow declared policy;
- local validation never suppresses authoritative validation;
- accepted form submission adopts canonical output and Commit identity;
- terminal rejection, including conflict, retains draft and structured issues.

### Host and Presentation

- subscription atomically returns its initial snapshot, including when a
  publication races registration;
- listener-triggered State dispatch, update, and close are serialized after the
  current notification pass; reentrant subscribe captures current state without
  a nested callback;
- reentrant State dispatch returns a queued TransitionHandle that later reports
  its applied revision or rejection;
- one failing listener does not suppress other listeners;
- snapshot identity remains stable when semantics are unchanged;
- a canonically changed reference or Interest tuple creates exactly one new
  generation and an equivalent update retains the current generation;
- close suppresses future observation;
- one publication causes at most one notification per changed observation;
- observing one Presentation activates only compiled dependencies;
- shared observations reuse data while retaining caller-specific Interest;
- projection-only Row change does not notify Relation-structure reference;
- structure, Row, and field references changed by one event expose one
  Evaluation Revision before notification;
- closing one granular reference retains a shared lease while another owner
  still demands it;
- each Renderer Interest Lease updates and closes only its own demand, and
  closing a Renderer Context releases all of its leases without cancelling
  another context's equivalent Interest;
- generated and custom callers receive identical facts;
- Presentation contains no callbacks, provider cursors, or storage handles;
- unsupported Presentation contract versions use declared fallback or report
  unsupported;
- every control Intent resolves to a declared State Transition or Operation;
- dispatching one immutable Operation Intent twice allocates distinct Invocation
  identities, while `InvocationHandle.retry` preserves the original identity;
- rendering through different Adapters cannot change runtime traces.

## Authority Store Conformance

The Authority suite verifies:

- equivalent canonical Invocation, trusted context, and Fact Snapshots produce
  equivalent planning decisions;
- every Fact batch carries one Authority Scope, Authority Epoch, Record Model Revision,
  and Authority Revision, while separate rounds may advance independently;
- a concurrent change between planning rounds either survives complete witness
  revalidation or conflicts before Commit;
- planning performs no ambient I/O and requests only declared finite facts;
- unauthorized facts never reach application planning as trusted input;
- omission of a required witness cannot bypass a registered store invariant;
- create requires a valid current allocation, proves never-committed identity,
  and rejects a merely absent but unallocated or previously used identity;
- expired or closed identity leases cannot issue new Record or Invocation IDs;
- allocation domains enforce configured bounds on concurrent leases and total
  reserved offsets;
- preparation or interactive dispatch without prefetched Invocation capacity
  creates no Invocation, Prediction, or transport work and returns a retryable
  capacity result;
- optimistic create without prefetched Record capacity may retain a provisional
  UI key but creates no Record Mutation or dispatchable Record Identity;
- local and Transport-backed Identity Lease Providers pass the same acquisition,
  close, exhaustion, replay, and bound traces;
- an unacknowledged offline Invocation from an expired lease is withdrawn rather
  than dispatched unless a named offline capability proves another rule;
- compacted allocation ranges retain exact high-water rejection without one
  tombstone per portable-core identity;
- patch and delete require correct Record Revision;
- create and patch decode against the exact active Record Model Revision, and create
  cannot supply retired payload, erasure evidence, or a different model vector;
- required-field defaults and backfills produce one deterministic canonical
  active Record Model vector or reject the complete Commit;
- slot-ordered set, unset, null, absence, and no-op semantics are unambiguous;
- assignment values decode under the exact active slot Value Shape and reject
  shape-compatible-looking text, JSON, number, identity, or domain values of a
  different type;
- a Field Reference for another Entity rejects even when its numeric slot exists
  on the target Entity;
- out-of-range or noncanonical trailing bitmap bits, bitmap/value popcount
  mismatch, and non-increasing value order reject before mutation;
- unknown, retired, wrong-entity, wrong-type, metadata, and unauthorized Field
  Slots reject atomically; Record metadata references are not writable slots;
- an older physical row encoding is normalized to the active Record Model before it is
  exposed, compared, mutated, synchronized, or archived;
- concurrent record writers have one declared winner;
- concurrent unique claims have one winner;
- reference, delete-blocker, schema, and predicate races conflict safely;
- multi-record Commit fully applies or fully rolls back;
- each Commit and Invocation ledger entry belongs to exactly one Authority
  Scope and no core Mutation batch spans scopes;
- every canonical Commit attempt has at most one final Mutation per record and
  folds create/patch/delete steps according to the declared algebra;
- accepted no-op produces an empty Commit with durable correlation;
- same Invocation and fingerprint replays one outcome;
- same Invocation with different fingerprint rejects;
- identical local Invocation IDs in different Authority Scopes remain distinct
  qualified identities and cannot observe or settle one another;
- settlement fence classifies each requested no-outcome, terminally rejected,
  included-Commit, or later-Commit Invocation without crossing Authority or
  security scope;
- reconciliation rejects mismatched Program, Record Model, Resource, Source Binding,
  Authority, Operation, or canonical input basis rather than attaching an
  ID-colliding outcome;
- settlement recovers disclosure-filtered typed output independently of Commit
  incorporation;
- failure injection before, during, and after atomic Commit cannot produce a
  record change without durable terminal outcome;
- deterministic terminal-rejection replay, including conflict, according to
  policy;
- change batch is atomic and Resume Token never addresses an interior change;
- paged snapshot remains pinned to one Authority, Record Model, epoch, revision, and
  retained suffix;
- explicit close or bounded expiry releases a Snapshot Lease, and an abandoned
  next-page request returns `BootstrapRequired` after compaction;
- snapshot plus suffix reconstructs current state, including a Record Model activation
  barrier that supplies the target Record Model Artifact before target Record Model
  changes or requires bootstrap;
- activating a Record Model changes the scope's ordered active Record Model state without
  replacing its Authority Scope, Authority Store, or Adapter identity;
- synchronization delete evidence remains until checkpoint permits removal;
- non-sensitive identity fences survive payload and tombstone purge;
- deleted record and compacted Invocation identities are not reused;
- expired history or epoch reset requires bootstrap;
- outbox intent and terminal outcome become durable atomically with Commit;
- an external database Adapter lacking a co-durable Invocation ledger, change
  log, and transactional outbox cannot advertise the Authority Store Interface;
- physical sharding preserves witness, idempotency, revision, snapshot, suffix,
  and single-writer semantics;
- Authority Scopes and Security Partitions remain isolated.

## Archive And Restore Conformance

The Archive suite verifies:

- vector-, document-, and column-based Adapters produce byte-equivalent
  canonical Archive content for equivalent selected logical content, lineage,
  continuity class, Archive profile, external-dependency treatment, and
  provenance;
- Archives reproduce exact Value Shapes, codec versions, and canonical values
  without serializing runtime objects or Presentation drafts;
- every manifest, chunk order, digest, and diagnostic is deterministic;
- root digest is computed with its own manifest position omitted and never
  recursively depends on itself;
- corruption, truncation, duplicate chunks, wrong digest, incompatible codec,
  and unsupported capability fail explicitly;
- each Authority Snapshot is pinned to one scope, epoch, Record Model Revision,
  Authority Revision, and suffix token;
- a multi-scope Archive reports per-scope revisions and never claims a false
  global instant;
- external dependencies are exactly embedded, immutably referenced with
  provenance, or omitted as a visible requirement;
- owned shared contexts occur once and readable but unowned contexts are not
  captured implicitly;
- Field Slot high-water marks, retired slots, Record fences, and Invocation
  fences survive round-trip and payload erasure;
- Authority Partition ownership, identity allocation domains, allocation
  high-water fences, and live-lease disposition survive round-trip;
- restore succeeds with every computation checkpoint discarded;
- compatible checkpoint entries accelerate without changing results;
- incompatible fingerprint, Program, Record Model, Source, security, coverage, or
  materializer basis causes checkpoint discard, not semantic failure;
- adding, removing, or corrupting a computation-checkpoint sidecar never changes
  the authoritative Archive root digest;
- erasure clears or invalidates every affected persisted derived fact;
- state-under-current-semantics and historical reproduction produce their
  separately declared results;
- historical reproduction fails honestly when exact Program, operator,
  capability, or external immutable input is absent;
- clone creates a new Data Context lineage while preserving allowed local IDs;
- multi-context clone uses one canonical Context Identity map for every Record
  reference, Source Binding, and archived ownership fact;
- replace publishes either the old or new Context Catalog state and never a partial
  mixture under injected failure;
- a stale or tampered Restore plan, target Authority basis, or Context Catalog
  Revision loses revalidation without publishing staged state;
- same Restore Execution Identity and fingerprint replays one durable status,
  while reuse with a different fingerprint rejects;
- merge/import follows explicit identity mapping and conflict policy;
- exact recovery restores required ledger, change, outbox, and delivery
  continuity;
- exact recovery rejects every incomplete or unsupported required continuity
  claim rather than silently degrading to state transfer;
- a state-transfer Archive cannot silently resume an incompletely captured
  lineage;
- stale clients and same-ID Invocation retries cannot cross replacement into a
  new Authority Epoch incorrectly;
- Portable restore never redelivers an already delivered external effect;
- speculative overlays, pending client state, and speculative memo never enter
  an authoritative Portable Archive;
- erasure invalidates managed Archive and checkpoint copies but never claims an
  already exported copy was erased;
- unauthorized export, inspect, plan, and restore reveal no protected manifest,
  ownership, schema, digest, or target-existence facts;
- hostile byte size, value count, nesting, chunk count, expansion ratio, and
  decompression work fail within declared bounds;
- checkpoint encryption and persistence policy prevents protected derived facts
  from crossing their Security Partition;
- cancellation before export completion publishes no authoritative root;
  cancellation after accepted restore only stops the caller's wait and cannot
  imply rollback;
- export and restore remain streaming, cancellable, backpressured, and bounded.

## External Effect Conformance

The effect suite verifies:

- effect identity is stable across outbox retries and worker restart;
- duplicate delivery invokes an `idempotent` external action at most once in
  external semantics;
- `reconcilable` and `compensating` Effects satisfy their explicitly weaker
  outcome, inspection, and compensation contracts without being mislabeled
  idempotent;
- crash before provider call, during an uncertain call, and before status write
  converges through same-identity retry or explicit reconciliation;
- retryable and terminal failures remain distinct and observable;
- effect failure never rolls back or mutates its originating Commit;
- an incompatible effect kind or version fails explicitly;
- provider receipts and issues are canonicalized and redacted before
  publication;
- retry queues and retained status obey declared work and retention bounds.

## Optimistic Conformance

The optimistic suite verifies:

- prediction appears without modifying committed state;
- overlay provenance never changes authoritative Read Data Revision or Resume Token;
- predicted record effects use exact Record Model Revision and Field Slots;
- speculative Computed Value and Derivation memo never enters committed memo;
- projection-only patch updates a known Row without invalidating structure;
- predicted sort or membership change with insufficient rank coverage makes the
  affected rank window partial rather than inventing position;
- predicted delete in an edge window removes the known Row but leaves unknown
  backfill and continuation until proved;
- predicted create enters an edge or rank window only when membership and
  ordered position are locally provable;
- predicted membership never reconciles Selection, and exact extent downgrades
  when complete membership delta is unknown;
- result-only remote Read with insufficient facts retains authoritative value
  and exposes blocked Prediction status;
- authoritative success updates the handle, and incorporation into committed
  base removes its Prediction atomically;
- canonicalized server values replace local values;
- rejection removes speculative effects and preserves declared draft state;
- conflict follows Operation concurrency policy;
- response-first and stream-first delivery converge;
- lost response plus stream commit settles correctly;
- lost response for an empty Commit recovers the typed Operation output through
  settlement reconciliation;
- result-level update containing a non-idempotent Invocation's effect before its
  response does not replay that Prediction twice;
- an unavailable Settlement Fence retains the prior coherent publication rather
  than guessing whether a pending Invocation is included;
- a Commit after the fence is not removed from the overlay against an older
  committed base;
- lost rejection response remains indeterminate until same-ID retry replays the
  stored rejection and removes Prediction exactly once;
- lost terminal-conflict response reconstructs the same stored conflict
  rejection through settlement reconciliation;
- duplicated response and Commit do not double-apply;
- later dependent Predictions replay in causal order;
- overlay incremental evaluation equals full replay, and settlement evaluates
  each affected demanded computation once;
- equal predicted and committed values retain distinct provenance until
  settlement proves incorporation;
- when durable-pending-work is advertised, pending Invocations and their causal
  order survive restart; core in-memory conformance makes no restart claim;
- Program Revision change between Prediction and dispatch withdraws the overlay
  and fails closed unless exact old semantics remain registered;
- Program Revision change after Commit but before response replays the stored
  terminal outcome without re-execution;
- incompatible Record Model, Resource, or Source Binding change withdraws computed and
  record overlay facts; a compatible field rename preserves slot-addressed
  intent;
- logout or tenant switch withdraws and hides old-partition Predictions before
  publishing new-context data;
- when durable-pending-work is advertised, restart under a different security
  partition neither displays nor retries retained Invocations;
- optimistic create uses stable canonical identity;
- optimistic delete restores correctly on rejection;
- unrelated authoritative changes survive rebase;
- pending status never becomes a domain record field.

The primary property is:

```text
visible state =
  fold(authoritative Commits)
  |> replay(ordered Predictions not yet proved incorporated in that base)
```

## Transport Conformance

The in-memory Transport Adapter MUST be able to script:

- delay;
- duplicate delivery;
- reorder delivery;
- drop before or after remote acceptance;
- disconnect and reconnect;
- chunk replacement snapshots;
- expire Observation Resume Tokens without exposing Authority synchronization
  history;
- acquire, exhaust, close, and replay bounded Identity Leases;
- reset Authority or Source epoch;
- change Program, Record Model, Resource, Source Binding, and Placement Revision
  independently between observation, dispatch, settlement, and hydration;
- race Interest update with in-flight frames;
- apply bounded backpressure;
- reconcile pending Invocation outcomes through a chosen Authority Revision;
- deliver Commit before Invocation response.

Conformance asserts convergence, bounded buffering, stale-generation rejection,
correct indeterminate outcomes, gap detection, and safe cancellation.

A direct function call that cannot model these behaviors is not a sufficient
remote-topology reference Adapter.

## Scale And Work Conformance

Performance contracts use deterministic work and memory counters rather than
wall-clock timing alone.

A lazy million-Row Source paired with an Adapter advertising bounded rank
execution should support scenarios such as:

1. observe rank 750,000 with count 80;
2. assert Rows examined, provider calls, retained memory, invalidation work, and
   published Rows remain inside advertised bounds;
3. patch a projected field outside Interest and publish nothing;
4. insert before the viewport and update rank coherently;
5. update one visible ordering field and publish one atomic reordered window;
6. delete a visible Row and backfill without loading the Relation;
7. grow an infinite edge window from 50 to 100 without duplicate Rows;
8. share overlapping Interest across observers without coupling lifetimes;
9. close observations and enforce declared cache-retention budget;
10. resolve a globally ordered rank across advertised shards without scanning
    every shard, or report that bounded global rank is unsupported;
11. fail one shard and publish only an explicitly partial result with complete
    provenance or a structured error, never false completeness.

Graph-scale scenarios additionally verify wide and deep dependency closures,
diamond sharing, dynamic branch changes, invalidation fan-out, memo stampede
coalescing, materialization rebuild, cancellation sharing, and retained-memory
budgets. Work is counted by semantic node, Source fact, Adapter call, and
published reference rather than wall time alone.

Additional scale traces verify that dispatch-only Computed inputs activate only
their bounded dependency closure; thousands of dormant pending Invocations do
not retain live observations; deterministic error memoization avoids repeated
work while transient failures do not poison caches; and persistent
materialization rebuild remains within declared work and stale-serving policy.
Archive traces bound chunking, nesting, decompression, verification, and staging
work, and prove deterministic checkpoint acceptance or discard without changing
authoritative results.

The reference oracle is:

```text
published Observation =
  canonical Read evaluation
  restricted to current Interest
  at the declared coherence and Source provenance
```

Model-based tests compare incremental results with full reference recomputation
after generated source changes.

## Source-Shape Conformance

The common Read Interface must cover more than record tables:

- record Relation: edge, rank, membership, updates, delete, and extent;
- time series: interval ordering, late points, stable bucket identity,
  downsampling capability, and missing-versus-zero semantics;
- graph: edge changes, cycles, repeated nodes through distinct path identity,
  traversal invalidation, and bounded depth;
- search: stable result identity, score-order tie-break, cursor invalidation, and
  explicitly eventual index freshness;
- aggregate: scalar or grouped Relation output using the same Observation
  lifecycle;
- external eventual Source: declared coherence and honest stale/error facts;
- existing read-only database: stable logical identity and explicit revision,
  authorization, ordering, and deletion semantics;
- CDC mirror: exact coverage plus gap invalidation rather than false absence;
- external Authority Store: full witness, ledger, Commit, snapshot, change,
  Record Model codec, and outbox conformance.

A provider-specific Source may support specialized operators. It still returns
ordinary typed Read values and must declare capability, dependency, and failure
semantics.

## Use-Case Validation

| Use case | Expression through the model | Core or named extension | Required capability |
| --- | --- | --- | --- |
| Master-detail workspace | Selection drives identity Read and dependent Relation | core | membership probe, scoped State |
| Virtualized data grid | filter/sort State binds Read; viewport is rank Interest | core plus store capability | stable total order, bounded rank |
| Infinite list | growing edge Interest over one Relation | core | edge continuation, deduplication |
| Faceted search | text and facets bind Read inputs | search extension | cancellation, stale generations, search Source |
| Dashboard | date and organization State bind aggregates and Relations | core | declared aggregate coherence |
| Financial or measured values | exact decimal, currency, quantity, or rate Value Types feed Reads and Operations | core value algebra plus optional domain type | precision, scale, rounding, unit, ordering, and aggregate semantics |
| Reusable computed interaction value | State and Read outputs feed one Computed Value and downstream Input Bindings | core | acyclic pure derivation, dependency aspects |
| Kanban board | grouped Relation plus move Operation | core | group/order dependencies, concurrency policy |
| Calendar or map | semantic time or spatial bounds are Read inputs; visual overscan is Interest | temporal or spatial extension | range operators, bounded windows |
| Command palette | transient text State drives an asynchronous Read | core plus scheduling policy | cancellation, stale generation, declared debounce |
| Comparison workspace | many Selection drives repeated or compare Presentation | core | many cardinality, parameterized instances |
| Permissions matrix | relationship Read plus add/remove Operations | core | relationship witnesses, atomic Commit |
| Create or edit form | scoped draft State submits a declared Operation | core | validation, base-revision conflict policy |
| Editable grid | bounded Relation plus multi-row draft runtime | draft extension | validation, batching, optimistic Operations |
| Repeated per-Row controls | Row identity scopes repeated instances and optional State | core | stable Row identity, instance lifetime |
| Modal domain action | State controls modal; submit dispatches Operation | core | conditional Surface, focus-capable Renderer |
| Multi-step workflow | specialized runtime exposes Reads and Operations | workflow extension | durable workflow state and transition policy |
| Routed workspace | route persistence projects declared State | core | State Persistence Adapter, canonical codec |
| Partial renderer replacement | one contract kind uses a custom Renderer | core | versioned Renderer contract and fallback |
| Time-series explorer | interval Read plus bucket Relation | time-series extension | time-series Source, aggregation capability |
| Graph explorer | root State binds traversal Read | graph extension | graph Source, stable path identity |
| Offline mobile surface | pinned Reads plus pending Invocations | offline extension | freshness policy, durable cache and overlay |
| Live model edit | agent adds, renames, retires, or transforms fields while runtime remains active | core | stable Field Slots, Record Model Transition, atomic activation |
| Shared domain data | two Programs bind one customer Data Context under separate grants | core | Source Bindings, policy isolation, shared Authority |
| Private plus shared app data | one Program composes private workflow records with shared customers | core | multiple Data Context bindings, composite provenance |
| Tenant-sharded Authority | semantic tenant affinity selects stable Authority Partitions that the catalog groups into Authority Scopes | core plus store capability | trusted partition derivation, scope grouping, constraint locality |
| Existing analytics database | Read Source Adapter exposes aggregates without importing records | Source extension | external provenance, freshness, gap semantics |
| Archive clone or replacement | Portable Archive creates a sandbox or atomically replaces bound contexts | core | canonical Archive, explicit restore mode |
| Custom domain UI | headless Host observations and standard Operations | core | custom Presentation or Renderer Adapter |
| CLI and agent | finite Read resolution and typed Operation invocation | core | deadline, structured projection, audit |

These cases should extend concrete value, Read, Interest, Presentation, or
specialized runtime kinds without introducing a second Input Binding, lifecycle,
operation, persistence, or observation system.

## Non-Goals

- Compatibility with, in-place migration of, dual operation with, or staged
  cutover from a current Formless implementation. Brownfield adoption, data
  conversion, rollout, rollback, and retirement require a separate transition
  design.
- A universal physical datastore or lowest-common-denominator repository.
- A promise that every Adapter supports every Read or window capability.
- A general distributed query optimizer.
- Permanent event sourcing as the only source of truth.
- A universal automatic merge rule, CRDT, or collaborative editing model.
- Implicit cross-Authority transactions, constraints, order, or snapshot
  isolation.
- Arbitrary executable callbacks, provider clients, or credentials in schema.
- Treating trusted TypeScript source, module execution, or whole-program inferred
  types as the portable runtime contract.
- Representing every logical value as a runtime string or requiring one
  universal physical scalar encoding.
- Treating opaque JSON as nested records or granting it implicit path-query,
  partial-Mutation, granular-subscription, or merge semantics.
- Evaluating untrusted TypeScript to accept an untrusted Definition.
- Requiring one deeply constant application object for useful type inference.
- Using mutable authoring or display order as field identity, renumbering Field
  Slots, or reusing a retired slot.
- Inferring ambiguous rename, destructive, ownership, or transform intent from
  a schema diff.
- A general reactive event-handler language.
- Framework-specific executable UI instances or callbacks in Definition.
- Implicit two-way Input Binding.
- Dependency inference from names, layout, or relationships.
- Treating interaction State as domain records by default.
- Treating URL, memory, or browser storage as State owners.
- Treating Application Installation as the mandatory Data Context, Authority Scope, or
  data owner.
- One global physical database or Authority merely because Programs share a
  logical catalog.
- Inferring Archive ownership from every transitive Read dependency.
- Treating Portable Archive, computation checkpoint, and provider backup as the
  same artifact.
- Automatically importing or archiving every external Source.
- Exposing provider cursors, cache keys, or physical transactions to UI callers.
- Silent full-data synchronization or unbounded scans for bounded requests.
- Conflating empty, unavailable, stale, unknown, error, and unauthorized.
- Treating workflows, drafts, undo, constraint solving, spreadsheets, IDEs,
  canvases, or collaboration as generic Selection semantics.
- Letting Presentation or Renderer bypass Operation policy.
- Requiring time-series, graph, search, or analytics stores to pretend they are
  flat record tables.

## Open Design Questions

Each question is classified by what it blocks:

- **Core Interface** must be settled before portable public contracts freeze.
- **Extension Interface** requires a stable registration and conformance Seam;
  individual extension kinds may follow independently.
- **Deployment policy** does not change logical semantics but needs an explicit
  policy before a production topology can claim the relevant guarantee.

1. **Core Interface:** What exact declarative grammar best expresses Read
   programs while remaining portable, statically analyzable, and extensible by
   named capabilities?
2. **Core Interface:** Which ordering and collation semantics form the
   mandatory portable core?
3. **Extension Interface:** Which Read requirement vocabulary expresses offline,
   freshness, consistency, and partial-result policy without encoding placement
   preferences?
4. **Extension Interface:** What predicate/range witness algebra is sufficient
   for portable set-based Operations without becoming a second general
   transaction language?
5. **Core Interface:** Which Operations may safely replan after witness
   conflict, and how is that policy declared?
6. **Deployment policy:** What retention policy governs Invocation outcomes,
   delete evidence, audit, effect status, and outbox facts independently?
7. **Extension Interface:** Which Presentation result shapes belong in the
   portable core, and which are versioned registered contracts?
8. **Extension Interface:** How are specialized Read and interaction
   capabilities registered and versioned without allowing arbitrary behavior
   in Definition data?
9. **Extension Interface:** Which cross-Source eventual-coherence models are
   useful enough to name?
10. **Core Interface:** Which rank, anchor, extent, and membership combinations
    must generated renderers require, adapt around, or reject?
11. **Core Interface:** What exact canonical packed Field Vector format retains
    slot semantics, supports reviewable archives, and stays efficient under
    long-lived retirement churn?
12. **Core Interface:** How are stable Entity Identities allocated and renamed
    with the same low-boilerplate rigor as Field Slots?
13. **Core Interface:** Which portable Record Model Transition transforms,
    verifications, defaults, and backfills belong in the core algebra?
14. **Extension Interface:** Which online cutover, replay, multiversion, and
    distributed migration capabilities are useful enough to standardize?
15. **Core Interface:** What exact Data Context ownership, Source Binding, and
    application-installation contract is portable?
16. **Core Interface:** What semantic partition and affinity language lets a
    Definition state atomicity needs without encoding physical placement?
17. **Core Interface:** Which Archive format, external-dependency classes, and
    restore-lineage facts are mandatory for clone, replace, and exact recovery?
18. **Core Interface:** Which pure expression operators belong in Computed
    Values, and when should managed materialization be a named deployment
    capability?
19. **Deployment policy:** Which placement changes are visible only as ordinary
    refresh or reset, and which require an inspectable administrative
    Observation?
20. **Core Interface:** Which exact built-in Value Types, canonical scalar
    encodings, numeric and temporal policies, typed atomic structure operators,
    and opaque JSON limits form the mandatory portable core?

## Goal Traceability

| Concern | Principal contracts and invariants | Deterministic proof |
| --- | --- | --- |
| Portable logical meaning | Read Definition, canonical form, `INV-01`, `INV-02` | compiler and local/remote placement traces |
| Portable value fidelity | Value Type, compiled codec, Adapter value mapping, `INV-28` | canonical vectors, hostile decoding, cross-topology round-trip, and operator equivalence traces |
| Trusted low-boilerplate authoring | TypeScript Definition Module, canonical portable artifact | TypeScript, semantic compiler, reproducibility, and hostile-value traces |
| Stable Record Model | Entity Identity, Field Slot, canonical vector, `INV-19` | rename, reorder, retirement, codec, and Adapter encoding traces |
| Bounded stable identity | Authority Partition, allocation domains, finite leases, high-water fences, `INV-29` | collision, expiry, compaction, move, Archive, and non-reuse traces |
| Live evolution | Record Model Transition, Record Model Evolution Adapter, `INV-20` | concurrent proposal, cutover, replay, failure, and compatibility traces |
| Safe Installation activation | Program Registry, Installation Catalog, Product Conformance Profile, Resource retention, `INV-30` | register, activate, drain, replay, retire, and uninstall traces |
| Honest partial knowledge | Interest, Coverage, Membership, `INV-05`, `INV-06` | window, eviction, absence, and freshness models |
| Bounded complex UI | Relation windows, Read capabilities, `INV-09` | advertised million-Row work and memory counters |
| Lazy reusable computation | Read, Derivation, Computed Value, `INV-23`, `INV-25` | cold/warm, diamond, demand, overlay, and materialization traces |
| Coherent interaction | State, Selection, Input Binding, Host, `INV-07`, `INV-08` | graph, race, repeat, and form traces |
| Sound authoritative writes | Invocation, witnesses, Authority Store, `INV-10`–`INV-12` | atomicity, idempotency, conflict, delete, and purge suites |
| Explicit disclosure | required output, `DisclosedValue`, row and derived-output policy, `INV-10` | field, aggregate, omission, cache-partition, and replay traces |
| Instant safe feedback | Prediction overlay, `INV-13` | response/Commit reorder, rejection, and rebase traces; restart only for durable-pending-work capability |
| Topology independence | Transport, revisions, epochs, `INV-14`, `INV-15` | scripted delay, loss, gap, reset, chunk, and reconnect traces |
| Composable data ownership | Data Context, Authority Partition, Source Binding, Authority Scope, Context Catalog, Placement, `INV-21`, `INV-22`, `INV-26`, `INV-27`, `INV-31` | sharing, isolation, partition move, scope regroup, and rebinding traces |
| Reviewable portability and recovery | Snapshot, Portable Archive, restore modes, `INV-24` | canonical export, clone, replace, checkpoint, and recovery traces |
| Generated and custom UX | Program catalog, Presentation, Renderer, `INV-16`, `INV-17` | identical Host traces and Renderer conformance |
| Extensible stores and effects | Read and Effect Interfaces, `INV-18` | Source-shape, provider capability, and outbox traces |
| Standalone correctness | Testkit in-memory Adapters | pure deterministic reference environment with no external infrastructure |

The central measure is not how many features fit into one schema. It is whether
the Interfaces remain small, the semantics remain honest, and each additional
capability deepens the same mental model instead of creating a parallel runtime.
