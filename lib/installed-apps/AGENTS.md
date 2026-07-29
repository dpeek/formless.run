# Formless Installed Apps Agents

Package scope: `@dpeek/formless-installed-apps`.

Read this when editing `lib/installed-apps/*`.

## Owns

- App install id validation and flat installed-app metadata contracts.
- App package manifest contracts, parsing, and resolver behavior.
- Package app revision and source schema hash contracts.
- Runtime-neutral deterministic source schema hash helpers.
- Package-local deterministic installed-app and app-package contract tests.

## Does Not Own

- Bundled Site, Tasks, or CRM manifest composition.
- Bundled source schema JSON or package-specific runtime adapters.
- Authority storage, browser replica state, app records, route mutation execution,
  React UI, Worker routes, Node adapters, provider SDKs, or filesystem APIs.
- Upgrade migration registry ownership beyond shared package revision and source
  schema hash contracts.

## Map

- `package.json`: package metadata and the root public export for
  `@dpeek/formless-installed-apps`.
- `tsconfig.json`: package-local TypeScript project extending the repo config.
- `src/types.ts`: public installed-app, app-package, revision, and source hash
  contracts.
- `src/index.ts`: runtime-neutral package root entrypoint and pure helpers.
- `src/*.test.ts`: package-local contract and helper coverage.

## Read Path

1. Read this file.
2. Read `src/types.ts` for public contract facts.
3. Read `src/index.ts` when changing parsing, resolver, validation, or hashing
   behavior.
4. Read matching package-local tests when changing behavior.

## Rules

- Keep installed-app contracts runtime-neutral.
- Import this package from the public root only:
  `@dpeek/formless-installed-apps`.
- Do not add client, React, Worker, Node, or sidecar subpaths.
- Do not deep-import `lib/installed-apps/src/*` from external runtime code.
- Do not import bundled app schemas, app records, React,
  filesystem APIs, provider SDKs, or runtime adapter registries.
- Keep package tests fast, deterministic, and local.
- Do not call live networks, Cloudflare APIs, or a dev server from package
  tests.
