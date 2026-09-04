# ADR 0005 — Student code runs in a Lambda, not a Docker socket

**Status:** accepted · **Date:** 2026-09-04

## Context

PairPath lets a student run their Java. It did this by shelling out from inside
the API process:

```
docker run --rm --network none --memory 256m --cpus 0.5 --pids-limit 64 \
  --security-opt no-new-privileges -v "<tmp>:/work:ro" -w /work \
  eclipse-temurin:17-jdk-alpine java -Xmx128m Main
```

The flags are careful. The problem is structural: **no serverless container
platform gives a container a Docker daemon** — not ECS Fargate, not Cloud Run.
So this cannot be the production path, and the workaround is to mount the host's
`/var/run/docker.sock` into the API container. Access to that socket is
equivalent to root on the host.

PairPath's own `docs/deployment.md` already names the consequence: with the
unsandboxed override set, student code executes "with the API's permissions,
including read access to `.env` and its database credentials".

## Decision

Move execution into an AWS Lambda container image carrying Corretto 17. The API
invokes it and returns the result unchanged.

Selection is by `CODE_RUNNER_LAMBDA_FUNCTION`. Lambda wins whenever it is set,
so a deployed environment that happens to have a Docker socket cannot silently
prefer it. The Docker and unsandboxed-host paths remain for local development.

## Alternatives rejected

**A separate `code-runner` service on an ECS EC2 capacity provider**, mounting
the Docker socket, reachable only from the API's security group. Keeps the
existing `docker run` code. Rejected because it still means a container with
effective host root, plus an EC2 instance to patch — and it would have been the
only EC2 in the architecture.

**Run the whole PairPath API on EC2 with the socket mounted.** Zero code change
and the fastest route to a deployment. Rejected because it is precisely the
arrangement their deployment notes warn against.

**`ecs:RunTask` per submission.** Clean isolation, but a Fargate task takes
10–20 seconds to start. A student pressing Run will not wait.

## Consequences

This is a **stronger** boundary than the container it replaces, not a weaker
one. Each invocation is a Firecracker microVM with its own kernel, destroyed
afterwards, so isolation no longer depends on the API process getting its
`docker run` flags right. It also removes the last reason to run EC2 anywhere in
this architecture, which is what makes [ADR 0004](0004-aws-ecs-alb.md) an
all-Fargate deployment.

Things that must be true at deploy time, and are easy to get wrong:

- **Attach the function to a private subnet with no NAT gateway.** A Lambda
  outside a VPC has full internet egress by default. This is what replaces
  `--network none`.
- **Set the function timeout above compile + run** (20s + 10s), or Lambda kills
  the invocation before the handler can return a readable compile error.
- **Memory is the CPU dial**; 1024 MB is roughly one vCPU.
- **Grant the API task role `lambda:InvokeFunction` on this function only.**

`FunctionError` is checked explicitly, because a Lambda that throws still
returns HTTP 200 — without that check a crashed function reads as a successful
run whose output happens to be a stack trace.

The cost is a cold start of roughly 1–3 seconds after a quiet period, against a
container start of similar order.

Verified against a local JDK across six cases: a working program, a compile
error, an uncaught exception, an infinite loop hitting the timeout, a class name
carrying shell metacharacters, and a malformed request.
