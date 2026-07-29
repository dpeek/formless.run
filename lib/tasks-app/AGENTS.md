# Formless Tasks App Agents

Package scope: `@dpeek/formless-tasks-app`.

Read this when editing `lib/tasks-app/*`.

## Owns

- Tasks app package manifest in `formless.app.json`.
- Tasks schema authoring modules composed in `src/schema.ts`.
- Materialized Tasks source schema in `schema.json`.
- Runtime-neutral Tasks package contracts in `src/`.

## Does Not Own

- App install identity, route records, Authority storage, browser replicas, sync, or media storage.
- Generic generated UI layout, schema parsing, archive envelopes, deploy execution, or workspace operation policy.

## Map

- `package.json`: package metadata and exported root and source JSON subpaths.
- `tsconfig.json`: package-local TypeScript project extending the repo config.
- `formless.app.json`: runtime-neutral Tasks app package manifest.
- `schema.json`: materialized flat Tasks app schema source.
- `scripts/materialize-schema.ts`: package-local schema materialization command.
- `src/schema-records.ts`: Tasks record and query declarations.
- `src/schema-presentation.ts`: Tasks item view, view, and screen declarations.
- `src/schema.ts`: authoritative Tasks schema composition entrypoint.
- `src/types.ts`: versioned public Tasks package constants.
- `src/index.ts`: runtime-neutral Tasks package exports.

## Rules

- Keep Tasks records flat.
- Keep materialized schema as package source data, not generated runtime state.
