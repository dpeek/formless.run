# Environments

Last updated: 2026-08-15

Purpose: design a zero-to-useful deployment model for one Formless workspace
across production and branch-scoped isolated environments.

This is not shipped behavior. Shipped behavior lives in
`openspec/specs/*/spec.md`. This document should inform one or more Git-backed
changes before accepted behavior moves into canonical specs.

## Decision Summary

- An environment is one isolated Formless instance. Production and branch
  environments use the same resource model with different policy.
- Preview is not a separate resource kind. It is shorthand for an environment
  whose lifecycle follows a branch or pull request.
- A new environment is useful on its generated `workers.dev` origin without
  custom route configuration.
- The default origin serves the public Site at `/`, admin surfaces under the
  reserved `/formless` namespace, auth under `/formless/auth`, and Program APIs
  under `/api/formless`.
- Program schema owns screens, surface paths, operations, and runtime
  composition. `formless.ts` owns deployment topology, environment policy, and
  optional custom domains and outbound email capabilities.
- Cloudflare host mappings, provider targets, and deployment observations are
  deployment state rather than mutable Program records.
- Email domains and allowed sender addresses are deployment capabilities;
  recipients, templates, delivery evidence, and runtime enablement remain
  instance state.
- Recovery snapshot, resource deployment, Worker deployment, Program
  deployment, and data replacement are independent operations even when one
  CLI workflow orchestrates several of them.
- A stable recovery ABI exports the remote Program artifact, application
  records, tombstones, and media without requiring the local CLI to understand
  the remote Program schema or Formless version.
- Instance security state is outside replaceable Program generations. Exact
  replacement preserves owner authentication and protected owner authority.
- Ordinary release deployment updates Worker code and a compatible Program
  artifact without invoking Alchemy or replacing records and media.
- Exact environment replacement is an explicit destructive operation. It
  snapshots the target, installs the desired Worker, Program, records, and
  media, and preserves instance security state.
- The new deployment model is implemented as a parallel CLI-first pipeline. It
  does not call the current `push` orchestration or derive intent from
  schema-owned deployment records.
- Runtime-neutral environment contracts live in a durable Environment package;
  recovery envelopes live behind an isolated Archive recovery subpath; CLI and
  Worker code own execution at their existing runtime boundaries.
- Existing narrow provider, credential, build, transport, storage, and media
  adapters may be reused. Existing source-sync, deployment projection, push,
  and restore orchestration remain quarantined until removal.
- Browser deployment is deferred. Initial operations are headless CLI use cases
  with structured results that a later trusted deployment runner can invoke.
- Publishing selected records remains distinct from release deployment and
  complete data replacement.
- Non-local deployments use canonical remote Alchemy state scoped by stable
  workspace and environment identity.

## Problem

The current runtime and deployment model asks schema-owned
`deployment-config`, `route`, and `instance-settings` records to describe exact
hosts, profiles, preferred origins, provider targets, and latest deployment
observations. `formless push` then reconciles runtime code, provider resources,
complete Program records, Program provenance, and media from one workspace
source.

This supports browser editing of route intent, but it makes basic deployment
carry concerns that are not application data:

- a user must understand host profiles, route records, auth origins, and custom
  domains before the first useful deployment;
- provider topology and deployment observations travel with Program state and
  portable archives;
- one workspace source contains exact values that differ between production
  and branch environments;
- complete-state push replaces mutable records and media rather than preserving
  an independently evolving environment;
- current archive readers reject archive versions they do not understand, so a
  newer local CLI cannot reliably capture older remote state before changing
  it;
- forced push may bypass an unreadable comparison but still depends on current
  Program, provenance, archive, restore, and concurrency validation;
- Worker code changes run through the full Alchemy resource graph even when no
  provider resource changed;
- owner credentials live outside Program records while the owner principal and
  protected owner assignment currently do not, so blind record replacement can
  preserve a credential but remove its authority;
- runtime route writes can cause provider reconciliation work;
- ordinary deployment relies on ignored local Alchemy state that another CI
  runner cannot safely use to update or destroy resources.

The original reason for browser-owned route records was a future onboarding
experience in which a user could create and deploy a workspace entirely from a
browser, including domain configuration. The default deployment does not need
custom domains to satisfy that goal. A generated `workers.dev` origin can expose
the Site, admin, auth, APIs, and custom Program screens with safe defaults.

Custom domains can then become an optional, versioned deployment concern rather
than a prerequisite for a useful instance.

## Goals

- Go from no deployed resources to a useful Site and protected admin experience
  with one deployment action.
- Require no domain, DNS, certificate, route-table, auth-origin, profile, email
  domain, or sender-address decisions on the happy onboarding path.
- Deploy the same workspace release to any explicitly selected environment.
- Capture a complete remote recovery snapshot before understanding or changing
  an older remote Program.
- Update Worker code without reconciling unchanged provider resources.
- Install a Program artifact independently from application records and media.
- Replace the complete application Program generation from local state without
  comparing it to the previous remote schema.
- Preserve each environment's mutable Program records, media, auth, secrets,
  and provider resources across later releases.
- Preserve owner sign-in and protected owner authority across exact Program
  replacement.
- Give production and branch environments the same topology model while
  allowing different protection, retention, side-effect, and backup policy.
- Keep custom domains and outbound email capabilities reviewable and
  deterministic in workspace configuration.
- Support browser-orchestrated deployment without storing provider credentials
  or provider truth in Program records.
- Support explicit publication of selected content without treating all Program
  state as publishable.
- Keep complete generation replacement explicit and target-scoped.

## Non-Goals

- Formless does not decide which Git branches deserve environments. Repository
  automation or a later integration maps refs to environment ids.
- The first environment changes do not need browser-based custom-domain editing.
- The first deployment pipeline does not include a browser deploy UI, hosted
  deployment runner, browser provider OAuth custody, or browser job-progress
  transport.
- A browser does not execute Alchemy or retain provider credentials directly; a
  trusted deployment runner performs provider mutation.
- Deploying a release does not copy all records or media from another
  environment.
- A branch environment does not receive production credentials, principals,
  customer data, private media, email delivery, payment, or laboratory side
  effects by default.
- The first implementation does not require a wildcard dispatch Worker,
  Workers for Platforms, or deeper preview subdomains.
- Alchemy provider state is not a Program or media backup.
- The recovery ABI cannot retroactively guarantee capture from a historical
  Worker that never exposed a compatible recovery endpoint. Legacy adapters
  may provide best-effort capture until those Workers are upgraded.
- Force does not bypass target identity, authentication, transport integrity,
  deployment leases, valid local input, required physical bindings, or owner
  continuity.
- The new pipeline does not preserve the old `push` command as an alias, add a
  permanent `deploy-v2` package, or allow both pipelines to mutate one
  environment concurrently.

## Model

### Workspace

The workspace owns:

- the complete Program source and runtime composition;
- deployment topology and environment policy in `formless.ts`;
- optional custom-domain declarations;
- optional outbound email provider, sending-domain, and allowed-sender
  declarations;
- optional initial seed and publication declarations.

These inputs are versioned together. A large deployment configuration may be
split into an ordinary imported TypeScript module without creating a second
Formless file-discovery convention.

### Environment

An environment is one stable, isolated Formless instance. It owns its concrete
Worker, Authority storage, Program records, media, auth, secrets, provider
resources, provider state, and backup policy.

An environment has at least:

- an opaque stable `environmentId` supplied by the caller;
- one policy selected from workspace configuration;
- a stable provider resource namespace;
- optional source-ref and expiry metadata;
- current deployed release evidence.

`main`, `dev`, and `pr-123` are all environment ids. `dev` remains available
because its source remains eligible or because policy pins it, not because it is
a special environment kind.

### Installed Resource Manifest

Resource deployment produces an installed environment manifest. It identifies
the Worker, bindings, concrete provider resources, compatibility settings,
Durable Object migrations, assets configuration, and resource-graph revision.

The manifest is canonical remote deployment state. Worker deployment consumes
it without rerunning Alchemy and fails when the desired Worker requires a
physical capability that is not installed.

### Worker Artifact

A Worker artifact is the executable Worker and browser asset revision. It
includes the selected runtime composition and declares the provider
capabilities it requires. Deploying it changes executable code without changing
the active Program artifact, Program records, media, security state, or provider
resource graph.

The current build injects the Program artifact and selected runtime composition
into one deployment. Independent Worker deployment requires the Program
artifact to become an independently installed Authority artifact. Program
runtime extensions may remain compiled into the Worker and be reported through
its capability manifest.

### Program Artifact And Generation

A Program artifact is the complete schema-as-data definition and provenance.
Program deployment installs or activates that definition without implicitly
copying application records or media.

A Program generation binds one Program artifact to one complete application
record snapshot and media namespace. Exact replacement stages a new generation
and atomically switches the active generation only after the newly deployed
runtime validates it. The previous generation remains available for bounded
rollback and later garbage collection.

An incompatible Program artifact is never activated over the old generation by
itself. It must be paired with an exact data replacement or an explicit
migration.

### Instance Security Plane

The instance security plane owns target-specific identity, authentication,
authorization assignments, protected owner authority, sessions, challenges,
recovery state, and secrets. It is not part of replaceable Program generations.

Program artifacts may declare application roles and permissions. Security
records may reference their stable keys, so removing or changing those keys
requires an explicit security migration. The intrinsic protected owner
authority remains available independently of application role declarations.

Until storage is physically separated, exact replacement must preserve the
complete owner continuity closure: owner principal, recovery identity,
credential binding, active protected owner assignment, and required intrinsic
role records.

### Release

A release identifies immutable Worker and Program artifacts plus their declared
capability relationship. A normal release deployment updates Worker code and a
compatible Program artifact without replacing the active generation's records
or media and without reconciling provider resources.

A Git revision may identify release evidence, but it is not part of environment
identity. Repeated commits on one branch therefore update the same environment.

### Publication

A publication is a schema-declared projection of records and referenced media
that may move from one environment to another. It is narrower than a Program
archive and excludes environment-owned operational state.

For example, Site content may be publishable while orders, payments,
principals, sessions, invitations, audit facts, and private documents are not.

### Recovery Snapshot

A recovery snapshot is a fidelity-first export produced by the selected remote
runtime. It contains the remote Program artifact, complete replaceable
application records and tombstones, every application media object, storage
cursor, format and runtime versions, and integrity evidence.

The local CLI may store a snapshot without understanding its inner format or
validating it against the local Program. Conversion into current workspace
state is a separate migration operation. Private security state and provider
secrets are excluded.

### Exact Replacement

Exact replacement installs a complete local Program generation on one target
without comparing it to the old generation's schema. It remains distinct from
ordinary release deployment and publication. It preserves the target's
security plane and begins with a durable recovery snapshot.

## Default Single-Origin Topology

### Host Policy

A new deployed Worker uses a `workspace` host policy on its generated
`workers.dev` origin. The policy combines protected Program administration with
public Site delivery on one origin.

The desired host policies are:

| Policy | Public Site | Admin | Auth | Intended use |
| --- | --- | --- | --- | --- |
| `workspace` | Yes | Under `/formless` | Under `/formless/auth` | Default `workers.dev` origin |
| `site` | Yes | No | Redirect to configured auth origin | Public custom domain |
| `admin` | No | Under `/formless` | Under `/formless/auth` | Optional dedicated admin host |

The first implementation needs `workspace` and `site`. `admin` is useful only
if a later application explicitly needs a dedicated admin domain.

The current runtime resolves every request to the exclusive `instance` or
`publishedSite` profile, and a `workers.dev` hostname defaults to
`publishedSite`. The new default requires either replacing those host-wide
profiles with host policies or adding a combined workspace policy above them.
The observable requirement is route-family ownership, not the internal enum
spelling.

### Reserved Namespace

The default workspace host resolves routes in this order:

1. intrinsic APIs, auth, callbacks, media, assets, icons, and development-only
   routes;
2. the protected admin surface mounted at `/formless`;
3. public Site documents and resources;
4. normal not-found handling.

The public Site therefore owns `/` and ordinary document paths only after the
reserved runtime and admin families decline the request.

The following namespaces are reserved:

- `/formless` for the admin mount and runtime-owned browser behavior;
- `/formless/auth` for account orchestration and gates;
- `/api/formless` for Program and runtime APIs;
- Formless-owned static asset and media paths;
- required dynamic root resources such as icons, `robots.txt`, and
  `sitemap.xml`.

Combining a catch-all Site with administration on one origin necessarily
reserves at least one path namespace. `/formless` is preferred over `/admin`
because it is already runtime-owned, is unlikely to be ordinary Site content,
and avoids pretending the namespace is application-defined.

Site route validation rejects public content that attempts to claim a reserved
path. Reserved runtime behavior wins deterministically even when invalid state
already exists.

### Admin Surface Mount

Program screen declarations remain application-relative. The runtime mounts the
complete protected admin surface at one base path.

For example:

| Program path | Effective workspace-host path |
| --- | --- |
| `/` | `/formless` |
| `/tasks` | `/formless/tasks` |
| `/site` | `/formless/site` |
| `/settings/access` | `/formless/settings/access` |

Browser link generation, history routing, Worker document admission, auth
continuations, and direct deep links consume the same admin mount fact. Program
packages do not hard-code `/formless` into every screen.

A dedicated admin host, if later supported, may still retain `/formless` for
consistency. Supporting `/` as an alternate admin base is not required for the
happy path.

### Default URLs

Given Worker name `verifi-dev` and Cloudflare account subdomain `example`, the
first deployment produces:

```text
Public Site: https://verifi-dev.example.workers.dev/
Admin:       https://verifi-dev.example.workers.dev/formless
Owner setup: https://verifi-dev.example.workers.dev/formless/auth/setup
```

This origin is sufficient for local review, branch review, and initial
production onboarding. Custom domains are optional.

## Custom Domains And Deployment Topology

### Workspace-Owned Configuration

Program schema continues to own screens, surface mounts, access, operations,
queries, and runtime composition. Deployment configuration owns external hosts,
host policy, environment naming, provider resources, and protection policy.

An illustrative configuration is:

```ts
export default defineConfig({
  name: "verifi",
  program: { /* complete Program source */ },
  deployment: {
    environments: {
      production: {
        ids: ["main"],
        persistent: true,
        backups: "required",
        email: "production",
      },
      branch: {
        persistent: false,
        backups: "none",
        seed: "empty",
        email: false,
      },
    },
    domains: [
      {
        environments: ["main"],
        host: "verifi-labs.com",
        policy: "site",
      },
      {
        environments: ["main"],
        host: "www.verifi-labs.com",
        redirect: "https://verifi-labs.com",
      },
    ],
    email: {
      production: {
        provider: "cloudflare",
        domain: "notify.verifi-labs.com",
        senders: {
          auth: { address: "auth@notify.verifi-labs.com" },
          contact: { address: "contact@notify.verifi-labs.com" },
          system: { address: "system@notify.verifi-labs.com" },
        },
      },
    },
  },
});
```

The final public syntax is not fixed here. Required behavior is:

- environment selection is explicit and resolves exactly one policy;
- production is selected only by an explicit protected policy match;
- custom hosts resolve to exact normalized provider intent before mutation;
- public custom domains use `site` policy by default;
- the generated `workers.dev` origin remains the administration and auth origin
  unless configuration explicitly selects another supported topology;
- missing custom-domain configuration does not make an environment incomplete.

### Preview Domains

Branch environments need no custom domains. Their generated Worker name provides
a stable URL such as:

```text
verifi-pr-123.<account>.workers.dev
```

If an application later opts into branded preview domains, a structured
hostname layout may produce one flat first-level Site host:

```text
pr-123-preview.verifi-labs.com
```

The admin remains at the environment's `workers.dev` origin. This avoids
creating admin, auth, `www`, and other custom-domain resources for every branch.

Flat first-level hosts are preferred over deeper names because Cloudflare
Universal SSL on a full zone covers first-level subdomains by default, Worker
Custom Domains are exact-host rather than wildcard, and `workers.dev` permits
only the Worker-name label before the account subdomain.

Cloudflare references:

- <https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/limitations/>
- <https://developers.cloudflare.com/workers/configuration/routing/custom-domains/>
- <https://developers.cloudflare.com/workers/configuration/routing/workers-dev/>

### Provider Topology Is Not Program State

Desired custom domains, redirects, provider target selection, Worker names,
environment identity, and deployment observations should not be mutable Program
records.

The target design removes Cloudflare host-mapping and deployment intent from
schema-owned `route` and `deployment-config` records. It also removes
`instance-settings` references whose only purpose is to recover provider-derived
primary, admin, or auth origins. Exact origins are resolved from deployment
topology.

This change should remove or narrow the current Routes screen and route write
APIs. If Formless still needs runtime-owned hostless path mappings for another
capability, that path behavior should be modeled separately from provider
domains rather than preserving one mixed route entity.

Deployment observations belong in the deployer's remote state and display-safe
deployment status contracts. They do not belong in Program records or portable
archives.

Custom-domain changes require a new release deployment. A future browser editor
may update versioned workspace configuration through a source-control or
workspace service; it should not restore provider topology to mutable instance
records merely to regain a browser UI.

## Outbound Email Configuration

Outbound email follows the same deployment-capability boundary as custom
domains. A value belongs in `formless.ts` when changing it changes provider
resources, DNS onboarding, or Worker bindings. A value remains instance state
when changing it only selects or uses an already deployed capability.

### Deployment-Owned Email Capability

Workspace deployment configuration owns:

- provider family;
- sending domain or subdomain;
- exact allowed sender addresses bound to the Worker;
- semantic sender keys such as `auth`, `contact`, and `system`;
- environment policy that enables, disables, or replaces outbound delivery;
- provider resource identity and desired configuration.

The exact From addresses belong here because Cloudflare's Worker
`send_email` binding is constrained to configured sender addresses. Adding or
changing an address changes provider resources even though its display name may
look like ordinary application data.

The sending domain is not inferred from the generated `workers.dev` origin.
Production configuration should normally choose a dedicated subdomain such as
`notify.example.com`. Formless must not silently change apex email DNS policy.

The deployment reconciler owns Email Sending domain onboarding, provider-owned
SPF, DKIM, DMARC, bounce configuration, the constrained Worker binding, and
display-safe provider status. Credentials, provider responses, Alchemy state,
and raw DNS truth remain outside workspace source and Program records.

### Instance-Owned Email Policy

The deployed Program may own browser-editable policy that does not expand its
provider authority:

- a runtime sending kill switch;
- selection among already deployed semantic sender keys when more than one is
  eligible for a purpose;
- sender display-name or general brand settings;
- contact-notification recipient mailboxes;
- reply-to addresses allowed by application policy;
- email templates and message content;
- delivery intent, status, idempotency, and audit evidence.

A recipient such as `office@example.com` is ordinary operational configuration:
changing it does not alter the Worker binding. A From address such as
`contact@notify.example.com` is a deployment capability because it must already
be allowed by that binding.

Runtime code schedules through a semantic sender key rather than an arbitrary
From address:

```ts
scheduleEmail({
  sender: "auth",
  // message and recipient intent
});
```

Deployment resolves the key to one exact allowed sender in the selected
environment. When each purpose has exactly one sender, the runtime derives the
default without storing a second selection record.

Ordinary Program writes may disable or select an installed capability, but they
cannot add a domain, authorize another From address, create provider resources,
or mutate provider onboarding state.

### Zero-Configuration Default

A new `workers.dev` environment has no outbound email capability by default.
This does not block the useful onboarding path:

- passkey owner setup and sign-in remain available;
- contact and subscription submissions may be stored;
- email-dependent notifications report unavailable configuration without
  claiming delivery;
- the email delivery runtime and queue may be present without a provider
  binding, but no delivery is attempted;
- branch environments default to disabled delivery unless configuration
  explicitly selects a sandbox or safe sink.

Enabling production email requires a versioned deployment configuration and a
release deployment. It is not a browser record edit on the deployed instance.

### Program Record Consequences

The target design removes `email-domain` records and provider-facing
`email-sender` records from mutable Program state. It also removes
`defaultEmailDomain`, provider onboarding status, DNS status, provider errors,
route references, and deployment-config references from instance records and
portable archives.

If runtime sender selection remains necessary, it should reference stable
semantic sender keys exposed by the deployed capability rather than records
that can introduce arbitrary sender addresses. Delivery records and internal
message state remain runtime-owned operational evidence.

## Environment Identity And Resource Naming

The caller supplies an opaque environment id such as `dev`, `pr-123`, or
`feature/order-workflow`. Formless derives provider-safe physical names while
retaining the original id as durable identity.

Normalization must:

- use only provider-supported characters;
- fit DNS-label and provider resource-name limits;
- preserve an already-safe readable id where possible;
- append a short hash of the original id when normalization or truncation could
  collide;
- validate the complete physical name, including workspace prefix and resource
  suffix;
- remain stable for the environment lifetime.

A PR number is preferable to a branch name when available because it remains
stable if the branch is renamed. Formless does not globally reserve `main`;
workspace policy explicitly identifies protected production environments.

Worker, Authority, R2, queue, Turnstile, and Alchemy identities derive from
workspace plus environment identity rather than the current commit.

## Browser Onboarding

The happy path is:

1. Create or select a Formless workspace.
2. Authorize the target provider account.
3. Accept a generated available Worker name or choose another valid name.
4. Apply the environment resource graph and persist its installed manifest in
   canonical remote state.
5. Deploy the initial Worker artifact through the installed manifest.
6. Install the initial Program generation and seed policy.
7. Open the generated owner-setup URL.
8. Complete setup and land at `/formless`.
9. Open `/` to view the starter public Site.

The user is not asked for domains, DNS, certificates, route profiles, route
records, admin origin, auth origin, relying-party id, email domain, or sender
addresses. Origin facts derive from the generated Worker origin; outbound email
remains unavailable until an explicit deployment configuration enables it.

Browser onboarding is a later orchestration surface, not the trusted deploy
executor. Provider mutation requires a server-side runner that can use
short-lived provider authority, Alchemy encryption material, and canonical
remote state without exposing those secrets to Program records, archives,
browser storage, or application APIs.

The initial implementation is CLI-only. Its operation bodies accept explicit
dependencies and return structured plans, progress events, and receipts without
writing terminal output. CLI wrappers own prompts, formatting, browser opening,
and process exit behavior. A later hosted runner invokes the same operation
bodies rather than reimplementing deployment semantics.

## Recovery And Deployment Operations

### Stable Recovery ABI

Recovery is an intentionally permanent compatibility surface rather than an
ordinary Program API. A stable discovery endpoint identifies the remote
snapshot protocol supported by the deployed runtime. The selected remote
runtime then serializes its own state using its own active Program and storage
contracts.

Snapshot capture must not require the local CLI to parse the remote archive,
load the remote Program through local runtime modules, or validate records
against the local schema. The CLI verifies transport completion and outer
integrity evidence, then stores the returned bytes unchanged.

The stable outer envelope identifies:

- snapshot protocol and payload format versions;
- remote Formless and Worker artifact versions;
- active Program artifact and provenance;
- source cursor and capture time;
- application record and tombstone payloads;
- a complete application media inventory and payload checksums;
- excluded security and provider-state scopes;
- whole-snapshot integrity evidence.

Every extant object in the application media namespace is captured. Recovery
does not depend on the remote or local schema proving that an object is still
referenced.

Private credentials, sessions, challenges, recovery secrets, admin bearers,
provider credentials, and Alchemy state are never exported. Reviewable identity
and access records also belong to the security plane and are excluded from the
replaceable snapshot payload. While those records remain physically mixed with
Program records, the remote exporter applies its own stable security-scope
classification before producing the snapshot.

Capture and import are separate operations. A later migration tool may decode
the recorded payload version and produce current workspace state, but unknown
payload versions never prevent byte-preserving capture.

This guarantee begins when a Worker exposes the stable recovery ABI. The CLI
may retain explicit legacy snapshot adapters for known older Workers, but it
cannot promise recovery from a historical Worker that never exposed a readable
remote export path.

### Resource Deployment

Resource deployment reconciles Cloudflare resources from `formless.ts` through
Alchemy and writes the resulting installed environment manifest to canonical
remote state.

```text
formless resources apply --environment main
```

It owns resource creation and deletion, bindings, custom domains, queues,
storage, compatibility configuration, provider migrations, and resource
adoption. It does not deploy Program records or media.

Resource deployment is explicit after environment creation. Ordinary Worker or
Program deployment does not run Alchemy merely to discover that the resource
graph is unchanged.

### Worker Deployment

Worker deployment uploads executable Worker code and browser assets directly
through the provider adapter using the installed environment manifest.

```text
formless worker deploy --environment main
```

It preserves the active Program generation, security state, media, provider
resources, and canonical Alchemy state. The Worker artifact declares required
bindings and runtime capabilities. A missing physical binding is not a version
check and cannot be bypassed; resource deployment must install it first.

Worker deployment may resend the complete installed binding configuration when
the provider upload API requires it, but it does not infer or mutate resource
topology.

### Program Deployment

Program deployment installs a complete Program artifact independently of
application record transfer.

```text
formless program deploy --environment main
```

Normal activation validates the artifact against the active generation and the
installed Worker capability manifest. A compatible artifact becomes active
without replacing records or media. An incompatible artifact requires an
explicit migration or an exact replacement generation.

`--force` may bypass compatibility with the old generation only when Program
activation is paired with exact data replacement. It cannot leave the instance
serving old records under an incompatible Program.

### Data And Media Replacement

Data replacement stages complete local application records, tombstones, and
media under a new Program generation.

```text
formless data replace --environment main <archive> --force
```

The desired archive is validated by the desired Worker and Program rather than
by the old remote Program. Replacement does not merge old application records,
copy old values into local source, or import security records. Activation uses
a deployment lease and one generation switch. Failed staging leaves the active
generation unchanged.

### Normal Release Deployment

Normal deployment orchestrates Worker deployment and compatible Program
deployment:

```text
formless deploy --environment main
```

It preserves application records, media, security state, provider resources,
and Alchemy state. It does not become destructive because `--force` is present
and does not implicitly run resource reconciliation.

Creating a new environment remains a separate orchestration that applies
resources, deploys Worker and Program artifacts, applies an explicit seed
policy, and initializes environment-specific security state. Branch policy
defaults to an empty or synthetic seed, not production data.

### Exact Environment Replacement

Exact replacement is the explicit nuclear workflow:

```text
formless environment replace --environment main --from workspace --force
```

It performs these ordered concerns:

1. resolve one exact environment and acquire its deployment lease;
2. capture and durably store a recovery snapshot;
3. enter maintenance mode;
4. deploy the desired Worker through the installed resource manifest;
5. stage the desired Program artifact, application records, tombstones, and
   media as a new generation;
6. validate the generation using the desired runtime;
7. atomically switch the active generation;
8. verify runtime health, protected owner authorization, and snapshot access;
9. leave the prior generation available for bounded rollback;
10. exit maintenance mode and later garbage-collect superseded data.

Resource reconciliation is not implicit. When the desired Worker needs an
uninstalled resource, the user first runs `formless resources apply`, or an
explicit higher-level create workflow plans both operations.

A destructive replacement does not proceed without its recovery snapshot.
Skipping that prerequisite, if ever supported for disposable environments,
requires a separate option and cannot be implied by `--force`. Production
policy may forbid skipping it entirely.

### Force Semantics

Force is scoped to the selected operation:

| Operation | Force may bypass | Force never bypasses |
| --- | --- | --- |
| Resources | desired-state drift and redundant reconciliation suppression | target identity, canonical state access, provider authority, or valid resource configuration |
| Worker | remote Formless, Worker, or Program version comparison | artifact integrity, provider authority, required bindings, or valid provider migrations |
| Program | compatibility with the old generation when paired with exact replacement | desired artifact validity, Worker capabilities, security schema, or safe activation |
| Data | old/new schema comparison, diff planning, and migration requirements | local archive validity, checksums, deployment lease, snapshot prerequisite, or security preservation |

Authentication failure, network failure, corrupt input, incomplete upload,
wrong-target protection, and owner-continuity failure remain fatal. Force
selects an explicit replacement policy; it is not permission to accept an
unknown outcome.

### Publish Projection

Publishing moves one declared projection of records and referenced media from a
source environment to a target environment.

Conceptually:

```ts
publications: {
  site: {
    entities: ["site", "block", "block-placement"],
    media: "referenced",
  },
}
```

The final declaration needs stronger reference-closure, selection, deletion,
conflict, and authorization contracts than this illustration. An entity list
alone is not sufficient implementation design.

Publication must:

- select records through a named schema-owned projection;
- include only referenced publishable media;
- validate the target Program artifact and schema before mutation;
- define stable identity, upsert, removal, and conflict behavior;
- exclude principals, sessions, credentials, invitations, provider state,
  operational records, and private media unless another explicit publication
  capability owns them;
- never imply that all records of an arbitrary entity are safe to publish.

Site is the first likely publication capability. Orders, payments, laboratory
workflow, identity, access, and audit state remain environment-owned.

The current `formless push` complete synchronization contract is not the desired
release deployment or exact replacement contract. Public command removal should
be settled in the implementing change without preserving overlapping aliases.

## Provider State

Alchemy state tracks provider resources and is necessary for safe update and
deletion. It does not contain Program records or R2 object contents.

Ordinary workspace deployment currently supplies
`.formless/deploy/<worker-name>` as Alchemy `rootDir`, selecting the filesystem
state store. Copying `ALCHEMY_STATE_TOKEN` into the ignored deploy environment
does not make the main deployment path select `CloudflareStateStore`.

Non-local environments use a canonical remote Alchemy state store:

- state scope is keyed by stable workspace and environment identity;
- deployment and destroy use the same Alchemy app, stage, encryption password,
  and state scope;
- CI serializes mutation of one environment;
- credentials stay in the deployer's secret store;
- ignored local metadata is not required to update or destroy the environment;
- missing or inaccessible canonical state blocks ordinary destructive
  reconciliation and requires explicit adoption or repair.

Remote state makes cleanup repeatable from a browser deploy runner or another CI
runner and reduces orphaned resources.

### Installed Environment Manifest

Successful resource deployment also publishes a display-safe installed
environment manifest for non-Alchemy deployment operations. At minimum it
contains:

- stable workspace and environment identity;
- provider account and Worker identity;
- exact binding names, kinds, and concrete resource identifiers;
- compatibility date and flags;
- Durable Object classes and applied provider migration revision;
- assets and route capability configuration;
- installed resource-graph hash;
- update time and resource-deployment evidence.

Provider credentials, Alchemy encryption material, and raw provider responses
remain secret deployment state. The manifest contains enough resolved topology
for a Worker upload to preserve bindings without owning resource reconciliation.

Worker artifacts declare their required capability set. Worker deployment
compares that set with the installed manifest before provider mutation. Force
may ignore version provenance but cannot manufacture an absent resource.

## Lifecycle

Repository automation decides which refs receive environments and supplies the
environment id, source ref, release revision, and optional expiry.

A typical policy is:

```text
main branch                 -> deploy environment main
dev branch                  -> deploy environment dev
open pull request 123       -> deploy environment pr-123
pull request closed/merged  -> destroy environment pr-123 after grace period
other branch                -> no deployment
```

Cleanup uses both event-driven deletion and eventual reconciliation:

- a close or merge event schedules destroy after a grace period;
- a periodic job removes expired environments missed by event delivery;
- a pin or persistent policy suppresses automatic cleanup;
- destroy is idempotent and targets one exact environment;
- production cannot be selected through omission, fallback, or a branch-derived
  wildcard.

Formless need not query Git providers initially. A later integration can
automate the same explicit environment contract.

## Auth And External Effects

Each environment has independent credentials, sessions, setup capabilities,
role assignments, secrets, and side-effect configuration. These records form
the instance security plane and are not copied between environments or replaced
with Program generations.

The protected owner boundary must survive every Worker, Program, and data
operation. Owner authentication continuity includes both the private credential
and its authorization closure. A successful deployment verifies that an owner
credential still resolves to an active principal with protected instance-owner
authority.

Application role declarations belong to the Program artifact. Target-owned
assignments may reference those stable role keys. Removing a referenced role,
changing permission meaning, or changing the authentication schema requires an
explicit security migration. Exact replacement does not guess that migration.

While owner principals and protected owner assignments remain represented as
Program records, snapshot and replacement code must classify and preserve them
as security state. The target model moves them behind the same storage boundary
as private auth metadata so Program generation replacement cannot delete them.

The generated `workers.dev` origin is the default auth origin and WebAuthn
relying party. A public custom domain uses Site-only host policy and redirects
eligible account flows to that auth origin. A custom domain does not
automatically become an admin or passkey origin.

Branch policy defaults to:

- environment-specific owner setup or a trusted review invitation;
- outbound email disabled, or an explicitly deployed sandbox or safe-sink
  capability;
- payment, laboratory, webhook, and other integrations disabled or configured
  with sandbox credentials;
- Turnstile configured only for exact active hosts;
- non-production indexing policy;
- no production secrets inherited by naming convention.

## Backups

Backup requirements are environment policy:

| Policy | Program and media backup | Cleanup |
| --- | --- | --- |
| Production | Required scheduled and pre-release backups | Never automatic |
| Persistent non-production | Optional rolling backup or explicitly resettable | Explicit or policy-driven |
| Branch default | None by default | Source close plus grace period and expiry sweep |

Backup identity includes environment id, Program provenance, release revision,
schema hash, and creation time. Snapshot conversion and exact replacement
always name one target environment.

Remote Alchemy state supports provider reconciliation but is not sufficient for
data recovery. Program archives and R2 backups remain independent.

A recovery snapshot is the mandatory precondition for exact replacement. Its
capture path remains usable without local schema compatibility. Normal release
deployment follows environment backup policy; production may require a fresh
snapshot before Program activation even when the Program is expected to be
compatible.

Recovery snapshots exclude private security state. Recovery of credentials and
provider secrets requires an independent protected operational backup policy.
Exact replacement normally preserves that state in place rather than restoring
it.

## Safety Invariants

- Every environment has distinct Worker, Authority storage, media storage,
  provider state, auth state, and secrets.
- Environment selection resolves exactly one policy before mutation.
- Production requires an explicit protected policy match.
- A generated `workers.dev` origin is useful without custom domains.
- Runtime namespace ownership is deterministic before public Site fallback.
- Custom domains and provider targets are versioned deployment configuration,
  not mutable Program data.
- Email domains and allowed From addresses are versioned deployment
  capabilities; ordinary Program writes cannot expand them.
- A zero-configuration environment remains useful without outbound email.
- Recovery capture depends on the remote recovery ABI, not the local Program
  schema or archive parser.
- Recovery snapshots contain all replaceable records, tombstones, and
  application media while excluding instance security and provider secrets.
- Resource, Worker, Program, and data deployment remain independently
  executable concerns.
- One deployment pipeline owns mutation of an environment at a time.
- Worker deployment uses the installed environment manifest and does not
  reconcile provider resources.
- A normal release deployment preserves environment-owned records and media.
- An incompatible Program is activated only with an explicit migration or an
  exact replacement generation.
- Exact replacement begins with a durable snapshot and preserves the instance
  security plane.
- Every completed deployment preserves protected owner authentication and
  authority.
- Force bypasses compatibility policy only within the selected operation; it
  does not bypass integrity, security, target, lease, or required-resource
  invariants.
- Publication moves only one declared projection.
- Complete data replacement is explicit, generation-based, and target-scoped.
- Provider reconciliation state and data backups remain separate.
- Branch environments do not inherit production data, secrets, or side effects
  by default.

## Implementation Strategy

### Parallel Clean-Sheet Pipeline

The new deployment path is parallel to the current `push` pipeline. Clean sheet
applies to orchestration and public semantics, not to every low-level adapter.
The new path does not call current source-sync, push, restore, deployment
observation, or schema-owned desired-state projection workflows.

The current pipeline remains available only for environments that have not been
adopted by the new path. It receives no new environment behavior beyond fixes
needed to keep those environments operable. New commands use their final
semantic names rather than a temporary `v2` namespace.

The two pipelines may coexist in one CLI release but never own mutation of the
same environment concurrently. Adoption is an explicit target-level transition,
not a global CLI fallback.

### Package And Runtime Boundaries

The durable package layout is:

| Boundary | Owns | Does not own |
| --- | --- | --- |
| `@dpeek/formless-environment` | environment identity, installed resource manifests, Worker capability manifests, Program generation refs, stage plans and receipts, pure compatibility helpers | CLI commands, provider SDK execution, credentials, Worker routes, Authority mutation, terminal output |
| `@dpeek/formless-archive/recovery` | stable recovery envelope, opaque payload descriptors, integrity facts, format negotiation | current portable-archive validation, CLI capture policy, Worker export execution, storage reads |
| Formless CLI environment modules | target selection, command policy, filesystem effects, provider adapters, operation ordering, terminal wrappers | browser UI, Worker routes, Authority storage implementation |
| Formless Worker and Authority modules | recovery routes, raw export, security-scope filtering, generation staging, validation, activation, rollback | provider reconciliation, CLI prompts, local workspace writes |

The existing `@dpeek/formless-deploy` package remains legacy while it is based
on schema-owned control-plane deployment records and projected Alchemy graphs.
New environment contracts do not import it. After cutover, obsolete Deploy
package contracts and their Program-record projections are deleted rather than
adapted into the new path.

The Environment package starts with runtime-neutral root contracts only. It does
not add browser, React, client, or provider entrypoints before a concrete caller
requires them.

### Reuse And Quarantine

The new pipeline may reuse narrow leaf capabilities whose contracts do not
encode old workflow policy:

- Program materialization and Worker bundling;
- provider credential resolution and Cloudflare API clients;
- individual Alchemy resource declarations;
- admin-bearer and target HTTP transport;
- Authority storage, media object, hashing, and filesystem primitives.

The new pipeline does not reuse:

- `pushFormlessInstanceWorkspace` or its planning types;
- workspace source comparison and merge behavior;
- desired resource projection from route, email, or deployment Program records;
- push-owned backup and restore dry-run orchestration;
- current-version archive parsing during recovery capture;
- deployment observation writes to Program records.

This boundary prevents an apparently convenient helper from reintroducing
schema comparison, mutable route intent, implicit Alchemy reconciliation, or
complete-state synchronization.

### CLI Operation Design

Initial implementation is CLI-only and exposes explicit use cases rather than a
generic workflow engine:

```ts
captureRecoverySnapshot();
applyEnvironmentResources();
deployWorkerArtifact();
installProgramArtifact();
stageProgramGeneration();
activateProgramGeneration();
replaceEnvironment();
```

Operation bodies accept explicit dependencies and return structured plans,
progress events, evidence, and receipts. They do not read terminal input, print,
open browsers, or terminate the process. CLI command adapters own interactive
confirmation and presentation.

Every mutating command supports explicit environment selection, non-interactive
execution, machine-readable output, idempotency, and durable evidence. These
properties support CI immediately and a trusted hosted runner later without
bringing browser concerns into the first pipeline.

### Pipeline Ownership And Adoption

Each environment records one deployment-pipeline owner:

```text
legacy
environment
```

New environments start as `environment`. An existing environment moves
through one explicit adoption workflow:

1. capture a recovery snapshot through the best available remote ABI;
2. discover existing provider resources and current canonical state;
3. produce a read-only adoption plan with exact resource identities;
4. persist the installed resource manifest without changing resources;
5. verify Worker capability and no-op deployment plans;
6. record new pipeline ownership;
7. reject subsequent legacy mutation for that environment.

A narrow one-time adoption adapter may read legacy Alchemy state or provider
truth as evidence. Legacy records and state do not become permanent desired
input to the new pipeline. Adoption becomes one-way once new Program generation
or security storage semantics are active. Rollback then deploys a previous
artifact or generation through the new pipeline rather than returning to
`push`.

Preview environments adopt the pipeline first, followed by `dev` and then
production. Read-only plans may be compared between pipelines, but mutating
shadow deployment against one environment is prohibited.

### Cutover Criteria

Production adoption requires evidence that:

- remote snapshot capture succeeds without local Program compatibility;
- snapshot records and media can be inspected and migrated;
- Worker-only deployment preserves installed bindings and target data;
- compatible Program deployment preserves records and media;
- exact replacement preserves owner authentication and protected authority;
- failed staging leaves the prior generation active;
- generation rollback succeeds;
- resource update and destroy work from canonical remote state;
- adopted environments reject legacy mutation.

After production adoption and a bounded observation period, old command bodies,
schema-owned deployment records, obsolete Deploy package contracts, and legacy
tests are removed. No compatibility aliases remain.

## Change Sequence

Environment delivery should be sliced so partial support cannot be mistaken for
a safe production workflow.

1. Add the isolated Archive recovery contracts, stable Worker discovery and
   snapshot ABI, and opaque CLI capture. Export the remote Program artifact,
   complete replaceable records and tombstones, and all application media
   without local schema validation.
2. Add the runtime-neutral Environment package with environment identity,
   artifact and capability manifests, installed resource manifests, generation
   refs, stage plans, and receipts. Keep provider and CLI execution outside it.
3. Define the instance security plane and owner-continuity closure. Exclude it
   from recovery payloads and exact replacement, initially through stable scope
   classification and ultimately through a separate storage boundary.
4. Add the combined default workspace-host policy, reserve `/formless`, mount
   the protected Program admin surface there, and serve public Site documents
   as the remaining read-only HTML fallback.
5. Move custom-domain, email-domain, sender-allowlist, and provider topology
   declarations into typed workspace configuration; derive exact origins and
   installed email capabilities; remove or narrow schema-owned route,
   deployment-config, email-domain, and email-sender behavior that no longer
   owns application data.
6. Add CLI-only resource deployment using stable environment identity, provider
   naming, production policy, canonical remote Alchemy state, and the installed
   environment manifest.
7. Add CLI-only Worker artifact upload independent of Alchemy reconciliation.
   Publish Worker capability requirements and support direct code and asset
   deployment through the installed manifest.
8. Separate the Program artifact from Worker activation, add staged Program
   generations, and support compatible Program-only deployment.
9. Add exact application record and media replacement, atomic generation
   activation, maintenance mode, rollback retention, and stage-specific force
   semantics.
10. Add normal `deploy`, explicit resource and stage commands, and the composite
   nuclear environment replacement workflow on the parallel CLI pipeline. Add
   environment inspect and destroy without routing through `push`.
11. Adopt preview environments, then `dev`, then production. Enforce one
   pipeline owner per environment, verify cutover criteria, and remove
   complete-state `push`, schema-owned deployment records, and obsolete Deploy
   package contracts after the observation period.
12. Design and implement the first named publication capability separately,
   likely Site content and referenced public media.
13. Add lifecycle expiry, cleanup reconciliation, and optional branded preview
   domains.
14. Define the trusted server-side deployment runner and browser orchestration
   only after CLI operations and receipts are proven. Browser work consumes the
   same use cases and does not restore browser-owned deployment state.

The recommended first proposal is the stable recovery snapshot ABI. It owns one
coherent safety outcome without changing deployment semantics:

- the CLI discovers the remote recovery capability;
- the remote runtime exports using its own active contracts;
- local capture accepts unknown remote payload versions as opaque bytes;
- the snapshot includes the Program artifact, replaceable records and
  tombstones, and every application media object;
- private security state, reviewable identity and access state, provider
  secrets, and Alchemy state are excluded;
- integrity, cursor, runtime version, and Program provenance are recorded;
- known legacy deployments may use explicit adapters, without claiming support
  for Workers that never exposed a readable export path.

The single-origin workspace runtime remains an independent early proposal. It
owns one coherent user-visible outcome without provider mutation:

- `workers.dev` selects workspace-host behavior;
- public Site documents serve from `/`;
- the admin surface mounts at `/formless`;
- auth remains under `/formless/auth`;
- Program APIs remain under `/api/formless`;
- runtime, admin, and Site route precedence is deterministic;
- reserved Site path conflicts fail validation.

## Open Decisions

### Recovery And Replacement

- Choose the permanent recovery discovery path and transport format.
- Define the minimum stable outer envelope and whether large media payloads are
  streamed inline or through authenticated snapshot object URLs.
- Define the stable security-scope classification used before physical storage
  separation.
- Decide the bounded retention and garbage-collection policy for prior Program
  generations.
- Decide whether disposable environments may explicitly skip the mandatory
  pre-replacement snapshot. Production should not.
- Define how a direct Worker upload preserves bindings for each provider and how
  Worker-required capabilities are represented.
- Define which Durable Object code migrations belong to Worker deployment and
  which resource changes require Alchemy.
- Choose final CLI vocabulary. The semantic boundaries must remain distinct even
  if command nouns change.

The first recovery proposal should not include resource reconciliation, direct
Worker deployment, Program generations, environment replacement, custom-domain
configuration, email deployment configuration, or publication.

### Single-Origin Runtime

- Confirm `workspace`, `site`, and optional `admin` as host-policy vocabulary,
  or replace the existing profile vocabulary without adding another layer.
- Confirm `/formless` as the permanent admin mount and Site-reserved namespace.
- Decide whether Program screen paths remain absolute application-relative paths
  combined with a runtime base, or become explicitly relative declarations.
- Define which root resources belong to public Site fallback and which remain
  intrinsic on every host policy.
- Decide whether the route proposal includes only route selection contracts or
  also moves the browser shell/router under the admin mount.
- Define the exact validation outcome when existing Site content claims
  `/formless` during upgrade.
