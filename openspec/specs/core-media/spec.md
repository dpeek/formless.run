# Core Media Specification

## Purpose

Core media stores first-party image and document assets for a Formless instance
outside app record storage. App records keep flat usage metadata and reference
core media asset ids; delivery hrefs are resolved from those asset ids and the
active app target.

## Requirements

### Requirement: Core Image Media Assets

The system SHALL model owned image media as core media assets with immutable
provider storage keys.

#### Scenario: Image asset metadata

- GIVEN an image upload is accepted
- WHEN the asset metadata is stored
- THEN the asset has an id, kind, label, filename, content type, byte size,
  status, provider, storage key, and optional dimensions
- AND the provider object key lives under `media/images/`

#### Scenario: Core media stays outside app records

- GIVEN an app uses an owned image
- WHEN the app stores usage data
- THEN app records store flat fields such as media asset id, alt text, caption,
  crop, focal point, slot, or poster override
- AND provider-specific storage details remain in core media metadata

### Requirement: App-Scoped Document Media Assets

The system SHALL model owned document media as immutable core media assets with
explicit app-install ownership and access policy.

#### Scenario: Document asset metadata

- GIVEN an app-scoped document upload is accepted
- WHEN the asset metadata is stored
- THEN the asset has an id, kind `document`, label, filename, normalized MIME
  type, byte size, access policy, owner app install id, status, provider, and
  immutable storage key
- AND the provider object key is partitioned by owner app install under an
  app-scoped document prefix
- AND app records store only the flat document asset id

### Requirement: Program Document Media Assets

The system SHALL model documents referenced by Program records as global
Program media without app-install ownership or package namespaces.

#### Scenario: Program document metadata

- GIVEN a Program document upload is accepted through one declared Program
  field
- WHEN the asset metadata is stored
- THEN it has an id, kind `document`, label, filename, normalized MIME type,
  byte size, access policy, status, provider, and immutable Program storage key
- AND it has no owner app install id or package-owned namespace
- AND Program records store only the flat document asset id

#### Scenario: Program document compatibility and access

- GIVEN a Program document field declares MIME, size, and public or private
  access policy
- WHEN an editor lists or uploads documents for that field
- THEN Program schema field policy supplies compatibility rather than request
  input, package identity, or media metadata
- AND Program route and role authorization controls non-public access
- AND public delivery is controlled only by the immutable stored public policy

#### Scenario: Program document API

- GIVEN generated Program authoring or a public Program operation needs a
  document
- WHEN it addresses a Program document asset
- THEN it uses `/api/formless/program/media/documents`
- AND it does not address an installed-app document route or reveal generic
  Program bootstrap, schema, snapshot, operation, sync, WebSocket, or replica
  access

#### Scenario: Public and private document policy

- GIVEN a document field declares access `public` or `private`
- WHEN a document is uploaded through that field policy
- THEN the resulting asset stores exactly that access policy
- AND access cannot be changed in place
- AND replacing a document creates a new immutable asset id and storage key
  before the app record reference changes

### Requirement: Media API

The system SHALL expose public instance image APIs under `/api/formless/media`
and app-scoped document APIs under the target installed-app API prefix.

#### Scenario: Upload image

- GIVEN a Program editor, administrator, protected owner, or existing trusted
  management channel posts one raster image file field named `file`
- WHEN the file is JPEG, PNG, WebP, or GIF and is at most 5 MB
- THEN `/api/formless/media/images` stores the media object and asset metadata
- AND the upload uses the `FORMLESS_MEDIA` R2 binding

#### Scenario: Read media

- GIVEN a core media object exists
- WHEN a client requests `/api/formless/media/*` with `GET` or `HEAD`
- THEN the object is returned without touching app Authority storage
- AND public media reads are allowed

#### Scenario: Upload and list app documents

- GIVEN a matching app administrator or instance owner targets an installed app
- WHEN generated authoring uploads or lists documents for one declared document
  field
- THEN the request uses
  `/api/app-installs/:packageAppKey/:installId/media/documents`
- AND the runtime resolves accepted MIME types, maximum byte size, and access
  policy from the target app's active schema rather than request-owned policy
- AND upload validates the normalized MIME type, PDF payload, and byte size
  server-side rather than trusting filename, browser `accept`, or multipart
  metadata alone
- AND the list includes only assets owned by that app install whose kind, MIME
  type, and access policy are compatible with the field
- AND another app administrator, an instance administrator without matching app
  authority, an ordinary authenticated principal, or an anonymous caller cannot
  list or upload those documents

#### Scenario: Deliver private app document

- GIVEN a private document asset belongs to one app install
- WHEN
  `/api/app-installs/:packageAppKey/:installId/media/documents/:assetId`
  receives `GET` or `HEAD`
- THEN the route and stored owner app install id must both match the target
  install
- AND delivery requires current matching `app.admin` authority or current
  `instance.owner` authority
- AND another app administrator cannot read the document or its metadata
- AND the response uses `Cache-Control: private, no-store`

#### Scenario: Deliver public app document

- GIVEN an immutable public document asset belongs to one app install
- WHEN a caller knows its opaque asset id and requests its matching app-scoped
  delivery route with `GET` or `HEAD`
- THEN delivery is available without an authenticated session
- AND the route does not provide an anonymous document listing or search API
- AND the owner app install encoded by the route must match stored asset
  metadata
- AND the stored asset metadata, not an app record or request parameter,
  controls whether anonymous delivery is allowed
- AND public document delivery uses
  `Cache-Control: public, max-age=31536000, immutable`

#### Scenario: Verification lookup reveals public document

- GIVEN an app exposes a bounded target-scoped public read that finds an issued
  COA by verification code
- WHEN the lookup returns that record's flat public document asset id
- THEN product-specific public UI can open the app-scoped public document
  delivery route
- AND document media does not expose verification records, verification codes,
  generic app queries, or private documents

#### Scenario: Open or download PDF

- GIVEN a stored document has normalized MIME type `application/pdf`
- WHEN its authorized or public delivery route returns the file
- THEN the response uses `Content-Type: application/pdf`,
  `X-Content-Type-Options: nosniff`, and a safe filename
- AND ordinary delivery uses `Content-Disposition: inline` so the PDF can open
  in a new browser tab
- AND a request with `download=1` uses `Content-Disposition: attachment`
- AND `HEAD` returns the same delivery headers without a response body

### Requirement: Generated Media Authoring

The system SHALL let generated UI use core media assets through text-backed
field editors.

#### Scenario: Media editor field

- GIVEN a text field declares the `media` editor
- WHEN generated authoring renders the field
- THEN the user can browse and select existing core image media assets by
  display-safe label or upload a new image through `/api/formless/media/images`
- AND generated authoring provides thumbnail preview and optional removal
- AND the field value remains a flat media asset id stored as text
- AND media authoring has no raw image URL mode

#### Scenario: Document media editor field

- GIVEN a text field declares the `media` editor and document asset policy
- WHEN generated authoring renders the field
- THEN the user can choose a compatible document owned by the current app
  install, upload one, open or download the selected file, replace it, or remove
  the optional selection
- AND replacement uploads a new immutable document before committing its asset
  id
- AND removal clears the app record field without deleting a possibly shared
  media object
- AND the field value remains a flat document asset id stored as text
- AND generated authoring has no provider key or raw document URL mode

### Requirement: Site Media Usage

The Site domain SHALL render instance-owned images through core media delivery
while keeping Site usage metadata in flat Site records.

#### Scenario: Site image block

- GIVEN an image block references a valid core media asset id
- WHEN the public Site tree and renderer process the block
- THEN public rendering uses the resolved core media delivery href
- AND image rendering does not use a manual `href` fallback
- AND a Program-native Site does not derive image ownership, storage key, or
  delivery route from an app install id

#### Scenario: Site media fields

- GIVEN Site image authoring edits an image block
- WHEN the generated create, edit, tree, or table surface renders
- THEN `mediaAssetId` is available through the `media` editor as the core media
  field
- AND the shared block `href` field is not exposed for the image variant
- AND `width` and `height` remain optional flat fields that can be populated
  from upload metadata

### Requirement: Media In Archives And Source Files

The system SHALL move owned media through explicit core media files and archive
capabilities.

#### Scenario: Archive includes media

- GIVEN a portable app or instance archive references owned core image or
  document media
- WHEN the archive is exported
- THEN the archive declares the `core-media-assets` capability
- AND referenced media files are included at manifest archive paths
- AND Program-native Site image media is represented in the instance archive's
  Program media manifest rather than an installed Site app archive
- AND document metadata preserves filename, MIME type, byte size, access policy,
  and logical owner app install

#### Scenario: Restore media before records

- GIVEN archive restore or Site publish applies media-backed records
- WHEN the workflow mutates the target
- THEN core media objects are restored before Program or app records
- AND media object keys, content types, byte sizes, asset metadata, and files are
  validated before mutation
- AND app archive retargeting preserves document asset ids and access policy
  while recomputing owner app install, storage key, and delivery href for the
  target install

#### Scenario: Referenced upload participates in workspace auto-save

- GIVEN a local generated media editor uploads a core image and commits a
  Program or installed-app record reference to that image
- WHEN local workspace auto-save persists workspace source
- THEN the referenced media payload is written with workspace media state
- AND standalone uploaded media that is not referenced by active Program or
  installed-app records is not written as reviewable workspace source

#### Scenario: Private document workspace payload

- GIVEN an active app record references a private document
- WHEN workspace source or a portable archive is written through an authorized
  workflow
- THEN the document metadata and payload participate in the same referenced
  media flow as public documents and images
- AND runtime private access policy does not encrypt, redact, or make a
  reviewable workspace or archive payload safe for a public repository
