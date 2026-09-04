# ADR 0007 — EventBridge for inter-service events, REST polling until then

**Status:** accepted, not implemented · **Date:** 2026-09-04

## Context

Code Coach detects facts the other components need: a struggle escalating into a
remediation trigger, a learning event being recorded. `integration/inter-service-events.md`
already designs this as publish/subscribe with two topics and a
transport-agnostic envelope:

```json
{
  "event_id": "evt_1f2a...",
  "event_version": 1,
  "occurred_at": "2026-07-12T10:22:41Z",
  "source": "code-coach",
  "type": "remediation.triggered",
  "data": { }
}
```

The contract's own reasoning for events over direct calls holds: with REST,
Code Coach would need to know Study Guider's URL, be deployed after it, handle
its downtime, and gain a call per new consumer.

That contract specifies Google Pub/Sub, because it was written when Cloud Run
was the target. [ADR 0004](0004-aws-ecs-alb.md) chose AWS.

**None of it is implemented.** Consumers poll the equivalent REST endpoints, and
the payload shapes are identical.

## Decision

When this is built, it is Amazon EventBridge: one bus, one rule per
`detail-type`, SQS queues as targets so each consumer polls at its own pace and
gets a dead-letter queue.

Until then, REST polling stays, and this is described as designed rather than
delivered.

## Alternatives rejected

**SNS with SQS subscriptions.** Maps more literally onto the two named topics
and is marginally simpler. EventBridge was preferred because content-based
rules mean a new consumer is a rule rather than a new topic, and because one bus
with two rules is a clearer thing to draw.

**Keep polling permanently.** Works at this scale, and it is what runs today.
Rejected as the target because every consumer must poll on an interval that is
either wasteful or laggy, and because the coupling the contract set out to avoid
returns the moment a fourth consumer appears.

**Google Pub/Sub as written.** Would mean a GCP dependency in an AWS
deployment, for a component that has none otherwise.

## Consequences

The envelope does not change, which is the point of it having been specified
transport-agnostically. `event_id` remains the deduplication key, delivery is
at-least-once, and handlers must be idempotent. Ordering is not guaranteed;
`occurred_at` is there for consumers that need sequence.

Because it is unimplemented, **the report should describe this as a designed
integration, not a working one**. Claiming an event-driven architecture that is
in fact synchronous polling is the kind of overstatement a viva finds quickly —
and the honest version is a better answer, because the contract exists, the
payloads match, and switching costs nothing.
