# Formless Site App Agents

Package scope: `@dpeek/formless-site-app`.

Read this when editing `lib/site-app/*`.

## Owns

- Site app package manifest in `formless.app.json`.
- Site source schema in `schema.json`.
- Site-specific public runtime contracts and root, React, Worker, and Node adapters in `src/`.

## Does Not Own

- App install identity, route records, Authority storage, browser replicas, sync, or core media storage.
- Generic generated UI layout, schema parsing, archive envelopes, deploy execution, or workspace operation policy.

## Map

- `package.json`: package metadata and exported app, React, Worker, Node, and source JSON subpaths.
- `tsconfig.json`: package-local TypeScript project extending the repo config.
- `formless.app.json`: runtime-neutral app package manifest.
- `schema.json`: flat Site app schema source.
- `src/types.ts`: versioned public Site tree and stored-record contracts.
- `src/index.ts`: runtime-neutral Site helpers and contracts.
- `src/react.tsx`: public Site React route and renderer adapter.
- `src/worker.ts`: public Site Worker adapter and document, indexing, and icon handlers.
- `src/node.ts`: Site Node/archive helpers.

## Rules

- Keep Site records flat.
- Keep source schema as package source data, not generated runtime state.

## Test Rules

- Own public Site contracts, session validation, challenge, request, retry and
  outcome behavior, and Site React, Worker, and Node adapter behavior.
- Assert observable session results, requests, projected contracts, or adapter
  output. Concrete Formless Renderer DOM remains Renderer-owned.
- Reject fixture-catalog, source-text, exact-dependency-version,
  implementation-history, and removed-behavior proof.
