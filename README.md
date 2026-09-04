# codeguru-web

The Code Guru platform's web tier, and the home of its architecture
documentation.

## What is here now

Documentation. The application is not built yet.

| | |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | How the four components fit together, with C4 context and container diagrams |
| [`docs/adr/`](docs/adr/) | Eight architecture decision records — what was chosen, what was rejected, what it costs |
| [`docs/deployment.md`](docs/deployment.md) | Target AWS topology and the order to build it in |

`code-coach/integration/README.md` and `API_CONTRACT.md` remain the normative
API contract between components. The documents here describe structure; that one
describes the wire.

## What goes here next

One Next.js 15 application replacing the four frontends that exist today — three
React SPAs on two bundlers across three React versions, plus a Vite login
portal, with shared code kept in step by shell scripts that copy files between
four git repositories.

It acts as a **backend-for-frontend**: the browser never holds a token or learns
a backend URL. See [ADR 0001](docs/adr/0001-one-frontend-bff.md).

```
codeguru-web/
  app/
    (public)/login, (public)/register
    (app)/            dashboard, coach, study, pair, play
    api/auth/         login, register, logout, session
    api/bff/[service]/[...path]/   the single proxy
    api/pair/socket-token/         Socket.IO's one exception
  lib/session.ts      JWE seal/unseal
  lib/upstream.ts     service → base URL, and which token to attach
  lib/vocabulary.ts   the game-type / difficulty translation table
  middleware.ts       auth gate + proactive refresh
```

Porting the three UIs is the bulk of the work. PairPath's is already Next.js 14
App Router and moves most directly; Gamification's four react-router routes map
one to one; Study Guider has no router at all — it switches on a `phase` state
variable — so its routes have to be invented.

## Status

| | |
|---|---|
| Component fixes across the four service repos | done |
| Architecture documentation | done |
| Unified frontend | not started |
| AWS deployment | not started |
