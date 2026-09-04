# ADR 0004 — AWS ECS Fargate behind a single ALB

**Status:** accepted · **Date:** 2026-09-04

## Context

Nothing is deployed. Two Dockerfiles existed across four repositories, one CI
workflow that only runs tests, and the team shares Code Coach through a
`cloudflared` tunnel whose hostname changes on every restart — which is why
every service reads that URL from configuration.

A target had to be chosen before any of the deployment work could be specified.

## Decision

AWS. ECS Fargate for every service, behind one Application Load Balancer with
exactly three listener rules.

| Rule | Target | Why it is public |
|---|---|---|
| `/api/v1/*` | code-coach-api | The VS Code extension is not a browser and cannot go through the BFF. This is also the published integration contract. |
| `/pair-ws/*` | pairpath-api | Next.js route handlers cannot proxy a WebSocket upgrade. |
| `/*` | codeguru-web | Everything else. |

Everything else is private, reached over ECS Service Connect.

## Alternatives rejected

**Google Cloud Run.** Genuinely the cheaper and simpler option, and the one the
repository already pointed at: `code-coach/Dockerfile` names Cloud Run, the
architecture diagram specifies `asia-south1`, Code Coach uses Firestore, and
`inter-service-events.md` is written for Pub/Sub. Cloud Run scales to zero and
needs no always-on load balancer, where an ALB costs roughly $16–25/month
whether or not anyone uses it.

It was rejected on two counts. First, the routing story: a single ALB with
path-based rules is a materially clearer boundary to describe and to defend than
per-service Cloud Run URLs. Second, and decisively at the time, the code runner
needed a Docker daemon that no serverless container platform provides — which on
GCP meant a hand-managed Compute Engine VM or GKE.

That second reason has since weakened: [ADR 0005](0005-code-execution-isolation.md)
moved code execution to Lambda, and the equivalent on GCP would be Cloud Run
Jobs. **If this decision were revisited today, Cloud Run would be a closer
call**, and cost may yet justify revisiting it.

**ECS on EC2.** Would have allowed mounting the Docker socket for the code
runner. Rejected once Lambda removed the need — it meant an instance to patch,
and a container with effective host root.

**Kubernetes (EKS/GKE).** Far more operational surface than four services and a
frontend justify, and a control plane costs more than the whole rest of this
architecture.

## Consequences

Two useful properties fall out of the routing rules without extra work:

- Code Coach's unauthenticated `POST /analyze` and `POST /debug-ast` sit at the
  **root**, not under `/api/v1`, so the path rule leaves them unreachable from
  the internet with no code change. `/debug-ast` returns a full parse tree for
  arbitrary submitted source.
- Since no browser makes a cross-origin request, `CORS_ALLOWED_ORIGINS`,
  `CORS_ORIGINS` and `FRONTEND_URL` can be emptied in production on all four
  backends.

The costs: the ALB is always-on and billed accordingly, and Firestore would be a
cross-cloud call from AWS — which is a further argument for
[ADR 0003](0003-database-per-service.md)'s move to Atlas.

Secrets come from AWS Secrets Manager and are referenced by ARN in task
definitions, never as plaintext environment values.
