# Formless

Formless is a schema-as-data app runtime for building custom software on Cloudflare.

One app definition describes records, fields, relationships, queries, read
models, views, screens, actions, public output, and deploy behavior. The runtime
turns that definition into storage, sync, generated UI, media, public pages,
archives, and deploy paths.

This README is the human overview. Agent instructions live separately in `AGENTS.md`.

## Quick Start

The Formless CLI requires [Bun](https://bun.com/docs/installation). Create a
local Formless workspace with the Bun package runner:

```sh
mkdir my-workspace
cd my-workspace
bunx @dpeek/formless dev
```

The package executes its TypeScript CLI entrypoint directly with Bun. Node.js
without Bun is not a supported CLI runtime.

Common commands:

- `formless dev` runs the local workspace instance and lets browser setup create
  reviewable workspace source without mutating Cloudflare.
- `formless save` writes local Authority-backed instance state to reviewable
  workspace storage snapshots and media payloads.
- `formless save --check` fails when reviewable workspace source is stale.
- `formless pull [--dry-run]` syncs the selected deployed target into
  reviewable workspace source. Apply is the default; `--dry-run` reports the
  local source replacement plan without rewriting files.
- `formless push [--dry-run]` syncs reviewable workspace source to the selected
  deployed target, including runtime code, provider resources, control-plane
  records, Program records, schema, routes, and media. Apply is the
  default; `--dry-run` reports the sync plan without mutating local source,
  remote data, Cloudflare resources, or Alchemy state.
- `formless destroy` is the explicit Cloudflare boundary for tearing down the configured deployment.
- `formless owner setup` creates an owner setup capability for the selected target.
- `formless token adopt` and `formless token rotate` manage ignored workspace
  admin-token state for automation.

## Packages

- `@dpeek/formless`: Formless runtime and CLI package.
- `@dpeek/formless-ui`: shared browser primitives for generated runtime surfaces.
- `@dpeek/formless-media`: reusable media contracts, helpers, and adapters.
- `@dpeek/formless-deploy`: reusable deployment contracts, projection helpers, and adapters.

## Current Shape

The runtime already has:

- app schemas for the standard library, Tasks, and Site;
- flat record storage through Durable Object Authority;
- one build-time-composed Program schema and Authority;
- browser IndexedDB replicas;
- HTTP cursor sync and push sync;
- generated React UI for schema-declared screens, views, tables, trees, fields, and actions;
- Site records projected into public trees and SSR documents;
- local-first workspace CLI for dev, save, pull, push, and destroy;
- portable instance archives;
- schema-owned instance control-plane records for routes, domain
  intent, and deployment intent;
- product instance, dev workbench, and published Site runtime profiles;
- owner passkey setup, owner sessions, logout, and admin bearer recovery boundaries;
- public action execution and standard contact subscription records;
- deployment desired-state versions, attempts, leases, status, and upgrade metadata;
- custom-domain planning, provider delete and cleanup, redirects, and generic
  deployment projection paths.

## Product Direction

Formless should feel like a Cloudflare-native app runtime, not a pile of helpers.

The runtime should own:

- Program composition and routing;
- durable record storage;
- schema parsing and validation;
- generated authoring surfaces;
- local browser replica and sync;
- media upload and delivery;
- auth, roles, orgs, and groups;
- queues, workflows, scheduled work, and long-running jobs;
- AI, agents, browser rendering, image optimization, video delivery, and email integration;
- deploy, backup, restore, import, and ejection paths.

The schema stays the product contract. Custom code should extend that contract
instead of replacing it.

## Design Principles

- Schema is the durable contract.
- Data stays flat; composition lives in views, queries, projections, and actions.
- Generated UI gets users to working software quickly.
- Custom UI becomes first-class when a workflow deserves a custom shape.
- Humans and agents should work over the same schema and data.
- Cloudflare primitives should have product-shaped defaults and explicit escape hatches.

## Good Next Work

Useful directions:

- prove the runtime with richer non-Site apps;
- improve generated authoring ergonomics;
- make portable archive and instance management safer in-browser;
- keep media ownership core-owned and app usage metadata app-owned;
- add provider adapters behind runtime modules;
- improve Site polish only where it unlocks real publishing use;
- add extensibility through schema-backed view registries and custom result presentations.

Avoid:

- deep platform abstraction before a real domain needs it;
- broad account or marketplace work before one deployment story is clear;
- Site-specific owned media paths outside core media;
- arbitrary custom React escape hatches as the first extensibility story;
- strategy-heavy docs that do not own work.
