# Environments

Last updated: 2026-08-13

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
- Deploying a release, publishing selected records, and restoring a complete
  archive remain distinct semantic operations even if one CLI workflow can
  orchestrate more than one of them.
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
- Preserve each environment's mutable Program records, media, auth, secrets,
  and provider resources across later releases.
- Give production and branch environments the same topology model while
  allowing different protection, retention, side-effect, and backup policy.
- Keep custom domains and outbound email capabilities reviewable and
  deterministic in workspace configuration.
- Support browser-orchestrated deployment without storing provider credentials
  or provider truth in Program records.
- Support explicit publication of selected content without treating all Program
  state as publishable.
- Keep complete archive restore explicit and target-scoped.

## Non-Goals

- Formless does not decide which Git branches deserve environments. Repository
  automation or a later integration maps refs to environment ids.
- The first environment changes do not need browser-based custom-domain editing.
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

### Release

A release is an immutable complete Program artifact and runtime revision.
Deploying a release updates code, schema, runtime composition, and versioned
deployment topology without replacing environment-owned operational data.

A Git revision may identify release evidence, but it is not part of environment
identity. Repeated commits on one branch therefore update the same environment.

### Publication

A publication is a schema-declared projection of records and referenced media
that may move from one environment to another. It is narrower than a Program
archive and excludes environment-owned operational state.

For example, Site content may be publishable while orders, payments,
principals, sessions, invitations, audit facts, and private documents are not.

### Restore

A restore replaces one target environment's complete Program records and
referenced media from a validated archive. It remains the explicit
complete-state replacement boundary.

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
4. Deploy Worker, Authority storage, media, queues, challenge resources, and
   canonical provider state.
5. Open the generated owner-setup URL.
6. Complete setup and land at `/formless`.
7. Open `/` to view the starter public Site.

The user is not asked for domains, DNS, certificates, route profiles, route
records, admin origin, auth origin, relying-party id, email domain, or sender
addresses. Origin facts derive from the generated Worker origin; outbound email
remains unavailable until an explicit deployment configuration enables it.

The browser is the orchestration surface, not the trusted deploy executor.
Provider mutation requires a server-side runner that can use short-lived
provider authority, Alchemy encryption material, and canonical remote state
without exposing those secrets to Program records, archives, browser storage,
or application APIs.

The first environment proposal need not implement this hosted runner, but its
contracts must not make a future browser runner depend on local ignored files or
interactive CLI-only state.

## Deploy, Publish, And Restore

### Deploy Release

Deploying a release to an existing environment:

- updates runtime code and the complete Program artifact;
- reconciles versioned deployment topology and provider resources;
- preserves environment-owned Program records, media, auth, and secrets;
- applies an explicit compatible Program evolution or migration when required;
- records release and desired-state evidence;
- does not restore a complete workspace archive.

Creating a new environment additionally applies an explicit seed policy and
initializes environment-specific auth. Branch policy defaults to an empty or
synthetic seed, not production data.

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

### Restore Archive

Restore remains an explicit complete-state replacement. It validates and backs
up the target, restores referenced media and Program records under a guard, and
retains rollback behavior.

### Public Operation Shape

The semantic boundaries should remain visible even if one command orchestrates
them. For example:

```text
formless deploy --environment main
formless publish site --from dev --to main
formless restore --environment main <archive>
```

An eventual release workflow could offer `deploy --publish site`, but it still
performs a release deployment and a named publication as separate planned
steps. `deploy` must not become an alias for copying a complete source
environment over a target.

The current `formless push` complete synchronization contract is not the desired
release deployment contract. Public command naming and removal should be
settled in the implementing change without preserving overlapping aliases.

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
role assignments, secrets, and side-effect configuration.

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
schema hash, and creation time. Restore always names one target environment.

Remote Alchemy state supports provider reconciliation but is not sufficient for
data recovery. Program archives and R2 backups remain independent.

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
- A normal release deployment preserves environment-owned records and media.
- Publication moves only one declared projection.
- Complete archive restore is explicit and target-scoped.
- Provider reconciliation state and data backups remain separate.
- Branch environments do not inherit production data, secrets, or side effects
  by default.

## Change Sequence

Environment delivery should be sliced so partial support cannot be mistaken for
a safe production workflow.

1. Add the combined default workspace-host policy, reserve `/formless`, mount the
   protected Program admin surface there, and serve public Site documents as the
   remaining read-only HTML fallback.
2. Move custom-domain, email-domain, sender-allowlist, and provider topology
   declarations into typed workspace configuration; derive exact origins and
   installed email capabilities; remove or narrow schema-owned route,
   deployment-config, email-domain, and email-sender behavior that no longer
   owns application data.
3. Add stable environment identity, provider naming, production policy, and
   canonical remote Alchemy state to deployment planning.
4. Separate release deployment and first-environment seed from complete archive
   synchronization, then expose environment inspect and destroy workflows.
5. Define the server-side deployment runner contract needed by browser
   onboarding and CI.
6. Design and implement the first named publication capability separately,
   likely Site content and referenced public media.
7. Add lifecycle expiry, cleanup reconciliation, and optional branded preview
   domains.

The recommended first proposal is the single-origin workspace runtime. It owns
one coherent user-visible outcome without provider mutation:

- `workers.dev` selects workspace-host behavior;
- public Site documents serve from `/`;
- the admin surface mounts at `/formless`;
- auth remains under `/formless/auth`;
- Program APIs remain under `/api/formless`;
- runtime, admin, and Site route precedence is deterministic;
- reserved Site path conflicts fail validation.

## Open Decisions Before The First Proposal

- Confirm `workspace`, `site`, and optional `admin` as host-policy vocabulary,
  or replace the existing profile vocabulary without adding another layer.
- Confirm `/formless` as the permanent admin mount and Site-reserved namespace.
- Decide whether Program screen paths remain absolute application-relative paths
  combined with a runtime base, or become explicitly relative declarations.
- Define which root resources belong to public Site fallback and which remain
  intrinsic on every host policy.
- Decide whether the first proposal includes only route selection contracts or
  also moves the browser shell/router under the admin mount.
- Define the exact validation outcome when existing Site content claims
  `/formless` during upgrade.

The first proposal should not include custom-domain configuration, environment
CLI commands, email deployment configuration, remote Alchemy state, or
publication. Those changes depend on the single-origin runtime boundary but do
not need to ship in the same section.
