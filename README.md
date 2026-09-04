# codeguru-web

The Code Guru platform's web tier, and the home of its architecture
documentation.

## What is here now

One Next.js 15 application replacing the four frontends that existed before -
three React SPAs on two bundlers across three React versions, plus a Vite login
portal, with shared code kept in step by shell scripts that copied files between
four git repositories.

It is a **backend-for-frontend**: the browser holds no token and learns no
backend URL. See [ADR 0001](docs/adr/0001-one-frontend-bff.md).

```
app/
  (public)/login, (public)/register
  (app)/            dashboard
  (app)/coach       diagnostics and concept mastery
  (app)/study       triggers -> lesson -> quiz -> progress
  (app)/pair        session, live workspace, peer review, results
  (app)/play        recommendation, game, results
  api/auth/         login, register, logout, session
  api/bff/[service]/[...path]   the single proxy
  api/pair/socket-token         Socket.IO's one exception
lib/session.ts      JWE seal/unseal
lib/upstream.ts     service -> base URL, and which token to attach
lib/vocabulary.ts   the game-type / difficulty translation table
lib/theme.ts        design tokens resolved for SVG (Recharts, Mermaid)
lib/use-pair-socket.ts        the Socket.IO connection
middleware.ts       auth gate + proactive refresh
```

## Documentation

| | |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | How the four components fit together, with C4 context and container diagrams |
| [`docs/adr/`](docs/adr/) | Eight architecture decision records |
| [`docs/deployment.md`](docs/deployment.md) | Target AWS topology and the order to build it in |

`code-coach/integration/README.md` and `API_CONTRACT.md` remain the normative
API contract between components. The documents here describe structure; that
one describes the wire.

## Running it

```bash
cp .env.example .env.local
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"  # SESSION_ENCRYPTION_KEY
npm install && npm run dev            # http://localhost:4200
```

Code Coach must be running for anything to authenticate. The other three
backends degrade independently: a service that is down costs you its section,
not the app.

## Status

| | |
|---|---|
| Component fixes across the four service repos | done |
| Architecture documentation | done |
| Unified frontend | built; the three UIs are ported |
| PairPath ml-analytics, ml-sandbox, session-history | not ported - research/demo surfaces |
| AWS deployment | not started |
