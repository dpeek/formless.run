# Downstream Compatibility

This file is the operational ledger for projects that consume Formless from a
local checkout before package releases become the dependency boundary.

`Verified` means the recorded consumer revision passed its recorded evidence
against the exact Formless revision. A target revision records upgrade intent
only. Use full Git revisions so every pairing remains reproducible.

| Project | Status | Verified consumer revision | Verified Formless revision | Target Formless revision | Verified |
| --- | --- | --- | --- | --- | --- |
| `verifi-labs.com` | Active; baseline not recorded | Unknown | Unknown | — | Pending |
| `dpeek.com` | Upgrade in progress | Pending | Unknown | `674d05f0efe4ce7a8aa868e7d69c97d2928f29e2` | Pending |
| `codeless.run` | Prospective | — | — | — | — |

## verifi-labs.com

- Repository: `../verifi-labs.com`
- Linked packages: `@dpeek/formless`,
  `@dpeek/formless-public-operations`, and `@dpeek/formless-site-app`.
- Consumer seams: `formless.ts`, the domain schema, saved `state/`, Site
  composition, and public operations.
- Verification evidence: define and record exact commands during the first
  baseline verification.
- Migration to Formless `main`: establish a verified baseline before recording
  a target or summarising its remaining delta.

## dpeek.com

- Repository: `../dpeek.com`
- Linked packages: currently being settled by the in-progress upgrade.
- Consumer seams: `formless.ts`, Site composition, and saved `state/`.
- Verification evidence: pending completion of the upgrade to
  `674d05f0efe4ce7a8aa868e7d69c97d2928f29e2`.
- Migration to target: in progress. Record only remaining consumer-specific
  actions discovered during the upgrade.

## codeless.run

- Repository: `../codeless.run`
- Status: it does not currently consume Formless.
- Create a verified entry only when it gains an actual Formless dependency.

## Upgrade Procedure

1. Preserve existing work in both repositories and record the exact Formless
   target revision before changing the consumer.
2. Read the structured Formless commit messages between the last verified
   revision and the target:

   ```sh
   git -C ../formless.run log --first-parent --format='%H%n%B%n---' <verified-revision>..<target-revision>
   ```

3. Inspect the delta for the packages and consumer seams listed above. Keep the
   migration summary limited to required consumer code, saved state, deployment,
   or operator actions.
4. Update the consumer while its local `link:` dependencies resolve to the
   recorded Formless target.
5. Run and record consumer-specific type, build, configuration-load, state, and
   smoke checks. Dependency installation alone is not verification.
6. Commit the consumer, then update this ledger with both full revisions, the
   verification date and commands, and any remaining migration work.

Do not advance a verified revision for an in-progress or partially checked
upgrade. Do not duplicate the full upstream changelog here; Formless change
commit metadata remains the detailed source.
