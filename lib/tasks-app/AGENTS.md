# Formless Tasks App Agents

Package scope: `@dpeek/formless-tasks-app`.

Read this when editing `lib/tasks-app/*`.

## Owns

- Tasks schema authoring modules composed in `src/schema.ts`.
- Runtime-neutral Tasks package contracts in `src/`.

## Does Not Own

- App install identity, route records, Authority storage, browser replicas, sync, or media storage.
- Generic generated UI layout, schema parsing, archive envelopes, deploy execution, or workspace operation policy.

## Map

- `package.json`: package metadata and exported root and schema authoring subpaths.
- `tsconfig.json`: package-local TypeScript project extending the repo config.
- `src/schema-records.ts`: Tasks record and query declarations.
- `src/schema-presentation.ts`: Tasks item view, view, and screen declarations.
- `src/schema.ts`: public schema authoring subpath and authoritative Tasks schema composition.
- `src/types.ts`: stable Task entity identity.
- `src/index.ts`: runtime-neutral Tasks package exports.

## Rules

- Keep Tasks records flat.
