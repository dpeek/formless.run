# Formless Identity Control Plane Agents

Package scope: `@dpeek/formless-identity-control-plane`.

Read this when editing `lib/identity-control-plane/*`.

## Owns

- Identity boundary schema key and capability API route constants.
- Identity entity names, first-pass runtime role keys, and public contract
  version declarations.
- Runtime-neutral identity schema contracts and pure helpers as they are added.
- Package-local deterministic identity control-plane contract tests.

## Does Not Own

- Owner setup, owner sessions, admin bearer authorization, or route access
  policy.
- Passkey credentials, challenges, token hashes, central sessions, host
  sessions, grants, recovery secrets, provider responses, or revocation rows.
- Authority writes, browser replica state, sync, Worker routes, React UI, Node
  adapters, provider SDKs, or filesystem APIs.

## Map

- `package.json`: package metadata plus root and runtime-neutral `./schema`
  public exports.
- `tsconfig.json`: package-local TypeScript project extending the repo config.
- `src/types.ts`: public contract version, boundary and capability constants,
  entity names, and role key declarations.
- `src/schema.ts`: reusable identity control-plane record and presentation
  schema modules plus the complete App schema source.
- `src/index.ts`: runtime-neutral package root entrypoint.
- `src/*.test.ts`: package-local contract and helper coverage.

## Read Path

1. Read this file.
2. Read `src/types.ts` for public contract facts.
3. Read `src/schema.ts` when changing source schema contracts.
4. Read `src/index.ts` when changing root exports or pure helper behavior.
5. Read matching package-local tests when changing behavior.

## Rules

- Keep identity records flat and reviewable.
- Keep private auth state outside identity control-plane records.
- Keep runtime execution outside this package.
- Import runtime contracts from `@dpeek/formless-identity-control-plane`.
- Import reusable authoring modules from
  `@dpeek/formless-identity-control-plane/schema`.
- Do not add client, React, Worker, Node, or sidecar subpaths.
- Do not deep-import `lib/identity-control-plane/src/*` from external runtime
  code.
- Do not import app records, React, filesystem APIs, provider SDKs, Worker
  adapters, or auth runtime storage.
- Keep package tests fast, deterministic, and local.
- Do not call live networks, Cloudflare APIs, provider APIs, or a dev server
  from package tests.
