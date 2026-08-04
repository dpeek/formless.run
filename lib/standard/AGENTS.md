# Formless Standard Library Agents

Package scope: `@dpeek/formless-standard`.

Read this when editing `lib/standard/*`.

## Owns

- Reusable standard schema authoring modules composed in `src/schema.ts`.
- Runtime-neutral standard declaration identities in `src/`.

## Does Not Own

- Program storage, routes, navigation, authorization, runtime adapter implementations,
  browser behavior, or Worker behavior.
- Site publishing, public block bindings, projections, presentation, or notifications.
- Generic schema parsing, composition, or materialization APIs.

## Map

- `package.json`: package metadata and exported root and schema authoring subpaths.
- `tsconfig.json`: package-local TypeScript project extending the repo config.
- `src/schema-inquiry-records.ts`: inquiry record and query declarations.
- `src/schema-contact-subscription-records.ts`: contact-subscription records, relationships,
  queries, operations, constraints, and runtime requirement.
- `src/schema-standalone-presentation.ts`: complete-source-only generated presentation needed
  to form one valid named App schema source; downstream composition uses the granular modules.
- `src/schema.ts`: public schema authoring subpath and complete standard composition.
- `src/types.ts`: stable standard entity identities.
- `src/index.ts`: runtime-neutral standard package exports.

## Rules

- Keep records flat.
- Keep the inquiry and contact-subscription modules independently composable.
- Keep executable adapter selection outside this package.
- Keep standalone presentation out of the public schema authoring exports.
