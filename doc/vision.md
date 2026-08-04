# Formless Vision

Last updated: 2026-06-19

Purpose: big-picture product vision for Formless V1.

This is not shipped behavior. Shipped behavior lives in `openspec/specs/*/spec.md`.

This is not a backlog. Backlog and ideas live in `doc/roadmap.md`. Work starts
when a committed OpenSpec or Git-backed change owns the work.

## North Star

Formless is a schema-as-data app runtime centered on operations.

An app schema defines flat records, projections, source-declared operations,
operation bindings, and runtime capability adapters. Every human, agent,
public, CLI, automation, generated UI, and runtime interaction should invoke an
operation or a runtime-declared operation analogue.

One command should give a person or agent a flexible data store in the cloud,
with generated operation-bound UI, durable storage, sync, owner auth, media,
public bindings, archives, and deploy paths ready by default.

## Product Promise

Define the app once. Invoke it many ways.

An app definition should describe:

- flat records, fields, and relationships;
- projections such as queries, read models, views, screens, public outputs, and
  result models;
- operations with input, output, effect, actor policy, idempotency, and audit
  contracts;
- bindings that expose operations through generated UI, protocol routes, public
  forms, CLI calls, automation triggers, or runtime surfaces;
- package and platform adapters selected by runtime capability facts.

The runtime should turn that definition into a working cloud app with strong
defaults and clear escape hatches.

## Current Anchors

- `openspec/specs/app-schema/spec.md` defines the operations-centered schema
  contract: records, projections, operations, bindings, and adapters.
- `openspec/specs/authority-storage/spec.md` defines Authority storage around
  operation invocation envelopes, idempotency, operation audit rows, and change
  rows as the materialization log.
- `openspec/specs/generated-ui/spec.md` defines generated React surfaces that
  select operation bindings for collection, table, and app controls.
- `openspec/specs/public-actions/spec.md` defines public exposure as anonymous
  operation policy plus target-scoped public operation bindings.
- Current code still contains mutation and action materializers. Under the
  current specs, they are internal implementation details behind
  source-declared operations, not peer interaction models.
- Durable Object Authority storage, browser IndexedDB replicas, HTTP sync, and
  push sync already exist.
- Site already proves one definition can produce generated admin UI and public
  HTML output.
- `formless dev` already creates a local Formless workspace before changing
  Cloudflare resources.
- `formless deploy` is the explicit Cloudflare deployment boundary for a saved
  workspace.
- Portable app and instance archives already prove backup, restore, and import
  plumbing.
- Schema-owned instance control-plane records already model app installs,
  routes, domain intent, and deployment intent.
- Owner passkey setup, owner sessions, logout, and admin bearer recovery
  boundaries already exist.
- Deployment desired-state versions, attempts, leases, status, and upgrade
  metadata already exist.
- Media and Deploy package slices already expose reusable contracts, helpers,
  and adapters.

## V1 Shape

V1 should make Formless feel like a Cloudflare-native operations runtime, not a
library of unrelated helpers.

The runtime owns:

- app installation and routing;
- durable flat record storage;
- schema parsing and validation;
- operation invocation, idempotency, audit, and write classification;
- generated authoring surfaces selected from operation bindings;
- local browser replica and sync;
- target-scoped public operation bindings;
- media upload and delivery;
- owner auth, owner sessions, logout, and admin bearer recovery;
- deploy, backup, restore, import, and ejection paths.

The schema stays the product contract. Custom code extends operations or
adapters instead of replacing that contract.

Broad platform axes are deferred until a concrete operation requires them.
Roles, orgs, groups, app marketplace, durable workflow UI, broad provider
management UI, AI surfaces, browser rendering jobs, video delivery, and email
product flows should not become V1 peers of operations.

Standard contact intake is the first reusable public operation set.

## Cloudflare Boundary

Formless should wrap Cloudflare primitives in product-shaped defaults through
operations and adapters:

- Workers and Assets for the runtime shell, API routes, and public output.
- Durable Objects for Authority storage, operation invariants, sync, and
  app-local state.
- R2 for media originals, generated artifacts, backups, and portable archives.
- Queues, Workflows, Agents, AI Gateway, Browser Rendering, Stream, Image
  optimization, and email integrations only when a concrete operation needs the
  primitive and an adapter boundary is defined.

The user should not have to start by learning every primitive. The runtime
should provide the first useful operation path for each primitive it supports,
then expose the underlying Cloudflare concepts when the app needs more control.

## App Definition

An app definition should be a portable, inspectable object.

It should describe:

- flat stored record types;
- field behavior, validation, defaults, and generated editors;
- relationships over stored references;
- queries, read models, views, screens, and result models;
- operations and operation bindings;
- public routes and output formats as bindings or projections;
- actor, permission, idempotency, and audit policy for operations;
- integration adapters;
- import, export, and archive behavior.

The runtime should keep data flat and compose richer behavior in the query,
view, projection, and operation layers.

## Surfaces

One definition should expose multiple surfaces without changing the operation
contract:

- generated admin UI for humans;
- compact custom UI for a specific domain flow;
- public HTML for sites and documents;
- Markdown for content, summaries, and agent-readable output;
- JSON for APIs, automation, and app-to-app exchange;
- feeds, sitemaps, and metadata for public publishing;
- email templates and notifications when backed by concrete operations;
- background inputs and outputs when backed by concrete operations.

Generated UI should be the default starting point. Custom UIs should be
first-class when a domain flow deserves a custom shape, but they should still
bind to operations for writes and commands.

## Human And Agent Work

Formless should treat humans and agents as collaborators over the same app
definition and data.

Humans need:

- fast generated screens;
- safe operation-bound edits;
- clear authorization boundaries;
- clear history;
- domain-specific views;
- understandable deployment and backup controls.

Agents need:

- stable schemas;
- typed data surfaces;
- operation contracts;
- Markdown and JSON output;
- safe write paths;
- audit trails and permission boundaries.

The goal is not generic UI generation for its own sake. The goal is custom-fit
software where agents and humans can both see the domain model and invoke the
same domain operations.

## Batteries And Escape Hatches

Formless should remove boilerplate without trapping the project.

Built in:

- passkey owner auth;
- app installs;
- admin and public operation surfaces;
- media;
- common Cloudflare primitive adapters;
- backup, restore, and import;
- local development;
- cloud deployment.

Escape hatches:

- raw schema source editing;
- custom generated view presentations;
- app-specific operation handlers;
- custom UI surfaces that bind to operations;
- direct primitive configuration when defaults are too small;
- portable archives;
- ejection into a normal Cloudflare project when ownership matters more than
  runtime convenience.

The happy path should be terse. The advanced path should be explicit.

## One-Command Experience

The target first impression:

```sh
formless dev
```

That command should create a reviewable local Formless workspace, run the
product instance locally, and let the user explore before deploying.

From the browser, the user should be able to:

- create the owner identity;
- install or create an app;
- edit the app schema;
- use generated operation-bound UI immediately;
- add media and public operation bindings when the domain needs them;
- save workspace archives locally;
- deploy the workspace to Cloudflare when ready;
- publish or expose the app through HTML, Markdown, JSON, and custom UI
  surfaces.

## Product Principles

- Schema is the durable contract.
- Data stays flat; composition lives in views, queries, projections, and
  operations.
- Operations are the interaction seam for humans, agents, public callers, CLI,
  automation, generated UI, and runtime surfaces.
- Bindings expose operations; they do not redefine operation meaning.
- Adapters handle package-specific or platform-specific behavior.
- Generated UI gets the user to working software quickly.
- Custom UI exists for domain flows where generic screens are not enough.
- Cloudflare primitives are wrapped, not hidden forever.
- Local, remote, backup, restore, and ejection paths are part of the product.
- Agents and humans use the same domain model.
- Boilerplate should disappear before power disappears.

## Open Questions

- What is the exact V1 browser-first setup path after `formless dev`?
- Which next domain interaction is not covered by first-pass operation kinds?
- What is the smallest useful permission model beyond owner sessions?
- What does ejection produce: a generated Worker project, an app package, an
  archive, or all three?
- Which public output formats are V1: HTML, Markdown, JSON, feeds, PDF, or
  email?
- What is the first agent-native use case that proves schema, operations, audit,
  and permissions together?
