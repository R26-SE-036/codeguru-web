# ADR 0002 — Code Coach stays the identity provider, verified by introspection

**Status:** accepted · **Date:** 2026-09-04

## Context

One student account must work across a VS Code extension and three web
components. Code Coach already implements it: Argon2 password hashing, HS256
access tokens valid one hour, rotating refresh tokens, and server-side revocable
sessions.

Sibling services need to know whether a token they receive is valid.

## Decision

Keep Code Coach as the sole identity provider. Siblings verify by calling
`GET /api/v1/auth/me` with the student's own token, caching the result for 60
seconds.

## Alternatives rejected

**Share the HS256 signing secret so each service verifies locally.** This was
the original implementation and was removed. The comment left behind states the
reason exactly: *"a valid signature is not the same as a live session"* —
signing out revokes server-side, but a locally-verified token keeps working
until it expires. It also places the signing secret in four repositories, where
one leak compromises every service.

**Asymmetric signing (RS256) with a JWKS endpoint.** Siblings verify locally
with a public key, so no secret is shared and the introspection hop disappears.
This is the better long-term answer. Rejected for now because it does not solve
revocation either — a revoked session stays valid until expiry unless a
revocation list is also distributed — and because it means changing token
issuance in a backend that is otherwise frozen before the viva.

**Firebase Authentication.** Would centralise identity with no bespoke auth
code. `docs/firebase-setup.md` records this as considered and deferred:
replacing a working, well-built auth layer before the viva is risk without
functional gain. Deferring it again also avoids a hard dependency on a Google
service in an otherwise AWS deployment.

## Consequences

Forwarding the *student's* token rather than using a service account makes
authorisation free: every `me` endpoint resolves to the token's owner, so a
service cannot read another student's data even by accident. A bug that existed
before this rule — routes taking `student_id` from the request body, which let
anyone read anyone's progress by guessing an id — becomes unexpressible.

The 60-second cache is a deliberate trade: a signed-out token keeps working for
at most that long, in exchange for not paying a network round trip per request.

The failure mode that matters is distinguishing **rejected** from **could not
check**. A `401` from `/auth/me` means reject the caller. A timeout or
connection error means Code Coach is down, and the answer is `503`. Returning a
user in that case would turn an outage into an authentication bypass. All three
siblings implement this distinction.

PairPath is the documented exception: it exchanges a verified Code Coach token
for its own JWT, because its Socket.IO handshake verifies its own signature and
every foreign key points at a local `users.id`. Its `/auth/exchange` fails
closed with a `503` when Code Coach is unreachable, for the same reason.
