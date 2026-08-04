# Formless Instance Control Plane Agents

Package scope: `@dpeek/formless-instance-control-plane`.

Read this when editing `lib/instance-control-plane/*`.

## Owns

- Instance control-plane boundary schema key and entity identity constants.
- Control-plane entity names, entity value contracts, schema contract, and route helpers.
- Reviewable control-plane record validation and display-safe canonicalization.
- Package-local deterministic instance control-plane contract tests.

## Does Not Own

- App install mutation execution, owner authorization, or Authority writes.
- Browser replica state, Durable Object storage, sync, reset, restore execution, or runtime protocol handlers.
- Bundled standard, Site, or Tasks schema modules, named complete sources, or Program composition.
- Deployment provider execution, credential resolution, operation history, or provider resource truth.
- React UI, Worker routes, Node adapters, provider SDKs, or filesystem APIs.

## Map

- `package.json`: package metadata plus root, `./records`, and runtime-neutral
  `./schema` public exports.
- `tsconfig.json`: package-local TypeScript project extending the repo config.
- `src/types.ts`: public contract version declaration.
- `src/index.ts`: runtime-neutral package root entrypoint and pure helpers.
- `src/records.ts`: shared record adapter and create-id contribution.
- `src/schema.ts`: reusable record, presentation, and routes screen schema module exports.
- `src/*.test.ts`: package-local contract and helper coverage.

## Read Path

1. Read this file.
2. Read `src/types.ts` for public contract version facts.
3. Read `src/index.ts` when changing schema, validation, canonicalization, or projection behavior.
4. Read matching package-local tests when changing behavior.

## Rules

- Keep control-plane records flat.
- Keep runtime execution outside this package.
- Import runtime contracts from `@dpeek/formless-instance-control-plane`.
- Import reusable authoring modules from `@dpeek/formless-instance-control-plane/schema`.
- Do not add client, React, Worker, Node, or sidecar subpaths.
- Do not deep-import `lib/instance-control-plane/src/*` from external runtime code.
- Do not import bundled domain schemas, React, filesystem APIs, provider SDKs, or Worker adapters.
- Keep package tests fast, deterministic, and local.
- Do not call live networks, Cloudflare APIs, provider APIs, or a dev server from package tests.
