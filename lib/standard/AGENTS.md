# Formless Standard Library Agents

Package scope: `@dpeek/formless-standard`.

Read this when editing `lib/standard/*`.

## Owns

- Reusable standard schema authoring modules composed in `src/schema.ts`.
- Materialized standard source schema in `schema.json`.
- Runtime-neutral standard declaration identities in `src/`.

## Does Not Own

- Program storage, routes, navigation, authorization, runtime adapter implementations,
  browser behavior, or Worker behavior.
- Site publishing, public block bindings, projections, presentation, or notifications.
- Generic schema parsing, composition, or materialization APIs.

## Map

- `package.json`: package metadata and exported root, schema authoring, and source JSON subpaths.
- `tsconfig.json`: package-local TypeScript project extending the repo config.
- `schema.json`: materialized flat standard schema source.
- `scripts/materialize-schema.ts`: package-local schema materialization command.
- `src/schema-inquiry-records.ts`: inquiry record and query declarations.
- `src/schema-contact-subscription-records.ts`: contact-subscription records, relationships,
  queries, operations, constraints, and runtime requirement.
- `src/schema-standalone-presentation.ts`: package-artifact-only generated presentation needed
  to form one valid standalone App schema; downstream composition uses the granular modules.
- `src/schema.ts`: public schema authoring subpath and complete standard composition.
- `src/types.ts`: stable standard entity identities.
- `src/index.ts`: runtime-neutral standard package exports.

## Rules

- Keep records flat.
- Keep the inquiry and contact-subscription modules independently composable.
- Keep executable adapter selection outside this package.
- Keep standalone presentation out of the public schema authoring exports.
- Keep materialized schema as package source data, not generated runtime state.
