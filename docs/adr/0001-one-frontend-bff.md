# ADR 0001 — One frontend, as a backend-for-frontend

**Status:** accepted · **Date:** 2026-09-04

## Context

Four frontends existed: a Vite login portal, PairPath on Next.js 14, Study
Guider on Vite + React 19, and Gamification on Vite + React 18. Three React
versions, two bundlers, four git repositories.

Shared code was kept in step by copying. `sync-codeguru-auth.sh` and
`sync-codeguru-shared.sh` push `codeguru-auth.js`, `codeguru-theme.css` and
`CodeGuruBar` from a master copy into three sibling checkouts by relative path,
verified by `diff` and `md5sum`. PairPath's `CodeGuruBar.tsx` is deliberately
skipped and hand-transcribed, because copying JavaScript over TypeScript breaks
its build.

Because the four UIs sit on four origins, cross-origin SSO machinery exists that
would otherwise not be needed at all: URL-fragment token handoff, a
`VITE_ALLOWED_REDIRECTS` allow-list whose sole job is to stop the portal being
an open redirect, a `/go` service registry, three localhost-only `/dev-login`
pages behind a two-condition gate, CORS allow-lists on four backends, and a Vite
dev proxy. Access tokens live in `localStorage`, readable by any XSS.

## Decision

One Next.js application, in a new repository, acting as a
backend-for-frontend. The browser never holds a token or learns a backend URL.
Route handlers keep the session in an httpOnly, Secure, SameSite=Lax cookie
encrypted as a JWE, and attach the bearer token server-side.

## Alternatives rejected

**Keep four SPAs, extract the shared code into a published npm package.** Fixes
the copy-script problem and nothing else. The fragment handoff, the allow-list,
the CORS lists and the `localStorage` exposure all exist because of the origin
split, and all survive. It also adds a publish step to every shared change.

**One SPA, tokens still in `localStorage`, browser calls backends directly.**
Much less work, and Socket.IO stays trivial. But it keeps the XSS exposure and
still needs CORS allow-lists on all four backends, so two of the three problems
remain.

**A monorepo containing all four services.** Best for shared code and CI, but it
forces three teammates to move repositories mid-project. The cost is political
and practical, not technical.

## Consequences

Ten mechanisms collapse into one. CORS becomes structurally impossible for
browser traffic, because every request is same-origin.

The costs are real:

- **A new deployable on the request path.** Every browser request now traverses
  the Next.js server. It is one more thing to run and one more place to fail.
- **Socket.IO needs an exception.** Next.js route handlers cannot proxy a
  WebSocket upgrade, so the browser connects directly to PairPath over a second
  ALB rule, holding a short-lived token in memory that is never persisted.
- **Refresh must be centralised.** Code Coach rotates refresh tokens, so two
  concurrent proxied requests both refreshing would invalidate each other.
  Refresh happens in middleware, once, ahead of fan-out.
- **Three teammates delete their frontends.** Their repositories become
  backend-only and their UI code moves here.
