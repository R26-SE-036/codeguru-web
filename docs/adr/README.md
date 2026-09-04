# Architecture Decision Records

One file per decision that would otherwise have to be re-argued. Each records
what was chosen, what was rejected, and what the choice costs — the rejected
options matter as much as the accepted one, because "why not X" is the question
a reviewer actually asks.

| # | Decision | Status |
|---|---|---|
| [0001](0001-one-frontend-bff.md) | One frontend, as a backend-for-frontend | accepted, not built |
| [0002](0002-code-coach-remains-identity-provider.md) | Code Coach stays the identity provider, verified by introspection | accepted, in place |
| [0003](0003-database-per-service.md) | A database per service, chosen on data shape | accepted; Firestore migration pending |
| [0004](0004-aws-ecs-alb.md) | AWS ECS Fargate behind a single ALB | accepted, not built |
| [0005](0005-code-execution-isolation.md) | Student code runs in a Lambda, not a Docker socket | accepted, implemented |
| [0006](0006-ml-services-stay-separate.md) | The two ML services stay separate deployables | accepted, in place |
| [0007](0007-async-events.md) | EventBridge for inter-service events, REST polling until then | accepted, not implemented |
| [0008](0008-concept-vocabulary-and-derived-prerequisites.md) | One concept vocabulary, prerequisites derived not asserted | accepted; derivation blocked on data |

## Conventions

- **Status is honest.** "Accepted" means the decision is made, not that the code
  exists. Where they differ, the ADR says so.
- **Superseding, not editing.** A decision that changes gets a new ADR that
  supersedes the old one; the old one stays, so the reasoning at the time
  survives.
- ADR 0004 already carries a note of this kind: the code-runner constraint that
  decided AWS over Cloud Run was removed by ADR 0005, which makes that a closer
  call than it was.
