# Formless Schema Agents

Package scope: `@dpeek/formless-schema`.

Read this when editing `lib/schema/*`.

## Owns

- Public App schema language contract declarations and constants in `src/types.ts`.
- Runtime-neutral schema parsing, stringify behavior, and parser error behavior.
- Schema-local entity key and qualified entity name helpers.
- Field type behavior, field value validation, field catalog, and create-default helpers.
- Query expression helpers and read model numeric and aggregate helpers.
- Runtime schema metadata helpers, action capability helpers, and section parsers.
- Package-local deterministic schema contract and helper tests.

## Does Not Own

- Bundled source app package metadata.
- Source schema JSON loading.
- Schema Builder UI state or generated React rendering.
- Authority table mutation, Durable Object storage, or browser replica persistence.
- Archive restore execution.
- Workspace state, storage snapshot handling, or Gateway transport.
- Instance control-plane runtime execution.
- Package app migrations or provider execution.
- App records.

## Map

- `package.json`: package metadata and the root public export for `@dpeek/formless-schema`.
- `tsconfig.json`: package-local TypeScript project extending the repo config.
- `src/types.ts`: import-free versioned public contract declarations.
- `src/index.ts`: runtime-neutral package root entrypoint and pure helpers.
- `src/*.test.ts`: package-local contract and helper coverage.

## Read Path

1. Read this file.
2. Read `src/types.ts` for public contract facts.
3. Read only the relevant root helper or parser file for the task.
4. Read matching package-local tests when changing behavior.

## Rules

- Keep App schema language contracts runtime-neutral.
- Keep `src/types.ts` import-free.
- Import this package from the public root only: `@dpeek/formless-schema`.
- Do not add client, React, Worker, Node, or sidecar subpaths.
- Do not deep-import `lib/schema/src/*` from external runtime code.
- Keep schema contracts in `lib/schema` public exports.
- Do not add package-owned schema helper modules under `src/shared`.
- Do not import app records, Durable Object storage, browser state, React, filesystem APIs, provider SDKs, or bundled schema JSON files.
- Keep package tests fast, deterministic, and local.
- Do not call live networks, Cloudflare APIs, or a dev server from package tests.

## Test Rules

- Own App schema parsing, stringify and error behavior, field behavior, query
  and read-model helpers, defaults, metadata, and operation capability facts.
- Assert observable public return values, errors, or named schema invariants
  with package-local fixtures. Do not verify Formless runtime behavior here.
- Reject fixture-catalog, source-text, exact-dependency-version,
  implementation-history, and removed-behavior proof.
