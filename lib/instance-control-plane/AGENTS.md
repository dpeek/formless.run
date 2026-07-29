# Formless Instance Control Plane Agents

Package scope: `@dpeek/formless-instance-control-plane`.

Read this when editing `lib/instance-control-plane/*`.

## Owns

- Instance control-plane schema keys, storage identity constants, and API route constants.
- Control-plane entity names, entity value contracts, schema contract, and route helpers.
- Runtime-neutral app-install projection helpers.
- Reviewable control-plane record validation, display-safe canonicalization, and storage snapshot validation.
- Package-local deterministic instance control-plane contract tests.

## Does Not Own

- App install mutation execution, owner authorization, or Authority writes.
- Browser replica state, Durable Object storage, sync, reset, restore execution, or runtime protocol handlers.
- Bundled Site, Tasks, CRM manifests, package registry defaults, or source schema JSON.
- Deployment provider execution, credential resolution, operation history, or provider resource truth.
- React UI, Worker routes, Node adapters, provider SDKs, or filesystem APIs.

## Map

- `package.json`: package metadata and the root public export for `@dpeek/formless-instance-control-plane`.
- `tsconfig.json`: package-local TypeScript project extending the repo config.
- `src/types.ts`: public contract version declaration.
- `src/index.ts`: runtime-neutral package root entrypoint and pure helpers.
- `src/*.test.ts`: package-local contract and helper coverage.

## Read Path

1. Read this file.
2. Read `src/types.ts` for public contract version facts.
3. Read `src/index.ts` when changing schema, validation, canonicalization, or projection behavior.
4. Read matching package-local tests when changing behavior.

## Rules

- Keep control-plane records flat.
- Keep runtime execution outside this package.
- Import this package from the public root only: `@dpeek/formless-instance-control-plane`.
- Do not add client, React, Worker, Node, or sidecar subpaths.
- Do not deep-import `lib/instance-control-plane/src/*` from external runtime code.
- Do not import bundled app schemas, runtime package registries, React, filesystem APIs, provider SDKs, or Worker adapters.
- Keep package tests fast, deterministic, and local.
- Do not call live networks, Cloudflare APIs, provider APIs, or a dev server from package tests.
