# Workspace Operations and Browser Error Boundaries

Status: backlog. This is not shipped behavior. Shipped behavior lives in
`openspec/specs/*/spec.md`.

## Purpose

Simplify local workspace operation execution and remove arbitrary diagnostic
strings from every browser-visible management boundary.

The target architecture keeps real, stepped Push progress while separating:

- typed domain execution and results;
- sidecar-lifetime operation observation;
- local diagnostic logging;
- Gateway transport contracts;
- browser-owned presentation copy;
- renderer-neutral presentation contracts.

## Problem

`WorkspaceOperationState` currently combines several responsibilities:

- queued, running, succeeded, and failed execution lifecycle;
- generic input and result display objects;
- arbitrary summaries, fields, steps, details, logs, and errors;
- external-authorization events;
- CLI formatting input;
- Gateway polling state;
- browser presentation input;
- persisted operation snapshots under `.formless/operations`.

The Gateway aliases most of this state into its browser response. Browser
runtime then infers presentation meaning from arbitrary summary, step, result,
and error strings. Instance management applies `displaySafeText()` before
publishing renderer-neutral contracts.

Regex redaction cannot make arbitrary diagnostics safe. Browser and renderer
contracts should not receive data that requires diagnostic sanitization.

Relevant current implementation includes:

- `lib/workspace/src/types.ts`
- `lib/workspace/src/operation-state.ts`
- `lib/workspace/src/node.ts`
- `lib/gateway/src/types.ts`
- `lib/gateway/src/client.ts`
- `lib/gateway/src/response-safety.ts`
- `lib/gateway/src/sidecar.ts`
- `lib/formless/src/cli/instance-workspace-operations.ts`
- `lib/formless/src/cli/instance-workspace-operation-handlers.ts`
- `lib/formless/src/cli/instance-workspace-source-sync-operation.ts`
- `lib/formless/src/cli/instance-workspace-deployment.ts`
- `lib/formless/src/cli/instance-workspace-credential-setup.ts`
- `lib/formless/src/cli/workspace-gateway-operation-adapter.ts`
- `lib/formless/src/cli/workspace-gateway-auto-save.ts`
- `lib/formless/src/cli/cli-workspace-command-adapter.ts`
- `lib/formless/src/cli/cli-workspace-operation-formatter.ts`
- `lib/formless/src/client/workspace-operation-runtime.ts`
- `lib/formless/src/client/operation-control-controller.ts`
- `lib/formless/src/client/app-installs.ts`
- `lib/formless/src/client/sync.ts`
- `lib/formless/src/app/routes/home.tsx`
- `lib/formless/src/app/routes/instance-shell.tsx`
- `lib/formless/src/app/routes/instance-management-runtime.tsx`
- `lib/formless/src/app/routes/instance-management-projection.ts`
- `lib/formless/src/app/routes/instance-management-display-safety.ts`
- `lib/formless/src/worker/instance-app-installs.ts`
- `lib/formless/src/worker/instance-control-plane.ts`

## Confirmed Direction

1. Remove `displaySafeText()` entirely.
2. Do not send diagnostic strings, logs, commands, paths, raw input, adapter
   output, provider output, or arbitrary result objects to the browser.
3. Keep internal exceptions and diagnostic logs local to the sidecar and CLI.
4. Use operation-specific typed domain results.
5. Keep the browser Gateway operation surface Push-only. Status and auto-save
   remain separate non-operation capabilities.
6. Support real coarse-grained Push progress through the existing generated
   long-running operation UX.
7. Keep current and latest Push observation only for the lifetime of the
   sidecar process.
8. Do not recover or resume Push after sidecar restart.
9. Delete `.formless/operations` persistence and operation history.
10. Delete auto-save persistence. A sidecar restart does not resume a queued or
    failed auto-save from the prior process.
11. Support external authorization and Cloudflare account selection as typed
    waiting interactions on the active Push.
12. Use typed browser failure codes at Gateway, app-install, control-plane,
    identity/access, generated-operation, deployment-observation, and
    management boundaries.
13. Do not add a backwards-compatibility layer for the superseded contracts.

## Current Requirements

### CLI

CLI Pull, Push, Check, Status, Save, and credential commands require final typed
results and local diagnostics. They do not require browser presentation state,
polling by operation id, page-reload recovery, process-restart recovery, or
operation history.

CLI formatters should consume typed results directly. They should not infer
outcomes from generic `summary.fields`, `details`, deployment display objects,
or persisted error arrays.

### Push progress

The generated operation controller and Formless Renderer presentation already
support ordered progress steps. Runtime adapters can call `reportProgress`,
generated operation state retains those updates, and the Formless Renderer
renders pending progress.

Production Gateway Push does not currently feed that capability correctly. The
Gateway start path awaits the complete Push before returning its operation id,
and `pushFormlessInstanceWorkspace()` has no progress observer. Persisted queued
and running snapshots therefore do not provide meaningful browser progress.

This proposal preserves the existing UX and adds real production
instrumentation.

### External authorization

Credential setup can currently return an external-authorization event and an
in-memory continuation. The continuation, not the persisted operation file, is
what enables asynchronous completion. It cannot survive process restart.

Instance management currently searches for authorization on Push, while the
event is produced by a separate credential-setup operation. Push should own
credential preflight and expose authorization as one waiting state of the same
Push.

### Account selection

Cloudflare credential setup already discovers a narrow account shape containing
an id, optional name, and `workers.dev` subdomain. The CLI can select an account
and rerun credential setup with the selected id.

The browser needs the same decision point, but it should not accept arbitrary
provider account ids. The sidecar should retain the real ids and expose
operation-scoped choice handles.

### Operation persistence

No current production consumer requires operation history.
`listWorkspaceOperationStates()` has no known production caller. Persisted
running state has no resumable continuation, startup reconciliation, cleanup,
or browser discovery path. After restart it can only leave a stale snapshot.

`.formless/operations` does not provide useful recovery and should be deleted.

### Auto-save persistence

Auto-save uses a separate scheduler and state file. Its persisted state does not
cause queued work to resume automatically after sidecar restart.

The target scheduler is in-memory. Browser-visible auto-save state is semantic
and process-local. If the process exits before a queued save completes, that
save is not resumed. A later committed browser write schedules a new save.

## Target Ownership

| Owner                                     | Responsibilities                                                                                                                                                     |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace package                         | Shared semantic operation inputs and identities only where multiple runtimes need them. No display vocabulary, logs, errors, summaries, or persisted browser state.  |
| CLI/runtime domain                        | Typed Push, Pull, Check, Status, Save, deployment, and credential results; execution orchestration; local exceptions and diagnostics; semantic Push progress events. |
| Gateway package                           | Push status, waiting interactions, transport failure codes, active-operation reads, and auto-save status.                                                            |
| Deploy and control-plane packages         | Semantic deployment observation status, outcome, and failure codes. No arbitrary observed summary or error.                                                          |
| Browser runtime                           | Gateway polling, interaction submission, semantic code and phase mapping, and source-owned presentation copy.                                                        |
| Formless Renderer contract and projection | Final renderer-neutral progress, interaction, status, and feedback facts. No runtime diagnostics.                                                                    |

## Typed Domain Execution

Prefer operation-specific executors and result types. An illustrative type map
is:

```ts
type WorkspaceOperationResultByKind = {
  init: InitFormlessInstanceWorkspaceResult;
  status: FormlessInstanceWorkspaceStatusResult;
  save: SaveLocalFormlessWorkspaceResult;
  check: CheckLocalFormlessWorkspaceResult;
  pull: PullFormlessInstanceWorkspaceResult;
  push: PushFormlessInstanceWorkspaceResult;
  deploymentRefresh: RefreshDeploymentObservationResult;
  credentialSetup: CredentialSetupResult;
};

function executeWorkspaceOperation<K extends WorkspaceOperationKind>(
  input: WorkspaceOperationInputFor<K>,
): Promise<WorkspaceOperationResultByKind[K]>;
```

Exact exported names should follow the existing domain result types rather than
introducing aliases solely for this proposal.

The generic operation runner, generic display objects, and generic CLI
formatter input disappear once their callers consume typed results.

## Real Push Progress

Push execution should accept a narrow semantic observer:

```ts
type WorkspacePushPhase =
  | "credentials"
  | "workspace-plan"
  | "provider-apply"
  | "source-plan"
  | "source-validate"
  | "source-apply"
  | "finalize";

type WorkspacePushProgressEvent = {
  phase: WorkspacePushPhase;
  status: "running" | "succeeded" | "failed" | "skipped";
};

type PushWorkspaceOptions = {
  onProgress?: (event: WorkspacePushProgressEvent) => void;
};
```

Emit progress around real awaited boundaries:

- credential preflight, authorization, and account readiness;
- workspace and deployment planning;
- provider reconciliation when required;
- source archive construction and sync planning;
- remote dry-run validation when required;
- Program source restore when required;
- deployment observation and cleanup.

The phase list is ordered by first emission, not by a fixed assumed sequence.
Provider reconciliation can occur at different points for new and existing
targets. Optional phases can be omitted or explicitly skipped when that improves
the completed presentation.

Progress reporting is synchronous, best-effort, and unable to fail the domain
operation. The domain event contains no label, detail, error, operation id, or
browser contract.

Browser runtime maps phase ids to source-owned presentation:

- `credentials` -> `Check Cloudflare access`
- `workspace-plan` -> `Check workspace`
- `provider-apply` -> `Update target runtime`
- `source-plan` -> `Plan source changes`
- `source-validate` -> `Validate source changes`
- `source-apply` -> `Apply source changes`
- `finalize` -> `Finish Push`

These strings originate in browser presentation code. They are not transported
from the sidecar.

## Sidecar Push Registry

Because the Gateway surface is Push-only and only one Push should run for one
workspace at a time, use one process-local current-operation slot rather than a
generic history registry:

```ts
type PushRegistry = {
  current?: {
    id: string;
    status: WorkspaceGatewayPushStatus;
    interaction?: InternalPushInteraction;
    continuation?: () => Promise<void>;
  };
};
```

Behavior:

1. Start allocates an operation id, registers queued state, starts execution,
   and returns immediately.
2. Starting while a Push is active returns that active Push instead of starting
   a second one.
3. Progress events update semantic phase state synchronously.
4. Polling by operation id reads the current slot.
5. Gateway status includes the current Push so a page reload can rediscover it.
6. The latest terminal Push remains available until the next Push or sidecar
   exit.
7. A new Push replaces the previous terminal Push.
8. Sidecar restart clears all Push state and continuations.
9. No list, history, retention, cleanup, or operation filesystem adapter exists.

The exact HTTP paths can follow the existing Gateway routing shape. The public
capabilities are start Push, read Push, submit Push interaction, read Gateway
status, enqueue auto-save, and read auto-save status.

## Gateway Push Contract

An illustrative semantic response is:

```ts
type WorkspaceGatewayPushStatus = {
  id: string;
  operation: "push";
  lifecycle: "queued" | "running" | "waiting" | "succeeded" | "failed";
  phases: readonly {
    phase: WorkspacePushPhase;
    status: "pending" | "running" | "waiting" | "succeeded" | "failed" | "skipped";
  }[];
  interaction?: WorkspaceGatewayPushInteraction;
  outcome?: "applied" | "no-changes" | "planned";
  failure?: {
    code: WorkspaceGatewayPushFailureCode;
    retryable: boolean;
  };
};
```

The response does not contain:

- input or command data;
- logs or exception messages;
- filesystem paths;
- raw adapter or provider output;
- account tokens or provider bearer material;
- generic summaries or fields;
- arbitrary labels or details;
- generic result or deployment display objects.

The existing generated operation UX does not need to gain a distinct waiting
status initially. Browser runtime can map Gateway `waiting` to a pending
generated operation with the current step still active, while the interaction
prompt communicates why execution is waiting.

## Waiting Interactions

Model authorization and account selection as a typed union on the active Push:

```ts
type WorkspaceGatewayPushInteraction =
  | {
      kind: "external-authorization";
      interactionId: string;
      provider: "cloudflare";
      action: {
        kind: "open-url";
        url: string;
      };
    }
  | {
      kind: "account-selection";
      interactionId: string;
      provider: "cloudflare";
      choices: readonly {
        choiceId: string;
        label: string;
        detail?: string;
      }[];
    };
```

Authorization URLs are deliberate actions. Validate the exact provider,
scheme, host, and allowed path at the producing boundary, and validate again in
the browser runtime before opening.

### Account-selection interaction

When Cloudflare returns multiple accounts:

1. The sidecar mints stable choice ids scoped to the active interaction.
2. It retains `choiceId -> CloudflareAccountId` privately in the registry.
3. The Gateway returns only choice id, bounded label, and optional bounded
   supporting detail.
4. The browser never submits a provider account id.
5. Submission includes operation id, interaction id, and choice id.
6. The sidecar verifies all three against the current waiting operation.
7. It reruns typed credential completion with the retained account id.
8. The same Push resumes.

Default option presentation should use the Cloudflare account name when
present, with the `workers.dev` subdomain as supporting detail. These are
intentional provider facts needed for a user choice, not diagnostic strings.
Validate their type and maximum size at the provider boundary.

### Formless Renderer account-selection UX

Replace the management contract's specialized authorization-only field with one
operation-interaction union. The presentation union should support:

- external authorization with one action button;
- controlled single selection with options and a Continue button.

The pending Push card keeps showing operation progress. When account selection
is required, it additionally shows:

- `Choose a Cloudflare account`;
- a Selector using bounded account options;
- optional supporting subdomain text;
- a disabled Continue button until a choice is selected.

The `@dpeek/formless-renderer` package already uses its Selector primitive in the
management install dialog. The operation interaction should reuse that
primitive rather than introduce a provider-specific renderer.

The route runtime owns ephemeral selected-choice draft state. It resets the
draft when the interaction id changes. Selection-change and submit are typed
management intents. The renderer receives neither callbacks nor provider ids.

## Gateway Transport Failures

Replace `{ error: string }` with a semantic envelope:

```ts
type WorkspaceGatewayErrorBody = {
  code:
    | "invalid-request"
    | "authentication-required"
    | "authorization-expired"
    | "forbidden"
    | "csrf-invalid"
    | "not-found"
    | "operation-not-found"
    | "interaction-expired"
    | "invalid-interaction-choice"
    | "sidecar-unavailable"
    | "method-not-allowed"
    | "unknown";
  retryable?: boolean;
};
```

HTTP status remains meaningful. Gateway client behavior branches on `code`,
not `Error.message` text. Unknown responses map to `unknown`; their raw bodies
are not propagated into browser state.

## Other Browser Error Boundaries

The same rule applies outside Push.

### App installs

Reuse `AppInstallRegistryErrorCode` for known registry failures. The HTTP
envelope can add boundary codes such as `invalid-request`, `unauthorized`,
`unavailable`, and `unknown`, plus the existing bounded field name when useful.

Both initial install loading and install submission expose codes, not caught
messages.

### Control-plane bootstrap and hydration

Use a small management-data failure union such as:

```ts
type ManagementDataFailure = {
  code:
    | "unauthorized"
    | "unavailable"
    | "incompatible-client"
    | "local-storage-unavailable"
    | "invalid-response"
    | "unknown";
  retryable: boolean;
};
```

Hydration and bootstrap may retain different local diagnostic logs. Management
projection maps their semantic failures to source-owned copy.

### Generated operation controller

Runtime adapters and Authority submission should not turn arbitrary caught
`Error.message` values into `GeneratedOperationExecutionResult.displayError`.
Known operation responses map to known presentation; unknown exceptions map to
generic failure copy.

### Identity and access

Initial access loading, invitations, revocations, and session operations should
use typed or generic failure codes. They should not rely on
`displaySafeText(error.message)` in the instance shell.

### Deployment observation

Replace or exclude browser-visible `observedSummary`, `observedError`, and any
renderer-unused runner diagnostic fields. Browser projections should carry a
semantic observation status, outcome, and known failure code only.

### Intentional display data

User-authored labels, names, and email addresses are presentation data and can
render directly. React escaping prevents markup injection. It does not make
diagnostic strings appropriate for a browser contract, and diagnostic
redaction should not be applied to intentional user data.

## Auto-Save

Auto-save calls the typed Save domain operation directly. It does not create a
generic workspace operation.

Browser-visible state is:

```ts
type WorkspaceGatewayAutoSaveStatus = {
  state: "clean" | "queued" | "saving" | "saved" | "failed";
  failure?: {
    code: "save-failed";
    retryable: true;
  };
};
```

Generations, storage identities, write sources, filesystem state, and
diagnostic messages remain internal. Delete the persisted auto-save state and
its parser, writer, and startup read behavior.

## Presentation Projection

Browser runtime owns exhaustive mappings from semantic facts to copy:

- Gateway error code -> feedback title and detail;
- Push phase -> progress label;
- Push lifecycle and outcome -> operation result copy;
- Push failure code -> generic or known recovery guidance;
- app-install code and bounded field -> validation or feedback;
- management-data code -> load failure presentation;
- deployment observation code -> observation presentation.

Formless Renderer contracts receive only the mapped presentation facts. Once
every input is structural and semantic, delete:

- `lib/formless/src/app/routes/instance-management-display-safety.ts`;
- `displaySafeText()` calls and tests;
- arbitrary error precedence and string inference in workspace operation
  runtime;
- redaction tests that attempt to prove arbitrary nested strings safe.

Move `fieldKeyLabel` to a neutral presentation helper if it remains useful. It
is a label formatter, not a safety boundary.

## Deletion Targets

Likely deletions include:

- `WorkspaceOperationState`;
- generic operation display value and display object types;
- generic operation summary, log, error, step, event, and result types;
- operation-state initialization, transition, parsing, redaction, and
  formatting helpers;
- `.formless/operations` paths and create/read/list/update/write adapters;
- generic operation runner persistence;
- generic CLI operation formatter inputs and arbitrary field formatters;
- Gateway aliases of Workspace internal state;
- `{ error: string }` browser responses;
- browser inference from arbitrary summary, step, result, and error strings;
- auto-save state persistence;
- compatibility tests and parsing for the deleted formats.

Retain provider URL validation as a narrow authorization-action validator, not
as general display sanitization.

## Canonical Spec Changes at Implementation Time

Do not edit canonical specs merely to record this backlog. When implementation
begins, update shipped or desired facts in:

- `openspec/specs/local-workspace-gateway/spec.md`
- `openspec/specs/formless-cli/spec.md`
- `openspec/specs/generated-ui/spec.md`
- `openspec/specs/deployment-runtime/spec.md`
- `openspec/specs/instance-control-plane/spec.md`
- `openspec/specs/package-slices/spec.md`
- `openspec/specs/portable-archives/spec.md`

Remove claims that Workspace owns display-safe logs and summaries, that
operation files provide browser refresh recovery, or that browser safety is
achieved through string redaction. Add semantic Push progress, process-lifetime
recovery, waiting interaction, typed failure, and typed result facts.

## Ordered Implementation Slices

Treat this as one coherent workstream. Partial completion must not leave a route
where arbitrary diagnostics can enter renderer contracts.

### 1. Semantic browser failures

- Add typed Gateway transport errors.
- Add typed app-install API errors.
- Add typed control-plane bootstrap and hydration errors.
- Remove raw generated-operation and identity/access exception forwarding.
- Replace deployment observation diagnostic strings.
- Map all codes to browser-owned copy.

### 2. Typed domain results and CLI

- Introduce or expose operation-specific executor results.
- Convert CLI adapters and formatters to typed results.
- Convert auto-save to typed Save execution.
- Stop producing generic summaries and display objects for these consumers.

### 3. Real Push observation

- Add semantic progress events to Push execution.
- Add the process-local single Push registry.
- Make Gateway Push start return before execution completes.
- Poll actual intermediate phase state.
- Rediscover the current Push after page reload through Gateway status.

### 4. Waiting interactions and renderer UX

- Move credential preflight into Push orchestration.
- Expose typed authorization waiting state.
- Add operation-scoped account choice handles and submission.
- Extend the Formless Renderer management contract with the
  operation-interaction union.
- Add account Selector and Continue behavior to the pending Push card.

### 5. Remove superseded state

- Delete `displaySafeText()` and related tests.
- Delete `WorkspaceOperationState` and generic display vocabulary.
- Delete `.formless/operations` persistence and state adapters.
- Delete auto-save persistence.
- Remove unused non-Push Gateway operation bindings.
- Update canonical specs and package agent ownership facts.

## Validation

Tests should establish structural safety and observable behavior:

- Gateway Push start returns queued or running before a controlled long-running
  executor completes.
- Each controlled executor boundary produces the expected semantic phase.
- Browser polling updates the existing generated progress contract.
- A reloaded client rediscovers the current Push from the same sidecar.
- A new registry has no state from a prior process.
- Only one Push runs at a time.
- Authorization waits and resumes the same Push.
- One Cloudflare account is selected automatically.
- Multiple accounts produce bounded choices and no provider account ids.
- Invalid or expired choice submissions return semantic error codes.
- Account selection resumes the same Push.
- Unknown exceptions become `unknown` without their message appearing in the
  serialized response or renderer contract.
- App-install, control-plane, identity/access, generated-operation, deployment,
  and auto-save failures do not expose arbitrary messages.
- CLI output remains source-faithful to typed results.
- No `.formless/operations` or persisted auto-save state is created.

Run `bun check:packages` and browser smoke for Push progress, authorization,
selection, success, no-change, failure, reload, and unavailable-sidecar states.

## Explicit Non-Goals

- Cross-process Push recovery or continuation.
- Generic operation history.
- Browser-visible diagnostic logs.
- Arbitrary provider diagnostic presentation.
- Push cancellation unless separately required.
- Multiple concurrent Push operations for one workspace.
- Backwards-compatible parsing of deleted operation or auto-save state.
- A generic workflow engine for all CLI commands.
