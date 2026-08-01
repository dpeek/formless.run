# Formless Site App Agents

Package scope: `@dpeek/formless-site-app`.

Read this when editing `lib/site-app/*`.

## Owns

- Site schema authoring modules composed in `src/schema.ts`.
- Materialized Site source schema in `schema.json`.
- Site-specific public runtime contracts and root, React, Worker, and Node adapters in `src/`.

## Does Not Own

- App install identity, route records, Authority storage, browser replicas, sync, or core media storage.
- Generic generated UI layout, schema parsing, archive envelopes, deploy execution, or workspace operation policy.

## Map

- `package.json`: package metadata and exported app, schema, React, Worker, Node, and source JSON subpaths.
- `tsconfig.json`: package-local TypeScript project extending the repo config.
- `schema.json`: materialized flat Site app schema source.
- `scripts/materialize-schema.ts`: package-local schema materialization command.
- `src/schema-records.ts`: Site record and query declarations.
- `src/schema-presentation.ts`: Site item view, table view, view, and screen declarations.
- `src/schema.ts`: public schema authoring subpath and authoritative Site schema composition.
- `src/types.ts`: versioned public Site tree and stored-record contracts.
- `src/index.ts`: runtime-neutral Site helpers and contracts.
- `src/react.tsx`: public Site React route and renderer adapter.
- `src/worker.ts`: public Site Worker adapter and document, indexing, and icon handlers.
- `src/node.ts`: Site Node/archive helpers.

## Rules

- Keep Site records flat.
- Keep materialized schema as package source data, not generated runtime state.

## Test Rules

- Own public Site contracts, session validation, challenge, request, retry and
  outcome behavior, and Site React, Worker, and Node adapter behavior.
- Assert observable session results, requests, projected contracts, or adapter
  output. Concrete Formless Renderer DOM remains Renderer-owned.
- Reject fixture-catalog, source-text, exact-dependency-version,
  implementation-history, and removed-behavior proof.
