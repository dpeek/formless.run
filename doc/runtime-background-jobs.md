# Runtime Background Jobs

Last updated: 2026-06-26

Purpose: architecture proposal for Cloudflare Queue-backed runtime background
jobs, with email delivery as the first concrete use case.

This is not shipped behavior. Shipped behavior lives in
`openspec/specs/*/spec.md`.

## Problem

Public operations can commit app records and then trigger email notifications.
Today the email runtime creates an instance email delivery row and waits for the
Cloudflare Email Sending binding before returning. That keeps provider latency
and provider failure handling inside the operation response path.

The runtime needs a common background job contract before adding more side
effects. Email delivery should be the first job because it is already modeled as
platform-owned durable state outside the target app storage identity.

## Cloudflare Queue Facts

Cloudflare Queues are a Worker-integrated message buffer. A Worker can produce
messages through a Queue binding and can consume messages through a `queue()`
handler.

Cloudflare documents Queues as at-least-once delivery. Messages can be delivered
more than once, ordering is not guaranteed, and consumers must be idempotent.

Queue messages are confirmed written when `send()` resolves. If `send()` is
hidden inside `waitUntil()`, send failures can be ignored by the request path,
so the producer should await the queue write unless a separate outbox recovery
path exists.

Each queue has one consumer Worker. Multiple producers can write to the same
queue. Multiple queues are useful when work has different processing needs,
batching, retry behavior, throughput, or operational ownership.

Consumer retries default to three attempts. A dead-letter queue can receive
messages after retries are exhausted. If one message in a batch fails, the whole
batch is retried unless the consumer explicitly acknowledges or retries messages
individually.

Cloudflare docs used:

- <https://developers.cloudflare.com/queues/reference/how-queues-works/>
- <https://developers.cloudflare.com/queues/reference/delivery-guarantees/>
- <https://developers.cloudflare.com/queues/configuration/configure-queues/>
- <https://developers.cloudflare.com/queues/configuration/batching-retries/>
- <https://developers.cloudflare.com/queues/configuration/dead-letter-queues/>
- <https://developers.cloudflare.com/queues/configuration/javascript-apis/>
- <https://developers.cloudflare.com/queues/configuration/local-development/>
- <https://developers.cloudflare.com/workers/best-practices/workers-best-practices/>

## Recommendation

Use a common job envelope and a small registry of runtime job topics. Do not use
one global queue for all background work, and do not create queues per app,
install, operation, or record.

Create queues per execution class when the work has a different retry,
concurrency, batching, latency, secret, or failure contract. Email delivery is
its own execution class.

First queue:

- topic: `email-delivery`
- producer binding: `FORMLESS_EMAIL_DELIVERY_QUEUE`
- queue name: `<instance-worker-name>-email-delivery`
- dead-letter queue: `<instance-worker-name>-email-delivery-dlq`
- consumer: the same deployed Formless Worker
- initial batch settings: small batch size, default retry count, DLQ enabled

Using the same Worker first keeps access to `FORMLESS_AUTHORITY`,
`FORMLESS_EMAIL`, Turnstile, R2, and runtime helpers in one deployment unit.
Split consumers into separate Workers only when isolation, permissions, or
independent scaling become necessary.

Keep Cloudflare Workflows out of the first change. Queues fit simple
single-step jobs such as sending email. Workflows should be considered later for
multi-step durable processes with pause/resume or step-specific retry needs.

## Job Envelope

Queue messages should be small pointers to durable runtime state.

```ts
type RuntimeJobEnvelope = {
  schemaVersion: 1;
  kind: "email.delivery.send";
  jobId: string;
  idempotencyKey: string;
  enqueuedAt: string;
  target: {
    authorityName: "__formless_instance__";
  };
  payload: {
    deliveryId: string;
  };
};
```

The queue is not the system of record. The instance Authority owns durable job
state, status, idempotency, and audit-friendly timestamps. The queue is a wakeup
signal.

This matters for email because Cloudflare Queue messages are too small for the
current rendered email body limits. The queue message should carry a delivery id,
not subject, text, or HTML.

## Batch And Broadcast Email

The first email queue is the leaf delivery primitive. It does not by itself
model future broadcast sending.

Broadcast sending should add a higher-level fan-out job when a selected domain
owns broadcast operations:

1. A `broadcast.send` operation validates intent and returns quickly after
   durable runtime handoff.
2. The domain snapshots the target audience or segment into flat `broadcast-recipient`
   records before enqueueing sends.
3. A broadcast dispatch job chunks pending recipients and enqueues one email
   delivery job per recipient.
4. The dispatch job may use Queue `sendBatch()` to enqueue delivery jobs in
   chunks, but provider delivery still sends one message per recipient.
5. Delivery status and events update `broadcast-recipient` or delivery-event
   records through idempotent record writes.

Broadcast dispatch should not put many recipients in one provider email. Per
recipient delivery preserves unsubscribe, suppression, personalization,
per-recipient status, and retry isolation.

Broadcast dispatch and email delivery should be separate execution classes once
broadcasts ship. Broadcast dispatch has different concurrency and backpressure
needs than contact-form notifications. It should either use its own queue or a
distinct queue topic with consumer settings selected for fan-out work. The
`email-delivery` queue remains the bounded provider-send attempt lane.

## Email Delivery Flow

Scheduling should change from "create row and send" to "create row and enqueue".

1. Post-commit notification code renders and validates the email schedule
   request.
2. The instance Authority resolves the configured sender and creates or reuses
   an `instance_email_deliveries` row by idempotency scope.
3. The Authority persists the rendered message body in internal delivery state.
   The public `EmailDeliveryRecord` does not need to expose message body fields.
4. The Authority enqueues an `email.delivery.send` job and awaits `send()` so the
   handoff is confirmed.
5. The operation response no longer waits for provider email delivery.
6. The queue consumer calls an internal Authority endpoint to perform one
   delivery attempt.
7. The Authority reads the delivery state, no-ops accepted deliveries, marks an
   attempt as sending, calls `FORMLESS_EMAIL.send()`, and marks accepted or
   failed.
8. Retryable failures ask the queue to retry. Permanent configuration failures
   mark the delivery failed and acknowledge the message.

The consumer should explicitly acknowledge or retry each message so one failed
email does not force redelivery of unrelated messages in the same batch.

Email idempotency remains based on storage identity, message kind, source
operation or record, and idempotency key. Queue delivery is at least once, so
duplicate queue messages must be safe. Accepted deliveries are terminal.

Exactly-once external email sends are not guaranteed. The runtime can prevent
duplicate scheduling and duplicate accepted rows. It cannot fully prevent a
provider duplicate if the provider accepts a message and the Worker fails before
recording acceptance, unless the provider exposes a supported idempotency key.

## Operation Response Path

The first implementation should still await the queue write. It should not await
the provider send.

That gives a durable handoff before returning without requiring a second
recovery mechanism. A later outbox sweeper could let operation code use
`waitUntil()` for scheduling, but only after pending durable rows can be
re-enqueued if the queue write fails.

Public operation notification failures should remain private side-effect
failures. The committed operation response should stay operation-native.

## Provisioning

Local development:

- Add queue producer and consumer config to `wrangler.jsonc`.
- Add `FORMLESS_EMAIL_DELIVERY_QUEUE` to the Worker env type.
- Use the Cloudflare Vite plugin and Wrangler local queue support through the
  existing dev path.

Instance deployment:

- Treat email delivery queue and DLQ as base runtime resources in
  `planFormlessInstanceDeployment`, like the Worker, Durable Object namespace,
  and media bucket.
- Create the queues through Alchemy `cloudflare.Queue`.
- Bind the producer queue to the Worker as `FORMLESS_EMAIL_DELIVERY_QUEUE`.
- Register the same Worker as queue consumer through Worker `eventSources`, with
  DLQ configured.
- Keep Cloudflare Email Sending domain and `send_email` binding resources in the
  existing deployment desired-state graph because those are control-plane email
  intent.

Future job topics can either become additional base runtime resources or
deployment graph resources. Use base runtime resources for infrastructure every
instance needs. Use desired-state resources only when the queue itself is
schema-owned or user-configured provider intent.

## Change Shape

Suggested Git-backed change:

1. Add a runtime background jobs capability spec or extend the closest runtime
   spec with queue-backed job facts.
2. Add the common job envelope, parser, enqueue helper, and queue handler router.
3. Persist rendered email messages in instance email delivery state.
4. Change email scheduling to enqueue `email.delivery.send`.
5. Add the queue consumer path that performs delivery attempts through the
   instance Authority.
6. Add local Wrangler queue config and Worker env types.
7. Add Alchemy queue and DLQ provisioning for instance deployment.
8. Cover duplicate delivery messages, provider failure retry, permanent config
   failure, and operation response not waiting for provider send.

Future broadcast change:

1. Add broadcast dispatch job state and queue topic or queue.
2. Snapshot recipients into flat domain records before dispatch.
3. Enqueue per-recipient email delivery jobs in bounded chunks.
4. Project recipient delivery status from delivery events without coupling
   broadcast operation responses to provider sends.

## Non-Goals

- No general workflow engine.
- No queue per domain, Program operation, or tenant.
- No provider email body in queue messages.
- No public exposure of notification delivery errors in operation responses.
- No broadcast fan-out in the first email delivery queue change.
- No DLQ repair UI in the first change.
