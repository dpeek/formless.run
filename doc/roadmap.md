# Roadmap

Last updated: 2026-06-19

Purpose: concise list of possible OpenSpec or Git-backed changes.

This is not shipped behavior. Shipped behavior lives in
`openspec/specs/*/spec.md`.

This is not a commitment. Work starts when a committed OpenSpec or Git-backed
change owns the work.

## Current Focus: CRM Operation Completeness

CRM launch is the forcing function for the operation runtime seam.

1. `center-operations-runtime`: make operations the shared interaction contract
   for schema, Authority, generated UI, and public bindings.
2. `add-launch-crm-app`: add installable CRM app with contacts, audiences,
   campaigns, and broadcasts.
3. `add-crm-public-subscribe-operation`: make CRM own subscribe operation
   writes, audiences, and consent source.
4. `add-site-crm-subscribe-bindings`: let Site subscribe blocks bind to a CRM
   install, audience, and public subscribe operation.
5. `retire-site-owned-subscribers`: move Site away from owning contact
   subscription records.
6. `add-campaign-drafts`: add campaign and message draft records with generated
   operation-bound authoring views.
7. `add-broadcast-recipient-snapshots`: snapshot broadcast recipients from
   audiences or segments.
8. `add-contact-segments`: add segment records and membership or query rules.
9. `add-suppression-preferences`: add unsubscribe, suppression, and
   preference-center records.
10. `add-email-broadcast-operations`: send broadcasts through operation-owned
    queued email work with delivery events.

## Scope Guardrail

Do not add broad platform surfaces while CRM operation completeness is the
forcing function.

Deferred unless a CRM operation proves the primitive is needed:

- workflow engines or durable workflow UI;
- marketplace/package discovery surfaces;
- roles, orgs, groups, or multi-tenant account systems beyond owner sessions;
- AI or agent product surfaces;
- broad provider/deployment management consoles;
- browser rendering, video delivery, or general email product flows.

## Later Candidate Changes

### Apps And Schema

- `improve-reference-authoring`: improve generated reference selection and
  scoped child creation through operation bindings.
- `expand-command-operations`: add more schema-declared command operation kinds
  for one concrete app.
- `expand-query-read-models`: add query or read-model capability required by one
  concrete app.
- `add-board-presentation`: add a schema-backed board result presentation.
- `add-dashboard-presentation`: add schema-backed dashboard or chart result
  presentations.

### Generated UI

- `add-draft-edit-sessions`: add save/cancel edit sessions for generated record
  editing.
- `add-cross-field-validation-ui`: show cross-field validation errors in
  generated forms.
- `add-destructive-operation-confirmation`: add generated confirmation flows for
  destructive operations.
- `improve-create-defaults`: make generated create defaults and scoped creation
  more predictable.
- `improve-generated-states`: improve generated empty, loading, and error
  states.
- `add-app-data-import-export`: add generated import/export operations for app
  data.

### Site

- `add-site-first-run-onboarding`: add first-run onboarding for standalone Site
  projects.
- `add-site-starter-reset`: add trustworthy starter content and reset flows.
- `add-site-theme-settings`: add small schema-backed theme settings.
- `improve-site-content-authoring`: improve page, post, project, header, and
  footer authoring.
- `improve-site-media-replacement`: add media cleanup and replacement flows for
  Site records.
- `improve-site-publish-feedback`: improve publish status, backup, and deploy
  feedback.

### Instance And Deployment

- `add-archive-management-ui`: add browser management UI for portable app and
  instance archives.
- `add-deployment-management-ui`: add browser UI for deploy targets, attempts,
  and drift after an operation requires it.
- `add-provider-credential-setup`: add browser provider configuration and
  least-privilege credential setup after an operation requires it.
- `retire-direct-domain-fallback`: remove duplicate direct Cloudflare domain
  apply paths.
- `add-wildcard-domains`: add wildcard domain mapping and ingress coverage.
- `add-snapshot-backup-restore-ui`: add browser UX for snapshots, backups, and
  restore.
- `add-runtime-observability`: add observability for Authority writes, sync,
  publish, and deploy.
- `add-local-offline-instance-sync`: add local/offline instance sync after
  deployment identity is stable.

### Media

- `add-media-management-ui`: add browser management UI for core media assets.
- `add-video-media-support`: add video upload, storage, delivery, and player
  support through core media after an operation requires it.
- `add-media-provider-adapters`: add provider adapters behind the Media package
  boundary.
- `add-general-media-library`: add a general media library once core ownership
  rules need it.

### Auth, People, And Contacts

- `add-roles-groups-orgs`: add role, group, and organization permission policy
  after owner-session operation policy is insufficient.
- `add-multi-tenant-accounts`: add multi-tenant account routing.
- `harden-admin-token-and-publish`: harden admin bearer and publish boundaries.
- `add-authenticated-operation-policy`: add operation execution for
  passkey-backed owner and user sessions.
- `expand-public-operation-forms`: reuse public operation policy for more
  public forms.
- `add-turnstile-provisioning`: add Turnstile provisioning through
  deployment/runtime configuration.

### Extensibility And New Capabilities

- `add-plugin-view-registry`: add a registry for schema-backed custom view
  presentations.
- `add-custom-result-presentations`: add custom result presentations backed by
  schema-declared views.
- `add-app-marketplace-shape`: define app marketplace/package metadata after
  domain package schema authoring is stable.
- `add-cross-app-references`: add cross-app references or queries when a real
  app needs them.
- `add-job-operation-runners`: add queues, scheduled work, and durable
  operation runners after one app requires them.
- `add-agent-operation-api`: add agent-facing operation routes and audit
  boundaries.
- `add-browser-rendering-operations`: add Browser Rendering capture, preview, or
  document operations after one app requires them.
- `add-ejection-path`: define ejection into a normal Cloudflare project or
  portable package.
