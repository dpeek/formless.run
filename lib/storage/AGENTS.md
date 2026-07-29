# Formless Storage Agents

Package scope: `@dpeek/formless-storage`.

Read this when editing `lib/storage/*`.

## Owns

- Storage snapshot kind and version constants.
- Storage snapshot envelope contracts and parsing.
- Flat stored-record, record-value, and field-value contracts.
- Runtime-neutral stored-record and record-value predicates.
- Package-local deterministic storage contract tests.

## Does Not Own

- Authority bootstrap, schema storage, change rows, sync protocol, mutation routes,
  reset, restore, Durable Object storage, or browser replica persistence.
- App records or bundled source app packages.
- App schema language parsing beyond consuming the public Schema package parser.
- Archive restore execution, Workspace IO policy, CLI command handling, React UI,
  Worker routes, Node adapters, provider SDKs, or filesystem APIs.

## Map

- `package.json`: package metadata and the root public export for
  `@dpeek/formless-storage`.
- `tsconfig.json`: package-local TypeScript project extending the repo config.
- `src/types.ts`: public storage snapshot and flat stored-record contracts.
- `src/index.ts`: runtime-neutral package root entrypoint and pure parsing helpers.
- `src/*.test.ts`: package-local contract and helper coverage.

## Read Path

1. Read this file.
2. Read `src/types.ts` for public contract facts.
3. Read `src/index.ts` when changing parsing or predicate behavior.
4. Read matching package-local tests when changing behavior.

## Rules

- Keep storage contracts runtime-neutral.
- Import this package from the public root only: `@dpeek/formless-storage`.
- Do not add client, React, Worker, Node, or sidecar subpaths.
- Do not deep-import `lib/storage/src/*` from external runtime code.
- Do not import app records, Durable Object storage, browser state, React,
  filesystem APIs, provider SDKs, or bundled schema JSON files.
- Keep package tests fast, deterministic, and local.
- Do not call live networks, Cloudflare APIs, or a dev server from package tests.
