# Formless Package Agents

Package scope: `lib/formless`.

## Owns

- Published `@dpeek/formless` runtime and CLI package.
- `bin/formless.ts`: Bun-native package executable.
- `src/app/`: React application routes and generated runtime composition.
- `src/client/`: browser replica, projections, and generated view models.
- `src/shared/`: runtime protocols, read models, field behavior, and Program identity.
- `src/worker/`: Worker routes, Authority, Program storage, and public SSR.
- `src/cli/`: CLI command parsing, workspace workflows, publishing, and deployment.
- `src/test/`: package-local shared runtime fixtures.

## Boundaries

- Consume reusable `lib/<package>` capabilities through public workspace package exports.
- Keep stored records flat and compose through query, view, projection, and action layers.
- Read `src/cli/AGENTS.md` before editing CLI source.
- Keep package execution under Bun.

## Test Rules

- Own runtime route and model selection, projection, Presentation Host
  publication, canonical intent resolution, runtime effects, storage, and Worker
  behavior.
- Assert selected targets, projected contracts, publications, intents, effects,
  or other public runtime invariants. Do not assert Renderer markup, Astryx
  output, private data attributes, or layout.
- Reject fixture-catalog, source-text, exact-dependency-version,
  implementation-history, and removed-behavior proof.

## Checks

- Run `bun check:packages` from the repository root.
