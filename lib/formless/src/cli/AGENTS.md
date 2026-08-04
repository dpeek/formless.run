# Formless CLI Agents

Package scope: `src/cli`.

Read this when editing `src/cli/*`.

## Owns

- Public `formless` command parsing, option syntax, terminal help labels, and dispatch behavior.
- CLI runtime startup, local workspace process control, terminal output, and browser-opening decisions.
- Command and Gateway Push runtime adapters that bind CLI actors to semantic workspace operation metadata.
- CLI workspace domain code for local filesystem effects, process effects, terminal-facing policy, provider adapter assembly, ignored local secret state, and typed workspace execution.
- Focused CLI-internal workspace domains for source sync, target/context resolution, provider credential resolution, deployment execution, deployment refresh, destroy, and operation-body tests.

## Does Not Own

- Browser UI, generated React surfaces, or app shell rendering owned by `src/app`.
- Worker runtime routes, Authority storage, sync protocol handlers, or Durable Object execution owned by `src/worker`.
- Runtime-neutral workspace source, manifest, operation, redaction, parse, format, validation, and deterministic Node adapter contracts owned by `lib/workspace`.
- Gateway transport, proxy, auth, sidecar contracts, request and response wrappers, and display-safe operation transport shapes owned by `lib/gateway`.
- Gateway-owned code does not own CLI operation bodies, workspace source mutation, provider mutation, ignored secret writes, or terminal formatting.

## Boundaries

- Keep CLI command binding and terminal formatting in CLI-owned modules.
- Keep operation body behavior grouped by CLI execution domain rather than by command spelling.
- Keep source sync code behind narrow target, account, bearer-token, and deployment-facing interfaces.
- Keep provider OAuth token storage, authorization callbacks, ignored secret files, and provider profile details out of source sync, Gateway, and terminal formatting code.
- Keep broad compatibility entrypoints thin while callers, operation handlers, and tests move to focused CLI domain modules.

## Map

- `cli.ts` and `cli-command.ts`: public command parsing, help, and dispatch.
- `package-commands.ts`: package command entrypoints.
- `instance-workspace-source-sync.ts` and `instance-workspace-deployment.ts`: typed workspace source and deployment execution.
- `instance-target-context.ts` and `instance-target-client.ts`: target selection, target facts, and instance protocol access.
- `instance-workspace-credential-setup.ts`, `cloudflare-oauth.ts`, and provider runner modules: credential and provider adapter assembly.
- `archive-*`, `upgrade-*`, and runtime extension modules: CLI-owned workflow helpers for workspace source, archives, upgrades, and deploy code setup.
- `*.test.ts` and `*.test.tsx`: CLI behavior and integration coverage.

## Read Path

1. Read this file.
2. Read the relevant `openspec/specs/formless-cli/spec.md` requirement.
3. Read only the CLI module and focused tests needed for the selected task.
4. Read `lib/workspace/AGENTS.md` or `lib/gateway/AGENTS.md` only when editing those package paths.

## Rules

- Keep app records flat.
- Keep public CLI behavior stable unless the selected spec or task changes it.
- Do not put CLI command names, terminal output, provider execution, or workspace execution policy into `lib/workspace`.
- Do not put CLI operation bodies, provider mutation, filesystem writes, or ignored secret storage into `lib/gateway`.
- Do not import browser UI from CLI runtime modules.
- Do not import Worker runtime internals when the instance protocol, workspace contract, or Gateway adapter boundary is enough.
