# Formless Agents

Write short. Facts only. Keep docs source-faithful.

## Project

Formless = schema-as-data app runtime.

App schema is runtime data. It defines entities, fields, relationships, mutations, queries, read models, views, screens, actions.

Data stays flat. Compose in query, view, projection, action layer.

## Read Levels

- Always: this file.
- Workstream: assigned Git-backed change branch `changes/<change-id>` and parsed tip commit metadata.
- Task loop: rendered prompt injected by `bun agents`; source skill templates are reference, not required per-session reads.
- Package scope: nearest package `AGENTS.md`, for example `lib/renderer/AGENTS.md`.
- Capability scope: relevant `openspec/specs/*/spec.md`.
- Do not read every doc. Read only path needed for task.

## Agent Skills

- `.agents/skills/change-propose/SKILL.md`: create Git-backed change branches.
- `.agents/skills/change-apply/SKILL.md`: implement one ready task section.
- `.agents/skills/change-finalize/SKILL.md`: finalize completed branches for review.
- `.agents/skills/change-explore/SKILL.md`: inspect Git-backed changes without implementation.

## Capability Specs

- `openspec/specs/app-schema/spec.md`: schema parsing, fields, relationships, read models, actions.
- `openspec/specs/authority-storage/spec.md`: Authority, writes, bootstrap, reset, snapshots.
- `openspec/specs/sync-replica/spec.md`: browser replica, cursors, push sync, local projections.
- `openspec/specs/generated-ui/spec.md`: React generated surfaces, fields, screens, actions.
- `openspec/specs/site-runtime/spec.md`: Site records, public tree, SSR, metadata, icons.
- `openspec/specs/formless-cli/spec.md`: Formless CLI workspace, save, publish, deploy commands.
- `openspec/specs/instance-control-plane/spec.md`: schema-owned instance management records.
- `openspec/specs/instance-auth/spec.md`: owner passkeys, sessions, admin bearer boundary.
- `openspec/specs/runtime-topology/spec.md`: profiles, route policy, mapped hosts.
- `openspec/specs/deployment-runtime/spec.md`: desired deploy state, attempts, leases, status.
- `openspec/specs/core-media/spec.md`: core media assets, upload, delivery, media archive payloads.
- `openspec/specs/media/spec.md`: reusable Media package contracts and adapters.
- `openspec/specs/custom-domains/spec.md`: exact-host mappings, provider jobs, redirects, cleanup.
- `openspec/specs/portable-archives/spec.md`: app and instance archives, restore, import, workspaces.
- `openspec/specs/public-actions/spec.md`: public action policy, target routes, challenges.
- `openspec/specs/contact-subscriptions/spec.md`: Site contacts, emails, audiences, subscriptions.
- `openspec/specs/package-slices/spec.md`: reusable `lib/<package>` package boundaries.
- `openspec/specs/upgrade-migrations/spec.md`: metadata, migrations, CLI upgrade flow.
- `openspec/specs/local-agent-workers/spec.md`: worker leases, branches, finalization.

## Repo Map

- `lib/formless/`: published Formless runtime and CLI workspace package.
- `lib/formless/src/shared/`: schema, protocol, read models, field behavior, Program identity.
- `lib/formless/src/client/`: browser replica, projections, generated view models.
- `lib/formless/src/app/`: React routes, generated runtime and projections, renderer composition.
- `lib/formless/src/worker/`: Worker routes, Authority, storage, Program runtime, public SSR.
- `lib/formless/src/cli/`: Formless CLI implementation, project files, publish, archives, domains.
- `lib/formless/src/media/`: core media model and providers.
- `lib/formless/src/test/`: shared test fixtures.
- `lib/tasks-app/`: reusable Tasks schema modules and named complete source.
- `lib/standard/`: reusable standard schema modules and named complete source.
- `lib/site-app/`: bundled Site schema modules, named complete source, and adapters.
- `lib/presentation/`: renderer-neutral Formless UI contracts, hosts, and React adapters.
- `lib/renderer/`: Formless Renderer application and Site presentation backed by Astryx.
- `lib/media/`: reusable media contracts and adapters package.
- `lib/deploy/`: reusable deployment contracts and adapters package.
- `scripts/`: repo scripts, local agents, and package build.
- `openspec/specs/`: shipped capability specs.

## Core Terms

- App schema: runtime data contract.
- Package schema source: domain-owned declarations under `lib/*-app/src/schema.ts`.
- Schema key: schema artifact identity; the active Program uses `formless-program`.
- Entity: flat record type.
- Field: scalar or reference value.
- Record: stored entity instance with flat values.
- Relationship: schema metadata over references; no nested stored data.
- Query: schema-declared record filter.
- Read model: computed display output; not stored.
- View: generated UI surface.
- Screen: route workspace that composes collection views.
- Action: schema-declared command.
- Mutation: generic create, patch, delete write.

## Runtime Terms

- Formless instance: Program data, media, auth, and deploy config.
- Product instance profile: Program and instance management runtime.
- Dev workbench profile: local Program development runtime.
- Browser replica: IndexedDB copy of the Program keyed by Program storage identity.
- Authority: Durable Object that owns committed storage and invariants.
- Storage: records, changes, schema, action executions.
- Sync cursor: timestamp cursor for HTTP sync and push catch-up.
- Push sync: hibernatable WebSocket at `/api/formless/program/sync/ws`.
- Generated UI: React surfaces selected from schema models.
- Public tree: Site flat block and placement projection into nested output.
- Core media: instance-owned media assets referenced by flat app records.
- Media package: reusable core media contracts, helpers, and adapters under `lib/media`.
- Custom domain mapping: exact-host profile route intent stored on the instance.
- Instance control plane: Program schema records for routes, domain intent, and deploy intent.
- Deployment runtime: versioned desired deploy state, attempt history, leases, and status.
- Instance auth: owner passkey setup, sessions, logout, and admin bearer boundary.
- Public action: schema-declared action opened through target-scoped public routes.
- Contact subscription: flat standard-owned contact, email address, audience, and subscription records.
- Instance archive: versioned Program, media, and instance configuration envelope.
- Package slice: reusable capability package under `lib/<package>` without app records.
- Upgrade migration: registered runtime or app-data migration with safety policy and apply evidence.

## App Terms

- Task app: tasks with active, completed, overdue queries.
- Site app: blocks and block placements. Public pages render from tree projection.
- Block: Site content, media, group, or page record.
- Block placement: flat parent-child composition edge.
- Default product Site: singleton Site domain composed into the Program.

## Test Rules

- Verify behavior at its owning layer: schema language in `lib/schema`, runtime
  selection and effects in `lib/formless`, generic host semantics in
  `lib/presentation`, contract-to-DOM mapping in `lib/renderer`, and public Site
  sessions and adapters in `lib/site-app`.
- Every test must observe user-visible behavior, a public contract or artifact,
  a runtime effect, or a named invariant. Verify cross-package behavior once at
  the narrowest stable public integration boundary.
- Renderer tests use production renderers with real Astryx and adjacent
  production leaves. Do not module-mock Renderer components.
- Do not add fixture-catalog, source-text, exact-dependency-version,
  implementation-history, or removed-behavior proof.
- Do not duplicate facts already enforced by TypeScript, package export maps or
  validation, production builds, or an existing focused test.

## Work

1. Select the ready task section from parsed change commit metadata before broad context reads when doing implementation work.
2. Read assigned change metadata, canonical specs, docs, and code needed for the selected section or finalization prompt.
3. Read nearest package `AGENTS.md` only when editing inside that package.
4. Read relevant `openspec/specs/*/spec.md`.
5. Ship exactly one ready task section from change commit metadata unless user explicitly asks for docs/planning only.
6. Update the branch tip with task status, decisions, blockers, evidence, and machine-readable trailers.
7. Run `bun check:packages` and fix failures before marking implementation work done.
8. If any file under `openspec/` changed, run `bun check:openspec` after the final edit and before committing or finishing.
9. If app behavior changed, smoke with `bunx agent-browser ...`.
10. End with changed files, checks, and change metadata status.

## Workstream

- Workstreams live in local `changes/<change-id>` branches.
- Do not use external systems as queue, lock, or status store.
- Do not create alternate planning docs.
- The branch tip commit message stores proposal, design, task state, evidence, blockers, and trailers.
- The branch diff against local `main` is the review delta.
- Proposal branches start with a first-pass spec patch in canonical `openspec/specs/*/spec.md` files plus structured commit metadata.
- Shipped spec facts are direct edits to canonical `openspec/specs/*/spec.md` files on the branch.
- Task statuses are task checkboxes plus recorded evidence in structured commit metadata.
- Mark or ship one task section at a time for a workstream.
- Local Git-backed implementation unit is one ready task section in change commit metadata.
- Local Git-backed workers auto-finalize before review and leave code changes, completed evidence, canonical specs, and structured metadata on the review branch.
- Future worker changes do not produce OpenSpec archive output.

## Local Git-backed Finalization

For `bun agents watch <worker-name>`:

- Finalization is supervisor and rendered-prompt owned after required tasks are shipped or intentionally closed.
- Rebase on local `main`, validate structured commit metadata, run `bun check:ready`, publish to the review branch, and mark metadata ready for review.
- Do not run `openspec archive` or commit archived change files for Git-backed Formless changes.
- Resolve clear structural rebase conflicts; block only on semantic conflicts that require product, storage, security, public API, or user-intent decisions.
- Leave a clean review-ready `changes/<change-id>` branch with code changes, completed evidence, canonical specs, and structured commit metadata.
- Keep review-ready branches rebased on local `main`; workers rerun finalization when `main` advances.
- Keep the worker worktree on `agents/<worker-name>` and leave `changes/<change-id>` free for review after marking ready.
- Do not merge unless user asks.

## Rules

- Bun scripts only.
- The supervisor runs `bun check:setup` after preparing a worker worktree and before starting each worker session.
- Use `bun check:packages` for implementation checks and `bun check:ready` for finalization checks.
- Do not run `vp test`, `vp check`, `bun test`, or the root `bun check` script directly during normal agent work.
- Use current Bun check command output as evidence.
- Preserve user changes.
- Keep data model flat.
- Compose in view/query/projection/action layer.
- Current-state only: backwards compatibility is not a project goal unless an explicit spec/task says otherwise.
- Do not add shims, re-exports, redirects, migrations, schema versions, deprecated CLI commands, explicit 404 handlers, tests, proof, or docs for removed/deprecated behavior.
- Specs describe current or desired behavior. When behavior is removed, delete or update old code, tests, and spec facts instead of preserving rejection or alias paths.
- Use `lib/formless/src/test/site-records.ts` fixtures for Site record shape.
- Claims in docs must point to code, schema, tests, specs, or shipped behavior.
- Shipped facts belong in `openspec/specs/`.
- Human narrative does not belong in agent docs.
