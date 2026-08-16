# Environments

Last updated: 2026-08-16

Purpose: design one Formless workspace across production and branch-scoped
isolated environments, with a useful generated origin and optional custom
deployment topology.

This is not shipped behavior. Shipped behavior lives in
`openspec/specs/*/spec.md`. This document should inform one or more Git-backed
changes before accepted behavior moves into canonical specs.

Recovery, provider resources, Worker code, Program artifacts, data replacement,
security preservation, and deployment-pipeline cutover live in
[`deployment.md`](./deployment.md). This design resolves environment policy and
topology into the deployment target consumed there.

## Decision Summary

- An environment is one isolated Formless instance. Production and branch
  environments use the same resource model with different policy.
- Preview is not a separate resource kind. It is an environment whose lifecycle
  follows a branch or pull request.
- `main`, `dev`, and `pr-123` are ordinary environment ids. Policy, not a
  built-in name, identifies production or persistence.
- A new environment is useful on its generated `workers.dev` origin without
  custom route or email configuration.
- The default origin serves the public Site at `/`, protected admin under
  `/formless`, auth under `/formless/auth`, and Program APIs under
  `/api/formless`.
- Program schema owns screens, application-relative paths, operations, and
  runtime composition. `formless.ts` owns environment policy, provider topology,
  optional domains, and outbound email capabilities.
- Cloudflare host mappings, provider targets, and deployment observations are
  deployment state rather than mutable Program records.
- Email domains and allowed sender addresses are deployment capabilities;
  recipients, templates, delivery evidence, and runtime enablement remain
  instance state.
- Non-local environments use canonical remote provider state scoped by stable
  workspace and environment identity.
- Environment configuration resolves one explicit deployment target. The
  deployment layer does not interpret branch names, preview lifecycle, route
  policy, or environment class.
- Browser onboarding is a future orchestration surface over proven headless
  deployment operations, not part of the first environment implementation.

## Problem

The current runtime asks schema-owned `deployment-config`, `route`, and
`instance-settings` records to describe exact hosts, profiles, preferred
origins, provider targets, and deployment observations.

This makes provider topology look like mutable application data:

- users must understand host profiles, route records, auth origins, and custom
  domains before first deployment;
- provider topology and observations travel with Program state and archives;
- one workspace source contains exact values that differ between production and
  branch environments;
- runtime route writes can trigger provider reconciliation;
- environment cleanup depends on ignored local provider state;
- browser-owned route records complicate a happy path that needs only a
  generated `workers.dev` origin.

The original reason for schema-defined routes was browser onboarding, including
domain configuration. That goal does not require custom domains on first use.
One generated origin can expose the public Site, protected admin, auth, APIs,
and custom Program screens with deterministic defaults.

Custom domains and email can therefore become optional versioned environment
configuration rather than prerequisites for a useful instance.

## Goals

- Go from no deployed resources to a useful Site and protected admin experience
  without domain, DNS, certificate, auth-origin, email-domain, or sender choices.
- Deploy the same workspace release to any explicitly selected environment.
- Give production, development, and branch environments one topology model with
  different protection, retention, side-effect, and backup policy.
- Preserve stable environment identity across repeated commits on one branch.
- Keep custom domains and outbound email capabilities reviewable and
  deterministic in workspace configuration.
- Derive exact origins, relying-party facts, and provider names from explicit
  configuration and installed resources.
- Keep Program records free of provider truth and environment-specific topology.
- Support repeatable creation, inspection, and destruction from CI without
  relying on ignored local state.
- Preserve a future browser onboarding path without designing its runner or UI
  before the CLI operations are proven.

## Non-Goals

- Formless does not decide which Git branches deserve environments. Repository
  automation or a later integration supplies environment ids.
- The first implementation does not include a browser deploy UI, hosted runner,
  browser provider OAuth custody, or browser progress transport.
- The first implementation does not require browser-based custom-domain edits.
- A branch environment does not inherit production principals, customer data,
  private media, secrets, email delivery, payment, laboratory, or webhook side
  effects by naming convention.
- The first implementation does not require wildcard dispatch Workers, Workers
  for Platforms, or deeper preview subdomains.
- Environments do not own recovery snapshot format, Worker upload, Program
  generations, record replacement, force semantics, or deployment adoption.
- Publication between environments is a separate future capability.

## Model

### Workspace

The workspace owns:

- complete Program source and runtime composition;
- deployment topology and environment policy in `formless.ts`;
- optional custom-domain declarations;
- optional outbound email provider, sending-domain, and allowed-sender
  declarations;
- optional initial seed declarations.

These inputs are versioned together. Large configuration may be split into an
ordinary imported TypeScript module without introducing another Formless file
discovery convention.

### Environment

An environment is one stable isolated Formless instance. It owns its concrete
Worker, Authority storage, Program records, media, security state, secrets,
provider resources, provider state, and backup policy.

It has at least:

- an opaque stable `environmentId` supplied by the caller;
- one policy selected from workspace configuration;
- a stable provider resource namespace;
- optional source-ref and expiry metadata;
- current deployed release evidence;
- one resolved deployment target.

A Git revision may identify release evidence but is not environment identity.
Repeated commits on one branch update the same environment.

### Environment Policy

Policy determines:

- whether the environment is protected and persistent;
- backup requirements;
- seed behavior;
- automatic cleanup eligibility and grace period;
- custom-domain eligibility;
- email and other external side-effect capability;
- indexing and public-review behavior.

Production is selected only by an explicit protected policy match. It is never
inferred from a missing environment id or fallback branch name.

### Deployment Target

Environment resolution produces the target consumed by the deployment design:

```ts
type DeploymentTarget = {
  targetId: string;
  origin: string;
  provider: "cloudflare";
  installedManifestRef?: string;
};
```

The deployment layer treats `targetId` as opaque. Environment policy remains
with the caller and supplies any backup, protection, or side-effect
requirements around an operation.

## Default Single-Origin Topology

### Host Policy

A new Worker uses a `workspace` host policy on its generated `workers.dev`
origin. The policy combines protected Program administration with public Site
delivery.

| Policy | Public Site | Admin | Auth | Intended use |
| --- | --- | --- | --- | --- |
| `workspace` | Yes | Under `/formless` | Under `/formless/auth` | Default generated origin |
| `site` | Yes | No | Redirect to configured auth origin | Public custom domain |
| `admin` | No | Under `/formless` | Under `/formless/auth` | Optional dedicated admin host |

The first implementation needs `workspace` and `site`. `admin` is optional
unless an application later needs a dedicated administration domain.

The current runtime resolves requests to exclusive `instance` or
`publishedSite` profiles, and `workers.dev` defaults to `publishedSite`. The new
default requires a combined policy or replacement of host-wide profiles. The
observable requirement is route-family ownership, not enum spelling.

### Reserved Namespace

The workspace host resolves routes in order:

1. intrinsic APIs, auth, callbacks, media, assets, icons, and development-only
   routes;
2. protected admin under `/formless`;
3. public Site documents and resources;
4. normal not-found handling.

The reserved families include:

- `/formless` for admin and runtime-owned browser behavior;
- `/formless/auth` for account orchestration and gates;
- `/api/formless` for Program and runtime APIs;
- Formless-owned asset and media paths;
- required root resources such as icons, `robots.txt`, and `sitemap.xml`.

Public Site route validation rejects content that claims a reserved path.
Runtime behavior wins deterministically when invalid state already exists.

### Admin Surface Mount

Program screen declarations remain application-relative. The runtime mounts the
complete protected surface at one base path.

| Program path | Effective workspace-host path |
| --- | --- |
| `/` | `/formless` |
| `/tasks` | `/formless/tasks` |
| `/site` | `/formless/site` |
| `/settings/access` | `/formless/settings/access` |

Browser links, history routing, Worker document admission, auth continuations,
and direct deep links consume the same mount fact. Program packages do not
hard-code `/formless` into every screen.

### Default URLs

Given Worker name `verifi-dev` and account subdomain `example`:

```text
Public Site: https://verifi-dev.example.workers.dev/
Admin:       https://verifi-dev.example.workers.dev/formless
Owner setup: https://verifi-dev.example.workers.dev/formless/auth/setup
```

This is sufficient for local review, branch review, and initial production
onboarding. Custom domains are optional.

## Workspace-Owned Deployment Configuration

Program schema continues to own screens, access, operations, queries, and
runtime composition. Workspace configuration owns external hosts, host policy,
environment policy, provider resources, and protection policy.

Illustrative configuration:

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

Final syntax is not fixed. Required behavior is:

- environment selection is explicit and resolves exactly one policy;
- production requires an explicit protected match;
- exact hosts normalize before provider mutation;
- public custom domains default to `site` policy;
- the generated origin remains admin and auth origin unless configuration
  selects another supported topology;
- missing domain or email configuration does not make an environment
  incomplete.

## Custom Domains

Branch environments need no custom domain. Their Worker name provides a stable
URL such as:

```text
verifi-pr-123.<account>.workers.dev
```

An optional branded preview domain may use one flat first-level host:

```text
pr-123-preview.verifi-labs.com
```

Admin remains on the generated origin. This avoids admin, auth, `www`, and other
custom-domain resources for every branch.

Flat first-level hosts are preferred because Cloudflare Universal SSL covers
first-level subdomains by default, Worker Custom Domains are exact-host, and
`workers.dev` permits only the Worker-name label before the account subdomain.

Cloudflare references:

- <https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/limitations/>
- <https://developers.cloudflare.com/workers/configuration/routing/custom-domains/>
- <https://developers.cloudflare.com/workers/configuration/routing/workers-dev/>

Desired domains, redirects, Worker names, environment identity, provider
targets, and deployment observations are not mutable Program records. Exact
origins derive from resolved topology.

This removes or narrows the current Routes screen and route write APIs. Any
remaining runtime-owned hostless path behavior must be modeled separately from
provider domains rather than preserving one mixed route entity.

## Outbound Email Configuration

Email follows the same deployment-capability boundary as domains. A value
belongs in `formless.ts` when changing it changes provider resources, DNS, or
Worker bindings. It remains instance state when it only selects or uses an
installed capability.

Workspace configuration owns:

- provider family;
- sending domain or subdomain;
- exact allowed sender addresses;
- semantic sender keys such as `auth`, `contact`, and `system`;
- environment enablement policy;
- provider resource identity and desired configuration.

Exact From addresses belong here because the Worker `send_email` binding is
constrained to configured sender addresses. The sending domain is never
inferred from `workers.dev`.

Instance state may own:

- a runtime sending kill switch;
- selection among installed semantic sender keys;
- sender display name and brand settings;
- notification recipient and reply-to addresses;
- templates and message content;
- delivery intent, status, idempotency, and audit evidence.

Runtime schedules through a semantic sender key rather than an arbitrary From
address:

```ts
scheduleEmail({
  sender: "auth",
  // message and recipient intent
});
```

Ordinary Program writes may disable or select an installed capability. They
cannot add a domain, authorize another sender, create provider resources, or
mutate provider onboarding.

A new environment has no outbound email by default. Passkey setup remains
available, submissions may be stored, unavailable notifications do not claim
delivery, and branch environments do not send unless explicitly configured with
a sandbox or safe sink.

The target design removes provider-facing `email-domain` and `email-sender`
records, provider onboarding state, DNS state, provider errors, and deployment
references from Program state and archives.

## Environment Identity And Resource Naming

The caller supplies an opaque id such as `dev`, `pr-123`, or
`feature/order-workflow`. Formless derives provider-safe physical names while
retaining the original as durable identity.

Normalization must:

- use provider-supported characters;
- fit complete DNS-label and resource-name limits;
- preserve safe readable ids where possible;
- append a short hash when normalization or truncation could collide;
- validate workspace prefix, environment id, and resource suffix together;
- remain stable for the environment lifetime.

A PR number is preferable when available because it survives branch rename.
Formless does not globally reserve `main`; workspace policy identifies protected
production environments.

Worker, Authority, media, queue, Turnstile, provider-state, and deployment-target
identities derive from workspace plus environment identity, not the current
commit.

## Deployment Integration

Environment resolution supplies:

- exact deployment target identity and generated origin;
- resolved provider resource names and desired topology;
- protection and backup policy;
- installed domain and email capability intent;
- seed behavior for first creation;
- cleanup and expiry policy.

The deployment pipeline owns execution, installed resource manifests, provider
state mutation, Worker and Program deployment, records and media, snapshots,
and evidence. Environment code does not duplicate those operations.

First creation orchestrates resource apply, initial Worker and Program deploy,
seed initialization, and owner setup through the deployment operations. Later
release deployment normally touches only Worker and compatible Program
artifacts.

## Future Browser Onboarding

The eventual browser happy path is:

1. create or select a workspace;
2. authorize the provider account;
3. accept a generated Worker name;
4. resolve environment policy and target topology;
5. invoke trusted deployment operations;
6. open the owner-setup URL;
7. complete setup at `/formless`;
8. open `/` to view the starter Site.

The user is not asked for domains, DNS, certificates, route profiles, auth
origin, relying-party id, email domain, or sender addresses.

The browser never executes Alchemy or retains provider credentials directly. A
trusted hosted runner uses short-lived provider authority and canonical remote
state. Browser implementation begins only after the CLI operations, structured
plans, progress events, and receipts are proven.

## Lifecycle

Repository automation decides which refs receive environments and supplies
environment id, source ref, release revision, and optional expiry.

Typical policy:

```text
main branch                 -> deploy environment main
dev branch                  -> deploy environment dev
open pull request 123       -> deploy environment pr-123
pull request closed/merged  -> destroy environment pr-123 after grace period
other branch                -> no deployment
```

Cleanup uses event-driven deletion plus eventual reconciliation:

- close or merge schedules destroy after a grace period;
- a periodic job removes expired environments missed by event delivery;
- pin or persistent policy suppresses automatic cleanup;
- destroy is idempotent and targets one exact environment;
- production cannot be selected through omission, fallback, or a wildcard.

Formless need not query Git providers initially. A later integration automates
the same explicit contract.

## Auth And External Effects

Each environment has independent credentials, sessions, owner setup,
principals, role assignments, secrets, and side-effect configuration.

The generated origin is the default auth origin and WebAuthn relying party. A
Site-only custom domain redirects eligible account flows to it and does not
automatically become an admin or passkey origin.

Branch policy defaults to:

- environment-specific owner setup or trusted review invitation;
- outbound email disabled or routed to a sandbox or safe sink;
- payment, laboratory, webhook, and other integrations disabled or sandboxed;
- Turnstile configured only for exact active hosts;
- non-production indexing policy;
- no production secrets inherited by naming convention.

## Backup Policy

Backup requirements are environment policy passed to deployment operations:

| Policy | Program and media backup | Cleanup |
| --- | --- | --- |
| Production | Required scheduled and pre-release snapshots | Never automatic |
| Persistent non-production | Optional rolling snapshot or explicitly resettable | Explicit or policy-driven |
| Branch default | None except destructive replacement prerequisite | Source close plus grace period and expiry sweep |

Provider state is not a Program or media backup. Private security and provider
secret recovery require independent protected operational policy.

## Safety Invariants

- Every environment has distinct Worker, Authority, media, provider, security,
  and secret state.
- Environment selection resolves exactly one policy and deployment target.
- Production requires an explicit protected policy match.
- A generated origin is useful without domains or outbound email.
- Runtime namespace ownership is deterministic before public Site fallback.
- Custom domains, provider targets, email domains, and allowed From addresses
  are versioned workspace configuration rather than mutable Program data.
- Program writes cannot expand provider authority.
- Stable resource identity derives from workspace and environment, not commit.
- Branch environments do not inherit production data, secrets, or side effects.
- Environment policy wraps deployment operations but does not reimplement them.
- Browser onboarding remains a future caller of trusted headless operations.

## Change Sequence

1. Add the combined workspace-host policy, reserve `/formless`, mount protected
   admin there, and serve public Site documents as fallback.
2. Add typed workspace environment policy, stable environment identity, provider
   naming, and deployment-target resolution.
3. Move custom domains, redirects, email domains, sender allowlists, and provider
   topology into workspace configuration. Remove or narrow schema-owned route,
   deployment-config, email-domain, and email-sender behavior.
4. Add canonical remote provider-state scoping and environment inspect and
   destroy through the deployment operations.
5. Add branch expiry, cleanup reconciliation, and optional branded preview
   domains.
6. Define and implement a trusted browser deployment runner only after the
   deployment CLI and environment target resolution are proven.

The recommended first environment change is the single-origin workspace
runtime:

- `workers.dev` selects workspace-host behavior;
- public Site documents serve from `/`;
- admin mounts at `/formless`;
- auth remains under `/formless/auth`;
- Program APIs remain under `/api/formless`;
- runtime, admin, and Site precedence is deterministic;
- reserved Site path conflicts fail validation.

This change is independent of the deployment refactor and may proceed when it
has higher product priority.

## Open Decisions

- Confirm `workspace`, `site`, and optional `admin` host-policy vocabulary.
- Confirm `/formless` as the permanent admin mount and Site-reserved namespace.
- Decide whether Program screen paths remain absolute application-relative
  paths combined with a runtime base or become relative declarations.
- Define which root resources belong to public Site fallback and which remain
  intrinsic on every host policy.
- Decide whether the route change includes only Worker selection contracts or
  also moves the browser shell and router under the admin mount.
- Define the upgrade outcome when existing Site content claims `/formless`.
- Choose final environment configuration syntax and policy matching rules.
- Decide whether branded preview domains enter the first lifecycle change or a
  later one.
