# Media Package Specification

## Purpose

The Media package owns reusable image and document media contracts, pure
helpers, and runtime adapters for Formless core media behavior. App schemas and
runtimes keep app records, trusted field policy, usage metadata, authorization,
and generic generated UI behavior outside the package.

## Requirements

### Requirement: Media Package Shape

The system SHALL provide a Media package under `lib/media/`.

#### Scenario: Media package files

- GIVEN the Media package is scaffolded
- WHEN package files are present
- THEN it contains `AGENTS.md`, `package.json`, `tsconfig.json`,
  `src/types.ts`, `src/index.ts`, `src/client.ts`, and `src/worker.ts`
- AND it exposes no React adapter or renderer-specific entrypoint

#### Scenario: Media package tests

- GIVEN Media package behavior is covered by package-local tests
- WHEN test files are added
- THEN they live beside package source under `lib/media/src/`

### Requirement: Media Public Contract

The Media package public contract SHALL own image and document media asset,
transfer, ownership, access, and delivery shapes.

#### Scenario: Contract owns media shapes

- GIVEN code needs media asset, image or document upload, list, restore,
  delivery, ownership, access, storage key, metadata, or provider seam contracts
- WHEN it imports the documented contract
- THEN the declarations come from `lib/media/src/types.ts`

#### Scenario: Contract excludes runtime code

- GIVEN `lib/media/src/types.ts` is imported
- WHEN the import is evaluated
- THEN it does not import client, React, Worker, provider, storage, or app
  runtime code

### Requirement: Media Runtime-Neutral Helpers

The Media package root SHALL expose runtime-neutral pure media helpers and
public type re-exports.

#### Scenario: Pure media helpers

- GIVEN code validates media content types, file extensions, storage keys, asset
  ids, metadata invariants, or delivery href facts
- WHEN it needs reusable Media package behavior
- THEN it can import pure helpers from the Media package root

#### Scenario: Root stays runtime-neutral

- GIVEN code imports the Media package root
- WHEN the import is evaluated
- THEN the import does not include fetch, FormData, File, Image, React, Worker
  request handling, R2, or Cloudflare-specific dependencies

### Requirement: Media Client Adapter

The Media client adapter SHALL own browser/client HTTP behavior for image and
document media.

#### Scenario: Client uploads and lists images

- GIVEN browser code uploads an image file or lists core image media assets
- WHEN it needs the HTTP adapter
- THEN it imports the adapter from the Media client subpath
- AND the adapter returns the public upload and asset option shapes

#### Scenario: Client uses app-scoped documents

- GIVEN browser code lists, uploads, opens, or downloads a document for an
  installed app
- WHEN it needs the HTTP adapter
- THEN it imports the adapter from the Media client subpath
- AND the caller supplies the target installed-app media route and
  schema-resolved field identity
- AND the adapter does not accept caller-invented access, MIME, size, or owner
  policy as authoritative

#### Scenario: Client adapter has no React dependency

- GIVEN the Media client adapter is imported
- WHEN the import is evaluated
- THEN it does not import React or generated UI modules

### Requirement: Media Worker Adapter

The Media Worker adapter SHALL own Worker/runtime media request handling and
provider store adapters.

#### Scenario: Worker handles core media routes

- GIVEN a Worker handles upload, list, restore, `GET`, or `HEAD` requests for
  `/api/formless/media`
- WHEN it handles core media
- THEN it uses the Media Worker adapter through the public package subpath

#### Scenario: Worker handles app-scoped document routes

- GIVEN a Worker handles document upload, list, restore, `GET`, or `HEAD`
  requests under an installed-app API prefix
- WHEN it delegates reusable document parsing, validation, metadata, storage,
  listing, or delivery behavior
- THEN it uses the Media Worker adapter through the public package subpath
- AND Formless runtime supplies trusted owner, field policy, authorization
  result, and target route facts
- AND the Media package does not read App schemas, principals, roles, sessions,
  Authority records, or route registries directly

#### Scenario: Provider seam stays outside app records

- GIVEN a provider adapter stores or reads media objects
- WHEN it handles provider storage keys or provider-specific object facts
- THEN those facts stay in Media-owned metadata and provider adapters
- AND app records do not store provider-specific URLs

### Requirement: Media Renderer Boundary

The Media package SHALL keep media contracts, pure helpers, client adapters, and
Worker adapters renderer-independent and SHALL NOT expose a React adapter.

#### Scenario: Media presentation stays with the selected renderer

- GIVEN generated authoring needs media asset selection, image upload or
  preview, document upload or file actions, or broken-asset display
- WHEN the selected renderer renders media-specific controls
- THEN generated UI passes selected asset state, media asset options, preview
  hrefs, display-safe labels, missing selected asset facts, upload availability,
  removal availability, and file-select intent availability through the
  Formless UI field contract
- AND the renderer consumes those facts and dispatches canonical field intents
  without importing renderer code from the Media package
- AND asset-backed Media behavior does not introduce an Image field kind or URL
  authoring mode

#### Scenario: Document presentation stays with the selected renderer

- GIVEN a document-backed Media field is rendered
- WHEN the field offers choose, upload, open, download, replace, or remove
- THEN generated UI projects compatible document options, selected document
  facts, filename, MIME type, byte size, access-safe delivery intents, upload
  constraints, pending state, and file intents through the renderer-neutral
  field contract
- AND the selected renderer presents file-oriented controls without importing
  Media runtime or provider code
- AND the Media package exposes no React document editor

#### Scenario: Generic layout stays outside Media

- GIVEN a generated form, table, list, tree, dialog, or field commit surface
  renders
- WHEN generic layout or commit behavior is needed
- THEN that behavior remains outside the Media package

#### Scenario: Renderer code stays outside Media

- GIVEN new generated UI renderer controls are added for media fields
- WHEN the controls need picker, upload, preview, or broken-asset presentation
- THEN the controls consume renderer-neutral media facts and intent callbacks
- AND the Media package does not import generic UI primitives, generated UI
  modules, renderer packages, styling frameworks, or React component libraries

### Requirement: Media Ownership Exclusions

The Media package SHALL NOT own app schema parsing, app records, generic
generated form layout, generic UI primitives, or Site usage metadata.

#### Scenario: Site usage metadata remains Site data

- GIVEN Site records store image usage facts such as label, alt text, caption,
  crop, slot, focal point, poster override, width, or height
- WHEN the records are stored or rendered
- THEN those facts remain flat Site record values outside the Media package

#### Scenario: Schema parsing remains shared runtime behavior

- GIVEN app schema field editors or record values are parsed
- WHEN parsing runs
- THEN parsing remains outside the Media package

#### Scenario: App authorization remains runtime behavior

- GIVEN app-scoped document list, upload, restore, or delivery requires an
  authorization decision
- WHEN the route is handled
- THEN current app-install role, owner, session, public access, and target facts
  are resolved by Formless runtime
- AND the Media package consumes an explicit decision without owning instance
  auth policy

### Requirement: Media Behavior Preservation

The Media extraction SHALL preserve existing user-visible media behavior.

#### Scenario: Current image flows continue

- GIVEN a user uploads, lists, restores, selects, previews, or renders an
  existing core image media asset
- WHEN the media flow runs
- THEN the behavior matches the pre-extraction behavior

#### Scenario: Existing app records remain flat

- GIVEN an app references owned image or document media
- WHEN the app stores media usage
- THEN the app stores flat media asset ids or usage fields
- AND provider-specific storage details remain outside app records
