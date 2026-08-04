# Contact Subscriptions Specification

## Purpose

Contact subscriptions model public subscribe intent as reusable flat standard
library records selected into a Program and projected by downstream workflows.

## Requirements

### Requirement: Contact Subscription Records

The system SHALL model contacts, email addresses, audiences, and subscriptions
as flat records owned by the standard contact-subscription schema module.

#### Scenario: Flat contact subscription model

- GIVEN contact subscription records are stored
- WHEN records are read or written
- THEN contact, email address, audience, and subscription state are represented by normal flat entity records
- AND relationships are represented by reference fields rather than nested stored data

#### Scenario: Unique email address

- GIVEN an email address record is created or updated
- WHEN storage validates the record
- THEN the normalized email address is unique within Program storage identity

#### Scenario: Unique subscription membership

- GIVEN a subscription record is created or updated
- WHEN storage validates the record
- THEN the email address and audience pair is unique within Program storage identity

#### Scenario: Standard module owns the declarations

- GIVEN a Program selects the standard contact-subscription module
- WHEN its schema is composed with Site or another downstream workflow
- THEN `contact`, `email-address`, `audience`, and `subscription` each have one
  complete declaration owned by the standard module
- AND downstream packages contribute projections and workflows without
  redeclaring, merging, filtering, or enriching those entities

### Requirement: Default Audience

The system SHALL provide a default audience for public subscribe operations
before explicit audience targeting, topics, or segments exist.

#### Scenario: Subscribe without explicit audience

- GIVEN a subscribe operation is submitted without an explicit audience
- WHEN the operation commits subscription records
- THEN the operation writes or reuses the default audience in Program storage
- AND the subscription references that audience

### Requirement: Subscribe Operation

The system SHALL provide a public subscribe operation that upserts reusable contact subscription records from a visitor email address.

#### Scenario: New email subscribes

- GIVEN a visitor submits a valid email address through the subscribe operation
- WHEN the operation commits records
- THEN the runtime creates or reuses a contact record
- AND creates or reuses an email address record with a normalized address
- AND creates or updates a subscription record with status `subscribed`

#### Scenario: Duplicate email subscribes again

- GIVEN a visitor submits an email address that already has a subscription for the target audience
- WHEN the subscribe operation commits records
- THEN the runtime keeps one email address record and one subscription record for that email-address audience pair
- AND the operation returns a successful subscribed outcome

#### Scenario: Resubscribe after unsubscribe state

- GIVEN a visitor submits an email address whose subscription status is `unsubscribed`
- WHEN the subscribe operation commits records
- THEN the runtime updates the subscription status to `subscribed`
- AND records the new consent timestamp

#### Scenario: Site projects standard subscriber records

- GIVEN a visitor submits through a Site subscribe block bound to the selected
  standard subscribe operation
- WHEN the Program `subscription.subscribe` operation commits
- THEN contact, email-address, audience, and subscription records are written
  once in Program storage
- AND the optional Site subscriber presentation projects those standard records
- AND the Site block invokes the narrow Program public operation route

### Requirement: Subscription Operation Adapter

The system SHALL execute subscription upsert behavior through one explicitly
selected contact-subscription operation adapter.

#### Scenario: Select subscription execution at build time

- GIVEN a Program schema declares `subscription.subscribe`
- WHEN trusted Program composition is materialized and built
- THEN the composition explicitly supplies one
  `contact-subscription.subscribe` operation adapter
- AND missing or duplicate selection fails before request handling
- AND the operation or contact entity ids do not discover, activate, or
  authorize that adapter

#### Scenario: Omit subscription execution

- GIVEN a Program omits the contact-subscription declarations and operation
- WHEN its browser and Worker runtimes are built
- THEN the contact-subscription adapter is not required or bundled
- AND generic Program storage, replica, archive, media, and authorization
  behavior remains available for the selected schema

### Requirement: Subscription Consent Source

The system SHALL preserve source context for public subscription consent.

#### Scenario: Source fields are written

- GIVEN a public subscribe operation commits a subscription
- WHEN the subscription is stored
- THEN the subscription records source target kind `program`, schema key
  `formless-program`, API prefix `/api/formless/program`, canonical operation
  key, request host, request path, and Site block id when available
- AND the source context is consent audit data rather than generic Program
  access or an alternate authorization identity

#### Scenario: Raw visitor network data is not required

- GIVEN a public subscribe operation commits a subscription
- WHEN the subscription is stored
- THEN raw IP address and user-agent values are not required subscription fields

### Requirement: Subscription Admin Surface

The system SHALL allow selected downstream presentations to expose collected
email addresses and subscription state through generated admin screens.

#### Scenario: Owner reviews subscribers

- GIVEN a Program member opens a selected Site or downstream generated screen
  that presents contact subscription data
- WHEN the owner opens the generated admin screens
- THEN the member can inspect email addresses, audiences, subscription status,
  consent time, and source context according to the screen presentation
- AND public renderers do not expose subscriber lists
