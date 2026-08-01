# Formless Deploy Agents

Package scope: `@dpeek/formless-deploy`.

Read this when editing `lib/deploy/*`.

## Owns

- Public deployment contract declarations and constants in `src/types.ts`.
- Runtime-neutral control-plane projection helpers exported from the package root.
- Display-safe deployment evidence, drift, actor, action, and secret-reference shapes.
- Client, React, and Worker adapter entrypoint contracts for deployment workflows.

## Does Not Own

- Provider SDK execution.
- Provider credentials or secret values.
- Alchemy provider-state storage.
- Program records or Authority storage implementation.
- Generic generated UI layout or field commit behavior.

## Map

- `package.json`: public exports for `.`, `./client`, `./react`, and `./worker`.
- `tsconfig.json`: package-local TypeScript project extending the repo config.
- `src/types.ts`: import-free versioned public contract declarations.
- `src/index.ts`: runtime-neutral root entrypoint and pure helpers.
- `src/client.ts`: browser/client protocol adapter entrypoint; no React import.
- `src/react.tsx`: React adapter entrypoint; no generated UI import.
- `src/worker.ts`: Worker/runtime adapter entrypoint; no React import.
- `src/*.test.ts`: package-local contract and projection coverage.

## Read Path

1. Read this file.
2. Read `src/types.ts` for public contract facts.
3. Read only the relevant entrypoint for the task.
4. Read matching package-local tests when changing behavior.

## Rules

- Keep app records flat.
- Keep root and type entrypoints runtime-neutral.
- Store secret references only; never store secret values.
- Keep provider resource truth outside package records and projection outputs.
- Import this package from public subpaths only: `@dpeek/formless-deploy`, `@dpeek/formless-deploy/client`, `@dpeek/formless-deploy/react`, or `@dpeek/formless-deploy/worker`.
- Do not deep-import `lib/deploy/src/*` from external runtime code.
- Keep package tests fast and deterministic.
