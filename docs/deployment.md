# Deployment

> **Status:** not deployed. This is the target topology and the order to build
> it in, written from the constraints the code actually imposes rather than from
> a template.

See [ADR 0004](adr/0004-aws-ecs-alb.md) for why AWS and why one load balancer,
and [ADR 0005](adr/0005-code-execution-isolation.md) for why code execution is a
Lambda.

## Services

| Service | Port | Public | Image |
|---|---|---|---|
| `codeguru-web` | 3000 | via `/*` | this repo **[not built]** |
| `code-coach-api` | 8080 | via `/api/v1/*` | `code-coach/Dockerfile` |
| `study-guider-api` | 8010 | no | `Study-Guider/backend/Dockerfile` |
| `pairpath-api` | 3001 | `/pair-ws/*` only | `Pair_Path/api/Dockerfile` |
| `gamification-api` | 3002 | no | `adaptive-gamification-engine/backend/Dockerfile` |
| `pairpath-ml` | 8020 | no | `Pair_Path/ml-service/Dockerfile` |
| `gamification-ml` | 5000 | no | `adaptive-gamification-engine/ml-service/Dockerfile` |
| `codeguru-code-runner` | — | no | `Pair_Path/code-runner-lambda/` (Lambda) |

**No image has been built.** Docker was not running on the machine where the
Dockerfiles were written, so treat every first build as unverified.

## Load balancer

Three listener rules, in priority order. Order matters: `/api/v1/*` must be
evaluated before `/*`.

```
1.  /api/v1/*    → code-coach-api      (the VS Code extension; the published contract)
2.  /pair-ws/*   → pairpath-api        (WebSocket upgrade + stickiness)
3.  /*           → codeguru-web
```

Everything else is private and reached over ECS Service Connect
(`http://study-guider.codeguru.local:8010` and so on). No other service gets a
target group.

Two things this buys without extra work: Code Coach's unauthenticated
`POST /analyze` and `POST /debug-ast` live at the **root**, so rule 1 does not
expose them; and no browser makes a cross-origin request, so the CORS
allow-lists on all four backends can be emptied.

## Secrets

AWS Secrets Manager, referenced by ARN in the task definition `secrets:` block —
never as plaintext environment values.

| Secret | Used by |
|---|---|
| `JWT_SECRET` | pairpath-api — its own tokens, not shared with Code Coach |
| `SESSION_ENCRYPTION_KEY` | codeguru-web — seals the session cookie |
| `MONGODB_URI` × 2 | code-coach-api, gamification-api (separate clusters) |
| `DATABASE_URL` | pairpath-api |
| `NEO4J_PASSWORD` | study-guider-api |
| `GEMINI_API_KEY`, `OPENROUTER_API_KEY` | study-guider-api |
| `RETRAIN_SECRET` | gamification-ml |

Rotate before first deploy: Gamification's Atlas credential and Code Coach's
Firebase service-account key have both existed in plaintext in local `.env`
files.

## Order of work

1. **Build and push images to ECR**, one repository per service. Nothing below
   can be verified until this works.
2. **Data stores.** RDS PostgreSQL and ElastiCache Redis in private subnets;
   Neo4j AuraDB and both Atlas clusters already exist and need their network
   access lists updated.
3. **Run migrations once**, as a one-off ECS task inside the VPC — not from a
   starting service. `prisma migrate deploy` needs the direct database URL, not
   the pooled one, because a transaction-mode pooler cannot hold the advisory
   locks it takes; and N tasks starting at once would race for the same lock.
4. **The code-runner Lambda**, and the API task role granted
   `lambda:InvokeFunction` on that function alone.
5. **Services, private first.** Bring up the two ML services and the three
   private APIs, and verify Service Connect resolves between them before
   anything is public.
6. **Load balancer and the three rules.**
7. **Flip Code Coach's storage last** — see below.
8. **Index the syllabus corpus**: `python -m app.dev_tools.index_knowledge_base`
   in study-guider-api. Idempotent, and needed once per deploy only if the
   source text changed.
9. **Point the VS Code extension** at the deployed host via its two settings,
   `codeCoach.backendUrl` and `codeCoach.portalUrl`. No extension code changes.

## Code Coach: Firestore → MongoDB Atlas

The only application-level migration, and it is configuration plus data:

1. Swap `google-cloud-firestore` for `pymongo` in `backend/requirements-prod.txt`.
2. Run the export/import against the new cluster.
3. Unset `FIREBASE_CREDENTIALS_PATH` and `FIREBASE_PROJECT_ID`; set
   `MONGODB_URI` and `MONGODB_DB_NAME=code-guru`.
4. Confirm the startup line reads `Storage backend: MongoDB`. If it reads
   `in-memory`, **stop** — every account and session is being written to a
   process that will lose them, and the failure is silent until a restart.

`build_storage()` prefers Firestore whenever either Firebase variable is set, so
leaving one behind silently keeps the old store.

## Things that will bite

- **Socket.IO needs WebSocket upgrades passed through.** A proxy that buffers or
  strips them downgrades silently to polling, and pairing feels broken rather
  than failing loudly. Enable stickiness on the `pairpath-api` target group.
- **Redis is not optional behind more than one task.** Intervention cooldowns
  fall back to a per-process map, so each task keeps its own and a student gets
  the same nudge once per task. The API warns at startup when `REDIS_URL` is
  unset.
- **Both ML services have no authentication and permissive CORS by design.**
  They are only safe behind their own API. Private subnets, security groups
  admitting one source each.
- **The code-runner Lambda must have no egress.** Outside a VPC it has full
  internet access by default; a private subnet with no NAT gateway is what
  replaces `--network none`.
- **`prisma migrate deploy` from a laptop will not reach RDS** in a private
  subnet. Run it as a task, or through a bastion.
- **Cold starts are real.** The first request after an idle period pays one.
  Do not set aggressive client timeouts — the integration contract already says
  so.

## Cost

Roughly, before free-tier credits: the ALB is ~$16–25/month whether used or not,
RDS `db.t4g.micro` ~$15–30, ElastiCache Serverless usage-based, seven Fargate
tasks at whatever they are sized to, and Lambda per invocation. Neo4j AuraDB and
MongoDB Atlas have free tiers adequate for this.

The ALB is the one always-on cost and the main argument for revisiting Cloud
Run — see [ADR 0004](adr/0004-aws-ecs-alb.md).
