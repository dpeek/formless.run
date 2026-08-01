# Formless Workspace Agents

Package scope: `@dpeek/formless-workspace`.

Read this when editing `lib/workspace/*`.

## Owns

- Public workspace configuration, state, and operation contract declarations and constants in `src/types.ts`.
- Runtime-neutral workspace configuration, operation, redaction, parse, format, and validation helpers exported from the package root.
- Local Node filesystem adapters for Program storage snapshots, media payloads, ignored local state, secret state, and operation state.
- Canonical semantic operation input, result, event, log, summary, redaction, and persistence contracts used by Gateway transport and CLI runtime adapters.
- Package-local tests for workspace contracts and deterministic Node adapters.

## Does Not Own

- CLI command parsing or terminal output.
- Browser UI.
- Gateway route constants, HTTP transport, response wrappers, proxy checks, or authorization.
- Owner session cookies or runtime topology selection.
- Authority storage, browser replica state, app records, bundled app schemas, or control-plane mutation execution.
- Archive remote APIs, deployment provider execution, credential setup execution, Cloudflare mutation, or Alchemy state.

## Map

- `package.json`: public exports for `.` and `./node`.
- `tsconfig.json`: package-local TypeScript project extending the repo config.
- `src/types.ts`: import-free versioned public contract declarations.
- `src/config.ts`: typed configuration authoring, default resolution, and operational path validation.
- `src/operation-state.ts`: runtime-neutral operation kind, display, state, and redaction helpers.
- `src/index.ts`: runtime-neutral root export entrypoint.
- `src/node.ts`: local Node filesystem, workspace state, storage snapshot, media payload, ignored-state, and secret-state adapter entrypoint; no React import.
- `src/*.test.ts`: package-local contract and adapter coverage.

## Read Path

1. Read this file.
2. Read `src/types.ts` for public contract facts.
3. Read only the relevant helper or adapter file for the task: `src/config.ts`, `src/operation-state.ts`, or `src/node.ts`.
4. Read matching package-local tests when changing behavior.

## Rules

- Keep app records flat.
- Keep root and type entrypoints runtime-neutral.
- Keep CLI policy, Gateway transport, runtime storage, provider execution, and app records outside this package.
- Import this package from public subpaths only: `@dpeek/formless-workspace` or `@dpeek/formless-workspace/node`.
- Do not deep-import `lib/workspace/src/*` from external runtime code.
- Keep package tests fast and local. Use fake filesystems or temporary directories, fixed ids, fixed clocks, and fixed payloads.
- Do not call live networks, Cloudflare APIs, provider APIs, or a dev server from package tests.
