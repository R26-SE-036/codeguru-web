# ADR 0003 — A database per service, chosen on data shape

**Status:** accepted · **Date:** 2026-09-04

## Context

Across four components the platform used Firestore, PostgreSQL, MongoDB (twice),
Neo4j, ChromaDB and Redis — seven stores. Some choices fit the data; some were
in place before anyone asked whether they did.

The principle worth defending is **fitness for purpose, not variety**. Polyglot
persistence is a justification, not a goal, and a reviewer is entitled to ask of
each store what shape of question it answers that the others answer badly.

## Decision

| Service | Store | Reasoning |
|---|---|---|
| Code Coach | MongoDB Atlas *(from Firestore)* | Firestore's design rule here is "at most one equality filter, sort in Python". Every `/students/me/*` and `/dashboard/me/*` endpoint carries a `sample_size` parameter to bound what it pulls into memory, and one commit is named "Stop the dashboard burning the Firestore read quota". Those endpoints are `GROUP BY` queries executed in application code. |
| PairPath | RDS PostgreSQL + ElastiCache Redis | 17 models with real foreign keys and cascades. Redis is required behind more than one instance. |
| Study Guider | Neo4j AuraDB | Concept prerequisite graph, student progress, and the syllabus vector index. |
| Gamification | MongoDB Atlas *(unchanged)* | `QuestionBank.correctAnswer` is polymorphic per game type — a number for BugHunt, an array for DragDrop, a string for CodeTrace — alongside variable-length `codeLines` and `hints`. Three collections, no cross-entity transactions. |

Dropped: PairPath's MongoDB, and Study Guider's ChromaDB.

## Alternatives rejected

**Keep Firestore.** It works, and it would be the only cross-cloud dependency in
an otherwise all-AWS deployment. Rejected because the workarounds it forces are
already visible in the code, and because `build_storage()` selects the backend
purely from environment variables — `MongoStorage` exposes an identical
31-method public API with a full index set, so the migration is one line in
`requirements-prod.txt` and no application code at all.

**Move Code Coach to PostgreSQL now.** This is the honest long-term answer:
users, sessions, diagnostics, mastery and triggers are a relational system of
record with cross-entity invariants. Rejected for now because it means writing a
~500-line `PostgresStorage` against the existing interface plus a data
migration, in a backend that is otherwise frozen. `build_storage()` is exactly
the seam that makes it a one-file addition later.

**Amazon DocumentDB instead of Atlas.** AWS-native and inside the VPC, but
roughly $60/month minimum with no free tier, and only partially MongoDB
compatible, so `MongoStorage`'s index set would need verifying against it.

**Keep PairPath's MongoDB.** Its analytics trail duplicated PostgreSQL: of
eleven methods, two were ever called — both write-only — and nothing read any of
it back. The one thing not duplicated, feature/prediction pairs kept for human
labelling, moved into `feature_windows` and `pair_state_predictions`: two Prisma
models that had existed since the initial migration and had never been written
to.

**Keep ChromaDB.** It persisted to a directory on local disk, which a container
destroys on every restart, and the directory was committed to git. Neo4j was
already a hard dependency, so moving the vectors there removed a store rather
than swapping one.

## Consequences

Seven stores become four plus one cache. Code Coach and Gamification share an
engine on separate clusters, which preserves per-service ownership — the
precedent is already stated in Gamification's own configuration: *"Each
microservice has its own — this Atlas cluster belongs to the gamification
engine, not to the team as a whole."*

Two follow-ons are **not yet done**: the Firestore migration is a configuration
change plus a one-off export/import, and PairPath's `RAGChunk.embedding` remains
`Json` rather than `vector` — deliberately, because that column belongs to a
table nothing reads or writes, and indexing it would make a dead path look live.
