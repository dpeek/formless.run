# Contact Subscriptions Specification

## Purpose

Contact subscriptions model public subscribe intent as one flat Program-owned
domain for Site and CRM workflows.

## Requirements

### Requirement: Contact Subscription Records

The system SHALL model contacts, email addresses, audiences, and subscriptions
as flat records suitable for generated admin surfaces and CRM workflows.

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

#### Scenario: Site and CRM share subscriber records

- GIVEN a visitor submits through a Site subscribe block or CRM public flow
- WHEN the Program `subscription.subscribe` operation commits
- THEN contact, email-address, audience, and subscription records are written
  once in Program storage
- AND Site subscriber and CRM audience generated screens project the same
  records for their respective workflows
- AND no Site block targets a CRM install or a second Authority

### Requirement: Subscription Consent Source

The system SHALL preserve source context for public subscription consent.

#### Scenario: Source fields are written

- GIVEN a public subscribe operation commits a subscription
- WHEN the subscription is stored
- THEN the subscription records Program target identity, canonical operation
  key, request host, request path, and Site block id when available

#### Scenario: Raw visitor network data is not required

- GIVEN a public subscribe operation commits a subscription
- WHEN the subscription is stored
- THEN raw IP address and user-agent values are not required subscription fields

### Requirement: Subscription Admin Surface

The system SHALL expose collected email addresses and subscription state through generated admin screens.

#### Scenario: Owner reviews subscribers

- GIVEN a Program member opens a Site or CRM generated screen that presents
  contact subscription data
- WHEN the owner opens the generated admin screens
- THEN the member can inspect email addresses, audiences, subscription status,
  consent time, and source context according to the screen presentation
- AND public renderers do not expose subscriber lists
