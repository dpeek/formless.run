# Formless CRM App Agents

Package scope: `@dpeek/formless-crm-app`.

Read this when editing `lib/crm-app/*`.

## Owns

- CRM schema authoring modules composed in `src/schema.ts`.
- Materialized CRM source schema in `schema.json`.
- Runtime-neutral CRM package contracts in `src/`.

## Does Not Own

- App install identity, route records, Authority storage, browser replicas, sync, or media storage.
- Site subscribe form writes, Site-owned subscriber records, public CRM write routes, or email queue execution.
- Generic generated UI layout, schema parsing, archive envelopes, deploy execution, or workspace operation policy.

## Map

- `package.json`: package metadata and exported root and source JSON subpaths.
- `tsconfig.json`: package-local TypeScript project extending the repo config.
- `schema.json`: materialized flat CRM app schema source.
- `scripts/materialize-schema.ts`: package-local schema materialization command.
- `src/schema-records.ts`: CRM record and query declarations.
- `src/schema-presentation.ts`: CRM item view, table view, view, and screen declarations.
- `src/schema.ts`: public schema authoring subpath and authoritative CRM schema composition.
- `src/index.ts`: runtime-neutral CRM package exports.

## Rules

- Keep CRM records flat.
- Keep materialized schema as package source data, not generated runtime state.
- Do not add public CRM subscribe writes or email sending here.
